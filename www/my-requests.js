import { supabase } from "./supabase.js";
import { NotificationService } from "./notification-service.js";

let currentUser = null;
let allRequests = [];
let requestsChannel = null;

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {

    const { data: sessionData } = await supabase.auth.getSession();
    currentUser = sessionData?.session?.user || null;

    if (!currentUser) {
        window.location.href = "login.html";
        return;
    }

    await loadRequests();
    setupFilters();
    setupModals();
    setupLogout();
    setupRealtime();
});

// =========================
// SAFE ELEMENT HELPER
// =========================
function el(id) {
    return document.getElementById(id);
}

// =========================
// LOGOUT
// =========================
function setupLogout() {
    el("logoutBtn")?.addEventListener("click", logout);
    el("logoutBtnSideMenu")?.addEventListener("click", logout);

    async function logout() {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    }
}

// =========================
// LOAD REQUESTS
// =========================
async function loadRequests() {

    const list = el("requestsList");

    if (!list) return;

    list.innerHTML = `
        <div class="text-center py-10 text-gray-500">
            Loading requests...
        </div>
    `;

    const { data, error } = await supabase
        .from("requests")
        .select(`
            id, title, description, category, budget,
            location, status, created_at, offer_count, user_id,
            profiles:user_id (id, email, full_name, profile_picture)
        `)
        .order("created_at", { ascending: false });

    if (error) {
        list.innerHTML = `<p class="text-red-500">Failed to load requests</p>`;
        console.error(error);
        return;
    }

    allRequests = data || [];
    renderRequests(allRequests);
}

// =========================
// NORMALIZE PROFILE (IMPORTANT FIX)
// =========================
function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
}

// =========================
// RENDER
// =========================
function renderRequests(requests) {

    const list = el("requestsList");
    const empty = el("noResults");

    if (!list) return;

    list.innerHTML = "";

    if (!requests.length) {
        if (empty) empty.classList.remove("hidden");
        return;
    }

    if (empty) empty.classList.add("hidden");

    requests.forEach(r => {

        const profile = normalizeProfile(r.profiles);

        const email = profile?.email || "User not available";
        const name = profile?.full_name || email;

        const card = document.createElement("div");

        card.className = "bg-white rounded-xl shadow p-5";

        card.innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <img src="${profile?.profile_picture || 'https://ui-avatars.com/api/?name=User'}"
                     class="w-10 h-10 rounded-full" />
                <div>
                    <p class="text-xs text-gray-500">Posted by</p>
                    <p class="font-semibold">${email}</p>
                </div>
            </div>

            <h2 class="text-xl font-bold">${r.title}</h2>

            <p class="text-gray-600 text-sm mt-2">
                ${r.description || "No description"}
            </p>

            <div class="flex justify-between mt-4 text-sm text-gray-500">
                <span>📍 ${r.location || "N/A"}</span>
                <span>💰 ₦${Number(r.budget || 0).toLocaleString()}</span>
                <span>📩 ${r.offer_count || 0} offers</span>
            </div>

            <div class="mt-4 flex gap-2">
                <button class="view-btn bg-blue-600 text-white px-3 py-2 rounded"
                    data-id="${r.id}">
                    View
                </button>

                <button class="offer-btn border px-3 py-2 rounded"
                    data-id="${r.id}">
                    Offers
                </button>
            </div>
        `;

        list.appendChild(card);
    });

    setupButtons();
}

// =========================
// BUTTON EVENTS
// =========================
function setupButtons() {

    document.querySelectorAll(".view-btn").forEach(btn => {
        btn.onclick = () => openDetails(btn.dataset.id);
    });

    document.querySelectorAll(".offer-btn").forEach(btn => {
        btn.onclick = () => openOffers(btn.dataset.id);
    });
}

// =========================
// DETAILS MODAL
// =========================
function openDetails(id) {

    const request = allRequests.find(r => r.id == id);
    if (!request) return;

    const modal = el("detailsModal");
    const content = el("detailsContent");

    const profile = normalizeProfile(request.profiles);

    content.innerHTML = `
        <h2 class="text-2xl font-bold">${request.title}</h2>
        <p class="text-gray-600 mt-2">${request.description}</p>

        <div class="mt-4 text-sm text-gray-500">
            <p>Email: ${profile?.email || "N/A"}</p>
            <p>Location: ${request.location || "N/A"}</p>
            <p>Budget: ₦${Number(request.budget || 0).toLocaleString()}</p>
        </div>
    `;

    modal.classList.remove("hidden");
}

// =========================
// OFFERS MODAL (FIXED SAFE VERSION)
// =========================
async function openOffers(id) {

    const modal = el("offersModal");
    const content = el("offersContent");

    modal.classList.remove("hidden");

    content.innerHTML = "Loading offers...";

    const { data, error } = await supabase
        .from("offers")
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: false });

    if (error) {
        content.innerHTML = "Failed to load offers";
        return;
    }

    if (!data.length) {
        content.innerHTML = "No offers yet";
        return;
    }

    content.innerHTML = "";

    for (const offer of data) {

        const card = document.createElement("div");
        card.className = "border p-3 rounded mb-2";

        card.innerHTML = `
            <p>💰 ₦${offer.price}</p>
            <p>${offer.message || ""}</p>
            <p class="text-sm text-gray-500">${offer.status}</p>
        `;

        content.appendChild(card);
    }
}

// =========================
// FILTER (SAFE)
// =========================
function setupFilters() {

    const search = el("searchInput");

    search?.addEventListener("input", () => {

        const value = search.value.toLowerCase();

        const filtered = allRequests.filter(r =>
            (r.title || "").toLowerCase().includes(value) ||
            (r.description || "").toLowerCase().includes(value)
        );

        renderRequests(filtered);
    });
}

// =========================
// MODALS CLOSE SAFE
// =========================
function setupModals() {

    el("closeDetailsModal")?.addEventListener("click", () => {
        el("detailsModal")?.classList.add("hidden");
    });

    el("closeOffersModal")?.addEventListener("click", () => {
        el("offersModal")?.classList.add("hidden");
    });
}

// =========================
// REALTIME (OPTIONAL)
// =========================
function setupRealtime() {

    if (!currentUser) return;

    requestsChannel = supabase 
        .channel("requests-feed") 
        .on("postgres_changes", { 
            event: "*",
            schema: "public", 
            table: "requests"
        }, () => {
            loadRequests();
        })
        .subscribe();
}