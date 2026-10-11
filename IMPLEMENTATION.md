# DynamicShop — Implementation Steps

Step-by-step build guide for `web_store_ui/`. It is written so a smaller/cheaper agent can follow it literally.
Design reference: `PLANNING.md`. Where the two differ, **this file wins** (see "Changes vs PLANNING.md").

---

## 0. Rules for the implementing agent (read first)

1. Work **only** inside `/Users/jvk/Workspace/DynamicShop/web_store_ui/`. The one exception is the optional `.gitignore` edit in Phase 1.
2. **Zero npm dependencies.** Use Node's built-in `http`, `fs`, `path`, `crypto`, and global `fetch` (Node 18+). Do not run `npm install`. (The terminal sandbox blocks the network.)
3. **Never print, log, echo, or commit `ARCADE_API_KEY`.** Never `cat` a `.env` file.
4. **Never call the real Arcade API** except in Phase 4, and only after the human says yes. Phase 4 creates real objects in the human's Arcade account.
5. **Never pay for or automate a checkout.**
6. Create files exactly at the paths given. Copy the code blocks as written, then fix only what verification shows is broken.
7. After each phase, run that phase's **Verify** commands. If one fails, fix it before moving on. If you cannot fix it after 2 attempts, stop and tell the human what failed.
8. Do **not** edit `PLANNING.md`, `README.md`, or anything under `.agents/`.
9. Stop and ask the human when this file says **STOP**.

---

## Changes vs PLANNING.md

| Topic | PLANNING.md | This file (use this) |
|---|---|---|
| Server | Express | Plain Node `http`, no dependencies |
| Arcade chain | `categories/list` → `patterns/create` → `categories/get` → `products/create` → `products/get` → `checkouts/create` | **Shorter:** `categories/list` → `patterns/create` **with `categoryId`** (builds pattern + product in one job) → poll → `products/get` → (optional) `checkouts/create` |
| Price | "Mocked per product group" | Real `unitPrice` from `products/get` |
| Prompt style | "studio product photo, transparent background" | **Textile print description.** Arcade makes print patterns that are applied to a product. |
| Checkout | Pre-create one | **Opt-in** with `--with-checkout`. The "Instant Checkout" button stays a mock either way. |
| Dev without Arcade | not covered | `scripts/seed-fixture.js` writes a placeholder cache entry, so Phases 5–8 work before any real API call |

---

## Phase 0 — Preflight

Run in `/Users/jvk/Workspace/DynamicShop/web_store_ui`:

```bash
node --version
test -n "$ARCADE_API_KEY" && echo "key present" || echo "key MISSING"
```

**Verify:** Node is `v18` or higher. If lower, **STOP** and tell the human. A missing key is fine until Phase 4.

---

## Phase 1 — Scaffold

Create these directories:

```
web_store_ui/scripts
web_store_ui/public
web_store_ui/src
web_store_ui/mock
web_store_ui/test
web_store_ui/cache/images
```

### 1.1 `web_store_ui/package.json`

```json
{
  "name": "dynamicshop-web-store-ui",
  "version": "1.0.0",
  "private": true,
  "description": "Viral Vector Engine demo: mock store with a dynamically generated Arcade ad",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/",
    "seed": "node scripts/seed-fixture.js",
    "generate-cache": "node scripts/generate-cache.js"
  }
}
```

### 1.2 `web_store_ui/.env.example`

```
ARCADE_API_KEY=arcade_sk_live_replace_me
```

### 1.3 `web_store_ui/.gitignore`

```
.env
cache/
.arcade-api/
node_modules/
```

**Verify:** `ls -a web_store_ui` shows `package.json`, `.env.example`, `.gitignore`.

---

## Phase 2 — Demand Intelligence (no network)

### 2.1 `web_store_ui/src/mock_complementary_item.js`

