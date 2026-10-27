-- Admin-Dashboard: „Letzte 24 Stunden“. Nur Zahlen und Ereignisarten mit Uhrzeit (keine Namen, E-Mails, Tierdaten, Texte).
-- Rein additiv: neue Funktion, nichts wird geändert. Zugriff wie staff_dashboard: nur Admin, sonst Fehler 42501.

create or replace function public.staff_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since  constant timestamptz := now() - interval '24 hours';
  result jsonb;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with
  ev as (
    select 'signup'::text as kind, created_at as at from public.profiles where created_at >= since
    union all select 'pet', created_at from public.pets where created_at >= since
    union all select 'routine_done', created_at from public.routine_done where created_at >= since
    union all select 'routine_item', created_at from public.routine_items where created_at >= since
    union all select 'weight', created_at from public.weights where created_at >= since
    union all select 'vaccination', created_at from public.vaccinations where created_at >= since
    union all select 'appointment', created_at from public.appointments where created_at >= since
    union all select 'reminder', created_at from public.reminders where created_at >= since
    union all select 'medication', created_at from public.pet_medications where created_at >= since
    union all select 'document', created_at from public.pet_documents where created_at >= since
    union all select 'lab_value', created_at from public.lab_values where created_at >= since
    union all select 'dose_given', given_at from public.medication_doses where given_at >= since
    union all select 'invite', created_at from public.pet_invites where created_at >= since
    union all select 'invite_accepted', accepted_at from public.pet_invites where accepted_at >= since
    union all select 'sitter_link', created_at from public.sitter_access where created_at >= since
    union all select 'favorite', created_at from public.practice_favorites where created_at >= since
    union all select 'ticket', created_at from public.support_tickets where created_at >= since
    union all select 'push', sent_at from private.push_sent where sent_at >= since
  ),
  hours as (
    select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as h
  ),
  per_hour as (
    select h.h,
           count(e.at) filter (where e.kind not in ('push')) as n,
           count(e.at) filter (where e.kind = 'push') as push
      from hours h
      left join ev e on date_trunc('hour', e.at) = h.h
     group by h.h
  ),
  ai_hours as (
    select h.h, coalesce(sum(u.n), 0) as n
      from hours h left join private.ai_usage u on u.hour_start = h.h
     group by h.h
  ),
  by_kind as (
    select kind, count(*) as n from ev group by kind
  ),
  recent as (
    select kind, at from ev where kind <> 'push' order by at desc limit 40
  )
  select jsonb_build_object(
    'generated_at', now(),
    'logins',   (select count(*) from auth.users where last_sign_in_at >= since),
    'ai',       (select coalesce(sum(n), 0) from private.ai_usage where hour_start >= date_trunc('hour', now()) - interval '23 hours'),
    'by_kind',  coalesce((select jsonb_object_agg(kind, n) from by_kind), '{}'::jsonb),
    'hourly',   coalesce((select jsonb_agg(jsonb_build_object('h', p.h, 'n', p.n, 'push', p.push, 'ai', a.n) order by p.h)
                            from per_hour p join ai_hours a using (h)), '[]'::jsonb),
    'recent',   coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'at', at) order by at desc) from recent), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_activity() from public, anon;
grant execute on function public.staff_activity() to authenticated;
