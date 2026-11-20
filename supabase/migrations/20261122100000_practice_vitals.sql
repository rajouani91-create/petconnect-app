-- Release B: Praxis trägt Vitalwerte ein (Temperatur, Herz- und Atemfrequenz) und Befunde bekommen eine Uhrzeit.
-- Vitalwerte der Praxis landen wie Gewicht in der Tierakte der Halter:in (vital_values, source = 'practice'); die Halter:in
-- kann sie sehen, aber nicht ändern (die Regeln von vital_values erlauben Ändern/Löschen nur für source = 'owner').
-- Alle Rollen dürfen Vitalwerte eintragen (wie Gewicht).

alter table public.practice_entries drop constraint practice_entries_kind_check;
alter table public.practice_entries add constraint practice_entries_kind_check
  check (kind in ('vaccination', 'finding', 'medication', 'weight', 'vital', 'history_note'));
alter table public.practice_entry_changes drop constraint practice_entry_changes_kind_check;
alter table public.practice_entry_changes add constraint practice_entry_changes_kind_check
  check (kind in ('vaccination', 'finding', 'medication', 'weight', 'vital', 'history_note', 'master'));

create or replace function private.clean_entry(p_kind text, d jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  v_name text; v_text text; d1 date; d2 date; kg numeric;
  v_time text; v_kind text; v_val numeric; v_at timestamptz;
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
    -- Uhrzeit der Behandlung (optional, HH:MM)
    v_time := nullif(btrim(coalesce(d->>'time', '')), '');
    if v_time is not null and v_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'time_invalid' using errcode = '22023'; end if;
    return jsonb_build_object('date', d1, 'title', v_name, 'text', v_text)
      || case when v_time is not null then jsonb_build_object('time', v_time) else '{}'::jsonb end;
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
  elsif p_kind = 'vital' then
    -- Vitalwert: Temperatur, Herz- oder Atemfrequenz mit Datum und Uhrzeit (Europe/Berlin)
    v_kind := d->>'vkind';
    if v_kind is null or v_kind not in ('temperature', 'heart_rate', 'resp_rate') then raise exception 'kind_invalid' using errcode = '22023'; end if;
    if coalesce(d->>'value', '') !~ '^\d{1,3}(\.\d{1,2})?$' then raise exception 'value_invalid' using errcode = '22023'; end if;
    v_val := (d->>'value')::numeric;
    if (v_kind = 'temperature' and v_val not between 30 and 45) or (v_kind = 'heart_rate' and v_val not between 10 and 400)
       or (v_kind = 'resp_rate' and v_val not between 2 and 200) then
      raise exception 'value_invalid' using errcode = '22023';
    end if;
    v_text := nullif(btrim(coalesce(d->>'context', '')), '');
    if v_text is not null and not (v_kind = 'temperature' and v_text in ('rectal', 'ear') or v_kind <> 'temperature' and v_text in ('resting', 'active')) then
      raise exception 'context_invalid' using errcode = '22023';
    end if;
    d1 := coalesce(private.iso_date(d->>'measured_on'), today);
    v_time := coalesce(nullif(btrim(coalesce(d->>'time', '')), ''), to_char(now() at time zone 'Europe/Berlin', 'HH24:MI'));
    if v_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'time_invalid' using errcode = '22023'; end if;
    v_at := (d1 + v_time::time) at time zone 'Europe/Berlin';
    if v_at > now() + interval '5 minutes' or d1 < date '1990-01-01' then raise exception 'date_invalid' using errcode = '22023'; end if;
    return jsonb_build_object('vkind', v_kind, 'value', v_val, 'context', v_text, 'measured_on', d1, 'time', v_time);
  elsif p_kind = 'history_note' then
    v_text := btrim(coalesce(d->>'text', ''));
    if char_length(v_text) > 2000 then raise exception 'text_too_long' using errcode = '22023'; end if;
    return jsonb_build_object('text', v_text);
  end if;
  raise exception 'kind_invalid' using errcode = '22023';
end;
$$;

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
  elsif p_kind = 'vital' then
    insert into public.vital_values (id, pet_id, owner_id, kind, value, context, measured_at, source)
    values (p_id, p_pet, p_owner, d->>'vkind', (d->>'value')::numeric, d->>'context',
            ((d->>'measured_on')::date + (d->>'time')::time) at time zone 'Europe/Berlin', 'practice')
    on conflict (id) do update set kind = excluded.kind, value = excluded.value, context = excluded.context, measured_at = excluded.measured_at;
  end if;
end;
$$;

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
    'vitals', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'entry_id', x.entry_id, 'kind', x.kind, 'value', x.value, 'context', x.context, 'measured_at', x.measured_at,
               'source', x.source, 'mine', coalesce(x.mine, false), 'by_name', x.by_name, 'changed', coalesce(x.changed, false))
        order by x.measured_at desc)
      from (select v.id, e.id as entry_id, v.kind, v.value, v.context, v.measured_at, v.source, e.practice_id = c.practice_id as mine,
                   e.created_by_name as by_name, e.changed_at is not null as changed
            from public.vital_values v
            left join public.practice_entries e on e.ref_id = v.id and e.kind = 'vital' and e.voided_at is null
            where v.pet_id = p_pet order by v.measured_at desc limit 90) x), '[]'::jsonb),
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
        'id', e.id, 'date', e.data->>'date', 'time', e.data->>'time', 'title', e.data->>'title', 'text', e.data->>'text',
        'mine', e.practice_id = c.practice_id, 'by_name', e.created_by_name, 'practice_name', a.name, 'entered_at', e.created_at, 'changed', e.changed_at is not null)
        order by e.data->>'date' desc, e.data->>'time' desc nulls last, e.created_at desc)
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
  if p_kind is null or p_kind not in ('vaccination', 'finding', 'medication', 'weight', 'vital') then
    raise exception 'kind_invalid' using errcode = '22023';
  end if;
  c := private.patient_ctx(p_pet, case when p_kind in ('weight', 'vital') then 'any' else 'clinical' end);
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
  c := private.patient_ctx(e.pet_id, case when e.kind in ('weight', 'vital') then 'any' else 'clinical' end);
  if e.practice_id <> c.practice_id or e.kind = 'history_note' then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if e.voided_at is not null then raise exception 'entry_voided' using errcode = '22023'; end if;
  perform private.check_reason(p_reason, p_note);
  d := private.clean_entry(e.kind, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('stopped_on', e.data->'stopped_on'));
  if d = e.data then raise exception 'no_change' using errcode = '22023'; end if;
  if e.kind in ('vaccination', 'medication', 'weight', 'vital') then
    if e.kind = 'weight' and not exists (select 1 from public.weights w where w.id = e.ref_id)
       or e.kind = 'vital' and not exists (select 1 from public.vital_values w where w.id = e.ref_id) then
      raise exception 'entry_gone' using errcode = 'P0002';
    end if;
    perform private.apply_entry(e.ref_id, e.kind, e.pet_id, c.owner_id, c.practice_name, d);
  end if;
  update public.practice_entries set data = d, changed_at = now() where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, reason, note, before, after, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, e.kind, 'correct', p_reason, nullif(btrim(coalesce(p_note, '')), ''), e.data, d, c.actor, c.actor_name);
