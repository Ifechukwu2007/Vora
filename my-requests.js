import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let currentUser = null;

let allRequests = [];
let currentTab = "open";

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {

    // =========================
    // ELEMENTS
    // =========================
    const requestsList = document.getElementById("requestsList");
    const emptyState = document.getElementById("emptyState");

    const openTab = document.getElementById("openTab");
    const acceptedTab = document.getElementById("acceptedTab");
    const offerTab = document.getElementById("offerTab");

    const detailsModal = document.getElementById("detailsModal");
    const offersModal = document.getElementById("offersModal");

    const closeDetailsModal = document.getElementById("closeDetailsModal");
    const closeOffersModal = document.getElementById("closeOffersModal");

    const logoutBtn = document.getElementById("logoutBtn");
    const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

    // =========================
    // AUTH
    // =========================
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        LoadingSpinner.navigateTo("login.html");
        return;
    }

    currentUser = sessionData.session.user;

    // =========================
    // LOAD REQUESTS
    // =========================
    await loadRequests();

    // =========================
    // TAB EVENTS
    // =========================
    openTab.addEventListener("click", () => {
        switchTab("open");
    });

    acceptedTab.addEventListener("click", () => {
        switchTab("accepted");
    });

    offerTab.addEventListener("click", () => {
        switchTab("offers");
    });

    // =========================
    // CLOSE MODALS
    // =========================
    closeDetailsModal.onclick = () => {
        detailsModal.classList.add("hidden");
    };

    closeOffersModal.onclick = () => {
        offersModal.classList.add("hidden");
    };

    // =========================
    // LOGOUT
    // =========================
    async function logout() {
        await supabase.auth.signOut();
        LoadingSpinner.navigateTo("login.html");
    }

    if (logoutBtn) logoutBtn.onclick = logout;
    if (logoutBtnSideMenu) logoutBtnSideMenu.onclick = logout;
});

// =========================
// LOAD REQUESTS
// =========================
async function loadRequests() {

    const requestsList = document.getElementById("requestsList");

    requestsList.innerHTML = `
        <div class="text-center py-12">
            <p class="text-gray-500">Loading your requests...</p>
        </div>
    `;

    try {

        const { data, error } = await supabase
            .from("requests")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allRequests = data || [];

        updateCounts();

        renderRequests();

    } catch (error) {
        console.error(error);

        requestsList.innerHTML = `
            <div class="text-center py-12 text-red-500">
                Failed to load requests
            </div>
        `;
    }
}

// =========================
// UPDATE COUNTS
// =========================
function updateCounts() {

    const openCount = document.getElementById("openCount");
    const acceptedCount = document.getElementById("acceptedCount");
    const offerCount = document.getElementById("offerCount");

    const openRequests = allRequests.filter(r => r.status !== "accepted");

    const acceptedRequests = allRequests.filter(r => r.status === "accepted");

    let totalOffers = 0;

    allRequests.forEach(r => {
        totalOffers += r.offer_count || 0;
    });

    openCount.textContent = openRequests.length;
    acceptedCount.textContent = acceptedRequests.length;
    offerCount.textContent = totalOffers;
}

// =========================
// SWITCH TAB
// =========================
function switchTab(tab) {

    currentTab = tab;

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove(
            "active",
            "border-blue-600",
            "text-blue-600"
        );

        btn.classList.add("text-gray-600");
    });

    const activeBtn = document.getElementById(`${tab}Tab`);

    activeBtn.classList.add(
        "border-blue-600",
        "text-blue-600"
    );

    renderRequests();
}

