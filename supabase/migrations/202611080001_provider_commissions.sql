alter table public.settings
  add column if not exists cash_commission_limit numeric not null default 0;

create or replace function public.is_platform_settings_row(p_setting_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_setting_id = (select min(id) from public.settings);
$$;

revoke all on function public.is_platform_settings_row(bigint) from public;
grant execute on function public.is_platform_settings_row(bigint) to anon, authenticated;

drop policy if exists "Anyone can read platform settings" on public.settings;
create policy "Anyone can read platform settings"
  on public.settings for select to anon, authenticated
  using (public.is_platform_settings_row(id));
grant select on public.settings to anon, authenticated;

update public.settings
set commission = 10
where id = (select min(id) from public.settings);

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

create table if not exists public.provider_commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.users(id) on delete cascade,
  gross_amount numeric not null check (gross_amount >= 0),
  commission_rate numeric not null check (commission_rate >= 0 and commission_rate <= 100),
  commission_amount numeric not null check (commission_amount >= 0),
  currency_code text not null default 'NGN',
  status text not null default 'owed' check (status in ('owed', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists provider_commissions_provider_created_idx
  on public.provider_commissions(provider_id, created_at desc);

create table if not exists public.provider_balances (
  provider_id uuid not null references public.users(id) on delete cascade,
  currency_code text not null default 'NGN',
  total_commission numeric not null default 0 check (total_commission >= 0),
  commission_paid numeric not null default 0 check (commission_paid >= 0),
  outstanding_balance numeric not null default 0 check (outstanding_balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider_id, currency_code)
);

create table if not exists public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency_code text not null default 'NGN',
  payment_method text not null default 'bank_transfer' check (payment_method = 'bank_transfer'),
  reference text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null
);

create table if not exists public.commission_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  commission_payment_id uuid not null references public.commission_payments(id) on delete cascade,
  provider_commission_id uuid not null references public.provider_commissions(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (commission_payment_id, provider_commission_id)
);

create index if not exists commission_payments_provider_created_idx
  on public.commission_payments(provider_id, created_at desc);
create index if not exists commission_payments_status_created_idx
  on public.commission_payments(status, created_at desc);

alter table public.booking_completion_codes enable row level security;
alter table public.provider_commissions enable row level security;
alter table public.provider_balances enable row level security;
alter table public.commission_payments enable row level security;
alter table public.commission_payment_allocations enable row level security;

revoke all on public.booking_completion_codes from anon, authenticated;
grant select on public.provider_commissions to authenticated;
grant select on public.provider_balances to authenticated;
grant select on public.commission_payments to authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where (id = auth.uid() or user_id = auth.uid())
      and lower(coalesce(role, '')) = 'admin'
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "Providers and admins can read provider commissions" on public.provider_commissions;
create policy "Providers and admins can read provider commissions"
  on public.provider_commissions for select to authenticated
  using (provider_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Providers and admins can read provider balances" on public.provider_balances;
create policy "Providers and admins can read provider balances"
  on public.provider_balances for select to authenticated
  using (provider_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Providers and admins can read commission payments" on public.commission_payments;
create policy "Providers and admins can read commission payments"
  on public.commission_payments for select to authenticated
  using (provider_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Providers and admins can read commission payment allocations" on public.commission_payment_allocations;
create policy "Providers and admins can read commission payment allocations"
  on public.commission_payment_allocations for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.provider_commissions
      where id = provider_commission_id
        and provider_id = auth.uid()
    )
  );
grant select on public.commission_payment_allocations to authenticated;

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
  b.id,
  b.user_id,
  b.provider_id,
  lpad(floor(random() * 1000000)::integer::text, 6, '0')
from public.bookings b
where b.user_id is not null
  and b.provider_id is not null
  and lower(coalesce(b.status, '')) not in ('completed', 'cancelled', 'declined', 'disputed')
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

create or replace function public.prevent_cash_booking_financial_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    lower(coalesce(old.payment_method, '')) in ('cash', 'reserve_cash')
    or lower(coalesce(new.payment_method, '')) in ('cash', 'reserve_cash')
  ) and (
    old.payment_method is distinct from new.payment_method
    or old.provider_id is distinct from new.provider_id
    or old.service_id is distinct from new.service_id
    or old.price_per_person is distinct from new.price_per_person
    or old.number_of_people is distinct from new.number_of_people
    or old.travel_fee is distinct from new.travel_fee
    or old.total_price is distinct from new.total_price
  ) then
    raise exception 'Cash booking payment and price details cannot be changed after booking.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_cash_booking_financial_edits_on_update on public.bookings;
create trigger prevent_cash_booking_financial_edits_on_update
  before update on public.bookings
  for each row execute function public.prevent_cash_booking_financial_edits();

create or replace function public.enforce_cash_commission_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_limit numeric := 0;
  commission_rate numeric := 10;
  current_balance numeric := 0;
  pending_commission numeric := 0;
  proposed_commission numeric := 0;
  service_provider_id uuid;
  service_price numeric;
  group_threshold integer := 0;
  group_discount numeric := 0;
  expected_per_person numeric;
  people_count integer;
  service_currency text := 'NGN';
begin
  if lower(coalesce(new.payment_method, '')) not in ('cash', 'reserve_cash') then
    return new;
  end if;

  if new.service_id is null or new.provider_id is null then
    raise exception 'Cash payment is available for provider service bookings only.';
  end if;

  if new.provider_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.provider_id::text));
  end if;

  select coalesce(cash_commission_limit, 0), coalesce(commission, 10)
    into configured_limit, commission_rate
  from public.settings
  order by id
  limit 1;

  select provider_id, price, group_discount_threshold, group_discount_percent, coalesce(currency_code, 'NGN')
    into service_provider_id, service_price, group_threshold, group_discount, service_currency
  from public.services
  where id = new.service_id;

  if not found or service_provider_id <> new.provider_id then
    raise exception 'The selected service does not belong to this provider.';
  end if;

  people_count := greatest(coalesce(new.number_of_people, 1), 1);
  expected_per_person := coalesce(service_price, 0);
  if group_threshold > 0 and group_discount > 0 and people_count >= group_threshold then
    expected_per_person := round(service_price * (1 - group_discount / 100));
  end if;

  if round(coalesce(new.price_per_person, 0), 2) <> expected_per_person
     or round(coalesce(new.total_price, 0), 2) <>
       round(expected_per_person * people_count + coalesce(new.travel_fee, 0), 2) then
    raise exception 'The cash booking price changed. Refresh the service page and try again.';
  end if;

  if coalesce(configured_limit, 0) <= 0 or service_currency <> 'NGN' then
    return new;
  end if;

  select coalesce(outstanding_balance, 0)
    into current_balance
  from public.provider_balances
  where provider_id = new.provider_id
    and currency_code = 'NGN';

  select coalesce(sum(
      coalesce(b.price_per_person, 0) * greatest(coalesce(b.number_of_people, 1), 1)
      * coalesce(commission_rate, 10) / 100
    ), 0)
    into pending_commission
  from public.bookings b
  join public.services svc on svc.id = b.service_id
  where b.provider_id = new.provider_id
    and lower(coalesce(b.payment_method, '')) in ('cash', 'reserve_cash')
    and lower(coalesce(b.status, '')) not in ('completed', 'cancelled', 'declined', 'disputed')
    and coalesce(svc.currency_code, 'NGN') = 'NGN';

  proposed_commission :=
    coalesce(new.price_per_person, 0) * people_count
    * coalesce(commission_rate, 10) / 100;

  if coalesce(current_balance, 0) + pending_commission + proposed_commission > configured_limit then
    raise exception 'Cash bookings are paused because your outstanding commission balance is over the platform limit. Please settle your balance.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_cash_commission_limit_on_booking on public.bookings;
