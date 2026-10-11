const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the cache so tests never touch the real one.
process.env.DS_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-cache-'));

const { server } = require('../server');
const { CATALOG, buildAd } = require('../src/catalog');
const { saveCached } = require('../src/arcade-engine');

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + urlPath, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const signalFromHtml = (html) => ({
  productType: html.match(/data-product-type="([^"]*)"/)[1],
  attrs: html.match(/data-attrs="([^"]*)"/)[1].split(','),
});

test('/ redirects to the storefront', async () => {
  const r = await request('GET', '/');
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.location, '/store/index.html');
});

test('static assets are served', async () => {
  for (const p of ['/store/index.html', '/ds-ad.css', '/app.js', '/store/assets/08oxjlozb84i_.css']) {
    assert.strictEqual((await request('GET', p)).status, 200, p);
  }
});

test('path traversal is blocked', async () => {
  for (const p of ['/..%2fserver.js', '/store/..%2f..%2fserver.js', '/%2e%2e/server.js']) {
    const r = await request('GET', p);
    assert.ok(r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
    assert.doesNotMatch(r.body, /createServer/);
  }
});

test('landing page links to six distinct product pages, each of which exists', async () => {
  const html = (await request('GET', '/store/index.html')).body;
  const links = [...new Set(html.match(/href="\.\/products\/[^"]+\.html"/g))].map((l) => l.slice(8, -1));
  assert.strictEqual(links.length, 6);
  for (const l of links) assert.strictEqual((await request('GET', '/store/' + l.replace('./', ''))).status, 200, l);
  assert.doesNotMatch(html, /pdp\.html/);
});

for (const product of CATALOG) {
  test(`${product.slug}: own page, own content, ad slot, matching signal`, async () => {
    const r = await request('GET', `/store/products/${product.slug}.html`);
    assert.strictEqual(r.status, 200);
    assert.match(r.body, new RegExp(`<h1[^>]*>${product.name.replace(/[()]/g, '\\$&')}`));
    assert.strictEqual((r.body.match(/id="ad-slot"/g) || []).length, 1);
    assert.doesNotMatch(r.body, /Loading sponsored recommendation/);
    assert.match(r.body, /src="\/app\.js"/);
    assert.deepStrictEqual(signalFromHtml(r.body), { productType: product.productType, attrs: product.attrs });
    // every asset the page references locally must exist
    for (const m of r.body.matchAll(/(?:src|href)="(\.\.\/[^"#?]+)"/g)) {
      const status = (await request('GET', '/store/products/' + m[1])).status;
      assert.strictEqual(status, 200, `${product.slug} -> ${m[1]}`);
    }
  });
}

test('the page signal drives the right Arcade category for each product, end to end', async () => {
  const expected = {
    'noir-cashmere-overcoat': 'Scarves',
    'aurelia-leather-tote': 'Ribbon Scarf',
    'onyx-silk-blazer': 'Pocket Squares',
    'sovereign-loafers': 'Pocket Squares',
    'lumiere-leather-gloves': 'Scarves',
    'eclipse-evening-dress': 'Dangle Earrings',
  };
  const prompts = new Set();
  for (const product of CATALOG) {
    const html = (await request('GET', `/store/products/${product.slug}.html`)).body;
    const comp = JSON.parse((await request('POST', '/api/complementary', signalFromHtml(html))).body);
    const gen = JSON.parse((await request('POST', '/api/prompt', comp)).body);
    assert.strictEqual(gen.category, expected[product.slug], product.slug);
    assert.strictEqual(gen.prompt, buildAd(product).prompt, `${product.slug}: page prompt must equal the cached prompt`);
    prompts.add(gen.prompt);
  }
  assert.strictEqual(prompts.size, 6);
});

test('/api/arcade serves a cached entry (including its checkout link) and misses cleanly', async () => {
  const ad = buildAd(CATALOG[0]);
  const miss = await request('POST', '/api/arcade', { prompt: ad.prompt });
  assert.strictEqual(miss.status, 404);
  assert.strictEqual(JSON.parse(miss.body).error, 'cache_miss');

  saveCached(ad.prompt, {
    prompt: ad.prompt, productName: 't', imageUrl: '/cache/images/x.svg', fixture: false,
    checkoutInfo: { checkoutId: 'c1', checkoutUrl: 'https://example.com/pay' },
  });
  const hit = await request('POST', '/api/arcade', { prompt: ad.prompt });
  assert.strictEqual(hit.status, 200);
  assert.strictEqual(JSON.parse(hit.body).checkoutInfo.checkoutUrl, 'https://example.com/pay');
});
