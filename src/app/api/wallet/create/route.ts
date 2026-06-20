import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getConnection } from "@/lib/solana/connection";
import { airdrop, getSolBalance, loadWallet } from "@/lib/solana/wallet";
import { LAUNCH_MIN_SOL } from "@/lib/config";
import { runWithDevice } from "@/lib/state/lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Airdrop + on-chain confirmation can take ~30s; raise above Vercel's 10s default.
export const maxDuration = 60;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Provision this device's wallet. One wallet per browser: reuses the existing
// `gid` cookie if present, otherwise mints a new device id. The keypair bundle
// is generated + stored (encrypted) server-side on first call; the secret never
// leaves the server. Best-effort devnet airdrop so the new wallet has gas.
export async function POST() {
  const existing = (await cookies()).get("gid")?.value;
  const deviceId = existing || randomUUID();

  const result = await runWithDevice(
    deviceId,
    async () => {
      const wallet = loadWallet(); // preloaded: creates the bundle on first use
      const publicKey = wallet.publicKey.toBase58();
      const conn = getConnection();
      let airdropError: string | undefined;
      try {
        const bal = await getSolBalance(conn, wallet.publicKey);
        if (bal < LAUNCH_MIN_SOL) await airdrop(conn, wallet, 1);
      } catch (e) {
        airdropError = msg(e); // faucet rate-limited; wallet still exists
      }
      return { publicKey, airdropError };
    },
    true, // trusted provisioning: this route may create the bundle
  );

  const res = Response.json({ ok: true, ...result });
  if (!existing) {
    res.headers.append(
      "Set-Cookie",
      `gid=${deviceId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`,
    );
  }
  return res;
}
