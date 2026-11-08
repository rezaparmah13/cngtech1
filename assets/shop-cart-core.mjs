/** UI-only cart. The server must independently reprice, lock and reserve before payment. */
const MAX_TOTAL = 1_000_000_000_000;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const validSlug = value => typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const freightNotice = 'کرایه حمل جداگانه و بر عهده خریدار است و هنگام تحویل به شرکت حمل پرداخت می‌شود.';

export function availableQuantity(product) {
  if (!product || product.approvedForSale !== true || product.priceMode !== 'real'
    || !integer(product.priceToman, 1, 100_000_000_000)
    || !integer(product.stock, 0, 4_294_967_295)
    || !integer(product.reserved, 0, product.stock)
    || !integer(product.revision, 1, Number.MAX_SAFE_INTEGER)) return 0;
  return Math.min(10, product.stock - product.reserved);
}

function normalize(items) {
  if (!Array.isArray(items) || items.length > 50) throw new Error('invalid_cart');
  const seen = new Set();
  return items.map(item => {
    if (!item || !validSlug(item.slug) || !integer(item.quantity, 1, 10) || seen.has(item.slug)) throw new Error('invalid_cart_line');
    seen.add(item.slug);
    return { slug: item.slug, quantity: item.quantity };
  }).sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

export function setCartQuantity(items, slug, quantity, catalog) {
  const normalized = normalize(items);
  if (!validSlug(slug) || !integer(quantity, 0, 10)) throw new Error('invalid_quantity');
  // Removal is always allowed, even for a deleted or unavailable product.
  if (quantity === 0) return normalized.filter(item => item.slug !== slug);
  const product = Object.hasOwn(catalog, slug) ? catalog[slug] : null;
  if (quantity > availableQuantity(product)) throw new Error('product_unavailable');
  return normalize([...normalized.filter(item => item.slug !== slug), { slug, quantity }]);
}

export function summarizeCart(items, catalog, { paymentConfigured = false } = {}) {
  const normalized = normalize(items);
  let total = 0;
  const lines = normalized.map(item => {
    const product = Object.hasOwn(catalog, item.slug) ? catalog[item.slug] : null;
    const available = availableQuantity(product);
    const valid = available >= item.quantity;
    const lineTotalToman = valid ? product.priceToman * item.quantity : null;
    if (valid) {
      if (total > MAX_TOTAL - lineTotalToman) throw new Error('total_too_large');
      total += lineTotalToman;
    }
    return { ...item, available, valid, lineTotalToman };
  });
  const valid = lines.length > 0 && lines.every(line => line.valid);
  return {
    lines, valid, goodsTotalToman: valid ? total : null,
    payableToman: valid ? total : null,
    shippingMode: 'collect_on_delivery', shippingToman: null, freightNotice,
    canCheckout: valid && paymentConfigured === true,
    // Only IDs and quantities are sent; amounts and availability are never authoritative.
    requestItems: normalized,
  };
}
