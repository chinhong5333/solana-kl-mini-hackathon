export const NETWORK = "devnet" as const;

// Devnet RPC fallback used only when SOLANA_RPC_URL is unset. This is the public
// endpoint (heavily rate-limited; expect 429s). Set SOLANA_RPC_URL to a dedicated
// provider (e.g. Helius) for reliable throughput. It is read the same way by web,
// CLI, and MCP via getConnection:
//   web  -> .env.local (auto-loaded by Next) / Vercel project env
//   CLI  -> .env.local via the --env-file-if-exists flag in package.json scripts
//   MCP  -> .env.local via the same flag in package.json / .mcp.json
// The CLI also takes --rpc and the stdio MCP an rpcUrl param (both set SOLANA_RPC_URL).
export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export const EXPLORER_ADDR = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;

export const EXPLORER_TX = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// On-chain SPL fund-splitter program (one source token account -> many receiver
// token accounts in a single instruction). Native-SOL splits don't use this;
// they batch SystemProgram.transfer instructions instead.
export const FUND_SPLITTER_PROGRAM_ID = "67hyWZ9QsHcowmNvUqNCyqMmSTnQtHwL6q7SZqoPZmJt";

// Max receivers in one split. The program rejects oversized batches
// (BatchTooLarge); we cap below the transaction account limit so SOL splits
// (which also add a receiver account each) stay within one transaction.
export const MAX_SPLIT_RECEIVERS = 12;

// Circle's official USDC mint on Solana devnet. Used as a preset in the
// transfer/split UIs so users don't have to paste the mint by hand.
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Token presets offered in the UIs. `mint: null` => native SOL; otherwise an
// SPL mint. A custom mint can still be entered manually for anything not listed.
export const KNOWN_TOKENS: { symbol: string; mint: string | null }[] = [
  { symbol: "SOL", mint: null },
  { symbol: "USDC", mint: USDC_MINT_DEVNET },
];

// Resolve a token symbol or raw mint string to a mint address (or null for SOL).
// Accepts "SOL"/"USDC" (case-insensitive) or a base58 mint passed straight through.
export function resolveTokenMint(token?: string | null): string | null {
  if (!token || token.toUpperCase() === "SOL") return null;
  const known = KNOWN_TOKENS.find((t) => t.symbol.toUpperCase() === token.toUpperCase());
  return known ? known.mint : token;
}
