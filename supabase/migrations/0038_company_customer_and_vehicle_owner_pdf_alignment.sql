-- Align final dispatch export data with production meanings:
-- - customer_cccd stores the service user's CCCD for company customers too.
-- - supplier_owner_name/supplier_cccd store the personal vehicle owner.
-- - supplier_company_* stores the legal owner/provider/co-op.

update public.app_vehicles
set owner_name = null,
    owner_cccd = null,
    supplier_invoice_required = true,
    supplier_company_name = coalesce(nullif(supplier_company_name, ''), 'CÔNG TY TNHH ANGEL ONE TRAVEL'),
    supplier_tax_code = coalesce(nullif(supplier_tax_code, ''), '0402198423'),
    supplier_address = coalesce(nullif(supplier_address, ''), 'Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam'),
    supplier_phone = coalesce(nullif(supplier_phone, ''), '0978638227'),
    supplier_bank_account = coalesce(nullif(supplier_bank_account, ''), '282826999'),
    supplier_bank_name = coalesce(nullif(supplier_bank_name, ''), 'MB'),
    updated_at = now()
where ownership_type = 'company';

update public.app_vehicles
set supplier_invoice_required = true,
    updated_at = now()
where ownership_type in ('partner', 'rented');

update public.app_dispatch_orders
set supplier_owner_name = null,
    supplier_cccd = null,
    supplier_invoice_required = true,
    supplier_company_name = coalesce(nullif(supplier_company_name, ''), 'CÔNG TY TNHH ANGEL ONE TRAVEL'),
    supplier_tax_code = coalesce(nullif(supplier_tax_code, ''), '0402198423'),
    supplier_address = coalesce(nullif(supplier_address, ''), 'Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam'),
    supplier_phone = coalesce(nullif(supplier_phone, ''), '0978638227'),
    supplier_bank_account = coalesce(nullif(supplier_bank_account, ''), '282826999'),
    supplier_bank_name = coalesce(nullif(supplier_bank_name, ''), 'MB'),
    updated_at = now()
where vehicle_ownership = 'company'
  and upper(coalesce(supplier_owner_name, '')) like '%ANGEL ONE TRAVEL%';

create or replace function public.assign_vehicle_driver(
  p_order_id text,
  p_assignment_id text,
  p_vehicle_id text,
  p_driver_id text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_replace_assignment_id text default null,
  p_replace_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_count integer;
  vehicle_row public.app_vehicles%rowtype;
  driver_row public.app_drivers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into vehicle_row from public.app_vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'vehicle % not found', p_vehicle_id;
  end if;

  select * into driver_row from public.app_drivers where id = p_driver_id;
  if not found then
    raise exception 'driver % not found', p_driver_id;
  end if;

  if vehicle_row.status <> 'active' then
    raise exception 'vehicle % is %', vehicle_row.plate_no, vehicle_row.status;
  end if;

  if driver_row.status <> 'active' then
    raise exception 'driver % is %', driver_row.full_name, driver_row.status;
  end if;

  if nullif(trim(driver_row.phone), '') is null then
    raise exception 'driver % missing phone', driver_row.full_name;
  end if;

  select count(*)
  into conflict_count
  from public.app_dispatch_assignments a
  where a.status = 'active'
    and a.id <> coalesce(p_replace_assignment_id, '')
    and (a.vehicle_id = p_vehicle_id or a.driver_id = p_driver_id)
    and p_start_at < a.end_at
    and p_end_at > a.start_at;

  if conflict_count > 0 then
    raise exception 'assignment conflict';
  end if;

  if p_replace_assignment_id is not null then
    update public.app_dispatch_assignments
    set status = 'replaced',
        replace_reason = p_replace_reason,
        updated_at = now()
    where id = p_replace_assignment_id;
  end if;

  insert into public.app_dispatch_assignments (
    id,
    dispatch_order_id,
    vehicle_id,
    driver_id,
    status,
    start_at,
    end_at,
    replace_reason,
    updated_at
  ) values (
    p_assignment_id,
    p_order_id,
    p_vehicle_id,
    p_driver_id,
    'active',
    p_start_at,
    p_end_at,
    p_replace_reason,
    now()
  )
  on conflict (id) do update set
    dispatch_order_id = excluded.dispatch_order_id,
    vehicle_id = excluded.vehicle_id,
    driver_id = excluded.driver_id,
    status = excluded.status,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    replace_reason = excluded.replace_reason,
    updated_at = now();

  update public.app_dispatch_orders
  set vehicle_id = p_vehicle_id,
      driver_id = p_driver_id,
      vehicle_ownership = case when vehicle_row.ownership_type in ('partner', 'rented') then 'rented' else 'company' end,
      vehicle_plate_no = vehicle_row.plate_no,
      driver_full_name = driver_row.full_name,
      driver_cccd = driver_row.cccd,
      driver_phone = driver_row.phone,
      supplier_owner_name = case when vehicle_row.ownership_type = 'company' then null else vehicle_row.owner_name end,
      supplier_cccd = case when vehicle_row.ownership_type = 'company' then null else vehicle_row.owner_cccd end,
      supplier_invoice_required = coalesce(vehicle_row.supplier_invoice_required, true),
      supplier_company_name = vehicle_row.supplier_company_name,
      supplier_tax_code = vehicle_row.supplier_tax_code,
      supplier_address = vehicle_row.supplier_address,
      supplier_phone = vehicle_row.supplier_phone,
      supplier_bank_account = vehicle_row.supplier_bank_account,
      supplier_bank_name = vehicle_row.supplier_bank_name,
      dispatch_status = 'assigned',
      driver_ack_status = 'pending',
      driver_ack_count = 0,
      driver_ack_last_sent_at = null,
      driver_acknowledged_at = null,
      driver_ack_escalated_at = null,
      updated_at = now()
  where id = p_order_id;

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
    'assignment',
    p_assignment_id,
    case when p_replace_assignment_id is null then 'assigned_vehicle_driver' else 'replaced_assignment' end,
    coalesce(p_replace_reason, 'Assigned via RPC'),
    now(),
    now()
  );

  return p_assignment_id;
end;
$$;

grant execute on function public.assign_vehicle_driver(text, text, text, text, timestamptz, timestamptz, text, text) to authenticated;
