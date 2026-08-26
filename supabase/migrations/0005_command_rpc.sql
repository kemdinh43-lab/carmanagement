create or replace function public.record_app_command_event(
  command_name text,
  actor_role text,
  actor_user_id uuid default null,
  rpc_name text default null,
  payload jsonb default '{}'::jsonb,
  result_status text default 'applied',
  error_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id text := gen_random_uuid()::text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.app_command_events (
    id,
    command_name,
    actor_role,
    actor_user_id,
    entity_type,
    entity_id,
    payload,
    result_status,
    error_message
  ) values (
    event_id,
    command_name,
    coalesce(actor_role, public.current_app_role()),
    coalesce(actor_user_id, auth.uid()),
    null,
    null,
    coalesce(payload, '{}'::jsonb) || jsonb_build_object('rpc_name', rpc_name),
    coalesce(result_status, 'applied'),
    error_message
  );

  return event_id;
end;
$$;

grant execute on function public.record_app_command_event(text, text, uuid, text, jsonb, text, text) to authenticated;
