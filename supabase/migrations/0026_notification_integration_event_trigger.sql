create or replace function public.enqueue_integration_event_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_integration_events (
    id,
    source,
    event_type,
    audience,
    entity_type,
    entity_id,
    target_user_id,
    target_driver_id,
    payload,
    status,
    attempts,
    last_error,
    created_at,
    updated_at
  )
  values (
    'evt_' || new.id,
    'app_notifications',
    coalesce(nullif(new.event_type, ''), new.title),
    new.audience,
    case when new.entity_id is null then 'notification' else 'dispatch_order' end,
    new.entity_id,
    new.target_user_id,
    new.target_driver_id,
    jsonb_build_object(
      'notificationId', new.id,
      'title', new.title,
      'body', new.body,
      'audience', new.audience,
      'entityId', new.entity_id,
      'targetUserId', new.target_user_id,
      'targetDriverId', new.target_driver_id
    ),
    'pending',
    0,
    null,
    new.created_at,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists app_notifications_enqueue_integration_event on public.app_notifications;
create trigger app_notifications_enqueue_integration_event
after insert on public.app_notifications
for each row execute function public.enqueue_integration_event_from_notification();

insert into public.app_integration_events (
  id,
  source,
  event_type,
  audience,
  entity_type,
  entity_id,
  target_user_id,
  target_driver_id,
  payload,
  status,
  attempts,
  last_error,
  created_at,
  updated_at
)
select
  'evt_' || notification.id,
  'app_notifications_backfill',
  coalesce(nullif(notification.event_type, ''), notification.title),
  notification.audience,
  case when notification.entity_id is null then 'notification' else 'dispatch_order' end,
  notification.entity_id,
  notification.target_user_id,
  notification.target_driver_id,
  jsonb_build_object(
    'notificationId', notification.id,
    'title', notification.title,
    'body', notification.body,
    'audience', notification.audience,
    'entityId', notification.entity_id,
    'targetUserId', notification.target_user_id,
    'targetDriverId', notification.target_driver_id
  ),
  'pending',
  0,
  null,
  notification.created_at,
  now()
from public.app_notifications notification
left join public.app_integration_events event
  on event.id = 'evt_' || notification.id
where event.id is null;
