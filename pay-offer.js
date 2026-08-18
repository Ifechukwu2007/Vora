import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
|--------------------------------------------------------------------------
| VORA PAYMENT CONFIGURATION
|--------------------------------------------------------------------------
|
| Replace these with your actual Supabase project values.
|
*/

const supabaseUrl = 'https://bbjyfmgisxzjruqkjxlo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJianlmbWdpc3h6anJ1cWtqeGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2Njk1NzUsImV4cCI6MjA5NDI0NTU3NX0.mF5_W7ZgMsWvb6YY0wRD2dPuAw_37TmMWP2_NkMap0E'

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const CONFIG = {
  // Default service fee if the settings table cannot be read.
  DEFAULT_SERVICE_FEE_PERCENT: 10,

  // Minimum service fee in NGN.
  DEFAULT_MIN_SERVICE_FEE: 0,

  // Paystack currency.
  CURRENCY: "NGN",

  // Payment timeout.
  PAYMENT_TIMEOUT_MS: 120000
};

/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const $ = (id) => document.getElementById(id);

const serviceTitle = $("service-title");
const bookingLocation = $("booking-location");

const providerPicture = $("provider-picture");
const providerName = $("provider-name");

const bookingDate = $("booking-date");
const bookingTime = $("booking-time");

const bookingInstructionsDiv = $("booking-instructions-div");
const bookingInstructions = $("booking-instructions");

const bookingPeople = $("booking-people");

const perPersonPrice = $("per-person-price");
const serviceFee = $("service-fee");

const travelFeeBreakdown = $("travel-fee-breakdown");
const travelFeeBreakdownValue = $("travel-fee-breakdown-value");

const servicePriceTotal = $("service-price-total");
const servicePriceSummary = $("service-price-summary");

const paymentError = $("payment-error");
const confirmBookingBtn = $("confirm-booking-btn");

/*
|--------------------------------------------------------------------------
| STATE
|--------------------------------------------------------------------------
*/

let offer = null;
let booking = null;
let provider = null;
let service = null;

let paymentCalculation = null;
let isProcessingPayment = false;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function money(amount) {
  const value = Number(amount || 0);

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function number(value) {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}

function roundNGN(value) {
  return Math.round(number(value));
}

function showError(message) {
  paymentError.textContent = message;
  paymentError.classList.remove("hidden");

  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: "smooth"
  });
}

function clearError() {
  paymentError.textContent = "";
  paymentError.classList.add("hidden");
}

function setButtonLoading(loading) {
  isProcessingPayment = loading;

  confirmBookingBtn.disabled = loading;

  if (loading) {
    confirmBookingBtn.textContent = "Opening secure payment…";
  } else {
    confirmBookingBtn.textContent = "Pay with Paystack";
  }
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);

  return {
    offerId:
      params.get("offer_id") ||
      params.get("offerId") ||
      params.get("id"),

    bookingId:
      params.get("booking_id") ||
      params.get("bookingId"),

    requestId:
      params.get("request_id") ||
      params.get("requestId")
  };
}

function getCurrentUser() {
  return supabase.auth.getUser();
}

