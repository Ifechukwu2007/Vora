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

do $$
declare
  function_signature regprocedure;
  function_definition text;
  corrected_definition text;
begin
  foreach function_signature in array array[
    'public.enforce_cash_commission_limit()'::regprocedure,
    'public.confirm_booking_completion(uuid,text)'::regprocedure,
    'public.require_current_provider_commission_agreement()'::regprocedure,
    'public.enforce_provider_commission_booking_limit()'::regprocedure
  ]
  loop
    function_definition := pg_get_functiondef(function_signature);
    corrected_definition := regexp_replace(
      function_definition,
      'where[[:space:]]+id[[:space:]]*=[[:space:]]*''platform''',
      'order by id limit 1',
      'gi'
    );
    corrected_definition := replace(
      corrected_definition,
      'coalesce(max(commission), 10)',
      'coalesce(commission, 10)'
    );
    corrected_definition := replace(
      corrected_definition,
      'coalesce(max(provider_commission_limit), 10000)',
      'coalesce(provider_commission_limit, 10000)'
    );

    if corrected_definition = function_definition
       and function_definition ~* 'where[[:space:]]+id[[:space:]]*=[[:space:]]*''platform''' then
      raise exception 'Could not update settings lookup in %.', function_signature;
    end if;

    if corrected_definition <> function_definition then
      execute corrected_definition;
    end if;
  end loop;
end;
$$;
