import { LoadingSpinner } from './loading-utils.js';
import { supabase, supabasePublic } from './supabase.js';
import { formatPrice } from './currency-utils.js';

const FEATURED_CATEGORY = 'All';
const RECENT_KEY = 'vora_recent_services';
const MAX_CARDS = 8;

let allServices = [];
let reviewStatsMap = {};
let providerMap = {};
let currentUser = null;
let userWishlist = [];
let currentLocationLabel = 'Lagos';

if (typeof window !== 'undefined' && typeof window.onAuthStateChanged === 'undefined') {
    window.onAuthStateChanged = function () {
        console.warn('onAuthStateChanged called but no implementation exists (noop).');
    };
}

function normalizeCategory(value) {
    return (value || '').trim().toLowerCase();
}

function getFallbackImage(service) {
    const label = encodeURIComponent(service.title || 'Top service');
    return `https://placehold.co/600x400/FFF1F2/DB2777?text=${label}`;
}

function getServiceImage(service) {
    return service.image_url || getFallbackImage(service);
}

function getServiceSummary(service) {
    return (service.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 90) || 'Service curated for your next appointment.';
}

function getAverageRating(serviceId) {
    const stats = reviewStatsMap[serviceId];
    if (!stats?.count) return null;
    return Number(stats.avg || 0).toFixed(1);
}

function getRecentViewIds() {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function rememberService(serviceId) {
    try {
        const current = getRecentViewIds().filter((id) => id !== serviceId);
        const next = [serviceId, ...current].slice(0, 8);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn('Could not store recent service view:', error);
    }
}

function getServiceById(serviceId) {
    return allServices.find((service) => service.id === serviceId) || null;
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
        renderHomepageSections();
    } catch (error) {
        console.error('Wishlist update failed:', error);
    }
}

