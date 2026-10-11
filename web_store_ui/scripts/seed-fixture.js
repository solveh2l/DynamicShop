// Writes a placeholder image + cache entry per product, so the UI works without calling Arcade.
// Never overwrites a real (non-fixture) entry.
const fs = require('fs');
const path = require('path');
const { CATALOG, buildAd } = require('../src/catalog');
const { saveCached, getCached, promptHash, IMAGES_DIR, CACHE_DIR } = require('../src/arcade-engine');

fs.mkdirSync(IMAGES_DIR, { recursive: true });
const hues = ['#6b2a33', '#2a4a6b', '#4a6b2a', '#6b5a2a', '#5a2a6b', '#2a6b5a'];

CATALOG.forEach((product, i) => {
  const ad = buildAd(product);
  const existing = getCached(ad.prompt);
  if (existing && !existing.fixture) return console.log(`kept real entry: ${product.slug}`);

  const file = `fixture-${product.slug}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <rect width="600" height="600" fill="#1a1713"/>
  <g stroke="#c9a45c" stroke-width="12" opacity="0.7"><path d="M0 100H600M0 250H600M0 400H600M0 550H600"/></g>
  <g stroke="${hues[i % hues.length]}" stroke-width="14" opacity="0.9"><path d="M100 0V600M250 0V600M400 0V600M550 0V600"/></g>
  <text x="300" y="300" font-family="Georgia" font-size="30" fill="#fff" text-anchor="middle">FIXTURE</text>
  <text x="300" y="340" font-family="Georgia" font-size="22" fill="#d7a94f" text-anchor="middle">${ad.complementary}</text>
</svg>`;
  fs.writeFileSync(path.join(IMAGES_DIR, file), svg);
  saveCached(ad.prompt, {
    prompt: ad.prompt,
    productName: `${product.adName} (fixture)`,
    category: ad.category,
    imageUrl: `/cache/images/${file}`,
    unitPrice: null,
    price: null, // fixtures have no real Arcade price, so the ad shows none
    checkoutInfo: null,
    fixture: true,
    createdAt: new Date().toISOString(),
  });
  console.log(`seeded fixture: ${product.slug} -> ${ad.complementary}`);
});

// Drop FIXTURE entries whose prompt no longer belongs to any product (e.g. after a prompt edit).
// Real entries are never touched.
const cacheFile = path.join(CACHE_DIR, 'arcade-cache.json');
const live = new Set(CATALOG.map((p) => promptHash(buildAd(p).prompt)));
const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
for (const [key, entry] of Object.entries(cache)) {
  if (entry.fixture && !live.has(key)) {
    delete cache[key];
    console.log(`pruned stale fixture entry ${key.slice(0, 8)}`);
  }
}
fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
