// Per-request device context. withStateLock preloads the device's state +
// keypairs into this AsyncLocalStorage, so the synchronous accessors
// (loadState/saveState, loadWallet) keep working unchanged while being
// per-device. Nothing outside withStateLock should run inside this context.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Keypair } from "@solana/web3.js";
import type { AppState } from "../types";

export type DeviceContext = {
  deviceId: string | null; // null = web request with no provisioned wallet yet
  keypairs: Record<string, Keypair>;
  state: AppState;
};

const als = new AsyncLocalStorage<DeviceContext>();

export function runInContext<T>(ctx: DeviceContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentContext(): DeviceContext {
  const ctx = als.getStore();
  if (!ctx) throw new Error("No device context. State and keypairs are only available inside withStateLock().");
  return ctx;
}

export function currentDeviceId(): string | null {
  return als.getStore()?.deviceId ?? null;
}

// Read a preloaded keypair by account name (e.g. "wallet").
export function getKeypair(name: string): Keypair {
  const kp = currentContext().keypairs[name];
  if (!kp) throw new Error(`Wallet not provisioned: account "${name}" is unavailable. Create a wallet first.`);
  return kp;
}
