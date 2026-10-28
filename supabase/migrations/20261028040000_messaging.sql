-- KampongShare AI — private messaging (organization as the hub)
--
-- Who can message whom:
--   * a donor or volunteer (individual account with consent) → any APPROVED organization
--     (max 5 new conversations per 24 hours)
--   * an organization → only donors who made an offer on its requests, and only
--     volunteers who applied to its events
--   * donors and volunteers never message each other; visitors can't message
-- Privacy and safety:
--   * only the two sides of a conversation can read it
--   * admins can read a message only after one side REPORTS it
--   * either side can block the conversation (no new messages from either side)
--   * text only, 1–1000 characters, max 20 messages per 5 minutes per sender
--   * messages can't be edited or deleted (history kept, see privacy.html)
-- Paste into Supabase → SQL Editor → Run (once).

begin;

-- ---------- tables ----------
create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  person_id           uuid not null references public.profiles (id) on delete cascade,
  started_by          uuid not null references public.profiles (id) on delete cascade,
  topic               text check (length(topic) <= 150),   -- e.g. "Your offer: 8 bags of Rice 5kg"
  blocked_by_org      boolean not null default false,
  blocked_by_person   boolean not null default false,
  org_last_read_at    timestamptz,
  person_last_read_at timestamptz,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  unique (organization_id, person_id)                       -- one conversation per pair
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body            text not null check (length(body) between 1 and 1000),
  created_at      timestamptz not null default now()
);

create table public.message_reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason      text not null check (length(reason) between 1 and 300),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index on public.conversations (organization_id);
create index on public.conversations (person_id);
create index on public.messages (conversation_id, created_at);
create index on public.messages (sender_id, created_at);
create index on public.message_reports (message_id);

