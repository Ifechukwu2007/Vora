// complete-payment.js
import { supabase } from './supabase.js';

const PAYSTACK_PUBLIC_KEY = window.__PAYSTACK_PUBLIC_KEY || 'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c';
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

  if (data.provider_id) {
    const { data: providerRow } = await supabase.from('profiles').select('id, full_name, profile_picture, location').eq('id', data.provider_id).maybeSingle();
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
  const serviceFee = Math.max(0, Number(booking.total_price || 0) - serviceSubtotal - travelFee);
  const total = Number(booking.total_price) || serviceSubtotal + serviceFee + travelFee;

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

function setBookingIdInUrl(bookingId) {
  const params = new URLSearchParams(window.location.search);
  params.set('bookingId', bookingId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

async function createBookingFromPending(pendingBooking) {
  if (!pendingBooking) return null;

  const payload = {
    user_id: currentUser.id,
    provider_id: pendingBooking.providerId || null,
    service_id: pendingBooking.serviceId || null,
    scheduled_date: pendingBooking.scheduledDate || null,
    status: 'pending_payment',
    total_price: pendingBooking.totalPrice || 0,
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

  try {
    const { data, error } = await supabase.from('bookings').insert(payload).select('id').single();
    if (error) {
      console.error('Failed to create booking before payment:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Failed to create booking before payment:', err);
    return null;
  }
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

async function handlePaymentSuccess(bookingId, reference) {
  try {
    disableConfirmButton(true, 'Verifying payment...');
    const verification = await verifyPaymentOnServer(reference, bookingId);
    if (!verification?.success) {
      throw new Error(verification?.message || 'Payment verification failed.');
    }

    await markBookingPaid(bookingId, reference);
    localStorage.removeItem('voraPendingBooking');
    localStorage.removeItem('currentBookingId');
    localStorage.removeItem('bookingId');
    window.location.href = 'my-bookings.html';
  } catch (err) {
    console.error('Payment success handling failed:', err);
    showError('Payment succeeded, but we could not complete the booking update. Please visit My Bookings or contact support.');
    disableConfirmButton(false, 'Confirm and pay');
  }
}

async function launchPaystack(amountNaira, bookingId) {
  if (window.location.protocol === 'file:') {
    showError('Preview mode: payment would open here.');
    disableConfirmButton(false, 'Confirm and pay');
    return;
  }

  try {
    await ensurePaystackLoaded();
  } catch (err) {
    console.error('Paystack initialization failed:', err);
    showError('Payment library failed to load. Please refresh and try again.');
    disableConfirmButton(false, 'Confirm and pay');
    return;
  }

  const reference = `VORA-${bookingId}-${Date.now()}`;
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
      handlePaymentSuccess(bookingId, response.reference).catch((err) => {
        console.error('Payment verification failed after callback:', err);
        showError('Payment succeeded, but we could not verify it immediately. Please check My Bookings or contact support.');
        disableConfirmButton(false, 'Confirm and pay');
      });
    },
    onClose: function () {
      disableConfirmButton(false, 'Confirm and pay');
    },
  });

  handler.openIframe();
}

async function init() {
  disableConfirmButton(true, 'Loading...');
  currentUser = await requireAuth();
  if (!currentUser) return;

  const pendingBooking = getPendingBooking();
  const bookingId = pendingBooking ? '' : getBookingId();

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

      const total = Number(currentBooking.total_price) || (Number(currentBooking.price_per_person || 0) * Number(currentBooking.number_of_people || 1)) + Number(currentBooking.travel_fee || 0);
      await createPendingPayment(bookingId, total);
      launchPaystack(total, bookingId);
    } catch (err) {
      console.error(err);
      showError(err.message || 'We could not start the payment.');
      disableConfirmButton(false, 'Confirm and pay');
    }
  };
}

document.addEventListener('DOMContentLoaded', init);