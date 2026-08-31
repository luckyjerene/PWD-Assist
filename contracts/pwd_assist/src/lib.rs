#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

// ── Types ────────────────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Admin,           // Address
    HasReceived(u32),// Map beneficiary_id to boolean
    Escrow(u32),     // Map beneficiary_id to EscrowRecord
}

#[contracttype]
pub struct EscrowRecord {
    pub provider: Address,
    pub amount: i128,
    pub fulfilled: bool,
}

// ── Constants ────────────────────────────────────────────────────────────
// TTL values (in ledgers). Approx 5 seconds per ledger.
const DAY_IN_LEDGERS: u32 = 17280; // 24 * 60 * 60 / 5
const ACTIVE_RECORD_TTL: u32 = 30 * DAY_IN_LEDGERS; // 30 days

#[contract]
pub struct PwdAssistContract;

#[contractimpl]
impl PwdAssistContract {
    /// Initialize the contract with an admin (DSWD Agent authority)
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(ACTIVE_RECORD_TTL, ACTIVE_RECORD_TTL);
    }

    /// Disburse funds to a beneficiary (Idempotent, Replay-Protected)
    pub fn disburse(env: Env, agent: Address, beneficiary_id: u32, _amount: i128) -> Symbol {
        agent.require_auth();

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if agent != admin {
            panic!("Unauthorized: Only admin can disburse");
        }

        let key = DataKey::HasReceived(beneficiary_id);
        
        // Idempotency / No Double-Spend Check
        if env.storage().persistent().has(&key) {
            panic!("Beneficiary has already received disbursement");
        }

        // Lock the state
        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, ACTIVE_RECORD_TTL, ACTIVE_RECORD_TTL);

        symbol_short!("SUCCESS")
    }

    /// Read-only check for UI Threat Model visualization
    pub fn check_status(env: Env, beneficiary_id: u32) -> bool {
        let key = DataKey::HasReceived(beneficiary_id);
        env.storage().persistent().has(&key)
    }

    /// Escrow Marketplace: Beneficiary locks tokens for a specific provider
    pub fn lock_escrow(env: Env, beneficiary: Address, beneficiary_id: u32, provider: Address, amount: i128) {
        beneficiary.require_auth();

        let key = DataKey::HasReceived(beneficiary_id);
        if !env.storage().persistent().has(&key) {
            panic!("Beneficiary has no funds to lock");
        }

        let escrow_key = DataKey::Escrow(beneficiary_id);
        if env.storage().persistent().has(&escrow_key) {
            panic!("Escrow already exists");
        }

        let record = EscrowRecord {
            provider,
            amount,
            fulfilled: false,
        };

        env.storage().persistent().set(&escrow_key, &record);
        env.storage().persistent().extend_ttl(&escrow_key, ACTIVE_RECORD_TTL, ACTIVE_RECORD_TTL);
    }
}
