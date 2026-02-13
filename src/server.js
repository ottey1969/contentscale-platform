const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');
console.log('📁 Current directory:', process.cwd());
console.log('📁 Public path:', path.join(process.cwd(), 'public'));

let dbConfig;
let pool;

function initDatabaseConfig() {
  if (process.env.DATABASE_URL) {
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

// ✅ FIXED: Gebruik process.cwd() in plaats van __dirname
app.use(express.static(path.join(process.cwd(), 'public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  immutable: true
}));

app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

const verifyAdmin = async (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) return res.status(401).json({ success: false, error: 'Admin authentication required' });
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const result = await pool.query('SELECT * FROM super_admins WHERE id = $1 AND is_active = TRUE', [adminKey]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
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
        '--disable-gpu'
      ],
      timeout: 30000
    }).catch(err => {
      console.error('❌ Puppeteer launch error:', err.message);
      return null;
    });
    if (browserInstance) console.log('✅ Puppeteer browser ready');
    else console.log('❌ Puppeteer browser failed to start');
  }
  return browserInstance;
}

process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
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
    
    await client.query(`DELETE FROM super_admins WHERE username = 'ot'`);
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    await client.query(
      `INSERT INTO super_admins (username, password_hash, full_name, role, is_active, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      ['ot', hashedPassword, 'Super Administrator', 'super_admin', true]
    );
    console.log('✅✅✅ ADMIN AANGEMAAKT: ot / admin123');
    
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
    
    console.log('✅ Alle database tabellen gereed');
    
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
  } finally {
    if (client) client.release();
  }
}

// ==========================================
// SCORE CALCULATIE FUNCTIES
// ==========================================
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
      if (matches) faqScore += matches.length;
    });
    
    return { hasFAQ: faqScore >= 2, faqScore };
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
  
  if (faqDetection.hasFAQ) technicalScore += 2;
  
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

function generateDetailedRecommendations(score, metrics, wordCount, scanData) {
  const recs = [];
  
  if (metrics.content < 45) {
    recs.push({
      priority: 'HIGH',
      title: 'Add Author Credentials',
      impact: 8,
      effort: 'Low (1-2 hours)',
      cost: '€75-150',
      description: 'Add author bio with credentials and expertise for E-E-A-T'
    });
  }
  
  if (wordCount < 2000) {
    recs.push({
      priority: wordCount < 1500 ? 'HIGH' : 'MEDIUM',
      title: 'Expand Content Depth',
      impact: wordCount < 1500 ? 10 : 6,
      effort: 'Medium (4-6 hours)',
      cost: '€200-350',
      description: `Increase from ${wordCount} to 2000+ words with in-depth coverage`
    });
  }
  
  if (metrics.technical < 16) {
    recs.push({
      priority: 'HIGH',
      title: 'Implement Schema Markup',
      impact: 12,
      effort: 'Medium (2-4 hours)',
      cost: '€150-250',
      description: 'Add Article/FAQ/Organization schema for better SERP visibility'
    });
  }
  
  const hasFAQ = scanData?.hasFAQ || false;
  
  if (!hasFAQ) {
    recs.push({
      priority: 'HIGH',
      title: 'Add FAQ Section',
      impact: 8,
      effort: 'Low (2-3 hours)',
      cost: '€100-175',
      description: 'Answer 8-12 common questions with FAQ schema markup to capture AI Overview opportunities'
    });
  }
  
  if (score < 80) {
    recs.push({
      priority: score < 70 ? 'HIGH' : 'MEDIUM',
      title: 'Optimize Page Speed',
      impact: 9,
      effort: 'Medium (3-5 hours)',
      cost: '€200-400',
      description: 'Reduce load time to <2s via image compression, lazy loading and CDN'
    });
  }
  
  recs.push({
    priority: 'MEDIUM',
    title: 'Optimize Images',
    impact: 7,
    effort: 'Medium (2-3 hours)',
    cost: '€100-200',
    description: 'Add alt-text, compress images and use WebP format'
  });
  
  return recs.sort((a, b) => b.impact - a.impact).slice(0, 8);
}

// ==========================================
// API ROUTES
// ==========================================
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
    if (!browser) return res.status(500).json({ success: false, error: 'Puppeteer browser niet beschikbaar' });
    
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
    }, wordCount, { hasFAQ: scores.hasFAQ || false });
    
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

app.post('/api/google-maps/scrape', async (req, res) => {
  try {
    const { url, maxResults = 20 } = req.body;
    if (!url || !url.includes('google.com/maps')) {
      return res.status(400).json({ success: false, error: 'Invalid Google Maps URL' });
    }
    
    console.log(`🗺️ Google Maps scrape: ${url}`);
    const browser = await getBrowser();
    if (!browser) return res.status(500).json({ success: false, error: 'Puppeteer browser niet beschikbaar' });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {});
    
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const leads = await page.evaluate((maxResults) => {
      const businesses = [];
      const items = document.querySelectorAll('[role="feed"] > div > div, .Nv2PK, .THOPZb, .lI9IFe');
      for (let i = 0; i < Math.min(items.length, maxResults); i++) {
        const item = items[i];
        const nameEl = item.querySelector('.qBF1Pd, .d4r55, .fontHeadlineSmall, h3');
        const name = nameEl ? nameEl.textContent.trim() : null;
        if (!name) continue;
        
        businesses.push({
          name,
          category: item.querySelector('.W4Efsd:not(.ZlAx9e), .YvY7kb, .Ahnjwc')?.textContent?.trim() || 'Business',
          website: item.querySelector('a[data-value="Website"], a[href^="http"]:not([href*="google.com"])')?.href || null,
          phone: (() => {
            const el = item.querySelector('button[data-item-id*="phone"], a[href^="tel:"]');
            return el ? (el.href ? el.href.replace('tel:', '') : el.textContent.trim()) : null;
          })(),
          address: item.querySelector('button[data-item-id*="address"], .W4Efsd span')?.textContent?.trim() || null,
          rating: (() => {
            const el = item.querySelector('.MW4etd, .fontBodyMedium span[aria-hidden="true"]');
            return el ? parseFloat(el.textContent.trim()) : null;
          })(),
          reviews: (() => {
            const el = item.querySelector('.UY7F9, .fontBodyMedium span:last-child');
            if (el) {
              const match = el.textContent.trim().match(/(\d+)/);
              return match ? parseInt(match[0]) : null;
            }
            return null;
          })(),
          score: 0,
          status: 'new'
        });
      }
      return businesses;
    }, maxResults);
    
    await page.close();
    console.log(`✅ Found ${leads.length} businesses from Google Maps`);
    
    const savedLeads = [];
    
    if (pool) {
      for (const lead of leads) {
        try {
          let websiteScore = 0;
          let verifiedWebsite = lead.website;
          
          if (lead.website) {
            try {
              const websitePage = await browser.newPage();
              websitePage.setDefaultTimeout(5000);
              const response = await websitePage.goto(lead.website, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
              if (response && response.ok()) {
                websiteScore = 75;
                const content = await websitePage.content().catch(() => '');
                if (content) {
                  if (content.includes('<title>')) websiteScore += 5;
                  if (content.includes('meta name="description"')) websiteScore += 5;
                  if (content.includes('<h1')) websiteScore += 5;
                  if (content.includes('schema.org') || content.includes('@context')) websiteScore += 10;
                }
              }
              await websitePage.close();
            } catch (websiteError) {
              console.log(`⚠️ Website not accessible: ${lead.website}`);
              verifiedWebsite = null;
              websiteScore = 0;
            }
          }
          
          const result = await pool.query(
            `INSERT INTO google_maps_leads (name, category, website, phone, address, rating, reviews, score, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [lead.name, lead.category, verifiedWebsite, lead.phone, lead.address, lead.rating, lead.reviews, websiteScore, lead.status]
          );
          
          savedLeads.push({ ...lead, website: verifiedWebsite, score: websiteScore, id: result.rows[0].id });
        } catch (dbError) {
          console.error('DB insert error:', dbError.message);
        }
      }
    }
    
    res.json({
      success: true,
      leads: savedLeads.length > 0 ? savedLeads : leads,
      stats: {
        total: savedLeads.length || leads.length,
        with_website: (savedLeads.length > 0 ? savedLeads : leads).filter(l => l.website).length,
        with_phone: (savedLeads.length > 0 ? savedLeads : leads).filter(l => l.phone).length,
        avg_score: savedLeads.length > 0 
          ? Math.round(savedLeads.reduce((sum, l) => sum + l.score, 0) / savedLeads.length) 
          : 0
      }
    });
  } catch (error) {
    console.error('Google Maps scrape error:', error);
    res.status(500).json({ success: false, error: 'Failed to scrape Google Maps: ' + error.message });
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
    if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' });
    
    const existing = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already registered' });
    
    const result = await pool.query(
      `INSERT INTO freelancers (name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_approved) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) RETURNING id`,
      [name, email, title || null, location || null, country || null, bio || null, 
       linkedin_url || null, hourly_rate || null, availability || null]
    );
    
    res.json({ success: true, message: 'Application submitted! We will review and approve soon.', id: result.rows[0].id });
  } catch (error) {
    console.error('Freelancer registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.post('/api/admin/verify-session', verifyAdmin, async (req, res) => {
  res.json({ valid: true, admin: req.admin.username });
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, stats: { 
    total_scans: 0, total_agencies: 0, total_clients: 0, active_helpers: 0,
    leaderboard_entries: 0, blog_posts: 0, active_share_links: 0,
    pending_claims: 0, pending_freelancers: 0, pending_leaderboard: 0
  }});
  
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
    res.json({ success: true, stats: { 
      total_scans: 0, total_agencies: 0, total_clients: 0, active_helpers: 0,
      leaderboard_entries: 0, blog_posts: 0, active_share_links: 0,
      pending_claims: 0, pending_freelancers: 0, pending_leaderboard: 0
    }});
  }
});