```js
// Step 2a: input signal (product type + attrs) -> complementary item + style.
// Only three outputs are allowed: Scarf, Ribbon Scarf, Pocket Square.
const ALLOWED = ['Scarf', 'Ribbon Scarf', 'Pocket Square'];

const RULES = {
  jacket: { complementary: 'Scarf', style: 'oversized plaid mohair' },
  coat: { complementary: 'Ribbon Scarf', style: 'satin ribbon' },
  blazer: { complementary: 'Pocket Square', style: 'paisley silk' },
  shirt: { complementary: 'Pocket Square', style: 'paisley silk' },
};

function mockComplementaryItem({ productType, attrs = [] } = {}) {
  const key = String(productType || '').trim().toLowerCase();
  const rule = RULES[key] || RULES.jacket;
  if (!ALLOWED.includes(rule.complementary)) {
    throw new Error(`Disallowed complementary item: ${rule.complementary}`);
  }
  return {
    productType: key || 'jacket',
    attrs,
    complementary: rule.complementary,
    style: rule.style,
  };
}

module.exports = { mockComplementaryItem, ALLOWED };
```

### 2.2 `web_store_ui/mock/gemini-style.json`

The two Scarf `viralSources` strings are the real Google-search result the team found. The other two entries are placeholders.

```json
{
  "Scarf": {
    "viralSources": [
      "Lenny Kravitz's Gigantic Blanket Scarf (the ultimate internet meme)",
      "Acne Studios' Plaid Mohair Scarf (the ultimate TikTok fashion aesthetic)"
    ],
    "descriptors": [
      "oversized blanket-like plaid",
      "soft brushed mohair texture",
      "cozy statement piece"
    ],
    "palette": "deep charcoal, cream and muted burgundy"
  },
  "Ribbon Scarf": {
    "viralSources": [
      "Silk ribbon neck scarves (placeholder trend: the ultimate TikTok coquette accessory)"
    ],
    "descriptors": ["satin ribbon stripes", "soft sheen", "romantic bow styling"],
    "palette": "ivory, blush pink and black"
  },
  "Pocket Square": {
    "viralSources": [
      "Paisley silk pocket squares (placeholder trend: the ultimate old-money revival)"
    ],
    "descriptors": ["classic paisley", "fine silk twill", "rolled hem"],
    "palette": "navy, gold and burgundy"
  }
}
```

### 2.3 `web_store_ui/src/prompt_generator.js`

```js
// Step 2b: mock "Gemini call" -> viral aesthetic -> Arcade prompt.
// The prompt describes a TEXTILE PRINT (Arcade generates print patterns that are
// applied to a product). Do NOT mention brands/celebrities in the prompt.
const fs = require('fs');
const path = require('path');

const STYLE_FILE = path.join(__dirname, '..', 'mock', 'gemini-style.json');

function mockGeminiSearch(complementary) {
  const all = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8'));
  const entry = all[complementary];
  if (!entry) throw new Error(`No mock style data for: ${complementary}`);
  return entry;
}

function generatePrompt({ productType, attrs = [], complementary, style }) {
  const found = mockGeminiSearch(complementary);
  const context = [...attrs, productType].filter(Boolean).join(' ');
  const prompt =
    `Seamless repeating textile print for a ${complementary.toLowerCase()}: ` +
    `${style}, ${found.descriptors.join(', ')}. ` +
    `Color palette: ${found.palette}, chosen to complement a ${context}. ` +
    `High detail, rich woven texture, no text, no logos.`;
  return { prompt, viralSources: found.viralSources, descriptors: found.descriptors };
}

module.exports = { generatePrompt, mockGeminiSearch };
```

### 2.4 `web_store_ui/test/demand-intelligence.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const { mockComplementaryItem, ALLOWED } = require('../src/mock_complementary_item');
const { generatePrompt } = require('../src/prompt_generator');

test('jacket maps to Scarf', () => {
  const r = mockComplementaryItem({ productType: 'jacket', attrs: ['black', 'wool', 'womens'] });
  assert.strictEqual(r.complementary, 'Scarf');
});

test('every rule output is one of the three allowed items', () => {
  for (const t of ['jacket', 'coat', 'shirt', 'blazer', 'unknown-thing']) {
    assert.ok(ALLOWED.includes(mockComplementaryItem({ productType: t }).complementary));
  }
});

