export interface TokenBalance {
  mint: string;
  amount: number; // UI amount (already scaled by the token's decimals)
  decimals: number;
}

export interface WalletInfo {
  publicKey: string;
  solBalance: number; // real on-chain devnet SOL
  tokens?: TokenBalance[]; // SPL token balances (omitted by older state)
}

export interface AppState {
  network: "devnet";
  wallet: WalletInfo;
  createdAt: string;
  updatedAt: string;
}
