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

app.get('/audit-seo', (req, res) => res.redirect(301, '/seo-audit'));
app.get('/audit',     (req, res) => res.redirect(301, '/seo-audit'));
app.get('/audit-intake',          servePublic('audit-intake.html'));
app.get('/audit-workflow', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>SEO Audit Workflow Manager | ContentScale</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#030712;--card:#0f172a;--surface:#1e293b;--border:#334155;
  --ink:#f9fafb;--muted:#94a3b8;--sub:#64748b;--dim:#475569;
  --purple:#a78bfa;--blue:#60a5fa;--green:#4ade80;--orange:#fb923c;
  --amber:#f59e0b;--red:#f43f3f;--gold:#fbbf24;
}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',sans-serif;min-height:100vh;line-height:1.5;}
.wrap{max-width:1300px;margin:0 auto;padding:0 20px 80px;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:18px;flex-wrap:wrap;gap:10px;}
.brand{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.06em;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-decoration:none;}
.tool-title{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.04em;background:linear-gradient(90deg,var(--gold),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.topbar-right{display:flex;gap:7px;flex-wrap:wrap;}
.btn{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:7px 13px;border-radius:5px;cursor:pointer;border:1px solid;transition:all .15s;white-space:nowrap;background:none;}
.btn-gold{background:var(--gold)!important;color:#000!important;border-color:var(--gold)!important;}
.btn-gold:hover{opacity:.85;}
.btn-green{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.3);color:var(--green);}
.btn-green:hover{background:var(--green);color:#000;}
.btn-blue{background:rgba(96,165,250,.1);border-color:rgba(96,165,250,.3);color:var(--blue);}
.btn-blue:hover{background:var(--blue);color:#000;}
.btn-purple{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3);color:var(--purple);}
.btn-purple:hover{background:var(--purple);color:#000;}
.btn-red{background:rgba(244,63,63,.08);border-color:rgba(244,63,63,.25);color:var(--red);}
.btn-red:hover{background:var(--red);color:#fff;}
.btn-muted{background:var(--surface);border-color:var(--border);color:var(--muted);}
.btn-muted:hover{color:var(--ink);}
.btn-sm{padding:4px 10px;font-size:8px;}

/* Project bar */
.project-bar{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;}
.pf{flex:1;min-width:130px;}
.pf label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--sub);display:block;margin-bottom:5px;}
.pf input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px 11px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);outline:none;}
.pf input:focus{border-color:var(--gold);}

/* Overview */
.overview{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px;}
@media(max-width:700px){.overview{grid-template-columns:repeat(3,1fr);}}
.ov{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;text-align:center;}
.ov-n{font-family:'Bebas Neue',sans-serif;font-size:32px;line-height:1;margin-bottom:3px;}
.ov-l{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);}
.prog-wrap{background:var(--surface);border-radius:3px;height:4px;overflow:hidden;margin-top:6px;}
.prog-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--green));border-radius:3px;transition:width .4s;}

/* Add panel */
.add-panel{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:14px;}
.add-panel-title{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--sub);margin-bottom:10px;}
.add-row{display:flex;gap:7px;flex-wrap:wrap;}
.add-row input,.add-row select{background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:9px 11px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink);outline:none;}
.add-row input:focus,.add-row select:focus{border-color:var(--gold);}
.add-row select option{background:var(--card);}
.ai-url{flex:3;min-width:180px;}
.ai-kw{flex:2;min-width:140px;}
.ai-pos{width:90px;}
.ai-impr{width:90px;}
.bulk-area{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:9px 11px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink);outline:none;min-height:60px;resize:vertical;margin-top:8px;}
.bulk-area:focus{border-color:var(--gold);}

/* Filter bar */
.filter-bar{display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}
.filter-bar select,.filter-bar input{background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:6px 10px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.06em;color:var(--muted);outline:none;}
.filter-bar input{text-transform:none;font-size:12px;}
.filter-bar input:focus,.filter-bar select:focus{border-color:var(--gold);color:var(--ink);}

/* Page cards */
.pages-list{display:flex;flex-direction:column;gap:8px;}
.page-card{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.page-card.s-done{border-left:3px solid var(--green);}
.page-card.s-inprogress{border-left:3px solid var(--gold);}
.page-card.s-notstarted{border-left:3px solid var(--dim);}
.page-card.s-followup{border-left:3px solid var(--purple);}
.page-card.s-blocked{border-left:3px solid var(--red);}

.card-head{display:flex;align-items:center;gap:9px;padding:11px 15px;cursor:pointer;user-select:none;}
.card-head:hover{background:rgba(255,255,255,.02);}
.card-rank{font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--dim);width:26px;text-align:center;flex-shrink:0;}
.pri-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.pri-high{background:var(--red);}
.pri-med{background:var(--gold);}
.pri-low{background:var(--green);}
.card-url{flex:1;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--blue);word-break:break-all;line-height:1.4;}
.card-kw{font-size:11px;color:var(--muted);margin-left:4px;}
.card-gsc{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--dim);white-space:nowrap;}
.card-chk{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--gold);white-space:nowrap;}
.status-btn{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid;white-space:nowrap;}
.s-notstarted .status-btn{background:rgba(71,85,105,.2);color:var(--sub);border-color:var(--border);}
.s-inprogress .status-btn{background:rgba(251,191,36,.1);color:var(--gold);border-color:rgba(251,191,36,.3);}
.s-done .status-btn{background:rgba(74,222,128,.1);color:var(--green);border-color:rgba(74,222,128,.3);}
.s-followup .status-btn{background:rgba(167,139,250,.1);color:var(--purple);border-color:rgba(167,139,250,.3);}
.s-blocked .status-btn{background:rgba(244,63,63,.1);color:var(--red);border-color:rgba(244,63,63,.3);}
.chevron{color:var(--dim);font-size:11px;transition:transform .2s;flex-shrink:0;}
.chevron.open{transform:rotate(180deg);}

.card-body{display:none;padding:14px 15px;border-top:1px solid var(--border);}
.card-body.open{display:block;}
.cb-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
@media(max-width:600px){.cb-grid{grid-template-columns:1fr;}}
.cb-field label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--sub);display:block;margin-bottom:5px;}
.cb-field input,.cb-field select,.cb-field textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px 10px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);outline:none;resize:vertical;}
.cb-field textarea{min-height:60px;font-size:12px;}
.cb-field input:focus,.cb-field select:focus,.cb-field textarea:focus{border-color:var(--gold);}
.cb-field select option{background:var(--card);}

/* Checklist */
.cl-header{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--sub);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;}
.cl-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:12px;}
@media(max-width:600px){.cl-grid{grid-template-columns:1fr;}}
.cl-item{display:flex;align-items:center;gap:7px;padding:6px 9px;background:rgba(255,255,255,.015);border-radius:4px;cursor:pointer;user-select:none;}
.cl-item:hover{background:rgba(255,255,255,.04);}
.cl-item input[type=checkbox]{width:13px;height:13px;accent-color:var(--green);cursor:pointer;flex-shrink:0;}
.cl-item label{font-size:11px;color:var(--muted);cursor:pointer;flex:1;line-height:1.3;}
.cl-item.checked label{color:var(--green);text-decoration:line-through;opacity:.55;}
.cl-cat{font-family:'IBM Plex Mono',monospace;font-size:7px;letter-spacing:.05em;text-transform:uppercase;padding:1px 5px;border-radius:3px;flex-shrink:0;}
.cat-audit{background:rgba(251,191,36,.12);color:var(--gold);}
.cat-content{background:rgba(167,139,250,.12);color:var(--purple);}
.cat-technical{background:rgba(96,165,250,.12);color:var(--blue);}
.cat-authority{background:rgba(74,222,128,.12);color:var(--green);}

.card-actions{display:flex;gap:5px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border);}

/* Empty */
.empty{text-align:center;padding:50px 20px;color:var(--dim);}
.empty h3{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:.04em;margin-bottom:6px;color:var(--sub);}

.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--gold);color:#000;padding:9px 20px;border-radius:50px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;opacity:0;transition:all .3s;z-index:10000;pointer-events:none;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
#importInput{display:none;}

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

<div class="topbar">
  <a href="https://contentscale.site" class="brand">ContentScale</a>
  <div class="tool-title">SEO AUDIT WORKFLOW MANAGER</div>
  <div class="topbar-right">
    <button class="btn btn-gold" onclick="document.getElementById('gscImportInput').click()">📊 Import GSC CSV (Pages + Queries)</button>
    <button class="btn btn-purple" onclick="scanAllScores()">⚡ Auto-Score All</button>
    <button class="btn btn-green" onclick="exportCSV()">↓ Export CSV</button>
    <button class="btn btn-purple" onclick="syncToServer()" id="syncBtn" title="Save to server — accessible from any device">☁ Save to Server</button>
    <button class="btn btn-muted" onclick="loadFromServer()" title="Load from server">↓ Load from Server</button>
    <button class="btn btn-blue" onclick="document.getElementById('importInput').click()">↑ Import Progress</button>
    <button class="btn btn-purple" onclick="exportClientReport()">📄 Client Report</button>
    <a href="/audit-recommendations" class="btn btn-gold">🎯 Recommendations</a>
    <button class="btn btn-red" onclick="clearAll()">✕ Clear</button>
    <button class="btn btn-muted" onclick="cleanBadPages()" title="Remove invalid entries (queries, keywords) from the list">🧹 Clean up</button>
    <button class="btn btn-muted" onclick="mergeDuplicatePages()" title="Merge duplicate URLs into one entry">🔀 Merge dupes</button>
    <button class="btn btn-red btn-sm" id="bulkDeleteBtn" onclick="bulkDeleteSelected()" style="display:none">🗑 Delete selected (<span id="bulkCount">0</span>)</button>
    <button class="btn btn-muted btn-sm" id="bulkSelectAllBtn" onclick="bulkSelectAll()" style="display:none">✓ Select all</button>
    <button class="btn btn-muted" onclick="selectAllPages()" title="Select all visible pages for bulk actions">☑ Select all</button>
    <input type="file" id="importInput" accept=".csv" onchange="importCSV(this)">
    <input type="file" id="gscImportInput" accept=".csv" multiple onchange="importGSC(this)">
  </div>
</div>

<div id="syncStatus" style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);text-align:right;margin-bottom:6px;"></div>
<div class="project-bar">
  <div class="pf"><label>Client / Project</label><input id="pClient" placeholder="ContentScale.site" oninput="save()"></div>
  <div class="pf" style="flex:2"><label>Website</label><input id="pSite" placeholder="https://contentscale.site" oninput="save()"></div>
  <div class="pf"><label>Deadline</label><input type="date" id="pDeadline" oninput="save()"></div>
  <div class="pf"><label>Auditor</label><input id="pAuditor" placeholder="Ottmar" oninput="save()"></div>
</div>

<div class="overview">
  <div class="ov"><div class="ov-n" id="ovTotal" style="color:var(--blue)">0</div><div class="ov-l">Total</div></div>
  <div class="ov"><div class="ov-n" id="ovNotStarted" style="color:var(--dim)">0</div><div class="ov-l">Not Started</div></div>
  <div class="ov"><div class="ov-n" id="ovInProgress" style="color:var(--gold)">0</div><div class="ov-l">In Progress</div></div>
  <div class="ov"><div class="ov-n" id="ovDone" style="color:var(--green)">0</div><div class="ov-l">Done</div></div>
  <div class="ov"><div class="ov-n" id="ovFollowup" style="color:var(--purple)">0</div><div class="ov-l">Follow-up</div></div>
  <div class="ov"><div class="ov-n" id="ovPct" style="color:var(--gold)">0%</div><div class="ov-l">Complete</div><div class="prog-wrap"><div class="prog-fill" id="ovBar" style="width:0%"></div></div></div>
</div>

<div class="add-panel">
  <div class="add-panel-title">Add Pages to Audit Queue</div>

  <!-- Single URL row -->
  <div class="add-row">
    <input class="ai-url" id="newUrl" placeholder="https://site.com/page" onkeydown="if(event.key==='Enter')addPage()">
    <input class="ai-kw" id="newKw" placeholder="Primary keyword" onkeydown="if(event.key==='Enter')addPage()">
    <select id="newPri"><option value="high">🔴 High</option><option value="med" selected>🟡 Medium</option><option value="low">🟢 Low</option></select>
    <input class="ai-pos" id="newPos" type="number" placeholder="Position" min="1" max="200">
    <input class="ai-impr" id="newImpr" type="number" placeholder="Impressions">
    <button class="btn btn-gold" onclick="addPage()">+ Add</button>
  </div>

  <!-- Sitemap fetch -->
  <div style="margin-top:12px;padding:14px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.2);border-radius:8px;">
    <div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--blue);margin-bottom:8px;">🗺 Import Sitemap</div>
    <div class="add-row" style="flex-wrap:wrap;">
      <input id="sitemapUrl" placeholder="https://contentscale.site/sitemap.xml" style="flex:1;min-width:220px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:9px 11px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink);outline:none;" onkeydown="if(event.key==='Enter')fetchSitemap()">
      <button class="btn btn-blue" onclick="fetchSitemap()" id="sitemapBtn">↓ Fetch Sitemap</button>
    </div>
    <div id="sitemapStatus" style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--muted);margin-top:6px;"></div>

    <!-- Sitemap preview + filter -->
    <div id="sitemapPreview" style="display:none;margin-top:12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <input id="sitemapFilter" placeholder="Filter by path... e.g. /blog or /services" oninput="filterSitemapUrls()"
          style="flex:1;min-width:160px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:7px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink);outline:none;">
        <button class="btn btn-gold btn-sm" onclick="filterSitemapByGSC()" title="Show only sitemap URLs that are also in your GSC data">🔗 Filter by GSC</button>
        <button class="btn btn-muted btn-sm" onclick="selectAllSitemap()">✓ All</button>
        <button class="btn btn-muted btn-sm" onclick="deselectAllSitemap()">✕ None</button>
        <span id="sitemapSelCount" style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--muted);"></span>
      </div>
      <div id="sitemapUrlList" style="max-height:280px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px;"></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-gold" onclick="addSelectedSitemapUrls()">+ Add selected to queue</button>
        <button class="btn btn-red btn-sm" onclick="deleteSelectedSitemapUrls()" title="Remove selected URLs from list">🗑 Delete selected</button>
        <button class="btn btn-muted btn-sm" onclick="clearAllSitemapUrls()" title="Remove all URLs from list">✕ Clear all</button>
        <button class="btn btn-muted" onclick="document.getElementById('sitemapPreview').style.display='none'">✕ Close</button>
      </div>
    </div>
  </div>

  <!-- Bulk paste -->
  <div style="margin-top:10px;">
    <div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--sub);margin-bottom:6px;">📋 Bulk Paste</div>
    <textarea class="bulk-area" id="bulkArea" placeholder="Paste multiple URLs (één per line) — werkt met sitemap exports, GSC lijsten, etc."></textarea>
    <div style="display:flex;gap:8px;margin-top:7px;align-items:center;">
      <button class="btn btn-muted" onclick="bulkAdd()">+ Bulk Add</button>
      <span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--dim);">One URL per line</span>
    </div>
  </div>
</div>

<div class="filter-bar">
  <select id="fStatus" onchange="renderPages()">
    <option value="all">All statuses</option>
    <option value="notstarted">Not Started</option>
    <option value="inprogress">In Progress</option>
    <option value="done">Done</option>
    <option value="followup">Follow-up</option>
    <option value="blocked">Blocked</option>
  </select>
  <select id="fPri" onchange="renderPages()">
    <option value="all">All priorities</option>
    <option value="high">🔴 High</option>
    <option value="med">🟡 Medium</option>
    <option value="low">🟢 Low</option>
  </select>
  <select id="fSort" onchange="renderPages()">
    <option value="priority">Sort: Priority</option>
    <option value="position">Sort: GSC Position</option>
    <option value="impressions">Sort: Impressions</option>
    <option value="checklist">Sort: Checklist %</option>
    <option value="status">Sort: Status</option>
  </select>
  <input id="fSearch" placeholder="Search URL or keyword..." oninput="renderPages()" style="flex:1;min-width:150px;">
</div>

<div id="bulkBar" style="display:none;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:8px 14px;margin-bottom:8px;display:none;align-items:center;gap:10px;flex-wrap:wrap;">
  <span id="bulkCount" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--red);font-weight:700;">0 selected</span>
  <button class="btn btn-red btn-sm" onclick="deleteSelectedPages()">🗑 Delete selected</button>
  <button class="btn btn-muted btn-sm" onclick="deselectAllPages()">✕ Deselect all</button>
</div>

<div class="pages-list" id="pagesList"></div>
</div>
<div class="toast" id="toast"></div>

<script>
var AUDIT_URL = 'https://app.contentscale.site/audit-seo';
var pages = [];
var project = {};

// points: true = adds ContentScore points, false = UX/CTR only (no score change)
var CL = [
  // ── PHASE 1: Pre-audit (geen score impact)
  {id:'scan_before', label:'① Step 1 — Pre-scan done (Scan Score recorded)',    cat:'phase1', points:false, phase:1, tip:'FIRST: Click the 📊 Scan Score button below — this records your starting score before any changes'},
  {id:'pulse',       label:'② Step 2 — PULSE+NEXUS audit done',                  cat:'phase1', points:false, phase:1, tip:'Click 🔬 Open in PULSE+NEXUS → run the full SEO audit → note all findings before making changes'},
  {id:'gsc_check',   label:'③ Step 3 — GSC data recorded',                        cat:'phase1', points:false, phase:1, tip:'Import your Google Search Console CSV via the 📊 Import GSC CSV button at the top of the page'},

  // ── PHASE 2: Implementatie — PUNTEN (score gaat omhoog)
  {id:'wordcount',   label:'② Words added (min 1500)',             cat:'phase2', points:true,  phase:2},
  {id:'stats',       label:'② Stats added (2025-2026, 8+)',          cat:'phase2', points:true,  phase:2},
  {id:'expert',      label:'② Expert quotes added (3-5)',            cat:'phase2', points:true,  phase:2},
  {id:'faq',         label:'② FAQ section added/expanded',          cat:'phase2', points:true,  phase:2},
  {id:'casestudy',   label:'② Case study with metrics added',         cat:'phase2', points:true,  phase:2},
  {id:'direct_ans',  label:'② Direct Answer (40-80w) after H1 added',  cat:'phase2', points:true,  phase:2},
  {id:'tldr',        label:'② Key Takeaways / TL;DR added',          cat:'phase2', points:true,  phase:2},
  {id:'listcount',   label:'② Bullet/numbered lists expanded (15+)',cat:'phase2', points:true,  phase:2},
  {id:'authorbio',   label:'② Author bio with credentials added',     cat:'phase2', points:true,  phase:2},
  {id:'schema_a',    label:'② Article schema JSON-LD added',         cat:'phase2', points:true,  phase:2},
  {id:'schema_f',    label:'② FAQPage schema JSON-LD added',         cat:'phase2', points:true,  phase:2},
  {id:'intlinks',    label:'② Internal links added (3-5)',             cat:'phase2', points:true,  phase:2},
  {id:'extlinks',    label:'② Externe links autoritatief (2-3)',           cat:'phase2', points:true,  phase:2},
  {id:'eeat',        label:'② E-E-A-T signals strengthened',                cat:'phase2', points:true,  phase:2},

  // ── PHASE 2: UX/CTR fixes — NO score points, but important
  {id:'h1',          label:'② H1 optimised',                        cat:'phase2_ctr', points:false, phase:2},
  {id:'h2',          label:'② H2 structure revised',                      cat:'phase2_ctr', points:false, phase:2},
  {id:'title',       label:'② SEO title herschreven (50-60 chars)',       cat:'phase2_ctr', points:false, phase:2},
  {id:'meta',        label:'② Meta description herschreven (150-160)',    cat:'phase2_ctr', points:false, phase:2},
  {id:'canonical',   label:'② Canonical tag checked',               cat:'phase2_ctr', points:false, phase:2},
  {id:'alt',         label:'② Image alt text complete',             cat:'phase2_ctr', points:false, phase:2},
  {id:'cta',         label:'② CTA optimised for conversion goal',    cat:'phase2_ctr', points:false, phase:2},

  // ── PHASE 3: Live zetten + nascan
  {id:'publish',     label:'③ Page published + timestamp refreshed', cat:'phase3', points:false, phase:3},
  {id:'reindex',     label:'③ GSC reindex requested',                   cat:'phase3', points:false, phase:3},
  {id:'scan_after',  label:'③ Post-scan done (final score recorded)',      cat:'phase3', points:false, phase:3},
  {id:'recheck',     label:'③ GSC recheck scheduled (14 days)',          cat:'phase3', points:false, phase:3},
];

var STATUS_ORDER = ['notstarted','inprogress','followup','blocked','done'];
var STATUS_LABELS = {notstarted:'Not Started',inprogress:'In Progress',done:'Done',followup:'Follow-up',blocked:'Blocked'};
var PRI_ORDER = {high:0,med:1,low:2};

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,5); }

