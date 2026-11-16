-- Etappe P5e: Warteliste, Terminerinnerungen, Ausweichtermine.
-- Warteliste: Halter:innen tragen sich bei einer Praxis für einen Tag oder „beliebiger Tag“ ein. Wird ein Termin
-- abgesagt oder verschoben, bekommt die erste passende Person (zuerst Wunsch genau dieser Tag, sonst beliebiger Tag)
-- das Angebot „Ein Platz ist frei geworden“ und kann ihn übernehmen (dann eine normale Online-Buchung, die die Praxis bestätigt).
-- Erinnerungen: 48 und 2 Stunden vor Praxisterminen (je Praxis abschaltbar) als Push an die Halter:in.
-- Ausweichtermine: Sagt die Praxis ab, kann sie drei freie Zeiten mitschicken; die Halter:in übernimmt eine davon direkt.

-- ---------- Tabellen ----------

alter table public.practice_booking_settings add column if not exists remind_48h boolean not null default true;
alter table public.practice_booking_settings add column if not exists remind_2h boolean not null default true;

alter table public.practice_appointments add column if not exists alternatives timestamptz[];

create table public.practice_waitlist (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  pet_label text not null,
  owner_label text not null,
  user_id uuid references auth.users(id) on delete cascade,
  type_id uuid references public.practice_appointment_types(id) on delete set null,
  type_name text not null,
  minutes smallint not null check (minutes between 5 and 240),
  wish_day date,
  status text not null default 'waiting' check (status in ('waiting', 'offered')),
  offered_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (practice_id, pet_id)
);
create index practice_waitlist_practice_idx on public.practice_waitlist (practice_id, status, created_at);
alter table public.practice_waitlist enable row level security;
revoke all on public.practice_waitlist from anon, authenticated;

alter table private.booking_notices drop constraint if exists booking_notices_event_check;
alter table private.booking_notices add constraint booking_notices_event_check
  check (event in ('requested', 'confirmed', 'declined', 'cancelled', 'cancelled_alt', 'moved', 'owner_cancelled', 'alt_taken'));

-- ---------- Hilfsfunktionen ----------

