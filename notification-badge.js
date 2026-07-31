import { supabase } from './supabase.js';

const badge = document.getElementById('notificationBadge');
let currentUser = null;
let badgeChannel = null;

function clearBadgeState() {
  currentUser = null;

  if (badgeChannel) {
    supabase.removeChannel(badgeChannel);
    badgeChannel = null;
  }

  updateBadge(0);
}

async function loadUnreadCount() {
  if (!currentUser || !badge) return;

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${currentUser.id},userId.eq.${currentUser.id}`)
      .eq('read', false);

    if (error) {
      console.warn('Notification badge query failed, trying fallback:', error);
      const { count: fallbackCount, error: fallbackError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('read', false);

      if (fallbackError) {
        console.error('Error loading notification badge count:', fallbackError);
        return;
      }

      updateBadge(fallbackCount || 0);
      return;
    }

    updateBadge(count || 0);
  } catch (err) {
    console.error('Error loading notification badge count:', err);
  }
}

function updateBadge(count) {
  if (!badge) return;

  const safeCount = Number(count || 0);

  if (safeCount <= 0) {
    badge.classList.add('hidden');
    badge.textContent = '';
    return;
  }

  badge.classList.remove('hidden');
  badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
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
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      clearBadgeState();
      return;
    }

    currentUser = user;
    await loadUnreadCount();
    setupBadgeRealtime();
  } catch (err) {
    console.error('Badge initialization failed:', err);
  }
}

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    clearBadgeState();
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    currentUser = session.user;
    await loadUnreadCount();
    setupBadgeRealtime();
  }
});

window.addEventListener('beforeunload', () => {
  if (badgeChannel) {
    supabase.removeChannel(badgeChannel);
  }
});

window.addEventListener('notifications:updated', async (event) => {
  const detail = event?.detail || {};

  if (detail.markAll) {
    updateBadge(0);
    return;
  }

  if (detail.source === 'chat') {
    await loadUnreadCount();
    return;
  }

  updateBadge(0);
});

initializeBadge();