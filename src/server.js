// ============================================
// CONTENTSCALE SERVER.JS - 100% WERKENDE VERSIE
// MET OPTIONELE EIGEN API KEYS VOOR USERS
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
const axios = require('axios'); // Voor API calls

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');

// ============================================
// NIEUW: GEBRUIKERSSESSIE MANAGEMENT
// ============================================
// Elke gebruiker krijgt een unieke ID die in localStorage wordt opgeslagen
// Zo kunnen we hun eigen API keys koppelen

function generateUserId() {
  return 'user_' + crypto.randomBytes(16).toString('hex');
}

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
  console.log(`   • SSL: ${dbConfig.ssl ? 'Ja' : 'Nee'}`);

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
        console.error('\n📋 OPLOSSINGEN:');
        console.error('   1. Controleer of PostgreSQL draait');
        console.error('   2. Controleer environment variables:');
        console.error('      - DATABASE_URL of');
        console.error('      - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
        console.error('\n⚠️  Server start ZONDER database - admin login werkt niet!\n');
        
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF are allowed.'));
    }
  }
});

app.set('trust proxy', 1);
app.use(compression({ level: 9, threshold: 0 }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
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
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      timeout: 30000
    }).catch(err => {
      console.error('❌ Puppeteer launch error:', err.message);
      return null;
    });
    
    if (browserInstance) {
      console.log('✅ Puppeteer browser ready');
    } else {
      console.log('❌ Puppeteer browser failed to start');
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
    
    // BESTAANDE TABELLEN
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
    } else {
      console.log('✅ Admin gebruiker bestaat al');
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
        featured_image_alt VARCHAR(500),
        featured_image_caption TEXT,
        author VARCHAR(255) NOT NULL,
        meta_description TEXT,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS blog_images (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        alt_text VARCHAR(500) NOT NULL,
        caption TEXT,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        id SERIAL PRIMARY KEY,
        share_code VARCHAR(64) UNIQUE NOT NULL,
        client_email VARCHAR(255),
        client_name VARCHAR(255),
        client_company VARCHAR(255),
        scans_limit INTEGER DEFAULT 10,
        scans_used INTEGER DEFAULT 0,
        created_by INTEGER REFERENCES super_admins(id),
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        business_url TEXT NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(100),
        verification_document TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES super_admins(id),
        reviewed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // ============================================
    // NIEUWE TABELLEN VOOR GEBRUIKER API KEYS
    // ============================================
    
    // Tabel voor gebruikerssessies
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) UNIQUE NOT NULL,
        ip_address VARCHAR(50),
        last_active TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Tabel voor gebruikers API keys
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES user_sessions(user_id) ON DELETE CASCADE,
        service VARCHAR(50) NOT NULL,  -- 'sendgrid' of 'webshare'
        api_key TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        daily_limit INTEGER DEFAULT 100,
        used_today INTEGER DEFAULT 0,
        last_reset DATE DEFAULT CURRENT_DATE,
        proxies JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service)
      )
    `);
    
    // Tabel voor email queue (voor Sendgrid)
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES user_sessions(user_id) ON DELETE CASCADE,
        to_email VARCHAR(255) NOT NULL,
        to_name VARCHAR(255),
        subject VARCHAR(255),
        template VARCHAR(50) DEFAULT 'default',
        status VARCHAR(20) DEFAULT 'pending',
        sent_at TIMESTAMP,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Tabel voor scan limieten (Google Maps)
    await client.query(`
      CREATE TABLE IF NOT EXISTS google_maps_scans (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES user_sessions(user_id) ON DELETE CASCADE,
        ip VARCHAR(50),
        url TEXT,
        results_count INTEGER,
        used_proxy BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✅ Alle database tabellen gereed (incl. user API keys)');
    
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
  } finally {
    if (client) client.release();
  }
}

// ============================================
// NIEUWE FUNCTIES VOOR GEBRUIKER API KEYS
// ============================================

// Haal of maak user ID
async function getOrCreateUserId(req) {
  let userId = req.headers['x-user-id'];
  
  if (!userId && pool) {
    // Probeer te vinden op IP
    const ip = req.ip;
    const result = await pool.query(
      'SELECT user_id FROM user_sessions WHERE ip_address = $1 ORDER BY last_active DESC LIMIT 1',
      [ip]
    );
    
    if (result.rows.length > 0) {
      userId = result.rows[0].user_id;
      await pool.query(
        'UPDATE user_sessions SET last_active = NOW() WHERE user_id = $1',
        [userId]
      );
    }
  }
  
  return userId;
}

// Haal API key voor een gebruiker
async function getUserApiKey(userId, service) {
  if (!pool || !userId) return null;
  
  try {
    const result = await pool.query(
      'SELECT * FROM user_api_keys WHERE user_id = $1 AND service = $2 AND is_active = TRUE',
      [userId, service]
    );
    
    if (result.rows.length > 0) {
      // Reset daily counter als het een nieuwe dag is
      const key = result.rows[0];
      const today = new Date().toISOString().split('T')[0];
      const lastReset = new Date(key.last_reset).toISOString().split('T')[0];
      
      if (today !== lastReset) {
        await pool.query(
          'UPDATE user_api_keys SET used_today = 0, last_reset = CURRENT_DATE WHERE id = $1',
          [key.id]
        );
        key.used_today = 0;
      }
      
      return key;
    }
  } catch (error) {
    console.error(`Error fetching ${service} API key:`, error.message);
  }
  
  return null;
}

// Update gebruikt limiet
async function incrementApiUsage(userId, service) {
  if (!pool || !userId) return;
  
  try {
    await pool.query(
      `UPDATE user_api_keys 
       SET used_today = used_today + 1 
       WHERE user_id = $1 AND service = $2`,
      [userId, service]
    );
  } catch (error) {
    console.error('Error updating API usage:', error.message);
  }
}

// ============================================
// NIEUWE API ENDPOINTS VOOR GEBRUIKERS
// ============================================

