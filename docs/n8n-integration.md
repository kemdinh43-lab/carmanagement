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
```

Migration nay them cac RPC cho n8n:

- `claim_pending_integration_events(p_limit)` lay cac event dang `pending/failed`, khoa tam bang cach doi sang `processing`.
- `mark_integration_event_sent(p_event_id)` danh dau da gui.
- `mark_integration_event_failed(p_event_id, p_error)` ghi loi va dua ve `pending` de retry, toi da 5 lan.
- `reserve_integration_delivery(...)` tao delivery key unique theo `channel + recipient + dedupe_key` de workflow execute lai cung khong gui trung.
- `mark_integration_delivery_sent(...)` va `mark_integration_delivery_failed(...)` ghi ket qua gui tung kenh.

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
TELEGRAM_CHAT_MANAGER=...
TELEGRAM_CHAT_DISPATCHER=...
TELEGRAM_CHAT_SALE=...
TELEGRAM_CHAT_ACCOUNTANT=...
TELEGRAM_CHAT_DRIVER=...
```

Neu chua co du nhom, chi can dat `TELEGRAM_CHAT_ADMIN`; cac audience khac se fallback ve admin de test. Khi dung chung mot chat de test, workflow se gom cac event trung noi dung de khong spam mot chat.

## 3. Import Workflow

Import file:

```text
docs/n8n-telegram-event-queue-workflow.json
```

Workflow dang chay moi 1 phut. Co the bam `Execute workflow` de test ngay.

## 4. Flow Test

1. Sale tao de xuat lenh.
2. Kiem tra table `app_integration_events` co event `pending`.
3. Chay workflow n8n.
4. Telegram nhan tin.
5. Event doi thanh `sent`.

Neu Telegram loi, event se ve `pending` hoac `failed` sau 5 lan, cot `last_error` se ghi ly do.

## 5. Zalo

Zalo lam sau khi Telegram pass. Cach lam giong Telegram, nhung node gui tin se doi sang Zalo OA API va can them mapping nguoi nhan theo Zalo user id hoac group/channel.
