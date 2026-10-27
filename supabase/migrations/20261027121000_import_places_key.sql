-- Zugang für die Edge Function import-places: Sie prüft den Schlüssel gegen einen Hash in der Datenbank.
-- Der Schlüssel wird für den Import angelegt und danach wieder gelöscht (Tabelle leeren = Funktion gesperrt).
create table if not exists private.import_keys (
  hash text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.import_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_key, '') <> '' and exists (select 1 from private.import_keys k where k.hash = encode(extensions.digest(p_key, 'sha256'), 'hex'));
$$;
revoke all on function public.import_key_ok(text) from public, anon, authenticated;
grant execute on function public.import_key_ok(text) to service_role;
