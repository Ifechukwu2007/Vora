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

async function flutterwaveResolveAccount(
  secretKey: string,
  bankCode: string,
  account_number: string
) {
  const res = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ account_number, account_bank: bankCode }),
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

    const FLUTTERWAVE_SECRET_KEY = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? Deno.env.get("FLW_SECRET_KEY");
    if (!FLUTTERWAVE_SECRET_KEY) throw new Error("FLUTTERWAVE_SECRET_KEY is required");

    const resolved = await flutterwaveResolveAccount(
      FLUTTERWAVE_SECRET_KEY,
      bank_code,
      account_number
    );

    if (!resolved.ok) {
      return jsonResponse(
        {
          error_description:
            resolved.body?.message ??
            "Failed to resolve account number with Flutterwave",
          flutterwave_status: resolved.status,
          details: resolved.body,
        },
        400
      );
    }

    const data = resolved.body?.data;
    const account_name = data?.account_name ?? data?.account_holder_name;

    if (!account_name) {
      return jsonResponse(
        {
          error_description: resolved.body?.message ?? "Flutterwave did not return an account name",
          details: resolved.body,
        },
        400
      );
    }

    return jsonResponse({
      account_name: String(account_name).toUpperCase(),
      bank_code,
      bank_name: data?.bank_name ?? null,
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
