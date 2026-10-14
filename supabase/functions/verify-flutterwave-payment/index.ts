import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const flutterwaveSecretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY") || Deno.env.get("FLW_SECRET_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !flutterwaveSecretKey) {
      throw new Error("Payment verification is not configured.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be logged in to verify payment.");

    const body = await request.json();
    const reference = String(body.reference || "");
    const transactionId = String(body.transaction_id || "");
    const bookingId = String(body.booking_id || body.bookingId || "");
    if (!reference || !transactionId || !bookingId) {
      throw new Error("Flutterwave transaction details are incomplete.");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id")
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (bookingError || !booking) throw new Error("Booking not found.");

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, currency, status")
      .eq("booking_id", bookingId)
      .eq("user_id", user.id)
      .eq("reference", reference)
      .maybeSingle();
    if (paymentError || !payment) throw new Error("Matching payment record not found.");
    if (!["pending", "success", "successful", "paid"].includes(String(payment.status).toLowerCase())) {
      throw new Error("This payment is not eligible for verification.");
    }

    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${flutterwaveSecretKey}` },
    });
    const result = await response.json();
    const transaction = result?.data;
    if (!response.ok || result?.status !== "success" || transaction?.status !== "successful") {
      throw new Error("Flutterwave has not confirmed this payment as successful.");
    }
    if (transaction?.tx_ref !== reference) throw new Error("Flutterwave reference does not match this booking.");
    if (transaction?.currency?.toUpperCase() !== String(payment.currency || "NGN").toUpperCase()) {
      throw new Error("Flutterwave currency does not match this payment.");
    }
    if (Math.round(Number(transaction?.amount) * 100) !== Math.round(Number(payment.amount) * 100)) {
      throw new Error("Flutterwave amount does not match this payment.");
    }
    if (transaction?.meta?.booking_id && String(transaction.meta.booking_id) !== bookingId) {
      throw new Error("Flutterwave transaction is linked to a different booking.");
    }

    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "success", provider: "flutterwave", provider_reference: transactionId, updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (updateError) throw new Error("Payment verified, but its payment record could not be updated.");

    return new Response(JSON.stringify({ success: true, reference, transaction_id: transactionId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});