-- Frei gewordene Zeit der ersten passenden Person auf der Warteliste anbieten
create or replace function private.offer_freed_slot(pid uuid, p_start timestamptz, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.practice_booking_settings%rowtype;
  d date := (p_start at time zone 'Europe/Berlin')::date;
  w public.practice_waitlist%rowtype;
  warn jsonb;
begin
  if p_start <= now() + interval '1 hour' then return; end if;
  select * into s from public.practice_booking_settings x where x.practice_id = pid and x.online_enabled;
  if not found or d > (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7 then return; end if;
  for w in
    select * from public.practice_waitlist x
    where x.practice_id = pid and x.status = 'waiting' and x.minutes <= p_minutes and (x.wish_day is null or x.wish_day = d)
    order by (x.wish_day is not null) desc, x.created_at
  loop
    warn := private.appointment_warnings(pid, p_start, w.minutes, null);
    if (warn->>'closed') is null and jsonb_array_length(warn->'overlaps') = 0 then
      update public.practice_waitlist set status = 'offered', offered_at = p_start, notified_at = now() where id = w.id;
      return;
    end if;
  end loop;
end;
$$;

revoke all on function private.offer_freed_slot(uuid, timestamptz, integer) from public, anon, authenticated;

-- ---------- Push ----------

create or replace function private.due_pushes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Grundlage; die 60-Minuten-Erinnerung entfällt bei Praxisterminen, wenn die Praxis eigene Erinnerungen schickt
  select b.user_id, b.kind, b.ref_id, b.slot, b.pet_name, b.title, b.info, b.url from private.due_pushes_base(p_now) b
  where not (b.kind = 'appointment' and exists (
    select 1 from public.appointments oa
    join public.practice_appointments a on a.id = oa.practice_appointment_id
    join public.practice_booking_settings s on s.practice_id = a.practice_id
    where oa.id = b.ref_id and (s.remind_2h or s.remind_48h)))
  union all
  select pm.user_id, 'practice', n.id, n.created_at, p.name, n.practice_name, '{}'::jsonb, '/tier/' || p.id || '/gesundheitsakte'
  from private.practice_notices n
  join public.pets p on p.id = n.pet_id and not coalesce(p.deceased, false)
  join public.pet_members pm on pm.pet_id = n.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.practice, true) and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now
  union all
  select pm.user_id, 'booking', n.id, n.created_at, a.pet_label, pa.name,
         jsonb_build_object('event', n.event, 'target', 'owner', 'starts_at', a.starts_at), '/termine'
  from private.booking_notices n
  join public.practice_appointments a on a.id = n.appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  join public.appointments oa on oa.practice_appointment_id = a.id
  join public.pet_members pm on pm.pet_id = oa.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where n.target = 'owner' and coalesce(np.practice, true) and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now
  union all
  select ps.user_id, 'booking', n.id, n.created_at, a.pet_label, pa.name,
         jsonb_build_object('event', n.event, 'target', 'practice', 'starts_at', a.starts_at), '/praxis/termine'
  from private.booking_notices n
  join public.practice_appointments a on a.id = n.appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  join public.practice_staff ps on ps.practice_id = a.practice_id
  where n.target = 'practice' and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now
  union all
  -- Warteliste: Platz frei geworden
  select pm.user_id, 'booking', w.id, w.notified_at, w.pet_label, pa.name,
         jsonb_build_object('event', 'slot_free', 'target', 'owner', 'starts_at', w.offered_at), '/termine'
  from public.practice_waitlist w
  join public.practice_accounts pa on pa.id = w.practice_id
  join public.pet_members pm on pm.pet_id = w.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where w.status = 'offered' and coalesce(np.practice, true) and w.notified_at > p_now - interval '10 minutes' and w.notified_at <= p_now
  union all
  -- Terminerinnerungen 48 und 2 Stunden vorher
  select pm.user_id, 'booking', a.id, a.starts_at - make_interval(hours => h.hours), a.pet_label, pa.name,
         jsonb_build_object('event', 'remind' || h.hours, 'target', 'owner', 'starts_at', a.starts_at), '/termine'
  from public.practice_appointments a
  join public.practice_booking_settings s on s.practice_id = a.practice_id
  cross join (values (48), (2)) h(hours)
  join public.practice_accounts pa on pa.id = a.practice_id
  join public.appointments oa on oa.practice_appointment_id = a.id
  join public.pet_members pm on pm.pet_id = oa.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where a.status in ('new', 'confirmed') and coalesce(np.appointments, true)
    and ((h.hours = 48 and s.remind_48h) or (h.hours = 2 and s.remind_2h))
    and a.starts_at - make_interval(hours => h.hours) > p_now - interval '10 minutes'
    and a.starts_at - make_interval(hours => h.hours) <= p_now
    and a.created_at < a.starts_at - make_interval(hours => h.hours);
$$;
revoke all on function private.due_pushes(timestamptz) from public, anon, authenticated;

-- ---------- Praxis: Einstellungen ----------

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
    'online_enabled', (select s.online_enabled from public.practice_booking_settings s where s.practice_id = pid),
    'remind_48h', (select s.remind_48h from public.practice_booking_settings s where s.practice_id = pid),
    'remind_2h', (select s.remind_2h from public.practice_booking_settings s where s.practice_id = pid),
    'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'open', h.is_open, 'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI'),
                'break_from', to_char(h.break_from, 'HH24:MI'), 'break_to', to_char(h.break_to, 'HH24:MI')) order by h.weekday)
              from public.practice_hours h where h.practice_id = pid),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', t.minutes, 'online', t.online) order by t.sort, t.created_at)
              from public.practice_appointment_types t where t.practice_id = pid and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'from', a.day_from, 'to', a.day_to, 'reason', a.reason) order by a.day_from)
              from public.practice_absences a where a.practice_id = pid and a.day_to >= today), '[]'::jsonb));
end;
$$;

