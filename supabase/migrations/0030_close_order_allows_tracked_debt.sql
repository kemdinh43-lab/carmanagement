create or replace function public.close_dispatch_order(
  p_order_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.app_dispatch_orders%rowtype;
begin
  perform public.assert_finance_role();

  select *
  into order_row
  from public.app_dispatch_orders
  where id = p_order_id
    and order_status <> 'cancelled'
  for update;

  if not found then
    raise exception 'dispatch order not found or cancelled';
  end if;

  if order_row.dispatch_status <> 'completed' then
    raise exception 'cannot close: trip is not completed';
  end if;

  if coalesce(order_row.driver_report_status, 'not_reported') not in ('reported', 'reviewed') then
    raise exception 'cannot close: driver report is missing';
  end if;

  if order_row.invoice_status not in ('issued', 'not_required') then
    raise exception 'cannot close: invoice is not finished';
  end if;

  update public.app_dispatch_orders
  set reconciliation_status = 'closed',
      driver_report_status = case when driver_report_status = 'reported' then 'reviewed' else driver_report_status end,
      updated_at = now()
  where id = p_order_id;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    public.current_app_actor_name(),
    'reconciliation',
    p_order_id,
    'closed_order',
    'Closed with tracked payment status: ' || coalesce(order_row.payment_status, 'unknown'),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

create or replace function public.close_order(p_order_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select public.close_dispatch_order(p_order_id)
$$;

grant execute on function public.close_dispatch_order(text) to authenticated;
grant execute on function public.close_order(text) to authenticated;