function buildSection(title, subtitle, services, options = {}) {
    if (!services || !services.length) return '';

    const cards = services.slice(0, options.limit || MAX_CARDS).map((service) => {
        const rating = getAverageRating(service.id);
        const provider = providerMap[service.provider_id] || {};
        const providerName = provider.full_name || 'Verified provider';
        const price = Number(service.price) || 0;
        const discountPercent = Number(service.group_discount_percent) || 0;
        const hasDeal = Number(service.group_discount_threshold) > 0 && discountPercent > 0;
        const discountedPrice = hasDeal ? Math.round(price * (1 - discountPercent / 100)) : price;

        const isWishlisted = userWishlist.includes(service.id);
        return `
            <div data-service-card="${service.id}" class="group min-w-[260px] max-w-[260px] snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer" role="button" tabindex="0">
                <div class="relative h-40 overflow-hidden">
                    <img src="${getServiceImage(service)}" alt="${service.title}" class="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/600x400/FFF1F2/DB2777?text=Service';" />
                    <div class="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-700">${service.category || 'Service'}</div>
                    <button type="button" data-id="${service.id}" class="wishlistBtn absolute top-3 right-3 bg-white rounded-full p-2 shadow ${isWishlisted ? 'text-pink-600' : 'text-slate-500'}">${isWishlisted ? '❤️' : '🤍'}</button>
                </div>
                <div class="p-4">
                    <div class="flex items-start justify-between gap-2">
                        <h3 class="font-semibold text-gray-900 line-clamp-2">${service.title}</h3>
                        <span class="text-sm font-semibold text-pink-600">${formatPrice(discountedPrice)}</span>
                    </div>
                    <p class="mt-2 text-sm text-gray-500 line-clamp-2">${getServiceSummary(service)}</p>
                    <div class="mt-4 flex items-center justify-between text-sm text-gray-500">
                        <span>${providerName}</span>
                        <span>${rating ? `${rating} ★` : 'New'}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const exploreUrl = FEATURED_CATEGORY === 'All'
        ? 'browse.html'
        : `browse.html?category=${encodeURIComponent(FEATURED_CATEGORY)}`;

    const browseUrl = title === 'All'
        ? 'browse.html'
        : `browse.html?category=${encodeURIComponent(title)}`;

    return `
        <section class="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div class="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-semibold text-gray-900">${title}</h2>
                    <p class="text-sm text-gray-500">${subtitle}</p>
                </div>
                <a href="${browseUrl}" class="text-sm font-semibold text-pink-600 transition hover:text-pink-700">Explore More →</a>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                ${cards || `<div class="w-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">No services to show right now.</div>`}
            </div>
        </section>
    `;
}

function renderSkeletons() {
    const container = document.getElementById('homepageSections');
    if (!container) return;
    container.innerHTML = [1, 2, 3, 4, 5, 6].map(() => `
        <div class="animate-pulse rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div class="mb-4 h-6 w-40 rounded bg-gray-200"></div>
            <div class="flex gap-4 overflow-hidden">
                <div class="h-48 min-w-[260px] rounded-2xl bg-gray-100"></div>
                <div class="h-48 min-w-[260px] rounded-2xl bg-gray-100"></div>
                <div class="h-48 min-w-[260px] rounded-2xl bg-gray-100"></div>
            </div>
        </div>
    `).join('');
}

function renderHomepageSections() {
    const container = document.getElementById('homepageSections');
    if (!container) return;

    const categoryMap = allServices.reduce((groups, service) => {
        const category = (service.category || 'Other').trim() || 'Other';
        if (!groups[category]) groups[category] = [];
        groups[category].push(service);
        return groups;
    }, {});

    const categories = Object.keys(categoryMap).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const sections = categories.map((category) => {
        const services = categoryMap[category].slice(0, MAX_CARDS);
        return buildSection(category, `Explore ${category.toLowerCase()} services.`, services, { limit: MAX_CARDS });
    }).filter(Boolean);

    container.innerHTML = sections.length
        ? sections.join('')
        : '<div class="rounded-[1.75rem] border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">Services will appear here as soon as they are available.</div>';

    container.querySelectorAll('[data-service-card]').forEach((button) => {
        button.addEventListener('click', () => {
            const serviceId = button.getAttribute('data-service-card');
            rememberService(serviceId);
            LoadingSpinner.navigateTo(`service.html?id=${serviceId}`);
        });
    });

    container.querySelectorAll('.wishlistBtn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const serviceId = button.getAttribute('data-id');
            if (serviceId) toggleWishlist(serviceId);
        });
    });
}

async function loadHomepageData() {
    try {
        let query = supabasePublic
            .from('services')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(40);

        if (FEATURED_CATEGORY !== 'All') {
            query = query.eq('category', FEATURED_CATEGORY);
        }

        const { data: servicesData, error } = await query;

        if (error) throw error;

        allServices = servicesData || [];

        if (allServices.length) {
            const serviceIds = allServices.map((service) => service.id).filter(Boolean);

                const { data: reviewsData } = await supabasePublic

            reviewStatsMap = {};
            (reviewsData || []).forEach((review) => {
                if (!reviewStatsMap[review.service_id]) {
                    reviewStatsMap[review.service_id] = { sum: 0, count: 0 };
                }
                reviewStatsMap[review.service_id].sum += Number(review.rating || 0);
                reviewStatsMap[review.service_id].count += 1;
            });

            Object.keys(reviewStatsMap).forEach((id) => {
                const stats = reviewStatsMap[id];
                stats.avg = stats.count > 0 ? stats.sum / stats.count : 0;
            });

            const providerIds = [...new Set(allServices.map((service) => service.provider_id).filter(Boolean))];
            if (providerIds.length) {
                const { data: providersData } = await supabasePublic
                    .from('users')
                    .select('id, full_name, profile_picture')
                    .in('id', providerIds);
                providerMap = Object.fromEntries((providersData || []).map((provider) => [provider.id, provider]));
            }
        }
    } catch (error) {
        console.error('Failed to load homepage data:', error);
        allServices = [];
    }

    renderHomepageSections();
}

async function updateHeroState(user) {
    const heroSubtitle = document.getElementById('heroSubtitle');
    const heroAuthNotice = document.getElementById('heroAuthNotice');

    if (!heroSubtitle || !heroAuthNotice) return;

    let profile = {};
    if (user) {
        const { data } = await supabase
            .from('users')
            .select('full_name, city, location')
            .eq('id', user.id)
            .maybeSingle();
        profile = data || {};
    }

    currentLocationLabel = profile.city || profile.location || 'Lagos';
    const greeting = user ? `Welcome back, ${profile.full_name || user.email || 'there'}.` : 'Welcome guest.';
    heroSubtitle.textContent = user
        ? `Here are curated service picks for ${currentLocationLabel} and nearby areas.`
        : 'Discover trusted experts near you and save time with a smoother booking experience.';

    heroAuthNotice.innerHTML = user
        ? `
            <div class="rounded-full bg-white/20 px-4 py-2 text-sm font-medium">${greeting}</div>
            <a href="${FEATURED_CATEGORY === 'All' ? 'browse.html' : `browse.html?category=${encodeURIComponent(FEATURED_CATEGORY)}`}" class="rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/25">Browse services</a>
            <a href="my-bookings.html" class="rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/25">My bookings</a>
        `
        : `
            <a href="login.html" class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-pink-600 transition hover:bg-pink-50">Sign in</a>
            <a href="register.html" class="rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/25">Create account</a>
        `;
}

function setupSearch() {
    const searchInput = document.getElementById('heroSearchInput');
    const searchButton = document.getElementById('heroSearchBtn');
    const suggestions = document.getElementById('heroSearchSuggestions');

    if (!searchInput || !searchButton || !suggestions) return;

    const updateSuggestions = (value) => {
        const term = value.trim().toLowerCase();
        if (!term) {
            suggestions.innerHTML = '';
            suggestions.classList.add('hidden');
            return;
        }

        const options = [
            ...new Set([
                ...allServices.map((service) => service.title).filter(Boolean),
                ...allServices.map((service) => service.category).filter(Boolean),
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
                <button type="button" data-suggestion="${item}" class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-pink-50">
                    ${item}
                </button>
            `).join('')
            : '<div class="px-3 py-2 text-sm text-gray-500">No suggestions yet.</div>';

        suggestions.classList.toggle('hidden', !options.length);
    };

    const handleSearch = (value) => {
        const term = (value || searchInput.value || '').trim();
        if (term) {
            LoadingSpinner.navigateTo(`browse.html?category=${encodeURIComponent(FEATURED_CATEGORY)}&search=${encodeURIComponent(term)}`);
        } else {
            LoadingSpinner.navigateTo(`browse.html?category=${encodeURIComponent(FEATURED_CATEGORY)}`);
        }
    };

    searchButton.addEventListener('click', () => handleSearch(searchInput.value));
    searchInput.addEventListener('input', (event) => updateSuggestions(event.target.value));
    searchInput.addEventListener('focus', () => updateSuggestions(searchInput.value));
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch(searchInput.value);
        }
    });

    suggestions.addEventListener('click', (event) => {
        const button = event.target.closest('[data-suggestion]');
        if (!button) return;
        const value = button.getAttribute('data-suggestion');
        searchInput.value = value;
        suggestions.classList.add('hidden');
        handleSearch(value);
    });

    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !suggestions.contains(event.target)) {
            suggestions.classList.add('hidden');
        }
    });
}

async function initializeHomepage() {
    renderSkeletons();

    const { data: sessionData } = await supabase.auth.getSession();
    currentUser = sessionData.session?.user || null;

    if (currentUser) {
        try {
            const position = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('Geo unavailable'));
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
            });
            currentLocationLabel = `Near you (${position.coords.latitude.toFixed(0)}, ${position.coords.longitude.toFixed(0)})`;
        } catch (error) {
            console.info('Using profile city fallback for location:', error);
        }
    }

    await updateHeroState(currentUser);
    await loadWishlist();
    await loadHomepageData();
    setupSearch();

    const logoutBtn = document.getElementById('logoutBtn');
    const logoutBtnSideMenu = document.getElementById('logoutBtnSideMenu');

    const logout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            LoadingSpinner.navigateTo('home.html');
        } catch (error) {
            console.error('Logout Error:', error);
        }
    };

    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (logoutBtnSideMenu) logoutBtnSideMenu.addEventListener('click', logout);

    supabase.auth.onAuthStateChange(async (_event, session) => {
        currentUser = session?.user || null;
        await updateHeroState(currentUser);
        await loadHomepageData();
    });
}

document.addEventListener('DOMContentLoaded', initializeHomepage);
