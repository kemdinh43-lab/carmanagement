drop policy if exists "app_user_profiles_update_own" on public.app_user_profiles;
drop policy if exists "app_user_profiles_update_admin" on public.app_user_profiles;

create policy "app_user_profiles_update_admin" on public.app_user_profiles
for update using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());
