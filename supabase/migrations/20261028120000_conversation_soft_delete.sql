-- KampongShare AI — "Delete conversation" for one side only (soft delete)
--   * deleting hides the conversation and all its messages up to that moment
--     for YOU only; the other side keeps their copy
--   * nothing is removed from the database (kept for 12 months and for safety reports)
--   * if the other side sends a new message, the conversation comes back for you,
--     showing only messages sent after you deleted it
--   * reported messages stay visible to admins
-- Paste into Supabase → SQL Editor → Run (once), after 20261028040000_messaging.sql.

begin;

alter table public.conversations
  add column org_deleted_at    timestamptz,
  add column person_deleted_at timestamptz;

-- when did I (the current user) delete this conversation? null = never
create function public.my_conversation_deleted_at(conv_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case
    when c.person_id = auth.uid() then c.person_deleted_at
    when o.owner_id = auth.uid() then c.org_deleted_at
  end
  from public.conversations c join public.organizations o on o.id = c.organization_id
  where c.id = conv_id
$$;

-- delete for me: hide everything up to now, and count it as read
create function public.delete_conversation_for_me(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  side text := public.conversation_side(p_conversation_id);
begin
  if side = 'organization' then
    update public.conversations
       set org_deleted_at = now(), org_last_read_at = now()
     where id = p_conversation_id;
  elsif side = 'person' then
    update public.conversations
       set person_deleted_at = now(), person_last_read_at = now()
     where id = p_conversation_id;
  else
    raise exception 'Conversation not found';
  end if;
end $$;

revoke execute on function public.delete_conversation_for_me(uuid) from public, anon;
grant execute on function public.delete_conversation_for_me(uuid) to authenticated;

-- messages: participants only see messages sent after they last deleted the conversation
drop policy "Participants or admins (if reported) view messages" on public.messages;
create policy "Participants (since deleting) or admins (if reported) see msgs"
  on public.messages for select to authenticated
  using ((public.is_conversation_participant(conversation_id)
          and (public.my_conversation_deleted_at(conversation_id) is null
               or created_at > public.my_conversation_deleted_at(conversation_id)))
         or (public.is_admin() and public.message_is_reported(id)));

commit;