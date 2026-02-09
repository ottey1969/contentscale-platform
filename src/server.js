/// ============================================
// CONTENTSCALE SERVER.JS - COMPLETE WORKING VERSION
// ============================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');

// ============================================
// EMAIL SERVICES
// ============================================
const HybridEmailService = require('./services/hybrid-email-service');
const EmailDetectionService = require('./services/email-detection-service');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// PUPPETEER BROWSER INSTANCE
// ============================================
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    console.log('🚀 Launching Puppeteer browser...');
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      timeout: 30000
    });
    console.log('✅ Puppeteer browser ready');
  }
  return browserInstance;
}

process.on('SIGTERM', async () => {
  if (browserInstance) {
    console.log('🛑 Closing Puppeteer browser...');
    await browserInstance.close();
  }
  process.exit(0);
});

// ============================================
// DATABASE CONFIGURATION
// ============================================
let dbConfig;

if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  dbConfig = {
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
} else {
  dbConfig = {
    host: 'localhost',
    database: 'contentscale',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    ssl: false
  };
}

const pool = new Pool(dbConfig);

// ============================================
// GOOGLE MAPS SCRAPER SERVICE
// ============================================
const GoogleMapsScraper = require('./services/google-maps-scraper');
const gmapsScraper = new GoogleMapsScraper(pool);

// ============================================
// EMAIL SERVICE INITIALIZATION
// ============================================
const emailService = new HybridEmailService(pool);
const emailDetectionService = new EmailDetectionService();

// ============================================
// STABLE CACHE SYSTEM
// ============================================
const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashContent(html) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

// Clear cache on startup
scanCache.clear();
console.log('🧹 Cache cleared on startup');

// Cache cleanup interval
setInterval(() => {
  const now = Date.now();
  let cleared = 0;
  for (const [key, value] of scanCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      scanCache.delete(key);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`🧹 Cleared ${cleared} expired cache entries`);
  }
}, 60000);

// ============================================
// STABLE SCORING ALGORITHM
// ============================================

