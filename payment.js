import { supabase } from './supabase.js';
import { updateProfilePictureInHeader } from './auth.js';

function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
}

document.addEventListener('DOMContentLoaded', async () => {

  // Update profile picture in header
  await updateProfilePictureInHeader();

  // =========================
  // PAYSTACK KEY
  // =========================
  const PAYSTACK_PUBLIC_KEY =
    'pk_test_296d47b57e4865b935a5f6b84241942c172e7a16';

  // =========================
  // ELEMENTS
  // =========================
  const confirmBtn = document.getElementById('confirm-booking-btn');

  const serviceTitleEl = document.getElementById('service-title');
  const providerNameEl = document.getElementById('provider-name');
  const providerPictureEl = document.getElementById('provider-picture');

  const basePriceEl = document.getElementById('base-price');
  const feeEl = document.getElementById('service-fee');
  const totalAmountEl = document.getElementById('service-price');

  const userInfoEl = document.getElementById('user-info');

  // =========================
  // URL PARAMS
  // =========================
  const params = new URLSearchParams(window.location.search);

  const serviceId = params.get('serviceId');
  const requestId = params.get('requestId');
  const offerId = params.get('offerId');
  const providerId = params.get('providerId');

  const scheduledDate =
    params.get('scheduledDate') ||
    new Date().toISOString();

  let totalPrice =
    Number(params.get('totalPrice')) || 0;

  // NEW BOOKING FIELDS
  const numberOfPeople = parseInt(params.get('numberOfPeople')) || 1;
  const serviceLocation = params.get('serviceLocation') || 'provider';
  const travelFee = parseInt(params.get('travelFee')) || 0;
  const specialInstructions = params.get('specialInstructions') || '';

  // =========================
  // VALIDATION
  // =========================
  if ((!serviceId && !requestId) || !providerId) {
    alert('Missing booking details');
    return;
  }

  // =========================
  // AUTH USER
  // =========================
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData?.user) {
    alert('Please login first');
    window.location.href = 'login.html';
    return;
  }

  const currentUser = authData.user;

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
  let displayTitle = 'Service';

  try {
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

      // price fallback
      if (!totalPrice || totalPrice <= 0) {
        totalPrice = Number(service.price) || 0;
      }
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
    // FETCH PROVIDER (SERVICE OWNER EMAIL)
    // =========================
    let providerEmail = 'provider@vora.com';
    let providerPicture = 'https://ui-avatars.com/api/?name=User';

    // First priority: get email from services table (stored when service was created)
    if (serviceData?.provider_email) {
      providerEmail = serviceData.provider_email;
    }
    
    // Fetch full provider profile
    const { data: providerData, error: providerError } =
      await supabase
        .from('profiles')
        .select('email, profile_picture')
        .eq('id', providerId)
        .maybeSingle();

    const provider = normalizeProfile(providerData);

    if (provider) {
      if (provider.email) {
        providerEmail = provider.email; 
      }
      if (provider.profile_picture) {
        providerPicture = provider.profile_picture;
      }
    } else if (providerError) {
      console.error('Error fetching provider profile:', providerError);
    }

    if (providerNameEl) {
      providerNameEl.textContent = providerEmail;
    }

    if (providerPictureEl) {
      providerPictureEl.src = providerPicture;
    }

    // =========================
    // DISPLAY BOOKING DETAILS
    // =========================
    // Format scheduled date and time
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
    const travelFeeRowEl = document.getElementById('travel-fee-row');
    const travelFeeDisplayEl = document.getElementById('travel-fee-display');

    if (bookingPeopleEl) bookingPeopleEl.textContent = numberOfPeople;
    if (bookingDateEl) bookingDateEl.textContent = dateStr;
    if (bookingTimeEl) bookingTimeEl.textContent = timeStr;
    if (bookingLocationEl) bookingLocationEl.textContent = serviceLocation === 'provider' ? 'Provider\'s Location' : 'My Location';

    if (specialInstructions) {
      if (bookingInstructionsEl) bookingInstructionsEl.textContent = specialInstructions;
      if (bookingInstructionsDivEl) bookingInstructionsDivEl.classList.remove('hidden');
    }

    if (travelFee > 0) {
      if (bookingTravelFeeEl) bookingTravelFeeEl.classList.remove('hidden');
      if (travelFeeAmountEl) travelFeeAmountEl.textContent = `₦${travelFee.toLocaleString()}`;
      if (travelFeeRowEl) travelFeeRowEl.classList.remove('hidden');
      if (travelFeeDisplayEl) travelFeeDisplayEl.textContent = `NGN ${formatNGN(travelFee)}`;
    }

  } catch (err) {
    console.error(err);
    alert('Failed to load service');
    return;
  }

  // =========================
  // PRICE BREAKDOWN
  // =========================
  const feeRate = 0.10;

  const serviceFee = Math.round(totalPrice * feeRate);
  const basePrice = totalPrice - serviceFee;

  if (basePriceEl) {
    basePriceEl.textContent = `NGN ${formatNGN(basePrice)}`;
  }

  if (feeEl) {
    feeEl.textContent = `NGN ${formatNGN(serviceFee)}`;
  }

  if (totalAmountEl) {
    totalAmountEl.textContent = `NGN ${formatNGN(totalPrice)}`;
  }

  // =========================
  // PAYMENT CLICK
  // =========================
  confirmBtn.addEventListener('click', async () => {

    try {

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';


      // =========================
      // CREATE BOOKING (Stage 1: Customer Books)
      // =========================
      // Status: pending_payment
      const bookingPayload = {
        provider_id: providerId,
        user_id: currentUser.id,
        scheduled_date: scheduledDate,
        total_price: totalPrice,
        status: 'pending_payment',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        number_of_people: numberOfPeople,
        price_per_person: (totalPrice - travelFee) / numberOfPeople,
        service_location: serviceLocation,
        travel_fee: travelFee,
        special_instructions: specialInstructions,
        ...(serviceId ? { service_id: serviceId } : {}),
        ...(requestId ? { request_id: requestId } : {})
      };

      const { data: booking, error: bookingError } =
        await supabase
          .from('bookings')
          .insert([bookingPayload])
          .select()
          .single();

      if (bookingError) throw bookingError;


      // =========================
      // CREATE PAYMENT (Stage 2: Customer Pays)
      // =========================
      // Status: pending
      const { data: payment, error: paymentError } =
        await supabase
          .from('payments')
          .insert([{
            booking_id: booking.id,
            service_id: serviceId,
            provider_id: providerId,
            user_id: currentUser.id,
            amount: totalPrice,
            currency: 'NGN',
            payment_method: 'paystack',
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

      if (paymentError) throw paymentError;

      // =========================
      // PAYSTACK CHECK
      // =========================
      if (typeof PaystackPop === 'undefined') {
        alert('Paystack failed to load');
        resetButton();
        return;
      }

      // =========================
      // OPEN PAYSTACK
      // =========================
      const handler = PaystackPop.setup({

        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: Math.round(totalPrice * 100),
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


        // Stage 2: Payment Success
        callback: function (response) {
          (async () => {
            try {
              // Update payment to paid
              await supabase
                .from('payments')
                .update({
                  status: 'paid',
                  provider_reference: response.reference,
                  updated_at: new Date().toISOString()
                })
                .eq('id', payment.id);

              // Update booking to paid
              await supabase
                .from('bookings')
                .update({
                  status: 'paid',
                  updated_at: new Date().toISOString()
                })
                .eq('id', booking.id);

              alert('Payment successful');
              window.location.href = 'my-bookings.html';
            } catch (err) {
              console.error(err);
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
// FORMAT MONEY
// =========================
function formatNGN(value) {
  return new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}