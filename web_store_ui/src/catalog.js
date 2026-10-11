// The six FancyPants products. Single source of truth for:
//  - the product pages (scripts/build-pdps.js stamps productType/attrs onto <body>)
//  - the demand-intelligence signal, and therefore the cached Arcade prompt
// attrs must not contain commas (they are stored comma-separated in data-attrs).
const { mockComplementaryItem } = require('./mock_complementary_item');
const { generatePrompt } = require('./prompt_generator');

const CATALOG = [
  { slug: 'noir-cashmere-overcoat', name: 'Noir Cashmere Overcoat', productType: 'overcoat', attrs: ['black', 'cashmere'], adName: 'Noir Gold Deco Scarf' },
  { slug: 'aurelia-leather-tote', name: 'Aurelia Leather Tote', productType: 'tote', attrs: ['black', 'calfskin', 'gold clasp'], adName: 'Gilded Ribbon Bag Scarf' },
  { slug: 'onyx-silk-blazer', name: 'Onyx Silk Tuxedo Blazer', productType: 'blazer', attrs: ['black', 'silk', 'satin lapel'], adName: 'Onyx Paisley Silk Pocket Square' },
  { slug: 'sovereign-loafers', name: 'Sovereign Horsebit Loafers', productType: 'loafers', attrs: ['black', 'patent leather', 'gold horsebit'], adName: 'Horsebit Gold Silk Pocket Square' },
  { slug: 'lumiere-leather-gloves', name: 'Lumière Lambskin Gloves', productType: 'gloves', attrs: ['black', 'lambskin'], adName: 'Camel Herringbone Cashmere Scarf' },
  { slug: 'eclipse-evening-dress', name: 'Eclipse Silk Evening Dress', productType: 'evening dress', attrs: ['black', 'satin', 'gold chain straps'], adName: 'Eclipse Gold Chain Drop Earrings' },
];

function getProduct(slug) {
  return CATALOG.find((p) => p.slug === slug) || null;
}

function signalFor(product) {
  return { productType: product.productType, attrs: product.attrs };
}

// Runs the same two steps the server runs, so scripts cache exactly the prompt the page will request.
function buildAd(product) {
  const complementary = mockComplementaryItem(signalFor(product));
  const generated = generatePrompt(complementary);
  return { complementary, ...generated };
}

module.exports = { CATALOG, getProduct, signalFor, buildAd };
