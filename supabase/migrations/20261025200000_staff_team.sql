-- Team-Verwaltung: Admins können Support-Zugänge vergeben, ändern und entziehen.
-- Alles läuft über Funktionen, die nur für Admins freigegeben sind; jede Änderung landet im Audit-Protokoll.

create or replace function public.staff_team()
returns table(user_id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select r.user_id, u.email::text, p.display_name, r.role, r.created_at
    from public.staff_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    order by (r.role = 'admin') desc, r.created_at;
end;
$$;

-- new_role: 'support', 'admin' oder 'none' (Zugang entziehen). Das Konto muss bereits registriert sein.
create or replace function public.staff_set_role(target_email text, new_role text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(coalesce(reason, ''));
  clean_email text := lower(btrim(coalesce(target_email, '')));
  target uuid;
  current_role text;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('support', 'admin', 'none') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if char_length(clean_reason) < 1 or char_length(clean_reason) > 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select u.id into target from auth.users u where lower(u.email) = clean_email limit 1;
  if target is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if target = (select auth.uid()) then
    raise exception 'cannot_change_own_role' using errcode = '22023';
  end if;

  select s.role into current_role from public.staff_roles s where s.user_id = target;

  if new_role = 'none' then
    if current_role is null then
      raise exception 'no_role' using errcode = '22023';
    end if;
    delete from public.staff_roles where user_id = target;
  else
    insert into public.staff_roles (user_id, role) values (target, new_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;

  insert into public.staff_audit (staff_id, action, target_user_id, reason)
  values ((select auth.uid()), 'role_' || new_role, target, clean_reason);
end;
$$;

revoke all on function public.staff_team() from public, anon;
revoke all on function public.staff_set_role(text, text, text) from public, anon;
grant execute on function public.staff_team() to authenticated;
grant execute on function public.staff_set_role(text, text, text) to authenticated;
