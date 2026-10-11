// Step 2b: mock "Gemini call" -> viral aesthetic -> Arcade prompt.
// Prompts never name brands or celebrities (those only appear as viralSources in the ad).
//  - kind "print":   a TEXTILE PRINT that Arcade applies to the product.
//  - kind "jewelry": a jewelry design made directly for the category.
const fs = require('fs');
const path = require('path');

const STYLE_FILE = path.join(__dirname, '..', 'mock', 'gemini-style.json');

function mockGeminiSearch(trend) {
  const all = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8'));
  const entry = all[trend];
  if (!entry) throw new Error(`No mock style data for trend: ${trend}`);
  return entry;
}

function generatePrompt({ productType, attrs = [], complementary, style, trend, kind = 'print', category }) {
  const found = mockGeminiSearch(trend);
  const context = [...attrs, productType].filter(Boolean).join(' ');
  const item = complementary.toLowerCase();
  const prompt =
    kind === 'jewelry'
      ? `${style} ${item}: ${found.descriptors.join(', ')}. ` +
        `Material: ${found.palette}. Designed to complement a ${context}. Refined, elegant, high detail.`
      : `Seamless repeating textile print for a ${item}: ${style}, ${found.descriptors.join(', ')}. ` +
        `Color palette: ${found.palette}, chosen to complement a ${context}. ` +
        `High detail, rich woven texture, no text, no logos.`;
  return {
    prompt,
    viralSources: found.viralSources,
    descriptors: found.descriptors,
    mock: found.mock !== false,
    complementary,
    category,
    kind,
  };
}

module.exports = { generatePrompt, mockGeminiSearch };
