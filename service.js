import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

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

// ============================
// AUTH CHECK
// ============================

// Try to get session but don't require it for viewing service details/reviews
const { data: sessionData } = await supabase.auth.getSession();
const currentUser = sessionData?.session?.user || null;

function normalizeProfile(profile) {
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] : profile;
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
    const { data: service, error: serviceError } = await supabase
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
    const { data: providerProfile, error: providerError } = await supabase
      .from('users')
      .select('full_name, email, profile_picture')
      .eq('id', providerId)
      .single();

    if (providerError) {
      console.error('Failed to load provider profile', providerError);
    }

    // 1) FETCH REVIEWS ONLY
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false });

    if (reviewsError) console.error('Failed to load reviews', reviewsError);

    // 2) FETCH REVIEWER PROFILES
    const userIds = [...new Set((reviews || []).map(r => r.user_id).filter(Boolean))];

    let usersById = {};
    if (userIds.length) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, profile_picture')
        .in('id', userIds);

      if (usersError) console.error('Failed to load reviewer profiles', usersError);

      usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
    }

    // IMAGE
    const serviceImage =
      service.image_url ||
      'https://placehold.co/800x500?text=Vora';

    // ============================
    // RENDER SERVICE
    // ============================

    serviceContainer.innerHTML = `
      <div class="space-y-6 pb-24">

        <!-- PROVIDER PROFILE SECTION -->
        <a href="service-provider.html?id=${providerId}" class="block hover:shadow-lg transition">
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 hover:border-blue-300 cursor-pointer">
            <div class="flex items-center gap-4">
              <img
                src="${
                  providerProfile?.profile_picture ||
                  'https://ui-avatars.com/api/?name=' + encodeURIComponent(providerProfile?.full_name || 'Service Provider')
                }"
                alt="${providerProfile?.full_name || 'Service Provider'}"
                class="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
              />
              <div>
                <p class="text-sm text-gray-600">Service Provider</p>
                <h3 class="text-xl font-bold text-gray-900">
                ${providerProfile?.full_name || 'Service Provider'}
              </h3>
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

        <div class="text-right">
          <p class="text-sm text-gray-500">Price Per Person</p>
          <p class="text-2xl font-extrabold text-green-600">
            ₦${service.price || 0}
          </p>
        </div>

        <div>
          <h3 class="text-xl font-bold mb-2">Description</h3>
          <p class="text-gray-700 leading-relaxed">
            ${service.description || 'No description'}
          </p>
        </div>

        <div>
          <p class="text-sm text-gray-500">Location</p>
          <p class="text-gray-700">
            ${service.location || 'Not specified'}
          </p>
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
    renderReviews(reviews || [], usersById);

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

    card.innerHTML = `
      <img
        src="${reviewer?.profile_picture || 'https://placehold.co/50x50'}"
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

// ============================
// BOOKING MODAL
// ============================

function openBookingModal(service, providerId) {
  // Store service globally so functions can access travel_price
  window.currentService = service;
  
  const travelPrice = service.travel_price || 0;
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
            <label class="block text-sm font-semibold text-gray-900 mb-3">Number of People</label>
            <div class="flex items-center justify-between bg-gray-50 rounded-lg p-4">
              <button type="button" onclick="updatePeople(-1)" class="bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg font-bold text-lg" title="Remove person">−</button>
              <span id="peopleCount" class="text-2xl font-bold">1</span>
              <button type="button" onclick="updatePeople(1)" class="bg-green-600 hover:bg-green-700 text-white w-10 h-10 rounded-lg font-bold text-lg" title="Add person">+</button>
            </div>
            <p class="text-xs text-gray-600 mt-2">Price per person: ₦${service.price}</p>
          </div>

          <!-- TOTAL PRICE DISPLAY -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex justify-between items-center">
              <span class="text-gray-700 font-semibold">Total Price:</span>
              <span id="totalDisplay" class="text-2xl font-bold text-green-600">₦${service.price}</span>
            </div>
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
              <p class="text-sm text-orange-800"><strong>Travel Fee:</strong> <span id="travelFeeAmount">₦${travelPrice.toLocaleString()}</span></p>
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
  const travelFee = location === 'customer' ? (service.travel_price || 0) : 0;
  
  const total = (peopleCount * service.price) + travelFee;
  document.getElementById('totalDisplay').textContent = `₦${total.toLocaleString()}`;
}

function submitBooking(service, providerId) {
  const peopleCount = parseInt(document.getElementById('peopleCount').textContent);
  const scheduleDate = document.getElementById('scheduleDate').value;
  const scheduleTime = document.getElementById('scheduleTime').value;
  const serviceLocation = document.querySelector('input[name="serviceLocation"]:checked').value;
  const specialInstructions = document.getElementById('specialInstructions').value;
  const customerLocation = document.getElementById('customerLocation').value;
  const travelFee = serviceLocation === 'customer' ? (service.travel_price || 0) : 0;
  const totalPrice = (peopleCount * service.price) + travelFee;

  if (!scheduleDate || !scheduleTime) {
    alert('Please select both date and time');
    return;
  }

  if (serviceLocation === 'customer' && !customerLocation.trim()) {
    alert('Please enter your location');
    return;
  }

  const scheduledDateTime = `${scheduleDate}T${scheduleTime}`;

  const params = new URLSearchParams();
  params.append('serviceId', service.id);
  params.append('providerId', providerId);
  params.append('numberOfPeople', peopleCount);
  params.append('scheduledDate', scheduledDateTime);
  params.append('serviceLocation', serviceLocation);
  params.append('customerLocation', customerLocation);
  params.append('travelFee', travelFee);
  params.append('specialInstructions', specialInstructions);
  params.append('totalPrice', totalPrice);

  LoadingSpinner.navigateTo(`payment.html?${params.toString()}`);
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