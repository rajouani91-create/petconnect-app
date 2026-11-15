-- Etappe P3: Patientenakte für die Praxis.
-- Die Praxis trägt Impfungen, Befunde, Medikamente und Gewicht ein, bearbeitet Stammdaten (mit Grund),
-- bestätigt Impfungen der Halter:in und ergänzt die Vorgeschichte. Nichts wird endgültig gelöscht:
-- Korrekturen und Stornos stehen mit Grund im Verlauf. Die Halter:in sieht alles sofort und bekommt einen Push-Hinweis.
--
-- Impfungen, Medikamente und Gewichte der Praxis stehen in den vorhandenen Tabellen (source = 'practice'),
-- damit die Halter-App sie ohne Umweg zeigt. Zu jedem Eintrag gibt es eine Zeile in practice_entries (Herkunft, Storno).
-- Ein stornierter Eintrag verschwindet aus der Tierakte, bleibt aber in practice_entries erhalten und lässt sich wiederherstellen.
-- Zugriff nur über Funktionen (security definer); keine direkten Tabellenrechte.

-- ---------- vorhandene Tabellen ergänzen ----------

-- Dosierung als Freitext (nur Einträge der Praxis)
alter table public.pet_medications add column if not exists dosage_text text;
alter table public.pet_medications drop constraint if exists pet_medications_dosage_text_check;
alter table public.pet_medications add constraint pet_medications_dosage_text_check
  check (dosage_text is null or (source = 'practice' and char_length(btrim(dosage_text)) between 1 and 120));

-- Schalter „Einträge der Praxis“ bei den Benachrichtigungen
alter table public.notification_prefs add column if not exists practice boolean not null default true;
grant update (practice) on public.notification_prefs to authenticated;

-- ---------- neue Tabellen ----------

create table public.practice_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  kind text not null check (kind in ('vaccination', 'finding', 'medication', 'weight', 'history_note')),
  -- Zeile in der Tierakte (vaccinations, pet_medications, weights); bei Befunden und Ergänzungen leer
  ref_id uuid,
  -- aktueller Inhalt (bei Storno: letzter Stand, daraus wird wiederhergestellt)
  data jsonb not null,
  -- Impfung der Halter:in, von der Praxis bestätigt (Storno gibt sie an die Halter:in zurück)
  confirmed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  changed_at timestamptz,
  voided_at timestamptz,
  voided_by_name text,
  void_reason text,
  void_note text
);
create index practice_entries_pet_idx on public.practice_entries (pet_id, kind);
create index practice_entries_practice_idx on public.practice_entries (practice_id, pet_id);
create unique index practice_entries_ref_uq on public.practice_entries (ref_id) where ref_id is not null and voided_at is null;
create unique index practice_entries_note_uq on public.practice_entries (pet_id, practice_id) where kind = 'history_note';

