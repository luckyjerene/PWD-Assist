import React, { useState, useEffect, useCallback, MouseEvent, FormEvent } from "react";
import { useWallet, signTransactionXdr } from "./wallet";
import { useContractId } from "./contractRuntime";
import { simulate, invokeWrite, formatRpcError, DEPLOY_HINT } from "./sorobanClient";

// ── Types ────────────────────────────────────────────────────────
type Role = "beneficiary" | "agent";
type Tab = "vault" | "services" | "history";
type DisburseState = "AVAILABLE" | "DISBURSED" | "IN_ESCROW" | "UNKNOWN" | "LOADING";

interface Provider {
  id: string;
  name: string;
  service: string;
  cost: number;
}

const MOCK_PROVIDERS: Provider[] = [
  { id: "P-101", name: "PhilHealth Connect", service: "Medical Premium", cost: 50 },
  { id: "P-102", name: "Grab Accessibility", service: "Transport Voucher", cost: 25 },
];

const MOCK_HISTORY = [
  { date: "2026-08-30", type: "Idempotent Lock", hash: "4f8a...9c21", status: "Success" },
  { date: "2026-08-28", type: "Agent Auth", hash: "1d2b...5e78", status: "Success" },
];

// ── App Component ────────────────────────────────────────────────
export default function App() {
  const wallet = useWallet();
  const contractId = useContractId();

  // State
  const [role, setRole] = useState<Role>("beneficiary");
  const [activeTab, setActiveTab] = useState<Tab>("vault");
  const [recipientId, setRecipientId] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [vaultState, setVaultState] = useState<DisburseState>("UNKNOWN");
  const [loadingState, setLoadingState] = useState(false);
  
  const [agentAmount, setAgentAmount] = useState("");
  const [processingTx, setProcessingTx] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; hash?: string }[]>([]);

  // Telemetry (mock for GA4)
  const track = (event: string, data: any) => console.log(`[GA4] ${event}`, data);

  // Ripple Effect Generator
  const createRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - btn.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${e.clientY - btn.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");
    const existing = btn.querySelector(".ripple");
    if (existing) existing.remove();
    btn.appendChild(circle);
  };

  const showToast = (msg: string, hash?: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, hash }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 6000);
  };

  const checkState = async (id: number) => {
    if (!wallet.address || !contractId) return;
    setLoadingState(true);
    try {
      // simulate get_record
      const result = await simulate("get_record", wallet.address, [id], contractId);
      if (result) {
        setVaultState("DISBURSED");
      } else {
        setVaultState("AVAILABLE");
      }
      track("state_checked", { id });
    } catch (err: any) {
      if (err.message?.includes("MissingValue") || err.message?.includes("not found")) {
        setVaultState("AVAILABLE");
      } else {
        setVaultState("UNKNOWN");
      }
    } finally {
      setLoadingState(false);
    }
  };

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const id = parseInt(recipientId);
    if (!isNaN(id) && id > 0) {
      checkState(id);
    }
  };

  const handleDisburse = async (e: FormEvent) => {
    e.preventDefault();
    if (!wallet.address || !contractId) return;
    
    const rid = parseInt(recipientId);
    const amt = parseInt(agentAmount);
    if (isNaN(rid) || isNaN(amt)) return;

    setProcessingTx(true);
    try {
      const hash = await invokeWrite(
        "disburse",
        wallet.address,
        signTransactionXdr,
        [wallet.address, rid, amt],
        contractId
      );
      showToast("⛓️ Ledger Confirmed: Disbursement Locked", hash);
      track("disburse_success", { rid, amt, hash });
      checkState(rid);
    } catch (err: any) {
      showToast(`❌ Tx Failed: ${formatRpcError(err)}`);
    } finally {
      setProcessingTx(false);
    }
  };

  const copyHash = (hash: string, e: MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(hash);
    const target = e.currentTarget as HTMLElement;
    const old = target.innerText;
    target.innerText = "✅ Copied!";
    setTimeout(() => (target.innerText = old), 2000);
  };

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          <h1 className="brand-title">PWD Assist Protocol</h1>
          <div className="network-badge" aria-label="Connected to Stellar Testnet">
            <div className="status-dot"></div>
            🧪 STELLAR TESTNET
          </div>
        </div>
        
        <div className="role-switcher" role="group" aria-label="Role Switcher">
          <button 
            className="role-btn" 
            aria-pressed={role === "beneficiary"}
            onClick={() => setRole("beneficiary")}
          >Beneficiary</button>
          <button 
            className="role-btn" 
            aria-pressed={role === "agent"}
            onClick={() => setRole("agent")}
          >DSWD Agent</button>
        </div>
      </header>

      <main className="main-container">
        {/* LEFT COLUMN */}
        <div>
          <div className="tabs" role="tablist">
            <button className="tab-btn" aria-selected={activeTab === "vault"} onClick={() => setActiveTab("vault")} role="tab">Vault Dashboard</button>
            <button className="tab-btn" aria-selected={activeTab === "services"} onClick={() => setActiveTab("services")} role="tab">Escrow Services</button>
            <button className="tab-btn" aria-selected={activeTab === "history"} onClick={() => setActiveTab("history")} role="tab">Audit History</button>
          </div>

          {activeTab === "vault" && (
            <div className="card" role="tabpanel">
              <div className="card-header">
                <h2 className="card-title">State Verification</h2>
              </div>
              
              <form onSubmit={handleLookup} className="form-group">
                <label className="form-label" htmlFor="pwd-id">Beneficiary ID (Numeric)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      id="pwd-id"
                      type={revealed ? "number" : "password"}
                      className="form-input" 
                      value={recipientId}
                      onChange={e => setRecipientId(e.target.value)}
                      placeholder="e.g. 1042"
                      required
                      aria-required="true"
                    />
                    <button 
                      type="button" 
                      onClick={() => setRevealed(!revealed)}
                      aria-label={revealed ? "Hide ID" : "Reveal ID"}
                      style={{ position: 'absolute', right: '12px', top: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {revealed ? "👁️‍🗨️" : "👁️"}
                    </button>
                  </div>
                  <button type="submit" className="btn btn-primary" onClick={createRipple}>
                    Query State
                  </button>
                </div>
              </form>

              {loadingState ? (
                <div className="skeleton" style={{ height: '100px', width: '100%', marginTop: '24px' }} aria-busy="true" aria-label="Loading ledger state"></div>
              ) : (
                vaultState !== "UNKNOWN" && (
                  <div className={`state-banner ${vaultState.toLowerCase()}`} role="alert" aria-live="polite">
                    <div className="state-icon">
                      {vaultState === "AVAILABLE" ? "🔓" : vaultState === "DISBURSED" ? "🔒" : "⏳"}
                    </div>
                    <div className="state-info">
                      <h2>{vaultState}</h2>
                      <p>
                        {vaultState === "AVAILABLE" && "Tokens are ready to be claimed or locked."}
                        {vaultState === "DISBURSED" && "Idempotent lock active. Funds already disbursed."}
                        {vaultState === "IN_ESCROW" && "Tokens locked for service provider fulfillment."}
                      </p>
                    </div>
                  </div>
                )
              )}

              {/* AGENT MODE ADMIN PANEL */}
              {role === "agent" && vaultState === "AVAILABLE" && (
                <div style={{ marginTop: '32px', borderTop: '2px solid #E5E7EB', paddingTop: '24px' }}>
                  <h3 style={{ marginBottom: '16px', color: 'var(--gov-blue)' }}>🔐 Authorized Agent Action</h3>
                  <form onSubmit={handleDisburse}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="agent-amount">Disbursement Amount (XLM)</label>
                      <input 
                        id="agent-amount"
                        type="number"
                        className="form-input"
                        value={agentAmount}
                        onChange={e => setAgentAmount(e.target.value)}
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="btn btn-secondary" 
                      style={{ width: '100%' }}
                      disabled={processingTx || !wallet.address}
                      onClick={createRipple}
                    >
                      {processingTx ? "Executing require_auth()..." : "Trigger Disbursement"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeTab === "services" && (
            <div className="card" role="tabpanel">
              <div className="card-header">
                <h2 className="card-title">Escrow Marketplace Subgraph</h2>
              </div>
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>Select a registered provider to cryptographically lock tokens for their service.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {MOCK_PROVIDERS.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <div>
                      <h3 style={{ fontWeight: 600 }}>{p.name}</h3>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.service}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span className="mono" style={{ fontWeight: 700, color: 'var(--status-available)' }}>{p.cost} XLM</span>
                      <button className="btn btn-ghost" onClick={createRipple}>Lock Tokens</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="card" role="tabpanel">
              <div className="card-header">
                <h2 className="card-title">Simulation Audit Trail</h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Transaction Hash</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_HISTORY.map((row, i) => (
                    <tr key={i}>
                      <td>{row.date}</td>
                      <td>{row.type}</td>
                      <td>
                        <button className="chip" onClick={(e) => copyHash(row.hash, e)} aria-label="Copy Hash">
                          {row.hash} 📋
                        </button>
                      </td>
                      <td style={{ color: 'var(--status-available)', fontWeight: 600 }}>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>🛡️ Threat Model Active</h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--status-available)' }}>✅</span> Replay Attack Protected
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--status-available)' }}>✅</span> Idempotent State Active
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--status-available)' }}>✅</span> require_auth() Enforced
              </li>
            </ul>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>Network Connection</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wallet</div>
                {wallet.address ? (
                  <button className="chip" onClick={e => copyHash(wallet.address!, e)}>{wallet.address.slice(0, 8)}...{wallet.address.slice(-4)}</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => { wallet.connect(); track("wallet_connect", {}); }} style={{ width: '100%' }}>Connect Wallet</button>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contract ID</div>
                <button className="chip" onClick={e => copyHash(contractId || "", e)}>{contractId ? `${contractId.slice(0, 8)}...` : "Not Configured"}</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="toast-container" aria-live="assertive">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <div style={{ fontSize: '1.25rem' }}>⛓️</div>
            <div>
              <div style={{ fontWeight: 600 }}>{t.msg}</div>
              {t.hash && (
                <a 
                  href={`https://stellar.expert/explorer/testnet/tx/${t.hash}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="toast-hash"
                  aria-label="View on Stellar Explorer"
                >
                  {t.hash} ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
