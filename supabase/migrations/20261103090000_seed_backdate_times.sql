-- KampongShare AI — let the demo seed backdate step times (scripts/seed.js)
--   The step times (offers: accepted_at, rejected_at, delivered_at, cancelled_at; applications: applied_at,
--   approved_at, rejected_at, withdrawn_at) are set by the database (20261030040000_status_times.sql), and
--   nobody could change them afterwards — not even the service role. The demo seed needs "delivered 30 days
--   ago", so this version keeps a time the SERVICE ROLE writes when the status doesn't change.
--   * Users, organizations and admins (who all use their own login, never the service role key) still can't
--     change any recorded time: for them nothing is different.
--   * The service role key lives only in .env and Netlify's environment (REQUIREMENTS.md 4.5).
-- Paste into Supabase → SQL Editor → Run (once), before running the seed.

begin;

create or replace function public.stamp_offer_times() returns trigger
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
  elsif coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    -- nobody can change the recorded times without a status change (only the seed, with the service role)
    new.accepted_at  := old.accepted_at;
    new.rejected_at  := old.rejected_at;
    new.delivered_at := old.delivered_at;
    new.cancelled_at := old.cancelled_at;
  end if;
  return new;
end $$;

create or replace function public.stamp_application_times() returns trigger
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
  elsif coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    new.applied_at   := old.applied_at;
    new.approved_at  := old.approved_at;
    new.rejected_at  := old.rejected_at;
    new.withdrawn_at := old.withdrawn_at;
  end if;
  return new;
end $$;

commit;
