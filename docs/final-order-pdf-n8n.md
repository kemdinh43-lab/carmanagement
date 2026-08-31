# Final Dispatch Order PDF via n8n

Muc tieu: app xuat du lieu `Lenh dieu xe final`, n8n tao file PDF theo format ke toan va gui qua Telegram/email.

## 1. Flow dung nghiep vu

1. Sale tao lenh va nhap du thong tin khach hang, hanh trinh, VAT, gia ban.
2. Dieu hanh duyet, phan xe noi bo hoac xe thue ngoai.
3. Tai xe nhan chuyen, bat dau, hoan thanh, bao thu ho va chi phi phat sinh.
4. Ke toan ghi nhan payment, doi soat chi phi/hoa don/cong no.
5. Ke toan dong ho so khi du dieu kien luu tru.
6. Tai man `Tai chinh`, khu `Lenh dieu xe final`, bam:
   - `Xuat lenh`: tai ban HTML de xem nhanh/in thu.
   - `Payload n8n`: tai JSON de debug hoac upload thu cong vao n8n.
   - `Gui n8n`: gui JSON sang webhook n8n de tao PDF va gui Telegram/email.

Luu y: `Final` khong dong nghia da thu du tien. `Final` nghia la du thong tin de ke toan luu ho so. `Closed` moi la ho so da doi soat xong.

## 2. Bien moi truong tren app/Vercel

Them cac bien server-side sau:

```text
N8N_FINAL_ORDER_WEBHOOK_URL=https://n8n.angelonetravel.vn/webhook/aot-final-order-pdf
N8N_FINAL_ORDER_WEBHOOK_SECRET=mot_chuoi_bi_mat_tu_dat
```

Neu chua co webhook URL, nut `Gui n8n` se bao chua cau hinh. Luc do van co the dung `Payload n8n` de test thu cong.

## 3. File generator

Script PDF da duoc dua vao repo:

```text
scripts/aot_lenh_dieu_xe_pdf_generator.py
```

Lenh chay tren server n8n/VPS:

```bash
python3 scripts/aot_lenh_dieu_xe_pdf_generator.py \
  --data /tmp/aot-final-order.json \
  --logo /opt/aot/logo_angel_one.png \
  --output /tmp/Lenh_dieu_xe_AOT-260831-0008.pdf
```

Can cai thu vien tren may chay n8n:

```bash
pip install reportlab pillow
```

## 4. n8n workflow de tao PDF

Workflow V1 nen gom cac node:

1. `Webhook`
   - Method: `POST`
   - Path: `aot-final-order-pdf`
   - Doc body nhan JSON tu app.
   - Neu co secret, kiem tra header `x-aot-webhook-secret`.
2. `Write Binary/File` hoac `Code`
   - Luu body JSON thanh `/tmp/aot-final-order-{{$json.order_no}}.json`.
3. `Execute Command`
   - Goi Python generator voi file JSON, logo va output PDF.
4. `Telegram Send Document`
   - Gui file PDF.
   - Caption lay tu `delivery.telegram_caption`.
5. `Email Send`
   - Gui file PDF neu can.
   - Subject/body lay tu `delivery.email_subject` va `delivery.email_body`.
6. Tra response ve app:

```json
{
  "ok": true,
  "pdf": "Lenh_dieu_xe_AOT-260831-0008.pdf"
}
```

## 5. Schema payload app gui sang n8n

Top-level payload:

```json
{
  "delivery": {
    "schema": "aot_final_dispatch_order_pdf_v1",
    "generated_at": "2026-08-31T09:00:00.000Z",
    "status": "official",
    "filename": "Lenh_dieu_xe_AOT-260831-0008.pdf",
    "telegram_caption": "Lenh dieu xe ...",
    "email_subject": "Lenh dieu xe ...",
    "email_body": "..."
  },
  "order_no": "AOT-260831-0008",
  "order_date": "31/08/2026",
  "city": "Da Nang",
  "management": {},
  "vehicle": {},
  "supplier": {},
  "customer": {},
  "trip": {
    "route_legs": []
  },
  "payments": [],
  "reconciliation": {}
}
```

## 6. Tieu chi pass

- Bam `Payload n8n` tai duoc JSON co ma lenh, khach hang, tai xe, NCC, hanh trinh nhieu chang, VAT, payment, doi soat.
- Chay Python bang JSON do tao duoc PDF.
- Bam `Gui n8n` app tra `Da gui lenh ... sang n8n`.
- Telegram/email nhan dung file PDF, dung caption.
- Reload app, bam lai khong mat du lieu final.
- Neu webhook loi, app bao loi ro rang va khong sua du lieu Supabase.
