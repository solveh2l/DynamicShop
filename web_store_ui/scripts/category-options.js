// READ-ONLY. Shows a category's options (categories/get). Creates nothing.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/category-options.js "Dangle Earrings"
const { arcadeCall } = require('../src/arcade-engine');

(async () => {
  const name = process.argv[2];
  if (!name) return console.error('usage: node scripts/category-options.js "<category name>"');
  const list = await arcadeCall('categories/list', {});
  const cat = (list.items || []).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!cat) return console.error('no such category');
  const full = await arcadeCall('categories/get', { categoryId: cat.categoryId, selections: {} });
  console.log(`${full.name} (${full.world}) canManufacture=${full.canManufacture}`);
  console.log('default selections:', JSON.stringify(full.selections));
  for (const o of full.options) {
    console.log(`\n${o.label} [${o.key}]`);
    for (const v of o.values) console.log(`   ${v.isDefault ? '*' : ' '} ${v.available ? 'ok ' : 'n/a'} ${v.value}  (${v.label})`);
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
