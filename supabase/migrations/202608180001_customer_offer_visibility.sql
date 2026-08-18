-- A provider may manage only their own offers. The customer who created the
-- request may read those offers and update their status when making a choice.
alter table public.offers enable row level security;

drop policy if exists "Providers create their own offers" on public.offers;
create policy "Providers create their own offers"
on public.offers for insert to authenticated
with check (
  provider_id = auth.uid()
  and exists (
    select 1 from public.requests
    where requests.id = offers.request_id and requests.status = 'open'
  )
);

drop policy if exists "Providers and request owners can view offers" on public.offers;
create policy "Providers and request owners can view offers"
on public.offers for select to authenticated
using (
  provider_id = auth.uid()
  or exists (
    select 1 from public.requests
    where requests.id = offers.request_id and requests.user_id = auth.uid()
  )
);

drop policy if exists "Providers update their own offers" on public.offers;
create policy "Providers update their own offers"
on public.offers for update to authenticated
using (provider_id = auth.uid())
with check (provider_id = auth.uid());

drop policy if exists "Request owners decide offer status" on public.offers;
create policy "Request owners decide offer status"
on public.offers for update to authenticated
using (
  exists (
    select 1 from public.requests
    where requests.id = offers.request_id and requests.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.requests
    where requests.id = offers.request_id and requests.user_id = auth.uid()
  )
);
