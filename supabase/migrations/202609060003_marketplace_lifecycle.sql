alter table public.users
  add column if not exists payout_status text;

alter table public.bookings
  add column if not exists cancellation_policy text not null default 'flexible',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists refund_amount numeric not null default 0,
  add column if not exists refund_status text not null default 'not_requested';

alter table public.payouts
  add column if not exists eligible_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists transfer_reference text,
  add column if not exists failure_reason text;

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  amount numeric not null default 0,
  reason text,
  status text not null default 'pending',
  provider_reference text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists refunds_booking_id_idx on public.refunds(booking_id);
create index if not exists payouts_provider_status_idx on public.payouts(provider_id, payout_status);

comment on column public.bookings.cancellation_policy is 'flexible, moderate, or strict.';
comment on column public.bookings.refund_status is 'not_requested, pending, processing, refunded, failed.';
comment on column public.payouts.eligible_at is 'Set after customer confirms service completion.';
