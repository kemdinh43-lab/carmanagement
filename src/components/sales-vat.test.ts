// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OrdersPanel } from "./ops-app";
import { calculateVatSummaryFromForm } from "@/lib/domain";

afterEach(cleanup);

it.each([0, 8, 10])("preserves VAT rate %s through native input/change, preview and submission", async (rate) => {
  vi.stubGlobal("scrollTo", vi.fn());
  const submit = vi.fn(async (event) => {
    event.preventDefault();
    expect(calculateVatSummaryFromForm(new FormData(event.currentTarget))).toEqual({
      subtotalAmount: 1000000, vatRate: rate, vatAmount: rate * 10000, amountDue: 1000000 + rate * 10000
    });
  });
  const { container } = render(createElement(OrdersPanel, {
    assignments: [], auditEvents: [], companies: [], companyContacts: [], customerKind: "individual",
    currentRole: "sale", customers: [], drivers: [], filteredOrders: [], payments: [], query: "", vehicles: [],
    isActionPending: () => false, setCustomerKind: vi.fn(), setQuery: vi.fn(), setSelectedOrderId: vi.fn(),
    setTab: vi.fn(), createOrder: submit, cancelOrder: vi.fn(), promoteDriverProposalToDispatch: vi.fn(),
    resendSelectedOrderToDispatch: vi.fn(), updateOrder: vi.fn(), updateQuoteStatus: vi.fn()
  }));
  const form = container.querySelector("form")!;
  const subtotal = form.querySelector<HTMLInputElement>('[name="subtotalAmount"]')!;
  fireEvent.change(subtotal, { target: { value: "1000000" } });
  const select = form.querySelector<HTMLSelectElement>('[name="vatRate"]')!;
  // Browsers emit input before change; allow the parent render between events.
  for (const nextRate of [8, 10, rate]) {
    select.value = String(nextRate);
    await act(async () => { fireEvent.input(select); });
    expect(select.value).toBe(String(nextRate));
    await act(async () => { fireEvent.change(select); });
  }
  expect(form.querySelector<HTMLInputElement>('[name="vatAmount"]')!.value).toBe(String(rate * 10000));
  for (let step = 1; step < 6; step++) fireEvent.click(within(form).getByRole("button", { name: /Tiếp tục/ }));
  expect(within(form).getByText(`${rate}%`, { selector: "strong" })).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "Quay lại" }));
  expect(select.value).toBe(String(rate));
  fireEvent.click(within(form).getByRole("button", { name: /Tiếp tục/ }));
  await act(async () => { fireEvent.submit(form); });
  expect(submit).toHaveBeenCalledOnce();
});
