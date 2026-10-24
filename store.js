// All shop data: users, stock, carts, wishlists, orders, bookings and enquiries.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const R = require('./redis');

const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));
const SIZES = ['M-38', 'L-40', 'XL-42', 'XXL-44'];
const HOLD_MINUTES = 15;          // online orders hold stock this long while the buyer pays
const MAX_QTY = 3;                // per design and size in one order
const MAX_LINES = 12;
const SHIPPING_FEE = Number(process.env.SHIPPING_FEE || 0);
const COD = process.env.COD_ENABLED !== 'false';
const COD_FEE = Number(process.env.COD_FEE || 0);
const COD_MAX = Number(process.env.COD_MAX_ORDER || 0);          // 0 means no limit
const LOW_DESIGN = Number(process.env.LOW_STOCK_DESIGN || 15);   // "Few left" shows when a design is really this low
const LOW_SIZE = Number(process.env.LOW_STOCK_SIZE || 5);

const SLOT_TIMES = ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
const BOOKING_DAYS = 14, LEAD_MINUTES = 60;
const BOOKING_MODES = ['Video call', 'Phone call'];
const STATUSES = ['confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const COUPONS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'coupons.json'), 'utf8')); } catch { return []; } })();

const K = {
  user: (p) => `hh:user:${p}`, users: 'hh:users', wish: (p) => `hh:wish:${p}`,
  order: (id) => `hh:order:${id}`, orders: 'hh:orders', uorders: (p) => `hh:uorders:${p}`, pend: (p) => `hh:pending:${p}`,
  taken: (pid, s) => `hh:taken:${pid}:${s}`, sold: (pid, s) => `hh:sold:${pid}:${s}`, holds: 'hh:holds',
  paidflag: (id) => `hh:paidflag:${id}`, map: (x) => `hh:map:${x}`,
  booking: (id) => `hh:booking:${id}`, bookings: 'hh:bookings', ubook: (p) => `hh:ubook:${p}`, slot: (d, t) => `hh:slot:${d}:${t}`,
  enq: (id) => `hh:enq:${id}`, enqs: 'hh:enquiries'
};
const nowIso = () => new Date().toISOString();
const rid = (prefix) => prefix + '-' + crypto.randomBytes(5).toString('hex').toUpperCase();
const getProduct = (id) => products.find((p) => p.id === id) || null;
const fail = (m) => { throw new Error(m); };

// ---------- users ----------
async function upsertUser({ name, email, phone, drops }) {
  const old = await R.getJSON(K.user(phone));
  const t = nowIso();
  const user = old
    ? { ...old, name, email, lastLogin: t, logins: (old.logins || 1) + 1, drops: drops === undefined ? old.drops : !!drops }
    : { name, email, phone, createdAt: t, lastLogin: t, logins: 1, drops: !!drops };
  await R.setJSON(K.user(phone), user);
  if (!old) await R.cmd('SADD', K.users, phone);
  return { user, isNew: !old };
}
const getUser = (phone) => R.getJSON(K.user(phone));

// ---------- stock ----------
// taken = confirmed pieces + pieces held by orders waiting for online payment. available = allocated - taken.
async function releaseLines(order, wasSold) {
  for (const l of order.items) {
    await R.cmd('DECRBY', K.taken(l.productId, l.size), l.qty);
    if (wasSold) await R.cmd('DECRBY', K.sold(l.productId, l.size), l.qty);
  }
}
async function sweep() {
  const ids = await R.cmd('ZRANGEBYSCORE', K.holds, '-inf', Date.now());
  for (const id of ids) {
    if ((await R.cmd('ZREM', K.holds, id)) !== 1) continue;
    const o = await R.getJSON(K.order(id));
    if (!o || o.status !== 'awaiting_payment') continue;
    o.status = 'expired'; o.payStatus = 'failed';
    await R.setJSON(K.order(id), o);
    await releaseLines(o, false);
  }
}

// internal: remaining pieces per design and size (numbers stay on the server)
async function counts() {
  await sweep();
  const keys = [];
  products.forEach((p) => SIZES.forEach((s) => keys.push(K.taken(p.id, s))));
  const vals = await R.cmd('MGET', ...keys);
  const out = {}; let i = 0;
  for (const p of products) { out[p.id] = {}; for (const s of SIZES) out[p.id][s] = Math.max(0, p.stock[s] - (Number(vals[i++]) || 0)); }
  return out;
}

// What the browser may see: 'in', 'low' or 'out' per size, and an honest few-left flag. Never a number.
function shape(p, left) {
  const total = SIZES.reduce((a, s) => a + left[s], 0);
  const sizes = {};
  for (const s of SIZES) sizes[s] = left[s] <= 0 ? 'out' : left[s] <= LOW_SIZE ? 'low' : 'in';
  const { stock, ...rest } = p;
  return { ...rest, inStock: total > 0, fewLeft: total > 0 && total <= LOW_DESIGN, sizes };
}
async function listProducts() { const c = await counts(); return products.map((p) => shape(p, c[p.id])); }
async function getProductPublic(id) { const p = getProduct(id); if (!p) return null; const c = await counts(); return shape(p, c[id]); }

// ---------- wishlist ----------
const wishlist = (phone) => R.cmd('SMEMBERS', K.wish(phone));
async function toggleWish(phone, productId) {
  if (!getProduct(productId)) fail('Design not found.');
  const had = (await wishlist(phone)).includes(productId);
  await R.cmd(had ? 'SREM' : 'SADD', K.wish(phone), productId);
  return !had;
}

// ---------- pricing ----------
function mergeLines(items) {
  if (!Array.isArray(items) || !items.length) fail('Your bag is empty.');
  const map = new Map();
  for (const it of items) {
    const p = getProduct(String(it.productId));
    if (!p) fail('One of the designs in your bag was not found.');
    if (!SIZES.includes(String(it.size))) fail('Choose a size for every piece in your bag.');
    const qty = parseInt(it.qty, 10);
    if (!(qty >= 1)) fail('Check the quantity of each piece.');
    const key = p.id + '|' + it.size;
    const l = map.get(key) || { productId: p.id, size: String(it.size), qty: 0 };
    l.qty += qty;
    if (l.qty > MAX_QTY) fail(`You can order up to ${MAX_QTY} pieces of each design and size.`);
    map.set(key, l);
  }
  if (map.size > MAX_LINES) fail('Your bag has too many different items. Please check out in two orders.');
  return [...map.values()];
}

async function findCoupon(code, subtotal, user) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return null;
  const c = COUPONS.find((x) => x.code === code && x.active);
  if (!c) fail('That code is not valid.');
  if (subtotal < (c.minOrder || 0)) fail(`This code needs an order of at least ₹${c.minOrder.toLocaleString('en-IN')}.`);
  if (c.firstOrderOnly && user && (await userOrders(user.phone)).some((o) => !['cancelled', 'expired'].includes(o.status))) fail('This code is for your first order only.');
  const amount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  return { code: c.code, label: c.label, amount };
}

