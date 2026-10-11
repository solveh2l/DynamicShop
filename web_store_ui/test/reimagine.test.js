// Cache-overwrite + Re-imagine behaviour. Arcade is fully stubbed (global fetch): no real calls, no spend.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DS_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-reimagine-'));
process.env.ARCADE_API_KEY = 'arcade_sk_live_TESTSECRET123';

const engine = require('../src/arcade-engine');
const { createAppServer } = require('../server');
const { CATALOG, buildAd } = require('../src/catalog');

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const imagesDir = engine.IMAGES_DIR;
const cacheFile = path.join(engine.CACHE_DIR, 'arcade-cache.json');
const readCache = () => JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// ---- Arcade stub -------------------------------------------------------------------------------
let n = 0;
let calls = [];
let failAt = null; // procedure name to fail, or 'image' to fail the image download
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://platform.arcade.ai/v1/')) {
    calls.push('image');
    if (failAt === 'image') return new Response('nope', { status: 500 });
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  }
  const proc = u.replace('https://platform.arcade.ai/v1/', '');
  calls.push(proc);
  assert.match(opts.headers.Authorization, /^Bearer arcade_sk_live_/);
  if (failAt === proc) return new Response(JSON.stringify({ code: 'BOOM', message: 'stub failure' }), { status: 500 });
  const json = (o) => new Response(JSON.stringify(o), { status: 200 });
  switch (proc) {
    case 'categories/list':
      return json({ items: ['Scarves', 'Ribbon Scarf', 'Pocket Squares', 'Dangle Earrings'].map((name) => ({ categoryId: `cat-${name}`, name, world: 'print', imageUrl: null })) });
    case 'patterns/create':
      return json({ jobId: 'job-1', kind: 'pattern', status: 'running', result: null, error: null });
    case 'jobs/get':
      if (failAt === 'job-failed') return json({ status: 'failed', result: null, error: { message: 'No maker can price this' } });
      n += 1;
      return json({ status: 'succeeded', result: { patternId: `pat-${n}`, productId: `prod-${n}` }, error: null });
    case 'products/get':
      return json({ title: `Scarf ${n}`, unitPrice: { amount: `${10 + n}.50`, currency: 'USD' }, images: [{ url: `https://img.test/${n}.png` }], imageUrl: 'https://img.test/thumb.png' });
    case 'checkouts/create':
      return json({ checkoutId: '123', checkoutUrl: `https://checkout.arcade.ai/pay/${n}` });
    default:
      return new Response('{}', { status: 404 });
  }
};
test.after(() => { global.fetch = realFetch; });

const overcoat = CATALOG[0];
const ad = buildAd(overcoat);
const request = { prompt: ad.prompt, category: ad.category, productName: overcoat.adName };
const files = () => fs.readdirSync(imagesDir).sort();
const reset = () => { calls = []; failAt = null; };

