-- Etappe P5c: Online-Buchung.
-- Halter:innen buchen bei jeder freigeschalteten Praxis, die die Online-Buchung eingeschaltet hat, eine freie Zeit.
-- Die Praxis sieht nur, was sie für den Termin braucht (Tiername, Name der Halter:in, Terminart, Grund, freiwillig
-- Telefon). Die Tierakte bleibt zu, außer die Halter:in kreuzt beim Buchen „Tierakte freigeben“ an.
-- Online-Buchungen sind zunächst „neu“ (angefragt, Zeit reserviert); die Praxis bestätigt oder lehnt mit Grund ab.
-- Halter:innen sagen bis 24 Stunden vorher selbst ab. Push an beide Seiten (Art „booking“).

-- ---------- Tabellen ----------

alter table public.practice_booking_settings add column if not exists online_enabled boolean not null default false;

alter table public.practice_appointments add column if not exists booked_by uuid references auth.users(id) on delete set null;
-- Art des Tieres bei Online-Buchung (für die Praxis hilfreich, ohne Tierakte)
alter table public.practice_appointments add column if not exists pet_species text check (char_length(pet_species) <= 40);
create index if not exists practice_appointments_booked_by_idx on public.practice_appointments (booked_by) where booked_by is not null;

alter table public.pet_practice_access drop constraint if exists pet_practice_access_source_check;
alter table public.pet_practice_access add constraint pet_practice_access_source_check check (source in ('code', 'request', 'invite', 'booking'));

-- Push-Hinweise zu Buchungen: an die Halter:in (target owner) oder an das Team der Praxis (target practice)
create table private.booking_notices (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.practice_appointments(id) on delete cascade,
  target text not null check (target in ('owner', 'practice')),
  event text not null check (event in ('requested', 'confirmed', 'declined', 'cancelled', 'moved', 'owner_cancelled')),
  created_at timestamptz not null default now()
);
create index booking_notices_created_idx on private.booking_notices (created_at);

-- ---------- Hilfsfunktionen ----------

