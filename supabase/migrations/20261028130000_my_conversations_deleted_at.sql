-- KampongShare AI — the messages list after "Delete conversation"
--
--   * my_conversations() also returns my_deleted_at: when *I* deleted the conversation
--     (my side only — never the other side's), so the page can hide it until a newer
--     message arrives. The last-message preview only uses messages after that time,
--     like the messages policy in 20261028120000_conversation_soft_delete.sql.
--   * Nobody can read org_deleted_at / person_deleted_at through the API, so the other
--     side can never find out whether or when you deleted a conversation. The
--     security-definer functions still read them.
-- Paste into Supabase → SQL Editor → Run (once), after 20261028120000_conversation_soft_delete.sql.

begin;

-- the result gets a new column, so the function is replaced, not altered
drop function public.my_conversations();

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
  created_at        timestamptz,
  my_deleted_at     timestamptz
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
             and m.created_at > coalesce(s.last_read, '-infinity'::timestamptz)
             and m.created_at > coalesce(s.deleted, '-infinity'::timestamptz)),
         left(lm.body, 120),
         lm.sender_id = auth.uid(),
         c.last_message_at,
         c.created_at,
         s.deleted
    from public.conversations c
    join public.organizations o on o.id = c.organization_id
    join public.profiles p on p.id = c.person_id
    cross join lateral (
      select case when c.person_id = auth.uid() then 'person' else 'organization' end as side,
             case when c.person_id = auth.uid() then c.person_last_read_at else c.org_last_read_at end as last_read,
             case when c.person_id = auth.uid() then c.person_deleted_at else c.org_deleted_at end as deleted
    ) s
    left join lateral (select m.body, m.sender_id from public.messages m
                        where m.conversation_id = c.id
                          and m.created_at > coalesce(s.deleted, '-infinity'::timestamptz)
                        order by m.created_at desc
                        limit 1) lm on true
   where c.person_id = auth.uid() or o.owner_id = auth.uid()
   order by coalesce(c.last_message_at, c.created_at) desc
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- every column except the two delete times
revoke select on public.conversations from authenticated;
grant select (id, organization_id, person_id, started_by, topic, blocked_by_org, blocked_by_person,
              org_last_read_at, person_last_read_at, last_message_at, created_at)
  on public.conversations to authenticated;

commit;
