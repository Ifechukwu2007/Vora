import { supabase, supabasePublic } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";
import { formatPrice } from "./currency-utils.js";

const CACHE_KEY = 'browse_services_cache';
const CACHE_DURATION = 5 * 60 * 1000;
const PAGE_SIZE = 9;

let allServices = [];
let filteredServices = [];
let currentPage = 1;
let currentBuiltInMargin = 0;
let currentUser = null;
let userWishlist = [];
let reviewStatsMap = {};
let reviewsMap = {};
let providerMap = {};
let currentFilters = {
    search: '',
    category: 'All',
    location: '',
    maxPrice: '',
    sort: 'newest'
};

function normalizeCategory(value) {
    return (value || '').trim().toLowerCase();
}

async function loadWishlist() {
    userWishlist = [];
    try {
        const { data: session } = await supabase.auth.getSession();
        const user = session?.session?.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('wishlists')
            .select('service_id')
            .eq('user_id', user.id);

        if (error) throw error;
        userWishlist = (data || []).map((row) => row.service_id);
    } catch (error) {
        console.error('Failed to load wishlist:', error);
    }
}

async function toggleWishlist(serviceId) {
    const { data: session } = await supabase.auth.getSession();
    const user = session?.session?.user;
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const { data: existing, error: existingError } = await supabase
            .from('wishlists')
            .select('id')
            .eq('user_id', user.id)
            .eq('service_id', serviceId)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            const { error: deleteError } = await supabase
                .from('wishlists')
                .delete()
                .eq('id', existing.id);
            if (deleteError) throw deleteError;
        } else {
            const { error: insertError } = await supabase
                .from('wishlists')
                .insert({
                    user_id: user.id,
                    service_id: serviceId,
                });
            if (insertError) throw insertError;
        }

        await loadWishlist();
        renderServicesGrid();
        renderWishlist();
    } catch (error) {
        console.error('Wishlist update failed:', error);
    }
}

function renderWishlist() {
    const panel = document.getElementById('wishlistPanel');
    if (!panel) return;

    const items = allServices.filter((service) => userWishlist.includes(service.id));
    if (!items.length) {
        if (!currentUser) {
            panel.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">Login to save services to your wishlist.</div>';
        } else {
            panel.innerHTML = '<div class="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">Your wishlist is empty. Tap the heart on any service card to save it here.</div>';
        }
        return;
    }

    panel.innerHTML = `
        <div class="mb-4 flex flex-col gap-2 rounded-3xl border border-pink-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h3 class="text-lg font-semibold text-slate-900">Wishlist</h3>
                <p class="text-sm text-slate-500">${items.length} saved service${items.length > 1 ? 's' : ''}</p>
            </div>
            <div class="flex flex-wrap gap-2">
                ${items.map((service) => `
                    <button type="button" data-wishlist-item="${service.id}" class="rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-700 transition hover:bg-pink-100">
                        ${service.title}
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    panel.querySelectorAll('[data-wishlist-item]').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = `service.html?id=${button.getAttribute('data-wishlist-item')}`;
        });
    });
}

async function getPlatformSettings() {
    const { data } = await supabasePublic
        .from('settings')
        .select('built_in_margin')
        .eq('id', 'platform')
        .maybeSingle();

    return {
        builtInMargin: data?.built_in_margin ?? 0
    };
}

