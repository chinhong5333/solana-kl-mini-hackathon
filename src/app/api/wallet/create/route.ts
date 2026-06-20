import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { loadWallet } from "@/lib/solana/wallet";
import { runWithDevice } from "@/lib/state/lock";
import { loadState, saveState } from "@/lib/state/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Provision this device's wallet. One wallet per browser: reuses the existing
// `gid` cookie if present, otherwise mints a new device id. The keypair bundle
// is generated + stored (encrypted) server-side on first call; the secret never
// leaves the server. Returns immediately (no on-chain calls); funding is a
// separate step (airdrop module).
//
// runWithDevice persists both the keypair bundle (keys:<deviceId>) and the state
// (state:<deviceId>) to KV / the local file fallback, so the wallet survives a
// reload or restart.
export async function POST() {
  const existing = (await cookies()).get("gid")?.value;
  const deviceId = existing || randomUUID();

  const result = await runWithDevice(
    deviceId,
    () => {
      const publicKey = loadWallet().publicKey.toBase58(); // preloaded: creates the bundle on first use
      const s = loadState();
      s.wallet.publicKey = publicKey;
      saveState(s); // persisted by runWithDevice after this returns
      return { publicKey };
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
