# Survey #1 invite send (`send-survey01.ts`)

Never run `--confirm-send` without Nauman's explicit yes. Templates and recipient CSVs are not in git (public repo): pass `--template-dir=` (needs `survey01-invite.template.html`, `.template.txt`, `.subject.txt`).

- Dry run (default): no DB, no SES, no AWS. Refuses on missing/placeholder Tally links (`--survey-url`, `--feature-url` must be `https://tally.so/r/<id>`), TODO/PLACEHOLDER/FORMID/FRFORM/example URLs in the templates, banned terms, missing `{{unsubscribe_url}}`, unexpected From/Reply-To, or any unfilled `{{...}}` after rendering every row.
- `--check-db`: read-only SELECTs (contacts, activities, processed_events) for the exact count.
- `--confirm-send --expect-count=N`: needs `SES_CONFIGURATION_SET=marketing-newsletter`, `DATABASE_URL`, https `NEXT_PUBLIC_APP_URL`. Sends in batches (`--batch-size=25`, `--batch-gap-min=20`). Before each batch the CloudWatch account rates must be below `--max-bounce-rate` (default 0.045) and `--max-complaint-rate` (0.0008); unreadable = refuse. Between batches it reads the SES event archive for the previous batch and pauses on any complaint or 2+ hard bounces. One claim per recipient (`survey:survey-01:<contact id>`), so re-runs skip anyone already claimed.
- Hidden fields on the links: `seg`, `v=s01`. The signed `t` token is not built yet.