test('first generation caches image + price (read from products.get unitPrice) and counts version 1', async () => {
  reset();
  const e = await engine.generateReal(request, { withCheckout: true });
  assert.strictEqual(e.price, '$11.50');
  assert.strictEqual(e.version, 1);
  assert.strictEqual(e.fixture, false);
  assert.match(e.checkoutInfo.checkoutUrl, /^https:\/\/checkout\.arcade\.ai\//);
  assert.deepStrictEqual(files(), [path.basename(e.imageUrl)]);
  assert.strictEqual(engine.getCached(ad.prompt).productId, 'prod-1');
});

test('Re-imagine (generate again) OVERWRITES the cached item and deletes the previous image', async () => {
  reset();
  const before = engine.getCached(ad.prompt);
  const e = await engine.generateReal(request);
  assert.strictEqual(e.version, 2);
  assert.notStrictEqual(e.productId, before.productId);
  assert.notStrictEqual(e.imageUrl, before.imageUrl, 'new unique file name so browsers never show a stale image');
  assert.strictEqual(e.checkoutInfo, null, 'new product has no checkout yet (created on click)');
  const cache = readCache();
  assert.strictEqual(Object.keys(cache).length, 1, 'one entry per product, not one per attempt');
  assert.strictEqual(cache[engine.promptHash(ad.prompt)].productId, e.productId);
  assert.deepStrictEqual(files(), [path.basename(e.imageUrl)], 'old image file removed, only the new one remains');
});

test('a failed generation leaves the previous item and image untouched', async () => {
  const before = engine.getCached(ad.prompt);
  const filesBefore = files();
  for (const mode of ['job-failed', 'image', 'products/get', 'patterns/create']) {
    reset();
    failAt = mode;
    await assert.rejects(() => engine.generateReal(request), undefined, mode);
    assert.deepStrictEqual(engine.getCached(ad.prompt), before, `cache unchanged after ${mode} failure`);
    assert.deepStrictEqual(files(), filesBefore, `no orphan image after ${mode} failure`);
  }
});

test('a failed job surfaces Arcade\'s own message', async () => {
  reset();
  failAt = 'job-failed';
  await assert.rejects(() => engine.generateReal(request), /No maker can price this/);
});

test('if the checkout step fails the new image is removed and the old item is kept', async () => {
  reset();
  const before = engine.getCached(ad.prompt);
  const filesBefore = files();
  failAt = 'checkouts/create';
  await assert.rejects(() => engine.generateReal(request, { withCheckout: true }));
  assert.deepStrictEqual(engine.getCached(ad.prompt), before);
  assert.deepStrictEqual(files(), filesBefore);
});

test('addCheckout is lazy and idempotent (second call makes no Arcade request)', async () => {
  reset();
  const a = await engine.addCheckout(ad.prompt);
  assert.match(a.checkoutInfo.checkoutUrl, /^https:\/\/checkout\.arcade\.ai\//);
  assert.deepStrictEqual(calls, ['checkouts/create']);
  reset();
  const b = await engine.addCheckout(ad.prompt);
  assert.strictEqual(b.checkoutInfo.checkoutUrl, a.checkoutInfo.checkoutUrl);
  assert.deepStrictEqual(calls, [], 'no network on the second call');
});

test('checkouts/create is sent with dropShip and a unique requestId', async () => {
  reset();
  const bodies = [];
  const inner = global.fetch;
  global.fetch = async (u, o) => { if (String(u).endsWith('checkouts/create')) bodies.push(JSON.parse(o.body)); return inner(u, o); };
  const entry = engine.getCached(ad.prompt);
  entry.checkoutInfo = null;
  engine.saveCached(ad.prompt, entry);
  await engine.addCheckout(ad.prompt);
  global.fetch = inner;
  assert.strictEqual(bodies.length, 1);
  assert.strictEqual(bodies[0].dropShip, true);
  assert.deepStrictEqual(bodies[0].lines, [{ productId: entry.productId, quantity: 1 }]);
  assert.ok(bodies[0].requestId && bodies[0].requestId.length > 8);
});

// ---- HTTP layer (Re-imagine + checkout endpoints) ----------------------------------------------
function makeServer(deps) {
  const server = createAppServer(deps);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}
function call(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return null; } })(), text: t }); });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollStatus(port, id) {
  for (let i = 0; i < 100; i++) {
    const s = await call(port, 'GET', `/api/reimagine/status?id=${id}`);
    if (s.json.state !== 'running') return s.json;
    await wait(20);
  }
  throw new Error('job never finished');
}

test('POST /api/reimagine runs the workflow and returns the new cached item', async () => {
  let seenAd;
  const { server, port } = await makeServer({
    hasKey: () => true,
    generate: async (a, { onProgress }) => { seenAd = a; onProgress('Designing…'); return { productName: 'New', imageUrl: '/cache/images/new.png', price: '$1.00', version: 3, productId: 'p' }; },
  });
  try {
    const start = await call(port, 'POST', '/api/reimagine', { slug: overcoat.slug });
    assert.strictEqual(start.status, 202);
    const done = await pollStatus(port, start.json.jobId);
    assert.strictEqual(done.state, 'done');
    assert.strictEqual(done.entry.version, 3);
    assert.deepStrictEqual(done.viralSources, ad.viralSources);
    // it rebuilt the SAME prompt/category the page uses, so the result lands on the same cache key
    assert.strictEqual(seenAd.prompt, ad.prompt);
    assert.strictEqual(seenAd.category, 'Scarves');
  } finally { server.close(); }
});

test('a failed Re-imagine reports the error and never leaks the API key', async () => {
  const { server, port } = await makeServer({
    hasKey: () => true,
    generate: async () => { throw new Error(`boom with ${process.env.ARCADE_API_KEY} inside`); },
  });
  try {
    const start = await call(port, 'POST', '/api/reimagine', { slug: overcoat.slug });
    const done = await pollStatus(port, start.json.jobId);
    assert.strictEqual(done.state, 'error');
    assert.doesNotMatch(JSON.stringify(done), /TESTSECRET123/);
    assert.match(done.error, /boom/);
  } finally { server.close(); }
});

test('only one generation at a time: same product joins, a different product gets 409', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { server, port } = await makeServer({ hasKey: () => true, generate: async () => { await gate; return { imageUrl: '/cache/images/x.png' }; } });
  try {
    const a = await call(port, 'POST', '/api/reimagine', { slug: CATALOG[0].slug });
    assert.strictEqual(a.status, 202);
    const again = await call(port, 'POST', '/api/reimagine', { slug: CATALOG[0].slug });
    assert.strictEqual(again.status, 202);
    assert.strictEqual(again.json.jobId, a.json.jobId, 'double-click joins the running job (no second Arcade spend)');
    const other = await call(port, 'POST', '/api/reimagine', { slug: CATALOG[1].slug });
    assert.strictEqual(other.status, 409);
    release();
    await pollStatus(port, a.json.jobId);
    const after = await call(port, 'POST', '/api/reimagine', { slug: CATALOG[1].slug });
    assert.strictEqual(after.status, 202, 'free again once the first job finished');
    await pollStatus(port, after.json.jobId);
  } finally { release(); server.close(); }
});

