alter table public.users
  add column if not exists country_code text,
  add column if not exists currency_code text,
  add column if not exists landmark text;

alter table public.profiles
  add column if not exists country_code text,
  add column if not exists currency_code text,
  add column if not exists landmark text;

alter table public.services
  add column if not exists country_code text,
  add column if not exists currency_code text;

update public.users
set country_code = case country
  when 'Nigeria' then 'NG'
  when 'South Africa' then 'ZA'
  when 'Ghana' then 'GH'
  when 'United States' then 'US'
  when 'United Kingdom' then 'GB'
  when 'Canada' then 'CA'
  when 'Australia' then 'AU'
  when 'India' then 'IN'
  else country_code
end
where country_code is null and country is not null;

update public.users
set currency_code = case country_code
  when 'NG' then 'NGN'
  when 'ZA' then 'ZAR'
  when 'GH' then 'GHS'
  when 'US' then 'USD'
  when 'GB' then 'GBP'
  when 'CA' then 'CAD'
  when 'AU' then 'AUD'
  when 'IN' then 'INR'
  else 'NGN'
end
where currency_code is null;

update public.profiles p
set country_code = u.country_code,
  currency_code = u.currency_code,
  landmark = u.landmark
from public.users u
where p.id = u.uid
  and (p.country_code is null or p.currency_code is null);

comment on column public.users.country_code is 'ISO 3166-1 alpha-2 country code; independent from currency.';
comment on column public.users.currency_code is 'ISO 4217 currency code; defaults from country for the MVP but may differ later.';
comment on column public.services.country_code is 'Provider/service country code.';
comment on column public.services.currency_code is 'Currency used for this service price and travel fees.';
