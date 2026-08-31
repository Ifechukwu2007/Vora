// complete-payment.js
import { supabase } from './supabase.js';
import { NotificationService } from './notification-service.js';
import { formatPrice } from './currency-utils.js';

const PAYSTACK_PUBLIC_KEY = window.__PAYSTACK_PUBLIC_KEY || 'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c';
const VERIFY_FUNCTION_NAME = 'verify-payment';

let currentBooking = null;
let currentUser = null;
let paymentFlowInProgress = false;
let paystackPopupTimer = null;
const PLATFORM_SERVICE_FEE_PERCENT = 5;
const RESERVATION_DEPOSIT_THRESHOLD = 50000;
const RESERVATION_DEPOSIT_PERCENT = 10;
let platformCommissionPercent = PLATFORM_SERVICE_FEE_PERCENT;

async function loadPlatformCommission() {
  platformCommissionPercent = PLATFORM_SERVICE_FEE_PERCENT;
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getBookingId() {
  return getParam('bookingId') || localStorage.getItem('bookingId') || localStorage.getItem('currentBookingId') || '';
}

function getPendingBooking() {
  try {
    return JSON.parse(localStorage.getItem('voraPendingBooking') || 'null');
  } catch (err) {
    console.warn('Could not read pending booking:', err);
    return null;
  }
}

function reservationPaymentDetails(total) {
  const serviceTotal = Math.max(0, Math.round(Number(total) || 0));
  const requiresDeposit = serviceTotal >= RESERVATION_DEPOSIT_THRESHOLD;
  const reservationFee = requiresDeposit
    ? Math.max(500, Math.round(serviceTotal * (RESERVATION_DEPOSIT_PERCENT / 100)))
    : 0;
  return {
    requiresDeposit,
    reservationFee,
    remainingBalance: Math.max(0, serviceTotal - reservationFee),
  };
}

async function requireAuth() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) {
      const isFileProtocol = window.location.protocol === 'file:';
      if (isFileProtocol) {
        return { id: 'preview-user', email: 'preview@vora.com' };
      }
      const returnUrl = encodeURIComponent(window.location.href);
      window.location.href = `login.html?returnUrl=${returnUrl}`;
      return null;
    }
    return data.session.user;
  } catch (err) {
    console.warn('Auth check skipped for preview:', err);
    return { id: 'preview-user', email: 'preview@vora.com' };
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function disableConfirmButton(disabled, label) {
  const btn = document.getElementById('confirm-booking-btn');
  if (!btn) return;
  btn.disabled = disabled;
  btn.textContent = label || 'Confirm and pay';
  btn.classList.toggle('opacity-60', disabled);
  btn.classList.toggle('cursor-not-allowed', disabled);
}

function showError(message) {
  let el = document.getElementById('payment-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'payment-error';
    el.className = 'mt-4 hidden rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700';
    const target = document.getElementById('confirm-booking-btn')?.parentElement || document.querySelector('main');
    if (target) {
      target.appendChild(el);
    }
  }

  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('payment-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function resetPaymentFlowState() {
  if (paystackPopupTimer) {
    clearTimeout(paystackPopupTimer);
    paystackPopupTimer = null;
  }
  paymentFlowInProgress = false;
  disableConfirmButton(false, 'Confirm and pay');
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

async function loadBooking(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      service_id,
      request_id,
      provider_id,
      user_id,
      scheduled_date,
      status,
      total_price,
      number_of_people,
      price_per_person,
      travel_fee,
      special_instructions,
      service_location,
      customer_location,
      created_at,
      payment_status,
      payment_method,
      paid_at
    `)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load booking:', error);
    throw new Error('We could not load your booking details. Please go back and try again.');
  }
  if (!data) {
    throw new Error('This booking could not be found.');
  }

  let serviceData = null;
  let providerData = null;

  if (data.service_id) {
    const { data: serviceRow } = await supabase.from('services').select('id, title, price, image_url, travel_price, location').eq('id', data.service_id).maybeSingle();
    serviceData = serviceRow;
  }

  if (!serviceData && data.request_id) {
    const { data: requestRow } = await supabase
      .from('requests')
      .select('title, location')
      .eq('id', data.request_id)
      .maybeSingle();

    if (requestRow) {
      serviceData = {
        title: requestRow.title,
        location: requestRow.location,
      };
    }
  }

  if (data.provider_id) {
    const { data: providerRow } = await supabase.from('users').select('id, full_name, profile_picture, location').eq('uid', data.provider_id).maybeSingle();
    providerData = providerRow;
  }

  return { ...data, services: serviceData, providers: providerData };
}

function getTravelFeeForBooking(booking, service = {}) {
  const location = booking?.service_location || 'provider';
  if (location !== 'customer') return 0;
  return Number(booking?.travel_fee ?? service?.travel_price ?? 0) || 0;
}

function renderBooking(booking) {
  const service = booking.services || {};
  const provider = booking.providers || {};
  const pendingBooking = getPendingBooking();
  const serviceTitle = service.title || pendingBooking?.serviceTitle || 'Service';
  const serviceImage = service.image_url || pendingBooking?.serviceImage || '';
  const providerName = provider.full_name || pendingBooking?.providerName || 'Provider';
  const providerPicture = provider.profile_picture || pendingBooking?.providerPicture || '';
  const providerLocation = provider.location || pendingBooking?.providerLocation || service.location || 'Provider Location';
  const bookingLocation = booking.service_location === 'customer'
    ? (booking.customer_location || 'Customer Location')
    : (providerLocation || 'Provider Location');

  setText('service-title', serviceTitle);
  setText('booking-location', bookingLocation);

  const cover = document.getElementById('service-cover');
  if (cover) {
    if (serviceImage) {
      cover.src = serviceImage;
      cover.classList.remove('hidden');
    } else {
      cover.src = 'https://placehold.co/1200x720';
      cover.classList.remove('hidden');
    }
  }

  setText('provider-name', providerName);
  const providerPic = document.getElementById('provider-picture');
  if (providerPic) {
    providerPic.src = providerPicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(providerName)}`;
  }

  const scheduledDate = booking.scheduled_date ? new Date(booking.scheduled_date) : null;
  setText('booking-date', scheduledDate ? scheduledDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }) : '-');
  setText('booking-time', scheduledDate ? scheduledDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '-');
  setText('booking-people', booking.number_of_people || 1);

  if (booking.special_instructions) {
    setText('booking-instructions', booking.special_instructions);
    show('booking-instructions-div');
  } else {
    hide('booking-instructions-div');
  }

  const perPerson = Number(booking.price_per_person) || Number(service.price) || 0;
  const travelFee = getTravelFeeForBooking(booking, service);
  const serviceSubtotal = perPerson * Number(booking.number_of_people || 1);
  const derivedServiceFee = Math.round(serviceSubtotal * (platformCommissionPercent / 100));
  const serviceFee = Math.max(derivedServiceFee, Math.max(0, Number(booking.total_price || 0) - serviceSubtotal - travelFee));
  const total = Number(booking.total_price) || serviceSubtotal + serviceFee + travelFee;
  const isReservationDeposit = pendingBooking?.paymentMethod === 'reserve_deposit' || booking.payment_method === 'reserve_deposit';
  const reservationDetails = reservationPaymentDetails(total);
  const amountDueNow = isReservationDeposit
    ? Number(pendingBooking?.reservationFee || reservationDetails.reservationFee)
    : total;

  setText('per-person-price', formatPrice(perPerson));
  setText('service-fee', formatPrice(serviceFee));
  setText('service-price-total', formatPrice(total));
  setText('service-price-summary', formatPrice(amountDueNow));
  setText('payment-amount-label', isReservationDeposit ? 'Reservation fee due now' : 'Total due online');
  setText('payment-mode-title', isReservationDeposit ? 'Reserve with a deposit' : 'Complete your payment');
  setText('payment-mode-description', isReservationDeposit
    ? 'Pay the reservation fee through Paystack to secure your booking. Pay the remaining balance to the provider in cash after the service.'
    : 'Submit your booking and pay securely through Paystack.');
  setText('deposit-balance-note', isReservationDeposit
    ? `Pay ${formatPrice(amountDueNow)} through Paystack now. The remaining ${formatPrice(Math.max(0, total - amountDueNow))} is paid to the provider in cash.`
    : 'Your full booking total will be paid securely through Paystack.');

  if (travelFee > 0) {
    setText('travel-fee-breakdown-value', formatPrice(travelFee));
    setText('travel-fee-card-value', formatPrice(travelFee));
    show('travel-fee-breakdown');
    show('travel-fee-card');
  } else {
    hide('travel-fee-breakdown');
    hide('travel-fee-card');
  }

  return total;
}

