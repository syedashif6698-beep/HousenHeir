mountHeader('wishlist'); mountFooter();
(async () => {
  const [{ products }] = await Promise.all([getProducts(), wish.load()]);
  const list = products.filter((p) => wish.ids.has(p.id));
  if (!list.length) { $('#grid').outerHTML = '<div class="empty"><h2>Nothing saved yet</h2><p class="muted">Tap the heart on any design to keep it here.</p><p style="margin-top:18px"><a class="btn" href="/home">Browse designs</a></p></div>'; return; }
  $('#grid').innerHTML = list.map(productCard).join(''); bindCards($('#grid'));
})().catch((e) => { $('#grid').innerHTML = `<p class="msg err">${esc(e.message)}</p>`; });
