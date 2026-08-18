-- Permit only authenticated Vora administrators to change platform settings.
-- The function is SECURITY DEFINER so it can safely check the users table
-- without depending on that table's own RLS policies.
create or replace function public.is_vora_admin()
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

revoke all on function public.is_vora_admin() from public;
grant execute on function public.is_vora_admin() to authenticated;

alter table public.settings enable row level security;

drop policy if exists "Admins can insert platform settings" on public.settings;
create policy "Admins can insert platform settings"
on public.settings
for insert
to authenticated
with check (public.is_vora_admin());

drop policy if exists "Admins can update platform settings" on public.settings;
create policy "Admins can update platform settings"
on public.settings
for update
to authenticated
using (public.is_vora_admin())
with check (public.is_vora_admin());
