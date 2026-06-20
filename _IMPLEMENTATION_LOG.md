# Fund Splitter — Implementation Log

## 2026-06-20 01:10:30 PM

**Task** — Scaffold Anchor fund-splitter program.

**Description** — Started from an empty directory (no git). Checked toolchain:
only `node v20.20.2` present; no rustc/cargo/solana/anchor/avm — so the program
cannot be compiled or tested in this workspace. Decided on a pass-through
splitter (no vault/escrow) to match the user's example (wallet signs, tokens go
direct to receivers). Wrote:

- `programs/fund-splitter/src/lib.rs` — `split(amounts: Vec<u64>)`. Receivers in
  `remaining_accounts`, paired by index with `amounts`. Loop CPIs
  `token::transfer_checked` (verifies mint + decimals) from `source` to each
  receiver, authority = `signer`.
- Guards: empty batch, `MAX_RECEIVERS = 20`, length match, zero amount, receiver
  writable, no self-transfer; `Split` accounts constrain `source.mint == mint`
  and `source.owner == signer`. Custom `SplitError` enum.
- Workspace `Cargo.toml` (overflow-checks on), program `Cargo.toml`
  (anchor-lang/anchor-spl 0.31.1, idl-build feature), `Anchor.toml`
  (anchor 0.31.1, localnet+devnet ids), `Xargo.toml`.
- `tests/fund-splitter.ts` — happy path (10 → 8+2, asserts balances + source
  drained to 0) and a length-mismatch revert test. Uses `accountsPartial` +
  `remainingAccounts`.
- `package.json`, `tsconfig.json`, `migrations/deploy.ts`, `.gitignore`,
  `README.md`, `_IMPLEMENTATION_PLAN.md`.

**Challenges** — declare_id needs a valid base58 key to compile; used the Anchor
example id `Fg6Pa...` as placeholder and documented `anchor keys sync` to replace
it after first build. No git repo → treated all files as new (no overwrites).

**Next Steps** — User installs Rust/Solana/Anchor (README), runs `anchor build`
→ `anchor keys sync` → `anchor build` → `anchor test`. Optional: Token-2022
support via `token_interface`; client helper to auto-create receiver ATAs.
