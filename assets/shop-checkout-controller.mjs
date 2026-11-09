import { createCartState } from './shop-cart-controller.mjs';
import { renderDirectCart } from './shop-cart-view.mjs';
import { renderRecipientFields } from './shop-checkout-form.mjs';
import { createCheckoutSubmission } from './shop-checkout-submit.mjs';
import { createOrderLookup, orderSnapshotText } from './shop-order-lookup.mjs';
import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

/** Internal only. No persistence, payment, public route, or automatic session recovery. */
export function createCheckoutWorkflow(options = {}) {
  let catalog = structuredClone(options.catalog ?? {});
  const cart = createCartState({ items: options.items, catalog });
  const destinations = structuredClone(options.destinations ?? {});
  const csrf = options.csrf;
  const transport = createCheckoutSubmission(options);
  let original = null;
  const editable = () => { if (!transport.snapshot().canEdit) throw new Error('checkout_locked'); };
  let unbind = () => {};
  const workflow = {
    snapshot: () => ({ ...transport.snapshot(), cart: cart.snapshot() }),
    html: () => renderDirectCart(cart.snapshot().requestItems, catalog, { submissionPreview: true }),
    setQuantity(slug, quantity) { editable(); cart.setQuantity(slug, quantity); },
    refreshCatalog(next) {
      editable();
      const copy = structuredClone(next);
      cart.refreshCatalog(copy); catalog = copy;
    },
    async submit(recipient, freightAccepted) {
      editable();
      const candidate = { recipient: structuredClone(recipient), freightAccepted, destinations, csrf };
      const pending = transport.submit(cart.snapshot().requestItems, catalog, candidate);
      // Transport validation is synchronous inside its async method: invalid input stays idle.
      if (!transport.snapshot().canEdit) original = candidate;
      const result = await pending;
      if (result.state === 'submitted') original = null;
      return result;
    },
    async retry() {
      if (!transport.snapshot().canRetry || !original) throw new Error('checkout_retry_unavailable');
      const result = await transport.submit(cart.snapshot().requestItems, catalog, original);
      if (result.state === 'submitted') original = null;
      return result;
    },
    destroy() { transport.dispose(); original = null; unbind(); },
  };
  unbind = bindSessionSignal(options.sessionSignal, workflow.destroy);
  return workflow;
}

/** Explicit opt-in internal form; never mount inside a form (prevents implicit GET with PII).
 * The intent startup supplies the server-issued key. Unknown outcomes deliberately
 * have no reset/new-order button. Session revocation clears the entire old view.
 */
