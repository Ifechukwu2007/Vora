import { supabase } from './supabase.js';

const list = document.getElementById('list');
const markAllBtn = document.getElementById('markAll');
let currentUser = null;
let notificationChannel = null;

function getNotificationStyle(type) {
  const notificationStyles = {
    offer_received: { icon: '💰', color: 'bg-blue-50 border-blue-200', category: 'Offers' },
    offer_accepted: { icon: '✅', color: 'bg-green-50 border-green-200', category: 'Offers' },
    offer_rejected: { icon: '❌', color: 'bg-red-50 border-red-200', category: 'Offers' },
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

function emptyState() {
  return `
    <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-12 rounded-xl shadow text-center border border-gray-200">
      <p class="text-5xl mb-3">📭</p>
      <p class="text-lg font-semibold text-gray-700">All caught up!</p>
      <p class="text-sm text-gray-500 mt-2">No notifications yet. Your activities will appear here.</p>
    </div>
  `;
}

function renderNotifications(items) {
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
      ${style.color} border-l-4 p-5 rounded-lg shadow
      flex justify-between items-start gap-4
      cursor-pointer transition hover:shadow-lg hover:translate-x-1
      ${read ? 'opacity-75' : 'opacity-100'}
    `;

    item.innerHTML = `
      <div class="flex gap-3 flex-1">
        <div class="text-3xl">${style.icon}</div>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <p class="font-bold ${read ? 'text-gray-600' : 'text-black'}">${title}</p>
            <span class="text-xs px-2 py-1 rounded-full ${read ? 'bg-gray-200 text-gray-600' : 'bg-blue-200 text-blue-700'} font-medium">${style.category}</span>
          </div>
          <p class="text-sm text-gray-700 mb-2">${message}</p>
          <p class="text-xs text-gray-500">${timeStr}</p>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="text-xs px-3 py-1 rounded-full ${read ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'} font-medium">${read ? 'Read' : 'New'}</span>
      </div>
    `;

    item.addEventListener('click', async () => {
      try {
        if (!n.read) {
          await supabase
            .from('notifications')
            .update({ read: true, updated_at: new Date().toISOString() })
            .eq('id', n.id);
        }

        if (n.metadata?.link) {
          window.location.href = n.metadata.link;
        }
      } catch (error) {
        console.error('Error updating notification:', error);
      }
    });

    list.appendChild(item);
  });
}

async function fetchNotifications() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${currentUser.id},userId.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notifications:', error);
    list.innerHTML = `
      <div class="bg-red-50 border border-red-200 p-4 rounded-xl">
        <p class="text-red-600 font-semibold">Failed to load notifications</p>
      </div>
    `;
    return;
  }

  renderNotifications(data || []);
}

function setupRealTimeUpdates() {
  if (!currentUser) return;
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel);
    notificationChannel = null;
  }

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
    .subscribe();
}

async function initializeNotifications() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;
  await fetchNotifications();
  setupRealTimeUpdates();
}

markAllBtn?.addEventListener('click', async () => {
  if (!currentUser) return;

  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .or(`user_id.eq.${currentUser.id},userId.eq.${currentUser.id}`);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    return;
  }

  await fetchNotifications();
});

window.addEventListener('beforeunload', () => {
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel);
  }
});

initializeNotifications();
