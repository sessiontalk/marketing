# SessionTalk Marketing

Email marketing and CRM tool for SessionTalk.

## Stack

- **Next.js 14** (App Router)
- **DigitalOcean droplet** (Docker container behind nginx, system cron) — see [`deploy/README.md`](deploy/README.md)
- **PostgreSQL 17** on the same droplet (node-postgres `pg`, pool max 10)
- **Resend** (email delivery)
- **Drizzle ORM** (database queries)
- **react-email** (email templates)
- **Tailwind CSS** (dashboard styling)

## Setup

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Fill in DATABASE_URL, RESEND_API_KEY, WEBHOOK_SECRET

# Push database schema
npm run db:push

# Seed database (templates + welcome sequence)
npx tsx scripts/seed.ts

# Import existing users
npm run import:csv -- C:\Users\nauman\openclaw-devops\sessioncloud-users.csv

# Run dev server
npm run dev
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/events/signup` | POST | Webhook for new signups (from cloud.sessiontalk.co.uk) |
| `/api/import/csv` | POST | Upload CSV file via form data |
| `/api/worker/sequences` | GET/POST | Cron-triggered sequence processor (every 5 min, `Authorization: Bearer $CRON_SECRET`) |
| `/api/worker/trial-nurture` | GET/POST | Cron-triggered trial nurture (every 10 min, `Authorization: Bearer $CRON_SECRET`) |
| `/api/worker/health` | GET | Health check: `200 {"ok":true,"db":"up"}` or `503 {"ok":false,"db":"down"}` |
| `/api/unsubscribe?token=xxx` | GET/POST | Unsubscribe handler |

## Database

```bash
# Generate migration from schema changes
npm run db:generate

# Push schema to database (dev)
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

## Webhook Integration

Add to your signup flow in cloud.sessiontalk.co.uk:

```javascript
await fetch('https://marketing.sessiontalk.co.uk/api/events/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-signature': hmacSha256(body, WEBHOOK_SECRET),
  },
  body: JSON.stringify({
    event: 'signup',
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    objectId: user.objectId,
  }),
});
```

## Deploy (DigitalOcean droplet)

The app runs as a Next.js standalone server in Docker on one droplet, with PostgreSQL 17 on the same host
(`DATABASE_URL=postgresql://crm_app:…@127.0.0.1:5432/marketing`). GitHub Actions (`.github/workflows/docker.yml`)
typechecks, tests and builds the image; on master it pushes `ghcr.io/sessiontalk/marketing-crm:<sha>` (private
package). There is no deploy step: DevOps pulls and restarts by hand. Crons are system cron on the droplet
(`deploy/cron.d/marketing-crm` → `deploy/crm-worker.sh`), not `vercel.json`.

Full notes: [`deploy/README.md`](deploy/README.md). Env values live only in `/etc/marketing-crm/*.env` on the
droplet, never in this repo.

When the database is unreachable, DB-backed API routes return `503 {"error":"database unavailable"}` with
`Retry-After: 30` instead of a bare 500 (`src/lib/dbErrors.ts`).

## Email Templates

Templates live in `src/emails/` as react-email components. Seed templates are also stored in the database with inline HTML.

### Personalisation

Use `{{firstname}}` in subjects and body — replaced at send time.
Use `{{unsubscribe_url}}` in HTML body — auto-generated per contact.

## Sequences

The welcome drip sequence:
1. **Immediate** — Welcome email
2. **48 hours** — Getting started guide
3. **120 hours (5 days)** — Upgrade CTA

## Automated email kill switch
`DRIP_SENDING_ENABLED` must equal `true` for /api/worker/sequences or /api/worker/trial-nurture to send anything. Unset/any other value = no-op. Both workers also require `CRON_SECRET` (system cron on the droplet sends `Authorization: Bearer $CRON_SECRET` on a GET via `deploy/crm-worker.sh`). On a new droplet `DRIP_SENDING_ENABLED` stays unset (off).
The legacy softphone "Welcome Drip" sequence is retired in code and can never send.

## Trial-nurture queue, backlog guard and alerts

Incident 17-25 Nov 2026: `/api/worker/trial-nurture` selected `plan_status='trial' LIMIT 50` with no
ORDER BY and never retired finished rows, so once >50 dead rows existed no new signup/trial got a
first email, silently. Rules now (`src/lib/trialNurture/queue.ts`, tests in `tests/nurtureQueue.test.ts`):

