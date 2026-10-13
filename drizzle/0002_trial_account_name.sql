-- NOT APPLIED. Adds SessionCloud accountName (billing), sip_domain (workspace .sip host),
-- and bcc_internal (stable flag: BCC reviewer on first N trials after sending is enabled).
-- Edit this file rather than adding 0003 while still unapplied.
ALTER TABLE trial_accounts ADD COLUMN IF NOT EXISTS account_name varchar(128);
ALTER TABLE trial_accounts ADD COLUMN IF NOT EXISTS sip_domain varchar(253);
ALTER TABLE trial_accounts ADD COLUMN IF NOT EXISTS bcc_internal boolean NOT NULL DEFAULT false;
