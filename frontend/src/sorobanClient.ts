/**
 * sorobanClient.ts — Soroban RPC Bridge
 *
 * Handles all communication with the Soroban smart contract via RPC:
 * - simulate(method, source, args): Free read-only calls via simulation
 * - invokeWrite(method, source, signXDR, args): State-changing calls
 *   that build → simulate → sign via Freighter → submit → poll
 *
 * Key design decisions:
 * - Uses u32 ScVal encoding (not u64) because the contract uses u32 params
 *   and SDK v15 defaults to i128 which traps the Soroban VM
 * - DEPLOY_HINT names the contract crate explicitly for IDE users
 * - requireContract() rejects wallet IDs (G…) mistaken for contract IDs (C…)
 */

import * as sdk from "@stellar/stellar-sdk";

// ── Testnet Configuration ──────────────────────────────────────────────────────
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = sdk.Networks.TESTNET;

/** Shown in console when contract ID is missing — guides IDE users */
export const DEPLOY_HINT =
  'Deploy contracts/pwd_assist in the Soroban IDE Deploy panel, then paste the Contract ID into .env or use "Save to .env".';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validates that a contract ID is present and correctly formatted.
 * Rejects empty strings and wallet addresses (G…) mistaken for contract IDs (C…).
 */
export function requireContract(contractId: string | undefined): string {
  if (!contractId || contractId.trim() === "") {
    throw new Error(`No contract ID configured. ${DEPLOY_HINT}`);
  }
  const id = contractId.trim();
  if (id.startsWith("G")) {
    throw new Error(
      `"${id.slice(0, 8)}…" looks like a wallet address (G…), not a contract ID (C…). ${DEPLOY_HINT}`
    );
  }
  return id;
}

/**
 * Converts JavaScript values to Soroban ScVal types.
 * IMPORTANT: Uses nativeToScVal with { type: "u32" } for numbers because
 * the contract declares u32 parameters. SDK v15 defaults to i128 which
 * causes VM traps.
 */
export function argsToScVals(args: any[]): sdk.xdr.ScVal[] {
  return args.map((arg) => {
    if (typeof arg === "number") {
      return sdk.nativeToScVal(arg, { type: "u32" });
    }
    if (typeof arg === "string") {
      // If it looks like a Stellar address, encode as Address
      if (arg.length === 56 && (arg.startsWith("G") || arg.startsWith("C"))) {
        return new sdk.Address(arg).toScVal();
      }
      return sdk.nativeToScVal(arg, { type: "symbol" });
    }
    return sdk.nativeToScVal(arg);
  });
}

/**
 * Extracts a user-friendly error message from Soroban RPC errors.
 */
export function formatRpcError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("HostError")) return "Contract execution error (VM trap). Check your arguments.";
    if (msg.includes("MissingValue")) return "Contract function not found. Is the correct WASM deployed?";
    if (msg.includes("ExistingValue")) return "Duplicate entry — this recipient already received a disbursement.";
    if (msg.includes("#1")) return "Invalid amount: must be greater than zero.";
    if (msg.includes("#2")) return "This recipient has already received a disbursement.";
    if (msg.includes("#3")) return "No disbursement record found for this recipient ID.";
    return msg;
  }
  return String(err);
}

// ── Core RPC Functions ─────────────────────────────────────────────────────────

/**
 * Simulates a read-only contract call (free, no gas).
 * Used for `get_stats` and `get_record` which don't modify state.
 *
 * @param method - Contract function name (e.g. "get_stats")
 * @param source - Caller's Stellar public key (for simulation context)
 * @param args   - Arguments to pass to the contract function
 * @param contractId - The deployed contract ID (C…)
 * @returns The decoded return value from the simulation
 */
export async function simulate(
  method: string,
  source: string,
  args: any[] = [],
  contractId?: string
): Promise<any> {
  const id = requireContract(contractId);
  const server = new sdk.SorobanRpc.Server(RPC_URL);
  const account = await server.getAccount(source);

  const contract = new sdk.Contract(id);
  const tx = new sdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...argsToScVals(args)))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (sdk.SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(
      (simResult as any).error || "Simulation failed"
    );
  }

  // Extract return value from successful simulation
  const successResult = simResult as sdk.SorobanRpc.Api.SimulateTransactionSuccessResponse;
  if (successResult.result) {
    return sdk.scValToNative(successResult.result.retval);
  }

  return null;
}

/**
 * Invokes a state-changing contract function:
 * 1. Build transaction with the contract call
 * 2. Simulate to get the footprint and authorization
 * 3. Sign via Freighter (signXDR callback)
 * 4. Submit to the Soroban RPC
 * 5. Poll until the transaction is confirmed
 *
 * @param method  - Contract function name (e.g. "disburse")
 * @param source  - Caller's Stellar public key
 * @param signXDR - Freighter's signTransaction function
 * @param args    - Arguments to pass to the contract function
 * @param contractId - The deployed contract ID (C…)
 * @returns The transaction hash on success
 */
export async function invokeWrite(
  method: string,
  source: string,
  signXDR: (xdr: string) => Promise<string>,
  args: any[] = [],
  contractId?: string
): Promise<string> {
  const id = requireContract(contractId);
  const server = new sdk.SorobanRpc.Server(RPC_URL);
  const account = await server.getAccount(source);

  const contract = new sdk.Contract(id);
  const tx = new sdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...argsToScVals(args)))
    .setTimeout(60)
    .build();

  // Simulate to prepare the transaction (get footprint, auth)
  const simResult = await server.simulateTransaction(tx);

  if (sdk.SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(
      (simResult as any).error || "Simulation failed"
    );
  }

  // Assemble the transaction with simulation results
  const preparedTx = sdk.SorobanRpc.assembleTransaction(
    tx,
    simResult as sdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();

  // Sign via Freighter
  const signedXdr = await signXDR(preparedTx.toXDR());

  // Reconstruct the signed transaction
  const signedTx = sdk.TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE
  );

  // Submit
  const sendResult = await server.sendTransaction(signedTx);

  if (sendResult.status === "ERROR") {
    throw new Error("Transaction submission rejected by RPC");
  }

  // Poll for confirmation
  const hash = sendResult.hash;
  let getResult: sdk.SorobanRpc.Api.GetTransactionResponse;
  let attempts = 0;
  const maxAttempts = 30;

  do {
    await new Promise((r) => setTimeout(r, 1000));
    getResult = await server.getTransaction(hash);
    attempts++;
  } while (
    getResult.status === sdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    attempts < maxAttempts
  );

  if (getResult.status === sdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    return hash;
  }

  throw new Error(
    `Transaction ${hash} failed with status: ${getResult.status}`
  );
}