function createServiceCard(service) {
    const price = Number(service.price) || 0;
    const discountPercent = Number(service.group_discount_percent) || 0;
    const hasDeal = Number(service.group_discount_threshold) > 0 && discountPercent > 0;
    const discountedPrice = hasDeal ? Math.round(price * (1 - discountPercent / 100)) : price;
    const buyerPrice = discountedPrice + (discountedPrice * currentBuiltInMargin / 100);

    const stats = reviewStatsMap[service.id];
    const averageRating = stats?.count ? stats.avg.toFixed(1) : null;
    const provider = providerMap[service.provider_id];
    const isWishlisted = userWishlist.includes(service.id);

    const card = document.createElement('div');
    card.className = 'bg-white rounded-3xl shadow-sm transition hover:shadow-lg cursor-pointer overflow-hidden';
    card.innerHTML = `
        <div class="relative">
            <img src="${service.image_url || 'https://placehold.co/600x400'}" alt="${service.title}" class="h-52 w-full object-cover" />
            <button type="button" data-id="${service.id}" class="wishlistBtn absolute top-3 right-3 rounded-full bg-white p-2 shadow ${isWishlisted ? 'text-pink-600' : 'text-slate-500'}">${isWishlisted ? '❤️' : '🤍'}</button>
        </div>
        <div class="p-5">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-xs uppercase tracking-[0.22em] text-slate-500">${service.category || 'Service'}</p>
                    <h3 class="mt-2 text-lg font-semibold text-slate-900">${service.title}</h3>
                </div>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">${service.location || 'Online'}</span>
            </div>
            ${hasDeal ? `<p class="mt-3 text-sm font-semibold text-indigo-600">${service.deal_message || `Save ${service.group_discount_percent}% when you book ${service.group_discount_threshold}+`}</p>` : ''}
            <div class="mt-4 flex items-center gap-3 text-sm text-slate-600">
                <span class="font-semibold text-slate-900">${averageRating ?? 'No rating'}</span>
                <span>${stats?.count ? `★ ${stats.count} review${stats.count > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div class="mt-4 flex items-center justify-between gap-4">
                <div>
                    <p class="text-sm text-slate-500">From</p>
                    <p class="text-xl font-semibold text-slate-900">${formatPrice(buyerPrice)}</p>
                </div>
                <div class="text-right text-sm text-slate-500">
                    <p>${provider?.full_name || 'Provider'}</p>
                </div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        window.location.href = `service.html?id=${service.id}`;
    });

    const wishButton = card.querySelector('[data-id]');
    wishButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleWishlist(service.id);
    });

    return card;
}

function renderServicesGrid() {
    const container = document.getElementById('servicesGrid');
    if (!container) return;

    container.innerHTML = '';

    if (!filteredServices.length) {
        container.innerHTML = `
            <div class="col-span-full rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
                ${currentUser ? 'No services match your current filters. Try another search or select a different category.' : 'No services found. Try refining your search or sign in for more results.'}
            </div>
        `;
        return;
    }

    const start = 0;
    const end = Math.min(currentPage * PAGE_SIZE, filteredServices.length);
    const currentSet = filteredServices.slice(start, end);

    currentSet.forEach((service) => {
        container.appendChild(createServiceCard(service));
    });

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.classList.toggle('hidden', end >= filteredServices.length);
    }
}

function updateServiceCountText() {
    const countText = document.getElementById('serviceCountText');
    if (!countText) return;
    const total = filteredServices.length;
    countText.textContent = total === 0
        ? 'No services found for your criteria.'
        : `${total} service${total === 1 ? '' : 's'} available`;
}

