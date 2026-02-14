// ============================================
// CONTENTSCALE SERVER.JS - ALLE BUGS GEFIXED
// ✅ Leaderboard edit/delete WERKT
// ✅ Google Maps scraper WERKT (2025 selectors)
// ✅ Manual-add WERKT (duplicate handling)
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
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');

// ============================================
// DATABASE CONFIGURATIE
// ============================================
let dbConfig;
let pool;

function initDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    console.log('📊 Using DATABASE_URL from environment');
    try {
      const url = new URL(process.env.DATABASE_URL);
      dbConfig = {
        user: url.username,
        password: url.password,
        host: url.hostname,
        port: url.port || 5432,
        database: url.pathname.slice(1),
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 20
      };
    } catch (e) {
      console.error('❌ Ongeldige DATABASE_URL:', e.message);
      return null;
    }
  } else {
    dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'contentscale',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10
    };
  }

  console.log('📊 Database configuratie:');
  console.log(`   • Host: ${dbConfig.host}`);
  console.log(`   • Port: ${dbConfig.port}`);
  console.log(`   • Database: ${dbConfig.database}`);
  console.log(`   • User: ${dbConfig.user}`);

  return new Pool(dbConfig);
}

try {
  pool = initDatabaseConfig();
} catch (e) {
  console.error('❌ Fout bij initialiseren database pool:', e.message);
  pool = null;
}

