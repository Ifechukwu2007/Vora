import { supabase, supabasePublic } from "./supabase.js";
import { resolveProfilePictureUrl } from './auth.js';
import { LoadingSpinner } from "./loading-utils.js";
import { formatPrice } from "./currency-utils.js";

// ============================
// GET URL PARAMS
// ============================

const params = new URLSearchParams(window.location.search);
const serviceId = params.get("id");

// ============================
// DOM ELEMENTS
// ============================

const serviceContainer = document.getElementById("service-container");
const reviewsContainer = document.getElementById("reviews-container");
const serviceReviewsWrapper = document.getElementById("service-reviews");

const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
  : '';

// ============================
// AUTH CHECK
// ============================

// Try to get session but don't require it for viewing service details/reviews
const { data: sessionData } = await supabase.auth.getSession();
const currentUser = sessionData?.session?.user || null;
let currentServiceContext = null;
let currentProviderContext = null;

function normalizeProfile(profile) {
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] : profile;
}

function bookingPriceInfo(service, peopleCount, location = 'provider') {
  const threshold = Number(service?.group_discount_threshold) || 0;
  const discountPercent = Number(service?.group_discount_percent) || 0;
  const basePrice = Number(service?.price) || 0;
  const meetsDeal = threshold > 0 && discountPercent > 0 && peopleCount >= threshold;
  const perPerson = meetsDeal
    ? Math.round(basePrice * (1 - discountPercent / 100))
    : basePrice;
  const travelFee = location === 'customer' ? Number(service.travel_price || 0) : 0;
  const total = (peopleCount * perPerson) + travelFee;
  return { perPerson, total, meetsDeal, travelFee };
}

// ============================
// LOAD SERVICE
// ============================