app.get('/api/admin/leaderboard', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, entries: [] });
  try {
    const result = await pool.query(`SELECT * FROM leaderboard WHERE admin_verified = TRUE ORDER BY score DESC LIMIT 200`);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.json({ success: true, entries: [] });
  }
});

app.get('/api/admin/leaderboard/pending', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, pending: [] });
  try {
    const result = await pool.query(`SELECT * FROM leaderboard WHERE admin_verified = FALSE ORDER BY created_at DESC LIMIT 50`);
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    res.json({ success: true, pending: [] });
  }
});

app.post('/api/admin/leaderboard/:id/approve', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { final_country } = req.body;
    await pool.query(
      `UPDATE leaderboard SET admin_verified = TRUE, country = COALESCE($2, country), is_verified = TRUE WHERE id = $1`,
      [id, final_country]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/:id/reject', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/scan-and-add', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const { url, company_name, country, city, type = 'seo_agency' } = req.body;
  
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });
  
  let scanUrl = url;
  if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
  if (!isValidUrl(scanUrl)) return res.status(400).json({ success: false, error: 'Invalid URL format' });
  
  try {
    console.log(`👑 ADMIN SCAN for leaderboard: ${scanUrl}`);
    
    const browser = await getBrowser();
    if (!browser) return res.status(500).json({ success: false, error: 'Puppeteer browser niet beschikbaar' });
    
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
    
    await pool.query(
      `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, content_score, ux_score, scan_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'admin_leaderboard')`,
      [scanUrl, totalScore, quality, scores.graafScore, scores.craftScore, scores.technicalScore,
       transparentScores.content_score, transparentScores.ux_score]
    );
    
    const existing = await pool.query('SELECT id FROM leaderboard WHERE url = $1', [scanUrl]);
    
    let leaderboardEntry;
    
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO leaderboard (url, company_name, score, country, city, type, admin_verified, is_verified, graaf_score, craft_score, technical_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [scanUrl, company_name || null, totalScore, country || 'NL', city || null, type, true, true,
         scores.graafScore, scores.craftScore, scores.technicalScore]
      );
      leaderboardEntry = { id: result.rows[0].id, action: 'added' };
      console.log(`👑 Admin added to leaderboard: ${scanUrl} (score: ${totalScore})`);
    } else {
      await pool.query(
        `UPDATE leaderboard SET 
           score = $1, company_name = COALESCE($2, company_name), country = COALESCE($3, country),
           city = COALESCE($4, city), type = COALESCE($5, type), admin_verified = true,
           is_verified = true, graaf_score = $6, craft_score = $7, technical_score = $8
         WHERE url = $9`,
        [totalScore, company_name || null, country || null, city || null, type,
         scores.graafScore, scores.craftScore, scores.technicalScore, scanUrl]
      );
      leaderboardEntry = { id: existing.rows[0].id, action: 'updated' };
      console.log(`👑 Admin updated leaderboard: ${scanUrl} (score: ${totalScore})`);
    }
    
    res.json({
      success: true,
      admin_action: leaderboardEntry.action,
      leaderboard_id: leaderboardEntry.id,
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
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Admin leaderboard scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { url, company_name, score, country, city, type } = req.body;
    if (!url || !score) return res.status(400).json({ success: false, error: 'URL and score are required' });
    
    const existing = await pool.query('SELECT id FROM leaderboard WHERE url = $1', [url]);
    
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO leaderboard (url, company_name, score, country, city, type, admin_verified, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [url, company_name || null, score, country || 'NL', city || null, type || 'seo_agency', true, true]
      );
      res.json({ success: true, action: 'added', id: result.rows[0].id, message: 'Entry added to leaderboard' });
    } else {
      await pool.query(
        `UPDATE leaderboard SET 
           score = $1, company_name = COALESCE($2, company_name), country = COALESCE($3, country),
           city = COALESCE($4, city), type = COALESCE($5, type), admin_verified = true, is_verified = true
         WHERE url = $6`,
        [score, company_name || null, country || null, city || null, type || 'seo_agency', url]
      );
      res.json({ success: true, action: 'updated', id: existing.rows[0].id, message: 'Leaderboard entry updated' });
    }
  } catch (error) {
    console.error('Manual leaderboard add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/freelancers', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, freelancers: [] });
  try {
    const result = await pool.query(`SELECT * FROM freelancers ORDER BY created_at DESC LIMIT 200`);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    res.json({ success: true, freelancers: [] });
  }
});

