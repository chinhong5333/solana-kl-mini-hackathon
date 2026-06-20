import { getConnection } from "@/lib/solana/connection";
import { getSolBalance, loadWallet } from "@/lib/solana/wallet";
import { withStateLock } from "@/lib/state/lock";
import { loadState, saveState } from "@/lib/state/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Devnet RPC read can stall; allow headroom over Vercel's 10s default.
export const maxDuration = 30;

// Current device state. Returns an empty wallet (publicKey "") until the device
// has provisioned one via POST /api/wallet/create.
export async function GET() {
  return withStateLock(async () => {
    const s = loadState();
    try {
      const wallet = loadWallet();
      s.wallet.publicKey = wallet.publicKey.toBase58();
      try {
        s.wallet.solBalance = await getSolBalance(getConnection(), wallet.publicKey);
      } catch {
        // RPC hiccup; keep last known balance
      }
      saveState(s);
    } catch {
      // no wallet provisioned for this device yet; return state as-is
    }
    return Response.json(s);
  });
}
