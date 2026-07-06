import { supabase } from "./supabase.js";

const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
    : '';

function buildGoogleMapsUrl(origin, destination) {
    if (!destination) return 'https://www.google.com/maps';

    const originParam = Array.isArray(origin)
        ? `${origin[1]},${origin[0]}`
        : encodeURIComponent(origin || '');
    const destinationParam = Array.isArray(destination)
        ? `${destination[1]},${destination[0]}`
        : encodeURIComponent(destination);

    if (originParam && destinationParam) {
        return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&travelmode=driving`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${destinationParam}`;
}

let currentUser = null;
let selectedRating = 0;
let selectedBooking = null;
let locationWatchers = new Map();

async function watchUserLocation(mapContainer, callback) {
    if (!navigator.geolocation) {
        console.warn('Geolocation not available');
        return null;
    }

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const coords = [
                Number(position.coords.longitude),
                Number(position.coords.latitude)
            ];
            callback(coords);
        },
        (error) => {
            console.error('Geolocation error:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    locationWatchers.set(mapContainer, watchId);
    return watchId;
}

function stopWatchingLocation(mapContainer) {
    const watchId = locationWatchers.get(mapContainer);
    if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
        locationWatchers.delete(mapContainer);
    }
}

async function geocodeAddress(address) {
    if (!MAPTILER_KEY || !address) return null;

    try {
        const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${MAPTILER_KEY}&limit=1`);
        const data = await response.json();
        if (!data?.features?.length) return null;
        return data.features[0].geometry.coordinates;
    } catch (error) {
        console.error('MapTiler geocoding failed:', error);
        return null;
    }
}

async function getCurrentPosition() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => resolve([
                Number(position.coords.longitude),
                Number(position.coords.latitude),
            ]),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    });
}

async function getDirections(origin, destination) {
    if (!MAPTILER_KEY || !origin || !destination) return null;

    try {
        const response = await fetch(
            `https://api.maptiler.com/directions/driving/car.json?key=${MAPTILER_KEY}&start=${origin[0]},${origin[1]}&end=${destination[0]},${destination[1]}&geometries=geojson&overview=full`
        );
        const data = await response.json();
        return data?.routes?.[0] || null;
    } catch (error) {
        console.error('MapTiler directions failed:', error);
        return null;
    }
}

async function renderBookingMap(container, location) {
    if (!container || !location) {
        container.innerHTML = '<div class="h-40 flex items-center justify-center text-sm text-gray-500">Location unavailable</div>';
        return;
    }

    if (!MAPTILER_KEY) {
        container.innerHTML = '<div class="h-40 flex items-center justify-center text-sm text-gray-500">Map unavailable</div>';
        return;
    }

    container.innerHTML = '<div class="h-40 flex items-center justify-center text-sm text-gray-500">Loading map...</div>';

    const destination = await geocodeAddress(location);
    if (!destination) {
        container.innerHTML = '<div class="h-40 flex items-center justify-center text-sm text-red-600">Unable to locate this address</div>';
        return;
    }

    try {
        const origin = await getCurrentPosition();
        const route = origin ? await getDirections(origin, destination) : null;

        const map = new maplibregl.Map({
            container,
            style: MAPTILER_STYLE_URL,
            center: destination,
            zoom: 13,
            attributionControl: false
        });

        map.on('load', () => {
            if (route?.geometry?.coordinates) {
                map.addSource('route', {
                    type: 'geojson',
                    data: { type: 'Feature', geometry: route.geometry },
                });

                map.addLayer({
                    id: 'routeLine',
                    type: 'line',
                    source: 'route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 0.85 },
                });

                const bounds = route.geometry.coordinates.reduce(
                    (b, coord) => b.extend(coord),
                    new maplibregl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0])
                );
                bounds.extend(destination);
                if (origin) bounds.extend(origin);
                map.fitBounds(bounds, { padding: 70 });
            } else {
                const bounds = new maplibregl.LngLatBounds(destination, destination);
                if (origin) bounds.extend(origin);
                map.fitBounds(bounds, { padding: 70 });
            }

            new maplibregl.Marker({ color: '#2563eb' })
                .setLngLat(destination)
                .setPopup(new maplibregl.Popup({ offset: 25 }).setText(location || 'Provider location'))
                .addTo(map);

            if (origin) {
                new maplibregl.Marker({ color: '#10b981' })
                    .setLngLat(origin)
                    .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Your location'))
                    .addTo(map);
            }
        });
    } catch (error) {
        console.error('Failed to initialize booking map:', error);
        container.innerHTML = '<div class="h-40 flex items-center justify-center text-sm text-red-600">Map failed to load</div>';
    }
}

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "login.html";
        return;
    }

    currentUser = sessionData.session.user;

    await loadBookings();
    setupReviewModal();
    setupLogout();
});

