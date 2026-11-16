-- Etappe P6: Erinnerungen (Recall) und Anfragen.
-- Recall: Die Praxis sieht fällige Impfungen ihrer Patienten (überfällig oder in 60 Tagen fällig) und erinnert die
-- Halter:in per Klick, für alle auf einmal oder automatisch 14 Tage vor Fälligkeit (Push mit Link zur Online-Buchung).
-- Anfragen: Halter:innen schreiben einer Praxis mit Freigabe für das Tier (Frage, Rezept, Beschwerden; Dringlichkeit).
-- Die Praxis antwortet, bietet bis zu drei Termine an (die Halter:in übernimmt einen, sofort bestätigt) oder schließt ab.

-- ---------- Tabellen ----------

alter table public.practice_booking_settings add column if not exists recall_auto boolean not null default false;

create table public.practice_recalls (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  vaccination_id uuid not null references public.vaccinations(id) on delete cascade,
  vaccine text not null,
  due_on date not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text,
  unique (practice_id, vaccination_id)
);
create index practice_recalls_sent_idx on public.practice_recalls (sent_at);
alter table public.practice_recalls enable row level security;
revoke all on public.practice_recalls from anon, authenticated;

create table public.practice_inquiries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  pet_label text not null,
  owner_label text not null,
  topic text not null check (topic in ('question', 'prescription', 'symptoms')),
  urgency text not null check (urgency in ('emergency', 'soon', 'normal')),
  message text not null check (char_length(message) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'answered', 'done')),
  reply text check (char_length(reply) <= 1000),
  replied_at timestamptz,
  replied_by_name text,
  offered_slots timestamptz[],
  offered_type_id uuid references public.practice_appointment_types(id) on delete set null,
  offered_type_name text,
  offered_minutes smallint,
  offered_at timestamptz,
  booked_appointment_id uuid references public.practice_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index practice_inquiries_practice_idx on public.practice_inquiries (practice_id, status, created_at);
create index practice_inquiries_pet_idx on public.practice_inquiries (pet_id);
alter table public.practice_inquiries enable row level security;
revoke all on public.practice_inquiries from anon, authenticated;

alter table private.booking_notices drop constraint if exists booking_notices_event_check;
alter table private.booking_notices add constraint booking_notices_event_check
  check (event in ('requested', 'confirmed', 'declined', 'cancelled', 'cancelled_alt', 'moved', 'owner_cancelled', 'alt_taken', 'offer_taken'));

-- ---------- Hilfsfunktionen ----------

