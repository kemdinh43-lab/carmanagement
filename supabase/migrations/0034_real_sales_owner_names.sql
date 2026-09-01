update public.app_dispatch_orders
set sales_owner = case sales_owner
  when 'Sale A' then 'Phan Thị Bích Hà'
  when 'Sale B' then 'Đặng Thị Hồng Tiên'
  when 'Sale C' then 'Lê Hoàn Nin Hy'
  else sales_owner
end,
updated_at = now()
where sales_owner in ('Sale A', 'Sale B', 'Sale C');
