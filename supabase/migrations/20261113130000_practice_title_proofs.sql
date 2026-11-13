-- Etappe P1b: Nachweis für Fachtitel. Die Praxisleitung lädt freiwillig die Urkunde hoch, die App liest sie vor
-- (Edge Function „practice-proof“), der Betreiber bestätigt oder lehnt ab. Danach wird die Datei gelöscht;
-- nur das Ergebnis bleibt. Baut auf 20261113120000_practice_accounts.sql auf.

-- ---------------------------------------------------------------------------
-- Speicher: privater Bucket, Ordner = Praxis-ID
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-proofs', 'practice-proofs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "praxisnachweise hochladen (leitung)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'practice-proofs'
    and (storage.foldername(name))[1] = (select private.my_practice_id())::text
    and (select private.my_practice_role()) = 'lead'
  );

create policy "praxisnachweise ansehen (leitung, admin)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'practice-proofs'
    and (
      ((storage.foldername(name))[1] = (select private.my_practice_id())::text and (select private.my_practice_role()) = 'lead')
      or (select private.is_staff('admin'))
    )
  );

create policy "praxisnachweise loeschen (leitung)" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'practice-proofs'
    and (storage.foldername(name))[1] = (select private.my_practice_id())::text
    and (select private.my_practice_role()) = 'lead'
  );

-- ---------------------------------------------------------------------------
-- Nachweise
-- ---------------------------------------------------------------------------

create table public.practice_title_proofs (
  id uuid primary key,
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  title text not null check (title in ('small_animals', 'surgery', 'reptiles', 'birds', 'horses')),
  -- Name der Person mit dem Titel (wie auf der Urkunde)
  person_name text not null check (char_length(person_name) between 2 and 80),
  path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size integer not null check (size between 1 and 10485760),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Ergebnis des Vorlesens: pending → done | failed | skipped
  read_status text not null default 'pending' check (read_status in ('pending', 'done', 'failed', 'skipped')),
  reading jsonb,
  read_at timestamptz,
  decision text check (decision in ('approved', 'rejected')),
  decision_reason text check (char_length(decision_reason) <= 200),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  file_deleted_at timestamptz
);
create index practice_title_proofs_practice_idx on public.practice_title_proofs (practice_id, created_at desc);
create index practice_title_proofs_open_idx on public.practice_title_proofs (created_at) where decision is null;

alter table public.practice_title_proofs enable row level security;
revoke all on public.practice_title_proofs from anon;
revoke insert, update, delete, truncate on public.practice_title_proofs from authenticated;
grant select on public.practice_title_proofs to authenticated;

create policy "nachweise der eigenen praxis (leitung)" on public.practice_title_proofs
  for select to authenticated
  using (practice_id = (select private.my_practice_id()) and (select private.my_practice_role()) = 'lead');

-- titles_verified neu berechnen (alle angegebenen Titel geprüft) und bei freigeschalteter Praxis ins Verzeichnis übernehmen
create or replace function private.recalc_titles(pid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.practice_accounts;
begin
  update public.practice_accounts set
    verified_titles = array(select x from unnest(verified_titles) x where x = any(titles) order by x),
    titles_verified = cardinality(titles) > 0 and titles <@ verified_titles,
    updated_at = now()
  where id = pid
  returning * into a;
  if a.status = 'active' and a.directory_id is not null then
    update public.practice_profiles set titles_verified = a.titles_verified, updated_at = now() where practice_id = a.directory_id;
  end if;
end;
$$;
revoke all on function private.recalc_titles(uuid) from public, anon, authenticated;

-- Praxisleitung: Nachweis eintragen, nachdem die Datei hochgeladen ist. Pfad: <praxis-id>/<nachweis-id>.<endung>
create or replace function public.practice_add_proof(p_id uuid, p_title text, p_person text, p_path text, p_mime text, p_size integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  ext text := case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.practice_accounts s where s.id = pid and s.status = 'suspended') then
    raise exception 'practice_suspended' using errcode = '42501';
  end if;
  if ext is null or p_path <> pid::text || '/' || p_id::text || '.' || ext then
    raise exception 'proof_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.practice_accounts a where a.id = pid and p_title = any(a.titles)) then
    raise exception 'title_not_claimed' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_person, ''))) not between 2 and 80 then
    raise exception 'name_invalid' using errcode = '22023';
  end if;
  -- Datei muss wirklich im Speicher liegen
  if not exists (select 1 from storage.objects o where o.bucket_id = 'practice-proofs' and o.name = p_path) then
    raise exception 'file_missing' using errcode = 'P0002';
  end if;
  if (select count(*) from public.practice_title_proofs t where t.practice_id = pid and t.decision is null) >= 10 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.practice_title_proofs (id, practice_id, title, person_name, path, mime, size, uploaded_by)
  values (p_id, pid, p_title, btrim(p_person), p_path, p_mime, p_size, (select auth.uid()));
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, (select auth.uid()), 'proof_added', p_title);
  return p_id;
