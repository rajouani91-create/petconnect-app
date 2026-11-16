-- Etappe P7a: Abrechnung. Leistungskatalog mit Versionen, Rechnungsentwürfe, Freigabe mit fortlaufender Nummer,
-- Zahlungseingang, Stornorechnung, Rechnungsdaten der Praxis, Rechnungsanschrift der Halter:in, Rechnungen im Portal.
-- Grundsätze: Nach der Freigabe ist eine Rechnung unveränderlich (Positionen, Preise, Katalogversion und Rechnungssteller
-- werden festgeschrieben). Korrektur nur über eine Stornorechnung mit eigener Nummer. „Bezahlt“ nur durch einen
-- erfassten Zahlungseingang. Rechnungen bleiben erhalten, auch wenn Tier oder Konto gelöscht werden.

-- ---------- Tabellen ----------

create table public.practice_billing_settings (
  practice_id uuid primary key references public.practice_accounts(id) on delete cascade,
  legal_name text check (char_length(legal_name) <= 120),
  tax_id text check (char_length(tax_id) <= 30),          -- USt-IdNr.
  tax_number text check (char_length(tax_number) <= 30),  -- Steuernummer
  iban text check (char_length(iban) <= 34),
  bic text check (char_length(bic) <= 11),
  bank text check (char_length(bank) <= 80),
  payment_days smallint not null default 14 check (payment_days between 0 and 90),
  small_business boolean not null default false,          -- Kleinunternehmer (§ 19 UStG): keine Umsatzsteuer
  allow_free boolean not null default true,               -- freie Positionen außerhalb des Katalogs
  footer text check (char_length(footer) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.practice_billing_settings enable row level security;
revoke all on public.practice_billing_settings from anon, authenticated;

create table public.practice_catalogs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  version text not null,
  name text not null check (char_length(name) between 1 and 120),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  valid_from date not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_name text,
  unique (practice_id, version)
);
create unique index practice_catalogs_active_idx on public.practice_catalogs (practice_id) where active;
alter table public.practice_catalogs enable row level security;
revoke all on public.practice_catalogs from anon, authenticated;

create table public.practice_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.practice_catalogs(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 200),
  price numeric(10, 2) not null check (price between 0 and 100000),
  factor numeric(4, 2) not null default 1,
  factor_min numeric(4, 2) not null default 1,
  factor_max numeric(4, 2) not null default 1,
  tax_rate numeric(5, 2) not null default 19 check (tax_rate between 0 and 30),
  valid_from date,
  valid_to date,
  sort integer not null default 0,
  unique (catalog_id, code),
  check (factor_min > 0 and factor_min <= factor and factor <= factor_max and factor_max <= 10),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
alter table public.practice_catalog_items enable row level security;
revoke all on public.practice_catalog_items from anon, authenticated;

-- Rechnungsanschrift der Halter:in (nur über Funktionen; die Praxis liest sie beim Erstellen eines Entwurfs)
create table public.owner_billing_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  street text not null check (char_length(street) between 1 and 120),
  postcode text not null check (char_length(postcode) between 1 and 12),
  city text not null check (char_length(city) between 1 and 80),
  country text not null default 'DE' check (country ~ '^[A-Z]{2}$'),
  updated_at timestamptz not null default now()
);
alter table public.owner_billing_addresses enable row level security;
revoke all on public.owner_billing_addresses from anon, authenticated;

create table public.practice_invoice_counters (
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  year integer not null,
  last integer not null default 0,
  primary key (practice_id, year)
);
alter table public.practice_invoice_counters enable row level security;
revoke all on public.practice_invoice_counters from anon, authenticated;

create table public.practice_invoices (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  kind text not null default 'invoice' check (kind in ('invoice', 'cancellation')),
  -- invoice: draft → open → paid; open/paid → cancelled (über Stornorechnung). cancellation: immer final
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'cancelled', 'final')),
  number text,
  pet_id uuid references public.pets(id) on delete set null,
  pet_label text not null,
  owner_id uuid references auth.users(id) on delete set null,
  recipient_name text check (char_length(recipient_name) <= 120),
  recipient_address text check (char_length(recipient_address) <= 300),
  treatment_date date not null,
  invoice_date date,
  due_date date,
  catalog_id uuid references public.practice_catalogs(id) on delete set null,
  catalog_version text,
  catalog_name text,
  currency text not null default 'EUR',
  note text check (char_length(note) <= 500),
  net numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  gross numeric(12, 2) not null default 0,
  taxes jsonb not null default '[]'::jsonb,
  small_business boolean not null default false,
  issuer jsonb,
  cancels_id uuid references public.practice_invoices(id) on delete set null,
  cancelled_by_id uuid references public.practice_invoices(id) on delete set null,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  paid_on date,
  pay_method text check (pay_method in ('transfer', 'cash', 'card')),
  paid_by_name text,
  finalized_at timestamptz,
  finalized_by_name text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, number)
);
create index practice_invoices_practice_idx on public.practice_invoices (practice_id, status, created_at desc);
create index practice_invoices_owner_idx on public.practice_invoices (owner_id) where status <> 'draft';
create index practice_invoices_pet_idx on public.practice_invoices (pet_id);
create index practice_invoices_final_idx on public.practice_invoices (finalized_at);
alter table public.practice_invoices enable row level security;
revoke all on public.practice_invoices from anon, authenticated;

