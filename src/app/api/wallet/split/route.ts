import { split } from "@/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// On-chain send + confirm (and possibly ATA creation) on devnet can run long.
export const maxDuration = 60;

// Multi-transfer ("split") from this browser's wallet to many recipients in one
// transaction. Body: { recipients: [{ address, amount }], mint?: string }.
// `mint` omitted/"SOL" => native SOL; otherwise an SPL token split. Amounts are
// UI units. Runs as the current `gid` device via the shared service layer.
export async function POST(req: Request) {
  let body: { recipients?: { address: string; amount: number }[]; mint?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const recipients = body.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return Response.json({ ok: false, error: "recipients must be a non-empty array." }, { status: 400 });
  }

  const result = await split(recipients, body.mint);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
