import { LoadingSpinner } from './loading-utils.js';
import { supabase } from './supabase.js';

// Category emoji mapping
const categoryEmojis = {
    'Home Services': '🏠',
    'Repairs & Maintenance': '🛠️',
    'Beauty & Personal Care': '💄',
    'Health & Medical': '🏥',
    'Fitness & Sports': '💪',
    'Food & Catering': '🍽️',
    'Transportation & Logistics': '🚚',
    'Education & Tutoring': '📚',
    'Photography & Videography': '📸',
    'Media & Entertainment': '🎬',
    'Fashion & Apparel': '👗',
    'Art & Design': '🎨',
};

// Color palette for categories
const categoryColors = {
    'Home Services': 'from-orange-400 to-orange-600',
    'Repairs & Maintenance': 'from-amber-400 to-amber-600',
    'Beauty & Personal Care': 'from-pink-400 to-pink-600',
    'Health & Medical': 'from-red-400 to-red-600',
    'Fitness & Sports': 'from-orange-500 to-red-500',
    'Food & Catering': 'from-yellow-400 to-orange-500',
    'Transportation & Logistics': 'from-sky-400 to-blue-600',
    'Education & Tutoring': 'from-indigo-400 to-blue-600',
    'Photography & Videography': 'from-fuchsia-400 to-purple-500',
    'Media & Entertainment': 'from-violet-400 to-fuchsia-600',
    'Fashion & Apparel': 'from-rose-400 to-pink-600',
    'Art & Design': 'from-fuchsia-400 to-pink-500',
};

// Default categories
const DEFAULT_CATEGORIES = [
    'Home Services',
    'Beauty & Personal Care',
    'Food & Catering',
    'Transportation & Logistics',
    'Education & Tutoring',
    'Health & Medical',
];

// Preferred homepage order
const preferredOrder = [
    'Home Services',
    'Beauty & Personal Care',
    'Food & Catering',
    'Transportation & Logistics',
    'Education & Tutoring',
    'Health & Medical',
];

// Fetch categories
async function fetchCategories() {
    try {
        console.log('Fetching categories...');

        const { data, error } = await supabase
            .from('services')
            .select('category');

        if (error) throw error;

        console.log('Services found:', data.length);

        const categories = new Set();

        data.forEach(service => {
            if (service.category) {
                categories.add(service.category);
            }
        });

        const result = Array.from(categories).sort((a, b) => {
            const indexA = preferredOrder.indexOf(a);
            const indexB = preferredOrder.indexOf(b);

            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }

            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;

            return a.localeCompare(b);
        });

        console.log('Categories result:', result);

        return result.length > 0 ? result : DEFAULT_CATEGORIES;

    } catch (error) {
        console.error('Error fetching categories:', error);
        return DEFAULT_CATEGORIES;
    }
}

// Render categories
function renderCategories(categories) {
    const container = document.getElementById('categoriesContainer');

    if (!container) {
        console.error('Categories container not found');
        return;
    }

    if (!categories || categories.length === 0) {
        categories = DEFAULT_CATEGORIES;
    }

    container.innerHTML = '';

    categories.forEach(category => {

        const emoji = categoryEmojis[category] || '🛎️';

        const gradient =
            categoryColors[category] ||
            categoryColors['Other Services'];

        const card = document.createElement('div');

        const isMobile = window.innerWidth < 768;

        const cardHeight = isMobile ? 'h-28' : 'h-32';

        card.className = `
            relative
            overflow-hidden
            rounded-xl
            cursor-pointer
            group
            ${cardHeight}
            bg-gradient-to-br
            ${gradient}
            shadow-lg
            hover:shadow-2xl
            hover:ring-2
            hover:ring-white/30
            transition-all
            duration-300
            transform
            hover:scale-105
        `;

        card.setAttribute('data-category', category);

        card.innerHTML = `
            <div class="absolute inset-0 flex flex-col items-center justify-center px-2">

                <div class="text-4xl sm:text-5xl mb-1 sm:mb-2 transition-transform duration-300 group-hover:scale-125">
                    ${emoji}
                </div>

                <p class="text-white font-semibold text-center text-xs sm:text-sm leading-tight line-clamp-2">
                    ${category}
                </p>

            </div>
        `;

        card.addEventListener('click', () => {
            LoadingSpinner.navigateTo(
                `browse.html?category=${encodeURIComponent(category)}`
            );
        });

        container.appendChild(card);
    });

    // Explore more card
    const exploreCard = document.createElement('div');

    const isMobile = window.innerWidth < 768;

    const cardHeight = isMobile ? 'h-28' : 'h-32';

    exploreCard.className = `
        relative
        overflow-hidden
        rounded-xl
        cursor-pointer
        group
        ${cardHeight}
        bg-gradient-to-br
        from-gray-300
        to-gray-500
        shadow-lg
        hover:shadow-2xl
        hover:ring-2
        hover:ring-white/30
        transition-all
        duration-300
        transform
        hover:scale-105
        flex
        items-center
        justify-center
    `;

    exploreCard.innerHTML = `
        <div class="text-center px-2">

            <div class="text-4xl sm:text-5xl mb-1 sm:mb-2 transition-transform duration-300 group-hover:translate-x-1">
                →
            </div>

            <p class="text-white font-semibold text-xs sm:text-sm">
                Explore More...
            </p>

        </div>
    `;

    exploreCard.addEventListener('click', () => {
        LoadingSpinner.navigateTo('browse.html');
    });

    container.appendChild(exploreCard);
}