test('prompt mentions the item, style and jacket context, and no brand names', () => {
  const c = mockComplementaryItem({ productType: 'jacket', attrs: ['black', 'wool', 'womens'] });
  const { prompt, viralSources } = generatePrompt(c);
  assert.match(prompt, /scarf/i);
  assert.match(prompt, /plaid/i);
  assert.match(prompt, /black wool womens jacket/i);
  assert.doesNotMatch(prompt, /Kravitz|Acne/i);
  assert.strictEqual(viralSources.length, 2);
});
```

**Verify:** `cd web_store_ui && node --test test/` → all 3 tests pass.

---

## Phase 3 — Arcade engine + scripts (still no real API calls)

### 3.1 `web_store_ui/src/arcade-engine.js`

```js
// Step 3: Arcade engine.
//  - getCached/saveCached: used by the server at demo time (NO network).
//  - generateReal: runs the real Arcade chain. Used ONLY by scripts/generate-cache.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'arcade-cache.json');
const IMAGES_DIR = path.join(CACHE_DIR, 'images');
const RAW_DIR = path.join(CACHE_DIR, 'raw');
const API_BASE = 'https://platform.arcade.ai/v1';
const USER_AGENT = process.env.ARCADE_USER_AGENT || 'dynamicshop-demo/1.0';

function promptHash(prompt) {
  return crypto.createHash('md5').update(prompt).digest('hex');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function getCached(prompt) {
  return readCache()[promptHash(prompt)] || null;
}

function saveCached(prompt, entry) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cache = readCache();
  cache[promptHash(prompt)] = entry;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ---------- everything below talks to the real Arcade API ----------

async function arcadeCall(procedure, body = {}) {
  const key = process.env.ARCADE_API_KEY;
  if (!key) throw new Error('ARCADE_API_KEY is not set');
  const res = await fetch(`${API_BASE}/${procedure}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${procedure} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollJob(jobId, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const start = Date.now();
  for (;;) {
    const job = await arcadeCall('jobs/get', { jobId });
    console.log(`  job ${jobId}: ${job.status}`);
    if (job.status === 'succeeded') return job;
    if (job.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(job.error)}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Job ${jobId} still running after timeout`);
    await sleep(intervalMs); // Arcade asks for 2-5 s between polls
  }
}

async function pickPrintCategory(preferredId) {
  const list = await arcadeCall('categories/list', {});
  const items = list.items || [];
  if (!items.length) throw new Error(`categories/list returned no items: ${JSON.stringify(list).slice(0, 500)}`);
  if (preferredId) {
    const hit = items.find((c) => c.categoryId === preferredId);
    if (!hit) throw new Error(`ARCADE_CATEGORY_ID ${preferredId} not found in categories/list`);
    return hit;
  }
  const prints = items.filter((c) => c.world === 'print');
  const scarf = prints.find((c) => /scarf|scarves/i.test(`${c.name} ${c.category || ''}`));
  if (!scarf) {
    const names = prints.map((c) => `${c.categoryId}  ${c.name}`).join('\n');
    throw new Error(
      'No print category matching "scarf" was found. STOP and ask the human which category to use,\n' +
        'then re-run with ARCADE_CATEGORY_ID=<id>. Print categories:\n' + names
    );
  }
  return scarf;
}