test('spending endpoints reject cross-origin, wrong content-type, and foreign Host requests', async () => {
  let generated = 0;
  const { server, port } = await makeServer({ hasKey: () => true, generate: async () => { generated++; return {}; }, addCheckout: async () => { generated++; } });
  try {
    for (const p of ['/api/reimagine', '/api/checkout']) {
      const evil = await call(port, 'POST', p, { slug: overcoat.slug }, { Origin: 'https://evil.example' });
      assert.strictEqual(evil.status, 403, `${p} foreign origin`);
      const form = await call(port, 'POST', p, 'slug=x', { 'Content-Type': 'text/plain' });
      assert.strictEqual(form.status, 403, `${p} text/plain (CORS-simple) request`);
      const rebind = await call(port, 'POST', p, { slug: overcoat.slug }, { Host: 'attacker.example' });
      assert.strictEqual(rebind.status, 403, `${p} DNS-rebinding host`);
    }
    assert.strictEqual(generated, 0, 'nothing was spent');
  } finally { server.close(); }
});

test('PUBLIC_HOST: Re-imagine and checkout accept the public host, still reject others', async () => {
  process.env.PUBLIC_HOST = 'public.example';
  let generated = 0;
  const { server, port } = await makeServer({ hasKey: () => true, generate: async () => { generated++; return {}; }, addCheckout: async () => { generated++; } });
  try {
    const ok = await call(port, 'POST', '/api/reimagine', { slug: overcoat.slug }, { Host: 'public.example' });
    assert.strictEqual(ok.status, 202, 'reimagine on public host');
    await pollStatus(port, ok.json.jobId);
    const bad = await call(port, 'POST', '/api/reimagine', { slug: overcoat.slug }, { Host: 'attacker.example' });
    assert.strictEqual(bad.status, 403, 'reimagine on foreign host');
  } finally { delete process.env.PUBLIC_HOST; server.close(); }
});

test('reimagine: unknown product 404, missing key 503 with guidance', async () => {
  const { server, port } = await makeServer({ hasKey: () => false, generate: async () => ({}) });
  try {
    assert.strictEqual((await call(port, 'POST', '/api/reimagine', { slug: 'nope' })).status, 404);
    const r = await call(port, 'POST', '/api/reimagine', { slug: overcoat.slug });
    assert.strictEqual(r.status, 503);
    assert.match(r.json.message, /ARCADE_API_KEY/);
  } finally { server.close(); }
});

test('POST /api/checkout: returns the cached link, creates one lazily, refuses fixtures', async () => {
  let created = 0;
  const { server, port } = await makeServer({
    hasKey: () => true,
    addCheckout: async (prompt) => {
      created++;
      const e = engine.getCached(prompt);
      e.checkoutInfo = { checkoutId: '9', checkoutUrl: 'https://checkout.arcade.ai/pay/lazy' };
      engine.saveCached(prompt, e);
      return e;
    },
  });
  try {
    const p = ad.prompt;
    const base = engine.getCached(p);
    // 1) real entry with a checkout already -> served from cache, nothing created
    engine.saveCached(p, { ...base, checkoutInfo: { checkoutId: '1', checkoutUrl: 'https://checkout.arcade.ai/pay/cached' } });
    let r = await call(port, 'POST', '/api/checkout', { slug: overcoat.slug });
    assert.strictEqual(r.json.checkoutUrl, 'https://checkout.arcade.ai/pay/cached');
    assert.strictEqual(created, 0);
    // 2) real entry without checkout -> created once on demand
    engine.saveCached(p, { ...base, checkoutInfo: null });
    r = await call(port, 'POST', '/api/checkout', { slug: overcoat.slug });
    assert.strictEqual(r.json.checkoutUrl, 'https://checkout.arcade.ai/pay/lazy');
    r = await call(port, 'POST', '/api/checkout', { slug: overcoat.slug });
    assert.strictEqual(created, 1, 'second click reuses the link');
    // 3) fixture -> refused
    engine.saveCached(p, { ...base, fixture: true, productId: undefined, checkoutInfo: null });
    r = await call(port, 'POST', '/api/checkout', { slug: overcoat.slug });
    assert.strictEqual(r.status, 409);
    // 4) unknown product / no cache
    assert.strictEqual((await call(port, 'POST', '/api/checkout', { slug: 'nope' })).status, 404);
  } finally { server.close(); }
});
