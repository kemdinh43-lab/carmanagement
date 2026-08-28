import { describe, expect, it } from "vitest";
import { calculatePaymentStatus, canMoveDispatchStatus, findAssignmentConflict, overlaps } from "./domain";
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
