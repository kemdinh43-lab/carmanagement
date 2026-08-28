alter table if exists public.app_dispatch_orders
  add column if not exists order_date text,
  add column if not exists customer_cccd text,
  add column if not exists customer_address text,
  add column if not exists customer_bank_account text,
  add column if not exists customer_bank_name text,
  add column if not exists company_address text,
  add column if not exists company_bank_account text,
  add column if not exists company_bank_name text,
  add column if not exists service_code text,
  add column if not exists service_clarification text,
  add column if not exists unit text,
  add column if not exists source_owner_name text,
  add column if not exists invoice_required boolean,
  add column if not exists vehicle_ownership text,
  add column if not exists vehicle_plate_no text,
  add column if not exists driver_full_name text,
  add column if not exists driver_cccd text,
  add column if not exists driver_phone text,
  add column if not exists supplier_owner_name text,
  add column if not exists supplier_cccd text,
  add column if not exists supplier_invoice_required boolean,
  add column if not exists supplier_company_name text,
  add column if not exists supplier_tax_code text,
  add column if not exists supplier_address text,
  add column if not exists supplier_phone text,
  add column if not exists supplier_total_with_vat numeric(14,2),
  add column if not exists supplier_bank_account text,
  add column if not exists supplier_bank_name text,
  add column if not exists payment_method text,
  add column if not exists payer text,
  add column if not exists collection_account_owner text,
  add column if not exists collection_bank_account text,
  add column if not exists collection_bank_name text;

create or replace function public.submit_dispatch_order_proposal(
  p_order jsonb,
  p_actor text default 'Sale'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  order_id text := p_order->>'id';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if order_id is null or order_id = '' then
    raise exception 'order id is required';
  end if;

  insert into public.app_dispatch_orders (
    id, code, order_date, customer_kind, customer_name, customer_cccd,
    customer_address, customer_bank_account, customer_bank_name, company_name,
    company_address, company_bank_account, company_bank_name, contact_name,
    contact_phone, tax_code, billing_email, pickup, dropoff, service_code,
    service_label, service_clarification, unit, sales_owner, source_owner_name,
    source, invoice_required, vehicle_ownership, vehicle_plate_no,
    driver_full_name, driver_cccd, driver_phone, supplier_owner_name,
    supplier_cccd, supplier_invoice_required, supplier_company_name,
    supplier_tax_code, supplier_address, supplier_phone, supplier_total_with_vat,
    supplier_bank_account, supplier_bank_name, start_at, end_at, amount_due,
    driver_cost, vehicle_cost, other_cost, payment_method, payer,
    collection_account_owner, collection_bank_account, collection_bank_name,
    quote_note, quote_status, order_status, dispatch_status, payment_status,
    invoice_status, reconciliation_status, priority, sales_note, updated_at
  ) values (
    order_id,
    p_order->>'code',
    nullif(p_order->>'order_date', ''),
    p_order->>'customer_kind',
    p_order->>'customer_name',
    nullif(p_order->>'customer_cccd', ''),
    nullif(p_order->>'customer_address', ''),
    nullif(p_order->>'customer_bank_account', ''),
    nullif(p_order->>'customer_bank_name', ''),
    nullif(p_order->>'company_name', ''),
    nullif(p_order->>'company_address', ''),
    nullif(p_order->>'company_bank_account', ''),
    nullif(p_order->>'company_bank_name', ''),
    nullif(p_order->>'contact_name', ''),
    p_order->>'contact_phone',
    nullif(p_order->>'tax_code', ''),
    nullif(p_order->>'billing_email', ''),
    p_order->>'pickup',
    p_order->>'dropoff',
    nullif(p_order->>'service_code', ''),
    p_order->>'service_label',
    nullif(p_order->>'service_clarification', ''),
    nullif(p_order->>'unit', ''),
    p_order->>'sales_owner',
    nullif(p_order->>'source_owner_name', ''),
    p_order->>'source',
    nullif(p_order->>'invoice_required', '')::boolean,
    nullif(p_order->>'vehicle_ownership', ''),
    nullif(p_order->>'vehicle_plate_no', ''),
    nullif(p_order->>'driver_full_name', ''),
    nullif(p_order->>'driver_cccd', ''),
    nullif(p_order->>'driver_phone', ''),
    nullif(p_order->>'supplier_owner_name', ''),
    nullif(p_order->>'supplier_cccd', ''),
    nullif(p_order->>'supplier_invoice_required', '')::boolean,
    nullif(p_order->>'supplier_company_name', ''),
    nullif(p_order->>'supplier_tax_code', ''),
    nullif(p_order->>'supplier_address', ''),
    nullif(p_order->>'supplier_phone', ''),
    nullif(p_order->>'supplier_total_with_vat', '')::numeric,
    nullif(p_order->>'supplier_bank_account', ''),
    nullif(p_order->>'supplier_bank_name', ''),
    (p_order->>'start_at')::timestamptz,
    (p_order->>'end_at')::timestamptz,
    coalesce(nullif(p_order->>'amount_due', '')::numeric, 0),
    nullif(p_order->>'driver_cost', '')::numeric,
    nullif(p_order->>'vehicle_cost', '')::numeric,
    nullif(p_order->>'other_cost', '')::numeric,
    nullif(p_order->>'payment_method', ''),
    nullif(p_order->>'payer', ''),
    nullif(p_order->>'collection_account_owner', ''),
    nullif(p_order->>'collection_bank_account', ''),
    nullif(p_order->>'collection_bank_name', ''),
    nullif(p_order->>'quote_note', ''),
    coalesce(nullif(p_order->>'quote_status', ''), 'draft'),
    coalesce(nullif(p_order->>'order_status', ''), 'pending_dispatch_review'),
    coalesce(nullif(p_order->>'dispatch_status', ''), 'waiting_assignment'),
    coalesce(nullif(p_order->>'payment_status', ''), 'unpaid'),
    coalesce(nullif(p_order->>'invoice_status', ''), 'not_required'),
    coalesce(nullif(p_order->>'reconciliation_status', ''), 'open'),
    nullif(p_order->>'priority', ''),
    nullif(p_order->>'sales_note', ''),
    now()
  )
  on conflict (id) do update set
    code = excluded.code,
    order_date = excluded.order_date,
    customer_kind = excluded.customer_kind,
    customer_name = excluded.customer_name,
    contact_name = excluded.contact_name,
    contact_phone = excluded.contact_phone,
    pickup = excluded.pickup,
    dropoff = excluded.dropoff,
    service_label = excluded.service_label,
    sales_owner = excluded.sales_owner,
    source = excluded.source,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    amount_due = excluded.amount_due,
    quote_status = excluded.quote_status,
    order_status = excluded.order_status,
    dispatch_status = excluded.dispatch_status,
    payment_status = excluded.payment_status,
    invoice_status = excluded.invoice_status,
    reconciliation_status = excluded.reconciliation_status,
    priority = excluded.priority,
    sales_note = excluded.sales_note,
    updated_at = now();

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    coalesce(nullif(p_actor, ''), 'Sale'),
    'dispatch_order',
    order_id,
    case when coalesce(nullif(p_actor, ''), 'Sale') = 'Driver' then 'submitted_driver_proposal' else 'submitted_dispatch_proposal' end,
    'Submitted via backend RPC',
    now(),
    now()
  );

  return order_id;
end;
$$;

grant execute on function public.submit_dispatch_order_proposal(jsonb, text) to authenticated;
