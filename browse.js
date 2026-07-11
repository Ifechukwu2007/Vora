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

function resetFiltersUI() {
    const searchInput = document.getElementById('filterSearch');
    if (searchInput) searchInput.value = '';

    const locationInput = document.getElementById('filterLocation');
    if (locationInput) locationInput.value = '';

    const categorySelect = document.getElementById('filterCategory');
    if (categorySelect) categorySelect.value = 'All';
}

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
        window.location.href = 'home.html';
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

function populateFilterCategoryOptions(services) {
    const select = document.getElementById('filterCategory');
    if (!select) return;

    const categories = getCategoryOptions(services);
    const currentValue = select.value || 'All';
    select.innerHTML = '<option value="All">Any category</option>';

    categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });

    if (categories.includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = 'All';
    }
}

function getCategoryOptions(services) {
    const categories = [...new Set(services
        .map((service) => (service.category || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return categories;
}

function populateCategories(select, services) {
    return [];
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
    return;
}

function renderExploreCategoriesSection() {
    return;
}

function setupFiltersPopover() {
    const toggleButton = document.getElementById('filtersToggle');
    const popover = document.getElementById('filtersPopover');
    const filterSearch = document.getElementById('filterSearch');
    const filterLocation = document.getElementById('filterLocation');
    const filterCategory = document.getElementById('filterCategory');
    const useLocationBtn = document.getElementById('useLocationBtn');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (!toggleButton || !popover) return;

    const closePopover = () => {
        popover.classList.add('hidden');
    };

    const openPopover = () => {
        popover.classList.remove('hidden');
    };

    toggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        popover.classList.contains('hidden') ? openPopover() : closePopover();
    });

    document.addEventListener('click', (event) => {
        if (!popover.contains(event.target) && !toggleButton.contains(event.target)) {
            closePopover();
        }
    });

    const applyFilters = () => {
        currentFilters.search = filterSearch?.value.trim() || '';
        currentFilters.category = filterCategory?.value || 'All';
        currentFilters.location = filterLocation?.value.trim() || '';
        browseApplyFilters();
        closePopover();
    };

    applyFiltersBtn?.addEventListener('click', applyFilters);

    [filterSearch, filterLocation].forEach((input) => {
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyFilters();
            }
        });
    });

    clearFiltersBtn?.addEventListener('click', () => {
        resetFiltersUI();
        currentFilters = { search: '', category: 'All', location: '', maxPrice: '', sort: 'newest' };
        browseApplyFilters();
        closePopover();
    });

    useLocationBtn?.addEventListener('click', async () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not available in your browser.');
            return;
        }

        const originalText = useLocationBtn.textContent;
        useLocationBtn.textContent = 'Finding...';
        useLocationBtn.disabled = true;

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 60000,
                });
            });

            const locationName = await resolveLocationFromCoordinates(position.coords.latitude, position.coords.longitude);
            if (locationName) {
                if (filterLocation) filterLocation.value = locationName;
                currentFilters.location = locationName;
            } else {
                alert('Location found but could not resolve your city.');
            }
        } catch (error) {
            console.error('Geolocation error:', error);
            alert('Unable to use your location.');
        } finally {
            useLocationBtn.textContent = originalText;
            useLocationBtn.disabled = false;
        }
    });
}

function browseApplyFilters() {
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

    filteredServices = getSortedServices(filteredServices);
    currentPage = 1;
    renderServicesGrid();
    updateServiceCountText();
}

function applyFilters() {
    browseApplyFilters();
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
            .select('id, full_name, profile_picture, verified')
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
    return;
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

    if (searchInput) {
        searchInput.value = currentFilters.search;
    }

    populateFilterCategoryOptions(allServices);
    applyFilters();
    setupFiltersPopover();

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreServices);
    }

    if (logoutBtn) {
        setupAuthLogout(logoutBtn);
    }

    resetFiltersUI();
    setupInfiniteScroll();
}

document.addEventListener('DOMContentLoaded', initPage);