// Load categories immediately
console.log('Home.js loaded...');

fetchCategories().then(categories => {
    console.log('Categories fetched:', categories);
    renderCategories(categories);
});

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {

    console.log('DOMContentLoaded fired');

    const logoutBtn = document.getElementById('logoutBtn');

    const logoutBtnSideMenu =
        document.getElementById('logoutBtnSideMenu');

    const homeSearchInput =
        document.getElementById('homeSearchInput');

    const homeSearchBtn =
        document.getElementById('homeSearchBtn');

    const categoriesSearchInput =
        document.getElementById('categoriesSearchInput');

    const categoriesSearchBtn =
        document.getElementById('categoriesSearchBtn');

    // Logout
    const logout = () => {

        signOut(auth)
            .then(() => {
                LoadingSpinner.navigateTo('index.html');
            })
            .catch((error) => {
                console.error('Logout Error:', error);
            });
    };

    // Search
    const handleSearch = () => {

        let searchTerm = homeSearchInput.value.trim();

        // If hero search is empty, try categories search
        if (!searchTerm && categoriesSearchInput) {
            searchTerm = categoriesSearchInput.value.trim();
        }

        if (searchTerm) {

            LoadingSpinner.navigateTo(
                `browse.html?search=${encodeURIComponent(searchTerm)}`
            );
        }
    };

    // Search listeners
    if (homeSearchBtn) {
        homeSearchBtn.addEventListener('click', handleSearch);
    }

    if (homeSearchInput) {

        homeSearchInput.addEventListener('keypress', (e) => {

            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }

    // Categories search listeners
    if (categoriesSearchBtn) {
        categoriesSearchBtn.addEventListener('click', handleSearch);
    }

    if (categoriesSearchInput) {

        categoriesSearchInput.addEventListener('keypress', (e) => {

            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }

    // Logout listeners
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    if (logoutBtnSideMenu) {
        logoutBtnSideMenu.addEventListener('click', logout);
    }

    // Provider hub visibility
    onAuthStateChanged(auth, async (user) => {

        const providerHubLinkNav =
            document.getElementById('providerHubLinkMobile');

        const providerHubLinkPool =
            document.getElementById('providerHubLinkPool');

        if (user) {

            try {
                const { data, error } = await supabase
                    .from('services')
                    .select('id')
                    .eq('user_id', user.uid)
                    .limit(1);

                if (error) throw error;

                if (data && data.length > 0) {

                    if (providerHubLinkNav) {
                        providerHubLinkNav.classList.remove('hidden');
                    }

                    if (providerHubLinkPool) {
                        providerHubLinkPool.classList.remove('hidden');
                    }

                } else {

                    if (providerHubLinkNav) {
                        providerHubLinkNav.classList.add('hidden');
                    }

                    if (providerHubLinkPool) {
                        providerHubLinkPool.classList.add('hidden');
                    }
                }

            } catch (error) {

                console.error(
                    'Error checking user services:',
                    error
                );

                if (providerHubLinkNav) {
                    providerHubLinkNav.classList.add('hidden');
                }

                if (providerHubLinkPool) {
                    providerHubLinkPool.classList.add('hidden');
                }
            }

        } else {

            if (providerHubLinkNav) {
                providerHubLinkNav.classList.add('hidden');
            }

            if (providerHubLinkPool) {
                providerHubLinkPool.classList.add('hidden');
            }
        }
    });
});  