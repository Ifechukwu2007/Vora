declare namespace Deno {
  const env: {
    get(name: string): string | undefined;
  };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

const DEFAULT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200, cors = true) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors
      ? {
          ...DEFAULT_CORS_HEADERS,
          Connection: "keep-alive",
        }
      : {
          "Content-Type": "application/json",
          Connection: "keep-alive",
        },
  });
}

interface CreateTransferRecipientPayload {
  account_number: string;
  bank_code: string;
  currency: string;
}

function getEnvOrThrow(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function paystackResolveAccount(
  baseUrl: string,
  secretKey: string,
  bank_code: string,
  account_number: string
) {
  const url = `${baseUrl}/bank/resolve?account_number=${encodeURIComponent(
    account_number
  )}&bank_code=${encodeURIComponent(bank_code)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return { ok: res.ok, status: res.status, body };
}

async function paystackCreateTransferRecipient(
  baseUrl: string,
  secretKey: string,
  name: string,
  bank_code: string,
  account_number: string,
  currency: string
) {
  const url = `${baseUrl}/transferrecipient`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name,
      account_number,
      bank_code,
      currency,
    }),
  });

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: DEFAULT_CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let payload: Partial<CreateTransferRecipientPayload>;
    const rawBody = await req.text();
    if (!rawBody) {
      return jsonResponse({ error: "Request body is required" }, 400);
    }

    try {
      payload = JSON.parse(rawBody) as Partial<CreateTransferRecipientPayload>;
    } catch (error) {
      return jsonResponse(
        {
          error: "Invalid JSON body",
          details: error instanceof Error ? error.message : String(error),
          rawBody,
        },
        400
      );
    }

    const bank_code = String(payload.bank_code ?? "").trim();
    const account_number = String(payload.account_number ?? "").trim();
    const currency = String(payload.currency ?? "NGN").trim();

    if (!bank_code) return jsonResponse({ error: "Missing bank_code" }, 400);
    if (!account_number)
      return jsonResponse({ error: "Missing account_number" }, 400);
    if (!currency) return jsonResponse({ error: "Missing currency" }, 400);

    const PAYSTACK_SECRET_KEY = getEnvOrThrow("PAYSTACK_SECRET_KEY");
    const PAYSTACK_BASE_URL = Deno.env.get("PAYSTACK_BASE_URL") ?? "https://api.paystack.co";

    // 1) Resolve account number to get verified account name
    const resolved = await paystackResolveAccount(
      PAYSTACK_BASE_URL,
      PAYSTACK_SECRET_KEY,
      bank_code,
      account_number
    );

    if (!resolved.ok) {
      return jsonResponse(
        {
          error_description:
            resolved.body?.message ??
            "Failed to resolve account number with Paystack",
          paystack_status: resolved.status,
          details: resolved.body,
        },
        400
      );
    }

    const data = resolved.body?.data;
    const account_name = data?.account_name ?? data?.name;
    const resolved_bank_name = data?.bank_name ?? data?.name;
    const resolved_bank_code = data?.bank_code ?? bank_code;

    if (!account_name) {
      return jsonResponse(
        {
          error_description:
            resolved.body?.message ??
            "Paystack did not return an account_name",
          details: resolved.body,
        },
        400
      );
    }

    // 2) Create transfer recipient using the verified name
    const created = await paystackCreateTransferRecipient(
      PAYSTACK_BASE_URL,
      PAYSTACK_SECRET_KEY,
      String(account_name).toUpperCase(),
      bank_code,
      account_number,
      currency
    );

    if (!created.ok) {
      return jsonResponse(
        {
          error_description:
            created.body?.message ??
            "Failed to create transfer recipient with Paystack",
          paystack_status: created.status,
          details: created.body,
        },
        502
      );
    }

    const recipientCode = created.body?.data?.recipient_code;
    if (!recipientCode) {
      return jsonResponse(
        {
          error_description: "Paystack did not return recipient_code",
          details: created.body,
        },
        502
      );
    }

    return jsonResponse({
      recipient_code: recipientCode,
      account_name: String(account_name).toUpperCase(),
      bank_code: resolved_bank_code,
      bank_name: resolved_bank_name ?? null,
      account_verified: true,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});
