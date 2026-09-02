import { initialOpsState } from "@/data/demo";
import { hasSupabaseBrowserConfig } from "@/lib/config";
import { emptyOpsState } from "@/lib/empty-ops-state";
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
const customerSelectColumns = "id,full_name,phone,email,address,status";
const companySelectColumns = "id,legal_name,tax_code,legal_address,billing_email,status";
const companyContactSelectColumns = "id,company_id,full_name,phone,email,position,is_primary";
const legacyVehicleSelectColumns = "id,plate_no,vehicle_type,seats,status";
const vehicleSelectColumns = [
  "id",
  "plate_no",
  "vehicle_type",
  "seats",
  "fuel_type",
  "ownership_type",
  "default_driver_id",
  "owner_name",
  "owner_cccd",
  "supplier_invoice_required",
  "supplier_company_name",
  "supplier_tax_code",
  "supplier_address",
  "supplier_phone",
  "supplier_bank_account",
  "supplier_bank_name",
  "status"
].join(",");
const legacyDriverSelectColumns = "id,full_name,phone,status";
const driverSelectColumns = "id,full_name,phone,cccd,bank_account,bank_name,status";
const assignmentSelectColumns = "id,dispatch_order_id,vehicle_id,driver_id,status,start_at,end_at,replace_reason";
const paymentSelectColumns = "id,order_id,amount,status,paid_at,method,collector,bank_account,bank_name,reference,note";
const legacyPaymentSelectColumns = "id,order_id,amount,status,paid_at,method,collector,reference,note";
const auditSelectColumns = "id,actor,entity_type,entity_id,action,reason,created_at";
type SupabaseTableClient = {
  from(table: AppTable): {
    select(columns?: string): { order(column: string, options?: { ascending?: boolean }): QueryResult<Record<string, unknown>> } & QueryResult<Record<string, unknown>>;
  };
};
type SnapshotClient = {
  from(table: "ops_snapshots"): {
    select(columns: "state"): { eq(column: "id", value: string): { maybeSingle(): Promise<{ data: { state: unknown } | null; error: { message: string } | null }> } };
    upsert(value: { id: string; state: unknown }): MutationResult;
  };
};

export const appDispatchOrderPersistenceColumns = [
  "id",
  "code",
  "order_date",
  "contract_type",
  "customer_kind",
  "customer_name",
  "customer_cccd",
  "customer_address",
  "customer_bank_account",
  "customer_bank_name",
  "company_name",
  "contact_name",
  "contact_phone",
  "tax_code",
  "billing_email",
  "company_address",
  "company_bank_account",
  "company_bank_name",
  "pickup",
  "dropoff",
  "route_legs",
  "service_code",
  "service_label",
  "service_clarification",
  "unit",
  "sales_owner",
  "source_owner_name",
  "source",
  "guest_count",
  "guest_market",
  "customer_recognition_code",
  "customer_source_code",
  "origin_province_code",
  "destination_province_code",
  "invoice_required",
  "vehicle_ownership",
  "vehicle_plate_no",
  "driver_full_name",
  "driver_cccd",
  "driver_phone",
  "external_driver_name",
  "external_driver_phone",
  "external_vehicle_plate",
  "external_vehicle_type",
  "trip_access_token",
  "trip_access_expires_at",
  "trip_access_revoked",
  "supplier_owner_name",
  "supplier_cccd",
  "supplier_invoice_required",
  "supplier_company_name",
  "supplier_tax_code",
  "supplier_address",
  "supplier_phone",
  "supplier_total_with_vat",
  "supplier_bank_account",
  "supplier_bank_name",
  "subtotal_amount",
  "vat_rate",
  "vat_amount",
  "start_at",
  "end_at",
  "amount_due",
  "driver_cost",
  "vehicle_cost",
  "other_cost",
  "payment_method",
  "payer",
  "collection_account_owner",
  "collection_bank_account",
  "collection_bank_name",
  "driver_collected_amount",
  "driver_expense_fuel",
  "driver_expense_toll",
  "driver_expense_parking",
  "driver_expense_water",
  "driver_expense_other",
  "driver_expense_note",
  "driver_report_status",
  "driver_reported_at",
  "quote_note",
  "customer_confirmation_note",
  "quote_status",
  "quote_sent_at",
  "quote_approved_at",
  "order_status",
  "dispatch_status",
  "payment_status",
  "invoice_status",
  "reconciliation_status",
  "vehicle_id",
  "driver_id",
  "changed_near_start",
  "priority",
  "sales_note",
  "actual_driver_cost",
  "actual_vehicle_cost",
  "actual_other_cost",
  "actual_cost_note"
] as const;

