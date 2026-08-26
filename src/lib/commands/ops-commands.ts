import type {
  Assignment,
  AuditEvent,
  Company,
  CompanyContact,
  Customer,
  DispatchOrder,
  DispatchPriority,
  DispatchStatus,
  Driver,
  InvoiceStatus,
  OpsState,
  Payment,
  QuoteStatus,
  Vehicle
} from "@/lib/types";
import { can, type AppRole, type PermissionAction } from "@/lib/permissions";

export type OpsCommand =
  | "order.submit_proposal"
  | "order.update_quote"
  | "dispatch.assign_vehicle_driver"
  | "dispatch.review_proposal"
  | "dispatch.update_status"
  | "order.update_details"
  | "order.cancel"
  | "finance.update_actual_costs"
  | "finance.record_payment"
  | "finance.update_invoice"
  | "finance.close_order"
  | "master.create_vehicle"
  | "master.create_driver"
  | "customer.create"
  | "company.create";

export type AuditFactory = (event: Omit<AuditEvent, "id" | "createdAt">) => AuditEvent;

export interface CommandMeta {
  permission: PermissionAction;
  rpcName: string;
}

export const commandCatalog: Record<OpsCommand, CommandMeta> = {
  "order.submit_proposal": { permission: "create_order", rpcName: "submit_dispatch_proposal" },
  "order.update_quote": { permission: "create_order", rpcName: "update_dispatch_quote" },
  "dispatch.assign_vehicle_driver": { permission: "assign_vehicle", rpcName: "assign_vehicle_driver" },
  "dispatch.review_proposal": { permission: "assign_vehicle", rpcName: "review_dispatch_proposal" },
  "dispatch.update_status": { permission: "update_dispatch_status", rpcName: "update_dispatch_status" },
  "order.update_details": { permission: "create_order", rpcName: "update_dispatch_order" },
  "order.cancel": { permission: "create_order", rpcName: "cancel_dispatch_order" },
  "finance.update_actual_costs": { permission: "record_payment", rpcName: "update_actual_costs" },
  "finance.record_payment": { permission: "record_payment", rpcName: "record_payment" },
  "finance.update_invoice": { permission: "update_invoice", rpcName: "update_invoice" },
  "finance.close_order": { permission: "close_order", rpcName: "close_order" },
  "master.create_vehicle": { permission: "manage_master_data", rpcName: "create_vehicle" },
  "master.create_driver": { permission: "manage_master_data", rpcName: "create_driver" },
  "customer.create": { permission: "create_order", rpcName: "create_customer" },
  "company.create": { permission: "create_order", rpcName: "create_company" }
};

export function canRunCommand(role: AppRole, command: OpsCommand) {
  return can(role, commandCatalog[command].permission);
}

export function submitDispatchProposal(state: OpsState, order: DispatchOrder, audit: AuditFactory): OpsState {
  return {
    ...state,
    orders: [order, ...state.orders],
    auditEvents: [audit({ actor: "Sale", entityType: "dispatch_order", entityId: order.id, action: "submitted_dispatch_proposal", reason: "Sale submitted proposal for dispatcher review" }), ...state.auditEvents]
  };
}

export function updateQuoteStatus(state: OpsState, orderId: string, nextStatus: QuoteStatus, audit: AuditFactory): OpsState {
  const now = new Date().toISOString();
  return {
    ...state,
    orders: state.orders.map((order) => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        quoteStatus: nextStatus,
        quoteSentAt: nextStatus === "sent" ? now : order.quoteSentAt,
        quoteApprovedAt: nextStatus === "approved" ? now : order.quoteApprovedAt,
        orderStatus: nextStatus === "rejected" ? "cancelled" : order.orderStatus,
        dispatchStatus: nextStatus === "rejected" ? "cancelled" : order.dispatchStatus
      };
    }),
    auditEvents: [audit({ actor: "Sale", entityType: "dispatch_order", entityId: orderId, action: "updated_quote_status", reason: nextStatus }), ...state.auditEvents]
  };
}

export function assignVehicleDriver(
  state: OpsState,
  selectedOrderId: string,
  assignment: Assignment,
  replacingAssignmentId: string | undefined,
  reason: string,
  audit: AuditFactory,
  includeAudit = true
): OpsState {
  return {
    ...state,
    assignments: [
      assignment,
      ...state.assignments.map((item) => (item.id === replacingAssignmentId ? { ...item, status: "replaced" as const, replaceReason: reason } : item))
    ],
    orders: state.orders.map((order) =>
      order.id === selectedOrderId ? { ...order, vehicleId: assignment.vehicleId, driverId: assignment.driverId, dispatchStatus: "assigned", changedNearStart: replacingAssignmentId ? true : order.changedNearStart } : order
    ),
    auditEvents: includeAudit
      ? [audit({ actor: "Dispatcher", entityType: "assignment", entityId: assignment.id, action: replacingAssignmentId ? "replaced_assignment" : "assigned_vehicle_driver", reason }), ...state.auditEvents]
      : state.auditEvents
  };
}

export function reviewDispatchProposal(
  state: OpsState,
  orderId: string,
  decision: "approved" | "rejected",
  reason: string,
  audit: AuditFactory,
  includeAudit = true
): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        orderStatus: decision === "approved" ? "confirmed" : "cancelled",
        dispatchStatus: decision === "approved" ? "waiting_assignment" : "cancelled"
      };
    }),
    auditEvents: includeAudit
      ? [
          audit({
            actor: "Dispatcher",
            entityType: "dispatch_order",
            entityId: orderId,
            action: decision === "approved" ? "approved_dispatch_proposal" : "rejected_dispatch_proposal",
            reason
          }),
          ...state.auditEvents
        ]
      : state.auditEvents
  };
}

