-- Zugriffsrechte wie bei `weights`: nur angemeldete Nutzer, ohne Sonderrechte wie TRUNCATE.
revoke all on public.vital_values from anon, authenticated;
grant select, insert, update, delete on public.vital_values to authenticated;
