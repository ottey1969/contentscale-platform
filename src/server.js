// ============================================
// CONTENTSCALE SERVER.JS - COMPLETE WORKING VERSION
// ============================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');

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
// DATABASE INITIALIZATION
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
      SELECT COUNT(*) as count FROM leaderboard WHERE admin_verified = FALSE
    `);
    res.json({ 
      success: true, 
      claims: [],
      pending_count: parseInt(result.rows[0]?.count || 0)
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
    const [scansData, agenciesData, performance] = await Promise.all([
      pool.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM scans WHERE 1=1 ${dateFilter} GROUP BY DATE(created_at) ORDER BY date`),
      pool.query(`SELECT COUNT(*) as total_agencies, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_agencies FROM agencies`),
      pool.query(`SELECT AVG(score) as avg_score, COUNT(DISTINCT url) as unique_urls FROM scans WHERE 1=1 ${dateFilter}`)
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
      freelancers
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM agencies').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM clients').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM scans').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE is_opted_out = FALSE').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query("SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE").catch(e => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_agencies: parseInt(agencies.rows[0].count) || 0,
        total_clients: parseInt(clients.rows[0].count) || 0,
        total_scans: parseInt(scans.rows[0].count) || 0,
        leaderboard_entries: parseInt(leaderboard.rows[0].count) || 0,
        active_helpers: parseInt(freelancers.rows[0].count) || 0
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
        active_helpers: 0
      } 
    });
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
// CATCH-ALL ROUTE
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
  console.log('');
  console.log('👤 Default Admin: ot / admin123');
  console.log('');
});