app.get('/api/admin/freelancers/pending', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, pending: [] });
  try {
    const result = await pool.query(`SELECT * FROM freelancers WHERE is_approved = FALSE ORDER BY created_at DESC LIMIT 50`);
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    res.json({ success: true, pending: [] });
  }
});

app.post('/api/admin/freelancers/:id/approve', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('UPDATE freelancers SET is_approved = TRUE, is_verified = TRUE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/:id/feature', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { is_featured } = req.body;
    await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [is_featured, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/freelancers/:id/deactivate', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('UPDATE freelancers SET is_approved = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/share-links', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, share_links: [] });
  try {
    const result = await pool.query(
      `SELECT *, CASE WHEN expires_at > NOW() AND is_active = TRUE THEN 'active' ELSE 'inactive' END as status
       FROM share_links ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.json({ success: true, share_links: [] });
  }
});

app.post('/api/admin/share-links/create', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { client_email, client_name, client_company, scans_limit = 10, valid_days = 30 } = req.body;
    const shareCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + valid_days);
    
    const result = await pool.query(
      `INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [shareCode, client_email, client_name, client_company, scans_limit, req.admin.id, expiresAt]
    );
    
    res.json({
      success: true,
      share_link: result.rows[0],
      share_url: `https://app.contentscale.site/share/${shareCode}`,
      expires_at: expiresAt
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/share-links/:id/toggle-status', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query('UPDATE share_links SET is_active = $1 WHERE id = $2', [status === 'active', id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/share-links/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    await pool.query('DELETE FROM share_links WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// BLOG ROUTES
// ==========================================
app.get('/api/blog', async (req, res) => {
  if (!pool) return res.json({ success: true, posts: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
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
    res.json({ success: true, posts: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
  }
});

app.get('/api/blog/:slug', async (req, res) => {
  if (!pool) return res.status(404).json({ success: false, error: 'Blog post not found' });
  try {
    const result = await pool.query(
      `SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published' AND published_at <= NOW()`,
      [req.params.slug]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Blog post not found' });
    
    await pool.query('UPDATE blog_posts SET views = views + 1 WHERE id = $1', [result.rows[0].id]);
    
    const images = await pool.query('SELECT * FROM blog_images WHERE post_id = $1 ORDER BY position ASC', [result.rows[0].id]);
    
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
    res.status(500).json({ success: false, error: 'Failed to load blog post' });
  }
});

app.post('/api/claims/submit', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { business_name, business_url, contact_name, contact_email, contact_phone, verification_document } = req.body;
    
    if (!business_name || !business_url || !contact_name || !contact_email) {
      return res.status(400).json({ success: false, error: 'Required fields missing' });
    }
    
    const result = await pool.query(
      `INSERT INTO claims (business_name, business_url, contact_name, contact_email, contact_phone, verification_document)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [business_name, business_url, contact_name, contact_email, contact_phone, verification_document]
    );
    
    res.json({ success: true, message: 'Claim submitted successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Claim submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit claim' });
  }
});

// ==========================================
// PAGE ROUTES - ✅ GEFIXT MET process.cwd()
// ==========================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin-dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'blog-post.html'));
});

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

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const filePath = path.join(process.cwd(), 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
    }
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

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

startServer();
