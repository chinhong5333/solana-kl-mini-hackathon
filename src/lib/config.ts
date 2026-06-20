export const NETWORK = "devnet" as const;

// Minimum wallet SOL (gas/rent) before /api/wallet/create attempts a top-up
// airdrop on devnet. Devnet airdrops are rate-limited and may be skipped.
export const LAUNCH_MIN_SOL = 0.005;

export const EXPLORER_ADDR = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;
