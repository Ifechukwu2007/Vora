/* ============================================================
   VORA ADMIN DASHBOARD
   admin.js

   ADMIN ACCESS:
   Supabase Auth user
          ↓
       users table
          ↓
       role = "admin"
          ↓
     ADMIN DASHBOARD
   ============================================================ */


/* ============================================================
   1. SUPABASE
   ============================================================ */

const supabaseUrl =
    "https://bbjyfmgisxzjruqkjxlo.supabase.co";

const supabaseKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJianlmbWdpc3h6anJ1cWtqeGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2Njk1NzUsImV4cCI6MjA5NDI0NTU3NX0.mF5_W7ZgMsWvb6YY0wRD2dPuAw_37TmMWP2_NkMap0E";


if (!window.supabase) {
    throw new Error(
        "Supabase library was not loaded."
    );
}


const supabase =
    window.supabase.createClient(
        supabaseUrl,
        supabaseKey
    );


/* ============================================================
   2. STATE
   ============================================================ */

const state = {

    user: null,

    userRecord: null,

    currentSection: "dashboard",

    users: [],

    providers: [],

    customers: [],

    services: [],

    bookings: [],

    payments: [],

    reviews: [],

    settings: null,

    editContext: null

};


/* ============================================================
   3. HELPERS
   ============================================================ */

const $ = (id) =>
    document.getElementById(id);


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleString(
        "en-NG",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}


function formatMoney(value) {

    const amount =
        Number(value || 0);

    return `₦${amount.toLocaleString(
        "en-NG",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )}`;
}


function shortId(value) {

    if (!value) {
        return "—";
    }

    const text =
        String(value);

    if (text.length <= 12) {
        return text;
    }

    return (
        text.slice(0, 8) +
        "…" +
        text.slice(-4)
    );
}


function normalizeRole(user) {

    return String(
        user?.role ??
        user?.user_role ??
        user?.account_type ??
        ""
    )
        .trim()
        .toLowerCase();
}


function isAdmin(user) {

    return normalizeRole(user) === "admin";
}


function showError(message) {

    console.error(
        "Vora Admin:",
        message
    );

    const warning =
        $("admin-access-warning");

    if (!warning) {
        return;
    }

    warning.textContent =
        message;

    warning.classList.remove(
        "hidden"
    );
}


function clearError() {

    const warning =
        $("admin-access-warning");

    if (!warning) {
        return;
    }

    warning.textContent = "";

    warning.classList.add(
        "hidden"
    );
}


function setLoading(
    button,
    loading,
    text = "Loading..."
) {

    if (!button) {
        return;
    }

    if (loading) {

        button.dataset.originalText =
            button.innerHTML;

        button.disabled = true;

        button.innerHTML = `
            <span
                class="loader inline-block mr-2 align-middle"
            ></span>
            ${escapeHTML(text)}
        `;

    } else {

        button.disabled =
            false;

        button.innerHTML =
            button.dataset.originalText ||
            "Save";
    }
}


