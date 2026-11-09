import { reconcileSelection, selectionStorageKey } from './shop-selection-import.mjs';
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
  root.innerHTML = '<h2>انتخاب کالا از کاتالوگ حساب</h2><p data-catalog-status role="status">قیمت و موجودی هنگام ثبت دوباره سمت سرور بررسی می‌شوند. پرداخت اینترنتی فعال نیست.</p><p data-catalog-freight></p><button type="button" data-catalog-load>دریافت کاتالوگ و مقصدهای مجاز</button><label>جست‌وجوی کالا<input type="search" data-catalog-search></label><label>دسته‌بندی<select data-catalog-category><option value="">همه دسته‌بندی‌ها</option></select></label><p data-catalog-count role="status"></p><div data-catalog-products></div><p data-catalog-total></p><button type="button" data-catalog-continue disabled>ادامه با کالاهای انتخاب‌شده</button><div data-catalog-checkout></div>';
  const status = root.querySelector('[data-catalog-status]');
  const loadButton = root.querySelector('[data-catalog-load]');
  const next = root.querySelector('[data-catalog-continue]');
  const products = root.querySelector('[data-catalog-products]');
  const search = root.querySelector('[data-catalog-search]');
  const category = root.querySelector('[data-catalog-category]');
  const normalize = text => text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();
  const filter = () => {
    let count = 0;
    for (const row of products.children) {
      row.hidden = !(normalize(row.dataset.title).includes(normalize(search.value)) && (!category.value || row.dataset.category === category.value));
      if (!row.hidden) count++;
    }
    root.querySelector('[data-catalog-count]').textContent = `${new Intl.NumberFormat('fa-IR').format(count)} محصول`;
  };
  search.addEventListener('input', filter); category.addEventListener('change', filter);
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
      let imported;
      try { imported = reconcileSelection(document.defaultView.localStorage.getItem(selectionStorageKey), catalog); }
      catch { imported = { items: [], invalid: true, changed: 0 }; }
      items = imported.items;
      products.replaceChildren();
      while (category.options.length > 1) category.remove(1);
      const groups = new Map(Object.values(catalog).filter(p => p.categorySlug).map(p => [p.categorySlug, p.categoryTitle]));
      for (const [slug, title] of groups) {
        const option = document.createElement('option'); option.value = slug; option.textContent = title; category.append(option);
      }
      for (const [slug, product] of Object.entries(catalog)) {
        const row = document.createElement('article');
        row.className = 'store-product';
        row.dataset.productSlug = slug;
        row.dataset.title = product.title || slug;
        row.dataset.category = product.categorySlug || '';
        const title = document.createElement('h3');
        title.textContent = product.title || slug;
        const price = document.createElement('p');
        const label = document.createElement('label');
        const available = availableQuantity(product);
        price.textContent = available ? `${format(product.priceToman)} تومان` : 'فعلاً قابل خرید نیست';
        label.textContent = 'تعداد';
        row.append(title, price);
        if (available) {
          const input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.max = String(available); input.step = '1'; input.value = String(items.find(item => item.slug === slug)?.quantity ?? 0);
          input.dataset.catalogQuantity = slug; input.autocomplete = 'off';
          input.setAttribute('aria-label', `تعداد ${product.title || slug}`);
          label.append(input);
          row.append(label);
        }
        products.append(row);
      }
      filter();
      state = 'selecting'; loadButton.hidden = true;
      status.textContent = Object.values(destinations).some(cities => cities.length)
        ? 'کالا و تعداد را انتخاب کنید. ادامه، انتخاب این فهرست را قفل می‌کند؛ فرم بعدی امکان کاهش تعداد دارد.'
        : 'هیچ مقصد مجازی تنظیم نشده است؛ ثبت سفارش بسته می‌ماند.';
      if (imported.invalid) status.textContent += ' سبد ذخیره‌شده قابل خواندن نیست؛ کالاها را اینجا انتخاب کنید.';
      else if (imported.items.length || imported.changed) status.textContent += ' انتخاب‌های قبلی با کاتالوگ فعلی تطبیق داده شد؛ پیش از ادامه تعدادها و قیمت‌ها را بررسی کنید.';
      if (imported.changed) status.textContent += ' برخی اقلام حذف یا تعدادشان به موجودی مجاز کاهش داده شد.';
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
      search.removeEventListener('input', filter); category.removeEventListener('change', filter);
      catalog = null; destinations = null; items = []; root.replaceChildren(); root.removeAttribute('aria-busy');
    },
  };
  unbind = bindSessionSignal(options.sessionSignal, view.destroy);
  return view;
}
