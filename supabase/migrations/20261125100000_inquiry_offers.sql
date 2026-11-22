-- Terminvorschläge der Praxis: Halter:in nimmt an, lehnt ab oder wünscht eine andere Zeit.
-- Annehmen gibt es schon (owner_take_inquiry_slot). Neu: Ablehnen, Wunsch, Push an die Praxis, mehr Felder in den Listen.

alter table public.practice_inquiries add column if not exists owner_wish jsonb;
alter table public.practice_inquiries add column if not exists owner_wish_at timestamptz;
alter table public.practice_inquiries add column if not exists offer_declined_at timestamptz;

-- ---------- Halter:in: Vorschlag ablehnen ----------
create or replace function public.owner_decline_offer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.practice_inquiries%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.practice_inquiries x where x.id = p_id for update;
  if not found or not private.can_edit_pet(q.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if q.status = 'done' or q.offered_slots is null then raise exception 'offer_expired' using errcode = '22023'; end if;
  -- Vorschlag zurückgeben, Anfrage bleibt für die Praxis offen
  update public.practice_inquiries set offered_slots = null, offer_declined_at = now(), status = 'open' where id = p_id;
end;
$$;

-- ---------- Halter:in: andere Zeit wünschen ----------
-- p_days: passende Tage (höchstens 7, ab heute bis 6 Wochen); p_next_week: „nächste Woche“; p_daypart: any | am | pm
create or replace function public.owner_request_other_time(p_id uuid, p_days date[], p_next_week boolean, p_daypart text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.practice_inquiries%rowtype;
  today date := (now() at time zone 'Europe/Berlin')::date;
  d date;
  n text := nullif(btrim(coalesce(p_note, '')), '');
  days date[] := (select array_agg(distinct x order by x) from unnest(coalesce(p_days, '{}'::date[])) x);
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.practice_inquiries x where x.id = p_id for update;
  if not found or not private.can_edit_pet(q.pet_id) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if q.status = 'done' or q.origin <> 'owner' then raise exception 'status_invalid' using errcode = '22023'; end if;
  if coalesce(p_daypart, '') not in ('any', 'am', 'pm') then raise exception 'time_invalid' using errcode = '22023'; end if;
  if coalesce(cardinality(days), 0) > 7 then raise exception 'time_invalid' using errcode = '22023'; end if;
  foreach d in array coalesce(days, '{}'::date[]) loop
    if d < today or d > today + 42 then raise exception 'time_invalid' using errcode = '22023'; end if;
  end loop;
  if n is not null and char_length(n) > 300 then raise exception 'text_invalid' using errcode = '22023'; end if;
  if coalesce(cardinality(days), 0) = 0 and not coalesce(p_next_week, false) and n is null then
    raise exception 'text_invalid' using errcode = '22023';
  end if;
  update public.practice_inquiries
    set owner_wish = jsonb_build_object('days', coalesce(to_jsonb(days), '[]'::jsonb), 'next_week', coalesce(p_next_week, false), 'daypart', p_daypart, 'note', n),
        owner_wish_at = now(), offered_slots = null, status = 'open'
  where id = p_id;
end;
$$;

-- ---------- Listen mit den neuen Feldern ----------
drop function if exists public.practice_inquiries();
create or replace function public.practice_inquiries()
returns table (id uuid, pet_id uuid, has_access boolean, pet_label text, owner_label text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, replied_by_name text, offered_slots timestamptz[], offered_type_name text,
               booked_appointment_id uuid, created_at timestamptz, origin text, owner_reply text, owner_replied_at timestamptz, sent_by_name text,
               offered_at timestamptz, owner_wish jsonb, owner_wish_at timestamptz, offer_declined_at timestamptz, booked_at timestamptz)
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
           q.offered_slots, q.offered_type_name, q.booked_appointment_id, q.created_at, q.origin, q.owner_reply, q.owner_replied_at, q.sent_by_name,
           q.offered_at, q.owner_wish, q.owner_wish_at, q.offer_declined_at, a.starts_at
    from public.practice_inquiries q
    left join public.practice_appointments a on a.id = q.booked_appointment_id
    where q.practice_id = pid and (q.status <> 'done' or q.closed_at > now() - interval '30 days')
    order by (q.status = 'done'), case q.urgency when 'emergency' then 0 when 'soon' then 1 else 2 end, q.created_at
    limit 300;
end;
$$;

drop function if exists public.owner_inquiries();
create or replace function public.owner_inquiries()
returns table (id uuid, pet_id uuid, pet_name text, practice_name text, practice_phone text, topic text, urgency text, message text, status text,
               reply text, replied_at timestamptz, offered_slots timestamptz[], offered_type_name text, can_edit boolean, created_at timestamptz,
               origin text, owner_reply text, owner_replied_at timestamptz, sent_by_name text,
               offered_minutes smallint, offered_at timestamptz, owner_wish jsonb, owner_wish_at timestamptz, offer_declined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.pet_id, q.pet_label, pa.name, pa.phone, q.topic, q.urgency, q.message, q.status, q.reply, q.replied_at,
         case when q.status <> 'done' and q.offered_slots is not null
              then array(select x from unnest(q.offered_slots) x where x > now() + interval '1 hour' order by x) end,
         q.offered_type_name, private.can_edit_pet(q.pet_id), q.created_at, q.origin, q.owner_reply, q.owner_replied_at, q.sent_by_name,
         q.offered_minutes, q.offered_at, q.owner_wish, q.owner_wish_at, q.offer_declined_at
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  where private.is_pet_member(q.pet_id)
  order by q.created_at desc
  limit 100;
$$;

-- ---------- Push an das Team der Praxis: Vorschlag abgelehnt / andere Zeit gewünscht ----------
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
    and q.owner_replied_at > p_now - interval '10 minutes' and q.owner_replied_at <= p_now
  union all
  select ps.user_id, 'inquiry'::text, q.id, e.at, q.pet_label, q.owner_label, jsonb_build_object('event', e.event), '/praxis/anfragen'::text
  from public.practice_inquiries q
  cross join lateral (values ('offer_declined', q.offer_declined_at), ('wish', q.owner_wish_at)) e(event, at)
  join public.practice_staff ps on ps.practice_id = q.practice_id
  where q.origin = 'owner' and e.at is not null and e.at > p_now - interval '10 minutes' and e.at <= p_now;
end;
$$;
revoke all on function private.due_messages(timestamptz) from public, anon, authenticated;

-- ---------- Rechte ----------
revoke all on function public.owner_decline_offer(uuid) from public, anon;
revoke all on function public.owner_request_other_time(uuid, date[], boolean, text, text) from public, anon;
revoke all on function public.practice_inquiries() from public, anon;
revoke all on function public.owner_inquiries() from public, anon;
grant execute on function public.owner_decline_offer(uuid) to authenticated;
grant execute on function public.owner_request_other_time(uuid, date[], boolean, text, text) to authenticated;
grant execute on function public.practice_inquiries() to authenticated;
grant execute on function public.owner_inquiries() to authenticated;
