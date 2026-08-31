update public.app_integration_events
set
  status = 'sent',
  last_error = 'Skipped old notification backfill before Telegram live delivery',
  updated_at = now()
where source = 'app_notifications_backfill'
  and status in ('pending', 'failed', 'processing');