create table public.practice_entry_changes (
  id bigint generated always as identity primary key,
  pet_id uuid not null references public.pets(id) on delete cascade,
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  -- null = Stammdaten des Tieres
  entry_id uuid references public.practice_entries(id) on delete cascade,
  kind text not null check (kind in ('vaccination', 'finding', 'medication', 'weight', 'history_note', 'master')),
  action text not null check (action in ('create', 'confirm', 'correct', 'end', 'void', 'restore')),
  reason text check (reason is null or reason in ('typo', 'wrong_pet', 'wrong_date', 'wrong_content', 'duplicate', 'other')),
  note text check (note is null or char_length(note) <= 300),
  before jsonb,
  after jsonb,
  actor uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index practice_entry_changes_entry_idx on public.practice_entry_changes (entry_id, created_at);
create index practice_entry_changes_pet_idx on public.practice_entry_changes (pet_id, practice_id, created_at);

alter table public.practice_entries enable row level security;
alter table public.practice_entry_changes enable row level security;
revoke all on public.practice_entries, public.practice_entry_changes from anon, authenticated;

-- Push-Hinweise an die Halter:in (höchstens einer je Tier und Praxis in 30 Minuten)
create table private.practice_notices (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  practice_id uuid not null,
  practice_name text not null,
  created_at timestamptz not null default now()
);
create index practice_notices_created_idx on private.practice_notices (created_at);

-- ---------- Hilfsfunktionen ----------

-- Prüft Zugriff und Rolle; liefert Praxis, Rolle, Namen und Halter:in.
-- p_need: 'any' = alle Rollen, 'clinical' = nur Leitung und Tierärzt:innen
create or replace function private.patient_ctx(
  p_pet uuid, p_need text,
  out practice_id uuid, out practice_name text, out role text, out actor uuid, out actor_name text, out owner_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  practice_id := private.active_practice_id();
  actor := (select auth.uid());
  role := private.my_practice_role();
  select p.owner_id into owner_id
  from public.pet_practice_access x join public.pets p on p.id = x.pet_id
  where x.practice_id = patient_ctx.practice_id and x.pet_id = p_pet;
  if owner_id is null then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  if p_need = 'clinical' and role not in ('lead', 'vet') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.name into practice_name from public.practice_accounts a where a.id = patient_ctx.practice_id;
  select coalesce(nullif(btrim(pr.display_name), ''), patient_ctx.practice_name) into actor_name from public.profiles pr where pr.id = actor;
  actor_name := coalesce(actor_name, practice_name);
end;
$$;

create or replace function private.check_reason(p_reason text, p_note text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or p_reason not in ('typo', 'wrong_pet', 'wrong_date', 'wrong_content', 'duplicate', 'other') then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if p_reason = 'other' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.iso_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  if p !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'date_invalid' using errcode = '22023'; end if;
  return p::date;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'date_invalid' using errcode = '22023';
end;
$$;

-- Bringt den Inhalt eines Eintrags in die gültige Form (oder wirft einen Fehler)
create or replace function private.clean_entry(p_kind text, d jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  v_name text; v_text text; d1 date; d2 date; kg numeric;
begin
  if p_kind = 'vaccination' then
    v_name := btrim(coalesce(d->>'name', ''));
    d1 := private.iso_date(d->>'given_on'); d2 := private.iso_date(d->>'valid_until');
    if char_length(v_name) not between 1 and 80 then raise exception 'name_invalid' using errcode = '22023'; end if;
    if d1 is null or d1 > today or d1 < date '1990-01-01' then raise exception 'date_invalid' using errcode = '22023'; end if;
    if d2 is not null and (d2 < d1 or d2 > d1 + 3660) then raise exception 'valid_until_invalid' using errcode = '22023'; end if;
    return jsonb_build_object('name', v_name, 'given_on', d1, 'valid_until', d2);
  elsif p_kind = 'finding' then
    v_name := btrim(coalesce(d->>'title', '')); v_text := btrim(coalesce(d->>'text', ''));
    d1 := coalesce(private.iso_date(d->>'date'), today);
    if char_length(v_name) not between 1 and 120 then raise exception 'title_invalid' using errcode = '22023'; end if;
    if char_length(v_text) > 4000 then raise exception 'text_too_long' using errcode = '22023'; end if;
    if d1 > today or d1 < date '1990-01-01' then raise exception 'date_invalid' using errcode = '22023'; end if;
    return jsonb_build_object('date', d1, 'title', v_name, 'text', v_text);
  elsif p_kind = 'medication' then
    v_name := btrim(coalesce(d->>'name', '')); v_text := btrim(coalesce(d->>'dosage', ''));
    d1 := coalesce(private.iso_date(d->>'starts_on'), today); d2 := private.iso_date(d->>'ends_on');
    if char_length(v_name) not between 1 and 80 then raise exception 'name_invalid' using errcode = '22023'; end if;
    if char_length(v_text) not between 1 and 120 then raise exception 'dosage_invalid' using errcode = '22023'; end if;
    if char_length(btrim(coalesce(d->>'reason', ''))) > 200 then raise exception 'text_too_long' using errcode = '22023'; end if;
    if d1 < date '1990-01-01' or d1 > today + 366 then raise exception 'date_invalid' using errcode = '22023'; end if;
    if d2 is not null and d2 < d1 then raise exception 'ends_before_start' using errcode = '22023'; end if;
    if private.iso_date(d->>'stopped_on') < d1 - 1 then raise exception 'ends_before_start' using errcode = '22023'; end if;
    return jsonb_build_object('name', v_name, 'dosage', v_text, 'reason', nullif(btrim(coalesce(d->>'reason', '')), ''),
      'starts_on', d1, 'ends_on', d2, 'stopped_on', private.iso_date(d->>'stopped_on'));
  elsif p_kind = 'weight' then
    if coalesce(d->>'kg', '') !~ '^\d{1,4}(\.\d{1,3})?$' then raise exception 'kg_invalid' using errcode = '22023'; end if;
    kg := (d->>'kg')::numeric;
    d1 := coalesce(private.iso_date(d->>'measured_on'), today);
    if kg <= 0 or kg >= 2000 then raise exception 'kg_invalid' using errcode = '22023'; end if;
    if d1 > today or d1 < date '1990-01-01' then raise exception 'date_invalid' using errcode = '22023'; end if;
    return jsonb_build_object('kg', kg, 'measured_on', d1);
  elsif p_kind = 'history_note' then
    v_text := btrim(coalesce(d->>'text', ''));
    if char_length(v_text) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
    return jsonb_build_object('text', v_text);
  end if;
  raise exception 'kind_invalid' using errcode = '22023';
end;
$$;

-- Schreibt den Inhalt eines Eintrags in die Tabelle der Tierakte (anlegen oder ändern)
create or replace function private.apply_entry(p_id uuid, p_kind text, p_pet uuid, p_owner uuid, p_practice_name text, d jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'vaccination' then
    insert into public.vaccinations (id, pet_id, owner_id, name, given_on, valid_until, source)
    values (p_id, p_pet, p_owner, d->>'name', (d->>'given_on')::date, (d->>'valid_until')::date, 'practice')
    on conflict (id) do update set name = excluded.name, given_on = excluded.given_on, valid_until = excluded.valid_until, source = 'practice';
  elsif p_kind = 'medication' then
    -- Menge/Einheit sind Pflichtfelder der Tabelle; maßgeblich ist dosage_text. Die Dosierung steht zusätzlich in note,
    -- damit auch ältere App-Versionen und der Betreuungs-Link sie anzeigen.
    insert into public.pet_medications (id, pet_id, owner_id, source, name, amount, unit, frequency, times, remind, dosage_text, note, reason, prescribed_by, starts_on, ends_on, stopped_on)
    values (p_id, p_pet, p_owner, 'practice', d->>'name', 1, 'application', 'as_needed', '{}', false, d->>'dosage', d->>'dosage', d->>'reason', left(p_practice_name, 120),
            (d->>'starts_on')::date, (d->>'ends_on')::date, (d->>'stopped_on')::date)
    on conflict (id) do update set name = excluded.name, dosage_text = excluded.dosage_text, note = excluded.note, reason = excluded.reason,
      starts_on = excluded.starts_on, ends_on = excluded.ends_on, stopped_on = excluded.stopped_on;
  elsif p_kind = 'weight' then
    insert into public.weights (id, pet_id, owner_id, measured_on, kg)
    values (p_id, p_pet, p_owner, (d->>'measured_on')::date, (d->>'kg')::numeric)
    on conflict (id) do update set measured_on = excluded.measured_on, kg = excluded.kg;
  end if;
end;
$$;

create or replace function private.queue_practice_notice(p_pet uuid, p_practice uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.practice_notices where created_at < now() - interval '7 days';
  if not exists (select 1 from private.practice_notices n
                 where n.pet_id = p_pet and n.practice_id = p_practice and n.created_at > now() - interval '30 minutes') then
    insert into private.practice_notices (pet_id, practice_id, practice_name) values (p_pet, p_practice, p_name);
  end if;
end;
$$;

revoke all on function private.patient_ctx(uuid, text), private.check_reason(text, text), private.iso_date(text),
  private.clean_entry(text, jsonb), private.apply_entry(uuid, text, uuid, uuid, text, jsonb),
  private.queue_practice_notice(uuid, uuid, text) from public, anon, authenticated;

-- ---------- Praxis: lesen ----------

create or replace function public.practice_record(p_pet uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  res jsonb;
begin
  c := private.patient_ctx(p_pet, 'any');
  select jsonb_build_object(
    'role', c.role,
    'practice_name', c.practice_name,
    'pet', public.practice_patient(p_pet),
    'master_changed', exists (select 1 from public.practice_entry_changes ch where ch.pet_id = p_pet and ch.kind = 'master'),
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'given_on', v.given_on, 'valid_until', v.valid_until, 'source', v.source, 'created_at', v.created_at,
        'entry_id', e.id, 'mine', coalesce(e.practice_id = c.practice_id, false), 'confirmed', coalesce(e.confirmed, false),
        'by_name', e.created_by_name, 'practice_name', a.name, 'entered_at', e.created_at, 'changed', e.changed_at is not null)
        order by v.given_on desc nulls last, v.created_at desc)
      from public.vaccinations v
      left join public.practice_entries e on e.ref_id = v.id and e.kind = 'vaccination' and e.voided_at is null
      left join public.practice_accounts a on a.id = e.practice_id
      where v.pet_id = p_pet), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'entry_id', w.entry_id, 'kg', w.kg, 'measured_on', w.measured_on, 'mine', coalesce(w.mine, false), 'by_name', w.by_name, 'changed', coalesce(w.changed, false))
        order by w.measured_on desc, w.created_at desc)
      from (select w.id, e.id as entry_id, w.kg, w.measured_on, w.created_at, e.practice_id = c.practice_id as mine, e.created_by_name as by_name, e.changed_at is not null as changed
            from public.weights w
            left join public.practice_entries e on e.ref_id = w.id and e.kind = 'weight' and e.voided_at is null
            where w.pet_id = p_pet order by w.measured_on desc, w.created_at desc limit 60) w), '[]'::jsonb),
    'medications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'source', m.source, 'dosage_text', m.dosage_text, 'amount', m.amount, 'unit', m.unit, 'frequency', m.frequency,
        'times', m.times, 'intake_hint', m.intake_hint, 'note', m.note, 'reason', m.reason, 'starts_on', m.starts_on, 'ends_on', m.ends_on, 'stopped_on', m.stopped_on,
        'entry_id', e.id, 'mine', coalesce(e.practice_id = c.practice_id, false), 'by_name', e.created_by_name, 'practice_name', coalesce(a.name, m.prescribed_by),
        'entered_at', coalesce(e.created_at, m.created_at), 'changed', e.changed_at is not null)
        order by m.starts_on desc, m.created_at desc)
      from public.pet_medications m
      left join public.practice_entries e on e.ref_id = m.id and e.kind = 'medication' and e.voided_at is null
      left join public.practice_accounts a on a.id = e.practice_id
      where m.pet_id = p_pet), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'date', e.data->>'date', 'title', e.data->>'title', 'text', e.data->>'text',
        'mine', e.practice_id = c.practice_id, 'by_name', e.created_by_name, 'practice_name', a.name, 'entered_at', e.created_at, 'changed', e.changed_at is not null)
        order by e.data->>'date' desc, e.created_at desc)
      from public.practice_entries e
      join public.practice_accounts a on a.id = e.practice_id
      where e.pet_id = p_pet and e.kind = 'finding' and e.voided_at is null), '[]'::jsonb),
    'voided', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'data', e.data, 'confirmed', e.confirmed, 'voided_at', e.voided_at, 'voided_by_name', e.voided_by_name,
        'reason', e.void_reason, 'note', e.void_note) order by e.voided_at desc)
      from public.practice_entries e
      where e.pet_id = p_pet and e.practice_id = c.practice_id and e.voided_at is not null), '[]'::jsonb),
    'history', (select to_jsonb(h) - 'updated_by' from public.pet_history h where h.pet_id = p_pet),
    'history_note', (
      select jsonb_build_object('text', e.data->>'text', 'by_name', e.created_by_name, 'at', coalesce(e.changed_at, e.created_at))
      from public.practice_entries e
      where e.pet_id = p_pet and e.practice_id = c.practice_id and e.kind = 'history_note')
  ) into res;
  return res;
