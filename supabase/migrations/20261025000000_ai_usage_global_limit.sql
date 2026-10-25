-- KI-Assistent: globales Tageslimit von 300 auf 50 senken (passt zum kostenlosen Groq-Tokenbudget von ca. 200.000/Tag).
-- Ändert nur die Zahl in der Funktion; keine Tabelle, keine Daten.
create or replace function public.ai_usage_hit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_hour_limit   constant integer := 12;
  c_day_limit    constant integer := 40;
  c_global_limit constant integer := 50;
  uid       uuid := auth.uid();
  this_hour timestamptz := date_trunc('hour', now());
  hour_n    integer;
  day_n     integer;
  global_n  integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

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