function getSortedServices(services) {
    const copy = [...services];
    if (currentFilters.sort === 'price-low') {
        copy.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (currentFilters.sort === 'price-high') {
        copy.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (currentFilters.sort === 'rating') {
        copy.sort((a, b) => {
            const aStats = reviewStatsMap[a.id];
            const bStats = reviewStatsMap[b.id];
            const aAvg = aStats?.avg ?? 0;
            const bAvg = bStats?.avg ?? 0;
            return bAvg - aAvg;
        });
    } else {
        copy.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return copy;
}

function pageToSection(sectionId) {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCategoryPills(categories) {
    const pillContainer = document.getElementById('categoryPills');
    if (!pillContainer) return;

    const selected = normalizeCategory(currentFilters.category);
    const items = ['All', ...categories];

    pillContainer.innerHTML = items.map((category) => {
        const isSelected = normalizeCategory(category) === selected;
        return `
            <button type="button" data-category="${category}" class="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}">
                ${category}
            </button>
        `;
    }).join('');

    pillContainer.querySelectorAll('[data-category]').forEach((button) => {
        button.addEventListener('click', () => {
            const category = button.getAttribute('data-category') || 'All';
            currentFilters.category = category;
            const select = document.getElementById('filterCategory');
            if (select) {
                select.value = category;
            }
            applyFilters();
            pageToSection('popularNearYouSection');
        });
    });
}

function getCategoryOptions(services) {
    const categories = [...new Set(services
        .map((service) => (service.category || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return categories;
}

function populateCategories(select, services) {
    const categories = getCategoryOptions(services);
    if (select) {
        select.innerHTML = '<option value="All">All Categories</option>';
        categories.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
    }
    renderCategoryPills(categories);
    return categories;
}

function getMostCommonLocation() {
    const locationCounts = {};
    allServices.forEach((service) => {
        const location = (service.location || '').trim();
        if (!location) return;
        const key = location.toLowerCase();
        locationCounts[key] = (locationCounts[key] || 0) + 1;
    });
    const sortedLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);
    return sortedLocations.length ? sortedLocations[0][0] : '';
}

function renderPopularNearYouSection() {
    const section = document.getElementById('popularNearYouSection');
    if (!section) return;

    const location = currentFilters.location.trim() || getMostCommonLocation();
    if (!location) {
        section.innerHTML = '';
        return;
    }

    const nearby = allServices.filter((service) => (service.location || '').toLowerCase().includes(location.toLowerCase()));
    if (!nearby.length) {
        section.innerHTML = '';
        return;
    }

    const topNearby = getSortedServices(nearby).slice(0, 4);
    section.innerHTML = `
        <div class="mb-5 flex items-center justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-slate-900">Popular near ${location}</h2>
                <p class="mt-2 text-sm text-slate-500">Top picks from your selected or most common location.</p>
            </div>
            <button id="viewAllNearYou" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">View all</button>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            ${topNearby.map((service) => {
                const isWishlisted = userWishlist.includes(service.id);
                return `
                <div onclick="window.location.href='service.html?id=${service.id}'" class="group cursor-pointer overflow-hidden rounded-3xl bg-white shadow-sm transition hover:shadow-lg">
                    <div class="relative">
                        <img src="${service.image_url || 'https://placehold.co/600x400'}" alt="${service.title}" class="h-44 w-full object-cover transition duration-300 group-hover:scale-105" />
                        <button type="button" data-wishlist-id="${service.id}" class="wishlistBtn absolute top-3 right-3 rounded-full bg-white p-2 shadow ${isWishlisted ? 'text-pink-600' : 'text-slate-500'}">${isWishlisted ? '❤️' : '🤍'}</button>
                    </div>
                    <div class="p-4">
                        <p class="text-sm font-semibold text-slate-900">${service.title}</p>
                        <p class="mt-1 text-sm text-slate-500">${service.category || 'Service'}</p>
                        <p class="mt-3 text-sm font-semibold text-slate-900">${formatPrice(Number(service.price || 0) + (Number(service.price || 0) * currentBuiltInMargin / 100))}</p>
                    </div>
                </div>
            `}).join('')}
        </div>
    `;

    section.querySelectorAll('[data-wishlist-id]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const serviceId = button.getAttribute('data-wishlist-id');
            if (serviceId) toggleWishlist(serviceId);
        });
    });

    const viewAllBtn = document.getElementById('viewAllNearYou');
    viewAllBtn?.addEventListener('click', () => {
        currentFilters.category = 'All';
        currentFilters.search = '';
        currentFilters.location = location;
        const filterCategory = document.getElementById('filterCategory');
        if (filterCategory) filterCategory.value = 'All';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        applyFilters();
        pageToSection('servicesGrid');
    });
}

function renderExploreCategoriesSection() {
    const section = document.getElementById('exploreCategoriesSection');
    if (!section) return;

    const categories = getCategoryOptions(allServices);
    if (!categories.length) {
        section.innerHTML = '';
        return;
    }

    const categoryCounts = categories.map((category) => ({
        category,
        count: allServices.filter((service) => normalizeCategory(service.category) === normalizeCategory(category)).length
    }));
    const topCategories = categoryCounts.slice(0, 6);

    section.innerHTML = `
        <div class="mb-5 flex items-center justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-slate-900">Explore more categories</h2>
                <p class="mt-2 text-sm text-slate-500">Any category added by users will appear here automatically.</p>
            </div>
        </div>
        <div class="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            ${topCategories.map((item) => `
                <button type="button" data-category-card="${item.category}" class="min-w-[170px] rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md">
                    <p class="text-sm font-semibold text-slate-900">${item.category}</p>
                    <p class="mt-3 text-sm text-slate-500">${item.count} service${item.count === 1 ? '' : 's'}</p>
                </button>
            `).join('')}
        </div>
    `;

    section.querySelectorAll('[data-category-card]').forEach((button) => {
        button.addEventListener('click', () => {
            const category = button.getAttribute('data-category-card') || 'All';
            currentFilters.category = category;
            const select = document.getElementById('filterCategory');
            if (select) select.value = category;
            applyFilters();
            pageToSection('servicesGrid');
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const suggestions = document.getElementById('heroSearchSuggestions');
    const filterLocation = document.getElementById('filterLocation');
    const filterCategory = document.getElementById('filterCategory');

    if (!searchInput || !searchButton || !suggestions) return;

    const updateSuggestions = (value) => {
        const term = (value || '').trim().toLowerCase();
        if (!term) {
            suggestions.innerHTML = '';
            suggestions.classList.add('hidden');
            return;
        }

        const options = [
            ...new Set([
                ...allServices.map((service) => service.title).filter(Boolean),
                ...allServices.map((service) => service.category).filter(Boolean),
                ...allServices.map((service) => service.location).filter(Boolean),
                ...allServices.map((service) => providerMap[service.provider_id]?.full_name).filter(Boolean),
                'Wedding Makeup',
                'Nails',
                'Facial',
                'Hair Styling'
            ])
        ]
            .filter((item) => item.toLowerCase().includes(term))
            .slice(0, 6);

        suggestions.innerHTML = options.length
            ? options.map((item) => `
                <button type="button" data-suggestion="${item}" class="w-full text-left rounded-2xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
                    ${item}
                </button>
            `).join('')
            : '<div class="px-3 py-2 text-sm text-slate-500">No suggestions yet.</div>';

        suggestions.classList.toggle('hidden', !options.length);
    };

    const performSearch = (value) => {
        currentFilters.search = (value || '').trim();
        currentFilters.category = filterCategory?.value || currentFilters.category;
        currentFilters.location = filterLocation?.value.trim() || currentFilters.location;
        currentFilters.maxPrice = document.getElementById('filterMaxPrice')?.value || currentFilters.maxPrice;
        applyFilters();
    };

    searchButton.addEventListener('click', () => {
        performSearch(searchInput.value);
        suggestions.classList.add('hidden');
    });

    searchInput.addEventListener('input', (event) => {
        updateSuggestions(event.target.value);
    });

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            performSearch(searchInput.value);
            suggestions.classList.add('hidden');
        }
    });

    suggestions.addEventListener('click', (event) => {
        const button = event.target.closest('[data-suggestion]');
        if (!button) return;
        const value = button.getAttribute('data-suggestion');
        searchInput.value = value;
        performSearch(value);
        suggestions.classList.add('hidden');
    });

    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !suggestions.contains(event.target)) {
            suggestions.classList.add('hidden');
        }
    });
}

function applyFilters() {
    filteredServices = [...allServices];

    if (currentFilters.category && currentFilters.category !== 'All') {
        filteredServices = filteredServices.filter((service) => normalizeCategory(service.category) === normalizeCategory(currentFilters.category));
    }

    if (currentFilters.search) {
        const term = currentFilters.search.toLowerCase();
        filteredServices = filteredServices.filter((service) => {
            const searchableText = [
                service.title,
                service.description,
                service.category,
                service.location,
                service.price,
                service.deal_message,
                providerMap[service.provider_id]?.full_name
            ].filter(Boolean).join(' ').toLowerCase();
            return searchableText.includes(term);
        });
    }

    if (currentFilters.location) {
        const term = currentFilters.location.toLowerCase();
        filteredServices = filteredServices.filter((service) => (service.location || '').toLowerCase().includes(term));
    }

    if (currentFilters.maxPrice) {
        const max = Number(currentFilters.maxPrice);
        if (!Number.isNaN(max)) {
            filteredServices = filteredServices.filter((service) => Number(service.price || 0) <= max);
        }
    }

    filteredServices = getSortedServices(filteredServices);
    currentPage = 1;
    renderServicesGrid();
    updateServiceCountText();
    renderPopularNearYouSection();
    renderExploreCategoriesSection();
    renderWishlist();
}

function loadMoreServices() {
    currentPage += 1;
    renderServicesGrid();
}

function setupInfiniteScroll() {
    const trigger = document.getElementById('loadMoreTrigger');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (!trigger || !loadMoreBtn || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadMoreBtn.classList.contains('hidden')) {
            loadMoreServices();
        }
    }, {
        rootMargin: '0px 0px 200px 0px'
    });

    observer.observe(trigger);
}