end;
$$;

-- Praxisleitung: noch nicht entschiedenen Nachweis zurückziehen. Liefert den Dateipfad (die App löscht die Datei).
create or replace function public.practice_remove_proof(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  p text;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.practice_title_proofs t where t.id = p_id and t.practice_id = pid and t.decision is null returning t.path into p;
  if p is null then
    raise exception 'proof_not_found' using errcode = 'P0002';
  end if;
  insert into public.practice_audit (practice_id, actor, action) values (pid, (select auth.uid()), 'proof_removed');
  return p;
end;
$$;

-- Für die Edge Function im Namen der angemeldeten Person: Angaben zum Vorlesen (nur Praxisleitung der Praxis oder Admin).
create or replace function public.practice_proof_for_read(p_id uuid)
returns table(id uuid, path text, mime text, title text, person_name text, practice_name text, read_status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select t.id, t.path, t.mime, t.title, t.person_name, a.name, t.read_status
    from public.practice_title_proofs t join public.practice_accounts a on a.id = t.practice_id
    where t.id = p_id
      and t.file_deleted_at is null
      and ((t.practice_id = private.my_practice_id() and private.my_practice_role() = 'lead') or private.is_staff('admin'));
  if not found then
    raise exception 'proof_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Nur Service-Rolle (Edge Function): Ergebnis des Vorlesens speichern.
create or replace function public.practice_proof_set_reading(p_id uuid, p_status text, p_reading jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.practice_title_proofs set read_status = p_status, reading = p_reading, read_at = now()
  where id = p_id and p_status in ('done', 'failed', 'skipped');
$$;

-- Nur Service-Rolle: Datei wurde gelöscht.
create or replace function public.practice_proof_file_deleted(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.practice_title_proofs set file_deleted_at = now() where id = p_id;
$$;

-- Betreiber: offene (oder alle) Nachweise mit Ergebnis des Vorlesens
create or replace function public.staff_practice_proofs(p_open boolean default true)
returns table(id uuid, practice_id uuid, practice_name text, title text, person_name text, path text, mime text, created_at timestamptz,
              read_status text, reading jsonb, decision text, decision_reason text, decided_at timestamptz, file_deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.id, t.practice_id, a.name, t.title, t.person_name, t.path, t.mime, t.created_at,
           t.read_status, t.reading, t.decision, t.decision_reason, t.decided_at, t.file_deleted_at
    from public.practice_title_proofs t join public.practice_accounts a on a.id = t.practice_id
    where not coalesce(p_open, true) or t.decision is null
    order by (t.decision is null) desc, t.created_at desc
    limit 200;
end;
$$;

-- Nur Admin: Nachweis bestätigen oder ablehnen. Bestätigt → Titel gilt als geprüft. Liefert den Dateipfad zum Löschen.
create or replace function public.staff_decide_proof(p_id uuid, approve boolean, reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(coalesce(reason, ''));
  t public.practice_title_proofs;
  a public.practice_accounts;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_reason) < 1 or char_length(clean_reason) > 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.practice_title_proofs set
    decision = case when approve then 'approved' else 'rejected' end,
    decision_reason = clean_reason, decided_by = (select auth.uid()), decided_at = now()
  where id = p_id and decision is null
  returning * into t;
  if not found then
    raise exception 'proof_not_found' using errcode = 'P0002';
  end if;
  if approve then
    update public.practice_accounts set verified_titles = private.text_set(to_jsonb(verified_titles || t.title))
    where id = t.practice_id;
  end if;
  perform private.recalc_titles(t.practice_id);
  select * into a from public.practice_accounts where id = t.practice_id;
  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), case when approve then 'proof_approved' else 'proof_rejected' end, a.created_by, a.name || ' / ' || t.title || ': ' || clean_reason);
  insert into public.practice_audit (practice_id, actor, action, detail)
  values (t.practice_id, (select auth.uid()), case when approve then 'proof_approved' else 'proof_rejected' end, t.title);
  return t.path;
end;
$$;

revoke all on function public.practice_add_proof(uuid, text, text, text, text, integer) from public, anon;
revoke all on function public.practice_remove_proof(uuid) from public, anon;
revoke all on function public.practice_proof_for_read(uuid) from public, anon;
revoke all on function public.practice_proof_set_reading(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.practice_proof_file_deleted(uuid) from public, anon, authenticated;
revoke all on function public.staff_practice_proofs(boolean) from public, anon;
revoke all on function public.staff_decide_proof(uuid, boolean, text) from public, anon;

grant execute on function public.practice_add_proof(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.practice_remove_proof(uuid) to authenticated;
grant execute on function public.practice_proof_for_read(uuid) to authenticated;
grant execute on function public.practice_proof_set_reading(uuid, text, jsonb) to service_role;
grant execute on function public.practice_proof_file_deleted(uuid) to service_role;
grant execute on function public.staff_practice_proofs(boolean) to authenticated;
grant execute on function public.staff_decide_proof(uuid, boolean, text) to authenticated;
