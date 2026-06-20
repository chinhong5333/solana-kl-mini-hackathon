// Key/value persistence. On Vercel we use Vercel KV (Upstash Redis); locally
// (where KV env vars are absent) we fall back to JSON files under data/kv/ so
// `npm run dev` works with no setup.
import fs from "node:fs";
import path from "node:path";

const useVercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const KV_DIR = path.join(process.cwd(), "data", "kv");
const fileFor = (key: string) => path.join(KV_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);

export async function kvGet<T>(key: string): Promise<T | null> {
  if (useVercelKv) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<T>(key)) ?? null;
  }
  const file = fileFor(key);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (useVercelKv) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, value);
    return;
  }
  fs.mkdirSync(KV_DIR, { recursive: true });
  fs.writeFileSync(fileFor(key), JSON.stringify(value));
}

// Distributed lock. On Vercel KV this is a real cross-instance lock (SET NX PX);
// on the filesystem fallback it is a no-op because the in-process mutex already
// serializes the single local process. Returns true if the lock was acquired.
export async function kvLockAcquire(key: string, token: string, ttlMs: number): Promise<boolean> {
  if (!useVercelKv) return true;
  const { kv } = await import("@vercel/kv");
  const res = await kv.set(key, token, { nx: true, px: ttlMs });
  return res === "OK";
}

// Release only if we still own the lock. Done atomically server-side (Lua) so an
// expired-and-retaken lock is never released out from under its new owner; a
// non-atomic get-then-del would have a TOCTOU window near TTL expiry.
const RELEASE_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
export async function kvLockRelease(key: string, token: string): Promise<void> {
  if (!useVercelKv) return;
  const { kv } = await import("@vercel/kv");
  await kv.eval(RELEASE_LUA, [key], [token]);
}