-- Aktuelle Impfung je Tier und Impfstoff (die jüngste), mit Fälligkeit
create or replace function private.current_vaccinations(pid uuid)
returns table (vaccination_id uuid, pet_id uuid, vaccine text, due_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (v.pet_id, lower(btrim(v.name))) v.id, v.pet_id, v.name, v.valid_until
  from public.vaccinations v
  join public.pet_practice_access x on x.pet_id = v.pet_id and x.practice_id = pid
  join public.pets p on p.id = v.pet_id and not coalesce(p.deceased, false)
  order by v.pet_id, lower(btrim(v.name)), v.given_on desc nulls last, v.created_at desc;
$$;

revoke all on function private.current_vaccinations(uuid) from public, anon, authenticated;

-- ---------- Push ----------

create or replace function private.due_pushes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language sql
stable
security definer
set search_path = ''
as $$
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
  select pm.user_id, 'booking', w.id, w.notified_at, w.pet_label, pa.name,
         jsonb_build_object('event', 'slot_free', 'target', 'owner', 'starts_at', w.offered_at), '/termine'
  from public.practice_waitlist w
  join public.practice_accounts pa on pa.id = w.practice_id
  join public.pet_members pm on pm.pet_id = w.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where w.status = 'offered' and coalesce(np.practice, true) and w.notified_at > p_now - interval '10 minutes' and w.notified_at <= p_now
  union all
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
    and a.created_at < a.starts_at - make_interval(hours => h.hours)
  union all
  -- Recall per Klick
  select pm.user_id, 'recall', r.id, r.sent_at, p.name, pa.name,
         jsonb_build_object('vaccine', r.vaccine, 'due_on', r.due_on), '/termine/buchen?praxis=' || r.practice_id
  from public.practice_recalls r
  join public.practice_accounts pa on pa.id = r.practice_id
  join public.pets p on p.id = r.pet_id and not coalesce(p.deceased, false)
  join public.pet_members pm on pm.pet_id = r.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.practice, true) and r.sent_at > p_now - interval '10 minutes' and r.sent_at <= p_now
  union all
  -- Recall automatisch 14 Tage vor Fälligkeit (09:00), außer schon per Klick erinnert
  select pm.user_id, 'recall', cv.vaccination_id, ((cv.due_on - 14) + time '09:00') at time zone 'Europe/Berlin', p.name, pa.name,
         jsonb_build_object('vaccine', cv.vaccine, 'due_on', cv.due_on), '/termine/buchen?praxis=' || s.practice_id
  from public.practice_booking_settings s
  join public.practice_accounts pa on pa.id = s.practice_id and pa.status = 'active'
  cross join lateral private.current_vaccinations(s.practice_id) cv
  join public.pets p on p.id = cv.pet_id
  join public.pet_members pm on pm.pet_id = cv.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where s.recall_auto and coalesce(np.practice, true) and cv.due_on is not null
    and ((cv.due_on - 14) + time '09:00') at time zone 'Europe/Berlin' > p_now - interval '10 minutes'
    and ((cv.due_on - 14) + time '09:00') at time zone 'Europe/Berlin' <= p_now
    and not exists (select 1 from public.practice_recalls r where r.practice_id = s.practice_id and r.vaccination_id = cv.vaccination_id)
  union all
  -- Anfragen: neu → Praxisteam
  select ps.user_id, 'inquiry', q.id, q.created_at, q.pet_label, q.owner_label,
         jsonb_build_object('event', 'new', 'urgency', q.urgency), '/praxis/anfragen'
  from public.practice_inquiries q
  join public.practice_staff ps on ps.practice_id = q.practice_id
  where q.created_at > p_now - interval '10 minutes' and q.created_at <= p_now
  union all
  -- Anfragen: Antwort / Terminvorschlag → Halter:in
  select pm.user_id, 'inquiry', q.id, e.at, q.pet_label, pa.name, jsonb_build_object('event', e.event), '/mehr/anfragen'
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  cross join lateral (values ('answered', q.replied_at), ('offered', q.offered_at)) e(event, at)
  join public.pet_members pm on pm.pet_id = q.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where e.at is not null and coalesce(np.practice, true) and e.at > p_now - interval '10 minutes' and e.at <= p_now;
$$;
revoke all on function private.due_pushes(timestamptz) from public, anon, authenticated;

-- ---------- Praxis: Recall ----------

create or replace function public.practice_recalls()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  today date := (now() at time zone 'Europe/Berlin')::date;
  auto boolean := coalesce((select s.recall_auto from public.practice_booking_settings s where s.practice_id = pid), false);
begin
  return jsonb_build_object(
    'auto', auto,
    'can_edit', private.my_practice_role() = 'lead',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vaccination_id', cv.vaccination_id, 'pet_id', cv.pet_id, 'pet_name', p.name,
        'owner_name', coalesce(nullif(btrim(pr.display_name), ''), '–'), 'vaccine', cv.vaccine, 'due_on', cv.due_on,
        'days', cv.due_on - today,
        'sent_at', r.sent_at, 'sent_by_name', r.sent_by_name,
        'auto_sent', r.id is null and auto and ((cv.due_on - 14) + time '09:00') at time zone 'Europe/Berlin' <= now())
        order by cv.due_on, p.name)
      from private.current_vaccinations(pid) cv
      join public.pets p on p.id = cv.pet_id
      left join public.profiles pr on pr.id = p.owner_id
      left join public.practice_recalls r on r.practice_id = pid and r.vaccination_id = cv.vaccination_id
      where cv.due_on is not null and cv.due_on <= today + 60), '[]'::jsonb));
