import { encodeDirectCheckout } from './shop-checkout-form.mjs';
import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

/** Internal transport, not mounted on public pages. Keeps PII only in memory.
 * Any ambiguous outcome locks the accepted payload: retry exactly, never create a new key.
 * A 2xx response acknowledges order submission only, NOT payment.
 */
export function createCheckoutSubmission({ endpoint, origin, fetchImpl = globalThis.fetch, keyFactory = () => globalThis.crypto.randomUUID(), recoveryJournal, sessionSignal, requestTimeoutMs = 30000 } = {}) {
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 120000) throw new Error('invalid_checkout_timeout');
  validateSessionSignal(sessionSignal);
  // Optional internal integration, not authorization to begin a new checkout.
  // Explicit null/invalid adapters must never silently fall back to memory only.
  if (recoveryJournal !== undefined && (!recoveryJournal || typeof recoveryJournal.remember !== 'function')) throw new Error('invalid_recovery_journal');
  const base = new URL(origin);
  const url = new URL(endpoint, base);
  if (base.protocol !== 'https:' || url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.hash || url.search || typeof endpoint !== 'string' || !endpoint || typeof fetchImpl !== 'function') throw new Error('invalid_checkout_endpoint');
  let state = 'idle';
  let accepted = null;
  let disposed = false;
  let reference = null;
  let cancelRequest = null;
  const snapshot = () => ({ state, canRetry: state === 'uncertain', canEdit: state === 'idle', reference });
  let unbind = () => {};
  const client = {
    snapshot,
    async submit(items, catalog, options) {
      if (disposed) throw new Error('checkout_disposed');
      if (state === 'sending') throw new Error('checkout_in_progress');
      if (state === 'submitted') throw new Error('checkout_already_submitted');
      const key = accepted?.key ?? keyFactory();
      const body = encodeDirectCheckout(items, catalog, { ...options, key });
      if (accepted && body !== accepted.body) throw new Error('checkout_outcome_unknown_retry_original');
      accepted = { key, body };
      state = 'sending';
      try {
        if (recoveryJournal !== undefined) {
          const retained = await recoveryJournal.remember(key);
          // Awaiting storage can outlive this controller (navigation/logout).
          if (disposed) return { state: 'disposed' };
          if (retained?.state !== 'retained' || retained.canStartNewOrder !== false
            || !Array.isArray(retained.keys) || !retained.keys.includes(key)) throw new Error('recovery_journal_unavailable');
        }
        const controller = new AbortController();
        let timer;
        let rejectWait;
        const interrupted = new Promise((_, reject) => { rejectWait = reject; });
        const cancel = () => {
          rejectWait(new Error('checkout_request_interrupted'));
          controller.abort();
        };
        cancelRequest = cancel;
        timer = setTimeout(cancel, requestTimeoutMs);
        let response;
        try {
          // Aborting the browser wait never proves rollback on the server.
          // Race also bounds transports that fail to honor AbortSignal.
          response = await Promise.race([fetchImpl(url.href, {
          method: 'POST', credentials: 'same-origin', mode: 'same-origin',
          redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body, signal: controller.signal,
          }), interrupted]);
        } finally {
          clearTimeout(timer);
          if (cancelRequest === cancel) cancelRequest = null;
        }
        if (disposed) return { state: 'disposed' };
        // Even a later 400 (expired session/CSRF) cannot disprove an earlier commit.
        // Require an explicit acknowledgement, not merely a login page with HTTP 200.
        if (response.status === 200 && !response.redirected && response.headers?.get('X-CNG-Checkout') === 'submitted') {
          // The reference is an opaque tracking identifier, never proof of payment.
          // Missing/malformed metadata cannot undo an acknowledged submission.
          const candidate = response.headers.get('X-CNG-Order-Reference');
          reference = typeof candidate === 'string' && /^[a-f0-9]{32}$/.test(candidate) ? candidate : null;
          state = 'submitted'; accepted = null;
        } else state = 'uncertain';
      } catch {
        if (disposed) return { state: 'disposed' };
        state = 'uncertain';
      }
      return snapshot();
    },
    dispose() {
      // Disposal does not cancel or undo server-side work. Caller must not automatically
      // start a replacement checkout after navigating away from an uncertain outcome.
      disposed = true; accepted = null; reference = null; state = 'disposed';
      cancelRequest?.(); cancelRequest = null; unbind();
    },
  };
  unbind = bindSessionSignal(sessionSignal, client.dispose);
  return client;
}
