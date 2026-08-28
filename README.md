# 🏛️ PWD Assist PH

> On-chain government cash assistance disbursement for Filipino Persons with Disabilities — powered by Soroban smart contracts on Stellar.

![Stellar](https://img.shields.io/badge/Stellar-Testnet-blue?style=for-the-badge&logo=stellar)
![Soroban](https://img.shields.io/badge/Soroban-SDK%2022-6366f1?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## Project Description

**PWD Assist PH** is a Soroban-powered dApp that records government cash assistance disbursements to Persons with Disabilities (PWDs) directly on the Stellar blockchain. Instead of relying on paper-based ledgers that are prone to fraud, ghost beneficiaries, and political manipulation, every disbursement is logged immutably on-chain with cryptographic agent authorization.

The smart contract enforces that:
- Only authorized agents can disburse funds (via `require_auth()`)
- Each PWD recipient receives exactly one disbursement (duplicate prevention)
- All records are publicly auditable on the Stellar testnet explorer

**Target users:** DSWD social workers in Quezon City, Manila, and Cebu City who currently distribute cash assistance envelopes to 200+ PWDs per payout day — and the PWD beneficiaries who lose a full day traveling to distribution centers.

## Project Vision

In the Philippines, the DSWD distributes cash assistance through programs like AICS (Assistance to Individuals in Crisis Situation) and UPLIFT. Current challenges include:

- **Ghost beneficiaries** — names on payout lists who don't exist or are deceased
- **Fixers and scams** — individuals charging fees to "facilitate" legitimate aid
- **Political interference** — local officials inserting names for patronage
- **Physical hardship** — wheelchair users and bed-ridden PWDs must travel to field offices

PWD Assist PH demonstrates how Soroban smart contracts can solve these problems:

1. **Immutable ledger** — every disbursement is recorded on-chain, publicly auditable
2. **Agent authorization** — only cryptographically authenticated agents can disburse
3. **Duplicate prevention** — the contract rejects second disbursements to the same PWD ID
4. **Remote access** — disbursements happen via wallet, not physical queues

**Production vision:** Integrate with the Philippine National PWD Registry, use USDC or PHP stablecoin for real currency, and allow barangay-level agent delegation.

## Key Features

- **📤 On-Chain Disbursement** — Record PWD assistance disbursements via Soroban smart contract
- **🔒 Agent Authorization** — `require_auth()` ensures only authorized wallets can disburse
- **🚫 Duplicate Prevention** — Contract rejects double disbursements to the same PWD ID
- **🔍 Record Lookup** — Query any PWD's disbursement record directly from the contract (free simulation)
- **📊 Aggregate Statistics** — Dashboard shows total disbursed and recipients served
- **🔗 Freighter Integration** — Connect/disconnect wallet via Freighter browser extension
- **🖥️ Soroban IDE Compatible** — Full Deploy → Preview → Run workflow in Soroban IDE

## Deployed Contract Details

| Field | Value |
|---|---|
| **Network** | Stellar Testnet |
| **Contract ID** | pending — deploy via Soroban IDE Deploy panel |
| **Contract Crate** | `contracts/pwd_assist` |
| **MVP Functions** | `disburse`, `get_record`, `get_stats` |
| **Explorer** | `https://stellar.expert/explorer/testnet/contract/{CONTRACT_ID}` |
| **Last Deployed** | pending |

## Future Scope

- **PHP Stablecoin** — Replace demo XLM units with a PHP-pegged stablecoin for real disbursements
- **PWD ID Verification** — Integrate with the Philippine National PWD Registry for on-chain ID hashing
- **Barangay Delegation** — Allow agents to delegate disbursement authority to barangay-level officials
- **Mobile PWA** — Progressive Web App for field social workers using phones
- **Batch Disbursement** — Multi-recipient batch transactions for payout day efficiency
- **Audit Dashboard** — Public transparency dashboard showing all disbursements by region

## Setup Guide

### 🖥️ Soroban IDE (Recommended)

1. **Open Soroban IDE** and create a new project or paste the project files
2. **Deploy panel** → Select `contracts/pwd_assist` → **Build Contract** → **Deploy** (approve in Freighter on Testnet)
3. **Copy the Contract ID** (starts with `C…`) from the deploy result
4. **Fullstack/Preview panel** → Paste Contract ID into `.env` or use **"Save to .env"**
5. **Rebuild preview** → **Connect wallet** → **Disburse** → verify on-chain record

### 💻 Local Development

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/pwd-assist-ph.git
cd pwd-assist-ph

# 2. Build the Soroban contract
stellar contract build --manifest-path contracts/pwd_assist/Cargo.toml

# 3. Run contract tests
cargo test --manifest-path contracts/pwd_assist/Cargo.toml

# 4. Deploy to testnet (requires Stellar CLI + funded testnet account)
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/pwd_assist.wasm \
  --network testnet \
  --source YOUR_SECRET_KEY

# 5. Start the frontend
cd frontend
cp .env.example .env
# Paste your Contract ID into .env: VITE_CONTRACT_ID=C...
npm install
npm run dev

# 6. Open http://localhost:5173 with Freighter on Testnet
```

> **Note:** The Soroban IDE uses `stellar contract build` (Stellar CLI) and `soroban-sdk 22.0.8`. The `soroban` CLI command is deprecated — use `stellar` instead.

### Freighter Testnet Setup

1. Install [Freighter Wallet](https://www.freighter.app/) browser extension
2. Create or import a wallet
3. Switch to **Testnet**: Freighter → Settings → Network → **TESTNET**
4. Fund your account: `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PWD Assist PH Frontend                    │
│              (React 18 + Vite + TypeScript)                  │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ App.tsx  │──│ wallet.ts    │──│ Freighter Extension  │   │
│  │          │  │ + IDE bridge │  │ (sign transactions)  │   │
│  └────┬─────┘  └──────────────┘  └─────────────────────┘   │
│       │                                                      │
│  ┌────┴──────────────┐  ┌────────────────────┐              │
│  │ sorobanClient.ts  │  │ contractRuntime.ts │              │
│  │ simulate()        │  │ getContractId()    │              │
│  │ invokeWrite()     │  │ IDE postMessage    │              │
│  └────────┬──────────┘  └────────────────────┘              │
└───────────┼─────────────────────────────────────────────────┘
            │ Soroban RPC
            ▼
┌──────────────────────────────┐
│  Stellar Testnet (Horizon)   │
│  soroban-testnet.stellar.org │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  contracts/pwd_assist        │
│  ┌────────────────────────┐  │
│  │ disburse(agent, id,    │  │
│  │   amount) → Record     │  │
│  │ get_record(id) → Rec   │  │
│  │ get_stats() → Stats    │  │
│  └────────────────────────┘  │
│  Instance Storage:           │
│  - Per-recipient records     │
│  - TOTAL / COUNT aggregates  │
└──────────────────────────────┘
```

## 2-Minute Demo Script

1. **Open** the app in Soroban IDE Preview (or localhost:5173)
2. **See** the landing page with "Powered by Soroban Smart Contracts" badge
3. **Click** "Connect Freighter Wallet" → approve in Freighter
4. **Dashboard** appears: Stats (0 XLM / 0 Recipients) + Disburse form + Lookup panel
5. **Enter** Recipient ID: `1001`, Amount: `500` → see transaction summary
6. **Click** "Disburse Assistance" → approve in Freighter popup
7. **See** success: ✅ green card with transaction hash → click hash to view on Stellar Expert
8. **Stats update**: 500 XLM disbursed, 1 recipient served
9. **Lookup**: Enter `1001` → see the on-chain record (amount, timestamp, agent)
10. **Try duplicate**: Enter `1001` again → see "Already Disbursed" error (contract enforcement!)

### 30-Second Pitch

> "In the Philippines, 1.4 million PWDs must physically travel to DSWD offices to receive cash assistance — waiting in lines that wheelchair users and visually impaired citizens can barely navigate. PWD Assist PH uses a Soroban smart contract to record every disbursement on-chain with agent authorization. No ghost beneficiaries, no fixers, no queues. Each disbursement is immutable and publicly auditable. We deployed it on Stellar testnet — connect your wallet, disburse, and see the record on-chain in under 5 seconds."

## Screenshots

### Landing Page (Wallet Not Connected)

_Screenshot placeholder — add landing page screenshot_

`![Landing Page](./screenshots/landing.png)`

### Dashboard with Stats

_Screenshot placeholder — add dashboard screenshot after disbursement_

`![Dashboard](./screenshots/dashboard.png)`

### Disbursement Success

_Screenshot placeholder — add success transaction result_

`![Disbursement Success](./screenshots/disburse-success.png)`

### Record Lookup

_Screenshot placeholder — add lookup result screenshot_

`![Record Lookup](./screenshots/lookup.png)`

### Duplicate Rejection

_Screenshot placeholder — add duplicate error screenshot_

`![Duplicate Error](./screenshots/duplicate-error.png)`

## Project Structure

```
pwd-assist-ph/
├── Cargo.toml                          # [workspace] root
├── README.md                           # This file (submission README)
├── LICENSE                             # MIT License
├── contracts/
│   └── pwd_assist/
│       ├── Cargo.toml                  # Contract crate
│       └── src/
│           └── lib.rs                  # Smart contract + 5 inline tests
└── frontend/
    ├── index.html                      # HTML entry with meta tags
    ├── package.json                    # Dependencies (Stellar SDK, Freighter, React)
    ├── vite.config.ts                  # Vite + React + globalThis polyfill
    ├── tsconfig.json                   # TypeScript config
    ├── tsconfig.node.json              # Node TypeScript config
    ├── .env.example                    # VITE_CONTRACT_ID + VITE_NETWORK
    └── src/
        ├── main.tsx                    # Buffer polyfill + React mount
        ├── App.tsx                     # MVP UI wired to contract
        ├── index.css                   # Design tokens (dark theme)
        ├── ui.css                      # Component styles (glassmorphism)
        ├── sorobanClient.ts            # simulate() + invokeWrite() + u32 ScVal
        ├── contractRuntime.ts          # getContractId() + IDE postMessage
        ├── wallet.ts                   # useWallet() + Freighter + IDE bridge
        └── previewActions.ts           # logAction(), ensureConnected()
```

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

## Team / Authors

- Built for the **Stellar Journey to Mastery: Monthly Builder Challenges (Level 3 — Brown Belt)**
- Targeting Filipino PWD communities, particularly in Quezon City, Manila, and Cebu

---

_Built with ❤️ for the Stellar community and the Philippine PWD advocacy movement._
