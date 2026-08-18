import { supabase } from './supabase.js';

const requestsList = document.getElementById('requestsList');
const summary = document.getElementById('resultSummary');
const categoryFilter = document.getElementById('categoryFilter');
const searchInput = document.getElementById('searchInput');
const locationFilter = document.getElementById('locationFilter');
const sortFilter = document.getElementById('sortFilter');
const offerModal = document.getElementById('offerModal');
const offerForm = document.getElementById('offerForm');
const myOffersList = document.getElementById('myOffersList');
let allRequests = [];
let currentProvider = null;
let myOffersChannel = null;

function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function formatBudget(value) { return value === null || value === undefined || value === '' ? 'Budget not set' : `₦${Number(value).toLocaleString('en-NG')}`; }

function formatDate(value) { return value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'Recently'; }
function statusClass(status) { return status === 'accepted' ? 'bg-green-100 text-green-700' : status === 'declined' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'; }

async function loadMyOffers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { myOffersList.innerHTML = '<p class="text-sm text-slate-500">Sign in to view your offers.</p>'; return; }
  currentProvider = session.user;
  const { data, error } = await supabase.from('offers').select('id, request_id, price, availability, status, created_at, requests(title, category)').eq('provider_id', currentProvider.id).order('created_at', { ascending: false });
  if (error) { console.error('Could not load provider offers:', error); myOffersList.innerHTML = '<p class="rounded-xl bg-red-50 p-4 text-sm text-red-700">We could not load your offers.</p>'; return; }
  if (!data?.length) { myOffersList.innerHTML = '<p class="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 md:col-span-2">You have not sent any offers yet.</p>'; return; }
  myOffersList.innerHTML = data.map((offer) => {
    const request = Array.isArray(offer.requests) ? offer.requests[0] : offer.requests;
    return `<article class="rounded-xl border border-slate-200 p-4"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wide text-blue-600">${escapeHtml(request?.category || 'Service request')}</p><h3 class="mt-1 font-bold text-slate-900">${escapeHtml(request?.title || `Request ${String(offer.request_id).slice(0, 8)}`)}</h3></div><span class="rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass(offer.status)}">${escapeHtml(offer.status || 'pending')}</span></div><div class="mt-4 flex items-center justify-between text-sm"><span class="font-bold text-green-700">${formatBudget(offer.price)}</span><span class="text-slate-500">Sent ${formatDate(offer.created_at)}</span></div><p class="mt-2 text-sm text-slate-600">Availability: ${escapeHtml(offer.availability || 'Not specified')}</p></article>`;
  }).join('');
}

function subscribeToMyOffers() {
  if (!currentProvider || myOffersChannel) return;
  myOffersChannel = supabase.channel(`provider-offers-${currentProvider.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `provider_id=eq.${currentProvider.id}` }, loadMyOffers).subscribe();
}

function populateCategories() {
  const current = categoryFilter.value;
  const categories = [...new Set(allRequests.map((request) => (request.category || '').trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second));
  categoryFilter.innerHTML = '<option value="">All categories</option>';
  categories.forEach((category) => { const option = document.createElement('option'); option.value = category; option.textContent = category; categoryFilter.appendChild(option); });
  categoryFilter.value = categories.includes(current) ? current : '';
}

function renderRequests() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const location = locationFilter.value.trim().toLowerCase();
  const filtered = allRequests.filter((request) => {
    const text = `${request.title || ''} ${request.description || ''} ${request.category || ''}`.toLowerCase();
    return (!search || text.includes(search)) && (!category || request.category === category) && (!location || String(request.location || '').toLowerCase().includes(location));
  });
  filtered.sort((first, second) => sortFilter.value === 'budget-high' ? Number(second.budget || 0) - Number(first.budget || 0) : sortFilter.value === 'budget-low' ? Number(first.budget || 0) - Number(second.budget || 0) : new Date(second.created_at) - new Date(first.created_at));
  summary.textContent = `${filtered.length} open request${filtered.length === 1 ? '' : 's'} available.`;
  if (!filtered.length) { requestsList.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 lg:col-span-2">No open requests match these filters. Check back soon.</div>'; return; }
  requestsList.innerHTML = filtered.map((request) => `<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wide text-blue-600">${escapeHtml(request.category || 'General')}</p><h3 class="mt-1 text-xl font-bold">${escapeHtml(request.title || 'Service request')}</h3></div><span class="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700">${formatBudget(request.budget)}</span></div><p class="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">${escapeHtml(request.description || 'No description provided.')}</p><div class="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm"><span class="text-slate-500">📍 ${escapeHtml(request.location || 'Location not provided')}</span><button type="button" data-offer-request="${request.id}" data-request-title="${escapeHtml(request.title || 'Service request')}" class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">Make offer</button></div></article>`).join('');
  requestsList.querySelectorAll('[data-offer-request]').forEach((button) => button.addEventListener('click', () => openOffer(button.dataset.offerRequest, button.dataset.requestTitle)));
}

async function loadRequests() {
  requestsList.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 lg:col-span-2">Loading open requests…</div>';
  const { data, error } = await supabase.from('requests').select('id, title, description, category, budget, location, status, created_at').eq('status', 'open').order('created_at', { ascending: false });
  if (error) { console.error('Could not load requests:', error); summary.textContent = 'Requests are unavailable.'; requestsList.innerHTML = '<div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 lg:col-span-2">We could not load requests. Please try again.</div>'; return; }
  allRequests = data || [];
  populateCategories();
  renderRequests();
}

function openOffer(requestId, title) { document.getElementById('requestId').value = requestId; document.getElementById('offerTitle').textContent = `Offer for ${title}`; offerModal.classList.remove('hidden'); }
function closeOffer() { offerModal.classList.add('hidden'); offerForm.reset(); }

offerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { window.location.href = 'login.html'; return; }
  const button = document.getElementById('sendOfferBtn');
  button.disabled = true; button.textContent = 'Sending offer…';
  const requestId = document.getElementById('requestId').value;
  const { data: existingOffer, error: existingError } = await supabase.from('offers').select('id').eq('request_id', requestId).eq('provider_id', session.user.id).maybeSingle();
  if (existingError) console.error('Could not check existing offers:', existingError);
  if (existingOffer) { alert('You have already sent an offer for this request.'); button.disabled = false; button.textContent = 'Send offer'; return; }
  const availability = document.getElementById('offerAvailability').value;
  const completion = document.getElementById('completionTime').value.trim();
  const note = document.getElementById('offerMessage').value.trim();
  const message = [note, `Availability: ${availability}`, `Estimated completion: ${completion}`].filter(Boolean).join('\n\n');
  const { error } = await supabase.from('offers').insert({ request_id: requestId, provider_id: session.user.id, price: Number(document.getElementById('offerPrice').value), message, availability, status: 'pending' });
  if (error) { console.error('Could not send offer:', error); alert(error.message || 'We could not send your offer.'); button.disabled = false; button.textContent = 'Send offer'; return; }
  alert('Your offer has been sent.'); closeOffer(); button.disabled = false; button.textContent = 'Send offer';
  await loadMyOffers();
});

[searchInput, categoryFilter, locationFilter, sortFilter].forEach((input) => input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', renderRequests));
document.querySelectorAll('[data-close-offer]').forEach((button) => button.addEventListener('click', closeOffer));
offerModal.addEventListener('click', (event) => { if (event.target === offerModal) closeOffer(); });
loadRequests();
loadMyOffers().then(subscribeToMyOffers);
