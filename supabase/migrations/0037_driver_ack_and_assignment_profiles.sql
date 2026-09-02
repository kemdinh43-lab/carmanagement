alter table if exists public.app_dispatch_orders
  add column if not exists driver_ack_status text not null default 'not_required',
  add column if not exists driver_ack_count integer not null default 0,
  add column if not exists driver_ack_last_sent_at timestamptz,
  add column if not exists driver_acknowledged_at timestamptz,
  add column if not exists driver_ack_escalated_at timestamptz;

create index if not exists app_dispatch_orders_driver_ack_idx
  on public.app_dispatch_orders (driver_ack_status, driver_ack_last_sent_at, start_at)
  where dispatch_status = 'assigned';

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

  select *
  into vehicle_row
  from public.app_vehicles
  where id = p_vehicle_id;

  if not found then
    raise exception 'vehicle % not found', p_vehicle_id;
  end if;

  select *
  into driver_row
  from public.app_drivers
  where id = p_driver_id;

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
      vehicle_ownership = case when vehicle_row.ownership_type = 'rented' then 'rented' else 'company' end,
      vehicle_plate_no = vehicle_row.plate_no,
      driver_full_name = driver_row.full_name,
      driver_cccd = driver_row.cccd,
      driver_phone = driver_row.phone,
      supplier_owner_name = vehicle_row.owner_name,
      supplier_cccd = vehicle_row.owner_cccd,
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

create or replace function public.update_dispatch_status(
  p_order_id text,
  p_next_status text,
  p_reason text,
  p_actor text default 'Dispatcher'
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

  if public.current_app_role() not in ('dispatcher', 'driver', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set dispatch_status = p_next_status,
      driver_ack_status = case when p_next_status = 'driver_accepted' then 'accepted' else driver_ack_status end,
      driver_acknowledged_at = case when p_next_status = 'driver_accepted' then now() else driver_acknowledged_at end,
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
    p_actor,
    'dispatch_order',
    p_order_id,
    'status_' || p_next_status,
    coalesce(p_reason, ''),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.update_dispatch_status(text, text, text, text) to authenticated;

create or replace function public.record_driver_ack_reminder(
  p_order_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.app_dispatch_orders
  set driver_ack_count = coalesce(driver_ack_count, 0) + 1,
      driver_ack_last_sent_at = now(),
      driver_ack_status = case
        when driver_ack_status in ('accepted', 'escalated') then driver_ack_status
        else 'pending'
      end,
      updated_at = now()
  where id = p_order_id
    and dispatch_status = 'assigned'
    and coalesce(driver_ack_status, 'pending') = 'pending'
  returning driver_ack_count into next_count;

  return coalesce(next_count, 0);
end;
$$;

grant execute on function public.record_driver_ack_reminder(text) to authenticated;

create or replace function public.escalate_driver_ack(
  p_order_id text,
  p_reason text default 'Tài xế chưa nhận chuyến sau 3 lần nhắc'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.app_dispatch_orders%rowtype;
begin
  select *
  into order_row
  from public.app_dispatch_orders
  where id = p_order_id;

  if not found then
    raise exception 'dispatch order % not found', p_order_id;
  end if;

  update public.app_dispatch_orders
  set driver_ack_status = 'escalated',
      driver_ack_escalated_at = now(),
      updated_at = now()
  where id = p_order_id
    and dispatch_status = 'assigned'
    and coalesce(driver_ack_status, 'pending') = 'pending';

  insert into public.app_notifications (
    id,
    audience,
    event_type,
    title,
    body,
    entity_id,
    is_read,
    created_at,
    updated_at
  ) values (
    gen_random_uuid()::text,
    'dispatcher',
    'driver_ack_escalated',
    'Tài xế chưa nhận chuyến',
    order_row.code || ' / ' || coalesce(order_row.driver_full_name, order_row.driver_id, 'chưa rõ tài xế') || '. ' || coalesce(p_reason, ''),
    p_order_id,
    false,
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.escalate_driver_ack(text, text) to authenticated;
