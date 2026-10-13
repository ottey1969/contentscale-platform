-- ContentScale Network: prevent a discovered lead from becoming a public listing.
-- REVIEW BEFORE APPLYING IN PRODUCTION. No deletion of CRM, scan, or directory records.
-- Existing public verified businesses remain unchanged.
BEGIN;
-- The default for new entries must be private, even for source=lead_crawler.
ALTER TABLE network_directory_businesses
  ALTER COLUMN public_visibility SET DEFAULT 'hidden';
-- Quarantine the 60 unclaimed crawler records imported on 2026-10-08.
UPDATE network_directory_businesses
   SET public_visibility='hidden',updated_at=now()
 WHERE source='lead_crawler'
   AND status='unclaimed'
   AND verified_at IS NULL
   AND public_visibility='listed';
-- Enforce this invariant on future inserts and updates, regardless of the caller.
CREATE OR REPLACE FUNCTION network_directory_verified_visibility_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_visibility='listed'
     AND (NEW.status <> 'verified' OR NEW.verified_at IS NULL) THEN
     NEW.public_visibility := 'hidden';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS network_directory_verified_visibility_guard_tg ON network_directory_businesses;
CREATE TRIGGER network_directory_verified_visibility_guard_tg
BEFORE INSERT OR UPDATE OF public_visibility,status,verified_at
ON network_directory_businesses
FOR EACH ROW EXECUTE FUNCTION network_directory_verified_visibility_guard();
COMMIT;
-- Verification after applying:
-- SELECT source,status,public_visibility,count(*) FROM network_directory_businesses GROUP BY 1,2,3;
