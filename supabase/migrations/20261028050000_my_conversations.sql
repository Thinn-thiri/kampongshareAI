-- KampongShare AI — the messages list in one call
--
-- Organizations can't read the profiles table, and profile_contacts only shows donors who
-- offered and volunteers who applied. Someone who messages an organization first would have
-- no name. my_conversations() returns, for the logged-in user's OWN conversations only:
--   * the other side's name (organization name for individuals, the person's full_name for
--     organizations — nothing else from their profile)
--   * whether the organization is still approved
--   * how many messages from the other side are newer than my last read time
--   * a short preview of the last message
-- Read only: no table, rule or existing function changes. Paste into Supabase → SQL Editor → Run (once).

begin;

create function public.my_conversations()
returns table (
  id                uuid,
  organization_id   uuid,
  topic             text,
  side              text,
  other_name        text,
  org_available     boolean,
  blocked_by_org    boolean,
  blocked_by_person boolean,
  unread            integer,
  last_body         text,
  last_mine         boolean,
  last_message_at   timestamptz,
  created_at        timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id,
         c.organization_id,
         c.topic,
         s.side,
         case when s.side = 'person' then o.name else p.full_name end,
         o.approval = 'approved',
         c.blocked_by_org,
         c.blocked_by_person,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id
             and m.sender_id <> auth.uid()
             and m.created_at > coalesce(case when s.side = 'person' then c.person_last_read_at
                                              else c.org_last_read_at end, '-infinity'::timestamptz)),
         left(lm.body, 120),
         lm.sender_id = auth.uid(),
         c.last_message_at,
         c.created_at
    from public.conversations c
    join public.organizations o on o.id = c.organization_id
    join public.profiles p on p.id = c.person_id
    cross join lateral (select case when c.person_id = auth.uid() then 'person' else 'organization' end as side) s
    left join lateral (select m.body, m.sender_id from public.messages m
                        where m.conversation_id = c.id
                        order by m.created_at desc
                        limit 1) lm on true
   where c.person_id = auth.uid() or o.owner_id = auth.uid()
   order by coalesce(c.last_message_at, c.created_at) desc
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

commit;
