require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const R = require('./lib/redis');
const store = require('./lib/store');
const otp = require('./lib/otp');
const sheets = require('./lib/sheets');
const { notify, toCustomer } = require('./lib/notify');
const bot = require('./lib/chatbot');
const exporter = require('./lib/export');

const PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (PROD ? '' : crypto.randomBytes(32).toString('hex'));
if (!JWT_SECRET) throw new Error('JWT_SECRET is missing. Add it in the Vercel environment variables.');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PATH = process.env.ADMIN_PATH || '/hh-inventory';
const RZP = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
const CF = { id: process.env.CASHFREE_APP_ID, secret: process.env.CASHFREE_SECRET_KEY, prod: process.env.CASHFREE_ENV === 'production' };
const CF_BASE = CF.prod ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
const GATEWAYS = [];
if (RZP.id && RZP.secret) GATEWAYS.push({ id: 'razorpay', label: 'Razorpay' });
if (CF.id && CF.secret) GATEWAYS.push({ id: 'cashfree', label: 'Cashfree' });
if (!GATEWAYS.length && !PROD) GATEWAYS.push({ id: 'dev', label: 'Test payment' });
const PRIMARY = GATEWAYS.find((g) => g.id === process.env.PRIMARY_GATEWAY) || GATEWAYS[0];
const view = (f) => path.join(__dirname, 'views', f);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://sdk.cashfree.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameSrc: ['https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://*.cashfree.com'],
      connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'https://*.cashfree.com'],
      formAction: ["'self'"], objectSrc: ["'none'"],
      upgradeInsecureRequests: PROD ? [] : null
    }
  }
}));
app.use(compression());
app.use(express.json({ limit: '20kb', verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; } }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d', index: false }));

// ---------- helpers ----------
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeEq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
const cookieOpts = (ms) => ({ httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: ms, path: '/' });
const userFrom = async (req) => { try { const t = jwt.verify(req.cookies.hh_session || '', JWT_SECRET); return await store.getUser(t.phone); } catch { return null; } };
const adminFrom = (req) => { try { return jwt.verify(req.cookies.hh_admin || '', JWT_SECRET + ':admin').admin === true; } catch { return false; } };
const needUser = ah(async (req, res, next) => { const u = await userFrom(req); if (!u) return res.status(401).json({ error: 'Please sign in.' }); req.user = u; next(); });
const needUserPage = ah(async (req, res, next) => { const u = await userFrom(req); if (!u) return res.redirect('/'); req.user = u; next(); });
const needAdmin = (req, res, next) => (adminFrom(req) ? next() : res.status(401).json({ error: 'Password needed.' }));
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
const ist = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

// rate limit kept in the database so it works across Vercel's servers
const rl = (name, sec, max, msg) => async (req, res, next) => {
  try {
    const k = `hh:rl:${name}:${req.ip}`;
    const n = await R.cmd('INCR', k);
    if (n === 1) await R.cmd('EXPIRE', k, sec);
    if (n > max) return res.status(429).json({ error: msg });
  } catch (e) { console.error('rate limit', e.message); }
  next();
};


app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.headers.origin) {
    let host = ''; try { host = new URL(req.headers.origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'Request blocked.' });
  }
  next();
});
app.use('/api', rl('api', 900, 500, 'Too many requests. Try again in a few minutes.'));

