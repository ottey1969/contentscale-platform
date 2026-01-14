-- Consolidated Schema for ContentScale Platform

-- 1. SUPER ADMINS (Auth)
CREATE TABLE IF NOT EXISTS super_admins (
    id SERIAL PRIMARY KEY,
    admin_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. ADMINS (Helpers/Staff)
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

-- 3. AGENCIES
CREATE TABLE IF NOT EXISTS agencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    country VARCHAR(50) NOT NULL,
    v52_score DECIMAL(5,2),
    rank INTEGER,
    last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(255),
    admin_key VARCHAR(255) UNIQUE,
    plan VARCHAR(50) DEFAULT 'starter',
    scans_limit INTEGER DEFAULT 100,
    scans_used INTEGER DEFAULT 0,
    subscription_expires TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    enabled BOOLEAN DEFAULT true,
    whitelabel_enabled BOOLEAN DEFAULT false,
    whitelabel_name VARCHAR(255),
    whitelabel_logo TEXT,
    whitelabel_primary_color VARCHAR(7),
    custom_domain VARCHAR(255),
    notes TEXT
);

-- 4. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. SCANS
CREATE TABLE IF NOT EXISTS scans (
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

-- 6. SHARE LINKS
CREATE TABLE IF NOT EXISTS share_links (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. PUBLIC LEADERBOARD
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