end;
$$;

create or replace function public.practice_send_recall(p_vaccination uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  cv record;
begin
  select * into cv from private.current_vaccinations(pid) x where x.vaccination_id = p_vaccination;
  if not found or cv.due_on is null then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.practice_recalls r where r.practice_id = pid and r.vaccination_id = p_vaccination and r.sent_at > now() - interval '7 days') then
    raise exception 'already_sent' using errcode = '22023';
  end if;
  insert into public.practice_recalls (practice_id, pet_id, vaccination_id, vaccine, due_on, sent_by, sent_by_name)
  values (pid, cv.pet_id, p_vaccination, cv.vaccine, cv.due_on, (select auth.uid()), private.staff_name(pid))
  on conflict (practice_id, vaccination_id) do update
    set sent_at = now(), sent_by = excluded.sent_by, sent_by_name = excluded.sent_by_name, due_on = excluded.due_on;
end;
$$;

-- Alle noch nicht erinnerten (überfällig oder in 60 Tagen fällig). Ergebnis: Anzahl
create or replace function public.practice_send_all_recalls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  today date := (now() at time zone 'Europe/Berlin')::date;
  n integer;
begin
  insert into public.practice_recalls (practice_id, pet_id, vaccination_id, vaccine, due_on, sent_by, sent_by_name)
  select pid, cv.pet_id, cv.vaccination_id, cv.vaccine, cv.due_on, (select auth.uid()), private.staff_name(pid)
  from private.current_vaccinations(pid) cv
  where cv.due_on is not null and cv.due_on <= today + 60
    and not exists (select 1 from public.practice_recalls r where r.practice_id = pid and r.vaccination_id = cv.vaccination_id)
  limit 500;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.practice_set_recall_auto(p_on boolean)
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
  update public.practice_booking_settings set recall_auto = p_on, updated_at = now() where practice_id = pid;
end;
$$;

-- ---------- Praxis: Anfragen ----------

