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

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_dispatch_order'
  loop
    execute 'drop function if exists ' || fn.signature;
  end loop;
end $$;

create function public.update_dispatch_order(
  p_order_id text,
  p_order_date text,
  p_customer_kind text,
  p_customer_name text,
  p_customer_cccd text,
  p_customer_address text,
  p_customer_bank_account text,
  p_customer_bank_name text,
  p_contact_name text,
  p_contact_phone text,
  p_company_name text,
  p_tax_code text,
  p_billing_email text,
  p_company_address text,
  p_company_bank_account text,
  p_company_bank_name text,
  p_pickup text,
  p_dropoff text,
  p_service_code text,
  p_service_label text,
  p_service_clarification text,
  p_unit text,
  p_sales_owner text,
  p_source_owner_name text,
  p_source text,
  p_invoice_required boolean,
  p_vehicle_ownership text,
  p_vehicle_plate_no text,
  p_driver_full_name text,
  p_driver_cccd text,
  p_driver_phone text,
  p_supplier_owner_name text,
  p_supplier_cccd text,
  p_supplier_invoice_required boolean,
  p_supplier_company_name text,
  p_supplier_tax_code text,
  p_supplier_address text,
  p_supplier_phone text,
  p_supplier_total_with_vat numeric,
  p_supplier_bank_account text,
  p_supplier_bank_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_amount_due numeric,
  p_driver_cost numeric,
  p_vehicle_cost numeric,
  p_other_cost numeric,
  p_payment_method text,
  p_payer text,
  p_collection_account_owner text,
  p_collection_bank_account text,
  p_collection_bank_name text,
  p_quote_note text,
  p_priority text,
  p_sales_note text,
  p_active_assignment_id text default null,
  p_replacement_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.current_app_role() not in ('sale', 'dispatcher', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set order_date = nullif(p_order_date, ''),
      customer_kind = p_customer_kind,
      customer_name = p_customer_name,
      customer_cccd = nullif(p_customer_cccd, ''),
      customer_address = nullif(p_customer_address, ''),
      customer_bank_account = nullif(p_customer_bank_account, ''),
      customer_bank_name = nullif(p_customer_bank_name, ''),
      contact_name = nullif(p_contact_name, ''),
      contact_phone = p_contact_phone,
      company_name = nullif(p_company_name, ''),
      tax_code = nullif(p_tax_code, ''),
      billing_email = nullif(p_billing_email, ''),
      company_address = nullif(p_company_address, ''),
      company_bank_account = nullif(p_company_bank_account, ''),
      company_bank_name = nullif(p_company_bank_name, ''),
      pickup = p_pickup,
      dropoff = p_dropoff,
      service_code = nullif(p_service_code, ''),
      service_label = p_service_label,
      service_clarification = nullif(p_service_clarification, ''),
      unit = nullif(p_unit, ''),
      sales_owner = p_sales_owner,
      source_owner_name = nullif(p_source_owner_name, ''),
      source = p_source,
      invoice_required = p_invoice_required,
      vehicle_ownership = nullif(p_vehicle_ownership, ''),
      vehicle_plate_no = nullif(p_vehicle_plate_no, ''),
      driver_full_name = nullif(p_driver_full_name, ''),
      driver_cccd = nullif(p_driver_cccd, ''),
      driver_phone = nullif(p_driver_phone, ''),
      supplier_owner_name = nullif(p_supplier_owner_name, ''),
      supplier_cccd = nullif(p_supplier_cccd, ''),
      supplier_invoice_required = p_supplier_invoice_required,
      supplier_company_name = nullif(p_supplier_company_name, ''),
      supplier_tax_code = nullif(p_supplier_tax_code, ''),
      supplier_address = nullif(p_supplier_address, ''),
      supplier_phone = nullif(p_supplier_phone, ''),
      supplier_total_with_vat = nullif(p_supplier_total_with_vat, 0),
      supplier_bank_account = nullif(p_supplier_bank_account, ''),
      supplier_bank_name = nullif(p_supplier_bank_name, ''),
      start_at = p_start_at,
      end_at = p_end_at,
      amount_due = p_amount_due,
      driver_cost = nullif(p_driver_cost, 0),
      vehicle_cost = nullif(p_vehicle_cost, 0),
      other_cost = nullif(p_other_cost, 0),
      payment_method = nullif(p_payment_method, ''),
      payer = nullif(p_payer, ''),
      collection_account_owner = nullif(p_collection_account_owner, ''),
      collection_bank_account = nullif(p_collection_bank_account, ''),
      collection_bank_name = nullif(p_collection_bank_name, ''),
      quote_note = nullif(p_quote_note, ''),
      priority = nullif(p_priority, ''),
      sales_note = nullif(p_sales_note, ''),
      changed_near_start = case when start_at <> p_start_at or end_at <> p_end_at then true else changed_near_start end,
      updated_at = now()
  where id = p_order_id;

  if p_active_assignment_id is not null then
    update public.app_dispatch_assignments
    set start_at = p_start_at,
        end_at = p_end_at,
        replace_reason = p_replacement_reason,
        updated_at = now()
    where id = p_active_assignment_id;
  end if;

  insert into public.app_audit_events (
    id,
    actor,
    entity_type,
    entity_id,
    action,
    reason,
    created_at,
    updated_at
  ) values (
    gen_random_uuid()::text,
    'Dispatcher',
    'dispatch_order',
    p_order_id,
    'updated_order',
    coalesce(p_replacement_reason, 'Updated dispatch order details'),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.update_dispatch_order(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, text, text, text, text,
  text, text, text, boolean, text, text, text, text, numeric, text,
  text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text,
  text, text, text, text, text, text, text, text, text
) to authenticated;
