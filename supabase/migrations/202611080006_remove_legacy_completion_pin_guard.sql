do $$
declare
  completion_trigger record;
  pin_guard regprocedure := to_regprocedure('public.require_pin_for_booking_completion()');
begin
  for completion_trigger in
    select trigger_row.tgname
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.bookings'::regclass
      and not trigger_row.tgisinternal
      and (
        trigger_row.tgname = 'require_pin_for_booking_completion_on_update'
        or (pin_guard is not null and trigger_row.tgfoid = pin_guard)
      )
  loop
    execute format(
      'drop trigger %I on public.bookings',
      completion_trigger.tgname
    );
  end loop;
end;
$$;

drop function if exists public.require_pin_for_booking_completion();
drop function if exists public.create_booking_completion_code();
drop function if exists public.get_booking_completion_pin(uuid);
drop function if exists public.confirm_booking_completion(uuid, text);
drop table if exists public.booking_completion_codes;

create or replace function public.confirm_booking_completion(p_booking_id uuid)
returns table(success boolean, commission_amount numeric, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.bookings%rowtype;
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

  if lower(coalesce(booking_row.status, '')) = 'completed' then
    select coalesce(commission_amount, 0)
      into assessed_commission
    from public.provider_commissions
    where booking_id = p_booking_id;
    return query select true, coalesce(assessed_commission, 0), 'Booking is already completed.';
    return;
  end if;

  if lower(coalesce(booking_row.status, '')) not in ('in_progress', 'completed_by_provider', 'awaiting_customer_confirmation') then
    raise exception 'Only a service in progress can be marked complete.';
  end if;

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

revoke all on function public.confirm_booking_completion(uuid) from public, anon;
grant execute on function public.confirm_booking_completion(uuid) to authenticated;

notify pgrst, 'reload schema';
