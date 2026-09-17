import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "burhan",
    version: "v1",
    status: "ok",
  });
}
