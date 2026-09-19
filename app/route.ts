import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "burhan",
    version: "v1",
    status: "ok",
    description: "Quran memorization assessment API",
    endpoints: {
      health: "/api/v1/health",
      generate_test: "POST /api/v1/tests/generate",
      get_test: "GET /api/v1/tests/:testId",
    },
  });
}
