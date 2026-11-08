import { createCheckoutIntent } from './shop-checkout-intent.mjs';
import { mountCheckoutPreview } from './shop-checkout-controller.mjs';
import { mountOrderRecovery } from './shop-order-recovery-view.mjs';
import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

const mounted = new WeakMap();

/** Internal explicit opt-in. The account's server slot is the ONLY source of a key.
 * Missing browser storage never implies a missing order. A committed intent opens
 * recovery plus an explicitly confirmed successor request; only a subsequent
 * server prepare and durable key retention can open the checkout form.
 */
export function mountCheckoutStartup(root, options = {}) {
  if (options.enabled !== true || root.closest('form')) throw new Error('checkout_startup_disabled');
  validateSessionSignal(options.sessionSignal);
  if (!options.sessionSignal || !options.recoveryJournal || typeof options.recoveryJournal.remember !== 'function') throw new Error('checkout_startup_config_required');
  const client = createCheckoutIntent(options);
  mounted.get(root)?.destroy();
  let disposed = false; let state = 'idle'; let child = null;
  let unbind = () => {}; let committed = null;
  root.innerHTML = '<p role="status" data-intent-status>ابتدا وضعیت درخواست حساب را از سرور بررسی کنید. پرداخت اینترنتی فعال نیست.</p><button type="button" data-intent-prepare>بررسی امکان ثبت یا پیگیری سفارش</button><div data-intent-content></div><div data-intent-successor hidden><p>فقط اگر سفارش قبلی منقضی شده و رزرو آن آزاد شده باشد، سرور اجازهٔ سفارش بعدی می‌دهد. این کار پرداخت یا سفارش ایجاد نمی‌کند.</p><label><input type="checkbox" data-intent-confirm> درخواست شروع سفارش جدید پس از انقضای سفارش قبلی را تأیید می‌کنم.</label><button type="button" data-intent-next>درخواست امکان سفارش بعدی</button></div>';
  const status = root.querySelector('[data-intent-status]');
  const button = root.querySelector('[data-intent-prepare]');
  const content = root.querySelector('[data-intent-content]');
  const successor = root.querySelector('[data-intent-successor]');
  const confirm = root.querySelector('[data-intent-confirm]');
  const nextButton = root.querySelector('[data-intent-next]');
  const prepare = async () => {
    if (disposed || !['idle', 'unavailable'].includes(state)) return;
    state = 'loading'; button.disabled = true; root.setAttribute('aria-busy', 'true');
    status.textContent = 'در حال بررسی وضعیت درخواست حساب؛ این کار پرداخت یا سفارش تازه ایجاد نمی‌کند.';
    try {
      const intent = await client.prepare();
      if (disposed) return;
      if (intent.state === 'committed') {
        child = mountOrderRecovery(content, { ...options, requestKey: intent.requestKey });
        state = 'recovery';
        committed = intent; successor.hidden = false; confirm.checked = false;
        status.textContent = 'سفارش قبلی قابل پیگیری است؛ شروع سفارش بعدی فقط با تأیید شما و بررسی شرایط انقضا در سرور ممکن است.';
      } else {
        // Mandatory durable retention before allowing entry of recipient data.
        const saved = await options.recoveryJournal.remember(intent.requestKey);
        if (disposed) return;
        if (saved?.state !== 'retained' || saved.canStartNewOrder !== false
          || !Array.isArray(saved.keys) || !saved.keys.includes(intent.requestKey)) throw new Error();
        const mountPrepared = options.mountPrepared ?? mountCheckoutPreview;
        child = mountPrepared(content, { ...options, keyFactory: () => intent.requestKey });
        state = 'checkout';
        status.textContent = 'فرم به درخواست ثابت این حساب متصل است؛ در نتیجهٔ نامشخص فقط همان درخواست را تکرار کنید.';
      }
      button.hidden = true;
    } catch {
      if (!disposed) {
        child?.destroy(); child = null; content.replaceChildren(); state = 'unavailable';
        status.textContent = 'بررسی آماده نشد؛ سفارش تازه ارسال نکنید. فقط بررسی وضعیت همین حساب را دوباره انجام دهید یا با پشتیبانی پیگیری کنید.';
        button.disabled = false;
      }
    } finally { if (!disposed) root.removeAttribute('aria-busy'); }
  };
  const next = async () => {
    if (disposed || state !== 'recovery' || !committed || confirm.checked !== true) return;
    state = 'transitioning'; nextButton.disabled = true; successor.hidden = true;
    child?.destroy(); child = null; content.replaceChildren();
    root.setAttribute('aria-busy', 'true');
    status.textContent = 'در حال بررسی اجازهٔ سفارش بعدی؛ هنوز سفارش یا پرداختی ایجاد نمی‌شود.';
    try {
      await client.nextAfterExpiry({ ...committed, confirmed: true });
    } catch {
      // A rejected or lost response never authorizes a second transition attempt.
    } finally {
      committed = null;
      if (!disposed) {
        state = 'unavailable'; button.hidden = false; button.disabled = false; nextButton.disabled = false;
        root.removeAttribute('aria-busy');
        status.textContent = 'برای مشخص‌شدن نتیجه، وضعیت همین حساب را دوباره بررسی کنید. اگر درخواست پذیرفته نشده باشد، سفارش قبلی نمایش داده می‌شود؛ کلید تازه نسازید.';
      }
    }
  };
  nextButton.addEventListener('click', next);
  button.addEventListener('click', prepare);
  const view = {
    snapshot: () => ({ state, canStartNewOrder: false }),
    destroy() {
      if (disposed) return;
      disposed = true; state = 'disposed'; unbind(); client.dispose(); child?.destroy(); child = null;
      committed = null; nextButton.removeEventListener('click', next);
      button.removeEventListener('click', prepare);
      root.replaceChildren(); root.removeAttribute('aria-busy');
      if (mounted.get(root) === view) mounted.delete(root);
    },
  };
  mounted.set(root, view);
  unbind = bindSessionSignal(options.sessionSignal, view.destroy);
  return view;
}
