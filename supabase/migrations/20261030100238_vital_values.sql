-- Etappe 2: Vitalwerte (Temperatur, Herzfrequenz, Atemfrequenz), vom Halter eingetragen.
-- Gewicht bleibt in `weights`. Zugriffsregeln wie bei `weights`; Praxis und Gerät sind als Herkunft vorbereitet, aber gesperrt.
create table public.vital_values (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  owner_id    uuid not null default auth.uid(),
  kind        text not null check (kind in ('temperature', 'heart_rate', 'resp_rate')),
  value       numeric(6,2) not null,
  context     text check (context in ('rectal', 'ear', 'resting', 'active') or context is null),
  measured_at timestamptz not null default now(),
  source      text not null default 'owner' check (source in ('owner', 'practice', 'device')),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  constraint vital_values_range check (
    (kind = 'temperature' and value between 30 and 45) or
    (kind = 'heart_rate'  and value between 10 and 400) or
    (kind = 'resp_rate'   and value between 2 and 200)
  )
);

create index vital_values_pet_kind_time on public.vital_values (pet_id, kind, measured_at desc);

alter table public.vital_values enable row level security;

create policy "vital lesen" on public.vital_values for select to authenticated
  using (private.is_pet_member(pet_id));

create policy "vital anlegen" on public.vital_values for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_pet(pet_id) and source = 'owner');

create policy "vital aendern" on public.vital_values for update to authenticated
  using (private.can_edit_pet(pet_id) and source = 'owner')
  with check (private.can_edit_pet(pet_id) and source = 'owner');

create policy "vital loeschen" on public.vital_values for delete to authenticated
  using (private.can_edit_pet(pet_id) and source = 'owner');
