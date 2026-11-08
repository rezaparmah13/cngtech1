import { summarizeCart, freightNotice } from './shop-cart-core.mjs';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => new Intl.NumberFormat('fa-IR').format(value) + ' تومان';

/** Pure renderer; not installed on the public telephone catalogue yet.
 * No customer data or credentials are persisted. All catalog text is escaped.
 */
export function renderDirectCart(items, catalog, { submissionPreview = false } = {}) {
  const summary = summarizeCart(items, catalog);
  const rows = summary.lines.map(line => {
    const product = Object.hasOwn(catalog, line.slug) ? catalog[line.slug] : null;
    const title = product?.title || line.slug;
    return `<li data-cart-line="${escape(line.slug)}"><h3>${escape(title)}</h3>
      <label>تعداد <input data-cart-quantity="${escape(line.slug)}" type="number" min="1" max="${line.available || 1}" step="1" value="${line.quantity}" ${line.available === 0 ? 'disabled' : ''}></label>
      <p>${line.valid ? money(line.lineTotalToman) : 'موجودی کافی نیست؛ تعداد را اصلاح یا کالا را حذف کنید.'}</p>
      <button type="button" data-cart-remove="${escape(line.slug)}">حذف ${escape(title)}</button></li>`;
  }).join('');
  return `<section lang="fa" dir="rtl" aria-labelledby="direct-cart-title"><h2 id="direct-cart-title">سبد خرید</h2>
    ${rows ? `<ul>${rows}</ul>` : '<p>سبد خرید خالی است.</p>'}
    <div aria-live="polite"><p>جمع بهای کالاها: <strong>${summary.valid ? money(summary.goodsTotalToman) : 'پس از اصلاح سبد مشخص می‌شود'}</strong></p></div>
    <p>روش ارسال: پس‌کرایه</p><p id="freight-notice">${escape(freightNotice)}</p>
    <p>امکان ارسال باید برای مقصد و کالای انتخاب‌شده بررسی شود. درج کالا در سبد، تضمین موجودی یا رزرو آن نیست.</p>
    <label><input type="checkbox" name="freightAccepted" value="1" aria-describedby="freight-notice"> پرداخت جداگانهٔ کرایه حمل را می‌پذیرم.</label>
    ${submissionPreview ? '<p>این فرم فقط سفارش را ثبت می‌کند؛ پرداخت اینترنتی فعال نیست.</p>' : `<p id="checkout-unavailable">پرداخت اینترنتی هنوز فعال نیست؛ در این صفحه سفارشی ثبت نمی‌شود.</p>
    <button type="button" disabled aria-describedby="checkout-unavailable">ادامه و پرداخت بهای کالا</button>`}</section>`;
}

/** A consent payload, never a trusted quote. Server must reprice under locks.
 * Persist the idempotency key only for retries of this exact accepted payload.
 */
export function directCheckoutPayload(items, catalog, { key, freightAccepted } = {}) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) throw new Error('invalid_request_identity');
  if (freightAccepted !== true) throw new Error('checkout_consent_required');
  const summary = summarizeCart(items, catalog);
  if (!summary.valid) throw new Error('invalid_cart');
  return { key, items: summary.requestItems, acceptedGoodsToman: summary.goodsTotalToman, freightAccepted: true };
}
