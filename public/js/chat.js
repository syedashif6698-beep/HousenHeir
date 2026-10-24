(function () {
  const fab = document.createElement('button');
  fab.className = 'chat-fab'; fab.type = 'button'; fab.textContent = 'Chat with us'; fab.setAttribute('aria-expanded', 'false');
  const box = document.createElement('div');
  box.className = 'chat'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Chat assistant');
  box.innerHTML = `<div class="chat-head"><span>House &amp; Heir assistant</span><button type="button" aria-label="Close chat">×</button></div>
    <div class="chat-log" id="chatlog" aria-live="polite"></div><div class="chat-chips" id="chatchips"></div>
    <form class="chat-form" id="chatform"><input id="chatin" maxlength="300" placeholder="Type your question" autocomplete="off" aria-label="Your question"><button class="btn" type="submit">Send</button></form>`;
  document.body.append(box, fab);
  const log = box.querySelector('#chatlog'), chips = box.querySelector('#chatchips'), input = box.querySelector('#chatin');
  let started = false;

  const add = (text, who, link) => {
    const d = document.createElement('div'); d.className = 'bubble ' + who; d.textContent = text;
    if (link) { d.appendChild(document.createElement('br')); const a = document.createElement('a'); a.href = link.href; a.textContent = link.label; d.appendChild(a); }
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  };
  const setChips = (list) => {
    chips.innerHTML = '';
    (list || []).forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = c; b.onclick = () => ask(c); chips.appendChild(b); });
  };
  async function ask(text) {
    text = text.trim(); if (!text) return;
    add(text, 'me'); input.value = ''; chips.innerHTML = '';
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      add(j.reply, 'bot', j.link); setChips(j.chips);
    } catch (e) { add(e.message || 'Something went wrong. Please try again.', 'bot'); }
  }
  async function open() {
    box.hidden = false; fab.setAttribute('aria-expanded', 'true'); input.focus();
    if (!started) { started = true; try { const j = await (await fetch('/api/chat/start')).json(); add(j.reply, 'bot'); setChips(j.chips); } catch { add('Hi! Ask me about sizes, pre-orders or payment.', 'bot'); } }
  }
  fab.onclick = () => (box.hidden ? open() : (box.hidden = true, fab.setAttribute('aria-expanded', 'false')));
  box.querySelector('.chat-head button').onclick = () => { box.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.focus(); };
  box.querySelector('#chatform').onsubmit = (e) => { e.preventDefault(); ask(input.value); };
})();
