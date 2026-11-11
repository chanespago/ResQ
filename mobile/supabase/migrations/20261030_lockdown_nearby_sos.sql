revoke all on public.profiles, public.emergency_contacts, public.sos_alerts, public.sos_responses from public, anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
grant select, insert, update on public.sos_alerts to authenticated;
grant select, delete on public.sos_responses to authenticated;

create or replace function public.nearby_sos(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 5000
)
returns table (
  id uuid,
  display_name text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  distance_meters double precision,
  responder_count bigint,
  is_responding boolean
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  with candidates as (
    select
      a.id,
      p.display_name,
      case when exists (
        select 1 from public.sos_responses r
        where r.alert_id = a.id and r.responder_id = (select auth.uid())
      ) then a.latitude else round(a.latitude::numeric, 2)::double precision end as latitude,
      case when exists (
        select 1 from public.sos_responses r
        where r.alert_id = a.id and r.responder_id = (select auth.uid())
      ) then a.longitude else round(a.longitude::numeric, 2)::double precision end as longitude,
      a.created_at,
      6371000 * acos(least(1.0, greatest(-1.0,
        sin(radians(p_latitude)) * sin(radians(a.latitude)) +
        cos(radians(p_latitude)) * cos(radians(a.latitude)) *
        cos(radians(a.longitude - p_longitude))
      ))) as distance_meters
    from public.sos_alerts a
    join public.profiles p on p.id = a.user_id
    where auth.uid() is not null
      and a.user_id <> (select auth.uid())
      and a.status = 'active'
      and a.community_visible
      and a.expires_at > now()
      and a.latitude is not null
      and a.longitude is not null
      and p_latitude between -90 and 90
      and p_longitude between -180 and 180
  )
  select
    c.id,
    c.display_name,
    c.latitude,
    c.longitude,
    c.created_at,
    c.distance_meters,
    (select count(*) from public.sos_responses r where r.alert_id = c.id) as responder_count,
    exists (
      select 1 from public.sos_responses r
      where r.alert_id = c.id and r.responder_id = (select auth.uid())
    ) as is_responding
  from candidates c
  where c.distance_meters <= least(greatest(coalesce(p_radius_meters, 5000), 0), 50000)
  order by c.distance_meters asc;
$$;

create or replace function public.respond_to_sos(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.sos_alerts a
    where a.id = p_alert_id
      and a.user_id <> auth.uid()
      and a.status = 'active'
      and a.community_visible
      and a.expires_at > now()
  ) then
    raise exception 'This SOS request is no longer active';
  end if;

  insert into public.sos_responses (alert_id, responder_id)
  values (p_alert_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.stop_responding_to_sos(p_alert_id uuid)
returns void
language sql
security invoker
set search_path = public, auth, pg_temp
as $$
  delete from public.sos_responses
  where alert_id = p_alert_id and responder_id = (select auth.uid());
$$;

revoke all on function public.nearby_sos(double precision, double precision, integer) from public, anon;
revoke all on function public.respond_to_sos(uuid) from public, anon;
revoke all on function public.stop_responding_to_sos(uuid) from public, anon;
grant execute on function public.nearby_sos(double precision, double precision, integer) to authenticated;
grant execute on function public.respond_to_sos(uuid) to authenticated;
grant execute on function public.stop_responding_to_sos(uuid) to authenticated;
