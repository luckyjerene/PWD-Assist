/**
 * App.tsx — PWD Assist PH Main Application Component
 *
 * MVP UI wired to the pwd_assist Soroban contract.
 * Implements the full Soroban IDE integration pattern:
 *
 * On load:
 *   → simulate("get_stats") to display dashboard totals
 *
 * Primary MVP buttons:
 *   [Disburse Assistance] → contract.disburse(agent, recipient_id, amount)
 *   [Look Up Record]      → simulate("get_record", recipient_id)
 *
 * Status states: idle | loading | error | ok | setup
 *
 * DEPLOY_HINT constant matches the contract path for IDE users.
 */

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useWallet, signTransactionXdr } from "./wallet";
import { useContractId } from "./contractRuntime";
import { simulate, invokeWrite, formatRpcError, DEPLOY_HINT } from "./sorobanClient";
import { logAction, ensureConnected, applyContractError } from "./previewActions";

// ── Types ──────────────────────────────────────────────────────────────────────

type AppStatus = "idle" | "loading" | "error" | "ok" | "setup";

interface Stats {
  total_disbursed: number;
  total_recipients: number;
}

interface DisbursementRecord {
  recipient_id: number;
  amount: number;
  timestamp: number;
  agent: string;
}

interface TxResult {
  success: boolean;
  hash?: string;
  error?: string;
  recipientId?: number;
  amount?: number;
}

// ── Main App Component ─────────────────────────────────────────────────────────

