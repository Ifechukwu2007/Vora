create table if not exists public.promotion_config (
  id text primary key check (id = 'platform'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.promotion_config (id, enabled)
values ('platform', false)
on conflict (id) do nothing;

create table if not exists public.service_promotions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  provider_id uuid not null,
  campaign_type text not null check (campaign_type in ('short_promotion', 'featured_week')),
  budget_ngn integer not null check (
    (campaign_type = 'short_promotion' and budget_ngn between 1000 and 3000)
    or (campaign_type = 'featured_week' and budget_ngn between 2000 and 5000)
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'paused', 'completed', 'rejected')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (campaign_type <> 'featured_week' or ends_at - starts_at between interval '6 days 23 hours' and interval '7 days 1 hour')
);

create index if not exists service_promotions_active_window_idx
  on public.service_promotions (starts_at, ends_at, created_at)
  where status = 'active' and paid_at is not null;

alter table public.promotion_config enable row level security;
alter table public.service_promotions enable row level security;

create policy "Anyone can read promotion launch status"
  on public.promotion_config for select
  using (true);

create policy "Anyone can read active paid promotions when enabled"
  on public.service_promotions for select
  using (
    status = 'active'
    and paid_at is not null
    and starts_at <= now()
    and ends_at > now()
    and exists (
      select 1 from public.promotion_config
      where id = 'platform' and enabled = true
    )
  );

create policy "Providers can read their promotion records"
  on public.service_promotions for select
  to authenticated
  using (provider_id = auth.uid());

grant select on public.promotion_config to anon, authenticated;
grant select on public.service_promotions to anon, authenticated;

comment on table public.service_promotions is 'Admin-managed, paid, time-limited sponsored service placements. Keep the platform promotion gate off until customer traffic supports a useful test.';
comment on column public.service_promotions.budget_ngn is 'Pilot price bands: short promotion NGN 1,000-3,000; featured week NGN 2,000-5,000.';