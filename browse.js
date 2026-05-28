import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let allServices = [];
let currentBuiltInMargin = 0;
let currentUser = null;

// STORE REVIEW STATS
let reviewStatsMap = {};

// STORE RECENT REVIEWS
let reviewsMap = {};

const CACHE_KEY = "browse_services_cache";
const CACHE_DURATION = 5 * 60 * 1000;
  
// =========================
// PLATFORM SETTINGS
// =========================
async function getPlatformSettings() {

    const { data } = await supabase
        .from("settings")
        .select("built_in_margin")
        .eq("id", "platform")
        .maybeSingle();

    return {
        builtInMargin: data?.built_in_margin ?? 0
    };
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {

    const servicesContainer = document.getElementById("servicesGrid");
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const categorySelect = document.getElementById("categorySelect");
    const logoutBtn = document.getElementById("logoutBtn");

    const urlParams = new URLSearchParams(window.location.search);

    const queryCategory = urlParams.get("category");
    const querySearch = urlParams.get("search");

    // =========================
    // AUTH CHECK
    // =========================
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "login";
        return;
    }

    currentUser = sessionData.session.user;

    servicesContainer.innerHTML = `
        <div class="text-center py-10 text-gray-500">
            Loading services...
        </div>
    `;

    await loadServices(servicesContainer);

    populateCategories(categorySelect, allServices);

    // =========================
    // FETCH REVIEWS
    // =========================
    await fetchReviews();

    // =========================
    // URL FILTERS
    // =========================
    if (queryCategory) {

        categorySelect.value = queryCategory.toLowerCase();

        applyFilters(
            "",
            queryCategory.toLowerCase(),
            servicesContainer
        );

    } else if (querySearch) {

        searchInput.value = querySearch;

        applyFilters(
            querySearch,
            "all",
            servicesContainer
        );

    } else {

        applyFilters("", "all", servicesContainer);
    }

    // =========================
    // EVENTS
    // =========================
    searchButton.onclick = () => {
        applyFilters(
            searchInput.value,
            categorySelect.value,
            servicesContainer
        );
    };

    searchInput.addEventListener("keyup", (e) => {

        if (e.key === "Enter") {

            applyFilters(
                searchInput.value,
                categorySelect.value,
                servicesContainer
            );
        }
    });

    categorySelect.addEventListener("change", () => {

        applyFilters(
            searchInput.value,
            categorySelect.value,
            servicesContainer
        );
    });

    logoutBtn.onclick = async () => {

        await supabase.auth.signOut();

        window.location.href = "login";
    };
});

