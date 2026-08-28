alter table if exists public.app_notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists target_driver_id text references public.app_drivers(id) on delete cascade;

create index if not exists app_notifications_target_user_idx on public.app_notifications(target_user_id, created_at desc);
create index if not exists app_notifications_target_driver_idx on public.app_notifications(target_driver_id, created_at desc);

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

drop policy if exists "app_notifications_select" on public.app_notifications;
create policy "app_notifications_select" on public.app_notifications
for select using (
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

drop policy if exists "app_notifications_write" on public.app_notifications;
create policy "app_notifications_write" on public.app_notifications
for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
