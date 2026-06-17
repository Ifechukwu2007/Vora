// schedule.js
import { supabase } from './supabase.js';

const state = {
  currentDate: new Date(),
  monthStart: null,
  monthEnd: null,
  // store per-day status (simple: if any booking exists that day, mark it)
  dayStatus: new Map(), // key: YYYY-MM-DD -> { status, bookingId }
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYMD(d) {
  // d is Date in local time
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseMaybeDateOnly(value) {
  // bookings.scheduled_date is "timestamp without time zone" in your schema
  // It may come back as string.
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function statusToColor(status) {
  // tweak to match your legend colors
  if (status === 'pending') return 'bg-blue-500';
  if (status === 'confirmed') return 'bg-green-500';
  if (status === 'completed') return 'bg-blue-600';
  return 'bg-red-500';
}

async function loadStatsAndUpcoming() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');

  // We assume bookings.user_id stores the customer (schema shows column user_id + provider_id)
  // We'll load bookings for the logged-in user.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, status, scheduled_date, created_at')
    .or(`user_id.eq.${user.id},provider_id.eq.${user.id}`)
    .order('scheduled_date', { ascending: true })
    .limit(200);

  if (error) throw error;

  // Stats
  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
  };

  document.getElementById('totalBookings').textContent = stats.total;
  document.getElementById('pendingBookings').textContent = stats.pending;
  document.getElementById('confirmedBookings').textContent = stats.confirmed;
  document.getElementById('completedBookings').textContent = stats.completed;

  // Upcoming (simple: upcoming = scheduled_date in the future)
  const now = new Date();
  const upcoming = bookings
    .map(b => ({ ...b, dt: parseMaybeDateOnly(b.scheduled_date) }))
    .filter(b => b.dt && b.dt >= now)
    .slice(0, 10);

  const container = document.getElementById('upcomingBookings');
  container.innerHTML = '';

  if (upcoming.length === 0) {
    container.innerHTML = `<p class="text-gray-500 text-center py-8">No upcoming bookings</p>`;
    return;
  }

  for (const b of upcoming) {
    const dt = b.dt;
    const dateStr = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    const statusColor =
      b.status === 'pending' ? 'text-yellow-700' :
      b.status === 'confirmed' ? 'text-green-700' :
      b.status === 'completed' ? 'text-blue-700' :
      'text-red-700';

    container.insertAdjacentHTML(
      'beforeend',
      `
      <div class="border rounded p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="font-semibold text-gray-800">Booking</div>
            <div class="text-gray-600 text-sm">${dateStr}</div>
          </div>
          <div class="font-bold ${statusColor}">${b.status || 'unknown'}</div>
        </div>
      </div>
      `
    );
  }
}

async function loadBookingsForMonth(year, monthIndex) {
  // monthIndex: 0-11
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');

  const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999); // last day of month

  // We'll pull all bookings for user/provider during the month.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, status, scheduled_date')
    .or(`user_id.eq.${user.id},provider_id.eq.${user.id}`)
    .gte('scheduled_date', monthStart.toISOString())
    .lte('scheduled_date', monthEnd.toISOString());

  if (error) throw error;

  state.dayStatus.clear();

  for (const b of bookings || []) {
    const dt = parseMaybeDateOnly(b.scheduled_date);
    if (!dt) continue;
    const ymd = toYMD(dt);

    // If multiple bookings same day: prefer confirmed > pending > others
    const prev = state.dayStatus.get(ymd);
    const priority = (s) => (s === 'confirmed' ? 3 : s === 'pending' ? 2 : s === 'completed' ? 1 : 0);

    if (!prev || priority(b.status) >= priority(prev.status)) {
      state.dayStatus.set(ymd, { status: b.status, bookingId: b.id });
    }
  }
}

function renderCalendar() {
  const { currentDate } = state;
  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);

  state.monthStart = monthStart;
  state.monthEnd = monthEnd;

  const monthYearEl = document.getElementById('monthYear');
  monthYearEl.textContent = currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  const calendarDaysEl = document.getElementById('calendarDays');
  calendarDaysEl.innerHTML = '';

  // Determine starting weekday (Sun=0 ... Sat=6)
  const startWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();

  // Blank cells before first day
  for (let i = 0; i < startWeekday; i++) {
    calendarDaysEl.insertAdjacentHTML(
      'beforeend',
      `<div class="h-12 rounded bg-transparent"></div>`
    );
  }

  // Day cells
  for (let day = 1; day <= totalDays; day++) {
    const dt = new Date(year, monthIndex, day);
    const ymd = toYMD(dt);

    const bookingInfo = state.dayStatus.get(ymd);
    const hasBooking = Boolean(bookingInfo);

    const isToday = toYMD(dt) === toYMD(new Date());
    const ring = isToday ? 'ring-2 ring-blue-500' : '';

    // Mark with a colored dot if booking exists
    const dot = hasBooking
      ? `<div class="mt-1 w-3 h-3 rounded-full ${statusToColor(bookingInfo.status)}"></div>`
      : `<div class="mt-1 w-3 h-3 rounded-full bg-gray-200"></div>`;

    calendarDaysEl.insertAdjacentHTML(
      'beforeend',
      `
      <button
        type="button"
        class="h-12 border rounded p-2 text-left hover:bg-gray-50 transition ${ring} ${hasBooking ? 'border-gray-300' : 'border-gray-200'}"
        data-date="${ymd}"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-gray-800">${day}</div>
          ${hasBooking ? `<div class="text-xs font-bold text-gray-700">•</div>` : `<div class="text-xs text-gray-400"></div>`}
        </div>
        ${dot}
      </button>
      `
    );
  }
}

function attachCalendarDayHandlers() {
  document.getElementById('calendarDays').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-date]');
    if (!btn) return;

    const ymd = btn.getAttribute('data-date');
    // Simple UX: show alert with status if exists
    const info = state.dayStatus.get(ymd);
    if (!info) {
      alert(`No booking on ${ymd}`);
      return;
    }
    alert(`Booking on ${ymd}: ${info.status}`);
  });
}

async function init() {
  // Month navigation
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');

  prevBtn.addEventListener('click', async () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
    await refreshMonth();
  });

  nextBtn.addEventListener('click', async () => {
    state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
    await refreshMonth();
  });

  // Availability form (cannot persist until we know the availability table)
  const form = document.getElementById('availabilityForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('availabilityDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (!date || !startTime || !endTime) return;

    // You MUST create/confirm an availability table/columns to persist this.
    alert(
      `Availability saved to UI only for now.\n\nTo fully enable this, tell me your availability table name/columns (e.g. availabilities(date,start_time,end_time,user_id/provider_id)).`
    );

    // If you already have a table, update the insert below.
    // Example (NOT guaranteed to match your schema):
    // await supabase.from('availabilities').insert({ date, start_time: startTime, end_time: endTime, user_id: user.id });
  });

  attachCalendarDayHandlers();

  async function refreshMonth() {
    // Load month bookings -> render calendar
    const year = state.currentDate.getFullYear();
    const monthIndex = state.currentDate.getMonth();

    await loadBookingsForMonth(year, monthIndex);
    renderCalendar();
  }

  try {
    await Promise.all([refreshMonth(), loadStatsAndUpcoming()]);
  } catch (err) {
    console.error(err);
    // You can style this message however you like
    const container = document.getElementById('upcomingBookings');
    if (container) {
      container.innerHTML = `<p class="text-red-600 text-center py-8">Error loading schedule: ${err.message || err}</p>`;
    }
  }
}

init();