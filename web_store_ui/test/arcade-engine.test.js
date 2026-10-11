const test = require('node:test');
const assert = require('node:assert');
const { formatPrice, productImageUrl } = require('../src/arcade-engine');

// Shapes below are taken from https://platform.arcade.ai/v1/spec.json (products.get response).
test('formatPrice reads Arcade unitPrice { amount, currency }', () => {
  assert.strictEqual(formatPrice({ amount: '48.00', currency: 'USD' }), '$48.00');
  assert.strictEqual(formatPrice({ amount: '1234.5', currency: 'USD' }), '$1,234.50');
});

test('formatPrice returns null (not junk text) when pricing is unavailable or malformed', () => {
  assert.strictEqual(formatPrice(null), null);
  assert.strictEqual(formatPrice(undefined), null);
  assert.strictEqual(formatPrice({ amount: 'abc', currency: 'USD' }), null);
  assert.strictEqual(formatPrice('48.00'), null);
});

test('formatPrice never renders the raw JSON object', () => {
  assert.doesNotMatch(String(formatPrice({ amount: '9.99', currency: 'USD' })), /[{}"]/);
});

test('productImageUrl prefers images[0] (the product), falls back to the thumbnail', () => {
  assert.strictEqual(productImageUrl({ images: [{ url: 'https://x/a.png' }], imageUrl: 'https://x/thumb.png' }), 'https://x/a.png');
  assert.strictEqual(productImageUrl({ images: [], imageUrl: 'https://x/thumb.png' }), 'https://x/thumb.png');
  assert.strictEqual(productImageUrl({}), null);
});
