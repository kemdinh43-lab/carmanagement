import type { AppNotification, Assignment, DispatchOrder, DispatchStatus, Payment, PaymentStatus, TimeWindow } from "./types";

export type VatBasis = "subtotal" | "total";

export interface VatInput {
  subtotalAmount?: number;
  vatRate?: number;
  amountDue?: number;
  basis?: VatBasis;
}

export interface VatSummary {
  subtotalAmount: number;
  vatRate: number;
  vatAmount: number;
  amountDue: number;
}

function safeNumber(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safeMoneyValue(value: number | undefined) {
  return Math.max(0, Math.round(safeNumber(value)));
}

export function calculateVatSummary(input: VatInput): VatSummary {
  const vatRate = Math.max(0, safeNumber(input.vatRate));
  const divisor = 1 + vatRate / 100;
  const basis = input.basis ?? "subtotal";

  if (basis === "total") {
    const amountDue = safeMoneyValue(input.amountDue);
    const subtotalAmount = divisor > 0 ? safeMoneyValue(amountDue / divisor) : amountDue;
    return {
      subtotalAmount,
      vatRate,
      vatAmount: Math.max(0, amountDue - subtotalAmount),
      amountDue
    };
  }

  const subtotalAmount = safeMoneyValue(input.subtotalAmount);
  const amountDue = safeMoneyValue(subtotalAmount * divisor);
  return {
    subtotalAmount,
    vatRate,
    vatAmount: Math.max(0, amountDue - subtotalAmount),
    amountDue
  };
}

function firstFormNumber(form: { get(name: string): unknown }, names: string[]) {
  for (const name of names) {
    const value = form.get(name);
    if (value !== null && value !== undefined && String(value) !== "") return Number(value);
  }
  return 0;
}

export function calculateVatSummaryFromForm(form: { get(name: string): unknown }): VatSummary {
  return calculateVatSummary({
    subtotalAmount: firstFormNumber(form, ["subtotalAmountDisplay", "subtotalAmount"]),
    vatRate: firstFormNumber(form, ["vatRateDisplay", "vatRate"]),
    amountDue: firstFormNumber(form, ["amountDueDisplay", "amountDue"]),
    basis: form.get("vatBasis") === "total" ? "total" : "subtotal"
  });
}

export function summarizeOrderPayments(order: Pick<DispatchOrder, "id" | "amountDue">, payments: Payment[]) {
  const validPayments = payments
    .filter((payment) => payment.orderId === order.id && payment.status === "valid")
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  const paidAmount = validPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingAmount = Math.max(order.amountDue - paidAmount, 0);
  return {
    validPayments,
    paidAmount,
    remainingAmount,
    paymentStatus: calculatePaymentStatus(order.amountDue, validPayments)
  };
}

export function notificationDedupeId(input: Pick<AppNotification, "audience" | "entityId" | "eventType" | "title">) {
  const eventKey = input.eventType || input.title;
  const entityKey = input.entityId || "global";
  const raw = `${input.audience}:${eventKey}:${entityKey}`;
  return `noti_${raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 140)}`;
}

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  const aStart = new Date(a.startAt).getTime();
  const aEnd = new Date(a.endAt).getTime();
  const bStart = new Date(b.startAt).getTime();
  const bEnd = new Date(b.endAt).getTime();

  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) {
    throw new Error("Invalid time window");
  }

  if (aEnd <= aStart || bEnd <= bStart) {
    throw new Error("Time window end must be after start");
  }

  return aStart < bEnd && aEnd > bStart;
}

export function findAssignmentConflict(
  candidate: TimeWindow & { vehicleId: string; driverId: string; ignoreAssignmentId?: string },
  assignments: Assignment[]
) {
  return assignments.find((assignment) => {
    if (assignment.status !== "active") return false;
    if (assignment.id === candidate.ignoreAssignmentId) return false;
    const sameVehicle = assignment.vehicleId === candidate.vehicleId;
    const sameDriver = assignment.driverId === candidate.driverId;
    return (sameVehicle || sameDriver) && overlaps(candidate, assignment);
  });
}

export function allowedDispatchNextStatuses(currentStatus: DispatchStatus): DispatchStatus[] {
  if (currentStatus === "waiting_assignment") return ["assigned", "cancelled"];
  if (currentStatus === "assigned") return ["driver_accepted", "cancelled"];
  if (currentStatus === "driver_accepted") return ["in_progress", "cancelled"];
  if (currentStatus === "in_progress") return ["completed", "cancelled"];
  return [];
}

export function canMoveDispatchStatus(currentStatus: DispatchStatus, nextStatus: DispatchStatus) {
  return allowedDispatchNextStatuses(currentStatus).includes(nextStatus);
}

export function calculatePaymentStatus(amountDue: number, payments: Payment[]): PaymentStatus {
  if (amountDue <= 0) return "paid";

  const paid = payments
    .filter((payment) => payment.status === "valid")
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (paid <= 0) return "unpaid";
  if (paid + 0.01 < amountDue) return "partial";
  return "paid";
}

export function money(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(amount);
}

export function getOperationalAlerts(orders: DispatchOrder[]) {
  return orders.filter((order) => {
    if (order.orderStatus !== "confirmed") return false;
    const startsSoon = new Date(order.startAt).getTime() - Date.now() < 1000 * 60 * 60 * 6;
    return (
      order.dispatchStatus === "waiting_assignment" ||
      order.changedNearStart ||
      (startsSoon && order.dispatchStatus !== "completed" && order.dispatchStatus !== "cancelled")
    );
  });
}