function buildSkeleton(count = 6) {
    return Array.from({ length: count }, () => `
        <div class="rounded-3xl bg-white p-5 shadow-sm animate-pulse">
            <div class="h-44 w-full rounded-3xl bg-slate-200"></div>
            <div class="mt-4 h-5 w-3/4 rounded-full bg-slate-200"></div>
            <div class="mt-3 h-4 w-1/2 rounded-full bg-slate-200"></div>
            <div class="mt-5 h-12 w-full rounded-3xl bg-slate-200"></div>
        </div>
    `).join('');
}

async function loadServices(container) {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(`${CACHE_KEY}_time`);

        if (cached && cacheTime && Date.now() - Number(cacheTime) < CACHE_DURATION) {
            allServices = JSON.parse(cached);
            const settings = await getPlatformSettings();
            currentBuiltInMargin = settings.builtInMargin;
            await fetchReviews();
            await fetchProviders();
            renderWishlist();
            return;
        }

        const { data, error } = await supabasePublic
            .from('services')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allServices = (data || []).filter(Boolean);
        await fetchReviews();
        await fetchProviders();
        const settings = await getPlatformSettings();
        currentBuiltInMargin = settings.builtInMargin;
        localStorage.setItem(CACHE_KEY, JSON.stringify(allServices));
        localStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString());
        renderWishlist();
    } catch (error) {
        console.error(error);
        if (container) {
            container.innerHTML = `
                <div class="text-center py-10 text-red-500">
                    Failed to load services.
                </div>
            `;
        }
    }
}

