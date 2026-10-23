-- =====================================================================
-- KampongShare AI — Supabase database schema
--
-- How to use: Supabase dashboard → SQL Editor → New query →
-- paste this whole file → Run. Run it once on a fresh project.
--
-- Flow supported:
--   Organization posts a request (with items) → admin approves →
--   AI score/reasons are written by your server function →
--   donor offers against ONE request item (never more than still needed) →
--   organization accepts / rejects → marks delivered →
--   request becomes "fulfilled" automatically when everything is received.
--   Organizations need admin approval before they can post requests or events.
--   Events also need admin approval before they appear publicly or can be shared.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------
create type public.user_role          as enum ('donor', 'organization', 'volunteer', 'admin');
create type public.urgency_level      as enum ('low', 'medium', 'high', 'critical');
create type public.request_status     as enum ('pending_approval', 'open', 'fulfilled', 'closed', 'rejected');
create type public.item_category      as enum ('food', 'clothing', 'hygiene', 'household', 'baby', 'education', 'other');
create type public.offer_status       as enum ('pending', 'accepted', 'rejected', 'delivered', 'cancelled');
create type public.event_status       as enum ('upcoming', 'ongoing', 'completed', 'cancelled');
create type public.application_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.task_status        as enum ('todo', 'in_progress', 'done');
create type public.approval_status    as enum ('pending', 'approved', 'rejected');


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- One profile per signed-up user (created automatically, see section 4).
-- Email and password live in Supabase's auth.users, not here.
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  phone           text,
  role            public.user_role not null default 'donor',  -- account type; for individuals, the dashboard that opens first
  is_donor        boolean not null default false,  -- individual accounts: can make donation offers
  is_volunteer    boolean not null default false,  -- individual accounts: can apply to volunteer
  -- Everyone: where they are, for "near you" matching
  postal_code     text check (postal_code ~ '^[0-9]{6}$'),   -- Singapore postal code
  area            text,                                       -- e.g. 'Tampines', 'Jurong West'
  -- Volunteers: used by AI volunteer matching
  available_days  text[] not null default '{}'
                  check (available_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  available_times text[] not null default '{}'
                  check (available_times <@ array['morning','afternoon','evening']),
  interests       text[] not null default '{}',   -- e.g. {'food distribution','elderly care'}
  skills          text[] not null default '{}',   -- e.g. {'driving','first aid'}
  -- Consent (PDPA): needed before donating or volunteering
  consented_at    timestamptz,                      -- when they agreed to the Privacy Notice (null = not given / withdrawn)
  age_confirmed   boolean not null default false,   -- confirmed 18 or older
  matching_opt_in boolean not null default false,   -- volunteers: allow AI to use availability/interests/skills
  created_at      timestamptz not null default now()
);

-- Each organization account owns exactly one organization.
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique default auth.uid()
              references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  address     text,
  phone       text,
  latitude    double precision check (latitude  between -90  and 90),
  longitude   double precision check (longitude between -180 and 180),
  approval    public.approval_status not null default 'pending',  -- admin must approve before it can post
  admin_note  text,                                               -- e.g. reason for rejection
  created_at  timestamptz not null default now()
);

create table public.donation_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  description     text,
  urgency         public.urgency_level not null default 'medium',   -- what the organization says
  deadline        date,
  dropoff_instructions text check (length(dropoff_instructions) <= 500),  -- where / when donors bring items
  status          public.request_status not null default 'pending_approval',
  admin_note      text,                                              -- e.g. reason for rejection
  ai_score        smallint check (ai_score between 0 and 100),       -- written by your server function
  ai_reasons      text,
  ai_scored_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The individual items inside a request (rice, cooking oil, diapers...).
-- quantity_committed / quantity_received are maintained automatically.
create table public.request_items (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.donation_requests (id) on delete cascade,
  name               text not null,
  category           public.item_category not null default 'other',
  unit               text not null default 'pcs',
  quantity_needed    integer not null check (quantity_needed > 0),
  quantity_committed integer not null default 0,   -- accepted + delivered offers
  quantity_received  integer not null default 0,   -- delivered offers
  quantity_remaining integer generated always as (quantity_needed - quantity_committed) stored,
  constraint committed_within_needed check (quantity_committed between 0 and quantity_needed),
  constraint received_within_committed check (quantity_received between 0 and quantity_committed)
);

