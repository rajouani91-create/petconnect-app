-- Etappe P2: Freigabe Tier → Praxis und Patientenliste.
-- Eine Praxis bekommt Zugriff auf ein Tier nur durch die Halter:in: Praxis-Code einlösen oder Zugriffsanfrage annehmen.
-- Die Halter:in kann jederzeit widerrufen. Nur freigeschaltete Praxen sehen Patient:innen; alle drei Rollen sehen die Liste.
-- In P2 liest die Praxis nur Stammdaten und die nächste fällige Impfung (die volle Akte folgt in P3).
-- Alles läuft über Funktionen; die Tabellen haben nur Lese-Regeln oder gar keine.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.pet_practice_access (
  pet_id uuid not null references public.pets (id) on delete cascade,
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  source text not null check (source in ('code', 'request')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (pet_id, practice_id)
);
create index pet_practice_access_practice_idx on public.pet_practice_access (practice_id);

-- Einmal-Code je Tier (14 Tage gültig). Die Halter:in zeigt ihn in der Praxis vor; nach dem Einlösen ist er verbraucht.
create table public.pet_practice_codes (
  pet_id uuid primary key references public.pets (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

-- Zugriffsanfrage einer Praxis an die E-Mail-Adresse einer Halter:in. owner_id ist null, wenn es dazu kein Konto gibt
-- (die Praxis erfährt das nicht).
create table public.practice_access_requests (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 200),
  owner_id uuid references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  pets_granted integer not null default 0,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  answered_at timestamptz
);
create unique index practice_access_requests_open on public.practice_access_requests (practice_id, email) where status = 'pending';
create index practice_access_requests_owner_idx on public.practice_access_requests (owner_id) where status = 'pending';

-- Fehlversuche beim Code-Einlösen (Schutz vor Durchprobieren)
create table public.practice_code_attempts (
  id bigint generated always as identity primary key,
  practice_id uuid not null references public.practice_accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index practice_code_attempts_idx on public.practice_code_attempts (practice_id, created_at desc);

alter table public.pet_practice_access enable row level security;
alter table public.pet_practice_codes enable row level security;
alter table public.practice_access_requests enable row level security;
alter table public.practice_code_attempts enable row level security;
revoke all on public.pet_practice_access, public.pet_practice_codes, public.practice_access_requests, public.practice_code_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Praxis des angemeldeten Kontos, nur wenn freigeschaltet; sonst Fehler (pending/suspended/keine Praxis)
create or replace function private.active_practice_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.my_practice_id();
  st text;
begin
  if pid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.status into st from public.practice_accounts a where a.id = pid;
  if st = 'pending' then
    raise exception 'practice_pending' using errcode = '42501';
  end if;
  if st <> 'active' then
    raise exception 'practice_suspended' using errcode = '42501';
  end if;
  return pid;
end;
$$;

create or replace function private.new_pet_code(pet_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  prefix text := left(regexp_replace(upper(translate(coalesce(pet_name, ''), 'ÄÖÜäöüßÀÁÂÉÈÊÍÓÔÚÇÑ', 'AOUAOUSAAAEEEIOOUCN')), '[^A-Z]', '', 'g') || 'PET', 3);
  s text := '';
  b bytea := extensions.gen_random_bytes(6);
  i int;
begin
  for i in 0..5 loop
    s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return prefix || '-' || substr(s, 1, 3) || '-' || substr(s, 4, 3);
end;
$$;

revoke all on function private.active_practice_id(), private.new_pet_code(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Halter:in
-- ---------------------------------------------------------------------------

-- Gültigen Praxis-Code des Tiers holen oder neu erzeugen (p_renew = true erzeugt immer einen neuen). Nur Haupthalter:in.
create or replace function public.pet_practice_code(p_pet uuid, p_renew boolean default false)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  n text;
  tries int := 0;
begin
  if not private.is_pet_owner(p_pet) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select k.code, k.expires_at into c from public.pet_practice_codes k where k.pet_id = p_pet;
  if found and not coalesce(p_renew, false) and c.expires_at > now() then
    return query select c.code, c.expires_at;
    return;
  end if;
  loop
    tries := tries + 1;
    n := private.new_pet_code((select p.name from public.pets p where p.id = p_pet));
    begin
      insert into public.pet_practice_codes (pet_id, code, created_by) values (p_pet, n, (select auth.uid()))
      on conflict (pet_id) do update set code = excluded.code, created_by = excluded.created_by, created_at = now(), expires_at = now() + interval '14 days';
      exit;
    exception when unique_violation then
      if tries > 5 then raise; end if;
    end;
  end loop;
  return query select k.code, k.expires_at from public.pet_practice_codes k where k.pet_id = p_pet;
end;
$$;

-- Praxen mit Zugriff auf meine Tiere (nur eigene Tiere als Haupthalter:in)
create or replace function public.owner_practice_access()
returns table(pet_id uuid, pet_name text, practice_id uuid, practice_name text, city text, source text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select x.pet_id, p.name, x.practice_id, a.name, a.city, x.source, x.created_at
  from public.pet_practice_access x
  join public.pets p on p.id = x.pet_id
  join public.practice_accounts a on a.id = x.practice_id
  where p.owner_id = (select auth.uid())
  order by p.name, a.name;
$$;

create or replace function public.owner_revoke_practice(p_pet uuid, p_practice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_pet_owner(p_pet) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.pet_practice_access where pet_id = p_pet and practice_id = p_practice;
  if not found then
    raise exception 'access_not_found' using errcode = 'P0002';
  end if;
  insert into public.practice_audit (practice_id, actor, action, detail) values (p_practice, (select auth.uid()), 'access_revoked', p_pet::text);
end;
$$;

-- Offene Anfragen von Praxen an mich
create or replace function public.owner_access_requests()
returns table(id uuid, practice_name text, city text, note text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, a.name, a.city, r.note, r.created_at
  from public.practice_access_requests r
  join public.practice_accounts a on a.id = r.practice_id
  where r.owner_id = (select auth.uid()) and r.status = 'pending' and r.expires_at > now() and a.status = 'active'
  order by r.created_at desc;
$$;

-- Anfrage beantworten: annehmen mit gewählten Tieren (nur eigene) oder ablehnen
create or replace function public.owner_answer_request(p_id uuid, p_accept boolean, p_pets uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.practice_access_requests;
  n integer := 0;
begin
  select * into r from public.practice_access_requests x
  where x.id = p_id and x.owner_id = uid and x.status = 'pending' and x.expires_at > now()
  for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if coalesce(p_accept, false) then
    if coalesce(cardinality(p_pets), 0) = 0 then
      raise exception 'no_pets' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_pets) q where not exists (select 1 from public.pets p where p.id = q and p.owner_id = uid)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    insert into public.pet_practice_access (pet_id, practice_id, source, granted_by)
    select distinct q, r.practice_id, 'request', uid from unnest(p_pets) q
    on conflict (pet_id, practice_id) do nothing;
    get diagnostics n = row_count;
  end if;
  update public.practice_access_requests set
    status = case when coalesce(p_accept, false) then 'accepted' else 'declined' end,
    pets_granted = n, answered_at = now()
  where id = p_id;
  insert into public.practice_audit (practice_id, actor, action, detail)
  values (r.practice_id, uid, case when coalesce(p_accept, false) then 'request_accepted' else 'request_declined' end, n::text);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Praxis
-- ---------------------------------------------------------------------------

-- Praxis-Code einlösen (alle Rollen). Höchstens 10 Fehlversuche pro Stunde und Praxis. Der Code ist danach verbraucht.
-- Liefert die Tier-ID oder null (Code unbekannt oder abgelaufen).
create or replace function public.practice_redeem_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  c text := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s', '', 'g'));
  k public.pet_practice_codes;
begin
  if (select count(*) from public.practice_code_attempts t where t.practice_id = pid and t.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;
  -- Bindestriche dürfen fehlen
  if c ~ '^[A-Z]{3}[2-9A-HJ-NP-Z]{6}$' then
    c := substr(c, 1, 3) || '-' || substr(c, 4, 3) || '-' || substr(c, 7, 3);
  end if;
  select * into k from public.pet_practice_codes x where x.code = c and x.expires_at > now() for update;
  if not found then
    -- Fehlversuch zählen. Kein Fehler werfen, sonst würde der Eintrag mit zurückgerollt: null = Code unbekannt.
    insert into public.practice_code_attempts (practice_id) values (pid);
    return null;
  end if;
  insert into public.pet_practice_access (pet_id, practice_id, source, granted_by)
  values (k.pet_id, pid, 'code', k.created_by)
  on conflict (pet_id, practice_id) do nothing;
  delete from public.pet_practice_codes where pet_id = k.pet_id;
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, (select auth.uid()), 'code_redeemed', k.pet_id::text);
  return k.pet_id;
end;
$$;

-- Zugriff bei einer Halter:in anfragen (alle Rollen). Antwortet immer gleich, ob es ein Konto gibt oder nicht.
create or replace function public.practice_request_access(p_email text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  e text := lower(btrim(coalesce(p_email, '')));
  n text := nullif(btrim(coalesce(p_note, '')), '');
  owner uuid;
begin
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 200 then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
  if char_length(n) > 200 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if (select count(*) from public.practice_access_requests r where r.practice_id = pid and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  -- abgelaufene offene Anfrage derselben Adresse schließen, damit eine neue möglich ist
  update public.practice_access_requests set status = 'declined', answered_at = now()
  where practice_id = pid and email = e and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.practice_access_requests r where r.practice_id = pid and r.email = e and r.status = 'pending') then
    raise exception 'request_exists' using errcode = '23505';
  end if;
  -- nur Halter-Konten (keine Praxis-Konten)
  select u.id into owner from auth.users u
  where lower(u.email) = e and u.email_confirmed_at is not null
    and not exists (select 1 from public.account_kinds k where k.user_id = u.id and k.kind = 'practice')
  limit 1;
  insert into public.practice_access_requests (practice_id, email, owner_id, note, requested_by)
  values (pid, e, owner, n, (select auth.uid()));
  insert into public.practice_audit (practice_id, actor, action, detail) values (pid, (select auth.uid()), 'access_requested', e);
end;
$$;

-- Anfragen der eigenen Praxis (ohne Hinweis, ob es ein Konto gibt). Nur freigeschaltete Praxis.
create or replace function public.practice_requests()
returns table(id uuid, email text, note text, status text, pets_granted integer, created_at timestamptz, expires_at timestamptz, answered_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select r.id, r.email, r.note, r.status, r.pets_granted, r.created_at, r.expires_at, r.answered_at
    from public.practice_access_requests r
    where r.practice_id = pid
    order by r.created_at desc
    limit 100;
end;
$$;

-- Patientenliste (alle Rollen, nur freigeschaltete Praxis)
create or replace function public.practice_patients()
returns table(pet_id uuid, name text, species text, species_other text, breed text, sex text, birth_date date, deceased boolean,
              owner_name text, next_vacc_name text, next_vacc_due date, source text, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select p.id, p.name, p.species, p.species_other, p.breed, p.sex, p.birth_date, p.deceased,
           pr.display_name,
           v.name, v.valid_until,
           x.source, x.created_at
    from public.pet_practice_access x
    join public.pets p on p.id = x.pet_id
    left join public.profiles pr on pr.id = p.owner_id
    left join lateral (
      select vv.name, vv.valid_until from public.vaccinations vv
      where vv.pet_id = p.id and vv.valid_until is not null
        -- je Impfstoff nur der neueste Eintrag zählt
        and not exists (select 1 from public.vaccinations w where w.pet_id = p.id and lower(w.name) = lower(vv.name) and w.given_on > vv.given_on)
      order by vv.valid_until
      limit 1
    ) v on true
    where x.practice_id = pid
    order by p.deceased, lower(p.name);
end;
$$;

-- Stammdaten eines Patienten (nur mit Zugriff). In P2 ohne Befunde, Medikation und Dokumente.
create or replace function public.practice_patient(p_pet uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  res jsonb;
begin
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'species', p.species, 'species_other', p.species_other, 'breed', p.breed, 'sex', p.sex,
    'birth_date', p.birth_date, 'chip_no', p.chip_no, 'allergies', p.allergies, 'deceased', p.deceased,
    'owner_name', pr.display_name, 'owner_phone', p.owner_phone,
    'weight', (select jsonb_build_object('kg', w.kg, 'measured_on', w.measured_on) from public.weights w where w.pet_id = p.id order by w.measured_on desc, w.created_at desc limit 1),
    'source', x.source, 'granted_at', x.created_at)
  into res
  from public.pet_practice_access x
  join public.pets p on p.id = x.pet_id
  left join public.profiles pr on pr.id = p.owner_id
  where x.practice_id = pid and x.pet_id = p_pet;
  if res is null then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on function public.pet_practice_code(uuid, boolean) from public, anon;
revoke all on function public.owner_practice_access() from public, anon;
revoke all on function public.owner_revoke_practice(uuid, uuid) from public, anon;
revoke all on function public.owner_access_requests() from public, anon;
revoke all on function public.owner_answer_request(uuid, boolean, uuid[]) from public, anon;
revoke all on function public.practice_redeem_code(text) from public, anon;
revoke all on function public.practice_request_access(text, text) from public, anon;
revoke all on function public.practice_requests() from public, anon;
revoke all on function public.practice_patients() from public, anon;
revoke all on function public.practice_patient(uuid) from public, anon;

grant execute on function public.pet_practice_code(uuid, boolean) to authenticated;
grant execute on function public.owner_practice_access() to authenticated;
grant execute on function public.owner_revoke_practice(uuid, uuid) to authenticated;
grant execute on function public.owner_access_requests() to authenticated;
grant execute on function public.owner_answer_request(uuid, boolean, uuid[]) to authenticated;
grant execute on function public.practice_redeem_code(text) to authenticated;
grant execute on function public.practice_request_access(text, text) to authenticated;
grant execute on function public.practice_requests() to authenticated;
grant execute on function public.practice_patients() to authenticated;
grant execute on function public.practice_patient(uuid) to authenticated;
