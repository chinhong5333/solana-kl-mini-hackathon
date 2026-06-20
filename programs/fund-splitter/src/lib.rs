use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

// Placeholder id. After first `anchor build`, run `anchor keys sync` to write the real one.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Max receivers per call. Keeps the tx within size/compute limits.
const MAX_RECEIVERS: usize = 20;

#[program]
pub mod fund_splitter {
    use super::*;

    /// Split tokens from the signer's token account to many receivers in one tx.
    ///
    /// `amounts[i]` (in base units, e.g. USDC has 6 decimals so 8 USDC = 8_000_000)
    /// is sent to `remaining_accounts[i]`, which must be a token account of `mint`.
    ///
    /// This is a pass-through splitter: the contract holds no funds. The signer is the
    /// authority over `source`, so each transfer moves tokens straight from the signer's
    /// account to a receiver. If `source` lacks balance for the full set, the whole tx
    /// reverts (atomic).
    pub fn split<'info>(
        ctx: Context<'_, '_, '_, 'info, Split<'info>>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        let receivers = ctx.remaining_accounts;

        // --- checks -------------------------------------------------------
        require!(!amounts.is_empty(), SplitError::EmptyBatch);
        require!(amounts.len() <= MAX_RECEIVERS, SplitError::BatchTooLarge);
        require!(amounts.len() == receivers.len(), SplitError::LengthMismatch);

        let decimals = ctx.accounts.mint.decimals;
        let source_key = ctx.accounts.source.key();

        for (i, receiver) in receivers.iter().enumerate() {
            let amount = amounts[i];

            require!(amount != 0, SplitError::ZeroAmount);
            require!(receiver.is_writable, SplitError::ReceiverNotWritable);
            // Don't let source double as a destination — would corrupt the split math.
            require_keys_neq!(receiver.key(), source_key, SplitError::SelfTransfer);

            // transfer_checked verifies BOTH source and destination match `mint`
            // and that `decimals` is correct, so a wrong-mint receiver account reverts.
            let cpi_accounts = TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: receiver.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            );
            token::transfer_checked(cpi_ctx, amount, decimals)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Split<'info> {
    /// Authority over `source`. Pays the tx and signs each transfer.
    pub signer: Signer<'info>,

    /// Source token account the tokens are pulled from. Must be owned by `signer`
    /// and hold `mint`.
    #[account(
        mut,
        constraint = source.mint == mint.key() @ SplitError::MintMismatch,
        constraint = source.owner == signer.key() @ SplitError::WrongOwner,
    )]
    pub source: Account<'info, TokenAccount>,

    /// The token mint being split (e.g. USDC).
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    // Receiver token accounts are passed as `remaining_accounts`, each writable.
}

#[error_code]
pub enum SplitError {
    #[msg("Batch must not be empty")]
    EmptyBatch,
    #[msg("Too many receivers in one call")]
    BatchTooLarge,
    #[msg("amounts and receiver-account counts do not match")]
    LengthMismatch,
    #[msg("Amount must be non-zero")]
    ZeroAmount,
    #[msg("Receiver token account must be writable")]
    ReceiverNotWritable,
    #[msg("Source token account mint does not match mint")]
    MintMismatch,
    #[msg("Source token account is not owned by signer")]
    WrongOwner,
    #[msg("Cannot transfer to the source account")]
    SelfTransfer,
}
