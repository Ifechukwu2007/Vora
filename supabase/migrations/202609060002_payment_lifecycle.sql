alter table public.payments
  add column if not exists provider text not null default 'flutterwave',
  add column if not exists provider_reference text,
  add column if not exists currency_code text not null default 'NGN';

alter table public.bookings
  add column if not exists payment_provider text,
  add column if not exists provider_payout_status text not null default 'pending';

alter table public.payouts
  add column if not exists payment_provider text,
  add column if not exists currency_code text not null default 'NGN',
  add column if not exists released_at timestamptz;

update public.bookings
set provider_payout_status = coalesce(provider_payout_status, payout_status, 'pending')
where provider_payout_status is null;

comment on column public.bookings.payment_status is 'Customer payment lifecycle: pending, success, partially_paid, failed, refunded.';
comment on column public.bookings.provider_payout_status is 'Provider payout lifecycle: pending, eligible, paid, failed.';
comment on column public.payments.provider is 'Payment processor identifier, currently flutterwave.';
comment on column public.payouts.released_at is 'Timestamp when provider payout was actually released after service completion.';
