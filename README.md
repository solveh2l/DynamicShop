# DynamicShop

## The Problem

Traditional retail media is beholden to their brands' and advertisers' existing product catalog. By the time a retail brand spots a viral trend, designs a product, clears supply chain, and launches a campaign and manufactures relevant products, the trend is over. That process can take from 3 weeks to several months.

## Our Solution

 Using our product, each retailer/brand is able to capitalize on what's trending, and using the Arcade-powered Ad Slot, turns a retailer’s existing sponsored placement into a source of new product supply. When Arcade wins the auction on a product page, the slot calls the Arcade API server-side and shows a complementary product designed for that page through our data science engine. The ad then links to Arcade checkout, so the impression can end in a real purchase. In the future as a value addition to the roadmap, we should measure it with exposed-versus-holdout tests on attachment rate, basket value, and incremental conversion.
 
 The DynamicShop shortens that cycle to seconds:

1. **Product page input:** a shopper views a product page, such as a women's black wool jacket.
2. **Demand Intelligence:** identifies a complementary accessory (scarves, ribbon scarves, or pocket squares) and a trending style based on what users are talking about.
3. **Prompt Generator:** turns that trend into a design prompt.
4. **Arcade Engine:** calls the Arcade API chain (`categories/list` → `patterns/create` → `products/create` → `checkouts/create`) to produce a production-ready product image and checkout link. (For demo, Results are cached.)
5. **Adtech Layer:** injects the generated product into the page's sponsored ad slot as a shoppable banner. (this needs to go through the sponsored winning bid process in prod)

The three components run as sequential steps in the demo, not as side-by-side panels.

This is a mock hackathon project. The Arcade API calls are cached so the demo never waits on live requests.

## Live Demo

**https://dynamicshop-cwsa.onrender.com/**

The demo is hosted on Render. Before you open the link, make sure your **ad blocker is off** for this site. Otherwise the sponsored ad slot will not appear.

If you want to re-create this yourself, you are welcome to clone the repo and run your own copy (see Current Setup below).

## Current Setup

The demo lives in `web_store_ui/`:

- **Stack:** plain Node.js with no npm dependencies (Node 18+).
- **Store pages:** `web_store_ui/public/store/` (product pages with the ad slot), with static assets in `web_store_ui/public/`.
- **Server:** `web_store_ui/server.js`. It listens on `127.0.0.1:3000` by default. Set `PORT` and `HOST` to change this (the Render deployment uses `HOST=0.0.0.0`).
- **Arcade demo cache:** `web_store_ui/cache/` holds the generated images and raw API responses, so the app serves them without calling Arcade.
- **Re-imagine:** the button in the ad banner runs the full workflow again and makes a fresh Arcade API call. This creates a new product in the Arcade account and overwrites the cached item for that product.

### Run it locally

```sh
cd web_store_ui
npm start
```

Then open `http://localhost:3000`.

To run your own copy on a hostname other than localhost, set `PUBLIC_HOST` to that hostname (no `https://`):

```sh
PUBLIC_HOST=your-host.example.com HOST=0.0.0.0 npm start
```

Without `PUBLIC_HOST`, Instant Checkout and Re-imagine work on localhost only. Re-imagine also needs `ARCADE_API_KEY` set on the server.

### Other commands

- `npm test`: runs the test suite.
- `npm run generate-cache`: regenerates the Arcade demo cache. This needs `ARCADE_API_KEY` and creates a pattern and product in your Arcade account. Use it sparingly.

### Hosting

The public demo runs on Render as a web service, deployed from this repo with Auto-Deploy on each push to `main`. Render needs these settings:

- **Root directory:** `web_store_ui`
- **Start command:** `npm start`
- **Environment variables:** `HOST=0.0.0.0`, `PUBLIC_HOST=dynamicshop-cwsa.onrender.com`, and `ARCADE_API_KEY`
