-- Private, company-scoped commercial funnel observations. No customer identities,
-- invoice numbers, invoice amounts, addresses, or attachment contents are stored.
-- Owner reports are NEVER verified job/payment evidence or SEO attribution.
CREATE TABLE IF NOT EXISTS growth_commercial_outcome_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tracker_client_id INTEGER NOT NULL REFERENCES tracker_clients(id),
 internal_evidence_id UUID NOT NULL,
 reported_stage TEXT NOT NULL CHECK (reported_stage IN
  ('inquiry_received','estimate_sent','invoice_issued','job_accepted','work_completed','payment_received')),
 claimed_channel TEXT NOT NULL DEFAULT 'unknown' CHECK (claimed_channel IN
  ('organic_search','google_business_profile','paid_ads','referral','repeat_customer','direct','unknown')),
 observed_at DATE NOT NULL,
 source TEXT NOT NULL DEFAULT 'owner_statement' CHECK (source='owner_statement'),
 source_verified BOOLEAN NOT NULL DEFAULT FALSE CHECK (source_verified=FALSE),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tracker_client_id,internal_evidence_id)
);
CREATE INDEX IF NOT EXISTS growth_commercial_outcome_events_client_date_idx
 ON growth_commercial_outcome_events(tracker_client_id,observed_at DESC);
