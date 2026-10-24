# Newsletter issue #1: seed send and real broadcast

Templates and CSVs are git-ignored here (public repo). Copy the 6 approved templates in before running:
`cp /workspace/newsletter/issue-01/seed-send/issue-01-{A1-customers,A2alt-signups,B-winback}.template.{html,txt} scripts/newsletter-issue01/`
The send code adds `ses:no-track` to the unsubscribe and privacy links at render time (the template files are not edited).

## Seed: `seed-newsletter-issue01.ts`
Sends 3 test emails (ONE copy each of A1 customers, A2alt signups and B win-back) to the test inbox only: `naumansulaiman@googlemail.com` (hard-coded; no list, DB or CLI recipient), From/Reply-To `support@sessiontalk.co.uk`.

- Default is a **dry run**: no DB, no SES, no call to the CRM app. It checks the templates (present, no banned terms, `{{unsubscribe_url}}` in html and txt), that the 3 images at `https://sessiontalk.io/img/newsletter/2026-10/` return 200 (HEAD), and the optional `--suppression-csv=` file.
- `--confirm-seed` also needs `DATABASE_URL`, SES env and an https `NEXT_PUBLIC_APP_URL`. It probes `GET /api/unsubscribe` with an unknown token (must be 404 and read-only), refuses if naumansulaiman@ is suppressed (`contacts.unsubscribed`), creates a contact row (`source=newsletter_seed`) if none exists, stores a fresh `unsubscribe_tokens` row per email, sends via `sendEmail()` using `buildNewsletterMessage()`, and logs a `newsletter_sent` activity (SES MessageId) on the seed contact.
- **Re-run guard:** refuses to send if the seed contact already has a `newsletter_sent` activity for this campaign, unless `--allow-reseed`. (The Fri 23 Oct 17:20 seed predates activity logging, so it is not counted.)

## Broadcast: `send-newsletter-issue01.ts` (never run without Nauman's go)
- `--list=A1:/path/a1.csv --list=B:/path/b.csv` (CSV with an `email` column). Dry run by default (no DB). `--check-db` adds read-only SELECTs for the exact count.
- `--confirm-send --expect-count=N` sends; it aborts before the first email if the DB-filtered count is not N. `--limit=N`, `--rate=2` (per second, max 10), `--suppression-csv=`.
- Excludes the seed inbox (+aliases), `source=newsletter_seed`, `unsubscribed=true`, the SES suppression CSV and anyone already sent/claimed for the campaign. Per recipient: `assertSendable()`, atomic claim in `processed_events`, fresh unsubscribe token, send, `newsletter_sent` activity + `send_logs` row. Stops when failures exceed 2%.

## SES event publishing (optional)
`SES_CONFIGURATION_SET` (expected `marketing-newsletter`). Unset = no `ConfigurationSetName` and no SES tags. Set = both, with tags `contact_id`, `campaign` (`newsletter-2026-10`), `variant` (A1|A2alt|B), sanitised to `[A-Za-z0-9_.-]`.
