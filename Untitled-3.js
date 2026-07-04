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
          <p class="text-sm text-gray-500">Price</p>
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
        LoadingSpinner.navigateTo(
          `complete-payment.html?serviceId=${service.id}&providerId=${providerId}`
        );
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
// INIT
// ============================

loadService();