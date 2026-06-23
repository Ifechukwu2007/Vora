import { LoadingSpinner } from './loading-utils.js';  
import { supabase } from './supabase.js';  
  
// Backwards-compat noop for any leftover Firebase-style callers  
if (typeof window !== 'undefined' && typeof window.onAuthStateChanged === 'undefined') {  
    window.onAuthStateChanged = function () {  
        console.warn('onAuthStateChanged called but no implementation exists (noop).');  
    };  
}  
  
// Category emoji mapping  
const categoryEmojis = {  
    'Home Services': '🏠',  
    'Repairs & Maintenance': '🛠️',  
    'Beauty & Personal Care': '💄',  
    'Wellness & Therapy': '🧖',  
    'Fitness & Sports': '💪',  
    'Food & Catering': '🍽️',  
    'Education & Tutoring': '📚',  
    'Photography & Videography': '📷',  
    'Events & Event Services': '🎉',  
    'Tailoring & Fashion Design': '🧵',  
    'Art & Illustration': '🎨',  
};  
  
// Color palette for categories  
const categoryColors = {  
    'Home Services': 'from-orange-400 to-orange-600',  
    'Repairs & Maintenance': 'from-amber-400 to-amber-600',  
    'Beauty & Personal Care': 'from-pink-400 to-pink-600',  
    'Wellness & Therapy': 'from-red-400 to-red-600',  
    'Fitness & Sports': 'from-orange-500 to-red-500',  
    'Food & Catering': 'from-yellow-400 to-orange-500',  
    'Education & Tutoring': 'from-indigo-400 to-blue-600',  
    'Photography & Videography': 'from-fuchsia-400 to-purple-500',  
    'Events & Event Services': 'from-violet-400 to-fuchsia-600',  
    'Tailoring & Fashion Design': 'from-rose-400 to-pink-600',  
    'Art & Illustration': 'from-fuchsia-400 to-pink-500',  
};  
  
const DEFAULT_CATEGORIES = [  
    'Home Services',  
    'Beauty & Personal Care',  
    'Food & Catering',  
    'Transportation & Logistics',  
    'Education & Tutoring',  
    'Wellness & Therapy',  
    'Events & Event Services',  
    'Tailoring & Fashion Design',  
    'Art & Illustration',  
];  
  
const preferredOrder = [  
    'Home Services',  
    'Beauty & Personal Care',  
    'Food & Catering',  
    'Transportation & Logistics',  
    'Education & Tutoring',  
    'Wellness & Therapy',  
    'Events & Event Services',  
    'Tailoring & Fashion Design',  
    'Art & Illustration',  
    '',  
];  
  
async function fetchCategories() {  
    try {  
        const { data, error } = await supabase.from('services').select('category');  
        if (error) throw error;  
        const categories = new Set();  
        (data || []).forEach((s) => { if (s?.category) categories.add(s.category); });  
        const result = Array.from(categories).sort((a, b) => {  
            const ia = preferredOrder.indexOf(a);  
            const ib = preferredOrder.indexOf(b);  
            if (ia !== -1 && ib !== -1) return ia - ib;  
            if (ia !== -1) return -1;  
            if (ib !== -1) return 1;  
            return a.localeCompare(b);  
        });  
        return result.length ? result : DEFAULT_CATEGORIES;  
    } catch (err) {  
        console.error('Error fetching categories:', err);  
        return DEFAULT_CATEGORIES;  
    }  
}  
  
