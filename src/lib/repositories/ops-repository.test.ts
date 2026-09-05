import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { appDispatchOrderPersistenceColumns, appPaymentPersistenceColumns } from "./ops-repository";

const migrationSql = [
  "0001_core.sql",
  "0013_dispatch_order_detail_fields.sql",
  "0021_finance_schema_alignment.sql",
  "0022_driver_trip_reports.sql",
  "0023_external_trip_links.sql",
  "0029_customer_confirmation_final_order_fields.sql",
  "0033_payment_collection_accounts.sql",
  "0036_transport_order_code_fields.sql",
  "0037_driver_ack_and_assignment_profiles.sql",
  "0038_company_customer_and_vehicle_owner_pdf_alignment.sql",
  "0039_sales_prepayment.sql"
]
  .map((file) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"))
  .join("\n");

describe("Supabase app schema alignment", () => {
  it("keeps dispatch order persistence columns present in migrations", () => {
    for (const column of appDispatchOrderPersistenceColumns) {
      expect(migrationSql).toContain(column);
    }
  });

  it("keeps payment persistence columns present in migrations", () => {
    for (const column of appPaymentPersistenceColumns) {
      expect(migrationSql).toContain(column);
    }
  });
});