-- A donor's offer is always for ONE specific request item.
create table public.donation_offers (
  id              uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.request_items (id) on delete restrict,
  donor_id        uuid not null default auth.uid()
                  references public.profiles (id) on delete cascade,
  quantity        integer not null check (quantity > 0),
  message         text,
  food_safety_confirmed boolean not null default false,  -- required for food items
  status          public.offer_status not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  title             text not null,
  description       text,
  location_name     text,
  latitude          double precision not null check (latitude  between -90  and 90),
  longitude         double precision not null check (longitude between -180 and 180),
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  volunteers_needed integer not null default 0 check (volunteers_needed >= 0),
  status            public.event_status not null default 'upcoming',
  outcome_summary   text,                       -- recorded when the event is closed
  donation_request_id uuid references public.donation_requests (id) on delete set null,
                                                -- optional: the request the "Donate" link opens
  approval          public.approval_status not null default 'pending',  -- admin must approve before it is public
  admin_note        text,                       -- e.g. reason for rejection
  created_at        timestamptz not null default now(),
  constraint ends_after_start check (ends_at is null or ends_at >= starts_at)
);

create table public.volunteer_applications (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  volunteer_id uuid not null default auth.uid()
               references public.profiles (id) on delete cascade,
  message      text,
  status       public.application_status not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (event_id, volunteer_id)
);

create table public.volunteer_tasks (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  description  text,
  due_at       timestamptz,
  status       public.task_status not null default 'todo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.donation_requests (organization_id);
create index on public.donation_requests (status);
create index on public.request_items (request_id);
create index on public.donation_offers (request_item_id);
create index on public.donation_offers (donor_id);
-- one active (pending or accepted) offer per donor per item
create unique index donation_offers_one_active
  on public.donation_offers (request_item_id, donor_id)
  where status in ('pending', 'accepted');
create index on public.events (organization_id);
create index on public.events (approval);
create index on public.volunteer_applications (event_id);
create index on public.volunteer_applications (volunteer_id);
create index on public.volunteer_tasks (event_id);
create index on public.volunteer_tasks (volunteer_id);


-- ---------------------------------------------------------------------
-- 3. Helper functions (used by the access rules below)
-- ---------------------------------------------------------------------
create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- An individual account (role 'donor' or 'volunteer') can have donating,
-- volunteering, or both turned on. profiles.role is just the dashboard
-- that opens first after login. Both also need the privacy consent and
-- the 18+ confirmation.
create function public.can_donate() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('donor', 'volunteer') and is_donor
                          and consented_at is not null and age_confirmed
                   from public.profiles where id = auth.uid()), false)
$$;

create function public.can_volunteer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('donor', 'volunteer') and is_volunteer
                          and consented_at is not null and age_confirmed
                   from public.profiles where id = auth.uid()), false)
$$;

create function public.owns_org(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations
                 where id = org_id and owner_id = auth.uid())
$$;

-- true when the organization has been approved by an admin
create function public.org_is_approved(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations
                 where id = org_id and approval = 'approved')
$$;

create function public.owns_request(req_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.donation_requests r
                 join public.organizations o on o.id = r.organization_id
                 where r.id = req_id and o.owner_id = auth.uid())
$$;

create function public.owns_item(item_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.request_items i
                 join public.donation_requests r on r.id = i.request_id
                 join public.organizations o on o.id = r.organization_id
                 where i.id = item_id and o.owner_id = auth.uid())
$$;

create function public.owns_event(ev_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e
                 join public.organizations o on o.id = e.organization_id
                 where e.id = ev_id and o.owner_id = auth.uid())
$$;

