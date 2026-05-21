import { LoadingSpinner } from './loading-utils.js';
import { supabase } from './supabase.js';

// Category emoji mapping
const categoryEmojis = {
    'Home Services': '🏠',
    'Repairs & Maintenance': '🛠️',
    'Construction & Real Estate': '🏗️',
    'Cleaning Services': '🧹',
    'Beauty & Personal Care': '💄',
    'Health & Medical': '🏥',
    'Mental Health & Wellness': '🧠',
    'Fitness & Sports': '💪',
    'Food & Catering': '🍽️',
    'Groceries & Delivery': '🛒',
    'Emergency Services': '🚨',
    'Transportation & Logistics': '🚚',
    'Automotive Services': '🚗',
    'Travel & Tourism': '✈️',
    'Technology & IT': '💻',
    'Software & Development': '👨‍💻',
    'Electronics & Gadgets': '📱',
    'Education & Tutoring': '📚',
    'Student Services': '🎓',
    'Business & Finance': '💼',
    'Banking & Payments': '💳',
    'Legal Services': '⚖️',
    'Government & Documentation': '📄',
    'Marketing & Advertising': '📢',
    'Photography & Videography': '📸',
    'Media & Entertainment': '🎬',
    'Music & Events': '🎵',
    'Fashion & Apparel': '👗',
    'Jewelry & Accessories': '💍',
    'Agriculture & Farming': '🌾',
    'Pets & Animal Care': '🐾',
    'Childcare & Parenting': '🧸',
    'Elderly Care': '👴',
    'Security Services': '🛡️',
    'Religious & Spiritual': '⛪',
    'Environment & Waste Management': '♻️',
    'Manufacturing & Industrial': '🏭',
    'Freelance & Remote Services': '🌐',
    'Luxury Services': '💎',
    'Community & Social Services': '🤝',
    'Gaming & Esports': '🎮',
    'Dating & Relationship Services': '❤️',
    'Art & Design': '🎨',
    'Printing & Publishing': '🖨️',
    'Rental Services': '📦',
    'Storage & Warehousing': '🏬',
    'Research & Consulting': '📊',
    'Other Services': '🛎️'
};

// Color palette for categories
const categoryColors = {
    'Home Services': 'from-orange-400 to-orange-600',
    'Repairs & Maintenance': 'from-amber-400 to-amber-600',
    'Construction & Real Estate': 'from-stone-400 to-stone-600',
    'Cleaning Services': 'from-green-400 to-green-600',
    'Beauty & Personal Care': 'from-pink-400 to-pink-600',
    'Health & Medical': 'from-red-400 to-red-600',
    'Mental Health & Wellness': 'from-teal-400 to-teal-600',
    'Fitness & Sports': 'from-orange-500 to-red-500',
    'Food & Catering': 'from-yellow-400 to-orange-500',
    'Groceries & Delivery': 'from-lime-400 to-green-500',
    'Emergency Services': 'from-red-500 to-rose-600',
    'Transportation & Logistics': 'from-sky-400 to-blue-600',
    'Automotive Services': 'from-gray-500 to-slate-700',
    'Travel & Tourism': 'from-cyan-400 to-sky-500',
    'Technology & IT': 'from-purple-400 to-indigo-600',
    'Software & Development': 'from-indigo-400 to-purple-600',
    'Electronics & Gadgets': 'from-blue-400 to-cyan-500',
    'Education & Tutoring': 'from-indigo-400 to-blue-600',
    'Student Services': 'from-violet-400 to-indigo-500',
    'Business & Finance': 'from-emerald-400 to-emerald-700',
    'Banking & Payments': 'from-green-500 to-teal-600',
    'Legal Services': 'from-slate-500 to-gray-700',
    'Government & Documentation': 'from-zinc-400 to-zinc-600',
    'Marketing & Advertising': 'from-pink-500 to-rose-500',
    'Photography & Videography': 'from-fuchsia-400 to-purple-500',
    'Media & Entertainment': 'from-violet-400 to-fuchsia-600',
    'Music & Events': 'from-purple-500 to-pink-500',
    'Fashion & Apparel': 'from-rose-400 to-pink-600',
    'Jewelry & Accessories': 'from-yellow-300 to-amber-500',
    'Agriculture & Farming': 'from-green-500 to-lime-600',
    'Pets & Animal Care': 'from-amber-300 to-orange-400',
    'Childcare & Parenting': 'from-pink-300 to-rose-400',
    'Elderly Care': 'from-gray-300 to-slate-500',
    'Security Services': 'from-slate-600 to-black',
    'Religious & Spiritual': 'from-indigo-300 to-violet-500',
    'Environment & Waste Management': 'from-green-600 to-emerald-700',
    'Manufacturing & Industrial': 'from-gray-500 to-zinc-700',
    'Freelance & Remote Services': 'from-sky-400 to-indigo-500',
    'Luxury Services': 'from-yellow-400 to-yellow-600',
    'Community & Social Services': 'from-teal-300 to-cyan-500',
    'Gaming & Esports': 'from-violet-500 to-indigo-700',
    'Dating & Relationship Services': 'from-rose-400 to-red-500',
    'Art & Design': 'from-fuchsia-400 to-pink-500',
    'Printing & Publishing': 'from-slate-400 to-gray-500',
    'Rental Services': 'from-blue-300 to-sky-500',
    'Storage & Warehousing': 'from-stone-400 to-gray-600',
    'Research & Consulting': 'from-cyan-400 to-teal-600',
    'Other Services': 'from-gray-400 to-gray-600'
};

// Default categories
const DEFAULT_CATEGORIES = [
    'Home Services',
    'Technology & IT',
    'Beauty & Personal Care',
    'Food & Catering',
    'Transportation & Logistics',
    'Education & Tutoring',
    'Health & Medical',
    'Business & Finance'
];

// Preferred homepage order
const preferredOrder = [
    'Home Services',
    'Technology & IT',
    'Food & Catering',
    'Transportation & Logistics',
    'Beauty & Personal Care',
    'Health & Medical',
    'Education & Tutoring',
    'Business & Finance'
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