import { supabase } from "./supabase.js";

function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
}

// ===============================
// ELEMENTS
// ===============================
const bookingsContainer = document.getElementById("bookingsContainer");
const logoutBtns = document.querySelectorAll("[data-logout], #logoutBtn");
let serviceReviewStats = {};

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await checkAuth();
    setupLogout();
});

// ===============================
// CHECK AUTH
// ===============================
async function checkAuth() {
    try {
        const {
            data: { session },
            error
        } = await supabase.auth.getSession();

        if (error || !session) {
            window.location.href = "login.html";
            return;
        }

        const currentUser = session.user;

        await loadProviderBookings(currentUser.id);

    } catch (error) {
        console.error("Auth Error:", error);
        showError("Authentication failed.");
    }
}

// ===============================
// LOGOUT
// ===============================
function setupLogout() {
    logoutBtns.forEach((btn) => {
        btn.addEventListener("click", async () => {
            try {
                await supabase.auth.signOut();
                window.location.href = "login.html";
            } catch (error) {
                console.error("Logout Error:", error);
                alert("Failed to logout.");
            }
        });
    });
}

// ===============================
// LOAD BOOKINGS
// ===============================
async function loadProviderBookings(providerId) {

    bookingsContainer.innerHTML = `
        <div class="bg-white rounded-xl p-6 shadow text-center">
            <div class="animate-pulse text-lg font-semibold">
                Loading bookings...
            </div>
        </div>
    `;

    try {

        // ====================================
        // GET BOOKINGS
        // ====================================
        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        // ====================================
        // FETCH CUSTOMER PROFILES
        // ====================================
        let customerProfiles = {};
        if (bookings && bookings.length > 0) {
            const customerIds = [...new Set(bookings
                .map(b => b.user_id)
                .filter(Boolean)
            )];

            if (customerIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, email, full_name, profile_picture")
                    .in("id", customerIds);

                if (profiles) {
                    profiles.forEach(profile => {
                        customerProfiles[profile.id] = profile;
                    });
                }
            }
        }

        // ====================================
        // EMPTY STATE
        // ====================================
        if (!bookings || bookings.length === 0) {

            bookingsContainer.innerHTML = `
                <div class="bg-white rounded-2xl p-10 shadow text-center">

                    <div class="text-6xl mb-4">
                        📭
                    </div>

                    <h2 class="text-2xl font-bold mb-2">
                        No bookings yet
                    </h2>

                    <p class="text-gray-500">
                        Customers have not booked your services yet.
                    </p>

                </div>
            `;

            return;
        }

        bookingsContainer.innerHTML = "";

        const providerServiceIds = [...new Set(bookings
            .map(b => b.service_id)
            .filter(Boolean)
        )];

        if (providerServiceIds.length) {
            const { data: reviews, error: reviewError } = await supabase
                .from('reviews')
                .select('service_id, rating')
                .in('service_id', providerServiceIds);

            if (!reviewError && reviews) {
                serviceReviewStats = reviews.reduce((map, review) => {
                    const id = review.service_id;
                    if (!map[id]) map[id] = { sum: 0, count: 0 };
                    map[id].sum += Number(review.rating || 0);
                    map[id].count += 1;
                    return map;
                }, {});

                Object.keys(serviceReviewStats).forEach(id => {
                    const stats = serviceReviewStats[id];
                    stats.avg = stats.count ? stats.sum / stats.count : 0;
                });
            }
        }

        // ====================================
        // LOOP BOOKINGS
        // ====================================
        for (const booking of bookings) {

            // ====================================
            // GET SERVICE
            // ====================================
            let service = null;

            if (booking.service_id) {

                const { data: serviceData } = await supabase
                    .from("services")
                    .select("*")
                    .eq("id", booking.service_id)
                    .maybeSingle();

                service = serviceData; 
            }

            // ====================================
            // GET CUSTOMER PROFILE (from map)
            // ====================================
            let customer = customerProfiles[booking.user_id];

            // ====================================
            // GET CUSTOMER AUTH EMAIL
            // ====================================
            let customerEmail = customer?.email || "No email";

            let customerName = customer?.full_name || "Customer";

            let customerPicture = customer?.profile_picture || "https://ui-avatars.com/api/?name=User";

            // ====================================
            // VALUES 
            // ====================================
            const serviceTitle =
                service?.title || "Service";

            const serviceImage =
                service?.image_url ||
                "https://placehold.co/600x400?text=Vora";

            const category =
                service?.category || "General";

            const bookingDate =
                formatDate(booking.date || booking.scheduled_date);

            const amount =
                formatMoney(booking.total_price || booking.amount || booking.price);

            const status =
                booking.status || booking.state || "pending";

            // ====================================
            // STATUS COLORS
            // ====================================
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

            // ====================================
            // CREATE CARD
            // ====================================
            const card = document.createElement("div");

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
                    <div class="md:w-72 h-64">

                        <img
                            src="${serviceImage}"
                            alt="${serviceTitle}"
                            class="w-full h-full object-cover"
                        />

                    </div>

                    <!-- CONTENT -->
                    <div class="flex-1 p-6">

                        <div class="flex items-start justify-between gap-4">

                            <div>

                                <h3 class="text-2xl font-bold text-gray-900">
                                    ${serviceTitle}
                                </h3>

                                <p class="text-gray-500 mt-1">
                                    ${category}
                                </p>

                                ${(() => {
                                    const stats = serviceReviewStats[booking.service_id];
                                    if (stats && stats.count) {
                                        const avg = stats.avg.toFixed(1);
                                        return `
                                            <div class="flex items-center gap-2 mt-3 text-sm text-gray-600">
                                                <span class="text-yellow-500">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span>
                                                <span>${avg}/5 · ${stats.count} review${stats.count > 1 ? 's' : ''}</span>
                                            </div>
                                        `;
                                    }
                                    return `
                                        <div class="mt-3 text-sm text-gray-400">No reviews yet for this service</div>
                                    `;
                                })()}

                            </div>

                            <span class="px-4 py-2 rounded-full text-sm font-semibold ${statusColor}">
                                ${capitalize(status)}
                            </span>

                        </div>

                        <!-- DETAILS -->
                        <div class="mt-5 space-y-4 text-gray-700">

                            <div class="flex items-center gap-3">
                                <img
                                    src="${customerPicture}"
                                    alt="Customer avatar"
                                    class="w-12 h-12 rounded-full object-cover border border-gray-200"
                                />
                                <div>
                                    <p class="text-sm text-gray-500">Customer</p>
                                    <p class="font-semibold text-gray-900">
                                        ${customerName}
                                    </p>
                                    <p class="text-sm text-gray-500">
                                        ${customerEmail}
                                    </p>
                                </div>
                            </div>

                            <p>
                                📅 Scheduled:
                                <span class="font-semibold">
                                    ${bookingDate}
                                </span>
                            </p>

                            <p>
                                💰 Amount:
                                <span class="font-semibold text-green-600">
                                    ₦${amount}
                                </span>
                            </p>

                        </div>

                        <!-- ACTIONS -->
                        <div class="mt-6 flex flex-wrap gap-3">

                            ${
                                status !== "confirmed"
                                    ? `
                                <button
                                    class="confirm-booking-btn bg-green-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
                                    data-id="${booking.id}">
                                    Confirm Booking
                                </button>
                            `
                                    : ""
                            }

                            ${
                                status !== "cancelled"
                                    ? `
                                <button
                                    class="cancel-booking-btn bg-red-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-red-700 transition"
                                    data-id="${booking.id}">
                                    Cancel Booking
                                </button>
                            `
                                    : ""
                            }

                        </div>

                    </div>

                </div>
            `;

            bookingsContainer.appendChild(card);
        }

        // ====================================
        // ACTION BUTTONS
        // ====================================
        setupBookingActions();

    } catch (error) {

        console.error("Load Bookings Error:", error);

        showError(error.message);
    }
}

// ===============================
// BOOKING ACTIONS
// ===============================
function setupBookingActions() {

    // CONFIRM
    document.querySelectorAll(".confirm-booking-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                await updateBookingStatus(
                    bookingId,
                    "confirmed"
                );
            });
        });

    // CANCEL
    document.querySelectorAll(".cancel-booking-btn")
        .forEach((btn) => {

            btn.addEventListener("click", async () => {

                const bookingId = btn.dataset.id;

                const confirmed = confirm(
                    "Are you sure you want to cancel this booking?"
                );

                if (!confirmed) return;

                await updateBookingStatus(
                    bookingId,
                    "cancelled"
                );
            });
        });
}

// ===============================
// UPDATE STATUS
// ===============================
async function updateBookingStatus(
    bookingId,
    status
) {

    try {

        const { error } = await supabase
            .from("bookings")
            .update({
                status: status
            })
            .eq("id", bookingId);

        if (error) {
            throw error;
        }

        alert(`Booking ${status} successfully`);

        const {
            data: { session }
        } = await supabase.auth.getSession();

        await loadProviderBookings(session.user.id);

    } catch (error) {

        console.error("Update Status Error:", error);

        alert(error.message);
    }
}

// ===============================
// HELPERS
// ===============================
function formatDate(date) {

    if (!date) return "N/A";

    return new Date(date).toLocaleDateString(
        "en-NG",
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );
}

function formatMoney(amount) {

    return Number(amount || 0)
        .toLocaleString("en-NG");
}

function capitalize(text) {

    if (!text) return "";

    return text.charAt(0).toUpperCase() +
        text.slice(1);
}

// ===============================
// SHOW ERROR
// ===============================
function showError(message) {

    bookingsContainer.innerHTML = `
        <div class="bg-white rounded-2xl p-10 shadow text-center">

            <div class="text-6xl mb-4">
                ❌
            </div>

            <h2 class="text-2xl font-bold text-red-600 mb-3">
                Failed to load bookings
            </h2>

            <p class="text-gray-600">
                ${message}
            </p>

        </div>
    `;
}