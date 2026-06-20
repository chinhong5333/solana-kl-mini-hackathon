export interface WalletInfo {
  publicKey: string;
  solBalance: number; // real on-chain devnet SOL
}

export interface AppState {
  network: "devnet";
  wallet: WalletInfo;
  createdAt: string;
  updatedAt: string;
}
