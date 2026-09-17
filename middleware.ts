import { NextResponse } from "next/server";

export function middleware(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/v1/") || url.pathname === "/api/v1/health") {
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const configuredKey = process.env.BURHAN_API_KEY;
  if (!configuredKey) {
    return NextResponse.json(
      { error: "API_KEY_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const providedKey = request.headers.get("x-burhan-api-key") ?? bearer;

  if (!providedKey || providedKey !== configuredKey) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*"],
};
