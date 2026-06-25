---
name: stripe
description: Use when integrating Stripe payments, creating course checkout flows, Payment Links, Products, Prices, Coupons, Promotion Codes, checkout redirects, webhooks, or updating a site to sell courses with Stripe. Prefer Stripe's API or CLI with secrets from the environment; never ask the user to paste secret keys into chat.
---

# Stripe

## Overview

Use this skill for Stripe-backed checkout and course-payment work: products, prices, coupons, promotion codes, Payment Links, checkout redirects, and website integration.

## Safety Rules

- Never ask the user to paste a Stripe secret key into chat.
- Use `STRIPE_SECRET_KEY` from the shell environment, a secret manager, or the Stripe CLI.
- Confirm whether you are using test mode or live mode before creating real customer-facing objects.
- For live writes, summarize the exact objects that will be created or changed before running API calls.
- Do not log full secret keys, webhook signing secrets, customer card data, or personally identifiable payment data.
- Prefer a new Payment Link per workshop/course so reporting and reconciliation are clear.

## Course Payment Link Workflow

For a course such as a live workshop:

1. Create a Stripe Product named after the course.
2. Create a one-time Price in GBP, usually the full anchor price.
3. If there is a launch offer, create a Coupon and Promotion Code rather than lowering the base price.
4. Create a Payment Link using the Price and enable promotion codes.
5. Update the course site's checkout redirect page and CTA copy.
6. Verify the live URL and checkout flow.

For the current course pattern:

- Product: `The Practical AI Workshop for Developers, Architects & Tech Leads`
- Price: `£50`
- Promotion code: `CODE25`
- Discount: `50% off`
- Expiry: one week from launch, or the user's specified date
- Site copy: `Use code CODE25 at checkout to pay £25 before <expiry date>.`

## Helper Script

Use `scripts/stripe_course_checkout.py` when creating a Stripe Payment Link from the API.

Example:

```bash
STRIPE_SECRET_KEY=sk_test_... python .codex/skills/stripe/scripts/stripe_course_checkout.py \
  --name "The Practical AI Workshop for Developers, Architects & Tech Leads" \
  --description "2-hour live AI workshop for developers, architects and tech leads" \
  --unit-amount-gbp 50 \
  --promo-code CODE25 \
  --percent-off 50 \
  --expires-at 2026-07-01 \
  --metadata course_slug=practical-ai-workshop \
  --metadata course_date=2026-07-05
```

The script prints JSON containing the created product, price, coupon, promotion code, and payment link IDs/URL.

## Updating Static Course Pages

For this repo's GitHub Pages course pages:

- Keep `docs/courses/<course>/checkout.html` as the analytics-friendly redirect page.
- Put the Stripe Payment Link in both the meta refresh and JavaScript redirect.
- Link all `Reserve` buttons to `checkout.html`, unless the user asks otherwise.
- If a promo code is required, mention it near the CTA and on the checkout redirect page.

Recommended CTA copy:

```text
Reserve Your Spot - £50
Use code CODE25 at checkout to pay £25 before <expiry date>.
```

## Webhook Integration

For app/server integrations:

- Use Checkout Sessions for dynamic server-side checkout.
- Store only Stripe IDs locally: `customer_id`, `checkout_session_id`, `payment_intent_id`, `price_id`.
- Verify webhook signatures using `STRIPE_WEBHOOK_SECRET`.
- Handle at minimum: `checkout.session.completed`, `payment_intent.payment_failed`, and refund/dispute events when relevant.
- Make webhook handlers idempotent by recording processed event IDs.

