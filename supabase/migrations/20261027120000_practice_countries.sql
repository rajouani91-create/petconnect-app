-- Praxissuche in Österreich, der Schweiz, Frankreich und den Niederlanden (Marokko vorbereitet, in der App noch nicht auswählbar).
-- 1. place_index: Orte und Postleitzahlen außerhalb Deutschlands (Quelle: GeoNames, CC BY 4.0), befüllt von der Edge Function import-places.
-- 2. geocode_place bekommt das Land (Standard DE, Verhalten für Deutschland unverändert). Niederlande: PLZ = vier Ziffern, auch „3511 AB“.
-- 3. Namenssuche: französische und niederländische Füllwörter („cabinet vétérinaire“, „dierenartsenpraktijk“) zählen nicht.
-- 4. Praxisdaten für AT, CH, FR und NL aus OpenStreetMap (wie in Deutschland; FR und NL je Region/Provinz), monatlich per pg_cron.

-- ---------- 1. Orte und PLZ im Ausland ----------
create table if not exists public.place_index (
  country char(2) not null check (country in ('AT', 'CH', 'FR', 'NL', 'MA')),
  postcode text not null check (char_length(postcode) between 3 and 10),
  place text not null check (char_length(place) between 1 and 120),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  rank integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (country, postcode, place)
);
create index if not exists place_index_place_trgm_idx on public.place_index using gin (private.norm_text(place) extensions.gin_trgm_ops);
create index if not exists place_index_place_idx on public.place_index (country, lower(place));
alter table public.place_index enable row level security;
drop policy if exists "orte lesen" on public.place_index;
create policy "orte lesen" on public.place_index for select to authenticated using (true);
revoke all on public.place_index from public, anon, authenticated;
grant select on public.place_index to authenticated;
-- Die Edge Function (service_role) füllt und erneuert die Tabelle
grant select, insert, update, delete on public.place_index to service_role;

-- ---------- 2. geocode_place mit Land ----------
drop function if exists public.geocode_place(text);
create or replace function public.geocode_place(p_q text, p_country text default 'DE')
returns table(postcode text, place text, lat double precision, lon double precision)
language sql
stable
set search_path = ''
as $$
  with q0 as (
    select btrim(coalesce(p_q, '')) as raw,
           private.norm_text(p_q) as s,
           case when p_country in ('DE', 'AT', 'CH', 'FR', 'NL', 'MA') then p_country else 'DE' end as c
  ), q as (
    -- NL: „3511 AB“ → „3511“; sonst bleibt die Eingabe, wie sie ist
    select raw, s, c,
           case when c = 'NL' and raw ~ '^[0-9]{4}\s?[A-Za-z]{2}$' then substring(raw from '^[0-9]{4}') else raw end as digits
    from q0
  ), src as (
    select pc.postcode, pc.place, pc.lat, pc.lon, 0 as rank from public.postal_codes pc, q where pc.country = q.c
    union all
    select i.postcode, i.place, i.lat, i.lon, i.rank from public.place_index i, q where i.country = q.c
  )
  select s.postcode, s.place, s.lat, s.lon
  from src s, q
  where q.raw <> '' and (
        (q.digits ~ '^[0-9]{5}$' and s.postcode = q.digits)
     or (q.digits ~ '^[0-9]{2,4}$' and s.postcode like q.digits || '%')
     or (q.digits !~ '^[0-9]+$' and char_length(q.s) >= 2 and (
            private.norm_text(s.place) like q.s || '%'
         or private.norm_text(s.place) like '% ' || q.s || '%'
         or (char_length(q.s) >= 4 and extensions.similarity(private.norm_text(s.place), q.s) >= 0.45))))
  order by (private.norm_text(s.place) = q.s) desc,
           (private.norm_text(s.place) like q.s || '%') desc,
           extensions.similarity(private.norm_text(s.place), q.s) desc,
           s.rank desc, s.place, s.postcode
  limit 10;
$$;
revoke all on function public.geocode_place(text, text) from public, anon;
grant execute on function public.geocode_place(text, text) to authenticated;

-- ---------- 3. Namenssuche: Füllwörter auch auf Französisch und Niederländisch ----------
create or replace function private.norm_query(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    ' ' || private.norm_text(t) || ' ',
    '( (dr|med|vet|prof|praxis|tierarztpraxis|tierarzt|tierarztin|tierarzte|tierarztliche|tierarztlicher|und|fur|am|im|der|die|das|gmbh|mvz'
    || '|cabinet|clinique|veterinaire|veterinaires|docteur|et|le|la|les|du|des|de'
    || '|dierenarts|dierenartsen|dierenartsenpraktijk|dierenkliniek|dierenziekenhuis|praktijk|van|het|en|bv) )+', ' ', 'g'));
$$;

