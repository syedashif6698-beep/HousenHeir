// Run: node scripts/selftest.js   (checks stock, checkout, COD, online payment, status changes, bookings and the chatbot)
const assert = require('assert');
const R = require('../lib/redis');
const store = require('../lib/store');
const bot = require('../lib/chatbot');
const otp = require('../lib/otp');
const addr = { line: '12 Test Street, Madurai', city: 'Madurai', pincode: '625001' };
const avail = async (id, size) => (await store.inventoryReport()).find((p) => p.id === id).sizes.find((s) => s.size === size).available;

(async () => {
  const { user } = await store.upsertUser({ name: 'Test Buyer', email: 'a@b.co', phone: '+919876543210' });
  const u2 = (await store.upsertUser({ name: 'B', email: 'b@b.co', phone: '+919876543211' })).user;

  // public data never shows counts
  const list = await store.listProducts();
  assert.equal(list.length, 5);
  assert(!JSON.stringify(list).includes('stock') && list[0].sizes['M-38'] === 'in' && list[0].inStock === true && list[0].fewLeft === false);

  // cash on delivery: confirmed straight away
  const cod = await store.createOrder(user, { items: [{ productId: 'kolam-ivory', size: 'M-38', qty: 2 }, { productId: 'kaapi-black', size: 'L-40', qty: 1 }], address: addr, method: 'cod' });
  assert.equal(cod.status, 'confirmed'); assert.equal(cod.total, 1199 * 3); assert.equal(cod.pay.status, 'cod_due');
  assert.equal(await avail('kolam-ivory', 'M-38'), 23);

  // online: held, then paid once
  const on = await store.createOrder(u2, { items: [{ productId: 'kolam-ivory', size: 'M-38', qty: 1 }], address: addr, method: 'upi' });
  assert.equal(on.status, 'awaiting_payment'); assert.equal(await avail('kolam-ivory', 'M-38'), 22);
  const a = await store.confirmOnline(on.id, 'pay_1', 'razorpay'); assert(a.fresh && a.order.status === 'confirmed');
  assert(!(await store.confirmOnline(on.id, 'pay_1', 'razorpay')).fresh);
  assert.equal(await avail('kolam-ivory', 'M-38'), 22);

  // an unpaid hold expires and frees the stock
  const un = await store.createOrder(u2, { items: [{ productId: 'vayal-olive', size: 'XL-42', qty: 3 }], address: addr, method: 'online' });
  assert.equal(await avail('vayal-olive', 'XL-42'), 22);
  await R.cmd('ZADD', 'hh:holds', 1, un.id);
  assert.equal(await avail('vayal-olive', 'XL-42'), 25);
  assert.equal((await store.getOrder(un.id)).status, 'expired');

  // oversell is refused and nothing leaks
  await R.cmd('INCRBY', 'hh:taken:midnight-navy:M-38', 24);
  await assert.rejects(store.createOrder(u2, { items: [{ productId: 'kaapi-black', size: 'M-38', qty: 1 }, { productId: 'midnight-navy', size: 'M-38', qty: 3 }], address: addr, method: 'cod' }), /not have that many/);
  assert.equal(await avail('kaapi-black', 'M-38'), 25);
  await R.cmd('DECRBY', 'hh:taken:midnight-navy:M-38', 24);

  // status updates and cancel gives stock back
  await store.setStatus(cod.id, 'packed'); const sh = await store.setStatus(cod.id, 'shipped', { courier: 'DTDC', number: 'X123' });
  assert.equal(sh.tracking.number, 'X123');
  await store.setStatus(cod.id, 'cancelled');
  assert.equal(await avail('kolam-ivory', 'M-38'), 24); assert.equal(await avail('kaapi-black', 'L-40'), 25);
  await assert.rejects(store.setStatus(cod.id, 'delivered'));

  // coupons are off until you switch them on; qty limit holds
  await assert.rejects(store.priceOrder([{ productId: 'kolam-ivory', size: 'M-38', qty: 1 }], { user, couponCode: 'WELCOME10', method: 'cod' }), /not valid/);
  await assert.rejects(store.priceOrder([{ productId: 'kolam-ivory', size: 'M-38', qty: 4 }], { user, method: 'cod' }), /up to 3/);

  // real "few left" flag
  for (const s of store.SIZES) await R.cmd('INCRBY', `hh:taken:kaapi-black:${s}`, 22);
  const k = (await store.listProducts()).find((p) => p.id === 'kaapi-black');
  assert(k.fewLeft && k.sizes['M-38'] === 'low');

  // wishlist, bookings, enquiry
  assert.equal(await store.toggleWish(user.phone, 'vayal-olive'), true); assert.equal(await store.toggleWish(user.phone, 'vayal-olive'), false);
  const date = store.bookableDates()[1]; const free = (await store.slotsFor(date)).find((s) => s.free);
  const b = await store.createBooking(user, { date, time: free.time, mode: 'Video call', note: 'x' });
  await assert.rejects(store.createBooking(u2, { date, time: free.time, mode: 'Video call' }));
  await store.cancelBooking(user, b.id);
  await store.createEnquiry({ name: 'x', email: 'x@y.co', phone: '', subject: 's', message: 'm' });

  // chatbot: availability only, no numbers left
  for (const q of ['is kolam ivory available?', 'what is available', 'kaapi black', 'do you have midnight navy']) {
    const r = (await bot.reply(q)).reply; assert(!/\d+\s*(left|pieces|of 100)/i.test(r), r);
  }
  assert(/available/.test((await bot.reply('is kolam ivory available?')).reply));
  assert(/cash on delivery/i.test((await bot.reply('can I pay cash on delivery')).reply));
  assert(/UPI/.test((await bot.reply('do you take gpay')).reply));
  await otp.send('+919876543210');
  console.log('All checks passed');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
