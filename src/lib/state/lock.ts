// Per-device state boundary. Each request resolves a deviceId (the browser's
// `gid` cookie on Vercel, or "local" for non-web callers), then load -> mutate ->
// save is serialized per device so overlapping requests can't lose updates.
//
// The device's keypairs + state are preloaded from KV into an AsyncLocalStorage
// context here, so the synchronous accessors (loadState/loadWallet) used in the
// routes keep working unchanged.
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { kvGet, kvLockAcquire, kvLockRelease, kvSet } from "../kv/store";
import { runInContext } from "../runtime/context";
import { defaultState, normalize } from "./store";
import { getOrCreateBundle, loadBundle } from "../wallet/store";
import type { AppState } from "../types";
import type { Keypair } from "@solana/web3.js";

const stateKey = (deviceId: string) => `state:${deviceId}`;
const lockKey = (deviceId: string) => `lock:${deviceId}`;

// Distributed lock tuning. TTL must outlast the slowest critical section (a
// devnet airdrop can await ~30s) so the lock never expires mid-write. The retry
// budget slightly exceeds the TTL so a waiter QUEUES behind a normal in-flight
// request instead of failing fast.
const LOCK_TTL_MS = 60_000;
const LOCK_RETRY_MS = 500;
const LOCK_MAX_RETRIES = 130; // ~65s, just past TTL

// In-process per-device mutex. Serializes overlapping requests within one
// serverless instance; the KV lock below covers the cross-instance case.
const locks = new Map<string, Promise<unknown>>();

// Forced-device override. Set by trusted server-side callers (the HTTP MCP
// route) so the service runs as one fixed, provisioned device instead of the
// per-browser cookie device. Never set on normal web/CLI paths.
const forcedDevice = new AsyncLocalStorage<{ deviceId: string; provision: boolean }>();
export function withForcedDevice<T>(deviceId: string, provision: boolean, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(forcedDevice.run({ deviceId, provision }, () => fn()));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Acquire the cross-instance KV lock, retrying briefly while another instance
// holds it. No-op on the filesystem fallback (the in-process mutex suffices).
async function acquireKvLock(deviceId: string): Promise<string> {
  const token = randomUUID();
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    if (await kvLockAcquire(lockKey(deviceId), token, LOCK_TTL_MS)) return token;
    await sleep(LOCK_RETRY_MS);
  }
  throw new Error("State is busy on another request; please retry.");
}

// Resolve the device cookie. Returns { web:true } only inside a Next request;
// non-web callers fall through to web:false.
async function readCookieDevice(): Promise<{ web: boolean; gid: string | null }> {
  try {
    const { cookies } = await import("next/headers");
    const gid = (await cookies()).get("gid")?.value ?? null;
    return { web: true, gid };
  } catch {
    return { web: false, gid: null };
  }
}

// Resolve the device for the current caller.
// - Web: deviceId = `gid` cookie (or null if absent). provision = false, so a
//   client-supplied cookie can NEVER create KV state; only /api/wallet/create does.
// - Non-web: deviceId = env/"local", provision = true (auto-create).
export async function resolveDevice(): Promise<{ deviceId: string | null; provision: boolean }> {
  const forced = forcedDevice.getStore();
  if (forced) return forced;
  const probe = await readCookieDevice();
  if (probe.web) return { deviceId: probe.gid, provision: false };
  return { deviceId: process.env.WALLET_DEVICE_ID || "local", provision: true };
}

// Run with an ephemeral, non-persisted context: no keypairs, no KV writes, no
// lock. Used for unprovisioned devices so untrusted callers touch nothing in KV.
function runEphemeral<T>(fn: () => Promise<T> | T): Promise<T> {
  const ctx = { deviceId: null, keypairs: {} as Record<string, Keypair>, state: defaultState() };
  return Promise.resolve(runInContext(ctx, () => fn()));
}

async function execute<T>(deviceId: string | null, provision: boolean, fn: () => Promise<T> | T): Promise<T> {
  if (deviceId === null) return runEphemeral(fn);

  // Load keypairs without creating unless provisioning is trusted. An untrusted
  // web request for a device with no bundle falls through to the ephemeral path.
  const keypairs = provision ? await getOrCreateBundle(deviceId) : await loadBundle(deviceId);
  if (!keypairs) return runEphemeral(fn);

  const token = await acquireKvLock(deviceId);
  try {
    const stored = await kvGet<AppState>(stateKey(deviceId));
    const state = normalize(stored ?? defaultState());
    const ctx = { deviceId, keypairs, state };
    const result = await runInContext(ctx, () => fn());
    await kvSet(stateKey(deviceId), ctx.state);
    return result;
  } finally {
    await kvLockRelease(lockKey(deviceId), token);
  }
}

// Run fn against an explicit device. `provision` true creates the bundle if
// missing (used by /api/wallet/create); false never creates.
export function runWithDevice<T>(deviceId: string | null, fn: () => Promise<T> | T, provision = false): Promise<T> {
  const mapKey = deviceId ?? "__anon__";
  const prev = locks.get(mapKey) ?? Promise.resolve();
  const run = prev.then(() => execute(deviceId, provision, fn));
  locks.set(
    mapKey,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// Run fn against the device resolved from the current request (web: never
// provisions; non-web: auto-provisions).
export function withStateLock<T>(fn: () => Promise<T> | T): Promise<T> {
  return resolveDevice().then(({ deviceId, provision }) => runWithDevice(deviceId, fn, provision));
}