async function priceOrder(items, { user, couponCode, method } = {}) {
  const merged = mergeLines(items);
  const left = await counts();
  const lines = merged.map((l) => {
    const p = getProduct(l.productId);
    return { productId: p.id, name: p.name, colour: p.colour, image: p.images[0], swatch: p.swatch, size: l.size, qty: l.qty, price: p.price, lineTotal: p.price * l.qty, inStock: left[p.id][l.size] >= l.qty };
  });
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const coupon = await findCoupon(couponCode, subtotal, user);
  const discount = coupon ? coupon.amount : 0;
  const shipping = SHIPPING_FEE;
  const codFee = method === 'cod' ? COD_FEE : 0;
  const total = subtotal - discount + shipping + codFee;
  if (method === 'cod') {
    if (!COD) fail('Cash on delivery is not available right now.');
    if (COD_MAX && total > COD_MAX) fail(`Cash on delivery is available up to ₹${COD_MAX.toLocaleString('en-IN')}. Please pay online for this order.`);
  }
  return { lines, subtotal, discount, coupon: coupon ? coupon.code : null, shipping, codFee, total };
}

// ---------- orders ----------
async function cancelAwaiting(id) {
  const o = await R.getJSON(K.order(id));
  if (!o || o.status !== 'awaiting_payment') return;
  if ((await R.cmd('ZREM', K.holds, id)) === 1) await releaseLines(o, false);
  o.status = 'cancelled'; o.pay.status = 'failed';
  o.timeline.push({ s: 'cancelled', at: nowIso() });
  await R.setJSON(K.order(id), o);
}