create or replace function public.practice_set_reminders(p_48h boolean, p_2h boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
begin
  if p_48h is null or p_2h is null then raise exception 'status_invalid' using errcode = '22023'; end if;
  perform private.ensure_schedule(pid);
  update public.practice_booking_settings set remind_48h = p_48h, remind_2h = p_2h, updated_at = now() where practice_id = pid;
end;
$$;

-- ---------- Praxis: Termine (Ersatz der P5c-Fassungen: Warteliste rückt nach, Ausweichtermine) ----------

create or replace function public.practice_move_appointment(p_id uuid, p_starts_at timestamptz, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  a public.practice_appointments%rowtype;
  w jsonb;
  warn boolean;
begin
  select * into a from public.practice_appointments x where x.id = p_id and x.practice_id = pid for update;
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  if a.status not in ('new', 'confirmed') then raise exception 'appointment_closed' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '2 years' then
    raise exception 'time_invalid' using errcode = '22023';
  end if;
  if p_starts_at = a.starts_at then raise exception 'no_change' using errcode = '22023'; end if;
  w := private.appointment_warnings(pid, p_starts_at, a.minutes, a.id);
  warn := (w->>'closed') is not null or jsonb_array_length(w->'overlaps') > 0;
  if warn and not coalesce(p_force, false) then raise exception 'slot_conflict' using errcode = '23P01'; end if;
  update public.practice_appointments
    set starts_at = p_starts_at, status = 'confirmed', overridden = warn, updated_at = now()
    where id = p_id;
  perform private.sync_owner_appointment(p_id);
  perform private.queue_booking_notice(p_id, 'owner', 'moved');
  perform private.offer_freed_slot(pid, a.starts_at, a.minutes);
end;
$$;

-- Absagen durch die Praxis; optional drei Ausweichtermine (nur wenn die Halter:in den Termin in der App hat)
drop function if exists public.practice_cancel_appointment(uuid, text, text);
create or replace function public.practice_cancel_appointment(p_id uuid, p_reason text, p_note text default null, p_alternatives boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  n text := nullif(btrim(coalesce(p_note, '')), '');
  a public.practice_appointments%rowtype;
  alts timestamptz[];
begin
  if p_reason is null or p_reason not in ('vet_ill', 'emergency', 'closed', 'double', 'other') then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason = 'other' and n is null then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(coalesce(n, '')) > 300 then raise exception 'note_too_long' using errcode = '22023'; end if;
  select * into a from public.practice_appointments x where x.id = p_id and x.practice_id = pid and x.status in ('new', 'confirmed') for update;
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  if coalesce(p_alternatives, false) and exists (select 1 from public.appointments oa where oa.practice_appointment_id = a.id) then
    select array_agg(x order by x) into alts
    from private.free_slots(pid, a.minutes, (now() at time zone 'Europe/Berlin')::date, 21, 3, a.id, now() + interval '1 hour', null) x
    where x <> a.starts_at;
  end if;
  update public.practice_appointments
    set status = 'cancelled_practice', cancel_reason = p_reason, cancel_note = n, alternatives = alts, updated_at = now()
    where id = p_id;
  perform private.sync_owner_appointment(p_id);
  perform private.queue_booking_notice(p_id, 'owner',
    case when a.status = 'new' then 'declined' when coalesce(array_length(alts, 1), 0) > 0 then 'cancelled_alt' else 'cancelled' end);
  perform private.offer_freed_slot(pid, a.starts_at, a.minutes);
end;
$$;

-- Warteliste der Praxis
create or replace function public.practice_waitlist()
returns table (id uuid, pet_label text, owner_label text, type_name text, wish_day date, status text, offered_at timestamptz, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select w.id, w.pet_label, w.owner_label, w.type_name, w.wish_day, w.status, w.offered_at, w.created_at
    from public.practice_waitlist w where w.practice_id = pid
    order by w.created_at limit 200;
end;
$$;

create or replace function public.practice_waitlist_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  delete from public.practice_waitlist where id = p_id and practice_id = pid;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- ---------- Halter:in ----------

-- Warteliste: für einen Tag oder beliebigen Tag (p: practice_id, pet_id, type_id, wish_day)
create or replace function public.waitlist_join(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d jsonb := coalesce(p, '{}'::jsonb);
  pid uuid;
  s public.practice_booking_settings%rowtype;
  pet public.pets%rowtype;
  ty public.practice_appointment_types%rowtype;
  wd date;
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(d->>'practice_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'booking_unavailable' using errcode = 'P0002'; end if;
  pid := (d->>'practice_id')::uuid;
  s := private.bookable_practice(pid);
  if coalesce(d->>'pet_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'pet_not_found' using errcode = 'P0002'; end if;
  select * into pet from public.pets x where x.id = (d->>'pet_id')::uuid and not coalesce(x.deceased, false);
  if not found or not private.can_edit_pet(pet.id) then raise exception 'pet_not_found' using errcode = 'P0002'; end if;
  if coalesce(d->>'type_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  select * into ty from public.practice_appointment_types t where t.id = (d->>'type_id')::uuid and t.practice_id = pid and t.active and t.online;
  if not found then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  if coalesce(d->>'wish_day', '') <> '' then
    wd := private.iso_date(d->>'wish_day');
    if wd is null or wd < (now() at time zone 'Europe/Berlin')::date or wd > (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7 then
      raise exception 'time_invalid' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.practice_waitlist w where w.user_id = uid) >= 5
     and not exists (select 1 from public.practice_waitlist w where w.practice_id = pid and w.pet_id = pet.id) then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  insert into public.practice_waitlist (practice_id, pet_id, pet_label, owner_label, user_id, type_id, type_name, minutes, wish_day)
  values (pid, pet.id, left(pet.name, 60), left(coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = uid), '–'), 80),
          uid, ty.id, ty.name, ty.minutes, wd)
  on conflict (practice_id, pet_id) do update
    set type_id = excluded.type_id, type_name = excluded.type_name, minutes = excluded.minutes, wish_day = excluded.wish_day,
        status = 'waiting', offered_at = null, notified_at = null, user_id = excluded.user_id
  returning id into new_id;
  return new_id;
end;
$$;

-- Meine Wartelisten-Einträge (alle Tiere, die ich betreue)
create or replace function public.owner_waitlist()
returns table (id uuid, practice_id uuid, practice_name text, pet_id uuid, pet_name text, type_name text, wish_day date, status text, offered_at timestamptz, can_take boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.practice_id, pa.name, w.pet_id, w.pet_label, w.type_name, w.wish_day, w.status, w.offered_at,
         w.status = 'offered' and w.offered_at > now() + interval '1 hour' and private.can_edit_pet(w.pet_id)
  from public.practice_waitlist w
  join public.practice_accounts pa on pa.id = w.practice_id
  where private.is_pet_member(w.pet_id)
  order by w.created_at;
$$;

create or replace function public.waitlist_leave(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.practice_waitlist%rowtype;
begin
  select * into w from public.practice_waitlist x where x.id = p_id;
  if not found or not private.can_edit_pet(w.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  delete from public.practice_waitlist where id = p_id;
end;
$$;

-- Angebotenen Platz übernehmen: wird eine normale Online-Buchung (die Praxis bestätigt). null = Platz schon vergeben
create or replace function public.waitlist_take(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.practice_waitlist%rowtype;
  new_id uuid;
begin
  select * into w from public.practice_waitlist x where x.id = p_id for update;
  if not found or not private.can_edit_pet(w.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if w.status <> 'offered' or w.offered_at <= now() + interval '1 hour' then raise exception 'offer_expired' using errcode = '22023'; end if;
  begin
    new_id := public.owner_book_appointment(jsonb_build_object('practice_id', w.practice_id, 'pet_id', w.pet_id, 'type_id', w.type_id,
                                                               'starts_at', w.offered_at, 'note', null, 'phone', null, 'share', false));
  exception when others then
    new_id := null;
  end;
  if new_id is null then
    -- Platz inzwischen vergeben: zurück auf die Warteliste (Ergebnis null = Angebot verfallen)
    update public.practice_waitlist set status = 'waiting', offered_at = null where id = w.id;
    return null;
  end if;
  delete from public.practice_waitlist where id = w.id;
  return new_id;
end;
$$;

-- Ausweichtermin übernehmen (von der Praxis vorgeschlagen, daher sofort bestätigt). p_appointment = Termin in meiner Terminliste
create or replace function public.owner_take_alternative(p_appointment uuid, p_slot timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  oa public.appointments%rowtype;
  a public.practice_appointments%rowtype;
  warn jsonb;
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into oa from public.appointments x where x.id = p_appointment;
  if not found or oa.practice_appointment_id is null or not private.can_edit_pet(oa.pet_id) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  select * into a from public.practice_appointments x where x.id = oa.practice_appointment_id for update;
  if a.status <> 'cancelled_practice' or a.alternatives is null or not (p_slot = any (a.alternatives)) or p_slot <= now() + interval '1 hour' then
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(a.practice_id::text, 0));
  warn := private.appointment_warnings(a.practice_id, p_slot, a.minutes, null);
  if (warn->>'closed') is not null or jsonb_array_length(warn->'overlaps') > 0 then
    update public.practice_appointments set alternatives = array_remove(alternatives, p_slot) where id = a.id;
    raise exception 'slot_taken' using errcode = '23P01';
  end if;
  insert into public.practice_appointments (practice_id, pet_id, pet_label, pet_species, owner_label, phone, type_id, type_name, starts_at, minutes,
                                            status, source, new_client, note, overridden, booked_by, created_by, created_by_name)
  values (a.practice_id, a.pet_id, a.pet_label, a.pet_species, a.owner_label, a.phone, a.type_id, a.type_name, p_slot, a.minutes,
          'confirmed', a.source, a.new_client, a.note, false, uid, uid, a.owner_label)
  returning id into new_id;
  update public.practice_appointments set alternatives = null, updated_at = now() where id = a.id;
  -- neue Zeile in der Terminliste der Halter:in (auch ohne Freigabe, da sie selbst übernommen hat)
  insert into public.appointments (pet_id, owner_id, title, kind, starts_at, ends_at, location, note, status, practice_appointment_id)
  values (oa.pet_id, oa.owner_id, left(a.type_name, 120), 'vet', p_slot, p_slot + make_interval(mins => a.minutes::int), oa.location, a.note, 'planned', new_id);
  perform private.queue_booking_notice(new_id, 'practice', 'alt_taken');
  return new_id;
end;
$$;

-- Stand meiner Praxistermine, jetzt mit Ausweichterminen und Erinnerungen
drop function if exists public.owner_practice_bookings();
create or replace function public.owner_practice_bookings()
returns table (appointment_id uuid, status text, source text, practice_name text, practice_phone text, cancel_reason text, cancel_note text,
               can_cancel boolean, alternatives timestamptz[], reminders text[])
language sql
stable
security definer
set search_path = ''
as $$
  select oa.id, a.status, a.source, pa.name, pa.phone, a.cancel_reason, a.cancel_note,
         a.status in ('new', 'confirmed') and a.starts_at > now() + interval '24 hours',
         case when a.status = 'cancelled_practice' and a.alternatives is not null
              then array(select x from unnest(a.alternatives) x where x > now() + interval '1 hour' order by x) end,
         array_remove(array[case when s.remind_48h then '48' end, case when s.remind_2h then '2' end], null)
  from public.appointments oa
  join public.practice_appointments a on a.id = oa.practice_appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  left join public.practice_booking_settings s on s.practice_id = a.practice_id
  where private.is_pet_member(oa.pet_id);
$$;

-- Absage durch die Halter:in (wie P5c), danach rückt die Warteliste nach
create or replace function public.owner_cancel_booking(p_appointment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  oa public.appointments%rowtype;
  a public.practice_appointments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into oa from public.appointments x where x.id = p_appointment;
  if not found or oa.practice_appointment_id is null or not private.can_edit_pet(oa.pet_id) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  select * into a from public.practice_appointments x where x.id = oa.practice_appointment_id for update;
  if not found or a.status not in ('new', 'confirmed') then raise exception 'appointment_closed' using errcode = '22023'; end if;
  if a.starts_at <= now() + interval '24 hours' then raise exception 'too_late' using errcode = '22023'; end if;
  update public.practice_appointments set status = 'cancelled_owner', updated_at = now() where id = a.id;
  perform private.sync_owner_appointment(a.id);
  perform private.queue_booking_notice(a.id, 'practice', 'owner_cancelled');
  perform private.offer_freed_slot(a.practice_id, a.starts_at, a.minutes);
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_set_reminders(boolean, boolean) from public, anon;
revoke all on function public.practice_cancel_appointment(uuid, text, text, boolean) from public, anon;
revoke all on function public.practice_waitlist() from public, anon;
revoke all on function public.practice_waitlist_remove(uuid) from public, anon;
revoke all on function public.waitlist_join(jsonb) from public, anon;
revoke all on function public.owner_waitlist() from public, anon;
revoke all on function public.waitlist_leave(uuid) from public, anon;
revoke all on function public.waitlist_take(uuid) from public, anon;
revoke all on function public.owner_take_alternative(uuid, timestamptz) from public, anon;
revoke all on function public.owner_practice_bookings() from public, anon;

grant execute on function public.practice_set_reminders(boolean, boolean) to authenticated;
grant execute on function public.practice_cancel_appointment(uuid, text, text, boolean) to authenticated;
grant execute on function public.practice_waitlist() to authenticated;
grant execute on function public.practice_waitlist_remove(uuid) to authenticated;
grant execute on function public.waitlist_join(jsonb) to authenticated;
grant execute on function public.owner_waitlist() to authenticated;
grant execute on function public.waitlist_leave(uuid) to authenticated;
grant execute on function public.waitlist_take(uuid) to authenticated;
grant execute on function public.owner_take_alternative(uuid, timestamptz) to authenticated;
grant execute on function public.owner_practice_bookings() to authenticated;
