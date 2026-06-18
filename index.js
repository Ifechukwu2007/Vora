import { supabase } from './supabase.js';
import { formatPrice } from './currency-utils.js';

document.addEventListener('DOMContentLoaded', async () => {

  // =========================
  // AUTH CHECK
  // =========================

  const {
    data: { session }
  } = await supabase.auth.getSession();

  // =========================
  // REDIRECT IF LOGGED IN
  // =========================

  if (session) {
    // User is already logged in, redirect to home
    window.location.href = 'home.html';
    return;
  }

  // =========================
  // DOM ELEMENTS
  // =========================

  const guestActions =
    document.getElementById('guestActions');

  const userActions =
    document.getElementById('userActions');

  const mobileGuestActions =
    document.getElementById('mobileGuestActions');

  const mobileUserActions =
    document.getElementById('mobileUserActions');

  const logoutBtn =
    document.getElementById('logoutBtn');

  const logoutBtnSideMenu =
    document.getElementById('logoutBtnSideMenu');

  const servicesGrid =
    document.getElementById('servicesGrid');

  const searchInput =
    document.getElementById('indexSearchInput');

  const searchBtn =
    document.getElementById('indexSearchBtn');

  // =========================
  // LOGOUT
  // =========================

  async function logout() {

    try {

      await supabase.auth.signOut();

      alert('Logged out successfully');

      window.location.href =
        'login.html';

    } catch (err) {

      console.error(err);

      alert('Logout failed');
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener(
      'click',
      logout
    );
  }

  if (logoutBtnSideMenu) {
    logoutBtnSideMenu.addEventListener(
      'click',
      logout
    );
  }

  // =========================
  // SEARCH
  // =========================

  function handleSearch() {
    const query = searchInput.value.trim();

    loadFeaturedServices(query);
  }

  searchBtn?.addEventListener('click', handleSearch);

  searchInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });

  // =========================
  // LOAD FEATURED SERVICES
  // =========================

  async function loadFeaturedServices(searchQuery = '') {

    try {

      servicesGrid.innerHTML = `
        <div class="col-span-full text-center py-10 text-gray-500">
          Loading services...
        </div>
      `;

      let query = supabase
        .from('services')
        .select('*')
        .order('created_at', {
          ascending: false
        })
        .limit(8);

      if (searchQuery) {
        const normalized = searchQuery.trim();
        query = query.or(
          `title.ilike.%${normalized}%,description.ilike.%${normalized}%,category.ilike.%${normalized}%`
        );
      }

      const {
        data: services,
        error
      } = await query;

      if (error) {
        throw error;
      }

      // EMPTY
      if (!services || !services.length) {

        servicesGrid.innerHTML = `
          <div class="col-span-full text-center py-10 text-gray-500">
            ${searchQuery ? 'No services matched your search.' : 'No services available'}
          </div>
        `;

        return;
      }

      // CLEAR
      servicesGrid.innerHTML = '';

      // RENDER
      services.forEach(service => {

        const card =
          document.createElement('div');

        card.className = `
          bg-white
          rounded-xl
          overflow-hidden
          shadow-sm
          hover:shadow-lg
          transition
          cursor-pointer
        `;

        const image =
          service.image_url ||
          'https://placehold.co/600x400?text=Vora';

        card.innerHTML = `

          <img
            src="${image}"
            class="w-full h-48 object-cover"
          />

          <div class="p-4">

            <h3 class="font-bold text-lg text-gray-900 line-clamp-1">
              ${service.title || 'Untitled'}
            </h3>

            <p class="text-sm text-gray-500 mt-1">
              ${service.category || 'General'}
            </p>
 
            <p class="text-gray-700 text-sm mt-3 line-clamp-2">
              ${service.description || ''}
            </p>

            <div class="flex items-center justify-between mt-4">
              <div>
                ${service.group_discount_threshold && service.group_discount_percent ? `
                  <span class="text-sm text-gray-500 line-through mr-2">${formatPrice(service.price || 0)}</span>
                  <span class="font-bold text-green-600">${formatPrice(Math.round((Number(service.price) || 0) * (1 - Number(service.group_discount_percent) / 100)))}</span>
                  <div class="text-xs text-indigo-600 mt-1">${service.deal_message || `Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}%`}</div>
                ` : `
                  <span class="font-bold text-green-600">${formatPrice(service.price || 0)}</span>
                `}
              </div>

              <button
                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                View
              </button>

            </div>
 
          </div>
        `;

        // =========================
        // CARD CLICK
        // =========================

        card.addEventListener(
          'click',
          () => {

            window.location.href =
              `login.html?service_id=${service.id}`;
          }
        );

        servicesGrid.appendChild(card);

      });

      // =========================
      // EXPLORE BUTTON
      // =========================

      const exploreWrapper =
        document.createElement('div');

      exploreWrapper.className =
        'col-span-full text-center mt-10';

      exploreWrapper.innerHTML = `
        <a href="login.html"
          class="inline-block bg-black text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition">
          Explore All Services →
        </a>
      `;

      servicesGrid.appendChild(
        exploreWrapper
      );

    } catch (err) {

      console.error(err);

      servicesGrid.innerHTML = `
        <div class="col-span-full text-center py-10 text-red-500">
          Failed to load services
        </div>
      `;
    }
  }

  // =========================
  // LOAD SERVICES
  // =========================

  loadFeaturedServices();

});

// =========================
// FORMAT NGN
// =========================

function formatNGN(value) {

  return new Intl.NumberFormat(
    'en-NG',  
    {
      maximumFractionDigits: 0
    }
  ).format(
    Number(value || 0)
  );

}