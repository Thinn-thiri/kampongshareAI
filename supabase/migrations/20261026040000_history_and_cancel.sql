-- History and cancelling: reasons and end dates for closed requests and cancelled events.
--
-- ALREADY APPLIED — DO NOT RUN AGAIN.
-- The original SQL for this migration was lost before it was saved into the project. This file was
-- rebuilt on 2026-10-26 from the live database, so the repository shows what the database contains.
-- Only what could be checked is written as SQL below (and it is safe to re-run: "if not exists").
--
-- Checked in the live database:
--   * donation_requests.close_reason (text) and closed_at (timestamptz)
--   * events.cancel_reason (text) and cancelled_at (timestamptz)
--   * organizations may update close_reason / cancel_reason / status; closed_at and cancelled_at are
--     set by the database (logged-in users get "permission denied" if they try to write them)
--   * public.event_has_applications(ev_id uuid) returns boolean
--
-- Also created by the original migration, but their code could not be read back, so they are not
-- re-created here (see the Supabase dashboard → Database → Functions):
--   * public.has_applied_to_event(ev_id uuid)
--   * public.has_offered_on_request(req_id uuid)
--   * any triggers or policy changes that set closed_at / cancelled_at or limit deletes

alter table public.donation_requests add column if not exists close_reason text;
alter table public.donation_requests add column if not exists closed_at timestamptz;
alter table public.events add column if not exists cancel_reason text;
alter table public.events add column if not exists cancelled_at timestamptz;
