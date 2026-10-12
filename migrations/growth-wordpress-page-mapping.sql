-- Growth WordPress identity mapping: additive only, not applied automatically.
-- Existing Tracker / Case Study / content_articles tables remain unchanged.
CREATE TABLE IF NOT EXISTS growth_wordpress_page_mapping (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
  tracker_page_id INTEGER NOT NULL REFERENCES tracker_pages(id),
  wordpress_post_id BIGINT NOT NULL CHECK(wordpress_post_id>0),
  wordpress_url TEXT NOT NULL CHECK(wordpress_url LIKE 'https://%'),
  wordpress_modified_gmt TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  source_sha256 CHAR(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}
  reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_client_id,tracker_page_id),
  UNIQUE (wordpress_url,wordpress_post_id)
);
-- Mapping is a verified identity snapshot, not authorization to publish.

-- Before adding any reviewed mapping, validate page ownership under a database lock.
-- This migration deliberately creates no mappings or grants publication rights.
-- An application-level approval transaction must check the current Tracker
-- client/page identity, live WordPress revision and active Case Study status.
),
  wordpress_raw_sha256 CHAR(64) NOT NULL CHECK(wordpress_raw_sha256 ~ '^[a-f0-9]{64}
  reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_client_id,tracker_page_id),
  UNIQUE (wordpress_url,wordpress_post_id)
);
-- Mapping is a verified identity snapshot, not authorization to publish.

-- Before adding any reviewed mapping, validate page ownership under a database lock.
-- This migration deliberately creates no mappings or grants publication rights.
-- An application-level approval transaction must check the current Tracker
-- client/page identity, live WordPress revision and active Case Study status.
),
  reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracker_client_id,tracker_page_id),
  UNIQUE (wordpress_url,wordpress_post_id)
);
-- Mapping is a verified identity snapshot, not authorization to publish.

-- Before adding any reviewed mapping, validate page ownership under a database lock.
-- This migration deliberately creates no mappings or grants publication rights.
-- An application-level approval transaction must check the current Tracker
-- client/page identity, live WordPress revision and active Case Study status.

-- Backward-compatible upgrade for the earlier empty mapping table.
ALTER TABLE growth_wordpress_page_mapping ADD COLUMN IF NOT EXISTS wordpress_raw_sha256 CHAR(64);
