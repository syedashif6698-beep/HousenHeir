const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function api(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (r.status === 401 && !opts.noRedirect) { location.href = '/'; throw new Error('Please sign in.'); }
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Try again.'); e.data = j; throw e; }
  return j;
}

// images fade in when loaded; a missing image never shows a broken icon
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); }, true);
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG') return;
  if (t.classList.contains('brand-logo')) t.remove(); else t.style.visibility = 'hidden';
}, true);

// ---------- icons ----------
const IC = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.6 3.7 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.300 0 5.400 3.100 4.200 6.700-1.700 4.700-9.200 9.300-9.200 9.300z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.200 4-6 8-6s7 1.800 8 6"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M4 10l8-6 8 6v10H4V10z"/><path d="M10 20v-6h4v6"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3 7.500L12 3l9 4.500v9L12 21l-9-4.500v-9z"/><path d="M3 7.500L12 12l9-4.500M12 12v9"/></svg>'
};

// ---------- bag (kept on this device) ----------
const bag = {
  get() { try { return JSON.parse(localStorage.getItem('hh_bag') || '[]'); } catch { return []; } },
  set(list) { localStorage.setItem('hh_bag', JSON.stringify(list)); this.badge(); },
  add(productId, size, qty = 1) {
    const l = this.get(); const f = l.find((x) => x.productId === productId && x.size === size);
    if (f) f.qty = Math.min(3, f.qty + qty); else l.push({ productId, size, qty: Math.min(3, qty) });
    this.set(l);
  },
  count() { return this.get().reduce((a, x) => a + x.qty, 0); },
  clear() { this.set([]); },
  badge() { $$('[data-bag]').forEach((el) => { const n = this.count(); el.textContent = n || ''; el.dataset.n = n; }); }
};

