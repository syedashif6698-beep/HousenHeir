mountHeader('book'); mountFooter();
let date = '', time = '', mode = '';
const msg = (t, ok) => { const m = $('#msg'); m.textContent = t || ''; m.className = 'msg ' + (t ? (ok ? 'ok' : 'err') : ''); };
const dayLabel = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeLabel = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const pick = (box, btn) => { $$('.chip', box).forEach((c) => c.classList.toggle('on', c === btn)); };

async function loadSlots() {
  $('#times').innerHTML = '<span class="muted small">Loading times…</span>'; time = '';
  try {
    const { slots } = await api('/api/bookings/slots?date=' + date);
    $('#times').innerHTML = slots.map((s) => `<button type="button" class="chip" data-t="${s.time}" ${s.free ? '' : 'disabled'}>${timeLabel(s.time)}</button>`).join('');
  } catch (e) { $('#times').innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
}

async function loadMine() {
  const { bookings } = await api('/api/my-bookings');
  $('#mine').innerHTML = bookings.length ? bookings.map((b) => `<div class="order"><div><strong>${dayLabel(b.date)}, ${timeLabel(b.time)}</strong><p class="muted small">${esc(b.mode)} · ${esc(b.id)}</p></div>
    <div style="text-align:right"><span class="pill ${b.status === 'booked' ? 'ok' : 'bad'}">${b.status === 'booked' ? 'Booked' : 'Cancelled'}</span>
    ${b.status === 'booked' ? `<p style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-cancel="${esc(b.id)}" type="button">Cancel</button></p>` : ''}</div></div>`).join('') : '<p class="muted">No bookings yet.</p>';
}

(async () => {
  const d = await api('/api/bookings/dates');
  $('#dates').innerHTML = d.dates.map((x) => `<button type="button" class="chip" data-d="${x}">${dayLabel(x)}</button>`).join('');
  $('#modes').innerHTML = d.modes.map((m) => `<button type="button" class="chip" data-m="${esc(m)}">${esc(m)}</button>`).join('');
  $('#dates').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; date = b.dataset.d; pick($('#dates'), b); loadSlots(); };
  $('#times').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b || b.disabled) return; time = b.dataset.t; pick($('#times'), b); };
  $('#modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; pick($('#modes'), b); };
  $('#bf').onsubmit = async (e) => {
    e.preventDefault(); msg('');
    if (!date || !time || !mode) return msg('Choose a day, a time and how we should reach you.');
    const b = $('#go'); b.disabled = true; b.textContent = 'Booking…';
    try {
      await api('/api/bookings', { method: 'POST', body: { date, time, mode, note: $('#note').value } });
      msg('Booked. We will call you at your registered number at the time you chose.', true);
      $('#note').value = ''; await loadSlots(); await loadMine();
    } catch (err) { msg(err.message); await loadSlots(); }
    b.disabled = false; b.textContent = 'Confirm booking';
  };
  $('#mine').onclick = async (e) => {
    const id = e.target.dataset.cancel; if (!id || !confirm('Cancel this booking?')) return;
    try { await api('/api/bookings/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: {} }); await loadMine(); if (date) loadSlots(); } catch (err) { msg(err.message); }
  };
  loadMine();
})().catch((e) => msg(e.message));