// =========================
// RENDER REQUESTS
// =========================
function renderRequests() {

    const requestsList = document.getElementById("requestsList");
    const emptyState = document.getElementById("emptyState");

    let filtered = [...allRequests];

    // =========================
    // FILTER BY TAB
    // =========================
    if (currentTab === "open") {
        filtered = filtered.filter(r => r.status !== "accepted");
    }

    if (currentTab === "accepted") {
        filtered = filtered.filter(r => r.status === "accepted");
    }

    if (currentTab === "offers") {
        filtered = filtered.filter(r => (r.offer_count || 0) > 0);
    }

    requestsList.innerHTML = "";

    // =========================
    // EMPTY STATE
    // =========================
    if (!filtered.length) {
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");

    // =========================
    // RENDER CARDS
    // =========================
    filtered.forEach(request => {

        const card = document.createElement("div");

        card.className = `
            bg-white
            rounded-xl
            shadow-sm
            hover:shadow-lg
            transition
            p-6
        `;

        const statusColor =
            request.status === "accepted"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700";

        card.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                <div class="flex-1">

                    <div class="flex items-center gap-3 mb-2">

                        <h2 class="text-xl font-bold text-gray-900">
                            ${request.title || "Untitled Request"}
                        </h2>

                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor}">
                            ${request.status || "open"}
                        </span>

                    </div>

                    <p class="text-gray-600 line-clamp-2">
                        ${request.description || ""}
                    </p>

                    <div class="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">

                        <span>
                            📍 ${request.location || "No location"}
                        </span>

                        <span>
                            🗂 ${request.category || "General"}
                        </span>

                        <span>
                            💰 ₦${Number(request.budget || 0).toLocaleString()}
                        </span>

                        <span>
                            📩 ${request.offer_count || 0} offers
                        </span>

                    </div>

                </div>

                <div class="flex flex-col gap-2">

                    <button
                        class="view-btn bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                        data-id="${request.id}"
                    >
                        View
                    </button>

                    <button
                        class="offers-btn border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition"
                        data-id="${request.id}"
                    >
                        Offers
                    </button>

                </div>

            </div>
        `;

        requestsList.appendChild(card);
    });

    // =========================
    // VIEW EVENTS
    // =========================
    document.querySelectorAll(".view-btn").forEach(btn => {

        btn.addEventListener("click", () => {

            const requestId = btn.dataset.id;

            const request = allRequests.find(r => r.id == requestId);

            if (request) {
                openDetailsModal(request);
            }
        });
    });

    // =========================
    // OFFERS EVENTS
    // =========================
    document.querySelectorAll(".offers-btn").forEach(btn => {

        btn.addEventListener("click", async () => {

            const requestId = btn.dataset.id;

            await openOffersModal(requestId);
        });
    });
}

// =========================
// DETAILS MODAL
// =========================
function openDetailsModal(request) {

    const modal = document.getElementById("detailsModal");
    const content = document.getElementById("detailsContent");

    content.innerHTML = `
        <h2 class="text-2xl font-bold mb-4">
            ${request.title}
        </h2>

        <div class="space-y-4">

            <div>
                <p class="text-sm text-gray-500">Description</p>
                <p class="text-gray-800">
                    ${request.description || "No description"}
                </p>
            </div>

            <div class="grid grid-cols-2 gap-4">

                <div>
                    <p class="text-sm text-gray-500">Category</p>
                    <p class="font-semibold">
                        ${request.category || "General"}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">Budget</p>
                    <p class="font-semibold">
                        ₦${Number(request.budget || 0).toLocaleString()}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">Location</p>
                    <p class="font-semibold">
                        ${request.location || "N/A"}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">Status</p>
                    <p class="font-semibold capitalize">
                        ${request.status || "open"}
                    </p>
                </div>

            </div>

        </div>
    `;

    modal.classList.remove("hidden");
}

// =========================
// OPEN OFFERS MODAL
// =========================
async function openOffersModal(requestId) {

    const modal = document.getElementById("offersModal");
    const content = document.getElementById("offersContent");

    content.innerHTML = `
        <div class="text-center py-8 text-gray-500">
            Loading offers...
        </div>
    `;

    modal.classList.remove("hidden");

    try {

        const { data, error } = await supabase
            .from("offers")
            .select("*")
            .eq("request_id", requestId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!data.length) {

            content.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    No offers yet
                </div>
            `;

            return;
        }

        content.innerHTML = "";

        data.forEach(offer => {

            const card = document.createElement("div");

            card.className = `
                border
                rounded-xl
                p-4
                mb-4
            `;

            card.innerHTML = `
                <div class="flex items-center justify-between mb-3">

                    <div>
                        <p class="font-bold">
                            ₦${Number(offer.price || 0).toLocaleString()}
                        </p>

                        <p class="text-sm text-gray-500">
                            ${offer.availability || "Flexible"}
                        </p>
                    </div>

                    <button
                        class="accept-offer-btn bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                        data-offer="${offer.id}"
                        data-provider="${offer.provider_id}"
                        data-request="${requestId}"
                    >
                        Accept
                    </button>

                </div>

                <p class="text-gray-700">
                    ${offer.message || ""}
                </p>
            `;

            content.appendChild(card);
        });

        // =========================
        // ACCEPT OFFER
        // =========================
        document.querySelectorAll(".accept-offer-btn").forEach(btn => {

            btn.addEventListener("click", async () => {

                const offerId = btn.dataset.offer;
                const providerId = btn.dataset.provider;
                const requestId = btn.dataset.request;

                await acceptOffer(
                    offerId,
                    providerId,
                    requestId
                );
            });
        });

    } catch (error) {

        console.error(error);

        content.innerHTML = `
            <div class="text-center py-8 text-red-500">
                Failed to load offers
            </div>
        `;
    }
}

// =========================
// ACCEPT OFFER
// =========================
async function acceptOffer(
    offerId,
    providerId,
    requestId
) {

    try {

        // UPDATE REQUEST
        const { error: requestError } = await supabase
            .from("requests")
            .update({
                status: "accepted",
                accepted_provider_id: providerId,
                accepted_offer_id: offerId
            })
            .eq("id", requestId);

        if (requestError) throw requestError;

        alert("Offer accepted successfully!");

        // OPTIONAL CHAT REDIRECT
        window.location.href = `
            chat.html?user=${providerId}
        `;

    } catch (error) {

        console.error(error);

        alert("Failed to accept offer");
    }
}