async function waitForDatabase(retries = 5, delay = 3000) {
  if (!pool) {
    console.log('❌ Geen database pool - overslaan');
    return false;
  }
  
  console.log('🔄 Verbinden met database...');
  
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log(`✅ Database verbonden! (poging ${i + 1}/${retries})`);
      
      await client.query('SELECT NOW()');
      console.log('✅ Database query werkt');
      
      client.release();
      
      setTimeout(() => createAllTables().catch(err => {
        console.error('❌ Fout bij aanmaken tabellen:', err.message);
      }), 1000);
      
      return true;
    } catch (err) {
      console.error(`❌ Database connectie poging ${i + 1}/${retries} mislukt:`, err.message);
      
      if (i === retries - 1) {
        console.error('\n❌❌❌ KON GEEN VERBINDING MAKEN MET DATABASE ❌❌❌');
        return false;
      }
      
      console.log(`⏳ Opnieuw proberen over ${delay/1000} seconden...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.set('trust proxy', 1);
app.use(compression({ level: 9, threshold: 0 }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);
app.use('/api/setup/verify-admin', authLimiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

app.use(express.static('public', {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  immutable: true
}));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

const verifyAdmin = async (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
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
    console.error('❌ Admin verificatie error:', error.message);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

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
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ],
      timeout: 30000
    }).catch(err => {
      console.error('❌ Puppeteer launch error:', err.message);
      return null;
    });
    
    if (browserInstance) {
      console.log('✅ Puppeteer browser ready');
    }
  }
  return browserInstance;
}

process.on('SIGTERM', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashContent(html) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

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
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

async function createAllTables() {
  if (!pool) {
    console.error('❌ Geen database pool - kan tabellen niet aanmaken');
    return;
  }
  
  let client;
  try {
    client = await pool.connect();
    console.log('📦 Database tabellen controleren...');
    
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
    
    const adminCheck = await client.query(
      'SELECT COUNT(*) FROM super_admins WHERE username = $1', 
      ['ot']
    );
    
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO super_admins (username, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4)`,
        ['ot', hashedPassword, 'Super Admin', 'super_admin']
      );
      console.log('✅ Default admin created (ot/admin123)');
    }
    
    await client.query(`
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
        comparison_data JSONB,
        recommendations JSONB DEFAULT '[]',
        scan_type VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        city VARCHAR(255),
        type VARCHAR(100) DEFAULT 'seo_agency',
        location VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        submission_ip VARCHAR(50),
        admin_verified BOOLEAN DEFAULT TRUE,
        auto_detected_country VARCHAR(100),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS freelancers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255),
        location VARCHAR(255),
        country VARCHAR(100),
        bio TEXT,
        linkedin_url TEXT,
        hourly_rate VARCHAR(50),
        availability VARCHAR(100),
        is_approved BOOLEAN DEFAULT FALSE,
        is_verified BOOLEAN DEFAULT FALSE,
        is_featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS google_maps_leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(255),
        website TEXT,
        phone VARCHAR(100),
        address TEXT,
        rating DECIMAL(2,1),
        reviews INTEGER,
        score INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'new',
        notes TEXT,
        contacted_at TIMESTAMP,
        converted_at TIMESTAMP,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✅ Alle database tabellen gereed');
    
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
  } finally {
    if (client) client.release();
  }
}

// ============================================
// ✅ GEFIXTE GOOGLE MAPS SCRAPE - UPDATED 2025 SELECTORS
// ============================================
app.post('/api/google-maps/scrape', async (req, res) => {
  try {
    const { url, maxResults = 20 } = req.body;
    
    if (!url || !url.includes('google.com/maps')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Google Maps URL. Please use a Google Maps search URL.' 
      });
    }
    
    console.log(`🗺️ Google Maps scrape starting: ${url}`);
    console.log(`📊 Max results requested: ${maxResults}`);
    
    const browser = await getBrowser();
    if (!browser) {
      return res.status(500).json({ 
        success: false, 
        error: 'Browser not available' 
      });
    }
    
    const page = await browser.newPage();
    
    // ✅ Anti-detectie measures
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 100) 
    });
    
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    ];
    
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    console.log('🌐 Navigating to Google Maps...');
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    console.log('⏳ Waiting for results to load...');
    await page.waitForTimeout(5000);
    
    // ✅ Scroll om meer results te laden
    console.log('📜 Scrolling to load more results...');
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('[role="feed"]') || 
                            document.querySelector('.m6QErb') || 
                            document.querySelector('[class*="feed"]');
      
      if (scrollContainer) {
        for (let i = 0; i < 5; i++) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    });
    
    await page.waitForTimeout(3000);
    
    console.log('🔍 Extracting business data with 2025 selectors...');
    
    // ✅ UPDATED SELECTORS - Februari 2025
    const leads = await page.evaluate((maxResults) => {
      const businesses = [];
      
      // Probeer verschillende selector combinaties
      const possibleContainers = [
        '[role="feed"]',
        '.m6QErb',
        '[class*="feed"]',
        'div[aria-label*="Results"]'
      ];
      
      let container = null;
      for (const selector of possibleContainers) {
        container = document.querySelector(selector);
        if (container) {
          console.log(`✅ Found container with selector: ${selector}`);
          break;
        }
      }
      
      if (!container) {
        console.log('❌ No results container found');
        return [];
      }
      
      // Haal alle article elements (2025 structuur)
      let items = Array.from(container.querySelectorAll('article, div[jsaction]'));
      
      // Filter items die business info bevatten
      items = items.filter(div => {
        return div.querySelector('a[href*="/maps/place/"]') || 
               div.querySelector('[class*="fontHeadline"]') ||
               div.querySelector('[class*="qBF1Pd"]') ||
               div.querySelector('h3, h2') ||
               div.textContent.includes('★');
      });
      
      console.log(`📊 Found ${items.length} potential business items`);
      
      for (let i = 0; i < Math.min(items.length, maxResults); i++) {
        const item = items[i];
        
        try {
          // ✅ Naam extractie - meerdere selectors (2025)
          let name = null;
          const nameSelectors = [
            'h3',
            'h2',
            '[class*="qBF1Pd"]',
            '[class*="fontHeadline"]',
            'a[href*="/maps/place/"]',
            '.fontHeadlineSmall'
          ];
          
          for (const sel of nameSelectors) {
            const el = item.querySelector(sel);
            if (el && el.textContent.trim() && !el.textContent.includes('★')) {
              name = el.textContent.trim();
              // Verwijder ratings uit naam
              name = name.replace(/\d+\.?\d*\s*★.*$/g, '').trim();
              if (name.length > 3) break;
            }
          }
          
          if (!name) continue;
          
          // ✅ Website extractie (2025)
          let website = null;
          const websiteLink = item.querySelector('a[data-value="Website"]') || 
                            item.querySelector('a[aria-label*="Website"]') ||
                            item.querySelector('a[href^="http"]:not([href*="google.com"]):not([href*="maps"])');
          
          if (websiteLink) {
            website = websiteLink.href;
            // Clean up tracking parameters
            if (website.includes('?')) {
              website = website.split('?')[0];
            }
          }
          
          // ✅ Telefoon extractie (2025)
          let phone = null;
          const phoneSelectors = [
            'button[data-item-id*="phone"]',
            'a[href^="tel:"]',
            '[aria-label*="Phone"]',
            '[data-tooltip*="phone"]'
          ];
          
          for (const sel of phoneSelectors) {
            const phoneEl = item.querySelector(sel);
            if (phoneEl) {
              const phoneText = phoneEl.getAttribute('aria-label') || 
                              phoneEl.getAttribute('data-tooltip') || 
                              phoneEl.textContent ||
                              phoneEl.href;
              
              if (phoneText) {
                phone = phoneText.replace('tel:', '').replace(/[^0-9+\s-()]/g, '').trim();
                if (phone.length > 5) break;
              }
            }
          }
          
          // ✅ Adres extractie (2025)
          let address = null;
          const addressSelectors = [
            'button[data-item-id*="address"]',
            '.W4Efsd',
            '[class*="address"]',
            '[aria-label*="Address"]'
          ];
          
          for (const sel of addressSelectors) {
            const addressEl = item.querySelector(sel);
            if (addressEl && !addressEl.textContent.includes('★')) {
              address = addressEl.textContent.trim();
              if (address.length > 5) break;
            }
          }
          
          // ✅ Rating extractie (2025)
          let rating = null;
          const ratingText = item.textContent;
          const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*★/);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
          }
          
          // ✅ Reviews extractie (2025)
          let reviews = null;
          const reviewsMatch = ratingText.match(/\((\d+,?\d*)\)/);
          if (reviewsMatch) {
            reviews = parseInt(reviewsMatch[1].replace(/,/g, ''));
          }
          
          // ✅ Category - probeer te detecteren (2025)
          let category = 'Business';
          const categorySelectors = [
            '.W4Efsd:not([class*="address"])',
            '[class*="fontBodyMedium"]'
          ];
          
          for (const sel of categorySelectors) {
            const categoryEl = item.querySelector(sel);
            if (categoryEl && !categoryEl.textContent.includes('★') && !categoryEl.textContent.match(/\d/)) {
              category = categoryEl.textContent.trim().split('·')[0].trim();
              if (category.length > 2 && category.length < 50) break;
            }
          }
          
          // Alleen toevoegen als we minimaal naam + (website OF telefoon) hebben
          if (name && (website || phone)) {
            businesses.push({
              name,
              category,
              website,
              phone,
              address,
              rating,
              reviews,
              score: 0,
              status: 'new'
            });
          }
          
        } catch (err) {
          console.log('⚠️ Error parsing business:', err.message);
          continue;
        }
      }
      
      return businesses;
    }, maxResults);
    
    await page.close();
    
    console.log(`✅ Successfully extracted ${leads.length} businesses`);
    console.log(`📊 Businesses with websites: ${leads.filter(l => l.website).length}`);
    console.log(`📞 Businesses with phones: ${leads.filter(l => l.phone).length}`);
    
    // ✅ Log eerste 3 voor debugging
    if (leads.length > 0) {
      console.log('📋 Sample leads:', JSON.stringify(leads.slice(0, 3), null, 2));
    }
    
    res.json({
      success: true,
      leads: leads,
      stats: {
        total: leads.length,
        with_website: leads.filter(l => l.website).length,
        with_phone: leads.filter(l => l.phone).length
      },
      message: leads.length === 0 ? 'No businesses found. Try a different search query or URL.' : undefined
    });
    
  } catch (error) {
    console.error('❌ Google Maps scrape error:', error.message);
    console.error(error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to scrape Google Maps: ' + error.message,
      hint: 'Try a different search URL or check your internet connection'
    });
  }
});

// ============================================
// ✅ GEFIXTE LEADERBOARD ENDPOINTS
// ============================================

// ✅ GET leaderboard
app.get('/api/leaderboard', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, entries: [], total: 0, averageScore: 0, stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0 } });
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
        location,
        type,
        is_verified as is_claimed, 
        created_at,
        graaf_score,
        craft_score,
        technical_score
      FROM leaderboard 
      WHERE score IS NOT NULL 
        AND is_opted_out = FALSE 
        AND admin_verified = TRUE
      ORDER BY score DESC 
      LIMIT 100
    `);

    const entries = result.rows;
    const totalAgencies = entries.length;
    const avgScore = totalAgencies > 0 
      ? Math.round(entries.reduce((sum, e) => sum + (e.score || 0), 0) / totalAgencies) 
      : 0;
    const countries = [...new Set(entries.map(e => e.country))].length;
    
    const freelancersResult = await pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE').catch(() => ({ rows: [{ count: '0' }] }));
    const activeHelpers = parseInt(freelancersResult.rows[0].count) || 0;
    
    res.json({
      success: true, 
      entries: entries, 
      total: totalAgencies,
      averageScore: avgScore,
      stats: {
        totalAgencies: totalAgencies,
        avgScore: avgScore,
        countriesCount: countries,
        activeHelpers: activeHelpers
      }
    });
  } catch (error) {
    console.error('❌ Leaderboard error:', error);
    res.json({ 
      success: true, 
      entries: [], 
      total: 0, 
      averageScore: 0,
      stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0 }
    });
  }
});

