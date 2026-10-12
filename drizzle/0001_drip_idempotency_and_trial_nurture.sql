-- NOT APPLIED. Apply only after crm-drip-retire-20261012.sql has run (it cancels the
-- 162 duplicated Welcome Drip rows; the partial unique index ignores cancelled rows).
-- Pre-check (must return 0 rows):
--   SELECT contact_id, sequence_id, count(*) FROM sequence_enrollments
--    WHERE status <> 'cancelled' GROUP BY 1,2 HAVING count(*) > 1;

-- (d) idempotency: one live enrolment per contact per sequence
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_contact_seq_live_uniq
  ON sequence_enrollments (contact_id, sequence_id) WHERE status <> 'cancelled';

-- (c) legacy softphone Welcome Drip can never send (code also hard-blocks by name)
UPDATE sequences SET active = false, updated_at = now() WHERE name = 'Welcome Drip' AND active;

-- SessionPBX trial nurture
CREATE TABLE IF NOT EXISTS trial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  app_id varchar(64) NOT NULL UNIQUE,
  product varchar(30) NOT NULL,
  enrolled_at timestamp NOT NULL DEFAULT now(),
  trial_started_at timestamp NOT NULL,
  trial_ends_at timestamp,
  project_created_at timestamp,
  extension_count integer NOT NULL DEFAULT 0,
  softphone_first_login_at timestamp,
  first_call_at timestamp,
  carrier_connected_at timestamp,
  sales_call_booked_at timestamp,
  sales_call_held_at timestamp,
  last_inbound_reply_at timestamp,
  payment_method_added_at timestamp,
  plan_status varchar(20) NOT NULL DEFAULT 'trial',
  updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trial_nurture_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_account_id uuid NOT NULL REFERENCES trial_accounts(id),
  step integer NOT NULL,
  status varchar(20) NOT NULL,
  reason varchar(64),
  ses_message_id varchar(255),
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trial_nurture_steps_uniq ON trial_nurture_steps (trial_account_id, step);
CREATE TABLE IF NOT EXISTS processed_events (
  event_id varchar(128) PRIMARY KEY,
  received_at timestamp DEFAULT now()
);
