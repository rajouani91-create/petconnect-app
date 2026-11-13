-- Etappe P1: Praxis-Konto, Praxisprofil und Mitarbeitende.
-- Eine Praxis registriert sich (Konto-Art „practice“), verknüpft optional einen Eintrag aus dem Praxisverzeichnis,
-- lädt Mitarbeitende per E-Mail ein (Rollen: lead = Praxisleitung, vet = Tierärzt:in, team = Praxisteam/Empfang)
-- und wird vom Betreiber freigeschaltet. Vor der Freischaltung sieht eine Praxis keine Patientendaten.
-- Schreibzugriffe laufen nur über Funktionen; die Tabellen haben ausschließlich Lese-Regeln.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Art des Kontos. Fehlt die Zeile, ist es ein Halter-Konto. Wird nur beim Anlegen des Kontos gesetzt
-- (handle_new_user); die Person selbst kann sie nicht ändern.
create table public.account_kinds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind text not null check (kind in ('owner', 'practice')),
  created_at timestamptz not null default now()
);

create table public.practice_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Verknüpfter Eintrag im Praxisverzeichnis (OSM oder eigener Eintrag); jeder Eintrag gehört höchstens einer Praxis.
  directory_id uuid unique references public.practices (id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  street text check (char_length(street) <= 120),
  housenumber text check (char_length(housenumber) <= 20),
  postcode text check (char_length(postcode) <= 12),
  city text check (char_length(city) <= 80),
  country text not null default 'DE' check (country ~ '^[A-Z]{2}$'),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 200),
  website text check (char_length(website) <= 200),
  hours_text text check (char_length(hours_text) <= 300),
  -- Angebots-Fragebogen: dieselben Werte wie die Filter der Praxissuche (practice_profiles)
  species text[] not null default '{}' check (species <@ array['dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse']),
  services text[] not null default '{}' check (services <@ array['surgery', 'dentistry', 'imaging', 'ct_mri', 'blood_bank', 'hibernation', 'home_visits', 'emergency_24h', 'physio', 'equine_mobile']),
  titles text[] not null default '{}' check (titles <@ array['small_animals', 'surgery', 'reptiles', 'birds', 'horses']),
  -- Sprachen im Team (ISO 639-1)
  languages text[] not null default '{}' check (cardinality(languages) <= 20 and array_to_string(languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  -- Fachtitel vom Betreiber geprüft; jede Änderung der Titel setzt das zurück
  titles_verified boolean not null default false,
  package text not null default 'basis' check (package in ('basis', 'standard', 'premium')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Eine Person gehört zu genau einer Praxis.
create table public.practice_staff (
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('lead', 'vet', 'team')),
  created_at timestamptz not null default now()
);
create index practice_staff_practice_idx on public.practice_staff (practice_id);

create table public.practice_staff_invites (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 200),
  name text not null check (char_length(name) between 1 and 80),
  role text not null check (role in ('lead', 'vet', 'team')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
-- Pro E-Mail-Adresse höchstens eine offene Einladung (praxisübergreifend).
create unique index practice_staff_invites_open_email on public.practice_staff_invites (email)
  where accepted_at is null and revoked_at is null;
create index practice_staff_invites_practice_idx on public.practice_staff_invites (practice_id);

-- Nachvollziehbarkeit innerhalb der Praxis (wer hat wen eingeladen, Rolle geändert, entfernt).
create table public.practice_audit (
  id bigint generated always as identity primary key,
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  target_user uuid,
  detail text check (char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index practice_audit_practice_idx on public.practice_audit (practice_id, created_at desc);

-- Sprachen im Team auch im öffentlichen Angebot (Filter der Praxissuche)
alter table public.practice_profiles add column if not exists languages text[] not null default '{}';

alter table public.account_kinds enable row level security;
alter table public.practice_accounts enable row level security;
alter table public.practice_staff enable row level security;
alter table public.practice_staff_invites enable row level security;
alter table public.practice_audit enable row level security;

revoke all on public.account_kinds, public.practice_accounts, public.practice_staff, public.practice_staff_invites, public.practice_audit from anon;
revoke insert, update, delete, truncate on public.account_kinds, public.practice_accounts, public.practice_staff, public.practice_staff_invites, public.practice_audit from authenticated;
grant select on public.account_kinds, public.practice_accounts, public.practice_staff, public.practice_staff_invites, public.practice_audit to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function private.my_practice_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.practice_id from public.practice_staff s where s.user_id = (select auth.uid());
$$;

-- Rolle des angemeldeten Kontos in seiner Praxis, sonst null.
create or replace function private.my_practice_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.practice_staff s where s.user_id = (select auth.uid());
$$;

create or replace function private.is_practice_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_kinds k where k.user_id = (select auth.uid()) and k.kind = 'practice');
$$;

-- Leerer Text wird null, sonst getrimmt.
create or replace function private.clean(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(t), '');
$$;

-- JSON-Liste → sortiertes Text-Array ohne Doppelte
create or replace function private.text_set(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select distinct x from jsonb_array_elements_text(coalesce(j, '[]'::jsonb)) x order by x), '{}');
$$;

revoke all on function private.text_set(jsonb) from public, anon;
grant execute on function private.text_set(jsonb) to authenticated;
revoke all on function private.my_practice_id(), private.my_practice_role(), private.is_practice_account(), private.clean(text) from public, anon;
grant execute on function private.my_practice_id(), private.my_practice_role(), private.is_practice_account(), private.clean(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lese-Regeln
-- ---------------------------------------------------------------------------

create policy "eigene kontoart lesen" on public.account_kinds
  for select to authenticated using (user_id = (select auth.uid()));

create policy "eigene praxis lesen" on public.practice_accounts
  for select to authenticated using (id = (select private.my_practice_id()));

create policy "team der eigenen praxis lesen" on public.practice_staff
  for select to authenticated using (practice_id = (select private.my_practice_id()));

create policy "einladungen der eigenen praxis (leitung)" on public.practice_staff_invites
  for select to authenticated
  using (practice_id = (select private.my_practice_id()) and (select private.my_practice_role()) = 'lead');

create policy "protokoll der eigenen praxis (leitung)" on public.practice_audit
  for select to authenticated
  using (practice_id = (select private.my_practice_id()) and (select private.my_practice_role()) = 'lead');

-- ---------------------------------------------------------------------------
-- Neues Konto: Kontoart aus den Anmeldedaten übernehmen (nur „practice“ wird gespeichert)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    left(nullif(btrim(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    )), ''), 60),
    coalesce(new.raw_user_meta_data->>'language', 'de')
  );
  if new.raw_user_meta_data->>'account_type' = 'practice' then
    insert into public.account_kinds (user_id, kind) values (new.id, 'practice');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Für die App: Kontoart, Praxis und eigene Rolle in einem Aufruf
-- ---------------------------------------------------------------------------

create or replace function public.practice_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r record;
  inv jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select s.role, a.* into r
  from public.practice_staff s join public.practice_accounts a on a.id = s.practice_id
  where s.user_id = uid;
  if found then
    return jsonb_build_object(
      'kind', 'practice',
      'role', r.role,
      'practice', jsonb_build_object(
        'id', r.id, 'directory_id', r.directory_id, 'name', r.name, 'street', r.street, 'housenumber', r.housenumber,
        'postcode', r.postcode, 'city', r.city, 'country', r.country, 'phone', r.phone, 'email', r.email,
        'website', r.website, 'hours_text', r.hours_text, 'species', to_jsonb(r.species), 'services', to_jsonb(r.services),
        'titles', to_jsonb(r.titles), 'languages', to_jsonb(r.languages), 'titles_verified', r.titles_verified, 'package', r.package,
        'status', r.status, 'created_at', r.created_at, 'approved_at', r.approved_at));
  end if;
  -- Offene Einladung an die eigene Adresse (für die Seite „Einladung annehmen“)
  select jsonb_build_object('practice_name', a.name, 'role', i.role, 'expired', i.expires_at < now()) into inv
  from public.practice_staff_invites i
  join auth.users u on lower(u.email) = i.email
  join public.practice_accounts a on a.id = i.practice_id
  where u.id = uid and i.accepted_at is null and i.revoked_at is null;
  return jsonb_build_object(
    'kind', case when private.is_practice_account() then 'practice' else 'owner' end,
    'role', null, 'practice', null, 'invite', inv);
end;
$$;

-- ---------------------------------------------------------------------------
-- Praxisverzeichnis durchsuchen (nur noch nicht vergebene Einträge)
-- ---------------------------------------------------------------------------

create or replace function public.practice_directory_search(p_q text, p_country text default 'DE')
returns table(id uuid, name text, street text, housenumber text, postcode text, city text, phone text, website text, email text, opening_hours text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_q, ''));
  pat text;
begin
  if not private.is_practice_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(q) < 3 then
    return;
  end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.name, p.street, p.housenumber, p.postcode, p.city, p.phone, p.website, p.email, p.opening_hours
    from public.practices p
    where p.active
      and p.country = upper(coalesce(nullif(btrim(p_country), ''), 'DE'))
      and not exists (select 1 from public.practice_accounts a where a.directory_id = p.id)
      and (p.name ilike pat or p.postcode like q || '%' or p.city ilike pat or (coalesce(p.street, '') || ' ' || coalesce(p.housenumber, '')) ilike pat)
    order by (p.name ilike q || '%') desc, p.name
    limit 20;
end;
$$;

-- ---------------------------------------------------------------------------
-- Praxis anlegen (Schritt 2 der Registrierung) und Profil bearbeiten
-- ---------------------------------------------------------------------------

create or replace function private.check_practice_fields(p jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  f text;
begin
  if char_length(coalesce(btrim(p->>'name'), '')) < 2 or char_length(btrim(p->>'name')) > 120 then
    raise exception 'name_invalid' using errcode = '22023';
  end if;
  foreach f in array array['species', 'services', 'titles', 'languages'] loop
    if p ? f and jsonb_typeof(p->f) <> 'array' then
      raise exception 'offer_invalid' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p->'species', '[]')) x where x not in ('dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse'))
    or exists (select 1 from jsonb_array_elements_text(coalesce(p->'services', '[]')) x where x not in ('surgery', 'dentistry', 'imaging', 'ct_mri', 'blood_bank', 'hibernation', 'home_visits', 'emergency_24h', 'physio', 'equine_mobile'))
    or exists (select 1 from jsonb_array_elements_text(coalesce(p->'titles', '[]')) x where x not in ('small_animals', 'surgery', 'reptiles', 'birds', 'horses'))
    or exists (select 1 from jsonb_array_elements_text(coalesce(p->'languages', '[]')) x where x !~ '^[a-z]{2}$')
    or jsonb_array_length(coalesce(p->'languages', '[]')) > 20 then
    raise exception 'offer_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(p->>'email', '')) > 0 and btrim(p->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
