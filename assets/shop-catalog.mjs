import { bindSessionSignal, validateSessionSignal } from './shop-session.mjs';

const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const id = value => typeof value === 'string' && value.length <= 80 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?![\s\S])/.test(value);

/** A display snapshot, never permission to charge or proof of current availability. */
export function parseShopCatalog(payload) {
  if (!exact(payload, ['version', 'catalog', 'destinations', 'paymentEnabled']) || payload.version !== 1
    || payload.paymentEnabled !== false || !record(payload.catalog) || !record(payload.destinations)
    || Object.keys(payload.catalog).length > 200 || Object.keys(payload.destinations).length > 100) throw new Error('invalid_shop_catalog');
  const catalog = Object.create(null); const destinations = Object.create(null);
  for (const [slug, product] of Object.entries(payload.catalog)) {
    const categoryKeys = Object.hasOwn(product ?? {}, 'categorySlug') || Object.hasOwn(product ?? {}, 'categoryTitle');
    if (categoryKeys && !((product.categorySlug === null && product.categoryTitle === null)
      || (typeof product.categorySlug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.categorySlug)
        && product.categorySlug.length <= 100 && typeof product.categoryTitle === 'string' && product.categoryTitle.length <= 255))) throw new Error('invalid_shop_catalog');
    if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/.test(slug)
      || !exact(product, ['title', 'approvedForSale', 'priceMode', 'priceToman', 'stock', 'reserved', 'revision', ...(categoryKeys ? ['categorySlug', 'categoryTitle'] : [])])
      || typeof product.title !== 'string' || product.title.length > 510
      || typeof product.approvedForSale !== 'boolean' || product.priceMode !== 'real'
      || !(product.priceToman === null || integer(product.priceToman, 100_000_000_000))
      || !(product.stock === null || integer(product.stock, 4_294_967_295))
      || !integer(product.reserved, product.stock ?? 0) || !integer(product.revision, Number.MAX_SAFE_INTEGER)) throw new Error('invalid_shop_catalog');
    catalog[slug] = { ...product };
  }
  let cityCount = 0;
  for (const [province, cities] of Object.entries(payload.destinations)) {
    if (!id(province) || !Array.isArray(cities) || !cities.every(id) || new Set(cities).size !== cities.length
      || (cityCount += cities.length) > 2000) throw new Error('invalid_shop_catalog');
    destinations[province] = [...cities];
  }
  return { catalog, destinations };
}

/** Authenticated, same-origin and CSRF-protected read; no client-supplied prices or scope. */
export function createShopCatalog({ endpoint, origin, csrf, fetchImpl = globalThis.fetch, sessionSignal } = {}) {
  validateSessionSignal(sessionSignal);
  let url;
  try {
    const base = new URL(origin); url = new URL(endpoint, base);
    if (typeof origin !== 'string' || typeof endpoint !== 'string' || !endpoint
      || base.protocol !== 'https:' || base.username || base.password || url.origin !== base.origin
      || url.username || url.password || url.hash || url.search || typeof fetchImpl !== 'function'
      || typeof csrf !== 'string' || !/^[a-zA-Z0-9_-]{16,256}(?![\s\S])/.test(csrf)) throw new Error();
  } catch { throw new Error('invalid_catalog_config'); }
  let disposed = false; let pending = false; let unbind = () => {};
  const client = {
    async load() {
      if (disposed || pending) throw new Error('catalog_unavailable');
      pending = true;
      try {
        const response = await fetchImpl(url.href, {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ action: 'catalog', csrf }).toString(),
        });
        if (disposed || response.status !== 200 || response.redirected
          || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('Content-Type') ?? '')) throw new Error();
        const payload = await response.json();
        if (disposed) throw new Error();
        return parseShopCatalog(payload);
      } catch { throw new Error('catalog_unavailable'); }
      finally { pending = false; }
    },
    dispose() { disposed = true; unbind(); },
  };
  unbind = bindSessionSignal(sessionSignal, client.dispose);
  return client;
}