export default function App() {
  const wallet = useWallet();
  const contractId = useContractId();

  // Dashboard stats
  const [stats, setStats] = useState<Stats>({ total_disbursed: 0, total_recipients: 0 });
  const [status, setStatus] = useState<AppStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // Disburse form
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [disbursing, setDisbursing] = useState(false);
  const [txResult, setTxResult] = useState<TxResult | null>(null);

  // Lookup form
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState<DisbursementRecord | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // ── Load stats on mount / when wallet or contract changes ────────────────
  const loadStats = useCallback(async () => {
    if (!wallet.address || !contractId) {
      if (!contractId) {
        setStatus("setup");
        setStatusMessage(DEPLOY_HINT);
      }
      return;
    }

    try {
      logAction("Stats", "Loading disbursement statistics...");
      const result = await simulate("get_stats", wallet.address, [], contractId);
      // simulate returns a Map for struct values in SDK v15
      if (result instanceof Map) {
        setStats({
          total_disbursed: Number(result.get("total_disbursed") ?? 0),
          total_recipients: Number(result.get("total_recipients") ?? 0),
        });
      } else if (result && typeof result === "object") {
        setStats({
          total_disbursed: Number(result.total_disbursed ?? 0),
          total_recipients: Number(result.total_recipients ?? 0),
        });
      }
      setStatus("ok");
      logAction("Stats", `Loaded: ${stats.total_recipients} recipients, ${stats.total_disbursed} XLM`);
    } catch (err) {
      const msg = applyContractError(err);
      // Don't treat "no stats yet" as an error for fresh contracts
      if (msg.includes("not found") || msg.includes("MissingValue")) {
        setStats({ total_disbursed: 0, total_recipients: 0 });
        setStatus("ok");
      } else {
        setStatus("error");
        setStatusMessage(msg);
      }
    }
  }, [wallet.address, contractId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Disburse Handler ─────────────────────────────────────────────────────
  const handleDisburse = async (e: FormEvent) => {
    e.preventDefault();

    try {
      ensureConnected(wallet.address);
    } catch (err) {
      setTxResult({ success: false, error: applyContractError(err) });
      return;
    }

    const rid = parseInt(recipientId, 10);
    const amt = parseInt(amount, 10);

    if (isNaN(rid) || rid <= 0) {
      setTxResult({ success: false, error: "Recipient ID must be a positive number." });
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setTxResult({ success: false, error: "Amount must be a positive number." });
      return;
    }

    setDisbursing(true);
    setTxResult(null);

    try {
      logAction("Disburse", `Sending ${amt} XLM to PWD #${rid}...`);

      // invokeWrite: disburse(agent, recipient_id, amount)
      // agent = wallet.address (the disbursing agent)
      const hash = await invokeWrite(
        "disburse",
        wallet.address,
        signTransactionXdr,
        [wallet.address, rid, amt],
        contractId
      );

      logAction("Disburse", `✅ Success! TX: ${hash}`);
      setTxResult({ success: true, hash, recipientId: rid, amount: amt });

      // Clear form and refresh stats
      setRecipientId("");
      setAmount("");
      loadStats();
    } catch (err) {
      const msg = applyContractError(err);
      setTxResult({ success: false, error: formatRpcError(err) });
      logAction("Disburse", `❌ Failed: ${msg}`);
    } finally {
      setDisbursing(false);
    }
  };

  // ── Lookup Handler ───────────────────────────────────────────────────────
  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupError("");
    setLookupResult(null);

    if (!wallet.address) {
      setLookupError("Connect your wallet first.");
      return;
    }

    const lid = parseInt(lookupId, 10);
    if (isNaN(lid) || lid <= 0) {
      setLookupError("Enter a valid recipient ID number.");
      return;
    }

    setLookingUp(true);

    try {
      logAction("Lookup", `Searching for PWD #${lid}...`);

      const result = await simulate("get_record", wallet.address, [lid], contractId);

      let record: DisbursementRecord;
      if (result instanceof Map) {
        record = {
          recipient_id: Number(result.get("recipient_id") ?? 0),
          amount: Number(result.get("amount") ?? 0),
          timestamp: Number(result.get("timestamp") ?? 0),
          agent: String(result.get("agent") ?? ""),
        };
      } else {
        record = result as DisbursementRecord;
      }

      setLookupResult(record);
      logAction("Lookup", `Found: PWD #${record.recipient_id}, ${record.amount} XLM`);
    } catch (err) {
      const msg = applyContractError(err);
      setLookupError(formatRpcError(err));
      logAction("Lookup", `❌ ${msg}`);
    } finally {
      setLookingUp(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="header" id="main-header">
        <div className="header__inner">
          <div className="header__brand">
            <span className="header__logo">🏛️</span>
            <div>
              <div className="header__title">PWD Assist PH</div>
              <div className="header__subtitle">Soroban Disbursement Portal</div>
            </div>
          </div>

          <div className="header__actions">
            <div className="header__network-badge" id="network-badge">
              <span className="header__network-dot"></span>
              Stellar Testnet
            </div>

            {wallet.address ? (
              <>
                <div className="header__address" id="wallet-address-display">
                  <span>👤</span>
                  {truncateAddress(wallet.address)}
                </div>
                <button
                  className="btn btn--danger"
                  onClick={wallet.disconnect}
                  id="disconnect-wallet-btn"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="btn btn--primary"
                onClick={wallet.connect}
                disabled={wallet.connecting}
                id="connect-wallet-btn"
              >
                {wallet.connecting ? (
                  <>
                    <span className="btn__spinner"></span>
                    Connecting...
                  </>
                ) : (
                  "🔗 Connect Wallet"
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Status Banners ──────────────────────────────────────────── */}
      {status === "setup" && (
        <div className="status-banner status-banner--setup" id="setup-banner">
          ⚠️ {statusMessage}
        </div>
      )}

      {wallet.error && (
        <div className="status-banner status-banner--error">
          ⚠️ {wallet.error}
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────────── */}
      {!wallet.address ? (
        /* ── Landing Hero (disconnected) ─────────────────────────── */
        <section className="hero" id="landing-hero">
          <div className="hero__content">
            <div className="hero__badge">⚡ Powered by Soroban Smart Contracts</div>
            <div className="hero__icon">🏛️</div>
            <h1 className="hero__title">
              Government PWD Assistance Disbursement Portal
            </h1>
            <p className="hero__description">
              Empowering Filipino Persons with Disabilities through on-chain government
              cash assistance. Every disbursement is recorded immutably on the Stellar
              blockchain — no ghost beneficiaries, no political interference, no queues.
            </p>
            <button
              className="btn btn--primary btn--lg"
              onClick={wallet.connect}
              disabled={wallet.connecting}
              id="hero-connect-btn"
            >
              {wallet.connecting ? (
                <>
                  <span className="btn__spinner"></span>
                  Connecting Wallet...
                </>
              ) : (
                "🔗 Connect Freighter Wallet to Start"
              )}
            </button>

            <div className="hero__features">
              <div className="hero__feature">
                <div className="hero__feature-icon">📜</div>
                <div className="hero__feature-title">On-Chain Ledger</div>
                <div className="hero__feature-desc">
                  Every disbursement is recorded on-chain via Soroban smart contract — immutable and auditable.
                </div>
              </div>
              <div className="hero__feature">
                <div className="hero__feature-icon">🔒</div>
                <div className="hero__feature-title">Agent Authorization</div>
                <div className="hero__feature-desc">
                  Only authorized DSWD agents can disburse funds, enforced by require_auth().
                </div>
              </div>
              <div className="hero__feature">
                <div className="hero__feature-icon">♿</div>
                <div className="hero__feature-title">PWD-First Design</div>
                <div className="hero__feature-desc">
                  Eliminates the need for PWDs in Quezon City to travel to DSWD field offices.
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* ── Dashboard (connected) ───────────────────────────────── */
        <main className="dashboard" id="dashboard">
          {/* ── Stats Cards ────────────────────────────────────────── */}
          <div className="dashboard__stats" id="stats-section">
            <div className="stat-card">
              <div className="stat-card__value" id="stat-total-disbursed">
                {stats.total_disbursed.toLocaleString()}
                <span>XLM</span>
              </div>
              <div className="stat-card__label">Total Disbursed</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value" id="stat-total-recipients">
                {stats.total_recipients.toLocaleString()}
              </div>
              <div className="stat-card__label">Recipients Served</div>
            </div>
          </div>

          {/* ── Two-Column Grid ────────────────────────────────────── */}
          <div className="dashboard__grid">
            {/* ── Left: Disburse Form ──────────────────────────────── */}
            <div className="glass-card" id="disburse-card" style={{ animation: "fadeInUp 0.5s ease-out" }}>
              <div className="glass-card__header">
                <h2 className="glass-card__title">
                  <span className="glass-card__title-icon">📤</span>
                  Disburse Assistance
                </h2>
              </div>
              <div className="glass-card__body">
                <form className="send-form" onSubmit={handleDisburse}>
                  <div className="form-group">
                    <label className="form-group__label" htmlFor="recipient-id-input">
                      <span className="form-group__label-icon">♿</span>
                      PWD Recipient ID
                    </label>
                    <input
                      id="recipient-id-input"
                      type="number"
                      className="form-group__input"
                      placeholder="e.g. 1001 (PWD ID number)"
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      disabled={disbursing}
                      min="1"
                    />
                    <span className="form-group__hint">
                      Enter the PWD beneficiary&apos;s unique ID number
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-group__label" htmlFor="amount-input">
                      <span className="form-group__label-icon">💰</span>
                      Amount (XLM demo units)
                    </label>
                    <input
                      id="amount-input"
                      type="number"
                      className="form-group__input"
                      placeholder="e.g. 100"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={disbursing}
                      min="1"
                    />
                    <span className="form-group__hint">
                      Demo units — production would use USDC or PHP stablecoin
                    </span>
                  </div>

                  {/* Transaction Summary */}
                  {recipientId && amount && parseInt(amount) > 0 && (
                    <div className="send-form__summary" id="tx-summary">
                      <div className="send-form__summary-row">
                        <span className="send-form__summary-label">Recipient</span>
                        <span className="send-form__summary-value">PWD #{recipientId}</span>
                      </div>
                      <div className="send-form__summary-row">
                        <span className="send-form__summary-label">Amount</span>
                        <span className="send-form__summary-value">{amount} XLM</span>
                      </div>
                      <div className="send-form__summary-row">
                        <span className="send-form__summary-label">Memo</span>
                        <span className="send-form__summary-value">PWD-ASSIST</span>
                      </div>
                      <div className="send-form__summary-row">
                        <span className="send-form__summary-label">Contract</span>
                        <span className="send-form__summary-value" style={{ fontFamily: "'Courier New', monospace", fontSize: "0.7rem" }}>
                          {contractId ? `${contractId.slice(0, 8)}…${contractId.slice(-4)}` : "Not set"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="send-form__submit">
                    <button
                      type="submit"
                      className="btn btn--success btn--lg"
                      disabled={disbursing || !recipientId || !amount}
                      id="disburse-btn"
                    >
                      {disbursing ? (
                        <>
                          <span className="btn__spinner"></span>
                          Processing Disbursement...
                        </>
                      ) : (
                        "🚀 Disburse Assistance"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* ── Right: Lookup Record ─────────────────────────────── */}
            <div className="glass-card lookup" id="lookup-card">
              <div className="glass-card__header">
                <h2 className="glass-card__title">
                  <span className="glass-card__title-icon">🔍</span>
                  Look Up Disbursement
                </h2>
              </div>
              <div className="glass-card__body">
                <form className="lookup__form" onSubmit={handleLookup}>
                  <div className="form-group">
                    <input
                      id="lookup-id-input"
                      type="number"
                      className="form-group__input"
                      placeholder="PWD ID #"
                      value={lookupId}
                      onChange={(e) => setLookupId(e.target.value)}
                      disabled={lookingUp}
                      min="1"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={lookingUp || !lookupId}
                    id="lookup-btn"
                  >
                    {lookingUp ? (
                      <span className="btn__spinner"></span>
                    ) : (
                      "🔍 Search"
                    )}
                  </button>
                </form>

                {lookupError && (
                  <div className="tx-result__error-msg" style={{ marginBottom: "var(--space-4)" }}>
                    {lookupError}
                  </div>
                )}

                {lookupResult && (
                  <div className="lookup__result" id="lookup-result">
                    <div className="lookup__result-row">
                      <span className="lookup__result-label">Recipient ID</span>
                      <span className="lookup__result-value">PWD #{lookupResult.recipient_id}</span>
                    </div>
                    <div className="lookup__result-row">
                      <span className="lookup__result-label">Amount</span>
                      <span className="lookup__result-value">{lookupResult.amount} XLM</span>
                    </div>
                    <div className="lookup__result-row">
                      <span className="lookup__result-label">Timestamp</span>
                      <span className="lookup__result-value">
                        {lookupResult.timestamp > 0
                          ? new Date(lookupResult.timestamp * 1000).toLocaleString()
                          : "Ledger timestamp"}
                      </span>
                    </div>
                    <div className="lookup__result-row">
                      <span className="lookup__result-label">Agent</span>
                      <span className="lookup__result-value" style={{ fontFamily: "'Courier New', monospace", fontSize: "0.7rem" }}>
                        {typeof lookupResult.agent === "string" && lookupResult.agent.length > 10
                          ? `${lookupResult.agent.slice(0, 8)}…${lookupResult.agent.slice(-4)}`
                          : String(lookupResult.agent)}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "var(--space-6)" }}>
                  <p className="form-group__hint">
                    Enter a PWD recipient ID to verify their disbursement record on-chain.
                    This reads directly from the Soroban smart contract (free, no gas).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Transaction Result ──────────────────────────────────── */}
          {txResult && (
            <div className="tx-result" id="transaction-result">
              <div className={`tx-result__card tx-result__card--${txResult.success ? "success" : "error"}`}>
                <div className="tx-result__header">
                  <span className="tx-result__icon">
                    {txResult.success ? "✅" : "❌"}
                  </span>
                  <span className={`tx-result__title tx-result__title--${txResult.success ? "success" : "error"}`}>
                    {txResult.success ? "Assistance Disbursed Successfully!" : "Disbursement Failed"}
                  </span>
                </div>

                <div className="tx-result__details">
                  {txResult.success ? (
                    <>
                      {txResult.recipientId && (
                        <div className="tx-result__row">
                          <span className="tx-result__row-label">Recipient</span>
                          <span className="tx-result__row-value">PWD #{txResult.recipientId}</span>
                        </div>
                      )}
                      {txResult.amount && (
                        <div className="tx-result__row">
                          <span className="tx-result__row-label">Amount</span>
                          <span className="tx-result__row-value">{txResult.amount} XLM</span>
                        </div>
                      )}
                      {txResult.hash && (
                        <div className="tx-result__row">
                          <span className="tx-result__row-label">Transaction Hash</span>
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${txResult.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tx-result__hash-link"
                            id="tx-hash-link"
                          >
                            {txResult.hash}
                            <span>↗</span>
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="tx-result__error-msg">
                      {txResult.error || "An unknown error occurred."}
                    </div>
                  )}
                </div>

                <div className="tx-result__dismiss">
                  <button
                    className="btn btn--ghost"
                    onClick={() => setTxResult(null)}
                    id="dismiss-result-btn"
                  >
                    {txResult.success ? "✨ Disburse Another" : "↩ Try Again"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="footer" id="app-footer">
        <p className="footer__text">
          🏛️ PWD Assist PH &middot; Built on{" "}
          <a href="https://stellar.org" target="_blank" rel="noopener noreferrer">
            Stellar
          </a>{" "}
          Testnet with Soroban &middot; Stellar Journey to Mastery — Level 3
        </p>
      </footer>
    </>
  );
}
