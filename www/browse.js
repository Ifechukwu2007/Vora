import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";
import { formatPrice } from "./currency-utils.js";

function getDiscountedServicePrice(service) {
    const price = Number(service.price) || 0;
    const discountPercent = Number(service.group_discount_percent) || 0;
    const hasDeal = Number(service.group_discount_threshold) > 0 && discountPercent > 0;
    const discountedPrice = hasDeal
        ? Math.round(price * (1 - discountPercent / 100))
        : price;
    return { price, discountedPrice, hasDeal };
}

let allServices = [];
let currentBuiltInMargin = 0;
let currentUser = null;

// STORE REVIEW STATS
let reviewStatsMap = {};

// STORE RECENT REVIEWS
let reviewsMap = {};

// STORE PROVIDER PROFILES
let providerMap = {};

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
        window.location.href = "login.html";
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

        window.location.href = "login.html";
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

            await fetchProviders();

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
        // FETCH PROVIDERS
        // =========================
        await fetchProviders();

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
// FETCH PROVIDERS
// =========================
async function fetchProviders() {

    try {

        const providerIds = allServices
            .map(service => service.provider_id)
            .filter(Boolean);

        if (!providerIds.length) return;

        const { data: providersData, error } = await supabase
            .from("users")
            .select("id, full_name, profile_picture")
            .in("id", providerIds);

        if (error) throw error;

        providerMap = {};

        providersData.forEach(provider => {
            providerMap[provider.id] = provider;
        });

    } catch (error) {

        console.error("Failed to fetch providers:", error);
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

        // FETCH REVIEWS
        const { data: reviewsData, error: reviewsError } = await supabase
            .from("reviews")
            .select("*")
            .in("service_id", serviceIds)
            .order("created_at", { ascending: false });

        if (reviewsError) throw reviewsError;

        console.log(`Loaded ${reviewsData?.length || 0} reviews for ${serviceIds.length} services`);

        // FETCH REVIEWER PROFILES
        const userIds = [...new Set((reviewsData || []).map(r => r.user_id).filter(Boolean))];

        let usersById = {};
        if (userIds.length) {
            const { data: users, error: usersError } = await supabase
                .from("users")
                .select("id, full_name, profile_picture")
                .in("id", userIds);

            if (usersError) console.error("Failed to fetch reviewer profiles:", usersError);

            usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
        }

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

            // Attach user profile data
            review.profiles = usersById[review.user_id] || null;
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
        const discountPercent = Number(service.group_discount_percent) || 0;
        const hasDeal = Number(service.group_discount_threshold) > 0 && discountPercent > 0;
        const discountedPrice = hasDeal
            ? Math.round(price * (1 - discountPercent / 100))
            : price;
        const buyerPrice =
            discountedPrice + (discountedPrice * currentBuiltInMargin / 100);

        const stats = reviewStatsMap[service.id];

        const averageRating =
            stats?.count
                ? stats.avg.toFixed(1)
                : null;

        const reviews = reviewsMap[service.id] || [];

        // SHOW ONLY 2 REVIEWS
        const recentReviews = reviews.slice(0, 2);

        // GET PROVIDER INFO
        const provider = providerMap[service.provider_id];

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

        const dealHtml = service.group_discount_threshold && service.group_discount_percent
            ? `<p class="text-indigo-600 text-sm font-semibold mt-2">${service.deal_message || `Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}%`}</p>`
            : '';

        const ratingsHtml = stats?.count
            ? `
                <div class="text-yellow-500">
                    ${'★'.repeat(Math.round(averageRating))}${'☆'.repeat(5 - Math.round(averageRating))}
                </div>
                <div class="text-gray-500">
                    ${averageRating}/5 · ${stats.count} review${stats.count > 1 ? 's' : ''}
                </div>
            `
            : `
                <div class="text-gray-300">
                    ☆☆☆☆☆
                </div>
                <div class="text-gray-400">
                    No ratings yet
                </div>
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

                ${dealHtml}

                <!-- RATINGS -->
                <div class="flex items-center gap-2 mt-2 text-sm">
                    ${ratingsHtml}
                </div>

                <!-- PRICE -->
                <p class="text-blue-600 font-bold text-lg mt-3">
                    ${hasDeal ? `
                      <span class="text-sm text-gray-500 line-through mr-2">${formatPrice(price)}</span>
                      <span>${formatPrice(buyerPrice)}</span>
                    ` : `${formatPrice(buyerPrice)}`}
                </p>

            </div>
        `;

        card.onclick = () => {

            window.location.href =
                `service.html?id=${service.id}`;
        };

        container.appendChild(card);
    });
}