async function fetchProviders() {
    try {
        const providerIds = [...new Set(allServices.map((service) => service.provider_id).filter(Boolean))];
        if (!providerIds.length) return;

        const { data: providersData, error } = await supabasePublic
            .from('users')
            .select('id, full_name, profile_picture')
            .in('id', providerIds);

        if (error) throw error;

        providerMap = Object.fromEntries((providersData || []).map((provider) => [provider.id, provider]));
    } catch (error) {
        console.error('Failed to fetch providers:', error);
    }
}

async function fetchReviews() {
    try {
        const serviceIds = [...new Set(allServices.map((service) => service.id).filter(Boolean))];
        if (!serviceIds.length) return;

        const { data: reviewsData, error: reviewsError } = await supabasePublic
            .from('reviews')
            .select('*')
            .in('service_id', serviceIds)
            .order('created_at', { ascending: false });

        if (reviewsError) throw reviewsError;

        const userIds = [...new Set((reviewsData || []).map((review) => review.user_id).filter(Boolean))];
        const { data: users, error: usersError } = userIds.length
            ? await supabasePublic.from('users').select('id, full_name, profile_picture').in('id', userIds)
            : { data: [], error: null };

        if (usersError) console.error('Failed to fetch reviewer profiles:', usersError);

        const usersById = Object.fromEntries((users || []).map((user) => [user.id, user]));

        reviewStatsMap = {};
        reviewsMap = {};

        (reviewsData || []).forEach((review) => {
            const serviceId = review.service_id;
            if (!reviewStatsMap[serviceId]) {
                reviewStatsMap[serviceId] = { sum: 0, count: 0 };
            }
            reviewStatsMap[serviceId].sum += Number(review.rating || 0);
            reviewStatsMap[serviceId].count += 1;
            if (!reviewsMap[serviceId]) reviewsMap[serviceId] = [];
            review.profiles = usersById[review.user_id] || null;
            reviewsMap[serviceId].push(review);
        });

        Object.keys(reviewStatsMap).forEach((id) => {
            const stats = reviewStatsMap[id];
            stats.avg = stats.count > 0 ? stats.sum / stats.count : 0;
        });
    } catch (error) {
        console.error('Failed to fetch reviews:', error?.message || error);
    }
}