function safeDate(dateValue) {
  if (!dateValue) return "—";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function safeTime(timeValue) {
  if (!timeValue) return "—";

  /*
   * Handles:
   * 14:30
   * 14:30:00
   * ISO date strings
   */

  if (/^\d{2}:\d{2}/.test(String(timeValue))) {
    const [hours, minutes] = String(timeValue).split(":");

    const d = new Date();

    d.setHours(Number(hours), Number(minutes), 0, 0);

    return d.toLocaleTimeString("en-NG", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  const d = new Date(timeValue);

  if (Number.isNaN(d.getTime())) {
    return String(timeValue);
  }

  return d.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit"
  });
}

/*
|--------------------------------------------------------------------------
| LOAD OFFER
|--------------------------------------------------------------------------
*/

async function loadOffer() {
  const { offerId, bookingId } = getUrlParams();

  if (!offerId && !bookingId) {
    throw new Error(
      "This payment page is missing the offer or booking ID."
    );
  }

  const { data: userData, error: userError } =
    await getCurrentUser();

  if (userError || !userData?.user) {
    throw new Error(
      "Please log in before paying for this offer."
    );
  }

  const user = userData.user;

  /*
   * If offer_id exists, load the offer.
   */

  if (offerId) {
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();

    if (error) {
      console.error(error);
      throw new Error("Unable to load the provider offer.");
    }

    if (!data) {
      throw new Error("This offer could not be found.");
    }

    offer = data;
  }

  /*
   * Load booking.
   */

  let bookingQuery = supabase
    .from("bookings")
    .select("*");

  if (bookingId) {
    bookingQuery = bookingQuery.eq("id", bookingId);
  } else if (offer?.booking_id) {
    bookingQuery = bookingQuery.eq("id", offer.booking_id);
  } else if (offer?.request_id) {
    bookingQuery = bookingQuery.eq("request_id", offer.request_id);
  }

  const { data: bookingData, error: bookingError } =
    await bookingQuery.maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    throw new Error("Unable to load the booking.");
  }

  if (!bookingData) {
    throw new Error("The booking associated with this offer was not found.");
  }

  booking = bookingData;

  /*
   * Security check:
   * The logged-in user must own the booking.
   */

  const customerId =
    booking.user_id ||
    booking.customer_id;

  if (
    customerId &&
    customerId !== user.id
  ) {
    throw new Error(
      "You are not authorized to pay for this booking."
    );
  }

  /*
   * Load provider.
   */

  const providerId =
    offer?.provider_id ||
    booking.provider_id;

  if (providerId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", providerId)
      .maybeSingle();

    if (!error && data) {
      provider = data;
    } else {
      /*
       * Some Vora installations may store providers
       * in the users table.
       */

      const fallback = await supabase
        .from("users")
        .select("*")
        .eq("id", providerId)
        .maybeSingle();

      if (!fallback.error) {
        provider = fallback.data;
      }
    }
  }

  /*
   * Load service.
   */

  const serviceId =
    offer?.service_id ||
    booking.service_id;

  if (serviceId) {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .maybeSingle();

    if (!error) {
      service = data;
    }
  }

  return user;
}

/*
|--------------------------------------------------------------------------
| GET PLATFORM SETTINGS
|--------------------------------------------------------------------------
*/

async function getPlatformSettings() {
  const defaults = {
    service_fee_percent:
      CONFIG.DEFAULT_SERVICE_FEE_PERCENT,

    min_service_fee:
      CONFIG.DEFAULT_MIN_SERVICE_FEE
  };

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return defaults;
    }

    return {
      ...defaults,
      ...data
    };
  } catch (error) {
    console.warn(
      "Could not load platform settings. Using defaults.",
      error
    );

    return defaults;
  }
}

/*
|--------------------------------------------------------------------------
| EXTRACT VALUES
|--------------------------------------------------------------------------
*/

function getProviderOfferPrice() {
  /*
   * Supports several possible column names.
   */

  return roundNGN(
    offer?.offer_price ??
    offer?.price ??
    offer?.amount ??
    offer?.proposed_price ??
    booking?.provider_offer ??
    booking?.offer_price ??
    booking?.price_per_person ??
    0
  );
}

function getPeopleCount() {
  return Math.max(
    1,
    Math.floor(
      number(
        booking?.people_count ??
        booking?.number_of_people ??
        booking?.people ??
        booking?.guests ??
        1
      )
    )
  );
}

function getTravelFee() {
  return roundNGN(
    booking?.travel_fee ??
    booking?.provider_travel_fee ??
    offer?.travel_fee ??
    0
  );
}

/*
|--------------------------------------------------------------------------
| CALCULATE PAYMENT
|--------------------------------------------------------------------------
*/

