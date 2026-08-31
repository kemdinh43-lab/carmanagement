create or replace function public.claim_pending_integration_events(p_limit integer default 10)
returns setof public.app_integration_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.app_integration_events
    where status in ('pending', 'failed')
      and attempts < 5
    order by created_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.app_integration_events event
  set
    status = 'processing',
    attempts = event.attempts + 1,
    last_error = null,
    updated_at = now()
  from picked
  where event.id = picked.id
  returning event.*;
end;
$$;

create or replace function public.mark_integration_event_sent(p_event_id text)
returns public.app_integration_events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_event public.app_integration_events;
begin
  update public.app_integration_events
  set
    status = 'sent',
    last_error = null,
    updated_at = now()
  where id = p_event_id
  returning * into updated_event;

  if updated_event.id is null then
    raise exception 'integration event not found';
  end if;

  return updated_event;
end;
$$;

create or replace function public.mark_integration_event_failed(p_event_id text, p_error text default null)
returns public.app_integration_events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_event public.app_integration_events;
begin
  update public.app_integration_events
  set
    status = case when attempts >= 5 then 'failed' else 'pending' end,
    last_error = left(coalesce(p_error, 'Unknown delivery error'), 1000),
    updated_at = now()
  where id = p_event_id
  returning * into updated_event;

  if updated_event.id is null then
    raise exception 'integration event not found';
  end if;

  return updated_event;
end;
$$;

grant execute on function public.claim_pending_integration_events(integer) to authenticated, service_role;
grant execute on function public.mark_integration_event_sent(text) to authenticated, service_role;
grant execute on function public.mark_integration_event_failed(text, text) to authenticated, service_role;
