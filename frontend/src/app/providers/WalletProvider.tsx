import React, { createContext, useContext, useEffect, useState } from 'react';
import { StellarWalletsKit, WalletNetwork, allowAllModules, freighter } from '@creit.tech/stellar-wallets-kit';

interface WalletContextState {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  error: Error | null;
}

const WalletContext = createContext<WalletContextState | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);

  useEffect(() => {
    const initKit = new StellarWalletsKit({
      network: (import.meta.env.VITE_NETWORK_PASSPHRASE as WalletNetwork) || WalletNetwork.TESTNET,
      selectedWalletId: freighter().id,
      modules: allowAllModules(),
    });
    setKit(initKit);
  }, []);

  const connect = async () => {
    if (!kit) return;
    setIsConnecting(true);
    setError(null);
    try {
      await kit.openModal({
        onWalletSelected: async (option) => {
          kit.setWallet(option.id);
          const { address } = await kit.getAddress();
          setAddress(address);
        }
      });
    } catch (err: any) {
      setError(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
  };

  return (
    <WalletContext.Provider value={{ address, connect, disconnect, isConnecting, error }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
