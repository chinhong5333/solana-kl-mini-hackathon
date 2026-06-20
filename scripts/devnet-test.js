/**
 * Devnet smoke test for the fund_splitter program.
 *
 * Two modes, chosen by the MINT env var (set in .env):
 *
 *   A. MINT set (e.g. devnet USDC 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU):
 *      Uses your EXISTING token balance. You must already hold that token — the
 *      script cannot mint it. Splits a small test amount (default 0.08 + 0.02),
 *      then asserts each receiver got its share and your balance dropped by the
 *      total. Does NOT drain your wallet.
 *
 *   B. MINT empty:
 *      Creates a throwaway 6-decimal test mint you control, mints 10 to yourself,
 *      splits 8 + 2, asserts 8 / 2 / 0.
 *
 * Config (all via .env or env vars):
 *   PRIVATE_KEY   base58 secret of your funded devnet wallet (never pasted in chat)
 *   RPC_URL       devnet RPC endpoint (default https://api.devnet.solana.com)
 *   MINT          token mint to split; empty => create a throwaway test mint
 *   RECEIVER_A    wallet address of receiver A; empty => throwaway random wallet
 *   RECEIVER_B    wallet address of receiver B; empty => throwaway random wallet
 *   AMOUNT1       receiver-A amount in base units (default 80000 USDC-mode / 8000000 test)
 *   AMOUNT2       receiver-B amount in base units (default 20000 USDC-mode / 2000000 test)
 *
 * Run:
 *   npm install
 *   node scripts/devnet-test.js
 *
 * Wallet needs a little devnet SOL (>= ~0.05) for fees + rent.
 *   solana airdrop 2 <addr> --url devnet
 * Devnet USDC: faucet.circle.com (select Solana Devnet).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} = require("@solana/spl-token");

const PROGRAM_ID = new PublicKey(
  "67hyWZ9QsHcowmNvUqNCyqMmSTnQtHwL6q7SZqoPZmJt"
);
const DEFAULT_RPC = "https://api.devnet.solana.com";
const TEST_MINT_DECIMALS = 6; // only used when creating a throwaway mint

// Minimal .env loader (no dependency). Reads PROJECT_ROOT/.env if present and
// fills process.env for any key not already set in the real environment.
function loadDotenv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// Accepts either a JSON byte array (solana CLI id.json) or a base58 secret
// (Phantom / `solana-keygen` export). 64 bytes = full secret key, 32 = seed.
function secretToKeypair(raw) {
  const s = raw.trim();
  if (s.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  }
  const bytes = anchor.utils.bytes.bs58.decode(s);
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(
    `Unexpected secret length ${bytes.length}; expected a 32- or 64-byte key.`
  );
}

function loadKeypair() {
  // 1. env var (base58 or JSON array) — set in YOUR terminal, never pasted in chat
  if (process.env.PRIVATE_KEY) {
    return { kp: secretToKeypair(process.env.PRIVATE_KEY), file: "env:PRIVATE_KEY" };
  }
  // 2. a local file: WALLET / arg / scripts/.secret / CLI default id.json
  const candidates = [
    process.env.WALLET,
    process.argv[2],
    path.join(__dirname, ".secret"),
    path.join(os.homedir(), ".config", "solana", "id.json"),
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return { kp: secretToKeypair(fs.readFileSync(file, "utf8")), file };
    }
  }
  throw new Error(
    "No key found. Pick one (key never goes in chat):\n" +
      "  - paste your base58 private key into scripts/.secret (gitignored), or\n" +
      "  - export PRIVATE_KEY=<base58> and run, or\n" +
      "  - WALLET=/path/to/id.json node scripts/devnet-test.js"
  );
}

// Anchor instruction discriminator = first 8 bytes of sha256("global:<name>").
function discriminator(name) {
  return Array.from(
    crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)
  );
}

// Minimal inline IDL — no `anchor build` artifact needed. Matches lib.rs.
function buildIdl() {
  return {
    address: PROGRAM_ID.toBase58(),
    metadata: { name: "fund_splitter", version: "0.1.0", spec: "0.1.0" },
    instructions: [
      {
        name: "split",
        discriminator: discriminator("split"),
        accounts: [
          { name: "signer", signer: true },
          { name: "source", writable: true },
          { name: "mint" },
          { name: "token_program" },
        ],
        args: [{ name: "amounts", type: { vec: "u64" } }],
      },
    ],
    accounts: [],
    types: [],
    events: [],
    errors: [
      { code: 6000, name: "EmptyBatch", msg: "Batch must not be empty" },
      { code: 6001, name: "BatchTooLarge", msg: "Too many receivers in one call" },
      { code: 6002, name: "LengthMismatch", msg: "amounts and receiver-account counts do not match" },
      { code: 6003, name: "ZeroAmount", msg: "Amount must be non-zero" },
      { code: 6004, name: "ReceiverNotWritable", msg: "Receiver token account must be writable" },
      { code: 6005, name: "MintMismatch", msg: "Source token account mint does not match mint" },
      { code: 6006, name: "WrongOwner", msg: "Source token account is not owned by signer" },
      { code: 6007, name: "SelfTransfer", msg: "Cannot transfer to the source account" },
    ],
  };
}

function tx(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

async function main() {
  loadDotenv();
  const { kp: payer, file } = loadKeypair();
  const rpc = process.env.RPC_URL || DEFAULT_RPC;
  const connection = new Connection(rpc, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log("RPC      :", rpc);
  console.log("Payer    :", payer.publicKey.toBase58(), `(${file})`);
  console.log("Program  :", PROGRAM_ID.toBase58());

  const sol = await connection.getBalance(payer.publicKey);
  console.log("Balance  :", (sol / 1e9).toFixed(4), "SOL");
  if (sol < 0.03 * 1e9) {
    throw new Error(
      "Wallet too low on devnet SOL. Top up:\n  solana airdrop 2 --url devnet"
    );
  }

  const program = new anchor.Program(buildIdl(), provider);

  const useExistingMint = !!process.env.MINT;

  // --- 1. resolve mint ------------------------------------------------------
  let mint, decimals;
  if (useExistingMint) {
    mint = new PublicKey(process.env.MINT);
    const info = await getMint(connection, mint); // also proves the mint exists
    decimals = info.decimals;
    console.log("Mint     :", mint.toBase58(), `(existing, ${decimals} dp)`);
  } else {
    console.log("\nCreating throwaway test mint...");
    decimals = TEST_MINT_DECIMALS;
    mint = await createMint(connection, payer, payer.publicKey, null, decimals);
    console.log("Mint     :", mint.toBase58(), `(throwaway, ${decimals} dp)`);
  }

  // amounts in base units
  const a1 = BigInt(process.env.AMOUNT1 || (useExistingMint ? 80_000 : 8_000_000));
  const a2 = BigInt(process.env.AMOUNT2 || (useExistingMint ? 20_000 : 2_000_000));
  const total = a1 + a2;
  const human = (n) => (Number(n) / 10 ** decimals).toFixed(decimals);

  // --- 2. source ATA --------------------------------------------------------
  const source = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  if (useExistingMint) {
    const bal = (await getAccount(connection, source.address)).amount;
    console.log(
      "Source   :",
      source.address.toBase58(),
      `(balance ${human(bal)})`
    );
    if (bal < total) {
      throw new Error(
        `Not enough token in source. Have ${human(bal)}, need ${human(total)}.\n` +
          `Fund your wallet with this token first (devnet USDC: faucet.circle.com).`
      );
    }
  } else {
    await mintTo(connection, payer, mint, source.address, payer, 10_000_000);
    console.log("Source   :", source.address.toBase58(), "(minted 10.000000)");
  }

  // --- 3. receiver ATAs -----------------------------------------------------
  // Use the wallet addresses from .env if given; otherwise throwaway randoms.
  // We split to each receiver's ASSOCIATED token account for `mint`. The script
  // creates the ATA (payer funds rent) if it doesn't exist yet.
  const owner1 = process.env.RECEIVER_A
    ? new PublicKey(process.env.RECEIVER_A)
    : Keypair.generate().publicKey;
  const owner2 = process.env.RECEIVER_B
    ? new PublicKey(process.env.RECEIVER_B)
    : Keypair.generate().publicKey;
  const tag = (set) => (set ? "from .env" : "throwaway");

  const r1Ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner1);
  const r2Ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner2);
  console.log(
    "ReceiverA:",
    owner1.toBase58(),
    `(${tag(process.env.RECEIVER_A)}) ata ${r1Ata.address.toBase58()}`
  );
  console.log(
    "ReceiverB:",
    owner2.toBase58(),
    `(${tag(process.env.RECEIVER_B)}) ata ${r2Ata.address.toBase58()}`
  );

  // Snapshot balances before — receivers may already hold tokens, so assert deltas.
  const srcBefore = (await getAccount(connection, source.address)).amount;
  const r1Before = (await getAccount(connection, r1Ata.address)).amount;
  const r2Before = (await getAccount(connection, r2Ata.address)).amount;

  // --- 4. split -------------------------------------------------------------
  console.log(`\nCalling split([${human(a1)}, ${human(a2)}])...`);
  const amounts = [new anchor.BN(a1.toString()), new anchor.BN(a2.toString())];
  const sig = await program.methods
    .split(amounts)
    .accountsPartial({
      signer: payer.publicKey,
      source: source.address,
      mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: r1Ata.address, isWritable: true, isSigner: false },
      { pubkey: r2Ata.address, isWritable: true, isSigner: false },
    ])
    .rpc();
  console.log("Tx       :", sig);
  console.log("Explorer :", tx(sig));

  // --- 5. assert (by balance delta) ----------------------------------------
  const srcAfter = (await getAccount(connection, source.address)).amount;
  const r1After = (await getAccount(connection, r1Ata.address)).amount;
  const r2After = (await getAccount(connection, r2Ata.address)).amount;
  const got1 = r1After - r1Before;
  const got2 = r2After - r2Before;
  const spent = srcBefore - srcAfter;

  console.log("\nResults (delta):");
  console.log(`  receiverA += ${human(got1)}  (want ${human(a1)})`);
  console.log(`  receiverB += ${human(got2)}  (want ${human(a2)})`);
  console.log(`  source   -= ${human(spent)}  (want ${human(total)})`);

  const ok = got1 === a1 && got2 === a2 && spent === total;
  if (!ok) throw new Error("FAIL: balances do not match expected split");
  console.log("\nPASS ✅  split works on devnet.");
}

main().catch((e) => {
  console.error("\nERROR:", e.message || e);
  if (e.logs) console.error(e.logs.join("\n"));
  process.exit(1);
});
