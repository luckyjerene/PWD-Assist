/**
 * contractRuntime.ts — Contract ID Management + IDE Preview Bridge
 *
 * Handles how the contract ID is resolved at runtime:
 * 1. From VITE_CONTRACT_ID environment variable (.env file)
 * 2. From Soroban IDE postMessage injection (Deploy → Save to .env)
 *
 * In Soroban IDE, the Deploy panel can inject the contract ID directly
 * into the Preview panel via postMessage. This file listens for those
 * messages and updates the contract ID in real time.
 */

import { useState, useEffect } from "react";

// Module-level state: holds the injected contract ID from IDE
let _injectedContractId: string | null = null;
const _listeners: Array<(id: string) => void> = [];

/**
 * Listens for Soroban IDE postMessage events that inject the contract ID.
 * Message format: { source: "soroban-ide", type: "soroban:contract", contractId: "C…" }
 */
function initIdeListener() {
  if (typeof window === "undefined") return;

  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (
      data &&
      data.source === "soroban-ide" &&
      data.type === "soroban:contract" &&
      typeof data.contractId === "string"
    ) {
      _injectedContractId = data.contractId;
      // Notify all React hooks listening for contract ID changes
      _listeners.forEach((fn) => fn(data.contractId));
    }
  });
}

// Initialize the listener on module load
initIdeListener();

/**
 * Returns the current contract ID from the best available source:
 * 1. IDE-injected value (postMessage)
 * 2. VITE_CONTRACT_ID from .env
 *
 * @returns The contract ID string, or empty string if not configured
 */
export function getContractId(): string {
  if (_injectedContractId) return _injectedContractId;
  return import.meta.env.VITE_CONTRACT_ID || "";
}

/**
 * React hook that provides the current contract ID and updates
 * reactively when the IDE injects a new one via postMessage.
 *
 * @returns The current contract ID string
 */
export function useContractId(): string {
  const [contractId, setContractId] = useState<string>(getContractId());

  useEffect(() => {
    // Subscribe to IDE postMessage updates
    const handler = (id: string) => setContractId(id);
    _listeners.push(handler);

    return () => {
      const idx = _listeners.indexOf(handler);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }, []);

  return contractId;
}
