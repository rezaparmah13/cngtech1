import { availableQuantity } from './shop-cart-core.mjs';

export const selectionStorageKey = 'cngtech-product-selection-v1';

/** Legacy selection is untrusted intent, never a quote or reservation. */
export function reconcileSelection(raw, catalog) {
  const items = [];
  let changed = 0;
  if (raw === null) return { items, changed, invalid: false };
  try {
    if (typeof raw !== 'string' || raw.length > 32768) throw new Error();
    const saved = JSON.parse(raw);
    if (!saved || Array.isArray(saved) || typeof saved !== 'object' || Object.keys(saved).length > 200) throw new Error();
    for (const [slug, requested] of Object.entries(saved)) {
      if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        || !Number.isInteger(requested) || requested < 1 || requested > 99) { changed++; continue; }
      const available = Object.hasOwn(catalog, slug) ? availableQuantity(catalog[slug]) : 0;
      if (!available || items.length >= 50) { changed++; continue; }
      const quantity = Math.min(requested, available);
      if (quantity !== requested) changed++;
      items.push({ slug, quantity });
    }
    return { items, changed, invalid: false };
  } catch { return { items: [], changed: 0, invalid: true }; }
}
