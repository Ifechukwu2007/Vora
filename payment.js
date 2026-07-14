import { supabase } from './supabase.js';
import { updateProfilePictureInHeader } from './auth.js';
import { formatPrice } from './currency-utils.js';
import { sendEmailToUserId } from './email-service.js';

if (typeof window !== 'undefined') {
  window.paymentsScriptLoaded = true;
}

function normalizeProfile(profile) {
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] : profile;
}

function calculatePaymentTotals(subtotal) {
  const feeRate = 0.05;
  const serviceFee = Math.round(Number(subtotal || 0) * feeRate);
  const total = Number(subtotal || 0) + serviceFee;
  return { serviceFee, total };
}

async function sendBookingRequestEmails(booking) {
  if (!booking) return;

  const bookingUrl = `${window.location.origin}/my-bookings.html?bookingId=${booking.id}`;
  const scheduledDate = booking.scheduled_date
    ? new Date(booking.scheduled_date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'TBD';

  const promises = [];

  if (booking.provider_id) {
    promises.push(
      sendEmailToUserId(
        booking.provider_id,
        'New Vora booking request received',
        `<p>A new booking request has been made and is pending payment.</p><p><strong>Booking ID:</strong> ${booking.id}</p><p><strong>Total:</strong> ${formatPrice(booking.total_price)}</p><p><strong>Scheduled:</strong> ${scheduledDate}</p><p><a href="${bookingUrl}">View booking</a></p>`,
        `New booking request: ${booking.id} — ${formatPrice(booking.total_price)}`
      )
    );
  }

  if (booking.user_id) {
    promises.push(
      sendEmailToUserId(
        booking.user_id,
        'Your Vora booking request is pending payment',
        `<p>Your booking request has been saved and is pending payment.</p><p><strong>Booking ID:</strong> ${booking.id}</p><p><strong>Total:</strong> ${formatPrice(booking.total_price)}</p><p><strong>Scheduled:</strong> ${scheduledDate}</p><p><a href="${bookingUrl}">View your booking</a></p>`,
        `Booking request received: ${booking.id}`
      )
    );
  }

  if (promises.length === 0) return;

  const results = await Promise.allSettled(promises);
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('⚠️ Booking request email failed:', result.reason);
    }
  });
}

function calculateBookingPrice(service, peopleCount, location = 'provider') {
  const threshold = Number(service.group_discount_threshold) || 0;
  const discountPercent = Number(service.group_discount_percent) || 0;
  const basePrice = Number(service.price) || 0;
  const meetsDeal = threshold > 0 && discountPercent > 0 && peopleCount >= threshold;
  const perPerson = meetsDeal
    ? Math.round(basePrice * (1 - discountPercent / 100))
    : basePrice;
  const travelFee = location === 'customer' ? Number(service.travel_price || 0) : 0;
  const total = (peopleCount * perPerson) + travelFee;
  return { perPerson, total, meetsDeal, travelFee, threshold, discountPercent };
}