// =========================
// LOAD SERVICES
// =========================
async function loadServices(container) {

    try {

        // =========================
        // CACHE
        // =========================
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_KEY + "_time");

        if (
            cached &&
            cacheTime &&
            Date.now() - Number(cacheTime) < CACHE_DURATION
        ) {

            allServices = JSON.parse(cached);

            const settings = await getPlatformSettings();

            currentBuiltInMargin = settings.builtInMargin;

            await fetchReviews();

            render(allServices, container);

            return;
        }

        // =========================
        // FETCH SERVICES
        // =========================
        const { data, error } = await supabase
            .from("services")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        allServices = data || [];

        // =========================
        // FETCH REVIEWS
        // =========================
        await fetchReviews();

        // =========================
        // SETTINGS
        // =========================
        const settings = await getPlatformSettings();

        currentBuiltInMargin = settings.builtInMargin;

        // =========================
        // SAVE CACHE
        // =========================
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify(allServices)
        );

        localStorage.setItem(
            CACHE_KEY + "_time",
            Date.now().toString()
        );

        render(allServices, container);

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="text-center py-10 text-red-500">
                Failed to load services
            </div>
        `;
    }
}

// =========================
// FETCH REVIEWS (Display Only)
// =========================
async function fetchReviews() {

    try {

        const serviceIds = allServices
            .map(service => service.id)
            .filter(Boolean);

        if (!serviceIds.length) return;

        const { data: reviewsData, error } = await supabase
            .from("reviews")
            .select(`
                *,
                user_profile:user_id (
                    full_name,
                    profile_picture
                )
            `)
            .in("service_id", serviceIds)
            .order("created_at", { ascending: false });

        if (error) throw error;

        console.log(`Loaded ${reviewsData?.length || 0} reviews for ${serviceIds.length} services`);

        reviewStatsMap = {};
        reviewsMap = {};

        reviewsData.forEach(review => {

            const serviceId = review.service_id;

            // =========================
            // REVIEW STATS
            // =========================
            if (!reviewStatsMap[serviceId]) {

                reviewStatsMap[serviceId] = {
                    sum: 0,
                    count: 0
                };
            }

            reviewStatsMap[serviceId].sum += Number(review.rating || 0);

            reviewStatsMap[serviceId].count += 1;

            // =========================
            // REVIEWS LIST
            // =========================
            if (!reviewsMap[serviceId]) {
                reviewsMap[serviceId] = [];
            }

            // Normalize the profile data
            review.profiles = Array.isArray(review.user_profile) ? review.user_profile[0] : review.user_profile;
            reviewsMap[serviceId].push(review);
        });

        // =========================
        // CALCULATE AVERAGE
        // =========================
        Object.keys(reviewStatsMap).forEach(id => {

            const stats = reviewStatsMap[id];

            stats.avg =
                stats.count > 0
                    ? stats.sum / stats.count
                    : 0;
        });

    } catch (error) {

        console.error("Failed to fetch reviews:", error);
        console.error("Error details:", error?.message);
    }
}

// =========================
// FILTERS
// =========================
function applyFilters(search, category, container) {

    let filtered = [...allServices];

    // CATEGORY
    if (category && category !== "all") {

        filtered = filtered.filter(service =>
            service.category?.toLowerCase() === category
        );
    }

    // SEARCH
    if (search) {

        const term = search.toLowerCase();

        filtered = filtered.filter(service =>
            service.title?.toLowerCase().includes(term) ||
            service.description?.toLowerCase().includes(term)
        );
    }

    render(filtered, container);
}

// =========================
// CATEGORIES
// =========================
function populateCategories(select, services) {

    const set = new Set();

    services.forEach(service => {

        if (service.category) {
            set.add(service.category);
        }
    });

    select.innerHTML = `
        <option value="all">All</option>
    `;

    set.forEach(category => {

        const option = document.createElement("option");

        option.value = category.toLowerCase();

        option.textContent = category;

        select.appendChild(option);
    });
}

// =========================
// RENDER
// =========================
function render(services, container) {

    container.innerHTML = "";

    if (!services.length) {

        container.innerHTML = `
            <div class="text-center py-10 text-gray-500 col-span-full">
                No services found
            </div>
        `;

        return;
    }

    services.forEach(service => {

        const price = Number(service.price) || 0;

        const buyerPrice =
            price + (price * currentBuiltInMargin / 100);

        const stats = reviewStatsMap[service.id];

        const averageRating =
            stats?.count
                ? stats.avg.toFixed(1)
                : null;

        const reviews = reviewsMap[service.id] || [];

        // SHOW ONLY 2 REVIEWS
        const recentReviews = reviews.slice(0, 2);

        const card = document.createElement("div");

        card.className = `
            bg-white
            rounded-xl
            shadow
            hover:shadow-lg
            transition
            cursor-pointer
            overflow-hidden
        `;

        card.innerHTML = `
            <img
                src="${service.image_url || 'https://placehold.co/600x400'}"
                class="w-full h-44 object-cover"
            />

            <div class="p-4">

                <h3 class="font-semibold text-lg">
                    ${service.title}
                </h3>

                <p class="text-gray-500 text-sm">
                    ${service.category || ""}
                </p>

                <!-- RATINGS -->
                <div class="flex items-center gap-2 mt-2 text-sm">

                    ${
                        stats?.count
                        ? `
                        <div class="text-yellow-500">
                            ${'★'.repeat(Math.round(averageRating))}
                            ${'☆'.repeat(5 - Math.round(averageRating))}
                        </div>

                        <div class="text-gray-500">
                            ${averageRating}/5 · ${stats.count} review${stats.count > 1 ? "s" : ""}
                        </div>
                        `
                        : ``
                    }

                </div>

                <!-- PRICE -->
                <p class="text-blue-600 font-bold text-lg mt-3">
                    ₦${buyerPrice.toLocaleString()}
                </p>

                <!-- REVIEWS -->
                ${
                    recentReviews.length
                    ? `
                    <div class="mt-4 border-t pt-4 space-y-3">

                        ${recentReviews.map(review => `

                            <div class="flex gap-3">

                                <img
                                    src="${
                                        review.profiles?.profile_picture ||
                                        'https://ui-avatars.com/api/?name=User'
                                    }"
                                    class="w-10 h-10 rounded-full object-cover border"
                                />

                                <div class="flex-1">

                                    <div class="flex items-center justify-between">

                                        <p class="font-medium text-sm text-gray-900">
                                            ${
                                                review.profiles?.full_name ||
                                                'Anonymous User'
                                            }
                                        </p>

                                        <div class="text-yellow-500 text-xs">
                                            ${'★'.repeat(review.rating || 0)}
                                        </div>

                                    </div>

                                    <p class="text-sm text-gray-600 line-clamp-2">
                                        ${review.comment || "Great service"}
                                    </p>

                                </div>

                            </div>

                        `).join("")}

                    </div>
                    `
                    : ""
                }

            </div>
        `;

        card.onclick = () => {

            window.location.href =
                `service.html?id=${service.id}`;
        };

        container.appendChild(card);
    });
}