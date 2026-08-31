# n8n Notification Integration

Muc tieu: app chi ghi su kien vao Supabase, n8n doc hang doi va gui Telegram/Zalo.

## 1. Supabase

Chay migration:

```sql
supabase/migrations/0025_n8n_integration_event_claims.sql
```

Migration nay them 3 RPC cho n8n:

- `claim_pending_integration_events(p_limit)` lay cac event dang `pending/failed`, khoa tam bang cach doi sang `processing`.
- `mark_integration_event_sent(p_event_id)` danh dau da gui.
- `mark_integration_event_failed(p_event_id, p_error)` ghi loi va dua ve `pending` de retry, toi da 5 lan.

## 2. n8n Environment Variables

Can dat cac bien nay trong n8n:

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

Neu chua co du nhom, chi can dat `TELEGRAM_CHAT_ADMIN`; cac audience khac se fallback ve admin de test.

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