create table public.practice_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.practice_invoices(id) on delete cascade,
  pos integer not null,
  catalog_item_id uuid references public.practice_catalog_items(id) on delete set null,
  code text,
  name text not null check (char_length(name) between 1 and 120),
  qty numeric(8, 2) not null check (qty <> 0 and abs(qty) <= 9999),
  factor numeric(4, 2) not null default 1 check (factor > 0 and factor <= 10),
  factor_min numeric(4, 2) not null default 1,
  factor_max numeric(4, 2) not null default 1,
  unit_price numeric(10, 2) not null check (unit_price between 0 and 100000),
  tax_rate numeric(5, 2) not null check (tax_rate between 0 and 30),
  net numeric(12, 2) not null,
  free boolean not null default false
);
create index practice_invoice_items_invoice_idx on public.practice_invoice_items (invoice_id, pos);
alter table public.practice_invoice_items enable row level security;
revoke all on public.practice_invoice_items from anon, authenticated;

-- Festgeschriebene Rechnungen: Positionen und Beträge sind nach der Freigabe unveränderlich (auch für Funktionen)
create or replace function private.invoice_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'practice_invoice_items' then
    if exists (select 1 from public.practice_invoices i where i.id = coalesce(new.invoice_id, old.invoice_id) and i.status <> 'draft') then
      raise exception 'invoice_final' using errcode = '55000';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'invoice_final' using errcode = '55000'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.number is distinct from old.number or new.net is distinct from old.net or new.tax is distinct from old.tax
       or new.gross is distinct from old.gross or new.taxes is distinct from old.taxes or new.issuer is distinct from old.issuer
       or new.recipient_name is distinct from old.recipient_name or new.recipient_address is distinct from old.recipient_address
       or new.invoice_date is distinct from old.invoice_date or new.due_date is distinct from old.due_date
       or new.treatment_date is distinct from old.treatment_date or new.catalog_version is distinct from old.catalog_version
       or new.note is distinct from old.note or new.kind is distinct from old.kind or new.pet_label is distinct from old.pet_label) then
    raise exception 'invoice_final' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger practice_invoices_guard before update or delete on public.practice_invoices
  for each row execute function private.invoice_guard();
create trigger practice_invoice_items_guard before insert or update or delete on public.practice_invoice_items
  for each row execute function private.invoice_guard();

-- ---------- Hilfsfunktionen ----------

create or replace function private.berlin_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create or replace function private.ensure_billing(pid uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.practice_billing_settings (practice_id, legal_name)
  select pid, a.name from public.practice_accounts a where a.id = pid
  on conflict (practice_id) do nothing;
$$;

-- Summen eines Entwurfs neu berechnen (Steuer je Satz auf die Summe der Netto-Positionen, kaufmännisch gerundet)
create or replace function private.invoice_recalc(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sb boolean;
  t jsonb;
  n numeric;
  x numeric;
begin
  select coalesce(s.small_business, false) into sb
  from public.practice_invoices i left join public.practice_billing_settings s on s.practice_id = i.practice_id where i.id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('rate', r.rate, 'net', r.net, 'tax', r.tax) order by r.rate desc), '[]'::jsonb),
         coalesce(sum(r.net), 0), coalesce(sum(r.tax), 0)
    into t, n, x
  from (select it.tax_rate as rate, sum(it.net) as net, case when sb then 0 else round(sum(it.net) * it.tax_rate / 100, 2) end as tax
        from public.practice_invoice_items it where it.invoice_id = p_id group by it.tax_rate) r;
  update public.practice_invoices set net = n, tax = x, gross = n + x, taxes = t, small_business = sb, updated_at = now() where id = p_id;
end;
$$;

revoke all on function private.invoice_guard(), private.ensure_billing(uuid), private.invoice_recalc(uuid) from public, anon, authenticated;

-- ---------- Praxis: Rechnungsdaten und Katalog ----------

create or replace function public.practice_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  s public.practice_billing_settings%rowtype;
  c public.practice_catalogs%rowtype;
  pa public.practice_accounts%rowtype;
begin
  select * into pa from public.practice_accounts a where a.id = pid;
  select * into s from public.practice_billing_settings x where x.practice_id = pid;
  select * into c from public.practice_catalogs x where x.practice_id = pid and x.active;
  return jsonb_build_object(
    'can_edit', private.my_practice_role() = 'lead',
    'practice', jsonb_build_object('name', pa.name, 'street', pa.street, 'housenumber', pa.housenumber, 'postcode', pa.postcode, 'city', pa.city,
                                   'phone', pa.phone, 'email', pa.email),
    'settings', jsonb_build_object(
      'legal_name', coalesce(s.legal_name, pa.name), 'tax_id', s.tax_id, 'tax_number', s.tax_number, 'iban', s.iban, 'bic', s.bic, 'bank', s.bank,
      'payment_days', coalesce(s.payment_days, 14), 'small_business', coalesce(s.small_business, false),
      'allow_free', coalesce(s.allow_free, true), 'footer', s.footer),
    'catalog', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'version', c.version, 'name', c.name, 'currency', c.currency, 'valid_from', c.valid_from,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'code', i.code, 'name', i.name, 'description', i.description, 'price', i.price, 'factor', i.factor,
          'factor_min', i.factor_min, 'factor_max', i.factor_max, 'tax_rate', i.tax_rate, 'valid_from', i.valid_from, 'valid_to', i.valid_to)
          order by i.sort, i.code) from public.practice_catalog_items i where i.catalog_id = c.id), '[]'::jsonb)) end,
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'version', v.version, 'name', v.name, 'valid_from', v.valid_from, 'active', v.active, 'created_at', v.created_at,
        'created_by_name', v.created_by_name,
        'items', (select count(*) from public.practice_catalog_items i where i.catalog_id = v.id),
        'used', (select count(*) from public.practice_invoices iv where iv.catalog_id = v.id and iv.status <> 'draft'))
        order by v.created_at desc) from public.practice_catalogs v where v.practice_id = pid), '[]'::jsonb));
