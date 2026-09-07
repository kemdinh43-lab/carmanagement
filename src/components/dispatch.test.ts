// @vitest-environment jsdom
import { createElement, type FormEvent } from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DispatchPanel } from "./ops-app";
import type { DispatchOrder, Driver, Payment, Vehicle } from "@/lib/types";

afterEach(cleanup);

const driver: Driver = {
  id: "driver-1",
  fullName: "Le Van Hung",
  phone: "0900000001",
  cccd: "049083006882",
  status: "active"
};

const vehicle: Vehicle = {
  id: "vehicle-1",
  plateNo: "43B-012.34",
  type: "Hyundai County",
  seats: 29,
  ownershipType: "rented",
  status: "active"
};

function orderFixture(overrides: Partial<DispatchOrder> = {}): DispatchOrder {
  return {
    id: "order-1",
    code: "V0003/08.2026/NĐ/DL/T/DAD-DAD",
    customerKind: "company",
    customerName: "DINH THANH TUNG",
    companyName: "Cong ty Viettravel",
    contactName: "DINH THANH TUNG",
    contactPhone: "0988 000 111",
    taxCode: "0401234567",
    pickup: "Kiệt 18/3b Phan Tứ, TP Đà Nẵng",
    dropoff: "Bà Nà Hills",
    routeLegs: [
      {
        startAt: "2026-09-15T13:04:00+07:00",
        endAt: "2026-09-15T16:04:00+07:00",
        pickup: "Kiệt 18/3b Phan Tứ, TP Đà Nẵng",
        dropoff: "Hoi An Ancient Town"
      },
      {
        startAt: "2026-09-15T19:04:00+07:00",
        endAt: "2026-09-15T19:09:00+07:00",
        pickup: "Hoi An Ancient Town",
        dropoff: "Bà Nà Hills"
      }
    ],
    serviceLabel: "Dịch vụ vận tải",
    salesOwner: "Nguyễn Quang Nam",
    source: "Manual",
    guestCount: 4,
    vehicleOwnership: "rented",
    vehicleId: "vehicle-1",
    driverId: "driver-1",
    vehiclePlateNo: "43B-012.34",
    driverFullName: "Le Van Hung",
    driverPhone: "0900000001",
    driverCccd: "049083006882",
    supplierCompanyName: "NCC Da Nang",
    supplierTaxCode: "0409999999",
    subtotalAmount: 1200000,
    vatRate: 10,
    vatAmount: 120000,
    amountDue: 1320000,
    orderStatus: "pending_dispatch_review",
    dispatchStatus: "waiting_assignment",
    paymentStatus: "partial",
    invoiceStatus: "pending_info",
    reconciliationStatus: "open",
    startAt: "2026-09-15T13:04:00+07:00",
    endAt: "2026-09-15T19:09:00+07:00",
    ...overrides
  };
}

function renderDispatch(orders: DispatchOrder[], selectedOrder = orders[0], payments: Payment[] = []) {
  return render(createElement(DispatchPanel, {
    accountControls: null,
    assignments: [],
    auditEvents: [],
    calendarDay: new Date("2026-09-15T00:00:00+07:00"),
    calendarMonth: new Date("2026-09-01T00:00:00+07:00"),
    compact: false,
    currentRole: "dispatcher",
    drivers: [driver],
    isActionPending: () => false,
    orders,
    payments,
    selectedOrder,
    vehicles: [vehicle],
    assignOrder: vi.fn(async (event: FormEvent<HTMLFormElement>) => event.preventDefault()),
    cancelOrder: vi.fn(),
    reviewDispatchProposal: vi.fn(),
    setCalendarDay: vi.fn(),
    setCalendarMonth: vi.fn(),
    setSelectedOrderId: vi.fn(),
    updateDispatchStatus: vi.fn(),
    updateOrder: vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())
  }));
}