function renderLoading(
    tbody,
    colspan
) {

    if (!tbody) {
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td
                colspan="${colspan}"
                class="px-6 py-10 text-center text-gray-500"
            >
                <div class="loader mx-auto mb-3"></div>
                Loading...
            </td>
        </tr>
    `;
}


function renderEmpty(
    tbody,
    colspan,
    message = "No records found."
) {

    if (!tbody) {
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td
                colspan="${colspan}"
                class="px-6 py-10 text-center text-gray-500"
            >
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}


async function safeQuery(
    promise,
    label
) {

    const result =
        await promise;

    if (result.error) {

        console.error(
            label,
            result.error
        );

        throw new Error(
            `${label}: ${result.error.message}`
        );
    }

    return result.data;
}


/* ============================================================
   4. STATUS BADGE
   ============================================================ */

function statusBadge(status) {

    const value =
        String(
            status || "unknown"
        )
            .trim()
            .toLowerCase();


    let classes =
        "bg-gray-100 text-gray-700";


    if (
        [
            "active",
            "approved",
            "completed",
            "success",
            "successful",
            "paid",
            "verified",
            "confirmed"
        ].includes(value)
    ) {

        classes =
            "bg-green-100 text-green-700";
    }


    if (
        [
            "pending",
            "processing",
            "awaiting",
            "in_progress",
            "pending_payment"
        ].includes(value)
    ) {

        classes =
            "bg-yellow-100 text-yellow-700";
    }


    if (
        [
            "cancelled",
            "canceled",
            "failed",
            "rejected",
            "declined",
            "inactive",
            "refunded"
        ].includes(value)
    ) {

        classes =
            "bg-red-100 text-red-700";
    }


    return `
        <span
            class="
                inline-flex
                px-2.5
                py-1
                rounded-full
                text-xs
                font-semibold
                ${classes}
            "
        >
            ${escapeHTML(
                status || "Unknown"
            )}
        </span>
    `;
}

function adminActionButtons(type, id) {
    if (!id) return "";
    return `<button type="button" data-admin-action="edit" data-admin-type="${escapeHTML(type)}" data-admin-id="${escapeHTML(id)}" class="rounded-lg border border-green-200 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50">Edit</button>`;
}

function addTableActions(tbody, type, rows) {
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach((row, index) => {
        if (row.querySelector("[data-admin-action]")) return;
        const id = rows[index]?.id;
        if (!id) return;
        const cell = document.createElement("td");
        cell.className = "px-6 py-4 text-right";
        cell.innerHTML = adminActionButtons(type, id);
        row.appendChild(cell);
    });
}


/* ============================================================
   5. AUTHENTICATION
   ============================================================ */

async function getCurrentUser() {

    const {
        data,
        error
    } =
        await supabase.auth.getUser();

    if (error) {
        throw error;
    }

    return data?.user || null;
}


/* ============================================================
   6. GET USER FROM USERS TABLE
   ============================================================ */

async function getUserRecord(
    authUserId
) {

    if (!authUserId) {
        return null;
    }


    /*
       Primary structure:

       users.id = auth.users.id
    */

    let result =
        await supabase
            .from("users")
            .select("*")
            .eq(
                "id",
                authUserId
            )
            .maybeSingle();


    if (
        !result.error &&
        result.data
    ) {

        return result.data;
    }


    /*
       Fallback in case your
       users table uses user_id.
    */

    result =
        await supabase
            .from("users")
            .select("*")
            .eq(
                "user_id",
                authUserId
            )
            .maybeSingle();


    if (result.error) {
        throw result.error;
    }


    return result.data || null;
}


/* ============================================================
   7. REQUIRE ADMIN
   ============================================================ */

async function requireAdmin() {

    clearError();


    const user =
        await getCurrentUser();


    if (!user) {

        showLogin();

        return false;
    }


    state.user =
        user;


    const userRecord =
        await getUserRecord(
            user.id
        );


    if (!userRecord) {

        await supabase.auth.signOut();

        showLogin();

        const loginError =
            $("loginError");

        if (loginError) {

            loginError.textContent =
                "Your user account could not be found.";

            loginError.classList.remove(
                "hidden"
            );
        }

        return false;
    }


    state.userRecord =
        userRecord;


    /*
       THIS IS THE IMPORTANT PART.

       We check users.role.

       No profiles table.
       No admins table.
    */

    if (
        !isAdmin(
            userRecord
        )
    ) {

        await supabase.auth.signOut();

        showLogin();

        const loginError =
            $("loginError");

        if (loginError) {

            loginError.textContent =
                "Access denied. This account is not an administrator.";

            loginError.classList.remove(
                "hidden"
            );
        }

        return false;
    }


    showAdmin();


    return true;
}


/* ============================================================
   8. LOGIN SCREEN
   ============================================================ */

function showLogin() {
    /*
       The admin page has no public login screen. Admins must first sign
       in through the normal Vora site; everyone else is sent to 404.
    */
    window.location.replace("404.html");
}


function showAdmin() {

    $("loginScreen")
        ?.classList
        .add("hidden");


    $("adminApp")
        ?.classList
        .remove("hidden");
}


/* ============================================================
   9. LOGIN
   ============================================================ */

async function login(
    email,
    password
) {

    if (!email) {

        throw new Error(
            "Enter your email address."
        );
    }


    if (!password) {

        throw new Error(
            "Enter your password."
        );
    }


    const {
        data,
        error
    } =
        await supabase.auth
            .signInWithPassword({
                email,
                password
            });


    if (error) {
        throw error;
    }


    state.user =
        data.user;


    const allowed =
        await requireAdmin();


    if (!allowed) {

        throw new Error(
            "This account does not have administrator access."
        );
    }


    await loadDashboard();
}


/* ============================================================
   10. LOGOUT
   ============================================================ */

async function logout() {

    const {
        error
    } =
        await supabase.auth.signOut();


    if (error) {

        console.error(
            "Logout:",
            error
        );
    }


    state.user = null;

    state.userRecord = null;


    showLogin();
}


/* ============================================================
   11. NAVIGATION
   ============================================================ */

window.showSection =
    async function(section) {

        const sections = [
            "dashboard",
            "providers",
            "customers",
            "services",
            "bookings",
            "payments",
            "reviews",
            "settings"
        ];


        if (
            !sections.includes(
                section
            )
        ) {
            return;
        }


        state.currentSection =
            section;


        sections.forEach(
            name => {

                const element =
                    $(
                        `${name}Section`
                    );


                if (!element) {
                    return;
                }


                element.classList.toggle(
                    "hidden-section",
                    name !== section
                );
            }
        );


        document
            .querySelectorAll(
                "[data-section]"
            )
            .forEach(
                button => {

                    button.classList.toggle(
                        "active",
                        button.dataset.section ===
                        section
                    );
                }
            );


        /*
           Close mobile menu.
        */

        $("adminSidebar")
            ?.classList
            .add(
                "-translate-x-full"
            );


        $("mobileOverlay")
            ?.classList
            .add(
                "hidden"
            );


        switch (section) {

            case "dashboard":
                await loadDashboard();
                break;

            case "providers":
                await loadProviders();
                break;

            case "customers":
                await loadCustomers();
                break;

            case "services":
                await loadServices();
                break;

            case "bookings":
                await loadBookings();
                break;

            case "payments":
                await loadPayments();
                break;

            case "reviews":
                await loadReviews();
                break;

            case "notifications":
                try {
                    await loadNotificationRecipients();
                } catch (error) {
                    const status = $("notificationStatus");
                    if (status) {
                        status.className = "text-sm text-red-700";
                        status.textContent = `Could not load users: ${error.message}`;
                    }
                }
                break;

            case "settings":
                await loadSettings();
                break;
        }
    };


/* ============================================================
   12. COUNT ROWS
   ============================================================ */

async function countRows(
    table
) {

    const {
        count,
        error
    } =
        await supabase
            .from(table)
            .select("*", {
                count: "exact",
                head: true
            });


    if (error) {

        console.error(
            `Count ${table}:`,
            error
        );

        return 0;
    }


    return count || 0;
}


/* ============================================================
   13. COUNT USERS BY ROLE
   ============================================================ */

async function countUsersByRole(
    role
) {

    const {
        count,
        error
    } =
        await supabase
            .from("users")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq(
                "role",
                role
            );


    if (error) {

        console.error(
            `Count role ${role}:`,
            error
        );

        return 0;
    }


    return count || 0;
}


/* ============================================================
   14. DASHBOARD
   ============================================================ */

async function loadDashboard() {

    try {

        clearError();


        const [
            users,
            providers,
            services,
            bookings
        ] =
            await Promise.all([

                countRows("users"),

                countUsersByRole(
                    "provider"
                ),

                countRows(
                    "services"
                ),

                countRows(
                    "bookings"
                )

            ]);


        $("statUsers")
            &&
            (
                $("statUsers")
                    .textContent =
                    users
            );


        $("statProviders")
            &&
            (
                $("statProviders")
                    .textContent =
                    providers
            );


        $("statServices")
            &&
            (
                $("statServices")
                    .textContent =
                    services
            );


        $("statBookings")
            &&
            (
                $("statBookings")
                    .textContent =
                    bookings
            );


        await loadRecentBookings();


    } catch (error) {

        console.error(
            "Dashboard error:",
            error
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   15. RECENT BOOKINGS
   ============================================================ */

async function loadRecentBookings() {

    const tbody =
        $("recentBookingsTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        5
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("bookings")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                    .limit(10),

                "Loading recent bookings"

            );


        if (
            !rows ||
            !rows.length
        ) {

            renderEmpty(
                tbody,
                5,
                "No bookings yet."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    booking => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                booking.service_title ||
                                booking.service_name ||
                                booking.title ||
                                shortId(
                                    booking.service_id
                                )
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                booking.customer_name ||
                                booking.full_name ||
                                shortId(
                                    booking.customer_id ||
                                    booking.user_id
                                )
                            )}

                        </td>

                        <td class="px-6 py-4 font-medium">

                            ${formatMoney(
                                booking.total_amount ??
                                booking.amount ??
                                booking.price ??
                                0
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${formatDate(
                                booking.created_at ||
                                booking.booking_date ||
                                booking.scheduled_at
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${statusBadge(
                                booking.status ||
                                booking.booking_status
                            )}

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            5,
            "Could not load bookings."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   16. PROVIDERS
   ============================================================ */

async function loadProviders() {

    const tbody =
        $("providersTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        5
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("users")
                    .select("*")
                    .eq(
                        "role",
                        "provider"
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading providers"

            );


        state.providers =
            rows || [];


        if (
            !rows ||
            !rows.length
        ) {

            renderEmpty(
                tbody,
                5,
                "No providers found."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    provider => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${escapeHTML(
                                provider.business_name ||
                                provider.full_name ||
                                provider.name ||
                                "Unnamed provider"
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                provider.email ||
                                "—"
                            )}

                        </td>

                        <td class="px-6 py-4 text-right">
                            ${adminActionButtons("user", provider.id || provider.user_id)}
                        </td>

                        <td class="px-6 py-4">

                            ${statusBadge(
                                provider.status ||
                                provider.account_status ||
                                "active"
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${
                                provider.is_verified === true ||
                                provider.verified === true ||
                                provider.verification_status ===
                                "verified"

                                ?

                                `
                                <span
                                    class="text-green-600 font-semibold"
                                >
                                    Verified
                                </span>
                                `

                                :

                                `
                                <span
                                    class="text-gray-500"
                                >
                                    Not verified
                                </span>
                                `
                            }

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            5,
            "Could not load providers."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   17. CUSTOMERS
   ============================================================ */

async function loadCustomers() {

    const tbody =
        $("customersTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        5
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("users")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading users"

            );


        const customers =
            (rows || [])
                .filter(
                    user =>
                        ![
                            "provider",
                            "admin"
                        ].includes(
                            normalizeRole(
                                user
                            )
                        )
                );


        state.customers =
            customers;


        if (!customers.length) {

            renderEmpty(
                tbody,
                5,
                "No customers found."
            );

            return;
        }


        tbody.innerHTML =
            customers
                .map(
                    customer => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${escapeHTML(
                                customer.full_name ||
                                customer.name ||
                                "Unnamed"
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                customer.email ||
                                "—"
                            )}

                        </td>

                        <td class="px-6 py-4 text-right">
                            ${adminActionButtons("user", customer.id || customer.user_id)}
                        </td>

                        <td
                            class="px-6 py-4 capitalize"
                        >

                            ${escapeHTML(
                                customer.role ||
                                "customer"
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${formatDate(
                                customer.created_at
                            )}

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            5,
            "Could not load customers."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   18. SERVICES
   ============================================================ */

async function loadServices() {

    const tbody =
        $("servicesTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        5
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("services")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading services"

            );


        state.services =
            rows || [];


        if (!rows.length) {

            renderEmpty(
                tbody,
                5,
                "No services found."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    service => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${escapeHTML(
                                service.title ||
                                service.name ||
                                "Untitled service"
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                service.provider_name ||
                                service.provider_business_name ||
                                shortId(
                                    service.provider_id ||
                                    service.user_id
                                )
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                service.category ||
                                service.category_name ||
                                "—"
                            )}

                        </td>

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${formatMoney(
                                service.price ??
                                service.base_price ??
                                service.amount ??
                                0
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${statusBadge(
                                service.status ||
                                (
                                    service.is_active === false
                                        ? "inactive"
                                        : "active"
                                )
                            )}

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            5,
            "Could not load services."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   19. BOOKINGS
   ============================================================ */

async function loadBookings() {

    const tbody =
        $("bookingsTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        6
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("bookings")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading bookings"

            );


        state.bookings =
            rows || [];


        if (!rows.length) {

            renderEmpty(
                tbody,
                6,
                "No bookings found."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    booking => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td
                            class="px-6 py-4 font-mono text-xs"
                        >

                            ${escapeHTML(
                                shortId(
                                    booking.id
                                )
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                booking.customer_name ||
                                booking.full_name ||
                                shortId(
                                    booking.customer_id ||
                                    booking.user_id
                                )
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${escapeHTML(
                                booking.service_title ||
                                booking.service_name ||
                                shortId(
                                    booking.service_id
                                )
                            )}

                        </td>

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${formatMoney(
                                booking.total_amount ??
                                booking.amount ??
                                booking.price ??
                                0
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${formatDate(
                                booking.scheduled_at ||
                                booking.booking_date ||
                                booking.created_at
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${statusBadge(
                                booking.status ||
                                booking.booking_status
                            )}

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            6,
            "Could not load bookings."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   20. PAYMENTS
   ============================================================ */

async function loadPayments() {

    const tbody =
        $("paymentsTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        4
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("payments")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading payments"

            );


        state.payments =
            rows || [];


        if (!rows.length) {

            renderEmpty(
                tbody,
                4,
                "No payments found."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    payment => `

                    <tr
                        class="border-t hover:bg-gray-50"
                    >

                        <td
                            class="px-6 py-4 font-mono text-xs"
                        >

                            ${escapeHTML(
                                payment.reference ||
                                payment.transaction_reference ||
                                payment.paystack_reference ||
                                shortId(
                                    payment.id
                                )
                            )}

                        </td>

                        <td
                            class="px-6 py-4 font-medium"
                        >

                            ${formatMoney(
                                payment.amount ??
                                payment.total_amount ??
                                0
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${statusBadge(
                                payment.status ||
                                payment.payment_status
                            )}

                        </td>

                        <td class="px-6 py-4">

                            ${formatDate(
                                payment.created_at
                            )}

                        </td>

                    </tr>

                    `
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            4,
            "Could not load payments."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   21. REVIEWS
   ============================================================ */

async function loadReviews() {

    const tbody =
        $("reviewsTable");


    if (!tbody) {
        return;
    }


    renderLoading(
        tbody,
        4
    );


    try {

        const rows =
            await safeQuery(

                supabase
                    .from("reviews")
                    .select("*")
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    ),

                "Loading reviews"

            );


        state.reviews =
            rows || [];


        if (!rows.length) {

            renderEmpty(
                tbody,
                4,
                "No reviews found."
            );

            return;
        }


        tbody.innerHTML =
            rows
                .map(
                    review => {

                        const rating =
                            Math.max(
                                0,
                                Math.min(
                                    5,
                                    Number(
                                        review.rating || 0
                                    )
                                )
                            );


                        return `

                        <tr
                            class="border-t hover:bg-gray-50"
                        >

                            <td
                                class="px-6 py-4"
                            >

                                <span
                                    class="text-yellow-500"
                                >
                                    ${"★".repeat(
                                        rating
                                    )}
                                </span>

                                <span
                                    class="text-gray-500 ml-1"
                                >
                                    ${escapeHTML(
                                        review.rating ??
                                        0
                                    )}/5
                                </span>

                            </td>

                            <td
                                class="px-6 py-4"
                            >

                                ${escapeHTML(
                                    review.comment ||
                                    review.review ||
                                    review.text ||
                                    "No comment"
                                )}

                            </td>

                            <td
                                class="px-6 py-4"
                            >

                                ${escapeHTML(
                                    review.customer_name ||
                                    review.user_name ||
                                    shortId(
                                        review.user_id ||
                                        review.customer_id
                                    )
                                )}

                            </td>

                            <td
                                class="px-6 py-4"
                            >

                                ${formatDate(
                                    review.created_at
                                )}

                            </td>

                        </tr>

                        `;
                    }
                )
                .join("");


    } catch (error) {

        renderEmpty(
            tbody,
            4,
            "Could not load reviews."
        );

        showError(
            error.message
        );
    }
}


/* ============================================================
   22. SETTINGS
   ============================================================ */

async function loadSettings() {

    try {

        const {
            data,
            error
        } =
            await supabase
                .from("settings")
                .select("*")
                .eq("id", "platform")
                .limit(1)
                .maybeSingle();


        if (error) {

            /*
               If settings table doesn't exist,
               don't crash the whole dashboard.
            */

            console.warn(
                "Settings:",
                error.message
            );

            return;
        }


        state.settings =
            data;


        if (!data) {
            return;
        }


        const commission =
            data.commission ??
            data.platform_commission ??
            data.commission_percentage ??
            data.built_in_margin;


        if (
            commission !== undefined &&
            $("commission")
        ) {

            $("commission").value =
                commission;
        }

<<<<<<< HEAD
        if (data.paypal_ngn_per_usd !== undefined && $("paypalUsdRate")) {
            $("paypalUsdRate").value = data.paypal_ngn_per_usd;
        }


=======
>>>>>>> b251aaf (deleted:    REQUEST_POOL_BACKEND.md)
    } catch (error) {

        console.error(
            "Settings error:",
            error
        );
    }
}


/* ============================================================
   23. SAVE SETTINGS
   ============================================================ */

async function saveSettings(
    event
) {

    event.preventDefault();


    const input =
        $("commission");


    if (!input) {
        return;
    }


    const commission =
        Number(
            input.value
        );

<<<<<<< HEAD
    const paypalUsdRate = Number($("paypalUsdRate")?.value);


=======
>>>>>>> b251aaf (deleted:    REQUEST_POOL_BACKEND.md)
    if (
        !Number.isFinite(
            commission
        ) ||
        commission < 0 ||
        commission > 100
    ) {

        alert(
            "Commission must be between 0 and 100."
        );

        return;
    }

<<<<<<< HEAD
    if (!Number.isFinite(paypalUsdRate) || paypalUsdRate <= 0) {
        alert("PayPal USD rate must be greater than zero.");
        return;
    }


=======
>>>>>>> b251aaf (deleted:    REQUEST_POOL_BACKEND.md)
    const button =
        event.submitter ||
        event.target.querySelector(
            "button[type='submit']"
        );


    setLoading(
        button,
        true,
        "Saving..."
    );


    try {

        const {
            data: existing,
            error: findError
        } =
            await supabase
                .from("settings")
                .select("*")
                .eq("id", "platform")
                .limit(1)
                .maybeSingle();


        if (findError) {
            throw findError;
        }


        /*
           Update existing settings.
        */

        if (existing?.id) {

            const {
                error
            } =
                await supabase
                    .from("settings")
                    .update({
                        commission:
                            commission,

                        platform_commission:
                            commission,

                        built_in_margin:
                            commission,

<<<<<<< HEAD
                        paypal_ngn_per_usd:
                            paypalUsdRate,

=======
>>>>>>> b251aaf (deleted:    REQUEST_POOL_BACKEND.md)
                        updated_at:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        "id",
                        existing.id
                    );


            if (error) {
                throw error;
            }


        } else {

            /*
               Create settings row.
            */

            const {
                error
            } =
                await supabase
                    .from("settings")
                    .insert({
                        id: "platform",

                        commission:
                            commission,

                        platform_commission:
                            commission,

                        built_in_margin:
                            commission,

<<<<<<< HEAD
                        paypal_ngn_per_usd:
                            paypalUsdRate
=======
>>>>>>> b251aaf (deleted:    REQUEST_POOL_BACKEND.md)
                    });


            if (error) {
                throw error;
            }
        }


        alert(
            "Settings saved successfully."
        );


        await loadSettings();


    } catch (error) {

        console.error(
            "Save settings:",
            error
        );


        alert(
            `Could not save settings: ${error.message}`
        );


    } finally {

        setLoading(
            button,
            false
        );
    }
}


/* ============================================================
   24. LOGIN FORM
   ============================================================ */

function setupLogin() {

    const form =
        $("loginForm");


    if (!form) {
        return;
    }


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const email =
                $("loginEmail")
                    ?.value
                    .trim();


            const password =
                $("loginPassword")
                    ?.value;


            const errorElement =
                $("loginError");


            const button =
                $("loginButton") ||
                form.querySelector(
                    "button[type='submit']"
                );


            if (errorElement) {

                errorElement.textContent =
                    "";

                errorElement.classList.add(
                    "hidden"
                );
            }


            setLoading(
                button,
                true,
                "Signing in..."
            );


            try {

                await login(
                    email,
                    password
                );


            } catch (error) {

                console.error(
                    "Login error:",
                    error
                );


                if (errorElement) {

                    errorElement.textContent =
                        error.message ||
                        "Unable to sign in.";

                    errorElement.classList.remove(
                        "hidden"
                    );
                }


            } finally {

                setLoading(
                    button,
                    false
                );
            }
        }
    );
}


/* ============================================================
   25. SETTINGS FORM
   ============================================================ */

function setupSettings() {

    const form =
        $("settingsForm");


    if (!form) {
        return;
    }


    form.addEventListener(
        "submit",
        saveSettings
    );
}


/* ============================================================
   26. LOGOUT BUTTON
   ============================================================ */

function setupLogout() {

    const button =
        $("logoutButton");


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        logout
    );
}

function getAdminRecord(type, id) {
    const collections = { user: [...state.providers, ...state.customers], service: state.services, booking: state.bookings, payment: state.payments, review: state.reviews };
    return (collections[type] || []).find(item => String(item.id || item.user_id) === String(id));
}

function closeAdminEditModal() {
    $("adminEditModal")?.classList.add("hidden");
    $("adminEditModal")?.classList.remove("flex");
    state.editContext = null;
}

window.closeAdminEditModal = closeAdminEditModal;

function openAdminEditModal(type, id) {
    const record = getAdminRecord(type, id);
    if (!record) return showError("This record is no longer available. Please refresh the list.");
    const fieldsByType = {
        user: ["full_name", "business_name", "email", "role", "status", "is_verified"],
        service: ["title", "name", "category", "price", "base_price", "status", "is_active"],
        booking: ["status", "booking_status", "scheduled_at", "booking_date"],
        payment: ["status", "payment_status"],
        review: ["rating", "comment", "review"]
    };
    const fields = fieldsByType[type].filter(field => Object.prototype.hasOwnProperty.call(record, field));
    if (!fields.length) return showError("No editable fields were found for this record.");
    state.editContext = { type, id: record.id || record.user_id, idColumn: record.id ? "id" : "user_id", fields };
    $("adminEditTitle").textContent = `Edit ${type}`;
    $("adminEditFields").innerHTML = fields.map(field => {
        const value = record[field] ?? "";
        const label = field.replace(/_/g, " ");
        if (typeof value === "boolean") return `<label class="flex items-center gap-3 py-2 capitalize"><input name="${escapeHTML(field)}" type="checkbox" ${value ? "checked" : ""} /> ${escapeHTML(label)}</label>`;
        if (field === "role" || field === "status" || field === "booking_status" || field === "payment_status") return `<label class="block capitalize text-sm font-medium mb-1">${escapeHTML(label)}<input name="${escapeHTML(field)}" value="${escapeHTML(value)}" class="mt-2 w-full rounded-xl border px-3 py-2" required /></label>`;
        const inputType = field === "price" || field === "base_price" || field === "rating" ? "number" : field.includes("date") || field === "scheduled_at" ? "datetime-local" : "text";
        const formatted = inputType === "datetime-local" && value ? new Date(value).toISOString().slice(0, 16) : value;
        return `<label class="block capitalize text-sm font-medium mb-1">${escapeHTML(label)}<input name="${escapeHTML(field)}" type="${inputType}" value="${escapeHTML(formatted)}" class="mt-2 w-full rounded-xl border px-3 py-2" ${field === "rating" ? "min=0 max=5 step=1" : ""} /></label>`;
    }).join("");
    $("adminEditModal").classList.remove("hidden");
    $("adminEditModal").classList.add("flex");
}

function setupAdminManagement() {
    document.addEventListener("click", event => {
        const button = event.target.closest("[data-admin-action='edit']");
        if (button) openAdminEditModal(button.dataset.adminType, button.dataset.adminId);
    });
    $("adminEditForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const context = state.editContext;
        if (!context) return;
        const data = new FormData(event.currentTarget);
        const changes = Object.fromEntries(context.fields.map(field => [field, data.has(field) ? data.get(field) : false]));
        context.fields.forEach(field => { if (["price", "base_price", "rating"].includes(field) && changes[field] !== "") changes[field] = Number(changes[field]); });
        const table = context.type === "user" ? "users" : `${context.type}s`;
        const { error } = await supabase.from(table).update(changes).eq(context.idColumn || "id", context.id);
        if (error) return showError(`Could not save changes: ${error.message}`);
        closeAdminEditModal();
        await window.showSection(state.currentSection);
    });
    const tables = { providersTable: ["user", () => state.providers], customersTable: ["user", () => state.customers], servicesTable: ["service", () => state.services], bookingsTable: ["booking", () => state.bookings], paymentsTable: ["payment", () => state.payments], reviewsTable: ["review", () => state.reviews] };
    new MutationObserver(() => Object.entries(tables).forEach(([id, [type, rows]]) => addTableActions($(id), type, rows()))).observe(document.body, { childList: true, subtree: true });
}

async function loadNotificationRecipients() {
    const select = $("notificationRecipient");
    if (!select) return;
    const users = await safeQuery(supabase.from("users").select("*").order("created_at", { ascending: false }), "Loading notification recipients");
    state.users = users || [];
    select.innerHTML = `<option value="all">All users</option>${state.users.filter(user => !isAdmin(user)).map(user => `<option value="${escapeHTML(user.id || user.user_id)}">${escapeHTML(user.full_name || user.business_name || user.email || "Unnamed user")} — ${escapeHTML(user.email || "no email")}</option>`).join("")}`;
}

function setupNotifications() {
    $("sendNotificationButton")?.addEventListener("click", () => window.showSection("notifications"));

    $("notificationForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const status = $("notificationStatus");
        const button = form.querySelector("button[type='submit']");
        const recipient = $("notificationRecipient").value;
        const title = $("notificationTitle").value.trim();
        const message = $("notificationMessage").value.trim();
        const recipients = recipient === "all" ? state.users.filter(user => !isAdmin(user)).map(user => user.id || user.user_id) : [recipient];
        if (!recipients.length) {
            if (status) status.textContent = "There are no eligible recipients.";
            return;
        }

        setLoading(button, true, "Sending...");
        if (status) status.textContent = "";
        try {
            const { error } = await supabase.from("notifications").insert(recipients.map(user_id => ({ user_id, type: "update", title, message, sender_id: state.user?.id || null, read: false, created_at: new Date().toISOString() })));
            if (error) throw error;
            form.reset();
            if (status) {
                status.className = "text-sm text-green-700";
                status.textContent = `Notification sent to ${recipients.length} user${recipients.length === 1 ? "" : "s"}.`;
            }
        } catch (error) {
            console.error("Send notification:", error);
            if (status) {
                status.className = "text-sm text-red-700";
                status.textContent = error.code === "42501" ? "Notifications are blocked by Supabase RLS. Apply the admin notifications migration." : `Could not send notification: ${error.message || "Unknown error"}`;
            }
        } finally {
            setLoading(button, false);
        }
    });
}


/* ============================================================
   27. MOBILE SIDEBAR
   ============================================================ */

function setupMobileMenu() {

    const menu =
        $("mobileMenuButton");

    const sidebar =
        $("adminSidebar");

    const overlay =
        $("mobileOverlay");


    if (!menu || !sidebar) {
        return;
    }


    menu.addEventListener(
        "click",
        () => {

            sidebar.classList.remove(
                "-translate-x-full"
            );

            overlay?.classList.remove(
                "hidden"
            );
        }
    );


    overlay?.addEventListener(
        "click",
        () => {

            sidebar.classList.add(
                "-translate-x-full"
            );

            overlay.classList.add(
                "hidden"
            );
        }
    );
}


/* ============================================================
   28. AUTH STATE LISTENER
   ============================================================ */

function setupAuthListener() {

    supabase.auth
        .onAuthStateChange(
            async (
                event,
                session
            ) => {

                console.log(
                    "Auth event:",
                    event
                );


                if (
                    event ===
                    "SIGNED_OUT"
                ) {

                    state.user =
                        null;

                    state.userRecord =
                        null;

                    showLogin();

                    return;
                }


                if (
                    (
                        event ===
                        "SIGNED_IN"
                    ) ||
                    (
                        event ===
                        "INITIAL_SESSION"
                    )
                ) {

                    if (
                        session?.user
                    ) {

                        try {

                            const allowed =
                                await requireAdmin();


                            if (allowed) {

                                await loadDashboard();

                            }


                        } catch (error) {

                            console.error(
                                "Auth initialization:",
                                error
                            );

                            showLogin();

                            showError(
                                error.message
                            );
                        }


                    } else {

                        showLogin();
                    }
                }
            }
        );
}


/* ============================================================
   29. REALTIME UPDATES
   ============================================================ */

function setupRealtime() {


    /*
       BOOKINGS
    */

    supabase
        .channel(
            "admin-bookings"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "bookings"
            },
            async () => {

                if (
                    state.currentSection ===
                    "dashboard"
                ) {

                    await loadDashboard();

                } else if (
                    state.currentSection ===
                    "bookings"
                ) {

                    await loadBookings();
                }
            }
        )
        .subscribe();


    /*
       USERS
    */

    supabase
        .channel(
            "admin-users"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "users"
            },
            async () => {

                if (
                    state.currentSection ===
                    "providers"
                ) {

                    await loadProviders();

                } else if (
                    state.currentSection ===
                    "customers"
                ) {

                    await loadCustomers();

                } else if (
                    state.currentSection ===
                    "dashboard"
                ) {

                    await loadDashboard();
                }
            }
        )
        .subscribe();


    /*
       SERVICES
    */

    supabase
        .channel(
            "admin-services"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "services"
            },
            async () => {

                if (
                    state.currentSection ===
                    "services"
                ) {

                    await loadServices();
                }
            }
        )
        .subscribe();


    /*
       PAYMENTS
    */

    supabase
        .channel(
            "admin-payments"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "payments"
            },
            async () => {

                if (
                    state.currentSection ===
                    "payments"
                ) {

                    await loadPayments();
                }
            }
        )
        .subscribe();


    /*
       REVIEWS
    */

    supabase
        .channel(
            "admin-reviews"
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "reviews"
            },
            async () => {

                if (
                    state.currentSection ===
                    "reviews"
                ) {

                    await loadReviews();
                }
            }
        )
        .subscribe();
}


/* ============================================================
   30. INITIALIZATION
   ============================================================ */

async function init() {

    try {

        setupLogin();

        setupSettings();

        setupLogout();

        setupAdminManagement();

        setupNotifications();

        setupMobileMenu();

        setupAuthListener();

        setupRealtime();


        /*
           Check existing Supabase session.
        */

        const allowed =
            await requireAdmin();


        if (allowed) {

            await loadDashboard();

        }


    } catch (error) {

        console.error(
            "Vora Admin initialization failed:",
            error
        );


        showLogin();


        const loginError =
            $("loginError");


        if (loginError) {

            loginError.textContent =
                error.message ||
                "Unable to initialize admin dashboard.";

            loginError.classList.remove(
                "hidden"
            );
        }
    }
}


/* ============================================================
   31. START
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    init
);


/* ============================================================
   32. DEBUG API
   ============================================================ */

window.VoraAdmin = {

    supabase,

    state,

    login,

    logout,

    requireAdmin,

    loadDashboard,

    loadProviders,

    loadCustomers,

    loadServices,

    loadBookings,

    loadPayments,

    loadReviews,

    loadSettings

};
