create table if not exists public.app_integration_deliveries (
  id text primary key,
  event_id text references public.app_integration_events(id) on delete cascade,
  channel text not null,
  recipient_key text not null,
  dedupe_key text not null,
  status text not null default 'reserved',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_integration_deliveries_status_check check (status in ('reserved', 'sent', 'failed', 'skipped')),
  constraint app_integration_deliveries_once unique (channel, recipient_key, dedupe_key)
);

create index if not exists app_integration_deliveries_event_idx
  on public.app_integration_deliveries(event_id, created_at desc);

drop trigger if exists app_integration_deliveries_updated on public.app_integration_deliveries;
create trigger app_integration_deliveries_updated
before update on public.app_integration_deliveries
for each row execute function public.set_updated_at();

alter table public.app_integration_deliveries enable row level security;

drop policy if exists "app_integration_deliveries_select" on public.app_integration_deliveries;
drop policy if exists "app_integration_deliveries_insert" on public.app_integration_deliveries;
drop policy if exists "app_integration_deliveries_update" on public.app_integration_deliveries;

create policy "app_integration_deliveries_select" on public.app_integration_deliveries
for select
using (public.is_authenticated_user() and public.is_manager_or_admin());

create policy "app_integration_deliveries_insert" on public.app_integration_deliveries
for insert
with check (public.is_authenticated_user() and public.is_manager_or_admin());

create policy "app_integration_deliveries_update" on public.app_integration_deliveries
for update
using (public.is_authenticated_user() and public.is_manager_or_admin())
with check (public.is_authenticated_user() and public.is_manager_or_admin());

create or replace function public.reserve_integration_delivery(
  p_event_id text,
  p_channel text,
  p_recipient_key text,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.app_integration_deliveries (
    id,
    event_id,
    channel,
    recipient_key,
    dedupe_key,
    status
  )
  values (
    'delivery_' || md5(coalesce(p_channel, '') || ':' || coalesce(p_recipient_key, '') || ':' || coalesce(p_dedupe_key, '')),
    p_event_id,
    p_channel,
    p_recipient_key,
    p_dedupe_key,
    'reserved'
  )
  on conflict (channel, recipient_key, dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.mark_integration_delivery_sent(
  p_channel text,
  p_recipient_key text,
  p_dedupe_key text,
  p_provider_message_id text default null
)
returns public.app_integration_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_delivery public.app_integration_deliveries;
begin
  update public.app_integration_deliveries
  set
    status = 'sent',
    provider_message_id = p_provider_message_id,
    error = null,
    updated_at = now()
  where channel = p_channel
    and recipient_key = p_recipient_key
    and dedupe_key = p_dedupe_key
  returning * into updated_delivery;

  if updated_delivery.id is null then
    raise exception 'integration delivery not found';
  end if;

  return updated_delivery;
end;
$$;

create or replace function public.mark_integration_delivery_failed(
  p_channel text,
  p_recipient_key text,
  p_dedupe_key text,
  p_error text default null
)
returns public.app_integration_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_delivery public.app_integration_deliveries;
begin
  update public.app_integration_deliveries
  set
    status = 'failed',
    error = left(coalesce(p_error, 'Unknown delivery error'), 1000),
    updated_at = now()
  where channel = p_channel
    and recipient_key = p_recipient_key
    and dedupe_key = p_dedupe_key
  returning * into updated_delivery;

  if updated_delivery.id is null then
    raise exception 'integration delivery not found';
  end if;

  return updated_delivery;
end;
$$;

grant execute on function public.reserve_integration_delivery(text, text, text, text) to authenticated, service_role;
grant execute on function public.mark_integration_delivery_sent(text, text, text, text) to authenticated, service_role;
grant execute on function public.mark_integration_delivery_failed(text, text, text, text) to authenticated, service_role;
