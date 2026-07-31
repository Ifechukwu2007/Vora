import { supabase } from './supabase.js';

const list = document.getElementById('list');
const markAllBtn = document.getElementById('markAll');
let currentUser = null;
let notificationChannel = null;
let notificationsCache = [];

function stopRealtimeUpdates() {
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel);
    notificationChannel = null;
  }
}

function getNotificationStyle(type) { 
  const notificationStyles = {
    offer_received: { icon: '💰', color: 'bg-blue-50 border-blue-200', category: 'Offers' },
    offer_accepted: { icon: '✅', color: 'bg-green-50 border-green-200', category: 'Offers' },
    offer_rejected: { icon: '❌', color: 'bg-red-50 border-red-200', category: 'Offers' },
    booking_request: { icon: '🔔', color: 'bg-purple-50 border-purple-200', category: 'Bookings' },
    booking_confirmed: { icon: '📅', color: 'bg-purple-50 border-purple-200', category: 'Bookings' },
    booking_cancelled: { icon: '⛔', color: 'bg-orange-50 border-orange-200', category: 'Bookings' },
    booking_completed: { icon: '🎉', color: 'bg-green-50 border-green-200', category: 'Bookings' },
    new_message: { icon: '💬', color: 'bg-indigo-50 border-indigo-200', category: 'Messages' },
    payment_received: { icon: '💳', color: 'bg-green-50 border-green-200', category: 'Payments' },
    payment_failed: { icon: '⚠️', color: 'bg-red-50 border-red-200', category: 'Payments' },
    new_request: { icon: '📋', color: 'bg-yellow-50 border-yellow-200', category: 'Requests' },
    review_received: { icon: '⭐', color: 'bg-amber-50 border-amber-200', category: 'Reviews' },
    review_response: { icon: '📝', color: 'bg-amber-50 border-amber-200', category: 'Reviews' },
    profile_viewed: { icon: '👀', color: 'bg-gray-50 border-gray-200', category: 'Activity' },
    service_approved: { icon: '✅', color: 'bg-green-50 border-green-200', category: 'Services' },
    service_rejected: { icon: '❌', color: 'bg-red-50 border-red-200', category: 'Services' },
    verification_update: { icon: '🔐', color: 'bg-blue-50 border-blue-200', category: 'Account' },
    payout_processed: { icon: '💰', color: 'bg-green-50 border-green-200', category: 'Payouts' },
    update: { icon: '📢', color: 'bg-gray-50 border-gray-200', category: 'Updates' }
  };
  return notificationStyles[type] || notificationStyles.update;
}

function getNotificationDestination(type) {
  const destinations = {
    message: 'my-messages.html',
    new_message: 'my-messages.html',
    booking_request: 'provider-bookings.html',
    booking_confirmed: 'provider-bookings.html',
    booking_cancelled: 'provider-bookings.html',
    booking_completed: 'provider-bookings.html',
    new_booking: 'provider-bookings.html',
    payment_received: 'provider-bookings.html',
    payment_failed: 'provider-bookings.html',
    payout_processed: 'provider-bookings.html',
    review_received: 'provider-reviews.html',
    review_response: 'provider-reviews.html',
    new_request: 'my-requests.html',
    offer_received: 'my-bookings.html',
    offer_accepted: 'my-bookings.html',
    offer_rejected: 'my-bookings.html',
    service_approved: 'my-services.html',
    service_rejected: 'my-services.html',
    verification_update: 'settings.html',
    profile_viewed: 'profile.html'
  };

  return destinations[type] || 'notifications.html';
}

function resolveNotificationDestination(notification) {
  if (notification?.metadata?.link) {
    return notification.metadata.link;
  }

  if (typeof notification?.metadata === 'string' && notification.metadata.trim()) {
    return notification.metadata;
  }

  return getNotificationDestination(notification?.type);
}

async function pruneReadNotificationsOlderThanSevenDays() {
  if (!currentUser) return;

  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('read', true)
      .lt('created_at', cutoff);

    if (error) {
      console.warn('Unable to prune old read notifications:', error);
    }
  } catch (err) {
    console.error('Exception pruning old read notifications:', err);
  }
}

function formatTime(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function signedOutState() {
  return `
    <div class="bg-white p-8 rounded-xl shadow border border-gray-200 text-center">
      <p class="text-5xl mb-3">🔔</p>
      <p class="text-lg font-semibold text-gray-800">Sign in to view your notifications</p>
      <p class="text-sm text-gray-500 mt-2">Your alerts and updates will appear here once you're signed in.</p>
      <div class="mt-5 flex items-center justify-center gap-3 flex-wrap">
        <a href="login.html" class="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Login</a>
        <a href="register.html" class="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Create account</a>
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-12 rounded-xl shadow text-center border border-gray-200">
      <p class="text-5xl mb-3">📭</p>
      <p class="text-lg font-semibold text-gray-700">All caught up!</p>
      <p class="text-sm text-gray-500 mt-2">No notifications yet. Your activities will appear here.</p>
    </div>
  `;
}

async function markNotificationAsRead(notificationId) {
  if (!notificationId || !currentUser) return false;

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', currentUser.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }

    notificationsCache = notificationsCache.map((item) =>
      item.id === notificationId ? { ...item, read: true, read_at: new Date().toISOString() } : item
    );

    const card = list?.querySelector(`[data-notification-id="${notificationId}"]`);
    if (card) {
      card.innerHTML = `
        <div class="flex gap-3 flex-1">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-xl shadow-sm">${getNotificationStyle(notificationsCache.find((item) => item.id === notificationId)?.type || 'update').icon}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <p class="font-semibold text-gray-700">${notificationsCache.find((item) => item.id === notificationId)?.title || 'Notification'}</p>
              <span class="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">${getNotificationStyle(notificationsCache.find((item) => item.id === notificationId)?.type || 'update').category}</span>
            </div>
            <p class="text-sm text-gray-700 leading-5">${notificationsCache.find((item) => item.id === notificationId)?.message || 'No message provided'}</p>
            <p class="text-xs text-gray-500 mt-2">${formatTime(new Date(notificationsCache.find((item) => item.id === notificationId)?.created_at || Date.now()))}</p>
          </div>
        </div>
        <div class="flex flex-col items-end gap-2 shrink-0">
          <span class="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-semibold">Read</span>
          <span class="text-[11px] text-gray-400">Open</span>
        </div>
      `;
      card.className = `${card.className.replace(/opacity-[^\s]+/g, '').trim()} opacity-80`;
    } else {
      renderNotifications(notificationsCache);
    }

    await pruneReadNotificationsOlderThanSevenDays();

    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('notifications:updated'));
    }

    return true;
  } catch (err) {
    console.error('Exception marking notification as read:', err);
    return false;
  }
}

