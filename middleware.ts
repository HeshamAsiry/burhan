import { NextResponse } from "next/server";

const WINDOW_MS = 60_000;

type ApiKeyRecord = {
  id: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  revoked_at: string | null;
};

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function serverError(message: string) {
  console.error("Burhan API key validation failed:", message);
  return NextResponse.json({ error: "API_KEY_VALIDATION_ERROR" }, { status: 503 });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function middleware(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1/health") {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const providedKey = request.headers.get("x-burhan-api-key")?.trim() || bearer;

  if (!providedKey) {
    return unauthorized();
  }

  try {
    const keyHash = await sha256Hex(providedKey);

    const keyResponse = await supabaseRequest(
      `burhan_api_keys?key_hash=eq.${encodeURIComponent(keyHash)}&active=eq.true&select=id,key_prefix,rate_limit_per_minute,revoked_at&limit=1`,
    );

    if (!keyResponse.ok) {
      throw new Error(`Supabase key lookup returned ${keyResponse.status}.`);
    }

    const keys = (await keyResponse.json()) as ApiKeyRecord[];
    const key = keys[0];

    if (!key || key.revoked_at) {
      return unauthorized();
    }

    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

    const usageResponse = await supabaseRequest(
      `burhan_api_key_requests?api_key_id=eq.${encodeURIComponent(key.id)}&requested_at=gte.${encodeURIComponent(windowStart)}&select=id&limit=${Math.max(key.rate_limit_per_minute + 1, 100)}`,
      { headers: { Prefer: "count=exact" } },
    );

    if (!usageResponse.ok) {
      throw new Error(`Supabase rate-limit lookup returned ${usageResponse.status}.`);
    }

    const usageCount = Number(
      usageResponse.headers.get("content-range")?.split("/")?.[1] ?? "0",
    );

    if (usageCount >= key.rate_limit_per_minute) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          retry_after_seconds: 60,
        },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        },
      );
    }

    const logResponse = await supabaseRequest("burhan_api_key_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ api_key_id: key.id }),
    });

    if (!logResponse.ok) {
      throw new Error(`Supabase rate-limit write returned ${logResponse.status}.`);
    }

    const updateResponse = await supabaseRequest(
      `burhan_api_keys?id=eq.${encodeURIComponent(key.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      },
    );

    if (!updateResponse.ok) {
      console.warn("Burhan API key last_used_at update failed:", updateResponse.status);
    }

    return NextResponse.next();
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unknown validation error.");
  }
}

export const config = {
  matcher: ["/api/v1/:path*"],
};
