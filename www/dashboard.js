import { supabase } from './supabase.js';


document.addEventListener('DOMContentLoaded', async () => {

    // =========================
    // ELEMENTS
    // =========================
    const providerName = document.getElementById('providerName');

    const totalBookings = document.getElementById('totalBookings');
    const totalRevenue = document.getElementById('totalRevenue');
    const yourServices = document.getElementById('yourServices');
    const successRate = document.getElementById('successRate');

    const totalCompleted = document.getElementById('totalCompleted');

    const upcomingBookings = document.getElementById('upcomingBookings');
    const activityFeed = document.getElementById('activityFeed');

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

        // YOUR SERVICES COUNT
        if (yourServices) yourServices.textContent = services.length;

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

        // TODAY'S BOOKINGS
        const today = new Date().toISOString().split('T')[0];
        const todayBookings = bookings.filter(booking => {

            if (!booking.booking_date) return false;

            // Handle booking_date with or without time component
            const bookingDate = booking.booking_date.split('T')[0];
            return bookingDate === today;
        });

        renderBookings(upcomingBookings, todayBookings, 'No bookings for today');

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
    // INIT
    // =========================
    await loadUserProfile();
    await loadServices();
    await loadBookings();

}); 