//! # PWD Assist — Government PWD Assistance Disbursement Contract
//!
//! A Soroban smart contract that records government cash assistance
//! disbursements to Persons with Disabilities (PWDs) on the Stellar
//! testnet. Each disbursement is logged immutably on-chain with the
//! disbursing agent's authorization, creating a tamper-proof audit
//! trail that prevents ghost beneficiaries and political interference.
//!
//! ## Public Functions
//! - `disburse(agent, recipient_id, amount)` — Record a disbursement (write)
//! - `get_record(recipient_id)` — Look up a specific disbursement (read)
//! - `get_stats()` — Get aggregate disbursement statistics (read)

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, symbol_short};

// ─── Storage Keys ──────────────────────────────────────────────────────────────
// We use symbol_short! for efficient storage key encoding.
// "TOTAL"  → total XLM disbursed (u32, demo units)
// "COUNT"  → number of unique recipients served (u32)
// Per-recipient keys use the recipient_id as a u32 index.

/// TTL constants for instance storage.
/// Instance storage is extended on every write to keep the contract alive.
const TTL_THRESHOLD: u32 = 50;
const TTL_EXTEND: u32 = 100;

// ─── Data Types ────────────────────────────────────────────────────────────────

/// A single disbursement record stored per recipient.
/// Contains who received aid, how much, when, and which agent authorized it.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Disbursement {
    /// Unique PWD beneficiary identifier (e.g. PWD ID number as u32)
    pub recipient_id: u32,
    /// Amount of assistance in demo XLM units (u32 for IDE compatibility)
    pub amount: u32,
    /// Ledger timestamp when the disbursement was recorded
    pub timestamp: u64,
    /// Stellar address of the authorized disbursing agent
    pub agent: Address,
}

/// Aggregate statistics for the disbursement program.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stats {
    /// Total amount of XLM disbursed across all recipients
    pub total_disbursed: u32,
    /// Total number of unique recipients who received assistance
    pub total_recipients: u32,
}

// ─── Error Handling ────────────────────────────────────────────────────────────

/// Contract error codes.
/// Uses `#[contracterror]` (NOT `#[contracttype]`) for proper Soroban error handling.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The disbursement amount must be greater than zero
    InvalidAmount = 1,
    /// This recipient has already received a disbursement
    AlreadyDisbursed = 2,
    /// No disbursement record found for the given recipient ID
    NotFound = 3,
}

// ─── Contract Definition ───────────────────────────────────────────────────────

#[contract]
pub struct PwdAssistContract;

#[contractimpl]
impl PwdAssistContract {
    /// Records a government assistance disbursement to a PWD beneficiary.
    ///
    /// # Authorization
    /// The `agent` address must authorize this call via `require_auth()`.
    /// In production, this would be a DSWD social worker's wallet.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `agent` - The authorized disbursing agent's Stellar address
    /// * `recipient_id` - The PWD beneficiary's unique ID number (u32)
    /// * `amount` - The amount of assistance in demo XLM units (u32)
    ///
    /// # Errors
    /// * `InvalidAmount` - If amount is 0
    /// * `AlreadyDisbursed` - If this recipient_id already has a record
    ///
    /// # Returns
    /// The recorded `Disbursement` struct
    pub fn disburse(
        env: Env,
        agent: Address,
        recipient_id: u32,
        amount: u32,
    ) -> Result<Disbursement, Error> {
        // Require the agent to authorize this disbursement
        agent.require_auth();

        // Validate: amount must be greater than zero
        if amount == 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Check for duplicate: each recipient can only receive one disbursement
        if env.storage().instance().has(&recipient_id) {
            panic_with_error!(&env, Error::AlreadyDisbursed);
        }

        // Build the disbursement record with ledger timestamp
        let record = Disbursement {
            recipient_id,
            amount,
            timestamp: env.ledger().timestamp(),
            agent: agent.clone(),
        };

        // Store the record keyed by recipient_id
        env.storage().instance().set(&recipient_id, &record);

        // Update aggregate stats
        let mut total: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOTAL"))
            .unwrap_or(0);
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("COUNT"))
            .unwrap_or(0);