// ---------- pages ----------
app.get('/', noStore, ah(async (req, res) => (await userFrom(req) ? res.redirect('/home') : res.sendFile(view('login.html')))));
['home', 'book', 'contact', 'orders', 'wishlist', 'checkout'].forEach((p) => app.get('/' + p, noStore, needUserPage, (req, res) => res.sendFile(view(p + '.html'))));
app.get('/product/:id', noStore, needUserPage, (req, res) => res.sendFile(view('product.html')));
app.get('/order/:id', noStore, needUserPage, (req, res) => res.sendFile(view('order.html')));
// policies are public so customers and payment partners can read them without signing in
const POLICIES = { privacy: 'Privacy Policy', terms: 'Terms of Use', shipping: 'Shipping and Delivery Policy', returns: 'Returns, Refunds and Cancellation' };
app.get('/policy/:slug', (req, res) => {
  const title = POLICIES[req.params.slug];
  if (!title) return res.status(404).type('text').send('Page not found');
  const body = fs.readFileSync(path.join(__dirname, 'data', 'policies', req.params.slug + '.html'), 'utf8');
  const date = process.env.POLICY_DATE || '1 November 2026';
  res.set('Cache-Control', 'public, max-age=300').type('html').send(fs.readFileSync(view('policy.html'), 'utf8').split('{{TITLE}}').join(title).replace('{{DATE}}', date).replace('{{BODY}}', body));
});
app.get(ADMIN_PATH, noStore, (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.sendFile(view('inventory.html')); });

