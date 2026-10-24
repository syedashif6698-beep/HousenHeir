mountHeader('home'); mountFooter();

(async () => {
  const [{ products }] = await Promise.all([getProducts(), wish.load()]);
  const grid = (list) => list.map(productCard).join('');
  $('#pongal-grid').innerHTML = grid(products.filter((p) => p.collection === 'pongal'));
  $('#new-grid').innerHTML = grid(products.filter((p) => p.collection === 'new'));
  bindCards($('#pongal-grid')); bindCards($('#new-grid'));

  // 3D hero stack: three designs layered in depth
  const pick = [products.find((p) => p.collection === 'pongal'), products.find((p) => p.collection === 'new'), products.filter((p) => p.collection === 'pongal')[1] || products[2]].filter(Boolean);
  const pos = [['-34px', '10px', '-70px', '-7deg'], ['30px', '-6px', '0px', '4deg'], ['-2px', '22px', '70px', '-1deg']];
  $('#stack').innerHTML = pick.map((p, i) => `<a class="hcard" href="/product/${esc(p.id)}" style="--sw:${esc(p.swatch)};--x:${pos[i][0]};--y:${pos[i][1]};--z:${pos[i][2]};--r:${pos[i][3]}" aria-label="${esc(p.name)}"><span>${esc(p.name)}</span><img src="${esc(p.images[0])}" alt="" decoding="async"></a>`).join('');
  const stage = $('#stage'), stack = $('#stack');
  if (!reduceMotion) stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = stage.getBoundingClientRect();
    stack.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 24).toFixed(1) + 'deg');
    stack.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 16).toFixed(1) + 'deg');
  });
  stage.addEventListener('pointerleave', () => { stack.style.setProperty('--ry', '0deg'); stack.style.setProperty('--rx', '0deg'); });
})().catch((e) => { $('#pongal-grid').innerHTML = `<p class="msg err">${esc(e.message)}</p>`; });
