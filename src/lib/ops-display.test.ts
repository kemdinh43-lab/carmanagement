import { describe, expect, it } from "vitest";
import { buildDispatchProposalIntegrationPayload } from "./ops-display";
import type { DispatchOrder } from "./types";

describe("dispatch proposal integration payload", () => {
  it("keeps company customer details explicit for dispatcher notifications", () => {
    const order = {
      id: "order-1",
      code: "AOT-TEST-001",
      customerKind: "company",
      customerName: "Công ty Demo",
      companyName: "Công ty Demo",
      taxCode: "0402198423",
      contactName: "Nguyễn Văn A",
      contactPhone: "0901000000",
      pickup: "Huế",
      dropoff: "Đà Nẵng",
      startAt: "2026-10-10T18:04:00+07:00",
      endAt: "2026-10-10T21:04:00+07:00",
      serviceLabel: "Dịch vụ vận tải",
      salesOwner: "Sales Demo",
      source: "Manual",
      amountDue: 1000000,
      routeLegs: [],
      orderStatus: "pending_dispatch_review",
      dispatchStatus: "waiting_assignment",
      paymentStatus: "unpaid",
      invoiceStatus: "pending_info",
      reconciliationStatus: "open"
    } as DispatchOrder;

    const payload = buildDispatchProposalIntegrationPayload(order, "dispatcher");

    expect(payload.telegram.message_text).toContain("Công ty: Công ty Demo");
    expect(payload.telegram.message_text).toContain("MST: 0402198423");
    expect(payload.telegram.message_text).toContain("Người sử dụng: Nguyễn Văn A");
    expect(payload.order).toMatchObject({
      customer_kind: "company",
      customer_name: "Công ty Demo",
      company_name: "Công ty Demo",
      tax_code: "0402198423",
      contact_name: "Nguyễn Văn A"
    });
  });
});
