import { initialOpsState } from "@/data/demo";
import { hasSupabaseBrowserConfig } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Assignment, AuditEvent, Company, CompanyContact, Customer, DispatchOrder, Driver, OpsState, Payment, Vehicle } from "@/lib/types";

type AppTable =
  | "app_audit_events"
  | "app_companies"
  | "app_company_contacts"
  | "app_customers"
  | "app_dispatch_assignments"
  | "app_dispatch_orders"
  | "app_drivers"
  | "app_payments"
  | "app_vehicles";

type QueryResult<T> = Promise<{ data: T[] | null; error: { message: string; code?: string } | null }>;
type MutationResult = Promise<{ error: { message: string; code?: string } | null }>;
type SupabaseTableClient = {
  from(table: AppTable): {
    select(columns?: string): { order(column: string, options?: { ascending?: boolean }): QueryResult<Record<string, unknown>> } & QueryResult<Record<string, unknown>>;
    delete(): { neq(column: string, value: string): MutationResult };
    upsert(values: Record<string, unknown>[]): MutationResult;
  };
};
type SnapshotClient = {
  from(table: "ops_snapshots"): {
    select(columns: "state"): { eq(column: "id", value: string): { maybeSingle(): Promise<{ data: { state: unknown } | null; error: { message: string } | null }> } };
    upsert(value: { id: string; state: unknown }): MutationResult;
  };
};

export interface OpsRepository {
  load(): Promise<OpsState>;
  save(state: OpsState, previousState?: OpsState): Promise<void>;
  readonly mode: "local" | "supabase";
}

export class LocalStorageOpsRepository implements OpsRepository {
  readonly mode = "local" as const;

  constructor(private readonly key: string) {}

  async load() {
    const saved = window.localStorage.getItem(this.key);
    if (!saved) return initialOpsState;
    return JSON.parse(saved) as OpsState;
  }

  async save(state: OpsState) {
    window.localStorage.setItem(this.key, JSON.stringify(state));
  }
}

export class SupabaseOpsRepository implements OpsRepository {
  readonly mode = "supabase" as const;

  async load() {
    const supabase = createSupabaseBrowserClient() as unknown as SupabaseTableClient;
    try {
      const snapshotState = await loadSnapshotState();
      if (snapshotState) return snapshotState;
    } catch (error) {
      if (!isMissingRelationalSchema(error)) throw error;
    }

    let rows: Awaited<ReturnType<typeof selectTable>>[];
    try {
      rows = await Promise.all([
        selectTable(supabase, "app_customers"),
        selectTable(supabase, "app_companies"),
        selectTable(supabase, "app_company_contacts"),
        selectTable(supabase, "app_vehicles"),
        selectTable(supabase, "app_drivers"),
        selectTable(supabase, "app_dispatch_orders"),
        selectTable(supabase, "app_dispatch_assignments"),
        selectTable(supabase, "app_payments"),
        selectTable(supabase, "app_audit_events")
      ]);
    } catch (error) {
      if (isMissingRelationalSchema(error)) return loadSnapshotFallback();
      throw error;
    }

    const [customers, companies, companyContacts, vehicles, drivers, orders, assignments, payments, auditEvents] = rows;
    const hasNoRelationalData = customers.length + companies.length + vehicles.length + drivers.length + orders.length === 0;
    if (hasNoRelationalData) {
      const snapshotState = await loadSnapshotFallback().catch(() => initialOpsState);
      await this.save(snapshotState);
      return snapshotState;
    }

    return {
      customers: customers.map(toCustomer),
      companies: companies.map(toCompany),
      companyContacts: companyContacts.map(toCompanyContact),
      vehicles: vehicles.map(toVehicle),
      drivers: drivers.map(toDriver),
      orders: orders.map(toOrder),
      assignments: assignments.map(toAssignment),
      payments: payments.map(toPayment),
      auditEvents: auditEvents.map(toAuditEvent)
    };
  }

  async save(state: OpsState, previousState?: OpsState) {
    const supabase = createSupabaseBrowserClient() as unknown as SupabaseTableClient;
    try {
      const nextTables = snapshotTables(state);
      const previousTables = previousState ? snapshotTables(previousState) : null;
      const changedTables = new Set<AppTable>();
      for (const [table, rows] of Object.entries(nextTables) as Array<[AppTable, Record<string, unknown>[]]>) {
        const previousRows = previousTables?.[table];
        if (!previousRows || !sameJson(previousRows, rows)) changedTables.add(table);
      }
      await replaceChangedTables(supabase, nextTables, expandChangedTables(changedTables));
    } catch (error) {
      if (!isMissingRelationalSchema(error)) {
        console.warn("Supabase relational save failed, falling back to snapshot.", error);
      }
    }
    await saveSnapshotState(state);
  }
}

