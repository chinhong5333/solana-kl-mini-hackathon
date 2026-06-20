// Shared service layer. The HTTP routes, the CLI, and the MCP server all drive
// wallet operations through these functions, so behavior is identical across
// frontends. Everything here is real on Solana devnet.
import { getConnection } from "../lib/solana/connection";
import { airdrop, getSolBalance, loadWallet } from "../lib/solana/wallet";
import { splitFunds, type Recipient, type SplitResult } from "../lib/solana/split";
import { transferFunds } from "../lib/solana/transfer";
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
// non-web callers). Returns immediately: just generate + store the keypair, no
// on-chain calls. Funding is a separate step (requestAirdrop).
export const createWallet = () =>
  withStateLock(() => {
    const s = loadState();
    const publicKey = loadWallet().publicKey.toBase58();
    s.wallet.publicKey = publicKey;
    saveState(s);
    return { ok: true as const, publicKey, solBalance: s.wallet.solBalance };
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

// Multi-transfer ("split") from this device's wallet to many recipients in one
// transaction. `mint` omitted/"SOL" => native SOL; otherwise an SPL token split
// via the fund_splitter program. Amounts are UI units (scaled by decimals).
export const split = (
  recipients: Recipient[],
  mint?: string | null,
): Promise<SplitResult | { ok: false; error: string }> =>
  withStateLock(async () => {
    try {
      const kp = loadWallet();
      const s = loadState();
      s.wallet.publicKey = kp.publicKey.toBase58();
      const result = await splitFunds(getConnection(), kp, recipients, mint);
      try {
        s.wallet.solBalance = await getSolBalance(getConnection(), kp.publicKey);
      } catch {
        // RPC hiccup; keep last known balance
      }
      saveState(s);
      return result;
    } catch (e) {
      return { ok: false as const, error: msg(e) };
    }
  });

// Transfer from this device's wallet to a single recipient. `mint`
// omitted/null/"SOL" => native SOL; otherwise an SPL token (e.g. USDC). Amount
// is in UI units. Validates the address before touching the chain; refreshes
// the cached SOL balance on success.
export const sendFunds = (to: string, amount: number, mint?: string | null) =>
  withStateLock(async () => {
    const s = loadState();
    const kp = loadWallet();
    s.wallet.publicKey = kp.publicKey.toBase58();
    const conn = getConnection();
    try {
      const result = await transferFunds(conn, kp, to, amount, mint);
      try {
        s.wallet.solBalance = await getSolBalance(conn, kp.publicKey);
      } catch {
        // RPC hiccup; keep last known balance
      }
      saveState(s);
      return { ...result, balance: s.wallet.solBalance };
    } catch (e) {
      saveState(s);
      return { ok: false as const, error: msg(e) };
    }
  });