-- ---------- 4. Praxisdaten aus OpenStreetMap für FR und NL ----------
-- Wie import_osm_state, aber nur Praxen (Orte und PLZ kommen aus GeoNames). p_area: „FR-IDF“ (Region) oder „AT“ (ganzes Land).
create or replace function private.import_osm_practices_area(p_area text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare j jsonb; n_pr int; v_country text := left(p_area, 2); v_sel text;
begin
  if p_area !~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then raise exception 'bad_area'; end if;
  v_sel := case when position('-' in p_area) > 0
                then format('["ISO3166-2"="%s"]', p_area)
                else format('["ISO3166-1"="%s"][admin_level=2]', p_area) end;
  j := private.overpass(format('[out:json][timeout:200];area%s->.a;nwr["amenity"="veterinary"](area.a);out tags center;', v_sel));
  with e as (select jsonb_array_elements(j->'elements') x),
  p as (
    select x->>'type' as t, (x->>'id')::bigint as oid,
           coalesce((x->>'lat')::float8, (x->'center'->>'lat')::float8) as lat,
           coalesce((x->>'lon')::float8, (x->'center'->>'lon')::float8) as lon,
           x->'tags' as g from e)
  insert into public.practices as pr (source, osm_type, osm_id, country, name, street, housenumber, postcode, city, lat, lon, phone, website, email, opening_hours, active, last_seen_at, updated_at)
  select 'osm', t, oid, v_country, left(g->>'name', 200),
         left(g->>'addr:street',200), left(g->>'addr:housenumber',20), left(g->>'addr:postcode',10), left(coalesce(g->>'addr:city', g->>'addr:suburb'),120),
         lat, lon,
         left(coalesce(g->>'phone', g->>'contact:phone'),60), left(coalesce(g->>'website', g->>'contact:website'),300),
         left(coalesce(g->>'email', g->>'contact:email'),200), left(g->>'opening_hours',500), true, now(), now()
  from p where lat is not null and lon is not null and coalesce(btrim(g->>'name'),'') <> ''
  on conflict (osm_type, osm_id) do update set
    country = excluded.country,
    name = excluded.name, street = excluded.street, housenumber = excluded.housenumber, postcode = excluded.postcode,
    city = excluded.city, lat = excluded.lat, lon = excluded.lon, phone = excluded.phone, website = excluded.website,
    email = excluded.email, opening_hours = excluded.opening_hours, active = true, last_seen_at = now(), updated_at = now()
  where not pr.registered;
  get diagnostics n_pr = row_count;
  return jsonb_build_object('area', p_area, 'practices', n_pr);
end; $$;
revoke all on function private.import_osm_practices_area(text) from public, anon, authenticated;

-- Alle Regionen/Provinzen eines Landes nacheinander (Pause schont den öffentlichen Overpass-Dienst).
-- Praxen, die in keiner Region mehr auftauchen, werden nur deaktiviert, wenn alle Regionen des Landes fehlerfrei liefen.
create or replace function private.import_osm_abroad(p_countries text[] default array['AT', 'CH', 'FR', 'NL'])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz; v_country text; v_area text; v_areas text[]; v_ok int; v_err int; n_off int; r jsonb; out jsonb := '{}'::jsonb;
begin
  foreach v_country in array p_countries loop
    if v_country not in ('AT', 'CH', 'FR', 'NL', 'MA') then continue; end if;
    v_areas := case v_country
      when 'FR' then array['FR-ARA','FR-BFC','FR-BRE','FR-CVL','FR-COR','FR-GES','FR-HDF','FR-IDF','FR-NOR','FR-NAQ','FR-OCC','FR-PDL','FR-PAC']
      when 'NL' then array['NL-DR','NL-FL','NL-FR','NL-GE','NL-GR','NL-LI','NL-NB','NL-NH','NL-OV','NL-UT','NL-ZE','NL-ZH']
      else array[v_country] end; -- AT, CH, MA: ganzes Land in einer Abfrage
    v_start := now(); v_ok := 0; v_err := 0; n_off := 0;
    foreach v_area in array v_areas loop
      begin
        r := private.import_osm_practices_area(v_area);
        insert into private.import_log(job, result) values ('osm ' || v_area, r);
        v_ok := v_ok + 1;
      exception when others then
        insert into private.import_log(job, error) values ('osm ' || v_area, sqlerrm);
        v_err := v_err + 1;
      end;
      perform pg_sleep(10);
    end loop;
    if v_err = 0 then
      update public.practices set active = false, updated_at = now()
       where source = 'osm' and not registered and active and country = v_country and last_seen_at < v_start;
      get diagnostics n_off = row_count;
    end if;
    r := jsonb_build_object('country', v_country, 'ok', v_ok, 'errors', v_err, 'deactivated', n_off);
    insert into private.import_log(job, result) values ('osm ' || v_country || ' gesamt', r);
    out := out || jsonb_build_object(v_country, r);
  end loop;
  return out;
end; $$;
revoke all on function private.import_osm_abroad(text[]) from public, anon, authenticated;

-- Monatlich am 3. um 03:47 (Deutschland läuft am 1.)
select cron.unschedule(jobid) from cron.job where jobname = 'osm-import-abroad';
select cron.schedule('osm-import-abroad', '47 3 3 * *', $cron$set statement_timeout = '60min'; select private.import_osm_abroad();$cron$);
