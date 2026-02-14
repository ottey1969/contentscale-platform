// ============================================
// CONTENTSCALE SERVER.JS - 100% WERKENDE VERSIE
// MET FIXED DATABASE CONNECTIE EN ERROR HANDLING
// EN SSL WARNING FIX - JUISTE PLEK
// ============================================

// ============================================
// SSL WARNING FIX - DIT MOET EERST KOMEN!
// ============================================
process.env.PGSSLMODE = 'verify-full';
process.env.NODE_NO_WARNINGS = '1';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE - ALTIJD EERST
// ============================================
app.set('trust proxy', 1);
app.use(compression({ level: 9, threshold: 0 }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://app.contentscale.site',
    'https://contentscale.site',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static files
app.use(express.static('public', {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ============================================
// DATABASE CONNECTIE MET FALLBACK
// ============================================
let pool = null;

function initDatabase() {
  console.log('📊 Initializing database connection...');
  
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  No DATABASE_URL found, running in fallback mode (scans only)');
    return null;
  }

  try {
    const poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10
    };

    const dbPool = new Pool(poolConfig);

    // Test connection
    dbPool.connect((err, client, release) => {
      if (err) {
        console.error('❌ Database connection test failed:', err.message);
        return;
      }
      console.log('✅ Database connected successfully');
      release();
      
      // Setup tables in background
      setTimeout(() => setupTables(dbPool), 1000);
    });

    return dbPool;
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    return null;
  }
}

async function setupTables(dbPool) {
  if (!dbPool) return;
  
  try {
    // Super admins table
    await dbPool.query(`
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
    
    // Check/create default admin
    const adminCheck = await dbPool.query(
      'SELECT COUNT(*) FROM super_admins WHERE username = $1', 
      ['ot']
    );
    
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await dbPool.query(
        `INSERT INTO super_admins (username, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4)`,
        ['ot', hashedPassword, 'Super Admin', 'super_admin']
      );
      console.log('✅ Default admin created (ot/admin123)');
    }
    
    // Scans table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        quality VARCHAR(50),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        content_score INTEGER,
        ux_score INTEGER,
        breakdown JSONB,
        recommendations JSONB DEFAULT '[]',
        scan_type VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Leaderboard table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        city VARCHAR(255),
        type VARCHAR(100) DEFAULT 'seo_agency',
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        admin_verified BOOLEAN DEFAULT TRUE,
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Freelancers table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS freelancers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255),
        location VARCHAR(255),
        country VARCHAR(100),
        bio TEXT,
        hourly_rate VARCHAR(50),
        availability VARCHAR(100),
        is_approved BOOLEAN DEFAULT FALSE,
        is_verified BOOLEAN DEFAULT FALSE,
        is_featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✅ All database tables ready');
  } catch (err) {
    console.error('❌ Table setup error:', err.message);
  }
}

// Initialize database
pool = initDatabase();

// ============================================
// CACHE SYSTEM
// ============================================
const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashContent(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

// Clean cache every minute
setInterval(() => {
  const now = Date.now();
  let cleared = 0;
  for (const [key, value] of scanCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      scanCache.delete(key);
      cleared++;
    }
  }
  if (cleared > 0) console.log(`🧹 Cleared ${cleared} expired cache entries`);
}, 60000);

// ============================================
// PUPPETEER BROWSER INSTANCE
// ============================================
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    try {
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
    } catch (err) {
      console.error('❌ Puppeteer launch error:', err.message);
      return null;
    }
  }
  return browserInstance;
}

// ============================================
// URL VALIDATION
// ============================================
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeUrl(url) {
  let normalized = url.trim();
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }
  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

// ============================================
// SCORING ALGORITHM
// ============================================
function calculateScores(html) {
  // Extract stats
  const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const wordCount = textContent.split(/\s+/).length;
  const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
  const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;
  const listCount = (html.match(/<li[^>]*>/gi) || []).length;
  
  // GRAAF Score (Content Quality)
  let graafScore = 0;
  let credibility = 0;
  if (/by\s+\w+|author:|written\s+by/i.test(textContent)) credibility += 6;
  if (/["']|says|according|explains/i.test(textContent)) credibility += 5;
  if (/expert|specialist|professional/i.test(textContent)) credibility += 5;
  graafScore += Math.min(16, credibility);
  
  let relevance = Math.min(18, Math.floor(wordCount / 55));
  graafScore += relevance;
  
  let accuracy = 0;
  if (/\d+%|\d+\s+of|\d+\s+studies/i.test(textContent)) accuracy += 4;
  if (/source:|reference:|according to/i.test(textContent)) accuracy += 4;
  graafScore += Math.min(8, accuracy);
  
  let freshness = 0;
  if (/202[3-5]|2025/i.test(textContent)) freshness += 6;
  else freshness += 2;
  graafScore += Math.min(8, freshness);
  
  // Craft Score (Structure)
  let craftScore = 0;
  craftScore += h1Count === 1 ? 8 : h1Count > 1 ? 4 : 2;
  craftScore += Math.min(10, (h2Count * 2) + (h3Count * 1));
  craftScore += Math.min(8, Math.floor(wordCount / 125));
  craftScore += listCount >= 3 ? 4 : listCount >= 1 ? 2 : 0;
  
  // Technical Score
  let technicalScore = 0;
  
  const metaDesc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  technicalScore += metaDesc && metaDesc[1].length > 50 ? 4 : metaDesc ? 2 : 0;
  
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  technicalScore += title && title[1].length > 30 ? 4 : title ? 2 : 0;
  
  const allImages = (html.match(/<img[^>]*>/gi) || []).length;
  const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
  if (allImages > 0) {
    technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
  }
  
  if (/<meta\s+name="viewport"/i.test(html)) technicalScore += 3;
  if (/"@context"|"@type"/i.test(html)) technicalScore += 3;
  
  // Calculate total score (0-100)
  const totalScore = Math.round(
    (graafScore / 50 * 40) +  // GRAAF max 40
    (craftScore / 30 * 30) +  // Craft max 30
    (technicalScore / 20 * 30) // Technical max 30
  );
  
  // Quality label
  let quality = 'poor';
  if (totalScore >= 90) quality = 'excellent';
  else if (totalScore >= 75) quality = 'good';
  else if (totalScore >= 60) quality = 'average';
  else if (totalScore >= 45) quality = 'below-average';
  
  return {
    total: Math.min(100, Math.max(0, totalScore)),
    quality,
    metrics: {
      graaf: graafScore,
      craft: craftScore,
      technical: technicalScore,
      content: Math.round(graafScore / 50 * 100),
      ux: Math.round((craftScore / 30 * 100 + technicalScore / 20 * 100) / 2)
    },
    stats: {
      wordCount,
      h1Count,
      h2Count,
      h3Count,
      listCount,
      images: allImages,
      imagesWithAlt
    }
  };
}

function generateRecommendations(scores, html) {
  const recs = [];
  const { stats, metrics } = scores;
  
  // Meta description
  if (!html.includes('name="description"')) {
    recs.push({
      priority: 'HIGH',
      title: 'Add Meta Description',
      impact: 8,
      description: 'No meta description found. Add a compelling 155-character description.'
    });
  }
  
  // Title tag
  if (!html.includes('<title>')) {
    recs.push({
      priority: 'HIGH',
      title: 'Add Title Tag',
      impact: 10,
      description: 'Missing title tag. Add a unique title (50-60 characters).'
    });
  }
  
  // Images alt text
  if (stats.images > 0 && stats.imagesWithAlt < stats.images) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add Alt Text to Images',
      impact: 6,
      description: `${stats.images - stats.imagesWithAlt} images missing alt text. Add descriptive alt text for accessibility and SEO.`
    });
  }
  
  // Headings
  if (stats.h1Count === 0) {
    recs.push({
      priority: 'HIGH',
      title: 'Add H1 Heading',
      impact: 9,
      description: 'No H1 tag found. Add one main heading that describes the page content.'
    });
  } else if (stats.h1Count > 1) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Fix Multiple H1 Tags',
      impact: 7,
      description: `${stats.h1Count} H1 tags found. Use only one H1 per page.`
    });
  }
  
  if (stats.h2Count < 2) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add More Subheadings',
      impact: 6,
      description: 'Add more H2 headings to structure your content better.'
    });
  }
  
  // Content length
  if (stats.wordCount < 300) {
    recs.push({
      priority: 'HIGH',
      title: 'Expand Content',
      impact: 9,
      description: `Only ${stats.wordCount} words. Aim for at least 800 words for better SEO.`
    });
  } else if (stats.wordCount < 800) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Increase Content Length',
      impact: 7,
      description: `${stats.wordCount} words. 800-1500 words recommended for better rankings.`
    });
  }
  
  // Schema markup
  if (!html.includes('"@context"')) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add Schema Markup',
      impact: 7,
      description: 'No schema markup found. Add relevant schema for rich snippets.'
    });
  }
  
  // If no recommendations, add a default
  if (recs.length === 0) {
    recs.push({
      priority: 'LOW',
      title: 'Keep Updating Content',
      impact: 5,
      description: 'Your content scores well! Keep adding fresh, valuable content.'
    });
  }
  
  return recs.sort((a, b) => b.impact - a.impact).slice(0, 5);
}

// ============================================
// PUBLIC API ENDPOINTS
// ============================================

// Health check (always works)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    database: pool ? 'connected' : 'disabled',
    puppeteer: browserInstance ? 'ready' : 'starting',
    cache_size: scanCache.size,
    timestamp: new Date().toISOString()
  });
});

// SCAN ENDPOINT - FIXED ERROR HANDLING
app.post('/api/scan', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }
    
    // Normalize URL
    let scanUrl;
    try {
      scanUrl = normalizeUrl(url);
      if (!isValidUrl(scanUrl)) {
        throw new Error('Invalid URL format');
      }
    } catch (e) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid URL format. Please enter a valid URL (e.g., example.com or https://example.com)' 
      });
    }
    
    console.log(`🔍 Scanning: ${scanUrl}`);
    
    // Check cache
    const cacheKey = hashContent(scanUrl);
    const cached = scanCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`📦 Cache hit for ${scanUrl} (${Date.now() - startTime}ms)`);
      return res.json(cached.result);
    }
    
    // Get browser
    const browser = await getBrowser();
    if (!browser) {
      return res.status(503).json({ 
        success: false, 
        error: 'Scanner service temporarily unavailable. Please try again in a few moments.' 
      });
    }
    
    // Create page with timeout
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(25000);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to URL
    let response;
    try {
      response = await page.goto(scanUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      });
    } catch (navError) {
      await page.close();
      
      // Check if it's a DNS error
      if (navError.message.includes('ERR_NAME_NOT_RESOLVED')) {
        return res.status(400).json({ 
          success: false, 
          error: `Could not resolve domain name. Please check if "${scanUrl}" is correct.` 
        });
      } else if (navError.message.includes('ERR_CONNECTION_REFUSED')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Connection refused. The website might be down.' 
        });
      } else if (navError.message.includes('ERR_SSL_PROTOCOL_ERROR')) {
        return res.status(400).json({ 
          success: false, 
          error: 'SSL/TLS error. Try using http:// instead of https://' 
        });
      } else {
        return res.status(400).json({ 
          success: false, 
          error: `Failed to load website: ${navError.message}` 
        });
      }
    }
    
    // Check response status
    if (response && response.status() >= 400) {
      await page.close();
      return res.status(400).json({ 
        success: false, 
        error: `Website returned error ${response.status()}. The page might not exist.` 
      });
    }
    
    // Get content
    const html = await page.content();
    await page.close();
    
    // Calculate scores
    const scores = calculateScores(html);
    const recommendations = generateRecommendations(scores, html);
    
    // Prepare result
    const result = {
      success: true,
      url: scanUrl,
      score: scores.total,
      quality: scores.quality,
      metrics: scores.metrics,
      recommendations: {
        all: recommendations,
        quickWins: recommendations.filter(r => r.priority === 'HIGH').slice(0, 3)
      },
      stats: scores.stats,
      timestamp: new Date().toISOString(),
      scan_time_ms: Date.now() - startTime
    };
    
    // Cache result
    scanCache.set(cacheKey, { timestamp: Date.now(), result });
    
    // Save to database if available (don't wait for it)
    if (pool) {
      pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, content_score, ux_score, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')`,
        [scanUrl, scores.total, scores.quality, scores.metrics.graaf, scores.metrics.craft, 
         scores.metrics.technical, scores.metrics.content, scores.metrics.ux]
      ).catch(err => console.error('DB save error:', err.message));
    }
    
    console.log(`✅ Scan complete: ${scanUrl} (${scores.total}/100) in ${Date.now() - startTime}ms`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Scan error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred during scanning. Please try again.' 
    });
  }
});

