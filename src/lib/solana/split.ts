// Multi-transfer ("split") of native SOL or an SPL token from this device's
// wallet to many recipients in ONE transaction.
//
// - SOL:   batches SystemProgram.transfer instructions (no program needed).
// - Token: drives the on-chain fund_splitter program. Recipients are wallet
//          addresses; we derive each one's Associated Token Account for the
//          mint, create any that are missing (idempotent, signer pays rent),
//          then call `split` with the receiver ATAs as remaining accounts.
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
import { createHash } from "node:crypto";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { FUND_SPLITTER_PROGRAM_ID, MAX_SPLIT_RECEIVERS } from "../config";

export type Recipient = { address: string; amount: number }; // amount in UI units

export type SplitResult = {
  ok: true;
  signature: string;
  kind: "sol" | "token";
  recipients: number;
  totalBaseUnits: string; // u64 as string (avoids JS number precision loss)
};

// Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

// Borsh-encode the `split` args: a Vec<u64> of base-unit amounts.
// Vec layout: u32 little-endian length, then each u64 little-endian.
function encodeSplitData(amounts: bigint[]): Buffer {
  const head = anchorDiscriminator("split");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(amounts.length, 0);
  const body = Buffer.alloc(amounts.length * 8);
  amounts.forEach((a, i) => body.writeBigUInt64LE(a, i * 8));
  return Buffer.concat([head, len, body]);
}

// Scale a UI amount to integer base units without floating-point drift.
// e.g. ("1.5", 9) -> 1_500_000_000n. Rejects non-positive / over-precise input.
export function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive number (got ${amount}).`);
  }
  const [whole, frac = ""] = String(amount).split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount ${amount} has more than ${decimals} decimal places for this token.`);
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function parseRecipients(recipients: Recipient[]): { keys: PublicKey[]; raw: Recipient[] } {
  if (recipients.length === 0) throw new Error("Batch must not be empty.");
  if (recipients.length > MAX_SPLIT_RECEIVERS) {
    throw new Error(`Too many receivers (${recipients.length}); max is ${MAX_SPLIT_RECEIVERS} per call.`);
  }
  const keys = recipients.map((r) => {
    try {
      return new PublicKey(r.address);
    } catch {
      throw new Error(`Invalid recipient address: ${r.address}`);
    }
  });
  return { keys, raw: recipients };
}

// Split native SOL: one SystemProgram.transfer per recipient in a single tx.
async function splitSol(conn: Connection, payer: Keypair, recipients: Recipient[]): Promise<SplitResult> {
  const { keys, raw } = parseRecipients(recipients);
  let total = 0n;
  const tx = new Transaction();
  keys.forEach((to, i) => {
    if (to.equals(payer.publicKey)) throw new Error("Cannot transfer to the source account.");
    const lamports = toBaseUnits(raw[i].amount, 9);
    total += lamports;
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: Number(lamports) }));
  });

  const balance = BigInt(await conn.getBalance(payer.publicKey, "confirmed"));
  if (balance < total) {
    throw new Error(
      `Insufficient balance: need ${Number(total) / LAMPORTS_PER_SOL} SOL, have ${Number(balance) / LAMPORTS_PER_SOL}.`,
    );
  }

  const signature = await send(conn, tx, payer);
  return { ok: true, signature, kind: "sol", recipients: keys.length, totalBaseUnits: total.toString() };
}

// Split an SPL token via the fund_splitter program. Derives + funds recipient
// ATAs as needed, then calls `split` with the receiver ATAs as remaining accounts.
async function splitToken(
  conn: Connection,
  payer: Keypair,
  mintStr: string,
  recipients: Recipient[],
): Promise<SplitResult> {
  const { keys, raw } = parseRecipients(recipients);
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    throw new Error(`Invalid mint address: ${mintStr}`);
  }

  const mintInfo = await getMint(conn, mint);
  const source = getAssociatedTokenAddressSync(mint, payer.publicKey);

  const amounts: bigint[] = [];
  const receiverAtas: PublicKey[] = [];
  const createIxs: TransactionInstruction[] = [];
  for (let i = 0; i < keys.length; i++) {
    const owner = keys[i];
    if (owner.equals(payer.publicKey)) throw new Error("Cannot transfer to the source account.");
    amounts.push(toBaseUnits(raw[i].amount, mintInfo.decimals));
    const ata = getAssociatedTokenAddressSync(mint, owner);
    receiverAtas.push(ata);
    if (!(await conn.getAccountInfo(ata))) {
      // Create the recipient's ATA idempotently; the signer pays the rent.
      createIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint),
      );
    }
  }

  const splitIx = new TransactionInstruction({
    programId: new PublicKey(FUND_SPLITTER_PROGRAM_ID),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // signer
      { pubkey: source, isSigner: false, isWritable: true }, // source token account
      { pubkey: mint, isSigner: false, isWritable: false }, // mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
      // remaining accounts: one writable receiver token account per amount
      ...receiverAtas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
    ],
    data: encodeSplitData(amounts),
  });

  const tx = new Transaction().add(...createIxs, splitIx);
  const signature = await send(conn, tx, payer);
  const total = amounts.reduce((a, b) => a + b, 0n);
  return { ok: true, signature, kind: "token", recipients: keys.length, totalBaseUnits: total.toString() };
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

// Entry point. `mint` undefined/null/"SOL" => native SOL split; otherwise an SPL
// token split for that mint.
export function splitFunds(
  conn: Connection,
  payer: Keypair,
  recipients: Recipient[],
  mint?: string | null,
): Promise<SplitResult> {
  const isSol = !mint || mint.toUpperCase() === "SOL";
  return isSol ? splitSol(conn, payer, recipients) : splitToken(conn, payer, mint, recipients);
}
