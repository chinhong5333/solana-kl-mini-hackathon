import { NETWORK } from "../config";
import { currentContext } from "../runtime/context";
import type { AppState } from "../types";

export function defaultState(): AppState {
  const now = new Date().toISOString();
  return {
    network: NETWORK,
    wallet: { publicKey: "", solBalance: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

// Fill any fields a state written by an older build is missing, so new code
// never reads undefined. Idempotent on a current-shape state.
export function normalize(s: AppState): AppState {
  const d = defaultState();
  return {
    ...d,
    ...s,
    wallet: { publicKey: s.wallet?.publicKey ?? "", solBalance: s.wallet?.solBalance ?? 0 },
  };
}

// State lives in the per-device context (preloaded from KV by withStateLock).
// These stay synchronous so routes need no changes.
export function loadState(): AppState {
  return currentContext().state;
}

export function saveState(state: AppState): void {
  state.updatedAt = new Date().toISOString();
  currentContext().state = state;
}

export function resetState(): AppState {
  const s = defaultState();
  currentContext().state = s;
  return s;
}
