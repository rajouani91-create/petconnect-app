-- Release C (Halter-Seite):
-- 1. Halter:innen verschieben einen Praxistermin selbst (freie Zeit derselben Terminart, bis 24 Stunden vorher, höchstens 3-mal)
--    und schicken dabei eine Notiz mit. Der verschobene Termin ist wieder „neu“ und wird von der Praxis bestätigt.
-- 2. Absage durch die Halter:in mit Grund und Notiz (beides freiwillig).
-- 3. Registrierte Praxen erscheinen in der Praxissuche: Praxen ohne Verzeichniseintrag bekommen einen eigenen Eintrag
--    (verortet über die Postleitzahl), auch wenn die Postleitzahl im Feld „Ort“ steht.
-- 4. Für die Praxissuche: welche registrierten Praxen online buchbar sind und wann der nächste freie Termin ist.
-- Abwärtsverträglich: owner_cancel_booking(uuid) bleibt mit einem Argument aufrufbar, neue Spalten werden nur ergänzt.

-- ---------- Tabellen ----------

alter table public.practice_appointments add column if not exists owner_note text check (char_length(owner_note) <= 300);
alter table public.practice_appointments add column if not exists moved_from timestamptz;
alter table public.practice_appointments add column if not exists owner_moves smallint not null default 0;

-- Absagegründe der Halter:in zusätzlich zu denen der Praxis
alter table public.practice_appointments drop constraint if exists practice_appointments_cancel_reason_check;
alter table public.practice_appointments add constraint practice_appointments_cancel_reason_check
  check (cancel_reason in ('vet_ill', 'emergency', 'closed', 'double', 'other', 'recovered', 'conflict', 'unwell', 'other_practice'));

-- ---------- Halter:in: Termin absagen mit Grund und Notiz ----------