function toast(msg,dur){
  var t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},dur||2500);
}

function save(){
  project.client   = document.getElementById('pClient').value;
  project.site     = document.getElementById('pSite').value;
  project.deadline = document.getElementById('pDeadline').value;
  project.auditor  = document.getElementById('pAuditor').value;
  try{localStorage.setItem('cs_wf_proj',JSON.stringify(project));}catch(e){}
  try{localStorage.setItem('cs_wf_pages',JSON.stringify(pages));}catch(e){}
}

function load(){
  try{var p=localStorage.getItem('cs_wf_proj');if(p)project=JSON.parse(p);}catch(e){}
  try{var pg=localStorage.getItem('cs_wf_pages');if(pg)pages=JSON.parse(pg);}catch(e){}
  if(project.client)  document.getElementById('pClient').value=project.client;
  if(project.site)    document.getElementById('pSite').value=project.site;
  if(project.deadline)document.getElementById('pDeadline').value=project.deadline;
  if(project.auditor) document.getElementById('pAuditor').value=project.auditor;
}

function makePage(url,kw,pri,pos,impr){
  var checks={};
  CL.forEach(function(c){checks[c.id]=false;});
  return {id:uid(),url:url,keyword:kw||'',priority:pri||'med',
    position:parseFloat(pos)||0,impressions:parseInt(impr)||0,
    status:'notstarted',scoreBefore:'',scoreAfter:'',notes:'',deadline:'',
    checks:checks,created:new Date().toISOString(),updated:new Date().toISOString()};
}

function updateBulkCount(){
  var checked = document.querySelectorAll('.page-bulk-cb:checked');
  var bar = document.getElementById('bulkBar');
  if (!bar) return;
  if(checked.length > 0){
    bar.style.display = 'flex';
    document.getElementById('bulkCount').textContent = checked.length + ' selected';
  } else {
    bar.style.display = 'none';
  }
}

function selectAllPages(){
  document.querySelectorAll('.page-bulk-cb').forEach(function(cb){ cb.checked = true; });
  updateBulkCount();
}

function deselectAllPages(){
  document.querySelectorAll('.page-bulk-cb').forEach(function(cb){ cb.checked = false; });
  updateBulkCount();
}

function deleteSelectedPages(){
  var ids = Array.from(document.querySelectorAll('.page-bulk-cb:checked')).map(function(cb){ return cb.dataset.id; });
  if(!ids.length){ toast('No pages selected'); return; }
  if(!confirm('Delete ' + ids.length + ' selected pages?')) return;
  pages = pages.filter(function(p){ return !ids.includes(p.id); });
  save(); renderPages(); renderOverview();
  document.getElementById('bulkBar').style.display = 'none';
  toast('🗑 ' + ids.length + ' pages deleted');
}



function bulkSelectAll(){
  var cbs = document.querySelectorAll('.page-bulk-cb');
  var allChecked = Array.from(cbs).every(function(cb){ return cb.checked; });
  cbs.forEach(function(cb){ cb.checked = !allChecked; });
  updateBulkCount();
}

function bulkDeleteSelected(){
  var selected = Array.from(document.querySelectorAll('.page-bulk-cb:checked')).map(function(cb){ return cb.dataset.id; });
  if(!selected.length){ toast('⚠ No pages selected'); return; }
  if(!confirm('Delete ' + selected.length + ' selected pages from the queue?')) return;
  pages = pages.filter(function(p){ return !selected.includes(p.id); });
  save(); renderPages(); renderOverview();
  updateBulkCount();
  toast('🗑 ' + selected.length + ' pages deleted');
}

function cleanBadPages(){
  var before = pages.length;
  // Remove invalid URLs
  pages = pages.filter(function(p){
    if(!p.url) return false;
    if(!p.url.startsWith('http') && !p.url.startsWith('/')) return false;
    if(p.url.includes('-site:') || p.url.includes(' ')) return false;
    return true;
  });
  // Remove duplicates — keep first occurrence per URL
  var seen = {};
  pages = pages.filter(function(p){
    if(seen[p.url]) return false;
    seen[p.url] = true;
    return true;
  });
  var removed = before - pages.length;
  if(removed > 0){
    save(); renderPages(); renderOverview();
    toast('🧹 Removed ' + removed + ' invalid/duplicate entries');
  } else {
    toast('✓ No invalid or duplicate entries found');
  }
}

function addPage(){
  var url=document.getElementById('newUrl').value.trim();
  if(!url){toast('⚠ Enter a URL');return;}
  if(!url.startsWith('http'))url='https://'+url;
  pages.push(makePage(url,
    document.getElementById('newKw').value.trim(),
    document.getElementById('newPri').value,
    document.getElementById('newPos').value,
    document.getElementById('newImpr').value));
  document.getElementById('newUrl').value='';
  document.getElementById('newKw').value='';
  document.getElementById('newPos').value='';
  document.getElementById('newImpr').value='';
  save();renderPages();renderOverview();toast('✅ Page added');
}

function bulkAdd(){
  var raw=document.getElementById('bulkArea').value.trim();
  if(!raw){toast('⚠ Paste URLs first');return;}
  var lines=raw.split('\\n').map(function(l){return l.trim();}).filter(function(l){return l.includes('.');});
  var added=0;
  lines.forEach(function(l){
    var url=l.startsWith('http')?l:'https://'+l;
    pages.push(makePage(url,'','med',0,0));added++;
  });
  document.getElementById('bulkArea').value='';
  save();renderPages();renderOverview();toast('✅ '+added+' pages added');
}

function deletePage(id){
  if(!confirm('Delete this page?'))return;
  pages=pages.filter(function(p){return p.id!==id;});
  save();renderPages();renderOverview();toast('Deleted');
}

function clearAll(){
  if(!confirm('Clear ALL pages? Cannot be undone.'))return;
  pages=[];save();renderPages();renderOverview();
}

function cycleStatus(id){
  var p=pages.find(function(p){return p.id===id;});if(!p)return;
  var i=STATUS_ORDER.indexOf(p.status);
  p.status=STATUS_ORDER[(i+1)%STATUS_ORDER.length];
  p.updated=new Date().toISOString();
  save();renderPages();renderOverview();
}

function updateField(id,field,val){
  var p=pages.find(function(p){return p.id===id;});if(!p)return;
  p[field]=val;p.updated=new Date().toISOString();save();
  if(field==='status'){renderPages();renderOverview();}
}

function toggleCheck(pageId,checkId){
  var p=pages.find(function(p){return p.id===pageId;});if(!p)return;
  p.checks[checkId]=!p.checks[checkId];
  p.updated=new Date().toISOString();
  save();
  // Update checklist progress display
  var done=Object.values(p.checks).filter(Boolean).length;
  var total=CL.length;
  var pct=Math.round(done/total*100);
  var el=document.getElementById('cl-prog-'+pageId);
  if(el){
    var pts=pointsDone(p);
    el.innerHTML='<span style="color:var(--green)">+score: '+pts+'/'+pointsTotal()+'</span>'
      +' <span style="color:var(--muted);margin-left:8px;">totaal: '+done+'/'+total+'</span>';
  }
  var chkEl=document.getElementById('chk-'+pageId);
  if(chkEl)chkEl.textContent=pct+'%';
  // Update class on item
  var item=document.getElementById('cli-'+pageId+'-'+checkId);
  if(item)item.className='cl-item'+(p.checks[checkId]?' checked':'');
  renderOverview();
}

function openInAudit(id){
  var p=pages.find(function(pg){return pg.id===id;});if(!p)return;
  var params='?url='+encodeURIComponent(p.url)
    +(p.keyword?'&kw='+encodeURIComponent(p.keyword):'')
    +(p.position?'&pos='+p.position:'')
    +(p.impressions?'&impr='+p.impressions:'')
    +'&wf='+id; // workflow ID for callback
  window.open(AUDIT_URL+params,'_blank');
  // Auto-set to inprogress
  if(p.status==='notstarted'){
    p.status='inprogress';p.updated=new Date().toISOString();
    save();renderPages();renderOverview();toast('🔬 Opened in PULSE+NEXUS — status → In Progress');
  }
}

function markDone(id){
  var p=pages.find(function(pg){return pg.id===id;});if(!p)return;
  p.status='done';p.updated=new Date().toISOString();
  // Auto-check pulse
  p.checks['pulse']=true;
  save();renderPages();renderOverview();toast('✅ Marked as Done');
}

function checkProgress(p){
  var done=Object.values(p.checks).filter(Boolean).length;
  return {done:done,total:CL.length,pct:Math.round(done/CL.length*100)};
}

// Returns true if the "after score" field should be locked
// Locked until at least 3 points-giving items are checked
function scoreAfterLocked(p){
  var pointsDone = CL.filter(function(c){ return c.points && p.checks[c.id]; }).length;
  return pointsDone < 3;
}

// Count points items done
function pointsDone(p){
  return CL.filter(function(c){ return c.points && p.checks[c.id]; }).length;
}
function pointsTotal(){
  return CL.filter(function(c){ return c.points; }).length;
}

function renderOverview(){
  var total=pages.length;
  var done=pages.filter(function(p){return p.status==='done';}).length;
  var inp=pages.filter(function(p){return p.status==='inprogress';}).length;
  var ns=pages.filter(function(p){return p.status==='notstarted';}).length;
  var fu=pages.filter(function(p){return p.status==='followup';}).length;
  var pct=total?Math.round(done/total*100):0;
  document.getElementById('ovTotal').textContent=total;
  document.getElementById('ovDone').textContent=done;
  document.getElementById('ovInProgress').textContent=inp;
  document.getElementById('ovNotStarted').textContent=ns;
  document.getElementById('ovFollowup').textContent=fu;
  document.getElementById('ovPct').textContent=pct+'%';
  document.getElementById('ovBar').style.width=pct+'%';
}

function getSorted(){
  var sort=document.getElementById('fSort').value;
  var arr=pages.slice();
  if(sort==='priority')arr.sort(function(a,b){return PRI_ORDER[a.priority]-PRI_ORDER[b.priority];});
  else if(sort==='position')arr.sort(function(a,b){
    var ap=a.position||999,bp=b.position||999;
    // Position 11-30 = most valuable (closest to page 1)
    var as=ap>=11&&ap<=30?0:ap>30?1:2;
    var bs=bp>=11&&bp<=30?0:bp>30?1:2;
    return as-bs||(ap-bp);
  });
  else if(sort==='impressions')arr.sort(function(a,b){return b.impressions-a.impressions;});
  else if(sort==='checklist')arr.sort(function(a,b){return checkProgress(a).pct-checkProgress(b).pct;});
  else if(sort==='status')arr.sort(function(a,b){return STATUS_ORDER.indexOf(a.status)-STATUS_ORDER.indexOf(b.status);});
  return arr;
}

