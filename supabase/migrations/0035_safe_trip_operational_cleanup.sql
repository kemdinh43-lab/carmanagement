create or replace function public.clean_trip_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  app_role text := public.current_app_role();
  deleted_orders integer := 0;
  deleted_assignments integer := 0;
  deleted_payments integer := 0;
  deleted_audit_events integer := 0;
  deleted_notifications integer := 0;
  deleted_integration_events integer := 0;
  deleted_integration_deliveries integer := 0;
begin
  if app_role not in ('admin', 'manager') then
    raise exception 'Only admin or manager can clean trip operational data';
  end if;

  if to_regclass('public.app_integration_deliveries') is not null then
    delete from public.app_integration_deliveries;
    get diagnostics deleted_integration_deliveries = row_count;
  end if;

  if to_regclass('public.app_integration_events') is not null then
    delete from public.app_integration_events;
    get diagnostics deleted_integration_events = row_count;
  end if;

  delete from public.app_notifications;
  get diagnostics deleted_notifications = row_count;

  delete from public.app_audit_events
  where entity_type in ('dispatch_order', 'assignment', 'payment', 'invoice', 'reconciliation', 'trip_report')
     or entity_id in (select id from public.app_dispatch_orders);
  get diagnostics deleted_audit_events = row_count;

  delete from public.app_payments;
  get diagnostics deleted_payments = row_count;

  delete from public.app_dispatch_assignments;
  get diagnostics deleted_assignments = row_count;

  delete from public.app_dispatch_orders;
  get diagnostics deleted_orders = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_orders', deleted_orders,
    'deleted_assignments', deleted_assignments,
    'deleted_payments', deleted_payments,
    'deleted_audit_events', deleted_audit_events,
    'deleted_notifications', deleted_notifications,
    'deleted_integration_events', deleted_integration_events,
    'deleted_integration_deliveries', deleted_integration_deliveries
  );
end;
$$;

grant execute on function public.clean_trip_operational_data() to authenticated, service_role;
