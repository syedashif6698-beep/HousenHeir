mountHeader('checkout'); mountFooter();
const root = $('#root');
let opts = { online: false, cod: true }, me = null, q = null, method = '', coupon = '', busy = false;

const emptyState = () => { root.innerHTML = `<div class="empty"><h2>Your bag is empty</h2><p class="muted">Pick a design and size to get started.</p><p style="margin-top:18px"><a class="btn" href="/home">Browse designs</a></p></div>`; };

async function requote() {
  const items = bag.get();
  if (!items.length) return emptyState();
  const ask = (c) => api('/api/quote', { method: 'POST', body: { items, coupon: c, method } });
  const cm = $('#cmsg'), pm = $('#pmsg');
  if (pm) { pm.textContent = ''; pm.className = 'msg'; }
  try {
    q = await ask(coupon);
    if (cm) { cm.textContent = q.coupon ? `Code ${q.coupon} applied.` : ''; cm.className = 'msg ok'; }
  } catch (e) {
    if (coupon) {
      coupon = ''; if (cm) { cm.textContent = e.message; cm.className = 'msg err'; }
      try { q = await ask(''); } catch (e2) { q = null; if (pm) { pm.textContent = e2.message; pm.className = 'msg err'; } }
    } else { q = null; if (pm) { pm.textContent = e.message; pm.className = 'msg err'; } }
  }
  paint();
}

function paint() {
  const el = $('#summary'); if (!el) return;
  if (!q) { el.innerHTML = '<p class="muted">We could not price your bag. Check the items and try again.</p>'; $('#place').disabled = true; return; }
  const bad = q.lines.some((l) => !l.inStock);
  el.innerHTML = q.lines.map((l, i) => `<div class="line-item"><div class="thumb" style="--sw:${esc(l.swatch)}"><img src="${esc(l.image)}" alt="" loading="lazy"></div>
      <div><b style="font-weight:500;color:var(--ink)">${esc(l.name)}</b><div class="muted small">Size ${esc(l.size)}</div>
        <div class="qty" style="margin-top:6px"><button type="button" data-dec="${i}" aria-label="Less">−</button><b>${l.qty}</b><button type="button" data-inc="${i}" aria-label="More">+</button></div>
        ${l.inStock ? '' : '<div class="small" style="color:var(--bad);margin-top:4px">Not available in this quantity. Lower it or remove it.</div>'}</div>
      <div style="text-align:right">${inr(l.lineTotal)}<div><button class="linkbtn small muted" type="button" data-rm="${i}">Remove</button></div></div></div>`).join('')
    + `<div class="sum" style="margin-top:12px"><div><span>Subtotal</span><span>${inr(q.subtotal)}</span></div>
      ${q.discount ? `<div><span>Code ${esc(q.coupon)}</span><span>− ${inr(q.discount)}</span></div>` : ''}
      <div><span>Shipping</span><span>${q.shipping ? inr(q.shipping) : 'Free'}</span></div>
      ${q.codFee ? `<div><span>Cash on delivery fee</span><span>${inr(q.codFee)}</span></div>` : ''}
      <div class="tot"><span>Total</span><span>${inr(q.total)}</span></div></div>`;
  $('#place').disabled = busy || bad || !method;
  $('#place').textContent = method === 'cod' ? `Place order · pay ${inr(q.total)} on delivery` : `Place order and pay ${inr(q.total)}`;
}

function mutate(fn) { const l = bag.get(); fn(l); bag.set(l.filter((x) => x.qty > 0)); requote(); }

