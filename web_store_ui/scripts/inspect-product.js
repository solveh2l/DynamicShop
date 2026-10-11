// READ-ONLY. Shows what Arcade really returns for price/image on one of YOUR EXISTING products
// (products/list + products/get). Creates nothing. Signed URLs are printed without their query string.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/inspect-product.js
const { arcadeCall, formatPrice, productImageUrl } = require('../src/arcade-engine');

const bare = (u) => {
  try {
    const x = new URL(u);
    return x.origin + x.pathname;
  } catch {
    return u ? '(unparseable)' : '(none)';
  }
};

(async () => {
  const list = await arcadeCall('products/list', { limit: 5 });
  const items = list.items || [];
  console.log(`products/list: ${items.length} product(s) on this account`);
  if (!items.length) return console.log('Nothing to inspect yet. Generate one first (needs your go-ahead).');

  for (const item of items.slice(0, 3)) {
    const p = await arcadeCall('products/get', { productId: item.productId, quantity: 1 });
    console.log('\n---', p.title);
    console.log('  category      :', p.categoryId);
    console.log('  maker         :', p.maker && p.maker.name);
    console.log('  selection     :', p.selectionLabel);
    console.log('  unitPrice raw :', JSON.stringify(p.unitPrice));
    console.log('  formatted     :', formatPrice(p.unitPrice));
    console.log('  volumeDiscount:', JSON.stringify(p.volumeDiscounts));
    console.log('  images        :', (p.images || []).length, '| primary:', bare(productImageUrl(p)));
    console.log('  keys          :', Object.keys(p).join(', '));
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
