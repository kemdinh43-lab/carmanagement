import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import path from "node:path";

type FinalOrderPayload = {
  order_no?: unknown;
  order_date?: unknown;
  city?: unknown;
  delivery?: {
    schema?: unknown;
    filename?: unknown;
    pdf_base64?: unknown;
    pdf_mime_type?: unknown;
  };
  management?: Record<string, unknown>;
  vehicle?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  trip?: Record<string, unknown>;
  payments?: Array<Record<string, unknown>>;
  reconciliation?: Record<string, unknown>;
};

export const runtime = "nodejs";

function webhookConfig() {
  return {
    secret: process.env.N8N_FINAL_ORDER_WEBHOOK_SECRET,
    url: process.env.N8N_FINAL_ORDER_WEBHOOK_URL
  };
}

function validatePayload(payload: FinalOrderPayload | null) {
  if (!payload || typeof payload !== "object") return "Payload không hợp lệ.";
  if (typeof payload.order_no !== "string" || payload.order_no.trim().length === 0) return "Thiếu mã lệnh điều xe.";
  if (payload.delivery?.schema !== "aot_final_dispatch_order_pdf_v1") return "Sai schema payload PDF.";
  return null;
}

function text(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function rowsFromPayload(payload: FinalOrderPayload & { order_no: string }) {
  const management = payload.management ?? {};
  const vehicle = payload.vehicle ?? {};
  const supplier = payload.supplier ?? {};
  const customer = payload.customer ?? {};
  const trip = payload.trip ?? {};
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const reconciliation = payload.reconciliation ?? {};
  const routeLegs = Array.isArray(trip.route_legs) ? trip.route_legs as Array<Record<string, unknown>> : [];

  const rows: Array<[string, string, unknown]> = [
    ["Quản lý", "Số", payload.order_no],
    ["Quản lý", "Ngày", payload.order_date],
    ["Quản lý", "Nguồn", management.source],
    ["Quản lý", "Tài xế", management.dispatcher],
    ["Quản lý", "Có xuất hóa đơn không", management.output_invoice],
    ["Quản lý", "Hình thức xe", management.vehicle_form],
    ["Quản lý", "Loại hợp đồng", management.contract_type],
    ["Thông tin xe", "Biển số xe", vehicle.plate],
    ["Thông tin xe", "Họ và tên tài xế", vehicle.driver_name],
    ["Thông tin xe", "CCCD", vehicle.driver_cccd],
    ["Thông tin xe", "Số điện thoại tài xế", vehicle.driver_phone],
    ["Thông tin nhà cung cấp", "Họ và tên chủ sở hữu xe", supplier.owner_name],
    ["Thông tin nhà cung cấp", "Số CCCD", supplier.owner_cccd],
    ["Thông tin nhà cung cấp", "Có xuất hóa đơn đầu vào không", supplier.input_invoice],
    ["Thông tin nhà cung cấp", "Tên đơn vị thuê ngoài", supplier.supplier_name],
    ["Thông tin nhà cung cấp", "Mã số thuế", supplier.tax_code],
    ["Thông tin nhà cung cấp", "Địa chỉ", supplier.address],
    ["Thông tin nhà cung cấp", "Số điện thoại nhà cung cấp", supplier.phone],
    ["Thông tin nhà cung cấp", "Tổng tiền mua", supplier.purchase_total],
    ["Thông tin nhà cung cấp", "Số tài khoản ngân hàng", supplier.bank_account],
    ["Thông tin nhà cung cấp", "Tên ngân hàng", supplier.bank_name],
    ["Thông tin khách hàng", "Họ và tên khách hàng", customer.name],
    ["Thông tin khách hàng", "Số CCCD", customer.cccd],
    ["Thông tin khách hàng", "Số điện thoại", customer.phone],
    ["Thông tin khách hàng", "Tên công ty", customer.company],
    ["Thông tin khách hàng", "Mã số thuế", customer.tax_code],
    ["Thông tin khách hàng", "Địa chỉ", customer.address],
    ["Thông tin khách hàng", "Số tài khoản", customer.bank_account],
    ["Thông tin khách hàng", "Tên ngân hàng", customer.bank_name],
    ["Hành trình", "Ngày bắt đầu", `${text(trip.start_date)} ${text(trip.start_time, "")}`],
    ["Hành trình", "Ngày kết thúc dự kiến", `${text(trip.end_date)} ${text(trip.end_time_expected, "")}`],
    ["Hành trình", "Điểm đi", trip.pickup],
    ["Hành trình", "Điểm đến", trip.dropoff],
    ["Hành trình", "Mã dịch vụ", trip.service_code],
    ["Hành trình", "Nội dung làm rõ", trip.clarification],
    ["Hành trình", "Đơn vị tính", trip.unit],
    ["Hành trình", "Thuế suất", trip.tax_rate],
    ["Hành trình", "Tiền hàng", trip.subtotal],
    ["Hành trình", "Tiền thuế", trip.tax_amount],
    ["Hành trình", "Tổng thanh toán", trip.total],
    ["Hành trình", "Hình thức thanh toán", trip.payment_method],
    ["Hành trình", "Số lần thanh toán", payments.length || "-"],
    ...routeLegs.map((leg, index) => [
      "Chi tiết chặng",
      `Chặng ${index + 1}`,
      `${text(leg.time)} | ${text(leg.from)} -> ${text(leg.to)} | ${text(leg.note)}`
    ] as [string, string, unknown]),
    ...payments.map((payment, index) => [
      `Thanh toán lần ${index + 1}`,
      text(payment.collector_type),
      `${text(payment.collector_name)} | ${text(payment.amount)} | ${text(payment.bank_account)} | ${text(payment.bank_name)} | ${text(payment.note)}`
    ] as [string, string, unknown]),
    ["Đối soát", "Tổng phải thu", reconciliation.receivable_total],
    ["Đối soát", "Đã thu", reconciliation.received_total],
    ["Đối soát", "Còn phải thu", reconciliation.receivable_remaining],
    ["Đối soát", "Trạng thái thanh toán", reconciliation.customer_payment_status],
    ["Đối soát", "Tổng tiền mua/NCC", reconciliation.supplier_total],
    ["Đối soát", "Đã thanh toán NCC", reconciliation.supplier_paid],
    ["Đối soát", "Còn phải trả NCC", reconciliation.supplier_remaining],
    ["Đối soát", "Chi phí phát sinh", reconciliation.extra_cost],
    ["Đối soát", "Lợi nhuận thực tế", reconciliation.actual_profit],
    ["Đối soát", "HĐ đầu ra", reconciliation.output_invoice_status],
    ["Đối soát", "HĐ đầu vào", reconciliation.input_invoice_status],
    ["Đối soát", "Trạng thái đối soát", reconciliation.reconciliation_status],
    ["Đối soát", "Thời gian chốt", reconciliation.accounting_closed_at]
  ];

  return rows;
}

async function renderFinalOrderPdf(payload: FinalOrderPayload & { order_no: string }) {
  const fontRegular = path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf");
  const fontBold = path.join(process.cwd(), "assets/fonts/NotoSans-Bold.ttf");
  const logoPath = path.join(process.cwd(), "assets/angel-one-logo.png");
  const rows = rowsFromPayload(payload);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 28, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.registerFont("AOT-Regular", fontRegular);
    doc.registerFont("AOT-Bold", fontBold);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colGroup = 88;
    const colLabel = 170;
    const colValue = pageWidth - colGroup - colLabel;
    let y = doc.y;

    const drawWatermark = () => {
      const watermarkSize = Math.min(doc.page.width * 0.75, doc.page.height * 0.75);
      const watermarkX = (doc.page.width - watermarkSize) / 2;
      const watermarkY = (doc.page.height - watermarkSize) / 2 + 18;

      doc.save();
      doc.opacity(0.055);
      doc.image(logoPath, watermarkX, watermarkY, {
        fit: [watermarkSize, watermarkSize],
        align: "center",
        valign: "center"
      });
      doc.restore();
    };

    const drawHeader = () => {
      const headerTop = doc.page.margins.top;
      const logoSize = 42;
      doc.image(logoPath, doc.page.margins.left, headerTop - 6, {
        fit: [logoSize, logoSize],
        align: "center",
        valign: "center"
      });

      doc.font("AOT-Bold").fontSize(15).fillColor("#111827")
        .text("LỆNH ĐIỀU XE", doc.page.margins.left + logoSize + 10, headerTop, {
          width: pageWidth - (logoSize + 20),
          align: "center"
        });
      doc.font("AOT-Regular").fontSize(8).fillColor("#374151")
        .text(`CÔNG TY TNHH ANGEL ONE TRAVEL | ${text(payload.city, "Đà Nẵng")} | ${payload.order_no}`, doc.page.margins.left + logoSize + 10, headerTop + 21, {
          width: pageWidth - (logoSize + 20),
          align: "center"
        });
      doc.moveTo(doc.page.margins.left, headerTop + 48)
        .lineTo(doc.page.width - doc.page.margins.right, headerTop + 48)
        .strokeColor("#cbd5e1")
        .lineWidth(0.8)
        .stroke();

      y = headerTop + 60;
      doc.x = doc.page.margins.left;
      doc.y = y;
      doc.fillColor("#111827");
    };

    const newPageIfNeeded = (height: number) => {
      if (y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
    };

    drawHeader();
    doc.fontSize(7.3);

    rows.forEach(([group, label, value]) => {
      const valueText = text(value);
      const rowHeight = Math.max(
        18,
        doc.heightOfString(valueText, { width: colValue - 8 }) + 8,
        doc.heightOfString(label, { width: colLabel - 8 }) + 8
      );
      newPageIfNeeded(rowHeight);

      const x = doc.page.margins.left;
      const groupFill = group === "Thông tin nhà cung cấp" ? "#67e8f9" : group === "Thông tin khách hàng" || label === "Có xuất hóa đơn không" || label === "Hình thức xe" || label === "Nội dung làm rõ" ? "#fef08a" : "#ffffff";
      doc.rect(x, y, colGroup, rowHeight).fillAndStroke(groupFill, "#cbd5e1");
      doc.rect(x + colGroup, y, colLabel, rowHeight).fillAndStroke("#ffffff", "#cbd5e1");
      doc.rect(x + colGroup + colLabel, y, colValue, rowHeight).fillAndStroke("#ffffff", "#cbd5e1");

      doc.fillColor("#111827").font("AOT-Regular").fontSize(7.1);
      doc.text(group, x + 4, y + 5, { width: colGroup - 8 });
      doc.font("AOT-Bold").text(label, x + colGroup + 4, y + 5, { width: colLabel - 8 });
      doc.font("AOT-Regular").text(valueText, x + colGroup + colLabel + 4, y + 5, { width: colValue - 8 });
      y += rowHeight;
    });

    doc.moveDown(1);
    doc.font("AOT-Regular").fontSize(7).fillColor("#64748b").text(`Xuất lúc: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, { align: "right" });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      drawWatermark();
    }

    doc.end();
  });
}

export async function POST(request: Request) {
  const { secret, url } = webhookConfig();
  if (!url) {
    return NextResponse.json(
      {
        error: "Chưa cấu hình N8N_FINAL_ORDER_WEBHOOK_URL trên server/Vercel.",
        message: "Tải Payload n8n để test thủ công, hoặc thêm webhook URL rồi bấm Gửi n8n."
      },
      { status: 501 }
    );
  }

  const payload = (await request.json().catch(() => null)) as FinalOrderPayload | null;
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const finalPayload = payload as FinalOrderPayload & { order_no: string };
  const pdfBuffer = await renderFinalOrderPdf(finalPayload);
  const payloadWithPdf: FinalOrderPayload & { order_no: string } = {
    ...finalPayload,
    delivery: {
      ...finalPayload.delivery,
      pdf_base64: pdfBuffer.toString("base64"),
      pdf_mime_type: "application/pdf"
    }
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-aot-webhook-secret": secret } : {})
      },
      body: JSON.stringify(payloadWithPdf)
    });
  } catch (error) {
    return NextResponse.json({ error: `Không gọi được n8n webhook: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }

  const text = await response.text();
  let n8nResponse: unknown = text;
  try {
    n8nResponse = text ? JSON.parse(text) : null;
  } catch {
    n8nResponse = text.slice(0, 1000);
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `n8n webhook lỗi HTTP ${response.status}.`,
        n8nResponse
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Đã gửi lệnh ${finalPayload.order_no} sang n8n để tạo PDF.`,
    n8nResponse
  });
}