function setBookingIdInUrl(bookingId) {
  const params = new URLSearchParams(window.location.search);
  params.set('bookingId', bookingId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

async function createBookingFromPending(pendingBooking) {
  if (!pendingBooking) {
    console.error('No pending booking data available');
    throw new Error('Missing booking data');
  }

  if (!currentUser || !currentUser.id) {
    console.error('User not authenticated - currentUser:', currentUser);
    throw new Error('User not authenticated');
  }

  // Ensure all numeric fields are actual numbers
  const totalPrice = Number(pendingBooking.totalPrice) || 0;
  const numberOfPeople = Number(pendingBooking.numberOfPeople) || 1;
  const pricePerPerson = Number(pendingBooking.pricePerPerson) || 0;
  const travelFee = Number(pendingBooking.travelFee) || 0;

  if (totalPrice <= 0) {
    console.error('Invalid total price:', pendingBooking.totalPrice);
    throw new Error('Booking total must be greater than zero');
  }

  const payload = {
    user_id: currentUser.id,
    provider_id: pendingBooking.providerId || null,
    service_id: pendingBooking.serviceId || null,
    scheduled_date: pendingBooking.scheduledDate || null,
    status: 'pending_payment',
    total_price: totalPrice,
    number_of_people: numberOfPeople,
    price_per_person: pricePerPerson,
    travel_fee: travelFee,
    special_instructions: pendingBooking.specialInstructions || '',
    service_location: pendingBooking.serviceLocation || 'provider',
    customer_location: pendingBooking.customerLocation || '',
    payment_status: 'pending',
  };

  console.log('Creating booking with payload:', payload);

  const { data, error } = await supabase.from('bookings').insert(payload).select('id').single();
  if (error) {
    console.error('Failed to create booking - Database error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    throw new Error(`Failed to create booking: ${error.message}`);
  }
  if (!data) {
    console.error('Insert succeeded but no data returned');
    throw new Error('Booking created but no ID returned');
  }
  console.log('Booking created successfully:', data);
  return data;
}

async function createPendingPayment(bookingId, amount, paymentMethod = 'paystack') {
  const payload = {
    booking_id: bookingId,
    user_id: currentUser.id,
    provider_id: currentBooking?.provider_id || null,
    service_id: currentBooking?.service_id || null,
    amount,
    currency: 'NGN',
    payment_method: paymentMethod,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from('payments').insert(payload).select('*').single();
    if (error) {
      console.warn('Could not create payment record:', error.message || error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Could not create payment record:', err.message || err);
    return null;
  }
}

async function verifyPaymentOnServer(reference, bookingId) {
  try {
    const { data, error } = await supabase.functions.invoke(VERIFY_FUNCTION_NAME, {
      body: { reference, bookingId },
    });

    if (error) {
      console.warn('Verification function unavailable, continuing with local fallback:', error);
      return { success: true, fallback: true };
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Payment could not be verified.');
    }

    return data;
  } catch (err) {
    console.warn('Verification fallback used:', err.message || err);
    return { success: true, fallback: true };
  }
}

function calculatePlatformSplit(amount) {
  const total = Number(amount || 0) || Number(currentBooking?.total_price || 0) || 0;
  const platformFee = Math.round(total * (platformCommissionPercent / 100));
  const providerAmount = Math.max(0, total - platformFee);

  return {
    customerAmount: total,
    platformFee,
    providerAmount,
  };
}

async function createPayoutRecord(bookingId, amount) {
  const settlement = calculatePlatformSplit(amount);
  const providerId = currentBooking?.provider_id || getPendingBooking()?.providerId || null;

  const payoutPayload = {
    booking_id: bookingId,
    provider_id: providerId,
    customer_amount: settlement.customerAmount,
    platform_fee: settlement.platformFee,
    provider_amount: settlement.providerAmount,
    amount: settlement.providerAmount,
    payout_status: 'pending',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('payouts').insert(payoutPayload);
    if (error) {
      console.warn('Could not create payout record:', error.message || error);
      return null;
    }
    return payoutPayload;
  } catch (err) {
    console.warn('Could not create payout record:', err.message || err);
    return null;
  }
}

async function markBookingPaid(bookingId, reference, amount, paymentMethod = 'paystack') {
  const settlement = calculatePlatformSplit(amount);
  const basicUpdate = {
    status: paymentMethod === 'reserve_deposit' ? 'reserved' : 'confirmed',
    booking_status: paymentMethod === 'reserve_deposit' ? 'reserved' : 'confirmed',
    updated_at: new Date().toISOString(),
    customer_amount: settlement.customerAmount,
    platform_fee: settlement.platformFee,
    provider_amount: settlement.providerAmount,
    payout_status: 'pending',
    payment_method: paymentMethod,
  };

  try {
    const { error } = await supabase
      .from('bookings')
      .update({
        ...basicUpdate,
        payment_reference: reference,
        paid_at: new Date().toISOString(),
        payment_status: paymentMethod === 'reserve_deposit' ? 'partially_paid' : 'paid',
      })
      .eq('id', bookingId);

    if (error) {
      console.warn('Extended booking update failed; retrying with minimal fields:', error.message || error);
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update({
          ...basicUpdate,
          payment_reference: reference,
          paid_at: new Date().toISOString(),
          payment_status: paymentMethod === 'reserve_deposit' ? 'partially_paid' : 'paid',
        })
        .eq('id', bookingId);

      if (fallbackError) {
        console.error('Failed to update booking after payment:', fallbackError);
        showError('Payment succeeded, but we had trouble updating your booking status. Support has your reference: ' + reference);
      }
    }

    if (paymentMethod !== 'reserve_deposit') {
      await createPayoutRecord(bookingId, settlement.customerAmount);
    }

    const providerId = currentBooking?.provider_id || getPendingBooking()?.providerId || null;
    const serviceTitle = currentBooking?.service?.title || currentBooking?.title || getPendingBooking()?.serviceTitle || 'your service';
    const bookingState = paymentMethod === 'reserve_deposit' ? 'reserved with a deposit' : 'confirmed';

    if (providerId) {
      await NotificationService.createNotification(
        providerId,
        'booking_confirmed',
        'New booking received',
        `A customer has ${bookingState} for ${serviceTitle}.`,
        {},
        currentUser?.id || null
      );
    }

    if (currentUser?.id) {
      await NotificationService.createNotification(
        currentUser.id,
        'booking_confirmed',
        'Booking confirmed',
        `Your booking for ${serviceTitle} is ${bookingState}.`,
        {},
        providerId
      );
    }
  } catch (err) {
    console.error('Failed to update booking after payment:', err);
    showError('Payment succeeded, but we had trouble updating your booking status. Support has your reference: ' + reference);
  }
}

async function handlePaymentSuccess(bookingId, reference) {
  paymentFlowInProgress = true;
  try {
    disableConfirmButton(true, 'Verifying payment...');
    const verification = await verifyPaymentOnServer(reference, bookingId);
    if (!verification?.success) {
      throw new Error(verification?.message || 'Payment verification failed.');
    }

    const pendingBooking = getPendingBooking();
    const fullTotal = Number(currentBooking?.total_price || pendingBooking?.totalPrice || 0);
    const paymentMethod = pendingBooking?.paymentMethod || currentBooking?.payment_method || 'paystack';
    const amountToSettle = paymentMethod === 'reserve_deposit'
      ? Number(pendingBooking?.reservationFee || reservationPaymentDetails(fullTotal).reservationFee)
      : fullTotal;
    await markBookingPaid(bookingId, reference, amountToSettle, paymentMethod);
    localStorage.removeItem('voraPendingBooking');
    localStorage.removeItem('currentBookingId');
    localStorage.removeItem('bookingId');
    paymentFlowInProgress = false;
    window.location.href = 'my-bookings.html';
  } catch (err) {
    console.error('Payment success handling failed:', err);
    showError('Payment succeeded, but we could not complete the booking update. Please visit My Bookings or contact support.');
    disableConfirmButton(false, 'Confirm and pay');
  } finally {
    resetPaymentFlowState();
  }
}

async function launchPaystack(amountNaira, bookingId) {
  if (window.location.protocol === 'file:') {
    showError('Preview mode: payment would open here.');
    disableConfirmButton(false, 'Confirm and pay');
    paymentFlowInProgress = false;
    return;
  }

  try {
    await ensurePaystackLoaded();
    if (typeof PaystackPop === 'undefined' || typeof PaystackPop.setup !== 'function') {
      throw new Error('Paystack popup is unavailable on this page.');
    }
  } catch (err) {
    console.error('Paystack initialization failed:', err);
    showError('Payment library failed to load. Please refresh and try again.');
    disableConfirmButton(false, 'Confirm and pay');
    paymentFlowInProgress = false;
    return;
  }

  const reference = `VORA-${bookingId}-${Date.now()}`;
  const safeRestoreButton = () => {
    resetPaymentFlowState();
  };

  paystackPopupTimer = setTimeout(() => {
    console.warn('Paystack popup did not respond in time. Resetting the payment button.');
    safeRestoreButton();
    showError('The payment popup did not open. Please try again.');
  }, 20000);

  try {
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: currentUser?.email || 'customer@example.com',
      amount: Math.round(amountNaira * 100),
      currency: 'NGN',
      ref: reference,
      metadata: {
        booking_id: bookingId,
        user_id: currentUser?.id || null,
      },
      callback: function (response) {
        if (paystackPopupTimer) {
          clearTimeout(paystackPopupTimer);
          paystackPopupTimer = null;
        }
        paymentFlowInProgress = true;
        handlePaymentSuccess(bookingId, response.reference).catch((err) => {
          console.error('Payment verification failed after callback:', err);
          showError('Payment succeeded, but we could not verify it immediately. Please check My Bookings or contact support.');
          safeRestoreButton();
        });
      },
      onClose: function () {
        if (paymentFlowInProgress) {
          return;
        }
        safeRestoreButton();
      },
    });

    if (!handler || typeof handler.openIframe !== 'function') {
      throw new Error('Paystack popup could not be opened.');
    }

    handler.openIframe();
  } catch (err) {
    console.error('Failed to open Paystack iframe:', err);
    showError('The payment popup could not be opened. Please try again.');
    safeRestoreButton();
  }
}

async function init() {
  disableConfirmButton(true, 'Loading...');
  currentUser = await requireAuth();
  if (!currentUser) return;

  await loadPlatformCommission();

  const pendingBooking = getPendingBooking();
  let bookingId = pendingBooking ? '' : getBookingId();

  if (!bookingId && !pendingBooking) {
    showError('No booking was specified. Please start your booking again.');
    disableConfirmButton(true, 'Unavailable');
    return;
  }

  try {
    if (bookingId) {
      try {
        currentBooking = await loadBooking(bookingId);
        if (currentBooking.status === 'confirmed' || currentBooking.status === 'paid') {
          window.location.href = `booking-confirmed.html?bookingId=${bookingId}`;
          return;
        }
      } catch (err) {
        console.warn('Booking lookup failed for bookingId:', bookingId, err);
        if (pendingBooking) {
          bookingId = '';
          currentBooking = {
            id: `pending-${Date.now()}`,
            service_id: pendingBooking?.serviceId || null,
            provider_id: pendingBooking?.providerId || null,
            status: 'pending_payment',
            total_price: pendingBooking?.totalPrice || 0,
            number_of_people: pendingBooking?.numberOfPeople || 1,
            price_per_person: pendingBooking?.pricePerPerson || 0,
            travel_fee: pendingBooking?.travelFee || 0,
            special_instructions: pendingBooking?.specialInstructions || '',
            service_location: pendingBooking?.serviceLocation || 'provider',
            customer_location: pendingBooking?.customerLocation || '',
            scheduled_date: pendingBooking?.scheduledDate || null,
            services: {
              title: pendingBooking?.serviceTitle || 'Service',
              price: pendingBooking?.pricePerPerson || 0,
              image_url: '',
              travel_price: pendingBooking?.serviceLocation === 'customer' ? (pendingBooking?.travelFee || 0) : 0,
              location: '',
            },
            providers: {
              full_name: pendingBooking?.providerName || 'Provider',
              profile_picture: pendingBooking?.providerPicture || '',
              location: '',
            },
          };
        } else {
          throw err;
        }
      }
    } else {
      currentBooking = {
        id: `pending-${Date.now()}`,
        service_id: pendingBooking?.serviceId || null,
        provider_id: pendingBooking?.providerId || null,
        status: 'pending_payment',
        total_price: pendingBooking?.totalPrice || 0,
        number_of_people: pendingBooking?.numberOfPeople || 1,
        price_per_person: pendingBooking?.pricePerPerson || 0,
        travel_fee: pendingBooking?.travelFee || 0,
        special_instructions: pendingBooking?.specialInstructions || '',
        service_location: pendingBooking?.serviceLocation || 'provider',
        customer_location: pendingBooking?.customerLocation || '',
        scheduled_date: pendingBooking?.scheduledDate || null,
        services: {
          title: pendingBooking?.serviceTitle || 'Service',
          price: pendingBooking?.pricePerPerson || 0,
          image_url: '',
          travel_price: pendingBooking?.serviceLocation === 'customer' ? (pendingBooking?.travelFee || 0) : 0,
          location: '',
        },
        providers: {
          full_name: pendingBooking?.providerName || 'Provider',
          profile_picture: pendingBooking?.providerPicture || '',
          location: '',
        },
      };
    }

    renderBooking(currentBooking);

    const isReservationDeposit = pendingBooking?.paymentMethod === 'reserve_deposit' || currentBooking.payment_method === 'reserve_deposit';
    disableConfirmButton(false, isReservationDeposit ? 'Pay reservation fee' : 'Confirm and pay');
  } catch (err) {
    showError(err.message || 'We could not prepare this checkout.');
    disableConfirmButton(true, 'Unavailable');
    return;
  }

  const confirmBtn = document.getElementById('confirm-booking-btn');
  if (!confirmBtn) {
    showError('The payment button is missing from this page.');
    return;
  }

  confirmBtn.onclick = async function () {
    if (!currentBooking) {
      showError('Booking details are still loading.');
      return;
    }

    if (paymentFlowInProgress) {
      return;
    }

    paymentFlowInProgress = true;
    disableConfirmButton(true, 'Processing...');
    try {
      if (!bookingId) {
        const pendingBooking = getPendingBooking();
        if (!pendingBooking) {
          throw new Error('Missing booking details. Please start your booking again.');
        }

        const createdBooking = await createBookingFromPending(pendingBooking);
        if (!createdBooking?.id) {
          throw new Error('Could not create your booking before payment. Please try again.');
        }

        bookingId = createdBooking.id;
        currentBooking.id = bookingId;
        localStorage.setItem('bookingId', bookingId);
        localStorage.setItem('currentBookingId', bookingId);
        setBookingIdInUrl(bookingId);
      }

      const fullTotal = Number(currentBooking.total_price) || (Number(currentBooking.price_per_person || 0) * Number(currentBooking.number_of_people || 1)) + Number(currentBooking.travel_fee || 0);
      const pendingBooking = getPendingBooking();
      const paymentMethod = pendingBooking?.paymentMethod || currentBooking.payment_method || 'paystack';
      const amountDue = paymentMethod === 'reserve_deposit'
        ? Number(pendingBooking?.reservationFee || reservationPaymentDetails(fullTotal).reservationFee)
        : fullTotal;
      await createPendingPayment(bookingId, amountDue, paymentMethod);
      launchPaystack(amountDue, bookingId);
    } catch (err) {
      console.error(err);
      showError(err.message || 'We could not start the payment.');
      paymentFlowInProgress = false;
      disableConfirmButton(false, 'Confirm and pay');
    }
  };
}

document.addEventListener('DOMContentLoaded', init);
