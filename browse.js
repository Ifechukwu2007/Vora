import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { LoadingSpinner } from './loading-utils.js';

let allServices = [];
let currentBuiltInMargin = 0;
let currentUser = null;
let hasService = false;
let currentPage = 1;
const ITEMS_PER_PAGE = 12;
const CACHE_KEY = 'browse_services_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getPlatformSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'platform'));
        return settingsDoc.exists() ? settingsDoc.data() : { builtInMargin: 0 };
    } catch (error) {
        console.error('Error loading platform settings:', error);
        return { builtInMargin: 0 };
    }
}

function roundUpToIncrement(value, increment = 500) {
    return Math.ceil(value / increment) * increment;
}

document.addEventListener('DOMContentLoaded', () => {

const servicesContainer = document.getElementById('servicesGrid');  
const searchInput = document.getElementById('searchInput');  
const searchButton = document.getElementById('searchButton');  
const categorySelect = document.getElementById('categorySelect');  
const logoutBtn = document.getElementById('logoutBtn');  

// Get query parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const querySearch = urlParams.get('search');
const queryCategory = urlParams.get('category');

// 🔐 Auth check  
onAuthStateChanged(auth, async (user) => {  
    if (!user) {  
        LoadingSpinner.navigateTo('login.html');  
        return;  
    }  

    currentUser = user;
    servicesContainer.innerHTML = '<p>Loading services...</p>';  

    await loadServices(servicesContainer);  

    // 🔥 Generate categories automatically  
    populateCategories(categorySelect, allServices);  

    // Apply URL parameters if they exist
    if (querySearch) {
        searchInput.value = querySearch;
        applyFilters(querySearch, categorySelect.value, servicesContainer);
    } else if (queryCategory) {
        categorySelect.value = queryCategory.toLowerCase();
        applyFilters(searchInput.value, queryCategory.toLowerCase(), servicesContainer);
    }
});  

// 🔍 Search  
searchButton.onclick = () => {  
    applyFilters(searchInput.value, categorySelect.value, servicesContainer);  
};  

searchInput.addEventListener('keyup', (e) => {  
    if (e.key === 'Enter') {  
        applyFilters(searchInput.value, categorySelect.value, servicesContainer);  
    }  
});  

// 📂 Category change  
categorySelect.addEventListener('change', () => {  
    applyFilters(searchInput.value, categorySelect.value, servicesContainer);  
});  

// 🚪 Logout  
logoutBtn.onclick = async () => {  
    LoadingSpinner.show();
    await signOut(auth);
    LoadingSpinner.navigateTo('login.html', 300);  
};

});

// =========================
// Load services with caching
// =========================
async function loadServices(container) {
    try {
        // Check cache first
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_KEY + '_time');
        
        if (cached && cacheTime && Date.now() - parseInt(cacheTime) < CACHE_DURATION) {
            console.log('Using cached services');
            allServices = JSON.parse(cached);
            const platformSettings = await getPlatformSettings();
            currentBuiltInMargin = platformSettings.builtInMargin || 0;
            renderServices(allServices, container, currentBuiltInMargin);
            return;
        }

        const snapshot = await getDocs(collection(db, 'services'));
        const platformSettings = await getPlatformSettings();
        currentBuiltInMargin = platformSettings.builtInMargin || 0;

        allServices = snapshot.docs.map(doc => ({  
            id: doc.id,  
            ...doc.data(),  
            providerName: doc.data().providerName || 'N/A'  
        }));  

        // Cache the results
        localStorage.setItem(CACHE_KEY, JSON.stringify(allServices));
        localStorage.setItem(CACHE_KEY + '_time', Date.now().toString());

        renderServices(allServices, container, currentBuiltInMargin);
    } catch (error) {
        console.error('Error loading services:', error);
        container.innerHTML = '<p class="text-red-500">Failed to load services</p>';
    }
}

// =========================
// Auto-generate categories
// =========================
function populateCategories(selectElement, services) {

const categories = new Set();  

services.forEach(service => {  
    if (service.category) {  
        categories.add(service.category);  
    }  
});  

// Reset dropdown  
selectElement.innerHTML = '';  

// Default  
const allOption = document.createElement('option');  
allOption.value = 'all';  
allOption.textContent = 'All';  
selectElement.appendChild(allOption);  

// Add categories  
categories.forEach(category => {  
    const option = document.createElement('option');  
    option.value = category.toLowerCase();  
    option.textContent = category;  
    selectElement.appendChild(option);  
});

}

// =========================
// Apply filters with pagination
// =========================
function applyFilters(searchTerm, category, container) {

let filtered = [...allServices];  

// Category filter  
if (category && category !== 'all') {  
    filtered = filtered.filter(service =>  
        service.category?.toLowerCase() === category  
    );  
}  

// Search filter  
if (searchTerm) {  
    const term = searchTerm.toLowerCase();  

    filtered = filtered.filter(service =>  
        service.title?.toLowerCase().includes(term) ||  
        service.description?.toLowerCase().includes(term)  
    );  
}  

renderServicesPaginated(filtered, container, currentBuiltInMargin);

}

// =========================
// Render services with pagination
// =========================
function renderServicesPaginated(services, container, builtInMargin = 0) {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedServices = services.slice(startIndex, endIndex);

    renderServices(paginatedServices, container, builtInMargin);

    // Add pagination controls
    const totalPages = Math.ceil(services.length / ITEMS_PER_PAGE);
    if (totalPages > 1) {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'col-span-full flex justify-center gap-2 mt-8';
        
        if (currentPage > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '← Previous';
            prevBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition';
            prevBtn.onclick = () => {
                currentPage--;
                applyFilters(searchInput.value, categorySelect.value, container);
            };
            paginationDiv.appendChild(prevBtn);
        }
        
        const pageInfo = document.createElement('span');
        pageInfo.className = 'px-4 py-2 text-gray-600';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        paginationDiv.appendChild(pageInfo);
        
        if (currentPage < totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = 'Next →';
            nextBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition';
            nextBtn.onclick = () => {
                currentPage++;
                applyFilters(searchInput.value, categorySelect.value, container);
            };
            paginationDiv.appendChild(nextBtn);
        }
        
        container.parentElement.appendChild(paginationDiv);
    }
}

// =========================
// Render services
// =========================
function renderServices(services, container, builtInMargin = 0) {

    container.innerHTML = '';  

    if (services.length === 0) {  
        container.innerHTML = '<p>No services found</p>';  
        return;  
    }  

    services.forEach((service) => {  
        const servicePrice = Number(service.price) || 0;
        const marginAmount = servicePrice * (builtInMargin / 100);
        const rawBuyerPrice = servicePrice + marginAmount;
        const buyerPrice = builtInMargin > 0 ? roundUpToIncrement(rawBuyerPrice, 500) : rawBuyerPrice;

        const card = document.createElement('div');  

        card.className = 'bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition';  

        card.innerHTML = `  
            <h3 class="text-xl font-bold">${service.title}</h3>  
            <p class="text-blue-500 font-semibold">Provider: ${service.providerName}</p>
            <p class="text-gray-600 mt-2">NGN ${buyerPrice.toLocaleString()}</p>
            ${builtInMargin > 0 ? `<p class="text-xs text-gray-400 italic">Service fee included</p>` : ''}
        `;  

        card.onclick = () => {  
            LoadingSpinner.navigateTo(`service.html?id=${service.id}`);  
        };  

        container.appendChild(card);  
    });
}