export function createOpsRepository(key: string): OpsRepository {
  if (hasSupabaseBrowserConfig()) return new SupabaseOpsRepository();
  return new LocalStorageOpsRepository(key);
}

async function selectTable(supabase: SupabaseTableClient, table: AppTable) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function isMissingRelationalSchema(error: unknown) {
  return error instanceof Error && (error.message.includes("Could not find the table") || error.message.includes("Could not find the") || error.message.includes("schema cache"));
}

async function loadSnapshotFallback() {
  const snapshot = await loadSnapshotState();
  if (snapshot) return snapshot;
  await saveSnapshotState(initialOpsState);
  return initialOpsState;
}

async function loadSnapshotState() {
  const supabase = createSupabaseBrowserClient() as unknown as SnapshotClient;
  const { data, error } = await supabase.from("ops_snapshots").select("state").eq("id", "default").maybeSingle();
  if (error) throw new Error(`ops_snapshots: ${error.message}`);
  if (!data?.state) return null;
  return data.state as unknown as OpsState;
}

async function saveSnapshotState(state: OpsState) {
  const supabase = createSupabaseBrowserClient() as unknown as SnapshotClient;
  const { error } = await supabase.from("ops_snapshots").upsert({ id: "default", state });
  if (error) throw new Error(`ops_snapshots: ${error.message}`);
}

async function replaceChangedTables(supabase: SupabaseTableClient, tables: Record<AppTable, Record<string, unknown>[]>, changedTables: Set<AppTable>) {
  const deleteOrder: AppTable[] = [
    "app_dispatch_assignments",
    "app_payments",
    "app_audit_events",
    "app_dispatch_orders",
    "app_company_contacts",
    "app_drivers",
    "app_vehicles",
    "app_companies",
    "app_customers"
  ];
  const insertOrder: AppTable[] = [
    "app_customers",
    "app_companies",
    "app_company_contacts",
    "app_vehicles",
    "app_drivers",
    "app_dispatch_orders",
    "app_dispatch_assignments",
    "app_payments",
    "app_audit_events"
  ];

  for (const table of deleteOrder) {
    if (!changedTables.has(table)) continue;
    await deleteTable(supabase, table);
  }

  for (const table of insertOrder) {
    if (!changedTables.has(table)) continue;
    await insertTable(supabase, table, tables[table]);
  }
}

function expandChangedTables(changedTables: Set<AppTable>) {
  const expanded = new Set(changedTables);
  if (changedTables.has("app_companies")) expanded.add("app_company_contacts");
  const dispatchGroup: AppTable[] = ["app_vehicles", "app_drivers", "app_dispatch_orders", "app_dispatch_assignments", "app_payments"];
  if (dispatchGroup.some((table) => changedTables.has(table))) {
    for (const table of dispatchGroup) expanded.add(table);
  }
  return expanded;
}

async function deleteTable(supabase: SupabaseTableClient, table: AppTable) {
  const { error: deleteError } = await supabase.from(table).delete().neq("id", "__never__");
  if (deleteError) throw new Error(`${table}: ${deleteError.message}`);
}

async function insertTable(supabase: SupabaseTableClient, table: AppTable, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  let payload = rows;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase.from(table).upsert(payload);
    if (!error) return;
    const missingColumn = missingColumnFromError(error.message);
    if (!missingColumn) throw new Error(`${table}: ${error.message}`);
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[missingColumn];
      return next;
    });
  }
  throw new Error(`${table}: failed to upsert after removing unsupported columns`);
}

function snapshotTables(state: OpsState) {
  return {
    app_customers: state.customers.map(fromCustomer),
    app_companies: state.companies.map(fromCompany),
    app_company_contacts: state.companyContacts.map(fromCompanyContact),
    app_vehicles: state.vehicles.map(fromVehicle),
    app_drivers: state.drivers.map(fromDriver),
    app_dispatch_orders: state.orders.map(fromOrder),
    app_dispatch_assignments: state.assignments.map(fromAssignment),
    app_payments: state.payments.map(fromPayment),
    app_audit_events: state.auditEvents.map(fromAuditEvent)
  } satisfies Record<AppTable, Record<string, unknown>[]>;
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function missingColumnFromError(message: string) {
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/);
  return match?.[1] ?? null;
}