end;
$$;

-- Verlauf eines Eintrags (p_entry) oder der Stammdaten (p_entry = null)
create or replace function public.practice_entry_log(p_pet uuid, p_entry uuid default null)
returns table (action text, reason text, note text, before jsonb, after jsonb, actor_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  c := private.patient_ctx(p_pet, 'any');
  return query
    select ch.action, ch.reason, ch.note, ch.before, ch.after, ch.actor_name, ch.created_at
    from public.practice_entry_changes ch
    where ch.pet_id = p_pet and ch.practice_id = c.practice_id
      and ((p_entry is null and ch.kind = 'master') or ch.entry_id = p_entry)
    order by ch.created_at desc, ch.id desc
    limit 100;
end;
$$;

-- ---------- Praxis: eintragen ----------

-- Legt einen Eintrag an. p_kind: vaccination | finding | medication | weight
create or replace function public.practice_add_entry(p_pet uuid, p_kind text, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  d jsonb;
  new_id uuid := gen_random_uuid();
begin
  if p_kind is null or p_kind not in ('vaccination', 'finding', 'medication', 'weight') then
    raise exception 'kind_invalid' using errcode = '22023';
  end if;
  c := private.patient_ctx(p_pet, case when p_kind = 'weight' then 'any' else 'clinical' end);
  d := private.clean_entry(p_kind, coalesce(p_data, '{}'::jsonb) - 'stopped_on');
  perform private.apply_entry(new_id, p_kind, p_pet, c.owner_id, c.practice_name, d);
  insert into public.practice_entries (id, ref_id, pet_id, practice_id, kind, data, created_by, created_by_name)
  values (new_id, case when p_kind = 'finding' then null else new_id end, p_pet, c.practice_id, p_kind, d, c.actor, c.actor_name);
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, after, actor, actor_name)
  values (p_pet, c.practice_id, new_id, p_kind, 'create', d, c.actor, c.actor_name);
  perform private.queue_practice_notice(p_pet, c.practice_id, c.practice_name);
  return new_id;
end;
$$;

-- Übernimmt eine Impfung der Halter:in als Eintrag der Praxis (alle Rollen)
create or replace function public.practice_confirm_vaccination(p_pet uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v public.vaccinations%rowtype;
  d jsonb;
  new_id uuid := gen_random_uuid();
begin
  c := private.patient_ctx(p_pet, 'any');
  select * into v from public.vaccinations x where x.id = p_id and x.pet_id = p_pet for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if v.source <> 'owner' then raise exception 'already_confirmed' using errcode = '23505'; end if;
  d := jsonb_build_object('name', v.name, 'given_on', v.given_on, 'valid_until', v.valid_until);
  update public.vaccinations set source = 'practice' where id = p_id;
  insert into public.practice_entries (id, ref_id, pet_id, practice_id, kind, data, confirmed, created_by, created_by_name)
  values (new_id, p_id, p_pet, c.practice_id, 'vaccination', d, true, c.actor, c.actor_name);
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, after, actor, actor_name)
  values (p_pet, c.practice_id, new_id, 'vaccination', 'confirm', d, c.actor, c.actor_name);
end;
$$;

-- Korrigiert einen eigenen Eintrag (mit Grund)
create or replace function public.practice_correct_entry(p_entry uuid, p_data jsonb, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.practice_entries%rowtype;
  c record;
  d jsonb;
begin
  select * into e from public.practice_entries x where x.id = p_entry for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  c := private.patient_ctx(e.pet_id, case when e.kind = 'weight' then 'any' else 'clinical' end);
  if e.practice_id <> c.practice_id or e.kind = 'history_note' then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if e.voided_at is not null then raise exception 'entry_voided' using errcode = '22023'; end if;
  perform private.check_reason(p_reason, p_note);
  d := private.clean_entry(e.kind, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('stopped_on', e.data->'stopped_on'));
  if d = e.data then raise exception 'no_change' using errcode = '22023'; end if;
  if e.kind in ('vaccination', 'medication', 'weight') then
    if e.kind = 'weight' and not exists (select 1 from public.weights w where w.id = e.ref_id) then
      raise exception 'entry_gone' using errcode = 'P0002';
    end if;
    perform private.apply_entry(e.ref_id, e.kind, e.pet_id, c.owner_id, c.practice_name, d);
  end if;
  update public.practice_entries set data = d, changed_at = now() where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, reason, note, before, after, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, e.kind, 'correct', p_reason, nullif(btrim(coalesce(p_note, '')), ''), e.data, d, c.actor, c.actor_name);
end;
$$;

-- Beendet ein Medikament der Praxis (letzter Tag = gestern)
create or replace function public.practice_end_medication(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.practice_entries%rowtype;
  c record;
  d jsonb;
  today date := (now() at time zone 'Europe/Berlin')::date;
  stop date;
begin
  select * into e from public.practice_entries x where x.id = p_entry and x.kind = 'medication' for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  c := private.patient_ctx(e.pet_id, 'clinical');
  if e.practice_id <> c.practice_id then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if e.voided_at is not null then raise exception 'entry_voided' using errcode = '22023'; end if;
  stop := greatest(today - 1, (e.data->>'starts_on')::date - 1);
  if (e.data->>'stopped_on') is not null or ((e.data->>'ends_on') is not null and (e.data->>'ends_on')::date <= stop) then
    raise exception 'already_ended' using errcode = '22023';
  end if;
  d := e.data || jsonb_build_object('stopped_on', stop);
  perform private.apply_entry(e.ref_id, 'medication', e.pet_id, c.owner_id, c.practice_name, d);
  update public.practice_entries set data = d, changed_at = now() where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, before, after, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, 'medication', 'end', e.data, d, c.actor, c.actor_name);
end;
$$;

-- Storniert einen eigenen Eintrag: Er verschwindet aus der Tierakte, bleibt aber gespeichert.
create or replace function public.practice_void_entry(p_entry uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.practice_entries%rowtype;
  c record;
begin
  select * into e from public.practice_entries x where x.id = p_entry for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  c := private.patient_ctx(e.pet_id, case when e.kind = 'weight' then 'any' else 'clinical' end);
  if e.practice_id <> c.practice_id or e.kind = 'history_note' then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if e.voided_at is not null then raise exception 'entry_voided' using errcode = '22023'; end if;
  perform private.check_reason(p_reason, p_note);
  if e.kind = 'vaccination' and e.confirmed then
    update public.vaccinations set source = 'owner' where id = e.ref_id;
  elsif e.kind = 'vaccination' then
    delete from public.vaccinations where id = e.ref_id;
  elsif e.kind = 'medication' then
    delete from public.pet_medications where id = e.ref_id;
  elsif e.kind = 'weight' then
    delete from public.weights where id = e.ref_id;
  end if;
  update public.practice_entries
    set voided_at = now(), voided_by_name = c.actor_name, void_reason = p_reason, void_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, reason, note, before, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, e.kind, 'void', p_reason, nullif(btrim(coalesce(p_note, '')), ''), e.data, c.actor, c.actor_name);
end;
$$;

-- Stellt einen stornierten Eintrag wieder her (nicht bei Gewicht)
create or replace function public.practice_restore_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.practice_entries%rowtype;
  c record;
begin
  select * into e from public.practice_entries x where x.id = p_entry for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  c := private.patient_ctx(e.pet_id, 'clinical');
  if e.practice_id <> c.practice_id or e.voided_at is null then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if e.kind = 'weight' then raise exception 'not_restorable' using errcode = '22023'; end if;
  if e.kind = 'vaccination' and e.confirmed then
    -- die Zeile gehört der Halter:in; ist sie inzwischen gelöscht oder geändert, gibt es nichts wiederherzustellen
    update public.vaccinations set source = 'practice' where id = e.ref_id and source = 'owner';
    if not found then raise exception 'entry_gone' using errcode = 'P0002'; end if;
  elsif e.kind <> 'finding' then
    perform private.apply_entry(e.ref_id, e.kind, e.pet_id, c.owner_id, c.practice_name, e.data);
  end if;
  update public.practice_entries set voided_at = null, voided_by_name = null, void_reason = null, void_note = null where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, after, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, e.kind, 'restore', e.data, c.actor, c.actor_name);
