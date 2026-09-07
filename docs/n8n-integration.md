# n8n Notification Integration

Muc tieu: app chi ghi su kien vao Supabase, n8n doc hang doi va gui Telegram/Zalo.

Rieng luong xuat `Lenh dieu xe final` thanh PDF va gui file qua Telegram/email xem them:

```text
docs/final-order-pdf-n8n.md
```

## 1. Supabase

Chay migration:

```sql
supabase/migrations/0025_n8n_integration_event_claims.sql
supabase/migrations/0028_integration_delivery_dedupe.sql
supabase/migrations/0041_telegram_recipient_identity.sql
```

Migration nay them cac RPC cho n8n:

- `claim_pending_integration_events(p_limit)` lay cac event dang `pending/failed`, khoa tam bang cach doi sang `processing`.
- `mark_integration_event_sent(p_event_id)` danh dau da gui.
- `mark_integration_event_failed(p_event_id, p_error)` ghi loi va dua ve `pending` de retry, toi da 5 lan.
- `reserve_integration_delivery(...)` tao delivery key unique theo `channel + recipient + dedupe_key` de workflow execute lai cung khong gui trung.
- `mark_integration_delivery_sent(...)` va `mark_integration_delivery_failed(...)` ghi ket qua gui tung kenh.
- `create_telegram_link_token(...)` tao token ket noi Telegram cho tung user hoac tai xe.
- `connect_telegram_recipient(...)` gan Telegram chat ID vao dung `app_user_profiles` hoac `app_drivers`.

## 2. n8n Variables / Environment Variables

Workflow doc config theo thu tu:

1. n8n `Variables`
2. server environment variables

Neu n8n cua ban co muc `Variables`, co the nhap truc tiep trong UI, khong can SSH vao VPS.

Can dat cac bien nay:

```text
SUPABASE_URL=https://cyagfkfaclwhafocdqgy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ADMIN=...
APP_URL=https://carmanagement-seven.vercel.app
```

Khong dung `TELEGRAM_CHAT_DRIVER`, `TELEGRAM_CHAT_SALE`, `TELEGRAM_CHAT_DISPATCHER`, `TELEGRAM_CHAT_ACCOUNTANT` trong production. Cac bien chat theo role chi phu hop test legacy vi rat de gui nham nguoi. Production phai ket noi Telegram theo tung ho so:

- Tai xe: `app_drivers.telegram_chat_id`
- Noi bo sale/dieu hanh/ke toan/manager/admin: `app_user_profiles.telegram_chat_id`
- `TELEGRAM_CHAT_ADMIN` chi dung de bao loi ky thuat hoac can cau hinh nguoi nhan, khong fallback thay cho thong bao nghiep vu.

## 3. Ket Noi Telegram Theo Tung Nguoi

1. Manager/admin goi RPC `create_telegram_link_token`.
2. Gui link cho dung nguoi: `https://t.me/<bot_username>?start=<token>`.
3. Nguoi nhan bam Start trong Telegram.
4. Workflow dung code `docs/n8n-telegram-account-linking-code.js` goi RPC `connect_telegram_recipient`.
5. Supabase luu `telegram_chat_id`, `telegram_username`, `telegram_connected_at`, `telegram_enabled = true`.

## 4. Import Workflow

Import file:

```text
docs/n8n-telegram-event-queue-workflow.json
```

Workflow dang chay moi 1 phut. Co the bam `Execute workflow` de test ngay.

Import them workflow Telegram Trigger cho luong `/start TOKEN`, dung code:

```text
docs/n8n-telegram-account-linking-code.js
```

Neu dung reminder tai xe, dung code:

```text
docs/n8n-driver-ack-reminder-code.js
```

## 5. Logic Nguoi Nhan

Thu tu resolve nguoi nhan:

1. `target_driver_id`: gui dung tai xe duoc gan trong `app_drivers`.
2. `target_user_id`: gui dung user noi bo trong `app_user_profiles`.
3. `audience`: fan-out den tat ca user cua role do da bat `telegram_enabled`.

Neu khong tim thay chat ID, event bi danh dau failed de retry sau khi lien ket Telegram; workflow chi gui canh bao cau hinh den `TELEGRAM_CHAT_ADMIN`.

## 6. Flow Test

1. Sale tao de xuat lenh.
2. Kiem tra table `app_integration_events` co event `pending`.
3. Kiem tra event co `target_user_id`, `target_driver_id` hoac `audience` dung.
4. Chay workflow n8n.
5. Telegram dung nguoi nhan tin.
6. Kiem tra `app_integration_deliveries` chi co mot delivery cho cung `channel + recipient + dedupe_key`.
7. Chay lai workflow, Telegram khong gui trung.
8. Event doi thanh `sent`.

Neu Telegram loi, event se ve `pending` hoac `failed` sau 5 lan, cot `last_error` se ghi ly do.

## 7. Zalo

Zalo lam sau khi Telegram pass. Cach lam giong Telegram, nhung node gui tin se doi sang Zalo OA API va can them mapping nguoi nhan theo Zalo user id hoac group/channel.
