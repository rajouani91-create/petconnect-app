-- Auftrag 13: Benachrichtigungszentrum, Deep Links und Quick Actions.
-- 1. public.notifications: jede versandte Benachrichtigung bleibt gespeichert (auch ohne Push-Abo und wenn die
--    Meldung am Handy weggewischt wird). Lesen/als gelesen markieren/löschen nur eigene (RLS); anlegen nur serverseitig.
-- 2. Konkretes Ziel je Art (Rechnung, Termin, Anfrage, Praxis-Eintrag …) statt Listen-Seiten.
-- 3. Quick Actions aus der Android-Benachrichtigung: Einmal-Token je Medikament-/Alltags-Meldung (nur Hash gespeichert),
--    public.push_quick_action prüft Token, Frist und Berechtigung und trägt die Gabe bzw. „erledigt“ ein; „Später“ plant
--    eine neue Erinnerung in 30 Minuten (höchstens 3-mal je Gabe).
-- 4. Nachrichten der Praxis an Halter:innen (auf den Anfragen aufgebaut), Halter:in kann antworten; Push an beide Seiten.
-- Abwärtsverträglich: push_claim liefert dieselben Felder wie bisher plus notification_id, category, action;
-- practice_inquiries()/owner_inquiries() liefern zusätzliche Spalten.

-- ---------- Tabellen ----------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) <= 30),
  category text not null check (category in ('practice', 'medication', 'feeding', 'care', 'vaccination', 'appointment', 'message', 'system')),
  ref_id uuid,
  pet_id uuid references public.pets(id) on delete cascade,
  practice_id uuid,
  slot timestamptz not null,
  url text not null check (url ~ '^/' and url !~ '^//' and position(chr(92) in url) = 0 and char_length(url) <= 300),
  pet_name text,
  subject text,
  info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_once unique (user_id, kind, ref_id, slot)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "eigene lesen" on public.notifications;
create policy "eigene lesen" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "eigene als gelesen markieren" on public.notifications;
create policy "eigene als gelesen markieren" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "eigene loeschen" on public.notifications;
create policy "eigene loeschen" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
-- nur „gelesen“ darf geändert werden
grant update (read_at) on public.notifications to authenticated;

-- Einmal-Token für Aktionen aus der Benachrichtigung (nur der SHA-256-Hash)
create table if not exists private.push_actions (
  token_hash text primary key,
  notification_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('medication', 'routine')),
  ref_id uuid not null,
  ref_date date not null,
  ref_time time,
  expires_at timestamptz not null,
  used_at timestamptz,
  result text
);
create index if not exists push_actions_expires_idx on private.push_actions (expires_at);

-- „Später erinnern“: neue Erinnerung an eine noch offene Gabe
create table if not exists private.push_snoozes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ref_id uuid not null,
  ref_date date not null,
  ref_time time not null,
  remind_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, ref_id, remind_at)
);
create index if not exists push_snoozes_remind_idx on private.push_snoozes (remind_at);

-- ---------- Ziel, Kategorie, Tier und Praxis je Benachrichtigung ----------

