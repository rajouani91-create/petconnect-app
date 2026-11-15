-- Etappe P5b: Termine der Praxis.
-- Die Praxis trägt Termine telefonisch ein (für Patient:innen mit Freigabe oder für Personen ohne PetConnect),
-- verschiebt, sagt mit Grund ab und vermerkt „erschienen / nicht erschienen“. Geprüft wird gegen Sprechzeiten,
-- Pausen, Abwesenheiten und andere Termine; die Praxis darf eine Warnung bewusst übergehen.
-- Termine für Patient:innen mit Freigabe erscheinen bei der Halter:in unter „Termine“ (eigene Zeile in
-- public.appointments, die nur die Praxis ändert). Alle Rollen der Praxis dürfen Termine verwalten.

create table public.practice_appointments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  -- Patient:in mit Freigabe (sonst nur die Namen unten)
  pet_id uuid references public.pets(id) on delete set null,
  -- Namen zum Zeitpunkt der Buchung (bleiben, auch wenn die Freigabe endet)
  pet_label text not null check (char_length(pet_label) between 1 and 60),
  owner_label text not null check (char_length(owner_label) between 1 and 80),
  phone text check (char_length(phone) <= 40),
  type_id uuid references public.practice_appointment_types(id) on delete set null,
  type_name text not null check (char_length(type_name) between 1 and 60),
  starts_at timestamptz not null,
  minutes smallint not null check (minutes between 5 and 240),
  status text not null default 'confirmed'
    check (status in ('new', 'confirmed', 'cancelled_practice', 'cancelled_owner', 'attended', 'no_show')),
  source text not null default 'phone' check (source in ('phone', 'online')),
  new_client boolean not null default false,
  note text check (char_length(note) <= 300),
  cancel_reason text check (cancel_reason in ('vet_ill', 'emergency', 'closed', 'double', 'other')),
  cancel_note text check (char_length(cancel_note) <= 300),
  -- Warnung (Überschneidung / geschlossen) bewusst übergangen
  overridden boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practice_appointments_time_idx on public.practice_appointments (practice_id, starts_at);
create index practice_appointments_pet_idx on public.practice_appointments (pet_id) where pet_id is not null;

alter table public.practice_appointments enable row level security;
revoke all on public.practice_appointments from anon, authenticated;

-- Termin der Praxis in der Terminliste der Halter:in: gehört zur Praxis, die Halter:in kann ihn nicht ändern
alter table public.appointments add column if not exists practice_appointment_id uuid unique
  references public.practice_appointments(id) on delete set null;

drop policy if exists "termine anlegen" on public.appointments;
create policy "termine anlegen" on public.appointments for insert
  with check ((owner_id = (select auth.uid())) and private.can_edit_pet(pet_id) and practice_appointment_id is null);
drop policy if exists "termine aendern" on public.appointments;
create policy "termine aendern" on public.appointments for update
  using (private.can_edit_pet(pet_id) and practice_appointment_id is null)
  with check (private.can_edit_pet(pet_id) and practice_appointment_id is null);
drop policy if exists "termine loeschen" on public.appointments;
create policy "termine loeschen" on public.appointments for delete
  using (private.can_edit_pet(pet_id) and practice_appointment_id is null);

-- ---------- Hilfsfunktionen ----------

-- Warnungen zu einem Zeitpunkt: geschlossen (Tag, Abwesenheit, außerhalb der Sprechzeit, Pause) und Überschneidungen
create or replace function private.appointment_warnings(pid uuid, p_start timestamptz, p_minutes integer, p_exclude uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  loc timestamp := p_start at time zone 'Europe/Berlin';
  d date := loc::date;
  t_from time := loc::time;
  t_to time := (loc + make_interval(mins => p_minutes))::time;
  crosses boolean := (loc + make_interval(mins => p_minutes))::date <> d;
  h public.practice_hours%rowtype;
  closed text;
begin
  perform private.ensure_schedule(pid);
  select * into h from public.practice_hours x where x.practice_id = pid and x.weekday = extract(isodow from d);
  if exists (select 1 from public.practice_absences a where a.practice_id = pid and d between a.day_from and a.day_to) then
    closed := 'absence';
  elsif not h.is_open then
    closed := 'closed_day';
  elsif crosses or t_from < h.opens or t_to > h.closes then
    closed := 'outside_hours';
  elsif h.break_from is not null and t_from < h.break_to and t_to > h.break_from then
    closed := 'break';
  end if;
  return jsonb_build_object(
    'closed', closed,
    'absence', (select a.reason from public.practice_absences a where a.practice_id = pid and d between a.day_from and a.day_to limit 1),
    'overlaps', coalesce((
      select jsonb_agg(jsonb_build_object('pet', a.pet_label, 'owner', a.owner_label, 'starts_at', a.starts_at, 'minutes', a.minutes) order by a.starts_at)
      from public.practice_appointments a
      where a.practice_id = pid and a.status in ('new', 'confirmed') and a.id is distinct from p_exclude
        and a.starts_at < p_start + make_interval(mins => p_minutes)
        and a.starts_at + make_interval(mins => a.minutes::int) > p_start), '[]'::jsonb));
end;
$$;

-- Termin in der Terminliste der Halter:in anlegen, ändern oder schließen (nur bei Patient:innen mit Freigabe)
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
    when a.status = 'no_show' then 'Nicht erschienen'
    else a.note end;
  -- vorhandene Zeile immer nachführen (auch wenn die Freigabe inzwischen entzogen wurde)
  update public.appointments
    set title = left(a.type_name, 120), starts_at = a.starts_at, ends_at = a.starts_at + make_interval(mins => a.minutes::int),
        location = left(pname, 200), note = n, status = st
    where practice_appointment_id = a.id;
  if found or a.status not in ('new', 'confirmed') or a.pet_id is null then return; end if;
  -- neue Zeile nur bei bestehender Freigabe
  select p.owner_id into owner from public.pets p
  where p.id = a.pet_id and exists (select 1 from public.pet_practice_access x where x.pet_id = a.pet_id and x.practice_id = a.practice_id);
  if owner is null then return; end if;
  insert into public.appointments (pet_id, owner_id, title, kind, starts_at, ends_at, location, note, status, practice_appointment_id)
  values (a.pet_id, owner, left(a.type_name, 120), 'vet', a.starts_at, a.starts_at + make_interval(mins => a.minutes::int),
          left(pname, 200), a.note, 'planned', a.id);
end;
$$;

create or replace function private.staff_name(pid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(pr.display_name), ''), a.name)
  from public.practice_accounts a left join public.profiles pr on pr.id = (select auth.uid()) where a.id = pid;
