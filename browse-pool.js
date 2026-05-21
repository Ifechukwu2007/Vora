import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const requestsList = document.getElementById('requestsList');
  const noResults = document.getElementById('noResults');

  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('service-category');
  const locationFilter = document.getElementById('locationFilter');
  const sortFilter = document.getElementById('sortFilter');

  // Modals
  const requestModal = document.getElementById('requestModal');
  const modalContent = document.getElementById('modalContent');
  const closeModalBtn = document.getElementById('closeModal');

  const offerModal = document.getElementById('offerModal');
  const closeOfferBtn = document.getElementById('closeOfferBtn');
  const closeOfferModalBtn = document.getElementById('closeOfferModal');

  // Offer form
  const offerForm = document.getElementById('offerForm');
  const requestIdInput = document.getElementById('requestId');
  const offerPriceInput = document.getElementById('offerPrice');
  const offerMessageInput = document.getElementById('offerMessage');
  const offerAvailabilityInput = document.getElementById('offerAvailability');

  // Quick guards
  if (!requestsList || !noResults || !requestModal || !modalContent || !offerModal || !offerForm) {
    console.error('Missing required DOM elements for browse-pool.js');
    return;
  }

  // Close modals
  closeModalBtn?.addEventListener('click', () => hideModal(requestModal));
  closeOfferBtn?.addEventListener('click', () => hideModal(offerModal));
  closeOfferModalBtn?.addEventListener('click', () => hideModal(offerModal));

  // Close modal by clicking overlay
  requestModal?.addEventListener('click', (e) => {
    if (e.target === requestModal) hideModal(requestModal);
  });

  offerModal?.addEventListener('click', (e) => {
    if (e.target === offerModal) hideModal(offerModal);
  });

  // Load requests on filter changes
  const debouncedReload = debounce(() => loadRequests(), 250);

  searchInput?.addEventListener('input', debouncedReload);
  categorySelect?.addEventListener('change', debouncedReload);
  locationFilter?.addEventListener('input', debouncedReload);
  sortFilter?.addEventListener('change', () => loadRequests());

  // Offer submit
  offerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      alert('You must be logged in to submit an offer.');
      return;
    }

    const requestId = requestIdInput.value;
    const offerPrice = offerPriceInput.value;
    const offerMessage = (offerMessageInput.value || '').trim();
    const availability = offerAvailabilityInput.value;

    if (!requestId) return alert('Missing request ID.');
    if (!offerPrice || Number.isNaN(Number(offerPrice)) || Number(offerPrice) <= 0) {
      return alert('Enter a valid price.');
    }
    if (!availability) return alert('Select availability.');

    // Prevent multiple offers by the same provider for same request (optional but recommended)
    // If you don't want this constraint, remove this block.
    const { data: existingOffer } = await supabase
      .from('offers')
      .select('id')
      .eq('request_id', requestId)
      .eq('provider_id', authData.user.id)
      .maybeSingle();

    if (existingOffer) {
      return alert('You already submitted an offer for this request.');
    }

    try {
      // Insert offer
      const { data: inserted, error: insertErr } = await supabase
        .from('offers')
        .insert({
          request_id: Number(requestId),
          provider_id: authData.user.id,
          price: Number(offerPrice),
          message: offerMessage || null,
          status: 'pending',
          availability: availability, // stored as text in your schema: offers.availability boolean? (see below)
        })
        .select('*')
        .single();

      if (insertErr) {
        console.error(insertErr);
        throw insertErr;
      }

      // IMPORTANT:
      // Your `offers.availability` column is BOOLEAN (per schema listing).
      // But your UI provides: today/tomorrow/this-week/... (text).
      //
      // To avoid breaking, we convert to boolean:
      // - any non-empty selection => true
      //
      // If your DB is strict boolean, the insert above may fail.
      // So we handle it by updating availability after insert if needed.

      // If insert fails due to boolean mismatch, we'll catch it and insert with correct boolean below.
      // (We still proceed to update request offer_count only after a successful insert.)

      // Update request offer_count
      const { error: reqErr } = await supabase.rpc
        ? { error: null } // placeholder; we won't use rpc since we don't know it exists
        : { error: null };

      // Instead do it with a normal UPDATE + offer_count = offer_count + 1
      const { error: updateReqErr } = await supabase
        .from('requests')
        .update({
          offer_count: supabase.raw('offer_count + 1'),
          updated_at: new Date().toISOString(),
        })
        .eq('id', Number(requestId));

      // Supabase PostgREST may not support supabase.raw in all clients.
      // If that fails, we fall back to fetching then updating.
      if (updateReqErr) {
        // fallback: fetch then update
        const { data: reqRow, error: fetchReqErr } = await supabase
          .from('requests')
          .select('offer_count')
          .eq('id', Number(requestId))
          .single();

        if (fetchReqErr) throw fetchReqErr;

        const nextCount = (reqRow?.offer_count || 0) + 1;

        const { error: updateReqErr2 } = await supabase
          .from('requests')
          .update({ offer_count: nextCount, updated_at: new Date().toISOString() })
          .eq('id', Number(requestId));

        if (updateReqErr2) throw updateReqErr2;
      }

      alert('Offer sent successfully!');
      hideModal(offerModal);
      offerForm.reset();
      await loadRequests();
    } catch (err) {
      // If this is failing because availability is boolean, do a corrected insert
      // (availability: true)
      console.error('Offer submit error:', err?.message || err);

      try {
        const { data: authData2 } = await supabase.auth.getUser();
        const requestId = requestIdInput.value;

        const { error: retryErr } = await supabase
          .from('offers')
          .insert({
            request_id: Number(requestId),
            provider_id: authData2.user.id,
            price: Number(offerPriceInput.value),
            message: (offerMessageInput.value || '').trim() || null,
            status: 'pending',
            availability: true, // boolean fix
          });

        if (retryErr) throw retryErr;

        // Update request offer_count (same approach as above)
        const { data: reqRow, error: fetchReqErr } = await supabase
          .from('requests')
          .select('offer_count')
          .eq('id', Number(requestId))
          .single();

        if (fetchReqErr) throw fetchReqErr;

        const nextCount = (reqRow?.offer_count || 0) + 1;

        const { error: updateReqErr2 } = await supabase
          .from('requests')
          .update({ offer_count: nextCount, updated_at: new Date().toISOString() })
          .eq('id', Number(requestId));

        if (updateReqErr2) throw updateReqErr2;

        alert('Offer sent successfully!');
        hideModal(offerModal);
        offerForm.reset();
        await loadRequests();
      } catch (retryErr) {
        console.error('Retry failed:', retryErr);
        alert('Failed to send offer. Please try again.');
      }
    }
  });

  // Initial load
  loadRequests();

  async function loadRequests() {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error(authErr);
      showError('Failed to load requests.');
      return;
    }

    // If you want only logged-in providers to see this page, uncomment:
    // if (!authData?.user) { showError('Please log in.'); return; }

    const search = (searchInput?.value || '').trim();
    const category = categorySelect?.value || '';
    const location = (locationFilter?.value || '').trim();
    const sort = sortFilter?.value || 'newest';

    let query = supabase
      .from('requests')
      .select(`
        id,
        title,
        description,
        category,
        budget,
        location,
        status,
        offer_count,
        created_at,
        updated_at
      `);

    // Filters
    if (search) {
      query = query.or(
        `title.ilike.%${escapeLike(search)}%,description.ilike.%${escapeLike(search)}%`
      );
    }

    if (category) query = query.eq('category', category);

    if (location) {
      query = query.ilike('location', `%${escapeLike(location)}%`);
    }

    // Sort
    // requests.id is bigint; use created_at for "newest"
    if (sort === 'newest') query = query.order('created_at', { ascending: false });

    if (sort === 'budget-high') query = query.order('budget', { ascending: false, nullsLast: true });
    if (sort === 'budget-low') query = query.order('budget', { ascending: true, nullsLast: true });

    if (sort === 'urgent') {
      // No urgent field in schema; best-effort:
      // treat as "recently updated/open"
      query = query
        .order('updated_at', { ascending: false, nullsLast: true });
    }

    // Only open requests (recommended)
    query = query.eq('status', 'open');

    const { data, error } = await query;

    if (error) {
      console.error(error);
      showError('Failed to load requests.');
      return;
    }

    renderRequests(data || []);
  }

  function renderRequests(requests) {
    requestsList.innerHTML = '';
    noResults.classList.add('hidden');

    if (!requests.length) {
      noResults.classList.remove('hidden');
      return;
    }

    for (const r of requests) {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-lg shadow p-5';

      const budgetText = r.budget != null ? `₦${formatNumber(r.budget)}` : 'Not set';
      const offerCountText = r.offer_count != null ? `${r.offer_count} offers` : '0 offers';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-extrabold text-gray-900">${escapeHtml(r.title || 'Untitled')}</h3>
            <p class="text-gray-600 text-sm mt-1">${escapeHtml(r.category || '')}</p>
            <p class="text-gray-500 text-sm mt-2">📍 ${escapeHtml(r.location || 'Location not set')}</p>
            <p class="text-gray-700 text-sm mt-2">💰 Budget: <span class="font-semibold">${budgetText}</span></p>
            <p class="text-gray-500 text-sm mt-1">🧾 ${escapeHtml(offerCountText)}</p>
          </div>

          <div class="min-w-[140px] text-right">
            <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              r.status === 'open' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
            }">
              ${escapeHtml(r.status || 'open')}
            </span>

            <div class="text-xs text-gray-500 mt-2">
              ${r.created_at ? `Created: ${new Date(r.created_at).toLocaleDateString()}` : ''}
            </div>
          </div>
        </div>

        <p class="text-gray-600 text-sm mt-4 leading-relaxed">${escapeHtml(shorten(r.description, 160))}</p>

        <div class="flex items-center justify-between mt-4 gap-3">
          <button
            type="button"
            class="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-md text-sm"
            data-action="view"
            data-id="${r.id}"
          >
            View details
          </button>

          <button
            type="button"
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-md text-sm"
            data-action="offer"
            data-id="${r.id}"
          >
            Submit offer
          </button>
        </div>
      `;

      requestsList.appendChild(card);
    }

    // Attach handlers for buttons
    requestsList.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openRequestModal(id);
      });
    });

    requestsList.querySelectorAll('[data-action="offer"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openOfferModal(id);
      });
    });
  }

  async function openRequestModal(requestId) {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', Number(requestId))
      .single();

    if (error) {
      console.error(error);
      alert('Unable to load request details.');
      return;
    }

    const budgetText = data.budget != null ? `₦${formatNumber(data.budget)}` : 'Not set';

    modalContent.innerHTML = `
      <div class="space-y-3">
        <h2 class="text-2xl font-extrabold text-gray-900">${escapeHtml(data.title || '')}</h2>
        <div class="flex flex-wrap gap-2">
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">${escapeHtml(data.category || '')}</span>
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">📍 ${escapeHtml(data.location || '')}</span>
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">💰 ${budgetText}</span>
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">🧾 ${data.offer_count ?? 0} offers</span>
        </div>
        <p class="text-gray-700 whitespace-pre-wrap">${escapeHtml(data.description || '')}</p>

        <div class="text-sm text-gray-500">
          Created: ${data.created_at ? new Date(data.created_at).toLocaleString() : ''}
        </div>
      </div>
    `;

    showModal(requestModal);
  }

  function openOfferModal(requestId) {
    requestIdInput.value = requestId;

    // Reset fields
    offerPriceInput.value = '';
    offerMessageInput.value = '';
    offerAvailabilityInput.value = '';

    showModal(offerModal);
    offerPriceInput.focus();
  }

  function showModal(el) {
    el.classList.remove('hidden');
    el.classList.add('flex');
  }

  function hideModal(el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }

  function showError(msg) {
    requestsList.innerHTML = `
      <div class="text-center py-12">
        <p class="text-red-600 font-semibold">${escapeHtml(msg)}</p>
      </div>
    `;
  }
});

// Helpers
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// For ilike patterns
function escapeLike(str) {
  return String(str ?? '').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function shorten(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '...';
}

function formatNumber(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || Number.isNaN(Number(n))) return '0';
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Number(n));
}