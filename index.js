import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from './firebase-config.js';
import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ================= UI =================
const servicesGrid = document.getElementById('servicesGrid');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const categorySelect = document.getElementById('categorySelect');

let allServices = [];

// ================= INIT =================
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect to home.html if user is already logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = 'home.html';
        }
    });
    await loadServices();
    setupEvents();
});

// ================= LOAD SERVICES =================
async function loadServices() {
    try {
        const snapshot = await getDocs(collection(db, "services"));

        allServices = [];

        snapshot.forEach(docSnap => {
            allServices.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        populateCategories();
        renderServices(allServices);

    } catch (error) {
        console.error(error);
        servicesGrid.innerHTML = `
            <p class="text-center col-span-3 text-red-500">
                Failed to load services.
            </p>
        `;
    }
}

// ================= RENDER =================
function renderServices(services) {
    servicesGrid.innerHTML = '';

    if (services.length === 0) {
        servicesGrid.innerHTML = `
            <p class="text-center col-span-3 text-gray-500">
                No services found.
            </p>
        `;
        return;
    }

    services.forEach(service => {
        const price = Number(service.price) || 0;

        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-lg shadow hover:shadow-md transition";

        card.innerHTML = `
            <h3 class="text-lg font-bold mb-2">${service.title || 'Untitled'}</h3>
            <p class="text-gray-600 mb-2">${service.providerName || 'Provider'}</p>
            <p class="text-green-600 font-semibold mb-3">NGN ${price.toLocaleString()}</p>
            <button 
                class="bg-blue-600 text-white px-4 py-2 rounded w-full"
                onclick="viewService('${service.id}')"
            >
                Book Now
            </button>
        `;

        servicesGrid.appendChild(card);
    });
}

// ================= SEARCH + FILTER =================
function setupEvents() {
    searchButton.addEventListener('click', filterServices);

    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') filterServices();
    });

    categorySelect.addEventListener('change', filterServices);
}

function filterServices() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categorySelect.value;

    const filtered = allServices.filter(service => {
        const title = (service.title || '').toLowerCase();
        const category = service.category || '';

        return (
            title.includes(searchTerm) &&
            (selectedCategory === 'all' || category === selectedCategory)
        );
    });

    renderServices(filtered);
}

// ================= CATEGORIES =================
function populateCategories() {
    const categories = new Set();

    allServices.forEach(service => {
        if (service.category) categories.add(service.category);
    });

    categorySelect.innerHTML = `<option value="all">All Categories</option>`;

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });
}

// ================= NAVIGATION (AUTH GUARD) =================
window.viewService = function(serviceId) {
    const redirectUrl = `service-details.html?serviceId=${serviceId}`;

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // Not logged in → send to login with redirect
            LoadingSpinner.navigateTo(`login.html?redirect=${encodeURIComponent(redirectUrl)}`);
        } else {
            // Logged in → go to service details
            LoadingSpinner.navigateTo(redirectUrl);
        }
    });
};