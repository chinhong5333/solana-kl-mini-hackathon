import { NextResponse } from "next/server";

// Liveness probe. Confirms the App Router + serverless function path works
// (locally and on Vercel). Not cached so it reflects the live deployment.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "solhakathon",
    time: new Date().toISOString(),
  });
}
