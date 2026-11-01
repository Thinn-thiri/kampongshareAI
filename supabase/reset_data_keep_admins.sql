-- Reset the app's data but KEEP admin accounts (profiles.role = 'admin').
-- Use it before running the demo seed again (node scripts/seed.js).
--
-- Paste into the Supabase SQL Editor and press Run. It deletes:
--   * every message, report, translation and conversation
--   * every volunteer task and application, offer, event, request item and request
--   * every organization
--   * every account (login + profile) that is not an admin
-- It keeps the database structure (tables, rules, functions) and the admins' logins and profiles.
-- This can't be undone.

begin;

delete from public.message_translations;
delete from public.message_reports;
delete from public.messages;
delete from public.conversations;

delete from public.volunteer_tasks;
delete from public.volunteer_applications;
delete from public.donation_offers;
delete from public.events;
delete from public.request_items;
delete from public.donation_requests;
delete from public.organizations;

-- removing a login also removes its profile (profiles.id references auth.users on delete cascade)
delete from auth.users
where id not in (select id from public.profiles where role = 'admin');

commit;

-- What's left: the admin accounts only.
select p.full_name, u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id;
