import { createOrderRecovery, recoverySnapshotText } from './shop-order-recovery.mjs';

/** Internal recovery-only surface. Caller supplies the original key through memory,
 * never a URL. Does not persist keys, mount checkout, or authorize replacement orders.
 * Destroy on logout/account change; remount only with fresh authenticated config.
 */
export function mountOrderRecovery(root, options = {}) {
  if (options.enabled !== true || root.closest('form')) throw new Error('recovery_preview_disabled');
  let requestKey = options.requestKey;
  if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}(?![\s\S])/.test(requestKey)) throw new Error('invalid_recovery_key');
  const recovery = createOrderRecovery(options);
  let disposed = false;
  let pending = false;
  root.innerHTML = `<p>این بخش فقط وضعیت درخواست قبلی را بررسی می‌کند؛ سفارش تازه یا پرداخت ایجاد نمی‌کند.</p>
    <button type="button" data-recovery-check>بررسی درخواست قبلی</button>
    <p role="status" aria-live="polite" data-recovery-status></p>
    <p>تا روشن شدن وضعیت، سفارش جایگزین ثبت نکنید. در صورت خطا یا انقضای نشست، با پشتیبانی پیگیری کنید.</p>`;
  const button = root.querySelector('[data-recovery-check]');
  const status = root.querySelector('[data-recovery-status]');
  const click = async event => {
    if (event.target.closest('button') !== button || pending || disposed) return;
    event.preventDefault();
    pending = true;
    button.disabled = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = 'در حال بررسی درخواست قبلی در سرور…';
    try {
      const snapshot = await recovery.recover(requestKey);
      if (!disposed) status.textContent = recoverySnapshotText(snapshot);
    } catch {
      if (!disposed) status.textContent = 'وضعیت دریافت نشد؛ این خطا به معنی ثبت نشدن یا لغو سفارش نیست. سفارش تازه ثبت نکنید و برای پیگیری اقدام کنید.';
    } finally {
      pending = false;
      if (!disposed) { button.disabled = false; root.setAttribute('aria-busy', 'false'); }
    }
  };
  root.addEventListener('click', click);
  return {
    destroy() {
      disposed = true;
      recovery.dispose();
      requestKey = null;
      root.removeEventListener('click', click);
      root.removeAttribute('aria-busy');
      root.replaceChildren();
    },
  };
}
