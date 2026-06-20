import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
