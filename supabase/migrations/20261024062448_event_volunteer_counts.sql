-- How many volunteers are approved for each (approved) event, so pages can show
-- "spots left" and "Event full". Returns numbers only — never who applied.
-- Safe to run more than once.

create or replace function public.event_volunteer_counts(event_ids uuid[])
returns table (event_id uuid, approved bigint)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (select count(*) from public.volunteer_applications a
           where a.event_id = e.id and a.status = 'approved')
    from public.events e
   where e.id = any (event_ids)
     and e.approval = 'approved'
$$;

grant execute on function public.event_volunteer_counts(uuid[]) to anon, authenticated;
