-- NOT APPLIED. Adds SessionCloud accountName for in-app links in nurture emails.
ALTER TABLE trial_accounts ADD COLUMN IF NOT EXISTS account_name varchar(128);