        total = total.checked_add(amount).unwrap_or(u32::MAX);
        count = count.checked_add(1).unwrap_or(u32::MAX);

        env.storage().instance().set(&symbol_short!("TOTAL"), &total);
        env.storage().instance().set(&symbol_short!("COUNT"), &count);

        // Extend TTL to keep the contract instance alive
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        Ok(record)
    }

    /// Retrieves the disbursement record for a specific PWD recipient.
    ///
    /// This is a read-only function (free via simulation, no gas cost).
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `recipient_id` - The PWD beneficiary's unique ID number
    ///
    /// # Returns
    /// The `Disbursement` record if found, or `Error::NotFound`
    pub fn get_record(env: Env, recipient_id: u32) -> Result<Disbursement, Error> {
        env.storage()
            .instance()
            .get(&recipient_id)
            .ok_or(Error::NotFound)
    }

    /// Returns aggregate disbursement statistics.
    ///
    /// This is a read-only function (free via simulation).
    ///
    /// # Returns
    /// A `Stats` struct with total_disbursed and total_recipients
    pub fn get_stats(env: Env) -> Stats {
        let total: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("TOTAL"))
            .unwrap_or(0);
        let count: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("COUNT"))
            .unwrap_or(0);

        Stats {
            total_disbursed: total,
            total_recipients: count,
        }
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    /// Helper: register and return the contract client + a random agent address
    fn setup() -> (Env, PwdAssistContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PwdAssistContract, ());
        let client = PwdAssistContractClient::new(&env, &contract_id);
        let agent = Address::generate(&env);
        (env, client, agent)
    }

    // ── Test 1: Happy-path MVP flow ────────────────────────────────────────
    // Disburse to a PWD, then verify the record and stats are correct.
    #[test]
    fn test_disburse_happy_path() {
        let (_env, client, agent) = setup();

        // Disburse 500 demo XLM to recipient #1001
        let record = client.disburse(&agent, &1001_u32, &500_u32);

        assert_eq!(record.recipient_id, 1001);
        assert_eq!(record.amount, 500);
        assert_eq!(record.agent, agent);

        // Verify the record is retrievable
        let fetched = client.get_record(&1001_u32);
        assert_eq!(fetched.recipient_id, 1001);
        assert_eq!(fetched.amount, 500);

        // Verify aggregate stats
        let stats = client.get_stats();
        assert_eq!(stats.total_disbursed, 500);
        assert_eq!(stats.total_recipients, 1);
    }

    // ── Test 2: Zero amount is rejected ────────────────────────────────────
    // Attempting to disburse 0 XLM should fail with InvalidAmount.
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_zero_amount_rejected() {
        let (_env, client, agent) = setup();
        client.disburse(&agent, &2001_u32, &0_u32);
    }

    // ── Test 3: Duplicate disbursement is rejected ─────────────────────────
    // Attempting to disburse to the same recipient_id twice should fail.
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_duplicate_disbursement_rejected() {
        let (_env, client, agent) = setup();
        client.disburse(&agent, &3001_u32, &100_u32);
        // Second disbursement to same recipient should panic
        client.disburse(&agent, &3001_u32, &200_u32);
    }

    // ── Test 4: Stats accumulate correctly across multiple disbursements ───
    // Disburse to 3 different recipients and verify stats add up.
    #[test]
    fn test_stats_accumulate() {
        let (_env, client, agent) = setup();

        client.disburse(&agent, &4001_u32, &100_u32);
        client.disburse(&agent, &4002_u32, &250_u32);
        client.disburse(&agent, &4003_u32, &150_u32);

        let stats = client.get_stats();
        assert_eq!(stats.total_disbursed, 500); // 100 + 250 + 150
        assert_eq!(stats.total_recipients, 3);
    }

    // ── Test 5: get_record for non-existent recipient returns NotFound ─────
    // Querying a recipient that was never disbursed to should return an error.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_get_record_not_found() {
        let (_env, client, _agent) = setup();
        client.get_record(&9999_u32);
    }
}
