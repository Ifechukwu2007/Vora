import { supabase } from "./supabase.js";

let currentUser = null;
let selectedRating = 0;
let selectedBooking = null;

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

        window.location.href = "login.html";
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
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

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
            const providerLocation = provider?.location || "Location not available";
            const providerPicture = provider?.profile_picture && provider.profile_picture.trim() !== "" ? provider.profile_picture : `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}&background=random`;
            const completionAwaitingCustomer = ["completed_by_provider", "awaiting_customer_confirmation"].includes(booking.status);
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
                        <h3 class="text-2xl font-bold text-gray-900 mb-3">${details.title || "Untitled Booking"}</h3>
                        <p class="text-gray-600 leading-relaxed mb-5">${details.description || "No description"}</p>
                        
                        <!-- BOOKING DETAILS -->
                        ${booking.scheduled_date || booking.number_of_people ? `
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
                              <p class="font-semibold text-gray-900">${booking.service_location === 'provider' ? 'Provider Location' : (booking.customer_location || 'Customer Location')}</p>
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
                                <p class="font-semibold text-gray-900">${providerLocation}</p>
                            </div>
                            <div class="bg-gray-50 rounded-xl p-4">
                                <p class="text-sm text-gray-500 mb-1">📅 Booking Date</p>
                                <p class="font-semibold text-gray-900">${new Date(booking.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-col gap-3 w-full lg:w-56">
                        <button class="chat-provider-btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-semibold transition" data-provider="${booking.provider_id || ''}" data-service="${booking.service_id || ''}">💬 Chat Provider</button>
                        <button class="review-btn bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-3 rounded-xl font-semibold transition" data-booking="${booking.id}" data-service="${booking.service_id || ''}" data-provider="${booking.provider_id || ''}">Leave Review</button>
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