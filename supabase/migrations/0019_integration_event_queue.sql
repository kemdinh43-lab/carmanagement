alter table if exists public.app_notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists target_driver_id text references public.app_drivers(id) on delete cascade,
  add column if not exists event_type text;

create or replace function public.current_app_driver_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select (
    select driver_id
    from public.app_user_profiles
    where user_id = auth.uid()
    limit 1
  )
$$;

create table if not exists public.app_integration_events (
  id text primary key,
  source text not null default 'ops_app',
  event_type text not null,
  audience text not null,
  entity_type text not null default 'dispatch_order',
  entity_id text,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_driver_id text references public.app_drivers(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_notifications_event_type_idx on public.app_notifications(event_type, created_at desc);
create index if not exists app_integration_events_status_idx on public.app_integration_events(status, created_at);
create index if not exists app_integration_events_entity_idx on public.app_integration_events(entity_type, entity_id, created_at desc);
create index if not exists app_integration_events_target_user_idx on public.app_integration_events(target_user_id, created_at desc);
create index if not exists app_integration_events_target_driver_idx on public.app_integration_events(target_driver_id, created_at desc);

drop trigger if exists app_integration_events_updated on public.app_integration_events;
create trigger app_integration_events_updated
before update on public.app_integration_events
for each row execute function public.set_updated_at();

alter table public.app_integration_events enable row level security;

drop policy if exists "app_notifications_write" on public.app_notifications;
drop policy if exists "app_notifications_insert" on public.app_notifications;
drop policy if exists "app_notifications_update_read" on public.app_notifications;

create policy "app_notifications_insert" on public.app_notifications
for insert
with check (public.is_authenticated_user());

create policy "app_notifications_update_read" on public.app_notifications
for update
using (
  public.is_authenticated_user()
  and (
    public.is_manager_or_admin()
    or (
      audience = public.current_app_role()
      and (target_user_id is null or target_user_id = auth.uid())
      and (target_driver_id is null or target_driver_id = public.current_app_driver_id())
    )
  )
)
with check (
  public.is_authenticated_user()
  and (
    public.is_manager_or_admin()
    or (
      audience = public.current_app_role()
      and (target_user_id is null or target_user_id = auth.uid())
      and (target_driver_id is null or target_driver_id = public.current_app_driver_id())
    )
  )
);

drop policy if exists "app_integration_events_all" on public.app_integration_events;
drop policy if exists "app_integration_events_select" on public.app_integration_events;
drop policy if exists "app_integration_events_insert" on public.app_integration_events;
drop policy if exists "app_integration_events_update" on public.app_integration_events;

create policy "app_integration_events_select" on public.app_integration_events
for select
using (public.is_authenticated_user() and public.is_manager_or_admin());

create policy "app_integration_events_insert" on public.app_integration_events
for insert
with check (public.is_authenticated_user());

create policy "app_integration_events_update" on public.app_integration_events
for update
using (public.is_authenticated_user() and public.is_manager_or_admin())
with check (public.is_authenticated_user() and public.is_manager_or_admin());