// ---------- products and wishlist (short cache for speed) ----------
async function getProducts() {
  try { const c = JSON.parse(sessionStorage.getItem('hh_prod') || 'null'); if (c && Date.now() - c.t < 45000) return c.v; } catch {}
  const v = await api('/api/products');
  try { sessionStorage.setItem('hh_prod', JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}
const wish = { ids: new Set(), async load() { try { this.ids = new Set((await api('/api/wishlist')).ids); } catch {} this.badge(); },
  badge() { $$('[data-wish]').forEach((el) => { el.textContent = this.ids.size || ''; el.dataset.n = this.ids.size; }); },
  async toggle(id) { const r = await api('/api/wishlist', { method: 'POST', body: { productId: id } }); r.saved ? this.ids.add(id) : this.ids.delete(id); this.badge(); return r.saved; } };

function toast(text, link) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = esc(text) + (link ? `<a href="${esc(link.href)}">${esc(link.label)}</a>` : '');
  t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- header, tabs, footer ----------
async function mountHeader(active) {
  const el = $('#site-header');
  if (!el) return;
  el.className = 'site-header';
  const cur = (k) => (active === k ? 'on' : '');
  el.innerHTML = `<div class="wrap bar"><a class="brand" href="/home"><img class="brand-logo" src="/images/logo.png" alt=""><span class="brand-name">House &amp; Heir</span></a>
    <nav class="nav" aria-label="Main"><a href="/home" class="${cur('home')}">Shop</a><a href="/book" class="${cur('book')}">Book a fitting</a><a href="/contact" class="${cur('contact')}">Contact</a><a href="/orders" class="${cur('orders')}">My orders</a></nav>
    <div class="tools">
      <a class="icon hide-m" href="/wishlist" aria-label="Saved designs">${IC.heart}<span class="count" data-wish data-n="0"></span></a>
      <a class="icon" href="/checkout" aria-label="Bag">${IC.bag}<span class="count" data-bag data-n="0"></span></a>
      <details class="acct"><summary class="icon" aria-label="Account">${IC.user}</summary>
        <div class="menu"><div class="who" id="who"></div><a href="/orders">My orders</a><a href="/wishlist">Saved designs</a><a href="/book">Book a fitting</a><a href="/contact">Contact us</a><button type="button" id="logout">Sign out</button></div></details>
    </div></div>`;
  const tabs = document.createElement('nav');
  tabs.className = 'tabs'; tabs.setAttribute('aria-label', 'Quick links');
  tabs.innerHTML = `<a href="/home" class="${cur('home')}">${IC.shop}Shop</a><a href="/wishlist" class="${cur('wishlist')}">${IC.heart}Saved<span class="count" data-wish data-n="0"></span></a>
    <a href="/checkout" class="${cur('checkout')}">${IC.bag}Bag<span class="count" data-bag data-n="0"></span></a><a href="/orders" class="${cur('orders')}">${IC.box}Orders</a>`;
  document.body.appendChild(tabs);
  $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST', body: {}, noRedirect: true }); bag.clear(); sessionStorage.clear(); location.href = '/'; };
  document.addEventListener('click', (e) => { const d = $('.acct'); if (d && d.open && !d.contains(e.target)) d.open = false; });
  bag.badge(); wish.load();
  api('/api/me').then((me) => { $('#who').textContent = 'Signed in as ' + me.name; }).catch(() => {});
}

const QUOTES = [
  ['Fashion fades, only style remains the same.', 'Coco Chanel'],
  ['Elegance is not about being noticed, it is about being remembered.', 'Giorgio Armani'],
  ['I don’t design clothes, I design dreams.', 'Ralph Lauren']
];
function mountFooter() {
  const el = $('#site-footer');
  if (!el) return;
  el.className = 'site-footer';
  const [q, who] = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  el.innerHTML = `<div class="wrap" id="about"><div class="foot-grid">
    <div><h2>About us</h2>
      <p style="margin-top:14px;max-width:52ch">House &amp; Heir makes limited-edition celebration wear rooted in Tamil heritage. Every design is made in a small batch, so what you wear stays rare. Each shirt carries a detailed print on the front and the back.</p></div>
    <div><h3>Write to us</h3><ul>
      <li><a href="mailto:founder@housenheir.com">founder@housenheir.com</a></li>
      <li><a href="mailto:admin@housenheir.com">admin@housenheir.com</a></li>
      <li><a href="mailto:sale@housenheir.com">sale@housenheir.com</a></li></ul>
      <p style="margin-top:14px"><a href="/book">Book a fitting</a> &nbsp;·&nbsp; <a href="/contact">Send an enquiry</a></p>
      <p style="margin-top:8px">Instagram: <a href="https://instagram.com/housenheir" target="_blank" rel="noopener">@housenheir</a></p></div></div>
    <div class="quote"><p>“${esc(q)}”</p><cite>${esc(who)}</cite></div>
    <p class="copy"><a href="/policy/shipping">Shipping</a> · <a href="/policy/returns">Returns &amp; refunds</a> · <a href="/policy/privacy">Privacy</a> · <a href="/policy/terms">Terms</a></p>
    <p class="copy">© ${new Date().getFullYear()} House &amp; Heir. All rights reserved.</p></div>`;
}

// ---------- 3D tilt on cards (mouse only) ----------
function tilt(el, max = 7) {
  let raf = 0;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduceMotion) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (x * 100).toFixed(0) + '%'); el.style.setProperty('--my', (y * 100).toFixed(0) + '%');
      el.classList.add('hot');
    });
  });
  el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.classList.remove('hot'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

// ---------- product cards ----------
function productCard(p) {
  const saved = wish.ids.has(p.id);
  const tag = !p.inStock ? '<span class="tag sold">Sold out</span>' : p.fewLeft ? '<span class="tag few">Few left</span>' : `<span class="tag">${p.collection === 'pongal' ? 'Pongal collection' : 'New arrival'}</span>`;
  return `<article class="card ${p.inStock ? '' : 'soldout'}" data-tilt>
    <a class="card-link" href="/product/${esc(p.id)}" aria-label="${esc(p.name)}"></a>
    <div class="ph" style="--sw:${esc(p.swatch)}">${tag}<span class="ph-name">${esc(p.name)}</span><img class="fade" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">
      <button class="heart ${saved ? 'on' : ''}" type="button" data-heart="${esc(p.id)}" aria-label="Save ${esc(p.name)}" aria-pressed="${saved}">${IC.heart}</button></div>
    <div class="card-body"><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.colour)}</p>
      <div class="row"><span class="price">${inr(p.price)}</span><span class="btn btn-sm">${p.inStock ? 'Pre-order' : 'View'}</span></div></div></article>`;
}
function bindCards(root = document) {
  $$('[data-tilt]', root).forEach((c) => tilt(c));
  root.addEventListener('click', async (e) => {
    const h = e.target.closest('[data-heart]'); if (!h) return;
    e.preventDefault(); h.disabled = true;
    try { const on = await wish.toggle(h.dataset.heart); h.classList.toggle('on', on); h.setAttribute('aria-pressed', on); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); toast(on ? 'Saved to your list' : 'Removed from your list'); } catch (err) { toast(err.message); }
    h.disabled = false;
  });
}

