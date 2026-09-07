import { describe, expect, it } from "vitest";
import { calculatePaymentStatus, calculateVatSummary, calculateVatSummaryFromForm, canMoveDispatchStatus, findAssignmentConflict, notificationDedupeId, overlaps, summarizeOrderPayments } from "./domain";
import type { Assignment } from "./types";

const assignments: Assignment[] = [
  {
    id: "a1",
    dispatchOrderId: "d1",
    vehicleId: "v1",
    driverId: "dr1",
    status: "active",
    startAt: "2026-08-25T08:00:00+07:00",
    endAt: "2026-08-25T11:00:00+07:00"
  }
];

describe("dispatch time overlap", () => {
  it("detects overlapping windows", () => {
    expect(
      overlaps(
        { startAt: "2026-08-25T10:00:00+07:00", endAt: "2026-08-25T12:00:00+07:00" },
        assignments[0]
      )
    ).toBe(true);
  });

  it("allows adjacent windows", () => {
    expect(
      overlaps(
        { startAt: "2026-08-25T11:00:00+07:00", endAt: "2026-08-25T13:00:00+07:00" },
        assignments[0]
      )
    ).toBe(false);
  });
});

describe("assignment conflict", () => {
  it("blocks same vehicle overlap", () => {
    const conflict = findAssignmentConflict(
      {
        vehicleId: "v1",
        driverId: "dr2",
        startAt: "2026-08-25T10:30:00+07:00",
        endAt: "2026-08-25T12:00:00+07:00"
      },
      assignments
    );

    expect(conflict?.id).toBe("a1");
  });

  it("blocks same driver overlap", () => {
    const conflict = findAssignmentConflict(
      {
        vehicleId: "v2",
        driverId: "dr1",
        startAt: "2026-08-25T09:00:00+07:00",
        endAt: "2026-08-25T10:00:00+07:00"
      },
      assignments
    );

    expect(conflict?.id).toBe("a1");
  });
});

describe("payment status", () => {
  it("handles unpaid, partial, and paid", () => {
    expect(calculatePaymentStatus(1000, [])).toBe("unpaid");
    expect(calculatePaymentStatus(1000, [{ id: "p1", orderId: "o1", amount: 500, status: "valid", paidAt: "2026-08-25", method: "cash" }])).toBe("partial");
    expect(calculatePaymentStatus(1000, [{ id: "p2", orderId: "o1", amount: 1000, status: "valid", paidAt: "2026-08-25", method: "bank_transfer" }])).toBe("paid");
  });

  it("summarizes only valid payments for one order", () => {
    const summary = summarizeOrderPayments(
      { id: "o1", amountDue: 1200 },
      [
        { id: "p1", orderId: "o1", amount: 500, status: "valid", paidAt: "2026-08-25T10:00:00+07:00", method: "cash" },
        { id: "p2", orderId: "o1", amount: 300, status: "voided", paidAt: "2026-08-25T11:00:00+07:00", method: "cash" },
        { id: "p3", orderId: "o2", amount: 900, status: "valid", paidAt: "2026-08-25T12:00:00+07:00", method: "cash" }
      ]
    );

    expect(summary.paidAmount).toBe(500);
    expect(summary.remainingAmount).toBe(700);
    expect(summary.paymentStatus).toBe("partial");
    expect(summary.validPayments.map((payment) => payment.id)).toEqual(["p1"]);
  });
});

describe("vat summary", () => {
  it("calculates totals from subtotal without lagging derived values", () => {
    expect(calculateVatSummary({ subtotalAmount: 1200000, vatRate: 8, basis: "subtotal" })).toEqual({
      subtotalAmount: 1200000,
      vatRate: 8,
      vatAmount: 96000,
      amountDue: 1296000
    });
  });

  it("calculates subtotal from total when total is the edited field", () => {
    expect(calculateVatSummary({ amountDue: 1296000, vatRate: 8, basis: "total" })).toEqual({
      subtotalAmount: 1200000,
      vatRate: 8,
      vatAmount: 96000,
      amountDue: 1296000
    });
  });

  it("prefers visible create-form VAT values over stale hidden defaults", () => {
    const form = new FormData();
    form.set("vatBasis", "subtotal");
    form.set("subtotalAmount", "1000000");
    form.set("vatRate", "0");
    form.set("vatAmount", "0");
    form.set("amountDue", "1000000");
    form.set("subtotalAmountDisplay", "1000000");
    form.set("vatRateDisplay", "10");

    expect(calculateVatSummaryFromForm(form)).toEqual({
      subtotalAmount: 1000000,
      vatRate: 10,
      vatAmount: 100000,
      amountDue: 1100000
    });
  });
});

describe("notification dedupe", () => {
  it("uses a stable id for the same audience, event, and entity", () => {
    const first = notificationDedupeId({ audience: "dispatcher", eventType: "trip_completed", title: "Done", entityId: "order-1" });
    const second = notificationDedupeId({ audience: "dispatcher", eventType: "trip_completed", title: "Done again", entityId: "order-1" });

    expect(first).toBe(second);
  });
});

describe("dispatch status flow", () => {
  it("only allows valid next transitions", () => {
    expect(canMoveDispatchStatus("waiting_assignment", "assigned")).toBe(true);
    expect(canMoveDispatchStatus("waiting_assignment", "completed")).toBe(false);
    expect(canMoveDispatchStatus("assigned", "driver_accepted")).toBe(true);
    expect(canMoveDispatchStatus("driver_accepted", "in_progress")).toBe(true);
    expect(canMoveDispatchStatus("in_progress", "completed")).toBe(true);
  });
});
