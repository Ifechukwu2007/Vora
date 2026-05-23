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

    // FETCH REVIEWS (public)
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*, user_profile:user_id (id, full_name, profile_picture, email)')
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false });

    if (reviewsError) {
      console.error('Failed to load reviews', reviewsError);
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
          `payment.html?serviceId=${service.id}&providerId=${providerId}`
        );
      };
    }

    renderReviewSummary(reviews || []);
    renderReviews(reviews || []);
    renderReviewForm(service, reviews || []);

  } catch (err) {
    console.error(err);
    serviceContainer.innerHTML =
      `<p class="text-red-600">Failed to load service</p>`;
  }
}

// ============================
// REVIEW SUMMARY
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
        <p class="text-sm text-gray-600">This service has not been reviewed yet. Be the first to leave a review.</p>
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
      <div class="text-sm text-gray-600">Average rating from verified bookings.</div>
    </div>
  `;
}

// ============================
// RENDER REVIEWS
// ============================

function renderReviews(reviews) {
  if (!reviews.length) {
    reviewsContainer.innerHTML = `
      <div class="text-center py-6 text-gray-500">
        <p class="font-semibold">No reviews yet</p>
        <p class="text-sm mt-1">Be the first to review this service.</p>
      </div>
    `;
    return;
  }

  reviewsContainer.innerHTML = '';

  reviews.forEach(r => {
    const reviewer = normalizeProfile(r.user_profile) || r.user_profile || null;
    const card = document.createElement('div');

    card.className = 'border-b py-4 flex gap-3 review-card';

    card.innerHTML = `
      <img
        src="${reviewer?.profile_picture || reviewer?.avatar_url || 'https://placehold.co/50x50'}"
        class="w-10 h-10 rounded-full object-cover"
      />

      <div class="flex-1">
        <p class="font-semibold text-gray-900">
          ${reviewer?.full_name || reviewer?.email || 'Anonymous'}
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
// RENDER REVIEW FORM
// ============================

function renderReviewForm(service, existingReviews) {
  if (!serviceReviewsWrapper) return;

  const existingForm = document.getElementById('reviewForm');
  if (existingForm) existingForm.remove();

  const existingNote = document.getElementById('reviewFormNote');
  if (existingNote) existingNote.remove();

  if (!currentUser) {
    const loginNotice = document.createElement('div');
    loginNotice.id = 'reviewFormNote';
    loginNotice.className = 'text-sm text-gray-500 mb-4';
    loginNotice.innerHTML = `
      <p>Please <a href="login.html" class="text-blue-600">log in</a> to leave a review.</p>
    `;
    serviceReviewsWrapper.prepend(loginNotice);
    return;
  }

  const alreadyReviewed = (existingReviews || []).some(r => {
    return r.user_id === currentUser.id;
  });

  if (alreadyReviewed) {
    const note = document.createElement('div');
    note.id = 'reviewFormNote';
    note.className = 'text-sm text-gray-500 mb-4';
    note.textContent = 'You have already reviewed this service.';
    serviceReviewsWrapper.prepend(note);
    return;
  }

  const form = document.createElement('div');
  form.id = 'reviewForm';
  form.className = 'mb-6';
  form.innerHTML = `
    <div class="mb-4 border rounded-lg p-4 bg-gray-50">
      <h3 class="text-lg font-semibold mb-3">Leave a Review</h3>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700">Your rating</label>
        <select id="reviewRating" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2">
          <option value="">Select rating</option>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Very good</option>
          <option value="3">3 - Good</option>
          <option value="2">2 - Fair</option>
          <option value="1">1 - Poor</option>
        </select>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700">Comment</label>
        <textarea id="reviewComment" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm p-2" rows="4" placeholder="Share your experience..."></textarea>
      </div>
      <div class="flex items-center gap-3">
        <button id="submitReviewBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg">Submit Review</button>
        <button id="cancelReviewBtn" class="text-sm text-gray-500">Cancel</button>
      </div>
    </div>
  `;

  serviceReviewsWrapper.prepend(form);

  document.getElementById('cancelReviewBtn').onclick = () => {
    form.remove();
  };

  document.getElementById('submitReviewBtn').onclick = async () => {
    const rating = Number(document.getElementById('reviewRating').value);
    const comment = document.getElementById('reviewComment').value.trim();

    if (!rating) {
      alert('Please select a rating');
      return;
    }

    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('id')
        .eq('service_id', service.id)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bookingError) {
        throw bookingError;
      }

      if (!bookingData || !bookingData.id) {
        alert('You must book this service before leaving a review.');
        return;
      }

      const { data: existingReview, error: checkError } = await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', bookingData.id)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existingReview) {
        alert('You have already reviewed this booking.');
        return;
      }

      const { error: insertError } = await supabase
        .from('reviews')
        .insert({
          booking_id: bookingData.id,
          service_id: service.id,
          provider_id: service.provider_id,
          user_id: currentUser.id,
          rating,
          comment
        });

      if (insertError) {
        throw insertError;
      }

      alert('Review submitted successfully');
      await loadService();
    } catch (err) {
      console.error('Review submit error', err);
      alert(err?.message || 'Failed to submit review');
    }
  };
}

// ============================
// INIT
// ============================

loadService();