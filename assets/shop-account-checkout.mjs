import { createShopCatalog } from './shop-catalog.mjs';
import { availableQuantity, setCartQuantity, summarizeCart, freightNotice } from './shop-cart-core.mjs';
import { mountCheckoutPreview } from './shop-checkout-controller.mjs';
import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

/** Mounted ONLY after the account intent is prepared and its key durably retained.
 * A committed intent bypasses this view entirely. Selection is locked before the
 * recipient form opens; no reset/new-key path exists after submission uncertainty.
 */
export function mountCatalogCheckout(root, options = {}) {
  validateSessionSignal(options.sessionSignal);
  if (options.enabled !== true || !options.sessionSignal || typeof options.keyFactory !== 'function' || root.closest('form')) throw new Error('catalog_checkout_disabled');
  const client = createShopCatalog(options);
  let disposed = false; let state = 'idle'; let child = null; let unbind = () => {};
  let catalog = null; let destinations = null; let items = [];
  root.innerHTML = '<h2>انتخاب کالا از کاتالوگ حساب</h2><p data-catalog-status role="status">قیمت و موجودی هنگام ثبت دوباره سمت سرور بررسی می‌شوند. پرداخت اینترنتی فعال نیست.</p><p data-catalog-freight></p><button type="button" data-catalog-load>دریافت کاتالوگ و مقصدهای مجاز</button><div data-catalog-products></div><p data-catalog-total></p><button type="button" data-catalog-continue disabled>ادامه با کالاهای انتخاب‌شده</button><div data-catalog-checkout></div>';
  const status = root.querySelector('[data-catalog-status]');
  const loadButton = root.querySelector('[data-catalog-load]');
  const next = root.querySelector('[data-catalog-continue]');
  const products = root.querySelector('[data-catalog-products]');
  const total = root.querySelector('[data-catalog-total]');
  const content = root.querySelector('[data-catalog-checkout]');
  root.querySelector('[data-catalog-freight]').textContent = freightNotice;
  const format = amount => new Intl.NumberFormat('fa-IR').format(amount);
  const update = () => {
    try {
      const summary = summarizeCart(items, catalog);
      total.textContent = summary.valid ? `مبلغ کالاهای انتخاب‌شده: ${format(summary.goodsTotalToman)} تومان؛ بدون کرایه حمل` : 'کالای قابل خریدی انتخاب نشده است.';
      next.disabled = !summary.valid || !Object.values(destinations).some(cities => cities.length > 0);
    } catch { next.disabled = true; total.textContent = 'مبلغ یا تعداد اقلام مجاز نیست.'; }
  };
  const change = event => {
    if (disposed || state !== 'selecting') return;
    const input = event.target;
    const slug = input?.dataset?.catalogQuantity;
    if (typeof slug !== 'string' || !Object.hasOwn(catalog, slug)) return;
    try {
      if (!/^(?:[0-9]|10)$/.test(input.value)) throw new Error();
      items = setCartQuantity(items, slug, Number(input.value), catalog);
      status.textContent = 'انتخاب به‌روز شد. این فهرست هنوز سفارش یا رزرو نیست.';
    } catch {
      input.value = String(items.find(item => item.slug === slug)?.quantity ?? 0);
      status.textContent = 'تعداد انتخابی مجاز نیست؛ حداکثر ۵۰ قلم با موجودی معتبر قابل انتخاب است.';
    }
    update();
  };
  const load = async () => {
    if (disposed || !['idle', 'unavailable'].includes(state)) return;
    state = 'loading'; loadButton.disabled = true; root.setAttribute('aria-busy', 'true');
    status.textContent = 'در حال دریافت کاتالوگ سمت سرور…';
    try {
      const snapshot = await client.load();
      if (disposed) return;
      ({ catalog, destinations } = snapshot);
      const document = root.ownerDocument;
      for (const [slug, product] of Object.entries(catalog)) {
        const row = document.createElement('p');
        const label = document.createElement('label');
        const available = availableQuantity(product);
        label.textContent = `${product.title || slug} — ${available ? `${format(product.priceToman)} تومان؛ تعداد` : 'فعلاً قابل خرید نیست'}`;
        if (available) {
          const input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.max = String(available); input.step = '1'; input.value = '0';
          input.dataset.catalogQuantity = slug; input.autocomplete = 'off';
          label.append(input);
        }
        row.append(label); products.append(row);
      }
      state = 'selecting'; loadButton.hidden = true;
      status.textContent = Object.values(destinations).some(cities => cities.length)
        ? 'کالا و تعداد را انتخاب کنید. ادامه، انتخاب این فهرست را قفل می‌کند؛ فرم بعدی امکان کاهش تعداد دارد.'
        : 'هیچ مقصد مجازی تنظیم نشده است؛ ثبت سفارش بسته می‌ماند.';
      update();
    } catch {
      if (!disposed) {
        products.replaceChildren(); state = 'unavailable'; loadButton.disabled = false;
        status.textContent = 'کاتالوگ دریافت نشد. فقط دریافت کاتالوگ را دوباره امتحان کنید؛ سفارش یا پرداختی از این مرحله انجام نمی‌شود.';
      }
    } finally { if (!disposed) root.removeAttribute('aria-busy'); }
  };
  const proceed = () => {
    if (disposed || state !== 'selecting' || next.disabled) return;
    try {
      const summary = summarizeCart(items, catalog);
      if (!summary.valid || !Object.values(destinations).some(cities => cities.length)) return;
      child = mountCheckoutPreview(content, { ...options, items: summary.requestItems, catalog, destinations });
      state = 'checkout'; next.disabled = true; next.hidden = true;
      products.replaceChildren(); total.textContent = ''; items = [];
      status.textContent = 'انتخاب کالا به فرم ثبت منتقل شد؛ ثبت نهایی هنوز انجام نشده است.';
    } catch {
      next.disabled = true; state = 'blocked'; content.replaceChildren();
      status.textContent = 'فرم آماده نشد. برای بررسی وضعیت همین حساب صفحه را دوباره باز کنید؛ کلید تازه نسازید.';
    }
  };
  loadButton.addEventListener('click', load); products.addEventListener('change', change); next.addEventListener('click', proceed);
  const view = {
    snapshot: () => ({ state, canStartNewOrder: false }),
    destroy() {
      if (disposed) return;
      disposed = true; state = 'disposed'; unbind(); client.dispose(); child?.destroy(); child = null;
      loadButton.removeEventListener('click', load); products.removeEventListener('change', change); next.removeEventListener('click', proceed);
      catalog = null; destinations = null; items = []; root.replaceChildren(); root.removeAttribute('aria-busy');
    },
  };
  unbind = bindSessionSignal(options.sessionSignal, view.destroy);
  return view;
}
