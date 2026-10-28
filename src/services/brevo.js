/**
 * Optional Brevo (Sendinblue) transactional email.
 * Set BREVO_API_KEY in env. If missing, calls no-op.
 */
async function sendEmail({ to, subject, html, text }) {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  if (!key || !to) return { skipped: true };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Stratic Market',
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@straticsoft.com',
        },
        to: [{ email: to }],
        subject: subject || 'Stratic Market',
        htmlContent: html || ('<p>' + (text || '') + '</p>'),
        textContent: text || '',
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error('brevo fail', r.status, body.slice(0, 200));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('brevo error', e.message);
    return { ok: false, error: e.message };
  }
}

async function notifyOrder(sellerEmail, order) {
  if (!sellerEmail) return;
  return sendEmail({
    to: sellerEmail,
    subject: 'New order ' + (order.ref || '') + ' on Stratic Market',
    text:
      'You have a new order.\nRef: ' +
      (order.ref || '') +
      '\nBuyer: ' +
      (order.name || '') +
      '\nPhone: ' +
      (order.phone || '') +
      '\nTotal: ' +
      (order.currency || '') +
      ' ' +
      (order.total || ''),
    html:
      '<h2>New order</h2><p><b>Ref:</b> ' +
      (order.ref || '') +
      '</p><p><b>Buyer:</b> ' +
      (order.name || '') +
      '</p><p><b>Phone:</b> ' +
      (order.phone || '') +
      '</p><p><b>Total:</b> ' +
      (order.currency || '') +
      ' ' +
      (order.total || '') +
      '</p>',
  });
}

module.exports = { sendEmail, notifyOrder };
