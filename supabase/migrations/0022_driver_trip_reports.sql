alter table if exists public.app_dispatch_orders
  add column if not exists driver_collected_amount numeric(14,2),
  add column if not exists driver_expense_fuel numeric(14,2),
  add column if not exists driver_expense_toll numeric(14,2),
  add column if not exists driver_expense_parking numeric(14,2),
  add column if not exists driver_expense_water numeric(14,2),
  add column if not exists driver_expense_other numeric(14,2),
  add column if not exists driver_expense_note text,
  add column if not exists driver_report_status text,
  add column if not exists driver_reported_at timestamptz;

create or replace function public.assert_driver_report_role()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.current_app_role() not in ('driver', 'accountant', 'manager', 'admin') then
    raise exception 'permission denied: trip report role required';
  end if;
end;
$$;

create or replace function public.submit_driver_trip_report(
  p_order_id text,
  p_driver_collected_amount numeric default 0,
  p_driver_expense_fuel numeric default 0,
  p_driver_expense_toll numeric default 0,
  p_driver_expense_parking numeric default 0,
  p_driver_expense_water numeric default 0,
  p_driver_expense_other numeric default 0,
  p_driver_expense_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  report_total numeric(14,2);
begin
  perform public.assert_driver_report_role();

  if coalesce(p_driver_collected_amount, 0) < 0
    or coalesce(p_driver_expense_fuel, 0) < 0
    or coalesce(p_driver_expense_toll, 0) < 0
    or coalesce(p_driver_expense_parking, 0) < 0
    or coalesce(p_driver_expense_water, 0) < 0
    or coalesce(p_driver_expense_other, 0) < 0 then
    raise exception 'driver report amounts cannot be negative';
  end if;

  report_total :=
    coalesce(p_driver_expense_fuel, 0)
    + coalesce(p_driver_expense_toll, 0)
    + coalesce(p_driver_expense_parking, 0)
    + coalesce(p_driver_expense_water, 0)
    + coalesce(p_driver_expense_other, 0);

  update public.app_dispatch_orders
  set driver_collected_amount = coalesce(p_driver_collected_amount, 0),
      driver_expense_fuel = coalesce(p_driver_expense_fuel, 0),
      driver_expense_toll = coalesce(p_driver_expense_toll, 0),
      driver_expense_parking = coalesce(p_driver_expense_parking, 0),
      driver_expense_water = coalesce(p_driver_expense_water, 0),
      driver_expense_other = coalesce(p_driver_expense_other, 0),
      driver_expense_note = nullif(p_driver_expense_note, ''),
      driver_report_status = 'reported',
      driver_reported_at = now(),
      updated_at = now()
  where id = p_order_id
    and order_status <> 'cancelled';

  if not found then
    raise exception 'dispatch order not found or cancelled';
  end if;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    public.current_app_actor_name(),
    'dispatch_order',
    p_order_id,
    'submitted_driver_trip_report',
    'Collected ' || coalesce(p_driver_collected_amount, 0)::text || ' / expenses ' || report_total::text,
    now(),
    now()
  );

  return p_order_id;
end;
$$;

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
    and order_status <> 'cancelled';

  if not found then
    raise exception 'dispatch order not found or cancelled';
  end if;

  if order_row.dispatch_status <> 'completed' then
    raise exception 'cannot close: trip is not completed';
  end if;

  if order_row.driver_report_status <> 'reported' then
    raise exception 'cannot close: driver report is missing';
  end if;

  if order_row.payment_status <> 'paid' then
    raise exception 'cannot close: payment is not fully collected';
  end if;

  if order_row.invoice_status not in ('issued', 'not_required') then
    raise exception 'cannot close: invoice is not finished';
  end if;

  update public.app_dispatch_orders
  set reconciliation_status = 'closed',
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
    'Closed by finance backend guard',
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.assert_driver_report_role() to authenticated;
grant execute on function public.submit_driver_trip_report(text, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.close_dispatch_order(text) to authenticated;
