// Database access. Production uses Upstash Redis over HTTPS (free plan on Vercel).
// With no database keys set and NODE_ENV not production, an in-memory copy is used so you can test on your computer.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const remote = !!(URL_ && TOKEN);
const PROD = process.env.NODE_ENV === 'production';

async function remoteCmd(args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String))
  });
  const j = await r.json();
  if (j.error) throw new Error('Database error: ' + j.error);
  return j.result;
}

// ---- tiny in-memory stand-in for local testing ----
const kv = new Map();
const live = (k) => {
  const e = kv.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { kv.delete(k); return null; }
  return e;
};
const num = (v) => Number(v);
function localCmd(args) {
  const c = String(args[0]).toUpperCase(); const a = args.slice(1).map((x) => (typeof x === 'number' ? x : String(x)));
  switch (c) {
    case 'GET': { const e = live(a[0]); return e ? e.val : null; }
    case 'SET': {
      const [k, v, ...o] = a; let nx = false, ex = 0;
      for (let i = 0; i < o.length; i++) { const t = String(o[i]).toUpperCase(); if (t === 'NX') nx = true; else if (t === 'EX') ex = num(o[++i]); }
      if (nx && live(k)) return null;
      kv.set(k, { val: String(v), exp: ex ? Date.now() + ex * 1000 : 0 }); return 'OK';
    }
    case 'DEL': { let n = 0; for (const k of a) if (kv.delete(k)) n++; return n; }
    case 'MGET': return a.map((k) => { const e = live(k); return e ? e.val : null; });
    case 'INCR': case 'INCRBY': case 'DECRBY': {
      const d = c === 'INCR' ? 1 : c === 'INCRBY' ? num(a[1]) : -num(a[1]);
      const e = live(a[0]); const n = (e ? num(e.val) : 0) + d;
      kv.set(a[0], { val: String(n), exp: e ? e.exp : 0 }); return n;
    }
    case 'EXPIRE': { const e = live(a[0]); if (!e) return 0; e.exp = Date.now() + num(a[1]) * 1000; return 1; }
    case 'SADD': { let e = live(a[0]); if (!e) { e = { val: new Set(), exp: 0 }; kv.set(a[0], e); } const b = e.val.size; a.slice(1).forEach((m) => e.val.add(m)); return e.val.size - b; }
    case 'SREM': { const e = live(a[0]); return e && e.val.delete(a[1]) ? 1 : 0; }
    case 'SCARD': { const e = live(a[0]); return e ? e.val.size : 0; }
    case 'SMEMBERS': { const e = live(a[0]); return e ? [...e.val] : []; }
    case 'LPUSH': { let e = live(a[0]); if (!e) { e = { val: [], exp: 0 }; kv.set(a[0], e); } a.slice(1).forEach((m) => e.val.unshift(m)); return e.val.length; }
    case 'LRANGE': { const e = live(a[0]); if (!e) return []; let s = num(a[1]), t = num(a[2]); if (t < 0) t = e.val.length + t; return e.val.slice(s, t + 1); }
    case 'ZADD': { let e = live(a[0]); if (!e) { e = { val: new Map(), exp: 0 }; kv.set(a[0], e); } e.val.set(a[2], num(a[1])); return 1; }
    case 'ZREM': { const e = live(a[0]); return e && e.val.delete(a[1]) ? 1 : 0; }
    case 'ZRANGEBYSCORE': {
      const e = live(a[0]); if (!e) return [];
      const lo = a[1] === '-inf' ? -Infinity : num(a[1]), hi = a[2] === '+inf' ? Infinity : num(a[2]);
      return [...e.val.entries()].filter(([, s]) => s >= lo && s <= hi).sort((x, y) => x[1] - y[1]).map(([m]) => m);
    }
    default: throw new Error('Unsupported local command ' + c);
  }
}

async function cmd(...args) {
  if (remote) return remoteCmd(args);
  if (PROD) throw new Error('The database is not connected. Add the Upstash Redis keys in Vercel.');
  return localCmd(args);
}
const getJSON = async (k) => { const v = await cmd('GET', k); return v ? JSON.parse(v) : null; };
const setJSON = (k, v, ...opt) => cmd('SET', k, JSON.stringify(v), ...opt);
const mgetJSON = async (keys) => (keys.length ? (await cmd('MGET', ...keys)).map((v) => (v ? JSON.parse(v) : null)) : []);

module.exports = { cmd, getJSON, setJSON, mgetJSON, remote };
