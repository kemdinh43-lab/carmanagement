alter table if exists public.app_payments
  add column if not exists bank_account text,
  add column if not exists bank_name text;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_payment'
  loop
    execute 'drop function if exists ' || fn.signature;
  end loop;
end $$;

create function public.record_payment(
  p_payment_id text,
  p_order_id text,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_paid_at timestamptz default now(),
  p_payment_status text default null,
  p_collector text default null,
  p_bank_account text default null,
  p_bank_name text default null,
  p_note text default null
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
    id,
    order_id,
    amount,
    status,
    paid_at,
    method,
    collector,
    bank_account,
    bank_name,
    reference,
    note,
    updated_at
  ) values (
    p_payment_id,
    p_order_id,
    p_amount,
    'valid',
    coalesce(p_paid_at, now()),
    p_method,
    nullif(p_collector, ''),
    nullif(p_bank_account, ''),
    nullif(p_bank_name, ''),
    nullif(p_reference, ''),
    nullif(p_note, ''),
    now()
  )
  on conflict (id) do update set
    order_id = excluded.order_id,
    amount = excluded.amount,
    status = excluded.status,
    paid_at = excluded.paid_at,
    method = excluded.method,
    collector = excluded.collector,
    bank_account = excluded.bank_account,
    bank_name = excluded.bank_name,
    reference = excluded.reference,
    note = excluded.note,
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
    p_method || ' / ' || p_amount::text || coalesce(' / ' || nullif(p_collector, ''), '') || coalesce(' / ' || nullif(p_reference, ''), ''),
    now(),
    now()
  );

  return p_payment_id;
end;
$$;

grant execute on function public.record_payment(
  text, text, numeric, text, text, timestamptz, text, text, text, text, text
) to authenticated;
