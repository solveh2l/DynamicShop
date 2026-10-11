const test = require('node:test');
const assert = require('node:assert');
const { mockComplementaryItem, ALLOWED } = require('../src/mock_complementary_item');
const { generatePrompt } = require('../src/prompt_generator');
const { CATALOG, buildAd } = require('../src/catalog');

test('jacket maps to Scarf', () => {
  const r = mockComplementaryItem({ productType: 'jacket', attrs: ['black', 'wool', 'womens'] });
  assert.strictEqual(r.complementary, 'Scarf');
});

test('every rule output is an allowed item, and unknown types fall back safely', () => {
  for (const t of ['jacket', 'coat', 'shirt', 'blazer', 'unknown-thing']) {
    assert.ok(ALLOWED.includes(mockComplementaryItem({ productType: t }).complementary));
  }
});

test('prompt mentions the item, style and context, and no brand names', () => {
  const c = mockComplementaryItem({ productType: 'jacket', attrs: ['black', 'wool', 'womens'] });
  const { prompt, viralSources } = generatePrompt(c);
  assert.match(prompt, /scarf/i);
  assert.match(prompt, /plaid/i);
  assert.match(prompt, /black wool womens jacket/i);
  assert.doesNotMatch(prompt, /Kravitz|Acne/i);
  assert.strictEqual(viralSources.length, 2);
});

test('the catalog has the six products with the intended Arcade categories', () => {
  const byslug = Object.fromEntries(CATALOG.map((p) => [p.slug, buildAd(p).category]));
  assert.deepStrictEqual(byslug, {
    'noir-cashmere-overcoat': 'Scarves',
    'aurelia-leather-tote': 'Ribbon Scarf',
    'onyx-silk-blazer': 'Pocket Squares',
    'sovereign-loafers': 'Pocket Squares',
    'lumiere-leather-gloves': 'Scarves',
    'eclipse-evening-dress': 'Dangle Earrings',
  });
});

test('every product gets a distinct prompt (so each gets its own cached item), with no brand names', () => {
  const prompts = CATALOG.map((p) => buildAd(p).prompt);
  assert.strictEqual(new Set(prompts).size, CATALOG.length);
  for (const p of prompts) assert.doesNotMatch(p, /Kravitz|Acne|FancyPants/i);
});

test('jewelry prompts are not textile-print prompts', () => {
  const dress = buildAd(CATALOG.find((p) => p.slug === 'eclipse-evening-dress'));
  assert.strictEqual(dress.kind, 'jewelry');
  assert.doesNotMatch(dress.prompt, /textile|seamless/i);
  assert.match(dress.prompt, /earrings/i);
});

test('the overcoat ad is understated: no meme/celebrity source, gold on black to echo its gold buttons', () => {
  const ad = buildAd(CATALOG.find((p) => p.slug === 'noir-cashmere-overcoat'));
  assert.doesNotMatch(JSON.stringify(ad.viralSources), /Kravitz|Acne|meme|blanket/i);
  assert.doesNotMatch(ad.prompt, /plaid|mohair|blanket|oversized/i);
  assert.match(ad.prompt, /gold/i);
  assert.match(ad.prompt, /black/i);
});

test('catalog attrs contain no commas (they are comma-joined in data-attrs)', () => {
  for (const p of CATALOG) for (const a of p.attrs) assert.ok(!a.includes(','), `${p.slug}: ${a}`);
});