// ---------- online payment (Razorpay / Cashfree), shared by checkout and order pages ----------
function loadScript(src) {
  return new Promise((ok, no) => {
    if ([...document.scripts].some((x) => x.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the payment window. Check your connection.')); document.head.appendChild(s);
  });
}
async function startPayment(orderId, gateway) {
  const verify = (extra) => api('/api/payment/verify', { method: 'POST', body: { orderId, ...extra } });
  const c = await api('/api/payment/create', { method: 'POST', body: { orderId, gateway } });
  if (c.mode === 'paid') return;
  if (c.mode === 'dev') { if (!confirm('Test mode: pretend the payment succeeded?')) throw new Error('Payment cancelled.'); return void (await verify({ gateway: 'dev' })); }
  if (c.mode === 'cashfree') {
    await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
    const r = await Cashfree({ mode: c.env }).checkout({ paymentSessionId: c.sessionId, redirectTarget: '_modal' });
    if (r && r.error) throw Object.assign(new Error(r.error.message || 'The payment did not go through.'), { data: { backup: c.backup } });
    return void (await verify({ gateway: 'cashfree' }));
  }
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  const block = c.upiOnly
    ? { blocks: { upi: { name: 'Pay with UPI (GPay, PhonePe, Paytm, BHIM)', instruments: [{ method: 'upi' }] } }, sequence: ['block.upi'] }
    : { blocks: { other: { name: 'Cards, netbanking and wallets', instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }] } }, sequence: ['block.other'] };
  await new Promise((resolve, reject) => {
    const rz = new Razorpay({
      key: c.keyId, order_id: c.rzpOrderId, amount: c.amount, currency: 'INR', name: 'House & Heir', description: 'Your order ' + orderId,
      prefill: { name: c.name, email: c.email, contact: c.phone }, theme: { color: '#5B3A29' },
      config: { display: { ...block, preferences: { show_default_blocks: false } } },
      handler: (r) => verify({ gateway: 'razorpay', ...r }).then(resolve, reject),
      modal: { ondismiss: () => reject(Object.assign(new Error('The payment window was closed. Your order is held for 15 minutes.'), { data: { backup: c.backup } })) }
    });
    rz.on('payment.failed', () => reject(Object.assign(new Error('The payment did not go through. You can try again.'), { data: { backup: c.backup } })));
    rz.open();
  });
}

// chat assistant on every page
document.addEventListener('DOMContentLoaded', () => { if (document.body.hasAttribute('data-nochat')) return; const s = document.createElement('script'); s.src = '/js/chat.js?v=3'; s.defer = true; document.body.appendChild(s); });
