// Optional: copy every new user, pre-order, booking and enquiry into a Google Sheet.
// Skipped quietly when the Google keys are not set. Spreadsheet downloads from the inventory page always work.
const ID = process.env.GOOGLE_SHEET_ID;
const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const enabled = !!(ID && EMAIL && KEY);

const HEADERS = {
  Users: ['Name', 'Email', 'Phone (OTP verified)', 'Registered (IST)'],
  Orders: ['Order ID', 'Placed (IST)', 'Name', 'Email', 'Phone', 'Items', 'Subtotal (Rs)', 'Discount (Rs)', 'Shipping (Rs)', 'Total (Rs)', 'Payment', 'Payment status', 'Gateway', 'Payment ID', 'Address', 'City', 'Pincode', 'Note'],
  Bookings: ['Booking ID', 'Booked at (IST)', 'Name', 'Email', 'Phone', 'Date', 'Time', 'Type', 'Note'],
  Enquiries: ['Enquiry ID', 'Received (IST)', 'Name', 'Email', 'Phone', 'Subject', 'Message']
};
const ist = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

let tok = { v: null, exp: 0 };
async function token() {
  if (tok.v && tok.exp > Date.now() + 60000) return tok.v;
  const jwt = require('jsonwebtoken');
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, KEY, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google sign-in failed');
  tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tok.v;
}

async function call(method, url, body) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/${url}`, {
    method, headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000)
  });
  if (!r.ok) throw new Error('Sheets ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
const safe = async (fn) => { if (!enabled) return; try { await fn(); } catch (e) { console.error('Google Sheet sync failed:', e.message); } };
const append = (tab, row) => call('POST', `values/${encodeURIComponent(tab)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: [row] });

const logUser = (u) => safe(() => append('Users', [u.name, u.email, u.phone, ist(u.createdAt)]));
const itemsText = (o) => o.items.map((l) => `${l.name} ${l.size} x${l.qty}`).join('; ');
const logOrder = (o) => safe(() => append('Orders', [o.id, ist(o.createdAt), o.name, o.email, o.phone, itemsText(o), o.subtotal, o.discount, o.shipping + (o.codFee || 0), o.total, o.pay.method === 'cod' ? 'Cash on delivery' : o.pay.method === 'upi' ? 'UPI' : 'Online', o.pay.status === 'paid' ? 'Paid' : 'Pay on delivery', o.pay.gateway, o.pay.paymentId, o.address.line, o.address.city, o.address.pincode, o.note || '']));
const logBooking = (b) => safe(() => append('Bookings', [b.id, ist(b.createdAt), b.name, b.email, b.phone, b.date, b.time, b.mode, b.note]));
const logEnquiry = (e) => safe(() => append('Enquiries', [e.id, ist(e.createdAt), e.name, e.email, e.phone, e.subject, e.message]));

// The Inventory tab is rewritten each time with live formulas
const writeInventory = (report) => safe(() => {
  const rows = [['Design', 'Size', 'Allocated', 'Sold', 'Held (unpaid)', 'Available']];
  let r = 2;
  for (const d of report) for (const s of d.sizes) { rows.push([d.name, s.size, s.allocated, s.booked, s.held, `=C${r}-D${r}-E${r}`]); r++; }
  rows.push(['Total', '', `=SUM(C2:C${r - 1})`, `=SUM(D2:D${r - 1})`, `=SUM(E2:E${r - 1})`, `=SUM(F2:F${r - 1})`]);
  return call('PUT', `values/Inventory!A1?valueInputOption=USER_ENTERED`, { values: rows });
});

async function setupHeaders() {
  if (!enabled) throw new Error('Google keys are not set.');
  for (const [tab, row] of Object.entries(HEADERS)) await call('PUT', `values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, { values: [row] });
}
module.exports = { enabled, logUser, logOrder, logBooking, logEnquiry, writeInventory, setupHeaders };