end;
$$;

-- Liefert die neue Praxis-ID. p: name, street, housenumber, postcode, city, country, phone, email, website, hours_text, focus[]
create or replace function public.practice_register(p_directory_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
begin
  if not private.is_practice_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.practice_staff s where s.user_id = uid) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  perform private.check_practice_fields(p);
  if p_directory_id is not null then
    if not exists (select 1 from public.practices d where d.id = p_directory_id and d.active) then
      raise exception 'directory_not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.practice_accounts a where a.directory_id = p_directory_id) then
      raise exception 'directory_taken' using errcode = '23505';
    end if;
  end if;

  begin
  insert into public.practice_accounts (directory_id, name, street, housenumber, postcode, city, country, phone, email, website, hours_text, species, services, titles, languages, created_by)
  values (
    p_directory_id,
    btrim(p->>'name'),
    left(private.clean(p->>'street'), 120),
    left(private.clean(p->>'housenumber'), 20),
    left(private.clean(p->>'postcode'), 12),
    left(private.clean(p->>'city'), 80),
    upper(coalesce(private.clean(p->>'country'), 'DE')),
    left(private.clean(p->>'phone'), 40),
    left(lower(private.clean(p->>'email')), 200),
    left(private.clean(p->>'website'), 200),
    left(private.clean(p->>'hours_text'), 300),
    private.text_set(p->'species'),
    private.text_set(p->'services'),
    private.text_set(p->'titles'),
    private.text_set(p->'languages'),
    uid
  )
  returning id into new_id;
  exception
    when unique_violation then
      -- Zwei gleichzeitige Anfragen auf denselben Verzeichniseintrag
      raise exception 'directory_taken' using errcode = '23505';
  end;

  insert into public.practice_staff (practice_id, user_id, role) values (new_id, uid, 'lead');
  insert into public.practice_audit (practice_id, actor, action, target_user) values (new_id, uid, 'registered', uid);
  return new_id;
