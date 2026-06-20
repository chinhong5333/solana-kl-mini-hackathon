// Single-recipient transfer of native SOL or an SPL token (e.g. USDC) from this
// device's wallet. The token counterpart to split.ts, but for ONE recipient:
//
// - SOL:   a single SystemProgram.transfer, with a fee-aware balance precheck.
// - Token: a standard SPL transfer (createTransferCheckedInstruction). The
//          recipient's Associated Token Account is created idempotently if it
//          doesn't exist yet (the signer pays the ~0.002 SOL rent). No on-chain
//          program is needed — a single transfer doesn't use fund_splitter.
//
// Amounts are entered in UI units (e.g. 1.5) and scaled to base units here:
// lamports for SOL, 10**decimals for the token (decimals read from the mint).
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { resolveTokenMint } from "../config";
import { toBaseUnits } from "./split";

export type TransferResult = {
  ok: true;
  signature: string;
  kind: "sol" | "token";
  to: string;
  amount: number; // UI units
  mint?: string; // present for token transfers
};

function parseAddress(address: string, label = "recipient"): PublicKey {
  try {
    return new PublicKey(address);
  } catch {
    throw new Error(`Invalid ${label} address: ${address}`);
  }
}

// Transfer native SOL to a single recipient, confirming the wallet covers the
// amount + network fee before broadcasting.
async function transferSol(
  conn: Connection,
  payer: Keypair,
  to: PublicKey,
  amount: number,
): Promise<TransferResult> {
  if (to.equals(payer.publicKey)) throw new Error("Cannot transfer to the source account.");
  const lamports = toBaseUnits(amount, 9);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: Number(lamports) }),
  );

  const fee = BigInt((await conn.getFeeForMessage(tx.compileMessage(), "confirmed")).value ?? 5000);
  const balance = BigInt(await conn.getBalance(payer.publicKey, "confirmed"));
  if (balance < lamports + fee) {
    const sol = (n: bigint) => Number(n) / LAMPORTS_PER_SOL;
    throw new Error(
      `Insufficient balance: need ~${sol(lamports + fee)} SOL (incl. fee), have ${sol(balance)} SOL`,
    );
  }

  const signature = await send(conn, tx, payer);
  return { ok: true, signature, kind: "sol", to: to.toBase58(), amount };
}

// Transfer an SPL token to a single recipient. Derives both ATAs, creates the
// recipient's if missing, then sends a decimals-checked SPL transfer.
async function transferToken(
  conn: Connection,
  payer: Keypair,
  to: PublicKey,
  amount: number,
  mintStr: string,
): Promise<TransferResult> {
  if (to.equals(payer.publicKey)) throw new Error("Cannot transfer to the source account.");
  const mint = parseAddress(mintStr, "mint");

  const mintInfo = await getMint(conn, mint);
  const baseUnits = toBaseUnits(amount, mintInfo.decimals);
  const source = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const dest = getAssociatedTokenAddressSync(mint, to);

  // Precheck the source token balance for a clear message instead of an opaque
  // on-chain failure.
  let held: bigint;
  try {
    held = (await getAccount(conn, source)).amount;
  } catch {
    throw new Error("Your wallet holds no account for this token (balance 0).");
  }
  if (held < baseUnits) {
    const ui = (n: bigint) => Number(n) / 10 ** mintInfo.decimals;
    throw new Error(`Insufficient token balance: need ${ui(baseUnits)}, have ${ui(held)}.`);
  }

  const ixs: TransactionInstruction[] = [];
  if (!(await conn.getAccountInfo(dest))) {
    // Create the recipient's ATA idempotently; the signer pays the rent.
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, dest, to, mint));
  }
  ixs.push(
    createTransferCheckedInstruction(source, mint, dest, payer.publicKey, baseUnits, mintInfo.decimals),
  );

  const tx = new Transaction().add(...ixs);
  const signature = await send(conn, tx, payer);
  return { ok: true, signature, kind: "token", to: to.toBase58(), amount, mint: mint.toBase58() };
}

async function send(conn: Connection, tx: Transaction, payer: Keypair): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

// Entry point. `token` accepts a symbol ("SOL"/"USDC") or a raw mint address;
// undefined/null/"SOL" => native SOL, anything else resolves to an SPL mint.
export function transferFunds(
  conn: Connection,
  payer: Keypair,
  to: string,
  amount: number,
  token?: string | null,
): Promise<TransferResult> {
  const dest = parseAddress(to);
  const mint = resolveTokenMint(token); // null for SOL, else a mint address
  return mint === null
    ? transferSol(conn, payer, dest, amount)
    : transferToken(conn, payer, dest, amount, mint);
}
