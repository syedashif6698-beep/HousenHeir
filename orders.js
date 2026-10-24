mountHeader('orders'); mountFooter();
const when = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
(async () => {
  const { orders } = await api('/api/my-orders');
  if (!orders.length) { $('#list').innerHTML = '<div class="empty"><h2>No orders yet</h2><p class="muted">When you order, you can follow it here.</p><p style="margin-top:18px"><a class="btn" href="/home">See the designs</a></p></div>'; return; }
  const names = { awaiting_payment: ['Awaiting payment', ''], confirmed: ['Confirmed', 'ok'], packed: ['Packed', 'ok'], shipped: ['Shipped', 'ok'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'bad'], expired: ['Not completed', 'bad'] };
  $('#list').innerHTML = orders.map((o) => {
    const [label, cls] = names[o.status] || [o.status, ''];
    return `<div class="order"><div><h3 style="font-size:1.2rem">${esc(o.id)}</h3><p class="muted small">${when(o.createdAt)} · ${o.items.map((l) => `${esc(l.name)} ${esc(l.size)} × ${l.qty}`).join(', ')}</p></div>
      <div style="text-align:right"><span class="pill ${cls}">${label}</span><p style="margin:6px 0">${inr(o.total)} <span class="muted small">${o.pay.method === 'cod' ? 'cash on delivery' : 'online'}</span></p>
        <a class="btn btn-sm" href="/order/${esc(o.id)}">${o.status === 'awaiting_payment' ? 'Pay now' : 'Track order'}</a> <button class="btn btn-sm btn-ghost" data-again="${esc(o.id)}" type="button">Order again</button></div></div>`;
  }).join('');
  $('#list').onclick = (e) => {
    const id = e.target.dataset.again; if (!id) return;
    orders.find((o) => o.id === id).items.forEach((l) => bag.add(l.productId, l.size, l.qty));
    toast('Added to your bag', { href: '/checkout', label: 'Checkout' });
  };
})().catch((e) => { $('#list').innerHTML = `<p class="msg err">${esc(e.message)}</p>`; });
