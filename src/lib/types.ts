export type OrderStatus = "draft" | "pending_dispatch_review" | "confirmed" | "cancelled";
export type DispatchStatus =
  | "waiting_assignment"
  | "assigned"
  | "driver_accepted"
  | "in_progress"
  | "completed"
  | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type DispatchPriority = "normal" | "high" | "urgent";
export type InvoiceStatus =
  | "not_required"
  | "pending_info"
  | "ready_to_issue"
  | "issued"
  | "voided";
export type ReconciliationStatus = "open" | "reconciled" | "closed";
export type ResourceStatus = "active" | "maintenance" | "inactive" | "leave";

export interface TimeWindow {
  startAt: string;
  endAt: string;
}

export interface Assignment extends TimeWindow {
  id: string;
  dispatchOrderId: string;
  vehicleId: string;
  driverId: string;
  status: "active" | "replaced" | "cancelled";
  replaceReason?: string;
}

export interface Vehicle {
  id: string;
  plateNo: string;
  type: string;
  seats: number;
  status: ResourceStatus;
}

export interface Driver {
  id: string;
  fullName: string;
  phone: string;
  status: ResourceStatus;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
  status: "active" | "inactive";
}

export interface Company {
  id: string;
  legalName: string;
  taxCode: string;
  legalAddress?: string;
  billingEmail?: string;
  status: "active" | "inactive";
}

export interface CompanyContact {
  id: string;
  companyId: string;
  fullName: string;
  phone: string;
  email?: string;
  position?: string;
  isPrimary?: boolean;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  status: "valid" | "voided" | "refunded";
  paidAt: string;
  method: "cash" | "bank_transfer" | "card" | "other";
  reference?: string;
}

export interface DispatchOrder extends TimeWindow {
  id: string;
  code: string;
  orderDate?: string;
  customerKind: "individual" | "company";
  customerName: string;
  customerCccd?: string;
  customerAddress?: string;
  customerBankAccount?: string;
  customerBankName?: string;
  companyName?: string;
  contactName?: string;
  contactPhone: string;
  taxCode?: string;
  billingEmail?: string;
  companyAddress?: string;
  companyBankAccount?: string;
  companyBankName?: string;
  pickup: string;
  dropoff: string;
  serviceCode?: string;
  serviceLabel: string;
  serviceClarification?: string;
  unit?: string;
  salesOwner: string;
  sourceOwnerName?: string;
  source: string;
  invoiceRequired?: boolean;
  vehicleOwnership?: "company" | "rented";
  vehiclePlateNo?: string;
  driverFullName?: string;
  driverCccd?: string;
  driverPhone?: string;
  supplierOwnerName?: string;
  supplierCccd?: string;
  supplierInvoiceRequired?: boolean;
  supplierCompanyName?: string;
  supplierTaxCode?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierTotalWithVat?: number;
  supplierBankAccount?: string;
  supplierBankName?: string;
  amountDue: number;
  driverCost?: number;
  vehicleCost?: number;
  otherCost?: number;
  paymentMethod?: string;
  payer?: string;
  collectionAccountOwner?: string;
  collectionBankAccount?: string;
  collectionBankName?: string;
  quoteNote?: string;
  quoteStatus?: QuoteStatus;
  quoteSentAt?: string;
  quoteApprovedAt?: string;
  orderStatus: OrderStatus;
  dispatchStatus: DispatchStatus;
  paymentStatus: PaymentStatus;
  invoiceStatus: InvoiceStatus;
  reconciliationStatus: ReconciliationStatus;
  vehicleId?: string;
  driverId?: string;
  changedNearStart?: boolean;
  priority?: DispatchPriority;
  salesNote?: string;
  actualDriverCost?: number;
  actualVehicleCost?: number;
  actualOtherCost?: number;
  actualCostNote?: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  entityType: "dispatch_order" | "assignment" | "payment" | "invoice" | "reconciliation" | "vehicle" | "driver" | "customer" | "company" | "company_contact";
  entityId: string;
  action: string;
  reason?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  audience: "sale" | "dispatcher" | "driver" | "accountant" | "manager" | "admin";
  title: string;
  body: string;
  entityId?: string;
  createdAt: string;
  read?: boolean;
}

export interface OpsState {
  vehicles: Vehicle[];
  drivers: Driver[];
  customers: Customer[];
  companies: Company[];
  companyContacts: CompanyContact[];
  orders: DispatchOrder[];
  assignments: Assignment[];
  payments: Payment[];
  auditEvents: AuditEvent[];
  notifications?: AppNotification[];
}
