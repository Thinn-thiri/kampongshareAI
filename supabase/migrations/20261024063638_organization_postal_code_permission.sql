-- Let organizations save their postal code from the browser.
-- The initial schema grants insert/update column by column, and postal_code
-- (added in 20261024040000) wasn't in that list. Safe to run more than once.

grant insert (postal_code), update (postal_code) on public.organizations to authenticated;
