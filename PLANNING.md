# DynamicShop — Planning Document

**Project:** The Viral Vector Engine
**Type:** Mock hackathon demo (local + cached API calls)
**Goal:** Given a product page, infer a complementary accessory (limited to Scarf / Ribbon Scarf / Pocket Square), fetch the latest viral design aesthetic for that accessory, generate a shoppable ad via the Arcade API, and inject it back into the product page — all locally.

# Arcade API
- stored in env variable `ARCADE_API_KEY`
## Arcade skills
│  ~/Workspace/DynamicShop/.agents/skills/arcade-api-test-drive  │
│    copy → Amp, Cline, Codex, Cursor, Droid +8 more             │
│                                                                │
│  ~/Workspace/DynamicShop/.agents/skills/arcade-api             │
│    copy → Amp, Cline, Codex, Cursor, Droid +8 more

---

## 1. Architecture Overview

The demo is **not** three side-by-side panels. It is a **sequence of steps** that runs locally on the laptop:

| Step | Name | Responsibility |
|---|---|---|
| **1** | **Mock Web Store (PDP)** | A web page (running on the laptop) that mocks a fancy web store. It contains a product detail page (PDP) with a designated **ad slot** where the generated ad will be injected. |
| **2** | **Demand Intelligence** | 2a. `mock_complementary_item`: takes an input signal (product type, e.g. `jacket`) and returns a complementary product type + style (e.g. `Scarf` + `oversized plaid mohair`).<br>2b. `prompt_generator`: makes a **mock Gemini call** and generates the latest style of that product type + style (e.g. viral scarf design aesthetics). |
| **3** | **Arcade Engine** | 3a. Calls the Arcade APIs (https://docs.arcade.ai/quickstart) using the real chain (see §4.3).<br>3c. Returns the product image and the checkout information. |
| **4** | **Ad Injection** | The generated product image is put back into the HTML page's ad block. |
| **5** | **Caching** | The generated Arcade product and metadata is cached so that repeated calls pull the same item and never call Arcade again. |

---

## 2. Data Flow (Step-by-Step)

```
[1. Mock PDP page]
   |  (input signal: product type + attributes)
   v
[2. Demand Intelligence]
   2a. mock_complementary_item(productType) -> complementaryType + style
   2b. prompt_generator(mock Gemini call) -> latest style / viral aesthetic
   |  (prompt)
   v
[3. Arcade Engine]
   3a. POST /api/arcade (prompt) -> checks cache first
   3c. returns { imageUrl (local), checkoutInfo }
   |
   v
[4. Ad Injection]
   Inject image + checkout info into PDP ad slot
   |
   v
[5. Cache]
   Store result keyed by prompt hash for future calls
```

### Detailed Steps

1. **Mock Web Store (PDP)**
   - A static HTML page served locally (e.g., `http://localhost:3000`).
   - Mocks a fancy web store PDP (e.g., "Premium Black Wool Jacket — Women's").
   - Contains a designated ad slot: `<div id="ad-slot"></div>`.
   - On load (or on a "Generate Ad" button click), it triggers the pipeline.

2. **Demand Intelligence**
   - **2a. `mock_complementary_item`**
     - Input signal: product type (e.g., `jacket`, `shirt`, `coat`) plus optional attributes (e.g., `black`, `wool`, `Womens`).
     - Output: a complementary product type + style.
     - Only **three** allowed outputs: `Scarf`, `Ribbon Scarf`, `Pocket Square`.
     - Example: `jacket` + `Womens` → `Scarf`.
   - **2b. `prompt_generator`**
     - Makes a **mock Gemini call** (no real Gemini API; returns preset viral design strings).
     - Generates the latest style of that product type + style.
     - Example output (viral scarf design aesthetics):
       ```
       [
         "Lenny Kravitz's Gigantic Blanket Scarf (the ultimate internet meme)",
         "Acne Studios' Plaid Mohair Scarf (the ultimate TikTok fashion aesthetic)"
       ]
       ```
     - Extracts aesthetic descriptors (e.g., `oversized, blanket-like, plaid, mohair, textured, TikTok fashion`).

3. **Arcade Engine**
   - **3a. Calls the Arcade APIs** (https://docs.arcade.ai/quickstart) using the **real chain** (see §4.3):
     - `categories/list` → `patterns/create` (**async job**) → poll → `patterns/get` → `categories/get` (selections) → `products/create` (**async job**) → poll → `products/get` → `checkouts/create`.
     - **Before calling**, checks the local cache (step 5) keyed by prompt hash.
   - **3c. Returns the product image and checkout information**:
     ```json
     {
       "imageUrl": "/cache/images/viral-scarf-001.png",
       "checkoutInfo": { "checkoutId": "chk_...", "checkoutUrl": "https://...", "price": 22, "productGroup": "scarf", "sku": "viral-scarf-001" }
     }
     ```
     - **Note:** `checkouts/create` returns a `checkoutId` + `checkoutUrl`, **not** a price. Price is mocked as a fixed value per product group (or read from the product).

4. **Ad Injection**
   - The generated product image (and checkout info) is injected into the HTML page's ad block (`#ad-slot`).
   - Renders a sponsored banner: image, price, and an "Instant Checkout" button (mock).

5. **Caching**
   - The generated image + checkout info is cached (e.g., in `cache/arcade-cache.json`) keyed by the prompt hash.
   - **The image is downloaded and stored locally** (`cache/images/*.png`) because **Arcade image URLs expire**.
   - Repeated calls with the same prompt pull the same item from cache — **no Arcade API call is made on subsequent runs**.

---

## 3. Mock / Fake Components

| Component | What's Real | What's Mocked |
|---|---|---|
| **Mock Web Store (PDP)** | Static HTML page | No real ecommerce backend; mock product context |
| **mock_complementary_item** | Fixed mapping rules | No ML; simple if-else (jacket → Scarf, etc.) |
| **prompt_generator** | Returns plausible viral strings | No actual Gemini API; static JSON |
| **Arcade Engine** | Arcade API exists (https://docs.arcade.ai/quickstart) | Real HTTP calls happen **only** in the offline populate script; the demo reads from cache |
| **Ad Injection** | HTML/CSS banner renders | Checkout is a UI mock |
| **Cache** | File-based store (JSON + downloaded images) | — |

---

## 4. Technical Details

### 4.1 Mock Web Store (PDP) — HTML Integration Contract

The designer's static HTML page must expose two things so the engine can wire in:

**a) An ad slot** — a single element the engine targets:
```html
<div id="ad-slot" data-ad-slot="sponsored"></div>
```

**b) The product signal** — how the page tells the engine what product it is:
```html
<body data-product-type="jacket" data-attrs="black,wool,womens">
```
or a JS config object:
```html
<script>window.DYNAMICSHOP = { productType: "jacket", attrs: ["black","wool","womens"] };</script>
```

- **File:** `public/index.html`
- Contains a product info section (e.g., "Premium Black Wool Jacket — Women's") and the `#ad-slot`.
- Served by the backend server.
- **Requirement:** plain static HTML/CSS (not a React/Vue/Tailwind build). If a build system is used, the source is required.
- **Decision needed:** where the ad slot sits on the page (below product image, sidebar, between description and reviews). Default: below the product image.

### 4.2 Demand Intelligence
- **File:** `src/mock_complementary_item.js`
  - Input: `{ productType: "jacket", attrs: ["black", "wool", "Womens"] }`
  - Output: `{ complementary: "Scarf", style: "oversized plaid mohair" }`
  - Hard-coded rules (only three allowed outputs):
    - `jacket` → `Scarf`
    - `shirt` → `Pocket Square` (example)
    - `coat` → `Ribbon Scarf` (example)
- **File:** `src/prompt_generator.js`
  - Makes a **mock Gemini call** (returns preset viral design strings from `mock/gemini-style.json`).
  - Extracts aesthetic descriptors from the strings.
  - Output: `{ prompt: "A premium women's scarf designed to complement a black wool jacket, featuring an oversized blanket-like plaid mohair aesthetic, cozy statement piece with textured fabric, soft drape, high-fashion product photo, studio lighting, transparent background", viralSources: [...] }`

### 4.3 Arcade Engine — Real API Chain

- **File:** `src/arcade-engine.js`
- Endpoint: `POST /api/arcade`
- **Cache-first:** checks `cache/arcade-cache.json` by prompt hash before doing anything else.
- The **real chain** (used only by the offline populate script, §4.6):

  | Step | Procedure | Notes |
  |---|---|---|
  | 1 | `categories/list` | Find a category (e.g., `print`) |
  | 2 | `patterns/create` + `prompt` | Returns a **job** (`status: "running"`) |
  | 3 | `jobs/get` (poll every 2–5s) | Until `status: "succeeded"` → `result.patternId` |
  | 4 | `patterns/get` | Returns `imageUrl` (expires!) |
  | 5 | `categories/get` + `categoryId` + `selections: {}` | Returns complete selections + `canManufacture` |
  | 6 | `products/create` + `patternId` + `categoryId` + `selections` | Returns a **job**; pass `fit` if aspect ratio mismatches |
  | 7 | `jobs/get` (poll) | Until `succeeded` → `result.productId` |
  | 8 | `products/get` | Confirm product |
  | 9 | `checkouts/create` | Returns `checkoutId` + `checkoutUrl` |

- **Async:** pattern and product generation each take **~1–2 minutes**. This is why the demo must read from cache, never call live.
- **Response (from cache):** `{ imageUrl: "/cache/images/....png", checkoutInfo: { checkoutId, checkoutUrl, price, productGroup, sku } }`

### 4.4 Ad Injection
- **File:** `public/app.js`
  - Receives `{ imageUrl, checkoutInfo }`.
  - Injects into `#ad-slot`:
    ```html
    <div class="ad-banner">
      <img src="{imageUrl}" alt="{productName}" />
      <div class="price">${price}</div>
      <button>Instant Checkout</button>
    </div>
    ```
  - Button shows alert: `"Added to cart (mock)"`.
  - **Loading/error states:** show a brief "generating…" animation even when reading from cache, so the demo feels live; show a friendly error if the cache is missing.

### 4.5 Cache
- **File:** `cache/arcade-cache.json`
- Keyed by prompt hash (e.g., `crypto.createHash('md5').update(prompt).digest('hex')`).
- **Images are downloaded to `cache/images/`** — never cache the Arcade `imageUrl` directly, because it expires.
- Structure:
  ```json
  {
    "<prompt-hash>": {
      "prompt": "...",
      "imageUrl": "/cache/images/viral-scarf-001.png",
      "checkoutInfo": { "checkoutId": "chk_...", "checkoutUrl": "https://...", "price": 22, "productGroup": "scarf", "sku": "viral-scarf-001" }
    }
  }
  ```

### 4.6 Cache Population (Offline Script)
- **File:** `scripts/generate-cache.js`
- Runs the **real** Arcade chain (§4.3) **once**, offline, before the demo.
- Downloads the generated image into `cache/images/`.
- Writes `cache/arcade-cache.json`.
- Run with: `node scripts/generate-cache.js`
- **Requires:** `ARCADE_API_KEY` set, and the human's go-ahead (it creates real patterns/products/checkouts in the Arcade account).

### 4.7 Config & Secrets
- **File:** `.env` (gitignored) with `ARCADE_API_KEY=arcade_sk_live_...`
- **File:** `.env.example` with a placeholder.
- **File:** `.gitignore` entries for `.env`, `cache/`, `.arcade-api/`.
- Never commit or print the key.

### 4.8 Checkout Policy
- **Do not create real checkouts live during the demo** — paying places a real, chargeable order.
- Pre-create one checkout in the populate script and cache the `checkoutUrl`, **or** mock the "Instant Checkout" button entirely (recommended for the demo).

### 4.9 Replay Control
- A "Reset / Replay" button (or keyboard shortcut) that re-runs the pipeline on stage without restarting the server.

---

## 5. Demo Script / User Flow

1. **Open the PDP** (`http://localhost:3000`). The page shows a mock "Premium Black Wool Jacket — Women's" product page with an empty ad slot.
2. **Trigger the pipeline** (auto-run on load or a "Generate Viral Ad" button).
3. **Demand Intelligence** runs:
   - `mock_complementary_item` returns `Scarf` + `oversized plaid mohair`.
   - `prompt_generator` makes the mock Gemini call and returns the viral scarf aesthetic.
4. **Arcade Engine** runs:
   - Checks cache → **hit** (pre-populated) → returns the product image and checkout info instantly.
   - (Cache miss would trigger the real chain, but the demo should never hit that path.)
5. **Ad Injection** puts the generated image into the PDP's ad slot (with a brief "generating…" animation).
6. **Repeat**: Run the pipeline again → the cache is hit → the same item is pulled, no Arcade call.

**Show-stopping moment:** Narrator points out how, starting from a simple product page, the **Demand Intelligence** layer proposes a complementary accessory with the latest viral style, the **Arcade Engine** generates a production-ready image with guaranteed checkout info, and the ad is injected back into the store page — all in seconds, with caching ensuring consistent, fast demo runs.

---

## 6. File Structure (proposed)

```
web_store_ui/
├── .env.example                 # ARCADE_API_KEY=...
├── .gitignore                   # .env, cache/, .arcade-api/
├── server.js                    # Backend: Express static server + mock endpoints
├── package.json
├── scripts/
│   └── generate-cache.js        # runs real Arcade chain once, downloads image
├── public/
│   ├── index.html               # designer's page (+ #ad-slot + product signal)
│   ├── style.css                # store styling
│   └── app.js                   # reads cache, injects ad, staged "live" delays
├── src/
│   ├── mock_complementary_item.js  # 2a: input signal -> complementary type + style
│   ├── prompt_generator.js         # 2b: mock Gemini call -> latest style / viral aesthetic
│   └── arcade-engine.js            # 3a/3c: cache-first; real chain only in populate script
├── mock/
│   └── gemini-style.json        # Fixed mock Gemini output (viral scarf descriptions)
└── cache/
    ├── arcade-cache.json        # Cached image + checkout info by prompt hash
    └── images/                  # downloaded product images
```

---

## 7. Quick Start Checklist

- [ ] Create `.env.example` and `.gitignore` (`.env`, `cache/`, `.arcade-api/`).
- [ ] Create `public/index.html` — designer's page with product info, `#ad-slot`, and product signal.
- [ ] Create `public/style.css` — store styling (or use the designer's).
- [ ] Create `src/mock_complementary_item.js` — input signal → complementary type + style (3 allowed outputs).
- [ ] Create `src/prompt_generator.js` — mock Gemini call → latest style / viral aesthetic.
- [ ] Create `src/arcade-engine.js` — cache-first; real chain implemented for the populate script.
- [ ] Create `mock/gemini-style.json` — fixed mock Gemini output.
- [ ] Create `scripts/generate-cache.js` — runs real Arcade chain once, downloads image, writes cache.
- [ ] Run `node scripts/generate-cache.js` (with `ARCADE_API_KEY` set) to populate `cache/`.
- [ ] Create `public/app.js` — reads cache, injects image into `#ad-slot`, staged "live" delays, replay control.
- [ ] Create `server.js` — Express server: serves static files + endpoints (`POST /api/complementary`, `POST /api/prompt`, `POST /api/arcade`).
- [ ] Run the server and verify end-to-end flow.
- [ ] Verify caching: run twice, confirm the second run pulls from cache (no Arcade call).
- [ ] Prepare a 2-minute demo script that walks through each step.

---

*End of planning document.*
