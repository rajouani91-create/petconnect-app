-- Admin-Dashboard: nur Zahlen (keine Namen, keine E-Mails, keine Tierdaten). Rein additiv: neue Funktion, nichts wird geändert.
-- Zugriff wie bei staff_stats: nur Admin (private.is_staff('admin')), sonst Fehler 42501.
-- Zeiträume in deutscher Zeit. "Interaktionen" = neu angelegte oder abgehakte Einträge (keine Seitenaufrufe, die App erfasst kein Tracking).

create or replace function public.staff_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz       constant text := 'Europe/Berlin';
  today    date := (now() at time zone 'Europe/Berlin')::date;
  d0       date := (now() at time zone 'Europe/Berlin')::date - 29;
  result   jsonb;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with
  days as (
    select generate_series(d0, today, interval '1 day')::date as d
  ),
  signups as (
    select (created_at at time zone tz)::date as d, count(*) as n
      from public.profiles where created_at >= d0 group by 1
  ),
  new_pets as (
    select (created_at at time zone tz)::date as d, count(*) as n
      from public.pets where created_at >= d0 group by 1
  ),
  events as (
    select created_at as at from public.routine_done where created_at >= d0
    union all select created_at from public.routine_items where created_at >= d0
    union all select created_at from public.weights where created_at >= d0
    union all select created_at from public.vaccinations where created_at >= d0
    union all select created_at from public.appointments where created_at >= d0
    union all select created_at from public.reminders where created_at >= d0
    union all select created_at from public.pet_medications where created_at >= d0
    union all select created_at from public.pet_documents where created_at >= d0
    union all select created_at from public.lab_values where created_at >= d0
    union all select given_at from public.medication_doses where given_at >= d0
  ),
  interactions as (
    select (at at time zone tz)::date as d, count(*) as n from events group by 1
  ),
  series as (
    select d.d,
           coalesce(s.n, 0) as signups,
           coalesce(p.n, 0) as pets,
           coalesce(i.n, 0) as interactions
      from days d
      left join signups s on s.d = d.d
      left join new_pets p on p.d = d.d
      left join interactions i on i.d = d.d
     order by d.d
  ),
  hours as (
    select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as h
  ),
  ai_hours as (
    select h.h, coalesce(sum(u.n), 0) as n
      from hours h left join private.ai_usage u on u.hour_start = h.h
     group by h.h order by h.h
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total',      (select count(*) from auth.users),
      'new_7d',     (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'new_30d',    (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
      'active_7d',  (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
      'with_pets',  (select count(distinct owner_id) from public.pets),
      'locked',     (select count(*) from public.account_status where status = 'locked')
    ),
    'pets', jsonb_build_object(
      'total',   (select count(*) from public.pets),
      'new_7d', (select count(*) from public.pets where created_at >= now() - interval '7 days'),
      'shared', (select count(*) from (select pet_id from public.pet_members group by pet_id having count(*) > 1) x),
      'by_species', coalesce((select jsonb_object_agg(species, n) from (select species, count(*) as n from public.pets group by species) s), '{}'::jsonb)
    ),
    'records', jsonb_build_object(
      'routine_items',  (select count(*) from public.routine_items),
      'routine_done',   (select count(*) from public.routine_done),
      'weights',        (select count(*) from public.weights),
      'vaccinations',   (select count(*) from public.vaccinations),
      'documents',      (select count(*) from public.pet_documents),
      'appointments',   (select count(*) from public.appointments),
      'reminders',      (select count(*) from public.reminders),
      'medications',    (select count(*) from public.pet_medications),
      'doses_given',    (select count(*) from public.medication_doses where given_at is not null),
      'lab_values',     (select count(*) from public.lab_values),
      'insurances',     (select count(*) from public.pet_insurances),
      'claims',         (select count(*) from public.insurance_claims)
    ),
    'sharing', jsonb_build_object(
      'members',  (select count(*) from public.pet_members),
      'invites',  (select count(*) from public.pet_invites),
      'invites_accepted', (select count(*) from public.pet_invites where accepted_at is not null),
      'sitter_links', (select count(*) from public.sitter_access),
      'favorites', (select count(*) from public.practice_favorites)
    ),
    'push', jsonb_build_object(
      'subscriptions', (select count(*) from public.push_subscriptions),
      'sent_7d',       (select count(*) from private.push_sent where sent_at >= now() - interval '7 days')
    ),
    'ai', jsonb_build_object(
      'requests_24h', (select coalesce(sum(n), 0) from private.ai_usage where hour_start >= date_trunc('hour', now()) - interval '23 hours'),
      'users_24h',    (select count(distinct user_id) from private.ai_usage where hour_start >= date_trunc('hour', now()) - interval '23 hours'),
      'hourly',       coalesce((select jsonb_agg(jsonb_build_object('h', h, 'n', n) order by h) from ai_hours), '[]'::jsonb)
    ),
    'tickets', jsonb_build_object(
      'open',        (select count(*) from public.support_tickets where status = 'open'),
      'in_progress', (select count(*) from public.support_tickets where status = 'in_progress'),
      'closed',      (select count(*) from public.support_tickets where status = 'closed')
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'signups', signups, 'pets', pets, 'interactions', interactions) order by d) from series), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_dashboard() from public, anon;
grant execute on function public.staff_dashboard() to authenticated;
