import { supabase } from './supabase.js';
import { formatPrice, formatPriceInCurrency } from './currency-utils.js';

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
    const dashboardLoadError = document.getElementById('dashboardLoadError');
    const dashboardErrors = new Map();

    function setDashboardError(key, message) {
        if (message) dashboardErrors.set(key, message);
        else dashboardErrors.delete(key);
        if (!dashboardLoadError) return;
        dashboardLoadError.textContent = [...dashboardErrors.values()].join(' ');
        dashboardLoadError.classList.toggle('hidden', dashboardErrors.size === 0);
    }

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
        console.error('Auth lookup failed:', err);
        user = null;
    }

    if (!user && isFileProtocol) {
        // allow preview when opened from file system
        user = { id: 'preview-user', email: 'preview@vorabukeen.com' };
    }

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // =========================
    // LOAD USER PROFILE
    // =========================
    async function loadUserProfile() {
        const { data, error } = await supabase
            .from('users')
            .select('full_name, name, email')
            .eq('uid', user.id)
            .maybeSingle();

        if (error) {
            console.error('Provider profile lookup failed:', error);
            setDashboardError('profile', `Your profile could not be loaded: ${error.message}`);
            if (providerName) providerName.textContent = user.user_metadata?.full_name || user.email || 'Provider';
            return;
        }
        setDashboardError('profile', null);

        if (providerName) {
            providerName.textContent = data?.full_name || data?.name || data?.email || user.email || 'Provider';
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
            console.error('Could not load provider services:', error);
            setDashboardError('services', `Your services could not be loaded: ${error.message}`);
            return [];
        }
        setDashboardError('services', null);

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

        const { data, error } = await supabase
            .from('bookings')
            .select('*, services(title, currency_code)')
            .eq('provider_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Could not load provider bookings:', error);
            setDashboardError('bookings', `Your bookings could not be loaded: ${error.message}`);
            return [];
        }
        const bookings = data || [];
        setDashboardError('bookings', null);

        const cashBookingCount = bookings.filter(
            booking =>
                ['cash', 'reserve_cash'].includes(String(booking.payment_method || '').toLowerCase())
                && !['cancelled', 'declined'].includes(String(booking.status || '').toLowerCase())
        ).length;
        const cashBookingCountElement = document.getElementById('cashCommissionBookings');
        if (cashBookingCountElement) cashBookingCountElement.textContent = String(cashBookingCount);

        // TOTAL BOOKINGS
        if (totalBookings) totalBookings.textContent = bookings.length;

        // TOTAL REVENUE
        // COMPLETED
        const completedBookings = bookings.filter(
            booking => booking.status === 'completed'
        );

        if (totalCompleted) totalCompleted.textContent = completedBookings.length;
        const revenueByCurrency = new Map();
        completedBookings.forEach((booking) => {
            const currency = booking.services?.currency_code || 'NGN';
            const amount = Number(booking.total_price ?? booking.total_amount ?? booking.amount ?? 0);
            revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + amount);
        });
        if (totalRevenue) {
            totalRevenue.textContent = [...revenueByCurrency.entries()]
                .map(([currency, amount]) => formatPriceInCurrency(amount, currency))
                .join(' · ') || formatPrice(0);
        }

        // SUCCESS RATE
        const rate =
            bookings.length > 0
                ? Math.round(
                    (completedBookings.length / bookings.length) * 100
                )
                : 0;

        if (successRate) successRate.textContent = `${rate}%`;

        if (winRatePercent) winRatePercent.textContent = String(rate);
        if (winRateBar) winRateBar.style.width = `${rate}%`;

        // TODAY'S BOOKINGS
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayBookings = bookings.filter(booking => {
            const dateValue = booking.scheduled_date || booking.booking_date;
            if (!dateValue) return false;
            return String(dateValue).split('T')[0] === today;
        }).sort((a, b) => new Date(a.scheduled_date || a.booking_date) - new Date(b.scheduled_date || b.booking_date));

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

            const details = document.createElement('div');
            const title = document.createElement('h3');
            title.className = 'font-semibold text-gray-900';
            title.textContent = booking.services?.title || booking.service_title || 'Service Booking';
            const customer = document.createElement('p');
            customer.className = 'text-sm text-gray-500';
            customer.textContent = booking.customer_email || booking.customer_name || 'Customer';
            details.append(title, customer);

            const summary = document.createElement('div');
            summary.className = 'text-right';
            const amount = document.createElement('p');
            amount.className = 'font-semibold text-green-600';
            amount.textContent = formatPriceInCurrency(
                booking.total_price ?? booking.amount ?? 0,
                booking.services?.currency_code || 'NGN'
            );
            const status = document.createElement('p');
            status.className = 'text-xs text-gray-500 capitalize';
            status.textContent = String(booking.status || 'pending').replace(/_/g, ' ');
            summary.append(amount, status);
            div.append(details, summary);
            container.appendChild(div);
        });
    }



    // =========================
    // ACTIVITY FEED
    // =========================
    function renderActivity(bookings) {
        if (!activityFeed) return;

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

            const description = document.createElement('p');
            description.className = 'text-sm text-gray-900';
            description.textContent = `New booking for ${booking.services?.title || booking.service_title || 'service'}`;
            const date = document.createElement('p');
            date.className = 'text-xs text-gray-500 mt-1';
            date.textContent = booking.created_at ? new Date(booking.created_at).toLocaleString() : 'Date unavailable';
            div.append(description, date);

            activityFeed.appendChild(div);
        });
    }

    async function loadCommissionPolicy() {
        const [settingsResult, agreementResult] = await Promise.all([
            supabase
                .from('settings')
                .select('commission, provider_commission_limit')
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('provider_commission_agreements')
                .select('commission_rate, commission_limit')
                .eq('provider_id', user.id)
                .eq('policy_version', 'commission-2026-11-v1'),
        ]);
        const error = settingsResult.error || agreementResult.error;
        if (error) {
            console.error('Could not load provider commission policy:', error);
            const panel = document.getElementById('providerCommissionPolicyPanel');
            const message = document.getElementById('providerCommissionPolicyMessage');
            if (panel) panel.classList.remove('hidden');
            if (message) {
                message.className = 'mt-3 text-sm text-red-700';
                message.textContent = `Commission policy status could not be loaded: ${error.message}`;
            }
            return;
        }

        const commissionRate = Number(settingsResult.data?.commission ?? 10);
        const commissionLimit = Number(settingsResult.data?.provider_commission_limit ?? 10000);
        document.getElementById('dashboardCommissionRate').textContent = `${commissionRate}%`;
        document.getElementById('dashboardCommissionLimit').textContent = formatPriceInCurrency(commissionLimit, 'NGN');

        const hasCurrentAgreement = agreementResult.data?.some(agreement =>
            Number(agreement.commission_rate) === commissionRate
            && Number(agreement.commission_limit) === commissionLimit
        );
        const panel = document.getElementById('providerCommissionPolicyPanel');
        if (panel) panel.classList.toggle('hidden', Boolean(hasCurrentAgreement));
        if (!hasCurrentAgreement) {
            const message = document.getElementById('providerCommissionPolicyMessage');
            if (message) {
                message.className = 'mt-3 text-sm text-indigo-900';
                message.textContent = agreementResult.data?.length
                    ? 'The commission rate or limit has changed. Please review and accept the current terms to restore booking access.'
                    : 'Accept the policy to enable new bookings for your services.';
            }
        }
    }

    document.getElementById('providerCommissionPolicyForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const checkbox = document.getElementById('dashboardCommissionAgreement');
        const message = document.getElementById('providerCommissionPolicyMessage');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        if (!(checkbox instanceof HTMLInputElement) || !(message instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
        if (!checkbox.checked) {
            message.className = 'mt-3 text-sm text-red-700';
            message.textContent = 'Confirm your agreement before continuing.';
            return;
        }

        button.disabled = true;
        message.className = 'mt-3 text-sm text-slate-700';
        message.textContent = 'Recording your agreement...';
        try {
            const { data: settings, error: settingsError } = await supabase
                .from('settings')
                .select('commission, provider_commission_limit')
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (settingsError) throw settingsError;

            const commissionRate = Number(settings?.commission ?? 10);
            const commissionLimit = Number(settings?.provider_commission_limit ?? 10000);
            const { error } = await supabase
                .from('provider_commission_agreements')
                .insert({
                    provider_id: user.id,
                    policy_version: 'commission-2026-11-v1',
                    commission_rate: commissionRate,
                    commission_limit: commissionLimit,
                });
            if (error) throw error;

            message.className = 'mt-3 text-sm text-green-700';
            message.textContent = 'Policy accepted. Booking access is available subject to the commission balance and due-date rules.';
            checkbox.checked = false;
            await loadCommissionPolicy();
        } catch (error) {
            console.error('Provider commission policy acceptance failed:', error);
            message.className = 'mt-3 text-sm text-red-700';
            message.textContent = `Your agreement was not recorded: ${error.message || error}`;
        } finally {
            button.disabled = false;
        }
    });

    async function loadCommissionSummary() {
        const [balanceResult, paymentsResult, commissionsResult, settingsResult] = await Promise.all([
            supabase
                .from('provider_balances')
                .select('currency_code, total_commission, commission_paid, outstanding_balance')
                .eq('provider_id', user.id),
            supabase
                .from('commission_payments')
                .select('id, amount, currency_code, reference, status, created_at')
                .eq('provider_id', user.id)
                .order('created_at', { ascending: false }),
            supabase
                .from('provider_commissions')
                .select('id, commission_amount, currency_code, due_at, status, commission_payment_allocations(amount)')
                .eq('provider_id', user.id)
                .eq('status', 'owed'),
            supabase
                .from('settings')
                .select('provider_commission_limit')
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle(),
        ]);

        const error = balanceResult.error || paymentsResult.error || commissionsResult.error || settingsResult.error;
        if (error) {
            console.error('Could not load commission account:', error);
            const message = document.getElementById('commissionPaymentMessage');
            if (message) {
                message.className = 'text-sm text-red-700 md:col-span-4';
                message.textContent = `Commission summary could not be loaded: ${error.message}`;
            }
            return;
        }

        const reminderResult = await supabase.rpc('send_provider_commission_overdue_reminders');
        if (reminderResult.error) {
            console.error('Could not send overdue commission reminders:', reminderResult.error);
            const message = document.getElementById('commissionPaymentMessage');
            if (message) {
                message.className = 'text-sm text-amber-800 md:col-span-4';
                message.textContent = `Your balances loaded, but overdue reminders could not be recorded: ${reminderResult.error.message}`;
            }
        }

        const balances = balanceResult.data || [];
        const outstandingCommissions = commissionsResult.data || [];
        const commissionLimit = Number(settingsResult.data?.provider_commission_limit ?? 10000);
        const ngnBalance = Number(balances.find(row => (row.currency_code || 'NGN') === 'NGN')?.outstanding_balance || 0);
        const overdueRows = outstandingCommissions.filter(commission =>
            commission.due_at && new Date(commission.due_at).getTime() <= Date.now()
        );
        const enforcementNotice = document.getElementById('commissionEnforcementNotice');
        if (enforcementNotice && (overdueRows.length || ngnBalance >= commissionLimit)) {
            const overdueByCurrency = new Map();
            overdueRows.forEach((commission) => {
                const currency = commission.currency_code || 'NGN';
                const allocated = (commission.commission_payment_allocations || [])
                    .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
                const remaining = Math.max(0, Number(commission.commission_amount || 0) - allocated);
                overdueByCurrency.set(currency, (overdueByCurrency.get(currency) || 0) + remaining);
            });
            const overdueText = [...overdueByCurrency.entries()]
                .map(([currency, amount]) => formatPriceInCurrency(amount, currency))
                .join(' · ');
            enforcementNotice.textContent = overdueRows.length
                ? `New bookings are restricted because commission is overdue (${overdueText}). Submit a transfer and contact Vorabukeen if you need help.`
                : `New bookings are restricted because your outstanding NGN commission has reached the ${formatPriceInCurrency(commissionLimit, 'NGN')} limit. Submit a transfer for review to restore booking access.`;
            enforcementNotice.classList.remove('hidden');
        } else if (enforcementNotice) {
            enforcementNotice.classList.add('hidden');
            enforcementNotice.textContent = '';
        }

        const totalsByCurrency = (key) => balances
            .filter(row => Number(row[key]) > 0)
            .map(row => formatPriceInCurrency(row[key], row.currency_code || 'NGN'))
            .join(' · ') || formatPrice(0);
        document.getElementById('commissionTotalOwed').textContent = totalsByCurrency('total_commission');
        document.getElementById('commissionPaid').textContent = totalsByCurrency('commission_paid');
        document.getElementById('commissionOutstanding').textContent = totalsByCurrency('outstanding_balance');

        const pendingByCurrency = new Map();
        (paymentsResult.data || [])
            .filter(payment => payment.status === 'pending')
            .forEach(payment => {
                const code = payment.currency_code || 'NGN';
                pendingByCurrency.set(code, (pendingByCurrency.get(code) || 0) + Number(payment.amount || 0));
            });
        const currencySelect = document.getElementById('commissionPaymentCurrency');
        const availableByCurrency = new Map();
        if (currencySelect) {
            currencySelect.replaceChildren();
            const balancesByCurrency = new Map(
                balances.map(row => [row.currency_code || 'NGN', Number(row.outstanding_balance || 0)])
            );
            const ledgerBalancesByCurrency = new Map();
            outstandingCommissions.forEach(commission => {
                const currency = commission.currency_code || 'NGN';
                const allocated = (commission.commission_payment_allocations || [])
                    .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
                const remaining = Math.max(0, Number(commission.commission_amount || 0) - allocated);
                ledgerBalancesByCurrency.set(
                    currency,
                    (ledgerBalancesByCurrency.get(currency) || 0) + remaining
                );
            });
            ledgerBalancesByCurrency.forEach((amount, currency) => {
                balancesByCurrency.set(currency, Math.max(balancesByCurrency.get(currency) || 0, amount));
            });
            if (!balancesByCurrency.has('NGN')) balancesByCurrency.set('NGN', 0);

            const currencies = [...balancesByCurrency.keys()]
                .sort((a, b) => a === 'NGN' ? -1 : b === 'NGN' ? 1 : a.localeCompare(b));
            let hasAvailableCurrency = false;
            let firstAvailableCurrency = '';
            currencies.forEach(currency => {
                const available = Math.max(
                    0,
                    (balancesByCurrency.get(currency) || 0) - (pendingByCurrency.get(currency) || 0)
                );
                const option = document.createElement('option');
                option.value = currency;
                option.textContent = option.value;
                option.disabled = available <= 0;
                currencySelect.appendChild(option);
                availableByCurrency.set(currency, available);
                if (available > 0) {
                    hasAvailableCurrency = true;
                    if (!firstAvailableCurrency) firstAvailableCurrency = currency;
                }
            });
            currencySelect.value = availableByCurrency.get('NGN') > 0 ? 'NGN' : firstAvailableCurrency || 'NGN';
            currencySelect.disabled = !hasAvailableCurrency;
            const submitButton = document.querySelector('#commissionPaymentForm button[type="submit"]');
            if (submitButton instanceof HTMLButtonElement) {
                submitButton.disabled = !hasAvailableCurrency;
            }
        }

        const amountInput = document.getElementById('commissionPaymentAmount');
        const updatePaymentAmountLimit = () => {
            if (!(amountInput instanceof HTMLInputElement) || !currencySelect) return;
            const available = availableByCurrency.get(currencySelect.value) || 0;
            amountInput.max = String(available);
            amountInput.placeholder = available > 0 ? `Up to ${available}` : 'No balance available';
            amountInput.setCustomValidity(
                Number(amountInput.value) > available
                    ? 'Amount exceeds the outstanding balance not already submitted for review.'
                    : ''
            );
        };
        if (currencySelect) currencySelect.onchange = updatePaymentAmountLimit;
        updatePaymentAmountLimit();
        if (amountInput instanceof HTMLInputElement && currencySelect) {
            amountInput.oninput = () => {
                amountInput.setCustomValidity(
                    Number(amountInput.value) > (availableByCurrency.get(currencySelect.value) || 0)
                        ? 'Amount exceeds the outstanding balance not already submitted for review.'
                        : ''
                );
            };
        }

        const dueHistory = document.getElementById('providerCommissionDueHistory');
        if (dueHistory) {
            dueHistory.replaceChildren();
            if (!outstandingCommissions.length) {
                const row = dueHistory.insertRow();
                const cell = row.insertCell();
                cell.colSpan = 3;
                cell.className = 'p-3 text-slate-500';
                cell.textContent = 'No outstanding commission.';
            } else {
                outstandingCommissions
                    .slice()
                    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
                    .forEach((commission) => {
                        const row = dueHistory.insertRow();
                        const dueDate = commission.due_at ? new Date(commission.due_at) : null;
                        const allocated = (commission.commission_payment_allocations || [])
                            .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
                        const remaining = Math.max(0, Number(commission.commission_amount || 0) - allocated);
                        const isOverdue = dueDate && dueDate.getTime() <= Date.now();
                        const status = isOverdue ? 'Overdue' : `Due ${dueDate?.toLocaleDateString('en-NG') || 'soon'}`;
                        [
                            dueDate?.toLocaleDateString('en-NG') || 'Due date unavailable',
                            formatPriceInCurrency(remaining, commission.currency_code || 'NGN'),
                            status,
                        ].forEach((value) => {
                            const cell = row.insertCell();
                            cell.className = `border-b p-3${isOverdue ? ' font-semibold text-red-700' : ''}`;
                            cell.textContent = value;
                        });
                    });
            }
        }

        const history = document.getElementById('commissionPaymentHistory');
        if (!history) return;
        history.replaceChildren();
        if (!paymentsResult.data?.length) {
            const row = history.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 4;
            cell.className = 'p-3 text-slate-500';
            cell.textContent = 'No commission payments yet.';
            return;
        }

        paymentsResult.data.forEach((payment) => {
            const row = history.insertRow();
            [
                new Date(payment.created_at).toLocaleDateString('en-NG'),
                payment.reference,
                formatPriceInCurrency(payment.amount, payment.currency_code || 'NGN'),
                payment.status,
            ].forEach((value) => {
                const cell = row.insertCell();
                cell.className = 'border-b p-3';
                cell.textContent = value || '—';
            });
        });
    }

    document.getElementById('commissionPaymentForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const message = document.getElementById('commissionPaymentMessage');
        const currencySelect = document.getElementById('commissionPaymentCurrency');
        const amountInput = document.getElementById('commissionPaymentAmount');
        const referenceInput = document.getElementById('commissionPaymentReference');
        if (
            !(form instanceof HTMLFormElement)
            || !(button instanceof HTMLButtonElement)
            || !(message instanceof HTMLElement)
            || !(currencySelect instanceof HTMLSelectElement)
            || !(amountInput instanceof HTMLInputElement)
            || !(referenceInput instanceof HTMLInputElement)
        ) return;
        if (!form.reportValidity()) return;

        const amount = Number(amountInput.value);
        const currencyCode = currencySelect.value;
        const reference = referenceInput.value.trim();
        if (!Number.isFinite(amount) || amount <= 0 || !currencyCode || !reference) {
            message.className = 'text-sm text-red-700 md:col-span-4';
            message.textContent = 'Enter a valid payment amount, select a currency, and provide the bank transfer reference.';
            return;
        }

        button.disabled = true;
        message.className = 'text-sm text-slate-600 md:col-span-4';
        message.textContent = 'Submitting transfer details...';

        try {
            const { error } = await supabase.rpc('submit_commission_payment', {
                p_amount: amount,
                p_currency_code: currencyCode,
                p_reference: reference,
            });
            if (error) throw error;
            form.reset();
            await loadCommissionSummary();
            message.className = 'text-sm text-green-700 md:col-span-4';
            message.textContent = 'Transfer submitted for admin review. Your balance changes after it is confirmed.';
        } catch (error) {
            console.error('Commission payment submission failed:', error);
            message.className = 'text-sm text-red-700 md:col-span-4';
            message.textContent = error.code === 'PGRST202'
                ? 'Payment submission is not enabled on the server yet. Apply the commission migrations and reload the Supabase API schema.'
                : `Payment details were not submitted: ${error.message || error}`;
        } finally {
            button.disabled = currencySelect.disabled;
        }
    });

    // =========================
    // INIT
    // =========================
    await loadUserProfile();
    await loadServices();
    await loadBookings();
    await loadCommissionPolicy();
    await loadCommissionSummary();

    const refreshDashboard = () => {
        loadServices();
        loadBookings();
    };

    supabase
        .channel(`dashboard-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${user.id}` }, refreshDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_commissions', filter: `provider_id=eq.${user.id}` }, loadCommissionSummary)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_balances', filter: `provider_id=eq.${user.id}` }, loadCommissionSummary)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_payments', filter: `provider_id=eq.${user.id}` }, loadCommissionSummary)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'services', filter: `provider_id=eq.${user.id}` }, refreshDashboard)
        .subscribe();

});
