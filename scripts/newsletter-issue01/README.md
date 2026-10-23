# Newsletter issue #1 seed send

`seed-newsletter-issue01.ts` sends 3 test emails (ONE copy each of A1 customers, A2alt signups and B win-back) to the test inbox only: `naumansulaiman@googlemail.com` (hard-coded; no list, DB or CLI recipient), From/Reply-To `support@sessiontalk.co.uk`.

- Default is a **dry run**: no DB, no SES, no call to the CRM app. It checks the templates (present, no banned terms, `{{unsubscribe_url}}` in html and txt), that the 3 images at `https://sessiontalk.io/img/newsletter/2026-10/` return 200, and the optional `--suppression-csv=` file.
- `--confirm-seed` also needs `DATABASE_URL`, SES env and an https `NEXT_PUBLIC_APP_URL`. It probes `GET /api/unsubscribe` with an unknown token (must be 404 and read-only), refuses if naumansulaiman@ is suppressed (`contacts.unsubscribed`), creates a contact row (`source=newsletter_seed`) if none exists, stores a fresh `unsubscribe_tokens` row per email, and sends via `sendEmail()` using `buildNewsletterMessage()`.
- Templates and CSVs are git-ignored here (public repo). Copy them in before running:
  `cp /workspace/newsletter/issue-01/seed-send/issue-01-*.template.* scripts/newsletter-issue01/`