end;
$$;

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
  c := private.patient_ctx(e.pet_id, case when e.kind in ('weight', 'vital') then 'any' else 'clinical' end);
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
  elsif e.kind = 'vital' then
    delete from public.vital_values where id = e.ref_id;
  end if;
  update public.practice_entries
    set voided_at = now(), voided_by_name = c.actor_name, void_reason = p_reason, void_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = e.id;
  insert into public.practice_entry_changes (pet_id, practice_id, entry_id, kind, action, reason, note, before, actor, actor_name)
  values (e.pet_id, c.practice_id, e.id, e.kind, 'void', p_reason, nullif(btrim(coalesce(p_note, '')), ''), e.data, c.actor, c.actor_name);
end;
$$;

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
      select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.data->>'date', 'time', e.data->>'time', 'title', e.data->>'title', 'text', e.data->>'text',
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
      where e.pet_id = p_pet and e.kind in ('vaccination', 'medication', 'weight', 'vital') and e.voided_at is null), '{}'::jsonb));
end;
$$;

revoke all on function private.clean_entry(text, jsonb), private.apply_entry(uuid, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.practice_record(uuid), public.practice_add_entry(uuid, text, jsonb), public.practice_correct_entry(uuid, jsonb, text, text),
  public.practice_void_entry(uuid, text, text), public.pet_practice_entries(uuid) from public, anon;
grant execute on function public.practice_record(uuid), public.practice_add_entry(uuid, text, jsonb), public.practice_correct_entry(uuid, jsonb, text, text),
  public.practice_void_entry(uuid, text, text), public.pet_practice_entries(uuid) to authenticated;
