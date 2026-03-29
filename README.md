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
