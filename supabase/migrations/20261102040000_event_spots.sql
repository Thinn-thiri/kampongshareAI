-- KampongShare AI — public "spots left" for events (used by Pinny's tools and event lists)
--   * returns NUMBERS ONLY (needed, approved, spots left), never who applied
--   * only for events the public can already see: approved events of approved
--     organizations that are upcoming or ongoing
--   * volunteers_needed = 0 means no limit → spots_left is null
-- Call from the browser or a function:
--   supabase.rpc('event_spots', { p_event_ids: ['<id>', '<id>'] })
-- Paste into Supabase → SQL Editor → Run (once).

begin;

create function public.event_spots(p_event_ids uuid[])
returns table (event_id uuid, volunteers_needed integer, approved_count integer, spots_left integer)
language sql stable security definer set search_path = '' as $$
  select e.id,
         e.volunteers_needed,
         (select count(*)::integer from public.volunteer_applications a
           where a.event_id = e.id and a.status = 'approved'),
         case when e.volunteers_needed = 0 then null
              else greatest(e.volunteers_needed -
                     (select count(*)::integer from public.volunteer_applications a
                       where a.event_id = e.id and a.status = 'approved'), 0)
         end
  from public.events e
  where e.id = any (p_event_ids)
    and e.approval = 'approved'
    and public.org_is_approved(e.organization_id)
    and e.status in ('upcoming', 'ongoing')
  limit 100
$$;

grant execute on function public.event_spots(uuid[]) to anon, authenticated;

commit;