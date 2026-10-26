-- Anmeldung mit Google: Der Anzeigename kommt aus den Google-Angaben, wenn die Registrierung keinen mitgibt.
-- Die Sprache bleibt wie bisher 'de'; die App setzt sie bei einem neuen Google-Konto auf die gewählte Sprache.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    left(nullif(btrim(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    )), ''), 60),
    coalesce(new.raw_user_meta_data->>'language', 'de')
  );
  return new;
end;
$$;
