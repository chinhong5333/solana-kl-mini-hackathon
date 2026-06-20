import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundSplitter } from "../target/types/fund_splitter";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { assert } from "chai";

describe("fund-splitter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundSplitter as Program<FundSplitter>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const DECIMALS = 6; // USDC-like

  it("splits 10 tokens into 8 + 2", async () => {
    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      DECIMALS
    );

    // Source account holds 10 tokens.
    const source = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      source.address,
      payer,
      10_000_000 // 10.000000
    );

    // Two receivers.
    const r1 = Keypair.generate();
    const r2 = Keypair.generate();
    const r1Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      r1.publicKey
    );
    const r2Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      r2.publicKey
    );

    const amounts = [new anchor.BN(8_000_000), new anchor.BN(2_000_000)];

    await program.methods
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

    const b1 = await getAccount(provider.connection, r1Ata.address);
    const b2 = await getAccount(provider.connection, r2Ata.address);
    const src = await getAccount(provider.connection, source.address);

    assert.equal(b1.amount.toString(), "8000000");
    assert.equal(b2.amount.toString(), "2000000");
    assert.equal(src.amount.toString(), "0");
  });

  it("rejects length mismatch", async () => {
    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      DECIMALS
    );
    const source = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );
    await mintTo(provider.connection, payer, mint, source.address, payer, 1_000_000);

    const r1 = Keypair.generate();
    const r1Ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      r1.publicKey
    );

    let failed = false;
    try {
      await program.methods
        .split([new anchor.BN(1), new anchor.BN(1)]) // 2 amounts, 1 receiver
        .accountsPartial({
          signer: payer.publicKey,
          source: source.address,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: r1Ata.address, isWritable: true, isSigner: false },
        ])
        .rpc();
    } catch (_e) {
      failed = true;
    }
    assert.isTrue(failed, "expected LengthMismatch revert");
  });
});
