import type { Assignment, AuditEvent, Company, CompanyContact, Customer, DispatchOrder, Driver, Payment, Vehicle } from "@/lib/types";

export const vehicles: Vehicle[] = [
  { id: "v1", plateNo: "43A-668.88", type: "Sedan", seats: 4, status: "active" },
  { id: "v2", plateNo: "43B-112.79", type: "SUV", seats: 7, status: "active" },
  { id: "v3", plateNo: "43F-901.16", type: "Van", seats: 16, status: "maintenance" },
  { id: "v4", plateNo: "43C-229.01", type: "Limousine", seats: 9, status: "active" }
];

export const drivers: Driver[] = [
  { id: "dr1", fullName: "Nguyen Van Hai", phone: "0905 111 222", status: "active" },
  { id: "dr2", fullName: "Tran Quoc Minh", phone: "0914 222 333", status: "active" },
  { id: "dr3", fullName: "Le Anh Tuan", phone: "0935 333 444", status: "leave" },
  { id: "dr4", fullName: "Pham Thanh Son", phone: "0977 444 555", status: "active" }
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
    vehicleId: "v1",
    driverId: "dr1"
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
    vehicleId: "v4",
    driverId: "dr2"
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
    vehicleId: "v1",
    driverId: "dr1",
    status: "active",
    startAt: "2026-08-25T08:00:00+07:00",
    endAt: "2026-08-25T10:00:00+07:00"
  },
  {
    id: "a2",
    dispatchOrderId: "o2",
    vehicleId: "v4",
    driverId: "dr2",
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