end;
$$;

-- p: legal_name, tax_id, tax_number, iban, bic, bank, payment_days, small_business, allow_free, footer
create or replace function public.practice_save_billing_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  v_iban text := upper(regexp_replace(coalesce(d->>'iban', ''), '\s', '', 'g'));
  days integer;
begin
  if coalesce(d->>'payment_days', '14') !~ '^\d{1,2}$' then raise exception 'days_invalid' using errcode = '22023'; end if;
  days := (coalesce(d->>'payment_days', '14'))::integer;
  if days > 90 then raise exception 'days_invalid' using errcode = '22023'; end if;
  if v_iban <> '' and v_iban !~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$' then raise exception 'iban_invalid' using errcode = '22023'; end if;
  perform private.ensure_billing(pid);
  update public.practice_billing_settings set
    legal_name = nullif(left(btrim(coalesce(d->>'legal_name', '')), 120), ''),
    tax_id = nullif(upper(regexp_replace(left(coalesce(d->>'tax_id', ''), 30), '\s', '', 'g')), ''),
    tax_number = nullif(left(btrim(coalesce(d->>'tax_number', '')), 30), ''),
    iban = nullif(v_iban, ''),
    bic = nullif(upper(left(btrim(coalesce(d->>'bic', '')), 11)), ''),
    bank = nullif(left(btrim(coalesce(d->>'bank', '')), 80), ''),
    payment_days = days,
    small_business = coalesce((d->>'small_business')::boolean, false),
    allow_free = coalesce((d->>'allow_free')::boolean, true),
    footer = nullif(left(btrim(coalesce(d->>'footer', '')), 300), ''),
    updated_at = now()
  where practice_id = pid;
end;
$$;

