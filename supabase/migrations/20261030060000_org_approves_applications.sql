-- KampongShare AI — only the event's organization decides on event applications
--   * the admin still approves volunteer ACCOUNTS (profiles.volunteer_approval, unchanged)
--   * approving, rejecting or removing a volunteer for an event is now the organization's job
--     only: admins can no longer change an application's status
--   * also brings back "no withdrawing after approval" (20261024065321_no_withdraw_after_approval.sql),
--     which 20261029040000_deadlines.sql accidentally replaced with the older rule
-- Everything else (event full, event ended, apply again after withdrawing) is unchanged.
-- Paste into Supabase → SQL Editor → Run (once), after 20261030050000_offer_reject_note.sql.
-- Safe to run more than once (replaces the function; the trigger keeps using it).

create or replace function public.guard_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev       public.events;
  approved integer;
  ended    boolean;
begin
  -- lock the event row so two approvals can't both take the last spot
  select * into ev from public.events where id = new.event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  ended := coalesce(ev.ends_at, ev.starts_at) < now();
  select count(*) into approved from public.volunteer_applications a
   where a.event_id = new.event_id and a.status = 'approved'
     and a.id <> new.id;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.volunteer_id := auth.uid();
      new.status := 'pending';
    end if;
    if ended then
      raise exception 'This event has already ended';
    end if;
    if ev.volunteers_needed > 0 and approved >= ev.volunteers_needed then
      raise exception 'This event already has all the volunteers it needs';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.event_id <> old.event_id or new.volunteer_id <> old.volunteer_id then
    raise exception 'Applications cannot be moved to another event or person';
  end if;
  if new.status = old.status then
    return new;
  end if;

  -- auth.uid() is null only for the database itself (e.g. scheduled jobs)
  if auth.uid() is not null then
    if public.owns_event(old.event_id) then
      if not ((old.status = 'pending'  and new.status in ('approved', 'rejected'))
           or (old.status = 'approved' and new.status = 'rejected')) then
        raise exception 'An organization cannot change an application from % to %', old.status, new.status;
      end if;
    elsif auth.uid() = old.volunteer_id then
      if old.status = 'pending' and new.status = 'withdrawn' then
        null;  -- allowed
      elsif old.status = 'approved' and new.status = 'withdrawn' then
        raise exception 'Your place is confirmed, so it can''t be withdrawn here. Please contact the organization if you can''t make it.';
      elsif old.status = 'withdrawn' and new.status = 'pending' then
        if ev.approval <> 'approved' or ev.status not in ('upcoming', 'ongoing') then
          raise exception 'This event is no longer taking volunteers';
        end if;
      else
        raise exception 'You can withdraw a pending application, or apply again after withdrawing';
      end if;
    elsif public.is_admin() then
      raise exception 'Only the event''s organization can approve or reject volunteers for an event';
    else
      raise exception 'Not allowed';
    end if;
  end if;

  if new.status in ('approved', 'pending') and ended then
    raise exception 'This event has already ended';
  end if;
  if new.status in ('approved', 'pending') and ev.volunteers_needed > 0
     and approved >= ev.volunteers_needed then
    raise exception 'This event already has all the volunteers it needs';
  end if;
  return new;
end $$;
