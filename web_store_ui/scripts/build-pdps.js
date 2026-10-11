// Builds public/store/products/<slug>.html from the designer's original product pages
// (store-src/pdp/<slug>.html, saved from the live site) and rewrites the landing page links.
// Edits made to each page: strip Next.js scripts, localise assets/links, replace the
// "Loading sponsored recommendation" skeleton with #ad-slot, stamp the product signal on <body>.
// Re-runnable: node scripts/build-pdps.js
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../src/catalog');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'store-src', 'pdp');
const OUT = path.join(ROOT, 'public', 'store', 'products');
const SKELETON = /<div class="h-52 animate-pulse border border-border bg-card" aria-label="Loading sponsored recommendation" role="status"><\/div>/;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

fs.mkdirSync(OUT, { recursive: true });

for (const p of CATALOG) {
  const srcFile = path.join(SRC, `${p.slug}.html`);
  if (!fs.existsSync(srcFile)) throw new Error(`Missing source page: ${srcFile}`);
  let s = fs.readFileSync(srcFile, 'utf8');

  s = s.replace(/<script[\s\S]*?<\/script>/g, '');
  s = s.replace(/<link rel="(preload|icon|apple-touch-icon|prefetch)"[^>]*>/g, '');

  const sheets = s.match(/<link rel="stylesheet" href="[^"]*\.css"[^>]*>/g) || [];
  if (sheets.length !== 1) throw new Error(`${p.slug}: expected 1 stylesheet link, found ${sheets.length}`);
  s = s.replace(sheets[0], '<link rel="stylesheet" href="../assets/08oxjlozb84i_.css"><link rel="stylesheet" href="/ds-ad.css">');

  s = s.replace(/src="\/images\/products\/([^"]+)"/g, 'src="../assets/$1"');
  s = s.replace(/href="\/products\/([^"/]+)"/g, 'href="./$1.html"');
  s = s.replace(/href="\/#collection"/g, 'href="../index.html#collection"');
  s = s.replace(/href="\/"/g, 'href="../index.html"');

  if (!SKELETON.test(s)) throw new Error(`${p.slug}: ad skeleton not found (designer page changed?)`);
  s = s.replace(SKELETON, '<div id="ad-slot" data-ad-slot="sponsored" data-placement="product_detail.below_buy_box"></div>');

  if (!/<body[^>]*>/.test(s)) throw new Error(`${p.slug}: no <body>`);
  s = s.replace(
    /<body([^>]*)>/,
    `<body$1 data-product-slug="${p.slug}" data-product-type="${esc(p.productType)}" data-attrs="${esc(p.attrs.join(','))}">`
  );
  s = s.replace('</body>', '<script src="/app.js"></script></body>');

  const leftovers = (s.match(/(?:src|href)="\/(?!ds-ad\.css|app\.js)[^"]*"/g) || []);
  if (leftovers.length) throw new Error(`${p.slug}: root-relative refs left: ${leftovers.join(' ')}`);
  if (/https?:\/\/(?!www\.w3\.org)/.test(s)) throw new Error(`${p.slug}: external URL left in page`);

  fs.writeFileSync(path.join(OUT, `${p.slug}.html`), s);
  console.log(`built products/${p.slug}.html  [${p.productType} | ${p.attrs.join(',')}]`);
}

// Landing page: point product cards at the new pages.
const indexFile = path.join(ROOT, 'public', 'store', 'index.html');
let idx = fs.readFileSync(indexFile, 'utf8');
const before = (idx.match(/href="\.\/pdp\.html\?product=[^"]+"/g) || []).length;
idx = idx.replace(/href="\.\/pdp\.html\?product=([^"]+)"/g, 'href="./products/$1.html"');
fs.writeFileSync(indexFile, idx);
const links = new Set(idx.match(/href="\.\/products\/[^"]+"/g) || []);
console.log(`landing page: rewrote ${before} links, ${links.size} distinct product pages linked`);
