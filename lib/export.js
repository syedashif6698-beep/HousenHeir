// Builds the downloadable Excel files from the database.
const ExcelJS = require('exceljs');
const store = require('./store');
const ist = (t) => (t ? new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');

function head(ws) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B3A29' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
const cols = (ws, list) => { ws.columns = list.map(([header, key, width]) => ({ header, key, width })); };

async function build(kind) {
  const wb = new ExcelJS.Workbook();
  if (kind === 'users') {
    const ws = wb.addWorksheet('Users');
    cols(ws, [['Name', 'name', 26], ['Email', 'email', 32], ['Phone (OTP verified)', 'phone', 20], ['Registered', 'c', 22], ['Last login', 'l', 22], ['Logins', 'n', 8]]);
    (await store.allUsers()).forEach((u) => ws.addRow({ name: u.name, email: u.email, phone: u.phone, c: ist(u.createdAt), l: ist(u.lastLogin), n: u.logins }));
    head(ws);
  } else if (kind === 'orders') {
    const ws = wb.addWorksheet('Orders');
    cols(ws, [['Order ID', 'id', 16], ['Placed', 'p', 22], ['Status', 'st', 17], ['Name', 'name', 24], ['Email', 'email', 30], ['Phone', 'phone', 16], ['Items', 'it', 44], ['Subtotal (Rs)', 'sub', 13], ['Discount (Rs)', 'dis', 13],
      ['Shipping + COD fee (Rs)', 'sh', 20], ['Total (Rs)', 't', 12], ['Payment', 'pm', 16], ['Payment status', 'ps', 16], ['Gateway', 'g', 11], ['Payment ID', 'pay', 26], ['Address', 'ad', 40], ['City', 'city', 16], ['Pincode', 'pin', 10], ['Courier', 'cr', 16], ['Tracking no.', 'tn', 18], ['Note', 'n', 40]]);
    (await store.allOrders()).forEach((o) => ws.addRow({ id: o.id, p: ist(o.createdAt), st: o.status, name: o.name, email: o.email, phone: o.phone, it: o.items.map((l) => `${l.name} ${l.size} x${l.qty}`).join('; '),
      sub: o.subtotal, dis: o.discount, sh: o.shipping + (o.codFee || 0), t: o.total, pm: o.pay.method === 'cod' ? 'Cash on delivery' : o.pay.method === 'upi' ? 'UPI' : 'Online', ps: o.pay.status, g: o.pay.gateway, pay: o.pay.paymentId,
      ad: o.address.line, city: o.address.city, pin: o.address.pincode, cr: o.tracking ? o.tracking.courier : '', tn: o.tracking ? o.tracking.number : '', n: o.note || '' }));
    head(ws);
  } else if (kind === 'bookings') {
    const ws = wb.addWorksheet('Bookings');
    cols(ws, [['Booking ID', 'id', 16], ['Booked at', 'c', 22], ['Status', 'st', 12], ['Name', 'name', 24], ['Email', 'email', 30], ['Phone', 'phone', 16], ['Date', 'd', 12], ['Time', 't', 8], ['Type', 'm', 12], ['Note', 'n', 40]]);
    (await store.allBookings()).forEach((b) => ws.addRow({ id: b.id, c: ist(b.createdAt), st: b.status, name: b.name, email: b.email, phone: b.phone, d: b.date, t: b.time, m: b.mode, n: b.note }));
    head(ws);
  } else if (kind === 'enquiries') {
    const ws = wb.addWorksheet('Enquiries');
    cols(ws, [['Enquiry ID', 'id', 16], ['Received', 'c', 22], ['Name', 'name', 24], ['Email', 'email', 30], ['Phone', 'phone', 16], ['Subject', 's', 30], ['Message', 'm', 70]]);
    (await store.allEnquiries()).forEach((e) => ws.addRow({ id: e.id, c: ist(e.createdAt), name: e.name, email: e.email, phone: e.phone, s: e.subject, m: e.message }));
    head(ws);
  } else if (kind === 'inventory') {
    const ws = wb.addWorksheet('Stock by size');
    cols(ws, [['Design', 'd', 20], ['Size', 's', 10], ['Allocated', 'a', 12], ['Sold', 'b', 18], ['Held (unpaid)', 'h', 15], ['Available', 'v', 12]]);
    const report = await store.inventoryReport();
    let r = 2;
    for (const d of report) for (const s of d.sizes) {
      ws.addRow({ d: d.name, s: s.size, a: s.allocated, b: s.booked, h: s.held });
      ws.getCell(`F${r}`).value = { formula: `C${r}-D${r}-E${r}`, result: s.available }; r++;
    }
    ws.addRow({ d: 'Total' }).font = { bold: true };
    ['C', 'D', 'E', 'F'].forEach((c) => { ws.getCell(`${c}${r}`).value = { formula: `SUM(${c}2:${c}${r - 1})` }; });
    head(ws);
    const w2 = wb.addWorksheet('By design');
    cols(w2, [['Design', 'd', 20], ['Allocated', 'a', 12], ['Sold', 'b', 18], ['Held (unpaid)', 'h', 15], ['Available', 'v', 12]]);
    report.forEach((d, i) => {
      w2.addRow({ d: d.name });
      [['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'F']].forEach(([o, s]) => { w2.getCell(`${o}${i + 2}`).value = { formula: `SUMIF('Stock by size'!$A:$A,$A${i + 2},'Stock by size'!$${s}:$${s})` }; });
    });
    const tr = report.length + 2;
    w2.addRow({ d: 'Total' }).font = { bold: true };
    ['B', 'C', 'D', 'E'].forEach((c) => { w2.getCell(`${c}${tr}`).value = { formula: `SUM(${c}2:${c}${tr - 1})` }; });
    head(w2);
  } else return null;
  return wb.xlsx.writeBuffer();
}
module.exports = { build, kinds: ['users', 'orders', 'inventory', 'bookings', 'enquiries'] };
