create or replace function public.update_actual_costs(
  p_order_id text,
  p_actual_driver_cost numeric,
  p_actual_vehicle_cost numeric,
  p_actual_other_cost numeric,
  p_actual_cost_note text default null
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

  if public.current_app_role() not in ('accountant', 'manager', 'admin', 'dispatcher') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set actual_driver_cost = p_actual_driver_cost,
      actual_vehicle_cost = p_actual_vehicle_cost,
      actual_other_cost = p_actual_other_cost,
      actual_cost_note = nullif(p_actual_cost_note, ''),
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
    'Accountant',
    'dispatch_order',
    p_order_id,
    'updated_actual_costs',
    coalesce(p_actual_cost_note, ''),
    now(),
    now()
  );

  return p_order_id;
end;
$$;

create or replace function public.record_payment(
  p_payment_id text,
  p_order_id text,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_paid_at timestamptz,
  p_payment_status text
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

  if public.current_app_role() not in ('accountant', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  insert into public.app_payments (
    id,
    order_id,
    amount,
    status,
    paid_at,
    method,
    reference,
    updated_at
  ) values (
    p_payment_id,
    p_order_id,
    p_amount,
    'valid',
    p_paid_at,
    p_method,
    nullif(p_reference, ''),
    now()
  )
  on conflict (id) do update set
    order_id = excluded.order_id,
    amount = excluded.amount,
    status = excluded.status,
    paid_at = excluded.paid_at,
    method = excluded.method,
    reference = excluded.reference,
    updated_at = now();

  update public.app_dispatch_orders
  set payment_status = p_payment_status,
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
    'Accountant',
    'payment',
    p_payment_id,
    'recorded_payment',
    p_method,
    now(),
    now()
  );

  return p_payment_id;
end;
$$;

create or replace function public.update_invoice_status(
  p_order_id text,
  p_invoice_status text
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

  if public.current_app_role() not in ('accountant', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set invoice_status = p_invoice_status,
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
    'Accountant',
    'invoice',
    p_order_id,
    'updated_invoice_status',
    p_invoice_status,
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
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.current_app_role() not in ('accountant', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set reconciliation_status = 'closed',
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
    'Accountant',
    'reconciliation',
    p_order_id,
    'closed_order',
    'Closed via RPC',
    now(),
    now()
  );

  return p_order_id;
end;
$$;

grant execute on function public.update_actual_costs(text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.record_payment(text, text, numeric, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_invoice_status(text, text) to authenticated;
grant execute on function public.close_dispatch_order(text) to authenticated;