-- ---------- helpers ----------
create function public.conversation_side(conv_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.person_id = auth.uid() then 'person'
    when o.owner_id = auth.uid() then 'organization'
  end
  from public.conversations c join public.organizations o on o.id = c.organization_id
  where c.id = conv_id
$$;

create function public.is_conversation_participant(conv_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.conversation_side(conv_id) is not null
$$;

create function public.message_is_reported(msg_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_reports r where r.message_id = msg_id)
$$;

create function public.conversation_has_report(conv_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_reports r
                 join public.messages m on m.id = r.message_id
                 where m.conversation_id = conv_id)
$$;

-- is this person related to this organization (offered on its requests or applied to its events)?
create function public.person_related_to_org(org_id uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.donation_offers o
                 join public.request_items i on i.id = o.request_item_id
                 join public.donation_requests r on r.id = i.request_id
                 where r.organization_id = org_id and o.donor_id = pid)
      or exists (select 1 from public.volunteer_applications a
                 join public.events e on e.id = a.event_id
                 where e.organization_id = org_id and a.volunteer_id = pid)
$$;

-- ---------- starting a conversation (the ONLY way to create one) ----------
-- Individuals:   start_conversation(org_id)                → with that organization
-- Organizations: start_conversation(org_id, person_id)     → with a related donor/volunteer
-- Optional topic, e.g. "Your offer: 8 bags of Rice 5kg". Returns the conversation id
-- (the existing one if this pair already has a conversation).
create function public.start_conversation(p_org_id uuid, p_person_id uuid default null,
                                          p_topic text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me        public.profiles;
  org       public.organizations;
  pid       uuid;
  conv_id   uuid;
  recent    integer;
begin
  if auth.uid() is null then
    raise exception 'Please log in to send messages';
  end if;
  select * into me from public.profiles where id = auth.uid();
  select * into org from public.organizations where id = p_org_id;
  if not found or org.approval <> 'approved' then
    raise exception 'This organization isn''t available for messages';
  end if;

  if org.owner_id = auth.uid() then
    -- organization starts a conversation with a related donor or volunteer
    pid := p_person_id;
    if pid is null or not public.person_related_to_org(p_org_id, pid) then
      raise exception 'You can only message donors who offered on your requests or volunteers who applied to your events';
    end if;
  elsif me.role in ('donor', 'volunteer') then
    -- individual starts a conversation with an organization
    if p_person_id is not null and p_person_id <> auth.uid() then
      raise exception 'You can only message organizations';
    end if;
    if me.consented_at is null or not me.age_confirmed then
      raise exception 'Please give your privacy consent in your profile before sending messages';
    end if;
    pid := auth.uid();
  else
    raise exception 'Your account can''t start conversations';
  end if;

  select id into conv_id from public.conversations
   where organization_id = p_org_id and person_id = pid;
  if conv_id is not null then
    return conv_id;
  end if;

  if org.owner_id <> auth.uid() then
    select count(*) into recent from public.conversations
     where started_by = auth.uid() and created_at > now() - interval '24 hours';
    if recent >= 5 then
      raise exception 'You''ve started a lot of new conversations today. Please try again tomorrow.';
    end if;
  end if;

  insert into public.conversations (organization_id, person_id, started_by, topic)
  values (p_org_id, pid, auth.uid(), nullif(left(trim(p_topic), 150), ''))
  returning id into conv_id;
  return conv_id;
end $$;

-- ---------- block / unblock (your own side only) ----------
create function public.set_conversation_blocked(p_conversation_id uuid, p_blocked boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  side text := public.conversation_side(p_conversation_id);
begin
  if side = 'organization' then
    update public.conversations set blocked_by_org = p_blocked where id = p_conversation_id;
  elsif side = 'person' then
    update public.conversations set blocked_by_person = p_blocked where id = p_conversation_id;
  else
    raise exception 'Conversation not found';
  end if;
end $$;

-- ---------- mark as read (your own side only) ----------
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  side text := public.conversation_side(p_conversation_id);
begin
  if side = 'organization' then
    update public.conversations set org_last_read_at = now() where id = p_conversation_id;
  elsif side = 'person' then
    update public.conversations set person_last_read_at = now() where id = p_conversation_id;
  else
    raise exception 'Conversation not found';
  end if;
end $$;

-- ---------- sending rules ----------
create function public.guard_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  conv   public.conversations;
  sent   integer;
begin
  new.sender_id := auth.uid();
  new.body := trim(new.body);
  if new.body = '' then
    raise exception 'Please type a message';
  end if;

  select * into conv from public.conversations where id = new.conversation_id;
  if not found or public.conversation_side(new.conversation_id) is null then
    raise exception 'Conversation not found';
  end if;
  if conv.blocked_by_org or conv.blocked_by_person then
    raise exception 'This conversation is blocked, so no new messages can be sent';
  end if;
  if not public.org_is_approved(conv.organization_id) then
    raise exception 'This organization isn''t available for messages';
  end if;

  select count(*) into sent from public.messages
   where sender_id = auth.uid() and created_at > now() - interval '5 minutes';
  if sent >= 20 then
    raise exception 'You''re sending messages very quickly. Please wait a few minutes.';
  end if;

  new.created_at := now();
  return new;
end $$;

create trigger messages_guard
  before insert on public.messages
  for each row execute function public.guard_message();

create function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end $$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------- reporting rules ----------
create function public.guard_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  msg public.messages;
begin
  if tg_op = 'INSERT' then
    new.reporter_id := auth.uid();
    new.status := 'open';
    new.reason := trim(new.reason);
    select * into msg from public.messages where id = new.message_id;
    if not found or not public.is_conversation_participant(msg.conversation_id) then
      raise exception 'Message not found';
    end if;
    if msg.sender_id = auth.uid() then
      raise exception 'You can''t report your own message';
    end if;
  end if;
  return new;
end $$;

create trigger message_reports_guard
  before insert on public.message_reports
  for each row execute function public.guard_report();

-- ---------- permissions ----------
-- Supabase gives new tables full access by default; take it away, then grant only what's needed.
revoke all on public.conversations, public.messages, public.message_reports from anon, authenticated;
grant select on public.conversations to authenticated;
grant select, insert (conversation_id, body) on public.messages to authenticated;
grant select, insert (message_id, reason), update (status) on public.message_reports to authenticated;

revoke execute on function public.start_conversation(uuid, uuid, text) from public, anon;
revoke execute on function public.set_conversation_blocked(uuid, boolean) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.start_conversation(uuid, uuid, text) to authenticated;
grant execute on function public.set_conversation_blocked(uuid, boolean) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.message_reports enable row level security;

create policy "Participants or admins (if reported) view conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_participant(id)
         or (public.is_admin() and public.conversation_has_report(id)));

create policy "Participants or admins (if reported) view messages"
  on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id)
         or (public.is_admin() and public.message_is_reported(id)));

create policy "Participants send messages"
  on public.messages for insert to authenticated
  with check (public.is_conversation_participant(conversation_id));

create policy "Reporters and admins view reports"
  on public.message_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

create policy "Participants report messages"
  on public.message_reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "Admins resolve reports"
  on public.message_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- live updates (new messages appear instantly) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.conversations;
  end if;
end $$;

commit;