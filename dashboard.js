import { LoadingSpinner } from "./loading-utils.js";
import { supabase } from "./supabase.js";

// ================= STATE =================
let user = null;
let bookings = [];
let services = [];
let offers = [];

// ================= DOM ELEMENTS =================
const noServiceOverlay = document.getElementById("noServiceOverlay");
const providerName = document.getElementById("providerName");

// Booking & Revenue Stats
const totalBookings = document.getElementById("totalBookings");
const totalRevenue = document.getElementById("totalRevenue");
const activeServices = document.getElementById("activeServices");

// Offer Stats
const totalOffers = document.getElementById("totalOffers");
const totalWins = document.getElementById("totalWins");
const totalCompleted = document.getElementById("totalCompleted");
const successRate = document.getElementById("successRate");
const winRateBar = document.getElementById("winRateBar");
const winRatePercent = document.getElementById("winRatePercent");

// Sections
const todayBookings = document.getElementById("todayBookings");
const activeOffersList = document.getElementById("activeOffersList");
const upcomingBookings = document.getElementById("upcomingBookings");
const recentServices = document.getElementById("recentServices");
const activityFeed = document.getElementById("activityFeed");

// Modal
const offerDetailsModal = document.getElementById("offerDetailsModal");
const offerDetailsContent = document.getElementById("offerDetailsContent");
const closeOfferModal = document.getElementById("closeOfferModal");

// ================= STATUS CONSTANTS =================
const STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  AWAITING_PAYMENT: "awaiting_payment",
  COMPLETED: "completed"
};

let selectedOffer = null;

// ================= AUTH & INITIALIZATION =================
supabase.auth.onAuthStateChange(async (_event, session) => {
  user = session?.user ?? null;

  if (!user) {
    LoadingSpinner.navigateTo("login.html");
    return;
  }

  await loadDashboardData();
  checkUserHasServices();
  render();
});

// ================= LOAD DATA =================
async function loadDashboardData() {
  try {
    // Load bookings for this provider
    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select("*")
      .eq("provider_id", user.id)
      .order("date", { ascending: false });

    if (bookingsError) throw bookingsError;
    bookings = bookingsData || [];

    // Load offers for this provider
    const { data: offersData, error: offersError } = await supabase
      .from("offers")
      .select("*")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false });

    if (offersError) throw offersError;
    offers = offersData || [];

    // Load services for this provider
    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("*")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (servicesError) throw servicesError;
    services = servicesData || [];

    // Load user profile
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .single();

    if (userError && userError.code !== "PGRST116") throw userError;

    if (userData?.full_name && providerName) {
      providerName.textContent = userData.full_name;
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// ================= CHECK USER HAS SERVICES =================
async function checkUserHasServices() {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id")
      .eq("provider_id", user.id)
      .limit(1);

    if (error && error.code !== "PGRST116") throw error;

    if (!data || data.length === 0) {
      if (noServiceOverlay) {
        noServiceOverlay.classList.remove("hidden");
      }
    } else {
      if (noServiceOverlay) {
        noServiceOverlay.classList.add("hidden");
      }
    }
  } catch (error) {
    console.error("Error checking services:", error);
  }
}

// ================= RENDER DASHBOARD =================
function render() {
  renderStats();
  renderTodayBookings();
  renderActiveOffers();
  renderUpcomingBookings();
  renderServices();
  renderActivity();
}

// ================= RENDER STATS =================
function renderStats() {
  // Booking stats
  if (totalBookings) {
    totalBookings.textContent = bookings.length;
  }

  const revenue = bookings.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  if (totalRevenue) {
    totalRevenue.textContent = `₦${revenue.toLocaleString()}`;
  }

  if (activeServices) {
    activeServices.textContent = services.length;
  }

  // Offer stats
  if (totalOffers) {
    totalOffers.textContent = offers.length;
  }

  const wins = offers.filter(o =>
    o.status === STATUS.ACCEPTED ||
    o.status === STATUS.AWAITING_PAYMENT ||
    o.status === STATUS.COMPLETED
  ).length;

  if (totalWins) {
    totalWins.textContent = wins;
  }

  const completed = offers.filter(o => o.status === STATUS.COMPLETED).length;
  if (totalCompleted) {
    totalCompleted.textContent = completed;
  }

  const successPercent = offers.length > 0 ? Math.round((wins / offers.length) * 100) : 0;
  if (successRate) {
    successRate.textContent = `${successPercent}%`;
  }

  if (winRateBar) {
    winRateBar.style.width = `${successPercent}%`;
  }

  if (winRatePercent) {
    winRatePercent.textContent = successPercent;
  }
}

