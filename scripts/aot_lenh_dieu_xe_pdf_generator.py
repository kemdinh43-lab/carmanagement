# -*- coding: utf-8 -*-
"""
ANGEL ONE TRAVEL - LỆNH ĐIỀU XE FINAL PDF GENERATOR
===================================================

Mục tiêu:
- Xuất PDF 1 trang A4 theo format văn bản Angel One Travel.
- Header có logo nhỏ + thông tin công ty + mã lệnh.
- Watermark dùng chính logo đó, phóng lớn gần full thân trang, nằm phía sau nội dung.
- Footer có số lệnh + tên công ty.
- Nội dung theo đúng thứ tự nghiệp vụ:
  Quản lý -> Xe -> NCC/chủ sở hữu -> Khách hàng -> Hành trình -> Thanh toán -> Đối soát.

Cài thư viện:
    pip install reportlab pillow

Chạy với dữ liệu mẫu:
    python aot_lenh_dieu_xe_pdf_generator.py \
        --logo logo_angel_one.png \
        --output Lenh_dieu_xe_AOT-260831-0008.pdf

Chạy bằng JSON riêng:
    python aot_lenh_dieu_xe_pdf_generator.py \
        --data order.json \
        --logo logo_angel_one.png \
        --output final.pdf

Gợi ý khi tích hợp n8n / API:
- Truyền JSON vào script hoặc gọi hàm generate_pdf(data, logo_path, output_path).
- Logo nên lưu cố định ở Storage/VPS, không lưu lại trong từng lệnh.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


# ============================================================
# 1. CẤU HÌNH CÔNG TY
# ============================================================

COMPANY = {
    "name": "CÔNG TY TNHH ANGEL ONE TRAVEL",
    "address": "Số 111/3 Nguyễn Công Trứ, phường An Hải, thành phố Đà Nẵng, Việt Nam",
    "tax_code": "0402198423",
    "email": "angleonetravel@gmail.com",
}


# ============================================================
# 2. DỮ LIỆU MẪU
# ============================================================

SAMPLE_DATA: Dict[str, Any] = {
    "order_no": "AOT-260831-0008",
    "order_date": "31/08/2026",
    "city": "Đà Nẵng",

    "management": {
        "manager_1": "Nguyễn Văn A",
        "source": "Sale A / Google Ads",
        "dispatcher": "Nguyễn Văn Điều Hành",
        "output_invoice": "Có",
        "vehicle_form": "Thuê ngoài",
        "contract_type": "Hợp đồng giản đơn",
    },

    "vehicle": {
        "plate": "43A-888.88",
        "driver_name": "Trần Văn B",
        "driver_cccd": "0490xxxxxxx",
        "driver_phone": "0909 222 333",
    },

    "supplier": {
        "owner_name": "Công ty/Võ Văn C",
        "owner_cccd": "0480xxxxxxx",
        "input_invoice": "Có",
        "supplier_name": "CÔNG TY TNHH VẬN TẢI ABC",
        "tax_code": "0409876543",
        "address": "100 Nguyễn Văn Linh, Đà Nẵng",
        "phone": "0909 999 888",
        "purchase_total": "800.000 đ",
        "bank_account": "123456789",
        "bank_name": "Vietcombank",
    },

    "customer": {
        "name": "Mrs. Khoa",
        "cccd": "Không cung cấp",
        "phone": "0988 000 111",
        "company": "CÔNG TY TNHH ABC",
        "tax_code": "0401234567",
        "address": "33 Nguyễn Công Trứ, Đà Nẵng",
        "bank_account": "0123456789",
        "bank_name": "VietinBank",
    },

    "trip": {
        "start_date": "31/08/2026",
        "start_time": "08:30",
        "end_date": "31/08/2026",
        "end_time_expected": "16:30",
        "pickup": "Sân bay Đà Nẵng",
        "dropoff": "Hội An → Đà Nẵng",
        "service_code": "DVVT",
        "clarification": "Xe 7 chỗ thuê ngoài đưa đón riêng.",
        "unit": "Chuyến",
        "tax_rate": "8%",
        "subtotal": "1.000.000 đ",
        "tax_amount": "80.000 đ",
        "total": "1.080.000 đ",
        "payment_method": "Chuyển khoản",
        "route_legs": [
            {
                "time": "08:30-10:00",
                "from": "Sân bay Đà Nẵng",
                "to": "Hội An",
                "note": "Khách đáp chuyến VN123",
            },
            {
                "time": "15:00-16:30",
                "from": "Hội An",
                "to": "Đà Nẵng",
                "note": "Đón tại khách sạn",
            },
        ],
    },

    "payments": [
        {
            "collector_type": "Tài xế thuê ngoài",
            "collector_name": "Trần Văn B",
            "amount": "300.000 đ",
            "bank_account": "-",
            "bank_name": "-",
            "note": "Tài xế ngoài thu hộ khi kết thúc chuyến",
        },
        {
            "collector_type": "Công ty",
            "collector_name": "CÔNG TY TNHH ANGEL ONE TRAVEL",
            "amount": "780.000 đ",
            "bank_account": "0048xxxxxxx",
            "bank_name": "VietinBank",
            "note": "Khách chuyển khoản phần còn lại",
        },
    ],

    "reconciliation": {
        "receivable_total": "1.080.000 đ",
        "received_total": "1.080.000 đ",
        "receivable_remaining": "0 đ",
        "customer_payment_status": "Đã thu đủ",
        "supplier_total": "800.000 đ",
        "supplier_paid": "800.000 đ",
        "supplier_remaining": "0 đ",
        "extra_cost": "80.000 đ",
        "actual_profit": "200.000 đ",
        "output_invoice_status": "Đã xử lý",
        "input_invoice_status": "Đã nhận / Không áp dụng",
        "reconciliation_status": "Đã chốt",
        "accounting_closed_at": "31/08/2026 17:30",
    },
}


# ============================================================
# 3. FONT
# ============================================================

def register_fonts() -> None:
    candidates = [
        (
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
        ),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        ),
    ]

    for regular, bold, italic in candidates:
        if Path(regular).exists() and Path(bold).exists() and Path(italic).exists():
            pdfmetrics.registerFont(TTFont("AOT-Regular", regular))
            pdfmetrics.registerFont(TTFont("AOT-Bold", bold))
            pdfmetrics.registerFont(TTFont("AOT-Italic", italic))
            return

    raise FileNotFoundError("Không tìm thấy font Unicode phù hợp trên máy.")


# ============================================================
# 4. HELPERS
# ============================================================

def safe(v: Any, default: str = "-") -> str:
    if v is None or v == "":
        return default
    return str(v)


def fit_line(text: Any, max_width: float, size: float = 6.2, bold: bool = False) -> str:
    font = "AOT-Bold" if bold else "AOT-Regular"
    s = safe(text)
    if pdfmetrics.stringWidth(s, font, size) <= max_width:
        return s

    suffix = "..."
    while s and pdfmetrics.stringWidth(s + suffix, font, size) > max_width:
        s = s[:-1]
    return s + suffix


def create_watermark_logo(logo_path: Path, temp_path: Path, opacity: float = 0.045) -> Path:
    """Tạo ảnh watermark từ cùng file logo, opacity mặc định ~4.5%."""
    im = Image.open(logo_path).convert("RGBA")
    alpha = im.getchannel("A")
    alpha = alpha.point(lambda p: int(p * opacity))
    im.putalpha(alpha)
    im.save(temp_path)
    return temp_path


# ============================================================
# 5. PDF GENERATOR
# ============================================================

def generate_pdf(data: Dict[str, Any], logo_path: str | Path, output_path: str | Path) -> Path:
    register_fonts()

    logo_path = Path(logo_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not logo_path.exists():
        raise FileNotFoundError(f"Không tìm thấy logo: {logo_path}")

    wm_tmp = output_path.with_name(output_path.stem + "_watermark_tmp.png")
    create_watermark_logo(logo_path, wm_tmp, opacity=0.045)

    W, H = A4
    c = canvas.Canvas(str(output_path), pagesize=A4)

    BLACK = colors.black
    LIGHT = colors.Color(0.94, 0.94, 0.94)
    MID = colors.Color(0.78, 0.78, 0.78)

    left = 12 * mm
    right = W - 12 * mm
    top = H - 10 * mm

    def txt(x, y, s, size=7, bold=False, italic=False, align="left"):
        font = "AOT-Bold" if bold else ("AOT-Italic" if italic else "AOT-Regular")
        c.setFont(font, size)
        if align == "center":
            c.drawCentredString(x, y, safe(s))
        elif align == "right":
            c.drawRightString(x, y, safe(s))
        else:
            c.drawString(x, y, safe(s))

    def section_title(y, title):
        c.setFillColor(LIGHT)
        c.rect(left, y - 4.0 * mm, right - left, 4.0 * mm, fill=1, stroke=0)
        c.setFillColor(BLACK)
        txt(left + 2 * mm, y - 2.95 * mm, title.upper(), 7.15, bold=True)
        return y - 4.8 * mm

    def kv_row(y, pairs, height=4.0 * mm):
        gap = 3 * mm
        n = len(pairs)
        colw = ((right - left) - gap * (n - 1)) / n
        x = left

        for label, value in pairs:
            c.setStrokeColor(MID)
            c.setLineWidth(0.28)
            c.rect(x, y - height, colw, height, fill=0, stroke=1)
            labelw = colw * 0.40
            c.line(x + labelw, y - height, x + labelw, y)

            txt(x + 1.0 * mm, y - height + 1.25 * mm,
                fit_line(label, labelw - 2 * mm, 6.05), 6.05)
            txt(x + labelw + 1.0 * mm, y - height + 1.25 * mm,
                fit_line(value, colw - labelw - 2 * mm, 6.15, True), 6.15, bold=True)
            x += colw + gap
        return y - height

    # --------------------------------------------------------
    # WATERMARK: CÙNG LOGO, GẦN FULL THÂN TRANG, VẼ TRƯỚC NỘI DUNG
    # --------------------------------------------------------
    # Logo vuông nên để cạnh khoảng 88% chiều ngang usable page.
    wm_size = min((right - left) * 0.96, H * 0.72)
    wm_x = (W - wm_size) / 2
    wm_y = (H - wm_size) / 2 - 9 * mm
    c.drawImage(
        ImageReader(str(wm_tmp)),
        wm_x,
        wm_y,
        width=wm_size,
        height=wm_size,
        preserveAspectRatio=True,
        mask="auto",
    )

    # --------------------------------------------------------
    # HEADER
    # --------------------------------------------------------
    header_logo_size = 17 * mm
    c.drawImage(
        ImageReader(str(logo_path)),
        left,
        top - 18 * mm,
        width=header_logo_size,
        height=header_logo_size,
        preserveAspectRatio=True,
        mask="auto",
    )

    company_x = left + 21 * mm
    txt(company_x, top - 2 * mm, COMPANY["name"], 10.6, bold=True)
    txt(company_x, top - 6.1 * mm, f"Địa chỉ: {COMPANY['address']}", 6.4)
    txt(company_x, top - 9.7 * mm, f"MST: {COMPANY['tax_code']}", 6.4, bold=True)
    txt(company_x, top - 13.3 * mm, f"Email: {COMPANY['email']}", 6.4, bold=True)

    order_no = safe(data.get("order_no"))
    order_date = safe(data.get("order_date"))
    city = safe(data.get("city"), "Đà Nẵng")

    box_w, box_h = 27 * mm, 20 * mm
    bx, by = right - box_w, top - box_h
    c.setLineWidth(0.8)
    c.rect(bx, by, box_w, box_h)
    txt(bx + box_w / 2, by + 11.8 * mm, "LỆNH XE", 7.2, bold=True, align="center")
    txt(bx + box_w / 2, by + 7.5 * mm, fit_line(order_no, box_w - 3*mm, 6.2), 6.2, align="center")

    sep_y = top - 22.5 * mm
    c.setLineWidth(0.8)
    c.line(left, sep_y, right, sep_y)

    txt(W/2, sep_y - 6.3*mm, "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", 8.8, bold=True, align="center")
    txt(W/2, sep_y - 10.7*mm, "Độc lập - Tự do - Hạnh phúc", 8.0, bold=True, align="center")
    txt(W/2, sep_y - 14.1*mm, "--------------------", 6.9, align="center")

    day, month, year = "", "", ""
    try:
        day, month, year = order_date.split("/")
    except Exception:
        pass
    date_text = f"{city}, ngày {day} tháng {month} năm {year}" if day else f"{city}, ngày {order_date}"
    txt(right, sep_y - 18.5*mm, date_text, 6.8, italic=True, align="right")
    txt(W/2, sep_y - 24.5*mm, "LỆNH ĐIỀU XE", 13.0, bold=True, align="center")

    y = sep_y - 28.2 * mm

    management = data.get("management", {})
    vehicle = data.get("vehicle", {})
    supplier = data.get("supplier", {})
    customer = data.get("customer", {})
    trip = data.get("trip", {})
    payments: List[Dict[str, Any]] = data.get("payments", [])
    rec = data.get("reconciliation", {})

    # --------------------------------------------------------
    # I. QUẢN LÝ
    # --------------------------------------------------------
    y = section_title(y, "I. THÔNG TIN QUẢN LÝ")
    y = kv_row(y, [("Quản lý 1", management.get("manager_1")), ("Số", order_no)])
    y = kv_row(y, [("Ngày", order_date), ("Nguồn", management.get("source"))])
    y = kv_row(y, [("Tên người giao xe", management.get("dispatcher")), ("Có xuất hóa đơn", management.get("output_invoice"))])
    y = kv_row(y, [("Hình thức xe", management.get("vehicle_form")), ("Loại hợp đồng", management.get("contract_type"))])

    # --------------------------------------------------------
    # II. XE
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "II. THÔNG TIN XE")
    y = kv_row(y, [("Biển số xe", vehicle.get("plate")), ("Họ và tên tài xế", vehicle.get("driver_name"))])
    y = kv_row(y, [("CCCD tài xế", vehicle.get("driver_cccd")), ("SĐT tài xế", vehicle.get("driver_phone"))])

    # --------------------------------------------------------
    # III. NCC / CHỦ SỞ HỮU
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "III. THÔNG TIN NHÀ CUNG CẤP / CHỦ SỞ HỮU XE")
    y = kv_row(y, [("Chủ sở hữu xe", supplier.get("owner_name")), ("Số CCCD", supplier.get("owner_cccd"))])
    y = kv_row(y, [("Hóa đơn đầu vào", supplier.get("input_invoice")), ("Tên đơn vị thuê ngoài", supplier.get("supplier_name"))])
    y = kv_row(y, [("Mã số thuế", supplier.get("tax_code")), ("SĐT nhà cung cấp", supplier.get("phone"))])
    y = kv_row(y, [("Địa chỉ", supplier.get("address"))])
    y = kv_row(y, [("Tổng tiền mua", supplier.get("purchase_total")), ("STK / Ngân hàng", f"{safe(supplier.get('bank_account'))} / {safe(supplier.get('bank_name'))}")])

    # --------------------------------------------------------
    # IV. KHÁCH HÀNG
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "IV. THÔNG TIN KHÁCH HÀNG")
    y = kv_row(y, [("Họ và tên khách hàng", customer.get("name")), ("Số CCCD", customer.get("cccd"))])
    y = kv_row(y, [("Số điện thoại", customer.get("phone")), ("Tên công ty", customer.get("company"))])
    y = kv_row(y, [("Mã số thuế", customer.get("tax_code")), ("Địa chỉ", customer.get("address"))])
    y = kv_row(y, [("Số tài khoản", customer.get("bank_account")), ("Tên ngân hàng", customer.get("bank_name"))])

    # --------------------------------------------------------
    # V. HÀNH TRÌNH
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "V. HÀNH TRÌNH & DỊCH VỤ")
    y = kv_row(y, [("Ngày bắt đầu", f"{safe(trip.get('start_date'))} - {safe(trip.get('start_time'))}"),
                   ("Ngày kết thúc dự kiến", f"{safe(trip.get('end_date'))} - {safe(trip.get('end_time_expected'))}")])
    y = kv_row(y, [("Điểm đi", trip.get("pickup")), ("Điểm đến", trip.get("dropoff"))])
    y = kv_row(y, [("Mã dịch vụ", trip.get("service_code")), ("Đơn vị tính", trip.get("unit"))])
    y = kv_row(y, [("Nội dung làm rõ", trip.get("clarification"))])

    route_legs = trip.get("route_legs") or []
    if route_legs:
        route_h = 8.7 * mm
        c.setStrokeColor(MID)
        c.rect(left, y - route_h, right - left, route_h, fill=0, stroke=1)
        txt(left + 2*mm, y - 3.0*mm, "Chi tiết chặng:", 6.1, bold=True)

        display_legs = route_legs[:2]  # template 1 trang hiện ưu tiên 2 chặng; nhiều hơn nên custom layout.
        line_y = y - 3.0*mm
        for idx, leg in enumerate(display_legs, 1):
            leg_text = f"{idx}) {safe(leg.get('time'))} {safe(leg.get('from'))} → {safe(leg.get('to'))} | {safe(leg.get('note'))}"
            txt(left + 26*mm, line_y, fit_line(leg_text, right-left-29*mm, 5.85), 5.85)
            line_y -= 3.3*mm
        y -= route_h

    y = kv_row(y, [("Thuế suất", trip.get("tax_rate")), ("Tiền hàng", trip.get("subtotal"))])
    y = kv_row(y, [("Tiền thuế", trip.get("tax_amount")), ("Tổng thanh toán", trip.get("total"))])
    y = kv_row(y, [("Hình thức thanh toán", trip.get("payment_method")), ("Số lần thanh toán", str(len(payments)))])

    # --------------------------------------------------------
    # VI. THANH TOÁN (hiện tối đa 2 block để giữ 1 trang A4)
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "VI. THANH TOÁN")

    payment_blocks = payments[:2]
    if not payment_blocks:
        payment_blocks = [{}]

    gap = 3 * mm
    block_w = ((right - left) - gap * (len(payment_blocks)-1)) / len(payment_blocks)
    block_h = 20.0 * mm

    for i, pmt in enumerate(payment_blocks):
        x = left + i * (block_w + gap)
        c.setStrokeColor(MID)
        c.rect(x, y - block_h, block_w, block_h, fill=0, stroke=1)
        c.setFillColor(LIGHT)
        c.rect(x, y - 4.0*mm, block_w, 4.0*mm, fill=1, stroke=0)
        c.setFillColor(BLACK)
        txt(x + 1.1*mm, y - 2.95*mm, f"THANH TOÁN LẦN {i+1}", 6.4, bold=True)

        rows = [
            ("Đối tượng thu", pmt.get("collector_type")),
            ("Tên người thu", pmt.get("collector_name")),
            ("Số tiền thu", pmt.get("amount")),
            ("STK / NH", f"{safe(pmt.get('bank_account'))} / {safe(pmt.get('bank_name'))}"),
            ("Ghi chú", pmt.get("note")),
        ]

        yy = y - 6.7 * mm
        for label, value in rows:
            txt(x + 1.2*mm, yy, label + ":", 5.6, bold=True)
            txt(x + 26.5*mm, yy, fit_line(value, block_w - 28.5*mm, 5.6), 5.6)
            yy -= 2.9 * mm

    y -= block_h

    # --------------------------------------------------------
    # VII. ĐỐI SOÁT
    # --------------------------------------------------------
    y -= 0.9 * mm
    y = section_title(y, "VII. ĐỐI SOÁT & TRẠNG THÁI")
    y = kv_row(y, [("Tổng phải thu", rec.get("receivable_total")), ("Đã thu", rec.get("received_total"))], height=3.7*mm)
    y = kv_row(y, [("Còn phải thu", rec.get("receivable_remaining")), ("Trạng thái thanh toán", rec.get("customer_payment_status"))], height=3.7*mm)
    y = kv_row(y, [("Tổng tiền mua/NCC", rec.get("supplier_total")), ("Đã thanh toán NCC", rec.get("supplier_paid"))], height=3.7*mm)
    y = kv_row(y, [("Chi phí phát sinh", rec.get("extra_cost")), ("Lợi nhuận thực tế", rec.get("actual_profit"))], height=3.7*mm)
    y = kv_row(y, [("HĐ đầu ra", rec.get("output_invoice_status")), ("HĐ đầu vào", rec.get("input_invoice_status"))], height=3.7*mm)
    y = kv_row(y, [("Trạng thái đối soát", rec.get("reconciliation_status")), ("Thời gian chốt", rec.get("accounting_closed_at"))], height=3.7*mm)

    # --------------------------------------------------------
    # FOOTER
    # --------------------------------------------------------
    footer_y = 9 * mm
    c.setStrokeColor(colors.Color(0.55, 0.55, 0.55))
    c.setLineWidth(0.4)
    c.line(left, footer_y + 4.0*mm, right, footer_y + 4.0*mm)
    txt(left, footer_y, order_no, 5.9)
    txt(right, footer_y, COMPANY["name"], 5.9, align="right")

    c.showPage()
    c.save()

    try:
        wm_tmp.unlink(missing_ok=True)
    except Exception:
        pass

    return output_path


# ============================================================
# 6. CLI
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Xuất Lệnh điều xe Angel One Travel ra PDF")
    parser.add_argument("--data", help="File JSON dữ liệu lệnh. Nếu bỏ trống dùng SAMPLE_DATA.")
    parser.add_argument("--logo", required=True, help="Đường dẫn file logo PNG/JPG.")
    parser.add_argument("--output", required=True, help="Đường dẫn PDF đầu ra.")
    args = parser.parse_args()

    if args.data:
        with open(args.data, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = SAMPLE_DATA

    pdf = generate_pdf(data, args.logo, args.output)
    print(f"[OK] PDF: {pdf}")


if __name__ == "__main__":
    main()
