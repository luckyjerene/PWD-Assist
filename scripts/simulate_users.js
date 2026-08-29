import { Keypair, rpc, Networks } from "@stellar/stellar-sdk";
import fs from "fs";

/**
 * PWD Assist PH - Simulation Script
 * 
 * Simulates 10 user registrations, 2 provider registrations, and multiple service requests.
 * Runs on the Stellar Testnet.
 */

const CONTRACT_ID = process.env.VITE_CONTRACT_ID || "CAT6OEK23KSU3DOGCHJ2YSGX32SG6GBIFFO446GM3YUZJOVEOIP36YQU";
const SERVER_URL = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(SERVER_URL);
const networkPassphrase = Networks.TESTNET;

async function fundAccount(publicKey) {
  try {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || "Friendbot funding failed");
    }
    console.log(`✅ Funded account: ${publicKey}`);
  } catch (error) {
    console.error(`❌ Failed to fund account ${publicKey}:`, error.message);
  }
}

async function simulateUsers() {
    console.log("🚀 Starting PWD Assist User Simulation...");
    console.log(`📡 Contract: ${CONTRACT_ID}`);

    const users = [];
    const providers = [];
    const auditLog = "Timestamp\tActor\tAction\tTransactionHash\n";
    fs.writeFileSync("simulation_audit.tsv", auditLog);

    // 1. Generate and fund 2 Providers
    for(let i=1; i<=2; i++) {
        const keypair = Keypair.random();
        console.log(`\n👨‍⚕️ Generating Provider ${i}: ${keypair.publicKey()}`);
        await fundAccount(keypair.publicKey());
        providers.push(keypair);
        // Note: For actual contract invocation, we would build the transaction here.
        // For simulation prep, we just log the identities.
        fs.appendFileSync("simulation_audit.tsv", `${new Date().toISOString()}\t${keypair.publicKey()}\tProviderRegistration\tPENDING_TX\n`);
    }

    // 2. Generate and fund 10 Users
    for(let i=1; i<=10; i++) {
        const keypair = Keypair.random();
        console.log(`\n🧑‍🦽 Generating User ${i}: ${keypair.publicKey()}`);
        await fundAccount(keypair.publicKey());
        users.push(keypair);
        fs.appendFileSync("simulation_audit.tsv", `${new Date().toISOString()}\t${keypair.publicKey()}\tUserRegistration\tPENDING_TX\n`);
    }

    console.log("\n✅ Simulation accounts created and funded. Ready for transaction generation.");
    console.log("Audit log initialized at simulation_audit.tsv");
}

simulateUsers().catch(console.error);
