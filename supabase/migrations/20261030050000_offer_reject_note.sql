-- KampongShare AI — an optional note when an organization rejects an offer
--   * donation_offers.reject_note (max 300 characters): the donor sees it on the offer's timeline
--   * it can only be written together with pending → rejected, by the request's organization
--     (or an admin); nobody can change it afterwards
-- Paste into Supabase → SQL Editor → Run (once), after 20261030040000_status_times.sql.

begin;

alter table public.donation_offers
  add column reject_note text check (char_length(reject_note) <= 300);

grant update (reject_note) on public.donation_offers to authenticated;

create function public.guard_offer_reject_note() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  req_id uuid;
begin
  if new.reject_note is not distinct from old.reject_note then
    return new;
  end if;
  new.reject_note := nullif(btrim(new.reject_note), '');
  if auth.uid() is null or public.is_admin() then
    return new;  -- the database itself, or an admin
  end if;
  select i.request_id into req_id from public.request_items i where i.id = new.request_item_id;
  if not (old.status = 'pending' and new.status = 'rejected' and public.owns_request(req_id)) then
    raise exception 'A note can only be added when the organization rejects an offer';
  end if;
  return new;
end $$;

-- before update, after the offer rules (triggers run in name order)
create trigger donation_offers_reject_note
  before update on public.donation_offers
  for each row execute function public.guard_offer_reject_note();

commit;
