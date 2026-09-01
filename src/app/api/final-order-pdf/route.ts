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

async function renderFinalOrderPdf(payload: FinalOrderPayload & { order_no: string }) {
  const fontRegular = path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf");
  const fontBold = path.join(process.cwd(), "assets/fonts/NotoSans-Bold.ttf");
  const logoPath = path.join(process.cwd(), "assets/angel-one-logo.png");
  const headerLogoPath = path.join(process.cwd(), "assets/angel-one-logo-cropped.png");
  const management = payload.management ?? {};
  const vehicle = payload.vehicle ?? {};
  const supplier = payload.supplier ?? {};
  const customer = payload.customer ?? {};
  const trip = payload.trip ?? {};
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const reconciliation = payload.reconciliation ?? {};
  const routeLegs = Array.isArray(trip.route_legs)
    ? trip.route_legs as Array<Record<string, unknown>>
    : Array.isArray(trip.legs) ? trip.legs as Array<Record<string, unknown>> : [];

  const mm = (value: number) => value * 2.8346456693;
  const company = {
    name: "CÔNG TY TNHH ANGEL ONE TRAVEL",
    address: "Số 111/3 Nguyễn Công Trứ, phường An Hải, thành phố Đà Nẵng, Việt Nam",
    taxCode: "0402198423",
    email: "angleonetravel@gmail.com"
  };

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.registerFont("AOT-Regular", fontRegular);
    doc.registerFont("AOT-Bold", fontBold);

    const W = doc.page.width;
    const H = doc.page.height;
    const left = mm(12);
    const right = W - mm(12);
    const width = right - left;
    const midGap = mm(3);
    const blockW = (width - midGap) / 2;
    const line = "#bdbdbd";
    const light = "#f0f0f0";
    let y = mm(26);
    const addWatermark = () => {
      doc.save();
      doc.opacity(0.045);
      const wmSize = Math.min(width * 0.96, H * 0.72);
      doc.image(logoPath, (W - wmSize) / 2, (H - wmSize) / 2 - mm(9), { fit: [wmSize, wmSize] });
      doc.restore();
    };

    const write = (value: unknown, x: number, yy: number, size = 6.1, bold = false, options: PDFKit.Mixins.TextOptions = {}) => {
      const content = text(value);
      const maxWidth = typeof options.width === "number" ? options.width : undefined;
      let fontSize = size;
      doc.font(bold ? "AOT-Bold" : "AOT-Regular").fontSize(fontSize).fillColor("#111111");
      if (maxWidth && options.lineBreak !== true) {
        while (fontSize > 4.2 && doc.widthOfString(content) > maxWidth) {
          fontSize -= 0.25;
          doc.fontSize(fontSize);
        }
      }
      doc.text(content, x, yy, { lineBreak: false, ellipsis: true, ...options });
    };
    const section = (title: string) => {
      doc.rect(left, y, width, mm(4)).fill(light);
      write(title.toUpperCase(), left + mm(2), y + mm(0.85), 7.15, true, { width: width - mm(4) });
      y += mm(4.8);
    };
    const pairCell = (x: number, yy: number, w: number, h: number, label: string, value: unknown) => {
      const labelW = w * 0.4;
      doc.rect(x, yy, w, h).lineWidth(0.28).strokeColor(line).stroke();
      doc.moveTo(x + labelW, yy).lineTo(x + labelW, yy + h).strokeColor(line).stroke();
      write(label, x + mm(1), yy + mm(1.18), 6.0, false, { width: labelW - mm(2) });
      write(value, x + labelW + mm(1), yy + mm(1.18), 6.05, true, { width: w - labelW - mm(2) });
    };
    const kvRow = (pairs: Array<[string, unknown]>, h = mm(4)) => {
      if (pairs.length === 1) {
        pairCell(left, y, width, h, pairs[0][0], pairs[0][1]);
      } else {
        pairCell(left, y, blockW, h, pairs[0][0], pairs[0][1]);
        pairCell(left + blockW + midGap, y, blockW, h, pairs[1][0], pairs[1][1]);
      }
      y += h;
    };
    const paymentBlock = (x: number, pmt: Record<string, unknown>, index: number) => {
      const h = mm(26);
      doc.rect(x, y, blockW, h).lineWidth(0.28).strokeColor(line).stroke();
      doc.rect(x, y, blockW, mm(4)).fill(light);
      write(`THANH TOÁN LẦN ${index}`, x + mm(1.1), y + mm(0.9), 6.4, true, { width: blockW - mm(2) });
      const rows: Array<[string, unknown]> = [
        ["Đối tượng thu", pmt.collector_type],
        ["Tên người thu", pmt.collector_name],
        ["Số tiền thu", pmt.amount],
        ["Hình thức thu", pmt.method],
        ["Thời gian thu", pmt.paid_at],
        ["STK / NH", `${text(pmt.bank_account)} / ${text(pmt.bank_name)}`],
        ["Mã/Ghi chú", pmt.reference_note ?? pmt.note]
      ];
      rows.forEach(([label, value], rowIndex) => {
        const yy = y + mm(6.1 + rowIndex * 2.75);
        write(`${label}:`, x + mm(1.2), yy, 5.55, true, { width: mm(25) });
        write(value, x + mm(26.5), yy, 5.55, false, { width: blockW - mm(28) });
      });
    };

    addWatermark();

    doc.image(headerLogoPath, left, mm(27), { fit: [mm(17), mm(17)] });
    write(company.name, left + mm(21), mm(26), 10.6, true, { width: mm(118) });
    write(`Địa chỉ: ${company.address}`, left + mm(21), mm(34), 6.4, false, { width: mm(125) });
    write(`MST: ${company.taxCode}`, left + mm(21), mm(39), 6.4, true, { width: mm(80) });
    write(`Email: ${company.email}`, left + mm(21), mm(44), 6.4, true, { width: mm(80) });
    doc.rect(right - mm(27), mm(28), mm(27), mm(20)).lineWidth(0.8).strokeColor("#111111").stroke();
    write("LỆNH XE", right - mm(27), mm(36.5), 7.2, true, { width: mm(27), align: "center" });
    write(payload.order_no, right - mm(26), mm(42.5), 6.2, false, { width: mm(25), align: "center" });
    doc.moveTo(left, mm(54)).lineTo(right, mm(54)).lineWidth(0.8).strokeColor("#111111").stroke();

    const orderDate = text(payload.order_date, "");
    const parts = orderDate.includes("/") ? orderDate.split("/") : [];
    const dateText = parts.length === 3
      ? `${text(payload.city, "Đà Nẵng")}, ngày ${parts[0]} tháng ${parts[1]} năm ${parts[2]}`
      : `${text(payload.city, "Đà Nẵng")}, ngày ${orderDate}`;
    write("CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", left, mm(60), 8.8, true, { width, align: "center" });
    write("Độc lập - Tự do - Hạnh phúc", left, mm(67), 8.0, true, { width, align: "center" });
    write("--------------------", left, mm(72), 6.9, false, { width, align: "center" });
    write(dateText, left, mm(82), 6.8, false, { width, align: "right" });
    write("LỆNH ĐIỀU XE", left, mm(86), 13, true, { width, align: "center" });
    y = mm(96);

    section("I. THÔNG TIN QUẢN LÝ");
    kvRow([["Quản lý lệnh", management.manager_1], ["Số", payload.order_no]]);
    kvRow([["Ngày", payload.order_date], ["Nguồn", management.source]]);
    kvRow([["Tên người giao xe", management.dispatcher], ["Có xuất hóa đơn", management.output_invoice]]);
    kvRow([["Hình thức xe", management.vehicle_form], ["Loại hợp đồng", management.contract_type]]);

    y += mm(0.9);
    section("II. THÔNG TIN XE");
    kvRow([["Biển số xe", vehicle.plate], ["Họ và tên tài xế", vehicle.driver_name]]);
    kvRow([["CCCD tài xế", vehicle.driver_cccd], ["SĐT tài xế", vehicle.driver_phone]]);

    y += mm(0.9);
    section("III. THÔNG TIN NHÀ CUNG CẤP / CHỦ SỞ HỮU XE");
    kvRow([["Chủ sở hữu xe", supplier.owner_name], ["Số CCCD", supplier.owner_cccd]]);
    kvRow([["Hóa đơn đầu vào", supplier.input_invoice], ["Tên đơn vị thuê ngoài", supplier.supplier_name]]);
    kvRow([["Mã số thuế", supplier.tax_code], ["SĐT nhà cung cấp", supplier.phone]]);
    kvRow([["Địa chỉ", supplier.address]]);
    kvRow([["Tổng tiền mua", supplier.purchase_total], ["STK / Ngân hàng", `${text(supplier.bank_account)} / ${text(supplier.bank_name)}`]]);

    y += mm(0.9);
    section("IV. THÔNG TIN KHÁCH HÀNG");
    kvRow([["Họ và tên khách hàng", customer.name], ["Số CCCD", customer.cccd]]);
    kvRow([["Số điện thoại", customer.phone], ["Tên công ty", customer.company]]);
    kvRow([["Mã số thuế", customer.tax_code], ["Địa chỉ", customer.address]]);
    kvRow([["Số tài khoản", customer.bank_account], ["Tên ngân hàng", customer.bank_name]]);

    y += mm(0.9);
    section("V. HÀNH TRÌNH & DỊCH VỤ");
    kvRow([["Ngày bắt đầu", `${text(trip.start_date)} - ${text(trip.start_time)}`], ["Ngày kết thúc dự kiến", `${text(trip.end_date)} - ${text(trip.end_time_expected)}`]]);
    kvRow([["Điểm đi", trip.pickup], ["Điểm đến", trip.dropoff]]);
    kvRow([["Mã dịch vụ", trip.service_code], ["Đơn vị tính", trip.unit]]);
    kvRow([["Nội dung làm rõ", trip.clarification]]);
    if (routeLegs.length > 0) {
      const visibleRouteLegs = routeLegs.slice(0, 4);
      const h = mm(5.4 + visibleRouteLegs.length * 3.3 + (routeLegs.length > visibleRouteLegs.length ? 3.3 : 0));
      doc.rect(left, y, width, h).lineWidth(0.28).strokeColor(line).stroke();
      write("Chi tiết chặng:", left + mm(2), y + mm(1.1), 6.1, true, { width: mm(24) });
      visibleRouteLegs.forEach((leg, index) => {
        const legText = `${index + 1}) ${text(leg.time)} ${text(leg.from)} -> ${text(leg.to)} | ${text(leg.note)}`;
        write(legText, left + mm(26), y + mm(1.2 + index * 3.3), 5.8, false, { width: width - mm(29) });
      });
      if (routeLegs.length > visibleRouteLegs.length) {
        write(`+ ${routeLegs.length - visibleRouteLegs.length} chặng khác trong hồ sơ`, left + mm(26), y + mm(1.2 + visibleRouteLegs.length * 3.3), 5.8, true, { width: width - mm(29) });
      }
      y += h;
    }
    kvRow([["Thuế suất", trip.tax_rate], ["Tiền hàng", trip.subtotal]]);
    kvRow([["Tiền thuế", trip.tax_amount], ["Tổng thanh toán", trip.total]]);
    kvRow([["Hình thức thanh toán", trip.payment_method], ["Số lần thanh toán", payments.length || "-"]]);

    y += mm(0.9);
    section("VI. THANH TOÁN");
    const paymentBlocks = payments.length > 0 ? payments : [{}];
    paymentBlocks.forEach((payment, index) => {
      if (index > 0 && index % 2 === 0) {
        doc.addPage();
        addWatermark();
        y = mm(20);
        section("VI. THANH TOÁN (TIẾP)");
      }
      const x = index % 2 === 0 ? left : left + blockW + midGap;
      paymentBlock(x, payment, index + 1);
      if (index % 2 === 1 || index === paymentBlocks.length - 1) y += mm(27.2);
    });

    y += mm(0.9);
    section("VII. ĐỐI SOÁT & TRẠNG THÁI");
    kvRow([["Tổng phải thu", reconciliation.receivable_total], ["Đã thu", reconciliation.received_total]], mm(3.7));
    kvRow([["Còn phải thu", reconciliation.receivable_remaining], ["Trạng thái thanh toán", reconciliation.customer_payment_status]], mm(3.7));
    kvRow([["Tổng tiền mua/NCC", reconciliation.supplier_total], ["Đã thanh toán NCC", reconciliation.supplier_paid]], mm(3.7));
    kvRow([["Chi phí phát sinh", reconciliation.extra_cost], ["Lợi nhuận thực tế", reconciliation.actual_profit]], mm(3.7));
    kvRow([["HĐ đầu ra", reconciliation.output_invoice_status], ["HĐ đầu vào", reconciliation.input_invoice_status]], mm(3.7));
    kvRow([["Trạng thái đối soát", reconciliation.reconciliation_status], ["Thời gian chốt", reconciliation.accounting_closed_at]], mm(3.7));

    const footerY = H - mm(13);
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(0.4).strokeColor("#8c8c8c").stroke();
    write(payload.order_no, left, footerY + mm(4), 5.9, false, { width: mm(70) });
    write(company.name, left, footerY + mm(4), 5.9, false, { width, align: "right" });

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
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderFinalOrderPdf(finalPayload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Không tạo được PDF lệnh điều xe trên server.",
        detail: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
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
