import { createPaymentStart } from './shop-payment-start.mjs';
import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

/** Private opt-in only. Caller must supply a freshly authenticated server order.
 * Never treats a redirect as settlement and never mounts from public catalog data.
 */
export function mountPaymentStart(root, options = {}) {
  validateSessionSignal(options.sessionSignal);
  if (options.enabled !== true || !options.sessionSignal || root.closest('form')) throw new Error('payment_view_disabled');
  const { csrf, reference, revision } = options;
  if (typeof csrf !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(csrf)
      || typeof reference !== 'string' || !/^[a-f0-9]{32}(?![\s\S])/.test(reference)
      || !Number.isSafeInteger(revision) || revision < 1 || revision > 999999999) throw new Error('invalid_payment_request');
  const client = createPaymentStart(options);
  let disposed = false;
  let unbind = () => {};
  root.innerHTML = '<p>انتقال به درگاه به معنی پرداخت موفق نیست؛ نتیجه باید سمت سرور تأیید شود.</p><button type="button" data-payment-start>آماده‌سازی پرداخت</button><p role="status" aria-live="polite" data-payment-status></p><a data-payment-link hidden rel="noreferrer" referrerpolicy="no-referrer">ادامه در درگاه زیبال</a>';
  const button = root.querySelector('[data-payment-start]');
  const status = root.querySelector('[data-payment-status]');
  const link = root.querySelector('[data-payment-link]');
  const start = async () => {
    if (disposed || !client.snapshot().canStart) return;
    button.disabled = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = 'در حال آماده‌سازی؛ درخواست را تکرار نکنید…';
    try {
      const result = await client.start({ csrf, reference, revision });
      if (disposed) return;
      if (result.state === 'redirect') {
        link.href = result.redirectUrl;
        link.hidden = false;
        status.textContent = 'درگاه آماده است. برای ادامه روی پیوند بزنید؛ پرداخت هنوز تأیید نشده است.';
      } else {
        status.textContent = 'نتیجه مشخص نیست. پرداخت را تکرار نکنید؛ وضعیت همین سفارش را پیگیری کنید.';
      }
    } catch {
      if (!disposed) status.textContent = 'پرداخت ادامه پیدا نکرد. پیش از هر اقدام وضعیت همین سفارش را پیگیری کنید.';
    } finally {
      if (!disposed) root.removeAttribute('aria-busy');
    }
  };
  button.addEventListener('click', start);
  const view = {
    snapshot: client.snapshot,
    destroy() {
      if (disposed) return;
      disposed = true; unbind(); client.dispose();
      button.removeEventListener('click', start);
      link.removeAttribute('href'); link.hidden = true;
      root.replaceChildren(); root.removeAttribute('aria-busy');
    },
  };
  unbind = bindSessionSignal(options.sessionSignal, view.destroy);
  return view;
}
