// Read-only: lists Arcade categories (categories/list). Creates nothing.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/list-categories.js [--json]
const API = 'https://platform.arcade.ai/v1/categories/list';

(async () => {
  const key = process.env.ARCADE_API_KEY || '';
  if (!key.startsWith('arcade_sk_live_')) {
    console.error('ARCADE_API_KEY missing or not an arcade_sk_live_ key');
    process.exit(2);
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': process.env.ARCADE_USER_AGENT || 'dynamicshop-demo/1.0',
    },
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  if (process.argv.includes('--json')) return console.log(JSON.stringify(data, null, 2));
  for (const c of data.items || []) {
    console.log([c.categoryId, c.world, c.category || '-', c.name].join('\t'));
  }
  console.log(`\n${(data.items || []).length} categories` + (data.nextCursor ? ' (more pages: nextCursor present)' : ''));
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
