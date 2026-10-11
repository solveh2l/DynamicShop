const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mockComplementaryItem } = require('./src/mock_complementary_item');
const { generatePrompt } = require('./src/prompt_generator');
const { getProduct, buildAd } = require('./src/catalog');
const engine = require('./src/arcade-engine');

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
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
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

// The Re-imagine and checkout endpoints SPEND the user's Arcade account, so they only accept requests that
// come from this app's own pages: a localhost Host header (blocks DNS rebinding), no foreign Origin, and a
// JSON content type (which forces a CORS preflight that we never grant).
function isSameOriginJson(req) {
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return String(req.headers['content-type'] || '').startsWith('application/json');
}

function scrub(message) {
  const key = process.env.ARCADE_API_KEY;
  let m = String(message || 'unknown error');
  if (key) m = m.split(key).join('[redacted]');
  return m.slice(0, 600);
}

// deps are injectable so tests can run the whole flow without touching Arcade.
function createAppServer(deps = {}) {
  const generate = deps.generate || engine.generateReal;
  const addCheckout = deps.addCheckout || engine.addCheckout;
  const hasKey = deps.hasKey || (() => Boolean(process.env.ARCADE_API_KEY));

  const jobs = new Map();
  let active = null; // only one Arcade generation at a time (Arcade's own guidance)

  function startReimagine(product) {
    // Re-run the whole workflow: complementary item -> viral style -> prompt -> Arcade -> cache.
    const ad = buildAd(product);
    const job = { id: crypto.randomUUID(), slug: product.slug, state: 'running', message: 'Starting…', viralSources: ad.viralSources };
    jobs.set(job.id, job);
    if (jobs.size > 20) jobs.delete(jobs.keys().next().value);
    active = job;
    Promise.resolve()
      .then(() =>
        generate(
          { prompt: ad.prompt, category: ad.category, productName: product.adName },
          { onProgress: (m) => (job.message = m) }
        )
      )
      .then((entry) => {
        job.entry = entry;
        job.state = 'done';
        job.message = 'Done';
      })
      .catch((e) => {
        job.error = scrub(e.message);
        job.state = 'error';
      })
      .finally(() => {
        if (active === job) active = null;
      });
    return job;
  }

  return http.createServer(async (req, res) => {
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
        const hit = prompt ? engine.getCached(prompt) : null;
        if (!hit) {
          console.log('[arcade] cache MISS (run: npm run seed)');
          return sendJson(res, 404, { error: 'cache_miss' });
        }
        console.log('[arcade] cache hit' + (hit.fixture ? ' (fixture)' : ''));
        return sendJson(res, 200, hit);
      }

      if (req.method === 'POST' && url.pathname === '/api/reimagine') {
        if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'forbidden' });
        const { slug } = await readBody(req);
        const product = getProduct(slug);
        if (!product) return sendJson(res, 404, { error: 'unknown_product' });
        if (active && active.slug === slug) return sendJson(res, 202, { jobId: active.id, joined: true });
        if (active) return sendJson(res, 409, { error: 'busy', message: 'Another item is still being generated. Wait for it to finish.' });
        if (!hasKey()) {
          return sendJson(res, 503, {
            error: 'no_key',
            message: 'ARCADE_API_KEY is not set for the server process. Stop it and start it from a shell where the key is exported.',
          });
        }
        const job = startReimagine(product);
        console.log(`[reimagine] started for ${slug}`);
        return sendJson(res, 202, { jobId: job.id });
      }
      if (req.method === 'GET' && url.pathname === '/api/reimagine/status') {
        const job = jobs.get(url.searchParams.get('id'));
        if (!job) return sendJson(res, 404, { error: 'unknown_job' });
        return sendJson(res, 200, {
          state: job.state,
          message: job.message,
          error: job.error,
          entry: job.state === 'done' ? job.entry : undefined,
          viralSources: job.viralSources,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/checkout') {
        if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'forbidden' });
        const product = getProduct((await readBody(req)).slug);
        if (!product) return sendJson(res, 404, { error: 'unknown_product' });
        const { prompt } = buildAd(product);
        const entry = engine.getCached(prompt);
        if (!entry) return sendJson(res, 404, { error: 'cache_miss' });
        if (entry.fixture || !entry.productId) {
          return sendJson(res, 409, { error: 'not_real', message: 'This is a placeholder, not a real Arcade product.' });
        }
        if (entry.checkoutInfo && entry.checkoutInfo.checkoutUrl) return sendJson(res, 200, { checkoutUrl: entry.checkoutInfo.checkoutUrl });
        if (!hasKey()) return sendJson(res, 503, { error: 'no_key', message: 'ARCADE_API_KEY is not set for the server process.' });
        const updated = await addCheckout(prompt);
        console.log(`[checkout] created for ${product.slug}`);
        return sendJson(res, 200, { checkoutUrl: updated.checkoutInfo.checkoutUrl });
      }

      if (req.method === 'GET') {
        if (url.pathname === '/') {
          res.writeHead(302, { Location: '/store/index.html' });
          return res.end();
        }
        if (url.pathname.startsWith('/cache/images/')) {
          const rel = decodeURIComponent(url.pathname.slice('/cache/images/'.length));
          return serveFile(res, engine.IMAGES_DIR, rel);
        }
        return serveFile(res, path.join(ROOT, 'public'), decodeURIComponent(url.pathname.slice(1)));
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
      sendJson(res, 500, { error: scrub(e.message) });
    }
  });
}

const server = createAppServer();

if (require.main === module) {
  // 127.0.0.1 only: this server can spend your Arcade account, so never expose it on the network.
  server.listen(PORT, '127.0.0.1', () => console.log(`DynamicShop demo: http://localhost:${PORT}`));
}

module.exports = { server, createAppServer };