drop function if exists public.owner_cancel_booking(uuid);
create or replace function public.owner_cancel_booking(p_appointment uuid, p_reason text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  oa public.appointments%rowtype;
  a public.practice_appointments%rowtype;
  r text := nullif(btrim(coalesce(p_reason, '')), '');
  n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is not null and r not in ('recovered', 'conflict', 'unwell', 'other_practice', 'other') then
    raise exception 'reason_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(n, '')) > 300 then raise exception 'text_too_long' using errcode = '22023'; end if;
  select * into oa from public.appointments x where x.id = p_appointment;
  if not found or oa.practice_appointment_id is null or not private.can_edit_pet(oa.pet_id) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  select * into a from public.practice_appointments x where x.id = oa.practice_appointment_id for update;
  if not found or a.status not in ('new', 'confirmed') then raise exception 'appointment_closed' using errcode = '22023'; end if;
  if a.starts_at <= now() + interval '24 hours' then raise exception 'too_late' using errcode = '22023'; end if;
  update public.practice_appointments
    set status = 'cancelled_owner', cancel_reason = r, cancel_note = n, updated_at = now()
    where id = a.id;
  perform private.sync_owner_appointment(a.id);
  perform private.queue_booking_notice(a.id, 'practice', 'owner_cancelled');
  perform private.offer_freed_slot(a.practice_id, a.starts_at, a.minutes);
end;
$$;

-- ---------- Halter:in: Termin verschieben ----------

-- Prüft, ob die Halter:in diesen Termin verschieben darf, und liefert den Praxistermin (gesperrt)
create or replace function private.owner_movable(p_appointment uuid)
returns public.practice_appointments
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
  if a.owner_moves >= 3 then raise exception 'too_many_moves' using errcode = '54000'; end if;
  perform private.bookable_practice(a.practice_id);
  return a;
end;
$$;
revoke all on function private.owner_movable(uuid) from public, anon, authenticated;

-- Freie Zeiten zum Verschieben: gleiche Dauer, der Termin selbst zählt nicht als belegt
create or replace function public.owner_move_slots(p_appointment uuid, p_from date, p_days integer default 7)
returns setof timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.practice_appointments%rowtype;
  s public.practice_booking_settings%rowtype;
begin
  a := private.owner_movable(p_appointment);
  s := private.bookable_practice(a.practice_id);
  if p_from is null then raise exception 'time_invalid' using errcode = '22023'; end if;
  return query select x from private.free_slots(a.practice_id, a.minutes::int, p_from, least(greatest(coalesce(p_days, 7), 1), 14), 200, a.id,
                                                now() + interval '1 hour', (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7) x
               where x <> a.starts_at;
end;
$$;

create or replace function public.owner_move_booking(p_appointment uuid, p_slot timestamptz, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.practice_appointments%rowtype;
  s public.practice_booking_settings%rowtype;
  n text := nullif(btrim(coalesce(p_note, '')), '');
  w jsonb;
begin
  a := private.owner_movable(p_appointment);
  s := private.bookable_practice(a.practice_id);
  if char_length(coalesce(n, '')) > 300 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if p_slot is null or p_slot = a.starts_at or p_slot < now() + interval '1 hour'
     or (p_slot at time zone 'Europe/Berlin')::date > (now() at time zone 'Europe/Berlin')::date + s.weeks_ahead * 7
     or extract(minute from (p_slot at time zone 'Europe/Berlin'))::int % 15 <> 0 or extract(second from p_slot) <> 0 then
    raise exception 'time_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(a.practice_id::text, 0));
  w := private.appointment_warnings(a.practice_id, p_slot, a.minutes, a.id);
  if (w->>'closed') is not null or jsonb_array_length(w->'overlaps') > 0 then raise exception 'slot_taken' using errcode = '23P01'; end if;
  update public.practice_appointments
    set starts_at = p_slot, moved_from = a.starts_at, owner_note = n, owner_moves = a.owner_moves + 1,
        status = 'new', updated_at = now()
    where id = a.id;
  perform private.sync_owner_appointment(a.id);
  -- Die Praxis bestätigt die neue Zeit wie eine neue Anfrage
  perform private.queue_booking_notice(a.id, 'practice', 'requested');
  perform private.offer_freed_slot(a.practice_id, a.starts_at, a.minutes);
end;
$$;

-- ---------- Stand meiner Praxistermine: zusätzlich verschiebbar, Praxis, Notiz ----------

drop function if exists public.owner_practice_bookings();
create or replace function public.owner_practice_bookings()
returns table (appointment_id uuid, status text, source text, practice_name text, practice_phone text, cancel_reason text, cancel_note text,
               can_cancel boolean, alternatives timestamptz[], reminders text[], can_move boolean, practice_id uuid, owner_note text,
               moved_from timestamptz, minutes smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select oa.id, a.status, a.source, pa.name, pa.phone, a.cancel_reason, a.cancel_note,
         a.status in ('new', 'confirmed') and a.starts_at > now() + interval '24 hours',
         case when a.status = 'cancelled_practice' and a.alternatives is not null
              then array(select x from unnest(a.alternatives) x where x > now() + interval '1 hour' order by x) end,
         array_remove(array[case when s.remind_48h then '48' end, case when s.remind_2h then '2' end], null),
         a.status in ('new', 'confirmed') and a.starts_at > now() + interval '24 hours' and a.owner_moves < 3
           and pa.status = 'active' and coalesce(s.online_enabled, false),
         a.practice_id, a.owner_note, a.moved_from, a.minutes
  from public.appointments oa
  join public.practice_appointments a on a.id = oa.practice_appointment_id
  join public.practice_accounts pa on pa.id = a.practice_id
  left join public.practice_booking_settings s on s.practice_id = a.practice_id
  where private.is_pet_member(oa.pet_id);
$$;

-- ---------- Praxis: Notiz und alte Zeit beim Verschieben durch die Halter:in ----------

drop function if exists public.practice_appointments();
create or replace function public.practice_appointments()
returns table (id uuid, pet_id uuid, has_access boolean, pet_label text, owner_label text, phone text, type_id uuid, type_name text,
               starts_at timestamptz, minutes smallint, status text, source text, new_client boolean, note text,
               cancel_reason text, cancel_note text, overridden boolean, created_by_name text, created_at timestamptz,
               owner_note text, moved_from timestamptz)
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
           a.cancel_reason, a.cancel_note, a.overridden, a.created_by_name, a.created_at, a.owner_note, a.moved_from
    from public.practice_appointments a
    where a.practice_id = pid and (a.starts_at > now() - interval '60 days' or a.status = 'new')
    order by a.starts_at
    limit 1000;
end;
$$;

-- ---------- Registrierte Praxen im Verzeichnis ----------

-- Wie bisher, zusätzlich: steht die Postleitzahl im Feld „Ort“, wird sie zum Verorten genommen
create or replace function private.sync_directory(a public.practice_accounts)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d uuid := a.directory_id;
  pc text := coalesce(a.postcode, case when btrim(coalesce(a.city, '')) ~ '^[0-9]{4,5}$' then btrim(a.city) end);
  g record;
begin
  -- Der übergebene Datensatz kann veraltet sein (Eintrag inzwischen durch den Trigger angelegt)
  if d is null then
    select x.directory_id into d from public.practice_accounts x where x.id = a.id;
  end if;
  if d is null then
    if pc is null then
      return null;
    end if;
    select gp.lat, gp.lon, gp.place into g from public.geocode_place(pc, a.country) gp limit 1;
    if not found or g.lat is null then
      return null;
    end if;
    insert into public.practices (source, name, street, housenumber, postcode, city, country, lat, lon, phone, website, email, registered)
    values ('petconnect', a.name, a.street, a.housenumber, pc,
            case when a.postcode is null and btrim(coalesce(a.city, '')) = pc then g.place else a.city end,
            a.country, g.lat, g.lon, a.phone, a.website, a.email, true)
    returning id into d;
    update public.practice_accounts set directory_id = d where id = a.id;
    perform private.sync_offer(a, d);
    return d;
  end if;
  update public.practices set
    name = a.name,
    street = coalesce(a.street, street),
    housenumber = coalesce(a.housenumber, housenumber),
    postcode = coalesce(a.postcode, postcode),
    -- steht nur die Postleitzahl im Feld „Ort“, bleibt der Ortsname des Eintrags
    city = case when a.postcode is null and btrim(coalesce(a.city, '')) ~ '^[0-9]{4,5}$' then city else coalesce(a.city, city) end,
    phone = coalesce(a.phone, phone),
    website = coalesce(a.website, website),
    email = coalesce(a.email, email),
    registered = true,
    active = true,
    updated_at = now()
  where id = d;
  perform private.sync_offer(a, d);
  return d;
end;
$$;
revoke all on function private.sync_directory(public.practice_accounts) from public, anon, authenticated;

-- Aktive Praxis ohne Verzeichniseintrag (z. B. Adresse erst später ergänzt): Eintrag anlegen, sobald es geht
create or replace function private.practice_account_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_directory(new);
  return null;
end;
$$;
revoke all on function private.practice_account_directory() from public, anon, authenticated;

drop trigger if exists practice_accounts_directory on public.practice_accounts;
create trigger practice_accounts_directory
  after insert or update on public.practice_accounts
  for each row when (new.status = 'active' and new.directory_id is null)
  execute function private.practice_account_directory();

-- Bestehende aktive Praxen ohne Eintrag nachziehen
do $$
declare
  a public.practice_accounts;
begin
  for a in select * from public.practice_accounts x where x.status = 'active' and x.directory_id is null loop
    perform private.sync_directory(a);
  end loop;
end;
$$;

-- ---------- Praxissuche: Online-Buchung und nächster freier Termin ----------

-- p_ids: Verzeichnis-IDs aus search_practices (nur registrierte werden beantwortet)
create or replace function public.practice_booking_info(p_ids uuid[])
returns table (directory_id uuid, practice_id uuid, online boolean, next_slot timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  mins integer;
  nxt timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in
    select a.directory_id as d, a.id as pid, s.weeks_ahead,
           coalesce(s.online_enabled, false)
             and exists (select 1 from public.practice_appointment_types t where t.practice_id = a.id and t.active and t.online) as onl
    from public.practice_accounts a
    left join public.practice_booking_settings s on s.practice_id = a.id
    where a.status = 'active' and a.directory_id = any ((coalesce(p_ids, '{}'::uuid[]))[1:50])
  loop
    nxt := null;
    if r.onl then
      select min(t.minutes) into mins from public.practice_appointment_types t where t.practice_id = r.pid and t.active and t.online;
      select x into nxt from private.free_slots(r.pid, mins, (now() at time zone 'Europe/Berlin')::date,
                                                least(14, greatest(1, coalesce(r.weeks_ahead, 2) * 7)), 1, null,
                                                now() + interval '1 hour', (now() at time zone 'Europe/Berlin')::date + coalesce(r.weeks_ahead, 2) * 7) x;
    end if;
    directory_id := r.d; practice_id := r.pid; online := r.onl; next_slot := nxt;
    return next;
  end loop;
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.owner_cancel_booking(uuid, text, text) from public, anon;
revoke all on function public.owner_move_slots(uuid, date, integer) from public, anon;
revoke all on function public.owner_move_booking(uuid, timestamptz, text) from public, anon;
revoke all on function public.owner_practice_bookings() from public, anon;
revoke all on function public.practice_appointments() from public, anon;
revoke all on function public.practice_booking_info(uuid[]) from public, anon;

grant execute on function public.owner_cancel_booking(uuid, text, text) to authenticated;
grant execute on function public.owner_move_slots(uuid, date, integer) to authenticated;
grant execute on function public.owner_move_booking(uuid, timestamptz, text) to authenticated;
grant execute on function public.owner_practice_bookings() to authenticated;
grant execute on function public.practice_appointments() to authenticated;
grant execute on function public.practice_booking_info(uuid[]) to authenticated;
