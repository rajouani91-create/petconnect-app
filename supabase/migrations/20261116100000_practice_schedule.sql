-- Etappe P5a: Termin-Einstellungen der Praxis.
-- Sprechzeiten (Mo–So mit optionaler Mittagspause), Terminarten mit Dauer und „online buchbar“, Abwesenheiten
-- und wie weit im Voraus online gebucht werden kann. Grundlage für Termine und Online-Buchung (P5b, P5c).
-- Alle im Team lesen; ändern darf nur die Praxisleitung. Zugriff nur über Funktionen.

create table public.practice_hours (
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  -- 1 = Montag … 7 = Sonntag (ISO)
  weekday smallint not null check (weekday between 1 and 7),
  is_open boolean not null default false,
  opens time not null default '08:00',
  closes time not null default '18:00',
  break_from time,
  break_to time,
  primary key (practice_id, weekday),
  check (opens < closes),
  check ((break_from is null) = (break_to is null)),
  check (break_from is null or (opens < break_from and break_from < break_to and break_to < closes))
);

create table public.practice_appointment_types (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  minutes smallint not null check (minutes in (10, 15, 20, 30, 45, 60)),
  online boolean not null default true,
  -- entfernte Terminarten bleiben für alte Termine erhalten
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index practice_appointment_types_idx on public.practice_appointment_types (practice_id, active, sort);
create unique index practice_appointment_types_name_uq on public.practice_appointment_types (practice_id, lower(btrim(name))) where active;

create table public.practice_absences (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  day_from date not null,
  day_to date not null,
  reason text check (char_length(reason) <= 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (day_to >= day_from and day_to <= day_from + 92)
);
create index practice_absences_idx on public.practice_absences (practice_id, day_to);

create table public.practice_booking_settings (
  practice_id uuid primary key references public.practice_accounts(id) on delete cascade,
  weeks_ahead smallint not null default 8 check (weeks_ahead in (4, 8, 12)),
  updated_at timestamptz not null default now()
);

alter table public.practice_hours enable row level security;
alter table public.practice_appointment_types enable row level security;
alter table public.practice_absences enable row level security;
alter table public.practice_booking_settings enable row level security;
revoke all on public.practice_hours, public.practice_appointment_types, public.practice_absences, public.practice_booking_settings from anon, authenticated;

-- ---------- Hilfsfunktionen ----------

-- Legt beim ersten Zugriff die Standardwerte an: Mo–Fr 08–18, Sa 09–12, So zu; fünf Terminarten; 8 Wochen
create or replace function private.ensure_schedule(pid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.practice_hours h where h.practice_id = pid) then
    insert into public.practice_hours (practice_id, weekday, is_open, opens, closes)
    select pid, d, d <= 6, case when d = 6 then time '09:00' else time '08:00' end, case when d = 6 then time '12:00' else time '18:00' end
    from generate_series(1, 7) d
    on conflict do nothing;
  end if;
  if not exists (select 1 from public.practice_appointment_types t where t.practice_id = pid) then
    insert into public.practice_appointment_types (practice_id, name, minutes, online, sort) values
      (pid, 'Vorsorge / Impfung', 20, true, 1),
      (pid, 'Akute Beschwerden', 30, true, 2),
      (pid, 'Kontrolle / Nachsorge', 15, true, 3),
      (pid, 'Zahnbehandlung', 45, false, 4),
      (pid, 'Physiotherapie', 30, true, 5)
    on conflict do nothing;
  end if;
  insert into public.practice_booking_settings (practice_id) values (pid) on conflict do nothing;
end;
$$;

-- Praxis der Praxisleitung (freigeschaltet), sonst Fehler
create or replace function private.lead_practice_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if private.my_practice_role() is distinct from 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return pid;
end;
$$;

create or replace function private.hhmm(p text)
returns time
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  if p !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' then raise exception 'time_invalid' using errcode = '22023'; end if;
  return p::time;
end;
$$;

revoke all on function private.ensure_schedule(uuid), private.lead_practice_id(), private.hhmm(text) from public, anon, authenticated;

-- ---------- Lesen ----------

create or replace function public.practice_schedule()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  perform private.ensure_schedule(pid);
  return jsonb_build_object(
    'can_edit', private.my_practice_role() = 'lead',
    'weeks_ahead', (select s.weeks_ahead from public.practice_booking_settings s where s.practice_id = pid),
    'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'open', h.is_open, 'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI'),
                'break_from', to_char(h.break_from, 'HH24:MI'), 'break_to', to_char(h.break_to, 'HH24:MI')) order by h.weekday)
              from public.practice_hours h where h.practice_id = pid),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', t.minutes, 'online', t.online) order by t.sort, t.created_at)
              from public.practice_appointment_types t where t.practice_id = pid and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'from', a.day_from, 'to', a.day_to, 'reason', a.reason) order by a.day_from)
              from public.practice_absences a where a.practice_id = pid and a.day_to >= today), '[]'::jsonb));
end;
$$;

-- ---------- Ändern (nur Praxisleitung) ----------