end;
$$;

-- Nur Praxisleitung. Bei freigeschalteter Praxis werden Name, Adresse und Kontakt in den Verzeichniseintrag übernommen.
create or replace function public.practice_update_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  a public.practice_accounts;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_practice_fields(p);
  update public.practice_accounts set
    name = btrim(p->>'name'),
    street = left(private.clean(p->>'street'), 120),
    housenumber = left(private.clean(p->>'housenumber'), 20),
    postcode = left(private.clean(p->>'postcode'), 12),
    city = left(private.clean(p->>'city'), 80),
    phone = left(private.clean(p->>'phone'), 40),
    email = left(lower(private.clean(p->>'email')), 200),
    website = left(private.clean(p->>'website'), 200),
    hours_text = left(private.clean(p->>'hours_text'), 300),
    species = private.text_set(p->'species'),
    services = private.text_set(p->'services'),
    titles = private.text_set(p->'titles'),
    languages = private.text_set(p->'languages'),
    -- geänderte Fachtitel müssen neu geprüft werden
    titles_verified = titles_verified and titles = private.text_set(p->'titles'),
    updated_at = now()
  where id = pid
  returning * into a;
  insert into public.practice_audit (practice_id, actor, action) values (pid, (select auth.uid()), 'profile_updated');
  if a.status = 'active' and a.directory_id is not null then
    perform private.sync_directory(a);
  end if;
