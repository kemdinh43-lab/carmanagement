create or replace function public.review_dispatch_proposal(
  p_order_id text,
  p_decision text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order_status text;
  next_dispatch_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.current_app_role() not in ('dispatcher', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  if p_decision = 'approved' then
    next_order_status := 'confirmed';
    next_dispatch_status := 'waiting_assignment';
  elsif p_decision = 'rejected' then
    next_order_status := 'cancelled';
    next_dispatch_status := 'cancelled';
  else
    raise exception 'invalid decision';
  end if;

  update public.app_dispatch_orders
  set order_status = next_order_status,
      dispatch_status = next_dispatch_status,
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
    'dispatch_order',
    p_order_id,
    case when p_decision = 'approved' then 'approved_dispatch_proposal' else 'rejected_dispatch_proposal' end,
    coalesce(p_reason, ''),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.review_dispatch_proposal(text, text, text) to authenticated;
