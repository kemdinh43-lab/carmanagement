import type { Assignment, AuditEvent, Company, CompanyContact, Customer, DispatchOrder, Driver, Payment, Vehicle } from "@/lib/types";

export const vehicles: Vehicle[] = [
  {
    id: "veh_43h34470",
    plateNo: "43H34470",
    type: "Xe du lịch",
    seats: 16,
    fuelType: "Dầu",
    ownershipType: "company",
    defaultDriverId: "drv_phung_ngoc_duc",
    ownerName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
    supplierCompanyName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
    supplierTaxCode: "0402198423",
    supplierAddress: "Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam",
    supplierPhone: "0978638227",
    supplierBankAccount: "282826999",
    supplierBankName: "MB",
    status: "active"
  },
  {
    id: "veh_43h28307",
    plateNo: "43H28307",
    type: "Xe du lịch",
    seats: 16,
    fuelType: "Dầu",
    ownershipType: "company",
    defaultDriverId: "drv_truong_huynh_truong",
    ownerName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
    supplierCompanyName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
    supplierTaxCode: "0402198423",
    supplierAddress: "Số 111/3 Nguyễn Công Trứ, Phường An Hải, TP Đà Nẵng, Việt Nam",
    supplierPhone: "0978638227",
    supplierBankAccount: "282826999",
    supplierBankName: "MB",
    status: "active"
  },
  {
    id: "veh_43h18875",
    plateNo: "43H18875",
    type: "Xe điện",
    seats: 7,
    fuelType: "Điện",
    ownershipType: "partner",
    defaultDriverId: "drv_le_phuoc_cuong",
    ownerName: "Lê Phước Cường",
    ownerCccd: "049087011434",
    supplierInvoiceRequired: true,
    supplierCompanyName: "HỢP TÁC XÃ VẬN TẢI DỊCH VỤ GIA AN",
    supplierTaxCode: "0402213537",
    supplierAddress: "19 Phạm Xuân Ẩn, Phường Hòa Xuân, TP Đà Nẵng, Việt Nam",
    supplierPhone: "0905144177",
    supplierBankAccount: "494349",
    supplierBankName: "Techcombank - Chi nhánh Đà Nẵng",
    status: "active"
  },
  {
    id: "veh_92f00366",
    plateNo: "92F00366",
    type: "Xe du lịch",
    seats: 16,
    fuelType: "Dầu",
    ownershipType: "partner",
    defaultDriverId: "drv_pham_huynh_thanh",
    ownerName: "Phạm Huỳnh Thành",
    ownerCccd: "049083006882",
    supplierInvoiceRequired: true,
    supplierCompanyName: "HỢP TÁC XÃ TRƯỜNG THỊNH TG",
    supplierTaxCode: "1201529814",
    supplierAddress: "Thửa đất số 2253, ấp Ngãi Thuận, Xã Châu Thành, Tỉnh Đồng Tháp, Việt Nam",
    supplierPhone: "0908834244",
    supplierBankAccount: "0281000186276",
    supplierBankName: "Ngân hàng TMCP An Bình",
    status: "active"
  }
];

export const drivers: Driver[] = [
  { id: "drv_phung_ngoc_duc", fullName: "Phùng Ngọc Đức", phone: "0905296471", cccd: "048089002898", status: "active" },
  { id: "drv_truong_huynh_truong", fullName: "Trương Huỳnh Trường", phone: "0905258250", cccd: "048087006371", status: "active" },
  { id: "drv_le_phuoc_cuong", fullName: "Lê Phước Cường", phone: "0905900173", cccd: "049087011434", status: "active" },
  { id: "drv_pham_huynh_thanh", fullName: "Phạm Huỳnh Thành", phone: "0905615648", cccd: "049083006882", status: "active" }
];

export const customers: Customer[] = [
  { id: "c1", fullName: "Ms. Linh", phone: "0901 234 567", email: "linh@example.com", address: "Da Nang", status: "active" },
  { id: "c2", fullName: "Mr. Khoa", phone: "0988 000 111", email: "khoa@example.com", address: "Hoi An", status: "active" },
  { id: "c3", fullName: "Ms. Trang", phone: "0933 222 100", status: "active" }
];

export const companies: Company[] = [
  { id: "co1", legalName: "ABC Holdings JSC", taxCode: "0401234567", legalAddress: "Da Nang", billingEmail: "invoice@abcholdings.vn", status: "active" }
];

export const companyContacts: CompanyContact[] = [
  { id: "cc1", companyId: "co1", fullName: "Ms. Huong - HCNS", phone: "0912 888 999", email: "huong@abcholdings.vn", position: "HCNS", isPrimary: true }
];

