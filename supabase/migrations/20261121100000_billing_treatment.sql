-- Etappe P7b: Abrechnen direkt bei der Behandlung, Leistungspakete der Praxis, Rechnung ↔ Termin.
-- Ein Termin hat höchstens eine gültige Rechnung (Entwurf, offen oder bezahlt); nach einem Storno ist eine neue möglich.

-- ---------- Tabellen ----------

create table public.practice_bill_packages (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_at timestamptz not null default now(),
  created_by_name text
);
create unique index practice_bill_packages_name_idx on public.practice_bill_packages (practice_id, lower(name));
alter table public.practice_bill_packages enable row level security;
revoke all on public.practice_bill_packages from anon, authenticated;

alter table public.practice_invoices add column if not exists appointment_id uuid references public.practice_appointments(id) on delete set null;
create unique index practice_invoices_appointment_idx on public.practice_invoices (appointment_id)
  where appointment_id is not null and kind = 'invoice' and status in ('draft', 'open', 'paid');

-- ---------- Pakete ----------

-- Pakete mit den Positionen (Nummer + Menge), die im aktiven Katalog vorhanden sind
create or replace function public.practice_bill_packages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'items', k.items, 'created_by_name', k.created_by_name)
                   order by lower(k.name)) from public.practice_bill_packages k where k.practice_id = pid), '[]'::jsonb);
end;
$$;

-- p: name, items [{code, qty}]. Gleicher Name ersetzt das Paket.
create or replace function public.practice_save_bill_package(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
  d jsonb := coalesce(p, '{}'::jsonb);
  nm text := btrim(coalesce(d->>'name', ''));
  v_items jsonb;
  new_id uuid;
begin
  if char_length(nm) not between 1 and 80 then raise exception 'name_invalid' using errcode = '22023'; end if;
  if jsonb_typeof(d->'items') is distinct from 'array' then raise exception 'items_invalid' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code', upper(btrim(x->>'code')), 'qty', round((x->>'qty')::numeric, 2))), '[]'::jsonb) into v_items
  from jsonb_array_elements(d->'items') x
  where coalesce(btrim(x->>'code'), '') <> '' and char_length(btrim(x->>'code')) <= 20
    and coalesce(x->>'qty', '') ~ '^\d{1,4}(\.\d{1,2})?$' and (x->>'qty')::numeric > 0;
  if jsonb_array_length(v_items) not between 2 and 30 then raise exception 'items_invalid' using errcode = '22023'; end if;
  if (select count(*) from public.practice_bill_packages k where k.practice_id = pid) >= 100
     and not exists (select 1 from public.practice_bill_packages k where k.practice_id = pid and lower(k.name) = lower(nm)) then
    raise exception 'too_many_requests' using errcode = '54000';
  end if;
  insert into public.practice_bill_packages (practice_id, name, items, created_by_name)
  values (pid, nm, v_items, private.staff_name(pid))
  on conflict (practice_id, lower(name)) do update set items = excluded.items, created_by_name = excluded.created_by_name, created_at = now()
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.practice_delete_bill_package(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := private.active_practice_id();
begin
  delete from public.practice_bill_packages k where k.id = p_id and k.practice_id = pid;
  if not found then raise exception 'entry_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- ---------- Entwurf bei der Behandlung ----------

-- Wie P7a, zusätzlich: p.items [{catalog_item_id, qty, factor} | {free, name, qty, unit_price, tax_rate}] statt item_ids,
-- p.appointment_id (Termin dieses Tiers bei dieser Praxis; eine gültige Rechnung je Termin)
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
  appt uuid;
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
  if coalesce(d->>'appointment_id', '') <> '' then
    if d->>'appointment_id' !~ '^[0-9a-f-]{36}$' then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
    select x.id into appt from public.practice_appointments x
    where x.id = (d->>'appointment_id')::uuid and x.practice_id = pid and x.pet_id = pet.id;
    if appt is null then raise exception 'appointment_not_found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.practice_invoices i where i.appointment_id = appt and i.kind = 'invoice' and i.status in ('draft', 'open', 'paid')) then
      raise exception 'invoice_exists' using errcode = '23505';
    end if;
  end if;
  perform private.ensure_billing(pid);
  select * into a from public.owner_billing_addresses x where x.user_id = pet.owner_id;
  insert into public.practice_invoices (practice_id, pet_id, pet_label, owner_id, recipient_name, recipient_address, treatment_date,
                                        catalog_id, catalog_version, catalog_name, currency, created_by_name, appointment_id)
  values (pid, pet.id, left(pet.name, 60), pet.owner_id,
          coalesce(a.name, (select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = pet.owner_id)),
          case when a.user_id is not null then concat_ws(E'\n', a.street, a.postcode || ' ' || a.city, case when a.country <> 'DE' then a.country end) end,
          td, c.id, c.version, c.name, c.currency, private.staff_name(pid), appt)
  returning id into new_id;
  if jsonb_typeof(d->'items') = 'array' then
    -- Positionen mit Menge, Faktor und freien Positionen: gleiche Prüfung wie beim Speichern eines Entwurfs
    perform public.practice_invoice_save(new_id, jsonb_build_object(
      'treatment_date', td, 'items', d->'items',
      'recipient_name', (select i.recipient_name from public.practice_invoices i where i.id = new_id),
      'recipient_address', (select i.recipient_address from public.practice_invoices i where i.id = new_id)));
    return new_id;
  end if;
  if jsonb_typeof(d->'item_ids') is distinct from 'array' or jsonb_array_length(d->'item_ids') = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;
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

-- Liste: Termin mitliefern (für „Für diesen Termin gibt es schon eine Rechnung“)
drop function if exists public.practice_invoices();
create or replace function public.practice_invoices()
returns table (id uuid, kind text, status text, number text, pet_id uuid, pet_label text, recipient_name text, treatment_date date,
               invoice_date date, due_date date, paid_on date, pay_method text, gross numeric, currency text, first_item text,
               item_count integer, cancels_number text, cancelled_by_number text, has_owner boolean, created_at timestamptz, appointment_id uuid)
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
           i.owner_id is not null, i.created_at, i.appointment_id
    from public.practice_invoices i
    where i.practice_id = pid
    order by (i.status = 'draft') desc, coalesce(i.invoice_date, i.treatment_date) desc, i.created_at desc
    limit 1000;
end;
$$;

-- ---------- Rechte ----------

revoke all on function public.practice_bill_packages() from public, anon;
revoke all on function public.practice_save_bill_package(jsonb) from public, anon;
revoke all on function public.practice_delete_bill_package(uuid) from public, anon;
revoke all on function public.practice_invoices() from public, anon;
grant execute on function public.practice_bill_packages() to authenticated;
grant execute on function public.practice_save_bill_package(jsonb) to authenticated;
grant execute on function public.practice_delete_bill_package(uuid) to authenticated;
grant execute on function public.practice_invoices() to authenticated;
