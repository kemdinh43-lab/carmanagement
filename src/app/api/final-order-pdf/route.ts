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

const serviceLabelByCode: Record<string, string> = {
  DVVT: "Dịch vụ vận tải",
  DVHL: "Dịch vụ lữ hành",
  DVHT: "Dịch vụ hợp tác",
  DVCT: "Dịch vụ cho thuê"
};

const provinceLabelByCode: Record<string, string> = {
  DAD: "Đà Nẵng",
  QNH: "Quảng Nam / Hội An",
  HUE: "Huế",
  HAN: "Hà Nội",
  SGN: "TP.HCM",
  QYN: "Quy Nhơn"
};

function normalizedServiceLabel(code: unknown, label: unknown) {
  const rawLabel = text(label, "").trim();
  if (rawLabel && rawLabel !== "-") return rawLabel;
  const rawCode = text(code, "").trim().toUpperCase();
  return serviceLabelByCode[rawCode] ?? "-";
}

function normalizedProvinceRouteLabel(value: unknown) {
  const raw = text(value, "").trim();
  if (!raw || raw === "-") return "-";

  const codePair = raw.match(/^([A-Z]{2,4})-([A-Z]{2,4})\b/);
  if (codePair) {
    const from = provinceLabelByCode[codePair[1]] ?? codePair[1];
    const to = provinceLabelByCode[codePair[2]] ?? codePair[2];
    return `${from} - ${to}`;
  }

  return raw.replace(/\b[A-Z]{2,4}\s*-\s*/g, "").replace(/\s{2,}/g, " ").trim() || raw;
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
  const routeLegs = Array.isArray(trip.route_legs)
    ? trip.route_legs as Array<Record<string, unknown>>
    : Array.isArray(trip.legs) ? trip.legs as Array<Record<string, unknown>> : [];
  const supplierInputInvoice = text(supplier.input_invoice) === "-" ? "Có" : supplier.input_invoice;
  const provinceRouteLabel = normalizedProvinceRouteLabel(management.province_route_code);
  const serviceLabel = normalizedServiceLabel(trip.service_code, trip.service_label);

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
    let y = mm(16);
    const addWatermark = () => {
      doc.save();
      doc.opacity(0.045);
      const wmSize = Math.min(width * 0.96, H * 0.72);
      doc.image(logoPath, (W - wmSize) / 2, (H - wmSize) / 2 - mm(9), { fit: [wmSize, wmSize] });
      doc.restore();
    };

    const write = (value: unknown, x: number, yy: number, size = 6.7, bold = false, options: PDFKit.Mixins.TextOptions = {}) => {
      const content = text(value);
      const maxWidth = typeof options.width === "number" ? options.width : undefined;
      let fontSize = size;
      doc.font(bold ? "AOT-Bold" : "AOT-Regular").fontSize(fontSize).fillColor("#111111");
      if (maxWidth && options.lineBreak !== true) {
        while (fontSize > 4.8 && doc.widthOfString(content) > maxWidth) {
          fontSize -= 0.2;
          doc.fontSize(fontSize);
        }
      }
      doc.text(content, x, yy, { lineBreak: false, ellipsis: true, ...options });
    };
    const section = (title: string) => {
      doc.rect(left, y, width, mm(4.6)).fill(light);
      write(title.toUpperCase(), left + mm(2), y + mm(0.95), 7.65, true, { width: width - mm(4) });
      y += mm(5.3);
    };
    const pairCell = (x: number, yy: number, w: number, h: number, label: string, value: unknown) => {
      const labelW = w * 0.4;
      doc.rect(x, yy, w, h).lineWidth(0.28).strokeColor(line).stroke();
      doc.moveTo(x + labelW, yy).lineTo(x + labelW, yy + h).strokeColor(line).stroke();
      write(label, x + mm(1), yy + mm(1.22), 6.45, false, { width: labelW - mm(2) });
      write(value, x + labelW + mm(1), yy + mm(1.22), 6.55, true, { width: w - labelW - mm(2) });
    };
    const kvRow = (pairs: Array<[string, unknown]>, h = mm(4.55)) => {
      if (pairs.length === 1) {
        pairCell(left, y, width, h, pairs[0][0], pairs[0][1]);
      } else {
        pairCell(left, y, blockW, h, pairs[0][0], pairs[0][1]);
        pairCell(left + blockW + midGap, y, blockW, h, pairs[1][0], pairs[1][1]);
      }
      y += h;
    };
    const fullWidthRow = (label: string, value: unknown, h = mm(7.4)) => {
      const labelW = width * 0.18;
      doc.rect(left, y, width, h).lineWidth(0.28).strokeColor(line).stroke();
      doc.moveTo(left + labelW, y).lineTo(left + labelW, y + h).strokeColor(line).stroke();
      write(label, left + mm(1), y + mm(1.45), 6.45, false, { width: labelW - mm(2) });
      write(value, left + labelW + mm(1), y + mm(1.35), 6.55, true, {
        width: width - labelW - mm(2),
        height: h - mm(2),
        lineBreak: true
      });
      y += h;
    };
    const paymentBlock = (x: number, pmt: Record<string, unknown>, index: number) => {
      const h = mm(29);
      doc.rect(x, y, blockW, h).lineWidth(0.28).strokeColor(line).stroke();
      doc.rect(x, y, blockW, mm(4.7)).fill(light);
      write(`THANH TOÁN LẦN ${index}`, x + mm(1.1), y + mm(1.05), 6.95, true, { width: blockW - mm(2) });
      const rows: Array<[string, unknown]> = [
        ["Đối tượng thu", pmt.collector_type],
        ["Tên người thu", pmt.collector_name],
        ["Số tiền thu", pmt.amount],
        ["Hình thức thu", pmt.method],
        ["Thời gian thu", pmt.paid_at],
        ["STK / NH", `${text(pmt.bank_account)} / ${text(pmt.bank_name)}`],
        ["Thời gian nhập", pmt.entry_time_note ?? pmt.reference_note ?? pmt.note]
      ];
      rows.forEach(([label, value], rowIndex) => {
        const yy = y + mm(6.5 + rowIndex * 3.05);
        write(`${label}:`, x + mm(1.2), yy, 6.0, true, { width: mm(26) });
        write(value, x + mm(27.8), yy, 6.0, false, { width: blockW - mm(29.5) });
      });
    };

    addWatermark();

    doc.image(headerLogoPath, left, mm(14), { fit: [mm(17), mm(17)] });
    write(company.name, left + mm(21), mm(13), 11.0, true, { width: mm(118) });
    write(`Địa chỉ: ${company.address}`, left + mm(21), mm(21), 6.8, false, { width: mm(125) });
    write(`MST: ${company.taxCode}`, left + mm(21), mm(26.3), 6.8, true, { width: mm(80) });
    write(`Email: ${company.email}`, left + mm(21), mm(31.6), 6.8, true, { width: mm(80) });
    doc.rect(right - mm(27), mm(14), mm(27), mm(20)).lineWidth(0.8).strokeColor("#111111").stroke();
    write("LỆNH XE", right - mm(27), mm(22.5), 7.5, true, { width: mm(27), align: "center" });
    write(payload.order_no, right - mm(26), mm(28.6), 6.45, false, { width: mm(25), align: "center" });
    doc.moveTo(left, mm(40)).lineTo(right, mm(40)).lineWidth(0.8).strokeColor("#111111").stroke();

    const orderDate = text(payload.order_date, "");
    const parts = orderDate.includes("/") ? orderDate.split("/") : [];
    const dateText = parts.length === 3
      ? `${text(payload.city, "Đà Nẵng")}, ngày ${parts[0]} tháng ${parts[1]} năm ${parts[2]}`
      : `${text(payload.city, "Đà Nẵng")}, ngày ${orderDate}`;
    write(dateText, left, mm(46), 7.1, false, { width, align: "right" });
    write("LỆNH ĐIỀU XE", left, mm(52), 14.2, true, { width, align: "center" });
    y = mm(62);

    section("I. THÔNG TIN QUẢN LÝ");
    kvRow([["Quản lý lệnh", management.manager_1], ["Số", payload.order_no]]);
    kvRow([["Ngày", payload.order_date], ["Nguồn", management.source]]);
    kvRow([["Tên người giao nguồn", management.dispatcher], ["Có xuất hóa đơn", management.output_invoice]]);
    kvRow([["Số lượng khách", management.guest_count], ["Dòng khách", management.guest_market]]);
    kvRow([["Nhận biết khách", management.customer_recognition_code], ["Nguồn khách", management.customer_source_code]]);
    kvRow([["Mã tỉnh/thành", provinceRouteLabel], ["Hình thức xe", management.vehicle_form]]);
    kvRow([["Loại hợp đồng", management.contract_type]]);

    y += mm(0.9);
    section("II. THÔNG TIN XE");
    kvRow([["Biển số xe", vehicle.plate], ["Họ và tên tài xế", vehicle.driver_name]]);
    kvRow([["CCCD tài xế", vehicle.driver_cccd], ["SĐT tài xế", vehicle.driver_phone]]);

    y += mm(0.9);
    section("III. THÔNG TIN NHÀ CUNG CẤP / CHỦ SỞ HỮU XE");
    kvRow([["Chủ sở hữu xe", supplier.owner_name], ["Số CCCD", supplier.owner_cccd]]);
    kvRow([["Hóa đơn đầu vào", supplierInputInvoice], ["Tên đơn vị thuê ngoài", supplier.supplier_name]]);
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
    fullWidthRow("Điểm đi", trip.pickup);
    fullWidthRow("Điểm đến", trip.dropoff);
    kvRow([["Mã dịch vụ", trip.service_code], ["Dịch vụ", serviceLabel]]);
    kvRow([["Đơn vị tính", trip.unit]]);
    kvRow([["Nội dung làm rõ", trip.clarification]]);
    if (routeLegs.length > 0) {
      const visibleRouteLegs = routeLegs.slice(0, 4);
      const h = mm(6.3 + visibleRouteLegs.length * 3.65 + (routeLegs.length > visibleRouteLegs.length ? 3.65 : 0));
      doc.rect(left, y, width, h).lineWidth(0.28).strokeColor(line).stroke();
      write("Chi tiết chặng:", left + mm(2), y + mm(1.25), 6.75, true, { width: mm(26) });
      visibleRouteLegs.forEach((leg, index) => {
        const note = text(leg.note, "");
        const legText = `${index + 1}) ${text(leg.time)} ${text(leg.from)} -> ${text(leg.to)}${note ? ` ${note}` : ""}`;
        write(legText, left + mm(28), y + mm(1.35 + index * 3.65), 6.25, false, { width: width - mm(31) });
      });
      if (routeLegs.length > visibleRouteLegs.length) {
        write(`+ ${routeLegs.length - visibleRouteLegs.length} chặng khác trong hồ sơ`, left + mm(28), y + mm(1.35 + visibleRouteLegs.length * 3.65), 6.25, true, { width: width - mm(31) });
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
        y = mm(16);
        section("VI. THANH TOÁN (TIẾP)");
      }
      const x = index % 2 === 0 ? left : left + blockW + midGap;
      paymentBlock(x, payment, index + 1);
      if (index % 2 === 1 || index === paymentBlocks.length - 1) y += mm(30.2);
    });

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
