create or replace function public.cancel_dispatch_order(
  p_order_id text,
  p_reason text
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
  set order_status = 'cancelled',
      dispatch_status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  update public.app_dispatch_assignments
  set status = 'cancelled',
      replace_reason = coalesce(p_reason, replace_reason),
      updated_at = now()
  where dispatch_order_id = p_order_id
    and status = 'active';

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
    'Sale',
    'dispatch_order',
    p_order_id,
    'cancelled_order',
    coalesce(p_reason, ''),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.cancel_dispatch_order(text, text) to authenticated;
