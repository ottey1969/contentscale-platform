-- Growth WordPress identity mapping. Additive, never auto-applied.
-- No existing Tracker, Case Study or content_articles records are modified.
CREATE TABLE IF NOT EXISTS growth_wordpress_page_mapping (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
  tracker_page_id INTEGER NOT NULL REFERENCES tracker_pages(id),
  wordpress_post_id BIGINT NOT NULL CHECK (wordpress_post_id > 0),
  wordpress_url TEXT NOT NULL CHECK (wordpress_url LIKE 'https://%'),
  wordpress_modified_gmt TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  wordpress_raw_sha256 CHAR(64) CHECK (wordpress_raw_sha256 ~ '^[a-f0-9]{64}$'),
  reviewed_by TEXT NOT NULL CHECK (length(trim(reviewed_by)) > 0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_client_id, tracker_page_id),
  UNIQUE (wordpress_url, wordpress_post_id)
);

-- Upgrade older versions of this additive table safely.
-- Existing mappings must be reverified before the new revision column is trusted.
ALTER TABLE growth_wordpress_page_mapping
  ADD COLUMN IF NOT EXISTS wordpress_raw_sha256 CHAR(64);

-- This schema provides identity snapshots only. Publication is never authorized
-- by this migration. Approval requires a fresh authenticated WordPress read,
-- a locked Tracker source check, duplicate check, and Case Study exclusion.
