# AI for Beginners — cohort schedule

Edit **`docs/assets/data/ai-for-beginners-cohorts.json`** to add or update cohorts. The hub and course pages load this file automatically via `assets/js/cohorts.js`.

## Status values

| Status | Meaning |
|--------|---------|
| `open` | Registration active — set exactly one cohort with `"isDefault": true` |
| `announced` | Listed as upcoming; registration not open yet |
| `closed` | Past or paused — shown in schedule, no registration |

## Monthly workflow

1. Set the previous cohort to `"status": "closed"`.
2. Add or open the new cohort with `"status": "open"` and `"isDefault": true`.
3. Optionally add the next month as `"announced"`.
4. Update Stripe payment link confirmation message (AI Training account) and redeploy if dates change in emails.

## Current schedule

- **Cohort 1** — 20 June 2026 — closed (completed)
- **Cohort 2** — 19 July 2026, Sun 4–7pm — **open**
- **Cohort 3** — 16 August 2026 — coming soon
