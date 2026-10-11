# DynamicShop

## The Problem

By the time a retail brand spots a viral trend, designs a product, clears supply chain, and launches a campaign, the trend is over. That process takes about three weeks.

## Our Solution

The Viral Vector Engine shortens that cycle to seconds:

1. **Product page input:** a shopper views a product page, such as a women's black wool jacket.
2. **Demand Intelligence:** identifies a complementary accessory (scarves, ribbon scarves, or pocket squares) and a trending style for it.
3. **Prompt Generator:** turns that trend into a design prompt (mocked Gemini call).
4. **Arcade Engine:** calls the Arcade API chain (`categories/list` → `patterns/create` → `products/create` → `checkouts/create`) to produce a production-ready product image and checkout link. Results are cached.
5. **Adtech Layer:** injects the generated product into the page's sponsored ad slot as a shoppable banner.

The three components run as sequential steps in the demo, not as side-by-side panels.

This is a mock hackathon project. Everything runs locally except the Arcade API calls, which are cached so the demo never waits on live requests.

## Live Demo

**https://striking-showing-celebrity-promised.trycloudflare.com/**

Before you open the link, make sure your **ad blocker is off** for this site. Otherwise the sponsored ad slot will not appear.

If you want to re-create this yourself, you are welcome to clone the repo and start a server locally (see Current Setup below).

## Current Setup

The demo lives in `web_store_ui/`:

- **Stack:** plain Node.js with no npm dependencies (Node 18+).
- **Store pages:** `web_store_ui/public/store/` (product pages with the ad slot), with static assets in `web_store_ui/public/`.
- **Server:** `web_store_ui/server.js`, listening on `127.0.0.1:3000` by default (override with `PORT`).
- **Arcade demo cache:** `web_store_ui/cache/` holds the generated images and raw API responses, so the app serves them without calling Arcade.
- **Re-imagine:** the button in the ad banner runs the full workflow again and makes a fresh Arcade API call. This creates a new product in the Arcade account and overwrites the cached item for that product.

### Run it locally

```sh
cd web_store_ui
npm start
```

Then open `http://localhost:3000`.

To make Instant Checkout work through the public tunnel link, start the server with the tunnel hostname in `PUBLIC_HOST`:

```sh
PUBLIC_HOST=striking-showing-celebrity-promised.trycloudflare.com npm start
```

Without `PUBLIC_HOST`, Instant Checkout works on localhost only. Re-imagine is localhost-only either way.

### Other commands

- `npm test`: runs the test suite.
- `npm run generate-cache`: regenerates the Arcade demo cache. This needs `ARCADE_API_KEY` and creates a pattern and product in your Arcade account. Use it sparingly.

### Sharing a public link

The public URL above uses a Cloudflare quick tunnel to the local server:

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

Quick tunnel URLs are random and change each time the tunnel restarts.
