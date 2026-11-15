-- Etappe P3b: Digitaler Impfnachweis.
-- Die Praxis „stellt“ den Nachweis mit Namen und Datum „aus“. Halter:in und Praxis sehen dasselbe Dokument:
-- von einer Praxis eingetragene oder bestätigte Impfungen getrennt von den eigenen Einträgen der Halter:in.
-- Der Nachweis zeigt immer den aktuellen Stand der Tierakte; gespeichert wird nur, wer wann ausgestellt hat.

create table public.vaccination_certificates (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  practice_id uuid not null references public.practice_accounts(id) on delete cascade,
  issued_by uuid references auth.users(id) on delete set null,
  issued_by_name text not null,
  issued_at timestamptz not null default now()
);
create index vaccination_certificates_pet_idx on public.vaccination_certificates (pet_id, issued_at desc);

alter table public.vaccination_certificates enable row level security;
revoke all on public.vaccination_certificates from anon, authenticated;

-- Nachweis ausstellen (Leitung und Tierärzt:innen). Braucht mindestens eine Impfung, die eine Praxis eingetragen oder bestätigt hat.
create or replace function public.practice_issue_certificate(p_pet uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  ts timestamptz := now();
begin
  c := private.patient_ctx(p_pet, 'clinical');
  if not exists (select 1 from public.vaccinations v where v.pet_id = p_pet and v.source = 'practice') then
    raise exception 'no_vaccinations' using errcode = '22023';
  end if;
  insert into public.vaccination_certificates (pet_id, practice_id, issued_by, issued_by_name, issued_at)
  values (p_pet, c.practice_id, c.actor, c.actor_name, ts);
  perform private.queue_practice_notice(p_pet, c.practice_id, c.practice_name);
  return ts;
end;
$$;

-- Inhalt des Nachweises: für alle, die das Tier sehen dürfen, und für freigeschaltete Praxen mit Freigabe
create or replace function public.pet_vaccination_certificate(p_pet uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pid uuid;
  res jsonb;
begin
  if not private.is_pet_member(p_pet) then
    pid := private.active_practice_id();
    if not exists (select 1 from public.pet_practice_access x where x.practice_id = pid and x.pet_id = p_pet) then
      raise exception 'patient_not_found' using errcode = 'P0002';
    end if;
  end if;
  select jsonb_build_object(
    'pet', jsonb_build_object('name', p.name, 'species', p.species, 'species_other', p.species_other, 'breed', p.breed, 'sex', p.sex,
                              'birth_date', p.birth_date, 'chip_no', p.chip_no),
    'owner_name', pr.display_name,
    -- je Praxis die letzte Ausstellung
    'issued', coalesce((
      select jsonb_agg(jsonb_build_object('practice_name', i.name, 'city', i.city, 'by_name', i.issued_by_name, 'at', i.issued_at, 'mine', coalesce(i.practice_id = private.my_practice_id(), false))
                       order by i.issued_at desc)
      from (select distinct on (vc.practice_id) vc.practice_id, a.name, a.city, vc.issued_by_name, vc.issued_at
            from public.vaccination_certificates vc join public.practice_accounts a on a.id = vc.practice_id
            where vc.pet_id = p_pet order by vc.practice_id, vc.issued_at desc) i), '[]'::jsonb),
    'confirmed', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'given_on', v.given_on, 'valid_until', v.valid_until,
                                          'practice_name', a.name, 'by_name', e.created_by_name)
                       order by v.given_on desc nulls last, v.created_at desc)
      from public.vaccinations v
      left join public.practice_entries e on e.ref_id = v.id and e.kind = 'vaccination' and e.voided_at is null
      left join public.practice_accounts a on a.id = e.practice_id
      where v.pet_id = p_pet and v.source = 'practice'), '[]'::jsonb),
    'own', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'given_on', v.given_on, 'valid_until', v.valid_until)
                       order by v.given_on desc nulls last, v.created_at desc)
      from public.vaccinations v where v.pet_id = p_pet and v.source = 'owner'), '[]'::jsonb))
  into res
  from public.pets p left join public.profiles pr on pr.id = p.owner_id
  where p.id = p_pet;
  return res;
end;
$$;

revoke all on function public.practice_issue_certificate(uuid) from public, anon;
revoke all on function public.pet_vaccination_certificate(uuid) from public, anon;
grant execute on function public.practice_issue_certificate(uuid) to authenticated;
grant execute on function public.pet_vaccination_certificate(uuid) to authenticated;
