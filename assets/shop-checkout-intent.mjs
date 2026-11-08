import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

export function parseCheckoutIntent(payload) {
  const exact = (object, keys) => object && !Array.isArray(object) && typeof object === 'object'
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  if (!exact(payload, ['version', 'intent', 'paymentEnabled']) || payload.version !== 1 || payload.paymentEnabled !== false
    || !exact(payload.intent, ['requestKey', 'state', 'reference'])) throw new Error('invalid_checkout_intent');
  const { requestKey, state, reference } = payload.intent;
  if (typeof requestKey !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(requestKey)
    || !((state === 'prepared' && reference === null)
      || (state === 'committed' && typeof reference === 'string' && /^[a-f0-9]{32}(?![\s\S])/.test(reference)))) throw new Error('invalid_checkout_intent');
  return { requestKey, state, reference };
}

/** Explicit server request. No random-key fallback, storage-based permission or payment. */
export function createCheckoutIntent({ endpoint, origin, csrf, fetchImpl = globalThis.fetch, sessionSignal } = {}) {
  validateSessionSignal(sessionSignal);
  let url;
  try {
    const base = new URL(origin);
    url = new URL(endpoint, base);
    if (typeof origin !== 'string' || typeof endpoint !== 'string' || !endpoint
      || base.protocol !== 'https:' || base.username || base.password || url.origin !== base.origin
      || url.username || url.password || url.hash || url.search || typeof fetchImpl !== 'function'
      || typeof csrf !== 'string' || !/^[a-zA-Z0-9_-]{16,256}(?![\s\S])/.test(csrf)) throw new Error();
  } catch { throw new Error('invalid_intent_config'); }
  let disposed = false; let pending = false;
  let unbind = () => {};
  const request = async fields => {
      if (disposed || pending) throw new Error('checkout_intent_unavailable');
      pending = true;
      try {
        const response = await fetchImpl(url.href, {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
          cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ ...fields, csrf }).toString(),
        });
        if (disposed || response.status !== 200 || response.redirected
          || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('Content-Type') ?? '')) throw new Error();
        const payload = await response.json();
        if (disposed) throw new Error();
        return parseCheckoutIntent(payload);
      } catch { throw new Error('checkout_intent_unavailable'); }
      finally { pending = false; }
  };
  const client = {
    prepare: () => request({ action: 'intent' }),
    nextAfterExpiry({ requestKey, reference, confirmed } = {}) {
      if (confirmed !== true || typeof requestKey !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(requestKey)
        || typeof reference !== 'string' || !/^[a-f0-9]{32}(?![\s\S])/.test(reference)) throw new Error('invalid_successor_request');
      return request({ action: 'next-intent', requestKey, reference, confirmNewOrder: '1' });
    },
    dispose() { disposed = true; unbind(); },
  };
  unbind = bindSessionSignal(sessionSignal, client.dispose);
  return client;
}
