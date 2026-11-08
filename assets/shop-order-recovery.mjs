// Internal read-only recovery transport. Never stores a key, creates an order,
// retries checkout, or grants permission to unlock submission.
import { parseOrderSnapshot, orderSnapshotText } from './shop-order-lookup.mjs';

export function parseRecoverySnapshot(payload) {
  if (!payload || Array.isArray(payload) || payload.version !== 1
    || Object.keys(payload).length !== 3
    || !['version', 'outcome', 'order'].every(key => Object.hasOwn(payload, key))) {
    throw new Error('invalid_recovery_snapshot');
  }
  if (payload.outcome === 'unresolved' && payload.order === null) {
    return { outcome: 'unresolved', order: null };
  }
  if (payload.outcome !== 'found' || typeof payload.order?.reference !== 'string'
    || !/^[a-f0-9]{32}(?![\s\S])/.test(payload.order.reference)) {
    throw new Error('invalid_recovery_snapshot');
  }
  try {
    return { outcome: 'found', order: parseOrderSnapshot({ version: 1, order: payload.order }, payload.order.reference) };
  } catch { throw new Error('invalid_recovery_snapshot'); }
}

export function recoverySnapshotText(snapshot) {
  if (snapshot.outcome === 'unresolved') {
    return 'نتیجهٔ درخواست قبلی هنوز مشخص نیست. پیدا نشدن سفارش به معنی ثبت نشدن آن نیست؛ سفارش جایگزین ثبت نکنید و برای پیگیری اقدام کنید.';
  }
  return `سفارش قبلی پیدا شد. ${orderSnapshotText(snapshot.order)}`;
}

export function createOrderRecovery({ endpoint, origin, csrf, fetchImpl = globalThis.fetch } = {}) {
  let url;
  try {
    if (typeof origin !== 'string' || typeof endpoint !== 'string' || !endpoint
      || typeof csrf !== 'string' || !csrf || typeof fetchImpl !== 'function') throw new Error();
    const base = new URL(origin);
    url = new URL(endpoint, base);
    if (base.protocol !== 'https:' || base.username || base.password
      || url.protocol !== 'https:' || url.origin !== base.origin
      || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new Error('invalid_recovery_config'); }
  let pending = false; let disposed = false;
  return {
    async recover(requestKey) {
      if (disposed || pending) throw new Error('recovery_unavailable');
      if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}(?![\s\S])/.test(requestKey)) throw new Error('invalid_recovery_key');
      pending = true;
      try {
        const response = await fetchImpl(url.href, {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin',
          redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ action: 'recover', csrf, requestKey }).toString(),
        });
        if (disposed || response.status !== 200 || response.redirected
          || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('Content-Type') ?? '')) throw new Error();
        const payload = await response.json();
        if (disposed) throw new Error();
        return parseRecoverySnapshot(payload);
      } catch { throw new Error('recovery_unavailable'); }
      finally { pending = false; }
    },
    // Dispose on logout/account changes; replace with a newly authenticated CSRF config.
    dispose() { disposed = true; },
  };
}
