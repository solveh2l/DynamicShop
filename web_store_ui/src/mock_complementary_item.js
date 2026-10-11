// Step 2a: input signal (product type + attrs) -> complementary item + style.
// `category` is the exact name of the Arcade category (from categories/list).
// `kind` is "print" (textile print applied to a product) or "jewelry" (designed directly).
// `trend` keys into mock/gemini-style.json.
const RULES = {
  jacket: { complementary: 'Scarf', category: 'Scarves', kind: 'print', trend: 'blanket-plaid-scarf', style: 'oversized plaid mohair' },
  overcoat: { complementary: 'Scarf', category: 'Scarves', kind: 'print', trend: 'gold-deco-scarf', style: 'fine gold art-deco motif on black' },
  coat: { complementary: 'Ribbon Scarf', category: 'Ribbon Scarf', kind: 'print', trend: 'bag-ribbon-scarf', style: 'satin ribbon' },
  tote: { complementary: 'Ribbon Scarf', category: 'Ribbon Scarf', kind: 'print', trend: 'bag-ribbon-scarf', style: 'satin ribbon' },
  blazer: { complementary: 'Pocket Square', category: 'Pocket Squares', kind: 'print', trend: 'paisley-pocket-square', style: 'paisley silk' },
  shirt: { complementary: 'Pocket Square', category: 'Pocket Squares', kind: 'print', trend: 'paisley-pocket-square', style: 'paisley silk' },
  loafers: { complementary: 'Pocket Square', category: 'Pocket Squares', kind: 'print', trend: 'gold-horsebit-pocket-square', style: 'gold horsebit chain' },
  gloves: { complementary: 'Scarf', category: 'Scarves', kind: 'print', trend: 'camel-herringbone-scarf', style: 'camel herringbone cashmere' },
  'evening dress': { complementary: 'Dangle Earrings', category: 'Dangle Earrings', kind: 'jewelry', trend: 'gold-chain-dangle-earrings', style: 'gold chain drop' },
};

const ALLOWED = [...new Set(Object.values(RULES).map((r) => r.complementary))];

function mockComplementaryItem({ productType, attrs = [] } = {}) {
  const key = String(productType || '').trim().toLowerCase();
  const rule = RULES[key] || RULES.jacket;
  return {
    productType: RULES[key] ? key : 'jacket',
    attrs,
    ...rule,
  };
}

module.exports = { mockComplementaryItem, ALLOWED, RULES };
