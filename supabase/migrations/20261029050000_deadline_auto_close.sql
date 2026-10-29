-- KampongShare AI — OPTIONAL: close leftovers automatically, once a day
--   * open requests 7 days past their deadline → closed ("Deadline passed");
--     their waiting offers become "Request closed" automatically
--   * upcoming / ongoing events that ended 3 days ago → completed
-- Before running: Supabase → Database → Extensions → turn on "pg_cron".
-- Paste into Supabase → SQL Editor → Run (once), after 20261029040000_deadlines.sql.
-- To stop it later: select cron.unschedule('kampongshare-auto-close');

begin;

create or replace function public.auto_close_expired()
returns table (requests_closed integer, events_completed integer)
language plpgsql security definer set search_path = '' as $$
declare
  r integer;
  e integer;
begin
  update public.donation_requests
     set status = 'closed', close_reason = 'Deadline passed'
   where status = 'open'
     and deadline is not null
     and deadline < public.sg_today() - 7;
  get diagnostics r = row_count;

  update public.events
     set status = 'completed'
   where status in ('upcoming', 'ongoing')
     and coalesce(ends_at, starts_at) < now() - interval '3 days';
  get diagnostics e = row_count;

  return query select r, e;
end $$;

-- only the database itself (the scheduler) may run it
revoke execute on function public.auto_close_expired() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- every day at 2:00 am Singapore time (18:00 UTC)
    if exists (select 1 from cron.job where jobname = 'kampongshare-auto-close') then
      perform cron.unschedule('kampongshare-auto-close');
    end if;
    perform cron.schedule('kampongshare-auto-close', '0 18 * * *',
                          'select public.auto_close_expired()');
  else
    raise notice 'pg_cron is not turned on, so nothing was scheduled. Turn on pg_cron (Database → Extensions) and run this file again.';
  end if;
end $$;

commit;