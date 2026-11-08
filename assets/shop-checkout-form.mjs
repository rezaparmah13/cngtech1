import { directCheckoutPayload } from './shop-cart-view.mjs';

const fields = ['name', 'mobile', 'provinceId', 'cityId', 'postalCode', 'address'];
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const validId = value => typeof value === 'string' && value.length <= 80 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
function validateDestinations(destinations) {
  if (!destinations || Array.isArray(destinations) || typeof destinations !== 'object') throw new Error('invalid_destinations');
  for (const [province, cities] of Object.entries(destinations)) {
    if (!validId(province) || !Array.isArray(cities) || cities.some(city => !validId(city))) throw new Error('invalid_destinations');
  }
}
const digits = value => value.replace(/[۰-۹٠-٩]/g, char => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(char) % 10));

/** UX validation only. Server configuration and validation remain authoritative. No storage. */
export function normalizeRecipient(input, destinations = {}) {
  validateDestinations(destinations);
  if (!input || Object.keys(input).length !== fields.length || fields.some(key => !Object.hasOwn(input, key))) throw new Error('invalid_recipient_fields');
  const recipient = {};
  for (const key of fields) {
    const value = input[key];
    if (typeof value !== 'string' || new TextEncoder().encode(value).length > 4000 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error('invalid_recipient');
    recipient[key] = value.trim();
  }
  recipient.mobile = digits(recipient.mobile);
  recipient.postalCode = digits(recipient.postalCode);
  if (!/^09[0-9]{9}$/.test(recipient.mobile) || !/^[0-9]{10}$/.test(recipient.postalCode) || /^([0-9])\1{9}$/.test(recipient.postalCode)) throw new Error('invalid_recipient_digits');
  for (const [key, min, max] of [['name', 2, 100], ['address', 10, 1000]]) {
    const length = [...recipient[key]].length;
    if (length < min || length > max || /[<>]/.test(recipient[key])) throw new Error('invalid_recipient_text');
  }
  if (!validId(recipient.provinceId) || !validId(recipient.cityId) || !Object.hasOwn(destinations, recipient.provinceId) || !destinations[recipient.provinceId].includes(recipient.cityId)) throw new Error('shipping_destination_unavailable');
  return recipient;
}

/** Fields only: no form action, implicit GET submission, customer prefill or public installation.
 * Caller must re-render city choices after province changes; never retain the previous city silently.
 */
export function renderRecipientFields(destinations = {}, provinceId = '') {
  validateDestinations(destinations);
  const options = (values, selected = '') => '<option value="">انتخاب کنید</option>' + values.map(value => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(value)}</option>`).join('');
  const cities = Object.hasOwn(destinations, provinceId) ? destinations[provinceId] : [];
  return `<fieldset lang="fa" dir="rtl"><legend>اطلاعات گیرنده</legend>
    <label>نام گیرنده <input name="recipient[name]" autocomplete="name" minlength="2" maxlength="100" required></label>
    <label>تلفن همراه <input name="recipient[mobile]" type="tel" autocomplete="tel" inputmode="tel" maxlength="11" required></label>
    <label>استان <select name="recipient[provinceId]" required>${options(Object.keys(destinations), provinceId)}</select></label>
    <label>شهر <select name="recipient[cityId]" required${cities.length ? '' : ' disabled'}>${options(cities)}</select></label>
    <label>کد پستی <input name="recipient[postalCode]" autocomplete="postal-code" inputmode="numeric" maxlength="10" required></label>
    <label>نشانی کامل (در یک خط) <input name="recipient[address]" autocomplete="street-address" minlength="10" maxlength="1000" required></label>
    <p>کرایه حمل جداگانه هنگام تحویل پرداخت می‌شود. انتخاب مقصد به‌تنهایی تضمین ارسال نیست.</p>
    ${Object.keys(destinations).length ? '' : '<p role="status">هنوز مقصد مجازی برای ارسال تنظیم نشده است.</p>'}
  </fieldset>`;
}

/** URL-encoded body matching DirectCheckoutRequest; does not send a request or initiate payment.
 * Reuse a key only for retries of this exact payload; never log/store the returned body.
 */
export function encodeDirectCheckout(items, catalog, { key, csrf, freightAccepted, recipient, destinations = {} } = {}) {
  if (typeof csrf !== 'string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(csrf)) throw new Error('invalid_csrf');
  const consent = directCheckoutPayload(items, catalog, { key, freightAccepted });
  const clean = normalizeRecipient(recipient, destinations);
  const body = new URLSearchParams({ action: 'checkout', csrf, requestKey: consent.key, acceptedGoodsToman: String(consent.acceptedGoodsToman), freightAccepted: '1' });
  consent.items.forEach((item, index) => {
    body.append(`items[${index}][slug]`, item.slug);
    body.append(`items[${index}][quantity]`, String(item.quantity));
  });
  for (const field of fields) body.append(`recipient[${field}]`, clean[field]);
  if (new TextEncoder().encode(body.toString()).length > 32768) throw new Error('checkout_body_too_large');
  return body.toString();
}
