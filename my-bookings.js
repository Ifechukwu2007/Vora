import { supabase } from "./supabase.js";

let currentUser = null;

// ==========================
// REVIEW STATE
// ==========================
let currentBookingForReview = null;
let selectedRating = 0;

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {

    try {

        // ==========================
        // CHECK SESSION
        // ==========================
        const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        if (!sessionData.session) {
            window.location.href = "login.html";
            return;
        }

        currentUser = sessionData.session.user;

        // ==========================
        // SETUP
        // ==========================
        setupLogout();
        setupReviewButtons();
        setupReviewModal();

        // ==========================
        // LOAD BOOKINGS
        // ==========================
        await loadBookings();

    } catch (error) {

        console.error("INIT ERROR:", error);

        alert(error.message);
    }
});

// ==========================
// LOGOUT
// ==========================
function setupLogout() {

    const logoutBtn =
        document.getElementById("logoutBtn");

    const logoutBtnSideMenu =
        document.getElementById("logoutBtnSideMenu");

    async function logout() {

        await supabase.auth.signOut();

        window.location.href = "login.html";
    }

    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }

    if (logoutBtnSideMenu) {
        logoutBtnSideMenu.onclick = logout;
    }
}

// ==========================
// LOAD BOOKINGS
// ==========================
async function loadBookings() {

    const container =
        document.getElementById("bookingsContainer");

    if (!container) return;

    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow text-center">
            Loading bookings...
        </div>
    `;

    try {

        // ==========================
        // GET BOOKINGS
        // ==========================
        const { data: bookings, error } =
            await supabase
                .from("bookings")
                .select("*")
                .eq("user_id", currentUser.id)
                .order("created_at", {
                    ascending: false
                });

        if (error) {
            throw error;
        }

        // ==========================
        // EMPTY STATE
        // ==========================
        if (!bookings || bookings.length === 0) {

            container.innerHTML = `
                <div class="bg-white p-10 rounded-xl shadow text-center">

                    <div class="text-6xl mb-4">
                        📭
                    </div>

                    <h2 class="text-2xl font-bold mb-2">
                        No bookings yet
                    </h2>

                    <p class="text-gray-500 mb-6">
                        You have not booked any service.
                    </p>

                    <a href="browse.html"
                        class="bg-blue-600 text-white px-6 py-3 rounded-lg inline-block">
                        Browse Services
                    </a>

                </div>
            `;

            return;
        }

        container.innerHTML = "";

        // ==========================
        // LOOP BOOKINGS
        // ==========================
        for (const booking of bookings) {

            let service = null;
            let provider = null;

            // ==========================
            // GET SERVICE
            // ==========================
            if (booking.service_id) {

                const {
                    data: serviceData,
                    error: serviceError
                } = await supabase
                    .from("services")
                    .select("*")
                    .eq("id", booking.service_id)
                    .maybeSingle();

                if (!serviceError) {
                    service = serviceData;
                }
            }

            // ==========================
            // GET PROVIDER
            // ==========================
            if (booking.provider_id) {

                const {
                    data: providerData,
                    error: providerError
                } = await supabase
                    .from("profiles")
                    .select("full_name,email")
                    .eq("id", booking.provider_id)
                    .maybeSingle();

                if (!providerError) {
                    provider = providerData;
                }
            }

            // ==========================
            // DISPLAY VALUES
            // ==========================
            const image =
                service?.image_url ||
                "https://placehold.co/600x400?text=Vora";

            // THIS FIXES YOUR PROVIDER NAME ISSUE
            const providerName =
                provider?.full_name ||
                provider?.email ||
                "Unknown Provider";

            const serviceTitle =
                service?.title ||
                "Service";

            const category =
                service?.category ||
                "General";

            const status =
                booking.status || "pending";

            let statusColor =
                "bg-yellow-100 text-yellow-700";

            if (status === "confirmed") {
                statusColor =
                    "bg-green-100 text-green-700";
            }

            if (status === "cancelled") {
                statusColor =
                    "bg-red-100 text-red-700";
            }

            // ==========================
            // CREATE CARD
            // ==========================
            const card =
                document.createElement("div");

            card.className = `
                bg-white
                rounded-2xl
                shadow-sm
                overflow-hidden
                hover:shadow-lg
                transition
            `;

            card.innerHTML = `
                <div class="md:flex">

                    <!-- IMAGE -->
                    <div class="md:w-72 h-60">

                        <img
                            src="${image}"
                            class="w-full h-full object-cover"
                        />

                    </div>

                    <!-- CONTENT -->
                    <div class="flex-1 p-6">

                        <div class="flex items-start justify-between gap-4">

                            <div>

                                <h2 class="text-2xl font-bold text-gray-900">
                                    ${serviceTitle}
                                </h2>

                                <p class="text-gray-500 mt-1">
                                    ${category}
                                </p>

                            </div>

                            <span class="px-4 py-2 rounded-full text-sm font-semibold ${statusColor}">
                                ${status}
                            </span>

                        </div>

                        <!-- INFO -->
                        <div class="mt-5 space-y-2 text-gray-700">

                            <p>
                                👤 Provider:
                                <span class="font-semibold text-gray-900">
                                    ${providerName}
                                </span>
                            </p>

                            <p>
                                📅 Scheduled:
                                <span class="font-semibold">
                                    ${formatDate(booking.scheduled_date)}
                                </span>
                            </p>

                            <p>
                                💰 Amount:
                                <span class="font-semibold text-green-600">
                                    ₦${formatMoney(booking.total_price)}
                                </span>
                            </p>

                        </div>

                        <!-- BUTTONS -->
                        <div class="mt-6 flex gap-3 flex-wrap">

                            <a
                                href="service-details.html?id=${booking.service_id}"
                                class="bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-blue-700"
                            >
                                View Service
                            </a>

                            ${status === "confirmed" ? `
                                <button
                                    class="leave-review-btn bg-purple-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-purple-700"
                                    data-booking-id="${booking.id}"
                                    data-provider-id="${booking.provider_id}"
                                    data-service-id="${booking.service_id}"
                                >
                                    Leave Review
                                </button>
                            ` : ""}

                        </div>

                    </div>

                </div>
            `;

            container.appendChild(card);
        }

    } catch (error) {

        console.error("LOAD BOOKINGS ERROR:", error);

        container.innerHTML = `
            <div class="bg-white p-10 rounded-xl shadow text-center">

                <div class="text-6xl mb-4">
                    ❌
                </div>

                <h2 class="text-2xl font-bold text-red-600 mb-2">
                    Failed to load bookings
                </h2>

                <p class="text-gray-500 break-all">
                    ${error.message}
                </p>

            </div>
        `;
    }
}

// ==========================
// FORMAT DATE
// ==========================
function formatDate(dateString) {

    if (!dateString) return "N/A";

    return new Date(dateString)
        .toLocaleDateString(
            "en-NG",
            {
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );
}

// ==========================
// FORMAT MONEY
// ==========================
function formatMoney(amount) {

    return Number(amount || 0)
        .toLocaleString("en-NG");
}

// ==========================
// REVIEW BUTTONS
// ==========================
function setupReviewButtons() {

    document.addEventListener("click", (e) => {

        if (
            e.target.classList.contains(
                "leave-review-btn"
            )
        ) {

            currentBookingForReview = {
                id: e.target.dataset.bookingId,
                provider_id:
                    e.target.dataset.providerId,
                service_id:
                    e.target.dataset.serviceId
            };

            openReviewModal();
        }
    });
}

// ==========================
// REVIEW MODAL
// ==========================
function setupReviewModal() {

    const stars =
        document.querySelectorAll(
            "#reviewModal .star"
        );

    stars.forEach(star => {

        star.addEventListener("click", () => {

            selectedRating =
                parseInt(star.dataset.rating);

            updateStars();
        });
    });

    document
        .getElementById("closeReviewModal")
        ?.addEventListener(
            "click",
            closeReviewModal
        );

    document
        .getElementById("cancelReview")
        ?.addEventListener(
            "click",
            closeReviewModal
        );

    document
        .getElementById("submitReview")
        ?.addEventListener(
            "click",
            submitReview
        );
}

// ==========================
// OPEN MODAL
// ==========================
function openReviewModal() {

    document
        .getElementById("reviewModal")
        ?.classList.remove("hidden");

    document
        .getElementById("reviewComment")
        .value = "";

    selectedRating = 0;

    updateStars();
}

// ==========================
// CLOSE MODAL
// ==========================
function closeReviewModal() {

    document
        .getElementById("reviewModal")
        ?.classList.add("hidden");

    selectedRating = 0;

    currentBookingForReview = null;
}

// ==========================
// UPDATE STARS
// ==========================
function updateStars() {

    const stars =
        document.querySelectorAll(
            "#reviewModal .star"
        );

    stars.forEach((star, idx) => {

        if (idx < selectedRating) {

            star.classList.add(
                "text-yellow-400"
            );

            star.classList.remove(
                "text-gray-300"
            );

        } else {

            star.classList.remove(
                "text-yellow-400"
            );

            star.classList.add(
                "text-gray-300"
            );
        }
    });
}

// ==========================
// SUBMIT REVIEW
// ==========================
async function submitReview() {

    if (!selectedRating) {

        alert("Please select a rating");

        return;
    }

    try {

        const comment =
            document
                .getElementById("reviewComment")
                .value
                .trim();

        // ==========================
        // CHECK EXISTING REVIEW
        // ==========================
        const {
            data: existingReview
        } = await supabase
            .from("reviews")
            .select("id")
            .eq(
                "booking_id",
                currentBookingForReview.id
            )
            .maybeSingle();

        if (existingReview) {

            alert(
                "You already reviewed this booking"
            );

            closeReviewModal();

            return;
        }

        // ==========================
        // INSERT REVIEW
        // ==========================
        const { error } = await supabase
            .from("reviews")
            .insert({
                booking_id:
                    currentBookingForReview.id,

                service_id:
                    currentBookingForReview.service_id,

                user_id: currentUser.id,

                provider_id:
                    currentBookingForReview.provider_id,

                rating: selectedRating,

                comment: comment
            });

        if (error) {
            throw error;
        }

        alert(
            "Review submitted successfully!"
        );

        closeReviewModal();

    } catch (error) {

        console.error(
            "REVIEW ERROR:",
            error
        );

        alert(error.message);
    }
}