const legacyDispatchOrderPersistenceColumns = appDispatchOrderPersistenceColumns
  .filter((column) => ![
    "guest_count",
    "guest_market",
    "customer_recognition_code",
    "customer_source_code",
    "origin_province_code",
    "destination_province_code"
  ].includes(column))
  .join(",");

export const appPaymentPersistenceColumns = [
  "id",
  "order_id",
  "amount",
  "status",
  "paid_at",
  "method",
  "collector",
  "bank_account",
  "bank_name",
  "reference",
  "note"
] as const;

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
    const startedAt = performance.now();
    const mobileViewport = isMobileViewport();
    let rows: Awaited<ReturnType<typeof selectTable>>[];
    try {
      rows = await Promise.all([
        selectTable(supabase, "app_customers", customerSelectColumns),
        selectTable(supabase, "app_companies", companySelectColumns),
        selectTable(supabase, "app_company_contacts", companyContactSelectColumns),
        selectTableWithFallback(supabase, "app_vehicles", vehicleSelectColumns, legacyVehicleSelectColumns),
        selectTableWithFallback(supabase, "app_drivers", driverSelectColumns, legacyDriverSelectColumns),
        selectTableWithFallback(supabase, "app_dispatch_orders", appDispatchOrderPersistenceColumns.join(","), legacyDispatchOrderPersistenceColumns),
        selectTable(supabase, "app_dispatch_assignments", assignmentSelectColumns),
        selectTableWithFallback(supabase, "app_payments", paymentSelectColumns, legacyPaymentSelectColumns),
        mobileViewport ? Promise.resolve([] as Record<string, unknown>[]) : selectTable(supabase, "app_audit_events", auditSelectColumns)
      ]);
      repositoryTiming("relational_tables_loaded", startedAt);
    } catch (error) {
      if (isMissingRelationalSchema(error)) {
        const snapshotStartedAt = performance.now();
        const snapshot = await loadSnapshotFallback();
        repositoryTiming("snapshot_fallback_loaded", snapshotStartedAt);
        return snapshot;
      }
      throw error;
    }

    const [customers, companies, companyContacts, vehicles, drivers, orders, assignments, payments, auditEvents] = rows;
    const hasRelationalData =
      customers.length +
        companies.length +
        companyContacts.length +
        vehicles.length +
        drivers.length +
        orders.length +
        assignments.length +
        payments.length +
        auditEvents.length >
      0;
    if (!hasRelationalData) {
      const snapshotStartedAt = performance.now();
      repositoryTiming("empty_relational_tables_loaded", snapshotStartedAt);
      await this.save(emptyOpsState);
      return emptyOpsState;
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

  async save(state: OpsState) {
    await saveSnapshotState(state);
  }
}

export function createOpsRepository(key: string): OpsRepository {
  if (hasSupabaseBrowserConfig()) return new SupabaseOpsRepository();
  return new LocalStorageOpsRepository(key);
}

async function selectTable(supabase: SupabaseTableClient, table: AppTable, columns?: string) {
  const startedAt = performance.now();
  const { data, error } = await supabase.from(table).select(columns ?? "*");
  if (error) throw new Error(`${table}: ${error.message}`);
  repositoryTiming(`select_${table}`, startedAt, { rows: data?.length ?? 0 });
  return data ?? [];
}

async function selectTableWithFallback(supabase: SupabaseTableClient, table: AppTable, columns: string, fallbackColumns: string) {
  try {
    return await selectTable(supabase, table, columns);
  } catch (error) {
    if (isMissingRelationalSchema(error)) return selectTable(supabase, table, fallbackColumns);
    throw error;
  }
}