export function updateDispatchStatus(
  state: OpsState,
  orderId: string,
  nextStatus: DispatchStatus,
  reason: string,
  actor: string,
  audit: AuditFactory
): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, dispatchStatus: nextStatus } : order)),
    auditEvents: [audit({ actor, entityType: "dispatch_order", entityId: orderId, action: `status_${nextStatus}`, reason }), ...state.auditEvents]
  };
}

export function updateOrderDetails(
  state: OpsState,
  orderId: string,
  patch: {
    customerName: string;
    contactName?: string;
    contactPhone: string;
    pickup: string;
    dropoff: string;
    serviceLabel: string;
    startAt: string;
    endAt: string;
    amountDue: number;
    driverCost: number;
    vehicleCost: number;
    otherCost: number;
    quoteNote?: string;
    priority: DispatchPriority;
    salesNote?: string;
  },
  activeAssignmentId: string | undefined,
  replacementReason: string,
  audit: AuditFactory
): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            ...patch,
            changedNearStart: order.startAt !== patch.startAt || order.endAt !== patch.endAt ? true : order.changedNearStart
          }
        : order
    ),
    assignments: state.assignments.map((assignment) =>
      assignment.id === activeAssignmentId ? { ...assignment, startAt: patch.startAt, endAt: patch.endAt, replaceReason: replacementReason } : assignment
    ),
    auditEvents: [audit({ actor: "Dispatcher", entityType: "dispatch_order", entityId: orderId, action: "updated_order", reason: replacementReason }), ...state.auditEvents]
  };
}

export function cancelOrder(state: OpsState, orderId: string, reason: string, actor: string, audit: AuditFactory): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, orderStatus: "cancelled", dispatchStatus: "cancelled" } : order)),
    assignments: state.assignments.map((assignment) =>
      assignment.dispatchOrderId === orderId && assignment.status === "active" ? { ...assignment, status: "cancelled" as const, replaceReason: reason } : assignment
    ),
    auditEvents: [audit({ actor, entityType: "dispatch_order", entityId: orderId, action: "cancelled_order", reason }), ...state.auditEvents]
  };
}

export function updateActualCosts(
  state: OpsState,
  orderId: string,
  patch: { actualDriverCost: number; actualVehicleCost: number; actualOtherCost: number; actualCostNote?: string },
  audit: AuditFactory
): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
    auditEvents: [
      audit({ actor: "Accountant", entityType: "dispatch_order", entityId: orderId, action: "updated_actual_costs", reason: `${patch.actualDriverCost + patch.actualVehicleCost + patch.actualOtherCost}` }),
      ...state.auditEvents
    ]
  };
}

export function recordPayment(state: OpsState, payment: Payment, orderId: string, paymentStatus: DispatchOrder["paymentStatus"], audit: AuditFactory): OpsState {
  return {
    ...state,
    payments: [payment, ...state.payments],
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, paymentStatus } : order)),
    auditEvents: [audit({ actor: "Accountant", entityType: "payment", entityId: payment.id, action: "recorded_payment", reason: String(payment.amount) }), ...state.auditEvents]
  };
}

export function updateInvoiceStatus(state: OpsState, orderId: string, nextStatus: InvoiceStatus, audit: AuditFactory): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, invoiceStatus: nextStatus } : order)),
    auditEvents: [audit({ actor: "Accountant", entityType: "invoice", entityId: orderId, action: `invoice_${nextStatus}` }), ...state.auditEvents]
  };
}

export function closeOrder(state: OpsState, orderId: string, audit: AuditFactory): OpsState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, reconciliationStatus: "closed" } : order)),
    auditEvents: [audit({ actor: "Accountant", entityType: "reconciliation", entityId: orderId, action: "closed_order" }), ...state.auditEvents]
  };
}

export function createVehicle(state: OpsState, vehicle: Vehicle, audit: AuditFactory): OpsState {
  return {
    ...state,
    vehicles: [vehicle, ...state.vehicles],
    auditEvents: [audit({ actor: "Admin", entityType: "vehicle", entityId: vehicle.id, action: "created_vehicle", reason: vehicle.plateNo }), ...state.auditEvents]
  };
}

export function createDriver(state: OpsState, driver: Driver, audit: AuditFactory): OpsState {
  return {
    ...state,
    drivers: [driver, ...state.drivers],
    auditEvents: [audit({ actor: "Admin", entityType: "driver", entityId: driver.id, action: "created_driver", reason: driver.fullName }), ...state.auditEvents]
  };
}

export function createCustomer(state: OpsState, customer: Customer, audit: AuditFactory): OpsState {
  return {
    ...state,
    customers: [customer, ...state.customers],
    auditEvents: [audit({ actor: "Sale", entityType: "customer", entityId: customer.id, action: "created_customer", reason: customer.phone }), ...state.auditEvents]
  };
}

export function createCompany(state: OpsState, company: Company, contact: CompanyContact, audit: AuditFactory): OpsState {
  return {
    ...state,
    companies: [company, ...state.companies],
    companyContacts: [contact, ...state.companyContacts],
    auditEvents: [
      audit({ actor: "Sale", entityType: "company", entityId: company.id, action: "created_company", reason: company.taxCode }),
      audit({ actor: "Sale", entityType: "company_contact", entityId: contact.id, action: "created_company_contact", reason: contact.phone }),
      ...state.auditEvents
    ]
  };
}