function renderPages(){
  var fStatus=document.getElementById('fStatus').value;
  var fPri=document.getElementById('fPri').value;
  var fSearch=document.getElementById('fSearch').value.toLowerCase();
  var list=document.getElementById('pagesList');

  var arr=getSorted().filter(function(p){
    if(fStatus!=='all'&&p.status!==fStatus)return false;
    if(fPri!=='all'&&p.priority!==fPri)return false;
    if(fSearch&&!p.url.toLowerCase().includes(fSearch)&&!p.keyword.toLowerCase().includes(fSearch))return false;
    return true;
  });

  if(!arr.length){
    list.innerHTML='<div class="empty"><h3>'+(pages.length?'No pages match filters':'No Pages Yet')+'</h3><p>'+(pages.length?'Adjust filters above.':'Add URLs above or import a CSV.')+'</p></div>';
    return;
  }

  list.innerHTML=arr.map(function(p,i){
    var prog=checkProgress(p);
    var priClass='pri-'+p.priority;
    var shortUrl='';
    try{shortUrl=new URL(p.url).pathname||'/';}catch(e){shortUrl=p.url.slice(0,50);}
    if(shortUrl.length>55)shortUrl=shortUrl.slice(0,55)+'…';

    // Grouped checklist by phase
  function renderClItems(items){
    return items.map(function(c){
      var checked = p.checks[c.id];
      var badge = (c.phase===2&&c.points)
        ? '<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:7px;padding:1px 5px;border-radius:3px;background:rgba(74,222,128,.12);color:var(--green);flex-shrink:0;">+score</span>'
        : (c.phase===2&&!c.points)
        ? '<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:7px;padding:1px 5px;border-radius:3px;background:rgba(96,165,250,.1);color:var(--blue);flex-shrink:0;">CTR</span>'
        : '';
      return '<div class="cl-item'+(checked?' checked':'')+'" id="cli-'+p.id+'-'+c.id+'" onclick="toggleCheck(\\''+p.id+'\\',\\''+c.id+'\\')"'+(c.tip?' title="'+c.tip+'"':'')+'>'
        +'<input type="checkbox"'+(checked?' checked':'')+' onclick="event.stopPropagation();toggleCheck(\\''+p.id+'\\',\\''+c.id+'\\')">'
        +'<label>'+c.label+(c.tip?' <span style="font-size:9px;color:var(--dim);cursor:help;" title="'+c.tip+'">ⓘ</span>':'')+'</label>'
        +badge
        +'</div>';
    }).join('');
  }
  var f1 = CL.filter(function(c){return c.phase===1;});
  var f2p = CL.filter(function(c){return c.phase===2&&c.points;});
  var f2c = CL.filter(function(c){return c.phase===2&&!c.points;});
  var f3 = CL.filter(function(c){return c.phase===3;});
  var ph = function(label,color,border){
    return '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:'+color+';padding:8px 0 4px;border-bottom:1px solid '+border+';margin-bottom:4px;margin-top:6px;">'+label+'</div>';
  };
  var cl = ph('① Pre-audit','var(--blue)','rgba(96,165,250,.2)')
    + '<div class="cl-grid">'+renderClItems(f1)+'</div>'
    + ph('② Implementation — improves ContentScore','var(--green)','rgba(74,222,128,.2)')
    + '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--sub);padding:4px 0 6px;">✓ Add real content → score goes up. Meta/title only = no points.</div>'
    + '<div class="cl-grid">'+renderClItems(f2p)+'</div>'
    + ph('② UX & CTR fixes — no score impact','var(--blue)','rgba(96,165,250,.15)')
    + '<div class="cl-grid">'+renderClItems(f2c)+'</div>'
    + ph('③ Go live + re-scan','var(--gold)','rgba(251,191,36,.2)')
    + '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--sub);padding:4px 0 6px;">⚠ Re-scan only AFTER the page is live and point items are completed.</div>'
    + '<div class="cl-grid">'+renderClItems(f3)+'</div>';

    return '<div class="page-card s-'+p.status+'" id="card-'+p.id+'">'

      // Header
      +'<div class="card-head" style="display:flex;align-items:center;gap:6px;">'
      +'<input type="checkbox" class="page-bulk-cb" data-id="'+p.id+'" onclick="event.stopPropagation();updateBulkCount()" style="width:14px;height:14px;accent-color:var(--red);flex-shrink:0;cursor:pointer;">'
      +'<div style="flex:1;display:flex;align-items:center;gap:6px;" onclick="toggleCard(\\''+p.id+'\\')">'
      +'<span class="card-rank">#'+(i+1)+'</span>'
      +'<span class="pri-dot '+priClass+'"></span>'
      +'<span class="card-url">'+shortUrl+'<span class="card-kw">'+( p.keyword?' — '+p.keyword:'')+'</span></span>'
      +(p.position?'<span class="card-gsc">pos '+Math.round(p.position)+(p.impressions?' · '+p.impressions.toLocaleString()+' impr':'')+'</span>':'')
      +(p.scoreBefore?'<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;font-weight:700;color:'+(p.scoreBefore<70?'var(--red)':p.scoreBefore<85?'var(--gold)':'var(--green)')+';">'+p.scoreBefore+'/100</span>':'')
      +'<span class="card-chk" id="chk-'+p.id+'">'+prog.pct+'%</span>'
      +'<button class="status-btn" onclick="event.stopPropagation();cycleStatus(\\''+p.id+'\\')">'+STATUS_LABELS[p.status]+'</button>'
      +'<span class="chevron" id="chev-'+p.id+'">▾</span>'
      +'</div>'  // close inner clickable div
      +'</div>'

      // Body
      +'<div class="card-body" id="body-'+p.id+'">'

      // Fields
      +'<div class="cb-grid">'
      +'<div class="cb-field"><label>Status</label><select onchange="updateField(\\''+p.id+'\\',\\'status\\',this.value)">'
      +['notstarted','inprogress','done','followup','blocked'].map(function(s){return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+STATUS_LABELS[s]+'</option>';}).join('')
      +'</select></div>'
      +'<div class="cb-field"><label>Priority</label><select onchange="updateField(\\''+p.id+'\\',\\'priority\\',this.value)">'
      +[['high','🔴 High'],['med','🟡 Medium'],['low','🟢 Low']].map(function(x){return '<option value="'+x[0]+'"'+(p.priority===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')
      +'</select></div>'
      +'<div class="cb-field">'
      +'<label style="color:var(--blue)">① Pre-scan Score (BEFORE audit)</label>'
      +'<input type="number" min="0" max="100" value="'+p.scoreBefore+'" placeholder="Scan first, enter here" data-score-before="'+p.id+'" onchange="updateField(\\''+p.id+'\\',\\'scoreBefore\\',this.value)">'
      +'<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--sub);margin-top:4px;">Scan via 📊 Scan Score button — do this BEFORE the audit</div>'
      +'</div>'
      +'<div class="cb-field">'
      +'<label style="color:'+(scoreAfterLocked(p)?'var(--dim)':'var(--green)')+'">③ Post-scan Score (AFTER implementation)</label>'
      +'<input type="number" min="0" max="100" value="'+p.scoreAfter+'" placeholder="'+(scoreAfterLocked(p)?'Complete point items first':'Scan after page is live')+'" '+(scoreAfterLocked(p)?'disabled style="opacity:.4;cursor:not-allowed"':'')+' onchange="updateField(\\''+p.id+'\\',\\'scoreAfter\\',this.value)">'
      +'<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:'+(scoreAfterLocked(p)?'var(--red)':'var(--sub)')+';margin-top:4px;">'+(scoreAfterLocked(p)?'⚠ Complete point items (②) first — meta/title alone does not change the score':'✓ Re-scan AFTER you have published the page')+'</div>'
      +'</div>'
      +'<div class="cb-field"><label>GSC Position</label><input type="number" value="'+p.position+'" placeholder="34" onchange="updateField(\\''+p.id+'\\',\\'position\\',this.value)"></div>'
      +'<div class="cb-field"><label>Impressions</label><input type="number" value="'+p.impressions+'" placeholder="12400" onchange="updateField(\\''+p.id+'\\',\\'impressions\\',this.value)"></div>'
      +'<div class="cb-field"><label>Deadline</label><input type="date" value="'+p.deadline+'" onchange="updateField(\\''+p.id+'\\',\\'deadline\\',this.value)"></div>'
      +'<div class="cb-field"><label>Primary Keyword</label><input type="text" value="'+p.keyword+'" onchange="updateField(\\''+p.id+'\\',\\'keyword\\',this.value)"></div>'
      +'</div>'

      // Notes
      +'<div class="cb-field" style="margin-bottom:12px;"><label>Notes / Next Steps</label><textarea onchange="updateField(\\''+p.id+'\\',\\'notes\\',this.value)">'+p.notes+'</textarea></div>'

      // Checklist
      +'<div class="cl-header"><span>Audit Checklist — 3 phases</span>'
      +'<span id="cl-prog-'+p.id+'" style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;display:flex;gap:10px;">'
      +'<span style="color:var(--green)">+pts: '+pointsDone(p)+'/'+pointsTotal()+'</span>'
      +'<span style="color:var(--muted)">totaal: '+prog.done+'/'+prog.total+'</span>'
      +'</span>'
      +'</div>'
      +'<div class="cl-grid">'+cl+'</div>'

      // Actions
      +'<div class="card-actions">'
      +'<button class="btn btn-purple btn-sm" onclick="openInAudit(\\''+p.id+'\\')">🔬 Open in PULSE+NEXUS</button>'
      +'<button class="btn btn-green btn-sm" onclick="markDone(\\''+p.id+'\\')">✓ Mark Done</button>'
      +'<a href="'+p.url+'" target="_blank" class="btn btn-blue btn-sm">↗ Open Page</a>'
      +'<button class="btn btn-muted btn-sm" onclick="scanOnePage(\\''+p.id+'\\')">📊 Scan Score</button>'
      +'<a href="https://app.contentscale.site/?url='+encodeURIComponent(p.url)+'" target="_blank" class="btn btn-blue btn-sm">↗ ContentScale</a>'
      +'<button class="btn btn-red btn-sm" onclick="deletePage(\\''+p.id+'\\')">✕ Delete</button>'
      +'</div>'

      +'</div></div>';
  }).join('');
}

function toggleCard(id){
  var body=document.getElementById('body-'+id);
  var chev=document.getElementById('chev-'+id);
  if(!body)return;
  var open=body.classList.toggle('open');
  if(chev)chev.classList.toggle('open',open);
}

// ── Export CSV ──
function exportCSV(){
  if(!pages.length){toast('⚠ No pages to export');return;}
  var headers=['URL','Keyword','Priority','Status','Position','Impressions','ScoreBefore','ScoreAfter','Deadline','Notes','ChecklistPct','Updated'];
  CL.forEach(function(c){headers.push('chk_'+c.id);});
  var rows=[headers.join(',')];
  pages.forEach(function(p){
    var prog=checkProgress(p);
    var base=[
      '"'+p.url+'"','"'+(p.keyword||'')+'"',p.priority,p.status,
      p.position||'',p.impressions||'',p.scoreBefore||'',p.scoreAfter||'',
      p.deadline||'','"'+(p.notes||'').replace(/"/g,"''")+'"',
      prog.pct+'%',p.updated||''
    ];
    CL.forEach(function(c){base.push(p.checks[c.id]?'1':'0');});
    rows.push(base.join(','));
  });
  // Project info as first comment line
  var meta='# Client: '+(project.client||'')+' | Site: '+(project.site||'')+' | Auditor: '+(project.auditor||'')+' | Exported: '+new Date().toISOString();
  var csv=meta+'\\n'+rows.join('\\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='seo-audit-workflow-'+(project.client||'export').replace(/\\s+/g,'-').toLowerCase()+'-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  toast('✅ CSV exported');
}

// ── Import CSV ──
function importCSV(input){
  var file=input.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(e){
    var lines=e.target.result.split('\\n').filter(function(l){return l&&!l.startsWith('#');});
    if(lines.length<2){toast('⚠ Invalid CSV');return;}
    var headers=lines[0].split(',').map(function(h){return h.trim().replace(/"/g,'');});
    var imported=0;
    for(var i=1;i<lines.length;i++){
      var cols=lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g)||lines[i].split(',');
      cols=cols.map(function(c){return (c||'').replace(/^"|"$/g,'').trim();});
      var url=cols[headers.indexOf('URL')]||'';
      if(!url||!url.includes('.'))continue;
      // Check if already exists
      var exists=pages.find(function(p){return p.url===url;});
      if(!exists){
        var np=makePage(url,
          cols[headers.indexOf('Keyword')]||'',
          cols[headers.indexOf('Priority')]||'med',
          cols[headers.indexOf('Position')]||0,
          cols[headers.indexOf('Impressions')]||0);
        np.status=cols[headers.indexOf('Status')]||'notstarted';
        np.scoreBefore=cols[headers.indexOf('ScoreBefore')]||'';
        np.scoreAfter=cols[headers.indexOf('ScoreAfter')]||'';
        np.deadline=cols[headers.indexOf('Deadline')]||'';
        np.notes=cols[headers.indexOf('Notes')]||'';
        // Restore checklist
        CL.forEach(function(c){
          var ci=headers.indexOf('chk_'+c.id);
          if(ci>=0)np.checks[c.id]=cols[ci]==='1';
        });
        pages.push(np);imported++;
      } else {
        // Update existing
        exists.status=cols[headers.indexOf('Status')]||exists.status;
        exists.notes=cols[headers.indexOf('Notes')]||exists.notes;
        exists.scoreBefore=cols[headers.indexOf('ScoreBefore')]||exists.scoreBefore;
        exists.scoreAfter=cols[headers.indexOf('ScoreAfter')]||exists.scoreAfter;
        CL.forEach(function(c){
          var ci=headers.indexOf('chk_'+c.id);
          if(ci>=0)exists.checks[c.id]=cols[ci]==='1';
        });
        imported++;
      }
    }
    save();renderPages();renderOverview();
    toast('✅ '+imported+' pages imported/updated');
  };
  r.readAsText(file);
  input.value='';
}

function makePage(url,kw,pri,pos,impr){
  var checks={};
  CL.forEach(function(c){checks[c.id]=false;});
  return {id:uid(),url:url,keyword:kw||'',priority:pri||'med',
    position:parseFloat(pos)||0,impressions:parseInt(impr)||0,
    status:'notstarted',scoreBefore:'',scoreAfter:'',notes:'',deadline:'',
    checks:checks,created:new Date().toISOString(),updated:new Date().toISOString()};
}

// ── Client report export ──
function exportClientReport(){
  if(!pages.length){toast('⚠ No pages');return;}
  var done=pages.filter(function(p){return p.status==='done';});
  var inp=pages.filter(function(p){return p.status==='inprogress';});
  var fu=pages.filter(function(p){return p.status==='followup';});
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SEO Audit Report — '+(project.client||'Client')+'</title>'
    +'<style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#1f2937;padding:0 20px;}'
    +'h1{color:#6d28d9;font-size:28px;margin-bottom:4px;}h2{color:#4b5563;font-size:18px;margin:24px 0 10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;}'
    +'th{background:#f3f4f6;padding:8px 10px;text-align:left;border:1px solid #e5e7eb;color:#6b7280;}'
    +'td{padding:8px 10px;border:1px solid #e5e7eb;}'
    +'.done{color:#16a34a;font-weight:700;}.inp{color:#b45309;}.fu{color:#7c3aed;}'
    +'</style></head><body>'
    +'<h1>SEO Audit Report</h1>'
    +'<p><strong>Client:</strong> '+(project.client||'—')+' &nbsp; <strong>Site:</strong> '+(project.site||'—')
    +' &nbsp; <strong>Auditor:</strong> '+(project.auditor||'—')+' &nbsp; <strong>Date:</strong> '+new Date().toLocaleDateString()+'</p>'
    +'<p><strong>Progress:</strong> '+done.length+'/'+pages.length+' pages completed ('+Math.round(done.length/pages.length*100)+'%)</p>';

  function pageRows(arr){
    return arr.map(function(p){
      var prog=checkProgress(p);
      return '<tr><td><a href="'+p.url+'">'+p.url+'</a></td><td>'+p.keyword+'</td>'
        +'<td>'+(p.scoreBefore||'—')+' → '+(p.scoreAfter||'—')+'</td>'
        +'<td>'+prog.pct+'%</td><td>'+(p.notes||'—')+'</td></tr>';
    }).join('');
  }

  if(done.length){html+='<h2>✅ Completed Pages ('+done.length+')</h2><table><tr><th>URL</th><th>Keyword</th><th>Score Before→After</th><th>Checklist</th><th>Notes</th></tr>'+pageRows(done)+'</table>';}
  if(inp.length){html+='<h2>🔄 In Progress ('+inp.length+')</h2><table><tr><th>URL</th><th>Keyword</th><th>Score Before→After</th><th>Checklist</th><th>Notes</th></tr>'+pageRows(inp)+'</table>';}
  if(fu.length){html+='<h2>📌 Follow-up Required ('+fu.length+')</h2><table><tr><th>URL</th><th>Keyword</th><th>Score Before→After</th><th>Checklist</th><th>Notes</th></tr>'+pageRows(fu)+'</table>';}

  html+='</body></html>';
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download='seo-report-'+(project.client||'client').replace(/\\s+/g,'-').toLowerCase()+'-'+new Date().toISOString().slice(0,10)+'.html';
  a.click();
  toast('✅ Client report exported');
}

// ── Check for PULSE+NEXUS callback ──
// When audit tool marks a page done, it can set ?done=pageId in URL
(function checkCallback(){
  var params=new URLSearchParams(window.location.search);
  var doneId=params.get('done');
  if(doneId){
    var p=pages.find(function(pg){return pg.id===doneId;});
    if(p){
      p.status='done';p.checks['pulse']=true;p.updated=new Date().toISOString();
      save();toast('✅ Page marked done from PULSE+NEXUS');
    }
    history.replaceState(null,'',window.location.pathname);
  }
})();

// ── Import GSC CSV → auto-populate pages ──────────────────
// GSC export: Performance → Pages tab → Export CSV
// ── GSC import — Pages CSV + Queries CSV beide tegelijk ────
var _gscQueryMap = {}; // url → [query, query, ...]

function importGSC(input){
  var files = Array.from(input.files);
  if(!files.length) return;

  var totalAdded = 0, totalUpdated = 0, queriesLoaded = 0;
  var pending = files.length;

  files.forEach(function(file){
    var r = new FileReader();
    r.onload = function(e){
      var result = parseGSCFile(e.target.result);
      if(result.type === 'pages'){
        totalAdded += result.added;
        totalUpdated += result.updated;
      } else if(result.type === 'queries'){
        queriesLoaded = result.count;
      }
      pending--;
      if(pending === 0){
        // Auto-merge duplicates after import
        var beforeMerge = pages.length;
        var seen = {}, cnts = {};
        pages.forEach(function(p) {
          var key = (p.url||'').trim().toLowerCase().replace(/\\/+$/, '');
          if (seen[key]) {
            var ex = seen[key];
            ex.impressions = (ex.impressions||0) + (p.impressions||0);
            ex._ps = (ex._ps||ex.position||0) + (p.position||0);
            cnts[key]++;
            p._dup = true;
          } else { seen[key] = p; p._ps = p.position||0; cnts[key] = 1; }
        });
        Object.keys(seen).forEach(function(k){
          var p = seen[k];
          if(cnts[k]>1){ p.position=Math.round((p._ps/cnts[k])*10)/10; }
          delete p._ps;
        });
        pages = pages.filter(function(p){ return !p._dup; });
        var mergedCount = beforeMerge - pages.length;
        // Save GSC data to shared storage for PULSE+NEXUS
        try {
          var sharedGsc = { pages: pages.map(function(p){ return {page:p.url, impressions:p.impressions||0, clicks:0, ctr:p.ctr||0, position:p.position||0, score:0}; }), queries: [] };
          if (typeof _gscQueryMap !== 'undefined') { sharedGsc.queries = Object.keys(_gscQueryMap).map(function(q){ return {query:q, position:_gscQueryMap[q]}; }); }
          localStorage.setItem('cs_shared_gsc', JSON.stringify(sharedGsc));
        } catch(e) {}
        save(); renderPages(); renderOverview();
        var msg = '✅ GSC: ' + totalAdded + ' added, ' + totalUpdated + ' updated';
        if (mergedCount > 0) msg += ' · ' + mergedCount + ' duplicates merged';
        if(queriesLoaded) msg += ' · ' + queriesLoaded + ' queries loaded';
        toast(msg);
      }
    };
    r.readAsText(file);
  });
  input.value = '';
}

function parseGSCFile(raw){
  var lines = raw.trim().split('\\n');
  if(lines.length < 2) return {type:'unknown'};
  var header = lines[0].toLowerCase().replace(/"/g,'').split(',');

  // Detect if this is a Queries CSV or Pages CSV
  var isQueries = header.some(function(h){ return h.includes('query') || h.includes('search term'); });

  if(isQueries){
    // Queries CSV — build a query list (not linked to pages directly here)
    // Store globally for use in PULSE+NEXUS
    _gscQueryMap = {};
    var iQuery = header.findIndex(function(h){ return h.includes('query')||h.includes('search term'); });
    var iPos   = header.findIndex(function(h){ return h.includes('position'); });
    var count  = 0;
    for(var i=1;i<lines.length;i++){
      var cols = lines[i].replace(/"/g,'').split(',');
      var q = (cols[iQuery]||'').trim();
      var pos = parseFloat(cols[iPos])||0;
      if(q){ _gscQueryMap[q] = pos; count++; }
    }
    try{ localStorage.setItem('cs_gsc_queries', JSON.stringify(_gscQueryMap)); }catch(e){}
    return {type:'queries', count:count};
  }

  // Pages CSV
  var iUrl  = header.findIndex(function(h){ return h.includes('page')||h.includes('url')||h.includes('top page'); });
  var iImpr = header.findIndex(function(h){ return h.includes('impression'); });
  var iCtr  = header.findIndex(function(h){ return h.includes('ctr'); });
  var iPos  = header.findIndex(function(h){ return h.includes('position')||h.includes('pos'); });
  if(iUrl<0)iUrl=0; if(iImpr<0)iImpr=2; if(iPos<0)iPos=4;

  var added=0, updated=0;
  for(var i=1;i<lines.length;i++){
    var cols = lines[i].replace(/"/g,'').split(',');
    var url = (cols[iUrl]||'').trim();
    // Only accept real page URLs — must start with http or /
    if(!url) continue;
    if(!url.startsWith('http') && !url.startsWith('/')) continue;
    // Reject query strings masquerading as URLs
    if(url.includes('-site:') || url.includes(' ') || url.includes('?q=')) continue;
    var impr = parseInt(cols[iImpr])||0;
    var pos  = parseFloat(cols[iPos])||0;
    var ctr  = parseFloat((cols[iCtr]||'0').replace('%',''))||0;
    var pri;
    if(pos>=11&&pos<=30) pri='high';
    else if(pos>=1&&pos<=10&&ctr<2) pri='high';
    else if(pos>30&&pos<=60) pri='med';
    else if(pos>60) pri='low';
    else pri='low';
    var existing = pages.find(function(p){ return p.url===url; });
    if(existing){
      // Merge: keep highest impressions, best position
      if(impr > (existing.impressions||0)) existing.impressions = impr;
      if(pos > 0 && (existing.position===0 || pos < existing.position)) existing.position = pos;
      existing.priority=pri; existing.ctr=ctr;
      existing.updated=new Date().toISOString();
      updated++;
    } else {
      var np = makePage(url,'',pri,pos,impr);
      np.ctr = ctr;
      pages.push(np);
      added++;
    }
  }
  return {type:'pages', added:added, updated:updated};
}

function mergeDuplicatePages() {
  var seen = {};    // key -> primary page object
  var counts = {};  // key -> count for averaging position
  var merged = 0;

  pages.forEach(function(p) {
    var key = (p.url || '').trim().toLowerCase().replace(/\\/+$/, '');
    if (seen[key]) {
      var ex = seen[key];
      // Sum impressions
      ex.impressions = (ex.impressions || 0) + (p.impressions || 0);
      // Running average for position
      ex._posSum = (ex._posSum || ex.position || 0) + (p.position || 0);
      counts[key]++;
      p._duplicate = true;
      merged++;
    } else {
      seen[key] = p;
      p._posSum = p.position || 0;
      counts[key] = 1;
    }
  });

  // Finalize averages
  Object.keys(seen).forEach(function(key) {
    var p = seen[key];
    if (counts[key] > 1) {
      p.position = Math.round((p._posSum / counts[key]) * 10) / 10;
      // Recalculate priority from avg position
      if (p.position >= 11 && p.position <= 30) p.priority = 'high';
      else if (p.position >= 1 && p.position <= 10) p.priority = 'high';
      else if (p.position > 30 && p.position <= 60) p.priority = 'med';
      else p.priority = 'low';
    }
    delete p._posSum;
  });

  if (merged > 0) {
    pages = pages.filter(function(p){ return !p._duplicate; });
    save(); renderPages(); renderOverview();
    toast('🔀 Merged ' + merged + ' duplicates — avg position, summed impressions');
  } else {
    toast('✓ No duplicates found');
  }
}

// ── Sitemap + GSC — group into: in GSC / not in GSC ───────────

function addSelectedSitemapUrls(){
  var selected = Array.from(document.querySelectorAll('.sitemap-cb:checked')).map(function(cb){ return cb.dataset.url; });
  if(!selected.length){ toast('⚠ No URLs selected'); return; }
  var added=0, skipped=0;
  selected.forEach(function(url){
    if(pages.find(function(p){ return p.url===url; })){ skipped++; return; }
    // Check if GSC data available from pages already imported
    var gscEntry = _gscDataMap && _gscDataMap[url];
    if(gscEntry){
      var np = makePage(url,'',gscEntry.pri,gscEntry.pos,gscEntry.impr);
      np.ctr = gscEntry.ctr;
      pages.push(np);
    } else {
      pages.push(makePage(url,'','low',0,0));
    }
    added++;
  });
  save(); renderPages(); renderOverview();
  document.getElementById('sitemapPreview').style.display='none';
  document.getElementById('sitemapUrl').value='';
  _sitemapUrls=[]; _sitemapFiltered=[];
  document.getElementById('sitemapStatus').textContent='';
  toast('✅ '+added+' pages added'+(skipped?' · '+skipped+' already present':''));
}

// Global GSC data map for cross-referencing
var _gscDataMap = {};

// Build GSC map from imported pages
function buildGscMap(){
  _gscDataMap = {};
  pages.forEach(function(p){
    if(p.position>0 || p.impressions>0){
      _gscDataMap[p.url] = {pos:p.position, impr:p.impressions, ctr:p.ctr||0, pri:p.priority};
    }
  });
}

// ── Main filter: show sitemap URLs in two groups ─────────────
function filterSitemapByGSC(){
  buildGscMap();
  var gscUrls = Object.keys(_gscDataMap);
  if(!gscUrls.length){
    toast('⚠ Importeer eerst je GSC CSV — dan wordt de vergelijking gemaakt');
    return;
  }
  var inGSC    = _sitemapUrls.filter(function(u){ return _gscDataMap[u]; });
  var notInGSC = _sitemapUrls.filter(function(u){ return !_gscDataMap[u]; });

  renderSitemapGrouped(inGSC, notInGSC);
  document.getElementById('sitemapStatus').innerHTML =
    '<span style="color:var(--green)">🟢 '+inGSC.length+' in GSC</span>'
    +' &nbsp; <span style="color:var(--gold)">🟡 '+notInGSC.length+' not in GSC (not indexed / new)</span>'
    +' &nbsp; <span style="color:var(--sub)">'+_sitemapUrls.length+' totaal</span>';
}

function renderSitemapGrouped(inGSC, notInGSC){
  var list = document.getElementById('sitemapUrlList');
  var selCount = document.getElementById('sitemapSelCount');

  function rowHtml(u, defaultChecked, gscData){
    var shortUrl = u.replace(/^https?:\\/\\/[^/]+/,'') || '/';
    var gscInfo = gscData
      ? '<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--green);margin-left:6px;">pos '+Math.round(gscData.pos)+(gscData.impr?' · '+gscData.impr.toLocaleString()+' impr':'')+'</span>'
      : '<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--gold);margin-left:6px;">not in GSC</span>';
    return '<div style="display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:4px;cursor:pointer;" onclick="this.querySelector(\\'input\\').click()">'
      +'<input type="checkbox" class="sitemap-cb" data-url="'+u+'"'+(defaultChecked?' checked':'')+' onclick="event.stopPropagation();updateSitemapCount()" style="width:13px;height:13px;accent-color:var(--gold);flex-shrink:0;">'
      +'<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--blue);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+u+'">'+shortUrl+'</span>'
      +gscInfo
      +'<button onclick="event.stopPropagation();removeSitemapUrl(\\''+u+'\\')" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:11px;padding:0 4px;flex-shrink:0;" title="Remove">✕</button>'
      +'</div>';
  }

  var html = '';

  // Group 1 — in GSC
  if(inGSC.length){
    // Sort by opportunity: pos 11-30 first
    inGSC.sort(function(a,b){
      var pa = _gscDataMap[a]?.pos || 999;
      var pb = _gscDataMap[b]?.pos || 999;
      var scoreA = (pa>=11&&pa<=30)?0:(pa>=1&&pa<=10)?1:(pa>30&&pa<=60)?2:3;
      var scoreB = (pb>=11&&pb<=30)?0:(pb>=1&&pb<=10)?1:(pb>30&&pb<=60)?2:3;
      return scoreA-scoreB || pa-pb;
    });
    html += '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);padding:8px 8px 4px;border-bottom:1px solid rgba(74,222,128,.2);margin-bottom:4px;">'
      +'🟢 In GSC — '+inGSC.length+' pages (sorted by opportunity)'
      +'</div>';
    html += inGSC.map(function(u){ return rowHtml(u, true, _gscDataMap[u]); }).join('');
  }

  // Group 2 — not in GSC
  if(notInGSC.length){
    html += '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);padding:12px 8px 4px;border-bottom:1px solid rgba(251,191,36,.2);margin-bottom:4px;margin-top:8px;">'
      +'🟡 Not in GSC — '+notInGSC.length+' pages (not indexed or new)'
      +'</div>'
      +'<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--sub);padding:2px 8px 8px;">Google does not know these pages yet. Add them to investigate why.</div>';
    html += notInGSC.map(function(u){ return rowHtml(u, false, null); }).join('');
  }

  list.innerHTML = html || '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--dim);padding:8px;">No URLs found.</div>';
  updateSitemapCount();
}


// ── Sitemap fetch + preview ─────────────────────────────────
var _sitemapUrls = []; // all fetched URLs
var _sitemapFiltered = []; // after filter

async function fetchSitemap() {
  var url = document.getElementById('sitemapUrl').value.trim();
  if (!url) { toast('⚠ Voer een sitemap URL in'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;

  var btn = document.getElementById('sitemapBtn');
  var status = document.getElementById('sitemapStatus');
  btn.textContent = '⏳ Fetching...';
  btn.disabled = true;
  status.textContent = 'Fetching sitemap via server...';
  status.style.color = 'var(--muted)';

  try {
    // Use Railway server as proxy to avoid CORS
    var r = await fetch('https://app.contentscale.site/api/sitemap/urls', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url: url})
    });
    var d = await r.json();

    if (!d.success || !d.urls || !d.urls.length) {
      throw new Error(d.error || 'Geen URLs gevonden in sitemap');
    }

    _sitemapUrls = d.urls;
    _sitemapFiltered = d.urls.slice();
    status.innerHTML = '<span style="color:var(--green)">✓ ' + d.total + ' URLs gevonden</span>';
    document.getElementById('sitemapPreview').style.display = 'block';
    renderSitemapList(_sitemapFiltered, true);
    toast('✅ ' + d.total + ' URLs loaded from sitemap');

  } catch(e) {
    status.innerHTML = '<span style="color:var(--red)">⚠ ' + e.message + '</span>';
    toast('⚠ Sitemap fetch mislukt: ' + e.message);
  }

  btn.textContent = '↓ Fetch Sitemap';
  btn.disabled = false;
}

function filterSitemapUrls() {
  var q = document.getElementById('sitemapFilter').value.trim().toLowerCase();
  _sitemapFiltered = q
    ? _sitemapUrls.filter(function(u){ return u.toLowerCase().includes(q); })
    : _sitemapUrls.slice();

  // Preserve checked state
  var checked = {};
  document.querySelectorAll('.sitemap-cb').forEach(function(cb){
    checked[cb.dataset.url] = cb.checked;
  });
  renderSitemapList(_sitemapFiltered, false, checked);
}

function renderSitemapList(urls, selectAll, preserveChecked) {
  var list = document.getElementById('sitemapUrlList');
  var selCount = document.getElementById('sitemapSelCount');

  if (!urls.length) {
    list.innerHTML = '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--dim);padding:8px;">Geen URLs gevonden voor dit filter.</div>';
    selCount.textContent = '';
    return;
  }

  list.innerHTML = urls.map(function(u) {
    var shortUrl = u.replace(/^https?:\\/\\/[^/]+/, '') || '/';
    var isChecked = preserveChecked ? (preserveChecked[u] !== false) : (selectAll !== false);
    // Skip homepage, XML, images by default
    var skip = u.endsWith('.xml') || u.endsWith('.jpg') || u.endsWith('.png') || u.endsWith('.pdf');
    if (skip) isChecked = false;
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;cursor:pointer;" onclick="this.querySelector(&quot;input&quot;).click()">'
      + '<input type="checkbox" class="sitemap-cb" data-url="'+u+'"'+(isChecked?' checked':'')+' onclick="event.stopPropagation();updateSitemapCount()" style="width:13px;height:13px;accent-color:var(--gold);flex-shrink:0;">'
      + '<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--blue);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+u+'">'+shortUrl+'</span>'
      + '<button onclick="event.stopPropagation();removeSitemapUrl(\\''+u+'\\')" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:11px;padding:0 4px;flex-shrink:0;" title="Remove">✕</button>'
      + '</div>';
  }).join('');

  updateSitemapCount();
}

function updateSitemapCount() {
  var all = document.querySelectorAll('.sitemap-cb');
  var checked = document.querySelectorAll('.sitemap-cb:checked');
  document.getElementById('sitemapSelCount').textContent = checked.length + '/' + all.length + ' selected';
}

function deleteSelectedSitemapUrls() {
  var selected = Array.from(document.querySelectorAll('.sitemap-cb:checked')).map(function(cb){ return cb.dataset.url; });
  if (!selected.length) { toast('⚠ No URLs selected'); return; }
  if (!confirm('Delete ' + selected.length + ' selected URLs from the list?')) return;
  _sitemapUrls = _sitemapUrls.filter(function(u){ return !selected.includes(u); });
  _sitemapFiltered = _sitemapFiltered.filter(function(u){ return !selected.includes(u); });
  renderSitemapList(_sitemapFiltered, false);
  document.getElementById('sitemapStatus').innerHTML = '<span style="color:var(--green)">✓ ' + _sitemapUrls.length + ' URLs remaining</span>';
  toast('🗑 ' + selected.length + ' URLs removed');
  if (!_sitemapUrls.length) document.getElementById('sitemapPreview').style.display = 'none';
}

function clearAllSitemapUrls() {
  if (!_sitemapUrls.length) return;
  if (!confirm('Clear all ' + _sitemapUrls.length + ' URLs from the list?')) return;
  _sitemapUrls = []; _sitemapFiltered = [];
  document.getElementById('sitemapPreview').style.display = 'none';
  document.getElementById('sitemapUrl').value = '';
  document.getElementById('sitemapStatus').textContent = '';
  toast('✕ Sitemap cleared');
}

function selectAllSitemap() {
  document.querySelectorAll('.sitemap-cb').forEach(function(cb){ cb.checked = true; });
  updateSitemapCount();
}

function deselectAllSitemap() {
  document.querySelectorAll('.sitemap-cb').forEach(function(cb){ cb.checked = false; });
  updateSitemapCount();
}

function removeSitemapUrl(url) {
  _sitemapUrls = _sitemapUrls.filter(function(u){ return u !== url; });
  _sitemapFiltered = _sitemapFiltered.filter(function(u){ return u !== url; });
  var preserved = {};
  document.querySelectorAll('.sitemap-cb').forEach(function(cb){
    preserved[cb.dataset.url] = cb.checked;
  });
  renderSitemapList(_sitemapFiltered, false, preserved);
  document.getElementById('sitemapStatus').innerHTML = '<span style="color:var(--muted)">' + _sitemapUrls.length + ' URLs resterend</span>';
}

function addSelectedSitemapUrls() {
  var selected = Array.from(document.querySelectorAll('.sitemap-cb:checked')).map(function(cb){ return cb.dataset.url; });
  if (!selected.length) { toast('⚠ No URLs selected'); return; }
  var added = 0;
  selected.forEach(function(url){
    var exists = pages.find(function(p){ return p.url === url; });
    if (!exists) { pages.push(makePage(url,'','med',0,0)); added++; }
  });
  save(); renderPages(); renderOverview();
  document.getElementById('sitemapPreview').style.display = 'none';
  document.getElementById('sitemapUrl').value = '';
  _sitemapUrls = [];
  _sitemapFiltered = [];
  document.getElementById('sitemapStatus').textContent = '';
  toast('✅ ' + added + ' pages added (' + (selected.length - added) + ' already present)');
}

// ── Server sync + auto-save ─────────────────────────────────
var _autoSaveTimer = null;
var _lastSavedHash = '';

function _dataHash(){
  // Simple hash to detect changes
  return pages.length + '_' + (pages[0]?.updated||'') + '_' + (pages[pages.length-1]?.updated||'');
}

async function syncToServer(silent){
  if(!pages.length) return;
  var btn = document.getElementById('syncBtn');
  if(btn && !silent){ btn.textContent='☁ Saving...'; btn.disabled=true; }

  var key = (project.client||'default').replace(/\\s+/g,'-').toLowerCase()
    + '-' + (project.site||'').replace(/https?:\\/\\//,'').split('/')[0].replace(/\\s+/g,'-');
  if(!key || key === '-') key = 'workflow-' + Date.now();

  var payload = { key, project, pages, savedAt: new Date().toISOString() };

  try {
    var r = await fetch('https://app.contentscale.site/api/workflow/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var d = await r.json();
    if(d.success){
      _lastSavedHash = _dataHash();
      var ts = new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      setSyncStatus('☁ Opgeslagen om ' + ts + ' — key: ' + key, 'var(--green)');
      try{ localStorage.setItem('cs_wf_sync_key', key); }catch(e){}
      if(!silent) toast('☁ Opgeslagen op server');
    } else {
      setSyncStatus('⚠ Server save mislukt — data staat in browser', 'var(--gold)');
    }
  } catch(e) {
    setSyncStatus('⚠ Server niet bereikbaar — data staat in browser', 'var(--gold)');
    if(!silent) toast('⚠ Server offline — browser backup actief');
  }
  if(btn && !silent){ btn.textContent='☁ Save to Server'; btn.disabled=false; }
}

async function loadFromServer(){
  var key = prompt('Project key (leeg = laatste opgeslagen):');
  if(key === null) return;
  if(!key){
    try{ key = localStorage.getItem('cs_wf_sync_key')||''; }catch(e){}
  }
  if(!key){ toast('⚠ Geen key gevonden'); return; }
  try {
    var r = await fetch('https://app.contentscale.site/api/workflow/load?key='+encodeURIComponent(key));
    var d = await r.json();
    if(d.success && d.data){
      if(!confirm('Workflow "'+key+'" laden? Vervangt huidige data.')) return;
      if(d.data.project) project = d.data.project;
      if(d.data.pages)   pages   = d.data.pages;
      if(project.client)   document.getElementById('pClient').value   = project.client;
      if(project.site)     document.getElementById('pSite').value     = project.site;
      if(project.deadline) document.getElementById('pDeadline').value = project.deadline;
      if(project.auditor)  document.getElementById('pAuditor').value  = project.auditor;
      save(); renderPages(); renderOverview();
      var ts = new Date(d.data.savedAt||Date.now()).toLocaleString('nl-NL');
      setSyncStatus('☁ Geladen van server (opgeslagen: '+ts+')', 'var(--green)');
      toast('✅ '+pages.length+' pages loaded from server');
    } else {
      toast('⚠ Niet gevonden: '+key);
    }
  } catch(e){ toast('⚠ Server niet bereikbaar'); }
}

function setSyncStatus(msg, color){
  var el = document.getElementById('syncStatus');
  if(el){ el.textContent=msg; el.style.color=color||'var(--dim)'; }
}


// ── ContentScore scan per page ──────────────────────────────────
async function scanOnePage(pageId) {
  var p = pages.find(function(pg){ return pg.id === pageId; });
  if (!p) return;
  var btn = document.querySelector('[onclick="scanOnePage(\\'' + pageId + '\\')"]');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  try {
    var r = await fetch('https://app.contentscale.site/api/scan', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url: p.url})
    });
    var d = await r.json();
    if (d.score) {
      if (!p.scoreBefore) {
        p.scoreBefore = d.score;
        toast('✅ Pre-scan: ' + d.score + '/100 — ' + p.url.split('/').pop());
      } else {
        p.scoreAfter = d.score;
        toast('✅ Na-scan: ' + d.score + '/100 — verschil: ' + (d.score - p.scoreBefore));
      }
      save(); renderPages();
    } else {
      toast('⚠ Scan mislukt: ' + (d.error || 'onbekende fout'));
    }
  } catch(e) {
    toast('⚠ Server niet bereikbaar: ' + e.message);
  }
  if (btn) { btn.textContent = '📊 Scan Score'; btn.disabled = false; }
}

// ── Scan alle paginas zonder score ───────────────────────────
var _scanQueue = [];
var _scanRunning = false;

async function scanAllScores() {
  var unscored = pages.filter(function(p){ return !p.scoreBefore && p.url; });
  var all = pages.filter(function(p){ return p.url; });
  // If all have scores, ask if they want to rescan
  if (!unscored.length && all.length) {
    if (!confirm('All pages already have a score. Re-scan all ' + all.length + ' pages?')) return;
    unscored = all; // rescan all
  }
  if (!unscored.length) { toast('No pages with URLs found'); return; }
  if (_scanRunning) { toast('⏳ Scan already running...'); return; }
  _scanQueue = unscored.slice();
  _scanRunning = true;
  toast('⏳ Scanning ' + _scanQueue.length + ' pages...');
  setSyncStatus('⏳ Auto-scan running: 0/' + _scanQueue.length + ' pages', 'var(--gold)');

  var done = 0;
  for (var i = 0; i < _scanQueue.length; i++) {
    var p = _scanQueue[i];
    try {
      var r = await fetch('https://app.contentscale.site/api/scan', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({url: p.url})
      });
      var d = await r.json();
      if (d.score) { p.scoreBefore = d.score; done++; }
    } catch(e) {}
    setSyncStatus('⏳ Scanning ' + (i+1) + '/' + _scanQueue.length + ' — ' + done + ' scores found', 'var(--gold)');
    save();
    await new Promise(function(res){ setTimeout(res, 2000); }); // 2s between scans
  }

  _scanRunning = false;
  renderPages(); renderOverview();
  setSyncStatus('✅ Auto-scan complete — ' + done + ' scores loaded', 'var(--green)');
  toast('✅ ' + done + '/' + _scanQueue.length + ' pages scanned');
}

function startAutoSave(){
  if(_autoSaveTimer) clearInterval(_autoSaveTimer);
  // Auto-save every 3 minutes IF data has changed
  _autoSaveTimer = setInterval(function(){
    if(pages.length > 0 && _dataHash() !== _lastSavedHash){
      syncToServer(true); // silent = no toast
    }
  }, 3 * 60 * 1000);
  // Also save on page unload
  window.addEventListener('beforeunload', function(){
    if(pages.length > 0 && _dataHash() !== _lastSavedHash){
      syncToServer(true);
    }
  });
}

// ── Init ──
load();
renderPages();
renderOverview();
startAutoSave();
if(pages.length>0) setSyncStatus('Data in browser — click ☁ Save to Server to backup', 'var(--dim)');
</script>
</body>
</html>
`);
});
app.get('/audit-recommendations', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>SEO Recommendations | ContentScale</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#030712;--card:#0f172a;--surface:#1e293b;--border:#334155;
  --ink:#f9fafb;--muted:#94a3b8;--sub:#64748b;--dim:#475569;
  --purple:#a78bfa;--blue:#60a5fa;--green:#4ade80;
  --gold:#fbbf24;--red:#f43f3f;--orange:#fb923c;
}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',sans-serif;min-height:100vh;}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px 80px;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:24px;flex-wrap:wrap;gap:10px;}
.brand{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.06em;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-decoration:none;}
.tool-title{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.04em;background:linear-gradient(90deg,var(--gold),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.btn{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:5px;cursor:pointer;border:1px solid;transition:all .15s;white-space:nowrap;background:none;text-decoration:none;display:inline-flex;align-items:center;gap:5px;}
.btn-muted{background:var(--surface);border-color:var(--border);color:var(--muted);}
.btn-muted:hover{color:var(--ink);}

/* Summary bar */
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}
@media(max-width:600px){.summary{grid-template-columns:1fr 1fr;}}
.sum-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;}
.sum-n{font-family:'Bebas Neue',sans-serif;font-size:34px;line-height:1;margin-bottom:3px;}
.sum-l{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);}

/* Filter */
.filter-bar{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;}
.filter-bar select{background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:7px 11px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.06em;color:var(--muted);outline:none;cursor:pointer;}
.filter-bar select:focus{border-color:var(--gold);color:var(--ink);}

/* Recommendation cards */
.rec-list{display:flex;flex-direction:column;gap:12px;}

.rec-card{border-radius:12px;overflow:hidden;border:1px solid var(--border);}
.rec-card.type-quickwin{border-left:4px solid var(--green);}
.rec-card.type-ctr{border-left:4px solid var(--blue);}
.rec-card.type-content{border-left:4px solid var(--gold);}
.rec-card.type-rewrite{border-left:4px solid var(--orange);}
.rec-card.type-authority{border-left:4px solid var(--purple);}
.rec-card.type-build{border-left:4px solid var(--dim);}

.rec-head{background:var(--card);padding:16px 20px;display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;}
.rec-badge{flex-shrink:0;padding:4px 10px;border-radius:5px;font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;white-space:nowrap;margin-top:2px;}
.badge-quickwin{background:rgba(74,222,128,.15);color:var(--green);border:1px solid rgba(74,222,128,.3);}
.badge-ctr{background:rgba(96,165,250,.15);color:var(--blue);border:1px solid rgba(96,165,250,.3);}
.badge-content{background:rgba(251,191,36,.15);color:var(--gold);border:1px solid rgba(251,191,36,.3);}
.badge-rewrite{background:rgba(251,146,60,.15);color:var(--orange);border:1px solid rgba(251,146,60,.3);}
.badge-authority{background:rgba(167,139,250,.15);color:var(--purple);border:1px solid rgba(167,139,250,.3);}
.badge-build{background:rgba(71,85,105,.15);color:var(--dim);border:1px solid rgba(71,85,105,.3);}

.rec-main{flex:1;min-width:200px;}
.rec-url{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--blue);margin-bottom:5px;word-break:break-all;}
.rec-kw{font-size:11px;color:var(--muted);margin-bottom:8px;}
.rec-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.03em;color:var(--ink);margin-bottom:5px;}
.rec-why{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:8px;}
.rec-action{font-size:13px;font-weight:600;color:var(--ink);display:flex;align-items:flex-start;gap:6px;}
.rec-action::before{content:'→';color:var(--gold);flex-shrink:0;}

.rec-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.meta-chip{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:4px;border:1px solid var(--border);color:var(--dim);}
.meta-chip strong{color:var(--muted);}

/* Pre-filled info */
.prefill-box{background:var(--surface);border-radius:8px;padding:12px 16px;margin:0 20px 0 0;min-width:200px;max-width:280px;flex-shrink:0;}
@media(max-width:700px){.prefill-box{max-width:100%;margin:0;}}
.prefill-title{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--sub);margin-bottom:8px;}
.prefill-row{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:11px;}
.prefill-row.auto{color:var(--green);}
.prefill-row.manual{color:var(--dim);}
.prefill-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.dot-auto{background:var(--green);}
.dot-manual{background:var(--dim);}

/* Action button */
.rec-foot{background:rgba(255,255,255,.02);border-top:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.action-btn{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;padding:10px 28px;border-radius:7px;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:8px;text-decoration:none;transition:all .18s;}
.action-btn-gold{background:var(--gold);color:#000;}
.action-btn-gold:hover{background:#e6b020;transform:translateY(-1px);}
.action-btn-blue{background:rgba(96,165,250,.15);color:var(--blue);border:1px solid rgba(96,165,250,.3);}
.action-btn-blue:hover{background:var(--blue);color:#000;}
.time-chip{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);display:flex;align-items:center;gap:5px;}

.empty{text-align:center;padding:60px 20px;color:var(--dim);}
.empty h3{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--sub);margin-bottom:8px;}

.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--gold);color:#000;padding:9px 20px;border-radius:50px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;opacity:0;transition:all .3s;z-index:10000;pointer-events:none;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}

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

<div class="topbar">
  <a href="https://contentscale.site" class="brand">ContentScale</a>
  <div class="tool-title">SEO RECOMMENDATIONS ENGINE</div>
  <div style="display:flex;gap:8px;">
    <a href="/audit-workflow" class="btn btn-muted">← Workflow Manager</a>
    <a href="/audit-seo" class="btn btn-muted">🔬 PULSE+NEXUS</a>
    <button class="btn btn-muted" onclick="location.reload()">↺ Refresh</button>
  </div>
</div>

<!-- Summary -->
<div class="summary" id="summary"></div>

<!-- Filters -->
<div class="filter-bar">
  <select id="fType" onchange="render()">
    <option value="all">All recommendations</option>
    <option value="quickwin">⚡ Quick Wins</option>
    <option value="ctr">📈 CTR Fix</option>
    <option value="content">📝 Content Upgrade</option>
    <option value="rewrite">✏️ Rewrite</option>
    <option value="authority">🔗 Authority</option>
  </select>
  <select id="fPri" onchange="render()">
    <option value="all">All priorities</option>
    <option value="high">🔴 High</option>
    <option value="med">🟡 Medium</option>
    <option value="low">🟢 Low</option>
  </select>
  <select id="fStatus" onchange="render()">
    <option value="active">Not done</option>
    <option value="all">All pages</option>
    <option value="done">Done only</option>
  </select>
  <select id="fSort" onchange="render()">
    <option value="impact">Sort: Impact</option>
    <option value="position">Sort: Position</option>
    <option value="impressions">Sort: Impressions</option>
  </select>
</div>

<div class="rec-list" id="recList"></div>
</div>
<div class="toast" id="toast"></div>

<script>
var AUDIT_URL = '/audit-seo';
var pages = [];

function toast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},2500);
}

function load(){
  try{ var p=localStorage.getItem('cs_wf_pages'); if(p) pages=JSON.parse(p); }catch(e){}
}

// ── Recommendation engine ─────────────────────────────────
var RECS = {
  quickwin: {
    label:'Quick Win', badgeClass:'badge-quickwin', cardClass:'type-quickwin',
    title:'Title & Meta — 30 Minute Win',
    icon:'⚡',
  },
  ctr: {
    label:'CTR Fix', badgeClass:'badge-ctr', cardClass:'type-ctr',
    title:'CTR Surgery Needed',
    icon:'📈',
  },
  content: {
    label:'Content Upgrade', badgeClass:'badge-content', cardClass:'type-content',
    title:'Content Upgrade — Full Audit',
    icon:'📝',
  },
  rewrite: {
    label:'Rewrite + Audit', badgeClass:'badge-rewrite', cardClass:'type-rewrite',
    title:'Page Rewrite Required',
    icon:'✏️',
  },
  authority: {
    label:'Authority Gap', badgeClass:'badge-authority', cardClass:'type-authority',
    title:'Content Good — Build Authority',
    icon:'🔗',
  },
  build: {
    label:'Build Content', badgeClass:'badge-build', cardClass:'type-build',
    title:'Content Needs Building First',
    icon:'🏗️',
  },
};

function getRecommendation(p){
  var pos   = p.position   || 0;
  var ctr   = parseFloat(p.ctr) || 0;
  var impr  = p.impressions || 0;
  var score = parseFloat(p.scoreBefore) || 0;
  var hasScore = p.scoreBefore !== '' && p.scoreBefore !== undefined;

  // ── SCENARIO 1: Page 1 but low CTR ─────────────────────
  if(pos>=1 && pos<=10 && ctr<2){
    return {
      type:'quickwin',
      impactScore: 95,
      why: 'Je staat op pagina 1 (positie '+Math.round(pos)+') maar CTR is slechts '+ctr.toFixed(1)+'%. '
          +'Searchers zien je maar klikken niet. De title of meta description trekt niet genoeg aan.',
      action: 'Herschrijf de title tag (≤60 chars) en meta description (≤155 chars). '
             +'Voeg een getal, power word of urgentie-trigger toe.',
      auditFocus: 'CTR Surgery — Stap 2 in PULSE+NEXUS',
      time: '30 min',
      prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
      manual:    ['Pagina HTML (voor werkelijke title)','Competitor HTML'],
      quickWin:  true,
    };
  }

  // ── SCENARIO 2: Page 1, CTR ok — already winning ───────
  if(pos>=1 && pos<=10 && ctr>=2){
    if(hasScore && score>=85){
      return {
        type:'authority',
        impactScore: 40,
        why: 'Positie '+Math.round(pos)+', CTR '+ctr.toFixed(1)+'%, score '+score+'/100. '
            +'Pagina presteert goed. Verdere groei komt via linkbuilding en autoriteit.',
        action: 'Focus op interne links en externe backlinks. '
               +'Voeg expertcitaten en fresh data toe (2026).',
        auditFocus: 'NEXUS Signals — Stap 6 in PULSE+NEXUS',
        time: '1-2 uur',
        prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
        manual:    ['Sitemap URLs (voor interne links)','Competitor HTML'],
      };
    }
    return null; // Already performing well, no urgent action
  }

  // ── SCENARIO 3: Position 11-20 — closest to page 1 ─────
  if(pos>=11 && pos<=20){
    if(ctr<1.5){
      return {
        type:'ctr',
        impactScore: 92,
        why: 'Positie '+Math.round(pos)+' met CTR '+ctr.toFixed(1)+'%. '
            +'Je staat bijna op pagina 1 maar de CTR is laag. '
            +'Twee problemen: title trekt niet aan EN content net niet sterk genoeg.',
        action: 'Stap 1: title + meta herschrijven (30 min). '
               +'Stap 2: volledige PULSE+NEXUS audit voor de laatste push naar pagina 1.',
        auditFocus: 'Start met Stap 2 (CTR Surgery) dan Stap 1 (Priority Actions)',
        time: '1-3 uur',
        prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
        manual:    ['Pagina HTML','Competitor HTML','Sitemap URLs'],
        quickWin:  true,
      };
    }
    if(hasScore && score<70){
      return {
        type:'content',
        impactScore: 90,
        why: 'Positie '+Math.round(pos)+', score '+score+'/100. '
            +'Bijna pagina 1 maar de content is te zwak. '
            +'Met een score boven 80 heb je grote kans om naar de top te stijgen.',
        action: 'Volledige PULSE+NEXUS audit. Focus op content gaps, PULSE rewrites en schema.',
        auditFocus: 'Alle 10 stappen — Priority Actions eerst',
        time: '2-4 uur',
        prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
        manual:    ['Pagina HTML','Competitor HTML (Surfer SEO + MarketMuse als default)','Sitemap URLs'],
      };
    }
    return {
      type:'content',
      impactScore: 88,
      why: 'Positie '+Math.round(pos)+' — één sterke audit verwijderd van pagina 1. '
          +( impr>2000 ? impr.toLocaleString()+' impressies betekent veel te winnen. ' : '')
          +(hasScore ? 'Score: '+score+'/100.' : 'ContentScore nog onbekend — scan eerst.'),
      action: 'Volledige PULSE+NEXUS audit — focus op content gaps en interne links.',
      auditFocus: 'Alle 10 stappen — Priority Actions eerst',
      time: '2-3 uur',
      prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
      manual:    ['Pagina HTML','Competitor HTML','Sitemap URLs'],
    };
  }

  // ── SCENARIO 4: Position 21-30 ──────────────────────────
  if(pos>=21 && pos<=30){
    if(hasScore && score<70){
      return {
        type:'rewrite',
        impactScore: 82,
        why: 'Positie '+Math.round(pos)+', score '+score+'/100. '
            +'Content moet herschreven worden én de pagina heeft een volledige audit nodig. '
            +(impr>1000 ? 'Met '+impr.toLocaleString()+' impressies is de potentie er.' : ''),
        action: 'Pagina herschrijven op basis van PULSE+NEXUS aanbevelingen. '
               +'Daarna opnieuw scannen en score vergelijken.',
        auditFocus: 'Stap 5 (PULSE rewrites) + Stap 4 (Content Gap) zijn prioriteit',
        time: '3-5 uur',
        prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
        manual:    ['Pagina HTML (verplicht voor rewrite analyse)','Competitor HTML','Sitemap URLs'],
      };
    }
    return {
      type:'content',
      impactScore: 78,
      why: 'Positie '+Math.round(pos)+'. Pagina heeft potentie maar mist autoriteit of content diepte. '
          +(impr>500 ? impr.toLocaleString()+' impressies — het onderwerp heeft vraag.' : ''),
      action: 'Volledige audit — focus op NEXUS signals, interne links en schema.',
      auditFocus: 'Alle 10 stappen',
      time: '2-3 uur',
      prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
      manual:    ['Pagina HTML','Competitor HTML','Sitemap URLs'],
    };
  }

  // ── SCENARIO 5: Position 31-60 ──────────────────────────
  if(pos>=31 && pos<=60){
    if(impr>1000){
      return {
        type:'rewrite',
        impactScore: 70,
        why: 'Positie '+Math.round(pos)+' met '+impr.toLocaleString()+' impressies. '
            +'Veel zoekvolume maar Google vindt de pagina niet sterk genoeg voor pagina 1-3. '
            +'Diepgaande audit + content rewrite is de enige weg omhoog.',
        action: 'Diepgaande PULSE+NEXUS audit. Alle 10 stappen doorlopen. '
               +'Daarna content rewrite en schema toevoegen.',
        auditFocus: 'Alle 10 stappen — focus Stap 3 (Competitor Diff) en Stap 5 (PULSE rewrites)',
        time: '4-6 uur',
        prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
        manual:    ['Pagina HTML (kritiek)','Competitor HTML','Sitemap URLs'],
      };
    }
    return {
      type:'content',
      impactScore: 55,
      why: 'Positie '+Math.round(pos)+(impr<200?' met weinig impressies':'')+'. '
          +'Content is te zwak of het onderwerp heeft weinig vraag. '
          +'Audit geeft duidelijkheid welke richting het beste werkt.',
      action: 'Audit om te bepalen of herschrijven of nieuwe aanpak nodig is.',
      auditFocus: 'Stap 1 (Intent) en Stap 4 (Content Gap) eerst',
      time: '1-3 uur',
      prefilled: ['URL','Keyword','Positie','Impressies','CTR'],
      manual:    ['Pagina HTML','Competitor HTML'],
    };
  }

  // ── SCENARIO 6: Position 60+ ────────────────────────────
  if(pos>60){
    if(impr>500){
      return {
        type:'build',
        impactScore: 40,
        why: 'Positie '+Math.round(pos)+' maar '+impr.toLocaleString()+' impressies — er is vraag. '
            +'Google beoordeelt deze pagina als te zwak. Fundamentele content rebuild nodig.',
        action: 'Content volledig opnieuw schrijven met PULSE+NEXUS als briefing. '
               +'Focus op E-E-A-T, schema en content diepte.',
        auditFocus: 'Alle 10 stappen als content brief gebruiken',
        time: '5+ uur',
        prefilled: ['URL','Keyword'],
        manual:    ['Pagina HTML','Competitor HTML','Sitemap URLs','GSC queries'],
      };
    }
    return {
      type:'build',
      impactScore: 25,
      why: 'Positie '+Math.round(pos)+' met laag zoekvolume. '
          +'Eerst bepalen of dit zoekwoord de moeite waard is.',
      action: 'Keyword research eerst. Dan beslissen: rewrite of nieuw artikel.',
      auditFocus: 'Stap 1 (Intent analyse) als startpunt',
      time: 'Nader te bepalen',
      prefilled: ['URL','Keyword'],
      manual:    ['Alles — pagina heeft weinig data'],
    };
  }

  // No position data
  return {
    type:'content',
    impactScore: 50,
    why: 'Geen GSC data beschikbaar. Voeg positie en impressies toe vanuit GSC voor een betere aanbeveling.',
    action: 'Voeg GSC data toe, scan ContentScore, dan volledige audit.',
    auditFocus: 'Alle 10 stappen',
    time: 'Onbekend',
    prefilled: ['URL','Keyword'],
    manual:    ['GSC data','Pagina HTML','Competitor HTML'],
  };
}

function buildAuditUrl(p){
  var params = new URLSearchParams();
  params.set('url', p.url);
  if(p.keyword)     params.set('kw',   p.keyword);
  if(p.position)    params.set('pos',  p.position);
  if(p.impressions) params.set('impr', p.impressions);
  if(p.ctr)         params.set('ctr',  p.ctr);
  if(p.id)          params.set('wf',   p.id); // workflow callback
  return AUDIT_URL + '?' + params.toString();
}

function render(){
  var fType   = document.getElementById('fType').value;
  var fPri    = document.getElementById('fPri').value;
  var fStatus = document.getElementById('fStatus').value;
  var fSort   = document.getElementById('fSort').value;

  var arr = pages.filter(function(p){
    if(fStatus==='active' && p.status==='done') return false;
    if(fStatus==='done'   && p.status!=='done') return false;
    if(fPri!=='all' && p.priority!==fPri) return false;
    return true;
  }).map(function(p){
    return { page:p, rec:getRecommendation(p) };
  }).filter(function(x){
    if(!x.rec) return false;
    if(fType!=='all' && x.rec.type!==fType) return false;
    return true;
  });

  // Sort
  if(fSort==='impact')      arr.sort(function(a,b){ return b.rec.impactScore - a.rec.impactScore; });
  else if(fSort==='position') arr.sort(function(a,b){ return (a.page.position||999)-(b.page.position||999); });
  else if(fSort==='impressions') arr.sort(function(a,b){ return b.page.impressions-a.page.impressions; });

  // Summary
  var types = {};
  arr.forEach(function(x){ types[x.rec.type]=(types[x.rec.type]||0)+1; });
  var quickwins = arr.filter(function(x){ return x.rec.quickWin; }).length;
  document.getElementById('summary').innerHTML =
    '<div class="sum-card"><div class="sum-n" style="color:var(--blue)">'+arr.length+'</div><div class="sum-l">Total pages</div></div>'
   +'<div class="sum-card"><div class="sum-n" style="color:var(--green)">'+quickwins+'</div><div class="sum-l">Quick wins</div></div>'
   +'<div class="sum-card"><div class="sum-n" style="color:var(--gold)">'+(types.content||0)+'</div><div class="sum-l">Need audit</div></div>'
   +'<div class="sum-card"><div class="sum-n" style="color:var(--orange)">'+(types.rewrite||0)+'</div><div class="sum-l">Need rewrite</div></div>';

  if(!arr.length){
    document.getElementById('recList').innerHTML='<div class="empty"><h3>No Pages</h3><p>Add pages in the Workflow Manager first, or adjust filters.</p></div>';
    return;
  }

  document.getElementById('recList').innerHTML = arr.map(function(x,i){
    var p   = x.page;
    var rec = x.rec;
    var R   = RECS[rec.type] || RECS.content;
    var auditUrl = buildAuditUrl(p);

    var shortUrl='';
    try{shortUrl=new URL(p.url).pathname||'/';}catch(e){shortUrl=p.url.slice(0,50);}
    if(shortUrl.length>60) shortUrl=shortUrl.slice(0,60)+'…';

    var gscChips = '';
    if(p.position)    gscChips+='<span class="meta-chip"><strong>Pos</strong> '+Math.round(p.position)+'</span>';
    if(p.impressions) gscChips+='<span class="meta-chip"><strong>Impr</strong> '+p.impressions.toLocaleString()+'</span>';
    if(p.ctr)         gscChips+='<span class="meta-chip"><strong>CTR</strong> '+parseFloat(p.ctr).toFixed(1)+'%</span>';
    if(p.scoreBefore) gscChips+='<span class="meta-chip"><strong>Score</strong> '+p.scoreBefore+'/100</span>';

    var prefillHtml = rec.prefilled.map(function(item){
      return '<div class="prefill-row auto"><span class="prefill-dot dot-auto"></span>'+item+'</div>';
    }).join('');
    var manualHtml = rec.manual.map(function(item){
      return '<div class="prefill-row manual"><span class="prefill-dot dot-manual"></span>'+item+'</div>';
    }).join('');

    return '<div class="rec-card '+R.cardClass+'">'

      // Head
      +'<div class="rec-head">'
      +'<div><span class="rec-badge '+R.badgeClass+'">'+R.icon+' '+R.label+'</span></div>'
      +'<div class="rec-main">'
      +'<div class="rec-url">'+shortUrl+'</div>'
      +(p.keyword?'<div class="rec-kw">'+p.keyword+'</div>':'')
      +'<div class="rec-title">'+rec.title+'</div>'
      +'<div class="rec-why">'+rec.why+'</div>'
      +'<div class="rec-action">'+rec.action+'</div>'
      +(gscChips?'<div class="rec-meta">'+gscChips+'</div>':'')
      +'</div>'

      // Pre-fill info
      +'<div class="prefill-box">'
      +'<div class="prefill-title">In PULSE+NEXUS</div>'
      +(prefillHtml?'<div style="margin-bottom:6px;font-family:\\'IBM Plex Mono\\',monospace;font-size:8px;letter-spacing:.08em;color:var(--green);text-transform:uppercase;">✓ Auto-ingevuld</div>'+prefillHtml:'')
      +(manualHtml?'<div style="margin:8px 0 4px;font-family:\\'IBM Plex Mono\\',monospace;font-size:8px;letter-spacing:.08em;color:var(--dim);text-transform:uppercase;">✎ Handmatig</div>'+manualHtml:'')
      +'</div>'
      +'</div>'

      // Footer with action
      +'<div class="rec-foot">'
      +'<a href="'+auditUrl+'" target="_blank" class="action-btn action-btn-gold">🔬 Open in PULSE+NEXUS →</a>'
      +'<a href="'+p.url+'" target="_blank" class="action-btn action-btn-blue">↗ Open pagina</a>'
      +'<span class="time-chip">⏱ '+rec.time+'</span>'
      +(rec.auditFocus?'<span style="font-family:\\'IBM Plex Mono\\',monospace;font-size:9px;color:var(--sub);letter-spacing:.06em;">'+rec.auditFocus+'</span>':'')
      +'</div>'

      +'</div>';
  }).join('');
}

load();
render();
</script>
</body>
</html>
`);
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
            response_modalities: ['AUDIO']
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
const _SEO_AUDIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PULSE + NEXUS v4 | ContentScale Elite SEO Audit</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#030712;--card:#0f172a;--surface:#1e293b;--border:#334155;
  --ink:#f9fafb;--muted:#94a3b8;--sub:#64748b;--dim:#475569;
  --purple:#a78bfa;--blue:#60a5fa;--green:#4ade80;--orange:#fb923c;
  --amber:#f59e0b;--red:#f43f3f;--gold:#fbbf24;
  --pulse:#f43f3f;--nexus:#a78bfa;
}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',sans-serif;min-height:100vh;line-height:1.5;}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px 80px;}

/* Topbar */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:28px;flex-wrap:wrap;gap:12px;}
.brand{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-decoration:none;}
.topbar-title{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.04em;background:linear-gradient(90deg,var(--pulse),var(--nexus));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.topbar-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);}

/* Modes */
.modes{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:28px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.mode-btn{padding:16px 20px;font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.05em;background:none;border:none;border-right:1px solid var(--border);color:var(--sub);cursor:pointer;transition:all .2s;text-align:left;display:flex;align-items:center;gap:12px;}
.mode-btn:last-child{border-right:none;}
.mode-btn.active{background:rgba(255,255,255,.04);color:var(--ink);}
.mode-btn .mi{font-size:22px;}
.mode-btn .ms{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);display:block;margin-top:3px;}
.mode-btn.active .ms{color:var(--muted);}

/* Panel */
.panel{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:26px;margin-bottom:18px;position:relative;overflow:hidden;}
.panel::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--pulse),var(--gold),var(--nexus));}
.panel-title{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--sub);margin-bottom:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.panel-badge{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:rgba(251,191,36,.15);color:var(--gold);border:1px solid rgba(251,191,36,.3);}