async function downloadImage(url, baseName) {
  const res = await fetch(url); // signed URL: do NOT send the API key
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('svg') ? '.svg' : '.jpg';
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const file = baseName + ext;
  fs.writeFileSync(path.join(IMAGES_DIR, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

function formatPrice(unitPrice) {
  if (unitPrice == null) return null;
  if (typeof unitPrice === 'number') return `$${unitPrice.toFixed(2)}`;
  if (typeof unitPrice === 'string') return unitPrice;
  // Unknown object shape: keep it readable. Phase 4 asks you to inspect cache/raw/ and fix this.
  return JSON.stringify(unitPrice);
}

async function generateReal(prompt, { productName, withCheckout = false } = {}) {
  const hash = promptHash(prompt);
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log('1/5 categories/list');
  const category = await pickPrintCategory(process.env.ARCADE_CATEGORY_ID);
  console.log(`  using category: ${category.categoryId} (${category.name})`);

  console.log('2/5 patterns/create (pattern + product in one job)');
  const created = await arcadeCall('patterns/create', {
    requestId: crypto.randomUUID(),
    prompt,
    categoryId: category.categoryId,
  });
  const job = await pollJob(created.jobId);
  const { patternId, productId } = job.result || {};
  if (!patternId || !productId) throw new Error(`Job result missing ids: ${JSON.stringify(job.result)}`);

  console.log('3/5 products/get');
  const product = await arcadeCall('products/get', { productId });
  fs.writeFileSync(path.join(RAW_DIR, `${hash}-product.json`), JSON.stringify(product, null, 2));

  console.log('4/5 find + download image');
  let imageUrl = product.imageUrl || product.thumbnailUrl;
  if (!imageUrl) {
    const pattern = await arcadeCall('patterns/get', { patternId });
    fs.writeFileSync(path.join(RAW_DIR, `${hash}-pattern.json`), JSON.stringify(pattern, null, 2));
    imageUrl = pattern.imageUrl;
  }
  if (!imageUrl) throw new Error(`No image URL found. Inspect cache/raw/${hash}-*.json`);
  const file = await downloadImage(imageUrl, hash);

  let checkoutInfo = null;
  if (withCheckout) {
    console.log('5/5 checkouts/create (unpaid; do NOT pay it)');
    const checkout = await arcadeCall('checkouts/create', {
      requestId: crypto.randomUUID(),
      lines: [{ productId, quantity: 1 }],
    });
    checkoutInfo = { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl };
  } else {
    console.log('5/5 checkout skipped (use --with-checkout to create one)');
  }

  const entry = {
    prompt,
    productName: productName || 'Viral Inspired Scarf',
    imageUrl: `/cache/images/${file}`,
    patternId,
    productId,
    unitPrice: product.unitPrice ?? null,
    price: formatPrice(product.unitPrice),
    checkoutInfo,
    fixture: false,
    createdAt: new Date().toISOString(),
  };
  saveCached(prompt, entry);
  return entry;
}

module.exports = { getCached, saveCached, promptHash, generateReal, IMAGES_DIR };
```

### 3.2 `web_store_ui/scripts/_default-signal.js`

Shared by both scripts, so they cache the same prompt that the demo page will request.

```js
const { mockComplementaryItem } = require('../src/mock_complementary_item');
const { generatePrompt } = require('../src/prompt_generator');

// MUST match the product signal in public/index.html
const DEFAULT_SIGNAL = { productType: 'jacket', attrs: ['black', 'wool', 'womens'] };

function buildDefault() {
  const complementary = mockComplementaryItem(DEFAULT_SIGNAL);
  const { prompt } = generatePrompt(complementary);
  return { complementary, prompt };
}

module.exports = { DEFAULT_SIGNAL, buildDefault };
```

### 3.3 `web_store_ui/scripts/seed-fixture.js`

Writes a placeholder image and cache entry, so the UI can be built without spending Arcade credits.

```js
const fs = require('fs');
const path = require('path');
const { saveCached, IMAGES_DIR } = require('../src/arcade-engine');
const { buildDefault } = require('./_default-signal');

const { prompt } = buildDefault();
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <rect width="600" height="600" fill="#2b2b2b"/>
  <g stroke="#c9b79c" stroke-width="14" opacity="0.8">
    <path d="M0 100H600M0 250H600M0 400H600M0 550H600"/>
    <path d="M100 0V600M250 0V600M400 0V600M550 0V600" stroke="#8c2f39"/>
  </g>
  <text x="300" y="310" font-family="Georgia" font-size="34" fill="#fff" text-anchor="middle">FIXTURE SCARF</text>
</svg>`;
fs.writeFileSync(path.join(IMAGES_DIR, 'fixture.svg'), svg);

saveCached(prompt, {
  prompt,
  productName: 'Viral Inspired Scarf (fixture)',
  imageUrl: '/cache/images/fixture.svg',
  unitPrice: null,
  price: '$22.00',
  checkoutInfo: null,
  fixture: true,
  createdAt: new Date().toISOString(),
});
console.log('Seeded fixture cache entry for the default product signal.');
```

### 3.4 `web_store_ui/scripts/generate-cache.js`

```js
// Runs the REAL Arcade chain once. Creates real objects in the human's Arcade account.
// Usage: node scripts/generate-cache.js --yes [--force] [--with-checkout]
const { getCached, generateReal } = require('../src/arcade-engine');
const { buildDefault } = require('./_default-signal');

const args = process.argv.slice(2);
const { prompt, complementary } = buildDefault();

(async () => {
  const existing = getCached(prompt);
  if (existing && !existing.fixture && !args.includes('--force')) {
    console.log('Real cache entry already exists. Nothing to do (use --force to regenerate).');
    return;
  }
  console.log('Prompt that will be sent to Arcade:\n' + prompt + '\n');
  if (!args.includes('--yes')) {
    console.log('Dry run. Re-run with --yes to call Arcade (creates a real pattern + product).');
    return;
  }
  const entry = await generateReal(prompt, {
    productName: `Viral ${complementary.complementary}`,
    withCheckout: args.includes('--with-checkout'),
  });
  console.log('\nDone:', JSON.stringify({ ...entry, prompt: '[omitted]' }, null, 2));
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
```

**Verify:**

```bash
cd web_store_ui
node scripts/seed-fixture.js
node scripts/generate-cache.js        # no --yes: must say "Real cache entry..." is NOT present and print "Dry run"
ls cache cache/images
```

Expected: `cache/arcade-cache.json` and `cache/images/fixture.svg` exist, and the dry run makes no network call. The seeded entry has `fixture: true`, so the dry run prints the prompt and "Dry run".

---

## Phase 4 — Real Arcade generation (HUMAN GATE)

**STOP.** Tell the human exactly this and wait for a clear "yes":

> Next I'll run `node scripts/generate-cache.js --yes`. It calls the real Arcade API with your `ARCADE_API_KEY` and creates **one pattern and one product** in your Arcade account. It takes about 1–3 minutes. It does not create a checkout and does not charge anything. Proceed?

If the human says yes, the command needs outbound network access:

```bash
cd web_store_ui
node scripts/generate-cache.js --yes
```

Run it with `allow_hosts: ["platform.arcade.ai", "*.arcade.ai", "*.amazonaws.com", "*.googleapis.com"]` and a `timeout_ms` of at least `600000`. Image URLs may be on another host, so if the download fails with a network error, ask the human to approve `allow_all_hosts` for this one command.

**If it fails with "No print category matching scarf":** show the printed category list to the human and ask which one to use. Then re-run with `ARCADE_CATEGORY_ID=<id> node scripts/generate-cache.js --yes`.

**After success, inspect and fix the shape guesses:**

1. Open `cache/raw/*-product.json`. Confirm that `unitPrice` and the image field were read correctly.
2. If `unitPrice` is an object or is in cents, edit `formatPrice()` in `src/arcade-engine.js`. If you can't tell whether the amount is dollars or cents, **ask the human**. Then fix the existing entry's `price` string by hand in `cache/arcade-cache.json`. Don't regenerate.
3. Open the downloaded image in `cache/images/` and check that it looks like a scarf or print.

**Verify:** `cache/arcade-cache.json` has an entry with `"fixture": false`, and `cache/images/` has a non-`fixture` image file.

Optional (only if the human also asks for a real checkout link): `node scripts/generate-cache.js --yes --force --with-checkout`. Never pay it.

---

## Phase 5 — Server

### 5.1 `web_store_ui/server.js`

```js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { mockComplementaryItem } = require('./src/mock_complementary_item');
const { generatePrompt } = require('./src/prompt_generator');
const { getCached } = require('./src/arcade-engine');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function serveFile(res, baseDir, relPath) {
  const filePath = path.join(baseDir, relPath);
  if (!filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/api/complementary') {
      return sendJson(res, 200, mockComplementaryItem(await readBody(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt') {
      return sendJson(res, 200, generatePrompt(await readBody(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/arcade') {
      const { prompt } = await readBody(req);
      const hit = prompt ? getCached(prompt) : null;
      if (!hit) {
        console.log('[arcade] cache MISS (run: node scripts/generate-cache.js --yes)');
        return sendJson(res, 404, { error: 'cache_miss' });
      }
      console.log('[arcade] cache hit' + (hit.fixture ? ' (fixture)' : ''));
      return sendJson(res, 200, hit);
    }
    if (req.method === 'GET') {
      if (url.pathname.startsWith('/cache/images/')) {
        const rel = decodeURIComponent(url.pathname.slice('/cache/images/'.length));
        return serveFile(res, path.join(ROOT, 'cache', 'images'), rel);
      }
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      return serveFile(res, path.join(ROOT, 'public'), rel);
    }
    sendJson(res, 404, { error: 'not_found' });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`DynamicShop demo: http://localhost:${PORT}`));
```

**Verify** (the sandbox allows localhost listening; if the port bind fails, ask the human to run `npm start` themselves):

```bash
cd web_store_ui
node server.js &
sleep 1
curl -s -X POST localhost:3000/api/complementary -H 'Content-Type: application/json' -d '{"productType":"jacket","attrs":["black","wool","womens"]}'
curl -s -X POST localhost:3000/api/prompt -H 'Content-Type: application/json' -d '{"productType":"jacket","attrs":["black","wool","womens"],"complementary":"Scarf","style":"oversized plaid mohair"}'
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/cache/images/fixture.svg
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3000/..%2f..%2fserver.js"
kill %1
```

Expected: the first returns `"complementary":"Scarf"`. The second returns a `prompt` string. Then `200`, then `403` or `404` (never the contents of `server.js`).

---

## Phase 6 — Frontend

All ad styling goes in its own file with a `ds-` prefix, so it can't collide with the designer's CSS.

### 6.1 `web_store_ui/public/ds-ad.css`

```css
#ad-slot { margin: 24px 0; }
.ds-ad { display: flex; gap: 20px; align-items: center; border: 1px solid #ddd; border-radius: 12px; padding: 16px; background: #fff; max-width: 640px; animation: ds-fade 0.6s ease; font-family: inherit; }
.ds-ad img { width: 180px; height: 180px; object-fit: cover; border-radius: 8px; }
.ds-ad-body { flex: 1; }
.ds-sponsored { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; }
.ds-ad h4 { margin: 6px 0; font-size: 18px; }
.ds-viral { font-size: 12px; color: #555; margin: 0 0 10px; }
.ds-price { font-size: 20px; font-weight: 600; margin-bottom: 12px; }
.ds-checkout { background: #111; color: #fff; border: 0; border-radius: 6px; padding: 10px 18px; cursor: pointer; font-size: 14px; }
.ds-checkout:hover { background: #333; }
.ds-status { padding: 20px; border: 1px dashed #bbb; border-radius: 12px; max-width: 640px; color: #555; font-size: 14px; }
.ds-status.ds-error { border-color: #c33; color: #c33; }
.ds-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 8px; border: 2px solid #999; border-top-color: transparent; border-radius: 50%; animation: ds-spin 0.8s linear infinite; }
.ds-replay { margin: 8px 0 24px; font-size: 12px; background: none; border: 1px solid #bbb; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #555; }
@keyframes ds-spin { to { transform: rotate(360deg); } }
@keyframes ds-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

### 6.2 `web_store_ui/public/app.js`

```js
(function () {
  const STEPS = [
    { label: 'Demand Intelligence: finding a complementary item…', ms: 900 },
    { label: 'Prompt Generator: checking what is trending…', ms: 1100 },
    { label: 'Arcade Engine: designing your product…', ms: 1400 },
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getSignal() {
    if (window.DYNAMICSHOP) return window.DYNAMICSHOP;
    const d = document.body.dataset;
    return { productType: d.productType, attrs: (d.attrs || '').split(',').map((s) => s.trim()).filter(Boolean) };
  }

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  function showStatus(slot, text, isError) {
    slot.innerHTML = `<div class="ds-status${isError ? ' ds-error' : ''}">${isError ? '' : '<span class="ds-spinner"></span>'}${esc(text)}</div>`;
  }

  function renderAd(slot, entry, viralSources) {
    const hasPrice = entry.price ? `<div class="ds-price">${esc(entry.price)}</div>` : '';
    const viral = viralSources && viralSources[0] ? `<p class="ds-viral">Trending: ${esc(viralSources[0])}</p>` : '';
    slot.innerHTML = `
      <div class="ds-ad">
        <img src="${esc(entry.imageUrl)}" alt="${esc(entry.productName)}">
        <div class="ds-ad-body">
          <div class="ds-sponsored">Sponsored</div>
          <h4>${esc(entry.productName)}</h4>
          ${viral}
          ${hasPrice}
          <button class="ds-checkout" type="button">Instant Checkout</button>
        </div>
      </div>`;
    slot.querySelector('.ds-checkout').addEventListener('click', () => alert('Added to cart (mock)'));
  }

  let running = false;
  async function run() {
    const slot = document.getElementById('ad-slot');
    if (!slot) return console.error('[DynamicShop] #ad-slot not found');
    if (running) return;
    running = true;
    try {
      const signal = getSignal();
      showStatus(slot, STEPS[0].label);
      const comp = await post('/api/complementary', signal);
      await sleep(STEPS[0].ms);

      showStatus(slot, STEPS[1].label);
      const gen = await post('/api/prompt', comp);
      await sleep(STEPS[1].ms);

      showStatus(slot, STEPS[2].label);
      const entry = await post('/api/arcade', { prompt: gen.prompt });
      await sleep(STEPS[2].ms);

      renderAd(slot, entry, gen.viralSources);
    } catch (e) {
      const msg = e.message === 'cache_miss'
        ? 'No cached ad found. Run: node scripts/generate-cache.js --yes'
        : `Could not load ad: ${e.message}`;
      showStatus(slot, msg, true);
    } finally {
      running = false;
    }
  }

  function addReplay() {
    const slot = document.getElementById('ad-slot');
    if (!slot || document.getElementById('ds-replay')) return;
    const btn = document.createElement('button');
    btn.id = 'ds-replay';
    btn.className = 'ds-replay';
    btn.type = 'button';
    btn.textContent = '↻ Replay';
    btn.addEventListener('click', run);
    slot.insertAdjacentElement('afterend', btn);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) run();
  });
  document.addEventListener('DOMContentLoaded', () => { addReplay(); run(); });
})();
```

### 6.3 `web_store_ui/public/index.html` (placeholder store, replaced in Phase 7)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Maison Noir — Premium Black Wool Jacket</title>
  <link rel="stylesheet" href="/ds-ad.css">
  <style>
    body { font-family: Georgia, serif; max-width: 960px; margin: 40px auto; padding: 0 20px; color: #111; }
    .pdp { display: flex; gap: 32px; }
    .pdp .photo { width: 360px; height: 460px; background: #1a1a1a; border-radius: 4px; }
    h1 { font-weight: 400; }
  </style>
</head>
<body data-product-type="jacket" data-attrs="black,wool,womens">
  <h1>Maison Noir</h1>
  <div class="pdp">
    <div class="photo"></div>
    <div>
      <h2>Premium Black Wool Jacket — Women's</h2>
      <p>$480.00</p>
      <p>Tailored in Italian virgin wool.</p>
      <h3>You may also like</h3>
      <div id="ad-slot" data-ad-slot="sponsored"></div>
    </div>
  </div>
  <script src="/app.js"></script>
</body>
</html>
```

**Verify** (the human must look at the page; you can't open a browser):

```bash
cd web_store_ui && node scripts/seed-fixture.js && node server.js
```

Tell the human to open `http://localhost:3000`. Expected:

- A spinner with 3 changing status lines (~3.5 s total).
- Then a "Sponsored" card showing the fixture image, the name, and a price.
- The "Instant Checkout" button shows the alert `Added to cart (mock)`.
- The "↻ Replay" button and the `r` key re-run the sequence.

The server terminal should print `[arcade] cache hit (fixture)`. If real data has been generated (Phase 4), it prints `[arcade] cache hit`. Stop the server afterward.

---

## Phase 7 — Integrate the designer's HTML

The human will supply the designer's HTML, and perhaps CSS and assets. **STOP and ask for them** if they haven't been provided yet.

Steps:

1. Back up the placeholder: `public/index.html` → `public/index.placeholder.html`.
2. Copy the designer's HTML to `public/index.html`. Copy their CSS, images and fonts into `public/` and keep the relative paths working.
3. If the file is a React/Vue/Tailwind **build output** and not plain static HTML, **STOP** and ask for the source.
4. Make **only these four edits** to the designer's HTML. Do not restyle or reformat anything else.
   - a. Before `</head>`, add: `<link rel="stylesheet" href="/ds-ad.css">`
   - b. On the `<body>` tag, add: `data-product-type="jacket" data-attrs="black,wool,womens"`. Change the values to match the product shown on the page, **and** update `DEFAULT_SIGNAL` in `scripts/_default-signal.js` to match. If these differ, the cached prompt won't match and the page shows `cache_miss`.
   - c. Add `<div id="ad-slot" data-ad-slot="sponsored"></div>` at the placement the human chooses. If they haven't chosen, put it directly below the product image or gallery, and tell them where it went.
   - d. Before `</body>`, add: `<script src="/app.js"></script>`
5. If the product signal changed in step 4b and you've already done Phase 4, the cached prompt is stale. Run `node scripts/seed-fixture.js` for dev. For real data, go back to Phase 4 with `--force` (**human gate again**).

**Verify:** `grep -c 'id="ad-slot"' web_store_ui/public/index.html` prints `1`, and `grep -c '/app.js' web_store_ui/public/index.html` prints `1`. Re-run the Phase 6 visual check.

---

## Phase 8 — Final verification checklist

Run these and report the results to the human:

- [ ] `cd web_store_ui && npm test` → all tests pass.
- [ ] `grep -rn "arcade_sk_live" web_store_ui` finds nothing outside `.env.example`. (Keys must never be written to files. `.env.example` holds a placeholder only.)
- [ ] The server starts with `npm start`, and `http://localhost:3000` shows the ad within ~4 s.
- [ ] The server log shows `[arcade] cache hit` and **no** outbound Arcade call. Prove it by unsetting the key: `env -u ARCADE_API_KEY node server.js` still serves the ad.
- [ ] Reload twice and replay with `r`: the same image is shown each time.
- [ ] Delete `cache/arcade-cache.json` temporarily and reload: the slot shows the red "No cached ad found…" message and the page doesn't crash. Restore the file afterward.
- [ ] `cache/images/` contains the real image, not just `fixture.svg`, for the demo.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Slot shows "No cached ad found" | The prompt hash doesn't match. Check that `DEFAULT_SIGNAL` equals the page's `data-product-type` / `data-attrs` exactly (order and case matter for `attrs`). Re-seed or regenerate. |
| `403` non-JSON from Arcade | The User-Agent was rejected. Set `ARCADE_USER_AGENT="dynamicshop-demo/1.0 (human@email)"`. |
| `401 UNAUTHORIZED` | The key is missing, expired or revoked. Ask the human for a new key from https://studio.arcade.ai/settings/api-keys. |
| `429` | Rate limited. Wait for `Retry-After` seconds, then retry. |
| Image broken in the ad | Arcade image URLs expire, so the file must be downloaded to `cache/images/`. Check that the `imageUrl` in the cache starts with `/cache/images/`. |
| Job `failed` | Read the error text. A prompt/category mismatch is the usual cause. Adjust the prompt wording in `src/prompt_generator.js`, then re-run Phase 4 with `--force`. |
| Port 3000 in use | `PORT=3001 node server.js` |

---

## Final file tree

```
web_store_ui/
├── .env.example
├── .gitignore
├── package.json
├── server.js
├── scripts/
│   ├── _default-signal.js
│   ├── generate-cache.js
│   └── seed-fixture.js
├── public/
│   ├── index.html          (designer's page after Phase 7)
│   ├── ds-ad.css
│   └── app.js
├── src/
│   ├── mock_complementary_item.js
│   ├── prompt_generator.js
│   └── arcade-engine.js
├── mock/
│   └── gemini-style.json
├── test/
│   └── demand-intelligence.test.js
└── cache/                  (gitignored)
    ├── arcade-cache.json
    ├── images/
    └── raw/
```