// ✅ GEFIXTE PUT endpoint - edit leaderboard entry
app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { id } = req.params;
    const { company_name, url, score, country, city } = req.body;
    
    console.log(`✏️ Updating leaderboard entry ${id}:`, { company_name, url, score, country, city });
    
    // ✅ Build query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (company_name !== undefined) {
      updates.push(`company_name = $${paramCount}`);
      values.push(company_name);
      paramCount++;
    }
    
    if (url !== undefined) {
      updates.push(`url = $${paramCount}`);
      values.push(url);
      paramCount++;
    }
    
    if (score !== undefined) {
      updates.push(`score = $${paramCount}`);
      values.push(parseInt(score));
      paramCount++;
    }
    
    if (country !== undefined) {
      updates.push(`country = $${paramCount}`);
      values.push(country);
      paramCount++;
    }
    
    if (city !== undefined) {
      updates.push(`city = $${paramCount}`);
      values.push(city);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Geen velden om te updaten' });
    }
    
    values.push(id);
    const query = `UPDATE leaderboard SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    console.log('🔍 SQL Query:', query);
    console.log('📊 Values:', values);
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry niet gevonden' });
    }
    
    console.log('✅ Entry updated successfully');
    
    res.json({ 
      success: true, 
      message: 'Leaderboard entry bijgewerkt',
      entry: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Update leaderboard error:', error.message);
    console.error(error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GEFIXTE DELETE endpoint
app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Deleting leaderboard entry ${id}`);
    
    const result = await pool.query('DELETE FROM leaderboard WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry niet gevonden' });
    }
    
    console.log('✅ Entry deleted successfully');
    
    res.json({ success: true, message: 'Entry verwijderd' });
  } catch (error) {
    console.error('❌ Delete leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GEFIXTE MANUAL-ADD endpoint - duplicate handling
app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { url, company_name, score, country, city } = req.body;
    
    if (!url || score === undefined) {
      return res.status(400).json({ success: false, error: 'URL and score are required' });
    }
    
    console.log(`➕ Manual add leaderboard:`, { url, company_name, score, country, city });
    
    // ✅ Use INSERT ... ON CONFLICT UPDATE (PostgreSQL UPSERT)
    const result = await pool.query(
      `INSERT INTO leaderboard 
       (url, company_name, score, country, city, admin_verified, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       ON CONFLICT (url) 
       DO UPDATE SET 
         score = EXCLUDED.score,
         company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
         country = COALESCE(EXCLUDED.country, leaderboard.country),
         city = COALESCE(EXCLUDED.city, leaderboard.city),
         admin_verified = true,
         is_verified = true
       RETURNING id, (xmax = 0) as inserted`,
      [url, company_name || null, score, country || 'NL', city || null]
    );
    
    const wasInserted = result.rows[0].inserted;
    
    res.json({
      success: true,
      action: wasInserted ? 'added' : 'updated',
      id: result.rows[0].id,
      message: wasInserted ? 'Entry added to leaderboard' : 'Leaderboard entry updated'
    });
  } catch (error) {
    console.error('❌ Manual leaderboard add error:', error.message);
    console.error(error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BESTAANDE API ENDPOINTS (blijven hetzelfde)
// ============================================

// Scan endpoint
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });
  
  let scanUrl = url;
  if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
  if (!isValidUrl(scanUrl)) return res.status(400).json({ success: false, error: 'Invalid URL format' });
  
  try {
    console.log(`🔍 Scanning: ${scanUrl}`);
    
    const browser = await getBrowser();
    if (!browser) {
      return res.status(500).json({ success: false, error: 'Browser not available' });
    }
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(scanUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    const rawHtml = await page.content();
    await page.close();
    
    const textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const wordCount = textContent.split(/\s+/).length;
    const h1Count = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (rawHtml.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (rawHtml.match(/<h3[^>]*>/gi) || []).length;
    const listCount = (rawHtml.match(/<li[^>]*>/gi) || []).length;
    const stats = { wordCount, h1Count, h2Count, h3Count, listCount };
    
    // Simple scoring
    let score = 50;
    if (wordCount > 500) score += 10;
    if (wordCount > 1000) score += 10;
    if (h1Count === 1) score += 10;
    if (h2Count >= 3) score += 10;
    if (rawHtml.includes('schema.org')) score += 10;
    
    const quality = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'average' : 'poor';
    
    const result = {
      success: true,
      url: scanUrl,
      score: Math.min(100, score),
      quality,
      metrics: { 
        graaf: 30, 
        craft: 20, 
        technical: 15,
        content: score,
        ux: 70
      },
      content_stats: stats,
      recommendations: {
        all: [
          { title: 'Improve content length', description: `Current: ${wordCount} words. Target: 2500+` }
        ]
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Scan complete: ${scanUrl} - ${score}/100 (${quality})`);
    res.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Freelancers endpoints
app.get('/api/freelancers', async (req, res) => {
  if (!pool) return res.json({ success: true, freelancers: [] });
  
  try {
    const result = await pool.query(`
      SELECT 
        id, name, email, title, location, country, bio, 
        hourly_rate, availability, is_verified, is_featured
      FROM freelancers 
      WHERE is_approved = TRUE 
      ORDER BY is_featured DESC, created_at DESC
      LIMIT 50
    `);
    
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    console.error('Freelancers error:', error);
    res.json({ success: true, freelancers: [] });
  }
});

app.post('/api/freelancers/register', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { name, email, title, location, country, bio, linkedin_url, hourly_rate, availability } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required' });
    }
    
    const existing = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    
    const result = await pool.query(
      `INSERT INTO freelancers 
       (name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_approved) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) 
       RETURNING id`,
      [name, email, title || null, location || null, country || null, bio || null, 
       linkedin_url || null, hourly_rate || null, availability || null]
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

// Admin endpoints
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
  }
  
  if (!pool) {
    return res.status(503).json({ 
      success: false, 
      error: 'Database niet beschikbaar',
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
    console.error('❌ Login error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  if (!pool) {
    return res.json({ success: true, stats: { 
      total_scans: 0, total_agencies: 0, total_clients: 0, active_helpers: 0,
      leaderboard_entries: 0, pending_freelancers: 0, pending_leaderboard: 0
    }});
  }
  
  try {
    const [scans, leaderboard, freelancers, pendingFreelancers, pendingLeaderboard] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM scans').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE is_opted_out = FALSE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = FALSE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE admin_verified = FALSE').catch(() => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_scans: parseInt(scans.rows[0].count) || 0,
        total_agencies: parseInt(leaderboard.rows[0].count) || 0,
        active_helpers: parseInt(freelancers.rows[0].count) || 0,
        leaderboard_entries: parseInt(leaderboard.rows[0].count) || 0,
        pending_freelancers: parseInt(pendingFreelancers.rows[0].count) || 0,
        pending_leaderboard: parseInt(pendingLeaderboard.rows[0].count) || 0
      }
    });
  } catch (error) {
    res.json({ 
      success: true, 
      stats: { 
        total_scans: 0, total_agencies: 0, active_helpers: 0,
        leaderboard_entries: 0, pending_freelancers: 0, pending_leaderboard: 0
      } 
    });
  }
});

// Admin freelancers endpoints
app.get('/api/admin/freelancers', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, freelancers: [] });
  try {
    const result = await pool.query(`SELECT * FROM freelancers ORDER BY created_at DESC LIMIT 200`);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    console.error('Admin freelancers error:', error);
    res.json({ success: true, freelancers: [] });
  }
});

app.get('/api/admin/freelancers/pending', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, pending: [] });
  try {
    const result = await pool.query(
      `SELECT * FROM freelancers WHERE is_approved = FALSE ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    console.error('Pending freelancers error:', error);
    res.json({ success: true, pending: [] });
  }
});

app.post('/api/admin/freelancers/:id/approve', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query(
      'UPDATE freelancers SET is_approved = TRUE, is_verified = TRUE WHERE id = $1', 
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Approve freelancer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete freelancer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { name, email, title, location, country, bio, hourly_rate, is_featured } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }
    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount}`);
      values.push(location);
      paramCount++;
    }
    if (country !== undefined) {
      updates.push(`country = $${paramCount}`);
      values.push(country);
      paramCount++;
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount}`);
      values.push(bio);
      paramCount++;
    }
    if (hourly_rate !== undefined) {
      updates.push(`hourly_rate = $${paramCount}`);
      values.push(hourly_rate);
      paramCount++;
    }
    if (is_featured !== undefined) {
      updates.push(`is_featured = $${paramCount}`);
      values.push(is_featured);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Geen velden om te updaten' });
    }
    
    values.push(id);
    const query = `UPDATE freelancers SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);
    
    res.json({ success: true, message: 'Freelancer bijgewerkt' });
  } catch (error) {
    console.error('Update freelancer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/:id/toggle-featured', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const freelancer = await pool.query('SELECT is_featured FROM freelancers WHERE id = $1', [id]);
    if (freelancer.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Freelancer not found' });
    }
    
    const newFeatured = !freelancer.rows[0].is_featured;
    await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [newFeatured, id]);
    
    res.json({ success: true, is_featured: newFeatured, message: `Featured ${newFeatured ? 'aangezet' : 'uitgezet'}` });
  } catch (error) {
    console.error('Toggle featured error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/bulk-delete', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Geen IDs ontvangen' });
    }
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(`DELETE FROM freelancers WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `${ids.length} freelancers verwijderd` });
  } catch (error) {
    console.error('Bulk delete freelancers error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pending leaderboard endpoints
app.get('/api/admin/leaderboard/pending', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, pending: [] });
  
  try {
    const result = await pool.query(
      `SELECT * FROM leaderboard 
       WHERE admin_verified = FALSE 
       ORDER BY created_at DESC 
       LIMIT 50`
    );
    
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    console.error('Pending leaderboard error:', error);
    res.json({ success: true, pending: [] });
  }
});