async function loadService() {
  try {
    if (!serviceId) {
      serviceContainer.innerHTML = `<p class="text-red-600">Invalid service ID</p>`;
      return;
    }

    // FETCH SERVICE
    const { data: service, error: serviceError } = await supabasePublic
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      serviceContainer.innerHTML = `
        <div class="text-center text-red-600">
          <p class="font-bold">Service not found</p>
        </div>
      `;
      return;
    }

    const providerId = service.provider_id;

    // FETCH SERVICE PROVIDER'S PROFILE
    const { data: providerProfile, error: providerError } = await supabasePublic
      .from('users')
      .select('full_name, email, profile_picture, location, verified')
      .eq('id', providerId)
      .single();

    if (providerError) {
      console.error('Failed to load provider profile', providerError);
    }

    // 1) FETCH REVIEWS ONLY
    const { data: reviews, error: reviewsError } = await supabasePublic
      .from('reviews')
      .select('*')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false });

    if (reviewsError) console.error('Failed to load reviews', reviewsError);

    // 2) FETCH REVIEWER PROFILES
    const userIds = [...new Set((reviews || []).map(r => r.user_id).filter(Boolean))];

    let usersById = {};
    let resolvedUsersById = {};
    if (userIds.length) {
      const { data: users, error: usersError } = await supabasePublic
        .from('users')
        .select('id, full_name, email, profile_picture')
        .in('id', userIds);

      if (usersError) console.error('Failed to load reviewer profiles', usersError);

      usersById = Object.fromEntries((users || []).map(u => [u.id, u]));

      // Resolve reviewer profile pictures
      const resolvedEntries = await Promise.all((users || []).map(async (u) => {
        const img = u?.profile_picture
          ? await (async () => { try { return await resolveProfilePictureUrl(u.profile_picture); } catch (e) { return null; } })()
          : null;
        const final = img || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || 'User')}&background=eceff4&color=1f2937`;
        return [u.id, { ...u, resolved_profile_picture: final }];
      }));

      resolvedUsersById = Object.fromEntries(resolvedEntries);
    }

    // IMAGE
    const serviceImage =
      service.image_url ||
      'https://placehold.co/800x500?text=Vora';

    currentServiceContext = { ...service, image_url: serviceImage, provider_name: providerProfile?.full_name || service.provider_name || '' };
    currentProviderContext = providerProfile || {};

    // Resolve provider image (prefer stored profile_picture)
    let providerImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(providerProfile?.full_name || 'Service Provider')}&background=eceff4&color=1f2937`;
    if (providerProfile?.profile_picture) {
      try {
        const r = await resolveProfilePictureUrl(providerProfile.profile_picture);
        if (r) providerImage = r;
      } catch (e) {
        console.warn('Could not resolve provider profile picture:', e);
      }
    }

    // ============================
    // RENDER SERVICE
    // ============================

    const threshold = Number(service?.group_discount_threshold) || 0;
    const discountPercent = Number(service?.group_discount_percent) || 0;
    const hasDeal = threshold > 0 && discountPercent > 0;
    const discountedPrice = hasDeal
      ? Math.round(Number(service.price || 0) * (1 - discountPercent / 100))
      : null;
    const discountedPriceText = hasDeal ? formatPrice(discountedPrice) : null;
    const dealMessageHtml = hasDeal ? `
          <div class="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 mb-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p class="text-sm text-indigo-700 font-semibold">Group Deal</p>
                <p class="text-lg font-bold text-indigo-900 mt-1">${service.deal_message || `Book ${service.group_discount_threshold} or more and save ${service.group_discount_percent}% per person.`}</p>
              </div>
              <span class="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold">${service.group_discount_percent}% OFF</span>
            </div>
          </div>
        ` : '';

    serviceContainer.innerHTML = `
      <div class="space-y-6 pb-24">

        <!-- PROVIDER PROFILE SECTION -->
        <a href="service-provider.html?id=${providerId}" class="block hover:shadow-lg transition">
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 hover:border-blue-300 cursor-pointer">
            <div class="flex items-center gap-4">
              <img
                src="${providerImage}"
                alt="${providerProfile?.full_name || 'Service Provider'}"
                class="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
              />
              <div>
                <p class="text-sm text-gray-600">Service Provider</p>
                <div class="flex items-center gap-2">
                  <h3 class="text-xl font-bold text-gray-900">
                    ${providerProfile?.full_name || 'Service Provider'}
                  </h3>
                  ${providerProfile?.verified ? `<span class="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">Verified</span>` : ''}
                </div>
                <p class="text-blue-600 text-sm">
                  ${providerProfile?.email || 'No email'}
                </p>
              </div>
            </div>
        </a>

        <img
          src="${serviceImage}"
          class="w-full h-80 object-cover rounded-xl"
        />

        <div>
          <h2 class="text-3xl font-bold text-gray-900">
            ${service.title}
          </h2>

          <p class="text-gray-500 mt-2">
            ${service.category || ''}
          </p>
        </div>

        ${dealMessageHtml}

        <div class="text-right">
          <p class="text-sm text-gray-500">Price Per Person</p>
          <div class="inline-flex items-center gap-3 rounded-3xl bg-gray-50 p-4 mt-3 justify-end">
            ${hasDeal ? `
              <div class="text-right">
                <p class="text-sm text-gray-500 line-through">${formatPrice(service.price)}</p>
                <p class="text-4xl font-extrabold text-green-600">${discountedPriceText}</p>
                <p class="text-xs text-gray-700 mt-1">${service.group_discount_percent}% off per person</p>
              </div>
              <span class="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-semibold">DEAL</span>
            ` : `
              <p class="text-4xl font-extrabold text-green-600">${formatPrice(service.price || 0)}</p>
            `}
          </div>
        </div>

        <div>
          <h3 class="text-xl font-bold mb-2">Description</h3>
          <p class="text-gray-700 leading-relaxed">
            ${service.description || 'No description'}
          </p>
        </div>

        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Location</p>
              <h3 class="mt-2 text-xl font-bold text-slate-900">Where you'll meet</h3>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                ${providerProfile?.location || service.location || 'Not specified'}
              </p>
            </div>
            <div class="inline-flex items-center rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200">
              📍 Exact spot shared after booking
            </div>
          </div>
          <div id="serviceMap" class="mt-6 h-[420px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner"></div>
        </div>

        <div class="fixed bottom-0 left-0 w-full bg-white border-t p-4">
          <button id="bookNowBtn"
            class="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
            Book Now
          </button>
        </div>

      </div>
    `;

    const bookNowBtn = document.getElementById('bookNowBtn');
    if (bookNowBtn) {
      bookNowBtn.onclick = () => {
        openBookingModal(service, providerId);
      };
    }

    renderReviewSummary(reviews || []);
    renderReviews(reviews || [], Object.keys(resolvedUsersById).length ? resolvedUsersById : usersById);
    await renderServiceMap(service, providerProfile);

  } catch (err) {
    console.error(err);
    serviceContainer.innerHTML =
      `<p class="text-red-600">Failed to load service</p>`;
  }
}

