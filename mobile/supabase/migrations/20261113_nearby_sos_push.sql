alter table public.sos_alerts
  add column if not exists location_updated_at timestamptz not null default now();

create table if not exists public.user_locations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists user_locations_updated_at_idx
  on public.user_locations (updated_at desc);

create table if not exists public.user_push_tokens (
  expo_push_token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens (user_id);

create table if not exists public.sos_push_recipients (
  alert_id uuid not null references public.sos_alerts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

alter table public.user_locations enable row level security;
alter table public.user_push_tokens enable row level security;
alter table public.sos_push_recipients enable row level security;

revoke all on public.user_locations, public.user_push_tokens from public, anon;
revoke all on public.sos_push_recipients from public, anon, authenticated;
grant select, insert, update, delete on public.user_locations to authenticated;
grant select, insert, update, delete on public.user_push_tokens to authenticated;
grant select on public.sos_alerts, public.user_push_tokens to service_role;
grant delete on public.user_push_tokens to service_role;
grant select, insert, update, delete on public.sos_push_recipients to service_role;

drop policy if exists "Users can manage their own location" on public.user_locations;
create policy "Users can manage their own location"
  on public.user_locations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
create policy "Users can manage their own push tokens"
  on public.user_push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.nearby_sos_push_tokens(p_alert_id uuid)
returns table (user_id uuid, expo_push_token text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct l.user_id, t.expo_push_token
  from public.sos_alerts a
  join public.user_locations l on l.user_id <> a.user_id
  join public.profiles p on p.id = l.user_id
  join public.user_push_tokens t on t.user_id = l.user_id
  where a.id = p_alert_id
    and a.status = 'active'
    and a.community_visible
    and a.expires_at > now()
    and a.latitude is not null
    and a.longitude is not null
    and l.updated_at >= now() - interval '1 hour'
    and p.preferences ->> 'nearby_sos_notifications' = 'true'
    and p.preferences ->> 'background_location_sharing' = 'true'
    and 6371000 * acos(least(1.0, greatest(-1.0,
      sin(radians(a.latitude)) * sin(radians(l.latitude)) +
      cos(radians(a.latitude)) * cos(radians(l.latitude)) *
      cos(radians(l.longitude - a.longitude))
    ))) <= 5000;
$$;

create or replace function public.sos_alert_by_id(p_alert_id uuid)
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
      a.user_id,
      p.display_name,
      a.latitude,
      a.longitude,
      a.created_at,
      (
        select 6371000 * acos(least(1.0, greatest(-1.0,
          sin(radians(a.latitude)) * sin(radians(l.latitude)) +
          cos(radians(a.latitude)) * cos(radians(l.latitude)) *
          cos(radians(l.longitude - a.longitude))
        )))
        from public.user_locations l
        where l.user_id = (select auth.uid())
          and l.updated_at >= now() - interval '1 hour'
      ) as distance_meters,
      exists (
        select 1 from public.sos_responses r
        where r.alert_id = a.id and r.responder_id = (select auth.uid())
      ) as is_responding,
      exists (
        select 1 from public.sos_push_recipients n
        where n.alert_id = a.id and n.user_id = (select auth.uid())
      ) as was_notified
    from public.sos_alerts a
    join public.profiles p on p.id = a.user_id
    where a.id = p_alert_id
      and auth.uid() is not null
      and a.user_id <> (select auth.uid())
      and a.status = 'active'
      and a.community_visible
      and a.expires_at > now()
      and a.latitude is not null
      and a.longitude is not null
  )
  select
    c.id,
    c.display_name,
    case when c.is_responding then c.latitude else round(c.latitude::numeric, 2)::double precision end,
    case when c.is_responding then c.longitude else round(c.longitude::numeric, 2)::double precision end,
    c.created_at,
    c.distance_meters,
    (select count(*) from public.sos_responses r where r.alert_id = c.id),
    c.is_responding
  from candidates c
  where c.is_responding or c.was_notified or c.distance_meters <= 5000;
$$;

revoke all on function public.nearby_sos_push_tokens(uuid) from public, anon, authenticated;
revoke all on function public.sos_alert_by_id(uuid) from public, anon;
grant execute on function public.nearby_sos_push_tokens(uuid) to service_role;
grant execute on function public.sos_alert_by_id(uuid) to authenticated;
