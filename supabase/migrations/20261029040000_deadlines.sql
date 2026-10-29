-- KampongShare AI — deadlines and event end times
--   * a request past its deadline takes no NEW offers (offers already made can still be
--     accepted and delivered); deadlines are whole days in Singapore time
--   * an event that has ended (end time, or start time if there's no end time) takes no
--     new volunteer applications or approvals; withdrawing and rejecting still work
--   * public totals no longer count past-deadline requests or ended events
--   * pages use sg_today() and the event times to hide past items from public lists
-- Paste into Supabase → SQL Editor → Run (once).
-- Optional: 20261029050000_deadline_auto_close.sql closes leftovers automatically.

begin;

-- today's date in Singapore (the database clock runs in UTC)
create function public.sg_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Singapore')::date
$$;
grant execute on function public.sg_today() to anon, authenticated;

-- ---------- offers: no new offers after the deadline ----------
create or replace function public.guard_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item      public.request_items;
  req       public.donation_requests;
  remaining integer;
begin
  -- lock the item row so two offers can't both claim the last units
  select * into item from public.request_items where id = new.request_item_id for update;
  if not found then
    raise exception 'Request item not found';
  end if;
  select * into req from public.donation_requests where id = item.request_id;
  remaining := item.quantity_needed - item.quantity_committed;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.donor_id := auth.uid();
      new.status := 'pending';
    end if;
    if req.status <> 'open' then
      raise exception 'This request is not accepting donations right now';
    end if;
    if req.deadline is not null and req.deadline < public.sg_today() then
      raise exception 'The deadline for this request has passed, so it isn''t taking new offers';
    end if;
    if new.quantity > remaining then
      raise exception 'Only % % of "%" still needed', remaining, item.unit, item.name;
    end if;
    if exists (select 1 from public.donation_offers o
               where o.request_item_id = new.request_item_id
                 and o.donor_id = new.donor_id
                 and o.status in ('pending', 'accepted')) then
      raise exception 'You already have an offer for "%". Cancel it first if you want to change the amount.', item.name;
    end if;
    if item.category = 'food' and not new.food_safety_confirmed then
      raise exception 'Please confirm the food is sealed, unopened and not past its expiry date';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.request_item_id <> old.request_item_id
     or new.quantity <> old.quantity
     or new.donor_id <> old.donor_id
     or new.food_safety_confirmed <> old.food_safety_confirmed then
    raise exception 'Offers cannot be edited. Cancel it and make a new one.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  -- automatic rejection of waiting offers once the request is no longer open
  if old.status = 'pending' and new.status = 'rejected' and req.status <> 'open' then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is not null and not public.is_admin() then
    if public.owns_request(item.request_id) then
      if not ((old.status = 'pending'  and new.status in ('accepted', 'rejected'))
           or (old.status = 'accepted' and new.status = 'delivered')) then
        raise exception 'An organization cannot change an offer from % to %', old.status, new.status;
      end if;
    elsif auth.uid() = old.donor_id then
      if not (old.status in ('pending', 'accepted') and new.status = 'cancelled') then
        raise exception 'A donor can only cancel a pending or accepted offer';
      end if;
    else
      raise exception 'Not allowed';
    end if;
  end if;

  if new.status = 'accepted' then
    if req.status <> 'open' then
      raise exception 'Offers can only be accepted while the request is open';
    end if;
    if new.quantity > remaining then
      raise exception 'Cannot accept: only % % of "%" still needed', remaining, item.unit, item.name;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;


-- ---------- volunteer applications: nothing new after the event ends ----------
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

  if auth.uid() is not null and not public.is_admin() then
    if public.owns_event(old.event_id) then
      if not ((old.status = 'pending'  and new.status in ('approved', 'rejected'))
           or (old.status = 'approved' and new.status = 'rejected')) then
        raise exception 'An organization cannot change an application from % to %', old.status, new.status;
      end if;
    elsif auth.uid() = old.volunteer_id then
      if old.status in ('pending', 'approved') and new.status = 'withdrawn' then
        null;  -- allowed
      elsif old.status = 'withdrawn' and new.status = 'pending' then
        if ev.approval <> 'approved' or ev.status not in ('upcoming', 'ongoing') then
          raise exception 'This event is no longer taking volunteers';
        end if;
      else
        raise exception 'You can withdraw your application, or apply again after withdrawing';
      end if;
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


-- ---------- public totals ----------
create or replace function public.public_stats()
returns table (
  items_delivered     bigint,
  completed_donations bigint,
  open_requests       bigint,
  upcoming_events     bigint,
  organizations       bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select coalesce(sum(quantity_received), 0) from public.request_items),
    (select count(*) from public.donation_offers where status = 'delivered'),
    (select count(*) from public.donation_requests
      where status = 'open' and (deadline is null or deadline >= public.sg_today())),
    (select count(*) from public.events
      where approval = 'approved' and status in ('upcoming', 'ongoing')
        and coalesce(ends_at, starts_at) >= now()),
    (select count(*) from public.organizations where approval = 'approved')
$$;

commit;