// ============================
// REVIEW SUMMARY (Display Only)
// ============================

function renderReviewSummary(reviews) {
  if (!serviceReviewsWrapper) return;

  let summary = document.getElementById('review-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'review-summary';
    summary.className = 'mb-6';
    const title = serviceReviewsWrapper.querySelector('h2');
    if (title) {
      title.insertAdjacentElement('afterend', summary);
    } else {
      serviceReviewsWrapper.prepend(summary);
    }
  }

  if (!reviews.length) {
    summary.innerHTML = `
      <div class="px-4 py-3 rounded-lg bg-gray-50 border border-gray-200">
        <p class="text-sm text-gray-600">This service has not been reviewed yet. Be the first to book and share your experience!</p>
      </div>
    `;
    return;
  }

  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  const count = reviews.length;
  const avg = (total / count).toFixed(1);
  const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

  summary.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4 rounded-lg bg-gray-50 border border-gray-200">
      <div>
        <div class="text-lg font-semibold text-gray-900">${avg}/5</div>
        <div class="text-sm text-gray-600">${stars} · ${count} review${count > 1 ? 's' : ''}</div>
      </div>
      <div class="text-sm text-gray-600">Rating from verified bookings.</div>
    </div>
  `;
}
 
// ============================ 
// RENDER REVIEWS (Display Only)
// ============================

function renderReviews(reviews, usersById) {
  if (!reviews.length) {
    reviewsContainer.innerHTML = '';
    return;
  }

  reviewsContainer.innerHTML = '';

  reviews.forEach(r => {
    const reviewer = usersById[r.user_id] || null;
    const card = document.createElement('div');

    card.className = 'border-b py-4 flex gap-3 review-card';

    const reviewerImg = reviewer?.resolved_profile_picture || reviewer?.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(reviewer?.full_name || 'Reviewer')}&background=eceff4&color=1f2937`;

    card.innerHTML = `
      <img
        src="${reviewerImg}"
        class="w-10 h-10 rounded-full object-cover"
      />

      <div class="flex-1">
        <p class="font-semibold text-gray-900">
          ${reviewer?.full_name || 'Anonymous'}
        </p>

        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>${'⭐'.repeat(r.rating || 0)}</span>
          <span>${new Date(r.created_at).toLocaleDateString()}</span>
        </div>

        <p class="text-gray-700 mt-2">
          ${r.comment || ''}
        </p>
      </div>
    `;

    reviewsContainer.appendChild(card);
  });
}

