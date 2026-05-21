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

// ============================
// AUTH CHECK
// ============================

const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  window.location.href = "login.html";
}

const currentUser = session.user;

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
    const { data: service, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error || !service) {
      serviceContainer.innerHTML = `
        <div class="text-center text-red-600">
          <p class="font-bold">Service not found</p>
        </div>
      `;
      return;
    }

    const providerId = service.provider_id;

    // FETCH REVIEWS
    const { data: reviews } = await supabase
      .from("reviews")
      .select(`
        *,
        reviewer:profiles!reviews_user_id_fkey(
          full_name,
          avatar_url
        )
      `)
      .eq("service_id", serviceId)
      .order("created_at", { ascending: false });

    // IMAGE
    const serviceImage =
      service.image_url ||
      "https://placehold.co/800x500?text=Vora";

    // ============================
    // RENDER SERVICE (NO CHAT UI)
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
            ${service.category || ""}
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
            ${service.description || "No description"}
          </p>
        </div>

        <div>
          <p class="text-sm text-gray-500">Location</p>
          <p class="text-gray-700">
            ${service.location || "Not specified"}
          </p>
        </div>

        <!-- ONLY BOOK BUTTON -->
        <div class="fixed bottom-0 left-0 w-full bg-white border-t p-4">

          <button id="bookNowBtn"
            class="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
            Book Now
          </button>

        </div>

      </div>
    `;

    // ============================
    // BOOK BUTTON ONLY
    // ============================

    const bookNowBtn = document.getElementById("bookNowBtn");

    if (bookNowBtn) {
      bookNowBtn.onclick = () => {
        LoadingSpinner.navigateTo(
          `payment.html?serviceId=${service.id}&providerId=${providerId}`
        );
      };
    }

    // REVIEWS
    renderReviews(reviews || []);

  } catch (err) {
    console.error(err);
    serviceContainer.innerHTML =
      `<p class="text-red-600">Failed to load service</p>`;
  }
}

// ============================
// RENDER REVIEWS
// ============================

function renderReviews(reviews) {
  if (!reviews.length) {
    reviewsContainer.innerHTML =
      `<p class="text-gray-500">No reviews yet.</p>`;
    return;
  }

  reviewsContainer.innerHTML = "";

  reviews.forEach(r => {
    const card = document.createElement("div");

    card.className = "border-b py-4 flex gap-3";

    card.innerHTML = `
      <img
        src="${r.reviewer?.avatar_url || 'https://placehold.co/50x50'}"
        class="w-10 h-10 rounded-full object-cover"
      />

      <div class="flex-1">
        <p class="font-semibold text-gray-900">
          ${r.reviewer?.full_name || "Anonymous"}
        </p>

        <div class="flex items-center gap-2 text-sm text-gray-600">
          <span>${"⭐".repeat(r.rating || 0)}</span>
          <span>${new Date(r.created_at).toLocaleDateString()}</span>
        </div>

        <p class="text-gray-700 mt-2">
          ${r.comment || ""}
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