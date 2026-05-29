import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let allServices = [];
let currentBuiltInMargin = 0;
let currentUser = null;
let reviewStatsMap = {};

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
    // AUTO APPLY URL FILTER
    // =========================
    if (queryCategory) {
        const category = queryCategory.toLowerCase();

        categorySelect.value = category;

        applyFilters("", category, servicesContainer);
    } else if (querySearch) {
        searchInput.value = querySearch;
        applyFilters(querySearch, "all", servicesContainer);
    } else {
        applyFilters("", "all", servicesContainer);
    }

    // =========================
    // EVENTS
    // =========================
    searchButton.onclick = () => {
        applyFilters(searchInput.value, categorySelect.value, servicesContainer);
    };

    searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            applyFilters(searchInput.value, categorySelect.value, servicesContainer);
        }
    });

    categorySelect.addEventListener("change", () => {
        applyFilters(searchInput.value, categorySelect.value, servicesContainer);
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

    const cached = localStorage.getItem(CACHE_KEY);
    const cacheTime = localStorage.getItem(CACHE_KEY + "_time");

    if (cached && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
        allServices = JSON.parse(cached);
        const settings = await getPlatformSettings();
        currentBuiltInMargin = settings.builtInMargin;
        render(allServices, container);
        return;
    }

    const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        container.innerHTML = "Failed to load services";
        return;
    }

    allServices = data || [];

    // Fetch review stats (ratings) for services
    try {
        const ids = allServices.map(s => s.id).filter(Boolean);
        if (ids.length) {
            const { data: reviewsData, error: reviewsError } = await supabase
                .from('reviews')
                .select('service_id, rating')
                .in('service_id', ids);

            if (!reviewsError && reviewsData) {
                const map = {};
                reviewsData.forEach(r => {
                    const id = r.service_id;
                    if (!map[id]) map[id] = { sum: 0, count: 0 };
                    map[id].sum += Number(r.rating || 0);
                    map[id].count += 1;
                });
                Object.keys(map).forEach(id => {
                    map[id].avg = map[id].count ? map[id].sum / map[id].count : 0;
                });
                reviewStatsMap = map;
            }
        }
    } catch (e) {
        console.warn('Failed to fetch review stats', e);
    }

    const settings = await getPlatformSettings();
    currentBuiltInMargin = settings.builtInMargin;

    localStorage.setItem(CACHE_KEY, JSON.stringify(allServices));
    localStorage.setItem(CACHE_KEY + "_time", Date.now().toString());

    render(allServices, container);
}

// =========================
// FILTER LOGIC
// =========================
function applyFilters(search, category, container) {

    let filtered = [...allServices];

    if (category && category !== "all") {
        filtered = filtered.filter(s =>
            s.category?.toLowerCase() === category
        );
    }

    if (search) {
        const term = search.toLowerCase();

        filtered = filtered.filter(s =>
            s.title?.toLowerCase().includes(term) ||
            s.description?.toLowerCase().includes(term)
        );
    }

    render(filtered, container);
}

// =========================
// CATEGORIES
// =========================
function populateCategories(select, services) {

    const set = new Set();

    services.forEach(s => {
        if (s.category) set.add(s.category);
    });

    select.innerHTML = `<option value="all">All</option>`;

    set.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat.toLowerCase();
        option.textContent = cat;
        select.appendChild(option);
    });
}

// =========================
// RENDER SERVICES
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
        const buyerPrice = price + (price * currentBuiltInMargin / 100);

        const card = document.createElement("div");

        card.className = "bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden";

        const stats = reviewStatsMap[service.id] || null;
        const averageRating = stats && stats.count ? stats.avg.toFixed(1) : null;

        card.innerHTML = `
            <img src="${service.image_url || 'https://placehold.co/600x400'}"
                 class="w-full h-40 object-cover" />

            <div class="p-4">

                <h3 class="font-semibold text-lg">${service.title}</h3>

                <p class="text-gray-500 text-sm">
                    ${service.category || ""}
                </p>

                <div class="flex items-center gap-2 mt-2 text-sm">
                    ${stats && stats.count ? `
                        <div class="text-yellow-500">
                          ${'★'.repeat(Math.round(averageRating))}${'☆'.repeat(5 - Math.round(averageRating))}
                        </div>
                        <div class="text-gray-500">${averageRating}/5 · ${stats.count} review${stats.count > 1 ? 's' : ''}</div>
                    ` : `
                        <div class="text-gray-400">No reviews yet</div>
                    `}
                </div>

                <p class="text-blue-600 font-bold mt-2">
                    ₦${buyerPrice.toLocaleString()}
                </p>

            </div>
        `;

        card.onclick = () => {
            window.location.href = `service.html?id=${service.id}`;
        };

        container.appendChild(card);
    });
}