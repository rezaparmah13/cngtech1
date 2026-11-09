// Loaded only by the explicitly enabled private account controller.
// No public route, gateway, random-key fallback or automatic slot reset.
import { createShopSession } from './shop-session.mjs';
import { createRecoveryJournal } from './shop-recovery-journal.mjs';
import { mountCheckoutStartup } from './shop-checkout-startup.mjs';
import { mountCatalogCheckout } from './shop-account-checkout.mjs';
import { mountAccountPayment } from './shop-account-payment.mjs';

const session = createShopSession();
const root = document.querySelector('[data-shop-account-checkout]');
if (root) {
  try {
    let recoveryJournal;
    try { recoveryJournal = createRecoveryJournal({ storage: localStorage, locks: navigator.locks }); }
    catch {
      // Storage failure blocks prepared checkout, but not server-owned committed recovery.
      recoveryJournal = { remember: async () => { throw new Error('recovery_journal_unavailable'); } };
    }
    mountCheckoutStartup(root, {
      enabled: true, endpoint: location.pathname, origin: location.origin, csrf: root.dataset.csrf,
      sessionSignal: session.signal,
      recoveryJournal,
      mountPrepared: mountCatalogCheckout,
    });
  } catch {
    root.textContent = 'آماده‌سازی خرید در این مرورگر ممکن نیست. سفارش جایگزین نسازید؛ با شناسه سفارش از فرم پیگیری حساب استفاده کنید یا با پشتیبانی تماس بگیرید.';
  }
}
const paymentRoot = document.querySelector('[data-shop-account-payment]');
if (paymentRoot) {
  try {
    mountAccountPayment(paymentRoot, {
      enabled: true, endpoint: location.pathname, origin: location.origin,
      sessionSignal: session.signal,
    });
  } catch {
    paymentRoot.textContent = 'آماده‌سازی پرداخت ممکن نیست. وضعیت همین سفارش را پیگیری کنید؛ پرداخت را تکرار نکنید.';
  }
}
session.signal.addEventListener('abort', () => {
  // Never remove the submitting form: native login/logout must still reach PHP.
  for (const section of document.querySelectorAll('main section')) section.remove();
}, { once: true });
window.addEventListener('pagehide', () => session.destroy(), { once: true });
