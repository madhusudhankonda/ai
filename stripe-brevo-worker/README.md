# Stripe → Brevo bridge

A tiny Cloudflare Worker that fires whenever you get a **Stripe customer**. It:

1. Receives the Stripe `checkout.session.completed` webhook,
2. Verifies the Stripe signature,
3. Adds/updates the buyer as a **contact in a Brevo list**.

Adding them to that list is the entry trigger for your **Brevo automation** (confirmation email, joining link, reminders, etc.).

Nothing here contains secrets — the Stripe signing secret and Brevo API key are stored as encrypted Worker secrets.

---

## One-time setup

### 1. Create the Brevo list + automation (Brevo dashboard)

1. **Contacts → Lists → Add a list**, e.g. `Developers Masterclass — 25 Jul`. Note its **numeric List ID**.
2. **Automations → Create an automation → Start from scratch.**
   - **Entry point:** *A contact is added to a list* → select the list above.
   - **Actions:** e.g. *Send an email* (confirmation + Zoom joining link), then *Wait* until the day before, then *Send an email* (reminder).
   - Turn the automation **ON**.
3. **SMTP & API → API Keys → Generate a new API key** with contacts permission. Copy it (starts `xkeysib-`).

### 2. Configure & deploy the Worker

```bash
cd stripe-brevo-worker
npm install

# set the target list id (or edit wrangler.toml [vars])
#   BREVO_LIST_ID must match the list from step 1

# add secrets (encrypted, never in the repo)
npx wrangler secret put BREVO_API_KEY          # paste the xkeysib-... key
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # paste after step 3 below

npx wrangler deploy
```

Deploy prints your Worker URL, e.g. `https://stripe-brevo-bridge.<subdomain>.workers.dev`.

### 3. Point Stripe at the Worker

1. Stripe Dashboard (**Live mode**) → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** your Worker URL from step 2.
3. **Events to send:** `checkout.session.completed` (optionally also `checkout.session.async_payment_succeeded`).
4. Add endpoint, then copy its **Signing secret** (`whsec_...`) and run
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET` with it, then `npx wrangler deploy` again.

### 4. (Recommended) Carry the buyer's name/email + course info

The Payment Link already collects the email. To also capture the name and tag the course:

- In the Payment Link settings, enable **collect customer name**.
- Add metadata to the link (e.g. `course_slug=practical-ai-for-developers`, `course_date=2026-07-25`) — the Worker copies these into Brevo contact attributes `COURSE` / `COURSE_DATE`.

---

## Test it

- Stripe Dashboard → Webhooks → your endpoint → **Send test webhook** → `checkout.session.completed`.
- Check the contact appears in the Brevo list and the automation runs.
- Worker logs: `npx wrangler tail`.

## Environment reference

| Name | Type | Purpose |
| --- | --- | --- |
| `STRIPE_WEBHOOK_SECRET` | secret | Verifies the webhook came from Stripe |
| `BREVO_API_KEY` | secret | Brevo API key with Contacts write |
| `BREVO_LIST_ID` | var | List that triggers the automation |
| `NOTIFY_EMAIL` | var (optional) | Where to send a new-sale alert |
| `NOTIFY_FROM` | var (optional) | Verified Brevo sender for the alert |
