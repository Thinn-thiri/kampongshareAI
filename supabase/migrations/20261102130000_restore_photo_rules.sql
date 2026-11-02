-- KampongShare AI — put back the photo and size rules
--   20261102090000_item_details.sql was run AFTER 20261102120000_offer_photos.sql, and its
--   guard_request_item() / guard_offer() replaced the newer ones, which switched off:
--     - every new item needs a size or specification; material is locked after approval
--     - every new offer needs 1–3 photos uploaded by the donor; photos can't be edited
--   This file re-creates both functions exactly as in offer_photos (they include all the
--   item_details rules too). Safe to run more than once.
-- Paste into Supabase → SQL Editor → Run (once).

begin;
-- ---------- item rules: size/specification required, material locked ----------
create or replace function public.guard_request_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  req_status public.request_status;
begin
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;

  -- every NEW item needs a size or specification, and it can't be cleared later
  -- (only checked when an item is created or its size is changed, so older items
  -- without one keep working)
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.size_spec is distinct from old.size_spec) then
    new.size_spec := nullif(trim(new.size_spec), '');
    if new.size_spec is null then
      raise exception 'Please add a size or specification for "%" (for example 24–28 cm, Size M–L or 5 kg bags)', new.name;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new.material := nullif(trim(new.material), '');
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
     or row(new.name, new.category, new.unit, new.size_spec, new.material, new.min_condition, new.item_details, new.details_required)
        is distinct from
        row(old.name, old.category, old.unit, old.size_spec, old.material, old.min_condition, old.item_details, old.details_required) then
    raise exception 'After approval you can only change an item''s quantity. Its name, size, material, condition and details are locked so donors know exactly what they offered for.';
  end if;

  return new;
end $$;

-- ---------- offer rules: 1–3 photos, uploaded by the donor, not editable ----------
create or replace function public.guard_offer() returns trigger
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
    if req.deadline is not null and req.deadline < public.sg_today() then
      raise exception 'The deadline for this request has passed, so it isn''t taking new offers';
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
    new.offer_details := nullif(trim(new.offer_details), '');
    if item.min_condition <> 'any' then
      if new.offer_condition is null then
        raise exception 'Please say what condition your "%" is in', item.name;
      end if;
      if public.condition_rank(new.offer_condition) < public.condition_rank(item.min_condition) then
        raise exception 'This request needs "%" in % condition or better', item.name, replace(item.min_condition::text, '_', ' ');
      end if;
    end if;
    if item.details_required and new.offer_details is null then
      raise exception 'Please describe your "%" (for example size, material or brand)', item.name;
    end if;
    if auth.uid() is not null then
      if coalesce(cardinality(new.photo_paths), 0) < 1 then
        raise exception 'Please add at least one photo of your "%" so the organization can check it', item.name;
      end if;
      if cardinality(new.photo_paths) > 3 then
        raise exception 'You can add up to 3 photos';
      end if;
      if exists (select 1 from unnest(new.photo_paths) p
                 where split_part(p, '/', 1) <> auth.uid()::text
                    or not exists (select 1 from storage.objects o
                                   where o.bucket_id = 'offer-photos' and o.name = p)) then
        raise exception 'One of the photos could not be found. Please upload it again.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.request_item_id <> old.request_item_id
     or new.quantity <> old.quantity
     or new.donor_id <> old.donor_id
     or new.food_safety_confirmed <> old.food_safety_confirmed
     or new.offer_condition is distinct from old.offer_condition
     or new.offer_details is distinct from old.offer_details
     or new.photo_paths is distinct from old.photo_paths then
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

commit;
