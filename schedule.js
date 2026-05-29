import { supabase } from './supabase.js';

/**
 * =========================
 * STATE
 * =========================
 */
let currentDate = new Date();
let bookings = [];
let availability = [];
let currentUser = null;

/**
 * =========================
 * INIT
 * =========================
 */
document.addEventListener('DOMContentLoaded', async () => {
  await initUser();
  await loadData();

  setupProfileImage();
  setupHamburgerMenu();

  renderCalendar();
  renderStats();
  renderUpcomingBookings();

  setupForm();
  setupCalendarButtons();
});

/**
 * =========================
 * GET USER
 * =========================
 */
async function initUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data?.user || null;

  if (!currentUser) {
    window.location.href = 'login.html';
  }
}

/**
 * =========================
 * LOAD DATA
 * =========================
 */
async function loadData() {
  if (!currentUser) return;

  const userId = currentUser.id;

  const { data: bookingData } = await supabase
    .from('bookings')
    .select('*')
    .eq('provider_id', userId);

  const { data: availabilityData } = await supabase
    .from('availability')
    .select('*')
    .eq('provider_id', userId);

  bookings = bookingData || [];
  availability = availabilityData || [];
}

/**
 * =========================
 * PROFILE IMAGE FIX
 * =========================
 */
function setupProfileImage() {
  const profileIcon = document.querySelector('[data-profile-icon="true"]');

  if (!profileIcon || !currentUser) return;

  const avatar =
    currentUser.user_metadata?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      currentUser.email || 'User'
    )}`;

  profileIcon.innerHTML = `
    <img 
      src="${avatar}" 
      class="w-10 h-10 rounded-full object-cover"
    />
  `;
}

/**
 * =========================
 * HAMBURGER MENU FIX
 * =========================
 */
function setupHamburgerMenu() {
  const hamburger = document.getElementById('hamburger');
  const sideMenu = document.getElementById('sideMenu');
  const closeMenu = document.getElementById('closeMenu');
  const overlay = document.getElementById('menuOverlay');

  if (!hamburger || !sideMenu || !closeMenu || !overlay) return;

  const openMenu = () => {
    sideMenu.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  };

  const close = () => {
    sideMenu.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  };

  hamburger.addEventListener('click', openMenu);
  closeMenu.addEventListener('click', close);
  overlay.addEventListener('click', close);
}

/**
 * =========================
 * CALENDAR
 * =========================
 */
function renderCalendar() {
  const calendar = document.getElementById('calendarDays');
  const monthYear = document.getElementById('monthYear');

  if (!calendar || !monthYear) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  monthYear.innerText = currentDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  calendar.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    calendar.innerHTML += `<div></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const hasBooking = bookings.some(b => b.date === dateStr);
    const isAvailable = availability.some(a => a.date === dateStr);

    let bg = 'bg-gray-100';

    if (hasBooking) bg = 'bg-blue-500 text-white';
    else if (isAvailable) bg = 'bg-green-500 text-white';

    calendar.innerHTML += `
      <div class="p-2 text-center rounded cursor-pointer ${bg}">
        ${day}
      </div>
    `;
  }
}

/**
 * =========================
 * NAV MONTH
 * =========================
 */
function setupCalendarButtons() {
  document.getElementById('prevMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('nextMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
}

/**
 * =========================
 * AVAILABILITY FORM
 * =========================
 */
function setupForm() {
  const form = document.getElementById('availabilityForm');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('availabilityDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (!currentUser) return;

    const { error } = await supabase
      .from('availability')
      .insert([
        {
          provider_id: currentUser.id,
          date,
          start_time: startTime,
          end_time: endTime
        }
      ]);

    if (error) {
      alert('Failed to set availability');
      return;
    }

    alert('Availability updated!');

    await loadData();
    renderCalendar();
  });
}

/**
 * =========================
 * STATS
 * =========================
 */
function renderStats() {
  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  };

  set('totalBookings', total);
  set('pendingBookings', pending);
  set('confirmedBookings', confirmed);
  set('completedBookings', completed);
}

/**
 * =========================
 * UPCOMING BOOKINGS
 * =========================
 */
function renderUpcomingBookings() {
  const container = document.getElementById('upcomingBookings');

  if (!container) return;

  if (!bookings.length) {
    container.innerHTML = `<p class="text-gray-500 text-center py-8">No upcoming bookings</p>`;
    return;
  }

  const upcoming = bookings
    .filter(b => b.status !== 'completed')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  container.innerHTML = upcoming.map(b => `
    <div class="border p-4 rounded-lg flex justify-between items-center">

      <div>
        <p class="font-bold">${b.service_name || 'Service'}</p>
        <p class="text-gray-600">${b.date} • ${b.time || ''}</p>
      </div>

      <span class="px-3 py-1 rounded bg-gray-200 text-sm">
        ${b.status}
      </span>

    </div>
  `).join('');
}