// method: 'cod' | 'upi' | 'online'. Cash on delivery is confirmed at once; the others hold stock while the buyer pays.
async function createOrder(user, { items, address, method, couponCode }) {
  if (!['cod', 'upi', 'online'].includes(method)) fail('Choose how you want to pay.');
  const q = await priceOrder(items, { user, couponCode, method });
  const lines = mergeLines(items);
  await sweep();
  const prev = await R.cmd('GET', K.pend(user.phone));
  if (prev) await cancelAwaiting(prev);

  const done = [];
  for (const l of lines) {
    const p = getProduct(l.productId);
    const t = await R.cmd('INCRBY', K.taken(l.productId, l.size), l.qty);
    if (t > p.stock[l.size]) {
      await R.cmd('DECRBY', K.taken(l.productId, l.size), l.qty);
      for (const d of done) await R.cmd('DECRBY', K.taken(d.productId, d.size), d.qty);
      fail(`We do not have that many of ${p.name} in ${l.size} any more. Please update your bag.`);
    }
    done.push(l);
  }
  const t = nowIso();
  const cod = method === 'cod';
  const order = {
    id: rid('HH'), createdAt: t, phone: user.phone, name: user.name, email: user.email,
    items: q.lines.map(({ productId, name, size, qty, price }) => ({ productId, name, size, qty, price })),
    pieces: lines.reduce((a, l) => a + l.qty, 0), subtotal: q.subtotal, discount: q.discount, coupon: q.coupon, shipping: q.shipping, codFee: q.codFee, total: q.total,
    address, status: cod ? 'confirmed' : 'awaiting_payment',
    pay: { method, status: cod ? 'cod_due' : 'pending', gateway: '', ref: '', paymentId: '' },
    tracking: null, timeline: cod ? [{ s: 'placed', at: t }, { s: 'confirmed', at: t }] : [{ s: 'placed', at: t }]
  };
  if (cod) {
    for (const l of lines) await R.cmd('INCRBY', K.sold(l.productId, l.size), l.qty);
  } else {
    const expires = Date.now() + HOLD_MINUTES * 60000;
    order.expiresAt = new Date(expires).toISOString();
    await R.cmd('ZADD', K.holds, expires, order.id);
    await R.cmd('SET', K.pend(user.phone), order.id, 'EX', 3600);
  }
  await R.setJSON(K.order(order.id), order);
  await R.cmd('LPUSH', K.orders, order.id);
  await R.cmd('LPUSH', K.uorders(user.phone), order.id);
  await R.setJSON(K.user(user.phone), { ...(await getUser(user.phone)), address }); // remembered for next time
  return order;
}

const getOrder = (id) => R.getJSON(K.order(id));
async function userOrders(phone) {
  await sweep();
  return (await R.mgetJSON((await R.cmd('LRANGE', K.uorders(phone), 0, 29)).map(K.order))).filter(Boolean);
}
async function setGateway(id, gateway, ref) {
  const o = await getOrder(id); if (!o) return;
  o.pay.gateway = gateway;
  if (ref) { o.pay.ref = ref; await R.cmd('SET', K.map(ref), id, 'EX', 86400 * 3); }
  await R.setJSON(K.order(id), o);
}
const orderIdByRef = (ref) => R.cmd('GET', K.map(ref));

