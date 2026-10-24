mountFooter();
let phone = '', isNew = false, timer = null;
const msg = (id, t, ok) => { const m = $(id); m.textContent = t || ''; m.className = 'msg ' + (t ? (ok ? 'ok' : 'err') : ''); };

// the 3D ticket follows the pointer
const art = $('#art'), ticket = $('#ticket');
if (art && !reduceMotion) art.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const r = art.getBoundingClientRect();
  ticket.style.setProperty('--ry', (-16 + ((e.clientX - r.left) / r.width - 0.5) * 22).toFixed(1) + 'deg');
  ticket.style.setProperty('--rx', (8 - ((e.clientY - r.top) / r.height - 0.5) * 18).toFixed(1) + 'deg');
});

function countdown() {
  let s = 30; const b = $('#resend'); b.disabled = true; clearInterval(timer);
  const tick = () => { b.textContent = s > 0 ? `Resend code in ${s}s` : 'Resend code'; if (s <= 0) { clearInterval(timer); b.disabled = false; } s--; };
  tick(); timer = setInterval(tick, 1000);
}

async function sendOtp() {
  const body = { phone: $('#phone').value };
  if (isNew) { body.name = $('#name').value; body.email = $('#email').value; }
  const r = await api('/api/otp/send', { method: 'POST', body, noRedirect: true });
  phone = body.phone.replace(/\D/g, '').slice(-10);
  $('#sentTo').textContent = `We sent a code to +91 ${phone}.` + (r.test ? ' (Test mode: the code is in the server log.)' : '');
  $('#f1').hidden = true; $('#f2').hidden = false; $('#code').focus(); countdown();
}

$('#f1').onsubmit = async (e) => {
  e.preventDefault(); msg('#m1', '');
  const b = $('#go1'); b.disabled = true; const label = b.textContent; b.textContent = 'One moment…';
  try {
    if (!isNew) {
      const r = await api('/api/auth/lookup', { method: 'POST', body: { phone: $('#phone').value }, noRedirect: true });
      if (!r.exists) { isNew = true; $('#newbox').hidden = false; $('#name').focus(); b.textContent = 'Send OTP'; b.disabled = false; return; }
    } else if (!$('#agree').checked) { throw new Error('Tick the box to continue.'); }
    await sendOtp();
  } catch (err) { msg('#m1', err.message); }
  b.disabled = false; if (b.textContent === 'One moment…') b.textContent = isNew ? 'Send OTP' : label;
};
$('#phone').addEventListener('input', () => { if (isNew) { isNew = false; $('#newbox').hidden = true; $('#go1').textContent = 'Continue'; } });

$('#f2').onsubmit = async (e) => {
  e.preventDefault(); msg('#m2', '');
  const b = $('#go2'); b.disabled = true; b.textContent = 'Checking…';
  try { await api('/api/otp/verify', { method: 'POST', body: { phone, code: $('#code').value }, noRedirect: true }); location.href = '/home'; }
  catch (err) { msg('#m2', err.message); b.disabled = false; b.textContent = 'Verify and enter'; }
};
$('#resend').onclick = async () => { msg('#m2', ''); try { await sendOtp(); msg('#m2', 'A new code is on its way.', true); } catch (err) { msg('#m2', err.message); } };
$('#back').onclick = () => { $('#f2').hidden = true; $('#f1').hidden = false; $('#code').value = ''; clearInterval(timer); };