async function calculatePayment() {
  const settings = await getPlatformSettings();

  const baseOfferPrice = getProviderOfferPrice();

  const people = getPeopleCount();

  /*
   * IMPORTANT:
   *
   * We do NOT blindly multiply the provider's offer
   * by people.
   *
   * An offer might already be a total booking price.
   *
   * We only multiply if the offer explicitly says
   * it is a per-person offer.
   */

  const pricingType =
    offer?.pricing_type ||
    offer?.price_type ||
    booking?.pricing_type ||
    "total";

  let providerAmount;

  if (
    pricingType === "per_person" ||
    pricingType === "per-person" ||
    pricingType === "person"
  ) {
    providerAmount =
      baseOfferPrice * people;
  } else {
    providerAmount =
      baseOfferPrice;
  }

  providerAmount = roundNGN(providerAmount);

  /*
   * Travel fee.
   */

  const travelFee = getTravelFee();

  /*
   * Service/platform fee.
   *
   * Example:
   *
   * Provider = ₦10,000
   * Service fee = 10%
   * Service fee = ₦1,000
   */

  const feePercent = number(
    settings.service_fee_percent ??
    settings.platform_fee_percent ??
    settings.service_fee ??
    CONFIG.DEFAULT_SERVICE_FEE_PERCENT
  );

  let platformFee =
    providerAmount * (feePercent / 100);

  const minimumFee = number(
    settings.min_service_fee ??
    CONFIG.DEFAULT_MIN_SERVICE_FEE
  );

  if (platformFee < minimumFee) {
    platformFee = minimumFee;
  }

  platformFee = roundNGN(platformFee);

  /*
   * FINAL TOTAL
   */

  const calculatedTotal =
    providerAmount +
    travelFee +
    platformFee;

  // Keep the price agreed when the offer was accepted; do not recalculate it
  // at checkout with a different platform-fee percentage.
  const storedTotal = roundNGN(booking?.total_price);
  const total = storedTotal >= providerAmount + travelFee
    ? storedTotal
    : calculatedTotal;

  platformFee = roundNGN(total - providerAmount - travelFee);

  paymentCalculation = {
    people,
    providerAmount,
    travelFee,
    platformFee,
    feePercent,
    total: roundNGN(total)
  };

  return paymentCalculation;
}

/*
|--------------------------------------------------------------------------
| RENDER PAGE
|--------------------------------------------------------------------------
*/

