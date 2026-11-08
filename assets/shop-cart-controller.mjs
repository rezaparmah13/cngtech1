import { setCartQuantity, summarizeCart } from './shop-cart-core.mjs';
import { renderDirectCart } from './shop-cart-view.mjs';

/** Local UI state only. Catalog refreshes never make an unavailable line disappear silently. */
export function createCartState({ items = [], catalog = {} } = {}) {
  let currentCatalog = structuredClone(catalog);
  let currentItems = summarizeCart(items, currentCatalog).requestItems;
  return {
    snapshot: () => summarizeCart(currentItems, currentCatalog),
    html: () => renderDirectCart(currentItems, currentCatalog),
    setQuantity(slug, quantity) {
      currentItems = setCartQuantity(currentItems, slug, quantity, currentCatalog);
      return this.snapshot();
    },
    refreshCatalog(nextCatalog) {
      const copy = structuredClone(nextCatalog);
      // Validate before replacing a working catalog; errors preserve previous state.
      summarizeCart(currentItems, copy);
      currentCatalog = copy;
      return this.snapshot();
    },
  };
}

/** Mount only on a dedicated preview container until checkout endpoints are ready.
 * No network requests, localStorage, customer information or payment initiation.
 */
export function mountDirectCart(root, options = {}) {
  const state = createCartState(options);
  let disposed = false;
  const render = (message = '') => {
    root.innerHTML = state.html();
    const status = root.ownerDocument.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = message;
    root.append(status);
  };
  const change = event => {
    const input = event.target.closest?.('[data-cart-quantity]');
    if (!input || !root.contains(input)) return;
    const slug = input.getAttribute('data-cart-quantity');
    try {
      if (!/^[1-9][0-9]*$/.test(input.value)) throw new Error('invalid_quantity');
      state.setQuantity(slug, Number(input.value));
      render('تعداد کالا به‌روزرسانی شد.');
    } catch {
      render('تعداد واردشده معتبر نیست یا موجودی کافی نیست؛ تعداد قبلی حفظ شد.');
    }
    // Slugs are validated by the state; avoid placing untrusted text in selectors.
    for (const node of root.querySelectorAll('[data-cart-quantity]')) {
      if (node.getAttribute('data-cart-quantity') === slug) { node.focus(); break; }
    }
  };
  const click = event => {
    const button = event.target.closest?.('[data-cart-remove]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    try {
      state.setQuantity(button.getAttribute('data-cart-remove'), 0);
      render('کالا از سبد حذف شد.');
      const heading = root.querySelector('h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    } catch { render('حذف کالا انجام نشد.'); }
  };
  render();
  root.addEventListener('change', change);
  root.addEventListener('click', click);
  return {
    snapshot: () => state.snapshot(),
    refreshCatalog(catalog) {
      if (disposed) throw new Error('cart_disposed');
      state.refreshCatalog(catalog);
      // Re-render deliberately clears earlier consent when totals/availability change.
      render('قیمت و موجودی به‌روزرسانی شد؛ سبد را دوباره بررسی کنید.');
    },
    destroy() {
      root.removeEventListener('change', change);
      root.removeEventListener('click', click);
      disposed = true;
      root.replaceChildren();
    },
  };
}
