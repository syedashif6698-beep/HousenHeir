mountHeader('orders'); mountFooter();
const oid = decodeURIComponent(location.pathname.split('/').pop());
const root = $('#root');
const STEPS = [['placed', 'Order placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];
const when = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
let tried = new Set(), tick = null;

const KOLAM = '<svg class="kolam" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M50 10 L90 50 L50 90 L10 50 Z M50 26 L74 50 L50 74 L26 50 Z M50 10 C62 24 62 36 50 50 C38 36 38 24 50 10 Z M90 50 C76 62 64 62 50 50 C64 38 76 38 90 50 Z M50 90 C38 76 38 64 50 50 C62 64 62 76 50 90 Z M10 50 C24 38 36 38 50 50 C36 62 24 62 10 50 Z"/><circle cx="50" cy="50" r="3"/><circle cx="50" cy="10" r="2.4"/><circle cx="90" cy="50" r="2.4"/><circle cx="50" cy="90" r="2.4"/><circle cx="10" cy="50" r="2.4"/></svg>';

function statusPill(o) {
  const m = { awaiting_payment: ['Awaiting payment', ''], confirmed: ['Confirmed', 'ok'], packed: ['Packed', 'ok'], shipped: ['Shipped', 'ok'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'bad'], expired: ['Payment window ended', 'bad'] }[o.status] || [o.status, ''];
  return `<span class="pill ${m[1]}">${m[0]}</span>`;
}

function render(o, fresh) {
  clearInterval(tick);
  const first = o.address && o.address.name ? o.address.name.split(' ')[0] : '';
  const done = new Map((o.timeline || []).map((t) => [t.s, t.at]));
  const closed = ['cancelled', 'expired'].includes(o.status);
  const steps = STEPS.map(([k, label]) => `<li class="${done.has(k) ? 'done' : ''}"><i></i><b style="font-weight:500">${label}</b>${done.has(k) ? `<small>${when(done.get(k))}</small>` : ''}${k === 'shipped' && o.tracking && o.tracking.number ? `<small>${esc(o.tracking.courier || 'Courier')} · ${esc(o.tracking.number)}</small>` : ''}</li>`).join('');
  const awaiting = o.status === 'awaiting_payment' && new Date(o.expiresAt) > Date.now();
  const head = fresh && ['confirmed', 'packed', 'shipped', 'delivered'].includes(o.status)
    ? `<div style="text-align:center;margin-bottom:26px">${KOLAM}<h1 style="font-size:clamp(2.2rem,5vw,3.4rem)">Thank you${first ? ', ' + esc(first) : ''}.</h1><p class="muted" style="margin-top:8px">${o.pay.method === 'cod' ? 'Your order is confirmed. Keep cash ready for delivery.' : 'Your payment is received and your order is confirmed.'}</p></div>`
    : `<h1 style="font-size:clamp(2rem,4.5vw,3rem);margin-bottom:6px">Order ${esc(o.id)}</h1><p class="muted">Placed ${when(o.createdAt)} &nbsp; ${statusPill(o)}</p>`;
  const payLine = o.pay.method === 'cod'
    ? (o.pay.status === 'cod_collected' ? 'Cash on delivery. Paid.' : `Cash on delivery. Pay ${inr(o.total)} when it arrives.`)
    : o.pay.status === 'paid' ? `Paid online (${o.pay.method === 'upi' ? 'UPI' : 'card, netbanking or wallet'}).` : 'Online payment pending.';

  root.innerHTML = `${head}
    ${awaiting ? `<div class="box" style="margin-bottom:18px"><h3>Complete your payment</h3><p class="muted small" id="left" style="margin:-6px 0 12px"></p><p class="msg" id="pmsg" role="alert"></p><button class="btn btn-block" id="pay" type="button">Pay ${inr(o.total)}</button></div>` : ''}
    ${o.status === 'expired' ? '<div class="box" style="margin-bottom:18px"><p>The payment window ended, so the pieces were released. You can order again.</p><p style="margin-top:12px"><button class="btn" id="again" type="button">Order again</button></p></div>' : ''}
    <div class="box"><h3>Progress</h3>${closed ? `<p>${o.status === 'cancelled' ? 'This order was cancelled.' : 'This order was not completed.'}</p>` : `<ul class="timeline">${steps}</ul>`}</div>
    <div class="box"><h3>Items</h3>${o.items.map((l) => `<div class="line-item" style="grid-template-columns:1fr auto"><div><b style="font-weight:500;color:var(--ink)">${esc(l.name)}</b><div class="muted small">Size ${esc(l.size)} · Qty ${l.qty}</div></div><div>${inr(l.price * l.qty)}</div></div>`).join('')}
      <div class="sum" style="margin-top:10px"><div><span>Subtotal</span><span>${inr(o.subtotal)}</span></div>${o.discount ? `<div><span>Code ${esc(o.coupon)}</span><span>− ${inr(o.discount)}</span></div>` : ''}
      <div><span>Shipping</span><span>${o.shipping ? inr(o.shipping) : 'Free'}</span></div>${o.codFee ? `<div><span>Cash on delivery fee</span><span>${inr(o.codFee)}</span></div>` : ''}<div class="tot"><span>Total</span><span>${inr(o.total)}</span></div></div>
      <p class="small muted">${esc(payLine)}</p></div>
    <div class="box"><h3>Delivering to</h3><p>${esc(o.address.name || '')}<br>${esc(o.address.line)}<br>${esc(o.address.city)}${o.address.state ? ', ' + esc(o.address.state) : ''} ${esc(o.address.pincode)}<br>${esc(o.address.phone || '')}</p></div>
    <p style="margin-top:22px"><button class="btn" id="again2" type="button">Order again</button> <a class="btn btn-ghost" href="/orders">All my orders</a> <a class="btn btn-ghost" href="/contact">Need help?</a></p>`;

  const again = () => { o.items.forEach((l) => bag.add(l.productId, l.size, l.qty)); location.href = '/checkout'; };
  $('#again') && ($('#again').onclick = again); $('#again2').onclick = again;

  if (awaiting) {
    const upd = () => { const s = Math.max(0, Math.floor((new Date(o.expiresAt) - Date.now()) / 1000)); $('#left').textContent = s ? `Your pieces are held for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'The hold has ended. Refresh this page.'; if (!s) { clearInterval(tick); $('#pay').disabled = true; } };
    upd(); tick = setInterval(upd, 1000);
    $('#pay').onclick = async () => {
      const pm = $('#pmsg'); pm.textContent = ''; $('#pay').disabled = true;
      try { await startPayment(o.id, tried.size ? ['razorpay', 'cashfree'].find((g) => !tried.has(g)) : undefined); await load(true); }
      catch (e) {
        pm.textContent = e.message; pm.className = 'msg err'; $('#pay').disabled = false;
        if (e.data && e.data.backup) { const next = ['razorpay', 'cashfree'].find((g) => !tried.has(g)); tried.add(next || 'x'); $('#pay').textContent = 'Try the other payment option'; }
      }
    };
  }
}

async function load(fresh) {
  const { order } = await api('/api/orders/' + encodeURIComponent(oid));
  // coming back from a payment page that redirected: confirm with the gateway
  if (order.status === 'awaiting_payment' && order.pay.gateway === 'cashfree' && !load.checked) {
    load.checked = true;
    try { await api('/api/payment/verify', { method: 'POST', body: { orderId: oid, gateway: 'cashfree' } }); return load(true); } catch {}
  }
  render(order, fresh || new URLSearchParams(location.search).has('new'));
  return order;
}
load().catch((e) => { root.innerHTML = `<div class="empty"><h2>We could not open that order</h2><p class="muted">${esc(e.message)}</p><p style="margin-top:18px"><a class="btn" href="/orders">My orders</a></p></div>`; });