-- Neue Katalogversion veröffentlichen. p: name, mode ('replace' | 'merge'), items [{code, name, description, price, factor,
-- factor_min, factor_max, tax_rate, valid_from, valid_to, remove}]. merge: Änderungen auf die aktive Version (nach Nummer);
-- replace: Liste ersetzt den Katalog (Import, Beispielkatalog). Frühere Versionen und Rechnungen bleiben unverändert.
-- Ergebnis: neue Versionsbezeichnung (vJJJJ.n)
create or replace function public.practice_catalog_publish(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.lead_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  mode text := coalesce(d->>'mode', 'merge');
  old public.practice_catalogs%rowtype;
  yr integer := extract(year from private.berlin_today())::integer;
  ver text;
  new_id uuid;
  it jsonb;
  v_code text;
  n integer := 0;
begin
  if mode not in ('merge', 'replace') then raise exception 'status_invalid' using errcode = '22023'; end if;
  if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') = 0 or jsonb_array_length(d->'items') > 2000 then
    raise exception 'catalog_empty' using errcode = '22023';
  end if;
  select * into old from public.practice_catalogs c where c.practice_id = pid and c.active for update;
  perform pg_advisory_xact_lock(hashtextextended('catalog' || pid::text, 0));
  ver := 'v' || yr || '.' || (coalesce((select max(substring(c.version from '^v\d{4}\.(\d+)$')::integer)
                                        from public.practice_catalogs c where c.practice_id = pid and c.version like 'v' || yr || '.%'), 0) + 1);
  update public.practice_catalogs set active = false where practice_id = pid and active;
  insert into public.practice_catalogs (practice_id, version, name, currency, valid_from, active, created_by_name)
  values (pid, ver,
          coalesce(nullif(left(btrim(coalesce(d->>'name', '')), 120), ''), old.name, 'Leistungskatalog'),
          coalesce(nullif(upper(d->>'currency'), ''), old.currency, 'EUR'),
          private.berlin_today(), true, private.staff_name(pid))
  returning id into new_id;
  if mode = 'merge' and old.id is not null then
    insert into public.practice_catalog_items (catalog_id, code, name, description, price, factor, factor_min, factor_max, tax_rate, valid_from, valid_to, sort)
    select new_id, i.code, i.name, i.description, i.price, i.factor, i.factor_min, i.factor_max, i.tax_rate, i.valid_from, i.valid_to, i.sort
    from public.practice_catalog_items i where i.catalog_id = old.id;
  end if;
  for it in select * from jsonb_array_elements(d->'items') loop
    v_code := upper(btrim(coalesce(it->>'code', '')));
    if v_code = '' then
      -- eigene Nummer für übernommene freie Positionen: E01, E02 …
      v_code := 'E' || lpad((coalesce((select max(substring(i.code from '^E(\d+)$')::integer) from public.practice_catalog_items i where i.catalog_id = new_id), 0) + 1)::text, 2, '0');
    end if;
    if coalesce((it->>'remove')::boolean, false) then
      delete from public.practice_catalog_items i where i.catalog_id = new_id and i.code = v_code;
      continue;
    end if;
    begin
      insert into public.practice_catalog_items (catalog_id, code, name, description, price, factor, factor_min, factor_max, tax_rate, valid_from, valid_to, sort)
      values (new_id, left(v_code, 20), left(btrim(it->>'name'), 120), nullif(left(btrim(coalesce(it->>'description', '')), 200), ''),
              round((it->>'price')::numeric, 2),
              coalesce((it->>'factor')::numeric, 1), coalesce((it->>'factor_min')::numeric, 1), coalesce((it->>'factor_max')::numeric, coalesce((it->>'factor')::numeric, 1)),
              coalesce((it->>'tax_rate')::numeric, 19), nullif(it->>'valid_from', '')::date, nullif(it->>'valid_to', '')::date, n)
      on conflict (catalog_id, code) do update set
        name = excluded.name, description = excluded.description, price = excluded.price, factor = excluded.factor,
        factor_min = excluded.factor_min, factor_max = excluded.factor_max, tax_rate = excluded.tax_rate,
        valid_from = excluded.valid_from, valid_to = excluded.valid_to;
    exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
      raise exception 'catalog_row_invalid: %', v_code using errcode = '22023';
    end;
    n := n + 1;
  end loop;
  if not exists (select 1 from public.practice_catalog_items i where i.catalog_id = new_id) then
    raise exception 'catalog_empty' using errcode = '22023';
  end if;
  return ver;
end;
$$;

-- ---------- Praxis: Rechnungen ----------

create or replace function public.practice_invoices()
returns table (id uuid, kind text, status text, number text, pet_id uuid, pet_label text, recipient_name text, treatment_date date,
               invoice_date date, due_date date, paid_on date, pay_method text, gross numeric, currency text, first_item text,
               item_count integer, cancels_number text, cancelled_by_number text, has_owner boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return query
    select i.id, i.kind, i.status, i.number, i.pet_id, i.pet_label, i.recipient_name, i.treatment_date, i.invoice_date, i.due_date,
           i.paid_on, i.pay_method, i.gross, i.currency,
           (select it.name from public.practice_invoice_items it where it.invoice_id = i.id order by it.pos limit 1),
           (select count(*)::integer from public.practice_invoice_items it where it.invoice_id = i.id),
           (select c.number from public.practice_invoices c where c.id = i.cancels_id),
           (select c.number from public.practice_invoices c where c.id = i.cancelled_by_id),
           i.owner_id is not null, i.created_at
    from public.practice_invoices i
    where i.practice_id = pid
    order by (i.status = 'draft') desc, coalesce(i.invoice_date, i.treatment_date) desc, i.created_at desc
    limit 1000;
end;
$$;

create or replace function private.invoice_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'kind', i.kind, 'status', i.status, 'number', i.number, 'pet_id', i.pet_id, 'pet_label', i.pet_label,
    'has_owner', i.owner_id is not null, 'recipient_name', i.recipient_name, 'recipient_address', i.recipient_address,
    'treatment_date', i.treatment_date, 'invoice_date', i.invoice_date, 'due_date', i.due_date,
    'catalog_version', i.catalog_version, 'catalog_name', i.catalog_name, 'currency', i.currency, 'note', i.note,
    'net', i.net, 'tax', i.tax, 'gross', i.gross, 'taxes', i.taxes, 'small_business', i.small_business,
    'issuer', coalesce(i.issuer, jsonb_build_object(
        'name', coalesce(s.legal_name, pa.name), 'street', concat_ws(' ', pa.street, pa.housenumber), 'postcode', pa.postcode, 'city', pa.city,
        'phone', pa.phone, 'email', pa.email, 'tax_id', s.tax_id, 'tax_number', s.tax_number, 'iban', s.iban, 'bic', s.bic, 'bank', s.bank,
        'footer', s.footer)),
    'cancels_number', (select c.number from public.practice_invoices c where c.id = i.cancels_id),
    'cancelled_by_number', (select c.number from public.practice_invoices c where c.id = i.cancelled_by_id),
    'cancel_reason', i.cancel_reason,
    'paid_on', i.paid_on, 'pay_method', i.pay_method, 'paid_by_name', i.paid_by_name,
    'finalized_at', i.finalized_at, 'finalized_by_name', i.finalized_by_name, 'created_by_name', i.created_by_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', it.id, 'pos', it.pos, 'catalog_item_id', it.catalog_item_id, 'code', it.code, 'name', it.name, 'qty', it.qty,
        'factor', it.factor, 'factor_min', it.factor_min, 'factor_max', it.factor_max, 'unit_price', it.unit_price,
        'tax_rate', it.tax_rate, 'net', it.net, 'free', it.free) order by it.pos)
      from public.practice_invoice_items it where it.invoice_id = i.id), '[]'::jsonb))
  from public.practice_invoices i
  join public.practice_accounts pa on pa.id = i.practice_id
  left join public.practice_billing_settings s on s.practice_id = i.practice_id
  where i.id = p_id;
$$;
revoke all on function private.invoice_json(uuid) from public, anon, authenticated;