create or replace function private.notif_meta(p_kind text, p_ref uuid, p_url text, p_info jsonb, p_user uuid)
returns table (url text, category text, pet_id uuid, practice_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_url text := coalesce(p_url, '/');
  v_cat text := 'system';
  v_pet uuid;
  v_prac uuid;
  v_appt uuid;
  v_oa uuid;
  e record;
begin
  if p_kind = 'medication' then
    v_cat := 'medication';
    select m.pet_id into v_pet from public.pet_medications m where m.id = p_ref;
  elsif p_kind = 'routine' then
    v_cat := case when p_info->>'rkind' = 'feed' then 'feeding' else 'care' end;
    select r.pet_id into v_pet from public.routine_items r where r.id = p_ref;
  elsif p_kind = 'reminder' then
    select r.pet_id, case when r.kind like 'vacc%' then 'vaccination' else 'care' end into v_pet, v_cat from public.reminders r where r.id = p_ref;
    v_cat := coalesce(v_cat, 'care');
  elsif p_kind = 'appointment' then
    v_cat := 'appointment';
    select a.pet_id into v_pet from public.appointments a where a.id = p_ref;
    v_url := '/termine?termin=' || p_ref;
  elsif p_kind = 'booking' then
    v_cat := 'appointment';
    -- p_ref: Hinweis (booking_notices), Wartelisten-Eintrag (slot_free) oder Praxistermin (Erinnerung 48/2 h)
    if p_info->>'event' = 'slot_free' then
      select w.pet_id, w.practice_id into v_pet, v_prac from public.practice_waitlist w where w.id = p_ref;
    else
      select n.appointment_id into v_appt from private.booking_notices n where n.id = p_ref;
      v_appt := coalesce(v_appt, p_ref);
      select a.pet_id, a.practice_id into v_pet, v_prac from public.practice_appointments a where a.id = v_appt;
      if p_info->>'target' = 'practice' then
        v_url := '/praxis/termine?termin=' || v_appt;
      else
        select oa.id into v_oa from public.appointments oa where oa.practice_appointment_id = v_appt order by oa.created_at desc limit 1;
        if v_oa is not null then v_url := '/termine?termin=' || v_oa; end if;
      end if;
    end if;
  elsif p_kind = 'practice' then
    v_cat := 'practice';
    select n.pet_id, n.practice_id into v_pet, v_prac from private.practice_notices n where n.id = p_ref;
    -- letzter Eintrag dieser Praxis bei diesem Tier (aus derselben Sitzung wie der Hinweis)
    select pe.id, pe.kind into e from public.practice_entries pe
      where pe.pet_id = v_pet and pe.practice_id = v_prac and pe.voided_at is null
      order by pe.created_at desc limit 1;
    v_url := '/tier?tier=' || v_pet || case
      when e.kind = 'finding' then '&eintrag=' || e.id || '#befunde'
      when e.kind = 'vaccination' then '#impfungen'
      when e.kind = 'medication' then '#medikation'
      when e.kind in ('weight', 'vital') then '#vitalwerte'
      else '#befunde' end;
  elsif p_kind = 'recall' then
    v_cat := 'vaccination';
    select r.pet_id, r.practice_id into v_pet, v_prac from public.practice_recalls r where r.id = p_ref;
    if v_pet is null then select v.pet_id into v_pet from public.vaccinations v where v.id = p_ref; end if;
  elsif p_kind = 'inquiry' then
    v_cat := 'message';
    select q.pet_id, q.practice_id into v_pet, v_prac from public.practice_inquiries q where q.id = p_ref;
    v_url := v_url || '?anfrage=' || p_ref;
  elsif p_kind = 'invoice' then
    v_cat := 'practice';
    select i.pet_id, i.practice_id into v_pet, v_prac from public.practice_invoices i where i.id = p_ref;
    -- die Praxis sieht keine Halter-Seite: Ziel nur für Halter:innen ändern
    if v_url = '/mehr/rechnungen' then v_url := '/mehr/rechnungen/' || p_ref; end if;
  end if;
  url := left(v_url, 300); category := v_cat; pet_id := v_pet; practice_id := v_prac;
  return next;
exception when others then
  -- Ziel nicht bestimmbar: Versand darf daran nie scheitern
  url := left(case when p_url ~ '^/' and p_url !~ '^//' then p_url else '/' end, 300); category := 'system'; pet_id := null; practice_id := null;
  return next;
end;
$$;

-- Wiederholte Erinnerung nach „Später erinnern“: wie eine Medikamenten-Meldung, solange die Gabe offen ist
create or replace function private.due_snoozes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select s.user_id, 'medication'::text, m.id, s.remind_at, p.name, m.name,
         jsonb_build_object('amount', m.amount, 'unit', m.unit, 'hint', m.intake_hint, 'time', to_char(s.ref_time, 'HH24:MI'),
                            'on', s.ref_date, 'snoozed', true),
         '/erinnerungen'::text
  from private.push_snoozes s
  join public.pet_medications m on m.id = s.ref_id
  join public.pets p on p.id = m.pet_id and not coalesce(p.deceased, false)
  where s.remind_at > p_now - interval '10 minutes' and s.remind_at <= p_now
    and exists (select 1 from public.pet_members pm where pm.pet_id = m.pet_id and pm.user_id = s.user_id and pm.role in ('owner', 'carer'))
    and not exists (select 1 from public.medication_doses d where d.medication_id = m.id and d.scheduled_on = s.ref_date and d.scheduled_time = s.ref_time);
end;
$$;

revoke all on function private.notif_meta(text, uuid, text, jsonb, uuid), private.due_snoozes(timestamptz) from public, anon, authenticated;

-- ---------- Versand: Benachrichtigung speichern, Ziel festlegen, Aktions-Token ausgeben ----------

create or replace function public.push_claim(p_token text, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_token is null or p_token <> (select cron_token from private.push_config where id = 1) then
    raise exception 'push_forbidden' using errcode = '42501';
  end if;
  -- Aufräumen: alte Benachrichtigungen und abgelaufene Token
  delete from public.notifications n where n.created_at < p_now - interval '120 days';
  delete from public.notifications n where n.kind in ('medication', 'routine') and n.read_at is not null and n.created_at < p_now - interval '14 days';
  delete from private.push_actions a where a.expires_at < p_now - interval '1 day';
  delete from private.push_snoozes s where s.remind_at < p_now - interval '1 day';

  with due as (
    -- eigene Nachrichten der Praxis lösen keine „Neue Anfrage“ beim Team aus
    select * from private.due_pushes(p_now) d
    where not (d.kind = 'inquiry' and d.info->>'event' = 'new'
               and exists (select 1 from public.practice_inquiries q where q.id = d.ref_id and q.origin = 'practice'))
    union all
    select * from private.due_snoozes(p_now)
    union all
    select * from private.due_messages(p_now)
  ),
  ins as (
    insert into private.push_sent (kind, ref_id, slot, user_id)
    select d.kind, d.ref_id, d.slot, d.user_id from due d
    on conflict do nothing
    returning kind, ref_id, slot, user_id
  ),
  full_rows as (
    select d.*, m.url as target, m.category, m.pet_id, m.practice_id
    from ins i
    join due d on d.kind = i.kind and d.ref_id = i.ref_id and d.slot = i.slot and d.user_id = i.user_id
    cross join lateral private.notif_meta(d.kind, d.ref_id, d.url, d.info, d.user_id) m
  ),
  nt as (
    insert into public.notifications (user_id, kind, category, ref_id, pet_id, practice_id, slot, url, pet_name, subject, info)
    select f.user_id, f.kind, f.category, f.ref_id, f.pet_id, f.practice_id, f.slot, f.target, left(f.pet_name, 120), left(f.title, 200), coalesce(f.info, '{}'::jsonb)
    from full_rows f
    on conflict on constraint notifications_once do nothing
    returning id, user_id, kind, ref_id, slot
  ),
  tk as (
    select nt.id, nt.user_id, nt.kind, nt.ref_id, nt.slot,
           case when nt.kind in ('medication', 'routine') then replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') end as tok
    from nt
  ),
  pa as (
    insert into private.push_actions (token_hash, notification_id, user_id, kind, ref_id, ref_date, ref_time, expires_at)
    select encode(sha256(convert_to(t.tok, 'UTF8')), 'hex'), t.id, t.user_id, t.kind, t.ref_id,
           coalesce((f.info->>'on')::date, (t.slot at time zone 'Europe/Berlin')::date),
           nullif(f.info->>'time', '')::time,
           t.slot + interval '12 hours'
    from tk t
    join full_rows f on f.kind = t.kind and f.ref_id = t.ref_id and f.slot = t.slot and f.user_id = t.user_id
    where t.tok is not null
    returning token_hash
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', f.kind, 'ref_id', f.ref_id, 'slot', f.slot, 'pet', f.pet_name, 'title', f.title, 'info', f.info, 'url', f.target,
           'language', coalesce(pr.language, 'de'),
           'notification_id', t.id, 'category', f.category, 'action', t.tok,
           'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                    from public.push_subscriptions s where s.user_id = f.user_id and s.failures < 10))), '[]'::jsonb)
    into v
  from full_rows f
  left join tk t on t.kind = f.kind and t.ref_id = f.ref_id and t.slot = f.slot and t.user_id = f.user_id
  left join public.profiles pr on pr.id = f.user_id;
  return v;
end;
$$;
revoke all on function public.push_claim(text, timestamptz) from public, anon, authenticated;

-- ---------- Quick Action aus der Benachrichtigung (ohne Anmeldung, nur mit Einmal-Token) ----------

-- p_action: 'done' (Gabe gegeben / Alltag erledigt) oder 'snooze' (in 30 Minuten erneut erinnern, nur Medikament).
-- Ergebnis: {"result": "done" | "already" | "snoozed" | "expired" | "forbidden" | "invalid"}
create or replace function public.push_quick_action(p_token text, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.push_actions%rowtype;
  v_pet uuid;
  n integer;
begin
  if p_token is null or char_length(p_token) <> 64 or p_token !~ '^[0-9a-f]+$' or p_action not in ('done', 'snooze') then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into a from private.push_actions x where x.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or a.expires_at < now() then return jsonb_build_object('result', 'expired'); end if;
  if a.used_at is not null then return jsonb_build_object('result', 'already'); end if;

  if a.kind = 'medication' then
    select m.pet_id into v_pet from public.pet_medications m where m.id = a.ref_id;
  else
    select r.pet_id into v_pet from public.routine_items r where r.id = a.ref_id;
  end if;
  -- Berechtigung zum Zeitpunkt der Aktion (Zugang kann inzwischen entzogen sein)
  if v_pet is null or not exists (select 1 from public.pet_members pm where pm.pet_id = v_pet and pm.user_id = a.user_id and pm.role in ('owner', 'carer'))
     or exists (select 1 from public.pets p where p.id = v_pet and coalesce(p.deceased, false)) then
    update private.push_actions set used_at = now(), result = 'forbidden' where token_hash = a.token_hash;
    return jsonb_build_object('result', 'forbidden');
  end if;

  if p_action = 'snooze' then
    if a.kind <> 'medication' or a.ref_time is null then return jsonb_build_object('result', 'invalid'); end if;
    if exists (select 1 from public.medication_doses d where d.medication_id = a.ref_id and d.scheduled_on = a.ref_date and d.scheduled_time = a.ref_time) then
      update private.push_actions set used_at = now(), result = 'already' where token_hash = a.token_hash;
      return jsonb_build_object('result', 'already');
    end if;
    select count(*) into n from private.push_snoozes s where s.user_id = a.user_id and s.ref_id = a.ref_id and s.ref_date = a.ref_date and s.ref_time = a.ref_time;
    if n >= 3 then return jsonb_build_object('result', 'invalid'); end if;
    insert into private.push_snoozes (user_id, ref_id, ref_date, ref_time, remind_at)
    values (a.user_id, a.ref_id, a.ref_date, a.ref_time, date_trunc('minute', now()) + interval '30 minutes')
    on conflict do nothing;
    update private.push_actions set used_at = now(), result = 'snoozed' where token_hash = a.token_hash;
    update public.notifications set read_at = coalesce(read_at, now()) where id = a.notification_id;
    return jsonb_build_object('result', 'snoozed', 'at', date_trunc('minute', now()) + interval '30 minutes');
  end if;

  if a.kind = 'medication' then
    insert into public.medication_doses (medication_id, pet_id, scheduled_on, scheduled_time, given_by, given_at)
    values (a.ref_id, v_pet, a.ref_date, a.ref_time, a.user_id, now())
    on conflict on constraint medication_doses_once do nothing;
  else
    insert into public.routine_done (routine_item_id, owner_id, done_on)
    values (a.ref_id, a.user_id, a.ref_date)
    on conflict (routine_item_id, done_on) do nothing;
  end if;
  get diagnostics n = row_count;
  update private.push_actions set used_at = now(), result = case when n > 0 then 'done' else 'already' end where token_hash = a.token_hash;
  update public.notifications set read_at = coalesce(read_at, now()) where id = a.notification_id;
  return jsonb_build_object('result', case when n > 0 then 'done' else 'already' end);
end;
$$;
revoke all on function public.push_quick_action(text, text) from public;
grant execute on function public.push_quick_action(text, text) to anon, authenticated;

-- ---------- Nachrichten der Praxis (auf den Anfragen aufgebaut) ----------
-- Die Praxis schreibt den Halter:innen eines Patienten mit Freigabe; die Halter:in kann antworten.
-- origin = 'practice': message = Text der Praxis, owner_reply = Antwort der Halter:in.

alter table public.practice_inquiries add column if not exists origin text not null default 'owner' check (origin in ('owner', 'practice'));
alter table public.practice_inquiries add column if not exists owner_reply text check (char_length(owner_reply) <= 1000);
alter table public.practice_inquiries add column if not exists owner_replied_at timestamptz;
alter table public.practice_inquiries add column if not exists sent_by_name text;

create or replace function public.practice_send_message(p_pet uuid, p_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  t text := btrim(coalesce(p_text, ''));
  pet public.pets%rowtype;
  new_id uuid;
begin
  if pid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(t) not between 1 and 1000 then raise exception 'text_invalid' using errcode = '22023'; end if;
  select * into pet from public.pets p where p.id = p_pet and not coalesce(p.deceased, false);
  if not found or not exists (select 1 from public.pet_practice_access x where x.pet_id = p_pet and x.practice_id = pid) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.practice_inquiries q where q.practice_id = pid and q.origin = 'practice' and q.created_at > now() - interval '1 day') >= 100 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  insert into public.practice_inquiries (practice_id, pet_id, user_id, pet_label, owner_label, topic, urgency, message, status, origin, sent_by_name)
  values (pid, pet.id, null, left(pet.name, 60),
          left(coalesce((select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = pet.owner_id), '–'), 80),
          'question', 'normal', t, 'answered', 'practice', private.staff_name(pid))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.owner_reply_message(p_id uuid, p_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  q public.practice_inquiries%rowtype;
  t text := btrim(coalesce(p_text, ''));
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(t) not between 1 and 1000 then raise exception 'text_invalid' using errcode = '22023'; end if;
  select * into q from public.practice_inquiries x where x.id = p_id for update;
  if not found or q.origin <> 'practice' or not private.can_edit_pet(q.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if q.status = 'done' then raise exception 'status_invalid' using errcode = '22023'; end if;
  update public.practice_inquiries set owner_reply = t, owner_replied_at = now(), status = 'open' where id = p_id;
end;
$$;

drop function if exists public.practice_inquiries();
create or replace function public.practice_inquiries()
returns table (id uuid, pet_id uuid, has_access boolean, pet_label text, owner_label text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, replied_by_name text, offered_slots timestamptz[], offered_type_name text,
               booked_appointment_id uuid, created_at timestamptz, origin text, owner_reply text, owner_replied_at timestamptz, sent_by_name text)
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
           q.offered_slots, q.offered_type_name, q.booked_appointment_id, q.created_at, q.origin, q.owner_reply, q.owner_replied_at, q.sent_by_name
    from public.practice_inquiries q
    where q.practice_id = pid and (q.status <> 'done' or q.closed_at > now() - interval '30 days')
    order by (q.status = 'done'), case q.urgency when 'emergency' then 0 when 'soon' then 1 else 2 end, q.created_at
    limit 300;
end;
$$;

drop function if exists public.owner_inquiries();
create or replace function public.owner_inquiries()
returns table (id uuid, pet_id uuid, pet_name text, practice_name text, practice_phone text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, offered_slots timestamptz[], offered_type_name text, can_edit boolean, created_at timestamptz,
               origin text, owner_reply text, owner_replied_at timestamptz, sent_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.pet_id, q.pet_label, pa.name, pa.phone, q.topic, q.urgency, q.message, q.status, q.reply, q.replied_at,
         case when q.status <> 'done' and q.offered_slots is not null
              then array(select x from unnest(q.offered_slots) x where x > now() + interval '1 hour' order by x) end,
         q.offered_type_name, private.can_edit_pet(q.pet_id), q.created_at, q.origin, q.owner_reply, q.owner_replied_at, q.sent_by_name
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  where private.is_pet_member(q.pet_id)
  order by q.created_at desc
  limit 100;
$$;

-- Push zu Nachrichten: neue Nachricht → Halter:innen; Antwort → Team der Praxis
create or replace function private.due_messages(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select pm.user_id, 'inquiry'::text, q.id, q.created_at, q.pet_label, pa.name, jsonb_build_object('event', 'message'), '/mehr/anfragen'::text
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  join public.pet_members pm on pm.pet_id = q.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where q.origin = 'practice' and coalesce(np.practice, true) and q.created_at > p_now - interval '10 minutes' and q.created_at <= p_now
  union all
  select ps.user_id, 'inquiry'::text, q.id, q.owner_replied_at, q.pet_label, q.owner_label, jsonb_build_object('event', 'owner_reply'), '/praxis/anfragen'::text
  from public.practice_inquiries q
  join public.practice_staff ps on ps.practice_id = q.practice_id
  where q.origin = 'practice' and q.owner_replied_at is not null
    and q.owner_replied_at > p_now - interval '10 minutes' and q.owner_replied_at <= p_now;
end;
$$;
revoke all on function private.due_messages(timestamptz) from public, anon, authenticated;

revoke all on function public.practice_send_message(uuid, text) from public, anon;
revoke all on function public.owner_reply_message(uuid, text) from public, anon;
revoke all on function public.practice_inquiries() from public, anon;
revoke all on function public.owner_inquiries() from public, anon;
grant execute on function public.practice_send_message(uuid, text) to authenticated;
grant execute on function public.owner_reply_message(uuid, text) to authenticated;
grant execute on function public.practice_inquiries() to authenticated;
grant execute on function public.owner_inquiries() to authenticated;
