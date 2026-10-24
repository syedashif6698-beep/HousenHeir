const when = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
async function load() {
  try {
    const d = await api('/api/admin/inventory', { noRedirect: true });
    $('#login').hidden = true; $('#panel').hidden = false; $('#out').hidden = false;
    let A = 0, B = 0, H = 0, V = 0;
    const rows = d.inventory.map((p) => {
      const sum = (k) => p.sizes.reduce((x, s) => x + s[k], 0);
      A += sum('allocated'); B += sum('booked'); H += sum('held'); V += sum('available');
      return `<tr><td><strong>${esc(p.name)}</strong><br><span class="muted small">${p.collection === 'pongal' ? 'Pongal' : 'New arrival'}</span></td>
        ${p.sizes.map((s) => `<td class="${s.available <= 5 ? 'low' : ''}">${s.available} <span class="muted small">/ ${s.allocated}</span>${s.booked || s.held ? `<br><span class="small muted">${s.booked} sold${s.held ? ', ' + s.held + ' held' : ''}</span>` : ''}</td>`).join('')}
        <td><strong>${sum('available')}</strong> <span class="muted small">/ ${sum('allocated')}</span></td></tr>`;
    }).join('');
    const orders = d.orders.map((o) => `<div class="order" style="align-items:flex-start"><div style="min-width:240px;flex:1">
        <strong>${esc(o.id)}</strong> <span class="pill ${o.status === 'cancelled' || o.status === 'expired' ? 'bad' : o.status === 'awaiting_payment' ? '' : 'ok'}">${esc(o.status.replace('_', ' '))}</span>
        <p class="small" style="margin-top:4px">${esc(o.name)} · ${esc(o.phone)} · ${esc(o.city)}</p><p class="small muted">${esc(o.items)}</p>
        <p class="small"><strong>₹${o.total}</strong> · ${o.method === 'cod' ? 'Cash on delivery' : o.method === 'upi' ? 'UPI' : 'Online'} · ${esc(o.pay.replace('_', ' '))}${o.tracking && o.tracking.number ? ` · ${esc(o.tracking.courier)} ${esc(o.tracking.number)}` : ''}</p>
        ${o.note ? `<p class="small" style="color:var(--bad)">${esc(o.note)}</p>` : ''}</div>
      ${['cancelled', 'expired', 'delivered', 'awaiting_payment'].includes(o.status) ? '' : `<div style="display:grid;gap:8px;min-width:220px"><select data-s="${esc(o.id)}">${d.statuses.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <input data-c="${esc(o.id)}" placeholder="Courier (when shipped)"><input data-n="${esc(o.id)}" placeholder="Tracking number"><button class="btn btn-sm" data-u="${esc(o.id)}" type="button">Update status</button><span class="small muted" data-m="${esc(o.id)}"></span></div>`}</div>`).join('') || '<p class="muted">No orders yet.</p>';
    $('#panel').innerHTML = `<h1 style="font-size:2.4rem">Inventory</h1>
      <div class="stats"><div class="stat"><b>${A}</b>Total pieces</div><div class="stat"><b>${B}</b>Sold</div><div class="stat"><b>${H}</b>Held, unpaid</div><div class="stat"><b>${V}</b>Available</div><div class="stat"><b>${d.users}</b>Users</div></div>
      <h2 style="font-size:1.6rem;margin-bottom:10px">Stock by design and size <span class="muted small">(available / allocated)</span></h2>
      <div class="scroll"><table><tr><th>Design</th><th>M-38</th><th>L-40</th><th>XL-42</th><th>XXL-44</th><th>Total</th></tr>${rows}<tr><th>All designs</th><th colspan="4"></th><th>${V} / ${A}</th></tr></table></div>
      <h2 style="font-size:1.6rem;margin-bottom:10px">Spreadsheets</h2>
      <p style="margin-bottom:10px"><a class="btn btn-sm" href="/api/admin/download/inventory">Inventory</a> <a class="btn btn-sm btn-ghost" href="/api/admin/download/orders">Orders</a> <a class="btn btn-sm btn-ghost" href="/api/admin/download/users">Users</a> <a class="btn btn-sm btn-ghost" href="/api/admin/download/bookings">Bookings</a> <a class="btn btn-sm btn-ghost" href="/api/admin/download/enquiries">Enquiries</a></p>
      <p class="small muted" style="margin-bottom:28px">${d.sheets ? 'Google Sheet sync is on. <button class="linkbtn" id="setup" type="button"><u>Write headers and inventory to the sheet</u></button>' : 'Google Sheet sync is off. The Excel downloads above always work.'} <span id="setupmsg"></span></p>
      <h2 style="font-size:1.6rem;margin-bottom:10px">Latest orders</h2>${orders}
      <h2 style="font-size:1.6rem;margin:28px 0 10px">Fitting bookings</h2>
      <div class="scroll"><table><tr><th>Booking</th><th>Buyer</th><th>Date</th><th>Time</th><th>Type</th><th>Status</th></tr>${d.bookings.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.name)}<br><span class="muted small">${esc(b.phone)}</span></td><td>${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc(b.mode)}</td><td>${esc(b.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No bookings yet.</td></tr>'}</table></div>
      <h2 style="font-size:1.6rem;margin-bottom:10px">Enquiries</h2>
      <div class="scroll"><table><tr><th>When</th><th>From</th><th>Subject</th><th>Message</th></tr>${d.enquiries.map((e) => `<tr><td class="small">${esc(e.at)}</td><td>${esc(e.name)}<br><a class="small" href="mailto:${esc(e.email)}">${esc(e.email)}</a></td><td>${esc(e.subject)}</td><td>${esc(e.message)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No enquiries yet.</td></tr>'}</table></div>`;
    const su = $('#setup');
    if (su) su.onclick = async () => { try { await api('/api/admin/sheets-setup', { method: 'POST', body: {}, noRedirect: true }); $('#setupmsg').textContent = 'Done.'; } catch (e) { $('#setupmsg').textContent = e.message; } };
    $('#panel').onclick = async (e) => {
      const id = e.target.dataset.u; if (!id) return;
      const val = (a) => $(`[data-${a}="${id}"]`).value;
      const m = $(`[data-m="${id}"]`); m.textContent = 'Saving…';
      try { await api(`/api/admin/orders/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: val('s'), courier: val('c'), number: val('n') }, noRedirect: true }); load(); }
      catch (err) { m.textContent = err.message; }
    };
  } catch { $('#login').hidden = false; $('#panel').hidden = true; $('#out').hidden = true; }
}
$('#lf').onsubmit = async (e) => {
  e.preventDefault(); const m = $('#lm'); m.textContent = ''; m.className = 'msg';
  try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value }, noRedirect: true }); $('#pw').value = ''; load(); }
  catch (err) { m.textContent = err.message; m.className = 'msg err'; }
};
$('#out').onclick = async () => { await api('/api/admin/logout', { method: 'POST', body: {}, noRedirect: true }); load(); };
load();
