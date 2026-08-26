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

create or replace function public.is_authenticated_user()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('manager', 'admin')
$$;

drop policy if exists "ops_snapshots_select" on public.ops_snapshots;
create policy "ops_snapshots_select" on public.ops_snapshots for select using (public.is_authenticated_user());
drop policy if exists "ops_snapshots_insert" on public.ops_snapshots;
create policy "ops_snapshots_insert" on public.ops_snapshots for insert with check (public.is_authenticated_user());
drop policy if exists "ops_snapshots_update" on public.ops_snapshots;
create policy "ops_snapshots_update" on public.ops_snapshots for update using (public.is_authenticated_user()) with check (public.is_authenticated_user());

drop policy if exists "app_customers_all" on public.app_customers;
create policy "app_customers_all" on public.app_customers for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_companies_all" on public.app_companies;
create policy "app_companies_all" on public.app_companies for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_company_contacts_all" on public.app_company_contacts;
create policy "app_company_contacts_all" on public.app_company_contacts for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_vehicles_all" on public.app_vehicles;
create policy "app_vehicles_all" on public.app_vehicles for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_drivers_all" on public.app_drivers;
create policy "app_drivers_all" on public.app_drivers for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_dispatch_orders_all" on public.app_dispatch_orders;
create policy "app_dispatch_orders_all" on public.app_dispatch_orders for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_dispatch_assignments_all" on public.app_dispatch_assignments;
create policy "app_dispatch_assignments_all" on public.app_dispatch_assignments for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_payments_all" on public.app_payments;
create policy "app_payments_all" on public.app_payments for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
drop policy if exists "app_audit_events_all" on public.app_audit_events;
create policy "app_audit_events_all" on public.app_audit_events for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());

drop policy if exists "app_user_profiles_all" on public.app_user_profiles;
drop policy if exists "app_user_profiles_select_own" on public.app_user_profiles;
drop policy if exists "app_user_profiles_insert_own" on public.app_user_profiles;
drop policy if exists "app_user_profiles_update_own" on public.app_user_profiles;
drop policy if exists "app_user_profiles_manager_admin" on public.app_user_profiles;
create policy "app_user_profiles_select_own" on public.app_user_profiles for select using (auth.uid() = user_id or public.is_manager_or_admin());
create policy "app_user_profiles_insert_own" on public.app_user_profiles for insert with check (auth.uid() = user_id);
create policy "app_user_profiles_update_own" on public.app_user_profiles
for update using (auth.uid() = user_id or public.is_manager_or_admin())
with check (
  public.is_manager_or_admin()
  or (
    auth.uid() = user_id
    and role = (
      select p.role
      from public.app_user_profiles p
      where p.user_id = auth.uid()
      limit 1
    )
  )
);

drop policy if exists "app_notifications_all" on public.app_notifications;
drop policy if exists "app_notifications_select" on public.app_notifications;
drop policy if exists "app_notifications_write" on public.app_notifications;
create policy "app_notifications_select" on public.app_notifications
for select using (
  public.is_authenticated_user()
  and (
    audience = public.current_app_role()
    or audience = 'admin'
    or public.is_manager_or_admin()
  )
);
create policy "app_notifications_write" on public.app_notifications
for all using (public.is_authenticated_user()) with check (public.is_authenticated_user());
