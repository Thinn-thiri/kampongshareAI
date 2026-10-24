-- Organizations: add a postal code, used to place the map pin automatically (OneMap lookup).
-- Safe to run more than once: it skips anything that already exists.

alter table public.organizations
  add column if not exists postal_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_postal_code_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_postal_code_check
      check (postal_code ~ '^[0-9]{6}$');            -- Singapore postal code, same rule as profiles
  end if;
end $$;
