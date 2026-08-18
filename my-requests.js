import { supabase } from './supabase.js';

const requestsList = document.getElementById('requestsList');
const summary = document.getElementById('resultSummary');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const offersModal = document.getElementById('offersModal');
const offersContent = document.getElementById('offersContent');
let requests = [];
let currentUser = null;
let offerCounts = {};
let activeOfferRequestId = null;
let offersChannel = null;

function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'Recently'; }
function formatBudget(value) { return value === null || value === undefined || value === '' ? 'Budget not set' : `₦${Number(value).toLocaleString('en-NG')}`; }

function getRequestedSchedule(description = '') {
  // Requests save the required preferred date in their description. Keep it as
  // a local timestamp because bookings.scheduled_date is a timestamp column.
  const match = String(description).match(/Preferred date:\s*(\d{4}-\d{2}-\d{2})(?:\s+at\s+(\d{2}:\d{2}))?/i);
  if (match) return `${match[1]}T${match[2] || '09:00'}:00`;

  // Only used for legacy requests created before the preferred-date field.
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}T09:00:00`;
}

function renderRequests() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const filtered = requests.filter((request) => (`${request.title || ''} ${request.description || ''} ${request.category || ''}`).toLowerCase().includes(search) && (!status || request.status === status));
  summary.textContent = `${filtered.length} request${filtered.length === 1 ? '' : 's'} found.`;
  if (!filtered.length) { requestsList.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 lg:col-span-2">${requests.length ? 'No requests match your filters.' : 'You have not posted a request yet.'}<br><a href="request.html" class="mt-4 inline-block font-semibold text-blue-600 hover:text-blue-700">Request a service →</a></div>`; return; }
  requestsList.innerHTML = filtered.map((request) => {
    const offerCount = offerCounts[request.id] || 0;
    const offerLabel = `${offerCount} offer${offerCount === 1 ? '' : 's'}`;
    return `<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-wide text-blue-600">${escapeHtml(request.category || 'General')}</p><h3 class="mt-1 text-xl font-bold">${escapeHtml(request.title || 'Service request')}</h3></div><span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold capitalize text-blue-700">${escapeHtml(request.status || 'open')}</span></div><p class="mt-4 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">${escapeHtml(request.description || 'No description provided.')}</p><div class="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div><p class="text-slate-500">Budget</p><p class="font-bold text-slate-800">${formatBudget(request.budget)}</p></div><div><p class="text-slate-500">Location</p><p class="truncate font-bold text-slate-800">${escapeHtml(request.location || 'Not provided')}</p></div></div><div class="mt-5 flex items-center justify-between gap-3"><span class="text-xs text-slate-500">${offerLabel} · Posted ${formatDate(request.created_at)}</span><button type="button" data-offers-request="${request.id}" data-request-title="${escapeHtml(request.title || 'Service request')}" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">View offers</button></div></article>`;
  }).join('');
  requestsList.querySelectorAll('[data-offers-request]').forEach((button) => button.addEventListener('click', () => openOffers(button.dataset.offersRequest, button.dataset.requestTitle)));
}

async function loadRequests() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { window.location.href = 'login.html'; return; }
  currentUser = session.user;
  const { data, error } = await supabase.from('requests').select('id, title, description, category, budget, location, status, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  if (error) { console.error('Could not load customer requests:', error); summary.textContent = 'Your requests are unavailable.'; requestsList.innerHTML = '<div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 lg:col-span-2">We could not load your requests. Please try again.</div>'; return; }
  requests = data || [];
  await loadOfferCounts();
  renderRequests();
  subscribeToOffers();
}

async function loadOfferCounts() {
  if (!requests.length) { offerCounts = {}; return; }
  const { data, error } = await supabase.from('offers').select('request_id').in('request_id', requests.map((request) => request.id));
  if (error) { console.error('Could not load offer counts:', error); offerCounts = {}; return; }
  offerCounts = (data || []).reduce((counts, offer) => {
    counts[offer.request_id] = (counts[offer.request_id] || 0) + 1;
    return counts;
  }, {});
}

