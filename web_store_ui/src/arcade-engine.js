// Step 3: Arcade engine.
//  - getCached/saveCached: used by the server at demo time (NO network).
//  - generateReal/addCheckout/arcadeCall: talk to the real Arcade API (scripts/ and the Re-imagine button).
//
// Where prices come from (per https://platform.arcade.ai/v1/spec.json):
//  - products/get  -> unitPrice { amount: "48.00", currency: "USD" } | null   (price of ONE unit,
//                     before volume discount, excluding shipping and tax; null while pricing is
//                     unavailable, so we retry)
//  - checkouts/create -> { checkoutId, checkoutUrl } ONLY. No price. The hosted checkout page shows the
//                     final total; orders/get returns total/shipping/tax only after payment.
//
// Cache: one entry per product, keyed by the hash of its prompt. Saving an entry OVERWRITES the previous
// one for that key, and the previous image file is deleted. A failed generation changes nothing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = process.env.DS_CACHE_DIR || path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'arcade-cache.json');
const IMAGES_DIR = path.join(CACHE_DIR, 'images');
const RAW_DIR = path.join(CACHE_DIR, 'raw');
const API_BASE = 'https://platform.arcade.ai/v1';
const USER_AGENT = process.env.ARCADE_USER_AGENT || 'dynamicshop-demo/1.0';
const IMAGE_PREFIX = '/cache/images/';

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
  const tmp = CACHE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, CACHE_FILE); // atomic: a crash never leaves a half-written cache
}

// Deletes a cached image file by its /cache/images/<name> URL. Never leaves IMAGES_DIR.
function removeImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(IMAGE_PREFIX)) return;
  const file = path.join(IMAGES_DIR, path.basename(imageUrl));
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}

// unitPrice is { amount: "48.00", currency: "USD" } or null.
function formatPrice(unitPrice) {
  if (!unitPrice || typeof unitPrice !== 'object' || unitPrice.amount == null) return null;
  const n = Number(unitPrice.amount);
  if (!Number.isFinite(n)) return null;
  const currency = unitPrice.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `${unitPrice.amount} ${currency}`;
  }
}

// products/get: images[] is "primary first" (the product mock-up); imageUrl is only its thumbnail.
function productImageUrl(product) {
  return (product && product.images && product.images[0] && product.images[0].url) || (product && product.imageUrl) || null;
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
    if (job.status === 'failed') throw new Error(`Arcade could not make this item: ${(job.error && job.error.message) || 'job failed'}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Job ${jobId} still running after timeout`);
    await sleep(intervalMs); // Arcade asks for 2-5 s between polls
  }
}

let categoryList = null;
async function findCategory(name) {
  if (!categoryList) categoryList = (await arcadeCall('categories/list', {})).items || [];
  const hit = categoryList.find((c) => String(c.name).toLowerCase() === String(name).toLowerCase());
  if (!hit) {
    const names = categoryList.map((c) => c.name).join(', ');
    throw new Error(`No Arcade category named "${name}". Available: ${names}`);
  }
  return hit;
}