create or replace function public.practice_invoice(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  if not exists (select 1 from public.practice_invoices i where i.id = p_id and i.practice_id = pid) then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  return private.invoice_json(p_id);
end;
$$;

-- Entwurf aus Katalogleistungen. p: pet_id, treatment_date, item_ids[]
create or replace function public.practice_invoice_create(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  pet public.pets%rowtype;
  c public.practice_catalogs%rowtype;
  td date;
  a public.owner_billing_addresses%rowtype;
  new_id uuid;
  n integer;
begin
  if coalesce(d->>'pet_id', '') !~ '^[0-9a-f-]{36}$' then raise exception 'patient_not_found' using errcode = 'P0002'; end if;
  select * into pet from public.pets x where x.id = (d->>'pet_id')::uuid;
  if not found or not exists (select 1 from public.pet_practice_access x where x.pet_id = pet.id and x.practice_id = pid) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  begin td := coalesce(nullif(d->>'treatment_date', '')::date, private.berlin_today());
  exception when others then raise exception 'date_invalid' using errcode = '22023'; end;
  if td > private.berlin_today() or td < private.berlin_today() - 730 then raise exception 'date_invalid' using errcode = '22023'; end if;
  select * into c from public.practice_catalogs x where x.practice_id = pid and x.active;
  if not found then raise exception 'catalog_missing' using errcode = 'P0002'; end if;
  if jsonb_typeof(d->'item_ids') is distinct from 'array' or jsonb_array_length(d->'item_ids') = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
  perform private.ensure_billing(pid);
  select * into a from public.owner_billing_addresses x where x.user_id = pet.owner_id;
  insert into public.practice_invoices (practice_id, pet_id, pet_label, owner_id, recipient_name, recipient_address, treatment_date,
                                        catalog_id, catalog_version, catalog_name, currency, created_by_name)
  values (pid, pet.id, left(pet.name, 60), pet.owner_id,
          coalesce(a.name, (select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = pet.owner_id)),
          case when a.user_id is not null then concat_ws(E'\n', a.street, a.postcode || ' ' || a.city, case when a.country <> 'DE' then a.country end) end,
          td, c.id, c.version, c.name, c.currency, private.staff_name(pid))
  returning id into new_id;
  insert into public.practice_invoice_items (invoice_id, pos, catalog_item_id, code, name, qty, factor, factor_min, factor_max, unit_price, tax_rate, net)
  select new_id, row_number() over (order by i.sort, i.code), i.id, i.code, i.name, 1, i.factor, i.factor_min, i.factor_max, i.price, i.tax_rate,
         round(i.price * i.factor, 2)
  from public.practice_catalog_items i
  where i.catalog_id = c.id and i.id in (select (x #>> '{}')::uuid from jsonb_array_elements(d->'item_ids') x)
    and (i.valid_from is null or i.valid_from <= td) and (i.valid_to is null or i.valid_to >= td);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'items_required' using errcode = '22023'; end if;
  perform private.invoice_recalc(new_id);
  return new_id;
end;
$$;

-- Entwurf speichern. p: treatment_date, recipient_name, recipient_address, note,
-- items [{catalog_item_id, qty, factor} | {free: true, name, qty, unit_price, tax_rate}]
create or replace function public.practice_invoice_save(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  inv public.practice_invoices%rowtype;
  c public.practice_catalogs%rowtype;
  allow_free boolean;
  it jsonb;
  ci public.practice_catalog_items%rowtype;
  td date;
  q numeric;
  f numeric;
  pr numeric;
  tx numeric;
  pos integer := 0;
begin
  select * into inv from public.practice_invoices x where x.id = p_id and x.practice_id = pid for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if inv.status <> 'draft' then raise exception 'invoice_final' using errcode = '55000'; end if;
  if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') = 0 then raise exception 'items_required' using errcode = '22023'; end if;
  if jsonb_array_length(d->'items') > 200 then raise exception 'items_invalid' using errcode = '22023'; end if;
  begin td := coalesce(nullif(d->>'treatment_date', '')::date, inv.treatment_date);
  exception when others then raise exception 'date_invalid' using errcode = '22023'; end;
  if td > private.berlin_today() or td < private.berlin_today() - 730 then raise exception 'date_invalid' using errcode = '22023'; end if;
  select * into c from public.practice_catalogs x where x.practice_id = pid and x.active;
  allow_free := coalesce((select s.allow_free from public.practice_billing_settings s where s.practice_id = pid), true);
  delete from public.practice_invoice_items x where x.invoice_id = p_id;
  for it in select * from jsonb_array_elements(d->'items') loop
    pos := pos + 1;
    begin
      q := round(coalesce((it->>'qty')::numeric, 1), 2);
      f := (it->>'factor')::numeric;
    exception when others then raise exception 'items_invalid' using errcode = '22023'; end;
    if q <= 0 or q > 9999 then raise exception 'items_invalid' using errcode = '22023'; end if;
    if coalesce((it->>'free')::boolean, false) then
      if not allow_free then raise exception 'free_not_allowed' using errcode = '42501'; end if;
      begin
        pr := round((it->>'unit_price')::numeric, 2);
        tx := coalesce((it->>'tax_rate')::numeric, 19);
      exception when others then raise exception 'items_invalid' using errcode = '22023'; end;
      if char_length(btrim(coalesce(it->>'name', ''))) not between 1 and 120 or pr is null or pr < 0 or pr > 100000 or tx < 0 or tx > 30 then
        raise exception 'items_invalid' using errcode = '22023';
      end if;
      insert into public.practice_invoice_items (invoice_id, pos, code, name, qty, factor, unit_price, tax_rate, net, free)
      values (p_id, pos, null, btrim(it->>'name'), q, 1, pr, tx, round(q * pr, 2), true);
    else
      select * into ci from public.practice_catalog_items x where x.id = (it->>'catalog_item_id')::uuid and x.catalog_id = c.id;
      if not found then
        -- Position aus einer älteren Katalogversion: gleiche Nummer in der aktiven Version verwenden
        select x.* into ci from public.practice_catalog_items x
        join public.practice_catalog_items o on o.id = (it->>'catalog_item_id')::uuid and o.code = x.code
        where x.catalog_id = c.id;
        if not found then raise exception 'item_not_in_catalog' using errcode = 'P0002'; end if;
      end if;
      f := least(greatest(coalesce(f, ci.factor), ci.factor_min), ci.factor_max);
      insert into public.practice_invoice_items (invoice_id, pos, catalog_item_id, code, name, qty, factor, factor_min, factor_max, unit_price, tax_rate, net)
      values (p_id, pos, ci.id, ci.code, ci.name, q, f, ci.factor_min, ci.factor_max, ci.price, ci.tax_rate, round(q * f * ci.price, 2));
    end if;
  end loop;
  update public.practice_invoices set
    treatment_date = td,
    recipient_name = nullif(left(btrim(coalesce(d->>'recipient_name', '')), 120), ''),
    recipient_address = nullif(left(btrim(coalesce(d->>'recipient_address', '')), 300), ''),
    note = nullif(left(btrim(coalesce(d->>'note', '')), 500), ''),
    catalog_id = coalesce(c.id, inv.catalog_id), catalog_version = coalesce(c.version, inv.catalog_version), catalog_name = coalesce(c.name, inv.catalog_name),
    currency = coalesce(c.currency, inv.currency)
  where id = p_id;
  perform private.invoice_recalc(p_id);
end;
$$;

create or replace function public.practice_invoice_discard(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  delete from public.practice_invoices x where x.id = p_id and x.practice_id = pid and x.status = 'draft';
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function private.next_invoice_number(pid uuid, d date)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  yr integer := extract(year from d)::integer;
  n integer;
begin
  insert into public.practice_invoice_counters as c (practice_id, year, last) values (pid, yr, 1)
  on conflict (practice_id, year) do update set last = c.last + 1
  returning last into n;
  return 'RE-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;
revoke all on function private.next_invoice_number(uuid, date) from public, anon, authenticated;

create or replace function private.issuer_json(pid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(s.legal_name, pa.name), 'street', concat_ws(' ', pa.street, pa.housenumber), 'postcode', pa.postcode, 'city', pa.city,
    'phone', pa.phone, 'email', pa.email, 'tax_id', s.tax_id, 'tax_number', s.tax_number, 'iban', s.iban, 'bic', s.bic, 'bank', s.bank,
    'footer', s.footer)
  from public.practice_accounts pa left join public.practice_billing_settings s on s.practice_id = pa.id where pa.id = pid;
$$;
revoke all on function private.issuer_json(uuid) from public, anon, authenticated;

-- Freigeben: Nummer, Rechnungsdatum heute, Fälligkeit, Rechnungssteller und Katalogversion festschreiben
create or replace function public.practice_invoice_finalize(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  inv public.practice_invoices%rowtype;
  s public.practice_billing_settings%rowtype;
  pa public.practice_accounts%rowtype;
  today date := private.berlin_today();
  no text;
begin
  select * into inv from public.practice_invoices x where x.id = p_id and x.practice_id = pid for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if inv.status <> 'draft' then raise exception 'invoice_final' using errcode = '55000'; end if;
  if not exists (select 1 from public.practice_invoice_items x where x.invoice_id = p_id) then raise exception 'items_required' using errcode = '22023'; end if;
  if inv.recipient_name is null or inv.recipient_address is null then raise exception 'recipient_required' using errcode = '22023'; end if;
  perform private.ensure_billing(pid);
  select * into s from public.practice_billing_settings x where x.practice_id = pid;
  select * into pa from public.practice_accounts x where x.id = pid;
  if s.tax_id is null and s.tax_number is null then raise exception 'tax_id_required' using errcode = '22023'; end if;
  if coalesce(pa.street, '') = '' or coalesce(pa.city, '') = '' then raise exception 'address_required' using errcode = '22023'; end if;
  perform private.invoice_recalc(p_id);
  perform pg_advisory_xact_lock(hashtextextended('invoice' || pid::text, 0));
  no := private.next_invoice_number(pid, today);
  update public.practice_invoices set
    status = 'open', number = no, invoice_date = today, due_date = today + s.payment_days,
    issuer = private.issuer_json(pid), finalized_at = now(), finalized_by_name = private.staff_name(pid), updated_at = now()
  where id = p_id;
  return no;
end;
$$;

create or replace function public.practice_invoice_pay(p_id uuid, p_date date, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  inv public.practice_invoices%rowtype;
begin
  select * into inv from public.practice_invoices x where x.id = p_id and x.practice_id = pid for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if inv.status <> 'open' then raise exception 'status_invalid' using errcode = '22023'; end if;
  if p_method not in ('transfer', 'cash', 'card') then raise exception 'status_invalid' using errcode = '22023'; end if;
  if p_date is null or p_date > private.berlin_today() or p_date < inv.invoice_date - 30 then raise exception 'date_invalid' using errcode = '22023'; end if;
  update public.practice_invoices set status = 'paid', paid_on = p_date, pay_method = p_method, paid_by_name = private.staff_name(pid), updated_at = now()
  where id = p_id;
end;
$$;

-- Zahlungseingang zurücknehmen (Rückgängig / Fehlbuchung)
create or replace function public.practice_invoice_unpay(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  update public.practice_invoices set status = 'open', paid_on = null, pay_method = null, paid_by_name = null, updated_at = now()
  where id = p_id and practice_id = pid and status = 'paid';
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- Stornorechnung: eigene Nummer, Positionen mit negativer Menge, verweist auf die Rechnung; die Rechnung wird „storniert“
create or replace function public.practice_invoice_cancel(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  inv public.practice_invoices%rowtype;
  today date := private.berlin_today();
  r text := btrim(coalesce(p_reason, ''));
  no text;
  new_id uuid;
begin
  select * into inv from public.practice_invoices x where x.id = p_id and x.practice_id = pid for update;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  if inv.kind <> 'invoice' or inv.status not in ('open', 'paid') then raise exception 'status_invalid' using errcode = '22023'; end if;
  if char_length(r) not between 3 and 300 then raise exception 'reason_required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice' || pid::text, 0));
  no := private.next_invoice_number(pid, today);
  insert into public.practice_invoices (practice_id, kind, status, number, pet_id, pet_label, owner_id, recipient_name, recipient_address,
                                        treatment_date, invoice_date, due_date, catalog_id, catalog_version, catalog_name, currency, note,
                                        small_business, cancels_id, cancel_reason, finalized_at, finalized_by_name, created_by_name)
  values (pid, 'cancellation', 'draft', null, inv.pet_id, inv.pet_label, inv.owner_id, inv.recipient_name, inv.recipient_address,
          inv.treatment_date, today, today, inv.catalog_id, inv.catalog_version, inv.catalog_name, inv.currency, left(r, 500),
          inv.small_business, inv.id, r, now(), private.staff_name(pid), private.staff_name(pid))
  returning id into new_id;
  insert into public.practice_invoice_items (invoice_id, pos, catalog_item_id, code, name, qty, factor, factor_min, factor_max, unit_price, tax_rate, net, free)
  select new_id, it.pos, it.catalog_item_id, it.code, it.name, -it.qty, it.factor, it.factor_min, it.factor_max, it.unit_price, it.tax_rate, -it.net, it.free
  from public.practice_invoice_items it where it.invoice_id = inv.id;
  -- Summen exakt gespiegelt (gleiche Rundung wie die Rechnung)
  update public.practice_invoices set net = -inv.net, tax = -inv.tax, gross = -inv.gross,
    taxes = (select coalesce(jsonb_agg(jsonb_build_object('rate', t->'rate', 'net', -(t->>'net')::numeric, 'tax', -(t->>'tax')::numeric)), '[]'::jsonb)
             from jsonb_array_elements(inv.taxes) t),
    issuer = private.issuer_json(pid), number = no, status = 'final'
  where id = new_id;
  update public.practice_invoices set status = 'cancelled', cancelled_by_id = new_id, updated_at = now() where id = inv.id;
  return no;
end;
$$;

-- ---------- Halter:in ----------

create or replace function public.my_billing_address()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(a) - 'user_id' from public.owner_billing_addresses a where a.user_id = (select auth.uid());
$$;

-- p: name, street, postcode, city, country. Leere Felder löschen die Anschrift.
create or replace function public.save_billing_address(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  d jsonb := coalesce(p, '{}'::jsonb);
  nm text := btrim(coalesce(d->>'name', ''));
  st text := btrim(coalesce(d->>'street', ''));
  pc text := btrim(coalesce(d->>'postcode', ''));
  ct text := btrim(coalesce(d->>'city', ''));
  co text := upper(btrim(coalesce(nullif(d->>'country', ''), 'DE')));
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if nm = '' and st = '' and pc = '' and ct = '' then
    delete from public.owner_billing_addresses where user_id = uid;
    return;
  end if;
  if nm = '' or st = '' or pc = '' or ct = '' or char_length(nm) > 120 or char_length(st) > 120 or char_length(pc) > 12 or char_length(ct) > 80
     or co !~ '^[A-Z]{2}$' then
    raise exception 'address_invalid' using errcode = '22023';
  end if;
  insert into public.owner_billing_addresses (user_id, name, street, postcode, city, country)
  values (uid, nm, st, pc, ct, co)
  on conflict (user_id) do update set name = excluded.name, street = excluded.street, postcode = excluded.postcode, city = excluded.city,
    country = excluded.country, updated_at = now();
end;
$$;

-- Rechnungen, die an mich gehen oder Tiere betreffen, deren Halter:in ich bin (keine Entwürfe)
create or replace function private.can_see_invoice(i public.practice_invoices)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select i.status <> 'draft' and (i.owner_id = (select auth.uid())
    or exists (select 1 from public.pet_members m where m.pet_id = i.pet_id and m.user_id = (select auth.uid()) and m.role = 'owner'));
$$;
revoke all on function private.can_see_invoice(public.practice_invoices) from public, anon, authenticated;

create or replace function public.owner_invoices()
returns table (id uuid, kind text, status text, number text, practice_name text, pet_id uuid, pet_label text, treatment_date date,
               invoice_date date, due_date date, paid_on date, gross numeric, currency text, cancels_number text, cancelled_by_number text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.kind, i.status, i.number, coalesce(i.issuer->>'name', pa.name), i.pet_id, i.pet_label, i.treatment_date, i.invoice_date,
         i.due_date, i.paid_on, i.gross, i.currency,
         (select c.number from public.practice_invoices c where c.id = i.cancels_id),
         (select c.number from public.practice_invoices c where c.id = i.cancelled_by_id)
  from public.practice_invoices i
  join public.practice_accounts pa on pa.id = i.practice_id
  where private.can_see_invoice(i)
  order by i.invoice_date desc, i.finalized_at desc
  limit 500;
$$;

create or replace function public.owner_invoice(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.practice_invoices%rowtype;
begin
  select * into i from public.practice_invoices x where x.id = p_id;
  if not found or not private.can_see_invoice(i) then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
  return private.invoice_json(p_id) - 'created_by_name' - 'paid_by_name';
end;
$$;

-- ---------- Push: neue Rechnung / Stornorechnung an die Halter:in ----------

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
  select pm.user_id, 'recall', r.id, r.sent_at, p.name, pa.name,
         jsonb_build_object('vaccine', r.vaccine, 'due_on', r.due_on), '/termine/buchen?praxis=' || r.practice_id
  from public.practice_recalls r
  join public.practice_accounts pa on pa.id = r.practice_id
  join public.pets p on p.id = r.pet_id and not coalesce(p.deceased, false)
  join public.pet_members pm on pm.pet_id = r.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.practice, true) and r.sent_at > p_now - interval '10 minutes' and r.sent_at <= p_now
  union all
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
  select ps.user_id, 'inquiry', q.id, q.created_at, q.pet_label, q.owner_label,
         jsonb_build_object('event', 'new', 'urgency', q.urgency), '/praxis/anfragen'
  from public.practice_inquiries q
  join public.practice_staff ps on ps.practice_id = q.practice_id
  where q.created_at > p_now - interval '10 minutes' and q.created_at <= p_now
  union all
  select pm.user_id, 'inquiry', q.id, e.at, q.pet_label, pa.name, jsonb_build_object('event', e.event), '/mehr/anfragen'
  from public.practice_inquiries q
  join public.practice_accounts pa on pa.id = q.practice_id
  cross join lateral (values ('answered', q.replied_at), ('offered', q.offered_at)) e(event, at)
  join public.pet_members pm on pm.pet_id = q.pet_id and pm.role in ('owner', 'carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where e.at is not null and coalesce(np.practice, true) and e.at > p_now - interval '10 minutes' and e.at <= p_now
  union all
  -- Rechnungen: an die Rechnungsempfänger:in und Haupthalter:innen des Tiers (ohne Betreuer:innen)
  select u.user_id, 'invoice', i.id, i.finalized_at, i.pet_label, coalesce(i.issuer->>'name', pa.name),
         jsonb_build_object('event', i.kind, 'number', i.number, 'gross', i.gross, 'currency', i.currency, 'due_on', i.due_date), '/mehr/rechnungen'
  from public.practice_invoices i
  join public.practice_accounts pa on pa.id = i.practice_id
  cross join lateral (select i.owner_id as user_id where i.owner_id is not null
                      union select m.user_id from public.pet_members m where m.pet_id = i.pet_id and m.role = 'owner') u
  left join public.notification_prefs np on np.user_id = u.user_id
  where i.status <> 'draft' and i.finalized_at is not null and coalesce(np.practice, true)
    and i.finalized_at > p_now - interval '10 minutes' and i.finalized_at <= p_now;
$$;
revoke all on function private.due_pushes(timestamptz) from public, anon, authenticated;

-- ---------- Rechte ----------

revoke all on function public.practice_billing() from public, anon;
revoke all on function public.practice_save_billing_settings(jsonb) from public, anon;
revoke all on function public.practice_catalog_publish(jsonb) from public, anon;
revoke all on function public.practice_invoices() from public, anon;
revoke all on function public.practice_invoice(uuid) from public, anon;
revoke all on function public.practice_invoice_create(jsonb) from public, anon;
revoke all on function public.practice_invoice_save(uuid, jsonb) from public, anon;
revoke all on function public.practice_invoice_discard(uuid) from public, anon;
revoke all on function public.practice_invoice_finalize(uuid) from public, anon;
revoke all on function public.practice_invoice_pay(uuid, date, text) from public, anon;
revoke all on function public.practice_invoice_unpay(uuid) from public, anon;
revoke all on function public.practice_invoice_cancel(uuid, text) from public, anon;
revoke all on function public.my_billing_address() from public, anon;
revoke all on function public.save_billing_address(jsonb) from public, anon;
revoke all on function public.owner_invoices() from public, anon;
revoke all on function public.owner_invoice(uuid) from public, anon;

grant execute on function public.practice_billing() to authenticated;
grant execute on function public.practice_save_billing_settings(jsonb) to authenticated;
grant execute on function public.practice_catalog_publish(jsonb) to authenticated;
grant execute on function public.practice_invoices() to authenticated;
grant execute on function public.practice_invoice(uuid) to authenticated;
grant execute on function public.practice_invoice_create(jsonb) to authenticated;
grant execute on function public.practice_invoice_save(uuid, jsonb) to authenticated;
grant execute on function public.practice_invoice_discard(uuid) to authenticated;
grant execute on function public.practice_invoice_finalize(uuid) to authenticated;
grant execute on function public.practice_invoice_pay(uuid, date, text) to authenticated;
grant execute on function public.practice_invoice_unpay(uuid) to authenticated;
grant execute on function public.practice_invoice_cancel(uuid, text) to authenticated;
grant execute on function public.my_billing_address() to authenticated;
grant execute on function public.save_billing_address(jsonb) to authenticated;
grant execute on function public.owner_invoices() to authenticated;
grant execute on function public.owner_invoice(uuid) to authenticated;
