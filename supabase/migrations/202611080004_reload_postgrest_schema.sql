do $$
begin
  if to_regprocedure('public.submit_commission_payment(numeric,text,text)') is null then
    raise exception 'Missing public.submit_commission_payment(numeric,text,text). Apply migration 202611080001_provider_commissions.sql first.';
  end if;

  if to_regprocedure('public.send_provider_commission_overdue_reminders()') is null then
    raise exception 'Missing public.send_provider_commission_overdue_reminders(). Apply migration 202611080002_provider_commission_enforcement.sql first.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