function renderCategories(categories) {  
    const container = document.getElementById('categoriesContainer');  
    if (!container) return;  
    container.innerHTML = '';  
    categories.forEach((category) => {  
        const emoji = categoryEmojis[category] || '🛎️';  
        const gradient = categoryColors[category] || categoryColors['Home Services'];  
        const card = document.createElement('div');  
        const isMobile = window.innerWidth < 768;  
        const cardHeight = isMobile ? 'h-28' : 'h-32';  
        card.className = `relative overflow-hidden rounded-xl cursor-pointer group ${cardHeight} bg-gradient-to-br ${gradient} shadow-lg hover:shadow-2xl hover:ring-2 hover:ring-white/30 transition-all duration-300 transform hover:scale-105`;  
        card.setAttribute('data-category', category);  
        card.innerHTML = `  
            <div class="absolute inset-0 flex flex-col items-center justify-center px-2">  
                <div class="text-4xl sm:text-5xl mb-1 sm:mb-2">${emoji}</div>  
                <p class="text-white font-semibold text-center text-xs sm:text-sm leading-tight line-clamp-2">${category}</p>  
            </div>  
        `;  
        card.addEventListener('click', () => LoadingSpinner.navigateTo(`browse.html?category=${encodeURIComponent(category)}`));  
        container.appendChild(card);  
    });  
    const exploreCard = document.createElement('div');  
    const isMobile = window.innerWidth < 768;  
    const cardHeight = isMobile ? 'h-28' : 'h-32';  
    exploreCard.className = `relative overflow-hidden rounded-xl cursor-pointer group ${cardHeight} bg-gradient-to-br from-gray-300 to-gray-500 shadow-lg hover:shadow-2xl hover:ring-2 hover:ring-white/30 transition-all duration-300 transform hover:scale-105 flex items-center justify-center`;  
    exploreCard.innerHTML = `<div class="text-center px-2"><div class="text-4xl sm:text-5xl mb-1 sm:mb-2">→</div><p class="text-white font-semibold text-xs sm:text-sm">Explore More...</p></div>`;  
    exploreCard.addEventListener('click', () => LoadingSpinner.navigateTo('browse.html'));  
    container.appendChild(exploreCard);  
}  
  
console.log('Home.js loaded...');  
fetchCategories().then((cats) => { console.log('Categories fetched:', cats); renderCategories(cats); });  
  
document.addEventListener('DOMContentLoaded', () => {  
    console.log('DOMContentLoaded fired');  
    const logoutBtn = document.getElementById('logoutBtn');  
    const logoutBtnSideMenu = document.getElementById('logoutBtnSideMenu');  
    const homeSearchInput = document.getElementById('homeSearchInput');  
    const homeSearchBtn = document.getElementById('homeSearchBtn');  
    const categoriesSearchInput = document.getElementById('categoriesSearchInput');  
    const categoriesSearchBtn = document.getElementById('categoriesSearchBtn');  
  
    const logout = async () => {  
        try {  
            const { error } = await supabase.auth.signOut();  
            if (error) throw error;  
            LoadingSpinner.navigateTo('index.html');  
        } catch (err) {  
            console.error('Logout Error:', err);  
        }  
    };  
  
    const handleSearch = () => {  
        let searchTerm = homeSearchInput?.value?.trim() || '';  
        if (!searchTerm && categoriesSearchInput) searchTerm = categoriesSearchInput.value.trim();  
        if (searchTerm) LoadingSpinner.navigateTo(`browse.html?search=${encodeURIComponent(searchTerm)}`);  
    };  
  
    if (homeSearchBtn) homeSearchBtn.addEventListener('click', handleSearch);  
    if (homeSearchInput) homeSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });  
    if (categoriesSearchBtn) categoriesSearchBtn.addEventListener('click', handleSearch);  
    if (categoriesSearchInput) categoriesSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });  
    if (logoutBtn) logoutBtn.addEventListener('click', logout);  
    if (logoutBtnSideMenu) logoutBtnSideMenu.addEventListener('click', logout);  
  
    supabase.auth.onAuthStateChange(async (event, session) => {  
        const user = session?.user || null;  
        const providerHubLinkNav = document.getElementById('providerHubLinkMobile');  
        const providerHubLinkPool = document.getElementById('providerHubLinkPool');  
        if (user) {  
            try {  
                const { data, error } = await supabase.from('services').select('id').eq('user_id', user.id).limit(1);  
                if (error) throw error;  
                const visible = data && data.length > 0;  
                if (providerHubLinkNav) providerHubLinkNav.classList.toggle('hidden', !visible);  
                if (providerHubLinkPool) providerHubLinkPool.classList.toggle('hidden', !visible);  
            } catch (err) {  
                console.error('Provider hub visibility check failed:', err);  
                if (providerHubLinkNav) providerHubLinkNav.classList.add('hidden');  
                if (providerHubLinkPool) providerHubLinkPool.classList.add('hidden');  
            }  
        } else {  
            if (providerHubLinkNav) providerHubLinkNav.classList.add('hidden');  
            if (providerHubLinkPool) providerHubLinkPool.classList.add('hidden');  
        }  
    });  
});