create or replace function private.queue_booking_notice(p_appt uuid, p_target text, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.booking_notices where created_at < now() - interval '7 days';
  insert into private.booking_notices (appointment_id, target, event) values (p_appt, p_target, p_event);
end;
$$;

-- Freie Zeiten (15-Minuten-Raster) – gemeinsam für Praxis und Online-Buchung.
-- p_after: frühester Beginn; p_until: letzter erlaubter Tag (null = ohne Grenze)
create or replace function private.free_slots(pid uuid, p_minutes integer, p_from date, p_days integer, p_limit integer, p_exclude uuid,
                                              p_after timestamptz, p_until date)
returns setof timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_schedule(pid);
  return query
    with days as (
      select g::date as d from generate_series(p_from, p_from + least(greatest(coalesce(p_days, 1), 1), 60) - 1, interval '1 day') g
    ),
    segs as (
      select days.d, v.s, v.e
      from days
      join public.practice_hours h on h.practice_id = pid and h.weekday = extract(isodow from days.d) and h.is_open
      cross join lateral (values (h.opens, coalesce(h.break_from, h.closes)), (h.break_to, h.closes)) v(s, e)
      where v.s is not null and v.s < v.e and (p_until is null or days.d <= p_until)
        and not exists (select 1 from public.practice_absences a where a.practice_id = pid and days.d between a.day_from and a.day_to)
    ),
    cand as (
      select (t at time zone 'Europe/Berlin') as st
      from segs cross join lateral generate_series(segs.d + segs.s, segs.d + segs.e - make_interval(mins => p_minutes), interval '15 minutes') t
    )
    select c.st from cand c
    where c.st > p_after
      and not exists (
        select 1 from public.practice_appointments a
        where a.practice_id = pid and a.status in ('new', 'confirmed') and a.id is distinct from p_exclude
          and a.starts_at < c.st + make_interval(mins => p_minutes)
          and a.starts_at + make_interval(mins => a.minutes::int) > c.st)
    order by c.st
    limit least(greatest(coalesce(p_limit, 40), 1), 200);
end;
$$;

-- Praxis mit eingeschalteter Online-Buchung (freigeschaltet), sonst Fehler
create or replace function private.bookable_practice(p_practice uuid)
returns public.practice_booking_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.practice_booking_settings%rowtype;
begin
  select s0.* into s from public.practice_booking_settings s0 join public.practice_accounts a on a.id = s0.practice_id
  where s0.practice_id = p_practice and s0.online_enabled and a.status = 'active';
  if not found then raise exception 'booking_unavailable' using errcode = 'P0002'; end if;
  return s;
end;
$$;

-- Termin in der Terminliste der Halter:in nachführen: wie P5b, zusätzlich immer bei Online-Buchungen (booked_by)
create or replace function private.sync_owner_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.practice_appointments%rowtype;
  owner uuid;
  pname text;
  st text;
  n text;
begin
  select * into a from public.practice_appointments x where x.id = p_id;
  if not found then return; end if;
  select pa.name into pname from public.practice_accounts pa where pa.id = a.practice_id;
  st := case a.status when 'attended' then 'done' when 'new' then 'planned' when 'confirmed' then 'planned' else 'cancelled' end;
  n := case
    when a.status = 'cancelled_practice' then left(concat_ws(' – ', 'Von der Praxis abgesagt', nullif(a.cancel_note, '')), 1000)
    when a.status = 'cancelled_owner' then 'Abgesagt'
    when a.status = 'no_show' then 'Nicht erschienen'
    else a.note end;
  update public.appointments
    set title = left(a.type_name, 120), starts_at = a.starts_at, ends_at = a.starts_at + make_interval(mins => a.minutes::int),
        location = left(pname, 200), note = n, status = st
    where practice_appointment_id = a.id;
  if found or a.status not in ('new', 'confirmed') or a.pet_id is null then return; end if;
  select p.owner_id into owner from public.pets p
  where p.id = a.pet_id
    and (a.booked_by is not null or exists (select 1 from public.pet_practice_access x where x.pet_id = a.pet_id and x.practice_id = a.practice_id));
  if owner is null then return; end if;
  insert into public.appointments (pet_id, owner_id, title, kind, starts_at, ends_at, location, note, status, practice_appointment_id)
  values (a.pet_id, owner, left(a.type_name, 120), 'vet', a.starts_at, a.starts_at + make_interval(mins => a.minutes::int),
          left(pname, 200), a.note, 'planned', a.id);
end;
$$;

revoke all on function private.queue_booking_notice(uuid, text, text),
  private.free_slots(uuid, integer, date, integer, integer, uuid, timestamptz, date),
  private.bookable_practice(uuid) from public, anon, authenticated;

-- ---------- Push ----------

-- Wie bisher (Erinnerungen, Einträge der Praxis), dazu Hinweise zu Buchungen (Art „booking“)
create or replace function private.due_pushes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.user_id, b.kind, b.ref_id, b.slot, b.pet_name, b.title, b.info, b.url from private.due_pushes_base(p_now) b
  union all
  select pm.user_id, 'practice', n.id, n.created_at, p.name, n.practice_name, '{}'::jsonb, '/tier/' || p.id || '/gesundheitsakte'
  from private.practice_notices n
  join public.pets p on p.id = n.pet_id and not coalesce(p.deceased, false)
  join public.pet_members pm on pm.pet_id = n.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.practice, true) and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now
  union all
  -- an die Halter:in: nur wenn der Termin in ihrer Terminliste steht
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
  -- an das Team der Praxis
  select ps.user_id, 'booking', n.id, n.created_at, a.pet_label, pa.name,
         jsonb_build_object('event', n.event, 'target', 'practice', 'starts_at', a.starts_at), '/praxis/termine'
  from private.booking_notices n
  join public.practice_appointments a on a.id = n.appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  join public.practice_staff ps on ps.practice_id = a.practice_id
  where n.target = 'practice' and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now;
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
    'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'open', h.is_open, 'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI'),
                'break_from', to_char(h.break_from, 'HH24:MI'), 'break_to', to_char(h.break_to, 'HH24:MI')) order by h.weekday)
              from public.practice_hours h where h.practice_id = pid),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', t.minutes, 'online', t.online) order by t.sort, t.created_at)
              from public.practice_appointment_types t where t.practice_id = pid and t.active), '[]'::jsonb),
    'absences', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'from', a.day_from, 'to', a.day_to, 'reason', a.reason) order by a.day_from)
              from public.practice_absences a where a.practice_id = pid and a.day_to >= today), '[]'::jsonb));
