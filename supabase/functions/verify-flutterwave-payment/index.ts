import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const flutterwaveSecretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY") || Deno.env.get("FLW_SECRET_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !flutterwaveSecretKey) {
      throw new Error("Payment verification is not configured. Check the Supabase and Flutterwave Edge Function secrets.");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError) throw new Error("Your login could not be verified. Please sign in again.");
    if (!user) throw new Error("You must be logged in to verify payment.");

    const body = await request.json();
    const reference = String(body.reference || "");
    const transactionId = String(body.transaction_id || "");
    const bookingId = String(body.booking_id || body.bookingId || "");
    if (!reference || !transactionId || !bookingId) {
      throw new Error("Flutterwave transaction details are incomplete.");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id")
      .eq("uid", user.id)
      .maybeSingle();
    if (profileError) throw new Error("Could not verify the customer profile.");

    const ownerIds = [...new Set([user.id, profile?.id].filter(Boolean))];
    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("id, user_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw new Error("Could not look up the booking.");
    if (!booking || !ownerIds.includes(booking.user_id)) {
      throw new Error("Booking not found or it does not belong to your account.");
    }

    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .select("id, amount, currency, status, user_id")
      .eq("booking_id", bookingId)
      .eq("reference", reference)
      .maybeSingle();
    if (paymentError) throw new Error("Could not look up the pending payment.");
    if (!payment || !ownerIds.includes(payment.user_id)) {
      throw new Error("Matching payment record not found for this booking.");
    }
    if (!["pending", "success", "successful", "paid"].includes(String(payment.status).toLowerCase())) {
      throw new Error("This payment is not eligible for verification.");
    }

    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${flutterwaveSecretKey}` },
    });
    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("Flutterwave returned an unreadable verification response.");
    }

    const transaction = result?.data;
    if (!response.ok || result?.status !== "success" || transaction?.status !== "successful") {
      throw new Error(result?.message || "Flutterwave has not confirmed this payment as successful.");
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

    const { error: updateError } = await adminClient
      .from("payments")
      .update({
        status: "success",
        provider: "flutterwave",
        provider_reference: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (updateError) {
      throw new Error(`Payment was verified, but its record could not be updated: ${updateError.message}`);
    }

    return jsonResponse({ success: true, reference, transaction_id: transactionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    console.error("Flutterwave payment verification failed:", message);
    return jsonResponse({ success: false, message }, 400);
  }
});
