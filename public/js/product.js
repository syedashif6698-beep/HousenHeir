mountHeader('home'); mountFooter();
const pid = decodeURIComponent(location.pathname.split('/').pop());

(async () => {
  let data;
  try { [data] = await Promise.all([api('/api/products/' + encodeURIComponent(pid)), wish.load()]); }
  catch (e) { $('#root').innerHTML = `<div class="empty"><h2>We could not find that design</h2><p class="muted">${esc(e.message)}</p><p style="margin-top:18px"><a class="btn" href="/home">Back to the shop</a></p></div>`; return; }
  const { product: p, sizes, maxQty } = data;
  document.title = p.name + ' | House & Heir';
  let size = '', qty = 1, saved = wish.ids.has(p.id);
  const back = p.images[1] || p.images[0];

  $('#root').innerHTML = `<div class="product">
    <div class="viewer-wrap">
      <div class="viewer" id="viewer" style="--sw:${esc(p.swatch)}"><div class="rot snap" id="rot">
        <div class="face"><span>${esc(p.name)}<br><small style="font-size:.9rem">Front</small></span><img class="fade" src="${esc(p.images[0])}" alt="${esc(p.name)}, front" decoding="async"></div>
        <div class="face back"><span>${esc(p.name)}<br><small style="font-size:.9rem">Back</small></span><img class="fade" src="${esc(back)}" alt="${esc(p.name)}, back" decoding="async"></div>
      </div></div>
      <div class="vbar"><button class="btn btn-sm btn-ghost" data-face="0" type="button">Front</button><button class="btn btn-sm btn-ghost" data-face="180" type="button">Back</button></div>
      <p class="vhint">Drag the shirt to turn it</p>
      ${p.images.length > 2 ? `<div class="details">${p.images.slice(2).map((s, i) => `<img src="${esc(s)}" alt="${esc(p.name)}, detail ${i + 1}" loading="lazy">`).join('')}</div>` : ''}
    </div>
    <div>
      <p class="muted">${p.collection === 'pongal' ? 'Pongal collection' : 'New arrival'} · ${esc(p.colour)}</p>
      <h1 style="font-size:clamp(2.2rem,5vw,3.6rem);margin:6px 0 8px">${esc(p.name)}</h1>
      <p class="price" style="font-size:1.9rem">${inr(p.price)}</p>
      <p class="pdesc">${esc(p.tagline)} ${esc(p.description)}</p>
      ${p.fewLeft ? '<p class="notice"><strong>Only a few pieces left</strong> in this design.</p>' : ''}
      <p class="notice">You pay nothing now. Choose cash on delivery, or pay online with any UPI app, card or netbanking at checkout.</p>
      <div class="field"><label>Size <span class="muted small">(number is chest in inches)</span></label>
        <div class="sizes">${sizes.map((s) => `<label class="size"><input type="radio" name="size" value="${esc(s)}" ${p.sizes[s] === 'out' ? 'disabled' : ''}><span>${esc(s)}</span><small>${p.sizes[s] === 'out' ? 'Sold out' : p.sizes[s] === 'low' ? 'Few left' : ''}</small></label>`).join('')}</div></div>
      <div class="field"><label>Quantity</label><div class="qty"><button type="button" id="minus" aria-label="Less">−</button><b id="q">1</b><button type="button" id="plus" aria-label="More">+</button></div></div>
      <p class="msg" id="msg" role="alert"></p>
      <button class="btn btn-block" id="buy" type="button" ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Pre-order now' : 'Sold out'}</button>
      <div class="buy" style="margin-top:10px"><button class="btn btn-ghost" id="add" type="button" ${p.inStock ? '' : 'disabled'}>Add to bag</button><button class="btn btn-ghost" id="save" type="button" aria-pressed="${saved}">${saved ? 'Saved' : 'Save for later'}</button></div>
      <div style="margin-top:26px">
        <details class="acc"><summary>Size guide</summary><div><table><tr><th>Size</th><th>Chest (inches)</th></tr><tr><td>M</td><td>38</td></tr><tr><td>L</td><td>40</td></tr><tr><td>XL</td><td>42</td></tr><tr><td>XXL</td><td>44</td></tr></table></div></details>
        <details class="acc"><summary>Payment</summary><div>Pay only at the end. Cash on delivery, or online with GPay, PhonePe, Paytm, BHIM or any UPI app, plus cards, netbanking and wallets. We never see your card or UPI details.</div></details>
        <details class="acc"><summary>Delivery and returns</summary><div>See our <a href="/policy/shipping">shipping policy</a> and <a href="/policy/returns">returns policy</a>. Every order can be tracked from My orders.</div></details>
      </div>
    </div></div>`;

  // ----- 3D turn viewer -----
  const viewer = $('#viewer'), rot = $('#rot');
  let angle = 0, drag = null;
  const set = (a, snap) => { angle = a; rot.classList.toggle('snap', !!snap); rot.style.setProperty('--a', a + 'deg'); };
  const settle = () => { const n = Math.round(angle / 180) * 180; set(n, true); };
  viewer.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, a: angle }; viewer.setPointerCapture(e.pointerId); rot.classList.remove('snap'); });
  viewer.addEventListener('pointermove', (e) => { if (drag) set(drag.a + (e.clientX - drag.x) * 0.45, false); });
  const end = () => { if (drag) { drag = null; settle(); } };
  viewer.addEventListener('pointerup', end); viewer.addEventListener('pointercancel', end);
  $$('[data-face]').forEach((b) => b.onclick = () => set(+b.dataset.face, true));
  // a gentle intro turn so people discover it
  if (!reduceMotion) { set(-28, false); setTimeout(() => set(0, true), 350); }
  $$('img.fade', viewer).forEach((i) => { if (i.complete) i.classList.add('in'); });

  // ----- choices -----
  const msg = (t) => { $('#msg').textContent = t || ''; $('#msg').className = 'msg ' + (t ? 'err' : ''); };
  $$('input[name=size]').forEach((r) => r.addEventListener('change', () => { size = r.value; msg(''); }));
  $('#minus').onclick = () => { qty = Math.max(1, qty - 1); $('#q').textContent = qty; };
  $('#plus').onclick = () => { qty = Math.min(maxQty, qty + 1); $('#q').textContent = qty; };
  const need = () => { if (!size) { msg('Choose a size first.'); $('.sizes').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 260 }); return false; } return true; };
  $('#add').onclick = () => { if (!need()) return; bag.add(p.id, size, qty); toast(`${p.name} (${size}) added to your bag`, { href: '/checkout', label: 'View bag' }); };
  $('#buy').onclick = () => { if (!need()) return; bag.add(p.id, size, qty); location.href = '/checkout'; };
  $('#save').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { saved = await wish.toggle(p.id); $('#save').textContent = saved ? 'Saved' : 'Save for later'; $('#save').setAttribute('aria-pressed', saved); toast(saved ? 'Saved to your list' : 'Removed from your list'); } catch (err) { toast(err.message); }
    e.currentTarget.disabled = false;
  };
})();
