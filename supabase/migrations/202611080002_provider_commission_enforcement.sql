alter table public.settings
  add column if not exists provider_commission_limit numeric not null default 10000;

update public.settings
set provider_commission_limit = 10000
where id = (select min(id) from public.settings)
  and coalesce(provider_commission_limit, 0) <= 0;

alter table public.settings
  add constraint settings_provider_commission_limit_positive
  check (provider_commission_limit > 0);

alter table public.provider_commissions
  add column if not exists due_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

update public.provider_commissions
set due_at = now() + interval '7 days'
where due_at is null
  and status = 'owed';

update public.provider_commissions
set due_at = created_at + interval '7 days'
where due_at is null;

alter table public.provider_commissions
  alter column due_at set not null;

create index if not exists provider_commissions_provider_due_idx
  on public.provider_commissions(provider_id, due_at)
  where status = 'owed';

create table if not exists public.provider_commission_agreements (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.users(id) on delete cascade,
  policy_version text not null,
  commission_rate numeric not null check (commission_rate >= 0 and commission_rate <= 100),
  commission_limit numeric not null check (commission_limit > 0),
  accepted_at timestamptz not null default now()
);

create index if not exists provider_commission_agreements_provider_accepted_idx
  on public.provider_commission_agreements(provider_id, accepted_at desc);

alter table public.provider_commission_agreements enable row level security;
grant insert, select on public.provider_commission_agreements to authenticated;

drop policy if exists "Providers can record their commission agreement" on public.provider_commission_agreements;
create policy "Providers can record their commission agreement"
  on public.provider_commission_agreements for insert to authenticated
  with check (provider_id = auth.uid());

drop policy if exists "Providers and admins can read commission agreements" on public.provider_commission_agreements;
create policy "Providers and admins can read commission agreements"
  on public.provider_commission_agreements for select to authenticated
  using (provider_id = auth.uid() or public.is_platform_admin());

create or replace function public.require_current_provider_commission_agreement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rate numeric := 10;
  current_limit numeric := 10000;
begin
  if new.provider_id is null then
    return new;
  end if;

  select coalesce(commission, 10), coalesce(provider_commission_limit, 10000)
    into current_rate, current_limit
  from public.settings
  order by id
  limit 1;

  if not exists (
    select 1
    from public.provider_commission_agreements agreement
    where agreement.provider_id = new.provider_id
      and agreement.policy_version = 'commission-2026-11-v1'
      and agreement.commission_rate = current_rate
      and agreement.commission_limit = current_limit
  ) then
    raise exception 'Accept the current provider commission policy before publishing or editing a service.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_provider_commission_agreement_on_service on public.services;
create trigger require_provider_commission_agreement_on_service
  before insert or update on public.services
  for each row execute function public.require_current_provider_commission_agreement();

create or replace function public.set_provider_commission_due_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.provider_id::text));
  end if;
  if new.due_at is null then
    new.due_at := coalesce(new.created_at, now()) + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists set_provider_commission_due_date_on_insert on public.provider_commissions;
create trigger set_provider_commission_due_date_on_insert
  before insert on public.provider_commissions
  for each row execute function public.set_provider_commission_due_date();

create or replace function public.notify_provider_commission_assessed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, read, created_at)
  values (
    new.provider_id,
    'provider_commission_due',
    'Commission payment due',
    format(
      'A commission of %s %s was recorded. Please settle it by %s (within 7 days) from your Provider Dashboard.',
      new.commission_amount,
      new.currency_code,
      to_char(new.due_at at time zone 'UTC', 'YYYY-MM-DD')
    ),
    false,
    now()
  );
  return new;
end;
$$;

drop trigger if exists notify_provider_commission_assessed_on_insert on public.provider_commissions;
create trigger notify_provider_commission_assessed_on_insert
  after insert on public.provider_commissions
  for each row execute function public.notify_provider_commission_assessed();

create or replace function public.lock_provider_commission_account_on_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    (new.status = 'completed' and old.status is distinct from 'completed')
    or (new.booking_status = 'completed' and old.booking_status is distinct from 'completed')
  ) and new.provider_id is not null
    and lower(coalesce(new.payment_method, '')) in ('cash', 'reserve_cash') then
    perform pg_advisory_xact_lock(hashtext(new.provider_id::text));
  end if;
  return new;
end;
$$;

drop trigger if exists lock_provider_commission_account_on_completion on public.bookings;
create trigger lock_provider_commission_account_on_completion
  before update on public.bookings
  for each row execute function public.lock_provider_commission_account_on_completion();

