export const NETWORK = "devnet" as const;

// Minimum wallet SOL (gas/rent) before /api/wallet/create attempts a top-up
// airdrop on devnet. Devnet airdrops are rate-limited and may be skipped.
export const LAUNCH_MIN_SOL = 0.005;

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