async function resolveLocationFromCoordinates(latitude, longitude) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) return '';

        const result = await response.json();
        const address = result.address || {};
        return address.city || address.town || address.village || address.county || address.state || address.region || address.country || '';
    } catch (error) {
        console.error('Reverse geocoding failed:', error);
        return '';
    }
}

function setupLocationButton() {
    const applyLocationBtn = document.getElementById('applyLocationBtn');
    const filterLocation = document.getElementById('filterLocation');
    if (!applyLocationBtn) return;

    applyLocationBtn.addEventListener('click', async () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not available in your browser.');
            return;
        }

        const originalText = applyLocationBtn.textContent;
        applyLocationBtn.textContent = 'Finding nearby...';
        applyLocationBtn.disabled = true;

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 60000,
                });
            });

            const locationName = await resolveLocationFromCoordinates(position.coords.latitude, position.coords.longitude);
            if (!locationName) {
                alert('Location found but could not resolve your city/area. Please enter it manually.');
                return;
            }

            currentFilters.location = locationName;
            if (filterLocation) {
                filterLocation.value = locationName;
            }

            applyFilters();
            pageToSection('servicesGrid');
        } catch (error) {
            console.error('Geolocation error:', error);
            alert('Unable to use your location. Please enter your city or area in the Location filter.');
        } finally {
            applyLocationBtn.textContent = originalText || 'Use my location';
            applyLocationBtn.disabled = false;
        }
    });
}

function setupAuthLogout(logoutBtn) {
    if (!logoutBtn) return;
    logoutBtn.onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'home.html';
    };
}

async function initPage() {
    const servicesContainer = document.getElementById('servicesGrid');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const filterCategory = document.getElementById('filterCategory');
    const filterLocation = document.getElementById('filterLocation');
    const filterMaxPrice = document.getElementById('filterMaxPrice');
    const filterSort = document.getElementById('filterSort');
    const logoutBtn = document.getElementById('logoutBtn');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    const urlParams = new URLSearchParams(window.location.search);
    currentFilters.category = urlParams.get('category') || 'All';
    currentFilters.search = urlParams.get('search') || '';

    const { data: sessionData } = await supabase.auth.getSession();
    currentUser = sessionData?.session?.user || null;

    if (servicesContainer) {
        servicesContainer.innerHTML = buildSkeleton(6);
    }

    await loadWishlist();
    await loadServices(servicesContainer);

    if (filterCategory) {
        populateCategories(filterCategory, allServices);
        filterCategory.value = currentFilters.category;
    }
    if (searchInput) {
        searchInput.value = currentFilters.search;
    }
    if (filterLocation) {
        filterLocation.value = currentFilters.location;
    }
    if (filterMaxPrice) {
        filterMaxPrice.value = currentFilters.maxPrice;
    }
    if (filterSort) {
        filterSort.value = currentFilters.sort;
    }

    applyFilters();
    setupSearch();

    if (searchButton) {
        searchButton.addEventListener('click', () => {
            currentFilters.search = searchInput?.value.trim() || '';
            currentFilters.sort = filterSort?.value || 'newest';
            currentFilters.location = filterLocation?.value.trim() || '';
            currentFilters.maxPrice = filterMaxPrice?.value || '';
            applyFilters();
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (filterCategory) filterCategory.value = 'All';
            if (filterLocation) filterLocation.value = '';
            if (filterMaxPrice) filterMaxPrice.value = '';
            if (filterSort) filterSort.value = 'newest';
            currentFilters = { search: '', category: 'All', location: '', maxPrice: '', sort: 'newest' };
            applyFilters();
        });
    }

    [filterCategory, filterLocation, filterMaxPrice, filterSort].forEach((element) => {
        if (!element) return;
        element.addEventListener('change', () => {
            currentFilters.search = searchInput?.value.trim() || '';
            currentFilters.category = filterCategory?.value || 'All';
            currentFilters.location = filterLocation?.value.trim() || '';
            currentFilters.maxPrice = filterMaxPrice?.value || '';
            currentFilters.sort = filterSort?.value || 'newest';
            applyFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                currentFilters.search = searchInput.value.trim();
                applyFilters();
            }
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreServices);
    }

    if (logoutBtn) {
        setupAuthLogout(logoutBtn);
    }

    setupLocationButton();
    setupInfiniteScroll();
}

document.addEventListener('DOMContentLoaded', initPage);
