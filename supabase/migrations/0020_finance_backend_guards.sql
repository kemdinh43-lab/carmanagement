create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role
      from public.app_user_profiles
      where user_id = auth.uid()
      limit 1
    ),
    'sale'
  )
$$;

create or replace function public.current_app_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select nullif(full_name, '')
      from public.app_user_profiles
      where user_id = auth.uid()
      limit 1
    ),
    initcap(replace(public.current_app_role(), '_', ' '))
  )
$$;

create or replace function public.assert_finance_role()
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

  if public.current_app_role() not in ('accountant', 'manager', 'admin') then
    raise exception 'permission denied: finance role required';
  end if;
end;
$$;

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
  perform public.assert_finance_role();

  if coalesce(p_actual_driver_cost, 0) < 0
    or coalesce(p_actual_vehicle_cost, 0) < 0
    or coalesce(p_actual_other_cost, 0) < 0 then
    raise exception 'actual costs cannot be negative';
  end if;

  update public.app_dispatch_orders
  set actual_driver_cost = coalesce(p_actual_driver_cost, 0),
      actual_vehicle_cost = coalesce(p_actual_vehicle_cost, 0),
      actual_other_cost = coalesce(p_actual_other_cost, 0),
      actual_cost_note = nullif(p_actual_cost_note, ''),
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
    'updated_actual_costs',
    coalesce(nullif(p_actual_cost_note, ''), 'Updated actual trip costs'),
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
  p_paid_at timestamptz default now(),
  p_payment_status text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  order_amount numeric(14,2);
  total_paid numeric(14,2);
  next_payment_status text;
begin
  perform public.assert_finance_role();

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;

  if p_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception 'invalid payment method';
  end if;

  select amount_due
  into order_amount
  from public.app_dispatch_orders
  where id = p_order_id
    and order_status <> 'cancelled';

  if order_amount is null then
    raise exception 'dispatch order not found or cancelled';
  end if;

  insert into public.app_payments (
    id, order_id, amount, status, paid_at, method, reference, updated_at
  ) values (
    p_payment_id,
    p_order_id,
    p_amount,
    'valid',
    coalesce(p_paid_at, now()),
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

  select coalesce(sum(amount), 0)
  into total_paid
  from public.app_payments
  where order_id = p_order_id
    and status = 'valid';

  next_payment_status := case
    when total_paid <= 0 then 'unpaid'
    when total_paid >= order_amount then 'paid'
    else 'partial'
  end;

  update public.app_dispatch_orders
  set payment_status = next_payment_status,
      updated_at = now()
  where id = p_order_id;

  insert into public.app_audit_events (
    id, actor, entity_type, entity_id, action, reason, created_at, updated_at
  ) values (
    gen_random_uuid()::text,
    public.current_app_actor_name(),
    'payment',
    p_payment_id,
    'recorded_payment',
    p_method || ' / ' || p_amount::text || coalesce(' / ' || nullif(p_reference, ''), ''),
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
  perform public.assert_finance_role();

  if p_invoice_status not in ('not_required', 'open', 'ready_to_issue', 'issued') then
    raise exception 'invalid invoice status';
  end if;

  update public.app_dispatch_orders
  set invoice_status = p_invoice_status,
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

create or replace function public.close_order(p_order_id text)
returns text
language sql
security definer
set search_path = public
as $$
  select public.close_dispatch_order(p_order_id)
$$;

grant execute on function public.current_app_actor_name() to authenticated;
grant execute on function public.assert_finance_role() to authenticated;
grant execute on function public.update_actual_costs(text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.record_payment(text, text, numeric, text, text, timestamptz, text) to authenticated;
grant execute on function public.update_invoice_status(text, text) to authenticated;
grant execute on function public.close_dispatch_order(text) to authenticated;
grant execute on function public.close_order(text) to authenticated;