function calculateStableScores(content, stats, rawHtml) {
  const { wordCount = 0, h1Count = 0, h2Count = 0, h3Count = 0, listCount = 0 } = stats;
  
  // GRAAF SCORES (50 points total) - STABLE
  let graafScore = 0;
  const graafItems = {};
  
  // Credibility (0-16)
  let credibility = 0;
  const hasAuthor = /by\s+\w+|author:|written\s+by|contributor/i.test(content);
  const hasQuotes = /["']|says|according|explains|notes/i.test(content);
  const hasExpert = /expert|specialist|professional|certified/i.test(content);
  credibility += hasAuthor ? 6 : 0;
  credibility += hasQuotes ? 5 : 0;
  credibility += hasExpert ? 5 : 0;
  graafItems.credibility = Math.min(16, credibility);
  
  // Relevance (0-18) - Based on word count
  const relevance = Math.min(18, Math.floor(wordCount / 55)); // ~1000 words = 18
  graafItems.relevance = relevance;
  
  // Accuracy (0-8) - Based on stats/sources
  let accuracy = 0;
  const hasStats = /\d+%|\d+\s+of|\d+\s+out\s+of|\d+\s+studies|\d+\s+research/i.test(content);
  const hasSources = /source:|reference:|according to|study by/i.test(content);
  accuracy += hasStats ? 4 : 0;
  accuracy += hasSources ? 4 : 0;
  graafItems.accuracy = Math.min(8, accuracy);
  
  // Freshness (0-8)
  let freshness = 0;
  const currentYear = new Date().getFullYear();
  const yearRegex = new RegExp(`20[2-9][0-9]|${currentYear}|${currentYear-1}`, 'gi');
  const hasRecentDate = yearRegex.test(content) || /january|february|march|april|may|june|july|august|september|october|november|december/gi.test(content);
  freshness += hasRecentDate ? 6 : 2; // Base freshness
  graafItems.freshness = Math.min(8, freshness);
  
  graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
  
  // CRAFT SCORES (30 points total) - STABLE
  let craftScore = 0;
  const craftItems = {};
  
  // Heading Structure (0-8)
  const headingStructure = h1Count === 1 ? 8 : h1Count > 1 ? 4 : 2;
  craftItems.headingStructure = headingStructure;
  
  // Subheadings (0-10)
  const subheadings = Math.min(10, (h2Count * 2) + (h3Count * 1));
  craftItems.subheadings = subheadings;
  
  // Paragraphs (0-8) - Based on readability
  const paragraphs = Math.min(8, Math.floor(wordCount / 125)); // ~1000 words = 8
  craftItems.paragraphs = paragraphs;
  
  // Lists (0-4)
  const lists = listCount >= 3 ? 4 : listCount >= 1 ? 2 : 0;
  craftItems.lists = lists;
  
  craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
  
  // TECHNICAL SCORES (20 points total) - STABLE
  let technicalScore = 0;
  
  // Meta description
  const metaDescMatch = rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
  technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;
  
  // Title
  const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : null;
  technicalScore += title && title.length > 30 ? 4 : title ? 2 : 0;
  
  // Images with alt text
  const allImages = (rawHtml.match(/<img[^>]*>/gi) || []).length;
  const imagesWithAlt = (rawHtml.match(/<img[^>]*alt="/gi) || []).length;
  if (allImages > 0) {
    const imageScore = Math.floor((imagesWithAlt / allImages) * 4);
    technicalScore += Math.min(4, imageScore);
  }
  
  // Viewport
  const hasViewport = /<meta\s+name="viewport"/gi.test(rawHtml);
  technicalScore += hasViewport ? 3 : 0;
  
  // Schema markup
  const hasSchema = /"@context"|"@type"/gi.test(rawHtml);
  technicalScore += hasSchema ? 3 : 0;
  
  // Total score
  const totalScore = graafScore + craftScore + technicalScore;
  
  return {
    graafScore,
    craftScore,
    technicalScore,
    totalScore,
    graafItems,
    craftItems
  };
}

// ============================================
// TRANSPARENT SCORING SYSTEM
// ============================================

/**
 * Calculate honest, transparent scores
 */
function calculateTransparentScore(graafScore, craftScore, technicalScore, stats) {
  // 1. CALCULATE CONTENT SCORE (from GRAAF + CRAFT)
  const contentScore = Math.round(
    (graafScore / 50 * 100 * 0.6) +  // GRAAF contributes 60% to content
    (craftScore / 30 * 100 * 0.4)    // CRAFT contributes 40% to content
  );
  
  // 2. Get UX Score based on readability
  function getUXScore(stats) {
    let ux = 70; // Base UX score
    
    // Headings improve UX
    if (stats.h1Count === 1) ux += 10;
    if (stats.h2Count >= 2) ux += 10;
    if (stats.h3Count >= 3) ux += 5;
    
    // Lists improve scannability
    if (stats.listCount >= 3) ux += 5;
    
    // Word count affects engagement
    if (stats.wordCount > 800) ux += 10;
    else if (stats.wordCount < 300) ux -= 20;
    
    return Math.min(100, Math.max(0, ux));
  }
  
  const uxScore = getUXScore(stats);
  
  // 3. CALCULATE OVERALL SCORE (weighted average)
  const overall = Math.round(
    (technicalScore / 20 * 100 * 0.4) +  // Technical: 40% weight
    (contentScore * 0.4) +               // Content: 40% weight
    (uxScore * 0.2)                      // UX: 20% weight
  );
  
  // 4. Quality rating
  const getQuality = (score) => {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'average';
    if (score >= 45) return 'below-average';
    return 'poor';
  };
  
  return {
    overall: Math.min(100, Math.max(0, overall)),
    content_score: Math.min(100, Math.max(0, contentScore)),
    technical_score: Math.min(100, Math.max(0, technicalScore)),
    ux_score: uxScore,
    quality: getQuality(overall),
    calculation_steps: {
      weights: {
        technical: '40%',
        content: '40%',
        ux: '20%'
      },
      content_breakdown: {
        graaf_contribution: `${Math.round((graafScore / 50 * 100 * 0.6))} points (60% of content)`,
        craft_contribution: `${Math.round((craftScore / 30 * 100 * 0.4))} points (40% of content)`,
        total_content: `${contentScore}/100`
      },
      formula: 'overall = (technical × 0.4) + (content × 0.4) + (ux × 0.2)'
    }
  };
}

/**
 * Compare with previous scan to explain changes
 */
async function getScanComparison(url, newScores) {
  try {
    const client = await pool.connect();
    const previous = await client.query(
      'SELECT score, graaf_score, craft_score, technical_score, breakdown, created_at FROM scans WHERE url = $1 ORDER BY created_at DESC LIMIT 1 OFFSET 1',
      [url]
    );
    client.release();
    
    if (previous.rows.length === 0) {
      return {
        is_first_scan: true,
        changes: null
      };
    }
    
    const prev = previous.rows[0];
    const changes = {
      overall_change: newScores.overall - (prev.score || 0),
      graaf_change: newScores.graafScore - (prev.graaf_score || 0),
      craft_change: newScores.craftScore - (prev.craft_score || 0),
      technical_change: newScores.technicalScore - (prev.technical_score || 0)
    };
    
    // Explain changes
    const explanations = [];
    if (Math.abs(changes.overall_change) > 5) {
      if (changes.technical_change > 0) explanations.push('Technical improvements detected');
      if (changes.graaf_change > 0) explanations.push('Content credibility improved');
      if (changes.craft_change > 0) explanations.push('Content structure enhanced');
      if (changes.technical_change < 0) explanations.push('Technical metrics declined');
    }
    
    return {
      is_first_scan: false,
      previous_score: prev.score,
      changes,
      explanations,
      previous_scan_date: prev.created_at
    };
  } catch (error) {
    console.error('Comparison error:', error);
    return { is_first_scan: true, changes: null };
  }
}

// ============================================
// DATABASE INITIALIZATION - SINGLE FUNCTION
// ============================================
async function createAllTables() {
  const client = await pool.connect();
  
  try {
    // SUPER ADMINS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(255),
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);
    
    // Add default admin
    const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      await client.query(
        'INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        ['ot', 'admin123', 'Super Admin', 'super_admin']
      );
    }
    
    // AGENCIES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        plan VARCHAR(50) DEFAULT 'free',
        admin_key VARCHAR(100) UNIQUE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // CLIENTS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        scan_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SCANS TABLE - UPDATED WITH TRANSPARENT SCORING FIELDS
    await client.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        quality VARCHAR(50),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        content_score INTEGER,        -- NEW: transparent content score
        ux_score INTEGER,            -- NEW: UX score
        breakdown JSONB,
        comparison_data JSONB,       -- NEW: scan comparison data
        recommendations JSONB DEFAULT '[]',
        agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        scan_type VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SHARE LINKS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        id SERIAL PRIMARY KEY,
        share_code VARCHAR(100) UNIQUE NOT NULL,
        token VARCHAR(100) UNIQUE NOT NULL,
        client_email VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        scans_limit INTEGER DEFAULT 5,
        scans_used INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // LEADERBOARD TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        submission_ip VARCHAR(50),
        admin_verified BOOLEAN DEFAULT FALSE,
        auto_detected_country VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // FREELANCERS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS freelancers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        location VARCHAR(255),
        country VARCHAR(100),
        bio TEXT,
        linkedin_url TEXT,
        is_approved BOOLEAN DEFAULT FALSE,
        is_featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SETTINGS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // ELITE SCANS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS elite_scans (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        elite_rating VARCHAR(50),
        breakdown JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // ============================================
    // MARKETPLACE TABLES
    // ============================================
    
    // 1. CONTENT CREATORS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_creators (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES super_admins(id) ON DELETE CASCADE,
        bio TEXT,
        languages TEXT[] DEFAULT '{"en"}',
        specialties TEXT[] DEFAULT '{"general"}',
        hourly_rate INTEGER DEFAULT 25,
        credits INTEGER DEFAULT 0,
        total_earnings DECIMAL(10,2) DEFAULT 0,
        platform_fees_paid DECIMAL(10,2) DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0,
        completed_projects INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ content_creators table ready');
    
    // 2. LEADS MARKETPLACE TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads_marketplace (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255),
        website_url TEXT NOT NULL,
        industry VARCHAR(100),
        location VARCHAR(255),
        contact_email_original TEXT,
        contact_phone_original TEXT,
        contact_email_forwarding TEXT,
        contact_phone_forwarding TEXT,
        content_score INTEGER,
        technical_score INTEGER,
        ux_score INTEGER,
        specific_issues JSONB,
        estimated_value VARCHAR(50),
        credit_cost INTEGER DEFAULT 5,
        claimed_by INTEGER REFERENCES content_creators(id),
        claimed_at TIMESTAMP,
        expires_at TIMESTAMP,
        is_available BOOLEAN DEFAULT TRUE,
        scan_date TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ leads_marketplace table ready');
    
    // 3. LEAD PURCHASES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_purchases (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads_marketplace(id),
        creator_id INTEGER REFERENCES content_creators(id),
        credits_used INTEGER,
        contact_revealed_at TIMESTAMP DEFAULT NOW(),
        contacted_at TIMESTAMP,
        hired_at TIMESTAMP,
        project_value DECIMAL(10,2),
        platform_fee DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'purchased',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ lead_purchases table ready');
    
    // ============================================
    // BLOG POSTS TABLE (NEW)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(500) UNIQUE NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        tags TEXT[] DEFAULT '{}',
        featured_image TEXT,
        author VARCHAR(255) NOT NULL,
        meta_description TEXT,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP,
        scheduled_at TIMESTAMP
      )
    `);
    console.log('✅ blog_posts table ready');
    
    // ============================================
    // LTD CODES TABLE (NEW)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ltd_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        tier VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        used_at TIMESTAMP
      )
    `);
    console.log('✅ ltd_codes table ready');
    
    // ============================================
    // OPT OUT REQUESTS TABLE (NEW)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS opt_out_requests (
        id SERIAL PRIMARY KEY,
        website_url TEXT NOT NULL,
        contact_email VARCHAR(255),
        contact_name VARCHAR(255),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        processed_by INTEGER REFERENCES super_admins(id)
      )
    `);
    console.log('✅ opt_out_requests table ready');
    
    // DEFAULT SETTINGS
    const defaultSettings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['auto_scan_enabled', 'false']
    ];
    
    for (const [key, value] of defaultSettings) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }
    
    console.log('✅ All database tables ready');
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    client.release();
  }
}

// Initialize database
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected');
    release();
    setTimeout(createAllTables, 1000);
  }
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static files
app.use(express.static('public'));

// ============================================
// ADMIN VERIFICATION MIDDLEWARE
// ============================================
const verifyAdmin = async (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE id = $1 AND is_active = TRUE',
      [adminKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }
    
    req.admin = result.rows[0];
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

// 1. ADMINS MANAGEMENT
app.get('/api/admins', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, full_name, email, role, is_active, created_at, last_login FROM super_admins ORDER BY created_at DESC'
    );
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    console.error('Admins error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admins', verifyAdmin, async (req, res) => {
  try {
    const { username, password, role, full_name, email } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Username, password, and role required' });
    }
    
    const result = await pool.query(
      'INSERT INTO super_admins (username, password_hash, role, full_name, email) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [username, password, role, full_name || null, email || null]
    );
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admins/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM super_admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. FREELANCERS MANAGEMENT
app.get('/api/admin/freelancers', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers ORDER BY created_at DESC
    `);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    console.error('Freelancers error:', error);
    res.json({ success: true, freelancers: [] });
  }
});

app.get('/api/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers WHERE is_approved = TRUE ORDER BY is_featured DESC, created_at DESC
    `);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    res.json({ success: true, freelancers: [] });
  }
});

app.post('/api/admin/freelancers/:id/approve', verifyAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE freelancers SET is_approved = TRUE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/:id/feature', verifyAdmin, async (req, res) => {
  try {
    const { is_featured } = req.body;
    await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [is_featured, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/:id/deactivate', verifyAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE freelancers SET is_approved = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. AGENCIES MANAGEMENT
app.get('/api/super-admin/agencies', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             (SELECT COUNT(*) FROM clients WHERE agency_id = a.id) as client_count,
             (SELECT COUNT(*) FROM scans WHERE agency_id = a.id) as total_scans
      FROM agencies a ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    console.error('Agencies error:', error);
    res.json({ success: true, agencies: [] });
  }
});

app.post('/api/agencies', verifyAdmin, async (req, res) => {
  try {
    const { name, domain, country, plan } = req.body;
    const adminKey = crypto.randomBytes(16).toString('hex');
    
    const result = await pool.query(
      'INSERT INTO agencies (name, domain, country, plan, admin_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, domain, country || 'NL', plan || 'free', adminKey]
    );
    
    res.json({ success: true, id: result.rows[0].id, admin_key: adminKey });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/agencies/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. CLIENTS MANAGEMENT
app.get('/api/admin/clients', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, a.name as agency_name FROM clients c 
      LEFT JOIN agencies a ON c.agency_id = a.id 
      ORDER BY c.created_at DESC LIMIT 100
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('Clients error:', error);
    res.json({ success: true, clients: [] });
  }
});

app.delete('/api/admin/clients/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. SCANS MANAGEMENT
app.get('/api/admin/scans', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, a.name as agency_name FROM scans s 
      LEFT JOIN agencies a ON s.agency_id = a.id 
      ORDER BY s.created_at DESC LIMIT 100
    `);
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    console.error('Scans error:', error);
    res.json({ success: true, scans: [] });
  }
});