/* Upload */
.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:32px;text-align:center;cursor:pointer;transition:all .2s;position:relative;}
.upload-zone:hover,.upload-zone.drag{border-color:var(--gold);background:rgba(251,191,36,.04);}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}

/* Fields */
.field{margin-bottom:0;}
.field label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--sub);display:block;margin-bottom:7px;}
.field input,.field select,.field textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:11px 13px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);outline:none;transition:all .2s;resize:vertical;}
.field textarea{min-height:90px;font-family:'IBM Plex Mono',monospace;font-size:11px;}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(251,191,36,.07);}
.field select option{background:var(--card);}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;}

/* Buttons */
.btn-gold{background:var(--gold);color:#000;border:none;font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.05em;padding:16px 36px;border-radius:6px;cursor:pointer;transition:all .2s;width:100%;margin-top:6px;}
.btn-gold:hover{background:var(--ink);transform:translateY(-1px);}
.btn-gold:disabled{opacity:.35;cursor:not-allowed;transform:none;}
.btn-sm{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:4px;cursor:pointer;transition:all .15s;border:1px solid;white-space:nowrap;}
.btn-blue{background:rgba(96,165,250,.1);border-color:rgba(96,165,250,.3);color:var(--blue);}
.btn-blue:hover{background:var(--blue);color:#000;}
.btn-purple{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3);color:var(--purple);}
.btn-purple:hover{background:var(--purple);color:#000;}
.btn-green{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.3);color:var(--green);}
.btn-green:hover{background:var(--green);color:#000;}
.btn-muted{background:var(--surface);border-color:var(--border);color:var(--muted);}
.btn-muted:hover{color:var(--ink);}

/* Priority box — shown first */
.priority-box{background:linear-gradient(135deg,rgba(251,191,36,.08),rgba(244,63,63,.05));border:1px solid rgba(251,191,36,.3);border-radius:10px;padding:20px;margin-bottom:14px;}
.priority-box-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.04em;color:var(--gold);margin-bottom:12px;display:flex;align-items:center;gap:8px;}

/* Opportunity table */
.opp-table{width:100%;border-collapse:collapse;font-size:12px;}
.opp-table th{background:var(--surface);color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:9px 11px;text-align:left;border:1px solid var(--border);}
.opp-table td{padding:9px 11px;border:1px solid var(--border);vertical-align:middle;}
.opp-table tr:hover td{background:rgba(255,255,255,.02);}
.opp-bar{height:5px;border-radius:3px;background:linear-gradient(90deg,var(--pulse),var(--gold));margin-top:3px;}
.trend-up{color:var(--green);}
.trend-down{color:var(--red);}
.trend-flat{color:var(--muted);}

/* Cannibalization */
.cann-card{background:rgba(244,63,63,.05);border:1px solid rgba(244,63,63,.2);border-radius:6px;padding:14px;margin-bottom:10px;}
.cann-card h4{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin-bottom:8px;}

/* Progress */
.progress{display:none;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:22px;margin-bottom:18px;}
.progress.show{display:block;}
.prog-label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;}
.prog-step{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px;color:var(--dim);}
.prog-step:last-child{border:none;}
.prog-step.active{color:var(--gold);}
.prog-step.done{color:var(--green);}
.prog-step.error{color:var(--red);}
.prog-icon{font-size:14px;width:18px;text-align:center;flex-shrink:0;}
.prog-bar-wrap{background:var(--surface);border-radius:4px;height:4px;overflow:hidden;margin-top:12px;}
.prog-bar{height:100%;background:linear-gradient(90deg,var(--pulse),var(--gold),var(--nexus));transition:width .5s ease;border-radius:4px;width:0%;}