function ensurePaystackLoaded() {
  return new Promise((resolve, reject) => {
    if (typeof PaystackPop !== 'undefined') {
      resolve();
      return;
    }

    let script = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      clearTimeout(timeout);
      clearInterval(poll);
    };

    const maybeResolve = () => {
      if (typeof PaystackPop !== 'undefined') {
        cleanup();
        resolve();
        return true;
      }
      return false;
    };

    const onLoad = () => {
      if (!maybeResolve()) {
        cleanup();
        reject(new Error('Paystack loaded but PaystackPop is unavailable'));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load Paystack script'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    const timeout = setTimeout(() => {
      if (!maybeResolve()) {
        cleanup();
        reject(new Error('Timed out waiting for Paystack to load'));
      }
    }, 10000);

    const poll = setInterval(() => {
      maybeResolve();
    }, 100);

    if (script.readyState && ['loaded', 'complete', 'interactive'].includes(script.readyState)) {
      setTimeout(maybeResolve, 0);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {

  // Update profile picture in header (best effort)
  try {
    await updateProfilePictureInHeader();
  } catch (err) {
    console.warn('Header profile update skipped:', err);
  }

  // =========================
  // PAYSTACK KEY (replace with env/build-time injection)
  // =========================
  // Use test key locally; do NOT commit live secret keys to client code.
  const PAYSTACK_PUBLIC_KEY = window.__PAYSTACK_PUBLIC_KEY || 'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c';

  // =========================
  // ELEMENTS (single declarations)
  // =========================
  const confirmBtn = document.getElementById('confirm-booking-btn');

  const serviceTitleEl = document.getElementById('service-title');
  const serviceCoverEl = document.getElementById('service-cover');
  const providerNameEl = document.getElementById('provider-name');
  const providerPictureEl = document.getElementById('provider-picture');

  const basePriceEl = document.getElementById('base-price');
  const feeEl = document.getElementById('service-fee');
  const totalAmountEl = document.getElementById('service-price-total');
  const perPersonPriceEl = document.getElementById('per-person-price');
  const servicePriceSummaryEl = document.getElementById('service-price-summary');

  const userInfoEl = document.getElementById('user-info');

  // Ensure confirm button exists
  if (!confirmBtn) {
    console.error('Missing confirm button: #confirm-booking-btn');
    return;
  }

  // =========================
  // URL PARAMS and local pending booking
  // =========================
  const params = new URLSearchParams(window.location.search);
  const isFileProtocol = window.location.protocol === 'file:';

  let pendingBooking = null;
  try {
    pendingBooking = JSON.parse(localStorage.getItem('voraPendingBooking') || 'null');
  } catch (err) {
    console.warn('Could not read pending booking:', err);
  }

  let serviceId = params.get('serviceId') || pendingBooking?.serviceId || '';
  let requestId = params.get('requestId') || pendingBooking?.requestId || '';
  let offerId = params.get('offerId') || pendingBooking?.offerId || '';
  let providerId = params.get('providerId') || pendingBooking?.providerId || '';

  const bookingIdParam = params.get('bookingId') || '';

  let existingBooking = null;

  if (bookingIdParam) {
    const { data: bookingData, error: bookingLookupError } =
      await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingIdParam)
        .maybeSingle();

    if (bookingLookupError) {
      console.error('Error loading pending booking:', bookingLookupError);
    } else {
      existingBooking = bookingData;
      serviceId = serviceId || existingBooking?.service_id || null;
      requestId =
        requestId ||
        existingBooking?.request_id ||
        existingBooking?.requestId ||
        null;
      providerId =
        providerId ||
        existingBooking?.provider_id ||
        existingBooking?.providerId ||
        null;
      offerId = offerId || existingBooking?.offer_id || existingBooking?.offerId || null;
    }
  }

  const scheduledDate =
    params.get('scheduledDate') ||
    existingBooking?.scheduled_date ||
    pendingBooking?.scheduledDate ||
    new Date().toISOString();

  let totalPrice =
    Number(params.get('totalPrice') || existingBooking?.total_price || pendingBooking?.totalPrice || 0) || 0;

  // NEW BOOKING FIELDS
  const numberOfPeople = parseInt(params.get('numberOfPeople') || existingBooking?.number_of_people || pendingBooking?.numberOfPeople || '1') || 1;
  const serviceLocation = params.get('serviceLocation') || existingBooking?.service_location || pendingBooking?.serviceLocation || 'provider';
  const customerLocation = params.get('customerLocation') || existingBooking?.customer_location || pendingBooking?.customerLocation || '';
  const travelFee = parseInt(params.get('travelFee') || existingBooking?.travel_fee || pendingBooking?.travelFee || '0') || 0;
  const specialInstructions = params.get('specialInstructions') || existingBooking?.special_instructions || pendingBooking?.specialInstructions || '';
  const paramPricePerPerson = Number(params.get('pricePerPerson') || existingBooking?.price_per_person || pendingBooking?.pricePerPerson || 0);
  const paramDiscountedTotal = Number(params.get('discountedTotal') || existingBooking?.total_price || pendingBooking?.discountedTotal || 0);

  // bookingPrice is mutable and intentionally not redeclared later
  let bookingPrice = {
    perPerson: paramPricePerPerson || (numberOfPeople > 0 ? Math.round((totalPrice - travelFee) / numberOfPeople) : 0),
    total: paramDiscountedTotal || totalPrice,
    travelFee,
  };

  const previewMode = isFileProtocol || (!serviceId && !requestId && !bookingIdParam && !pendingBooking);

  if (previewMode) {
    serviceId = serviceId || 'demo-service';
    providerId = providerId || 'demo-provider';
    bookingPrice = {
      perPerson: paramPricePerPerson || 1000,
      total: paramDiscountedTotal || totalPrice || 2000,
      travelFee,
    };
    totalPrice = bookingPrice.total;
  }

  // =========================
  // VALIDATION
  // =========================
  if ((!serviceId && !requestId) || (!providerId && !previewMode)) {
    if (!previewMode) {
      alert('Missing booking details');
      return;
    }
  }

  // =========================
  // AUTH USER
  // =========================
  let currentUser = null;
  if (!previewMode) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authError && authData?.user) {
      currentUser = authData.user;
    }
  }

  if (!currentUser) {
    currentUser = previewMode
      ? { id: 'preview-user', email: 'preview@vora.com' }
      : null;
  }

  if (!currentUser) {
    alert('Please login first');
    window.location.href = 'login.html';
    return;
  }

  if (userInfoEl) {
    userInfoEl.innerHTML = `
      Logged in as:
      <strong>${currentUser.email}</strong>
    `;
  }

  // =========================
  // FETCH SERVICE OR REQUEST DETAILS
  // =========================
  let serviceData = null;
  let requestData = null;
  let displayTitle = pendingBooking?.serviceTitle || 'Service';

  try {
    if (previewMode) {
      displayTitle = pendingBooking?.serviceTitle || 'Demo Service';
      if (serviceTitleEl) {
        serviceTitleEl.textContent = displayTitle;
      }
      if (providerNameEl) {
        providerNameEl.textContent = pendingBooking?.providerName || 'Demo Provider';
      }
      if (providerPictureEl) {
        providerPictureEl.src = pendingBooking?.providerPicture || 'https://ui-avatars.com/api/?name=Demo';
      }
    } else {
      if (serviceId) {
        const { data: service, error: serviceError } =
          await supabase
            .from('services')
            .select('*')
            .eq('id', serviceId)
            .single();

        if (serviceError) throw serviceError;

        serviceData = service;
        displayTitle = service.title || 'Service';

        const calculatedBookingPrice = calculateBookingPrice(serviceData, numberOfPeople, serviceLocation);
        // reuse outer bookingPrice instead of shadowing
        bookingPrice = {
          ...bookingPrice,
          ...calculatedBookingPrice,
        };
        totalPrice = bookingPrice.total;
      } else {
        const { data: request, error: requestError } =
          await supabase
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (requestError) throw requestError;

        requestData = request;
        displayTitle = request.title || 'Request';

        if (!totalPrice || totalPrice <= 0) {
          totalPrice = Number(request.budget) || 0;
        }
      }

      if (serviceTitleEl) {
        serviceTitleEl.textContent = displayTitle;
      }

      // =========================
      // FETCH PROVIDER (SERVICE OWNER)
      // =========================
      let providerName = 'Provider';
      let providerPicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}&background=eceff4&color=1f2937`;

      if (serviceData?.provider_full_name) {
        providerName = serviceData.provider_full_name;
      }
      if (serviceData?.provider_name) {
        providerName = serviceData.provider_name;
      }

      // Fetch full provider profile
      const { data: providerData, error: providerError } =
        await supabase
          .from('profiles')
          .select('full_name, email, profile_picture')
          .eq('id', providerId)
          .maybeSingle();

      const provider = normalizeProfile(providerData);

      if (provider) {
        if (provider.full_name) {
          providerName = provider.full_name;
        } else if (provider.email) {
          providerName = provider.email;
        }
      } else if (providerError) {
        console.error('Error fetching provider profile:', providerError);
      }

      providerPicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}&background=eceff4&color=1f2937`;

      if (providerNameEl) {
        providerNameEl.textContent = providerName;
      }

      if (providerPictureEl) {
        providerPictureEl.src = providerPicture;
      }
    }

    if (serviceCoverEl) {
      const coverUrl =
        serviceData?.image_url ||
        serviceData?.cover_image ||
        serviceData?.image ||
        (Array.isArray(serviceData?.images) ? serviceData.images[0] : null) ||
        pendingBooking?.serviceImage ||
        'https://placehold.co/1200x720';
      serviceCoverEl.src = coverUrl;
    }

    // =========================
    // DISPLAY BOOKING DETAILS
    // =========================
    const scheduledDateTime = new Date(scheduledDate);
    const dateStr = scheduledDateTime.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = scheduledDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const bookingPeopleEl = document.getElementById('booking-people');
    const bookingDateEl = document.getElementById('booking-date');
    const bookingTimeEl = document.getElementById('booking-time');
    const bookingLocationEl = document.getElementById('booking-location');
    const bookingInstructionsEl = document.getElementById('booking-instructions');
    const bookingInstructionsDivEl = document.getElementById('booking-instructions-div');
    const bookingTravelFeeEl = document.getElementById('booking-travel-fee');
    const travelFeeAmountEl = document.getElementById('travel-fee-amount');
    const travelFeeRowEl = document.getElementById('travel-fee-card');
    const travelFeeDisplayEl = document.getElementById('travel-fee-card-value');
    const travelFeeBreakdownEl = document.getElementById('travel-fee-breakdown');
    const travelFeeBreakdownValueEl = document.getElementById('travel-fee-breakdown-value');
    const originalPriceRowEl = document.getElementById('original-price-row');
    const originalPriceEl = document.getElementById('original-price');

    if (bookingPeopleEl) bookingPeopleEl.textContent = numberOfPeople;
    if (bookingDateEl) bookingDateEl.textContent = dateStr;
    if (bookingTimeEl) bookingTimeEl.textContent = timeStr;
    if (bookingLocationEl) {
      if (serviceLocation === 'provider') {
        bookingLocationEl.textContent = 'Provider\'s Location';
      } else {
        bookingLocationEl.textContent = customerLocation || 'Customer Location';
      }
    }

    if (specialInstructions) {
      if (bookingInstructionsEl) bookingInstructionsEl.textContent = specialInstructions;
      if (bookingInstructionsDivEl) bookingInstructionsDivEl.classList.remove('hidden');
    }

    if (travelFee > 0) {
      if (bookingTravelFeeEl) bookingTravelFeeEl.classList.remove('hidden');
      if (travelFeeAmountEl) travelFeeAmountEl.textContent = formatPrice(travelFee);
      if (travelFeeRowEl) travelFeeRowEl.classList.remove('hidden');
      if (travelFeeDisplayEl) travelFeeDisplayEl.textContent = formatPrice(travelFee);
      if (travelFeeBreakdownEl) travelFeeBreakdownEl.classList.remove('hidden');
      if (travelFeeBreakdownValueEl) travelFeeBreakdownValueEl.textContent = formatPrice(travelFee);
    } else {
      if (travelFeeRowEl) travelFeeRowEl.classList.add('hidden');
      if (travelFeeBreakdownEl) travelFeeBreakdownEl.classList.add('hidden');
    }

    // Show discounted service price if available
    const discountInfoEl = document.getElementById('discount-info');
    const threshold = Number(serviceData?.group_discount_threshold) || 0;
    const discountPercent = Number(serviceData?.group_discount_percent) || 0;
    const hasDeal = threshold > 0 && discountPercent > 0;
    const meetsDeal = hasDeal && numberOfPeople >= threshold;
    const baseServicePrice = Math.max(0, totalPrice - travelFee);
    const perPersonPrice = numberOfPeople > 0 ? Math.round(baseServicePrice / numberOfPeople) : 0;

    if (perPersonPriceEl) {
      perPersonPriceEl.textContent = formatPrice(perPersonPrice);
    }

    if (discountInfoEl) {
      if (hasDeal && meetsDeal) {
        discountInfoEl.textContent = `Group deal applied: ${discountPercent}% off per person for ${numberOfPeople} people.`;
      } else if (hasDeal) {
        discountInfoEl.textContent = `Group deal: Book ${threshold}+ people to save ${discountPercent}% per person.`;
      } else {
        discountInfoEl.textContent = '';
      }
    }

    // Force the page total to the discounted price if available.
    if (serviceData) {
      const calculated = calculateBookingPrice(serviceData, numberOfPeople, serviceLocation);
      bookingPrice = {
        ...bookingPrice,
        ...calculated,
      };
      totalPrice = bookingPrice.total;
      const originalServicePrice = numberOfPeople * (Number(serviceData.price) || 0);
      const discountedServicePrice = numberOfPeople * bookingPrice.perPerson;

      if (totalAmountEl) {
        totalAmountEl.textContent = formatPrice(bookingPrice.total);
      }
      if (servicePriceSummaryEl) {
        servicePriceSummaryEl.textContent = formatPrice(bookingPrice.total);
      }
      if (basePriceEl) {
        basePriceEl.textContent = formatPrice(discountedServicePrice);
      }
      if (originalPriceRowEl && originalPriceEl) {
        if (hasDeal && meetsDeal) {
          originalPriceEl.textContent = formatPrice(originalServicePrice);
          originalPriceRowEl.classList.remove('hidden');
        } else {
          originalPriceRowEl.classList.add('hidden');
        }
      }
      if (perPersonPriceEl) {
        perPersonPriceEl.textContent = formatPrice(bookingPrice.perPerson);
      }
      if (travelFeeDisplayEl) {
        travelFeeDisplayEl.textContent = formatPrice(bookingPrice.travelFee);
      }
      if (travelFeeBreakdownValueEl) {
        travelFeeBreakdownValueEl.textContent = formatPrice(bookingPrice.travelFee);
      }
    }

  } catch (err) {
    console.error(err);
    alert('Failed to load service');
    return;
  }

  // =========================
  // PRICE BREAKDOWN
  // =========================
  const { serviceFee, total: totalWithFee } = calculatePaymentTotals(totalPrice);
  const baseServicePrice = Math.max(0, totalPrice - travelFee);
  if (basePriceEl) {
    basePriceEl.textContent = formatPrice(baseServicePrice);
  }

  if (feeEl) {
    feeEl.textContent = formatPrice(serviceFee);
  }

  if (totalAmountEl) {
    totalAmountEl.textContent = formatPrice(totalWithFee);
  }
  if (servicePriceSummaryEl) {
    servicePriceSummaryEl.textContent = formatPrice(totalWithFee);
  }
  if (perPersonPriceEl) {
    perPersonPriceEl.textContent = formatPrice(bookingPrice.perPerson);
  }

  // =========================
  // PAYMENT CLICK
  // =========================
  confirmBtn.addEventListener('click', async (event) => {
    event.preventDefault();

    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';

      // Prepare amounts
      const bookingPriceForPayload = bookingPrice;
      const subtotalBeforeFee = Math.max(0, Number(bookingPriceForPayload.total || totalPrice || 0));
      const { total: totalToCharge } = calculatePaymentTotals(subtotalBeforeFee);
      const perPersonToCharge = bookingPriceForPayload.perPerson;

      // Validate amount > 0
      if (!Number.isFinite(totalToCharge) || totalToCharge <= 0) {
        alert('Invalid payment amount. Please check the booking total.');
        resetButton();
        return;
      }

      let booking = existingBooking;

      // Create or update booking (status: pending_payment)
      if (!booking) {
        const bookingPayload = {
          provider_id: providerId,
          user_id: currentUser.id,
          scheduled_date: scheduledDate,
          total_price: totalToCharge,
          status: 'pending_payment',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          number_of_people: numberOfPeople,
          price_per_person: perPersonToCharge,
          service_location: serviceLocation,
          customer_location: customerLocation,
          travel_fee: travelFee,
          special_instructions: specialInstructions,
          ...(serviceId ? { service_id: serviceId } : {}),
          ...(requestId ? { request_id: requestId } : {})
        };

        const { data: newBooking, error: bookingError } =
          await supabase
            .from('bookings')
            .insert([bookingPayload])
            .select()
            .single();

        if (bookingError) throw bookingError;
        booking = newBooking;
      } else {
        const { error: bookingUpdateError } = await supabase
          .from('bookings')
          .update({
            status: 'pending_payment',
            total_price: totalToCharge,
            price_per_person: perPersonToCharge,
            scheduled_date: scheduledDate,
            number_of_people: numberOfPeople,
            service_location: serviceLocation,
            customer_location: customerLocation,
            travel_fee: travelFee,
            special_instructions: specialInstructions,
            updated_at: new Date().toISOString()
          })
          .eq('id', booking.id);

        if (bookingUpdateError) throw bookingUpdateError;

        booking = {
          ...booking,
          status: 'pending_payment',
          total_price: totalToCharge,
          price_per_person: perPersonToCharge,
          scheduled_date: scheduledDate,
          number_of_people: numberOfPeople,
          service_location: serviceLocation,
          customer_location: customerLocation,
          travel_fee: travelFee,
          special_instructions: specialInstructions,
          updated_at: new Date().toISOString(),
        };
      }

      try {
        await sendBookingRequestEmails(booking);
      } catch (emailErr) {
        console.warn('⚠️ Booking request email notification failed:', emailErr?.message || emailErr);
      }

      // Create payment record (status: pending)
      const { data: payment, error: paymentError } =
        await supabase
          .from('payments')
          .insert([{
            booking_id: booking.id,
            service_id: serviceId,
            provider_id: providerId,
            user_id: currentUser.id,
            amount: totalToCharge,
            currency: 'NGN',
            payment_method: 'paystack',
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

      if (paymentError) throw paymentError;

      // Ensure Paystack script loaded
      try {
        await ensurePaystackLoaded();
      } catch (err) {
        alert('Paystack failed to load: ' + err.message);
        resetButton();
        return;
      }

      // Open Paystack
      const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: Math.round(totalToCharge * 100),
        currency: 'NGN',
        ref: 'VORA-' + Date.now(),
        metadata: {
          service_id: serviceId,
          request_id: requestId,
          offer_id: offerId,
          provider_id: providerId,
          booking_id: booking.id,
          payment_id: payment.id
        },

        // IMPORTANT: client receives reference, then calls server to verify
        callback: function (response) {
          (async () => {
            try {
              // Send reference to server for verification.
              // Server should call Paystack verify endpoint with secret key,
              // confirm status === 'success' and expected amount, then update DB.
              const verifyResp = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: response.reference,
                  paymentId: payment.id,
                  bookingId: booking.id
                })
              });

              if (!verifyResp.ok) {
                const errText = await verifyResp.text();
                console.error('Verification failed:', errText);
                alert('Payment verification failed. Please contact support.');
                resetButton();
                return;
              }

              const verifyJson = await verifyResp.json();
              if (verifyJson.success) {
                window.location.href = 'my-bookings.html';
              } else {
                console.error('Verification response:', verifyJson);
                window.location.href = 'payment-failed.html?reference=' + encodeURIComponent(response.reference);
              }
            } catch (err) {
              console.error('Verification error:', err);
              alert('Payment verification error. Please contact support.');
              resetButton();
            }
          })();
        },

        onClose: function () {
          resetButton();
          alert('Payment cancelled');
        }
      });

      handler.openIframe();

    } catch (err) {
      console.error(err);
      alert(err.message || 'Payment failed');
      resetButton();
    }

  });

  // =========================
  // RESET BUTTON
  // =========================
  function resetButton() {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Pay';
  }

});

// =========================
// NOTE: formatNGN removed (unused). Use imported formatPrice consistently.
// =========================