export function mountCheckoutPreview(root, options = {}) {
  if (options.enabled !== true || root.closest('form')) throw new Error('checkout_preview_disabled');
  validateSessionSignal(options.sessionSignal);
  const destinations = structuredClone(options.destinations ?? {});
  const recipientHtml = renderRecipientFields(destinations);
  const workflow = createCheckoutWorkflow(options);
  const lookup = createOrderLookup(options);
  root.innerHTML = `<div data-checkout-cart></div><div data-checkout-recipient>${recipientHtml}</div>
    <button type="button" data-checkout-send>ثبت سفارش — بدون پرداخت</button>
    <button type="button" data-checkout-retry hidden>تکرار همان درخواست</button>
    <p role="status" aria-live="polite" data-checkout-status></p>
    <p data-checkout-reference hidden>کد پیگیری ثبت سفارش: <bdi dir="ltr"></bdi></p>
    <button type="button" data-checkout-lookup hidden>دریافت وضعیت فعلی سفارش</button>
    <p role="status" aria-live="polite" data-checkout-order></p>
    <aside aria-label="راهنمای تماس و پیگیری سفارش">
      <p>برای هماهنگی سفارش یا پیگیری نتیجهٔ نامشخص، از <a href="/contact/">اطلاعات تماس مجموعه و ساعات پاسخ‌گویی</a> استفاده کنید. اگر کد پیگیری دریافت کرده‌اید، آن را هنگام تماس اعلام کنید.</p>
      <p>ثبت سفارش به معنی پرداخت، تأیید ارسال یا تضمین موجودی نیست. پیش از هماهنگی با مجموعه وجهی واریز نکنید.</p>
    </aside>`;
  const cartRoot = root.querySelector('[data-checkout-cart]');
  const recipientRoot = root.querySelector('[data-checkout-recipient]');
  const send = root.querySelector('[data-checkout-send]');
  const retry = root.querySelector('[data-checkout-retry]');
  const status = root.querySelector('[data-checkout-status]');
  const reference = root.querySelector('[data-checkout-reference]');
  const lookupButton = root.querySelector('[data-checkout-lookup]');
  const orderStatus = root.querySelector('[data-checkout-order]');
  let disposed = false;
  const field = name => recipientRoot.querySelector(`[name="recipient[${name}]"]`);
  const update = () => {
    const state = workflow.snapshot();
    for (const node of cartRoot.querySelectorAll('input,button')) node.disabled = !state.canEdit;
    const recipientFieldset = recipientRoot.querySelector('fieldset');
    if (recipientFieldset) recipientFieldset.disabled = !state.canEdit;
    send.disabled = !state.canEdit || !state.cart.valid;
    retry.hidden = !state.canRetry;
    retry.disabled = !state.canRetry;
    root.setAttribute('aria-busy', String(state.state === 'sending'));
    if (state.state === 'sending') status.textContent = 'در حال ارسال؛ از ارسال سفارش تازه خودداری کنید.';
    if (state.state === 'uncertain') status.textContent = 'نتیجه مشخص نیست. فقط همین درخواست را تکرار کنید؛ اگر نشست منقضی شده، سفارش را از پشتیبانی پیگیری کنید. بارگذاری دوباره صفحه ممکن است امکان تکرار امن را از بین ببرد.';
    if (state.state === 'submitted') {
      recipientRoot.replaceChildren();
      reference.hidden = !state.reference;
      lookupButton.hidden = !state.reference;
      reference.querySelector('bdi').textContent = state.reference ?? '';
      status.textContent = 'ثبت سفارش توسط سرور تأیید شد؛ پرداختی انجام نشده است. کرایه حمل جداگانه و پس‌کرایه است.'
        + (state.reference ? ' کد پیگیری را برای مراجعه بعدی نگه دارید؛ این کد رسید پرداخت یا تضمین اعتبار فعلی رزرو نیست.' : ' کد پیگیری دریافت نشد؛ برای پیگیری با پشتیبانی تماس بگیرید و سفارش تازه ارسال نکنید.');
    }
  };
  const renderCart = () => { cartRoot.innerHTML = workflow.html(); update(); };
  const change = event => {
    if (!workflow.snapshot().canEdit) return;
    const target = event.target;
    if (target === field('provinceId')) {
      const city = field('cityId');
      city.replaceChildren();
      const province = target.value;
      const cities = Object.hasOwn(destinations, province) ? destinations[province] : [];
      for (const value of ['', ...cities]) {
        const option = root.ownerDocument.createElement('option');
        option.value = value; option.textContent = value || 'انتخاب کنید'; city.append(option);
      }
      city.disabled = cities.length === 0;
    }
    if (target.matches('[data-cart-quantity]') && cartRoot.contains(target)) {
      try {
        if (!/^[1-9][0-9]*$/.test(target.value)) throw new Error('invalid_quantity');
        workflow.setQuantity(target.getAttribute('data-cart-quantity'), Number(target.value));
        status.textContent = 'تعداد تغییر کرد؛ مبلغ و پذیرش کرایه را دوباره بررسی کنید.';
      } catch { status.textContent = 'تعداد معتبر نیست یا موجودی کافی نیست.'; }
      renderCart();
    }
  };
  const click = async event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    if (button.hasAttribute('data-cart-remove')) {
      try { workflow.setQuantity(button.getAttribute('data-cart-remove'), 0); renderCart(); }
      catch { status.textContent = 'سبد در این وضعیت قابل ویرایش نیست.'; }
      return;
    }
    if (button === lookupButton) {
      if (lookupButton.disabled || !workflow.snapshot().reference) return;
      lookupButton.disabled = true;
      orderStatus.textContent = 'در حال دریافت وضعیت از سرور…';
      try {
        const order = await lookup.lookup(workflow.snapshot().reference);
        if (!disposed) orderStatus.textContent = orderSnapshotText(order);
      } catch {
        if (!disposed) orderStatus.textContent = 'وضعیت دریافت نشد؛ این خطا به معنی ثبت نشدن یا لغو سفارش نیست. در صورت انقضای نشست با پشتیبانی پیگیری کنید؛ سفارش تازه نسازید.';
      } finally { if (!disposed) lookupButton.disabled = false; }
      return;
    }
    if (button !== send && button !== retry) return;
    try {
      let pending;
      if (button === retry) pending = workflow.retry();
      else {
        const recipient = Object.fromEntries(['name', 'mobile', 'provinceId', 'cityId', 'postalCode', 'address'].map(name => [name, field(name).value]));
        pending = workflow.submit(recipient, cartRoot.querySelector('[name="freightAccepted"]').checked);
      }
      update();
      await pending;
      if (!disposed) update();
    } catch {
      if (!disposed) { update(); status.textContent = 'ارسال تازه انجام نشد؛ اطلاعات گیرنده، مقصد و پذیرش کرایه را بررسی کنید. در وضعیت نامشخص فقط همان درخواست قابل تکرار است.'; }
    }
  };
  const preventImplicitSubmit = event => { if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault(); };
  renderCart();
  root.addEventListener('change', change);
  root.addEventListener('click', click);
  root.addEventListener('keydown', preventImplicitSubmit);
  let unbind = () => {};
  const view = {
    snapshot: workflow.snapshot,
    refreshCatalog(next) { workflow.refreshCatalog(next); renderCart(); status.textContent = 'قیمت و موجودی تغییر کرد؛ سبد و پذیرش کرایه را دوباره بررسی کنید.'; },
    destroy() {
      if (disposed) return;
      disposed = true; unbind(); workflow.destroy(); lookup.dispose();
      root.removeEventListener('change', change); root.removeEventListener('click', click); root.removeEventListener('keydown', preventImplicitSubmit);
      root.replaceChildren(); root.removeAttribute('aria-busy');
    },
  };
  unbind = bindSessionSignal(options.sessionSignal, view.destroy);
  return view;
}