create or replace function public.send_provider_commission_overdue_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  with due_commissions as (
    update public.provider_commissions
    set reminder_sent_at = now()
    where provider_id = auth.uid()
      and status = 'owed'
      and due_at <= now()
      and reminder_sent_at is null
    returning id, commission_amount, currency_code
  ),
  totals_by_currency as (
    select due_commissions.currency_code,
      sum(greatest(due_commissions.commission_amount - coalesce(allocated.amount, 0), 0)) as amount
    from due_commissions
    left join lateral (
      select sum(allocation.amount) as amount
      from public.commission_payment_allocations allocation
      where allocation.provider_commission_id = due_commissions.id
    ) allocated on true
    group by due_commissions.currency_code
  )
  insert into public.notifications (user_id, type, title, message, read, created_at)
  select
    auth.uid(),
    'provider_commission_overdue',
    'Commission payment overdue',
    format(
      'Your outstanding commission is overdue: %s. New bookings are restricted until your overdue commission is settled.',
      string_agg(format('%s %s', amount, currency_code), ', ')
    ),
    false,
    now()
  from totals_by_currency
  having count(*) > 0;

  get diagnostics reminder_count = row_count;
  return reminder_count;
end;
$$;

create or replace function public.enforce_provider_commission_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_limit numeric := 10000;
  configured_rate numeric := 10;
  current_ngn_balance numeric := 0;
  pending_ngn_commission numeric := 0;
  proposed_commission numeric := 0;
  service_provider_id uuid;
  service_price numeric;
  group_threshold integer := 0;
  group_discount numeric := 0;
  expected_per_person numeric;
  people_count integer;
  service_currency text := 'NGN';
begin
  if new.provider_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.provider_id::text));

  if exists (
    select 1
    from public.provider_commissions
    where provider_id = new.provider_id
      and status = 'owed'
      and due_at <= now()
  ) then
    raise exception 'New bookings are paused because a commission payment is overdue. Please settle the overdue amount.';
  end if;

  select coalesce(provider_commission_limit, 10000), coalesce(commission, 10)
    into configured_limit, configured_rate
  from public.settings
  order by id
  limit 1;

  if not exists (
    select 1
    from public.provider_commission_agreements agreement
    where provider_id = new.provider_id
      and policy_version = 'commission-2026-11-v1'
      and agreement.commission_rate = configured_rate
      and agreement.commission_limit = configured_limit
  ) then
    raise exception 'This provider must accept the current commission policy before receiving new bookings.';
  end if;

  select greatest(
      coalesce((
        select outstanding_balance
        from public.provider_balances
        where provider_id = new.provider_id and currency_code = 'NGN'
      ), 0),
      coalesce((
        select sum(greatest(commission.commission_amount - coalesce(allocated.amount, 0), 0))
        from public.provider_commissions commission
        left join lateral (
          select sum(allocation.amount) as amount
          from public.commission_payment_allocations allocation
          where allocation.provider_commission_id = commission.id
        ) allocated on true
        where commission.provider_id = new.provider_id
          and commission.currency_code = 'NGN'
          and commission.status = 'owed'
      ), 0)
    )
    into current_ngn_balance;

  if configured_limit > 0 and current_ngn_balance >= configured_limit then
    raise exception 'New bookings are paused because your outstanding NGN commission has reached the platform limit. Please settle your balance.';
  end if;

  select coalesce(sum(
      coalesce(b.price_per_person, 0)
      * greatest(coalesce(b.number_of_people, 1), 1)
      * coalesce(configured_rate, 10) / 100
    ), 0)
    into pending_ngn_commission
  from public.bookings b
  join public.services svc on svc.id = b.service_id
  where b.provider_id = new.provider_id
    and lower(coalesce(b.payment_method, '')) in ('cash', 'reserve_cash')
    and lower(coalesce(b.status, '')) not in ('completed', 'cancelled', 'declined', 'disputed')
    and coalesce(svc.currency_code, 'NGN') = 'NGN';

  if configured_limit > 0
     and current_ngn_balance + pending_ngn_commission >= configured_limit then
    raise exception 'New bookings are paused because your current and pending NGN commission has reached the platform limit. Please settle your balance.';
  end if;

  if lower(coalesce(new.payment_method, '')) in ('cash', 'reserve_cash') then
    if new.service_id is null then
      raise exception 'Cash payment is available for provider service bookings only.';
    end if;

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

    if configured_limit > 0 and service_currency = 'NGN' then
      proposed_commission :=
        expected_per_person * people_count * coalesce(configured_rate, 10) / 100;

      if current_ngn_balance + pending_ngn_commission + proposed_commission >= configured_limit then
        raise exception 'This booking would reach the NGN commission limit. Please settle your balance before accepting more bookings.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_cash_commission_limit_on_booking on public.bookings;
drop trigger if exists enforce_provider_commission_booking_limit_on_insert on public.bookings;
create trigger enforce_provider_commission_booking_limit_on_insert
  before insert on public.bookings
  for each row execute function public.enforce_provider_commission_booking_limit();

revoke all on function public.require_current_provider_commission_agreement() from public, anon, authenticated;
revoke all on function public.set_provider_commission_due_date() from public, anon, authenticated;
revoke all on function public.notify_provider_commission_assessed() from public, anon, authenticated;
revoke all on function public.lock_provider_commission_account_on_completion() from public, anon, authenticated;
revoke all on function public.enforce_provider_commission_booking_limit() from public, anon, authenticated;
revoke all on function public.send_provider_commission_overdue_reminders() from public, anon;
grant execute on function public.send_provider_commission_overdue_reminders() to authenticated;
