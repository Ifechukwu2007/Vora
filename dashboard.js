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

    const logoutBtns = document.querySelectorAll('[data-logout], button[id^="logoutBtn"]');

    // =========================
    // LOGOUT
    // =========================
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'home.html';
        });
    });

    // =========================
    // GET USER
    // =========================
    const isFileProtocol = window.location.protocol === 'file:';
    let user = null;
    try {
        const authResp = await supabase.auth.getUser();
        user = authResp?.data?.user || null;
    } catch (err) {
        console.warn('Auth lookup failed, falling back to preview if local', err);
        user = null;
    }

    if (!user && isFileProtocol) {
        // allow preview when opened from file system
        user = { id: 'preview-user', email: 'preview@vora.com' };
    }

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // =========================
    // LOAD USER PROFILE
    // =========================
    async function loadUserProfile() {

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError) console.warn('Profile lookup failed:', profileError);

        let account = profile;
        if (!account) {
            const { data, error } = await supabase
                .from('users')
                .select('name, full_name, email')
                .eq('id', user.id)
                .maybeSingle();

            if (error) console.warn('User fallback lookup failed:', error);
            account = data;
        }

        if (providerName) {
            providerName.textContent = account?.full_name || account?.name || account?.email || user.email || 'Provider';
        }
    }

    // =========================
    // LOAD SERVICES
    // =========================
    async function loadServices() {

        const { data: services, error } = await supabase
            .from('services')
            .select('*')
            .eq('provider_id', user.id)
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
            .select('*, services(title)')
            .eq('provider_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return [];
        }

        // TOTAL BOOKINGS
        if (totalBookings) totalBookings.textContent = bookings.length;

        // TOTAL REVENUE
        const revenue = bookings.reduce(
            (total, booking) => total + Number(booking.total_price ?? booking.total_amount ?? booking.amount ?? 0),
            0
        );

        if (totalRevenue) totalRevenue.textContent = `₦${revenue.toLocaleString()}`;

        // COMPLETED
        const completedBookings = bookings.filter(
            booking =>
                ['completed', 'completed_by_provider'].includes(booking.status)
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

            const dateValue = booking.scheduled_date || booking.booking_date;
            if (!dateValue) return false;

            // Handle booking_date with or without time component
            const bookingDate = dateValue.split('T')[0];
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
                        ${booking.services?.title || booking.service_title || 'Service Booking'}
                    </h3>

                    <p class="text-sm text-gray-500">
                        ${booking.customer_email || booking.customer_name || 'Customer'}
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
                        ${booking.services?.title || booking.service_title || 'service'}
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

    const refreshDashboard = () => {
        loadServices();
        loadBookings();
    };

    supabase
        .channel(`dashboard-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${user.id}` }, refreshDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'services', filter: `provider_id=eq.${user.id}` }, refreshDashboard)
        .subscribe();

});