// ==========================
// LOGOUT
// ==========================
function setupLogout() {

    const logoutBtn =
        document.getElementById("logoutBtn");

    const logoutBtnSideMenu =
        document.getElementById("logoutBtnSideMenu");

    async function logout() {

        await supabase.auth.signOut();

        window.location.href = "home.html";
    }

    logoutBtn?.addEventListener("click", logout);

    logoutBtnSideMenu?.addEventListener("click", logout);
}

// ==========================
// LOAD BOOKINGS
// ==========================
async function loadBookings() {
    const container = document.getElementById("bookingsContainer");

    try {
        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">
                <div class="text-5xl mb-4">⏳</div>
                <p class="text-gray-600 text-lg">Loading bookings...</p>
            </div>
        `;

        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("*")
            .or(`user_id.eq.${currentUser.id},userId.eq.${currentUser.id},provider_id.eq.${currentUser.id},providerId.eq.${currentUser.id}`)
            .order("created_at", { ascending: false });

        // --- DIAGNOSTIC LOGGING ---
        // Open the browser console on this page to see exactly what Supabase
        // returned. If `bookings` logs as [] with error: null, this is a
        // Row Level Security (RLS) or column-mismatch issue on the `bookings`
        // table, not a bug in this file.
        console.log("[loadBookings] Current user ID:", currentUser.id);
        console.log("[loadBookings] Query result — bookings:", bookings, "error:", error);
        // --- END DIAGNOSTIC LOGGING ---

        if (error) throw error;

        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl p-10 text-center shadow">
                    <div class="text-6xl mb-4">📭</div>
                    <h2 class="text-2xl font-bold text-gray-800 mb-3">No Bookings Yet</h2>
                    <p class="text-gray-500">Your bookings will appear here.</p>
                </div>
            `;
            return;
        }

        const providerIds = [...new Set(bookings.map(b => b.provider_id).filter(Boolean))];
        let providersById = {};

        if (providerIds.length > 0) {
            const { data: providers, error: providersError } = await supabase
                .from("users")
                .select(`
                    id,
                    full_name,
                    email,
                    location,
                    profile_picture
                `)
                .in("id", providerIds);

            if (providersError) {
                console.error("Providers fetch error:", providersError);
            }

            providersById = Object.fromEntries((providers || []).map(provider => [String(provider.id), provider]));
        }

        const serviceIds = bookings.map(b => b.service_id).filter(Boolean);
        let servicesById = {};

        if (serviceIds.length > 0) {
            const { data: services } = await supabase
                .from("services")
                .select(`
                    id,
                    title,
                    description,
                    location,
                    price,
                    deal_message,
                    group_discount_threshold,
                    group_discount_percent,
                    travel_price,
                    image_url
                `)
                .in("id", serviceIds);

            servicesById = Object.fromEntries((services || []).map(service => [service.id, service]));
        }

        const requestIds = bookings.map(b => b.request_id).filter(Boolean);
        let requestsById = {};

        if (requestIds.length > 0) {
            const { data: requests } = await supabase
                .from("requests")
                .select(`
                    id,
                    title,
                    description,
                    location,
                    budget
                `)
                .in("id", requestIds);

            requestsById = Object.fromEntries((requests || []).map(request => [request.id, request]));
        }

        container.innerHTML = "";

        bookings.forEach(booking => {
            const serviceDetails = servicesById[booking.service_id];
            const requestDetails = requestsById[booking.request_id];
            const details = serviceDetails || requestDetails || {};
            const provider = providersById[String(booking.provider_id)] || null;
            const providerName = provider?.full_name || "Unknown Provider";
            const providerEmail = provider?.email || "No Email";
            const providerPicture = provider?.profile_picture && provider.profile_picture.trim() !== "" ? provider.profile_picture : `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}&background=random`;
            const servicePrice = Number(details.price || 0);
            const groupThreshold = Number(details.group_discount_threshold) || 0;
            const groupPercent = Number(details.group_discount_percent) || 0;
            const hasGroupDeal = groupThreshold > 0 && groupPercent > 0;
            const peopleCount = Number(booking.number_of_people || 1);
            const meetsGroupDeal = hasGroupDeal && peopleCount >= groupThreshold;
            const discountedPerPerson = Number(booking.price_per_person || servicePrice || 0);
            const dealText = hasGroupDeal
                ? meetsGroupDeal
                    ? `Group deal applied: ${groupPercent}% off per person.`
                    : `Group deal: Book ${groupThreshold}+ people to save ${groupPercent}% per person.`
                : '';
            const bookingTotal = Number(booking.total_price || booking.amount || booking.price || 0);
            const providerLocation = provider?.location || details?.location || null;
            const bookingLocationText = booking.service_location === 'customer'
                ? (booking.customer_location || details?.location || 'Customer Location')
                : (providerLocation || details?.location || 'Provider Location');
            const shouldRenderBookingDetails = booking.scheduled_date || booking.number_of_people || booking.service_location || booking.customer_location || booking.special_instructions || booking.travel_fee;
            const completionAwaitingCustomer = ["completed_by_provider", "awaiting_customer_confirmation"].includes(booking.status);

            const card = document.createElement("div");
            card.className = `bg-white rounded-2xl shadow-md p-6 hover:shadow-xl transition`;
            card.innerHTML = `
                <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    <div class="flex-1">
                        <div class="flex items-center gap-4 mb-5">
                            <img src="${providerPicture}" alt="${providerName}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-200" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}'">
                            <div class="flex-1">
                                <p class="text-sm text-gray-500">Service Provider</p>
                                <h2 class="text-xl font-bold text-gray-900">${providerName}</h2>
                                <p class="text-blue-600 text-sm break-all">${providerEmail}</p>
                            </div>
                            <div>
                                ${(() => {
                                    let statusColor = "bg-gray-100 text-gray-700";
                                    let statusText = booking.status || "pending";
                                    
                                    if (booking.status === "pending_payment") statusColor = "bg-yellow-100 text-yellow-700";
                                    if (booking.status === "paid") statusColor = "bg-blue-100 text-blue-700";
                                    if (booking.status === "accepted") statusColor = "bg-green-100 text-green-700";
                                    if (booking.status === "in_progress") statusColor = "bg-indigo-100 text-indigo-700";
                                    if (booking.status === "completed_by_provider") statusColor = "bg-purple-100 text-purple-700";
                                    if (booking.status === "completed") statusColor = "bg-emerald-100 text-emerald-700";
                                    if (booking.status === "cancelled") statusColor = "bg-red-100 text-red-700";
                                    if (booking.status === "disputed") statusColor = "bg-orange-100 text-orange-700";
                                    
                                    if (booking.status === "disputed") statusText = "Reported";
                                    
                                    return `<span class="px-3 py-2 rounded-lg text-sm font-semibold ${statusColor}">${statusText.charAt(0).toUpperCase() + statusText.slice(1).replace(/_/g, ' ')}</span>`;
                                })()}
                            </div>
                        </div>
                        ${details.image_url && details.image_url.trim() !== "" ? `<img src="${details.image_url}" alt="${details.title || 'Service'}" class="w-full h-48 object-cover rounded-xl mb-5" onerror="this.style.display='none'">` : ''}
                        <h3 class="text-2xl font-bold text-gray-900 mb-3">${details.title || "Untitled Booking"}</h3>
                        <p class="text-gray-600 leading-relaxed mb-5">${details.description || "No description"}</p>
                        
                        <!-- BOOKING DETAILS -->
                        ${shouldRenderBookingDetails ? `
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
                          <p class="font-semibold text-gray-900 mb-3">Booking Details</p>
                          <div class="grid grid-cols-2 gap-3">
                            ${booking.number_of_people ? `<div>
                              <p class="text-xs text-gray-600">People</p>
                              <p class="font-semibold text-gray-900">${booking.number_of_people}</p>
                            </div>` : ''}
                            ${booking.scheduled_date ? `<div>
                              <p class="text-xs text-gray-600">Scheduled</p>
                              <p class="font-semibold text-gray-900">${new Date(booking.scheduled_date).toLocaleDateString()} ${new Date(booking.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>` : ''}
                                                        ${booking.service_location ? `<div>
                                                            <p class="text-xs text-gray-600">Location</p>
                                                            <p class="font-semibold text-gray-900">${bookingLocationText}</p>
                                                        </div>` : ''}
                            ${booking.travel_fee ? `<div>
                              <p class="text-xs text-gray-600">Travel Fee</p>
                              <p class="font-semibold text-gray-900">₦${booking.travel_fee.toLocaleString()}</p>
                            </div>` : ''}
                          </div>
                          ${booking.special_instructions ? `<p class="text-xs text-gray-600 mt-3">Special Instructions: ${booking.special_instructions}</p>` : ''}
                        </div>
                        ` : ''}
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">📍 Location</p>
                                <p class="font-semibold text-gray-900">${details.location || "No location"}</p>
                            </div>
                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">💰 Agreed Price</p>
                                <p class="font-bold text-green-600 text-xl">₦${bookingTotal.toLocaleString()}</p>
                                <p class="text-sm text-gray-600 mt-1">Per person: ₦${discountedPerPerson.toLocaleString()}</p>
                                ${hasGroupDeal ? `<p class="text-sm text-indigo-700 mt-2">${dealText}</p>` : ''}
                            </div>
                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">🌍 Provider Location</p>
                                <p class="font-semibold text-gray-900">${providerLocation || "No location"}</p>
                            </div>
                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">📅 Booking Date</p>
                                <p class="font-semibold text-gray-900">${new Date(booking.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div class="mt-5 rounded-2xl border border-gray-200 overflow-hidden">
                            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                <p class="text-sm font-semibold text-gray-900">Provider Location Map</p>
                            </div>
                            <div class="h-48" id="booking-map-${booking.id}"></div>
                        </div>
                    </div>
                    <div class="flex flex-col gap-3 w-full lg:w-56">
                        <a class="locate-provider-btn bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-xl font-semibold transition text-center" href="${buildGoogleMapsUrl(null, providerLocation)}" target="_blank">🧭 Track Provider</a>
                        <button class="chat-provider-btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-semibold transition" data-provider="${booking.provider_id || ''}" data-service="${booking.service_id || ''}">💬 Chat Provider</button>
                        <button class="review-btn bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-3 rounded-xl font-semibold transition" data-booking="${booking.id}" data-service="${booking.service_id || ''}" data-provider="${booking.provider_id || ''}">Leave Review</button>
                        ${booking.status === "pending_payment" ? `
                        <button class="complete-payment-btn bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-xl font-semibold transition" data-id="${booking.id}" data-amount="${bookingTotal}">💳 Complete Payment</button>
                        ` : ''}
                        ${completionAwaitingCustomer ? `
                        <button class="confirm-completion-btn bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-semibold transition" data-id="${booking.id}">✅ Confirm Completion</button>
                        <button class="report-problem-btn bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-semibold transition" data-id="${booking.id}">⚠️ Report Problem</button>
                        ` : ''}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        setupBookingActions();

        document.querySelectorAll('[id^="booking-map-"]').forEach((mapNode) => {
            try {
                const bookingId = mapNode.id.replace('booking-map-', '');
                const booking = bookings.find((item) => String(item.id) === String(bookingId));
                if (!booking) return;
                const provider = providersById[String(booking?.provider_id)] || null;
                const details = servicesById[booking.service_id] || requestsById[booking.request_id] || {};
                const mapLocation = booking.service_location === 'customer'
                    ? booking.customer_location
                    : provider?.location || details?.location || null;
                renderBookingMap(mapNode, mapLocation);
            } catch (mapError) {
                // A map rendering failure should never wipe out already-rendered
                // booking cards, so it's isolated here instead of bubbling up.
                console.error('Failed to render map for a booking:', mapError);
            }
        });
    } catch (error) {
        console.error("Load bookings error:", error);
        container.innerHTML = `
            <div class="bg-white rounded-xl p-10 text-center shadow">
                <div class="text-6xl mb-4">❌</div>
                <h2 class="text-2xl font-bold text-red-600 mb-3">Failed to load bookings</h2>
                <p class="text-gray-500">${error.message}</p>
            </div>
        `;
    }
}

function setupBookingActions() {
    document.querySelectorAll(".chat-provider-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const providerId = button.dataset.provider;
            const serviceId = button.dataset.service;
            await startChat(providerId, serviceId);
        });
    });

    document.querySelectorAll(".review-btn").forEach(button => {
        button.addEventListener("click", () => {
            selectedBooking = button.dataset.booking;
            openReviewModal(button.dataset.provider, button.dataset.service);
        });
    });

    document.querySelectorAll(".confirm-completion-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const bookingId = button.dataset.id;
            if (!confirm("Are you sure you want to confirm completion? This will release payment to the provider.")) return;
            const { error } = await supabase
                .from("bookings")
                .update({ status: "completed" })
                .eq("id", bookingId);
            if (error) {
                alert("Failed to confirm completion: " + error.message);
            } else {
                alert("Thank you! Payment will be released to the provider.");
                await loadBookings();
            }
        });
    });

    document.querySelectorAll(".report-problem-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const bookingId = button.dataset.id;
            const reason = prompt("Please describe the problem with this job:");
            if (!reason) return;
            const { error } = await supabase
                .from("bookings")
                .update({ status: "disputed", dispute_reason: reason })
                .eq("id", bookingId);
            if (error) {
                alert("Failed to report problem: " + error.message);
            } else {
                alert("Your dispute has been submitted. Vora will review and contact you.");
                await loadBookings();
            }
        });
    });

    // Complete pending payment
    document.querySelectorAll(".complete-payment-btn").forEach(button => {
        button.addEventListener("click", async () => {
            const bookingId = button.dataset.id;
            const amount = Number(button.dataset.amount || 0);
            if (!confirm(`Proceed to complete payment of ₦${amount.toLocaleString()} for this booking?`)) return;

            try {
                const bookingCard = button.closest("div.bg-white.rounded-2xl.shadow-md.p-6");
                const bookingTitle = bookingCard?.querySelector("h3")?.textContent || "this booking";
                const params = new URLSearchParams();
                params.append("bookingId", bookingId);
                window.location.href = `complete-payment.html?bookingId=${bookingId}`;
            } catch (err) {
                console.error("Payment redirect failed:", err);
                alert("Failed to open payment page: " + (err.message || err));
            }
        });
    });
}

// ==========================
// START CHAT
// ==========================
async function startChat(providerId, serviceId) {

    try {

        // We don't have service_id/customer_id/provider_id in chats.
        // Use `participants` + `sender_id` to locate the chat.
        const { data: existingChat } = await supabase
            .from("chats")
            .select("id")
            .eq("participants", providerId)
            .eq("sender_id", currentUser.id)
            .maybeSingle();

        if (existingChat?.id) {
            const params = new URLSearchParams();
            params.append("chat_id", existingChat.id);
            if (serviceId) params.append("service_id", serviceId);
            window.location.href = `chat.html?${params.toString()}`;
            return;
        }

        // Create new chat
        const { data: newChat, error } = await supabase
            .from("chats")
            .insert([
                {
                    participants: providerId,
                    sender_id: currentUser.id
                    // chat_id/last_message/last_timestamp will use defaults or nullable behavior
                }
            ])
            .select("id")
            .single();

        if (error) throw error;

        const params = new URLSearchParams();
        params.append("chat_id", newChat.id);
        if (serviceId) params.append("service_id", serviceId);
        window.location.href = `chat.html?${params.toString()}`;

    } catch (error) {

        console.error("Chat Error:", error);
        alert("Failed to start chat: " + error.message);
    }
}

// ==========================
// REVIEW MODAL
// ==========================
function setupReviewModal() {

    const modal =
        document.getElementById("reviewModal");

    const closeBtn =
        document.getElementById("closeReviewModal");

    const cancelBtn =
        document.getElementById("cancelReview");

    const submitBtn =
        document.getElementById("submitReview");

    const stars =
        document.querySelectorAll(".star");

    // CLOSE MODAL
    function closeModal() {

        modal.classList.add("hidden");

        selectedRating = 0;

        document.getElementById(
            "reviewComment"
        ).value = "";

        stars.forEach(star => {

            star.classList.remove("text-yellow-400");
            star.classList.add("text-gray-300");
        });
    }

    closeBtn?.addEventListener("click", closeModal);

    cancelBtn?.addEventListener("click", closeModal);

    // STAR RATING
    stars.forEach(star => {

        star.addEventListener("click", () => {

            selectedRating =
                Number(star.dataset.rating);

            stars.forEach(s => {

                const rating =
                    Number(s.dataset.rating);

                if (rating <= selectedRating) {

                    s.classList.remove("text-gray-300");
                    s.classList.add("text-yellow-400");

                } else {

                    s.classList.remove("text-yellow-400");
                    s.classList.add("text-gray-300");
                }
            });
        });
    });

    // SUBMIT REVIEW
    submitBtn?.addEventListener("click", async () => {

        try {

            if (!selectedRating) {
                alert("Please select a rating");
                return;
            }

            const comment =
                document.getElementById(
                    "reviewComment"
                ).value;

            const providerId =
                modal.dataset.provider;

            const serviceId =
                modal.dataset.service;

            submitBtn.disabled = true;

            submitBtn.textContent =
                "Submitting...";

            const { error } = await supabase
                .from("reviews")
                .insert({
                    booking_id: selectedBooking,
                    user_id: currentUser.id,
                    provider_id: providerId,
                    service_id: serviceId,
                    rating: selectedRating,
                    comment 
                });

            if (error) throw error;

            alert(
                "Review submitted successfully!"
            );

            closeModal();

        } catch (error) {

            console.error(error);

            alert(error.message);

        } finally {

            submitBtn.disabled = false;

            submitBtn.textContent =
                "Submit Review";
        }
    });
}

// ==========================
// OPEN REVIEW MODAL
// ==========================
function openReviewModal(providerId, serviceId) {

    const modal =
        document.getElementById("reviewModal");

    modal.dataset.provider =
        providerId;

    modal.dataset.service =
        serviceId;

    modal.classList.remove("hidden");
}