/* Output */
.output{display:none;}
.output.show{display:block;}
.sec-card{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;overflow:hidden;}
.sec-head{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer;background:rgba(255,255,255,.02);}
.sec-head:hover{background:rgba(255,255,255,.04);}
.sec-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.05em;flex:1;}
.badge{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:3px;}
.b-pulse{background:rgba(244,63,63,.15);color:var(--pulse);border:1px solid rgba(244,63,63,.3);}
.b-nexus{background:rgba(167,139,250,.15);color:var(--nexus);border:1px solid rgba(167,139,250,.3);}
.b-tech{background:rgba(96,165,250,.15);color:var(--blue);border:1px solid rgba(96,165,250,.3);}
.b-win{background:rgba(74,222,128,.15);color:var(--green);border:1px solid rgba(74,222,128,.3);}
.b-gold{background:rgba(251,191,36,.15);color:var(--gold);border:1px solid rgba(251,191,36,.3);}
.sec-body{padding:20px;}
.sec-body.hidden{display:none;}

/* Markdown */
.md{font-size:13px;line-height:1.8;color:var(--muted);}
.md h1,.md h2,.md h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.04em;color:var(--ink);margin:16px 0 7px;}
.md h1{font-size:25px;}
.md h2{font-size:20px;color:var(--gold);}
.md h3{font-size:15px;color:var(--purple);}
.md p{margin-bottom:9px;}
.md ul,.md ol{margin:7px 0 13px 16px;}
.md li{margin-bottom:4px;}
.md strong{color:var(--ink);font-weight:700;}
.md em{color:var(--amber);}
.md code{background:var(--surface);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--blue);}
.md pre{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:13px;overflow-x:auto;margin:11px 0;}
.md pre code{background:none;border:none;padding:0;font-size:11px;}
.md table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;}
.md th{background:var(--surface);color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:7px 10px;text-align:left;border:1px solid var(--border);}
.md td{padding:7px 10px;border:1px solid var(--border);}
.md tr:hover td{background:rgba(255,255,255,.02);}
.md blockquote{border-left:3px solid var(--gold);padding:9px 14px;background:rgba(251,191,36,.05);border-radius:0 6px 6px 0;margin:11px 0;font-style:italic;color:var(--ink);}
.md hr{border:none;border-top:1px solid var(--border);margin:16px 0;}