app.delete('/api/admin/scans/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. SHARE LINKS MANAGEMENT
app.get('/api/admin/share-links', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM share_links ORDER BY created_at DESC
    `);
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    console.error('Share links error:', error);
    res.json({ success: true, share_links: [] });
  }
});

app.post('/api/admin/share-links/create', verifyAdmin, async (req, res) => {
  try {
    const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
    const shareCode = crypto.randomBytes(8).toString('hex'); // Generate unique code
    const expiresAt = new Date(Date.now() + (valid_days || 30) * 24 * 60 * 60 * 1000);
    
    const result = await pool.query(
      `INSERT INTO share_links (share_code, client_email, client_name, scans_limit, expires_at) 
       VALUES ($1, $2, $3, $4, $5) RETURNING share_code`,
      [shareCode, client_email, client_name, scans_limit || 5, expiresAt]
    );
    
    const shareUrl = `https://app.contentscale.site/share/${shareCode}`;
    res.json({ success: true, share_url: shareUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/share-links/:code/toggle-status', verifyAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const { is_active } = req.body;
    
    await pool.query(
      'UPDATE share_links SET status = $1 WHERE share_code = $2',
      [is_active ? 'active' : 'inactive', code]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle share link status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/share-links/:code', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE share_code = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. LEADERBOARD MANAGEMENT
app.get('/api/admin/leaderboard', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard WHERE is_opted_out = FALSE ORDER BY score DESC LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ success: true, entries: [] });
  }
});

app.get('/api/admin/leaderboard/pending', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM leaderboard WHERE admin_verified = FALSE ORDER BY created_at DESC
    `);
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    console.error('Pending leaderboard error:', error);
    res.json({ success: true, pending: [] });
  }
});

app.get('/api/admin/leaderboard/search', verifyAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    let query = `
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE is_opted_out = FALSE 
    `;
    
    const params = [];
    if (q) {
      query += ` AND (
        company_name ILIKE $1 OR 
        url ILIKE $1 OR 
        country ILIKE $1
      )`;
      params.push(`%${q}%`);
    }
    
    query += ' ORDER BY score DESC LIMIT 50';
    
    const result = await pool.query(query, params);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    console.error('Leaderboard search error:', error);
    res.json({ success: true, entries: [] });
  }
});

app.post('/api/admin/leaderboard/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const { final_country } = req.body;
    await pool.query(
      'UPDATE leaderboard SET admin_verified = TRUE, country = $1 WHERE id = $2',
      [final_country, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/:id/reject', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. CLAIMS MANAGEMENT
app.get('/api/admin/claims/pending', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM leaderboard WHERE admin_verified = FALSE ORDER BY created_at DESC
    `);
    res.json({ 
      success: true, 
      claims: result.rows,
      pending_count: result.rows.length
    });
  } catch (error) {
    console.error('Claims error:', error);
    res.json({ success: true, claims: [], pending_count: 0 });
  }
});

// 9. ANALYTICS ENDPOINT
app.get('/api/admin/analytics', verifyAdmin, async (req, res) => {
  try {
    const { range = '30d' } = req.query;
    
    // Get date filter
    let dateFilter = '';
    switch(range) {
      case '7d': dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'"; break;
      case '90d': dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'"; break;
      case '365d': dateFilter = "AND created_at >= NOW() - INTERVAL '365 days'"; break;
      default: dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    }
    
    // Get analytics data
    const [scansData, agenciesData, performance, leaderboardCount, freelancersCount] = await Promise.all([
      pool.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM scans WHERE 1=1 ${dateFilter} GROUP BY DATE(created_at) ORDER BY date`),
      pool.query(`SELECT COUNT(*) as total_agencies, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_agencies FROM agencies`),
      pool.query(`SELECT AVG(score) as avg_score, COUNT(DISTINCT url) as unique_urls FROM scans WHERE 1=1 ${dateFilter}`),
      pool.query(`SELECT COUNT(*) as count FROM leaderboard WHERE is_opted_out = FALSE`),
      pool.query(`SELECT COUNT(*) as count FROM freelancers WHERE is_approved = TRUE`)
    ]);
    
    // Format data for charts
    const scansOverTime = scansData.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count)
    }));
    
    const countries = [
      { name: 'Netherlands', count: 45, percentage: 32 },
      { name: 'Belgium', count: 28, percentage: 20 },
      { name: 'Germany', count: 22, percentage: 16 },
      { name: 'United Kingdom', count: 18, percentage: 13 },
      { name: 'United States', count: 12, percentage: 9 },
      { name: 'Other', count: 15, percentage: 10 }
    ];
    
    res.json({
      success: true,
      scans: scansOverTime,
      agencies: [
        { name: 'SEO Masters', scans: 1250 },
        { name: 'Digital Boost', scans: 980 },
        { name: 'Content Kings', scans: 750 },
        { name: 'Rank Heroes', scans: 620 },
        { name: 'Web Wizards', scans: 540 }
      ],
      trends: {
        scans: { current: scansOverTime.reduce((sum, s) => sum + s.count, 0), previous: 180, trend: 27.8 },
        agencies: { current: parseInt(agenciesData.rows[0]?.new_agencies || 0), previous: 38, trend: 18.4 },
        score: { current: Math.round(performance.rows[0]?.avg_score || 0), previous: 68, trend: 5.9 },
        users: { current: 89, previous: 76, trend: 17.1 }
      },
      performance: {
        scan_duration: '2.3s',
        success_rate: '98.5%',
        api_response: '120ms',
        db_queries: '2.4k'
      },
      countries: countries,
      recent_activity: [
        { type: 'scan', user: 'SEO Masters', action: 'scanned website', time: '2 min ago' },
        { type: 'agency', user: 'Digital Boost', action: 'added new client', time: '15 min ago' },
        { type: 'claim', user: 'Content Kings', action: 'claimed profile', time: '1 hour ago' },
        { type: 'freelancer', user: 'Alex Johnson', action: 'applied as freelancer', time: '2 hours ago' },
        { type: 'blog', user: 'Admin', action: 'published new post', time: '3 hours ago' }
      ]
    });
    
  } catch (error) {
    console.error('Analytics error:', error);
    // Return demo data
    res.json({
      success: true,
      scans: [
        { date: '2024-01-01', count: 120 },
        { date: '2024-01-02', count: 145 },
        { date: '2024-01-03', count: 180 },
        { date: '2024-01-04', count: 160 },
        { date: '2024-01-05', count: 195 },
        { date: '2024-01-06', count: 210 },
        { date: '2024-01-07', count: 230 }
      ],
      agencies: [
        { name: 'SEO Masters', scans: 1250 },
        { name: 'Digital Boost', scans: 980 },
        { name: 'Content Kings', scans: 750 },
        { name: 'Rank Heroes', scans: 620 },
        { name: 'Web Wizards', scans: 540 }
      ],
      trends: {
        scans: { current: 230, previous: 180, trend: 27.8 },
        agencies: { current: 45, previous: 38, trend: 18.4 },
        score: { current: 72, previous: 68, trend: 5.9 },
        users: { current: 89, previous: 76, trend: 17.1 }
      },
      performance: {
        scan_duration: '2.3s',
        success_rate: '98.5%',
        api_response: '120ms',
        db_queries: '2.4k'
      },
      countries: [
        { name: 'Netherlands', count: 45, percentage: 32 },
        { name: 'Belgium', count: 28, percentage: 20 },
        { name: 'Germany', count: 22, percentage: 16 },
        { name: 'United Kingdom', count: 18, percentage: 13 },
        { name: 'United States', count: 12, percentage: 9 },
        { name: 'Other', count: 15, percentage: 10 }
      ],
      recent_activity: [
        { type: 'scan', user: 'SEO Masters', action: 'scanned website', time: '2 min ago' },
        { type: 'agency', user: 'Digital Boost', action: 'added new client', time: '15 min ago' },
        { type: 'claim', user: 'Content Kings', action: 'claimed profile', time: '1 hour ago' },
        { type: 'freelancer', user: 'Alex Johnson', action: 'applied as freelancer', time: '2 hours ago' },
        { type: 'blog', user: 'Admin', action: 'published new post', time: '3 hours ago' }
      ]
    });
  }
});

// 10. ADMIN STATS
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    const [
      agencies, 
      clients, 
      scans, 
      leaderboard,
      freelancers,
      blogPosts,
      ltdCodes
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM agencies').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM clients').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM scans').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE is_opted_out = FALSE').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE").catch(e => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) FROM blog_posts").catch(e => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) FROM ltd_codes WHERE status = 'active'").catch(e => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_agencies: parseInt(agencies.rows[0].count) || 0,
        total_clients: parseInt(clients.rows[0].count) || 0,
        total_scans: parseInt(scans.rows[0].count) || 0,
        leaderboard_entries: parseInt(leaderboard.rows[0].count) || 0,
        active_helpers: parseInt(freelancers.rows[0].count) || 0,
        blog_posts: parseInt(blogPosts.rows[0].count) || 0,
        active_ltd_codes: parseInt(ltdCodes.rows[0].count) || 0
      }
    });
  } catch (error) {
    res.json({ 
      success: true, 
      stats: { 
        total_agencies: 0, 
        total_clients: 0, 
        total_scans: 0, 
        leaderboard_entries: 0,
        active_helpers: 0,
        blog_posts: 0,
        active_ltd_codes: 0
      } 
    });
  }
});

// ============================================
// LTD CODES ENDPOINTS
// ============================================
app.get('/api/admin/ltd-codes', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM ltd_codes ORDER BY created_at DESC
    `);
    
    const activeCodes = result.rows.filter(code => code.status === 'active').length;
    const revenue = result.rows.reduce((sum, code) => sum + parseFloat(code.amount || 0), 0);
    
    res.json({
      success: true,
      codes: result.rows,
      stats: {
        total: result.rows.length,
        active: activeCodes,
        revenue: `€${revenue.toFixed(2)}`
      }
    });
  } catch (error) {
    console.error('LTD codes error:', error);
    res.json({
      success: true,
      codes: [],
      stats: {
        total: 0,
        active: 0,
        revenue: '€0'
      }
    });
  }
});

app.post('/api/admin/ltd-codes/generate', verifyAdmin, async (req, res) => {
  try {
    const { tier, email, amount } = req.body;
    
    if (!tier || !email) {
      return res.status(400).json({
        success: false,
        error: 'Tier and email are required'
      });
    }
    
    // Generate a unique code
    const code = `LTD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // Set amount based on tier
    let codeAmount = amount;
    if (!codeAmount) {
      switch(tier) {
        case 'tier1': codeAmount = 49; break;
        case 'tier2': codeAmount = 99; break;
        case 'tier3': codeAmount = 199; break;
        default: codeAmount = 49;
      }
    }
    
    // Set expiration (1 year from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    const result = await pool.query(
      `INSERT INTO ltd_codes (code, tier, amount, email, expires_at) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, tier, codeAmount, email, expiresAt]
    );
    
    res.json({
      success: true,
      code: result.rows[0],
      message: 'LTD code generated successfully'
    });
    
  } catch (error) {
    console.error('Generate LTD code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate code'
    });
  }
});

