-- NOT APPLIED. Additive, nullable, no backfill. Numbered 0004 because marketing #21 uses 0003.
-- Apply with Nauman's yes BEFORE deploying the code that writes these columns
-- (the SessionCloud signup webhook sends them only once sessioncloudlive ships the inline signup).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS signup_source_page varchar(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS signup_method varchar(32);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_attribution jsonb;
CREATE INDEX IF NOT EXISTS contacts_signup_source_page_idx ON contacts (signup_source_page) WHERE signup_source_page IS NOT NULL;
-- Rollback:
--   DROP INDEX IF EXISTS contacts_signup_source_page_idx;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS ad_attribution;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS signup_method;
--   ALTER TABLE contacts DROP COLUMN IF EXISTS signup_source_page;