// ================= RENDER TODAY'S BOOKINGS =================
function renderTodayBookings() {
  const today = new Date().toISOString().split("T")[0];
  const todayList = bookings.filter((b) => {
    const bookingDate = new Date(b.date).toISOString().split("T")[0];
    return bookingDate === today;
  });

  if (todayList.length === 0) {
    todayBookings.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No bookings scheduled for today</p>';
    return;
  }

  todayBookings.innerHTML = todayList
    .map(
      (b) => `
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
      <div class="flex justify-between items-start">
        <div>
          <p class="font-medium text-gray-900">${b.customer_name || "Unknown"}</p>
          <p class="text-sm text-gray-600">${new Date(b.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <p class="font-semibold text-gray-900">₦${Number(b.amount || 0).toLocaleString()}</p>
      </div>
    </div>
  `
    )
    .join("");
}

// ================= RENDER ACTIVE OFFERS =================
function renderActiveOffers() {
  const activeOffers = offers.filter(o =>
    o.status !== STATUS.COMPLETED &&
    o.status !== STATUS.REJECTED &&
    o.status !== STATUS.CANCELLED
  );

  if (activeOffers.length === 0) {
    activeOffersList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No active offers</p>';
    return;
  }

  activeOffersList.innerHTML = activeOffers
    .slice(0, 5)
    .map((o) => `
    <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div class="flex justify-between items-start mb-3">
        <div>
          <p class="font-bold text-gray-900">₦${Number(o.price || 0).toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">Status: <span class="font-semibold uppercase">${o.status}</span></p>
        </div>
      </div>
      ${o.message ? `<p class="text-sm text-gray-600 mb-3">${o.message}</p>` : ''}
      <div class="flex gap-2 flex-wrap">
        <button onclick="window.openOffer('${o.id}')" class="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200">
          View
        </button>
        ${o.status === STATUS.PENDING ? `
          <button onclick="window.acceptOffer('${o.id}')" class="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium hover:bg-green-200">
            Accept
          </button>
          <button onclick="window.rejectOffer('${o.id}')" class="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200">
            Reject
          </button>
        ` : ''}
        ${o.status === STATUS.ACCEPTED ? `
          <button onclick="window.markAwaitingPayment('${o.id}')" class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-sm font-medium hover:bg-yellow-200">
            Payment Received
          </button>
        ` : ''}
        ${o.status === STATUS.AWAITING_PAYMENT ? `
          <button onclick="window.markCompleted('${o.id}')" class="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200">
            Mark Completed
          </button>
        ` : ''}
      </div>
    </div>
  `).join("");
}

// ================= RENDER UPCOMING BOOKINGS =================
function renderUpcomingBookings() {
  const today = new Date().toISOString().split("T")[0];
  const upcomingList = bookings.filter((b) => {
    const bookingDate = new Date(b.date).toISOString().split("T")[0];
    return bookingDate > today;
  });

  if (upcomingList.length === 0) {
    upcomingBookings.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No upcoming bookings</p>';
    return;
  }

  upcomingBookings.innerHTML = upcomingList
    .slice(0, 5)
    .map(
      (b) => `
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
      <div class="flex justify-between items-start">
        <div>
          <p class="font-medium text-gray-900">${b.customer_name || "Unknown"}</p>
          <p class="text-sm text-gray-600">${new Date(b.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
        </div>
        <p class="font-semibold text-gray-900">₦${Number(b.amount || 0).toLocaleString()}</p>
      </div>
    </div>
  `
    )
    .join("");
}

// ================= RENDER SERVICES =================
function renderServices() {
  if (services.length === 0) {
    recentServices.innerHTML = `
      <div class="text-center py-4">
        <p class="text-gray-500 text-sm mb-3">No services added yet</p>
        <a href="add-service.html" class="text-blue-600 text-sm font-medium hover:underline">Add a Service</a>
      </div>
    `;
    return;
  }

  recentServices.innerHTML = services
    .slice(0, 3)
    .map(
      (s) => `
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
      <p class="font-medium text-gray-900">${s.title || "Untitled Service"}</p>
      <p class="text-sm text-gray-600">₦${Number(s.price || 0).toLocaleString()}</p>
    </div>
  `
    )
    .join("");
}

