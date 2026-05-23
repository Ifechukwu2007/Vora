import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // =========================
    // ELEMENTS
    // =========================
    const providerName = document.getElementById('providerName');

    const totalBookings = document.getElementById('totalBookings');
    const totalRevenue = document.getElementById('totalRevenue');
    const activeServices = document.getElementById('activeServices');
    const successRate = document.getElementById('successRate');

    const totalOffers = document.getElementById('totalOffers');
    const totalWins = document.getElementById('totalWins');
    const totalCompleted = document.getElementById('totalCompleted');

    const todayBookings = document.getElementById('todayBookings');
    const upcomingBookings = document.getElementById('upcomingBookings');
    const recentServices = document.getElementById('recentServices');
    const activityFeed = document.getElementById('activityFeed');
    const activeOffersList = document.getElementById('activeOffersList');

    const noServiceOverlay = document.getElementById('noServiceOverlay');

    const winRateBar = document.getElementById('winRateBar');
    const winRatePercent = document.getElementById('winRatePercent');

    const logoutBtns = document.querySelectorAll('[data-logout], #logoutBtn');

    // =========================
    // LOGOUT
    // =========================
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'login.html';
        });
    });

    // =========================
    // GET USER
    // =========================
    const authResp = await supabase.auth.getUser();
    const user = authResp?.data?.user;
    const authError = authResp?.error;

    if (authError || !user) {
        window.location.href = 'login.html';
        return;
    }

    // =========================
    // LOAD USER PROFILE
    // =========================
    async function loadUserProfile() {

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error(error);
            if (providerName) providerName.textContent = 'Provider';
            return;
        }

        if (providerName)
            providerName.textContent =
                data?.name ||
                data?.email ||
                user.email ||
                'Provider';
    }

    // =========================
    // LOAD SERVICES
    // =========================
    async function loadServices() {

        const { data: services, error } = await supabase
            .from('services')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return [];
        }

        // NO SERVICE
        if (!services || services.length === 0) {
            if (noServiceOverlay) noServiceOverlay.classList.remove('hidden');
        } else {
            if (noServiceOverlay) noServiceOverlay.classList.add('hidden');
        }

        // ACTIVE SERVICES COUNT
        if (activeServices) activeServices.textContent = services.length;

        // RENDER SERVICES
        if (services.length === 0) {

            recentServices.innerHTML = `
                <p class="text-gray-500 text-sm text-center py-4">
                    No services added yet
                </p>
            `;

        } else {

            if (recentServices) recentServices.innerHTML = '';

            services.slice(0, 5).forEach(service => {

                const div = document.createElement('div');

                div.className =
                    'border rounded-lg p-4 flex items-center justify-between';

                div.innerHTML = `
                    <div>
                        <h3 class="font-semibold text-gray-900">
                            ${service.title || 'Untitled Service'}
                        </h3>

                        <p class="text-sm text-gray-500">
                            ${service.category || 'General'}
                        </p>
                    </div>

                    <span class="text-sm font-semibold text-green-600">
                        Active
                    </span>
                `;

                if (recentServices) recentServices.appendChild(div);
            });
        }

        return services;
    }

    // =========================
    // LOAD BOOKINGS
    // =========================
    async function loadBookings() {

        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('provider_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return [];
        }

        // TOTAL BOOKINGS
        if (totalBookings) totalBookings.textContent = bookings.length;

        // TOTAL REVENUE
        let revenue = 0;

        bookings.forEach(booking => {
            revenue += Number(booking.amount || 0);
        });

        if (totalRevenue) totalRevenue.textContent = `₦${revenue.toLocaleString()}`;

        // COMPLETED
        const completedBookings = bookings.filter(
            booking =>
                booking.status === 'completed'
        );

        if (totalCompleted) totalCompleted.textContent = completedBookings.length;

        // SUCCESS RATE
        const rate =
            bookings.length > 0
                ? Math.round(
                    (completedBookings.length / bookings.length) * 100
                )
                : 0;

        if (successRate) successRate.textContent = `${rate}%`;

        if (winRatePercent) winRatePercent.textContent = rate;
        if (winRateBar) winRateBar.style.width = `${rate}%`;

        // TODAY BOOKINGS
        const today = new Date().toISOString().split('T')[0];

        const todays = bookings.filter(booking => {

            if (!booking.booking_date) return false;

            return booking.booking_date === today;
        });

        renderBookings(todayBookings, todays, 'No bookings scheduled for today');

        // UPCOMING
        const upcoming = bookings.filter(booking => {

            if (!booking.booking_date) return false;

            return booking.booking_date > today;
        });

        renderBookings(upcomingBookings, upcoming, 'No upcoming bookings');

        // ACTIVITY
        renderActivity(bookings);

        return bookings;
    }

    // =========================
    // RENDER BOOKINGS
    // =========================
    function renderBookings(container, bookings, emptyText) {

        if (!container) return;

        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
                <p class="text-gray-500 text-sm text-center py-4">
                    ${emptyText}
                </p>
            `;

            return;
        }

        container.innerHTML = '';

        bookings.slice(0, 5).forEach(booking => {

            const div = document.createElement('div');

            div.className =
                'border rounded-lg p-4 flex items-center justify-between';

            div.innerHTML = `
                <div>
                    <h3 class="font-semibold text-gray-900">
                        ${booking.service_title || 'Service Booking'}
                    </h3>

                    <p class="text-sm text-gray-500">
                        ${booking.customer_email || 'Customer'}
                    </p>
                </div>

                <div class="text-right">
                    <p class="font-semibold text-green-600">
                        ₦${Number(booking.amount || 0).toLocaleString()}
                    </p>

                    <p class="text-xs text-gray-500 capitalize">
                        ${booking.status || 'pending'}
                    </p>
                </div>
            `;

                container.appendChild(div);
        });
    }

    // =========================
    // LOAD OFFERS
    // =========================
    async function loadOffers() {

        const { data: offers, error } = await supabase
            .from('offers')
            .select('*')
            .eq('provider_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return [];
        }

        if (totalOffers) totalOffers.textContent = offers.length;

        const wins = offers.filter(
            offer => offer.status === 'accepted'
        );

        if (totalWins) totalWins.textContent = wins.length;

        // ACTIVE OFFERS
        if (!offers || offers.length === 0) {

            activeOffersList.innerHTML = `
                <p class="text-gray-500 text-sm text-center py-4">
                    No active offers
                </p>
            `;

        } else {

            if (activeOffersList) activeOffersList.innerHTML = '';

            offers.slice(0, 5).forEach(offer => {

                const div = document.createElement('div');

                div.className =
                    'border rounded-lg p-4';

                div.innerHTML = `
                    <div class="flex items-center justify-between mb-2">

                        <h3 class="font-semibold text-gray-900">
                            ${offer.request_title || 'Service Request'}
                        </h3>

                        <span class="text-xs px-2 py-1 rounded-full
                            ${offer.status === 'accepted'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'}">

                            ${offer.status || 'pending'}
                        </span>

                    </div>

                    <p class="text-sm text-gray-500 mb-2">
                        ₦${Number(offer.price || 0).toLocaleString()}
                    </p>

                    <button
                        class="view-offer-btn text-blue-600 text-sm font-medium"
                        data-id="${offer.id}">
                        View Details
                    </button>
                `;

                if (activeOffersList) activeOffersList.appendChild(div);
            });
        }

        return offers;
    }

    // =========================
    // ACTIVITY FEED
    // =========================
    function renderActivity(bookings) {

        if (!bookings || bookings.length === 0) {

            activityFeed.innerHTML = `
                <p class="text-gray-500 text-sm text-center py-4">
                    No recent activity
                </p>
            `;

            return;
        }

        activityFeed.innerHTML = '';

        bookings.slice(0, 5).forEach(booking => {

            const div = document.createElement('div');

            div.className =
                'border-b pb-3';

            div.innerHTML = `
                <p class="text-sm text-gray-900">
                    New booking for
                    <span class="font-semibold">
                        ${booking.service_title || 'service'}
                    </span>
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    ${new Date(
                        booking.created_at
                    ).toLocaleString()}
                </p>
            `;

            activityFeed.appendChild(div);
        });
    }

    // =========================
    // OFFER MODAL
    // =========================
    const offerModal =
        document.getElementById('offerDetailsModal');

    const offerContent =
        document.getElementById('offerDetailsContent');

    const closeOfferModal =
        document.getElementById('closeOfferModal');

    document.addEventListener('click', async (e) => {

        if (!e.target.classList.contains('view-offer-btn'))
            return;

        const offerId = e.target.dataset.id;

        const { data: offer, error } = await supabase
            .from('offers')
            .select('*')
            .eq('id', offerId)
            .single();

        if (error || !offer) {
            alert('Failed to load offer');
            return;
        }

        offerContent.innerHTML = `
            <div class="space-y-4">

                <div>
                    <p class="text-sm text-gray-500">
                        Request
                    </p>

                    <h3 class="font-semibold text-lg">
                        ${offer.request_title || 'Service Request'}
                    </h3>
                </div>

                <div>
                    <p class="text-sm text-gray-500">
                        Your Price
                    </p>

                    <p class="font-bold text-green-600 text-xl">
                        ₦${Number(offer.price || 0).toLocaleString()}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">
                        Message
                    </p>

                    <p class="text-gray-800">
                        ${offer.message || 'No message'}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">
                        Availability
                    </p>

                    <p class="text-gray-800 capitalize">
                        ${offer.availability || 'Flexible'}
                    </p>
                </div>

                <div>
                    <p class="text-sm text-gray-500">
                        Status
                    </p>

                    <p class="capitalize font-semibold">
                        ${offer.status || 'pending'}
                    </p>
                </div>

            </div>
        `;

        offerModal.classList.remove('hidden');
    });

    closeOfferModal.addEventListener('click', () => {
        offerModal.classList.add('hidden');
    });

    offerModal.addEventListener('click', (e) => {

        if (e.target === offerModal) {
            offerModal.classList.add('hidden');
        }
    });

    // =========================
    // INIT
    // =========================
    await loadUserProfile();
    await loadServices();
    await loadBookings();
    await loadOffers();

});