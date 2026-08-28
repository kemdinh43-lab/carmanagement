import { describe, expect, it } from "vitest";
import type { AuditEvent, DispatchOrder, OpsState } from "@/lib/types";
import { assignVehicleDriver, canRunCommand, commandCatalog, reviewDispatchProposal, submitDriverDispatchProposal, submitDriverTripReport } from "./ops-commands";

const audit = (event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent => ({
  ...event,
  id: `audit-${event.action}`,
  createdAt: "2026-08-28T09:00:00+07:00"
});

function emptyState(order?: DispatchOrder): OpsState {
  return {
    vehicles: [],
    drivers: [],
    customers: [],
    companies: [],
    companyContacts: [],
    orders: order ? [order] : [],
    assignments: [],
    payments: [],
    auditEvents: [],
    notifications: []
  };
}

function driverProposal(overrides: Partial<DispatchOrder> = {}): DispatchOrder {
  return {
    id: "driver-order-1",
    code: "AOT-260828-0001",
    customerKind: "individual",
    customerName: "Ms. Linh",
    contactName: "Ms. Linh",
    contactPhone: "0901234567",
    pickup: "Da Nang Airport",
    dropoff: "Hoi An Ancient Town",
    serviceLabel: "4 cho / 2 khach",
    salesOwner: "Cho Sale tiep nhan",
    sourceOwnerName: "Nguyen Van Hai",
    source: "Driver",
    startAt: "2026-08-28T10:00:00+07:00",
    endAt: "2026-08-28T12:00:00+07:00",
    amountDue: 0,
    driverCost: 0,
    vehicleCost: 0,
    otherCost: 0,
    quoteStatus: "draft",
    orderStatus: "draft",
    dispatchStatus: "waiting_assignment",
    paymentStatus: "unpaid",
    invoiceStatus: "not_required",
    reconciliationStatus: "open",
    ...overrides
  };
}

describe("ops command catalog", () => {
  it("keeps command rpc names stable", () => {
    expect(commandCatalog["dispatch.assign_vehicle_driver"].rpcName).toBe("assign_vehicle_driver");
    expect(commandCatalog["finance.close_order"].permission).toBe("close_order");
    expect(commandCatalog["driver.submit_trip_report"].rpcName).toBe("submit_driver_trip_report");
  });

  it("maps role permissions to commands", () => {
    expect(canRunCommand("sale", "order.submit_proposal")).toBe(true);
    expect(canRunCommand("sale", "finance.record_payment")).toBe(false);
    expect(canRunCommand("dispatcher", "order.update_details")).toBe(true);
    expect(canRunCommand("accountant", "order.update_details")).toBe(true);
    expect(canRunCommand("driver", "order.update_details")).toBe(false);
    expect(canRunCommand("driver", "driver.submit_trip_report")).toBe(true);
    expect(canRunCommand("admin", "master.create_vehicle")).toBe(true);
  });
});

describe("driver proposal flow", () => {
  it("keeps normal driver proposals in Sales intake before dispatcher review", () => {
    const order = driverProposal();
    const state = submitDriverDispatchProposal(emptyState(), order, audit);

    expect(state.orders[0]).toMatchObject({
      source: "Driver",
      sourceOwnerName: "Nguyen Van Hai",
      orderStatus: "draft",
      dispatchStatus: "waiting_assignment"
    });
    expect(state.orders[0].priority).toBeUndefined();
    expect(state.auditEvents[0]).toMatchObject({
      actor: "Driver",
      action: "submitted_driver_proposal"
    });
  });

  it("sends urgent driver proposals directly to dispatcher review", () => {
    const order = driverProposal({
      salesOwner: "Nguyen Van Hai",
      orderStatus: "pending_dispatch_review",
      priority: "urgent",
      salesNote: "Khan: khach dang cho san bay"
    });
    const state = submitDriverDispatchProposal(emptyState(), order, audit);

    expect(state.orders[0]).toMatchObject({
      source: "Driver",
      orderStatus: "pending_dispatch_review",
      dispatchStatus: "waiting_assignment",
      priority: "urgent"
    });
  });
});

describe("dispatch review and assignment flow", () => {
  it("only assigns vehicle and driver after dispatcher approval", () => {
    const pendingOrder = driverProposal({ orderStatus: "pending_dispatch_review", priority: "urgent" });
    const reviewed = reviewDispatchProposal(emptyState(pendingOrder), pendingOrder.id, "approved", "Duyet nhanh", audit);

    expect(reviewed.orders[0]).toMatchObject({
      orderStatus: "confirmed",
      dispatchStatus: "waiting_assignment"
    });

    const assigned = assignVehicleDriver(
      reviewed,
      pendingOrder.id,
      {
        id: "assign-1",
        dispatchOrderId: pendingOrder.id,
        vehicleId: "v1",
        driverId: "dr1",
        status: "active",
        startAt: pendingOrder.startAt,
        endAt: pendingOrder.endAt
      },
      undefined,
      "Phan xe sau duyet",
      audit
    );

    expect(assigned.orders[0]).toMatchObject({
      vehicleId: "v1",
      driverId: "dr1",
      dispatchStatus: "assigned"
    });
    expect(assigned.assignments[0]).toMatchObject({
      dispatchOrderId: pendingOrder.id,
      vehicleId: "v1",
      driverId: "dr1",
      status: "active"
    });
  });
});

describe("driver trip report flow", () => {
  it("stores collected cash and trip expenses for finance review", () => {
    const order = driverProposal({ dispatchStatus: "completed", driverReportStatus: "not_reported" });
    const state = submitDriverTripReport(
      emptyState(order),
      order.id,
      {
        driverCollectedAmount: 1200000,
        driverExpenseFuel: 150000,
        driverExpenseToll: 50000,
        driverExpenseParking: 30000,
        driverExpenseWater: 20000,
        driverExpenseOther: 0,
        driverExpenseNote: "Cau duong + gui xe"
      },
      audit
    );

    expect(state.orders[0]).toMatchObject({
      driverCollectedAmount: 1200000,
      driverExpenseFuel: 150000,
      driverExpenseToll: 50000,
      driverExpenseParking: 30000,
      driverExpenseWater: 20000,
      driverExpenseOther: 0,
      driverExpenseNote: "Cau duong + gui xe",
      driverReportStatus: "reported"
    });
    expect(state.auditEvents[0]).toMatchObject({
      actor: "Driver",
      action: "submitted_driver_trip_report"
    });
  });
});
