# SessionTalk Marketing

Email marketing and CRM tool for SessionTalk.

## Stack

- **Next.js 14** (App Router)
- **Vercel** (hosting + cron)
- **Neon / Vercel Postgres** (database)
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
| `/api/worker/sequences` | POST | Cron-triggered sequence processor (every 5 min) |
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

## Deploy to Vercel

```bash
# Connect to Vercel
vercel

# Set environment variables in Vercel dashboard:
# - DATABASE_URL
# - RESEND_API_KEY
# - WEBHOOK_SECRET
# - CRON_SECRET (auto-set by Vercel Cron)

# Deploy
vercel --prod
```

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
`DRIP_SENDING_ENABLED` must equal `true` for /api/worker/sequences or /api/worker/trial-nurture to send anything. Unset/any other value = no-op. Both workers also require `CRON_SECRET` (Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on a GET).
The legacy softphone "Welcome Drip" sequence is retired in code and can never send.

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
