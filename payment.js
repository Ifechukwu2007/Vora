import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

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

  const basePriceEl = document.getElementById('base-price');
  const feeEl = document.getElementById('service-fee');
  const totalAmountEl = document.getElementById('service-price');

  const userInfoEl = document.getElementById('user-info');

  // =========================
  // URL PARAMS
  // =========================
  const params = new URLSearchParams(window.location.search);

  const serviceId = params.get('serviceId');
  const providerId = params.get('providerId');

  const scheduledDate =
    params.get('scheduledDate') ||
    new Date().toISOString();

  let totalPrice =
    Number(params.get('totalPrice')) || 0;

  // =========================
  // VALIDATION
  // =========================
  if (!serviceId || !providerId) {
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
  // FETCH SERVICE
  // =========================
  let serviceData = null;

  try {

    const { data: service, error: serviceError } =
      await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();

    if (serviceError) throw serviceError;

    serviceData = service;

    // price fallback
    if (!totalPrice || totalPrice <= 0) {
      totalPrice = Number(service.price) || 0;
    }

    if (serviceTitleEl) {
      serviceTitleEl.textContent = service.title || 'Service';
    }

    // =========================
    // FETCH PROVIDER (SERVICE OWNER EMAIL)
    // =========================
    const { data: provider, error: providerError } =
      await supabase
        .from('profiles')
        .select('email')
        .eq('id', providerId)
        .maybeSingle();

    if (providerError) {
      console.error(providerError);
    }

    const providerEmail =
      provider?.email || 'provider@vora.com';

    if (providerNameEl) {
      providerNameEl.textContent = providerEmail;
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
      // CREATE BOOKING
      // =========================
      const { data: booking, error: bookingError } =
        await supabase
          .from('bookings')
          .insert([{
            service_id: serviceId,
            provider_id: providerId,
            user_id: currentUser.id,
            scheduled_date: scheduledDate,
            total_price: totalPrice,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

      if (bookingError) throw bookingError;

      // =========================
      // CREATE PAYMENT
      // =========================
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
          provider_id: providerId,
          booking_id: booking.id,
          payment_id: payment.id
        },

        callback: function (response) {

          (async () => {
            try {

              await supabase
                .from('payments')
                .update({
                  status: 'paid',
                  provider_reference: response.reference,
                  updated_at: new Date().toISOString()
                })
                .eq('id', payment.id);

              await supabase
                .from('bookings')
                .update({
                  status: 'confirmed',
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