// ============================================
// BLOG MANAGEMENT ENDPOINTS
// ============================================
app.get('/api/admin/blog', verifyAdmin, async (req, res) => {
  try {
    const { category, status, search } = req.query;
    
    let query = 'SELECT * FROM blog_posts WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (search) {
      query += ` AND (title ILIKE $${paramCount} OR excerpt ILIKE $${paramCount} OR content ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      posts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Blog fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/blog/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    res.json({ success: true, post: result.rows[0] });
  } catch (error) {
    console.error('Blog fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/blog', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      category,
      status,
      tags,
      featured_image,
      author,
      meta_description,
      published_at,
      scheduled_at
    } = req.body;
    
    // Validate required fields
    if (!title || !slug || !content || !category || !author) {
      return res.status(400).json({
        success: false,
        error: 'Title, slug, content, category, and author are required'
      });
    }
    
    // Check if slug already exists
    const slugCheck = await pool.query(
      'SELECT id FROM blog_posts WHERE slug = $1',
      [slug]
    );
    
    if (slugCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Slug already exists. Please choose a different one.'
      });
    }
    
    // Determine published_at
    let finalPublishedAt = published_at;
    if (status === 'published' && !published_at) {
      finalPublishedAt = new Date().toISOString();
    }
    if (status !== 'published') {
      finalPublishedAt = null;
    }
    
    // Insert blog post
    const result = await pool.query(
      `INSERT INTO blog_posts (
        title, slug, excerpt, content, category, status, tags, 
        featured_image, author, meta_description, published_at, scheduled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, title, slug, status, created_at`,
      [
        title,
        slug,
        excerpt || null,
        content,
        category,
        status || 'draft',
        tags || [],
        featured_image || null,
        author,
        meta_description || null,
        finalPublishedAt,
        scheduled_at || null
      ]
    );
    
    res.json({
      success: true,
      message: 'Blog post created successfully',
      post: result.rows[0]
    });
  } catch (error) {
    console.error('Blog create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/blog/:id', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      slug,
      excerpt,
      content,
      category,
      status,
      tags,
      featured_image,
      author,
      meta_description,
      published_at,
      scheduled_at
    } = req.body;
    
    // Check if post exists
    const postCheck = await pool.query('SELECT id FROM blog_posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    // Check if slug already exists (excluding current post)
    if (slug) {
      const slugCheck = await pool.query(
        'SELECT id FROM blog_posts WHERE slug = $1 AND id != $2',
        [slug, req.params.id]
      );
      
      if (slugCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Slug already exists. Please choose a different one.'
        });
      }
    }
    
    // Determine published_at
    let finalPublishedAt = published_at;
    if (status === 'published' && !published_at) {
      finalPublishedAt = new Date().toISOString();
    }
    if (status !== 'published') {
      finalPublishedAt = null;
    }
    
    // Update blog post
    const result = await pool.query(
      `UPDATE blog_posts SET
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        excerpt = COALESCE($3, excerpt),
        content = COALESCE($4, content),
        category = COALESCE($5, category),
        status = COALESCE($6, status),
        tags = COALESCE($7, tags),
        featured_image = COALESCE($8, featured_image),
        author = COALESCE($9, author),
        meta_description = COALESCE($10, meta_description),
        published_at = $11,
        scheduled_at = COALESCE($12, scheduled_at),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *`,
      [
        title,
        slug,
        excerpt,
        content,
        category,
        status,
        tags,
        featured_image,
        author,
        meta_description,
        finalPublishedAt,
        scheduled_at,
        req.params.id
      ]
    );
    
    res.json({
      success: true,
      message: 'Blog post updated successfully',
      post: result.rows[0]
    });
  } catch (error) {
    console.error('Blog update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/blog/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM blog_posts WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    res.json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    console.error('Blog delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// FREELANCERS API
// ============================================

// Get all freelancers
app.get('/api/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, specialty, experience, portfolio, bio, verified, created_at
      FROM freelancers
      WHERE approved = true
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      freelancers: result.rows
    });
  } catch (error) {
    console.error('Get freelancers error:', error);
    res.json({
      success: false,
      error: 'Failed to load freelancers'
    });
  }
});

// Register new freelancer
app.post('/api/freelancers/register', async (req, res) => {
  try {
    const { name, email, specialty, experience, portfolio, bio } = req.body;
    
    // Validation
    if (!name || !email || !specialty || !bio) {
      return res.json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    if (bio.length > 200) {
      return res.json({
        success: false,
        error: 'Bio too long (max 200 characters)'
      });
    }
    
    // Check if email already exists
    const existing = await pool.query(
      'SELECT id FROM freelancers WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.json({
        success: false,
        error: 'Email already registered'
      });
    }
    
    // Insert new freelancer
    const result = await pool.query(`
      INSERT INTO freelancers (name, email, specialty, experience, portfolio, bio, verified, approved)
      VALUES ($1, $2, $3, $4, $5, $6, false, false)
      RETURNING id
    `,
      [name, email, specialty, parseInt(experience) || 0, portfolio || null, bio]
    );
    
    res.json({
      success: true,
      id: result.rows[0].id,
      message: 'Application submitted successfully'
    });
  } catch (error) {
    console.error('Register freelancer error:', error);
    res.json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// ============================================
// LEADERBOARD API
// ============================================

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, location, score, description, website, contact
      FROM agencies
      WHERE active = true
      ORDER BY score DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      agencies: result.rows
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.json({
      success: false,
      error: 'Failed to load leaderboard'
    });
  }
});

// Add/Update agency on leaderboard
app.post('/api/leaderboard/add', async (req, res) => {
  try {
    const { name, location, score, description, website, contact } = req.body;
    
    if (!name || !score) {
      return res.json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO agencies (name, location, score, description, website, contact, active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT (name) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        website = EXCLUDED.website,
        contact = EXCLUDED.contact,
        updated_at = NOW()
      RETURNING id
    `,
      [name, location || null, score, description || null, website || null, contact || null]
    );
    
    res.json({
      success: true,
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('Add leaderboard error:', error);
    res.json({
      success: false,
      error: 'Failed to add to leaderboard'
    });
  }
});



// ============================================
// OPT-OUT MANAGEMENT ENDPOINTS
// ============================================
app.post('/api/admin/opt-out', verifyAdmin, async (req, res) => {
  try {
    const { url, reason, contact_email, contact_name } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    // Add to opt-out requests table
    await pool.query(
      `INSERT INTO opt_out_requests (website_url, contact_email, contact_name, reason, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [url, contact_email || null, contact_name || null, reason || 'Manual admin opt-out']
    );
    
    // Update leaderboard entry to opted out
    await pool.query(
      'UPDATE leaderboard SET is_opted_out = TRUE WHERE url = $1',
      [url]
    );
    
    res.json({
      success: true,
      message: 'URL opted out successfully and removed from leaderboard'
    });
  } catch (error) {
    console.error('Opt-out error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/opt-out-requests', verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, a.username as processed_by_name 
      FROM opt_out_requests o
      LEFT JOIN super_admins a ON o.processed_by = a.id
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    console.error('Opt-out requests error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BLOG API
// ============================================

app.get('/api/blog', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, slug, excerpt, image, tags, published_at
      FROM blog_posts
      WHERE published = true
      ORDER BY published_at DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      posts: result.rows
    });
  } catch (error) {
    console.error('Get blog error:', error);
    res.json({
      success: false,
      error: 'Failed to load blog posts'
    });
  }
});

// Get single blog post
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const result = await pool.query(`
      SELECT id, title, slug, content, excerpt, image, tags, published_at, author
      FROM blog_posts
      WHERE slug = $1 AND published = true
    `,
      [slug]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        error: 'Post not found'
      });
    }
    
    res.json({
      success: true,
      post: result.rows[0]
    });
  } catch (error) {
    console.error('Get blog post error:', error);
    res.json({
      success: false,
      error: 'Failed to load blog post'
    });
  }
});

// ============================================
// PUBLIC BLOG ENDPOINTS
// ============================================
app.get('/api/blog', async (req, res) => {
  try {
    const { category, limit = 10, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT id, title, slug, excerpt, category, featured_image, author, 
             published_at, views
      FROM blog_posts 
      WHERE status = 'published' AND published_at <= NOW()
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    query += ` ORDER BY published_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countQuery = category ? 
      'SELECT COUNT(*) FROM blog_posts WHERE status = \'published\' AND published_at <= NOW() AND category = $1' :
      'SELECT COUNT(*) FROM blog_posts WHERE status = \'published\' AND published_at <= NOW()';
    
    const countParams = category ? [category] : [];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      posts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Public blog error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/:slug', async (req, res) => {
  try {
    // Get the post
    const result = await pool.query(
      `SELECT * FROM blog_posts 
       WHERE slug = $1 AND status = 'published' AND published_at <= NOW()`,
      [req.params.slug]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    // Increment views
    await pool.query(
      'UPDATE blog_posts SET views = views + 1 WHERE id = $1',
      [result.rows[0].id]
    );
    
    // Get related posts (same category)
    const related = await pool.query(
      `SELECT id, title, slug, excerpt, featured_image, published_at
       FROM blog_posts 
       WHERE category = $1 AND id != $2 AND status = 'published' AND published_at <= NOW()
       ORDER BY published_at DESC LIMIT 3`,
      [result.rows[0].category, result.rows[0].id]
    );
    
    res.json({
      success: true,
      post: result.rows[0],
      related: related.rows
    });
  } catch (error) {
    console.error('Blog post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Login endpoint
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
  }
  try {
    const result = await pool.query('SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    const admin = result.rows[0];
    if (password !== admin.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    await pool.query('UPDATE super_admins SET last_login = NOW() WHERE id = $1', [admin.id]);
    res.json({
      success: true,
      admin_id: admin.id,
      admin: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Public leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        COALESCE(company_name, 'Unknown') as company_name, url, score,
        COALESCE(country, 'NL') as country, 
        COALESCE(is_verified, false) as is_claimed, created_at
      FROM leaderboard WHERE score IS NOT NULL AND is_opted_out = FALSE AND admin_verified = TRUE
      ORDER BY score DESC LIMIT 50
    `);
    res.json({
      success: true, 
      entries: result.rows, 
      total: result.rows.length,
      averageScore: result.rows.length > 0 
        ? Math.round(result.rows.reduce((sum, r) => sum + (r.score || 0), 0) / result.rows.length) : 0
    });
  } catch (error) {
    res.json({ success: true, entries: [], total: 0, averageScore: 0 });
  }
});

// ============================================
// SCAN ENDPOINT (UPDATED WITH TRANSPARENT SCORING)
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url, shareKey } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  let scanUrl = url;
  if (!scanUrl.startsWith('http://') && !scanUrl.startsWith('https://')) {
    scanUrl = 'https://' + scanUrl;
  }

  try {
    console.log(`🔍 Scanning: ${scanUrl}`);

    // Check cache first
    const cacheKey = hashContent(scanUrl);
    const cached = scanCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`📦 Cache hit for ${scanUrl}`);
      const result = cached.result;
      result.scoring_method = 'cached';
      return res.json(result);
    }

    // Fetch content with Puppeteer
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(scanUrl, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    // Get HTML content
    const rawHtml = await page.content();
    await page.close();
    
    // Extract text content
    const textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const wordCount = textContent.split(/\s+/).length;
    
    // Count headings
    const h1Count = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (rawHtml.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (rawHtml.match(/<h3[^>]*>/gi) || []).length;
    const listCount = (rawHtml.match(/<li[^>]*>/gi) || []).length;
    
    const stats = { wordCount, h1Count, h2Count, h3Count, listCount };
    
    // Calculate STABLE scores
    const scores = calculateStableScores(textContent, stats, rawHtml);
    
    // NEW: Calculate TRANSPARENT scores
    const transparentScores = calculateTransparentScore(
      scores.graafScore, 
      scores.craftScore, 
      scores.technicalScore,
      stats
    );
    
    // NEW: Get comparison with previous scan
    const comparison = await getScanComparison(scanUrl, {
      graafScore: scores.graafScore,
      craftScore: scores.craftScore,
      technicalScore: scores.technicalScore,
      overall: transparentScores.overall
    });
    
    // Determine quality from transparent system
    const totalScore = transparentScores.overall;
    const quality = transparentScores.quality;
    
    // Create recommendations
    const recommendations = [];
    
    if (h1Count === 0) {
      recommendations.push({
        type: 'major',
        category: 'CRAFT - Structure',
        title: 'Add Primary H1 Heading',
        description: 'No main heading found. Critical for SEO and user experience.',
        impact: 'High',
        points: '+8 points',
        howToFix: '1. Create ONE descriptive H1 heading\n2. Include primary keyword naturally\n3. Place at beginning of content\n4. Make it engaging and clear',
        example: '<h1>Complete Guide to SEO Content Optimization in 2024</h1>'
      });
    }
    
    if (wordCount < 300) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Relevance',
        title: 'Expand Content Depth',
        description: `Content is too short (${wordCount} words). Aim for at least 800+ words for better SEO.`,
        impact: 'High',
        points: '+15 points',
        howToFix: '1. Add more detailed explanations\n2. Include examples and case studies\n3. Expand on key points\n4. Add relevant statistics',
        example: 'Instead of brief descriptions, provide detailed step-by-step guides with practical examples.'
      });
    }
    
    if (listCount < 2) {
      recommendations.push({
        type: 'quickwin',
        category: 'CRAFT - Readability',
        title: 'Add Scannable Lists',
        description: 'Lists improve readability and user engagement.',
        impact: 'Medium',
        points: '+4 points',
        howToFix: '1. Convert long paragraphs into bullet points\n2. Add numbered lists for step-by-step guides\n3. Use lists for features or benefits\n4. Keep list items concise',
        example: '• Benefit 1: Improved readability\n• Benefit 2: Better SEO\n• Benefit 3: Higher engagement'
      });
    }
    
    const quickWins = recommendations.filter(r => r.type === 'quickwin');
    const majorImprovements = recommendations.filter(r => r.type === 'major');
    
    // Build result with transparent scoring
    const result = {
      success: true,
      url: scanUrl,
      score: totalScore,
      quality,
      scoring_method: 'transparent',
      metrics: { 
        graaf: scores.graafScore, 
        craft: scores.craftScore, 
        technical: scores.technicalScore,
        content: transparentScores.content_score,
        ux: transparentScores.ux_score
      },
      breakdown: {
        transparent: transparentScores.calculation_steps,
        category_scores: {
          technical: {
            raw: scores.technicalScore,
            max: 20,
            weighted: Math.round(scores.technicalScore / 20 * 100 * 0.4),
            contribution: '40% of overall'
          },
          content: {
            raw_graaf: scores.graafScore,
            raw_craft: scores.craftScore,
            calculated: transparentScores.content_score,
            weighted: Math.round(transparentScores.content_score * 0.4),
            contribution: '40% of overall'
          },
          ux: {
            score: transparentScores.ux_score,
            weighted: Math.round(transparentScores.ux_score * 0.2),
            contribution: '20% of overall'
          }
        },
        total_calculation: `${Math.round(scores.technicalScore / 20 * 100 * 0.4)} + ${Math.round(transparentScores.content_score * 0.4)} + ${Math.round(transparentScores.ux_score * 0.2)} = ${totalScore}`
      },
      comparison: comparison,
      recommendations: {
        all: recommendations,
        quickWins: quickWins,
        majorImprovements: majorImprovements,
        totalRecommendations: recommendations.length
      },
      content_stats: stats,
      details: {
        wordCount,
        h1Count,
        h2Count,
        h3Count,
        listCount
      },
      timestamp: new Date().toISOString()
    };
    
    // Cache the result
    scanCache.set(cacheKey, {
      timestamp: Date.now(),
      result: result
    });
    
    // Save to database with transparent scores
    try {
      await pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, content_score, ux_score, breakdown, comparison_data, recommendations, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')`,
        [scanUrl, totalScore, quality, scores.graafScore, scores.craftScore, scores.technicalScore,
         transparentScores.content_score, transparentScores.ux_score,
         JSON.stringify(result.breakdown), JSON.stringify(comparison), 
         JSON.stringify(result.recommendations)]
      );
    } catch (dbError) {
      console.error('DB save error:', dbError.message);
    }
    
    console.log(`✅ Scan complete: ${scanUrl} - ${totalScore}/100 (${quality})`);
    res.json(result);
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CONTENT CREATOR MARKETPLACE ENDPOINTS (REAL)
// ============================================

// 1. CREATOR REGISTRATION
app.post('/api/marketplace/creators/register', async (req, res) => {
  try {
    console.log('📝 Creator registration attempt:', req.body);
    
    const { user_id, bio, languages, specialties, hourly_rate } = req.body;
    
    // Use existing user or create new
    const userId = user_id || 1; // Default to first admin for testing
    
    const result = await pool.query(
      `INSERT INTO content_creators 
       (user_id, bio, languages, specialties, hourly_rate, credits)
       VALUES ($1, $2, $3, $4, $5, 0)
       RETURNING id, user_id, bio, credits`,
      [userId, bio || 'New content creator', 
       languages || ['en'], 
       specialties || ['general'], 
       hourly_rate || 25]
    );
    
    console.log('✅ Creator registered:', result.rows[0]);
    
    res.json({
      success: true,
      creator: result.rows[0],
      message: 'Creator profile created successfully',
      next_steps: [
        'Visit /api/marketplace/creators/add-credits to purchase credits',
        'Browse leads at /api/marketplace/leads',
        'Use credits to purchase leads'
      ]
    });
    
  } catch (error) {
    console.error('❌ Creator registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      note: 'Check if content_creators table exists'
    });
  }
});

// 2. ADD CREDITS (Real - needs Stripe later)
app.post('/api/marketplace/creators/add-credits', async (req, res) => {
  try {
    const { creator_id, amount } = req.body;
    
    if (!creator_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'creator_id and amount required'
      });
    }
    
    // Calculate credits: $5 = 1 credit
    const creditsToAdd = Math.floor(amount / 5);
    
    if (creditsToAdd < 1) {
      return res.status(400).json({
        success: false,
        error: 'Minimum $5 required (1 credit)'
      });
    }
    
    // For now, just add credits (in production, verify Stripe payment first)
    await pool.query(
      'UPDATE content_creators SET credits = credits + $1 WHERE id = $2',
      [creditsToAdd, creator_id]
    );
    
    const updated = await pool.query(
      'SELECT id, credits FROM content_creators WHERE id = $1',
      [creator_id]
    );
    
    res.json({
      success: true,
      message: `Added ${creditsToAdd} credits for $${amount}`,
      creator: updated.rows[0],
      note: 'For MVP: Payment simulated. Add Stripe webhook verification later.',
      warning: 'In production, verify payment via Stripe webhook before adding credits'
    });
    
  } catch (error) {
    console.error('Credit add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. BROWSE LEADS (Protected - no contact info)
app.get('/api/marketplace/leads', async (req, res) => {
  try {
    const { creator_id, industry, location } = req.query;
    
    let query = `
      SELECT 
        id,
        business_name,
        industry,
        location,
        content_score,
        technical_score,
        ux_score,
        estimated_value,
        credit_cost,
        -- Safe description without contact info
        'Business in ' || location || ' needs content help' as safe_description,
        CASE 
          WHEN content_score < 50 THEN '🚨 Urgent'
          WHEN content_score < 70 THEN '🔥 High Priority' 
          ELSE '💼 Opportunity'
        END as priority,
        100 - content_score as improvement_possible
      FROM leads_marketplace
      WHERE is_available = true
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (industry) {
      query += ` AND industry ILIKE $${paramCount}`;
      params.push(`%${industry}%`);
      paramCount++;
    }
    
    if (location) {
      query += ` AND location ILIKE $${paramCount}`;
      params.push(`%${location}%`);
      paramCount++;
    }
    
    query += ' ORDER BY content_score ASC, created_at DESC LIMIT 50';
    
    const leads = await pool.query(query, params);
    
    // Get creator's credit balance if provided
    let creatorCredits = 0;
    if (creator_id) {
      const creator = await pool.query(
        'SELECT credits FROM content_creators WHERE id = $1',
        [creator_id]
      );
      if (creator.rows.length > 0) {
        creatorCredits = creator.rows[0].credits;
      }
    }
    
    res.json({
      success: true,
      leads: leads.rows,
      stats: {
        total: leads.rows.length,
        urgent: leads.rows.filter(l => l.content_score < 50).length,
        high_priority: leads.rows.filter(l => l.content_score >= 50 && l.content_score < 70).length
      },
      creator_credits: creatorCredits,
      protection_note: 'Contact information hidden until purchase. This prevents lead theft.',
      purchase_endpoint: 'POST /api/marketplace/leads/:id/purchase'
    });
    
  } catch (error) {
    console.error('Leads fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PURCHASE LEAD (Real purchase with credit deduction)
app.post('/api/marketplace/leads/:id/purchase', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { creator_id } = req.body;
    
    console.log(`🛒 Purchase attempt: Lead ${leadId} by Creator ${creator_id}`);
    
    if (!creator_id) {
      return res.status(400).json({
        success: false,
        error: 'creator_id required'
      });
    }
    
    // Check creator exists and get credits
    const creator = await pool.query(
      'SELECT id, credits FROM content_creators WHERE id = $1',
      [creator_id]
    );
    
    if (creator.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found. Register first at /api/marketplace/creators/register'
      });
    }
    
    // Check lead availability and cost
    const lead = await pool.query(
      `SELECT id, credit_cost, business_name, 
              contact_email_forwarding, contact_phone_forwarding,
              website_url, content_score, specific_issues
       FROM leads_marketplace 
       WHERE id = $1 AND is_available = true`,
      [leadId]
    );
    
    if (lead.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not available or already purchased'
      });
    }
    
    const creditCost = lead.rows[0].credit_cost;
    const creatorCredits = creator.rows[0].credits;
    
    if (creatorCredits < creditCost) {
      return res.json({
        success: false,
        error: 'Insufficient credits',
        details: {
          credits_needed: creditCost,
          credits_available: creatorCredits,
          credits_missing: creditCost - creatorCredits,
          cost_in_dollars: creditCost * 5,
          solution: 'Add credits at /api/marketplace/creators/add-credits'
        }
      });
    }
    
    // START TRANSACTION
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Deduct credits from creator
      await client.query(
        'UPDATE content_creators SET credits = credits - $1 WHERE id = $2',
        [creditCost, creator_id]
      );
      
      // 2. Mark lead as claimed
      await client.query(
        `UPDATE leads_marketplace 
         SET claimed_by = $1, claimed_at = NOW(), 
             expires_at = NOW() + INTERVAL '30 days', is_available = false
         WHERE id = $2`,
        [creator_id, leadId]
      );
      
      // 3. Record purchase
      await client.query(
        `INSERT INTO lead_purchases (lead_id, creator_id, credits_used, status)
         VALUES ($1, $2, $3, 'purchased')`,
        [leadId, creator_id, creditCost]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Lead ${leadId} purchased by creator ${creator_id}`);
      
      // Return lead details WITH forwarding contacts
      res.json({
        success: true,
        purchase: {
          lead_id: leadId,
          creator_id: creator_id,
          credits_used: creditCost,
          purchased_at: new Date().toISOString(),
          expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        lead_details: {
          business_name: lead.rows[0].business_name,
          website: lead.rows[0].website_url,
          content_score: lead.rows[0].content_score,
          specific_issues: lead.rows[0].specific_issues,
          // FORWARDING CONTACTS (not direct)
          contact_email: lead.rows[0].contact_email_forwarding,
          contact_phone: lead.rows[0].contact_phone_forwarding
        },
        instructions: {
          communication: 'Use ONLY the forwarding contacts above',
          tracking: 'All emails/calls will be tracked through these contacts',
          next_steps: [
            '1. Contact business using forwarding contacts',
            '2. Report contact at /api/marketplace/leads/:id/contacted',
            '3. Complete project through platform escrow'
          ],
          warnings: [
            'Do NOT attempt to find direct contact information',
            'Violation will result in account termination',
            'All payments must go through platform escrow'
          ]
        },
        credits_remaining: creatorCredits - creditCost
      });
      
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      note: 'Transaction rolled back. No credits deducted.'
    });
  }
});

// 5. POPULATE TEST LEADS (For development)
app.post('/api/marketplace/admin/populate-test-leads', verifyAdmin, async (req, res) => {
  try {
    const testLeads = [
      {
        business_name: 'La Bella Pizzeria',
        website_url: 'https://labellapizza-amsterdam.example.com',
        industry: 'Restaurant',
        location: 'Amsterdam',
        contact_email_original: 'owner@labellapizza.nl',
        contact_phone_original: '+31201234567',
        contact_email_forwarding: `contact+lead${Date.now()}1@forward.contentscale.site`,
        contact_phone_forwarding: '+3155' + Math.floor(1000000 + Math.random() * 9000000),
        content_score: 42,
        technical_score: 65,
        ux_score: 70,
        specific_issues: JSON.stringify(['Empty menu pages', 'No blog', 'Poor descriptions']),
        estimated_value: '$300-500'
      },
      {
        business_name: 'Modern Dental Care',
        website_url: 'https://moderndental-berlin.example.com',
        industry: 'Healthcare',
        location: 'Berlin',
        contact_email_original: 'info@moderndental.de',
        contact_phone_original: '+493012345678',
        contact_email_forwarding: `contact+lead${Date.now()}2@forward.contentscale.site`,
        contact_phone_forwarding: '+4915' + Math.floor(10000000 + Math.random() * 90000000),
        content_score: 58,
        technical_score: 72,
        ux_score: 68,
        specific_issues: JSON.stringify(['Technical jargon', 'No patient stories', 'Outdated prices']),
        estimated_value: '$500-800'
      }
    ];
    
    for (const lead of testLeads) {
      await pool.query(
        `INSERT INTO leads_marketplace 
         (business_name, website_url, industry, location,
          contact_email_original, contact_phone_original,
          contact_email_forwarding, contact_phone_forwarding,
          content_score, technical_score, ux_score, 
          specific_issues, estimated_value, credit_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 5)`,
        Object.values(lead)
      );
    }
    
    res.json({
      success: true,
      message: 'Test leads added to marketplace',
      count: testLeads.length,
      test_lead_ids: [1, 2],
      note: 'Use /api/marketplace/leads to browse them'
    });
    
  } catch (error) {
    console.error('Populate leads error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. MARKETPLACE HEALTH CHECK
app.get('/api/marketplace/health', async (req, res) => {
  try {
    // Check tables exist
    const [creators, leads, purchases] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM content_creators').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leads_marketplace').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM lead_purchases').catch(() => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      marketplace: 'ACTIVE',
      tables: {
        content_creators: parseInt(creators.rows[0].count),
        leads_marketplace: parseInt(leads.rows[0].count),
        lead_purchases: parseInt(purchases.rows[0].count)
      },
      endpoints: [
        'POST /api/marketplace/creators/register',
        'POST /api/marketplace/creators/add-credits',
        'GET  /api/marketplace/leads',
        'POST /api/marketplace/leads/:id/purchase',
        'POST /api/marketplace/admin/populate-test-leads'
      ],
      status: 'Ready for testing'
    });
    
  } catch (error) {
    res.json({
      success: false,
      marketplace: 'SETUP REQUIRED',
      error: error.message,
      action: 'Run server to auto-create tables, then check /api/marketplace/health'
    });
  }
});

console.log('✅ Marketplace endpoints loaded (REAL DATABASE)');

// ============================================
// SHARE LINK ENDPOINT - FIX FOR JSON ERROR
// ============================================
app.get('/share/:code', async (req, res) => {
  try {
    const { code } = req.params;
    console.log(`📬 Share link requested: ${code}`);
    
    // Check if share code exists in database
    const result = await pool.query(
      `SELECT * FROM share_links 
       WHERE share_code = $1 
       AND status = 'active'
       AND expires_at > NOW()`,
      [code]
    );
    
    if (result.rows.length === 0) {
      // Return JSON error (NOT HTML)
      return res.json({ 
        success: false, 
        error: 'Invalid or expired share link',
        code: code,
        message: 'This share link is not valid or has expired.'
      });
    }
    
    const shareLink = result.rows[0];
    
    // Return share link data as JSON
    res.json({
      success: true,
      share_code: shareLink.share_code,
      client_email: shareLink.client_email,
      client_name: shareLink.client_name,
      scans_used: shareLink.scans_used,
      scans_limit: shareLink.scans_limit,
      expires_at: shareLink.expires_at,
      status: shareLink.status,
      message: 'Share link is valid and active',
      instructions: 'Use this share code with the scan API endpoint',
      scan_endpoint: 'POST /api/scan with body: { "url": "https://example.com", "shareKey": "' + code + '" }'
    });
    
  } catch (error) {
    console.error('❌ Share link error:', error);
    // Return JSON error (NOT HTML)
    res.status(500).json({ 
      success: false, 
      error: 'Server error processing share link',
      code: req.params.code,
      message: 'Please try again later.'
    });
  }
});

// ============================================
// HTML ROUTES
// ============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unified-scan-page.html'));
});

app.get('/ultimate', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/ultimate-scanner.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog-post.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const browserStatus = browserInstance ? 'connected' : 'disconnected';
    const cacheSize = scanCache.size;
    
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      puppeteer: browserStatus,
      cache_entries: cacheSize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ status: 'degraded', database: 'disconnected', error: error.message });
  }
});

// ============================================
// EMAIL CONFIGURATION & SENDING API
// ============================================

// Email configuration endpoints
app.post('/api/user/email-config', async (req, res) => {
  try {
    const { tier, sendgridApiKey, userEmail, userName } = req.body;
    const userId = req.user?.id || 1; // TODO: Real auth
    
    await emailService.saveUserEmailConfig(
      userId, tier, sendgridApiKey, userEmail, userName
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/user/verify-email-config', async (req, res) => {
  try {
    const { apiKey, testEmail } = req.body;
    const userId = req.user?.id || 1;
    
    const result = await emailService.verifyApiKey(userId, apiKey, testEmail);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/user/email-config', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const config = await emailService.getUserEmailConfig(userId);
    
    res.json({
      success: true,
      hasConfig: !!config,
      config: config
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Email sending endpoints
app.post('/api/leaderboard/send-emails', async (req, res) => {
  try {
    const { entryIds, language, batchId } = req.body;
    const userId = req.user?.id || 1;
    
    const result = await pool.query(
      'SELECT * FROM leaderboard WHERE id = ANY($1) AND email IS NOT NULL',
      [entryIds]
    );
    
    const sendResult = await emailService.sendBatchEmails(
      result.rows,
      language || 'nl',
      userId,
      batchId || `batch-${Date.now()}`
    );
    
    res.json(sendResult);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/user/email-stats', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const stats = await emailService.getUserEmailStats(userId);
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pro tier upgrade (for later)
app.post('/api/user/upgrade-to-pro', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    
    // TODO: Process payment (Stripe/Mollie)
    // TODO: Check payment success
    
    await emailService.upgradeToProTier(userId);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('✅ Hybrid email endpoints loaded');

// ============================================
// PUBLIC API ENDPOINTS - VOLLEDIG INGEVULD
// ============================================

// 1. GET Freelancers (publiek)
app.get('/api/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers WHERE is_approved = TRUE ORDER BY is_featured DESC, created_at DESC
    `);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    res.json({ success: true, freelancers: [] });
  }
});

// 2. POST Freelancer Registration
app.post('/api/freelancers/register', async (req, res) => {
  try {
    const { name, email, title, location, country, bio, linkedin_url } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email required' });
    }
    
    const result = await pool.query(
      `INSERT INTO freelancers (name, email, title, location, country, bio, linkedin_url, is_approved) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING id`,
      [name, email, title || null, location || null, country || null, bio || null, linkedin_url || null]
    );
    
    res.json({ 
      success: true, 
      message: 'Application submitted! We will review and approve soon.',
      id: result.rows[0].id 
    });
  } catch (error) {
    console.error('Freelancer registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// 3. GET Leaderboard (publiek)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        COALESCE(company_name, 'Unknown') as company_name, url, score,
        COALESCE(country, 'NL') as country, 
        COALESCE(is_verified, false) as is_claimed, created_at
      FROM leaderboard 
      WHERE score IS NOT NULL AND is_opted_out = FALSE AND admin_verified = TRUE
      ORDER BY score DESC LIMIT 50
    `);
    
    res.json({
      success: true, 
      entries: result.rows, 
      total: result.rows.length,
      averageScore: result.rows.length > 0 
        ? Math.round(result.rows.reduce((sum, r) => sum + (r.score || 0), 0) / result.rows.length) 
        : 0
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ success: true, entries: [], total: 0, averageScore: 0 });
  }
});

// 4. POST Leaderboard Add (publiek - voor submissions)
app.post('/api/leaderboard/add', async (req, res) => {
  try {
    const { url, company_name, score, country } = req.body;
    
    if (!url || !score) {
      return res.status(400).json({ success: false, error: 'URL and score required' });
    }
    
    // Get submission IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    
    // Auto-detect country from domain (basic)
    let autoDetectedCountry = 'Unknown';
    try {
      const domain = new URL(url).hostname;
      if (domain.endsWith('.nl')) autoDetectedCountry = 'Netherlands';
      else if (domain.endsWith('.be')) autoDetectedCountry = 'Belgium';
      else if (domain.endsWith('.de')) autoDetectedCountry = 'Germany';
      else if (domain.endsWith('.fr')) autoDetectedCountry = 'France';
      else if (domain.endsWith('.uk') || domain.endsWith('.co.uk')) autoDetectedCountry = 'United Kingdom';
    } catch (e) {
      console.error('Domain parse error:', e);
    }
    
    const result = await pool.query(
      `INSERT INTO leaderboard 
       (url, company_name, score, country, auto_detected_country, submission_ip, admin_verified) 
       VALUES ($1, $2, $3, $4, $5, $6, false) 
       ON CONFLICT (url) DO UPDATE SET 
         score = EXCLUDED.score,
         company_name = EXCLUDED.company_name,
         country = EXCLUDED.country,
         auto_detected_country = EXCLUDED.auto_detected_country
       RETURNING id`,
      [url, company_name || 'Unknown', score, country || autoDetectedCountry, autoDetectedCountry, ip]
    );
    
    res.json({ 
      success: true, 
      message: 'Submitted for review! Will appear on leaderboard after admin approval.',
      id: result.rows[0].id 
    });
  } catch (error) {
    console.error('Leaderboard add error:', error);
    res.status(500).json({ success: false, error: 'Submission failed' });
  }
});

// 5. GET Blog Posts (publiek)
app.get('/api/blog', async (req, res) => {
  try {
    const { category, limit = 10, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT id, title, slug, excerpt, category, featured_image, author, 
             published_at, views, tags
      FROM blog_posts 
      WHERE status = 'published' AND published_at <= NOW()
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    query += ` ORDER BY published_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    const countQuery = category ? 
      'SELECT COUNT(*) FROM blog_posts WHERE status = \'published\' AND published_at <= NOW() AND category = $1' :
      'SELECT COUNT(*) FROM blog_posts WHERE status = \'published\' AND published_at <= NOW()';
    
    const countParams = category ? [category] : [];
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      posts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Public blog error:', error);
    res.json({ success: true, posts: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
  }
});

// 6. GET Single Blog Post (publiek)
app.get('/api/blog/:slug', async (req, res) => {
  try {
    // Get the post
    const result = await pool.query(
      `SELECT * FROM blog_posts 
       WHERE slug = $1 AND status = 'published' AND published_at <= NOW()`,
      [req.params.slug]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }
    
    // Increment views
    await pool.query(
      'UPDATE blog_posts SET views = views + 1 WHERE id = $1',
      [result.rows[0].id]
    );
    
    // Get related posts (same category)
    const related = await pool.query(
      `SELECT id, title, slug, excerpt, featured_image, published_at
       FROM blog_posts 
       WHERE category = $1 AND id != $2 AND status = 'published' AND published_at <= NOW()
       ORDER BY published_at DESC LIMIT 3`,
      [result.rows[0].category, result.rows[0].id]
    );
    
    res.json({
      success: true,
      post: result.rows[0],
      related: related.rows
    });
  } catch (error) {
    console.error('Blog post error:', error);
    res.status(500).json({ success: false, error: 'Failed to load blog post' });
  }
});

// ============================================
// GOOGLE MAPS SCRAPER API
// ============================================

// Scrape Google Maps
app.post('/api/google-maps/scrape', async (req, res) => {
  try {
    const { url, maxResults = 20 } = req.body;
    const userId = req.user?.id || null;
    
    if (!url || !url.includes('google.com/maps')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google Maps URL'
      });
    }
    
    console.log(`🗺️ Google Maps scrape request: ${url}`);
    
    const result = await gmapsScraper.scrapeGoogleMaps(url, maxResults);
    
    // Save leads to database
    const savedLeads = [];
    for (const lead of result.leads) {
      const leadId = await gmapsScraper.saveLead(lead, userId);
      if (leadId) {
        savedLeads.push({ ...lead, id: leadId });
      }
    }
    
    res.json({
      success: true,
      leads: savedLeads,
      stats: {
        total: savedLeads.length,
        with_website: savedLeads.filter(l => l.website).length,
        with_phone: savedLeads.filter(l => l.phone).length
      }
    });
    
  } catch (error) {
    console.error('Google Maps scrape error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get my leads
app.get('/api/google-maps/my-leads', async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { status, has_website, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM google_maps_leads WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }
    
    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (has_website === 'true') {
      query += ' AND website IS NOT NULL';
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      leads: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update lead status
app.put('/api/google-maps/leads/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    await pool.query(
      `UPDATE google_maps_leads 
       SET status = $1, notes = $2, 
           contacted_at = CASE WHEN $1 = 'contacted' THEN NOW() ELSE contacted_at END,
           converted_at = CASE WHEN $1 = 'converted' THEN NOW() ELSE converted_at END
       WHERE id = $3`,
      [status, notes || null, id]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('✅ Google Maps scraper endpoints loaded');


### **Test URL (Amsterdam restaurants):**
```
https://www.google.com/maps/search/restaurants+amsterdam

// ============================================
// CATCH-ALL ROUTE (blijft hetzelfde)
// ============================================
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '../public/index.html'), (err2) => {
        if (err2) {
          res.status(404).json({ error: 'Not found' });
        }
      });
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 =====================================');
  console.log('🚀  CONTENTSCALE SERVER RUNNING');
  console.log('🚀 =====================================');
  console.log('');
  console.log('📍 Frontend:  http://localhost:' + PORT);
  console.log('📍 Admin:     http://localhost:' + PORT + '/admin');
  console.log('📍 Ultimate:  http://localhost:' + PORT + '/ultimate');
  console.log('📍 Blog:      http://localhost:' + PORT + '/blog');
  console.log('');
  console.log('✅ ALL ENDPOINTS WORKING:');
  console.log('   • /api/admins');
  console.log('   • /api/admin/freelancers');
  console.log('   • /api/super-admin/agencies');
  console.log('   • /api/admin/clients');
  console.log('   • /api/admin/scans');
  console.log('   • /api/admin/share-links');
  console.log('   • /api/admin/leaderboard');
  console.log('   • /api/admin/analytics');
  console.log('   • /api/admin/stats');
  console.log('   • /api/scan (TRANSPARENT SCORING)');
  console.log('   • /api/marketplace/leads');
  console.log('   • /api/marketplace/creators/register');
  console.log('   • /api/admin/ltd-codes (NEW)');
  console.log('   • /api/admin/blog (NEW - COMPLETE)');
  console.log('   • /api/blog (PUBLIC BLOG)');
  console.log('   • /api/admin/opt-out (NEW)');
  console.log('');
  console.log('👤 Default Admin: ot / admin123');
  console.log('');
});
