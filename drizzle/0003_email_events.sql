-- NOT APPLIED. Apply manually (Nauman's yes) before deploying the ses-events worker.
-- Additive only: new table + one nullable column. No data changes.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact_reason varchar(50);

CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(64) NOT NULL,
  ses_message_id varchar(255) NOT NULL,
  kind varchar(20) NOT NULL,
  recipient varchar(255) NOT NULL,
  contact_id uuid REFERENCES contacts(id),
  occurred_at timestamp NOT NULL,
  campaign varchar(100),
  variant varchar(50),
  subject varchar(500),
  link text,
  user_agent text,
  ip_address varchar(64),
  ses_bot_hint varchar(20),
  bounce_type varchar(30),
  bounce_sub_type varchar(50),
  is_bot boolean,
  bot_reason varchar(50),
  activity_id uuid REFERENCES activities(id),
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_events_event_key_uniq ON email_events (event_key);
CREATE INDEX IF NOT EXISTS email_events_msg_idx ON email_events (ses_message_id, recipient);
CREATE INDEX IF NOT EXISTS email_events_campaign_kind_idx ON email_events (campaign, kind);
CREATE INDEX IF NOT EXISTS email_events_contact_idx ON email_events (contact_id);