(async () => {
  if (!bag.get().length) return emptyState();
  [opts, me] = await Promise.all([api('/api/checkout/options'), api('/api/me')]);
  const a = me.address || {};
  method = opts.online ? 'upi' : opts.cod ? 'cod' : '';
  root.innerHTML = `<h1 style="font-size:clamp(2.2rem,5vw,3.2rem);margin-bottom:26px">Checkout</h1>
  <div class="checkout">
    <div>
      <form class="box" id="form" novalidate>
        <h3>Delivery details</h3>
        <div class="row2"><div class="field"><label for="a-name">Full name</label><input id="a-name" autocomplete="name" value="${esc(a.name || me.name)}" maxlength="60"></div>
          <div class="field"><label for="a-phone">Mobile number</label><input id="a-phone" type="tel" autocomplete="tel" value="${esc(a.phone || me.phone)}" maxlength="15"></div></div>
        <div class="field"><label for="a-line">Address</label><textarea id="a-line" autocomplete="street-address" maxlength="250" placeholder="House number, street, area">${esc(a.line || '')}</textarea></div>
        <div class="row2"><div class="field"><label for="a-city">City</label><input id="a-city" autocomplete="address-level2" value="${esc(a.city || '')}" maxlength="60"></div>
          <div class="field"><label for="a-state">State</label><input id="a-state" autocomplete="address-level1" value="${esc(a.state || '')}" maxlength="40"></div></div>
        <div class="field" style="max-width:200px"><label for="a-pin">Pincode</label><input id="a-pin" inputmode="numeric" autocomplete="postal-code" value="${esc(a.pincode || '')}" maxlength="6"></div>
      </form>
      <div class="box">
        <h3>How would you like to pay?</h3>
        <p class="muted small" style="margin:-6px 0 14px">You pay only now, at the end. Nothing was charged before this step.</p>
        ${opts.online ? `<label class="pay-opt"><input type="radio" name="pm" value="upi" checked><span><b>UPI</b><small>GPay, PhonePe, Paytm, BHIM and any UPI app</small></span></label>
        <label class="pay-opt"><input type="radio" name="pm" value="online"><span><b>Card, netbanking or wallet</b><small>Debit and credit cards, all major banks, wallets</small></span></label>` : ''}
        ${opts.cod ? `<label class="pay-opt"><input type="radio" name="pm" value="cod" ${opts.online ? '' : 'checked'}><span><b>Cash on delivery</b><small>Pay the delivery partner when your order arrives</small></span></label>` : ''}
        ${!opts.online && !opts.cod ? '<p class="msg err">Payment is not available right now. Please try again shortly.</p>' : ''}
        <p class="msg" id="pmsg" role="alert"></p>
      </div>
    </div>
    <div class="box sticky"><h3>Your bag</h3><div id="summary"><div class="sk" style="height:120px"></div></div>
      <div class="field" style="margin-top:16px"><label for="coupon">Have a code?</label><div class="coupon"><input id="coupon" maxlength="30" autocomplete="off" placeholder="Enter code"><button class="btn btn-ghost btn-sm" id="apply" type="button">Apply</button></div><p class="msg" id="cmsg"></p></div>
      <button class="btn btn-block" id="place" type="button" disabled>Place order</button>
      <p class="small muted" style="margin-top:12px;text-align:center">By placing your order you agree to our <a href="/policy/terms">Terms</a>, <a href="/policy/shipping">Shipping</a> and <a href="/policy/returns">Returns</a> policies.</p>
    </div>
  </div>`;

  $$('input[name=pm]').forEach((r) => r.addEventListener('change', () => { method = r.value; requote(); }));
  $('#apply').onclick = () => { coupon = $('#coupon').value.trim(); requote(); };
  $('#summary').addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc],[data-dec],[data-rm]'); if (!t) return;
    mutate((l) => { const i = +(t.dataset.inc ?? t.dataset.dec ?? t.dataset.rm); if (t.dataset.rm !== undefined) l[i].qty = 0; else l[i].qty = Math.max(0, Math.min(3, l[i].qty + (t.dataset.inc !== undefined ? 1 : -1))); });
  });

  $('#place').onclick = async () => {
    const pm = $('#pmsg'); pm.textContent = ''; pm.className = 'msg';
    const address = { name: $('#a-name').value, phone: $('#a-phone').value, line: $('#a-line').value, city: $('#a-city').value, state: $('#a-state').value, pincode: $('#a-pin').value };
    busy = true; $('#place').disabled = true; $('#place').textContent = 'Placing your order…';
    let orderId = '';
    try {
      const r = await api('/api/checkout', { method: 'POST', body: { items: bag.get(), address, method, coupon } });
      orderId = r.orderId; bag.clear(); sessionStorage.removeItem('hh_prod');
      if (r.next === 'pay') { $('#place').textContent = 'Opening payment…'; await startPayment(orderId, undefined); }
      location.href = `/order/${encodeURIComponent(orderId)}?new=1`;
    } catch (e) {
      if (orderId) { location.href = `/order/${encodeURIComponent(orderId)}?retry=1`; return; }
      pm.textContent = e.message; pm.className = 'msg err'; busy = false; requote();
    }
  };
  requote();
})().catch((e) => { root.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; });