end;
$$;

-- Stammdaten bearbeiten (alle Rollen, mit Grund)
create or replace function public.practice_update_master(p_pet uuid, p_data jsonb, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  o public.pets%rowtype;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  n_name text := btrim(coalesce(d->>'name', ''));
  n_breed text := nullif(btrim(coalesce(d->>'breed', '')), '');
  n_sex text := nullif(d->>'sex', '');
  n_birth date := private.iso_date(d->>'birth_date');
  n_chip text := nullif(btrim(coalesce(d->>'chip_no', '')), '');
  n_all text := nullif(btrim(coalesce(d->>'allergies', '')), '');
  b jsonb; a jsonb;
begin
  c := private.patient_ctx(p_pet, 'any');
  perform private.check_reason(p_reason, p_note);
  if char_length(n_name) not between 1 and 60 then raise exception 'name_invalid' using errcode = '22023'; end if;
  if n_sex is not null and n_sex not in ('female', 'male') then raise exception 'sex_invalid' using errcode = '22023'; end if;
  if n_birth is not null and (n_birth > (now() at time zone 'Europe/Berlin')::date or n_birth < date '1950-01-01') then
    raise exception 'date_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(n_breed, '')) > 80 or char_length(coalesce(n_chip, '')) > 40 or char_length(coalesce(n_all, '')) > 500 then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  select * into o from public.pets p where p.id = p_pet for update;
  b := jsonb_build_object('name', o.name, 'breed', o.breed, 'sex', o.sex, 'birth_date', o.birth_date, 'chip_no', o.chip_no, 'allergies', o.allergies);
  a := jsonb_build_object('name', n_name, 'breed', n_breed, 'sex', n_sex, 'birth_date', n_birth, 'chip_no', n_chip, 'allergies', n_all);
  if a = b then raise exception 'no_change' using errcode = '22023'; end if;
  update public.pets set name = n_name, breed = n_breed, sex = n_sex, birth_date = n_birth, chip_no = n_chip, allergies = n_all where id = p_pet;
  insert into public.practice_entry_changes (pet_id, practice_id, kind, action, reason, note, before, after, actor, actor_name)
  values (p_pet, c.practice_id, 'master', 'correct', p_reason, nullif(btrim(coalesce(p_note, '')), ''), b, a, c.actor, c.actor_name);
end;
$$;

-- Ergänzung der Praxis zur Vorgeschichte (eine je Tier und Praxis)
create or replace function public.practice_set_history_note(p_pet uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  d jsonb;
  prev public.practice_entries%rowtype;
begin
  c := private.patient_ctx(p_pet, 'clinical');
  d := private.clean_entry('history_note', jsonb_build_object('text', p_text));
  select * into prev from public.practice_entries e where e.pet_id = p_pet and e.practice_id = c.practice_id and e.kind = 'history_note' for update;
  if not found then
    if d->>'text' = '' then return; end if;
    insert into public.practice_entries (pet_id, practice_id, kind, data, created_by, created_by_name)
    values (p_pet, c.practice_id, 'history_note', d, c.actor, c.actor_name) returning * into prev;
    insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, after, actor, actor_name)
    values (p_pet, c.practice_id, prev.id, 'history_note', 'create', d, c.actor, c.actor_name);
    perform private.queue_practice_notice(p_pet, c.practice_id, c.practice_name);
  elsif prev.data <> d then
    update public.practice_entries set data = d, changed_at = now(), created_by_name = c.actor_name where id = prev.id;
    insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, before, after, actor, actor_name)
    values (p_pet, c.practice_id, prev.id, 'history_note', 'correct', prev.data, d, c.actor, c.actor_name);
  end if;
