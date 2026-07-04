// provider-bookings.js
import { supabase } from "./supabase.js";

const CONFIG = {
  BOOKINGS_TABLE: "bookings",
  SERVICES_TABLE: "services",

  COL_PROVIDER_ID: "provider_id",
  COL_CUSTOMER_ID: "user_id",
  COL_SERVICE_ID: "service_id",
  COL_SCHEDULED_DATE: "scheduled_date",
  COL_CREATED_AT: "created_at",
  COL_STATUS: "status",
  COL_TOTAL_PRICE: "total_price",

  COL_SERVICE_TITLE: "title",
};

const container = document.getElementById("bookingsContainer");
let currentProviderId = null;
let bookingChannel = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setContainerEmpty(msg) {
  if (!container) return;
  container.innerHTML = `<div class="text-gray-600">${escapeHtml(msg)}</div>`;
}

function statusBadgeClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "paid") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "accepted") return "bg-blue-100 text-blue-700";
  if (s === "in_progress") return "bg-indigo-100 text-indigo-700";
  if (s === "completed" || s === "completed_by_provider") return "bg-emerald-100 text-emerald-700";
  if (s === "cancelled" || s === "declined") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-NG', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
  : '';

function cardHtml(b) {
  return `
    <div class="bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-200">
      <div class="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div class="relative overflow-hidden bg-slate-100">
          ${b.serviceImage ? `<img src="${escapeHtml(b.serviceImage)}" alt="${escapeHtml(b.serviceTitle)}" class="h-full w-full object-cover" onerror="this.style.display='none'">` : `<div class="flex h-full min-h-[260px] items-center justify-center text-slate-500">No image available</div>`}
          <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent p-4">
            <span class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">Reservation request</span>
          </div>
        </div>

        <div class="p-6 space-y-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Hosting request</p>
              <h3 class="text-2xl font-semibold text-slate-900">${escapeHtml(b.serviceTitle)}</h3>
              <p class="text-sm text-slate-600">${escapeHtml(b.location)}</p>
            </div>
            <div class="inline-flex items-center gap-3 rounded-full bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              <span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600">💰</span>
              ₦${escapeHtml(b.price != null ? Number(b.price).toLocaleString('en-NG') : '0')}
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Guest</p>
              <div class="mt-4 flex items-center gap-3">
                <div class="h-14 w-14 overflow-hidden rounded-full bg-slate-200">
                  <img src="${escapeHtml(b.customerPicture)}" alt="${escapeHtml(b.customerName)}" class="h-full w-full object-cover" onerror="this.style.display='none'">
                </div>
                <div>
                  <div class="font-semibold text-slate-900">${escapeHtml(b.customerName)}</div>
                  <div class="text-sm text-slate-600">${escapeHtml(b.customerEmail)}</div>
                  <div class="text-sm text-slate-600">${escapeHtml(b.customerPhone)}</div>
                </div>
              </div>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reservation</p>
              <div class="mt-4 space-y-3 text-sm text-slate-700">
                <div class="flex items-center justify-between gap-3">
                  <span class="font-semibold text-slate-900">Date</span>
                  <span>${escapeHtml(b.time)}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="font-semibold text-slate-900">Requested on</span>
                  <span>${escapeHtml(b.requestedOn || '—')}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="font-semibold text-slate-900">Status</span>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">${escapeHtml(b.status || 'Pending')}</span>
                </div>
              </div>
            </div>
          </div>

          ${b.specialInstructions ? `
            <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              <div class="font-semibold text-slate-900 mb-2">Guest note</div>
              <div>${escapeHtml(b.specialInstructions)}</div>
            </div>
          ` : ''}

          <div class="flex flex-wrap gap-3">
            <button data-action="accept" data-id="${escapeHtml(b.bookingId)}" class="min-w-[140px] rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">Accept</button>
            <button data-action="decline" data-id="${escapeHtml(b.bookingId)}" class="min-w-[140px] rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 border border-red-100 transition hover:bg-red-100">Decline</button>
            <button data-action="complete" data-id="${escapeHtml(b.bookingId)}" class="min-w-[140px] rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">Complete</button>
            <button data-action="cancel" data-id="${escapeHtml(b.bookingId)}" class="min-w-[140px] rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-700 border border-yellow-100 transition hover:bg-yellow-100">Cancel</button>
            <button data-action="showmap" data-id="${escapeHtml(b.bookingId)}" data-location="${escapeHtml(b.location)}" class="min-w-[220px] rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 border border-slate-200 transition hover:bg-slate-200">📍 View on Google Maps</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// perform a status update on a booking
async function updateBookingStatus(id, nextStatus) {
  const { error } = await supabase.from(CONFIG.BOOKINGS_TABLE).update({ status: nextStatus, booking_status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// simple toast helper
function toast(msg, kind = 'info'){
  const root = document.getElementById('vora-toasts') || (()=>{ const d=document.createElement('div'); d.id='vora-toasts'; d.className='fixed bottom-6 right-6 flex flex-col gap-2 z-50'; document.body.appendChild(d); return d; })();
  const n=document.createElement('div'); n.className = `px-4 py-2 rounded shadow ${kind==='error'?'bg-red-600 text-white':'bg-gray-800 text-white'}`; n.textContent=msg; root.appendChild(n); setTimeout(()=>n.remove(),4000);
}

function bindActionButtons(preview){
  container.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const action = btn.getAttribute('data-action');
      const id = btn.dataset.id;
      if (preview){ toast(`Preview: ${action} ${id}`); return; }
      const orig = btn.textContent;
      try{
        if (action==='accept'){
          if (!confirm('Accept this booking?')) return;
          btn.disabled=true; btn.textContent='Working...'; await updateBookingStatus(id,'accepted'); toast('Booking accepted'); await refreshCurrentBookings();
        } else if (action==='decline'){
          if (!confirm('Decline this booking?')) return;
          btn.disabled=true; btn.textContent='Working...'; await updateBookingStatus(id,'declined'); toast('Booking declined'); await refreshCurrentBookings();
        } else if (action==='complete'){
          if (!confirm('Mark booking complete?')) return;
          btn.disabled=true; btn.textContent='Working...'; await updateBookingStatus(id,'completed_by_provider'); toast('Booking completed'); await refreshCurrentBookings();
        } else if (action==='cancel'){
          if (!confirm('Cancel this booking?')) return;
          btn.disabled=true; btn.textContent='Working...'; await updateBookingStatus(id,'cancelled'); toast('Booking cancelled'); await refreshCurrentBookings();
        } else if (action==='showmap'){
          const location = btn.dataset.location || '';
          openCustomerLocationModal(location);
        }
      } catch(err) {
        console.error(err);
        toast(err?.message||'Action failed','error');
        btn.disabled=false;
        btn.textContent=orig;
      }
    });
  });
}

async function requireSessionUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data?.session?.user;
  if (!user) throw new Error("Not logged in. Please login again.");
  return user;
}

async function loadIncomingBookings(providerId) {
  const { data, error } = await supabase
    .from(CONFIG.BOOKINGS_TABLE)
    .select(`
      id,
      ${CONFIG.COL_STATUS},
      ${CONFIG.COL_CUSTOMER_ID},
      ${CONFIG.COL_SERVICE_ID},
      ${CONFIG.COL_SCHEDULED_DATE},
      ${CONFIG.COL_CREATED_AT},
      ${CONFIG.COL_TOTAL_PRICE},
      customer_location,
      special_instructions,
      services:${CONFIG.SERVICES_TABLE}(id, title, image_url, location, price, description)
    `)
    .eq(CONFIG.COL_PROVIDER_ID, providerId)
    .order(CONFIG.COL_CREATED_AT, { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadCustomerProfiles(userIds) {
  if (!userIds.length) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, profile_picture, phone')
    .in('id', userIds);

  if (error) {
    console.error('Customer profiles fetch error:', error);
    return {};
  }

  return Object.fromEntries((data || []).map(profile => [String(profile.id), profile]));
}

function normalize(row, customerProfile) {
  const services = row?.services;
  const title =
    (Array.isArray(services) ? services[0]?.title : services?.title) ??
    (Array.isArray(services) ? services[0]?.[CONFIG.COL_SERVICE_TITLE] : services?.[CONFIG.COL_SERVICE_TITLE]) ??
    "Service";
  const imageUrl =
    (Array.isArray(services) ? services[0]?.image_url : services?.image_url) ||
    '';

  const customerName = customerProfile?.full_name || row.customer_name || 'Customer';
  const customerEmail = customerProfile?.email || row.customer_email || 'No email';
  const customerPicture = customerProfile?.profile_picture?.trim()
    ? customerProfile.profile_picture
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(customerName)}&background=random`;

  return {
    bookingId: row.id,
    serviceTitle: title,
    serviceImage: imageUrl,
    customerId: row.user_id,
    customerName,
    customerEmail,
    customerPhone: customerProfile?.phone || 'No phone',
    customerPicture,
    time: row.scheduled_date ? formatTime(row.scheduled_date) : formatTime(row.created_at),
    status: row.status,
    price: row.total_price,
    location: row.customer_location || (Array.isArray(services) ? services[0]?.location : services?.location) || 'Customer Location',
    specialInstructions: row.special_instructions || '',
  };
}

