-- Add production-ready vehicle/driver master data used by final dispatch order export.

alter table public.app_drivers
  add column if not exists cccd text,
  add column if not exists bank_account text,
  add column if not exists bank_name text;

alter table public.app_vehicles
  add column if not exists fuel_type text,
  add column if not exists ownership_type text default 'company',
  add column if not exists default_driver_id text references public.app_drivers(id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists owner_cccd text,
  add column if not exists supplier_invoice_required boolean default false,
  add column if not exists supplier_company_name text,
  add column if not exists supplier_tax_code text,
  add column if not exists supplier_address text,
  add column if not exists supplier_phone text,
  add column if not exists supplier_bank_account text,
  add column if not exists supplier_bank_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_vehicles_ownership_type_check'
      and conrelid = 'public.app_vehicles'::regclass
  ) then
    alter table public.app_vehicles
      add constraint app_vehicles_ownership_type_check
      check (ownership_type in ('company', 'partner', 'rented'));
  end if;
end $$;

delete from public.app_dispatch_assignments
where vehicle_id in ('v1', 'v2', 'v3', 'v4')
   or driver_id in ('dr1', 'dr2', 'dr3', 'dr4');

update public.app_dispatch_orders
set vehicle_id = null,
    driver_id = null,
    updated_at = now()
where vehicle_id in ('v1', 'v2', 'v3', 'v4')
   or driver_id in ('dr1', 'dr2', 'dr3', 'dr4');

delete from public.app_vehicles where id in ('v1', 'v2', 'v3', 'v4');
delete from public.app_drivers where id in ('dr1', 'dr2', 'dr3', 'dr4');

insert into public.app_drivers (id, full_name, phone, cccd, status)
values
  ('drv_phung_ngoc_duc', 'Phùng Ngọc Đức', '0905296471', '048089002898', 'active'),
  ('drv_truong_huynh_truong', 'Trương Huỳnh Trường', '0905258250', '048087006371', 'active'),
  ('drv_le_phuoc_cuong', 'Lê Phước Cường', '0905900173', '049087011434', 'active'),
  ('drv_pham_huynh_thanh', 'Phạm Huỳnh Thành', '0905615648', '049083006882', 'active')
on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  cccd = excluded.cccd,
  status = excluded.status,
  updated_at = now();

insert into public.app_vehicles (
  id,
  plate_no,
  vehicle_type,
  seats,
  fuel_type,
  ownership_type,
  default_driver_id,
  owner_name,
  owner_cccd,
  supplier_invoice_required,
  supplier_company_name,
  supplier_tax_code,
  supplier_address,
  supplier_phone,
  supplier_bank_account,
  supplier_bank_name,
  status
)
values
  (
    'veh_43h34470',
    '43H34470',
    'Xe du lịch',
    16,
    'Dầu',
    'company',
    'drv_phung_ngoc_duc',
    'CÔNG TY TNHH ANGEL ONE TRAVEL',
    null,
    false,
    'CÔNG TY TNHH ANGEL ONE TRAVEL',
    '0402198423',
    'Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam',
    '0978638227',
    '282826999',
    'MB',
    'active'
  ),
  (
    'veh_43h28307',
    '43H28307',
    'Xe du lịch',
    16,
    'Dầu',
    'company',
    'drv_truong_huynh_truong',
    'CÔNG TY TNHH ANGEL ONE TRAVEL',
    null,
    false,
    'CÔNG TY TNHH ANGEL ONE TRAVEL',
    '0402198423',
    'Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam',
    '0978638227',
    '282826999',
    'MB',
    'active'
  ),
  (
    'veh_43h18875',
    '43H18875',
    'Xe điện',
    7,
    'Điện',
    'partner',
    'drv_le_phuoc_cuong',
    'Lê Phước Cường',
    '049087011434',
    true,
    'HỢP TÁC XÃ VẬN TẢI DỊCH VỤ GIA AN',
    '0402213537',
    '19 Phạm Xuân Ẩn, Phường Hòa Xuân, TP Đà Nẵng, Việt Nam',
    '0905144177',
    '494349',
    'Techcombank - Chi nhánh Đà Nẵng',
    'active'
  ),
  (
    'veh_92f00366',
    '92F00366',
    'Xe du lịch',
    16,
    'Dầu',
    'partner',
    'drv_pham_huynh_thanh',
    'Phạm Huỳnh Thành',
    '049083006882',
    true,
    'HỢP TÁC XÃ TRƯỜNG THỊNH TG',
    '1201529814',
    'Thửa đất số 2253, ấp Ngãi Thuận, Xã Châu Thành, Tỉnh Đồng Tháp, Việt Nam',
    '0908834244',
    '0281000186276',
    'Ngân hàng TMCP An Bình',
    'active'
  )
on conflict (id) do update set
  plate_no = excluded.plate_no,
  vehicle_type = excluded.vehicle_type,
  seats = excluded.seats,
  fuel_type = excluded.fuel_type,
  ownership_type = excluded.ownership_type,
  default_driver_id = excluded.default_driver_id,
  owner_name = excluded.owner_name,
  owner_cccd = excluded.owner_cccd,
  supplier_invoice_required = excluded.supplier_invoice_required,
  supplier_company_name = excluded.supplier_company_name,
  supplier_tax_code = excluded.supplier_tax_code,
  supplier_address = excluded.supplier_address,
  supplier_phone = excluded.supplier_phone,
  supplier_bank_account = excluded.supplier_bank_account,
  supplier_bank_name = excluded.supplier_bank_name,
  status = excluded.status,
  updated_at = now();