end;
$$;

-- ---------- Halter:in: Einträge der Praxen lesen ----------

-- Befunde und Ergänzungen zur Vorgeschichte sowie die Herkunft der Praxis-Einträge (für alle, die das Tier sehen dürfen)
create or replace function public.pet_practice_entries(p_pet uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_pet_member(p_pet) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.data->>'date', 'title', e.data->>'title', 'text', e.data->>'text',
        'practice_name', a.name, 'by_name', e.created_by_name, 'entered_at', e.created_at) order by e.data->>'date' desc, e.created_at desc)
      from public.practice_entries e join public.practice_accounts a on a.id = e.practice_id
      where e.pet_id = p_pet and e.kind = 'finding' and e.voided_at is null), '[]'::jsonb),
    'history_notes', coalesce((
      select jsonb_agg(jsonb_build_object('text', e.data->>'text', 'practice_name', a.name, 'at', coalesce(e.changed_at, e.created_at)) order by e.created_at)
      from public.practice_entries e join public.practice_accounts a on a.id = e.practice_id
      where e.pet_id = p_pet and e.kind = 'history_note' and e.data->>'text' <> ''), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_object_agg(e.ref_id::text, a.name)
      from public.practice_entries e join public.practice_accounts a on a.id = e.practice_id
      where e.pet_id = p_pet and e.kind in ('vaccination', 'medication', 'weight') and e.voided_at is null), '{}'::jsonb));
