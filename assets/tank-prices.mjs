const blocks = document.querySelectorAll('[data-tank-price]');
const labels = { available: 'موجود', unavailable: 'ناموجود', inquiry: 'استعلام تلفنی' };
if (blocks.length) {
  try {
    const response = await fetch('/api/tank-prices.php', { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Prices unavailable');
    const { products } = await response.json();
    for (const block of blocks) {
      const product = products?.[block.dataset.tankPrice];
      if (!product) continue;
      const price = product.priceToman;
      block.querySelector('[data-price]').textContent = Number.isSafeInteger(price) && price > 0 && price <= 1e12
        ? `قیمت: ${new Intl.NumberFormat('fa-IR').format(price)} تومان` : 'قیمت: تماس بگیرید';
      block.querySelector('[data-availability]').textContent = `موجودی: ${labels[product.availability] || labels.inquiry}`;
    }
  } catch {
    // Keep the telephone fallback; never substitute demo or cached prices.
  }
}