$$;

revoke all on function private.appointment_warnings(uuid, timestamptz, integer, uuid), private.sync_owner_appointment(uuid), private.staff_name(uuid)
  from public, anon, authenticated;

-- ---------- Lesen ----------

-- Termine der letzten 60 Tage und alle künftigen (höchstens 1000)
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
    where a.practice_id = pid and a.starts_at > now() - interval '60 days'
    order by a.starts_at
    limit 1000;
end;
$$;

-- Prüfung vor dem Eintragen oder Verschieben
create or replace function public.practice_appointment_check(p_starts_at timestamptz, p_minutes integer, p_exclude uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if p_starts_at is null or p_minutes is null or p_minutes not between 5 and 240 then raise exception 'time_invalid' using errcode = '22023'; end if;
  return private.appointment_warnings(pid, p_starts_at, p_minutes, p_exclude);
end;
$$;

-- Freie Zeiten (15-Minuten-Raster) ab einem Tag: innerhalb der Sprechzeit, außerhalb von Pausen und Abwesenheiten,
-- ohne Überschneidung, nicht in der Vergangenheit
create or replace function public.practice_free_slots(p_minutes integer, p_from date, p_days integer default 1, p_limit integer default 40, p_exclude uuid default null)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if p_minutes is null or p_minutes not between 5 and 240 or p_from is null then raise exception 'time_invalid' using errcode = '22023'; end if;
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
      where v.s is not null and v.s < v.e
        and not exists (select 1 from public.practice_absences a where a.practice_id = pid and days.d between a.day_from and a.day_to)
    ),
    cand as (
      select (t at time zone 'Europe/Berlin') as st
      from segs cross join lateral generate_series(segs.d + segs.s, segs.d + segs.e - make_interval(mins => p_minutes), interval '15 minutes') t
    )
    select c.st from cand c
    where c.st > now()
      and not exists (
        select 1 from public.practice_appointments a
        where a.practice_id = pid and a.status in ('new', 'confirmed') and a.id is distinct from p_exclude
          and a.starts_at < c.st + make_interval(mins => p_minutes)
          and a.starts_at + make_interval(mins => a.minutes::int) > c.st)
    order by c.st
    limit least(greatest(coalesce(p_limit, 40), 1), 200);
end;
$$;

-- ---------- Ändern (alle Rollen der Praxis) ----------