function repositoryTiming(label: string, startedAt: number, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.info(`[startup] ${label}`, { elapsedMs, ...detail });
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

function isMissingRelationalSchema(error: unknown) {
  return error instanceof Error && (error.message.includes("Could not find the table") || error.message.includes("Could not find the") || error.message.includes("schema cache"));
}

async function loadSnapshotFallback() {
  const snapshot = await loadSnapshotState();
  if (snapshot) return snapshot;
  await saveSnapshotState(emptyOpsState);
  return emptyOpsState;
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

function optionalNumber(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined || value === "" ? undefined : Number(value);
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
  return {
    id: text(row, "id"),
    plateNo: text(row, "plate_no"),
    type: text(row, "vehicle_type"),
    seats: numberValue(row, "seats"),
    fuelType: optionalText(row, "fuel_type"),
    ownershipType: optionalText(row, "ownership_type") as Vehicle["ownershipType"],
    defaultDriverId: optionalText(row, "default_driver_id"),
    ownerName: optionalText(row, "owner_name"),
    ownerCccd: optionalText(row, "owner_cccd"),
    supplierInvoiceRequired: row.supplier_invoice_required === null || row.supplier_invoice_required === undefined ? undefined : Boolean(row.supplier_invoice_required),
    supplierCompanyName: optionalText(row, "supplier_company_name"),
    supplierTaxCode: optionalText(row, "supplier_tax_code"),
    supplierAddress: optionalText(row, "supplier_address"),
    supplierPhone: optionalText(row, "supplier_phone"),
    supplierBankAccount: optionalText(row, "supplier_bank_account"),
    supplierBankName: optionalText(row, "supplier_bank_name"),
    status: text(row, "status") as Vehicle["status"]
  };
}

function fromVehicle(vehicle: Vehicle) {
  return {
    id: vehicle.id,
    plate_no: vehicle.plateNo,
    vehicle_type: vehicle.type,
    seats: vehicle.seats,
    fuel_type: vehicle.fuelType ?? null,
    ownership_type: vehicle.ownershipType ?? null,
    default_driver_id: vehicle.defaultDriverId ?? null,
    owner_name: vehicle.ownerName ?? null,
    owner_cccd: vehicle.ownerCccd ?? null,
    supplier_invoice_required: vehicle.supplierInvoiceRequired ?? null,
    supplier_company_name: vehicle.supplierCompanyName ?? null,
    supplier_tax_code: vehicle.supplierTaxCode ?? null,
    supplier_address: vehicle.supplierAddress ?? null,
    supplier_phone: vehicle.supplierPhone ?? null,
    supplier_bank_account: vehicle.supplierBankAccount ?? null,
    supplier_bank_name: vehicle.supplierBankName ?? null,
    status: vehicle.status
  };
}

function toDriver(row: Record<string, unknown>): Driver {
  return {
    id: text(row, "id"),
    fullName: text(row, "full_name"),
    phone: text(row, "phone"),
    cccd: optionalText(row, "cccd"),
    bankAccount: optionalText(row, "bank_account"),
    bankName: optionalText(row, "bank_name"),
    status: text(row, "status") as Driver["status"]
  };
}

function fromDriver(driver: Driver) {
  return {
    id: driver.id,
    full_name: driver.fullName,
    phone: driver.phone,
    cccd: driver.cccd ?? null,
    bank_account: driver.bankAccount ?? null,
    bank_name: driver.bankName ?? null,
    status: driver.status
  };
}

function toOrder(row: Record<string, unknown>): DispatchOrder {
  return {
    id: text(row, "id"),
    code: text(row, "code"),
    orderDate: optionalText(row, "order_date"),
    contractType: optionalText(row, "contract_type") as DispatchOrder["contractType"],
    customerKind: text(row, "customer_kind") as DispatchOrder["customerKind"],
    customerName: text(row, "customer_name"),
    customerCccd: optionalText(row, "customer_cccd"),
    customerAddress: optionalText(row, "customer_address"),
    customerBankAccount: optionalText(row, "customer_bank_account"),
    customerBankName: optionalText(row, "customer_bank_name"),
    companyName: optionalText(row, "company_name"),
    contactName: optionalText(row, "contact_name"),
    contactPhone: text(row, "contact_phone"),
    taxCode: optionalText(row, "tax_code"),
    billingEmail: optionalText(row, "billing_email"),
    companyAddress: optionalText(row, "company_address"),
    companyBankAccount: optionalText(row, "company_bank_account"),
    companyBankName: optionalText(row, "company_bank_name"),
    pickup: text(row, "pickup"),
    dropoff: text(row, "dropoff"),
    routeLegs: Array.isArray(row.route_legs) ? (row.route_legs as DispatchOrder["routeLegs"]) : undefined,
    serviceCode: optionalText(row, "service_code"),
    serviceLabel: text(row, "service_label"),
    serviceClarification: optionalText(row, "service_clarification"),
    unit: optionalText(row, "unit"),
    salesOwner: text(row, "sales_owner"),
    sourceOwnerName: optionalText(row, "source_owner_name"),
    source: text(row, "source"),
    guestCount: optionalNumber(row, "guest_count"),
    guestMarket: optionalText(row, "guest_market") as DispatchOrder["guestMarket"],
    customerRecognitionCode: optionalText(row, "customer_recognition_code") as DispatchOrder["customerRecognitionCode"],
    customerSourceCode: optionalText(row, "customer_source_code") as DispatchOrder["customerSourceCode"],
    originProvinceCode: optionalText(row, "origin_province_code"),
    destinationProvinceCode: optionalText(row, "destination_province_code"),
    invoiceRequired: row.invoice_required === null || row.invoice_required === undefined ? undefined : Boolean(row.invoice_required),
    vehicleOwnership: optionalText(row, "vehicle_ownership") as DispatchOrder["vehicleOwnership"],
    vehiclePlateNo: optionalText(row, "vehicle_plate_no"),
    driverFullName: optionalText(row, "driver_full_name"),
    driverCccd: optionalText(row, "driver_cccd"),
    driverPhone: optionalText(row, "driver_phone"),
    externalDriverName: optionalText(row, "external_driver_name"),
    externalDriverPhone: optionalText(row, "external_driver_phone"),
    externalVehiclePlate: optionalText(row, "external_vehicle_plate"),
    externalVehicleType: optionalText(row, "external_vehicle_type"),
    tripAccessToken: optionalText(row, "trip_access_token"),
    tripAccessExpiresAt: optionalText(row, "trip_access_expires_at"),
    tripAccessRevoked: Boolean(row.trip_access_revoked),
    supplierOwnerName: optionalText(row, "supplier_owner_name"),
    supplierCccd: optionalText(row, "supplier_cccd"),
    supplierInvoiceRequired: row.supplier_invoice_required === null || row.supplier_invoice_required === undefined ? undefined : Boolean(row.supplier_invoice_required),
    supplierCompanyName: optionalText(row, "supplier_company_name"),
    supplierTaxCode: optionalText(row, "supplier_tax_code"),
    supplierAddress: optionalText(row, "supplier_address"),
    supplierPhone: optionalText(row, "supplier_phone"),
    supplierTotalWithVat: optionalNumber(row, "supplier_total_with_vat"),
    supplierBankAccount: optionalText(row, "supplier_bank_account"),
    supplierBankName: optionalText(row, "supplier_bank_name"),
    subtotalAmount: optionalNumber(row, "subtotal_amount"),
    vatRate: optionalNumber(row, "vat_rate"),
    vatAmount: optionalNumber(row, "vat_amount"),
    startAt: text(row, "start_at"),
    endAt: text(row, "end_at"),
    amountDue: numberValue(row, "amount_due"),
    driverCost: numberValue(row, "driver_cost"),
    vehicleCost: numberValue(row, "vehicle_cost"),
    otherCost: numberValue(row, "other_cost"),
    paymentMethod: optionalText(row, "payment_method"),
    payer: optionalText(row, "payer"),
    collectionAccountOwner: optionalText(row, "collection_account_owner"),
    collectionBankAccount: optionalText(row, "collection_bank_account"),
    collectionBankName: optionalText(row, "collection_bank_name"),
    driverCollectedAmount: optionalNumber(row, "driver_collected_amount"),
    driverExpenseFuel: optionalNumber(row, "driver_expense_fuel"),
    driverExpenseToll: optionalNumber(row, "driver_expense_toll"),
    driverExpenseParking: optionalNumber(row, "driver_expense_parking"),
    driverExpenseWater: optionalNumber(row, "driver_expense_water"),
    driverExpenseOther: optionalNumber(row, "driver_expense_other"),
    driverExpenseNote: optionalText(row, "driver_expense_note"),
    driverReportStatus: optionalText(row, "driver_report_status") as DispatchOrder["driverReportStatus"],
    driverReportedAt: optionalText(row, "driver_reported_at"),
    quoteNote: optionalText(row, "quote_note"),
    customerConfirmationNote: optionalText(row, "customer_confirmation_note"),
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
    order_date: order.orderDate ?? null,
    contract_type: order.contractType ?? null,
    customer_kind: order.customerKind,
    customer_name: order.customerName,
    customer_cccd: order.customerCccd ?? null,
    customer_address: order.customerAddress ?? null,
    customer_bank_account: order.customerBankAccount ?? null,
    customer_bank_name: order.customerBankName ?? null,
    company_name: order.companyName ?? null,
    contact_name: order.contactName ?? null,
    contact_phone: order.contactPhone,
    tax_code: order.taxCode ?? null,
    billing_email: order.billingEmail ?? null,
    company_address: order.companyAddress ?? null,
    company_bank_account: order.companyBankAccount ?? null,
    company_bank_name: order.companyBankName ?? null,
    pickup: order.pickup,
    dropoff: order.dropoff,
    route_legs: order.routeLegs ?? null,
    service_code: order.serviceCode ?? null,
    service_label: order.serviceLabel,
    service_clarification: order.serviceClarification ?? null,
    unit: order.unit ?? null,
    sales_owner: order.salesOwner,
    source_owner_name: order.sourceOwnerName ?? null,
    source: order.source,
    guest_count: order.guestCount ?? null,
    guest_market: order.guestMarket ?? null,
    customer_recognition_code: order.customerRecognitionCode ?? null,
    customer_source_code: order.customerSourceCode ?? null,
    origin_province_code: order.originProvinceCode ?? null,
    destination_province_code: order.destinationProvinceCode ?? null,
    invoice_required: order.invoiceRequired ?? null,
    vehicle_ownership: order.vehicleOwnership ?? null,
    vehicle_plate_no: order.vehiclePlateNo ?? null,
    driver_full_name: order.driverFullName ?? null,
    driver_cccd: order.driverCccd ?? null,
    driver_phone: order.driverPhone ?? null,
    external_driver_name: order.externalDriverName ?? null,
    external_driver_phone: order.externalDriverPhone ?? null,
    external_vehicle_plate: order.externalVehiclePlate ?? null,
    external_vehicle_type: order.externalVehicleType ?? null,
    trip_access_token: order.tripAccessToken ?? null,
    trip_access_expires_at: order.tripAccessExpiresAt ?? null,
    trip_access_revoked: order.tripAccessRevoked ?? null,
    supplier_owner_name: order.supplierOwnerName ?? null,
    supplier_cccd: order.supplierCccd ?? null,
    supplier_invoice_required: order.supplierInvoiceRequired ?? null,
    supplier_company_name: order.supplierCompanyName ?? null,
    supplier_tax_code: order.supplierTaxCode ?? null,
    supplier_address: order.supplierAddress ?? null,
    supplier_phone: order.supplierPhone ?? null,
    supplier_total_with_vat: order.supplierTotalWithVat ?? null,
    supplier_bank_account: order.supplierBankAccount ?? null,
    supplier_bank_name: order.supplierBankName ?? null,
    subtotal_amount: order.subtotalAmount ?? null,
    vat_rate: order.vatRate ?? null,
    vat_amount: order.vatAmount ?? null,
    start_at: order.startAt,
    end_at: order.endAt,
    amount_due: order.amountDue,
    driver_cost: order.driverCost ?? null,
    vehicle_cost: order.vehicleCost ?? null,
    other_cost: order.otherCost ?? null,
    payment_method: order.paymentMethod ?? null,
    payer: order.payer ?? null,
    collection_account_owner: order.collectionAccountOwner ?? null,
    collection_bank_account: order.collectionBankAccount ?? null,
    collection_bank_name: order.collectionBankName ?? null,
    driver_collected_amount: order.driverCollectedAmount ?? null,
    driver_expense_fuel: order.driverExpenseFuel ?? null,
    driver_expense_toll: order.driverExpenseToll ?? null,
    driver_expense_parking: order.driverExpenseParking ?? null,
    driver_expense_water: order.driverExpenseWater ?? null,
    driver_expense_other: order.driverExpenseOther ?? null,
    driver_expense_note: order.driverExpenseNote ?? null,
    driver_report_status: order.driverReportStatus ?? null,
    driver_reported_at: order.driverReportedAt ?? null,
    quote_note: order.quoteNote ?? null,
    customer_confirmation_note: order.customerConfirmationNote ?? null,
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
  return {
    id: text(row, "id"),
    orderId: text(row, "order_id"),
    amount: numberValue(row, "amount"),
    status: text(row, "status") as Payment["status"],
    paidAt: text(row, "paid_at"),
    method: text(row, "method") as Payment["method"],
    collector: optionalText(row, "collector"),
    bankAccount: optionalText(row, "bank_account"),
    bankName: optionalText(row, "bank_name"),
    reference: optionalText(row, "reference"),
    note: optionalText(row, "note")
  };
}

function fromPayment(payment: Payment) {
  return {
    id: payment.id,
    order_id: payment.orderId,
    amount: payment.amount,
    status: payment.status,
    paid_at: payment.paidAt,
    method: payment.method,
    collector: payment.collector ?? null,
    bank_account: payment.bankAccount ?? null,
    bank_name: payment.bankName ?? null,
    reference: payment.reference ?? null,
    note: payment.note ?? null
  };
}

function toAuditEvent(row: Record<string, unknown>): AuditEvent {
  return { id: text(row, "id"), actor: text(row, "actor"), entityType: text(row, "entity_type") as AuditEvent["entityType"], entityId: text(row, "entity_id"), action: text(row, "action"), reason: optionalText(row, "reason"), createdAt: text(row, "created_at") };
}

function fromAuditEvent(event: AuditEvent) {
  return { id: event.id, actor: event.actor, entity_type: event.entityType, entity_id: event.entityId, action: event.action, reason: event.reason ?? null, created_at: event.createdAt };
}
