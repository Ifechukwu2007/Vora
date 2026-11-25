alter table public.payments
  add column if not exists updated_at timestamptz not null default now();

alter table public.payments enable row level security;

grant select, insert on public.payments to authenticated;

-- Booking ownership is represented by public.users.id in some installs and
-- auth.users.id in others. Resolve both forms without depending on bookings RLS.
create or replace function public.is_payment_booking_customer(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        b.user_id = (select auth.uid())
        or exists (
          select 1
          from public.users u
          where u.id = b.user_id
            and u.uid = (select auth.uid())
        )
      )
  );
$$;

revoke all on function public.is_payment_booking_customer(uuid) from public;
grant execute on function public.is_payment_booking_customer(uuid) to authenticated;

create or replace function public.is_payment_booking_customer(
  p_booking_id uuid,
  p_payment_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        b.user_id = (select auth.uid())
        or exists (
          select 1
          from public.users u
          where u.id = b.user_id
            and u.uid = (select auth.uid())
        )
      )
      and p_payment_user_id in (b.user_id, (select auth.uid()))
  );
$$;

revoke all on function public.is_payment_booking_customer(uuid, uuid) from public;
grant execute on function public.is_payment_booking_customer(uuid, uuid) to authenticated;

drop policy if exists "Customers and admins can read payments" on public.payments;
create policy "Customers and admins can read payments"
  on public.payments for select to authenticated
  using (
    public.is_payment_booking_customer(booking_id)
    or public.is_platform_admin()
  );

drop policy if exists "Customers can create payments for their bookings" on public.payments;
create policy "Customers can create payments for their bookings"
  on public.payments for insert to authenticated
  with check (
    public.is_payment_booking_customer(booking_id, user_id)
  );