end;
$$;

-- Online-Buchung ein/aus (nur Praxisleitung)
create or replace function public.practice_set_online_booking(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
begin
  if p_on is null then raise exception 'status_invalid' using errcode = '22023'; end if;
  perform private.ensure_schedule(pid);
  update public.practice_booking_settings set online_enabled = p_on, updated_at = now() where practice_id = pid;
end;
$$;

-- ---------- Praxis: Termine (Ersatz der P5b-Fassungen, jetzt mit Push an die Halter:in) ----------

create or replace function public.practice_free_slots(p_minutes integer, p_from date, p_days integer default 1, p_limit integer default 40, p_exclude uuid default null)
returns setof timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if p_minutes is null or p_minutes not between 5 and 240 or p_from is null then raise exception 'time_invalid' using errcode = '22023'; end if;
  return query select * from private.free_slots(pid, p_minutes, p_from, p_days, p_limit, p_exclude, now(), null);
end;
$$;

create or replace function public.practice_appointments()
returns table (id uuid, pet_id uuid, has_access boolean, pet_label text, owner_label text, phone text, type_id uuid, type_name text,
               starts_at timestamptz, minutes smallint, status text, source text, new_client boolean, note text,
               cancel_reason text, cancel_note text, overridden boolean, created_by_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select a.id, a.pet_id,
           exists (select 1 from public.pet_practice_access x where x.pet_id = a.pet_id and x.practice_id = pid),
           a.pet_label, a.owner_label, a.phone, a.type_id, a.type_name, a.starts_at, a.minutes, a.status, a.source, a.new_client, a.note,
           a.cancel_reason, a.cancel_note, a.overridden, a.created_by_name, a.created_at
    from public.practice_appointments a
    where a.practice_id = pid and (a.starts_at > now() - interval '60 days' or a.status = 'new')
    order by a.starts_at
    limit 1000;
end;
$$;

-- Online-Buchung bestätigen
create or replace function public.practice_confirm_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  update public.practice_appointments set status = 'confirmed', updated_at = now()
  where id = p_id and practice_id = pid and status = 'new';
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  perform private.sync_owner_appointment(p_id);
  perform private.queue_booking_notice(p_id, 'owner', 'confirmed');
end;
$$;

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
end;
$$;

-- Absagen durch die Praxis; bei einer offenen Online-Anfrage heißt das „abgelehnt“
create or replace function public.practice_cancel_appointment(p_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  n text := nullif(btrim(coalesce(p_note, '')), '');
  prev text;
begin
  if p_reason is null or p_reason not in ('vet_ill', 'emergency', 'closed', 'double', 'other') then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason = 'other' and n is null then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(coalesce(n, '')) > 300 then raise exception 'note_too_long' using errcode = '22023'; end if;
  select x.status into prev from public.practice_appointments x where x.id = p_id and x.practice_id = pid and x.status in ('new', 'confirmed') for update;
  if prev is null then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  update public.practice_appointments
    set status = 'cancelled_practice', cancel_reason = p_reason, cancel_note = n, updated_at = now()
    where id = p_id;
  perform private.sync_owner_appointment(p_id);
  perform private.queue_booking_notice(p_id, 'owner', case when prev = 'new' then 'declined' else 'cancelled' end);
end;
$$;

-- ---------- Halter:in ----------

-- Praxen mit Online-Buchung. Ohne Suchbegriff: Praxen, denen eines meiner Tiere schon eine Freigabe gegeben hat.
create or replace function public.booking_practices(p_query text default null)
returns table (id uuid, name text, street text, housenumber text, postcode text, city text, phone text, linked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  q text := btrim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(q) > 80 then q := left(q, 80); end if;
  return query
    select a.id, a.name, a.street, a.housenumber, a.postcode, a.city, a.phone,
           exists (select 1 from public.pet_practice_access x join public.pet_members pm on pm.pet_id = x.pet_id
                   where x.practice_id = a.id and pm.user_id = uid) as linked
    from public.practice_accounts a
    join public.practice_booking_settings s on s.practice_id = a.id and s.online_enabled
    where a.status = 'active'
      and exists (select 1 from public.practice_appointment_types t where t.practice_id = a.id and t.active and t.online)
      and (
        (char_length(q) < 2 and exists (select 1 from public.pet_practice_access x join public.pet_members pm on pm.pet_id = x.pet_id
                                        where x.practice_id = a.id and pm.user_id = uid))
        or (char_length(q) >= 2 and (a.name ilike '%' || q || '%' or a.city ilike '%' || q || '%' or a.postcode like q || '%'))
      )
    order by 8 desc, a.name
    limit 20;
end;
$$;

-- Was bei einer Praxis buchbar ist: Terminarten (online), Zeitraum, meine Tiere (mit Freigabe-Stand)
create or replace function public.booking_options(p_practice uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.practice_booking_settings%rowtype;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  s := private.bookable_practice(p_practice);
  perform private.ensure_schedule(p_practice);
  return jsonb_build_object(
    'practice', (select jsonb_build_object('id', a.id, 'name', a.name, 'street', a.street, 'housenumber', a.housenumber, 'postcode', a.postcode,
                                           'city', a.city, 'phone', a.phone) from public.practice_accounts a where a.id = p_practice),
    'last_day', ((now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', t.minutes) order by t.sort, t.created_at)
              from public.practice_appointment_types t where t.practice_id = p_practice and t.active and t.online), '[]'::jsonb),
    'pets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'species', p.species,
                        'has_access', exists (select 1 from public.pet_practice_access x where x.pet_id = p.id and x.practice_id = p_practice)) order by p.name)
              from public.pets p where not coalesce(p.deceased, false) and private.can_edit_pet(p.id)), '[]'::jsonb));
end;
$$;

-- Freie Zeiten für die Online-Buchung: frühestens in einer Stunde, höchstens bis zum Ende des Buchungszeitraums
create or replace function public.booking_free_slots(p_practice uuid, p_type uuid, p_from date, p_days integer default 1)
returns setof timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.practice_booking_settings%rowtype;
  mins integer;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  s := private.bookable_practice(p_practice);
  select t.minutes into mins from public.practice_appointment_types t where t.id = p_type and t.practice_id = p_practice and t.active and t.online;
  if mins is null then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  if p_from is null then raise exception 'time_invalid' using errcode = '22023'; end if;
  return query select * from private.free_slots(p_practice, mins, p_from, least(greatest(coalesce(p_days, 1), 1), 14), 120, null,
                                                now() + interval '1 hour', (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7);
end;
$$;

-- Termin anfragen. p: practice_id, pet_id, type_id, starts_at, note, phone, share (Tierakte freigeben)
create or replace function public.owner_book_appointment(p jsonb)
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
  ty public.practice_appointment_types%rowtype;
  pet public.pets%rowtype;
  st timestamptz;
  v_note text := nullif(btrim(coalesce(d->>'note', '')), '');
  v_phone text := nullif(btrim(coalesce(d->>'phone', '')), '');
  w jsonb;
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
  begin
    st := (d->>'starts_at')::timestamptz;
  exception when others then
    raise exception 'time_invalid' using errcode = '22023';
  end;
  if st is null or st < now() + interval '1 hour'
     or (st at time zone 'Europe/Berlin')::date > (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7
     or extract(minute from (st at time zone 'Europe/Berlin'))::int % 15 <> 0 or extract(second from st) <> 0 then
    raise exception 'time_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 300 or char_length(coalesce(v_phone, '')) > 40 then raise exception 'text_too_long' using errcode = '22023'; end if;
  -- Missbrauch begrenzen
  if (select count(*) from public.practice_appointments a where a.booked_by = uid and a.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  if (select count(*) from public.practice_appointments a where a.practice_id = pid and a.pet_id = pet.id and a.status in ('new', 'confirmed') and a.starts_at > now()) >= 3 then
    raise exception 'too_many_open' using errcode = '54000';
  end if;
  -- gleichzeitige Buchungen derselben Praxis nacheinander prüfen
  perform pg_advisory_xact_lock(hashtextextended(pid::text, 0));
  w := private.appointment_warnings(pid, st, ty.minutes, null);
  if (w->>'closed') is not null or jsonb_array_length(w->'overlaps') > 0 then raise exception 'slot_taken' using errcode = '23P01'; end if;
  insert into public.practice_appointments (practice_id, pet_id, pet_label, pet_species, owner_label, phone, type_id, type_name, starts_at, minutes,
                                            status, source, new_client, note, overridden, booked_by, created_by, created_by_name)
  values (pid, pet.id, left(pet.name, 60), left(coalesce(nullif(btrim(pet.species_other), ''), pet.species), 40),
          left(coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = uid), '–'), 80),
          v_phone, ty.id, ty.name, st, ty.minutes, 'new', 'online',
          not exists (select 1 from public.pet_practice_access x where x.pet_id = pet.id and x.practice_id = pid)
            and not exists (select 1 from public.practice_appointments a where a.pet_id = pet.id and a.practice_id = pid and a.status = 'attended'),
          v_note, false, uid, uid,
          left(coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = uid), '–'), 80))
  returning id into new_id;
  if coalesce((d->>'share')::boolean, false) then
    insert into public.pet_practice_access (pet_id, practice_id, source, granted_by) values (pet.id, pid, 'booking', uid)
    on conflict do nothing;
  end if;
  perform private.sync_owner_appointment(new_id);
  perform private.queue_booking_notice(new_id, 'practice', 'requested');
  return new_id;
