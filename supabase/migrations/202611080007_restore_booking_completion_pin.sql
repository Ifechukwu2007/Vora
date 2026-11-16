create table if not exists public.booking_completion_codes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  provider_id uuid not null references public.users(id) on delete cascade,
  pin text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.booking_completion_codes enable row level security;
revoke all on public.booking_completion_codes from anon, authenticated;

create or replace function public.create_booking_completion_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.provider_id is not null then
    insert into public.booking_completion_codes (
      booking_id,
      customer_id,
      provider_id,
      pin
    )
    values (
      new.id,
      new.user_id,
      new.provider_id,
      lpad(floor(random() * 1000000)::integer::text, 6, '0')
    )
    on conflict (booking_id) do nothing;
  end if;

  return new;
end;
$$;

insert into public.booking_completion_codes (
  booking_id,
  customer_id,
  provider_id,
  pin
)
select
  booking.id,
  booking.user_id,
  booking.provider_id,
  lpad(floor(random() * 1000000)::integer::text, 6, '0')
from public.bookings booking
where booking.user_id is not null
  and booking.provider_id is not null
  and lower(coalesce(booking.status, '')) not in ('completed', 'cancelled', 'declined', 'disputed')
on conflict (booking_id) do nothing;

drop trigger if exists booking_completion_code_on_insert on public.bookings;
create trigger booking_completion_code_on_insert
  after insert on public.bookings
  for each row execute function public.create_booking_completion_code();

create or replace function public.require_pin_for_booking_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    (new.status = 'completed' and old.status is distinct from 'completed')
    or (new.booking_status = 'completed' and old.booking_status is distinct from 'completed')
  ) and coalesce(current_setting('vora.completion_pin_verified', true), '') <> 'yes' then
    raise exception 'Booking completion must be confirmed with the customer PIN.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_pin_for_booking_completion_on_update on public.bookings;
create trigger require_pin_for_booking_completion_on_update
  before update on public.bookings
  for each row execute function public.require_pin_for_booking_completion();

create or replace function public.get_booking_completion_pin(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  completion_pin text;
begin
  select pin
    into completion_pin
  from public.booking_completion_codes
  where booking_id = p_booking_id
    and customer_id = auth.uid()
    and used_at is null;

  return completion_pin;
end;
$$;

create or replace function public.confirm_booking_completion(
  p_booking_id uuid,
  p_pin text
)
returns table(success boolean, commission_amount numeric, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings%rowtype;
  completion_row public.booking_completion_codes%rowtype;
  commission_rate numeric := 10;
  service_gross numeric := 0;
  assessed_commission numeric := 0;
  currency text := 'NGN';
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into booking_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or booking_row.provider_id <> auth.uid() then
    raise exception 'Booking not found or access denied.';
  end if;

  if lower(coalesce(booking_row.status, '')) not in ('completed_by_provider', 'awaiting_customer_confirmation') then
    raise exception 'This booking is not awaiting completion confirmation.';
  end if;

  select * into completion_row
  from public.booking_completion_codes
  where booking_id = p_booking_id
  for update;

  if not found or completion_row.used_at is not null then
    return query select false, 0::numeric, 'This completion code has already been used or is unavailable.';
    return;
  end if;

  if completion_row.locked_until is not null and completion_row.locked_until > now() then
    return query select false, 0::numeric, 'Too many incorrect attempts. Please wait before trying again.';
    return;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or p_pin <> completion_row.pin then
    update public.booking_completion_codes
    set failed_attempts = failed_attempts + 1,
        locked_until = case
          when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
          else locked_until
        end
    where booking_id = p_booking_id;

    return query select false, 0::numeric, 'The completion PIN is incorrect.';
    return;
  end if;

  update public.booking_completion_codes
  set used_at = now()
  where booking_id = p_booking_id;

  perform set_config('vora.completion_pin_verified', 'yes', true);

  update public.bookings
  set status = 'completed',
      booking_status = 'completed',
      provider_payout_status = case
        when lower(coalesce(payment_method, '')) in ('cash', 'reserve_cash') then 'paid'
        else 'eligible'
      end,
      payout_status = case
        when lower(coalesce(payment_method, '')) in ('cash', 'reserve_cash') then 'paid'
        else 'eligible'
      end,
      payment_status = case
        when lower(coalesce(payment_method, '')) in ('cash', 'reserve_cash') then 'paid'
        else payment_status
      end,
      payment_provider = case
        when lower(coalesce(payment_method, '')) in ('cash', 'reserve_cash') then 'cash'
        else payment_provider
      end,
      paid_at = case
        when lower(coalesce(payment_method, '')) in ('cash', 'reserve_cash') then now()
        else paid_at
      end,
      updated_at = now()
  where id = p_booking_id;

  if lower(coalesce(booking_row.payment_method, '')) in ('cash', 'reserve_cash') then
    select coalesce(commission, 10)
      into commission_rate
    from public.settings
    order by id
    limit 1;

    service_gross :=
      coalesce(booking_row.price_per_person, 0)
      * greatest(coalesce(booking_row.number_of_people, 1), 1);
    assessed_commission := round(service_gross * coalesce(commission_rate, 10) / 100, 2);

    select coalesce(currency_code, 'NGN')
      into currency
    from public.services
    where id = booking_row.service_id;

    insert into public.provider_commissions (
      booking_id,
      provider_id,
      gross_amount,
      commission_rate,
      commission_amount,
      currency_code
    )
    values (
      p_booking_id,
      booking_row.provider_id,
      service_gross,
      coalesce(commission_rate, 10),
      assessed_commission,
      coalesce(currency, 'NGN')
    )
    on conflict (booking_id) do nothing;

    get diagnostics inserted_count = row_count;

    if inserted_count > 0 then
      insert into public.provider_balances (
        provider_id,
        currency_code,
        total_commission,
        outstanding_balance,
        updated_at
      )
      values (
        booking_row.provider_id,
        coalesce(currency, 'NGN'),
        assessed_commission,
        assessed_commission,
        now()
      )
      on conflict (provider_id, currency_code) do update
      set total_commission = public.provider_balances.total_commission + excluded.total_commission,
          outstanding_balance = public.provider_balances.outstanding_balance + excluded.outstanding_balance,
          updated_at = now();

      insert into public.payments (
        booking_id,
        user_id,
        provider_id,
        service_id,
        amount,
        currency,
        payment_method,
        provider,
        currency_code,
        status,
        created_at,
        updated_at
      )
      select
        booking_row.id,
        booking_row.user_id,
        booking_row.provider_id,
        booking_row.service_id,
        booking_row.total_price,
        coalesce(currency, 'NGN'),
        'cash',
        'cash',
        coalesce(currency, 'NGN'),
        'success',
        now(),
        now()
      where not exists (
        select 1
        from public.payments
        where booking_id = booking_row.id
          and payment_method = 'cash'
          and status = 'success'
      );
    end if;
  else
    update public.payouts
    set payout_status = 'eligible',
        status = 'eligible',
        eligible_at = now(),
        updated_at = now()
    where booking_id = p_booking_id;
  end if;

  return query select true, assessed_commission, 'Booking completion confirmed.';
end;
$$;

revoke all on function public.create_booking_completion_code() from public, anon, authenticated;
revoke all on function public.require_pin_for_booking_completion() from public, anon, authenticated;
revoke all on function public.get_booking_completion_pin(uuid) from public, anon;
revoke all on function public.confirm_booking_completion(uuid, text) from public, anon;
grant execute on function public.get_booking_completion_pin(uuid) to authenticated;
grant execute on function public.confirm_booking_completion(uuid, text) to authenticated;

notify pgrst, 'reload schema';