create trigger enforce_cash_commission_limit_on_booking
  before insert on public.bookings
  for each row execute function public.enforce_cash_commission_limit();

create or replace function public.get_booking_completion_pin(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  completion_pin text;
begin
  select pin into completion_pin
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

create or replace function public.submit_commission_payment(
  p_amount numeric,
  p_currency_code text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric := 0;
  pending_amount numeric := 0;
  payment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a payment amount greater than zero.';
  end if;
  if nullif(trim(p_currency_code), '') is null then
    raise exception 'Select the currency for this commission payment.';
  end if;
  if nullif(trim(p_reference), '') is null then
    raise exception 'Enter the bank transfer reference.';
  end if;

  select coalesce(outstanding_balance, 0)
    into current_balance
  from public.provider_balances
  where provider_id = auth.uid()
    and currency_code = upper(trim(p_currency_code))
  for update;

  select coalesce(sum(amount), 0)
    into pending_amount
  from public.commission_payments
  where provider_id = auth.uid()
    and currency_code = upper(trim(p_currency_code))
    and status = 'pending';

  current_balance := coalesce(current_balance, 0);
  if p_amount > current_balance - pending_amount then
    raise exception 'Payment amount cannot exceed your unsubmitted outstanding balance.';
  end if;

  insert into public.commission_payments (
    provider_id,
    amount,
    currency_code,
    payment_method,
    reference
  )
  values (
    auth.uid(),
    round(p_amount, 2),
    upper(trim(p_currency_code)),
    'bank_transfer',
    trim(p_reference)
  )
  returning id into payment_id;

  return payment_id;
end;
$$;

create or replace function public.confirm_commission_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.commission_payments%rowtype;
  commission_row record;
  remaining_amount numeric;
  available_amount numeric;
  allocation_amount numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;

  select * into payment_row
  from public.commission_payments
  where id = p_payment_id
  for update;

  if not found or payment_row.status <> 'pending' then
    raise exception 'Pending commission payment not found.';
  end if;

  update public.provider_balances
  set commission_paid = commission_paid + payment_row.amount,
      outstanding_balance = greatest(0, outstanding_balance - payment_row.amount),
      updated_at = now()
  where provider_id = payment_row.provider_id
    and currency_code = payment_row.currency_code
    and outstanding_balance >= payment_row.amount;

  if not found then
    raise exception 'The provider balance is lower than this transfer amount.';
  end if;

  remaining_amount := payment_row.amount;
  for commission_row in
    select id, commission_amount
    from public.provider_commissions
    where provider_id = payment_row.provider_id
      and currency_code = payment_row.currency_code
      and status = 'owed'
    order by created_at, id
    for update
  loop
    exit when remaining_amount <= 0;

    select commission_row.commission_amount - coalesce(sum(amount), 0)
      into available_amount
    from public.commission_payment_allocations
    where provider_commission_id = commission_row.id;

    allocation_amount := least(remaining_amount, greatest(available_amount, 0));
    if allocation_amount > 0 then
      insert into public.commission_payment_allocations (
        commission_payment_id,
        provider_commission_id,
        amount
      )
      values (
        p_payment_id,
        commission_row.id,
        allocation_amount
      );

      remaining_amount := remaining_amount - allocation_amount;

      if allocation_amount = available_amount then
        update public.provider_commissions
        set status = 'paid',
            paid_at = now()
        where id = commission_row.id;
      end if;
    end if;
  end loop;

  if remaining_amount > 0 then
    raise exception 'This transfer exceeds the recorded outstanding commission allocations.';
  end if;

  update public.commission_payments
  set status = 'confirmed',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_payment_id;
end;
$$;

create or replace function public.reject_commission_payment(
  p_payment_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Administrator access required.';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Enter a reason for rejecting this transfer.';
  end if;

  select status into payment_status
  from public.commission_payments
  where id = p_payment_id
  for update;

  if not found or payment_status <> 'pending' then
    raise exception 'Pending commission payment not found.';
  end if;

  update public.commission_payments
  set status = 'rejected',
      admin_note = trim(p_note),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_payment_id;
end;
$$;

revoke all on function public.create_booking_completion_code() from public, anon, authenticated;
revoke all on function public.require_pin_for_booking_completion() from public, anon, authenticated;
revoke all on function public.prevent_cash_booking_financial_edits() from public, anon, authenticated;
revoke all on function public.enforce_cash_commission_limit() from public, anon, authenticated;
revoke all on function public.get_booking_completion_pin(uuid) from public, anon;
revoke all on function public.confirm_booking_completion(uuid, text) from public, anon;
revoke all on function public.submit_commission_payment(numeric, text, text) from public, anon;
revoke all on function public.confirm_commission_payment(uuid) from public, anon;
revoke all on function public.reject_commission_payment(uuid, text) from public, anon;
grant execute on function public.get_booking_completion_pin(uuid) to authenticated;
grant execute on function public.confirm_booking_completion(uuid, text) to authenticated;
grant execute on function public.submit_commission_payment(numeric, text, text) to authenticated;
grant execute on function public.confirm_commission_payment(uuid) to authenticated;
grant execute on function public.reject_commission_payment(uuid, text) to authenticated;
