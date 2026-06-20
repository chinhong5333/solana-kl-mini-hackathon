// Per-device keypair custody. Each device (a browser, keyed by its `gid` cookie,
// or "local" for non-web callers) owns its own wallet keypair, stored as one
// encrypted bundle in KV under `keys:<deviceId>`.
//
// Secrets are encrypted at rest with AES-256-GCM using WALLET_MASTER_KEY. When
// that env var is absent (local dev only) the bundle is stored as plaintext so
// the base runs with zero setup; production (real Vercel KV) requires the key.
import { Keypair } from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { kvGet, kvSet } from "../kv/store";

// Every account this app signs with. The base ships with just the user's wallet;
// add role names here as the app grows (reserve, escrow, ...).
export const ACCOUNT_NAMES = ["wallet"];

type EncBlob = { nonce: string; tag: string; ct: string };
type Bundle = { v: 1; enc: boolean; accounts: Record<string, number[] | EncBlob> };

const usingRealKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const masterRaw = process.env.WALLET_MASTER_KEY;
if (usingRealKv && !masterRaw) {
  throw new Error("WALLET_MASTER_KEY is required when KV is configured (encrypts wallet secrets at rest).");
}
const MASTER = masterRaw ? scryptSync(masterRaw, "solhakathon-wallet-v1", 32) : null;

function encryptSecret(secret: Uint8Array): number[] | EncBlob {
  if (!MASTER) return Array.from(secret); // local dev, no master key
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", MASTER, nonce);
  const ct = Buffer.concat([c.update(Buffer.from(secret)), c.final()]);
  return { nonce: nonce.toString("hex"), tag: c.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}

function decryptSecret(blob: number[] | EncBlob): Uint8Array {
  if (Array.isArray(blob)) return Uint8Array.from(blob);
  if (!MASTER) throw new Error("Encrypted wallet bundle but no WALLET_MASTER_KEY to decrypt it.");
  const d = createDecipheriv("aes-256-gcm", MASTER, Buffer.from(blob.nonce, "hex"));
  d.setAuthTag(Buffer.from(blob.tag, "hex"));
  return Uint8Array.from(Buffer.concat([d.update(Buffer.from(blob.ct, "hex")), d.final()]));
}

function bundleToKeypairs(b: Bundle): Record<string, Keypair> {
  const out: Record<string, Keypair> = {};
  for (const name of ACCOUNT_NAMES) {
    const blob = b.accounts[name];
    out[name] = blob ? Keypair.fromSecretKey(decryptSecret(blob)) : Keypair.generate();
  }
  return out;
}

// Load this device's keypair bundle WITHOUT creating one. Returns null if the
// device has no bundle yet. Heals a partial bundle (e.g. a role added after
// creation), which only touches an already-existing device's own key.
export async function loadBundle(deviceId: string): Promise<Record<string, Keypair> | null> {
  const key = `keys:${deviceId}`;
  const existing = await kvGet<Bundle>(key);
  if (!existing) return null;
  const missing = ACCOUNT_NAMES.filter((n) => !existing.accounts[n]);
  if (missing.length > 0) {
    for (const n of missing) existing.accounts[n] = encryptSecret(Keypair.generate().secretKey);
    await kvSet(key, existing);
  }
  return bundleToKeypairs(existing);
}

// Load or create this device's keypair bundle. Creation (a KV write) is only
// called for trusted provisioning: POST /api/wallet/create and non-web callers.
// Read routes use loadBundle so an arbitrary client-supplied `gid` cookie can
// never force unbounded bundle creation in KV.
export async function getOrCreateBundle(deviceId: string): Promise<Record<string, Keypair>> {
  const existing = await loadBundle(deviceId);
  if (existing) return existing;

  const keypairs: Record<string, Keypair> = {};
  const accounts: Bundle["accounts"] = {};
  for (const name of ACCOUNT_NAMES) {
    const kp = Keypair.generate();
    keypairs[name] = kp;
    accounts[name] = encryptSecret(kp.secretKey);
  }
  await kvSet<Bundle>(`keys:${deviceId}`, { v: 1, enc: Boolean(MASTER), accounts });
  return keypairs;
}
