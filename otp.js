// OTP by SMS. Providers: Twilio Verify or MSG91 (set OTP_PROVIDER=msg91). Without keys:
// local testing prints the code in the terminal. OTP_TEST_MODE=true does the same on Vercel (logs). Turn it off before launch.
const crypto = require('crypto');
const R = require('./redis');
const env = process.env;
const TW = { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, verify: env.TWILIO_VERIFY_SID };
const MG = { key: env.MSG91_AUTH_KEY, template: env.MSG91_TEMPLATE_ID };
const provider = () => (env.OTP_PROVIDER === 'msg91' && MG.key && MG.template ? 'msg91' : TW.sid && TW.token && TW.verify ? 'twilio' : null);
const testMode = () => !provider() && (env.NODE_ENV !== 'production' || env.OTP_TEST_MODE === 'true');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function twilio(endpoint, body) {
  const r = await fetch(`https://verify.twilio.com/v2/Services/${TW.verify}/${endpoint}`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Basic ' + Buffer.from(`${TW.sid}:${TW.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  return r.json();
}
const digits = (phone) => phone.replace(/\D/g, ''); // 91XXXXXXXXXX

async function send(phone) {
  if ((await R.cmd('SET', `hh:otpgap:${phone}`, '1', 'EX', 30, 'NX')) !== 'OK') throw new Error('Wait 30 seconds before asking for another code.');
  const n = await R.cmd('INCR', `hh:otpcount:${phone}`);
  if (n === 1) await R.cmd('EXPIRE', `hh:otpcount:${phone}`, 3600);
  if (n > 5) throw new Error('Too many codes for this number. Try again in an hour.');
  await R.cmd('DEL', `hh:otptry:${phone}`);
  const p = provider();
  if (p === 'twilio') {
    const j = await twilio('Verifications', { To: phone, Channel: 'sms' });
    if (!j.sid) { console.error('Twilio:', JSON.stringify(j).slice(0, 300)); throw new Error('We could not send the code. Check the number and try again.'); }
    return { test: false };
  }
  if (p === 'msg91') {
    const r = await fetch(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(MG.template)}&mobile=${digits(phone)}&authkey=${encodeURIComponent(MG.key)}&otp_expiry=5`, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (j.type !== 'success') { console.error('MSG91:', JSON.stringify(j).slice(0, 300)); throw new Error('We could not send the code. Check the number and try again.'); }
    return { test: false };
  }
  if (!testMode()) throw new Error('SMS is not set up yet.');
  const code = String(crypto.randomInt(100000, 1000000));
  await R.cmd('SET', `hh:otp:${phone}`, sha(code), 'EX', 300);
  console.log(`\n[TEST OTP] ${phone} -> ${code}\n`);
  return { test: true };
}

async function check(phone, code) {
  code = String(code || '').trim();
  if (!/^\d{4,8}$/.test(code)) return false;
  const tries = await R.cmd('INCR', `hh:otptry:${phone}`);
  if (tries === 1) await R.cmd('EXPIRE', `hh:otptry:${phone}`, 600);
  if (tries > 5) return false;
  const p = provider();
  if (p === 'twilio') return (await twilio('VerificationCheck', { To: phone, Code: code })).status === 'approved';
  if (p === 'msg91') {
    const r = await fetch(`https://control.msg91.com/api/v5/otp/verify?mobile=${digits(phone)}&otp=${encodeURIComponent(code)}`, { headers: { authkey: MG.key }, signal: AbortSignal.timeout(8000) });
    return (await r.json().catch(() => ({}))).type === 'success';
  }
  const h = await R.cmd('GET', `hh:otp:${phone}`);
  if (!h) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(h));
  if (ok) await R.cmd('DEL', `hh:otp:${phone}`);
  return ok;
}
module.exports = { send, check, provider, testMode };
