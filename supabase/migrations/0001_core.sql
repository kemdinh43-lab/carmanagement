create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('sale', 'dispatcher', 'driver', 'accountant', 'manager', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.customer_type as enum ('individual', 'company_contact'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('draft', 'pending_dispatch_review', 'confirmed', 'cancelled'); exception when duplicate_object then null; end $$;
alter type public.order_status add value if not exists 'pending_dispatch_review';
do $$ begin create type public.dispatch_status as enum ('waiting_assignment', 'assigned', 'driver_accepted', 'in_progress', 'completed', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.assignment_status as enum ('active', 'replaced', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_record_status as enum ('valid', 'voided', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_status as enum ('not_required', 'pending_info', 'ready_to_issue', 'issued', 'voided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.reconciliation_status as enum ('open', 'reconciled', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.resource_status as enum ('active', 'maintenance', 'inactive', 'leave'); exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null default '',
  phone text,
  department text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  primary key (user_id, role)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.customer_type not null default 'individual',
  full_name text not null,
  phone text not null,
  email text,
  cccd text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text not null,
  tax_code text not null,
  legal_address text,
  billing_email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tax_code)
);

create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  position text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plate_no text not null,
  vehicle_type text not null,
  seats integer not null check (seats > 0),
  status public.resource_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, plate_no)
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text not null,
  license_no text,
  status public.resource_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  contact_id uuid references public.company_contacts(id) on delete restrict,
  sales_owner_id uuid references public.profiles(id) on delete set null,
  source_id uuid references public.lead_sources(id) on delete set null,
  status public.order_status not null default 'draft',
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  payment_status public.payment_status not null default 'unpaid',
  invoice_status public.invoice_status not null default 'not_required',
  reconciliation_status public.reconciliation_status not null default 'open',
  billing_snapshot_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (customer_id is not null or company_id is not null)
);

create table if not exists public.dispatch_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  pickup text not null,
  dropoff text not null,
  itinerary text,
  guest_count integer check (guest_count is null or guest_count > 0),
  vehicle_requirement text,
  dispatch_status public.dispatch_status not null default 'waiting_assignment',
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  trip_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (end_at > start_at)
);

create table if not exists public.dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dispatch_order_id uuid not null references public.dispatch_orders(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  status public.assignment_status not null default 'active',
  replace_reason text,
  created_at timestamptz not null default now(),
  check (valid_to > valid_from)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  paid_at timestamptz not null,
  reference text,
  status public.payment_record_status not null default 'valid',
  recorded_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete restrict,
  status public.invoice_status not null default 'pending_info',
  invoice_no text,
  issued_at timestamptz,
  billing_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  changed_fields text[],
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_snapshots (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_customers (
  id text primary key,
  full_name text not null,
  phone text not null,
  email text,
  address text,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_companies (
  id text primary key,
  legal_name text not null,
  tax_code text not null,
  legal_address text,
  billing_email text,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_company_contacts (
  id text primary key,
  company_id text not null references public.app_companies(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  position text,
  is_primary boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_vehicles (
  id text primary key,
  plate_no text not null,
  vehicle_type text not null,
  seats integer not null check (seats > 0),
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_drivers (
  id text primary key,
  full_name text not null,
  phone text not null,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_dispatch_orders (
  id text primary key,
  code text not null,
  customer_kind text not null,
  customer_name text not null,
  company_name text,
  contact_name text,
  contact_phone text not null,
  tax_code text,
  billing_email text,
  pickup text not null,
  dropoff text not null,
  service_label text not null,
  sales_owner text not null,
  source text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  amount_due numeric(14,2) not null default 0,
  driver_cost numeric(14,2),
  vehicle_cost numeric(14,2),
  other_cost numeric(14,2),
  quote_note text,
  quote_status text,
  quote_sent_at timestamptz,
  quote_approved_at timestamptz,
  order_status text not null,
  dispatch_status text not null,
  payment_status text not null,
  invoice_status text not null,
  reconciliation_status text not null,
  vehicle_id text references public.app_vehicles(id) on delete set null,
  driver_id text references public.app_drivers(id) on delete set null,
  changed_near_start boolean,
  priority text,
  sales_note text,
  actual_driver_cost numeric(14,2),
  actual_vehicle_cost numeric(14,2),
  actual_other_cost numeric(14,2),
  actual_cost_note text,
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.app_dispatch_assignments (
  id text primary key,
  dispatch_order_id text not null references public.app_dispatch_orders(id) on delete cascade,
  vehicle_id text not null references public.app_vehicles(id) on delete restrict,
  driver_id text not null references public.app_drivers(id) on delete restrict,
  status text not null default 'active',
  start_at timestamptz not null,
  end_at timestamptz not null,
  replace_reason text,
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.app_payments (
  id text primary key,
  order_id text not null references public.app_dispatch_orders(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  status text not null,
  paid_at timestamptz not null,
  method text not null,
  reference text,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_audit_events (
  id text primary key,
  actor text not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'sale',
  driver_id text references public.app_drivers(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_orders_org_status_start_idx on public.dispatch_orders(organization_id, dispatch_status, start_at);
create index if not exists dispatch_assignments_vehicle_active_idx on public.dispatch_assignments(vehicle_id, valid_from, valid_to) where status = 'active';
create index if not exists dispatch_assignments_driver_active_idx on public.dispatch_assignments(driver_id, valid_from, valid_to) where status = 'active';
create index if not exists payments_order_status_idx on public.payments(service_order_id, status);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists customers_updated on public.customers;
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists companies_updated on public.companies;
create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists company_contacts_updated on public.company_contacts;
create trigger company_contacts_updated before update on public.company_contacts for each row execute function public.set_updated_at();
drop trigger if exists vehicles_updated on public.vehicles;
create trigger vehicles_updated before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists drivers_updated on public.drivers;
create trigger drivers_updated before update on public.drivers for each row execute function public.set_updated_at();
drop trigger if exists service_orders_updated on public.service_orders;
create trigger service_orders_updated before update on public.service_orders for each row execute function public.set_updated_at();
drop trigger if exists dispatch_orders_updated on public.dispatch_orders;
create trigger dispatch_orders_updated before update on public.dispatch_orders for each row execute function public.set_updated_at();
drop trigger if exists invoices_updated on public.invoices;
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();
drop trigger if exists ops_snapshots_updated on public.ops_snapshots;
create trigger ops_snapshots_updated before update on public.ops_snapshots for each row execute function public.set_updated_at();
drop trigger if exists app_customers_updated on public.app_customers;
create trigger app_customers_updated before update on public.app_customers for each row execute function public.set_updated_at();
drop trigger if exists app_companies_updated on public.app_companies;
create trigger app_companies_updated before update on public.app_companies for each row execute function public.set_updated_at();
drop trigger if exists app_company_contacts_updated on public.app_company_contacts;
create trigger app_company_contacts_updated before update on public.app_company_contacts for each row execute function public.set_updated_at();
drop trigger if exists app_vehicles_updated on public.app_vehicles;
create trigger app_vehicles_updated before update on public.app_vehicles for each row execute function public.set_updated_at();
drop trigger if exists app_drivers_updated on public.app_drivers;
create trigger app_drivers_updated before update on public.app_drivers for each row execute function public.set_updated_at();
drop trigger if exists app_dispatch_orders_updated on public.app_dispatch_orders;
create trigger app_dispatch_orders_updated before update on public.app_dispatch_orders for each row execute function public.set_updated_at();
drop trigger if exists app_dispatch_assignments_updated on public.app_dispatch_assignments;
create trigger app_dispatch_assignments_updated before update on public.app_dispatch_assignments for each row execute function public.set_updated_at();
drop trigger if exists app_payments_updated on public.app_payments;
create trigger app_payments_updated before update on public.app_payments for each row execute function public.set_updated_at();
drop trigger if exists app_audit_events_updated on public.app_audit_events;
create trigger app_audit_events_updated before update on public.app_audit_events for each row execute function public.set_updated_at();

create or replace function public.has_assignment_conflict(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_ignore_assignment_id uuid default null
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.dispatch_assignments da
    where da.status = 'active'
      and (p_ignore_assignment_id is null or da.id <> p_ignore_assignment_id)
      and (da.vehicle_id = p_vehicle_id or da.driver_id = p_driver_id)
      and p_start_at < da.valid_to
      and p_end_at > da.valid_from
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customers enable row level security;
alter table public.companies enable row level security;
alter table public.company_contacts enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.lead_sources enable row level security;
alter table public.service_orders enable row level security;
alter table public.dispatch_orders enable row level security;
alter table public.dispatch_assignments enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ops_snapshots enable row level security;
alter table public.app_customers enable row level security;
alter table public.app_companies enable row level security;
alter table public.app_company_contacts enable row level security;
alter table public.app_vehicles enable row level security;
alter table public.app_drivers enable row level security;
alter table public.app_dispatch_orders enable row level security;
alter table public.app_dispatch_assignments enable row level security;
alter table public.app_payments enable row level security;
alter table public.app_audit_events enable row level security;
alter table public.app_user_profiles enable row level security;

drop policy if exists "ops_snapshots_select" on public.ops_snapshots;
create policy "ops_snapshots_select" on public.ops_snapshots for select using (true);
drop policy if exists "ops_snapshots_insert" on public.ops_snapshots;
create policy "ops_snapshots_insert" on public.ops_snapshots for insert with check (true);
drop policy if exists "ops_snapshots_update" on public.ops_snapshots;
create policy "ops_snapshots_update" on public.ops_snapshots for update using (true) with check (true);

drop policy if exists "app_customers_all" on public.app_customers;
create policy "app_customers_all" on public.app_customers for all using (true) with check (true);
drop policy if exists "app_companies_all" on public.app_companies;
create policy "app_companies_all" on public.app_companies for all using (true) with check (true);
drop policy if exists "app_company_contacts_all" on public.app_company_contacts;
create policy "app_company_contacts_all" on public.app_company_contacts for all using (true) with check (true);
drop policy if exists "app_vehicles_all" on public.app_vehicles;
create policy "app_vehicles_all" on public.app_vehicles for all using (true) with check (true);
drop policy if exists "app_drivers_all" on public.app_drivers;
create policy "app_drivers_all" on public.app_drivers for all using (true) with check (true);
drop policy if exists "app_dispatch_orders_all" on public.app_dispatch_orders;
create policy "app_dispatch_orders_all" on public.app_dispatch_orders for all using (true) with check (true);
drop policy if exists "app_dispatch_assignments_all" on public.app_dispatch_assignments;
create policy "app_dispatch_assignments_all" on public.app_dispatch_assignments for all using (true) with check (true);
drop policy if exists "app_payments_all" on public.app_payments;
create policy "app_payments_all" on public.app_payments for all using (true) with check (true);
drop policy if exists "app_audit_events_all" on public.app_audit_events;
create policy "app_audit_events_all" on public.app_audit_events for all using (true) with check (true);
drop policy if exists "app_user_profiles_all" on public.app_user_profiles;
create policy "app_user_profiles_all" on public.app_user_profiles for all using (true) with check (true);