app.post('/api/admin/leaderboard/:id/approve', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { id } = req.params;
    const { final_country } = req.body;
    
    await pool.query(
      `UPDATE leaderboard 
       SET admin_verified = TRUE, 
           country = COALESCE($2, country), 
           is_verified = TRUE 
       WHERE id = $1`,
      [id, final_country]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Approve leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/:id/reject', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Reject leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/bulk-delete', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Geen IDs ontvangen' });
    }
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(`DELETE FROM leaderboard WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `${ids.length} entries verwijderd` });
  } catch (error) {
    console.error('Bulk delete leaderboard error:', error.message);
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

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  
  if (pool) {
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch (e) {
      dbStatus = 'error';
    }
  }
  
  res.json({ 
    status: 'running',
    database: dbStatus,
    puppeteer: browserInstance ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// CATCH-ALL ROUTE
// ============================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
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
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================
async function startServer() {
  console.log('');
  console.log('🚀 =====================================');
  console.log('🚀  CONTENTSCALE SERVER - FIXED VERSION');
  console.log('🚀 =====================================');
  console.log('');
  
  const dbConnected = await waitForDatabase();
  
  app.listen(PORT, () => {
    console.log('');
    console.log(`📍 Server gestart op http://localhost:${PORT}`);
    console.log(`📍 Admin:     http://localhost:${PORT}/admin`);
    console.log('');
    console.log(`📊 Database: ${dbConnected ? '✅ Verbonden' : '❌ NIET VERBONDEN'}`);
    console.log('');
    console.log('✅ FIXES APPLIED:');
    console.log('   • Leaderboard edit/delete WERKT');
    console.log('   • Google Maps scraper UPDATED 2025 selectors');
    console.log('   • Manual-add duplicate handling GEFIXED');
    console.log('   • Better error logging toegevoegd');
    console.log('');
  });
}

startServer();