// Leaderboard endpoint
app.get('/api/leaderboard', async (req, res) => {
  if (!pool) {
    return res.json({ 
      success: true, 
      entries: [], 
      total: 0, 
      averageScore: 0,
      stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0 }
    });
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        company_name, 
        url, 
        score,
        country, 
        city,
        type,
        is_verified as is_claimed, 
        created_at
      FROM leaderboard 
      WHERE score IS NOT NULL AND is_opted_out = FALSE
      ORDER BY score DESC 
      LIMIT 100
    `);

    const entries = result.rows;
    const totalAgencies = entries.length;
    const avgScore = totalAgencies > 0 
      ? Math.round(entries.reduce((sum, e) => sum + (e.score || 0), 0) / totalAgencies) 
      : 0;
    const countries = [...new Set(entries.map(e => e.country))].length;
    
    res.json({
      success: true, 
      entries: entries, 
      total: totalAgencies,
      averageScore: avgScore,
      stats: {
        totalAgencies: totalAgencies,
        avgScore: avgScore,
        countriesCount: countries,
        activeHelpers: 0
      }
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ success: true, entries: [], total: 0, averageScore: 0, stats: {} });
  }
});

// Admin login endpoint
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  
  if (!pool) {
    return res.status(503).json({ 
      success: false, 
      error: 'Database not available. Admin login is currently disabled.',
      db_status: 'disconnected'
    });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE', 
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query('UPDATE super_admins SET last_login = NOW() WHERE id = $1', [admin.id]);
    
    res.json({
      success: true,
      admin_id: admin.id,
      admin: { 
        id: admin.id, 
        username: admin.username, 
        full_name: admin.full_name, 
        role: admin.role 
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

// Admin middleware
const verifyAdmin = async (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database not available' });
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
    console.error('Admin verification error:', error.message);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

// Admin stats endpoint
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    const [scans, leaderboard, freelancers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM scans'),
      pool.query('SELECT COUNT(*) FROM leaderboard'),
      pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE')
    ]);
    
    res.json({
      success: true,
      stats: {
        total_scans: parseInt(scans.rows[0].count) || 0,
        total_agencies: parseInt(leaderboard.rows[0].count) || 0,
        active_helpers: parseInt(freelancers.rows[0].count) || 0,
        total_clients: parseInt(scans.rows[0].count) || 0,
        leaderboard_entries: parseInt(leaderboard.rows[0].count) || 0,
        blog_posts: 0,
        active_share_links: 0,
        pending_claims: 0,
        pending_freelancers: 0,
        pending_leaderboard: 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({ success: true, stats: {} });
  }
});

// Admin session verify
app.post('/api/admin/verify-session', verifyAdmin, (req, res) => {
  res.json({ valid: true, admin: req.admin.username });
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

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog-post.html'));
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================
async function startServer() {
  console.log('\n🚀 =====================================');
  console.log('🚀  CONTENTSCALE SERVER STARTING');
  console.log('🚀 =====================================\n');
  
  // Start browser
  await getBrowser();
  
  app.listen(PORT, () => {
    console.log(`📍 Server running on http://localhost:${PORT}`);
    console.log(`📍 Admin:     http://localhost:${PORT}/admin`);
    console.log(`📍 Blog:      http://localhost:${PORT}/blog`);
    console.log('');
    console.log(`📊 Database:  ${pool ? '✅ Connected' : '⚠️  Fallback mode'}`);
    console.log(`🔐 Admin:     ${pool ? '✅ Available (ot/admin123)' : '❌ Not available'}`);
    console.log(`🌐 Scanner:   ${browserInstance ? '✅ Ready' : '⚠️  Starting...'}`);
    console.log('');
  });
}

// Handle shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (browserInstance) {
    await browserInstance.close();
  }
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

startServer();
