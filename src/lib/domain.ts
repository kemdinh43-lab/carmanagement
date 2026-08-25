import type { Assignment, DispatchOrder, Payment, PaymentStatus, TimeWindow } from "./types";

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
