import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getKeypair } from "../runtime/context";

// The device's wallet keypair, preloaded into the request context by withStateLock.
export const loadWallet = () => getKeypair("wallet");

export async function getSolBalance(conn: Connection, pubkey: PublicKey): Promise<number> {
  const lamports = await conn.getBalance(pubkey, "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

// Request a devnet airdrop and wait for confirmation. Devnet airdrops are
// rate-limited and frequently return 429; callers must handle rejection.
export async function airdrop(conn: Connection, kp: Keypair, sol = 1): Promise<string> {
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction(
    { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
