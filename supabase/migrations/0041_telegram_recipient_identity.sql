alter table if exists public.app_user_profiles
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_username text,
  add column if not exists telegram_connected_at timestamptz,
  add column if not exists telegram_enabled boolean not null default false;

alter table if exists public.app_drivers
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_username text,
  add column if not exists telegram_connected_at timestamptz,
  add column if not exists telegram_enabled boolean not null default false;

create index if not exists app_user_profiles_telegram_role_idx
  on public.app_user_profiles(role, telegram_enabled)
  where telegram_chat_id is not null;

create index if not exists app_drivers_telegram_enabled_idx
  on public.app_drivers(telegram_enabled)
  where telegram_chat_id is not null;

create table if not exists public.app_telegram_link_tokens (
  id text primary key default ('tglt_' || encode(gen_random_bytes(16), 'hex')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  target_type text not null check (target_type in ('user', 'driver')),
  target_user_id uuid references auth.users(id) on delete cascade,
  target_driver_id text references public.app_drivers(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'user' and target_user_id is not null and target_driver_id is null)
    or (target_type = 'driver' and target_driver_id is not null and target_user_id is null)
  )
);

create index if not exists app_telegram_link_tokens_active_idx
  on public.app_telegram_link_tokens(token, expires_at)
  where used_at is null;

alter table public.app_telegram_link_tokens enable row level security;

drop policy if exists "app_telegram_link_tokens_manager_admin_select" on public.app_telegram_link_tokens;
drop policy if exists "app_telegram_link_tokens_manager_admin_insert" on public.app_telegram_link_tokens;
drop policy if exists "app_telegram_link_tokens_manager_admin_update" on public.app_telegram_link_tokens;

create policy "app_telegram_link_tokens_manager_admin_select"
on public.app_telegram_link_tokens for select
using (public.is_authenticated_user() and public.is_manager_or_admin());

create policy "app_telegram_link_tokens_manager_admin_insert"
on public.app_telegram_link_tokens for insert
with check (public.is_authenticated_user() and public.is_manager_or_admin());

create policy "app_telegram_link_tokens_manager_admin_update"
on public.app_telegram_link_tokens for update
using (public.is_authenticated_user() and public.is_manager_or_admin())
with check (public.is_authenticated_user() and public.is_manager_or_admin());

create or replace function public.create_telegram_link_token(
  p_target_type text,
  p_target_user_id uuid default null,
  p_target_driver_id text default null,
  p_ttl_minutes integer default 30
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
  new_expires_at timestamptz;
begin
  if not public.is_manager_or_admin() then
    raise exception 'Only manager/admin can create Telegram link token';
  end if;

  if p_target_type not in ('user', 'driver') then
    raise exception 'Invalid Telegram target type';
  end if;

  if p_target_type = 'user' and p_target_user_id is null then
    raise exception 'Missing target_user_id';
  end if;

  if p_target_type = 'driver' and p_target_driver_id is null then
    raise exception 'Missing target_driver_id';
  end if;

  insert into public.app_telegram_link_tokens (
    target_type,
    target_user_id,
    target_driver_id,
    expires_at,
    created_by
  )
  values (
    p_target_type,
    case when p_target_type = 'user' then p_target_user_id else null end,
    case when p_target_type = 'driver' then p_target_driver_id else null end,
    now() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes, 30), 1440))),
    auth.uid()
  )
  returning app_telegram_link_tokens.token, app_telegram_link_tokens.expires_at
  into new_token, new_expires_at;

  return query select new_token, new_expires_at;
end;
$$;

create or replace function public.connect_telegram_recipient(
  p_token text,
  p_chat_id text,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link_row public.app_telegram_link_tokens%rowtype;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null then
    raise exception 'Missing Telegram link token';
  end if;

  if nullif(trim(coalesce(p_chat_id, '')), '') is null then
    raise exception 'Missing Telegram chat id';
  end if;

  select *
  into link_row
  from public.app_telegram_link_tokens
  where token = trim(p_token)
    and used_at is null
    and expires_at > now()
  limit 1;

  if link_row.id is null then
    raise exception 'Telegram link token is invalid, used or expired';
  end if;

  if link_row.target_type = 'driver' then
    update public.app_drivers
    set
      telegram_chat_id = trim(p_chat_id),
      telegram_username = nullif(trim(coalesce(p_username, '')), ''),
      telegram_connected_at = now(),
      telegram_enabled = true,
      updated_at = now()
    where id = link_row.target_driver_id;
  else
    update public.app_user_profiles
    set
      telegram_chat_id = trim(p_chat_id),
      telegram_username = nullif(trim(coalesce(p_username, '')), ''),
      telegram_connected_at = now(),
      telegram_enabled = true,
      updated_at = now()
    where user_id = link_row.target_user_id;
  end if;

  update public.app_telegram_link_tokens
  set used_at = now()
  where id = link_row.id;

  return jsonb_build_object(
    'ok', true,
    'target_type', link_row.target_type,
    'target_user_id', link_row.target_user_id,
    'target_driver_id', link_row.target_driver_id
  );
end;
$$;

create or replace function public.disconnect_telegram_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager_or_admin() and auth.uid() <> p_target_user_id then
    raise exception 'Not allowed';
  end if;

  update public.app_user_profiles
  set
    telegram_chat_id = null,
    telegram_username = null,
    telegram_connected_at = null,
    telegram_enabled = false,
    updated_at = now()
  where user_id = p_target_user_id;
end;
$$;

create or replace function public.disconnect_telegram_driver(p_target_driver_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager_or_admin() then
    raise exception 'Not allowed';
  end if;

  update public.app_drivers
  set
    telegram_chat_id = null,
    telegram_username = null,
    telegram_connected_at = null,
    telegram_enabled = false,
    updated_at = now()
  where id = p_target_driver_id;
end;
$$;

grant execute on function public.create_telegram_link_token(text, uuid, text, integer) to authenticated, service_role;
grant execute on function public.connect_telegram_recipient(text, text, text) to service_role;
grant execute on function public.disconnect_telegram_user(uuid) to authenticated, service_role;
grant execute on function public.disconnect_telegram_driver(text) to authenticated, service_role;
