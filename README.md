# Fund Splitter

A Solana program (Anchor) that splits SPL tokens from one wallet to many
receivers in a single atomic transaction.

> Example: your wallet holds 10 USDC. Call `split([8_000_000, 2_000_000])` with
> receiver A and receiver B token accounts → A gets 8 USDC, B gets 2 USDC, in one tx.

## How it works

- **No custody.** The program never holds funds. The signer is the authority over
  the `source` token account; each payout is a CPI to the SPL Token program pulling
  straight from `source` to a receiver. There is nothing to drain.
- **Variable receivers.** Receiver token accounts are passed as `remaining_accounts`;
  `amounts[i]` pairs with `remaining_accounts[i]`.
- **Atomic.** If `source` lacks balance for the full set, the whole transaction
  reverts — partial splits never happen.
- **Checked transfers.** Uses `transfer_checked`, which verifies the mint and
  decimals, so a wrong-mint or non-token receiver account reverts.

### Amounts are base units

USDC has 6 decimals, so `8 USDC = 8_000_000`. All amounts in the instruction are
raw base units.

### Guards

| Guard | Error |
| --- | --- |
| Empty batch rejected | `EmptyBatch` |
| Max 20 receivers per call (tx-size / compute) | `BatchTooLarge` |
| `amounts.len()` must equal receiver count | `LengthMismatch` |
| Zero amount rejected | `ZeroAmount` |
| Receiver must be writable | `ReceiverNotWritable` |
| Source mint must match `mint` | `MintMismatch` |
| Source must be owned by the signer | `WrongOwner` |
| Cannot pay the source account itself | `SelfTransfer` |

## Deployed

| Network | Program ID |
| --- | --- |
| devnet | `67hyWZ9QsHcowmNvUqNCyqMmSTnQtHwL6q7SZqoPZmJt` |

## Project layout

```
programs/fund-splitter/src/lib.rs   the program (one `split` instruction)
tests/fund-splitter.ts              anchor localnet tests
scripts/devnet-test.js              standalone devnet smoke test
.env.example                        config template (copy to .env)
```

## Prerequisites

- Rust + Cargo — https://rustup.rs
- Solana CLI (Agave) — https://docs.anza.xyz/cli/install
- Anchor 0.31.1 (via avm) — https://www.anchor-lang.com/docs/installation
- Node.js 18+ and Yarn/npm

## Build & deploy

```bash
yarn install
anchor build            # generates the program keypair on first run
anchor keys sync        # writes the real program id into lib.rs + Anchor.toml
anchor build            # rebuild with the synced id

# deploy
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
```

## Test on a local validator

```bash
anchor test             # spins a local validator, runs tests/
```

## Test on devnet (real USDC)

A standalone script that exercises the deployed program end to end.

```bash
cp .env.example .env    # then fill in the values below
npm install
node scripts/devnet-test.js
```

It reads your existing token balance, splits a small amount to two receivers,
and asserts the balances changed by exactly the expected deltas. It does **not**
drain your wallet.

### Configuration (`.env`)

`.env` is used **only** by `scripts/devnet-test.js`. It is not read by the program,
`anchor build`, or `anchor test` — those use your Anchor/Solana CLI config. Copy
`.env.example` to `.env` and fill in:

| Variable | Description |
| --- | --- |
| `PRIVATE_KEY` | Base58 secret of your funded devnet wallet. **Required.** |
| `RPC_URL` | Devnet RPC. Empty = public `api.devnet.solana.com` (rate-limited). |
| `MINT` | Token mint to split. Empty = create a throwaway test mint. Devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| `RECEIVER_A` / `RECEIVER_B` | Receiver wallet addresses. Empty = throwaway random wallets. |
| `AMOUNT1` / `AMOUNT2` | Amounts in base units (default `80000` + `20000` = 0.08 + 0.02 USDC). |

Wallet needs a little devnet SOL (~0.05) for fees + ATA rent. Get devnet USDC at
https://faucet.circle.com (select Solana Devnet).

## Call from a client

```ts
await program.methods
  .split([new anchor.BN(8_000_000), new anchor.BN(2_000_000)])
  .accountsPartial({
    signer: wallet.publicKey,
    source: sourceAta,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .remainingAccounts([
    { pubkey: receiverAAta, isWritable: true, isSigner: false },
    { pubkey: receiverBAta, isWritable: true, isSigner: false },
  ])
  .rpc();
```

Receiver ATAs must exist before calling `split`; create them with
`getOrCreateAssociatedTokenAccount` (the devnet test script does this for you).

## Security

- `.env` holds your private key and is **gitignored** — never commit it. Only
  `.env.example` (no secrets) is committed.
- The program supports classic SPL Token mints (USDC). For Token-2022 mints, swap
  `anchor_spl::token` for `token_interface`.
- For batches near 20 receivers, raise the client compute limit:
  `ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })`.

## License

MIT
