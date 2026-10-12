-- Additive audit history of verified exact-page GSC imports.
-- The existing tracker_gsc_queries table remains canonical for CURRENT query metrics.
-- Never infer page-query links from property-wide CSV exports.
CREATE TABLE IF NOT EXISTS growth_gsc_page_import_runs (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
 tracker_page_id INTEGER NOT NULL REFERENCES tracker_pages(id),
 page_url TEXT NOT NULL,
 gsc_property TEXT NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE NOT NULL,
 clicks INTEGER NOT NULL CHECK(clicks>=0),
 impressions INTEGER NOT NULL CHECK(impressions>=0),
 position NUMERIC,
 query_count INTEGER NOT NULL CHECK(query_count>0),
 imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(end_date>=start_date)
);
CREATE INDEX IF NOT EXISTS growth_gsc_page_import_runs_page_idx
 ON growth_gsc_page_import_runs (tracker_client_id,tracker_page_id,imported_at DESC);
