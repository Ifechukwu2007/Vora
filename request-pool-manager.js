import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let currentUser = null;

// =========================
// INIT
// ========================= 
document.addEventListener("DOMContentLoaded", async () => {

    const logoutBtn = document.getElementById("logoutBtn");
    const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

    console.log("Request Pool loaded...");

    // ========================= 
    // AUTH CHECK
    // =========================
    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr) {
        console.error("Auth error:", userErr);
        return;
    }

    currentUser = userData.user;

    if (!currentUser) {
        window.location.href = "login";
        return;
    }

    console.log("Logged in as:", currentUser.email);

    // =========================
    // LOAD DATA
    // =========================
    await loadRequests();

    // =========================
    // REALTIME LISTENER
    // =========================
    supabase
        .channel("requests-channel")
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "requests"
            },
            (payload) => {
                console.log("Realtime update:", payload);
                loadRequests();
            }
        )
        .subscribe();

    // =========================
    // LOGOUT
    // =========================
    logoutBtn?.addEventListener("click", logout);
    logoutBtnSideMenu?.addEventListener("click", logout);

    // =========================
    // LOAD REVIEW STATS
    // =========================
    await loadRequestPoolReviewStats();
});

// =========================
// LOAD REQUESTS (FIXED)
// =========================
async function loadRequests() {

    console.log("Fetching requests...");

    const { data, error } = await supabase
        .from("requests")
        .select("*")
        .order("created_at", { ascending: false });

    console.log("Supabase response:", { data, error });

    const container = document.getElementById("requestContainer");

    if (error) {
        console.error("Supabase error:", error);
        container.innerHTML = `
            <div class="text-red-500 text-center">
                Failed to load requests: ${error.message}
            </div>
        `;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 py-10">
                No requests yet. Be the first to post one!
            </div>
        `;
        return;
    }

    renderRequests(data);
}

// =========================
// RENDER REQUESTS
// =========================
function renderRequests(requests) {

    const container = document.getElementById("requestContainer");

    container.innerHTML = "";

    requests.forEach(req => {

        const card = document.createElement("div");

        card.className = `
            bg-white
            rounded-xl
            shadow-md
            p-5
            border
            hover:shadow-lg
            transition
            cursor-pointer
        `;

        card.innerHTML = `
            <h3 class="text-xl font-bold text-gray-900">
                ${req.title || "Untitled Request"}
            </h3>

            <p class="text-sm text-gray-500 mt-1">
                ${req.category || "General"} • ${req.location || "No location"}
            </p>

            <p class="text-gray-700 mt-3">
                ${req.description || ""}
            </p>

            <div class="flex justify-between items-center mt-4">

                <span class="font-bold text-blue-600">
                    ₦${Number(req.budget || 0).toLocaleString()}
                </span>

                <button class="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm">
                    View Details
                </button>

            </div>
        `;

        card.onclick = () => {
            window.location.href = `request-details.html?id=${req.id}`;
        };

        container.appendChild(card);
    }); 
}

// =========================
// LOGOUT
// =========================
async function logout() {
    await supabase.auth.signOut();
    window.location.href = "login.html";
}

// =========================
// REQUEST POOL REVIEW STATS
// =========================
async function loadRequestPoolReviewStats() {
    const reviewStatsElement = document.getElementById('requestPoolReviewStats');

    if (!reviewStatsElement) return;

    try {
        reviewStatsElement.innerHTML = `
            <span class="text-blue-600">⏳</span>
            Loading rating information...
        `;

        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('rating, user_id');

        if (error) throw error;

        const totalReviews = (reviews || []).length;
        const uniqueProviders = new Set((reviews || []).map((review) => review.user_id).filter(Boolean)).size;
        const totalRating = (reviews || []).reduce((sum, review) => sum + Number(review.rating || 0), 0);
        const averageRating = totalReviews ? (totalRating / totalReviews).toFixed(1) : '0.0';
        const stars = totalReviews ? '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating)) : '☆☆☆☆☆';

        if (totalReviews > 0) {
            reviewStatsElement.innerHTML = `
                <span class="font-semibold text-gray-900">${averageRating}/5 • ${stars}</span>
                <span class="text-gray-600">•</span>
                <span class="text-gray-700">${totalReviews} review${totalReviews !== 1 ? 's' : ''} from ${uniqueProviders} provider${uniqueProviders !== 1 ? 's' : ''}</span>
            `;
        } else {
            reviewStatsElement.innerHTML = `
                <span class="text-gray-700">No ratings yet — join Vora and start earning 5-star reviews today!</span>
            `;
        }
    } catch (error) {
        console.error('Error loading request pool review stats:', error);
        reviewStatsElement.innerHTML = `
            <span class="text-red-700">⚠️ Could not load rating info right now</span>
        `;
    }
}
