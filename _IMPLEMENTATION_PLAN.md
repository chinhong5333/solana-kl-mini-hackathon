# Fund Splitter — Implementation Plan

## Overview

Solana Anchor program that splits SPL tokens (e.g. USDC) from one wallet to
multiple receivers in a single transaction. Pass-through design: the program
custodies no funds; the signer authorizes transfers straight from their token
account to each receiver. Primary use case: wallet holds 10 USDC, calls `split`
with `[8 USDC → receiver1, 2 USDC → receiver2]`.

## Implementation Plan

1. Scaffold Anchor workspace (Anchor.toml, workspace + program Cargo.toml,
   tsconfig, package.json). — done
2. Program `fund_splitter` with one `split(amounts: Vec<u64>)` instruction.
   - Receivers via `remaining_accounts`, paired by index with `amounts`.
   - CPI `transfer_checked` from signer's source account to each receiver. — done
3. Validation: non-empty batch, max 20 receivers, equal lengths, non-zero
   amounts, writable receivers, no self-transfer, source owner + mint checks. — done
4. TS tests: 10 → 8+2 happy path; length-mismatch revert. — done
5. README + run instructions (toolchain not installed in this workspace). — done

## Progress

- Core program, project scaffold, tests, and docs written.
- Toolchain (Rust/Solana/Anchor) is NOT installed locally — cannot `anchor build`
  or run tests here. User must install per README, then `anchor keys sync`.
- Open follow-ups: optional Token-2022 support (swap `anchor_spl::token` for
  `token_interface`); optional auto-create of receiver ATAs in a client helper.

## Conclusion

A minimal, custody-free splitter. Safe defaults: `transfer_checked` enforces
mint+decimals, atomic multi-transfer, bounded batch. Recommend running
`anchor test` after toolchain install to confirm on a local validator before
devnet/mainnet deploy.
