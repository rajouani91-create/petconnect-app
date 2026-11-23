-- Admin-Dashboard, Teil Praxen und Benachrichtigungen: nur Zahlen und Summen (keine Namen, keine Tier- oder Behandlungsdaten).
-- Rein additiv: neue, nur lesende Funktion. Zugriff nur für Admin (private.is_staff('admin')), sonst Fehler 42501.

create or replace function public.staff_dashboard_practice()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz    constant text := 'Europe/Berlin';
  today date := (now() at time zone 'Europe/Berlin')::date;
  d0    date := (now() at time zone 'Europe/Berlin')::date - 29;
  result jsonb;
begin
  if not private.is_staff('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with
  days as (select generate_series(d0, today, interval '1 day')::date as d),
  -- „Praxis-Aktionen“: was Praxen und Halter:innen rund um die Praxis neu anlegen
  pev as (
    select created_at as at from public.practice_entries where created_at >= d0
    union all select created_at from public.practice_appointments where created_at >= d0
    union all select created_at from public.practice_inquiries where created_at >= d0
    union all select offered_at from public.practice_inquiries where offered_at >= d0
    union all select finalized_at from public.practice_invoices where finalized_at >= d0
    union all select sent_at from public.practice_recalls where sent_at >= d0
  ),
  pday as (select (at at time zone tz)::date as d, count(*) as n from pev group by 1),
  nday as (select (created_at at time zone tz)::date as d, count(*) as n from public.notifications where created_at >= d0 group by 1)
  select jsonb_build_object(
    'generated_at', now(),
    'accounts', jsonb_build_object(
      'active',    (select count(*) from public.practice_accounts where status = 'active'),
      'pending',   (select count(*) from public.practice_accounts where status = 'pending'),
      'suspended', (select count(*) from public.practice_accounts where status = 'suspended'),
      'staff',     (select count(*) from public.practice_staff)
    ),
    'patients', jsonb_build_object(
      'total',   (select count(*) from public.pet_practice_access),
      'pets',    (select count(distinct pet_id) from public.pet_practice_access),
      'code',    (select count(*) from public.pet_practice_access where source = 'code'),
      'request', (select count(*) from public.pet_practice_access where source <> 'code')
    ),
    'appointments', jsonb_build_object(
      'total',           (select count(*) from public.practice_appointments),
      'online',          (select count(*) from public.practice_appointments where source = 'online'),
      'phone',           (select count(*) from public.practice_appointments where source = 'phone'),
      'upcoming',        (select count(*) from public.practice_appointments where starts_at > now() and status in ('new', 'confirmed')),
      'new',             (select count(*) from public.practice_appointments where status = 'new'),
      'confirmed',       (select count(*) from public.practice_appointments where status = 'confirmed'),
      'attended',        (select count(*) from public.practice_appointments where status = 'attended'),
      'no_show',         (select count(*) from public.practice_appointments where status = 'no_show'),
      'cancelled_owner', (select count(*) from public.practice_appointments where status = 'cancelled_owner'),
      'cancelled_practice', (select count(*) from public.practice_appointments where status = 'cancelled_practice'),
      'moved_by_owner',  (select count(*) from public.practice_appointments where coalesce(owner_moves, 0) > 0),
      'waitlist',        (select count(*) from public.practice_waitlist where status in ('waiting', 'offered')),
      'recalls',         (select count(*) from public.practice_recalls where sent_at is not null)
    ),
    'entries', jsonb_build_object(
      'finding',     (select count(*) from public.practice_entries where voided_at is null and kind = 'finding'),
      'vital',       (select count(*) from public.practice_entries where voided_at is null and kind in ('weight', 'vital')),
      'medication',  (select count(*) from public.practice_entries where voided_at is null and kind = 'medication'),
      'vaccination', (select count(*) from public.practice_entries where voided_at is null and kind = 'vaccination'),
      'voided',      (select count(*) from public.practice_entries where voided_at is not null)
    ),
    'invoices', jsonb_build_object(
      'count',         (select count(*) from public.practice_invoices where kind = 'invoice' and status in ('open', 'paid')),
      'drafts',        (select count(*) from public.practice_invoices where status = 'draft'),
      'gross',         (select coalesce(sum(gross), 0) from public.practice_invoices where kind = 'invoice' and status in ('open', 'paid')),
      'paid',          (select coalesce(sum(gross), 0) from public.practice_invoices where kind = 'invoice' and status = 'paid'),
      'open',          (select coalesce(sum(gross), 0) from public.practice_invoices where kind = 'invoice' and status = 'open'),
      'cancellations', (select count(*) from public.practice_invoices where kind = 'cancellation')
    ),
    'inquiries', jsonb_build_object(
      'total',      (select count(*) from public.practice_inquiries where origin = 'owner'),
      'open',       (select count(*) from public.practice_inquiries where origin = 'owner' and status <> 'done'),
      'offered',    (select count(*) from public.practice_inquiries where origin = 'owner' and offered_at is not null),
      'booked',     (select count(*) from public.practice_inquiries where booked_appointment_id is not null),
      'declined',   (select count(*) from public.practice_inquiries where offer_declined_at is not null),
      'wished',     (select count(*) from public.practice_inquiries where owner_wish_at is not null),
      'messages',   (select count(*) from public.practice_inquiries where origin = 'practice'),
      'replied_h',  (select round((extract(epoch from percentile_cont(0.5) within group (order by coalesce(replied_at, offered_at) - created_at)) / 3600)::numeric, 1)
                       from public.practice_inquiries where origin = 'owner' and coalesce(replied_at, offered_at) is not null)
    ),
    'notifications', jsonb_build_object(
      'total',       (select count(*) from public.notifications),
      'last_7d',     (select count(*) from public.notifications where created_at > now() - interval '7 days'),
      'read',        (select count(*) from public.notifications where read_at is not null),
      'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.notifications group by category) c), '{}'::jsonb),
      'quick_actions', (select count(*) from private.push_actions where used_at is not null),
      'devices',     (select count(*) from public.push_subscriptions)
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d', d.d, 'practice', coalesce(p.n, 0), 'notifications', coalesce(n.n, 0)) order by d.d)
                          from days d left join pday p on p.d = d.d left join nday n on n.d = d.d), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.staff_dashboard_practice() from public, anon;
grant execute on function public.staff_dashboard_practice() to authenticated;