// online payment confirmed. Returns { order, fresh }; fresh is true only for the call that confirmed it
async function confirmOnline(id, paymentId, gateway) {
  const o = await getOrder(id);
  if (!o) return { order: null, fresh: false };
  if (o.pay.status === 'paid') return { order: o, fresh: false };
  if ((await R.cmd('SET', K.paidflag(id), '1', 'NX')) !== 'OK') return { order: await getOrder(id), fresh: false };
  const stillHeld = (await R.cmd('ZREM', K.holds, id)) === 1;
  if (!stillHeld) {
    for (const l of o.items) {
      const p = getProduct(l.productId);
      const t = await R.cmd('INCRBY', K.taken(l.productId, l.size), l.qty);
      if (t > p.stock[l.size]) o.note = 'Paid after the hold ended and stock ran out. Refund or contact the buyer.';
    }
  }
  for (const l of o.items) await R.cmd('INCRBY', K.sold(l.productId, l.size), l.qty);
  const t = nowIso();
  o.status = 'confirmed'; o.paidAt = t;
  o.pay = { ...o.pay, status: 'paid', paymentId, gateway: gateway || o.pay.gateway };
  o.timeline.push({ s: 'confirmed', at: t });
  await R.setJSON(K.order(id), o);
  await R.cmd('DEL', K.pend(o.phone));
  return { order: o, fresh: true };
}

// admin: move an order along. Cancelling gives the stock back.
async function setStatus(id, status, { note, courier, number } = {}) {
  const o = await getOrder(id);
  if (!o) fail('Order not found.');
  if (!STATUSES.includes(status)) fail('Unknown status.');
  if (['cancelled', 'expired'].includes(o.status)) fail('This order is closed.');
  if (o.status === 'awaiting_payment' && status !== 'cancelled') fail('This order has not been paid yet.');
  if (o.status === 'delivered') fail('This order is already delivered.');
  const t = nowIso();
  if (status === 'cancelled') {
    if (o.status === 'awaiting_payment') { await cancelAwaiting(id); return getOrder(id); }
    await releaseLines(o, true);
    if (o.pay.status === 'paid') o.note = (o.note ? o.note + ' ' : '') + 'Cancelled after online payment. Refund the buyer in the gateway dashboard.';
  }
  if (status === 'shipped') o.tracking = { courier: courier || '', number: number || '' };
  if (status === 'delivered' && o.pay.method === 'cod') o.pay.status = 'cod_collected';
  if (note) o.note = (o.note ? o.note + ' ' : '') + note;
  o.status = status;
  o.timeline.push({ s: status, at: t });
  await R.setJSON(K.order(id), o);
  return o;
}

async function inventoryReport() {
  await sweep();
  const tk = [], sk = [];
  products.forEach((p) => SIZES.forEach((s) => { tk.push(K.taken(p.id, s)); sk.push(K.sold(p.id, s)); }));
  const [taken, sold] = [await R.cmd('MGET', ...tk), await R.cmd('MGET', ...sk)];
  let i = 0;
  return products.map((p) => ({
    id: p.id, name: p.name, collection: p.collection,
    sizes: SIZES.map((s) => {
      const t = Number(taken[i]) || 0, b = Number(sold[i]) || 0; i++;
      return { size: s, allocated: p.stock[s], booked: b, held: Math.max(0, t - b), available: p.stock[s] - t };
    })
  }));
}