it("shows every route leg in dispatch details instead of merging first pickup and last dropoff", () => {
  const { container } = renderDispatch([orderFixture()]);
  const detail = container.querySelector(".dispatch-detail-card") as HTMLElement;

  expect(within(detail).getByText("Chặng 1")).toBeTruthy();
  expect(within(detail).getByText("Chặng 2")).toBeTruthy();
  expect(within(detail).getByText("Kiệt 18/3b Phan Tứ, TP Đà Nẵng")).toBeTruthy();
  expect(within(detail).getAllByText("Hoi An Ancient Town")).toHaveLength(2);
  expect(within(detail).getByText("Bà Nà Hills")).toBeTruthy();
  expect(within(detail).getByText("Trả khách · 16:04 · 15/09/2026")).toBeTruthy();
  expect(within(detail).getByText("Trả khách · 19:09 · 15/09/2026")).toBeTruthy();
});

it("keeps pending dispatch proposals before regular queue content on overview and orders screens", () => {
  const pendingLater = orderFixture({
    id: "pending-later",
    code: "PENDING-LATER",
    orderStatus: "pending_dispatch_review",
    dispatchStatus: "waiting_assignment",
    startAt: "2026-09-15T18:00:00+07:00",
    endAt: "2026-09-15T19:00:00+07:00"
  });
  const regularEarlier = orderFixture({
    id: "regular-earlier",
    code: "REGULAR-EARLIER",
    orderStatus: "confirmed",
    dispatchStatus: "waiting_assignment",
    startAt: "2026-09-15T08:00:00+07:00",
    endAt: "2026-09-15T09:00:00+07:00"
  });
  const { container } = renderDispatch([regularEarlier, pendingLater], pendingLater);
  const desktop = container.querySelector(".dispatch-ui > div") as HTMLElement;

  expect(desktop.textContent!.indexOf("Hàng chờ duyệt điều xe")).toBeLessThan(desktop.textContent!.indexOf("Danh sách lệnh cần xử lý"));
  expect(desktop.textContent!.indexOf("PENDING-LATER")).toBeLessThan(desktop.textContent!.indexOf("REGULAR-EARLIER"));

  fireEvent.click(within(desktop).getByRole("button", { name: "Lệnh" }));
  const orderContent = desktop.querySelector(".dispatch-orders-layout section") as HTMLElement;
  expect(orderContent.textContent!.indexOf("Hàng chờ duyệt điều xe")).toBeLessThan(orderContent.textContent!.indexOf("Danh sách lệnh"));
});

it("submits dispatch edit data for rented vehicle supplier profile without dropping driver CCCD", () => {
  const selectedOrder = orderFixture();
  const updateOrder = vi.fn((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    expect(form.get("driverCccd")).toBe("049083006882");
    expect(form.get("supplierCompanyName")).toBe("NCC Da Nang Updated");
    expect(form.get("supplierTaxCode")).toBe("0409999999");
    expect(form.get("vehicleOwnership")).toBe("rented");
    expect(form.get("editReason")).toBe("Dispatcher updated supplier profile");
  });
  const { container } = render(createElement(DispatchPanel, {
    accountControls: null,
    assignments: [],
    auditEvents: [],
    calendarDay: new Date("2026-09-15T00:00:00+07:00"),
    calendarMonth: new Date("2026-09-01T00:00:00+07:00"),
    compact: false,
    currentRole: "dispatcher",
    drivers: [driver],
    isActionPending: () => false,
    orders: [selectedOrder],
    payments: [],
    selectedOrder,
    vehicles: [vehicle],
    assignOrder: vi.fn(async (event: FormEvent<HTMLFormElement>) => event.preventDefault()),
    cancelOrder: vi.fn(),
    reviewDispatchProposal: vi.fn(),
    setCalendarDay: vi.fn(),
    setCalendarMonth: vi.fn(),
    setSelectedOrderId: vi.fn(),
    updateDispatchStatus: vi.fn(),
    updateOrder
  }));
  const desktop = container.querySelector(".dispatch-ui > div") as HTMLElement;
  fireEvent.click(within(desktop).getByRole("button", { name: /Sửa lệnh/ }));
  const form = desktop.querySelector("form.dispatch-supplier-form") as HTMLElement;
  fireEvent.change(within(form).getByLabelText("Đơn vị sở hữu/NCC"), { target: { value: "NCC Da Nang Updated" } });
  fireEvent.submit(form);

  expect(updateOrder).toHaveBeenCalledOnce();
});