async function geocodeServiceLocation(location) {
  if (!MAPTILER_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(location)}.json?key=${MAPTILER_KEY}&limit=1`
    );
    const data = await response.json();

    if (!data?.features?.length) {
      return null;
    }

    return data.features[0].geometry.coordinates;
  } catch (error) {
    console.error('MapTiler geocoding failed:', error);
    return null;
  }
}

function renderMapError(message) {
  const mapElement = document.getElementById('serviceMap');
  if (!mapElement) return;
  mapElement.innerHTML = `
    <div class="flex h-full items-center justify-center bg-slate-50 px-6 text-center text-sm leading-6 text-slate-600">
      <div class="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p class="text-base font-semibold text-slate-900">Location preview unavailable</p>
        <p class="mt-2">${message}</p>
      </div>
    </div>
  `;
}

function clearRouteSummary() {
  const existing = document.getElementById('routeSummary');
  if (existing) existing.remove();
}

function renderRouteSummary(distanceMeters, durationSeconds) {
  clearRouteSummary();
  const mapElement = document.getElementById('serviceMap');
  if (!mapElement) return;

  const distanceText = distanceMeters
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : 'Unknown distance';
  const durationText = durationSeconds
    ? `${Math.round(durationSeconds / 60)} min`
    : 'Unknown ETA';

  const summary = document.createElement('div');
  summary.id = 'routeSummary';
  summary.className = 'absolute left-4 right-4 top-4 z-10 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm';
  summary.innerHTML = `
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-semibold text-slate-900">Route preview</p>
        <p class="text-xs text-slate-600">${distanceText} · ${durationText}</p>
      </div>
      <div class="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Live route</div>
    </div>
  `;

  mapElement.appendChild(summary);
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve([
          Number(position.coords.longitude),
          Number(position.coords.latitude),
        ]);
      },
      () => {
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

async function getDirections(origin, destination) {
  if (!MAPTILER_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.maptiler.com/directions/driving/car.json?key=${MAPTILER_KEY}&start=${origin[0]},${origin[1]}&end=${destination[0]},${destination[1]}&geometries=geojson&overview=full`);
    const data = await response.json();

    if (!data?.routes?.length) {
      return null;
    }

    return data.routes[0];
  } catch (error) {
    console.error('MapTiler directions failed:', error);
    return null;
  }
}

async function renderServiceMap(service, providerProfile) {
  const mapElement = document.getElementById('serviceMap');
  if (!mapElement) return;

  const providerLocation = providerProfile?.location || service.location;
  if (!providerLocation) {
    renderMapError('Provider location is not available.');
    return;
  }

  if (!MAPTILER_KEY) {
    renderMapError('MapTiler API key not set. Add window.MAPTILER_API_KEY to service.html.');
    return;
  }

  let destination = null;
  if (service.latitude && service.longitude) {
    destination = [Number(service.longitude), Number(service.latitude)];
  } else {
    destination = await geocodeServiceLocation(providerLocation);
  }

  if (!destination) {
    renderMapError('Unable to show the map for this location.');
    return;
  }

  const origin = await getCurrentPosition();
  const route = origin ? await getDirections(origin, destination) : null;

  mapElement.innerHTML = '';
  try {
    const map = new maplibregl.Map({
      container: mapElement,
      style: MAPTILER_STYLE_URL,
      center: destination,
      zoom: 13,
    });

    map.on('load', () => {
      if (route?.geometry?.coordinates) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: route.geometry,
          },
        });

        map.addLayer({
          id: 'routeLine',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 6,
            'line-opacity': 0.85,
          },
        });

        const bounds = route.geometry.coordinates.reduce(
          (b, coord) => b.extend(coord),
          new maplibregl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0])
        );

        bounds.extend(destination);
        if (origin) bounds.extend(origin);
        map.fitBounds(bounds, { padding: 70 });
        renderRouteSummary(route.distance, route.duration);
      } else {
        const bounds = new maplibregl.LngLatBounds(destination, destination);
        if (origin) bounds.extend(origin);
        map.fitBounds(bounds, { padding: 70 });
      }

      new maplibregl.Marker({ color: '#2563eb' })
        .setLngLat(destination)
        .setPopup(new maplibregl.Popup({ offset: 25 }).setText(providerLocation))
        .addTo(map);

      if (origin) {
        new maplibregl.Marker({ color: '#10b981' })
          .setLngLat(origin)
          .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Your current position'))
          .addTo(map);
      } else {
        map.setCenter(destination);
        map.setZoom(13);
      }
    });
  } catch (error) {
    console.error('Failed to initialize map:', error);
    renderMapError('Failed to initialize the map.');
  }
}

