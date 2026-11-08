/** Cancellation is a UI lifecycle boundary, never evidence of transaction rollback. */
export function validateSessionSignal(signal) {
  if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
    throw new Error('invalid_session_signal');
  }
}

export function bindSessionSignal(signal, dispose) {
  validateSessionSignal(signal);
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return () => signal?.removeEventListener('abort', dispose);
}

/** One lifetime per authenticated document, not an authentication authority.
 * Notifications contain no identity, CSRF, order key or recipient data. They can
 * only revoke a view. Fresh credentials always require a new server-rendered page.
 */
export function createShopSession({ target = globalThis.window, channelFactory = name => new BroadcastChannel(name) } = {}) {
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') throw new Error('invalid_session_target');
  const controller = new AbortController();
  let channel = null;
  let disposed = false;
  const invalidate = (notify = false) => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (notify) {
      try { channel?.postMessage({ version: 1, action: 'invalidate' }); } catch { /* Server authorization remains authoritative. */ }
    }
  };
  const message = event => {
    if (event.data?.version === 1 && event.data?.action === 'invalidate') invalidate();
  };
  const submit = event => {
    // Native login/logout continues normally, including when JS coordination fails.
    const action = event.target?.querySelector?.('[name="action"]')?.value;
    if (action === 'logout' || action === 'login') invalidate(true);
  };
  const pagehide = () => invalidate();
  // BFCache must not revive a form holding the preceding account's data.
  const pageshow = event => { if (event.persisted) invalidate(); };
  try {
    channel = channelFactory('cng.shop.session.v1');
    channel.addEventListener('message', message);
  } catch {
    try { channel?.close(); } catch { /* Unavailable channel is not authorization. */ }
    channel = null;
  }
  target.addEventListener('submit', submit, true);
  target.addEventListener('pagehide', pagehide);
  target.addEventListener('pageshow', pageshow);
  return {
    signal: controller.signal,
    coordinationAvailable: channel !== null,
    invalidate: () => invalidate(true),
    destroy() {
      if (disposed) return;
      disposed = true;
      invalidate();
      target.removeEventListener('submit', submit, true);
      target.removeEventListener('pagehide', pagehide);
      target.removeEventListener('pageshow', pageshow);
      if (channel) { channel.removeEventListener('message', message); channel.close(); channel = null; }
    },
  };
}
