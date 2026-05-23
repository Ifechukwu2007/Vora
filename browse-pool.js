import { supabase } from './supabase.js';
import { NotificationService } from './notification-service.js';

let currentUser = null;
let allRequests = [];

// ==========================
// INIT
// ==========================
document.addEventListener('DOMContentLoaded', async () => {

    // OPTIONAL AUTH
    const { data: sessionData } = await supabase.auth.getSession();

    currentUser = sessionData?.session?.user || null;

    // LOAD REQUESTS
    await loadRequests();

    // FILTERS
    setupFilters();

    // MODALS
    setupModals();

    // LOGOUT
    setupLogout();
});

// ==========================
// LOGOUT
// ==========================
function setupLogout() {

    const logoutBtn =
        document.getElementById('logoutBtn');

    const logoutBtnSideMenu =
        document.getElementById('logoutBtnSideMenu');

    async function logout() {

        await supabase.auth.signOut();

        window.location.href = 'login.html';
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    if (logoutBtnSideMenu) {
        logoutBtnSideMenu.addEventListener('click', logout);
    }
}

// ==========================
// LOAD REQUESTS
// ==========================
async function loadRequests() {

    const requestsList =
        document.getElementById('requestsList');

    try {

        requestsList.innerHTML = `
            <div class="bg-white rounded-xl shadow p-10 text-center">

                <div class="text-5xl mb-4">⏳</div>

                <p class="text-gray-600 text-lg">
                    Loading requests...
                </p>

            </div>
        `;

        // ==========================
        // FETCH REQUESTS
        // ==========================
        const { data: requests, error } = await supabase
            .from('requests')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // ==========================
        // GET USER IDS
        // ==========================
        const userIds = [
            ...new Set(
                (requests || [])
                .map(request => request.user_id)
                .filter(Boolean)
            )
        ];

        // ==========================
        // FETCH PROFILES
        // ==========================
        let profilesMap = {};

        if (userIds.length > 0) {

            const {
                data: profiles,
                error: profilesError
            } = await supabase
                .from('profiles')
                .select(`
                    id,
                    full_name,
                    email,
                    phone,
                    location,
                    profile_picture
                `)
                .in('id', userIds);

            if (profilesError) {
                console.error(
                    'Profiles fetch error:',
                    profilesError
                );
            }

            if (profiles) {

                profiles.forEach(profile => {

                    profilesMap[profile.id] = profile;
                });
            }
        }

        // ==========================
        // ATTACH PROFILE
        // ==========================
        allRequests = (requests || []).map(request => {

            return {
                ...request,
                profile: profilesMap[request.user_id] || null
            };
        });

        renderRequests(allRequests);

    } catch (error) {

        console.error(
            'Load requests error:',
            error
        );

        requestsList.innerHTML = `
            <div class="bg-white rounded-xl shadow p-10 text-center">

                <div class="text-6xl mb-4">❌</div>

                <h2 class="text-2xl font-bold text-red-600 mb-3">
                    Failed to load requests
                </h2>

                <p class="text-gray-600">
                    ${error.message}
                </p>

            </div>
        `;
    }
}

// ==========================
// RENDER REQUESTS
// ==========================
function renderRequests(requests) {

    const requestsList =
        document.getElementById('requestsList');

    const noResults =
        document.getElementById('noResults');

    if (!requests || requests.length === 0) {

        requestsList.innerHTML = '';

        noResults.classList.remove('hidden');

        return;
    }

    noResults.classList.add('hidden');

    requestsList.innerHTML = '';

    requests.forEach(request => {

        const card =
            document.createElement('div');

        card.className = `
            bg-white
            rounded-2xl
            shadow-md
            hover:shadow-xl
            transition
            overflow-hidden
        `;

        const title =
            request.title || 'Service Request';

        const description =
            request.description ||
            'No description provided';

        const category =
            request.category || 'General';

        const budget =
            Number(request.budget || 0)
            .toLocaleString('en-NG');

        const urgency =
            request.urgency || 'normal';

        const location =
            request.location ||
            'Location not specified';

        // PROFILE
        const requesterProfile =
            request.profile || null;

        const requesterEmail =
            requesterProfile?.email ||
            'No email';

        const requesterName =
            requesterProfile?.full_name ||
            requesterEmail ||
            'Unknown User';

        const requesterPicture =
            requesterProfile?.profile_picture ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(requesterName)}`;

        const createdDate =
            formatDate(request.created_at);

        let urgencyColor =
            'bg-gray-100 text-gray-700';

        if (urgency === 'urgent') {
            urgencyColor =
                'bg-red-100 text-red-700';
        }

        if (urgency === 'high') {
            urgencyColor =
                'bg-orange-100 text-orange-700';
        }

        if (urgency === 'medium') {
            urgencyColor =
                'bg-yellow-100 text-yellow-700';
        }

        card.innerHTML = `
            <div class="p-6">

                <!-- REQUESTER -->
                <div class="flex items-center gap-3 mb-4 pb-4 border-b">

                    <img
                        src="${requesterPicture}"
                        alt="Requester avatar"
                        class="w-12 h-12 rounded-full object-cover border border-gray-200"
                    />

                    <div>

                        <p class="text-sm text-gray-500">
                            Posted by
                        </p>

                        <p class="font-semibold text-gray-900">
                            ${requesterName}
                        </p>

                        <p class="text-sm text-blue-600">
                            ${requesterEmail}
                        </p>

                    </div>

                </div>

                <!-- TOP -->
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                    <div>

                        <div class="flex items-center gap-3 flex-wrap">

                            <h2 class="text-2xl font-bold text-gray-900">
                                ${title}
                            </h2>

                            <span class="px-3 py-1 rounded-full text-sm font-semibold ${urgencyColor}">
                                ${urgency}
                            </span>

                        </div>

                        <p class="text-gray-500 mt-2">
                            ${category}
                        </p>

                    </div>

                    <div class="text-right">

                        <p class="text-sm text-gray-500">
                            Budget
                        </p>

                        <p class="text-3xl font-extrabold text-green-600">
                            ₦${budget}
                        </p>

                    </div>

                </div>

                <!-- DESCRIPTION -->
                <div class="mt-5">

                    <p class="text-gray-700 leading-relaxed">
                        ${description}
                    </p>

                </div>

                <!-- DETAILS -->
                <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">

                    <div class="bg-gray-50 rounded-xl p-4">

                        <p class="text-sm text-gray-500 mb-1">
                            👤 Requested By
                        </p>

                        <p class="font-semibold text-gray-900">
                            ${requesterName}
                        </p>

                        <p class="text-sm text-blue-600">
                            ${requesterEmail}
                        </p>

                    </div>

                    <div class="bg-gray-50 rounded-xl p-4">

                        <p class="text-sm text-gray-500 mb-1">
                            📍 Location
                        </p>

                        <p class="font-semibold text-gray-900">
                            ${location}
                        </p>

                    </div>

                </div>

                <!-- FOOTER -->
                <div class="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                    <div class="text-sm text-gray-500">
                        Posted ${createdDate}
                    </div>

                    <div class="flex gap-3 flex-wrap">

                        <button
                            class="view-request-btn bg-gray-200 hover:bg-gray-300 text-gray-900 px-5 py-3 rounded-xl font-semibold transition"
                            data-id="${request.id}"
                        >
                            View Details
                        </button>

                        <button
                            class="offer-btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-semibold transition"
                            data-id="${request.id}"
                        >
                            Submit Offer
                        </button>

                    </div>

                </div>

            </div>
        `;

        requestsList.appendChild(card);
    });

    setupRequestButtons();
}

// ==========================
// FILTERS
// ==========================
function setupFilters() {

    const searchInput =
        document.getElementById('searchInput');

    const categoryFilter =
        document.getElementById('service-category');

    const locationFilter =
        document.getElementById('locationFilter');

    const sortFilter =
        document.getElementById('sortFilter');

    [
        searchInput,
        categoryFilter,
        locationFilter,
        sortFilter
    ].forEach(element => {

        if (!element) return;

        element.addEventListener(
            'input',
            applyFilters
        );

        element.addEventListener(
            'change',
            applyFilters
        );
    });
}

// ==========================
// APPLY FILTERS
// ==========================
function applyFilters() {

    const search =
        document.getElementById('searchInput')
        .value
        .toLowerCase();

    const category =
        document.getElementById('service-category')
        .value;

    const location =
        document.getElementById('locationFilter')
        .value
        .toLowerCase();

    const sort =
        document.getElementById('sortFilter')
        .value;

    let filtered = [...allRequests];

    // SEARCH
    filtered = filtered.filter(request => {

        const title =
            (request.title || '')
            .toLowerCase();

        const description =
            (request.description || '')
            .toLowerCase();

        return (
            title.includes(search) ||
            description.includes(search)
        );
    });

    // CATEGORY
    if (category) {

        filtered = filtered.filter(
            request =>
            request.category === category
        );
    }

    // LOCATION
    if (location) {

        filtered = filtered.filter(
            request =>
            (request.location || '')
            .toLowerCase()
            .includes(location)
        );
    }

    // SORT
    if (sort === 'budget-high') {

        filtered.sort(
            (a, b) =>
            (b.budget || 0) -
            (a.budget || 0)
        );
    }

    if (sort === 'budget-low') {

        filtered.sort(
            (a, b) =>
            (a.budget || 0) -
            (b.budget || 0)
        );
    }

    if (sort === 'newest') {

        filtered.sort(
            (a, b) =>
            new Date(b.created_at) -
            new Date(a.created_at)
        );
    }

    renderRequests(filtered);
}

// ==========================
// BUTTONS
// ==========================
function setupRequestButtons() {

    document
    .querySelectorAll('.view-request-btn')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => {

                openRequestModal(
                    button.dataset.id
                );
            }
        );
    });

    document
    .querySelectorAll('.offer-btn')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => {

                openOfferModal(
                    button.dataset.id
                );
            }
        );
    });
}

// ==========================
// REQUEST MODAL
// ==========================
function openRequestModal(requestId) {

    const request =
        allRequests.find(
            r => r.id == requestId
        );

    if (!request) return;

    const requesterProfile =
        request.profile || null;

    const requesterEmail =
        requesterProfile?.email || 'N/A';

    const requesterName =
        requesterProfile?.full_name ||
        requesterEmail;

    const modal =
        document.getElementById(
            'requestModal'
        );

    const modalContent =
        document.getElementById(
            'modalContent'
        );

    modalContent.innerHTML = `
        <h2 class="text-3xl font-bold mb-4">
            ${request.title}
        </h2>

        <div class="space-y-4">

            <div>

                <p class="font-semibold text-gray-900">
                    Description
                </p>

                <p class="text-gray-700 mt-1">
                    ${request.description || 'No description'}
                </p>

            </div>

            <div>

                <p class="font-semibold text-gray-900">
                    Budget
                </p>

                <p class="text-green-600 font-bold text-2xl">
                    ₦${formatMoney(request.budget)}
                </p>

            </div>

            <div>

                <p class="font-semibold text-gray-900">
                    Location
                </p>

                <p class="text-gray-700">
                    ${request.location || 'N/A'}
                </p>

            </div>

            <div>

                <p class="font-semibold text-gray-900">
                    Client Email
                </p>

                <p class="text-blue-600">
                    ${requesterEmail}
                </p>

            </div>

            <div>

                <p class="font-semibold text-gray-900">
                    Client Name
                </p>

                <p class="text-gray-900">
                    ${requesterName}
                </p>

            </div>

        </div>
    `;

    modal.classList.remove('hidden');
}

// ==========================
// OFFER MODAL
// ==========================
function openOfferModal(requestId) {

    document.getElementById('requestId').value =
        requestId;

    document.getElementById('offerModal')
    .classList.remove('hidden');
}

// ==========================
// MODALS
// ==========================
function setupModals() {

    document.getElementById('closeModal')
    ?.addEventListener('click', () => {

        document.getElementById(
            'requestModal'
        ).classList.add('hidden');
    });

    document.getElementById('closeOfferModal')
    ?.addEventListener(
        'click',
        closeOfferModal
    );

    document.getElementById('closeOfferBtn')
    ?.addEventListener(
        'click',
        closeOfferModal
    );

    document.getElementById('offerForm')
    ?.addEventListener(
        'submit',
        submitOffer
    );
}

// ==========================
// CLOSE OFFER MODAL
// ==========================
function closeOfferModal() {

    document.getElementById('offerModal')
    .classList.add('hidden');

    document.getElementById('offerForm')
    .reset();
}

// ==========================
// SUBMIT OFFER
// ==========================
async function submitOffer(e) {

    e.preventDefault();

    if (!currentUser) {

        alert('Please login first');

        window.location.href = 'login.html';

        return;
    }

    const submitBtn =
        e.target.querySelector(
            'button[type="submit"]'
        );

    try {

        submitBtn.disabled = true;

        submitBtn.textContent =
            'Sending...';

        const requestId =
            document.getElementById(
                'requestId'
            ).value;

        const offerPrice =
            document.getElementById(
                'offerPrice'
            ).value;

        const offerMessage =
            document.getElementById(
                'offerMessage'
            ).value;

        const availability =
            document.getElementById(
                'offerAvailability'
            ).value;

        // CHECK EXISTING OFFER
        const {
            data: existingOffer
        } = await supabase
            .from('offers')
            .select('id')
            .eq('request_id', requestId)
            .eq('provider_id', currentUser.id)
            .maybeSingle();

        if (existingOffer) {

            alert(
                'You already submitted an offer'
            );

            submitBtn.disabled = false;

            submitBtn.textContent =
                'Send Offer';

            return;
        }

        // INSERT OFFER
        const {
            data: insertedOffer,
            error
        } = await supabase
            .from('offers')
            .insert({
                request_id: requestId,
                provider_id: currentUser.id,
                price: Number(offerPrice),
                message: offerMessage,
                availability: availability,
                status: 'pending',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        alert(
            'Offer submitted successfully!'
        );

        closeOfferModal();

        await loadRequests();

    } catch (error) {

        console.error(error);

        alert(error.message);

    } finally {

        submitBtn.disabled = false;

        submitBtn.textContent =
            'Send Offer';
    }
}

// ==========================
// FORMAT DATE
// ==========================
function formatDate(dateString) {

    if (!dateString) return 'Recently';

    return new Date(dateString)
    .toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ==========================
// FORMAT MONEY
// ==========================
function formatMoney(amount) {

    return Number(amount || 0)
    .toLocaleString('en-NG');
}