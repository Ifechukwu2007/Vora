alter table public.services
  add column if not exists travels_to_customer boolean not null default false,
  add column if not exists travel_pricing jsonb;

comment on column public.services.travel_pricing is 'Provider travel rules. Legacy arrays store distance bands; current values use {"mode":"distance|location|both","baseLocation":{"country":"Nigeria","state":"Anambra","city":"Onitsha","area":"Fegge"},"distanceBands":[{"maxKm":5,"fee":1000}],"locationRates":[{"state":"Enugu","city":"Nsukka","location":"Nsukka, Enugu","fee":7000}]}.';