-- KampongShare AI — RESET (test data only!)
-- Deletes ALL KampongShare tables, rules and ALL user accounts, so you can run the
-- latest supabase/migrations/..._initial_schema.sql on a clean database.
-- Only use this while you have test data. Never on real users.
-- Paste into Supabase → SQL Editor → Run. Then paste and run the latest schema file.

begin;

-- the sign-up trigger lives on Supabase's auth.users table
drop trigger if exists on_auth_user_created on auth.users;

-- all user accounts (test accounts only at this stage)
delete from auth.users;

-- tables
drop table if exists public.volunteer_tasks        cascade;
drop table if exists public.volunteer_applications cascade;
drop table if exists public.events                 cascade;
drop table if exists public.donation_offers        cascade;
drop table if exists public.request_items          cascade;
drop table if exists public.donation_requests      cascade;
drop table if exists public.organizations          cascade;
drop table if exists public.profiles               cascade;

-- functions
drop function if exists public.handle_new_user        cascade;
drop function if exists public.json_text_array        cascade;
drop function if exists public.guard_request_update   cascade;
drop function if exists public.guard_request_item     cascade;
drop function if exists public.reset_request_ai_score cascade;
drop function if exists public.guard_offer            cascade;
drop function if exists public.reject_waiting_offers  cascade;
drop function if exists public.sync_item_totals       cascade;
drop function if exists public.guard_organization     cascade;
drop function if exists public.guard_event            cascade;
drop function if exists public.guard_application      cascade;
drop function if exists public.guard_task_update      cascade;
drop function if exists public.guard_profile          cascade;
drop function if exists public.public_stats           cascade;
drop function if exists public.can_view_profile       cascade;
drop function if exists public.owns_event             cascade;
drop function if exists public.owns_item              cascade;
drop function if exists public.owns_request           cascade;
drop function if exists public.org_is_approved        cascade;
drop function if exists public.owns_org               cascade;
drop function if exists public.can_volunteer          cascade;
drop function if exists public.can_donate             cascade;
drop function if exists public.is_admin               cascade;
drop function if exists public.my_role                cascade;

-- types
drop type if exists public.user_role          cascade;
drop type if exists public.urgency_level      cascade;
drop type if exists public.request_status     cascade;
drop type if exists public.item_category      cascade;
drop type if exists public.offer_status       cascade;
drop type if exists public.event_status       cascade;
drop type if exists public.application_status cascade;
drop type if exists public.task_status        cascade;
drop type if exists public.approval_status    cascade;

commit;