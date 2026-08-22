alter table public.services
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.services
  add constraint services_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint services_longitude_range check (longitude is null or longitude between -180 and 180);