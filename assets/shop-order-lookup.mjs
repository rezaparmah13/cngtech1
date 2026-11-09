// Internal read-only lookup. No persistence, order creation, or payment actions.
export function parseOrderSnapshot(payload, reference) {
  const order = payload?.order;
  const fields = ['reference', 'status', 'goodsTotalToman', 'shippingMode', 'shippingToman', 'payableToman', 'paymentEnabled'];
  if (payload?.version !== 1 || !order || Array.isArray(order)
    || Object.keys(order).length !== fields.length || fields.some(key => !Object.hasOwn(order, key))
    || order.reference !== reference || !/^[a-f0-9]{32}$/.test(reference)
    || typeof order.status !== 'string' || !/^[a-z_]{1,50}$/.test(order.status)
    || !['collect_on_delivery', 'quoted'].includes(order.shippingMode) || order.paymentEnabled !== false) throw new Error('invalid_order_snapshot');
  const amount = (value, nullable = false) => {
    if (nullable && value === null) return null;
    if (typeof value === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(value)) value = Number(value);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_order_snapshot');
    return value;
  };
  const result = { reference, status: order.status, shippingMode: order.shippingMode,
    goodsTotalToman: amount(order.goodsTotalToman), shippingToman: amount(order.shippingToman, true),
    payableToman: amount(order.payableToman, true), paymentEnabled: false };
  if (result.shippingMode === 'collect_on_delivery' && (result.shippingToman !== null || result.payableToman !== result.goodsTotalToman)) throw new Error('invalid_order_snapshot');
  return result;
}

export function orderSnapshotText(order) {
  const labels = { awaiting_review: 'در انتظار بررسی', awaiting_customer_confirmation: 'در انتظار تأیید مشتری', awaiting_payment: 'در انتظار پرداخت', payment_uncertain: 'نتیجه پرداخت نامشخص؛ نیازمند پیگیری', cancelled: 'لغوشده' };
  const money = value => value === null ? 'تعیین نشده' : `${value.toLocaleString('fa-IR')} تومان`;
  return `وضعیت ثبت‌شده در سرور: ${labels[order.status] ?? 'نیازمند پیگیری از پشتیبانی'}. مبلغ کالاها: ${money(order.goodsTotalToman)}. کرایه: ${order.shippingMode === 'collect_on_delivery' ? 'پس‌کرایه؛ جدا از کالاها و قابل پرداخت هنگام تحویل' : money(order.shippingToman)}. مبلغ ثبت‌شده سفارش: ${money(order.payableToman)}. این اطلاعات فقط وضعیت لحظه دریافت است؛ اعتبار رزرو یا موفقیت پرداخت را تضمین نمی‌کند. پرداخت آنلاین در این پیش‌نمایش فعال نیست.`;
}

export function createOrderLookup({ endpoint, origin, csrf, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const base = new URL(origin); const url = new URL(endpoint, base);
  if (base.protocol !== 'https:' || url.protocol !== 'https:' || base.origin !== url.origin || url.username || url.password || url.search || url.hash || typeof endpoint !== 'string' || !endpoint || typeof csrf !== 'string' || !csrf || typeof fetchImpl !== 'function') throw new Error('invalid_lookup_config');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('invalid_lookup_config');
  let pending = false; let disposed = false; let cancel = null;
  return {
    async lookup(reference) {
      if (disposed || pending) throw new Error('lookup_unavailable');
      if (typeof reference !== 'string' || !/^[a-f0-9]{32}$/.test(reference)) throw new Error('invalid_order_reference');
      pending = true;
      const controller = new AbortController();
      let timer;
      const cancelled = new Promise((_, reject) => {
        cancel = () => { reject(new Error('lookup_unavailable')); controller.abort(); };
        timer = setTimeout(cancel, timeoutMs);
      });
      try {
        const operation = async () => {
        const response = await fetchImpl(url.href, { signal: controller.signal, method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ action: 'lookup', csrf, reference }).toString() });
        if (disposed || response.status !== 200 || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('Content-Type') ?? '')) throw new Error('lookup_unavailable');
        const payload = await response.json();
        if (disposed) throw new Error('lookup_unavailable');
        return parseOrderSnapshot(payload, reference);
        };
        return await Promise.race([operation(), cancelled]);
      } catch { throw new Error('lookup_unavailable'); }
      finally { clearTimeout(timer); cancel = null; pending = false; }
    },
    dispose() { disposed = true; cancel?.(); },
  };
}
