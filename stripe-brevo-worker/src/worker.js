/**
 * Stripe -> Brevo bridge (Cloudflare Worker)
 *
 * When a customer completes a Stripe Checkout (e.g. a Payment Link), Stripe
 * sends a `checkout.session.completed` webhook here. We verify the signature,
 * then add/update the customer as a contact in a Brevo list. Adding them to the
 * list is what triggers your Brevo automation ("contact added to list").
 *
 * Secrets (set with `wrangler secret put ...`):
 *   - STRIPE_WEBHOOK_SECRET   (whsec_...)   the signing secret for this endpoint
 *   - BREVO_API_KEY           (xkeysib-...) a Brevo API key with Contacts write
 *
 * Plain vars (wrangler.toml [vars] or dashboard):
 *   - BREVO_LIST_ID           numeric id of the target Brevo list
 *   - NOTIFY_EMAIL            (optional) address to receive a new-sale alert
 *   - NOTIFY_FROM             (optional) verified Brevo sender for the alert
 */

const STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      return new Response('Stripe -> Brevo bridge is running.', { status: 200 });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature') || '';

    let verified;
    try {
      verified = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return new Response('Signature verification error: ' + err.message, { status: 400 });
    }
    if (!verified) {
      return new Response('Invalid signature', { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (!STRIPE_EVENTS.has(event.type)) {
      // Acknowledge everything else so Stripe doesn't retry.
      return new Response('Ignored: ' + event.type, { status: 200 });
    }

    const session = event.data && event.data.object ? event.data.object : {};
    const details = session.customer_details || {};
    const email = details.email || session.customer_email || '';
    const fullName = details.name || '';

    if (!email) {
      return new Response('No email on session; nothing to do', { status: 200 });
    }

    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    const lastName = rest.join(' ');
    const meta = session.metadata || {};

    try {
      await brevoUpsertContact(env, {
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        courseSlug: meta.course_slug || '',
        courseDate: meta.course_date || '',
        amountTotal: session.amount_total,
        currency: session.currency,
      });

      if (env.NOTIFY_EMAIL && env.NOTIFY_FROM) {
        await brevoNotify(env, { email, fullName, meta, session }).catch(() => {});
      }
    } catch (err) {
      // Return 500 so Stripe retries; the contact call is idempotent (updateEnabled).
      return new Response('Brevo error: ' + err.message, { status: 500 });
    }

    return new Response('ok', { status: 200 });
  },
};

async function brevoUpsertContact(env, c) {
  const attributes = { FIRSTNAME: c.firstName, LASTNAME: c.lastName };
  if (c.courseSlug) attributes.COURSE = c.courseSlug;
  if (c.courseDate) attributes.COURSE_DATE = c.courseDate;
  if (typeof c.amountTotal === 'number') {
    attributes.LAST_PAYMENT = (c.amountTotal / 100).toFixed(2) + ' ' + (c.currency || '').toUpperCase();
  }

  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email: c.email,
      attributes,
      listIds: env.BREVO_LIST_ID ? [Number(env.BREVO_LIST_ID)] : [],
      updateEnabled: true, // add or update; safe on repeat webhooks
    }),
  });

  // 201 created, 204 updated. Anything else is an error.
  if (res.status !== 201 && res.status !== 204) {
    const text = await res.text();
    throw new Error('contacts ' + res.status + ' ' + text);
  }
}

async function brevoNotify(env, { email, fullName, meta, session }) {
  const amount = typeof session.amount_total === 'number'
    ? (session.amount_total / 100).toFixed(2) + ' ' + (session.currency || '').toUpperCase()
    : 'n/a';
  const lines = [
    'New paid registration',
    'Name:   ' + (fullName || '—'),
    'Email:  ' + email,
    'Course: ' + (meta.course_slug || '—'),
    'Date:   ' + (meta.course_date || '—'),
    'Paid:   ' + amount,
  ].join('\n');

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.NOTIFY_FROM },
      to: [{ email: env.NOTIFY_EMAIL }],
      subject: 'New sale: ' + (meta.course_slug || 'course'),
      textContent: lines,
    }),
  });
}

/**
 * Verify a Stripe webhook signature using Web Crypto (no SDK needed).
 * Header format: "t=timestamp,v1=signature[,v1=...]"
 */
async function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300) {
  if (!secret) throw new Error('missing STRIPE_WEBHOOK_SECRET');
  if (!header) return false;

  const parts = Object.create(null);
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (!k || !v) continue;
    if (k === 'v1') (parts.v1 ||= []).push(v);
    else parts[k] = v;
  }
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);

  const match = parts.v1.some((sig) => timingSafeEqual(sig, expected));
  if (!match) return false;

  const age = Math.floor(Date.now() / 1000) - Number(parts.t);
  if (Number.isFinite(age) && age > toleranceSeconds) return false;

  return true;
}

async function hmacSha256Hex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
