-- ==========================================
-- CONTENTSCALE COMPLETE DATABASE SCHEMA
-- ==========================================

-- 1. AGENCIES TABLE (already created, but here for reference)
CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    country VARCHAR(50) NOT NULL,
    v52_score DECIMAL(5,2),
    rank INTEGER,
    last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Agency partner fields
    email VARCHAR(255),
    admin_key VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'starter',
    scans_limit INTEGER DEFAULT 100,
    scans_used INTEGER DEFAULT 0,
    subscription_expires TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    
    -- Whitelabel
    whitelabel_enabled BOOLEAN DEFAULT false,
    whitelabel_name VARCHAR(255),
    whitelabel_logo TEXT,
    whitelabel_primary_color VARCHAR(7),
    custom_domain VARCHAR(255),
    
    notes TEXT
);

-- 2. AGENCY CLIENTS TABLE
CREATE TABLE IF NOT EXISTS agency_clients (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    share_link_key VARCHAR(255) UNIQUE NOT NULL,
    scans_limit INTEGER DEFAULT 30,
    scans_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. SHARE LINKS TABLE (for direct clients, not agency clients)
CREATE TABLE IF NOT EXISTS share_links (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    scans_limit INTEGER DEFAULT 30,
    scans_used INTEGER DEFAULT 0,
    days_limit INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    bonus_days INTEGER DEFAULT 0,
    bonus_scans INTEGER DEFAULT 0
);

-- 4. SCANS TABLE (history of all scans)
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score DECIMAL(5,2),
    share_key VARCHAR(255),
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    scan_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. SECURITY LOGS TABLE
CREATE TABLE IF NOT EXISTS security_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    success BOOLEAN DEFAULT false,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SECURITY CONFIG TABLE
CREATE TABLE IF NOT EXISTS security_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    ip_whitelist_enabled BOOLEAN DEFAULT false,
    ip_whitelist TEXT[] DEFAULT '{}',
    rate_limit_enabled BOOLEAN DEFAULT true,
    max_attempts INTEGER DEFAULT 5,
    window_minutes INTEGER DEFAULT 15,
    lockout_minutes INTEGER DEFAULT 30,
    admin_api_key VARCHAR(255) NOT NULL,
    CHECK (id = 1)
);

-- Insert default security config if not exists
INSERT INTO security_config (admin_api_key) 
VALUES ('change-this-in-production-' || gen_random_uuid())
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Agencies indexes
CREATE INDEX IF NOT EXISTS idx_agencies_country_score ON agencies(country, v52_score DESC);
CREATE INDEX IF NOT EXISTS idx_agencies_domain ON agencies(domain);
CREATE INDEX IF NOT EXISTS idx_agencies_admin_key ON agencies(admin_key);
CREATE INDEX IF NOT EXISTS idx_agencies_enabled ON agencies(enabled);

-- Agency clients indexes
CREATE INDEX IF NOT EXISTS idx_agency_clients_agency_id ON agency_clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_clients_share_key ON agency_clients(share_link_key);

-- Share links indexes
CREATE INDEX IF NOT EXISTS idx_share_links_key ON share_links(key);
CREATE INDEX IF NOT EXISTS idx_share_links_enabled ON share_links(enabled);

-- Scans indexes
CREATE INDEX IF NOT EXISTS idx_scans_share_key ON scans(share_key);
CREATE INDEX IF NOT EXISTS idx_scans_agency_id ON scans(agency_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- Security logs indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip);

-- ==========================================
-- FUNCTIONS FOR AUTO-UPDATING RANKS
-- ==========================================

-- Function to update agency ranks by country
CREATE OR REPLACE FUNCTION update_agency_ranks() 
RETURNS void AS $$
BEGIN
    -- Update ranks for Netherlands
    UPDATE agencies a
    SET rank = subquery.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY v52_score DESC NULLS LAST) as rank
        FROM agencies
        WHERE country = 'Netherlands' AND v52_score IS NOT NULL
    ) AS subquery
    WHERE a.id = subquery.id AND a.country = 'Netherlands';
    
    -- Update ranks for USA
    UPDATE agencies a
    SET rank = subquery.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY v52_score DESC NULLS LAST) as rank
        FROM agencies
        WHERE country = 'USA' AND v52_score IS NOT NULL
    ) AS subquery
    WHERE a.id = subquery.id AND a.country = 'USA';
    
    -- Update ranks for UK
    UPDATE agencies a
    SET rank = subquery.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY v52_score DESC NULLS LAST) as rank
        FROM agencies
        WHERE country = 'UK' AND v52_score IS NOT NULL
    ) AS subquery
    WHERE a.id = subquery.id AND a.country = 'UK';
    
    -- Update ranks for Germany
    UPDATE agencies a
    SET rank = subquery.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY v52_score DESC NULLS LAST) as rank
        FROM agencies
        WHERE country = 'Germany' AND v52_score IS NOT NULL
    ) AS subquery
    WHERE a.id = subquery.id AND a.country = 'Germany';
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGER TO AUTO-UPDATE RANKS
-- ==========================================

CREATE OR REPLACE FUNCTION trigger_update_ranks() 
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_agency_ranks();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_update_ranks ON agencies;
CREATE TRIGGER auto_update_ranks
AFTER INSERT OR UPDATE OF v52_score ON agencies
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_update_ranks();

-- ==========================================
-- INITIAL DATA CHECK
-- ==========================================

-- Show count of agencies
SELECT 'Agencies count:' as info, COUNT(*) as count FROM agencies;
SELECT 'Agency clients count:' as info, COUNT(*) as count FROM agency_clients;
SELECT 'Share links count:' as info, COUNT(*) as count FROM share_links;
SELECT 'Scans count:' as info, COUNT(*) as count FROM scans;

-- Update all ranks
SELECT update_agency_ranks();
