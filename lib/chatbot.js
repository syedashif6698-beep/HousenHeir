// Rule-based assistant. Answers come from data/faq.json (edit that file to change replies).
// Stock rule: it says only "available" or "sold out", never a number. "Selling fast" shows only when stock is really low.
const faq = require('../data/faq.json');
const store = require('./store');

const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9₹ -]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

async function reply(text) {
  const t = norm(text);
  if (t.trim().length < 2) return { reply: faq.greeting, chips: faq.chips };

  const hit = store.products.find((p) => t.includes(' ' + p.name.toLowerCase() + ' ') || t.includes(' ' + p.colour.split(' ')[0].toLowerCase() + ' '));
  if (hit) {
    const p = await store.getProductPublic(hit.id);
    const sizes = store.SIZES.filter((s) => p.sizes[s] !== 'out');
    const price = '₹' + p.price.toLocaleString('en-IN');
    return {
      reply: p.inStock
        ? `Yes, ${p.name} (${p.colour}) is available at ${price}. Sizes available: ${sizes.join(', ')}.${p.fewLeft ? ' Only a few pieces are left.' : ''}`
        : `Sorry, ${p.name} is sold out right now.`,
      chips: ['Payment options', 'Cash on delivery'], link: p.inStock ? { label: 'View ' + p.name, href: '/product/' + p.id } : { label: 'See other designs', href: '/home' }
    };
  }
  if (/(available|in stock|what do you have|which design|designs|what is available|price|cost|how much)/.test(t)) {
    const list = await store.listProducts();
    return {
      reply: list.map((p) => `${p.name}: ${p.inStock ? 'available' : 'sold out'}, ₹${p.price.toLocaleString('en-IN')}`).join('\n'),
      chips: ['Sizes', 'Payment options'], link: { label: 'See all designs', href: '/home' }
    };
  }
  let best = null, score = 0;
  for (const it of faq.intents) {
    let s = 0;
    for (const k of it.keywords) if (t.includes(' ' + k + ' ') || (k.length > 4 && t.includes(k))) s += k.length > 4 ? 2 : 1;
    if (s > score) { best = it; score = s; }
  }
  if (best) return { reply: best.answer, chips: faq.chips, ...(best.link ? { link: best.link } : {}) };
  return { reply: faq.fallback, chips: faq.chips, link: { label: 'Send an enquiry', href: '/contact' } };
}
module.exports = { reply, greeting: faq.greeting, chips: faq.chips };
