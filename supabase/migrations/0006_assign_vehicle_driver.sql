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
begin
  if auth.uid() is null then
    raise exception 'authentication required';
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
      dispatch_status = 'assigned',
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
