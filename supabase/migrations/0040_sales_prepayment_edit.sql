create or replace function public.record_sales_prepayment(
  p_payment_id text, p_order_id text, p_amount numeric, p_method text,
  p_paid_at timestamptz default now(), p_collector text default null,
  p_bank_account text default null, p_bank_name text default null, p_note text default null
)
returns text language plpgsql security definer set search_path = public
as $$
declare
  target_order public.app_dispatch_orders%rowtype;
  previous_payment public.app_payments%rowtype;
  total_paid numeric;
begin
  if auth.uid() is null or public.current_app_role() not in ('sale', 'accountant', 'manager', 'admin') then
    raise exception 'permission denied: sales prepayment requires sale/accountant/manager/admin';
  end if;
  if nullif(trim(p_payment_id), '') is null or p_amount is null or p_amount < 0
    or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'invalid payment id or amount';
  end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception 'invalid payment method';
  end if;

  -- Serialize payment edits for an order before recomputing its balance.
  select * into target_order from public.app_dispatch_orders where id = p_order_id for update;
  if not found or target_order.order_status = 'cancelled' then
    raise exception 'dispatch order not found or cancelled';
  end if;
  if target_order.reconciliation_status in ('reconciled', 'closed') then
    raise exception 'reconciled orders cannot change sales prepayment';
  end if;
  select * into previous_payment from public.app_payments where id = p_payment_id for update;
  if found and (previous_payment.order_id <> p_order_id or previous_payment.reference is distinct from 'Tạm ứng trước chuyến') then
    raise exception 'payment is not a sales prepayment for this order';
  end if;
  if previous_payment.id is null and p_amount = 0 then return p_payment_id; end if;

  insert into public.app_payments (
    id, order_id, amount, status, paid_at, method, collector, bank_account, bank_name, reference, note, updated_at
  ) values (
    p_payment_id, p_order_id, case when p_amount = 0 then previous_payment.amount else p_amount end,
    case when p_amount = 0 then 'voided' else 'valid' end,
    coalesce(p_paid_at, now()), p_method, nullif(p_collector, ''), nullif(p_bank_account, ''),
    nullif(p_bank_name, ''), 'Tạm ứng trước chuyến', nullif(p_note, ''), now()
  ) on conflict (id) do update set
    amount = excluded.amount, status = excluded.status, method = excluded.method,
    collector = excluded.collector, bank_account = excluded.bank_account,
    bank_name = excluded.bank_name, note = excluded.note, updated_at = now()
  where app_payments.order_id = excluded.order_id
    and app_payments.reference = 'Tạm ứng trước chuyến';
  if not found then raise exception 'payment id belongs to another transaction'; end if;

  select coalesce(sum(amount), 0) into total_paid from public.app_payments
  where order_id = p_order_id and status = 'valid';
  update public.app_dispatch_orders set
    payment_status = case when total_paid <= 0 then 'unpaid'
      when total_paid >= amount_due then 'paid' else 'partial' end,
    updated_at = now()
  where id = p_order_id;
  insert into public.app_audit_events (id, actor, entity_type, entity_id, action, reason, created_at, updated_at)
  values (gen_random_uuid()::text, public.current_app_actor_name(), 'payment', p_payment_id,
    case when previous_payment.id is null then 'recorded_sales_prepayment' else 'updated_sales_prepayment' end,
    coalesce(previous_payment.amount, 0)::text || ' -> ' || p_amount::text || ' / ' || p_method, now(), now());
  return p_payment_id;
end;
$$;

revoke all on function public.record_sales_prepayment(text, text, numeric, text, timestamptz, text, text, text, text) from public;
grant execute on function public.record_sales_prepayment(text, text, numeric, text, timestamptz, text, text, text, text) to authenticated;
notify pgrst, 'reload schema';
