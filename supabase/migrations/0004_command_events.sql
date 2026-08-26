create table if not exists public.app_command_events (
  id text primary key,
  command_name text not null,
  actor_role text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  result_status text not null default 'applied',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists app_command_events_command_idx on public.app_command_events(command_name, created_at desc);
create index if not exists app_command_events_entity_idx on public.app_command_events(entity_type, entity_id, created_at desc);

alter table public.app_command_events enable row level security;

drop policy if exists "app_command_events_select" on public.app_command_events;
drop policy if exists "app_command_events_insert" on public.app_command_events;
create policy "app_command_events_select" on public.app_command_events
for select using (public.is_authenticated_user());
create policy "app_command_events_insert" on public.app_command_events
for insert with check (public.is_authenticated_user());