export const orders: DispatchOrder[] = [
  {
    id: "o1",
    code: "AOT-260825-0001",
    customerKind: "individual",
    customerName: "Ms. Linh",
    contactPhone: "0901 234 567",
    pickup: "Da Nang Airport",
    dropoff: "Four Seasons Nam Hai",
    serviceLabel: "Airport transfer",
    salesOwner: "Sale A",
    source: "Website",
    startAt: "2026-08-25T08:00:00+07:00",
    endAt: "2026-08-25T10:00:00+07:00",
    amountDue: 850000,
    driverCost: 250000,
    vehicleCost: 180000,
    otherCost: 50000,
    quoteNote: "Airport pickup, chờ miễn phí 30 phút.",
    quoteStatus: "approved",
    quoteSentAt: "2026-08-24T15:00:00+07:00",
    quoteApprovedAt: "2026-08-24T15:12:00+07:00",
    orderStatus: "confirmed",
    dispatchStatus: "completed",
    paymentStatus: "paid",
    invoiceStatus: "not_required",
    reconciliationStatus: "reconciled",
    vehicleId: "veh_43h34470",
    driverId: "drv_phung_ngoc_duc"
  },
  {
    id: "o2",
    code: "AOT-260825-0002",
    customerKind: "company",
    customerName: "ABC Holdings JSC",
    companyName: "ABC Holdings JSC",
    contactName: "Ms. Huong - HCNS",
    contactPhone: "0912 888 999",
    taxCode: "0401234567",
    billingEmail: "invoice@abcholdings.vn",
    pickup: "Hyatt Regency Da Nang",
    dropoff: "Ba Na Hills",
    serviceLabel: "Corporate day trip",
    salesOwner: "Sale B",
    source: "Referral",
    startAt: "2026-08-25T13:00:00+07:00",
    endAt: "2026-08-25T19:00:00+07:00",
    amountDue: 4200000,
    driverCost: 900000,
    vehicleCost: 1200000,
    otherCost: 300000,
    quoteNote: "Bao gồm phí cầu đường dự kiến.",
    quoteStatus: "approved",
    quoteSentAt: "2026-08-24T11:15:00+07:00",
    quoteApprovedAt: "2026-08-24T13:40:00+07:00",
    orderStatus: "pending_dispatch_review",
    dispatchStatus: "assigned",
    paymentStatus: "partial",
    invoiceStatus: "ready_to_issue",
    reconciliationStatus: "open",
    vehicleId: "veh_43h28307",
    driverId: "drv_truong_huynh_truong"
  },
  {
    id: "o3",
    code: "AOT-260825-0003",
    customerKind: "individual",
    customerName: "Mr. Khoa",
    contactPhone: "0988 000 111",
    pickup: "InterContinental Da Nang",
    dropoff: "Hoi An Ancient Town",
    serviceLabel: "Evening transfer",
    salesOwner: "Sale A",
    source: "Old customer",
    startAt: "2026-08-25T17:30:00+07:00",
    endAt: "2026-08-25T22:00:00+07:00",
    amountDue: 1650000,
    driverCost: 450000,
    vehicleCost: 450000,
    otherCost: 100000,
    quoteStatus: "sent",
    quoteSentAt: "2026-08-25T09:10:00+07:00",
    orderStatus: "confirmed",
    dispatchStatus: "waiting_assignment",
    paymentStatus: "unpaid",
    invoiceStatus: "pending_info",
    reconciliationStatus: "open",
    changedNearStart: true,
    priority: "high",
    salesNote: "Khách quen, cần xác nhận xe sớm."
  },
  {
    id: "o4",
    code: "AOT-260825-0004",
    customerKind: "individual",
    customerName: "Ms. Trang",
    contactPhone: "0933 222 100",
    pickup: "Da Nang",
    dropoff: "Hue",
    serviceLabel: "Intercity private car",
    salesOwner: "Sale C",
    source: "Google Ads",
    startAt: "2026-08-26T07:00:00+07:00",
    endAt: "2026-08-26T12:00:00+07:00",
    amountDue: 2600000,
    driverCost: 650000,
    vehicleCost: 750000,
    otherCost: 180000,
    quoteStatus: "draft",
    orderStatus: "pending_dispatch_review",
    dispatchStatus: "waiting_assignment",
    paymentStatus: "unpaid",
    invoiceStatus: "not_required",
    reconciliationStatus: "open",
    priority: "normal",
    salesNote: "Lead mới từ quảng cáo."
  }
];

export const assignments: Assignment[] = [
  {
    id: "a1",
    dispatchOrderId: "o1",
    vehicleId: "veh_43h34470",
    driverId: "drv_phung_ngoc_duc",
    status: "active",
    startAt: "2026-08-25T08:00:00+07:00",
    endAt: "2026-08-25T10:00:00+07:00"
  },
  {
    id: "a2",
    dispatchOrderId: "o2",
    vehicleId: "veh_43h28307",
    driverId: "drv_truong_huynh_truong",
    status: "active",
    startAt: "2026-08-25T13:00:00+07:00",
    endAt: "2026-08-25T19:00:00+07:00"
  }
];

export const payments: Payment[] = [
  { id: "p1", orderId: "o1", amount: 850000, status: "valid", paidAt: "2026-08-25T10:30:00+07:00", method: "cash" },
  { id: "p2", orderId: "o2", amount: 1200000, status: "valid", paidAt: "2026-08-25T09:30:00+07:00", method: "bank_transfer" }
];

export const auditEvents: AuditEvent[] = [
  {
    id: "e1",
    actor: "System seed",
    entityType: "dispatch_order",
    entityId: "o1",
    action: "created",
    createdAt: "2026-08-25T07:00:00+07:00"
  },
  {
    id: "e2",
    actor: "Dispatcher",
    entityType: "assignment",
    entityId: "a2",
    action: "assigned_vehicle_driver",
    reason: "Corporate day trip confirmed",
    createdAt: "2026-08-25T09:05:00+07:00"
  }
];

export const initialOpsState = {
  vehicles,
  drivers,
  customers,
  companies,
  companyContacts,
  orders,
  assignments,
  payments,
  auditEvents
};
