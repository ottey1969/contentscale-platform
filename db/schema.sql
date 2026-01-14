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

-- ==========================================
-- 🔧 CONTENTSCORE TOOL TABELSTRUCTUREN
-- ==========================================

-- 7. SUPER ADMINS TABLE (for admin authentication)
CREATE TABLE IF NOT EXISTS super_admins (
    id SERIAL PRIMARY KEY,
    admin_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. ADMINS TABLE (for sub-admins)
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    full_name VARCHAR(255),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- 9. CLIENTS TABLE (old structure, keeping for compatibility)
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 10. SHARE LINKS ENHANCED (new structure for ContentScore)
CREATE TABLE IF NOT EXISTS share_links_enhanced (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    company VARCHAR(255),
    max_uses INTEGER DEFAULT 30,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    allowed_features JSONB,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    avg_score DECIMAL(5,2),
    last_used TIMESTAMP
);

-- 11. PUBLIC LEADERBOARD TABLE
CREATE TABLE IF NOT EXISTS public_leaderboard (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    url_hash VARCHAR(32) UNIQUE,
    score DECIMAL(5,2),
    quality VARCHAR(50),
    graaf_score DECIMAL(5,2),
    craft_score DECIMAL(5,2),
    technical_score DECIMAL(5,2),
    word_count INTEGER,
    company_name VARCHAR(255),
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    agency_name VARCHAR(255),
    category VARCHAR(50),
    country VARCHAR(50),
    language VARCHAR(50),
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 12. SCANS ENHANCED TABLE (detailed scans for ContentScore)
CREATE TABLE IF NOT EXISTS scans_enhanced (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score DECIMAL(5,2),
    quality VARCHAR(50),
    graaf_score DECIMAL(5,2),
    craft_score DECIMAL(5,2),
    technical_score DECIMAL(5,2),
    breakdown JSONB,
    recommendations JSONB,
    word_count INTEGER,
    scan_type VARCHAR(50),
    share_key VARCHAR(255),
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    scan_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 🔧 CONTENTSCORE DETAILED TABLES
-- ==========================================

-- 13. CONTENT ANALYSES TABLE (gedetailleerde analyses)
CREATE TABLE IF NOT EXISTS content_analyses (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    url TEXT,
    total_score DECIMAL(5,2) NOT NULL,
    graaf_score DECIMAL(5,2) NOT NULL,
    craft_score DECIMAL(5,2) NOT NULL,
    technical_score DECIMAL(5,2) NOT NULL,
    criteria_met INTEGER NOT NULL,
    criteria_total INTEGER NOT NULL DEFAULT 100,
    missing_criteria JSONB,
    recommendations JSONB,
    analysis_details JSONB,
    word_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 14. AGENCY CONTENT SCORES TABLE (koppeling aan agencies)
CREATE TABLE IF NOT EXISTS agency_content_scores (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) REFERENCES content_analyses(content_hash),
    total_score DECIMAL(5,2) NOT NULL,
    analysis_date TIMESTAMP DEFAULT NOW(),
    UNIQUE(agency_id, content_hash)
);

-- 15. SHARE LINK SCORES TABLE (koppeling aan share links)
CREATE TABLE IF NOT EXISTS share_link_scores (
    id SERIAL PRIMARY KEY,
    share_code VARCHAR(255) REFERENCES share_links_enhanced(token),
    content_hash VARCHAR(64) REFERENCES content_analyses(content_hash),
    total_score DECIMAL(5,2) NOT NULL,
    analysis_date TIMESTAMP DEFAULT NOW(),
    UNIQUE(share_code, content_hash)
);

-- 16. CONTENTSCORE ANALYSES TABLES (voor hybride analyse)
CREATE TABLE IF NOT EXISTS contentscore_analyses (
    id SERIAL PRIMARY KEY,
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('url', 'html')),
    url TEXT,
    html_preview TEXT,
    score DECIMAL(5,2) NOT NULL,
    structure_score DECIMAL(5,2) NOT NULL,
    readability_score DECIMAL(5,2) NOT NULL,
    seo_score DECIMAL(5,2) NOT NULL,
    technical_score DECIMAL(5,2) NOT NULL,
    recommendations JSONB NOT NULL,
    word_count INTEGER NOT NULL,
    heading_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 17. CONTENTSCORE COMPARISONS TABLE (voor vergelijkingen)
CREATE TABLE IF NOT EXISTS contentscore_comparisons (
    id SERIAL PRIMARY KEY,
    hash1 VARCHAR(64) NOT NULL,
    hash2 VARCHAR(64) NOT NULL,
    comparison_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(hash1, hash2)
);

-- 18. CONTENTSCORE STATS TABLE (voor trend analyse)
CREATE TABLE IF NOT EXISTS contentscore_stats (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    total_analyses INTEGER DEFAULT 0,
    avg_score DECIMAL(5,2) DEFAULT 0,
    avg_structure_score DECIMAL(5,2) DEFAULT 0,
    avg_readability_score DECIMAL(5,2) DEFAULT 0,
    avg_seo_score DECIMAL(5,2) DEFAULT 0,
    avg_technical_score DECIMAL(5,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

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

-- Enhanced share links indexes
CREATE INDEX IF NOT EXISTS idx_share_links_enhanced_token ON share_links_enhanced(token);
CREATE INDEX IF NOT EXISTS idx_share_links_enhanced_active ON share_links_enhanced(is_active);
CREATE INDEX IF NOT EXISTS idx_share_links_enhanced_agency ON share_links_enhanced(agency_id);

-- Scans indexes
CREATE INDEX IF NOT EXISTS idx_scans_share_key ON scans(share_key);
CREATE INDEX IF NOT EXISTS idx_scans_agency_id ON scans(agency_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- Enhanced scans indexes
CREATE INDEX IF NOT EXISTS idx_scans_enhanced_score ON scans_enhanced(score DESC);
CREATE INDEX IF NOT EXISTS idx_scans_enhanced_type ON scans_enhanced(scan_type);
CREATE INDEX IF NOT EXISTS idx_scans_enhanced_agency ON scans_enhanced(agency_id);

-- Security logs indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip);

-- ContentScore indexes
CREATE INDEX IF NOT EXISTS idx_content_analyses_hash ON content_analyses(content_hash);
CREATE INDEX IF NOT EXISTS idx_content_analyses_score ON content_analyses(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_analyses_created ON content_analyses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_content_scores_agency ON agency_content_scores(agency_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_share_link_scores_code ON share_link_scores(share_code);

CREATE INDEX IF NOT EXISTS idx_contentscore_analyses_hash ON contentscore_analyses(content_hash);
CREATE INDEX IF NOT EXISTS idx_contentscore_analyses_created ON contentscore_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contentscore_analyses_score ON contentscore_analyses(score DESC);

-- Leaderboard indexes
CREATE INDEX IF NOT EXISTS idx_public_leaderboard_url_hash ON public_leaderboard(url_hash);
CREATE INDEX IF NOT EXISTS idx_public_leaderboard_score ON public_leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_public_leaderboard_country ON public_leaderboard(country);
CREATE INDEX IF NOT EXISTS idx_public_leaderboard_category ON public_leaderboard(category);

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
-- UPDATE EXISTING TABLES WITH NEW COLUMNS
-- ==========================================

-- Update agencies table met ContentScore kolommen
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS v52_score DECIMAL(5,2);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS last_scanned TIMESTAMP;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS rank INTEGER;

-- Update share_links table met score tracking
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS avg_score DECIMAL(5,2);
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;

-- ==========================================
-- INITIAL DATA CHECK
-- ==========================================

-- Insert default security config if not exists
INSERT INTO security_config (admin_api_key) 
VALUES ('change-this-in-production-' || gen_random_uuid())
ON CONFLICT (id) DO NOTHING;

-- Show count of agencies
SELECT 'Agencies count:' as info, COUNT(*) as count FROM agencies;
SELECT 'Agency clients count:' as info, COUNT(*) as count FROM agency_clients;
SELECT 'Share links count:' as info, COUNT(*) as count FROM share_links;
SELECT 'Enhanced share links count:' as info, COUNT(*) as count FROM share_links_enhanced;
SELECT 'Scans count:' as info, COUNT(*) as count FROM scans;
SELECT 'Enhanced scans count:' as info, COUNT(*) as count FROM scans_enhanced;
SELECT 'Content analyses count:' as info, COUNT(*) as count FROM content_analyses;
SELECT 'Leaderboard entries count:' as info, COUNT(*) as count FROM public_leaderboard;

-- Update all ranks
SELECT update_agency_ranks();