function text(row: Record<string, unknown>, key: string) {
  return String(row[key] ?? "");
}

function optionalText(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(row: Record<string, unknown>, key: string) {
  return Number(row[key] ?? 0);
}

function toCustomer(row: Record<string, unknown>): Customer {
  return { id: text(row, "id"), fullName: text(row, "full_name"), phone: text(row, "phone"), email: optionalText(row, "email"), address: optionalText(row, "address"), status: text(row, "status") as Customer["status"] };
}

function fromCustomer(customer: Customer) {
  return { id: customer.id, full_name: customer.fullName, phone: customer.phone, email: customer.email ?? null, address: customer.address ?? null, status: customer.status };
}

function toCompany(row: Record<string, unknown>): Company {
  return { id: text(row, "id"), legalName: text(row, "legal_name"), taxCode: text(row, "tax_code"), legalAddress: optionalText(row, "legal_address"), billingEmail: optionalText(row, "billing_email"), status: text(row, "status") as Company["status"] };
}

function fromCompany(company: Company) {
  return { id: company.id, legal_name: company.legalName, tax_code: company.taxCode, legal_address: company.legalAddress ?? null, billing_email: company.billingEmail ?? null, status: company.status };
}

function toCompanyContact(row: Record<string, unknown>): CompanyContact {
  return { id: text(row, "id"), companyId: text(row, "company_id"), fullName: text(row, "full_name"), phone: text(row, "phone"), email: optionalText(row, "email"), position: optionalText(row, "position"), isPrimary: Boolean(row.is_primary) };
}

function fromCompanyContact(contact: CompanyContact) {
  return { id: contact.id, company_id: contact.companyId, full_name: contact.fullName, phone: contact.phone, email: contact.email ?? null, position: contact.position ?? null, is_primary: contact.isPrimary ?? false };
}

function toVehicle(row: Record<string, unknown>): Vehicle {
  return { id: text(row, "id"), plateNo: text(row, "plate_no"), type: text(row, "vehicle_type"), seats: numberValue(row, "seats"), status: text(row, "status") as Vehicle["status"] };
}

function fromVehicle(vehicle: Vehicle) {
  return { id: vehicle.id, plate_no: vehicle.plateNo, vehicle_type: vehicle.type, seats: vehicle.seats, status: vehicle.status };
}

function toDriver(row: Record<string, unknown>): Driver {
  return { id: text(row, "id"), fullName: text(row, "full_name"), phone: text(row, "phone"), status: text(row, "status") as Driver["status"] };
}

function fromDriver(driver: Driver) {
  return { id: driver.id, full_name: driver.fullName, phone: driver.phone, status: driver.status };
}

function toOrder(row: Record<string, unknown>): DispatchOrder {
  return {
    id: text(row, "id"),
    code: text(row, "code"),
    customerKind: text(row, "customer_kind") as DispatchOrder["customerKind"],
    customerName: text(row, "customer_name"),
    companyName: optionalText(row, "company_name"),
    contactName: optionalText(row, "contact_name"),
    contactPhone: text(row, "contact_phone"),
    taxCode: optionalText(row, "tax_code"),
    billingEmail: optionalText(row, "billing_email"),
    pickup: text(row, "pickup"),
    dropoff: text(row, "dropoff"),
    serviceLabel: text(row, "service_label"),
    salesOwner: text(row, "sales_owner"),
    source: text(row, "source"),
    startAt: text(row, "start_at"),
    endAt: text(row, "end_at"),
    amountDue: numberValue(row, "amount_due"),
    driverCost: numberValue(row, "driver_cost"),
    vehicleCost: numberValue(row, "vehicle_cost"),
    otherCost: numberValue(row, "other_cost"),
    quoteNote: optionalText(row, "quote_note"),
    quoteStatus: optionalText(row, "quote_status") as DispatchOrder["quoteStatus"],
    quoteSentAt: optionalText(row, "quote_sent_at"),
    quoteApprovedAt: optionalText(row, "quote_approved_at"),
    orderStatus: text(row, "order_status") as DispatchOrder["orderStatus"],
    dispatchStatus: text(row, "dispatch_status") as DispatchOrder["dispatchStatus"],
    paymentStatus: text(row, "payment_status") as DispatchOrder["paymentStatus"],
    invoiceStatus: text(row, "invoice_status") as DispatchOrder["invoiceStatus"],
    reconciliationStatus: text(row, "reconciliation_status") as DispatchOrder["reconciliationStatus"],
    vehicleId: optionalText(row, "vehicle_id"),
    driverId: optionalText(row, "driver_id"),
    changedNearStart: Boolean(row.changed_near_start),
    priority: optionalText(row, "priority") as DispatchOrder["priority"],
    salesNote: optionalText(row, "sales_note"),
    actualDriverCost: numberValue(row, "actual_driver_cost"),
    actualVehicleCost: numberValue(row, "actual_vehicle_cost"),
    actualOtherCost: numberValue(row, "actual_other_cost"),
    actualCostNote: optionalText(row, "actual_cost_note")
  };
}

function fromOrder(order: DispatchOrder) {
  return {
    id: order.id,
    code: order.code,
    customer_kind: order.customerKind,
    customer_name: order.customerName,
    company_name: order.companyName ?? null,
    contact_name: order.contactName ?? null,
    contact_phone: order.contactPhone,
    tax_code: order.taxCode ?? null,
    billing_email: order.billingEmail ?? null,
    pickup: order.pickup,
    dropoff: order.dropoff,
    service_label: order.serviceLabel,
    sales_owner: order.salesOwner,
    source: order.source,
    start_at: order.startAt,
    end_at: order.endAt,
    amount_due: order.amountDue,
    driver_cost: order.driverCost ?? null,
    vehicle_cost: order.vehicleCost ?? null,
    other_cost: order.otherCost ?? null,
    quote_note: order.quoteNote ?? null,
    quote_status: order.quoteStatus ?? null,
    quote_sent_at: order.quoteSentAt ?? null,
    quote_approved_at: order.quoteApprovedAt ?? null,
    order_status: order.orderStatus,
    dispatch_status: order.dispatchStatus,
    payment_status: order.paymentStatus,
    invoice_status: order.invoiceStatus,
    reconciliation_status: order.reconciliationStatus,
    vehicle_id: order.vehicleId ?? null,
    driver_id: order.driverId ?? null,
    changed_near_start: order.changedNearStart ?? null,
    priority: order.priority ?? null,
    sales_note: order.salesNote ?? null,
    actual_driver_cost: order.actualDriverCost ?? null,
    actual_vehicle_cost: order.actualVehicleCost ?? null,
    actual_other_cost: order.actualOtherCost ?? null,
    actual_cost_note: order.actualCostNote ?? null
  };
}

function toAssignment(row: Record<string, unknown>): Assignment {
  return { id: text(row, "id"), dispatchOrderId: text(row, "dispatch_order_id"), vehicleId: text(row, "vehicle_id"), driverId: text(row, "driver_id"), status: text(row, "status") as Assignment["status"], startAt: text(row, "start_at"), endAt: text(row, "end_at"), replaceReason: optionalText(row, "replace_reason") };
}

function fromAssignment(assignment: Assignment) {
  return { id: assignment.id, dispatch_order_id: assignment.dispatchOrderId, vehicle_id: assignment.vehicleId, driver_id: assignment.driverId, status: assignment.status, start_at: assignment.startAt, end_at: assignment.endAt, replace_reason: assignment.replaceReason ?? null };
}

function toPayment(row: Record<string, unknown>): Payment {
  return { id: text(row, "id"), orderId: text(row, "order_id"), amount: numberValue(row, "amount"), status: text(row, "status") as Payment["status"], paidAt: text(row, "paid_at"), method: text(row, "method") as Payment["method"], reference: optionalText(row, "reference") };
}

function fromPayment(payment: Payment) {
  return { id: payment.id, order_id: payment.orderId, amount: payment.amount, status: payment.status, paid_at: payment.paidAt, method: payment.method, reference: payment.reference ?? null };
}

function toAuditEvent(row: Record<string, unknown>): AuditEvent {
  return { id: text(row, "id"), actor: text(row, "actor"), entityType: text(row, "entity_type") as AuditEvent["entityType"], entityId: text(row, "entity_id"), action: text(row, "action"), reason: optionalText(row, "reason"), createdAt: text(row, "created_at") };
}

function fromAuditEvent(event: AuditEvent) {
  return { id: event.id, actor: event.actor, entity_type: event.entityType, entity_id: event.entityId, action: event.action, reason: event.reason ?? null, created_at: event.createdAt };
}
