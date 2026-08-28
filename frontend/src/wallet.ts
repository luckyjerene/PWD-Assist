/**
 * wallet.ts — Freighter Wallet + IDE Wallet Bridge
 *
 * Provides a React hook `useWallet()` that resolves the user's
 * Stellar address from the best available source:
 * 1. Soroban IDE postMessage injection ({ type: "soroban:wallet" })
 * 2. VITE_WALLET_ADDRESS environment variable
 * 3. Freighter browser extension (interactive connection)
 *
 * Also exports a `signTransaction` wrapper that routes signing
 * through Freighter.
 */

import { useState, useEffect, useCallback } from "react";
import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";

// ── IDE Wallet Bridge ──────────────────────────────────────────────────────────

let _ideWalletAddress: string | null = null;
const _walletListeners: Array<(addr: string) => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (
      data &&
      data.source === "soroban-ide" &&
      data.type === "soroban:wallet" &&
      typeof data.address === "string"
    ) {
      _ideWalletAddress = data.address;
      _walletListeners.forEach((fn) => fn(data.address));
    }
  });
}

// ── Freighter Helpers ──────────────────────────────────────────────────────────

/**
 * Checks if the Freighter extension is installed and accessible.
 */
async function checkFreighter(): Promise<boolean> {
  try {
    const result = await isConnected();
    return !result.error && result.isConnected;
  } catch {
    return false;
  }
}

/**
 * Signs a transaction XDR via Freighter.
 * This pops up the Freighter extension for user approval.
 *
 * @param xdr - The unsigned transaction XDR (base64)
 * @returns The signed transaction XDR
 */
export async function signTransactionXdr(xdr: string): Promise<string> {
  const result = await freighterSign(xdr, {
    networkPassphrase: "Test SDF Network ; September 2015",
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.signedTxXdr;
}

// ── React Hook ─────────────────────────────────────────────────────────────────

interface WalletState {
  /** The connected wallet's Stellar public key, or null */
  address: string | null;
  /** Whether a connection attempt is in progress */
  connecting: boolean;
  /** Whether Freighter is detected in the browser */
  freighterAvailable: boolean;
  /** Error message from the last connection attempt */
  error: string | null;
  /** Connect the wallet (triggers Freighter popup) */
  connect: () => Promise<void>;
  /** Disconnect the wallet (clears local state) */
  disconnect: () => void;
}

/**
 * React hook for wallet connection management.
 *
 * Resolves address from:
 * 1. IDE postMessage (soroban:wallet)
 * 2. VITE_WALLET_ADDRESS env var
 * 3. Freighter interactive connection
 */
export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(
    _ideWalletAddress || import.meta.env.VITE_WALLET_ADDRESS || null
  );
  const [connecting, setConnecting] = useState(false);
  const [freighterAvailable, setFreighterAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for IDE wallet injection
  useEffect(() => {
    const handler = (addr: string) => setAddress(addr);
    _walletListeners.push(handler);

    // Check Freighter availability after a short delay
    const timer = setTimeout(async () => {
      const available = await checkFreighter();
      setFreighterAvailable(available);
    }, 500);

    return () => {
      clearTimeout(timer);
      const idx = _walletListeners.indexOf(handler);
      if (idx >= 0) _walletListeners.splice(idx, 1);
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const accessResult = await requestAccess();
      if (accessResult.error) throw new Error(accessResult.error);
      const addrResult = await getAddress();
      if (addrResult.error) throw new Error(addrResult.error);
      setAddress(addrResult.address);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  return {
    address,
    connecting,
    freighterAvailable,
    error,
    connect,
    disconnect,
  };
}
