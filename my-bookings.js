import { supabase } from "./supabase.js";

let currentUser = null;
let selectedRating = 0;
let selectedBooking = null;

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "login";
        return;
    }

    currentUser = sessionData.session.user;

    await loadBookings();
    setupReviewModal();
    setupLogout();
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

        window.location.href = "login";
    }

    logoutBtn?.addEventListener("click", logout);

    logoutBtnSideMenu?.addEventListener("click", logout);
}

// ==========================
// LOAD BOOKINGS
// ==========================
async function loadBookings() {

    const container =
        document.getElementById("bookingsContainer");

    try {

        // LOADING
        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">

                <div class="text-5xl mb-4">
                    ⏳
                </div>

                <p class="text-gray-600 text-lg">
                    Loading bookings...
                </p>

            </div>
        `;

        // ==========================
        // FETCH BOOKINGS
        // ==========================
        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        // EMPTY STATE
        if (!bookings || bookings.length === 0) {

            container.innerHTML = `
                <div class="bg-white rounded-xl p-10 text-center shadow">

                    <div class="text-6xl mb-4">
                        📭
                    </div>

                    <h2 class="text-2xl font-bold text-gray-800 mb-3">
                        No Bookings Yet
                    </h2>

                    <p class="text-gray-500">
                        Your bookings will appear here.
                    </p>

                </div>
            `;

            return;
        }

        // ==========================
        // FETCH PROVIDERS
        // ==========================
        const providerIds = [
            ...new Set(
                bookings
                    .map(b => b.provider_id)
                    .filter(Boolean)
            )
        ];

        let providersById = {};

        if (providerIds.length > 0) {

            const {
                data: providers,
                error: providersError
            } = await supabase
                .from("users")
                .select(`
                    id,
                    full_name,
                    email,
                    location,
                    profile_picture
                `)
                .in("id", providerIds);

            if (providersError) {
                console.error(
                    "Providers fetch error:",
                    providersError
                );
            }

            providersById = Object.fromEntries(
                (providers || []).map(provider => [
                    String(provider.id),
                    provider
                ])
            );

            console.log("Providers fetched:", providers);
            console.log("ProvidersById object:", providersById);
        }

        // ==========================
        // FETCH SERVICES
        // ==========================
        const serviceIds = bookings
            .map(b => b.service_id)
            .filter(Boolean);

        let servicesById = {};

        if (serviceIds.length > 0) {

            const { data: services } = await supabase
                .from("services")
                .select(`
                    id,
                    title,
                    description,
                    location,
                    price
                `)
                .in("id", serviceIds);

            servicesById = Object.fromEntries(
                (services || []).map(service => [
                    service.id,
                    service
                ])
            );
        }

        // ==========================
        // FETCH REQUESTS
        // ==========================
        const requestIds = bookings
            .map(b => b.request_id)
            .filter(Boolean);

        let requestsById = {};

        if (requestIds.length > 0) {

            const { data: requests } = await supabase
                .from("requests")
                .select(`
                    id,
                    title,
                    description,
                    location,
                    budget
                `)
                .in("id", requestIds);

            requestsById = Object.fromEntries(
                (requests || []).map(request => [
                    request.id,
                    request
                ])
            );
        }

        // CLEAR CONTAINER
        container.innerHTML = "";

        // ==========================
        // LOOP BOOKINGS
        // ==========================
        bookings.forEach(booking => {

            console.log("Current booking:", booking);
            console.log("Provider ID from booking:", booking.provider_id);

            // SERVICE / REQUEST
            const serviceDetails =
                servicesById[booking.service_id];

            const requestDetails =
                requestsById[booking.request_id];

            const details =
                serviceDetails ||
                requestDetails ||
                {};

            // PROVIDER
            const provider =
                providersById[String(booking.provider_id)] || null;

            console.log(`Looking for provider with ID: ${String(booking.provider_id)}, found:`, provider);

            const providerName =
                provider?.full_name ||
                "Unknown Provider";

            const providerEmail =
                provider?.email ||
                "No Email";

            const providerLocation =
                provider?.location ||
                "Location not available";

            const providerPicture =
                provider?.profile_picture &&
                provider.profile_picture.trim() !== ""
                    ? provider.profile_picture
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}&background=random`;

            // CARD
            const card =
                document.createElement("div");

            card.className = `
                bg-white
                rounded-2xl
                shadow-md
                p-6
                hover:shadow-xl
                transition
            `;

            card.innerHTML = `
                <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">

                    <!-- LEFT -->
                    <div class="flex-1">

                        <!-- PROVIDER -->
                        <div class="flex items-center gap-4 mb-5">

                            <img
                                src="${providerPicture}"
                                alt="${providerName}"
                                class="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                                onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}'"
                            >

                            <div class="flex-1">

                                <p class="text-sm text-gray-500">
                                    Service Provider
                                </p>

                                <h2 class="text-xl font-bold text-gray-900">
                                    ${providerName}
                                </h2>

                                <p class="text-blue-600 text-sm break-all">
                                    ${providerEmail}
                                </p>

                            </div>

                        </div>

                        <!-- TITLE -->
                        <h3 class="text-2xl font-bold text-gray-900 mb-3">
                            ${details.title || "Untitled Booking"}
                        </h3>

                        <!-- DESCRIPTION -->
                        <p class="text-gray-600 leading-relaxed mb-5">
                            ${details.description || "No description"}
                        </p>

                        <!-- DETAILS -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                            <!-- LOCATION -->
                            <div class="bg-gray-50 rounded-xl p-4">

                                <p class="text-sm text-gray-500 mb-1">
                                    📍 Location
                                </p>

                                <p class="font-semibold text-gray-900">
                                    ${details.location || "No location"}
                                </p>

                            </div>

                            <!-- PRICE -->
                            <div class="bg-gray-50 rounded-xl p-4">

                                <p class="text-sm text-gray-500 mb-1">
                                    💰 Agreed Price
                                </p>

                                <p class="font-bold text-green-600 text-xl">
                                    ₦${Number(
                                        booking.total_price ||
                                        details.price ||
                                        details.budget ||
                                        0
                                    ).toLocaleString()}
                                </p>

                            </div>

                            <!-- PROVIDER LOCATION -->
                            <div class="bg-gray-50 rounded-xl p-4">

                                <p class="text-sm text-gray-500 mb-1">
                                    🌍 Provider Location
                                </p>

                                <p class="font-semibold text-gray-900">
                                    ${providerLocation}
                                </p>

                            </div>

                            <!-- BOOKING DATE -->
                            <div class="bg-gray-50 rounded-xl p-4">

                                <p class="text-sm text-gray-500 mb-1">
                                    📅 Booking Date
                                </p>

                                <p class="font-semibold text-gray-900">
                                    ${new Date(
                                        booking.created_at
                                    ).toLocaleDateString()}
                                </p>

                            </div>

                        </div>

                    </div>

                    <!-- RIGHT -->
                    <div class="flex flex-col gap-3 w-full lg:w-56">

                        <button
                            class="review-btn bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-3 rounded-xl font-semibold transition"
                            data-booking="${booking.id}"
                            data-service="${booking.service_id || ''}"
                            data-provider="${booking.provider_id || ''}"
                        >
                            Leave Review
                        </button>

                    </div>

                </div>
            `;

            container.appendChild(card);
        });

        // ==========================
        // REVIEW BUTTONS
        // ==========================
        document.querySelectorAll(".review-btn")
        .forEach(button => {

            button.addEventListener("click", () => {

                selectedBooking =
                    button.dataset.booking;

                openReviewModal(
                    button.dataset.provider,
                    button.dataset.service
                );
            });
        });

    } catch (error) {

        console.error(
            "Load bookings error:",
            error
        );

        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">

                <div class="text-6xl mb-4">
                    ❌
                </div>

                <h2 class="text-2xl font-bold text-red-600 mb-3">
                    Failed to load bookings
                </h2>

                <p class="text-gray-500">
                    ${error.message}
                </p>

            </div>
        `;
    }
}

// ==========================
// REVIEW MODAL
// ==========================
function setupReviewModal() {

    const modal =
        document.getElementById("reviewModal");

    const closeBtn =
        document.getElementById("closeReviewModal");

    const cancelBtn =
        document.getElementById("cancelReview");

    const submitBtn =
        document.getElementById("submitReview");

    const stars =
        document.querySelectorAll(".star");

    // CLOSE MODAL
    function closeModal() {

        modal.classList.add("hidden");

        selectedRating = 0;

        document.getElementById(
            "reviewComment"
        ).value = "";

        stars.forEach(star => {

            star.classList.remove("text-yellow-400");
            star.classList.add("text-gray-300");
        });
    }

    closeBtn?.addEventListener("click", closeModal);

    cancelBtn?.addEventListener("click", closeModal);

    // STAR RATING
    stars.forEach(star => {

        star.addEventListener("click", () => {

            selectedRating =
                Number(star.dataset.rating);

            stars.forEach(s => {

                const rating =
                    Number(s.dataset.rating);

                if (rating <= selectedRating) {

                    s.classList.remove("text-gray-300");
                    s.classList.add("text-yellow-400");

                } else {

                    s.classList.remove("text-yellow-400");
                    s.classList.add("text-gray-300");
                }
            });
        });
    });

    // SUBMIT REVIEW
    submitBtn?.addEventListener("click", async () => {

        try {

            if (!selectedRating) {
                alert("Please select a rating");
                return;
            }

            const comment =
                document.getElementById(
                    "reviewComment"
                ).value;

            const providerId =
                modal.dataset.provider;

            const serviceId =
                modal.dataset.service;

            submitBtn.disabled = true;

            submitBtn.textContent =
                "Submitting...";

            const { error } = await supabase
                .from("reviews")
                .insert({
                    booking_id: selectedBooking,
                    user_id: currentUser.id,
                    provider_id: providerId,
                    service_id: serviceId,
                    rating: selectedRating,
                    comment
                });

            if (error) throw error;

            alert(
                "Review submitted successfully!"
            );

            closeModal();

        } catch (error) {

            console.error(error);

            alert(error.message);

        } finally {

            submitBtn.disabled = false;

            submitBtn.textContent =
                "Submit Review";
        }
    });
}

// ==========================
// OPEN REVIEW MODAL
// ==========================
function openReviewModal(providerId, serviceId) {

    const modal =
        document.getElementById("reviewModal");

    modal.dataset.provider =
        providerId;

    modal.dataset.service =
        serviceId;

    modal.classList.remove("hidden");
}