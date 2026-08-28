create table if not exists public.app_order_number_counters (
  order_date date primary key,
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists app_dispatch_orders_code_idx on public.app_dispatch_orders(code);

alter table public.app_order_number_counters enable row level security;

drop policy if exists "app_order_number_counters_select" on public.app_order_number_counters;
create policy "app_order_number_counters_select" on public.app_order_number_counters
for select using (public.is_manager_or_admin());

create or replace function public.next_dispatch_order_code(p_order_date date default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_date date := coalesce(p_order_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  date_prefix text := to_char(target_date, 'YYMMDD');
  existing_max integer;
  next_no integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select coalesce(max(substring(code from 12 for 4)::integer), 0)
  into existing_max
  from public.app_dispatch_orders
  where code ~ ('^AOT-' || date_prefix || '-[0-9]{4}$');

  insert into public.app_order_number_counters(order_date, last_number, updated_at)
  values (target_date, existing_max + 1, now())
  on conflict (order_date) do update
    set last_number = greatest(public.app_order_number_counters.last_number + 1, existing_max + 1),
        updated_at = now()
  returning last_number into next_no;

  return 'AOT-' || date_prefix || '-' || lpad(next_no::text, 4, '0');
end;
$$;

grant execute on function public.next_dispatch_order_code(date) to authenticated;