create or replace function public.practice_inquiries()
returns table (id uuid, pet_id uuid, has_access boolean, pet_label text, owner_label text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, replied_by_name text, offered_slots timestamptz[], offered_type_name text,
               booked_appointment_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select q.id, q.pet_id, exists (select 1 from public.pet_practice_access x where x.pet_id = q.pet_id and x.practice_id = pid),
           q.pet_label, q.owner_label, q.topic, q.urgency, q.message, q.status, q.reply, q.replied_at, q.replied_by_name,
           q.offered_slots, q.offered_type_name, q.booked_appointment_id, q.created_at
    from public.practice_inquiries q
    where q.practice_id = pid and (q.status <> 'done' or q.closed_at > now() - interval '30 days')
    order by (q.status = 'done'), case q.urgency when 'emergency' then 0 when 'soon' then 1 else 2 end, q.created_at
    limit 300;
end;
$$;

create or replace function public.practice_reply_inquiry(p_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  t text := btrim(coalesce(p_text, ''));
begin
  if char_length(t) not between 1 and 1000 then raise exception 'text_invalid' using errcode = '22023'; end if;
  update public.practice_inquiries set reply = t, replied_at = now(), replied_by_name = private.staff_name(pid),
    status = case when status = 'done' then 'done' else 'answered' end
  where id = p_id and practice_id = pid;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- Bis zu drei freie Termine anbieten (Terminart der Praxis); die Halter:in übernimmt einen
create or replace function public.practice_offer_inquiry(p_id uuid, p_type_id uuid, p_slots timestamptz[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  q public.practice_inquiries%rowtype;
  ty public.practice_appointment_types%rowtype;
  s timestamptz;
  w jsonb;
begin
  select * into q from public.practice_inquiries x where x.id = p_id and x.practice_id = pid for update;
  if not found or q.status = 'done' then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.pet_practice_access x where x.pet_id = q.pet_id and x.practice_id = pid) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  select * into ty from public.practice_appointment_types t where t.id = p_type_id and t.practice_id = pid and t.active;
  if not found then raise exception 'type_not_found' using errcode = 'P0002'; end if;
  if p_slots is null or cardinality(p_slots) not between 1 and 3 then raise exception 'time_invalid' using errcode = '22023'; end if;
  foreach s in array p_slots loop
    if s <= now() + interval '1 hour' then raise exception 'time_invalid' using errcode = '22023'; end if;
    w := private.appointment_warnings(pid, s, ty.minutes, null);
    if (w->>'closed') is not null or jsonb_array_length(w->'overlaps') > 0 then raise exception 'slot_conflict' using errcode = '23P01'; end if;
  end loop;
  update public.practice_inquiries
    set offered_slots = (select array_agg(distinct x order by x) from unnest(p_slots) x), offered_type_id = ty.id, offered_type_name = ty.name,
        offered_minutes = ty.minutes, offered_at = now(), status = 'answered'
  where id = p_id;
end;
$$;

create or replace function public.practice_close_inquiry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  update public.practice_inquiries set status = 'done', closed_at = now() where id = p_id and practice_id = pid and status <> 'done';
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- ---------- Halter:in: Anfragen ----------

-- Praxen, denen ich für ein Tier schreiben kann (Freigabe besteht, ich darf das Tier bearbeiten)
create or replace function public.owner_inquiry_targets()
returns table (pet_id uuid, pet_name text, practice_id uuid, practice_name text, practice_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, pa.id, pa.name, pa.phone
  from public.pet_practice_access x
  join public.pets p on p.id = x.pet_id and not coalesce(p.deceased, false)
  join public.practice_accounts pa on pa.id = x.practice_id and pa.status = 'active'
  where private.can_edit_pet(p.id)
  order by p.name, pa.name;
$$;

-- p: pet_id, practice_id, topic, urgency, message
create or replace function public.owner_send_inquiry(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d jsonb := coalesce(p, '{}'::jsonb);
  pet public.pets%rowtype;
  pid uuid;
  msg text := btrim(coalesce(d->>'message', ''));
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(d->>'pet_id', '') !~ '^[0-9a-f-]{36}$' or coalesce(d->>'practice_id', '') !~ '^[0-9a-f-]{36}$' then
    raise exception 'pet_not_found' using errcode = 'P0002';
  end if;
  pid := (d->>'practice_id')::uuid;
  select * into pet from public.pets x where x.id = (d->>'pet_id')::uuid and not coalesce(x.deceased, false);
  if not found or not private.can_edit_pet(pet.id)
     or not exists (select 1 from public.pet_practice_access x join public.practice_accounts a on a.id = x.practice_id and a.status = 'active'
                    where x.pet_id = pet.id and x.practice_id = pid) then
    raise exception 'pet_not_found' using errcode = 'P0002';
  end if;
  if coalesce(d->>'topic', '') not in ('question', 'prescription', 'symptoms') or coalesce(d->>'urgency', '') not in ('emergency', 'soon', 'normal') then
    raise exception 'status_invalid' using errcode = '22023';
  end if;
  if char_length(msg) not between 1 and 1000 then raise exception 'text_invalid' using errcode = '22023'; end if;
  if (select count(*) from public.practice_inquiries q where q.user_id = uid and q.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  insert into public.practice_inquiries (practice_id, pet_id, user_id, pet_label, owner_label, topic, urgency, message)
  values (pid, pet.id, uid, left(pet.name, 60),
          left(coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = uid), '–'), 80),
          d->>'topic', d->>'urgency', msg)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.owner_inquiries()
returns table (id uuid, pet_id uuid, pet_name text, practice_name text, practice_phone text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, offered_slots timestamptz[], offered_type_name text, can_edit boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.pet_id, q.pet_label, pa.name, pa.phone, q.topic, q.urgency, q.message, q.status, q.reply, q.replied_at,
         case when q.status <> 'done' and q.offered_slots is not null
              then array(select x from unnest(q.offered_slots) x where x > now() + interval '1 hour' order by x) end,
         q.offered_type_name, private.can_edit_pet(q.pet_id), q.created_at
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  where private.is_pet_member(q.pet_id)
  order by q.created_at desc
  limit 100;
$$;

-- Vorgeschlagenen Termin übernehmen (von der Praxis angeboten, daher sofort bestätigt)
create or replace function public.owner_take_inquiry_slot(p_id uuid, p_slot timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  q public.practice_inquiries%rowtype;
  warn jsonb;
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.practice_inquiries x where x.id = p_id for update;
  if not found or not private.can_edit_pet(q.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if q.status = 'done' or q.offered_slots is null or not (p_slot = any (q.offered_slots)) or p_slot <= now() + interval '1 hour' then
    raise exception 'offer_expired' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(q.practice_id::text, 0));
  warn := private.appointment_warnings(q.practice_id, p_slot, q.offered_minutes, null);
  if (warn->>'closed') is not null or jsonb_array_length(warn->'overlaps') > 0 then
    raise exception 'slot_taken' using errcode = '23P01';
  end if;
  insert into public.practice_appointments (practice_id, pet_id, pet_label, pet_species, owner_label, phone, type_id, type_name, starts_at, minutes,
                                            status, source, new_client, note, overridden, booked_by, created_by, created_by_name)
  select q.practice_id, q.pet_id, q.pet_label, left(coalesce(nullif(btrim(p.species_other), ''), p.species), 40), q.owner_label,
          left(nullif(btrim(p.owner_phone), ''), 40), q.offered_type_id, q.offered_type_name, p_slot, q.offered_minutes,
          'confirmed', 'online', false, left(q.message, 300), false, uid, uid, q.owner_label
  from public.pets p where p.id = q.pet_id
  returning id into new_id;
  update public.practice_inquiries set booked_appointment_id = new_id, offered_slots = null, status = 'done', closed_at = now() where id = q.id;
  perform private.sync_owner_appointment(new_id);
  perform private.queue_booking_notice(new_id, 'practice', 'offer_taken');
  return new_id;
end;
$$;

create or replace function public.owner_close_inquiry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.practice_inquiries%rowtype;
begin
  select * into q from public.practice_inquiries x where x.id = p_id;
  if not found or not private.can_edit_pet(q.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  update public.practice_inquiries set status = 'done', closed_at = now() where id = p_id and status <> 'done';
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_recalls() from public, anon;
revoke all on function public.practice_send_recall(uuid) from public, anon;
revoke all on function public.practice_send_all_recalls() from public, anon;
revoke all on function public.practice_set_recall_auto(boolean) from public, anon;
revoke all on function public.practice_inquiries() from public, anon;
revoke all on function public.practice_reply_inquiry(uuid, text) from public, anon;
revoke all on function public.practice_offer_inquiry(uuid, uuid, timestamptz[]) from public, anon;
revoke all on function public.practice_close_inquiry(uuid) from public, anon;
revoke all on function public.owner_inquiry_targets() from public, anon;
revoke all on function public.owner_send_inquiry(jsonb) from public, anon;
revoke all on function public.owner_inquiries() from public, anon;
revoke all on function public.owner_take_inquiry_slot(uuid, timestamptz) from public, anon;
revoke all on function public.owner_close_inquiry(uuid) from public, anon;

grant execute on function public.practice_recalls() to authenticated;
grant execute on function public.practice_send_recall(uuid) to authenticated;
grant execute on function public.practice_send_all_recalls() to authenticated;
grant execute on function public.practice_set_recall_auto(boolean) to authenticated;
grant execute on function public.practice_inquiries() to authenticated;
grant execute on function public.practice_reply_inquiry(uuid, text) to authenticated;
grant execute on function public.practice_offer_inquiry(uuid, uuid, timestamptz[]) to authenticated;
grant execute on function public.practice_close_inquiry(uuid) to authenticated;
grant execute on function public.owner_inquiry_targets() to authenticated;
grant execute on function public.owner_send_inquiry(jsonb) to authenticated;
grant execute on function public.owner_inquiries() to authenticated;
grant execute on function public.owner_take_inquiry_slot(uuid, timestamptz) to authenticated;
grant execute on function public.owner_close_inquiry(uuid) to authenticated;
