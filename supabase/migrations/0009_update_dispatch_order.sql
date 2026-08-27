create or replace function public.update_dispatch_order(
  p_order_id text,
  p_customer_name text,
  p_contact_name text,
  p_contact_phone text,
  p_pickup text,
  p_dropoff text,
  p_service_label text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_amount_due numeric,
  p_driver_cost numeric,
  p_vehicle_cost numeric,
  p_other_cost numeric,
  p_quote_note text,
  p_priority text,
  p_sales_note text,
  p_active_assignment_id text default null,
  p_replacement_reason text default null
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
  set customer_name = p_customer_name,
      contact_name = nullif(p_contact_name, ''),
      contact_phone = p_contact_phone,
      pickup = p_pickup,
      dropoff = p_dropoff,
      service_label = p_service_label,
      start_at = p_start_at,
      end_at = p_end_at,
      amount_due = p_amount_due,
      driver_cost = nullif(p_driver_cost, 0),
      vehicle_cost = nullif(p_vehicle_cost, 0),
      other_cost = nullif(p_other_cost, 0),
      quote_note = nullif(p_quote_note, ''),
      priority = nullif(p_priority, ''),
      sales_note = nullif(p_sales_note, ''),
      changed_near_start = case when start_at <> p_start_at or end_at <> p_end_at then true else changed_near_start end,
      updated_at = now()
  where id = p_order_id;

  if p_active_assignment_id is not null then
    update public.app_dispatch_assignments
    set start_at = p_start_at,
        end_at = p_end_at,
        replace_reason = p_replacement_reason,
        updated_at = now()
    where id = p_active_assignment_id;
  end if;

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
    'updated_order',
    coalesce(p_replacement_reason, 'Updated via RPC'),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.update_dispatch_order(text, text, text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, numeric, numeric, text, text, text, text, text) to authenticated;
