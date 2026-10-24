-- Donors can see the requests (and their items) they have made an offer on,
-- even after the request is closed — so an accepted offer can still be delivered
-- (drop-off instructions stay visible) and closed requests show as "Request closed".
-- These policies are added to the existing ones; nothing else becomes visible.
-- Safe to run more than once.

create or replace function public.has_offer_on_request(req_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.donation_offers o
                 join public.request_items i on i.id = o.request_item_id
                 where i.request_id = req_id and o.donor_id = auth.uid())
$$;

drop policy if exists "Donors view requests they offered to" on public.donation_requests;
create policy "Donors view requests they offered to" on public.donation_requests
  for select to authenticated
  using (public.has_offer_on_request(id));

drop policy if exists "Donors view items of requests they offered to" on public.request_items;
create policy "Donors view items of requests they offered to" on public.request_items
  for select to authenticated
  using (public.has_offer_on_request(request_id));