.info{background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:6px;padding:11px 14px;font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px;}
.info strong{color:var(--blue);}
.warn{background:rgba(244,63,63,.06);border:1px solid rgba(244,63,63,.2);border-radius:6px;padding:11px 14px;font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px;}
.warn strong{color:var(--red);}

.toast{position:fixed;bottom:40px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--gold);color:#000;padding:11px 22px;border-radius:50px;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;opacity:0;transition:all .3s;z-index:10000;pointer-events:none;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}

/* Priority action card */
.action-card{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-radius:7px;margin-bottom:8px;}
.action-num{font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1;flex-shrink:0;width:28px;}
.action-body strong{color:var(--ink);font-size:13px;display:block;margin-bottom:3px;}
.action-body span{font-size:11px;color:var(--muted);}

#bulkView,#deepView{display:none;}
#bulkView.active,#deepView.active{display:block;}

@media(max-width:720px){
  .g2,.g3,.g4,.modes{grid-template-columns:1fr;}
  .wrap{padding:0 16px 60px;}
  .topbar{padding:14px 0;}
  .brand{font-size:20px;}
}

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
  <nav class="topbar">
    <a href="https://contentscale.site" class="brand">ContentScale</a>
    <div style="text-align:right;">
      <div class="topbar-title">PULSE + NEXUS v4</div>
      <div class="topbar-sub">Elite SEO Audit Engine</div>
    </div>
  </nav>

  <div class="modes">
    <button class="mode-btn active" onclick="setMode('bulk')" id="modeBulk">
      <span class="mi">📊</span>
      <span>BULK SCAN<span class="ms">Upload GSC CSV → rank pages → quick wins</span></span>
    </button>
    <button class="mode-btn" onclick="setMode('deep')" id="modeDeep">
      <span class="mi">🔬</span>
      <span>DEEP DIVE<span class="ms">Paste HTML → full 10-step audit + competitor diff</span></span>
    </button>
  </div>

  <!-- ══════════ BULK SCAN ══════════ -->
  <div id="bulkView" class="active">
    <div class="panel">
      <div class="panel-title">① Upload GSC CSV Files <span class="panel-badge">DRAG & DROP</span></div>
      <div class="info">
        <strong>Pages CSV:</strong> GSC → Performance → Pages → Export CSV &nbsp;·&nbsp;
        <strong>Queries CSV:</strong> GSC → Performance → Queries → Export CSV (enables cannibalization)
      </div>
      <div class="g2" style="gap:16px;">
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--sub);margin-bottom:8px;">Pages CSV (required)</div>
          <div class="upload-zone" id="pagesZone">
            <input type="file" id="pagesFile" accept=".csv" onchange="handlePagesCSV(this)">
            <div style="font-size:28px;margin-bottom:8px;">📄</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;">Pages Performance</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;">Page · Clicks · Impressions · CTR · Position</div>
          </div>
          <div id="pagesStatus" style="margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
        </div>
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--sub);margin-bottom:8px;">Queries CSV (optional)</div>
          <div class="upload-zone" id="queriesZone">
            <input type="file" id="queriesFile" accept=".csv" onchange="handleQueriesCSV(this)">
            <div style="font-size:28px;margin-bottom:8px;">🔍</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;">Queries Performance</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;">Query · Clicks · Impressions · CTR · Position</div>
          </div>
          <div id="queriesStatus" style="margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
        </div>
      </div>
    </div>

    <div class="panel" id="filterPanel" style="display:none;">
      <div class="panel-title">② Filter & Focus</div>
      <div class="g4">
        <div class="field"><label>Min Impressions</label><input type="number" id="minImpr" value="100" onchange="renderTable()"></div>
        <div class="field"><label>Min Position</label><input type="number" id="minPos" value="5" onchange="renderTable()"></div>
        <div class="field"><label>Max Position</label><input type="number" id="maxPos" value="50" onchange="renderTable()"></div>
        <div class="field"><label>Max CTR %</label><input type="number" id="maxCtr" step="0.1" value="10" onchange="renderTable()"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);" id="tableCount"></span>
        <button class="btn-sm btn-muted" onclick="exportOpps()">↓ Export CSV</button>
        <button class="btn-sm btn-green" onclick="showCannibalization()">🔍 Cannibalization Report</button>
      </div>
    </div>

    <div id="cannReport" style="display:none;" class="panel">
      <div class="panel-title">🔍 Keyword Cannibalization Detection <span class="panel-badge">AUTO-DETECTED</span></div>
      <div id="cannBody"></div>
    </div>

    <div id="opportunityTable" style="display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.04em;">🎯 Pages Ranked by Opportunity</div>
      </div>
      <div style="overflow-x:auto;">
        <table class="opp-table">
          <thead>
            <tr><th>#</th><th>Page</th><th>Impr</th><th>CTR</th><th>Pos</th><th>Score</th><th>Actions</th></tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>

    <div class="progress" id="quickProgress">
      <div class="prog-label" id="quickProgLabel">Quick Audit Running...</div>
      <div id="quickSteps"></div>
      <div class="prog-bar-wrap"><div class="prog-bar" id="quickBar"></div></div>
    </div>
    <div class="output" id="quickOutput"></div>
  </div>

  <!-- ══════════ DEEP DIVE ══════════ -->
  <div id="deepView">

    <div class="panel">
      <div class="panel-title">① Page Details</div>
      <div class="g2" style="margin-bottom:14px;">
        <div class="field"><label>Page URL *</label><input type="url" id="dUrl" placeholder="https://contentscale.site/graaf-framework"></div>
        <div class="field"><label>Primary Keyword *</label><input type="text" id="dKw" placeholder="GRAAF framework SEO 2026"></div>
      </div>
      <div class="g3">
        <div class="field"><label>Secondary Keyword</label><input type="text" id="dKw2" placeholder="EEAT content score"></div>
        <div class="field">
          <label>Geo</label>
          <select id="dGeo">
            <option value="Netherlands">Netherlands 🇳🇱</option>
            <option value="Belgium">Belgium 🇧🇪</option>
            <option value="Global">Global</option>
            <option value="UK">UK</option>
            <option value="USA">USA</option>
          </select>
        </div>
        <div class="field">
          <label>Conversion Goal</label>
          <select id="dGoal">
            <option>Lead generation</option>
            <option>Sale / purchase</option>
            <option>Demo / consultation</option>
            <option>Brand awareness</option>
          </select>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">② GSC Data</div>
      <div class="g4" style="margin-bottom:14px;">
        <div class="field"><label>Impressions</label><input type="number" id="dImpr" placeholder="12400"></div>
        <div class="field"><label>CTR %</label><input type="number" step="0.1" id="dCtr" placeholder="1.8"></div>
        <div class="field"><label>Avg Position</label><input type="number" step="0.1" id="dPos" placeholder="34.2"></div>
        <div class="field"><label>Mobile %</label><input type="number" id="dMob" placeholder="62"></div>
      </div>
      <div class="field">
        <label>Top Triggering Queries (one per line)</label>
        <textarea id="dQueries" placeholder="graaf framework seo&#10;eeat content score&#10;seo content scanner free"></textarea>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">③ Your Page HTML <span class="panel-badge">GAME CHANGER</span></div>
      <div class="info">
        <strong>Chrome:</strong> Open page → Right-click → View Page Source → Ctrl+A → Ctrl+C → paste below.<br>
        The engine reads your ACTUAL H1, H2s, schema, word count — not guesses.
      </div>
      <div class="field">
        <label>Raw HTML (full page source)</label>
        <textarea id="dHtml" style="min-height:130px;font-size:11px;" placeholder="<!DOCTYPE html>&#10;<html>...paste full page source...</html>" oninput="updateHtmlStats('dHtml','dHtmlStats')"></textarea>
      </div>
      <div id="dHtmlStats" style="margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
    </div>

    <!-- META CONSISTENCY CHECKER — Stap ③b -->
    <div class="panel" id="metaCheckerPanel">
      <div class="panel-title">③b Meta Consistency Check <span class="panel-badge">DIRECT FEEDBACK</span></div>
      <div class="info" id="metaCheckerInfo" style="display:none;"></div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.7;">
        Plak je HTML hierboven (③) en klik Check — het systeem vergelijkt title, og:title, twitter:title, schema headline, dateModified, author en meer. Inconsistenties worden direct gemarkeerd.
      </div>
      <button class="btn-gold" style="font-size:16px;padding:12px 28px;width:auto;" onclick="runMetaCheck()">🔍 Check Meta Consistency</button>
      <div id="metaCheckResults" style="margin-top:16px;"></div>
    </div>

    <div class="panel">
      <div class="panel-title">④ Competitor HTML <span class="panel-badge">GAME CHANGER</span></div>
      <div class="info">
        <strong>Leave empty</strong> → defaults to Surfer SEO &amp; MarketMuse benchmark comparison from training data.<br>
        <strong>Paste HTML</strong> → real side-by-side diff of their actual content vs yours.
      </div>
      <div class="g2" style="gap:16px;">
        <div>
          <div class="field" style="margin-bottom:8px;"><label>Competitor 1 URL</label><input type="url" id="dComp1url" placeholder="https://surferseo.com/..."></div>
          <div class="field">
            <label>Competitor 1 HTML (optional)</label>
            <textarea id="dComp1html" style="min-height:100px;font-size:11px;" placeholder="Paste HTML or leave empty for Surfer SEO benchmark" oninput="updateHtmlStats('dComp1html','dComp1stats')"></textarea>
          </div>
          <div id="dComp1stats" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
        </div>
        <div>
          <div class="field" style="margin-bottom:8px;"><label>Competitor 2 URL</label><input type="url" id="dComp2url" placeholder="https://marketmuse.com/..."></div>
          <div class="field">
            <label>Competitor 2 HTML (optional)</label>
            <textarea id="dComp2html" style="min-height:100px;font-size:11px;" placeholder="Paste HTML or leave empty for MarketMuse benchmark" oninput="updateHtmlStats('dComp2html','dComp2stats')"></textarea>
          </div>
          <div id="dComp2stats" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">⑤ Internal Link Finder <span class="panel-badge">GAME CHANGER</span></div>
      <div class="info">
        <strong>Paste your sitemap URLs</strong> (one per line) → engine finds the 5 best pages to link FROM and TO, with exact anchor text.
      </div>
      <div class="field">
        <label>Your Site URLs (one per line)</label>
        <textarea id="dSiteUrls" style="min-height:90px;font-size:11px;" placeholder="https://contentscale.site/&#10;https://contentscale.site/graaf-framework&#10;https://contentscale.site/craft-framework"></textarea>
      </div>
      <div id="urlCount" style="margin-top:5px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);"></div>
    </div>

    <div class="panel">
      <div class="panel-title">⑥ Optional</div>
      <div class="field"><label>Known Constraints</label><input type="text" id="dConstraints" placeholder="WordPress, no JS injection, GDPR-strict, multilingual NL/EN"></div>
    </div>

    <button class="btn-gold" id="deepRunBtn" onclick="runDeepAudit()">🔬 RUN FULL 10-STEP AUDIT — PRIORITY ACTIONS FIRST</button>

    <div class="progress" id="deepProgress">
      <div class="prog-label">Full Audit Running — 10 Steps · Do Not Close</div>
      <div id="deepSteps"></div>
      <div class="prog-bar-wrap"><div class="prog-bar" id="deepBar"></div></div>
    </div>
    <div class="output" id="deepOutput"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
let gscPages = [];
let gscQueries = [];

// ── Auto-load GSC data shared from Audit Workflow Manager ──
(function() {
  try {
    const shared = localStorage.getItem('cs_shared_gsc');
    if (shared) {
      const data = JSON.parse(shared);
      if (data.pages && data.pages.length) {
        gscPages = data.pages;
        setTimeout(function() {
          const el = document.getElementById('pagesStatus');
          if (el) el.innerHTML = '<span style="color:var(--green)">✓ ' + gscPages.length + ' pages loaded from Workflow Manager</span>';
        }, 500);
        console.log('[PULSE+NEXUS] Loaded', gscPages.length, 'pages from shared GSC data');
      }
      if (data.queries && data.queries.length) {
        gscQueries = data.queries;
        setTimeout(function() {
          const el = document.getElementById('queriesStatus');
          if (el) el.innerHTML = '<span style="color:var(--green)">✓ ' + gscQueries.length + ' queries loaded from Workflow Manager</span>';
        }, 500);
      }
    }
  } catch(e) { console.warn('[PULSE+NEXUS] Could not load shared GSC:', e.message); }
})();

const RAILWAY = 'https://app.contentscale.site';


