import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function public.current_app_role() returns text language sql as $$ select current_setting('app.test_role') $$;
    create function public.current_app_actor_name() returns text language sql as $$ select 'Test Sales'::text $$;
    set app.test_role = 'sale';
    create table public.app_dispatch_orders (id text primary key, amount_due numeric, order_status text, reconciliation_status text, payment_status text, updated_at timestamptz);
    create table public.app_payments (id text primary key, order_id text references app_dispatch_orders(id), amount numeric not null check(amount > 0), status text, paid_at timestamptz, method text, collector text, bank_account text, bank_name text, reference text, note text, updated_at timestamptz);
    create table public.app_audit_events (id text primary key, actor text, entity_type text, entity_id text, action text, reason text, created_at timestamptz, updated_at timestamptz);
    insert into app_dispatch_orders values ('order1', 1000000, 'pending_dispatch_review', 'open', 'unpaid', now()), ('order2', 1000000, 'pending_dispatch_review', 'open', 'unpaid', now());
  `);
  await db.exec(readFileSync(new URL("../../supabase/migrations/0040_sales_prepayment_edit.sql", import.meta.url), "utf8"));
}, 20000);
afterAll(async () => { await db?.close(); });

const save = (id: string, order: string, amount: number) => db.query(
  "select record_sales_prepayment($1, $2, $3, 'bank_transfer')", [id, order, amount]
);

it("creates, updates, retries and voids one advance without duplicating or changing accounting receipts", async () => {
  await save("advance", "order1", 300000);
  await save("advance", "order1", 500000);
  await save("advance", "order1", 500000);
  expect((await db.query("select count(*)::int as count from app_payments")).rows).toEqual([{ count: 1 }]);
  await db.exec("insert into app_payments(id, order_id, amount, status, reference) values ('receipt', 'order1', 200000, 'valid', 'Accounting receipt')");
  await save("advance", "order1", 800000);
  expect((await db.query("select payment_status from app_dispatch_orders where id='order1'")).rows).toEqual([{ payment_status: "paid" }]);
  await save("advance", "order1", 0);
  expect((await db.query("select status, amount::int from app_payments where id='advance'")).rows).toEqual([{ status: "voided", amount: 800000 }]);
  expect((await db.query("select payment_status from app_dispatch_orders where id='order1'")).rows).toEqual([{ payment_status: "partial" }]);
  expect((await db.query("select amount::int from app_payments where id='receipt'")).rows).toEqual([{ amount: 200000 }]);
});

it("rejects another order, an accounting receipt, negative amounts, closed orders and driver roles", async () => {
  await expect(save("advance", "order2", 1)).rejects.toThrow("not a sales prepayment");
  await expect(save("receipt", "order1", 1)).rejects.toThrow("not a sales prepayment");
  await expect(save("invalid", "order1", -1)).rejects.toThrow("invalid payment");
  await db.exec("update app_dispatch_orders set reconciliation_status='closed' where id='order2'");
  await expect(save("closed", "order2", 1)).rejects.toThrow("reconciled orders");
  await db.exec("set app.test_role='driver'");
  await expect(save("driver", "order1", 1)).rejects.toThrow("permission denied");
});
