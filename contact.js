mountHeader('contact'); mountFooter();
$('#ef').onsubmit = async (e) => {
  e.preventDefault();
  const m = $('#msg'); m.textContent = ''; m.className = 'msg';
  const b = $('#go'); b.disabled = true; b.textContent = 'Sending…';
  try {
    const r = await api('/api/enquiries', { method: 'POST', body: { subject: $('#subject').value, phone: $('#phone').value, message: $('#message').value } });
    m.textContent = `Thank you. Your enquiry ${r.id} has been sent. We will reply by email.`; m.className = 'msg ok';
    $('#subject').value = ''; $('#message').value = '';
  } catch (err) { m.textContent = err.message; m.className = 'msg err'; }
  b.disabled = false; b.textContent = 'Send enquiry';
};
