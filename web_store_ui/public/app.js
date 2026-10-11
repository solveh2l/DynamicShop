(function () {
  const STEPS = [
    { label: 'Demand Intelligence: finding a complementary item…', ms: 900 },
    { label: 'Prompt Generator: checking what is trending…', ms: 1100 },
    { label: 'Arcade Engine: designing your product…', ms: 1400 },
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = () => document.body.dataset.productSlug || '';

  function getSignal() {
    if (window.DYNAMICSHOP) return window.DYNAMICSHOP;
    const d = document.body.dataset;
    return { productType: d.productType, attrs: (d.attrs || '').split(',').map((s) => s.trim()).filter(Boolean) };
  }

  async function request(url, options) {
    const r = await fetch(url, options);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
    return j;
  }
  const post = (url, body) =>
    request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function showStatus(slot, text, isError) {
    slot.innerHTML = `<div class="ds-status${isError ? ' ds-error' : ''}">${isError ? '' : '<span class="ds-spinner"></span>'}${esc(text)}</div>`;
  }

  function renderAd(slot, entry, viralSources) {
    const isReal = !entry.fixture && Boolean(entry.productId);
    const price = entry.price ? `<div class="ds-price">${esc(entry.price)}</div><div class="ds-note">Per unit · shipping &amp; tax calculated at checkout</div>` : '';
    const viral = viralSources && viralSources[0] ? `<p class="ds-viral">Trending: ${esc(viralSources[0])}</p>` : '';
    const version = entry.version > 1 ? `<span>·</span><span>Design v${esc(entry.version)}</span>` : '';
    slot.innerHTML = `
      <aside class="ds-ad" data-ad-slot="sponsored" aria-label="Sponsored: ${esc(entry.productName)}">
        <img src="${esc(entry.imageUrl)}" alt="${esc(entry.productName)}">
        <div class="ds-ad-body">
          <div>
            <div class="ds-label"><span>Sponsored</span><span>·</span><span class="ds-edit">Studio Edit</span>${version}</div>
            <p class="ds-title">${esc(entry.productName)}</p>
            ${viral}
            ${price}
          </div>
          <div>
            <div class="ds-actions">
              <button class="ds-checkout" type="button">Instant Checkout</button>
              <button class="ds-reimagine" type="button" title="Design a brand-new version with Arcade (creates a new product in your Arcade account)">✦ Re-imagine</button>
            </div>
            <p class="ds-progress" aria-live="polite" hidden></p>
          </div>
        </div>
      </aside>`;

    const checkoutBtn = slot.querySelector('.ds-checkout');
    const reBtn = slot.querySelector('.ds-reimagine');
    const progress = slot.querySelector('.ds-progress');
    const say = (text, isError) => {
      progress.hidden = !text;
      progress.textContent = text || '';
      progress.classList.toggle('ds-error-text', Boolean(isError));
    };
    const lock = (locked) => {
      checkoutBtn.disabled = locked;
      reBtn.disabled = locked;
    };

    checkoutBtn.addEventListener('click', async () => {
      if (!isReal) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = '✓ Added (mock)';
        return;
      }
      // Open the tab synchronously (popup blockers), then point it at the checkout once we have the URL.
      const tab = window.open('about:blank', '_blank');
      lock(true);
      say('Opening Arcade checkout…');
      try {
        const { checkoutUrl } = await post('/api/checkout', { slug: slug() });
        if (!/^https:\/\//.test(checkoutUrl)) throw new Error('Unexpected checkout URL');
        if (tab) {
          tab.opener = null;
          tab.location.href = checkoutUrl;
        } else {
          window.location.href = checkoutUrl;
        }
        say('');
      } catch (e) {
        if (tab) tab.close();
        say(`Could not open checkout: ${e.message}`, true);
      } finally {
        lock(false);
      }
    });

    reBtn.addEventListener('click', async () => {
      const idleLabel = reBtn.innerHTML;
      lock(true);
      reBtn.classList.add('ds-loading');
      reBtn.innerHTML = '<span class="ds-spinner" aria-hidden="true"></span>Re-imagine';
      say('This might take 2-3 minutes…');
      try {
        const { jobId } = await post('/api/reimagine', { slug: slug() });
        const deadline = Date.now() + 12 * 60 * 1000;
        for (;;) {
          await sleep(3000);
          const s = await request(`/api/reimagine/status?id=${encodeURIComponent(jobId)}`);
          if (s.state === 'error') throw new Error(s.error || 'Arcade could not make this item');
          // renderAd replaces the whole ad, so the spinner and the timing text disappear with it.
          if (s.state === 'done') return renderAd(slot, s.entry, s.viralSources);
          if (Date.now() > deadline) throw new Error('Timed out waiting for Arcade');
        }
      } catch (e) {
        reBtn.classList.remove('ds-loading');
        reBtn.innerHTML = idleLabel;
        say(`Re-imagine failed: ${e.message}. Your previous item is unchanged.`, true);
        lock(false);
      }
    });
  }

  let running = false;
  async function run() {
    const slot = document.getElementById('ad-slot');
    if (!slot) return console.error('[DynamicShop] #ad-slot not found');
    if (running) return;
    running = true;
    try {
      showStatus(slot, STEPS[0].label);
      const comp = await post('/api/complementary', getSignal());
      await sleep(STEPS[0].ms);

      showStatus(slot, STEPS[1].label);
      const gen = await post('/api/prompt', comp);
      await sleep(STEPS[1].ms);

      showStatus(slot, STEPS[2].label);
      const entry = await post('/api/arcade', { prompt: gen.prompt });
      await sleep(STEPS[2].ms);

      renderAd(slot, entry, gen.viralSources);
    } catch (e) {
      showStatus(
        slot,
        e.message === 'cache_miss' ? 'No cached ad for this product yet. Run: npm run seed' : `Could not load ad: ${e.message}`,
        true
      );
    } finally {
      running = false;
    }
  }

  document.addEventListener('DOMContentLoaded', run);
})();
