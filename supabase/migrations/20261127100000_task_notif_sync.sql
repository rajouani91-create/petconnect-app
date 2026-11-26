-- Aufgaben und Glocke abgleichen: Wird eine Alltags-Aufgabe abgehakt oder eine Medikamenten-Gabe eingetragen
-- (auf „Heute“, im Alltag, in der Glocke oder per Schnellaktion am Handy), gelten die passenden Benachrichtigungen
-- aller Personen am Tier als gelesen. Rein additiv: zwei Trigger und ein einmaliges Nachziehen alter Meldungen.

create or replace function private.notif_read_on_routine_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
     set read_at = now()
   where n.kind = 'routine' and n.ref_id = new.routine_item_id and n.read_at is null
     and coalesce(nullif(n.info->>'on', '')::date, (n.slot at time zone 'Europe/Berlin')::date) = new.done_on;
  return null;
exception when others then
  -- Abhaken darf nie an der Glocke scheitern
  return null;
end;
$$;

create or replace function private.notif_read_on_dose()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
     set read_at = now()
   where n.kind = 'medication' and n.ref_id = new.medication_id and n.read_at is null
     and coalesce(nullif(n.info->>'on', '')::date, (n.slot at time zone 'Europe/Berlin')::date) = new.scheduled_on
     and n.info->>'time' = to_char(new.scheduled_time, 'HH24:MI');
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.notif_read_on_routine_done(), private.notif_read_on_dose() from public, anon, authenticated;

drop trigger if exists notif_read_on_routine_done on public.routine_done;
create trigger notif_read_on_routine_done after insert on public.routine_done
  for each row execute function private.notif_read_on_routine_done();

drop trigger if exists notif_read_on_dose on public.medication_doses;
create trigger notif_read_on_dose after insert on public.medication_doses
  for each row execute function private.notif_read_on_dose();

-- Einmalig: Meldungen zu bereits erledigten Aufgaben als gelesen markieren
update public.notifications n set read_at = now()
 where n.kind = 'routine' and n.read_at is null
   and exists (select 1 from public.routine_done d where d.routine_item_id = n.ref_id
               and d.done_on = coalesce(nullif(n.info->>'on', '')::date, (n.slot at time zone 'Europe/Berlin')::date));
update public.notifications n set read_at = now()
 where n.kind = 'medication' and n.read_at is null
   and exists (select 1 from public.medication_doses d where d.medication_id = n.ref_id
               and d.scheduled_on = coalesce(nullif(n.info->>'on', '')::date, (n.slot at time zone 'Europe/Berlin')::date)
               and to_char(d.scheduled_time, 'HH24:MI') = n.info->>'time');
