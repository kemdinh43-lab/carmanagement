alter table if exists public.app_dispatch_orders
  add column if not exists priority text,
  add column if not exists sales_note text,
  add column if not exists actual_driver_cost numeric(14,2),
  add column if not exists actual_vehicle_cost numeric(14,2),
  add column if not exists actual_other_cost numeric(14,2),
  add column if not exists actual_cost_note text;