end;
$$;

-- Angebot (Fragebogen) in das öffentliche Praxisprofil übernehmen, nach dem die Halter-Suche filtert.
create or replace function private.sync_offer(a public.practice_accounts, d uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.practice_profiles (practice_id, species, services, titles, focus, titles_verified, languages, updated_at)
  values (d, a.species, a.services, a.titles, '{}', a.titles_verified, a.languages, now())
  on conflict (practice_id) do update set
    species = excluded.species, services = excluded.services, titles = excluded.titles,
    titles_verified = excluded.titles_verified, languages = excluded.languages, updated_at = now();
$$;
revoke all on function private.sync_offer(public.practice_accounts, uuid) from public, anon, authenticated;

-- Verzeichniseintrag mit den Praxisangaben abgleichen (Name, Adresse, Kontakt) und als „bei PetConnect“ markieren.
-- Koordinaten bleiben; ein neuer Eintrag wird über die Postleitzahl verortet. Liefert die Verzeichnis-ID oder null.
create or replace function private.sync_directory(a public.practice_accounts)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d uuid := a.directory_id;
  g record;
begin
  if d is null then
    if a.postcode is null then
      return null;
    end if;
    select gp.lat, gp.lon into g from public.geocode_place(a.postcode, a.country) gp limit 1;
    if not found or g.lat is null then
      return null;
    end if;
    insert into public.practices (source, name, street, housenumber, postcode, city, country, lat, lon, phone, website, email, registered)
    values ('petconnect', a.name, a.street, a.housenumber, a.postcode, a.city, a.country, g.lat, g.lon, a.phone, a.website, a.email, true)
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
    city = coalesce(a.city, city),
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

revoke all on function private.sync_directory(public.practice_accounts), private.check_practice_fields(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Team
-- ---------------------------------------------------------------------------

-- Alle Mitglieder der eigenen Praxis (jede Rolle darf das Team sehen).
create or replace function public.practice_team()
returns table(user_id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
begin
  if pid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select s.user_id, u.email::text, p.display_name, s.role, s.created_at
    from public.practice_staff s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
    where s.practice_id = pid
    order by case s.role when 'lead' then 0 when 'vet' then 1 else 2 end, s.created_at;
end;
$$;

create or replace function private.lead_count(pid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.practice_staff s where s.practice_id = pid and s.role = 'lead';
$$;
revoke all on function private.lead_count(uuid) from public, anon, authenticated;

create or replace function public.practice_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  old_role text;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('lead', 'vet', 'team') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  select s.role into old_role from public.practice_staff s where s.user_id = p_user and s.practice_id = pid for update;
  if old_role is null then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if old_role = p_role then
    return;
  end if;
  -- Sperre auf die Praxis, damit zwei Leitungen sich nicht gleichzeitig herabstufen
  perform 1 from public.practice_accounts where id = pid for update;
  if old_role = 'lead' and private.lead_count(pid) <= 1 then
    raise exception 'last_lead' using errcode = '22023';
  end if;
  update public.practice_staff set role = p_role where user_id = p_user;
  insert into public.practice_audit (practice_id, actor, action, target_user, detail)
  values (pid, (select auth.uid()), 'role_changed', p_user, old_role || ' -> ' || p_role);
end;
$$;

create or replace function public.practice_remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  old_role text;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;
  perform 1 from public.practice_accounts where id = pid for update;
  select s.role into old_role from public.practice_staff s where s.user_id = p_user and s.practice_id = pid;
  if old_role is null then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if old_role = 'lead' and private.lead_count(pid) <= 1 then
    raise exception 'last_lead' using errcode = '22023';
  end if;
  delete from public.practice_staff where user_id = p_user and practice_id = pid;
  insert into public.practice_audit (practice_id, actor, action, target_user, detail)
  values (pid, (select auth.uid()), 'member_removed', p_user, old_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- Einladungen (Versand der Mail übernimmt die Edge Function „practice-invite“)
-- ---------------------------------------------------------------------------

-- Nur Praxisleitung. Prüft Adresse und Rolle und legt die Einladung an. Liefert die Angaben für den Mailversand.
create or replace function public.practice_create_invite(p_email text, p_name text, p_role text)
returns table(invite_id uuid, email text, name text, role text, practice_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  e text := lower(btrim(coalesce(p_email, '')));
  n text := btrim(coalesce(p_name, ''));
  new_id uuid;
  pname text;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('lead', 'vet', 'team') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 200 then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
  if char_length(n) < 1 or char_length(n) > 80 then
    raise exception 'name_invalid' using errcode = '22023';
  end if;
  -- Bereits registrierte Adressen (Halter- oder Praxiskonto) können nicht eingeladen werden.
  -- Ausnahme: ein früher eingeladenes, nie bestätigtes Konto (dessen Einladung widerrufen wurde).
  if exists (select 1 from auth.users u where lower(u.email) = e and (u.email_confirmed_at is not null or u.last_sign_in_at is not null)) then
    raise exception 'account_exists' using errcode = '23505';
  end if;
  if exists (select 1 from public.practice_staff_invites i where i.email = e and i.accepted_at is null and i.revoked_at is null) then
    raise exception 'invite_exists' using errcode = '23505';
  end if;
  insert into public.practice_staff_invites (practice_id, email, name, role, invited_by)
  values (pid, e, n, p_role, (select auth.uid()))
  returning id into new_id;
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, (select auth.uid()), 'invited', e || ' (' || p_role || ')');
  select a.name into pname from public.practice_accounts a where a.id = pid;
  return query select new_id, e, n, p_role, pname;
end;
$$;

-- Offene Einladung erneut senden: Ablaufdatum verlängern. Liefert die Angaben für den Mailversand.
create or replace function public.practice_resend_invite(p_id uuid)
returns table(invite_id uuid, email text, name text, role text, practice_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.practice_staff_invites i set expires_at = now() + interval '7 days'
  where i.id = p_id and i.practice_id = pid and i.accepted_at is null and i.revoked_at is null;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  insert into public.practice_audit (practice_id, actor, action, detail)
  select pid, (select auth.uid()), 'invite_resent', i.email from public.practice_staff_invites i where i.id = p_id;
  return query
    select i.id, i.email, i.name, i.role, a.name
    from public.practice_staff_invites i join public.practice_accounts a on a.id = i.practice_id
    where i.id = p_id;
end;
$$;

-- Einladung zurückziehen. Liefert die E-Mail-Adresse (die Edge Function räumt ein nie benutztes Konto auf).
create or replace function public.practice_revoke_invite(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  e text;
begin
  if pid is null or private.my_practice_role() <> 'lead' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.practice_staff_invites i set revoked_at = now()
  where i.id = p_id and i.practice_id = pid and i.accepted_at is null and i.revoked_at is null
  returning i.email into e;
  if e is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, (select auth.uid()), 'invite_revoked', e);
  return e;
end;
$$;

-- Nur für die Edge Function (Service-Rolle): Konto zu einer Adresse, das nie bestätigt oder benutzt wurde,
-- keiner Praxis angehört und keine offene Einladung mehr hat. Ein solches Konto darf gelöscht werden.
create or replace function public.practice_invite_orphan(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and u.email_confirmed_at is null and u.last_sign_in_at is null
    -- nur Konten, die über eine Praxis-Einladung entstanden sind (nie ein unbestätigtes Halter-Konto)
    and exists (select 1 from public.account_kinds k where k.user_id = u.id and k.kind = 'practice')
    and not exists (select 1 from public.practice_staff s where s.user_id = u.id)
    and not exists (select 1 from public.practice_staff_invites i where i.email = lower(btrim(p_email)) and i.accepted_at is null and i.revoked_at is null)
  limit 1;
$$;

-- Eingeladene Person nimmt an (nach dem Klick auf den Link und dem Setzen des Passworts).
create or replace function public.practice_accept_invite()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  e text;
  inv public.practice_staff_invites;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.practice_staff s where s.user_id = uid) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  select lower(u.email) into e from auth.users u where u.id = uid;
  select * into inv from public.practice_staff_invites i
  where i.email = e and i.accepted_at is null and i.revoked_at is null
  for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;
  insert into public.practice_staff (practice_id, user_id, role) values (inv.practice_id, uid, inv.role);
  update public.practice_staff_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into public.account_kinds (user_id, kind) values (uid, 'practice') on conflict (user_id) do nothing;
  insert into public.practice_audit (practice_id, actor, action, target_user, detail)
  values (inv.practice_id, uid, 'invite_accepted', uid, inv.role);
  return inv.practice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Betreiber: Praxen ansehen, freischalten, sperren
-- ---------------------------------------------------------------------------

create or replace function public.staff_practices(p_status text default null)
returns table(id uuid, name text, postcode text, city text, country text, phone text, email text, status text, package text,
              directory_id uuid, members integer, lead_email text, created_at timestamptz, approved_at timestamptz,
              titles text[], titles_verified boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('support') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.id, a.name, a.postcode, a.city, a.country, a.phone, a.email, a.status, a.package, a.directory_id,
      (select count(*)::integer from public.practice_staff s where s.practice_id = a.id),
      (select u.email::text from auth.users u where u.id = a.created_by),
      a.created_at, a.approved_at, a.titles, a.titles_verified
    from public.practice_accounts a
    where p_status is null or a.status = p_status
    order by (a.status = 'pending') desc, a.created_at desc
    limit 500;
end;
$$;

-- Nur Admin. new_status: 'active' (freischalten) oder 'suspended' (sperren). Grund ist Pflicht und wird protokolliert.
-- Liefert die Verzeichnis-ID (null, wenn die Praxis noch nicht im Verzeichnis steht).
create or replace function public.staff_set_practice_status(p_id uuid, new_status text, reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(coalesce(reason, ''));
  a public.practice_accounts;
  d uuid;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if char_length(clean_reason) < 1 or char_length(clean_reason) > 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.practice_accounts set
    status = new_status,
    approved_at = case when new_status = 'active' then coalesce(approved_at, now()) else approved_at end,
    approved_by = case when new_status = 'active' then coalesce(approved_by, (select auth.uid())) else approved_by end,
    updated_at = now()
  where id = p_id
  returning * into a;
  if not found then
    raise exception 'practice_not_found' using errcode = 'P0002';
  end if;

  if new_status = 'active' then
    d := private.sync_directory(a);
  else
    d := a.directory_id;
    if d is not null then
      update public.practices set registered = false, updated_at = now() where id = d;
    end if;
  end if;

  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), 'practice_' || new_status, a.created_by, a.name || ': ' || clean_reason);
  insert into public.practice_audit (practice_id, actor, action, detail) values (a.id, (select auth.uid()), 'status_' || new_status, clean_reason);
  return d;
end;
$$;

-- Nur Admin: Fachtitel einer Praxis als geprüft markieren (oder die Markierung entfernen). Wird protokolliert.
create or replace function public.staff_set_titles_verified(p_id uuid, verified boolean, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(coalesce(reason, ''));
  a public.practice_accounts;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_reason) < 1 or char_length(clean_reason) > 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.practice_accounts set titles_verified = coalesce(verified, false) and cardinality(titles) > 0, updated_at = now()
  where id = p_id
  returning * into a;
  if not found then
    raise exception 'practice_not_found' using errcode = 'P0002';
  end if;
  if a.status = 'active' and a.directory_id is not null then
    update public.practice_profiles set titles_verified = a.titles_verified, updated_at = now() where practice_id = a.directory_id;
  end if;
  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), case when a.titles_verified then 'practice_titles_verified' else 'practice_titles_unverified' end, a.created_by, a.name || ': ' || clean_reason);
  insert into public.practice_audit (practice_id, actor, action, detail)
  values (a.id, (select auth.uid()), case when a.titles_verified then 'titles_verified' else 'titles_unverified' end, clean_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on function public.practice_me() from public, anon;
revoke all on function public.practice_directory_search(text, text) from public, anon;
revoke all on function public.practice_register(uuid, jsonb) from public, anon;
revoke all on function public.practice_update_profile(jsonb) from public, anon;
revoke all on function public.practice_team() from public, anon;
revoke all on function public.practice_set_role(uuid, text) from public, anon;
revoke all on function public.practice_remove_member(uuid) from public, anon;
revoke all on function public.practice_create_invite(text, text, text) from public, anon;
revoke all on function public.practice_resend_invite(uuid) from public, anon;
revoke all on function public.practice_revoke_invite(uuid) from public, anon;
revoke all on function public.practice_accept_invite() from public, anon;
revoke all on function public.practice_invite_orphan(text) from public, anon, authenticated;
revoke all on function public.staff_practices(text) from public, anon;
revoke all on function public.staff_set_practice_status(uuid, text, text) from public, anon;
revoke all on function public.staff_set_titles_verified(uuid, boolean, text) from public, anon;

grant execute on function public.practice_me() to authenticated;
grant execute on function public.practice_directory_search(text, text) to authenticated;
grant execute on function public.practice_register(uuid, jsonb) to authenticated;
grant execute on function public.practice_update_profile(jsonb) to authenticated;
grant execute on function public.practice_team() to authenticated;
grant execute on function public.practice_set_role(uuid, text) to authenticated;
grant execute on function public.practice_remove_member(uuid) to authenticated;
grant execute on function public.practice_create_invite(text, text, text) to authenticated;
grant execute on function public.practice_resend_invite(uuid) to authenticated;
grant execute on function public.practice_revoke_invite(uuid) to authenticated;
grant execute on function public.practice_accept_invite() to authenticated;
grant execute on function public.practice_invite_orphan(text) to service_role;
grant execute on function public.staff_practices(text) to authenticated;
grant execute on function public.staff_set_practice_status(uuid, text, text) to authenticated;
grant execute on function public.staff_set_titles_verified(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Praxissuche (Halter): neuer Filter „Sprachen im Team“ und Sprachen in der Antwort.
-- Gleiche Logik wie bisher; neuer Parameter p_languages (Standard leer = kein Filter).
-- ---------------------------------------------------------------------------

drop function if exists public.count_practices_by_radius(double precision, double precision, text, text[], text[], text);
drop function if exists public.search_practices(double precision, double precision, integer, text, text[], text[], text, integer);

create function public.search_practices(p_lat double precision, p_lon double precision, p_radius_km integer default 10, p_species text default null::text, p_services text[] default '{}'::text[], p_titles text[] default '{}'::text[], p_q text default null::text, p_limit integer default 100, p_languages text[] default '{}'::text[])
 returns table(id uuid, name text, street text, housenumber text, postcode text, city text, lat double precision, lon double precision, distance_km double precision, phone text, website text, opening_hours text, registered boolean, has_profile boolean, species text[], services text[], titles text[], focus text[], titles_verified boolean, matches boolean, is_favorite boolean, country text, languages text[])
 language sql
 stable
 set search_path to ''
as $function$
  with box as (
    select greatest(1, least(coalesce(p_radius_km,10), 100))::double precision as r,
           p_lat as la, p_lon as lo,
           private.norm_query(p_q) as q
  ), c as (
    select p.*, pp.practice_id is not null as hp, pp.species sp, pp.services sv, pp.titles ti, pp.focus fo, coalesce(pp.titles_verified,false) tv, pp.languages lg,
           private.km(b.la, b.lo, p.lat, p.lon) as d, b.r
    from public.practices p
    cross join box b
    left join public.practice_profiles pp on pp.practice_id = p.id
    where p.active
      and p.lat between b.la - b.r / 111.0 and b.la + b.r / 111.0
      and p.lon between b.lo - b.r / (111.0 * cos(radians(b.la))) and b.lo + b.r / (111.0 * cos(radians(b.la)))
      and (b.q = '' or private.norm_text(p.name) like '%' || b.q || '%'
           or (char_length(b.q) >= 4 and extensions.word_similarity(b.q, private.norm_text(p.name)) >= 0.6))
  )
  select c.id, c.name, c.street, c.housenumber, c.postcode, c.city, c.lat, c.lon, round(c.d::numeric, 1)::double precision,
         c.phone, c.website, c.opening_hours, c.registered,
         c.hp, coalesce(c.sp,'{}'), coalesce(c.sv,'{}'), coalesce(c.ti,'{}'), coalesce(c.fo,'{}'), c.tv,
         (c.hp
           and (p_species is null or p_species = '' or p_species = any(c.sp))
           and coalesce(p_services,'{}') <@ coalesce(c.sv,'{}')
           and coalesce(p_titles,'{}') <@ coalesce(c.ti,'{}')
           -- Sprachen: mindestens eine der gewählten Sprachen wird gesprochen
           and (coalesce(cardinality(p_languages), 0) = 0 or coalesce(c.lg,'{}') && p_languages)) as matches,
         exists (select 1 from public.practice_favorites f where f.practice_id = c.id and f.user_id = (select auth.uid())),
         c.country::text,
         coalesce(c.lg,'{}')
  from c
  where c.d <= c.r
  order by c.d
  limit greatest(1, least(coalesce(p_limit,100), 300));
$function$;

create function public.count_practices_by_radius(p_lat double precision, p_lon double precision, p_species text default null::text, p_services text[] default '{}'::text[], p_titles text[] default '{}'::text[], p_q text default null::text, p_languages text[] default '{}'::text[])
 returns table(radius_km integer, total integer, with_profile integer, matches integer)
 language sql
 stable
 set search_path to ''
as $function$
  with r(k) as (values (5),(10),(25),(50)),
  s as (select * from public.search_practices(p_lat, p_lon, 50, p_species, p_services, p_titles, p_q, 300, p_languages))
  select r.k, count(s.id)::int, count(s.id) filter (where s.has_profile)::int, count(s.id) filter (where s.matches)::int
  from r left join s on s.distance_km <= r.k
  group by r.k order by r.k;
$function$;

revoke all on function public.search_practices(double precision, double precision, integer, text, text[], text[], text, integer, text[]) from public, anon;
revoke all on function public.count_practices_by_radius(double precision, double precision, text, text[], text[], text, text[]) from public, anon;
grant execute on function public.search_practices(double precision, double precision, integer, text, text[], text[], text, integer, text[]) to authenticated;
grant execute on function public.count_practices_by_radius(double precision, double precision, text, text[], text[], text, text[]) to authenticated;
