// Optional email through Resend. Skipped when RESEND_API_KEY is empty.
const FROM = () => process.env.NOTIFY_FROM || 'House & Heir <onboarding@resend.dev>';
async function send(payload) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ from: FROM(), ...payload })
    });
  } catch (e) { console.error('Email failed:', e.message); }
}
// to your team
const notify = (subject, text, replyTo) => send({ to: [process.env.NOTIFY_TO || 'sale@housenheir.com'], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) });
// to a customer
const mailCustomer = (to, subject, text) => send({ to: [to], subject, text, reply_to: process.env.NOTIFY_TO || 'sale@housenheir.com' });
module.exports = { notify, toCustomer: mailCustomer, mailCustomer };
