create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'RESQ member',
  preferences jsonb not null default '{"bluetooth_enabled": false, "sms_on_sos": true, "community_sharing": true, "silent_sos": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  phone text not null check (char_length(trim(phone)) between 3 and 40),
  relationship text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  community_visible boolean not null default true,
  status text not null default 'active' check (status in ('active', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  check ((latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180))
);

alter table public.sos_alerts
  add column if not exists community_visible boolean not null default true;

create index if not exists sos_alerts_active_created_idx
  on public.sos_alerts (status, created_at desc)
  where status = 'active';

create table if not exists public.sos_responses (
  alert_id uuid not null references public.sos_alerts (id) on delete cascade,
  responder_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alert_id, responder_id)
);

alter table public.profiles enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.sos_responses enable row level security;

revoke all on public.profiles, public.emergency_contacts, public.sos_alerts, public.sos_responses from public, anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.emergency_contacts to authenticated;
grant select, insert, update on public.sos_alerts to authenticated;
grant select, delete on public.sos_responses to authenticated;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can manage their emergency contacts" on public.emergency_contacts;
create policy "Users can manage their emergency contacts"
  on public.emergency_contacts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can read their own SOS alerts" on public.sos_alerts;
create policy "Users can read their own SOS alerts"
  on public.sos_alerts for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own SOS alerts" on public.sos_alerts;
create policy "Users can create their own SOS alerts"
  on public.sos_alerts for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can resolve their own SOS alerts" on public.sos_alerts;
create policy "Users can resolve their own SOS alerts"
  on public.sos_alerts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Responders can read their own responses" on public.sos_responses;
create policy "Responders can read their own responses"
  on public.sos_responses for select to authenticated
  using (responder_id = (select auth.uid()));

drop policy if exists "Responders can remove their own responses" on public.sos_responses;
create policy "Responders can remove their own responses"
  on public.sos_responses for delete to authenticated
  using (responder_id = (select auth.uid()));

create or replace function public.handle_new_resq_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'RESQ member'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_resq on auth.users;
create trigger on_auth_user_created_resq
  after insert on auth.users
  for each row execute procedure public.handle_new_resq_user();

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