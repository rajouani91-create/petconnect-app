-- KI-Assistent: Anfrage-Limit pro Person (und insgesamt). Speichert KEINE Fragen und KEINE Antworten,
-- nur eine Zählung pro Person und Stunde. Rein additiv: ändert keine bestehende Tabelle und keine bestehende Richtlinie.

create table if not exists private.ai_usage (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  hour_start timestamptz not null,
  n          integer     not null default 0 check (n >= 0),
  primary key (user_id, hour_start)
);

-- RLS an, aber bewusst ohne Richtlinie: Clients kommen nie direkt an diese Tabelle.
-- Nur die Funktion unten (SECURITY DEFINER) darf sie lesen und schreiben.
alter table private.ai_usage enable row level security;

create or replace function public.ai_usage_hit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_hour_limit   constant integer := 12;   -- Fragen pro Person und Stunde
  c_day_limit    constant integer := 40;   -- Fragen pro Person in 24 Stunden
  c_global_limit constant integer := 300;  -- Fragen insgesamt in 24 Stunden (Schutz vor Kosten und Missbrauch)
  uid       uuid := auth.uid();
  this_hour timestamptz := date_trunc('hour', now());
  hour_n    integer;
  day_n     integer;
  global_n  integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Alte Zähler aufräumen (nichts, was für das Limit noch gebraucht wird)
  delete from private.ai_usage where hour_start < now() - interval '2 days';

  select coalesce(sum(n) filter (where hour_start = this_hour), 0), coalesce(sum(n), 0)
    into hour_n, day_n
    from private.ai_usage
   where user_id = uid and hour_start >= now() - interval '24 hours';

  select coalesce(sum(n), 0) into global_n
    from private.ai_usage
   where hour_start >= now() - interval '24 hours';

  if global_n >= c_global_limit then
    return jsonb_build_object('allowed', false, 'reason', 'global');
  elsif hour_n >= c_hour_limit then
    return jsonb_build_object('allowed', false, 'reason', 'hour');
  elsif day_n >= c_day_limit then
    return jsonb_build_object('allowed', false, 'reason', 'day');
  end if;

  insert into private.ai_usage (user_id, hour_start, n)
  values (uid, this_hour, 1)
  on conflict (user_id, hour_start) do update set n = private.ai_usage.n + 1;

  return jsonb_build_object('allowed', true, 'day_left', c_day_limit - day_n - 1, 'hour_left', c_hour_limit - hour_n - 1);
end;
$$;

revoke all on function public.ai_usage_hit() from public, anon;
grant execute on function public.ai_usage_hit() to authenticated;
