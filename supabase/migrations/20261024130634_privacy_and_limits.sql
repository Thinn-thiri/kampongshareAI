-- Privacy and data-quality fixes from the section 4 review. Safe to run more than once.
--   A1  Organizations see only the minimum about donors / volunteers who offered or applied
--       (name, phone, and — for volunteers — availability, interests, skills) through the
--       profile_contacts view. The profiles table itself is now readable only by the person and admins.
--   A2  Deleting an account keeps that person's past offers for the organization's records,
--       anonymised (donor_id becomes null) instead of deleting them.
--   A3  Text length limits (REQUIREMENTS.md 4.8) are enforced by the database, not just the browser.
--   A4  Visitors (anon) can't read internal columns: admin notes and the owner of an organization.

-- ---------------------------------------------------------------------
-- A1. Minimal contact details for organizations
-- ---------------------------------------------------------------------
drop policy if exists "View own profile, or as admin / receiving organization" on public.profiles;
drop policy if exists "View own profile, or as admin" on public.profiles;
create policy "View own profile, or as admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Runs with the owner's rights, so it filters rows itself with can_view_profile():
-- the person, admins, and organizations that person offered to or applied to.
create or replace view public.profile_contacts as
  select p.id,
         p.full_name,
         p.phone,
         case when p.is_volunteer then p.available_days  else '{}'::text[] end as available_days,
         case when p.is_volunteer then p.available_times else '{}'::text[] end as available_times,
         case when p.is_volunteer then p.interests       else '{}'::text[] end as interests,
         case when p.is_volunteer then p.skills          else '{}'::text[] end as skills
    from public.profiles p
   where public.can_view_profile(p.id);

revoke all on public.profile_contacts from anon, authenticated;
grant select on public.profile_contacts to authenticated;

-- ---------------------------------------------------------------------
-- A2. Keep past offers anonymised when an account is deleted
-- ---------------------------------------------------------------------
alter table public.donation_offers alter column donor_id drop not null;
alter table public.donation_offers drop constraint if exists donation_offers_donor_id_fkey;
alter table public.donation_offers
  add constraint donation_offers_donor_id_fkey
  foreign key (donor_id) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------
-- A3. Length limits (title 100, descriptions 1,000, messages and notes 500)
-- ---------------------------------------------------------------------
do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('profiles',               'full_name',       100),
      ('profiles',               'area',             50),
      ('organizations',          'name',            100),
      ('organizations',          'description',    1000),
      ('organizations',          'address',         200),
      ('organizations',          'admin_note',      500),
      ('donation_requests',      'title',           100),
      ('donation_requests',      'description',    1000),
      ('donation_requests',      'admin_note',      500),
      ('request_items',          'name',            100),
      ('request_items',          'unit',             30),
      ('donation_offers',        'message',         500),
      ('events',                 'title',           100),
      ('events',                 'description',    1000),
      ('events',                 'location_name',   150),
      ('events',                 'outcome_summary', 1000),
      ('events',                 'admin_note',      500),
      ('volunteer_applications', 'message',         500),
      ('volunteer_tasks',        'title',           100),
      ('volunteer_tasks',        'description',     500)
    ) as t(tbl, col, max_len)
  loop
    if not exists (select 1 from pg_constraint
                    where conname = rule.tbl || '_' || rule.col || '_length'
                      and conrelid = ('public.' || rule.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (length(%I) <= %s)',
                     rule.tbl, rule.tbl || '_' || rule.col || '_length', rule.col, rule.max_len);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- A4. Visitors read only the public columns
-- ---------------------------------------------------------------------
revoke select on public.organizations from anon;
grant select (id, name, description, address, postal_code, phone, latitude, longitude, approval, created_at)
  on public.organizations to anon;

revoke select on public.donation_requests from anon;
grant select (id, organization_id, title, description, urgency, deadline, dropoff_instructions,
              status, ai_score, ai_reasons, ai_scored_at, created_at, updated_at)
  on public.donation_requests to anon;

revoke select on public.events from anon;
grant select (id, organization_id, title, description, location_name, latitude, longitude,
              starts_at, ends_at, volunteers_needed, status, outcome_summary, donation_request_id,
              approval, created_at)
  on public.events to anon;

-- Tell the API about the new view and permissions.
notify pgrst, 'reload schema';
