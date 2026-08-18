-- Allow Vora administrators to create in-app notifications for any user.
-- Reuses public.is_vora_admin() from the admin-settings migration.
alter table public.notifications enable row level security;

drop policy if exists "Admins can send notifications" on public.notifications;
create policy "Admins can send notifications"
on public.notifications
for insert
to authenticated
with check (public.is_vora_admin());
