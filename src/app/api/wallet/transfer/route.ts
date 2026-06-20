import { sendFunds } from "@/service/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // an on-chain transfer can take ~30s to confirm

// Transfer SOL or an SPL token (e.g. USDC) from this browser's wallet to a
// single recipient. Runs as the `gid` cookie device (never provisions), so the
// caller must have created a wallet first; sendFunds returns a clean
// { ok:false, error } otherwise. The secret key never leaves the server — the
// browser only sends destination + amount + optional mint.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { to, amount, mint } = (body ?? {}) as { to?: unknown; amount?: unknown; mint?: unknown };
  if (typeof to !== "string" || !to.trim()) {
    return Response.json({ ok: false, error: "Provide `to` (recipient address)." }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return Response.json({ ok: false, error: "Provide `amount` as a positive number." }, { status: 400 });
  }
  if (mint !== undefined && typeof mint !== "string") {
    return Response.json({ ok: false, error: "`mint` must be a string if provided." }, { status: 400 });
  }

  const result = await sendFunds(to.trim(), amount, mint?.trim() || undefined);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