async function renderPage() {
  /*
   * Service title.
   */

  serviceTitle.textContent =
    service?.title ||
    service?.name ||
    booking?.service_title ||
    offer?.service_title ||
    "Service booking";

  /*
   * Location.
   */

  bookingLocation.textContent =
    booking?.location ||
    booking?.address ||
    booking?.service_location ||
    "Location not provided";

  /*
   * Provider.
   */

  const providerFullName =
    provider?.full_name ||
    provider?.name ||
    provider?.business_name ||
    provider?.display_name ||
    "Service Provider";

  providerName.textContent = providerFullName;

  const avatar =
    provider?.avatar_url ||
    provider?.profile_picture ||
    provider?.image_url ||
    provider?.photo_url;

  if (avatar) {
    providerPicture.src = avatar;
  } else {
    providerPicture.src =
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        providerFullName
      )}&background=111111&color=ffffff`;
  }

  /*
   * Date/time.
   */

  bookingDate.textContent = safeDate(
    booking?.scheduled_date ||
    booking?.booking_date ||
    booking?.date
  );

  bookingTime.textContent = safeTime(
    booking?.scheduled_time ||
    booking?.booking_time ||
    booking?.time
  );

  /*
   * Instructions.
   */

  const instructions =
    booking?.special_instructions ||
    booking?.instructions ||
    booking?.request_details ||
    booking?.description;

  if (instructions) {
    bookingInstructions.textContent = instructions;
    bookingInstructionsDiv.classList.remove("hidden");
  }

  /*
   * People.
   */

  bookingPeople.textContent =
    paymentCalculation.people;

  /*
   * Payment.
   */

  perPersonPrice.textContent =
    money(paymentCalculation.providerAmount);

  serviceFee.textContent =
    money(paymentCalculation.platformFee);

  /*
   * Travel fee.
   */

  if (paymentCalculation.travelFee > 0) {
    travelFeeBreakdown.classList.remove("hidden");
    travelFeeBreakdown.classList.add("flex");

    travelFeeBreakdownValue.textContent =
      money(paymentCalculation.travelFee);
  } else {
    travelFeeBreakdown.classList.add("hidden");
    travelFeeBreakdown.classList.remove("flex");
  }

  /*
   * Total.
   */

  servicePriceTotal.textContent =
    money(paymentCalculation.total);

  servicePriceSummary.textContent =
    money(paymentCalculation.total);
}

/*
|--------------------------------------------------------------------------
| CHECK PAYMENT STATE
|--------------------------------------------------------------------------
*/

async function checkExistingPayment() {
  if (!booking?.id) return;

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .in("status", [
      "success",
      "paid",
      "completed"
    ])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      "Could not check existing payment.",
      error
    );

    return;
  }

  if (data) {
    confirmBookingBtn.disabled = true;
    confirmBookingBtn.textContent = "Already paid";

    throw new Error(
      "This booking has already been paid for."
    );
  }
}

/*
|--------------------------------------------------------------------------
| CREATE PAYMENT RECORD
|--------------------------------------------------------------------------
*/

async function createPaymentRecord(reference) {
  const { data: userData } =
    await supabase.auth.getUser();

  const userId =
    userData?.user?.id;

  const paymentPayload = {
    booking_id: booking.id,

    user_id:
      userId ||
      booking.user_id ||
      booking.customer_id,

    provider_id:
      offer?.provider_id ||
      booking.provider_id ||
      null,

    amount:
      paymentCalculation.total,

    currency:
      CONFIG.CURRENCY,

    reference,

    status: "pending",

    payment_method: "paystack",

    created_at:
      new Date().toISOString()
  };

  const { data, error } =
    await supabase
      .from("payments")
      .insert(paymentPayload)
      .select()
      .single();

  if (error) {
    console.error(
      "Payment insert error:",
      error
    );

    /*
     * Do not stop payment because the payment
     * record could not be created client-side.
     *
     * Paystack verification should be authoritative.
     */

    return null;
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| UPDATE BOOKING AFTER PAYMENT
|--------------------------------------------------------------------------
|
| This is NOT the final security mechanism.
|
| Your Paystack webhook / Edge Function should also
| update the booking after verifying the transaction.
|
*/

async function updateBookingAfterPayment(reference) {
  const updateData = {
    payment_status: "paid",
    payment_reference: reference,
    status: "confirmed"
  };

  const { error } =
    await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", booking.id);

  if (error) {
    console.error(
      "Could not update booking:",
      error
    );

    /*
     * Do not tell the customer payment failed.
     *
     * Payment may have succeeded even if this update
     * failed.
     */
  }
}

/*
|--------------------------------------------------------------------------
| VERIFY PAYMENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Paystack secret key MUST NOT be placed in this file.
|
| Verification must happen in a Supabase Edge Function.
|
*/

async function verifyPayment(reference) {
  try {
    const {
      data,
      error
    } = await supabase.functions.invoke(
      "verify-paystack-payment",
      {
        body: {
          reference,
          booking_id: booking.id,
          offer_id: offer?.id || null
        }
      }
    );

    if (error) {
      console.error(
        "Verification function error:",
        error
      );

      throw new Error(
        "We could not verify your payment yet."
      );
    }

    if (!data?.success) {
      throw new Error(
        data?.message ||
        "Payment verification failed."
      );
    }

    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| OPEN PAYSTACK
|--------------------------------------------------------------------------
*/

async function payWithPaystack() {
  clearError();

  if (isProcessingPayment) {
    return;
  }

  if (!paymentCalculation) {
    showError(
      "Payment information is not ready yet."
    );

    return;
  }

  if (
    !window.PaystackPop ||
    typeof window.PaystackPop !== "function"
  ) {
    showError(
      "Paystack could not be loaded. Please refresh the page."
    );

    return;
  }

  if (!booking?.id) {
    showError(
      "The booking information is missing."
    );

    return;
  }

  if (paymentCalculation.total <= 0) {
    showError(
      "The payment amount is invalid."
    );

    return;
  }

  const { data: userData } =
    await supabase.auth.getUser();

  const user = userData?.user;

  if (!user) {
    showError(
      "Please log in before making payment."
    );

    return;
  }

  setButtonLoading(true);

  try {
    /*
     * Generate unique reference.
     */

    const reference =
      `VORA-${booking.id}-${Date.now()}`;

    /*
     * Create pending payment record.
     */

    await createPaymentRecord(reference);

    /*
     * Get customer email.
     */

    const email =
      user.email ||
      booking.email ||
      booking.customer_email;

    if (!email) {
      throw new Error(
        "No customer email is available for this payment."
      );
    }

    /*
     * Paystack expects amount in KOBO.
     *
     * NGN 1,000 = 100,000 kobo.
     */

    const amountInKobo =
      Math.round(
        paymentCalculation.total * 100
      );

    const popup = new window.PaystackPop();

    popup.newTransaction({
        key:
          'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c',

        email,

        amount:
          amountInKobo,

        currency:
          CONFIG.CURRENCY,

        reference:
          reference,

        metadata: {
          booking_id:
            String(booking.id),

          offer_id:
            offer?.id
              ? String(offer.id)
              : "",

          customer_id:
            String(user.id),

          provider_id:
            offer?.provider_id ||
            booking.provider_id
              ? String(
                  offer?.provider_id ||
                  booking.provider_id
                )
              : "",

          service:
            service?.title ||
            service?.name ||
            booking?.service_title ||
            "Vora service",

          people:
            paymentCalculation.people,

          provider_amount:
            paymentCalculation.providerAmount,

          travel_fee:
            paymentCalculation.travelFee,

          service_fee:
            paymentCalculation.platformFee,

          total:
            paymentCalculation.total
        },

        onSuccess: async (response) => {
          try {
            confirmBookingBtn.textContent =
              "Verifying payment…";

            /*
             * NEVER trust response.status alone.
             *
             * The Edge Function verifies the transaction
             * using the Paystack secret key.
             */

            const verified =
              await verifyPayment(
                response.reference
              );

            /*
             * Update local booking state.
             */

            await updateBookingAfterPayment(
              response.reference
            );

            confirmBookingBtn.textContent =
              "Payment successful";

            confirmBookingBtn.disabled =
              true;

            /*
             * Redirect to booking confirmation.
             */

            const params =
              new URLSearchParams({
                bookingId:
                  booking.id,

                reference:
                  response.reference
              });

            window.location.href =
              `booking-confirmed.html?${params.toString()}`;

          } catch (error) {
            console.error(
              "Payment verification error:",
              error
            );

            setButtonLoading(false);

            showError(
              error.message ||
              "Payment was received but could not be verified yet. Please do not pay again."
            );
          }
        },

        onCancel: () => {
          setButtonLoading(false);

          /*
           * Don't show an alarming error just because
           * the customer closed the Paystack window.
           */
        }
      });

  } catch (error) {
    console.error(
      "Paystack error:",
      error
    );

    setButtonLoading(false);

    showError(
      error.message ||
      "Unable to start payment. Please try again."
    );
  }
}

/*
|--------------------------------------------------------------------------
| INITIALIZE
|--------------------------------------------------------------------------
*/

async function initialize() {
  try {
    confirmBookingBtn.disabled = true;

    clearError();

    await loadOffer();

    await checkExistingPayment();

    await calculatePayment();

    await renderPage();

    confirmBookingBtn.disabled = false;

  } catch (error) {
    console.error(
      "Payment page initialization failed:",
      error
    );

    showError(
      error.message ||
      "We could not load this payment page."
    );

    confirmBookingBtn.disabled = true;
  }
}

/*
|--------------------------------------------------------------------------
| EVENT
|--------------------------------------------------------------------------
*/

confirmBookingBtn.addEventListener(
  "click",
  payWithPaystack
);

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

initialize();
