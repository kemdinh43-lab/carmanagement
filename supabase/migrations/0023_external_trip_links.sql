alter table if exists public.app_dispatch_orders
  add column if not exists external_driver_name text,
  add column if not exists external_driver_phone text,
  add column if not exists external_vehicle_plate text,
  add column if not exists external_vehicle_type text,
  add column if not exists trip_access_token text,
  add column if not exists trip_access_expires_at timestamptz,
  add column if not exists trip_access_revoked boolean not null default false;

create unique index if not exists app_dispatch_orders_trip_access_token_key
  on public.app_dispatch_orders (trip_access_token)
  where trip_access_token is not null;

create or replace function public.assign_external_vehicle_driver(
  p_order_id text,
  p_external_vehicle_plate text,
  p_external_vehicle_type text,
  p_external_driver_name text,
  p_external_driver_phone text,
  p_estimated_purchase_amount numeric,
  p_trip_access_token text,
  p_trip_access_expires_at timestamptz,
  p_replace_assignment_id text default null,
  p_reason text default null
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

  if public.current_app_role() not in ('dispatcher', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  if nullif(trim(p_external_vehicle_plate), '') is null
    or nullif(trim(p_external_vehicle_type), '') is null
    or nullif(trim(p_external_driver_name), '') is null
    or nullif(trim(p_external_driver_phone), '') is null
    or coalesce(p_estimated_purchase_amount, 0) <= 0
    or nullif(trim(p_trip_access_token), '') is null
    or p_trip_access_expires_at is null then
    raise exception 'external assignment missing required fields';
  end if;

  if p_replace_assignment_id is not null then
    update public.app_dispatch_assignments
    set status = 'replaced',
        replace_reason = coalesce(p_reason, 'Replaced by external driver assignment'),
        updated_at = now()
    where id = p_replace_assignment_id;
  end if;

  update public.app_dispatch_orders
  set vehicle_ownership = 'rented',
      vehicle_id = null,
      driver_id = null,
      vehicle_plate_no = trim(p_external_vehicle_plate),
      driver_full_name = trim(p_external_driver_name),
      driver_phone = trim(p_external_driver_phone),
      external_vehicle_plate = trim(p_external_vehicle_plate),
      external_vehicle_type = trim(p_external_vehicle_type),
      external_driver_name = trim(p_external_driver_name),
      external_driver_phone = trim(p_external_driver_phone),
      supplier_total_with_vat = p_estimated_purchase_amount,
      vehicle_cost = p_estimated_purchase_amount,
      dispatch_status = 'assigned',
      trip_access_token = p_trip_access_token,
      trip_access_expires_at = p_trip_access_expires_at,
      trip_access_revoked = false,
      updated_at = now()
  where id = p_order_id
    and order_status = 'confirmed';

  if not found then
    raise exception 'dispatch order not found or not confirmed';
  end if;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    'Dispatcher',
    'dispatch_order',
    p_order_id,
    'assigned_external_driver',
    coalesce(p_reason, 'Assigned external driver with trip link'),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

create or replace function public.get_external_trip_by_token(p_token text)
returns table (
  id text,
  code text,
  customer_name text,
  contact_phone text,
  pickup text,
  dropoff text,
  service_label text,
  start_at timestamptz,
  end_at timestamptz,
  dispatch_status text,
  external_driver_name text,
  external_driver_phone text,
  external_vehicle_plate text,
  external_vehicle_type text,
  trip_access_expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.code,
    o.customer_name,
    o.contact_phone,
    o.pickup,
    o.dropoff,
    o.service_label,
    o.start_at,
    o.end_at,
    o.dispatch_status,
    o.external_driver_name,
    o.external_driver_phone,
    o.external_vehicle_plate,
    o.external_vehicle_type,
    o.trip_access_expires_at
  from public.app_dispatch_orders o
  where o.trip_access_token = p_token
    and o.vehicle_ownership = 'rented'
    and coalesce(o.trip_access_revoked, false) = false
    and o.trip_access_expires_at > now()
  limit 1;
$$;

create or replace function public.update_external_trip_status(
  p_token text,
  p_next_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.app_dispatch_orders%rowtype;
begin
  select *
  into target_order
  from public.app_dispatch_orders
  where trip_access_token = p_token
    and vehicle_ownership = 'rented'
    and coalesce(trip_access_revoked, false) = false
    and trip_access_expires_at > now()
  limit 1;

  if target_order.id is null then
    raise exception 'trip link expired or invalid';
  end if;

  if p_next_status not in ('driver_accepted', 'in_progress', 'completed') then
    raise exception 'invalid status';
  end if;

  if (target_order.dispatch_status = 'assigned' and p_next_status <> 'driver_accepted')
    or (target_order.dispatch_status = 'driver_accepted' and p_next_status <> 'in_progress')
    or (target_order.dispatch_status = 'in_progress' and p_next_status <> 'completed')
    or target_order.dispatch_status not in ('assigned', 'driver_accepted', 'in_progress') then
    raise exception 'invalid status transition';
  end if;

  update public.app_dispatch_orders
  set dispatch_status = p_next_status,
      trip_access_revoked = case when p_next_status = 'completed' then true else trip_access_revoked end,
      updated_at = now()
  where id = target_order.id;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    'External Driver Trip Link',
    'dispatch_order',
    target_order.id,
    'status_' || p_next_status,
    coalesce(target_order.external_driver_name, target_order.driver_full_name, 'External driver') || ' updated via trip link',
    now(),
    now()
  );

  return target_order.id;
end;
$$;

grant execute on function public.assign_external_vehicle_driver(text, text, text, text, text, numeric, text, timestamptz, text, text) to authenticated;
grant execute on function public.get_external_trip_by_token(text) to anon, authenticated;
grant execute on function public.update_external_trip_status(text, text) to anon, authenticated;
