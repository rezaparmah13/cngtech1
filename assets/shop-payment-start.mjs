import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

/** Private UI transport only. Never auto-start, auto-redirect, or retry a payment.
 * Disposal/reload cannot establish that a previous request did not reach the server;
 * the durable server dispatch fence remains authoritative across client instances.
 */
export function createPaymentStart({ endpoint, origin, fetchImpl = globalThis.fetch, sessionSignal, requestTimeoutMs = 30000 } = {}) {
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 120000) throw new Error('invalid_payment_timeout');
  validateSessionSignal(sessionSignal);
  const base = new URL(origin);
  const url = new URL(endpoint, base);
  if (typeof endpoint !== 'string' || !endpoint || /[\u0000-\u0020\u007f]/.test(endpoint) || base.protocol !== 'https:'
      || url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password
      || url.hash || url.search || typeof fetchImpl !== 'function') throw new Error('invalid_payment_endpoint');
  let state = 'idle';
  let redirectUrl = null;
  let cancelRequest = null;
  let unbind = () => {};
  const snapshot = () => ({ state, canStart: state === 'idle', canRetry: false, redirectUrl });
  const client = {
    snapshot,
    async start({ csrf, reference, revision } = {}) {
      if (state !== 'idle') throw new Error('payment_start_locked');
      if (typeof csrf !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(csrf)
          || typeof reference !== 'string' || !/^[a-f0-9]{32}(?![\s\S])/.test(reference)
          || !Number.isSafeInteger(revision) || revision < 1 || revision > 999999999) throw new Error('invalid_payment_request');
      state = 'sending';
      const controller = new AbortController();
      let timer;
      const interrupted = new Promise((_, reject) => {
        cancelRequest = () => { reject(new Error('unconfirmed')); controller.abort(); };
        timer = setTimeout(cancelRequest, requestTimeoutMs);
      });
      try {
        // Bound both headers and body, even if the transport ignores abort.
        // This operation must not mutate state: it can finish after the deadline.
        const receive = async () => {
        const response = await fetchImpl(url.href, {
          signal: controller.signal,
          method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
          cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
          body: new URLSearchParams({ action: 'payment-start', csrf, reference, revision: String(revision) }).toString(),
        });
        if (controller.signal.aborted) throw new Error('unconfirmed');
        if (response.status !== 200 || response.redirected
            || !/^application\/json(?:;|$)/i.test(response.headers?.get('Content-Type') ?? '')) throw new Error('unconfirmed');
        return response.json();
        };
        const result = await Promise.race([receive(), interrupted]);
        if (state === 'disposed') return snapshot();
        if (result?.version !== 1 || result.state !== 'redirect' || typeof result.url !== 'string'
            || !/^https:\/\/gateway\.zibal\.ir\/start\/[1-9][0-9]{0,18}(?![\s\S])/.test(result.url)
            || BigInt(result.url.slice('https://gateway.zibal.ir/start/'.length)) > 9223372036854775807n) throw new Error('unconfirmed');
        redirectUrl = result.url;
        state = 'redirect'; // Not proof of payment; navigation is a separate UI action.
      } catch {
        if (state !== 'disposed') state = 'reconciliation_required';
      } finally {
        clearTimeout(timer);
        cancelRequest = null;
      }
      return snapshot();
    },
    dispose() { state = 'disposed'; redirectUrl = null; cancelRequest?.(); unbind(); },
  };
  unbind = bindSessionSignal(sessionSignal, client.dispose);
  return client;
}
