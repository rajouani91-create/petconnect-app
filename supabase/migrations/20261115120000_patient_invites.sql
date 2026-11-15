-- Etappe P4: Patient aufnehmen und einladen.
-- Die Praxis legt Tier und Halter:in an. Bis zur Einwilligung der Halter:in speichert die Praxis nur Stammdaten und Kontakt
-- (in practice_patient_invites) – es gibt noch kein Tier in der Tierakte und keine Gesundheitseinträge.
-- Nimmt die Halter:in an (per E-Mail-Adresse ihres Kontos oder per Einladungscode), entsteht das Tier in ihrem Konto
-- und die Praxis bekommt die Freigabe. Zugriff nur über Funktionen.

alter table public.pet_practice_access drop constraint if exists pet_practice_access_source_check;
alter table public.pet_practice_access add constraint pet_practice_access_source_check check (source in ('code', 'request', 'invite'));

create table public.practice_patient_invites (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  code text not null unique check (code ~ '^PC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  owner_name text not null check (char_length(owner_name) between 1 and 80),
  owner_email text not null check (owner_email = lower(owner_email) and char_length(owner_email) between 3 and 200),
  owner_phone text check (char_length(owner_phone) <= 40),
  -- Stammdaten des Tieres: name, species, species_other, breed, sex, birth_date, chip_no, kg
  pet jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  pet_id uuid references public.pets(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  -- Zeitpunkt der Einwilligung der Halter:in
  consented_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  answered_at timestamptz
);
create index practice_patient_invites_practice_idx on public.practice_patient_invites (practice_id, created_at desc);
create index practice_patient_invites_email_idx on public.practice_patient_invites (owner_email) where status = 'pending';

-- Fehlversuche beim Eingeben eines Einladungscodes (Schutz vor Durchprobieren)
create table public.patient_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index patient_invite_attempts_idx on public.patient_invite_attempts (user_id, created_at desc);

alter table public.practice_patient_invites enable row level security;
alter table public.patient_invite_attempts enable row level security;
revoke all on public.practice_patient_invites, public.patient_invite_attempts from anon, authenticated;

-- ---------- Hilfsfunktionen ----------

create or replace function private.new_patient_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  s text := '';
  b bytea := extensions.gen_random_bytes(8);
  i int;
begin
  for i in 0..7 loop
    s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return 'PC-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end;
$$;

-- Stammdaten des Tieres prüfen und in feste Form bringen
create or replace function private.clean_invite_pet(d jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  n text := btrim(coalesce(d->>'name', ''));
  sp text := coalesce(d->>'species', '');
  spo text := nullif(btrim(coalesce(d->>'species_other', '')), '');
  sx text := nullif(d->>'sex', '');
  b date := private.iso_date(d->>'birth_date');
  breed text := nullif(btrim(coalesce(d->>'breed', '')), '');
  chip text := nullif(btrim(coalesce(d->>'chip_no', '')), '');
  kg numeric;
begin
  if char_length(n) not between 1 and 60 then raise exception 'pet_name_invalid' using errcode = '22023'; end if;
  if sp not in ('dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse', 'other') then raise exception 'species_invalid' using errcode = '22023'; end if;
  if sp = 'other' and spo is null then raise exception 'species_invalid' using errcode = '22023'; end if;
  if sp <> 'other' then spo := null; end if;
  if char_length(coalesce(spo, '')) > 40 or char_length(coalesce(breed, '')) > 80 or char_length(coalesce(chip, '')) > 40 then
    raise exception 'text_too_long' using errcode = '22023';
  end if;
  if sx is not null and sx not in ('female', 'male') then raise exception 'sex_invalid' using errcode = '22023'; end if;
  if b is not null and (b > today or b < date '1950-01-01') then raise exception 'date_invalid' using errcode = '22023'; end if;
  if coalesce(d->>'kg', '') <> '' then
    if d->>'kg' !~ '^\d{1,4}(\.\d{1,3})?$' then raise exception 'kg_invalid' using errcode = '22023'; end if;
    kg := (d->>'kg')::numeric;
    if kg <= 0 or kg >= 2000 then raise exception 'kg_invalid' using errcode = '22023'; end if;
  end if;
  return jsonb_build_object('name', n, 'species', sp, 'species_other', spo, 'breed', breed, 'sex', sx, 'birth_date', b, 'chip_no', chip, 'kg', kg);
end;
$$;

-- E-Mail-Adresse des angemeldeten Kontos (nur wenn bestätigt)
create or replace function private.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

revoke all on function private.new_patient_invite_code(), private.clean_invite_pet(jsonb), private.my_confirmed_email() from public, anon, authenticated;

-- ---------- Praxis ----------

-- Patient aufnehmen: legt die Einladung an (alle Rollen). Die E-Mail verschickt die Edge Function „patient-invite“.
create or replace function public.practice_create_patient_invite(p_owner jsonb, p_pet jsonb)
returns table (invite_id uuid, code text, email text, owner_name text, pet_name text, practice_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  uid uuid := (select auth.uid());
  o jsonb := coalesce(p_owner, '{}'::jsonb);
  n text := btrim(coalesce(o->>'name', ''));
  e text := lower(btrim(coalesce(o->>'email', '')));
  ph text := nullif(btrim(coalesce(o->>'phone', '')), '');
  v_pet jsonb := private.clean_invite_pet(coalesce(p_pet, '{}'::jsonb));
  actor text;
  new_code text;
  new_id uuid;
  tries int := 0;
begin
  if char_length(n) not between 1 and 80 then raise exception 'name_invalid' using errcode = '22023'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 200 then raise exception 'email_invalid' using errcode = '22023'; end if;
  if char_length(coalesce(ph, '')) > 40 then raise exception 'text_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.practice_patient_invites i where i.practice_id = pid and i.created_at > now() - interval '1 day') >= 50 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  if exists (select 1 from public.practice_patient_invites i
             where i.practice_id = pid and i.owner_email = e and i.status = 'pending' and i.expires_at > now()
               and lower(i.pet->>'name') = lower(v_pet->>'name')) then
    raise exception 'invite_exists' using errcode = '23505';
  end if;
  -- Aufräumen: abgelehnte, zurückgezogene und abgelaufene Einladungen nach 90 Tagen löschen (Kontaktdaten ohne Einwilligung)
  delete from public.practice_patient_invites i
  where (i.status in ('declined', 'revoked') and i.answered_at < now() - interval '90 days')
     or (i.status = 'pending' and i.expires_at < now() - interval '90 days');
  select coalesce(nullif(btrim(pr.display_name), ''), a.name) into actor
  from public.practice_accounts a left join public.profiles pr on pr.id = uid where a.id = pid;
  loop
    new_code := private.new_patient_invite_code();
    exit when not exists (select 1 from public.practice_patient_invites i where i.code = new_code);
    tries := tries + 1;
    if tries > 5 then raise exception 'code_failed'; end if;
  end loop;
  insert into public.practice_patient_invites (practice_id, code, owner_name, owner_email, owner_phone, pet, created_by, created_by_name)
  values (pid, new_code, n, e, ph, v_pet, uid, actor) returning id into new_id;
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, uid, 'patient_invited', e);
  return query
    select i.id, i.code, i.owner_email, i.owner_name, i.pet->>'name', a.name, i.expires_at
    from public.practice_patient_invites i join public.practice_accounts a on a.id = i.practice_id where i.id = new_id;
end;
$$;

-- Einladung erneut senden (frühestens nach 10 Minuten); verlängert die Gültigkeit
create or replace function public.practice_resend_patient_invite(p_id uuid)
returns table (invite_id uuid, code text, email text, owner_name text, pet_name text, practice_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  i public.practice_patient_invites%rowtype;
begin
  select * into i from public.practice_patient_invites x where x.id = p_id and x.practice_id = pid for update;
  if not found or i.status <> 'pending' then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if i.last_sent_at > now() - interval '10 minutes' then raise exception 'too_soon' using errcode = '54000'; end if;
  update public.practice_patient_invites set last_sent_at = now(), expires_at = now() + interval '30 days' where id = p_id;
  return query
    select x.id, x.code, x.owner_email, x.owner_name, x.pet->>'name', a.name, x.expires_at
    from public.practice_patient_invites x join public.practice_accounts a on a.id = x.practice_id where x.id = p_id;
end;
$$;

create or replace function public.practice_revoke_patient_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  update public.practice_patient_invites set status = 'revoked', answered_at = now()
  where id = p_id and practice_id = pid and status = 'pending';
  if not found then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  insert into public.practice_audit (practice_id, actor, action) values (pid, (select auth.uid()), 'patient_invite_revoked');
end;
$$;

-- Einladungen der Praxis: offene, abgelehnte und abgelaufene; angenommene der letzten 30 Tage
create or replace function public.practice_patient_invites()
returns table (id uuid, owner_name text, email text, pet_name text, species text, species_other text, status text, code text,
               created_at timestamptz, expires_at timestamptz, answered_at timestamptz, pet_id uuid, by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select i.id, i.owner_name, i.owner_email, i.pet->>'name', i.pet->>'species', i.pet->>'species_other',
           case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
           case when i.status = 'pending' and i.expires_at > now() then i.code end,
           i.created_at, i.expires_at, i.answered_at, i.pet_id, i.created_by_name
    from public.practice_patient_invites i
    where i.practice_id = pid and i.status <> 'revoked'
      and (i.status <> 'accepted' or i.answered_at > now() - interval '30 days')
    order by i.created_at desc
    limit 200;
end;
$$;

-- ---------- Halter:in ----------

-- Offene Einladungen an die bestätigte E-Mail-Adresse meines Kontos (nur Halter-Konten)
create or replace function public.owner_patient_invites()
returns table (id uuid, practice_name text, city text, pet jsonb, owner_name text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, a.name, a.city, i.pet - 'kg', i.owner_name, i.created_at, i.expires_at
  from public.practice_patient_invites i join public.practice_accounts a on a.id = i.practice_id
  where i.owner_email = private.my_confirmed_email() and i.status = 'pending' and i.expires_at > now()
    and a.status = 'active' and not private.is_practice_account()
  order by i.created_at desc;
$$;

-- Einladung per Code nachschlagen (falls das Konto eine andere E-Mail-Adresse hat). Höchstens 10 Fehlversuche je Stunde.
create or replace function public.owner_patient_invite_by_code(p_code text)
returns table (id uuid, practice_name text, city text, pet jsonb, owner_name text, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if uid is null or private.is_practice_account() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.patient_invite_attempts t where t.user_id = uid and t.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;
  if c ~ '^PC[2-9A-HJ-NP-Z]{8}$' then
    c := 'PC-' || substr(c, 3, 4) || '-' || substr(c, 7, 4);
    return query
      select i.id, a.name, a.city, i.pet - 'kg', i.owner_name, i.created_at, i.expires_at
      from public.practice_patient_invites i join public.practice_accounts a on a.id = i.practice_id
      where i.code = c and i.status = 'pending' and i.expires_at > now() and a.status = 'active';
    if found then return; end if;
  end if;
  -- kein Treffer: Fehlversuch zählen (kein Fehler, damit der Zähler erhalten bleibt)
  insert into public.patient_invite_attempts (user_id) values (uid);
end;
$$;

-- Einladung annehmen (mit Einwilligung) oder ablehnen. Berechtigt: passende E-Mail-Adresse oder der Einladungscode.
-- Annahme legt das Tier im Konto der Halter:in an und gibt der Praxis die Freigabe. Rückgabe: ID des Tieres (bei Ablehnung null).
create or replace function public.owner_answer_patient_invite(p_id uuid, p_accept boolean, p_consent boolean default false, p_code text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  i public.practice_patient_invites%rowtype;
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  new_pet uuid;
begin
  if uid is null or private.is_practice_account() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into i from public.practice_patient_invites x where x.id = p_id for update;
  if not found or i.status <> 'pending' or i.expires_at <= now()
     or not (i.owner_email = private.my_confirmed_email() or replace(i.code, '-', '') = c) then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if not coalesce(p_accept, false) then
    update public.practice_patient_invites set status = 'declined', answered_at = now() where id = p_id;
    return null;
  end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.practice_accounts a where a.id = i.practice_id and a.status = 'active') then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  insert into public.pets (owner_id, name, species, species_other, breed, sex, birth_date, chip_no, owner_phone)
  values (uid, i.pet->>'name', i.pet->>'species', i.pet->>'species_other', i.pet->>'breed', i.pet->>'sex',
          (i.pet->>'birth_date')::date, i.pet->>'chip_no', i.owner_phone)
  returning id into new_pet;
  if (i.pet->>'kg') is not null then
    insert into public.weights (pet_id, owner_id, kg, measured_on) values (new_pet, uid, (i.pet->>'kg')::numeric, (i.created_at at time zone 'Europe/Berlin')::date);
  end if;
  insert into public.pet_practice_access (pet_id, practice_id, source, granted_by) values (new_pet, i.practice_id, 'invite', uid);
  update public.practice_patient_invites
    set status = 'accepted', answered_at = now(), consented_at = now(), accepted_by = uid, pet_id = new_pet where id = p_id;
  insert into public.practice_audit (practice_id, actor, action, detail) values (i.practice_id, uid, 'patient_invite_accepted', i.pet->>'name');
  return new_pet;
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_create_patient_invite(jsonb, jsonb) from public, anon;
revoke all on function public.practice_resend_patient_invite(uuid) from public, anon;
revoke all on function public.practice_revoke_patient_invite(uuid) from public, anon;
revoke all on function public.practice_patient_invites() from public, anon;
revoke all on function public.owner_patient_invites() from public, anon;
revoke all on function public.owner_patient_invite_by_code(text) from public, anon;
revoke all on function public.owner_answer_patient_invite(uuid, boolean, boolean, text) from public, anon;

grant execute on function public.practice_create_patient_invite(jsonb, jsonb) to authenticated;
grant execute on function public.practice_resend_patient_invite(uuid) to authenticated;
grant execute on function public.practice_revoke_patient_invite(uuid) to authenticated;
grant execute on function public.practice_patient_invites() to authenticated;
grant execute on function public.owner_patient_invites() to authenticated;
grant execute on function public.owner_patient_invite_by_code(text) to authenticated;
grant execute on function public.owner_answer_patient_invite(uuid, boolean, boolean, text) to authenticated;
