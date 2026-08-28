/**
 * previewActions.ts — IDE Preview Activity Console Helpers
 *
 * These functions log user actions, errors, and status messages
 * to the Soroban IDE Preview panel's activity console.
 *
 * In standalone mode (local dev server), they fall back to console.log.
 */

import { DEPLOY_HINT } from "./sorobanClient";

/**
 * Logs an action message to the IDE Preview activity console.
 * Shows as an info-level message in the IDE.
 *
 * @param action - Short label (e.g. "Disburse", "Lookup")
 * @param detail - Additional detail string
 */
export function logAction(action: string, detail?: string): void {
  const msg = detail ? `[${action}] ${detail}` : `[${action}]`;
  console.log(`%c📋 ${msg}`, "color: #818cf8; font-weight: 600;");

  // Post to IDE Preview panel if available
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage(
      {
        source: "soroban-preview",
        type: "soroban:log",
        level: "info",
        message: msg,
      },
      "*"
    );
  }
}

/**
 * Validates that the wallet is connected before proceeding.
 * Throws a user-friendly error if not connected.
 *
 * @param address - The wallet address to check
 * @throws Error if address is falsy
 */
export function ensureConnected(address: string | null): asserts address is string {
  if (!address) {
    throw new Error(
      "Wallet not connected. Click 'Connect Wallet' in the header to link your Freighter wallet."
    );
  }
}

/**
 * Transforms a raw contract/RPC error into a user-friendly message
 * and logs it to the Preview console.
 *
 * @param err - The caught error
 * @returns A clean error message string
 */
export function applyContractError(err: unknown): string {
  let msg: string;

  if (err instanceof Error) {
    msg = err.message;

    // Map known contract error codes to friendly messages
    if (msg.includes("#1")) {
      msg = "Invalid amount: the disbursement amount must be greater than zero.";
    } else if (msg.includes("#2")) {
      msg = "Duplicate disbursement: this recipient has already received assistance.";
    } else if (msg.includes("#3")) {
      msg = "Not found: no disbursement record exists for this recipient ID.";
    } else if (msg.includes("No contract ID")) {
      msg = `Contract not deployed. ${DEPLOY_HINT}`;
    } else if (msg.includes("Account not found")) {
      msg = "Wallet account not found on testnet. Fund it via Stellar Friendbot.";
    }
  } else {
    msg = String(err);
  }

  console.error(`%c❌ ${msg}`, "color: #ef4444; font-weight: 600;");

  // Post error to IDE Preview panel
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage(
      {
        source: "soroban-preview",
        type: "soroban:log",
        level: "error",
        message: msg,
      },
      "*"
    );
  }

  return msg;
}
