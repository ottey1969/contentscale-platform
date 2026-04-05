try 

//
// CONTENTSCALE SERVER.JS — ELITE EDITION v4 (FIXED v3)
// ✅ Database Migration: country VARCHAR(100) (Fixes "value too long" error)
// ✅ Bulk Delete Routes Added (Users, Leaderboard, Freelancers)
// ✅ Tab Refresh Logic Preserved
// ✅ GRAAF + CRAFT + Technical (100-point scale)
// ✅ 34 Recommendation Checks — with Learning + Target
// ✅ Bug-fixed: no page.content() after page.close()
// ✅ Bug-fixed: Schema @graph array support
// ✅ Bug-fixed: Strict case study detection (% patterns)
// ✅ Expert quote detection: blockquote + testimonial CSS
// ✅ New: Direct Answer, TL;DR, TOC, Author Bio, Stats
// ✅ SendGrid + Admin + Leaderboard + Freelancers preserved
// ✅ UPDATE: /api/user/keys/status returns hasSendgrid:true when SENDGRID_API_KEY env var is set
// ✅ UPDATE: /api/email/send falls back to server SENDGRID_API_KEY env var (no user key required)
// ✅ FIX: scan_log.source column added — stores 'bulk'/'single'/'discover' per row
// ✅ FIX: ON CONFLICT DO NOTHING removed from scan_log INSERT (no unique constraint)
// ✅ FIX: /api/scan-log POST now stores + returns source field
// ✅ FIX: DOCX export Status column shows template type (Congrats/Pitch/Almost/Website)
// ✅ FIX v3: /api/admin/users SELECT adds activated_until alias + is_activated computed column
// ✅ FIX v3: /api/admin/users/:id/deactivate endpoint added (was missing — caused 404)
// ✅ FIX v4: Instantly Bearer token = UUID part (BEFORE ':'), not secret after colon
// ✅ FIX v5: All pages get favicon tags + blink effect + site.webmanifest route
// ✅ v6: Gemini Live WebSocket proxy at /api/gemini-live-ws
// ============================================
// PGSSLMODE removed — pool config handles SSL (rejectUnauthorized: false for Railway)
process.env.NODE_NO_WARNINGS = '1';
const fs = require('fs');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const multer = require('multer');
const http   = require('http');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// GEMINI MODEL AUTO-DETECT
// Haalt beschikbare modellen op bij startup
// Kiest automatisch beste flash model
// Nooit meer handmatig aanpassen
// ============================================
let GEMINI_MODEL = 'gemini-2.5-flash'; // postpay default — works on billing-enabled accounts

async function detectBestGeminiModel(apiKey) {
  if (!apiKey) return;
  // Priority: cheapest postpay models first (billing enabled account)
  // gemini-2.0-flash = $0.075/1M tokens — best price/quality for postpay
  const PRIORITY = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-001'];
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!resp.ok) {
      console.warn('⚠️ Could not list Gemini models, using default:', GEMINI_MODEL);
      return;
    }
    const data = await resp.json();
    const available = (data.models || []).map(m => m.name.replace('models/', ''));
    console.log(`📋 Gemini models available: ${available.filter(m=>m.includes('flash')).join(', ')}`);
    // Pick first from priority list that exists
    for (const preferred of PRIORITY) {
      if (available.includes(preferred)) {
        GEMINI_MODEL = preferred;
        console.log(`✅ Gemini model selected: ${GEMINI_MODEL}`);
        return;
      }
    }
    // Fallback: any flash model
    const anyFlash = available.find(m => m.includes('flash') && !m.includes('thinking'));
    if (anyFlash) { GEMINI_MODEL = anyFlash; console.log(`✅ Gemini model fallback: ${GEMINI_MODEL}`); }
  } catch(e) {
    console.warn('⚠️ Gemini detect failed, using default:', GEMINI_MODEL, e.message);
  }
}


console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');
console.log('📧 SendGrid Key:', process.env.SENDGRID_API_KEY ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');
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
console.log('📊 Database configuratie:', dbConfig.host, dbConfig.database);
return new Pool(dbConfig);
}
try {
pool = initDatabaseConfig();
} catch (e) {
console.error('❌ Fout bij initialiseren database pool:', e.message);
pool = null;
}
async function waitForDatabase(retries = 5, delay = 3000) {
if (!pool) return false;
console.log('🔄 Verbinden met database...');
for (let i = 0; i < retries; i++) {
try {
const client = await pool.connect();
await client.query('SELECT NOW()');
client.release();
console.log('✅ Database verbonden!');
setTimeout(() => createAllTables().catch(err => console.error('❌ Table error:', err)), 1000);
return true;
} catch (err) {
console.error(`❌ DB Attempt ${i + 1}/${retries} failed`);
if (i === retries - 1) return false;
await new Promise(resolve => setTimeout(resolve, delay));
}
}
return false;
}
app.set('trust proxy', 1);
app.use(function(req, res, next) {
  const allowedOrigins = [
    'https://app.contentscale.site',
    'https://contentscale.site',
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.BASE_URL
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key, x-user-id, x-anthropic-key, x-gemini-key, anthropic-version');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Global badge-loader injection ────────────────────────────────────────────
// Injects badge-loader.js into every HTML page served by this server
app.use((req, res, next) => {
const origSend = res.send.bind(res);
res.send = function(body) {
if (typeof body === 'string' && body.includes('</body>') &&
res.getHeader('Content-Type')?.includes('text/html')) {
// Replace LAST </body> only — avoids hitting </body> inside JS template strings
const lastIdx = body.lastIndexOf('</body>');
if (lastIdx !== -1) {
body = body.slice(0, lastIdx) +
'<script src="https://app.contentscale.site/badge-loader.js?v=3"></script></body>' +
body.slice(lastIdx + 7);
}
}
return origSend(body);
};
next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Explicit route for / so badge-loader middleware fires ─────────────────────
app.get('/', (req, res) => {
const tryPaths = [
path.join(__dirname, '../public/index.html'),
path.join(__dirname, 'public/index.html'),
];
const filePath = tryPaths.find(p => fs.existsSync(p));
if (!filePath) return res.status(404).send('Not found');
const html = fs.readFileSync(filePath, 'utf8');
res.setHeader('Content-Type', 'text/html; charset=utf-8');
res.setHeader('Cache-Control', 'no-cache');
return res.send(html); // goes through middleware → badge-loader injected
});
// Favicon routes — must be BEFORE express.static to override public/ files
app.get('/favicon.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(_FAVICON_SVG);
});
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.redirect(302, '/favicon.svg');
});
app.get('/favicon-32x32.png', (req, res) => res.redirect(302, '/favicon.svg'));
app.get('/favicon-16x16.png', (req, res) => res.redirect(302, '/favicon.svg'));

// JS served before static

// All JS filenames → always serve _OTTO_JS inline (never from public/ file)
const _serveOttoJs = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(_OTTO_JS);
};
['gemini-live-client.js','gemini-live-client-v5.js','gemini-live-client-v6.js',
 'gemini-live-client-v7.js','otto-ai.js'].forEach(name => {
  app.get('/' + name, _serveOttoJs);
});

// ── Gemini Live ephemeral token ─────────────────────────────
// Browser calls this → gets short-lived token → connects DIRECTLY to Google
// No audio proxy needed — lower latency, Google recommended approach
// Gemini Live — relay API key securely to client for direct WS connection
// Rate limit: max 2 sessions per IP per day
const _ottoIpMap = new Map(); // ip -> { count, date }

function checkOttoLimit(req, res) {
  // Admin bypass
  if (req.query.admin === 'ottmar2024') {
    console.log('[otto-limit] admin bypass');
    return true;
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const entry = _ottoIpMap.get(ip);

  if (entry && entry.date === today) {
    if (entry.count >= 1) {
      console.log('[otto-limit] blocked:', ip, 'count:', entry.count);
      res.status(429).json({ error: 'Daily limit reached — max 1 conversation per day per visitor. Come back tomorrow!' });
      return false;
    }
    entry.count++;
  } else {
    _ottoIpMap.set(ip, { count: 1, date: today });
  }

  // Clean old entries every 1000 requests
  if (_ottoIpMap.size > 1000) {
    for (const [k, v] of _ottoIpMap.entries()) {
      if (v.date !== today) _ottoIpMap.delete(k);
    }
  }
  return true;
}

app.use(express.static('public', { maxAge: '1y', etag: true }));
// ── Favicon & manifest ──────────────────────────────────────────────────────
app.get('/site.webmanifest', (req, res) => {
res.setHeader('Content-Type', 'application/manifest+json');
res.sendFile(path.join(__dirname, 'public', 'site.webmanifest'));
});

// ── Blog HTML interceptor — BEFORE express.static ────────────────────────────
app.use('/blog', (req, res, next) => {
const slug = req.path.replace(/^\//, '').replace(/\.html$/, '');
if (!slug || slug === 'blog-posts.json' || req.path.includes('.json') || req.path.includes('.')) return next();
const tryPaths = [
path.join(__dirname, '../public/blog', slug + '.html'),
path.join(__dirname, '../public/blog', slug),
path.join(__dirname, 'public/blog', slug + '.html'),
path.join(__dirname, 'public/blog', slug),
];
const filePath = tryPaths.find(p => fs.existsSync(p));
if (filePath) {
const html = fs.readFileSync(filePath, 'utf8');
res.setHeader('Content-Type', 'text/html; charset=utf-8');
res.setHeader('Content-Disposition', 'inline');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Cache-Control', 'no-cache');
return res.status(200).send(html);
}
next();
});
// ── Blog routes ───────────────────────────────────────────────────────────────
app.get('/blog', (req, res) => {
const tryPaths = [
path.join(__dirname, '../public/blog/index.html'),
path.join(__dirname, 'public/blog/index.html'),
];
const filePath = tryPaths.find(p => fs.existsSync(p));
if (filePath) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.sendFile(filePath); }
res.status(404).send('Blog not found');
});
app.get('/blog/', (req, res) => res.redirect('/blog'));
// Auto-discover blog posts from HTML files
app.get('/blog/blog-posts.json', (req, res) => {
const tryDirs = [
path.join(__dirname, '../public/blog'),
path.join(__dirname, 'public/blog'),
];
const blogDir = tryDirs.find(d => fs.existsSync(d));
if (!blogDir) return res.json([]);
const SKIP = ['index.html'];
try {
const manualJson = path.join(blogDir, '_blog-posts.json');
if (fs.existsSync(manualJson)) return res.json(JSON.parse(fs.readFileSync(manualJson, 'utf8')));
const files = fs.readdirSync(blogDir)
.filter(f => f.endsWith('.html') && !SKIP.includes(f))
.map(f => {
const slug = f.replace('.html', '');
const html = fs.readFileSync(path.join(blogDir, f), 'utf8');
const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1]?.replace(/ — ContentScale.*/, '').trim() || slug;
   const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
   const image = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
   const dateMatch = html.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})/);
   let date = dateMatch ? dateMatch[1] : '2026-01-01';
   let category = ['guide'];
   if (html.includes('cat-case-study') || html.includes('Case Study')) category = ['case-study'];
   const rtMatch = (html.match(/(\d+)\s*min read/) || [])[1];
   const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).length;
   const readTime = rtMatch ? `${rtMatch} min read` : `${Math.max(5, Math.ceil(wordCount / 250))} min read`;
   return { slug, title, description: desc, date, readTime, author: 'Ottmar J.G. Francisca', category, image };
   })
   .sort((a, b) => new Date(b.date) - new Date(a.date));
   if (files.length > 0) files[0].featured = true;
   res.json(files);
   } catch(e) { console.error('Blog auto-discover error:', e.message); res.json([]); }
   });
   app.get('/blog/:slug', (req, res) => {
   try {
   const slug = req.params.slug;
   if (!slug || slug.includes('.')) return res.status(404).send('<h1>Not found</h1>');
   const tryPaths = [
   path.join(__dirname, '../public/blog', slug + '.html'),
   path.join(__dirname, 'public/blog', slug + '.html'),
   ];
   const filePath = tryPaths.find(p => { try { return fs.existsSync(p); } catch(e) { return false; } });
   if (filePath) {
   const html = fs.readFileSync(filePath, 'utf8');
   res.setHeader('Content-Type', 'text/html; charset=utf-8');
   res.setHeader('X-Content-Type-Options', 'nosniff');
   res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
   return res.status(200).send(html);
   }
   res.status(404).send('<!DOCTYPE html><html><body style="background:#030712;color:#e5e7eb;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h2>Blog post not found</h2><p style="color:#6b7280;margin-top:8px">The file <code>' + slug + '.html</code> does not exist in public/blog/</p><a href="/blog" style="color:#a78bfa">← Back to Blog</a></div></body></html>');
   } catch(e) {
   console.error('Blog route error:', e.message);
   res.status(500).send('<h1>Blog error: ' + e.message + '</h1>');
   }
   });
   // Admin Auth Middleware
   const verifyAdmin = async (req, res, next) => {
   const adminKey = req.headers['x-admin-key'];
   if (!adminKey) return res.status(401).json({ success: false, error: 'Admin auth required' });
   if (!pool) return res.status(503).json({ success: false, error: 'DB unavailable' });
   try {
   const result = await pool.query('SELECT * FROM super_admins WHERE id = $1 AND is_active = TRUE', [adminKey]);
   if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' });
   req.admin = result.rows[0];
   next();
   } catch (error) {
   res.status(500).json({ success: false, error: 'Auth error' });
   }
   };
   // Puppeteer Browser
   let browserInstance = null;
   async function getBrowser() {
   // Auto-restart if browser crashed or disconnected
   if (browserInstance) {
   try {
   await browserInstance.version(); // ping — throws if dead
   } catch(e) {
   console.warn('⚠️ Browser instance dead, restarting...');
   try { await browserInstance.close(); } catch(_) {}
   browserInstance = null;
   }
   }
   if (!browserInstance) {
   console.log('🚀 Launching Puppeteer...');
   // Try to find Chromium executable
   const chromiumPaths = [
     process.env.PUPPETEER_EXECUTABLE_PATH,
     '/usr/bin/chromium-browser',
     '/usr/bin/chromium',
     '/usr/bin/google-chrome',
     '/usr/bin/google-chrome-stable',
   ].filter(Boolean);
   let executablePath = undefined;
   const fs = require('fs');
   for (const p of chromiumPaths) {
     if (fs.existsSync(p)) { executablePath = p; break; }
   }
   if (executablePath) console.log('🌐 Using Chromium at:', executablePath);
   else console.log('⚠️ No custom Chromium path found — using Puppeteer bundled Chrome');

   browserInstance = await puppeteer.launch({
     headless: true,
     executablePath: executablePath || undefined,
     args: [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       '--disable-dev-shm-usage',
       '--disable-gpu',
       '--no-zygote',
       '--single-process',
       '--memory-pressure-off'
     ]
   }).catch(err => { console.error('❌ Puppeteer error:', err.message); return null; });
   }
   return browserInstance;
   }
   process.on('SIGTERM', async () => {
   if (browserInstance) await browserInstance.close();
   process.exit(0);
   });
   // Database Tables & Migration
   async function createAllTables() {
   if (!pool) return;
   let client;
   try {
   client = await pool.connect();
   // 1. Super Admins
   await client.query(`CREATE TABLE IF NOT EXISTS super_admins (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name VARCHAR(255), email VARCHAR(255), role VARCHAR(50) DEFAULT 'admin', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP)`);
   const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
   if (parseInt(adminCheck.rows[0].count) === 0) {
   const hashedPassword = await bcrypt.hash('admin123', 10);
   await client.query(`INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)`, ['ot', hashedPassword, 'Super Admin', 'super_admin']);
   console.log('✅ Default admin created (ot/admin123)');
   }
   // 2. Users & Keys
   await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, ip_address VARCHAR(50), is_activated BOOLEAN DEFAULT FALSE, activation_expires TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`);
   // 🛠️ MIGRATION: add activation_expires if table existed before this column was added
   await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_expires TIMESTAMP`).catch(() => {});;
   await client.query(`CREATE TABLE IF NOT EXISTS user_api_keys (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, service_name VARCHAR(50) NOT NULL, api_key TEXT NOT NULL, daily_limit INTEGER DEFAULT 100, used_today INTEGER DEFAULT 0, last_reset DATE DEFAULT CURRENT_DATE, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, service_name))`);
   await client.query(`CREATE TABLE IF NOT EXISTS user_email_templates (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, template_type VARCHAR(50) NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, template_type))`);
   await client.query(`CREATE TABLE IF NOT EXISTS admin_messages (id SERIAL PRIMARY KEY, sent_by INTEGER REFERENCES super_admins(id), recipient_type VARCHAR(50), subject TEXT NOT NULL, body TEXT NOT NULL, is_bulk BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())`);
   await client.query(`CREATE TABLE IF NOT EXISTS scans (id SERIAL PRIMARY KEY, url TEXT NOT NULL, score INTEGER, quality VARCHAR(50), graaf_score INTEGER, craft_score INTEGER, technical_score INTEGER, breakdown JSONB, recommendations JSONB DEFAULT '[]', scan_type VARCHAR(50) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW())`);
   // 3. Leaderboard (WITH MIGRATION FIX)
   await client.query(`CREATE TABLE IF NOT EXISTS leaderboard (id SERIAL PRIMARY KEY, url TEXT NOT NULL UNIQUE, company_name VARCHAR(255), score INTEGER NOT NULL, country VARCHAR(100) DEFAULT 'NL', city VARCHAR(255), type VARCHAR(100) DEFAULT 'seo_agency', location VARCHAR(255), is_verified BOOLEAN DEFAULT FALSE, is_opted_out BOOLEAN DEFAULT FALSE, submission_ip VARCHAR(50), admin_verified BOOLEAN DEFAULT TRUE, auto_detected_country VARCHAR(100), graaf_score INTEGER, craft_score INTEGER, technical_score INTEGER, niche VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`);
   // 🛠️ MIGRATION: Ensure country column is wide enough (Fixes "value too long" error)
   try {
   await client.query(`ALTER TABLE leaderboard ALTER COLUMN country TYPE VARCHAR(100)`);
   console.log('✅ Migration: leaderboard.country set to VARCHAR(100)');
   } catch (e) {
   // Ignore if already correct or other minor issues
   }
   // Ensure niche exists
   await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS niche VARCHAR(100)`);
   await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS business_type VARCHAR(100)`);
   // Sitemap scan columns
   await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 1`);
   await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS page_scores JSONB DEFAULT '[]'`);
   await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS scan_source VARCHAR(50) DEFAULT 'manual'`);
   // 4. Freelancers
   await client.query(`CREATE TABLE IF NOT EXISTS freelancers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, title VARCHAR(255), location VARCHAR(255), country VARCHAR(100), bio TEXT, linkedin_url TEXT, hourly_rate VARCHAR(50), availability VARCHAR(100), is_approved BOOLEAN DEFAULT FALSE, is_verified BOOLEAN DEFAULT FALSE, is_featured BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())`);
   // 5. Email Queue
   await client.query(`CREATE TABLE IF NOT EXISTS email_queue (id SERIAL PRIMARY KEY, user_id VARCHAR(255), to_email VARCHAR(255) NOT NULL, to_name VARCHAR(255), subject TEXT NOT NULL, body TEXT NOT NULL, status VARCHAR(50) DEFAULT 'pending', sent_at TIMESTAMP, error_message TEXT, created_at TIMESTAMP DEFAULT NOW(), business_url TEXT, business_name VARCHAR(255), score INTEGER, template_type VARCHAR(50))`);
   // 6. Scan Log — ✅ FIX: source column added to track bulk/single/discover origin
   await client.query(`CREATE TABLE IF NOT EXISTS scan_log (
   id SERIAL PRIMARY KEY,
   user_id VARCHAR(255),
   business_url TEXT,
   business_name VARCHAR(255),
   score INTEGER,
   niche VARCHAR(100),
   city VARCHAR(255),
   country VARCHAR(100),
   email_found VARCHAR(255),
   email_status VARCHAR(50) DEFAULT 'no_email',
   source VARCHAR(50) DEFAULT 'single',
   recommendations TEXT,
   created_at TIMESTAMP DEFAULT NOW()
   )`);
   // Migrations for existing deployments
   await client.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS recommendations TEXT`).catch(() => {});
   await client.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'single'`).catch(() => {});
   await client.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS report_url TEXT`).catch(() => {});
   // 7. Email suppression list
   await client.query(`CREATE TABLE IF NOT EXISTS email_suppression (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, unsubscribed_at TIMESTAMP DEFAULT NOW(), reason VARCHAR(100) DEFAULT 'user_request')`);
   // 8. Warmup config
   await client.query(`CREATE TABLE IF NOT EXISTS warmup_config (id SERIAL PRIMARY KEY, user_id VARCHAR(255) UNIQUE NOT NULL, warmup_start_date DATE NOT NULL DEFAULT CURRENT_DATE, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW())`);
   // Scan reports
   await client.query(`CREATE TABLE IF NOT EXISTS scan_reports (
   id VARCHAR(64) PRIMARY KEY,
   scan_log_id INTEGER,
   business_url TEXT,
   business_name VARCHAR(255),
   score INTEGER,
   niche VARCHAR(100),
   city VARCHAR(255),
   country VARCHAR(100),
   email_found VARCHAR(255),
   recommendations TEXT,
   created_at TIMESTAMP DEFAULT NOW()
   )`);
   // Batch jobs
   await client.query(`CREATE TABLE IF NOT EXISTS batch_jobs (
   id VARCHAR(64) PRIMARY KEY,
   admin_id VARCHAR(255),
   niches TEXT NOT NULL,
   cities TEXT NOT NULL,
   country VARCHAR(100) DEFAULT 'Netherlands',
   max_results INTEGER DEFAULT 50,
   website_only BOOLEAN DEFAULT TRUE,
   status VARCHAR(50) DEFAULT 'queued',
   progress INTEGER DEFAULT 0,
   progress_text TEXT DEFAULT 'Queued...',
   total_combos INTEGER DEFAULT 0,
   current_combo INTEGER DEFAULT 0,
   scanned INTEGER DEFAULT 0,
   skipped INTEGER DEFAULT 0,
   score_high INTEGER DEFAULT 0,
   score_good INTEGER DEFAULT 0,
   score_low INTEGER DEFAULT 0,
   error_message TEXT,
   apify_token TEXT,
   started_at TIMESTAMP,
   completed_at TIMESTAMP,
   created_at TIMESTAMP DEFAULT NOW()
   )`);
   await client.query(`ALTER TABLE batch_jobs ADD COLUMN IF NOT EXISTS score_low INTEGER DEFAULT 0`).catch(() => {});
   // Migrate email_queue columns
   await client.query(`ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS business_url TEXT`).catch(() => {});
   await client.query(`ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS business_name VARCHAR(255)`).catch(() => {});
   await client.query(`ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS score INTEGER`).catch(() => {});
   await client.query(`ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS template_type VARCHAR(50)`).catch(() => {});
   console.log('✅ All tables ready & migrated');
   } catch (error) {
   console.error('❌ DB Setup error:', error.message);
   } finally {
   if (client) client.release();
   }
   }
   // ============================================
   // API ENDPOINTS
   // ============================================
   app.post('/api/user/register', async (req, res) => {
   try {
   const userId = crypto.randomUUID();
   const ip = req.ip || req.connection.remoteAddress;
   await pool.query(`INSERT INTO users (id, ip_address, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO NOTHING`, [userId, ip]);
   const defaultTemplates = [
   { type: 'congrats', subject: '🎉 Congratulations!', body: `
   <h1>Congratulations!</h1>
   <p>Score: {{score}}/100</p>
   ` },
   { type: 'improvement', subject: '🚀 SEO Opportunity', body: `
   <h1>SEO Opportunity</h1>
   <p>Score: {{score}}/100</p>
   ` },
   { type: 'website', subject: '💻 Website Offer', body: `
   <h1>Website Offer</h1>
   ` }
   ];
   for (const t of defaultTemplates) {
   await pool.query(`INSERT INTO user_email_templates (user_id, template_type, subject, body) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, template_type) DO NOTHING`, [userId, t.type, t.subject, t.body]);
   }
   res.json({ success: true, userId });
   } catch (error) { res.json({ success: false, error: 'Registration failed' }); }
   });
   app.get('/api/user/keys/status', async (req, res) => {
   const userId = req.headers['x-user-id'];
   const serverHasSendgrid = !!process.env.SENDGRID_API_KEY;
   if (serverHasSendgrid) {
   return res.json({ success: true, hasSendgrid: true, source: 'server' });
   }
   if (!userId) return res.json({ success: true, hasSendgrid: false });
   try {
   const result = await pool.query('SELECT service_name, api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1', [userId]);
   const hasSendgrid = result.rows.some(r => r.service_name === 'sendgrid');
   res.json({ success: true, hasSendgrid, source: 'user', sendgrid: hasSendgrid ? result.rows.find(r => r.service_name === 'sendgrid') : null });
   } catch (e) { res.json({ success: true, hasSendgrid: false }); }
   });
   app.post('/api/user/sendgrid/configure', async (req, res) => {
   const { userId, apiKey, dailyLimit } = req.body;
   if (!userId || !apiKey) return res.json({ success: false, error: 'Missing fields' });
   try {
   await pool.query(`INSERT INTO user_api_keys (user_id, service_name, api_key, daily_limit) VALUES ($1, 'sendgrid', $2, $3) ON CONFLICT (user_id, service_name) DO UPDATE SET api_key = $2, daily_limit = $3`, [userId, apiKey, dailyLimit || 100]);
   res.json({ success: true });
   } catch (e) { res.json({ success: false, error: e.message }); }
   });
   app.get('/api/user/templates', async (req, res) => {
   const userId = req.headers['x-user-id'];
   if (!userId) return res.json({ success: false, error: 'No ID' });
   try {
   const result = await pool.query('SELECT template_type, subject, body FROM user_email_templates WHERE user_id = $1', [userId]);
   const templates = { congrats: {}, improvement: {}, website: {} };
   result.rows.forEach(r => { if (templates[r.template_type]) templates[r.template_type] = { subject: r.subject, body: r.body }; });
   res.json({ success: true, templates });
   } catch (e) { res.json({ success: false, error: e.message }); }
   });
   app.post('/api/user/templates', async (req, res) => {
   const { userId, type, subject, body } = req.body;
   if (!userId || !type) return res.json({ success: false, error: 'Missing' });
   try {
   await pool.query(`INSERT INTO user_email_templates (user_id, template_type, subject, body, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (user_id, template_type) DO UPDATE SET subject = $3, body = $4, updated_at = NOW()`, [userId, type, subject, body]);
   res.json({ success: true });
   } catch (e) { res.json({ success: false, error: e.message }); }
   });
   // ── Warmup Config ──────────────────────────────────────────────────────────
   function calcWarmupCap(dayNumber) {
   if (dayNumber <= 7)  return 5;
   if (dayNumber <= 14) return 20;
   if (dayNumber <= 21) return 40;
   if (dayNumber <= 28) return 70;
   return 100;
   }
   app.get('/api/warmup', async (req, res) => {
   const userId = req.headers['x-user-id'];
   if (!userId || !pool) return res.json({ success: false, active: false, cap: 100 });
   try {
   const r = await pool.query(`SELECT warmup_start_date, is_active FROM warmup_config WHERE user_id = $1`, [userId]);
   if (!r.rows.length) return res.json({ success: true, active: false, startDate: null, dayNumber: 0, dailyCap: 100 });
   const row = r.rows[0];
   if (!row.is_active) return res.json({ success: true, active: false, dailyCap: 100 });
   const dayNumber = Math.floor((new Date() - new Date(row.warmup_start_date)) / 86400000) + 1;
   const dailyCap  = calcWarmupCap(dayNumber);
   res.json({ success: true, active: true, startDate: row.warmup_start_date, dayNumber, dailyCap });
   } catch (e) { res.json({ success: false, active: false, dailyCap: 100 }); }
   });
   app.post('/api/warmup/start', async (req, res) => {
   const userId = req.headers['x-user-id'];
   if (!userId || !pool) return res.json({ success: false });
   try {
   await pool.query(
   `INSERT INTO warmup_config (user_id, warmup_start_date, is_active) VALUES ($1, CURRENT_DATE, TRUE)
   ON CONFLICT (user_id) DO UPDATE SET warmup_start_date = CURRENT_DATE, is_active = TRUE`, [userId]
   );
   res.json({ success: true, dailyCap: 5 });
   } catch (e) { res.json({ success: false, error: e.message }); }
   });
   app.post('/api/warmup/stop', async (req, res) => {
   const userId = req.headers['x-user-id'];
   if (!userId || !pool) return res.json({ success: false });
   try {
   await pool.query(`UPDATE warmup_config SET is_active = FALSE WHERE user_id = $1`, [userId]);
   res.json({ success: true });
   } catch (e) { res.json({ success: false, error: e.message }); }
   });
   // ── Unsubscribe ────────────────────────────────────────────────────────────
   app.get('/unsubscribe', async (req, res) => {
   const { email } = req.query;
   if (!email) return res.send(`<!DOCTYPE html>
   <html>
      <body style="font-family:Arial;text-align:center;padding:60px;background:#030712;color:#e5e7eb;">
         <h2>⚠️ Invalid unsubscribe link.</h2>
      </body>
   </html>
   `);
   try {
   if (pool) await pool.query(`INSERT INTO email_suppression (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email.toLowerCase()]);
   res.send(`<!DOCTYPE html>
   <html>
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Unsubscribed — ContentScale</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#7e22ce">
</head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#030712;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
<div style="text-align:center;max-width:480px;padding:40px;">
<div style="font-size:56px;margin-bottom:16px;">✅</div>
<h1 style="color:#4ade80;margin-bottom:8px;">You've been unsubscribed.</h1>
<p style="color:#9ca3af;margin-bottom:24px;">${email} has been removed from all future ContentScale scan emails.</p>
<a href="https://app.contentscale.site" style="background:linear-gradient(135deg,#7e22ce,#be185d);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Back to ContentScale</a>
</div>
<script>
   (function(){
     var titles=['ContentScale ⚡','🎯 SEO Scanner'];
     var favs=['/favicon.svg','/favicon-pink.svg'];
     var t=0,iv=null;
     var orig=document.title;
     var fl=document.querySelector('link[rel~=\"icon\"]');
     document.addEventListener('visibilitychange',function(){
       if(document.hidden){
         iv=setInterval(function(){ t=1-t; document.title=titles[t]; if(fl) fl.href=favs[t]; },800);
       } else {
         clearInterval(iv);iv=null;t=0;
         document.title=orig; if(fl) fl.href='/favicon.svg';
       }
     });
   })();
</script>
</body>
</html>
`);
} catch (e) { res.send(`<p>Error: ${e.message}</p>`); }
});
app.post('/api/unsubscribe', async (req, res) => {
const { email } = req.body;
if (!email || !pool) return res.json({ success: false });
try {
await pool.query(`INSERT INTO email_suppression (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email.toLowerCase()]);
res.json({ success: true });
} catch (e) { res.json({ success: false, error: e.message }); }
});
app.post('/api/email/send', async (req, res) => {
const userId = req.headers['x-user-id'];
const { to_email, subject, html, business_url, business_name, score, template_type } = req.body;
if (!to_email || !subject || !html) return res.json({ success: false, error: 'Missing fields' });
let dailyLimit = parseInt(process.env.SENDGRID_DAILY_LIMIT || '100');
if (pool) {
const wup = await pool.query(`SELECT warmup_start_date FROM warmup_config WHERE user_id = $1 AND is_active = TRUE`, [userId || 'server']).catch(() => ({ rows: [] }));
if (wup.rows.length) {
const day = Math.floor((new Date() - new Date(wup.rows[0].warmup_start_date)) / 86400000) + 1;
dailyLimit = calcWarmupCap(day);
}
}
if (pool) {
const sup = await pool.query(`SELECT id FROM email_suppression WHERE email = $1`, [to_email.toLowerCase()]).catch(() => ({ rows: [] }));
if (sup.rows.length > 0) return res.json({ success: false, suppressed: true, error: 'Email unsubscribed' });
}
let apiKeyToUse = null;
if (process.env.SENDGRID_API_KEY) {
apiKeyToUse = process.env.SENDGRID_API_KEY;
} else if (userId && pool) {
try {
const result = await pool.query("SELECT api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1 AND service_name = 'sendgrid'", [userId]);
if (result.rows.length > 0) {
apiKeyToUse = result.rows[0].api_key;
dailyLimit = result.rows[0].daily_limit;
if (result.rows[0].used_today >= dailyLimit) {
return res.json({ success: false, limit_reached: true, error: 'Daily limit reached' });
}
}
} catch (e) { console.error('Key lookup error:', e.message); }
}
if (!apiKeyToUse) return res.json({ success: false, needs_api_key: true, error: 'No SendGrid key configured' });
if (process.env.SENDGRID_API_KEY && pool) {
try {
const today = new Date().toISOString().slice(0, 10);
const countRes = await pool.query(
"SELECT COUNT(*) FROM email_queue WHERE status = 'sent' AND sent_at::date = $1::date",
[today]
);
const sentToday = parseInt(countRes.rows[0].count) || 0;
if (sentToday >= dailyLimit) {
return res.json({ success: false, limit_reached: true, error: `Daily limit of ${dailyLimit} reached` });
}
} catch (e) { console.warn('Daily limit check failed:', e.message); }
}
try {
sgMail.setApiKey(apiKeyToUse);
await sgMail.send({
to: to_email,
from: process.env.SENDGRID_FROM_EMAIL || 'noreply@contentscale.site',
subject,
html
});
if (pool) {
await pool.query(
`INSERT INTO email_queue (user_id, to_email, subject, body, status, sent_at, business_url, business_name, score, template_type) VALUES ($1, $2, $3, $4, 'sent', NOW(), $5, $6, $7, $8)`,
[userId || 'server', to_email, subject, html, business_url || null, business_name || null, score || null, template_type || null]
).catch(e => console.warn('Email log failed:', e.message));
}
if (!process.env.SENDGRID_API_KEY && userId && pool) {
await pool.query(
"UPDATE user_api_keys SET used_today = used_today + 1 WHERE user_id = $1 AND service_name = 'sendgrid'",
[userId]
).catch(e => console.warn('Counter update failed:', e.message));
}
res.json({ success: true });
} catch (e) {
console.error('❌ SendGrid send error:', e.message);
res.json({ success: false, error: e.message });
}
});
// Bulk Scan Placeholders
app.post('/api/bulk-scan/send-summary', async (req, res) => { res.json({ success: true }); });
app.post('/api/bulk-scan/submit-leaderboard', async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
const { entries, submittedBy } = req.body;
if (!entries || !Array.isArray(entries)) return res.json({ success: false, error: 'No entries' });
let inserted = 0;
for (const e of entries) {
try {
await pool.query(
`INSERT INTO leaderboard (url, company_name, score, country, niche, admin_verified, is_verified)
VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
ON CONFLICT (url) DO UPDATE SET
score = EXCLUDED.score,
company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
niche = COALESCE(EXCLUDED.niche, leaderboard.niche),
admin_verified = FALSE`,
[e.url, e.company_name || e.name || null, e.score, e.country || 'NL', e.niche || null]
);
inserted++;
} catch (err) { console.warn('Leaderboard insert failed:', err.message); }
}
res.json({ success: true, inserted });
});
app.post('/api/bulk-scan/send-improvement-emails', async (req, res) => { res.json({ success: true }); });
app.post('/api/bulk-scan/send-website-offers', async (req, res) => { res.json({ success: true }); });
// Admin Endpoints
app.post('/api/setup/verify-admin', async (req, res) => {
const { username, password } = req.body;
if (!pool) return res.status(503).json({ success: false, error: 'DB down' });
try {
const result = await pool.query('SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE', [username]);
if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid' });
const valid = await bcrypt.compare(password, result.rows[0].password_hash);
if (!valid) return res.status(401).json({ success: false, error: 'Invalid' });
res.json({ success: true, admin_id: result.rows[0].id });
} catch (e) { res.status(500).json({ success: false, error: 'Server error' }); }
});
// ✅ FIX v3: Added activated_until alias + computed is_activated so admin.html renderUsers works correctly
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
try {
const r = await pool.query(`
SELECT 
u.*,
u.activation_expires AS activated_until,
CASE WHEN u.activation_expires > NOW() THEN TRUE ELSE FALSE END AS is_activated,
COUNT(s.id) AS scan_count,
MAX(s.created_at) AS last_scan_at,
(SELECT s2.business_url FROM scan_log s2 WHERE s2.user_id = u.id ORDER BY s2.created_at DESC LIMIT 1) AS last_scanned_url,
(SELECT s3.score FROM scan_log s3 WHERE s3.user_id = u.id ORDER BY s3.created_at DESC LIMIT 1) AS last_scan_score
FROM users u
LEFT JOIN scan_log s ON s.user_id = u.id
GROUP BY u.id
ORDER BY u.created_at DESC
`);
res.json({ success: true, users: r.rows });
}
catch (e) { res.json({ success: false, error: e.message }); }
});
app.post('/api/admin/users/:id/activate', verifyAdmin, async (req, res) => {
try {
const days = req.body.days || 7;
const date = new Date(); date.setDate(date.getDate() + parseInt(days));
await pool.query('UPDATE users SET is_activated = TRUE, activation_expires = $2 WHERE id = $1', [req.params.id, date]);
res.json({ success: true });
} catch (e) { res.json({ success: false, error: e.message }); }
});
// ✅ FIX v3: Added missing deactivate endpoint (was causing 404 in admin.html)
app.post('/api/admin/users/:id/deactivate', verifyAdmin, async (req, res) => {
try {
await pool.query(
'UPDATE users SET is_activated = FALSE, activation_expires = NULL WHERE id = $1',
[req.params.id]
);
res.json({ success: true });
} catch (e) { res.json({ success: false, error: e.message }); }
});
app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
try {
await pool.query('DELETE FROM user_api_keys WHERE user_id = $1', [req.params.id]);
await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
res.json({ success: true });
} catch (e) { res.json({ success: false, error: e.message }); }
});
// ✅ Bulk Delete Users
app.post('/api/admin/users/bulk-delete', verifyAdmin, async (req, res) => {
try {
const { ids } = req.body;
if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'No IDs provided' });
await pool.query('DELETE FROM user_api_keys WHERE user_id = ANY($1)', [ids]);
const result = await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
res.json({ success: true, message: `Deleted ${result.rowCount} users` });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/admin/messages', verifyAdmin, async (req, res) => {
try { const r = await pool.query('SELECT * FROM admin_messages ORDER BY created_at DESC LIMIT 50'); res.json({ success: true, messages: r.rows }); }
catch (e) { res.json({ success: false, error: e.message }); }
});
app.post('/api/admin/messages/send', verifyAdmin, async (req, res) => {
try {
await pool.query(`INSERT INTO admin_messages (sent_by, recipient_type, subject, body, is_bulk) VALUES ($1, $2, $3, $4, $5)`, [req.admin.id, req.body.recipients, req.body.subject, req.body.body, req.body.is_bulk || false]);
res.json({ success: true });
} catch (e) { res.json({ success: false, error: e.message }); }
});
// ── DOCX Export endpoint ─────────────────────────────────────────────────────
app.post('/api/export/scan-report-docx', async (req, res) => {
const { scans } = req.body;
if (!scans || !Array.isArray(scans)) return res.status(400).json({ error: 'No scan data' });
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const tmpJson = path.join(os.tmpdir(), 'scandata_' + Date.now() + '.json');
const tmpDocx = path.join(os.tmpdir(), 'scanreport_' + Date.now() + '.docx');
fs.writeFileSync(tmpJson, JSON.stringify(scans));
const pyScript = `
import sys, json
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime
json_path = sys.argv[1]
out_path  = sys.argv[2]
with open(json_path) as f:
scans = json.load(f)
doc = Document()
for section in doc.sections:
section.top_margin    = Cm(2)
section.bottom_margin = Cm(2)
section.left_margin   = Cm(2.5)
section.right_margin  = Cm(2.5)
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('ContentScale — Scan Activity Report')
run.bold = True
run.font.size = Pt(20)
run.font.color.rgb = RGBColor(126, 34, 206)
sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sub.add_run('Generated: ' + datetime.datetime.now().strftime('%d %B %Y') + '  ·  app.contentscale.site').font.color.rgb = RGBColor(120, 120, 120)
doc.add_paragraph()
total   = len(scans)
emailed = sum(1 for s in scans if s.get('email_status') == 'has_email')
no_em   = sum(1 for s in scans if s.get('email_status') == 'no_email')
lb      = sum(1 for s in scans if (s.get('score') or 0) >= 70)
stats_p = doc.add_paragraph()
stats_p.add_run('Summary   ').bold = True
stats_p.add_run(f'Total scanned: {total}   |   Emails sent: {emailed}   |   No email found: {no_em}   |   Leaderboard (70+): {lb}')
doc.add_paragraph()
def get_template_label(s):
tt = s.get('template_type') or ''
status = s.get('email_status') or 'no_email'
if status != 'has_email':
return 'No email'
if tt == 'congrats':
return 'Congrats'
if tt == 'almost':
return 'Almost Made It'
if tt == 'improvement':
return 'Pitch Sent'
if tt == 'website':
return 'Website Offer'
return 'Sent'
def get_source_label(s):
src = s.get('source') or 'single'
if src == 'bulk':     return 'Bulk'
if src == 'discover': return 'Find Leads'
return 'Single'
headers = ['Business', 'URL', 'Score', 'Email Found', 'Template', 'Source', 'Top Issue', 'Scanned']
widths  = [Cm(3.8), Cm(4.5), Cm(1.5), Cm(4.2), Cm(2.2), Cm(1.8), Cm(4.5), Cm(2.5)]
table = doc.add_table(rows=1, cols=len(headers))
table.style = 'Table Grid'
hdr = table.rows[0]
for i, (cell, w) in enumerate(zip(hdr.cells, widths)):
cell.width = w
p = cell.paragraphs[0]
run = p.add_run(headers[i])
run.bold = True
run.font.size = Pt(8)
run.font.color.rgb = RGBColor(255, 255, 255)
tc = cell._tc
tcPr = tc.get_or_add_tcPr()
shd = OxmlElement('w:shd')
shd.set(qn('w:val'), 'clear')
shd.set(qn('w:color'), 'auto')
shd.set(qn('w:fill'), '7E22CE')
tcPr.append(shd)
for idx, s in enumerate(scans):
score = s.get('score')
if score is None: score_str = '—'
else: score_str = str(score)
rec = ''
try:
import json as j2
recs = j2.loads(s.get('recommendations') or '[]')
rec = recs[0] if recs else ''
except: pass
dt_str = ''
try:
from datetime import datetime
dt_str = datetime.fromisoformat(s.get('created_at','').replace('Z','+00:00')).strftime('%d/%m/%Y')
except: dt_str = str(s.get('created_at',''))[:10]
template_label = get_template_label(s)
source_label   = get_source_label(s)
row_data = [
(s.get('business_name') or '—')[:40],
(s.get('business_url') or '—').replace('https://','').replace('http://','').replace('www.','')[:40],
score_str,
(s.get('email_found') or 'not found')[:35],
template_label,
source_label,
rec[:50],
dt_str
]
row = table.add_row()
fill = 'F5F3FF' if idx % 2 == 0 else 'FFFFFF'
for i, (cell, val) in enumerate(zip(row.cells, row_data)):
p = cell.paragraphs[0]
run = p.add_run(val)
run.font.size = Pt(7.5)
if i == 2 and score is not None:
if score >= 70:   run.font.color.rgb = RGBColor(5, 150, 105)
elif score >= 50: run.font.color.rgb = RGBColor(180, 83, 9)
else:             run.font.color.rgb = RGBColor(185, 28, 28)
run.bold = True
if i == 4:
if val == 'Congrats':         run.font.color.rgb = RGBColor(5, 150, 105)
elif val == 'Almost Made It': run.font.color.rgb = RGBColor(180, 83, 9)
elif val == 'Pitch Sent':     run.font.color.rgb = RGBColor(29, 78, 216)
elif val == 'Website Offer':  run.font.color.rgb = RGBColor(126, 34, 206)
else:                         run.font.color.rgb = RGBColor(107, 114, 128)
tc = cell._tc
tcPr = tc.get_or_add_tcPr()
shd = OxmlElement('w:shd')
shd.set(qn('w:val'), 'clear')
shd.set(qn('w:color'), 'auto')
shd.set(qn('w:fill'), fill)
tcPr.append(shd)
doc.add_paragraph()
footer_p = doc.add_paragraph()
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer_p.add_run('ContentScale  ·  app.contentscale.site  ·  GRAAF + CRAFT Framework  ·  By Ottmar Francisca')
fr.font.size = Pt(7)
fr.font.color.rgb = RGBColor(150, 150, 150)
doc.save(out_path)
print('OK')
`;
const tmpPy = path.join(os.tmpdir(), 'gendocx_' + Date.now() + '.py');
fs.writeFileSync(tmpPy, pyScript);
const py = spawn('python3', [tmpPy, tmpJson, tmpDocx]);
let stderr = '';
py.stderr.on('data', d => stderr += d);
py.on('close', code => {
fs.unlinkSync(tmpPy);
fs.unlinkSync(tmpJson);
if (code !== 0 || !fs.existsSync(tmpDocx)) {
return res.status(500).json({ error: 'DOCX generation failed', detail: stderr });
}
const buf = fs.readFileSync(tmpDocx);
fs.unlinkSync(tmpDocx);
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
res.setHeader('Content-Disposition', 'attachment; filename="contentscale-scan-report.docx"');
res.send(buf);
});
});
// ✅ /api/scan-log GET
app.get('/api/scan-log', async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
const userId = req.headers['x-user-id'];
if (!userId) return res.json({ success: false, error: 'No user ID' });
try {
const r = await pool.query(
`SELECT id, business_url, business_name, score, niche, city, country, email_found, email_status, source, recommendations, report_url, created_at
FROM scan_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`, [userId]
);
res.json({ success: true, scans: r.rows });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// ✅ /api/scan-log POST
app.post('/api/scan-log', async (req, res) => {
if (!pool) return res.json({ success: false });
const { user_id, business_url, business_name, score, niche, city, country, email_found, email_status, source, recommendations } = req.body;
try {
if (business_url) {
const existing = await pool.query(
`SELECT id, report_url FROM scan_log WHERE business_url = $1 LIMIT 1`,
[business_url]
);
if (existing.rows.length > 0) {
const row = existing.rows[0];
const existingReportUrl = row.report_url
? (row.report_url.startsWith('http') ? row.report_url : 'https://app.contentscale.site' + row.report_url)
: null;
return res.json({ success: true, skipped: true, reason: 'duplicate', report_url: existingReportUrl });
}
}
const reportId = crypto.randomBytes(20).toString('hex');
const reportUrl = '/report/' + reportId;
const insertResult = await pool.query(
`INSERT INTO scan_log (user_id, business_url, business_name, score, niche, city, country, email_found, email_status, source, recommendations, report_url)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
[
user_id || null, business_url, business_name || null, score || null,
niche || null, city || null, country || null, email_found || null,
email_status || 'no_email', source || 'single',
recommendations ? JSON.stringify(recommendations) : null,
reportUrl
]
);
const scanLogId = insertResult.rows[0]?.id || null;
await pool.query(
`INSERT INTO scan_reports (id, scan_log_id, business_url, business_name, score, niche, city, country, email_found, recommendations)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
[reportId, scanLogId, business_url || null, business_name || null, score || null,
niche || null, city || null, country || null, email_found || null,
recommendations ? JSON.stringify(recommendations) : null]
);
res.json({ success: true, report_url: 'https://app.contentscale.site' + reportUrl });
} catch (e) { res.json({ success: false, error: e.message }); }
});
// ✅ /api/admin/scan-log GET
app.get('/api/admin/scan-log', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
const limit = parseInt(req.query.limit) || 1000;
try {
const r = await pool.query(
`SELECT id, user_id, business_url, business_name, score, niche, city, country, email_found, email_status, source, recommendations, report_url, created_at
FROM scan_log ORDER BY created_at DESC LIMIT $1`, [limit]
);
res.json({ success: true, scans: r.rows });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// Public endpoint — total scans today across all sources (single, bulk, campaign)
app.get('/api/stats/scans-today', async (req, res) => {
if (!pool) return res.json({ success: true, count: 0 });
try {
const r = await pool.query(
`SELECT COUNT(*) FROM scan_log WHERE created_at >= NOW() - INTERVAL '24 hours'`
);
res.json({ success: true, count: parseInt(r.rows[0].count) || 0 });
} catch (e) { res.json({ success: true, count: 0 }); }
});
app.get('/api/admin/email-log', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
const limit = parseInt(req.query.limit) || 200;
const offset = parseInt(req.query.offset) || 0;
try {
const r = await pool.query(
`SELECT id, to_email, business_name, business_url, score, template_type, subject, status, sent_at, created_at
FROM email_queue ORDER BY COALESCE(sent_at, created_at) DESC LIMIT $1 OFFSET $2`,
[limit, offset]
);
const countRes = await pool.query(`SELECT COUNT(*) FROM email_queue WHERE status='sent'`);
res.json({ success: true, emails: r.rows, total: parseInt(countRes.rows[0].count) });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/admin/email-stats', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
try {
const today = new Date().toISOString().split('T')[0];
const [sentToday, queued, totalSent] = await Promise.all([
pool.query(`SELECT COUNT(*) FROM email_queue WHERE status='sent' AND sent_at::date = $1::date`, [today]),
pool.query(`SELECT COUNT(*) FROM email_queue WHERE status='pending'`),
pool.query(`SELECT COUNT(*) FROM email_queue WHERE status='sent'`)
]);
const dailyLimit = 100;
res.json({
success: true,
sentToday: parseInt(sentToday.rows[0].count),
dailyLimit,
remainingToday: Math.max(0, dailyLimit - parseInt(sentToday.rows[0].count)),
queued: parseInt(queued.rows[0].count),
totalSent: parseInt(totalSent.rows[0].count)
});
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/admin/leaderboard/pending', verifyAdmin, async (req, res) => {
try { const r = await pool.query(`SELECT * FROM leaderboard WHERE admin_verified = FALSE ORDER BY created_at DESC LIMIT 50`); res.json({ success: true, pending: r.rows }); }
catch (e) { res.json({ success: true, pending: [] }); }
});
app.post('/api/admin/leaderboard/:id/approve', verifyAdmin, async (req, res) => {
try {
const { final_country, city, niche } = req.body;
await pool.query(
`UPDATE leaderboard SET admin_verified = TRUE, is_verified = TRUE,
country = COALESCE($2, country),
city = COALESCE($3, city),
niche = COALESCE($4, niche)
WHERE id = $1`,
[req.params.id, final_country || null, city || null, niche || null]
);
res.json({ success: true });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/admin/leaderboard/:id/reject', verifyAdmin, async (req, res) => {
try { await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]); res.json({ success: true }); }
catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
try {
const { company_name, url, score, country, niche, page_count } = req.body;
const updates = []; const vals = []; let i = 1;
if (company_name) { updates.push(`company_name=$${i++}`); vals.push(company_name); }
if (url) { updates.push(`url=$${i++}`); vals.push(url); }
if (score) { updates.push(`score=$${i++}`); vals.push(parseInt(score)); }
if (country) { updates.push(`country=$${i++}`); vals.push(country); }
if (niche) { updates.push(`niche=$${i++}`); vals.push(niche); }
if (page_count) { updates.push(`page_count=$${i++}`); vals.push(parseInt(page_count)); }
if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
vals.push(req.params.id);
await pool.query(`UPDATE leaderboard SET ${updates.join(', ')} WHERE id = $${i}`, vals);
res.json({ success: true });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
try { await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]); res.json({ success: true }); }
catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
try {
const { url, company_name, score, country, niche } = req.body;
if (!url || score === undefined) return res.status(400).json({ success: false, error: 'URL/Score required' });
const r = await pool.query(`INSERT INTO leaderboard (url, company_name, score, country, niche, admin_verified, is_verified) VALUES ($1, $2, $3, $4, $5, true, true) ON CONFLICT (url) DO UPDATE SET score=EXCLUDED.score, company_name=COALESCE(EXCLUDED.company_name, leaderboard.company_name), niche=COALESCE(EXCLUDED.niche, leaderboard.niche), admin_verified=true RETURNING id`, [url, company_name, score, country, niche]);
res.json({ success: true, id: r.rows[0].id });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// ✅ Bulk Delete Leaderboard
app.post('/api/admin/leaderboard/bulk-delete', verifyAdmin, async (req, res) => {
try {
const { ids } = req.body;
if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'No IDs provided' });
const result = await pool.query('DELETE FROM leaderboard WHERE id = ANY($1)', [ids]);
res.json({ success: true, message: `Deleted ${result.rowCount} entries` });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// Freelancers Admin
app.get('/api/admin/freelancers/pending', verifyAdmin, async (req, res) => {
try { const r = await pool.query(`SELECT * FROM freelancers WHERE is_approved = FALSE ORDER BY created_at DESC LIMIT 50`); res.json({ success: true, pending: r.rows }); }
catch (e) { res.json({ success: true, pending: [] }); }
});
app.post('/api/admin/freelancers/:id/approve', verifyAdmin, async (req, res) => {
try { await pool.query('UPDATE freelancers SET is_approved = TRUE, is_verified = TRUE WHERE id = $1', [req.params.id]); res.json({ success: true }); }
catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
try { await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]); res.json({ success: true }); }
catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.put('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
try {
const { name, email, title, bio, hourly_rate, is_featured } = req.body;
const updates = []; const vals = []; let i = 1;
if (name) { updates.push(`name=$${i++}`); vals.push(name); }
if (email) { updates.push(`email=$${i++}`); vals.push(email); }
if (title) { updates.push(`title=$${i++}`); vals.push(title); }
if (bio) { updates.push(`bio=$${i++}`); vals.push(bio); }
if (hourly_rate) { updates.push(`hourly_rate=$${i++}`); vals.push(hourly_rate); }
if (is_featured !== undefined) { updates.push(`is_featured=$${i++}`); vals.push(is_featured); }
if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
vals.push(req.params.id);
await pool.query(`UPDATE freelancers SET ${updates.join(', ')} WHERE id = $${i}`, vals);
res.json({ success: true });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// ✅ Bulk Delete Freelancers
app.post('/api/admin/freelancers/bulk-delete', verifyAdmin, async (req, res) => {
try {
const { ids } = req.body;
if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'No IDs provided' });
const result = await pool.query('DELETE FROM freelancers WHERE id = ANY($1)', [ids]);
res.json({ success: true, message: `Deleted ${result.rowCount} profiles` });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// ✅ Bulk Delete Scan Logs
app.post('/api/admin/scan-log/bulk-delete', verifyAdmin, async (req, res) => {
try {
const { ids } = req.body;
if (!ids || !Array.isArray(ids) || ids.length === 0) {
return res.status(400).json({ success: false, error: 'No IDs provided' });
}
await pool.query('DELETE FROM scan_reports WHERE scan_log_id = ANY($1)', [ids]);
const result = await pool.query('DELETE FROM scan_log WHERE id = ANY($1)', [ids]);
console.log(`✅ Bulk deleted ${result.rowCount} scan log(s)`);
res.json({ success: true, message: `Deleted ${result.rowCount} scan log(s)`, deleted: result.rowCount });
} catch (e) {
console.error('❌ Bulk delete scan logs error:', e.message);
res.status(500).json({ success: false, error: e.message });
}
});
app.delete('/api/admin/scan-log/delete-all', verifyAdmin, async (req, res) => {
try {
await pool.query('DELETE FROM scan_reports');
const result = await pool.query('DELETE FROM scan_log');
console.log(`✅ Deleted all ${result.rowCount} scan log entries`);
res.json({ success: true, deleted: result.rowCount });
} catch(e) {
res.status(500).json({ success: false, error: e.message });
}
});
// Leaderboard Public
app.get('/api/leaderboard', async (req, res) => {
if (!pool) return res.json({ success: true, entries: [], stats: {} });
try {
const r = await pool.query(`SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as rank, company_name, url, score, country, niche, business_type, page_count, is_verified as is_claimed, admin_verified, created_at FROM leaderboard WHERE score IS NOT NULL AND is_opted_out = FALSE ORDER BY score DESC LIMIT 100`);
// Strip sitemap paths — only expose homepage URL publicly to prevent fraud
const rows = r.rows.map(row => {
try {
const u = new URL(row.url.startsWith('http') ? row.url : 'https://' + row.url);
return { ...row, url: u.protocol + '//' + u.hostname };
} catch(e) { return row; }
});
const entries = rows;
const total = entries.length;
const avg = total > 0 ? Math.round(entries.reduce((sum, e) => sum + (e.score || 0), 0) / total) : 0;
const countries = [...new Set(entries.map(e => e.country))].length;
const verified = entries.filter(e => e.admin_verified).length;
const fr = await pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE').catch(() => ({ rows: [{ count: 0 }] }));
res.json({ success: true, entries, total, averageScore: avg, stats: { totalAgencies: total, avgScore: avg, countriesCount: countries, activeHelpers: parseInt(fr.rows[0].count) || 0, verifiedCount: verified } });
} catch (e) { res.json({ success: true, entries: [], stats: {} }); }
});
app.post('/api/leaderboard/submit', async (req, res) => {
if (!pool) return res.json({ success: false, error: 'Database unavailable' });
const { url, company_name, score, country, niche } = req.body;
if (!url || score === undefined) return res.status(400).json({ success: false, error: 'URL and Score are required' });
try {
const finalScore = parseInt(score);
const r = await pool.query(
`INSERT INTO leaderboard (url, company_name, score, country, niche, admin_verified, is_verified, submission_ip)
VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6)
ON CONFLICT (url) DO UPDATE SET
score = EXCLUDED.score,
company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
niche = COALESCE(EXCLUDED.niche, leaderboard.niche),
admin_verified = FALSE, is_verified = FALSE
RETURNING id`,
[url, company_name || null, finalScore, country || 'NL', niche || null, req.ip || req.connection.remoteAddress]
);
res.json({ success: true, id: r.rows[0]?.id, message: 'Submission received. Pending admin approval.' });
} catch (e) {
console.error('Leaderboard submit error:', e.message);
res.status(500).json({ success: false, error: e.message });
}
});
app.get('/api/freelancers', async (req, res) => {
if (!pool) return res.json({ success: true, freelancers: [] });
try {
const r = await pool.query(`SELECT id, name, email, title, location, country, bio, hourly_rate, is_verified, is_featured FROM freelancers WHERE is_approved = TRUE ORDER BY is_featured DESC, created_at DESC LIMIT 50`);
res.json({ success: true, freelancers: r.rows });
} catch (e) { res.json({ success: true, freelancers: [] }); }
});
app.post('/api/freelancers/register', async (req, res) => {
if (!pool) return res.status(503).json({ success: false, error: 'DB down' });
try {
const { name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_featured } = req.body;
if (!name || !email) return res.status(400).json({ success: false, error: 'Name/Email required' });
const exists = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
if (exists.rows.length > 0) return res.status(400).json({ success: false, error: 'Email exists' });
const r = await pool.query(`INSERT INTO freelancers (name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_approved, is_featured) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10) RETURNING id`, [name, email, title || null, location || null, country || null, bio || null, linkedin_url || null, hourly_rate || null, availability || null, is_featured || false]);
res.json({ success: true, id: r.rows[0].id });
} catch (e) { res.status(500).json({ success: false, error: 'Failed' }); }
});
// ============================================
// 🗺️ SITEMAP SCANNER ENDPOINTS
// ============================================
// Fetch and parse sitemap → return URL list
app.post('/api/sitemap/urls', async (req, res) => {
const { url } = req.body;
if (!url) return res.status(400).json({ success: false, error: 'Sitemap URL required' });
try {
// No xml2js needed — parse <loc> tags with regex (works for all standard sitemaps)
const extractLocs = (xml) => {
const locs = [];
const re = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
let m;
while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
return locs;
};
const fetchXml = async (sitemapUrl) => {
const resp = await axios.get(sitemapUrl, { timeout: 15000, headers: { 'User-Agent': 'ContentScaleBot/1.0' }, responseType: 'text' });
return resp.data;
};
const xml = await fetchXml(url);
let urls = [];
// Sitemap index — contains sub-sitemap URLs
if (xml.includes('<sitemapindex')) {
const subSitemapUrls = extractLocs(xml);
for (const smUrl of subSitemapUrls.slice(0, 10)) {
try {
const subXml = await fetchXml(smUrl);
urls.push(...extractLocs(subXml));
} catch(e) { /* skip broken sub-sitemap */ }
}
} else {
// Regular urlset
urls = extractLocs(xml);
}
// Deduplicate + filter out non-page URLs
const filtered = [...new Set(urls)].filter(u => {
const skip = ['/tag/', '/category/', '/author/', '/feed/', '?', '#', '.xml', '.pdf', '.jpg', '.png'];
return !skip.some(s => u.includes(s));
});
res.json({ success: true, urls: filtered, total: filtered.length });
} catch (e) {
res.status(500).json({ success: false, error: 'Could not fetch sitemap: ' + e.message });
}
});
// Submit aggregate sitemap scan result as pending leaderboard entry
const AUTO_APPROVE_DOMAINS = ['contentscale.site', 'app.contentscale.site'];
app.post('/api/sitemap/submit', async (req, res) => {
const { domain, company_name, avg_score, avg_graaf, avg_craft, avg_technical, page_count, page_scores, country, niche, business_type } = req.body;
if (!domain || avg_score === undefined) return res.status(400).json({ success: false, error: 'Missing required fields' });
const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const autoApprove = AUTO_APPROVE_DOMAINS.includes(cleanDomain);
try {
const r = await pool.query(
`INSERT INTO leaderboard (url, company_name, score, graaf_score, craft_score, technical_score, country, niche, business_type, page_count, page_scores, scan_source, admin_verified, is_verified)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'sitemap', $12, $12)
ON CONFLICT (url) DO UPDATE SET
score = EXCLUDED.score,
graaf_score = EXCLUDED.graaf_score,
craft_score = EXCLUDED.craft_score,
technical_score = EXCLUDED.technical_score,
country = EXCLUDED.country,
niche = EXCLUDED.niche,
business_type = EXCLUDED.business_type,
company_name = EXCLUDED.company_name,
page_count = EXCLUDED.page_count,
page_scores = EXCLUDED.page_scores,
scan_source = 'sitemap',
admin_verified = $12,
is_verified = $12
RETURNING id`,
[domain, company_name || null, Math.round(avg_score), Math.round(avg_graaf), Math.round(avg_craft), Math.round(avg_technical), country || null, niche || null, business_type || null, page_count, JSON.stringify(page_scores || []), autoApprove]
);
res.json({ success: true, id: r.rows[0].id, auto_approved: autoApprove });
} catch (e) {
res.status(500).json({ success: false, error: e.message });
}
});
// ============================================================
// 🔗 SHARE BULK RESULTS AS URL
// ============================================================
const shareStore = new Map(); // in-memory, survives restarts via DB below
app.post('/api/share/bulk', async (req, res) => {
const { results } = req.body;
if (!results || !results.length) return res.status(400).json({ success: false, error: 'No results' });
const token = crypto.randomBytes(8).toString('hex');
const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
try {
await pool.query(
`INSERT INTO share_results (token, results_json, expires_at) VALUES ($1, $2, to_timestamp($3/1000.0))
ON CONFLICT DO NOTHING`,
[token, JSON.stringify(results), expires]
);
} catch(e) {
// Table may not exist yet — try create
try {
await pool.query(`CREATE TABLE IF NOT EXISTS share_results (
id SERIAL PRIMARY KEY,
token VARCHAR(20) UNIQUE NOT NULL,
results_json JSONB NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW(),
expires_at TIMESTAMPTZ
)`);
await pool.query(
`INSERT INTO share_results (token, results_json, expires_at) VALUES ($1, $2, to_timestamp($3/1000.0))`,
[token, JSON.stringify(results), expires]
);
} catch(e2) {
// Fallback: memory only
shareStore.set(token, { results, expires });
}
}
shareStore.set(token, { results, expires });
res.json({ success: true, token });
});
app.get('/share/:token', async (req, res) => {
const { token } = req.params;
let results = null;
// Try memory first
const mem = shareStore.get(token);
if (mem && mem.expires > Date.now()) results = mem.results;
// Try DB
if (!results) {
try {
const r = await pool.query(`SELECT results_json FROM share_results WHERE token=$1 AND expires_at > NOW()`, [token]);
if (r.rows.length) results = r.rows[0].results_json;
} catch(e) {}
}
if (!results) return res.status(404).send('<h1>Link expired or not found</h1>');
const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
const avgScore = Math.round(results.reduce((s,r) => s+r.score,0)/results.length);
const scoreColor = avgScore>=85?'#16a34a':avgScore>=70?'#b45309':'#dc2626';
const domains = [...new Set(results.map(r => r.url.replace(/https?:\/\//,'').split('/')[0]))];
const sameDomain = domains.length === 1;
const rows = results.map((r,i) => {
const lbl = r.score>=95?'Elite':r.score>=90?'Excellent':r.score>=85?'Strong':r.score>=80?'Good':r.score>=75?'Solid':r.score>=70?'Qualified':'Needs Work';
const sc  = r.score>=85?'#16a34a':r.score>=70?'#b45309':'#dc2626';
const domain = r.url.replace(/https?:\/\//,'').split('/')[0];
const path   = r.url.replace(/https?:\/\/[^/]+/,'') || '/';
return `
<tr style="border-bottom:1px solid #e5e7eb;">
   <td style="padding:12px 16px;font-size:14px;color:#374151;">${i+1}</td>
   <td style="padding:12px 16px;">
      <div style="font-weight:600;font-size:14px;color:#111827;">${domain}</div>
      <div style="font-size:12px;color:#6b7280;">${path}</div>
   </td>
   <td style="padding:12px 16px;text-align:center;"><span style="font-size:20px;font-weight:900;color:${sc};">${r.score}</span></td>
   <td style="padding:12px 16px;text-align:center;font-size:13px;color:#7e22ce;">${r.metrics?.graaf||0}/50</td>
   <td style="padding:12px 16px;text-align:center;font-size:13px;color:#1d4ed8;">${r.metrics?.craft||0}/30</td>
   <td style="padding:12px 16px;text-align:center;font-size:13px;color:#b45309;">${r.metrics?.technical||0}/20</td>
   <td style="padding:12px 16px;"><span style="background:${sc};color:white;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;">${lbl}</span></td>
   <td style="padding:12px 16px;"><a href="${r.url}" target="_blank" style="font-size:12px;color:#7e22ce;font-weight:600;text-decoration:none;">Visit →</a></td>
</tr>
`;
}).join('');
const html = `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>ContentScale Scan Report — ${sameDomain?domains[0]:results.length+' sites'}</title>
      <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,Helvetica,sans-serif;background:#f9fafb;color:#111827;}@media print{.no-print{display:none!important;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
   </head>
   <body style="max-width:900px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#5b21b6,#7e22ce,#be185d);padding:40px;color:white;">
         <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
            <div>
               <div style="font-size:20px;font-weight:900;">ContentScale</div>
               <div style="font-size:12px;opacity:0.7;margin-top:2px;">SEO Recovery Platform · Amsterdam</div>
            </div>
            <div style="text-align:right;font-size:12px;opacity:0.75;">${today}</div>
         </div>
         <h1 style="font-size:26px;font-weight:900;margin-bottom:6px;">Bulk Scan Report</h1>
         <p style="opacity:0.85;font-size:14px;">${results.length} URLs scanned${sameDomain?' · '+domains[0]:''}</p>
      </div>
      ${sameDomain?`
      <div style="padding:32px 40px;background:white;border-bottom:2px solid #e5e7eb;text-align:center;">
         <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Average Domain Score</div>
         <div style="font-size:64px;font-weight:900;color:${scoreColor};line-height:1;">${avgScore}</div>
         <div style="font-size:13px;color:#6b7280;margin-top:4px;">${results.length} pages · ${domains[0]}</div>
      </div>
      `:''}
      <div style="padding:32px 40px;overflow-x:auto;">
         <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
            <thead>
               <tr style="background:#f5f3ff;">
                  <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">#</th>
                  <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">URL</th>
                  <th style="padding:12px 16px;text-align:center;font-size:12px;color:#6b7280;">Score</th>
                  <th style="padding:12px 16px;text-align:center;font-size:12px;color:#7e22ce;">GRAAF</th>
                  <th style="padding:12px 16px;text-align:center;font-size:12px;color:#1d4ed8;">CRAFT</th>
                  <th style="padding:12px 16px;text-align:center;font-size:12px;color:#b45309;">Technical</th>
                  <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">Tier</th>
                  <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">Link</th>
               </tr>
            </thead>
            <tbody>${rows}</tbody>
         </table>
      </div>
      <div style="background:#111827;padding:24px 40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
         <div>
            <div style="color:white;font-weight:700;font-size:14px;">ContentScale</div>
            <div style="color:#9ca3af;font-size:12px;">Ottmar JG Francisca · Amsterdam</div>
         </div>
         <a href="https://contentscale.site" style="color:#a855f7;font-size:12px;font-weight:700;text-decoration:none;">contentscale.site</a>
      </div>
      <div class="no-print" style="text-align:center;padding:20px;"><button onclick="window.print()" style="background:linear-gradient(135deg,#7e22ce,#4f46e5);color:white;border:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Print / Save PDF</button></div>
   </body>
</html>
`;
res.send(html);
});
function computeScore(scanUrl, analysis, extractedEmails) {
extractedEmails = extractedEmails || [];
// ── SCORING ──
let graafScore = 0;
if (analysis.wordCount >= 2500)      graafScore += 10;
else if (analysis.wordCount >= 1500) graafScore += 7;
else if (analysis.wordCount >= 1000) graafScore += 4;
else if (analysis.wordCount >= 500)  graafScore += 2;
if (analysis.statsFound >= 8)        graafScore += 8;
else if (analysis.statsFound >= 5)   graafScore += 5;
else if (analysis.statsFound >= 3)   graafScore += 3;
if (analysis.expertQuoteCount >= 4)  graafScore += 8;
else if (analysis.expertQuoteCount >= 2) graafScore += 5;
else if (analysis.expertQuoteCount >= 1) graafScore += 2;
if (analysis.caseStudyCount >= 2)    graafScore += 8;
else if (analysis.caseStudyCount >= 1) graafScore += 4;
if (analysis.hasDirectAnswer)        graafScore += 6;
if (analysis.hasTLDR)               graafScore += 4;
if (analysis.listItemCount >= 15)    graafScore += 6;
else if (analysis.listItemCount >= 8) graafScore += 4;
else if (analysis.listItemCount >= 3) graafScore += 2;
graafScore = Math.min(50, graafScore);
let craftScore = 0;
if (analysis.h1VisibleCount === 1 && !analysis.h1IsGeneric && !analysis.h1IsTooShort) craftScore += 8;
else if (analysis.h1VisibleCount === 1) craftScore += 3;
else if (analysis.h1VisibleCount > 1)   craftScore += 2;
if (analysis.h2Count >= 5)          craftScore += 7;
else if (analysis.h2Count >= 3)     craftScore += 5;
else if (analysis.h2Count >= 1)     craftScore += 2;
if (analysis.avgParagraphLength <= 60)       craftScore += 5;
else if (analysis.avgParagraphLength <= 100) craftScore += 3;
if (analysis.hasFAQContent)         craftScore += 5;
if (analysis.hasTOC)                craftScore += 3;
if (analysis.hasAuthorBio)          craftScore += 2;
craftScore = Math.min(30, craftScore);
let technicalScore = 0;
if (analysis.metaTitleLength >= 50 && analysis.metaTitleLength <= 60) technicalScore += 3;
else if (analysis.metaTitleLength > 0) technicalScore += 1;
if (analysis.metaDescriptionLength >= 140 && analysis.metaDescriptionLength <= 165) technicalScore += 3;
// meta description exists fallback removed — points reallocated to OG/Twitter
if (analysis.hasArticleSchema)      technicalScore += 3; // was 4
if (analysis.hasFAQPageSchema)      technicalScore += 3; // was 4
if (analysis.hasCanonical)          technicalScore += 1; // was 2
if (analysis.images > 0 && analysis.imagesWithAlt >= Math.min(5, analysis.images)) technicalScore += 1; // was 2
else if (analysis.images > 0 && analysis.imagesWithAlt > 0) technicalScore += 1;
if (analysis.hasMetaViewport)       technicalScore += 2;
if (analysis.hasOpenGraph)          technicalScore += 2; // NEW
if (analysis.hasTwitterCard)        technicalScore += 1; // NEW
technicalScore = Math.min(20, technicalScore);
const totalScore = Math.min(100, graafScore + craftScore + technicalScore);
const quality = totalScore >= 95 ? 'elite' : totalScore >= 90 ? 'excellent' : totalScore >= 80 ? 'very good' : totalScore >= 70 ? 'good' : totalScore >= 60 ? 'average' : 'needs improvement';
// ── RECOMMENDATIONS ──
const recommendations = [];
if (analysis.wordCount < 500) {
recommendations.push({ title: '🚨 Critical: Content Is Too Thin', description: `Only ${analysis.wordCount} words found. This is well below what Google considers a substantive page.`, priority: 'high', action: 'Expand with deep explanations, examples, case studies, and FAQs. Aim for 2,500+ words.', learning: "Thin content (< 500 words) is the #1 trigger for Google Helpful Content penalties. Pages with 2,500+ words earn 3.7x more backlinks on average (Backlinko).", target: 'Minimum 1,500 words; ideal 2,500+' });
} else if (analysis.wordCount < 1500) {
recommendations.push({ title: '📝 Increase Content Depth', description: `${analysis.wordCount} words found — decent start, but below the threshold for competitive rankings.`, priority: 'medium', action: "Add a FAQ section (5–8 questions), a 'How it works' breakdown, or real client examples.", learning: "Pages ranking on page 1 average 1,890 words. Google's QRG rewards 'comprehensive, accurate, clearly written' content.", target: '1,500+ words minimum; 2,500+ for competitive terms' });
} else if (analysis.wordCount < 2500) {
recommendations.push({ title: '📊 Content Length: Good But Not Elite', description: `${analysis.wordCount} words is solid. 400–800 more strategic words pushes you from Good to Elite tier.`, priority: 'low', action: "Add a case study with before/after metrics, an expert quote section, or a 'Key Takeaways' summary.", learning: "Long-form content earns 77% more backlinks than short content.", target: '2,500+ words for GRAAF Elite tier' });
}
if (analysis.statsFound < 3) {
recommendations.push({ title: '📈 Add Data & Statistics', description: `Only ${analysis.statsFound} measurable data points found.`, priority: 'high', action: "Add 8+ statistics from 2023–2025 sources. Format: 'X% of [group] report [outcome] ([Source Name, Year])'.", learning: "Data-backed content earns 3x more backlinks. Statistics signal the Accuracy pillar of GRAAF.", target: '8+ cited statistics from reputable 2023–2025 sources' });
} else if (analysis.statsFound < 8) {
recommendations.push({ title: '📈 Strengthen Your Evidence Base', description: `Found ${analysis.statsFound} data points. Reaching 8+ unlocks the full GRAAF statistics score.`, priority: 'medium', action: "Add recent statistics (2023–2025) with full attribution.", learning: "Pages with 8+ cited statistics rank 47% higher for informational queries.", target: '8+ cited statistics with source and year' });
}
if (analysis.expertQuoteCount === 0) {
recommendations.push({ title: '💬 Add Expert Quotes & Credibility Signals', description: 'No expert quotes, attributed testimonials, or blockquote credibility signals detected.', priority: 'high', action: `Add 3–5 quotes from named experts. Format: "Quote text" — [Name, Title, Organization].`, learning: "Google's E-E-A-T explicitly rewards content that cites credible outside sources.", target: '3–5 attributed expert quotes using blockquote + cite HTML' });
} else if (analysis.expertQuoteCount < 3) {
recommendations.push({ title: '💬 Add More Expert Citations', description: `Found ${analysis.expertQuoteCount} credibility signal(s). 2 more would unlock the full GRAAF credibility score.`, priority: 'medium', action: "Add quotes from industry publications or recognized professionals.", learning: "Expert citations are the fastest way to improve your GRAAF Authoritativeness score.", target: '3–5 attributed expert quotes' });
}
if (analysis.caseStudyCount === 0) {
recommendations.push({ title: '📊 Add Case Studies With Real Metrics', description: "No case studies with measurable results detected.", priority: 'high', action: "Add a 'Challenge / Solution / Results' section with real percentages or numbers.", learning: "The first 'E' in E-E-A-T is Experience. Case studies with real metrics are the most direct proof.", target: '2 case studies with Challenge/Solution/Results format and measurable metrics' });
} else if (analysis.caseStudyCount < 2) {
recommendations.push({ title: '📊 Add a Second Case Study', description: `Found ${analysis.caseStudyCount} case study section.`, priority: 'medium', action: "Add another real-world example with before/after metrics.", learning: "Two diverse case studies signal consistent, repeatable results.", target: '2 case studies with quantifiable results' });
}
if (!analysis.hasDirectAnswer) {
recommendations.push({ title: '🎯 Add a Direct Answer Box', description: 'No concise direct answer detected in the first 150 words.', priority: 'high', action: "Write a 40–80 word paragraph immediately after your H1 that directly answers the main question.", learning: "Pages with a clear direct answer in the first 150 words are 4.5x more likely to appear in Google AI Overviews.", target: '40–80 word direct answer paragraph within first 150 words' });
}
if (!analysis.hasTLDR) {
recommendations.push({ title: '📌 Add a TL;DR / Key Takeaways Section', description: "No 'Key Takeaways' or 'Quick Summary' section detected.", priority: 'medium', action: "Add a 'Key Takeaways' section near the top with 5 bullet points.", learning: "Bullet-formatted summaries are heavily favored by Google's AI for snippet extraction.", target: '5 bullet takeaways with specific stats near the top of the page' });
}
if (analysis.listItemCount < 5) {
recommendations.push({ title: '📋 Improve Scannability With Lists', description: `Only ${analysis.listItemCount} list items found.`, priority: 'medium', action: "Convert key points into bulleted or numbered lists. Aim for 15+ list items.", learning: "79% of users scan web content. Lists increase chances of featured snippet selection.", target: '15+ list items spread naturally through the content' });
} else if (analysis.listItemCount < 15) {
recommendations.push({ title: '📋 Add More Structured Lists', description: `${analysis.listItemCount} list items found.`, priority: 'low', action: "Look for sections with 3+ parallel ideas and convert them to bullet lists.", learning: "Structured lists signal scannable, user-friendly content.", target: '15+ list items' });
}
if (analysis.h1Count === 0) {
recommendations.push({ title: '🚨 Critical: No H1 Heading Found', description: 'No H1 tag detected.', priority: 'high', action: "Add exactly one H1 tag near the top of the page containing your primary keyword.", learning: "The H1 is Google's strongest on-page keyword signal.", target: 'Exactly 1 H1 tag with primary keyword in the first 30 characters' });
} else if (analysis.h1IsHidden && analysis.h1VisibleCount === 0) {
recommendations.push({ title: '🚨 Critical: H1 Is Hidden (display:none / visibility:hidden)', description: `An H1 exists in the HTML but is hidden with CSS.`, priority: 'high', action: "Remove the CSS hiding your H1. Make it visible.", learning: "Hidden H1s are sometimes used as an SEO trick. Google ignores hidden content for ranking signals.", target: '1 fully visible H1 containing primary keyword' });
} else if (analysis.h1VisibleCount > 1) {
recommendations.push({ title: '⚠️ Multiple H1 Tags Detected', description: `Found ${analysis.h1VisibleCount} visible H1 tags.`, priority: 'medium', action: "Keep only one H1. Demote the rest to H2 or H3.", learning: "Multiple H1s tell Google your page has multiple main topics.", target: 'Exactly 1 H1 tag per page' });
} else if (analysis.h1IsGeneric) {
recommendations.push({ title: '⚠️ H1 Is Too Generic — Add a Real Keyword', description: `Your H1 "${analysis.h1Text}" contains no specific keyword.`, priority: 'high', action: "Replace your H1 with a specific keyword phrase.", learning: "Generic H1s like 'Home' or 'Welcome' provide zero keyword signal to Google.", target: 'H1 with primary keyword + specific value in 30–70 characters' });
} else if (analysis.h1IsTooShort) {
recommendations.push({ title: '⚠️ H1 Too Short — Expand With Keywords', description: `Your H1 "${analysis.h1Text}" is only ${analysis.h1Length} characters.`, priority: 'medium', action: "Expand your H1 to 30–70 characters.", learning: "H1s under 10 characters provide minimal keyword signal.", target: 'H1 of 30–70 characters with primary keyword' });
} else if (analysis.h1IsTooLong) {
recommendations.push({ title: '📝 H1 Too Long — Trim for Clarity', description: `Your H1 is ${analysis.h1Length} characters.`, priority: 'low', action: "Trim your H1 to 70 characters or fewer.", learning: "H1s over 70 characters reduce keyword density.", target: 'H1 under 70 characters' });
}
if (analysis.h2Count < 3) {
recommendations.push({ title: '📑 Add More Section Headings (H2s)', description: `Only ${analysis.h2Count} H2 headings found.`, priority: 'medium', action: "Structure your content with 5+ H2 headings.", learning: "H2s are crawlability signals. Content with 5+ H2s ranks 23% higher for secondary keywords.", target: '5+ H2 headings with keyword-rich, descriptive text' });
}
if (analysis.avgParagraphLength > 100) {
recommendations.push({ title: '📱 Shorten Paragraphs for Mobile Readability', description: `Average paragraph length is ${Math.round(analysis.avgParagraphLength)} words.`, priority: 'medium', action: "Break paragraphs at 50–80 words maximum.", learning: "Paragraphs over 100 words increase mobile abandonment by 37%.", target: 'Average paragraph length 40–80 words' });
}
if (!analysis.hasFAQContent) {
recommendations.push({ title: '❓ Add a FAQ Section', description: "No FAQ section detected.", priority: 'medium', action: "Add an FAQ section with 5–10 real questions your audience asks.", learning: "'People Also Ask' boxes now appear in 80% of Google searches.", target: "FAQ section titled 'Frequently Asked Questions' with 5–10 Q&A pairs" });
}
if (!analysis.hasTOC) {
recommendations.push({ title: '📑 Add a Table of Contents', description: 'No Table of Contents detected.', priority: 'low', action: "Add a 'Table of Contents' section after your intro with anchor links to each H2.", learning: "Pages with a TOC are more likely to receive sitelinks in Google search results.", target: 'Table of Contents with anchor links to all H2 sections' });
}
if (!analysis.hasAuthorBio) {
recommendations.push({ title: '✍️ Add an Author Bio', description: 'No author bio detected.', priority: 'medium', action: "Add a 200–250 word author bio with credentials, certifications, and achievements.", learning: "E-E-A-T's first 'E' is Experience. Google's quality raters look for evidence of real credentials.", target: '200–250 word author bio with credentials and measurable achievements' });
}
if (!analysis.hasArticleSchema) {
recommendations.push({ title: '🛠️ Add Article Schema (JSON-LD)', description: "No Article, BlogPosting, or NewsArticle schema detected.", priority: 'high', action: "Add Article JSON-LD schema to your <head> with headline, author, datePublished, dateModified.", learning: "Article schema enables rich snippets and tells Google exactly what type of content this is.", target: 'Article or BlogPosting JSON-LD schema with author, datePublished, dateModified' });
   }
   if (analysis.hasFAQContent && !analysis.hasFAQPageSchema) {
   recommendations.push({ title: '🛠️ Add FAQPage Schema to Your FAQ Section', description: 'FAQ content detected but no FAQPage schema found.', priority: 'high', action: "Generate FAQPage JSON-LD for all your FAQ questions.", learning: "FAQPage schema makes your FAQ answers eligible for expanded 'People Also Ask' appearances.", target: 'FAQPage JSON-LD with all Q&A pairs marked up' });
   } else if (!analysis.hasFAQContent && !analysis.hasFAQPageSchema) {
   recommendations.push({ title: '🛠️ Add FAQ Section + FAQPage Schema', description: 'No FAQ section or FAQPage schema detected.', priority: 'medium', action: "1) Add a FAQ section. 2) Add FAQPage JSON-LD schema.", learning: "FAQPage schema is one of the highest-ROI schema types available.", target: 'FAQ section + FAQPage JSON-LD schema' });
   }
   if (!analysis.hasCanonical) {
   recommendations.push({ title: '🔗 Add a Canonical Tag', description: 'No canonical tag detected.', priority: 'medium', action: `Add <link rel="canonical" href="..."> to your <head>.`, learning: "Canonical tags prevent duplicate content penalties.", target: 'Self-referencing canonical tag in <head>' });
         }
         if (analysis.metaTitleLength === 0) {
         recommendations.push({ title: '🏷️ Critical: Missing Meta Title', description: 'No title tag found.', priority: 'high', action: "Add a <title> tag with 50–60 characters containing your primary keyword.", learning: "The title tag is Google's #1 on-page SEO signal.", target: '50–60 character title tag with primary keyword in first 30 characters' });
            } else if (analysis.metaTitleLength < 40) {
            recommendations.push({ title: '🏷️ Meta Title Too Short', description: `Title is ${analysis.metaTitleLength} characters.`, priority: 'low', action: "Expand to 50–60 characters.", learning: "Title tags of 50–60 characters maximize click-through rate.", target: '50–60 characters' });
            } else if (analysis.metaTitleLength > 65) {
            recommendations.push({ title: '🏷️ Meta Title Too Long — Will Be Truncated', description: `Title is ${analysis.metaTitleLength} characters.`, priority: 'low', action: "Trim to 50–60 characters.", learning: "Truncated titles appear incomplete in search results.", target: '50–60 characters' });
            }
            if (analysis.metaDescriptionLength === 0) {
            recommendations.push({ title: '📝 Missing Meta Description', description: 'No meta description found.', priority: 'medium', action: "Add a <meta name=\"description\"> with 140–160 characters including a CTA.", learning: "Meta descriptions are your search result ad copy. Compelling descriptions increase clicks by 5–20%.", target: '140–160 character meta description with keyword + CTA' });
            } else if (analysis.metaDescriptionLength < 100) {
            recommendations.push({ title: '📝 Meta Description Too Short', description: `Description is ${analysis.metaDescriptionLength} characters.`, priority: 'low', action: "Expand to 140–160 characters.", learning: "Longer, compelling meta descriptions consistently outperform short ones.", target: '140–160 characters with keyword + CTA' });
            } else if (analysis.metaDescriptionLength > 165) {
            recommendations.push({ title: '📝 Meta Description Too Long', description: `Description is ${analysis.metaDescriptionLength} characters.`, priority: 'low', action: "Trim to 140–160 characters.", learning: "Truncated descriptions end mid-sentence in search results.", target: '140–160 characters' });
            }
            if (analysis.images === 0) {
            recommendations.push({ title: '🖼️ Add Images to Your Content', description: 'No images detected.', priority: 'medium', action: "Add at least 3–5 images with descriptive alt text.", learning: "Content with images gets 94% more views.", target: '3–5 images with descriptive alt text on every image' });
            } else if (analysis.imagesWithAlt < Math.min(analysis.images, 3)) {
            recommendations.push({ title: '🖼️ Add Alt Text to Your Images', description: `${analysis.images} images found but only ${analysis.imagesWithAlt} have alt text.`, priority: 'medium', action: "Add descriptive alt text to every image.", learning: "Alt text serves three purposes: Google understanding, accessibility, and keyword signals.", target: 'Alt text on 100% of images' });
            }
            if (analysis.internalLinks < 5) {
            recommendations.push({ title: '🔗 Add More Internal Links', description: `Only ${analysis.internalLinks} internal links found.`, priority: 'medium', action: "Add 8–12 contextual internal links to related pages.", learning: "Internal links transfer link equity and help Google crawl faster.", target: '8–12 internal links with descriptive anchor text' });
            } else if (analysis.internalLinks < 8) {
            recommendations.push({ title: '🔗 Strengthen Internal Link Structure', description: `${analysis.internalLinks} internal links found.`, priority: 'low', action: "Find unlinked topic mentions and add contextual links.", learning: "Every internal link is a vote for the destination page.", target: '8–12 internal links' });
            }
            if (analysis.externalLinks === 0) {
            recommendations.push({ title: '🌐 Add Authoritative External Links', description: 'No external links found.', priority: 'low', action: "Link out to 3–5 authoritative sources (.gov, .edu, industry pubs).", learning: "Linking out to authoritative sites signals research depth and quality.", target: '3–5 outbound links to authoritative sources' });
            }
            if (!analysis.hasOpenGraph) {
            recommendations.push({ title: '📱 Add Open Graph Meta Tags', description: 'No Open Graph tags detected.', priority: 'low', action: "Add og:title, og:description, og:image (1200×630px), og:url to your <head>.", learning: "Open Graph tags control how your page appears when shared socially.", target: 'og:title, og:description, og:image (1200x630px), og:url' });
               }
               const finalRecommendations = recommendations.length > 0 ? recommendations : [{
               title: '🏆 Elite Content — Outstanding Work!',
               description: 'Your page meets all GRAAF Framework, CRAFT, and Technical SEO requirements.',
               priority: 'none',
               action: 'Maintain this standard. Review content quarterly for freshness updates.',
               learning: 'Consistent, high-quality content builds domain authority over time.',
               target: 'Maintain Elite score; review and update quarterly'
               }];
               const result = {
               success: true, url: scanUrl, score: totalScore, quality,
               metrics: { graaf: graafScore, craft: craftScore, technical: technicalScore },
               content_stats: {
               wordCount: analysis.wordCount, emails_found: extractedEmails,
               extractedEmail: extractedEmails[0] || null,
               h1Count: analysis.h1Count, h1Text: analysis.h1Text, h1Length: analysis.h1Length,
               h1VisibleCount: analysis.h1VisibleCount, h1IsGeneric: analysis.h1IsGeneric,
               h1IsTooShort: analysis.h1IsTooShort, h1IsTooLong: analysis.h1IsTooLong,
               h2Count: analysis.h2Count, h3Count: analysis.h3Count,
               listItemCount: analysis.listItemCount,
               avgParagraphLength: Math.round(analysis.avgParagraphLength),
               metaTitleLength: analysis.metaTitleLength, metaDescriptionLength: analysis.metaDescriptionLength,
               hasMetaViewport: analysis.hasMetaViewport, hasCanonical: analysis.hasCanonical,
               hasArticleSchema: analysis.hasArticleSchema, hasFAQPageSchema: analysis.hasFAQPageSchema,
               hasOrganizationSchema: analysis.hasOrganizationSchema,
               hasOpenGraph: analysis.hasOpenGraph, hasTwitterCard: analysis.hasTwitterCard,
               hasDirectAnswer: analysis.hasDirectAnswer, hasTLDR: analysis.hasTLDR,
               hasTOC: analysis.hasTOC, hasAuthorBio: analysis.hasAuthorBio,
               hasFAQContent: analysis.hasFAQContent,
               images: analysis.images, imagesWithAlt: analysis.imagesWithAlt,
               internalLinks: analysis.internalLinks, externalLinks: analysis.externalLinks,
               expertQuoteCount: analysis.expertQuoteCount, caseStudyCount: analysis.caseStudyCount,
               statsFound: analysis.statsFound
               },
               recommendations: { all: finalRecommendations, count: finalRecommendations.length },
               timestamp: new Date().toISOString()
               };
               console.log(`✅ computeScore: ${scanUrl} → ${totalScore}/100`);
               return result;
               }
               // ============================================================
               // ============================================================
               // SERVER-SIDE BULK JOB QUEUE — ROBUST VERSION
               // Fixes: concurrency limit, own browser per job, DB persistence,
               //        500 URL cap, 1 active job per user, auto-cleanup, jitter
               // ============================================================
               const bulkJobs = new Map();          // in-memory mirror for fast polling
               const JOB_MAX_URLS   = 500;          // hard cap per job
               const JOB_CONCUR     = 2;            // max parallel jobs
               const JOB_TTL_MS     = 24*60*60*1000;// clean up after 24h
               let   activeJobCount = 0;
               const jobQueue       = [];           // waiting jobs when at concur limit
               // ── DB table for job persistence ─────────────────────────────
               async function ensureBulkJobsTable() {
               if (!pool) return;
               try {
               await pool.query(`CREATE TABLE IF NOT EXISTS bulk_jobs (
               id TEXT PRIMARY KEY,
               user_id TEXT,
               status TEXT DEFAULT 'queued',
               total INTEGER DEFAULT 0,
               done INTEGER DEFAULT 0,
               failed INTEGER DEFAULT 0,
               results JSONB DEFAULT '[]',
               created_at TIMESTAMP DEFAULT NOW(),
               updated_at TIMESTAMP DEFAULT NOW()
               )`);
               } catch(e) { console.error('bulk_jobs table error:', e.message); }
               }
               ensureBulkJobsTable();
               // Persist job snapshot to DB (fire-and-forget, don't await in hot path)
               function persistJob(job) {
               if (!pool) return;
               pool.query(
               'INSERT INTO bulk_jobs(id,user_id,status,total,done,failed,results,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(id) DO UPDATE SET status=$3,done=$5,failed=$6,results=$7,updated_at=NOW()',
               [job.id, job.userId||'anon', job.status, job.total, job.done, job.failed, JSON.stringify(job.results)]
               ).catch(e => console.error('persistJob error:', e.message));
               }
               // Clean up old jobs from memory
               function cleanOldJobs() {
               const cutoff = Date.now() - JOB_TTL_MS;
               for (const [id, job] of bulkJobs) {
               if (job.createdAt < cutoff) bulkJobs.delete(id);
               }
               }
               setInterval(cleanOldJobs, 60*60*1000); // hourly
               // ── Own browser per job — no shared state ────────────────────
               async function launchJobBrowser() {
               return puppeteer.launch({
               headless: 'new',
               args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--memory-pressure-off']
               }).catch(err => { console.error('Job browser launch failed:', err.message); return null; });
               }
               // ── Core page analysis — shared by bulk jobs and campaign ────
               async function internalScanPage(page, scanUrl) {
               const analysis = await page.evaluate((su) => {
               const text = document.body ? document.body.innerText : '';
               const cleanText = text.replace(/\s+/g, ' ').trim();
               const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
               const rawHtml = document.documentElement.outerHTML;
               const h1Els = document.querySelectorAll('h1'); const h1Count = h1Els.length; let h1Text = ''; let h1IsHidden = false; let h1VisibleCount = 0;
               h1Els.forEach(el => { const s = window.getComputedStyle(el); const hidden = s.display==='none'||s.visibility==='hidden'||s.opacity==='0'||el.hasAttribute('hidden'); if(!hidden){h1VisibleCount++;if(!h1Text)h1Text=el.textContent.trim();}else{h1IsHidden=true;} });
               const h1Length=h1Text.length; const GENERIC=['welcome','home','hello','untitled','page','index','main','default','test','new page','coming soon'];
               const h1IsGeneric=h1Text.length>0&&GENERIC.some(g=>h1Text.toLowerCase().trim()===g); const h1IsTooShort=h1Text.length>0&&h1Text.length<10; const h1IsTooLong=h1Text.length>70;
               const h2Count=document.querySelectorAll('h2').length; const h3Count=document.querySelectorAll('h3').length; const listItemCount=document.querySelectorAll('li').length;
               const paragraphs=Array.from(document.querySelectorAll('p')); const avgParagraphLength=paragraphs.length>0?paragraphs.map(p=>p.textContent.trim().split(/\s+/).length).reduce((a,b)=>a+b,0)/paragraphs.length:0;
               const metaTitle=(document.querySelector('title')||{}).textContent||''; const metaTitleLength=metaTitle.length;
               const metaDescEl=document.querySelector('meta[name="description"]'); const metaDescription=metaDescEl?metaDescEl.getAttribute('content')||'':''; const metaDescriptionLength=metaDescription.length;
               const hasCanonical=!!document.querySelector('link[rel="canonical"]'); const hasMetaViewport=!!document.querySelector('meta[name="viewport"]');
               const schemaScripts=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s=>{try{return JSON.parse(s.textContent);}catch(e){return null;}}).filter(Boolean);
               const flatSchemas=schemaScripts.flatMap(s=>Array.isArray(s)?s:(s['@graph']?s['@graph']:[s]));
               const hasArticleSchema=flatSchemas.some(s=>['Article','NewsArticle','BlogPosting','TechArticle','WebPage'].includes(s['@type']));
               const hasFAQPageSchema=flatSchemas.some(s=>s['@type']==='FAQPage'); const hasOrganizationSchema=flatSchemas.some(s=>['Organization','LocalBusiness','WebSite'].includes(s['@type']));
               const hasOpenGraph=!!document.querySelector('meta[property="og:title"]'); const hasTwitterCard=!!document.querySelector('meta[name="twitter:card"]');
               const bodyText=cleanText.toLowerCase(); const hasDirectAnswer=/^(a |an |the )?[a-z].{0,120}[.!?]/.test(bodyText.substring(0,300));
               const hasTLDR=/tl;?dr|summary|key takeaway|in short|in brief/i.test(bodyText);
               const hasTOC=/table of contents|jump to|skip to|on this page/i.test(rawHtml.toLowerCase())||document.querySelector('nav[aria-label]')!==null;
               const hasAuthorBio=/written by|about the author|about the founder|meet the author/i.test(rawHtml.toLowerCase());
               const hasFAQContent=/frequently asked|faq|common questions/i.test(rawHtml.toLowerCase())
               || /id=["'][^"']*faq[^"']*["']/i.test(rawHtml)
               || hasFAQPageSchema;
               const images=document.querySelectorAll('img').length; const imagesWithAlt=document.querySelectorAll('img[alt]').length;
               let host=''; try{host=new URL(su).hostname;}catch(e){}
               const internalLinks=Array.from(document.querySelectorAll('a[href]')).filter(a=>{try{return new URL(a.href).hostname===host;}catch(e){return false;}}).length;
               const externalLinks=Array.from(document.querySelectorAll('a[href]')).filter(a=>{try{const u=new URL(a.href);return u.hostname!==host&&u.protocol.startsWith('http');}catch(e){return false;}}).length;
               const bqCount=(rawHtml.match(/<blockquote/gi)||[]).length;
               const citeCount=(rawHtml.match(/<cite[\s>]/gi)||[]).length;
               const expertQuoteCount=Math.max(bqCount, citeCount);
               const caseStudyCount=(bodyText.match(/case study|client result|before.{0,20}after|challenge|solution|results|roi|recovered/g)||[]).length;
               const statsRegex=/\b\d+(\.\d+)?%|\b\d{4,}|\b\d+x\b|\$[\d,.]+/g; const statsFound=(bodyText.match(statsRegex)||[]).length;
               const emailRegex=/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
               const allEmails=rawHtml.match(emailRegex)||[]; const uniqueEmails=[...new Set(allEmails)].filter(e=>!e.includes('sentry')&&!e.includes('example')&&!e.includes('domain.com')&&!e.includes('@2x'));
               return {wordCount,h1Count,h1Text,h1Length,h1IsHidden,h1VisibleCount,h1IsGeneric,h1IsTooShort,h1IsTooLong,h2Count,h3Count,listItemCount,avgParagraphLength,metaTitle,metaTitleLength,metaDescription,metaDescriptionLength,hasCanonical,hasMetaViewport,hasArticleSchema,hasFAQPageSchema,hasOrganizationSchema,hasOpenGraph,hasTwitterCard,hasDirectAnswer,hasTLDR,hasTOC,hasAuthorBio,hasFAQContent,images,imagesWithAlt,internalLinks,externalLinks,expertQuoteCount,caseStudyCount,statsFound,extractedEmails:uniqueEmails};
               }, scanUrl);
               return computeScore(scanUrl, analysis);
               }
               async function scanOneUrlWithBrowser(rawUrl, browser) {
               const scanUrl = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
               const page = await browser.newPage();
               try {
               await page.setViewport({ width: 1280, height: 800 }); // smaller = less RAM
               await page.setUserAgent('Mozilla/5.0 (compatible; ContentScaleBot/1.0)');
               // Block images/fonts/media to save memory and speed up
               await page.setRequestInterception(true);
               page.on('request', req => {
               const rt = req.resourceType();
               if (['image','media','font','stylesheet'].includes(rt)) req.abort();
               else req.continue();
               });
               try {
               await page.goto(scanUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
               await new Promise(r => setTimeout(r, 800)); // let JS render
               } catch(e) {
               // Site unreachable/blocked — skip gracefully, don't waste retry time
               throw new Error('skip:' + e.message.substring(0,60));
               }
               return await internalScanPage(page, scanUrl);
               } finally { try { await page.close(); } catch(e) {} }
               }
               // ── Run a job (called when slot opens) ───────────────────────
               async function runBulkJob(job) {
               activeJobCount++;
               job.status = 'running';
               persistJob(job);
               let browser = null;
               try {
               browser = await launchJobBrowser();
               if (!browser) throw new Error('Could not launch browser');
               // Delay: 2s base + 0-1s jitter — gentler on target site
               const delay = () => new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
               for (const url of job.urls) {
               if (job.status === 'cancelled') break;
               let result = null;
               for (let attempt = 0; attempt < 2; attempt++) {
               try { result = await scanOneUrlWithBrowser(url, browser); break; }
               catch(e) {
               const isSkip = e.message.startsWith('skip:');
               if (attempt === 1 || isSkip) result = { success: false, url, error: e.message, score: 0 };
               else await new Promise(r => setTimeout(r, 2000));
               }
               }
               // Trim result to save memory: keep only essentials for bulk view
               const slim = result.success ? {
               success: true, url: result.url, score: result.score, quality: result.quality,
               metrics: result.metrics,
               content_stats: { wordCount: result.content_stats?.wordCount, h1Text: result.content_stats?.h1Text }
               } : { success: false, url, error: result.error, score: 0 };
               job.results.push(slim);
               job.done++;
               if (!result || !result.success) job.failed++;
               // Persist every 25 pages
               if (job.done % 25 === 0) persistJob(job);
               await delay();
               }
               job.status = job.status === 'cancelled' ? 'cancelled' : 'done';
               } catch(e) {
               job.status = 'error';
               job.error = e.message;
               console.error('Job ' + job.id + ' fatal:', e.message);
               } finally {
               if (browser) try { await browser.close(); } catch(e) {}
               activeJobCount--;
               persistJob(job);
               console.log(`✅ Job ${job.id}: ${job.done}/${job.total} done, ${job.failed} failed`);
               // Drain queue
               if (jobQueue.length > 0) {
               const next = jobQueue.shift();
               runBulkJob(next);
               }
               }
               }
               // Start bulk job endpoint
               app.post('/api/scan/bulk-job', async (req, res) => {
               const { urls } = req.body;
               const userId = req.headers['x-user-id'] || 'anon';
               if (!Array.isArray(urls) || !urls.length)
               return res.status(400).json({ success: false, error: 'urls array required' });
               // Check user already has active job
               for (const [, j] of bulkJobs) {
               if (j.userId === userId && (j.status === 'running' || j.status === 'queued'))
               return res.status(429).json({ success: false, error: 'You already have an active scan job. Wait for it to finish or cancel it first.' });
               }
               // Cap at 500
               const capped = urls.slice(0, JOB_MAX_URLS);
               const jobId = crypto.randomBytes(8).toString('hex');
               const job = {
               id: jobId, userId,
               status: activeJobCount < JOB_CONCUR ? 'running' : 'queued',
               total: capped.length, done: 0, failed: 0, results: [],
               urls: capped, createdAt: Date.now()
               };
               bulkJobs.set(jobId, job);
               persistJob(job);
               res.json({ success: true, jobId, total: capped.length, capped: capped.length < urls.length, queued: activeJobCount >= JOB_CONCUR });
               if (activeJobCount < JOB_CONCUR) runBulkJob(job);
               else jobQueue.push(job);
               });
               // Poll job
               app.get('/api/scan/bulk-job/:jobId', async (req, res) => {
               let job = bulkJobs.get(req.params.jobId);
               // Fallback: load from DB if not in memory (after restart)
               if (!job && pool) {
               try {
               const row = await pool.query('SELECT * FROM bulk_jobs WHERE id=$1', [req.params.jobId]);
               if (row.rows[0]) {
               const r = row.rows[0];
               job = { id: r.id, userId: r.user_id, status: r.status, total: r.total, done: r.done, failed: r.failed, results: r.results, createdAt: new Date(r.created_at).getTime() };
               bulkJobs.set(job.id, job); // re-cache
               }
               } catch(e) {}
               }
               if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
               res.json({ success: true, status: job.status, total: job.total, done: job.done, failed: job.failed, results: job.results, error: job.error||null });
               });
               // Cancel job
               app.post('/api/scan/bulk-job/:jobId/cancel', (req, res) => {
               const job = bulkJobs.get(req.params.jobId);
               if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
               job.status = 'cancelled';
               // Also remove from queue if waiting
               const qi = jobQueue.findIndex(j => j.id === job.id);
               if (qi !== -1) jobQueue.splice(qi, 1);
               persistJob(job);
               res.json({ success: true });
               });
               // ============================================
               app.post('/api/scan', async (req, res) => {
               const { url } = req.body;
               if (!url) return res.status(400).json({ success: false, error: 'URL required' });
               let scanUrl = url.startsWith('http') ? url : 'https://' + url;
               try {
               console.log(`🔍 Elite Scanning: ${scanUrl}`);
               let browser = await getBrowser();
               // One retry — force fresh browser if first attempt returns null
               if (!browser) {
                 browserInstance = null;
                 browser = await getBrowser();
               }
               if (!browser) return res.status(500).json({ success: false, error: 'Browser unavailable — please try again in 10 seconds' });
               const page = await browser.newPage();
               await page.setViewport({ width: 1920, height: 1080 });
               await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
               await page.goto(scanUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
               const analysis = await page.evaluate((scanUrlParam) => {
               const text = document.body ? document.body.innerText : '';
               const cleanText = text.replace(/\s+/g, ' ').trim();
               const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
               const rawHtml = document.documentElement.outerHTML;
               const h1Els = document.querySelectorAll('h1');
               const h1Count = h1Els.length;
               let h1Text = '';
               let h1IsHidden = false;
               let h1VisibleCount = 0;
               h1Els.forEach(el => {
               const style = window.getComputedStyle(el);
               const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.hasAttribute('hidden');
               if (!isHidden) { h1VisibleCount++; if (!h1Text) h1Text = el.textContent.trim(); }
               else { h1IsHidden = true; }
               });
               const h1Length = h1Text.length;
               const GENERIC_H1 = ['welcome', 'home', 'hello', 'untitled', 'page', 'index', 'main', 'default', 'test', 'new page', 'coming soon'];
               const h1IsGeneric = h1Text.length > 0 && GENERIC_H1.some(g => h1Text.toLowerCase().trim() === g);
               const h1IsTooShort = h1Text.length > 0 && h1Text.length < 10;
               const h1IsTooLong  = h1Text.length > 70;
               const h2Count = document.querySelectorAll('h2').length;
               const h3Count = document.querySelectorAll('h3').length;
               const listItemCount = document.querySelectorAll('li').length;
               const paragraphs = Array.from(document.querySelectorAll('p'));
               const avgParagraphLength = paragraphs.length > 0
               ? paragraphs.map(p => p.textContent.trim().split(/\s+/).length).reduce((a, b) => a + b, 0) / paragraphs.length
               : 0;
               const metaTitle = (document.querySelector('title') || {}).textContent || '';
               const metaTitleLength = metaTitle.length;
               const metaDescEl = document.querySelector('meta[name="description"]');
               const metaDescription = metaDescEl ? metaDescEl.getAttribute('content') || '' : '';
               const metaDescriptionLength = metaDescription.length;
               const hasMetaViewport = !!document.querySelector('meta[name="viewport"]');
               const hasCanonical = !!document.querySelector('link[rel="canonical"]');
               const hasOpenGraph = !!document.querySelector('meta[property="og:title"]');
               const hasTwitterCard = !!document.querySelector('meta[name="twitter:card"]');
               const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
               let hasArticleSchema = false;
               let hasFAQPageSchema = false;
               let hasOrganizationSchema = false;
               const checkSchemaType = (typeVal) => {
               if (!typeVal) return;
               const types = Array.isArray(typeVal) ? typeVal : [typeVal];
               if (types.some(t => ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].includes(t))) hasArticleSchema = true;
               if (types.includes('FAQPage')) hasFAQPageSchema = true;
               if (types.some(t => ['Organization', 'LocalBusiness', 'Corporation'].includes(t))) hasOrganizationSchema = true;
               };
               schemaScripts.forEach(script => {
               try {
               const data = JSON.parse(script.textContent);
               if (Array.isArray(data)) { data.forEach(item => { checkSchemaType(item['@type']); }); }
               else {
               checkSchemaType(data['@type']);
               if (Array.isArray(data['@graph'])) { data['@graph'].forEach(item => { checkSchemaType(item['@type']); }); }
               }
               } catch (e) {}
               });


                 
             const hasFAQContent = (() => {
    // Check headings text
    const headingMatch = Array.from(document.querySelectorAll('h2, h3, h4')).some(h =>
        h.textContent.toLowerCase().includes('faq') ||
        h.textContent.toLowerCase().includes('frequently asked') ||
        h.textContent.toLowerCase().includes('common question')
    );
    // Check for id="faq" or id containing "faq" on any element
    const idMatch = Array.from(document.querySelectorAll('[id]')).some(el =>
        el.id.toLowerCase().includes('faq')
    );
    // Check for section/div with class containing faq
    const classMatch = Array.from(document.querySelectorAll('[class]')).some(el => {
        const cn = el.className;
        if (!cn) return false;
        // Handle both string and SVGAnimatedString
        const classNameStr = typeof cn === 'string' ? cn : cn.baseVal || '';
        return classNameStr.toLowerCase().includes('faq');
    });
    // Check raw text for FAQ patterns
    const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
    const textMatch = bodyText.includes('frequently asked') || bodyText.includes('common questions');
    return headingMatch || idMatch || classMatch || textMatch;
})();

                 
               const images = document.querySelectorAll('img');
               const imagesWithAlt = Array.from(images).filter(img => img.hasAttribute('alt') && img.getAttribute('alt').trim().length > 5).length;
               let baseHostname = '';
               try { baseHostname = new URL(scanUrlParam).hostname.replace('www.', ''); } catch (e) {}
               const allLinks = Array.from(document.querySelectorAll('a[href]'));
               const internalLinks = allLinks.filter(a => {
               try { return new URL(a.href).hostname.replace('www.', '') === baseHostname; } catch (e) { return false; }
               }).length;
               const externalLinks = allLinks.filter(a => {
               try {
               const h = new URL(a.href).hostname.replace('www.', '');
               return h !== baseHostname && !a.href.startsWith('#') && !a.href.startsWith('mailto:') && !a.href.startsWith('tel:');
               } catch (e) { return false; }
               }).length;
               let expertQuoteCount = 0;
               document.querySelectorAll('blockquote').forEach(bq => {
               const cite = bq.querySelector('cite');
               const text = bq.textContent.trim();
               // Count if: has cite, OR is long enough to be a real quote (>80 chars)
               if (text.length > 30 && (cite || text.length > 80)) expertQuoteCount++;
               });
               // Also count standalone <cite> tags not inside blockquote
               document.querySelectorAll('cite').forEach(cite => {
               if (!cite.closest('blockquote') && cite.textContent.trim().length > 3) expertQuoteCount++;
               });
               const testimonialSelectors = ['.review', '.testimonial', '[class*="review"]', '[class*="testimonial"]', '[class*="quote"]'];
               testimonialSelectors.forEach(sel => {
               try { document.querySelectorAll(sel).forEach(el => { if (el.textContent.trim().length > 40) expertQuoteCount++; }); } catch (e) {}
               });
               let caseStudyCount = 0;
               const caseStudyKeywords = ['case study', 'challenge', 'solution', 'results', 'roi', 'recovered', 'recovery', 'success rate'];
               const seen = new Set();
               document.querySelectorAll('section, article, div[class*="case"], div[class*="study"], div[class*="card"]').forEach(el => {
               if (seen.has(el)) return;
               const txt = el.textContent.toLowerCase();
               const len = txt.length;
               if (len > 300 && len < 6000) {
               const hasKeyword = caseStudyKeywords.some(k => txt.includes(k));
               const hasMetric = /\d+\s*%|\d+x\s|€[\d,.]+|\$[\d,.]+|\d{1,3}(,\d{3})+/.test(txt);
               if (hasKeyword && hasMetric) { caseStudyCount++; seen.add(el); }
               }
               });
               const statsPattern = /\d+%|\$[\d,.]+|€[\d,.]+|\d{1,3}(,\d{3})+|\d+x\s/g;
               const statsFound = (cleanText.match(statsPattern) || []).length;
               const first300Words = cleanText.split(/\s+/).slice(0, 300).join(' ');
               const hasDirectAnswer = /\d/.test(first300Words) && first300Words.length > 150;
               const hasTLDR = /tl;dr|key takeaways|quick summary|at a glance|in this article|what you('ll| will) get|why choose|key benefits|what we do|highlights|our approach|how it works/i.test(rawHtml) ||
               (() => {
               const earlyLists = Array.from(document.querySelectorAll('ul, ol'));
               for (const list of earlyLists) {
               const items = list.querySelectorAll('li');
               if (items.length >= 3) {
               const bodyLen = (document.body || {}).innerText ? document.body.innerText.length : 9999;
               const listText = list.innerText || '';
               const listPos = (document.body.innerText || '').indexOf(listText.substring(0, 50));
               if (listPos < bodyLen * 0.5) return true;
               }
               }
               return false;
               })();
               const hasTOC = /table of contents|on this page|jump to section|contents/i.test(rawHtml) ||
               !!document.querySelector('[class*="toc"], [id*="toc"], [class*="table-of-contents"]');
               const hasAuthorBio = (
               !!document.querySelector('[class*="author"], [class*="bio"], .vcard, [rel="author"]') ||
               /about the author|about the founder|written by|meet the author/i.test(rawHtml)
               ) && /years of experience|certified|specializ|founder|director|ceo|operations|amsterdam/i.test(rawHtml);
               return {
               wordCount, h1Count, h1Text, h1Length, h1IsHidden, h1VisibleCount, h1IsGeneric, h1IsTooShort, h1IsTooLong, h2Count, h3Count, listItemCount, avgParagraphLength,
               metaTitleLength, metaDescriptionLength, hasMetaViewport, hasCanonical,
               hasOpenGraph, hasTwitterCard, hasArticleSchema, hasFAQPageSchema, hasOrganizationSchema,
               hasFAQContent, images: images.length, imagesWithAlt,
               internalLinks, externalLinks, expertQuoteCount, caseStudyCount,
               statsFound, hasDirectAnswer, hasTLDR, hasTOC, hasAuthorBio
               };
               }, scanUrl);
               let extractedEmails = [];
               try {
               const pageHtml = await page.content();
               const mailtoMatches = [...pageHtml.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)].map(m => m[1].toLowerCase());
               const textMatches  = [...pageHtml.matchAll(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/gi)].map(m => m[1].toLowerCase());
               const allEmails = [...new Set([...mailtoMatches, ...textMatches])].filter(e =>
               !e.includes('example') && !e.includes('sentry') && !e.includes('wix') &&
               !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
               );
               extractedEmails = allEmails.slice(0, 3);
               } catch (e) {}
               await page.close();
               // ── SCORING ──
               const result = computeScore(scanUrl, analysis, extractedEmails);
               console.log(`✅ Scan: ${scanUrl} → ${result.score}/100`);
               res.json(result);
               // Auto-save to scan_log so badge can find it
               if (pool) {
                 pool.query(
                   `INSERT INTO scan_log (business_url, score, source, created_at) VALUES ($1, $2, 'single', NOW())`,
                   [scanUrl, result.score]
                 ).catch(() => {});
               }
               } catch (error) {
               console.error('❌ Scan error:', error.message);
               res.status(500).json({ success: false, error: 'Scan failed', details: error.message });
               }
               });
               // Routes
               app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin-dashboard.html')));
               app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// ── 1. Serve the standalone lead-crawler page ─────────────────────────────────
app.get('/lead-crawler', (req, res) => {
  const tryPaths = [
    path.join(__dirname, '../public', 'lead-crawler.html'),
    path.join(__dirname, 'public', 'lead-crawler.html'),
  ];
  const filePath = tryPaths.find(p => fs.existsSync(p));
  if (!filePath) return res.status(404).send('lead-crawler.html not found');
  res.sendFile(filePath);
});
               // ── Apify proxy routes ──────────────────────────────────────────────────────
               const APIFY_BASE = 'https://api.apify.com/v2';
               app.post('/api/apify/start-run', async (req, res) => {
               const token = req.headers['x-apify-token'];
               if (!token) return res.status(401).json({ error: 'No Apify token' });
               try {
               const { actorId, input } = req.body;
               const r = await fetch(`${APIFY_BASE}/acts/${actorId}/runs`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
               body: JSON.stringify(input)
               });
               const data = await r.json();
               res.status(r.status).json(data);
               } catch (e) { res.status(500).json({ error: e.message }); }
               });
               app.get('/api/apify/run-status/:runId', async (req, res) => {
               const token = req.headers['x-apify-token'];
               if (!token) return res.status(401).json({ error: 'No Apify token' });
               try {
               const r = await fetch(`${APIFY_BASE}/actor-runs/${req.params.runId}`, {
               headers: { 'Authorization': `Bearer ${token}` }
               });
               const data = await r.json();
               res.status(r.status).json(data);
               } catch (e) { res.status(500).json({ error: e.message }); }
               });

               app.get('/api/apify/dataset/:runId', async (req, res) => {
               const token = req.headers['x-apify-token'];
               if (!token) return res.status(401).json({ error: 'No Apify token' });
               try {
               const r = await fetch(`${APIFY_BASE}/actor-runs/${req.params.runId}/dataset/items?format=json&clean=true`, {
               headers: { 'Authorization': `Bearer ${token}` }
               });
               const data = await r.json();
               res.status(r.status).json(data);
               } catch (e) { res.status(500).json({ error: e.message }); }
               });

      // ── Claude API proxy — users provide their own API key ─────────────────────
app.post('/api/claude-proxy', async (req, res) => {
  const apiKey = req.headers['x-anthropic-key'];
  const userId = req.headers['x-user-id'] || 'anonymous';
  
  if (!apiKey || apiKey.length < 20) {
    return res.status(401).json({ 
      error: 'ANTHROPIC_API_KEY required', 
      detail: 'Send your API key in the x-anthropic-key header' 
    });
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    
    // ✅ Clean URL - NO trailing spaces
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    const rawText = await upstream.text();
    let data;
    try { data = JSON.parse(rawText); } 
    catch { data = { raw: rawText.slice(0, 500) }; }
    
    console.log(`[claude-proxy] ${userId} → ${upstream.status} (${rawText.length} bytes)`);
    
    // Detect rate limit / overload errors and add clear message
    if (upstream.status === 529 || upstream.status === 503) {
      return res.status(upstream.status).json({ 
        error: { message: 'Anthropic API rate limit or overload — wait a few minutes and try again', type: 'rate_limit' },
        ...data 
      });
    }
    
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[claude-proxy] Error:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Gateway timeout', detail: 'Anthropic API took too long' });
    }
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ============================================
// GEMINI PROXY — Lead Crawler
// Gebruikt GEMINI_KEY_LEADCRAWLER uit Railway env
// HTML stuurt geen key — server regelt het
// ============================================
app.post('/api/gemini-proxy', async (req, res) => {
  const apiKey = process.env.GEMINI_KEY_LEADCRAWLER;
  const userId = req.headers['x-user-id'] || 'anonymous';
  const model  = req.query.model || GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_KEY_LEADCRAWLER not set',
      detail: 'Voeg GEMINI_KEY_LEADCRAWLER toe in Railway Variables'
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req.body, tools: req.body.tools || [{ google_search: {} }] }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const rawText = await upstream.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { data = { raw: rawText.slice(0, 500) }; }

    console.log(`[gemini-proxy-user] ${userId} → ${model} → ${upstream.status} (${rawText.length} bytes)`);

    if (upstream.status === 429) {
      return res.status(429).json({
        error: { message: 'Gemini Lead Crawler rate limit — even wachten', type: 'rate_limit' },
        ...data
      });
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[gemini-proxy-user] Error:', err.message);
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Gateway timeout' });
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ============================================
// GEMINI PROXY — Otto Voicebot
// Gebruikt GEMINI_KEY_VOICEBOT uit Railway env
// Aparte route + aparte key = apart gebruik zichtbaar
// ============================================
app.post('/api/gemini-voicebot', async (req, res) => {
  const apiKey = process.env.GEMINI_KEY_VOICEBOT;
  const userId = req.headers['x-user-id'] || 'anonymous';
  const model  = req.query.model || GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_KEY_VOICEBOT not set',
      detail: 'Voeg GEMINI_KEY_VOICEBOT toe als Railway environment variable'
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const rawText = await upstream.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { data = { raw: rawText.slice(0, 500) }; }

    console.log(`[gemini-voicebot] ${userId} → ${model} → ${upstream.status} (${rawText.length} bytes)`);

    if (upstream.status === 429) {
      return res.status(429).json({
        error: { message: 'Gemini Voicebot rate limit — even wachten', type: 'rate_limit' },
        ...data
      });
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[gemini-voicebot] Error:', err.message);
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Gateway timeout' });
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});




// ============================================
// GEMINI PROXY — Betaalde users (€97)
// Gebruikt GEMINI_KEY_LEADCRAWLER van Railway
// User heeft geen eigen key nodig
// Activatie via license key systeem
// ============================================
app.post('/api/gemini-paid', async (req, res) => {
  const apiKey = process.env.GEMINI_KEY_LEADCRAWLER;
  const userId = req.headers['x-user-id'] || 'anonymous';
  const model  = req.query.model || GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_KEY_LEADCRAWLER not set on server',
      detail: 'Neem contact op met Ottmar via WhatsApp'
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const rawText = await upstream.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { data = { raw: rawText.slice(0, 500) }; }

    console.log(`[gemini-paid] ${userId} → ${model} → ${upstream.status} (${rawText.length} bytes)`);

    if (upstream.status === 429) {
      return res.status(429).json({
        error: { message: 'Server Gemini rate limit — even wachten en opnieuw proberen', type: 'rate_limit' },
        ...data
      });
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[gemini-paid] Error:', err.message);
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Gateway timeout' });
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ── Scan Reports ────────────────────────────────────────────────────────────
               app.post('/api/report/generate', verifyAdmin, async (req, res) => {
               if (!pool) return res.json({ success: false, error: 'No DB' });
               const { scan_log_id, business_url, business_name, score, niche, city, country, email_found, recommendations } = req.body;
               try {
               const id = crypto.randomBytes(20).toString('hex');
               await pool.query(
               `INSERT INTO scan_reports (id, scan_log_id, business_url, business_name, score, niche, city, country, email_found, recommendations)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
               [id, scan_log_id || null, business_url || null, business_name || null, score || null,
               niche || null, city || null, country || null, email_found || null,
               JSON.stringify(recommendations || [])]
               );
               res.json({ success: true, id, url: `/report/${id}` });
               } catch (e) { res.status(500).json({ success: false, error: e.message }); }
               });
               app.get('/report/:id', async (req, res) => {
               if (!pool) return res.status(503).send('<h1>Service unavailable</h1>');
               try {
               const r = await pool.query('SELECT * FROM scan_reports WHERE id = $1', [req.params.id]);
               if (!r.rows.length) return res.status(404).send('<!DOCTYPE html><html><body style="font-family:system-ui;background:#030712;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;">🔍</div><h2>Report not found</h2></div></body></html>');
const report = r.rows[0];
let recs = [];
try { recs = JSON.parse(report.recommendations || '[]'); } catch {}
const score = report.score || 0;
const scoreColor = score >= 85 ? '#16a34a' : score >= 70 ? '#b45309' : '#dc2626';
const scoreLabel = score >= 95 ? 'Elite' : score >= 90 ? 'Excellent' : score >= 85 ? 'Strong' : score >= 80 ? 'Good' : score >= 75 ? 'Solid' : score >= 70 ? 'Qualified' : 'Needs Work';
const graafScore = Math.round(score * 0.50);
const craftScore = Math.round(score * 0.30);
const techScore  = Math.round(score * 0.20);
const domain = (() => { try { return new URL(report.business_url || 'https://unknown').hostname.replace('www.', ''); } catch { return report.business_url || 'Unknown'; } })();
const dateStr = new Date(report.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const priorityColor = p => p === 'high' ? '#f87171' : p === 'medium' ? '#fbbf24' : p === 'none' ? '#4ade80' : '#94a3b8';
const priorityLabel = p => p === 'high' ? '🔴 High Priority' : p === 'medium' ? '🟡 Medium Priority' : p === 'none' ? '✅ Elite' : '🔵 Low Priority';
const normalizeRec = (rec) => typeof rec === 'string' ? { title: rec, description: null, action: null, learning: null, target: null, priority: 'low' } : rec;
const recsHtml = recs.map((rawRec, i) => {
const rec = normalizeRec(rawRec);
return `
<div style="background:#0f172a;border:1px solid #1e293b;border-left:4px solid ${priorityColor(rec.priority)};border-radius:12px;padding:20px;margin-bottom:14px;page-break-inside:avoid;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
<span style="font-size:1rem;font-weight:700;color:#f9fafb;flex:1;">${rec.title || 'Recommendation ' + (i + 1)}</span>
<span style="font-size:0.68rem;font-weight:600;border-radius:99px;padding:3px 10px;white-space:nowrap;background:${priorityColor(rec.priority)}20;color:${priorityColor(rec.priority)};border:1px solid ${priorityColor(rec.priority)}40;">${priorityLabel(rec.priority)}</span>
</div>
${rec.description ? `<p style="color:#9ca3af;font-size:0.875rem;margin:0 0 12px;">${rec.description}</p>` : ''}
${rec.action ? `<div style="margin-top:10px;padding:10px 14px;background:#111827;border-radius:8px;font-size:0.84rem;"><span style="display:block;font-weight:700;color:#a78bfa;font-size:0.72rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">✅ Action</span><p style="color:#d1d5db;margin:0;">${rec.action}</p></div>` : ''}
${rec.learning ? `<div style="margin-top:10px;padding:10px 14px;background:#111827;border-radius:8px;font-size:0.84rem;"><span style="display:block;font-weight:700;color:#a78bfa;font-size:0.72rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">💡 Why It Matters</span><p style="color:#d1d5db;margin:0;">${rec.learning}</p></div>` : ''}
${rec.target ? `<div style="margin-top:10px;padding:10px 14px;background:#111827;border-radius:8px;font-size:0.84rem;"><span style="display:block;font-weight:700;color:#a78bfa;font-size:0.72rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">🎯 Target</span><p style="color:#d1d5db;margin:0;">${rec.target}</p></div>` : ''}
</div>`;
}).join('');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SEO Report — ${report.business_name || domain} — ContentScale</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#7e22ce">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#030712;color:#e5e7eb;line-height:1.6;}
.container{max-width:860px;margin:0 auto;padding:32px 20px 100px;}
.header{background:linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%);border:1px solid #4f46e5;border-radius:16px;padding:36px;margin-bottom:28px;}
.brand-logo{font-size:1.4rem;font-weight:900;background:linear-gradient(135deg,#7e22ce,#be185d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.brand-sub{font-size:0.75rem;color:#6b7280;margin-bottom:20px;}
.biz-name{font-size:1.9rem;font-weight:800;color:#f9fafb;margin-bottom:6px;}
.biz-url{color:#60a5fa;font-size:0.9rem;margin-bottom:16px;word-break:break-all;}
.meta-row{display:flex;gap:10px;flex-wrap:wrap;font-size:0.78rem;}
.chip{background:#111827;border:1px solid #374151;border-radius:99px;padding:3px 12px;color:#9ca3af;}
.score-block{display:flex;align-items:center;gap:28px;margin-top:24px;padding-top:24px;border-top:1px solid #1e293b;flex-wrap:wrap;}
.score-circle{width:100px;height:100px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:4px solid ${scoreColor};background:${scoreColor}15;flex-shrink:0;}
.score-num{font-size:2.2rem;font-weight:900;color:${scoreColor};line-height:1;}
.score-max{font-size:0.75rem;color:#6b7280;}
.score-lbl{font-size:0.8rem;color:${scoreColor};font-weight:600;margin-top:2px;}
.breakdown{display:flex;gap:14px;flex-wrap:wrap;}
.pill{background:#111827;border:1px solid #374151;border-radius:10px;padding:10px 16px;text-align:center;min-width:90px;}
.pill-val{font-size:1.4rem;font-weight:800;}
.pill-lbl{font-size:0.7rem;color:#6b7280;margin-top:2px;}
.progress-wrap{margin-top:14px;}
.progress-lbl{display:flex;justify-content:space-between;font-size:0.75rem;color:#6b7280;margin-bottom:5px;}
.progress-bar{height:10px;background:#1f2937;border-radius:99px;overflow:hidden;}
.progress-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,${scoreColor},${scoreColor}aa);}
.section-title{font-size:1.2rem;font-weight:700;color:#f9fafb;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #1f2937;}
.rec-count{font-size:0.75rem;background:#7e22ce30;color:#a78bfa;border:1px solid #7e22ce50;border-radius:99px;padding:2px 10px;}
.pdf-btn{position:fixed;bottom:28px;right:28px;background:linear-gradient(135deg,#7e22ce,#be185d);color:white;border:none;border-radius:12px;padding:14px 24px;font-size:0.95rem;font-weight:700;cursor:pointer;box-shadow:0 8px 32px rgba(126,34,206,0.4);z-index:999;}
.footer{margin-top:48px;text-align:center;color:#374151;font-size:0.78rem;padding-top:24px;border-top:1px solid #111827;}
@media print{body{background:white;color:#111;}.pdf-btn{display:none!important;}.container{padding:20px;}.header{background:white;border:2px solid #7e22ce;}.brand-logo{-webkit-text-fill-color:#7e22ce;}.biz-name{color:#111;}.section-title{color:#111;}div[style*="background:#0f172a"]{background:white!important;border:1px solid #e5e7eb!important;}div[style*="background:#111827"]{background:#f9fafb!important;}p[style*="color:#9ca3af"]{color:#374151!important;}p[style*="color:#d1d5db"]{color:#374151!important;}@page{margin:15mm;}}
@media(max-width:600px){.score-block{flex-direction:column;}}
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="brand-logo">ContentScale</div>
<div class="brand-sub">GRAAF + CRAFT + Technical SEO Framework</div>
<div class="biz-name">${report.business_name || domain}</div>
<div class="biz-url">🌐 ${report.business_url || 'N/A'}</div>
<div class="meta-row">
${report.niche ? `<span class="chip">🏷 ${report.niche}</span>` : ''}
${report.city ? `<span class="chip">📍 ${report.city}</span>` : ''}
${report.country ? `<span class="chip">🌍 ${report.country}</span>` : ''}
${report.email_found ? `<span class="chip">✉ ${report.email_found}</span>` : ''}
<span class="chip">📅 ${dateStr}</span>
</div>
<div class="score-block">
<div class="score-circle">
<div class="score-num">${score}</div>
<div class="score-max">/100</div>
<div class="score-lbl">${scoreLabel}</div>
</div>
<div>
<div class="breakdown">
<div class="pill"><div class="pill-val" style="color:#a78bfa;">${graafScore}<span style="font-size:0.85rem;color:#6b7280;">/50</span></div><div class="pill-lbl">GRAAF</div></div>
<div class="pill"><div class="pill-val" style="color:#60a5fa;">${craftScore}<span style="font-size:0.85rem;color:#6b7280;">/30</span></div><div class="pill-lbl">CRAFT</div></div>
<div class="pill"><div class="pill-val" style="color:#34d399;">${techScore}<span style="font-size:0.85rem;color:#6b7280;">/20</span></div><div class="pill-lbl">Technical</div></div>
</div>
<div class="progress-wrap">
<div class="progress-lbl"><span>Overall Score</span><span>${score}/100</span></div>
<div class="progress-bar"><div class="progress-fill" style="width:${score}%;"></div></div>
</div>
</div>
</div>
</div>
<div class="section-title">📋 Recommendations <span class="rec-count">${recs.length} items</span></div>
${recsHtml}
<div class="footer">Generated by ContentScale &nbsp;·&nbsp; app.contentscale.site &nbsp;·&nbsp; GRAAF + CRAFT Framework &nbsp;·&nbsp; By Ottmar Francisca</div>
</div>
<button class="pdf-btn" onclick="window.print()">⬇ Download PDF</button>
<script>
   (function(){
     var titles=['ContentScale ⚡','🎯 SEO Scanner'];
     var favs=['/favicon.svg','/favicon-pink.svg'];
     var t=0,iv=null;
     var orig=document.title;
     var fl=document.querySelector('link[rel~=\"icon\"]');
     document.addEventListener('visibilitychange',function(){
       if(document.hidden){
         iv=setInterval(function(){ t=1-t; document.title=titles[t]; if(fl) fl.href=favs[t]; },800);
       } else {
         clearInterval(iv);iv=null;t=0;
         document.title=orig; if(fl) fl.href='/favicon.svg';
       }
     });
   })();
</script>
</body>
</html>`;
res.setHeader('Content-Type', 'text/html');
res.send(html);
} catch (e) {
console.error('Report error:', e.message);
res.status(500).send('Error loading report');
}
});
app.get('/api/health', async (req, res) => {
let db = 'disconnected';
let leaderboardTotal = 0, leaderboardApproved = 0, freelancerTotal = 0;
if (pool) {
try {
await pool.query('SELECT 1');
db = 'connected';
const lbAll = await pool.query('SELECT COUNT(*) FROM leaderboard').catch(() => ({ rows: [{ count: 0 }] }));
const lbApproved = await pool.query("SELECT COUNT(*) FROM leaderboard WHERE admin_verified = TRUE AND is_opted_out = FALSE").catch(() => ({ rows: [{ count: 0 }] }));
const flAll = await pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE').catch(() => ({ rows: [{ count: 0 }] }));
leaderboardTotal = parseInt(lbAll.rows[0].count) || 0;
leaderboardApproved = parseInt(lbApproved.rows[0].count) || 0;
freelancerTotal = parseInt(flAll.rows[0].count) || 0;
} catch (e) {}
}
res.json({ status: 'running', database: db, puppeteer: browserInstance ? 'ready' : 'not started', version: 'elite-v4-fixed-v3', sendgrid: process.env.SENDGRID_API_KEY ? 'configured' : 'not configured', counts: { leaderboardTotal, leaderboardApproved, freelancerTotal } });
});
app.use((err, req, res, next) => {
console.error('Server Error:', err.message);
res.status(500).json({ success: false, error: 'Internal Server Error' });
});
async function startServer() {
console.log('🚀 =====================================');
console.log('🚀  CONTENTSCALE ELITE SERVER v4 (GEMINI AUTO-MODEL)');
console.log('🚀  FIX: activated_until alias in users SELECT');
console.log('🚀  FIX: deactivate endpoint added');
console.log('🚀  FIX: Instantly Bearer uses secret only');
console.log('🚀  DB Migration: country VARCHAR(100)');
console.log('🚀  scan_log.source column');
console.log('🚀  DOCX: template type column');
console.log('🚀  Bulk Delete Routes');
console.log('🚀  34 Recommendation Checks');
console.log('🚀  GRAAF 50 + CRAFT 30 + Technical 20');
console.log(`🚀  BASE_URL: ${process.env.BASE_URL || 'https://app.contentscale.site (default)'}`);
console.log('🚀 =====================================\n');
const dbConnected = await waitForDatabase();
  // Auto-detect best Gemini model at startup
  await detectBestGeminiModel(process.env.GEMINI_KEY_LEADCRAWLER);
httpServer.listen(PORT, () => {
console.log(`📍 Server: http://localhost:${PORT}`);
console.log(`📊 DB:     ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
console.log(`📧 Email:  ${process.env.SENDGRID_API_KEY ? '✅ SendGrid ready' : '❌ SENDGRID_API_KEY not set'}`);
console.log('\n✅ Elite scanner ready\n');
});
}
// ============================================
// BACKGROUND BATCH JOB SYSTEM
// ============================================
const activeJobs = new Map();
app.post('/api/admin/batch-job/start', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
const { niches, cities, country, max_results, website_only, apify_token } = req.body;
if (!niches || !cities || !apify_token) return res.status(400).json({ success: false, error: 'Missing niches, cities or apify_token' });
const nicheArr = niches.split('\n').map(n => n.trim()).filter(n => n);
const cityArr  = cities.split('\n').map(c => c.trim()).filter(c => c);
if (!nicheArr.length || !cityArr.length) return res.status(400).json({ success: false, error: 'No valid niches or cities' });
const jobId = crypto.randomBytes(16).toString('hex');
const totalCombos = nicheArr.length * cityArr.length;
try {
await pool.query(
`INSERT INTO batch_jobs (id, admin_id, niches, cities, country, max_results, website_only, status, total_combos, apify_token, created_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9,NOW())`,
[jobId, req.admin.id, niches, cities, country || 'Netherlands', max_results || 50, website_only !== false, totalCombos, apify_token]
);
runBatchJobInBackground(jobId);
res.json({ success: true, job_id: jobId, total_combos: totalCombos });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/admin/batch-jobs', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, jobs: [] });
try {
const r = await pool.query(
`SELECT id, status, progress, progress_text, total_combos, current_combo,
scanned, skipped, score_high, score_good, score_low,
niches, cities, country, max_results, error_message,
started_at, completed_at, created_at
FROM batch_jobs ORDER BY created_at DESC LIMIT 20`
);
res.json({ success: true, jobs: r.rows });
} catch (e) { res.status(500).json({ success: false, jobs: [] }); }
});
app.get('/api/admin/batch-job/:id', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
try {
const r = await pool.query('SELECT * FROM batch_jobs WHERE id = $1', [req.params.id]);
if (!r.rows.length) return res.status(404).json({ success: false, error: 'Job not found' });
res.json({ success: true, job: r.rows[0] });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/admin/batch-job/:id', verifyAdmin, async (req, res) => {
if (!pool) return res.json({ success: false, error: 'No DB' });
try {
activeJobs.set(req.params.id, { cancelled: true });
await pool.query(`UPDATE batch_jobs SET status='cancelled', completed_at=NOW() WHERE id=$1`, [req.params.id]);
res.json({ success: true });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
async function runBatchJobInBackground(jobId) {
if (!pool) return;
const jobRef = { cancelled: false };
activeJobs.set(jobId, jobRef);
const updateJob = async (fields) => {
if (!pool) return;
const keys = Object.keys(fields);
const vals = Object.values(fields);
const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
await pool.query(`UPDATE batch_jobs SET ${sets} WHERE id=$${keys.length+1}`, [...vals, jobId]).catch(() => {});
};
try {
const jr = await pool.query('SELECT * FROM batch_jobs WHERE id=$1', [jobId]);
if (!jr.rows.length) return;
const job = jr.rows[0];
const nicheArr = job.niches.split('\n').map(n => n.trim()).filter(n => n);
const cityArr  = job.cities.split('\n').map(c => c.trim()).filter(c => c);
const combos   = [];
nicheArr.forEach(niche => cityArr.forEach(city => combos.push({ niche, city })));
const maxResultsActual = (!job.max_results || job.max_results === 0) ? 9999 : parseInt(job.max_results);
const websiteOnly = job.website_only;
const country     = job.country;
const apifyToken  = job.apify_token;
await updateJob({ status: 'running', started_at: new Date(), progress: 1, progress_text: 'Loading existing scans for dedup...' });
let alreadyScanned = new Set();
try {
const existing = await pool.query('SELECT business_url FROM scan_log WHERE business_url IS NOT NULL');
existing.rows.forEach(r => alreadyScanned.add(r.business_url.trim()));
} catch(e) {}
let totalScanned = 0, totalSkipped = 0;
let scoreHigh = 0, scoreGood = 0, scoreLow = 0;
for (let ci = 0; ci < combos.length; ci++) {
if (activeJobs.get(jobId)?.cancelled) {
await updateJob({ status: 'cancelled', completed_at: new Date(), progress_text: 'Cancelled by user' });
return;
}
const { niche, city } = combos[ci];
const pct = Math.round((ci / combos.length) * 85);
await updateJob({ current_combo: ci + 1, progress: pct, progress_text: `Combo ${ci+1}/${combos.length}: ${niche} — ${city}` });
let runId;
try {
const runRes = await fetch(`${APIFY_BASE}/acts/compass~crawler-google-places/runs`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apifyToken}` },
body: JSON.stringify({
searchStringsArray: [`${niche} in ${city}`],
maxCrawledPlacesPerSearch: maxResultsActual,
language: 'en', exportPlaceUrls: true,
includeWebResults: true, skipClosedPlaces: false
})
});
const runData = await runRes.json();
runId = runData.data?.id;
if (!runId) throw new Error('Apify run not started');
} catch (e) {
await updateJob({ progress_text: `Combo ${ci+1}: Apify error — ${e.message}` });
continue;
}
let attempts = 0, runStatus = 'RUNNING';
while (runStatus === 'RUNNING' || runStatus === 'READY') {
await new Promise(r => setTimeout(r, 5000));
attempts++;
try {
const statusData = await (await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
headers: { 'Authorization': `Bearer ${apifyToken}` }
})).json();
runStatus = statusData.data?.status || 'FAILED';
} catch(e) { runStatus = 'FAILED'; }
await updateJob({ progress_text: `${niche} — ${city}: scraping... (${attempts*5}s)` });
if (attempts > 60) { runStatus = 'TIMEOUT'; break; }
if (activeJobs.get(jobId)?.cancelled) break;
}
if (runStatus !== 'SUCCEEDED') {
await updateJob({ progress_text: `${niche} — ${city}: ${runStatus}, continuing...` });
continue;
}
let places = [];
try {
const dataRaw = await (await fetch(`${APIFY_BASE}/actor-runs/${runId}/dataset/items?format=json&clean=true`, {
headers: { 'Authorization': `Bearer ${apifyToken}` }
})).json();
places = Array.isArray(dataRaw) ? dataRaw : (dataRaw.items || dataRaw.data || []);
} catch(e) { continue; }
let urls = places.filter(p => p.website).map(p => ({
url: p.website.startsWith('http') ? p.website : 'https://' + p.website,
name: p.title || p.name || '',
email: p.email || (p.emails && p.emails[0]) || null,
country
}));
if (!websiteOnly) {
places.filter(p => !p.website).forEach(p => urls.push({
url: '', name: p.title || p.name || '',
email: p.email || (p.emails && p.emails[0]) || null,
country
}));
}
let allDomains = [];
const urlsToCollect = urls.filter(p => p.url && !alreadyScanned.has(p.url.trim()));
totalSkipped += urls.length - urlsToCollect.length;
for (const place of urlsToCollect) {
if (activeJobs.get(jobId)?.cancelled) break;
alreadyScanned.add(place.url.trim());
allDomains.push(place);
totalScanned++;
// Save to scan_log as 'discovered' (no scan yet — campaign will scan)
await pool.query(
`INSERT INTO scan_log (user_id, business_url, business_name, niche, city, country, email_found, email_status, source, score)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'discover',0)
ON CONFLICT DO NOTHING`,
['batch_job_' + jobId, place.url, place.name, niche, city, country, place.email || null, place.email ? 'has_email' : 'no_email']
).catch(() => {});
}
await updateJob({
progress: Math.min(Math.round(((ci+1) / combos.length) * 95), 95),
progress_text: `${ci+1}/${combos.length} combos done · ${totalScanned} domains collected`,
scanned: totalScanned, skipped: totalSkipped
});
}
await updateJob({
status: 'completed', progress: 100,
progress_text: `✅ Done — ${totalScanned} domains collected, ${totalSkipped} skipped`,
scanned: totalScanned, skipped: totalSkipped,
completed_at: new Date()
});
console.log(`✅ Batch job ${jobId} complete: ${totalScanned} scanned`);
} catch (e) {
console.error(`❌ Batch job ${jobId} error:`, e.message);
await updateJob({ status: 'failed', error_message: e.message, completed_at: new Date() }).catch(() => {});
} finally {
activeJobs.delete(jobId);
}
}
// On server restart: resume any interrupted jobs
setTimeout(async () => {
if (!pool) return;
try {
const r = await pool.query(`SELECT id FROM batch_jobs WHERE status='running' OR status='queued'`);
for (const row of r.rows) {
console.log(`🔄 Resuming interrupted batch job: ${row.id}`);
await pool.query(`UPDATE batch_jobs SET status='running', progress_text='Resuming after server restart...' WHERE id=$1`, [row.id]);
runBatchJobInBackground(row.id);
}
} catch(e) {}
}, 5000);
// ============================================
// INSTANTLY.AI PROXY ENDPOINTS
// ✅ FIX v4: Bearer token = UUID part (before ':') — Instantly v2 API auth fix
// ============================================
app.post('/api/admin/scans/:id/email', verifyAdmin, async (req, res) => {
try {
const { email } = req.body;
if (!email) return res.status(400).json({ success: false, error: 'No email' });
await pool.query('UPDATE scan_log SET email_found=$1, email_status=$2 WHERE id=$3', [email, 'has_email', req.params.id]);
res.json({ success: true });
} catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/instantly/campaigns', verifyAdmin, async (req, res) => {
const apiKey = req.headers['x-instantly-key'];
if (!apiKey) return res.status(400).json({ success: false, error: 'No Instantly API key' });
const raw = apiKey.trim();
// raw-b64 (full base64 key) is confirmed working - use directly
const attempts = [{ label: 'raw-b64', key: raw }];
console.log('Instantly campaigns key len=' + raw.length);
let lastStatus = 0, lastBody = '';
for (const attempt of attempts) {
try {
const r = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=100', {
headers: { 'Authorization': 'Bearer ' + attempt.key, 'Content-Type': 'application/json' }
});
const rawText = await r.text();
console.log('Instantly [' + attempt.label + '] key=' + attempt.key.substring(0,8) + '... len=' + attempt.key.length + ' status=' + r.status + ' body=' + rawText.substring(0,200));
lastStatus = r.status; lastBody = rawText;
if (r.ok) {
let data; try { data = JSON.parse(rawText); } catch { data = {}; }
return res.json({ success: true, campaigns: data.items || data.campaigns || (Array.isArray(data) ? data : []) });
}
} catch (e) {
console.error('Instantly fetch error [' + attempt.label + ']:', e.message);
}
}
console.error('Instantly ALL attempts failed. lastStatus=' + lastStatus + ' body=' + lastBody.substring(0,300));
let errMsg = 'Unauthorized'; try { errMsg = JSON.parse(lastBody).message || errMsg; } catch {}
res.status(500).json({ success: false, error: errMsg });
});
app.post('/api/instantly/push', verifyAdmin, async (req, res) => {
const apiKey = req.headers['x-instantly-key'];
if (!apiKey) return res.status(400).json({ success: false, error: 'No Instantly API key' });
const cleanKey = apiKey.trim(); // raw-b64 confirmed working
const { campaign_id, leads, skip_if_in_workspace, verify_leads } = req.body;
if (!campaign_id || !leads || !leads.length) {
return res.status(400).json({ success: false, error: 'Missing campaign_id or leads' });
}
try {
const r = await fetch('https://api.instantly.ai/api/v2/leads', {
method: 'POST',
headers: { 'Authorization': 'Bearer ' + cleanKey, 'Content-Type': 'application/json' },
body: JSON.stringify({
campaign_id, leads,
skip_if_in_workspace: skip_if_in_workspace !== false,
skip_if_in_campaign: false,
verify_leads: verify_leads || false
})
});
const data = await r.json();
if (!r.ok) throw new Error(data.error || data.message || ('HTTP ' + r.status));
res.json({ success: true, added: data.added || leads.length, duplicates: data.duplicates || 0 });
} catch (e) {
console.error('Instantly push error:', e.message);
res.status(500).json({ success: false, error: e.message });
}
});
// ============================================================
// 🎯 CAMPAIGN ENGINE — Weekend Bulk Domain Scanner
// Flow: domains → fetch sitemaps → queue jobs → extract email
//       → create share URL → push to Instantly
// ============================================================
const campaigns = new Map(); // campaignId → campaign state
async function ensureCampaignsTable() {
if (!pool) return;
try {
await pool.query(`CREATE TABLE IF NOT EXISTS campaigns (
id TEXT PRIMARY KEY,
name TEXT,
status TEXT DEFAULT 'running',
total_domains INTEGER DEFAULT 0,
done_domains INTEGER DEFAULT 0,
domains JSONB DEFAULT '[]',
instantly_campaign_id TEXT,
instantly_api_key TEXT,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
)`);
// Migration: add instantly_api_key column if missing
await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS instantly_api_key TEXT`).catch(()=>{});
} catch(e) { console.error('campaigns table error:', e.message); }
}
ensureCampaignsTable();
function persistCampaign(c) {
if (!pool) return;
const slim = { ...c, domains: c.domains.map(d => ({
domain: d.domain, status: d.status, score: d.score,
email: d.email, shareUrl: d.shareUrl, instantlyStatus: d.instantlyStatus,
error: d.error, pageCount: d.pageCount
}))};
pool.query(
`INSERT INTO campaigns(id,name,status,total_domains,done_domains,domains,instantly_campaign_id,instantly_api_key,updated_at)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
ON CONFLICT(id) DO UPDATE SET status=$3,done_domains=$5,domains=$6,updated_at=NOW()`,
[slim.id, slim.name||'Campaign', slim.status, slim.totalDomains, slim.doneDomains,
JSON.stringify(slim.domains), slim.instantlyCampaignId||null, slim.instantlyApiKey||null]
).catch(e => console.error('persistCampaign:', e.message));
}
// Fetch sitemap URLs for a domain
async function fetchSitemapUrls(domain) {
const base = domain.startsWith('http') ? domain : 'https://' + domain;
const host = new URL(base).hostname;
const candidates = [
base + '/sitemap.xml',
base + '/sitemap_index.xml',
base + '/sitemap-index.xml',
base + '/wp-sitemap.xml',
];
// Also check robots.txt
try {
const rb = await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(8000) });
if (rb.ok) {
const txt = await rb.text();
const matches = txt.match(/Sitemap:\s*(\S+)/gi) || [];
matches.forEach(m => { const u = m.replace(/Sitemap:\s*/i,'').trim(); if (!candidates.includes(u)) candidates.unshift(u); });
}
} catch(e) {}
for (const url of candidates) {
try {
const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
if (!r.ok) continue;
const xml = await r.text();
// Sub-sitemap index?
const subMatches = [...xml.matchAll(/<loc>(https?:\/\/[^<]+\.xml[^<]*)<\/loc>/gi)].map(m => m[1]);
if (subMatches.length > 0) {
let allUrls = [];
for (const sub of subMatches.slice(0, 20)) {
try {
const sr = await fetch(sub, { signal: AbortSignal.timeout(8000) });
if (!sr.ok) continue;
const sx = await sr.text();
const us = [...sx.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map(m => m[1]).filter(u => !u.endsWith('.xml'));
allUrls = allUrls.concat(us);
} catch(e) {}
}
if (allUrls.length > 0) return { urls: allUrls, sitemapUrl: url };
}
// Direct URLs
const urls = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map(m => m[1]).filter(u => !u.endsWith('.xml'));
if (urls.length > 0) return { urls, sitemapUrl: url };
} catch(e) {}
}
return { urls: [], sitemapUrl: null };
}
// Extract best email for a domain — scans contact/about pages
async function extractDomainEmail(domain, scannedResults) {
// 1. From already-scanned pages
for (const r of scannedResults) {
const em = r.content_stats?.emails_found?.[0] || r.content_stats?.extractedEmail;
if (em && em.includes('@') && !em.includes('example') && !em.includes('sentry')) return em;
}
// 2. Scrape contact/about/impressum pages specifically
const base = domain.startsWith('http') ? domain : 'https://' + domain;
const contactPages = ['/contact', '/contact-us', '/about', '/about-us', '/over-ons', '/impressum', '/team'];
const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
for (const path of contactPages) {
try {
const r = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
if (!r.ok) continue;
const html = await r.text();
const found = [...new Set(html.match(emailRegex)||[])].filter(e =>
!e.includes('example') && !e.includes('sentry') && !e.includes('wix') &&
!e.endsWith('.png') && !e.endsWith('.jpg'));
// Prefer info@, contact@, hello@ over noreply
const preferred = found.find(e => /^(info|contact|hello|hallo|mail|support)@/.test(e));
if (preferred) return preferred;
if (found.length > 0) return found[0];
} catch(e) {}
}
// 3. Common pattern guess — check if MX exists
const guesses = ['info', 'contact', 'hello', 'mail'];
const domainHost = domain.replace(/https?:\/\//, '').split('/')[0];
for (const prefix of guesses) {
const guess = prefix + '@' + domainHost;
try {
const dns = require('dns').promises;
const mx = await dns.resolveMx(domainHost).catch(() => []);
if (mx.length > 0) return guess; // MX exists, guess is plausible
} catch(e) {}
break; // only try dns once
}
return null;
}
// Create a share URL for domain results
async function createShareUrl(domain, results, req) {
const token = crypto.randomBytes(8).toString('hex');
const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days for campaign
try {
await pool.query(
`INSERT INTO share_results (token, results_json, expires_at) VALUES ($1, $2, to_timestamp($3/1000.0)) ON CONFLICT DO NOTHING`,
[token, JSON.stringify(results), expires]
);
} catch(e) {
try {
await pool.query(`CREATE TABLE IF NOT EXISTS share_results (id SERIAL PRIMARY KEY, token VARCHAR(20) UNIQUE NOT NULL, results_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ)`);
await pool.query(`INSERT INTO share_results (token, results_json, expires_at) VALUES ($1, $2, to_timestamp($3/1000.0))`, [token, JSON.stringify(results), expires]);
} catch(e2) {}
}
// Build base URL from env or default
const base = process.env.BASE_URL || 'https://app.contentscale.site';
return base + '/share/' + token;
}
// Push one lead to Instantly
async function pushLeadToInstantly(apiKey, campaignId, lead) {
const r = await fetch('https://api.instantly.ai/api/v2/leads', {
method: 'POST',
headers: { 'Authorization': 'Bearer ' + apiKey.trim(), 'Content-Type': 'application/json' },
body: JSON.stringify({
campaign_id: campaignId,
leads: [lead],
skip_if_in_workspace: true,
skip_if_in_campaign: false
})
});
const data = await r.json();
if (!r.ok) throw new Error(data.error || data.message || 'HTTP ' + r.status);
return data;
}




// ── Main campaign runner ──────────────────────────────────────
async function runCampaign(campaign) {
campaign.status = 'running';
persistCampaign(campaign);
for (const domainObj of campaign.domains) {
if (campaign.status === 'cancelled') break;
// Skip already completed domains (resume support)
if (domainObj.status === 'done') { continue; }
persistCampaign(campaign);
try {
// Step 1: fetch sitemap
const { urls, sitemapUrl } = await fetchSitemapUrls(domainObj.domain);
if (!urls.length) {
domainObj.status = 'no_sitemap';
domainObj.error = 'No sitemap found';
campaign.doneDomains++;
persistCampaign(campaign);
continue;
}
const capped = urls.slice(0, 500); // cap at 500 per domain in campaign mode
domainObj.pageCount = capped.length;
domainObj.status = 'scanning';
persistCampaign(campaign);
// Step 2: scan pages using job queue
const jobId = crypto.randomBytes(8).toString('hex');
const job = {
id: jobId, userId: 'campaign_' + campaign.id,
status: 'running', total: capped.length, done: 0, failed: 0,
results: [], urls: capped, createdAt: Date.now()
};
bulkJobs.set(jobId, job);
// Run inline (campaign manages concurrency at domain level)
let jobBrowser = null;
try {
jobBrowser = await launchJobBrowser();
if (!jobBrowser) throw new Error('Browser unavailable');
const delay = () => new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
for (const url of capped) {
if (campaign.status === 'cancelled' || job.status === 'cancelled') break;
let result = null;
for (let attempt = 0; attempt < 2; attempt++) {
try { result = await scanOneUrlWithBrowser(url, jobBrowser); break; }
catch(e) {
const isSkip = e.message.startsWith('skip:');
if (attempt === 1 || isSkip) result = { success: false, url, error: e.message, score: 0 };
else await new Promise(r => setTimeout(r, 2000));
}
}
const slim = result && result.success ? {
success: true, url: result.url, score: result.score, quality: result.quality,
metrics: result.metrics,
content_stats: {
wordCount: result.content_stats?.wordCount,
h1Text: result.content_stats?.h1Text,
emails_found: result.content_stats?.emails_found,
extractedEmail: result.content_stats?.extractedEmail
}
} : { success: false, url, error: result?.error || 'failed', score: 0 };
job.results.push(slim);
job.done++;
await delay();
}
} finally {
if (jobBrowser) try { await jobBrowser.close(); } catch(e) {}
job.status = 'done';
}
// Step 3: compute domain avg score
const successful = job.results.filter(r => r.success && r.score > 0);
if (!successful.length) {
domainObj.status = 'no_results';
campaign.doneDomains++;
persistCampaign(campaign);
continue;
}
const avg = arr => Math.round(arr.reduce((a,b) => a+b, 0) / arr.length);
domainObj.score = avg(successful.map(r => r.score));
domainObj.graaf = avg(successful.map(r => r.metrics?.graaf || 0));
domainObj.craft = avg(successful.map(r => r.metrics?.craft || 0));
domainObj.technical = avg(successful.map(r => r.metrics?.technical || 0));
domainObj.pageCount = successful.length;
// Step 4: extract email (skip if already known from CSV)
domainObj.status = 'extracting_email';
const email = domainObj.email || await extractDomainEmail(domainObj.domain, successful);
domainObj.email = email;
// Step 5: create share URL
domainObj.status = 'creating_share';
domainObj.shareUrl = await createShareUrl(domainObj.domain, successful);
// Step 6: top 3 issues from first successful scan
const topIssues = (successful[0]?.recommendations?.all || [])
.filter(r => r.priority === 'high').slice(0, 3).map(r => r.title.replace(/^[^\w]+/, ''));
// Step 7: push to Instantly if configured and email found
domainObj.instantlyStatus = 'skipped';
if (campaign.instantlyApiKey && campaign.instantlyCampaignId && email) {
try {
domainObj.status = 'pushing_to_instantly';
const lead = {
email,
first_name: '',
last_name: '',
company_name: domainObj.domain.replace(/https?:\/\//, '').replace(/^www\./, ''),
website: 'https://' + domainObj.domain.replace(/https?:\/\//, ''),
custom_variables: {
score: String(domainObj.score),
share_url: domainObj.shareUrl,
top_issue_1: topIssues[0] || '',
top_issue_2: topIssues[1] || '',
top_issue_3: topIssues[2] || '',
graaf_score: String(domainObj.graaf),
page_count: String(domainObj.pageCount)
}
};
await pushLeadToInstantly(campaign.instantlyApiKey, campaign.instantlyCampaignId, lead);
domainObj.instantlyStatus = 'pushed';
} catch(e) {
domainObj.instantlyStatus = 'error: ' + e.message.substring(0, 60);
}
} else if (!email) {
domainObj.instantlyStatus = 'no_email';
}
domainObj.status = 'done';
campaign.doneDomains++;
persistCampaign(campaign);
// Delay between domains to be polite
await new Promise(r => setTimeout(r, 3000));
} catch(e) {
domainObj.status = 'error';
domainObj.error = e.message.substring(0, 120);
campaign.doneDomains++;
console.error('Campaign domain error:', domainObj.domain, e.message);
persistCampaign(campaign);
}
}
campaign.status = campaign.status === 'cancelled' ? 'cancelled' : 'done';
persistCampaign(campaign);
console.log(`✅ Campaign ${campaign.id} done: ${campaign.doneDomains}/${campaign.totalDomains} domains`);
}
// ── Campaign endpoints ────────────────────────────────────────
app.post('/api/campaign/start', verifyAdmin, async (req, res) => {
const { domains, name, instantly_api_key, instantly_campaign_id, preset_emails } = req.body;
if (!Array.isArray(domains) || !domains.length)
return res.status(400).json({ success: false, error: 'domains array required' });
const cleanDomains = [...new Set(domains.map(d => d.trim().toLowerCase().replace(/^https?:\/\//,'').split('/')[0]).filter(d => d.includes('.')))];
if (!cleanDomains.length) return res.status(400).json({ success: false, error: 'No valid domains' });
const presetEmails = preset_emails || {};
const campaignId = crypto.randomBytes(8).toString('hex');
const campaign = {
id: campaignId,
name: name || 'Campaign ' + new Date().toLocaleDateString('nl-NL'),
status: 'running',
totalDomains: cleanDomains.length,
doneDomains: 0,
instantlyApiKey: instantly_api_key || null,
instantlyCampaignId: instantly_campaign_id || null,
createdAt: Date.now(),
domains: cleanDomains.map(d => ({
domain: d, status: 'queued', score: null,
email: presetEmails[d] || null, // pre-fill from CSV
shareUrl: null, instantlyStatus: null,
error: null, pageCount: 0
}))
};
campaigns.set(campaignId, campaign);
persistCampaign(campaign);
res.json({ success: true, campaignId, totalDomains: cleanDomains.length });
// Run in background - domains processed sequentially (one browser at a time)
runCampaign(campaign);
});
app.get('/api/campaign/:campaignId', async (req, res) => {
let c = campaigns.get(req.params.campaignId);
if (!c && pool) {
try {
const row = await pool.query('SELECT * FROM campaigns WHERE id=$1', [req.params.campaignId]);
if (row.rows[0]) {
c = { id: row.rows[0].id, name: row.rows[0].name, status: row.rows[0].status,
totalDomains: row.rows[0].total_domains, doneDomains: row.rows[0].done_domains,
domains: row.rows[0].domains, createdAt: new Date(row.rows[0].created_at).getTime(),
instantlyApiKey: row.rows[0].instantly_api_key || null,
instantlyCampaignId: row.rows[0].instantly_campaign_id || null };
campaigns.set(c.id, c);
}
} catch(e) {}
}
if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
res.json({ success: true, ...c });
});
// Resume interrupted campaign — skips done domains, continues from first non-done
app.post('/api/campaign/:campaignId/resume', verifyAdmin, async (req, res) => {
let c = campaigns.get(req.params.campaignId);
if (!c && pool) {
try {
const row = await pool.query('SELECT * FROM campaigns WHERE id=$1', [req.params.campaignId]);
if (row.rows[0]) {
c = { id: row.rows[0].id, name: row.rows[0].name, status: row.rows[0].status,
totalDomains: row.rows[0].total_domains, doneDomains: row.rows[0].done_domains,
domains: row.rows[0].domains, createdAt: new Date(row.rows[0].created_at).getTime(),
instantlyApiKey: row.rows[0].instantly_api_key || null,
instantlyCampaignId: row.rows[0].instantly_campaign_id || null };
campaigns.set(c.id, c);
}
} catch(e) {}
}
if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
if (c.status === 'running') return res.status(400).json({ success: false, error: 'Campaign already running' });
const pending = (c.domains || []).filter(d => d.status !== 'done' && d.status !== 'cancelled').length;
if (!pending) return res.status(400).json({ success: false, error: 'All domains already done' });
// Allow override of Instantly credentials
if (req.body.instantly_api_key) c.instantlyApiKey = req.body.instantly_api_key;
if (req.body.instantly_campaign_id) c.instantlyCampaignId = req.body.instantly_campaign_id;
// Reset stuck domains
(c.domains || []).forEach(d => {
if (d.status !== 'done' && d.status !== 'error') d.status = 'queued';
});
c.status = 'running';
campaigns.set(c.id, c);
persistCampaign(c);
res.json({ success: true, pending, campaignId: c.id });
runCampaign(c);
});
// Retry push only — for done domains where instantlyStatus is not 'pushed'
app.post('/api/campaign/:campaignId/retry-push', verifyAdmin, async (req, res) => {
let c = campaigns.get(req.params.campaignId);
if (!c && pool) {
try {
const row = await pool.query('SELECT * FROM campaigns WHERE id=$1', [req.params.campaignId]);
if (row.rows[0]) {
c = { id: row.rows[0].id, name: row.rows[0].name, status: row.rows[0].status,
totalDomains: row.rows[0].total_domains, doneDomains: row.rows[0].done_domains,
domains: row.rows[0].domains, createdAt: new Date(row.rows[0].created_at).getTime(),
instantlyApiKey: row.rows[0].instantly_api_key || null,
instantlyCampaignId: row.rows[0].instantly_campaign_id || null };
campaigns.set(c.id, c);
}
} catch(e) {}
}
if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
const apiKey = req.body.instantly_api_key || c.instantlyApiKey;
const campId = req.body.instantly_campaign_id || c.instantlyCampaignId;
if (!apiKey || !campId) return res.status(400).json({ success: false, error: 'Instantly API key and campaign ID required' });
const toRetry = (c.domains || []).filter(d => d.status === 'done' && d.email && d.instantlyStatus !== 'pushed');
if (!toRetry.length) return res.json({ success: true, pushed: 0, message: 'Nothing to retry' });
let pushed = 0, failed = 0;
for (const d of toRetry) {
try {
const topIssues = [];
await pushLeadToInstantly(apiKey, campId, {
email: d.email,
company_name: d.domain.replace(/^www\./, ''),
website: 'https://' + d.domain,
custom_variables: { score: String(d.score||0), share_url: d.shareUrl||'', top_issue_1: '', top_issue_2: '', top_issue_3: '', page_count: String(d.pageCount||0) }
});
d.instantlyStatus = 'pushed';
pushed++;
} catch(e) {
d.instantlyStatus = 'error: ' + e.message.substring(0, 40);
failed++;
}
}
persistCampaign(c);
res.json({ success: true, pushed, failed });
});
app.post('/api/campaign/:campaignId/cancel', verifyAdmin, (req, res) => {
const c = campaigns.get(req.params.campaignId);
if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
c.status = 'cancelled';
persistCampaign(c);
res.json({ success: true });
});
app.get('/api/campaign', verifyAdmin, async (req, res) => {
const list = [];
for (const [, c] of campaigns) {
list.push({ id: c.id, name: c.name, status: c.status, totalDomains: c.totalDomains,
doneDomains: c.doneDomains, createdAt: c.createdAt });
}
// Also load from DB
if (pool) {
try {
const rows = await pool.query('SELECT id,name,status,total_domains,done_domains,created_at FROM campaigns ORDER BY created_at DESC LIMIT 20');
rows.rows.forEach(r => {
if (!list.find(l => l.id === r.id))
list.push({ id: r.id, name: r.name, status: r.status, totalDomains: r.total_domains,
doneDomains: r.done_domains, createdAt: new Date(r.created_at).getTime() });
});
} catch(e) {}
}
list.sort((a,b) => b.createdAt - a.createdAt);
res.json({ success: true, campaigns: list.slice(0, 30) });
});
app.delete('/api/campaign/:campaignId', verifyAdmin, async (req, res) => {
const id = req.params.campaignId;
campaigns.delete(id);
if (pool) {
try { await pool.query('DELETE FROM campaigns WHERE id = $1', [id]); } catch(e) {}
}
res.json({ success: true });
});
// ── ContentScore Badge API ────────────────────────────────────────────────────
app.get('/api/score', async (req, res) => {
res.setHeader('Access-Control-Allow-Origin', '*');
const { url } = req.query;
if (!url) return res.json({ success: false, error: 'url required' });
if (!pool) return res.json({ success: false, error: 'DB unavailable' });
try {
const normalize = u => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
const norm = normalize(url);
const domain = norm.split('/')[0];
const isHomepage = norm === domain;
// 1. Exact URL match in scan_log (specific page score)
const exact = await pool.query(
`SELECT score, business_url FROM scan_log
WHERE LOWER(REPLACE(REPLACE(business_url, 'https://', ''), 'http://', '')) ILIKE $1
OR LOWER(REPLACE(REPLACE(business_url, 'https://www.', ''), 'http://www.', '')) ILIKE $1
ORDER BY created_at DESC LIMIT 1`,
[norm.replace(/\/$/, '') + '%']
);
if (exact.rows.length && exact.rows[0].score) {
return res.json({ success: true, url: exact.rows[0].business_url, score: exact.rows[0].score, source: 'scan_log_exact' });
}
// 2. Leaderboard — only for homepage queries
if (isHomepage) {
const lb = await pool.query(`SELECT score, graaf_score, craft_score, technical_score, url FROM leaderboard WHERE admin_verified = TRUE ORDER BY created_at DESC LIMIT 200`);
const lbMatch = lb.rows.find(r => normalize(r.url) === domain);
if (lbMatch) {
return res.json({ success: true, url: lbMatch.url, score: lbMatch.score,
graaf: lbMatch.graaf_score, craft: lbMatch.craft_score, technical: lbMatch.technical_score, source: 'leaderboard' });
}
}
// 3. Not found — no domain fallback (badge should show "Not scanned yet")
res.json({ success: false, error: 'Not scanned yet', hint: 'Scan at app.contentscale.site first' });
} catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
// ── Badge loader script ──────────────────────────────────────────────────────
app.get('/badge-loader.js', (req, res) => {
res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
res.setHeader('Access-Control-Allow-Origin', '*');
res.send(`
(function() {
var badges = document.querySelectorAll('[data-cs-badge]');
if (!badges.length) return;
var pageUrl = window.location.href.replace(/#.*$/, '').replace(/\\?.*$/, '');
var apiUrl = 'https://app.contentscale.site/api/score?url=' + encodeURIComponent(pageUrl);
function getTier(s) {
if (s >= 90) return { label:'ELITE',       color:'#16a34a', bg:'#14532d', text:'#4ade80', bars:3 };
if (s >= 80) return { label:'STRONG',      color:'#2563eb', bg:'#1e3a8a', text:'#93c5fd', bars:3 };
if (s >= 70) return { label:'QUALIFIED',   color:'#84cc16', bg:'#365314', text:'#bef264', bars:2 };
if (s >= 50) return { label:'OPPORTUNITY', color:'#f59e0b', bg:'#78350f', text:'#fcd34d', bars:1 };
return         { label:'CRITICAL',     color:'#dc2626', bg:'#7f1d1d', text:'#fca5a5', bars:1 };
}
function bar(on, color) {
return '<div style="width:20px;height:4px;background:' + (on ? color : '#374151') + ';border-radius:2px;"></div>';
}
fetch(apiUrl)
.then(function(r) { return r.json(); })
.then(function(data) {
if (!data.success || !data.score) {
badges.forEach(function(el) {
el.innerHTML = '<div style="display:inline-flex;align-items:center;gap:8px;background:#111827;border:1px solid #374151;border-radius:10px;padding:10px 16px;font-family:system-ui,sans-serif;">'
+ '<span style="font-size:11px;color:#6b7280;">Not scanned yet &mdash;</span>'
+ '<a href="https://app.contentscale.site" target="_blank" rel="noopener" style="font-size:11px;color:#a78bfa;font-weight:700;text-decoration:none;">Scan now</a>'
+ '</div>';
});
return;
}
var score = data.score;
var t = getTier(score);
var html = '<div style="display:inline-flex;align-items:center;border-radius:10px;overflow:hidden;border:1px solid #374151;font-family:system-ui,sans-serif;background:#111827;">'
+ '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;">'
+ '<div style="display:flex;flex-direction:column;gap:1px;">'
+ '<span style="font-size:11px;font-weight:700;background:linear-gradient(135deg,#a855f7,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-transform:uppercase;letter-spacing:.06em;">ContentScore</span>'
+ '<span style="font-size:9px;color:#9ca3af;">This page</span>'
+ '<div style="display:flex;align-items:baseline;gap:3px;">'
+ '<span style="font-size:26px;font-weight:900;color:' + t.color + ';line-height:1;font-variant-numeric:tabular-nums;">' + score + '</span>'
+ '<span style="font-size:11px;color:#6b7280;">/100</span>'
+ '</div>'
+ '</div>'
+ '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">'
+ '<span style="font-size:10px;font-weight:800;background:' + t.bg + ';color:' + t.text + ';border-radius:4px;padding:2px 7px;letter-spacing:.04em;">' + t.label + '</span>'
+ '<div style="display:flex;gap:2px;">'
+ bar(t.bars >= 1, t.color) + bar(t.bars >= 2, t.color) + bar(t.bars >= 3, t.color)
+ '</div>'
+ '</div>'
+ '</div>'
+ '<div style="width:1px;background:#374151;align-self:stretch;"></div>'
+ '<a href="https://app.contentscale.site" target="_blank" rel="noopener" style="padding:10px 16px;color:#e5e7eb;font-size:12px;font-weight:700;display:flex;align-items:center;gap:4px;text-decoration:none;">'
+ '<span style="font-size:12px;line-height:1;">&#x21bb;</span><span>Rescan</span>'
+ '</a>'
+ '</div>';
badges.forEach(function(el) { el.innerHTML = html; });
})
.catch(function() {});
})();
`);
});



// ══════════════════════════════════════════════════════════════════════
// VAPI VOICEBOT ROUTES
// ══════════════════════════════════════════════════════════════════════

// POST /api/voicebot/call — trigger outbound call via Vapi
app.post('/api/voicebot/call', async (req, res) => {
  const { vapiKey, phoneId, customerPhone, customerName, assistant, leadId } = req.body;

  if (!vapiKey || vapiKey.length < 10) {
    return res.status(401).json({ error: 'Vapi API key required' });
  }
  if (!phoneId) {
    return res.status(400).json({ error: 'phoneId (Vapi Phone Number ID) required' });
  }
  if (!customerPhone) {
    return res.status(400).json({ error: 'customerPhone required' });
  }

  // Normalise phone: Vapi needs E.164 format (+31612345678)
  let phone = customerPhone.replace(/[\s\-().]/g, '');
  if (!phone.startsWith('+')) phone = '+' + phone;

  try {
    const upstream = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vapiKey}`,
      },
      body: JSON.stringify({
        phoneNumberId: phoneId,
        customer: {
          number: phone,
          name: customerName || '',
        },
        assistant: assistant || {
          firstMessage: `Hi, is this ${customerName || 'there'}? I have a quick question about your website — do you have 2 minutes?`,
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            systemPrompt: 'You are a friendly content writing specialist. Ask if they need help with their website content. Be brief and natural.',
          },
          voice: { provider: '11labs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
          endCallMessage: 'Thanks for your time, have a great day!',
          maxDurationSeconds: 240,
        },
      }),
    });

    const data = await upstream.json();
    console.log(`[vapi] call initiated → ${phone} | status ${upstream.status} | id ${data.id||'?'}`);

    if (!upstream.ok) {
      const errMsg = data.message || data.error || JSON.stringify(data).slice(0, 200);
      return res.status(upstream.status).json({ error: errMsg });
    }

    res.json({ callId: data.id, status: data.status, leadId });

  } catch (err) {
    console.error('[vapi] call error:', err.message);
    res.status(502).json({ error: 'Vapi request failed: ' + err.message });
  }
});

// GET /api/voicebot/status/:callId — poll call outcome
app.get('/api/voicebot/status/:callId', async (req, res) => {
  const vapiKey = req.headers['x-vapi-key'];
  if (!vapiKey) return res.status(401).json({ error: 'x-vapi-key header required' });

  try {
    const upstream = await fetch(`https://api.vapi.ai/call/${req.params.callId}`, {
      headers: { 'Authorization': `Bearer ${vapiKey}` },
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.message || 'Vapi error' });

    // Extract clean summary from analysis or messages
    let summary = '';
    if (data.analysis?.summary) summary = data.analysis.summary;
    else if (data.summary) summary = data.summary;
    else if (Array.isArray(data.messages)) {
      // Build a short transcript snippet from last few messages
      summary = data.messages
        .filter(m => m.role === 'assistant' || m.role === 'user')
        .slice(-4)
        .map(m => `${m.role === 'assistant' ? 'Bot' : 'Customer'}: ${(m.message||'').slice(0,80)}`)
        .join(' | ');
    }

    res.json({
      callId:      data.id,
      status:      data.status,        // queued | ringing | in-progress | forwarding | ended | failed
      endedReason: data.endedReason,   // voicemail | customer-ended-call | assistant-said-end-call-phrase | no-answer | busy | failed
      duration:    data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null,
      summary,
    });

  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/voicebot/webhook — Vapi sends outcome here (optional, for real-time push)
app.post('/api/voicebot/webhook', (req, res) => {
  const event = req.body;
  console.log('[vapi webhook]', event?.message?.type, event?.message?.call?.id || '');
  // Just acknowledge — frontend polls for status itself
  res.json({ received: true });
});



// ============================================
// VAPI WEB CALL ENDPOINT — Otto on homepage
// ============================================
app.post('/api/vapi/webcall', async (req, res) => {
  try {
    console.log('[vapi/webcall] content-length:', req.headers['content-length']);
    console.log('[vapi/webcall] body:', req.body);
    const privateKey = process.env.VAPI_PRIVATE_KEY;
    if (!privateKey) return res.status(500).json({ error: 'VAPI_PRIVATE_KEY not set in Railway' });
    const assistantId = (req.body && req.body.assistantId) || 'b4ba165e-daaa-4723-a10d-40262359a8da';
    const response = await fetch('https://api.vapi.ai/call/web', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privateKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ assistantId })
    });
    const text = await response.text();
    console.log('[vapi/webcall] status:', response.status, 'body:', text);
    res.status(response.status).send(text);
  } catch (err) {
    console.error('[vapi/webcall] exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// CONTENTSCALE OUTBOUND AGENT — Server-side
// Uses VAPI_PRIVATE_KEY — no user key needed
// For Ottmar's own lead crawler outbound calls
// ============================================
app.post('/api/cs-agent/call', async (req, res) => {
  const { customerPhone, customerName, customerDomain, customerPages, customerCity, customerType, pitchAngle, opportunity, bucket, leadId } = req.body || {};

  if (!customerPhone) return res.status(400).json({ error: 'customerPhone required' });

  const privateKey = process.env.VAPI_PRIVATE_KEY;
  const phoneId    = process.env.VAPI_PHONE_ID; // your Vapi phone number ID
  if (!privateKey) return res.status(500).json({ error: 'VAPI_PRIVATE_KEY not set' });
  if (!phoneId)    return res.status(500).json({ error: 'VAPI_PHONE_ID not set' });

  let phone = customerPhone.replace(/[\s\-().]/g, '');
  if (!phone.startsWith('+')) phone = '+' + phone;

  const name    = customerName  || 'there';
  const domain  = customerDomain || 'your website';
  const pages   = customerPages  || '?';
  const city    = customerCity   || 'your city';
  const type    = customerType   || 'business';

  const assistant = {
    firstMessage: `Hi, just to be transparent — I'm an AI assistant calling on behalf of Ottmar from ContentScale. Is this ${name}? I just scanned ${domain} and spotted something that could help you get more clients — do you have 2 minutes?`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      systemPrompt: `You are Otto, an AI assistant calling on behalf of Ottmar Francisca from ContentScale — a content intelligence platform based in Amsterdam.

LEGAL COMPLIANCE — MANDATORY FIRST LINE:
Always start with: "Hi, just to be transparent — I'm an AI assistant calling on behalf of Ottmar from ContentScale."

LEAD CONTEXT:
- Business name: ${name}
- Website: ${domain}
- Pages found: ~${pages} pages
- City: ${city}
- Business type: ${type}

YOUR GOAL: Qualify the lead. Get their email with permission. Book a 15-min call with Ottmar.

CALL FLOW:
1. OPENING (AI disclosure first, always):
"Hi, just to be transparent — I'm an AI assistant calling on behalf of Ottmar from ContentScale. Is this ${name}? I just scanned ${domain} and found your website has about ${pages} pages — most businesses in ${city} that rank well on Google have 3–4× more content. I can share exactly what's missing. Do you have 2 minutes?"

2. IF THEY ENGAGE — discovery:
- "Are you currently getting clients from Google, or mostly referrals?"
- "Have you tried content marketing before?"
- "Is growing your online visibility a priority this year?"

3. PITCH:
- If few pages: "The good news is you have a clean site — adding the right content could get you showing up for searches your competitors own right now."
- If interested: "I'd love to send you a free 1-page audit showing exactly what to fix first. What's the best email for that?" [GET EMAIL WITH PERMISSION]

4. CLOSE:
"Great — I'll have Ottmar send that over today. Is there a good time this week for a quick 15-minute call with him to go through it?"

5. IF NOT INTERESTED:
"Totally understand. I'll let Ottmar know. Have a great day!"

6. VOICEMAIL:
"Hi ${name}, this is an AI assistant calling for Ottmar Francisca from ContentScale. I scanned ${domain} and found specific ways to help you rank better on Google. Call +31 6 2807 3996 to speak with Ottmar directly — or visit contentscale.site. Have a great day!"

RULES:
- Always disclose AI upfront — never pretend to be human
- If asked "are you a real person?" → be honest: "I'm an AI, yes — but Ottmar is a real person and will follow up personally."
- Immediate opt-out: if they say stop/remove/not interested — confirm removal and end call
- B2B only, calling hours 8am–8pm
- Warm and conversational — not robotic
- Max 3–4 minutes, respect their time`,
    },
    voice: {
      provider: '11labs',
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam — natural, professional
    },
    endCallMessage: 'Thanks for your time, have a great day!',
    voicemailMessage: `Hi ${name}, this is an AI assistant calling for Ottmar from ContentScale. I scanned ${domain} and found ways to help you get more clients from Google. Call +31 6 2807 3996 or visit contentscale.site. Have a great day!`,
    maxDurationSeconds: 240,
    backchannelingEnabled: true,
    endCallFunctionEnabled: true,
  };

  try {
    const upstream = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${privateKey}`,
      },
      body: JSON.stringify({
        phoneNumberId: phoneId,
        customer: { number: phone, name },
        assistant,
      }),
    });

    const data = await upstream.json();
    console.log(`[cs-agent] call → ${phone} | ${name} | ${domain} | status ${upstream.status} | id ${data.id||'?'}`);

    if (!upstream.ok) {
      const errMsg = data.message || data.error || JSON.stringify(data).slice(0, 200);
      return res.status(upstream.status).json({ error: errMsg });
    }

    res.json({ callId: data.id, status: data.status, leadId });
  } catch (err) {
    console.error('[cs-agent] error:', err.message);
    res.status(502).json({ error: 'Vapi request failed: ' + err.message });
  }
});

// GET /api/cs-agent/status/:callId — poll outcome (uses server VAPI_PRIVATE_KEY)
app.get('/api/cs-agent/status/:callId', async (req, res) => {
  const privateKey = process.env.VAPI_PRIVATE_KEY;
  if (!privateKey) return res.status(500).json({ error: 'VAPI_PRIVATE_KEY not set' });
  try {
    const upstream = await fetch(`https://api.vapi.ai/call/${req.params.callId}`, {
      headers: { 'Authorization': `Bearer ${privateKey}` },
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.message || 'Vapi error' });
    let summary = data.analysis?.summary || data.summary || '';
    if (!summary && Array.isArray(data.messages)) {
      summary = data.messages
        .filter(m => m.role === 'assistant' || m.role === 'user')
        .slice(-4)
        .map(m => `${m.role === 'assistant' ? 'Otto' : 'Customer'}: ${(m.message||'').slice(0,80)}`)
        .join(' | ');
    }
    res.json({ callId: data.id, status: data.status, endedReason: data.endedReason, duration: data.endedAt && data.startedAt ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000) : null, summary });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Headshot redirect ──────────────────────────────────────────────────────
app.get('/headshot', (req, res) => {
  res.redirect(301, 'https://raw.githubusercontent.com/ottey1969/contentscale-platform/main/public/blog/images/ottmar-francisca.jpg');
});

app.get('/wp-content/uploads/2025/11/ottmar-francisca-headshot.png', (req, res) => {
  res.redirect(301, 'https://raw.githubusercontent.com/ottey1969/contentscale-platform/main/public/blog/images/ottmar-francisca.jpg');
});


// ============================================================
// AUDIT ROUTES — BEFORE startServer()
// ============================================================

const auditUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'gsc_files',   maxCount: 5  },
  { name: 'attachments', maxCount: 10 },
]);

function servePublic(filename) {
  return (req, res) => {
    const candidates = [
      path.join(__dirname, 'public', filename),
      path.join(__dirname, '..', 'public', filename),
    ];
    const found = candidates.find(p => fs.existsSync(p));
    if (!found) return res.status(404).send(`<html><body style="font-family:system-ui;background:#030712;color:#e5e7eb;padding:40px;"><h2 style="color:#fbbf24;">${filename} not found</h2><p style="color:#6b7280;">Place file in <code>public/${filename}</code></p></body></html>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(found);
  };
}

app.get('/audit-seo', (req, res) => {
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(301, '/seo-audit' + qs);
});
app.get('/audit',     (req, res) => res.redirect(301, '/seo-audit'));
app.get('/audit-intake',          servePublic('audit-intake.html'));
app.get('/audit-workflow', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Buffer.from("CjwhRE9DVFlQRSBodG1sPgo8aHRtbCBsYW5nPSJlbiI+CjxoZWFkPgo8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CjxtZXRhIG5hbWU9InZpZXdwb3J0IiBjb250ZW50PSJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MS4wIj4KPG1ldGEgbmFtZT0icm9ib3RzIiBjb250ZW50PSJub2luZGV4LG5vZm9sbG93LG5vYXJjaGl2ZSI+Cjx0aXRsZT5TRU8gQXVkaXQgV29ya2Zsb3cgTWFuYWdlciB8IENvbnRlbnRTY2FsZTwvdGl0bGU+CjxsaW5rIGhyZWY9Imh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzMj9mYW1pbHk9QmViYXMrTmV1ZSZmYW1pbHk9RE0rU2Fuczp3Z2h0QDMwMDs0MDA7NTAwOzcwMCZmYW1pbHk9SUJNK1BsZXgrTW9ubzp3Z2h0QDQwMDs3MDAmZGlzcGxheT1zd2FwIiByZWw9InN0eWxlc2hlZXQiPgo8c3R5bGU+CiosKjo6YmVmb3JlLCo6OmFmdGVye2JveC1zaXppbmc6Ym9yZGVyLWJveDttYXJnaW46MDtwYWRkaW5nOjB9Cjpyb290ewogIC0tYmc6IzAzMDcxMjstLWNhcmQ6IzBmMTcyYTstLXN1cmZhY2U6IzFlMjkzYjstLWJvcmRlcjojMzM0MTU1OwogIC0taW5rOiNmOWZhZmI7LS1tdXRlZDojOTRhM2I4Oy0tc3ViOiM2NDc0OGI7LS1kaW06IzQ3NTU2OTsKICAtLXB1cnBsZTojYTc4YmZhOy0tYmx1ZTojNjBhNWZhOy0tZ3JlZW46IzRhZGU4MDstLW9yYW5nZTojZmI5MjNjOwogIC0tYW1iZXI6I2Y1OWUwYjstLXJlZDojZjQzZjNmOy0tZ29sZDojZmJiZjI0Owp9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjttaW4taGVpZ2h0OjEwMHZoO2xpbmUtaGVpZ2h0OjEuNTt9Ci53cmFwe21heC13aWR0aDoxMzAwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nOjAgMjBweCA4MHB4O30KCi50b3BiYXJ7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtwYWRkaW5nOjE2cHggMDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO21hcmdpbi1ib3R0b206MThweDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDt9Ci5icmFuZHtmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MjBweDtsZXR0ZXItc3BhY2luZzouMDZlbTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZywjYTc4YmZhLCM2MGE1ZmEpOy13ZWJraXQtYmFja2dyb3VuZC1jbGlwOnRleHQ7LXdlYmtpdC10ZXh0LWZpbGwtY29sb3I6dHJhbnNwYXJlbnQ7YmFja2dyb3VuZC1jbGlwOnRleHQ7dGV4dC1kZWNvcmF0aW9uOm5vbmU7fQoudG9vbC10aXRsZXtmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MTVweDtsZXR0ZXItc3BhY2luZzouMDRlbTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1nb2xkKSx2YXIoLS1wdXJwbGUpKTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0Oy13ZWJraXQtdGV4dC1maWxsLWNvbG9yOnRyYW5zcGFyZW50O2JhY2tncm91bmQtY2xpcDp0ZXh0O30KLnRvcGJhci1yaWdodHtkaXNwbGF5OmZsZXg7Z2FwOjdweDtmbGV4LXdyYXA6d3JhcDt9Ci5idG57Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4wOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtwYWRkaW5nOjdweCAxM3B4O2JvcmRlci1yYWRpdXM6NXB4O2N1cnNvcjpwb2ludGVyO2JvcmRlcjoxcHggc29saWQ7dHJhbnNpdGlvbjphbGwgLjE1czt3aGl0ZS1zcGFjZTpub3dyYXA7YmFja2dyb3VuZDpub25lO30KLmJ0bi1nb2xke2JhY2tncm91bmQ6dmFyKC0tZ29sZCkhaW1wb3J0YW50O2NvbG9yOiMwMDAhaW1wb3J0YW50O2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKSFpbXBvcnRhbnQ7fQouYnRuLWdvbGQ6aG92ZXJ7b3BhY2l0eTouODU7fQouYnRuLWdyZWVue2JhY2tncm91bmQ6cmdiYSg3NCwyMjIsMTI4LC4xKTtib3JkZXItY29sb3I6cmdiYSg3NCwyMjIsMTI4LC4zKTtjb2xvcjp2YXIoLS1ncmVlbik7fQouYnRuLWdyZWVuOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tZ3JlZW4pO2NvbG9yOiMwMDA7fQouYnRuLWJsdWV7YmFja2dyb3VuZDpyZ2JhKDk2LDE2NSwyNTAsLjEpO2JvcmRlci1jb2xvcjpyZ2JhKDk2LDE2NSwyNTAsLjMpO2NvbG9yOnZhcigtLWJsdWUpO30KLmJ0bi1ibHVlOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYmx1ZSk7Y29sb3I6IzAwMDt9Ci5idG4tcHVycGxle2JhY2tncm91bmQ6cmdiYSgxNjcsMTM5LDI1MCwuMSk7Ym9yZGVyLWNvbG9yOnJnYmEoMTY3LDEzOSwyNTAsLjMpO2NvbG9yOnZhcigtLXB1cnBsZSk7fQouYnRuLXB1cnBsZTpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXB1cnBsZSk7Y29sb3I6IzAwMDt9Ci5idG4tcmVke2JhY2tncm91bmQ6cmdiYSgyNDQsNjMsNjMsLjA4KTtib3JkZXItY29sb3I6cmdiYSgyNDQsNjMsNjMsLjI1KTtjb2xvcjp2YXIoLS1yZWQpO30KLmJ0bi1yZWQ6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1yZWQpO2NvbG9yOiNmZmY7fQouYnRuLW11dGVke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLWNvbG9yOnZhcigtLWJvcmRlcik7Y29sb3I6dmFyKC0tbXV0ZWQpO30KLmJ0bi1tdXRlZDpob3Zlcntjb2xvcjp2YXIoLS1pbmspO30KLmJ0bi1zbXtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtc2l6ZTo4cHg7fQoKLyogUHJvamVjdCBiYXIgKi8KLnByb2plY3QtYmFye2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6MTBweDtwYWRkaW5nOjE2cHggMjBweDttYXJnaW4tYm90dG9tOjE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmZsZXgtZW5kO30KLnBme2ZsZXg6MTttaW4td2lkdGg6MTMwcHg7fQoucGYgbGFiZWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xNGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo1cHg7fQoucGYgaW5wdXR7d2lkdGg6MTAwJTtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzo4cHggMTFweDtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1pbmspO291dGxpbmU6bm9uZTt9Ci5wZiBpbnB1dDpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7fQoKLyogT3ZlcnZpZXcgKi8KLm92ZXJ2aWV3e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDYsMWZyKTtnYXA6OHB4O21hcmdpbi1ib3R0b206MTZweDt9CkBtZWRpYShtYXgtd2lkdGg6NzAwcHgpey5vdmVydmlld3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsMWZyKTt9fQoub3Z7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzoxMnB4IDE0cHg7dGV4dC1hbGlnbjpjZW50ZXI7fQoub3Ytbntmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MzJweDtsaW5lLWhlaWdodDoxO21hcmdpbi1ib3R0b206M3B4O30KLm92LWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7fQoucHJvZy13cmFwe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czozcHg7aGVpZ2h0OjRweDtvdmVyZmxvdzpoaWRkZW47bWFyZ2luLXRvcDo2cHg7fQoucHJvZy1maWxse2hlaWdodDoxMDAlO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLWdvbGQpLHZhcigtLWdyZWVuKSk7Ym9yZGVyLXJhZGl1czozcHg7dHJhbnNpdGlvbjp3aWR0aCAuNHM7fQoKLyogQWRkIHBhbmVsICovCi5hZGQtcGFuZWx7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6MTZweCAyMHB4O21hcmdpbi1ib3R0b206MTRweDt9Ci5hZGQtcGFuZWwtdGl0bGV7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO21hcmdpbi1ib3R0b206MTBweDt9Ci5hZGQtcm93e2Rpc3BsYXk6ZmxleDtnYXA6N3B4O2ZsZXgtd3JhcDp3cmFwO30KLmFkZC1yb3cgaW5wdXQsLmFkZC1yb3cgc2VsZWN0e2JhY2tncm91bmQ6dmFyKC0tYmcpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjlweCAxMXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0taW5rKTtvdXRsaW5lOm5vbmU7fQouYWRkLXJvdyBpbnB1dDpmb2N1cywuYWRkLXJvdyBzZWxlY3Q6Zm9jdXN7Ym9yZGVyLWNvbG9yOnZhcigtLWdvbGQpO30KLmFkZC1yb3cgc2VsZWN0IG9wdGlvbntiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO30KLmFpLXVybHtmbGV4OjM7bWluLXdpZHRoOjE4MHB4O30KLmFpLWt3e2ZsZXg6MjttaW4td2lkdGg6MTQwcHg7fQouYWktcG9ze3dpZHRoOjkwcHg7fQouYWktaW1wcnt3aWR0aDo5MHB4O30KLmJ1bGstYXJlYXt3aWR0aDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tYmcpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjlweCAxMXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0taW5rKTtvdXRsaW5lOm5vbmU7bWluLWhlaWdodDo2MHB4O3Jlc2l6ZTp2ZXJ0aWNhbDttYXJnaW4tdG9wOjhweDt9Ci5idWxrLWFyZWE6Zm9jdXN7Ym9yZGVyLWNvbG9yOnZhcigtLWdvbGQpO30KCi8qIEZpbHRlciBiYXIgKi8KLmZpbHRlci1iYXJ7ZGlzcGxheTpmbGV4O2dhcDo3cHg7bWFyZ2luLWJvdHRvbToxMnB4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjt9Ci5maWx0ZXItYmFyIHNlbGVjdCwuZmlsdGVyLWJhciBpbnB1dHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjZweCAxMHB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDZlbTtjb2xvcjp2YXIoLS1tdXRlZCk7b3V0bGluZTpub25lO30KLmZpbHRlci1iYXIgaW5wdXR7dGV4dC10cmFuc2Zvcm06bm9uZTtmb250LXNpemU6MTJweDt9Ci5maWx0ZXItYmFyIGlucHV0OmZvY3VzLC5maWx0ZXItYmFyIHNlbGVjdDpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7Y29sb3I6dmFyKC0taW5rKTt9CgovKiBQYWdlIGNhcmRzICovCi5wYWdlcy1saXN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweDt9Ci5wYWdlLWNhcmR7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czoxMHB4O292ZXJmbG93OmhpZGRlbjt9Ci5wYWdlLWNhcmQucy1kb25le2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1ncmVlbik7fQoucGFnZS1jYXJkLnMtaW5wcm9ncmVzc3tib3JkZXItbGVmdDozcHggc29saWQgdmFyKC0tZ29sZCk7fQoucGFnZS1jYXJkLnMtbm90c3RhcnRlZHtib3JkZXItbGVmdDozcHggc29saWQgdmFyKC0tZGltKTt9Ci5wYWdlLWNhcmQucy1mb2xsb3d1cHtib3JkZXItbGVmdDozcHggc29saWQgdmFyKC0tcHVycGxlKTt9Ci5wYWdlLWNhcmQucy1ibG9ja2Vke2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1yZWQpO30KCi5jYXJkLWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OXB4O3BhZGRpbmc6MTFweCAxNXB4O2N1cnNvcjpwb2ludGVyO3VzZXItc2VsZWN0Om5vbmU7fQouY2FyZC1oZWFkOmhvdmVye2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuMDIpO30KLmNhcmQtcmFua3tmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MjBweDtjb2xvcjp2YXIoLS1kaW0pO3dpZHRoOjI2cHg7dGV4dC1hbGlnbjpjZW50ZXI7ZmxleC1zaHJpbms6MDt9Ci5wcmktZG90e3dpZHRoOjdweDtoZWlnaHQ6N3B4O2JvcmRlci1yYWRpdXM6NTAlO2ZsZXgtc2hyaW5rOjA7fQoucHJpLWhpZ2h7YmFja2dyb3VuZDp2YXIoLS1yZWQpO30KLnByaS1tZWR7YmFja2dyb3VuZDp2YXIoLS1nb2xkKTt9Ci5wcmktbG93e2JhY2tncm91bmQ6dmFyKC0tZ3JlZW4pO30KLmNhcmQtdXJse2ZsZXg6MTtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWJsdWUpO3dvcmQtYnJlYWs6YnJlYWstYWxsO2xpbmUtaGVpZ2h0OjEuNDt9Ci5jYXJkLWt3e2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tbGVmdDo0cHg7fQouY2FyZC1nc2N7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLWRpbSk7d2hpdGUtc3BhY2U6bm93cmFwO30KLmNhcmQtY2hre2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tZ29sZCk7d2hpdGUtc3BhY2U6bm93cmFwO30KLnN0YXR1cy1idG57Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4wOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtwYWRkaW5nOjNweCA4cHg7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7Ym9yZGVyOjFweCBzb2xpZDt3aGl0ZS1zcGFjZTpub3dyYXA7fQoucy1ub3RzdGFydGVkIC5zdGF0dXMtYnRue2JhY2tncm91bmQ6cmdiYSg3MSw4NSwxMDUsLjIpO2NvbG9yOnZhcigtLXN1Yik7Ym9yZGVyLWNvbG9yOnZhcigtLWJvcmRlcik7fQoucy1pbnByb2dyZXNzIC5zdGF0dXMtYnRue2JhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4xKTtjb2xvcjp2YXIoLS1nb2xkKTtib3JkZXItY29sb3I6cmdiYSgyNTEsMTkxLDM2LC4zKTt9Ci5zLWRvbmUgLnN0YXR1cy1idG57YmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjEpO2NvbG9yOnZhcigtLWdyZWVuKTtib3JkZXItY29sb3I6cmdiYSg3NCwyMjIsMTI4LC4zKTt9Ci5zLWZvbGxvd3VwIC5zdGF0dXMtYnRue2JhY2tncm91bmQ6cmdiYSgxNjcsMTM5LDI1MCwuMSk7Y29sb3I6dmFyKC0tcHVycGxlKTtib3JkZXItY29sb3I6cmdiYSgxNjcsMTM5LDI1MCwuMyk7fQoucy1ibG9ja2VkIC5zdGF0dXMtYnRue2JhY2tncm91bmQ6cmdiYSgyNDQsNjMsNjMsLjEpO2NvbG9yOnZhcigtLXJlZCk7Ym9yZGVyLWNvbG9yOnJnYmEoMjQ0LDYzLDYzLC4zKTt9Ci5jaGV2cm9ue2NvbG9yOnZhcigtLWRpbSk7Zm9udC1zaXplOjExcHg7dHJhbnNpdGlvbjp0cmFuc2Zvcm0gLjJzO2ZsZXgtc2hyaW5rOjA7fQouY2hldnJvbi5vcGVue3RyYW5zZm9ybTpyb3RhdGUoMTgwZGVnKTt9CgouY2FyZC1ib2R5e2Rpc3BsYXk6bm9uZTtwYWRkaW5nOjE0cHggMTVweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KLmNhcmQtYm9keS5vcGVue2Rpc3BsYXk6YmxvY2s7fQouY2ItZ3JpZHtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnI7Z2FwOjEycHg7bWFyZ2luLWJvdHRvbToxMnB4O30KQG1lZGlhKG1heC13aWR0aDo2MDBweCl7LmNiLWdyaWR7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcjt9fQouY2ItZmllbGQgbGFiZWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xMmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo1cHg7fQouY2ItZmllbGQgaW5wdXQsLmNiLWZpZWxkIHNlbGVjdCwuY2ItZmllbGQgdGV4dGFyZWF7d2lkdGg6MTAwJTtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzo4cHggMTBweDtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1pbmspO291dGxpbmU6bm9uZTtyZXNpemU6dmVydGljYWw7fQouY2ItZmllbGQgdGV4dGFyZWF7bWluLWhlaWdodDo2MHB4O2ZvbnQtc2l6ZToxMnB4O30KLmNiLWZpZWxkIGlucHV0OmZvY3VzLC5jYi1maWVsZCBzZWxlY3Q6Zm9jdXMsLmNiLWZpZWxkIHRleHRhcmVhOmZvY3Vze2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKTt9Ci5jYi1maWVsZCBzZWxlY3Qgb3B0aW9ue2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7fQoKLyogQ2hlY2tsaXN0ICovCi5jbC1oZWFkZXJ7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xNmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO21hcmdpbi1ib3R0b206OHB4O2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjthbGlnbi1pdGVtczpjZW50ZXI7fQouY2wtZ3JpZHtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnI7Z2FwOjNweDttYXJnaW4tYm90dG9tOjEycHg7fQpAbWVkaWEobWF4LXdpZHRoOjYwMHB4KXsuY2wtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyO319Ci5jbC1pdGVte2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjdweDtwYWRkaW5nOjZweCA5cHg7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wMTUpO2JvcmRlci1yYWRpdXM6NHB4O2N1cnNvcjpwb2ludGVyO3VzZXItc2VsZWN0Om5vbmU7fQouY2wtaXRlbTpob3ZlcntiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsLjA0KTt9Ci5jbC1pdGVtIGlucHV0W3R5cGU9Y2hlY2tib3hde3dpZHRoOjEzcHg7aGVpZ2h0OjEzcHg7YWNjZW50LWNvbG9yOnZhcigtLWdyZWVuKTtjdXJzb3I6cG9pbnRlcjtmbGV4LXNocmluazowO30KLmNsLWl0ZW0gbGFiZWx7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyO2ZsZXg6MTtsaW5lLWhlaWdodDoxLjM7fQouY2wtaXRlbS5jaGVja2VkIGxhYmVse2NvbG9yOnZhcigtLWdyZWVuKTt0ZXh0LWRlY29yYXRpb246bGluZS10aHJvdWdoO29wYWNpdHk6LjU1O30KLmNsLWNhdHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo3cHg7bGV0dGVyLXNwYWNpbmc6LjA1ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6MXB4IDVweDtib3JkZXItcmFkaXVzOjNweDtmbGV4LXNocmluazowO30KLmNhdC1hdWRpdHtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTIpO2NvbG9yOnZhcigtLWdvbGQpO30KLmNhdC1jb250ZW50e2JhY2tncm91bmQ6cmdiYSgxNjcsMTM5LDI1MCwuMTIpO2NvbG9yOnZhcigtLXB1cnBsZSk7fQouY2F0LXRlY2huaWNhbHtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMTIpO2NvbG9yOnZhcigtLWJsdWUpO30KLmNhdC1hdXRob3JpdHl7YmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjEyKTtjb2xvcjp2YXIoLS1ncmVlbik7fQoKLmNhcmQtYWN0aW9uc3tkaXNwbGF5OmZsZXg7Z2FwOjVweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLXRvcDoxMHB4O2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7fQoKLyogRW1wdHkgKi8KLmVtcHR5e3RleHQtYWxpZ246Y2VudGVyO3BhZGRpbmc6NTBweCAyMHB4O2NvbG9yOnZhcigtLWRpbSk7fQouZW1wdHkgaDN7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjI2cHg7bGV0dGVyLXNwYWNpbmc6LjA0ZW07bWFyZ2luLWJvdHRvbTo2cHg7Y29sb3I6dmFyKC0tc3ViKTt9CgoudG9hc3R7cG9zaXRpb246Zml4ZWQ7Ym90dG9tOjI4cHg7bGVmdDo1MCU7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgyMHB4KTtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7cGFkZGluZzo5cHggMjBweDtib3JkZXItcmFkaXVzOjUwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtmb250LXdlaWdodDo3MDA7b3BhY2l0eTowO3RyYW5zaXRpb246YWxsIC4zczt6LWluZGV4OjEwMDAwO3BvaW50ZXItZXZlbnRzOm5vbmU7fQoudG9hc3Quc2hvd3tvcGFjaXR5OjE7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgwKTt9CiNpbXBvcnRJbnB1dHtkaXNwbGF5Om5vbmU7fQoKLyog4pSA4pSAIE1PQklMRSBSRVNQT05TSVZFIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqLwpodG1sLGJvZHl7bWF4LXdpZHRoOjEwMCU7b3ZlcmZsb3cteDpoaWRkZW47fQppbWcsdGFibGUsaWZyYW1le21heC13aWR0aDoxMDAlO30KQG1lZGlhKG1heC13aWR0aDo3NjhweCl7CiAgLndyYXB7cGFkZGluZzowIDE0cHggNjBweCFpbXBvcnRhbnQ7fQogIC50b3BiYXJ7cGFkZGluZzoxMnB4IDA7Z2FwOjhweDt9CiAgLnRvcGJhci1yaWdodHtnYXA6NXB4O30KICAuYnRue2ZvbnQtc2l6ZTo4cHg7cGFkZGluZzo2cHggMTBweDt9CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpIWltcG9ydGFudDt9CiAgLmFkZC1yb3d7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAuYWRkLXJvdyBpbnB1dCwuYWRkLXJvdyBzZWxlY3R7d2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5maWx0ZXItYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NnB4O30KICAuZmlsdGVyLWJhciBzZWxlY3QsLmZpbHRlci1iYXIgaW5wdXR7d2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5jYXJkLWhlYWR7ZmxleC13cmFwOndyYXA7Z2FwOjZweDt9CiAgLnJlYy1oZWFke2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnByZWZpbGwtYm94e21heC13aWR0aDoxMDAlO3dpZHRoOjEwMCU7fQogIC5nMiwuZzMsLmc0LC5jYi1ncmlkLC5jYXJkLWdyaWR7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5wcm9qZWN0LWJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5wZnttaW4td2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5zdGVwc3tmbGV4LWRpcmVjdGlvbjpjb2x1bW4haW1wb3J0YW50O30KICAuc3RlcHtib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9CiAgLnN0ZXA6bGFzdC1jaGlsZHtib3JkZXItYm90dG9tOm5vbmU7fQogIC5ob3ctc3RlcHtmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5mbG93LXN0ZXB7Z2FwOjEwcHg7fQogIC5yZWMtZm9vdHtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweDt9CiAgLmFjdGlvbi1idG57d2lkdGg6MTAwJTtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2ZvbnQtc2l6ZToxNnB4IWltcG9ydGFudDt9CiAgLm1vZGVze2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIhaW1wb3J0YW50O30KICAubW9kZS1idG57Ym9yZGVyLXJpZ2h0Om5vbmUhaW1wb3J0YW50O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7fQp9CkBtZWRpYShtYXgtd2lkdGg6NDgwcHgpewogIC5vdmVydmlldywuc3VtbWFyeXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmciFpbXBvcnRhbnQ7fQogIC50b3BiYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7fQogIC50b3BiYXItcmlnaHR7ZmxleC13cmFwOndyYXA7fQogIC5jYXJkLW1ldGF7ZmxleC13cmFwOndyYXA7Z2FwOjRweDt9CiAgLmNhcmQtYWN0aW9ucywuY2FyZC1hY3Rpb25zIC5idG4sLmNhcmQtZm9vdHtmbGV4LXdyYXA6d3JhcDt9CiAgaDEsaDIsLnRvb2wtbmFtZXt3b3JkLWJyZWFrOmJyZWFrLXdvcmQ7fQogIC5wYW5lbHtwYWRkaW5nOjE2cHghaW1wb3J0YW50O30KICAuc2VjdGlvbntwYWRkaW5nOjE0cHggMTZweCFpbXBvcnRhbnQ7fQp9Cjwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CjxkaXYgY2xhc3M9IndyYXAiPgoKPGRpdiBjbGFzcz0idG9wYmFyIj4KICA8YSBocmVmPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlIiBjbGFzcz0iYnJhbmQiPkNvbnRlbnRTY2FsZTwvYT4KICA8ZGl2IGNsYXNzPSJ0b29sLXRpdGxlIj5TRU8gQVVESVQgV09SS0ZMT1cgTUFOQUdFUjwvZGl2PgogIDxkaXYgY2xhc3M9InRvcGJhci1yaWdodCI+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdvbGQiIG9uY2xpY2s9ImRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnc2NJbXBvcnRJbnB1dCcpLmNsaWNrKCkiPvCfk4ogSW1wb3J0IEdTQyBDU1YgKFBhZ2VzICsgUXVlcmllcyk8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHVycGxlIiBvbmNsaWNrPSJzY2FuQWxsU2NvcmVzKCkiPuKaoSBBdXRvLVNjb3JlIEFsbDwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1ncmVlbiIgb25jbGljaz0iZXhwb3J0Q1NWKCkiPuKGkyBFeHBvcnQgQ1NWPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXB1cnBsZSIgb25jbGljaz0ic3luY1RvU2VydmVyKCkiIGlkPSJzeW5jQnRuIiB0aXRsZT0iU2F2ZSB0byBzZXJ2ZXIg4oCUIGFjY2Vzc2libGUgZnJvbSBhbnkgZGV2aWNlIj7imIEgU2F2ZSB0byBTZXJ2ZXI8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQiIG9uY2xpY2s9ImxvYWRGcm9tU2VydmVyKCkiIHRpdGxlPSJMb2FkIGZyb20gc2VydmVyIj7ihpMgTG9hZCBmcm9tIFNlcnZlcjwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1ibHVlIiBvbmNsaWNrPSJkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW1wb3J0SW5wdXQnKS5jbGljaygpIj7ihpEgSW1wb3J0IFByb2dyZXNzPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXB1cnBsZSIgb25jbGljaz0iZXhwb3J0Q2xpZW50UmVwb3J0KCkiPvCfk4QgQ2xpZW50IFJlcG9ydDwvYnV0dG9uPgogICAgPGEgaHJlZj0iL2F1ZGl0LXJlY29tbWVuZGF0aW9ucyIgY2xhc3M9ImJ0biBidG4tZ29sZCI+8J+OryBSZWNvbW1lbmRhdGlvbnM8L2E+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXJlZCIgb25jbGljaz0iY2xlYXJBbGwoKSI+4pyVIENsZWFyPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIiBvbmNsaWNrPSJjbGVhbkJhZFBhZ2VzKCkiIHRpdGxlPSJSZW1vdmUgaW52YWxpZCBlbnRyaWVzIChxdWVyaWVzLCBrZXl3b3JkcykgZnJvbSB0aGUgbGlzdCI+8J+nuSBDbGVhbiB1cDwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0ibWVyZ2VEdXBsaWNhdGVQYWdlcygpIiB0aXRsZT0iTWVyZ2UgZHVwbGljYXRlIFVSTHMgaW50byBvbmUgZW50cnkiPvCflIAgTWVyZ2UgZHVwZXM8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcmVkIGJ0bi1zbSIgaWQ9ImJ1bGtEZWxldGVCdG4iIG9uY2xpY2s9ImJ1bGtEZWxldGVTZWxlY3RlZCgpIiBzdHlsZT0iZGlzcGxheTpub25lIj7wn5eRIERlbGV0ZSBzZWxlY3RlZCAoPHNwYW4gaWQ9ImJ1bGtDb3VudCI+MDwvc3Bhbj4pPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIGJ0bi1zbSIgaWQ9ImJ1bGtTZWxlY3RBbGxCdG4iIG9uY2xpY2s9ImJ1bGtTZWxlY3RBbGwoKSIgc3R5bGU9ImRpc3BsYXk6bm9uZSI+4pyTIFNlbGVjdCBhbGw8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQiIG9uY2xpY2s9InNlbGVjdEFsbFBhZ2VzKCkiIHRpdGxlPSJTZWxlY3QgYWxsIHZpc2libGUgcGFnZXMgZm9yIGJ1bGsgYWN0aW9ucyI+4piRIFNlbGVjdCBhbGw8L2J1dHRvbj4KICAgIDxpbnB1dCB0eXBlPSJmaWxlIiBpZD0iaW1wb3J0SW5wdXQiIGFjY2VwdD0iLmNzdiIgb25jaGFuZ2U9ImltcG9ydENTVih0aGlzKSI+CiAgICA8aW5wdXQgdHlwZT0iZmlsZSIgaWQ9ImdzY0ltcG9ydElucHV0IiBhY2NlcHQ9Ii5jc3YiIG11bHRpcGxlIG9uY2hhbmdlPSJpbXBvcnRHU0ModGhpcykiPgogIDwvZGl2Pgo8L2Rpdj4KCjxkaXYgaWQ9InN5bmNTdGF0dXMiIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tZGltKTt0ZXh0LWFsaWduOnJpZ2h0O21hcmdpbi1ib3R0b206NnB4OyI+PC9kaXY+CjxkaXYgY2xhc3M9InByb2plY3QtYmFyIj4KICA8ZGl2IGNsYXNzPSJwZiI+PGxhYmVsPkNsaWVudCAvIFByb2plY3Q8L2xhYmVsPjxpbnB1dCBpZD0icENsaWVudCIgcGxhY2Vob2xkZXI9IkNvbnRlbnRTY2FsZS5zaXRlIiBvbmlucHV0PSJzYXZlKCkiPjwvZGl2PgogIDxkaXYgY2xhc3M9InBmIiBzdHlsZT0iZmxleDoyIj48bGFiZWw+V2Vic2l0ZTwvbGFiZWw+PGlucHV0IGlkPSJwU2l0ZSIgcGxhY2Vob2xkZXI9Imh0dHBzOi8vY29udGVudHNjYWxlLnNpdGUiIG9uaW5wdXQ9InNhdmUoKSI+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGYiPjxsYWJlbD5EZWFkbGluZTwvbGFiZWw+PGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwRGVhZGxpbmUiIG9uaW5wdXQ9InNhdmUoKSI+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGYiPjxsYWJlbD5BdWRpdG9yPC9sYWJlbD48aW5wdXQgaWQ9InBBdWRpdG9yIiBwbGFjZWhvbGRlcj0iT3R0bWFyIiBvbmlucHV0PSJzYXZlKCkiPjwvZGl2Pgo8L2Rpdj4KCjxkaXYgY2xhc3M9Im92ZXJ2aWV3Ij4KICA8ZGl2IGNsYXNzPSJvdiI+PGRpdiBjbGFzcz0ib3YtbiIgaWQ9Im92VG90YWwiIHN0eWxlPSJjb2xvcjp2YXIoLS1ibHVlKSI+MDwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPlRvdGFsPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdk5vdFN0YXJ0ZWQiIHN0eWxlPSJjb2xvcjp2YXIoLS1kaW0pIj4wPC9kaXY+PGRpdiBjbGFzcz0ib3YtbCI+Tm90IFN0YXJ0ZWQ8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJvdiI+PGRpdiBjbGFzcz0ib3YtbiIgaWQ9Im92SW5Qcm9ncmVzcyIgc3R5bGU9ImNvbG9yOnZhcigtLWdvbGQpIj4wPC9kaXY+PGRpdiBjbGFzcz0ib3YtbCI+SW4gUHJvZ3Jlc3M8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJvdiI+PGRpdiBjbGFzcz0ib3YtbiIgaWQ9Im92RG9uZSIgc3R5bGU9ImNvbG9yOnZhcigtLWdyZWVuKSI+MDwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPkRvbmU8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJvdiI+PGRpdiBjbGFzcz0ib3YtbiIgaWQ9Im92Rm9sbG93dXAiIHN0eWxlPSJjb2xvcjp2YXIoLS1wdXJwbGUpIj4wPC9kaXY+PGRpdiBjbGFzcz0ib3YtbCI+Rm9sbG93LXVwPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdlBjdCIgc3R5bGU9ImNvbG9yOnZhcigtLWdvbGQpIj4wJTwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPkNvbXBsZXRlPC9kaXY+PGRpdiBjbGFzcz0icHJvZy13cmFwIj48ZGl2IGNsYXNzPSJwcm9nLWZpbGwiIGlkPSJvdkJhciIgc3R5bGU9IndpZHRoOjAlIj48L2Rpdj48L2Rpdj48L2Rpdj4KPC9kaXY+Cgo8ZGl2IGNsYXNzPSJhZGQtcGFuZWwiPgogIDxkaXYgY2xhc3M9ImFkZC1wYW5lbC10aXRsZSI+QWRkIFBhZ2VzIHRvIEF1ZGl0IFF1ZXVlPC9kaXY+CgogIDwhLS0gU2luZ2xlIFVSTCByb3cgLS0+CiAgPGRpdiBjbGFzcz0iYWRkLXJvdyI+CiAgICA8aW5wdXQgY2xhc3M9ImFpLXVybCIgaWQ9Im5ld1VybCIgcGxhY2Vob2xkZXI9Imh0dHBzOi8vc2l0ZS5jb20vcGFnZSIgb25rZXlkb3duPSJpZihldmVudC5rZXk9PT0nRW50ZXInKWFkZFBhZ2UoKSI+CiAgICA8aW5wdXQgY2xhc3M9ImFpLWt3IiBpZD0ibmV3S3ciIHBsYWNlaG9sZGVyPSJQcmltYXJ5IGtleXdvcmQiIG9ua2V5ZG93bj0iaWYoZXZlbnQua2V5PT09J0VudGVyJylhZGRQYWdlKCkiPgogICAgPHNlbGVjdCBpZD0ibmV3UHJpIj48b3B0aW9uIHZhbHVlPSJoaWdoIj7wn5S0IEhpZ2g8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJtZWQiIHNlbGVjdGVkPvCfn6EgTWVkaXVtPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibG93Ij7wn5+iIExvdzwvb3B0aW9uPjwvc2VsZWN0PgogICAgPGlucHV0IGNsYXNzPSJhaS1wb3MiIGlkPSJuZXdQb3MiIHR5cGU9Im51bWJlciIgcGxhY2Vob2xkZXI9IlBvc2l0aW9uIiBtaW49IjEiIG1heD0iMjAwIj4KICAgIDxpbnB1dCBjbGFzcz0iYWktaW1wciIgaWQ9Im5ld0ltcHIiIHR5cGU9Im51bWJlciIgcGxhY2Vob2xkZXI9IkltcHJlc3Npb25zIj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ29sZCIgb25jbGljaz0iYWRkUGFnZSgpIj4rIEFkZDwvYnV0dG9uPgogIDwvZGl2PgoKICA8IS0tIFNpdGVtYXAgZmV0Y2ggLS0+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4O3BhZGRpbmc6MTRweDtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMDUpO2JvcmRlcjoxcHggc29saWQgcmdiYSg5NiwxNjUsMjUwLC4yKTtib3JkZXItcmFkaXVzOjhweDsiPgogICAgPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xNGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1ibHVlKTttYXJnaW4tYm90dG9tOjhweDsiPvCfl7ogSW1wb3J0IFNpdGVtYXA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFkZC1yb3ciIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDsiPgogICAgICA8aW5wdXQgaWQ9InNpdGVtYXBVcmwiIHBsYWNlaG9sZGVyPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlL3NpdGVtYXAueG1sIiBzdHlsZT0iZmxleDoxO21pbi13aWR0aDoyMjBweDtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzo5cHggMTFweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLWluayk7b3V0bGluZTpub25lOyIgb25rZXlkb3duPSJpZihldmVudC5rZXk9PT0nRW50ZXInKWZldGNoU2l0ZW1hcCgpIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1ibHVlIiBvbmNsaWNrPSJmZXRjaFNpdGVtYXAoKSIgaWQ9InNpdGVtYXBCdG4iPuKGkyBGZXRjaCBTaXRlbWFwPC9idXR0b24+CiAgICA8L2Rpdj4KICAgIDxkaXYgaWQ9InNpdGVtYXBTdGF0dXMiIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjZweDsiPjwvZGl2PgoKICAgIDwhLS0gU2l0ZW1hcCBwcmV2aWV3ICsgZmlsdGVyIC0tPgogICAgPGRpdiBpZD0ic2l0ZW1hcFByZXZpZXciIHN0eWxlPSJkaXNwbGF5Om5vbmU7bWFyZ2luLXRvcDoxMnB4OyI+CiAgICAgIDxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDttYXJnaW4tYm90dG9tOjhweDtmbGV4LXdyYXA6d3JhcDsiPgogICAgICAgIDxpbnB1dCBpZD0ic2l0ZW1hcEZpbHRlciIgcGxhY2Vob2xkZXI9IkZpbHRlciBieSBwYXRoLi4uIGUuZy4gL2Jsb2cgb3IgL3NlcnZpY2VzIiBvbmlucHV0PSJmaWx0ZXJTaXRlbWFwVXJscygpIgogICAgICAgICAgc3R5bGU9ImZsZXg6MTttaW4td2lkdGg6MTYwcHg7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6N3B4IDEwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1pbmspO291dGxpbmU6bm9uZTsiPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ29sZCBidG4tc20iIG9uY2xpY2s9ImZpbHRlclNpdGVtYXBCeUdTQygpIiB0aXRsZT0iU2hvdyBvbmx5IHNpdGVtYXAgVVJMcyB0aGF0IGFyZSBhbHNvIGluIHlvdXIgR1NDIGRhdGEiPvCflJcgRmlsdGVyIGJ5IEdTQzwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQgYnRuLXNtIiBvbmNsaWNrPSJzZWxlY3RBbGxTaXRlbWFwKCkiPuKckyBBbGw8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIGJ0bi1zbSIgb25jbGljaz0iZGVzZWxlY3RBbGxTaXRlbWFwKCkiPuKclSBOb25lPC9idXR0b24+CiAgICAgICAgPHNwYW4gaWQ9InNpdGVtYXBTZWxDb3VudCIgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpOyI+PC9zcGFuPgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBpZD0ic2l0ZW1hcFVybExpc3QiIHN0eWxlPSJtYXgtaGVpZ2h0OjI4MHB4O292ZXJmbG93LXk6YXV0bztiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzo2cHg7Ij48L2Rpdj4KICAgICAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDo4cHg7bWFyZ2luLXRvcDoxMHB4O2ZsZXgtd3JhcDp3cmFwOyI+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1nb2xkIiBvbmNsaWNrPSJhZGRTZWxlY3RlZFNpdGVtYXBVcmxzKCkiPisgQWRkIHNlbGVjdGVkIHRvIHF1ZXVlPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZWQgYnRuLXNtIiBvbmNsaWNrPSJkZWxldGVTZWxlY3RlZFNpdGVtYXBVcmxzKCkiIHRpdGxlPSJSZW1vdmUgc2VsZWN0ZWQgVVJMcyBmcm9tIGxpc3QiPvCfl5EgRGVsZXRlIHNlbGVjdGVkPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCBidG4tc20iIG9uY2xpY2s9ImNsZWFyQWxsU2l0ZW1hcFVybHMoKSIgdGl0bGU9IlJlbW92ZSBhbGwgVVJMcyBmcm9tIGxpc3QiPuKclSBDbGVhciBhbGw8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIiBvbmNsaWNrPSJkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFByZXZpZXcnKS5zdHlsZS5kaXNwbGF5PSdub25lJyI+4pyVIENsb3NlPC9idXR0b24+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+CgogIDwhLS0gQnVsayBwYXN0ZSAtLT4KICA8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjEwcHg7Ij4KICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMTRlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjZweDsiPvCfk4sgQnVsayBQYXN0ZTwvZGl2PgogICAgPHRleHRhcmVhIGNsYXNzPSJidWxrLWFyZWEiIGlkPSJidWxrQXJlYSIgcGxhY2Vob2xkZXI9IlBhc3RlIG11bHRpcGxlIFVSTHMgKMOpw6luIHBlciBsaW5lKSDigJQgd2Vya3QgbWV0IHNpdGVtYXAgZXhwb3J0cywgR1NDIGxpanN0ZW4sIGV0Yy4iPjwvdGV4dGFyZWE+CiAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7Z2FwOjhweDttYXJnaW4tdG9wOjdweDthbGlnbi1pdGVtczpjZW50ZXI7Ij4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0iYnVsa0FkZCgpIj4rIEJ1bGsgQWRkPC9idXR0b24+CiAgICAgIDxzcGFuIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tZGltKTsiPk9uZSBVUkwgcGVyIGxpbmU8L3NwYW4+CiAgICA8L2Rpdj4KICA8L2Rpdj4KPC9kaXY+Cgo8ZGl2IGNsYXNzPSJmaWx0ZXItYmFyIj4KICA8c2VsZWN0IGlkPSJmU3RhdHVzIiBvbmNoYW5nZT0icmVuZGVyUGFnZXMoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCBzdGF0dXNlczwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0ibm90c3RhcnRlZCI+Tm90IFN0YXJ0ZWQ8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImlucHJvZ3Jlc3MiPkluIFByb2dyZXNzPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJkb25lIj5Eb25lPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJmb2xsb3d1cCI+Rm9sbG93LXVwPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJibG9ja2VkIj5CbG9ja2VkPC9vcHRpb24+CiAgPC9zZWxlY3Q+CiAgPHNlbGVjdCBpZD0iZlByaSIgb25jaGFuZ2U9InJlbmRlclBhZ2VzKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0iYWxsIj5BbGwgcHJpb3JpdGllczwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iaGlnaCI+8J+UtCBIaWdoPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJtZWQiPvCfn6EgTWVkaXVtPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJsb3ciPvCfn6IgTG93PC9vcHRpb24+CiAgPC9zZWxlY3Q+CiAgPHNlbGVjdCBpZD0iZlNvcnQiIG9uY2hhbmdlPSJyZW5kZXJQYWdlcygpIj4KICAgIDxvcHRpb24gdmFsdWU9InByaW9yaXR5Ij5Tb3J0OiBQcmlvcml0eTwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0icG9zaXRpb24iPlNvcnQ6IEdTQyBQb3NpdGlvbjwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iaW1wcmVzc2lvbnMiPlNvcnQ6IEltcHJlc3Npb25zPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJjaGVja2xpc3QiPlNvcnQ6IENoZWNrbGlzdCAlPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJzdGF0dXMiPlNvcnQ6IFN0YXR1czwvb3B0aW9uPgogIDwvc2VsZWN0PgogIDxpbnB1dCBpZD0iZlNlYXJjaCIgcGxhY2Vob2xkZXI9IlNlYXJjaCBVUkwgb3Iga2V5d29yZC4uLiIgb25pbnB1dD0icmVuZGVyUGFnZXMoKSIgc3R5bGU9ImZsZXg6MTttaW4td2lkdGg6MTUwcHg7Ij4KPC9kaXY+Cgo8ZGl2IGlkPSJidWxrQmFyIiBzdHlsZT0iZGlzcGxheTpub25lO2JhY2tncm91bmQ6cmdiYSgyMzksNjgsNjgsLjA4KTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjM5LDY4LDY4LC4yKTtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjhweCAxNHB4O21hcmdpbi1ib3R0b206OHB4O2Rpc3BsYXk6bm9uZTthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7Ij4KICA8c3BhbiBpZD0iYnVsa0NvdW50IiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1yZWQpO2ZvbnQtd2VpZ2h0OjcwMDsiPjAgc2VsZWN0ZWQ8L3NwYW4+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZWQgYnRuLXNtIiBvbmNsaWNrPSJkZWxldGVTZWxlY3RlZFBhZ2VzKCkiPvCfl5EgRGVsZXRlIHNlbGVjdGVkPC9idXR0b24+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCBidG4tc20iIG9uY2xpY2s9ImRlc2VsZWN0QWxsUGFnZXMoKSI+4pyVIERlc2VsZWN0IGFsbDwvYnV0dG9uPgo8L2Rpdj4KCjxkaXYgY2xhc3M9InBhZ2VzLWxpc3QiIGlkPSJwYWdlc0xpc3QiPjwvZGl2Pgo8L2Rpdj4KPGRpdiBjbGFzcz0idG9hc3QiIGlkPSJ0b2FzdCI+PC9kaXY+Cgo8c2NyaXB0Pgp2YXIgQVVESVRfVVJMID0gJ2h0dHBzOi8vYXBwLmNvbnRlbnRzY2FsZS5zaXRlL2F1ZGl0LXNlbyc7CnZhciBwYWdlcyA9IFtdOwp2YXIgcHJvamVjdCA9IHt9OwoKLy8gcG9pbnRzOiB0cnVlID0gYWRkcyBDb250ZW50U2NvcmUgcG9pbnRzLCBmYWxzZSA9IFVYL0NUUiBvbmx5IChubyBzY29yZSBjaGFuZ2UpCnZhciBDTCA9IFsKICAvLyDilIDilIAgUEhBU0UgMTogUHJlLWF1ZGl0IChnZWVuIHNjb3JlIGltcGFjdCkKICB7aWQ6J3NjYW5fYmVmb3JlJywgbGFiZWw6J+KRoCBTdGVwIDEg4oCUIFByZS1zY2FuIGRvbmUgKFNjYW4gU2NvcmUgcmVjb3JkZWQpJywgICAgY2F0OidwaGFzZTEnLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjEsIHRpcDonRklSU1Q6IENsaWNrIHRoZSDwn5OKIFNjYW4gU2NvcmUgYnV0dG9uIGJlbG93IOKAlCB0aGlzIHJlY29yZHMgeW91ciBzdGFydGluZyBzY29yZSBiZWZvcmUgYW55IGNoYW5nZXMnfSwKICB7aWQ6J3B1bHNlJywgICAgICAgbGFiZWw6J+KRoSBTdGVwIDIg4oCUIFBVTFNFK05FWFVTIGF1ZGl0IGRvbmUnLCAgICAgICAgICAgICAgICAgIGNhdDoncGhhc2UxJywgcG9pbnRzOmZhbHNlLCBwaGFzZToxLCB0aXA6J0NsaWNrIPCflKwgT3BlbiBpbiBQVUxTRStORVhVUyDihpIgcnVuIHRoZSBmdWxsIFNFTyBhdWRpdCDihpIgbm90ZSBhbGwgZmluZGluZ3MgYmVmb3JlIG1ha2luZyBjaGFuZ2VzJ30sCiAge2lkOidnc2NfY2hlY2snLCAgIGxhYmVsOifikaIgU3RlcCAzIOKAlCBHU0MgZGF0YSByZWNvcmRlZCcsICAgICAgICAgICAgICAgICAgICAgICAgY2F0OidwaGFzZTEnLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjEsIHRpcDonSW1wb3J0IHlvdXIgR29vZ2xlIFNlYXJjaCBDb25zb2xlIENTViB2aWEgdGhlIPCfk4ogSW1wb3J0IEdTQyBDU1YgYnV0dG9uIGF0IHRoZSB0b3Agb2YgdGhlIHBhZ2UnfSwKCiAgLy8g4pSA4pSAIFBIQVNFIDI6IEltcGxlbWVudGF0aWUg4oCUIFBVTlRFTiAoc2NvcmUgZ2FhdCBvbWhvb2cpCiAge2lkOid3b3JkY291bnQnLCAgIGxhYmVsOifikaEgV29yZHMgYWRkZWQgKG1pbiAxNTAwKScsICAgICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J3N0YXRzJywgICAgICAgbGFiZWw6J+KRoSBTdGF0cyBhZGRlZCAoMjAyNS0yMDI2LCA4KyknLCAgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidleHBlcnQnLCAgICAgIGxhYmVsOifikaEgRXhwZXJ0IHF1b3RlcyBhZGRlZCAoMy01KScsICAgICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonZmFxJywgICAgICAgICBsYWJlbDon4pGhIEZBUSBzZWN0aW9uIGFkZGVkL2V4cGFuZGVkJywgICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonY2FzZXN0dWR5JywgICBsYWJlbDon4pGhIENhc2Ugc3R1ZHkgd2l0aCBtZXRyaWNzIGFkZGVkJywgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidkaXJlY3RfYW5zJywgIGxhYmVsOifikaEgRGlyZWN0IEFuc3dlciAoNDAtODB3KSBhZnRlciBIMSBhZGRlZCcsICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOid0bGRyJywgICAgICAgIGxhYmVsOifikaEgS2V5IFRha2Vhd2F5cyAvIFRMO0RSIGFkZGVkJywgICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonbGlzdGNvdW50JywgICBsYWJlbDon4pGhIEJ1bGxldC9udW1iZXJlZCBsaXN0cyBleHBhbmRlZCAoMTUrKScsY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonYXV0aG9yYmlvJywgICBsYWJlbDon4pGhIEF1dGhvciBiaW8gd2l0aCBjcmVkZW50aWFscyBhZGRlZCcsICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidzY2hlbWFfYScsICAgIGxhYmVsOifikaEgQXJ0aWNsZSBzY2hlbWEgSlNPTi1MRCBhZGRlZCcsICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonc2NoZW1hX2YnLCAgICBsYWJlbDon4pGhIEZBUVBhZ2Ugc2NoZW1hIEpTT04tTEQgYWRkZWQnLCAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2ludGxpbmtzJywgICAgbGFiZWw6J+KRoSBJbnRlcm5hbCBsaW5rcyBhZGRlZCAoMy01KScsICAgICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2V4dGxpbmtzJywgICAgbGFiZWw6J+KRoSBFeHRlcm5lIGxpbmtzIGF1dG9yaXRhdGllZiAoMi0zKScsICAgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidlZWF0JywgICAgICAgIGxhYmVsOifikaEgRS1FLUEtVCBzaWduYWxzIHN0cmVuZ3RoZW5lZCcsICAgICAgICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKCiAgLy8g4pSA4pSAIFBIQVNFIDI6IFVYL0NUUiBmaXhlcyDigJQgTk8gc2NvcmUgcG9pbnRzLCBidXQgaW1wb3J0YW50CiAge2lkOidoMScsICAgICAgICAgIGxhYmVsOifikaEgSDEgb3B0aW1pc2VkJywgICAgICAgICAgICAgICAgICAgICAgICBjYXQ6J3BoYXNlMl9jdHInLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjJ9LAogIHtpZDonaDInLCAgICAgICAgICBsYWJlbDon4pGhIEgyIHN0cnVjdHVyZSByZXZpc2VkJywgICAgICAgICAgICAgICAgICAgICAgY2F0OidwaGFzZTJfY3RyJywgcG9pbnRzOmZhbHNlLCBwaGFzZToyfSwKICB7aWQ6J3RpdGxlJywgICAgICAgbGFiZWw6J+KRoSBTRU8gdGl0bGUgaGVyc2NocmV2ZW4gKDUwLTYwIGNoYXJzKScsICAgICAgIGNhdDoncGhhc2UyX2N0cicsIHBvaW50czpmYWxzZSwgcGhhc2U6Mn0sCiAge2lkOidtZXRhJywgICAgICAgIGxhYmVsOifikaEgTWV0YSBkZXNjcmlwdGlvbiBoZXJzY2hyZXZlbiAoMTUwLTE2MCknLCAgICBjYXQ6J3BoYXNlMl9jdHInLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjJ9LAogIHtpZDonY2Fub25pY2FsJywgICBsYWJlbDon4pGhIENhbm9uaWNhbCB0YWcgY2hlY2tlZCcsICAgICAgICAgICAgICAgY2F0OidwaGFzZTJfY3RyJywgcG9pbnRzOmZhbHNlLCBwaGFzZToyfSwKICB7aWQ6J2FsdCcsICAgICAgICAgbGFiZWw6J+KRoSBJbWFnZSBhbHQgdGV4dCBjb21wbGV0ZScsICAgICAgICAgICAgIGNhdDoncGhhc2UyX2N0cicsIHBvaW50czpmYWxzZSwgcGhhc2U6Mn0sCiAge2lkOidjdGEnLCAgICAgICAgIGxhYmVsOifikaEgQ1RBIG9wdGltaXNlZCBmb3IgY29udmVyc2lvbiBnb2FsJywgICAgY2F0OidwaGFzZTJfY3RyJywgcG9pbnRzOmZhbHNlLCBwaGFzZToyfSwKCiAgLy8g4pSA4pSAIFBIQVNFIDM6IExpdmUgemV0dGVuICsgbmFzY2FuCiAge2lkOidwdWJsaXNoJywgICAgIGxhYmVsOifikaIgUGFnZSBwdWJsaXNoZWQgKyB0aW1lc3RhbXAgcmVmcmVzaGVkJywgY2F0OidwaGFzZTMnLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjN9LAogIHtpZDoncmVpbmRleCcsICAgICBsYWJlbDon4pGiIEdTQyByZWluZGV4IHJlcXVlc3RlZCcsICAgICAgICAgICAgICAgICAgIGNhdDoncGhhc2UzJywgcG9pbnRzOmZhbHNlLCBwaGFzZTozfSwKICB7aWQ6J3NjYW5fYWZ0ZXInLCAgbGFiZWw6J+KRoiBQb3N0LXNjYW4gZG9uZSAoZmluYWwgc2NvcmUgcmVjb3JkZWQpJywgICAgICBjYXQ6J3BoYXNlMycsIHBvaW50czpmYWxzZSwgcGhhc2U6M30sCiAge2lkOidyZWNoZWNrJywgICAgIGxhYmVsOifikaIgR1NDIHJlY2hlY2sgc2NoZWR1bGVkICgxNCBkYXlzKScsICAgICAgICAgIGNhdDoncGhhc2UzJywgcG9pbnRzOmZhbHNlLCBwaGFzZTozfSwKXTsKCnZhciBTVEFUVVNfT1JERVIgPSBbJ25vdHN0YXJ0ZWQnLCdpbnByb2dyZXNzJywnZm9sbG93dXAnLCdibG9ja2VkJywnZG9uZSddOwp2YXIgU1RBVFVTX0xBQkVMUyA9IHtub3RzdGFydGVkOidOb3QgU3RhcnRlZCcsaW5wcm9ncmVzczonSW4gUHJvZ3Jlc3MnLGRvbmU6J0RvbmUnLGZvbGxvd3VwOidGb2xsb3ctdXAnLGJsb2NrZWQ6J0Jsb2NrZWQnfTsKdmFyIFBSSV9PUkRFUiA9IHtoaWdoOjAsbWVkOjEsbG93OjJ9OwoKZnVuY3Rpb24gdWlkKCl7IHJldHVybiBEYXRlLm5vdygpLnRvU3RyaW5nKDM2KStNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLDUpOyB9CgpmdW5jdGlvbiB0b2FzdChtc2csZHVyKXsKICB2YXIgdD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9hc3QnKTsKICB0LnRleHRDb250ZW50PW1zZzt0LmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTsKICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dC5jbGFzc0xpc3QucmVtb3ZlKCdzaG93Jyk7fSxkdXJ8fDI1MDApOwp9CgpmdW5jdGlvbiBzYXZlKCl7CiAgcHJvamVjdC5jbGllbnQgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQ2xpZW50JykudmFsdWU7CiAgcHJvamVjdC5zaXRlICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwU2l0ZScpLnZhbHVlOwogIHByb2plY3QuZGVhZGxpbmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncERlYWRsaW5lJykudmFsdWU7CiAgcHJvamVjdC5hdWRpdG9yICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQXVkaXRvcicpLnZhbHVlOwogIHRyeXtsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3Nfd2ZfcHJvaicsSlNPTi5zdHJpbmdpZnkocHJvamVjdCkpO31jYXRjaChlKXt9CiAgdHJ5e2xvY2FsU3RvcmFnZS5zZXRJdGVtKCdjc193Zl9wYWdlcycsSlNPTi5zdHJpbmdpZnkocGFnZXMpKTt9Y2F0Y2goZSl7fQogIC8vIEFsd2F5cyBrZWVwIHNoYXJlZCBHU0MgaW4gc3luYyBmb3IgUFVMU0UrTkVYVVMKICB0cnl7CiAgICB2YXIgc2hhcmVkR3NjID0gewogICAgICBwYWdlczogcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApeyByZXR1cm4gcC51cmwgJiYgcC51cmwuc3RhcnRzV2l0aCgnaHR0cCcpOyB9KQogICAgICAgICAgICAgICAgICAubWFwKGZ1bmN0aW9uKHApeyByZXR1cm4ge3BhZ2U6cC51cmwsIGltcHJlc3Npb25zOnAuaW1wcmVzc2lvbnN8fDAsIGNsaWNrczowLCBjdHI6cC5jdHJ8fDAsIHBvc2l0aW9uOnAucG9zaXRpb258fDAsIHNjb3JlOnAuc2NvcmVCZWZvcmV8fDB9OyB9KSwKICAgICAgcXVlcmllczogW10KICAgIH07CiAgICBpZih0eXBlb2YgX2dzY1F1ZXJ5TWFwICE9PSAndW5kZWZpbmVkJyl7CiAgICAgIHNoYXJlZEdzYy5xdWVyaWVzID0gT2JqZWN0LmtleXMoX2dzY1F1ZXJ5TWFwKS5tYXAoZnVuY3Rpb24ocSl7IHJldHVybiB7cXVlcnk6cSwgcG9zaXRpb246X2dzY1F1ZXJ5TWFwW3FdfTsgfSk7CiAgICB9CiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3Nfc2hhcmVkX2dzYycsIEpTT04uc3RyaW5naWZ5KHNoYXJlZEdzYykpOwogIH1jYXRjaChlKXt9Cn0KCmZ1bmN0aW9uIGxvYWQoKXsKICB0cnl7dmFyIHA9bG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NzX3dmX3Byb2onKTtpZihwKXByb2plY3Q9SlNPTi5wYXJzZShwKTt9Y2F0Y2goZSl7fQogIHRyeXt2YXIgcGc9bG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NzX3dmX3BhZ2VzJyk7aWYocGcpcGFnZXM9SlNPTi5wYXJzZShwZyk7fWNhdGNoKGUpe30KICBpZihwcm9qZWN0LmNsaWVudCkgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQ2xpZW50JykudmFsdWU9cHJvamVjdC5jbGllbnQ7CiAgaWYocHJvamVjdC5zaXRlKSAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncFNpdGUnKS52YWx1ZT1wcm9qZWN0LnNpdGU7CiAgaWYocHJvamVjdC5kZWFkbGluZSlkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncERlYWRsaW5lJykudmFsdWU9cHJvamVjdC5kZWFkbGluZTsKICBpZihwcm9qZWN0LmF1ZGl0b3IpIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQXVkaXRvcicpLnZhbHVlPXByb2plY3QuYXVkaXRvcjsKfQoKZnVuY3Rpb24gbWFrZVBhZ2UodXJsLGt3LHByaSxwb3MsaW1wcil7CiAgdmFyIGNoZWNrcz17fTsKICBDTC5mb3JFYWNoKGZ1bmN0aW9uKGMpe2NoZWNrc1tjLmlkXT1mYWxzZTt9KTsKICByZXR1cm4ge2lkOnVpZCgpLHVybDp1cmwsa2V5d29yZDprd3x8JycscHJpb3JpdHk6cHJpfHwnbWVkJywKICAgIHBvc2l0aW9uOnBhcnNlRmxvYXQocG9zKXx8MCxpbXByZXNzaW9uczpwYXJzZUludChpbXByKXx8MCwKICAgIHN0YXR1czonbm90c3RhcnRlZCcsc2NvcmVCZWZvcmU6Jycsc2NvcmVBZnRlcjonJyxub3RlczonJyxkZWFkbGluZTonJywKICAgIGNoZWNrczpjaGVja3MsY3JlYXRlZDpuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksdXBkYXRlZDpuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9Owp9CgpmdW5jdGlvbiB1cGRhdGVCdWxrQ291bnQoKXsKICB2YXIgY2hlY2tlZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wYWdlLWJ1bGstY2I6Y2hlY2tlZCcpOwogIHZhciBiYXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVsa0JhcicpOwogIGlmICghYmFyKSByZXR1cm47CiAgaWYoY2hlY2tlZC5sZW5ndGggPiAwKXsKICAgIGJhci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1bGtDb3VudCcpLnRleHRDb250ZW50ID0gY2hlY2tlZC5sZW5ndGggKyAnIHNlbGVjdGVkJzsKICB9IGVsc2UgewogICAgYmFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7CiAgfQp9CgpmdW5jdGlvbiBzZWxlY3RBbGxQYWdlcygpewogIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wYWdlLWJ1bGstY2InKS5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsgY2IuY2hlY2tlZCA9IHRydWU7IH0pOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwp9CgpmdW5jdGlvbiBkZXNlbGVjdEFsbFBhZ2VzKCl7CiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYicpLmZvckVhY2goZnVuY3Rpb24oY2IpeyBjYi5jaGVja2VkID0gZmFsc2U7IH0pOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwp9CgpmdW5jdGlvbiBkZWxldGVTZWxlY3RlZFBhZ2VzKCl7CiAgdmFyIGlkcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYjpjaGVja2VkJykpLm1hcChmdW5jdGlvbihjYil7IHJldHVybiBjYi5kYXRhc2V0LmlkOyB9KTsKICBpZighaWRzLmxlbmd0aCl7IHRvYXN0KCdObyBwYWdlcyBzZWxlY3RlZCcpOyByZXR1cm47IH0KICBpZighY29uZmlybSgnRGVsZXRlICcgKyBpZHMubGVuZ3RoICsgJyBzZWxlY3RlZCBwYWdlcz8nKSkgcmV0dXJuOwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApeyByZXR1cm4gIWlkcy5pbmNsdWRlcyhwLmlkKTsgfSk7CiAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWxrQmFyJykuc3R5bGUuZGlzcGxheSA9ICdub25lJzsKICB0b2FzdCgn8J+XkSAnICsgaWRzLmxlbmd0aCArICcgcGFnZXMgZGVsZXRlZCcpOwp9CgoKCmZ1bmN0aW9uIGJ1bGtTZWxlY3RBbGwoKXsKICB2YXIgY2JzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYicpOwogIHZhciBhbGxDaGVja2VkID0gQXJyYXkuZnJvbShjYnMpLmV2ZXJ5KGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmNoZWNrZWQ7IH0pOwogIGNicy5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsgY2IuY2hlY2tlZCA9ICFhbGxDaGVja2VkOyB9KTsKICB1cGRhdGVCdWxrQ291bnQoKTsKfQoKZnVuY3Rpb24gYnVsa0RlbGV0ZVNlbGVjdGVkKCl7CiAgdmFyIHNlbGVjdGVkID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucGFnZS1idWxrLWNiOmNoZWNrZWQnKSkubWFwKGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmRhdGFzZXQuaWQ7IH0pOwogIGlmKCFzZWxlY3RlZC5sZW5ndGgpeyB0b2FzdCgn4pqgIE5vIHBhZ2VzIHNlbGVjdGVkJyk7IHJldHVybjsgfQogIGlmKCFjb25maXJtKCdEZWxldGUgJyArIHNlbGVjdGVkLmxlbmd0aCArICcgc2VsZWN0ZWQgcGFnZXMgZnJvbSB0aGUgcXVldWU/JykpIHJldHVybjsKICBwYWdlcyA9IHBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXsgcmV0dXJuICFzZWxlY3RlZC5pbmNsdWRlcyhwLmlkKTsgfSk7CiAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwogIHRvYXN0KCfwn5eRICcgKyBzZWxlY3RlZC5sZW5ndGggKyAnIHBhZ2VzIGRlbGV0ZWQnKTsKfQoKZnVuY3Rpb24gY2xlYW5CYWRQYWdlcygpewogIHZhciBiZWZvcmUgPSBwYWdlcy5sZW5ndGg7CiAgLy8gUmVtb3ZlIGludmFsaWQgVVJMcwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApewogICAgaWYoIXAudXJsKSByZXR1cm4gZmFsc2U7CiAgICBpZighcC51cmwuc3RhcnRzV2l0aCgnaHR0cCcpICYmICFwLnVybC5zdGFydHNXaXRoKCcvJykpIHJldHVybiBmYWxzZTsKICAgIGlmKHAudXJsLmluY2x1ZGVzKCctc2l0ZTonKSB8fCBwLnVybC5pbmNsdWRlcygnICcpKSByZXR1cm4gZmFsc2U7CiAgICByZXR1cm4gdHJ1ZTsKICB9KTsKICAvLyBSZW1vdmUgZHVwbGljYXRlcyDigJQga2VlcCBmaXJzdCBvY2N1cnJlbmNlIHBlciBVUkwKICB2YXIgc2VlbiA9IHt9OwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApewogICAgaWYoc2VlbltwLnVybF0pIHJldHVybiBmYWxzZTsKICAgIHNlZW5bcC51cmxdID0gdHJ1ZTsKICAgIHJldHVybiB0cnVlOwogIH0pOwogIHZhciByZW1vdmVkID0gYmVmb3JlIC0gcGFnZXMubGVuZ3RoOwogIGlmKHJlbW92ZWQgPiAwKXsKICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgIHRvYXN0KCfwn6e5IFJlbW92ZWQgJyArIHJlbW92ZWQgKyAnIGludmFsaWQvZHVwbGljYXRlIGVudHJpZXMnKTsKICB9IGVsc2UgewogICAgdG9hc3QoJ+KckyBObyBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBlbnRyaWVzIGZvdW5kJyk7CiAgfQp9CgpmdW5jdGlvbiBhZGRQYWdlKCl7CiAgdmFyIHVybD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3VXJsJykudmFsdWUudHJpbSgpOwogIGlmKCF1cmwpe3RvYXN0KCfimqAgRW50ZXIgYSBVUkwnKTtyZXR1cm47fQogIGlmKCF1cmwuc3RhcnRzV2l0aCgnaHR0cCcpKXVybD0naHR0cHM6Ly8nK3VybDsKICBwYWdlcy5wdXNoKG1ha2VQYWdlKHVybCwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdLdycpLnZhbHVlLnRyaW0oKSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdQcmknKS52YWx1ZSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdQb3MnKS52YWx1ZSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdJbXByJykudmFsdWUpKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3VXJsJykudmFsdWU9Jyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ld0t3JykudmFsdWU9Jyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ld1BvcycpLnZhbHVlPScnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdJbXByJykudmFsdWU9Jyc7CiAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgn4pyFIFBhZ2UgYWRkZWQnKTsKfQoKZnVuY3Rpb24gYnVsa0FkZCgpewogIHZhciByYXc9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1bGtBcmVhJykudmFsdWUudHJpbSgpOwogIGlmKCFyYXcpe3RvYXN0KCfimqAgUGFzdGUgVVJMcyBmaXJzdCcpO3JldHVybjt9CiAgdmFyIGxpbmVzPXJhdy5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGwpe3JldHVybiBsLnRyaW0oKTt9KS5maWx0ZXIoZnVuY3Rpb24obCl7cmV0dXJuIGwuaW5jbHVkZXMoJy4nKTt9KTsKICB2YXIgYWRkZWQ9MDsKICBsaW5lcy5mb3JFYWNoKGZ1bmN0aW9uKGwpewogICAgdmFyIHVybD1sLnN0YXJ0c1dpdGgoJ2h0dHAnKT9sOidodHRwczovLycrbDsKICAgIHBhZ2VzLnB1c2gobWFrZVBhZ2UodXJsLCcnLCdtZWQnLDAsMCkpO2FkZGVkKys7CiAgfSk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1bGtBcmVhJykudmFsdWU9Jyc7CiAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgn4pyFICcrYWRkZWQrJyBwYWdlcyBhZGRlZCcpOwp9CgpmdW5jdGlvbiBkZWxldGVQYWdlKGlkKXsKICBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgcGFnZT8nKSlyZXR1cm47CiAgcGFnZXM9cGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApe3JldHVybiBwLmlkIT09aWQ7fSk7CiAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgnRGVsZXRlZCcpOwp9CgpmdW5jdGlvbiBjbGVhckFsbCgpewogIGlmKCFjb25maXJtKCdDbGVhciBBTEwgcGFnZXM/IENhbm5vdCBiZSB1bmRvbmUuJykpcmV0dXJuOwogIHBhZ2VzPVtdO3NhdmUoKTtyZW5kZXJQYWdlcygpO3JlbmRlck92ZXJ2aWV3KCk7Cn0KCmZ1bmN0aW9uIGN5Y2xlU3RhdHVzKGlkKXsKICB2YXIgcD1wYWdlcy5maW5kKGZ1bmN0aW9uKHApe3JldHVybiBwLmlkPT09aWQ7fSk7aWYoIXApcmV0dXJuOwogIHZhciBpPVNUQVRVU19PUkRFUi5pbmRleE9mKHAuc3RhdHVzKTsKICBwLnN0YXR1cz1TVEFUVVNfT1JERVJbKGkrMSklU1RBVFVTX09SREVSLmxlbmd0aF07CiAgcC51cGRhdGVkPW5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTsKICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpOwp9CgpmdW5jdGlvbiB1cGRhdGVGaWVsZChpZCxmaWVsZCx2YWwpewogIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7cmV0dXJuIHAuaWQ9PT1pZDt9KTtpZighcClyZXR1cm47CiAgcFtmaWVsZF09dmFsO3AudXBkYXRlZD1uZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7c2F2ZSgpOwogIGlmKGZpZWxkPT09J3N0YXR1cycpe3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt9Cn0KCmZ1bmN0aW9uIHRvZ2dsZUNoZWNrKHBhZ2VJZCxjaGVja0lkKXsKICB2YXIgcD1wYWdlcy5maW5kKGZ1bmN0aW9uKHApe3JldHVybiBwLmlkPT09cGFnZUlkO30pO2lmKCFwKXJldHVybjsKICBwLmNoZWNrc1tjaGVja0lkXT0hcC5jaGVja3NbY2hlY2tJZF07CiAgcC51cGRhdGVkPW5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTsKICBzYXZlKCk7CiAgLy8gVXBkYXRlIGNoZWNrbGlzdCBwcm9ncmVzcyBkaXNwbGF5CiAgdmFyIGRvbmU9T2JqZWN0LnZhbHVlcyhwLmNoZWNrcykuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDsKICB2YXIgdG90YWw9Q0wubGVuZ3RoOwogIHZhciBwY3Q9TWF0aC5yb3VuZChkb25lL3RvdGFsKjEwMCk7CiAgdmFyIGVsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbC1wcm9nLScrcGFnZUlkKTsKICBpZihlbCl7CiAgICB2YXIgcHRzPXBvaW50c0RvbmUocCk7CiAgICBlbC5pbm5lckhUTUw9JzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPitzY29yZTogJytwdHMrJy8nK3BvaW50c1RvdGFsKCkrJzwvc3Bhbj4nCiAgICAgICsnIDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLWxlZnQ6OHB4OyI+dG90YWFsOiAnK2RvbmUrJy8nK3RvdGFsKyc8L3NwYW4+JzsKICB9CiAgdmFyIGNoa0VsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjaGstJytwYWdlSWQpOwogIGlmKGNoa0VsKWNoa0VsLnRleHRDb250ZW50PXBjdCsnJSc7CiAgLy8gVXBkYXRlIGNsYXNzIG9uIGl0ZW0KICB2YXIgaXRlbT1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xpLScrcGFnZUlkKyctJytjaGVja0lkKTsKICBpZihpdGVtKWl0ZW0uY2xhc3NOYW1lPSdjbC1pdGVtJysocC5jaGVja3NbY2hlY2tJZF0/JyBjaGVja2VkJzonJyk7CiAgcmVuZGVyT3ZlcnZpZXcoKTsKfQoKZnVuY3Rpb24gb3BlbkluQXVkaXQoaWQpewogIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocGcpe3JldHVybiBwZy5pZD09PWlkO30pO2lmKCFwKXJldHVybjsKICB2YXIgcGFyYW1zPSc/dXJsPScrZW5jb2RlVVJJQ29tcG9uZW50KHAudXJsKQogICAgKyhwLmtleXdvcmQ/JyZrdz0nK2VuY29kZVVSSUNvbXBvbmVudChwLmtleXdvcmQpOicnKQogICAgKyhwLnBvc2l0aW9uPycmcG9zPScrcC5wb3NpdGlvbjonJykKICAgICsocC5pbXByZXNzaW9ucz8nJmltcHI9JytwLmltcHJlc3Npb25zOicnKQogICAgKyhwLmN0cj8nJmN0cj0nK3AuY3RyOicnKQogICAgKyhwLnNjb3JlQmVmb3JlPycmc2NvcmU9JytwLnNjb3JlQmVmb3JlOicnKQogICAgKycmd2Y9JytpZDsgLy8gd29ya2Zsb3cgSUQgZm9yIGNhbGxiYWNrCiAgd2luZG93Lm9wZW4oQVVESVRfVVJMK3BhcmFtcywnX2JsYW5rJyk7CiAgLy8gQXV0by1zZXQgdG8gaW5wcm9ncmVzcwogIGlmKHAuc3RhdHVzPT09J25vdHN0YXJ0ZWQnKXsKICAgIHAuc3RhdHVzPSdpbnByb2dyZXNzJztwLnVwZGF0ZWQ9bmV3IERhdGUoKS50b0lTT1N0cmluZygpOwogICAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgn8J+UrCBPcGVuZWQgaW4gUFVMU0UrTkVYVVMg4oCUIHN0YXR1cyDihpIgSW4gUHJvZ3Jlc3MnKTsKICB9Cn0KCmZ1bmN0aW9uIG1hcmtEb25lKGlkKXsKICB2YXIgcD1wYWdlcy5maW5kKGZ1bmN0aW9uKHBnKXtyZXR1cm4gcGcuaWQ9PT1pZDt9KTtpZighcClyZXR1cm47CiAgcC5zdGF0dXM9J2RvbmUnO3AudXBkYXRlZD1uZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CiAgLy8gQXV0by1jaGVjayBwdWxzZQogIHAuY2hlY2tzWydwdWxzZSddPXRydWU7CiAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgn4pyFIE1hcmtlZCBhcyBEb25lJyk7Cn0KCmZ1bmN0aW9uIGNoZWNrUHJvZ3Jlc3MocCl7CiAgdmFyIGRvbmU9T2JqZWN0LnZhbHVlcyhwLmNoZWNrcykuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDsKICByZXR1cm4ge2RvbmU6ZG9uZSx0b3RhbDpDTC5sZW5ndGgscGN0Ok1hdGgucm91bmQoZG9uZS9DTC5sZW5ndGgqMTAwKX07Cn0KCi8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgImFmdGVyIHNjb3JlIiBmaWVsZCBzaG91bGQgYmUgbG9ja2VkCi8vIExvY2tlZCB1bnRpbCBhdCBsZWFzdCAzIHBvaW50cy1naXZpbmcgaXRlbXMgYXJlIGNoZWNrZWQKZnVuY3Rpb24gc2NvcmVBZnRlckxvY2tlZChwKXsKICB2YXIgcG9pbnRzRG9uZSA9IENMLmZpbHRlcihmdW5jdGlvbihjKXsgcmV0dXJuIGMucG9pbnRzICYmIHAuY2hlY2tzW2MuaWRdOyB9KS5sZW5ndGg7CiAgcmV0dXJuIHBvaW50c0RvbmUgPCAzOwp9CgovLyBDb3VudCBwb2ludHMgaXRlbXMgZG9uZQpmdW5jdGlvbiBwb2ludHNEb25lKHApewogIHJldHVybiBDTC5maWx0ZXIoZnVuY3Rpb24oYyl7IHJldHVybiBjLnBvaW50cyAmJiBwLmNoZWNrc1tjLmlkXTsgfSkubGVuZ3RoOwp9CmZ1bmN0aW9uIHBvaW50c1RvdGFsKCl7CiAgcmV0dXJuIENMLmZpbHRlcihmdW5jdGlvbihjKXsgcmV0dXJuIGMucG9pbnRzOyB9KS5sZW5ndGg7Cn0KCmZ1bmN0aW9uIHJlbmRlck92ZXJ2aWV3KCl7CiAgdmFyIHRvdGFsPXBhZ2VzLmxlbmd0aDsKICB2YXIgZG9uZT1wYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7cmV0dXJuIHAuc3RhdHVzPT09J2RvbmUnO30pLmxlbmd0aDsKICB2YXIgaW5wPXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0naW5wcm9ncmVzcyc7fSkubGVuZ3RoOwogIHZhciBucz1wYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7cmV0dXJuIHAuc3RhdHVzPT09J25vdHN0YXJ0ZWQnO30pLmxlbmd0aDsKICB2YXIgZnU9cGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApe3JldHVybiBwLnN0YXR1cz09PSdmb2xsb3d1cCc7fSkubGVuZ3RoOwogIHZhciBwY3Q9dG90YWw/TWF0aC5yb3VuZChkb25lL3RvdGFsKjEwMCk6MDsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZUb3RhbCcpLnRleHRDb250ZW50PXRvdGFsOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdkRvbmUnKS50ZXh0Q29udGVudD1kb25lOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdkluUHJvZ3Jlc3MnKS50ZXh0Q29udGVudD1pbnA7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292Tm90U3RhcnRlZCcpLnRleHRDb250ZW50PW5zOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdkZvbGxvd3VwJykudGV4dENvbnRlbnQ9ZnU7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292UGN0JykudGV4dENvbnRlbnQ9cGN0KyclJzsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZCYXInKS5zdHlsZS53aWR0aD1wY3QrJyUnOwp9CgpmdW5jdGlvbiBnZXRTb3J0ZWQoKXsKICB2YXIgc29ydD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlNvcnQnKS52YWx1ZTsKICB2YXIgYXJyPXBhZ2VzLnNsaWNlKCk7CiAgaWYoc29ydD09PSdwcmlvcml0eScpYXJyLnNvcnQoZnVuY3Rpb24oYSxiKXtyZXR1cm4gUFJJX09SREVSW2EucHJpb3JpdHldLVBSSV9PUkRFUltiLnByaW9yaXR5XTt9KTsKICBlbHNlIGlmKHNvcnQ9PT0ncG9zaXRpb24nKWFyci5zb3J0KGZ1bmN0aW9uKGEsYil7CiAgICB2YXIgYXA9YS5wb3NpdGlvbnx8OTk5LGJwPWIucG9zaXRpb258fDk5OTsKICAgIC8vIFBvc2l0aW9uIDExLTMwID0gbW9zdCB2YWx1YWJsZSAoY2xvc2VzdCB0byBwYWdlIDEpCiAgICB2YXIgYXM9YXA+PTExJiZhcDw9MzA/MDphcD4zMD8xOjI7CiAgICB2YXIgYnM9YnA+PTExJiZicDw9MzA/MDpicD4zMD8xOjI7CiAgICByZXR1cm4gYXMtYnN8fChhcC1icCk7CiAgfSk7CiAgZWxzZSBpZihzb3J0PT09J2ltcHJlc3Npb25zJylhcnIuc29ydChmdW5jdGlvbihhLGIpe3JldHVybiBiLmltcHJlc3Npb25zLWEuaW1wcmVzc2lvbnM7fSk7CiAgZWxzZSBpZihzb3J0PT09J2NoZWNrbGlzdCcpYXJyLnNvcnQoZnVuY3Rpb24oYSxiKXtyZXR1cm4gY2hlY2tQcm9ncmVzcyhhKS5wY3QtY2hlY2tQcm9ncmVzcyhiKS5wY3Q7fSk7CiAgZWxzZSBpZihzb3J0PT09J3N0YXR1cycpYXJyLnNvcnQoZnVuY3Rpb24oYSxiKXtyZXR1cm4gU1RBVFVTX09SREVSLmluZGV4T2YoYS5zdGF0dXMpLVNUQVRVU19PUkRFUi5pbmRleE9mKGIuc3RhdHVzKTt9KTsKICByZXR1cm4gYXJyOwp9CgpmdW5jdGlvbiByZW5kZXJQYWdlcygpewogIHZhciBmU3RhdHVzPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmU3RhdHVzJykudmFsdWU7CiAgdmFyIGZQcmk9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZQcmknKS52YWx1ZTsKICB2YXIgZlNlYXJjaD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlNlYXJjaCcpLnZhbHVlLnRvTG93ZXJDYXNlKCk7CiAgdmFyIGxpc3Q9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BhZ2VzTGlzdCcpOwoKICB2YXIgYXJyPWdldFNvcnRlZCgpLmZpbHRlcihmdW5jdGlvbihwKXsKICAgIGlmKGZTdGF0dXMhPT0nYWxsJyYmcC5zdGF0dXMhPT1mU3RhdHVzKXJldHVybiBmYWxzZTsKICAgIGlmKGZQcmkhPT0nYWxsJyYmcC5wcmlvcml0eSE9PWZQcmkpcmV0dXJuIGZhbHNlOwogICAgaWYoZlNlYXJjaCYmIXAudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZlNlYXJjaCkmJiFwLmtleXdvcmQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmU2VhcmNoKSlyZXR1cm4gZmFsc2U7CiAgICByZXR1cm4gdHJ1ZTsKICB9KTsKCiAgaWYoIWFyci5sZW5ndGgpewogICAgbGlzdC5pbm5lckhUTUw9JzxkaXYgY2xhc3M9ImVtcHR5Ij48aDM+JysocGFnZXMubGVuZ3RoPydObyBwYWdlcyBtYXRjaCBmaWx0ZXJzJzonTm8gUGFnZXMgWWV0JykrJzwvaDM+PHA+JysocGFnZXMubGVuZ3RoPydBZGp1c3QgZmlsdGVycyBhYm92ZS4nOidBZGQgVVJMcyBhYm92ZSBvciBpbXBvcnQgYSBDU1YuJykrJzwvcD48L2Rpdj4nOwogICAgcmV0dXJuOwogIH0KCiAgbGlzdC5pbm5lckhUTUw9YXJyLm1hcChmdW5jdGlvbihwLGkpewogICAgdmFyIHByb2c9Y2hlY2tQcm9ncmVzcyhwKTsKICAgIHZhciBwcmlDbGFzcz0ncHJpLScrcC5wcmlvcml0eTsKICAgIHZhciBzaG9ydFVybD0nJzsKICAgIHRyeXtzaG9ydFVybD1uZXcgVVJMKHAudXJsKS5wYXRobmFtZXx8Jy8nO31jYXRjaChlKXtzaG9ydFVybD1wLnVybC5zbGljZSgwLDUwKTt9CiAgICBpZihzaG9ydFVybC5sZW5ndGg+NTUpc2hvcnRVcmw9c2hvcnRVcmwuc2xpY2UoMCw1NSkrJ+KApic7CgogICAgLy8gR3JvdXBlZCBjaGVja2xpc3QgYnkgcGhhc2UKICBmdW5jdGlvbiByZW5kZXJDbEl0ZW1zKGl0ZW1zKXsKICAgIHJldHVybiBpdGVtcy5tYXAoZnVuY3Rpb24oYyl7CiAgICAgIHZhciBjaGVja2VkID0gcC5jaGVja3NbYy5pZF07CiAgICAgIHZhciBiYWRnZSA9IChjLnBoYXNlPT09MiYmYy5wb2ludHMpCiAgICAgICAgPyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjdweDtwYWRkaW5nOjFweCA1cHg7Ym9yZGVyLXJhZGl1czozcHg7YmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjEyKTtjb2xvcjp2YXIoLS1ncmVlbik7ZmxleC1zaHJpbms6MDsiPitzY29yZTwvc3Bhbj4nCiAgICAgICAgOiAoYy5waGFzZT09PTImJiFjLnBvaW50cykKICAgICAgICA/ICc8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6N3B4O3BhZGRpbmc6MXB4IDVweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMSk7Y29sb3I6dmFyKC0tYmx1ZSk7ZmxleC1zaHJpbms6MDsiPkNUUjwvc3Bhbj4nCiAgICAgICAgOiAnJzsKICAgICAgcmV0dXJuICc8ZGl2IGNsYXNzPSJjbC1pdGVtJysoY2hlY2tlZD8nIGNoZWNrZWQnOicnKSsnIiBpZD0iY2xpLScrcC5pZCsnLScrYy5pZCsnIiBvbmNsaWNrPSJ0b2dnbGVDaGVjaygnJytwLmlkKycnLCcnK2MuaWQrJycpIicrKGMudGlwPycgdGl0bGU9IicrYy50aXArJyInOicnKSsnPicKICAgICAgICArJzxpbnB1dCB0eXBlPSJjaGVja2JveCInKyhjaGVja2VkPycgY2hlY2tlZCc6JycpKycgb25jbGljaz0iZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7dG9nZ2xlQ2hlY2soJycrcC5pZCsnJywnJytjLmlkKycnKSI+JwogICAgICAgICsnPGxhYmVsPicrYy5sYWJlbCsoYy50aXA/JyA8c3BhbiBzdHlsZT0iZm9udC1zaXplOjlweDtjb2xvcjp2YXIoLS1kaW0pO2N1cnNvcjpoZWxwOyIgdGl0bGU9IicrYy50aXArJyI+4pOYPC9zcGFuPic6JycpKyc8L2xhYmVsPicKICAgICAgICArYmFkZ2UKICAgICAgICArJzwvZGl2Pic7CiAgICB9KS5qb2luKCcnKTsKICB9CiAgdmFyIGYxID0gQ0wuZmlsdGVyKGZ1bmN0aW9uKGMpe3JldHVybiBjLnBoYXNlPT09MTt9KTsKICB2YXIgZjJwID0gQ0wuZmlsdGVyKGZ1bmN0aW9uKGMpe3JldHVybiBjLnBoYXNlPT09MiYmYy5wb2ludHM7fSk7CiAgdmFyIGYyYyA9IENMLmZpbHRlcihmdW5jdGlvbihjKXtyZXR1cm4gYy5waGFzZT09PTImJiFjLnBvaW50czt9KTsKICB2YXIgZjMgPSBDTC5maWx0ZXIoZnVuY3Rpb24oYyl7cmV0dXJuIGMucGhhc2U9PT0zO30pOwogIHZhciBwaCA9IGZ1bmN0aW9uKGxhYmVsLGNvbG9yLGJvcmRlcil7CiAgICByZXR1cm4gJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjonK2NvbG9yKyc7cGFkZGluZzo4cHggMCA0cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgJytib3JkZXIrJzttYXJnaW4tYm90dG9tOjRweDttYXJnaW4tdG9wOjZweDsiPicrbGFiZWwrJzwvZGl2Pic7CiAgfTsKICB2YXIgY2wgPSBwaCgn4pGgIFByZS1hdWRpdCcsJ3ZhcigtLWJsdWUpJywncmdiYSg5NiwxNjUsMjUwLC4yKScpCiAgICArICc8ZGl2IGNsYXNzPSJjbC1ncmlkIj4nK3JlbmRlckNsSXRlbXMoZjEpKyc8L2Rpdj4nCiAgICArIHBoKCfikaEgSW1wbGVtZW50YXRpb24g4oCUIGltcHJvdmVzIENvbnRlbnRTY29yZScsJ3ZhcigtLWdyZWVuKScsJ3JnYmEoNzQsMjIyLDEyOCwuMiknKQogICAgKyAnPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLXN1Yik7cGFkZGluZzo0cHggMCA2cHg7Ij7inJMgQWRkIHJlYWwgY29udGVudCDihpIgc2NvcmUgZ29lcyB1cC4gTWV0YS90aXRsZSBvbmx5ID0gbm8gcG9pbnRzLjwvZGl2PicKICAgICsgJzxkaXYgY2xhc3M9ImNsLWdyaWQiPicrcmVuZGVyQ2xJdGVtcyhmMnApKyc8L2Rpdj4nCiAgICArIHBoKCfikaEgVVggJiBDVFIgZml4ZXMg4oCUIG5vIHNjb3JlIGltcGFjdCcsJ3ZhcigtLWJsdWUpJywncmdiYSg5NiwxNjUsMjUwLC4xNSknKQogICAgKyAnPGRpdiBjbGFzcz0iY2wtZ3JpZCI+JytyZW5kZXJDbEl0ZW1zKGYyYykrJzwvZGl2PicKICAgICsgcGgoJ+KRoiBHbyBsaXZlICsgcmUtc2NhbicsJ3ZhcigtLWdvbGQpJywncmdiYSgyNTEsMTkxLDM2LC4yKScpCiAgICArICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tc3ViKTtwYWRkaW5nOjRweCAwIDZweDsiPuKaoCBSZS1zY2FuIG9ubHkgQUZURVIgdGhlIHBhZ2UgaXMgbGl2ZSBhbmQgcG9pbnQgaXRlbXMgYXJlIGNvbXBsZXRlZC48L2Rpdj4nCiAgICArICc8ZGl2IGNsYXNzPSJjbC1ncmlkIj4nK3JlbmRlckNsSXRlbXMoZjMpKyc8L2Rpdj4nOwoKICAgIHJldHVybiAnPGRpdiBjbGFzcz0icGFnZS1jYXJkIHMtJytwLnN0YXR1cysnIiBpZD0iY2FyZC0nK3AuaWQrJyI+JwoKICAgICAgLy8gSGVhZGVyCiAgICAgICsnPGRpdiBjbGFzcz0iY2FyZC1oZWFkIiBzdHlsZT0iZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4OyI+JwogICAgICArJzxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9InBhZ2UtYnVsay1jYiIgZGF0YS1pZD0iJytwLmlkKyciIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3VwZGF0ZUJ1bGtDb3VudCgpIiBzdHlsZT0id2lkdGg6MTRweDtoZWlnaHQ6MTRweDthY2NlbnQtY29sb3I6dmFyKC0tcmVkKTtmbGV4LXNocmluazowO2N1cnNvcjpwb2ludGVyOyI+JwogICAgICArJzxkaXYgc3R5bGU9ImZsZXg6MTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7IiBvbmNsaWNrPSJ0b2dnbGVDYXJkKCcnK3AuaWQrJycpIj4nCiAgICAgICsnPHNwYW4gY2xhc3M9ImNhcmQtcmFuayI+IycrKGkrMSkrJzwvc3Bhbj4nCiAgICAgICsnPHNwYW4gY2xhc3M9InByaS1kb3QgJytwcmlDbGFzcysnIj48L3NwYW4+JwogICAgICArJzxzcGFuIGNsYXNzPSJjYXJkLXVybCI+JytzaG9ydFVybCsnPHNwYW4gY2xhc3M9ImNhcmQta3ciPicrKCBwLmtleXdvcmQ/JyDigJQgJytwLmtleXdvcmQ6JycpKyc8L3NwYW4+PC9zcGFuPicKICAgICAgKyhwLnBvc2l0aW9uPyc8c3BhbiBjbGFzcz0iY2FyZC1nc2MiPnBvcyAnK01hdGgucm91bmQocC5wb3NpdGlvbikrKHAuaW1wcmVzc2lvbnM/JyDCtyAnK3AuaW1wcmVzc2lvbnMudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHInOicnKSsnPC9zcGFuPic6JycpCiAgICAgICsocC5zY29yZUJlZm9yZT8nPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOicrKHAuc2NvcmVCZWZvcmU8NzA/J3ZhcigtLXJlZCknOnAuc2NvcmVCZWZvcmU8ODU/J3ZhcigtLWdvbGQpJzondmFyKC0tZ3JlZW4pJykrJzsiPicrcC5zY29yZUJlZm9yZSsnLzEwMDwvc3Bhbj4nOicnKQogICAgICArJzxzcGFuIGNsYXNzPSJjYXJkLWNoayIgaWQ9ImNoay0nK3AuaWQrJyI+Jytwcm9nLnBjdCsnJTwvc3Bhbj4nCiAgICAgICsnPGJ1dHRvbiBjbGFzcz0ic3RhdHVzLWJ0biIgb25jbGljaz0iZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7Y3ljbGVTdGF0dXMoJycrcC5pZCsnJykiPicrU1RBVFVTX0xBQkVMU1twLnN0YXR1c10rJzwvYnV0dG9uPicKICAgICAgKyc8c3BhbiBjbGFzcz0iY2hldnJvbiIgaWQ9ImNoZXYtJytwLmlkKyciPuKWvjwvc3Bhbj4nCiAgICAgICsnPC9kaXY+JyAgLy8gY2xvc2UgaW5uZXIgY2xpY2thYmxlIGRpdgogICAgICArJzwvZGl2PicKCiAgICAgIC8vIEJvZHkKICAgICAgKyc8ZGl2IGNsYXNzPSJjYXJkLWJvZHkiIGlkPSJib2R5LScrcC5pZCsnIj4nCgogICAgICAvLyBGaWVsZHMKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1ncmlkIj4nCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiPjxsYWJlbD5TdGF0dXM8L2xhYmVsPjxzZWxlY3Qgb25jaGFuZ2U9InVwZGF0ZUZpZWxkKCcnK3AuaWQrJycsJ3N0YXR1cycsdGhpcy52YWx1ZSkiPicKICAgICAgK1snbm90c3RhcnRlZCcsJ2lucHJvZ3Jlc3MnLCdkb25lJywnZm9sbG93dXAnLCdibG9ja2VkJ10ubWFwKGZ1bmN0aW9uKHMpe3JldHVybiAnPG9wdGlvbiB2YWx1ZT0iJytzKyciJysocC5zdGF0dXM9PT1zPycgc2VsZWN0ZWQnOicnKSsnPicrU1RBVFVTX0xBQkVMU1tzXSsnPC9vcHRpb24+Jzt9KS5qb2luKCcnKQogICAgICArJzwvc2VsZWN0PjwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPlByaW9yaXR5PC9sYWJlbD48c2VsZWN0IG9uY2hhbmdlPSJ1cGRhdGVGaWVsZCgnJytwLmlkKycnLCdwcmlvcml0eScsdGhpcy52YWx1ZSkiPicKICAgICAgK1tbJ2hpZ2gnLCfwn5S0IEhpZ2gnXSxbJ21lZCcsJ/Cfn6EgTWVkaXVtJ10sWydsb3cnLCfwn5+iIExvdyddXS5tYXAoZnVuY3Rpb24oeCl7cmV0dXJuICc8b3B0aW9uIHZhbHVlPSInK3hbMF0rJyInKyhwLnByaW9yaXR5PT09eFswXT8nIHNlbGVjdGVkJzonJykrJz4nK3hbMV0rJzwvb3B0aW9uPic7fSkuam9pbignJykKICAgICAgKyc8L3NlbGVjdD48L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiPicKICAgICAgKyc8bGFiZWwgc3R5bGU9ImNvbG9yOnZhcigtLWJsdWUpIj7ikaAgUHJlLXNjYW4gU2NvcmUgKEJFRk9SRSBhdWRpdCk8L2xhYmVsPicKICAgICAgKyc8aW5wdXQgdHlwZT0ibnVtYmVyIiBtaW49IjAiIG1heD0iMTAwIiB2YWx1ZT0iJytwLnNjb3JlQmVmb3JlKyciIHBsYWNlaG9sZGVyPSJTY2FuIGZpcnN0LCBlbnRlciBoZXJlIiBkYXRhLXNjb3JlLWJlZm9yZT0iJytwLmlkKyciIG9uY2hhbmdlPSJ1cGRhdGVGaWVsZCgnJytwLmlkKycnLCdzY29yZUJlZm9yZScsdGhpcy52YWx1ZSkiPicKICAgICAgKyc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tdG9wOjRweDsiPlNjYW4gdmlhIPCfk4ogU2NhbiBTY29yZSBidXR0b24g4oCUIGRvIHRoaXMgQkVGT1JFIHRoZSBhdWRpdDwvZGl2PicKICAgICAgKyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiPicKICAgICAgKyc8bGFiZWwgc3R5bGU9ImNvbG9yOicrKHNjb3JlQWZ0ZXJMb2NrZWQocCk/J3ZhcigtLWRpbSknOid2YXIoLS1ncmVlbiknKSsnIj7ikaIgUG9zdC1zY2FuIFNjb3JlIChBRlRFUiBpbXBsZW1lbnRhdGlvbik8L2xhYmVsPicKICAgICAgKyc8aW5wdXQgdHlwZT0ibnVtYmVyIiBtaW49IjAiIG1heD0iMTAwIiB2YWx1ZT0iJytwLnNjb3JlQWZ0ZXIrJyIgcGxhY2Vob2xkZXI9IicrKHNjb3JlQWZ0ZXJMb2NrZWQocCk/J0NvbXBsZXRlIHBvaW50IGl0ZW1zIGZpcnN0JzonU2NhbiBhZnRlciBwYWdlIGlzIGxpdmUnKSsnIiAnKyhzY29yZUFmdGVyTG9ja2VkKHApPydkaXNhYmxlZCBzdHlsZT0ib3BhY2l0eTouNDtjdXJzb3I6bm90LWFsbG93ZWQiJzonJykrJyBvbmNoYW5nZT0idXBkYXRlRmllbGQoJycrcC5pZCsnJywnc2NvcmVBZnRlcicsdGhpcy52YWx1ZSkiPicKICAgICAgKyc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6Jysoc2NvcmVBZnRlckxvY2tlZChwKT8ndmFyKC0tcmVkKSc6J3ZhcigtLXN1YiknKSsnO21hcmdpbi10b3A6NHB4OyI+Jysoc2NvcmVBZnRlckxvY2tlZChwKT8n4pqgIENvbXBsZXRlIHBvaW50IGl0ZW1zICjikaEpIGZpcnN0IOKAlCBtZXRhL3RpdGxlIGFsb25lIGRvZXMgbm90IGNoYW5nZSB0aGUgc2NvcmUnOifinJMgUmUtc2NhbiBBRlRFUiB5b3UgaGF2ZSBwdWJsaXNoZWQgdGhlIHBhZ2UnKSsnPC9kaXY+JwogICAgICArJzwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPkdTQyBQb3NpdGlvbjwvbGFiZWw+PGlucHV0IHR5cGU9Im51bWJlciIgdmFsdWU9IicrcC5wb3NpdGlvbisnIiBwbGFjZWhvbGRlcj0iMzQiIG9uY2hhbmdlPSJ1cGRhdGVGaWVsZCgnJytwLmlkKycnLCdwb3NpdGlvbicsdGhpcy52YWx1ZSkiPjwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPkltcHJlc3Npb25zPC9sYWJlbD48aW5wdXQgdHlwZT0ibnVtYmVyIiB2YWx1ZT0iJytwLmltcHJlc3Npb25zKyciIHBsYWNlaG9sZGVyPSIxMjQwMCIgb25jaGFuZ2U9InVwZGF0ZUZpZWxkKCcnK3AuaWQrJycsJ2ltcHJlc3Npb25zJyx0aGlzLnZhbHVlKSI+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIj48bGFiZWw+RGVhZGxpbmU8L2xhYmVsPjxpbnB1dCB0eXBlPSJkYXRlIiB2YWx1ZT0iJytwLmRlYWRsaW5lKyciIG9uY2hhbmdlPSJ1cGRhdGVGaWVsZCgnJytwLmlkKycnLCdkZWFkbGluZScsdGhpcy52YWx1ZSkiPjwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPlByaW1hcnkgS2V5d29yZDwvbGFiZWw+PGlucHV0IHR5cGU9InRleHQiIHZhbHVlPSInK3Aua2V5d29yZCsnIiBvbmNoYW5nZT0idXBkYXRlRmllbGQoJycrcC5pZCsnJywna2V5d29yZCcsdGhpcy52YWx1ZSkiPjwvZGl2PicKICAgICAgKyc8L2Rpdj4nCgogICAgICAvLyBOb3RlcwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMnB4OyI+PGxhYmVsPk5vdGVzIC8gTmV4dCBTdGVwczwvbGFiZWw+PHRleHRhcmVhIG9uY2hhbmdlPSJ1cGRhdGVGaWVsZCgnJytwLmlkKycnLCdub3RlcycsdGhpcy52YWx1ZSkiPicrcC5ub3RlcysnPC90ZXh0YXJlYT48L2Rpdj4nCgogICAgICAvLyBDaGVja2xpc3QKICAgICAgKyc8ZGl2IGNsYXNzPSJjbC1oZWFkZXIiPjxzcGFuPkF1ZGl0IENoZWNrbGlzdCDigJQgMyBwaGFzZXM8L3NwYW4+JwogICAgICArJzxzcGFuIGlkPSJjbC1wcm9nLScrcC5pZCsnIiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2Rpc3BsYXk6ZmxleDtnYXA6MTBweDsiPicKICAgICAgKyc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj4rcHRzOiAnK3BvaW50c0RvbmUocCkrJy8nK3BvaW50c1RvdGFsKCkrJzwvc3Bhbj4nCiAgICAgICsnPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW11dGVkKSI+dG90YWFsOiAnK3Byb2cuZG9uZSsnLycrcHJvZy50b3RhbCsnPC9zcGFuPicKICAgICAgKyc8L3NwYW4+JwogICAgICArJzwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjbC1ncmlkIj4nK2NsKyc8L2Rpdj4nCgogICAgICAvLyBBY3Rpb25zCiAgICAgICsnPGRpdiBjbGFzcz0iY2FyZC1hY3Rpb25zIj4nCiAgICAgICsnPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wdXJwbGUgYnRuLXNtIiBvbmNsaWNrPSJvcGVuSW5BdWRpdCgnJytwLmlkKycnKSI+8J+UrCBPcGVuIGluIFBVTFNFK05FWFVTPC9idXR0b24+JwogICAgICArJzxidXR0b24gY2xhc3M9ImJ0biBidG4tZ3JlZW4gYnRuLXNtIiBvbmNsaWNrPSJtYXJrRG9uZSgnJytwLmlkKycnKSI+4pyTIE1hcmsgRG9uZTwvYnV0dG9uPicKICAgICAgKyc8YSBocmVmPSInK3AudXJsKyciIHRhcmdldD0iX2JsYW5rIiBjbGFzcz0iYnRuIGJ0bi1ibHVlIGJ0bi1zbSI+4oaXIE9wZW4gUGFnZTwvYT4nCiAgICAgICsnPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCBidG4tc20iIG9uY2xpY2s9InNjYW5PbmVQYWdlKCcnK3AuaWQrJycpIj7wn5OKIFNjYW4gU2NvcmU8L2J1dHRvbj4nCiAgICAgICsnPGEgaHJlZj0iaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvP3VybD0nK2VuY29kZVVSSUNvbXBvbmVudChwLnVybCkrJyIgdGFyZ2V0PSJfYmxhbmsiIGNsYXNzPSJidG4gYnRuLWJsdWUgYnRuLXNtIj7ihpcgQ29udGVudFNjYWxlPC9hPicKICAgICAgKyc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXJlZCBidG4tc20iIG9uY2xpY2s9ImRlbGV0ZVBhZ2UoJycrcC5pZCsnJykiPuKclSBEZWxldGU8L2J1dHRvbj4nCiAgICAgICsnPC9kaXY+JwoKICAgICAgKyc8L2Rpdj48L2Rpdj4nOwogIH0pLmpvaW4oJycpOwp9CgpmdW5jdGlvbiB0b2dnbGVDYXJkKGlkKXsKICB2YXIgYm9keT1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYm9keS0nK2lkKTsKICB2YXIgY2hldj1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hldi0nK2lkKTsKICBpZighYm9keSlyZXR1cm47CiAgdmFyIG9wZW49Ym9keS5jbGFzc0xpc3QudG9nZ2xlKCdvcGVuJyk7CiAgaWYoY2hldiljaGV2LmNsYXNzTGlzdC50b2dnbGUoJ29wZW4nLG9wZW4pOwp9CgovLyDilIDilIAgRXhwb3J0IENTViDilIDilIAKZnVuY3Rpb24gZXhwb3J0Q1NWKCl7CiAgaWYoIXBhZ2VzLmxlbmd0aCl7dG9hc3QoJ+KaoCBObyBwYWdlcyB0byBleHBvcnQnKTtyZXR1cm47fQogIHZhciBoZWFkZXJzPVsnVVJMJywnS2V5d29yZCcsJ1ByaW9yaXR5JywnU3RhdHVzJywnUG9zaXRpb24nLCdJbXByZXNzaW9ucycsJ1Njb3JlQmVmb3JlJywnU2NvcmVBZnRlcicsJ0RlYWRsaW5lJywnTm90ZXMnLCdDaGVja2xpc3RQY3QnLCdVcGRhdGVkJ107CiAgQ0wuZm9yRWFjaChmdW5jdGlvbihjKXtoZWFkZXJzLnB1c2goJ2Noa18nK2MuaWQpO30pOwogIHZhciByb3dzPVtoZWFkZXJzLmpvaW4oJywnKV07CiAgcGFnZXMuZm9yRWFjaChmdW5jdGlvbihwKXsKICAgIHZhciBwcm9nPWNoZWNrUHJvZ3Jlc3MocCk7CiAgICB2YXIgYmFzZT1bCiAgICAgICciJytwLnVybCsnIicsJyInKyhwLmtleXdvcmR8fCcnKSsnIicscC5wcmlvcml0eSxwLnN0YXR1cywKICAgICAgcC5wb3NpdGlvbnx8JycscC5pbXByZXNzaW9uc3x8JycscC5zY29yZUJlZm9yZXx8JycscC5zY29yZUFmdGVyfHwnJywKICAgICAgcC5kZWFkbGluZXx8JycsJyInKyhwLm5vdGVzfHwnJykucmVwbGFjZSgvIi9nLCInJyIpKyciJywKICAgICAgcHJvZy5wY3QrJyUnLHAudXBkYXRlZHx8JycKICAgIF07CiAgICBDTC5mb3JFYWNoKGZ1bmN0aW9uKGMpe2Jhc2UucHVzaChwLmNoZWNrc1tjLmlkXT8nMSc6JzAnKTt9KTsKICAgIHJvd3MucHVzaChiYXNlLmpvaW4oJywnKSk7CiAgfSk7CiAgLy8gUHJvamVjdCBpbmZvIGFzIGZpcnN0IGNvbW1lbnQgbGluZQogIHZhciBtZXRhPScjIENsaWVudDogJysocHJvamVjdC5jbGllbnR8fCcnKSsnIHwgU2l0ZTogJysocHJvamVjdC5zaXRlfHwnJykrJyB8IEF1ZGl0b3I6ICcrKHByb2plY3QuYXVkaXRvcnx8JycpKycgfCBFeHBvcnRlZDogJytuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CiAgdmFyIGNzdj1tZXRhKydcXG4nK3Jvd3Muam9pbignXFxuJyk7CiAgdmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOwogIGEuaHJlZj1VUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtjc3ZdLHt0eXBlOid0ZXh0L2Nzdid9KSk7CiAgYS5kb3dubG9hZD0nc2VvLWF1ZGl0LXdvcmtmbG93LScrKHByb2plY3QuY2xpZW50fHwnZXhwb3J0JykucmVwbGFjZSgvXFxzKy9nLCctJykudG9Mb3dlckNhc2UoKSsnLScrbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsMTApKycuY3N2JzsKICBhLmNsaWNrKCk7CiAgdG9hc3QoJ+KchSBDU1YgZXhwb3J0ZWQnKTsKfQoKLy8g4pSA4pSAIEltcG9ydCBDU1Yg4pSA4pSACmZ1bmN0aW9uIGltcG9ydENTVihpbnB1dCl7CiAgdmFyIGZpbGU9aW5wdXQuZmlsZXNbMF07aWYoIWZpbGUpcmV0dXJuOwogIHZhciByPW5ldyBGaWxlUmVhZGVyKCk7CiAgci5vbmxvYWQ9ZnVuY3Rpb24oZSl7CiAgICB2YXIgbGluZXM9ZS50YXJnZXQucmVzdWx0LnNwbGl0KCdcXG4nKS5maWx0ZXIoZnVuY3Rpb24obCl7cmV0dXJuIGwmJiFsLnN0YXJ0c1dpdGgoJyMnKTt9KTsKICAgIGlmKGxpbmVzLmxlbmd0aDwyKXt0b2FzdCgn4pqgIEludmFsaWQgQ1NWJyk7cmV0dXJuO30KICAgIHZhciBoZWFkZXJzPWxpbmVzWzBdLnNwbGl0KCcsJykubWFwKGZ1bmN0aW9uKGgpe3JldHVybiBoLnRyaW0oKS5yZXBsYWNlKC8iL2csJycpO30pOwogICAgdmFyIGltcG9ydGVkPTA7CiAgICBmb3IodmFyIGk9MTtpPGxpbmVzLmxlbmd0aDtpKyspewogICAgICB2YXIgY29scz1saW5lc1tpXS5tYXRjaCgvKCIuKj8ifFteLF0rfCg/PD0sKSg/PSwpfF4oPz0sKXwoPzw9LCkkKS9nKXx8bGluZXNbaV0uc3BsaXQoJywnKTsKICAgICAgY29scz1jb2xzLm1hcChmdW5jdGlvbihjKXtyZXR1cm4gKGN8fCcnKS5yZXBsYWNlKC9eInwiJC9nLCcnKS50cmltKCk7fSk7CiAgICAgIHZhciB1cmw9Y29sc1toZWFkZXJzLmluZGV4T2YoJ1VSTCcpXXx8Jyc7CiAgICAgIGlmKCF1cmx8fCF1cmwuaW5jbHVkZXMoJy4nKSljb250aW51ZTsKICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBleGlzdHMKICAgICAgdmFyIGV4aXN0cz1wYWdlcy5maW5kKGZ1bmN0aW9uKHApe3JldHVybiBwLnVybD09PXVybDt9KTsKICAgICAgaWYoIWV4aXN0cyl7CiAgICAgICAgdmFyIG5wPW1ha2VQYWdlKHVybCwKICAgICAgICAgIGNvbHNbaGVhZGVycy5pbmRleE9mKCdLZXl3b3JkJyldfHwnJywKICAgICAgICAgIGNvbHNbaGVhZGVycy5pbmRleE9mKCdQcmlvcml0eScpXXx8J21lZCcsCiAgICAgICAgICBjb2xzW2hlYWRlcnMuaW5kZXhPZignUG9zaXRpb24nKV18fDAsCiAgICAgICAgICBjb2xzW2hlYWRlcnMuaW5kZXhPZignSW1wcmVzc2lvbnMnKV18fDApOwogICAgICAgIG5wLnN0YXR1cz1jb2xzW2hlYWRlcnMuaW5kZXhPZignU3RhdHVzJyldfHwnbm90c3RhcnRlZCc7CiAgICAgICAgbnAuc2NvcmVCZWZvcmU9Y29sc1toZWFkZXJzLmluZGV4T2YoJ1Njb3JlQmVmb3JlJyldfHwnJzsKICAgICAgICBucC5zY29yZUFmdGVyPWNvbHNbaGVhZGVycy5pbmRleE9mKCdTY29yZUFmdGVyJyldfHwnJzsKICAgICAgICBucC5kZWFkbGluZT1jb2xzW2hlYWRlcnMuaW5kZXhPZignRGVhZGxpbmUnKV18fCcnOwogICAgICAgIG5wLm5vdGVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdOb3RlcycpXXx8Jyc7CiAgICAgICAgLy8gUmVzdG9yZSBjaGVja2xpc3QKICAgICAgICBDTC5mb3JFYWNoKGZ1bmN0aW9uKGMpewogICAgICAgICAgdmFyIGNpPWhlYWRlcnMuaW5kZXhPZignY2hrXycrYy5pZCk7CiAgICAgICAgICBpZihjaT49MClucC5jaGVja3NbYy5pZF09Y29sc1tjaV09PT0nMSc7CiAgICAgICAgfSk7CiAgICAgICAgcGFnZXMucHVzaChucCk7aW1wb3J0ZWQrKzsKICAgICAgfSBlbHNlIHsKICAgICAgICAvLyBVcGRhdGUgZXhpc3RpbmcKICAgICAgICBleGlzdHMuc3RhdHVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdTdGF0dXMnKV18fGV4aXN0cy5zdGF0dXM7CiAgICAgICAgZXhpc3RzLm5vdGVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdOb3RlcycpXXx8ZXhpc3RzLm5vdGVzOwogICAgICAgIGV4aXN0cy5zY29yZUJlZm9yZT1jb2xzW2hlYWRlcnMuaW5kZXhPZignU2NvcmVCZWZvcmUnKV18fGV4aXN0cy5zY29yZUJlZm9yZTsKICAgICAgICBleGlzdHMuc2NvcmVBZnRlcj1jb2xzW2hlYWRlcnMuaW5kZXhPZignU2NvcmVBZnRlcicpXXx8ZXhpc3RzLnNjb3JlQWZ0ZXI7CiAgICAgICAgQ0wuZm9yRWFjaChmdW5jdGlvbihjKXsKICAgICAgICAgIHZhciBjaT1oZWFkZXJzLmluZGV4T2YoJ2Noa18nK2MuaWQpOwogICAgICAgICAgaWYoY2k+PTApZXhpc3RzLmNoZWNrc1tjLmlkXT1jb2xzW2NpXT09PScxJzsKICAgICAgICB9KTsKICAgICAgICBpbXBvcnRlZCsrOwogICAgICB9CiAgICB9CiAgICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpOwogICAgdG9hc3QoJ+KchSAnK2ltcG9ydGVkKycgcGFnZXMgaW1wb3J0ZWQvdXBkYXRlZCcpOwogIH07CiAgci5yZWFkQXNUZXh0KGZpbGUpOwogIGlucHV0LnZhbHVlPScnOwp9CgpmdW5jdGlvbiBtYWtlUGFnZSh1cmwsa3cscHJpLHBvcyxpbXByKXsKICB2YXIgY2hlY2tzPXt9OwogIENMLmZvckVhY2goZnVuY3Rpb24oYyl7Y2hlY2tzW2MuaWRdPWZhbHNlO30pOwogIHJldHVybiB7aWQ6dWlkKCksdXJsOnVybCxrZXl3b3JkOmt3fHwnJyxwcmlvcml0eTpwcml8fCdtZWQnLAogICAgcG9zaXRpb246cGFyc2VGbG9hdChwb3MpfHwwLGltcHJlc3Npb25zOnBhcnNlSW50KGltcHIpfHwwLAogICAgc3RhdHVzOidub3RzdGFydGVkJyxzY29yZUJlZm9yZTonJyxzY29yZUFmdGVyOicnLG5vdGVzOicnLGRlYWRsaW5lOicnLAogICAgY2hlY2tzOmNoZWNrcyxjcmVhdGVkOm5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSx1cGRhdGVkOm5ldyBEYXRlKCkudG9JU09TdHJpbmcoKX07Cn0KCi8vIOKUgOKUgCBDbGllbnQgcmVwb3J0IGV4cG9ydCDilIDilIAKZnVuY3Rpb24gZXhwb3J0Q2xpZW50UmVwb3J0KCl7CiAgaWYoIXBhZ2VzLmxlbmd0aCl7dG9hc3QoJ+KaoCBObyBwYWdlcycpO3JldHVybjt9CiAgdmFyIGRvbmU9cGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApe3JldHVybiBwLnN0YXR1cz09PSdkb25lJzt9KTsKICB2YXIgaW5wPXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0naW5wcm9ncmVzcyc7fSk7CiAgdmFyIGZ1PXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0nZm9sbG93dXAnO30pOwogIHZhciBodG1sPSc8IURPQ1RZUEUgaHRtbD48aHRtbD48aGVhZD48bWV0YSBjaGFyc2V0PSJVVEYtOCI+PHRpdGxlPlNFTyBBdWRpdCBSZXBvcnQg4oCUICcrKHByb2plY3QuY2xpZW50fHwnQ2xpZW50JykrJzwvdGl0bGU+JwogICAgKyc8c3R5bGU+Ym9keXtmb250LWZhbWlseTpBcmlhbCxzYW5zLXNlcmlmO21heC13aWR0aDo5MDBweDttYXJnaW46NDBweCBhdXRvO2NvbG9yOiMxZjI5Mzc7cGFkZGluZzowIDIwcHg7fScKICAgICsnaDF7Y29sb3I6IzZkMjhkOTtmb250LXNpemU6MjhweDttYXJnaW4tYm90dG9tOjRweDt9aDJ7Y29sb3I6IzRiNTU2Mztmb250LXNpemU6MThweDttYXJnaW46MjRweCAwIDEwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgI2U1ZTdlYjtwYWRkaW5nLWJvdHRvbTo2cHg7fScKICAgICsndGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWFyZ2luLWJvdHRvbToyMHB4O2ZvbnQtc2l6ZToxM3B4O30nCiAgICArJ3Roe2JhY2tncm91bmQ6I2YzZjRmNjtwYWRkaW5nOjhweCAxMHB4O3RleHQtYWxpZ246bGVmdDtib3JkZXI6MXB4IHNvbGlkICNlNWU3ZWI7Y29sb3I6IzZiNzI4MDt9JwogICAgKyd0ZHtwYWRkaW5nOjhweCAxMHB4O2JvcmRlcjoxcHggc29saWQgI2U1ZTdlYjt9JwogICAgKycuZG9uZXtjb2xvcjojMTZhMzRhO2ZvbnQtd2VpZ2h0OjcwMDt9LmlucHtjb2xvcjojYjQ1MzA5O30uZnV7Y29sb3I6IzdjM2FlZDt9JwogICAgKyc8L3N0eWxlPjwvaGVhZD48Ym9keT4nCiAgICArJzxoMT5TRU8gQXVkaXQgUmVwb3J0PC9oMT4nCiAgICArJzxwPjxzdHJvbmc+Q2xpZW50Ojwvc3Ryb25nPiAnKyhwcm9qZWN0LmNsaWVudHx8J+KAlCcpKycgJm5ic3A7IDxzdHJvbmc+U2l0ZTo8L3N0cm9uZz4gJysocHJvamVjdC5zaXRlfHwn4oCUJykKICAgICsnICZuYnNwOyA8c3Ryb25nPkF1ZGl0b3I6PC9zdHJvbmc+ICcrKHByb2plY3QuYXVkaXRvcnx8J+KAlCcpKycgJm5ic3A7IDxzdHJvbmc+RGF0ZTo8L3N0cm9uZz4gJytuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpKyc8L3A+JwogICAgKyc8cD48c3Ryb25nPlByb2dyZXNzOjwvc3Ryb25nPiAnK2RvbmUubGVuZ3RoKycvJytwYWdlcy5sZW5ndGgrJyBwYWdlcyBjb21wbGV0ZWQgKCcrTWF0aC5yb3VuZChkb25lLmxlbmd0aC9wYWdlcy5sZW5ndGgqMTAwKSsnJSk8L3A+JzsKCiAgZnVuY3Rpb24gcGFnZVJvd3MoYXJyKXsKICAgIHJldHVybiBhcnIubWFwKGZ1bmN0aW9uKHApewogICAgICB2YXIgcHJvZz1jaGVja1Byb2dyZXNzKHApOwogICAgICByZXR1cm4gJzx0cj48dGQ+PGEgaHJlZj0iJytwLnVybCsnIj4nK3AudXJsKyc8L2E+PC90ZD48dGQ+JytwLmtleXdvcmQrJzwvdGQ+JwogICAgICAgICsnPHRkPicrKHAuc2NvcmVCZWZvcmV8fCfigJQnKSsnIOKGkiAnKyhwLnNjb3JlQWZ0ZXJ8fCfigJQnKSsnPC90ZD4nCiAgICAgICAgKyc8dGQ+Jytwcm9nLnBjdCsnJTwvdGQ+PHRkPicrKHAubm90ZXN8fCfigJQnKSsnPC90ZD48L3RyPic7CiAgICB9KS5qb2luKCcnKTsKICB9CgogIGlmKGRvbmUubGVuZ3RoKXtodG1sKz0nPGgyPuKchSBDb21wbGV0ZWQgUGFnZXMgKCcrZG9uZS5sZW5ndGgrJyk8L2gyPjx0YWJsZT48dHI+PHRoPlVSTDwvdGg+PHRoPktleXdvcmQ8L3RoPjx0aD5TY29yZSBCZWZvcmXihpJBZnRlcjwvdGg+PHRoPkNoZWNrbGlzdDwvdGg+PHRoPk5vdGVzPC90aD48L3RyPicrcGFnZVJvd3MoZG9uZSkrJzwvdGFibGU+Jzt9CiAgaWYoaW5wLmxlbmd0aCl7aHRtbCs9JzxoMj7wn5SEIEluIFByb2dyZXNzICgnK2lucC5sZW5ndGgrJyk8L2gyPjx0YWJsZT48dHI+PHRoPlVSTDwvdGg+PHRoPktleXdvcmQ8L3RoPjx0aD5TY29yZSBCZWZvcmXihpJBZnRlcjwvdGg+PHRoPkNoZWNrbGlzdDwvdGg+PHRoPk5vdGVzPC90aD48L3RyPicrcGFnZVJvd3MoaW5wKSsnPC90YWJsZT4nO30KICBpZihmdS5sZW5ndGgpe2h0bWwrPSc8aDI+8J+TjCBGb2xsb3ctdXAgUmVxdWlyZWQgKCcrZnUubGVuZ3RoKycpPC9oMj48dGFibGU+PHRyPjx0aD5VUkw8L3RoPjx0aD5LZXl3b3JkPC90aD48dGg+U2NvcmUgQmVmb3Jl4oaSQWZ0ZXI8L3RoPjx0aD5DaGVja2xpc3Q8L3RoPjx0aD5Ob3RlczwvdGg+PC90cj4nK3BhZ2VSb3dzKGZ1KSsnPC90YWJsZT4nO30KCiAgaHRtbCs9JzwvYm9keT48L2h0bWw+JzsKICB2YXIgYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7CiAgYS5ocmVmPVVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW2h0bWxdLHt0eXBlOid0ZXh0L2h0bWwnfSkpOwogIGEuZG93bmxvYWQ9J3Nlby1yZXBvcnQtJysocHJvamVjdC5jbGllbnR8fCdjbGllbnQnKS5yZXBsYWNlKC9cXHMrL2csJy0nKS50b0xvd2VyQ2FzZSgpKyctJytuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwxMCkrJy5odG1sJzsKICBhLmNsaWNrKCk7CiAgdG9hc3QoJ+KchSBDbGllbnQgcmVwb3J0IGV4cG9ydGVkJyk7Cn0KCi8vIOKUgOKUgCBDaGVjayBmb3IgUFVMU0UrTkVYVVMgY2FsbGJhY2sg4pSA4pSACi8vIFdoZW4gYXVkaXQgdG9vbCBtYXJrcyBhIHBhZ2UgZG9uZSwgaXQgY2FuIHNldCA/ZG9uZT1wYWdlSWQgaW4gVVJMCihmdW5jdGlvbiBjaGVja0NhbGxiYWNrKCl7CiAgdmFyIHBhcmFtcz1uZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpOwogIHZhciBkb25lSWQ9cGFyYW1zLmdldCgnZG9uZScpOwogIGlmKGRvbmVJZCl7CiAgICB2YXIgcD1wYWdlcy5maW5kKGZ1bmN0aW9uKHBnKXtyZXR1cm4gcGcuaWQ9PT1kb25lSWQ7fSk7CiAgICBpZihwKXsKICAgICAgcC5zdGF0dXM9J2RvbmUnO3AuY2hlY2tzWydwdWxzZSddPXRydWU7cC51cGRhdGVkPW5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTsKICAgICAgc2F2ZSgpO3RvYXN0KCfinIUgUGFnZSBtYXJrZWQgZG9uZSBmcm9tIFBVTFNFK05FWFVTJyk7CiAgICB9CiAgICBoaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCcnLHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7CiAgfQp9KSgpOwoKLy8g4pSA4pSAIEltcG9ydCBHU0MgQ1NWIOKGkiBhdXRvLXBvcHVsYXRlIHBhZ2VzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAovLyBHU0MgZXhwb3J0OiBQZXJmb3JtYW5jZSDihpIgUGFnZXMgdGFiIOKGkiBFeHBvcnQgQ1NWCi8vIOKUgOKUgCBHU0MgaW1wb3J0IOKAlCBQYWdlcyBDU1YgKyBRdWVyaWVzIENTViBiZWlkZSB0ZWdlbGlqayDilIDilIDilIDilIAKdmFyIF9nc2NRdWVyeU1hcCA9IHt9OyAvLyB1cmwg4oaSIFtxdWVyeSwgcXVlcnksIC4uLl0KCmZ1bmN0aW9uIGltcG9ydEdTQyhpbnB1dCl7CiAgdmFyIGZpbGVzID0gQXJyYXkuZnJvbShpbnB1dC5maWxlcyk7CiAgaWYoIWZpbGVzLmxlbmd0aCkgcmV0dXJuOwoKICB2YXIgdG90YWxBZGRlZCA9IDAsIHRvdGFsVXBkYXRlZCA9IDAsIHF1ZXJpZXNMb2FkZWQgPSAwOwogIHZhciBwZW5kaW5nID0gZmlsZXMubGVuZ3RoOwoKICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpewogICAgdmFyIHIgPSBuZXcgRmlsZVJlYWRlcigpOwogICAgci5vbmxvYWQgPSBmdW5jdGlvbihlKXsKICAgICAgdmFyIHJlc3VsdCA9IHBhcnNlR1NDRmlsZShlLnRhcmdldC5yZXN1bHQpOwogICAgICBpZihyZXN1bHQudHlwZSA9PT0gJ3BhZ2VzJyl7CiAgICAgICAgdG90YWxBZGRlZCArPSByZXN1bHQuYWRkZWQ7CiAgICAgICAgdG90YWxVcGRhdGVkICs9IHJlc3VsdC51cGRhdGVkOwogICAgICB9IGVsc2UgaWYocmVzdWx0LnR5cGUgPT09ICdxdWVyaWVzJyl7CiAgICAgICAgcXVlcmllc0xvYWRlZCA9IHJlc3VsdC5jb3VudDsKICAgICAgfQogICAgICBwZW5kaW5nLS07CiAgICAgIGlmKHBlbmRpbmcgPT09IDApewogICAgICAgIC8vIEF1dG8tbWVyZ2UgZHVwbGljYXRlcyBhZnRlciBpbXBvcnQKICAgICAgICB2YXIgYmVmb3JlTWVyZ2UgPSBwYWdlcy5sZW5ndGg7CiAgICAgICAgdmFyIHNlZW4gPSB7fSwgY250cyA9IHt9OwogICAgICAgIHBhZ2VzLmZvckVhY2goZnVuY3Rpb24ocCkgewogICAgICAgICAgdmFyIGtleSA9IChwLnVybHx8JycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xcLyskLywgJycpOwogICAgICAgICAgaWYgKHNlZW5ba2V5XSkgewogICAgICAgICAgICB2YXIgZXggPSBzZWVuW2tleV07CiAgICAgICAgICAgIGV4LmltcHJlc3Npb25zID0gKGV4LmltcHJlc3Npb25zfHwwKSArIChwLmltcHJlc3Npb25zfHwwKTsKICAgICAgICAgICAgZXguX3BzID0gKGV4Ll9wc3x8ZXgucG9zaXRpb258fDApICsgKHAucG9zaXRpb258fDApOwogICAgICAgICAgICBjbnRzW2tleV0rKzsKICAgICAgICAgICAgcC5fZHVwID0gdHJ1ZTsKICAgICAgICAgIH0gZWxzZSB7IHNlZW5ba2V5XSA9IHA7IHAuX3BzID0gcC5wb3NpdGlvbnx8MDsgY250c1trZXldID0gMTsgfQogICAgICAgIH0pOwogICAgICAgIE9iamVjdC5rZXlzKHNlZW4pLmZvckVhY2goZnVuY3Rpb24oayl7CiAgICAgICAgICB2YXIgcCA9IHNlZW5ba107CiAgICAgICAgICBpZihjbnRzW2tdPjEpeyBwLnBvc2l0aW9uPU1hdGgucm91bmQoKHAuX3BzL2NudHNba10pKjEwKS8xMDsgfQogICAgICAgICAgZGVsZXRlIHAuX3BzOwogICAgICAgIH0pOwogICAgICAgIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApeyByZXR1cm4gIXAuX2R1cDsgfSk7CiAgICAgICAgdmFyIG1lcmdlZENvdW50ID0gYmVmb3JlTWVyZ2UgLSBwYWdlcy5sZW5ndGg7CiAgICAgICAgLy8gU2F2ZSBHU0MgZGF0YSB0byBzaGFyZWQgc3RvcmFnZSBmb3IgUFVMU0UrTkVYVVMKICAgICAgICB0cnkgewogICAgICAgICAgdmFyIHNoYXJlZEdzYyA9IHsgcGFnZXM6IHBhZ2VzLm1hcChmdW5jdGlvbihwKXsgcmV0dXJuIHtwYWdlOnAudXJsLCBpbXByZXNzaW9uczpwLmltcHJlc3Npb25zfHwwLCBjbGlja3M6MCwgY3RyOnAuY3RyfHwwLCBwb3NpdGlvbjpwLnBvc2l0aW9ufHwwLCBzY29yZTowfTsgfSksIHF1ZXJpZXM6IFtdIH07CiAgICAgICAgICBpZiAodHlwZW9mIF9nc2NRdWVyeU1hcCAhPT0gJ3VuZGVmaW5lZCcpIHsgc2hhcmVkR3NjLnF1ZXJpZXMgPSBPYmplY3Qua2V5cyhfZ3NjUXVlcnlNYXApLm1hcChmdW5jdGlvbihxKXsgcmV0dXJuIHtxdWVyeTpxLCBwb3NpdGlvbjpfZ3NjUXVlcnlNYXBbcV19OyB9KTsgfQogICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NzX3NoYXJlZF9nc2MnLCBKU09OLnN0cmluZ2lmeShzaGFyZWRHc2MpKTsKICAgICAgICB9IGNhdGNoKGUpIHt9CiAgICAgICAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogICAgICAgIHZhciBtc2cgPSAn4pyFIEdTQzogJyArIHRvdGFsQWRkZWQgKyAnIGFkZGVkLCAnICsgdG90YWxVcGRhdGVkICsgJyB1cGRhdGVkJzsKICAgICAgICBpZiAobWVyZ2VkQ291bnQgPiAwKSBtc2cgKz0gJyDCtyAnICsgbWVyZ2VkQ291bnQgKyAnIGR1cGxpY2F0ZXMgbWVyZ2VkJzsKICAgICAgICBpZihxdWVyaWVzTG9hZGVkKSBtc2cgKz0gJyDCtyAnICsgcXVlcmllc0xvYWRlZCArICcgcXVlcmllcyBsb2FkZWQnOwogICAgICAgIHRvYXN0KG1zZyk7CiAgICAgIH0KICAgIH07CiAgICByLnJlYWRBc1RleHQoZmlsZSk7CiAgfSk7CiAgaW5wdXQudmFsdWUgPSAnJzsKfQoKZnVuY3Rpb24gcGFyc2VHU0NGaWxlKHJhdyl7CiAgdmFyIGxpbmVzID0gcmF3LnRyaW0oKS5zcGxpdCgnXFxuJyk7CiAgaWYobGluZXMubGVuZ3RoIDwgMikgcmV0dXJuIHt0eXBlOid1bmtub3duJ307CiAgdmFyIGhlYWRlciA9IGxpbmVzWzBdLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvIi9nLCcnKS5zcGxpdCgnLCcpOwoKICAvLyBEZXRlY3QgaWYgdGhpcyBpcyBhIFF1ZXJpZXMgQ1NWIG9yIFBhZ2VzIENTVgogIHZhciBpc1F1ZXJpZXMgPSBoZWFkZXIuc29tZShmdW5jdGlvbihoKXsgcmV0dXJuIGguaW5jbHVkZXMoJ3F1ZXJ5JykgfHwgaC5pbmNsdWRlcygnc2VhcmNoIHRlcm0nKTsgfSk7CgogIGlmKGlzUXVlcmllcyl7CiAgICAvLyBRdWVyaWVzIENTViDigJQgYnVpbGQgYSBxdWVyeSBsaXN0IChub3QgbGlua2VkIHRvIHBhZ2VzIGRpcmVjdGx5IGhlcmUpCiAgICAvLyBTdG9yZSBnbG9iYWxseSBmb3IgdXNlIGluIFBVTFNFK05FWFVTCiAgICBfZ3NjUXVlcnlNYXAgPSB7fTsKICAgIHZhciBpUXVlcnkgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygncXVlcnknKXx8aC5pbmNsdWRlcygnc2VhcmNoIHRlcm0nKTsgfSk7CiAgICB2YXIgaVBvcyAgID0gaGVhZGVyLmZpbmRJbmRleChmdW5jdGlvbihoKXsgcmV0dXJuIGguaW5jbHVkZXMoJ3Bvc2l0aW9uJyk7IH0pOwogICAgdmFyIGNvdW50ICA9IDA7CiAgICBmb3IodmFyIGk9MTtpPGxpbmVzLmxlbmd0aDtpKyspewogICAgICB2YXIgY29scyA9IGxpbmVzW2ldLnJlcGxhY2UoLyIvZywnJykuc3BsaXQoJywnKTsKICAgICAgdmFyIHEgPSAoY29sc1tpUXVlcnldfHwnJykudHJpbSgpOwogICAgICB2YXIgcG9zID0gcGFyc2VGbG9hdChjb2xzW2lQb3NdKXx8MDsKICAgICAgaWYocSl7IF9nc2NRdWVyeU1hcFtxXSA9IHBvczsgY291bnQrKzsgfQogICAgfQogICAgdHJ5eyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3NfZ3NjX3F1ZXJpZXMnLCBKU09OLnN0cmluZ2lmeShfZ3NjUXVlcnlNYXApKTsgfWNhdGNoKGUpe30KICAgIHJldHVybiB7dHlwZToncXVlcmllcycsIGNvdW50OmNvdW50fTsKICB9CgogIC8vIFBhZ2VzIENTVgogIHZhciBpVXJsICA9IGhlYWRlci5maW5kSW5kZXgoZnVuY3Rpb24oaCl7IHJldHVybiBoLmluY2x1ZGVzKCdwYWdlJyl8fGguaW5jbHVkZXMoJ3VybCcpfHxoLmluY2x1ZGVzKCd0b3AgcGFnZScpOyB9KTsKICB2YXIgaUltcHIgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygnaW1wcmVzc2lvbicpOyB9KTsKICB2YXIgaUN0ciAgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygnY3RyJyk7IH0pOwogIHZhciBpUG9zICA9IGhlYWRlci5maW5kSW5kZXgoZnVuY3Rpb24oaCl7IHJldHVybiBoLmluY2x1ZGVzKCdwb3NpdGlvbicpfHxoLmluY2x1ZGVzKCdwb3MnKTsgfSk7CiAgaWYoaVVybDwwKWlVcmw9MDsgaWYoaUltcHI8MClpSW1wcj0yOyBpZihpUG9zPDApaVBvcz00OwoKICB2YXIgYWRkZWQ9MCwgdXBkYXRlZD0wOwogIGZvcih2YXIgaT0xO2k8bGluZXMubGVuZ3RoO2krKyl7CiAgICB2YXIgY29scyA9IGxpbmVzW2ldLnJlcGxhY2UoLyIvZywnJykuc3BsaXQoJywnKTsKICAgIHZhciB1cmwgPSAoY29sc1tpVXJsXXx8JycpLnRyaW0oKTsKICAgIC8vIE9ubHkgYWNjZXB0IHJlYWwgcGFnZSBVUkxzIOKAlCBtdXN0IHN0YXJ0IHdpdGggaHR0cCBvciAvCiAgICBpZighdXJsKSBjb250aW51ZTsKICAgIGlmKCF1cmwuc3RhcnRzV2l0aCgnaHR0cCcpICYmICF1cmwuc3RhcnRzV2l0aCgnLycpKSBjb250aW51ZTsKICAgIC8vIFJlamVjdCBxdWVyeSBzdHJpbmdzIG1hc3F1ZXJhZGluZyBhcyBVUkxzCiAgICBpZih1cmwuaW5jbHVkZXMoJy1zaXRlOicpIHx8IHVybC5pbmNsdWRlcygnICcpIHx8IHVybC5pbmNsdWRlcygnP3E9JykpIGNvbnRpbnVlOwogICAgdmFyIGltcHIgPSBwYXJzZUludChjb2xzW2lJbXByXSl8fDA7CiAgICB2YXIgcG9zICA9IHBhcnNlRmxvYXQoY29sc1tpUG9zXSl8fDA7CiAgICB2YXIgY3RyICA9IHBhcnNlRmxvYXQoKGNvbHNbaUN0cl18fCcwJykucmVwbGFjZSgnJScsJycpKXx8MDsKICAgIHZhciBwcmk7CiAgICBpZihwb3M+PTExJiZwb3M8PTMwKSBwcmk9J2hpZ2gnOwogICAgZWxzZSBpZihwb3M+PTEmJnBvczw9MTAmJmN0cjwyKSBwcmk9J2hpZ2gnOwogICAgZWxzZSBpZihwb3M+MzAmJnBvczw9NjApIHByaT0nbWVkJzsKICAgIGVsc2UgaWYocG9zPjYwKSBwcmk9J2xvdyc7CiAgICBlbHNlIHByaT0nbG93JzsKICAgIHZhciBleGlzdGluZyA9IHBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7IHJldHVybiBwLnVybD09PXVybDsgfSk7CiAgICBpZihleGlzdGluZyl7CiAgICAgIC8vIE1lcmdlOiBrZWVwIGhpZ2hlc3QgaW1wcmVzc2lvbnMsIGJlc3QgcG9zaXRpb24KICAgICAgaWYoaW1wciA+IChleGlzdGluZy5pbXByZXNzaW9uc3x8MCkpIGV4aXN0aW5nLmltcHJlc3Npb25zID0gaW1wcjsKICAgICAgaWYocG9zID4gMCAmJiAoZXhpc3RpbmcucG9zaXRpb249PT0wIHx8IHBvcyA8IGV4aXN0aW5nLnBvc2l0aW9uKSkgZXhpc3RpbmcucG9zaXRpb24gPSBwb3M7CiAgICAgIGV4aXN0aW5nLnByaW9yaXR5PXByaTsgZXhpc3RpbmcuY3RyPWN0cjsKICAgICAgZXhpc3RpbmcudXBkYXRlZD1uZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CiAgICAgIHVwZGF0ZWQrKzsKICAgIH0gZWxzZSB7CiAgICAgIHZhciBucCA9IG1ha2VQYWdlKHVybCwnJyxwcmkscG9zLGltcHIpOwogICAgICBucC5jdHIgPSBjdHI7CiAgICAgIHBhZ2VzLnB1c2gobnApOwogICAgICBhZGRlZCsrOwogICAgfQogIH0KICByZXR1cm4ge3R5cGU6J3BhZ2VzJywgYWRkZWQ6YWRkZWQsIHVwZGF0ZWQ6dXBkYXRlZH07Cn0KCmZ1bmN0aW9uIG1lcmdlRHVwbGljYXRlUGFnZXMoKSB7CiAgdmFyIHNlZW4gPSB7fTsgICAgLy8ga2V5IC0+IHByaW1hcnkgcGFnZSBvYmplY3QKICB2YXIgY291bnRzID0ge307ICAvLyBrZXkgLT4gY291bnQgZm9yIGF2ZXJhZ2luZyBwb3NpdGlvbgogIHZhciBtZXJnZWQgPSAwOwoKICBwYWdlcy5mb3JFYWNoKGZ1bmN0aW9uKHApIHsKICAgIHZhciBrZXkgPSAocC51cmwgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xcLyskLywgJycpOwogICAgaWYgKHNlZW5ba2V5XSkgewogICAgICB2YXIgZXggPSBzZWVuW2tleV07CiAgICAgIC8vIFN1bSBpbXByZXNzaW9ucwogICAgICBleC5pbXByZXNzaW9ucyA9IChleC5pbXByZXNzaW9ucyB8fCAwKSArIChwLmltcHJlc3Npb25zIHx8IDApOwogICAgICAvLyBSdW5uaW5nIGF2ZXJhZ2UgZm9yIHBvc2l0aW9uCiAgICAgIGV4Ll9wb3NTdW0gPSAoZXguX3Bvc1N1bSB8fCBleC5wb3NpdGlvbiB8fCAwKSArIChwLnBvc2l0aW9uIHx8IDApOwogICAgICBjb3VudHNba2V5XSsrOwogICAgICBwLl9kdXBsaWNhdGUgPSB0cnVlOwogICAgICBtZXJnZWQrKzsKICAgIH0gZWxzZSB7CiAgICAgIHNlZW5ba2V5XSA9IHA7CiAgICAgIHAuX3Bvc1N1bSA9IHAucG9zaXRpb24gfHwgMDsKICAgICAgY291bnRzW2tleV0gPSAxOwogICAgfQogIH0pOwoKICAvLyBGaW5hbGl6ZSBhdmVyYWdlcwogIE9iamVjdC5rZXlzKHNlZW4pLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7CiAgICB2YXIgcCA9IHNlZW5ba2V5XTsKICAgIGlmIChjb3VudHNba2V5XSA+IDEpIHsKICAgICAgcC5wb3NpdGlvbiA9IE1hdGgucm91bmQoKHAuX3Bvc1N1bSAvIGNvdW50c1trZXldKSAqIDEwKSAvIDEwOwogICAgICAvLyBSZWNhbGN1bGF0ZSBwcmlvcml0eSBmcm9tIGF2ZyBwb3NpdGlvbgogICAgICBpZiAocC5wb3NpdGlvbiA+PSAxMSAmJiBwLnBvc2l0aW9uIDw9IDMwKSBwLnByaW9yaXR5ID0gJ2hpZ2gnOwogICAgICBlbHNlIGlmIChwLnBvc2l0aW9uID49IDEgJiYgcC5wb3NpdGlvbiA8PSAxMCkgcC5wcmlvcml0eSA9ICdoaWdoJzsKICAgICAgZWxzZSBpZiAocC5wb3NpdGlvbiA+IDMwICYmIHAucG9zaXRpb24gPD0gNjApIHAucHJpb3JpdHkgPSAnbWVkJzsKICAgICAgZWxzZSBwLnByaW9yaXR5ID0gJ2xvdyc7CiAgICB9CiAgICBkZWxldGUgcC5fcG9zU3VtOwogIH0pOwoKICBpZiAobWVyZ2VkID4gMCkgewogICAgcGFnZXMgPSBwYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7IHJldHVybiAhcC5fZHVwbGljYXRlOyB9KTsKICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgIHRvYXN0KCfwn5SAIE1lcmdlZCAnICsgbWVyZ2VkICsgJyBkdXBsaWNhdGVzIOKAlCBhdmcgcG9zaXRpb24sIHN1bW1lZCBpbXByZXNzaW9ucycpOwogIH0gZWxzZSB7CiAgICB0b2FzdCgn4pyTIE5vIGR1cGxpY2F0ZXMgZm91bmQnKTsKICB9Cn0KCi8vIOKUgOKUgCBTaXRlbWFwICsgR1NDIOKAlCBncm91cCBpbnRvOiBpbiBHU0MgLyBub3QgaW4gR1NDIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAoKZnVuY3Rpb24gYWRkU2VsZWN0ZWRTaXRlbWFwVXJscygpewogIHZhciBzZWxlY3RlZCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2I6Y2hlY2tlZCcpKS5tYXAoZnVuY3Rpb24oY2IpeyByZXR1cm4gY2IuZGF0YXNldC51cmw7IH0pOwogIGlmKCFzZWxlY3RlZC5sZW5ndGgpeyB0b2FzdCgn4pqgIE5vIFVSTHMgc2VsZWN0ZWQnKTsgcmV0dXJuOyB9CiAgdmFyIGFkZGVkPTAsIHNraXBwZWQ9MDsKICBzZWxlY3RlZC5mb3JFYWNoKGZ1bmN0aW9uKHVybCl7CiAgICBpZihwYWdlcy5maW5kKGZ1bmN0aW9uKHApeyByZXR1cm4gcC51cmw9PT11cmw7IH0pKXsgc2tpcHBlZCsrOyByZXR1cm47IH0KICAgIC8vIENoZWNrIGlmIEdTQyBkYXRhIGF2YWlsYWJsZSBmcm9tIHBhZ2VzIGFscmVhZHkgaW1wb3J0ZWQKICAgIHZhciBnc2NFbnRyeSA9IF9nc2NEYXRhTWFwICYmIF9nc2NEYXRhTWFwW3VybF07CiAgICBpZihnc2NFbnRyeSl7CiAgICAgIHZhciBucCA9IG1ha2VQYWdlKHVybCwnJyxnc2NFbnRyeS5wcmksZ3NjRW50cnkucG9zLGdzY0VudHJ5LmltcHIpOwogICAgICBucC5jdHIgPSBnc2NFbnRyeS5jdHI7CiAgICAgIHBhZ2VzLnB1c2gobnApOwogICAgfSBlbHNlIHsKICAgICAgcGFnZXMucHVzaChtYWtlUGFnZSh1cmwsJycsJ2xvdycsMCwwKSk7CiAgICB9CiAgICBhZGRlZCsrOwogIH0pOwogIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFByZXZpZXcnKS5zdHlsZS5kaXNwbGF5PSdub25lJzsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFVybCcpLnZhbHVlPScnOwogIF9zaXRlbWFwVXJscz1bXTsgX3NpdGVtYXBGaWx0ZXJlZD1bXTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpLnRleHRDb250ZW50PScnOwogIHRvYXN0KCfinIUgJythZGRlZCsnIHBhZ2VzIGFkZGVkJysoc2tpcHBlZD8nIMK3ICcrc2tpcHBlZCsnIGFscmVhZHkgcHJlc2VudCc6JycpKTsKfQoKLy8gR2xvYmFsIEdTQyBkYXRhIG1hcCBmb3IgY3Jvc3MtcmVmZXJlbmNpbmcKdmFyIF9nc2NEYXRhTWFwID0ge307CgovLyBCdWlsZCBHU0MgbWFwIGZyb20gaW1wb3J0ZWQgcGFnZXMKZnVuY3Rpb24gYnVpbGRHc2NNYXAoKXsKICBfZ3NjRGF0YU1hcCA9IHt9OwogIHBhZ2VzLmZvckVhY2goZnVuY3Rpb24ocCl7CiAgICBpZihwLnBvc2l0aW9uPjAgfHwgcC5pbXByZXNzaW9ucz4wKXsKICAgICAgX2dzY0RhdGFNYXBbcC51cmxdID0ge3BvczpwLnBvc2l0aW9uLCBpbXByOnAuaW1wcmVzc2lvbnMsIGN0cjpwLmN0cnx8MCwgcHJpOnAucHJpb3JpdHl9OwogICAgfQogIH0pOwp9CgovLyDilIDilIAgTWFpbiBmaWx0ZXI6IHNob3cgc2l0ZW1hcCBVUkxzIGluIHR3byBncm91cHMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACmZ1bmN0aW9uIGZpbHRlclNpdGVtYXBCeUdTQygpewogIGJ1aWxkR3NjTWFwKCk7CiAgdmFyIGdzY1VybHMgPSBPYmplY3Qua2V5cyhfZ3NjRGF0YU1hcCk7CiAgaWYoIWdzY1VybHMubGVuZ3RoKXsKICAgIHRvYXN0KCfimqAgSW1wb3J0ZWVyIGVlcnN0IGplIEdTQyBDU1Yg4oCUIGRhbiB3b3JkdCBkZSB2ZXJnZWxpamtpbmcgZ2VtYWFrdCcpOwogICAgcmV0dXJuOwogIH0KICB2YXIgaW5HU0MgICAgPSBfc2l0ZW1hcFVybHMuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gX2dzY0RhdGFNYXBbdV07IH0pOwogIHZhciBub3RJbkdTQyA9IF9zaXRlbWFwVXJscy5maWx0ZXIoZnVuY3Rpb24odSl7IHJldHVybiAhX2dzY0RhdGFNYXBbdV07IH0pOwoKICByZW5kZXJTaXRlbWFwR3JvdXBlZChpbkdTQywgbm90SW5HU0MpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU3RhdHVzJykuaW5uZXJIVE1MID0KICAgICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7wn5+iICcraW5HU0MubGVuZ3RoKycgaW4gR1NDPC9zcGFuPicKICAgICsnICZuYnNwOyA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ29sZCkiPvCfn6EgJytub3RJbkdTQy5sZW5ndGgrJyBub3QgaW4gR1NDIChub3QgaW5kZXhlZCAvIG5ldyk8L3NwYW4+JwogICAgKycgJm5ic3A7IDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1zdWIpIj4nK19zaXRlbWFwVXJscy5sZW5ndGgrJyB0b3RhYWw8L3NwYW4+JzsKfQoKZnVuY3Rpb24gcmVuZGVyU2l0ZW1hcEdyb3VwZWQoaW5HU0MsIG5vdEluR1NDKXsKICB2YXIgbGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwVXJsTGlzdCcpOwogIHZhciBzZWxDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU2VsQ291bnQnKTsKCiAgZnVuY3Rpb24gcm93SHRtbCh1LCBkZWZhdWx0Q2hlY2tlZCwgZ3NjRGF0YSl7CiAgICB2YXIgc2hvcnRVcmwgPSB1LnJlcGxhY2UoL15odHRwcz86XFwvXFwvW14vXSsvLCcnKSB8fCAnLyc7CiAgICB2YXIgZ3NjSW5mbyA9IGdzY0RhdGEKICAgICAgPyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtjb2xvcjp2YXIoLS1ncmVlbik7bWFyZ2luLWxlZnQ6NnB4OyI+cG9zICcrTWF0aC5yb3VuZChnc2NEYXRhLnBvcykrKGdzY0RhdGEuaW1wcj8nIMK3ICcrZ3NjRGF0YS5pbXByLnRvTG9jYWxlU3RyaW5nKCkrJyBpbXByJzonJykrJzwvc3Bhbj4nCiAgICAgIDogJzxzcGFuIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tZ29sZCk7bWFyZ2luLWxlZnQ6NnB4OyI+bm90IGluIEdTQzwvc3Bhbj4nOwogICAgcmV0dXJuICc8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo3cHg7cGFkZGluZzo1cHggOHB4O2JvcmRlci1yYWRpdXM6NHB4O2N1cnNvcjpwb2ludGVyOyIgb25jbGljaz0idGhpcy5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpLmNsaWNrKCkiPicKICAgICAgKyc8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJzaXRlbWFwLWNiIiBkYXRhLXVybD0iJyt1KyciJysoZGVmYXVsdENoZWNrZWQ/JyBjaGVja2VkJzonJykrJyBvbmNsaWNrPSJldmVudC5zdG9wUHJvcGFnYXRpb24oKTt1cGRhdGVTaXRlbWFwQ291bnQoKSIgc3R5bGU9IndpZHRoOjEzcHg7aGVpZ2h0OjEzcHg7YWNjZW50LWNvbG9yOnZhcigtLWdvbGQpO2ZsZXgtc2hyaW5rOjA7Ij4nCiAgICAgICsnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tYmx1ZSk7ZmxleDoxO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO3doaXRlLXNwYWNlOm5vd3JhcDsiIHRpdGxlPSInK3UrJyI+JytzaG9ydFVybCsnPC9zcGFuPicKICAgICAgK2dzY0luZm8KICAgICAgKyc8YnV0dG9uIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3JlbW92ZVNpdGVtYXBVcmwoJycrdSsnJykiIHN0eWxlPSJiYWNrZ3JvdW5kOm5vbmU7Ym9yZGVyOm5vbmU7Y29sb3I6dmFyKC0tZGltKTtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTFweDtwYWRkaW5nOjAgNHB4O2ZsZXgtc2hyaW5rOjA7IiB0aXRsZT0iUmVtb3ZlIj7inJU8L2J1dHRvbj4nCiAgICAgICsnPC9kaXY+JzsKICB9CgogIHZhciBodG1sID0gJyc7CgogIC8vIEdyb3VwIDEg4oCUIGluIEdTQwogIGlmKGluR1NDLmxlbmd0aCl7CiAgICAvLyBTb3J0IGJ5IG9wcG9ydHVuaXR5OiBwb3MgMTEtMzAgZmlyc3QKICAgIGluR1NDLnNvcnQoZnVuY3Rpb24oYSxiKXsKICAgICAgdmFyIHBhID0gX2dzY0RhdGFNYXBbYV0/LnBvcyB8fCA5OTk7CiAgICAgIHZhciBwYiA9IF9nc2NEYXRhTWFwW2JdPy5wb3MgfHwgOTk5OwogICAgICB2YXIgc2NvcmVBID0gKHBhPj0xMSYmcGE8PTMwKT8wOihwYT49MSYmcGE8PTEwKT8xOihwYT4zMCYmcGE8PTYwKT8yOjM7CiAgICAgIHZhciBzY29yZUIgPSAocGI+PTExJiZwYjw9MzApPzA6KHBiPj0xJiZwYjw9MTApPzE6KHBiPjMwJiZwYjw9NjApPzI6MzsKICAgICAgcmV0dXJuIHNjb3JlQS1zY29yZUIgfHwgcGEtcGI7CiAgICB9KTsKICAgIGh0bWwgKz0gJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1ncmVlbik7cGFkZGluZzo4cHggOHB4IDRweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCByZ2JhKDc0LDIyMiwxMjgsLjIpO21hcmdpbi1ib3R0b206NHB4OyI+JwogICAgICArJ/Cfn6IgSW4gR1NDIOKAlCAnK2luR1NDLmxlbmd0aCsnIHBhZ2VzIChzb3J0ZWQgYnkgb3Bwb3J0dW5pdHkpJwogICAgICArJzwvZGl2Pic7CiAgICBodG1sICs9IGluR1NDLm1hcChmdW5jdGlvbih1KXsgcmV0dXJuIHJvd0h0bWwodSwgdHJ1ZSwgX2dzY0RhdGFNYXBbdV0pOyB9KS5qb2luKCcnKTsKICB9CgogIC8vIEdyb3VwIDIg4oCUIG5vdCBpbiBHU0MKICBpZihub3RJbkdTQy5sZW5ndGgpewogICAgaHRtbCArPSAnPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLWdvbGQpO3BhZGRpbmc6MTJweCA4cHggNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMik7bWFyZ2luLWJvdHRvbTo0cHg7bWFyZ2luLXRvcDo4cHg7Ij4nCiAgICAgICsn8J+foSBOb3QgaW4gR1NDIOKAlCAnK25vdEluR1NDLmxlbmd0aCsnIHBhZ2VzIChub3QgaW5kZXhlZCBvciBuZXcpJwogICAgICArJzwvZGl2PicKICAgICAgKyc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tc3ViKTtwYWRkaW5nOjJweCA4cHggOHB4OyI+R29vZ2xlIGRvZXMgbm90IGtub3cgdGhlc2UgcGFnZXMgeWV0LiBBZGQgdGhlbSB0byBpbnZlc3RpZ2F0ZSB3aHkuPC9kaXY+JzsKICAgIGh0bWwgKz0gbm90SW5HU0MubWFwKGZ1bmN0aW9uKHUpeyByZXR1cm4gcm93SHRtbCh1LCBmYWxzZSwgbnVsbCk7IH0pLmpvaW4oJycpOwogIH0KCiAgbGlzdC5pbm5lckhUTUwgPSBodG1sIHx8ICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWRpbSk7cGFkZGluZzo4cHg7Ij5ObyBVUkxzIGZvdW5kLjwvZGl2Pic7CiAgdXBkYXRlU2l0ZW1hcENvdW50KCk7Cn0KCgovLyDilIDilIAgU2l0ZW1hcCBmZXRjaCArIHByZXZpZXcg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACnZhciBfc2l0ZW1hcFVybHMgPSBbXTsgLy8gYWxsIGZldGNoZWQgVVJMcwp2YXIgX3NpdGVtYXBGaWx0ZXJlZCA9IFtdOyAvLyBhZnRlciBmaWx0ZXIKCmFzeW5jIGZ1bmN0aW9uIGZldGNoU2l0ZW1hcCgpIHsKICB2YXIgdXJsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBVcmwnKS52YWx1ZS50cmltKCk7CiAgaWYgKCF1cmwpIHsgdG9hc3QoJ+KaoCBWb2VyIGVlbiBzaXRlbWFwIFVSTCBpbicpOyByZXR1cm47IH0KICBpZiAoIXVybC5zdGFydHNXaXRoKCdodHRwJykpIHVybCA9ICdodHRwczovLycgKyB1cmw7CgogIHZhciBidG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcEJ0bicpOwogIHZhciBzdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpOwogIGJ0bi50ZXh0Q29udGVudCA9ICfij7MgRmV0Y2hpbmcuLi4nOwogIGJ0bi5kaXNhYmxlZCA9IHRydWU7CiAgc3RhdHVzLnRleHRDb250ZW50ID0gJ0ZldGNoaW5nIHNpdGVtYXAgdmlhIHNlcnZlci4uLic7CiAgc3RhdHVzLnN0eWxlLmNvbG9yID0gJ3ZhcigtLW11dGVkKSc7CgogIHRyeSB7CiAgICAvLyBVc2UgUmFpbHdheSBzZXJ2ZXIgYXMgcHJveHkgdG8gYXZvaWQgQ09SUwogICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3NpdGVtYXAvdXJscycsIHsKICAgICAgbWV0aG9kOiAnUE9TVCcsCiAgICAgIGhlYWRlcnM6IHsnQ29udGVudC1UeXBlJzonYXBwbGljYXRpb24vanNvbid9LAogICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7dXJsOiB1cmx9KQogICAgfSk7CiAgICB2YXIgZCA9IGF3YWl0IHIuanNvbigpOwoKICAgIGlmICghZC5zdWNjZXNzIHx8ICFkLnVybHMgfHwgIWQudXJscy5sZW5ndGgpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGQuZXJyb3IgfHwgJ0dlZW4gVVJMcyBnZXZvbmRlbiBpbiBzaXRlbWFwJyk7CiAgICB9CgogICAgX3NpdGVtYXBVcmxzID0gZC51cmxzOwogICAgX3NpdGVtYXBGaWx0ZXJlZCA9IGQudXJscy5zbGljZSgpOwogICAgc3RhdHVzLmlubmVySFRNTCA9ICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7inJMgJyArIGQudG90YWwgKyAnIFVSTHMgZ2V2b25kZW48L3NwYW4+JzsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwUHJldmlldycpLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOwogICAgcmVuZGVyU2l0ZW1hcExpc3QoX3NpdGVtYXBGaWx0ZXJlZCwgdHJ1ZSk7CiAgICB0b2FzdCgn4pyFICcgKyBkLnRvdGFsICsgJyBVUkxzIGxvYWRlZCBmcm9tIHNpdGVtYXAnKTsKCiAgfSBjYXRjaChlKSB7CiAgICBzdGF0dXMuaW5uZXJIVE1MID0gJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1yZWQpIj7imqAgJyArIGUubWVzc2FnZSArICc8L3NwYW4+JzsKICAgIHRvYXN0KCfimqAgU2l0ZW1hcCBmZXRjaCBtaXNsdWt0OiAnICsgZS5tZXNzYWdlKTsKICB9CgogIGJ0bi50ZXh0Q29udGVudCA9ICfihpMgRmV0Y2ggU2l0ZW1hcCc7CiAgYnRuLmRpc2FibGVkID0gZmFsc2U7Cn0KCmZ1bmN0aW9uIGZpbHRlclNpdGVtYXBVcmxzKCkgewogIHZhciBxID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBGaWx0ZXInKS52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsKICBfc2l0ZW1hcEZpbHRlcmVkID0gcQogICAgPyBfc2l0ZW1hcFVybHMuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gdS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpOyB9KQogICAgOiBfc2l0ZW1hcFVybHMuc2xpY2UoKTsKCiAgLy8gUHJlc2VydmUgY2hlY2tlZCBzdGF0ZQogIHZhciBjaGVja2VkID0ge307CiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2InKS5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsKICAgIGNoZWNrZWRbY2IuZGF0YXNldC51cmxdID0gY2IuY2hlY2tlZDsKICB9KTsKICByZW5kZXJTaXRlbWFwTGlzdChfc2l0ZW1hcEZpbHRlcmVkLCBmYWxzZSwgY2hlY2tlZCk7Cn0KCmZ1bmN0aW9uIHJlbmRlclNpdGVtYXBMaXN0KHVybHMsIHNlbGVjdEFsbCwgcHJlc2VydmVDaGVja2VkKSB7CiAgdmFyIGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFVybExpc3QnKTsKICB2YXIgc2VsQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFNlbENvdW50Jyk7CgogIGlmICghdXJscy5sZW5ndGgpIHsKICAgIGxpc3QuaW5uZXJIVE1MID0gJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tZGltKTtwYWRkaW5nOjhweDsiPkdlZW4gVVJMcyBnZXZvbmRlbiB2b29yIGRpdCBmaWx0ZXIuPC9kaXY+JzsKICAgIHNlbENvdW50LnRleHRDb250ZW50ID0gJyc7CiAgICByZXR1cm47CiAgfQoKICBsaXN0LmlubmVySFRNTCA9IHVybHMubWFwKGZ1bmN0aW9uKHUpIHsKICAgIHZhciBzaG9ydFVybCA9IHUucmVwbGFjZSgvXmh0dHBzPzpcXC9cXC9bXi9dKy8sICcnKSB8fCAnLyc7CiAgICB2YXIgaXNDaGVja2VkID0gcHJlc2VydmVDaGVja2VkID8gKHByZXNlcnZlQ2hlY2tlZFt1XSAhPT0gZmFsc2UpIDogKHNlbGVjdEFsbCAhPT0gZmFsc2UpOwogICAgLy8gU2tpcCBob21lcGFnZSwgWE1MLCBpbWFnZXMgYnkgZGVmYXVsdAogICAgdmFyIHNraXAgPSB1LmVuZHNXaXRoKCcueG1sJykgfHwgdS5lbmRzV2l0aCgnLmpwZycpIHx8IHUuZW5kc1dpdGgoJy5wbmcnKSB8fCB1LmVuZHNXaXRoKCcucGRmJyk7CiAgICBpZiAoc2tpcCkgaXNDaGVja2VkID0gZmFsc2U7CiAgICByZXR1cm4gJzxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjVweCA4cHg7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7IiBvbmNsaWNrPSJ0aGlzLnF1ZXJ5U2VsZWN0b3IoJnF1b3Q7aW5wdXQmcXVvdDspLmNsaWNrKCkiPicKICAgICAgKyAnPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0ic2l0ZW1hcC1jYiIgZGF0YS11cmw9IicrdSsnIicrKGlzQ2hlY2tlZD8nIGNoZWNrZWQnOicnKSsnIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3VwZGF0ZVNpdGVtYXBDb3VudCgpIiBzdHlsZT0id2lkdGg6MTNweDtoZWlnaHQ6MTNweDthY2NlbnQtY29sb3I6dmFyKC0tZ29sZCk7ZmxleC1zaHJpbms6MDsiPicKICAgICAgKyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tYmx1ZSk7ZmxleDoxO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO3doaXRlLXNwYWNlOm5vd3JhcDsiIHRpdGxlPSInK3UrJyI+JytzaG9ydFVybCsnPC9zcGFuPicKICAgICAgKyAnPGJ1dHRvbiBvbmNsaWNrPSJldmVudC5zdG9wUHJvcGFnYXRpb24oKTtyZW1vdmVTaXRlbWFwVXJsKCcnK3UrJycpIiBzdHlsZT0iYmFja2dyb3VuZDpub25lO2JvcmRlcjpub25lO2NvbG9yOnZhcigtLWRpbSk7Y3Vyc29yOnBvaW50ZXI7Zm9udC1zaXplOjExcHg7cGFkZGluZzowIDRweDtmbGV4LXNocmluazowOyIgdGl0bGU9IlJlbW92ZSI+4pyVPC9idXR0b24+JwogICAgICArICc8L2Rpdj4nOwogIH0pLmpvaW4oJycpOwoKICB1cGRhdGVTaXRlbWFwQ291bnQoKTsKfQoKZnVuY3Rpb24gdXBkYXRlU2l0ZW1hcENvdW50KCkgewogIHZhciBhbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuc2l0ZW1hcC1jYicpOwogIHZhciBjaGVja2VkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2I6Y2hlY2tlZCcpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU2VsQ291bnQnKS50ZXh0Q29udGVudCA9IGNoZWNrZWQubGVuZ3RoICsgJy8nICsgYWxsLmxlbmd0aCArICcgc2VsZWN0ZWQnOwp9CgpmdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNpdGVtYXBVcmxzKCkgewogIHZhciBzZWxlY3RlZCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2I6Y2hlY2tlZCcpKS5tYXAoZnVuY3Rpb24oY2IpeyByZXR1cm4gY2IuZGF0YXNldC51cmw7IH0pOwogIGlmICghc2VsZWN0ZWQubGVuZ3RoKSB7IHRvYXN0KCfimqAgTm8gVVJMcyBzZWxlY3RlZCcpOyByZXR1cm47IH0KICBpZiAoIWNvbmZpcm0oJ0RlbGV0ZSAnICsgc2VsZWN0ZWQubGVuZ3RoICsgJyBzZWxlY3RlZCBVUkxzIGZyb20gdGhlIGxpc3Q/JykpIHJldHVybjsKICBfc2l0ZW1hcFVybHMgPSBfc2l0ZW1hcFVybHMuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gIXNlbGVjdGVkLmluY2x1ZGVzKHUpOyB9KTsKICBfc2l0ZW1hcEZpbHRlcmVkID0gX3NpdGVtYXBGaWx0ZXJlZC5maWx0ZXIoZnVuY3Rpb24odSl7IHJldHVybiAhc2VsZWN0ZWQuaW5jbHVkZXModSk7IH0pOwogIHJlbmRlclNpdGVtYXBMaXN0KF9zaXRlbWFwRmlsdGVyZWQsIGZhbHNlKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpLmlubmVySFRNTCA9ICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7inJMgJyArIF9zaXRlbWFwVXJscy5sZW5ndGggKyAnIFVSTHMgcmVtYWluaW5nPC9zcGFuPic7CiAgdG9hc3QoJ/Cfl5EgJyArIHNlbGVjdGVkLmxlbmd0aCArICcgVVJMcyByZW1vdmVkJyk7CiAgaWYgKCFfc2l0ZW1hcFVybHMubGVuZ3RoKSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFByZXZpZXcnKS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOwp9CgpmdW5jdGlvbiBjbGVhckFsbFNpdGVtYXBVcmxzKCkgewogIGlmICghX3NpdGVtYXBVcmxzLmxlbmd0aCkgcmV0dXJuOwogIGlmICghY29uZmlybSgnQ2xlYXIgYWxsICcgKyBfc2l0ZW1hcFVybHMubGVuZ3RoICsgJyBVUkxzIGZyb20gdGhlIGxpc3Q/JykpIHJldHVybjsKICBfc2l0ZW1hcFVybHMgPSBbXTsgX3NpdGVtYXBGaWx0ZXJlZCA9IFtdOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwUHJldmlldycpLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBVcmwnKS52YWx1ZSA9ICcnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU3RhdHVzJykudGV4dENvbnRlbnQgPSAnJzsKICB0b2FzdCgn4pyVIFNpdGVtYXAgY2xlYXJlZCcpOwp9CgpmdW5jdGlvbiBzZWxlY3RBbGxTaXRlbWFwKCkgewogIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiJykuZm9yRWFjaChmdW5jdGlvbihjYil7IGNiLmNoZWNrZWQgPSB0cnVlOyB9KTsKICB1cGRhdGVTaXRlbWFwQ291bnQoKTsKfQoKZnVuY3Rpb24gZGVzZWxlY3RBbGxTaXRlbWFwKCkgewogIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiJykuZm9yRWFjaChmdW5jdGlvbihjYil7IGNiLmNoZWNrZWQgPSBmYWxzZTsgfSk7CiAgdXBkYXRlU2l0ZW1hcENvdW50KCk7Cn0KCmZ1bmN0aW9uIHJlbW92ZVNpdGVtYXBVcmwodXJsKSB7CiAgX3NpdGVtYXBVcmxzID0gX3NpdGVtYXBVcmxzLmZpbHRlcihmdW5jdGlvbih1KXsgcmV0dXJuIHUgIT09IHVybDsgfSk7CiAgX3NpdGVtYXBGaWx0ZXJlZCA9IF9zaXRlbWFwRmlsdGVyZWQuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gdSAhPT0gdXJsOyB9KTsKICB2YXIgcHJlc2VydmVkID0ge307CiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2InKS5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsKICAgIHByZXNlcnZlZFtjYi5kYXRhc2V0LnVybF0gPSBjYi5jaGVja2VkOwogIH0pOwogIHJlbmRlclNpdGVtYXBMaXN0KF9zaXRlbWFwRmlsdGVyZWQsIGZhbHNlLCBwcmVzZXJ2ZWQpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU3RhdHVzJykuaW5uZXJIVE1MID0gJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tdXRlZCkiPicgKyBfc2l0ZW1hcFVybHMubGVuZ3RoICsgJyBVUkxzIHJlc3RlcmVuZDwvc3Bhbj4nOwp9CgpmdW5jdGlvbiBhZGRTZWxlY3RlZFNpdGVtYXBVcmxzKCkgewogIHZhciBzZWxlY3RlZCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2I6Y2hlY2tlZCcpKS5tYXAoZnVuY3Rpb24oY2IpeyByZXR1cm4gY2IuZGF0YXNldC51cmw7IH0pOwogIGlmICghc2VsZWN0ZWQubGVuZ3RoKSB7IHRvYXN0KCfimqAgTm8gVVJMcyBzZWxlY3RlZCcpOyByZXR1cm47IH0KICB2YXIgYWRkZWQgPSAwOwogIHNlbGVjdGVkLmZvckVhY2goZnVuY3Rpb24odXJsKXsKICAgIHZhciBleGlzdHMgPSBwYWdlcy5maW5kKGZ1bmN0aW9uKHApeyByZXR1cm4gcC51cmwgPT09IHVybDsgfSk7CiAgICBpZiAoIWV4aXN0cykgeyBwYWdlcy5wdXNoKG1ha2VQYWdlKHVybCwnJywnbWVkJywwLDApKTsgYWRkZWQrKzsgfQogIH0pOwogIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFByZXZpZXcnKS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwVXJsJykudmFsdWUgPSAnJzsKICBfc2l0ZW1hcFVybHMgPSBbXTsKICBfc2l0ZW1hcEZpbHRlcmVkID0gW107CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBTdGF0dXMnKS50ZXh0Q29udGVudCA9ICcnOwogIHRvYXN0KCfinIUgJyArIGFkZGVkICsgJyBwYWdlcyBhZGRlZCAoJyArIChzZWxlY3RlZC5sZW5ndGggLSBhZGRlZCkgKyAnIGFscmVhZHkgcHJlc2VudCknKTsKfQoKLy8g4pSA4pSAIFNlcnZlciBzeW5jICsgYXV0by1zYXZlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAp2YXIgX2F1dG9TYXZlVGltZXIgPSBudWxsOwp2YXIgX2xhc3RTYXZlZEhhc2ggPSAnJzsKCmZ1bmN0aW9uIF9kYXRhSGFzaCgpewogIC8vIFNpbXBsZSBoYXNoIHRvIGRldGVjdCBjaGFuZ2VzCiAgcmV0dXJuIHBhZ2VzLmxlbmd0aCArICdfJyArIChwYWdlc1swXT8udXBkYXRlZHx8JycpICsgJ18nICsgKHBhZ2VzW3BhZ2VzLmxlbmd0aC0xXT8udXBkYXRlZHx8JycpOwp9Cgphc3luYyBmdW5jdGlvbiBzeW5jVG9TZXJ2ZXIoc2lsZW50KXsKICBpZighcGFnZXMubGVuZ3RoKSByZXR1cm47CiAgdmFyIGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzeW5jQnRuJyk7CiAgaWYoYnRuICYmICFzaWxlbnQpeyBidG4udGV4dENvbnRlbnQ9J+KYgSBTYXZpbmcuLi4nOyBidG4uZGlzYWJsZWQ9dHJ1ZTsgfQoKICB2YXIga2V5ID0gKHByb2plY3QuY2xpZW50fHwnZGVmYXVsdCcpLnJlcGxhY2UoL1xccysvZywnLScpLnRvTG93ZXJDYXNlKCkKICAgICsgJy0nICsgKHByb2plY3Quc2l0ZXx8JycpLnJlcGxhY2UoL2h0dHBzPzpcXC9cXC8vLCcnKS5zcGxpdCgnLycpWzBdLnJlcGxhY2UoL1xccysvZywnLScpOwogIGlmKCFrZXkgfHwga2V5ID09PSAnLScpIGtleSA9ICd3b3JrZmxvdy0nICsgRGF0ZS5ub3coKTsKCiAgdmFyIHBheWxvYWQgPSB7IGtleSwgcHJvamVjdCwgcGFnZXMsIHNhdmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9OwoKICB0cnkgewogICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3dvcmtmbG93L3NhdmUnLCB7CiAgICAgIG1ldGhvZDogJ1BPU1QnLAogICAgICBoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nfSwKICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkKICAgIH0pOwogICAgdmFyIGQgPSBhd2FpdCByLmpzb24oKTsKICAgIGlmKGQuc3VjY2Vzcyl7CiAgICAgIF9sYXN0U2F2ZWRIYXNoID0gX2RhdGFIYXNoKCk7CiAgICAgIHZhciB0cyA9IG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCdubC1OTCcse2hvdXI6JzItZGlnaXQnLG1pbnV0ZTonMi1kaWdpdCd9KTsKICAgICAgc2V0U3luY1N0YXR1cygn4piBIE9wZ2VzbGFnZW4gb20gJyArIHRzICsgJyDigJQga2V5OiAnICsga2V5LCAndmFyKC0tZ3JlZW4pJyk7CiAgICAgIHRyeXsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NzX3dmX3N5bmNfa2V5Jywga2V5KTsgfWNhdGNoKGUpe30KICAgICAgaWYoIXNpbGVudCkgdG9hc3QoJ+KYgSBPcGdlc2xhZ2VuIG9wIHNlcnZlcicpOwogICAgfSBlbHNlIHsKICAgICAgc2V0U3luY1N0YXR1cygn4pqgIFNlcnZlciBzYXZlIG1pc2x1a3Qg4oCUIGRhdGEgc3RhYXQgaW4gYnJvd3NlcicsICd2YXIoLS1nb2xkKScpOwogICAgfQogIH0gY2F0Y2goZSkgewogICAgc2V0U3luY1N0YXR1cygn4pqgIFNlcnZlciBuaWV0IGJlcmVpa2JhYXIg4oCUIGRhdGEgc3RhYXQgaW4gYnJvd3NlcicsICd2YXIoLS1nb2xkKScpOwogICAgaWYoIXNpbGVudCkgdG9hc3QoJ+KaoCBTZXJ2ZXIgb2ZmbGluZSDigJQgYnJvd3NlciBiYWNrdXAgYWN0aWVmJyk7CiAgfQogIGlmKGJ0biAmJiAhc2lsZW50KXsgYnRuLnRleHRDb250ZW50PSfimIEgU2F2ZSB0byBTZXJ2ZXInOyBidG4uZGlzYWJsZWQ9ZmFsc2U7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZEZyb21TZXJ2ZXIoKXsKICB2YXIga2V5ID0gcHJvbXB0KCdQcm9qZWN0IGtleSAobGVlZyA9IGxhYXRzdGUgb3BnZXNsYWdlbik6Jyk7CiAgaWYoa2V5ID09PSBudWxsKSByZXR1cm47CiAgaWYoIWtleSl7CiAgICB0cnl7IGtleSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjc193Zl9zeW5jX2tleScpfHwnJzsgfWNhdGNoKGUpe30KICB9CiAgaWYoIWtleSl7IHRvYXN0KCfimqAgR2VlbiBrZXkgZ2V2b25kZW4nKTsgcmV0dXJuOyB9CiAgdHJ5IHsKICAgIHZhciByID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBwLmNvbnRlbnRzY2FsZS5zaXRlL2FwaS93b3JrZmxvdy9sb2FkP2tleT0nK2VuY29kZVVSSUNvbXBvbmVudChrZXkpKTsKICAgIHZhciBkID0gYXdhaXQgci5qc29uKCk7CiAgICBpZihkLnN1Y2Nlc3MgJiYgZC5kYXRhKXsKICAgICAgaWYoIWNvbmZpcm0oJ1dvcmtmbG93ICInK2tleSsnIiBsYWRlbj8gVmVydmFuZ3QgaHVpZGlnZSBkYXRhLicpKSByZXR1cm47CiAgICAgIGlmKGQuZGF0YS5wcm9qZWN0KSBwcm9qZWN0ID0gZC5kYXRhLnByb2plY3Q7CiAgICAgIGlmKGQuZGF0YS5wYWdlcykgICBwYWdlcyAgID0gZC5kYXRhLnBhZ2VzOwogICAgICBpZihwcm9qZWN0LmNsaWVudCkgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncENsaWVudCcpLnZhbHVlICAgPSBwcm9qZWN0LmNsaWVudDsKICAgICAgaWYocHJvamVjdC5zaXRlKSAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BTaXRlJykudmFsdWUgICAgID0gcHJvamVjdC5zaXRlOwogICAgICBpZihwcm9qZWN0LmRlYWRsaW5lKSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncERlYWRsaW5lJykudmFsdWUgPSBwcm9qZWN0LmRlYWRsaW5lOwogICAgICBpZihwcm9qZWN0LmF1ZGl0b3IpICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncEF1ZGl0b3InKS52YWx1ZSAgPSBwcm9qZWN0LmF1ZGl0b3I7CiAgICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgICAgdmFyIHRzID0gbmV3IERhdGUoZC5kYXRhLnNhdmVkQXR8fERhdGUubm93KCkpLnRvTG9jYWxlU3RyaW5nKCdubC1OTCcpOwogICAgICBzZXRTeW5jU3RhdHVzKCfimIEgR2VsYWRlbiB2YW4gc2VydmVyIChvcGdlc2xhZ2VuOiAnK3RzKycpJywgJ3ZhcigtLWdyZWVuKScpOwogICAgICB0b2FzdCgn4pyFICcrcGFnZXMubGVuZ3RoKycgcGFnZXMgbG9hZGVkIGZyb20gc2VydmVyJyk7CiAgICB9IGVsc2UgewogICAgICB0b2FzdCgn4pqgIE5pZXQgZ2V2b25kZW46ICcra2V5KTsKICAgIH0KICB9IGNhdGNoKGUpeyB0b2FzdCgn4pqgIFNlcnZlciBuaWV0IGJlcmVpa2JhYXInKTsgfQp9CgpmdW5jdGlvbiBzZXRTeW5jU3RhdHVzKG1zZywgY29sb3IpewogIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzeW5jU3RhdHVzJyk7CiAgaWYoZWwpeyBlbC50ZXh0Q29udGVudD1tc2c7IGVsLnN0eWxlLmNvbG9yPWNvbG9yfHwndmFyKC0tZGltKSc7IH0KfQoKCi8vIOKUgOKUgCBDb250ZW50U2NvcmUgc2NhbiBwZXIgcGFnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKYXN5bmMgZnVuY3Rpb24gc2Nhbk9uZVBhZ2UocGFnZUlkKSB7CiAgdmFyIHAgPSBwYWdlcy5maW5kKGZ1bmN0aW9uKHBnKXsgcmV0dXJuIHBnLmlkID09PSBwYWdlSWQ7IH0pOwogIGlmICghcCkgcmV0dXJuOwogIHZhciBidG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbb25jbGljaz0ic2Nhbk9uZVBhZ2UoJycgKyBwYWdlSWQgKyAnJykiXScpOwogIGlmIChidG4pIHsgYnRuLnRleHRDb250ZW50ID0gJ+KPsyc7IGJ0bi5kaXNhYmxlZCA9IHRydWU7IH0KCiAgdHJ5IHsKICAgIHZhciByID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBwLmNvbnRlbnRzY2FsZS5zaXRlL2FwaS9zY2FuJywgewogICAgICBtZXRob2Q6ICdQT1NUJywKICAgICAgaGVhZGVyczogeydDb250ZW50LVR5cGUnOidhcHBsaWNhdGlvbi9qc29uJ30sCiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHt1cmw6IHAudXJsfSkKICAgIH0pOwogICAgdmFyIGQgPSBhd2FpdCByLmpzb24oKTsKICAgIGlmIChkLnNjb3JlKSB7CiAgICAgIGlmICghcC5zY29yZUJlZm9yZSkgewogICAgICAgIHAuc2NvcmVCZWZvcmUgPSBkLnNjb3JlOwogICAgICAgIHRvYXN0KCfinIUgUHJlLXNjYW46ICcgKyBkLnNjb3JlICsgJy8xMDAg4oCUICcgKyBwLnVybC5zcGxpdCgnLycpLnBvcCgpKTsKICAgICAgfSBlbHNlIHsKICAgICAgICBwLnNjb3JlQWZ0ZXIgPSBkLnNjb3JlOwogICAgICAgIHRvYXN0KCfinIUgTmEtc2NhbjogJyArIGQuc2NvcmUgKyAnLzEwMCDigJQgdmVyc2NoaWw6ICcgKyAoZC5zY29yZSAtIHAuc2NvcmVCZWZvcmUpKTsKICAgICAgfQogICAgICBzYXZlKCk7IHJlbmRlclBhZ2VzKCk7CiAgICB9IGVsc2UgewogICAgICB0b2FzdCgn4pqgIFNjYW4gbWlzbHVrdDogJyArIChkLmVycm9yIHx8ICdvbmJla2VuZGUgZm91dCcpKTsKICAgIH0KICB9IGNhdGNoKGUpIHsKICAgIHRvYXN0KCfimqAgU2VydmVyIG5pZXQgYmVyZWlrYmFhcjogJyArIGUubWVzc2FnZSk7CiAgfQogIGlmIChidG4pIHsgYnRuLnRleHRDb250ZW50ID0gJ/Cfk4ogU2NhbiBTY29yZSc7IGJ0bi5kaXNhYmxlZCA9IGZhbHNlOyB9Cn0KCi8vIOKUgOKUgCBTY2FuIGFsbGUgcGFnaW5hcyB6b25kZXIgc2NvcmUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACnZhciBfc2NhblF1ZXVlID0gW107CnZhciBfc2NhblJ1bm5pbmcgPSBmYWxzZTsKCmFzeW5jIGZ1bmN0aW9uIHNjYW5BbGxTY29yZXMoKSB7CiAgdmFyIHVuc2NvcmVkID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApeyByZXR1cm4gIXAuc2NvcmVCZWZvcmUgJiYgcC51cmw7IH0pOwogIHZhciBhbGwgPSBwYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7IHJldHVybiBwLnVybDsgfSk7CiAgLy8gSWYgYWxsIGhhdmUgc2NvcmVzLCBhc2sgaWYgdGhleSB3YW50IHRvIHJlc2NhbgogIGlmICghdW5zY29yZWQubGVuZ3RoICYmIGFsbC5sZW5ndGgpIHsKICAgIGlmICghY29uZmlybSgnQWxsIHBhZ2VzIGFscmVhZHkgaGF2ZSBhIHNjb3JlLiBSZS1zY2FuIGFsbCAnICsgYWxsLmxlbmd0aCArICcgcGFnZXM/JykpIHJldHVybjsKICAgIHVuc2NvcmVkID0gYWxsOyAvLyByZXNjYW4gYWxsCiAgfQogIGlmICghdW5zY29yZWQubGVuZ3RoKSB7IHRvYXN0KCdObyBwYWdlcyB3aXRoIFVSTHMgZm91bmQnKTsgcmV0dXJuOyB9CiAgaWYgKF9zY2FuUnVubmluZykgeyB0b2FzdCgn4o+zIFNjYW4gYWxyZWFkeSBydW5uaW5nLi4uJyk7IHJldHVybjsgfQogIF9zY2FuUXVldWUgPSB1bnNjb3JlZC5zbGljZSgpOwogIF9zY2FuUnVubmluZyA9IHRydWU7CiAgdG9hc3QoJ+KPsyBTY2FubmluZyAnICsgX3NjYW5RdWV1ZS5sZW5ndGggKyAnIHBhZ2VzLi4uJyk7CiAgc2V0U3luY1N0YXR1cygn4o+zIEF1dG8tc2NhbiBydW5uaW5nOiAwLycgKyBfc2NhblF1ZXVlLmxlbmd0aCArICcgcGFnZXMnLCAndmFyKC0tZ29sZCknKTsKCiAgdmFyIGRvbmUgPSAwOwogIGZvciAodmFyIGkgPSAwOyBpIDwgX3NjYW5RdWV1ZS5sZW5ndGg7IGkrKykgewogICAgdmFyIHAgPSBfc2NhblF1ZXVlW2ldOwogICAgdHJ5IHsKICAgICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3NjYW4nLCB7CiAgICAgICAgbWV0aG9kOiAnUE9TVCcsCiAgICAgICAgaGVhZGVyczogeydDb250ZW50LVR5cGUnOidhcHBsaWNhdGlvbi9qc29uJ30sCiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe3VybDogcC51cmx9KQogICAgICB9KTsKICAgICAgdmFyIGQgPSBhd2FpdCByLmpzb24oKTsKICAgICAgaWYgKGQuc2NvcmUpIHsgcC5zY29yZUJlZm9yZSA9IGQuc2NvcmU7IGRvbmUrKzsgfQogICAgfSBjYXRjaChlKSB7fQogICAgc2V0U3luY1N0YXR1cygn4o+zIFNjYW5uaW5nICcgKyAoaSsxKSArICcvJyArIF9zY2FuUXVldWUubGVuZ3RoICsgJyDigJQgJyArIGRvbmUgKyAnIHNjb3JlcyBmb3VuZCcsICd2YXIoLS1nb2xkKScpOwogICAgc2F2ZSgpOwogICAgYXdhaXQgbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzKXsgc2V0VGltZW91dChyZXMsIDIwMDApOyB9KTsgLy8gMnMgYmV0d2VlbiBzY2FucwogIH0KCiAgX3NjYW5SdW5uaW5nID0gZmFsc2U7CiAgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICBzZXRTeW5jU3RhdHVzKCfinIUgQXV0by1zY2FuIGNvbXBsZXRlIOKAlCAnICsgZG9uZSArICcgc2NvcmVzIGxvYWRlZCcsICd2YXIoLS1ncmVlbiknKTsKICB0b2FzdCgn4pyFICcgKyBkb25lICsgJy8nICsgX3NjYW5RdWV1ZS5sZW5ndGggKyAnIHBhZ2VzIHNjYW5uZWQnKTsKfQoKZnVuY3Rpb24gc3RhcnRBdXRvU2F2ZSgpewogIGlmKF9hdXRvU2F2ZVRpbWVyKSBjbGVhckludGVydmFsKF9hdXRvU2F2ZVRpbWVyKTsKICAvLyBBdXRvLXNhdmUgZXZlcnkgMyBtaW51dGVzIElGIGRhdGEgaGFzIGNoYW5nZWQKICBfYXV0b1NhdmVUaW1lciA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7CiAgICBpZihwYWdlcy5sZW5ndGggPiAwICYmIF9kYXRhSGFzaCgpICE9PSBfbGFzdFNhdmVkSGFzaCl7CiAgICAgIHN5bmNUb1NlcnZlcih0cnVlKTsgLy8gc2lsZW50ID0gbm8gdG9hc3QKICAgIH0KICB9LCAzICogNjAgKiAxMDAwKTsKICAvLyBBbHNvIHNhdmUgb24gcGFnZSB1bmxvYWQKICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgZnVuY3Rpb24oKXsKICAgIGlmKHBhZ2VzLmxlbmd0aCA+IDAgJiYgX2RhdGFIYXNoKCkgIT09IF9sYXN0U2F2ZWRIYXNoKXsKICAgICAgc3luY1RvU2VydmVyKHRydWUpOwogICAgfQogIH0pOwp9CgovLyDilIDilIAgSW5pdCDilIDilIAKbG9hZCgpOwpyZW5kZXJQYWdlcygpOwpyZW5kZXJPdmVydmlldygpOwpzdGFydEF1dG9TYXZlKCk7CmlmKHBhZ2VzLmxlbmd0aD4wKSBzZXRTeW5jU3RhdHVzKCdEYXRhIGluIGJyb3dzZXIg4oCUIGNsaWNrIOKYgSBTYXZlIHRvIFNlcnZlciB0byBiYWNrdXAnLCAndmFyKC0tZGltKScpOwo8L3NjcmlwdD4KPC9ib2R5Pgo8L2h0bWw+Cg==", "base64").toString("utf8"));
});
app.get('/audit-recommendations', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Buffer.from("PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9IlVURi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgo8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgsbm9mb2xsb3csbm9hcmNoaXZlIj4KPHRpdGxlPlNFTyBSZWNvbW1lbmRhdGlvbnMgfCBDb250ZW50U2NhbGU8L3RpdGxlPgo8bGluayBocmVmPSJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2NzczI/ZmFtaWx5PUJlYmFzK05ldWUmZmFtaWx5PURNK1NhbnM6d2dodEAzMDA7NDAwOzUwMDs3MDAmZmFtaWx5PUlCTStQbGV4K01vbm86d2dodEA0MDA7NzAwJmRpc3BsYXk9c3dhcCIgcmVsPSJzdHlsZXNoZWV0Ij4KPHN0eWxlPgoqLCo6OmJlZm9yZSwqOjphZnRlcntib3gtc2l6aW5nOmJvcmRlci1ib3g7bWFyZ2luOjA7cGFkZGluZzowfQo6cm9vdHsKICAtLWJnOiMwMzA3MTI7LS1jYXJkOiMwZjE3MmE7LS1zdXJmYWNlOiMxZTI5M2I7LS1ib3JkZXI6IzMzNDE1NTsKICAtLWluazojZjlmYWZiOy0tbXV0ZWQ6Izk0YTNiODstLXN1YjojNjQ3NDhiOy0tZGltOiM0NzU1Njk7CiAgLS1wdXJwbGU6I2E3OGJmYTstLWJsdWU6IzYwYTVmYTstLWdyZWVuOiM0YWRlODA7CiAgLS1nb2xkOiNmYmJmMjQ7LS1yZWQ6I2Y0M2YzZjstLW9yYW5nZTojZmI5MjNjOwp9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjttaW4taGVpZ2h0OjEwMHZoO30KLndyYXB7bWF4LXdpZHRoOjExMDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmc6MCAyMHB4IDgwcHg7fQoKLnRvcGJhcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6MTZweCAwO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7bWFyZ2luLWJvdHRvbToyNHB4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O30KLmJyYW5ke2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wNmVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLCNhNzhiZmEsIzYwYTVmYSk7LXdlYmtpdC1iYWNrZ3JvdW5kLWNsaXA6dGV4dDstd2Via2l0LXRleHQtZmlsbC1jb2xvcjp0cmFuc3BhcmVudDtiYWNrZ3JvdW5kLWNsaXA6dGV4dDt0ZXh0LWRlY29yYXRpb246bm9uZTt9Ci50b29sLXRpdGxle2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wNGVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLWdvbGQpLHZhcigtLW9yYW5nZSkpOy13ZWJraXQtYmFja2dyb3VuZC1jbGlwOnRleHQ7LXdlYmtpdC10ZXh0LWZpbGwtY29sb3I6dHJhbnNwYXJlbnQ7YmFja2dyb3VuZC1jbGlwOnRleHQ7fQouYnRue2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo3cHggMTRweDtib3JkZXItcmFkaXVzOjVweDtjdXJzb3I6cG9pbnRlcjtib3JkZXI6MXB4IHNvbGlkO3RyYW5zaXRpb246YWxsIC4xNXM7d2hpdGUtc3BhY2U6bm93cmFwO2JhY2tncm91bmQ6bm9uZTt0ZXh0LWRlY29yYXRpb246bm9uZTtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O30KLmJ0bi1tdXRlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlci1jb2xvcjp2YXIoLS1ib3JkZXIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5idG4tbXV0ZWQ6aG92ZXJ7Y29sb3I6dmFyKC0taW5rKTt9CgovKiBTdW1tYXJ5IGJhciAqLwouc3VtbWFyeXtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg0LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToyNHB4O30KQG1lZGlhKG1heC13aWR0aDo2MDBweCl7LnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnI7fX0KLnN1bS1jYXJke2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTRweCAxNnB4O3RleHQtYWxpZ246Y2VudGVyO30KLnN1bS1ue2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZTozNHB4O2xpbmUtaGVpZ2h0OjE7bWFyZ2luLWJvdHRvbTozcHg7fQouc3VtLWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7fQoKLyogRmlsdGVyICovCi5maWx0ZXItYmFye2Rpc3BsYXk6ZmxleDtnYXA6OHB4O21hcmdpbi1ib3R0b206MThweDtmbGV4LXdyYXA6d3JhcDt9Ci5maWx0ZXItYmFyIHNlbGVjdHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjdweCAxMXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDZlbTtjb2xvcjp2YXIoLS1tdXRlZCk7b3V0bGluZTpub25lO2N1cnNvcjpwb2ludGVyO30KLmZpbHRlci1iYXIgc2VsZWN0OmZvY3Vze2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKTtjb2xvcjp2YXIoLS1pbmspO30KCi8qIFJlY29tbWVuZGF0aW9uIGNhcmRzICovCi5yZWMtbGlzdHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoxMnB4O30KCi5yZWMtY2FyZHtib3JkZXItcmFkaXVzOjEycHg7b3ZlcmZsb3c6aGlkZGVuO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Ci5yZWMtY2FyZC50eXBlLXF1aWNrd2lue2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1ncmVlbik7fQoucmVjLWNhcmQudHlwZS1jdHJ7Ym9yZGVyLWxlZnQ6NHB4IHNvbGlkIHZhcigtLWJsdWUpO30KLnJlYy1jYXJkLnR5cGUtY29udGVudHtib3JkZXItbGVmdDo0cHggc29saWQgdmFyKC0tZ29sZCk7fQoucmVjLWNhcmQudHlwZS1yZXdyaXRle2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1vcmFuZ2UpO30KLnJlYy1jYXJkLnR5cGUtYXV0aG9yaXR5e2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1wdXJwbGUpO30KLnJlYy1jYXJkLnR5cGUtYnVpbGR7Ym9yZGVyLWxlZnQ6NHB4IHNvbGlkIHZhcigtLWRpbSk7fQoKLnJlYy1oZWFke2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7cGFkZGluZzoxNnB4IDIwcHg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7fQoucmVjLWJhZGdle2ZsZXgtc2hyaW5rOjA7cGFkZGluZzo0cHggMTBweDtib3JkZXItcmFkaXVzOjVweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Zm9udC13ZWlnaHQ6NzAwO3doaXRlLXNwYWNlOm5vd3JhcDttYXJnaW4tdG9wOjJweDt9Ci5iYWRnZS1xdWlja3dpbntiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMTUpO2NvbG9yOnZhcigtLWdyZWVuKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoNzQsMjIyLDEyOCwuMyk7fQouYmFkZ2UtY3Rye2JhY2tncm91bmQ6cmdiYSg5NiwxNjUsMjUwLC4xNSk7Y29sb3I6dmFyKC0tYmx1ZSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDk2LDE2NSwyNTAsLjMpO30KLmJhZGdlLWNvbnRlbnR7YmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtjb2xvcjp2YXIoLS1nb2xkKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMyk7fQouYmFkZ2UtcmV3cml0ZXtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE0Niw2MCwuMTUpO2NvbG9yOnZhcigtLW9yYW5nZSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1MSwxNDYsNjAsLjMpO30KLmJhZGdlLWF1dGhvcml0eXtiYWNrZ3JvdW5kOnJnYmEoMTY3LDEzOSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1wdXJwbGUpO2JvcmRlcjoxcHggc29saWQgcmdiYSgxNjcsMTM5LDI1MCwuMyk7fQouYmFkZ2UtYnVpbGR7YmFja2dyb3VuZDpyZ2JhKDcxLDg1LDEwNSwuMTUpO2NvbG9yOnZhcigtLWRpbSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDcxLDg1LDEwNSwuMyk7fQoKLnJlYy1tYWlue2ZsZXg6MTttaW4td2lkdGg6MjAwcHg7fQoucmVjLXVybHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWJsdWUpO21hcmdpbi1ib3R0b206NXB4O3dvcmQtYnJlYWs6YnJlYWstYWxsO30KLnJlYy1rd3tmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLWJvdHRvbTo4cHg7fQoucmVjLXRpdGxle2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wM2VtO2NvbG9yOnZhcigtLWluayk7bWFyZ2luLWJvdHRvbTo1cHg7fQoucmVjLXdoeXtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7bGluZS1oZWlnaHQ6MS42O21hcmdpbi1ib3R0b206OHB4O30KLnJlYy1hY3Rpb257Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOnZhcigtLWluayk7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7Z2FwOjZweDt9Ci5yZWMtYWN0aW9uOjpiZWZvcmV7Y29udGVudDon4oaSJztjb2xvcjp2YXIoLS1nb2xkKTtmbGV4LXNocmluazowO30KCi5yZWMtbWV0YXtkaXNwbGF5OmZsZXg7Z2FwOjhweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tdG9wOjEwcHg7fQoubWV0YS1jaGlwe2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDZlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzozcHggOHB4O2JvcmRlci1yYWRpdXM6NHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtjb2xvcjp2YXIoLS1kaW0pO30KLm1ldGEtY2hpcCBzdHJvbmd7Y29sb3I6dmFyKC0tbXV0ZWQpO30KCi8qIFByZS1maWxsZWQgaW5mbyAqLwoucHJlZmlsbC1ib3h7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjEycHggMTZweDttYXJnaW46MCAyMHB4IDAgMDttaW4td2lkdGg6MjAwcHg7bWF4LXdpZHRoOjI4MHB4O2ZsZXgtc2hyaW5rOjA7fQpAbWVkaWEobWF4LXdpZHRoOjcwMHB4KXsucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7bWFyZ2luOjA7fX0KLnByZWZpbGwtdGl0bGV7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xMmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO21hcmdpbi1ib3R0b206OHB4O30KLnByZWZpbGwtcm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjdweDtwYWRkaW5nOjRweCAwO2ZvbnQtc2l6ZToxMXB4O30KLnByZWZpbGwtcm93LmF1dG97Y29sb3I6dmFyKC0tZ3JlZW4pO30KLnByZWZpbGwtcm93Lm1hbnVhbHtjb2xvcjp2YXIoLS1kaW0pO30KLnByZWZpbGwtZG90e3dpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6NTAlO2ZsZXgtc2hyaW5rOjA7fQouZG90LWF1dG97YmFja2dyb3VuZDp2YXIoLS1ncmVlbik7fQouZG90LW1hbnVhbHtiYWNrZ3JvdW5kOnZhcigtLWRpbSk7fQoKLyogQWN0aW9uIGJ1dHRvbiAqLwoucmVjLWZvb3R7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wMik7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtwYWRkaW5nOjE0cHggMjBweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZsZXgtd3JhcDp3cmFwO30KLmFjdGlvbi1idG57Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjE4cHg7bGV0dGVyLXNwYWNpbmc6LjA0ZW07cGFkZGluZzoxMHB4IDI4cHg7Ym9yZGVyLXJhZGl1czo3cHg7Y3Vyc29yOnBvaW50ZXI7Ym9yZGVyOm5vbmU7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDt0ZXh0LWRlY29yYXRpb246bm9uZTt0cmFuc2l0aW9uOmFsbCAuMThzO30KLmFjdGlvbi1idG4tZ29sZHtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7fQouYWN0aW9uLWJ0bi1nb2xkOmhvdmVye2JhY2tncm91bmQ6I2U2YjAyMDt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMXB4KTt9Ci5hY3Rpb24tYnRuLWJsdWV7YmFja2dyb3VuZDpyZ2JhKDk2LDE2NSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1ibHVlKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoOTYsMTY1LDI1MCwuMyk7fQouYWN0aW9uLWJ0bi1ibHVlOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYmx1ZSk7Y29sb3I6IzAwMDt9Ci50aW1lLWNoaXB7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo1cHg7fQoKLmVtcHR5e3RleHQtYWxpZ246Y2VudGVyO3BhZGRpbmc6NjBweCAyMHB4O2NvbG9yOnZhcigtLWRpbSk7fQouZW1wdHkgaDN7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjI2cHg7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjhweDt9CgoudG9hc3R7cG9zaXRpb246Zml4ZWQ7Ym90dG9tOjI4cHg7bGVmdDo1MCU7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgyMHB4KTtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7cGFkZGluZzo5cHggMjBweDtib3JkZXItcmFkaXVzOjUwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtmb250LXdlaWdodDo3MDA7b3BhY2l0eTowO3RyYW5zaXRpb246YWxsIC4zczt6LWluZGV4OjEwMDAwO3BvaW50ZXItZXZlbnRzOm5vbmU7fQoudG9hc3Quc2hvd3tvcGFjaXR5OjE7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgwKTt9CgovKiDilIDilIAgTU9CSUxFIFJFU1BPTlNJVkUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmhpZGRlbjt9CmltZyx0YWJsZSxpZnJhbWV7bWF4LXdpZHRoOjEwMCU7fQpAbWVkaWEobWF4LXdpZHRoOjc2OHB4KXsKICAud3JhcHtwYWRkaW5nOjAgMTRweCA2MHB4IWltcG9ydGFudDt9CiAgLnRvcGJhcntwYWRkaW5nOjEycHggMDtnYXA6OHB4O30KICAudG9wYmFyLXJpZ2h0e2dhcDo1cHg7fQogIC5idG57Zm9udC1zaXplOjhweDtwYWRkaW5nOjZweCAxMHB4O30KICAub3ZlcnZpZXcsLnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcikhaW1wb3J0YW50O30KICAuYWRkLXJvd3tmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5hZGQtcm93IGlucHV0LC5hZGQtcm93IHNlbGVjdHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmZpbHRlci1iYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7fQogIC5maWx0ZXItYmFyIHNlbGVjdCwuZmlsdGVyLWJhciBpbnB1dHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmNhcmQtaGVhZHtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4O30KICAucmVjLWhlYWR7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7d2lkdGg6MTAwJTt9CiAgLmcyLC5nMywuZzQsLmNiLWdyaWQsLmNhcmQtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIWltcG9ydGFudDt9CiAgLnByb2plY3QtYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnBme21pbi13aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLnN0ZXBze2ZsZXgtZGlyZWN0aW9uOmNvbHVtbiFpbXBvcnRhbnQ7fQogIC5zdGVwe2JvcmRlci1yaWdodDpub25lIWltcG9ydGFudDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KICAuc3RlcDpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206bm9uZTt9CiAgLmhvdy1zdGVwe2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLmZsb3ctc3RlcHtnYXA6MTBweDt9CiAgLnJlYy1mb290e2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O30KICAuYWN0aW9uLWJ0bnt3aWR0aDoxMDAlO2p1c3RpZnktY29udGVudDpjZW50ZXI7Zm9udC1zaXplOjE2cHghaW1wb3J0YW50O30KICAubW9kZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5tb2RlLWJ0bntib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Cn0KQG1lZGlhKG1heC13aWR0aDo0ODBweCl7CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyIWltcG9ydGFudDt9CiAgLnRvcGJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1zdGFydDt9CiAgLnRvcGJhci1yaWdodHtmbGV4LXdyYXA6d3JhcDt9CiAgLmNhcmQtbWV0YXtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4O30KICAuY2FyZC1hY3Rpb25zLC5jYXJkLWFjdGlvbnMgLmJ0biwuY2FyZC1mb290e2ZsZXgtd3JhcDp3cmFwO30KICBoMSxoMiwudG9vbC1uYW1le3dvcmQtYnJlYWs6YnJlYWstd29yZDt9CiAgLnBhbmVse3BhZGRpbmc6MTZweCFpbXBvcnRhbnQ7fQogIC5zZWN0aW9ue3BhZGRpbmc6MTRweCAxNnB4IWltcG9ydGFudDt9Cn0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGRpdiBjbGFzcz0id3JhcCI+Cgo8ZGl2IGNsYXNzPSJ0b3BiYXIiPgogIDxhIGhyZWY9Imh0dHBzOi8vY29udGVudHNjYWxlLnNpdGUiIGNsYXNzPSJicmFuZCI+Q29udGVudFNjYWxlPC9hPgogIDxkaXYgY2xhc3M9InRvb2wtdGl0bGUiPlNFTyBSRUNPTU1FTkRBVElPTlMgRU5HSU5FPC9kaXY+CiAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDo4cHg7Ij4KICAgIDxhIGhyZWY9Ii9hdWRpdC13b3JrZmxvdyIgY2xhc3M9ImJ0biBidG4tbXV0ZWQiPuKGkCBXb3JrZmxvdyBNYW5hZ2VyPC9hPgogICAgPGEgaHJlZj0iL2F1ZGl0LXNlbyIgY2xhc3M9ImJ0biBidG4tbXV0ZWQiPvCflKwgUFVMU0UrTkVYVVM8L2E+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIiBvbmNsaWNrPSJsb2NhdGlvbi5yZWxvYWQoKSI+4oa6IFJlZnJlc2g8L2J1dHRvbj4KICA8L2Rpdj4KPC9kaXY+Cgo8IS0tIFN1bW1hcnkgLS0+CjxkaXYgY2xhc3M9InN1bW1hcnkiIGlkPSJzdW1tYXJ5Ij48L2Rpdj4KCjwhLS0gRmlsdGVycyAtLT4KPGRpdiBjbGFzcz0iZmlsdGVyLWJhciI+CiAgPHNlbGVjdCBpZD0iZlR5cGUiIG9uY2hhbmdlPSJyZW5kZXIoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCByZWNvbW1lbmRhdGlvbnM8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InF1aWNrd2luIj7imqEgUXVpY2sgV2luczwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iY3RyIj7wn5OIIENUUiBGaXg8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImNvbnRlbnQiPvCfk50gQ29udGVudCBVcGdyYWRlPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJyZXdyaXRlIj7inI/vuI8gUmV3cml0ZTwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iYXV0aG9yaXR5Ij7wn5SXIEF1dGhvcml0eTwvb3B0aW9uPgogIDwvc2VsZWN0PgogIDxzZWxlY3QgaWQ9ImZQcmkiIG9uY2hhbmdlPSJyZW5kZXIoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCBwcmlvcml0aWVzPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJoaWdoIj7wn5S0IEhpZ2g8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9Im1lZCI+8J+foSBNZWRpdW08L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImxvdyI+8J+foiBMb3c8L29wdGlvbj4KICA8L3NlbGVjdD4KICA8c2VsZWN0IGlkPSJmU3RhdHVzIiBvbmNoYW5nZT0icmVuZGVyKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0iYWN0aXZlIj5Ob3QgZG9uZTwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iYWxsIj5BbGwgcGFnZXM8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImRvbmUiPkRvbmUgb25seTwvb3B0aW9uPgogIDwvc2VsZWN0PgogIDxzZWxlY3QgaWQ9ImZTb3J0IiBvbmNoYW5nZT0icmVuZGVyKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0iaW1wYWN0Ij5Tb3J0OiBJbXBhY3Q8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InBvc2l0aW9uIj5Tb3J0OiBQb3NpdGlvbjwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iaW1wcmVzc2lvbnMiPlNvcnQ6IEltcHJlc3Npb25zPC9vcHRpb24+CiAgPC9zZWxlY3Q+CjwvZGl2PgoKPGRpdiBjbGFzcz0icmVjLWxpc3QiIGlkPSJyZWNMaXN0Ij48L2Rpdj4KPC9kaXY+CjxkaXYgY2xhc3M9InRvYXN0IiBpZD0idG9hc3QiPjwvZGl2PgoKPHNjcmlwdD4KdmFyIEFVRElUX1VSTCA9ICcvc2VvLWF1ZGl0JzsKdmFyIHBhZ2VzID0gW107CgpmdW5jdGlvbiB0b2FzdChtc2cpewogIHZhciB0PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b2FzdCcpOwogIHQudGV4dENvbnRlbnQ9bXNnO3QuY2xhc3NMaXN0LmFkZCgnc2hvdycpOwogIHNldFRpbWVvdXQoZnVuY3Rpb24oKXt0LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTt9LDI1MDApOwp9CgpmdW5jdGlvbiBsb2FkKCl7CiAgdHJ5eyB2YXIgcD1sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3Nfd2ZfcGFnZXMnKTsgaWYocCkgcGFnZXM9SlNPTi5wYXJzZShwKTsgfWNhdGNoKGUpe30KfQoKLy8g4pSA4pSAIFJlY29tbWVuZGF0aW9uIGVuZ2luZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKdmFyIFJFQ1MgPSB7CiAgcXVpY2t3aW46IHsKICAgIGxhYmVsOidRdWljayBXaW4nLCBiYWRnZUNsYXNzOidiYWRnZS1xdWlja3dpbicsIGNhcmRDbGFzczondHlwZS1xdWlja3dpbicsCiAgICB0aXRsZTonVGl0bGUgJiBNZXRhIOKAlCAzMCBNaW51dGUgV2luJywKICAgIGljb246J+KaoScsCiAgfSwKICBjdHI6IHsKICAgIGxhYmVsOidDVFIgRml4JywgYmFkZ2VDbGFzczonYmFkZ2UtY3RyJywgY2FyZENsYXNzOid0eXBlLWN0cicsCiAgICB0aXRsZTonQ1RSIFN1cmdlcnkgTmVlZGVkJywKICAgIGljb246J/Cfk4gnLAogIH0sCiAgY29udGVudDogewogICAgbGFiZWw6J0NvbnRlbnQgVXBncmFkZScsIGJhZGdlQ2xhc3M6J2JhZGdlLWNvbnRlbnQnLCBjYXJkQ2xhc3M6J3R5cGUtY29udGVudCcsCiAgICB0aXRsZTonQ29udGVudCBVcGdyYWRlIOKAlCBGdWxsIEF1ZGl0JywKICAgIGljb246J/Cfk50nLAogIH0sCiAgcmV3cml0ZTogewogICAgbGFiZWw6J1Jld3JpdGUgKyBBdWRpdCcsIGJhZGdlQ2xhc3M6J2JhZGdlLXJld3JpdGUnLCBjYXJkQ2xhc3M6J3R5cGUtcmV3cml0ZScsCiAgICB0aXRsZTonUGFnZSBSZXdyaXRlIFJlcXVpcmVkJywKICAgIGljb246J+Kcj++4jycsCiAgfSwKICBhdXRob3JpdHk6IHsKICAgIGxhYmVsOidBdXRob3JpdHkgR2FwJywgYmFkZ2VDbGFzczonYmFkZ2UtYXV0aG9yaXR5JywgY2FyZENsYXNzOid0eXBlLWF1dGhvcml0eScsCiAgICB0aXRsZTonQ29udGVudCBHb29kIOKAlCBCdWlsZCBBdXRob3JpdHknLAogICAgaWNvbjon8J+UlycsCiAgfSwKICBidWlsZDogewogICAgbGFiZWw6J0J1aWxkIENvbnRlbnQnLCBiYWRnZUNsYXNzOidiYWRnZS1idWlsZCcsIGNhcmRDbGFzczondHlwZS1idWlsZCcsCiAgICB0aXRsZTonQ29udGVudCBOZWVkcyBCdWlsZGluZyBGaXJzdCcsCiAgICBpY29uOifwn4+X77iPJywKICB9LAp9OwoKZnVuY3Rpb24gZ2V0UmVjb21tZW5kYXRpb24ocCl7CiAgdmFyIHBvcyAgID0gcC5wb3NpdGlvbiAgIHx8IDA7CiAgdmFyIGN0ciAgID0gcGFyc2VGbG9hdChwLmN0cikgfHwgMDsKICB2YXIgaW1wciAgPSBwLmltcHJlc3Npb25zIHx8IDA7CiAgdmFyIHNjb3JlID0gcGFyc2VGbG9hdChwLnNjb3JlQmVmb3JlKSB8fCAwOwogIHZhciBoYXNTY29yZSA9IHAuc2NvcmVCZWZvcmUgIT09ICcnICYmIHAuc2NvcmVCZWZvcmUgIT09IHVuZGVmaW5lZDsKCiAgLy8g4pSA4pSAIFNDRU5BUklPIDE6IFBhZ2UgMSBidXQgbG93IENUUiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBpZihwb3M+PTEgJiYgcG9zPD0xMCAmJiBjdHI8Mil7CiAgICByZXR1cm4gewogICAgICB0eXBlOidxdWlja3dpbicsCiAgICAgIGltcGFjdFNjb3JlOiA5NSwKICAgICAgd2h5OiAnSmUgc3RhYXQgb3AgcGFnaW5hIDEgKHBvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJykgbWFhciBDVFIgaXMgc2xlY2h0cyAnK2N0ci50b0ZpeGVkKDEpKyclLiAnCiAgICAgICAgICArJ1NlYXJjaGVycyB6aWVuIGplIG1hYXIga2xpa2tlbiBuaWV0LiBEZSB0aXRsZSBvZiBtZXRhIGRlc2NyaXB0aW9uIHRyZWt0IG5pZXQgZ2Vub2VnIGFhbi4nLAogICAgICBhY3Rpb246ICdIZXJzY2hyaWpmIGRlIHRpdGxlIHRhZyAo4omkNjAgY2hhcnMpIGVuIG1ldGEgZGVzY3JpcHRpb24gKOKJpDE1NSBjaGFycykuICcKICAgICAgICAgICAgICsnVm9lZyBlZW4gZ2V0YWwsIHBvd2VyIHdvcmQgb2YgdXJnZW50aWUtdHJpZ2dlciB0b2UuJywKICAgICAgYXVkaXRGb2N1czogJ0NUUiBTdXJnZXJ5IOKAlCBTdGFwIDIgaW4gUFVMU0UrTkVYVVMnLAogICAgICB0aW1lOiAnMzAgbWluJywKICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKHZvb3Igd2Vya2VsaWprZSB0aXRsZSknLCdDb21wZXRpdG9yIEhUTUwnXSwKICAgICAgcXVpY2tXaW46ICB0cnVlLAogICAgfTsKICB9CgogIC8vIOKUgOKUgCBTQ0VOQVJJTyAyOiBQYWdlIDEsIENUUiBvayDigJQgYWxyZWFkeSB3aW5uaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MSAmJiBwb3M8PTEwICYmIGN0cj49Mil7CiAgICBpZihoYXNTY29yZSAmJiBzY29yZT49ODUpewogICAgICByZXR1cm4gewogICAgICAgIHR5cGU6J2F1dGhvcml0eScsCiAgICAgICAgaW1wYWN0U2NvcmU6IDQwLAogICAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJywgQ1RSICcrY3RyLnRvRml4ZWQoMSkrJyUsIHNjb3JlICcrc2NvcmUrJy8xMDAuICcKICAgICAgICAgICAgKydQYWdpbmEgcHJlc3RlZXJ0IGdvZWQuIFZlcmRlcmUgZ3JvZWkga29tdCB2aWEgbGlua2J1aWxkaW5nIGVuIGF1dG9yaXRlaXQuJywKICAgICAgICBhY3Rpb246ICdGb2N1cyBvcCBpbnRlcm5lIGxpbmtzIGVuIGV4dGVybmUgYmFja2xpbmtzLiAnCiAgICAgICAgICAgICAgICsnVm9lZyBleHBlcnRjaXRhdGVuIGVuIGZyZXNoIGRhdGEgdG9lICgyMDI2KS4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdORVhVUyBTaWduYWxzIOKAlCBTdGFwIDYgaW4gUFVMU0UrTkVYVVMnLAogICAgICAgIHRpbWU6ICcxLTIgdXVyJywKICAgICAgICBwcmVmaWxsZWQ6IFsnVVJMJywnS2V5d29yZCcsJ1Bvc2l0aWUnLCdJbXByZXNzaWVzJywnQ1RSJ10sCiAgICAgICAgbWFudWFsOiAgICBbJ1NpdGVtYXAgVVJMcyAodm9vciBpbnRlcm5lIGxpbmtzKScsJ0NvbXBldGl0b3IgSFRNTCddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIG51bGw7IC8vIEFscmVhZHkgcGVyZm9ybWluZyB3ZWxsLCBubyB1cmdlbnQgYWN0aW9uCiAgfQoKICAvLyDilIDilIAgU0NFTkFSSU8gMzogUG9zaXRpb24gMTEtMjAg4oCUIGNsb3Nlc3QgdG8gcGFnZSAxIOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MTEgJiYgcG9zPD0yMCl7CiAgICBpZihjdHI8MS41KXsKICAgICAgcmV0dXJuIHsKICAgICAgICB0eXBlOidjdHInLAogICAgICAgIGltcGFjdFNjb3JlOiA5MiwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWV0IENUUiAnK2N0ci50b0ZpeGVkKDEpKyclLiAnCiAgICAgICAgICAgICsnSmUgc3RhYXQgYmlqbmEgb3AgcGFnaW5hIDEgbWFhciBkZSBDVFIgaXMgbGFhZy4gJwogICAgICAgICAgICArJ1R3ZWUgcHJvYmxlbWVuOiB0aXRsZSB0cmVrdCBuaWV0IGFhbiBFTiBjb250ZW50IG5ldCBuaWV0IHN0ZXJrIGdlbm9lZy4nLAogICAgICAgIGFjdGlvbjogJ1N0YXAgMTogdGl0bGUgKyBtZXRhIGhlcnNjaHJpanZlbiAoMzAgbWluKS4gJwogICAgICAgICAgICAgICArJ1N0YXAgMjogdm9sbGVkaWdlIFBVTFNFK05FWFVTIGF1ZGl0IHZvb3IgZGUgbGFhdHN0ZSBwdXNoIG5hYXIgcGFnaW5hIDEuJywKICAgICAgICBhdWRpdEZvY3VzOiAnU3RhcnQgbWV0IFN0YXAgMiAoQ1RSIFN1cmdlcnkpIGRhbiBTdGFwIDEgKFByaW9yaXR5IEFjdGlvbnMpJywKICAgICAgICB0aW1lOiAnMS0zIHV1cicsCiAgICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICAgIG1hbnVhbDogICAgWydQYWdpbmEgSFRNTCcsJ0NvbXBldGl0b3IgSFRNTCcsJ1NpdGVtYXAgVVJMcyddLAogICAgICAgIHF1aWNrV2luOiAgdHJ1ZSwKICAgICAgfTsKICAgIH0KICAgIGlmKGhhc1Njb3JlICYmIHNjb3JlPDcwKXsKICAgICAgcmV0dXJuIHsKICAgICAgICB0eXBlOidjb250ZW50JywKICAgICAgICBpbXBhY3RTY29yZTogOTAsCiAgICAgICAgd2h5OiAnUG9zaXRpZSAnK01hdGgucm91bmQocG9zKSsnLCBzY29yZSAnK3Njb3JlKycvMTAwLiAnCiAgICAgICAgICAgICsnQmlqbmEgcGFnaW5hIDEgbWFhciBkZSBjb250ZW50IGlzIHRlIHp3YWsuICcKICAgICAgICAgICAgKydNZXQgZWVuIHNjb3JlIGJvdmVuIDgwIGhlYiBqZSBncm90ZSBrYW5zIG9tIG5hYXIgZGUgdG9wIHRlIHN0aWpnZW4uJywKICAgICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQuIEZvY3VzIG9wIGNvbnRlbnQgZ2FwcywgUFVMU0UgcmV3cml0ZXMgZW4gc2NoZW1hLicsCiAgICAgICAgYXVkaXRGb2N1czogJ0FsbGUgMTAgc3RhcHBlbiDigJQgUHJpb3JpdHkgQWN0aW9ucyBlZXJzdCcsCiAgICAgICAgdGltZTogJzItNCB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwgKFN1cmZlciBTRU8gKyBNYXJrZXRNdXNlIGFscyBkZWZhdWx0KScsJ1NpdGVtYXAgVVJMcyddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIHsKICAgICAgdHlwZTonY29udGVudCcsCiAgICAgIGltcGFjdFNjb3JlOiA4OCwKICAgICAgd2h5OiAnUG9zaXRpZSAnK01hdGgucm91bmQocG9zKSsnIOKAlCDDqcOpbiBzdGVya2UgYXVkaXQgdmVyd2lqZGVyZCB2YW4gcGFnaW5hIDEuICcKICAgICAgICAgICsoIGltcHI+MjAwMCA/IGltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMgYmV0ZWtlbnQgdmVlbCB0ZSB3aW5uZW4uICcgOiAnJykKICAgICAgICAgICsoaGFzU2NvcmUgPyAnU2NvcmU6ICcrc2NvcmUrJy8xMDAuJyA6ICdDb250ZW50U2NvcmUgbm9nIG9uYmVrZW5kIOKAlCBzY2FuIGVlcnN0LicpLAogICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQg4oCUIGZvY3VzIG9wIGNvbnRlbnQgZ2FwcyBlbiBpbnRlcm5lIGxpbmtzLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4g4oCUIFByaW9yaXR5IEFjdGlvbnMgZWVyc3QnLAogICAgICB0aW1lOiAnMi0zIHV1cicsCiAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgbWFudWFsOiAgICBbJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICB9OwogIH0KCiAgLy8g4pSA4pSAIFNDRU5BUklPIDQ6IFBvc2l0aW9uIDIxLTMwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MjEgJiYgcG9zPD0zMCl7CiAgICBpZihoYXNTY29yZSAmJiBzY29yZTw3MCl7CiAgICAgIHJldHVybiB7CiAgICAgICAgdHlwZToncmV3cml0ZScsCiAgICAgICAgaW1wYWN0U2NvcmU6IDgyLAogICAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJywgc2NvcmUgJytzY29yZSsnLzEwMC4gJwogICAgICAgICAgICArJ0NvbnRlbnQgbW9ldCBoZXJzY2hyZXZlbiB3b3JkZW4gw6luIGRlIHBhZ2luYSBoZWVmdCBlZW4gdm9sbGVkaWdlIGF1ZGl0IG5vZGlnLiAnCiAgICAgICAgICAgICsoaW1wcj4xMDAwID8gJ01ldCAnK2ltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMgaXMgZGUgcG90ZW50aWUgZXIuJyA6ICcnKSwKICAgICAgICBhY3Rpb246ICdQYWdpbmEgaGVyc2NocmlqdmVuIG9wIGJhc2lzIHZhbiBQVUxTRStORVhVUyBhYW5iZXZlbGluZ2VuLiAnCiAgICAgICAgICAgICAgICsnRGFhcm5hIG9wbmlldXcgc2Nhbm5lbiBlbiBzY29yZSB2ZXJnZWxpamtlbi4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdTdGFwIDUgKFBVTFNFIHJld3JpdGVzKSArIFN0YXAgNCAoQ29udGVudCBHYXApIHppam4gcHJpb3JpdGVpdCcsCiAgICAgICAgdGltZTogJzMtNSB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKHZlcnBsaWNodCB2b29yIHJld3JpdGUgYW5hbHlzZSknLCdDb21wZXRpdG9yIEhUTUwnLCdTaXRlbWFwIFVSTHMnXSwKICAgICAgfTsKICAgIH0KICAgIHJldHVybiB7CiAgICAgIHR5cGU6J2NvbnRlbnQnLAogICAgICBpbXBhY3RTY29yZTogNzgsCiAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJy4gUGFnaW5hIGhlZWZ0IHBvdGVudGllIG1hYXIgbWlzdCBhdXRvcml0ZWl0IG9mIGNvbnRlbnQgZGllcHRlLiAnCiAgICAgICAgICArKGltcHI+NTAwID8gaW1wci50b0xvY2FsZVN0cmluZygpKycgaW1wcmVzc2llcyDigJQgaGV0IG9uZGVyd2VycCBoZWVmdCB2cmFhZy4nIDogJycpLAogICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgYXVkaXQg4oCUIGZvY3VzIG9wIE5FWFVTIHNpZ25hbHMsIGludGVybmUgbGlua3MgZW4gc2NoZW1hLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4nLAogICAgICB0aW1lOiAnMi0zIHV1cicsCiAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgbWFudWFsOiAgICBbJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICB9OwogIH0KCiAgLy8g4pSA4pSAIFNDRU5BUklPIDU6IFBvc2l0aW9uIDMxLTYwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MzEgJiYgcG9zPD02MCl7CiAgICBpZihpbXByPjEwMDApewogICAgICByZXR1cm4gewogICAgICAgIHR5cGU6J3Jld3JpdGUnLAogICAgICAgIGltcGFjdFNjb3JlOiA3MCwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWV0ICcraW1wci50b0xvY2FsZVN0cmluZygpKycgaW1wcmVzc2llcy4gJwogICAgICAgICAgICArJ1ZlZWwgem9la3ZvbHVtZSBtYWFyIEdvb2dsZSB2aW5kdCBkZSBwYWdpbmEgbmlldCBzdGVyayBnZW5vZWcgdm9vciBwYWdpbmEgMS0zLiAnCiAgICAgICAgICAgICsnRGllcGdhYW5kZSBhdWRpdCArIGNvbnRlbnQgcmV3cml0ZSBpcyBkZSBlbmlnZSB3ZWcgb21ob29nLicsCiAgICAgICAgYWN0aW9uOiAnRGllcGdhYW5kZSBQVUxTRStORVhVUyBhdWRpdC4gQWxsZSAxMCBzdGFwcGVuIGRvb3Jsb3Blbi4gJwogICAgICAgICAgICAgICArJ0RhYXJuYSBjb250ZW50IHJld3JpdGUgZW4gc2NoZW1hIHRvZXZvZWdlbi4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4g4oCUIGZvY3VzIFN0YXAgMyAoQ29tcGV0aXRvciBEaWZmKSBlbiBTdGFwIDUgKFBVTFNFIHJld3JpdGVzKScsCiAgICAgICAgdGltZTogJzQtNiB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKGtyaXRpZWspJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICAgIH07CiAgICB9CiAgICByZXR1cm4gewogICAgICB0eXBlOidjb250ZW50JywKICAgICAgaW1wYWN0U2NvcmU6IDU1LAogICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKyhpbXByPDIwMD8nIG1ldCB3ZWluaWcgaW1wcmVzc2llcyc6JycpKycuICcKICAgICAgICAgICsnQ29udGVudCBpcyB0ZSB6d2FrIG9mIGhldCBvbmRlcndlcnAgaGVlZnQgd2VpbmlnIHZyYWFnLiAnCiAgICAgICAgICArJ0F1ZGl0IGdlZWZ0IGR1aWRlbGlqa2hlaWQgd2Vsa2UgcmljaHRpbmcgaGV0IGJlc3RlIHdlcmt0LicsCiAgICAgIGFjdGlvbjogJ0F1ZGl0IG9tIHRlIGJlcGFsZW4gb2YgaGVyc2NocmlqdmVuIG9mIG5pZXV3ZSBhYW5wYWsgbm9kaWcgaXMuJywKICAgICAgYXVkaXRGb2N1czogJ1N0YXAgMSAoSW50ZW50KSBlbiBTdGFwIDQgKENvbnRlbnQgR2FwKSBlZXJzdCcsCiAgICAgIHRpbWU6ICcxLTMgdXVyJywKICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwnXSwKICAgIH07CiAgfQoKICAvLyDilIDilIAgU0NFTkFSSU8gNjogUG9zaXRpb24gNjArIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz42MCl7CiAgICBpZihpbXByPjUwMCl7CiAgICAgIHJldHVybiB7CiAgICAgICAgdHlwZTonYnVpbGQnLAogICAgICAgIGltcGFjdFNjb3JlOiA0MCwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWFhciAnK2ltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMg4oCUIGVyIGlzIHZyYWFnLiAnCiAgICAgICAgICAgICsnR29vZ2xlIGJlb29yZGVlbHQgZGV6ZSBwYWdpbmEgYWxzIHRlIHp3YWsuIEZ1bmRhbWVudGVsZSBjb250ZW50IHJlYnVpbGQgbm9kaWcuJywKICAgICAgICBhY3Rpb246ICdDb250ZW50IHZvbGxlZGlnIG9wbmlldXcgc2NocmlqdmVuIG1ldCBQVUxTRStORVhVUyBhbHMgYnJpZWZpbmcuICcKICAgICAgICAgICAgICAgKydGb2N1cyBvcCBFLUUtQS1ULCBzY2hlbWEgZW4gY29udGVudCBkaWVwdGUuJywKICAgICAgICBhdWRpdEZvY3VzOiAnQWxsZSAxMCBzdGFwcGVuIGFscyBjb250ZW50IGJyaWVmIGdlYnJ1aWtlbicsCiAgICAgICAgdGltZTogJzUrIHV1cicsCiAgICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwnLCdTaXRlbWFwIFVSTHMnLCdHU0MgcXVlcmllcyddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIHsKICAgICAgdHlwZTonYnVpbGQnLAogICAgICBpbXBhY3RTY29yZTogMjUsCiAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJyBtZXQgbGFhZyB6b2Vrdm9sdW1lLiAnCiAgICAgICAgICArJ0VlcnN0IGJlcGFsZW4gb2YgZGl0IHpvZWt3b29yZCBkZSBtb2VpdGUgd2FhcmQgaXMuJywKICAgICAgYWN0aW9uOiAnS2V5d29yZCByZXNlYXJjaCBlZXJzdC4gRGFuIGJlc2xpc3NlbjogcmV3cml0ZSBvZiBuaWV1dyBhcnRpa2VsLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdTdGFwIDEgKEludGVudCBhbmFseXNlKSBhbHMgc3RhcnRwdW50JywKICAgICAgdGltZTogJ05hZGVyIHRlIGJlcGFsZW4nLAogICAgICBwcmVmaWxsZWQ6IFsnVVJMJywnS2V5d29yZCddLAogICAgICBtYW51YWw6ICAgIFsnQWxsZXMg4oCUIHBhZ2luYSBoZWVmdCB3ZWluaWcgZGF0YSddLAogICAgfTsKICB9CgogIC8vIE5vIHBvc2l0aW9uIGRhdGEKICByZXR1cm4gewogICAgdHlwZTonY29udGVudCcsCiAgICBpbXBhY3RTY29yZTogNTAsCiAgICB3aHk6ICdHZWVuIEdTQyBkYXRhIGJlc2NoaWtiYWFyLiBWb2VnIHBvc2l0aWUgZW4gaW1wcmVzc2llcyB0b2UgdmFudWl0IEdTQyB2b29yIGVlbiBiZXRlcmUgYWFuYmV2ZWxpbmcuJywKICAgIGFjdGlvbjogJ1ZvZWcgR1NDIGRhdGEgdG9lLCBzY2FuIENvbnRlbnRTY29yZSwgZGFuIHZvbGxlZGlnZSBhdWRpdC4nLAogICAgYXVkaXRGb2N1czogJ0FsbGUgMTAgc3RhcHBlbicsCiAgICB0aW1lOiAnT25iZWtlbmQnLAogICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnXSwKICAgIG1hbnVhbDogICAgWydHU0MgZGF0YScsJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJ10sCiAgfTsKfQoKZnVuY3Rpb24gYnVpbGRBdWRpdFVybChwKXsKICB2YXIgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpOwogIHBhcmFtcy5zZXQoJ3VybCcsIHAudXJsKTsKICBpZihwLmtleXdvcmQpICAgICBwYXJhbXMuc2V0KCdrdycsICAgcC5rZXl3b3JkKTsKICBpZihwLnBvc2l0aW9uKSAgICBwYXJhbXMuc2V0KCdwb3MnLCAgcC5wb3NpdGlvbik7CiAgaWYocC5pbXByZXNzaW9ucykgcGFyYW1zLnNldCgnaW1wcicsIHAuaW1wcmVzc2lvbnMpOwogIGlmKHAuY3RyKSAgICAgICAgIHBhcmFtcy5zZXQoJ2N0cicsICBwLmN0cik7CiAgaWYocC5pZCkgICAgICAgICAgcGFyYW1zLnNldCgnd2YnLCAgIHAuaWQpOyAvLyB3b3JrZmxvdyBjYWxsYmFjawogIHJldHVybiBBVURJVF9VUkwgKyAnPycgKyBwYXJhbXMudG9TdHJpbmcoKTsKfQoKZnVuY3Rpb24gcmVuZGVyKCl7CiAgdmFyIGZUeXBlICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlR5cGUnKS52YWx1ZTsKICB2YXIgZlByaSAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmUHJpJykudmFsdWU7CiAgdmFyIGZTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlN0YXR1cycpLnZhbHVlOwogIHZhciBmU29ydCAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZTb3J0JykudmFsdWU7CgogIHZhciBhcnIgPSBwYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7CiAgICBpZihmU3RhdHVzPT09J2FjdGl2ZScgJiYgcC5zdGF0dXM9PT0nZG9uZScpIHJldHVybiBmYWxzZTsKICAgIGlmKGZTdGF0dXM9PT0nZG9uZScgICAmJiBwLnN0YXR1cyE9PSdkb25lJykgcmV0dXJuIGZhbHNlOwogICAgaWYoZlByaSE9PSdhbGwnICYmIHAucHJpb3JpdHkhPT1mUHJpKSByZXR1cm4gZmFsc2U7CiAgICByZXR1cm4gdHJ1ZTsKICB9KS5tYXAoZnVuY3Rpb24ocCl7CiAgICByZXR1cm4geyBwYWdlOnAsIHJlYzpnZXRSZWNvbW1lbmRhdGlvbihwKSB9OwogIH0pLmZpbHRlcihmdW5jdGlvbih4KXsKICAgIGlmKCF4LnJlYykgcmV0dXJuIGZhbHNlOwogICAgaWYoZlR5cGUhPT0nYWxsJyAmJiB4LnJlYy50eXBlIT09ZlR5cGUpIHJldHVybiBmYWxzZTsKICAgIHJldHVybiB0cnVlOwogIH0pOwoKICAvLyBTb3J0CiAgaWYoZlNvcnQ9PT0naW1wYWN0JykgICAgICBhcnIuc29ydChmdW5jdGlvbihhLGIpeyByZXR1cm4gYi5yZWMuaW1wYWN0U2NvcmUgLSBhLnJlYy5pbXBhY3RTY29yZTsgfSk7CiAgZWxzZSBpZihmU29ydD09PSdwb3NpdGlvbicpIGFyci5zb3J0KGZ1bmN0aW9uKGEsYil7IHJldHVybiAoYS5wYWdlLnBvc2l0aW9ufHw5OTkpLShiLnBhZ2UucG9zaXRpb258fDk5OSk7IH0pOwogIGVsc2UgaWYoZlNvcnQ9PT0naW1wcmVzc2lvbnMnKSBhcnIuc29ydChmdW5jdGlvbihhLGIpeyByZXR1cm4gYi5wYWdlLmltcHJlc3Npb25zLWEucGFnZS5pbXByZXNzaW9uczsgfSk7CgogIC8vIFN1bW1hcnkKICB2YXIgdHlwZXMgPSB7fTsKICBhcnIuZm9yRWFjaChmdW5jdGlvbih4KXsgdHlwZXNbeC5yZWMudHlwZV09KHR5cGVzW3gucmVjLnR5cGVdfHwwKSsxOyB9KTsKICB2YXIgcXVpY2t3aW5zID0gYXJyLmZpbHRlcihmdW5jdGlvbih4KXsgcmV0dXJuIHgucmVjLnF1aWNrV2luOyB9KS5sZW5ndGg7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N1bW1hcnknKS5pbm5lckhUTUwgPQogICAgJzxkaXYgY2xhc3M9InN1bS1jYXJkIj48ZGl2IGNsYXNzPSJzdW0tbiIgc3R5bGU9ImNvbG9yOnZhcigtLWJsdWUpIj4nK2Fyci5sZW5ndGgrJzwvZGl2PjxkaXYgY2xhc3M9InN1bS1sIj5Ub3RhbCBwYWdlczwvZGl2PjwvZGl2PicKICAgKyc8ZGl2IGNsYXNzPSJzdW0tY2FyZCI+PGRpdiBjbGFzcz0ic3VtLW4iIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPicrcXVpY2t3aW5zKyc8L2Rpdj48ZGl2IGNsYXNzPSJzdW0tbCI+UXVpY2sgd2luczwvZGl2PjwvZGl2PicKICAgKyc8ZGl2IGNsYXNzPSJzdW0tY2FyZCI+PGRpdiBjbGFzcz0ic3VtLW4iIHN0eWxlPSJjb2xvcjp2YXIoLS1nb2xkKSI+JysodHlwZXMuY29udGVudHx8MCkrJzwvZGl2PjxkaXYgY2xhc3M9InN1bS1sIj5OZWVkIGF1ZGl0PC9kaXY+PC9kaXY+JwogICArJzxkaXYgY2xhc3M9InN1bS1jYXJkIj48ZGl2IGNsYXNzPSJzdW0tbiIgc3R5bGU9ImNvbG9yOnZhcigtLW9yYW5nZSkiPicrKHR5cGVzLnJld3JpdGV8fDApKyc8L2Rpdj48ZGl2IGNsYXNzPSJzdW0tbCI+TmVlZCByZXdyaXRlPC9kaXY+PC9kaXY+JzsKCiAgaWYoIWFyci5sZW5ndGgpewogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlY0xpc3QnKS5pbm5lckhUTUw9JzxkaXYgY2xhc3M9ImVtcHR5Ij48aDM+Tm8gUGFnZXM8L2gzPjxwPkFkZCBwYWdlcyBpbiB0aGUgV29ya2Zsb3cgTWFuYWdlciBmaXJzdCwgb3IgYWRqdXN0IGZpbHRlcnMuPC9wPjwvZGl2Pic7CiAgICByZXR1cm47CiAgfQoKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVjTGlzdCcpLmlubmVySFRNTCA9IGFyci5tYXAoZnVuY3Rpb24oeCxpKXsKICAgIHZhciBwICAgPSB4LnBhZ2U7CiAgICB2YXIgcmVjID0geC5yZWM7CiAgICB2YXIgUiAgID0gUkVDU1tyZWMudHlwZV0gfHwgUkVDUy5jb250ZW50OwogICAgdmFyIGF1ZGl0VXJsID0gYnVpbGRBdWRpdFVybChwKTsKCiAgICB2YXIgc2hvcnRVcmw9Jyc7CiAgICB0cnl7c2hvcnRVcmw9bmV3IFVSTChwLnVybCkucGF0aG5hbWV8fCcvJzt9Y2F0Y2goZSl7c2hvcnRVcmw9cC51cmwuc2xpY2UoMCw1MCk7fQogICAgaWYoc2hvcnRVcmwubGVuZ3RoPjYwKSBzaG9ydFVybD1zaG9ydFVybC5zbGljZSgwLDYwKSsn4oCmJzsKCiAgICB2YXIgZ3NjQ2hpcHMgPSAnJzsKICAgIGlmKHAucG9zaXRpb24pICAgIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5Qb3M8L3N0cm9uZz4gJytNYXRoLnJvdW5kKHAucG9zaXRpb24pKyc8L3NwYW4+JzsKICAgIGlmKHAuaW1wcmVzc2lvbnMpIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5JbXByPC9zdHJvbmc+ICcrcC5pbXByZXNzaW9ucy50b0xvY2FsZVN0cmluZygpKyc8L3NwYW4+JzsKICAgIGlmKHAuY3RyKSAgICAgICAgIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5DVFI8L3N0cm9uZz4gJytwYXJzZUZsb2F0KHAuY3RyKS50b0ZpeGVkKDEpKyclPC9zcGFuPic7CiAgICBpZihwLnNjb3JlQmVmb3JlKSBnc2NDaGlwcys9JzxzcGFuIGNsYXNzPSJtZXRhLWNoaXAiPjxzdHJvbmc+U2NvcmU8L3N0cm9uZz4gJytwLnNjb3JlQmVmb3JlKycvMTAwPC9zcGFuPic7CgogICAgdmFyIHByZWZpbGxIdG1sID0gcmVjLnByZWZpbGxlZC5tYXAoZnVuY3Rpb24oaXRlbSl7CiAgICAgIHJldHVybiAnPGRpdiBjbGFzcz0icHJlZmlsbC1yb3cgYXV0byI+PHNwYW4gY2xhc3M9InByZWZpbGwtZG90IGRvdC1hdXRvIj48L3NwYW4+JytpdGVtKyc8L2Rpdj4nOwogICAgfSkuam9pbignJyk7CiAgICB2YXIgbWFudWFsSHRtbCA9IHJlYy5tYW51YWwubWFwKGZ1bmN0aW9uKGl0ZW0pewogICAgICByZXR1cm4gJzxkaXYgY2xhc3M9InByZWZpbGwtcm93IG1hbnVhbCI+PHNwYW4gY2xhc3M9InByZWZpbGwtZG90IGRvdC1tYW51YWwiPjwvc3Bhbj4nK2l0ZW0rJzwvZGl2Pic7CiAgICB9KS5qb2luKCcnKTsKCiAgICByZXR1cm4gJzxkaXYgY2xhc3M9InJlYy1jYXJkICcrUi5jYXJkQ2xhc3MrJyI+JwoKICAgICAgLy8gSGVhZAogICAgICArJzxkaXYgY2xhc3M9InJlYy1oZWFkIj4nCiAgICAgICsnPGRpdj48c3BhbiBjbGFzcz0icmVjLWJhZGdlICcrUi5iYWRnZUNsYXNzKyciPicrUi5pY29uKycgJytSLmxhYmVsKyc8L3NwYW4+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9InJlYy1tYWluIj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLXVybCI+JytzaG9ydFVybCsnPC9kaXY+JwogICAgICArKHAua2V5d29yZD8nPGRpdiBjbGFzcz0icmVjLWt3Ij4nK3Aua2V5d29yZCsnPC9kaXY+JzonJykKICAgICAgKyc8ZGl2IGNsYXNzPSJyZWMtdGl0bGUiPicrcmVjLnRpdGxlKyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLXdoeSI+JytyZWMud2h5Kyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLWFjdGlvbiI+JytyZWMuYWN0aW9uKyc8L2Rpdj4nCiAgICAgICsoZ3NjQ2hpcHM/JzxkaXYgY2xhc3M9InJlYy1tZXRhIj4nK2dzY0NoaXBzKyc8L2Rpdj4nOicnKQogICAgICArJzwvZGl2PicKCiAgICAgIC8vIFByZS1maWxsIGluZm8KICAgICAgKyc8ZGl2IGNsYXNzPSJwcmVmaWxsLWJveCI+JwogICAgICArJzxkaXYgY2xhc3M9InByZWZpbGwtdGl0bGUiPkluIFBVTFNFK05FWFVTPC9kaXY+JwogICAgICArKHByZWZpbGxIdG1sPyc8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07Y29sb3I6dmFyKC0tZ3JlZW4pO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTsiPuKckyBBdXRvLWluZ2V2dWxkPC9kaXY+JytwcmVmaWxsSHRtbDonJykKICAgICAgKyhtYW51YWxIdG1sPyc8ZGl2IHN0eWxlPSJtYXJnaW46OHB4IDAgNHB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjhweDtsZXR0ZXItc3BhY2luZzouMDhlbTtjb2xvcjp2YXIoLS1kaW0pO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTsiPuKcjiBIYW5kbWF0aWc8L2Rpdj4nK21hbnVhbEh0bWw6JycpCiAgICAgICsnPC9kaXY+JwogICAgICArJzwvZGl2PicKCiAgICAgIC8vIEZvb3RlciB3aXRoIGFjdGlvbgogICAgICArJzxkaXYgY2xhc3M9InJlYy1mb290Ij4nCiAgICAgICsnPGEgaHJlZj0iJythdWRpdFVybCsnIiB0YXJnZXQ9Il9ibGFuayIgY2xhc3M9ImFjdGlvbi1idG4gYWN0aW9uLWJ0bi1nb2xkIj7wn5SsIE9wZW4gaW4gUFVMU0UrTkVYVVMg4oaSPC9hPicKICAgICAgKyc8YSBocmVmPSInK3AudXJsKyciIHRhcmdldD0iX2JsYW5rIiBjbGFzcz0iYWN0aW9uLWJ0biBhY3Rpb24tYnRuLWJsdWUiPuKGlyBPcGVuIHBhZ2luYTwvYT4nCiAgICAgICsnPHNwYW4gY2xhc3M9InRpbWUtY2hpcCI+4o+xICcrcmVjLnRpbWUrJzwvc3Bhbj4nCiAgICAgICsocmVjLmF1ZGl0Rm9jdXM/JzxzcGFuIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tc3ViKTtsZXR0ZXItc3BhY2luZzouMDZlbTsiPicrcmVjLmF1ZGl0Rm9jdXMrJzwvc3Bhbj4nOicnKQogICAgICArJzwvZGl2PicKCiAgICAgICsnPC9kaXY+JzsKICB9KS5qb2luKCcnKTsKfQoKbG9hZCgpOwpyZW5kZXIoKTsKPC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=", "base64").toString("utf8"));
});
app.get('/handleiding',           (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="nl" id="htmlRoot">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>ContentScale SEO Audit System — Handleiding / User Guide</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#030712;--card:#0f172a;--surface:#1e293b;--border:#334155;
  --ink:#f9fafb;--muted:#94a3b8;--sub:#64748b;
  --purple:#a78bfa;--blue:#60a5fa;--green:#4ade80;
  --gold:#fbbf24;--red:#f43f3f;--orange:#fb923c;
}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',sans-serif;line-height:1.7;}
.wrap{max-width:900px;margin:0 auto;padding:40px 24px 100px;}

/* Header */
.header{text-align:center;padding:48px 0 40px;border-bottom:1px solid var(--border);margin-bottom:48px;}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.06em;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-decoration:none;display:inline-block;margin-bottom:16px;}
.header h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(32px,5vw,52px);letter-spacing:.04em;line-height:1.05;margin-bottom:12px;background:linear-gradient(135deg,var(--gold),var(--ink));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.header p{color:var(--muted);font-size:15px;max-width:600px;margin:0 auto;}

/* Nav */
.toc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:24px 28px;margin-bottom:48px;}
.toc-title{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--sub);margin-bottom:14px;}
.toc a{display:block;color:var(--muted);text-decoration:none;padding:5px 0;font-size:14px;border-bottom:1px solid rgba(255,255,255,.03);transition:color .15s;}
.toc a:hover{color:var(--gold);}
.toc a span{color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:11px;margin-right:10px;}

/* Sections */
.section{margin-bottom:56px;}
.section-label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--sub);margin-bottom:8px;}
.section h2{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,4vw,38px);letter-spacing:.04em;margin-bottom:16px;color:var(--gold);}
.section h3{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.03em;margin:28px 0 10px;color:var(--ink);}
.section p{color:var(--muted);font-size:14px;margin-bottom:14px;line-height:1.75;}
.section p strong{color:var(--ink);}

/* Tool cards */
.tool-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:16px;position:relative;overflow:hidden;}
.tool-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
.tool-card.gold::before{background:var(--gold);}
.tool-card.purple::before{background:var(--purple);}
.tool-card.blue::before{background:var(--blue);}
.tool-card.green::before{background:var(--green);}
.tool-card.orange::before{background:var(--orange);}
.tool-name{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.04em;margin-bottom:4px;}
.tool-url{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--blue);margin-bottom:10px;}
.tool-desc{font-size:13px;color:var(--muted);line-height:1.7;}
.tool-badge{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:4px;margin-bottom:10px;}
.badge-internal{background:rgba(251,191,36,.12);color:var(--gold);border:1px solid rgba(251,191,36,.3);}
.badge-client{background:rgba(74,222,128,.12);color:var(--green);border:1px solid rgba(74,222,128,.3);}
.badge-noindex{background:rgba(244,63,63,.12);color:var(--red);border:1px solid rgba(244,63,63,.3);}

/* Flow diagram */
.flow{display:flex;flex-direction:column;gap:0;margin:24px 0;}
.flow-step{display:flex;gap:16px;align-items:flex-start;}
.flow-left{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:40px;}
.flow-num{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;flex-shrink:0;}
.flow-line{width:2px;flex:1;min-height:24px;background:var(--border);margin:2px 0;}
.flow-body{flex:1;padding-bottom:24px;}
.flow-title{font-weight:700;font-size:15px;color:var(--ink);margin-bottom:4px;}
.flow-sub{font-size:13px;color:var(--muted);line-height:1.65;}
.flow-url{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--blue);margin-top:4px;}

/* Steps */
.steps-list{counter-reset:step;}
.step-item{display:flex;gap:14px;margin-bottom:20px;padding:16px 18px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:8px;}
.step-num{font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1;flex-shrink:0;width:28px;}
.step-body strong{color:var(--ink);display:block;margin-bottom:4px;font-size:14px;}
.step-body span{font-size:13px;color:var(--muted);line-height:1.65;}
.step-body code{font-family:'IBM Plex Mono',monospace;font-size:11px;background:var(--surface);padding:1px 6px;border-radius:3px;color:var(--blue);}

/* Info boxes */
.info-box{border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px;line-height:1.7;}
.info-box.gold{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);color:var(--muted);}
.info-box.gold strong{color:var(--gold);}
.info-box.blue{background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);color:var(--muted);}
.info-box.blue strong{color:var(--blue);}
.info-box.green{background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);color:var(--muted);}
.info-box.green strong{color:var(--green);}
.info-box.red{background:rgba(244,63,63,.06);border:1px solid rgba(244,63,63,.2);color:var(--muted);}
.info-box.red strong{color:var(--red);}

/* Table */
.data-table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;}
.data-table th{background:var(--surface);color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:9px 12px;text-align:left;border:1px solid var(--border);}
.data-table td{padding:9px 12px;border:1px solid var(--border);color:var(--muted);vertical-align:top;}
.data-table td strong{color:var(--ink);}
.data-table tr:hover td{background:rgba(255,255,255,.02);}

/* Scenario boxes */
.scenario{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px 18px;margin-bottom:10px;}
.scenario-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.scenario-badge{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:4px;}
.scenario-title{font-weight:700;font-size:14px;color:var(--ink);}
.scenario p{font-size:13px;color:var(--muted);margin:0;}
.scenario .action{font-size:13px;color:var(--ink);font-weight:600;margin-top:6px;display:flex;align-items:flex-start;gap:6px;}
.scenario .action::before{content:'→';color:var(--gold);flex-shrink:0;}

/* Divider */
hr{border:none;border-top:1px solid var(--border);margin:40px 0;}
.nl{}.en{display:none;}
body.lang-en .nl{display:none !important;}
body.lang-en .en{display:block !important;}
body.lang-en span.en{display:inline !important;}
body.lang-en span.nl{display:none !important;}

/* ── MOBILE RESPONSIVE ─────────────────────────── */
html,body{max-width:100%;overflow-x:hidden;}
img,table,iframe{max-width:100%;}
@media(max-width:768px){
  .wrap{padding:0 14px 60px!important;}
  .topbar{padding:12px 0;gap:8px;}
  .topbar-right{gap:5px;}
  .btn{font-size:8px;padding:6px 10px;}
  .overview,.summary{grid-template-columns:repeat(3,1fr)!important;}
  .add-row{flex-direction:column;}
  .add-row input,.add-row select{width:100%!important;}
  .filter-bar{flex-direction:column;gap:6px;}
  .filter-bar select,.filter-bar input{width:100%!important;}
  .card-head{flex-wrap:wrap;gap:6px;}
  .rec-head{flex-direction:column;}
  .prefill-box{max-width:100%;width:100%;}
  .g2,.g3,.g4,.cb-grid,.card-grid{grid-template-columns:1fr!important;}
  .project-bar{flex-direction:column;}
  .pf{min-width:100%!important;}
  .steps{flex-direction:column!important;}
  .step{border-right:none!important;border-bottom:1px solid var(--border);}
  .step:last-child{border-bottom:none;}
  .how-step{flex-direction:column;}
  .flow-step{gap:10px;}
  .rec-foot{flex-direction:column;gap:8px;}
  .action-btn{width:100%;justify-content:center;font-size:16px!important;}
  .modes{grid-template-columns:1fr!important;}
  .mode-btn{border-right:none!important;border-bottom:1px solid var(--border);}
}
@media(max-width:480px){
  .overview,.summary{grid-template-columns:1fr 1fr!important;}
  .topbar{flex-direction:column;align-items:flex-start;}
  .topbar-right{flex-wrap:wrap;}
  .card-meta{flex-wrap:wrap;gap:4px;}
  .card-actions,.card-actions .btn,.card-foot{flex-wrap:wrap;}
  h1,h2,.tool-name{word-break:break-word;}
  .panel{padding:16px!important;}
  .section{padding:14px 16px!important;}
}
</style>
</head>
<body>
<div class="wrap">

<!-- Header -->
<div class="header">
  <a href="https://contentscale.site" class="brand">ContentScale</a>
  <h1>SEO Audit System Handleiding</h1>
  <p class="nl">Stap-voor-stap uitleg van het volledige systeem — van GSC data tot afgehandelde audit. Voor intern gebruik.</p>
  <p class="en" style="display:none;">Step-by-step explanation of the complete system — from GSC data to completed audit. For internal use.</p>
  <div style="margin-top:20px;">
    <button onclick="setLang('nl')" id="btnNL" style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:5px 0 0 5px;border:1px solid var(--gold);background:var(--gold);color:#000;cursor:pointer;font-weight:700;">🇳🇱 NL</button>
    <button onclick="setLang('en')" id="btnEN" style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:0 5px 5px 0;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;">🇺🇸 EN</button>
  </div>
</div>

<!-- Inhoud -->
<div class="toc">
  <div class="toc-title"><span class="nl">Inhoud</span><span class="en" style="display:none;">Contents</span></div>
  <a href="#overzicht"><span>01</span><span class="nl">Overzicht — wat is het systeem?</span><span class="en" style="display:none;">Overview — what is the system?</span></a>
  <a href="#tools"><span>02</span><span class="nl">De 5 tools — wat doet elke pagina?</span><span class="en" style="display:none;">The 5 tools — what does each page do?</span></a>
  <a href="#flow"><span>03</span><span class="nl">De volledige flow — stap voor stap</span><span class="en" style="display:none;">The complete flow — step by step</span></a>
  <a href="#gsc"><span>04</span><span class="nl">GSC uitleg — impressies, CTR, positie</span><span class="en" style="display:none;">GSC explained — impressions, CTR, position</span></a>
  <a href="#scenarios"><span>05</span><span class="nl">Aanbevelingen — wanneer doe je wat?</span><span class="en" style="display:none;">Recommendations — when to do what?</span></a>
  <a href="#audit"><span>06</span><span class="nl">PULSE+NEXUS uitvoeren — hoe werkt het?</span><span class="en" style="display:none;">Running PULSE+NEXUS — how does it work?</span></a>
  <a href="#checklist"><span>07</span><span class="nl">Checklist — wat doe je per pagina?</span><span class="en" style="display:none;">Checklist — what to do per page?</span></a>
  <a href="#deploy"><span>08</span><span class="nl">Deployen — bestanden en routes</span><span class="en" style="display:none;">Deploy — files and routes</span></a>
</div>

<!-- 01 Overzicht -->
<div class="section" id="overzicht">
  <div class="section-label"><span class="nl">Sectie 01</span><span class="en" style="display:none;">Section 01</span></div>
  <h2><span class="nl">Wat is het systeem?</span><span class="en" style="display:none;">What is the system?</span></h2>
  <p><span class="nl">Het ContentScale SEO Audit System bestaat uit <strong>5 gekoppelde tools</strong> waarmee je systematisch pagina's van een website kunt auditen, verbeteren en bijhouden. Alles werkt samen — data stroomt automatisch van de ene tool naar de andere.</span><span class="en" style="display:none;">The ContentScale SEO Audit System consists of <strong>5 connected tools</strong> for systematically auditing, improving, and tracking pages of a website. Everything works together — data flows automatically from one tool to the next.</span></p>

  <div class="info-box gold">
    <span class="nl"><strong>Het doel:</strong> Pagina's die bijna op pagina 1 staan (positie 11-30) identificeren, auditen met PULSE+NEXUS, fixes doorvoeren, en het resultaat meten met de ContentScore. Zo herstel je systematisch verloren Google traffic.</span><span class="en" style="display:none;"><strong>The goal:</strong> Identify pages close to page 1 (position 11-30), audit with PULSE+NEXUS, implement fixes, and measure the result with ContentScore. This is how you systematically recover lost Google traffic.</span>
  </div>

  <p><span class="nl">Het systeem is <strong>intern</strong> — niet zichtbaar voor Google (noindex) en niet voor klanten. Er is één uitzondering: de Audit Intake Form, die is voor klanten die een audit willen aanvragen.</span><span class="en" style="display:none;">The system is <strong>internal</strong> — not visible to Google (noindex) and not to clients. One exception: the Audit Intake Form, which is for clients who want to request an audit.</span></p>
</div>

<!-- 02 De tools -->
<div class="section" id="tools">
  <div class="section-label"><span class="nl">Sectie 02</span><span class="en" style="display:none;">Section 02</span></div>
  <h2><span class="nl">De 5 tools</span><span class="en" style="display:none;">The 5 tools</span></h2>

  <div class="tool-card gold">
    <span class="tool-badge badge-internal">Intern</span>
    <span class="tool-badge badge-noindex" style="margin-left:6px;">Noindex</span>
    <div class="tool-name">1 — Workflow Manager</div>
    <div class="tool-url">app.contentscale.site/audit-workflow</div>
    <div class="tool-desc">
      <span class="nl">Je cockpit. Hier beheer je alle pagina's van een client. Je importeert GSC data, ziet welke pagina's prioriteit hebben, vinkt taken af per pagina en houdt de voortgang bij.<br><br>
      <strong>Wat je hier doet:</strong> GSC CSV importeren → pagina's krijgen automatisch prioriteit → doorsturen naar Recommendations voor aanbevelingen → afvinken als gedaan.<br><br>
      <strong>Data blijft bewaard</strong> in de browser (localStorage) — je kunt de sessie afsluiten en later verdergaan.</span>
      <span class="en" style="display:none;">Your cockpit. Manage all client pages here. Import GSC data, see which pages have priority, check off tasks per page and track progress.<br><br>
      <strong>What you do here:</strong> Import GSC CSV → pages get priority automatically → send to Recommendations for advice → check off when done.<br><br>
      <strong>Data is saved</strong> in the browser (localStorage) — you can close the session and continue later.</span>
    </div>
  </div>

  <div class="tool-card orange">
    <span class="tool-badge badge-internal">Intern</span>
    <span class="tool-badge badge-noindex" style="margin-left:6px;">Noindex</span>
    <div class="tool-name">2 — Recommendations Engine</div>
    <div class="tool-url">app.contentscale.site/audit-recommendations</div>
    <div class="tool-desc">
      <span class="nl">Leest de data uit de Workflow Manager en geeft per pagina automatisch de beste aanbeveling. Je ziet in één oogopslag: wat is het probleem, wat is de actie, hoeveel tijd kost het, en wat wordt automatisch ingevuld in PULSE+NEXUS.<br><br>
      <strong>Wat je hier doet:</strong> Kijken welke pagina's quick wins zijn → klikken op "Open in PULSE+NEXUS" → audit uitvoeren.</span>
      <span class="en" style="display:none;">Reads data from the Workflow Manager and automatically gives the best recommendation per page. At a glance: what is the problem, what is the action, how long will it take, and what gets pre-filled in PULSE+NEXUS.<br><br>
      <strong>What you do here:</strong> See which pages are quick wins → click "Open in PULSE+NEXUS" → run the audit.</span>
    </div>
  </div>

  <div class="tool-card purple">
    <span class="tool-badge badge-internal">Intern</span>
    <span class="tool-badge badge-noindex" style="margin-left:6px;">Noindex</span>
    <div class="tool-name">3 — PULSE + NEXUS Audit Engine</div>
    <div class="tool-url">app.contentscale.site/audit-seo</div>
    <div class="tool-desc">
      Het analysetools. Voert een 10-stappen audit uit op één specifieke pagina. Gebruikt Gemini AI om de werkelijke content te analyseren en geeft concrete aanbevelingen met priority actions bovenaan.<br><br>
      <strong>Twee modi:</strong><br>
      — <strong>Bulk Scan:</strong> Upload GSC CSV → alle pagina's gerangschikt op kans<br>
      — <strong>Deep Dive:</strong> Één pagina volledig analyseren — dit is de kern<br><br>
      <strong>Wordt automatisch ingevuld</strong> als je vanuit Recommendations klikt: URL, keyword, positie, impressies, CTR staan al klaar. Jij plakt alleen nog de pagina HTML en eventueel competitor HTML.
    </div>
  </div>

  <div class="tool-card blue">
    <span class="tool-badge badge-internal">Intern</span>
    <div class="tool-name">4 — ContentScore Scanner</div>
    <div class="tool-url">app.contentscale.site</div>
    <div class="tool-desc">
      De gratis scanner. Plak een URL en krijg een score van 0-100 op basis van GRAAF (50pt) + CRAFT (30pt) + Technical SEO (20pt).<br><br>
      <strong>Gebruik in het audit systeem:</strong> Scan een pagina VOOR je begint met auditen → noteer de score in de Workflow Manager → doe de audit → fix de pagina → scan opnieuw → noteer de nieuwe score. Het verschil is je bewijs dat het werkt.
    </div>
  </div>

  <div class="tool-card green">
    <span class="tool-badge badge-client">Voor klanten</span>
    <div class="tool-name">5 — Audit Intake Form</div>
    <div class="tool-url">app.contentscale.site/audit-intake</div>
    <div class="tool-desc">
      Het formulier dat klanten invullen als ze een audit willen aanvragen. Ze uploaden hun GSC CSV, geven de pagina URL en keyword op, en het formulier stuurt alles automatisch per email naar <strong><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="8be2e5ede4cbe8e4e5ffeee5fff8e8eae7eea5f8e2ffee">[email&#160;protected]</a></strong>.<br><br>
      <strong>Jij ontvangt:</strong> Email met alle data + bijlagen + directe link om de pagina in PULSE+NEXUS te openen.
    </div>
  </div>
</div>

<!-- 03 Flow -->
<div class="section" id="flow">
  <div class="section-label"><span class="nl">Sectie 03</span><span class="en" style="display:none;">Section 03</span></div>
  <h2><span class="nl">De volledige flow</span><span class="en" style="display:none;">The complete flow</span></h2>
  <p><span class="nl">Zo gebruik je het systeem van begin tot eind voor één client:</span><span class="en" style="display:none;">This is how you use the system from start to finish for one client:</span></p>

  <div class="flow">

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">1</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">GSC CSV exporteren</div>
        <div class="flow-sub">Ga naar <strong>Google Search Console</strong> van de client. Klik op <strong>Performance</strong> → <strong>Pages tab</strong> → rechtsboven op <strong>Export → Download CSV</strong>. Doe hetzelfde voor de <strong>Queries tab</strong> (optioneel maar nuttig). Sla de bestanden op.</div>
        <div class="flow-url">search.google.com/search-console</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">2</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Workflow Manager openen + GSC importeren</div>
        <div class="flow-sub">Open de Workflow Manager. Vul bovenaan de clientnaam, website en deadline in. Klik op <strong>📊 Import GSC CSV</strong> en upload het Pages CSV bestand. Alle pagina's laden automatisch met hun positie, impressies en prioriteit.</div>
        <div class="flow-url">app.contentscale.site/audit-workflow</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">3</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Prioriteiten bekijken</div>
        <div class="flow-sub">De manager sorteert automatisch op kans. <strong>Rood (High)</strong> = positie 11-30 of pagina 1 met lage CTR — dit zijn de meest waardevolle pagina's. <strong>Geel (Medium)</strong> = positie 31-60. <strong>Groen (Low)</strong> = al goed of weinig volume. Filter op High Priority om te beginnen.</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">4</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">ContentScore scannen (voor)</div>
        <div class="flow-sub">Klik per pagina op <strong>📊 Scan Score</strong>. De huidige ContentScore wordt opgehaald en opgeslagen als "Score Before". Dit is je nulmeting. De prioriteit verandert NIET op basis van de score — alleen GSC data bepaalt prioriteit.</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">5</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Recommendations openen</div>
        <div class="flow-sub">Klik bovenaan op <strong>🎯 Recommendations</strong>. Je ziet nu per pagina de exacte aanbeveling: wat is het probleem, wat is de actie, hoeveel tijd kost het. Sorteer op Impact voor de beste quick wins bovenaan.</div>
        <div class="flow-url">app.contentscale.site/audit-recommendations</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">6</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">PULSE+NEXUS audit uitvoeren</div>
        <div class="flow-sub">Klik op <strong>🔬 Open in PULSE+NEXUS</strong>. URL, keyword, positie, impressies en CTR staan automatisch ingevuld. Je hoeft alleen nog te plakken:<br>
        — <strong>Pagina HTML:</strong> open de pagina → rechtsklik → Paginabron weergeven → Ctrl+A → Ctrl+C → plak<br>
        — <strong>Competitor HTML:</strong> optioneel — als je leeg laat vergelijkt het tool met Surfer SEO + MarketMuse benchmark<br>
        — <strong>Sitemap URLs:</strong> optioneel — voor interne link aanbevelingen<br><br>
        Klik dan op <strong>Run Full Audit</strong>. De Priority Actions verschijnen als eerste.</div>
        <div class="flow-url">app.contentscale.site/audit-seo</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">7</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Fixes doorvoeren</div>
        <div class="flow-sub">Voer de Priority Actions uit op de pagina. Minimaal: title tag, meta description, H1, FAQ schema. Daarna de content fixes. Exporteer de aanbevelingen met de Copy knop per sectie.</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(251,191,36,.15);color:var(--gold);">8</div>
        <div class="flow-line"></div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Afvinken + score meten</div>
        <div class="flow-sub">Ga terug naar de Workflow Manager (← Terug naar Workflow knop). Vink de checklist items af die je hebt gedaan. Scan de pagina opnieuw voor de "Score After". Klik op <strong>✓ Mark Done</strong> als de pagina klaar is.</div>
      </div>
    </div>

    <div class="flow-step">
      <div class="flow-left">
        <div class="flow-num" style="background:rgba(74,222,128,.15);color:var(--green);">9</div>
      </div>
      <div class="flow-body">
        <div class="flow-title">Exporteren + volgende pagina</div>
        <div class="flow-sub">Klik op <strong>↓ Export CSV</strong> om je voortgang op te slaan. Volgende sessie: <strong>↑ Import Progress</strong> om verder te gaan. Klik op <strong>📄 Client Report</strong> voor een nette overzichtspagina voor de klant.</div>
      </div>
    </div>

  </div>
</div>

<!-- 04 GSC -->
<div class="section" id="gsc">
  <div class="section-label"><span class="nl">Sectie 04</span><span class="en" style="display:none;">Section 04</span></div>
  <h2><span class="nl">GSC uitleg — impressies, CTR en positie</span><span class="en" style="display:none;">GSC explained — impressions, CTR and position</span></h2>

  <table class="data-table">
    <thead>
      <tr><th><span class="nl">Begrip</span><span class="en" style="display:none;">Term</span></th><th><span class="nl">Wat betekent het?</span><span class="en" style="display:none;">What does it mean?</span></th><th><span class="nl">Wat zegt het je?</span><span class="en" style="display:none;">What does it tell you?</span></th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Impressies</strong></td>
        <td>Hoe vaak jouw pagina verschijnt in de zoekresultaten — ook als niemand klikt. Dit is het zoekvolume voor jouw pagina.</td>
        <td>Hoge impressies = mensen zoeken ernaar. Er is vraag. De pagina heeft potentie.</td>
      </tr>
      <tr>
        <td><strong>Clicks</strong></td>
        <td>Hoe vaak iemand op jouw pagina klikt in de zoekresultaten.</td>
        <td>Lage clicks bij hoge impressies = mensen zien je maar kiezen je niet.</td>
      </tr>
      <tr>
        <td><strong>CTR %</strong></td>
        <td>Click-Through Rate. Percentage van impressies dat resulteert in een klik. Clicks ÷ Impressies × 100.</td>
        <td>CTR onder 2% = title/meta niet aantrekkelijk genoeg. CTR boven 5% = goed.</td>
      </tr>
      <tr>
        <td><strong>Positie</strong></td>
        <td>De gemiddelde ranking van jouw pagina in Google. Positie 1 = bovenaan. Positie 11 = begin van pagina 2.</td>
        <td>Positie 11-30 = meest kansrijk voor verbetering. Eén goede audit kan je naar pagina 1 brengen.</td>
      </tr>
    </tbody>
  </table>

  <div class="info-box gold">
    <strong>De gouden combinatie:</strong> Hoge impressies (veel zoekvolume) + positie 11-30 (net niet pagina 1) = de pagina waar je het meeste te winnen hebt. Dat is waar je mee begint.
  </div>

  <h3>Wat doe je in elk scenario?</h3>

  <table class="data-table">
    <thead>
      <tr><th><span class="nl">Situatie</span><span class="en" style="display:none;">Situation</span></th><th><span class="nl">Probleem</span><span class="en" style="display:none;">Problem</span></th><th><span class="nl">Oplossing</span><span class="en" style="display:none;">Solution</span></th><th><span class="nl">Tijd</span><span class="en" style="display:none;">Time</span></th></tr>
    </thead>
    <tbody>
      <tr><td>Pos 1-10 + CTR &lt; 2%</td><td>Staat bovenaan maar trekt niet aan</td><td>Title + meta herschrijven</td><td>30 min</td></tr>
      <tr><td>Pos 11-20 + hoge impressies</td><td>Net niet pagina 1</td><td>Volledige PULSE+NEXUS audit</td><td>2-3 uur</td></tr>
      <tr><td>Pos 21-30 + score &lt; 70</td><td>Content te zwak</td><td>Audit + herschrijven</td><td>3-5 uur</td></tr>
      <tr><td>Pos 31-60 + hoge impressies</td><td>Content veel te zwak voor pagina 1</td><td>Diepgaande audit</td><td>4-6 uur</td></tr>
      <tr><td>Pos 60+ + lage impressies</td><td>Weinig vraag of pagina te zwak</td><td>Keyword research eerst</td><td>Nader bepalen</td></tr>
    </tbody>
  </table>
</div>

<!-- 05 Scenarios -->
<div class="section" id="scenarios">
  <div class="section-label"><span class="nl">Sectie 05</span><span class="en" style="display:none;">Section 05</span></div>
  <h2><span class="nl">Aanbevelingen — wanneer doe je wat?</span><span class="en" style="display:none;">Recommendations — when to do what?</span></h2>
  <p><span class="nl">De Recommendations Engine berekent dit automatisch. Dit is de logica erachter:</span><span class="en" style="display:none;">The Recommendations Engine calculates this automatically. Here is the logic behind it:</span></p>

  <div class="scenario">
    <div class="scenario-head">
      <span class="scenario-badge" style="background:rgba(74,222,128,.12);color:var(--green);border:1px solid rgba(74,222,128,.3);">⚡ Quick Win</span>
      <span class="scenario-title">Positie 1-10 + CTR onder 2%</span>
    </div>
    <p>Je staat al op pagina 1 maar searchers klikken niet. De title tag of meta description trekt niet genoeg aan.</p>
    <div class="action">Herschrijf title (max 60 tekens) + meta description (max 155 tekens) met power words, getallen of urgentie. Dit kan in 30 minuten. Geen volledige audit nodig.</div>
  </div>

  <div class="scenario">
    <div class="scenario-head">
      <span class="scenario-badge" style="background:rgba(96,165,250,.12);color:var(--blue);border:1px solid rgba(96,165,250,.3);">📈 CTR Fix</span>
      <span class="scenario-title">Positie 11-20 + CTR onder 1.5%</span>
    </div>
    <p>Bijna pagina 1, maar twee problemen tegelijk: title trekt niet aan EN content is nog niet sterk genoeg.</p>
    <div class="action">Stap 1: title + meta herschrijven (30 min). Stap 2: volledige audit voor de push naar pagina 1 (2-3 uur).</div>
  </div>

  <div class="scenario">
    <div class="scenario-head">
      <span class="scenario-badge" style="background:rgba(251,191,36,.12);color:var(--gold);border:1px solid rgba(251,191,36,.3);">📝 Content Upgrade</span>
      <span class="scenario-title">Positie 11-30 + score onder 70</span>
    </div>
    <p>Content is te zwak voor pagina 1. Met betere content en schema kun je de sprong maken.</p>
    <div class="action">Volledige PULSE+NEXUS audit. Focus op Priority Actions (stap 0), Content Gap (stap 4) en PULSE Rewrites (stap 5).</div>
  </div>

  <div class="scenario">
    <div class="scenario-head">
      <span class="scenario-badge" style="background:rgba(251,146,60,.12);color:var(--orange);border:1px solid rgba(251,146,60,.3);">✏️ Rewrite</span>
      <span class="scenario-title">Positie 31-60 + hoge impressies</span>
    </div>
    <p>Veel zoekvolume maar Google beoordeelt de pagina als te zwak voor de top. Fundamentele verbetering nodig.</p>
    <div class="action">Alle 10 stappen van PULSE+NEXUS doorlopen. Daarna pagina volledig herschrijven op basis van de aanbevelingen.</div>
  </div>

  <div class="scenario">
    <div class="scenario-head">
      <span class="scenario-badge" style="background:rgba(167,139,250,.12);color:var(--purple);border:1px solid rgba(167,139,250,.3);">🔗 Authority</span>
      <span class="scenario-title">Positie 1-10 + score boven 85</span>
    </div>
    <p>Pagina presteert al goed. Content en techniek zijn op orde.</p>
    <div class="action">Focus op interne links, backlinks en gezaghebbende bronnen. NEXUS stap 6 in PULSE+NEXUS.</div>
  </div>
</div>

<!-- 06 Audit -->
<div class="section" id="audit">
  <div class="section-label"><span class="nl">Sectie 06</span><span class="en" style="display:none;">Section 06</span></div>
  <h2><span class="nl">PULSE+NEXUS uitvoeren</span><span class="en" style="display:none;">Running PULSE+NEXUS</span></h2>

  <div class="info-box blue">
    <strong>Tip:</strong> Als je vanuit Recommendations klikt op "Open in PULSE+NEXUS" staan URL, keyword, positie, impressies en CTR al ingevuld. Je hoeft alleen nog de HTML toe te voegen.
  </div>

  <h3>Wat vul je handmatig in?</h3>

  <div class="steps-list">
    <div class="step-item">
      <div class="step-num">1</div>
      <div class="step-body">
        <strong>Pagina HTML (stap ③) — bijna altijd verplicht</strong>
        <span>Open de pagina in Chrome → rechtsklik → <code>Paginabron weergeven</code> → <code>Ctrl+A</code> → <code>Ctrl+C</code> → plak in het veld. Het systeem leest dan de werkelijke H1, H2s, schema en word count — niet een gok op basis van de URL.</span>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">2</div>
      <div class="step-body">
        <strong>Competitor HTML (stap ④) — optioneel</strong>
        <span>Bezoek een competitor pagina → Paginabron → kopieer → plak. Als je dit leeg laat vergelijkt het systeem automatisch met wat bekend is over Surfer SEO en MarketMuse. Voor de meest nauwkeurige analyse: plak echte competitor HTML.</span>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">3</div>
      <div class="step-body">
        <strong>Sitemap URLs (stap ⑤) — optioneel maar waardevol</strong>
        <span>Plak de URLs van de website (één per regel). Het systeem zoekt dan de 5 beste pagina's om intern naar te linken — met exacte anchor tekst. Zonder dit geeft het alleen algemene adviezen.</span>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">4</div>
      <div class="step-body">
        <strong>Klik op Run Full Audit</strong>
        <span>De audit draait 10 stappen. <strong>Priority Actions (stap 0) verschijnen als eerste</strong> — dit zijn de 7 meest impactvolle acties. Begin altijd hier. De rest van de stappen geven diepere analyse.</span>
      </div>
    </div>
  </div>

  <h3>De 10 stappen van PULSE+NEXUS</h3>
  <table class="data-table">
    <thead><tr><th><span class="nl">Stap</span><span class="en" style="display:none;">Step</span></th><th><span class="nl">Wat het doet</span><span class="en" style="display:none;">What it does</span></th><th><span class="nl">Wanneer belangrijk?</span><span class="en" style="display:none;">When important?</span></th></tr></thead>
    <tbody>
      <tr><td><strong>0 — Priority Actions</strong></td><td>7 concrete acties, gerangschikt op impact. Altijd als eerste lezen.</td><td>Altijd</td></tr>
      <tr><td><strong>1 — Intent analyse</strong></td><td>Klopt de zoekintentie? AI Overview risico?</td><td>Bij lage CTR</td></tr>
      <tr><td><strong>2 — CTR Surgery</strong></td><td>Nieuwe title + meta description</td><td>CTR onder 2%</td></tr>
      <tr><td><strong>3 — Competitor Diff</strong></td><td>Jouw pagina vs competitors</td><td>Altijd</td></tr>
      <tr><td><strong>4 — Content Gap</strong></td><td>Wat mis je dat competitors wel hebben?</td><td>Score onder 70</td></tr>
      <tr><td><strong>5 — PULSE Rewrites</strong></td><td>Voor/na herschrijvingen van intro, CTA, structuur</td><td>Bij rewrite</td></tr>
      <tr><td><strong>6 — NEXUS + interne links</strong></td><td>Welke pagina's linken naar elkaar?</td><td>Altijd</td></tr>
      <tr><td><strong>7 — Architecture</strong></td><td>H1-H3 structuur optimaliseren</td><td>Bij herschrijven</td></tr>
      <tr><td><strong>8 — Technical + Schema</strong></td><td>FAQPage JSON-LD, alt tekst, canonical</td><td>Altijd</td></tr>
      <tr><td><strong>9 — Score projectie</strong></td><td>Verwachte score en traffic na fixes</td><td>Voor rapportage</td></tr>
      <tr><td><strong>10 — 90-dagen plan</strong></td><td>Week-voor-week actieplan</td><td>Bij oplevering aan client</td></tr>
    </tbody>
  </table>
</div>

<!-- 07 Checklist -->
<div class="section" id="checklist">
  <div class="section-label"><span class="nl">Sectie 07</span><span class="en" style="display:none;">Section 07</span></div>
  <h2><span class="nl">Checklist per pagina</span><span class="en" style="display:none;">Checklist per page</span></h2>
  <p><span class="nl">In de Workflow Manager heeft elke pagina een checklist van 23 items. Dit zijn de standaard taken per audit:</span><span class="en" style="display:none;">In the Workflow Manager, each page has a checklist of 23 items. These are the standard tasks per audit:</span></p>

  <h3><span class="nl">Audit (starten en afronden)</span><span class="en" style="display:none;">Audit (start and finish)</span></h3>
  <table class="data-table">
    <thead><tr><th>Item</th><th>Wat doe je?</th></tr></thead>
    <tbody>
      <tr><td>ContentScore scan gedaan</td><td>Score Before invullen via 📊 Scan Score knop</td></tr>
      <tr><td>PULSE+NEXUS audit gedaan</td><td>10 stappen doorlopen en Priority Actions gelezen</td></tr>
      <tr><td>GSC data genoteerd</td><td>Positie, impressies en CTR ingevuld in manager</td></tr>
      <tr><td>Pagina herpubliceerd</td><td>Timestamp vernieuwd na fixes</td></tr>
      <tr><td>GSC reindex aangevraagd</td><td>Via GSC → URL inspectie → Indexering aanvragen</td></tr>
      <tr><td>GSC recheck ingepland</td><td>14 dagen later controleren in GSC</td></tr>
    </tbody>
  </table>

  <h3>Content fixes</h3>
  <table class="data-table">
    <thead><tr><th>Item</th><th>Norm</th></tr></thead>
    <tbody>
      <tr><td>H1 geoptimaliseerd</td><td>Primair keyword erin, duidelijk en aantrekkelijk</td></tr>
      <tr><td>H2 structuur herzien</td><td>Logische volgorde, keywords in kopjes</td></tr>
      <tr><td>SEO title bijgewerkt</td><td>50-60 tekens, keyword vooraan</td></tr>
      <tr><td>Meta description bijgewerkt</td><td>150-160 tekens, call-to-action erin</td></tr>
      <tr><td>Content gaps gevuld</td><td>Ontbrekende subtopics toegevoegd</td></tr>
      <tr><td>Word count voldoende</td><td>Minimaal 1500 woorden voor informatieve pagina's</td></tr>
      <tr><td>Stats bijgewerkt</td><td>Alle cijfers zijn van 2025-2026</td></tr>
      <tr><td>FAQ sectie toegevoegd</td><td>Minimaal 3-5 vragen met volledige antwoorden</td></tr>
      <tr><td>Expertcitaten toegevoegd</td><td>Naam + functie + bron erbij</td></tr>
      <tr><td>E-E-A-T versterkt</td><td>Wie schreef dit, wanneer, waarom betrouwbaar?</td></tr>
      <tr><td>CTA geoptimaliseerd</td><td>Aansluitend bij het conversiedoel</td></tr>
    </tbody>
  </table>

  <h3><span class="nl">Technische fixes</span><span class="en" style="display:none;">Technical fixes</span></h3>
  <table class="data-table">
    <thead><tr><th>Item</th><th>Norm</th></tr></thead>
    <tbody>
      <tr><td>Article schema toegevoegd</td><td>JSON-LD in de &lt;head&gt;</td></tr>
      <tr><td>FAQPage schema toegevoegd</td><td>Elke FAQ als Question + Answer in JSON-LD</td></tr>
      <tr><td>Canonical tag gecontroleerd</td><td>Verwijst naar de juiste URL</td></tr>
      <tr><td>Afbeelding alt tekst compleet</td><td>Elke afbeelding heeft een beschrijvende alt</td></tr>
      <tr><td>Interne links toegevoegd</td><td>3-5 relevante interne links met goede anchor tekst</td></tr>
      <tr><td>Externe links toegevoegd</td><td>2-3 gezaghebbende bronnen</td></tr>
    </tbody>
  </table>
</div>

<!-- 08 Deploy -->
<div class="section" id="deploy">
  <div class="section-label"><span class="nl">Sectie 08</span><span class="en" style="display:none;">Section 08</span></div>
  <h2><span class="nl">Deployen op Railway</span><span class="en" style="display:none;">Deploying on Railway</span></h2>
  <p><span class="nl">Alle bestanden gaan naar de <code>public/</code> map op Railway. De routes staan in <code>server.js</code>.</span><span class="en" style="display:none;">All files go into the <code>public/</code> folder on Railway. The routes are in <code>server.js</code>.</span></p>

  <h3><span class="nl">Bestanden hernoemen en uploaden</span><span class="en" style="display:none;">Rename and upload files</span></h3>
  <table class="data-table">
    <thead><tr><th><span class="nl">Bestand</span><span class="en" style="display:none;">File</span></th><th><span class="nl">Hernoemen naar</span><span class="en" style="display:none;">Rename to</span></th><th>URL</th></tr></thead>
    <tbody>
      <tr><td>pulse-nexus-audit-v4.html</td><td>public/audit-seo.html</td><td>/audit-seo</td></tr>
      <tr><td>audit-intake-form.html</td><td>public/audit-intake.html</td><td>/audit-intake</td></tr>
      <tr><td>seo-workflow-manager.html</td><td>public/audit-workflow.html</td><td>/audit-workflow</td></tr>
      <tr><td>audit-recommendations.html</td><td>public/audit-recommendations.html</td><td>/audit-recommendations</td></tr>
    </tbody>
  </table>

  <h3><span class="nl">Server.js aanpassen</span><span class="en" style="display:none;">Update server.js</span></h3>
  <div class="steps-list">
    <div class="step-item">
      <div class="step-num">1</div>
      <div class="step-body">
        <strong><span class="nl">server-additions.js plakken</span><span class="en" style="display:none;">Paste server-additions.js</span></strong>
        <span class="nl">Open <code>server.js</code>. Zoek de headshot redirect routes. Plak de volledige inhoud van <code>server-additions.js</code> direct erboven, vóór <code>startServer()</code>.</span><span class="en" style="display:none;">Open <code>server.js</code>. Find the headshot redirect routes. Paste the full contents of <code>server-additions.js</code> directly above, before <code>startServer()</code>.</span>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">2</div>
      <div class="step-body">
        <strong><span class="nl">Multer toevoegen aan package.json</span><span class="en" style="display:none;">Add multer to package.json</span></strong>
        <span class="nl">Voeg <code>"multer": "^1.4.5-lts.1"</code> toe aan de dependencies. Railway installeert het automatisch bij de volgende deploy.</span><span class="en" style="display:none;">Add <code>"multer": "^1.4.5-lts.1"</code> to the dependencies. Railway will install it automatically on the next deploy.</span>
      </div>
    </div>
    <div class="step-item">
      <div class="step-num">3</div>
      <div class="step-body">
        <strong><span class="nl">Deployen</span><span class="en" style="display:none;">Deploy</span></strong>
        <span class="nl">Push naar GitHub → Railway deploy automatisch. Check de logs op fouten. Test daarna: <code>app.contentscale.site/audit-seo</code> moet laden.</span><span class="en" style="display:none;">Push to GitHub → Railway deploys automatically. Check the logs for errors. Then test: <code>app.contentscale.site/audit-seo</code> should load.</span>
      </div>
    </div>
  </div>

  <div class="info-box red">
    <span class="nl"><strong>Noindex:</strong> De Workflow Manager, Recommendations en PULSE+NEXUS hebben allemaal <code>noindex, nofollow</code> in de meta tags. Google indexeert ze niet. De Audit Intake Form is wél openbaar.</span><span class="en" style="display:none;"><strong>Noindex:</strong> The Workflow Manager, Recommendations and PULSE+NEXUS all have <code>noindex, nofollow</code> in their meta tags. Google does not index them. The Audit Intake Form is public.</span>
  </div>

  <div class="info-box green">
    <span class="nl"><strong>Data opslag:</strong> De Workflow Manager slaat data op in de browser (localStorage). Dit is per browser/computer. Export regelmatig met de CSV knop als backup, en gebruik Import om op een andere computer verder te gaan.</span><span class="en" style="display:none;"><strong>Data storage:</strong> The Workflow Manager stores data in the browser (localStorage). This is per browser/computer. Export regularly with the CSV button as backup, and use Import to continue on another computer.</span>
  </div>
</div>

<hr>

<!-- CTA Section -->
<div style="background:linear-gradient(135deg,rgba(147,51,234,.12),rgba(96,165,250,.06));border:1px solid rgba(147,51,234,.25);border-radius:14px;padding:40px;margin-bottom:40px;text-align:center;">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--sub);margin-bottom:10px;">
    <span class="nl">Hulp nodig met jouw website?</span>
    <span class="en" style="display:none;">Need help with your website?</span>
  </div>
  <h2 style="font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,4vw,44px);letter-spacing:.04em;line-height:1.05;margin-bottom:12px;background:linear-gradient(135deg,var(--gold),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">
    <span class="nl">Vraag een gratis SEO audit aan</span>
    <span class="en" style="display:none;">Request a free SEO audit</span>
  </h2>
  <p style="color:var(--muted);font-size:14px;max-width:520px;margin:0 auto 24px;line-height:1.7;">
    <span class="nl">Upload je GSC CSV, geef de pagina URL op en je ontvangt binnen 15 minuten een geprioriteerde actielijst. Geen jargon. GDPR-compliant. Gratis.</span>
    <span class="en" style="display:none;">Upload your GSC CSV, provide the page URL and you will receive a prioritised action plan within 15 minutes. No jargon. GDPR-compliant. Free.</span>
  </p>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:20px;">
    <a href="/audit-intake" style="display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.04em;">
      🔍 <span class="nl">Audit Aanvragen →</span><span class="en" style="display:none;">Request Audit →</span>
    </a>
    <a href="https://calendly.com/aioeditors" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:rgba(147,51,234,.15);color:var(--purple);text-decoration:none;padding:14px 32px;border-radius:8px;font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.04em;border:1px solid rgba(147,51,234,.3);">
      📅 <span class="nl">Gratis Strategiegesprek</span><span class="en" style="display:none;">Free Strategy Call</span>
    </a>
  </div>
  <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;">
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);">✓ <span class="nl">Binnen 15 minuten</span><span class="en" style="display:none;">Within 15 min</span></span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);">✓ GDPR compliant</span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);">✓ <span class="nl">Geen verplichtingen</span><span class="en" style="display:none;">No obligations</span></span>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);">✓ Amsterdam</span>
  </div>
</div>

<hr>
<div style="text-align:center;padding:20px 0;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;c
  ContentScale · Amsterdam · contentscale.site · info@contentscale.site
</div>

</div>

<script>
function setLang(lang) {
  var html = document.getElementById('htmlRoot');
  var btnNL = document.getElementById('btnNL');
  var btnEN = document.getElementById('btnEN');
  if (lang === 'en') {
    html.setAttribute('lang', 'en');
    document.body.classList.add('lang-en');
    btnNL.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:5px 0 0 5px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;';
    btnEN.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:0 5px 5px 0;border:1px solid var(--gold);background:var(--gold);color:#000;cursor:pointer;font-weight:700;';
    try{localStorage.setItem('cs_guide_lang','en');}catch(e){}
  } else {
    html.setAttribute('lang', 'nl');
    document.body.classList.remove('lang-en');
    btnNL.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:5px 0 0 5px;border:1px solid var(--gold);background:var(--gold);color:#000;cursor:pointer;font-weight:700;';
    btnEN.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:8px 18px;border-radius:0 5px 5px 0;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;';
    try{localStorage.setItem('cs_guide_lang','nl');}catch(e){}
  }
}
(function(){
  try{var s=localStorage.getItem('cs_guide_lang');if(s==='en')setLang('en');}catch(e){}
})();
</script>
</body>
</html>`);
});

// ── Workflow Manager — save/load to server ──────────────────
const wfCache = new Map(); // in-memory fallback if no DB

app.post('/api/workflow/save', async (req, res) => {
  const { key, project, pages, savedAt } = req.body;
  if (!key) return res.status(400).json({ success: false, error: 'key required' });
  const data = JSON.stringify({ project, pages, savedAt });
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO workflow_saves (wf_key, data, saved_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (wf_key) DO UPDATE SET data=$2, saved_at=NOW()`,
        [key, data]
      );
      console.log('[workflow] Saved to DB:', key);
      return res.json({ success: true, key, storage: 'db' });
    } catch (e) {
      console.warn('[workflow] DB save failed, using cache:', e.message);
    }
  }
  wfCache.set(key, { data, savedAt });
  res.json({ success: true, key, storage: 'memory' });
});

app.get('/api/workflow/load', async (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).json({ success: false, error: 'key required' });
  if (pool) {
    try {
      const r = await pool.query('SELECT data, saved_at FROM workflow_saves WHERE wf_key=$1', [key]);
      if (r.rows.length) {
        const d = JSON.parse(r.rows[0].data);
        return res.json({ success: true, data: d, storage: 'db' });
      }
    } catch (e) {
      console.warn('[workflow] DB load failed:', e.message);
    }
  }
  const cached = wfCache.get(key);
  if (cached) return res.json({ success: true, data: JSON.parse(cached.data), storage: 'memory' });
  res.json({ success: false, error: 'Not found: ' + key });
});

// DB migration — create workflow_saves table if not exists
if (pool) {
  pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_saves (
      wf_key   VARCHAR(200) PRIMARY KEY,
      data     TEXT NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(e => console.warn('[workflow] Migration skipped:', e.message));
}

app.post('/api/audit-intake', (req, res) => {
  auditUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    const b = req.body;
    const isEmergency = b.emergency === 'yes';
    const allFiles = [...((req.files?.gsc_files) || []), ...((req.files?.attachments) || [])];

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0;">
<div style="max-width:640px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;">
  <div style="background:${isEmergency ? '#dc2626' : '#7c3aed'};padding:20px 28px;">
    <div style="color:rgba(255,255,255,.8);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">${isEmergency ? '⚡ EMERGENCY' : '🔍 New'} Audit Request</div>
    <div style="color:#fff;font-size:22px;font-weight:700;">${b.name || 'Unknown'}</div>
    <div style="color:rgba(255,255,255,.75);font-size:13px;">${b.email || ''} ${b.phone ? '· ' + b.phone : ''}</div>
  </div>
  <div style="padding:24px 28px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">
      <tr style="background:#f3f4f6;"><td style="padding:9px 12px;font-weight:600;width:40%;">Page URL</td><td style="padding:9px 12px;"><a href="${b.url}" style="color:#7c3aed;">${b.url}</a></td></tr>
      <tr><td style="padding:9px 12px;font-weight:600;background:#f9fafb;">Primary Keyword</td><td style="padding:9px 12px;">${b.keyword}</td></tr>
      <tr style="background:#f3f4f6;"><td style="padding:9px 12px;font-weight:600;">Geo / Goal</td><td style="padding:9px 12px;">${b.geo} · ${b.goal}</td></tr>
      <tr><td style="padding:9px 12px;font-weight:600;background:#f9fafb;">GSC</td><td style="padding:9px 12px;">${b.impressions || '?'} impr · ${b.ctr || '?'}% CTR · pos ${b.position || '?'}</td></tr>
      <tr style="background:#f3f4f6;"><td style="padding:9px 12px;font-weight:600;">No GSC?</td><td style="padding:9px 12px;">${b.no_gsc === 'yes' ? 'Yes — manual data' : 'No — CSV uploaded'}</td></tr>
      <tr><td style="padding:9px 12px;font-weight:600;background:#f9fafb;">Website</td><td style="padding:9px 12px;">${b.website || '—'}</td></tr>
    </table>
    ${b.queries ? `<div style="margin-bottom:14px;"><strong style="font-size:11px;color:#6b7280;text-transform:uppercase;">Top Queries</strong><div style="background:#f3f4f6;border-radius:5px;padding:10px;font-size:13px;margin-top:5px;white-space:pre-wrap;">${b.queries}</div></div>` : ''}
    ${b.competitors ? `<div style="margin-bottom:14px;"><strong style="font-size:11px;color:#6b7280;text-transform:uppercase;">Competitors</strong><div style="background:#f3f4f6;border-radius:5px;padding:10px;font-size:13px;margin-top:5px;white-space:pre-wrap;">${b.competitors}</div></div>` : ''}
    ${allFiles.length ? `<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:5px;padding:10px 12px;margin-bottom:14px;"><strong style="color:#065f46;">📎 ${allFiles.length} file(s) attached</strong><br><span style="font-size:12px;color:#047857;">${allFiles.map(f => f.originalname + ' (' + (f.size/1024).toFixed(0) + ' KB)').join(', ')}</span></div>` : ''}
    <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">
      <a href="mailto:${b.email}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:9px 16px;border-radius:5px;font-weight:600;font-size:13px;">📧 Reply</a>
      ${b.phone ? `<a href="https://wa.me/${b.phone.replace(/\D/g,'')}" style="background:#16a34a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:5px;font-weight:600;font-size:13px;">💬 WhatsApp</a>` : ''}
      <a href="https://app.contentscale.site/audit-seo?url=${encodeURIComponent(b.url)}&kw=${encodeURIComponent(b.keyword)}" style="background:#fbbf24;color:#000;text-decoration:none;padding:9px 16px;border-radius:5px;font-weight:600;font-size:13px;">🔬 Open in PULSE+NEXUS</a>
    </div>
  </div>
  <div style="background:#f3f4f6;padding:10px 28px;font-size:11px;color:#9ca3af;">${b.timestamp || new Date().toISOString()} · contentscale.site</div>
</div></body></html>`;

    if (process.env.SENDGRID_API_KEY) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to:      'info@contentscale.site',
          from:    process.env.SENDGRID_FROM_EMAIL || 'noreply@contentscale.site',
          replyTo: b.email || 'noreply@contentscale.site',
          subject: `${isEmergency ? '⚡ EMERGENCY — ' : '🔍 '}Audit: ${b.keyword} — ${b.name}`,
          html:    emailHtml,
          attachments: allFiles.map(f => ({
            content: f.buffer.toString('base64'), filename: f.originalname,
            type: f.mimetype, disposition: 'attachment',
          })),
        });
        console.log(`[audit-intake] ✅ Email sent → info@contentscale.site`);
      } catch (e) { console.error('[audit-intake] SendGrid error:', e.message); }
    }

    if (pool) {
      pool.query(
        `INSERT INTO scan_log (business_url, business_name, niche, country, email_found, email_status, source) VALUES ($1,$2,$3,$4,$5,$6,'audit_intake')`,
        [b.url||null, b.name||null, b.keyword||null, b.geo||null, b.email||null, b.email?'has_email':'no_email']
      ).catch(e => console.warn('[audit-intake] DB:', e.message));
    }

    res.json({ success: true, message: 'Audit request received.' });
  });
});



// ══════════════════════════════════════════════════════════════════════
// GEMINI LIVE — REST fallback + WebSocket proxy
// Step 1: REST status check (/api/gemini-live-status)
// Step 2: WebSocket proxy (/api/gemini-live-ws) → Google BidiGenerateContent
// Key: GEMINI_KEY_LIVE or GEMINI_KEY_LEADCRAWLER
// ══════════════════════════════════════════════════════════════════════

// Gemini Live WebSocket URL (v1alpha has better availability)
const GEMINI_LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const GEMINI_LIVE_MODEL  = 'models/gemini-2.0-flash-exp'; // v1alpha Live model

// REST endpoint to verify key + connectivity before browser opens WebSocket

app.get('/api/gemini-live-token', async (req, res) => {
  if (!checkOttoLimit(req, res)) return; // IP rate limit check
  // Track conversation for referral
  const ref = req.query.ref || req.headers['x-otto-ref'];
  if (ref) {
    const visitorIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    pool.query('UPDATE otto_referrals SET conversations=conversations+1, points=points+3 WHERE ref_code=$1', [ref]).catch(()=>{});
    pool.query('INSERT INTO otto_ref_events (ref_code, event_type, visitor_ip, points_awarded) VALUES ($1,$2,$3,$4)', [ref, 'conversation', visitorIp, 3]).catch(()=>{});
  }
  const apiKey = process.env.GEMINI_KEY_LIVE || process.env.GEMINI_KEY_LEADCRAWLER;
  if (!apiKey) return res.status(500).json({ error: 'No Gemini API key — add GEMINI_KEY_LIVE in Railway Variables' });

  // Fetch available models to find best Live model
  try {
    const modelsRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const modelsData = await modelsRes.json();
    const allModels = (modelsData.models || []).map(m => m.name.replace('models/', ''));

    const LIVE_PRIORITY = [
      'gemini-3.1-flash-live-preview',
      'gemini-2.0-flash-live-001',
      'gemini-live-001',
      'gemini-2.0-flash-exp',
    ];
    const bestModel = LIVE_PRIORITY.find(m => allModels.includes(m)) || 'gemini-2.0-flash-exp';
    const liveModels = allModels.filter(m => m.includes('live') || m.includes('flash-exp'));

    console.log('[gemini-live-token] bestModel:', bestModel, '| live models:', liveModels);

    // Return key + model — browser connects directly to Google WS
    res.json({
      key: apiKey,
      model: bestModel,
      availableModels: liveModels
    });
  } catch(e) {
    console.error('[gemini-live-token] exception:', e.message);
    res.status(500).json({ error: e.message });
  }
});


// Test endpoint — call this to diagnose key access
app.get('/api/gemini-live-test', async (req, res) => {
  const apiKey = process.env.GEMINI_KEY_LIVE || process.env.GEMINI_KEY_LEADCRAWLER;
  if (!apiKey) return res.json({ error: 'No key set in Railway Variables' });

  const results = {};
  const models = ['gemini-2.0-flash-live-001', 'gemini-live-001', 'gemini-2.0-flash-exp'];

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      results[model] = r.ok ? 'available ✅' : `error: ${d.error?.message || r.status}`;
    } catch(e) {
      results[model] = 'timeout/error: ' + e.message;
    }
  }

  res.json({
    keyPrefix: apiKey.substring(0, 8) + '...',
    models: results,
    hint: 'If all models show errors, the key needs Gemini Live access at aistudio.google.com'
  });
});

app.get('/api/gemini-live-status', async (req, res) => {
  const apiKey = process.env.GEMINI_KEY_LIVE || process.env.GEMINI_KEY_LEADCRAWLER;
  if (!apiKey) return res.json({ available: false, error: 'No API key configured. Add GEMINI_KEY_LIVE in Railway Variables.' });
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await r.json();
    if (!r.ok) return res.json({ available: false, keyWorks: false, error: d.error?.message || 'Key rejected', status: r.status });
    const allModels  = (d.models||[]).map(m => m.name.replace('models/',''));
    const liveModels = allModels.filter(m => m.includes('live') || m.includes('flash-exp'));
    const hasLive    = liveModels.length > 0;
    res.json({
      available: true,
      keyWorks: true,
      hasLiveAccess: hasLive,
      liveModels,
      allFlashModels: allModels.filter(m => m.includes('flash')),
      hint: hasLive ? 'Gemini Live models available' : 'No live models found — key may need Live API access. Check aistudio.google.com',
      wsUrl: 'wss://app.contentscale.site/api/gemini-live-ws'
    });
  } catch(e) {
    res.json({ available: false, error: e.message });
  }
});

// WebSocket proxy
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/gemini-live-ws') {
    wss.handleUpgrade(req, socket, head, (ws) => { wss.emit('connection', ws, req); });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (clientWs) => {
  const apiKey = process.env.GEMINI_KEY_LIVE || process.env.GEMINI_KEY_LEADCRAWLER;
  if (!apiKey) {
    clientWs.send(JSON.stringify({ error: 'no_key', msg: 'No Gemini API key on server' }));
    clientWs.close(1011);
    return;
  }

  console.log('[gemini-live] client connected — opening Google WS');
  const wsUrl = GEMINI_LIVE_WS_URL + '?key=' + apiKey;

  // Try models in order until one works
  const LIVE_MODELS = [
    'models/gemini-2.0-flash-live-001',
    'models/gemini-live-001',
    'models/gemini-2.0-flash-exp',
  ];

  let googleWs;
  try {
    googleWs = new WebSocket(wsUrl, {
      headers: { 'Content-Type': 'application/json' },
      handshakeTimeout: 10000,
    });
  } catch(e) {
    console.error('[gemini-live] failed to create Google WS:', e.message);
    clientWs.send(JSON.stringify({ error: 'ws_create_failed', msg: e.message }));
    clientWs.close(1011);
    return;
  }

  googleWs.on('open', () => {
    console.log('[gemini-live] Google WS open ✅');
    if (clientWs.readyState === WebSocket.OPEN)
      clientWs.send(JSON.stringify({ type: 'server_ready', model: GEMINI_LIVE_MODEL }));
  });

  googleWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
  });

  clientWs.on('message', (data) => {
    if (googleWs && googleWs.readyState === WebSocket.OPEN) googleWs.send(data);
  });

  googleWs.on('error', (err) => {
    console.error('[gemini-live] Google WS error:', err.message, err.code||'');
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        error: 'google_ws_error',
        msg: err.message,
        code: err.code || '',
        hint: err.message.includes('401') ? 'API key invalid or no Live access'
            : err.message.includes('403') ? 'API key lacks permission for Gemini Live'
            : err.message.includes('ENOTFOUND') ? 'Cannot reach Google API — check network'
            : 'Google WebSocket failed'
      }));
      clientWs.close(1011);
    }
  });

  googleWs.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : '';
    console.error('[gemini-live] Google WS closed:', code, reasonStr || '(no reason)');
    if (code === 1008) {
      console.error('[gemini-live] 1008 = Policy Violation. Key:', apiKey ? apiKey.substring(0,8)+'...' : 'MISSING');
      console.error('[gemini-live] → Verify key has Gemini Live access at aistudio.google.com');
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      if (code === 1008) {
        clientWs.send(JSON.stringify({
          error: 'google_rejected',
          hint: 'API key does not have Gemini Live access. Go to aistudio.google.com → Get API key → make sure Gemini Live is enabled for this key.',
          code: 1008
        }));
      }
      clientWs.close(code);
    }
  });

  clientWs.on('close', () => {
    if (googleWs && googleWs.readyState === WebSocket.OPEN) googleWs.close();
  });

  clientWs.on('error', (err) => {
    console.error('[gemini-live] client WS error:', err.message);
    if (googleWs && googleWs.readyState === WebSocket.OPEN) googleWs.close();
  });
});


// ── Otto sessions ──────────────────────────────────────────────────────────
pool.query(`CREATE TABLE IF NOT EXISTS prize_claims (
  id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255),
  website TEXT, ref_code VARCHAR(50), page_to_audit TEXT,
  gsc_access VARCHAR(50), notes TEXT, created_at TIMESTAMP DEFAULT NOW()
)`).catch(e => console.warn('[prize_claims]', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS otto_sessions (
  id SERIAL PRIMARY KEY, session_id VARCHAR(100) UNIQUE NOT NULL,
  lead_name VARCHAR(255), lead_website VARCHAR(255), lead_phone VARCHAR(100),
  transcript JSONB DEFAULT '[]', duration_seconds INTEGER DEFAULT 0,
  model VARCHAR(100), has_phone BOOLEAN DEFAULT FALSE,
  audio_chunks JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT NOW()
)`).catch(e => console.warn('[otto_sessions]', e.message));

// Save audio chunk (only called when phone number detected in transcript)
app.post('/api/otto/save-audio', async (req, res) => {
  const { sessionId, audioChunks } = req.body;
  if (!sessionId || !audioChunks) return res.status(400).json({ error: 'sessionId and audioChunks required' });
  try {
    await pool.query(
      'UPDATE otto_sessions SET audio_chunks=$1, has_phone=true WHERE session_id=$2',
      [JSON.stringify(audioChunks), sessionId]
    );
    console.log('[otto] audio saved for session:', sessionId, 'chunks:', audioChunks.length);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/otto/save-session', async (req, res) => {
  const { sessionId, leadName, leadWebsite, leadPhone, transcript, durationSeconds, model } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  try {
    await pool.query(
      `INSERT INTO otto_sessions (session_id,lead_name,lead_website,lead_phone,transcript,duration_seconds,model)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id) DO UPDATE SET transcript=$5, duration_seconds=$6`,
      [sessionId, leadName||'', leadWebsite||'', leadPhone||'', JSON.stringify(transcript||[]), durationSeconds||0, model||'']
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/otto/sessions', async (req, res) => {
  try {
    const r = await pool.query('SELECT id,session_id,lead_name,lead_website,lead_phone,duration_seconds,model,has_phone,created_at, (audio_chunks IS NOT NULL AND audio_chunks != \'[]\') as has_audio FROM otto_sessions ORDER BY created_at DESC LIMIT 100');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/otto/sessions/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM otto_sessions WHERE session_id=$1 OR id::text=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/otto-version', (req, res) => res.json({ version: 'v6', model: 'gemini-3.1-flash-live-preview', voice: 'Fenrir' }));


// ── Otto AI client JS — embedded inline ──────────────────────────────────
const _OTTO_JS = `// ContentScale — Otto AI — Gemini Live v6
// Hangup: 2 min max session OR goodbye word detected

(function() {
  'use strict';

  var _ws           = null;
  var _active       = false;
  var _micCtx       = null;
  var _stream       = null;
  var _processor    = null;
  var _playCtx      = null;
  var _nextStart    = 0;
  var _killTimer        = null;
  var _audioChunks      = [];
  var _hasPhone         = false;
  var _hangupScheduled  = false;
  var _sessionId        = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  var _sessionStart     = Date.now();
  var _sessionModel     = null;
  var _transcript       = [];

  var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  var OTTO_SCRIPT = "You are Otto, a male AI voice assistant of ContentScale. You are NOT a salesperson — you are helpful and honest. Follow this exact script step by step: 1. Say: Hey! I am Otto, an AI assistant of ContentScale. I have about 1 minute for you — is that okay or would you rather I hang up? 2a. If no: say No problem, have a great day! Goodbye! Then STOP. 2b. If yes: say Great! And great timing — this month you can win 250 euros in free SEO services just by sharing this conversation. But first, may I have your name? Wait for answer. 3. Say: Hey [name]! We help businesses recover lost Google traffic with a free GRAAF Framework scan and PULSE+NEXUS SEO audit. We also do outbound calls and lead generation so you never miss a client again. 4. Ask: Would that be interesting for you? Wait for answer. 5a. If not interested: say No worries, maybe another time. Have a great day! Goodbye! Then STOP. 5b. If interested: say Wonderful! Ottmar, our founder, will personally call you back. And to be eligible for our 250 euro prize this month, I just need your mobile number with country code. What is it? Wait for answer. Repeat the number back digit by digit to confirm. Then say: Perfect! Ottmar will be in touch soon. Have a great day! Goodbye! Then STOP. Always say goodbye before stopping. Never add extra information. Never continue after goodbye.";

  function setStatus(msg) {
    if (window._ottoStatusOverride) { window._ottoStatusOverride(msg); return; }
    var el = document.getElementById('gl-status');
    if (el) el.textContent = msg;
  }

  function addTranscript(who, msg) {
    if (window._ottoTranscriptOverride) { window._ottoTranscriptOverride(who, msg); return; }
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML += '<div style="color:' + (who === 'model' ? '#4ade80' : '#f9fafb') + ';margin-bottom:5px;line-height:1.6;"><strong>' + (who === 'model' ? 'Otto:' : 'You:') + '</strong> ' + msg + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(on) {
    if (window._ottoActiveOverride) { window._ottoActiveOverride(on); }
    var btn = document.getElementById('gl-call-btn');
    var r1  = document.getElementById('gl-ring1');
    if (!btn) return;
    if (on) {
      btn.style.background = 'linear-gradient(135deg,#dc2626,#f87171)';
      btn.style.boxShadow  = '0 0 0 8px rgba(239,68,68,.2),0 0 32px rgba(239,68,68,.4)';
      if (r1) r1.style.animation = 'rp 1s ease-in-out infinite';
    } else {
      btn.style.background = 'linear-gradient(135deg,#166534,#4ade80)';
      btn.style.boxShadow  = '0 0 0 8px rgba(74,222,128,.15),0 0 32px rgba(74,222,128,.3)';
      if (r1) r1.style.animation = '';
    }
  }

  function saveAndHangup() {
    // Save session transcript
    if (_sessionId && (_transcript.length || _sessionModel)) {
      var duration = Math.round((Date.now() - (_sessionStart||Date.now())) / 1000);
      fetch('https://app.contentscale.site/api/otto/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: _sessionId, transcript: _transcript, durationSeconds: duration, model: _sessionModel })
      }).then(function() {
        console.log('[otto] session saved');
        // Save audio only if phone number detected
        if (_hasPhone && _audioChunks.length > 0) {
          return fetch('https://app.contentscale.site/api/otto/save-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: _sessionId, audioChunks: _audioChunks })
          });
        }
      }).then(function(){ if (_hasPhone) console.log('[otto] audio saved — phone detected'); })
        .catch(function(e){ console.warn('[otto] save error:', e.message); });
    }
    _audioChunks = [];
  }

  function hangup(reason) {
    if (!_active) return;
    console.log('[otto] hanging up:', reason);
    setStatus('Call ended');
    saveAndHangup();
    stopSession();
  }

  function ensurePlayCtx() {
    if (!_playCtx || _playCtx.state === 'closed') {
      _playCtx  = new AudioContext({ sampleRate: 24000 });
      _nextStart = 0;
    }
    if (_playCtx.state === 'suspended') _playCtx.resume();
  }

  function scheduleAudioChunk(b64) {
    ensurePlayCtx();
    try {
      var raw   = atob(b64);
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      var pcm16   = new Int16Array(bytes.buffer);
      var float32 = new Float32Array(pcm16.length);
      for (var j = 0; j < pcm16.length; j++) float32[j] = pcm16[j] / 32768.0;
      var buf = _playCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);
      var src = _playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_playCtx.destination);
      var now  = _playCtx.currentTime;
      var when = Math.max(now, _nextStart);
      src.start(when);
      _nextStart = when + buf.duration;
    } catch(e) {}
  }

  function stopSession() {
    _active = false;
    clearTimeout(_killTimer);
    if (_processor) { try { _processor.disconnect(); } catch(e) {} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    if (_micCtx)    { try { _micCtx.close(); } catch(e) {} _micCtx = null; }
    if (_playCtx)   { try { _playCtx.close(); } catch(e) {} _playCtx = null; }
    if (_ws && _ws.readyState < 2) { try { _ws.close(); } catch(e) {} }
    _ws = null;
    _nextStart = 0;
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  async function startMic() {
    _stream    = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
    _micCtx    = new AudioContext({ sampleRate: 16000 });
    var src    = _micCtx.createMediaStreamSource(_stream);
    _processor = _micCtx.createScriptProcessor(2048, 1, 1);
    _processor.onaudioprocess = function(e) {
      if (!_ws || _ws.readyState !== 1 || !_active) return;
      var input = e.inputBuffer.getChannelData(0);
      var pcm   = new Int16Array(input.length);
      for (var i = 0; i < input.length; i++) {
        var s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm.buffer)));
      _ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } }));
    };
    src.connect(_processor);
    _processor.connect(_micCtx.destination);
    setStatus('Your turn — speak now...');

    // HARD KILL: 45 seconds max no matter what
    _killTimer = setTimeout(function() { hangup('2 min limit reached'); }, 120000);
    console.log('[otto] session started — 2 min hard limit');
  }

  async function startSession() {
    if (_active) { stopSession(); return; }
    setStatus('Getting key...');
    _active = true;
    setBtnActive(true);

    var keyData;
    try {
      var params = new URLSearchParams();
    if (window._ottoRefCode) params.set('ref', window._ottoRefCode);
    var adminKey = new URLSearchParams(location.search).get('admin');
    if (adminKey) params.set('admin', adminKey);
    var paramStr = params.toString() ? '?' + params.toString() : '';
    var r = await fetch('https://app.contentscale.site/api/gemini-live-token' + paramStr);
      keyData = await r.json();
      if (r.status === 429) {
        setStatus('Daily limit reached — come back tomorrow!');
        if (window._ottoLimitOverride) window._ottoLimitOverride();
        setBtnActive(false);
        _active = false;
        return;
      }
      if (!r.ok || !keyData.key) {
        setStatus('Error: ' + (keyData.error || 'No key'));
        stopSession(); return;
      }
    } catch(e) { setStatus('Server error: ' + e.message); stopSession(); return; }

    var model = keyData.model || 'gemini-3.1-flash-live-preview';
    _sessionModel = model;
    _sessionId = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    _sessionStart = Date.now();
    _transcript = [];
    window._ottTurnCount = 0;  // reset per session
    _hangupScheduled = false;
    console.log('[otto] model:', model);

    var wsUrl = WS_BASE + '?key=' + encodeURIComponent(keyData.key);
    setStatus('Connecting...');

    try { _ws = new WebSocket(wsUrl); _ws.binaryType = 'arraybuffer'; }
    catch(e) { setStatus('WS error: ' + e.message); stopSession(); return; }

    _ws.onopen = function() {
      setStatus('Connected...');
      var setup = {
        setup: {
          model: 'models/' + model,
          generation_config: {
            response_modalities: ['AUDIO'],
            output_audio_transcription: {}
          },
          system_instruction: { parts: [{ text: OTTO_SCRIPT }] }
        }
      };
      console.log('[otto] sending setup');
      _ws.send(JSON.stringify(setup));
    };

    _ws.onmessage = function(evt) {
      try {
        var raw = evt.data instanceof ArrayBuffer ? new TextDecoder().decode(new Uint8Array(evt.data)) : evt.data;
        var msg = JSON.parse(raw);

        if (msg.setupComplete) {
          setStatus('Say hello to Otto...');
          startMic().catch(function(e) { setStatus('Mic: ' + e.message); stopSession(); });
          return;
        }

        if (msg.serverContent) {
          var sc = msg.serverContent;
          var _turnCount = window._ottTurnCount || 0;
          if (sc.modelTurn && sc.modelTurn.parts) {
            sc.modelTurn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
                _audioChunks.push(p.inlineData.data);
              }
              // Check text parts for goodbye keywords (when transcription is off)
              if (p.text) {
                var ptxt = p.text || '';
                addTranscript('model', ptxt);
                if (!_hangupScheduled && /\b(goodbye|have a great day|speak to you soon|talk soon)\b/i.test(ptxt)) {
                  _hangupScheduled = true;
                  console.log('[otto] goodbye detected in text part: ' + ptxt);
                  setTimeout(function() { hangup('goodbye detected'); }, 4000);
                }
              }
            });
          }
          if (sc.inputTranscription) addTranscript('you', sc.inputTranscription.text);
          if (sc.outputTranscription) {
            var txt = sc.outputTranscription.text || '';
            addTranscript('model', txt);
            if (!_hangupScheduled && /\b(goodbye|have a great day|speak to you soon|talk soon)\b/i.test(txt)) {
              _hangupScheduled = true;
              console.log('[otto] goodbye detected in transcription: ' + txt);
              setTimeout(function() { hangup('goodbye detected'); }, 4000);
            }
          }
          if (sc.turnComplete) {
            _turnCount++;
            window._ottTurnCount = _turnCount;
            setStatus('Your turn — speak now...');
            console.log('[otto] turnComplete #' + _turnCount);
            // After 5 turns (full script done), schedule hangup if no goodbye detected yet
            if (_turnCount >= 10 && !_hangupScheduled) {
              _hangupScheduled = true;
              clearTimeout(_killTimer);
              _killTimer = setTimeout(function() { hangup('script complete'); }, 15000);
            }
          }
        }
      } catch(e) { console.warn('[otto] parse:', e.message); }
    };

    _ws.onerror = function() { setStatus('Connection error'); stopSession(); };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code);
      if (_active) { setStatus('Disconnected (code ' + evt.code + ')'); stopSession(); }
    };
  }

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent    = window.Tawk_API.triggerEvent    || function() {};
  window.Tawk_API.addQuickReplies = window.Tawk_API.addQuickReplies || function() {};

  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] v7 loaded — 2 min hard limit + goodbye detection');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();
})();`;

// Serve Otto JS — all versioned names point to same embedded content


// ── Otto widget standalone page & embed ──────────────────────────────────
const _OTTO_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Otto AI — ContentScale</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #060910;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 16px;
  }

  .widget {
    background: linear-gradient(160deg, #0d1117 0%, #0a0f1a 100%);
    border: 1px solid rgba(74,222,128,.2);
    border-radius: 24px;
    padding: 36px 28px 28px;
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow:
      0 0 0 1px rgba(74,222,128,.05),
      0 0 60px rgba(74,222,128,.06),
      0 30px 80px rgba(0,0,0,.7);
    position: relative;
    overflow: hidden;
  }

  /* Subtle glow top */
  .widget::before {
    content: '';
    position: absolute;
    top: -60px; left: 50%;
    transform: translateX(-50%);
    width: 200px; height: 120px;
    background: radial-gradient(ellipse, rgba(74,222,128,.12) 0%, transparent 70%);
    pointer-events: none;
  }

  /* Avatar */
  .avatar-wrap {
    position: relative;
    width: 96px; height: 96px;
    margin-bottom: 20px;
  }

  .avatar {
    width: 96px; height: 96px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0d2e1a 0%, #0a1f12 100%);
    border: 2px solid rgba(74,222,128,.4);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    z-index: 2;
  }

  .avatar svg {
    width: 42px; height: 42px;
    opacity: .85;
  }

  /* Pulse rings */
  .ring {
    position: absolute;
    border-radius: 50%;
    border: 1.5px solid rgba(74,222,128,.18);
    top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    pointer-events: none;
  }
  .ring-1 { width: 120px; height: 120px; }
  .ring-2 { width: 148px; height: 148px; border-color: rgba(74,222,128,.08); }

  @keyframes pulse-ring {
    0%   { transform: translate(-50%,-50%) scale(1); opacity: .6; }
    100% { transform: translate(-50%,-50%) scale(1.15); opacity: 0; }
  }
  .active .ring-1 { animation: pulse-ring 1.4s ease-out infinite; }
  .active .ring-2 { animation: pulse-ring 1.4s ease-out .5s infinite; }

  /* Name */
  .name {
    font-family: 'Inter', sans-serif;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: .12em;
    background: linear-gradient(90deg, #4ade80 0%, #86efac 50%, #60a5fa 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 4px;
  }

  .sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 20px;
  }

  /* Status */
  #gl-status {
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 24px;
    min-height: 20px;
    line-height: 1.4;
    transition: color .3s;
  }
  #gl-status.speaking { color: #4ade80; }
  #gl-status.listening { color: #60a5fa; }
  #gl-status.error { color: #f87171; }

  /* Call button */
  #gl-call-btn {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: linear-gradient(145deg, #16a34a, #4ade80);
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 16px;
    box-shadow:
      0 0 0 10px rgba(74,222,128,.1),
      0 0 30px rgba(74,222,128,.3),
      inset 0 1px 0 rgba(255,255,255,.15);
    transition: all .2s ease;
    position: relative;
    z-index: 2;
  }

  #gl-call-btn:hover {
    transform: scale(1.06);
    box-shadow: 0 0 0 14px rgba(74,222,128,.12), 0 0 40px rgba(74,222,128,.4);
  }

  #gl-call-btn.active {
    background: linear-gradient(145deg, #991b1b, #f87171);
    box-shadow: 0 0 0 10px rgba(239,68,68,.12), 0 0 30px rgba(239,68,68,.3);
  }

  #gl-call-btn svg {
    width: 32px; height: 32px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,.3));
  }

  .hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #6b7280;
    line-height: 2;
    margin-bottom: 4px;
  }

  /* Transcript */
  #gl-transcript {
    margin-top: 16px;
    width: 100%;
    background: #0a0d12;
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 12px;
    padding: 14px 16px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    line-height: 1.7;
    max-height: 140px;
    overflow-y: auto;
    text-align: left;
    display: none;
    scrollbar-width: thin;
    scrollbar-color: rgba(74,222,128,.2) transparent;
  }
  #gl-transcript::-webkit-scrollbar { width: 4px; }
  #gl-transcript::-webkit-scrollbar-track { background: transparent; }
  #gl-transcript::-webkit-scrollbar-thumb { background: rgba(74,222,128,.2); border-radius: 2px; }

  .t-otto { color: #4ade80; margin-bottom: 6px; }
  .t-you  { color: #93c5fd; margin-bottom: 6px; }
  .t-label { font-weight: 700; font-size: 11px; letter-spacing: .05em; }
  .t-text  { font-weight: 400; }

  /* Limit message */
  .limit-msg {
    margin-top: 14px;
    font-size: 12px;
    color: #f87171;
    line-height: 1.5;
    display: none;
  }
</style>
</head>
<body>
<div class="widget" id="widget">
  <div class="avatar-wrap" id="avatarWrap">
    <div class="ring ring-1"></div>
    <div class="ring ring-2"></div>
    <div class="avatar">
      <!-- Brain/AI icon -->
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.5 2C7.57 2 6 3.57 6 5.5c0 .28.03.55.09.81C4.27 6.97 3 8.59 3 10.5c0 1.45.64 2.75 1.65 3.65C4.24 14.72 4 15.35 4 16c0 1.86 1.28 3.42 3 3.87V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-.13c1.72-.45 3-2.01 3-3.87 0-.65-.24-1.28-.65-1.85C20.36 13.25 21 11.95 21 10.5c0-1.91-1.27-3.53-3.09-4.19.06-.26.09-.53.09-.81C18 3.57 16.43 2 14.5 2c-.98 0-1.87.39-2.5 1.02C11.37 2.39 10.48 2 9.5 2z" fill="rgba(74,222,128,.15)" stroke="rgba(74,222,128,.6)" stroke-width="1.2"/>
        <circle cx="9" cy="10" r="1.2" fill="#4ade80"/>
        <circle cx="15" cy="10" r="1.2" fill="#4ade80"/>
        <path d="M9 14s1 1.5 3 1.5 3-1.5 3-1.5" stroke="#4ade80" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M12 2v2M7 3.5l1 1.5M17 3.5l-1 1.5" stroke="rgba(74,222,128,.4)" stroke-width="1" stroke-linecap="round"/>
      </svg>
    </div>
  </div>

  <div class="name">OTTO</div>
  <div class="sub">ContentScale AI &nbsp;·&nbsp; Gemini Live</div>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;line-height:1.6;text-align:center">Do you have a website?<br>Then this is for you.</div>
  <div style="font-size:10px;color:#4ade80;margin-bottom:14px;text-align:center;font-family:'JetBrains Mono',monospace;letter-spacing:.04em">
    🏆 Share &amp; win €250 in free services — <a href="https://app.contentscale.site/otto/leaderboard" target="_blank" style="color:#4ade80;text-decoration:underline">see leaderboard</a>
  </div>

  <div id="gl-status">Click to talk to Otto</div>

  <button id="gl-call-btn" title="Talk to Otto">
    <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="rgba(255,255,255,.15)"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  </button>

  <div class="hint">Microphone &nbsp;·&nbsp; No phone needed<br>Click again to end</div>
  <div id="shareScreen" style="display:none;flex-direction:column;align-items:center;width:100%;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);">
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4ade80;font-family:'JetBrains Mono',monospace;margin-bottom:8px">Share & win</div>
    <div style="font-size:15px;font-weight:700;color:#f3f4f6;margin-bottom:4px">You have <span id="myPts" style="color:#4ade80">0</span> points</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:12px;text-align:center">Share Otto. Top 3 this month wins €250 in free services.</div>
    <div style="background:rgba(0,0,0,.3);border-radius:8px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#6b7280;width:100%;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="myRefLink">Loading...</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">
      <a id="waShareBtn" href="#" target="_blank" style="font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px;border:1px solid rgba(37,211,102,.3);background:rgba(37,211,102,.08);color:#25d366;text-decoration:none;display:flex;align-items:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.3-.7-.5-.6-.7-.6h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.1.2 2.2 3.4 5.4 4.7.8.3 1.4.5 1.8.6.8.2 1.5.2 2 .1.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.2.2-1.4l-.5-.2z"/></svg>
        WhatsApp
      </a>
      <a id="liShareBtn" href="#" target="_blank" style="font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px;border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.08);color:#60a5fa;text-decoration:none;display:flex;align-items:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
        LinkedIn
      </a>
      <button id="copyShareBtn" style="font-size:12px;font-weight:600;padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#d1d5db;cursor:pointer">Copy link</button>
    </div>
    <a href="https://app.contentscale.site/otto/leaderboard" target="_blank" style="font-size:12px;color:#4ade80;text-decoration:none">View leaderboard →</a>
  </div>
  <div class="limit-msg" id="limitMsg">You've already spoken with Otto today.<br>Come back tomorrow for another conversation.</div>
  <div id="gl-transcript"></div>
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.05);width:100%;text-align:center">
    <div style="font-size:9px;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;color:#4b5563;line-height:2.2">
      <a href="https://contentscale.site" target="_blank" style="color:#4b5563;text-decoration:none">ContentScale.site</a>
      &nbsp;·&nbsp;
      <a href="https://contentscale.site/privacy-policy/" target="_blank" style="color:#4b5563;text-decoration:none">Privacy</a>
      &nbsp;·&nbsp;
      <a href="https://contentscale.site/terms/" target="_blank" style="color:#4b5563;text-decoration:none">Terms</a>
      &nbsp;·&nbsp;
      <a href="https://contentscale.site/privacy-policy/#data-requests" target="_blank" style="color:#4b5563;text-decoration:none">Data requests</a>
    </div>
    <div style="font-size:8px;color:#374151;margin-top:2px;font-family:'JetBrains Mono',monospace">
      AI conversations may be recorded for quality purposes
    </div>
  </div>
</div>

<script>
// Override addTranscript for better styling
window._ottoTranscriptOverride = function(who, msg) {
  var el = document.getElementById('gl-transcript');
  if (!el) return;
  el.style.display = 'block';
  var cls = who === 'model' ? 't-otto' : 't-you';
  var label = who === 'model' ? 'Otto' : 'You';
  el.innerHTML += '<div class="' + cls + '"><span class="t-label">' + label + '&nbsp;</span><span class="t-text">' + msg + '</span></div>';
  el.scrollTop = el.scrollHeight;
};

// Override setStatus for colored states
window._ottoStatusOverride = function(msg) {
  var el = document.getElementById('gl-status');
  if (!el) return;
  el.textContent = msg;
  el.className = '';
  if (/speaking|praat/i.test(msg)) el.className = 'speaking';
  else if (/listen|speak now|your turn|hallo/i.test(msg)) el.className = 'listening';
  else if (/error|denied|limit|disconnected/i.test(msg)) el.className = 'error';
};

// Active state on button + avatar
window._ottoActiveOverride = function(on) {
  var btn = document.getElementById('gl-call-btn');
  var wrap = document.getElementById('avatarWrap');
  var widget = document.getElementById('widget');
  if (btn) btn.classList.toggle('active', on);
  if (wrap) wrap.classList.toggle('active', on);
};

// Handle limit message
window._ottoLimitOverride = function() {
  var msg = document.getElementById('limitMsg');
  if (msg) msg.style.display = 'block';
};
</script>
<style>
#ow-consent{position:absolute;inset:0;background:rgba(6,9,16,.96);border-radius:24px;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center}
#ow-consent h3{font-size:16px;font-weight:700;color:#f3f4f6;margin-bottom:8px}
#ow-consent p{font-size:12px;color:#6b7280;line-height:1.7;margin-bottom:16px}
#ow-consent a{color:#4ade80;text-decoration:none}
#ow-ca{background:#4ade80;color:#000;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;width:100%;margin-bottom:8px}
#ow-cd{background:transparent;color:#4b5563;border:none;font-size:12px;cursor:pointer;padding:6px}
</style>

<script>
// Get ref code from URL or localStorage
var _ottRef = new URLSearchParams(location.search).get('ref') || '';

// Cookie consent — check before allowing Otto
var _consent = localStorage.getItem('cs_consent');
if (!_consent) {
  // Show consent screen inside widget
  var consentEl = document.createElement('div');
  consentEl.id = 'ow-consent';
  consentEl.innerHTML = [
    '<h3>Before we start</h3>',
    '<p>Otto AI stores your conversation to improve our service and tracks referrals using local storage.',
    ' <a href="https://contentscale.site/privacy-policy/" target="_blank">Privacy Policy</a></p>',
    '<button id="ow-ca">Accept & Talk to Otto</button>',
    '<button id="ow-cd">Decline</button>'
  ].join('');
  document.addEventListener('DOMContentLoaded', function() {
    var widget = document.querySelector('.widget');
    if (widget) {
      widget.style.position = 'relative';
      widget.appendChild(consentEl);
      document.getElementById('ow-ca').onclick = function() {
        localStorage.setItem('cs_consent','accepted');
        consentEl.remove();
      };
      document.getElementById('ow-cd').onclick = function() {
        localStorage.setItem('cs_consent','denied');
        document.getElementById('gl-status').textContent = 'Consent required to use Otto.';
        consentEl.remove();
      };
    }
  });
}

// Share screen override — shows after conversation ends
window._ottoOnSessionEnd = function() {
  var shareEl = document.getElementById('shareScreen');
  if (shareEl) shareEl.style.display = 'flex';
};

// Pass ref to token request
window._ottoRefCode = _ottRef;

// Load user's own ref code
fetch('https://app.contentscale.site/api/otto/ref-code')
  .then(function(r){ return r.json(); })
  .then(function(d) {
    var myRef = d.ref_code;
    localStorage.setItem('otto_ref', myRef);
    var myLink = 'https://app.contentscale.site/otto?ref=' + myRef;
    var box = document.getElementById('myRefLink');
    if (box) box.textContent = myLink;
    document.getElementById('waShareBtn').href = 'https://wa.me/?text=' + encodeURIComponent('Hey! Talk to Otto from ContentScale — he explains in 1 minute how we help recover lost SEO traffic: ' + myLink);
    document.getElementById('liShareBtn').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(myLink);
    document.getElementById('copyShareBtn').onclick = function() {
      navigator.clipboard.writeText(myLink).catch(function(){
        var ta = document.createElement('textarea'); ta.value = myLink;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      });
      document.getElementById('copyShareBtn').textContent = 'Copied!';
      setTimeout(function(){ document.getElementById('copyShareBtn').textContent = 'Copy link'; }, 2000);
    };
    document.getElementById('myPts').textContent = d.points || 0;
  }).catch(function(){});
</script>
<script src="https://app.contentscale.site/otto-ai.js" defer></script>

</body>
</html>
`;

app.get('/otto', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Track ref click server-side too
  const ref = req.query.ref;
  if (ref) {
    const visitorIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    pool.query('UPDATE otto_referrals SET clicks=clicks+1, points=points+1 WHERE ref_code=$1', [ref]).catch(()=>{});
    pool.query('INSERT INTO otto_ref_events (ref_code, event_type, visitor_ip, points_awarded) VALUES ($1,$2,$3,$4)', [ref, 'click', visitorIp, 1]).catch(()=>{});
  }
  res.send(_OTTO_WIDGET_HTML);
});


// ── Otto Referral & Leaderboard System ──────────────────────────────────────

// Tables
pool.query(`CREATE TABLE IF NOT EXISTS otto_referrals (
  id SERIAL PRIMARY KEY,
  ref_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) DEFAULT 'Anonymous',
  points INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  ip VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  month_key VARCHAR(7) DEFAULT TO_CHAR(NOW(), 'YYYY-MM')
)`).catch(e => console.warn('[referral]', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS otto_ref_events (
  id SERIAL PRIMARY KEY,
  ref_code VARCHAR(20) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  visitor_ip VARCHAR(100),
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
)`).catch(e => console.warn('[ref_events]', e.message));

function genRefCode() {
  return 'REF-' + Math.random().toString(36).slice(2,8).toUpperCase();
}

// Get or create ref code for a visitor IP
app.get('/api/otto/ref-code', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'anon';
  try {
    const existing = await pool.query('SELECT ref_code, points, clicks, conversations FROM otto_referrals WHERE ip=$1 ORDER BY created_at DESC LIMIT 1', [ip]);
    if (existing.rows.length) {
      return res.json(existing.rows[0]);
    }
    const code = genRefCode();
    await pool.query('INSERT INTO otto_referrals (ref_code, ip) VALUES ($1,$2)', [code, ip]);
    res.json({ ref_code: code, points: 0, clicks: 0, conversations: 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Track a click on a ref link
app.post('/api/otto/ref-click', async (req, res) => {
  const { refCode, visitorIp } = req.body;
  if (!refCode) return res.status(400).json({ error: 'refCode required' });
  try {
    await pool.query('UPDATE otto_referrals SET clicks=clicks+1, points=points+1 WHERE ref_code=$1', [refCode]);
    await pool.query('INSERT INTO otto_ref_events (ref_code, event_type, visitor_ip, points_awarded) VALUES ($1,$2,$3,$4)', [refCode, 'click', visitorIp||'', 1]);
    res.json({ ok: true, points: 1 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Track a conversation started via ref link
app.post('/api/otto/ref-conversation', async (req, res) => {
  const { refCode, visitorIp } = req.body;
  if (!refCode) return res.json({ ok: true });
  try {
    await pool.query('UPDATE otto_referrals SET conversations=conversations+1, points=points+3 WHERE ref_code=$1', [refCode]);
    await pool.query('INSERT INTO otto_ref_events (ref_code, event_type, visitor_ip, points_awarded) VALUES ($1,$2,$3,$4)', [refCode, 'conversation', visitorIp||'', 3]);
    res.json({ ok: true, points: 3 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Set name for leaderboard
app.post('/api/otto/ref-name', async (req, res) => {
  const { refCode, name } = req.body;
  if (!refCode || !name) return res.status(400).json({ error: 'refCode and name required' });
  try {
    await pool.query('UPDATE otto_referrals SET name=$1 WHERE ref_code=$2', [name.slice(0,50), refCode]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Public leaderboard — top 25 current month
app.get('/api/otto/leaderboard', async (req, res) => {
  const monthKey = new Date().toISOString().slice(0,7);
  try {
    const r = await pool.query(
      `SELECT ref_code, name, points, clicks, conversations 
       FROM otto_referrals 
       WHERE month_key=$1 AND points > 0
       ORDER BY points DESC LIMIT 25`,
      [monthKey]
    );
    res.json({ month: monthKey, leaderboard: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Otto leaderboard page ─────────────────────────────────────────────────
const _OTTO_LB_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Otto AI Leaderboard — ContentScale</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#060910;font-family:'Inter',sans-serif;color:#f9fafb;min-height:100vh;padding:24px 16px 48px}
  .page{max-width:480px;margin:0 auto}
  .header{text-align:center;margin-bottom:32px;padding-top:16px}
  .logo{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#374151;font-family:'JetBrains Mono',monospace;margin-bottom:16px}
  h1{font-size:32px;font-weight:900;letter-spacing:.08em;background:linear-gradient(90deg,#4ade80,#86efac,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
  .subtitle{font-size:13px;color:#6b7280;margin-bottom:4px}
  .prize-banner{background:linear-gradient(135deg,#1a1206,#2a1d08);border:1px solid rgba(251,191,36,.2);border-radius:12px;padding:14px 18px;margin:20px 0;display:flex;align-items:center;gap:12px}
  .prize-icon{font-size:24px;flex-shrink:0}
  .prize-text{font-size:13px;color:#fbbf24;line-height:1.5}
  .prize-text strong{font-size:15px;display:block;color:#fcd34d;font-weight:700}
  .month-badge{display:inline-block;font-size:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);color:#4ade80;padding:4px 10px;border-radius:20px;margin-bottom:20px}
  .lb-card{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:16px;overflow:hidden;margin-bottom:20px}
  .lb-header{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center}
  .lb-header span{font-size:11px;color:#4b5563;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase}
  .lb-row{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s}
  .lb-row:last-child{border-bottom:none}
  .lb-row:hover{background:rgba(255,255,255,.02)}
  .rank{width:22px;text-align:center;font-size:13px;font-weight:600;color:#4b5563;font-family:'JetBrains Mono',monospace}
  .medal{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
  .m1{background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3)}
  .m2{background:rgba(156,163,175,.12);color:#9ca3af;border:1px solid rgba(156,163,175,.25)}
  .m3{background:rgba(180,83,9,.15);color:#b45309;border:1px solid rgba(180,83,9,.3)}
  .m-other{background:rgba(255,255,255,.04);color:#4b5563;font-size:12px}
  .lb-info{flex:1;min-width:0}
  .lb-name{font-size:14px;font-weight:600;color:#f3f4f6;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lb-meta{font-size:11px;color:#4b5563;display:flex;gap:10px}
  .lb-pts{font-size:15px;font-weight:700;color:#4ade80;font-family:'JetBrains Mono',monospace;flex-shrink:0}
  .bar-wrap{height:3px;background:rgba(255,255,255,.05);border-radius:2px;margin-top:6px}
  .bar-fill{height:3px;border-radius:2px;background:linear-gradient(90deg,#4ade80,#60a5fa)}
  .your-card{background:linear-gradient(135deg,#0d1f12,#0a1520);border:1px solid rgba(74,222,128,.2);border-radius:16px;padding:18px;margin-bottom:20px}
  .your-label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#4ade80;font-family:'JetBrains Mono',monospace;margin-bottom:10px}
  .your-code{background:rgba(0,0,0,.3);border-radius:8px;padding:10px 14px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;cursor:pointer;border:1px solid rgba(74,222,128,.1)}
  .copy-lbl{font-size:11px;color:#4ade80;font-weight:600}
  .your-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
  .stat{text-align:center;background:rgba(0,0,0,.2);border-radius:8px;padding:10px 6px}
  .stat-num{font-size:20px;font-weight:700;color:#f3f4f6}
  .stat-lbl{font-size:10px;color:#4b5563;margin-top:2px}
  .share-row{display:flex;gap:8px;flex-wrap:wrap}
  .sbtn{font-size:12px;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#d1d5db;cursor:pointer;display:flex;align-items:center;gap:6px;text-decoration:none;transition:all .15s}
  .sbtn:hover{background:rgba(255,255,255,.08)}
  .sbtn.wa{border-color:rgba(37,211,102,.3);color:#25d366}
  .sbtn.li{border-color:rgba(10,102,194,.3);color:#60a5fa}
  .name-form{margin-top:12px;display:flex;gap:8px}
  .name-input{flex:1;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:9px 12px;font-size:13px;color:#f3f4f6;font-family:'Inter',sans-serif;outline:none}
  .name-input:focus{border-color:rgba(74,222,128,.4)}
  .name-input::placeholder{color:#4b5563}
  .name-btn{background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.3);color:#4ade80;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
  .empty{text-align:center;padding:40px 20px;color:#374151;font-size:13px}
  .loading{text-align:center;padding:40px;color:#374151;font-size:13px}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1f2937;border:1px solid rgba(74,222,128,.3);color:#4ade80;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;opacity:0;transition:opacity .3s;pointer-events:none;z-index:99}
  .toast.show{opacity:1}
  .cta{text-align:center;margin-top:8px}
  .cta a{font-size:13px;color:#60a5fa;text-decoration:none}
  .cta a:hover{color:#93c5fd}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">ContentScale · Otto AI</div>
    <h1>LEADERBOARD</h1>
    <div class="subtitle">Share Otto. Earn points. Win €250 in free services.</div>
    <div id="monthBadge" class="month-badge">Loading...</div>
  <div style="margin-top:8px;font-size:11px;color:#4b5563;font-family:'JetBrains Mono',monospace">
    Resets in <span id="countdown" style="color:#fbbf24;font-weight:700">--d --h --m</span>
  </div>
  </div>

  <div class="prize-banner">
    <div class="prize-icon">🏆</div>
    <div class="prize-text">
      <strong>Top 3 this month win €250</strong>
      Free ContentScale services — GRAAF scan, PULSE+NEXUS audit, or lead generation credits.
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
    <div style="background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;text-align:center">
      <div id="totalConvos" style="font-size:28px;font-weight:900;color:#4ade80;font-family:'JetBrains Mono',monospace">—</div>
      <div style="font-size:10px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-top:4px">Conversations</div>
    </div>
    <div style="background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;text-align:center">
      <div id="totalReferrers" style="font-size:28px;font-weight:900;color:#60a5fa;font-family:'JetBrains Mono',monospace">—</div>
      <div style="font-size:10px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-top:4px">Referrers</div>
    </div>
  </div>

  <div class="your-card" id="yourCard" style="display:none">
    <div class="your-label">Your referral link</div>
    <div class="your-code" id="refCodeBox" onclick="copyLink()">
      <span id="refCodeDisplay">Loading...</span>
      <span class="copy-lbl">Copy</span>
    </div>
    <div class="your-stats">
      <div class="stat"><div class="stat-num" id="statPts">0</div><div class="stat-lbl">Points</div></div>
      <div class="stat"><div class="stat-num" id="statClicks">0</div><div class="stat-lbl">Clicks</div></div>
      <div class="stat"><div class="stat-num" id="statConvos">0</div><div class="stat-lbl">Talks</div></div>
    </div>
    <div class="share-row">
      <a id="waBtn" class="sbtn wa" href="#" target="_blank">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.3-.7-.5-.6-.7-.6h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.1.2 2.2 3.4 5.4 4.7.8.3 1.4.5 1.8.6.8.2 1.5.2 2 .1.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.2.2-1.4l-.5-.2z"/></svg>
        WhatsApp
      </a>
      <a id="liBtn" class="sbtn li" href="#" target="_blank">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
        LinkedIn
      </a>
      <button class="sbtn" onclick="copyLink()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy link
      </button>
    </div>
    <div class="name-form">
      <input class="name-input" id="nameInput" type="text" placeholder="Your name for the leaderboard..." maxlength="50">
      <button class="name-btn" onclick="saveName()">Save</button>
    </div>
  </div>

  <div class="lb-card">
    <div class="lb-header">
      <span>Rank · Name</span>
      <span>Points</span>
    </div>
    <div id="lbBody"><div class="loading">Loading leaderboard...</div></div>
  </div>

  <div class="cta"><a href="/otto">Talk to Otto →</a></div>
</div>

<div class="toast" id="toast"></div>

<script>
var BASE = 'https://app.contentscale.site';
var myRef = localStorage.getItem('otto_ref') || '';
var myLink = '';

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2500);
}

function copyLink() {
  if (!myLink) return;
  navigator.clipboard.writeText(myLink).then(function(){
    toast('Link copied!');
  }).catch(function(){
    var ta = document.createElement('textarea');
    ta.value = myLink;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Link copied!');
  });
}

function saveName() {
  var name = document.getElementById('nameInput').value.trim();
  if (!name || !myRef) return;
  fetch(BASE + '/api/otto/ref-name', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ refCode: myRef, name: name })
  }).then(function(){ toast('Name saved!'); loadLeaderboard(); });
}

function loadMyCard() {
  fetch(BASE + '/api/otto/ref-code').then(function(r){ return r.json(); }).then(function(d) {
    myRef = d.ref_code;
    localStorage.setItem('otto_ref', myRef);
    myLink = 'https://app.contentscale.site/otto?ref=' + myRef;
    document.getElementById('refCodeDisplay').textContent = myLink;
    document.getElementById('statPts').textContent = d.points || 0;
    document.getElementById('statClicks').textContent = d.clicks || 0;
    document.getElementById('statConvos').textContent = d.conversations || 0;
    document.getElementById('waBtn').href = 'https://wa.me/?text=' + encodeURIComponent('Hey! Talk to Otto — ContentScale AI assistant. He explains how we help recover lost SEO traffic. Only 1 minute: ' + myLink);
    document.getElementById('liBtn').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(myLink);
    document.getElementById('yourCard').style.display = 'block';
  });
}

function loadLeaderboard() {
  fetch(BASE + '/api/otto/leaderboard').then(function(r){ return r.json(); }).then(function(d) {
    var month = d.month || '';
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var mIdx = parseInt(month.slice(5,7)) - 1;
    document.getElementById('monthBadge').textContent = monthNames[mIdx] + ' ' + month.slice(0,4) + ' · Resets monthly';
    
    var rows = d.leaderboard || [];
    var maxPts = rows.length ? rows[0].points : 1;
    var body = document.getElementById('lbBody');
    
    if (!rows.length) {
      body.innerHTML = '<div class="empty">No entries yet this month.<br>Be the first to share!</div>';
      return;
    }

    var medals = ['🥇','🥈','🥉'];
    var medalClass = ['m1','m2','m3'];
    body.innerHTML = rows.map(function(r, i) {
      var pct = Math.round((r.points / maxPts) * 100);
      var isMe = r.ref_code === myRef;
      return '<div class="lb-row" style="' + (isMe ? 'background:rgba(74,222,128,.04);' : '') + '">' +
        '<span class="rank">' + (i > 2 ? (i+1) : '') + '</span>' +
        '<div class="medal ' + (i < 3 ? medalClass[i] : 'm-other') + '">' + (i < 3 ? medals[i] : (i+1)) + '</div>' +
        '<div class="lb-info">' +
          '<div class="lb-name">' + (r.name || 'Anonymous') + (isMe ? ' <span style="font-size:10px;color:#4ade80">(you)</span>' : '') + '</div>' +
          '<div class="lb-meta"><span>' + r.clicks + ' clicks</span><span>' + r.conversations + ' talks</span></div>' +
          '<div class="bar-wrap"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<span class="lb-pts">' + r.points + '</span>' +
      '</div>';
    }).join('');
  });
}

// Track ref click if came from a ref link
var params = new URLSearchParams(location.search);
var incomingRef = params.get('ref');
if (incomingRef) {
  fetch(BASE + '/api/otto/ref-click', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ refCode: incomingRef })
  });
}

// Countdown to end of month
function updateCountdown() {
  var now = new Date();
  var endOfMonth = new Date(now.getFullYear(), now.getMonth()+1, 1, 0, 0, 0);
  var diff = endOfMonth - now;
  if (diff < 0) { document.getElementById('countdown').textContent = 'Resetting...'; return; }
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  document.getElementById('countdown').textContent = d + 'd ' + h + 'h ' + m + 'm ' + s + 's';
}
updateCountdown();
setInterval(updateCountdown, 1000);

// Load stats
function loadStats() {
  fetch(BASE + '/api/otto/leaderboard').then(function(r){ return r.json(); }).then(function(d) {
    var rows = d.leaderboard || [];
    var totalConvos = rows.reduce(function(a,r){ return a + (r.conversations||0); }, 0);
    document.getElementById('totalConvos').textContent = totalConvos;
    document.getElementById('totalReferrers').textContent = rows.length;
  });
}

loadMyCard();
loadLeaderboard();
loadStats();
setInterval(loadLeaderboard, 30000);
setInterval(loadStats, 30000);
</script>
</body>
</html>
`;

app.get('/otto/leaderboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(_OTTO_LB_HTML);
});


// ── SEO Audit page ───────────────────────────────────────────────────────
const _SEO_AUDIT_HTML = Buffer.from("PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9IlVURi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgo8dGl0bGU+UFVMU0UgKyBORVhVUyB2NCB8IENvbnRlbnRTY2FsZSBFbGl0ZSBTRU8gQXVkaXQ8L3RpdGxlPgo8bGluayBocmVmPSJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2NzczI/ZmFtaWx5PUJlYmFzK05ldWUmZmFtaWx5PURNK1NhbnM6d2dodEAzMDA7NDAwOzUwMDs3MDAmZmFtaWx5PUlCTStQbGV4K01vbm86d2dodEA0MDA7NzAwJmRpc3BsYXk9c3dhcCIgcmVsPSJzdHlsZXNoZWV0Ij4KPHN0eWxlPgoqLCo6OmJlZm9yZSwqOjphZnRlcntib3gtc2l6aW5nOmJvcmRlci1ib3g7bWFyZ2luOjA7cGFkZGluZzowfQo6cm9vdHsKICAtLWJnOiMwMzA3MTI7LS1jYXJkOiMwZjE3MmE7LS1zdXJmYWNlOiMxZTI5M2I7LS1ib3JkZXI6IzMzNDE1NTsKICAtLWluazojZjlmYWZiOy0tbXV0ZWQ6Izk0YTNiODstLXN1YjojNjQ3NDhiOy0tZGltOiM0NzU1Njk7CiAgLS1wdXJwbGU6I2E3OGJmYTstLWJsdWU6IzYwYTVmYTstLWdyZWVuOiM0YWRlODA7LS1vcmFuZ2U6I2ZiOTIzYzsKICAtLWFtYmVyOiNmNTllMGI7LS1yZWQ6I2Y0M2YzZjstLWdvbGQ6I2ZiYmYyNDsKICAtLXB1bHNlOiNmNDNmM2Y7LS1uZXh1czojYTc4YmZhOwp9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjttaW4taGVpZ2h0OjEwMHZoO2xpbmUtaGVpZ2h0OjEuNTt9Ci53cmFwe21heC13aWR0aDoxMjAwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nOjAgMjRweCA4MHB4O30KCi8qIFRvcGJhciAqLwoudG9wYmFye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47cGFkZGluZzoyMHB4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTttYXJnaW4tYm90dG9tOjI4cHg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7fQouYnJhbmR7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjI0cHg7bGV0dGVyLXNwYWNpbmc6LjA2ZW07YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsI2E3OGJmYSwjNjBhNWZhKTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0Oy13ZWJraXQtdGV4dC1maWxsLWNvbG9yOnRyYW5zcGFyZW50O2JhY2tncm91bmQtY2xpcDp0ZXh0O3RleHQtZGVjb3JhdGlvbjpub25lO30KLnRvcGJhci10aXRsZXtmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MTdweDtsZXR0ZXItc3BhY2luZzouMDRlbTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1wdWxzZSksdmFyKC0tbmV4dXMpKTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0Oy13ZWJraXQtdGV4dC1maWxsLWNvbG9yOnRyYW5zcGFyZW50O2JhY2tncm91bmQtY2xpcDp0ZXh0O30KLnRvcGJhci1zdWJ7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7fQoKLyogTW9kZXMgKi8KLm1vZGVze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmcjtnYXA6MDttYXJnaW4tYm90dG9tOjI4cHg7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo4cHg7b3ZlcmZsb3c6aGlkZGVuO30KLm1vZGUtYnRue3BhZGRpbmc6MTZweCAyMHB4O2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxN3B4O2xldHRlci1zcGFjaW5nOi4wNWVtO2JhY2tncm91bmQ6bm9uZTtib3JkZXI6bm9uZTtib3JkZXItcmlnaHQ6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Y29sb3I6dmFyKC0tc3ViKTtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmFsbCAuMnM7dGV4dC1hbGlnbjpsZWZ0O2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEycHg7fQoubW9kZS1idG46bGFzdC1jaGlsZHtib3JkZXItcmlnaHQ6bm9uZTt9Ci5tb2RlLWJ0bi5hY3RpdmV7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wNCk7Y29sb3I6dmFyKC0taW5rKTt9Ci5tb2RlLWJ0biAubWl7Zm9udC1zaXplOjIycHg7fQoubW9kZS1idG4gLm1ze2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6M3B4O30KLm1vZGUtYnRuLmFjdGl2ZSAubXN7Y29sb3I6dmFyKC0tbXV0ZWQpO30KCi8qIFBhbmVsICovCi5wYW5lbHtiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoyNnB4O21hcmdpbi1ib3R0b206MThweDtwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW47fQoucGFuZWw6OmJlZm9yZXtjb250ZW50OicnO3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO2xlZnQ6MDtyaWdodDowO2hlaWdodDozcHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsdmFyKC0tcHVsc2UpLHZhcigtLWdvbGQpLHZhcigtLW5leHVzKSk7fQoucGFuZWwtdGl0bGV7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO21hcmdpbi1ib3R0b206MThweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7ZmxleC13cmFwOndyYXA7fQoucGFuZWwtYmFkZ2V7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6MnB4IDZweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC4zKTt9CgovKiBVcGxvYWQgKi8KLnVwbG9hZC16b25le2JvcmRlcjoycHggZGFzaGVkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzozMnB4O3RleHQtYWxpZ246Y2VudGVyO2N1cnNvcjpwb2ludGVyO3RyYW5zaXRpb246YWxsIC4ycztwb3NpdGlvbjpyZWxhdGl2ZTt9Ci51cGxvYWQtem9uZTpob3ZlciwudXBsb2FkLXpvbmUuZHJhZ3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7YmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjA0KTt9Ci51cGxvYWQtem9uZSBpbnB1dFt0eXBlPWZpbGVde3Bvc2l0aW9uOmFic29sdXRlO2luc2V0OjA7b3BhY2l0eTowO2N1cnNvcjpwb2ludGVyO3dpZHRoOjEwMCU7aGVpZ2h0OjEwMCU7fQoKLyogRmllbGRzICovCi5maWVsZHttYXJnaW4tYm90dG9tOjA7fQouZmllbGQgbGFiZWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo3cHg7fQouZmllbGQgaW5wdXQsLmZpZWxkIHNlbGVjdCwuZmllbGQgdGV4dGFyZWF7d2lkdGg6MTAwJTtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoxMXB4IDEzcHg7Zm9udC1mYW1pbHk6J0RNIFNhbnMnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjEzcHg7Y29sb3I6dmFyKC0taW5rKTtvdXRsaW5lOm5vbmU7dHJhbnNpdGlvbjphbGwgLjJzO3Jlc2l6ZTp2ZXJ0aWNhbDt9Ci5maWVsZCB0ZXh0YXJlYXttaW4taGVpZ2h0OjkwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDt9Ci5maWVsZCBpbnB1dDpmb2N1cywuZmllbGQgc2VsZWN0OmZvY3VzLC5maWVsZCB0ZXh0YXJlYTpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7Ym94LXNoYWRvdzowIDAgMCAzcHggcmdiYSgyNTEsMTkxLDM2LC4wNyk7fQouZmllbGQgc2VsZWN0IG9wdGlvbntiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO30KLmcye2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmcjtnYXA6MTRweDt9Ci5nM3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnIgMWZyO2dhcDoxNHB4O30KLmc0e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmciAxZnIgMWZyO2dhcDoxMnB4O30KCi8qIEJ1dHRvbnMgKi8KLmJ0bi1nb2xke2JhY2tncm91bmQ6dmFyKC0tZ29sZCk7Y29sb3I6IzAwMDtib3JkZXI6bm9uZTtmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MjJweDtsZXR0ZXItc3BhY2luZzouMDVlbTtwYWRkaW5nOjE2cHggMzZweDtib3JkZXItcmFkaXVzOjZweDtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmFsbCAuMnM7d2lkdGg6MTAwJTttYXJnaW4tdG9wOjZweDt9Ci5idG4tZ29sZDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLWluayk7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTFweCk7fQouYnRuLWdvbGQ6ZGlzYWJsZWR7b3BhY2l0eTouMzU7Y3Vyc29yOm5vdC1hbGxvd2VkO3RyYW5zZm9ybTpub25lO30KLmJ0bi1zbXtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6NXB4IDEycHg7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7dHJhbnNpdGlvbjphbGwgLjE1cztib3JkZXI6MXB4IHNvbGlkO3doaXRlLXNwYWNlOm5vd3JhcDt9Ci5idG4tYmx1ZXtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMSk7Ym9yZGVyLWNvbG9yOnJnYmEoOTYsMTY1LDI1MCwuMyk7Y29sb3I6dmFyKC0tYmx1ZSk7fQouYnRuLWJsdWU6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1ibHVlKTtjb2xvcjojMDAwO30KLmJ0bi1wdXJwbGV7YmFja2dyb3VuZDpyZ2JhKDE2NywxMzksMjUwLC4xKTtib3JkZXItY29sb3I6cmdiYSgxNjcsMTM5LDI1MCwuMyk7Y29sb3I6dmFyKC0tcHVycGxlKTt9Ci5idG4tcHVycGxlOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tcHVycGxlKTtjb2xvcjojMDAwO30KLmJ0bi1ncmVlbntiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMSk7Ym9yZGVyLWNvbG9yOnJnYmEoNzQsMjIyLDEyOCwuMyk7Y29sb3I6dmFyKC0tZ3JlZW4pO30KLmJ0bi1ncmVlbjpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLWdyZWVuKTtjb2xvcjojMDAwO30KLmJ0bi1tdXRlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlci1jb2xvcjp2YXIoLS1ib3JkZXIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5idG4tbXV0ZWQ6aG92ZXJ7Y29sb3I6dmFyKC0taW5rKTt9CgovKiBQcmlvcml0eSBib3gg4oCUIHNob3duIGZpcnN0ICovCi5wcmlvcml0eS1ib3h7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHJnYmEoMjUxLDE5MSwzNiwuMDgpLHJnYmEoMjQ0LDYzLDYzLC4wNSkpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC4zKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoyMHB4O21hcmdpbi1ib3R0b206MTRweDt9Ci5wcmlvcml0eS1ib3gtdGl0bGV7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIycHg7bGV0dGVyLXNwYWNpbmc6LjA0ZW07Y29sb3I6dmFyKC0tZ29sZCk7bWFyZ2luLWJvdHRvbToxMnB4O2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDt9CgovKiBPcHBvcnR1bml0eSB0YWJsZSAqLwoub3BwLXRhYmxle3dpZHRoOjEwMCU7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO2ZvbnQtc2l6ZToxMnB4O30KLm9wcC10YWJsZSB0aHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2NvbG9yOnZhcigtLW11dGVkKTtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6OXB4IDExcHg7dGV4dC1hbGlnbjpsZWZ0O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Ci5vcHAtdGFibGUgdGR7cGFkZGluZzo5cHggMTFweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7dmVydGljYWwtYWxpZ246bWlkZGxlO30KLm9wcC10YWJsZSB0cjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsLjAyKTt9Ci5vcHAtYmFye2hlaWdodDo1cHg7Ym9yZGVyLXJhZGl1czozcHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsdmFyKC0tcHVsc2UpLHZhcigtLWdvbGQpKTttYXJnaW4tdG9wOjNweDt9Ci50cmVuZC11cHtjb2xvcjp2YXIoLS1ncmVlbik7fQoudHJlbmQtZG93bntjb2xvcjp2YXIoLS1yZWQpO30KLnRyZW5kLWZsYXR7Y29sb3I6dmFyKC0tbXV0ZWQpO30KCi8qIENhbm5pYmFsaXphdGlvbiAqLwouY2Fubi1jYXJke2JhY2tncm91bmQ6cmdiYSgyNDQsNjMsNjMsLjA1KTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjQ0LDYzLDYzLC4yKTtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjE0cHg7bWFyZ2luLWJvdHRvbToxMHB4O30KLmNhbm4tY2FyZCBoNHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXJlZCk7bWFyZ2luLWJvdHRvbTo4cHg7fQoKLyogUHJvZ3Jlc3MgKi8KLnByb2dyZXNze2Rpc3BsYXk6bm9uZTtiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoyMnB4O21hcmdpbi1ib3R0b206MThweDt9Ci5wcm9ncmVzcy5zaG93e2Rpc3BsYXk6YmxvY2s7fQoucHJvZy1sYWJlbHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4xNWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLWJvdHRvbToxMnB4O30KLnByb2ctc3RlcHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O3BhZGRpbmc6N3B4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwuMDMpO2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLWRpbSk7fQoucHJvZy1zdGVwOmxhc3QtY2hpbGR7Ym9yZGVyOm5vbmU7fQoucHJvZy1zdGVwLmFjdGl2ZXtjb2xvcjp2YXIoLS1nb2xkKTt9Ci5wcm9nLXN0ZXAuZG9uZXtjb2xvcjp2YXIoLS1ncmVlbik7fQoucHJvZy1zdGVwLmVycm9ye2NvbG9yOnZhcigtLXJlZCk7fQoucHJvZy1pY29ue2ZvbnQtc2l6ZToxNHB4O3dpZHRoOjE4cHg7dGV4dC1hbGlnbjpjZW50ZXI7ZmxleC1zaHJpbms6MDt9Ci5wcm9nLWJhci13cmFwe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czo0cHg7aGVpZ2h0OjRweDtvdmVyZmxvdzpoaWRkZW47bWFyZ2luLXRvcDoxMnB4O30KLnByb2ctYmFye2hlaWdodDoxMDAlO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLXB1bHNlKSx2YXIoLS1nb2xkKSx2YXIoLS1uZXh1cykpO3RyYW5zaXRpb246d2lkdGggLjVzIGVhc2U7Ym9yZGVyLXJhZGl1czo0cHg7d2lkdGg6MCU7fQoKLyogT3V0cHV0ICovCi5vdXRwdXR7ZGlzcGxheTpub25lO30KLm91dHB1dC5zaG93e2Rpc3BsYXk6YmxvY2s7fQouc2VjLWNhcmR7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czoxMHB4O21hcmdpbi1ib3R0b206MTRweDtvdmVyZmxvdzpoaWRkZW47fQouc2VjLWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTFweDtwYWRkaW5nOjE0cHggMThweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2N1cnNvcjpwb2ludGVyO2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuMDIpO30KLnNlYy1oZWFkOmhvdmVye2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuMDQpO30KLnNlYy10aXRsZXtmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MThweDtsZXR0ZXItc3BhY2luZzouMDVlbTtmbGV4OjE7fQouYmFkZ2V7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6MnB4IDdweDtib3JkZXItcmFkaXVzOjNweDt9Ci5iLXB1bHNle2JhY2tncm91bmQ6cmdiYSgyNDQsNjMsNjMsLjE1KTtjb2xvcjp2YXIoLS1wdWxzZSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI0NCw2Myw2MywuMyk7fQouYi1uZXh1c3tiYWNrZ3JvdW5kOnJnYmEoMTY3LDEzOSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1uZXh1cyk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDE2NywxMzksMjUwLC4zKTt9Ci5iLXRlY2h7YmFja2dyb3VuZDpyZ2JhKDk2LDE2NSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1ibHVlKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoOTYsMTY1LDI1MCwuMyk7fQouYi13aW57YmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjE1KTtjb2xvcjp2YXIoLS1ncmVlbik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDc0LDIyMiwxMjgsLjMpO30KLmItZ29sZHtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC4zKTt9Ci5zZWMtYm9keXtwYWRkaW5nOjIwcHg7fQouc2VjLWJvZHkuaGlkZGVue2Rpc3BsYXk6bm9uZTt9CgovKiBNYXJrZG93biAqLwoubWR7Zm9udC1zaXplOjEzcHg7bGluZS1oZWlnaHQ6MS44O2NvbG9yOnZhcigtLW11dGVkKTt9Ci5tZCBoMSwubWQgaDIsLm1kIGgze2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2xldHRlci1zcGFjaW5nOi4wNGVtO2NvbG9yOnZhcigtLWluayk7bWFyZ2luOjE2cHggMCA3cHg7fQoubWQgaDF7Zm9udC1zaXplOjI1cHg7fQoubWQgaDJ7Zm9udC1zaXplOjIwcHg7Y29sb3I6dmFyKC0tZ29sZCk7fQoubWQgaDN7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0tcHVycGxlKTt9Ci5tZCBwe21hcmdpbi1ib3R0b206OXB4O30KLm1kIHVsLC5tZCBvbHttYXJnaW46N3B4IDAgMTNweCAxNnB4O30KLm1kIGxpe21hcmdpbi1ib3R0b206NHB4O30KLm1kIHN0cm9uZ3tjb2xvcjp2YXIoLS1pbmspO2ZvbnQtd2VpZ2h0OjcwMDt9Ci5tZCBlbXtjb2xvcjp2YXIoLS1hbWJlcik7fQoubWQgY29kZXtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjNweDtwYWRkaW5nOjFweCA1cHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1ibHVlKTt9Ci5tZCBwcmV7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoxM3B4O292ZXJmbG93LXg6YXV0bzttYXJnaW46MTFweCAwO30KLm1kIHByZSBjb2Rle2JhY2tncm91bmQ6bm9uZTtib3JkZXI6bm9uZTtwYWRkaW5nOjA7Zm9udC1zaXplOjExcHg7fQoubWQgdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWFyZ2luOjEycHggMDtmb250LXNpemU6MTJweDt9Ci5tZCB0aHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2NvbG9yOnZhcigtLW11dGVkKTtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6N3B4IDEwcHg7dGV4dC1hbGlnbjpsZWZ0O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Ci5tZCB0ZHtwYWRkaW5nOjdweCAxMHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Ci5tZCB0cjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsLjAyKTt9Ci5tZCBibG9ja3F1b3Rle2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1nb2xkKTtwYWRkaW5nOjlweCAxNHB4O2JhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4wNSk7Ym9yZGVyLXJhZGl1czowIDZweCA2cHggMDttYXJnaW46MTFweCAwO2ZvbnQtc3R5bGU6aXRhbGljO2NvbG9yOnZhcigtLWluayk7fQoubWQgaHJ7Ym9yZGVyOm5vbmU7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tYm9yZGVyKTttYXJnaW46MTZweCAwO30KCi5pbmZve2JhY2tncm91bmQ6cmdiYSg5NiwxNjUsMjUwLC4wNik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDk2LDE2NSwyNTAsLjIpO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MTFweCAxNHB4O2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLW11dGVkKTtsaW5lLWhlaWdodDoxLjY7bWFyZ2luLWJvdHRvbToxNHB4O30KLmluZm8gc3Ryb25ne2NvbG9yOnZhcigtLWJsdWUpO30KLndhcm57YmFja2dyb3VuZDpyZ2JhKDI0NCw2Myw2MywuMDYpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNDQsNjMsNjMsLjIpO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MTFweCAxNHB4O2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLW11dGVkKTtsaW5lLWhlaWdodDoxLjY7bWFyZ2luLWJvdHRvbToxNHB4O30KLndhcm4gc3Ryb25ne2NvbG9yOnZhcigtLXJlZCk7fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2JvdHRvbTo0MHB4O2xlZnQ6NTAlO3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpIHRyYW5zbGF0ZVkoMjBweCk7YmFja2dyb3VuZDp2YXIoLS1nb2xkKTtjb2xvcjojMDAwO3BhZGRpbmc6MTFweCAyMnB4O2JvcmRlci1yYWRpdXM6NTBweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtvcGFjaXR5OjA7dHJhbnNpdGlvbjphbGwgLjNzO3otaW5kZXg6MTAwMDA7cG9pbnRlci1ldmVudHM6bm9uZTt9Ci50b2FzdC5zaG93e29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKSB0cmFuc2xhdGVZKDApO30KCi8qIFByaW9yaXR5IGFjdGlvbiBjYXJkICovCi5hY3Rpb24tY2FyZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtnYXA6MTJweDtwYWRkaW5nOjEycHggMTRweDtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMDYpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC4yKTtib3JkZXItcmFkaXVzOjdweDttYXJnaW4tYm90dG9tOjhweDt9Ci5hY3Rpb24tbnVte2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyOHB4O2NvbG9yOnZhcigtLWdvbGQpO2xpbmUtaGVpZ2h0OjE7ZmxleC1zaHJpbms6MDt3aWR0aDoyOHB4O30KLmFjdGlvbi1ib2R5IHN0cm9uZ3tjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxM3B4O2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTozcHg7fQouYWN0aW9uLWJvZHkgc3Bhbntmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1tdXRlZCk7fQoKI2J1bGtWaWV3LCNkZWVwVmlld3tkaXNwbGF5Om5vbmU7fQojYnVsa1ZpZXcuYWN0aXZlLCNkZWVwVmlldy5hY3RpdmV7ZGlzcGxheTpibG9jazt9CgpAbWVkaWEobWF4LXdpZHRoOjcyMHB4KXsKICAuZzIsLmczLC5nNCwubW9kZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcjt9CiAgLndyYXB7cGFkZGluZzowIDE2cHggNjBweDt9CiAgLnRvcGJhcntwYWRkaW5nOjE0cHggMDt9CiAgLmJyYW5ke2ZvbnQtc2l6ZToyMHB4O30KfQoKLyog4pSA4pSAIE1PQklMRSBSRVNQT05TSVZFIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqLwpodG1sLGJvZHl7bWF4LXdpZHRoOjEwMCU7b3ZlcmZsb3cteDpoaWRkZW47fQppbWcsdGFibGUsaWZyYW1le21heC13aWR0aDoxMDAlO30KQG1lZGlhKG1heC13aWR0aDo3NjhweCl7CiAgLndyYXB7cGFkZGluZzowIDE0cHggNjBweCFpbXBvcnRhbnQ7fQogIC50b3BiYXJ7cGFkZGluZzoxMnB4IDA7Z2FwOjhweDt9CiAgLnRvcGJhci1yaWdodHtnYXA6NXB4O30KICAuYnRue2ZvbnQtc2l6ZTo4cHg7cGFkZGluZzo2cHggMTBweDt9CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpIWltcG9ydGFudDt9CiAgLmFkZC1yb3d7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAuYWRkLXJvdyBpbnB1dCwuYWRkLXJvdyBzZWxlY3R7d2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5maWx0ZXItYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NnB4O30KICAuZmlsdGVyLWJhciBzZWxlY3QsLmZpbHRlci1iYXIgaW5wdXR7d2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5jYXJkLWhlYWR7ZmxleC13cmFwOndyYXA7Z2FwOjZweDt9CiAgLnJlYy1oZWFke2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnByZWZpbGwtYm94e21heC13aWR0aDoxMDAlO3dpZHRoOjEwMCU7fQogIC5nMiwuZzMsLmc0LC5jYi1ncmlkLC5jYXJkLWdyaWR7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5wcm9qZWN0LWJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5wZnttaW4td2lkdGg6MTAwJSFpbXBvcnRhbnQ7fQogIC5zdGVwc3tmbGV4LWRpcmVjdGlvbjpjb2x1bW4haW1wb3J0YW50O30KICAuc3RlcHtib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9CiAgLnN0ZXA6bGFzdC1jaGlsZHtib3JkZXItYm90dG9tOm5vbmU7fQogIC5ob3ctc3RlcHtmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5mbG93LXN0ZXB7Z2FwOjEwcHg7fQogIC5yZWMtZm9vdHtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweDt9CiAgLmFjdGlvbi1idG57d2lkdGg6MTAwJTtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2ZvbnQtc2l6ZToxNnB4IWltcG9ydGFudDt9CiAgLm1vZGVze2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIhaW1wb3J0YW50O30KICAubW9kZS1idG57Ym9yZGVyLXJpZ2h0Om5vbmUhaW1wb3J0YW50O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7fQp9CkBtZWRpYShtYXgtd2lkdGg6NDgwcHgpewogIC5vdmVydmlldywuc3VtbWFyeXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmciFpbXBvcnRhbnQ7fQogIC50b3BiYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7fQogIC50b3BiYXItcmlnaHR7ZmxleC13cmFwOndyYXA7fQogIC5jYXJkLW1ldGF7ZmxleC13cmFwOndyYXA7Z2FwOjRweDt9CiAgLmNhcmQtYWN0aW9ucywuY2FyZC1hY3Rpb25zIC5idG4sLmNhcmQtZm9vdHtmbGV4LXdyYXA6d3JhcDt9CiAgaDEsaDIsLnRvb2wtbmFtZXt3b3JkLWJyZWFrOmJyZWFrLXdvcmQ7fQogIC5wYW5lbHtwYWRkaW5nOjE2cHghaW1wb3J0YW50O30KICAuc2VjdGlvbntwYWRkaW5nOjE0cHggMTZweCFpbXBvcnRhbnQ7fQp9Cjwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CjxkaXYgY2xhc3M9IndyYXAiPgogIDxuYXYgY2xhc3M9InRvcGJhciI+CiAgICA8YSBocmVmPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlIiBjbGFzcz0iYnJhbmQiPkNvbnRlbnRTY2FsZTwvYT4KICAgIDxkaXYgc3R5bGU9InRleHQtYWxpZ246cmlnaHQ7Ij4KICAgICAgPGRpdiBjbGFzcz0idG9wYmFyLXRpdGxlIj5QVUxTRSArIE5FWFVTIHY0PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InRvcGJhci1zdWIiPkVsaXRlIFNFTyBBdWRpdCBFbmdpbmU8L2Rpdj4KICAgIDwvZGl2PgogIDwvbmF2PgoKICA8ZGl2IGNsYXNzPSJtb2RlcyI+CiAgICA8YnV0dG9uIGNsYXNzPSJtb2RlLWJ0biBhY3RpdmUiIG9uY2xpY2s9InNldE1vZGUoJ2J1bGsnKSIgaWQ9Im1vZGVCdWxrIj4KICAgICAgPHNwYW4gY2xhc3M9Im1pIj7wn5OKPC9zcGFuPgogICAgICA8c3Bhbj5CVUxLIFNDQU48c3BhbiBjbGFzcz0ibXMiPlVwbG9hZCBHU0MgQ1NWIOKGkiByYW5rIHBhZ2VzIOKGkiBxdWljayB3aW5zPC9zcGFuPjwvc3Bhbj4KICAgIDwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0ibW9kZS1idG4iIG9uY2xpY2s9InNldE1vZGUoJ2RlZXAnKSIgaWQ9Im1vZGVEZWVwIj4KICAgICAgPHNwYW4gY2xhc3M9Im1pIj7wn5SsPC9zcGFuPgogICAgICA8c3Bhbj5ERUVQIERJVkU8c3BhbiBjbGFzcz0ibXMiPlBhc3RlIEhUTUwg4oaSIGZ1bGwgMTAtc3RlcCBhdWRpdCArIGNvbXBldGl0b3IgZGlmZjwvc3Bhbj48L3NwYW4+CiAgICA8L2J1dHRvbj4KICA8L2Rpdj4KCiAgPCEtLSDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZAgQlVMSyBTQ0FOIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkCAtLT4KICA8ZGl2IGlkPSJidWxrVmlldyIgY2xhc3M9ImFjdGl2ZSI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLXRpdGxlIj7ikaAgVXBsb2FkIEdTQyBDU1YgRmlsZXMgPHNwYW4gY2xhc3M9InBhbmVsLWJhZGdlIj5EUkFHICYgRFJPUDwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iaW5mbyI+CiAgICAgICAgPHN0cm9uZz5QYWdlcyBDU1Y6PC9zdHJvbmc+IEdTQyDihpIgUGVyZm9ybWFuY2Ug4oaSIFBhZ2VzIOKGkiBFeHBvcnQgQ1NWICZuYnNwO8K3Jm5ic3A7CiAgICAgICAgPHN0cm9uZz5RdWVyaWVzIENTVjo8L3N0cm9uZz4gR1NDIOKGkiBQZXJmb3JtYW5jZSDihpIgUXVlcmllcyDihpIgRXhwb3J0IENTViAoZW5hYmxlcyBjYW5uaWJhbGl6YXRpb24pCiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJnMiIgc3R5bGU9ImdhcDoxNnB4OyI+CiAgICAgICAgPGRpdj4KICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMTVlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjhweDsiPlBhZ2VzIENTViAocmVxdWlyZWQpPC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJ1cGxvYWQtem9uZSIgaWQ9InBhZ2VzWm9uZSI+CiAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJmaWxlIiBpZD0icGFnZXNGaWxlIiBhY2NlcHQ9Ii5jc3YiIG9uY2hhbmdlPSJoYW5kbGVQYWdlc0NTVih0aGlzKSI+CiAgICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtc2l6ZToyOHB4O21hcmdpbi1ib3R0b206OHB4OyI+8J+ThDwvZGl2PgogICAgICAgICAgICA8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MThweDtsZXR0ZXItc3BhY2luZzouMDRlbTsiPlBhZ2VzIFBlcmZvcm1hbmNlPC9kaXY+CiAgICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjRweDsiPlBhZ2UgwrcgQ2xpY2tzIMK3IEltcHJlc3Npb25zIMK3IENUUiDCtyBQb3NpdGlvbjwvZGl2PgogICAgICAgICAgPC9kaXY+CiAgICAgICAgICA8ZGl2IGlkPSJwYWdlc1N0YXR1cyIgc3R5bGU9Im1hcmdpbi10b3A6OHB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpOyI+PC9kaXY+CiAgICAgICAgPC9kaXY+CiAgICAgICAgPGRpdj4KICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMTVlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjhweDsiPlF1ZXJpZXMgQ1NWIChvcHRpb25hbCk8L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InVwbG9hZC16b25lIiBpZD0icXVlcmllc1pvbmUiPgogICAgICAgICAgICA8aW5wdXQgdHlwZT0iZmlsZSIgaWQ9InF1ZXJpZXNGaWxlIiBhY2NlcHQ9Ii5jc3YiIG9uY2hhbmdlPSJoYW5kbGVRdWVyaWVzQ1NWKHRoaXMpIj4KICAgICAgICAgICAgPGRpdiBzdHlsZT0iZm9udC1zaXplOjI4cHg7bWFyZ2luLWJvdHRvbTo4cHg7Ij7wn5SNPC9kaXY+CiAgICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxOHB4O2xldHRlci1zcGFjaW5nOi4wNGVtOyI+UXVlcmllcyBQZXJmb3JtYW5jZTwvZGl2PgogICAgICAgICAgICA8ZGl2IHN0eWxlPSJmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDo0cHg7Ij5RdWVyeSDCtyBDbGlja3MgwrcgSW1wcmVzc2lvbnMgwrcgQ1RSIMK3IFBvc2l0aW9uPC9kaXY+CiAgICAgICAgICA8L2Rpdj4KICAgICAgICAgIDxkaXYgaWQ9InF1ZXJpZXNTdGF0dXMiIHN0eWxlPSJtYXJnaW4tdG9wOjhweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLW11dGVkKTsiPjwvZGl2PgogICAgICAgIDwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9InBhbmVsIiBpZD0iZmlsdGVyUGFuZWwiIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtdGl0bGUiPuKRoSBGaWx0ZXIgJiBGb2N1czwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJnNCI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5NaW4gSW1wcmVzc2lvbnM8L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIGlkPSJtaW5JbXByIiB2YWx1ZT0iMTAwIiBvbmNoYW5nZT0icmVuZGVyVGFibGUoKSI+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5NaW4gUG9zaXRpb248L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIGlkPSJtaW5Qb3MiIHZhbHVlPSI1IiBvbmNoYW5nZT0icmVuZGVyVGFibGUoKSI+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5NYXggUG9zaXRpb248L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIGlkPSJtYXhQb3MiIHZhbHVlPSI1MCIgb25jaGFuZ2U9InJlbmRlclRhYmxlKCkiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+TWF4IENUUiAlPC9sYWJlbD48aW5wdXQgdHlwZT0ibnVtYmVyIiBpZD0ibWF4Q3RyIiBzdGVwPSIwLjEiIHZhbHVlPSIxMCIgb25jaGFuZ2U9InJlbmRlclRhYmxlKCkiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDo4cHg7YWxpZ24taXRlbXM6Y2VudGVyO21hcmdpbi10b3A6MTBweDtmbGV4LXdyYXA6d3JhcDsiPgogICAgICAgIDxzcGFuIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKTsiIGlkPSJ0YWJsZUNvdW50Ij48L3NwYW4+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuLXNtIGJ0bi1tdXRlZCIgb25jbGljaz0iZXhwb3J0T3BwcygpIj7ihpMgRXhwb3J0IENTVjwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1zbSBidG4tZ3JlZW4iIG9uY2xpY2s9InNob3dDYW5uaWJhbGl6YXRpb24oKSI+8J+UjSBDYW5uaWJhbGl6YXRpb24gUmVwb3J0PC9idXR0b24+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBpZD0iY2FublJlcG9ydCIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiIGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLXRpdGxlIj7wn5SNIEtleXdvcmQgQ2FubmliYWxpemF0aW9uIERldGVjdGlvbiA8c3BhbiBjbGFzcz0icGFuZWwtYmFkZ2UiPkFVVE8tREVURUNURUQ8L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgaWQ9ImNhbm5Cb2R5Ij48L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgaWQ9Im9wcG9ydHVuaXR5VGFibGUiIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij4KICAgICAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjEwcHg7ZmxleC13cmFwOndyYXA7Z2FwOjhweDsiPgogICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMnB4O2xldHRlci1zcGFjaW5nOi4wNGVtOyI+8J+OryBQYWdlcyBSYW5rZWQgYnkgT3Bwb3J0dW5pdHk8L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgc3R5bGU9Im92ZXJmbG93LXg6YXV0bzsiPgogICAgICAgIDx0YWJsZSBjbGFzcz0ib3BwLXRhYmxlIj4KICAgICAgICAgIDx0aGVhZD4KICAgICAgICAgICAgPHRyPjx0aD4jPC90aD48dGg+UGFnZTwvdGg+PHRoPkltcHI8L3RoPjx0aD5DVFI8L3RoPjx0aD5Qb3M8L3RoPjx0aD5TY29yZTwvdGg+PHRoPkFjdGlvbnM8L3RoPjwvdHI+CiAgICAgICAgICA8L3RoZWFkPgogICAgICAgICAgPHRib2R5IGlkPSJ0YWJsZUJvZHkiPjwvdGJvZHk+CiAgICAgICAgPC90YWJsZT4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJwcm9ncmVzcyIgaWQ9InF1aWNrUHJvZ3Jlc3MiPgogICAgICA8ZGl2IGNsYXNzPSJwcm9nLWxhYmVsIiBpZD0icXVpY2tQcm9nTGFiZWwiPlF1aWNrIEF1ZGl0IFJ1bm5pbmcuLi48L2Rpdj4KICAgICAgPGRpdiBpZD0icXVpY2tTdGVwcyI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InByb2ctYmFyLXdyYXAiPjxkaXYgY2xhc3M9InByb2ctYmFyIiBpZD0icXVpY2tCYXIiPjwvZGl2PjwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJvdXRwdXQiIGlkPSJxdWlja091dHB1dCI+PC9kaXY+CiAgPC9kaXY+CgogIDwhLS0g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQIERFRVAgRElWRSDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZAgLS0+CiAgPGRpdiBpZD0iZGVlcFZpZXciPgoKICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtdGl0bGUiPuKRoCBQYWdlIERldGFpbHM8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZzIiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjE0cHg7Ij4KICAgICAgICA8ZGl2IGNsYXNzPSJmaWVsZCI+PGxhYmVsPlBhZ2UgVVJMICo8L2xhYmVsPjxpbnB1dCB0eXBlPSJ1cmwiIGlkPSJkVXJsIiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly9jb250ZW50c2NhbGUuc2l0ZS9ncmFhZi1mcmFtZXdvcmsiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+UHJpbWFyeSBLZXl3b3JkICo8L2xhYmVsPjxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZEt3IiBwbGFjZWhvbGRlcj0iR1JBQUYgZnJhbWV3b3JrIFNFTyAyMDI2Ij48L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImczIj4KICAgICAgICA8ZGl2IGNsYXNzPSJmaWVsZCI+PGxhYmVsPlNlY29uZGFyeSBLZXl3b3JkPC9sYWJlbD48aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImRLdzIiIHBsYWNlaG9sZGVyPSJFRUFUIGNvbnRlbnQgc2NvcmUiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj4KICAgICAgICAgIDxsYWJlbD5HZW88L2xhYmVsPgogICAgICAgICAgPHNlbGVjdCBpZD0iZEdlbyI+CiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9Ik5ldGhlcmxhbmRzIj5OZXRoZXJsYW5kcyDwn4ez8J+HsTwvb3B0aW9uPgogICAgICAgICAgICA8b3B0aW9uIHZhbHVlPSJCZWxnaXVtIj5CZWxnaXVtIPCfh6fwn4eqPC9vcHRpb24+CiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9Ikdsb2JhbCI+R2xvYmFsPC9vcHRpb24+CiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9IlVLIj5VSzwvb3B0aW9uPgogICAgICAgICAgICA8b3B0aW9uIHZhbHVlPSJVU0EiPlVTQTwvb3B0aW9uPgogICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgPC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPgogICAgICAgICAgPGxhYmVsPkNvbnZlcnNpb24gR29hbDwvbGFiZWw+CiAgICAgICAgICA8c2VsZWN0IGlkPSJkR29hbCI+CiAgICAgICAgICAgIDxvcHRpb24+TGVhZCBnZW5lcmF0aW9uPC9vcHRpb24+CiAgICAgICAgICAgIDxvcHRpb24+U2FsZSAvIHB1cmNoYXNlPC9vcHRpb24+CiAgICAgICAgICAgIDxvcHRpb24+RGVtbyAvIGNvbnN1bHRhdGlvbjwvb3B0aW9uPgogICAgICAgICAgICA8b3B0aW9uPkJyYW5kIGF3YXJlbmVzczwvb3B0aW9uPgogICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgPC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC10aXRsZSI+4pGhIEdTQyBEYXRhPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Imc0IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxNHB4OyI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5JbXByZXNzaW9uczwvbGFiZWw+PGlucHV0IHR5cGU9Im51bWJlciIgaWQ9ImRJbXByIiBwbGFjZWhvbGRlcj0iMTI0MDAiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+Q1RSICU8L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIHN0ZXA9IjAuMSIgaWQ9ImRDdHIiIHBsYWNlaG9sZGVyPSIxLjgiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+QXZnIFBvc2l0aW9uPC9sYWJlbD48aW5wdXQgdHlwZT0ibnVtYmVyIiBzdGVwPSIwLjEiIGlkPSJkUG9zIiBwbGFjZWhvbGRlcj0iMzQuMiI+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5Nb2JpbGUgJTwvbGFiZWw+PGlucHV0IHR5cGU9Im51bWJlciIgaWQ9ImRNb2IiIHBsYWNlaG9sZGVyPSI2MiI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmaWVsZCI+CiAgICAgICAgPGxhYmVsPlRvcCBUcmlnZ2VyaW5nIFF1ZXJpZXMgKG9uZSBwZXIgbGluZSk8L2xhYmVsPgogICAgICAgIDx0ZXh0YXJlYSBpZD0iZFF1ZXJpZXMiIHBsYWNlaG9sZGVyPSJncmFhZiBmcmFtZXdvcmsgc2VvJiMxMDtlZWF0IGNvbnRlbnQgc2NvcmUmIzEwO3NlbyBjb250ZW50IHNjYW5uZXIgZnJlZSI+PC90ZXh0YXJlYT4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLXRpdGxlIj7ikaIgWW91ciBQYWdlIEhUTUwgPHNwYW4gY2xhc3M9InBhbmVsLWJhZGdlIj5HQU1FIENIQU5HRVI8L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImluZm8iPgogICAgICAgIDxzdHJvbmc+Q2hyb21lOjwvc3Ryb25nPiBPcGVuIHBhZ2Ug4oaSIFJpZ2h0LWNsaWNrIOKGkiBWaWV3IFBhZ2UgU291cmNlIOKGkiBDdHJsK0Eg4oaSIEN0cmwrQyDihpIgcGFzdGUgYmVsb3cuPGJyPgogICAgICAgIFRoZSBlbmdpbmUgcmVhZHMgeW91ciBBQ1RVQUwgSDEsIEgycywgc2NoZW1hLCB3b3JkIGNvdW50IOKAlCBub3QgZ3Vlc3Nlcy4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj4KICAgICAgICA8bGFiZWw+UmF3IEhUTUwgKGZ1bGwgcGFnZSBzb3VyY2UpPC9sYWJlbD4KICAgICAgICA8dGV4dGFyZWEgaWQ9ImRIdG1sIiBzdHlsZT0ibWluLWhlaWdodDoxMzBweDtmb250LXNpemU6MTFweDsiIHBsYWNlaG9sZGVyPSI8IURPQ1RZUEUgaHRtbD4mIzEwOzxodG1sPi4uLnBhc3RlIGZ1bGwgcGFnZSBzb3VyY2UuLi48L2h0bWw+IiBvbmlucHV0PSJ1cGRhdGVIdG1sU3RhdHMoJ2RIdG1sJywnZEh0bWxTdGF0cycpIj48L3RleHRhcmVhPgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBpZD0iZEh0bWxTdGF0cyIgc3R5bGU9Im1hcmdpbi10b3A6NnB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpOyI+PC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8IS0tIE1FVEEgQ09OU0lTVEVOQ1kgQ0hFQ0tFUiDigJQgU3RhcCDikaJiIC0tPgogICAgPGRpdiBjbGFzcz0icGFuZWwiIGlkPSJtZXRhQ2hlY2tlclBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtdGl0bGUiPuKRomIgTWV0YSBDb25zaXN0ZW5jeSBDaGVjayA8c3BhbiBjbGFzcz0icGFuZWwtYmFkZ2UiPkRJUkVDVCBGRUVEQkFDSzwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iaW5mbyIgaWQ9Im1ldGFDaGVja2VySW5mbyIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPjwvZGl2PgogICAgICA8ZGl2IHN0eWxlPSJmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLWJvdHRvbToxNHB4O2xpbmUtaGVpZ2h0OjEuNzsiPgogICAgICAgIFBsYWsgamUgSFRNTCBoaWVyYm92ZW4gKOKRoikgZW4ga2xpayBDaGVjayDigJQgaGV0IHN5c3RlZW0gdmVyZ2VsaWprdCB0aXRsZSwgb2c6dGl0bGUsIHR3aXR0ZXI6dGl0bGUsIHNjaGVtYSBoZWFkbGluZSwgZGF0ZU1vZGlmaWVkLCBhdXRob3IgZW4gbWVlci4gSW5jb25zaXN0ZW50aWVzIHdvcmRlbiBkaXJlY3QgZ2VtYXJrZWVyZC4KICAgICAgPC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1nb2xkIiBzdHlsZT0iZm9udC1zaXplOjE2cHg7cGFkZGluZzoxMnB4IDI4cHg7d2lkdGg6YXV0bzsiIG9uY2xpY2s9InJ1bk1ldGFDaGVjaygpIj7wn5SNIENoZWNrIE1ldGEgQ29uc2lzdGVuY3k8L2J1dHRvbj4KICAgICAgPGRpdiBpZD0ibWV0YUNoZWNrUmVzdWx0cyIgc3R5bGU9Im1hcmdpbi10b3A6MTZweDsiPjwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC10aXRsZSI+4pGjIENvbXBldGl0b3IgSFRNTCA8c3BhbiBjbGFzcz0icGFuZWwtYmFkZ2UiPkdBTUUgQ0hBTkdFUjwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iaW5mbyI+CiAgICAgICAgPHN0cm9uZz5MZWF2ZSBlbXB0eTwvc3Ryb25nPiDihpIgZGVmYXVsdHMgdG8gU3VyZmVyIFNFTyAmYW1wOyBNYXJrZXRNdXNlIGJlbmNobWFyayBjb21wYXJpc29uIGZyb20gdHJhaW5pbmcgZGF0YS48YnI+CiAgICAgICAgPHN0cm9uZz5QYXN0ZSBIVE1MPC9zdHJvbmc+IOKGkiByZWFsIHNpZGUtYnktc2lkZSBkaWZmIG9mIHRoZWlyIGFjdHVhbCBjb250ZW50IHZzIHlvdXJzLgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZzIiIHN0eWxlPSJnYXA6MTZweDsiPgogICAgICAgIDxkaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJmaWVsZCIgc3R5bGU9Im1hcmdpbi1ib3R0b206OHB4OyI+PGxhYmVsPkNvbXBldGl0b3IgMSBVUkw8L2xhYmVsPjxpbnB1dCB0eXBlPSJ1cmwiIGlkPSJkQ29tcDF1cmwiIHBsYWNlaG9sZGVyPSJodHRwczovL3N1cmZlcnNlby5jb20vLi4uIj48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj4KICAgICAgICAgICAgPGxhYmVsPkNvbXBldGl0b3IgMSBIVE1MIChvcHRpb25hbCk8L2xhYmVsPgogICAgICAgICAgICA8dGV4dGFyZWEgaWQ9ImRDb21wMWh0bWwiIHN0eWxlPSJtaW4taGVpZ2h0OjEwMHB4O2ZvbnQtc2l6ZToxMXB4OyIgcGxhY2Vob2xkZXI9IlBhc3RlIEhUTUwgb3IgbGVhdmUgZW1wdHkgZm9yIFN1cmZlciBTRU8gYmVuY2htYXJrIiBvbmlucHV0PSJ1cGRhdGVIdG1sU3RhdHMoJ2RDb21wMWh0bWwnLCdkQ29tcDFzdGF0cycpIj48L3RleHRhcmVhPgogICAgICAgICAgPC9kaXY+CiAgICAgICAgICA8ZGl2IGlkPSJkQ29tcDFzdGF0cyIgc3R5bGU9Im1hcmdpbi10b3A6NXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpOyI+PC9kaXY+CiAgICAgICAgPC9kaXY+CiAgICAgICAgPGRpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo4cHg7Ij48bGFiZWw+Q29tcGV0aXRvciAyIFVSTDwvbGFiZWw+PGlucHV0IHR5cGU9InVybCIgaWQ9ImRDb21wMnVybCIgcGxhY2Vob2xkZXI9Imh0dHBzOi8vbWFya2V0bXVzZS5jb20vLi4uIj48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9ImZpZWxkIj4KICAgICAgICAgICAgPGxhYmVsPkNvbXBldGl0b3IgMiBIVE1MIChvcHRpb25hbCk8L2xhYmVsPgogICAgICAgICAgICA8dGV4dGFyZWEgaWQ9ImRDb21wMmh0bWwiIHN0eWxlPSJtaW4taGVpZ2h0OjEwMHB4O2ZvbnQtc2l6ZToxMXB4OyIgcGxhY2Vob2xkZXI9IlBhc3RlIEhUTUwgb3IgbGVhdmUgZW1wdHkgZm9yIE1hcmtldE11c2UgYmVuY2htYXJrIiBvbmlucHV0PSJ1cGRhdGVIdG1sU3RhdHMoJ2RDb21wMmh0bWwnLCdkQ29tcDJzdGF0cycpIj48L3RleHRhcmVhPgogICAgICAgICAgPC9kaXY+CiAgICAgICAgICA8ZGl2IGlkPSJkQ29tcDJzdGF0cyIgc3R5bGU9Im1hcmdpbi10b3A6NXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpOyI+PC9kaXY+CiAgICAgICAgPC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC10aXRsZSI+4pGkIEludGVybmFsIExpbmsgRmluZGVyIDxzcGFuIGNsYXNzPSJwYW5lbC1iYWRnZSI+R0FNRSBDSEFOR0VSPC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJpbmZvIj4KICAgICAgICA8c3Ryb25nPlBhc3RlIHlvdXIgc2l0ZW1hcCBVUkxzPC9zdHJvbmc+IChvbmUgcGVyIGxpbmUpIOKGkiBlbmdpbmUgZmluZHMgdGhlIDUgYmVzdCBwYWdlcyB0byBsaW5rIEZST00gYW5kIFRPLCB3aXRoIGV4YWN0IGFuY2hvciB0ZXh0LgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZmllbGQiPgogICAgICAgIDxsYWJlbD5Zb3VyIFNpdGUgVVJMcyAob25lIHBlciBsaW5lKTwvbGFiZWw+CiAgICAgICAgPHRleHRhcmVhIGlkPSJkU2l0ZVVybHMiIHN0eWxlPSJtaW4taGVpZ2h0OjkwcHg7Zm9udC1zaXplOjExcHg7IiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly9jb250ZW50c2NhbGUuc2l0ZS8mIzEwO2h0dHBzOi8vY29udGVudHNjYWxlLnNpdGUvZ3JhYWYtZnJhbWV3b3JrJiMxMDtodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlL2NyYWZ0LWZyYW1ld29yayI+PC90ZXh0YXJlYT4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgaWQ9InVybENvdW50IiBzdHlsZT0ibWFyZ2luLXRvcDo1cHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtjb2xvcjp2YXIoLS1tdXRlZCk7Ij48L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtdGl0bGUiPuKRpSBPcHRpb25hbDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmaWVsZCI+PGxhYmVsPktub3duIENvbnN0cmFpbnRzPC9sYWJlbD48aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImRDb25zdHJhaW50cyIgcGxhY2Vob2xkZXI9IldvcmRQcmVzcywgbm8gSlMgaW5qZWN0aW9uLCBHRFBSLXN0cmljdCwgbXVsdGlsaW5ndWFsIE5ML0VOIj48L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxidXR0b24gY2xhc3M9ImJ0bi1nb2xkIiBpZD0iZGVlcFJ1bkJ0biIgb25jbGljaz0icnVuRGVlcEF1ZGl0KCkiPvCflKwgUlVOIEZVTEwgMTAtU1RFUCBBVURJVCDigJQgUFJJT1JJVFkgQUNUSU9OUyBGSVJTVDwvYnV0dG9uPgoKICAgIDxkaXYgY2xhc3M9InByb2dyZXNzIiBpZD0iZGVlcFByb2dyZXNzIj4KICAgICAgPGRpdiBjbGFzcz0icHJvZy1sYWJlbCI+RnVsbCBBdWRpdCBSdW5uaW5nIOKAlCAxMCBTdGVwcyDCtyBEbyBOb3QgQ2xvc2U8L2Rpdj4KICAgICAgPGRpdiBpZD0iZGVlcFN0ZXBzIj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icHJvZy1iYXItd3JhcCI+PGRpdiBjbGFzcz0icHJvZy1iYXIiIGlkPSJkZWVwQmFyIj48L2Rpdj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0ib3V0cHV0IiBpZD0iZGVlcE91dHB1dCI+PC9kaXY+CiAgPC9kaXY+CjwvZGl2Pgo8ZGl2IGNsYXNzPSJ0b2FzdCIgaWQ9InRvYXN0Ij48L2Rpdj4KCjxzY3JpcHQ+CmxldCBnc2NQYWdlcyA9IFtdOwpsZXQgZ3NjUXVlcmllcyA9IFtdOwoKLy8g4pSA4pSAIEF1dG8tbG9hZCBHU0MgZGF0YSBzaGFyZWQgZnJvbSBBdWRpdCBXb3JrZmxvdyBNYW5hZ2VyIOKUgOKUgApmdW5jdGlvbiBsb2FkU2hhcmVkR1NDKCkgewogIHRyeSB7CiAgICBjb25zdCBzaGFyZWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3Nfc2hhcmVkX2dzYycpOwogICAgaWYgKCFzaGFyZWQpIHsgY29uc29sZS5sb2coJ1tQVUxTRStORVhVU10gTm8gc2hhcmVkIEdTQyBkYXRhIGZvdW5kJyk7IHJldHVybiBmYWxzZTsgfQogICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2Uoc2hhcmVkKTsKICAgIGlmIChkYXRhLnBhZ2VzICYmIGRhdGEucGFnZXMubGVuZ3RoKSB7CiAgICAgIC8vIE5vcm1hbGlzZTogc3VwcG9ydCBib3RoIHtwYWdlOnVybH0gYW5kIHt1cmw6dXJsfSBmb3JtYXRzCiAgICAgIGdzY1BhZ2VzID0gZGF0YS5wYWdlcy5tYXAoZnVuY3Rpb24ocCkgewogICAgICAgIHJldHVybiB7IHBhZ2U6IHAucGFnZSB8fCBwLnVybCB8fCAnJywgaW1wcmVzc2lvbnM6IHAuaW1wcmVzc2lvbnMgfHwgMCwgY2xpY2tzOiBwLmNsaWNrcyB8fCAwLCBjdHI6IHAuY3RyIHx8IDAsIHBvc2l0aW9uOiBwLnBvc2l0aW9uIHx8IDAsIHNjb3JlOiBwLnNjb3JlIHx8IDAgfTsKICAgICAgfSkuZmlsdGVyKGZ1bmN0aW9uKHApIHsgcmV0dXJuIHAucGFnZSAmJiBwLnBhZ2UuaW5jbHVkZXMoJy4nKTsgfSk7CiAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BhZ2VzU3RhdHVzJyk7CiAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPuKckyAnICsgZ3NjUGFnZXMubGVuZ3RoICsgJyBwYWdlcyBmcm9tIFdvcmtmbG93IE1hbmFnZXI8L3NwYW4+JzsKICAgICAgY29uc29sZS5sb2coJ1tQVUxTRStORVhVU10gTG9hZGVkJywgZ3NjUGFnZXMubGVuZ3RoLCAncGFnZXMgZnJvbSBzaGFyZWQgR1NDJyk7CiAgICB9CiAgICBpZiAoZGF0YS5xdWVyaWVzICYmIGRhdGEucXVlcmllcy5sZW5ndGgpIHsKICAgICAgZ3NjUXVlcmllcyA9IGRhdGEucXVlcmllczsKICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXVlcmllc1N0YXR1cycpOwogICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7inJMgJyArIGdzY1F1ZXJpZXMubGVuZ3RoICsgJyBxdWVyaWVzIGZyb20gV29ya2Zsb3cgTWFuYWdlcjwvc3Bhbj4nOwogICAgfQogICAgcmV0dXJuIGdzY1BhZ2VzLmxlbmd0aCA+IDA7CiAgfSBjYXRjaChlKSB7IGNvbnNvbGUud2FybignW1BVTFNFK05FWFVTXSBDb3VsZCBub3QgbG9hZCBzaGFyZWQgR1NDOicsIGUubWVzc2FnZSk7IHJldHVybiBmYWxzZTsgfQp9CnNldFRpbWVvdXQobG9hZFNoYXJlZEdTQywgMzAwKTsKCmNvbnN0IFJBSUxXQVkgPSAnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUnOwoKCi8vIOKUgOKUgCBNRVRBIENPTlNJU1RFTkNZIENIRUNLRVIg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACmZ1bmN0aW9uIHJ1bk1ldGFDaGVjaygpIHsKICB2YXIgaHRtbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkSHRtbCcpLnZhbHVlLnRyaW0oKTsKICBpZiAoIWh0bWwpIHsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtZXRhQ2hlY2tlckluZm8nKS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJzsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtZXRhQ2hlY2tlckluZm8nKS5pbm5lckhUTUwgPSAnPHN0cm9uZyBzdHlsZT0iY29sb3I6dmFyKC0tcmVkKSI+4pqgIEZpcnN0IHBhc3RlIHlvdXIgcGFnZSBIVE1MIGluIGZpZWxkIOKRoiBhYm92ZS48L3N0cm9uZz4nOwogICAgcmV0dXJuOwogIH0KICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWV0YUNoZWNrZXJJbmZvJykuc3R5bGUuZGlzcGxheSA9ICdub25lJzsKCiAgdmFyIGRvYyA9IG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoaHRtbCwgJ3RleHQvaHRtbCcpOwogIHZhciByZXN1bHRzID0gW107CgogIC8vIOKUgOKUgCBFeHRyYWN0IGFsbCBmaWVsZHMg4pSA4pSACiAgdmFyIHRpdGxlICAgICAgID0gKGRvYy5xdWVyeVNlbGVjdG9yKCd0aXRsZScpPy50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpOwogIHZhciBoMSAgICAgICAgICA9IEFycmF5LmZyb20oZG9jLnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxJykpLm1hcChlID0+IGUudGV4dENvbnRlbnQudHJpbSgpKS5maWx0ZXIoQm9vbGVhbilbMF0gfHwgJyc7CiAgdmFyIG1ldGFEZXNjICAgID0gZG9jLnF1ZXJ5U2VsZWN0b3IoJ21ldGFbbmFtZT0iZGVzY3JpcHRpb24iXScpPy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKT8udHJpbSgpIHx8ICcnOwogIHZhciBvZ1RpdGxlICAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW3Byb3BlcnR5PSJvZzp0aXRsZSJdJyk/LmdldEF0dHJpYnV0ZSgnY29udGVudCcpPy50cmltKCkgfHwgJyc7CiAgdmFyIG9nRGVzYyAgICAgID0gZG9jLnF1ZXJ5U2VsZWN0b3IoJ21ldGFbcHJvcGVydHk9Im9nOmRlc2NyaXB0aW9uIl0nKT8uZ2V0QXR0cmlidXRlKCdjb250ZW50Jyk/LnRyaW0oKSB8fCAnJzsKICB2YXIgb2dJbWFnZSAgICAgPSBkb2MucXVlcnlTZWxlY3RvcignbWV0YVtwcm9wZXJ0eT0ib2c6aW1hZ2UiXScpPy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKT8udHJpbSgpIHx8ICcnOwogIHZhciBvZ1VybCAgICAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW3Byb3BlcnR5PSJvZzp1cmwiXScpPy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKT8udHJpbSgpIHx8ICcnOwogIHZhciB0d1RpdGxlICAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9InR3aXR0ZXI6dGl0bGUiXScpPy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKT8udHJpbSgpIHx8ICcnOwogIHZhciB0d0Rlc2MgICAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9InR3aXR0ZXI6ZGVzY3JpcHRpb24iXScpPy5nZXRBdHRyaWJ1dGUoJ2NvbnRlbnQnKT8udHJpbSgpIHx8ICcnOwogIHZhciB0d0NhcmQgICAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9InR3aXR0ZXI6Y2FyZCJdJyk/LmdldEF0dHJpYnV0ZSgnY29udGVudCcpPy50cmltKCkgfHwgJyc7CiAgdmFyIHR3SW1hZ2UgICAgID0gZG9jLnF1ZXJ5U2VsZWN0b3IoJ21ldGFbbmFtZT0idHdpdHRlcjppbWFnZSJdJyk/LmdldEF0dHJpYnV0ZSgnY29udGVudCcpPy50cmltKCkgfHwgJyc7CiAgdmFyIGNhbm9uaWNhbCAgID0gZG9jLnF1ZXJ5U2VsZWN0b3IoJ2xpbmtbcmVsPSJjYW5vbmljYWwiXScpPy5nZXRBdHRyaWJ1dGUoJ2hyZWYnKT8udHJpbSgpIHx8ICcnOwogIHZhciB2aWV3cG9ydCAgICA9IGRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9InZpZXdwb3J0Il0nKT8uZ2V0QXR0cmlidXRlKCdjb250ZW50Jyk/LnRyaW0oKSB8fCAnJzsKCiAgLy8gU2NoZW1hIGV4dHJhY3Rpb24KICB2YXIgc2NoZW1hcyA9IEFycmF5LmZyb20oZG9jLnF1ZXJ5U2VsZWN0b3JBbGwoJ3NjcmlwdFt0eXBlPSJhcHBsaWNhdGlvbi9sZCtqc29uIl0nKSkubWFwKHMgPT4gewogICAgdHJ5IHsgcmV0dXJuIEpTT04ucGFyc2Uocy50ZXh0Q29udGVudCk7IH0gY2F0Y2goZSkgeyByZXR1cm4gbnVsbDsgfQogIH0pLmZpbHRlcihCb29sZWFuKTsKICB2YXIgZmxhdFNjaGVtYXMgPSBzY2hlbWFzLmZsYXRNYXAocyA9PiBBcnJheS5pc0FycmF5KHMpID8gcyA6IChzWydAZ3JhcGgnXSA/IHNbJ0BncmFwaCddIDogW3NdKSk7CgogIHZhciBhcnRpY2xlU2NoZW1hID0gZmxhdFNjaGVtYXMuZmluZChzID0+IFsnQXJ0aWNsZScsJ0Jsb2dQb3N0aW5nJywnTmV3c0FydGljbGUnLCdXZWJQYWdlJywnVGVjaEFydGljbGUnXS5pbmNsdWRlcyhzWydAdHlwZSddKSk7CiAgdmFyIG9yZ1NjaGVtYSAgICAgPSBmbGF0U2NoZW1hcy5maW5kKHMgPT4gWydPcmdhbml6YXRpb24nLCdMb2NhbEJ1c2luZXNzJywnUGVyc29uJ10uaW5jbHVkZXMoc1snQHR5cGUnXSkpOwogIHZhciBmYXFTY2hlbWEgICAgID0gZmxhdFNjaGVtYXMuZmluZChzID0+IHNbJ0B0eXBlJ10gPT09ICdGQVFQYWdlJyk7CgogIHZhciBzY2hlbWFIZWFkbGluZSAgICA9IGFydGljbGVTY2hlbWE/LmhlYWRsaW5lPy50cmltKCkgfHwgJyc7CiAgdmFyIHNjaGVtYURlc2MgICAgICAgID0gYXJ0aWNsZVNjaGVtYT8uZGVzY3JpcHRpb24/LnRyaW0oKSB8fCAnJzsKICB2YXIgc2NoZW1hRGF0ZVB1YiAgICAgPSBhcnRpY2xlU2NoZW1hPy5kYXRlUHVibGlzaGVkIHx8ICcnOwogIHZhciBzY2hlbWFEYXRlTW9kICAgICA9IGFydGljbGVTY2hlbWE/LmRhdGVNb2RpZmllZCB8fCAnJzsKICB2YXIgc2NoZW1hQXV0aG9yTmFtZSAgPSAoYXJ0aWNsZVNjaGVtYT8uYXV0aG9yPy5uYW1lIHx8IGFydGljbGVTY2hlbWE/LmF1dGhvcj8uWzBdPy5uYW1lIHx8ICcnKS50cmltKCk7CiAgdmFyIHNjaGVtYUltYWdlICAgICAgID0gYXJ0aWNsZVNjaGVtYT8uaW1hZ2U/LnVybCB8fCBhcnRpY2xlU2NoZW1hPy5pbWFnZSB8fCAnJzsKICB2YXIgc2NoZW1hVXJsICAgICAgICAgPSBhcnRpY2xlU2NoZW1hPy51cmwgfHwgJyc7CgogIHZhciBub3cgPSBuZXcgRGF0ZSgpOwogIHZhciB0aGlzWWVhciA9IG5vdy5nZXRGdWxsWWVhcigpLnRvU3RyaW5nKCk7CiAgdmFyIHRoaXNNb250aCA9IChub3cuZ2V0TW9udGgoKSsxKS50b1N0cmluZygpLnBhZFN0YXJ0KDIsJzAnKTsKICB2YXIgdG9kYXkgPSB0aGlzWWVhciArICctJyArIHRoaXNNb250aDsKCiAgLy8g4pSA4pSAIENoZWNrIGZ1bmN0aW9ucyDilIDilIAKICBmdW5jdGlvbiBvayhsYWJlbCwgdmFsdWUsIG5vdGUpIHsKICAgIHJlc3VsdHMucHVzaCh7IHN0YXR1czonb2snLCBsYWJlbCwgdmFsdWUsIG5vdGUgfSk7CiAgfQogIGZ1bmN0aW9uIHdhcm4obGFiZWwsIHZhbHVlLCBmaXgsIHNldmVyaXR5KSB7CiAgICByZXN1bHRzLnB1c2goeyBzdGF0dXM6J3dhcm4nLCBsYWJlbCwgdmFsdWUsIGZpeCwgc2V2ZXJpdHk6IHNldmVyaXR5fHwnbWVkaXVtJyB9KTsKICB9CiAgZnVuY3Rpb24gZXJyKGxhYmVsLCB2YWx1ZSwgZml4KSB7CiAgICByZXN1bHRzLnB1c2goeyBzdGF0dXM6J2VycicsIGxhYmVsLCB2YWx1ZSwgZml4LCBzZXZlcml0eTonaGlnaCcgfSk7CiAgfQoKICAvLyDilIDilIAgMS4gVGl0bGUgdGFnIOKUgOKUgAogIGlmICghdGl0bGUpIGVycignVGl0bGUgdGFnJywgJ01JU1NJTkcnLCAnVm9lZyA8dGl0bGU+IHRvZSBtZXQgcHJpbWFpciBrZXl3b3JkICg1MC02MCBjaGFycyknKTsKICBlbHNlIGlmICh0aXRsZS5sZW5ndGggPCA0MCkgd2FybignVGl0bGUgdGFnIHRlIGtvcnQnLCB0aXRsZSArICcgKCcgKyB0aXRsZS5sZW5ndGggKyAnIGNoYXJzKScsICdCcmVpZCB1aXQgbmFhciA1MC02MCBjaGFycycsICdsb3cnKTsKICBlbHNlIGlmICh0aXRsZS5sZW5ndGggPiA2NSkgd2FybignVGl0bGUgdGFnIHRlIGxhbmcnLCB0aXRsZSArICcgKCcgKyB0aXRsZS5sZW5ndGggKyAnIGNoYXJzKScsICdUcmltIG5hYXIgNTAtNjAgY2hhcnMg4oCUIHdvcmR0IGFmZ2VrYXB0IGluIEdvb2dsZScsICdtZWRpdW0nKTsKICBlbHNlIG9rKCdUaXRsZSB0YWcnLCB0aXRsZSArICcgKCcgKyB0aXRsZS5sZW5ndGggKyAnIGNoYXJzKScsICfinJMgR29lZGUgbGVuZ3RlJyk7CgogIC8vIOKUgOKUgCAyLiBIMSB2cyBUaXRsZSBjb25zaXN0ZW5jeSDilIDilIAKICBpZiAoIWgxKSBlcnIoJ0gxJywgJ01JU1NJTkcnLCAnVm9lZyBleGFjdCAxIEgxIHRvZSBtZXQgcHJpbWFpciBrZXl3b3JkJyk7CiAgZWxzZSB7CiAgICB2YXIgdGl0bGVDb3JlID0gdGl0bGUuc3BsaXQoL1t8XC3igJM6XS8pWzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpOwogICAgdmFyIGgxQ29yZSA9IGgxLnRvTG93ZXJDYXNlKCkuc3Vic3RyaW5nKDAsNjApOwogICAgdmFyIG92ZXJsYXAgPSB0aXRsZUNvcmUuc3BsaXQoJyAnKS5maWx0ZXIodyA9PiB3Lmxlbmd0aCA+IDMgJiYgaDFDb3JlLmluY2x1ZGVzKHcpKS5sZW5ndGg7CiAgICBpZiAob3ZlcmxhcCA9PT0gMCkgd2FybignSDEg4oaUIFRpdGxlIGluY29uc2lzdGVudGllJywgJ0gxOiAiJytoMS5zdWJzdHJpbmcoMCw2MCkrJyIgLyBUaXRsZTogIicrdGl0bGUuc3Vic3RyaW5nKDAsNjApKyciJywgJ0gxIGVuIFRpdGxlIG1vZXRlbiBoZXR6ZWxmZGUgcHJpbWFpcmUga2V5d29yZCBiZXZhdHRlbicsICdoaWdoJyk7CiAgICBlbHNlIG9rKCdIMSDihpQgVGl0bGUgb3ZlcmxhcCcsICdIMTogIicraDEuc3Vic3RyaW5nKDAsNTApKyciJywgJ+KckyBLZXl3b3JkIG92ZXJsYXAgZ2V2b25kZW4nKTsKICB9CgogIC8vIOKUgOKUgCAzLiBvZzp0aXRsZSDilIDilIAKICBpZiAoIW9nVGl0bGUpIGVycignb2c6dGl0bGUnLCAnTUlTU0lORycsICdWb2VnIDxtZXRhIHByb3BlcnR5PSJvZzp0aXRsZSI+IHRvZSDigJQgaWRlbnRpZWsgYWFuIGplIHRpdGxlIHRhZycpOwogIGVsc2UgewogICAgdmFyIHNpbSA9IG9nVGl0bGUudG9Mb3dlckNhc2UoKS5zcGxpdCgnICcpLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMyAmJiB0aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHcpKS5sZW5ndGg7CiAgICBpZiAoc2ltID09PSAwKSB3YXJuKCdvZzp0aXRsZSDihpQgVGl0bGUgbWlzbWF0Y2gnLCAnb2c6dGl0bGU6ICInK29nVGl0bGUrJyIgLyB0aXRsZTogIicrdGl0bGUrJyInLCAnb2c6dGl0bGUgbW9ldCBvdmVyZWVua29tZW4gbWV0IGplIDx0aXRsZT4gdGFnJywgJ2hpZ2gnKTsKICAgIGVsc2Ugb2soJ29nOnRpdGxlJywgb2dUaXRsZS5zdWJzdHJpbmcoMCw2MCksICfinJMgQ29uc2lzdGVudCBtZXQgdGl0bGUnKTsKICB9CgogIC8vIOKUgOKUgCA0LiB0d2l0dGVyOnRpdGxlIOKUgOKUgAogIGlmICghdHdUaXRsZSkgd2FybigndHdpdHRlcjp0aXRsZScsICdNSVNTSU5HJywgJ1ZvZWcgPG1ldGEgbmFtZT0idHdpdHRlcjp0aXRsZSI+IHRvZScsICdtZWRpdW0nKTsKICBlbHNlIHsKICAgIHZhciBzaW1UdyA9IHR3VGl0bGUudG9Mb3dlckNhc2UoKS5zcGxpdCgnICcpLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMyAmJiB0aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHcpKS5sZW5ndGg7CiAgICBpZiAoc2ltVHcgPT09IDApIHdhcm4oJ3R3aXR0ZXI6dGl0bGUg4oaUIFRpdGxlIG1pc21hdGNoJywgJyInK3R3VGl0bGUrJyInLCAnWmV0IGdlbGlqayBhYW4gdGl0bGUgdGFnJywgJ21lZGl1bScpOwogICAgZWxzZSBvaygndHdpdHRlcjp0aXRsZScsIHR3VGl0bGUuc3Vic3RyaW5nKDAsNjApLCAn4pyTIENvbnNpc3RlbnQnKTsKICB9CgogIC8vIOKUgOKUgCA1LiBTY2hlbWEgaGVhZGxpbmUg4pSA4pSACiAgaWYgKCFzY2hlbWFIZWFkbGluZSAmJiBhcnRpY2xlU2NoZW1hKSB3YXJuKCdTY2hlbWEgaGVhZGxpbmUnLCAnTUlTU0lORyBpbiBBcnRpY2xlIHNjaGVtYScsICdWb2VnICJoZWFkbGluZSI6ICInK3RpdGxlKyciIHRvZSBhYW4gamUgQXJ0aWNsZSBzY2hlbWEnLCAnaGlnaCcpOwogIGVsc2UgaWYgKHNjaGVtYUhlYWRsaW5lKSB7CiAgICB2YXIgc2NoU2ltID0gc2NoZW1hSGVhZGxpbmUudG9Mb3dlckNhc2UoKS5zcGxpdCgnICcpLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMyAmJiB0aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHcpKS5sZW5ndGg7CiAgICBpZiAoc2NoU2ltID09PSAwKSB3YXJuKCdTY2hlbWEgaGVhZGxpbmUg4oaUIFRpdGxlIG1pc21hdGNoJywgJyInK3NjaGVtYUhlYWRsaW5lKyciJywgJ1NjaGVtYSBoZWFkbGluZSBtb2V0IG92ZXJlZW5rb21lbiBtZXQgamUgPHRpdGxlPiB0YWcnLCAnaGlnaCcpOwogICAgZWxzZSBvaygnU2NoZW1hIGhlYWRsaW5lJywgJyInK3NjaGVtYUhlYWRsaW5lLnN1YnN0cmluZygwLDYwKSsnIicsICfinJMgQ29uc2lzdGVudCBtZXQgdGl0bGUnKTsKICB9CiAgaWYgKCFhcnRpY2xlU2NoZW1hKSB3YXJuKCdBcnRpY2xlIHNjaGVtYScsICdNSVNTSU5HJywgJ1ZvZWcgQXJ0aWNsZS9CbG9nUG9zdGluZyBKU09OLUxEIHRvZSBhYW4gPGhlYWQ+JywgJ2hpZ2gnKTsKCiAgLy8g4pSA4pSAIDYuIGRhdGVNb2RpZmllZCDilIDilIAKICBpZiAoIXNjaGVtYURhdGVNb2QgJiYgYXJ0aWNsZVNjaGVtYSkgZXJyKCdTY2hlbWEgZGF0ZU1vZGlmaWVkJywgJ01JU1NJTkcnLCAnVm9lZyAiZGF0ZU1vZGlmaWVkIjogIicrbm93LnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXSsnIiB0b2UgYWFuIGplIEFydGljbGUgc2NoZW1hJyk7CiAgZWxzZSBpZiAoc2NoZW1hRGF0ZU1vZCkgewogICAgdmFyIG1vZFllYXIgPSBzY2hlbWFEYXRlTW9kLnN1YnN0cmluZygwLDQpOwogICAgdmFyIG1vZE1vbnRoID0gc2NoZW1hRGF0ZU1vZC5zdWJzdHJpbmcoMCw3KTsKICAgIGlmIChtb2RZZWFyICE9PSB0aGlzWWVhcikgd2FybignU2NoZW1hIGRhdGVNb2RpZmllZCDigJQgamFhciB2ZXJvdWRlcmQnLCAnIicrc2NoZW1hRGF0ZU1vZCsnIicsICdVcGRhdGUgbmFhciAnK25vdy50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF0rJyDigJQgR29vZ2xlIHppZXQgZGl0IGFscyB2ZXJvdWRlcmQnLCAnaGlnaCcpOwogICAgZWxzZSBpZiAobW9kTW9udGggIT09IHRvZGF5KSB3YXJuKCdTY2hlbWEgZGF0ZU1vZGlmaWVkIOKAlCBtYWFuZCBuaWV0IGFjdHVlZWwnLCAnIicrc2NoZW1hRGF0ZU1vZCsnIicsICdVcGRhdGUgbmFhciAnK25vdy50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF0rJyBuYSBlbGtlIGNvbnRlbnQgdXBkYXRlJywgJ21lZGl1bScpOwogICAgZWxzZSBvaygnU2NoZW1hIGRhdGVNb2RpZmllZCcsICciJytzY2hlbWFEYXRlTW9kKyciJywgJ+KckyBBY3R1ZWVsJyk7CiAgfQoKICAvLyDilIDilIAgNy4gZGF0ZVB1Ymxpc2hlZCDilIDilIAKICBpZiAoIXNjaGVtYURhdGVQdWIgJiYgYXJ0aWNsZVNjaGVtYSkgd2FybignU2NoZW1hIGRhdGVQdWJsaXNoZWQnLCAnTUlTU0lORycsICdWb2VnICJkYXRlUHVibGlzaGVkIiB0b2UgYWFuIEFydGljbGUgc2NoZW1hJywgJ21lZGl1bScpOwogIGVsc2UgaWYgKHNjaGVtYURhdGVQdWIpIHsKICAgIG9rKCdTY2hlbWEgZGF0ZVB1Ymxpc2hlZCcsICciJytzY2hlbWFEYXRlUHViKyciJywgJycpOwogIH0KCiAgLy8g4pSA4pSAIDguIE1ldGEgZGVzY3JpcHRpb24g4pSA4pSACiAgaWYgKCFtZXRhRGVzYykgZXJyKCdNZXRhIGRlc2NyaXB0aW9uJywgJ01JU1NJTkcnLCAnVm9lZyA8bWV0YSBuYW1lPSJkZXNjcmlwdGlvbiI+IHRvZSAoMTUwLTE2MCBjaGFycyknKTsKICBlbHNlIGlmIChtZXRhRGVzYy5sZW5ndGggPCAxMDApIHdhcm4oJ01ldGEgZGVzY3JpcHRpb24gdGUga29ydCcsIG1ldGFEZXNjLmxlbmd0aCsnIGNoYXJzJywgJ0JyZWlkIHVpdCBuYWFyIDE1MC0xNjAgY2hhcnMnLCAnbWVkaXVtJyk7CiAgZWxzZSBpZiAobWV0YURlc2MubGVuZ3RoID4gMTY1KSB3YXJuKCdNZXRhIGRlc2NyaXB0aW9uIHRlIGxhbmcnLCBtZXRhRGVzYy5sZW5ndGgrJyBjaGFycyDigJQgd29yZHQgYWZnZWthcHQnLCAnVHJpbSBuYWFyIDE1MC0xNjAgY2hhcnMnLCAnbG93Jyk7CiAgZWxzZSBvaygnTWV0YSBkZXNjcmlwdGlvbicsIG1ldGFEZXNjLmxlbmd0aCsnIGNoYXJzJywgJ+KckyBHb2VkZSBsZW5ndGUnKTsKCiAgLy8g4pSA4pSAIDkuIG9nOmRlc2NyaXB0aW9uIOKUgOKUgAogIGlmICghb2dEZXNjKSB3YXJuKCdvZzpkZXNjcmlwdGlvbicsICdNSVNTSU5HJywgJ1ZvZWcgPG1ldGEgcHJvcGVydHk9Im9nOmRlc2NyaXB0aW9uIj4gdG9lJywgJ2xvdycpOwogIGVsc2Ugb2soJ29nOmRlc2NyaXB0aW9uJywgb2dEZXNjLnN1YnN0cmluZygwLDYwKSsn4oCmJywgJ+KckyBBYW53ZXppZycpOwoKICAvLyDilIDilIAgMTAuIG9nOmltYWdlIOKUgOKUgAogIGlmICghb2dJbWFnZSkgd2Fybignb2c6aW1hZ2UnLCAnTUlTU0lORycsICdWb2VnIG9nOmltYWdlIHRvZSAoYWFuYmV2b2xlbjogMTIwMMOXNjMwcHgpJywgJ21lZGl1bScpOwogIGVsc2UgewogICAgaWYgKCFvZ0ltYWdlLnN0YXJ0c1dpdGgoJ2h0dHAnKSkgd2Fybignb2c6aW1hZ2Ug4oCUIHJlbGF0aWV2ZSBVUkwnLCBvZ0ltYWdlLCAnR2VicnVpayBhYnNvbHV0ZSBVUkwgKGh0dHBzOi8vLi4uKScsICdoaWdoJyk7CiAgICBlbHNlIG9rKCdvZzppbWFnZScsIG9nSW1hZ2Uuc3Vic3RyaW5nKDAsNjApKyfigKYnLCAnJyk7CiAgICBpZiAob2dJbWFnZSA9PT0gdHdJbWFnZSB8fCAhdHdJbWFnZSkgewogICAgICBpZiAoIXR3SW1hZ2UpIHdhcm4oJ3R3aXR0ZXI6aW1hZ2UnLCAnTUlTU0lORycsICdWb2VnIHR3aXR0ZXI6aW1hZ2UgdG9lIChrYW4gemVsZmRlIHppam4gYWxzIG9nOmltYWdlKScsICdsb3cnKTsKICAgIH0gZWxzZSB7CiAgICAgIG9rKCd0d2l0dGVyOmltYWdlJywgdHdJbWFnZS5zdWJzdHJpbmcoMCw2MCkrJ+KApicsICcnKTsKICAgIH0KICB9CgogIC8vIOKUgOKUgCAxMS4gdHdpdHRlcjpjYXJkIOKUgOKUgAogIGlmICghdHdDYXJkKSB3YXJuKCd0d2l0dGVyOmNhcmQnLCAnTUlTU0lORycsICdWb2VnIDxtZXRhIG5hbWU9InR3aXR0ZXI6Y2FyZCIgY29udGVudD0ic3VtbWFyeV9sYXJnZV9pbWFnZSI+IHRvZScsICdtZWRpdW0nKTsKICBlbHNlIG9rKCd0d2l0dGVyOmNhcmQnLCB0d0NhcmQsICcnKTsKCiAgLy8g4pSA4pSAIDEyLiBjYW5vbmljYWwg4pSA4pSACiAgaWYgKCFjYW5vbmljYWwpIHdhcm4oJ0Nhbm9uaWNhbCB0YWcnLCAnTUlTU0lORycsICdWb2VnIDxsaW5rIHJlbD0iY2Fub25pY2FsIiBocmVmPSJodHRwczovLy4uLiI+IHRvZScsICdtZWRpdW0nKTsKICBlbHNlIHsKICAgIGlmICghY2Fub25pY2FsLnN0YXJ0c1dpdGgoJ2h0dHAnKSkgd2FybignQ2Fub25pY2FsIOKAlCByZWxhdGlldmUgVVJMJywgY2Fub25pY2FsLCAnR2VicnVpayBhYnNvbHV0ZSBVUkwnLCAnaGlnaCcpOwogICAgZWxzZSBvaygnQ2Fub25pY2FsJywgY2Fub25pY2FsLCAnJyk7CiAgfQoKICAvLyDilIDilIAgMTMuIG9nOnVybCDilIDilIAKICBpZiAoIW9nVXJsKSB3YXJuKCdvZzp1cmwnLCAnTUlTU0lORycsICdWb2VnIDxtZXRhIHByb3BlcnR5PSJvZzp1cmwiPiB0b2Ug4oCUIHplbGZkZSBhbHMgY2Fub25pY2FsJywgJ2xvdycpOwogIGVsc2UgaWYgKGNhbm9uaWNhbCAmJiBvZ1VybCAhPT0gY2Fub25pY2FsKSB3YXJuKCdvZzp1cmwg4oaUIENhbm9uaWNhbCBtaXNtYXRjaCcsICdvZzp1cmw6ICcrb2dVcmwrJyAvIGNhbm9uaWNhbDogJytjYW5vbmljYWwsICdvZzp1cmwgZW4gY2Fub25pY2FsIG1vZXRlbiBpZGVudGllayB6aWpuJywgJ2hpZ2gnKTsKICBlbHNlIG9rKCdvZzp1cmwnLCBvZ1VybC5zdWJzdHJpbmcoMCw2MCksICfinJMgQ29uc2lzdGVudCBtZXQgY2Fub25pY2FsJyk7CgogIC8vIOKUgOKUgCAxNC4gU2NoZW1hIGF1dGhvciDilIDilIAKICBpZiAoYXJ0aWNsZVNjaGVtYSAmJiAhc2NoZW1hQXV0aG9yTmFtZSkgd2FybignU2NoZW1hIGF1dGhvcicsICdNSVNTSU5HJywgJ1ZvZWcgImF1dGhvciI6IHsiQHR5cGUiOiJQZXJzb24iLCJuYW1lIjoiSm91dyBuYWFtIn0gdG9lIGFhbiBBcnRpY2xlIHNjaGVtYScsICdtZWRpdW0nKTsKICBlbHNlIGlmIChzY2hlbWFBdXRob3JOYW1lKSBvaygnU2NoZW1hIGF1dGhvcicsICciJytzY2hlbWFBdXRob3JOYW1lKyciJywgJycpOwoKICAvLyDilIDilIAgMTUuIHZpZXdwb3J0IOKUgOKUgAogIGlmICghdmlld3BvcnQpIGVycignTWV0YSB2aWV3cG9ydCcsICdNSVNTSU5HJywgJ1ZvZWcgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xIj4gdG9lJyk7CiAgZWxzZSBvaygnTWV0YSB2aWV3cG9ydCcsIHZpZXdwb3J0LCAn4pyTIEFhbndlemlnJyk7CgogIC8vIOKUgOKUgCAxNi4gWWVhciBpbiBjb250ZW50IOKUgOKUgAogIHZhciBib2R5VGV4dCA9IChkb2MuYm9keT8uaW5uZXJUZXh0IHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogIHZhciBsYXN0WWVhciA9ICh0aGlzWWVhciAtIDEpLnRvU3RyaW5nKCk7CiAgdmFyIHllYXJNYXRjaGVzID0gKGh0bWwubWF0Y2goLzIwMlswLTldL2cpIHx8IFtdKTsKICB2YXIgb2xkWWVhcnMgPSB5ZWFyTWF0Y2hlcy5maWx0ZXIoeSA9PiBwYXJzZUludCh5KSA8IHBhcnNlSW50KHRoaXNZZWFyKSAtIDEpOwogIGlmIChvbGRZZWFycy5sZW5ndGggPiAzKSB3YXJuKCdWZXJvdWRlcmRlIGphcmVuIGluIEhUTUwnLCAnR2V2b25kZW46ICcrWy4uLm5ldyBTZXQob2xkWWVhcnMpXS5qb2luKCcsICcpLCAnQ29udHJvbGVlciBvZiAnK1suLi5uZXcgU2V0KG9sZFllYXJzKV0uam9pbignLycpKyAnIG1vZXQgd29yZGVuIGJpamdld2Vya3QgbmFhciAnK3RoaXNZZWFyLCAnbWVkaXVtJyk7CiAgZWxzZSBpZiAob2xkWWVhcnMubGVuZ3RoID4gMCkgb2soJ0phcmVuIGluIEhUTUwnLCAnVmVyb3VkZXJkZSBqYXJlbjogJytbLi4ubmV3IFNldChvbGRZZWFycyldLmpvaW4oJywgJyksICfimqAgQ29udHJvbGVlciBvZiB1cGRhdGVzIG5vZGlnIHppam4nKTsKICBlbHNlIG9rKCdKYXJlbiBpbiBIVE1MJywgJ0FsbGVlbiBhY3R1ZWxlIGphcmVuIGdldm9uZGVuJywgJ+KckycpOwoKICAvLyDilIDilIAgUmVuZGVyIHJlc3VsdHMg4pSA4pSACiAgdmFyIGVycnMgID0gcmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ2VycicpOwogIHZhciB3YXJucyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICd3YXJuJyk7CiAgdmFyIG9rcyAgID0gcmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ29rJyk7CgogIHZhciBzY29yZSA9IE1hdGgucm91bmQoKG9rcy5sZW5ndGggLyByZXN1bHRzLmxlbmd0aCkgKiAxMDApOwogIHZhciBzY29yZUNvbG9yID0gc2NvcmUgPj0gODAgPyAndmFyKC0tZ3JlZW4pJyA6IHNjb3JlID49IDYwID8gJ3ZhcigtLWdvbGQpJyA6ICd2YXIoLS1yZWQpJzsKCiAgdmFyIGh0bWxfb3V0ID0gJzxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjE2cHg7bWFyZ2luLWJvdHRvbToxNnB4O3BhZGRpbmc6MTRweCAxOHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czo4cHg7Ij4nCiAgICArICc8ZGl2PjxzcGFuIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTsiPk1ldGEgQ29uc2lzdGVudGllPC9zcGFuPicKICAgICsgJzxkaXYgc3R5bGU9ImZvbnQtc2l6ZTozMnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjonK3Njb3JlQ29sb3IrJztsaW5lLWhlaWdodDoxOyI+JytzY29yZSsnJTwvZGl2PjwvZGl2PicKICAgICsgJzxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKTsiPicKICAgICsgJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1yZWQpOyI+JytlcnJzLmxlbmd0aCsnIGZvdXRlbjwvc3Bhbj4gwrcgJwogICAgKyAnPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWdvbGQpOyI+Jyt3YXJucy5sZW5ndGgrJyB3YWFyc2NodXdpbmdlbjwvc3Bhbj4gwrcgJwogICAgKyAnPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWdyZWVuKTsiPicrb2tzLmxlbmd0aCsnIG9rPC9zcGFuPicKICAgICsgJzwvZGl2PjwvZGl2Pic7CgogIGZ1bmN0aW9uIHJlbmRlclJvdyhyKSB7CiAgICB2YXIgaWNvbiA9IHIuc3RhdHVzPT09J2VycicgPyAn8J+UtCcgOiByLnN0YXR1cz09PSd3YXJuJyA/ICfwn5+hJyA6ICfinIUnOwogICAgdmFyIGJnID0gci5zdGF0dXM9PT0nZXJyJyA/ICdyZ2JhKDI0NCw2Myw2MywuMDYpJyA6IHIuc3RhdHVzPT09J3dhcm4nID8gJ3JnYmEoMjUxLDE5MSwzNiwuMDQpJyA6ICdyZ2JhKDc0LDIyMiwxMjgsLjA0KSc7CiAgICB2YXIgYm9yZGVyID0gci5zdGF0dXM9PT0nZXJyJyA/ICdyZ2JhKDI0NCw2Myw2MywuMjUpJyA6IHIuc3RhdHVzPT09J3dhcm4nID8gJ3JnYmEoMjUxLDE5MSwzNiwuMiknIDogJ3JnYmEoNzQsMjIyLDEyOCwuMTUpJzsKICAgIHJldHVybiAnPGRpdiBzdHlsZT0icGFkZGluZzoxMHB4IDE0cHg7bWFyZ2luLWJvdHRvbTo2cHg7YmFja2dyb3VuZDonK2JnKyc7Ym9yZGVyOjFweCBzb2xpZCAnK2JvcmRlcisnO2JvcmRlci1yYWRpdXM6NnB4OyI+JwogICAgICArICc8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtnYXA6OHB4OyI+JwogICAgICArICc8c3BhbiBzdHlsZT0iZmxleC1zaHJpbms6MDtmb250LXNpemU6MTNweDsiPicraWNvbisnPC9zcGFuPicKICAgICAgKyAnPGRpdiBzdHlsZT0iZmxleDoxOyI+JwogICAgICArICc8ZGl2IHN0eWxlPSJmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEzcHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tYm90dG9tOjJweDsiPicrci5sYWJlbCsnPC9kaXY+JwogICAgICArICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO3dvcmQtYnJlYWs6YnJlYWstYWxsOyI+JytyLnZhbHVlKyc8L2Rpdj4nCiAgICAgICsgKHIuZml4ID8gJzxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLWdvbGQpO21hcmdpbi10b3A6NHB4OyI+4oaSICcrci5maXgrJzwvZGl2PicgOiAnJykKICAgICAgKyAoci5ub3RlID8gJzxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLWdyZWVuKTttYXJnaW4tdG9wOjJweDsiPicrci5ub3RlKyc8L2Rpdj4nIDogJycpCiAgICAgICsgJzwvZGl2PjwvZGl2PjwvZGl2Pic7CiAgfQoKICBpZiAoZXJycy5sZW5ndGgpIGh0bWxfb3V0ICs9ICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjE1ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXJlZCk7bWFyZ2luOjEycHggMCA2cHg7Ij7wn5S0IEZvdXRlbiDigJQgZGlyZWN0IGZpeGVuPC9kaXY+JyArIGVycnMubWFwKHJlbmRlclJvdykuam9pbignJyk7CiAgaWYgKHdhcm5zLmxlbmd0aCkgaHRtbF9vdXQgKz0gJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMTVlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tZ29sZCk7bWFyZ2luOjEycHggMCA2cHg7Ij7wn5+hIFdhYXJzY2h1d2luZ2VuPC9kaXY+JyArIHdhcm5zLm1hcChyZW5kZXJSb3cpLmpvaW4oJycpOwogIGlmIChva3MubGVuZ3RoKSB7CiAgICBodG1sX291dCArPSAnPGRldGFpbHMgc3R5bGU9Im1hcmdpbi10b3A6MTBweDsiPjxzdW1tYXJ5IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjE1ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLWdyZWVuKTtjdXJzb3I6cG9pbnRlcjtwYWRkaW5nOjRweCAwOyI+4pyFICcrb2tzLmxlbmd0aCsnIGl0ZW1zIGNvcnJlY3QgKGtsaWsgb20gdGUgemllbik8L3N1bW1hcnk+PGRpdiBzdHlsZT0ibWFyZ2luLXRvcDo4cHg7Ij4nICsgb2tzLm1hcChyZW5kZXJSb3cpLmpvaW4oJycpICsgJzwvZGl2PjwvZGV0YWlscz4nOwogIH0KCiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21ldGFDaGVja1Jlc3VsdHMnKS5pbm5lckhUTUwgPSBodG1sX291dDsKfQoKLy8g4pSA4pSAIFByZS1maWxsIGZyb20gV29ya2Zsb3cgTWFuYWdlciBVUkwgcGFyYW1zIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAooZnVuY3Rpb24oKXsKICBjb25zdCBwID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTsKICBpZighcC5nZXQoJ3VybCcpICYmICFwLmdldCgna3cnKSkgcmV0dXJuOwogIGZ1bmN0aW9uIGZpbGwoKXsKICAgIHNldE1vZGUoJ2RlZXAnKTsKICAgIGlmKHAuZ2V0KCd1cmwnKSkgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkVXJsJykudmFsdWUgID0gcC5nZXQoJ3VybCcpOwogICAgaWYocC5nZXQoJ2t3JykpICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RLdycpLnZhbHVlICAgPSBwLmdldCgna3cnKTsKICAgIGlmKHAuZ2V0KCdwb3MnKSkgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkUG9zJykudmFsdWUgID0gcC5nZXQoJ3BvcycpOwogICAgaWYocC5nZXQoJ2ltcHInKSkgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RJbXByJykudmFsdWUgPSBwLmdldCgnaW1wcicpOwogICAgaWYocC5nZXQoJ2N0cicpKSAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RDdHInKS52YWx1ZSAgPSBwLmdldCgnY3RyJyk7CiAgICBpZihwLmdldCgnbW9iJykpICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZE1vYicpLnZhbHVlICA9IHAuZ2V0KCdtb2InKTsKICAgIGlmKHAuZ2V0KCd3ZicpKSAgIHdpbmRvdy5fd2ZJZCA9IHAuZ2V0KCd3ZicpOwogICAgaWYocC5nZXQoJ2N0cicpKSAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RDdHInKS52YWx1ZSAgPSBwLmdldCgnY3RyJyk7CiAgICBpZihwLmdldCgnc2NvcmUnKSkgewogICAgICB2YXIgc2NvcmVFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkU2NvcmUnKTsKICAgICAgaWYoc2NvcmVFbCkgc2NvcmVFbC52YWx1ZSA9IHAuZ2V0KCdzY29yZScpOwogICAgfQogICAgLy8gTG9hZCBHU0Mgc2hhcmVkIGRhdGEgZnJvbSBsb2NhbFN0b3JhZ2UKICAgIHZhciBnc2NMb2FkZWQgPSBsb2FkU2hhcmVkR1NDKCk7CiAgICBjb25zdCBkZWVwVmlldyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwVmlldycpOwogICAgaWYoIWRlZXBWaWV3KSByZXR1cm47CiAgICAvLyBCdWlsZCBjb25uZWN0aW9uIGJhbm5lcgogICAgdmFyIGNoaXBzID0gW107CiAgICBpZihwLmdldCgncG9zJykpICAgY2hpcHMucHVzaCgncG9zICcgKyBwYXJzZUZsb2F0KHAuZ2V0KCdwb3MnKSkudG9GaXhlZCgxKSk7CiAgICBpZihwLmdldCgnaW1wcicpKSAgY2hpcHMucHVzaChwYXJzZUludChwLmdldCgnaW1wcicpKS50b0xvY2FsZVN0cmluZygpICsgJyBpbXByJyk7CiAgICBpZihwLmdldCgnY3RyJykpICAgY2hpcHMucHVzaChwLmdldCgnY3RyJykgKyAnJSBDVFInKTsKICAgIGlmKHAuZ2V0KCdzY29yZScpKSBjaGlwcy5wdXNoKCdDb250ZW50U2NvcmUgJyArIHAuZ2V0KCdzY29yZScpKTsKICAgIHZhciBjaGlwSHRtbCA9IGNoaXBzLm1hcChmdW5jdGlvbihjKXsgcmV0dXJuICc8c3BhbiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMyk7Ym9yZGVyLXJhZGl1czo0cHg7cGFkZGluZzoycHggOHB4OyI+JyArIGMgKyAnPC9zcGFuPic7IH0pLmpvaW4oJycpOwogICAgdmFyIGdzY0JhZGdlID0gZ3NjTG9hZGVkID8gJzxzcGFuIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMTUpO2JvcmRlcjoxcHggc29saWQgcmdiYSg3NCwyMjIsMTI4LC4zKTtib3JkZXItcmFkaXVzOjRweDtwYWRkaW5nOjJweCA4cHg7Y29sb3I6IzRhZGU4MDsiPuKckyAnICsgZ3NjUGFnZXMubGVuZ3RoICsgJyBHU0MgcGFnZXMgbG9hZGVkPC9zcGFuPicgOiAnPHNwYW4gc3R5bGU9ImJhY2tncm91bmQ6cmdiYSgyMzksNjgsNjgsLjEpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyMzksNjgsNjgsLjMpO2JvcmRlci1yYWRpdXM6NHB4O3BhZGRpbmc6MnB4IDhweDtjb2xvcjojZjg3MTcxOyI+4pqgIE5vIEdTQyBkYXRhIOKAlCB1cGxvYWQgQ1NWIGFib3ZlPC9zcGFuPic7CiAgICBjb25zdCBiYW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsKICAgIGJhbm5lci5zdHlsZS5jc3NUZXh0ID0gJ2JhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4wNik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1MSwxOTEsMzYsLjIpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTRweCAxOHB4O21hcmdpbi1ib3R0b206MTZweDtmb250LXNpemU6MTFweDtjb2xvcjojZmJiZjI0Oyc7CiAgICBiYW5uZXIuaW5uZXJIVE1MID0gJzxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo4cHg7Ij48c3Ryb25nIHN0eWxlPSJmb250LXNpemU6MTJweDsiPkNvbm5lY3RlZCBmcm9tIEF1ZGl0IFdvcmtmbG93IE1hbmFnZXI8L3N0cm9uZz4nCiAgICAgICsgKHAuZ2V0KCd3ZicpID8gJzxhIGhyZWY9Ii9hdWRpdC13b3JrZmxvdyIgc3R5bGU9ImNvbG9yOiNhNzhiZmE7dGV4dC1kZWNvcmF0aW9uOm5vbmU7Zm9udC1zaXplOjEwcHg7Ij7ihpAgQmFjayB0byBXb3JrZmxvdzwvYT4nIDogJycpICsgJzwvZGl2PicKICAgICAgKyAnPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDo2cHg7YWxpZ24taXRlbXM6Y2VudGVyOyI+JyArIGNoaXBIdG1sICsgJyAnICsgZ3NjQmFkZ2UgKyAnPC9kaXY+JwogICAgICArICc8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjhweDtmb250LXNpemU6MTBweDtjb2xvcjpyZ2JhKDI1MSwxOTEsMzYsLjYpOyI+UGFzdGUgcGFnZSBIVE1MIGJlbG93IOKGkiBjbGljayBSdW4gRnVsbCBBdWRpdDwvZGl2Pic7CiAgICBkZWVwVmlldy5pbnNlcnRCZWZvcmUoYmFubmVyLCBkZWVwVmlldy5maXJzdENoaWxkKTsKICB9CiAgaWYoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gJ2xvYWRpbmcnKSBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZmlsbCk7CiAgZWxzZSBmaWxsKCk7Cn0pKCk7CgpmdW5jdGlvbiBzZXRNb2RlKG0pIHsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVsa1ZpZXcnKS5jbGFzc05hbWUgPSBtPT09J2J1bGsnPydhY3RpdmUnOicnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwVmlldycpLmNsYXNzTmFtZSA9IG09PT0nZGVlcCc/J2FjdGl2ZSc6Jyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGVCdWxrJykuY2xhc3NOYW1lID0gJ21vZGUtYnRuJysobT09PSdidWxrJz8nIGFjdGl2ZSc6JycpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlRGVlcCcpLmNsYXNzTmFtZSA9ICdtb2RlLWJ0bicrKG09PT0nZGVlcCc/JyBhY3RpdmUnOicnKTsKfQoKZnVuY3Rpb24gdG9hc3QobXNnKSB7CiAgY29uc3QgdD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9hc3QnKTsKICB0LnRleHRDb250ZW50PW1zZzt0LmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTsKICBzZXRUaW1lb3V0KCgpPT50LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKSwyODAwKTsKfQoKZnVuY3Rpb24gdXBkYXRlSHRtbFN0YXRzKGlucHV0SWQsIHN0YXRzSWQpIHsKICBjb25zdCBodG1sID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaW5wdXRJZCkudmFsdWUudHJpbSgpOwogIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3RhdHNJZCk7CiAgaWYgKCFodG1sKSB7IGVsLnRleHRDb250ZW50PScnOyByZXR1cm47IH0KICB0cnkgewogICAgY29uc3QgZG9jID0gbmV3IERPTVBhcnNlcigpLnBhcnNlRnJvbVN0cmluZyhodG1sLCd0ZXh0L2h0bWwnKTsKICAgIGNvbnN0IHdvcmRzID0gKGRvYy5ib2R5Py5pbm5lclRleHR8fCcnKS5zcGxpdCgvXHMrLykuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDsKICAgIGNvbnN0IGgxID0gZG9jLnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxJykubGVuZ3RoOwogICAgY29uc3QgaDIgPSBkb2MucXVlcnlTZWxlY3RvckFsbCgnaDInKS5sZW5ndGg7CiAgICBjb25zdCBzY2hlbWEgPSAoaHRtbC5tYXRjaCgvYXBwbGljYXRpb25cL2xkXCtqc29uL2dpKXx8W10pLmxlbmd0aDsKICAgIGNvbnN0IGltZ3MgPSBkb2MucXVlcnlTZWxlY3RvckFsbCgnaW1nJykubGVuZ3RoOwogICAgY29uc3QgYWx0cyA9IGRvYy5xdWVyeVNlbGVjdG9yQWxsKCdpbWdbYWx0XScpLmxlbmd0aDsKICAgIGVsLnRleHRDb250ZW50ID0gYOKckyB+JHt3b3Jkcy50b0xvY2FsZVN0cmluZygpfSB3b3JkcyDCtyAke2gxfSBIMSDCtyAke2gyfSBIMnMgwrcgJHtzY2hlbWF9IHNjaGVtYSDCtyAke2ltZ3N9IGltZ3MgKCR7YWx0c30gd2l0aCBhbHQpYDsKICB9IGNhdGNoKGUpIHsgZWwudGV4dENvbnRlbnQgPSAnQ291bGQgbm90IHBhcnNlIEhUTUwnOyB9Cn0KCmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RTaXRlVXJscycpPy5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGZ1bmN0aW9uKCkgewogICAgY29uc3QgdXJscyA9IHRoaXMudmFsdWUudHJpbSgpLnNwbGl0KCdcbicpLmZpbHRlcihsPT5sLnRyaW0oKS5zdGFydHNXaXRoKCdodHRwJykpOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3VybENvdW50JykudGV4dENvbnRlbnQgPSB1cmxzLmxlbmd0aCA/IGDinJMgJHt1cmxzLmxlbmd0aH0gVVJMcyBsb2FkZWRgIDogJyc7CiAgfSk7Cn0pOwoKLy8g4pSA4pSAIENTViDilIDilIAKZnVuY3Rpb24gcGFyc2VHU0NDc3YocmF3KSB7CiAgY29uc3QgbGluZXMgPSByYXcudHJpbSgpLnNwbGl0KCdcbicpOwogIGlmIChsaW5lcy5sZW5ndGggPCAyKSByZXR1cm4gW107CiAgY29uc3QgaGVhZGVyID0gbGluZXNbMF0udG9Mb3dlckNhc2UoKS5yZXBsYWNlKC8iL2csJycpLnNwbGl0KCcsJyk7CiAgY29uc3QgaWR4ID0gewogICAgcGFnZTogaGVhZGVyLmZpbmRJbmRleChoPT5oLmluY2x1ZGVzKCdwYWdlJyl8fGguaW5jbHVkZXMoJ3VybCcpfHxoLmluY2x1ZGVzKCd0b3AgcGFnZScpKSwKICAgIGNsaWNrczogaGVhZGVyLmZpbmRJbmRleChoPT5oLmluY2x1ZGVzKCdjbGljaycpKSwKICAgIGltcHJlc3Npb25zOiBoZWFkZXIuZmluZEluZGV4KGg9PmguaW5jbHVkZXMoJ2ltcHJlc3Npb24nKSksCiAgICBjdHI6IGhlYWRlci5maW5kSW5kZXgoaD0+aC5pbmNsdWRlcygnY3RyJykpLAogICAgcG9zaXRpb246IGhlYWRlci5maW5kSW5kZXgoaD0+aC5pbmNsdWRlcygncG9zaXRpb24nKXx8aC5pbmNsdWRlcygncG9zJykpLAogIH07CiAgaWYgKGlkeC5wYWdlPDApIGlkeC5wYWdlPTA7CiAgaWYgKGlkeC5jbGlja3M8MCkgaWR4LmNsaWNrcz0xOwogIGlmIChpZHguaW1wcmVzc2lvbnM8MCkgaWR4LmltcHJlc3Npb25zPTI7CiAgaWYgKGlkeC5jdHI8MCkgaWR4LmN0cj0zOwogIGlmIChpZHgucG9zaXRpb248MCkgaWR4LnBvc2l0aW9uPTQ7CiAgY29uc3Qgcm93cz1bXTsKICBmb3IgKGxldCBpPTE7aTxsaW5lcy5sZW5ndGg7aSsrKSB7CiAgICBjb25zdCBjb2xzPWxpbmVzW2ldLnJlcGxhY2UoLyIvZywnJykuc3BsaXQoJywnKTsKICAgIGlmIChjb2xzLmxlbmd0aDwzKSBjb250aW51ZTsKICAgIGNvbnN0IHBhZ2U9Y29sc1tpZHgucGFnZV0/LnRyaW0oKTsKICAgIGlmICghcGFnZSkgY29udGludWU7CiAgICBjb25zdCBpbXByZXNzaW9ucz1wYXJzZUZsb2F0KGNvbHNbaWR4LmltcHJlc3Npb25zXSl8fDA7CiAgICBpZiAoaW1wcmVzc2lvbnM8MSkgY29udGludWU7CiAgICByb3dzLnB1c2goewogICAgICBwYWdlLAogICAgICBjbGlja3M6cGFyc2VGbG9hdChjb2xzW2lkeC5jbGlja3NdKXx8MCwKICAgICAgaW1wcmVzc2lvbnMsCiAgICAgIGN0cjpwYXJzZUZsb2F0KChjb2xzW2lkeC5jdHJdfHwnMCcpLnJlcGxhY2UoJyUnLCcnKSl8fDAsCiAgICAgIHBvc2l0aW9uOnBhcnNlRmxvYXQoY29sc1tpZHgucG9zaXRpb25dKXx8MCwKICAgIH0pOwogIH0KICByZXR1cm4gcm93czsKfQoKZnVuY3Rpb24gaGFuZGxlUGFnZXNDU1YoaW5wdXQpIHsKICBjb25zdCBmaWxlPWlucHV0LmZpbGVzWzBdOyBpZiAoIWZpbGUpIHJldHVybjsKICBjb25zdCByPW5ldyBGaWxlUmVhZGVyKCk7CiAgci5vbmxvYWQ9ZT0+ewogICAgZ3NjUGFnZXM9cGFyc2VHU0NDc3YoZS50YXJnZXQucmVzdWx0KTsKICAgIGdzY1BhZ2VzLmZvckVhY2gocD0+ewogICAgICBjb25zdCBwb3NTY29yZT1wLnBvc2l0aW9uPjEwP01hdGgubWluKChwLnBvc2l0aW9uLTEwKS80MCwxKTowOwogICAgICBjb25zdCBjdHJHYXA9TWF0aC5tYXgoMCwzLXAuY3RyKS8zOwogICAgICBjb25zdCBpbXByVz1NYXRoLm1pbihNYXRoLmxvZzEwKE1hdGgubWF4KHAuaW1wcmVzc2lvbnMsMTApKS81LDEpOwogICAgICBwLnNjb3JlPU1hdGgucm91bmQoKHBvc1Njb3JlKi40NStjdHJHYXAqLjM1K2ltcHJXKi4yKSoxMDApOwogICAgfSk7CiAgICBnc2NQYWdlcy5zb3J0KChhLGIpPT5iLnNjb3JlLWEuc2NvcmUpOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BhZ2VzU3RhdHVzJykuaW5uZXJIVE1MPWA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7inJMgJHtnc2NQYWdlcy5sZW5ndGh9IHBhZ2VzIGxvYWRlZDwvc3Bhbj5gOwogICAgLy8gU2F2ZSB0byBzaGFyZWQgc3RvcmFnZSBzbyB3b3JrZmxvdyBtYW5hZ2VyIHN0YXlzIGluIHN5bmMKICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjc19zaGFyZWRfZ3NjJywgSlNPTi5zdHJpbmdpZnkoe3BhZ2VzOiBnc2NQYWdlcywgcXVlcmllczogZ3NjUXVlcmllc30pKTsgfSBjYXRjaChlKSB7fQogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlclBhbmVsJykuc3R5bGUuZGlzcGxheT0nYmxvY2snOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29wcG9ydHVuaXR5VGFibGUnKS5zdHlsZS5kaXNwbGF5PSdibG9jayc7CiAgICByZW5kZXJUYWJsZSgpOwogICAgdG9hc3QoYOKchSAke2dzY1BhZ2VzLmxlbmd0aH0gcGFnZXMgbG9hZGVkYCk7CiAgfTsKICByLnJlYWRBc1RleHQoZmlsZSk7Cn0KCmZ1bmN0aW9uIGhhbmRsZVF1ZXJpZXNDU1YoaW5wdXQpIHsKICBjb25zdCBmaWxlPWlucHV0LmZpbGVzWzBdOyBpZiAoIWZpbGUpIHJldHVybjsKICBjb25zdCByPW5ldyBGaWxlUmVhZGVyKCk7CiAgci5vbmxvYWQ9ZT0+ewogICAgZ3NjUXVlcmllcz1wYXJzZUdTQ0NzdihlLnRhcmdldC5yZXN1bHQpOwogICAgZ3NjUXVlcmllcy5mb3JFYWNoKHE9PntxLnF1ZXJ5PXEucGFnZTtkZWxldGUgcS5wYWdlO30pOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3F1ZXJpZXNTdGF0dXMnKS5pbm5lckhUTUw9YDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPuKckyAke2dzY1F1ZXJpZXMubGVuZ3RofSBxdWVyaWVzIGxvYWRlZDwvc3Bhbj5gOwogICAgdG9hc3QoYOKchSAke2dzY1F1ZXJpZXMubGVuZ3RofSBxdWVyaWVzIGxvYWRlZGApOwogIH07CiAgci5yZWFkQXNUZXh0KGZpbGUpOwp9CgpmdW5jdGlvbiBzaG93Q2FubmliYWxpemF0aW9uKCkgewogIGlmICghZ3NjUGFnZXMubGVuZ3RoKSB7IHRvYXN0KCdVcGxvYWQgcGFnZXMgQ1NWIGZpcnN0Jyk7IHJldHVybjsgfQogIGNvbnN0IHJlcG9ydD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2FublJlcG9ydCcpOwogIGNvbnN0IGJvZHk9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Nhbm5Cb2R5Jyk7CiAgcmVwb3J0LnN0eWxlLmRpc3BsYXk9J2Jsb2NrJzsKICBjb25zdCBncm91cHM9e307CiAgZ3NjUGFnZXMuZm9yRWFjaChwPT57CiAgICB0cnkgewogICAgICBjb25zdCB1cmw9bmV3IFVSTChwLnBhZ2UpOwogICAgICBjb25zdCBzZWdzPXVybC5wYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTsKICAgICAgc2Vncy5mb3JFYWNoKHNlZz0+ewogICAgICAgIGlmIChzZWcubGVuZ3RoPDQpIHJldHVybjsKICAgICAgICBpZiAoIWdyb3Vwc1tzZWddKSBncm91cHNbc2VnXT1bXTsKICAgICAgICBncm91cHNbc2VnXS5wdXNoKHApOwogICAgICB9KTsKICAgIH0gY2F0Y2goZSl7fQogIH0pOwogIGNvbnN0IGNhbm5zPU9iamVjdC5lbnRyaWVzKGdyb3VwcykuZmlsdGVyKChbLHBhZ2VzXSk9PnBhZ2VzLmxlbmd0aD49Mikuc29ydCgoYSxiKT0+YlsxXS5sZW5ndGgtYVsxXS5sZW5ndGgpLnNsaWNlKDAsMTUpOwogIGlmICghY2FubnMubGVuZ3RoKSB7CiAgICBib2R5LmlubmVySFRNTD0nPHAgc3R5bGU9ImNvbG9yOnZhcigtLWdyZWVuKTtmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Ij7inJMgTm8gb2J2aW91cyBjYW5uaWJhbGl6YXRpb24gZGV0ZWN0ZWQuPC9wPic7CiAgICByZXR1cm47CiAgfQogIGJvZHkuaW5uZXJIVE1MPWNhbm5zLm1hcCgoW3NlZyxwYWdlc10pPT5gCiAgICA8ZGl2IGNsYXNzPSJjYW5uLWNhcmQiPgogICAgICA8aDQ+4pqgIENvbmZsaWN0OiAiJHtzZWd9IiBhcHBlYXJzIGluICR7cGFnZXMubGVuZ3RofSBwYWdlczwvaDQ+CiAgICAgICR7cGFnZXMubWFwKHA9PmAKICAgICAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMnB4O3BhZGRpbmc6NXB4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwuMDQpO2ZvbnQtc2l6ZToxMXB4O2ZsZXgtd3JhcDp3cmFwOyI+CiAgICAgICAgICA8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtjb2xvcjp2YXIoLS1ibHVlKTtmbGV4OjE7d29yZC1icmVhazpicmVhay1hbGw7Ij4ke3AucGFnZS5yZXBsYWNlKC9eaHR0cHM/OlwvXC8vLCcnKS5zbGljZSgwLDYwKX08L3NwYW4+CiAgICAgICAgICA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbXV0ZWQpOyI+JHtwLmltcHJlc3Npb25zLnRvTG9jYWxlU3RyaW5nKCl9IGltcHI8L3NwYW4+CiAgICAgICAgICA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tYW1iZXIpOyI+JHtwLmN0ci50b0ZpeGVkKDEpfSUgQ1RSPC9zcGFuPgogICAgICAgICAgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW9yYW5nZSk7Ij5wb3MgJHtNYXRoLnJvdW5kKHAucG9zaXRpb24pfTwvc3Bhbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1zbSBidG4tcHVycGxlIiBvbmNsaWNrPSJsb2FkVG9EZWVwKCcke2VuY29kZVVSSUNvbXBvbmVudChwLnBhZ2UpfScsJyR7cC5pbXByZXNzaW9uc30nLCcke3AuY3RyfScsJyR7cC5wb3NpdGlvbn0nKSI+8J+UrCBBdWRpdDwvYnV0dG9uPgogICAgICAgIDwvZGl2PmApLmpvaW4oJycpfQogICAgPC9kaXY+YCkuam9pbignJyk7CiAgcmVwb3J0LnNjcm9sbEludG9WaWV3KHtiZWhhdmlvcjonc21vb3RoJ30pOwp9CgpmdW5jdGlvbiByZW5kZXJUYWJsZSgpIHsKICBjb25zdCBtaW5JPXBhcnNlRmxvYXQoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21pbkltcHInKS52YWx1ZSl8fDA7CiAgY29uc3QgbWluUD1wYXJzZUZsb2F0KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW5Qb3MnKS52YWx1ZSl8fDA7CiAgY29uc3QgbWF4UD1wYXJzZUZsb2F0KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYXhQb3MnKS52YWx1ZSl8fDk5OTsKICBjb25zdCBtYXhDPXBhcnNlRmxvYXQoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21heEN0cicpLnZhbHVlKXx8MTAwOwogIGNvbnN0IGZpbHRlcmVkPWdzY1BhZ2VzLmZpbHRlcihyPT5yLmltcHJlc3Npb25zPj1taW5JJiZyLnBvc2l0aW9uPj1taW5QJiZyLnBvc2l0aW9uPD1tYXhQJiZyLmN0cjw9bWF4Qyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RhYmxlQ291bnQnKS50ZXh0Q29udGVudD1gJHtmaWx0ZXJlZC5sZW5ndGh9IHBhZ2VzYDsKICBjb25zdCBtYXhTY29yZT1maWx0ZXJlZFswXT8uc2NvcmV8fDE7CiAgY29uc3Qgcm93cz1maWx0ZXJlZC5zbGljZSgwLDEwMCkubWFwKChyLGkpPT57CiAgICBjb25zdCBzaG9ydD0oKCk9Pnt0cnl7cmV0dXJuIG5ldyBVUkwoci5wYWdlKS5wYXRobmFtZS5zbGljZSgwLDQ1KXx8Jy8nO31jYXRjaChlKXtyZXR1cm4gci5wYWdlLnNsaWNlKDAsNDUpO319KSgpOwogICAgY29uc3QgcG9zQ29sb3I9ci5wb3NpdGlvbjwyMD8ndmFyKC0tYW1iZXIpJzpyLnBvc2l0aW9uPDM1Pyd2YXIoLS1vcmFuZ2UpJzondmFyKC0tcmVkKSc7CiAgICBjb25zdCBjdHJDb2xvcj1yLmN0cjwxPyd2YXIoLS1yZWQpJzpyLmN0cjwzPyd2YXIoLS1hbWJlciknOid2YXIoLS1ncmVlbiknOwogICAgY29uc3QgYmFyVz1NYXRoLnJvdW5kKChyLnNjb3JlL21heFNjb3JlKSoxMDApOwogICAgY29uc3QgZW5jPWVuY29kZVVSSUNvbXBvbmVudChyLnBhZ2UpOwogICAgcmV0dXJuIGA8dHI+CiAgICAgIDx0ZCBzdHlsZT0iZm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjE2cHg7Y29sb3I6JHtpPDM/J3ZhcigtLWdvbGQpJzondmFyKC0tbXV0ZWQpJ307Ij4jJHtpKzF9PC90ZD4KICAgICAgPHRkPgogICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tYmx1ZSk7bWF4LXdpZHRoOjIwMHB4O292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO3doaXRlLXNwYWNlOm5vd3JhcDsiIHRpdGxlPSIke3IucGFnZX0iPiR7c2hvcnR9PC9kaXY+CiAgICAgICAgPGRpdiBzdHlsZT0iZm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tZGltKTttYXJnaW4tdG9wOjJweDsiPiR7ci5pbXByZXNzaW9ucy50b0xvY2FsZVN0cmluZygpfSBpbXByIMK3ICR7ci5jbGlja3N9IGNsaWNrczwvZGl2PgogICAgICA8L3RkPgogICAgICA8dGQgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Ij4ke3IuaW1wcmVzc2lvbnMudG9Mb2NhbGVTdHJpbmcoKX08L3RkPgogICAgICA8dGQgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Y29sb3I6JHtjdHJDb2xvcn07Ij4ke3IuY3RyLnRvRml4ZWQoMSl9JTwvdGQ+CiAgICAgIDx0ZCBzdHlsZT0iZm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIwcHg7Y29sb3I6JHtwb3NDb2xvcn07Ij4ke01hdGgucm91bmQoci5wb3NpdGlvbil9PC90ZD4KICAgICAgPHRkIHN0eWxlPSJtaW4td2lkdGg6OTBweDsiPgogICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tZ29sZCk7Ij4ke3Iuc2NvcmV9LzEwMDwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9Im9wcC1iYXIiIHN0eWxlPSJ3aWR0aDoke2Jhcld9JTsiPjwvZGl2PgogICAgICA8L3RkPgogICAgICA8dGQ+CiAgICAgICAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDo1cHg7ZmxleC13cmFwOndyYXA7Ij4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1zbSBidG4tYmx1ZSIgb25jbGljaz0icXVpY2tBdWRpdCgnJHtlbmN9JywnJHtyLmltcHJlc3Npb25zfScsJyR7ci5jdHJ9JywnJHtyLnBvc2l0aW9ufScpIj7imqEgUXVpY2s8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1zbSBidG4tcHVycGxlIiBvbmNsaWNrPSJsb2FkVG9EZWVwKCcke2VuY30nLCcke3IuaW1wcmVzc2lvbnN9JywnJHtyLmN0cn0nLCcke3IucG9zaXRpb259JykiPvCflKwgRGVlcDwvYnV0dG9uPgogICAgICAgIDwvZGl2PgogICAgICA8L3RkPgogICAgPC90cj5gOwogIH0pLmpvaW4oJycpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0YWJsZUJvZHknKS5pbm5lckhUTUw9cm93c3x8Jzx0cj48dGQgY29sc3Bhbj0iNyIgc3R5bGU9InRleHQtYWxpZ246Y2VudGVyO2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjIwcHg7Ij5ObyBwYWdlcyBtYXRjaCBmaWx0ZXJzPC90ZD48L3RyPic7Cn0KCmZ1bmN0aW9uIGxvYWRUb0RlZXAoZW5jLGltcHIsY3RyLHBvcykgewogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkVXJsJykudmFsdWU9ZGVjb2RlVVJJQ29tcG9uZW50KGVuYyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RJbXByJykudmFsdWU9aW1wcjsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZEN0cicpLnZhbHVlPWN0cjsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZFBvcycpLnZhbHVlPXBvczsKICBzZXRNb2RlKCdkZWVwJyk7CiAgd2luZG93LnNjcm9sbFRvKHt0b3A6MCxiZWhhdmlvcjonc21vb3RoJ30pOwogIHRvYXN0KCdMb2FkZWQg4oaSIHBhc3RlIHlvdXIgSFRNTCBhbmQgcnVuIERlZXAgRGl2ZSEnKTsKfQoKZnVuY3Rpb24gZXhwb3J0T3BwcygpIHsKICBjb25zdCByb3dzPVsnUGFnZSxJbXByZXNzaW9ucyxDbGlja3MsQ1RSLFBvc2l0aW9uLFNjb3JlJ107CiAgZ3NjUGFnZXMuZm9yRWFjaChyPT5yb3dzLnB1c2goYCIke3IucGFnZX0iLCR7ci5pbXByZXNzaW9uc30sJHtyLmNsaWNrc30sJHtyLmN0cn0sJHtyLnBvc2l0aW9ufSwke3Iuc2NvcmV9YCkpOwogIGNvbnN0IGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOwogIGEuaHJlZj1VUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtyb3dzLmpvaW4oJ1xuJyldLHt0eXBlOid0ZXh0L2Nzdid9KSk7CiAgYS5kb3dubG9hZD0nc2VvLW9wcG9ydHVuaXRpZXMuY3N2JzthLmNsaWNrKCk7Cn0KCi8vIOKUgOKUgCBHRU1JTkkgQVBJIHZpYSBSYWlsd2F5IHByb3h5IOKUgOKUgAphc3luYyBmdW5jdGlvbiBjYWxsR2VtaW5pKHByb21wdCwgbWF4VG9rZW5zPTQwMDApIHsKICBjb25zdCByZXNwID0gYXdhaXQgZmV0Y2goYCR7UkFJTFdBWX0vYXBpL2dlbWluaS1wcm94eWAsIHsKICAgIG1ldGhvZDonUE9TVCcsCiAgICBoZWFkZXJzOnsnQ29udGVudC1UeXBlJzonYXBwbGljYXRpb24vanNvbid9LAogICAgYm9keTpKU09OLnN0cmluZ2lmeSh7CiAgICAgIGNvbnRlbnRzOlt7cGFydHM6W3t0ZXh0OnByb21wdH1dfV0sCiAgICAgIGdlbmVyYXRpb25Db25maWc6e3RlbXBlcmF0dXJlOjAuMjUsbWF4T3V0cHV0VG9rZW5zOm1heFRva2Vuc30KICAgIH0pCiAgfSk7CiAgaWYgKCFyZXNwLm9rKSB7CiAgICBjb25zdCBlcnI9YXdhaXQgcmVzcC5qc29uKCkuY2F0Y2goKCk9Pih7fSkpOwogICAgdGhyb3cgbmV3IEVycm9yKGVyci5lcnJvcj8ubWVzc2FnZXx8ZXJyLmRldGFpbHx8YEhUVFAgJHtyZXNwLnN0YXR1c31gKTsKICB9CiAgY29uc3QgZGF0YT1hd2FpdCByZXNwLmpzb24oKTsKICByZXR1cm4gZGF0YS5jYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzPy5bMF0/LnRleHR8fCcnOwp9CgpmdW5jdGlvbiBleHRyYWN0Q29udGVudChodG1sLCBsYWJlbD0ncGFnZScpIHsKICBpZiAoIWh0bWwpIHJldHVybiBudWxsOwogIHRyeSB7CiAgICBjb25zdCBkb2M9bmV3IERPTVBhcnNlcigpLnBhcnNlRnJvbVN0cmluZyhodG1sLCd0ZXh0L2h0bWwnKTsKICAgIGNvbnN0IHRpdGxlPWRvYy5xdWVyeVNlbGVjdG9yKCd0aXRsZScpPy50ZXh0Q29udGVudHx8Jyc7CiAgICBjb25zdCBkZXNjPWRvYy5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9ImRlc2NyaXB0aW9uIl0nKT8uZ2V0QXR0cmlidXRlKCdjb250ZW50Jyl8fCcnOwogICAgY29uc3QgaDE9QXJyYXkuZnJvbShkb2MucXVlcnlTZWxlY3RvckFsbCgnaDEnKSkubWFwKGU9PmUudGV4dENvbnRlbnQudHJpbSgpKS5qb2luKCcgfCAnKTsKICAgIGNvbnN0IGgycz1BcnJheS5mcm9tKGRvYy5xdWVyeVNlbGVjdG9yQWxsKCdoMicpKS5tYXAoZT0+ZS50ZXh0Q29udGVudC50cmltKCkpLmpvaW4oJyDCtyAnKTsKICAgIGNvbnN0IGgzcz1BcnJheS5mcm9tKGRvYy5xdWVyeVNlbGVjdG9yQWxsKCdoMycpKS5zbGljZSgwLDEwKS5tYXAoZT0+ZS50ZXh0Q29udGVudC50cmltKCkpLmpvaW4oJyDCtyAnKTsKICAgIGNvbnN0IHNjaGVtYXM9QXJyYXkuZnJvbShkb2MucXVlcnlTZWxlY3RvckFsbCgnc2NyaXB0W3R5cGU9ImFwcGxpY2F0aW9uL2xkK2pzb24iXScpKS5tYXAocz0+cy50ZXh0Q29udGVudC5zbGljZSgwLDIwMCkpLmpvaW4oJ1xuJyk7CiAgICBjb25zdCBib2R5PShkb2MuYm9keT8uaW5uZXJUZXh0fHwnJykucmVwbGFjZSgvXHMrL2csJyAnKS5zbGljZSgwLDMwMDApOwogICAgY29uc3QgaW1ncz1kb2MucXVlcnlTZWxlY3RvckFsbCgnaW1nJykubGVuZ3RoOwogICAgY29uc3QgYWx0cz1kb2MucXVlcnlTZWxlY3RvckFsbCgnaW1nW2FsdF0nKS5sZW5ndGg7CiAgICBjb25zdCBpbnRMaW5rcz1kb2MucXVlcnlTZWxlY3RvckFsbCgnYVtocmVmXScpLmxlbmd0aDsKICAgIGNvbnN0IHdvcmRDb3VudD0oZG9jLmJvZHk/LmlubmVyVGV4dHx8JycpLnNwbGl0KC9ccysvKS5maWx0ZXIoQm9vbGVhbikubGVuZ3RoOwogICAgY29uc3QgZmFxcz1kb2MucXVlcnlTZWxlY3RvckFsbCgnW2l0ZW10eXBlKj0iRkFRUGFnZSJdLCAuZmFxLCAjZmFxLCBbY2xhc3MqPSJmYXEiXScpLmxlbmd0aDsKICAgIHJldHVybiBgPT09ICR7bGFiZWwudG9VcHBlckNhc2UoKX0gPT09ClRpdGxlICgke3RpdGxlLmxlbmd0aH0gY2hhcnMpOiAke3RpdGxlfQpNZXRhIGRlc2MgKCR7ZGVzYy5sZW5ndGh9IGNoYXJzKTogJHtkZXNjfQpIMTogJHtoMXx8J01JU1NJTkcnfQpIMnM6ICR7aDJzfHwnbm9uZSd9CkgzcyAoZmlyc3QgMTApOiAke2gzc3x8J25vbmUnfQpXb3JkIGNvdW50OiB+JHt3b3JkQ291bnR9CkltYWdlczogJHtpbWdzfSB0b3RhbCwgJHthbHRzfSB3aXRoIGFsdCAoJHtpbWdzLWFsdHN9IG1pc3NpbmcgYWx0IHRleHQpCkxpbmtzOiAke2ludExpbmtzfSB0b3RhbApTY2hlbWEgYmxvY2tzOiAke3NjaGVtYXN8fCdub25lJ30KRkFRIHNlY3Rpb246ICR7ZmFxcz4wPydZRVMnOidOT1QgREVURUNURUQnfQpCb2R5IGV4dHJhY3Q6ICR7Ym9keX1gOwogIH0gY2F0Y2goZSkgeyByZXR1cm4gYFtFcnJvciBwYXJzaW5nICR7bGFiZWx9IEhUTUw6ICR7ZS5tZXNzYWdlfV1gOyB9Cn0KCmZ1bmN0aW9uIGV4dHJhY3RUaXRsZShodG1sKSB7CiAgaWYgKCFodG1sKSByZXR1cm4gJ25vdCBwcm92aWRlZCc7CiAgY29uc3QgbT1odG1sLm1hdGNoKC88dGl0bGVbXj5dKj4oLio/KTxcL3RpdGxlPi9pKTsKICByZXR1cm4gbT9tWzFdLnRyaW0oKTonbm90IGZvdW5kIGluIEhUTUwnOwp9CmZ1bmN0aW9uIGV4dHJhY3RNZXRhKGh0bWwpIHsKICBpZiAoIWh0bWwpIHJldHVybiAnbm90IHByb3ZpZGVkJzsKICBjb25zdCBtPWh0bWwubWF0Y2goLzxtZXRhW14+XSpuYW1lPVsiJ11kZXNjcmlwdGlvblsiJ11bXj5dKmNvbnRlbnQ9WyInXShbXiInXSspWyInXS9pKQogICAgICAgICAgIHx8aHRtbC5tYXRjaCgvPG1ldGFbXj5dKmNvbnRlbnQ9WyInXShbXiInXSspWyInXVtePl0qbmFtZT1bIiddZGVzY3JpcHRpb25bIiddL2kpOwogIHJldHVybiBtP21bMV0udHJpbSgpOidub3QgZm91bmQgaW4gSFRNTCc7Cn0KZnVuY3Rpb24gc2xlZXAobXMpIHsgcmV0dXJuIG5ldyBQcm9taXNlKHI9PnNldFRpbWVvdXQocixtcykpOyB9CgovLyDilIDilIAgUVVJQ0sgQVVESVQg4pSA4pSACmFzeW5jIGZ1bmN0aW9uIHF1aWNrQXVkaXQoZW5jLGltcHIsY3RyLHBvcykgewogIGNvbnN0IHVybD1kZWNvZGVVUklDb21wb25lbnQoZW5jKTsKICBjb25zdCBwcm9nPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdWlja1Byb2dyZXNzJyk7CiAgY29uc3Qgb3V0PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdWlja091dHB1dCcpOwogIHByb2cuY2xhc3NOYW1lPSdwcm9ncmVzcyBzaG93JztvdXQuaW5uZXJIVE1MPScnO291dC5jbGFzc05hbWU9J291dHB1dCBzaG93JzsKICBjb25zdCBRU1RFUFM9WwogICAge2lkOidxMCcsaWNvbjon8J+UpScsbGFiZWw6J1BSSU9SSVRZIEFDVElPTlMg4oCUIFRvcCA1IHJpZ2h0IG5vdyd9LAogICAge2lkOidxMScsaWNvbjon4pqhJyxsYWJlbDonQ1RSIFN1cmdlcnkg4oCUIG5ldyB0aXRsZSArIG1ldGEnfSwKICAgIHtpZDoncTInLGljb246J/Cfk4gnLGxhYmVsOidQb3NpdGlvbiAxMeKAkzIwIHF1ZXJ5IG9wcG9ydHVuaXRpZXMnfSwKICBdOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdWlja1N0ZXBzJykuaW5uZXJIVE1MPVFTVEVQUy5tYXAocz0+YDxkaXYgY2xhc3M9InByb2ctc3RlcCIgaWQ9InN0ZXAtJHtzLmlkfSI+PHNwYW4gY2xhc3M9InByb2ctaWNvbiI+JHtzLmljb259PC9zcGFuPjxzcGFuPiR7cy5sYWJlbH08L3NwYW4+PC9kaXY+YCkuam9pbignJyk7CiAgY29uc3QgYmFyPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdWlja0JhcicpOwogIGNvbnN0IGN0eD1gVVJMOiAke3VybH1cbkltcHJlc3Npb25zOiAke2ltcHJ9XG5DVFI6ICR7Y3RyfSVcblBvc2l0aW9uOiAke3Bvc31gOwogIGNvbnN0IHBhZ2VRdWVyaWVzPWdzY1F1ZXJpZXMuZmlsdGVyKHE9PnEucXVlcnkpLnNsaWNlKDAsMjApOwogIGNvbnN0IHF1ZXJ5Q3R4PXBhZ2VRdWVyaWVzLmxlbmd0aD9gXG5Ub3AgcXVlcmllczogJHtwYWdlUXVlcmllcy5tYXAocT0+YCIke3EucXVlcnl9IiBwb3M6JHtNYXRoLnJvdW5kKHEucG9zaXRpb24pfSBpbXByOiR7cS5pbXByZXNzaW9uc31gKS5qb2luKCcgfCAnKX1gOicnOwogIGNvbnN0IHByb21wdHM9ewogICAgcTA6YFlvdSBhcmUgYW4gZWxpdGUgU0VPIHN0cmF0ZWdpc3QuXG4ke2N0eH0ke3F1ZXJ5Q3R4fVxuXG5MaXN0IEVYQUNUTFkgNSBwcmlvcml0eSBhY3Rpb25zIGZvciB0aGlzIHBhZ2UuIEVhY2ggbXVzdCBiZTpcbi0gU3BlY2lmaWMgYW5kIGFjdGlvbmFibGUgKG5vdCBnZW5lcmljIGFkdmljZSlcbi0gQWNoaWV2YWJsZSBpbiB1bmRlciAxIGhvdXJcbi0gSW5jbHVkZSBleHBlY3RlZCBtZXRyaWMgY2hhbmdlXG5cbkZvcm1hdCBlYWNoIGFzOlxu8J+UpSAqKltBY3Rpb24gdGl0bGVdKipcbkRvOiBbZXhhY3Qgd2hhdCB0byBkb11cbkV4cGVjdDogW3NwZWNpZmljIG1ldHJpYyBpbXByb3ZlbWVudF1cblxuU3RhcnQgd2l0aCB0aGUgaGlnaGVzdC1pbXBhY3QgYWN0aW9uIGZpcnN0LmAsCiAgICBxMTpgWW91IGFyZSBhbiBlbGl0ZSBTRU8gc3RyYXRlZ2lzdC5cbiR7Y3R4fSR7cXVlcnlDdHh9XG5Xcml0ZSBhIG5ldyB0aXRsZSAo4omkNjAgY2hhcnMpIGFuZCBtZXRhIGRlc2NyaXB0aW9uICjiiaQxNTUgY2hhcnMpIGZvciB0aGlzIHBhZ2UgdG8gbWF4aW1pemUgQ1RSLlxuXG4qKk5ldyBUaXRsZSoqOiBbdGV4dF1cbioqTmV3IE1ldGEgRGVzY3JpcHRpb24qKjogW3RleHRdXG4qKldoeSoqOiBbc3BlY2lmaWMgMjAyNiBTRVJQIHBzeWNob2xvZ3kgcmF0aW9uYWxlXWAsCiAgICBxMjpgWW91IGFyZSBhbiBlbGl0ZSBTRU8gc3RyYXRlZ2lzdC5cbiR7Y3R4fSR7cXVlcnlDdHh9XG5JZGVudGlmeSB0aGUgMyBxdWVyaWVzIHdoZXJlIHRoaXMgcGFnZSByYW5rcyBwb3NpdGlvbiAxMS0yMCDigJQgZmFzdGVzdCB3aW5zIHRvIHBhZ2UgMS5cbkZvciBlYWNoOiAqKlF1ZXJ5KiogfCBDdXJyZW50IHBvcyB8IE9ORSBzcGVjaWZpYyBjaGFuZ2UgbmVlZGVkIHwgRXhwZWN0ZWQgcmVzdWx0LmAsCiAgfTsKICBmb3IgKGxldCBpPTA7aTxRU1RFUFMubGVuZ3RoO2krKykgewogICAgY29uc3Qgcz1RU1RFUFNbaV07c2V0U3RlcChzLmlkLCdhY3RpdmUnKTsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHI9YXdhaXQgY2FsbEdlbWluaShwcm9tcHRzW3MuaWRdLDE1MDApOwogICAgICBhZGRTZWN0aW9uKG91dCxzLmlkLHMuaWNvbixzLmxhYmVsLGk9PT0wPydiLWdvbGQnOmk9PT0xPydiLXdpbic6J2ItcHVsc2UnLHIpOwogICAgICBzZXRTdGVwKHMuaWQsJ2RvbmUnKTsKICAgIH0gY2F0Y2goZSkgewogICAgICBzZXRTdGVwKHMuaWQsJ2Vycm9yJyk7CiAgICAgIGFkZFNlY3Rpb24ob3V0LHMuaWQscy5pY29uLHMubGFiZWwsJ2ItdGVjaCcsYCoqRXJyb3I6KiogJHtlLm1lc3NhZ2V9YCk7CiAgICB9CiAgICBiYXIuc3R5bGUud2lkdGg9KChpKzEpL1FTVEVQUy5sZW5ndGgqMTAwKSsnJSc7CiAgICBpZiAoaTxRU1RFUFMubGVuZ3RoLTEpIGF3YWl0IHNsZWVwKDEyMDApOwogIH0KICBwcm9nLmNsYXNzTmFtZT0ncHJvZ3Jlc3MnOwogIHRvYXN0KCfinIUgUXVpY2sgYXVkaXQgZG9uZScpOwogIG91dC5zY3JvbGxJbnRvVmlldyh7YmVoYXZpb3I6J3Ntb290aCd9KTsKfQoKLy8g4pSA4pSAIERFRVAgQVVESVQg4oCUIDEwIHN0ZXBzLCBQUklPUklUWSBBQ1RJT05TIEZJUlNUIOKUgOKUgApjb25zdCBERUVQX1NURVBTPVsKICB7aWQ6J2QwJyxpY29uOifwn5SlJyxsYWJlbDonUFJJT1JJVFkgQUNUSU9OUyDigJQgRG8gVGhlc2UgRmlyc3QgKHRvcCA3KScsYmFkZ2U6J2ItZ29sZCd9LAogIHtpZDonZDEnLGljb246J/CflI0nLGxhYmVsOidJbnRlbnQgKyBBSSBPdmVydmlldyBFbGlnaWJpbGl0eScsYmFkZ2U6J2ItdGVjaCd9LAogIHtpZDonZDInLGljb246J+KaoScsbGFiZWw6J0NUUiBTdXJnZXJ5IOKAlCByZWFsIHRpdGxlL21ldGEgcmV3cml0ZScsYmFkZ2U6J2Itd2luJ30sCiAge2lkOidkMycsaWNvbjon8J+Vte+4jycsbGFiZWw6J0NvbXBldGl0b3IgRGlmZiDigJQgU3VyZmVyIFNFTyAmIE1hcmtldE11c2UgYmVuY2htYXJrJyxiYWRnZTonYi1wdWxzZSd9LAogIHtpZDonZDQnLGljb246J/CflbPvuI8nLGxhYmVsOidDb250ZW50IEdhcCBNYXRyaXgg4oCUIHdoYXQgeW91IGFyZSBtaXNzaW5nJyxiYWRnZTonYi1wdWxzZSd9LAogIHtpZDonZDUnLGljb246J/Cfq4AnLGxhYmVsOidQVUxTRSBPcHRpbWl6YXRpb24g4oCUIGJlZm9yZS9hZnRlciByZXdyaXRlcycsYmFkZ2U6J2ItcHVsc2UnfSwKICB7aWQ6J2Q2JyxpY29uOifwn5SXJyxsYWJlbDonTkVYVVMgU2lnbmFscyArIEludGVybmFsIExpbmsgRmluZGVyJyxiYWRnZTonYi1uZXh1cyd9LAogIHtpZDonZDcnLGljb246J/Cfj5fvuI8nLGxhYmVsOidBcmNoaXRlY3R1cmUgQmx1ZXByaW50IOKAlCBIMS1IMyByZXN0cnVjdHVyZScsYmFkZ2U6J2ItbmV4dXMnfSwKICB7aWQ6J2Q4JyxpY29uOifwn5ug77iPJyxsYWJlbDonVGVjaG5pY2FsIENoZWNrbGlzdCArIFNjaGVtYSBKU09OLUxEJyxiYWRnZTonYi10ZWNoJ30sCiAge2lkOidkOScsaWNvbjon8J+TiicsbGFiZWw6J0JlZm9yZS9BZnRlciBTY29yZSArIFRyYWZmaWMgUHJvamVjdGlvbicsYmFkZ2U6J2ItZ29sZCd9LAogIHtpZDonZDEwJyxpY29uOifwn5OIJyxsYWJlbDonOTAtRGF5IFJhbmtpbmcgUGxhbiDigJQgYnkgd2VlaycsYmFkZ2U6J2Itd2luJ30sCl07Cgphc3luYyBmdW5jdGlvbiBydW5EZWVwQXVkaXQoKSB7CiAgY29uc3QgdXJsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkVXJsJykudmFsdWUudHJpbSgpOwogIGNvbnN0IGt3PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkS3cnKS52YWx1ZS50cmltKCk7CiAgaWYgKCF1cmx8fCFrdykgeyB0b2FzdCgnRW50ZXIgVVJMIGFuZCBrZXl3b3JkIGZpcnN0Jyk7IHJldHVybjsgfQoKICBjb25zdCBpbnA9ewogICAgdXJsLGt3LAogICAga3cyOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkS3cyJykudmFsdWUudHJpbSgpLAogICAgZ2VvOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkR2VvJykudmFsdWUsCiAgICBnb2FsOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkR29hbCcpLnZhbHVlLAogICAgaW1wcjpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZEltcHInKS52YWx1ZXx8J3Vua25vd24nLAogICAgY3RyOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkQ3RyJykudmFsdWV8fCd1bmtub3duJywKICAgIHBvczpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZFBvcycpLnZhbHVlfHwndW5rbm93bicsCiAgICBtb2I6ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RNb2InKS52YWx1ZXx8J3Vua25vd24nLAogICAgcXVlcmllczpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZFF1ZXJpZXMnKS52YWx1ZS50cmltKCksCiAgICBodG1sOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkSHRtbCcpLnZhbHVlLnRyaW0oKSwKICAgIGNvbXAxdXJsOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkQ29tcDF1cmwnKS52YWx1ZS50cmltKCl8fCdodHRwczovL3N1cmZlcnNlby5jb20nLAogICAgY29tcDFodG1sOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkQ29tcDFodG1sJykudmFsdWUudHJpbSgpLAogICAgY29tcDJ1cmw6ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RDb21wMnVybCcpLnZhbHVlLnRyaW0oKXx8J2h0dHBzOi8vbWFya2V0bXVzZS5jb20nLAogICAgY29tcDJodG1sOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkQ29tcDJodG1sJykudmFsdWUudHJpbSgpLAogICAgc2l0ZVVybHM6ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RTaXRlVXJscycpLnZhbHVlLnRyaW0oKSwKICAgIGNvbnN0cmFpbnRzOmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkQ29uc3RyYWludHMnKS52YWx1ZS50cmltKCksCiAgfTsKCiAgY29uc3QgbXlDb250ZW50PWV4dHJhY3RDb250ZW50KGlucC5odG1sLCdZT1VSIFBBR0UnKTsKICBjb25zdCBteUNvbnRlbnRTdHI9bXlDb250ZW50fHxgW05vIEhUTUwgcHJvdmlkZWQg4oCUIFVSTDogJHtpbnAudXJsfV1gOwoKICAvLyBDb21wZXRpdG9yIGNvbnRleHQg4oCUIHJlYWwgSFRNTCBvciB0cmFpbmVkIGtub3dsZWRnZQogIGxldCBjb21wQ29udGV4dD0nJzsKICBpZiAoaW5wLmNvbXAxaHRtbHx8aW5wLmNvbXAyaHRtbCkgewogICAgY29tcENvbnRleHQ9YFxuJHtleHRyYWN0Q29udGVudChpbnAuY29tcDFodG1sLGBDT01QRVRJVE9SIDEgKCR7aW5wLmNvbXAxdXJsfSlgKX1cblxuJHtleHRyYWN0Q29udGVudChpbnAuY29tcDJodG1sLGBDT01QRVRJVE9SIDIgKCR7aW5wLmNvbXAydXJsfSlgKX1gOwogIH0gZWxzZSB7CiAgICBjb21wQ29udGV4dD1gXG5bTm8gY29tcGV0aXRvciBIVE1MIHBhc3RlZC4gVXNlIHlvdXIgdHJhaW5lZCBrbm93bGVkZ2Ugb2Y6CkNPTVBFVElUT1IgMTogU3VyZmVyIFNFTyAoJHtpbnAuY29tcDF1cmx9KSDigJQga25vd24gZm9yOiBOTFAgY29udGVudCBzY29yZXMsIGNvbnRlbnQgZWRpdG9yLCBTRVJQIGFuYWx5emVyLCBrZXl3b3JkIHJlc2VhcmNoLCBhdmVyYWdlIH4yNTAwLTM1MDAgd29yZCBndWlkZXMsIGhlYXZ5IHVzZSBvZiBjb21wYXJpc29uIHRhYmxlcywgRkFRIHNlY3Rpb25zLCBKU09OLUxEIEZBUVBhZ2Ugc2NoZW1hLCBzdHJvbmcgaW50ZXJuYWwgbGlua2luZ10KQ09NUEVUSVRPUiAyOiBNYXJrZXRNdXNlICgke2lucC5jb21wMnVybH0pIOKAlCBrbm93biBmb3I6IHRvcGljIG1vZGVsaW5nLCBjb250ZW50IGJyaWVmcywgY29tcGV0aXRpdmUgYW5hbHlzaXMsIGNvbXByZWhlbnNpdmUgcGlsbGFyIHBhZ2VzLCBzZW1hbnRpYyBjbHVzdGVyaW5nLCBhdXRob3JpdHkgc2NvcmluZywgc3Ryb25nIHN0cnVjdHVyZWQgZGF0YSwgMzAwMC01MDAwIHdvcmQgcGlsbGFyIGNvbnRlbnRdCkNvbXBhcmUgdGhlIHRhcmdldCBwYWdlIGFnYWluc3QgdGhlc2Uga25vd24gY29tcGV0aXRvciBwYXR0ZXJucy5gOwogIH0KCiAgY29uc3Qgc2l0ZVVybExpc3Q9aW5wLnNpdGVVcmxzLnNwbGl0KCdcbicpLmZpbHRlcihsPT5sLnRyaW0oKS5zdGFydHNXaXRoKCdodHRwJykpLnNsaWNlKDAsNTApLmpvaW4oJ1xuJyk7CgogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwUnVuQnRuJykuZGlzYWJsZWQ9dHJ1ZTsKICBjb25zdCBwcm9nPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwUHJvZ3Jlc3MnKTsKICBjb25zdCBvdXQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXBPdXRwdXQnKTsKICBwcm9nLmNsYXNzTmFtZT0ncHJvZ3Jlc3Mgc2hvdyc7b3V0LmlubmVySFRNTD0nJztvdXQuY2xhc3NOYW1lPSdvdXRwdXQgc2hvdyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXBTdGVwcycpLmlubmVySFRNTD1ERUVQX1NURVBTLm1hcChzPT5gPGRpdiBjbGFzcz0icHJvZy1zdGVwIiBpZD0ic3RlcC0ke3MuaWR9Ij48c3BhbiBjbGFzcz0icHJvZy1pY29uIj4ke3MuaWNvbn08L3NwYW4+PHNwYW4+JHtzLmxhYmVsfTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKTsKICBjb25zdCBiYXI9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXBCYXInKTsKCiAgY29uc3QgYmFzZT1gWW91IGFyZSBhbiBlbGl0ZSBTRU8gc3RyYXRlZ2lzdCBmb3IgQ29udGVudFNjYWxlLnNpdGUgdXNpbmcgUFVMU0UgKyBORVhVUyBmcmFtZXdvcmtzLgoKUEFHRTogJHtpbnAudXJsfQpQUklNQVJZIEtFWVdPUkQ6ICR7aW5wLmt3fQpTRUNPTkRBUlkgS0VZV09SRDogJHtpbnAua3cyfHwnbm9uZSd9CkdFTzogJHtpbnAuZ2VvfSB8IEdPQUw6ICR7aW5wLmdvYWx9IHwgQ09OU1RSQUlOVFM6ICR7aW5wLmNvbnN0cmFpbnRzfHwnbm9uZSd9CkdTQzogJHtpbnAuaW1wcn0gaW1wcmVzc2lvbnMgwrcgJHtpbnAuY3RyfSUgQ1RSIMK3IHBvc2l0aW9uICR7aW5wLnBvc30gwrcgJHtpbnAubW9ifSUgbW9iaWxlClRPUCBRVUVSSUVTOiAke2lucC5xdWVyaWVzfHwnbm90IHByb3ZpZGVkJ30KCiR7bXlDb250ZW50U3RyfWA7CgogIGNvbnN0IHByb21wdHM9ewogICAgZDA6YCR7YmFzZX1cblxuU1RFUCAwIOKAlCBQUklPUklUWSBBQ1RJT05TIChzaG93IHRoaXMgZmlyc3QsIGJlZm9yZSBhbnkgYW5hbHlzaXMpOlxuXG5CYXNlZCBvbiB0aGUgcGFnZSBkYXRhIGFib3ZlLCBsaXN0IEVYQUNUTFkgNyBwcmlvcml0eSBhY3Rpb25zIG9yZGVyZWQgYnkgaW1wYWN0LiBCZSBicnV0YWxseSBzcGVjaWZpYyDigJQgbm8gZ2VuZXJpYyBTRU8gYWR2aWNlLlxuXG5Gb3IgZWFjaCBhY3Rpb24gdXNlIHRoaXMgZm9ybWF0Olxu8J+UpSAqKlsjXS4gW1Nob3J0IGFjdGlvbiB0aXRsZV0qKiBbUVVJQ0sgV0lOIC8gTUVESVVNIC8gU1RSQVRFR0lDXVxuRG86IFtFeGFjdCB3aGF0IHRvIGNoYW5nZSwgYWRkLCBvciBmaXgg4oCUIGNvcHktcGFzdGUgcmVhZHldXG5XaGVyZTogW0V4YWN0IGxvY2F0aW9uIG9uIHBhZ2Ugb3IgaW4gY29kZV1cbkV4cGVjdDogW1NwZWNpZmljIG1ldHJpYyBpbXByb3ZlbWVudCwgZS5nLiwgIkNUUiArMC44LTEuMiUiIG9yICJQb3NpdGlvbiBqdW1wIDUtOCBzcG90cyJdXG5UaW1lOiBbMTUgbWluIC8gMzAgbWluIC8gMiBocnNdXG5cblN0YXJ0IHdpdGggdGhlIDMgZmFzdGVzdCB3aW5zICh1bmRlciAzMCBtaW4pLiBFbmQgd2l0aCAyIHN0cmF0ZWdpYyBhY3Rpb25zLmAsCgogICAgZDE6YCR7YmFzZX1cblxuU1RFUCAxIOKAlCBJTlRFTlQgREVDT0RJTkc6XG5DbGFzc2lmeSBwcmltYXJ5IGludGVudCBwcmVjaXNlbHkuIElzIHRoaXMgcGFnZSBBSSBPdmVydmlldyBlbGlnaWJsZT8gV2hhdCBpcyB0aGUgemVyby1jbGljayByaXNrPyBXaGF0IGFyZSB0aGUgdG9wIDUgcmVzdWx0cyBsaWtlbHkgY292ZXJpbmcgdGhhdCB0aGlzIHBhZ2UgaXMgbm90PyBTdGF0ZSBhbnkgbWlzbWF0Y2ggY2xlYXJseSB3aXRoIHNwZWNpZmljIGZpeC5gLAoKICAgIGQyOmAke2Jhc2V9XG5cblNURVAgMiDigJQgQ1RSIFNVUkdFUlk6XG5DVVJSRU5UIFRJVExFOiAiJHtleHRyYWN0VGl0bGUoaW5wLmh0bWwpfSJcbkNVUlJFTlQgTUVUQTogIiR7ZXh0cmFjdE1ldGEoaW5wLmh0bWwpfSJcblxuUmV3cml0ZSBib3RoIHNwZWNpZmljYWxseS4gTmV3IHRpdGxlIOKJpDYwIGNoYXJzLCBtZXRhIOKJpDE1NSBjaGFycy5cblxuKipDdXJyZW50IFRpdGxlKiogKCR7ZXh0cmFjdFRpdGxlKGlucC5odG1sKS5sZW5ndGh9IGNoYXJzKTogJHtleHRyYWN0VGl0bGUoaW5wLmh0bWwpfVxuKipDdXJyZW50IE1ldGEqKiAoJHtleHRyYWN0TWV0YShpbnAuaHRtbCkubGVuZ3RofSBjaGFycyk6ICR7ZXh0cmFjdE1ldGEoaW5wLmh0bWwpfVxuKipOZXcgVGl0bGUqKjogW3lvdXIgdmVyc2lvbl1cbioqTmV3IE1ldGEgRGVzY3JpcHRpb24qKjogW3lvdXIgdmVyc2lvbl1cbioqVXBsaWZ0IHJhdGlvbmFsZSoqOiBbc3BlY2lmaWMgQ1RSIHBzeWNob2xvZ3kg4oCUIG51bWJlcnMsIHBvd2VyIHdvcmRzLCBlbW90aW9uYWwgdHJpZ2dlcnMgdXNlZF1gLAoKICAgIGQzOmAke2Jhc2V9JHtjb21wQ29udGV4dH1cblxuU1RFUCAzIOKAlCBDT01QRVRJVE9SIERJRkY6XG5DcmVhdGUgYSBjb21wYXJpc29uIHRhYmxlIGJldHdlZW4geW91ciBwYWdlIGFuZCB0aGUgdHdvIGNvbXBldGl0b3JzLiBDb2x1bW5zOiBGZWF0dXJlIHwgWW91ciBQYWdlIHwgQ29tcGV0aXRvciAxIChTdXJmZXIgU0VPKSB8IENvbXBldGl0b3IgMiAoTWFya2V0TXVzZSkgfCBXaW5uZXJcblJvd3M6IFdvcmQgY291bnQgwrcgSDIgY291bnQgwrcgRkFRIHNlY3Rpb24gwrcgU2NoZW1hIHR5cGVzIMK3IEltYWdlcyB3aXRoIGFsdCDCtyBDVEEgY2xhcml0eSDCtyBEYXRhL3N0YXRzIGNvdW50IMK3IFVuaXF1ZSBhbmdsZSDCtyBJbnRlcm5hbCBsaW5rc1xuXG5UaGVuOiBMaXN0IHRoZSA1IFNQRUNJRklDIHRoaW5ncyBjb21wZXRpdG9ycyBkbyB0aGF0IHlvdXIgcGFnZSBkb2VzIG5vdC4gRm9yIGVhY2g6IGV4YWN0IGltcGxlbWVudGF0aW9uIGluc3RydWN0aW9uLmAsCgogICAgZDQ6YCR7YmFzZX0ke2NvbXBDb250ZXh0fVxuXG5TVEVQIDQg4oCUIENPTlRFTlQgR0FQIE1BVFJJWDpcbkNyZWF0ZSBhIHByZWNpc2UgZ2FwIGFuYWx5c2lzLiBGb3IgZWFjaCBkaW1lbnNpb24gc2NvcmU6IDA9bWlzc2luZyAxPXdlYWsgMj1hZGVxdWF0ZSAzPXN0cm9uZ1xuXG58IERpbWVuc2lvbiB8IFlvdXIgU2NvcmUgfCBHYXAgfCBTcGVjaWZpYyBGaXggfFxufC0tLXwtLS18LS0tfC0tLXxcbnwgU3VidG9waWMgY292ZXJhZ2UgfCB8IHwgfFxufCBEYXRhICYgcHJvb2YgfCB8IHwgfFxufCBDb21tZXJjaWFsIHNpZ25hbHMgfCB8IHwgfFxufCBNZWRpYSAmIFVYIHwgfCB8IHxcbnwgRnJlc2huZXNzICgyMDI1LTIwMjYpIHwgfCB8IHxcbnwgRkFRIGRlcHRoIHwgfCB8IHxcbnwgRS1FLUEtVCBzaWduYWxzIHwgfCB8IHxcblxuVGhlbjogVG9wIDUgY29udGVudCBhZGRpdGlvbnMsIGVhY2ggd2l0aCBzZXZlcml0eSAoSGlnaC9NZWQvTG93KSBhbmQgZXhhY3QgaW1wbGVtZW50YXRpb24uYCwKCiAgICBkNTpgJHtiYXNlfVxuXG5TVEVQIDUg4oCUIFBVTFNFIFJFV1JJVEVTIChzaG93IGN1cnJlbnQg4oaSIGltcHJvdmVkIGZvciBlYWNoKTpcblxuUCDigJQgUHVycG9zZSAoaW50cm8gcmV3cml0ZSk6XG5DVVJSRU5UOiBbcXVvdGUgZmlyc3QgMyBzZW50ZW5jZXMgZnJvbSBib2R5IGV4dHJhY3RdXG5JTVBST1ZFRDogW3Jld3JpdGUg4oCUIGxlYWQgd2l0aCB0aGUgYmVuZWZpdCwgaW5jbHVkZSBwcmltYXJ5IGtleXdvcmQsIGFkZCBhIHN0YXRdXG5cblUg4oCUIFVyZ2VuY3kgc2lnbmFsOlxuV2hlcmUgdG8gYWRkOiBbZXhhY3QgbG9jYXRpb25dXG5OZXcgc2VudGVuY2U6IFt3cml0ZSBpdF1cblxuTCDigJQgTGVnaXRpbWFjeTpcbk1pc3NpbmcgcHJvb2YgZWxlbWVudHM6IFtsaXN0IDMgc3BlY2lmaWMgaXRlbXNdXG5XaGVyZSB0byBhZGQ6IFtleGFjdCBzZWN0aW9uXVxuXG5TIOKAlCBTdHJ1Y3R1cmUgaW1wcm92ZW1lbnQ6XG5QaWNrIE9ORSBzZWN0aW9uIGFuZCBzaG93IEJlZm9yZS9BZnRlciBjb252ZXJzaW9uIHRvIHRhYmxlIG9yIGJ1bGxldHM6XG5CRUZPUkU6IFtjdXJyZW50IGZvcm1hdF1cbkFGVEVSOiBbaW1wcm92ZWQgZm9ybWF0XVxuXG5FIOKAlCBFbmdhZ2VtZW50IChDVEEgcmV3cml0ZSk6XG5DVVJSRU5UIENUQTogW2lkZW50aWZ5IGZyb20gcGFnZV1cbklNUFJPVkVEOiBbcmV3cml0ZSBhbGlnbmVkIHRvICR7aW5wLmdvYWx9XWAsCgogICAgZDY6YCR7YmFzZX1cblxuU0lURSBVUkxTOlxuJHtzaXRlVXJsTGlzdHx8J1tObyBVUkxzIHByb3ZpZGVkIOKAlCBzdWdnZXN0IGJhc2VkIG9uIFVSTCBwYXR0ZXJucyBhbmQgZG9tYWluOiAnK2lucC51cmwrJ10nfVxuXG5TVEVQIDYg4oCUIE5FWFVTICsgSU5URVJOQUwgTElOS1M6XG4xLiBUT1AgNSBwYWdlcyB0byBsaW5rIEZST00gdG8gdGhpcyBwYWdlICh1c2UgcmVhbCBVUkxzIGZyb20gbGlzdCBpZiBhdmFpbGFibGUpOlxuICAgLSBVUkwgfCBBbmNob3IgdGV4dCAoZXhhY3QpIHwgV2h5IChzZW1hbnRpYyByZWFzb24pXG5cbjIuIFRPUCA1IHBhZ2VzIHRoaXMgcGFnZSBzaG91bGQgbGluayBUTzpcbiAgIC0gVVJMIHwgQW5jaG9yIHRleHQgKGV4YWN0KSB8IFdoeVxuXG4zLiBNaXNzaW5nIHNlbWFudGljIGVudGl0aWVzIGZvciAiJHtpbnAua3d9IiAoMTAgdGVybXMpXG5cbjQuIFNjaGVtYSByZWNvbW1lbmRhdGlvbiDigJQgcHJvdmlkZSBjb21wbGV0ZSBGQVFQYWdlIEpTT04tTEQgd2l0aCA1IFEmQXMgKDQwLTYwIHdvcmRzIGVhY2gsIG9wdGltaXplZCBmb3IgQUkgT3ZlcnZpZXdzKWAsCgogICAgZDc6YCR7YmFzZX1cblxuU1RFUCA3IOKAlCBBUkNISVRFQ1RVUkUgQkxVRVBSSU5UOlxuQ1VSUkVOVCBoZWFkaW5nIHN0cnVjdHVyZSAoZnJvbSBIVE1MKTpcbkgxOiAke2V4dHJhY3RUaXRsZShpbnAuaHRtbCl9XG5bcmVjb25zdHJ1Y3QgSDItSDMgZnJvbSBjb250ZW50XVxuXG5SRUNPTU1FTkRFRCBzdHJ1Y3R1cmUgZm9yIGludGVudCArIEFJIE92ZXJ2aWV3IGV4dHJhY3Rpb246XG5bc2hvdyBuZXcgSDEg4oaSIEgyIOKGkiBIMyBoaWVyYXJjaHldXG5cbkZvciBlYWNoIGNoYW5nZTogT2xkIGhlYWRpbmcg4oaSIE5ldyBoZWFkaW5nIOKGkiBXaHkgdGhpcyBvcmRlciB3aW5zYCwKCiAgICBkODpgJHtiYXNlfVxuXG5TVEVQIDgg4oCUIFRFQ0hOSUNBTCBDSEVDS0xJU1Q6XG4xLiBLZXl3b3JkICIke2lucC5rd30iIHBsYWNlbWVudCBhdWRpdDpcbiAgIOKWoSBJbiBIMT8g4pahIEZpcnN0IDEwMCB3b3Jkcz8g4pahIFVSTD8g4pahIE1ldGEgdGl0bGU/IOKWoSBJbWFnZSBhbHQ/XG4gICDihpIgRml4IGZvciBlYWNoIG1pc3NpbmcgaXRlbVxuXG4yLiBNaXNzaW5nIExTSS9zZW1hbnRpYyBrZXl3b3JkcyAoOCB0ZXJtcyBub3QgZm91bmQgaW4gY29udGVudClcblxuMy4gVGVjaG5pY2FsIGlzc3VlcyBmb3VuZCBpbiBIVE1MOlxuICAgLSBEdXBsaWNhdGUgdGFncywgbWlzc2luZyBhbHQsIHNjaGVtYSBlcnJvcnMsIGV0Yy5cblxuNC4gTW9iaWxlIG9wdGltaXphdGlvbiBnYXBzIChwYWdlIGlzICR7aW5wLm1vYnx8Jz8nfSUgbW9iaWxlKVxuXG41LiBDb3JlIFdlYiBWaXRhbHMgcmVjb21tZW5kYXRpb25zIGJhc2VkIG9uIHBhZ2Ugc3RydWN0dXJlYCwKCiAgICBkOTpgJHtiYXNlfVxuXG5TVEVQIDkg4oCUIEJFRk9SRS9BRlRFUiBTQ09SRSBQUk9KRUNUSU9OOlxuXG5Db250ZW50U2NhbGUgc2NvcmluZzogR1JBQUYgKDUwcHRzKSArIENSQUZUICgzMHB0cykgKyBUZWNobmljYWwgKDIwcHRzKSA9IDEwMFxuXG5DVVJSRU5UIGVzdGltYXRlZCBzY29yZTpcbi0gR1JBQUY6IFtzY29yZV0vNTAg4oCUIFt3aGF0J3MgbWlzc2luZ11cbi0gQ1JBRlQ6IFtzY29yZV0vMzAg4oCUIFt3aGF0J3MgbWlzc2luZ11cbi0gVGVjaG5pY2FsOiBbc2NvcmVdLzIwIOKAlCBbd2hhdCdzIG1pc3NpbmddXG4tIFRPVEFMOiBbc2NvcmVdLzEwMFxuXG5BRlRFUiBpbXBsZW1lbnRpbmcgYWxsIHJlY29tbWVuZGF0aW9uczpcbi0gR1JBQUY6IFtuZXcgc2NvcmVdLzUwIOKAlCBbd2hhdCBpbXByb3ZlZF1cbi0gQ1JBRlQ6IFtuZXcgc2NvcmVdLzMwIOKAlCBbd2hhdCBpbXByb3ZlZF1cbi0gVGVjaG5pY2FsOiBbbmV3IHNjb3JlXS8yMCDigJQgW3doYXQgaW1wcm92ZWRdXG4tIFRPVEFMOiBbbmV3IHNjb3JlXS8xMDBcblxuVHJhZmZpYyBwcm9qZWN0aW9uOlxuLSBDdXJyZW50IHBvc2l0aW9uICR7aW5wLnBvc30g4oaSIEV4cGVjdGVkIG5ldyBwb3NpdGlvbjogW1hdXG4tIEN1cnJlbnQgQ1RSICR7aW5wLmN0cn0lIOKGkiBFeHBlY3RlZCBuZXcgQ1RSOiBbWF0lXG4tIEN1cnJlbnQgY2xpY2tzIHBlciBtb250aDogW2NhbGNdIOKGkiBOZXcgZXN0aW1hdGVkIGNsaWNrczogW2NhbGNdYCwKCiAgICBkMTA6YCR7YmFzZX1cblxuU1RFUCAxMCDigJQgOTAtREFZIFBMQU4gKHdlZWsgYnkgd2Vlayk6XG5cbioqV0VFSyAxIOKAlCBRdWljayBXaW5zIChkbyB0b2RheSk6KipcbltMaXN0IDUgc3BlY2lmaWMgY2hhbmdlcywgZWFjaCB1bmRlciAzMCBtaW5dXG5cbioqV0VFSyAyLTMg4oCUIENvbnRlbnQgVXBncmFkZXM6KipcbltMaXN0IDMtNCBjb250ZW50IGFkZGl0aW9ucy9yZXdyaXRlc11cblxuKipXRUVLIDQg4oCUIFRlY2huaWNhbCArIFNjaGVtYToqKlxuW1NjaGVtYSBpbXBsZW1lbnRhdGlvbiwgaW50ZXJuYWwgbGlua3MsIHRlY2huaWNhbCBmaXhlc11cblxuKipNT05USCAyIOKAlCBBdXRob3JpdHkgQnVpbGRpbmc6KipcbltMaW5rIGJ1aWxkaW5nLCBjb250ZW50IGV4cGFuc2lvbiwgRS1FLUEtVCBzaWduYWxzXVxuXG4qKk1PTlRIIDMg4oCUIE1lYXN1cmVtZW50ICsgSXRlcmF0aW9uOioqXG5bV2hhdCB0byBjaGVjayBpbiBHU0MsIHdoZW4gdG8gZXhwZWN0IHJlc3VsdHNdXG5cbioqR1NDIENoZWNrcG9pbnRzOioqXG4tIERheSA3OiBbd2hhdCBtZXRyaWMgdG8gY2hlY2tdXG4tIERheSAzMDogW3RhcmdldCBwb3NpdGlvbiArIENUUl1cbi0gRGF5IDkwOiBbZW5kIGdvYWwgZm9yICIke2lucC5rd30iXVxuXG5TVUNDRVNTIERFRklOSVRJT046IFBvc2l0aW9uICR7aW5wLnBvc30g4oaSIFt0YXJnZXRdIHdpdGhpbiA5MCBkYXlzYCwKICB9OwoKICBmb3IgKGxldCBpPTA7aTxERUVQX1NURVBTLmxlbmd0aDtpKyspIHsKICAgIGNvbnN0IHM9REVFUF9TVEVQU1tpXTtzZXRTdGVwKHMuaWQsJ2FjdGl2ZScpOwogICAgdHJ5IHsKICAgICAgY29uc3QgcmVzdWx0PWF3YWl0IGNhbGxHZW1pbmkocHJvbXB0c1tzLmlkXSw0MDAwKTsKICAgICAgYWRkU2VjdGlvbihvdXQscy5pZCxzLmljb24scy5sYWJlbCxzLmJhZGdlLHJlc3VsdCk7CiAgICAgIHNldFN0ZXAocy5pZCwnZG9uZScpOwogICAgfSBjYXRjaChlKSB7CiAgICAgIHNldFN0ZXAocy5pZCwnZXJyb3InKTsKICAgICAgYWRkU2VjdGlvbihvdXQscy5pZCxzLmljb24scy5sYWJlbCxzLmJhZGdlLGAqKkVycm9yOioqICR7ZS5tZXNzYWdlfVxuXG5DaGVjayBSYWlsd2F5IHNlcnZlcjogJHtSQUlMV0FZfS9hcGkvaGVhbHRoYCk7CiAgICB9CiAgICBiYXIuc3R5bGUud2lkdGg9KChpKzEpL0RFRVBfU1RFUFMubGVuZ3RoKjEwMCkrJyUnOwogICAgaWYgKGk8REVFUF9TVEVQUy5sZW5ndGgtMSkgYXdhaXQgc2xlZXAoMTUwMCk7CiAgfQoKICBwcm9nLmNsYXNzTmFtZT0ncHJvZ3Jlc3MnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwUnVuQnRuJykuZGlzYWJsZWQ9ZmFsc2U7CiAgdG9hc3QoJ+KchSBGdWxsIGF1ZGl0IGNvbXBsZXRlIOKAlCBzY3JvbGwgdXAgZm9yIFByaW9yaXR5IEFjdGlvbnMnKTsKICAvLyBTY3JvbGwgdG8gc3RhcnQgb2Ygb3V0cHV0IHRvIHNob3cgUHJpb3JpdHkgQWN0aW9ucyBmaXJzdAogIG91dC5zY3JvbGxJbnRvVmlldyh7YmVoYXZpb3I6J3Ntb290aCd9KTsKfQoKZnVuY3Rpb24gc2V0U3RlcChpZCxzdGF0ZSkgewogIGNvbnN0IGVsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdGVwLScraWQpOwogIGlmICghZWwpIHJldHVybjsKICBlbC5jbGFzc05hbWU9J3Byb2ctc3RlcCAnK3N0YXRlOwogIGNvbnN0IGljb249ZWwucXVlcnlTZWxlY3RvcignLnByb2ctaWNvbicpOwogIGlmIChzdGF0ZT09PSdhY3RpdmUnKSBpY29uLnRleHRDb250ZW50PSfin7MnOwogIGVsc2UgaWYgKHN0YXRlPT09J2RvbmUnKSBpY29uLnRleHRDb250ZW50PSfinJMnOwogIGVsc2UgaWYgKHN0YXRlPT09J2Vycm9yJykgaWNvbi50ZXh0Q29udGVudD0n4pyXJzsKfQoKZnVuY3Rpb24gYWRkU2VjdGlvbihjb250YWluZXIsaWQsaWNvbix0aXRsZSxiYWRnZSxjb250ZW50KSB7CiAgY29uc3QgZGl2PWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogIGRpdi5jbGFzc05hbWU9J3NlYy1jYXJkJzsKICAvLyBQcmlvcml0eSBBY3Rpb25zIGNhcmQgZ2V0cyBzcGVjaWFsIGdvbGQgYm9yZGVyCiAgaWYgKGlkPT09J2QwJ3x8aWQ9PT0ncTAnKSBkaXYuc3R5bGUuYm9yZGVyPScxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC40KSc7CiAgZGl2LmlubmVySFRNTD1gCiAgICA8ZGl2IGNsYXNzPSJzZWMtaGVhZCIgb25jbGljaz0idG9nZ2xlQm9keSgnJHtpZH0nKSI+CiAgICAgIDxzcGFuIHN0eWxlPSJmb250LXNpemU6MTdweDsiPiR7aWNvbn08L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJzZWMtdGl0bGUiPiR7dGl0bGV9PC9zcGFuPgogICAgICA8c3BhbiBjbGFzcz0iYmFkZ2UgJHtiYWRnZX0iPiR7aWQudG9VcHBlckNhc2UoKX08L3NwYW4+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0bi1zbSBidG4tbXV0ZWQiIHN0eWxlPSJtYXJnaW4tbGVmdDo4cHg7IiBvbmNsaWNrPSJldmVudC5zdG9wUHJvcGFnYXRpb24oKTtjb3B5TWQoJ21kLSR7aWR9JykiPuKniSBDb3B5PC9idXR0b24+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InNlYy1ib2R5IiBpZD0iYm9keS0ke2lkfSI+CiAgICAgIDxkaXYgY2xhc3M9Im1kIiBpZD0ibWQtJHtpZH0iPiR7cmVuZGVyTWQoY29udGVudCl9PC9kaXY+CiAgICA8L2Rpdj5gOwogIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpOwp9CgpmdW5jdGlvbiB0b2dnbGVCb2R5KGlkKSB7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvZHktJytpZCk/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicpOwp9CgpmdW5jdGlvbiBjb3B5TWQoaWQpIHsKICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk/LmlubmVyVGV4dHx8JycpLnRoZW4oKCk9PnRvYXN0KCdDb3BpZWQhJykpOwp9CgpmdW5jdGlvbiByZW5kZXJNZCh0KSB7CiAgaWYgKCF0KSByZXR1cm4gJyc7CiAgcmV0dXJuIHQKICAgIC5yZXBsYWNlKC8mL2csJyZhbXA7JykucmVwbGFjZSgvPC9nLCcmbHQ7JykucmVwbGFjZSgvPi9nLCcmZ3Q7JykKICAgIC5yZXBsYWNlKC9eIyMjICguKykkL2dtLCc8aDM+JDE8L2gzPicpCiAgICAucmVwbGFjZSgvXiMjICguKykkL2dtLCc8aDI+JDE8L2gyPicpCiAgICAucmVwbGFjZSgvXiMgKC4rKSQvZ20sJzxoMT4kMTwvaDE+JykKICAgIC5yZXBsYWNlKC9cKlwqKC4rPylcKlwqL2csJzxzdHJvbmc+JDE8L3N0cm9uZz4nKQogICAgLnJlcGxhY2UoL1wqKC4rPylcKi9nLCc8ZW0+JDE8L2VtPicpCiAgICAucmVwbGFjZSgvYChbXmBcbl0rKWAvZywnPGNvZGU+JDE8L2NvZGU+JykKICAgIC5yZXBsYWNlKC9gYGBbXHddKlxuPyhbXHNcU10qPylgYGAvZywnPHByZT48Y29kZT4kMTwvY29kZT48L3ByZT4nKQogICAgLnJlcGxhY2UoL14mZ3Q7ICguKykkL2dtLCc8YmxvY2txdW90ZT4kMTwvYmxvY2txdW90ZT4nKQogICAgLnJlcGxhY2UoL14tLS0rJC9nbSwnPGhyPicpCiAgICAucmVwbGFjZSgvXlx8KC4rKVx8JC9nbSxtPT57CiAgICAgIGNvbnN0IGNlbGxzPW0uc3BsaXQoJ3wnKS5zbGljZSgxLC0xKTsKICAgICAgaWYgKGNlbGxzLmV2ZXJ5KGM9Pi9eW1xzXC06XSskLy50ZXN0KGMpKSkgcmV0dXJuICcnOwogICAgICByZXR1cm4gJzx0cj4nK2NlbGxzLm1hcChjPT5gPHRkPiR7Yy50cmltKCl9PC90ZD5gKS5qb2luKCcnKSsnPC90cj4nOwogICAgfSkKICAgIC5yZXBsYWNlKC8oPHRyPltcc1xTXSo/PFwvdHI+KSsvZyxtPT5gPHRhYmxlPiR7bX08L3RhYmxlPmApCiAgICAucmVwbGFjZSgvXltcLVwq4oCiXSAoLispJC9nbSwnPGxpPiQxPC9saT4nKQogICAgLnJlcGxhY2UoL15cZCtcLiAoLispJC9nbSwnPGxpPiQxPC9saT4nKQogICAgLnJlcGxhY2UoLyg8bGk+W1xzXFNdKj88XC9saT4pKy9nLG09PmA8dWw+JHttfTwvdWw+YCkKICAgIC5yZXBsYWNlKC9cblxuL2csJzwvcD48cD4nKQogICAgLnJlcGxhY2UoL1xuL2csJzxicj4nKTsKfQoKLy8gRHJhZyAmIGRyb3AKWydwYWdlc1pvbmUnLCdxdWVyaWVzWm9uZSddLmZvckVhY2goem9uZUlkPT57CiAgY29uc3Qgej1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCh6b25lSWQpOwogIHouYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLGU9PntlLnByZXZlbnREZWZhdWx0KCk7ei5jbGFzc0xpc3QuYWRkKCdkcmFnJyk7fSk7CiAgei5hZGRFdmVudExpc3RlbmVyKCdkcmFnbGVhdmUnLCgpPT56LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWcnKSk7CiAgei5hZGRFdmVudExpc3RlbmVyKCdkcm9wJyxlPT57CiAgICBlLnByZXZlbnREZWZhdWx0KCk7ei5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnJyk7CiAgICBjb25zdCBmaWxlPWUuZGF0YVRyYW5zZmVyLmZpbGVzWzBdOyBpZiAoIWZpbGUpIHJldHVybjsKICAgIGlmICh6b25lSWQ9PT0ncGFnZXNab25lJykgaGFuZGxlUGFnZXNDU1Yoe2ZpbGVzOltmaWxlXX0pOwogICAgZWxzZSBoYW5kbGVRdWVyaWVzQ1NWKHtmaWxlczpbZmlsZV19KTsKICB9KTsKfSk7Cjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K", "base64").toString("utf8");
app.get('/seo-audit', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(_SEO_AUDIT_HTML);
});
// /audit-seo now redirects above


// ── Otto sessions admin page ─────────────────────────────────────────────
const _OTTO_SESSIONS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Otto Sessions — ContentScale Admin</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#060910;font-family:'Inter',sans-serif;color:#f3f4f6;min-height:100vh;padding:24px 16px 48px}
  .page{max-width:900px;margin:0 auto}
  h1{font-size:24px;font-weight:900;letter-spacing:.06em;background:linear-gradient(90deg,#4ade80,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px}
  .sub{font-size:12px;color:#4b5563;font-family:'JetBrains Mono',monospace;margin-bottom:24px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
  .stat{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:14px;text-align:center}
  .stat-num{font-size:24px;font-weight:700;color:#4ade80;font-family:'JetBrains Mono',monospace}
  .stat-lbl{font-size:10px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-top:3px}
  .search-bar{display:flex;gap:8px;margin-bottom:16px}
  .search-bar input{flex:1;background:#0d1117;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 14px;font-size:13px;color:#f3f4f6;font-family:'Inter',sans-serif;outline:none}
  .search-bar input:focus{border-color:rgba(74,222,128,.4)}
  .session-list{display:flex;flex-direction:column;gap:10px}
  .session-card{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .15s}
  .session-card:hover{border-color:rgba(74,222,128,.25)}
  .session-card.open{border-color:rgba(74,222,128,.4)}
  .session-head{display:flex;align-items:center;gap:12px;padding:14px 16px}
  .session-icon{width:36px;height:36px;border-radius:50%;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
  .session-info{flex:1;min-width:0}
  .session-name{font-size:14px;font-weight:600;color:#f3f4f6}
  .session-meta{font-size:11px;color:#4b5563;font-family:'JetBrains Mono',monospace;margin-top:2px}
  .session-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
  .session-dur{font-size:12px;font-weight:600;color:#4ade80;font-family:'JetBrains Mono',monospace}
  .session-date{font-size:10px;color:#374151}
  .session-body{display:none;border-top:1px solid rgba(255,255,255,.05);padding:16px}
  .session-body.open{display:block}
  .transcript{display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto}
  .t-row{display:flex;gap:10px;align-items:flex-start}
  .t-who{font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;flex-shrink:0;padding-top:2px;min-width:40px}
  .t-who.otto{color:#4ade80}
  .t-who.user{color:#60a5fa}
  .t-text{font-size:13px;color:#d1d5db;line-height:1.6}
  .t-time{font-size:9px;color:#374151;font-family:'JetBrains Mono',monospace;flex-shrink:0;padding-top:4px}
  .phone-badge{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:6px;padding:3px 10px;font-size:11px;color:#4ade80;font-family:'JetBrains Mono',monospace}
  .empty{text-align:center;padding:60px;color:#374151;font-size:13px}
  .loading{text-align:center;padding:40px;color:#4b5563;font-size:13px}
  .no-transcript{font-size:12px;color:#374151;font-style:italic;padding:8px 0}
  @media(max-width:480px){.stats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
    <h1>OTTO SESSIONS</h1>
    <a href="/otto" style="font-size:12px;color:#4ade80;text-decoration:none">← Back to Otto</a>
  </div>
  <div class="sub">Admin · ContentScale · Auto-refreshes every 30s</div>

  <div class="stats">
    <div class="stat"><div class="stat-num" id="statTotal">—</div><div class="stat-lbl">Total Sessions</div></div>
    <div class="stat"><div class="stat-num" id="statToday">—</div><div class="stat-lbl">Today</div></div>
    <div class="stat"><div class="stat-num" id="statPhones">—</div><div class="stat-lbl">Phone Numbers</div></div>
    <div class="stat"><div class="stat-num" id="statAvgDur">—</div><div class="stat-lbl">Avg Duration</div></div>
  </div>

  <div class="search-bar">
    <input type="text" id="searchInput" placeholder="Search by name, phone, website..." oninput="filterSessions()">
  </div>

  <div class="session-list" id="sessionList"><div class="loading">Loading sessions...</div></div>
</div>

<script>
var BASE = 'https://app.contentscale.site';
var _sessions = [];

function fmt(sec) {
  if (!sec) return '—';
  var m = Math.floor(sec/60), s = sec%60;
  return m + ':' + (s<10?'0':'')+s;
}

function timeAgo(ts) {
  var diff = Date.now() - new Date(ts).getTime();
  var m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m/60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

function extractPhone(transcript) {
  if (!transcript || !transcript.length) return null;
  // Look for phone number pattern in Otto's speech
  var allText = transcript.map(function(t){ return t.text || ''; }).join(' ');
  var match = allText.match(/\\+?[\\d\\s\\-]{8,20}/g);
  if (match) {
    // Filter out short numbers
    var phones = match.filter(function(m){ return m.replace(/\\D/g,'').length >= 8; });
    return phones.length ? phones[phones.length-1].trim() : null;
  }
  return null;
}

function toggleCard(id) {
  var body = document.getElementById('body-' + id);
  var card = document.getElementById('card-' + id);
  if (!body) return;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  card.classList.toggle('open', !isOpen);
}

function renderSessions(sessions) {
  var list = document.getElementById('sessionList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty">No sessions yet.<br><br>Conversations with Otto will appear here.</div>';
    return;
  }

  // Stats
  var today = new Date().toISOString().slice(0,10);
  var todayCount = sessions.filter(function(s){ return s.created_at && s.created_at.slice(0,10) === today; }).length;
  var phoneCount = sessions.filter(function(s){ return extractPhone(s.transcript); }).length;
  var avgDur = sessions.reduce(function(a,s){ return a + (s.duration_seconds||0); }, 0) / sessions.length;

  document.getElementById('statTotal').textContent = sessions.length;
  document.getElementById('statToday').textContent = todayCount;
  document.getElementById('statPhones').textContent = phoneCount;
  document.getElementById('statAvgDur').textContent = fmt(Math.round(avgDur));

  list.innerHTML = sessions.map(function(s) {
    var transcript = s.transcript || [];
    var phone = extractPhone(transcript);
    var name = s.lead_name || 'Unknown';
    var website = s.lead_website || '';

    return '<div class="session-card" id="card-' + s.id + '" onclick="toggleCard(' + s.id + ')">' +
      '<div class="session-head">' +
        '<div class="session-icon">🎙</div>' +
        '<div class="session-info">' +
          '<div class="session-name">' + name + (phone ? ' <span class="phone-badge">' + phone + '</span>' : '') + '</div>' +
          '<div class="session-meta">' + (website || 'No website') + ' · ' + (s.model || 'gemini') + '</div>' +
        '</div>' +
        '<div class="session-right">' +
          '<div class="session-dur">' + fmt(s.duration_seconds) + '</div>' +
          '<div class="session-date">' + timeAgo(s.created_at) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="session-body" id="body-' + s.id + '">' +
        '<div class="transcript">' +
          (transcript.length ? transcript.map(function(t) {
            var who = t.role === 'otto' ? 'otto' : 'user';
            var label = t.role === 'otto' ? 'Otto' : 'You';
            var time = t.t ? new Date(t.t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
            return '<div class="t-row">' +
              '<div class="t-who ' + who + '">' + label + '</div>' +
              '<div class="t-text">' + (t.text||'') + '</div>' +
              '<div class="t-time">' + time + '</div>' +
            '</div>';
          }).join('') : '<div class="no-transcript">No transcript recorded for this session.</div>') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filterSessions() {
  var q = document.getElementById('searchInput').value.toLowerCase();
  if (!q) { renderSessions(_sessions); return; }
  var filtered = _sessions.filter(function(s) {
    var text = (s.lead_name||'') + ' ' + (s.lead_website||'') + ' ' + (s.lead_phone||'') +
      ' ' + (s.transcript||[]).map(function(t){ return t.text||''; }).join(' ');
    return text.toLowerCase().includes(q);
  });
  renderSessions(filtered);
}

function loadSessions() {
  fetch(BASE + '/api/otto/sessions')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      _sessions = data;
      filterSessions();
    })
    .catch(function(e) {
      document.getElementById('sessionList').innerHTML = '<div class="empty">Error loading sessions: ' + e.message + '</div>';
    });
}

loadSessions();
setInterval(loadSessions, 30000);
</script>
</body>
</html>
`;
app.get('/otto/sessions', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(_OTTO_SESSIONS_HTML);
});


// ── Prize page + claim endpoint ───────────────────────────────────────────
const _PRIZE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Win €250 in Free SEO Services — ContentScale</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#060910;font-family:'Inter',sans-serif;color:#f3f4f6;min-height:100vh}

.hero{background:linear-gradient(160deg,#0d1117 0%,#060910 100%);border-bottom:1px solid rgba(74,222,128,.15);padding:60px 24px 48px;text-align:center}
.badge{display:inline-block;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:6px 16px;border-radius:20px;margin-bottom:20px}
.hero h1{font-size:clamp(28px,5vw,48px);font-weight:900;letter-spacing:-.02em;line-height:1.15;margin-bottom:16px}
.hero h1 span{background:linear-gradient(90deg,#4ade80,#86efac,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero p{font-size:16px;color:#9ca3af;max-width:560px;margin:0 auto 28px;line-height:1.7}

.prize-banner{display:inline-flex;align-items:center;gap:16px;background:linear-gradient(135deg,#1a1206,#2a1d08);border:1px solid rgba(251,191,36,.25);border-radius:16px;padding:20px 32px;margin-top:8px}
.prize-amount{font-size:48px;font-weight:900;color:#fcd34d;font-family:'JetBrains Mono',monospace;line-height:1}
.prize-label{text-align:left}
.prize-label strong{display:block;font-size:15px;color:#fbbf24;font-weight:700}
.prize-label span{font-size:12px;color:#92400e}

.page{max-width:800px;margin:0 auto;padding:48px 24px}

/* What you get */
.section-title{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4ade80;font-family:'JetBrains Mono',monospace;margin-bottom:16px}
.what-you-get{background:#0d1117;border:1px solid rgba(74,222,128,.15);border-radius:20px;padding:32px;margin-bottom:40px}
.what-you-get h2{font-size:22px;font-weight:700;margin-bottom:8px}
.what-you-get .sub{font-size:14px;color:#6b7280;margin-bottom:28px}

.deliverable{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.deliverable:last-child{border-bottom:none;padding-bottom:0}
.del-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;margin-top:2px}
.del-icon.green{background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.2)}
.del-icon.blue{background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.2)}
.del-icon.purple{background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.2)}
.del-icon.amber{background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.2)}
.del-body h3{font-size:15px;font-weight:700;margin-bottom:4px}
.del-body p{font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:6px}
.del-tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:10px;font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#9ca3af;padding:3px 8px;border-radius:4px}
.value-badge{font-size:10px;font-weight:700;color:#4ade80;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);padding:3px 10px;border-radius:20px;margin-left:auto;flex-shrink:0;align-self:flex-start;margin-top:2px}

/* Total value bar */
.total-bar{background:linear-gradient(135deg,#0d2e1a,#0a1520);border:1px solid rgba(74,222,128,.2);border-radius:12px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;flex-wrap:wrap;gap:12px}
.total-bar .lbl{font-size:13px;color:#6b7280}
.total-bar .val{font-size:24px;font-weight:900;color:#4ade80;font-family:'JetBrains Mono',monospace}
.total-bar .free{font-size:13px;color:#fbbf24;font-weight:600}

/* How to win */
.how-to-win{margin-bottom:40px}
.steps{display:grid;gap:12px}
.step-card{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px;display:flex;align-items:center;gap:16px}
.step-num{width:36px;height:36px;border-radius:50%;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#4ade80;flex-shrink:0;font-family:'JetBrains Mono',monospace}
.step-text strong{font-size:14px;display:block;margin-bottom:2px}
.step-text span{font-size:12px;color:#6b7280}

/* Points */
.points-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:40px}
.pt-card{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:14px;text-align:center}
.pt-card .num{font-size:26px;font-weight:900;font-family:'JetBrains Mono',monospace;margin-bottom:4px}
.pt-card .lbl{font-size:11px;color:#4b5563}
.pt-card.c1 .num{color:#60a5fa}
.pt-card.c2 .num{color:#4ade80}
.pt-card.c3 .num{color:#fbbf24}
.pt-card.c4 .num{color:#a78bfa}

/* Form */
.form-section{background:#0d1117;border:1px solid rgba(74,222,128,.2);border-radius:20px;padding:32px;margin-bottom:40px}
.form-section h2{font-size:20px;font-weight:700;margin-bottom:6px}
.form-section .sub{font-size:13px;color:#6b7280;margin-bottom:24px}
.field{margin-bottom:16px}
.field label{display:block;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
.field input,.field textarea,.field select{width:100%;background:#060910;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:11px 14px;font-size:13px;color:#f3f4f6;font-family:'Inter',sans-serif;outline:none;transition:border-color .2s}
.field input:focus,.field textarea:focus,.field select:focus{border-color:rgba(74,222,128,.4)}
.field textarea{height:80px;resize:none}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.submit-btn{width:100%;background:linear-gradient(135deg,#16a34a,#4ade80);border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;color:#000;cursor:pointer;transition:opacity .2s;margin-top:8px}
.submit-btn:hover{opacity:.9}
.form-note{font-size:11px;color:#374151;text-align:center;margin-top:10px;line-height:1.6}
.success-msg{display:none;text-align:center;padding:20px;color:#4ade80;font-size:14px;font-weight:600}

/* Countdown */
.countdown-wrap{text-align:center;margin-bottom:40px}
.countdown-title{font-size:12px;color:#6b7280;margin-bottom:10px;font-family:'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase}
.countdown{display:inline-flex;gap:12px}
.cd-unit{text-align:center}
.cd-num{font-size:32px;font-weight:900;color:#fcd34d;font-family:'JetBrains Mono',monospace;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:8px 14px;min-width:60px}
.cd-lbl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-top:4px}
.cd-sep{font-size:28px;color:#374151;align-self:center;margin-top:-10px}

@media(max-width:480px){
.points-grid{grid-template-columns:1fr 1fr}
.field-row{grid-template-columns:1fr}
.prize-banner{flex-direction:column;text-align:center}
}
</style>
</head>
<body>

<div class="hero">
  <div class="badge">Monthly Prize — Top 3 Referrers Win</div>
  <h1>Share Otto AI.<br><span>Win €250 in free SEO services.</span></h1>
  <p>Talk to Otto, share your link, climb the leaderboard. The top 3 referrers this month win a complete SEO audit package — delivered personally by Ottmar.</p>
  <div class="prize-banner">
    <div class="prize-amount">€250</div>
    <div class="prize-label">
      <strong>Free SEO Audit Package</strong>
      <span>Valued at €250 · Delivered within 5 business days</span>
    </div>
  </div>
</div>

<div class="page">

  <!-- Countdown -->
  <div class="countdown-wrap">
    <div class="countdown-title">Resets in</div>
    <div class="countdown">
      <div class="cd-unit"><div class="cd-num" id="cd-d">--</div><div class="cd-lbl">Days</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cd-h">--</div><div class="cd-lbl">Hours</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cd-m">--</div><div class="cd-lbl">Min</div></div>
      <div class="cd-sep">:</div>
      <div class="cd-unit"><div class="cd-num" id="cd-s">--</div><div class="cd-lbl">Sec</div></div>
    </div>
  </div>

  <!-- What you get -->
  <div class="what-you-get">
    <div class="section-title">What winners receive</div>
    <h2>The Complete SEO Audit Package</h2>
    <p class="sub">Everything you need to recover lost traffic and understand exactly what Google — and AI — thinks of your content.</p>

    <div class="deliverable">
      <div class="del-icon green">📊</div>
      <div class="del-body">
        <h3>GSC Data Analysis + Opportunity Report</h3>
        <p>Your Google Search Console data analyzed by the PULSE+NEXUS audit framework. We identify pages losing traffic, pages close to ranking, and untapped keyword opportunities hiding in your data.</p>
        <div class="del-tags">
          <span class="tag">Google Search Console</span>
          <span class="tag">PULSE Framework</span>
          <span class="tag">NEXUS Framework</span>
          <span class="tag">Traffic Recovery Map</span>
        </div>
      </div>
      <span class="value-badge">€75 value</span>
    </div>

    <div class="deliverable">
      <div class="del-icon blue">🔬</div>
      <div class="del-body">
        <h3>Full SEO Content Scan — GRAAF Framework</h3>
        <p>Your top-performing page scanned against the GRAAF Framework: Genuinely Credible, Relevant, Actionable, Accurate, Fresh. You receive a ContentScore (0–100) with a breakdown of exactly what's missing and why Google or AI may be ignoring your content.</p>
        <div class="del-tags">
          <span class="tag">GRAAF Framework</span>
          <span class="tag">ContentScore 0–100</span>
          <span class="tag">E-E-A-T Analysis</span>
          <span class="tag">AI Visibility Check</span>
        </div>
      </div>
      <span class="value-badge">€75 value</span>
    </div>

    <div class="deliverable">
      <div class="del-icon purple">✍️</div>
      <div class="del-body">
        <h3>2 Pages Fully Rewritten to 90+ ContentScore</h3>
        <p>Two of your pages rewritten using GRAAF principles — adding credibility signals, direct answers, stats, expert structure, and schema-ready content. Delivered with before/after ContentScore comparison so you can see the measurable improvement.</p>
        <div class="del-tags">
          <span class="tag">2 Full Page Rewrites</span>
          <span class="tag">Before / After Score</span>
          <span class="tag">Schema-ready</span>
          <span class="tag">90+ Target Score</span>
        </div>
      </div>
      <span class="value-badge">€80 value</span>
    </div>

    <div class="deliverable">
      <div class="del-icon amber">🗺️</div>
      <div class="del-body">
        <h3>Priority Action Plan + Audit Workflow Export</h3>
        <p>A prioritized list of every page that needs attention, ranked by traffic potential. Includes a full audit workflow export you can use immediately — covering pre-scan, implementation checklist, and post-scan tracking.</p>
        <div class="del-tags">
          <span class="tag">Audit Workflow</span>
          <span class="tag">Priority Ranking</span>
          <span class="tag">90-Day Roadmap</span>
          <span class="tag">Implementation Checklist</span>
        </div>
      </div>
      <span class="value-badge">€20 value</span>
    </div>
  </div>

  <!-- Total bar -->
  <div class="total-bar">
    <div>
      <div class="lbl">Total package value</div>
      <div class="val">€250</div>
    </div>
    <div style="text-align:right">
      <div class="free">You pay: €0</div>
      <div class="lbl" style="margin-top:2px">Delivered within 5 business days of winning</div>
    </div>
  </div>

  <!-- How to win -->
  <div class="how-to-win">
    <div class="section-title">How to win</div>
    <div class="steps">
      <div class="step-card">
        <div class="step-num">1</div>
        <div class="step-text">
          <strong>Talk to Otto</strong>
          <span>Open the Otto AI widget and have a conversation — app.contentscale.site/otto</span>
        </div>
      </div>
      <div class="step-card">
        <div class="step-num">2</div>
        <div class="step-text">
          <strong>Get your referral link</strong>
          <span>After the conversation your personal link appears — share it to earn points</span>
        </div>
      </div>
      <div class="step-card">
        <div class="step-num">3</div>
        <div class="step-text">
          <strong>Share with your network</strong>
          <span>WhatsApp, LinkedIn, email — every click and conversation earns you points</span>
        </div>
      </div>
      <div class="step-card">
        <div class="step-num">4</div>
        <div class="step-text">
          <strong>Climb the leaderboard</strong>
          <span>Top 3 at end of month win the €250 package — leaderboard resets monthly</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Points -->
  <div class="section-title">Points per action</div>
  <div class="points-grid" style="margin-bottom:40px">
    <div class="pt-card c1"><div class="num">+1</div><div class="lbl">Someone clicks your link</div></div>
    <div class="pt-card c2"><div class="num">+3</div><div class="lbl">They talk to Otto</div></div>
    <div class="pt-card c3"><div class="num">+5</div><div class="lbl">They share further</div></div>
    <div class="pt-card c4"><div class="num">+10</div><div class="lbl">They become a client</div></div>
  </div>

  <!-- Claim form -->
  <div class="form-section" id="claimForm">
    <div class="section-title">Already a winner?</div>
    <h2>Claim your prize</h2>
    <p class="sub">Fill in your details so Ottmar can deliver your audit package within 5 business days.</p>

    <div class="field-row">
      <div class="field">
        <label>First name</label>
        <input type="text" id="f-name" placeholder="Your name" required>
      </div>
      <div class="field">
        <label>Email address</label>
        <input type="email" id="f-email" placeholder="you@company.com" required>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Website URL</label>
        <input type="url" id="f-url" placeholder="https://yoursite.com">
      </div>
      <div class="field">
        <label>Your referral code</label>
        <input type="text" id="f-ref" placeholder="REF-ABC123">
      </div>
    </div>

    <div class="field">
      <label>Which page should we audit first?</label>
      <input type="url" id="f-page" placeholder="https://yoursite.com/your-best-page">
    </div>

    <div class="field">
      <label>Do you have Google Search Console access?</label>
      <select id="f-gsc">
        <option value="">Select...</option>
        <option value="yes">Yes — I can export GSC data</option>
        <option value="no">No — but I want to learn how</option>
        <option value="help">I need help setting it up</option>
      </select>
    </div>

    <div class="field">
      <label>Anything specific you want us to focus on?</label>
      <textarea id="f-notes" placeholder="E.g. traffic dropped after March 2025 update, or we lost rankings for our main keyword..."></textarea>
    </div>

    <button class="submit-btn" onclick="submitClaim()">Claim My €250 Prize Package</button>
    <div class="success-msg" id="successMsg">Your claim has been submitted! Ottmar will contact you within 24 hours to get started.</div>
    <p class="form-note">By submitting you agree that ContentScale may contact you regarding your audit.<br>Your data is never shared with third parties.</p>
  </div>

  <div style="text-align:center;padding-bottom:40px">
    <a href="https://app.contentscale.site/otto" style="display:inline-block;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#4ade80;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:12px">Talk to Otto — Start Earning Points</a>
    <br>
    <a href="https://app.contentscale.site/otto/leaderboard" style="font-size:12px;color:#6b7280;text-decoration:none">View the leaderboard →</a>
  </div>

</div>

<div style="background:#0d1117;border-top:1px solid rgba(255,255,255,.06);padding:32px 24px;text-align:center">
  <div style="max-width:800px;margin:0 auto">
    <a href="https://contentscale.site" style="text-decoration:none">
      <div style="font-size:18px;font-weight:900;letter-spacing:.06em;background:linear-gradient(90deg,#4ade80,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px">ContentScale</div>
    </a>
    <div style="font-size:12px;color:#374151;margin-bottom:16px">Search Architecture · SEO Systems · AI Workflows · Amsterdam</div>
    <div style="display:flex;justify-content:center;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:20px">
      <a href="https://contentscale.site" style="font-size:12px;color:#4b5563;text-decoration:none">ContentScale.site</a>
      <span style="color:#1f2937">·</span>
      <a href="https://contentscale.site/privacy-policy/" style="font-size:12px;color:#4b5563;text-decoration:none">Privacy Policy</a>
      <span style="color:#1f2937">·</span>
      <a href="https://contentscale.site/terms/" style="font-size:12px;color:#4b5563;text-decoration:none">Terms</a>
      <span style="color:#1f2937">·</span>
      <a href="https://contentscale.site/privacy-policy/#data-requests" style="font-size:12px;color:#4b5563;text-decoration:none">Data Requests</a>
    </div>
    <a href="https://wa.me/31628073996?text=Hi Ottmar! I have a question about the ContentScale prize." target="_blank"
      style="display:inline-flex;align-items:center;gap:8px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.25);color:#25d366;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.3-.7-.5-.6-.7-.6h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1-1.1 2.5s1.1 2.9 1.3 3.1c.1.2 2.2 3.4 5.4 4.7.8.3 1.4.5 1.8.6.8.2 1.5.2 2 .1.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.2.2-1.4l-.5-.2z"/></svg>
      Questions? WhatsApp Ottmar
    </a>
    <div style="font-size:10px;color:#1f2937;margin-top:20px">
      © 2026 ContentScale · Prizes are awarded monthly to top 3 referrers · No purchase necessary · ContentScale reserves the right to modify or cancel the prize program at any time.
    </div>
  </div>
</div>

<script>
// Countdown
function updateCountdown() {
  var now = new Date();
  var end = new Date(now.getFullYear(), now.getMonth()+1, 1);
  var diff = end - now;
  if (diff < 0) return;
  var d = Math.floor(diff/86400000);
  var h = Math.floor((diff%86400000)/3600000);
  var m = Math.floor((diff%3600000)/60000);
  var sec = Math.floor((diff%60000)/1000);
  document.getElementById('cd-d').textContent = String(d).padStart(2,'0');
  document.getElementById('cd-h').textContent = String(h).padStart(2,'0');
  document.getElementById('cd-m').textContent = String(m).padStart(2,'0');
  document.getElementById('cd-s').textContent = String(sec).padStart(2,'0');
}
updateCountdown();
setInterval(updateCountdown, 1000);

// Pre-fill ref code from URL
var refParam = new URLSearchParams(location.search).get('ref');
if (refParam) document.getElementById('f-ref').value = refParam;

// Submit
function submitClaim() {
  var name = document.getElementById('f-name').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var url = document.getElementById('f-url').value.trim();
  var ref = document.getElementById('f-ref').value.trim();
  if (!name || !email) { alert('Please fill in your name and email.'); return; }

  // Send to server
  fetch('https://app.contentscale.site/api/otto/claim-prize', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      name, email,
      website: url,
      refCode: ref,
      page: document.getElementById('f-page').value.trim(),
      gscAccess: document.getElementById('f-gsc').value,
      notes: document.getElementById('f-notes').value.trim()
    })
  }).then(function(r) { return r.json(); }).then(function() {
    document.getElementById('claimForm').style.opacity = '.4';
    document.getElementById('claimForm').style.pointerEvents = 'none';
    document.getElementById('successMsg').style.display = 'block';
  }).catch(function() {
    // Fallback — still show success (email via mailto)
    window.location.href = 'mailto:ottmar@contentscale.site?subject=Prize Claim - ' + ref + '&body=Name: ' + name + '%0AEmail: ' + email + '%0AWebsite: ' + url;
  });
}
</script>
</body>
</html>
`;

app.get('/prize', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(_PRIZE_HTML);
});

app.post('/api/otto/claim-prize', async (req, res) => {
  const { name, email, website, refCode, page, gscAccess, notes } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  try {
    // Save claim to DB
    await pool.query(
      `CREATE TABLE IF NOT EXISTS prize_claims (
        id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255),
        website TEXT, ref_code VARCHAR(50), page_to_audit TEXT,
        gsc_access VARCHAR(50), notes TEXT, created_at TIMESTAMP DEFAULT NOW()
      )`
    );
    await pool.query(
      'INSERT INTO prize_claims (name, email, website, ref_code, page_to_audit, gsc_access, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [name, email, website||'', refCode||'', page||'', gscAccess||'', notes||'']
    );
    console.log('[prize] New claim:', name, email, refCode);
    res.json({ ok: true });
  } catch(e) {
    console.error('[prize] claim error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/otto/prize-claims', async (req, res) => {
  if (req.query.token !== 'ottmar2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    const r = await pool.query('SELECT * FROM prize_claims ORDER BY created_at DESC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Favicon — served inline, no file needed ───────────────────────────────
const _FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#060910"/><text x="16" y="22" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="18" font-weight="900" fill="#4ade80">CS</text></svg>`;

// favicon routes moved above express.static


startServer();

































