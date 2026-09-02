alter table if exists public.app_dispatch_orders
  add column if not exists guest_count integer,
  add column if not exists guest_market text,
  add column if not exists customer_recognition_code text,
  add column if not exists customer_source_code text,
  add column if not exists origin_province_code text,
  add column if not exists destination_province_code text;

create index if not exists app_dispatch_orders_transport_code_month_idx
  on public.app_dispatch_orders (order_date, code);

create or replace function public.next_transport_order_code(
  p_order_date date default null,
  p_guest_market text default 'domestic',
  p_customer_recognition_code text default 'DL',
  p_customer_source_code text default 'DDH',
  p_origin_province_code text default 'DAD',
  p_destination_province_code text default 'QNH'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_date date := coalesce(p_order_date, current_date);
  month_code text := to_char(target_date, 'MM.YYYY');
  guest_code text := case coalesce(nullif(p_guest_market, ''), 'domestic')
    when 'international' then 'QT'
    when 'mixed' then 'NĐQT'
    else 'NĐ'
  end;
  recognition_code text := upper(coalesce(nullif(p_customer_recognition_code, ''), 'DL'));
  source_code text := case upper(coalesce(nullif(p_customer_source_code, ''), 'DDH'))
    when 'T' then 'T'
    else 'ĐDH'
  end;
  origin_code text := upper(coalesce(nullif(p_origin_province_code, ''), 'DAD'));
  destination_code text := upper(coalesce(nullif(p_destination_province_code, ''), 'QNH'));
  next_no integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select coalesce(max(substring(code from '^V([0-9]{4})/')::integer), 0) + 1
  into next_no
  from public.app_dispatch_orders
  where code ~ '^V[0-9]{4}/[0-9]{2}\.[0-9]{4}/';

  return 'V' || lpad(next_no::text, 4, '0') || '/' ||
    month_code || '/' ||
    guest_code || '/' ||
    recognition_code || '/' ||
    source_code || '/' ||
    origin_code || '-' || destination_code;
end;
$$;

grant execute on function public.next_transport_order_code(date, text, text, text, text, text) to authenticated;

create or replace function public.update_dispatch_order_transport_code_fields(
  p_order_id text,
  p_guest_count integer default null,
  p_guest_market text default null,
  p_customer_recognition_code text default null,
  p_customer_source_code text default null,
  p_origin_province_code text default null,
  p_destination_province_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  app_role text := public.current_app_role();
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if app_role not in ('sale', 'manager', 'admin') then
    raise exception 'permission denied';
  end if;

  update public.app_dispatch_orders
  set guest_count = p_guest_count,
      guest_market = nullif(p_guest_market, ''),
      customer_recognition_code = nullif(p_customer_recognition_code, ''),
      customer_source_code = nullif(p_customer_source_code, ''),
      origin_province_code = nullif(upper(p_origin_province_code), ''),
      destination_province_code = nullif(upper(p_destination_province_code), ''),
      updated_at = now()
  where id = p_order_id;

  if not found then
    raise exception 'dispatch order not found';
  end if;

  return p_order_id;
end;
$$;

grant execute on function public.update_dispatch_order_transport_code_fields(
  text, integer, text, text, text, text, text
) to authenticated;
