import { mountOrderRecovery } from './shop-order-recovery-view.mjs';

const mounted = new WeakMap();

/** Internal opt-in reload surface, NEVER checkout authorization.
 * Caller must destroy on logout/account change and supply fresh authenticated
 * configuration on remount. No automatic network requests or journal deletion.
 */
export function mountRecoveryStartup(root, options = {}) {
  if (options.enabled !== true || root.closest('form')) throw new Error('recovery_startup_disabled');
  const journal = options.recoveryJournal;
  if (!journal || typeof journal.read !== 'function') throw new Error('recovery_journal_unavailable');
  const signal = options.sessionSignal;
  if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new Error('invalid_session_signal');
  mounted.get(root)?.destroy();
  let state = 'loading';
  let disposed = false;
  const children = [];
  root.replaceChildren();
  const status = root.ownerDocument.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'در حال بررسی دفترچهٔ درخواست‌های قبلی؛ سفارش تازه ثبت نکنید.';
  root.append(status);
  root.setAttribute('aria-busy', 'true');
  const snapshot = () => ({ state, canStartNewOrder: false });
  const ready = (async () => {
    try {
      const result = await journal.read();
      if (disposed) return snapshot();
      if (!result || result.canStartNewOrder !== false || !Array.isArray(result.keys)
        || result.keys.length > 16 || new Set(result.keys).size !== result.keys.length
        || result.keys.some(key => typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}(?![\s\S])/.test(key))
        || !((result.state === 'retained' && result.keys.length > 0)
          || (['missing', 'unavailable'].includes(result.state) && result.keys.length === 0))) throw new Error();
      state = result.state;
      for (const requestKey of result.keys) {
        const section = root.ownerDocument.createElement('section');
        root.append(section);
        children.push(mountOrderRecovery(section, { ...options, requestKey }));
      }
      status.textContent = state === 'retained'
        ? 'درخواست‌های قبلی برای بررسی دستی آماده‌اند؛ این بخش اجازهٔ سفارش تازه نمی‌دهد.'
        : 'دفترچه خالی یا در دسترس نیست؛ این وضعیت ثابت نمی‌کند سفارش قبلی ثبت نشده است. برای پیگیری با پشتیبانی تماس بگیرید و سفارش تازه نسازید.';
    } catch {
      if (!disposed) {
        for (const child of children.splice(0)) child.destroy();
        root.replaceChildren(status);
        state = 'unavailable';
        status.textContent = 'بازیابی آماده نشد؛ سفارش تازه ثبت نکنید و با پشتیبانی پیگیری کنید.';
      }
    } finally {
      if (!disposed) root.removeAttribute('aria-busy');
    }
    return snapshot();
  })();
  const view = {
    ready, snapshot,
    destroy() {
      if (disposed) return;
      disposed = true;
      state = 'disposed';
      signal?.removeEventListener('abort', view.destroy);
      for (const child of children.splice(0)) child.destroy();
      root.replaceChildren();
      root.removeAttribute('aria-busy');
      if (mounted.get(root) === view) mounted.delete(root);
    },
  };
  mounted.set(root, view);
  signal?.addEventListener('abort', view.destroy, {once:true});
  if (signal?.aborted) view.destroy();
  return view;
}
