import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getKeypair } from "../runtime/context";
import type { TokenBalance } from "../types";

// The device's wallet keypair, preloaded into the request context by withStateLock.
export const loadWallet = () => getKeypair("wallet");

export async function getSolBalance(conn: Connection, pubkey: PublicKey): Promise<number> {
  const lamports = await conn.getBalance(pubkey, "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

// All SPL token balances the wallet holds (one entry per mint with a token
// account). Zero-balance accounts are dropped. UI amount already scaled by the
// mint's decimals.
export async function getTokenBalances(conn: Connection, owner: PublicKey): Promise<TokenBalance[]> {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
  return res.value
    .map((acc) => {
      const info = acc.account.data.parsed.info;
      return {
        mint: info.mint as string,
        amount: info.tokenAmount.uiAmount as number,
        decimals: info.tokenAmount.decimals as number,
      };
    })
    .filter((t) => t.amount > 0);
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