// ============================
// BOOKING MODAL
// ============================

async function openBookingModal(service, providerId) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    window.location.href = 'home.html';
    return;
  }

  // Store service globally so functions can access travel_price
  window.currentService = service;
  
  const travelPrice = service.travel_price || 0;
  const threshold = Number(service?.group_discount_threshold) || 0;
  const discountPercent = Number(service?.group_discount_percent) || 0;
  const hasGroupDeal = threshold > 0 && discountPercent > 0;
  const discountedPrice = hasGroupDeal
    ? Math.round(Number(service.price || 0) * (1 - discountPercent / 100))
    : Number(service.price || 0);
  const initialBookingInfo = bookingPriceInfo(service, 1, 'provider');
  const initialPerPerson = hasGroupDeal ? discountedPrice : initialBookingInfo.perPerson;
  const initialTotal = initialBookingInfo.total;
  const initialDealText = hasGroupDeal
    ? `Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}% per person.`
    : '';
  const initialDiscountBadge = hasGroupDeal
    ? `<span class="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-semibold">${service.group_discount_percent}% OFF</span>`
    : '';
  const modalHTML = `
    <div id="bookingModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-md w-full max-h-96 overflow-y-auto">
        <div class="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 class="text-2xl font-bold">Book Service</h2>
          <button onclick="document.getElementById('bookingModal').remove()" class="text-2xl">✕</button>
        </div>
        
        <form id="bookingForm" class="p-6 space-y-6">
          
          <!-- NUMBER OF PEOPLE -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <label class="block text-sm font-semibold text-gray-900">Number of People</label>
              ${initialDiscountBadge}
            </div>
            <div class="flex items-center justify-between bg-gray-50 rounded-lg p-4">
              <button type="button" onclick="updatePeople(-1)" class="bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg font-bold text-lg" title="Remove person">−</button>
              <span id="peopleCount" class="text-2xl font-bold">1</span>
              <button type="button" onclick="updatePeople(1)" class="bg-green-600 hover:bg-green-700 text-white w-10 h-10 rounded-lg font-bold text-lg" title="Add person">+</button>
            </div>
            <p id="bookingPerPerson" class="text-xs text-gray-600 mt-2">Price per person: ${formatPrice(initialPerPerson)}</p>
            <p id="dealInfo" class="text-xs text-indigo-600 mt-1">${initialDealText}</p>
          </div>

          <!-- TOTAL PRICE DISPLAY -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex justify-between items-center">
              <span id="totalLabel" class="text-gray-700 font-semibold">Total Price:</span>
              <span id="totalDisplay" class="text-2xl font-bold text-green-600">${formatPrice(initialTotal)}</span>
            </div>
            <p id="discountSavings" class="text-sm text-green-700 mt-2"></p>
          </div>

          <!-- SCHEDULE ARRIVAL DATE -->
          <div>
            <label for="scheduleDate" class="block text-sm font-semibold text-gray-900 mb-2">Select Date</label>
            <input type="date" id="scheduleDate" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          </div>

          <!-- SCHEDULE ARRIVAL TIME -->
          <div>
            <label for="scheduleTime" class="block text-sm font-semibold text-gray-900 mb-2">Select Time</label>
            <input type="time" id="scheduleTime" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          </div>

          <!-- SERVICE LOCATION -->
          <div>
            <label class="block text-sm font-semibold text-gray-900 mb-3">Service Location</label>
            <div class="space-y-3">
              <label class="flex items-center p-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="radio" name="serviceLocation" value="provider" class="h-4 w-4" checked onchange="updateTravelFee()">
                <span class="ml-3 text-gray-900 font-medium">I will come to the provider</span>
              </label>
              <label class="flex items-center p-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="radio" name="serviceLocation" value="customer" class="h-4 w-4" onchange="updateTravelFee()">
                <span class="ml-3 text-gray-900 font-medium">Provider should come to me</span>
              </label>
            </div>
            
            <!-- CUSTOMER LOCATION INPUT -->
            <div id="customerLocationDiv" class="hidden mt-4">
              <label for="customerLocation" class="block text-sm font-semibold text-gray-900 mb-2">📍 Your Location (Required)</label>
              <input type="text" id="customerLocation" placeholder="e.g., 15 Admiralty Way, Lekki Phase 1, Lagos, Nigeria" class="w-full border border-blue-300 rounded-lg p-3 bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition">
              <p class="text-xs text-gray-600 mt-1">Tell the provider where to come</p>
            </div>
            
            <div id="travelFeeDiv" class="hidden mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p class="text-sm text-orange-800"><strong>Travel Fee:</strong> <span id="travelFeeAmount">${formatPrice(travelPrice)}</span></p>
            </div>
          </div>

          <!-- SPECIAL INSTRUCTIONS -->
          <div>
            <label for="specialInstructions" class="block text-sm font-semibold text-gray-900 mb-2">Special Instructions (Optional)</label>
            <textarea id="specialInstructions" placeholder="e.g., Please bring extra lighting equipment" class="w-full border border-gray-300 rounded-lg p-3 h-20 focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>
          </div>

          <!-- SUBMIT BUTTON -->
          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition">
            Proceed to Payment
          </button>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('scheduleDate').min = today;

  const form = document.getElementById('bookingForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitBooking(service, providerId);
  });

  updateTotalPrice();
}

function updatePeople(change) {
  let count = parseInt(document.getElementById('peopleCount').textContent);
  count = Math.max(1, count + change);
  document.getElementById('peopleCount').textContent = count;
  updateTotalPrice();
}

function updateTravelFee() {
  const location = document.querySelector('input[name="serviceLocation"]:checked').value;
  const travelFeeDiv = document.getElementById('travelFeeDiv');
  const customerLocationDiv = document.getElementById('customerLocationDiv');
  
  if (location === 'customer') {
    travelFeeDiv.classList.remove('hidden');
    customerLocationDiv.classList.remove('hidden');
  } else {
    travelFeeDiv.classList.add('hidden');
    customerLocationDiv.classList.add('hidden');
  }
  
  updateTotalPrice();
}

function updateTotalPrice() {
  const peopleCount = parseInt(document.getElementById('peopleCount').textContent);
  const location = document.querySelector('input[name="serviceLocation"]:checked').value;
  const service = window.currentService;
  const { perPerson, total, meetsDeal, travelFee } = bookingPriceInfo(service, peopleCount, location);

  document.getElementById('totalDisplay').textContent = formatPrice(total);
  const totalLabel = document.getElementById('totalLabel');
  const discountSavings = document.getElementById('discountSavings');
  if (totalLabel) {
    totalLabel.textContent = meetsDeal ? 'Discounted Total:' : 'Total Price:';
  }
  if (discountSavings) {
    if (meetsDeal) {
      const originalTotal = (Number(service.price || 0) * peopleCount) + travelFee;
      const savings = Math.max(0, originalTotal - total);
      discountSavings.textContent = `You save ${formatPrice(savings)} with this group deal.`;
    } else {
      discountSavings.textContent = '';
    }
  }

  const pricePerPersonLabel = document.getElementById('bookingPerPerson');
  if (pricePerPersonLabel) {
    pricePerPersonLabel.textContent = `Price per person: ${formatPrice(perPerson)}`;
  }
  const dealInfo = document.getElementById('dealInfo');
  if (dealInfo) {
    if (meetsDeal) {
      dealInfo.textContent = `Group deal applied: Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}% per person.`;
    } else if (service.group_discount_threshold && service.group_discount_percent) {
      dealInfo.textContent = `Group deal: Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}% per person.`;
    } else {
      dealInfo.textContent = '';
    }
  }

  const travelFeeAmount = document.getElementById('travelFeeAmount');
  if (travelFeeAmount) {
    travelFeeAmount.textContent = formatPrice(travelFee);
  }
}

function submitBooking(service, providerId) {
  const peopleCount = parseInt(document.getElementById('peopleCount').textContent);
  const scheduleDate = document.getElementById('scheduleDate').value;
  const scheduleTime = document.getElementById('scheduleTime').value;
  const serviceLocation = document.querySelector('input[name="serviceLocation"]:checked').value;
  const specialInstructions = document.getElementById('specialInstructions').value;
  const customerLocation = document.getElementById('customerLocation').value;
  const { total: totalPrice } = bookingPriceInfo(service, peopleCount, serviceLocation);
  const travelFee = serviceLocation === 'customer' ? (service.travel_price || 0) : 0;

  if (!scheduleDate || !scheduleTime) {
    alert('Please select both date and time');
    return;
  }

  if (serviceLocation === 'customer' && !customerLocation.trim()) {
    alert('Please enter your location');
    return;
  }

  const scheduledDateTime = `${scheduleDate}T${scheduleTime}`;

  const bookingInfo = bookingPriceInfo(service, peopleCount, serviceLocation);
  const resolvedService = currentServiceContext || service || {};
  const resolvedProvider = currentProviderContext || {};
  const pendingBooking = {
    serviceId: resolvedService.id || service.id,
    providerId,
    serviceTitle: resolvedService.title || service.title,
    serviceImage: resolvedService.image_url || '',
    providerName: resolvedProvider.full_name || resolvedService.provider_name || service.provider_name || '',
    providerPicture: resolvedProvider.profile_picture || resolvedService.provider_picture || service.provider_picture || '',
    providerLocation: resolvedProvider.location || resolvedService.location || '',
    numberOfPeople: peopleCount,
    scheduledDate: scheduledDateTime,
    serviceLocation,
    customerLocation,
    travelFee,
    specialInstructions,
    totalPrice: bookingInfo.total,
    pricePerPerson: bookingInfo.perPerson,
    discountedTotal: bookingInfo.total,
    discountedPerPerson: bookingInfo.perPerson,
  };
  try {
    localStorage.setItem('voraPendingBooking', JSON.stringify(pendingBooking));
  } catch (err) {
    console.warn('Could not persist pending booking:', err);
  }

  const params = new URLSearchParams();
  params.append('serviceId', service.id);
  params.append('providerId', providerId);
  params.append('numberOfPeople', peopleCount);
  params.append('scheduledDate', scheduledDateTime);
  params.append('serviceLocation', serviceLocation);
  params.append('customerLocation', customerLocation);
  params.append('travelFee', travelFee);
  params.append('specialInstructions', specialInstructions);
  params.append('totalPrice', bookingInfo.total);
  params.append('pricePerPerson', bookingInfo.perPerson);
  params.append('discountedTotal', bookingInfo.total);
  params.append('discountedPerPerson', bookingInfo.perPerson);

  LoadingSpinner.navigateTo(`complete-payment.html?${params.toString()}`);
}

// ============================
// INIT
// ============================

loadService();

// ============================
// EXPOSE FUNCTIONS TO WINDOW
// ============================
window.updatePeople = updatePeople;
window.updateTravelFee = updateTravelFee;
window.updateTotalPrice = updateTotalPrice;
window.submitBooking = submitBooking;
window.openBookingModal = openBookingModal;