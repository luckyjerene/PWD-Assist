/**
 * analytics.ts — Google Analytics 4 Integration
 *
 * Lightweight GA4 integration for tracking user interactions
 * with the PWD Assist PH dApp. Tracks page views, wallet connections,
 * disbursements, and lookup events.
 *
 * Set VITE_GA_MEASUREMENT_ID in .env to enable.
 */

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';

/** Whether analytics is enabled (GA ID is configured) */
export const isAnalyticsEnabled = (): boolean => !!GA_ID;

/**
 * Injects the GA4 gtag.js script into the page.
 * Called once on app initialization.
 */
export function initAnalytics(): void {
  if (!GA_ID) {
    console.log('%c📊 Analytics disabled (no VITE_GA_MEASUREMENT_ID)', 'color: #64748b;');
    return;
  }

  // Load gtag.js
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  // Initialize gtag
  (window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(...args: any[]) {
    (window as any).dataLayer.push(args);
  }
  (window as any).gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID, {
    send_page_view: true,
  });

  console.log('%c📊 Analytics initialized', 'color: #10b981; font-weight: 600;');
}

/**
 * Tracks a custom event in GA4.
 *
 * @param eventName - The event name (e.g. 'wallet_connected')
 * @param params - Additional event parameters
 */
export function trackEvent(eventName: string, params?: Record<string, any>): void {
  if (!GA_ID || typeof (window as any).gtag !== 'function') return;
  (window as any).gtag('event', eventName, params);
}

// ── Pre-defined Event Trackers ─────────────────────────────────────────────────

export const trackWalletConnected = (address: string) =>
  trackEvent('wallet_connected', { wallet_address: address.slice(0, 8) + '...' });

export const trackWalletDisconnected = () =>
  trackEvent('wallet_disconnected');

export const trackDisbursementSubmitted = (recipientId: number, amount: number) =>
  trackEvent('disbursement_submitted', { recipient_id: recipientId, amount });

export const trackDisbursementSuccess = (recipientId: number, amount: number, txHash: string) =>
  trackEvent('disbursement_success', { recipient_id: recipientId, amount, tx_hash: txHash.slice(0, 16) });

export const trackDisbursementFailed = (recipientId: number, error: string) =>
  trackEvent('disbursement_failed', { recipient_id: recipientId, error: error.slice(0, 100) });

export const trackRecordLookup = (recipientId: number, found: boolean) =>
  trackEvent('record_lookup', { recipient_id: recipientId, found });

export const trackFeedbackSubmitted = (rating: number) =>
  trackEvent('feedback_submitted', { rating });