-- Termin telefonisch eintragen. p: {pet_id} oder {pet_name, owner_name, phone}, dazu type_id, starts_at, new_client, note.
-- Bei Warnungen nur mit p_force. Telefonische Termine sind sofort bestätigt.
create or replace function public.practice_book_appointment(p jsonb, p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  v_pet uuid;
  v_pet_label text;
  v_owner_label text;
  v_phone text := nullif(btrim(coalesce(d->>'phone', '')), '');
  ty public.practice_appointment_types%rowtype;
  st timestamptz;
  w jsonb;
  warn boolean;
  new_id uuid;
begin
  if coalesce(d->>'type_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  select * into ty from public.practice_appointment_types t where t.id = (d->>'type_id')::uuid and t.practice_id = pid and t.active;
  if not found then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  begin
    st := (d->>'starts_at')::timestamptz;
  exception when others then
    raise exception 'time_invalid' using errcode = '22023';
  end;
  if st is null or st < now() - interval '5 minutes' or st > now() + interval '2 years' then raise exception 'time_invalid' using errcode = '22023'; end if;
  if coalesce(d->>'pet_id', '') <> '' then
    if d->>'pet_id' !~ '^[0-9a-f-]{36}$' then raise exception 'patient_not_found' using errcode = 'P0002'; end if;
    select p.id, p.name, coalesce(nullif(btrim(pr.display_name), ''), '–'), coalesce(v_phone, p.owner_phone)
      into v_pet, v_pet_label, v_owner_label, v_phone
    from public.pet_practice_access x join public.pets p on p.id = x.pet_id left join public.profiles pr on pr.id = p.owner_id
    where x.practice_id = pid and x.pet_id = (d->>'pet_id')::uuid;
    if v_pet is null then raise exception 'patient_not_found' using errcode = 'P0002'; end if;
  else
    v_pet_label := btrim(coalesce(d->>'pet_name', ''));
    v_owner_label := btrim(coalesce(d->>'owner_name', ''));
    if char_length(v_pet_label) not between 1 and 60 then raise exception 'pet_name_invalid' using errcode = '22023'; end if;
    if char_length(v_owner_label) not between 1 and 80 then raise exception 'name_invalid' using errcode = '22023'; end if;
  end if;
  if char_length(coalesce(v_phone, '')) > 40 or char_length(btrim(coalesce(d->>'note', ''))) > 300 then raise exception 'text_too_long' using errcode = '22023'; end if;
  w := private.appointment_warnings(pid, st, ty.minutes, null);
  warn := (w->>'closed') is not null or jsonb_array_length(w->'overlaps') > 0;
  if warn and not coalesce(p_force, false) then raise exception 'slot_conflict' using errcode = '23P01'; end if;
  if (select count(*) from public.practice_appointments a where a.practice_id = pid and a.created_at > now() - interval '1 day') >= 500 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  insert into public.practice_appointments (practice_id, pet_id, pet_label, owner_label, phone, type_id, type_name, starts_at, minutes, status, source,
                                            new_client, note, overridden, created_by, created_by_name)
  values (pid, v_pet, left(v_pet_label, 60), left(v_owner_label, 80), v_phone, ty.id, ty.name, st, ty.minutes, 'confirmed', 'phone',
          coalesce((d->>'new_client')::boolean, false), nullif(btrim(coalesce(d->>'note', '')), ''), warn, (select auth.uid()), private.staff_name(pid))
  returning id into new_id;
  perform private.sync_owner_appointment(new_id);
  return new_id;
end;
$$;

-- Verschieben (nur künftige, offene Termine). Bei Warnungen nur mit p_force.
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
end;
$$;

-- Absagen durch die Praxis (mit Grund). Der Termin wird nicht gelöscht.
create or replace function public.practice_cancel_appointment(p_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_reason is null or p_reason not in ('vet_ill', 'emergency', 'closed', 'double', 'other') then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason = 'other' and n is null then raise exception 'note_required' using errcode = '22023'; end if;
  if char_length(coalesce(n, '')) > 300 then raise exception 'note_too_long' using errcode = '22023'; end if;
  update public.practice_appointments
    set status = 'cancelled_practice', cancel_reason = p_reason, cancel_note = n, updated_at = now()
    where id = p_id and practice_id = pid and status in ('new', 'confirmed');
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  perform private.sync_owner_appointment(p_id);
end;
$$;

-- Erschienen / nicht erschienen (nur begonnene Termine); erneut aufrufbar zum Korrigieren
create or replace function public.practice_mark_appointment(p_id uuid, p_attended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if p_attended is null then raise exception 'status_invalid' using errcode = '22023'; end if;
  update public.practice_appointments
    set status = case when p_attended then 'attended' else 'no_show' end, updated_at = now()
    where id = p_id and practice_id = pid and status in ('confirmed', 'attended', 'no_show') and starts_at <= now();
  if not found then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
  perform private.sync_owner_appointment(p_id);
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_appointments() from public, anon;
revoke all on function public.practice_appointment_check(timestamptz, integer, uuid) from public, anon;
revoke all on function public.practice_free_slots(integer, date, integer, integer, uuid) from public, anon;
revoke all on function public.practice_book_appointment(jsonb, boolean) from public, anon;
revoke all on function public.practice_move_appointment(uuid, timestamptz, boolean) from public, anon;
revoke all on function public.practice_cancel_appointment(uuid, text, text) from public, anon;
revoke all on function public.practice_mark_appointment(uuid, boolean) from public, anon;

grant execute on function public.practice_appointments() to authenticated;
grant execute on function public.practice_appointment_check(timestamptz, integer, uuid) to authenticated;
grant execute on function public.practice_free_slots(integer, date, integer, integer, uuid) to authenticated;
grant execute on function public.practice_book_appointment(jsonb, boolean) to authenticated;
grant execute on function public.practice_move_appointment(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.practice_cancel_appointment(uuid, text, text) to authenticated;
grant execute on function public.practice_mark_appointment(uuid, boolean) to authenticated;
