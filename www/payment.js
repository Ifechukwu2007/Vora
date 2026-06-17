import { supabase } from './supabase.js';
import { updateProfilePictureInHeader } from './auth.js';
import { formatPrice } from './currency-utils.js';

function normalizeProfile(profile) {
    if (!profile) return null;
    return Array.isArray(profile) ? profile[0] : profile;
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

document.addEventListener('DOMContentLoaded', async () => {

  // Update profile picture in header
  await updateProfilePictureInHeader();

  // =========================
  // PAYSTACK KEY
  // =========================
  const PAYSTACK_PUBLIC_KEY =
    'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c';

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
  const perPersonPriceEl = document.getElementById('per-person-price');

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
  const customerLocation = params.get('customerLocation') || '';
  const travelFee = parseInt(params.get('travelFee')) || 0;
  const specialInstructions = params.get('specialInstructions') || '';
  const paramPricePerPerson = Number(params.get('pricePerPerson')) || 0;
  const paramDiscountedTotal = Number(params.get('discountedTotal')) || 0;

  let bookingPrice = {
    perPerson: paramPricePerPerson || (numberOfPeople > 0 ? Math.round((totalPrice - travelFee) / numberOfPeople) : 0),
    total: paramDiscountedTotal || totalPrice,
    travelFee,
  };

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

      const calculatedBookingPrice = calculateBookingPrice(serviceData, numberOfPeople, serviceLocation);
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
    const perPersonPriceEl = document.getElementById('per-person-price');
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
    } else {
      if (travelFeeRowEl) travelFeeRowEl.classList.add('hidden');
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
      const bookingPrice = calculateBookingPrice(serviceData, numberOfPeople, serviceLocation);
      totalPrice = bookingPrice.total;
      const originalServicePrice = numberOfPeople * (Number(serviceData.price) || 0);
      const discountedServicePrice = numberOfPeople * bookingPrice.perPerson;

      if (totalAmountEl) {
        totalAmountEl.textContent = formatPrice(bookingPrice.total);
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
    }

  } catch (err) {
    console.error(err);
    alert('Failed to load service');
    return;
  }

  // =========================
  // PRICE BREAKDOWN
  // =========================
  const feeRate = 0.05; // 5% service fee

  const serviceFee = Math.round(totalPrice * feeRate);
    const baseServicePrice = Math.max(0, totalPrice - travelFee - serviceFee);
  if (basePriceEl) {
    basePriceEl.textContent = formatPrice(baseServicePrice);
  }

  if (feeEl) {
    feeEl.textContent = formatPrice(serviceFee);
  }

  if (totalAmountEl) {
    totalAmountEl.textContent = formatPrice(totalPrice);
  }
  if (perPersonPriceEl) {
    perPersonPriceEl.textContent = formatPrice(bookingPrice.perPerson);
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
      const bookingPriceForPayload = bookingPrice;
      const totalToCharge = bookingPriceForPayload.total;
      const perPersonToCharge = bookingPriceForPayload.perPerson;

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