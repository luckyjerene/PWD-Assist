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
//! - `register_user(user, name, disability_type, contact_info)` — Register a PWD user
//! - `register_provider(provider, service_type)` — Register a service provider
//! - `request_service(user, provider)` — Request a service
//! - `complete_service(provider, request_id, token, amount)` — Complete service and transfer token

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String, symbol_short, token};

// ─── Storage Keys ──────────────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Record(u32),       // Disbursement record for backward compatibility
    User(Address),     // Registered User
    Provider(Address), // Registered Provider
    Request(u32),      // Service request
    RequestCount,      // Counter for service requests
}

/// TTL constants for instance storage.
/// Instance storage is extended on every write to keep the contract alive.
const TTL_THRESHOLD: u32 = 50;
const TTL_EXTEND: u32 = 100;

// ─── Data Types ────────────────────────────────────────────────────────────────

/// A single disbursement record stored per recipient.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Disbursement {
    pub recipient_id: u32,
    pub amount: u32,
    pub timestamp: u64,
    pub agent: Address,
}

/// Aggregate statistics for the disbursement program.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stats {
    pub total_disbursed: u32,
    pub total_recipients: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct User {
    pub user_address: Address,
    pub name: String,
    pub disability_type: String,
    pub contact_info: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Provider {
    pub provider_address: Address,
    pub service_type: String,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ServiceRequest {
    pub id: u32,
    pub user: Address,
    pub provider: Address,
    pub completed: bool,
}

// ─── Error Handling ────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    AlreadyDisbursed = 2,
    NotFound = 3,
    UserAlreadyRegistered = 4,
    ProviderAlreadyRegistered = 5,
    NotRegistered = 6,
    RequestAlreadyCompleted = 7,
    Unauthorized = 8,
}

// ─── Contract Definition ───────────────────────────────────────────────────────

#[contract]
pub struct PwdAssistContract;

#[contractimpl]
impl PwdAssistContract {
    /// Records a government assistance disbursement to a PWD beneficiary.
    pub fn disburse(
        env: Env,
        agent: Address,
        recipient_id: u32,
        amount: u32,
    ) -> Result<Disbursement, Error> {
        agent.require_auth();

        if amount == 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        if env.storage().instance().has(&recipient_id) {
            panic_with_error!(&env, Error::AlreadyDisbursed);
        }

        let record = Disbursement {
            recipient_id,
            amount,
            timestamp: env.ledger().timestamp(),
            agent: agent.clone(),
        };

        // Old key format (u32) for frontend compatibility
        env.storage().instance().set(&recipient_id, &record);

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

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);

        Ok(record)
    }

    /// Retrieves the disbursement record for a specific PWD recipient.
    pub fn get_record(env: Env, recipient_id: u32) -> Result<Disbursement, Error> {
        env.storage()
            .instance()
            .get(&recipient_id)
            .ok_or(Error::NotFound)
    }

    /// Returns aggregate disbursement statistics.
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

    /// Registers a PWD user
    pub fn register_user(env: Env, user: Address, name: String, disability_type: String, contact_info: String) -> Result<User, Error> {
        user.require_auth();
        let key = DataKey::User(user.clone());
        if env.storage().instance().has(&key) {
            panic_with_error!(&env, Error::UserAlreadyRegistered);
        }
        let user_data = User { user_address: user.clone(), name, disability_type, contact_info };
        env.storage().instance().set(&key, &user_data);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(user_data)
    }

    /// Registers a service provider
    pub fn register_provider(env: Env, provider: Address, service_type: String) -> Result<Provider, Error> {
        provider.require_auth();
        let key = DataKey::Provider(provider.clone());
        if env.storage().instance().has(&key) {
            panic_with_error!(&env, Error::ProviderAlreadyRegistered);
        }
        let provider_data = Provider { provider_address: provider.clone(), service_type };
        env.storage().instance().set(&key, &provider_data);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(provider_data)
    }

    /// Requests a service from a registered provider
    pub fn request_service(env: Env, user: Address, provider: Address) -> Result<ServiceRequest, Error> {
        user.require_auth();
        if !env.storage().instance().has(&DataKey::User(user.clone())) {
            panic_with_error!(&env, Error::NotRegistered);
        }
        if !env.storage().instance().has(&DataKey::Provider(provider.clone())) {
            panic_with_error!(&env, Error::NotRegistered);
        }
        
        let mut count: u32 = env.storage().instance().get(&DataKey::RequestCount).unwrap_or(0);
        count += 1;
        
        let req = ServiceRequest {
            id: count,
            user,
            provider,
            completed: false,
        };
        
        env.storage().instance().set(&DataKey::Request(count), &req);
        env.storage().instance().set(&DataKey::RequestCount, &count);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(req)
    }

    /// Completes a service and transfers token to the provider
    pub fn complete_service(env: Env, provider: Address, request_id: u32, token: Address, amount: i128) -> Result<ServiceRequest, Error> {
        provider.require_auth();
        let key = DataKey::Request(request_id);
        let mut req: ServiceRequest = env.storage().instance().get(&key).unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        
        if req.provider != provider {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if req.completed {
            panic_with_error!(&env, Error::RequestAlreadyCompleted);
        }
        
        // Transfer token from contract to provider
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &provider, &amount);
        
        req.completed = true;
        env.storage().instance().set(&key, &req);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(req)
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, PwdAssistContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PwdAssistContract, ());
        let client = PwdAssistContractClient::new(&env, &contract_id);
        let agent = Address::generate(&env);
        (env, client, agent)
    }

    #[test]
    fn test_disburse_happy_path() {
        let (_env, client, agent) = setup();
        let record = client.disburse(&agent, &1001_u32, &500_u32);
        assert_eq!(record.recipient_id, 1001);
        let fetched = client.get_record(&1001_u32);
        assert_eq!(fetched.amount, 500);
    }
    
    #[test]
    fn test_register_and_request() {
        let (env, client, _agent) = setup();
        let user = Address::generate(&env);
        let provider = Address::generate(&env);
        
        let u_name = String::from_str(&env, "Juan");
        let d_type = String::from_str(&env, "Visual");
        let contact = String::from_str(&env, "0912");
        client.register_user(&user, &u_name, &d_type, &contact);
        
        let s_type = String::from_str(&env, "Therapy");
        client.register_provider(&provider, &s_type);
        
        let req = client.request_service(&user, &provider);
        assert_eq!(req.id, 1);
        assert_eq!(req.completed, false);
    }
}
