-- Visitors (not logged in) can see why an event was cancelled on event.html.
-- The cancel reason is written by the organization for volunteers and the public; it holds no personal data.
grant select (cancel_reason, cancelled_at) on public.events to anon;
