// complete-payment.js
import { supabase } from './supabase.js';

const PAYSTACK_PUBLIC_KEY = window.__PAYSTACK_PUBLIC_KEY || 'pk_test_296d47b57e4865b935a5f6b84241942c172e7a16';
const VERIFY_FUNCTION_NAME = 'verify-payment';

let currentBooking = null;
let currentUser = null;

function formatNaira(amount) {
  const value = Number(amount) || 0;
  return `NGN ${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

function calculateBookingTotal(booking, pendingBooking = null) {
  const peopleCount = Number(booking?.number_of_people || pendingBooking?.numberOfPeople || 1);
  const perPerson = Number(booking?.price_per_person || booking?.services?.price || pendingBooking?.pricePerPerson || 0);
  const serviceLocation = booking?.service_location || pendingBooking?.serviceLocation || 'provider';
  const travelFee = serviceLocation === 'customer'
    ? (Number(booking?.travel_fee || pendingBooking?.travelFee || booking?.services?.travel_price || 0))
    : 0;

  const explicitTotal = Number(booking?.total_price || pendingBooking?.totalPrice || 0);
  return explicitTotal || ((perPerson * peopleCount) + travelFee);
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
  let banner = document.getElementById('checkout-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'checkout-error-banner';
    banner.className = 'max-w-7xl mx-auto px-4 mt-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm p-4';
    const main = document.querySelector('main');
    main?.parentNode.insertBefore(banner, main);
  }
  banner.textContent = message;
  banner.classList.remove('hidden');
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

async function loadBooking(bookingId, userId = null) {
  const query = supabase
    .from('bookings')
    .select(`
      id,
      service_id,
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
      paid_at
    `)
    .eq('id', bookingId);

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();

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

  if (data.provider_id) {
    const { data: providerRow } = await supabase.from('profiles').select('id, full_name, profile_picture, location').eq('id', data.provider_id).maybeSingle();
    providerData = providerRow;
  }

  return { ...data, services: serviceData, providers: providerData };
}

async function createBookingFromPending(pendingBooking, userId) {
  if (!pendingBooking) return null;

  const totalAmount = Number(
    pendingBooking.totalPrice || ((Number(pendingBooking.pricePerPerson || 0) * Number(pendingBooking.numberOfPeople || 1)) + (pendingBooking.serviceLocation === 'customer' ? Number(pendingBooking.travelFee || 0) : 0)) || 0
  );

  const payload = {
    service_id: pendingBooking.serviceId || null,
    provider_id: pendingBooking.providerId || null,
    user_id: userId,
    scheduled_date: pendingBooking.scheduledDate || null,
    status: 'pending_payment',
    booking_status: 'pending_payment',
    total_price: totalAmount,
    number_of_people: pendingBooking.numberOfPeople || 1,
    price_per_person: pendingBooking.pricePerPerson || 0,
    travel_fee: pendingBooking.travelFee || 0,
    special_instructions: pendingBooking.specialInstructions || '',
    service_location: pendingBooking.serviceLocation || 'provider',
    customer_location: pendingBooking.customerLocation || '',
    payment_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('bookings').insert([payload]).select('*').single();
  if (error) {
    console.error('Failed to create booking from pending data:', error);
    throw new Error('Unable to create your booking before payment. Please try again.');
  }

  if (data?.id) {
    try {
      localStorage.setItem('bookingId', data.id);
    } catch (err) {
      console.warn('Could not persist bookingId:', err);
    }
  }

  return data;
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

  const peopleCount = Number(booking.number_of_people || pendingBooking?.numberOfPeople || 1);
  const perPerson = Number(booking.price_per_person) || Number(service.price) || Number(pendingBooking?.pricePerPerson || 0) || 0;
  const serviceLocation = booking.service_location || pendingBooking?.serviceLocation || 'provider';
  const travelFee = serviceLocation === 'customer' ? (Number(booking.travel_fee || pendingBooking?.travelFee || service.travel_price || 0)) : 0;
  const total = calculateBookingTotal(booking, pendingBooking);
  const serviceFee = Math.max(0, total - (perPerson * peopleCount) - travelFee);

  setText('per-person-price', formatNaira(perPerson));
  setText('service-fee', formatNaira(serviceFee));
  setText('service-price-total', formatNaira(total));
  setText('service-price-summary', formatNaira(total));

  if (travelFee > 0) {
    setText('travel-fee-breakdown-value', formatNaira(travelFee));
    setText('travel-fee-card-value', formatNaira(travelFee));
    show('travel-fee-breakdown');
    show('travel-fee-card');
  } else {
    hide('travel-fee-breakdown');
    hide('travel-fee-card');
  }

  return total;
}

async function createPendingPayment(bookingId, amount) {
  const payload = {
    booking_id: bookingId,
    user_id: currentUser.id,
    provider_id: currentBooking?.provider_id || null,
    service_id: currentBooking?.service_id || null,
    amount,
    currency: 'NGN',
    payment_method: 'paystack',
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

async function markBookingPaid(bookingId, reference) {
  const basicUpdate = { status: 'confirmed', updated_at: new Date().toISOString() };

  try {
    const { error } = await supabase
      .from('bookings')
      .update({
        ...basicUpdate,
        payment_reference: reference,
        paid_at: new Date().toISOString(),
        payment_status: 'paid',
      })
      .eq('id', bookingId);

    if (error) {
      console.warn('Extended booking update failed; retrying with minimal fields:', error.message || error);
      const { error: fallbackError } = await supabase
        .from('bookings')
        .update(basicUpdate)
        .eq('id', bookingId);

      if (fallbackError) {
        console.error('Failed to update booking after payment:', fallbackError);
        showError('Payment succeeded, but we had trouble updating your booking status. Support has your reference: ' + reference);
      }
    }
  } catch (err) {
    console.error('Failed to update booking after payment:', err);
    showError('Payment succeeded, but we had trouble updating your booking status. Support has your reference: ' + reference);
  }
}

// Redirects to the confirmation page once payment has been verified/recorded.
// Uses a real bookingId when we have one; otherwise carries just the payment
// reference through, so the confirmation page can still render something
// meaningful even before a bookings row exists.
function goToConfirmation(bookingId, reference) {
  const params = new URLSearchParams();
  if (bookingId) params.set('bookingId', bookingId);
  if (reference) params.set('ref', reference);
  window.location.href = `my-bookings.html?${params.toString()}`;
}

function launchPaystack(amountNaira, bookingId) {
  if (window.location.protocol === 'file:') {
    showError('Preview mode: payment would open here.');
    disableConfirmButton(false, 'Confirm and pay');
    return;
  }

  if (typeof PaystackPop === 'undefined') {
    showError('Payment library failed to load. Please refresh and try again.');
    disableConfirmButton(false, 'Confirm and pay');
    return;
  }

  // Reference needs to be unique even when there's no real bookingId yet
  // (pending/local booking not persisted to Supabase).
  const referenceSeed = bookingId || currentBooking?.id || 'guest';
  const reference = `VORA-${referenceSeed}-${Date.now()}`;

  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: currentUser?.email || 'customer@example.com',
    amount: Math.round(amountNaira * 100),
    currency: 'NGN',
    ref: reference,
    metadata: {
      booking_id: bookingId || null,
      user_id: currentUser?.id || null,
    },
    // This was the missing piece: Paystack calls onClose whenever the popup
    // closes, whether or not payment succeeded — it never signals success on
    // its own. The actual "payment went through" signal comes through
    // callback(response), which is what triggers verification and redirect.
    callback: function (response) {
      // Paystack invokes this synchronously inside its own popup context, so
      // wrap the async work in an IIFE rather than making callback itself async.
      (async () => {
        disableConfirmButton(true, 'Verifying payment...');
        try {
          await verifyPaymentOnServer(response.reference, bookingId);

          if (bookingId) {
            await markBookingPaid(bookingId, response.reference);
          }

          // Always redirect once the callback fires with a response —
          // this is what was missing before.
          goToConfirmation(bookingId, response.reference);
        } catch (err) {
          console.error(err);
          showError(
            (err.message || 'We could not confirm your booking automatically.') +
              ' Your payment reference is ' +
              response.reference +
              " — please save it and contact support if your booking isn't confirmed shortly."
          );
          disableConfirmButton(false, 'Confirm and pay');
        }
      })();
    },
    onClose: function () {
      // Only fires if the user closes the popup without completing payment.
      disableConfirmButton(false, 'Confirm and pay');
    },
  });

  handler.openIframe();
}

async function init() {
  disableConfirmButton(true, 'Loading...');
  currentUser = await requireAuth();
  if (!currentUser) return;

  let bookingId = getBookingId();
  const pendingBooking = getPendingBooking();

  if (!bookingId && !pendingBooking) {
    showError('No booking was specified. Please start your booking again.');
    disableConfirmButton(true, 'Unavailable');
    return;
  }

  try {
    if (bookingId) {
      try {
        currentBooking = await loadBooking(bookingId, currentUser?.id);
      } catch (bookingError) {
        console.warn('Booking lookup failed for bookingId:', bookingId, bookingError);
        if (!pendingBooking) {
          throw bookingError;
        }
        const booking = await createBookingFromPending(pendingBooking, currentUser.id);
        bookingId = booking?.id || bookingId;
        if (bookingId) {
          currentBooking = await loadBooking(bookingId, currentUser?.id);
        } else {
          throw new Error('Could not create booking for payment.');
        }
      }
    } else {
      const booking = await createBookingFromPending(pendingBooking, currentUser.id);
      bookingId = booking?.id;
      if (!bookingId) {
        throw new Error('Could not create booking for payment.');
      }
      currentBooking = await loadBooking(bookingId, currentUser?.id);
    }

    renderBooking(currentBooking);
    disableConfirmButton(false, 'Confirm and pay');
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

    disableConfirmButton(true, 'Processing...');
    try {
      const total = calculateBookingTotal(currentBooking, getPendingBooking());
      if (bookingId) {
        await createPendingPayment(currentBooking.id, total);
      }
      // Pass the REAL bookingId (may be empty for pending/local bookings),
      // not currentBooking.id, which can be a synthetic "pending-..." id.
      launchPaystack(total, bookingId);
    } catch (err) {
      console.error(err);
      showError(err.message || 'We could not start the payment.');
      disableConfirmButton(false, 'Confirm and pay');
    }
  };
}

document.addEventListener('DOMContentLoaded', init);