// Registreer of haal user ID op
app.post('/api/user/register', async (req, res) => {
  try {
    let userId = req.headers['x-user-id'];
    const ip = req.ip;
    
    if (!userId && pool) {
      // Check of we deze IP al kennen
      const existing = await pool.query(
        'SELECT user_id FROM user_sessions WHERE ip_address = $1 ORDER BY last_active DESC LIMIT 1',
        [ip]
      );
      
      if (existing.rows.length > 0) {
        userId = existing.rows[0].user_id;
        await pool.query(
          'UPDATE user_sessions SET last_active = NOW() WHERE user_id = $1',
          [userId]
        );
      } else {
        // Maak nieuwe user
        userId = 'user_' + crypto.randomBytes(16).toString('hex');
        await pool.query(
          'INSERT INTO user_sessions (user_id, ip_address) VALUES ($1, $2)',
          [userId, ip]
        );
      }
    }
    
    res.json({ 
      success: true, 
      userId,
      message: 'User registered. Save this ID to add your own API keys.'
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sla Sendgrid API key op
app.post('/api/user/sendgrid/configure', async (req, res) => {
  const { userId, apiKey, dailyLimit = 100 } = req.body;
  
  if (!userId || !apiKey) {
    return res.status(400).json({ success: false, error: 'User ID and API key required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    // Test of de API key werkt (simpele check)
    try {
      const testResponse = await axios.get('https://api.sendgrid.com/v3/scopes', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 5000
      });
      
      if (!testResponse.data || testResponse.status !== 200) {
        throw new Error('Invalid API key');
      }
    } catch (testError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Sendgrid API key. Please check your key.' 
      });
    }
    
    // Sla op in database
    await pool.query(`
      INSERT INTO user_api_keys (user_id, service, api_key, daily_limit)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, service) 
      DO UPDATE SET 
        api_key = EXCLUDED.api_key, 
        daily_limit = EXCLUDED.daily_limit,
        is_active = TRUE,
        updated_at = NOW()
    `, [userId, 'sendgrid', apiKey, dailyLimit]);
    
    res.json({ 
      success: true, 
      message: 'Sendgrid configured successfully! You can now send up to ' + dailyLimit + ' emails per day.'
    });
  } catch (error) {
    console.error('Sendgrid configure error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sla Webshare API key op en haal proxies
app.post('/api/user/webshare/configure', async (req, res) => {
  const { userId, apiKey } = req.body;
  
  if (!userId || !apiKey) {
    return res.status(400).json({ success: false, error: 'User ID and API key required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    // Haal proxies op van Webshare
    let proxies = [];
    try {
      const response = await axios.get('https://proxy.webshare.io/api/proxy/list/', {
        headers: { 'Authorization': `Token ${apiKey}` },
        timeout: 10000
      });
      
      if (response.data && response.data.results) {
        proxies = response.data.results.map(proxy => ({
          server: `${proxy.proxy_address}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password,
          valid: true
        }));
      }
    } catch (apiError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Webshare API key or no proxies found.' 
      });
    }
    
    if (proxies.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No proxies found for this API key.' 
      });
    }
    
    // Test eerste proxy
    try {
      const testProxy = proxies[0];
      const testResponse = await axios.get('http://httpbin.org/ip', {
        proxy: {
          host: testProxy.server.split(':')[0],
          port: parseInt(testProxy.server.split(':')[1]),
          auth: {
            username: testProxy.username,
            password: testProxy.password
          }
        },
        timeout: 8000
      });
      
      console.log(`✅ Test proxy werkt - IP: ${testResponse.data.origin}`);
    } catch (proxyError) {
      console.log('⚠️ Proxy test failed, but saving anyway:', proxyError.message);
    }
    
    // Sla op in database
    await pool.query(`
      INSERT INTO user_api_keys (user_id, service, api_key, proxies)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (user_id, service) 
      DO UPDATE SET 
        api_key = EXCLUDED.api_key,
        proxies = EXCLUDED.proxies,
        is_active = TRUE,
        updated_at = NOW()
    `, [userId, 'webshare', apiKey, JSON.stringify(proxies)]);
    
    res.json({ 
      success: true, 
      message: `Webshare configured successfully! Found ${proxies.length} proxies.`,
      proxy_count: proxies.length
    });
  } catch (error) {
    console.error('Webshare configure error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Haal status van gebruikers API keys op
app.get('/api/user/keys/status', async (req, res) => {
  const userId = await getOrCreateUserId(req);
  
  if (!userId || !pool) {
    return res.json({ 
      success: true, 
      hasSendgrid: false,
      hasWebshare: false,
      usingDefault: true
    });
  }
  
  try {
    const result = await pool.query(
      'SELECT service, daily_limit, used_today FROM user_api_keys WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    
    const hasSendgrid = result.rows.some(r => r.service === 'sendgrid');
    const hasWebshare = result.rows.some(r => r.service === 'webshare');
    const sendgridUsage = result.rows.find(r => r.service === 'sendgrid');
    
    res.json({
      success: true,
      userId,
      hasSendgrid,
      hasWebshare,
      usingDefault: !hasSendgrid && !hasWebshare,
      sendgrid: sendgridUsage ? {
        limit: sendgridUsage.daily_limit,
        used: sendgridUsage.used_today,
        remaining: sendgridUsage.daily_limit - sendgridUsage.used_today
      } : null
    });
  } catch (error) {
    console.error('Error fetching key status:', error);
    res.json({ success: true, hasSendgrid: false, hasWebshare: false, usingDefault: true });
  }
});

// Verwijder API key
app.delete('/api/user/keys/:service', async (req, res) => {
  const userId = await getOrCreateUserId(req);
  const { service } = req.params;
  
  if (!userId || !pool) {
    return res.status(400).json({ success: false, error: 'User not found' });
  }
  
  try {
    await pool.query(
      'DELETE FROM user_api_keys WHERE user_id = $1 AND service = $2',
      [userId, service]
    );
    
    res.json({ success: true, message: `${service} key removed` });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AANGEPASTE GOOGLE MAPS SCRAPE MET OPTIONELE PROXY
// ============================================
app.post('/api/google-maps/scrape', async (req, res) => {
  try {
    const { url, maxResults = 20 } = req.body;
    if (!url || !url.includes('google.com/maps')) {
      return res.status(400).json({ success: false, error: 'Invalid Google Maps URL' });
    }
    
    // Haal user ID op
    const userId = await getOrCreateUserId(req);
    
    // Check 5 dagen limiet (alleen voor anonieme gebruikers)
    if (!userId && pool) {
      const ip = req.ip;
      const lastScan = await pool.query(
        `SELECT MAX(created_at) as last_scan FROM google_maps_scans 
         WHERE ip = $1 AND user_id IS NULL`,
        [ip]
      );
      
      if (lastScan.rows[0]?.last_scan) {
        const daysSinceLastScan = (Date.now() - new Date(lastScan.rows[0].last_scan)) / (1000 * 60 * 60 * 24);
        if (daysSinceLastScan < 5) {
          const daysRemaining = Math.ceil(5 - daysSinceLastScan);
          return res.status(429).json({ 
            success: false, 
            error: `Free scan limit reached. You can scan again in ${daysRemaining} days, or add your own Webshare API key for unlimited scans.`,
            days_remaining: daysRemaining,
            limit_type: 'free'
          });
        }
      }
    }
    
    console.log(`🗺️ Google Maps scrape: ${url} (User: ${userId || 'anonymous'})`);
    
    const browser = await getBrowser();
    if (!browser) {
      return res.status(500).json({ success: false, error: 'Puppeteer browser niet beschikbaar' });
    }
    
    // Krijg proxies van gebruiker (als die er zijn)
    let userProxies = [];
    let usedProxy = false;
    
    if (userId && pool) {
      const webshareKey = await getUserApiKey(userId, 'webshare');
      if (webshareKey && webshareKey.proxies) {
        userProxies = webshareKey.proxies;
        console.log(`🔑 User has ${userProxies.length} custom proxies`);
      }
    }
    
    // Maak een nieuwe pagina met anti-detectie
    const page = await browser.newPage();
    
    // ✅ ANTI-DETECTIE MAATREGELEN
    await page.setViewport({ 
      width: 1920 + Math.floor(Math.random() * 100), 
      height: 1080 + Math.floor(Math.random() * 100) 
    });
    
    // Random user agent
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // Verberg dat je een bot bent
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
      delete navigator.webdriver;
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    
    // Extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // ✅ GEBRUIK PROXY ALS BESCHIKBAAR
    if (userProxies.length > 0) {
      const proxy = userProxies[Math.floor(Math.random() * userProxies.length)];
      console.log(`🔄 Using user proxy: ${proxy.server}`);
      
      try {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password
        });
        usedProxy = true;
      } catch (proxyError) {
        console.log('⚠️ Proxy authentication failed, continuing without proxy');
      }
    }
    
    // Navigeer met langere timeout
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 90000
    });
    
    // Wacht tot de pagina geladen is
    await page.waitForTimeout(3000 + Math.random() * 2000);
    
    // Scroll langzaam en natuurlijk
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100 + Math.random() * 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200 + Math.random() * 200);
      });
    });
    
    // Wacht op resultaten
    try {
      await page.waitForSelector('[role="feed"]', { timeout: 30000 });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('⚠️ Geen feed gevonden, misschien andere structuur');
    }
    
    // Haal leads op
    const leads = await page.evaluate((maxResults) => {
      const businesses = [];
      
      const selectors = [
        '[role="feed"] > div > div',
        '.Nv2PK',
        '.THOPZb',
        '.lI9IFe',
        'div[data-place-id]'
      ];
      
      let items = [];
      for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          items = found;
          break;
        }
      }
      
      for (let i = 0; i < Math.min(items.length, maxResults); i++) {
        const item = items[i];
        
        const nameSelectors = ['.qBF1Pd', '.d4r55', '.fontHeadlineSmall', 'h3'];
        let name = null;
        for (const sel of nameSelectors) {
          const el = item.querySelector(sel);
          if (el) {
            name = el.textContent.trim();
            break;
          }
        }
        if (!name) continue;
        
        const websiteLink = item.querySelector('a[data-value="Website"], a[href^="http"]:not([href*="google.com"])');
        const website = websiteLink ? websiteLink.href : null;
        
        const phoneEl = item.querySelector('button[data-item-id*="phone"], a[href^="tel:"]');
        const phone = phoneEl ? (phoneEl.href ? phoneEl.href.replace('tel:', '') : phoneEl.textContent.trim()) : null;
        
        const addressEl = item.querySelector('button[data-item-id*="address"], .W4Efsd span');
        const address = addressEl ? addressEl.textContent.trim() : null;
        
        const ratingEl = item.querySelector('.MW4etd, .fontBodyMedium span[aria-hidden="true"]');
        const rating = ratingEl ? parseFloat(ratingEl.textContent.trim()) : null;
        
        const reviewsEl = item.querySelector('.UY7F9, .fontBodyMedium span:last-child');
        let reviews = null;
        if (reviewsEl) {
          const match = reviewsEl.textContent.trim().match(/(\d+)/);
          if (match) reviews = parseInt(match[0]);
        }
        
        businesses.push({
          name,
          category: 'SEO Agency',
          website,
          phone,
          address,
          rating,
          reviews,
          score: 0,
          status: 'new'
        });
      }
      
      return businesses;
    }, maxResults);
    
    await page.close();
    
    console.log(`✅ Found ${leads.length} businesses from Google Maps`);
    
    // Sla scan op in database
    if (pool) {
      await pool.query(
        `INSERT INTO google_maps_scans (user_id, ip, url, results_count, used_proxy, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId || null, req.ip, url, leads.length, usedProxy]
      );
    }
    
    // Bereken volgende scan datum
    const nextScanDate = new Date();
    nextScanDate.setDate(nextScanDate.getDate() + 5);
    
    res.json({
      success: true,
      leads: leads,
      stats: {
        total: leads.length,
        with_website: leads.filter(l => l.website).length,
        with_phone: leads.filter(l => l.phone).length
      },
      using_custom_proxy: usedProxy,
      scan_limit: userId ? null : {  // Geen limiet voor gebruikers met eigen API
        next_allowed_at: nextScanDate,
        days_remaining: 5,
        message: 'Add your own Webshare API key for unlimited scans'
      }
    });
    
  } catch (error) {
    console.error('Google Maps scrape error:', error);
    
    // Als error komt door proxy, geef duidelijke melding
    if (error.message.includes('proxy') || error.message.includes('authentication')) {
      return res.status(500).json({ 
        success: false, 
        error: 'Proxy error. Your Webshare API key might be invalid or expired.',
        proxy_error: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to scrape Google Maps: ' + error.message 
    });
  }
});

// ============================================
// NIEUW: SENDGRID EMAIL FUNCTIES
// ============================================

// Queue een email voor verzending
app.post('/api/email/queue', async (req, res) => {
  const { to_email, to_name, subject, template } = req.body;
  const userId = await getOrCreateUserId(req);
  
  if (!to_email || !to_email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO email_queue (user_id, to_email, to_name, subject, template, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [userId, to_email, to_name || null, subject || 'SEO Opportunity', template || 'default']
    );
    
    res.json({ 
      success: true, 
      message: 'Email queued for sending',
      queue_id: result.rows[0].id
    });
  } catch (error) {
    console.error('Error queueing email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verzend een email direct (als gebruiker Sendgrid heeft)
app.post('/api/email/send', async (req, res) => {
  const { to_email, to_name, subject, html } = req.body;
  const userId = await getOrCreateUserId(req);
  
  if (!to_email || !to_email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    // Haal Sendgrid key van gebruiker
    const sendgridKey = await getUserApiKey(userId, 'sendgrid');
    
    if (!sendgridKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'No Sendgrid API key found. Please add your key first.',
        needs_api_key: true
      });
    }
    
    // Check daily limit
    if (sendgridKey.used_today >= sendgridKey.daily_limit) {
      return res.status(429).json({ 
        success: false, 
        error: `Daily limit of ${sendgridKey.daily_limit} emails reached.`,
        limit_reached: true
      });
    }
    
    // Verzend via Sendgrid
    const emailData = {
      personalizations: [{ to: [{ email: to_email, name: to_name || '' }] }],
      from: { email: 'info@contentscale.site', name: 'ContentScale' },
      subject: subject || 'SEO Opportunity',
      content: [{ type: 'text/html', value: html || '<p>Test email</p>' }]
    };
    
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', emailData, {
      headers: {
        'Authorization': `Bearer ${sendgridKey.api_key}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 202) {
      // Update usage
      await incrementApiUsage(userId, 'sendgrid');
      
      res.json({ 
        success: true, 
        message: 'Email sent successfully',
        remaining: sendgridKey.daily_limit - sendgridKey.used_today - 1
      });
    } else {
      throw new Error('Sendgrid returned unexpected status');
    }
    
  } catch (error) {
    console.error('Error sending email:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Sendgrid API key. Please check your key.',
        invalid_key: true
      });
    }
    
    res.status(500).json({ success: false, error: error.message });
  }
});

// Haal email queue status op
app.get('/api/email/status', async (req, res) => {
  const userId = await getOrCreateUserId(req);
  
  if (!pool || !userId) {
    return res.json({ success: true, pending: 0, sent_today: 0 });
  }
  
  try {
    const [pending, sentToday, sendgridKey] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) FROM email_queue WHERE user_id = $1 AND status = $2',
        [userId, 'pending']
      ),
      pool.query(
        `SELECT COUNT(*) FROM email_queue 
         WHERE user_id = $1 AND status = $2 AND DATE(sent_at) = CURRENT_DATE`,
        [userId, 'sent']
      ),
      getUserApiKey(userId, 'sendgrid')
    ]);
    
    res.json({
      success: true,
      pending: parseInt(pending.rows[0].count),
      sent_today: parseInt(sentToday.rows[0].count),
      daily_limit: sendgridKey?.daily_limit || 0,
      has_sendgrid: !!sendgridKey
    });
  } catch (error) {
    console.error('Error fetching email status:', error);
    res.json({ success: true, pending: 0, sent_today: 0 });
  }
});

// ============================================
// BESTAANDE API ENDPOINTS (blijven hetzelfde)
// ============================================

app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });
  
  let scanUrl = url;
  if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
  if (!isValidUrl(scanUrl)) return res.status(400).json({ success: false, error: 'Invalid URL format' });
  
  try {
    console.log(`🔍 Scanning: ${scanUrl}`);
    const cacheKey = hashContent(scanUrl);
    const cached = scanCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`📦 Cache hit for ${scanUrl}`);
      return res.json(cached.result);
    }
    
    const browser = await getBrowser();
    if (!browser) {
      return res.status(500).json({ success: false, error: 'Puppeteer browser niet beschikbaar' });
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
    
    const scores = calculateStableScores(textContent, stats, rawHtml);
    const transparentScores = calculateTransparentScore(scores.graafScore, scores.craftScore, scores.technicalScore, stats);
    const totalScore = transparentScores.overall;
    const quality = transparentScores.quality;
    const recommendations = generateDetailedRecommendations(totalScore, {
      content: transparentScores.content_score,
      technical: transparentScores.technical_score,
      ux: transparentScores.ux_score
    }, wordCount, { hasFAQ: scores.hasFAQ || false }, rawHtml, stats);
    
    const quickWins = recommendations.filter(r => r.priority === 'HIGH').slice(0, 3);
    
    const result = {
      success: true,
      url: scanUrl,
      score: totalScore,
      quality,
      metrics: { 
        graaf: scores.graafScore, 
        craft: scores.craftScore, 
        technical: scores.technicalScore,
        content: transparentScores.content_score,
        ux: transparentScores.ux_score
      },
      breakdown: { category_scores: {
        technical: { raw: scores.technicalScore, max: 20, weighted: Math.round(scores.technicalScore / 20 * 100 * 0.4) },
        content: { raw_graaf: scores.graafScore, raw_craft: scores.craftScore, calculated: transparentScores.content_score, weighted: Math.round(transparentScores.content_score * 0.4) },
        ux: { score: transparentScores.ux_score, weighted: Math.round(transparentScores.ux_score * 0.2) }
      } },
      recommendations: { all: recommendations, quickWins },
      content_stats: stats,
      timestamp: new Date().toISOString()
    };
    
    scanCache.set(cacheKey, { timestamp: Date.now(), result });
    
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, content_score, ux_score, breakdown, recommendations, scan_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')`,
          [scanUrl, totalScore, quality, scores.graafScore, scores.craftScore, scores.technicalScore,
           transparentScores.content_score, transparentScores.ux_score,
           JSON.stringify(result.breakdown), JSON.stringify(result.recommendations)]
        );
      } catch (dbError) {
        console.error('DB save error:', dbError.message);
      }
    }
    
    console.log(`✅ Scan complete: ${scanUrl} - ${totalScore}/100 (${quality})`);
    res.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    
    const freelancersResult = await pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE');
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
    console.error('Leaderboard error:', error);
    res.json({ 
      success: true, 
      entries: [], 
      total: 0, 
      averageScore: 0,
      stats: {
        totalAgencies: 0,
        avgScore: 0,
        countriesCount: 0,
        activeHelpers: 0
      }
    });
  }
});

app.get('/api/freelancers', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, freelancers: [] });
  }
  
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
    
    res.json({ 
      success: true, 
      freelancers: result.rows 
    });
  } catch (error) {
    console.error('Freelancers error:', error);
    res.json({ success: true, freelancers: [] });
  }
});

app.post('/api/freelancers/register', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    const { name, email, title, location, country, bio, linkedin_url, hourly_rate, availability } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and email are required' 
      });
    }
    
    const existing = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
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
    res.status(500).json({ 
      success: false, 
      error: 'Registration failed' 
    });
  }
});

app.get('/api/blog', async (req, res) => {
  if (!pool) {
    return res.json({ success: true, posts: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
  }
  
  try {
    const { category, limit = 10, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT id, title, slug, excerpt, category, featured_image, featured_image_alt, author, 
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
    console.error('Blog error:', error);
    res.json({ 
      success: true, 
      posts: [], 
      pagination: { page: 1, limit: 10, total: 0, pages: 0 } 
    });
  }
});

app.get('/api/blog/:slug', async (req, res) => {
  if (!pool) {
    return res.status(404).json({ success: false, error: 'Blog post not found' });
  }
  
  try {
    const result = await pool.query(
      `SELECT * FROM blog_posts 
       WHERE slug = $1 AND status = 'published' AND published_at <= NOW()`,
      [req.params.slug]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Blog post not found' 
      });
    }
    
    await pool.query('UPDATE blog_posts SET views = views + 1 WHERE id = $1', [result.rows[0].id]);
    
    const images = await pool.query(
      'SELECT * FROM blog_images WHERE post_id = $1 ORDER BY position ASC',
      [result.rows[0].id]
    );
    
    const related = await pool.query(
      `SELECT id, title, slug, excerpt, featured_image, featured_image_alt, published_at
       FROM blog_posts 
       WHERE category = $1 AND id != $2 AND status = 'published' AND published_at <= NOW()
       ORDER BY published_at DESC LIMIT 3`,
      [result.rows[0].category, result.rows[0].id]
    );
    
    res.json({
      success: true,
      post: { ...result.rows[0], images: images.rows },
      related: related.rows
    });
  } catch (error) {
    console.error('Blog post error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load blog post' 
    });
  }
});

app.post('/api/claims/submit', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    const { business_name, business_url, contact_name, contact_email, contact_phone, verification_document } = req.body;
    
    if (!business_name || !business_url || !contact_name || !contact_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Required fields missing' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO claims 
       (business_name, business_url, contact_name, contact_email, contact_phone, verification_document)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [business_name, business_url, contact_name, contact_email, contact_phone, verification_document]
    );
    
    res.json({ 
      success: true, 
      message: 'Claim submitted successfully',
      id: result.rows[0].id 
    });
  } catch (error) {
    console.error('Claim submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit claim' });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
  }
  
  if (!pool) {
    console.error('❌ Login poging maar database niet beschikbaar');
    return res.status(503).json({ 
      success: false, 
      error: 'Database niet beschikbaar. Controleer of PostgreSQL draait.',
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

app.post('/api/admin/verify-session', verifyAdmin, async (req, res) => {
  res.json({ valid: true, admin: req.admin.username });
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  if (!pool) {
    return res.json({ success: true, stats: { 
      total_scans: 0, total_agencies: 0, total_clients: 0, active_helpers: 0,
      leaderboard_entries: 0, blog_posts: 0, active_share_links: 0,
      pending_claims: 0, pending_freelancers: 0, pending_leaderboard: 0
    }});
  }
  
  try {
    const [scans, leaderboard, freelancers, blogPosts, shareLinks, claims, pendingFreelancers, pendingLeaderboard] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM scans').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE is_opted_out = FALSE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM blog_posts').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM share_links WHERE is_active = TRUE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM claims WHERE status = $1', ['pending']).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = FALSE').catch(() => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM leaderboard WHERE admin_verified = FALSE').catch(() => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_scans: parseInt(scans.rows[0].count) || 0,
        total_agencies: parseInt(leaderboard.rows[0].count) || 0,
        total_clients: parseInt(scans.rows[0].count) || 0,
        active_helpers: parseInt(freelancers.rows[0].count) || 0,
        leaderboard_entries: parseInt(leaderboard.rows[0].count) || 0,
        blog_posts: parseInt(blogPosts.rows[0].count) || 0,
        active_share_links: parseInt(shareLinks.rows[0].count) || 0,
        pending_claims: parseInt(claims.rows[0].count) || 0,
        pending_freelancers: parseInt(pendingFreelancers.rows[0].count) || 0,
        pending_leaderboard: parseInt(pendingLeaderboard.rows[0].count) || 0
      }
    });
  } catch (error) {
    res.json({ 
      success: true, 
      stats: { 
        total_scans: 0,
        total_agencies: 0,
        total_clients: 0,
        leaderboard_entries: 0,
        active_helpers: 0,
        blog_posts: 0,
        active_share_links: 0,
        pending_claims: 0,
        pending_freelancers: 0,
        pending_leaderboard: 0
      } 
    });
  }
});

// ============================================
// ✅ FREELANCERS MANAGEMENT ENDPOINTS - TOEGEVOEGD
// ============================================

// ✅ ALLE FREELANCERS (voor admin)
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

// ✅ PENDING FREELANCERS (voor admin)
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

// ✅ FREELANCER GOEDKEUREN
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

// ✅ FREELANCER AFWIJZEN/VERWIJDEREN
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

// ✅ FREELANCER BEWERKEN
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

// ✅ FREELANCER FEATURE TOGGLE
app.post('/api/admin/freelancers/:id/feature', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { is_featured } = req.body;
    await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [is_featured, id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Feature toggle error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FREELANCER DEACTIVEREN
app.post('/api/admin/freelancers/:id/deactivate', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('UPDATE freelancers SET is_approved = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate freelancer error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FREELANCER TOGGLE FEATURED (specifiek voor toggle functie)
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

// ✅ FREELANCER BULK DELETE
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

// ============================================
// ✅ NIEUWE ADMIN ENDPOINTS VOOR LEADERBOARD
// ============================================

// ✅ PENDING LEADERBOARD (voor goedkeuring)
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

// ✅ LEADERBOARD GOEDKEUREN
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

// ✅ LEADERBOARD AFWIJZEN
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

// ✅ LEADERBOARD BEWERKEN (voor bestaande entries)
app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { id } = req.params;
    const { company_name, url, score, country, city } = req.body;
    
    // Bouw de update query dynamisch
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
      values.push(score);
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
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry niet gevonden' });
    }
    
    res.json({ 
      success: true, 
      message: 'Leaderboard entry bijgewerkt',
      entry: result.rows[0]
    });
  } catch (error) {
    console.error('Update leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ LEADERBOARD HANDMATIG TOEVOEGEN
app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    const { url, company_name, score, country, city } = req.body;
    
    if (!url || !score) {
      return res.status(400).json({ success: false, error: 'URL and score are required' });
    }
    
    // Check of URL al bestaat
    const existing = await pool.query('SELECT id FROM leaderboard WHERE url = $1', [url]);
    
    if (existing.rows.length === 0) {
      // Nieuwe entry
      const result = await pool.query(
        `INSERT INTO leaderboard 
         (url, company_name, score, country, city, admin_verified, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [url, company_name || null, score, country || 'NL', city || null, true, true]
      );
      
      res.json({
        success: true,
        action: 'added',
        id: result.rows[0].id,
        message: 'Entry added to leaderboard'
      });
    } else {
      // Update bestaande
      await pool.query(
        `UPDATE leaderboard SET 
           score = $1,
           company_name = COALESCE($2, company_name),
           country = COALESCE($3, country),
           city = COALESCE($4, city),
           admin_verified = true,
           is_verified = true
         WHERE url = $5`,
        [score, company_name || null, country || null, city || null, url]
      );
      
      res.json({
        success: true,
        action: 'updated',
        id: existing.rows[0].id,
        message: 'Leaderboard entry updated'
      });
    }
  } catch (error) {
    console.error('Manual leaderboard add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ LEADERBOARD VERWIJDEREN
app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ LEADERBOARD BULK DELETE
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

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog-post.html'));
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
    cache_entries: scanCache.size,
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
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================
async function startServer() {
  console.log('');
  console.log('🚀 =====================================');
  console.log('🚀  CONTENTSCALE SERVER STARTEN');
  console.log('🚀 =====================================');
  console.log('');
  
  const dbConnected = await waitForDatabase();
  
  app.listen(PORT, () => {
    console.log('');
    console.log(`📍 Server gestart op http://localhost:${PORT}`);
    console.log(`📍 Admin:     http://localhost:${PORT}/admin`);
    console.log(`📍 Blog:      http://localhost:${PORT}/blog`);
    console.log('');
    console.log(`📊 Database status: ${dbConnected ? '✅ Verbonden' : '❌ NIET VERBONDEN'}`);
    console.log(`🔐 Admin login:     ${dbConnected ? '✅ Werkend (ot/admin123)' : '❌ Niet beschikbaar'}`);
    console.log('');
    console.log('🔑 NIEUW: Gebruikers kunnen eigen API keys toevoegen:');
    console.log('   • Sendgrid - voor emails (100/dag gratis)');
    console.log('   • Webshare - voor 10 gratis proxies');
    console.log('');
    console.log('📋 ADMIN ENDPOINTS:');
    console.log('   • Freelancers management (8 endpoints)');
    console.log('   • Leaderboard management (7 endpoints)');
    console.log('');
    
    if (!dbConnected) {
      console.log('⚠️  WAARSCHUWING: Database niet verbonden!');
      console.log('   Admin login werkt NIET. Controleer PostgreSQL.');
      console.log('');
    }
    
    console.log('🌐 Puppeteer: Browser instance ready');
    console.log('📦 Cache: Active (24h TTL)');
    console.log('');
  });
}

// ============================================
// SCORING FUNCTIES (blijven hetzelfde)
// ============================================

function calculateStableScores(content, stats, rawHtml) {
  const { wordCount = 0, h1Count = 0, h2Count = 0, h3Count = 0, listCount = 0 } = stats;
  
  function detectFAQ(html, text) {
    const faqPatterns = [
      /<h[1-6][^>]*>.*?(faq|frequently asked|questions|vraag|antwoord|veelgestelde).*?<\/h[1-6]>/gi,
      /"@type"\s*:\s*"FAQPage"/gi,
      /<details>/gi,
      /<summary>/gi,
      /class="(accordion|collapse|faq|qa-|faq-|vraag|antwoord)/gi,
      /veelgestelde vragen/gi,
      /vaak gestelde vragen/gi
    ];
    
    let faqScore = 0;
    const combined = html + ' ' + text;
    
    faqPatterns.forEach(pattern => {
      const matches = combined.match(pattern);
      if (matches) {
        faqScore += matches.length;
      }
    });
    
    return {
      hasFAQ: faqScore >= 2,
      faqScore: faqScore
    };
  }
  
  const faqDetection = detectFAQ(rawHtml, content);
  
  let graafScore = 0;
  const graafItems = {};
  
  let credibility = 0;
  const hasAuthor = /by\s+\w+|author:|written\s+by|contributor/i.test(content);
  const hasQuotes = /["']|says|according|explains|notes/i.test(content);
  const hasExpert = /expert|specialist|professional|certified/i.test(content);
  credibility += hasAuthor ? 6 : 0;
  credibility += hasQuotes ? 5 : 0;
  credibility += hasExpert ? 5 : 0;
  graafItems.credibility = Math.min(16, credibility);
  
  const relevance = Math.min(18, Math.floor(wordCount / 55));
  graafItems.relevance = relevance;
  
  let accuracy = 0;
  const hasStats = /\d+%|\d+\s+of|\d+\s+out\s+of|\d+\s+studies|\d+\s+research/i.test(content);
  const hasSources = /source:|reference:|according to|study by/i.test(content);
  accuracy += hasStats ? 4 : 0;
  accuracy += hasSources ? 4 : 0;
  graafItems.accuracy = Math.min(8, accuracy);
  
  let freshness = 0;
  const currentYear = new Date().getFullYear();
  const yearRegex = new RegExp(`20[2-9][0-9]|${currentYear}|${currentYear-1}`, 'gi');
  const hasRecentDate = yearRegex.test(content);
  freshness += hasRecentDate ? 6 : 2;
  graafItems.freshness = Math.min(8, freshness);
  
  graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
  
  let craftScore = 0;
  const craftItems = {};
  
  const headingStructure = h1Count === 1 ? 8 : h1Count > 1 ? 4 : 2;
  craftItems.headingStructure = headingStructure;
  
  const subheadings = Math.min(10, (h2Count * 2) + (h3Count * 1));
  craftItems.subheadings = subheadings;
  
  const paragraphs = Math.min(8, Math.floor(wordCount / 125));
  craftItems.paragraphs = paragraphs;
  
  const lists = listCount >= 3 ? 4 : listCount >= 1 ? 2 : 0;
  craftItems.lists = lists;
  
  craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
  
  let technicalScore = 0;
  
  const metaDescMatch = rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
  technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;
  
  const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : null;
  technicalScore += title && title.length > 30 ? 4 : title ? 2 : 0;
  
  const allImages = (rawHtml.match(/<img[^>]*>/gi) || []).length;
  const imagesWithAlt = (rawHtml.match(/<img[^>]*alt="/gi) || []).length;
  if (allImages > 0) {
    const imageScore = Math.floor((imagesWithAlt / allImages) * 4);
    technicalScore += Math.min(4, imageScore);
  }
  
  const hasViewport = /<meta\s+name="viewport"/gi.test(rawHtml);
  technicalScore += hasViewport ? 3 : 0;
  
  const hasSchema = /"@context"|"@type"/gi.test(rawHtml);
  technicalScore += hasSchema ? 3 : 0;
  
  if (faqDetection.hasFAQ) {
    technicalScore += 2;
  }
  
  const totalScore = graafScore + craftScore + technicalScore;
  
  return {
    graafScore,
    craftScore,
    technicalScore,
    totalScore,
    graafItems,
    craftItems,
    hasFAQ: faqDetection.hasFAQ,
    faqScore: faqDetection.faqScore
  };
}

function calculateTransparentScore(graafScore, craftScore, technicalScore, stats) {
  const contentScore = Math.round(
    (graafScore / 50 * 100 * 0.6) +
    (craftScore / 30 * 100 * 0.4)
  );

  function getUXScore(stats) {
    let ux = 70;
    if (stats.h1Count === 1) ux += 10;
    if (stats.h2Count >= 2) ux += 10;
    if (stats.h3Count >= 3) ux += 5;
    if (stats.listCount >= 3) ux += 5;
    if (stats.wordCount > 800) ux += 10;
    else if (stats.wordCount < 300) ux -= 20;
    return Math.min(100, Math.max(0, ux));
  }
  
  const uxScore = getUXScore(stats);
  
  const overall = Math.round(
    (technicalScore / 20 * 100 * 0.4) +
    (contentScore * 0.4) +
    (uxScore * 0.2)
  );
  
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
    quality: getQuality(overall)
  };
}

function generateDetailedRecommendations(score, metrics, wordCount, scanData, rawHtml, stats) {
  const recs = [];
  
  const images = rawHtml.match(/<img[^>]*>/gi) || [];
  const imagesWithAlt = images.filter(img => img.includes('alt=') && !img.includes('alt=""'));
  const imagesWithoutAlt = images.filter(img => !img.includes('alt=') || img.includes('alt=""'));
  
  if (imagesWithoutAlt.length > 0) {
    const percentage = Math.round((imagesWithoutAlt.length / images.length) * 100);
    const examples = imagesWithoutAlt.slice(0, 3).map(img => {
      const srcMatch = img.match(/src=["']([^"']*)["']/);
      return srcMatch ? srcMatch[1].split('/').pop() : 'afbeelding';
    }).join(', ');
    
    recs.push({
      priority: percentage > 30 ? 'HIGH' : 'MEDIUM',
      title: 'Optimize Images',
      impact: 7,
      effort: 'Medium (2-3 hours)',
      cost: '€100-200',
      description: `${imagesWithoutAlt.length} of ${images.length} images (${percentage}%) missing alt text. Examples: ${examples}. Add descriptive alt text for better accessibility and SEO.`
    });
  }

  const metaDescMatch = rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
  
  if (!metaDesc) {
    recs.push({
      priority: 'HIGH',
      title: 'Add Meta Description',
      impact: 8,
      effort: 'Low (15 min)',
      cost: '€50-75',
      description: 'No meta description found. Essential for click-through rates in search results.'
    });
  } else if (metaDesc.length < 120) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Improve Meta Description',
      impact: 6,
      effort: 'Low (15 min)',
      cost: '€50-75',
      description: `Meta description too short (${metaDesc.length} chars). Minimum 120 recommended for optimal CTR.`
    });
  }

  const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : null;
  
  if (!title) {
    recs.push({
      priority: 'HIGH',
      title: 'Add Title Tag',
      impact: 10,
      effort: 'Low (15 min)',
      cost: '€50-75',
      description: 'No title tag found. This is the most important SEO element.'
    });
  } else if (title.length < 30) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Improve Title Tag',
      impact: 7,
      effort: 'Low (15 min)',
      cost: '€50-75',
      description: `Title too short (${title.length} chars). Minimum 30 recommended for good visibility.`
    });
  } else if (title.length > 60) {
    recs.push({
      priority: 'LOW',
      title: 'Shorten Title Tag',
      impact: 5,
      effort: 'Low (15 min)',
      cost: '€50-75',
      description: `Title too long (${title.length} chars). Maximum 60 recommended for full display in search results.`
    });
  }

  const h1Count = stats?.h1Count || 0;
  const h2Count = stats?.h2Count || 0;
  
  if (h1Count === 0) {
    recs.push({
      priority: 'HIGH',
      title: 'Add H1 Heading',
      impact: 9,
      effort: 'Low (30 min)',
      cost: '€75-100',
      description: 'No H1 tag found. Every page needs exactly one H1 for proper structure.'
    });
  } else if (h1Count > 1) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Fix Multiple H1 Headings',
      impact: 6,
      effort: 'Low (30 min)',
      cost: '€75-100',
      description: `${h1Count} H1 tags found. Ideally a page has exactly one H1.`
    });
  }
  
  if (h2Count < 2) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add More H2 Headings',
      impact: 5,
      effort: 'Medium (1-2 hours)',
      cost: '€100-150',
      description: `Only ${h2Count} H2 headings found. Add more structure with 3-7 H2 sections.`
    });
  }

  const hasSchema = rawHtml.includes('"@context"') || rawHtml.includes('application/ld+json');
  const hasFAQSchema = rawHtml.includes('"@type":"FAQPage"');
  const hasArticleSchema = rawHtml.includes('"@type":"Article"');
  const hasOrganizationSchema = rawHtml.includes('"@type":"Organization"');
  
  if (!hasSchema) {
    recs.push({
      priority: 'HIGH',
      title: 'Implement Schema Markup',
      impact: 12,
      effort: 'Medium (2-4 hours)',
      cost: '€150-250',
      description: 'No schema markup found. Add Article/FAQ/Organization schema for better SERP visibility.'
    });
  } else {
    if (!hasArticleSchema) {
      recs.push({
        priority: 'MEDIUM',
        title: 'Add Article Schema',
        impact: 8,
        effort: 'Low (1-2 hours)',
        cost: '€100-150',
        description: 'You have some schema, but Article schema is missing for better content visibility.'
      });
    }
    if (!hasFAQSchema && scanData?.hasFAQ) {
      recs.push({
        priority: 'MEDIUM',
        title: 'Add FAQ Schema',
        impact: 8,
        effort: 'Low (1-2 hours)',
        cost: '€100-150',
        description: 'FAQ section detected but FAQ schema missing. Add for rich results in search.'
      });
    }
  }

  if (wordCount < 500) {
    recs.push({
      priority: 'HIGH',
      title: 'Expand Content Depth',
      impact: 10,
      effort: 'High (6-8 hours)',
      cost: '€300-500',
      description: `Only ${wordCount} words. Expand to 2500+ words for comprehensive coverage.`
    });
  } else if (wordCount < 1500) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Increase Content Length',
      impact: 8,
      effort: 'Medium (4-6 hours)',
      cost: '€200-350',
      description: `Current: ${wordCount} words. Aim for 2500+ words for in-depth coverage.`
    });
  } else if (wordCount < 2500) {
    recs.push({
      priority: 'LOW',
      title: 'Expand Content',
      impact: 6,
      effort: 'Medium (3-5 hours)',
      cost: '€150-250',
      description: `Good start with ${wordCount} words. 2500+ words recommended for optimal depth.`
    });
  }

  const textContent = rawHtml.replace(/<[^>]*>/g, ' ');
  
  const hasAuthor = /by\s+\w+|author:|written\s+by|contributor/i.test(textContent);
  const hasQuotes = /["']|says|according|explains|notes/i.test(textContent);
  const hasStats = /\d+%|\d+\s+of|\d+\s+out\s+of|\d+\s+studies|\d+\s+research/i.test(textContent);
  const hasSources = /source:|reference:|according to|study by/i.test(textContent);
  const hasRecentDate = /202[3-5]|2025/i.test(textContent);
  
  if (!hasAuthor && metrics.content < 70) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add Author Credentials',
      impact: 8,
      effort: 'Low (1-2 hours)',
      cost: '€75-150',
      description: 'No author attribution found. Add author bio with credentials for E-E-A-T.'
    });
  }
  
  if (!hasQuotes && !hasStats) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add Expert Quotes & Statistics',
      impact: 9,
      effort: 'Medium (3-5 hours)',
      cost: '€150-250',
      description: 'Missing expert quotes and statistics. Add 3-5 quotes and 5-8 statistics with sources.'
    });
  }
  
  if (!hasSources) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Add Source Citations',
      impact: 7,
      effort: 'Medium (2-4 hours)',
      cost: '€100-200',
      description: 'No sources cited. Add references for all statistics and claims.'
    });
  }
  
  if (!hasRecentDate) {
    recs.push({
      priority: 'LOW',
      title: 'Update Content Freshness',
      impact: 6,
      effort: 'Medium (2-3 hours)',
      cost: '€100-175',
      description: 'No recent dates found. Add 2024-2025 data and references.'
    });
  }

  const hasFAQ = scanData?.hasFAQ || false;
  const faqQuestions = (textContent.match(/\?/g) || []).length;
  
  if (!hasFAQ && faqQuestions > 5) {
    recs.push({
      priority: 'HIGH',
      title: 'Add FAQ Section',
      impact: 8,
      effort: 'Low (2-3 hours)',
      cost: '€100-175',
      description: `${faqQuestions} questions detected but no FAQ section. Add 8-12 FAQ items with schema markup.`
    });
  } else if (!hasFAQ && metrics.content > 70) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Consider Adding FAQ Section',
      impact: 6,
      effort: 'Low (2-3 hours)',
      cost: '€100-175',
      description: 'FAQ section missing. Add 8-12 common questions with answers to capture AI Overview opportunities.'
    });
  }

  if (score < 70) {
    recs.push({
      priority: 'HIGH',
      title: 'Optimize Page Speed',
      impact: 9,
      effort: 'Medium (3-5 hours)',
      cost: '€200-400',
      description: 'Low score may indicate slow loading. Reduce load time to <2s via image compression, lazy loading and CDN.'
    });
  } else if (score < 85) {
    recs.push({
      priority: 'MEDIUM',
      title: 'Improve Page Speed',
      impact: 7,
      effort: 'Medium (3-5 hours)',
      cost: '€200-400',
      description: 'Optimize images, enable lazy loading, and consider CDN for faster performance.'
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'LOW',
      title: 'Minor Optimizations Possible',
      impact: 5,
      effort: 'Low (1-2 hours)',
      cost: '€50-100',
      description: 'Your content scores well. Consider fine-tuning images, adding internal links, or updating statistics.'
    });
  }

  return recs.sort((a, b) => b.impact - a.impact).slice(0, 8);
}

startServer();