// ---------- bookings ----------
const istNow = () => new Date(Date.now() + 330 * 60000);
const ymd = (d) => d.toISOString().slice(0, 10);
function bookableDates() {
  const out = [], base = istNow();
  for (let i = 0; i <= BOOKING_DAYS; i++) { const d = new Date(base.getTime() + i * 864e5); if (d.getUTCDay() !== 0) out.push(ymd(d)); }
  return out;
}
function pastLead(date, time) {
  const n = istNow();
  if (date !== ymd(n)) return false;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m < n.getUTCHours() * 60 + n.getUTCMinutes() + LEAD_MINUTES;
}
async function slotsFor(date) {
  if (!bookableDates().includes(date)) fail('Choose a date from the list. We are closed on Sundays.');
  const vals = await R.cmd('MGET', ...SLOT_TIMES.map((t) => K.slot(date, t)));
  return SLOT_TIMES.map((t, i) => ({ time: t, free: !vals[i] && !pastLead(date, t) }));
}
async function createBooking(user, { date, time, mode, note }) {
  if (!bookableDates().includes(date)) fail('Choose a date from the list.');
  if (!SLOT_TIMES.includes(time)) fail('Choose a time.');
  if (!BOOKING_MODES.includes(mode)) fail('Choose video call or phone call.');
  if (pastLead(date, time)) fail('That time is too soon. Pick a later slot.');
  const id = rid('BK');
  if ((await R.cmd('SET', K.slot(date, time), id, 'EX', 86400 * 30, 'NX')) !== 'OK') fail('Someone just took that slot. Pick another.');
  const b = { id, createdAt: nowIso(), status: 'booked', phone: user.phone, name: user.name, email: user.email, date, time, mode, note: String(note || '').slice(0, 300) };
  await R.setJSON(K.booking(id), b);
  await R.cmd('LPUSH', K.bookings, id);
  await R.cmd('LPUSH', K.ubook(user.phone), id);
  return b;
}
async function userBookings(phone) { return (await R.mgetJSON((await R.cmd('LRANGE', K.ubook(phone), 0, 19)).map(K.booking))).filter(Boolean); }
async function cancelBooking(user, id) {
  const b = await R.getJSON(K.booking(id));
  if (!b || b.phone !== user.phone) fail('Booking not found.');
  if (b.status !== 'booked') return b;
  await R.cmd('DEL', K.slot(b.date, b.time));
  b.status = 'cancelled';
  await R.setJSON(K.booking(id), b);
  return b;
}

// ---------- enquiries ----------
async function createEnquiry({ name, email, phone, subject, message }) {
  const e = { id: rid('EQ'), createdAt: nowIso(), name, email, phone, subject, message };
  await R.setJSON(K.enq(e.id), e);
  await R.cmd('LPUSH', K.enqs, e.id);
  return e;
}

// ---------- lists for admin and spreadsheets ----------
const listBy = async (listKey, itemKey, n) => (await R.mgetJSON((await R.cmd('LRANGE', listKey, 0, n - 1)).map(itemKey))).filter(Boolean);
const allOrders = (n = -1) => listBy(K.orders, K.order, n === -1 ? 10000 : n);
const allBookings = (n = -1) => listBy(K.bookings, K.booking, n === -1 ? 10000 : n);
const allEnquiries = (n = -1) => listBy(K.enqs, K.enq, n === -1 ? 10000 : n);
async function allUsers() { return (await R.mgetJSON((await R.cmd('SMEMBERS', K.users)).map(K.user))).filter(Boolean); }
const userCount = () => R.cmd('SCARD', K.users);

module.exports = {
  products, SIZES, HOLD_MINUTES, MAX_QTY, SLOT_TIMES, BOOKING_MODES, STATUSES, SHIPPING_FEE, COD, COD_FEE, COD_MAX,
  upsertUser, getUser, listProducts, getProductPublic, getProduct, counts, wishlist, toggleWish,
  priceOrder, createOrder, getOrder, userOrders, setGateway, orderIdByRef, confirmOnline, setStatus, inventoryReport,
  bookableDates, slotsFor, createBooking, userBookings, cancelBooking,
  createEnquiry, allOrders, allBookings, allEnquiries, allUsers, userCount
};