end;
$$;

-- Stand meiner Termine bei Praxen (für die Terminliste der Halter:in)
create or replace function public.owner_practice_bookings()
returns table (appointment_id uuid, status text, source text, practice_name text, practice_phone text, cancel_reason text, cancel_note text, can_cancel boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select oa.id, a.status, a.source, pa.name, pa.phone, a.cancel_reason, a.cancel_note,
         a.status in ('new', 'confirmed') and a.starts_at > now() + interval '24 hours'
  from public.appointments oa
  join public.practice_appointments a on a.id = oa.practice_appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  where private.is_pet_member(oa.pet_id);
$$;

-- Absagen durch die Halter:in: bis 24 Stunden vorher. p_appointment = Termin in der Terminliste der Halter:in
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
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_set_online_booking(boolean) from public, anon;
revoke all on function public.practice_confirm_appointment(uuid) from public, anon;
revoke all on function public.booking_practices(text) from public, anon;
revoke all on function public.booking_options(uuid) from public, anon;
revoke all on function public.booking_free_slots(uuid, uuid, date, integer) from public, anon;
revoke all on function public.owner_book_appointment(jsonb) from public, anon;
revoke all on function public.owner_practice_bookings() from public, anon;
revoke all on function public.owner_cancel_booking(uuid) from public, anon;

grant execute on function public.practice_set_online_booking(boolean) to authenticated;
grant execute on function public.practice_confirm_appointment(uuid) to authenticated;
grant execute on function public.booking_practices(text) to authenticated;
grant execute on function public.booking_options(uuid) to authenticated;
grant execute on function public.booking_free_slots(uuid, uuid, date, integer) to authenticated;
grant execute on function public.owner_book_appointment(jsonb) to authenticated;
grant execute on function public.owner_practice_bookings() to authenticated;
grant execute on function public.owner_cancel_booking(uuid) to authenticated;
