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
