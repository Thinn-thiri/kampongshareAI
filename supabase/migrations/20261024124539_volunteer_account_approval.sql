-- Volunteer accounts need admin approval before they can apply to events.
--   * profiles.volunteer_approval: null (not a volunteer), 'pending', 'approved' or 'rejected'
--   * profiles.volunteer_note: the admin's reason when rejecting
--   * new volunteers, and anyone who turns volunteering on later, start as 'pending'
--   * only admins approve or reject; a rejected volunteer may ask again (rejected → pending)
--   * applying to an event (or applying again) needs an approved volunteer account
--   * volunteers who already existed are approved, so nothing breaks
-- Organizations still approve each event application as before.
-- Safe to run more than once.

alter table public.profiles add column if not exists volunteer_approval public.approval_status;
alter table public.profiles add column if not exists volunteer_note text check (length(volunteer_note) <= 500);

-- Existing volunteers keep working.
update public.profiles set volunteer_approval = 'approved'
 where is_volunteer and volunteer_approval is null;

-- Users may ask again (the guard below decides what's allowed); admins approve / reject.
grant update (volunteer_approval, volunteer_note) on public.profiles to authenticated;

drop policy if exists "Admins review volunteer accounts" on public.profiles;
create policy "Admins review volunteer accounts" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());


-- New sign-ups who want to volunteer start as pending.
create or replace function public.volunteer_approval_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_volunteer and new.volunteer_approval is null then
    new.volunteer_approval := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists profiles_volunteer_approval_insert on public.profiles;
create trigger profiles_volunteer_approval_insert
  before insert on public.profiles
  for each row execute function public.volunteer_approval_on_insert();


-- Who may change the approval, and what turning volunteering on does.
create or replace function public.guard_volunteer_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;  -- server scripts (e.g. the demo seed)
  end if;

  if public.is_admin() and auth.uid() <> old.id then
    -- Admins reviewing someone else: only the volunteer approval and note may change.
    if row(new.full_name, new.phone, new.postal_code, new.area, new.is_donor, new.is_volunteer,
           new.available_days, new.available_times, new.interests, new.skills,
           new.consented_at, new.age_confirmed, new.matching_opt_in)
       is distinct from
       row(old.full_name, old.phone, old.postal_code, old.area, old.is_donor, old.is_volunteer,
           old.available_days, old.available_times, old.interests, old.skills,
           old.consented_at, old.age_confirmed, old.matching_opt_in) then
      raise exception 'Admins can only approve or reject volunteer accounts here';
    end if;
    if new.volunteer_approval = 'rejected' and coalesce(trim(new.volunteer_note), '') = '' then
      raise exception 'Please write a short note so the volunteer knows why';
    end if;
    if new.volunteer_approval = 'approved' then
      new.volunteer_note := null;
    end if;
    return new;
  end if;

  -- The user themselves.
  if new.volunteer_approval is distinct from old.volunteer_approval
     or new.volunteer_note is distinct from old.volunteer_note then
    if not (old.volunteer_approval = 'rejected' and new.volunteer_approval = 'pending'
            and new.volunteer_note is not distinct from old.volunteer_note) then
      raise exception 'Only admins can approve volunteer accounts';
    end if;
  end if;

  -- Turning volunteering on (again) waits for approval, unless already approved before.
  if new.is_volunteer and not old.is_volunteer
     and old.volunteer_approval is distinct from 'approved' then
    new.volunteer_approval := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists profiles_volunteer_approval on public.profiles;
create trigger profiles_volunteer_approval
  before update on public.profiles
  for each row execute function public.guard_volunteer_approval();


-- Applying needs an approved volunteer account.
create or replace function public.can_volunteer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('donor', 'volunteer') and is_volunteer
                          and volunteer_approval = 'approved'
                          and consented_at is not null and age_confirmed
                   from public.profiles where id = auth.uid()), false)
$$;

-- A clear message (instead of a permission error) when applying, or applying again, too early.
create or replace function public.guard_application_volunteer_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  approval public.approval_status;
begin
  if auth.uid() is null or public.is_admin() or auth.uid() <> new.volunteer_id then
    return new;
  end if;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    select volunteer_approval into approval from public.profiles where id = new.volunteer_id;
    if approval is distinct from 'approved' then
      raise exception 'Your volunteer account is waiting for admin approval. You can apply to events once it''s approved.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists volunteer_applications_account_approved on public.volunteer_applications;
create trigger volunteer_applications_account_approved
  before insert or update on public.volunteer_applications
  for each row execute function public.guard_application_volunteer_approved();
