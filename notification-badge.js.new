import { supabase } from './supabase.js';

const badge = document.getElementById('notificationBadge');
let currentUser = null;
let badgeChannel = null;

async function loadUnreadCount() {
  if (!currentUser || !badge) return;

  const { data, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .or(`user_id.eq.${currentUser.id},userId.eq.${currentUser.id}`)
    .eq('read', false);

  if (error) {
    console.error('Error loading notification badge count:', error);
    return;
  }

  const unreadCount = data?.length || 0;
  updateBadge(unreadCount);
}

function updateBadge(count) {
  if (!badge) return;

  if (count <= 0) {
    badge.classList.add('hidden');
    return;
  }

  badge.classList.remove('hidden');
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.add('animate-pulse');
  setTimeout(() => {
    badge.classList.remove('animate-pulse');
  }, 3000);
}

function setupBadgeRealtime() {
  if (!currentUser) return;
  if (badgeChannel) {
    supabase.removeChannel(badgeChannel);
    badgeChannel = null;
  }

  badgeChannel = supabase
    .channel(`notification-badge-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
      () => loadUnreadCount()
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
      () => loadUnreadCount()
    )
    .subscribe();
}

async function initializeBadge() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;

  currentUser = user;
  await loadUnreadCount();
  setupBadgeRealtime();
}

window.addEventListener('beforeunload', () => {
  if (badgeChannel) {
    supabase.removeChannel(badgeChannel);
  }
});

initializeBadge();
