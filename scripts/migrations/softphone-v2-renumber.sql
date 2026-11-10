-- Softphone nurture v2 step renumber (5-email → 6-email).
-- DO NOT RUN automatically. Apply once BEFORE enabling the v2 worker in prod.
--
-- Old: 1 provisioning, 2 qr, 3 push, 4 check_in, 5 trial_ending
-- New: 1 provisioning, 2 qr, 3 push, 4 messaging, 5 check_in, 6 trial_ending
-- Marker: step 0 / reason softphone_seq_v2 so read-time remap stays idempotent.
--
-- Only rows for generic_softphone trials. Order matters (unique (trial_account_id, step)).

BEGIN;

-- Renumber ending first (free slot), then check-in.
UPDATE trial_nurture_steps AS s
SET step = 6
FROM trial_accounts AS t
WHERE s.trial_account_id = t.id
  AND t.product = 'generic_softphone'
  AND s.step = 5;

UPDATE trial_nurture_steps AS s
SET step = 5
FROM trial_accounts AS t
WHERE s.trial_account_id = t.id
  AND t.product = 'generic_softphone'
  AND s.step = 4;

-- Stamp every softphone trial so mapLegacySoftphoneSentSteps treats rows as v2.
INSERT INTO trial_nurture_steps (trial_account_id, step, status, reason)
SELECT t.id, 0, 'skipped', 'softphone_seq_v2'
FROM trial_accounts AS t
WHERE t.product = 'generic_softphone'
ON CONFLICT (trial_account_id, step) DO NOTHING;

COMMIT;