end;
$$;

-- ---------- Push-Hinweis ----------

-- Die vorhandene Liste der fälligen Nachrichten bleibt unverändert und bekommt die Hinweise der Praxis dazu.
do $$
begin
  if to_regprocedure('private.due_pushes_base(timestamptz)') is null then
    alter function private.due_pushes(timestamptz) rename to due_pushes_base;
  end if;
end;
$$;

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
  where coalesce(np.practice, true) and n.created_at > p_now - interval '10 minutes' and n.created_at <= p_now;
$$;
revoke all on function private.due_pushes(timestamptz), private.due_pushes_base(timestamptz) from public, anon, authenticated;

-- ---------- Rechte ----------

revoke all on function public.practice_record(uuid) from public, anon;
revoke all on function public.practice_entry_log(uuid, uuid) from public, anon;
revoke all on function public.practice_add_entry(uuid, text, jsonb) from public, anon;
revoke all on function public.practice_confirm_vaccination(uuid, uuid) from public, anon;
revoke all on function public.practice_correct_entry(uuid, jsonb, text, text) from public, anon;
revoke all on function public.practice_end_medication(uuid) from public, anon;
revoke all on function public.practice_void_entry(uuid, text, text) from public, anon;
revoke all on function public.practice_restore_entry(uuid) from public, anon;
revoke all on function public.practice_update_master(uuid, jsonb, text, text) from public, anon;
revoke all on function public.practice_set_history_note(uuid, text) from public, anon;
revoke all on function public.pet_practice_entries(uuid) from public, anon;

grant execute on function public.practice_record(uuid) to authenticated;
grant execute on function public.practice_entry_log(uuid, uuid) to authenticated;
grant execute on function public.practice_add_entry(uuid, text, jsonb) to authenticated;
grant execute on function public.practice_confirm_vaccination(uuid, uuid) to authenticated;
grant execute on function public.practice_correct_entry(uuid, jsonb, text, text) to authenticated;
grant execute on function public.practice_end_medication(uuid) to authenticated;
grant execute on function public.practice_void_entry(uuid, text, text) to authenticated;
grant execute on function public.practice_restore_entry(uuid) to authenticated;
grant execute on function public.practice_update_master(uuid, jsonb, text, text) to authenticated;
grant execute on function public.practice_set_history_note(uuid, text) to authenticated;
grant execute on function public.pet_practice_entries(uuid) to authenticated;
