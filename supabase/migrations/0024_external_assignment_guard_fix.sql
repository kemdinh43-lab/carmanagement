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
declare
  target_order public.app_dispatch_orders%rowtype;
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

  select *
  into target_order
  from public.app_dispatch_orders
  where id = p_order_id
  limit 1;

  if target_order.id is null then
    raise exception 'dispatch order % not found in app_dispatch_orders', p_order_id;
  end if;

  if target_order.order_status = 'cancelled'
    or target_order.dispatch_status = 'cancelled' then
    raise exception 'cannot assign external driver to cancelled order %', target_order.code;
  end if;

  if target_order.order_status = 'pending_dispatch_review' then
    raise exception 'cannot assign external driver before dispatcher approval for %', target_order.code;
  end if;

  if target_order.dispatch_status not in ('waiting_assignment', 'assigned', 'driver_accepted') then
    raise exception 'cannot assign external driver while dispatch status is % for %', target_order.dispatch_status, target_order.code;
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
      order_status = case when order_status = 'draft' then 'confirmed' else order_status end,
      dispatch_status = 'assigned',
      trip_access_token = p_trip_access_token,
      trip_access_expires_at = p_trip_access_expires_at,
      trip_access_revoked = false,
      updated_at = now()
  where id = p_order_id;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    public.current_app_actor_name(),
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

grant execute on function public.assign_external_vehicle_driver(text, text, text, text, text, numeric, text, timestamptz, text, text) to authenticated;