// unitPrice is null "while pricing is unavailable, so read again later".
async function getPricedProduct(productId, attempts = 6) {
  let product;
  for (let i = 0; i < attempts; i++) {
    product = await arcadeCall('products/get', { productId, quantity: 1 });
    if (product.unitPrice) return product;
    console.log(`  unitPrice not available yet (${i + 1}/${attempts}), retrying in 3s`);
    await sleep(3000);
  }
  return product;
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

// The checkout page is hosted by Arcade and PAYING IT PLACES A REAL, CHARGED ORDER.
// We only create the (unpaid) checkout; a human pays it.
async function createCheckout(productId) {
  const checkout = await arcadeCall('checkouts/create', {
    requestId: crypto.randomUUID(),
    lines: [{ productId, quantity: 1 }],
    // Required for quantity-1 lines unless the account has an active subscription (otherwise HTTP 412).
    // It adds Arcade's drop-ship service to the order. Set ARCADE_DROP_SHIP=false if you have a subscription.
    dropShip: process.env.ARCADE_DROP_SHIP !== 'false',
  });
  if (!checkout.checkoutUrl) throw new Error(`checkouts/create returned no checkoutUrl: ${JSON.stringify(checkout).slice(0, 300)}`);
  return { checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, createdAt: new Date().toISOString() };
}

// ad = { prompt, category, productName }.  Creates a NEW Arcade pattern + product every call.
// On success the cache entry for this prompt is replaced (new image, price, productId, no checkout
// unless withCheckout) and the previous image file is deleted. On any failure nothing is changed.
async function generateReal(ad, { withCheckout = false, onProgress } = {}) {
  const { prompt, category: categoryName, productName } = ad;
  const hash = promptHash(prompt);
  const step = (log, friendly) => {
    console.log(log);
    if (onProgress) onProgress(friendly || log);
  };
  fs.mkdirSync(RAW_DIR, { recursive: true });

  step(`1/4 category "${categoryName}"`, 'Choosing the product type…');
  const category = await findCategory(categoryName);
  console.log(`  ${category.categoryId} (${category.world})`);

  step('2/4 patterns/create (pattern + product in one job)', 'Designing it with Arcade (usually 1-3 minutes)…');
  const created = await arcadeCall('patterns/create', {
    requestId: crypto.randomUUID(),
    prompt,
    categoryId: category.categoryId,
  });
  const job = await pollJob(created.jobId);
  const { patternId, productId } = job.result || {};
  if (!patternId || !productId) throw new Error(`Job result missing ids: ${JSON.stringify(job.result)}`);

  step('3/4 products/get (price + image)', 'Pricing it and fetching the image…');
  const product = await getPricedProduct(productId);
  fs.writeFileSync(path.join(RAW_DIR, `${hash}-product.json`), JSON.stringify(product, null, 2));
  const price = formatPrice(product.unitPrice);
  if (!price) console.warn('  WARNING: unitPrice still null; the ad will show no price. Re-run with --force later.');
  let imageUrl = productImageUrl(product);
  if (!imageUrl) {
    const pattern = await arcadeCall('patterns/get', { patternId });
    imageUrl = pattern.imageUrl;
  }
  if (!imageUrl) throw new Error(`No image URL found. Inspect cache/raw/${hash}-product.json`);
  // Unique file name per generation: the browser can never show a stale image for a new item.
  const file = await downloadImage(imageUrl, `${hash}-${Date.now()}`);

  let checkoutInfo = null;
  try {
    if (withCheckout) {
      step('4/4 checkouts/create (unpaid; do NOT pay it)', 'Creating the checkout…');
      checkoutInfo = await createCheckout(productId);
    } else {
      console.log('4/4 checkout skipped (created lazily when someone clicks Instant Checkout)');
    }
  } catch (e) {
    removeImage(IMAGE_PREFIX + file); // don't leave an orphan file if we are not going to save
    throw e;
  }

  const previous = getCached(prompt);
  const entry = {
    prompt,
    productName: productName || 'Viral Inspired Item',
    arcadeTitle: product.title || null,
    category: categoryName,
    imageUrl: IMAGE_PREFIX + file,
    patternId,
    productId,
    unitPrice: product.unitPrice ?? null,
    price,
    checkoutInfo,
    fixture: false,
    version: ((previous && previous.version) || 0) + 1,
    createdAt: new Date().toISOString(),
  };
  saveCached(prompt, entry); // overwrites the previous item for this product
  if (previous && previous.imageUrl !== entry.imageUrl) removeImage(previous.imageUrl);
  return entry;
}

// Creates the checkout for an already-generated item if it has none yet. Idempotent.
async function addCheckout(prompt) {
  const entry = getCached(prompt);
  if (!entry || entry.fixture || !entry.productId) throw new Error('No real generated product cached for this prompt');
  if (entry.checkoutInfo && entry.checkoutInfo.checkoutUrl) return entry;
  entry.checkoutInfo = await createCheckout(entry.productId);
  saveCached(prompt, entry);
  return entry;
}

module.exports = {
  getCached, saveCached, promptHash, generateReal, addCheckout, arcadeCall,
  formatPrice, productImageUrl, removeImage, IMAGES_DIR, CACHE_DIR, IMAGE_PREFIX,
};