// ── META CONSISTENCY CHECKER ─────────────────────────────────
function runMetaCheck() {
  var html = document.getElementById('dHtml').value.trim();
  if (!html) {
    document.getElementById('metaCheckerInfo').style.display = 'block';
    document.getElementById('metaCheckerInfo').innerHTML = '<strong style="color:var(--red)">⚠ First paste your page HTML in field ③ above.</strong>';
    return;
  }
  document.getElementById('metaCheckerInfo').style.display = 'none';

  var doc = new DOMParser().parseFromString(html, 'text/html');
  var results = [];

  // ── Extract all fields ──
  var title       = (doc.querySelector('title')?.textContent || '').trim();
  var h1          = Array.from(doc.querySelectorAll('h1')).map(e => e.textContent.trim()).filter(Boolean)[0] || '';
  var metaDesc    = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  var ogTitle     = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
  var ogDesc      = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
  var ogImage     = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() || '';
  var ogUrl       = doc.querySelector('meta[property="og:url"]')?.getAttribute('content')?.trim() || '';
  var twTitle     = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim() || '';
  var twDesc      = doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content')?.trim() || '';
  var twCard      = doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')?.trim() || '';
  var twImage     = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() || '';
  var canonical   = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || '';
  var viewport    = doc.querySelector('meta[name="viewport"]')?.getAttribute('content')?.trim() || '';

  // Schema extraction
  var schemas = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(s => {
    try { return JSON.parse(s.textContent); } catch(e) { return null; }
  }).filter(Boolean);
  var flatSchemas = schemas.flatMap(s => Array.isArray(s) ? s : (s['@graph'] ? s['@graph'] : [s]));

  var articleSchema = flatSchemas.find(s => ['Article','BlogPosting','NewsArticle','WebPage','TechArticle'].includes(s['@type']));
  var orgSchema     = flatSchemas.find(s => ['Organization','LocalBusiness','Person'].includes(s['@type']));
  var faqSchema     = flatSchemas.find(s => s['@type'] === 'FAQPage');

  var schemaHeadline    = articleSchema?.headline?.trim() || '';
  var schemaDesc        = articleSchema?.description?.trim() || '';
  var schemaDatePub     = articleSchema?.datePublished || '';
  var schemaDateMod     = articleSchema?.dateModified || '';
  var schemaAuthorName  = (articleSchema?.author?.name || articleSchema?.author?.[0]?.name || '').trim();
  var schemaImage       = articleSchema?.image?.url || articleSchema?.image || '';
  var schemaUrl         = articleSchema?.url || '';

  var now = new Date();
  var thisYear = now.getFullYear().toString();
  var thisMonth = (now.getMonth()+1).toString().padStart(2,'0');
  var today = thisYear + '-' + thisMonth;

  // ── Check functions ──
  function ok(label, value, note) {
    results.push({ status:'ok', label, value, note });
  }
  function warn(label, value, fix, severity) {
    results.push({ status:'warn', label, value, fix, severity: severity||'medium' });
  }
  function err(label, value, fix) {
    results.push({ status:'err', label, value, fix, severity:'high' });
  }

  // ── 1. Title tag ──
  if (!title) err('Title tag', 'MISSING', 'Voeg <title> toe met primair keyword (50-60 chars)');
  else if (title.length < 40) warn('Title tag te kort', title + ' (' + title.length + ' chars)', 'Breid uit naar 50-60 chars', 'low');
  else if (title.length > 65) warn('Title tag te lang', title + ' (' + title.length + ' chars)', 'Trim naar 50-60 chars — wordt afgekapt in Google', 'medium');
  else ok('Title tag', title + ' (' + title.length + ' chars)', '✓ Goede lengte');

  // ── 2. H1 vs Title consistency ──
  if (!h1) err('H1', 'MISSING', 'Voeg exact 1 H1 toe met primair keyword');
  else {
    var titleCore = title.split(/[|\\-–:]/)[0].trim().toLowerCase();
    var h1Core = h1.toLowerCase().substring(0,60);
    var overlap = titleCore.split(' ').filter(w => w.length > 3 && h1Core.includes(w)).length;
    if (overlap === 0) warn('H1 ↔ Title inconsistentie', 'H1: "'+h1.substring(0,60)+'" / Title: "'+title.substring(0,60)+'"', 'H1 en Title moeten hetzelfde primaire keyword bevatten', 'high');
    else ok('H1 ↔ Title overlap', 'H1: "'+h1.substring(0,50)+'"', '✓ Keyword overlap gevonden');
  }

  // ── 3. og:title ──
  if (!ogTitle) err('og:title', 'MISSING', 'Voeg <meta property="og:title"> toe — identiek aan je title tag');
  else {
    var sim = ogTitle.toLowerCase().split(' ').filter(w => w.length > 3 && title.toLowerCase().includes(w)).length;
    if (sim === 0) warn('og:title ↔ Title mismatch', 'og:title: "'+ogTitle+'" / title: "'+title+'"', 'og:title moet overeenkomen met je <title> tag', 'high');
    else ok('og:title', ogTitle.substring(0,60), '✓ Consistent met title');
  }

  // ── 4. twitter:title ──
  if (!twTitle) warn('twitter:title', 'MISSING', 'Voeg <meta name="twitter:title"> toe', 'medium');
  else {
    var simTw = twTitle.toLowerCase().split(' ').filter(w => w.length > 3 && title.toLowerCase().includes(w)).length;
    if (simTw === 0) warn('twitter:title ↔ Title mismatch', '"'+twTitle+'"', 'Zet gelijk aan title tag', 'medium');
    else ok('twitter:title', twTitle.substring(0,60), '✓ Consistent');
  }

  // ── 5. Schema headline ──
  if (!schemaHeadline && articleSchema) warn('Schema headline', 'MISSING in Article schema', 'Voeg "headline": "'+title+'" toe aan je Article schema', 'high');
  else if (schemaHeadline) {
    var schSim = schemaHeadline.toLowerCase().split(' ').filter(w => w.length > 3 && title.toLowerCase().includes(w)).length;
    if (schSim === 0) warn('Schema headline ↔ Title mismatch', '"'+schemaHeadline+'"', 'Schema headline moet overeenkomen met je <title> tag', 'high');
    else ok('Schema headline', '"'+schemaHeadline.substring(0,60)+'"', '✓ Consistent met title');
  }
  if (!articleSchema) warn('Article schema', 'MISSING', 'Voeg Article/BlogPosting JSON-LD toe aan <head>', 'high');

  // ── 6. dateModified ──
  if (!schemaDateMod && articleSchema) err('Schema dateModified', 'MISSING', 'Voeg "dateModified": "'+now.toISOString().split('T')[0]+'" toe aan je Article schema');
  else if (schemaDateMod) {
    var modYear = schemaDateMod.substring(0,4);
    var modMonth = schemaDateMod.substring(0,7);
    if (modYear !== thisYear) warn('Schema dateModified — jaar verouderd', '"'+schemaDateMod+'"', 'Update naar '+now.toISOString().split('T')[0]+' — Google ziet dit als verouderd', 'high');
    else if (modMonth !== today) warn('Schema dateModified — maand niet actueel', '"'+schemaDateMod+'"', 'Update naar '+now.toISOString().split('T')[0]+' na elke content update', 'medium');
    else ok('Schema dateModified', '"'+schemaDateMod+'"', '✓ Actueel');
  }

  // ── 7. datePublished ──
  if (!schemaDatePub && articleSchema) warn('Schema datePublished', 'MISSING', 'Voeg "datePublished" toe aan Article schema', 'medium');
  else if (schemaDatePub) {
    ok('Schema datePublished', '"'+schemaDatePub+'"', '');
  }

  // ── 8. Meta description ──
  if (!metaDesc) err('Meta description', 'MISSING', 'Voeg <meta name="description"> toe (150-160 chars)');
  else if (metaDesc.length < 100) warn('Meta description te kort', metaDesc.length+' chars', 'Breid uit naar 150-160 chars', 'medium');
  else if (metaDesc.length > 165) warn('Meta description te lang', metaDesc.length+' chars — wordt afgekapt', 'Trim naar 150-160 chars', 'low');
  else ok('Meta description', metaDesc.length+' chars', '✓ Goede lengte');

  // ── 9. og:description ──
  if (!ogDesc) warn('og:description', 'MISSING', 'Voeg <meta property="og:description"> toe', 'low');
  else ok('og:description', ogDesc.substring(0,60)+'…', '✓ Aanwezig');

  // ── 10. og:image ──
  if (!ogImage) warn('og:image', 'MISSING', 'Voeg og:image toe (aanbevolen: 1200×630px)', 'medium');
  else {
    if (!ogImage.startsWith('http')) warn('og:image — relatieve URL', ogImage, 'Gebruik absolute URL (https://...)', 'high');
    else ok('og:image', ogImage.substring(0,60)+'…', '');
    if (ogImage === twImage || !twImage) {
      if (!twImage) warn('twitter:image', 'MISSING', 'Voeg twitter:image toe (kan zelfde zijn als og:image)', 'low');
    } else {
      ok('twitter:image', twImage.substring(0,60)+'…', '');
    }
  }

  // ── 11. twitter:card ──
  if (!twCard) warn('twitter:card', 'MISSING', 'Voeg <meta name="twitter:card" content="summary_large_image"> toe', 'medium');
  else ok('twitter:card', twCard, '');

  // ── 12. canonical ──
  if (!canonical) warn('Canonical tag', 'MISSING', 'Voeg <link rel="canonical" href="https://..."> toe', 'medium');
  else {
    if (!canonical.startsWith('http')) warn('Canonical — relatieve URL', canonical, 'Gebruik absolute URL', 'high');
    else ok('Canonical', canonical, '');
  }

  // ── 13. og:url ──
  if (!ogUrl) warn('og:url', 'MISSING', 'Voeg <meta property="og:url"> toe — zelfde als canonical', 'low');
  else if (canonical && ogUrl !== canonical) warn('og:url ↔ Canonical mismatch', 'og:url: '+ogUrl+' / canonical: '+canonical, 'og:url en canonical moeten identiek zijn', 'high');
  else ok('og:url', ogUrl.substring(0,60), '✓ Consistent met canonical');

  // ── 14. Schema author ──
  if (articleSchema && !schemaAuthorName) warn('Schema author', 'MISSING', 'Voeg "author": {"@type":"Person","name":"Jouw naam"} toe aan Article schema', 'medium');
  else if (schemaAuthorName) ok('Schema author', '"'+schemaAuthorName+'"', '');

  // ── 15. viewport ──
  if (!viewport) err('Meta viewport', 'MISSING', 'Voeg <meta name="viewport" content="width=device-width, initial-scale=1"> toe');
  else ok('Meta viewport', viewport, '✓ Aanwezig');

  // ── 16. Year in content ──
  var bodyText = (doc.body?.innerText || '').toLowerCase();
  var lastYear = (thisYear - 1).toString();
  var yearMatches = (html.match(/202[0-9]/g) || []);
  var oldYears = yearMatches.filter(y => parseInt(y) < parseInt(thisYear) - 1);
  if (oldYears.length > 3) warn('Verouderde jaren in HTML', 'Gevonden: '+[...new Set(oldYears)].join(', '), 'Controleer of '+[...new Set(oldYears)].join('/')+ ' moet worden bijgewerkt naar '+thisYear, 'medium');
  else if (oldYears.length > 0) ok('Jaren in HTML', 'Verouderde jaren: '+[...new Set(oldYears)].join(', '), '⚠ Controleer of updates nodig zijn');
  else ok('Jaren in HTML', 'Alleen actuele jaren gevonden', '✓');

  // ── Render results ──
  var errs  = results.filter(r => r.status === 'err');
  var warns = results.filter(r => r.status === 'warn');
  var oks   = results.filter(r => r.status === 'ok');

  var score = Math.round((oks.length / results.length) * 100);
  var scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--gold)' : 'var(--red)';

  var html_out = '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:14px 18px;background:var(--surface);border-radius:8px;">'
    + '<div><span style="font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);">Meta Consistentie</span>'
    + '<div style="font-size:32px;font-weight:900;color:'+scoreColor+';line-height:1;">'+score+'%</div></div>'
    + '<div style="font-size:13px;color:var(--muted);">'
    + '<span style="color:var(--red);">'+errs.length+' fouten</span> · '
    + '<span style="color:var(--gold);">'+warns.length+' waarschuwingen</span> · '
    + '<span style="color:var(--green);">'+oks.length+' ok</span>'
    + '</div></div>';

  function renderRow(r) {
    var icon = r.status==='err' ? '🔴' : r.status==='warn' ? '🟡' : '✅';
    var bg = r.status==='err' ? 'rgba(244,63,63,.06)' : r.status==='warn' ? 'rgba(251,191,36,.04)' : 'rgba(74,222,128,.04)';
    var border = r.status==='err' ? 'rgba(244,63,63,.25)' : r.status==='warn' ? 'rgba(251,191,36,.2)' : 'rgba(74,222,128,.15)';
    return '<div style="padding:10px 14px;margin-bottom:6px;background:'+bg+';border:1px solid '+border+';border-radius:6px;">'
      + '<div style="display:flex;align-items:flex-start;gap:8px;">'
      + '<span style="flex-shrink:0;font-size:13px;">'+icon+'</span>'
      + '<div style="flex:1;">'
      + '<div style="font-weight:700;font-size:13px;color:var(--ink);margin-bottom:2px;">'+r.label+'</div>'
      + '<div style="font-family:\\'IBM Plex Mono\\',monospace;font-size:10px;color:var(--muted);word-break:break-all;">'+r.value+'</div>'
      + (r.fix ? '<div style="font-size:12px;color:var(--gold);margin-top:4px;">→ '+r.fix+'</div>' : '')
      + (r.note ? '<div style="font-size:11px;color:var(--green);margin-top:2px;">'+r.note+'</div>' : '')
      + '</div></div></div>';
  }

  if (errs.length) html_out += '<div style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--red);margin:12px 0 6px;">🔴 Fouten — direct fixen</div>' + errs.map(renderRow).join('');
  if (warns.length) html_out += '<div style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin:12px 0 6px;">🟡 Waarschuwingen</div>' + warns.map(renderRow).join('');
  if (oks.length) {
    html_out += '<details style="margin-top:10px;"><summary style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--green);cursor:pointer;padding:4px 0;">✅ '+oks.length+' items correct (klik om te zien)</summary><div style="margin-top:8px;">' + oks.map(renderRow).join('') + '</div></details>';
  }

  document.getElementById('metaCheckResults').innerHTML = html_out;
}

// ── Pre-fill from Workflow Manager URL params ──────────────
(function(){
  const p = new URLSearchParams(window.location.search);
  if(!p.get('url') && !p.get('kw')) return;
  function fill(){
    setMode('deep');
    if(p.get('url'))  document.getElementById('dUrl').value  = p.get('url');
    if(p.get('kw'))   document.getElementById('dKw').value   = p.get('kw');
    if(p.get('pos'))  document.getElementById('dPos').value  = p.get('pos');
    if(p.get('impr')) document.getElementById('dImpr').value = p.get('impr');
    if(p.get('ctr'))  document.getElementById('dCtr').value  = p.get('ctr');
    if(p.get('mob'))  document.getElementById('dMob').value  = p.get('mob');
    if(p.get('wf'))   window._wfId = p.get('wf');
    const deepView = document.getElementById('deepView');
    if(!deepView) return;
    const banner = document.createElement('div');
    banner.style.cssText = 'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:8px;padding:12px 18px;margin-bottom:14px;font-family:\\'IBM Plex Mono\\',monospace;font-size:11px;color:#fbbf24;display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    banner.innerHTML = '<span>✓ Pre-filled vanuit Workflow Manager — Paste page HTML below for best results. Competitor HTML is optional.</span>'
      + (p.get('wf') ? '<a href="/audit-workflow" style="color:#a78bfa;text-decoration:none;font-size:10px;margin-left:auto;white-space:nowrap;">← Back to Workflow</a>' : '');
    deepView.insertBefore(banner, deepView.firstChild);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill);
  else fill();
})();

function setMode(m) {
  document.getElementById('bulkView').className = m==='bulk'?'active':'';
  document.getElementById('deepView').className = m==='deep'?'active':'';
  document.getElementById('modeBulk').className = 'mode-btn'+(m==='bulk'?' active':'');
  document.getElementById('modeDeep').className = 'mode-btn'+(m==='deep'?' active':'');
}

function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