- **Queue**: `plan_status='trial'`, nurture product, `trial_ends_at` null or in the future; ordered
  `updated_at ASC NULLS FIRST, id`; 50 per run; every picked row is touched (`updated_at = now`) so the
  batch rotates and every row is reached within ceil(N/50) runs.
- **Retire**: when `decide()` returns a permanent stop (trial_ended, unsubscribed, no_sequence) or every
  step of the sequence is terminal, the worker sets `plan_status='ended'` (no migration: varchar).
  Revived to `'trial'` by trial.started (signup row upgrade), email.verified (retired verify reminder
  → finish_setup) and plan.changed with a future `trial_ends_at`.
- **Backlog guard** (Head of Marketing decides on late first emails): a row never emailed whose next
  email was due more than `NURTURE_LATE_FIRST_STEP_MAX_HOURS` (default 12) ago is handled by
  `NURTURE_LATE_FIRST_STEP_POLICY`: `hold` (default: not sent, not claimed, retried each run),
  `skip` (step recorded skipped `late_first_step`; later steps continue at max 1/day) or `send`.
  Optional `NURTURE_LATE_FIRST_STEP_ENROLLED_BEFORE` (ISO time) limits the guard to older enrolments.
- **Per-contact overrides** (win over the policy; entries are `email`, `email:product`, `app_id` or
  `app_id:product`, comma-separated, case-insensitive):
  - `NURTURE_LATE_FIRST_STEP_SKIP`: the overdue first step (row has no step yet, >MAX_HOURS late) is
    recorded skipped `late_first_step_manual`, e.g. when a manual catch-up email replaces it. The skip
    counts as an email for the one-per-24h rule, so the next worker email is >=24h later; later steps
    follow the schedule.
  - `NURTURE_SKIP_ALL_STEPS`: every step is recorded skipped `manual_no_email` (no email), then the row
    is retired. Scope with `:product` (e.g. `:signup_finish_setup`) so a later trial still gets nurture.
- **Alerts** (`src/lib/trialNurture/alerts.ts`): every alert is a `console.error` JSON line with
  `"level":"alert"`. Email alerts are OFF unless `NURTURE_ALERT_EMAIL_ENABLED=true`; recipients
  `NURTURE_ALERT_TO` (default naumansulaiman@googlemail.com, comma-separated), from support@.
  - per run: any failed send (full error message also logged as `trial_nurture_send_failed`);
  - daily 07:00 UTC `/api/worker/nurture-health` (Bearer CRON_SECRET, read-only, 503 when unhealthy):
    `first_step_sla` (queued row never emailed, next email >2h overdue), `no_sends_24h` (rows overdue
    and 0 sent in 24h), `send_failed` (failed steps in 24h). SES-side cross-check (S3 SES event
    archive vs CRM sends) stays outside the app.

Read-only checks for someone with CRM DB access:

```sql
select product, count(*) from trial_accounts where plan_status='trial' group by 1;
```

## Unsubscribes and suppression

One flag is the marketing suppression for every sender: `contacts.unsubscribed = true` (plus `contacts.unsubscribed_at`), matched on `lower(email)`. No separate table.

| How someone unsubscribes | What records it |
|---|---|
| Unsubscribe link in the email body (GET) | Nothing. GET only shows a confirm page; its button POSTs. |
| Confirm button (POST, form token) | `/api/unsubscribe` sets `contacts.unsubscribed` on every row with that email and cancels active `sequence_enrollments` |
| Mailbox one-click (RFC 8058 POST `List-Unsubscribe=One-Click`, token in the URL) | Same as above |
| Email to the `List-Unsubscribe` mailto (support@sessiontalk.co.uk) | **Not automatic.** Support runs `npx tsx scripts/suppress-emails.ts <email...> --confirm` (dry run without `--confirm`); this creates a contact row if needed. The CRM contact PATCH (`unsubscribed: true`) also works. |
| Legacy sequences worker (SES list management, `ContactListName=sessiontalk-contacts`) | SES's own unsubscribe link records in the SES contact list only, not in this DB. |

Every send checks it first: `worker/sequences` (skips and cancels when `contact.unsubscribed`), `worker/trial-nurture` (`decide()` stops on unsubscribed), and newsletter sends (`assertSendable()` / `partitionSendable()` in `src/lib/suppression.ts`, then `buildNewsletterMessage()` in `src/lib/newsletter.ts`). The admin test-send route sends only to typed internal addresses and does not check it.

All `List-Unsubscribe` headers use `<https://…/api/unsubscribe?token=…>, <mailto:support@sessiontalk.co.uk?subject=unsubscribe>` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and a fresh token for every send.