// ---------- sign in with OTP ----------
const normPhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? '+91' + d : null;
};
// lets the sign-in page skip the name and email boxes for returning customers
app.post('/api/auth/lookup', rl('lookup', 600, 30, 'Too many tries. Wait a few minutes.'), ah(async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10 digit Indian mobile number.' });
  res.json({ exists: !!(await store.getUser(phone)) });
}));
app.post('/api/otp/send', rl('otpsend', 600, 8, 'Too many code requests. Try again in 10 minutes.'), ah(async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10 digit Indian mobile number.' });
  const old = await store.getUser(phone);
  const name = clean(req.body.name, 60) || (old && old.name) || '', email = (clean(req.body.email, 120) || (old && old.email) || '').toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const r = await otp.send(phone);
    await R.setJSON(`hh:pend:${phone}`, { name, email }, 'EX', 900);
    res.json({ ok: true, test: r.test });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/otp/verify', rl('otpverify', 900, 15, 'Too many attempts. Try again later.'), ah(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const p = phone && (await R.getJSON(`hh:pend:${phone}`));
  if (!p) return res.status(400).json({ error: 'Start again and enter your details.' });
  if (!(await otp.check(phone, req.body.code))) return res.status(400).json({ error: 'That code is wrong or has expired.' });
  await R.cmd('DEL', `hh:pend:${phone}`);
  const { user, isNew } = await store.upsertUser({ name: p.name, email: p.email, phone });
  if (isNew) await sheets.logUser(user);
  res.cookie('hh_session', jwt.sign({ phone: user.phone }, JWT_SECRET, { expiresIn: '30d' }), cookieOpts(30 * 864e5));
  res.json({ ok: true, isNew });
}));
app.post('/api/logout', (req, res) => { res.clearCookie('hh_session', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', noStore, needUser, (req, res) => res.json({ name: req.user.name, email: req.user.email, phone: req.user.phone, address: req.user.address || null }));

// ---------- catalogue and wishlist ----------
app.get('/api/products', noStore, needUser, ah(async (req, res) => res.json({ products: await store.listProducts(), sizes: store.SIZES, maxQty: store.MAX_QTY })));
app.get('/api/products/:id', noStore, needUser, ah(async (req, res) => {
  const p = await store.getProductPublic(req.params.id);
  if (!p) return res.status(404).json({ error: 'Design not found.' });
  res.json({ product: p, sizes: store.SIZES, maxQty: store.MAX_QTY });
}));
app.get('/api/wishlist', noStore, needUser, ah(async (req, res) => res.json({ ids: await store.wishlist(req.user.phone) })));
app.post('/api/wishlist', needUser, ah(async (req, res) => {
  try { res.json({ saved: await store.toggleWish(req.user.phone, String(req.body.productId)) }); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---------- checkout ----------
const cleanItems = (arr) => (Array.isArray(arr) ? arr.slice(0, 20).map((i) => ({ productId: String(i.productId || ''), size: String(i.size || ''), qty: parseInt(i.qty, 10) || 0 })) : []);
const payMethods = () => ({ online: GATEWAYS.length > 0, cod: store.COD, shipping: store.SHIPPING_FEE });
app.get('/api/checkout/options', noStore, needUser, (req, res) => res.json(payMethods()));

app.post('/api/quote', needUser, ah(async (req, res) => {
  try {
    const q = await store.priceOrder(cleanItems(req.body.items), { user: req.user, couponCode: clean(req.body.coupon, 30), method: req.body.method === 'cod' ? 'cod' : 'online' });
    res.json({ lines: q.lines, subtotal: q.subtotal, discount: q.discount, coupon: q.coupon, shipping: q.shipping, codFee: q.codFee, total: q.total });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

async function afterConfirmed(order) {
  const items = order.items.map((l) => `${l.name} ${l.size} x${l.qty}`).join(', ');
  const how = order.pay.method === 'cod' ? `Cash on delivery. Collect Rs ${order.total}.` : `Paid Rs ${order.total} online.`;
  await Promise.all([
    sheets.logOrder(order),
    store.inventoryReport().then(sheets.writeInventory),
    notify(`New order ${order.id}: ${items}`, `${order.name} (${order.phone}, ${order.email})\n${how}\nShip to: ${order.address.line}, ${order.address.city} ${order.address.pincode}`, order.email),
    toCustomer(order.email, `Your House & Heir order ${order.id} is confirmed`, `Hi ${order.name.split(' ')[0]},\n\nThank you for your order.\n\n${items}\nTotal: Rs ${order.total} (${order.pay.method === 'cod' ? 'pay on delivery' : 'paid'})\n\nFollow it any time at https://housenheir.com/order/${order.id}\n\nHouse & Heir`)
  ]);
}

app.post('/api/checkout', needUser, rl('checkout', 600, 20, 'Too many attempts. Wait a few minutes.'), ah(async (req, res) => {
  const a = req.body.address || {};
  const address = { name: clean(a.name, 60) || req.user.name, phone: clean(a.phone, 15) || req.user.phone, line: clean(a.line, 250), city: clean(a.city, 60), state: clean(a.state, 40), pincode: clean(a.pincode, 6) };
  if (address.line.length < 8) return res.status(400).json({ error: 'Enter your full delivery address.' });
  if (address.city.length < 2) return res.status(400).json({ error: 'Enter your city.' });
  if (!/^[1-9]\d{5}$/.test(address.pincode)) return res.status(400).json({ error: 'Enter a valid 6 digit pincode.' });
  const method = String(req.body.method);
  if (!['cod', 'upi', 'online'].includes(method)) return res.status(400).json({ error: 'Choose how you want to pay.' });
  if (method !== 'cod' && !GATEWAYS.length) return res.status(400).json({ error: 'Online payment is not set up yet. Choose cash on delivery.' });
  try {
    const order = await store.createOrder(req.user, { items: cleanItems(req.body.items), address, method, couponCode: clean(req.body.coupon, 30) });
    if (method === 'cod') await afterConfirmed(order);
    res.json({ orderId: order.id, next: method === 'cod' ? 'done' : 'pay' });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

const publicOrder = (o) => ({
  id: o.id, status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt, items: o.items, subtotal: o.subtotal, discount: o.discount, coupon: o.coupon,
  shipping: o.shipping, codFee: o.codFee, total: o.total, pay: { method: o.pay.method, status: o.pay.status }, address: o.address, timeline: o.timeline, tracking: o.tracking
});
const ownOrder = async (req, res) => {
  const o = await store.getOrder(String(req.params.id || req.body.orderId || ''));
  if (!o || o.phone !== req.user.phone) { res.status(404).json({ error: 'Order not found.' }); return null; }
  return o;
};
app.get('/api/orders/:id', noStore, needUser, ah(async (req, res) => { const o = await ownOrder(req, res); if (o) res.json({ order: publicOrder(o) }); }));
app.get('/api/my-orders', noStore, needUser, ah(async (req, res) => res.json({ orders: (await store.userOrders(req.user.phone)).map(publicOrder) })));

// ---------- online payment: Razorpay and Cashfree ----------
async function confirmPaid(id, paymentId, gateway) {
  const { order, fresh } = await store.confirmOnline(id, paymentId, gateway);
  if (fresh) await afterConfirmed(order);
  return order;
}
const cfHeaders = () => ({ 'x-client-id': CF.id, 'x-client-secret': CF.secret, 'x-api-version': '2023-08-01', 'Content-Type': 'application/json' });
const cfGet = async (id) => { const r = await fetch(`${CF_BASE}/pg/orders/${encodeURIComponent(id)}`, { headers: cfHeaders() }); return { status: r.status, j: await r.json() }; };

app.post('/api/payment/create', needUser, ah(async (req, res) => {
  const o = await ownOrder(req, res); if (!o) return;
  if (o.pay.status === 'paid') return res.status(400).json({ error: 'This order is already paid.' });
  if (o.status !== 'awaiting_payment' || new Date(o.expiresAt) < Date.now()) return res.status(400).json({ error: 'This payment window has ended. Please place the order again.' });
  const gw = (GATEWAYS.find((g) => g.id === req.body.gateway) || PRIMARY || {}).id;
  if (!gw) return res.status(400).json({ error: 'Online payment is not set up yet.' });
  if (gw === 'dev') return res.json({ mode: 'dev', backup: false });
  const backup = GATEWAYS.length > 1;
  try {
    if (gw === 'razorpay') {
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${RZP.id}:${RZP.secret}`).toString('base64') },
        body: JSON.stringify({ amount: o.total * 100, currency: 'INR', receipt: o.id, notes: { orderId: o.id } })
      });
      const j = await r.json(); if (!j.id) throw new Error('razorpay ' + JSON.stringify(j).slice(0, 200));
      await store.setGateway(o.id, 'razorpay', j.id);
      return res.json({ mode: 'razorpay', backup, upiOnly: o.pay.method === 'upi', keyId: RZP.id, rzpOrderId: j.id, amount: j.amount, name: o.name, email: o.email, phone: o.phone });
    }
    let { status, j } = await cfGet(o.id);
    if (status === 200 && j.order_status === 'PAID') { await confirmPaid(o.id, String(j.cf_order_id), 'cashfree'); return res.json({ mode: 'paid' }); }
    if (status !== 200 || j.order_status !== 'ACTIVE') {
      const r = await fetch(`${CF_BASE}/pg/orders`, {
        method: 'POST', headers: cfHeaders(),
        body: JSON.stringify({
          order_id: o.id, order_amount: o.total, order_currency: 'INR',
          customer_details: { customer_id: 'c' + o.phone.replace(/\D/g, ''), customer_name: o.name, customer_email: o.email, customer_phone: o.phone.slice(-10) },
          order_meta: { return_url: `${req.protocol}://${req.get('host')}/order/${o.id}` }
        })
      });
      j = await r.json();
    }
    if (!j.payment_session_id) throw new Error('cashfree ' + JSON.stringify(j).slice(0, 200));
    await store.setGateway(o.id, 'cashfree');
    res.json({ mode: 'cashfree', backup, sessionId: j.payment_session_id, env: CF.prod ? 'production' : 'sandbox' });
  } catch (e) { console.error('payment create', e.message); res.status(502).json({ error: 'We could not start the payment. Try again' + (backup ? ' or use the other payment option.' : '.'), backup }); }
}));

app.post('/api/payment/verify', needUser, ah(async (req, res) => {
  const o = await ownOrder(req, res); if (!o) return;
  if (o.pay.status === 'paid') return res.json({ ok: true });
  const gw = String(req.body.gateway || o.pay.gateway);
  const bad = () => res.status(400).json({ error: 'We could not confirm the payment yet. If money was taken it will show on your order shortly, or write to sale@housenheir.com.' });
  if (gw === 'dev' && !PROD && GATEWAYS.some((g) => g.id === 'dev')) { await confirmPaid(o.id, 'DEV-' + crypto.randomBytes(4).toString('hex'), 'dev'); return res.json({ ok: true }); }
  if (gw === 'razorpay' && RZP.secret) {
    const { razorpay_payment_id: pid, razorpay_order_id: rid, razorpay_signature: sig } = req.body;
    if (!pid || !sig || rid !== o.pay.ref) return bad();
    if (!safeEq(sig, crypto.createHmac('sha256', RZP.secret).update(`${rid}|${pid}`).digest('hex'))) return bad();
    await confirmPaid(o.id, pid, 'razorpay'); return res.json({ ok: true });
  }
  if (gw === 'cashfree' && CF.secret) {
    const { status, j } = await cfGet(o.id);
    if (status === 200 && j.order_status === 'PAID' && Number(j.order_amount) === o.total) { await confirmPaid(o.id, String(j.cf_order_id), 'cashfree'); return res.json({ ok: true }); }
  }
  bad();
}));

// Gateways call these even if the buyer closes the tab after paying
app.post('/api/webhooks/razorpay', ah(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !req.rawBody) return res.sendStatus(400);
  if (!safeEq(req.headers['x-razorpay-signature'] || '', crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex'))) return res.sendStatus(400);
  const p = req.body && req.body.payload && req.body.payload.payment && req.body.payload.payment.entity;
  if (req.body.event === 'payment.captured' && p) { const id = await store.orderIdByRef(p.order_id); if (id) await confirmPaid(id, p.id, 'razorpay'); }
  res.sendStatus(200);
}));
app.post('/api/webhooks/cashfree', ah(async (req, res) => {
  if (!CF.secret || !req.rawBody) return res.sendStatus(400);
  const ts = req.headers['x-webhook-timestamp'] || '';
  if (!safeEq(req.headers['x-webhook-signature'] || '', crypto.createHmac('sha256', CF.secret).update(ts + req.rawBody).digest('base64'))) return res.sendStatus(400);
  const d = req.body && req.body.data;
  if (req.body.type === 'PAYMENT_SUCCESS_WEBHOOK' && d && d.order && d.payment) await confirmPaid(d.order.order_id, String(d.payment.cf_payment_id), 'cashfree');
  res.sendStatus(200);
}));

// ---------- booking ----------
app.get('/api/bookings/dates', noStore, needUser, (req, res) => res.json({ dates: store.bookableDates(), times: store.SLOT_TIMES, modes: store.BOOKING_MODES }));
app.get('/api/bookings/slots', noStore, needUser, ah(async (req, res) => {
  try { res.json({ slots: await store.slotsFor(String(req.query.date || '')) }); } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.get('/api/my-bookings', noStore, needUser, ah(async (req, res) => res.json({ bookings: await store.userBookings(req.user.phone) })));
app.post('/api/bookings', needUser, rl('booking', 600, 10, 'Too many booking attempts. Wait a few minutes.'), ah(async (req, res) => {
  try {
    const b = await store.createBooking(req.user, { date: String(req.body.date), time: String(req.body.time), mode: String(req.body.mode), note: clean(req.body.note, 300) });
    await Promise.all([sheets.logBooking(b), notify(`New fitting booking ${b.id}: ${b.date} ${b.time}`, `${b.name} (${b.phone}, ${b.email})\n${b.mode}\nNote: ${b.note || '-'}`, b.email)]);
    res.json({ booking: b });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.post('/api/bookings/:id/cancel', needUser, ah(async (req, res) => {
  try { res.json({ booking: await store.cancelBooking(req.user, req.params.id) }); } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---------- enquiry form ----------
app.post('/api/enquiries', needUser, rl('enquiry', 3600, 6, 'You have sent several enquiries. Please wait before sending another.'), ah(async (req, res) => {
  const subject = clean(req.body.subject, 100), message = clean(req.body.message, 1500), phone = clean(req.body.phone || req.user.phone, 20);
  if (subject.length < 3) return res.status(400).json({ error: 'Add a short subject.' });
  if (message.length < 10) return res.status(400).json({ error: 'Write your message (at least 10 characters).' });
  const e = await store.createEnquiry({ name: req.user.name, email: req.user.email, phone, subject, message });
  await Promise.all([sheets.logEnquiry(e), notify(`Enquiry ${e.id}: ${e.subject}`, `${e.name} (${e.phone}, ${e.email})\n\n${e.message}`, e.email)]);
  res.json({ ok: true, id: e.id });
}));

// ---------- chatbot ----------
app.get('/api/chat/start', (req, res) => res.json({ reply: bot.greeting, chips: bot.chips }));
app.post('/api/chat', rl('chat', 600, 40, 'You are sending messages very fast. Please wait a moment.'), ah(async (req, res) => res.json(await bot.reply(clean(req.body.message, 300)))));

// ---------- inventory area (password only) ----------
app.post('/api/admin/login', rl('adminlogin', 900, 5, 'Too many tries. Wait 15 minutes.'), (req, res) => {
  if (!ADMIN_PASSWORD || !safeEq(req.body.password || '', ADMIN_PASSWORD)) return res.status(401).json({ error: 'Wrong password.' });
  res.cookie('hh_admin', jwt.sign({ admin: true }, JWT_SECRET + ':admin', { expiresIn: '2h' }), cookieOpts(2 * 3600e3));
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('hh_admin', { path: '/' }); res.json({ ok: true }); });
app.get('/api/admin/inventory', noStore, needAdmin, ah(async (req, res) => {
  const [inventory, users, orders, bookings, enquiries] = await Promise.all([store.inventoryReport(), store.userCount(), store.allOrders(50), store.allBookings(30), store.allEnquiries(30)]);
  res.json({
    inventory, users, sheets: sheets.enabled, statuses: store.STATUSES,
    orders: orders.map((o) => ({ id: o.id, status: o.status, name: o.name, phone: o.phone, items: o.items.map((l) => `${l.name} ${l.size} x${l.qty}`).join(', '), total: o.total, method: o.pay.method, pay: o.pay.status, tracking: o.tracking, city: o.address.city, note: o.note || '' })),
    bookings: bookings.map((b) => ({ id: b.id, status: b.status, name: b.name, phone: b.phone, date: b.date, time: b.time, mode: b.mode })),
    enquiries: enquiries.map((e) => ({ id: e.id, at: ist(e.createdAt), name: e.name, email: e.email, subject: e.subject, message: e.message }))
  });
}));
app.post('/api/admin/orders/:id/status', needAdmin, ah(async (req, res) => {
  try {
    const o = await store.setStatus(req.params.id, String(req.body.status), { note: clean(req.body.note, 200), courier: clean(req.body.courier, 60), number: clean(req.body.number, 60) });
    if (['shipped', 'delivered'].includes(o.status)) await toCustomer(o.email, `Your House & Heir order ${o.id} is ${o.status}`, `Hi ${o.name.split(' ')[0]},\n\nYour order ${o.id} is ${o.status}.${o.tracking && o.tracking.number ? `\nCourier: ${o.tracking.courier} ${o.tracking.number}` : ''}\n\nTrack it at https://housenheir.com/order/${o.id}\n\nHouse & Heir`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));
app.get('/api/admin/download/:kind', needAdmin, ah(async (req, res) => {
  const buf = await exporter.build(req.params.kind);
  if (!buf) return res.sendStatus(404);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${req.params.kind}.xlsx"`, 'Cache-Control': 'no-store' });
  res.send(Buffer.from(buf));
}));
app.post('/api/admin/sheets-setup', needAdmin, ah(async (req, res) => {
  try { await sheets.setupHeaders(); await sheets.writeInventory(await store.inventoryReport()); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
}));

app.use((req, res) => res.status(404).type('text').send('Page not found'));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`House & Heir running at http://localhost:${PORT}  (inventory: ${ADMIN_PATH}, database: ${R.remote ? 'Upstash' : 'in-memory test copy'})`));
}