function updateHtmlStats(inputId, statsId) {
  const html = document.getElementById(inputId).value.trim();
  const el = document.getElementById(statsId);
  if (!html) { el.textContent=''; return; }
  try {
    const doc = new DOMParser().parseFromString(html,'text/html');
    const words = (doc.body?.innerText||'').split(/\\s+/).filter(Boolean).length;
    const h1 = doc.querySelectorAll('h1').length;
    const h2 = doc.querySelectorAll('h2').length;
    const schema = (html.match(/application\\/ld\\+json/gi)||[]).length;
    const imgs = doc.querySelectorAll('img').length;
    const alts = doc.querySelectorAll('img[alt]').length;
    el.textContent = \`✓ ~\${words.toLocaleString()} words · \${h1} H1 · \${h2} H2s · \${schema} schema · \${imgs} imgs (\${alts} with alt)\`;
  } catch(e) { el.textContent = 'Could not parse HTML'; }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dSiteUrls')?.addEventListener('input', function() {
    const urls = this.value.trim().split('\\n').filter(l=>l.trim().startsWith('http'));
    document.getElementById('urlCount').textContent = urls.length ? \`✓ \${urls.length} URLs loaded\` : '';
  });
});

// ── CSV ──
function parseGSCCsv(raw) {
  const lines = raw.trim().split('\\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().replace(/"/g,'').split(',');
  const idx = {
    page: header.findIndex(h=>h.includes('page')||h.includes('url')||h.includes('top page')),
    clicks: header.findIndex(h=>h.includes('click')),
    impressions: header.findIndex(h=>h.includes('impression')),
    ctr: header.findIndex(h=>h.includes('ctr')),
    position: header.findIndex(h=>h.includes('position')||h.includes('pos')),
  };
  if (idx.page<0) idx.page=0;
  if (idx.clicks<0) idx.clicks=1;
  if (idx.impressions<0) idx.impressions=2;
  if (idx.ctr<0) idx.ctr=3;
  if (idx.position<0) idx.position=4;
  const rows=[];
  for (let i=1;i<lines.length;i++) {
    const cols=lines[i].replace(/"/g,'').split(',');
    if (cols.length<3) continue;
    const page=cols[idx.page]?.trim();
    if (!page) continue;
    const impressions=parseFloat(cols[idx.impressions])||0;
    if (impressions<1) continue;
    rows.push({
      page,
      clicks:parseFloat(cols[idx.clicks])||0,
      impressions,
      ctr:parseFloat((cols[idx.ctr]||'0').replace('%',''))||0,
      position:parseFloat(cols[idx.position])||0,
    });
  }
  return rows;
}

function handlePagesCSV(input) {
  const file=input.files[0]; if (!file) return;
  const r=new FileReader();
  r.onload=e=>{
    gscPages=parseGSCCsv(e.target.result);
    gscPages.forEach(p=>{
      const posScore=p.position>10?Math.min((p.position-10)/40,1):0;
      const ctrGap=Math.max(0,3-p.ctr)/3;
      const imprW=Math.min(Math.log10(Math.max(p.impressions,10))/5,1);
      p.score=Math.round((posScore*.45+ctrGap*.35+imprW*.2)*100);
    });
    gscPages.sort((a,b)=>b.score-a.score);
    document.getElementById('pagesStatus').innerHTML=\`<span style="color:var(--green)">✓ \${gscPages.length} pages loaded</span>\`;
    document.getElementById('filterPanel').style.display='block';
    document.getElementById('opportunityTable').style.display='block';
    renderTable();
    toast(\`✅ \${gscPages.length} pages loaded\`);
  };
  r.readAsText(file);
}

function handleQueriesCSV(input) {
  const file=input.files[0]; if (!file) return;
  const r=new FileReader();
  r.onload=e=>{
    gscQueries=parseGSCCsv(e.target.result);
    gscQueries.forEach(q=>{q.query=q.page;delete q.page;});
    document.getElementById('queriesStatus').innerHTML=\`<span style="color:var(--green)">✓ \${gscQueries.length} queries loaded</span>\`;
    toast(\`✅ \${gscQueries.length} queries loaded\`);
  };
  r.readAsText(file);
}

function showCannibalization() {
  if (!gscPages.length) { toast('Upload pages CSV first'); return; }
  const report=document.getElementById('cannReport');
  const body=document.getElementById('cannBody');
  report.style.display='block';
  const groups={};
  gscPages.forEach(p=>{
    try {
      const url=new URL(p.page);
      const segs=url.pathname.split('/').filter(Boolean);
      segs.forEach(seg=>{
        if (seg.length<4) return;
        if (!groups[seg]) groups[seg]=[];
        groups[seg].push(p);
      });
    } catch(e){}
  });
  const canns=Object.entries(groups).filter(([,pages])=>pages.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,15);
  if (!canns.length) {
    body.innerHTML='<p style="color:var(--green);font-family:\\'IBM Plex Mono\\',monospace;font-size:11px;">✓ No obvious cannibalization detected.</p>';
    return;
  }
  body.innerHTML=canns.map(([seg,pages])=>\`
    <div class="cann-card">
      <h4>⚠ Conflict: "\${seg}" appears in \${pages.length} pages</h4>
      \${pages.map(p=>\`
        <div style="display:flex;align-items:center;gap:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;flex-wrap:wrap;">
          <span style="font-family:'IBM Plex Mono',monospace;color:var(--blue);flex:1;word-break:break-all;">\${p.page.replace(/^https?:\\/\\//,'').slice(0,60)}</span>
          <span style="color:var(--muted);">\${p.impressions.toLocaleString()} impr</span>
          <span style="color:var(--amber);">\${p.ctr.toFixed(1)}% CTR</span>
          <span style="color:var(--orange);">pos \${Math.round(p.position)}</span>
          <button class="btn-sm btn-purple" onclick="loadToDeep('\${encodeURIComponent(p.page)}','\${p.impressions}','\${p.ctr}','\${p.position}')">🔬 Audit</button>
        </div>\`).join('')}
    </div>\`).join('');
  report.scrollIntoView({behavior:'smooth'});
}

function renderTable() {
  const minI=parseFloat(document.getElementById('minImpr').value)||0;
  const minP=parseFloat(document.getElementById('minPos').value)||0;
  const maxP=parseFloat(document.getElementById('maxPos').value)||999;
  const maxC=parseFloat(document.getElementById('maxCtr').value)||100;
  const filtered=gscPages.filter(r=>r.impressions>=minI&&r.position>=minP&&r.position<=maxP&&r.ctr<=maxC);
  document.getElementById('tableCount').textContent=\`\${filtered.length} pages\`;
  const maxScore=filtered[0]?.score||1;
  const rows=filtered.slice(0,100).map((r,i)=>{
    const short=(()=>{try{return new URL(r.page).pathname.slice(0,45)||'/';}catch(e){return r.page.slice(0,45);}})();
    const posColor=r.position<20?'var(--amber)':r.position<35?'var(--orange)':'var(--red)';
    const ctrColor=r.ctr<1?'var(--red)':r.ctr<3?'var(--amber)':'var(--green)';
    const barW=Math.round((r.score/maxScore)*100);
    const enc=encodeURIComponent(r.page);
    return \`<tr>
      <td style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:\${i<3?'var(--gold)':'var(--muted)'};">#\${i+1}</td>
      <td>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--blue);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${r.page}">\${short}</div>
        <div style="font-size:10px;color:var(--dim);margin-top:2px;">\${r.impressions.toLocaleString()} impr · \${r.clicks} clicks</div>
      </td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;">\${r.impressions.toLocaleString()}</td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:\${ctrColor};">\${r.ctr.toFixed(1)}%</td>
      <td style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:\${posColor};">\${Math.round(r.position)}</td>
      <td style="min-width:90px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--gold);">\${r.score}/100</div>
        <div class="opp-bar" style="width:\${barW}%;"></div>
      </td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="btn-sm btn-blue" onclick="quickAudit('\${enc}','\${r.impressions}','\${r.ctr}','\${r.position}')">⚡ Quick</button>
          <button class="btn-sm btn-purple" onclick="loadToDeep('\${enc}','\${r.impressions}','\${r.ctr}','\${r.position}')">🔬 Deep</button>
        </div>
      </td>
    </tr>\`;
  }).join('');
  document.getElementById('tableBody').innerHTML=rows||'<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px;">No pages match filters</td></tr>';
}

function loadToDeep(enc,impr,ctr,pos) {
  document.getElementById('dUrl').value=decodeURIComponent(enc);
  document.getElementById('dImpr').value=impr;
  document.getElementById('dCtr').value=ctr;
  document.getElementById('dPos').value=pos;
  setMode('deep');
  window.scrollTo({top:0,behavior:'smooth'});
  toast('Loaded → paste your HTML and run Deep Dive!');
}

function exportOpps() {
  const rows=['Page,Impressions,Clicks,CTR,Position,Score'];
  gscPages.forEach(r=>rows.push(\`"\${r.page}",\${r.impressions},\${r.clicks},\${r.ctr},\${r.position},\${r.score}\`));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([rows.join('\\n')],{type:'text/csv'}));
  a.download='seo-opportunities.csv';a.click();
}

// ── GEMINI API via Railway proxy ──
async function callGemini(prompt, maxTokens=4000) {
  const resp = await fetch(\`\${RAILWAY}/api/gemini-proxy\`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{temperature:0.25,maxOutputTokens:maxTokens}
    })
  });
  if (!resp.ok) {
    const err=await resp.json().catch(()=>({}));
    throw new Error(err.error?.message||err.detail||\`HTTP \${resp.status}\`);
  }
  const data=await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text||'';
}

function extractContent(html, label='page') {
  if (!html) return null;
  try {
    const doc=new DOMParser().parseFromString(html,'text/html');
    const title=doc.querySelector('title')?.textContent||'';
    const desc=doc.querySelector('meta[name="description"]')?.getAttribute('content')||'';
    const h1=Array.from(doc.querySelectorAll('h1')).map(e=>e.textContent.trim()).join(' | ');
    const h2s=Array.from(doc.querySelectorAll('h2')).map(e=>e.textContent.trim()).join(' · ');
    const h3s=Array.from(doc.querySelectorAll('h3')).slice(0,10).map(e=>e.textContent.trim()).join(' · ');
    const schemas=Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(s=>s.textContent.slice(0,200)).join('\\n');
    const body=(doc.body?.innerText||'').replace(/\\s+/g,' ').slice(0,3000);
    const imgs=doc.querySelectorAll('img').length;
    const alts=doc.querySelectorAll('img[alt]').length;
    const intLinks=doc.querySelectorAll('a[href]').length;
    const wordCount=(doc.body?.innerText||'').split(/\\s+/).filter(Boolean).length;
    const faqs=doc.querySelectorAll('[itemtype*="FAQPage"], .faq, #faq, [class*="faq"]').length;
    return \`=== \${label.toUpperCase()} ===
Title (\${title.length} chars): \${title}
Meta desc (\${desc.length} chars): \${desc}
H1: \${h1||'MISSING'}
H2s: \${h2s||'none'}
H3s (first 10): \${h3s||'none'}
Word count: ~\${wordCount}
Images: \${imgs} total, \${alts} with alt (\${imgs-alts} missing alt text)
Links: \${intLinks} total
Schema blocks: \${schemas||'none'}
FAQ section: \${faqs>0?'YES':'NOT DETECTED'}
Body extract: \${body}\`;
  } catch(e) { return \`[Error parsing \${label} HTML: \${e.message}]\`; }
}

function extractTitle(html) {
  if (!html) return 'not provided';
  const m=html.match(/<title[^>]*>(.*?)<\\/title>/i);
  return m?m[1].trim():'not found in HTML';
}
function extractMeta(html) {
  if (!html) return 'not provided';
  const m=html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
           ||html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  return m?m[1].trim():'not found in HTML';
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

// ── QUICK AUDIT ──
async function quickAudit(enc,impr,ctr,pos) {
  const url=decodeURIComponent(enc);
  const prog=document.getElementById('quickProgress');
  const out=document.getElementById('quickOutput');
  prog.className='progress show';out.innerHTML='';out.className='output show';
  const QSTEPS=[
    {id:'q0',icon:'🔥',label:'PRIORITY ACTIONS — Top 5 right now'},
    {id:'q1',icon:'⚡',label:'CTR Surgery — new title + meta'},
    {id:'q2',icon:'📈',label:'Position 11–20 query opportunities'},
  ];
  document.getElementById('quickSteps').innerHTML=QSTEPS.map(s=>\`<div class="prog-step" id="step-\${s.id}"><span class="prog-icon">\${s.icon}</span><span>\${s.label}</span></div>\`).join('');
  const bar=document.getElementById('quickBar');
  const ctx=\`URL: \${url}\\nImpressions: \${impr}\\nCTR: \${ctr}%\\nPosition: \${pos}\`;
  const pageQueries=gscQueries.filter(q=>q.query).slice(0,20);
  const queryCtx=pageQueries.length?\`\\nTop queries: \${pageQueries.map(q=>\`"\${q.query}" pos:\${Math.round(q.position)} impr:\${q.impressions}\`).join(' | ')}\`:'';
  const prompts={
    q0:\`You are an elite SEO strategist.\\n\${ctx}\${queryCtx}\\n\\nList EXACTLY 5 priority actions for this page. Each must be:\\n- Specific and actionable (not generic advice)\\n- Achievable in under 1 hour\\n- Include expected metric change\\n\\nFormat each as:\\n🔥 **[Action title]**\\nDo: [exact what to do]\\nExpect: [specific metric improvement]\\n\\nStart with the highest-impact action first.\`,
    q1:\`You are an elite SEO strategist.\\n\${ctx}\${queryCtx}\\nWrite a new title (≤60 chars) and meta description (≤155 chars) for this page to maximize CTR.\\n\\n**New Title**: [text]\\n**New Meta Description**: [text]\\n**Why**: [specific 2026 SERP psychology rationale]\`,
    q2:\`You are an elite SEO strategist.\\n\${ctx}\${queryCtx}\\nIdentify the 3 queries where this page ranks position 11-20 — fastest wins to page 1.\\nFor each: **Query** | Current pos | ONE specific change needed | Expected result.\`,
  };
  for (let i=0;i<QSTEPS.length;i++) {
    const s=QSTEPS[i];setStep(s.id,'active');
    try {
      const r=await callGemini(prompts[s.id],1500);
      addSection(out,s.id,s.icon,s.label,i===0?'b-gold':i===1?'b-win':'b-pulse',r);
      setStep(s.id,'done');
    } catch(e) {
      setStep(s.id,'error');
      addSection(out,s.id,s.icon,s.label,'b-tech',\`**Error:** \${e.message}\`);
    }
    bar.style.width=((i+1)/QSTEPS.length*100)+'%';
    if (i<QSTEPS.length-1) await sleep(1200);
  }
  prog.className='progress';
  toast('✅ Quick audit done');
  out.scrollIntoView({behavior:'smooth'});
}

// ── DEEP AUDIT — 10 steps, PRIORITY ACTIONS FIRST ──
const DEEP_STEPS=[
  {id:'d0',icon:'🔥',label:'PRIORITY ACTIONS — Do These First (top 7)',badge:'b-gold'},
  {id:'d1',icon:'🔍',label:'Intent + AI Overview Eligibility',badge:'b-tech'},
  {id:'d2',icon:'⚡',label:'CTR Surgery — real title/meta rewrite',badge:'b-win'},
  {id:'d3',icon:'🕵️',label:'Competitor Diff — Surfer SEO & MarketMuse benchmark',badge:'b-pulse'},
  {id:'d4',icon:'🕳️',label:'Content Gap Matrix — what you are missing',badge:'b-pulse'},
  {id:'d5',icon:'🫀',label:'PULSE Optimization — before/after rewrites',badge:'b-pulse'},
  {id:'d6',icon:'🔗',label:'NEXUS Signals + Internal Link Finder',badge:'b-nexus'},
  {id:'d7',icon:'🏗️',label:'Architecture Blueprint — H1-H3 restructure',badge:'b-nexus'},
  {id:'d8',icon:'🛠️',label:'Technical Checklist + Schema JSON-LD',badge:'b-tech'},
  {id:'d9',icon:'📊',label:'Before/After Score + Traffic Projection',badge:'b-gold'},
  {id:'d10',icon:'📈',label:'90-Day Ranking Plan — by week',badge:'b-win'},
];

async function runDeepAudit() {
  const url=document.getElementById('dUrl').value.trim();
  const kw=document.getElementById('dKw').value.trim();
  if (!url||!kw) { toast('Enter URL and keyword first'); return; }

  const inp={
    url,kw,
    kw2:document.getElementById('dKw2').value.trim(),
    geo:document.getElementById('dGeo').value,
    goal:document.getElementById('dGoal').value,
    impr:document.getElementById('dImpr').value||'unknown',
    ctr:document.getElementById('dCtr').value||'unknown',
    pos:document.getElementById('dPos').value||'unknown',
    mob:document.getElementById('dMob').value||'unknown',
    queries:document.getElementById('dQueries').value.trim(),
    html:document.getElementById('dHtml').value.trim(),
    comp1url:document.getElementById('dComp1url').value.trim()||'https://surferseo.com',
    comp1html:document.getElementById('dComp1html').value.trim(),
    comp2url:document.getElementById('dComp2url').value.trim()||'https://marketmuse.com',
    comp2html:document.getElementById('dComp2html').value.trim(),
    siteUrls:document.getElementById('dSiteUrls').value.trim(),
    constraints:document.getElementById('dConstraints').value.trim(),
  };

  const myContent=extractContent(inp.html,'YOUR PAGE');
  const myContentStr=myContent||\`[No HTML provided — URL: \${inp.url}]\`;

  // Competitor context — real HTML or trained knowledge
  let compContext='';
  if (inp.comp1html||inp.comp2html) {
    compContext=\`\\n\${extractContent(inp.comp1html,\`COMPETITOR 1 (\${inp.comp1url})\`)}\\n\\n\${extractContent(inp.comp2html,\`COMPETITOR 2 (\${inp.comp2url})\`)}\`;
  } else {
    compContext=\`\\n[No competitor HTML pasted. Use your trained knowledge of:
COMPETITOR 1: Surfer SEO (\${inp.comp1url}) — known for: NLP content scores, content editor, SERP analyzer, keyword research, average ~2500-3500 word guides, heavy use of comparison tables, FAQ sections, JSON-LD FAQPage schema, strong internal linking]
COMPETITOR 2: MarketMuse (\${inp.comp2url}) — known for: topic modeling, content briefs, competitive analysis, comprehensive pillar pages, semantic clustering, authority scoring, strong structured data, 3000-5000 word pillar content]
Compare the target page against these known competitor patterns.\`;
  }

  const siteUrlList=inp.siteUrls.split('\\n').filter(l=>l.trim().startsWith('http')).slice(0,50).join('\\n');

  document.getElementById('deepRunBtn').disabled=true;
  const prog=document.getElementById('deepProgress');
  const out=document.getElementById('deepOutput');
  prog.className='progress show';out.innerHTML='';out.className='output show';
  document.getElementById('deepSteps').innerHTML=DEEP_STEPS.map(s=>\`<div class="prog-step" id="step-\${s.id}"><span class="prog-icon">\${s.icon}</span><span>\${s.label}</span></div>\`).join('');
  const bar=document.getElementById('deepBar');

  const base=\`You are an elite SEO strategist for ContentScale.site using PULSE + NEXUS frameworks.

PAGE: \${inp.url}
PRIMARY KEYWORD: \${inp.kw}
SECONDARY KEYWORD: \${inp.kw2||'none'}
GEO: \${inp.geo} | GOAL: \${inp.goal} | CONSTRAINTS: \${inp.constraints||'none'}
GSC: \${inp.impr} impressions · \${inp.ctr}% CTR · position \${inp.pos} · \${inp.mob}% mobile
TOP QUERIES: \${inp.queries||'not provided'}

\${myContentStr}\`;

  const prompts={
    d0:\`\${base}\\n\\nSTEP 0 — PRIORITY ACTIONS (show this first, before any analysis):\\n\\nBased on the page data above, list EXACTLY 7 priority actions ordered by impact. Be brutally specific — no generic SEO advice.\\n\\nFor each action use this format:\\n🔥 **[#]. [Short action title]** [QUICK WIN / MEDIUM / STRATEGIC]\\nDo: [Exact what to change, add, or fix — copy-paste ready]\\nWhere: [Exact location on page or in code]\\nExpect: [Specific metric improvement, e.g., "CTR +0.8-1.2%" or "Position jump 5-8 spots"]\\nTime: [15 min / 30 min / 2 hrs]\\n\\nStart with the 3 fastest wins (under 30 min). End with 2 strategic actions.\`,

    d1:\`\${base}\\n\\nSTEP 1 — INTENT DECODING:\\nClassify primary intent precisely. Is this page AI Overview eligible? What is the zero-click risk? What are the top 5 results likely covering that this page is not? State any mismatch clearly with specific fix.\`,

    d2:\`\${base}\\n\\nSTEP 2 — CTR SURGERY:\\nCURRENT TITLE: "\${extractTitle(inp.html)}"\\nCURRENT META: "\${extractMeta(inp.html)}"\\n\\nRewrite both specifically. New title ≤60 chars, meta ≤155 chars.\\n\\n**Current Title** (\${extractTitle(inp.html).length} chars): \${extractTitle(inp.html)}\\n**Current Meta** (\${extractMeta(inp.html).length} chars): \${extractMeta(inp.html)}\\n**New Title**: [your version]\\n**New Meta Description**: [your version]\\n**Uplift rationale**: [specific CTR psychology — numbers, power words, emotional triggers used]\`,

    d3:\`\${base}\${compContext}\\n\\nSTEP 3 — COMPETITOR DIFF:\\nCreate a comparison table between your page and the two competitors. Columns: Feature | Your Page | Competitor 1 (Surfer SEO) | Competitor 2 (MarketMuse) | Winner\\nRows: Word count · H2 count · FAQ section · Schema types · Images with alt · CTA clarity · Data/stats count · Unique angle · Internal links\\n\\nThen: List the 5 SPECIFIC things competitors do that your page does not. For each: exact implementation instruction.\`,

    d4:\`\${base}\${compContext}\\n\\nSTEP 4 — CONTENT GAP MATRIX:\\nCreate a precise gap analysis. For each dimension score: 0=missing 1=weak 2=adequate 3=strong\\n\\n| Dimension | Your Score | Gap | Specific Fix |\\n|---|---|---|---|\\n| Subtopic coverage | | | |\\n| Data & proof | | | |\\n| Commercial signals | | | |\\n| Media & UX | | | |\\n| Freshness (2025-2026) | | | |\\n| FAQ depth | | | |\\n| E-E-A-T signals | | | |\\n\\nThen: Top 5 content additions, each with severity (High/Med/Low) and exact implementation.\`,

    d5:\`\${base}\\n\\nSTEP 5 — PULSE REWRITES (show current → improved for each):\\n\\nP — Purpose (intro rewrite):\\nCURRENT: [quote first 3 sentences from body extract]\\nIMPROVED: [rewrite — lead with the benefit, include primary keyword, add a stat]\\n\\nU — Urgency signal:\\nWhere to add: [exact location]\\nNew sentence: [write it]\\n\\nL — Legitimacy:\\nMissing proof elements: [list 3 specific items]\\nWhere to add: [exact section]\\n\\nS — Structure improvement:\\nPick ONE section and show Before/After conversion to table or bullets:\\nBEFORE: [current format]\\nAFTER: [improved format]\\n\\nE — Engagement (CTA rewrite):\\nCURRENT CTA: [identify from page]\\nIMPROVED: [rewrite aligned to \${inp.goal}]\`,

    d6:\`\${base}\\n\\nSITE URLS:\\n\${siteUrlList||'[No URLs provided — suggest based on URL patterns and domain: '+inp.url+']'}\\n\\nSTEP 6 — NEXUS + INTERNAL LINKS:\\n1. TOP 5 pages to link FROM to this page (use real URLs from list if available):\\n   - URL | Anchor text (exact) | Why (semantic reason)\\n\\n2. TOP 5 pages this page should link TO:\\n   - URL | Anchor text (exact) | Why\\n\\n3. Missing semantic entities for "\${inp.kw}" (10 terms)\\n\\n4. Schema recommendation — provide complete FAQPage JSON-LD with 5 Q&As (40-60 words each, optimized for AI Overviews)\`,

    d7:\`\${base}\\n\\nSTEP 7 — ARCHITECTURE BLUEPRINT:\\nCURRENT heading structure (from HTML):\\nH1: \${extractTitle(inp.html)}\\n[reconstruct H2-H3 from content]\\n\\nRECOMMENDED structure for intent + AI Overview extraction:\\n[show new H1 → H2 → H3 hierarchy]\\n\\nFor each change: Old heading → New heading → Why this order wins\`,

    d8:\`\${base}\\n\\nSTEP 8 — TECHNICAL CHECKLIST:\\n1. Keyword "\${inp.kw}" placement audit:\\n   □ In H1? □ First 100 words? □ URL? □ Meta title? □ Image alt?\\n   → Fix for each missing item\\n\\n2. Missing LSI/semantic keywords (8 terms not found in content)\\n\\n3. Technical issues found in HTML:\\n   - Duplicate tags, missing alt, schema errors, etc.\\n\\n4. Mobile optimization gaps (page is \${inp.mob||'?'}% mobile)\\n\\n5. Core Web Vitals recommendations based on page structure\`,

    d9:\`\${base}\\n\\nSTEP 9 — BEFORE/AFTER SCORE PROJECTION:\\n\\nContentScale scoring: GRAAF (50pts) + CRAFT (30pts) + Technical (20pts) = 100\\n\\nCURRENT estimated score:\\n- GRAAF: [score]/50 — [what's missing]\\n- CRAFT: [score]/30 — [what's missing]\\n- Technical: [score]/20 — [what's missing]\\n- TOTAL: [score]/100\\n\\nAFTER implementing all recommendations:\\n- GRAAF: [new score]/50 — [what improved]\\n- CRAFT: [new score]/30 — [what improved]\\n- Technical: [new score]/20 — [what improved]\\n- TOTAL: [new score]/100\\n\\nTraffic projection:\\n- Current position \${inp.pos} → Expected new position: [X]\\n- Current CTR \${inp.ctr}% → Expected new CTR: [X]%\\n- Current clicks per month: [calc] → New estimated clicks: [calc]\`,

    d10:\`\${base}\\n\\nSTEP 10 — 90-DAY PLAN (week by week):\\n\\n**WEEK 1 — Quick Wins (do today):**\\n[List 5 specific changes, each under 30 min]\\n\\n**WEEK 2-3 — Content Upgrades:**\\n[List 3-4 content additions/rewrites]\\n\\n**WEEK 4 — Technical + Schema:**\\n[Schema implementation, internal links, technical fixes]\\n\\n**MONTH 2 — Authority Building:**\\n[Link building, content expansion, E-E-A-T signals]\\n\\n**MONTH 3 — Measurement + Iteration:**\\n[What to check in GSC, when to expect results]\\n\\n**GSC Checkpoints:**\\n- Day 7: [what metric to check]\\n- Day 30: [target position + CTR]\\n- Day 90: [end goal for "\${inp.kw}"]\\n\\nSUCCESS DEFINITION: Position \${inp.pos} → [target] within 90 days\`,
  };

  for (let i=0;i<DEEP_STEPS.length;i++) {
    const s=DEEP_STEPS[i];setStep(s.id,'active');
    try {
      const result=await callGemini(prompts[s.id],4000);
      addSection(out,s.id,s.icon,s.label,s.badge,result);
      setStep(s.id,'done');
    } catch(e) {
      setStep(s.id,'error');
      addSection(out,s.id,s.icon,s.label,s.badge,\`**Error:** \${e.message}\\n\\nCheck Railway server: \${RAILWAY}/api/health\`);
    }
    bar.style.width=((i+1)/DEEP_STEPS.length*100)+'%';
    if (i<DEEP_STEPS.length-1) await sleep(1500);
  }

  prog.className='progress';
  document.getElementById('deepRunBtn').disabled=false;
  toast('✅ Full audit complete — scroll up for Priority Actions');
  // Scroll to start of output to show Priority Actions first
  out.scrollIntoView({behavior:'smooth'});
}

function setStep(id,state) {
  const el=document.getElementById('step-'+id);
  if (!el) return;
  el.className='prog-step '+state;
  const icon=el.querySelector('.prog-icon');
  if (state==='active') icon.textContent='⟳';
  else if (state==='done') icon.textContent='✓';
  else if (state==='error') icon.textContent='✗';
}

function addSection(container,id,icon,title,badge,content) {
  const div=document.createElement('div');
  div.className='sec-card';
  // Priority Actions card gets special gold border
  if (id==='d0'||id==='q0') div.style.border='1px solid rgba(251,191,36,.4)';
  div.innerHTML=\`
    <div class="sec-head" onclick="toggleBody('\${id}')">
      <span style="font-size:17px;">\${icon}</span>
      <span class="sec-title">\${title}</span>
      <span class="badge \${badge}">\${id.toUpperCase()}</span>
      <button class="btn-sm btn-muted" style="margin-left:8px;" onclick="event.stopPropagation();copyMd('md-\${id}')">⧉ Copy</button>
    </div>
    <div class="sec-body" id="body-\${id}">
      <div class="md" id="md-\${id}">\${renderMd(content)}</div>
    </div>\`;
  container.appendChild(div);
}

function toggleBody(id) {
  document.getElementById('body-'+id)?.classList.toggle('hidden');
}

function copyMd(id) {
  navigator.clipboard.writeText(document.getElementById(id)?.innerText||'').then(()=>toast('Copied!'));
}

function renderMd(t) {
  if (!t) return '';
  return t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g,'<em>$1</em>')
    .replace(/\`([^\`\\n]+)\`/g,'<code>$1</code>')
    .replace(/\`\`\`[\\w]*\\n?([\\s\\S]*?)\`\`\`/g,'<pre><code>$1</code></pre>')
    .replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---+$/gm,'<hr>')
    .replace(/^\\|(.+)\\|$/gm,m=>{
      const cells=m.split('|').slice(1,-1);
      if (cells.every(c=>/^[\\s\\-:]+$/.test(c))) return '';
      return '<tr>'+cells.map(c=>\`<td>\${c.trim()}</td>\`).join('')+'</tr>';
    })
    .replace(/(<tr>[\\s\\S]*?<\\/tr>)+/g,m=>\`<table>\${m}</table>\`)
    .replace(/^[\\-\\*•] (.+)$/gm,'<li>$1</li>')
    .replace(/^\\d+\\. (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\\s\\S]*?<\\/li>)+/g,m=>\`<ul>\${m}</ul>\`)
    .replace(/\\n\\n/g,'</p><p>')
    .replace(/\\n/g,'<br>');
}

// Drag & drop
['pagesZone','queriesZone'].forEach(zoneId=>{
  const z=document.getElementById(zoneId);
  z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('drag');});
  z.addEventListener('dragleave',()=>z.classList.remove('drag'));
  z.addEventListener('drop',e=>{
    e.preventDefault();z.classList.remove('drag');
    const file=e.dataTransfer.files[0]; if (!file) return;
    if (zoneId==='pagesZone') handlePagesCSV({files:[file]});
    else handleQueriesCSV({files:[file]});
  });
});
</script>
</body>
</html>
`;
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