function subscribeToOffers() {
  if (offersChannel) return;
  offersChannel = supabase.channel(`customer-offers-${currentUser.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, async (payload) => {
    const requestId = payload.new?.request_id || payload.old?.request_id;
    if (!requests.some((request) => String(request.id) === String(requestId))) return;
    await loadOfferCounts();
    renderRequests();
    if (String(activeOfferRequestId) === String(requestId)) {
      const request = requests.find((item) => String(item.id) === String(requestId));
      await openOffers(requestId, request?.title || 'Service request');
    }
  }).subscribe();
}

async function openOffers(requestId, title) {
  activeOfferRequestId = requestId;
  document.getElementById('offersTitle').textContent = `Offers for ${title}`;
  offersContent.innerHTML = '<p class="text-sm text-slate-500">Loading offers…</p>';
  offersModal.classList.remove('hidden');
  const { data, error } = await supabase.from('offers').select('id, price, message, availability, status, created_at, provider_id').eq('request_id', requestId).order('created_at', { ascending: false });
  if (error) { console.error('Could not load offers:', error); offersContent.innerHTML = '<p class="rounded-xl bg-red-50 p-4 text-sm text-red-700">We could not load offers for this request.</p>'; return; }
  if (!data?.length) { offersContent.innerHTML = '<div class="rounded-xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500">No offers yet. We’ll show providers here as they respond.</div>'; return; }
  const request = requests.find((item) => String(item.id) === String(requestId));
  offersContent.innerHTML = data.map((offer, index) => {
    const canDecide = request?.status === 'open' && offer.status === 'pending';
    return `<article class="rounded-2xl border border-slate-200 p-5"><div class="flex items-start justify-between gap-3"><div><p class="text-sm font-semibold text-slate-500">Provider offer ${index + 1}</p><p class="mt-1 text-2xl font-bold text-green-700">${formatBudget(offer.price)}</p></div><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-600">${escapeHtml(offer.status || 'pending')}</span></div><dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt class="text-slate-500">Availability</dt><dd class="mt-1 font-semibold">${escapeHtml(offer.availability || 'Not specified')}</dd></div><div><dt class="text-slate-500">Sent</dt><dd class="mt-1 font-semibold">${formatDate(offer.created_at)}</dd></div></dl><p class="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">${escapeHtml(offer.message || 'No message included.')}</p>${canDecide ? `<div class="mt-4 flex flex-wrap justify-end gap-3"><button type="button" data-decline-offer="${offer.id}" data-request-id="${requestId}" class="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Decline</button><button type="button" data-accept-offer="${offer.id}" data-request-id="${requestId}" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Accept & pay</button></div>` : ''}</article>`;
  }).join('');
  offersContent.querySelectorAll('[data-accept-offer]').forEach((button) => button.addEventListener('click', () => acceptOffer(button.dataset.requestId, button.dataset.acceptOffer)));
  offersContent.querySelectorAll('[data-decline-offer]').forEach((button) => button.addEventListener('click', () => declineOffer(button.dataset.requestId, button.dataset.declineOffer)));
}

async function declineOffer(requestId, offerId) {
  const button = offersContent.querySelector(`[data-decline-offer="${offerId}"]`);
  if (button) { button.disabled = true; button.textContent = 'Declining…'; }
  const { error } = await supabase.from('offers').update({ status: 'declined' }).eq('id', offerId).eq('request_id', requestId);
  if (error) { console.error('Could not decline offer:', error); alert(error.message || 'We could not decline this offer.'); if (button) { button.disabled = false; button.textContent = 'Decline'; } return; }
  const title = document.getElementById('offersTitle').textContent.replace(/^Offers for /, '');
  await openOffers(requestId, title);
}

async function acceptOffer(requestId, offerId) {
  const request = requests.find((item) => String(item.id) === String(requestId));
  if (!currentUser || !request || request.status !== 'open') { alert('This request is no longer available for offers.'); return; }
  const button = offersContent.querySelector(`[data-accept-offer="${offerId}"]`);
  if (button) { button.disabled = true; button.textContent = 'Preparing payment…'; }

  const { data: offer, error: offerError } = await supabase.from('offers').select('id, provider_id, price, status').eq('id', offerId).eq('request_id', requestId).maybeSingle();
  if (offerError || !offer || offer.status !== 'pending') { alert(offerError?.message || 'This offer is no longer available.'); if (button) { button.disabled = false; button.textContent = 'Accept & pay'; } return; }

  const { data: existingBooking, error: bookingLookupError } = await supabase.from('bookings').select('id').eq('request_id', requestId).eq('user_id', currentUser.id).maybeSingle();
  if (bookingLookupError) { console.error('Could not check existing booking:', bookingLookupError); alert(bookingLookupError.message || 'We could not prepare your booking.'); if (button) { button.disabled = false; button.textContent = 'Accept & pay'; } return; }
  let bookingId = existingBooking?.id;
  if (!bookingId) {
    const offerPrice = Number(offer.price) || 0;
    const totalPrice = Math.round(offerPrice * 1.05);
    const { data: booking, error: bookingError } = await supabase.from('bookings').insert({ user_id: currentUser.id, provider_id: offer.provider_id, request_id: requestId, scheduled_date: getRequestedSchedule(request.description), status: 'pending_payment', total_price: totalPrice, number_of_people: 1, price_per_person: offerPrice, travel_fee: 0, special_instructions: request.description || '', service_location: 'customer', customer_location: request.location || '', payment_status: 'pending' }).select('id').single();
    if (bookingError) { console.error('Could not create booking:', bookingError); alert(bookingError.message || 'We could not create your booking.'); if (button) { button.disabled = false; button.textContent = 'Accept & pay'; } return; }
    bookingId = booking.id;
  }

  const { error: acceptError } = await supabase.from('offers').update({ status: 'accepted' }).eq('id', offerId).eq('request_id', requestId);
  if (acceptError) { console.error('Could not accept offer:', acceptError); alert(acceptError.message || 'We could not accept this offer.'); if (button) { button.disabled = false; button.textContent = 'Accept & pay'; } return; }
  await supabase.from('offers').update({ status: 'declined' }).eq('request_id', requestId).neq('id', offerId).eq('status', 'pending');
  const { error: requestError } = await supabase.from('requests').update({ status: 'accepted' }).eq('id', requestId).eq('user_id', currentUser.id);
  if (requestError) { console.error('Could not update request:', requestError); alert(requestError.message || 'Your offer was accepted, but we could not update the request status.'); }
  window.location.href = `pay-offer.html?bookingId=${encodeURIComponent(bookingId)}`;
}

searchInput.addEventListener('input', renderRequests);
statusFilter.addEventListener('change', renderRequests);
function closeOffers() { activeOfferRequestId = null; offersModal.classList.add('hidden'); }
document.querySelectorAll('[data-close-offers]').forEach((button) => button.addEventListener('click', closeOffers));
offersModal.addEventListener('click', (event) => { if (event.target === offersModal) closeOffers(); });
loadRequests();