async function refreshBookings(providerId) {
  const rows = await loadIncomingBookings(providerId);
  if (!rows.length) {
    setContainerEmpty("No incoming bookings found.");
    return;
  }

  const customerIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
  const profilesById = await loadCustomerProfiles(customerIds);

  container.innerHTML = rows
    .map(row => normalize(row, profilesById[String(row.user_id)]))
    .map(cardHtml)
    .join("");
  bindActionButtons(false);
}

async function refreshCurrentBookings() {
  if (!currentProviderId) return;
  await refreshBookings(currentProviderId);
}

function buildGoogleMapsUrl(location, coords) {
  if (coords?.length === 2) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

async function geocodeLocation(address) {
  if (!address || !MAPTILER_KEY) return null;
  try {
    const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${MAPTILER_KEY}&limit=1`);
    const data = await response.json();
    if (!data?.features?.length) return null;
    return data.features[0].geometry.coordinates;
  } catch (error) {
    console.error('MapTiler geocoding failed:', error);
    return null;
  }
}

async function renderLocationMap(location, containerEl, navBtn) {
  if (!containerEl) return;

  if (!window.maplibregl) {
    containerEl.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">MapLibre is not loaded.</div>';
    return;
  }

  if (!MAPTILER_KEY) {
    containerEl.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">MapTiler API key not configured.</div>';
    return;
  }

  containerEl.innerHTML = '<div class="h-full flex items-center justify-center text-gray-600">Loading map…</div>';
  navBtn.href = buildGoogleMapsUrl(location, null);

  const coords = await geocodeLocation(location);
  if (!coords) {
    containerEl.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">Unable to locate customer address.</div>';
    return;
  }

  navBtn.href = buildGoogleMapsUrl(location, coords);
  containerEl.innerHTML = '';

  try {
    const map = new maplibregl.Map({
      container: containerEl,
      style: MAPTILER_STYLE_URL,
      center: coords,
      zoom: 14,
      attributionControl: true,
    });

    map.on('load', () => {
      new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat(coords)
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText('Customer Location'))
        .addTo(map);
    });
  } catch (error) {
    console.error('MapTiler map render failed:', error);
    containerEl.innerHTML = '<div class="h-full flex items-center justify-center text-red-600">Failed to render the map.</div>';
  }
}

function removeLocationModal() {
  const existing = document.getElementById('customerLocationModal');
  if (existing) existing.remove();
}

async function openCustomerLocationModal(location) {
  removeLocationModal();

  const modal = document.createElement('div');
  modal.id = 'customerLocationModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  modal.innerHTML = `
    <div class="max-w-4xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl">
      <div class="flex items-center justify-between p-5 border-b">
        <div>
          <h2 class="text-xl font-bold">Customer Location</h2>
          <p class="text-sm text-gray-500">Route from your current position to the customer address.</p>
        </div>
        <button id="closeLocationModal" class="text-2xl text-gray-600">&times;</button>
      </div>
      <div class="h-96" id="customerMapContainer"></div>
      <div class="flex items-center justify-between gap-3 p-5 bg-slate-50">
        <a id="googleMapsNavBtn" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition">📍 Navigate with Google Maps</a>
        <button id="closeLocationModalAction" class="px-4 py-3 rounded-lg bg-slate-600 text-white hover:bg-slate-700">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById('closeLocationModal')?.addEventListener('click', removeLocationModal);
  document.getElementById('closeLocationModalAction')?.addEventListener('click', removeLocationModal);
  await renderLocationMap(location, document.getElementById('customerMapContainer'), document.getElementById('googleMapsNavBtn'));
}

function subscribeToBookingChanges() {
  if (!supabase.channel || bookingChannel) return;

  bookingChannel = supabase
    .channel('provider-bookings')
    .on('postgres_changes', { event: '*', schema: 'public', table: CONFIG.BOOKINGS_TABLE }, () => {
      if (currentProviderId) {
        refreshBookings(currentProviderId).catch(() => {});
      }
    })
    .subscribe();
}

async function init() {
  if (!container) return;
  setContainerEmpty("Loading incoming bookings…");

  try {
    if (window.location.protocol === 'file:') {
      const sample = [
        { id: 'pb-1', user_id: 'u-1', provider_id: 'preview', status: 'pending', scheduled_date: new Date().toISOString(), created_at: new Date().toISOString(), total_price: 18000, customer_name: 'John Smith', customer_email: 'john@gmail.com', customer_phone: '+234 801 234 5678', customer_location: 'Lekki Phase 1', special_instructions: 'Please bring cleaning chemicals.', services: { title: 'House Cleaning' } },
        { id: 'pb-2', user_id: 'u-2', provider_id: 'preview', status: 'accepted', scheduled_date: new Date(Date.now()+86400000).toISOString(), created_at: new Date().toISOString(), total_price: 3200, customer_name: 'Jane Doe', customer_email: 'jane@gmail.com', customer_phone: '+234 802 345 6789', customer_location: 'Ikeja GRA', special_instructions: '', services: { title: 'Plumbing' } }
      ];
      currentProviderId = 'preview';
      container.innerHTML = sample.map(normalize).map(cardHtml).join("");
      bindActionButtons(true);
      return;
    }

    const user = await requireSessionUser();
    currentProviderId = user.id;
    await refreshBookings(user.id);
    subscribeToBookingChanges();
  } catch (e) {
    console.error(e);
    setContainerEmpty(`Error loading bookings: ${e?.message ?? "Unknown error"}`);
    if (String(e?.message ?? "").toLowerCase().includes("not logged in")) {
      window.location.href = "login.html";
    }
  }
}

init();