-- Growth daily exact-page Search Console evidence; staging review before deployment.
-- Canonical tracker_client/page identity, no parallel customer model.
-- Only source-verified daily organic web click rows. Missing day != zero.
CREATE TABLE IF NOT EXISTS growth_gsc_daily_page_evidence (
  tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
  tracker_page_id INTEGER NOT NULL REFERENCES tracker_pages(id),
  page_url TEXT NOT NULL,
  gsc_property TEXT NOT NULL,
  observed_date DATE NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web' CHECK (search_type='web'),
  clicks INTEGER NOT NULL CHECK (clicks>=0),
  impressions INTEGER NOT NULL CHECK (impressions>=clicks),
  nonbrand_clicks INTEGER CHECK (nonbrand_clicks IS NULL OR (nonbrand_clicks>=0 AND nonbrand_clicks<=clicks)),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tracker_client_id,tracker_page_id,page_url,gsc_property,observed_date,search_type),
  CHECK (page_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS growth_gsc_daily_page_evidence_read_idx
  ON growth_gsc_daily_page_evidence (tracker_client_id,tracker_page_id,observed_date DESC);
