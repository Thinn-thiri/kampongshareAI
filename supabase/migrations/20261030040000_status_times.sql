-- KampongShare AI — record WHEN each step happened (for the tracking timeline)
--   Offers:       accepted_at, rejected_at, delivered_at, cancelled_at
--   Applications: applied_at, approved_at, rejected_at, withdrawn_at
-- The database fills these in automatically when the status changes; nobody can
-- write them from the browser.
-- Older records: the best available time is copied in where it's known (see below);
-- steps whose time was never recorded stay empty, and the page shows just the step.
-- Paste into Supabase → SQL Editor → Run (once).

begin;

-- ---------- offers ----------
alter table public.donation_offers
  add column accepted_at  timestamptz,
  add column rejected_at  timestamptz,
  add column delivered_at timestamptz,
  add column cancelled_at timestamptz;

-- older offers: the last status change is the only time we know
update public.donation_offers set accepted_at  = updated_at where status = 'accepted';
update public.donation_offers set rejected_at  = updated_at where status = 'rejected';
update public.donation_offers set delivered_at = updated_at where status = 'delivered';
update public.donation_offers set cancelled_at = updated_at where status = 'cancelled';

create function public.stamp_offer_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'accepted'  then new.accepted_at  := now();
      when 'rejected'  then new.rejected_at  := now();
      when 'delivered' then new.delivered_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  else
    -- nobody can change the recorded times without a status change
    new.accepted_at  := old.accepted_at;
    new.rejected_at  := old.rejected_at;
    new.delivered_at := old.delivered_at;
    new.cancelled_at := old.cancelled_at;
  end if;
  return new;
end $$;

-- runs after the existing offer rules (triggers run in name order: guard, then stamp)
create trigger donation_offers_stamp_times
  before update on public.donation_offers
  for each row execute function public.stamp_offer_times();

-- ---------- volunteer applications ----------
alter table public.volunteer_applications
  add column applied_at   timestamptz not null default now(),
  add column approved_at  timestamptz,
  add column rejected_at  timestamptz,
  add column withdrawn_at timestamptz;

update public.volunteer_applications set applied_at = created_at;

create function public.stamp_application_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.applied_at := now();
    new.approved_at := null;
    new.rejected_at := null;
    new.withdrawn_at := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'approved'  then new.approved_at  := now();
      when 'rejected'  then new.rejected_at  := now();
      when 'withdrawn' then new.withdrawn_at := now();
      when 'pending'   then                 -- applied again after withdrawing
        new.applied_at   := now();
        new.approved_at  := null;
        new.rejected_at  := null;
        new.withdrawn_at := null;
      else null;
    end case;
  else
    new.applied_at   := old.applied_at;
    new.approved_at  := old.approved_at;
    new.rejected_at  := old.rejected_at;
    new.withdrawn_at := old.withdrawn_at;
  end if;
  return new;
end $$;

create trigger volunteer_applications_stamp_times
  before insert or update on public.volunteer_applications
  for each row execute function public.stamp_application_times();

commit;