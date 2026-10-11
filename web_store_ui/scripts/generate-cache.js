// Generates one Arcade item per FancyPants product and caches it (image + checkout link).
// DRY RUN by default. Real runs create REAL objects in the human's Arcade account.
//
//   node scripts/generate-cache.js                        dry run: show category + prompt per product
//   node scripts/generate-cache.js --yes                  generate missing products (one at a time)
//   node scripts/generate-cache.js --yes --with-checkout  ...and create an UNPAID checkout for each
//   node scripts/generate-cache.js --yes --checkout-only  add checkouts to products already generated
//   flags: --only <slug>   --force (regenerate even if a real entry exists)
const { CATALOG, getProduct, buildAd } = require('../src/catalog');
const { getCached, generateReal, addCheckout } = require('../src/arcade-engine');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (only && !getProduct(only)) {
  console.error(`Unknown slug "${only}". Valid: ${CATALOG.map((p) => p.slug).join(', ')}`);
  process.exit(2);
}
const products = only ? [getProduct(only)] : CATALOG;

(async () => {
  let failed = 0;
  for (const product of products) {
    const ad = buildAd(product);
    const existing = getCached(ad.prompt);
    const real = existing && !existing.fixture;
    console.log(`\n=== ${product.name}  ->  ${ad.complementary} [${ad.category}, ${ad.kind}]`);

    if (!has('--yes')) {
      console.log(`  ${real ? 'cached (real)' : existing ? 'cached (fixture only)' : 'not cached'}`);
      console.log(`  prompt: ${ad.prompt}`);
      continue;
    }
    try {
      if (has('--checkout-only')) {
        if (!real) throw new Error('no real generated product yet; run without --checkout-only first');
        if (existing.checkoutInfo?.checkoutUrl && !has('--force')) {
          console.log('  checkout already exists (use --force to create another)');
          continue;
        }
        await addCheckout(ad.prompt);
        console.log('  checkout created');
        continue;
      }
      if (real && !has('--force')) {
        console.log('  real entry already cached, skipping (use --force to regenerate)');
        continue;
      }
      const entry = await generateReal(
        { prompt: ad.prompt, category: ad.category, productName: product.adName },
        { withCheckout: has('--with-checkout') }
      );
      console.log(`  done: price=${entry.price} image=${entry.imageUrl} checkout=${entry.checkoutInfo ? 'yes' : 'no'}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED: ${e.message}`);
    }
  }
  if (!has('--yes')) console.log('\nDry run only. Re-run with --yes to call Arcade (creates real patterns + products).');
  if (failed) process.exit(1);
})();