-- Personal details (phone, postal code...) are visible only to:
-- the person, admins, and an organization that person has
-- made an offer to or applied to volunteer with.
create function public.can_view_profile(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pid = auth.uid()
      or public.is_admin()
      or exists (select 1 from public.donation_offers o
                 join public.request_items i     on i.id = o.request_item_id
                 join public.donation_requests r on r.id = i.request_id
                 join public.organizations org   on org.id = r.organization_id
                 where o.donor_id = pid and org.owner_id = auth.uid())
      or exists (select 1 from public.volunteer_applications a
                 join public.events e          on e.id = a.event_id
                 join public.organizations org on org.id = e.organization_id
                 where a.volunteer_id = pid and org.owner_id = auth.uid())
$$;


-- Totals for the public home page. Returns only counts — never who gave what.
-- Call from the browser: supabase.rpc('public_stats').single()
create function public.public_stats()
returns table (
  items_delivered     bigint,   -- total units received by organizations
  completed_donations bigint,   -- offers marked delivered
  open_requests       bigint,
  upcoming_events     bigint,   -- approved, upcoming or ongoing
  organizations       bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select coalesce(sum(quantity_received), 0) from public.request_items),
    (select count(*) from public.donation_offers where status = 'delivered'),
    (select count(*) from public.donation_requests where status = 'open'),
    (select count(*) from public.events
      where approval = 'approved' and status in ('upcoming', 'ongoing')),
    (select count(*) from public.organizations where approval = 'approved')
$$;

grant execute on function public.public_stats() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Automatic behaviour (triggers)
-- ---------------------------------------------------------------------

-- 4a. Create a profile when someone signs up.
-- In your sign-up code pass the details in options.data, for example:
--   supabase.auth.signUp({ email, password, options: { data: {
--     full_name: 'Siti', roles: ['donor', 'volunteer'], phone: '91234567',
--     postal_code: '520123', area: 'Tampines',
--     available_days: ['sat','sun'], available_times: ['morning'],
--     interests: ['food distribution'], skills: ['driving'],
--     privacy_consent: true, age_confirmed: true, matching_opt_in: true } } })
-- Individuals: roles can be ['donor'], ['volunteer'] or both.
-- Organizations: pass role: 'organization' instead.
-- (A single role: 'donor' or role: 'volunteer' also works.)
-- privacy_consent and age_confirmed are needed before the account can donate
-- or volunteer (they can also be given later on the profile page).
-- matching_opt_in only applies to volunteers.
-- Nobody can sign up as admin. Unknown days/times are ignored;
-- an invalid postal code is left empty.

-- turns a JSON list from sign-up into a text array (empty if missing)
create function public.json_text_array(j jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'array'
              then array(select lower(trim(x)) from jsonb_array_elements_text(j) as x
                         where trim(x) <> '')
              else '{}'::text[] end
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta       jsonb  := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested  text   := lower(trim(meta ->> 'role'));
  roles      text[] := public.json_text_array(meta -> 'roles');
  postal     text   := trim(meta ->> 'postal_code');
  main_role  public.user_role;
  want_donor boolean;
  want_vol   boolean;
  consent    boolean := lower(coalesce(meta ->> 'privacy_consent', '')) = 'true';
begin
  if requested = 'organization' then
    main_role := 'organization';
    want_donor := false;
    want_vol := false;
  else
    if cardinality(roles) > 0 then
      want_donor := 'donor' = any (roles);
      want_vol   := 'volunteer' = any (roles);
    else
      want_vol   := coalesce(requested = 'volunteer', false);
      want_donor := not want_vol;
    end if;
    if not want_donor and not want_vol then
      want_donor := true;                       -- nothing valid chosen: donor
    end if;
    main_role := case
      when requested = 'volunteer' and want_vol then 'volunteer'
      when want_donor then 'donor'
      else 'volunteer' end;
  end if;

  insert into public.profiles
    (id, full_name, role, is_donor, is_volunteer, phone, postal_code, area,
     available_days, available_times, interests, skills,
     consented_at, age_confirmed, matching_opt_in)
  values (
    new.id,
    coalesce(meta ->> 'full_name', ''),
    main_role,
    want_donor,
    want_vol,
    nullif(trim(meta ->> 'phone'), ''),
    case when postal ~ '^[0-9]{6}$' then postal end,
    nullif(trim(meta ->> 'area'), ''),
    array(select d from unnest(public.json_text_array(meta -> 'available_days')) d
          where d = any (array['mon','tue','wed','thu','fri','sat','sun'])),
    array(select t from unnest(public.json_text_array(meta -> 'available_times')) t
          where t = any (array['morning','afternoon','evening'])),
    public.json_text_array(meta -> 'interests'),
    public.json_text_array(meta -> 'skills'),
    case when consent then now() end,
    lower(coalesce(meta ->> 'age_confirmed', '')) = 'true',
    want_vol and consent and lower(coalesce(meta ->> 'matching_opt_in', '')) = 'true'
  );
  return new;
end $$;


create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 4b. Request rules:
--   * only admins approve/reject or write the admin note
--   * organizations may only close their own request
--   * after approval, organizations can only change the deadline, urgency
--     and item quantities (title and description are locked)
--   * "fulfilled" is set automatically when every item has been received
--   * editing the request clears the AI score so it gets re-scored
create function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.admin_note is distinct from old.admin_note then
      raise exception 'Only admins can set the admin note';
    end if;

    if old.status <> 'pending_approval'
       and row(new.title, new.description) is distinct from row(old.title, old.description) then
      raise exception 'After approval you can only change the deadline, urgency and item quantities. To change anything else, close this request and post a new one.';
    end if;

    if new.status is distinct from old.status and not (
         (old.status in ('pending_approval', 'open') and new.status = 'closed')
      or (old.status = 'open' and new.status = 'fulfilled'
          and not exists (select 1 from public.request_items i
                          where i.request_id = new.id
                            and i.quantity_received < i.quantity_needed))
    ) then
      raise exception 'You cannot change this request from % to %', old.status, new.status;
    end if;
  end if;

  if row(new.title, new.description, new.urgency, new.deadline)
     is distinct from row(old.title, old.description, old.urgency, old.deadline) then
    new.ai_score := null;
    new.ai_reasons := null;
    new.ai_scored_at := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger donation_requests_guard
  before update on public.donation_requests
  for each row execute function public.guard_request_update();


-- 4c. Item rules: after a request is approved, organizations can change an
-- item's quantity but cannot add, remove, rename or re-categorise items.
-- (The quantity can never go below what has already been accepted.)
create function public.guard_request_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  req_status public.request_status;
begin
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;

  select status into req_status from public.donation_requests
   where id = coalesce(new.request_id, old.request_id);

  -- request already deleted (items removed with it) or still waiting for approval
  if req_status is null or req_status = 'pending_approval' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' or tg_op = 'DELETE' then
    raise exception 'Items can''t be added or removed after approval. You can still change quantities, or close this request and post a new one.';
  end if;

  if new.request_id <> old.request_id
     or row(new.name, new.category, new.unit) is distinct from row(old.name, old.category, old.unit) then
    raise exception 'After approval you can only change an item''s quantity.';
  end if;

  return new;
end $$;

create trigger request_items_guard
  before insert or update or delete on public.request_items
  for each row execute function public.guard_request_item();


-- 4d. Changing a request's items also clears its AI score.
create function public.reset_request_ai_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.donation_requests
     set ai_score = null, ai_reasons = null, ai_scored_at = null
   where id = coalesce(new.request_id, old.request_id)
     and ai_score is not null;
  return null;
end $$;

create trigger request_items_reset_ai
  after insert or delete or update of name, category, quantity_needed
  on public.request_items
  for each row execute function public.reset_request_ai_score();


-- 4e. Offer rules:
--   * only open requests accept offers, and offers can only be accepted while open
--   * a donor can never offer (or have accepted) more than is still needed
--   * one active (pending or accepted) offer per donor per item
--   * food offers need the food safety confirmation
--   * organization: pending → accepted/rejected, accepted → delivered
--   * donor: pending/accepted → cancelled
--   * when a request stops being open, its pending offers are rejected automatically
--   * item and quantity can't be edited after the offer is made
create function public.guard_offer() returns trigger
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

create trigger donation_offers_guard
  before insert or update on public.donation_offers
  for each row execute function public.guard_offer();


-- 4f. When a request is closed, fulfilled or rejected, reject its waiting offers.
-- Accepted offers carry on, so promised items can still be delivered.
create function public.reject_waiting_offers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    update public.donation_offers o
       set status = 'rejected'
      from public.request_items i
     where o.request_item_id = i.id
       and i.request_id = new.id
       and o.status = 'pending';
  end if;
  return null;
end $$;

create trigger donation_requests_reject_waiting_offers
  after update of status on public.donation_requests
  for each row execute function public.reject_waiting_offers();


-- 4g. Keep item totals in sync and mark the request fulfilled when done.
create function public.sync_item_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  req_id uuid;
begin
  update public.request_items i set
    quantity_committed = coalesce((select sum(o.quantity) from public.donation_offers o
                                   where o.request_item_id = i.id
                                     and o.status in ('accepted', 'delivered')), 0),
    quantity_received  = coalesce((select sum(o.quantity) from public.donation_offers o
                                   where o.request_item_id = i.id
                                     and o.status = 'delivered'), 0)
  where i.id = coalesce(new.request_item_id, old.request_item_id)
  returning i.request_id into req_id;

  update public.donation_requests r
     set status = 'fulfilled'
   where r.id = req_id
     and r.status = 'open'
     and not exists (select 1 from public.request_items i
                     where i.request_id = r.id
                       and i.quantity_received < i.quantity_needed);
  return null;
end $$;

create trigger donation_offers_sync
  after update of status or delete on public.donation_offers
  for each row execute function public.sync_item_totals();


-- 4h. Organization rules:
--   * new organizations start as 'pending' until an admin approves them
--   * only admins approve / reject organizations or write the admin note
--   * the name is locked once approved (other details can still change)
create function public.guard_organization() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.approval := 'pending';
      new.admin_note := null;
    elsif new.approval is distinct from old.approval
       or new.admin_note is distinct from old.admin_note then
      raise exception 'Only admins can approve or reject organizations';
    elsif old.approval = 'approved' and new.name is distinct from old.name then
      raise exception 'Your organization name can''t be changed after approval. Please contact the admin.';
    end if;
  end if;
  return new;
end $$;

create trigger organizations_guard
  before insert or update on public.organizations
  for each row execute function public.guard_organization();


-- 4i. Event rules:
--   * only admins approve / reject events or write the admin note
--   * changing what the public sees (title, place, time...) after approval
--     sends the event back for approval, so nothing unchecked gets shared
--   * a linked donation request must belong to the same organization
create function public.guard_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.donation_request_id is not null and not exists (
       select 1 from public.donation_requests r
       where r.id = new.donation_request_id
         and r.organization_id = new.organization_id) then
    raise exception 'The linked donation request must belong to your organization';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin() then
      new.approval := 'pending';
      new.admin_note := null;
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.is_admin() then
    if new.approval is distinct from old.approval
       or new.admin_note is distinct from old.admin_note then
      raise exception 'Only admins can approve or reject events';
    end if;
    if old.approval <> 'pending' and
       row(new.title, new.description, new.location_name, new.latitude, new.longitude,
           new.starts_at, new.ends_at, new.donation_request_id)
       is distinct from
       row(old.title, old.description, old.location_name, old.latitude, old.longitude,
           old.starts_at, old.ends_at, old.donation_request_id) then
      new.approval := 'pending';
    end if;
  end if;
  return new;
end $$;

create trigger events_guard
  before insert or update on public.events
  for each row execute function public.guard_event();


-- 4j. Volunteer application rules:
--   * no new applications or approvals once an event has all the volunteers
--     it needs (volunteers_needed = 0 means no limit)
--   * organization / admin: pending → approved/rejected, approved → rejected
--   * volunteer: pending/approved → withdrawn, withdrawn → pending (apply again)
create function public.guard_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev       public.events;
  approved integer;
begin
  -- lock the event row so two approvals can't both take the last spot
  select * into ev from public.events where id = new.event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  select count(*) into approved from public.volunteer_applications a
   where a.event_id = new.event_id and a.status = 'approved'
     and a.id <> new.id;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.volunteer_id := auth.uid();
      new.status := 'pending';
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

  if new.status in ('approved', 'pending') and ev.volunteers_needed > 0
     and approved >= ev.volunteers_needed then
    raise exception 'This event already has all the volunteers it needs';
  end if;
  return new;
end $$;

create trigger volunteer_applications_guard
  before insert or update on public.volunteer_applications
  for each row execute function public.guard_application();


-- 4k. Volunteers may only change the status of their own task.
create function public.guard_task_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and not public.owns_event(old.event_id)
     and row(new.title, new.description, new.due_at, new.event_id, new.volunteer_id)
         is distinct from row(old.title, old.description, old.due_at, old.event_id, old.volunteer_id) then
    raise exception 'Volunteers can only update the status of their tasks';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger volunteer_tasks_guard
  before update on public.volunteer_tasks
  for each row execute function public.guard_task_update();


-- 4l. Donor / volunteer switches on a profile:
--   * only individual accounts can turn donating or volunteering on or off
--   * at least one must stay on
--   * if the role that opens first gets turned off, switch to the other one
--   * consent time is always set by the database (now), never by the user;
--     setting it to null withdraws consent
--   * matching opt-in only applies while volunteering is on
create function public.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and row(new.is_donor, new.is_volunteer) is distinct from row(old.is_donor, old.is_volunteer) then
    if old.role not in ('donor', 'volunteer') then
      raise exception 'Only individual accounts can donate or volunteer';
    end if;
    if not new.is_donor and not new.is_volunteer then
      raise exception 'Keep at least one turned on: donating or volunteering';
    end if;
  end if;

  if new.consented_at is distinct from old.consented_at and new.consented_at is not null then
    new.consented_at := now();
  end if;
  if not new.is_volunteer then
    new.matching_opt_in := false;
  end if;

  if new.role = 'donor' and not new.is_donor and new.is_volunteer then
    new.role := 'volunteer';
  elsif new.role = 'volunteer' and not new.is_volunteer and new.is_donor then
    new.role := 'donor';
  end if;
  return new;
end $$;


create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();


-- ---------------------------------------------------------------------
-- 5. Table permissions
-- Users can read (filtered by the rules in section 6) and can only
-- write the columns listed here. AI scores, statuses that need approval
-- and the quantity totals can't be set directly from the browser.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

grant update (full_name, phone, postal_code, area, is_donor, is_volunteer,
              available_days, available_times, interests, skills,
              consented_at, age_confirmed, matching_opt_in)
  on public.profiles to authenticated;

grant insert (name, description, address, phone, latitude, longitude),
      update (name, description, address, phone, latitude, longitude, approval, admin_note)
  on public.organizations to authenticated;

grant insert (organization_id, title, description, urgency, deadline, dropoff_instructions),
      update (title, description, urgency, deadline, dropoff_instructions, status, admin_note),
      delete
  on public.donation_requests to authenticated;

grant insert (request_id, name, category, unit, quantity_needed),
      update (name, category, unit, quantity_needed),
      delete
  on public.request_items to authenticated;

grant insert (request_item_id, quantity, message, food_safety_confirmed),
      update (status)
  on public.donation_offers to authenticated;

grant insert (organization_id, title, description, location_name, latitude, longitude,
              starts_at, ends_at, volunteers_needed, donation_request_id),
      update (title, description, location_name, latitude, longitude,
              starts_at, ends_at, volunteers_needed, status, outcome_summary,
              donation_request_id, approval, admin_note),
      delete
  on public.events to authenticated;

grant insert (event_id, message),
      update (status),
      delete
  on public.volunteer_applications to authenticated;

grant insert (event_id, volunteer_id, title, description, due_at),
      update (title, description, due_at, status),
      delete
  on public.volunteer_tasks to authenticated;


-- ---------------------------------------------------------------------
-- 6. Row Level Security — who can see and change which rows
-- ---------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.organizations          enable row level security;
alter table public.donation_requests      enable row level security;
alter table public.request_items          enable row level security;
alter table public.donation_offers        enable row level security;
alter table public.events                 enable row level security;
alter table public.volunteer_applications enable row level security;
alter table public.volunteer_tasks        enable row level security;

-- Profiles
create policy "View own profile, or as admin / receiving organization" on public.profiles
  for select to authenticated using (public.can_view_profile(id));
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Organizations: approved ones are public; owners and admins also see pending / rejected
create policy "View approved organizations, own organization, or all as admin" on public.organizations
  for select to anon, authenticated
  using (approval = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "Organization accounts create their organization" on public.organizations
  for insert to authenticated
  with check (owner_id = auth.uid() and public.my_role() = 'organization');
create policy "Owners and admins update organizations" on public.organizations
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Donation requests: everyone sees approved ones; owners and admins see all of theirs
create policy "View approved requests, own requests, or all as admin" on public.donation_requests
  for select to anon, authenticated
  using ((status in ('open', 'fulfilled') and public.org_is_approved(organization_id))
         or public.owns_org(organization_id)
         or public.is_admin());
create policy "Approved organizations create their own requests" on public.donation_requests
  for insert to authenticated
  with check (public.owns_org(organization_id) and public.org_is_approved(organization_id));
create policy "Owners and admins update requests" on public.donation_requests
  for update to authenticated
  using (public.owns_org(organization_id) or public.is_admin());
create policy "Owners delete unapproved requests; admins delete any" on public.donation_requests
  for delete to authenticated
  using ((public.owns_org(organization_id) and status = 'pending_approval')
         or public.is_admin());

-- Request items follow their request's visibility
create policy "View items of visible requests" on public.request_items
  for select to anon, authenticated
  using (exists (select 1 from public.donation_requests r where r.id = request_id));
create policy "Owners add items" on public.request_items
  for insert to authenticated with check (public.owns_request(request_id));
create policy "Owners update items" on public.request_items
  for update to authenticated using (public.owns_request(request_id));
create policy "Owners delete items" on public.request_items
  for delete to authenticated using (public.owns_request(request_id));

-- Donation offers: the donor, the receiving organization, and admins
create policy "Donor, receiving organization or admin view offers" on public.donation_offers
  for select to authenticated
  using (donor_id = auth.uid() or public.owns_item(request_item_id) or public.is_admin());
create policy "Donating accounts make offers" on public.donation_offers
  for insert to authenticated
  with check (donor_id = auth.uid() and public.can_donate());
create policy "Donor, receiving organization or admin update offers" on public.donation_offers
  for update to authenticated
  using (donor_id = auth.uid() or public.owns_item(request_item_id) or public.is_admin());

-- Events: approved ones are public (map, share links); owners and admins see all of theirs
create policy "View approved events, own events, or all as admin" on public.events
  for select to anon, authenticated
  using ((approval = 'approved' and public.org_is_approved(organization_id))
         or public.owns_org(organization_id) or public.is_admin());
create policy "Approved organizations create their own events" on public.events
  for insert to authenticated
  with check (public.owns_org(organization_id) and public.org_is_approved(organization_id));
create policy "Owners and admins update events" on public.events
  for update to authenticated using (public.owns_org(organization_id) or public.is_admin());
create policy "Owners and admins delete events" on public.events
  for delete to authenticated using (public.owns_org(organization_id) or public.is_admin());

-- Volunteer applications
create policy "Volunteer, event owner or admin view applications" on public.volunteer_applications
  for select to authenticated
  using (volunteer_id = auth.uid() or public.owns_event(event_id) or public.is_admin());
create policy "Volunteering accounts apply to approved, upcoming events" on public.volunteer_applications
  for insert to authenticated
  with check (volunteer_id = auth.uid()
              and public.can_volunteer()
              and exists (select 1 from public.events e
                          where e.id = volunteer_applications.event_id
                            and e.approval = 'approved'
                            and e.status in ('upcoming', 'ongoing')));
create policy "Volunteer, event owner or admin update applications" on public.volunteer_applications
  for update to authenticated
  using (volunteer_id = auth.uid() or public.owns_event(event_id) or public.is_admin());
create policy "Volunteers withdraw pending applications" on public.volunteer_applications
  for delete to authenticated
  using ((volunteer_id = auth.uid() and status = 'pending') or public.is_admin());

-- Volunteer tasks (only for approved volunteers of that event)
create policy "Volunteer, event owner or admin view tasks" on public.volunteer_tasks
  for select to authenticated
  using (volunteer_id = auth.uid() or public.owns_event(event_id) or public.is_admin());
create policy "Event owner assigns tasks to approved volunteers" on public.volunteer_tasks
  for insert to authenticated
  with check ((public.owns_event(event_id) or public.is_admin())
              and exists (select 1 from public.volunteer_applications a
                          where a.event_id = volunteer_tasks.event_id
                            and a.volunteer_id = volunteer_tasks.volunteer_id
                            and a.status = 'approved'));
create policy "Volunteer, event owner or admin update tasks" on public.volunteer_tasks
  for update to authenticated
  using (volunteer_id = auth.uid() or public.owns_event(event_id) or public.is_admin());
create policy "Event owner or admin delete tasks" on public.volunteer_tasks
  for delete to authenticated
  using (public.owns_event(event_id) or public.is_admin());


-- ---------------------------------------------------------------------
-- 7. Making yourself an admin
-- Sign up normally in your app, then run this (with your email):
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------