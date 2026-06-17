// customer-reviews.js

import { supabase } from "./supabase.js";

let currentUser = null;

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {

    try {

        // CHECK SESSION
        const {
            data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
            window.location.href = "login.html";
            return;
        }

        currentUser = session.user;

        // LOAD REVIEWS
        await loadCustomerReviews();

        // LOGOUT
        setupLogout();

    } catch (error) {

        console.error(error);

        alert("Failed to initialize page");
    }
});

// ==========================
// LOGOUT
// ==========================
function setupLogout() {

    const logoutBtn =
        document.getElementById("logoutBtn");

    logoutBtn?.addEventListener("click", async () => {

        await supabase.auth.signOut();

        window.location.href = "login.html";
    });
}

// ==========================
// LOAD CUSTOMER REVIEWS
// ==========================
async function loadCustomerReviews() {

    const container =
        document.getElementById(
            "customerReviewsContainer"
        );

    try {

        // ==========================
        // LOADING STATE
        // ==========================
        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow p-10 text-center">

                <div class="text-5xl mb-4 animate-pulse">
                    ⏳
                </div>

                <h2 class="text-xl font-bold text-gray-800 mb-2">
                    Loading Reviews...
                </h2>

                <p class="text-gray-500">
                    Please wait while we fetch your reviews.
                </p>

            </div>
        `;

        // ==========================
        // GET USER SERVICES
        // ==========================
        const {
            data: services,
            error: servicesError
        } = await supabase
            .from("services")
            .select(`
                id,
                title
            `)
            .eq("provider_id", currentUser.id);

        if (servicesError) {
            throw servicesError;
        }

        // ==========================
        // NO SERVICES
        // ==========================
        if (!services || services.length === 0) {

            container.innerHTML = `
                <div class="bg-white rounded-2xl shadow p-10 text-center">

                    <div class="text-6xl mb-4">
                        📭
                    </div>

                    <h2 class="text-2xl font-bold text-gray-900 mb-3">
                        No Services Yet
                    </h2>

                    <p class="text-gray-500">
                        Create a service first to start receiving reviews.
                    </p>

                </div>
            `;

            return;
        }

        // ==========================
        // SERVICE IDS
        // ==========================
        const serviceIds =
            services.map(service => service.id);

        // ==========================
        // GET REVIEWS
        // ==========================
        const {
            data: reviews,
            error: reviewsError
        } = await supabase
            .from("reviews")
            .select(`
                *,
                services (
                    id,
                    title
                )
            `)
            .in("service_id", serviceIds)
            .order("created_at", {
                ascending: false
            });

        if (reviewsError) {
            throw reviewsError;
        }

        // ==========================
        // EMPTY REVIEWS
        // ==========================
        if (!reviews || reviews.length === 0) {

            container.innerHTML = `
                <div class="bg-white rounded-2xl shadow p-10 text-center">

                    <div class="text-6xl mb-4">
                        ⭐
                    </div>

                    <h2 class="text-2xl font-bold text-gray-900 mb-3">
                        No Reviews Yet
                    </h2>

                    <p class="text-gray-500">
                        Customer reviews will appear here once people review your services.
                    </p>

                </div>
            `;

            return;
        }

        // ==========================
        // GET REVIEWERS
        // ==========================
        const reviewerIds = [
            ...new Set(
                reviews
                    .map(review => review.user_id)
                    .filter(Boolean)
            )
        ];

        let usersMap = {};

        if (reviewerIds.length > 0) {

            const {
                data: users,
                error: usersError
            } = await supabase
                .from("users")
                .select(`
                    id,
                    full_name,
                    email,
                    profile_picture
                `)
                .in("id", reviewerIds);

            if (usersError) {
                throw usersError;
            }

            usersMap = Object.fromEntries(
                (users || []).map(user => [
                    user.id,
                    user
                ])
            );
        }

        // ==========================
        // CALCULATE STATS
        // ==========================
        const totalReviews =
            reviews.length;

        const totalRating =
            reviews.reduce(
                (sum, review) =>
                    sum + Number(review.rating || 0),
                0
            );

        const averageRating =
            (totalRating / totalReviews).toFixed(1);

        // ==========================
        // CLEAR CONTAINER
        // ==========================
        container.innerHTML = `
            <!-- SUMMARY -->
            <div class="bg-white rounded-2xl shadow p-6">

                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">

                    <div>

                        <h2 class="text-2xl font-bold text-gray-900">
                            Overall Customer Rating
                        </h2>

                        <p class="text-gray-500 mt-1">
                            Based on ${totalReviews} review${totalReviews > 1 ? "s" : ""}
                        </p>

                    </div>

                    <div class="flex items-center gap-4">

                        <div class="text-5xl font-extrabold text-yellow-500">
                            ${averageRating}
                        </div>

                        <div>

                            <div class="text-yellow-500 text-xl">
                                ${generateStars(Math.round(averageRating))}
                            </div>

                            <p class="text-gray-500 text-sm">
                                Average Rating
                            </p>

                        </div>

                    </div>

                </div>

            </div>
        `;

        // ==========================
        // REVIEW CARDS
        // ==========================
        reviews.forEach(review => {

            const reviewer =
                usersMap[review.user_id] || {};

            const reviewerName =
                reviewer.full_name ||
                "Anonymous User";

            const reviewerEmail =
                reviewer.email ||
                "No Email";

            const reviewerPicture =
                reviewer.profile_picture &&
                reviewer.profile_picture.trim() !== ""
                    ? reviewer.profile_picture
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(reviewerName)}&background=random`;

            const serviceTitle =
                review.services?.title ||
                "Service";

            const reviewCard =
                document.createElement("div");

            reviewCard.className =
                "bg-white rounded-2xl shadow p-6";

            reviewCard.innerHTML = `
                <div class="flex flex-col md:flex-row gap-5">

                    <!-- PROFILE -->
                    <img
                        src="${reviewerPicture}"
                        alt="${reviewerName}"
                        class="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                        onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(reviewerName)}'"
                    >

                    <!-- CONTENT -->
                    <div class="flex-1">

                        <!-- HEADER -->
                        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">

                            <div>

                                <h3 class="text-xl font-bold text-gray-900">
                                    ${reviewerName}
                                </h3>

                                <p class="text-blue-600 text-sm break-all">
                                    ${reviewerEmail}
                                </p>

                            </div>

                            <div class="text-yellow-500 text-lg">
                                ${generateStars(review.rating)}
                            </div>

                        </div>

                        <!-- SERVICE -->
                        <div class="mt-3">

                            <span class="inline-flex items-center bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                                ${serviceTitle}
                            </span>

                        </div>

                        <!-- COMMENT -->
                        <p class="text-gray-700 leading-relaxed mt-4">
                            ${review.comment || "No review comment provided."}
                        </p>

                        <!-- DATE -->
                        <p class="text-sm text-gray-400 mt-4">
                            ${formatDate(review.created_at)}
                        </p>

                    </div>

                </div>
            `;

            container.appendChild(reviewCard);
        });

    } catch (error) {

        console.error(
            "Customer reviews error:",
            error
        );

        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow p-10 text-center">

                <div class="text-6xl mb-4">
                    ❌
                </div>

                <h2 class="text-2xl font-bold text-red-600 mb-3">
                    Failed To Load Reviews
                </h2>

                <p class="text-gray-500 break-all">
                    ${error.message}
                </p>

            </div>
        `;
    }
}

// ==========================
// GENERATE STARS
// ==========================
function generateStars(rating) {

    let stars = "";

    for (let i = 1; i <= 5; i++) {

        if (i <= rating) {
            stars += "⭐";
        } else {
            stars += "☆";
        }
    }

    return stars;
}

// ==========================
// FORMAT DATE
// ==========================
function formatDate(dateString) {

    if (!dateString) {
        return "Unknown date";
    }

    const date = 
        new Date(dateString);

    return date.toLocaleDateString(
        "en-NG",
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );
}