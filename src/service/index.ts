// Shared service layer. The HTTP routes, the CLI, and the MCP server all drive
// wallet operations through these functions, so behavior is identical across
// frontends. Everything here is real on Solana devnet.
import { LAUNCH_MIN_SOL } from "../lib/config";
import { getConnection } from "../lib/solana/connection";
import { airdrop, getSolBalance, loadWallet } from "../lib/solana/wallet";
import { withStateLock } from "../lib/state/lock";
import { loadState, saveState } from "../lib/state/store";
import type { AppState } from "../lib/types";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Read the wallet address + live devnet SOL balance for the current device.
// For non-web callers (CLI/MCP) withStateLock auto-provisions the "local" wallet.
export const getState = (): Promise<AppState> =>
  withStateLock(async () => {
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
      // no wallet provisioned for this device yet
    }
    return s;
  });

// Provision this device's wallet (created on first use by withStateLock for
// non-web callers). Best-effort devnet airdrop so the new wallet has gas.
export const createWallet = () =>
  withStateLock(async () => {
    const s = loadState();
    const wallet = loadWallet();
    const publicKey = wallet.publicKey.toBase58();
    s.wallet.publicKey = publicKey;
    const conn = getConnection();
    let airdropError: string | undefined;
    try {
      const bal = await getSolBalance(conn, wallet.publicKey);
      if (bal < LAUNCH_MIN_SOL) await airdrop(conn, wallet, 1);
      s.wallet.solBalance = await getSolBalance(conn, wallet.publicKey);
    } catch (e) {
      airdropError = msg(e); // faucet rate-limited; wallet still exists
    }
    saveState(s);
    return { ok: true as const, publicKey, solBalance: s.wallet.solBalance, airdropError };
  });

// Request a devnet SOL airdrop for the wallet (faucet is rate-limited).
export const requestAirdrop = () =>
  withStateLock(async () => {
    const s = loadState();
    const kp = loadWallet();
    s.wallet.publicKey = kp.publicKey.toBase58();
    const conn = getConnection();
    try {
      const sig = await airdrop(conn, kp, 1);
      s.wallet.solBalance = await getSolBalance(conn, kp.publicKey);
      saveState(s);
      return { ok: true as const, signature: sig, balance: s.wallet.solBalance };
    } catch (e) {
      saveState(s);
      return { ok: false as const, error: msg(e) };
    }
  });