// ================= RENDER ACTIVITY FEED =================
function renderActivity() {
  const combined = [...bookings, ...offers]
    .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
    .slice(0, 8);

  if (combined.length === 0) {
    activityFeed.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No recent activity</p>';
    return;
  }

  activityFeed.innerHTML = combined
    .map((item) => {
      const isOffer = item.price !== undefined;
      const date = new Date(item.created_at || item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const label = isOffer ? `Offer (₦${Number(item.price).toLocaleString()})` : `Booking (₦${Number(item.amount).toLocaleString()})`;
      const status = item.status || "pending";

      return `
    <div class="border-b border-gray-200 pb-3 last:border-b-0">
      <p class="text-sm text-gray-700">${label} • ${status}</p>
      <p class="text-xs text-gray-500 mt-1">${date}</p>
    </div>
  `;
    })
    .join("");
}

// ================= OFFER MANAGEMENT FUNCTIONS =================
async function updateOffer(id, data) {
  const { error } = await supabase
    .from("offers")
    .update(data)
    .eq("id", id);

  if (error) {
    console.error("Error updating offer:", error);
    throw error;
  }
}

window.acceptOffer = async (id) => {
  try {
    LoadingSpinner.show?.();
    await updateOffer(id, { status: STATUS.ACCEPTED });
    await loadDashboardData();
    render();
  } catch (error) {
    alert("Failed to accept offer");
  } finally {
    LoadingSpinner.hide?.();
  }
};

window.rejectOffer = async (id) => {
  try {
    LoadingSpinner.show?.();
    await updateOffer(id, { status: STATUS.REJECTED });
    await loadDashboardData();
    render();
  } catch (error) {
    alert("Failed to reject offer");
  } finally {
    LoadingSpinner.hide?.();
  }
};

window.cancelOffer = async (id) => {
  try {
    LoadingSpinner.show?.();
    await updateOffer(id, { status: STATUS.CANCELLED });
    await loadDashboardData();
    render();
    offerDetailsModal.classList.add("hidden");
  } catch (error) {
    alert("Failed to cancel offer");
  } finally {
    LoadingSpinner.hide?.();
  }
};

window.markAwaitingPayment = async (id) => {
  try {
    LoadingSpinner.show?.();
    await updateOffer(id, {
      status: STATUS.AWAITING_PAYMENT,
      payment_received_at: new Date().toISOString()
    });
    await loadDashboardData();
    render();
  } catch (error) {
    alert("Failed to update offer");
  } finally {
    LoadingSpinner.hide?.();
  }
};

window.markCompleted = async (id) => {
  try {
    const offer = offers.find(o => o.id === id);
    if (!offer) {
      alert("Offer not found");
      return;
    }

    if (offer.status !== STATUS.AWAITING_PAYMENT) {
      alert("You must confirm payment first before completing this job.");
      return;
    }

    LoadingSpinner.show?.();
    await updateOffer(id, {
      status: STATUS.COMPLETED,
      completed_at: new Date().toISOString()
    });
    await loadDashboardData();
    render();
    offerDetailsModal.classList.add("hidden");
  } catch (error) {
    alert("Failed to mark offer as completed");
  } finally {
    LoadingSpinner.hide?.();
  }
};

window.openOffer = (id) => {
  const offer = offers.find(o => o.id === id);
  if (!offer) return;

  selectedOffer = offer;

  offerDetailsContent.innerHTML = `
    <div class="space-y-4">
      <div>
        <p class="text-sm text-gray-600">Price</p>
        <p class="text-2xl font-bold text-gray-900">₦${Number(offer.price).toLocaleString()}</p>
      </div>
      
      <div>
        <p class="text-sm text-gray-600">Status</p>
        <p class="font-semibold text-gray-900 uppercase">${offer.status}</p>
      </div>

      ${offer.message ? `
      <div>
        <p class="text-sm text-gray-600">Message</p>
        <p class="text-gray-900">${offer.message}</p>
      </div>
      ` : ''}

      <div class="mt-6 space-y-2">
        ${offer.status === STATUS.PENDING ? `
          <button onclick="window.acceptOffer('${offer.id}')" class="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700">
            Accept Offer
          </button>
          <button onclick="window.rejectOffer('${offer.id}')" class="w-full bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700">
            Reject Offer
          </button>
        ` : ''}

        ${offer.status === STATUS.ACCEPTED ? `
          <button onclick="window.markAwaitingPayment('${offer.id}')" class="w-full bg-yellow-600 text-white py-2 rounded-lg font-medium hover:bg-yellow-700">
            Confirm Payment Received
          </button>
        ` : ''}

        ${offer.status === STATUS.AWAITING_PAYMENT ? `
          <button onclick="window.markCompleted('${offer.id}')" class="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">
            Mark as Completed
          </button>
        ` : ''}

        ${offer.status !== STATUS.COMPLETED && offer.status !== STATUS.REJECTED ? `
          <button onclick="window.cancelOffer('${offer.id}')" class="w-full bg-gray-600 text-white py-2 rounded-lg font-medium hover:bg-gray-700">
            Cancel
          </button>
        ` : ''}
      </div>
    </div>
  `;

  offerDetailsModal.classList.remove("hidden");
};

// ================= MODAL CLOSE =================
closeOfferModal?.addEventListener("click", () => {
  offerDetailsModal.classList.add("hidden");
});

offerDetailsModal?.addEventListener("click", (e) => {
  if (e.target === offerDetailsModal) {
    offerDetailsModal.classList.add("hidden");
  }
});

// ================= LOGOUT =================
document.querySelectorAll("#logoutBtn, [data-logout]").forEach((btn) => {
  btn?.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
      LoadingSpinner.navigateTo("login.html");
    } catch (error) {
      console.error("Logout error:", error);
    }
  });
});