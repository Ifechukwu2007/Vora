import { supabase } from './supabase.js';

const badge = document.getElementById('notificationBadge');
let currentUser = null;
let badgeChannel = null;
let notificationAudioContext = null;
const SOUND_SETTING_KEY = 'vorabukeen_notification_sounds';
const SOUND_NOTIFICATION_TYPES = new Set([
  'message',
  'new_message',
  'booking_request',
  'new_booking',
  'booking_confirmed',
  'booking_cancelled',
  'offer_received',
  'offer_accepted',
  'offer_rejected',
  'payment_received',
  'review_received',
  'update'
]);

function unlockNotificationSound() {
  if (!notificationAudioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    notificationAudioContext = new AudioContext();
  }

  if (notificationAudioContext.state === 'suspended') {
    notificationAudioContext.resume().catch(() => {});
  }
}

window.voraTestNotificationSound = () => {
  unlockNotificationSound();
  if (notificationAudioContext?.state === 'suspended') {
    notificationAudioContext.resume().then(playNotificationSound).catch(() => {});
    return;
  }
  playNotificationSound();
};

function playNotificationSound() {
  if (localStorage.getItem(SOUND_SETTING_KEY) === 'false') return;
  if (!notificationAudioContext || notificationAudioContext.state !== 'running') return;

  const now = notificationAudioContext.currentTime;
  const oscillator = notificationAudioContext.createOscillator();
  const gain = notificationAudioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(660, now);
  oscillator.frequency.setValueAtTime(880, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.7, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  oscillator.connect(gain);
  gain.connect(notificationAudioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.25);
}

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
      (payload) => {
        if (SOUND_NOTIFICATION_TYPES.has(payload?.new?.type)) playNotificationSound();
        loadUnreadCount();
      }
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

window.addEventListener('pointerdown', unlockNotificationSound, { passive: true });
window.addEventListener('keydown', unlockNotificationSound, { passive: true });