function renderNotifications(items) {
  notificationsCache = Array.isArray(items) ? items : [];

  if (!list) return;

  if (!items || items.length === 0) {
    list.innerHTML = emptyState();
    return;
  }

  list.innerHTML = '';

  items.forEach((n) => {
    const style = getNotificationStyle(n.type);
    const title = n.title || 'Notification';
    const message = n.message || 'No message provided';
    const read = n.read || false;
    const createdAt = n.created_at ? new Date(n.created_at) : new Date();
    const timeStr = formatTime(createdAt);

    const item = document.createElement('div');
    item.className = `
      ${style.color} border border-gray-200 rounded-2xl p-4 shadow-sm
      flex justify-between items-start gap-4
      cursor-pointer transition hover:shadow-md hover:-translate-y-0.5
      ${read ? 'opacity-80' : 'opacity-100'}
    `;
    item.dataset.notificationId = n.id;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', title);

    item.innerHTML = `
      <div class="flex gap-3 flex-1">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-xl shadow-sm">${style.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <p class="font-semibold ${read ? 'text-gray-700' : 'text-gray-900'}">${title}</p>
            <span class="text-[11px] px-2 py-1 rounded-full ${read ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'} font-medium">${style.category}</span>
          </div>
          <p class="text-sm text-gray-700 leading-5">${message}</p>
          <p class="text-xs text-gray-500 mt-2">${timeStr}</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        <span class="text-[11px] px-2.5 py-1 rounded-full ${read ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-700'} font-semibold">${read ? 'Read' : 'New'}</span>
        <span class="text-[11px] text-gray-400">Open</span>
      </div>
    `;

    const openNotification = async () => {
      try {
        if (!n.read) {
          await markNotificationAsRead(n.id);
        }

        const destination = resolveNotificationDestination(n);
        if (destination) {
          window.location.href = destination;
        }
      } catch (error) {
        console.error('Error updating notification:', error);
      }
    };

    item.addEventListener('click', () => {
      openNotification();
    });

    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openNotification();
      }
    });

    list.appendChild(item);
  });
}

async function fetchNotifications() {
  if (!currentUser) {
    if (list) {
      list.innerHTML = signedOutState();
    }
    return;
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      if (list) {
        list.innerHTML = `
          <div class="bg-red-50 border border-red-200 p-4 rounded-xl">
            <p class="text-red-600 font-semibold">Failed to load notifications</p>
          </div>
        `;
      }
      return;
    }

    renderNotifications(data || []);
  } catch (err) {
    console.error('Exception fetching notifications:', err);
  }
}

function setupRealTimeUpdates() {
  if (!currentUser) return;

  try {
    stopRealtimeUpdates();

    notificationChannel = supabase
      .channel(`notifications-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        () => fetchNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        () => fetchNotifications()
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('Notification realtime status:', status);
        }
      });
  } catch (err) {
    console.error('Error setting up real-time updates:', err);
    notificationChannel = null;
  }
}

async function initializeNotifications() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      currentUser = null;
      stopRealtimeUpdates();
      if (list) {
        list.innerHTML = signedOutState();
      }
      if (markAllBtn) {
        markAllBtn.classList.add('hidden');
      }
      return;
    }

    currentUser = user;
    await fetchNotifications();
    setupRealTimeUpdates();
  } catch (err) {
    console.error('Error initializing notifications:', err);
    currentUser = null;
    stopRealtimeUpdates();
    if (list) {
      list.innerHTML = signedOutState();
    }
  }
}

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    stopRealtimeUpdates();
    if (list) {
      list.innerHTML = signedOutState();
    }
    if (markAllBtn) {
      markAllBtn.classList.add('hidden');
    }
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    currentUser = session.user;
    if (markAllBtn) {
      markAllBtn.classList.remove('hidden');
    }
    await fetchNotifications();
    setupRealTimeUpdates();
  }
});

markAllBtn?.addEventListener('click', async () => {
  if (!currentUser) {
    if (list) {
      list.innerHTML = signedOutState();
    }
    return;
  }

  if (markAllBtn) {
    markAllBtn.disabled = true;
    markAllBtn.textContent = 'Updating...';
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', currentUser.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return;
    }

    notificationsCache = notificationsCache.map((item) => ({
      ...item,
      read: true,
      read_at: new Date().toISOString()
    }));

    renderNotifications(notificationsCache);

    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('notifications:updated', { detail: { markAll: true } }));
    }
  } catch (err) {
    console.error('Exception marking notifications as read:', err);
  } finally {
    if (markAllBtn) {
      markAllBtn.disabled = false;
      markAllBtn.textContent = 'Mark all as read';
    }
  }
});

window.addEventListener('beforeunload', () => {
  stopRealtimeUpdates();
});

initializeNotifications();
 