-- p_hours: Liste mit 7 Einträgen {weekday, open, opens, closes, break_from, break_to}
create or replace function public.practice_save_hours(p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
  h jsonb;
  d int;
  o time; c time; bf time; bt time;
  seen int[] := '{}';
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'hours_invalid' using errcode = '22023';
  end if;
  perform private.ensure_schedule(pid);
  for h in select * from jsonb_array_elements(p_hours) loop
    if coalesce(h->>'weekday', '') !~ '^[1-7]$' then raise exception 'hours_invalid' using errcode = '22023'; end if;
    d := (h->>'weekday')::int;
    if d = any(seen) then raise exception 'hours_invalid' using errcode = '22023'; end if;
    seen := seen || d;
    o := coalesce(private.hhmm(h->>'opens'), time '08:00');
    c := coalesce(private.hhmm(h->>'closes'), time '18:00');
    bf := private.hhmm(h->>'break_from');
    bt := private.hhmm(h->>'break_to');
    if o >= c then raise exception 'hours_order' using errcode = '22023'; end if;
    if (bf is null) <> (bt is null) then raise exception 'break_invalid' using errcode = '22023'; end if;
    if bf is not null and not (o < bf and bf < bt and bt < c) then raise exception 'break_invalid' using errcode = '22023'; end if;
    update public.practice_hours
      set is_open = coalesce((h->>'open')::boolean, false), opens = o, closes = c, break_from = bf, break_to = bt
      where practice_id = pid and weekday = d;
  end loop;
  insert into public.practice_audit (practice_id, actor, action) values (pid, (select auth.uid()), 'hours_updated');
end;
$$;

-- Terminart anlegen (p_id null) oder ändern
create or replace function public.practice_save_appointment_type(p_id uuid, p_name text, p_minutes integer, p_online boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
  n text := btrim(coalesce(p_name, ''));
  res uuid;
begin
  if char_length(n) not between 1 and 60 then raise exception 'name_invalid' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes not in (10, 15, 20, 30, 45, 60) then raise exception 'minutes_invalid' using errcode = '22023'; end if;
  perform private.ensure_schedule(pid);
  if exists (select 1 from public.practice_appointment_types t
             where t.practice_id = pid and t.active and lower(btrim(t.name)) = lower(n) and t.id is distinct from p_id) then
    raise exception 'type_exists' using errcode = '23505';
  end if;
  if p_id is null then
    if (select count(*) from public.practice_appointment_types t where t.practice_id = pid and t.active) >= 20 then
      raise exception 'too_many_types' using errcode = '54000';
    end if;
    insert into public.practice_appointment_types (practice_id, name, minutes, online, sort)
    values (pid, n, p_minutes, coalesce(p_online, true),
            coalesce((select max(t.sort) + 1 from public.practice_appointment_types t where t.practice_id = pid), 1))
    returning id into res;
  else
    update public.practice_appointment_types set name = n, minutes = p_minutes, online = coalesce(p_online, true)
    where id = p_id and practice_id = pid and active returning id into res;
    if res is null then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  end if;
  return res;
end;
$$;

-- Terminart entfernen: wird nur ausgeblendet. Mindestens eine Terminart muss bleiben.
create or replace function public.practice_remove_appointment_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
begin
  if not exists (select 1 from public.practice_appointment_types t where t.id = p_id and t.practice_id = pid and t.active) then
    raise exception 'type_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.practice_appointment_types t where t.practice_id = pid and t.active) <= 1 then
    raise exception 'last_type' using errcode = '22023';
  end if;
  update public.practice_appointment_types set active = false where id = p_id;
end;
$$;

-- Abwesenheit (ein Tag oder Zeitraum bis 3 Monate, nicht in der Vergangenheit)
create or replace function public.practice_add_absence(p_from date, p_to date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
  today date := (now() at time zone 'Europe/Berlin')::date;
  t date := coalesce(p_to, p_from);
  r text := nullif(btrim(coalesce(p_reason, '')), '');
  res uuid;
begin
  if p_from is null or t < p_from or t < today or t > p_from + 92 or p_from > today + 730 then
    raise exception 'absence_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(r, '')) > 80 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.practice_absences a where a.practice_id = pid and a.day_to >= today) >= 100 then
    raise exception 'too_many_absences' using errcode = '54000';
  end if;
  delete from public.practice_absences a where a.practice_id = pid and a.day_to < today - 365;
  insert into public.practice_absences (practice_id, day_from, day_to, reason, created_by)
  values (pid, p_from, t, r, (select auth.uid())) returning id into res;
  return res;
end;
$$;

create or replace function public.practice_remove_absence(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
begin
  delete from public.practice_absences where id = p_id and practice_id = pid;
  if not found then raise exception 'absence_not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.practice_set_booking_window(p_weeks integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
begin
  if p_weeks is null or p_weeks not in (4, 8, 12) then raise exception 'weeks_invalid' using errcode = '22023'; end if;
  insert into public.practice_booking_settings (practice_id, weeks_ahead) values (pid, p_weeks)
  on conflict (practice_id) do update set weeks_ahead = excluded.weeks_ahead, updated_at = now();
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_schedule() from public, anon;
revoke all on function public.practice_save_hours(jsonb) from public, anon;
revoke all on function public.practice_save_appointment_type(uuid, text, integer, boolean) from public, anon;
revoke all on function public.practice_remove_appointment_type(uuid) from public, anon;
revoke all on function public.practice_add_absence(date, date, text) from public, anon;
revoke all on function public.practice_remove_absence(uuid) from public, anon;
revoke all on function public.practice_set_booking_window(integer) from public, anon;

grant execute on function public.practice_schedule() to authenticated;
grant execute on function public.practice_save_hours(jsonb) to authenticated;
grant execute on function public.practice_save_appointment_type(uuid, text, integer, boolean) to authenticated;
grant execute on function public.practice_remove_appointment_type(uuid) to authenticated;
grant execute on function public.practice_add_absence(date, date, text) to authenticated;
grant execute on function public.practice_remove_absence(uuid) to authenticated;
grant execute on function public.practice_set_booking_window(integer) to authenticated;
