-- ContentScale Growth: exact-page settled daily GSC snapshots.
-- Migration only; never infer dates from aggregate tracker_gsc_queries.
CREATE TABLE IF NOT EXISTS growth_gsc_daily_metrics (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
 tracker_page_id INTEGER NOT NULL REFERENCES tracker_pages(id),
 page_url TEXT NOT NULL,
 gsc_property TEXT NOT NULL,
 metric_date DATE NOT NULL,
 search_type TEXT NOT NULL DEFAULT 'web' CHECK (search_type='web'),
 clicks INTEGER NOT NULL CHECK (clicks>=0),
 impressions INTEGER NOT NULL CHECK (impressions>=0 AND impressions>=clicks),
 nonbrand_clicks INTEGER CHECK (nonbrand_clicks IS NULL OR nonbrand_clicks BETWEEN 0 AND clicks),
 verified BOOLEAN NOT NULL DEFAULT FALSE,
 evidence_source TEXT NOT NULL CHECK (evidence_source IN ('google_search_console_api','reviewed_gsc_export')),
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(tracker_client_id,tracker_page_id,page_url,gsc_property,metric_date,search_type)
);
CREATE INDEX IF NOT EXISTS growth_gsc_daily_metrics_page_date_idx
 ON growth_gsc_daily_metrics(tracker_client_id,tracker_page_id,metric_date DESC);
-- Populate only from exact date+page GSC records. Do not backfill from rolled-up totals.
