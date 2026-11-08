//! Whalecheck's on-chain policy. The agent must get a copy approved here before it acts.
//! The program holds no funds. It enforces spending limits and allows each whale trade
//! to be approved only once.

use anchor_lang::prelude::*;

declare_id!("H6ncQXeoD3y42XYuB3NGZjsF4cg9v54m6xxRrEt6GcyQ");

/// Every off-chain validation rule has to pass before a copy can be approved.
pub const TOTAL_RULES: u8 = 6;
const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod whalecheck_policy {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, max_order_cents: u64, max_daily_cents: u64) -> Result<()> {
        check_limits(max_order_cents, max_daily_cents)?;
        let policy = &mut ctx.accounts.policy;
        policy.authority = ctx.accounts.authority.key();
        policy.max_order_cents = max_order_cents;
        policy.max_daily_cents = max_daily_cents;
        policy.spent_today_cents = 0;
        policy.day = Clock::get()?.unix_timestamp / SECONDS_PER_DAY;
        policy.total_approved = 0;
        policy.bump = ctx.bumps.policy;
        Ok(())
    }

    pub fn set_limits(ctx: Context<SetLimits>, max_order_cents: u64, max_daily_cents: u64) -> Result<()> {
        check_limits(max_order_cents, max_daily_cents)?;
        let policy = &mut ctx.accounts.policy;
        policy.max_order_cents = max_order_cents;
        policy.max_daily_cents = max_daily_cents;
        Ok(())
    }

    /// Approves one copy. A repeat of the same trade fails because its record already exists.
    pub fn authorize_copy(ctx: Context<AuthorizeCopy>, trade_hash: [u8; 32], amount_cents: u64, rules_passed: u8) -> Result<()> {
        require!(rules_passed == TOTAL_RULES, PolicyError::RulesNotPassed);

        let clock = Clock::get()?;
        let today = clock.unix_timestamp / SECONDS_PER_DAY;
        let policy = &mut ctx.accounts.policy;
        policy.spent_today_cents = next_spend(
            policy.spent_today_cents,
            policy.day,
            today,
            amount_cents,
            policy.max_order_cents,
            policy.max_daily_cents,
        )?;
        policy.day = today;
        policy.total_approved = policy.total_approved.checked_add(1).ok_or(PolicyError::Overflow)?;

        let record = &mut ctx.accounts.copy_record;
        record.policy = policy.key();
        record.trade_hash = trade_hash;
        record.amount_cents = amount_cents;
        record.approved_at = clock.unix_timestamp;

        emit!(CopyApproved { policy: policy.key(), trade_hash, amount_cents, spent_today_cents: policy.spent_today_cents });
        Ok(())
    }
}

fn check_limits(max_order_cents: u64, max_daily_cents: u64) -> Result<()> {
    require!(max_order_cents > 0 && max_order_cents <= max_daily_cents, PolicyError::InvalidLimits);
    Ok(())
}

/// Returns the day's new total, or the limit this order would break.
fn next_spend(spent: u64, day: i64, today: i64, amount: u64, max_order: u64, max_daily: u64) -> Result<u64> {
    require!(amount > 0, PolicyError::InvalidAmount);
    require!(amount <= max_order, PolicyError::OrderLimitExceeded);
    let base = if day == today { spent } else { 0 };
    let total = base.checked_add(amount).ok_or(PolicyError::Overflow)?;
    require!(total <= max_daily, PolicyError::DailyLimitExceeded);
    Ok(total)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Policy::INIT_SPACE, seeds = [b"policy", authority.key().as_ref()], bump)]
    pub policy: Account<'info, Policy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetLimits<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"policy", authority.key().as_ref()], bump = policy.bump, has_one = authority)]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
#[instruction(trade_hash: [u8; 32])]
pub struct AuthorizeCopy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"policy", authority.key().as_ref()], bump = policy.bump, has_one = authority)]
    pub policy: Account<'info, Policy>,
    #[account(init, payer = authority, space = 8 + CopyRecord::INIT_SPACE, seeds = [b"copy", policy.key().as_ref(), trade_hash.as_ref()], bump)]
    pub copy_record: Account<'info, CopyRecord>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub authority: Pubkey,
    pub max_order_cents: u64,
    pub max_daily_cents: u64,
    pub spent_today_cents: u64,
    pub day: i64,
    pub total_approved: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CopyRecord {
    pub policy: Pubkey,
    pub trade_hash: [u8; 32],
    pub amount_cents: u64,
    pub approved_at: i64,
}

#[event]
pub struct CopyApproved {
    pub policy: Pubkey,
    pub trade_hash: [u8; 32],
    pub amount_cents: u64,
    pub spent_today_cents: u64,
}

#[error_code]
pub enum PolicyError {
    #[msg("Per-order limit must be above zero and no more than the daily limit")]
    InvalidLimits,
    #[msg("Amount must be above zero")]
    InvalidAmount,
    #[msg("All validation rules must pass")]
    RulesNotPassed,
    #[msg("Order exceeds the per-order limit")]
    OrderLimitExceeded,
    #[msg("Order exceeds the daily limit")]
    DailyLimitExceeded,
    #[msg("Arithmetic overflow")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAX_ORDER: u64 = 500;
    const MAX_DAILY: u64 = 2_500;

    fn spend(spent: u64, day: i64, today: i64, amount: u64) -> Result<u64> {
        next_spend(spent, day, today, amount, MAX_ORDER, MAX_DAILY)
    }

    #[test]
    fn adds_to_the_same_day() {
        assert_eq!(spend(500, 10, 10, 500).unwrap(), 1_000);
    }

    #[test]
    fn resets_on_a_new_day() {
        assert_eq!(spend(2_500, 10, 11, 500).unwrap(), 500);
    }

    #[test]
    fn allows_exactly_the_daily_limit() {
        assert_eq!(spend(2_000, 10, 10, 500).unwrap(), 2_500);
    }

    #[test]
    fn rejects_over_the_daily_limit() {
        assert!(spend(2_100, 10, 10, 500).is_err());
    }

    #[test]
    fn rejects_over_the_order_limit() {
        assert!(spend(0, 10, 10, 501).is_err());
    }

    #[test]
    fn rejects_zero_and_overflow() {
        assert!(spend(0, 10, 10, 0).is_err());
        assert!(next_spend(u64::MAX, 10, 10, 1, u64::MAX, u64::MAX).is_err());
    }

    #[test]
    fn rejects_bad_limits() {
        assert!(check_limits(0, 100).is_err());
        assert!(check_limits(200, 100).is_err());
        assert!(check_limits(100, 100).is_ok());
    }
}
