-- Volunteers can withdraw only while their application is still pending.
-- Once the organization approves them, their place is confirmed: they contact the
-- organization instead, and the organization can remove them (approved → rejected),
-- which frees the spot. Everything else in the rules is unchanged.
-- Safe to run more than once (replaces the function; the trigger keeps using it).

create or replace function public.guard_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev       public.events;
  approved integer;
begin
  -- lock the event row so two approvals can't both take the last spot
  select * into ev from public.events where id = new.event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  select count(*) into approved from public.volunteer_applications a
   where a.event_id = new.event_id and a.status = 'approved'
     and a.id <> new.id;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.volunteer_id := auth.uid();
      new.status := 'pending';
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

  if auth.uid() is not null and not public.is_admin() then
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
    else
      raise exception 'Not allowed';
    end if;
  end if;

  if new.status in ('approved', 'pending') and ev.volunteers_needed > 0
     and approved >= ev.volunteers_needed then
    raise exception 'This event already has all the volunteers it needs';
  end if;
  return new;
end $$;
