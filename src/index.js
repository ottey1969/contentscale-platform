console.log('✅ CONTENTSCALE SERVER v3.0 - FINAL FIX - 1775546405');
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

// ── Google Search Console API ──────────────────────────────────────────────
let _gscServiceAccount = null;
try {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (raw) {
    _gscServiceAccount = JSON.parse(raw);
    console.log('✅ GSC Service Account loaded from env');
  } else {
    console.log('⚠️ GSC_SERVICE_ACCOUNT_JSON not set — /api/gsc/auto-fill disabled');
  }
} catch(e) {
  console.error('❌ GSC Service Account parse error:', e.message);
}
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
    if (entry.count >= 10) {
      console.log('[otto-limit] blocked:', ip, 'count:', entry.count);
      res.status(429).json({ error: 'Daily limit reached — max 10 conversations per day per visitor. Come back tomorrow!' });
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


// ============================================
// ✅ AUDIT DATA BRIDGE API ROUTES
// ============================================

app.post('/api/audit/save-workflow-data', async (req, res) => {
  const { pageUrl, keyword, gscData, projectName, priority, notes } = req.body;
  
  if (!pageUrl) {
    return res.status(400).json({ error: 'Page URL required' });
  }

  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_workflow_cache (
        page_url TEXT PRIMARY KEY,
        keyword TEXT,
        gsc_data JSONB,
        project_name TEXT,
        priority VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Upsert data
    await pool.query(`
      INSERT INTO audit_workflow_cache 
        (page_url, keyword, gsc_data, project_name, priority, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (page_url) 
      DO UPDATE SET 
        keyword = EXCLUDED.keyword,
        gsc_data = EXCLUDED.gsc_data,
        project_name = EXCLUDED.project_name,
        priority = EXCLUDED.priority,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `, [pageUrl, keyword || null, JSON.stringify(gscData || []), projectName || null, priority || null, notes || null]);

    console.log(`✅ Workflow data cached for: ${pageUrl}`);
    res.json({ success: true, message: 'Workflow data saved' });

  } catch (error) {
    console.error('Save workflow data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/audit/get-workflow-data', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM audit_workflow_cache 
      WHERE page_url = $1 
      ORDER BY updated_at DESC 
      LIMIT 1
    `, [url]);

    if (result.rows.length > 0) {
      const data = result.rows[0];
      res.json({
        success: true,
        found: true,
        pageUrl: data.page_url,
        keyword: data.keyword,
        gscData: data.gsc_data,
        projectName: data.project_name,
        priority: data.priority,
        notes: data.notes,
        lastUpdated: data.updated_at
      });
    } else {
      res.json({ success: true, found: false });
    }

  } catch (error) {
    console.error('Get workflow data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('✅ Audit data bridge API loaded');
console.log('   📊 POST /api/audit/save-workflow-data - Save data from Workflow');
console.log('   📥 GET /api/audit/get-workflow-data - Load data in SEO Audit');

// ============================================
// 🤖 AI-POWERED COMPETITOR ANALYSIS ROUTES
// ============================================

// Helper function to call Gemini (uses existing GEMINI_MODEL from server)
async function callGeminiAPI(prompt, apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response from Gemini API');
    }
    
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('❌ Gemini API call failed:', error.message);
    throw error;
  }
}

// ============================================
// 1. ANALYZE COMPETITORS (with Manual HTML)
// ============================================
app.post('/api/audit/analyze-competitors', async (req, res) => {
  const { 
    keyword, 
    targetUrl, 
    country = 'nl', 
    language = 'nl',
    competitors // Array of {url, html}
  } = req.body;
  
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword required' });
  }
  
  if (!competitors || competitors.length === 0) {
    return res.status(400).json({ error: 'At least one competitor required' });
  }
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured. Add GEMINI_API_KEY to environment variables' });
  }

  try {
    console.log(`🤖 Analyzing ${competitors.length} competitors for: "${keyword}"`);
    
    // Build AI prompt
    const prompt = `You are an expert SEO analyst. Analyze these competitor pages and provide surgical recommendations.

KEYWORD: "${keyword}"
TARGET COUNTRY: ${country} (${language})
MY PAGE: ${targetUrl || 'Not ranking yet'}

COMPETITORS:
${competitors.map((c, i) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPETITOR ${i + 1}:
URL: ${c.url}
HTML SOURCE (first 25,000 chars):
${c.html ? c.html.substring(0, 25000) : 'No HTML provided'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`).join('\n')}

Analyze each competitor and provide:

1. COMPETITOR STRENGTHS & WEAKNESSES
2. HTML/SCHEMA VERIFICATION (FAQ schema, Article schema, Heading structure)
3. AI OVERVIEW OPPORTUNITY
4. CONTENT GAPS
5. RANKING DIFFICULTY

Respond in valid JSON format:
{
  "competitors": [
    {
      "url": "competitor.com",
      "position": 1,
      "strengths": ["strength 1", "strength 2"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "wordCount": 2500,
      "schema": {
        "faq": {"present": true, "valid": false, "error": "Missing acceptedAnswer field"},
        "article": {"present": true, "valid": true}
      },
      "headingStructure": {
        "h1Count": 3,
        "h1Text": ["Heading 1", "Heading 2", "Heading 3"],
        "isValid": false,
        "issues": ["Multiple H1 tags"]
      },
      "contentElements": {
        "hasTable": true,
        "hasFAQ": true,
        "hasExpertQuotes": false,
        "hasStatistics": false
      },
      "opportunities": ["Fix their broken schema", "Use single H1", "Add expert quotes"]
    }
  ],
  "aiOverview": {
    "likelyShown": true,
    "preferredFormat": "FAQ + comparison table",
    "howToGetCited": ["Add FAQ schema", "Create comparison table"],
    "citationProbability": "75%"
  },
  "contentGaps": ["Missing expert quotes", "No 2024 statistics"],
  "difficulty": {
    "level": "Medium",
    "reasoning": "Good competitors but exploitable weaknesses",
    "timeToRank": "2-3 months",
    "effortHours": 8,
    "confidence": "High"
  },
  "priority": "HIGH",
  "actionPlan": ["Write 2,500+ words", "Add FAQ schema", "Create comparison table"]
}`;

    // Call Gemini AI
    const aiResponse = await callGeminiAPI(prompt);
    
    // Parse JSON response
    let analysis;
    try {
      // Remove markdown code fences if present
      const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // Extract JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      console.log('Raw AI response preview:', aiResponse.substring(0, 500));
      analysis = {
        error: 'Could not parse AI response as JSON',
        rawResponse: aiResponse.substring(0, 1000),
        message: 'AI returned invalid JSON format. This usually means the response was too complex. Try with fewer competitors or shorter HTML.'
      };
    }
    
    console.log(`✅ Competitor analysis complete for "${keyword}"`);
    
    res.json({
      success: true,
      keyword,
      country,
      language,
      competitorCount: competitors.length,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Competitor analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// 2. GENERATE SURGICAL RECOMMENDATIONS
// ============================================
app.post('/api/audit/generate-recommendations', async (req, res) => {
  const { 
    keyword, 
    targetUrl, 
    country = 'nl',
    language = 'nl',
    competitorAnalysis 
  } = req.body;
  
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword required' });
  }
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured. Add GEMINI_API_KEY to environment variables' });
  }

  try {
    console.log(`✍️ Generating surgical recommendations for: "${keyword}"`);
    
    const languageName = language === 'nl' ? 'Dutch' : language === 'en' ? 'English' : language;
    
    const prompt = `You are an expert SEO content writer. Create EXACT, ready-to-use content recommendations in ${languageName}.

KEYWORD: "${keyword}"
TARGET COUNTRY: ${country}
LANGUAGE: ${languageName}
TARGET URL: ${targetUrl || 'New page'}

COMPETITOR ANALYSIS:
${JSON.stringify(competitorAnalysis, null, 2)}

Generate SURGICAL CONTENT RECOMMENDATIONS (exact examples, ready to copy-paste):

CRITICAL: All content MUST be in ${languageName} language. All examples must be COMPLETE and READY TO USE.

Respond in valid JSON format:
{
  "title": "Exact 60-char title in ${languageName}",
  "titleLength": 60,
  "metaDescription": "Exact 155-char meta description in ${languageName}",
  "metaLength": 155,
  "h1": "Exact H1 in ${languageName}",
  "h2Structure": ["H2 1", "H2 2", "H2 3", "H2 4", "H2 5"],
  "introduction": "Complete 80-word introduction in ${languageName}...",
  "introductionWordCount": 80,
  "faqSchema": "<script type='application/ld+json'>{\\"@context\\":\\"https://schema.org\\",\\"@type\\":\\"FAQPage\\",\\"mainEntity\\":[{\\"@type\\":\\"Question\\",\\"name\\":\\"Question?\\",\\"acceptedAnswer\\":{\\"@type\\":\\"Answer\\",\\"text\\":\\"Answer\\"}}]}</script>",
  "faqQuestions": [
    {"question": "Q1 in ${languageName}?", "answer": "Complete answer..."}
  ],
  "comparisonTable": "<table><thead><tr><th>Tool</th><th>Price</th></tr></thead><tbody><tr><td>Tool 1</td><td>€99</td></tr></tbody></table>",
  "expertQuotes": [
    {"quote": "Quote in ${languageName}", "author": "Name", "credentials": "Title, Company"}
  ],
  "statistics": ["Stat 1", "Stat 2"],
  "aiOverview": {
    "recommendedFormat": "FAQ + table",
    "citationProbability": "75%",
    "requiredElements": ["FAQ schema", "Comparison table"]
  },
  "actionPlan": ["Step 1", "Step 2", "Step 3"]
}`;

    // Call Gemini AI
    const aiResponse = await callGeminiAPI(prompt);
    
    // Parse JSON response
    let recommendations;
    try {
      const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      console.log('Raw AI response preview:', aiResponse.substring(0, 500));
      recommendations = {
        error: 'Could not parse AI response as JSON',
        rawResponse: aiResponse.substring(0, 1000),
        message: 'AI returned invalid JSON format. Try simplifying the request.'
      };
    }
    
    console.log(`✅ Surgical recommendations generated for "${keyword}"`);
    
    res.json({
      success: true,
      keyword,
      country,
      language,
      recommendations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Recommendations error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// 3. ANALYZE MANUALLY UPLOADED HTML
// ============================================
app.post('/api/audit/analyze-html', async (req, res) => {
  const { html, url } = req.body;
  
  if (!html) {
    return res.status(400).json({ error: 'HTML content required' });
  }
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured. Add GEMINI_API_KEY to environment variables' });
  }

  try {
    console.log(`🔍 Analyzing HTML from: ${url || 'manual input'} (${html.length} chars)`);
    
    const prompt = `Analyze this HTML and extract SEO-relevant information:

URL: ${url || 'Unknown'}
HTML (first 50,000 chars):
${html.substring(0, 50000)}

Extract and analyze:
1. SCHEMA MARKUP (FAQ, Article, Breadcrumb)
2. HEADING STRUCTURE (H1 count, H2 structure)
3. CONTENT ELEMENTS (word count, tables, FAQ, images)
4. META TAGS (title, description, canonical)
5. TECHNICAL ISSUES

Respond in valid JSON format:
{
  "schema": {
    "faq": {"present": true, "valid": false, "code": "...", "error": "..."},
    "article": {"present": true, "valid": true}
  },
  "headings": {
    "h1": {"count": 1, "text": ["Main Heading"]},
    "h2": {"count": 5, "text": ["H2 1", "H2 2"]},
    "issues": []
  },
  "content": {
    "wordCount": 2500,
    "hasTable": true,
    "hasFAQ": true,
    "imageCount": 12,
    "imagesWithAlt": 10
  },
  "meta": {
    "title": "Page Title",
    "titleLength": 58,
    "description": "Meta description",
    "descriptionLength": 155
  },
  "issues": ["Multiple H1 tags", "FAQ schema error"],
  "opportunities": ["Fix schema", "Use single H1"]
}`;

    // Call Gemini AI
    const aiResponse = await callGeminiAPI(prompt);
    
    // Parse JSON response
    let analysis;
    try {
      const cleaned = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      analysis = {
        error: 'Could not parse AI response as JSON',
        rawResponse: aiResponse.substring(0, 1000)
      };
    }
    
    console.log(`✅ HTML analysis complete for ${url || 'manual input'}`);
    
    res.json({
      success: true,
      url: url || 'manual input',
      htmlLength: html.length,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ HTML analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

console.log('✅ AI-powered SEO analysis routes loaded:');
console.log('   🤖 POST /api/audit/analyze-competitors');
console.log('   ✍️ POST /api/audit/generate-recommendations');
console.log('   🔍 POST /api/audit/analyze-html');

// ============================================
// END OF AI ANALYSIS ROUTES
// ============================================

app.get('/audit-seo', (req, res) => {
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(301, '/seo-audit' + qs);
});
app.get('/audit',     (req, res) => res.redirect(301, '/seo-audit'));
app.get('/audit-intake',          servePublic('audit-intake.html'));
app.get('/audit-workflow', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Buffer.from("PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9IlVURi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgo8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgsbm9mb2xsb3csbm9hcmNoaXZlIj4KPHRpdGxlPlNFTyBBdWRpdCBXb3JrZmxvdyBNYW5hZ2VyIHwgQ29udGVudFNjYWxlPC90aXRsZT4KPGxpbmsgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CZWJhcytOZXVlJmZhbWlseT1ETStTYW5zOndnaHRAMzAwOzQwMDs1MDA7NzAwJmZhbWlseT1JQk0rUGxleCtNb25vOndnaHRANDAwOzcwMCZkaXNwbGF5PXN3YXAiIHJlbD0ic3R5bGVzaGVldCI+CjxzdHlsZT4KKiwqOjpiZWZvcmUsKjo6YWZ0ZXJ7Ym94LXNpemluZzpib3JkZXItYm94O21hcmdpbjowO3BhZGRpbmc6MH0KOnJvb3R7CiAgLS1iZzojMDMwNzEyOy0tY2FyZDojMGYxNzJhOy0tc3VyZmFjZTojMWUyOTNiOy0tYm9yZGVyOiMzMzQxNTU7CiAgLS1pbms6I2Y5ZmFmYjstLW11dGVkOiM5NGEzYjg7LS1zdWI6IzY0NzQ4YjstLWRpbTojNDc1NTY5OwogIC0tcHVycGxlOiNhNzhiZmE7LS1ibHVlOiM2MGE1ZmE7LS1ncmVlbjojNGFkZTgwOy0tb3JhbmdlOiNmYjkyM2M7CiAgLS1hbWJlcjojZjU5ZTBiOy0tcmVkOiNmNDNmM2Y7LS1nb2xkOiNmYmJmMjQ7Cn0KYm9keXtiYWNrZ3JvdW5kOnZhcigtLWJnKTtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtZmFtaWx5OidETSBTYW5zJyxzYW5zLXNlcmlmO21pbi1oZWlnaHQ6MTAwdmg7bGluZS1oZWlnaHQ6MS41O30KLndyYXB7bWF4LXdpZHRoOjEzMDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmc6MCAyMHB4IDgwcHg7fQoKLnRvcGJhcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6MTZweCAwO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7bWFyZ2luLWJvdHRvbToxOHB4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O30KLmJyYW5ke2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wNmVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLCNhNzhiZmEsIzYwYTVmYSk7LXdlYmtpdC1iYWNrZ3JvdW5kLWNsaXA6dGV4dDstd2Via2l0LXRleHQtZmlsbC1jb2xvcjp0cmFuc3BhcmVudDtiYWNrZ3JvdW5kLWNsaXA6dGV4dDt0ZXh0LWRlY29yYXRpb246bm9uZTt9Ci50b29sLXRpdGxle2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wNGVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLWdvbGQpLHZhcigtLXB1cnBsZSkpOy13ZWJraXQtYmFja2dyb3VuZC1jbGlwOnRleHQ7LXdlYmtpdC10ZXh0LWZpbGwtY29sb3I6dHJhbnNwYXJlbnQ7YmFja2dyb3VuZC1jbGlwOnRleHQ7fQoudG9wYmFyLXJpZ2h0e2Rpc3BsYXk6ZmxleDtnYXA6N3B4O2ZsZXgtd3JhcDp3cmFwO30KLmJ0bntmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6N3B4IDEzcHg7Ym9yZGVyLXJhZGl1czo1cHg7Y3Vyc29yOnBvaW50ZXI7Ym9yZGVyOjFweCBzb2xpZDt0cmFuc2l0aW9uOmFsbCAuMTVzO3doaXRlLXNwYWNlOm5vd3JhcDtiYWNrZ3JvdW5kOm5vbmU7fQouYnRuLWdvbGR7YmFja2dyb3VuZDp2YXIoLS1nb2xkKSFpbXBvcnRhbnQ7Y29sb3I6IzAwMCFpbXBvcnRhbnQ7Ym9yZGVyLWNvbG9yOnZhcigtLWdvbGQpIWltcG9ydGFudDt9Ci5idG4tZ29sZDpob3ZlcntvcGFjaXR5Oi44NTt9Ci5idG4tZ3JlZW57YmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjEpO2JvcmRlci1jb2xvcjpyZ2JhKDc0LDIyMiwxMjgsLjMpO2NvbG9yOnZhcigtLWdyZWVuKTt9Ci5idG4tZ3JlZW46aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1ncmVlbik7Y29sb3I6IzAwMDt9Ci5idG4tYmx1ZXtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMSk7Ym9yZGVyLWNvbG9yOnJnYmEoOTYsMTY1LDI1MCwuMyk7Y29sb3I6dmFyKC0tYmx1ZSk7fQouYnRuLWJsdWU6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1ibHVlKTtjb2xvcjojMDAwO30KLmJ0bi1wdXJwbGV7YmFja2dyb3VuZDpyZ2JhKDE2NywxMzksMjUwLC4xKTtib3JkZXItY29sb3I6cmdiYSgxNjcsMTM5LDI1MCwuMyk7Y29sb3I6dmFyKC0tcHVycGxlKTt9Ci5idG4tcHVycGxlOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tcHVycGxlKTtjb2xvcjojMDAwO30KLmJ0bi1yZWR7YmFja2dyb3VuZDpyZ2JhKDI0NCw2Myw2MywuMDgpO2JvcmRlci1jb2xvcjpyZ2JhKDI0NCw2Myw2MywuMjUpO2NvbG9yOnZhcigtLXJlZCk7fQouYnRuLXJlZDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXJlZCk7Y29sb3I6I2ZmZjt9Ci5idG4tbXV0ZWR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItY29sb3I6dmFyKC0tYm9yZGVyKTtjb2xvcjp2YXIoLS1tdXRlZCk7fQouYnRuLW11dGVkOmhvdmVye2NvbG9yOnZhcigtLWluayk7fQouYnRuLXNte3BhZGRpbmc6NHB4IDEwcHg7Zm9udC1zaXplOjhweDt9CgovKiBQcm9qZWN0IGJhciAqLwoucHJvamVjdC1iYXJ7YmFja2dyb3VuZDp2YXIoLS1jYXJkKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6MTZweCAyMHB4O21hcmdpbi1ib3R0b206MTZweDtkaXNwbGF5OmZsZXg7Z2FwOjEycHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZmxleC1lbmQ7fQoucGZ7ZmxleDoxO21pbi13aWR0aDoxMzBweDt9Ci5wZiBsYWJlbHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjE0ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7ZGlzcGxheTpibG9jazttYXJnaW4tYm90dG9tOjVweDt9Ci5wZiBpbnB1dHt3aWR0aDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tYmcpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjhweCAxMXB4O2ZvbnQtZmFtaWx5OidETSBTYW5zJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayk7b3V0bGluZTpub25lO30KLnBmIGlucHV0OmZvY3Vze2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKTt9CgovKiBPdmVydmlldyAqLwoub3ZlcnZpZXd7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNiwxZnIpO2dhcDo4cHg7bWFyZ2luLWJvdHRvbToxNnB4O30KQG1lZGlhKG1heC13aWR0aDo3MDBweCl7Lm92ZXJ2aWV3e2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO319Ci5vdntiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjEycHggMTRweDt0ZXh0LWFsaWduOmNlbnRlcjt9Ci5vdi1ue2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZTozMnB4O2xpbmUtaGVpZ2h0OjE7bWFyZ2luLWJvdHRvbTozcHg7fQoub3YtbHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTt9Ci5wcm9nLXdyYXB7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjNweDtoZWlnaHQ6NHB4O292ZXJmbG93OmhpZGRlbjttYXJnaW4tdG9wOjZweDt9Ci5wcm9nLWZpbGx7aGVpZ2h0OjEwMCU7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsdmFyKC0tZ29sZCksdmFyKC0tZ3JlZW4pKTtib3JkZXItcmFkaXVzOjNweDt0cmFuc2l0aW9uOndpZHRoIC40czt9CgovKiBBZGQgcGFuZWwgKi8KLmFkZC1wYW5lbHtiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoxNnB4IDIwcHg7bWFyZ2luLWJvdHRvbToxNHB4O30KLmFkZC1wYW5lbC10aXRsZXtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjE4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7bWFyZ2luLWJvdHRvbToxMHB4O30KLmFkZC1yb3d7ZGlzcGxheTpmbGV4O2dhcDo3cHg7ZmxleC13cmFwOndyYXA7fQouYWRkLXJvdyBpbnB1dCwuYWRkLXJvdyBzZWxlY3R7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6OXB4IDExcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1pbmspO291dGxpbmU6bm9uZTt9Ci5hZGQtcm93IGlucHV0OmZvY3VzLC5hZGQtcm93IHNlbGVjdDpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7fQouYWRkLXJvdyBzZWxlY3Qgb3B0aW9ue2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7fQouYWktdXJse2ZsZXg6MzttaW4td2lkdGg6MTgwcHg7fQouYWkta3d7ZmxleDoyO21pbi13aWR0aDoxNDBweDt9Ci5haS1wb3N7d2lkdGg6OTBweDt9Ci5haS1pbXBye3dpZHRoOjkwcHg7fQouYnVsay1hcmVhe3dpZHRoOjEwMCU7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6OXB4IDExcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1pbmspO291dGxpbmU6bm9uZTttaW4taGVpZ2h0OjYwcHg7cmVzaXplOnZlcnRpY2FsO21hcmdpbi10b3A6OHB4O30KLmJ1bGstYXJlYTpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tZ29sZCk7fQoKLyogRmlsdGVyIGJhciAqLwouZmlsdGVyLWJhcntkaXNwbGF5OmZsZXg7Z2FwOjdweDttYXJnaW4tYm90dG9tOjEycHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO30KLmZpbHRlci1iYXIgc2VsZWN0LC5maWx0ZXItYmFyIGlucHV0e2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4wNmVtO2NvbG9yOnZhcigtLW11dGVkKTtvdXRsaW5lOm5vbmU7fQouZmlsdGVyLWJhciBpbnB1dHt0ZXh0LXRyYW5zZm9ybTpub25lO2ZvbnQtc2l6ZToxMnB4O30KLmZpbHRlci1iYXIgaW5wdXQ6Zm9jdXMsLmZpbHRlci1iYXIgc2VsZWN0OmZvY3Vze2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKTtjb2xvcjp2YXIoLS1pbmspO30KCi8qIFBhZ2UgY2FyZHMgKi8KLnBhZ2VzLWxpc3R7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O30KLnBhZ2UtY2FyZHtiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjEwcHg7b3ZlcmZsb3c6aGlkZGVuO30KLnBhZ2UtY2FyZC5zLWRvbmV7Ym9yZGVyLWxlZnQ6M3B4IHNvbGlkIHZhcigtLWdyZWVuKTt9Ci5wYWdlLWNhcmQucy1pbnByb2dyZXNze2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1nb2xkKTt9Ci5wYWdlLWNhcmQucy1ub3RzdGFydGVke2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1kaW0pO30KLnBhZ2UtY2FyZC5zLWZvbGxvd3Vwe2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1wdXJwbGUpO30KLnBhZ2UtY2FyZC5zLWJsb2NrZWR7Ym9yZGVyLWxlZnQ6M3B4IHNvbGlkIHZhcigtLXJlZCk7fQoKLmNhcmQtaGVhZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo5cHg7cGFkZGluZzoxMXB4IDE1cHg7Y3Vyc29yOnBvaW50ZXI7dXNlci1zZWxlY3Q6bm9uZTt9Ci5jYXJkLWhlYWQ6aG92ZXJ7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wMik7fQouY2FyZC1yYW5re2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2NvbG9yOnZhcigtLWRpbSk7d2lkdGg6MjZweDt0ZXh0LWFsaWduOmNlbnRlcjtmbGV4LXNocmluazowO30KLnByaS1kb3R7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJhZGl1czo1MCU7ZmxleC1zaHJpbms6MDt9Ci5wcmktaGlnaHtiYWNrZ3JvdW5kOnZhcigtLXJlZCk7fQoucHJpLW1lZHtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO30KLnByaS1sb3d7YmFja2dyb3VuZDp2YXIoLS1ncmVlbik7fQouY2FyZC11cmx7ZmxleDoxO2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tYmx1ZSk7d29yZC1icmVhazpicmVhay1hbGw7bGluZS1oZWlnaHQ6MS40O30KLmNhcmQta3d7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi1sZWZ0OjRweDt9Ci5jYXJkLWdzY3tmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tZGltKTt3aGl0ZS1zcGFjZTpub3dyYXA7fQouY2FyZC1jaGt7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtjb2xvcjp2YXIoLS1nb2xkKTt3aGl0ZS1zcGFjZTpub3dyYXA7fQouc3RhdHVzLWJ0bntmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6M3B4IDhweDtib3JkZXItcmFkaXVzOjRweDtjdXJzb3I6cG9pbnRlcjtib3JkZXI6MXB4IHNvbGlkO3doaXRlLXNwYWNlOm5vd3JhcDt9Ci5zLW5vdHN0YXJ0ZWQgLnN0YXR1cy1idG57YmFja2dyb3VuZDpyZ2JhKDcxLDg1LDEwNSwuMik7Y29sb3I6dmFyKC0tc3ViKTtib3JkZXItY29sb3I6dmFyKC0tYm9yZGVyKTt9Ci5zLWlucHJvZ3Jlc3MgLnN0YXR1cy1idG57YmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjEpO2NvbG9yOnZhcigtLWdvbGQpO2JvcmRlci1jb2xvcjpyZ2JhKDI1MSwxOTEsMzYsLjMpO30KLnMtZG9uZSAuc3RhdHVzLWJ0bntiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMSk7Y29sb3I6dmFyKC0tZ3JlZW4pO2JvcmRlci1jb2xvcjpyZ2JhKDc0LDIyMiwxMjgsLjMpO30KLnMtZm9sbG93dXAgLnN0YXR1cy1idG57YmFja2dyb3VuZDpyZ2JhKDE2NywxMzksMjUwLC4xKTtjb2xvcjp2YXIoLS1wdXJwbGUpO2JvcmRlci1jb2xvcjpyZ2JhKDE2NywxMzksMjUwLC4zKTt9Ci5zLWJsb2NrZWQgLnN0YXR1cy1idG57YmFja2dyb3VuZDpyZ2JhKDI0NCw2Myw2MywuMSk7Y29sb3I6dmFyKC0tcmVkKTtib3JkZXItY29sb3I6cmdiYSgyNDQsNjMsNjMsLjMpO30KLmNoZXZyb257Y29sb3I6dmFyKC0tZGltKTtmb250LXNpemU6MTFweDt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMnM7ZmxleC1zaHJpbms6MDt9Ci5jaGV2cm9uLm9wZW57dHJhbnNmb3JtOnJvdGF0ZSgxODBkZWcpO30KCi5jYXJkLWJvZHl7ZGlzcGxheTpub25lO3BhZGRpbmc6MTRweCAxNXB4O2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7fQouY2FyZC1ib2R5Lm9wZW57ZGlzcGxheTpibG9jazt9Ci5jYi1ncmlke2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmcjtnYXA6MTJweDttYXJnaW4tYm90dG9tOjEycHg7fQpAbWVkaWEobWF4LXdpZHRoOjYwMHB4KXsuY2ItZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyO319Ci5jYi1maWVsZCBsYWJlbHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjEyZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7ZGlzcGxheTpibG9jazttYXJnaW4tYm90dG9tOjVweDt9Ci5jYi1maWVsZCBpbnB1dCwuY2ItZmllbGQgc2VsZWN0LC5jYi1maWVsZCB0ZXh0YXJlYXt3aWR0aDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tYmcpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjhweCAxMHB4O2ZvbnQtZmFtaWx5OidETSBTYW5zJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayk7b3V0bGluZTpub25lO3Jlc2l6ZTp2ZXJ0aWNhbDt9Ci5jYi1maWVsZCB0ZXh0YXJlYXttaW4taGVpZ2h0OjYwcHg7Zm9udC1zaXplOjEycHg7fQouY2ItZmllbGQgaW5wdXQ6Zm9jdXMsLmNiLWZpZWxkIHNlbGVjdDpmb2N1cywuY2ItZmllbGQgdGV4dGFyZWE6Zm9jdXN7Ym9yZGVyLWNvbG9yOnZhcigtLWdvbGQpO30KLmNiLWZpZWxkIHNlbGVjdCBvcHRpb257YmFja2dyb3VuZDp2YXIoLS1jYXJkKTt9CgovKiBDaGVja2xpc3QgKi8KLmNsLWhlYWRlcntmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjE2ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7bWFyZ2luLWJvdHRvbTo4cHg7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2FsaWduLWl0ZW1zOmNlbnRlcjt9Ci5jbC1ncmlke2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmcjtnYXA6M3B4O21hcmdpbi1ib3R0b206MTJweDt9CkBtZWRpYShtYXgtd2lkdGg6NjAwcHgpey5jbC1ncmlke2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnI7fX0KLmNsLWl0ZW17ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6N3B4O3BhZGRpbmc6NnB4IDlweDtiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsLjAxNSk7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7dXNlci1zZWxlY3Q6bm9uZTt9Ci5jbC1pdGVtOmhvdmVye2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuMDQpO30KLmNsLWl0ZW0gaW5wdXRbdHlwZT1jaGVja2JveF17d2lkdGg6MTNweDtoZWlnaHQ6MTNweDthY2NlbnQtY29sb3I6dmFyKC0tZ3JlZW4pO2N1cnNvcjpwb2ludGVyO2ZsZXgtc2hyaW5rOjA7fQouY2wtaXRlbSBsYWJlbHtmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1tdXRlZCk7Y3Vyc29yOnBvaW50ZXI7ZmxleDoxO2xpbmUtaGVpZ2h0OjEuMzt9Ci5jbC1pdGVtLmNoZWNrZWQgbGFiZWx7Y29sb3I6dmFyKC0tZ3JlZW4pO3RleHQtZGVjb3JhdGlvbjpsaW5lLXRocm91Z2g7b3BhY2l0eTouNTU7fQouY2wtY2F0e2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjdweDtsZXR0ZXItc3BhY2luZzouMDVlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzoxcHggNXB4O2JvcmRlci1yYWRpdXM6M3B4O2ZsZXgtc2hyaW5rOjA7fQouY2F0LWF1ZGl0e2JhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4xMik7Y29sb3I6dmFyKC0tZ29sZCk7fQouY2F0LWNvbnRlbnR7YmFja2dyb3VuZDpyZ2JhKDE2NywxMzksMjUwLC4xMik7Y29sb3I6dmFyKC0tcHVycGxlKTt9Ci5jYXQtdGVjaG5pY2Fse2JhY2tncm91bmQ6cmdiYSg5NiwxNjUsMjUwLC4xMik7Y29sb3I6dmFyKC0tYmx1ZSk7fQouY2F0LWF1dGhvcml0eXtiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMTIpO2NvbG9yOnZhcigtLWdyZWVuKTt9CgouY2FyZC1hY3Rpb25ze2Rpc3BsYXk6ZmxleDtnYXA6NXB4O2ZsZXgtd3JhcDp3cmFwO3BhZGRpbmctdG9wOjEwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9CgovKiBFbXB0eSAqLwouZW1wdHl7dGV4dC1hbGlnbjpjZW50ZXI7cGFkZGluZzo1MHB4IDIwcHg7Y29sb3I6dmFyKC0tZGltKTt9Ci5lbXB0eSBoM3tmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6MjZweDtsZXR0ZXItc3BhY2luZzouMDRlbTttYXJnaW4tYm90dG9tOjZweDtjb2xvcjp2YXIoLS1zdWIpO30KCi50b2FzdHtwb3NpdGlvbjpmaXhlZDtib3R0b206MjhweDtsZWZ0OjUwJTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKSB0cmFuc2xhdGVZKDIwcHgpO2JhY2tncm91bmQ6dmFyKC0tZ29sZCk7Y29sb3I6IzAwMDtwYWRkaW5nOjlweCAyMHB4O2JvcmRlci1yYWRpdXM6NTBweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjcwMDtvcGFjaXR5OjA7dHJhbnNpdGlvbjphbGwgLjNzO3otaW5kZXg6MTAwMDA7cG9pbnRlci1ldmVudHM6bm9uZTt9Ci50b2FzdC5zaG93e29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKSB0cmFuc2xhdGVZKDApO30KI2ltcG9ydElucHV0e2Rpc3BsYXk6bm9uZTt9CgovKiDilIDilIAgTU9CSUxFIFJFU1BPTlNJVkUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmhpZGRlbjt9CmltZyx0YWJsZSxpZnJhbWV7bWF4LXdpZHRoOjEwMCU7fQpAbWVkaWEobWF4LXdpZHRoOjc2OHB4KXsKICAud3JhcHtwYWRkaW5nOjAgMTRweCA2MHB4IWltcG9ydGFudDt9CiAgLnRvcGJhcntwYWRkaW5nOjEycHggMDtnYXA6OHB4O30KICAudG9wYmFyLXJpZ2h0e2dhcDo1cHg7fQogIC5idG57Zm9udC1zaXplOjhweDtwYWRkaW5nOjZweCAxMHB4O30KICAub3ZlcnZpZXcsLnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcikhaW1wb3J0YW50O30KICAuYWRkLXJvd3tmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5hZGQtcm93IGlucHV0LC5hZGQtcm93IHNlbGVjdHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmZpbHRlci1iYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7fQogIC5maWx0ZXItYmFyIHNlbGVjdCwuZmlsdGVyLWJhciBpbnB1dHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmNhcmQtaGVhZHtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4O30KICAucmVjLWhlYWR7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7d2lkdGg6MTAwJTt9CiAgLmcyLC5nMywuZzQsLmNiLWdyaWQsLmNhcmQtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIWltcG9ydGFudDt9CiAgLnByb2plY3QtYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnBme21pbi13aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLnN0ZXBze2ZsZXgtZGlyZWN0aW9uOmNvbHVtbiFpbXBvcnRhbnQ7fQogIC5zdGVwe2JvcmRlci1yaWdodDpub25lIWltcG9ydGFudDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KICAuc3RlcDpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206bm9uZTt9CiAgLmhvdy1zdGVwe2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLmZsb3ctc3RlcHtnYXA6MTBweDt9CiAgLnJlYy1mb290e2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O30KICAuYWN0aW9uLWJ0bnt3aWR0aDoxMDAlO2p1c3RpZnktY29udGVudDpjZW50ZXI7Zm9udC1zaXplOjE2cHghaW1wb3J0YW50O30KICAubW9kZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5tb2RlLWJ0bntib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Cn0KQG1lZGlhKG1heC13aWR0aDo0ODBweCl7CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyIWltcG9ydGFudDt9CiAgLnRvcGJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1zdGFydDt9CiAgLnRvcGJhci1yaWdodHtmbGV4LXdyYXA6d3JhcDt9CiAgLmNhcmQtbWV0YXtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4O30KICAuY2FyZC1hY3Rpb25zLC5jYXJkLWFjdGlvbnMgLmJ0biwuY2FyZC1mb290e2ZsZXgtd3JhcDp3cmFwO30KICBoMSxoMiwudG9vbC1uYW1le3dvcmQtYnJlYWs6YnJlYWstd29yZDt9CiAgLnBhbmVse3BhZGRpbmc6MTZweCFpbXBvcnRhbnQ7fQogIC5zZWN0aW9ue3BhZGRpbmc6MTRweCAxNnB4IWltcG9ydGFudDt9Cn0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGRpdiBjbGFzcz0id3JhcCI+Cgo8ZGl2IGNsYXNzPSJ0b3BiYXIiPgogIDxhIGhyZWY9Imh0dHBzOi8vY29udGVudHNjYWxlLnNpdGUiIGNsYXNzPSJicmFuZCI+Q29udGVudFNjYWxlPC9hPgogIDxkaXYgY2xhc3M9InRvb2wtdGl0bGUiPlNFTyBBVURJVCBXT1JLRkxPVyBNQU5BR0VSPC9kaXY+CiAgPGRpdiBjbGFzcz0idG9wYmFyLXJpZ2h0Ij4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ29sZCIgb25jbGljaz0iZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dzY0ltcG9ydElucHV0JykuY2xpY2soKSI+8J+TiiBJbXBvcnQgR1NDIENTViAoUGFnZXMgKyBRdWVyaWVzKTwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wdXJwbGUiIG9uY2xpY2s9InNjYW5BbGxTY29yZXMoKSI+4pqhIEF1dG8tU2NvcmUgQWxsPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdyZWVuIiBvbmNsaWNrPSJleHBvcnRDU1YoKSI+4oaTIEV4cG9ydCBDU1Y8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHVycGxlIiBvbmNsaWNrPSJzeW5jVG9TZXJ2ZXIoKSIgaWQ9InN5bmNCdG4iIHRpdGxlPSJTYXZlIHRvIHNlcnZlciDigJQgYWNjZXNzaWJsZSBmcm9tIGFueSBkZXZpY2UiPuKYgSBTYXZlIHRvIFNlcnZlcjwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0ibG9hZEZyb21TZXJ2ZXIoKSIgdGl0bGU9IkxvYWQgZnJvbSBzZXJ2ZXIiPuKGkyBMb2FkIGZyb20gU2VydmVyPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWJsdWUiIG9uY2xpY2s9ImRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbXBvcnRJbnB1dCcpLmNsaWNrKCkiPuKGkSBJbXBvcnQgUHJvZ3Jlc3M8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHVycGxlIiBvbmNsaWNrPSJleHBvcnRDbGllbnRSZXBvcnQoKSI+8J+ThCBDbGllbnQgUmVwb3J0PC9idXR0b24+CiAgICA8YSBocmVmPSIvYXVkaXQtcmVjb21tZW5kYXRpb25zIiBjbGFzcz0iYnRuIGJ0bi1nb2xkIj7wn46vIFJlY29tbWVuZGF0aW9uczwvYT4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcmVkIiBvbmNsaWNrPSJjbGVhckFsbCgpIj7inJUgQ2xlYXI8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQiIG9uY2xpY2s9ImNsZWFuQmFkUGFnZXMoKSIgdGl0bGU9IlJlbW92ZSBpbnZhbGlkIGVudHJpZXMgKHF1ZXJpZXMsIGtleXdvcmRzKSBmcm9tIHRoZSBsaXN0Ij7wn6e5IENsZWFuIHVwPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIiBvbmNsaWNrPSJtZXJnZUR1cGxpY2F0ZVBhZ2VzKCkiIHRpdGxlPSJNZXJnZSBkdXBsaWNhdGUgVVJMcyBpbnRvIG9uZSBlbnRyeSI+8J+UgCBNZXJnZSBkdXBlczwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZWQgYnRuLXNtIiBpZD0iYnVsa0RlbGV0ZUJ0biIgb25jbGljaz0iYnVsa0RlbGV0ZVNlbGVjdGVkKCkiIHN0eWxlPSJkaXNwbGF5Om5vbmUiPvCfl5EgRGVsZXRlIHNlbGVjdGVkICg8c3BhbiBpZD0iYnVsa0NvdW50Ij4wPC9zcGFuPik8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQgYnRuLXNtIiBpZD0iYnVsa1NlbGVjdEFsbEJ0biIgb25jbGljaz0iYnVsa1NlbGVjdEFsbCgpIiBzdHlsZT0iZGlzcGxheTpub25lIj7inJMgU2VsZWN0IGFsbDwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0ic2VsZWN0QWxsUGFnZXMoKSIgdGl0bGU9IlNlbGVjdCBhbGwgdmlzaWJsZSBwYWdlcyBmb3IgYnVsayBhY3Rpb25zIj7imJEgU2VsZWN0IGFsbDwvYnV0dG9uPgogICAgPGlucHV0IHR5cGU9ImZpbGUiIGlkPSJpbXBvcnRJbnB1dCIgYWNjZXB0PSIuY3N2IiBvbmNoYW5nZT0iaW1wb3J0Q1NWKHRoaXMpIj4KICAgIDxpbnB1dCB0eXBlPSJmaWxlIiBpZD0iZ3NjSW1wb3J0SW5wdXQiIGFjY2VwdD0iLmNzdiIgbXVsdGlwbGUgb25jaGFuZ2U9ImltcG9ydEdTQyh0aGlzKSI+CiAgPC9kaXY+CjwvZGl2PgoKPGRpdiBpZD0ic3luY1N0YXR1cyIgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLWRpbSk7dGV4dC1hbGlnbjpyaWdodDttYXJnaW4tYm90dG9tOjZweDsiPjwvZGl2Pgo8ZGl2IGNsYXNzPSJwcm9qZWN0LWJhciI+CiAgPGRpdiBjbGFzcz0icGYiPjxsYWJlbD5DbGllbnQgLyBQcm9qZWN0PC9sYWJlbD48aW5wdXQgaWQ9InBDbGllbnQiIHBsYWNlaG9sZGVyPSJDb250ZW50U2NhbGUuc2l0ZSIgb25pbnB1dD0ic2F2ZSgpIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwZiIgc3R5bGU9ImZsZXg6MiI+PGxhYmVsPldlYnNpdGU8L2xhYmVsPjxpbnB1dCBpZD0icFNpdGUiIHBsYWNlaG9sZGVyPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlIiBvbmlucHV0PSJzYXZlKCkiPjwvZGl2PgogIDxkaXYgY2xhc3M9InBmIj48bGFiZWw+RGVhZGxpbmU8L2xhYmVsPjxpbnB1dCB0eXBlPSJkYXRlIiBpZD0icERlYWRsaW5lIiBvbmlucHV0PSJzYXZlKCkiPjwvZGl2PgogIDxkaXYgY2xhc3M9InBmIj48bGFiZWw+QXVkaXRvcjwvbGFiZWw+PGlucHV0IGlkPSJwQXVkaXRvciIgcGxhY2Vob2xkZXI9Ik90dG1hciIgb25pbnB1dD0ic2F2ZSgpIj48L2Rpdj4KPC9kaXY+Cgo8ZGl2IGNsYXNzPSJvdmVydmlldyI+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdlRvdGFsIiBzdHlsZT0iY29sb3I6dmFyKC0tYmx1ZSkiPjA8L2Rpdj48ZGl2IGNsYXNzPSJvdi1sIj5Ub3RhbDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9Im92Ij48ZGl2IGNsYXNzPSJvdi1uIiBpZD0ib3ZOb3RTdGFydGVkIiBzdHlsZT0iY29sb3I6dmFyKC0tZGltKSI+MDwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPk5vdCBTdGFydGVkPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdkluUHJvZ3Jlc3MiIHN0eWxlPSJjb2xvcjp2YXIoLS1nb2xkKSI+MDwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPkluIFByb2dyZXNzPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdkRvbmUiIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPjA8L2Rpdj48ZGl2IGNsYXNzPSJvdi1sIj5Eb25lPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ib3YiPjxkaXYgY2xhc3M9Im92LW4iIGlkPSJvdkZvbGxvd3VwIiBzdHlsZT0iY29sb3I6dmFyKC0tcHVycGxlKSI+MDwvZGl2PjxkaXYgY2xhc3M9Im92LWwiPkZvbGxvdy11cDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9Im92Ij48ZGl2IGNsYXNzPSJvdi1uIiBpZD0ib3ZQY3QiIHN0eWxlPSJjb2xvcjp2YXIoLS1nb2xkKSI+MCU8L2Rpdj48ZGl2IGNsYXNzPSJvdi1sIj5Db21wbGV0ZTwvZGl2PjxkaXYgY2xhc3M9InByb2ctd3JhcCI+PGRpdiBjbGFzcz0icHJvZy1maWxsIiBpZD0ib3ZCYXIiIHN0eWxlPSJ3aWR0aDowJSI+PC9kaXY+PC9kaXY+PC9kaXY+CjwvZGl2PgoKPGRpdiBjbGFzcz0iYWRkLXBhbmVsIj4KICA8ZGl2IGNsYXNzPSJhZGQtcGFuZWwtdGl0bGUiPkFkZCBQYWdlcyB0byBBdWRpdCBRdWV1ZTwvZGl2PgoKICA8IS0tIFNpbmdsZSBVUkwgcm93IC0tPgogIDxkaXYgY2xhc3M9ImFkZC1yb3ciPgogICAgPGlucHV0IGNsYXNzPSJhaS11cmwiIGlkPSJuZXdVcmwiIHBsYWNlaG9sZGVyPSJodHRwczovL3NpdGUuY29tL3BhZ2UiIG9ua2V5ZG93bj0iaWYoZXZlbnQua2V5PT09J0VudGVyJylhZGRQYWdlKCkiPgogICAgPGlucHV0IGNsYXNzPSJhaS1rdyIgaWQ9Im5ld0t3IiBwbGFjZWhvbGRlcj0iUHJpbWFyeSBrZXl3b3JkIiBvbmtleWRvd249ImlmKGV2ZW50LmtleT09PSdFbnRlcicpYWRkUGFnZSgpIj4KICAgIDxzZWxlY3QgaWQ9Im5ld1ByaSI+PG9wdGlvbiB2YWx1ZT0iaGlnaCI+8J+UtCBIaWdoPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibWVkIiBzZWxlY3RlZD7wn5+hIE1lZGl1bTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImxvdyI+8J+foiBMb3c8L29wdGlvbj48L3NlbGVjdD4KICAgIDxpbnB1dCBjbGFzcz0iYWktcG9zIiBpZD0ibmV3UG9zIiB0eXBlPSJudW1iZXIiIHBsYWNlaG9sZGVyPSJQb3NpdGlvbiIgbWluPSIxIiBtYXg9IjIwMCI+CiAgICA8aW5wdXQgY2xhc3M9ImFpLWltcHIiIGlkPSJuZXdJbXByIiB0eXBlPSJudW1iZXIiIHBsYWNlaG9sZGVyPSJJbXByZXNzaW9ucyI+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdvbGQiIG9uY2xpY2s9ImFkZFBhZ2UoKSI+KyBBZGQ8L2J1dHRvbj4KICA8L2Rpdj4KCiAgPCEtLSBTaXRlbWFwIGZldGNoIC0tPgogIDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6MTJweDtwYWRkaW5nOjE0cHg7YmFja2dyb3VuZDpyZ2JhKDk2LDE2NSwyNTAsLjA1KTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoOTYsMTY1LDI1MCwuMik7Ym9yZGVyLXJhZGl1czo4cHg7Ij4KICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4xNGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1ibHVlKTttYXJnaW4tYm90dG9tOjhweDsiPvCfl7ogSW1wb3J0IFNpdGVtYXA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFkZC1yb3ciIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDsiPgogICAgICA8aW5wdXQgaWQ9InNpdGVtYXBVcmwiIHBsYWNlaG9sZGVyPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlL3NpdGVtYXAueG1sIiBzdHlsZT0iZmxleDoxO21pbi13aWR0aDoyMjBweDtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzo5cHggMTFweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLWluayk7b3V0bGluZTpub25lOyIgb25rZXlkb3duPSJpZihldmVudC5rZXk9PT0nRW50ZXInKWZldGNoU2l0ZW1hcCgpIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1ibHVlIiBvbmNsaWNrPSJmZXRjaFNpdGVtYXAoKSIgaWQ9InNpdGVtYXBCdG4iPuKGkyBGZXRjaCBTaXRlbWFwPC9idXR0b24+CiAgICA8L2Rpdj4KICAgIDxkaXYgaWQ9InNpdGVtYXBTdGF0dXMiIHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NnB4OyI+PC9kaXY+CgogICAgPCEtLSBTaXRlbWFwIHByZXZpZXcgKyBmaWx0ZXIgLS0+CiAgICA8ZGl2IGlkPSJzaXRlbWFwUHJldmlldyIgc3R5bGU9ImRpc3BsYXk6bm9uZTttYXJnaW4tdG9wOjEycHg7Ij4KICAgICAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O21hcmdpbi1ib3R0b206OHB4O2ZsZXgtd3JhcDp3cmFwOyI+CiAgICAgICAgPGlucHV0IGlkPSJzaXRlbWFwRmlsdGVyIiBwbGFjZWhvbGRlcj0iRmlsdGVyIGJ5IHBhdGguLi4gZS5nLiAvYmxvZyBvciAvc2VydmljZXMiIG9uaW5wdXQ9ImZpbHRlclNpdGVtYXBVcmxzKCkiCiAgICAgICAgICBzdHlsZT0iZmxleDoxO21pbi13aWR0aDoxNjBweDtiYWNrZ3JvdW5kOnZhcigtLWJnKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzo3cHggMTBweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLWluayk7b3V0bGluZTpub25lOyI+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1nb2xkIGJ0bi1zbSIgb25jbGljaz0iZmlsdGVyU2l0ZW1hcEJ5R1NDKCkiIHRpdGxlPSJTaG93IG9ubHkgc2l0ZW1hcCBVUkxzIHRoYXQgYXJlIGFsc28gaW4geW91ciBHU0MgZGF0YSI+8J+UlyBGaWx0ZXIgYnkgR1NDPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCBidG4tc20iIG9uY2xpY2s9InNlbGVjdEFsbFNpdGVtYXAoKSI+4pyTIEFsbDwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQgYnRuLXNtIiBvbmNsaWNrPSJkZXNlbGVjdEFsbFNpdGVtYXAoKSI+4pyVIE5vbmU8L2J1dHRvbj4KICAgICAgICA8c3BhbiBpZD0ic2l0ZW1hcFNlbENvdW50IiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLW11dGVkKTsiPjwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgaWQ9InNpdGVtYXBVcmxMaXN0IiBzdHlsZT0ibWF4LWhlaWdodDoyODBweDtvdmVyZmxvdy15OmF1dG87YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6NnB4OyI+PC9kaXY+CiAgICAgIDxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDtnYXA6OHB4O21hcmdpbi10b3A6MTBweDtmbGV4LXdyYXA6d3JhcDsiPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ29sZCIgb25jbGljaz0iYWRkU2VsZWN0ZWRTaXRlbWFwVXJscygpIj4rIEFkZCBzZWxlY3RlZCB0byBxdWV1ZTwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcmVkIGJ0bi1zbSIgb25jbGljaz0iZGVsZXRlU2VsZWN0ZWRTaXRlbWFwVXJscygpIiB0aXRsZT0iUmVtb3ZlIHNlbGVjdGVkIFVSTHMgZnJvbSBsaXN0Ij7wn5eRIERlbGV0ZSBzZWxlY3RlZDwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbXV0ZWQgYnRuLXNtIiBvbmNsaWNrPSJjbGVhckFsbFNpdGVtYXBVcmxzKCkiIHRpdGxlPSJSZW1vdmUgYWxsIFVSTHMgZnJvbSBsaXN0Ij7inJUgQ2xlYXIgYWxsPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0iZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBQcmV2aWV3Jykuc3R5bGUuZGlzcGxheT0nbm9uZSciPuKclSBDbG9zZTwvYnV0dG9uPgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PgoKICA8IS0tIEJ1bGsgcGFzdGUgLS0+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4OyI+CiAgICA8ZGl2IHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMTRlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjZweDsiPvCfk4sgQnVsayBQYXN0ZTwvZGl2PgogICAgPHRleHRhcmVhIGNsYXNzPSJidWxrLWFyZWEiIGlkPSJidWxrQXJlYSIgcGxhY2Vob2xkZXI9IlBhc3RlIG11bHRpcGxlIFVSTHMgKMOpw6luIHBlciBsaW5lKSDigJQgd2Vya3QgbWV0IHNpdGVtYXAgZXhwb3J0cywgR1NDIGxpanN0ZW4sIGV0Yy4iPjwvdGV4dGFyZWE+CiAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7Z2FwOjhweDttYXJnaW4tdG9wOjdweDthbGlnbi1pdGVtczpjZW50ZXI7Ij4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCIgb25jbGljaz0iYnVsa0FkZCgpIj4rIEJ1bGsgQWRkPC9idXR0b24+CiAgICAgIDxzcGFuIHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtjb2xvcjp2YXIoLS1kaW0pOyI+T25lIFVSTCBwZXIgbGluZTwvc3Bhbj4KICAgIDwvZGl2PgogIDwvZGl2Pgo8L2Rpdj4KCjxkaXYgY2xhc3M9ImZpbHRlci1iYXIiPgogIDxzZWxlY3QgaWQ9ImZTdGF0dXMiIG9uY2hhbmdlPSJyZW5kZXJQYWdlcygpIj4KICAgIDxvcHRpb24gdmFsdWU9ImFsbCI+QWxsIHN0YXR1c2VzPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJub3RzdGFydGVkIj5Ob3QgU3RhcnRlZDwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iaW5wcm9ncmVzcyI+SW4gUHJvZ3Jlc3M8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImRvbmUiPkRvbmU8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImZvbGxvd3VwIj5Gb2xsb3ctdXA8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImJsb2NrZWQiPkJsb2NrZWQ8L29wdGlvbj4KICA8L3NlbGVjdD4KICA8c2VsZWN0IGlkPSJmUHJpIiBvbmNoYW5nZT0icmVuZGVyUGFnZXMoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCBwcmlvcml0aWVzPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJoaWdoIj7wn5S0IEhpZ2g8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9Im1lZCI+8J+foSBNZWRpdW08L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImxvdyI+8J+foiBMb3c8L29wdGlvbj4KICA8L3NlbGVjdD4KICA8c2VsZWN0IGlkPSJmU29ydCIgb25jaGFuZ2U9InJlbmRlclBhZ2VzKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0icHJpb3JpdHkiPlNvcnQ6IFByaW9yaXR5PC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJwb3NpdGlvbiI+U29ydDogR1NDIFBvc2l0aW9uPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJpbXByZXNzaW9ucyI+U29ydDogSW1wcmVzc2lvbnM8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImNoZWNrbGlzdCI+U29ydDogQ2hlY2tsaXN0ICU8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InN0YXR1cyI+U29ydDogU3RhdHVzPC9vcHRpb24+CiAgPC9zZWxlY3Q+CiAgPGlucHV0IGlkPSJmU2VhcmNoIiBwbGFjZWhvbGRlcj0iU2VhcmNoIFVSTCBvciBrZXl3b3JkLi4uIiBvbmlucHV0PSJyZW5kZXJQYWdlcygpIiBzdHlsZT0iZmxleDoxO21pbi13aWR0aDoxNTBweDsiPgo8L2Rpdj4KCjxkaXYgaWQ9ImJ1bGtCYXIiIHN0eWxlPSJkaXNwbGF5Om5vbmU7YmFja2dyb3VuZDpyZ2JhKDIzOSw2OCw2OCwuMDgpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyMzksNjgsNjgsLjIpO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6OHB4IDE0cHg7bWFyZ2luLWJvdHRvbTo4cHg7ZGlzcGxheTpub25lO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTBweDtmbGV4LXdyYXA6d3JhcDsiPgogIDxzcGFuIGlkPSJidWxrQ291bnQiIHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLXJlZCk7Zm9udC13ZWlnaHQ6NzAwOyI+MCBzZWxlY3RlZDwvc3Bhbj4KICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXJlZCBidG4tc20iIG9uY2xpY2s9ImRlbGV0ZVNlbGVjdGVkUGFnZXMoKSI+8J+XkSBEZWxldGUgc2VsZWN0ZWQ8L2J1dHRvbj4KICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIGJ0bi1zbSIgb25jbGljaz0iZGVzZWxlY3RBbGxQYWdlcygpIj7inJUgRGVzZWxlY3QgYWxsPC9idXR0b24+CjwvZGl2PgoKPGRpdiBjbGFzcz0icGFnZXMtbGlzdCIgaWQ9InBhZ2VzTGlzdCI+PC9kaXY+CjwvZGl2Pgo8ZGl2IGNsYXNzPSJ0b2FzdCIgaWQ9InRvYXN0Ij48L2Rpdj4KCjxzY3JpcHQ+Ci8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Ci8vIOKchSBGSVg6IEFVVE8tTE9BRCBEQVRBIEZST00gV09SS0ZMT1cKLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KCihmdW5jdGlvbiBhdXRvTG9hZFdvcmtmbG93RGF0YSgpIHsKICBjb25zb2xlLmxvZygn8J+UjSBDaGVja2luZyBmb3IgV29ya2Zsb3cgZGF0YS4uLicpOwogIAogIC8vIE1ldGhvZCAxOiBSZWFkIGZyb20gbG9jYWxTdG9yYWdlCiAgdHJ5IHsKICAgIHZhciB0cmFuc2ZlckRhdGEgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3NfYXVkaXRfdHJhbnNmZXInKTsKICAgIGlmICh0cmFuc2ZlckRhdGEpIHsKICAgICAgdmFyIGRhdGEgPSBKU09OLnBhcnNlKHRyYW5zZmVyRGF0YSk7CiAgICAgIGNvbnNvbGUubG9nKCfinIUgRm91bmQgV29ya2Zsb3cgZGF0YTonLCBkYXRhKTsKICAgICAgCiAgICAgIC8vIFN0b3JlIGdsb2JhbGx5IGZvciB1c2UgdGhyb3VnaG91dCB0aGUgcGFnZQogICAgICB3aW5kb3cuX3dvcmtmbG93RGF0YSA9IGRhdGE7CiAgICAgIHdpbmRvdy5fd29ya2Zsb3dHc2NEYXRhID0gZGF0YS5nc2NEYXRhIHx8IFtdOwogICAgICB3aW5kb3cuX3dvcmtmbG93UXVlcmllcyA9IGRhdGEucXVlcmllcyB8fCBbXTsKICAgICAgd2luZG93Ll93b3JrZmxvd1F1ZXJ5TWFwID0gZGF0YS5xdWVyeU1hcCB8fCB7fTsKICAgICAgCiAgICAgIC8vIEF1dG8tZmlsbCBmb3JtIGZpZWxkcyBhZnRlciBwYWdlIGxvYWRzCiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7CiAgICAgICAgLy8gRmluZCBhbmQgZmlsbCBVUkwgZmllbGQKICAgICAgICB2YXIgdXJsRmllbGRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbdHlwZT0idGV4dCJdLCBpbnB1dFt0eXBlPSJ1cmwiXScpOwogICAgICAgIHVybEZpZWxkcy5mb3JFYWNoKGZ1bmN0aW9uKGZpZWxkKSB7CiAgICAgICAgICB2YXIgcGxhY2Vob2xkZXIgPSAoZmllbGQucGxhY2Vob2xkZXIgfHwgJycpLnRvTG93ZXJDYXNlKCk7CiAgICAgICAgICB2YXIgbmFtZSA9IChmaWVsZC5uYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogICAgICAgICAgdmFyIGlkID0gKGZpZWxkLmlkIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogICAgICAgICAgCiAgICAgICAgICBpZiAocGxhY2Vob2xkZXIuaW5jbHVkZXMoJ3VybCcpIHx8IHBsYWNlaG9sZGVyLmluY2x1ZGVzKCdwYWdlJykgfHwgCiAgICAgICAgICAgICAgbmFtZS5pbmNsdWRlcygndXJsJykgfHwgaWQuaW5jbHVkZXMoJ3VybCcpKSB7CiAgICAgICAgICAgIGZpZWxkLnZhbHVlID0gZGF0YS5wYWdlVXJsOwogICAgICAgICAgICBjb25zb2xlLmxvZygn4pyFIEF1dG8tZmlsbGVkIFVSTCBmaWVsZCcpOwogICAgICAgICAgfQogICAgICAgICAgCiAgICAgICAgICBpZiAocGxhY2Vob2xkZXIuaW5jbHVkZXMoJ2tleXdvcmQnKSB8fCBwbGFjZWhvbGRlci5pbmNsdWRlcygna3cnKSB8fAogICAgICAgICAgICAgIG5hbWUuaW5jbHVkZXMoJ2tleXdvcmQnKSB8fCBpZC5pbmNsdWRlcygna2V5d29yZCcpKSB7CiAgICAgICAgICAgIGZpZWxkLnZhbHVlID0gZGF0YS5rZXl3b3JkOwogICAgICAgICAgICBjb25zb2xlLmxvZygn4pyFIEF1dG8tZmlsbGVkIGtleXdvcmQgZmllbGQnKTsKICAgICAgICAgIH0KICAgICAgICAgIAogICAgICAgICAgaWYgKHBsYWNlaG9sZGVyLmluY2x1ZGVzKCdicmFuZCcpIHx8IHBsYWNlaG9sZGVyLmluY2x1ZGVzKCdjbGllbnQnKSB8fAogICAgICAgICAgICAgIG5hbWUuaW5jbHVkZXMoJ2JyYW5kJykgfHwgaWQuaW5jbHVkZXMoJ2JyYW5kJykpIHsKICAgICAgICAgICAgZmllbGQudmFsdWUgPSBkYXRhLnByb2plY3ROYW1lOwogICAgICAgICAgICBjb25zb2xlLmxvZygn4pyFIEF1dG8tZmlsbGVkIGJyYW5kIGZpZWxkJyk7CiAgICAgICAgICB9CiAgICAgICAgfSk7CiAgICAgICAgCiAgICAgICAgLy8gU2hvdyBzdWNjZXNzIG5vdGlmaWNhdGlvbgogICAgICAgIHNob3dXb3JrZmxvd05vdGlmaWNhdGlvbihkYXRhKTsKICAgICAgfSwgNTAwKTsKICAgICAgCiAgICAgIC8vIENsZWFuIHVwIGxvY2FsU3RvcmFnZSBhZnRlciByZWFkaW5nCiAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdjc19hdWRpdF90cmFuc2ZlcicpOwogICAgfQogIH0gY2F0Y2goZSkgewogICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBXb3JrZmxvdyBkYXRhOicsIGUpOwogIH0KICAKICAvLyBNZXRob2QgMjogUmVhZCBmcm9tIFVSTCBwYXJhbWV0ZXJzIChiYWNrd2FyZCBjb21wYXRpYmlsaXR5KQogIHZhciBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpOwogIHZhciB1cmwgPSBwYXJhbXMuZ2V0KCd1cmwnKTsKICB2YXIga3cgPSBwYXJhbXMuZ2V0KCdrdycpOwogIHZhciB3ZklkID0gcGFyYW1zLmdldCgnd2YnKTsKICAKICBpZiAod2ZJZCkgewogICAgd2luZG93Ll93b3JrZmxvd0lkID0gd2ZJZDsKICAgIAogICAgLy8gVHJ5IHRvIGxvYWQgZnJvbSBzZXJ2ZXIgaWYgbG9jYWxTdG9yYWdlIGZhaWxlZAogICAgaWYgKCF3aW5kb3cuX3dvcmtmbG93RGF0YSAmJiB1cmwpIHsKICAgICAgZmV0Y2goJy9hcGkvYXVkaXQvZ2V0LXdvcmtmbG93LWRhdGE/dXJsPScgKyBlbmNvZGVVUklDb21wb25lbnQodXJsKSkKICAgICAgICAudGhlbihmdW5jdGlvbihyKSB7IHJldHVybiByLmpzb24oKTsgfSkKICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkgewogICAgICAgICAgaWYgKHJlc3BvbnNlLnN1Y2Nlc3MgJiYgcmVzcG9uc2UuZm91bmQpIHsKICAgICAgICAgICAgY29uc29sZS5sb2coJ+KchSBMb2FkZWQgZGF0YSBmcm9tIHNlcnZlcjonLCByZXNwb25zZSk7CiAgICAgICAgICAgIHdpbmRvdy5fd29ya2Zsb3dHc2NEYXRhID0gcmVzcG9uc2UuZ3NjRGF0YSB8fCBbXTsKICAgICAgICAgICAgd2luZG93Ll93b3JrZmxvd0RhdGEgPSByZXNwb25zZTsKICAgICAgICAgIH0KICAgICAgICB9KQogICAgICAgIC5jYXRjaChmdW5jdGlvbihlcnIpIHsKICAgICAgICAgIGNvbnNvbGUud2FybignQ291bGQgbm90IGxvYWQgZnJvbSBzZXJ2ZXI6JywgZXJyKTsKICAgICAgICB9KTsKICAgIH0KICB9Cn0pKCk7CgpmdW5jdGlvbiBzaG93V29ya2Zsb3dOb3RpZmljYXRpb24oZGF0YSkgewogIHZhciBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsKICBub3RpZmljYXRpb24uc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjpmaXhlZDt0b3A6MjBweDtyaWdodDoyMHB4O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjZmJiZjI0LCM0YWRlODApO2NvbG9yOiMwMDA7cGFkZGluZzoxNnB4IDI0cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtZmFtaWx5OklCTSBQbGV4IE1vbm8sbW9ub3NwYWNlO2ZvbnQtc2l6ZToxM3B4O2ZvbnQtd2VpZ2h0OjcwMDtib3gtc2hhZG93OjAgNHB4IDIwcHggcmdiYSgwLDAsMCwwLjMpO3otaW5kZXg6MTAwMDA7bWF4LXdpZHRoOjQwMHB4O2FuaW1hdGlvbjpzbGlkZUluIDAuM3MgZWFzZTtjdXJzb3I6cG9pbnRlcjsnOwogIAogIHZhciBnc2NDb3VudCA9IChkYXRhLmdzY0RhdGEgJiYgZGF0YS5nc2NEYXRhLmxlbmd0aCkgfHwgMDsKICB2YXIgcXVlcnlDb3VudCA9IChkYXRhLnF1ZXJpZXMgJiYgZGF0YS5xdWVyaWVzLmxlbmd0aCkgfHwgMDsKICAKICB2YXIgaHRtbCA9ICc8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMnB4O21hcmdpbi1ib3R0b206OHB4OyI+JzsKICBodG1sICs9ICc8c3BhbiBzdHlsZT0iZm9udC1zaXplOjI0cHg7Ij7inIU8L3NwYW4+JzsKICBodG1sICs9ICc8c3BhbiBzdHlsZT0iZm9udC1zaXplOjE1cHg7Ij5Xb3JrZmxvdyBEYXRhIExvYWRlZCE8L3NwYW4+JzsKICBodG1sICs9ICc8L2Rpdj4nOwogIGh0bWwgKz0gJzxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjQwMDtvcGFjaXR5OjAuOTtsaW5lLWhlaWdodDoxLjY7Ij4nOwogIGh0bWwgKz0gJ/Cfk4QgUGFnZTogJyArIChkYXRhLnBhZ2VVcmwgfHwgJ04vQScpLnNwbGl0KCcvJykucG9wKCkgKyAnPGJyPic7CiAgaHRtbCArPSAn8J+OryBLZXl3b3JkOiAnICsgKGRhdGEua2V5d29yZCB8fCAnTi9BJykgKyAnPGJyPic7CiAgaHRtbCArPSAn8J+TiiBHU0MgRGF0YTogJyArIGdzY0NvdW50ICsgJyBwYWdlcywgJyArIHF1ZXJ5Q291bnQgKyAnIHF1ZXJpZXM8YnI+JzsKICBodG1sICs9ICfwn5OBIFByb2plY3Q6ICcgKyAoZGF0YS5wcm9qZWN0TmFtZSB8fCAnTi9BJyk7CiAgaHRtbCArPSAnPC9kaXY+JzsKICBodG1sICs9ICc8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjEycHg7Zm9udC1zaXplOjEwcHg7b3BhY2l0eTowLjg7Ij5DbGljayB0byBkaXNtaXNzIOKAoiBBdXRvLWRpc21pc3MgaW4gOHM8L2Rpdj4nOwogIAogIG5vdGlmaWNhdGlvbi5pbm5lckhUTUwgPSBodG1sOwogIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobm90aWZpY2F0aW9uKTsKICAKICAvLyBBZGQgc2xpZGUtaW4gYW5pbWF0aW9uCiAgdmFyIHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTsKICBzdHlsZS50ZXh0Q29udGVudCA9ICdAa2V5ZnJhbWVzIHNsaWRlSW4geyBmcm9tIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDQwMHB4KTsgb3BhY2l0eTogMDsgfSB0byB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTsgb3BhY2l0eTogMTsgfSB9JzsKICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTsKICAKICAvLyBBdXRvLXJlbW92ZSBhZnRlciA4IHNlY29uZHMKICB2YXIgcmVtb3ZlVGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgewogICAgbm90aWZpY2F0aW9uLnN0eWxlLnRyYW5zaXRpb24gPSAnYWxsIDAuM3MgZWFzZSc7CiAgICBub3RpZmljYXRpb24uc3R5bGUudHJhbnNmb3JtID0gJ3RyYW5zbGF0ZVgoNDAwcHgpJzsKICAgIG5vdGlmaWNhdGlvbi5zdHlsZS5vcGFjaXR5ID0gJzAnOwogICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgbm90aWZpY2F0aW9uLnJlbW92ZSgpOyB9LCAzMDApOwogIH0sIDgwMDApOwogIAogIC8vIENsaWNrIHRvIGRpc21pc3MKICBub3RpZmljYXRpb24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbigpIHsKICAgIGNsZWFyVGltZW91dChyZW1vdmVUaW1lcik7CiAgICBub3RpZmljYXRpb24uc3R5bGUudHJhbnNpdGlvbiA9ICdhbGwgMC4zcyBlYXNlJzsKICAgIG5vdGlmaWNhdGlvbi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlWCg0MDBweCknOwogICAgbm90aWZpY2F0aW9uLnN0eWxlLm9wYWNpdHkgPSAnMCc7CiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBub3RpZmljYXRpb24ucmVtb3ZlKCk7IH0sIDMwMCk7CiAgfSk7Cn0KCi8vIEFkZCAiUmV0dXJuIHRvIFdvcmtmbG93IiBidXR0b24gaWYgd2UgaGF2ZSB3b3JrZmxvdyBJRApzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgewogIGlmICh3aW5kb3cuX3dvcmtmbG93SWQpIHsKICAgIHZhciB0b3BiYXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcudG9wYmFyLXJpZ2h0JykgfHwgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnRvcGJhcicpIHx8IGRvY3VtZW50LmJvZHk7CiAgICBpZiAodG9wYmFyKSB7CiAgICAgIHZhciBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTsKICAgICAgYnRuLmNsYXNzTmFtZSA9ICdidG4gYnRuLWdvbGQnOwogICAgICBidG4uaW5uZXJIVE1MID0gJ+KGkCBSZXR1cm4gdG8gV29ya2Zsb3cnOwogICAgICBidG4uc3R5bGUuY3NzVGV4dCA9ICdmb250LWZhbWlseTpJQk0gUGxleCBNb25vLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4wOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtwYWRkaW5nOjdweCAxM3B4O2JvcmRlci1yYWRpdXM6NXB4O2N1cnNvcjpwb2ludGVyO2JhY2tncm91bmQ6I2ZiYmYyNDtjb2xvcjojMDAwO2JvcmRlcjoxcHggc29saWQgI2ZiYmYyNDtmb250LXdlaWdodDo3MDA7JzsKICAgICAgYnRuLm9uY2xpY2sgPSBmdW5jdGlvbigpIHsKICAgICAgICAvLyBTYXZlIHJlc3VsdHMgYW5kIHJldHVybgogICAgICAgIHRyeSB7CiAgICAgICAgICB2YXIgcmVzdWx0cyA9IHsKICAgICAgICAgICAgd29ya2Zsb3dJZDogd2luZG93Ll93b3JrZmxvd0lkLAogICAgICAgICAgICBzY29yZTogd2luZG93Ll9hbmFseXNpc1Njb3JlIHx8IDAsCiAgICAgICAgICAgIHJlY29tbWVuZGF0aW9uczogd2luZG93Ll9hbmFseXNpc1JlY29tbWVuZGF0aW9ucyB8fCAnJywKICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkKICAgICAgICAgIH07CiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3NfYXVkaXRfcmVzdWx0cycsIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpKTsKICAgICAgICB9IGNhdGNoKGUpIHsKICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyByZXN1bHRzOicsIGUpOwogICAgICAgIH0KICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICdodHRwczovL2FwcC5jb250ZW50c2NhbGUuc2l0ZS9hdWRpdC13b3JrZmxvdz93Zj0nICsgd2luZG93Ll93b3JrZmxvd0lkICsgJyZkb25lPTEnOwogICAgICB9OwogICAgICAKICAgICAgaWYgKHRvcGJhci5maXJzdENoaWxkKSB7CiAgICAgICAgdG9wYmFyLmluc2VydEJlZm9yZShidG4sIHRvcGJhci5maXJzdENoaWxkKTsKICAgICAgfSBlbHNlIHsKICAgICAgICB0b3BiYXIuYXBwZW5kQ2hpbGQoYnRuKTsKICAgICAgfQogICAgfQogIH0KfSwgMTAwMCk7Cgpjb25zb2xlLmxvZygn4pyFIFNFTyBBdWRpdCBhdXRvLWxvYWRlciBpbml0aWFsaXplZCcpOwpjb25zb2xlLmxvZygnICAg8J+TiiBXaWxsIGF1dG8tbG9hZCBkYXRhIGZyb20gV29ya2Zsb3cnKTsKY29uc29sZS5sb2coJyAgIPCflIQgR1NDIGRhdGEgYXZhaWxhYmxlIGluIHdpbmRvdy5fd29ya2Zsb3dHc2NEYXRhJyk7CgoKdmFyIEFVRElUX1VSTCA9ICdodHRwczovL2FwcC5jb250ZW50c2NhbGUuc2l0ZS9zZW8tYXVkaXQnOwp2YXIgcGFnZXMgPSBbXTsKdmFyIHByb2plY3QgPSB7fTsKCi8vIHBvaW50czogdHJ1ZSA9IGFkZHMgQ29udGVudFNjb3JlIHBvaW50cywgZmFsc2UgPSBVWC9DVFIgb25seSAobm8gc2NvcmUgY2hhbmdlKQp2YXIgQ0wgPSBbCiAgLy8g4pSA4pSAIFBIQVNFIDE6IFByZS1hdWRpdCAoZ2VlbiBzY29yZSBpbXBhY3QpCiAge2lkOidzY2FuX2JlZm9yZScsIGxhYmVsOifikaAgU3RlcCAxIOKAlCBQcmUtc2NhbiBkb25lIChTY2FuIFNjb3JlIHJlY29yZGVkKScsICAgIGNhdDoncGhhc2UxJywgcG9pbnRzOmZhbHNlLCBwaGFzZToxLCB0aXA6J0ZJUlNUOiBDbGljayB0aGUg8J+TiiBTY2FuIFNjb3JlIGJ1dHRvbiBiZWxvdyDigJQgdGhpcyByZWNvcmRzIHlvdXIgc3RhcnRpbmcgc2NvcmUgYmVmb3JlIGFueSBjaGFuZ2VzJ30sCiAge2lkOidwdWxzZScsICAgICAgIGxhYmVsOifikaEgU3RlcCAyIOKAlCBQVUxTRStORVhVUyBhdWRpdCBkb25lJywgICAgICAgICAgICAgICAgICBjYXQ6J3BoYXNlMScsIHBvaW50czpmYWxzZSwgcGhhc2U6MSwgdGlwOidDbGljayDwn5SsIE9wZW4gaW4gUFVMU0UrTkVYVVMg4oaSIHJ1biB0aGUgZnVsbCBTRU8gYXVkaXQg4oaSIG5vdGUgYWxsIGZpbmRpbmdzIGJlZm9yZSBtYWtpbmcgY2hhbmdlcyd9LAogIHtpZDonZ3NjX2NoZWNrJywgICBsYWJlbDon4pGiIFN0ZXAgMyDigJQgR1NDIGRhdGEgcmVjb3JkZWQnLCAgICAgICAgICAgICAgICAgICAgICAgIGNhdDoncGhhc2UxJywgcG9pbnRzOmZhbHNlLCBwaGFzZToxLCB0aXA6J0ltcG9ydCB5b3VyIEdvb2dsZSBTZWFyY2ggQ29uc29sZSBDU1YgdmlhIHRoZSDwn5OKIEltcG9ydCBHU0MgQ1NWIGJ1dHRvbiBhdCB0aGUgdG9wIG9mIHRoZSBwYWdlJ30sCgogIC8vIOKUgOKUgCBQSEFTRSAyOiBJbXBsZW1lbnRhdGllIOKAlCBQVU5URU4gKHNjb3JlIGdhYXQgb21ob29nKQogIHtpZDond29yZGNvdW50JywgICBsYWJlbDon4pGhIFdvcmRzIGFkZGVkIChtaW4gMTUwMCknLCAgICAgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidzdGF0cycsICAgICAgIGxhYmVsOifikaEgU3RhdHMgYWRkZWQgKDIwMjUtMjAyNiwgOCspJywgICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonZXhwZXJ0JywgICAgICBsYWJlbDon4pGhIEV4cGVydCBxdW90ZXMgYWRkZWQgKDMtNSknLCAgICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2ZhcScsICAgICAgICAgbGFiZWw6J+KRoSBGQVEgc2VjdGlvbiBhZGRlZC9leHBhbmRlZCcsICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2Nhc2VzdHVkeScsICAgbGFiZWw6J+KRoSBDYXNlIHN0dWR5IHdpdGggbWV0cmljcyBhZGRlZCcsICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonZGlyZWN0X2FucycsICBsYWJlbDon4pGhIERpcmVjdCBBbnN3ZXIgKDQwLTgwdykgYWZ0ZXIgSDEgYWRkZWQnLCAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDondGxkcicsICAgICAgICBsYWJlbDon4pGhIEtleSBUYWtlYXdheXMgLyBUTDtEUiBhZGRlZCcsICAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2xpc3Rjb3VudCcsICAgbGFiZWw6J+KRoSBCdWxsZXQvbnVtYmVyZWQgbGlzdHMgZXhwYW5kZWQgKDE1KyknLGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J2F1dGhvcmJpbycsICAgbGFiZWw6J+KRoSBBdXRob3IgYmlvIHdpdGggY3JlZGVudGlhbHMgYWRkZWQnLCAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonc2NoZW1hX2EnLCAgICBsYWJlbDon4pGhIEFydGljbGUgc2NoZW1hIEpTT04tTEQgYWRkZWQnLCAgICAgICAgIGNhdDoncGhhc2UyJywgcG9pbnRzOnRydWUsICBwaGFzZToyfSwKICB7aWQ6J3NjaGVtYV9mJywgICAgbGFiZWw6J+KRoSBGQVFQYWdlIHNjaGVtYSBKU09OLUxEIGFkZGVkJywgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidpbnRsaW5rcycsICAgIGxhYmVsOifikaEgSW50ZXJuYWwgbGlua3MgYWRkZWQgKDMtNSknLCAgICAgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCiAge2lkOidleHRsaW5rcycsICAgIGxhYmVsOifikaEgRXh0ZXJuZSBsaW5rcyBhdXRvcml0YXRpZWYgKDItMyknLCAgICAgICAgICAgY2F0OidwaGFzZTInLCBwb2ludHM6dHJ1ZSwgIHBoYXNlOjJ9LAogIHtpZDonZWVhdCcsICAgICAgICBsYWJlbDon4pGhIEUtRS1BLVQgc2lnbmFscyBzdHJlbmd0aGVuZWQnLCAgICAgICAgICAgICAgICBjYXQ6J3BoYXNlMicsIHBvaW50czp0cnVlLCAgcGhhc2U6Mn0sCgogIC8vIOKUgOKUgCBQSEFTRSAyOiBVWC9DVFIgZml4ZXMg4oCUIE5PIHNjb3JlIHBvaW50cywgYnV0IGltcG9ydGFudAogIHtpZDonaDEnLCAgICAgICAgICBsYWJlbDon4pGhIEgxIG9wdGltaXNlZCcsICAgICAgICAgICAgICAgICAgICAgICAgY2F0OidwaGFzZTJfY3RyJywgcG9pbnRzOmZhbHNlLCBwaGFzZToyfSwKICB7aWQ6J2gyJywgICAgICAgICAgbGFiZWw6J+KRoSBIMiBzdHJ1Y3R1cmUgcmV2aXNlZCcsICAgICAgICAgICAgICAgICAgICAgIGNhdDoncGhhc2UyX2N0cicsIHBvaW50czpmYWxzZSwgcGhhc2U6Mn0sCiAge2lkOid0aXRsZScsICAgICAgIGxhYmVsOifikaEgU0VPIHRpdGxlIGhlcnNjaHJldmVuICg1MC02MCBjaGFycyknLCAgICAgICBjYXQ6J3BoYXNlMl9jdHInLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjJ9LAogIHtpZDonbWV0YScsICAgICAgICBsYWJlbDon4pGhIE1ldGEgZGVzY3JpcHRpb24gaGVyc2NocmV2ZW4gKDE1MC0xNjApJywgICAgY2F0OidwaGFzZTJfY3RyJywgcG9pbnRzOmZhbHNlLCBwaGFzZToyfSwKICB7aWQ6J2Nhbm9uaWNhbCcsICAgbGFiZWw6J+KRoSBDYW5vbmljYWwgdGFnIGNoZWNrZWQnLCAgICAgICAgICAgICAgIGNhdDoncGhhc2UyX2N0cicsIHBvaW50czpmYWxzZSwgcGhhc2U6Mn0sCiAge2lkOidhbHQnLCAgICAgICAgIGxhYmVsOifikaEgSW1hZ2UgYWx0IHRleHQgY29tcGxldGUnLCAgICAgICAgICAgICBjYXQ6J3BoYXNlMl9jdHInLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjJ9LAogIHtpZDonY3RhJywgICAgICAgICBsYWJlbDon4pGhIENUQSBvcHRpbWlzZWQgZm9yIGNvbnZlcnNpb24gZ29hbCcsICAgIGNhdDoncGhhc2UyX2N0cicsIHBvaW50czpmYWxzZSwgcGhhc2U6Mn0sCgogIC8vIOKUgOKUgCBQSEFTRSAzOiBMaXZlIHpldHRlbiArIG5hc2NhbgogIHtpZDoncHVibGlzaCcsICAgICBsYWJlbDon4pGiIFBhZ2UgcHVibGlzaGVkICsgdGltZXN0YW1wIHJlZnJlc2hlZCcsIGNhdDoncGhhc2UzJywgcG9pbnRzOmZhbHNlLCBwaGFzZTozfSwKICB7aWQ6J3JlaW5kZXgnLCAgICAgbGFiZWw6J+KRoiBHU0MgcmVpbmRleCByZXF1ZXN0ZWQnLCAgICAgICAgICAgICAgICAgICBjYXQ6J3BoYXNlMycsIHBvaW50czpmYWxzZSwgcGhhc2U6M30sCiAge2lkOidzY2FuX2FmdGVyJywgIGxhYmVsOifikaIgUG9zdC1zY2FuIGRvbmUgKGZpbmFsIHNjb3JlIHJlY29yZGVkKScsICAgICAgY2F0OidwaGFzZTMnLCBwb2ludHM6ZmFsc2UsIHBoYXNlOjN9LAogIHtpZDoncmVjaGVjaycsICAgICBsYWJlbDon4pGiIEdTQyByZWNoZWNrIHNjaGVkdWxlZCAoMTQgZGF5cyknLCAgICAgICAgICBjYXQ6J3BoYXNlMycsIHBvaW50czpmYWxzZSwgcGhhc2U6M30sCl07Cgp2YXIgU1RBVFVTX09SREVSID0gWydub3RzdGFydGVkJywnaW5wcm9ncmVzcycsJ2ZvbGxvd3VwJywnYmxvY2tlZCcsJ2RvbmUnXTsKdmFyIFNUQVRVU19MQUJFTFMgPSB7bm90c3RhcnRlZDonTm90IFN0YXJ0ZWQnLGlucHJvZ3Jlc3M6J0luIFByb2dyZXNzJyxkb25lOidEb25lJyxmb2xsb3d1cDonRm9sbG93LXVwJyxibG9ja2VkOidCbG9ja2VkJ307CnZhciBQUklfT1JERVIgPSB7aGlnaDowLG1lZDoxLGxvdzoyfTsKCmZ1bmN0aW9uIHVpZCgpeyByZXR1cm4gRGF0ZS5ub3coKS50b1N0cmluZygzNikrTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiw1KTsgfQoKZnVuY3Rpb24gdG9hc3QobXNnLGR1cil7CiAgdmFyIHQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvYXN0Jyk7CiAgdC50ZXh0Q29udGVudD1tc2c7dC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7CiAgc2V0VGltZW91dChmdW5jdGlvbigpe3QuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO30sZHVyfHwyNTAwKTsKfQoKZnVuY3Rpb24gc2F2ZSgpewogIHByb2plY3QuY2xpZW50ICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncENsaWVudCcpLnZhbHVlOwogIHByb2plY3Quc2l0ZSAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncFNpdGUnKS52YWx1ZTsKICBwcm9qZWN0LmRlYWRsaW5lID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BEZWFkbGluZScpLnZhbHVlOwogIHByb2plY3QuYXVkaXRvciAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncEF1ZGl0b3InKS52YWx1ZTsKICB0cnl7bG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NzX3dmX3Byb2onLEpTT04uc3RyaW5naWZ5KHByb2plY3QpKTt9Y2F0Y2goZSl7fQogIHRyeXtsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3Nfd2ZfcGFnZXMnLEpTT04uc3RyaW5naWZ5KHBhZ2VzKSk7fWNhdGNoKGUpe30KICAvLyBBbHdheXMgc3luYyBHU0MgZGF0YSBmb3IgUFVMU0UrTkVYVVMKICB0cnl7CiAgICB2YXIgX3NoYXJlZD17CiAgICAgIHBhZ2VzOnBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC51cmwmJnAudXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKTt9KQogICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24ocCl7cmV0dXJuIHtwYWdlOnAudXJsLGltcHJlc3Npb25zOnAuaW1wcmVzc2lvbnN8fDAsY2xpY2tzOjAsY3RyOnAuY3RyfHwwLHBvc2l0aW9uOnAucG9zaXRpb258fDAsc2NvcmU6cC5zY29yZUJlZm9yZXx8MH07fSksCiAgICAgIHF1ZXJpZXM6W10KICAgIH07CiAgICBpZih0eXBlb2YgX2dzY1F1ZXJ5TWFwIT09J3VuZGVmaW5lZCcpewogICAgICBfc2hhcmVkLnF1ZXJpZXM9T2JqZWN0LmtleXMoX2dzY1F1ZXJ5TWFwKS5tYXAoZnVuY3Rpb24ocSl7cmV0dXJuIHtxdWVyeTpxLHBvc2l0aW9uOl9nc2NRdWVyeU1hcFtxXX07fSk7CiAgICB9CiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3Nfc2hhcmVkX2dzYycsSlNPTi5zdHJpbmdpZnkoX3NoYXJlZCkpOwogIH1jYXRjaChlKXt9Cn0KCmZ1bmN0aW9uIGxvYWQoKXsKICB0cnl7dmFyIHA9bG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NzX3dmX3Byb2onKTtpZihwKXByb2plY3Q9SlNPTi5wYXJzZShwKTt9Y2F0Y2goZSl7fQogIHRyeXt2YXIgcGc9bG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NzX3dmX3BhZ2VzJyk7aWYocGcpcGFnZXM9SlNPTi5wYXJzZShwZyk7fWNhdGNoKGUpe30KICBpZihwcm9qZWN0LmNsaWVudCkgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQ2xpZW50JykudmFsdWU9cHJvamVjdC5jbGllbnQ7CiAgaWYocHJvamVjdC5zaXRlKSAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncFNpdGUnKS52YWx1ZT1wcm9qZWN0LnNpdGU7CiAgaWYocHJvamVjdC5kZWFkbGluZSlkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncERlYWRsaW5lJykudmFsdWU9cHJvamVjdC5kZWFkbGluZTsKICBpZihwcm9qZWN0LmF1ZGl0b3IpIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwQXVkaXRvcicpLnZhbHVlPXByb2plY3QuYXVkaXRvcjsKfQoKZnVuY3Rpb24gbWFrZVBhZ2UodXJsLGt3LHByaSxwb3MsaW1wcil7CiAgdmFyIGNoZWNrcz17fTsKICBDTC5mb3JFYWNoKGZ1bmN0aW9uKGMpe2NoZWNrc1tjLmlkXT1mYWxzZTt9KTsKICByZXR1cm4ge2lkOnVpZCgpLHVybDp1cmwsa2V5d29yZDprd3x8JycscHJpb3JpdHk6cHJpfHwnbWVkJywKICAgIHBvc2l0aW9uOnBhcnNlRmxvYXQocG9zKXx8MCxpbXByZXNzaW9uczpwYXJzZUludChpbXByKXx8MCwKICAgIHN0YXR1czonbm90c3RhcnRlZCcsc2NvcmVCZWZvcmU6Jycsc2NvcmVBZnRlcjonJyxub3RlczonJyxkZWFkbGluZTonJywKICAgIGNoZWNrczpjaGVja3MsY3JlYXRlZDpuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksdXBkYXRlZDpuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9Owp9CgpmdW5jdGlvbiB1cGRhdGVCdWxrQ291bnQoKXsKICB2YXIgY2hlY2tlZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wYWdlLWJ1bGstY2I6Y2hlY2tlZCcpOwogIHZhciBiYXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVsa0JhcicpOwogIGlmICghYmFyKSByZXR1cm47CiAgaWYoY2hlY2tlZC5sZW5ndGggPiAwKXsKICAgIGJhci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1bGtDb3VudCcpLnRleHRDb250ZW50ID0gY2hlY2tlZC5sZW5ndGggKyAnIHNlbGVjdGVkJzsKICB9IGVsc2UgewogICAgYmFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7CiAgfQp9CgpmdW5jdGlvbiBzZWxlY3RBbGxQYWdlcygpewogIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wYWdlLWJ1bGstY2InKS5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsgY2IuY2hlY2tlZCA9IHRydWU7IH0pOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwp9CgpmdW5jdGlvbiBkZXNlbGVjdEFsbFBhZ2VzKCl7CiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYicpLmZvckVhY2goZnVuY3Rpb24oY2IpeyBjYi5jaGVja2VkID0gZmFsc2U7IH0pOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwp9CgpmdW5jdGlvbiBkZWxldGVTZWxlY3RlZFBhZ2VzKCl7CiAgdmFyIGlkcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYjpjaGVja2VkJykpLm1hcChmdW5jdGlvbihjYil7IHJldHVybiBjYi5kYXRhc2V0LmlkOyB9KTsKICBpZighaWRzLmxlbmd0aCl7IHRvYXN0KCdObyBwYWdlcyBzZWxlY3RlZCcpOyByZXR1cm47IH0KICBpZighY29uZmlybSgnRGVsZXRlICcgKyBpZHMubGVuZ3RoICsgJyBzZWxlY3RlZCBwYWdlcz8nKSkgcmV0dXJuOwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApeyByZXR1cm4gIWlkcy5pbmNsdWRlcyhwLmlkKTsgfSk7CiAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWxrQmFyJykuc3R5bGUuZGlzcGxheSA9ICdub25lJzsKICB0b2FzdCgn8J+XkSAnICsgaWRzLmxlbmd0aCArICcgcGFnZXMgZGVsZXRlZCcpOwp9CgoKCmZ1bmN0aW9uIGJ1bGtTZWxlY3RBbGwoKXsKICB2YXIgY2JzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnBhZ2UtYnVsay1jYicpOwogIHZhciBhbGxDaGVja2VkID0gQXJyYXkuZnJvbShjYnMpLmV2ZXJ5KGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmNoZWNrZWQ7IH0pOwogIGNicy5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsgY2IuY2hlY2tlZCA9ICFhbGxDaGVja2VkOyB9KTsKICB1cGRhdGVCdWxrQ291bnQoKTsKfQoKZnVuY3Rpb24gYnVsa0RlbGV0ZVNlbGVjdGVkKCl7CiAgdmFyIHNlbGVjdGVkID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucGFnZS1idWxrLWNiOmNoZWNrZWQnKSkubWFwKGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmRhdGFzZXQuaWQ7IH0pOwogIGlmKCFzZWxlY3RlZC5sZW5ndGgpeyB0b2FzdCgn4pqgIE5vIHBhZ2VzIHNlbGVjdGVkJyk7IHJldHVybjsgfQogIGlmKCFjb25maXJtKCdEZWxldGUgJyArIHNlbGVjdGVkLmxlbmd0aCArICcgc2VsZWN0ZWQgcGFnZXMgZnJvbSB0aGUgcXVldWU/JykpIHJldHVybjsKICBwYWdlcyA9IHBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXsgcmV0dXJuICFzZWxlY3RlZC5pbmNsdWRlcyhwLmlkKTsgfSk7CiAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIHVwZGF0ZUJ1bGtDb3VudCgpOwogIHRvYXN0KCfwn5eRICcgKyBzZWxlY3RlZC5sZW5ndGggKyAnIHBhZ2VzIGRlbGV0ZWQnKTsKfQoKZnVuY3Rpb24gY2xlYW5CYWRQYWdlcygpewogIHZhciBiZWZvcmUgPSBwYWdlcy5sZW5ndGg7CiAgLy8gUmVtb3ZlIGludmFsaWQgVVJMcwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApewogICAgaWYoIXAudXJsKSByZXR1cm4gZmFsc2U7CiAgICBpZighcC51cmwuc3RhcnRzV2l0aCgnaHR0cCcpICYmICFwLnVybC5zdGFydHNXaXRoKCcvJykpIHJldHVybiBmYWxzZTsKICAgIGlmKHAudXJsLmluY2x1ZGVzKCctc2l0ZTonKSB8fCBwLnVybC5pbmNsdWRlcygnICcpKSByZXR1cm4gZmFsc2U7CiAgICByZXR1cm4gdHJ1ZTsKICB9KTsKICAvLyBSZW1vdmUgZHVwbGljYXRlcyDigJQga2VlcCBmaXJzdCBvY2N1cnJlbmNlIHBlciBVUkwKICB2YXIgc2VlbiA9IHt9OwogIHBhZ2VzID0gcGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApewogICAgaWYoc2VlbltwLnVybF0pIHJldHVybiBmYWxzZTsKICAgIHNlZW5bcC51cmxdID0gdHJ1ZTsKICAgIHJldHVybiB0cnVlOwogIH0pOwogIHZhciByZW1vdmVkID0gYmVmb3JlIC0gcGFnZXMubGVuZ3RoOwogIGlmKHJlbW92ZWQgPiAwKXsKICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgIHRvYXN0KCfwn6e5IFJlbW92ZWQgJyArIHJlbW92ZWQgKyAnIGludmFsaWQvZHVwbGljYXRlIGVudHJpZXMnKTsKICB9IGVsc2UgewogICAgdG9hc3QoJ+KckyBObyBpbnZhbGlkIG9yIGR1cGxpY2F0ZSBlbnRyaWVzIGZvdW5kJyk7CiAgfQp9CgpmdW5jdGlvbiBhZGRQYWdlKCl7CiAgdmFyIHVybD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3VXJsJykudmFsdWUudHJpbSgpOwogIGlmKCF1cmwpe3RvYXN0KCfimqAgRW50ZXIgYSBVUkwnKTtyZXR1cm47fQogIGlmKCF1cmwuc3RhcnRzV2l0aCgnaHR0cCcpKXVybD0naHR0cHM6Ly8nK3VybDsKICBwYWdlcy5wdXNoKG1ha2VQYWdlKHVybCwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdLdycpLnZhbHVlLnRyaW0oKSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdQcmknKS52YWx1ZSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdQb3MnKS52YWx1ZSwKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdJbXByJykudmFsdWUpKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3VXJsJykudmFsdWU9Jyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ld0t3JykudmFsdWU9Jyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ld1BvcycpLnZhbHVlPScnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXdJbXByJykudmFsdWU9Jyc7CiAgc2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTt0b2FzdCgn4pyFIFBhZ2UgYWRkZWQnKTsKfQoKZnVuY3Rpb24gYnVsa0FkZCgpewogIHZhciByYXc9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1bGtBcmVhJykudmFsdWUudHJpbSgpOwogIGlmKCFyYXcpe3RvYXN0KCfimqAgUGFzdGUgVVJMcyBmaXJzdCcpO3JldHVybjt9CiAgdmFyIGxpbmVzPXJhdy5zcGxpdCgnXG4nKS5tYXAoZnVuY3Rpb24obCl7cmV0dXJuIGwudHJpbSgpO30pLmZpbHRlcihmdW5jdGlvbihsKXtyZXR1cm4gbC5pbmNsdWRlcygnLicpO30pOwogIHZhciBhZGRlZD0wOwogIGxpbmVzLmZvckVhY2goZnVuY3Rpb24obCl7CiAgICB2YXIgdXJsPWwuc3RhcnRzV2l0aCgnaHR0cCcpP2w6J2h0dHBzOi8vJytsOwogICAgcGFnZXMucHVzaChtYWtlUGFnZSh1cmwsJycsJ21lZCcsMCwwKSk7YWRkZWQrKzsKICB9KTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVsa0FyZWEnKS52YWx1ZT0nJzsKICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpO3RvYXN0KCfinIUgJythZGRlZCsnIHBhZ2VzIGFkZGVkJyk7Cn0KCmZ1bmN0aW9uIGRlbGV0ZVBhZ2UoaWQpewogIGlmKCFjb25maXJtKCdEZWxldGUgdGhpcyBwYWdlPycpKXJldHVybjsKICBwYWdlcz1wYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7cmV0dXJuIHAuaWQhPT1pZDt9KTsKICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpO3RvYXN0KCdEZWxldGVkJyk7Cn0KCmZ1bmN0aW9uIGNsZWFyQWxsKCl7CiAgaWYoIWNvbmZpcm0oJ0NsZWFyIEFMTCBwYWdlcz8gQ2Fubm90IGJlIHVuZG9uZS4nKSlyZXR1cm47CiAgcGFnZXM9W107c2F2ZSgpO3JlbmRlclBhZ2VzKCk7cmVuZGVyT3ZlcnZpZXcoKTsKfQoKZnVuY3Rpb24gY3ljbGVTdGF0dXMoaWQpewogIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7cmV0dXJuIHAuaWQ9PT1pZDt9KTtpZighcClyZXR1cm47CiAgdmFyIGk9U1RBVFVTX09SREVSLmluZGV4T2YocC5zdGF0dXMpOwogIHAuc3RhdHVzPVNUQVRVU19PUkRFUlsoaSsxKSVTVEFUVVNfT1JERVIubGVuZ3RoXTsKICBwLnVwZGF0ZWQ9bmV3IERhdGUoKS50b0lTT1N0cmluZygpOwogIHNhdmUoKTtyZW5kZXJQYWdlcygpO3JlbmRlck92ZXJ2aWV3KCk7Cn0KCmZ1bmN0aW9uIHVwZGF0ZUZpZWxkKGlkLGZpZWxkLHZhbCl7CiAgdmFyIHA9cGFnZXMuZmluZChmdW5jdGlvbihwKXtyZXR1cm4gcC5pZD09PWlkO30pO2lmKCFwKXJldHVybjsKICBwW2ZpZWxkXT12YWw7cC51cGRhdGVkPW5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtzYXZlKCk7CiAgaWYoZmllbGQ9PT0nc3RhdHVzJyl7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpO30KfQoKZnVuY3Rpb24gdG9nZ2xlQ2hlY2socGFnZUlkLGNoZWNrSWQpewogIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7cmV0dXJuIHAuaWQ9PT1wYWdlSWQ7fSk7aWYoIXApcmV0dXJuOwogIHAuY2hlY2tzW2NoZWNrSWRdPSFwLmNoZWNrc1tjaGVja0lkXTsKICBwLnVwZGF0ZWQ9bmV3IERhdGUoKS50b0lTT1N0cmluZygpOwogIHNhdmUoKTsKICAvLyBVcGRhdGUgY2hlY2tsaXN0IHByb2dyZXNzIGRpc3BsYXkKICB2YXIgZG9uZT1PYmplY3QudmFsdWVzKHAuY2hlY2tzKS5maWx0ZXIoQm9vbGVhbikubGVuZ3RoOwogIHZhciB0b3RhbD1DTC5sZW5ndGg7CiAgdmFyIHBjdD1NYXRoLnJvdW5kKGRvbmUvdG90YWwqMTAwKTsKICB2YXIgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsLXByb2ctJytwYWdlSWQpOwogIGlmKGVsKXsKICAgIHZhciBwdHM9cG9pbnRzRG9uZShwKTsKICAgIGVsLmlubmVySFRNTD0nPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWdyZWVuKSI+K3Njb3JlOiAnK3B0cysnLycrcG9pbnRzVG90YWwoKSsnPC9zcGFuPicKICAgICAgKycgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tbGVmdDo4cHg7Ij50b3RhYWw6ICcrZG9uZSsnLycrdG90YWwrJzwvc3Bhbj4nOwogIH0KICB2YXIgY2hrRWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Noay0nK3BhZ2VJZCk7CiAgaWYoY2hrRWwpY2hrRWwudGV4dENvbnRlbnQ9cGN0KyclJzsKICAvLyBVcGRhdGUgY2xhc3Mgb24gaXRlbQogIHZhciBpdGVtPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbGktJytwYWdlSWQrJy0nK2NoZWNrSWQpOwogIGlmKGl0ZW0paXRlbS5jbGFzc05hbWU9J2NsLWl0ZW0nKyhwLmNoZWNrc1tjaGVja0lkXT8nIGNoZWNrZWQnOicnKTsKICByZW5kZXJPdmVydmlldygpOwp9CgpmdW5jdGlvbiBvcGVuSW5BdWRpdChpZCl7CiAgdmFyIHA9cGFnZXMuZmluZChmdW5jdGlvbihwZyl7cmV0dXJuIHBnLmlkPT09aWQ7fSk7aWYoIXApcmV0dXJuOwogIHZhciBwYXJhbXM9Jz91cmw9JytlbmNvZGVVUklDb21wb25lbnQocC51cmwpCiAgICArKHAua2V5d29yZD8nJmt3PScrZW5jb2RlVVJJQ29tcG9uZW50KHAua2V5d29yZCk6JycpCiAgICArKHAucG9zaXRpb24/JyZwb3M9JytwLnBvc2l0aW9uOicnKQogICAgKyhwLmltcHJlc3Npb25zPycmaW1wcj0nK3AuaW1wcmVzc2lvbnM6JycpCiAgICArJyZ3Zj0nK2lkOyAvLyB3b3JrZmxvdyBJRCBmb3IgY2FsbGJhY2sKICB3aW5kb3cub3BlbihBVURJVF9VUkwrcGFyYW1zLCdfYmxhbmsnKTsKICAvLyBBdXRvLXNldCB0byBpbnByb2dyZXNzCiAgaWYocC5zdGF0dXM9PT0nbm90c3RhcnRlZCcpewogICAgcC5zdGF0dXM9J2lucHJvZ3Jlc3MnO3AudXBkYXRlZD1uZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CiAgICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpO3RvYXN0KCfwn5SsIE9wZW5lZCBpbiBQVUxTRStORVhVUyDigJQgc3RhdHVzIOKGkiBJbiBQcm9ncmVzcycpOwogIH0KfQoKZnVuY3Rpb24gbWFya0RvbmUoaWQpewogIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocGcpe3JldHVybiBwZy5pZD09PWlkO30pO2lmKCFwKXJldHVybjsKICBwLnN0YXR1cz0nZG9uZSc7cC51cGRhdGVkPW5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTsKICAvLyBBdXRvLWNoZWNrIHB1bHNlCiAgcC5jaGVja3NbJ3B1bHNlJ109dHJ1ZTsKICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpO3RvYXN0KCfinIUgTWFya2VkIGFzIERvbmUnKTsKfQoKZnVuY3Rpb24gY2hlY2tQcm9ncmVzcyhwKXsKICB2YXIgZG9uZT1PYmplY3QudmFsdWVzKHAuY2hlY2tzKS5maWx0ZXIoQm9vbGVhbikubGVuZ3RoOwogIHJldHVybiB7ZG9uZTpkb25lLHRvdGFsOkNMLmxlbmd0aCxwY3Q6TWF0aC5yb3VuZChkb25lL0NMLmxlbmd0aCoxMDApfTsKfQoKLy8gUmV0dXJucyB0cnVlIGlmIHRoZSAiYWZ0ZXIgc2NvcmUiIGZpZWxkIHNob3VsZCBiZSBsb2NrZWQKLy8gTG9ja2VkIHVudGlsIGF0IGxlYXN0IDMgcG9pbnRzLWdpdmluZyBpdGVtcyBhcmUgY2hlY2tlZApmdW5jdGlvbiBzY29yZUFmdGVyTG9ja2VkKHApewogIHZhciBwb2ludHNEb25lID0gQ0wuZmlsdGVyKGZ1bmN0aW9uKGMpeyByZXR1cm4gYy5wb2ludHMgJiYgcC5jaGVja3NbYy5pZF07IH0pLmxlbmd0aDsKICByZXR1cm4gcG9pbnRzRG9uZSA8IDM7Cn0KCi8vIENvdW50IHBvaW50cyBpdGVtcyBkb25lCmZ1bmN0aW9uIHBvaW50c0RvbmUocCl7CiAgcmV0dXJuIENMLmZpbHRlcihmdW5jdGlvbihjKXsgcmV0dXJuIGMucG9pbnRzICYmIHAuY2hlY2tzW2MuaWRdOyB9KS5sZW5ndGg7Cn0KZnVuY3Rpb24gcG9pbnRzVG90YWwoKXsKICByZXR1cm4gQ0wuZmlsdGVyKGZ1bmN0aW9uKGMpeyByZXR1cm4gYy5wb2ludHM7IH0pLmxlbmd0aDsKfQoKZnVuY3Rpb24gcmVuZGVyT3ZlcnZpZXcoKXsKICB2YXIgdG90YWw9cGFnZXMubGVuZ3RoOwogIHZhciBkb25lPXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0nZG9uZSc7fSkubGVuZ3RoOwogIHZhciBpbnA9cGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApe3JldHVybiBwLnN0YXR1cz09PSdpbnByb2dyZXNzJzt9KS5sZW5ndGg7CiAgdmFyIG5zPXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0nbm90c3RhcnRlZCc7fSkubGVuZ3RoOwogIHZhciBmdT1wYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7cmV0dXJuIHAuc3RhdHVzPT09J2ZvbGxvd3VwJzt9KS5sZW5ndGg7CiAgdmFyIHBjdD10b3RhbD9NYXRoLnJvdW5kKGRvbmUvdG90YWwqMTAwKTowOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdlRvdGFsJykudGV4dENvbnRlbnQ9dG90YWw7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292RG9uZScpLnRleHRDb250ZW50PWRvbmU7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292SW5Qcm9ncmVzcycpLnRleHRDb250ZW50PWlucDsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZOb3RTdGFydGVkJykudGV4dENvbnRlbnQ9bnM7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292Rm9sbG93dXAnKS50ZXh0Q29udGVudD1mdTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZQY3QnKS50ZXh0Q29udGVudD1wY3QrJyUnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdkJhcicpLnN0eWxlLndpZHRoPXBjdCsnJSc7Cn0KCmZ1bmN0aW9uIGdldFNvcnRlZCgpewogIHZhciBzb3J0PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmU29ydCcpLnZhbHVlOwogIHZhciBhcnI9cGFnZXMuc2xpY2UoKTsKICBpZihzb3J0PT09J3ByaW9yaXR5JylhcnIuc29ydChmdW5jdGlvbihhLGIpe3JldHVybiBQUklfT1JERVJbYS5wcmlvcml0eV0tUFJJX09SREVSW2IucHJpb3JpdHldO30pOwogIGVsc2UgaWYoc29ydD09PSdwb3NpdGlvbicpYXJyLnNvcnQoZnVuY3Rpb24oYSxiKXsKICAgIHZhciBhcD1hLnBvc2l0aW9ufHw5OTksYnA9Yi5wb3NpdGlvbnx8OTk5OwogICAgLy8gUG9zaXRpb24gMTEtMzAgPSBtb3N0IHZhbHVhYmxlIChjbG9zZXN0IHRvIHBhZ2UgMSkKICAgIHZhciBhcz1hcD49MTEmJmFwPD0zMD8wOmFwPjMwPzE6MjsKICAgIHZhciBicz1icD49MTEmJmJwPD0zMD8wOmJwPjMwPzE6MjsKICAgIHJldHVybiBhcy1ic3x8KGFwLWJwKTsKICB9KTsKICBlbHNlIGlmKHNvcnQ9PT0naW1wcmVzc2lvbnMnKWFyci5zb3J0KGZ1bmN0aW9uKGEsYil7cmV0dXJuIGIuaW1wcmVzc2lvbnMtYS5pbXByZXNzaW9uczt9KTsKICBlbHNlIGlmKHNvcnQ9PT0nY2hlY2tsaXN0JylhcnIuc29ydChmdW5jdGlvbihhLGIpe3JldHVybiBjaGVja1Byb2dyZXNzKGEpLnBjdC1jaGVja1Byb2dyZXNzKGIpLnBjdDt9KTsKICBlbHNlIGlmKHNvcnQ9PT0nc3RhdHVzJylhcnIuc29ydChmdW5jdGlvbihhLGIpe3JldHVybiBTVEFUVVNfT1JERVIuaW5kZXhPZihhLnN0YXR1cyktU1RBVFVTX09SREVSLmluZGV4T2YoYi5zdGF0dXMpO30pOwogIHJldHVybiBhcnI7Cn0KCmZ1bmN0aW9uIHJlbmRlclBhZ2VzKCl7CiAgdmFyIGZTdGF0dXM9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZTdGF0dXMnKS52YWx1ZTsKICB2YXIgZlByaT1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlByaScpLnZhbHVlOwogIHZhciBmU2VhcmNoPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmU2VhcmNoJykudmFsdWUudG9Mb3dlckNhc2UoKTsKICB2YXIgbGlzdD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGFnZXNMaXN0Jyk7CgogIHZhciBhcnI9Z2V0U29ydGVkKCkuZmlsdGVyKGZ1bmN0aW9uKHApewogICAgaWYoZlN0YXR1cyE9PSdhbGwnJiZwLnN0YXR1cyE9PWZTdGF0dXMpcmV0dXJuIGZhbHNlOwogICAgaWYoZlByaSE9PSdhbGwnJiZwLnByaW9yaXR5IT09ZlByaSlyZXR1cm4gZmFsc2U7CiAgICBpZihmU2VhcmNoJiYhcC51cmwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmU2VhcmNoKSYmIXAua2V5d29yZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZTZWFyY2gpKXJldHVybiBmYWxzZTsKICAgIHJldHVybiB0cnVlOwogIH0pOwoKICBpZighYXJyLmxlbmd0aCl7CiAgICBsaXN0LmlubmVySFRNTD0nPGRpdiBjbGFzcz0iZW1wdHkiPjxoMz4nKyhwYWdlcy5sZW5ndGg/J05vIHBhZ2VzIG1hdGNoIGZpbHRlcnMnOidObyBQYWdlcyBZZXQnKSsnPC9oMz48cD4nKyhwYWdlcy5sZW5ndGg/J0FkanVzdCBmaWx0ZXJzIGFib3ZlLic6J0FkZCBVUkxzIGFib3ZlIG9yIGltcG9ydCBhIENTVi4nKSsnPC9wPjwvZGl2Pic7CiAgICByZXR1cm47CiAgfQoKICBsaXN0LmlubmVySFRNTD1hcnIubWFwKGZ1bmN0aW9uKHAsaSl7CiAgICB2YXIgcHJvZz1jaGVja1Byb2dyZXNzKHApOwogICAgdmFyIHByaUNsYXNzPSdwcmktJytwLnByaW9yaXR5OwogICAgdmFyIHNob3J0VXJsPScnOwogICAgdHJ5e3Nob3J0VXJsPW5ldyBVUkwocC51cmwpLnBhdGhuYW1lfHwnLyc7fWNhdGNoKGUpe3Nob3J0VXJsPXAudXJsLnNsaWNlKDAsNTApO30KICAgIGlmKHNob3J0VXJsLmxlbmd0aD41NSlzaG9ydFVybD1zaG9ydFVybC5zbGljZSgwLDU1KSsn4oCmJzsKCiAgICAvLyBHcm91cGVkIGNoZWNrbGlzdCBieSBwaGFzZQogIGZ1bmN0aW9uIHJlbmRlckNsSXRlbXMoaXRlbXMpewogICAgcmV0dXJuIGl0ZW1zLm1hcChmdW5jdGlvbihjKXsKICAgICAgdmFyIGNoZWNrZWQgPSBwLmNoZWNrc1tjLmlkXTsKICAgICAgdmFyIGJhZGdlID0gKGMucGhhc2U9PT0yJiZjLnBvaW50cykKICAgICAgICA/ICc8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo3cHg7cGFkZGluZzoxcHggNXB4O2JvcmRlci1yYWRpdXM6M3B4O2JhY2tncm91bmQ6cmdiYSg3NCwyMjIsMTI4LC4xMik7Y29sb3I6dmFyKC0tZ3JlZW4pO2ZsZXgtc2hyaW5rOjA7Ij4rc2NvcmU8L3NwYW4+JwogICAgICAgIDogKGMucGhhc2U9PT0yJiYhYy5wb2ludHMpCiAgICAgICAgPyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6N3B4O3BhZGRpbmc6MXB4IDVweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMSk7Y29sb3I6dmFyKC0tYmx1ZSk7ZmxleC1zaHJpbms6MDsiPkNUUjwvc3Bhbj4nCiAgICAgICAgOiAnJzsKICAgICAgcmV0dXJuICc8ZGl2IGNsYXNzPSJjbC1pdGVtJysoY2hlY2tlZD8nIGNoZWNrZWQnOicnKSsnIiBpZD0iY2xpLScrcC5pZCsnLScrYy5pZCsnIiBvbmNsaWNrPSJ0b2dnbGVDaGVjayhcJycrcC5pZCsnXCcsXCcnK2MuaWQrJ1wnKSInKyhjLnRpcD8nIHRpdGxlPSInK2MudGlwKyciJzonJykrJz4nCiAgICAgICAgKyc8aW5wdXQgdHlwZT0iY2hlY2tib3giJysoY2hlY2tlZD8nIGNoZWNrZWQnOicnKSsnIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3RvZ2dsZUNoZWNrKFwnJytwLmlkKydcJyxcJycrYy5pZCsnXCcpIj4nCiAgICAgICAgKyc8bGFiZWw+JytjLmxhYmVsKyhjLnRpcD8nIDxzcGFuIHN0eWxlPSJmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLWRpbSk7Y3Vyc29yOmhlbHA7IiB0aXRsZT0iJytjLnRpcCsnIj7ik5g8L3NwYW4+JzonJykrJzwvbGFiZWw+JwogICAgICAgICtiYWRnZQogICAgICAgICsnPC9kaXY+JzsKICAgIH0pLmpvaW4oJycpOwogIH0KICB2YXIgZjEgPSBDTC5maWx0ZXIoZnVuY3Rpb24oYyl7cmV0dXJuIGMucGhhc2U9PT0xO30pOwogIHZhciBmMnAgPSBDTC5maWx0ZXIoZnVuY3Rpb24oYyl7cmV0dXJuIGMucGhhc2U9PT0yJiZjLnBvaW50czt9KTsKICB2YXIgZjJjID0gQ0wuZmlsdGVyKGZ1bmN0aW9uKGMpe3JldHVybiBjLnBoYXNlPT09MiYmIWMucG9pbnRzO30pOwogIHZhciBmMyA9IENMLmZpbHRlcihmdW5jdGlvbihjKXtyZXR1cm4gYy5waGFzZT09PTM7fSk7CiAgdmFyIHBoID0gZnVuY3Rpb24obGFiZWwsY29sb3IsYm9yZGVyKXsKICAgIHJldHVybiAnPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6Jytjb2xvcisnO3BhZGRpbmc6OHB4IDAgNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkICcrYm9yZGVyKyc7bWFyZ2luLWJvdHRvbTo0cHg7bWFyZ2luLXRvcDo2cHg7Ij4nK2xhYmVsKyc8L2Rpdj4nOwogIH07CiAgdmFyIGNsID0gcGgoJ+KRoCBQcmUtYXVkaXQnLCd2YXIoLS1ibHVlKScsJ3JnYmEoOTYsMTY1LDI1MCwuMiknKQogICAgKyAnPGRpdiBjbGFzcz0iY2wtZ3JpZCI+JytyZW5kZXJDbEl0ZW1zKGYxKSsnPC9kaXY+JwogICAgKyBwaCgn4pGhIEltcGxlbWVudGF0aW9uIOKAlCBpbXByb3ZlcyBDb250ZW50U2NvcmUnLCd2YXIoLS1ncmVlbiknLCdyZ2JhKDc0LDIyMiwxMjgsLjIpJykKICAgICsgJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLXN1Yik7cGFkZGluZzo0cHggMCA2cHg7Ij7inJMgQWRkIHJlYWwgY29udGVudCDihpIgc2NvcmUgZ29lcyB1cC4gTWV0YS90aXRsZSBvbmx5ID0gbm8gcG9pbnRzLjwvZGl2PicKICAgICsgJzxkaXYgY2xhc3M9ImNsLWdyaWQiPicrcmVuZGVyQ2xJdGVtcyhmMnApKyc8L2Rpdj4nCiAgICArIHBoKCfikaEgVVggJiBDVFIgZml4ZXMg4oCUIG5vIHNjb3JlIGltcGFjdCcsJ3ZhcigtLWJsdWUpJywncmdiYSg5NiwxNjUsMjUwLC4xNSknKQogICAgKyAnPGRpdiBjbGFzcz0iY2wtZ3JpZCI+JytyZW5kZXJDbEl0ZW1zKGYyYykrJzwvZGl2PicKICAgICsgcGgoJ+KRoiBHbyBsaXZlICsgcmUtc2NhbicsJ3ZhcigtLWdvbGQpJywncmdiYSgyNTEsMTkxLDM2LC4yKScpCiAgICArICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtjb2xvcjp2YXIoLS1zdWIpO3BhZGRpbmc6NHB4IDAgNnB4OyI+4pqgIFJlLXNjYW4gb25seSBBRlRFUiB0aGUgcGFnZSBpcyBsaXZlIGFuZCBwb2ludCBpdGVtcyBhcmUgY29tcGxldGVkLjwvZGl2PicKICAgICsgJzxkaXYgY2xhc3M9ImNsLWdyaWQiPicrcmVuZGVyQ2xJdGVtcyhmMykrJzwvZGl2Pic7CgogICAgcmV0dXJuICc8ZGl2IGNsYXNzPSJwYWdlLWNhcmQgcy0nK3Auc3RhdHVzKyciIGlkPSJjYXJkLScrcC5pZCsnIj4nCgogICAgICAvLyBIZWFkZXIKICAgICAgKyc8ZGl2IGNsYXNzPSJjYXJkLWhlYWQiIHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ij4nCiAgICAgICsnPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0icGFnZS1idWxrLWNiIiBkYXRhLWlkPSInK3AuaWQrJyIgb25jbGljaz0iZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7dXBkYXRlQnVsa0NvdW50KCkiIHN0eWxlPSJ3aWR0aDoxNHB4O2hlaWdodDoxNHB4O2FjY2VudC1jb2xvcjp2YXIoLS1yZWQpO2ZsZXgtc2hyaW5rOjA7Y3Vyc29yOnBvaW50ZXI7Ij4nCiAgICAgICsnPGRpdiBzdHlsZT0iZmxleDoxO2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDsiIG9uY2xpY2s9InRvZ2dsZUNhcmQoXCcnK3AuaWQrJ1wnKSI+JwogICAgICArJzxzcGFuIGNsYXNzPSJjYXJkLXJhbmsiPiMnKyhpKzEpKyc8L3NwYW4+JwogICAgICArJzxzcGFuIGNsYXNzPSJwcmktZG90ICcrcHJpQ2xhc3MrJyI+PC9zcGFuPicKICAgICAgKyc8c3BhbiBjbGFzcz0iY2FyZC11cmwiPicrc2hvcnRVcmwrJzxzcGFuIGNsYXNzPSJjYXJkLWt3Ij4nKyggcC5rZXl3b3JkPycg4oCUICcrcC5rZXl3b3JkOicnKSsnPC9zcGFuPjwvc3Bhbj4nCiAgICAgICsocC5wb3NpdGlvbj8nPHNwYW4gY2xhc3M9ImNhcmQtZ3NjIj5wb3MgJytNYXRoLnJvdW5kKHAucG9zaXRpb24pKyhwLmltcHJlc3Npb25zPycgwrcgJytwLmltcHJlc3Npb25zLnRvTG9jYWxlU3RyaW5nKCkrJyBpbXByJzonJykrJzwvc3Bhbj4nOicnKQogICAgICArKHAuc2NvcmVCZWZvcmU/JzxzcGFuIHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOicrKHAuc2NvcmVCZWZvcmU8NzA/J3ZhcigtLXJlZCknOnAuc2NvcmVCZWZvcmU8ODU/J3ZhcigtLWdvbGQpJzondmFyKC0tZ3JlZW4pJykrJzsiPicrcC5zY29yZUJlZm9yZSsnLzEwMDwvc3Bhbj4nOicnKQogICAgICArJzxzcGFuIGNsYXNzPSJjYXJkLWNoayIgaWQ9ImNoay0nK3AuaWQrJyI+Jytwcm9nLnBjdCsnJTwvc3Bhbj4nCiAgICAgICsnPGJ1dHRvbiBjbGFzcz0ic3RhdHVzLWJ0biIgb25jbGljaz0iZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7Y3ljbGVTdGF0dXMoXCcnK3AuaWQrJ1wnKSI+JytTVEFUVVNfTEFCRUxTW3Auc3RhdHVzXSsnPC9idXR0b24+JwogICAgICArJzxzcGFuIGNsYXNzPSJjaGV2cm9uIiBpZD0iY2hldi0nK3AuaWQrJyI+4pa+PC9zcGFuPicKICAgICAgKyc8L2Rpdj4nICAvLyBjbG9zZSBpbm5lciBjbGlja2FibGUgZGl2CiAgICAgICsnPC9kaXY+JwoKICAgICAgLy8gQm9keQogICAgICArJzxkaXYgY2xhc3M9ImNhcmQtYm9keSIgaWQ9ImJvZHktJytwLmlkKyciPicKCiAgICAgIC8vIEZpZWxkcwogICAgICArJzxkaXYgY2xhc3M9ImNiLWdyaWQiPicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPlN0YXR1czwvbGFiZWw+PHNlbGVjdCBvbmNoYW5nZT0idXBkYXRlRmllbGQoXCcnK3AuaWQrJ1wnLFwnc3RhdHVzXCcsdGhpcy52YWx1ZSkiPicKICAgICAgK1snbm90c3RhcnRlZCcsJ2lucHJvZ3Jlc3MnLCdkb25lJywnZm9sbG93dXAnLCdibG9ja2VkJ10ubWFwKGZ1bmN0aW9uKHMpe3JldHVybiAnPG9wdGlvbiB2YWx1ZT0iJytzKyciJysocC5zdGF0dXM9PT1zPycgc2VsZWN0ZWQnOicnKSsnPicrU1RBVFVTX0xBQkVMU1tzXSsnPC9vcHRpb24+Jzt9KS5qb2luKCcnKQogICAgICArJzwvc2VsZWN0PjwvZGl2PicKICAgICAgKyc8ZGl2IGNsYXNzPSJjYi1maWVsZCI+PGxhYmVsPlByaW9yaXR5PC9sYWJlbD48c2VsZWN0IG9uY2hhbmdlPSJ1cGRhdGVGaWVsZChcJycrcC5pZCsnXCcsXCdwcmlvcml0eVwnLHRoaXMudmFsdWUpIj4nCiAgICAgICtbWydoaWdoJywn8J+UtCBIaWdoJ10sWydtZWQnLCfwn5+hIE1lZGl1bSddLFsnbG93Jywn8J+foiBMb3cnXV0ubWFwKGZ1bmN0aW9uKHgpe3JldHVybiAnPG9wdGlvbiB2YWx1ZT0iJyt4WzBdKyciJysocC5wcmlvcml0eT09PXhbMF0/JyBzZWxlY3RlZCc6JycpKyc+Jyt4WzFdKyc8L29wdGlvbj4nO30pLmpvaW4oJycpCiAgICAgICsnPC9zZWxlY3Q+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIj4nCiAgICAgICsnPGxhYmVsIHN0eWxlPSJjb2xvcjp2YXIoLS1ibHVlKSI+4pGgIFByZS1zY2FuIFNjb3JlIChCRUZPUkUgYXVkaXQpPC9sYWJlbD4nCiAgICAgICsnPGlucHV0IHR5cGU9Im51bWJlciIgbWluPSIwIiBtYXg9IjEwMCIgdmFsdWU9IicrcC5zY29yZUJlZm9yZSsnIiBwbGFjZWhvbGRlcj0iU2NhbiBmaXJzdCwgZW50ZXIgaGVyZSIgZGF0YS1zY29yZS1iZWZvcmU9IicrcC5pZCsnIiBvbmNoYW5nZT0idXBkYXRlRmllbGQoXCcnK3AuaWQrJ1wnLFwnc2NvcmVCZWZvcmVcJyx0aGlzLnZhbHVlKSI+JwogICAgICArJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLXN1Yik7bWFyZ2luLXRvcDo0cHg7Ij5TY2FuIHZpYSDwn5OKIFNjYW4gU2NvcmUgYnV0dG9uIOKAlCBkbyB0aGlzIEJFRk9SRSB0aGUgYXVkaXQ8L2Rpdj4nCiAgICAgICsnPC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIj4nCiAgICAgICsnPGxhYmVsIHN0eWxlPSJjb2xvcjonKyhzY29yZUFmdGVyTG9ja2VkKHApPyd2YXIoLS1kaW0pJzondmFyKC0tZ3JlZW4pJykrJyI+4pGiIFBvc3Qtc2NhbiBTY29yZSAoQUZURVIgaW1wbGVtZW50YXRpb24pPC9sYWJlbD4nCiAgICAgICsnPGlucHV0IHR5cGU9Im51bWJlciIgbWluPSIwIiBtYXg9IjEwMCIgdmFsdWU9IicrcC5zY29yZUFmdGVyKyciIHBsYWNlaG9sZGVyPSInKyhzY29yZUFmdGVyTG9ja2VkKHApPydDb21wbGV0ZSBwb2ludCBpdGVtcyBmaXJzdCc6J1NjYW4gYWZ0ZXIgcGFnZSBpcyBsaXZlJykrJyIgJysoc2NvcmVBZnRlckxvY2tlZChwKT8nZGlzYWJsZWQgc3R5bGU9Im9wYWNpdHk6LjQ7Y3Vyc29yOm5vdC1hbGxvd2VkIic6JycpKycgb25jaGFuZ2U9InVwZGF0ZUZpZWxkKFwnJytwLmlkKydcJyxcJ3Njb3JlQWZ0ZXJcJyx0aGlzLnZhbHVlKSI+JwogICAgICArJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOicrKHNjb3JlQWZ0ZXJMb2NrZWQocCk/J3ZhcigtLXJlZCknOid2YXIoLS1zdWIpJykrJzttYXJnaW4tdG9wOjRweDsiPicrKHNjb3JlQWZ0ZXJMb2NrZWQocCk/J+KaoCBDb21wbGV0ZSBwb2ludCBpdGVtcyAo4pGhKSBmaXJzdCDigJQgbWV0YS90aXRsZSBhbG9uZSBkb2VzIG5vdCBjaGFuZ2UgdGhlIHNjb3JlJzon4pyTIFJlLXNjYW4gQUZURVIgeW91IGhhdmUgcHVibGlzaGVkIHRoZSBwYWdlJykrJzwvZGl2PicKICAgICAgKyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiPjxsYWJlbD5HU0MgUG9zaXRpb248L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIHZhbHVlPSInK3AucG9zaXRpb24rJyIgcGxhY2Vob2xkZXI9IjM0IiBvbmNoYW5nZT0idXBkYXRlRmllbGQoXCcnK3AuaWQrJ1wnLFwncG9zaXRpb25cJyx0aGlzLnZhbHVlKSI+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIj48bGFiZWw+SW1wcmVzc2lvbnM8L2xhYmVsPjxpbnB1dCB0eXBlPSJudW1iZXIiIHZhbHVlPSInK3AuaW1wcmVzc2lvbnMrJyIgcGxhY2Vob2xkZXI9IjEyNDAwIiBvbmNoYW5nZT0idXBkYXRlRmllbGQoXCcnK3AuaWQrJ1wnLFwnaW1wcmVzc2lvbnNcJyx0aGlzLnZhbHVlKSI+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNiLWZpZWxkIj48bGFiZWw+RGVhZGxpbmU8L2xhYmVsPjxpbnB1dCB0eXBlPSJkYXRlIiB2YWx1ZT0iJytwLmRlYWRsaW5lKyciIG9uY2hhbmdlPSJ1cGRhdGVGaWVsZChcJycrcC5pZCsnXCcsXCdkZWFkbGluZVwnLHRoaXMudmFsdWUpIj48L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiPjxsYWJlbD5QcmltYXJ5IEtleXdvcmQ8L2xhYmVsPjxpbnB1dCB0eXBlPSJ0ZXh0IiB2YWx1ZT0iJytwLmtleXdvcmQrJyIgb25jaGFuZ2U9InVwZGF0ZUZpZWxkKFwnJytwLmlkKydcJyxcJ2tleXdvcmRcJyx0aGlzLnZhbHVlKSI+PC9kaXY+JwogICAgICArJzwvZGl2PicKCiAgICAgIC8vIE5vdGVzCiAgICAgICsnPGRpdiBjbGFzcz0iY2ItZmllbGQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEycHg7Ij48bGFiZWw+Tm90ZXMgLyBOZXh0IFN0ZXBzPC9sYWJlbD48dGV4dGFyZWEgb25jaGFuZ2U9InVwZGF0ZUZpZWxkKFwnJytwLmlkKydcJyxcJ25vdGVzXCcsdGhpcy52YWx1ZSkiPicrcC5ub3RlcysnPC90ZXh0YXJlYT48L2Rpdj4nCgogICAgICAvLyBDaGVja2xpc3QKICAgICAgKyc8ZGl2IGNsYXNzPSJjbC1oZWFkZXIiPjxzcGFuPkF1ZGl0IENoZWNrbGlzdCDigJQgMyBwaGFzZXM8L3NwYW4+JwogICAgICArJzxzcGFuIGlkPSJjbC1wcm9nLScrcC5pZCsnIiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7ZGlzcGxheTpmbGV4O2dhcDoxMHB4OyI+JwogICAgICArJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPitwdHM6ICcrcG9pbnRzRG9uZShwKSsnLycrcG9pbnRzVG90YWwoKSsnPC9zcGFuPicKICAgICAgKyc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbXV0ZWQpIj50b3RhYWw6ICcrcHJvZy5kb25lKycvJytwcm9nLnRvdGFsKyc8L3NwYW4+JwogICAgICArJzwvc3Bhbj4nCiAgICAgICsnPC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9ImNsLWdyaWQiPicrY2wrJzwvZGl2PicKCiAgICAgIC8vIEFjdGlvbnMKICAgICAgKyc8ZGl2IGNsYXNzPSJjYXJkLWFjdGlvbnMiPicKICAgICAgKyc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXB1cnBsZSBidG4tc20iIG9uY2xpY2s9Im9wZW5JbkF1ZGl0KFwnJytwLmlkKydcJykiPvCflKwgT3BlbiBpbiBQVUxTRStORVhVUzwvYnV0dG9uPicKICAgICAgKyc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdyZWVuIGJ0bi1zbSIgb25jbGljaz0ibWFya0RvbmUoXCcnK3AuaWQrJ1wnKSI+4pyTIE1hcmsgRG9uZTwvYnV0dG9uPicKICAgICAgKyc8YSBocmVmPSInK3AudXJsKyciIHRhcmdldD0iX2JsYW5rIiBjbGFzcz0iYnRuIGJ0bi1ibHVlIGJ0bi1zbSI+4oaXIE9wZW4gUGFnZTwvYT4nCiAgICAgICsnPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1tdXRlZCBidG4tc20iIG9uY2xpY2s9InNjYW5PbmVQYWdlKFwnJytwLmlkKydcJykiPvCfk4ogU2NhbiBTY29yZTwvYnV0dG9uPicKICAgICAgKyc8YSBocmVmPSJodHRwczovL2FwcC5jb250ZW50c2NhbGUuc2l0ZS8/dXJsPScrZW5jb2RlVVJJQ29tcG9uZW50KHAudXJsKSsnIiB0YXJnZXQ9Il9ibGFuayIgY2xhc3M9ImJ0biBidG4tYmx1ZSBidG4tc20iPuKGlyBDb250ZW50U2NhbGU8L2E+JwogICAgICArJzxidXR0b24gY2xhc3M9ImJ0biBidG4tcmVkIGJ0bi1zbSIgb25jbGljaz0iZGVsZXRlUGFnZShcJycrcC5pZCsnXCcpIj7inJUgRGVsZXRlPC9idXR0b24+JwogICAgICArJzwvZGl2PicKCiAgICAgICsnPC9kaXY+PC9kaXY+JzsKICB9KS5qb2luKCcnKTsKfQoKZnVuY3Rpb24gdG9nZ2xlQ2FyZChpZCl7CiAgdmFyIGJvZHk9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JvZHktJytpZCk7CiAgdmFyIGNoZXY9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NoZXYtJytpZCk7CiAgaWYoIWJvZHkpcmV0dXJuOwogIHZhciBvcGVuPWJvZHkuY2xhc3NMaXN0LnRvZ2dsZSgnb3BlbicpOwogIGlmKGNoZXYpY2hldi5jbGFzc0xpc3QudG9nZ2xlKCdvcGVuJyxvcGVuKTsKfQoKLy8g4pSA4pSAIEV4cG9ydCBDU1Yg4pSA4pSACmZ1bmN0aW9uIGV4cG9ydENTVigpewogIGlmKCFwYWdlcy5sZW5ndGgpe3RvYXN0KCfimqAgTm8gcGFnZXMgdG8gZXhwb3J0Jyk7cmV0dXJuO30KICB2YXIgaGVhZGVycz1bJ1VSTCcsJ0tleXdvcmQnLCdQcmlvcml0eScsJ1N0YXR1cycsJ1Bvc2l0aW9uJywnSW1wcmVzc2lvbnMnLCdTY29yZUJlZm9yZScsJ1Njb3JlQWZ0ZXInLCdEZWFkbGluZScsJ05vdGVzJywnQ2hlY2tsaXN0UGN0JywnVXBkYXRlZCddOwogIENMLmZvckVhY2goZnVuY3Rpb24oYyl7aGVhZGVycy5wdXNoKCdjaGtfJytjLmlkKTt9KTsKICB2YXIgcm93cz1baGVhZGVycy5qb2luKCcsJyldOwogIHBhZ2VzLmZvckVhY2goZnVuY3Rpb24ocCl7CiAgICB2YXIgcHJvZz1jaGVja1Byb2dyZXNzKHApOwogICAgdmFyIGJhc2U9WwogICAgICAnIicrcC51cmwrJyInLCciJysocC5rZXl3b3JkfHwnJykrJyInLHAucHJpb3JpdHkscC5zdGF0dXMsCiAgICAgIHAucG9zaXRpb258fCcnLHAuaW1wcmVzc2lvbnN8fCcnLHAuc2NvcmVCZWZvcmV8fCcnLHAuc2NvcmVBZnRlcnx8JycsCiAgICAgIHAuZGVhZGxpbmV8fCcnLCciJysocC5ub3Rlc3x8JycpLnJlcGxhY2UoLyIvZywiJyciKSsnIicsCiAgICAgIHByb2cucGN0KyclJyxwLnVwZGF0ZWR8fCcnCiAgICBdOwogICAgQ0wuZm9yRWFjaChmdW5jdGlvbihjKXtiYXNlLnB1c2gocC5jaGVja3NbYy5pZF0/JzEnOicwJyk7fSk7CiAgICByb3dzLnB1c2goYmFzZS5qb2luKCcsJykpOwogIH0pOwogIC8vIFByb2plY3QgaW5mbyBhcyBmaXJzdCBjb21tZW50IGxpbmUKICB2YXIgbWV0YT0nIyBDbGllbnQ6ICcrKHByb2plY3QuY2xpZW50fHwnJykrJyB8IFNpdGU6ICcrKHByb2plY3Quc2l0ZXx8JycpKycgfCBBdWRpdG9yOiAnKyhwcm9qZWN0LmF1ZGl0b3J8fCcnKSsnIHwgRXhwb3J0ZWQ6ICcrbmV3IERhdGUoKS50b0lTT1N0cmluZygpOwogIHZhciBjc3Y9bWV0YSsnXG4nK3Jvd3Muam9pbignXG4nKTsKICB2YXIgYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7CiAgYS5ocmVmPVVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW2Nzdl0se3R5cGU6J3RleHQvY3N2J30pKTsKICBhLmRvd25sb2FkPSdzZW8tYXVkaXQtd29ya2Zsb3ctJysocHJvamVjdC5jbGllbnR8fCdleHBvcnQnKS5yZXBsYWNlKC9ccysvZywnLScpLnRvTG93ZXJDYXNlKCkrJy0nK25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLDEwKSsnLmNzdic7CiAgYS5jbGljaygpOwogIHRvYXN0KCfinIUgQ1NWIGV4cG9ydGVkJyk7Cn0KCi8vIOKUgOKUgCBJbXBvcnQgQ1NWIOKUgOKUgApmdW5jdGlvbiBpbXBvcnRDU1YoaW5wdXQpewogIHZhciBmaWxlPWlucHV0LmZpbGVzWzBdO2lmKCFmaWxlKXJldHVybjsKICB2YXIgcj1uZXcgRmlsZVJlYWRlcigpOwogIHIub25sb2FkPWZ1bmN0aW9uKGUpewogICAgdmFyIGxpbmVzPWUudGFyZ2V0LnJlc3VsdC5zcGxpdCgnXG4nKS5maWx0ZXIoZnVuY3Rpb24obCl7cmV0dXJuIGwmJiFsLnN0YXJ0c1dpdGgoJyMnKTt9KTsKICAgIGlmKGxpbmVzLmxlbmd0aDwyKXt0b2FzdCgn4pqgIEludmFsaWQgQ1NWJyk7cmV0dXJuO30KICAgIHZhciBoZWFkZXJzPWxpbmVzWzBdLnNwbGl0KCcsJykubWFwKGZ1bmN0aW9uKGgpe3JldHVybiBoLnRyaW0oKS5yZXBsYWNlKC8iL2csJycpO30pOwogICAgdmFyIGltcG9ydGVkPTA7CiAgICBmb3IodmFyIGk9MTtpPGxpbmVzLmxlbmd0aDtpKyspewogICAgICB2YXIgY29scz1saW5lc1tpXS5tYXRjaCgvKCIuKj8ifFteLF0rfCg/PD0sKSg/PSwpfF4oPz0sKXwoPzw9LCkkKS9nKXx8bGluZXNbaV0uc3BsaXQoJywnKTsKICAgICAgY29scz1jb2xzLm1hcChmdW5jdGlvbihjKXtyZXR1cm4gKGN8fCcnKS5yZXBsYWNlKC9eInwiJC9nLCcnKS50cmltKCk7fSk7CiAgICAgIHZhciB1cmw9Y29sc1toZWFkZXJzLmluZGV4T2YoJ1VSTCcpXXx8Jyc7CiAgICAgIGlmKCF1cmx8fCF1cmwuaW5jbHVkZXMoJy4nKSljb250aW51ZTsKICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBleGlzdHMKICAgICAgdmFyIGV4aXN0cz1wYWdlcy5maW5kKGZ1bmN0aW9uKHApe3JldHVybiBwLnVybD09PXVybDt9KTsKICAgICAgaWYoIWV4aXN0cyl7CiAgICAgICAgdmFyIG5wPW1ha2VQYWdlKHVybCwKICAgICAgICAgIGNvbHNbaGVhZGVycy5pbmRleE9mKCdLZXl3b3JkJyldfHwnJywKICAgICAgICAgIGNvbHNbaGVhZGVycy5pbmRleE9mKCdQcmlvcml0eScpXXx8J21lZCcsCiAgICAgICAgICBjb2xzW2hlYWRlcnMuaW5kZXhPZignUG9zaXRpb24nKV18fDAsCiAgICAgICAgICBjb2xzW2hlYWRlcnMuaW5kZXhPZignSW1wcmVzc2lvbnMnKV18fDApOwogICAgICAgIG5wLnN0YXR1cz1jb2xzW2hlYWRlcnMuaW5kZXhPZignU3RhdHVzJyldfHwnbm90c3RhcnRlZCc7CiAgICAgICAgbnAuc2NvcmVCZWZvcmU9Y29sc1toZWFkZXJzLmluZGV4T2YoJ1Njb3JlQmVmb3JlJyldfHwnJzsKICAgICAgICBucC5zY29yZUFmdGVyPWNvbHNbaGVhZGVycy5pbmRleE9mKCdTY29yZUFmdGVyJyldfHwnJzsKICAgICAgICBucC5kZWFkbGluZT1jb2xzW2hlYWRlcnMuaW5kZXhPZignRGVhZGxpbmUnKV18fCcnOwogICAgICAgIG5wLm5vdGVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdOb3RlcycpXXx8Jyc7CiAgICAgICAgLy8gUmVzdG9yZSBjaGVja2xpc3QKICAgICAgICBDTC5mb3JFYWNoKGZ1bmN0aW9uKGMpewogICAgICAgICAgdmFyIGNpPWhlYWRlcnMuaW5kZXhPZignY2hrXycrYy5pZCk7CiAgICAgICAgICBpZihjaT49MClucC5jaGVja3NbYy5pZF09Y29sc1tjaV09PT0nMSc7CiAgICAgICAgfSk7CiAgICAgICAgcGFnZXMucHVzaChucCk7aW1wb3J0ZWQrKzsKICAgICAgfSBlbHNlIHsKICAgICAgICAvLyBVcGRhdGUgZXhpc3RpbmcKICAgICAgICBleGlzdHMuc3RhdHVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdTdGF0dXMnKV18fGV4aXN0cy5zdGF0dXM7CiAgICAgICAgZXhpc3RzLm5vdGVzPWNvbHNbaGVhZGVycy5pbmRleE9mKCdOb3RlcycpXXx8ZXhpc3RzLm5vdGVzOwogICAgICAgIGV4aXN0cy5zY29yZUJlZm9yZT1jb2xzW2hlYWRlcnMuaW5kZXhPZignU2NvcmVCZWZvcmUnKV18fGV4aXN0cy5zY29yZUJlZm9yZTsKICAgICAgICBleGlzdHMuc2NvcmVBZnRlcj1jb2xzW2hlYWRlcnMuaW5kZXhPZignU2NvcmVBZnRlcicpXXx8ZXhpc3RzLnNjb3JlQWZ0ZXI7CiAgICAgICAgQ0wuZm9yRWFjaChmdW5jdGlvbihjKXsKICAgICAgICAgIHZhciBjaT1oZWFkZXJzLmluZGV4T2YoJ2Noa18nK2MuaWQpOwogICAgICAgICAgaWYoY2k+PTApZXhpc3RzLmNoZWNrc1tjLmlkXT1jb2xzW2NpXT09PScxJzsKICAgICAgICB9KTsKICAgICAgICBpbXBvcnRlZCsrOwogICAgICB9CiAgICB9CiAgICBzYXZlKCk7cmVuZGVyUGFnZXMoKTtyZW5kZXJPdmVydmlldygpOwogICAgdG9hc3QoJ+KchSAnK2ltcG9ydGVkKycgcGFnZXMgaW1wb3J0ZWQvdXBkYXRlZCcpOwogIH07CiAgci5yZWFkQXNUZXh0KGZpbGUpOwogIGlucHV0LnZhbHVlPScnOwp9CgpmdW5jdGlvbiBtYWtlUGFnZSh1cmwsa3cscHJpLHBvcyxpbXByKXsKICB2YXIgY2hlY2tzPXt9OwogIENMLmZvckVhY2goZnVuY3Rpb24oYyl7Y2hlY2tzW2MuaWRdPWZhbHNlO30pOwogIHJldHVybiB7aWQ6dWlkKCksdXJsOnVybCxrZXl3b3JkOmt3fHwnJyxwcmlvcml0eTpwcml8fCdtZWQnLAogICAgcG9zaXRpb246cGFyc2VGbG9hdChwb3MpfHwwLGltcHJlc3Npb25zOnBhcnNlSW50KGltcHIpfHwwLAogICAgc3RhdHVzOidub3RzdGFydGVkJyxzY29yZUJlZm9yZTonJyxzY29yZUFmdGVyOicnLG5vdGVzOicnLGRlYWRsaW5lOicnLAogICAgY2hlY2tzOmNoZWNrcyxjcmVhdGVkOm5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSx1cGRhdGVkOm5ldyBEYXRlKCkudG9JU09TdHJpbmcoKX07Cn0KCi8vIOKUgOKUgCBDbGllbnQgcmVwb3J0IGV4cG9ydCDilIDilIAKZnVuY3Rpb24gZXhwb3J0Q2xpZW50UmVwb3J0KCl7CiAgaWYoIXBhZ2VzLmxlbmd0aCl7dG9hc3QoJ+KaoCBObyBwYWdlcycpO3JldHVybjt9CiAgdmFyIGRvbmU9cGFnZXMuZmlsdGVyKGZ1bmN0aW9uKHApe3JldHVybiBwLnN0YXR1cz09PSdkb25lJzt9KTsKICB2YXIgaW5wPXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0naW5wcm9ncmVzcyc7fSk7CiAgdmFyIGZ1PXBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXtyZXR1cm4gcC5zdGF0dXM9PT0nZm9sbG93dXAnO30pOwogIHZhciBodG1sPSc8IURPQ1RZUEUgaHRtbD48aHRtbD48aGVhZD48bWV0YSBjaGFyc2V0PSJVVEYtOCI+PHRpdGxlPlNFTyBBdWRpdCBSZXBvcnQg4oCUICcrKHByb2plY3QuY2xpZW50fHwnQ2xpZW50JykrJzwvdGl0bGU+JwogICAgKyc8c3R5bGU+Ym9keXtmb250LWZhbWlseTpBcmlhbCxzYW5zLXNlcmlmO21heC13aWR0aDo5MDBweDttYXJnaW46NDBweCBhdXRvO2NvbG9yOiMxZjI5Mzc7cGFkZGluZzowIDIwcHg7fScKICAgICsnaDF7Y29sb3I6IzZkMjhkOTtmb250LXNpemU6MjhweDttYXJnaW4tYm90dG9tOjRweDt9aDJ7Y29sb3I6IzRiNTU2Mztmb250LXNpemU6MThweDttYXJnaW46MjRweCAwIDEwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgI2U1ZTdlYjtwYWRkaW5nLWJvdHRvbTo2cHg7fScKICAgICsndGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWFyZ2luLWJvdHRvbToyMHB4O2ZvbnQtc2l6ZToxM3B4O30nCiAgICArJ3Roe2JhY2tncm91bmQ6I2YzZjRmNjtwYWRkaW5nOjhweCAxMHB4O3RleHQtYWxpZ246bGVmdDtib3JkZXI6MXB4IHNvbGlkICNlNWU3ZWI7Y29sb3I6IzZiNzI4MDt9JwogICAgKyd0ZHtwYWRkaW5nOjhweCAxMHB4O2JvcmRlcjoxcHggc29saWQgI2U1ZTdlYjt9JwogICAgKycuZG9uZXtjb2xvcjojMTZhMzRhO2ZvbnQtd2VpZ2h0OjcwMDt9LmlucHtjb2xvcjojYjQ1MzA5O30uZnV7Y29sb3I6IzdjM2FlZDt9JwogICAgKyc8L3N0eWxlPjwvaGVhZD48Ym9keT4nCiAgICArJzxoMT5TRU8gQXVkaXQgUmVwb3J0PC9oMT4nCiAgICArJzxwPjxzdHJvbmc+Q2xpZW50Ojwvc3Ryb25nPiAnKyhwcm9qZWN0LmNsaWVudHx8J+KAlCcpKycgJm5ic3A7IDxzdHJvbmc+U2l0ZTo8L3N0cm9uZz4gJysocHJvamVjdC5zaXRlfHwn4oCUJykKICAgICsnICZuYnNwOyA8c3Ryb25nPkF1ZGl0b3I6PC9zdHJvbmc+ICcrKHByb2plY3QuYXVkaXRvcnx8J+KAlCcpKycgJm5ic3A7IDxzdHJvbmc+RGF0ZTo8L3N0cm9uZz4gJytuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpKyc8L3A+JwogICAgKyc8cD48c3Ryb25nPlByb2dyZXNzOjwvc3Ryb25nPiAnK2RvbmUubGVuZ3RoKycvJytwYWdlcy5sZW5ndGgrJyBwYWdlcyBjb21wbGV0ZWQgKCcrTWF0aC5yb3VuZChkb25lLmxlbmd0aC9wYWdlcy5sZW5ndGgqMTAwKSsnJSk8L3A+JzsKCiAgZnVuY3Rpb24gcGFnZVJvd3MoYXJyKXsKICAgIHJldHVybiBhcnIubWFwKGZ1bmN0aW9uKHApewogICAgICB2YXIgcHJvZz1jaGVja1Byb2dyZXNzKHApOwogICAgICByZXR1cm4gJzx0cj48dGQ+PGEgaHJlZj0iJytwLnVybCsnIj4nK3AudXJsKyc8L2E+PC90ZD48dGQ+JytwLmtleXdvcmQrJzwvdGQ+JwogICAgICAgICsnPHRkPicrKHAuc2NvcmVCZWZvcmV8fCfigJQnKSsnIOKGkiAnKyhwLnNjb3JlQWZ0ZXJ8fCfigJQnKSsnPC90ZD4nCiAgICAgICAgKyc8dGQ+Jytwcm9nLnBjdCsnJTwvdGQ+PHRkPicrKHAubm90ZXN8fCfigJQnKSsnPC90ZD48L3RyPic7CiAgICB9KS5qb2luKCcnKTsKICB9CgogIGlmKGRvbmUubGVuZ3RoKXtodG1sKz0nPGgyPuKchSBDb21wbGV0ZWQgUGFnZXMgKCcrZG9uZS5sZW5ndGgrJyk8L2gyPjx0YWJsZT48dHI+PHRoPlVSTDwvdGg+PHRoPktleXdvcmQ8L3RoPjx0aD5TY29yZSBCZWZvcmXihpJBZnRlcjwvdGg+PHRoPkNoZWNrbGlzdDwvdGg+PHRoPk5vdGVzPC90aD48L3RyPicrcGFnZVJvd3MoZG9uZSkrJzwvdGFibGU+Jzt9CiAgaWYoaW5wLmxlbmd0aCl7aHRtbCs9JzxoMj7wn5SEIEluIFByb2dyZXNzICgnK2lucC5sZW5ndGgrJyk8L2gyPjx0YWJsZT48dHI+PHRoPlVSTDwvdGg+PHRoPktleXdvcmQ8L3RoPjx0aD5TY29yZSBCZWZvcmXihpJBZnRlcjwvdGg+PHRoPkNoZWNrbGlzdDwvdGg+PHRoPk5vdGVzPC90aD48L3RyPicrcGFnZVJvd3MoaW5wKSsnPC90YWJsZT4nO30KICBpZihmdS5sZW5ndGgpe2h0bWwrPSc8aDI+8J+TjCBGb2xsb3ctdXAgUmVxdWlyZWQgKCcrZnUubGVuZ3RoKycpPC9oMj48dGFibGU+PHRyPjx0aD5VUkw8L3RoPjx0aD5LZXl3b3JkPC90aD48dGg+U2NvcmUgQmVmb3Jl4oaSQWZ0ZXI8L3RoPjx0aD5DaGVja2xpc3Q8L3RoPjx0aD5Ob3RlczwvdGg+PC90cj4nK3BhZ2VSb3dzKGZ1KSsnPC90YWJsZT4nO30KCiAgaHRtbCs9JzwvYm9keT48L2h0bWw+JzsKICB2YXIgYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7CiAgYS5ocmVmPVVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW2h0bWxdLHt0eXBlOid0ZXh0L2h0bWwnfSkpOwogIGEuZG93bmxvYWQ9J3Nlby1yZXBvcnQtJysocHJvamVjdC5jbGllbnR8fCdjbGllbnQnKS5yZXBsYWNlKC9ccysvZywnLScpLnRvTG93ZXJDYXNlKCkrJy0nK25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLDEwKSsnLmh0bWwnOwogIGEuY2xpY2soKTsKICB0b2FzdCgn4pyFIENsaWVudCByZXBvcnQgZXhwb3J0ZWQnKTsKfQoKLy8g4pSA4pSAIENoZWNrIGZvciBQVUxTRStORVhVUyBjYWxsYmFjayDilIDilIAKLy8gV2hlbiBhdWRpdCB0b29sIG1hcmtzIGEgcGFnZSBkb25lLCBpdCBjYW4gc2V0ID9kb25lPXBhZ2VJZCBpbiBVUkwKKGZ1bmN0aW9uIGNoZWNrQ2FsbGJhY2soKXsKICB2YXIgcGFyYW1zPW5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7CiAgdmFyIGRvbmVJZD1wYXJhbXMuZ2V0KCdkb25lJyk7CiAgaWYoZG9uZUlkKXsKICAgIHZhciBwPXBhZ2VzLmZpbmQoZnVuY3Rpb24ocGcpe3JldHVybiBwZy5pZD09PWRvbmVJZDt9KTsKICAgIGlmKHApewogICAgICBwLnN0YXR1cz0nZG9uZSc7cC5jaGVja3NbJ3B1bHNlJ109dHJ1ZTtwLnVwZGF0ZWQ9bmV3IERhdGUoKS50b0lTT1N0cmluZygpOwogICAgICBzYXZlKCk7dG9hc3QoJ+KchSBQYWdlIG1hcmtlZCBkb25lIGZyb20gUFVMU0UrTkVYVVMnKTsKICAgIH0KICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsJycsd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTsKICB9Cn0pKCk7CgovLyDilIDilIAgSW1wb3J0IEdTQyBDU1Yg4oaSIGF1dG8tcG9wdWxhdGUgcGFnZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACi8vIEdTQyBleHBvcnQ6IFBlcmZvcm1hbmNlIOKGkiBQYWdlcyB0YWIg4oaSIEV4cG9ydCBDU1YKLy8g4pSA4pSAIEdTQyBpbXBvcnQg4oCUIFBhZ2VzIENTViArIFF1ZXJpZXMgQ1NWIGJlaWRlIHRlZ2VsaWprIOKUgOKUgOKUgOKUgAp2YXIgX2dzY1F1ZXJ5TWFwID0ge307IC8vIHVybCDihpIgW3F1ZXJ5LCBxdWVyeSwgLi4uXQoKZnVuY3Rpb24gaW1wb3J0R1NDKGlucHV0KXsKICB2YXIgZmlsZXMgPSBBcnJheS5mcm9tKGlucHV0LmZpbGVzKTsKICBpZighZmlsZXMubGVuZ3RoKSByZXR1cm47CgogIHZhciB0b3RhbEFkZGVkID0gMCwgdG90YWxVcGRhdGVkID0gMCwgcXVlcmllc0xvYWRlZCA9IDA7CiAgdmFyIHBlbmRpbmcgPSBmaWxlcy5sZW5ndGg7CgogIGZpbGVzLmZvckVhY2goZnVuY3Rpb24oZmlsZSl7CiAgICB2YXIgciA9IG5ldyBGaWxlUmVhZGVyKCk7CiAgICByLm9ubG9hZCA9IGZ1bmN0aW9uKGUpewogICAgICB2YXIgcmVzdWx0ID0gcGFyc2VHU0NGaWxlKGUudGFyZ2V0LnJlc3VsdCk7CiAgICAgIGlmKHJlc3VsdC50eXBlID09PSAncGFnZXMnKXsKICAgICAgICB0b3RhbEFkZGVkICs9IHJlc3VsdC5hZGRlZDsKICAgICAgICB0b3RhbFVwZGF0ZWQgKz0gcmVzdWx0LnVwZGF0ZWQ7CiAgICAgIH0gZWxzZSBpZihyZXN1bHQudHlwZSA9PT0gJ3F1ZXJpZXMnKXsKICAgICAgICBxdWVyaWVzTG9hZGVkID0gcmVzdWx0LmNvdW50OwogICAgICB9CiAgICAgIHBlbmRpbmctLTsKICAgICAgaWYocGVuZGluZyA9PT0gMCl7CiAgICAgICAgLy8gQXV0by1tZXJnZSBkdXBsaWNhdGVzIGFmdGVyIGltcG9ydAogICAgICAgIHZhciBiZWZvcmVNZXJnZSA9IHBhZ2VzLmxlbmd0aDsKICAgICAgICB2YXIgc2VlbiA9IHt9LCBjbnRzID0ge307CiAgICAgICAgcGFnZXMuZm9yRWFjaChmdW5jdGlvbihwKSB7CiAgICAgICAgICB2YXIga2V5ID0gKHAudXJsfHwnJykudHJpbSgpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXC8rJC8sICcnKTsKICAgICAgICAgIGlmIChzZWVuW2tleV0pIHsKICAgICAgICAgICAgdmFyIGV4ID0gc2VlbltrZXldOwogICAgICAgICAgICBleC5pbXByZXNzaW9ucyA9IChleC5pbXByZXNzaW9uc3x8MCkgKyAocC5pbXByZXNzaW9uc3x8MCk7CiAgICAgICAgICAgIGV4Ll9wcyA9IChleC5fcHN8fGV4LnBvc2l0aW9ufHwwKSArIChwLnBvc2l0aW9ufHwwKTsKICAgICAgICAgICAgY250c1trZXldKys7CiAgICAgICAgICAgIHAuX2R1cCA9IHRydWU7CiAgICAgICAgICB9IGVsc2UgeyBzZWVuW2tleV0gPSBwOyBwLl9wcyA9IHAucG9zaXRpb258fDA7IGNudHNba2V5XSA9IDE7IH0KICAgICAgICB9KTsKICAgICAgICBPYmplY3Qua2V5cyhzZWVuKS5mb3JFYWNoKGZ1bmN0aW9uKGspewogICAgICAgICAgdmFyIHAgPSBzZWVuW2tdOwogICAgICAgICAgaWYoY250c1trXT4xKXsgcC5wb3NpdGlvbj1NYXRoLnJvdW5kKChwLl9wcy9jbnRzW2tdKSoxMCkvMTA7IH0KICAgICAgICAgIGRlbGV0ZSBwLl9wczsKICAgICAgICB9KTsKICAgICAgICBwYWdlcyA9IHBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXsgcmV0dXJuICFwLl9kdXA7IH0pOwogICAgICAgIHZhciBtZXJnZWRDb3VudCA9IGJlZm9yZU1lcmdlIC0gcGFnZXMubGVuZ3RoOwogICAgICAgIC8vIFNhdmUgR1NDIGRhdGEgdG8gc2hhcmVkIHN0b3JhZ2UgZm9yIFBVTFNFK05FWFVTCiAgICAgICAgdHJ5IHsKICAgICAgICAgIHZhciBzaGFyZWRHc2MgPSB7IHBhZ2VzOiBwYWdlcy5tYXAoZnVuY3Rpb24ocCl7IHJldHVybiB7cGFnZTpwLnVybCwgaW1wcmVzc2lvbnM6cC5pbXByZXNzaW9uc3x8MCwgY2xpY2tzOjAsIGN0cjpwLmN0cnx8MCwgcG9zaXRpb246cC5wb3NpdGlvbnx8MCwgc2NvcmU6MH07IH0pLCBxdWVyaWVzOiBbXSB9OwogICAgICAgICAgaWYgKHR5cGVvZiBfZ3NjUXVlcnlNYXAgIT09ICd1bmRlZmluZWQnKSB7IHNoYXJlZEdzYy5xdWVyaWVzID0gT2JqZWN0LmtleXMoX2dzY1F1ZXJ5TWFwKS5tYXAoZnVuY3Rpb24ocSl7IHJldHVybiB7cXVlcnk6cSwgcG9zaXRpb246X2dzY1F1ZXJ5TWFwW3FdfTsgfSk7IH0KICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjc19zaGFyZWRfZ3NjJywgSlNPTi5zdHJpbmdpZnkoc2hhcmVkR3NjKSk7CiAgICAgICAgfSBjYXRjaChlKSB7fQogICAgICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgICAgICB2YXIgbXNnID0gJ+KchSBHU0M6ICcgKyB0b3RhbEFkZGVkICsgJyBhZGRlZCwgJyArIHRvdGFsVXBkYXRlZCArICcgdXBkYXRlZCc7CiAgICAgICAgaWYgKG1lcmdlZENvdW50ID4gMCkgbXNnICs9ICcgwrcgJyArIG1lcmdlZENvdW50ICsgJyBkdXBsaWNhdGVzIG1lcmdlZCc7CiAgICAgICAgaWYocXVlcmllc0xvYWRlZCkgbXNnICs9ICcgwrcgJyArIHF1ZXJpZXNMb2FkZWQgKyAnIHF1ZXJpZXMgbG9hZGVkJzsKICAgICAgICB0b2FzdChtc2cpOwogICAgICB9CiAgICB9OwogICAgci5yZWFkQXNUZXh0KGZpbGUpOwogIH0pOwogIGlucHV0LnZhbHVlID0gJyc7Cn0KCmZ1bmN0aW9uIHBhcnNlR1NDRmlsZShyYXcpewogIHZhciBsaW5lcyA9IHJhdy50cmltKCkuc3BsaXQoJ1xuJyk7CiAgaWYobGluZXMubGVuZ3RoIDwgMikgcmV0dXJuIHt0eXBlOid1bmtub3duJ307CiAgdmFyIGhlYWRlciA9IGxpbmVzWzBdLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvIi9nLCcnKS5zcGxpdCgnLCcpOwoKICAvLyBEZXRlY3QgaWYgdGhpcyBpcyBhIFF1ZXJpZXMgQ1NWIG9yIFBhZ2VzIENTVgogIHZhciBpc1F1ZXJpZXMgPSBoZWFkZXIuc29tZShmdW5jdGlvbihoKXsgcmV0dXJuIGguaW5jbHVkZXMoJ3F1ZXJ5JykgfHwgaC5pbmNsdWRlcygnc2VhcmNoIHRlcm0nKTsgfSk7CgogIGlmKGlzUXVlcmllcyl7CiAgICAvLyBRdWVyaWVzIENTViDigJQgYnVpbGQgYSBxdWVyeSBsaXN0IChub3QgbGlua2VkIHRvIHBhZ2VzIGRpcmVjdGx5IGhlcmUpCiAgICAvLyBTdG9yZSBnbG9iYWxseSBmb3IgdXNlIGluIFBVTFNFK05FWFVTCiAgICBfZ3NjUXVlcnlNYXAgPSB7fTsKICAgIHZhciBpUXVlcnkgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygncXVlcnknKXx8aC5pbmNsdWRlcygnc2VhcmNoIHRlcm0nKTsgfSk7CiAgICB2YXIgaVBvcyAgID0gaGVhZGVyLmZpbmRJbmRleChmdW5jdGlvbihoKXsgcmV0dXJuIGguaW5jbHVkZXMoJ3Bvc2l0aW9uJyk7IH0pOwogICAgdmFyIGNvdW50ICA9IDA7CiAgICBmb3IodmFyIGk9MTtpPGxpbmVzLmxlbmd0aDtpKyspewogICAgICB2YXIgY29scyA9IGxpbmVzW2ldLnJlcGxhY2UoLyIvZywnJykuc3BsaXQoJywnKTsKICAgICAgdmFyIHEgPSAoY29sc1tpUXVlcnldfHwnJykudHJpbSgpOwogICAgICB2YXIgcG9zID0gcGFyc2VGbG9hdChjb2xzW2lQb3NdKXx8MDsKICAgICAgaWYocSl7IF9nc2NRdWVyeU1hcFtxXSA9IHBvczsgY291bnQrKzsgfQogICAgfQogICAgdHJ5eyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3NfZ3NjX3F1ZXJpZXMnLCBKU09OLnN0cmluZ2lmeShfZ3NjUXVlcnlNYXApKTsgfWNhdGNoKGUpe30KICAgIHJldHVybiB7dHlwZToncXVlcmllcycsIGNvdW50OmNvdW50fTsKICB9CgogIC8vIFBhZ2VzIENTVgogIHZhciBpVXJsICA9IGhlYWRlci5maW5kSW5kZXgoZnVuY3Rpb24oaCl7IHJldHVybiBoLmluY2x1ZGVzKCdwYWdlJyl8fGguaW5jbHVkZXMoJ3VybCcpfHxoLmluY2x1ZGVzKCd0b3AgcGFnZScpOyB9KTsKICB2YXIgaUltcHIgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygnaW1wcmVzc2lvbicpOyB9KTsKICB2YXIgaUN0ciAgPSBoZWFkZXIuZmluZEluZGV4KGZ1bmN0aW9uKGgpeyByZXR1cm4gaC5pbmNsdWRlcygnY3RyJyk7IH0pOwogIHZhciBpUG9zICA9IGhlYWRlci5maW5kSW5kZXgoZnVuY3Rpb24oaCl7IHJldHVybiBoLmluY2x1ZGVzKCdwb3NpdGlvbicpfHxoLmluY2x1ZGVzKCdwb3MnKTsgfSk7CiAgaWYoaVVybDwwKWlVcmw9MDsgaWYoaUltcHI8MClpSW1wcj0yOyBpZihpUG9zPDApaVBvcz00OwoKICB2YXIgYWRkZWQ9MCwgdXBkYXRlZD0wOwogIGZvcih2YXIgaT0xO2k8bGluZXMubGVuZ3RoO2krKyl7CiAgICB2YXIgY29scyA9IGxpbmVzW2ldLnJlcGxhY2UoLyIvZywnJykuc3BsaXQoJywnKTsKICAgIHZhciB1cmwgPSAoY29sc1tpVXJsXXx8JycpLnRyaW0oKTsKICAgIC8vIE9ubHkgYWNjZXB0IHJlYWwgcGFnZSBVUkxzIOKAlCBtdXN0IHN0YXJ0IHdpdGggaHR0cCBvciAvCiAgICBpZighdXJsKSBjb250aW51ZTsKICAgIGlmKCF1cmwuc3RhcnRzV2l0aCgnaHR0cCcpICYmICF1cmwuc3RhcnRzV2l0aCgnLycpKSBjb250aW51ZTsKICAgIC8vIFJlamVjdCBxdWVyeSBzdHJpbmdzIG1hc3F1ZXJhZGluZyBhcyBVUkxzCiAgICBpZih1cmwuaW5jbHVkZXMoJy1zaXRlOicpIHx8IHVybC5pbmNsdWRlcygnICcpIHx8IHVybC5pbmNsdWRlcygnP3E9JykpIGNvbnRpbnVlOwogICAgdmFyIGltcHIgPSBwYXJzZUludChjb2xzW2lJbXByXSl8fDA7CiAgICB2YXIgcG9zICA9IHBhcnNlRmxvYXQoY29sc1tpUG9zXSl8fDA7CiAgICB2YXIgY3RyICA9IHBhcnNlRmxvYXQoKGNvbHNbaUN0cl18fCcwJykucmVwbGFjZSgnJScsJycpKXx8MDsKICAgIHZhciBwcmk7CiAgICBpZihwb3M+PTExJiZwb3M8PTMwKSBwcmk9J2hpZ2gnOwogICAgZWxzZSBpZihwb3M+PTEmJnBvczw9MTAmJmN0cjwyKSBwcmk9J2hpZ2gnOwogICAgZWxzZSBpZihwb3M+MzAmJnBvczw9NjApIHByaT0nbWVkJzsKICAgIGVsc2UgaWYocG9zPjYwKSBwcmk9J2xvdyc7CiAgICBlbHNlIHByaT0nbG93JzsKICAgIHZhciBleGlzdGluZyA9IHBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7IHJldHVybiBwLnVybD09PXVybDsgfSk7CiAgICBpZihleGlzdGluZyl7CiAgICAgIC8vIE1lcmdlOiBrZWVwIGhpZ2hlc3QgaW1wcmVzc2lvbnMsIGJlc3QgcG9zaXRpb24KICAgICAgaWYoaW1wciA+IChleGlzdGluZy5pbXByZXNzaW9uc3x8MCkpIGV4aXN0aW5nLmltcHJlc3Npb25zID0gaW1wcjsKICAgICAgaWYocG9zID4gMCAmJiAoZXhpc3RpbmcucG9zaXRpb249PT0wIHx8IHBvcyA8IGV4aXN0aW5nLnBvc2l0aW9uKSkgZXhpc3RpbmcucG9zaXRpb24gPSBwb3M7CiAgICAgIGV4aXN0aW5nLnByaW9yaXR5PXByaTsgZXhpc3RpbmcuY3RyPWN0cjsKICAgICAgZXhpc3RpbmcudXBkYXRlZD1uZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CiAgICAgIHVwZGF0ZWQrKzsKICAgIH0gZWxzZSB7CiAgICAgIHZhciBucCA9IG1ha2VQYWdlKHVybCwnJyxwcmkscG9zLGltcHIpOwogICAgICBucC5jdHIgPSBjdHI7CiAgICAgIHBhZ2VzLnB1c2gobnApOwogICAgICBhZGRlZCsrOwogICAgfQogIH0KICByZXR1cm4ge3R5cGU6J3BhZ2VzJywgYWRkZWQ6YWRkZWQsIHVwZGF0ZWQ6dXBkYXRlZH07Cn0KCmZ1bmN0aW9uIG1lcmdlRHVwbGljYXRlUGFnZXMoKSB7CiAgdmFyIHNlZW4gPSB7fTsgICAgLy8ga2V5IC0+IHByaW1hcnkgcGFnZSBvYmplY3QKICB2YXIgY291bnRzID0ge307ICAvLyBrZXkgLT4gY291bnQgZm9yIGF2ZXJhZ2luZyBwb3NpdGlvbgogIHZhciBtZXJnZWQgPSAwOwoKICBwYWdlcy5mb3JFYWNoKGZ1bmN0aW9uKHApIHsKICAgIHZhciBrZXkgPSAocC51cmwgfHwgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1wvKyQvLCAnJyk7CiAgICBpZiAoc2VlbltrZXldKSB7CiAgICAgIHZhciBleCA9IHNlZW5ba2V5XTsKICAgICAgLy8gU3VtIGltcHJlc3Npb25zCiAgICAgIGV4LmltcHJlc3Npb25zID0gKGV4LmltcHJlc3Npb25zIHx8IDApICsgKHAuaW1wcmVzc2lvbnMgfHwgMCk7CiAgICAgIC8vIFJ1bm5pbmcgYXZlcmFnZSBmb3IgcG9zaXRpb24KICAgICAgZXguX3Bvc1N1bSA9IChleC5fcG9zU3VtIHx8IGV4LnBvc2l0aW9uIHx8IDApICsgKHAucG9zaXRpb24gfHwgMCk7CiAgICAgIGNvdW50c1trZXldKys7CiAgICAgIHAuX2R1cGxpY2F0ZSA9IHRydWU7CiAgICAgIG1lcmdlZCsrOwogICAgfSBlbHNlIHsKICAgICAgc2VlbltrZXldID0gcDsKICAgICAgcC5fcG9zU3VtID0gcC5wb3NpdGlvbiB8fCAwOwogICAgICBjb3VudHNba2V5XSA9IDE7CiAgICB9CiAgfSk7CgogIC8vIEZpbmFsaXplIGF2ZXJhZ2VzCiAgT2JqZWN0LmtleXMoc2VlbikuZm9yRWFjaChmdW5jdGlvbihrZXkpIHsKICAgIHZhciBwID0gc2VlbltrZXldOwogICAgaWYgKGNvdW50c1trZXldID4gMSkgewogICAgICBwLnBvc2l0aW9uID0gTWF0aC5yb3VuZCgocC5fcG9zU3VtIC8gY291bnRzW2tleV0pICogMTApIC8gMTA7CiAgICAgIC8vIFJlY2FsY3VsYXRlIHByaW9yaXR5IGZyb20gYXZnIHBvc2l0aW9uCiAgICAgIGlmIChwLnBvc2l0aW9uID49IDExICYmIHAucG9zaXRpb24gPD0gMzApIHAucHJpb3JpdHkgPSAnaGlnaCc7CiAgICAgIGVsc2UgaWYgKHAucG9zaXRpb24gPj0gMSAmJiBwLnBvc2l0aW9uIDw9IDEwKSBwLnByaW9yaXR5ID0gJ2hpZ2gnOwogICAgICBlbHNlIGlmIChwLnBvc2l0aW9uID4gMzAgJiYgcC5wb3NpdGlvbiA8PSA2MCkgcC5wcmlvcml0eSA9ICdtZWQnOwogICAgICBlbHNlIHAucHJpb3JpdHkgPSAnbG93JzsKICAgIH0KICAgIGRlbGV0ZSBwLl9wb3NTdW07CiAgfSk7CgogIGlmIChtZXJnZWQgPiAwKSB7CiAgICBwYWdlcyA9IHBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXsgcmV0dXJuICFwLl9kdXBsaWNhdGU7IH0pOwogICAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogICAgdG9hc3QoJ/CflIAgTWVyZ2VkICcgKyBtZXJnZWQgKyAnIGR1cGxpY2F0ZXMg4oCUIGF2ZyBwb3NpdGlvbiwgc3VtbWVkIGltcHJlc3Npb25zJyk7CiAgfSBlbHNlIHsKICAgIHRvYXN0KCfinJMgTm8gZHVwbGljYXRlcyBmb3VuZCcpOwogIH0KfQoKLy8g4pSA4pSAIFNpdGVtYXAgKyBHU0Mg4oCUIGdyb3VwIGludG86IGluIEdTQyAvIG5vdCBpbiBHU0Mg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACgpmdW5jdGlvbiBhZGRTZWxlY3RlZFNpdGVtYXBVcmxzKCl7CiAgdmFyIHNlbGVjdGVkID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuc2l0ZW1hcC1jYjpjaGVja2VkJykpLm1hcChmdW5jdGlvbihjYil7IHJldHVybiBjYi5kYXRhc2V0LnVybDsgfSk7CiAgaWYoIXNlbGVjdGVkLmxlbmd0aCl7IHRvYXN0KCfimqAgTm8gVVJMcyBzZWxlY3RlZCcpOyByZXR1cm47IH0KICB2YXIgYWRkZWQ9MCwgc2tpcHBlZD0wOwogIHNlbGVjdGVkLmZvckVhY2goZnVuY3Rpb24odXJsKXsKICAgIGlmKHBhZ2VzLmZpbmQoZnVuY3Rpb24ocCl7IHJldHVybiBwLnVybD09PXVybDsgfSkpeyBza2lwcGVkKys7IHJldHVybjsgfQogICAgLy8gQ2hlY2sgaWYgR1NDIGRhdGEgYXZhaWxhYmxlIGZyb20gcGFnZXMgYWxyZWFkeSBpbXBvcnRlZAogICAgdmFyIGdzY0VudHJ5ID0gX2dzY0RhdGFNYXAgJiYgX2dzY0RhdGFNYXBbdXJsXTsKICAgIGlmKGdzY0VudHJ5KXsKICAgICAgdmFyIG5wID0gbWFrZVBhZ2UodXJsLCcnLGdzY0VudHJ5LnByaSxnc2NFbnRyeS5wb3MsZ3NjRW50cnkuaW1wcik7CiAgICAgIG5wLmN0ciA9IGdzY0VudHJ5LmN0cjsKICAgICAgcGFnZXMucHVzaChucCk7CiAgICB9IGVsc2UgewogICAgICBwYWdlcy5wdXNoKG1ha2VQYWdlKHVybCwnJywnbG93JywwLDApKTsKICAgIH0KICAgIGFkZGVkKys7CiAgfSk7CiAgc2F2ZSgpOyByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwUHJldmlldycpLnN0eWxlLmRpc3BsYXk9J25vbmUnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwVXJsJykudmFsdWU9Jyc7CiAgX3NpdGVtYXBVcmxzPVtdOyBfc2l0ZW1hcEZpbHRlcmVkPVtdOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU3RhdHVzJykudGV4dENvbnRlbnQ9Jyc7CiAgdG9hc3QoJ+KchSAnK2FkZGVkKycgcGFnZXMgYWRkZWQnKyhza2lwcGVkPycgwrcgJytza2lwcGVkKycgYWxyZWFkeSBwcmVzZW50JzonJykpOwp9CgovLyBHbG9iYWwgR1NDIGRhdGEgbWFwIGZvciBjcm9zcy1yZWZlcmVuY2luZwp2YXIgX2dzY0RhdGFNYXAgPSB7fTsKCi8vIEJ1aWxkIEdTQyBtYXAgZnJvbSBpbXBvcnRlZCBwYWdlcwpmdW5jdGlvbiBidWlsZEdzY01hcCgpewogIF9nc2NEYXRhTWFwID0ge307CiAgcGFnZXMuZm9yRWFjaChmdW5jdGlvbihwKXsKICAgIGlmKHAucG9zaXRpb24+MCB8fCBwLmltcHJlc3Npb25zPjApewogICAgICBfZ3NjRGF0YU1hcFtwLnVybF0gPSB7cG9zOnAucG9zaXRpb24sIGltcHI6cC5pbXByZXNzaW9ucywgY3RyOnAuY3RyfHwwLCBwcmk6cC5wcmlvcml0eX07CiAgICB9CiAgfSk7Cn0KCi8vIOKUgOKUgCBNYWluIGZpbHRlcjogc2hvdyBzaXRlbWFwIFVSTHMgaW4gdHdvIGdyb3VwcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKZnVuY3Rpb24gZmlsdGVyU2l0ZW1hcEJ5R1NDKCl7CiAgYnVpbGRHc2NNYXAoKTsKICB2YXIgZ3NjVXJscyA9IE9iamVjdC5rZXlzKF9nc2NEYXRhTWFwKTsKICBpZighZ3NjVXJscy5sZW5ndGgpewogICAgdG9hc3QoJ+KaoCBJbXBvcnRlZXIgZWVyc3QgamUgR1NDIENTViDigJQgZGFuIHdvcmR0IGRlIHZlcmdlbGlqa2luZyBnZW1hYWt0Jyk7CiAgICByZXR1cm47CiAgfQogIHZhciBpbkdTQyAgICA9IF9zaXRlbWFwVXJscy5maWx0ZXIoZnVuY3Rpb24odSl7IHJldHVybiBfZ3NjRGF0YU1hcFt1XTsgfSk7CiAgdmFyIG5vdEluR1NDID0gX3NpdGVtYXBVcmxzLmZpbHRlcihmdW5jdGlvbih1KXsgcmV0dXJuICFfZ3NjRGF0YU1hcFt1XTsgfSk7CgogIHJlbmRlclNpdGVtYXBHcm91cGVkKGluR1NDLCBub3RJbkdTQyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBTdGF0dXMnKS5pbm5lckhUTUwgPQogICAgJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPvCfn6IgJytpbkdTQy5sZW5ndGgrJyBpbiBHU0M8L3NwYW4+JwogICAgKycgJm5ic3A7IDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1nb2xkKSI+8J+foSAnK25vdEluR1NDLmxlbmd0aCsnIG5vdCBpbiBHU0MgKG5vdCBpbmRleGVkIC8gbmV3KTwvc3Bhbj4nCiAgICArJyAmbmJzcDsgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLXN1YikiPicrX3NpdGVtYXBVcmxzLmxlbmd0aCsnIHRvdGFhbDwvc3Bhbj4nOwp9CgpmdW5jdGlvbiByZW5kZXJTaXRlbWFwR3JvdXBlZChpbkdTQywgbm90SW5HU0MpewogIHZhciBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBVcmxMaXN0Jyk7CiAgdmFyIHNlbENvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBTZWxDb3VudCcpOwoKICBmdW5jdGlvbiByb3dIdG1sKHUsIGRlZmF1bHRDaGVja2VkLCBnc2NEYXRhKXsKICAgIHZhciBzaG9ydFVybCA9IHUucmVwbGFjZSgvXmh0dHBzPzpcL1wvW14vXSsvLCcnKSB8fCAnLyc7CiAgICB2YXIgZ3NjSW5mbyA9IGdzY0RhdGEKICAgICAgPyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLWdyZWVuKTttYXJnaW4tbGVmdDo2cHg7Ij5wb3MgJytNYXRoLnJvdW5kKGdzY0RhdGEucG9zKSsoZ3NjRGF0YS5pbXByPycgwrcgJytnc2NEYXRhLmltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHInOicnKSsnPC9zcGFuPicKICAgICAgOiAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLWdvbGQpO21hcmdpbi1sZWZ0OjZweDsiPm5vdCBpbiBHU0M8L3NwYW4+JzsKICAgIHJldHVybiAnPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6N3B4O3BhZGRpbmc6NXB4IDhweDtib3JkZXItcmFkaXVzOjRweDtjdXJzb3I6cG9pbnRlcjsiIG9uY2xpY2s9InRoaXMucXVlcnlTZWxlY3RvcihcJ2lucHV0XCcpLmNsaWNrKCkiPicKICAgICAgKyc8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJzaXRlbWFwLWNiIiBkYXRhLXVybD0iJyt1KyciJysoZGVmYXVsdENoZWNrZWQ/JyBjaGVja2VkJzonJykrJyBvbmNsaWNrPSJldmVudC5zdG9wUHJvcGFnYXRpb24oKTt1cGRhdGVTaXRlbWFwQ291bnQoKSIgc3R5bGU9IndpZHRoOjEzcHg7aGVpZ2h0OjEzcHg7YWNjZW50LWNvbG9yOnZhcigtLWdvbGQpO2ZsZXgtc2hyaW5rOjA7Ij4nCiAgICAgICsnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtjb2xvcjp2YXIoLS1ibHVlKTtmbGV4OjE7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7d2hpdGUtc3BhY2U6bm93cmFwOyIgdGl0bGU9IicrdSsnIj4nK3Nob3J0VXJsKyc8L3NwYW4+JwogICAgICArZ3NjSW5mbwogICAgICArJzxidXR0b24gb25jbGljaz0iZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7cmVtb3ZlU2l0ZW1hcFVybChcJycrdSsnXCcpIiBzdHlsZT0iYmFja2dyb3VuZDpub25lO2JvcmRlcjpub25lO2NvbG9yOnZhcigtLWRpbSk7Y3Vyc29yOnBvaW50ZXI7Zm9udC1zaXplOjExcHg7cGFkZGluZzowIDRweDtmbGV4LXNocmluazowOyIgdGl0bGU9IlJlbW92ZSI+4pyVPC9idXR0b24+JwogICAgICArJzwvZGl2Pic7CiAgfQoKICB2YXIgaHRtbCA9ICcnOwoKICAvLyBHcm91cCAxIOKAlCBpbiBHU0MKICBpZihpbkdTQy5sZW5ndGgpewogICAgLy8gU29ydCBieSBvcHBvcnR1bml0eTogcG9zIDExLTMwIGZpcnN0CiAgICBpbkdTQy5zb3J0KGZ1bmN0aW9uKGEsYil7CiAgICAgIHZhciBwYSA9IF9nc2NEYXRhTWFwW2FdPy5wb3MgfHwgOTk5OwogICAgICB2YXIgcGIgPSBfZ3NjRGF0YU1hcFtiXT8ucG9zIHx8IDk5OTsKICAgICAgdmFyIHNjb3JlQSA9IChwYT49MTEmJnBhPD0zMCk/MDoocGE+PTEmJnBhPD0xMCk/MToocGE+MzAmJnBhPD02MCk/MjozOwogICAgICB2YXIgc2NvcmVCID0gKHBiPj0xMSYmcGI8PTMwKT8wOihwYj49MSYmcGI8PTEwKT8xOihwYj4zMCYmcGI8PTYwKT8yOjM7CiAgICAgIHJldHVybiBzY29yZUEtc2NvcmVCIHx8IHBhLXBiOwogICAgfSk7CiAgICBodG1sICs9ICc8ZGl2IHN0eWxlPSJmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1ncmVlbik7cGFkZGluZzo4cHggOHB4IDRweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCByZ2JhKDc0LDIyMiwxMjgsLjIpO21hcmdpbi1ib3R0b206NHB4OyI+JwogICAgICArJ/Cfn6IgSW4gR1NDIOKAlCAnK2luR1NDLmxlbmd0aCsnIHBhZ2VzIChzb3J0ZWQgYnkgb3Bwb3J0dW5pdHkpJwogICAgICArJzwvZGl2Pic7CiAgICBodG1sICs9IGluR1NDLm1hcChmdW5jdGlvbih1KXsgcmV0dXJuIHJvd0h0bWwodSwgdHJ1ZSwgX2dzY0RhdGFNYXBbdV0pOyB9KS5qb2luKCcnKTsKICB9CgogIC8vIEdyb3VwIDIg4oCUIG5vdCBpbiBHU0MKICBpZihub3RJbkdTQy5sZW5ndGgpewogICAgaHRtbCArPSAnPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tZ29sZCk7cGFkZGluZzoxMnB4IDhweCA0cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgyNTEsMTkxLDM2LC4yKTttYXJnaW4tYm90dG9tOjRweDttYXJnaW4tdG9wOjhweDsiPicKICAgICAgKyfwn5+hIE5vdCBpbiBHU0Mg4oCUICcrbm90SW5HU0MubGVuZ3RoKycgcGFnZXMgKG5vdCBpbmRleGVkIG9yIG5ldyknCiAgICAgICsnPC9kaXY+JwogICAgICArJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2NvbG9yOnZhcigtLXN1Yik7cGFkZGluZzoycHggOHB4IDhweDsiPkdvb2dsZSBkb2VzIG5vdCBrbm93IHRoZXNlIHBhZ2VzIHlldC4gQWRkIHRoZW0gdG8gaW52ZXN0aWdhdGUgd2h5LjwvZGl2Pic7CiAgICBodG1sICs9IG5vdEluR1NDLm1hcChmdW5jdGlvbih1KXsgcmV0dXJuIHJvd0h0bWwodSwgZmFsc2UsIG51bGwpOyB9KS5qb2luKCcnKTsKICB9CgogIGxpc3QuaW5uZXJIVE1MID0gaHRtbCB8fCAnPGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWRpbSk7cGFkZGluZzo4cHg7Ij5ObyBVUkxzIGZvdW5kLjwvZGl2Pic7CiAgdXBkYXRlU2l0ZW1hcENvdW50KCk7Cn0KCgovLyDilIDilIAgU2l0ZW1hcCBmZXRjaCArIHByZXZpZXcg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACnZhciBfc2l0ZW1hcFVybHMgPSBbXTsgLy8gYWxsIGZldGNoZWQgVVJMcwp2YXIgX3NpdGVtYXBGaWx0ZXJlZCA9IFtdOyAvLyBhZnRlciBmaWx0ZXIKCmFzeW5jIGZ1bmN0aW9uIGZldGNoU2l0ZW1hcCgpIHsKICB2YXIgdXJsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBVcmwnKS52YWx1ZS50cmltKCk7CiAgaWYgKCF1cmwpIHsgdG9hc3QoJ+KaoCBWb2VyIGVlbiBzaXRlbWFwIFVSTCBpbicpOyByZXR1cm47IH0KICBpZiAoIXVybC5zdGFydHNXaXRoKCdodHRwJykpIHVybCA9ICdodHRwczovLycgKyB1cmw7CgogIHZhciBidG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcEJ0bicpOwogIHZhciBzdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpOwogIGJ0bi50ZXh0Q29udGVudCA9ICfij7MgRmV0Y2hpbmcuLi4nOwogIGJ0bi5kaXNhYmxlZCA9IHRydWU7CiAgc3RhdHVzLnRleHRDb250ZW50ID0gJ0ZldGNoaW5nIHNpdGVtYXAgdmlhIHNlcnZlci4uLic7CiAgc3RhdHVzLnN0eWxlLmNvbG9yID0gJ3ZhcigtLW11dGVkKSc7CgogIHRyeSB7CiAgICAvLyBVc2UgUmFpbHdheSBzZXJ2ZXIgYXMgcHJveHkgdG8gYXZvaWQgQ09SUwogICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3NpdGVtYXAvdXJscycsIHsKICAgICAgbWV0aG9kOiAnUE9TVCcsCiAgICAgIGhlYWRlcnM6IHsnQ29udGVudC1UeXBlJzonYXBwbGljYXRpb24vanNvbid9LAogICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7dXJsOiB1cmx9KQogICAgfSk7CiAgICB2YXIgZCA9IGF3YWl0IHIuanNvbigpOwoKICAgIGlmICghZC5zdWNjZXNzIHx8ICFkLnVybHMgfHwgIWQudXJscy5sZW5ndGgpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKGQuZXJyb3IgfHwgJ0dlZW4gVVJMcyBnZXZvbmRlbiBpbiBzaXRlbWFwJyk7CiAgICB9CgogICAgX3NpdGVtYXBVcmxzID0gZC51cmxzOwogICAgX3NpdGVtYXBGaWx0ZXJlZCA9IGQudXJscy5zbGljZSgpOwogICAgc3RhdHVzLmlubmVySFRNTCA9ICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj7inJMgJyArIGQudG90YWwgKyAnIFVSTHMgZ2V2b25kZW48L3NwYW4+JzsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwUHJldmlldycpLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOwogICAgcmVuZGVyU2l0ZW1hcExpc3QoX3NpdGVtYXBGaWx0ZXJlZCwgdHJ1ZSk7CiAgICB0b2FzdCgn4pyFICcgKyBkLnRvdGFsICsgJyBVUkxzIGxvYWRlZCBmcm9tIHNpdGVtYXAnKTsKCiAgfSBjYXRjaChlKSB7CiAgICBzdGF0dXMuaW5uZXJIVE1MID0gJzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1yZWQpIj7imqAgJyArIGUubWVzc2FnZSArICc8L3NwYW4+JzsKICAgIHRvYXN0KCfimqAgU2l0ZW1hcCBmZXRjaCBtaXNsdWt0OiAnICsgZS5tZXNzYWdlKTsKICB9CgogIGJ0bi50ZXh0Q29udGVudCA9ICfihpMgRmV0Y2ggU2l0ZW1hcCc7CiAgYnRuLmRpc2FibGVkID0gZmFsc2U7Cn0KCmZ1bmN0aW9uIGZpbHRlclNpdGVtYXBVcmxzKCkgewogIHZhciBxID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBGaWx0ZXInKS52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsKICBfc2l0ZW1hcEZpbHRlcmVkID0gcQogICAgPyBfc2l0ZW1hcFVybHMuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gdS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpOyB9KQogICAgOiBfc2l0ZW1hcFVybHMuc2xpY2UoKTsKCiAgLy8gUHJlc2VydmUgY2hlY2tlZCBzdGF0ZQogIHZhciBjaGVja2VkID0ge307CiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2InKS5mb3JFYWNoKGZ1bmN0aW9uKGNiKXsKICAgIGNoZWNrZWRbY2IuZGF0YXNldC51cmxdID0gY2IuY2hlY2tlZDsKICB9KTsKICByZW5kZXJTaXRlbWFwTGlzdChfc2l0ZW1hcEZpbHRlcmVkLCBmYWxzZSwgY2hlY2tlZCk7Cn0KCmZ1bmN0aW9uIHJlbmRlclNpdGVtYXBMaXN0KHVybHMsIHNlbGVjdEFsbCwgcHJlc2VydmVDaGVja2VkKSB7CiAgdmFyIGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFVybExpc3QnKTsKICB2YXIgc2VsQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFNlbENvdW50Jyk7CgogIGlmICghdXJscy5sZW5ndGgpIHsKICAgIGxpc3QuaW5uZXJIVE1MID0gJzxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtjb2xvcjp2YXIoLS1kaW0pO3BhZGRpbmc6OHB4OyI+R2VlbiBVUkxzIGdldm9uZGVuIHZvb3IgZGl0IGZpbHRlci48L2Rpdj4nOwogICAgc2VsQ291bnQudGV4dENvbnRlbnQgPSAnJzsKICAgIHJldHVybjsKICB9CgogIGxpc3QuaW5uZXJIVE1MID0gdXJscy5tYXAoZnVuY3Rpb24odSkgewogICAgdmFyIHNob3J0VXJsID0gdS5yZXBsYWNlKC9eaHR0cHM/OlwvXC9bXi9dKy8sICcnKSB8fCAnLyc7CiAgICB2YXIgaXNDaGVja2VkID0gcHJlc2VydmVDaGVja2VkID8gKHByZXNlcnZlQ2hlY2tlZFt1XSAhPT0gZmFsc2UpIDogKHNlbGVjdEFsbCAhPT0gZmFsc2UpOwogICAgLy8gU2tpcCBob21lcGFnZSwgWE1MLCBpbWFnZXMgYnkgZGVmYXVsdAogICAgdmFyIHNraXAgPSB1LmVuZHNXaXRoKCcueG1sJykgfHwgdS5lbmRzV2l0aCgnLmpwZycpIHx8IHUuZW5kc1dpdGgoJy5wbmcnKSB8fCB1LmVuZHNXaXRoKCcucGRmJyk7CiAgICBpZiAoc2tpcCkgaXNDaGVja2VkID0gZmFsc2U7CiAgICByZXR1cm4gJzxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjVweCA4cHg7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7IiBvbmNsaWNrPSJ0aGlzLnF1ZXJ5U2VsZWN0b3IoJnF1b3Q7aW5wdXQmcXVvdDspLmNsaWNrKCkiPicKICAgICAgKyAnPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0ic2l0ZW1hcC1jYiIgZGF0YS11cmw9IicrdSsnIicrKGlzQ2hlY2tlZD8nIGNoZWNrZWQnOicnKSsnIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3VwZGF0ZVNpdGVtYXBDb3VudCgpIiBzdHlsZT0id2lkdGg6MTNweDtoZWlnaHQ6MTNweDthY2NlbnQtY29sb3I6dmFyKC0tZ29sZCk7ZmxleC1zaHJpbms6MDsiPicKICAgICAgKyAnPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OlwnSUJNIFBsZXggTW9ub1wnLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtjb2xvcjp2YXIoLS1ibHVlKTtmbGV4OjE7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7d2hpdGUtc3BhY2U6bm93cmFwOyIgdGl0bGU9IicrdSsnIj4nK3Nob3J0VXJsKyc8L3NwYW4+JwogICAgICArICc8YnV0dG9uIG9uY2xpY2s9ImV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO3JlbW92ZVNpdGVtYXBVcmwoXCcnK3UrJ1wnKSIgc3R5bGU9ImJhY2tncm91bmQ6bm9uZTtib3JkZXI6bm9uZTtjb2xvcjp2YXIoLS1kaW0pO2N1cnNvcjpwb2ludGVyO2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6MCA0cHg7ZmxleC1zaHJpbms6MDsiIHRpdGxlPSJSZW1vdmUiPuKclTwvYnV0dG9uPicKICAgICAgKyAnPC9kaXY+JzsKICB9KS5qb2luKCcnKTsKCiAgdXBkYXRlU2l0ZW1hcENvdW50KCk7Cn0KCmZ1bmN0aW9uIHVwZGF0ZVNpdGVtYXBDb3VudCgpIHsKICB2YXIgYWxsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnNpdGVtYXAtY2InKTsKICB2YXIgY2hlY2tlZCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiOmNoZWNrZWQnKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFNlbENvdW50JykudGV4dENvbnRlbnQgPSBjaGVja2VkLmxlbmd0aCArICcvJyArIGFsbC5sZW5ndGggKyAnIHNlbGVjdGVkJzsKfQoKZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRTaXRlbWFwVXJscygpIHsKICB2YXIgc2VsZWN0ZWQgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiOmNoZWNrZWQnKSkubWFwKGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmRhdGFzZXQudXJsOyB9KTsKICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgeyB0b2FzdCgn4pqgIE5vIFVSTHMgc2VsZWN0ZWQnKTsgcmV0dXJuOyB9CiAgaWYgKCFjb25maXJtKCdEZWxldGUgJyArIHNlbGVjdGVkLmxlbmd0aCArICcgc2VsZWN0ZWQgVVJMcyBmcm9tIHRoZSBsaXN0PycpKSByZXR1cm47CiAgX3NpdGVtYXBVcmxzID0gX3NpdGVtYXBVcmxzLmZpbHRlcihmdW5jdGlvbih1KXsgcmV0dXJuICFzZWxlY3RlZC5pbmNsdWRlcyh1KTsgfSk7CiAgX3NpdGVtYXBGaWx0ZXJlZCA9IF9zaXRlbWFwRmlsdGVyZWQuZmlsdGVyKGZ1bmN0aW9uKHUpeyByZXR1cm4gIXNlbGVjdGVkLmluY2x1ZGVzKHUpOyB9KTsKICByZW5kZXJTaXRlbWFwTGlzdChfc2l0ZW1hcEZpbHRlcmVkLCBmYWxzZSk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBTdGF0dXMnKS5pbm5lckhUTUwgPSAnPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWdyZWVuKSI+4pyTICcgKyBfc2l0ZW1hcFVybHMubGVuZ3RoICsgJyBVUkxzIHJlbWFpbmluZzwvc3Bhbj4nOwogIHRvYXN0KCfwn5eRICcgKyBzZWxlY3RlZC5sZW5ndGggKyAnIFVSTHMgcmVtb3ZlZCcpOwogIGlmICghX3NpdGVtYXBVcmxzLmxlbmd0aCkgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBQcmV2aWV3Jykuc3R5bGUuZGlzcGxheSA9ICdub25lJzsKfQoKZnVuY3Rpb24gY2xlYXJBbGxTaXRlbWFwVXJscygpIHsKICBpZiAoIV9zaXRlbWFwVXJscy5sZW5ndGgpIHJldHVybjsKICBpZiAoIWNvbmZpcm0oJ0NsZWFyIGFsbCAnICsgX3NpdGVtYXBVcmxzLmxlbmd0aCArICcgVVJMcyBmcm9tIHRoZSBsaXN0PycpKSByZXR1cm47CiAgX3NpdGVtYXBVcmxzID0gW107IF9zaXRlbWFwRmlsdGVyZWQgPSBbXTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFByZXZpZXcnKS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwVXJsJykudmFsdWUgPSAnJzsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpLnRleHRDb250ZW50ID0gJyc7CiAgdG9hc3QoJ+KclSBTaXRlbWFwIGNsZWFyZWQnKTsKfQoKZnVuY3Rpb24gc2VsZWN0QWxsU2l0ZW1hcCgpIHsKICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuc2l0ZW1hcC1jYicpLmZvckVhY2goZnVuY3Rpb24oY2IpeyBjYi5jaGVja2VkID0gdHJ1ZTsgfSk7CiAgdXBkYXRlU2l0ZW1hcENvdW50KCk7Cn0KCmZ1bmN0aW9uIGRlc2VsZWN0QWxsU2l0ZW1hcCgpIHsKICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuc2l0ZW1hcC1jYicpLmZvckVhY2goZnVuY3Rpb24oY2IpeyBjYi5jaGVja2VkID0gZmFsc2U7IH0pOwogIHVwZGF0ZVNpdGVtYXBDb3VudCgpOwp9CgpmdW5jdGlvbiByZW1vdmVTaXRlbWFwVXJsKHVybCkgewogIF9zaXRlbWFwVXJscyA9IF9zaXRlbWFwVXJscy5maWx0ZXIoZnVuY3Rpb24odSl7IHJldHVybiB1ICE9PSB1cmw7IH0pOwogIF9zaXRlbWFwRmlsdGVyZWQgPSBfc2l0ZW1hcEZpbHRlcmVkLmZpbHRlcihmdW5jdGlvbih1KXsgcmV0dXJuIHUgIT09IHVybDsgfSk7CiAgdmFyIHByZXNlcnZlZCA9IHt9OwogIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiJykuZm9yRWFjaChmdW5jdGlvbihjYil7CiAgICBwcmVzZXJ2ZWRbY2IuZGF0YXNldC51cmxdID0gY2IuY2hlY2tlZDsKICB9KTsKICByZW5kZXJTaXRlbWFwTGlzdChfc2l0ZW1hcEZpbHRlcmVkLCBmYWxzZSwgcHJlc2VydmVkKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFN0YXR1cycpLmlubmVySFRNTCA9ICc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbXV0ZWQpIj4nICsgX3NpdGVtYXBVcmxzLmxlbmd0aCArICcgVVJMcyByZXN0ZXJlbmQ8L3NwYW4+JzsKfQoKZnVuY3Rpb24gYWRkU2VsZWN0ZWRTaXRlbWFwVXJscygpIHsKICB2YXIgc2VsZWN0ZWQgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaXRlbWFwLWNiOmNoZWNrZWQnKSkubWFwKGZ1bmN0aW9uKGNiKXsgcmV0dXJuIGNiLmRhdGFzZXQudXJsOyB9KTsKICBpZiAoIXNlbGVjdGVkLmxlbmd0aCkgeyB0b2FzdCgn4pqgIE5vIFVSTHMgc2VsZWN0ZWQnKTsgcmV0dXJuOyB9CiAgdmFyIGFkZGVkID0gMDsKICBzZWxlY3RlZC5mb3JFYWNoKGZ1bmN0aW9uKHVybCl7CiAgICB2YXIgZXhpc3RzID0gcGFnZXMuZmluZChmdW5jdGlvbihwKXsgcmV0dXJuIHAudXJsID09PSB1cmw7IH0pOwogICAgaWYgKCFleGlzdHMpIHsgcGFnZXMucHVzaChtYWtlUGFnZSh1cmwsJycsJ21lZCcsMCwwKSk7IGFkZGVkKys7IH0KICB9KTsKICBzYXZlKCk7IHJlbmRlclBhZ2VzKCk7IHJlbmRlck92ZXJ2aWV3KCk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpdGVtYXBQcmV2aWV3Jykuc3R5bGUuZGlzcGxheSA9ICdub25lJzsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2l0ZW1hcFVybCcpLnZhbHVlID0gJyc7CiAgX3NpdGVtYXBVcmxzID0gW107CiAgX3NpdGVtYXBGaWx0ZXJlZCA9IFtdOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaXRlbWFwU3RhdHVzJykudGV4dENvbnRlbnQgPSAnJzsKICB0b2FzdCgn4pyFICcgKyBhZGRlZCArICcgcGFnZXMgYWRkZWQgKCcgKyAoc2VsZWN0ZWQubGVuZ3RoIC0gYWRkZWQpICsgJyBhbHJlYWR5IHByZXNlbnQpJyk7Cn0KCi8vIOKUgOKUgCBTZXJ2ZXIgc3luYyArIGF1dG8tc2F2ZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKdmFyIF9hdXRvU2F2ZVRpbWVyID0gbnVsbDsKdmFyIF9sYXN0U2F2ZWRIYXNoID0gJyc7CgpmdW5jdGlvbiBfZGF0YUhhc2goKXsKICAvLyBTaW1wbGUgaGFzaCB0byBkZXRlY3QgY2hhbmdlcwogIHJldHVybiBwYWdlcy5sZW5ndGggKyAnXycgKyAocGFnZXNbMF0/LnVwZGF0ZWR8fCcnKSArICdfJyArIChwYWdlc1twYWdlcy5sZW5ndGgtMV0/LnVwZGF0ZWR8fCcnKTsKfQoKYXN5bmMgZnVuY3Rpb24gc3luY1RvU2VydmVyKHNpbGVudCl7CiAgaWYoIXBhZ2VzLmxlbmd0aCkgcmV0dXJuOwogIHZhciBidG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3luY0J0bicpOwogIGlmKGJ0biAmJiAhc2lsZW50KXsgYnRuLnRleHRDb250ZW50PSfimIEgU2F2aW5nLi4uJzsgYnRuLmRpc2FibGVkPXRydWU7IH0KCiAgdmFyIGtleSA9IChwcm9qZWN0LmNsaWVudHx8J2RlZmF1bHQnKS5yZXBsYWNlKC9ccysvZywnLScpLnRvTG93ZXJDYXNlKCkKICAgICsgJy0nICsgKHByb2plY3Quc2l0ZXx8JycpLnJlcGxhY2UoL2h0dHBzPzpcL1wvLywnJykuc3BsaXQoJy8nKVswXS5yZXBsYWNlKC9ccysvZywnLScpOwogIGlmKCFrZXkgfHwga2V5ID09PSAnLScpIGtleSA9ICd3b3JrZmxvdy0nICsgRGF0ZS5ub3coKTsKCiAgdmFyIHBheWxvYWQgPSB7IGtleSwgcHJvamVjdCwgcGFnZXMsIHNhdmVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9OwoKICB0cnkgewogICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3dvcmtmbG93L3NhdmUnLCB7CiAgICAgIG1ldGhvZDogJ1BPU1QnLAogICAgICBoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nfSwKICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkKICAgIH0pOwogICAgdmFyIGQgPSBhd2FpdCByLmpzb24oKTsKICAgIGlmKGQuc3VjY2Vzcyl7CiAgICAgIF9sYXN0U2F2ZWRIYXNoID0gX2RhdGFIYXNoKCk7CiAgICAgIHZhciB0cyA9IG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCdubC1OTCcse2hvdXI6JzItZGlnaXQnLG1pbnV0ZTonMi1kaWdpdCd9KTsKICAgICAgc2V0U3luY1N0YXR1cygn4piBIE9wZ2VzbGFnZW4gb20gJyArIHRzICsgJyDigJQga2V5OiAnICsga2V5LCAndmFyKC0tZ3JlZW4pJyk7CiAgICAgIHRyeXsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NzX3dmX3N5bmNfa2V5Jywga2V5KTsgfWNhdGNoKGUpe30KICAgICAgaWYoIXNpbGVudCkgdG9hc3QoJ+KYgSBPcGdlc2xhZ2VuIG9wIHNlcnZlcicpOwogICAgfSBlbHNlIHsKICAgICAgc2V0U3luY1N0YXR1cygn4pqgIFNlcnZlciBzYXZlIG1pc2x1a3Qg4oCUIGRhdGEgc3RhYXQgaW4gYnJvd3NlcicsICd2YXIoLS1nb2xkKScpOwogICAgfQogIH0gY2F0Y2goZSkgewogICAgc2V0U3luY1N0YXR1cygn4pqgIFNlcnZlciBuaWV0IGJlcmVpa2JhYXIg4oCUIGRhdGEgc3RhYXQgaW4gYnJvd3NlcicsICd2YXIoLS1nb2xkKScpOwogICAgaWYoIXNpbGVudCkgdG9hc3QoJ+KaoCBTZXJ2ZXIgb2ZmbGluZSDigJQgYnJvd3NlciBiYWNrdXAgYWN0aWVmJyk7CiAgfQogIGlmKGJ0biAmJiAhc2lsZW50KXsgYnRuLnRleHRDb250ZW50PSfimIEgU2F2ZSB0byBTZXJ2ZXInOyBidG4uZGlzYWJsZWQ9ZmFsc2U7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZEZyb21TZXJ2ZXIoKXsKICB2YXIga2V5ID0gcHJvbXB0KCdQcm9qZWN0IGtleSAobGVlZyA9IGxhYXRzdGUgb3BnZXNsYWdlbik6Jyk7CiAgaWYoa2V5ID09PSBudWxsKSByZXR1cm47CiAgaWYoIWtleSl7CiAgICB0cnl7IGtleSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjc193Zl9zeW5jX2tleScpfHwnJzsgfWNhdGNoKGUpe30KICB9CiAgaWYoIWtleSl7IHRvYXN0KCfimqAgR2VlbiBrZXkgZ2V2b25kZW4nKTsgcmV0dXJuOyB9CiAgdHJ5IHsKICAgIHZhciByID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBwLmNvbnRlbnRzY2FsZS5zaXRlL2FwaS93b3JrZmxvdy9sb2FkP2tleT0nK2VuY29kZVVSSUNvbXBvbmVudChrZXkpKTsKICAgIHZhciBkID0gYXdhaXQgci5qc29uKCk7CiAgICBpZihkLnN1Y2Nlc3MgJiYgZC5kYXRhKXsKICAgICAgaWYoIWNvbmZpcm0oJ1dvcmtmbG93ICInK2tleSsnIiBsYWRlbj8gVmVydmFuZ3QgaHVpZGlnZSBkYXRhLicpKSByZXR1cm47CiAgICAgIGlmKGQuZGF0YS5wcm9qZWN0KSBwcm9qZWN0ID0gZC5kYXRhLnByb2plY3Q7CiAgICAgIGlmKGQuZGF0YS5wYWdlcykgICBwYWdlcyAgID0gZC5kYXRhLnBhZ2VzOwogICAgICBpZihwcm9qZWN0LmNsaWVudCkgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncENsaWVudCcpLnZhbHVlICAgPSBwcm9qZWN0LmNsaWVudDsKICAgICAgaWYocHJvamVjdC5zaXRlKSAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BTaXRlJykudmFsdWUgICAgID0gcHJvamVjdC5zaXRlOwogICAgICBpZihwcm9qZWN0LmRlYWRsaW5lKSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncERlYWRsaW5lJykudmFsdWUgPSBwcm9qZWN0LmRlYWRsaW5lOwogICAgICBpZihwcm9qZWN0LmF1ZGl0b3IpICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncEF1ZGl0b3InKS52YWx1ZSAgPSBwcm9qZWN0LmF1ZGl0b3I7CiAgICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsgcmVuZGVyT3ZlcnZpZXcoKTsKICAgICAgdmFyIHRzID0gbmV3IERhdGUoZC5kYXRhLnNhdmVkQXR8fERhdGUubm93KCkpLnRvTG9jYWxlU3RyaW5nKCdubC1OTCcpOwogICAgICBzZXRTeW5jU3RhdHVzKCfimIEgR2VsYWRlbiB2YW4gc2VydmVyIChvcGdlc2xhZ2VuOiAnK3RzKycpJywgJ3ZhcigtLWdyZWVuKScpOwogICAgICB0b2FzdCgn4pyFICcrcGFnZXMubGVuZ3RoKycgcGFnZXMgbG9hZGVkIGZyb20gc2VydmVyJyk7CiAgICB9IGVsc2UgewogICAgICB0b2FzdCgn4pqgIE5pZXQgZ2V2b25kZW46ICcra2V5KTsKICAgIH0KICB9IGNhdGNoKGUpeyB0b2FzdCgn4pqgIFNlcnZlciBuaWV0IGJlcmVpa2JhYXInKTsgfQp9CgpmdW5jdGlvbiBzZXRTeW5jU3RhdHVzKG1zZywgY29sb3IpewogIHZhciBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzeW5jU3RhdHVzJyk7CiAgaWYoZWwpeyBlbC50ZXh0Q29udGVudD1tc2c7IGVsLnN0eWxlLmNvbG9yPWNvbG9yfHwndmFyKC0tZGltKSc7IH0KfQoKCi8vIOKUgOKUgCBDb250ZW50U2NvcmUgc2NhbiBwZXIgcGFnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKYXN5bmMgZnVuY3Rpb24gc2Nhbk9uZVBhZ2UocGFnZUlkKSB7CiAgdmFyIHAgPSBwYWdlcy5maW5kKGZ1bmN0aW9uKHBnKXsgcmV0dXJuIHBnLmlkID09PSBwYWdlSWQ7IH0pOwogIGlmICghcCkgcmV0dXJuOwogIHZhciBidG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbb25jbGljaz0ic2Nhbk9uZVBhZ2UoXCcnICsgcGFnZUlkICsgJ1wnKSJdJyk7CiAgaWYgKGJ0bikgeyBidG4udGV4dENvbnRlbnQgPSAn4o+zJzsgYnRuLmRpc2FibGVkID0gdHJ1ZTsgfQoKICB0cnkgewogICAgdmFyIHIgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcHAuY29udGVudHNjYWxlLnNpdGUvYXBpL3NjYW4nLCB7CiAgICAgIG1ldGhvZDogJ1BPU1QnLAogICAgICBoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nfSwKICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe3VybDogcC51cmx9KQogICAgfSk7CiAgICB2YXIgZCA9IGF3YWl0IHIuanNvbigpOwogICAgaWYgKGQuc2NvcmUpIHsKICAgICAgaWYgKCFwLnNjb3JlQmVmb3JlKSB7CiAgICAgICAgcC5zY29yZUJlZm9yZSA9IGQuc2NvcmU7CiAgICAgICAgdG9hc3QoJ+KchSBQcmUtc2NhbjogJyArIGQuc2NvcmUgKyAnLzEwMCDigJQgJyArIHAudXJsLnNwbGl0KCcvJykucG9wKCkpOwogICAgICB9IGVsc2UgewogICAgICAgIHAuc2NvcmVBZnRlciA9IGQuc2NvcmU7CiAgICAgICAgdG9hc3QoJ+KchSBOYS1zY2FuOiAnICsgZC5zY29yZSArICcvMTAwIOKAlCB2ZXJzY2hpbDogJyArIChkLnNjb3JlIC0gcC5zY29yZUJlZm9yZSkpOwogICAgICB9CiAgICAgIHNhdmUoKTsgcmVuZGVyUGFnZXMoKTsKICAgIH0gZWxzZSB7CiAgICAgIHRvYXN0KCfimqAgU2NhbiBtaXNsdWt0OiAnICsgKGQuZXJyb3IgfHwgJ29uYmVrZW5kZSBmb3V0JykpOwogICAgfQogIH0gY2F0Y2goZSkgewogICAgdG9hc3QoJ+KaoCBTZXJ2ZXIgbmlldCBiZXJlaWtiYWFyOiAnICsgZS5tZXNzYWdlKTsKICB9CiAgaWYgKGJ0bikgeyBidG4udGV4dENvbnRlbnQgPSAn8J+TiiBTY2FuIFNjb3JlJzsgYnRuLmRpc2FibGVkID0gZmFsc2U7IH0KfQoKLy8g4pSA4pSAIFNjYW4gYWxsZSBwYWdpbmFzIHpvbmRlciBzY29yZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKdmFyIF9zY2FuUXVldWUgPSBbXTsKdmFyIF9zY2FuUnVubmluZyA9IGZhbHNlOwoKYXN5bmMgZnVuY3Rpb24gc2NhbkFsbFNjb3JlcygpIHsKICB2YXIgdW5zY29yZWQgPSBwYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7IHJldHVybiAhcC5zY29yZUJlZm9yZSAmJiBwLnVybDsgfSk7CiAgdmFyIGFsbCA9IHBhZ2VzLmZpbHRlcihmdW5jdGlvbihwKXsgcmV0dXJuIHAudXJsOyB9KTsKICAvLyBJZiBhbGwgaGF2ZSBzY29yZXMsIGFzayBpZiB0aGV5IHdhbnQgdG8gcmVzY2FuCiAgaWYgKCF1bnNjb3JlZC5sZW5ndGggJiYgYWxsLmxlbmd0aCkgewogICAgaWYgKCFjb25maXJtKCdBbGwgcGFnZXMgYWxyZWFkeSBoYXZlIGEgc2NvcmUuIFJlLXNjYW4gYWxsICcgKyBhbGwubGVuZ3RoICsgJyBwYWdlcz8nKSkgcmV0dXJuOwogICAgdW5zY29yZWQgPSBhbGw7IC8vIHJlc2NhbiBhbGwKICB9CiAgaWYgKCF1bnNjb3JlZC5sZW5ndGgpIHsgdG9hc3QoJ05vIHBhZ2VzIHdpdGggVVJMcyBmb3VuZCcpOyByZXR1cm47IH0KICBpZiAoX3NjYW5SdW5uaW5nKSB7IHRvYXN0KCfij7MgU2NhbiBhbHJlYWR5IHJ1bm5pbmcuLi4nKTsgcmV0dXJuOyB9CiAgX3NjYW5RdWV1ZSA9IHVuc2NvcmVkLnNsaWNlKCk7CiAgX3NjYW5SdW5uaW5nID0gdHJ1ZTsKICB0b2FzdCgn4o+zIFNjYW5uaW5nICcgKyBfc2NhblF1ZXVlLmxlbmd0aCArICcgcGFnZXMuLi4nKTsKICBzZXRTeW5jU3RhdHVzKCfij7MgQXV0by1zY2FuIHJ1bm5pbmc6IDAvJyArIF9zY2FuUXVldWUubGVuZ3RoICsgJyBwYWdlcycsICd2YXIoLS1nb2xkKScpOwoKICB2YXIgZG9uZSA9IDA7CiAgZm9yICh2YXIgaSA9IDA7IGkgPCBfc2NhblF1ZXVlLmxlbmd0aDsgaSsrKSB7CiAgICB2YXIgcCA9IF9zY2FuUXVldWVbaV07CiAgICB0cnkgewogICAgICB2YXIgciA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwcC5jb250ZW50c2NhbGUuc2l0ZS9hcGkvc2NhbicsIHsKICAgICAgICBtZXRob2Q6ICdQT1NUJywKICAgICAgICBoZWFkZXJzOiB7J0NvbnRlbnQtVHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nfSwKICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7dXJsOiBwLnVybH0pCiAgICAgIH0pOwogICAgICB2YXIgZCA9IGF3YWl0IHIuanNvbigpOwogICAgICBpZiAoZC5zY29yZSkgeyBwLnNjb3JlQmVmb3JlID0gZC5zY29yZTsgZG9uZSsrOyB9CiAgICB9IGNhdGNoKGUpIHt9CiAgICBzZXRTeW5jU3RhdHVzKCfij7MgU2Nhbm5pbmcgJyArIChpKzEpICsgJy8nICsgX3NjYW5RdWV1ZS5sZW5ndGggKyAnIOKAlCAnICsgZG9uZSArICcgc2NvcmVzIGZvdW5kJywgJ3ZhcigtLWdvbGQpJyk7CiAgICBzYXZlKCk7CiAgICBhd2FpdCBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXMpeyBzZXRUaW1lb3V0KHJlcywgMjAwMCk7IH0pOyAvLyAycyBiZXR3ZWVuIHNjYW5zCiAgfQoKICBfc2NhblJ1bm5pbmcgPSBmYWxzZTsKICByZW5kZXJQYWdlcygpOyByZW5kZXJPdmVydmlldygpOwogIHNldFN5bmNTdGF0dXMoJ+KchSBBdXRvLXNjYW4gY29tcGxldGUg4oCUICcgKyBkb25lICsgJyBzY29yZXMgbG9hZGVkJywgJ3ZhcigtLWdyZWVuKScpOwogIHRvYXN0KCfinIUgJyArIGRvbmUgKyAnLycgKyBfc2NhblF1ZXVlLmxlbmd0aCArICcgcGFnZXMgc2Nhbm5lZCcpOwp9CgpmdW5jdGlvbiBzdGFydEF1dG9TYXZlKCl7CiAgaWYoX2F1dG9TYXZlVGltZXIpIGNsZWFySW50ZXJ2YWwoX2F1dG9TYXZlVGltZXIpOwogIC8vIEF1dG8tc2F2ZSBldmVyeSAzIG1pbnV0ZXMgSUYgZGF0YSBoYXMgY2hhbmdlZAogIF9hdXRvU2F2ZVRpbWVyID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXsKICAgIGlmKHBhZ2VzLmxlbmd0aCA+IDAgJiYgX2RhdGFIYXNoKCkgIT09IF9sYXN0U2F2ZWRIYXNoKXsKICAgICAgc3luY1RvU2VydmVyKHRydWUpOyAvLyBzaWxlbnQgPSBubyB0b2FzdAogICAgfQogIH0sIDMgKiA2MCAqIDEwMDApOwogIC8vIEFsc28gc2F2ZSBvbiBwYWdlIHVubG9hZAogIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBmdW5jdGlvbigpewogICAgaWYocGFnZXMubGVuZ3RoID4gMCAmJiBfZGF0YUhhc2goKSAhPT0gX2xhc3RTYXZlZEhhc2gpewogICAgICBzeW5jVG9TZXJ2ZXIodHJ1ZSk7CiAgICB9CiAgfSk7Cn0KCi8vIOKUgOKUgCBJbml0IOKUgOKUgApsb2FkKCk7CnJlbmRlclBhZ2VzKCk7CnJlbmRlck92ZXJ2aWV3KCk7CnN0YXJ0QXV0b1NhdmUoKTsKaWYocGFnZXMubGVuZ3RoPjApIHNldFN5bmNTdGF0dXMoJ0RhdGEgaW4gYnJvd3NlciDigJQgY2xpY2sg4piBIFNhdmUgdG8gU2VydmVyIHRvIGJhY2t1cCcsICd2YXIoLS1kaW0pJyk7Cjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K", "base64").toString("utf8"));
});
app.get('/audit-recommendations', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Buffer.from("PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9IlVURi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgo8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgsbm9mb2xsb3csbm9hcmNoaXZlIj4KPHRpdGxlPlNFTyBSZWNvbW1lbmRhdGlvbnMgfCBDb250ZW50U2NhbGU8L3RpdGxlPgo8bGluayBocmVmPSJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2NzczI/ZmFtaWx5PUJlYmFzK05ldWUmZmFtaWx5PURNK1NhbnM6d2dodEAzMDA7NDAwOzUwMDs3MDAmZmFtaWx5PUlCTStQbGV4K01vbm86d2dodEA0MDA7NzAwJmRpc3BsYXk9c3dhcCIgcmVsPSJzdHlsZXNoZWV0Ij4KPHN0eWxlPgoqLCo6OmJlZm9yZSwqOjphZnRlcntib3gtc2l6aW5nOmJvcmRlci1ib3g7bWFyZ2luOjA7cGFkZGluZzowfQo6cm9vdHsKICAtLWJnOiMwMzA3MTI7LS1jYXJkOiMwZjE3MmE7LS1zdXJmYWNlOiMxZTI5M2I7LS1ib3JkZXI6IzMzNDE1NTsKICAtLWluazojZjlmYWZiOy0tbXV0ZWQ6Izk0YTNiODstLXN1YjojNjQ3NDhiOy0tZGltOiM0NzU1Njk7CiAgLS1wdXJwbGU6I2E3OGJmYTstLWJsdWU6IzYwYTVmYTstLWdyZWVuOiM0YWRlODA7CiAgLS1nb2xkOiNmYmJmMjQ7LS1yZWQ6I2Y0M2YzZjstLW9yYW5nZTojZmI5MjNjOwp9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTonRE0gU2Fucycsc2Fucy1zZXJpZjttaW4taGVpZ2h0OjEwMHZoO30KLndyYXB7bWF4LXdpZHRoOjExMDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmc6MCAyMHB4IDgwcHg7fQoKLnRvcGJhcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6MTZweCAwO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7bWFyZ2luLWJvdHRvbToyNHB4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O30KLmJyYW5ke2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wNmVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLCNhNzhiZmEsIzYwYTVmYSk7LXdlYmtpdC1iYWNrZ3JvdW5kLWNsaXA6dGV4dDstd2Via2l0LXRleHQtZmlsbC1jb2xvcjp0cmFuc3BhcmVudDtiYWNrZ3JvdW5kLWNsaXA6dGV4dDt0ZXh0LWRlY29yYXRpb246bm9uZTt9Ci50b29sLXRpdGxle2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wNGVtO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLHZhcigtLWdvbGQpLHZhcigtLW9yYW5nZSkpOy13ZWJraXQtYmFja2dyb3VuZC1jbGlwOnRleHQ7LXdlYmtpdC10ZXh0LWZpbGwtY29sb3I6dHJhbnNwYXJlbnQ7YmFja2dyb3VuZC1jbGlwOnRleHQ7fQouYnRue2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo3cHggMTRweDtib3JkZXItcmFkaXVzOjVweDtjdXJzb3I6cG9pbnRlcjtib3JkZXI6MXB4IHNvbGlkO3RyYW5zaXRpb246YWxsIC4xNXM7d2hpdGUtc3BhY2U6bm93cmFwO2JhY2tncm91bmQ6bm9uZTt0ZXh0LWRlY29yYXRpb246bm9uZTtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O30KLmJ0bi1tdXRlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlci1jb2xvcjp2YXIoLS1ib3JkZXIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5idG4tbXV0ZWQ6aG92ZXJ7Y29sb3I6dmFyKC0taW5rKTt9CgovKiBTdW1tYXJ5IGJhciAqLwouc3VtbWFyeXtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg0LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToyNHB4O30KQG1lZGlhKG1heC13aWR0aDo2MDBweCl7LnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnI7fX0KLnN1bS1jYXJke2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTRweCAxNnB4O3RleHQtYWxpZ246Y2VudGVyO30KLnN1bS1ue2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZTozNHB4O2xpbmUtaGVpZ2h0OjE7bWFyZ2luLWJvdHRvbTozcHg7fQouc3VtLWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7fQoKLyogRmlsdGVyICovCi5maWx0ZXItYmFye2Rpc3BsYXk6ZmxleDtnYXA6OHB4O21hcmdpbi1ib3R0b206MThweDtmbGV4LXdyYXA6d3JhcDt9Ci5maWx0ZXItYmFyIHNlbGVjdHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjVweDtwYWRkaW5nOjdweCAxMXB4O2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDZlbTtjb2xvcjp2YXIoLS1tdXRlZCk7b3V0bGluZTpub25lO2N1cnNvcjpwb2ludGVyO30KLmZpbHRlci1iYXIgc2VsZWN0OmZvY3Vze2JvcmRlci1jb2xvcjp2YXIoLS1nb2xkKTtjb2xvcjp2YXIoLS1pbmspO30KCi8qIFJlY29tbWVuZGF0aW9uIGNhcmRzICovCi5yZWMtbGlzdHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoxMnB4O30KCi5yZWMtY2FyZHtib3JkZXItcmFkaXVzOjEycHg7b3ZlcmZsb3c6aGlkZGVuO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Ci5yZWMtY2FyZC50eXBlLXF1aWNrd2lue2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1ncmVlbik7fQoucmVjLWNhcmQudHlwZS1jdHJ7Ym9yZGVyLWxlZnQ6NHB4IHNvbGlkIHZhcigtLWJsdWUpO30KLnJlYy1jYXJkLnR5cGUtY29udGVudHtib3JkZXItbGVmdDo0cHggc29saWQgdmFyKC0tZ29sZCk7fQoucmVjLWNhcmQudHlwZS1yZXdyaXRle2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1vcmFuZ2UpO30KLnJlYy1jYXJkLnR5cGUtYXV0aG9yaXR5e2JvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1wdXJwbGUpO30KLnJlYy1jYXJkLnR5cGUtYnVpbGR7Ym9yZGVyLWxlZnQ6NHB4IHNvbGlkIHZhcigtLWRpbSk7fQoKLnJlYy1oZWFke2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7cGFkZGluZzoxNnB4IDIwcHg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7fQoucmVjLWJhZGdle2ZsZXgtc2hyaW5rOjA7cGFkZGluZzo0cHggMTBweDtib3JkZXItcmFkaXVzOjVweDtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Zm9udC13ZWlnaHQ6NzAwO3doaXRlLXNwYWNlOm5vd3JhcDttYXJnaW4tdG9wOjJweDt9Ci5iYWRnZS1xdWlja3dpbntiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMTUpO2NvbG9yOnZhcigtLWdyZWVuKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoNzQsMjIyLDEyOCwuMyk7fQouYmFkZ2UtY3Rye2JhY2tncm91bmQ6cmdiYSg5NiwxNjUsMjUwLC4xNSk7Y29sb3I6dmFyKC0tYmx1ZSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDk2LDE2NSwyNTAsLjMpO30KLmJhZGdlLWNvbnRlbnR7YmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtjb2xvcjp2YXIoLS1nb2xkKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMyk7fQouYmFkZ2UtcmV3cml0ZXtiYWNrZ3JvdW5kOnJnYmEoMjUxLDE0Niw2MCwuMTUpO2NvbG9yOnZhcigtLW9yYW5nZSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1MSwxNDYsNjAsLjMpO30KLmJhZGdlLWF1dGhvcml0eXtiYWNrZ3JvdW5kOnJnYmEoMTY3LDEzOSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1wdXJwbGUpO2JvcmRlcjoxcHggc29saWQgcmdiYSgxNjcsMTM5LDI1MCwuMyk7fQouYmFkZ2UtYnVpbGR7YmFja2dyb3VuZDpyZ2JhKDcxLDg1LDEwNSwuMTUpO2NvbG9yOnZhcigtLWRpbSk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDcxLDg1LDEwNSwuMyk7fQoKLnJlYy1tYWlue2ZsZXg6MTttaW4td2lkdGg6MjAwcHg7fQoucmVjLXVybHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWJsdWUpO21hcmdpbi1ib3R0b206NXB4O3dvcmQtYnJlYWs6YnJlYWstYWxsO30KLnJlYy1rd3tmb250LXNpemU6MTFweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLWJvdHRvbTo4cHg7fQoucmVjLXRpdGxle2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wM2VtO2NvbG9yOnZhcigtLWluayk7bWFyZ2luLWJvdHRvbTo1cHg7fQoucmVjLXdoeXtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7bGluZS1oZWlnaHQ6MS42O21hcmdpbi1ib3R0b206OHB4O30KLnJlYy1hY3Rpb257Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOnZhcigtLWluayk7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7Z2FwOjZweDt9Ci5yZWMtYWN0aW9uOjpiZWZvcmV7Y29udGVudDon4oaSJztjb2xvcjp2YXIoLS1nb2xkKTtmbGV4LXNocmluazowO30KCi5yZWMtbWV0YXtkaXNwbGF5OmZsZXg7Z2FwOjhweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tdG9wOjEwcHg7fQoubWV0YS1jaGlwe2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDZlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzozcHggOHB4O2JvcmRlci1yYWRpdXM6NHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtjb2xvcjp2YXIoLS1kaW0pO30KLm1ldGEtY2hpcCBzdHJvbmd7Y29sb3I6dmFyKC0tbXV0ZWQpO30KCi8qIFByZS1maWxsZWQgaW5mbyAqLwoucHJlZmlsbC1ib3h7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjEycHggMTZweDttYXJnaW46MCAyMHB4IDAgMDttaW4td2lkdGg6MjAwcHg7bWF4LXdpZHRoOjI4MHB4O2ZsZXgtc2hyaW5rOjA7fQpAbWVkaWEobWF4LXdpZHRoOjcwMHB4KXsucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7bWFyZ2luOjA7fX0KLnByZWZpbGwtdGl0bGV7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xMmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1zdWIpO21hcmdpbi1ib3R0b206OHB4O30KLnByZWZpbGwtcm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjdweDtwYWRkaW5nOjRweCAwO2ZvbnQtc2l6ZToxMXB4O30KLnByZWZpbGwtcm93LmF1dG97Y29sb3I6dmFyKC0tZ3JlZW4pO30KLnByZWZpbGwtcm93Lm1hbnVhbHtjb2xvcjp2YXIoLS1kaW0pO30KLnByZWZpbGwtZG90e3dpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6NTAlO2ZsZXgtc2hyaW5rOjA7fQouZG90LWF1dG97YmFja2dyb3VuZDp2YXIoLS1ncmVlbik7fQouZG90LW1hbnVhbHtiYWNrZ3JvdW5kOnZhcigtLWRpbSk7fQoKLyogQWN0aW9uIGJ1dHRvbiAqLwoucmVjLWZvb3R7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wMik7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtwYWRkaW5nOjE0cHggMjBweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZsZXgtd3JhcDp3cmFwO30KLmFjdGlvbi1idG57Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjE4cHg7bGV0dGVyLXNwYWNpbmc6LjA0ZW07cGFkZGluZzoxMHB4IDI4cHg7Ym9yZGVyLXJhZGl1czo3cHg7Y3Vyc29yOnBvaW50ZXI7Ym9yZGVyOm5vbmU7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDt0ZXh0LWRlY29yYXRpb246bm9uZTt0cmFuc2l0aW9uOmFsbCAuMThzO30KLmFjdGlvbi1idG4tZ29sZHtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7fQouYWN0aW9uLWJ0bi1nb2xkOmhvdmVye2JhY2tncm91bmQ6I2U2YjAyMDt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMXB4KTt9Ci5hY3Rpb24tYnRuLWJsdWV7YmFja2dyb3VuZDpyZ2JhKDk2LDE2NSwyNTAsLjE1KTtjb2xvcjp2YXIoLS1ibHVlKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoOTYsMTY1LDI1MCwuMyk7fQouYWN0aW9uLWJ0bi1ibHVlOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYmx1ZSk7Y29sb3I6IzAwMDt9Ci50aW1lLWNoaXB7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo1cHg7fQoKLmVtcHR5e3RleHQtYWxpZ246Y2VudGVyO3BhZGRpbmc6NjBweCAyMHB4O2NvbG9yOnZhcigtLWRpbSk7fQouZW1wdHkgaDN7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjI2cHg7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjhweDt9CgoudG9hc3R7cG9zaXRpb246Zml4ZWQ7Ym90dG9tOjI4cHg7bGVmdDo1MCU7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgyMHB4KTtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7cGFkZGluZzo5cHggMjBweDtib3JkZXItcmFkaXVzOjUwcHg7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtmb250LXdlaWdodDo3MDA7b3BhY2l0eTowO3RyYW5zaXRpb246YWxsIC4zczt6LWluZGV4OjEwMDAwO3BvaW50ZXItZXZlbnRzOm5vbmU7fQoudG9hc3Quc2hvd3tvcGFjaXR5OjE7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSkgdHJhbnNsYXRlWSgwKTt9CgovKiDilIDilIAgTU9CSUxFIFJFU1BPTlNJVkUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmhpZGRlbjt9CmltZyx0YWJsZSxpZnJhbWV7bWF4LXdpZHRoOjEwMCU7fQpAbWVkaWEobWF4LXdpZHRoOjc2OHB4KXsKICAud3JhcHtwYWRkaW5nOjAgMTRweCA2MHB4IWltcG9ydGFudDt9CiAgLnRvcGJhcntwYWRkaW5nOjEycHggMDtnYXA6OHB4O30KICAudG9wYmFyLXJpZ2h0e2dhcDo1cHg7fQogIC5idG57Zm9udC1zaXplOjhweDtwYWRkaW5nOjZweCAxMHB4O30KICAub3ZlcnZpZXcsLnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcikhaW1wb3J0YW50O30KICAuYWRkLXJvd3tmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5hZGQtcm93IGlucHV0LC5hZGQtcm93IHNlbGVjdHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmZpbHRlci1iYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7fQogIC5maWx0ZXItYmFyIHNlbGVjdCwuZmlsdGVyLWJhciBpbnB1dHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmNhcmQtaGVhZHtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4O30KICAucmVjLWhlYWR7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7d2lkdGg6MTAwJTt9CiAgLmcyLC5nMywuZzQsLmNiLWdyaWQsLmNhcmQtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIWltcG9ydGFudDt9CiAgLnByb2plY3QtYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnBme21pbi13aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLnN0ZXBze2ZsZXgtZGlyZWN0aW9uOmNvbHVtbiFpbXBvcnRhbnQ7fQogIC5zdGVwe2JvcmRlci1yaWdodDpub25lIWltcG9ydGFudDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KICAuc3RlcDpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206bm9uZTt9CiAgLmhvdy1zdGVwe2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLmZsb3ctc3RlcHtnYXA6MTBweDt9CiAgLnJlYy1mb290e2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O30KICAuYWN0aW9uLWJ0bnt3aWR0aDoxMDAlO2p1c3RpZnktY29udGVudDpjZW50ZXI7Zm9udC1zaXplOjE2cHghaW1wb3J0YW50O30KICAubW9kZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5tb2RlLWJ0bntib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Cn0KQG1lZGlhKG1heC13aWR0aDo0ODBweCl7CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyIWltcG9ydGFudDt9CiAgLnRvcGJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1zdGFydDt9CiAgLnRvcGJhci1yaWdodHtmbGV4LXdyYXA6d3JhcDt9CiAgLmNhcmQtbWV0YXtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4O30KICAuY2FyZC1hY3Rpb25zLC5jYXJkLWFjdGlvbnMgLmJ0biwuY2FyZC1mb290e2ZsZXgtd3JhcDp3cmFwO30KICBoMSxoMiwudG9vbC1uYW1le3dvcmQtYnJlYWs6YnJlYWstd29yZDt9CiAgLnBhbmVse3BhZGRpbmc6MTZweCFpbXBvcnRhbnQ7fQogIC5zZWN0aW9ue3BhZGRpbmc6MTRweCAxNnB4IWltcG9ydGFudDt9Cn0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGRpdiBjbGFzcz0id3JhcCI+Cgo8ZGl2IGNsYXNzPSJ0b3BiYXIiPgogIDxhIGhyZWY9Imh0dHBzOi8vY29udGVudHNjYWxlLnNpdGUiIGNsYXNzPSJicmFuZCI+Q29udGVudFNjYWxlPC9hPgogIDxkaXYgY2xhc3M9InRvb2wtdGl0bGUiPlNFTyBSRUNPTU1FTkRBVElPTlMgRU5HSU5FPC9kaXY+CiAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDo4cHg7Ij4KICAgIDxhIGhyZWY9Ii9hdWRpdC13b3JrZmxvdyIgY2xhc3M9ImJ0biBidG4tbXV0ZWQiPuKGkCBXb3JrZmxvdyBNYW5hZ2VyPC9hPgogICAgPGEgaHJlZj0iL3Nlby1hdWRpdCIgY2xhc3M9ImJ0biBidG4tbXV0ZWQiPvCflKwgUFVMU0UrTkVYVVM8L2E+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLW11dGVkIiBvbmNsaWNrPSJsb2NhdGlvbi5yZWxvYWQoKSI+4oa6IFJlZnJlc2g8L2J1dHRvbj4KICA8L2Rpdj4KPC9kaXY+Cgo8IS0tIFN1bW1hcnkgLS0+CjxkaXYgY2xhc3M9InN1bW1hcnkiIGlkPSJzdW1tYXJ5Ij48L2Rpdj4KCjwhLS0gRmlsdGVycyAtLT4KPGRpdiBjbGFzcz0iZmlsdGVyLWJhciI+CiAgPHNlbGVjdCBpZD0iZlR5cGUiIG9uY2hhbmdlPSJyZW5kZXIoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCByZWNvbW1lbmRhdGlvbnM8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InF1aWNrd2luIj7imqEgUXVpY2sgV2luczwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iY3RyIj7wn5OIIENUUiBGaXg8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImNvbnRlbnQiPvCfk50gQ29udGVudCBVcGdyYWRlPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJyZXdyaXRlIj7inI/vuI8gUmV3cml0ZTwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iYXV0aG9yaXR5Ij7wn5SXIEF1dGhvcml0eTwvb3B0aW9uPgogIDwvc2VsZWN0PgogIDxzZWxlY3QgaWQ9ImZQcmkiIG9uY2hhbmdlPSJyZW5kZXIoKSI+CiAgICA8b3B0aW9uIHZhbHVlPSJhbGwiPkFsbCBwcmlvcml0aWVzPC9vcHRpb24+CiAgICA8b3B0aW9uIHZhbHVlPSJoaWdoIj7wn5S0IEhpZ2g8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9Im1lZCI+8J+foSBNZWRpdW08L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImxvdyI+8J+foiBMb3c8L29wdGlvbj4KICA8L3NlbGVjdD4KICA8c2VsZWN0IGlkPSJmU3RhdHVzIiBvbmNoYW5nZT0icmVuZGVyKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0iYWN0aXZlIj5Ob3QgZG9uZTwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iYWxsIj5BbGwgcGFnZXM8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9ImRvbmUiPkRvbmUgb25seTwvb3B0aW9uPgogIDwvc2VsZWN0PgogIDxzZWxlY3QgaWQ9ImZTb3J0IiBvbmNoYW5nZT0icmVuZGVyKCkiPgogICAgPG9wdGlvbiB2YWx1ZT0iaW1wYWN0Ij5Tb3J0OiBJbXBhY3Q8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InBvc2l0aW9uIj5Tb3J0OiBQb3NpdGlvbjwvb3B0aW9uPgogICAgPG9wdGlvbiB2YWx1ZT0iaW1wcmVzc2lvbnMiPlNvcnQ6IEltcHJlc3Npb25zPC9vcHRpb24+CiAgPC9zZWxlY3Q+CjwvZGl2PgoKPGRpdiBjbGFzcz0icmVjLWxpc3QiIGlkPSJyZWNMaXN0Ij48L2Rpdj4KPC9kaXY+CjxkaXYgY2xhc3M9InRvYXN0IiBpZD0idG9hc3QiPjwvZGl2PgoKPHNjcmlwdD4KdmFyIEFVRElUX1VSTCA9ICcvc2VvLWF1ZGl0JzsKdmFyIHBhZ2VzID0gW107CgpmdW5jdGlvbiB0b2FzdChtc2cpewogIHZhciB0PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b2FzdCcpOwogIHQudGV4dENvbnRlbnQ9bXNnO3QuY2xhc3NMaXN0LmFkZCgnc2hvdycpOwogIHNldFRpbWVvdXQoZnVuY3Rpb24oKXt0LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTt9LDI1MDApOwp9CgpmdW5jdGlvbiBsb2FkKCl7CiAgdHJ5eyB2YXIgcD1sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3Nfd2ZfcGFnZXMnKTsgaWYocCkgcGFnZXM9SlNPTi5wYXJzZShwKTsgfWNhdGNoKGUpe30KfQoKLy8g4pSA4pSAIFJlY29tbWVuZGF0aW9uIGVuZ2luZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKdmFyIFJFQ1MgPSB7CiAgcXVpY2t3aW46IHsKICAgIGxhYmVsOidRdWljayBXaW4nLCBiYWRnZUNsYXNzOidiYWRnZS1xdWlja3dpbicsIGNhcmRDbGFzczondHlwZS1xdWlja3dpbicsCiAgICB0aXRsZTonVGl0bGUgJiBNZXRhIOKAlCAzMCBNaW51dGUgV2luJywKICAgIGljb246J+KaoScsCiAgfSwKICBjdHI6IHsKICAgIGxhYmVsOidDVFIgRml4JywgYmFkZ2VDbGFzczonYmFkZ2UtY3RyJywgY2FyZENsYXNzOid0eXBlLWN0cicsCiAgICB0aXRsZTonQ1RSIFN1cmdlcnkgTmVlZGVkJywKICAgIGljb246J/Cfk4gnLAogIH0sCiAgY29udGVudDogewogICAgbGFiZWw6J0NvbnRlbnQgVXBncmFkZScsIGJhZGdlQ2xhc3M6J2JhZGdlLWNvbnRlbnQnLCBjYXJkQ2xhc3M6J3R5cGUtY29udGVudCcsCiAgICB0aXRsZTonQ29udGVudCBVcGdyYWRlIOKAlCBGdWxsIEF1ZGl0JywKICAgIGljb246J/Cfk50nLAogIH0sCiAgcmV3cml0ZTogewogICAgbGFiZWw6J1Jld3JpdGUgKyBBdWRpdCcsIGJhZGdlQ2xhc3M6J2JhZGdlLXJld3JpdGUnLCBjYXJkQ2xhc3M6J3R5cGUtcmV3cml0ZScsCiAgICB0aXRsZTonUGFnZSBSZXdyaXRlIFJlcXVpcmVkJywKICAgIGljb246J+Kcj++4jycsCiAgfSwKICBhdXRob3JpdHk6IHsKICAgIGxhYmVsOidBdXRob3JpdHkgR2FwJywgYmFkZ2VDbGFzczonYmFkZ2UtYXV0aG9yaXR5JywgY2FyZENsYXNzOid0eXBlLWF1dGhvcml0eScsCiAgICB0aXRsZTonQ29udGVudCBHb29kIOKAlCBCdWlsZCBBdXRob3JpdHknLAogICAgaWNvbjon8J+UlycsCiAgfSwKICBidWlsZDogewogICAgbGFiZWw6J0J1aWxkIENvbnRlbnQnLCBiYWRnZUNsYXNzOidiYWRnZS1idWlsZCcsIGNhcmRDbGFzczondHlwZS1idWlsZCcsCiAgICB0aXRsZTonQ29udGVudCBOZWVkcyBCdWlsZGluZyBGaXJzdCcsCiAgICBpY29uOifwn4+X77iPJywKICB9LAp9OwoKZnVuY3Rpb24gZ2V0UmVjb21tZW5kYXRpb24ocCl7CiAgdmFyIHBvcyAgID0gcC5wb3NpdGlvbiAgIHx8IDA7CiAgdmFyIGN0ciAgID0gcGFyc2VGbG9hdChwLmN0cikgfHwgMDsKICB2YXIgaW1wciAgPSBwLmltcHJlc3Npb25zIHx8IDA7CiAgdmFyIHNjb3JlID0gcGFyc2VGbG9hdChwLnNjb3JlQmVmb3JlKSB8fCAwOwogIHZhciBoYXNTY29yZSA9IHAuc2NvcmVCZWZvcmUgIT09ICcnICYmIHAuc2NvcmVCZWZvcmUgIT09IHVuZGVmaW5lZDsKCiAgLy8g4pSA4pSAIFNDRU5BUklPIDE6IFBhZ2UgMSBidXQgbG93IENUUiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBpZihwb3M+PTEgJiYgcG9zPD0xMCAmJiBjdHI8Mil7CiAgICByZXR1cm4gewogICAgICB0eXBlOidxdWlja3dpbicsCiAgICAgIGltcGFjdFNjb3JlOiA5NSwKICAgICAgd2h5OiAnSmUgc3RhYXQgb3AgcGFnaW5hIDEgKHBvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJykgbWFhciBDVFIgaXMgc2xlY2h0cyAnK2N0ci50b0ZpeGVkKDEpKyclLiAnCiAgICAgICAgICArJ1NlYXJjaGVycyB6aWVuIGplIG1hYXIga2xpa2tlbiBuaWV0LiBEZSB0aXRsZSBvZiBtZXRhIGRlc2NyaXB0aW9uIHRyZWt0IG5pZXQgZ2Vub2VnIGFhbi4nLAogICAgICBhY3Rpb246ICdIZXJzY2hyaWpmIGRlIHRpdGxlIHRhZyAo4omkNjAgY2hhcnMpIGVuIG1ldGEgZGVzY3JpcHRpb24gKOKJpDE1NSBjaGFycykuICcKICAgICAgICAgICAgICsnVm9lZyBlZW4gZ2V0YWwsIHBvd2VyIHdvcmQgb2YgdXJnZW50aWUtdHJpZ2dlciB0b2UuJywKICAgICAgYXVkaXRGb2N1czogJ0NUUiBTdXJnZXJ5IOKAlCBTdGFwIDIgaW4gUFVMU0UrTkVYVVMnLAogICAgICB0aW1lOiAnMzAgbWluJywKICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKHZvb3Igd2Vya2VsaWprZSB0aXRsZSknLCdDb21wZXRpdG9yIEhUTUwnXSwKICAgICAgcXVpY2tXaW46ICB0cnVlLAogICAgfTsKICB9CgogIC8vIOKUgOKUgCBTQ0VOQVJJTyAyOiBQYWdlIDEsIENUUiBvayDigJQgYWxyZWFkeSB3aW5uaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MSAmJiBwb3M8PTEwICYmIGN0cj49Mil7CiAgICBpZihoYXNTY29yZSAmJiBzY29yZT49ODUpewogICAgICByZXR1cm4gewogICAgICAgIHR5cGU6J2F1dGhvcml0eScsCiAgICAgICAgaW1wYWN0U2NvcmU6IDQwLAogICAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJywgQ1RSICcrY3RyLnRvRml4ZWQoMSkrJyUsIHNjb3JlICcrc2NvcmUrJy8xMDAuICcKICAgICAgICAgICAgKydQYWdpbmEgcHJlc3RlZXJ0IGdvZWQuIFZlcmRlcmUgZ3JvZWkga29tdCB2aWEgbGlua2J1aWxkaW5nIGVuIGF1dG9yaXRlaXQuJywKICAgICAgICBhY3Rpb246ICdGb2N1cyBvcCBpbnRlcm5lIGxpbmtzIGVuIGV4dGVybmUgYmFja2xpbmtzLiAnCiAgICAgICAgICAgICAgICsnVm9lZyBleHBlcnRjaXRhdGVuIGVuIGZyZXNoIGRhdGEgdG9lICgyMDI2KS4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdORVhVUyBTaWduYWxzIOKAlCBTdGFwIDYgaW4gUFVMU0UrTkVYVVMnLAogICAgICAgIHRpbWU6ICcxLTIgdXVyJywKICAgICAgICBwcmVmaWxsZWQ6IFsnVVJMJywnS2V5d29yZCcsJ1Bvc2l0aWUnLCdJbXByZXNzaWVzJywnQ1RSJ10sCiAgICAgICAgbWFudWFsOiAgICBbJ1NpdGVtYXAgVVJMcyAodm9vciBpbnRlcm5lIGxpbmtzKScsJ0NvbXBldGl0b3IgSFRNTCddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIG51bGw7IC8vIEFscmVhZHkgcGVyZm9ybWluZyB3ZWxsLCBubyB1cmdlbnQgYWN0aW9uCiAgfQoKICAvLyDilIDilIAgU0NFTkFSSU8gMzogUG9zaXRpb24gMTEtMjAg4oCUIGNsb3Nlc3QgdG8gcGFnZSAxIOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MTEgJiYgcG9zPD0yMCl7CiAgICBpZihjdHI8MS41KXsKICAgICAgcmV0dXJuIHsKICAgICAgICB0eXBlOidjdHInLAogICAgICAgIGltcGFjdFNjb3JlOiA5MiwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWV0IENUUiAnK2N0ci50b0ZpeGVkKDEpKyclLiAnCiAgICAgICAgICAgICsnSmUgc3RhYXQgYmlqbmEgb3AgcGFnaW5hIDEgbWFhciBkZSBDVFIgaXMgbGFhZy4gJwogICAgICAgICAgICArJ1R3ZWUgcHJvYmxlbWVuOiB0aXRsZSB0cmVrdCBuaWV0IGFhbiBFTiBjb250ZW50IG5ldCBuaWV0IHN0ZXJrIGdlbm9lZy4nLAogICAgICAgIGFjdGlvbjogJ1N0YXAgMTogdGl0bGUgKyBtZXRhIGhlcnNjaHJpanZlbiAoMzAgbWluKS4gJwogICAgICAgICAgICAgICArJ1N0YXAgMjogdm9sbGVkaWdlIFBVTFNFK05FWFVTIGF1ZGl0IHZvb3IgZGUgbGFhdHN0ZSBwdXNoIG5hYXIgcGFnaW5hIDEuJywKICAgICAgICBhdWRpdEZvY3VzOiAnU3RhcnQgbWV0IFN0YXAgMiAoQ1RSIFN1cmdlcnkpIGRhbiBTdGFwIDEgKFByaW9yaXR5IEFjdGlvbnMpJywKICAgICAgICB0aW1lOiAnMS0zIHV1cicsCiAgICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICAgIG1hbnVhbDogICAgWydQYWdpbmEgSFRNTCcsJ0NvbXBldGl0b3IgSFRNTCcsJ1NpdGVtYXAgVVJMcyddLAogICAgICAgIHF1aWNrV2luOiAgdHJ1ZSwKICAgICAgfTsKICAgIH0KICAgIGlmKGhhc1Njb3JlICYmIHNjb3JlPDcwKXsKICAgICAgcmV0dXJuIHsKICAgICAgICB0eXBlOidjb250ZW50JywKICAgICAgICBpbXBhY3RTY29yZTogOTAsCiAgICAgICAgd2h5OiAnUG9zaXRpZSAnK01hdGgucm91bmQocG9zKSsnLCBzY29yZSAnK3Njb3JlKycvMTAwLiAnCiAgICAgICAgICAgICsnQmlqbmEgcGFnaW5hIDEgbWFhciBkZSBjb250ZW50IGlzIHRlIHp3YWsuICcKICAgICAgICAgICAgKydNZXQgZWVuIHNjb3JlIGJvdmVuIDgwIGhlYiBqZSBncm90ZSBrYW5zIG9tIG5hYXIgZGUgdG9wIHRlIHN0aWpnZW4uJywKICAgICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQuIEZvY3VzIG9wIGNvbnRlbnQgZ2FwcywgUFVMU0UgcmV3cml0ZXMgZW4gc2NoZW1hLicsCiAgICAgICAgYXVkaXRGb2N1czogJ0FsbGUgMTAgc3RhcHBlbiDigJQgUHJpb3JpdHkgQWN0aW9ucyBlZXJzdCcsCiAgICAgICAgdGltZTogJzItNCB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwgKFN1cmZlciBTRU8gKyBNYXJrZXRNdXNlIGFscyBkZWZhdWx0KScsJ1NpdGVtYXAgVVJMcyddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIHsKICAgICAgdHlwZTonY29udGVudCcsCiAgICAgIGltcGFjdFNjb3JlOiA4OCwKICAgICAgd2h5OiAnUG9zaXRpZSAnK01hdGgucm91bmQocG9zKSsnIOKAlCDDqcOpbiBzdGVya2UgYXVkaXQgdmVyd2lqZGVyZCB2YW4gcGFnaW5hIDEuICcKICAgICAgICAgICsoIGltcHI+MjAwMCA/IGltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMgYmV0ZWtlbnQgdmVlbCB0ZSB3aW5uZW4uICcgOiAnJykKICAgICAgICAgICsoaGFzU2NvcmUgPyAnU2NvcmU6ICcrc2NvcmUrJy8xMDAuJyA6ICdDb250ZW50U2NvcmUgbm9nIG9uYmVrZW5kIOKAlCBzY2FuIGVlcnN0LicpLAogICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQg4oCUIGZvY3VzIG9wIGNvbnRlbnQgZ2FwcyBlbiBpbnRlcm5lIGxpbmtzLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4g4oCUIFByaW9yaXR5IEFjdGlvbnMgZWVyc3QnLAogICAgICB0aW1lOiAnMi0zIHV1cicsCiAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgbWFudWFsOiAgICBbJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICB9OwogIH0KCiAgLy8g4pSA4pSAIFNDRU5BUklPIDQ6IFBvc2l0aW9uIDIxLTMwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MjEgJiYgcG9zPD0zMCl7CiAgICBpZihoYXNTY29yZSAmJiBzY29yZTw3MCl7CiAgICAgIHJldHVybiB7CiAgICAgICAgdHlwZToncmV3cml0ZScsCiAgICAgICAgaW1wYWN0U2NvcmU6IDgyLAogICAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJywgc2NvcmUgJytzY29yZSsnLzEwMC4gJwogICAgICAgICAgICArJ0NvbnRlbnQgbW9ldCBoZXJzY2hyZXZlbiB3b3JkZW4gw6luIGRlIHBhZ2luYSBoZWVmdCBlZW4gdm9sbGVkaWdlIGF1ZGl0IG5vZGlnLiAnCiAgICAgICAgICAgICsoaW1wcj4xMDAwID8gJ01ldCAnK2ltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMgaXMgZGUgcG90ZW50aWUgZXIuJyA6ICcnKSwKICAgICAgICBhY3Rpb246ICdQYWdpbmEgaGVyc2NocmlqdmVuIG9wIGJhc2lzIHZhbiBQVUxTRStORVhVUyBhYW5iZXZlbGluZ2VuLiAnCiAgICAgICAgICAgICAgICsnRGFhcm5hIG9wbmlldXcgc2Nhbm5lbiBlbiBzY29yZSB2ZXJnZWxpamtlbi4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdTdGFwIDUgKFBVTFNFIHJld3JpdGVzKSArIFN0YXAgNCAoQ29udGVudCBHYXApIHppam4gcHJpb3JpdGVpdCcsCiAgICAgICAgdGltZTogJzMtNSB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKHZlcnBsaWNodCB2b29yIHJld3JpdGUgYW5hbHlzZSknLCdDb21wZXRpdG9yIEhUTUwnLCdTaXRlbWFwIFVSTHMnXSwKICAgICAgfTsKICAgIH0KICAgIHJldHVybiB7CiAgICAgIHR5cGU6J2NvbnRlbnQnLAogICAgICBpbXBhY3RTY29yZTogNzgsCiAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJy4gUGFnaW5hIGhlZWZ0IHBvdGVudGllIG1hYXIgbWlzdCBhdXRvcml0ZWl0IG9mIGNvbnRlbnQgZGllcHRlLiAnCiAgICAgICAgICArKGltcHI+NTAwID8gaW1wci50b0xvY2FsZVN0cmluZygpKycgaW1wcmVzc2llcyDigJQgaGV0IG9uZGVyd2VycCBoZWVmdCB2cmFhZy4nIDogJycpLAogICAgICBhY3Rpb246ICdWb2xsZWRpZ2UgYXVkaXQg4oCUIGZvY3VzIG9wIE5FWFVTIHNpZ25hbHMsIGludGVybmUgbGlua3MgZW4gc2NoZW1hLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4nLAogICAgICB0aW1lOiAnMi0zIHV1cicsCiAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgbWFudWFsOiAgICBbJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICB9OwogIH0KCiAgLy8g4pSA4pSAIFNDRU5BUklPIDU6IFBvc2l0aW9uIDMxLTYwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz49MzEgJiYgcG9zPD02MCl7CiAgICBpZihpbXByPjEwMDApewogICAgICByZXR1cm4gewogICAgICAgIHR5cGU6J3Jld3JpdGUnLAogICAgICAgIGltcGFjdFNjb3JlOiA3MCwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWV0ICcraW1wci50b0xvY2FsZVN0cmluZygpKycgaW1wcmVzc2llcy4gJwogICAgICAgICAgICArJ1ZlZWwgem9la3ZvbHVtZSBtYWFyIEdvb2dsZSB2aW5kdCBkZSBwYWdpbmEgbmlldCBzdGVyayBnZW5vZWcgdm9vciBwYWdpbmEgMS0zLiAnCiAgICAgICAgICAgICsnRGllcGdhYW5kZSBhdWRpdCArIGNvbnRlbnQgcmV3cml0ZSBpcyBkZSBlbmlnZSB3ZWcgb21ob29nLicsCiAgICAgICAgYWN0aW9uOiAnRGllcGdhYW5kZSBQVUxTRStORVhVUyBhdWRpdC4gQWxsZSAxMCBzdGFwcGVuIGRvb3Jsb3Blbi4gJwogICAgICAgICAgICAgICArJ0RhYXJuYSBjb250ZW50IHJld3JpdGUgZW4gc2NoZW1hIHRvZXZvZWdlbi4nLAogICAgICAgIGF1ZGl0Rm9jdXM6ICdBbGxlIDEwIHN0YXBwZW4g4oCUIGZvY3VzIFN0YXAgMyAoQ29tcGV0aXRvciBEaWZmKSBlbiBTdGFwIDUgKFBVTFNFIHJld3JpdGVzKScsCiAgICAgICAgdGltZTogJzQtNiB1dXInLAogICAgICAgIHByZWZpbGxlZDogWydVUkwnLCdLZXl3b3JkJywnUG9zaXRpZScsJ0ltcHJlc3NpZXMnLCdDVFInXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwgKGtyaXRpZWspJywnQ29tcGV0aXRvciBIVE1MJywnU2l0ZW1hcCBVUkxzJ10sCiAgICAgIH07CiAgICB9CiAgICByZXR1cm4gewogICAgICB0eXBlOidjb250ZW50JywKICAgICAgaW1wYWN0U2NvcmU6IDU1LAogICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKyhpbXByPDIwMD8nIG1ldCB3ZWluaWcgaW1wcmVzc2llcyc6JycpKycuICcKICAgICAgICAgICsnQ29udGVudCBpcyB0ZSB6d2FrIG9mIGhldCBvbmRlcndlcnAgaGVlZnQgd2VpbmlnIHZyYWFnLiAnCiAgICAgICAgICArJ0F1ZGl0IGdlZWZ0IGR1aWRlbGlqa2hlaWQgd2Vsa2UgcmljaHRpbmcgaGV0IGJlc3RlIHdlcmt0LicsCiAgICAgIGFjdGlvbjogJ0F1ZGl0IG9tIHRlIGJlcGFsZW4gb2YgaGVyc2NocmlqdmVuIG9mIG5pZXV3ZSBhYW5wYWsgbm9kaWcgaXMuJywKICAgICAgYXVkaXRGb2N1czogJ1N0YXAgMSAoSW50ZW50KSBlbiBTdGFwIDQgKENvbnRlbnQgR2FwKSBlZXJzdCcsCiAgICAgIHRpbWU6ICcxLTMgdXVyJywKICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnLCdQb3NpdGllJywnSW1wcmVzc2llcycsJ0NUUiddLAogICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwnXSwKICAgIH07CiAgfQoKICAvLyDilIDilIAgU0NFTkFSSU8gNjogUG9zaXRpb24gNjArIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmKHBvcz42MCl7CiAgICBpZihpbXByPjUwMCl7CiAgICAgIHJldHVybiB7CiAgICAgICAgdHlwZTonYnVpbGQnLAogICAgICAgIGltcGFjdFNjb3JlOiA0MCwKICAgICAgICB3aHk6ICdQb3NpdGllICcrTWF0aC5yb3VuZChwb3MpKycgbWFhciAnK2ltcHIudG9Mb2NhbGVTdHJpbmcoKSsnIGltcHJlc3NpZXMg4oCUIGVyIGlzIHZyYWFnLiAnCiAgICAgICAgICAgICsnR29vZ2xlIGJlb29yZGVlbHQgZGV6ZSBwYWdpbmEgYWxzIHRlIHp3YWsuIEZ1bmRhbWVudGVsZSBjb250ZW50IHJlYnVpbGQgbm9kaWcuJywKICAgICAgICBhY3Rpb246ICdDb250ZW50IHZvbGxlZGlnIG9wbmlldXcgc2NocmlqdmVuIG1ldCBQVUxTRStORVhVUyBhbHMgYnJpZWZpbmcuICcKICAgICAgICAgICAgICAgKydGb2N1cyBvcCBFLUUtQS1ULCBzY2hlbWEgZW4gY29udGVudCBkaWVwdGUuJywKICAgICAgICBhdWRpdEZvY3VzOiAnQWxsZSAxMCBzdGFwcGVuIGFscyBjb250ZW50IGJyaWVmIGdlYnJ1aWtlbicsCiAgICAgICAgdGltZTogJzUrIHV1cicsCiAgICAgICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnXSwKICAgICAgICBtYW51YWw6ICAgIFsnUGFnaW5hIEhUTUwnLCdDb21wZXRpdG9yIEhUTUwnLCdTaXRlbWFwIFVSTHMnLCdHU0MgcXVlcmllcyddLAogICAgICB9OwogICAgfQogICAgcmV0dXJuIHsKICAgICAgdHlwZTonYnVpbGQnLAogICAgICBpbXBhY3RTY29yZTogMjUsCiAgICAgIHdoeTogJ1Bvc2l0aWUgJytNYXRoLnJvdW5kKHBvcykrJyBtZXQgbGFhZyB6b2Vrdm9sdW1lLiAnCiAgICAgICAgICArJ0VlcnN0IGJlcGFsZW4gb2YgZGl0IHpvZWt3b29yZCBkZSBtb2VpdGUgd2FhcmQgaXMuJywKICAgICAgYWN0aW9uOiAnS2V5d29yZCByZXNlYXJjaCBlZXJzdC4gRGFuIGJlc2xpc3NlbjogcmV3cml0ZSBvZiBuaWV1dyBhcnRpa2VsLicsCiAgICAgIGF1ZGl0Rm9jdXM6ICdTdGFwIDEgKEludGVudCBhbmFseXNlKSBhbHMgc3RhcnRwdW50JywKICAgICAgdGltZTogJ05hZGVyIHRlIGJlcGFsZW4nLAogICAgICBwcmVmaWxsZWQ6IFsnVVJMJywnS2V5d29yZCddLAogICAgICBtYW51YWw6ICAgIFsnQWxsZXMg4oCUIHBhZ2luYSBoZWVmdCB3ZWluaWcgZGF0YSddLAogICAgfTsKICB9CgogIC8vIE5vIHBvc2l0aW9uIGRhdGEKICByZXR1cm4gewogICAgdHlwZTonY29udGVudCcsCiAgICBpbXBhY3RTY29yZTogNTAsCiAgICB3aHk6ICdHZWVuIEdTQyBkYXRhIGJlc2NoaWtiYWFyLiBWb2VnIHBvc2l0aWUgZW4gaW1wcmVzc2llcyB0b2UgdmFudWl0IEdTQyB2b29yIGVlbiBiZXRlcmUgYWFuYmV2ZWxpbmcuJywKICAgIGFjdGlvbjogJ1ZvZWcgR1NDIGRhdGEgdG9lLCBzY2FuIENvbnRlbnRTY29yZSwgZGFuIHZvbGxlZGlnZSBhdWRpdC4nLAogICAgYXVkaXRGb2N1czogJ0FsbGUgMTAgc3RhcHBlbicsCiAgICB0aW1lOiAnT25iZWtlbmQnLAogICAgcHJlZmlsbGVkOiBbJ1VSTCcsJ0tleXdvcmQnXSwKICAgIG1hbnVhbDogICAgWydHU0MgZGF0YScsJ1BhZ2luYSBIVE1MJywnQ29tcGV0aXRvciBIVE1MJ10sCiAgfTsKfQoKZnVuY3Rpb24gYnVpbGRBdWRpdFVybChwKXsKICB2YXIgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpOwogIHBhcmFtcy5zZXQoJ3VybCcsIHAudXJsKTsKICBpZihwLmtleXdvcmQpICAgICBwYXJhbXMuc2V0KCdrdycsICAgcC5rZXl3b3JkKTsKICBpZihwLnBvc2l0aW9uKSAgICBwYXJhbXMuc2V0KCdwb3MnLCAgcC5wb3NpdGlvbik7CiAgaWYocC5pbXByZXNzaW9ucykgcGFyYW1zLnNldCgnaW1wcicsIHAuaW1wcmVzc2lvbnMpOwogIGlmKHAuY3RyKSAgICAgICAgIHBhcmFtcy5zZXQoJ2N0cicsICBwLmN0cik7CiAgaWYocC5pZCkgICAgICAgICAgcGFyYW1zLnNldCgnd2YnLCAgIHAuaWQpOyAvLyB3b3JrZmxvdyBjYWxsYmFjawogIHJldHVybiBBVURJVF9VUkwgKyAnPycgKyBwYXJhbXMudG9TdHJpbmcoKTsKfQoKZnVuY3Rpb24gcmVuZGVyKCl7CiAgdmFyIGZUeXBlICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlR5cGUnKS52YWx1ZTsKICB2YXIgZlByaSAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmUHJpJykudmFsdWU7CiAgdmFyIGZTdGF0dXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZlN0YXR1cycpLnZhbHVlOwogIHZhciBmU29ydCAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZTb3J0JykudmFsdWU7CgogIHZhciBhcnIgPSBwYWdlcy5maWx0ZXIoZnVuY3Rpb24ocCl7CiAgICBpZihmU3RhdHVzPT09J2FjdGl2ZScgJiYgcC5zdGF0dXM9PT0nZG9uZScpIHJldHVybiBmYWxzZTsKICAgIGlmKGZTdGF0dXM9PT0nZG9uZScgICAmJiBwLnN0YXR1cyE9PSdkb25lJykgcmV0dXJuIGZhbHNlOwogICAgaWYoZlByaSE9PSdhbGwnICYmIHAucHJpb3JpdHkhPT1mUHJpKSByZXR1cm4gZmFsc2U7CiAgICByZXR1cm4gdHJ1ZTsKICB9KS5tYXAoZnVuY3Rpb24ocCl7CiAgICByZXR1cm4geyBwYWdlOnAsIHJlYzpnZXRSZWNvbW1lbmRhdGlvbihwKSB9OwogIH0pLmZpbHRlcihmdW5jdGlvbih4KXsKICAgIGlmKCF4LnJlYykgcmV0dXJuIGZhbHNlOwogICAgaWYoZlR5cGUhPT0nYWxsJyAmJiB4LnJlYy50eXBlIT09ZlR5cGUpIHJldHVybiBmYWxzZTsKICAgIHJldHVybiB0cnVlOwogIH0pOwoKICAvLyBTb3J0CiAgaWYoZlNvcnQ9PT0naW1wYWN0JykgICAgICBhcnIuc29ydChmdW5jdGlvbihhLGIpeyByZXR1cm4gYi5yZWMuaW1wYWN0U2NvcmUgLSBhLnJlYy5pbXBhY3RTY29yZTsgfSk7CiAgZWxzZSBpZihmU29ydD09PSdwb3NpdGlvbicpIGFyci5zb3J0KGZ1bmN0aW9uKGEsYil7IHJldHVybiAoYS5wYWdlLnBvc2l0aW9ufHw5OTkpLShiLnBhZ2UucG9zaXRpb258fDk5OSk7IH0pOwogIGVsc2UgaWYoZlNvcnQ9PT0naW1wcmVzc2lvbnMnKSBhcnIuc29ydChmdW5jdGlvbihhLGIpeyByZXR1cm4gYi5wYWdlLmltcHJlc3Npb25zLWEucGFnZS5pbXByZXNzaW9uczsgfSk7CgogIC8vIFN1bW1hcnkKICB2YXIgdHlwZXMgPSB7fTsKICBhcnIuZm9yRWFjaChmdW5jdGlvbih4KXsgdHlwZXNbeC5yZWMudHlwZV09KHR5cGVzW3gucmVjLnR5cGVdfHwwKSsxOyB9KTsKICB2YXIgcXVpY2t3aW5zID0gYXJyLmZpbHRlcihmdW5jdGlvbih4KXsgcmV0dXJuIHgucmVjLnF1aWNrV2luOyB9KS5sZW5ndGg7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N1bW1hcnknKS5pbm5lckhUTUwgPQogICAgJzxkaXYgY2xhc3M9InN1bS1jYXJkIj48ZGl2IGNsYXNzPSJzdW0tbiIgc3R5bGU9ImNvbG9yOnZhcigtLWJsdWUpIj4nK2Fyci5sZW5ndGgrJzwvZGl2PjxkaXYgY2xhc3M9InN1bS1sIj5Ub3RhbCBwYWdlczwvZGl2PjwvZGl2PicKICAgKyc8ZGl2IGNsYXNzPSJzdW0tY2FyZCI+PGRpdiBjbGFzcz0ic3VtLW4iIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPicrcXVpY2t3aW5zKyc8L2Rpdj48ZGl2IGNsYXNzPSJzdW0tbCI+UXVpY2sgd2luczwvZGl2PjwvZGl2PicKICAgKyc8ZGl2IGNsYXNzPSJzdW0tY2FyZCI+PGRpdiBjbGFzcz0ic3VtLW4iIHN0eWxlPSJjb2xvcjp2YXIoLS1nb2xkKSI+JysodHlwZXMuY29udGVudHx8MCkrJzwvZGl2PjxkaXYgY2xhc3M9InN1bS1sIj5OZWVkIGF1ZGl0PC9kaXY+PC9kaXY+JwogICArJzxkaXYgY2xhc3M9InN1bS1jYXJkIj48ZGl2IGNsYXNzPSJzdW0tbiIgc3R5bGU9ImNvbG9yOnZhcigtLW9yYW5nZSkiPicrKHR5cGVzLnJld3JpdGV8fDApKyc8L2Rpdj48ZGl2IGNsYXNzPSJzdW0tbCI+TmVlZCByZXdyaXRlPC9kaXY+PC9kaXY+JzsKCiAgaWYoIWFyci5sZW5ndGgpewogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlY0xpc3QnKS5pbm5lckhUTUw9JzxkaXYgY2xhc3M9ImVtcHR5Ij48aDM+Tm8gUGFnZXM8L2gzPjxwPkFkZCBwYWdlcyBpbiB0aGUgV29ya2Zsb3cgTWFuYWdlciBmaXJzdCwgb3IgYWRqdXN0IGZpbHRlcnMuPC9wPjwvZGl2Pic7CiAgICByZXR1cm47CiAgfQoKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVjTGlzdCcpLmlubmVySFRNTCA9IGFyci5tYXAoZnVuY3Rpb24oeCxpKXsKICAgIHZhciBwICAgPSB4LnBhZ2U7CiAgICB2YXIgcmVjID0geC5yZWM7CiAgICB2YXIgUiAgID0gUkVDU1tyZWMudHlwZV0gfHwgUkVDUy5jb250ZW50OwogICAgdmFyIGF1ZGl0VXJsID0gYnVpbGRBdWRpdFVybChwKTsKCiAgICB2YXIgc2hvcnRVcmw9Jyc7CiAgICB0cnl7c2hvcnRVcmw9bmV3IFVSTChwLnVybCkucGF0aG5hbWV8fCcvJzt9Y2F0Y2goZSl7c2hvcnRVcmw9cC51cmwuc2xpY2UoMCw1MCk7fQogICAgaWYoc2hvcnRVcmwubGVuZ3RoPjYwKSBzaG9ydFVybD1zaG9ydFVybC5zbGljZSgwLDYwKSsn4oCmJzsKCiAgICB2YXIgZ3NjQ2hpcHMgPSAnJzsKICAgIGlmKHAucG9zaXRpb24pICAgIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5Qb3M8L3N0cm9uZz4gJytNYXRoLnJvdW5kKHAucG9zaXRpb24pKyc8L3NwYW4+JzsKICAgIGlmKHAuaW1wcmVzc2lvbnMpIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5JbXByPC9zdHJvbmc+ICcrcC5pbXByZXNzaW9ucy50b0xvY2FsZVN0cmluZygpKyc8L3NwYW4+JzsKICAgIGlmKHAuY3RyKSAgICAgICAgIGdzY0NoaXBzKz0nPHNwYW4gY2xhc3M9Im1ldGEtY2hpcCI+PHN0cm9uZz5DVFI8L3N0cm9uZz4gJytwYXJzZUZsb2F0KHAuY3RyKS50b0ZpeGVkKDEpKyclPC9zcGFuPic7CiAgICBpZihwLnNjb3JlQmVmb3JlKSBnc2NDaGlwcys9JzxzcGFuIGNsYXNzPSJtZXRhLWNoaXAiPjxzdHJvbmc+U2NvcmU8L3N0cm9uZz4gJytwLnNjb3JlQmVmb3JlKycvMTAwPC9zcGFuPic7CgogICAgdmFyIHByZWZpbGxIdG1sID0gcmVjLnByZWZpbGxlZC5tYXAoZnVuY3Rpb24oaXRlbSl7CiAgICAgIHJldHVybiAnPGRpdiBjbGFzcz0icHJlZmlsbC1yb3cgYXV0byI+PHNwYW4gY2xhc3M9InByZWZpbGwtZG90IGRvdC1hdXRvIj48L3NwYW4+JytpdGVtKyc8L2Rpdj4nOwogICAgfSkuam9pbignJyk7CiAgICB2YXIgbWFudWFsSHRtbCA9IHJlYy5tYW51YWwubWFwKGZ1bmN0aW9uKGl0ZW0pewogICAgICByZXR1cm4gJzxkaXYgY2xhc3M9InByZWZpbGwtcm93IG1hbnVhbCI+PHNwYW4gY2xhc3M9InByZWZpbGwtZG90IGRvdC1tYW51YWwiPjwvc3Bhbj4nK2l0ZW0rJzwvZGl2Pic7CiAgICB9KS5qb2luKCcnKTsKCiAgICByZXR1cm4gJzxkaXYgY2xhc3M9InJlYy1jYXJkICcrUi5jYXJkQ2xhc3MrJyI+JwoKICAgICAgLy8gSGVhZAogICAgICArJzxkaXYgY2xhc3M9InJlYy1oZWFkIj4nCiAgICAgICsnPGRpdj48c3BhbiBjbGFzcz0icmVjLWJhZGdlICcrUi5iYWRnZUNsYXNzKyciPicrUi5pY29uKycgJytSLmxhYmVsKyc8L3NwYW4+PC9kaXY+JwogICAgICArJzxkaXYgY2xhc3M9InJlYy1tYWluIj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLXVybCI+JytzaG9ydFVybCsnPC9kaXY+JwogICAgICArKHAua2V5d29yZD8nPGRpdiBjbGFzcz0icmVjLWt3Ij4nK3Aua2V5d29yZCsnPC9kaXY+JzonJykKICAgICAgKyc8ZGl2IGNsYXNzPSJyZWMtdGl0bGUiPicrcmVjLnRpdGxlKyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLXdoeSI+JytyZWMud2h5Kyc8L2Rpdj4nCiAgICAgICsnPGRpdiBjbGFzcz0icmVjLWFjdGlvbiI+JytyZWMuYWN0aW9uKyc8L2Rpdj4nCiAgICAgICsoZ3NjQ2hpcHM/JzxkaXYgY2xhc3M9InJlYy1tZXRhIj4nK2dzY0NoaXBzKyc8L2Rpdj4nOicnKQogICAgICArJzwvZGl2PicKCiAgICAgIC8vIFByZS1maWxsIGluZm8KICAgICAgKyc8ZGl2IGNsYXNzPSJwcmVmaWxsLWJveCI+JwogICAgICArJzxkaXYgY2xhc3M9InByZWZpbGwtdGl0bGUiPkluIFBVTFNFK05FWFVTPC9kaXY+JwogICAgICArKHByZWZpbGxIdG1sPyc8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweDtmb250LWZhbWlseTpcJ0lCTSBQbGV4IE1vbm9cJyxtb25vc3BhY2U7Zm9udC1zaXplOjhweDtsZXR0ZXItc3BhY2luZzouMDhlbTtjb2xvcjp2YXIoLS1ncmVlbik7dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlOyI+4pyTIEF1dG8taW5nZXZ1bGQ8L2Rpdj4nK3ByZWZpbGxIdG1sOicnKQogICAgICArKG1hbnVhbEh0bWw/JzxkaXYgc3R5bGU9Im1hcmdpbjo4cHggMCA0cHg7Zm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo4cHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07Y29sb3I6dmFyKC0tZGltKTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Ij7inI4gSGFuZG1hdGlnPC9kaXY+JyttYW51YWxIdG1sOicnKQogICAgICArJzwvZGl2PicKICAgICAgKyc8L2Rpdj4nCgogICAgICAvLyBGb290ZXIgd2l0aCBhY3Rpb24KICAgICAgKyc8ZGl2IGNsYXNzPSJyZWMtZm9vdCI+JwogICAgICArJzxhIGhyZWY9IicrYXVkaXRVcmwrJyIgdGFyZ2V0PSJfYmxhbmsiIGNsYXNzPSJhY3Rpb24tYnRuIGFjdGlvbi1idG4tZ29sZCI+8J+UrCBPcGVuIGluIFBVTFNFK05FWFVTIOKGkjwvYT4nCiAgICAgICsnPGEgaHJlZj0iJytwLnVybCsnIiB0YXJnZXQ9Il9ibGFuayIgY2xhc3M9ImFjdGlvbi1idG4gYWN0aW9uLWJ0bi1ibHVlIj7ihpcgT3BlbiBwYWdpbmE8L2E+JwogICAgICArJzxzcGFuIGNsYXNzPSJ0aW1lLWNoaXAiPuKPsSAnK3JlYy50aW1lKyc8L3NwYW4+JwogICAgICArKHJlYy5hdWRpdEZvY3VzPyc8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6XCdJQk0gUGxleCBNb25vXCcsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7Y29sb3I6dmFyKC0tc3ViKTtsZXR0ZXItc3BhY2luZzouMDZlbTsiPicrcmVjLmF1ZGl0Rm9jdXMrJzwvc3Bhbj4nOicnKQogICAgICArJzwvZGl2PicKCiAgICAgICsnPC9kaXY+JzsKICB9KS5qb2luKCcnKTsKfQoKbG9hZCgpOwpyZW5kZXIoKTsKPC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=", "base64").toString("utf8"));
});
app.get('/handleiding',           (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Buffer.from("PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9Im5sIiBpZD0iaHRtbFJvb3QiPgo8aGVhZD4KPG1ldGEgY2hhcnNldD0iVVRGLTgiPgo8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CjxtZXRhIG5hbWU9InJvYm90cyIgY29udGVudD0ibm9pbmRleCxub2ZvbGxvdyI+Cjx0aXRsZT5Db250ZW50U2NhbGUgU0VPIEF1ZGl0IFN5c3RlbSDigJQgSGFuZGxlaWRpbmcgLyBVc2VyIEd1aWRlPC90aXRsZT4KPGxpbmsgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CZWJhcytOZXVlJmZhbWlseT1ETStTYW5zOndnaHRAMzAwOzQwMDs1MDA7NzAwJmZhbWlseT1JQk0rUGxleCtNb25vOndnaHRANDAwOzcwMCZkaXNwbGF5PXN3YXAiIHJlbD0ic3R5bGVzaGVldCI+CjxzdHlsZT4KKiwqOjpiZWZvcmUsKjo6YWZ0ZXJ7Ym94LXNpemluZzpib3JkZXItYm94O21hcmdpbjowO3BhZGRpbmc6MH0KOnJvb3R7CiAgLS1iZzojMDMwNzEyOy0tY2FyZDojMGYxNzJhOy0tc3VyZmFjZTojMWUyOTNiOy0tYm9yZGVyOiMzMzQxNTU7CiAgLS1pbms6I2Y5ZmFmYjstLW11dGVkOiM5NGEzYjg7LS1zdWI6IzY0NzQ4YjsKICAtLXB1cnBsZTojYTc4YmZhOy0tYmx1ZTojNjBhNWZhOy0tZ3JlZW46IzRhZGU4MDsKICAtLWdvbGQ6I2ZiYmYyNDstLXJlZDojZjQzZjNmOy0tb3JhbmdlOiNmYjkyM2M7Cn0KYm9keXtiYWNrZ3JvdW5kOnZhcigtLWJnKTtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtZmFtaWx5OidETSBTYW5zJyxzYW5zLXNlcmlmO2xpbmUtaGVpZ2h0OjEuNzt9Ci53cmFwe21heC13aWR0aDo5MDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmc6NDBweCAyNHB4IDEwMHB4O30KCi8qIEhlYWRlciAqLwouaGVhZGVye3RleHQtYWxpZ246Y2VudGVyO3BhZGRpbmc6NDhweCAwIDQwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTttYXJnaW4tYm90dG9tOjQ4cHg7fQouYnJhbmR7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIycHg7bGV0dGVyLXNwYWNpbmc6LjA2ZW07YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsI2E3OGJmYSwjNjBhNWZhKTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0Oy13ZWJraXQtdGV4dC1maWxsLWNvbG9yOnRyYW5zcGFyZW50O2JhY2tncm91bmQtY2xpcDp0ZXh0O3RleHQtZGVjb3JhdGlvbjpub25lO2Rpc3BsYXk6aW5saW5lLWJsb2NrO21hcmdpbi1ib3R0b206MTZweDt9Ci5oZWFkZXIgaDF7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOmNsYW1wKDMycHgsNXZ3LDUycHgpO2xldHRlci1zcGFjaW5nOi4wNGVtO2xpbmUtaGVpZ2h0OjEuMDU7bWFyZ2luLWJvdHRvbToxMnB4O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1nb2xkKSx2YXIoLS1pbmspKTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0Oy13ZWJraXQtdGV4dC1maWxsLWNvbG9yOnRyYW5zcGFyZW50O2JhY2tncm91bmQtY2xpcDp0ZXh0O30KLmhlYWRlciBwe2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTVweDttYXgtd2lkdGg6NjAwcHg7bWFyZ2luOjAgYXV0bzt9CgovKiBOYXYgKi8KLnRvY3tiYWNrZ3JvdW5kOnZhcigtLWNhcmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoyNHB4IDI4cHg7bWFyZ2luLWJvdHRvbTo0OHB4O30KLnRvYy10aXRsZXtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4yZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7bWFyZ2luLWJvdHRvbToxNHB4O30KLnRvYyBhe2Rpc3BsYXk6YmxvY2s7Y29sb3I6dmFyKC0tbXV0ZWQpO3RleHQtZGVjb3JhdGlvbjpub25lO3BhZGRpbmc6NXB4IDA7Zm9udC1zaXplOjE0cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwuMDMpO3RyYW5zaXRpb246Y29sb3IgLjE1czt9Ci50b2MgYTpob3Zlcntjb2xvcjp2YXIoLS1nb2xkKTt9Ci50b2MgYSBzcGFue2NvbG9yOnZhcigtLWdvbGQpO2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7bWFyZ2luLXJpZ2h0OjEwcHg7fQoKLyogU2VjdGlvbnMgKi8KLnNlY3Rpb257bWFyZ2luLWJvdHRvbTo1NnB4O30KLnNlY3Rpb24tbGFiZWx7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOi4yZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7bWFyZ2luLWJvdHRvbTo4cHg7fQouc2VjdGlvbiBoMntmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6Y2xhbXAoMjZweCw0dncsMzhweCk7bGV0dGVyLXNwYWNpbmc6LjA0ZW07bWFyZ2luLWJvdHRvbToxNnB4O2NvbG9yOnZhcigtLWdvbGQpO30KLnNlY3Rpb24gaDN7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIycHg7bGV0dGVyLXNwYWNpbmc6LjAzZW07bWFyZ2luOjI4cHggMCAxMHB4O2NvbG9yOnZhcigtLWluayk7fQouc2VjdGlvbiBwe2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTRweDttYXJnaW4tYm90dG9tOjE0cHg7bGluZS1oZWlnaHQ6MS43NTt9Ci5zZWN0aW9uIHAgc3Ryb25ne2NvbG9yOnZhcigtLWluayk7fQoKLyogVG9vbCBjYXJkcyAqLwoudG9vbC1jYXJke2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjI0cHg7bWFyZ2luLWJvdHRvbToxNnB4O3Bvc2l0aW9uOnJlbGF0aXZlO292ZXJmbG93OmhpZGRlbjt9Ci50b29sLWNhcmQ6OmJlZm9yZXtjb250ZW50OicnO3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO2xlZnQ6MDtyaWdodDowO2hlaWdodDozcHg7fQoudG9vbC1jYXJkLmdvbGQ6OmJlZm9yZXtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO30KLnRvb2wtY2FyZC5wdXJwbGU6OmJlZm9yZXtiYWNrZ3JvdW5kOnZhcigtLXB1cnBsZSk7fQoudG9vbC1jYXJkLmJsdWU6OmJlZm9yZXtiYWNrZ3JvdW5kOnZhcigtLWJsdWUpO30KLnRvb2wtY2FyZC5ncmVlbjo6YmVmb3Jle2JhY2tncm91bmQ6dmFyKC0tZ3JlZW4pO30KLnRvb2wtY2FyZC5vcmFuZ2U6OmJlZm9yZXtiYWNrZ3JvdW5kOnZhcigtLW9yYW5nZSk7fQoudG9vbC1uYW1le2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMnB4O2xldHRlci1zcGFjaW5nOi4wNGVtO21hcmdpbi1ib3R0b206NHB4O30KLnRvb2wtdXJse2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tYmx1ZSk7bWFyZ2luLWJvdHRvbToxMHB4O30KLnRvb2wtZGVzY3tmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7bGluZS1oZWlnaHQ6MS43O30KLnRvb2wtYmFkZ2V7ZGlzcGxheTppbmxpbmUtYmxvY2s7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjRweDttYXJnaW4tYm90dG9tOjEwcHg7fQouYmFkZ2UtaW50ZXJuYWx7YmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjEyKTtjb2xvcjp2YXIoLS1nb2xkKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMyk7fQouYmFkZ2UtY2xpZW50e2JhY2tncm91bmQ6cmdiYSg3NCwyMjIsMTI4LC4xMik7Y29sb3I6dmFyKC0tZ3JlZW4pO2JvcmRlcjoxcHggc29saWQgcmdiYSg3NCwyMjIsMTI4LC4zKTt9Ci5iYWRnZS1ub2luZGV4e2JhY2tncm91bmQ6cmdiYSgyNDQsNjMsNjMsLjEyKTtjb2xvcjp2YXIoLS1yZWQpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNDQsNjMsNjMsLjMpO30KCi8qIEZsb3cgZGlhZ3JhbSAqLwouZmxvd3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDowO21hcmdpbjoyNHB4IDA7fQouZmxvdy1zdGVwe2Rpc3BsYXk6ZmxleDtnYXA6MTZweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0O30KLmZsb3ctbGVmdHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmNlbnRlcjtmbGV4LXNocmluazowO3dpZHRoOjQwcHg7fQouZmxvdy1udW17d2lkdGg6MzZweDtoZWlnaHQ6MzZweDtib3JkZXItcmFkaXVzOjUwJTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjE4cHg7ZmxleC1zaHJpbms6MDt9Ci5mbG93LWxpbmV7d2lkdGg6MnB4O2ZsZXg6MTttaW4taGVpZ2h0OjI0cHg7YmFja2dyb3VuZDp2YXIoLS1ib3JkZXIpO21hcmdpbjoycHggMDt9Ci5mbG93LWJvZHl7ZmxleDoxO3BhZGRpbmctYm90dG9tOjI0cHg7fQouZmxvdy10aXRsZXtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tYm90dG9tOjRweDt9Ci5mbG93LXN1Yntmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7bGluZS1oZWlnaHQ6MS42NTt9Ci5mbG93LXVybHtmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLWJsdWUpO21hcmdpbi10b3A6NHB4O30KCi8qIFN0ZXBzICovCi5zdGVwcy1saXN0e2NvdW50ZXItcmVzZXQ6c3RlcDt9Ci5zdGVwLWl0ZW17ZGlzcGxheTpmbGV4O2dhcDoxNHB4O21hcmdpbi1ib3R0b206MjBweDtwYWRkaW5nOjE2cHggMThweDtiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsLjAyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Ym9yZGVyLXJhZGl1czo4cHg7fQouc3RlcC1udW17Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjI4cHg7Y29sb3I6dmFyKC0tZ29sZCk7bGluZS1oZWlnaHQ6MTtmbGV4LXNocmluazowO3dpZHRoOjI4cHg7fQouc3RlcC1ib2R5IHN0cm9uZ3tjb2xvcjp2YXIoLS1pbmspO2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo0cHg7Zm9udC1zaXplOjE0cHg7fQouc3RlcC1ib2R5IHNwYW57Zm9udC1zaXplOjEzcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2xpbmUtaGVpZ2h0OjEuNjU7fQouc3RlcC1ib2R5IGNvZGV7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTFweDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO3BhZGRpbmc6MXB4IDZweDtib3JkZXItcmFkaXVzOjNweDtjb2xvcjp2YXIoLS1ibHVlKTt9CgovKiBJbmZvIGJveGVzICovCi5pbmZvLWJveHtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW46MTZweCAwO2ZvbnQtc2l6ZToxM3B4O2xpbmUtaGVpZ2h0OjEuNzt9Ci5pbmZvLWJveC5nb2xke2JhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4wNik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1MSwxOTEsMzYsLjIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5pbmZvLWJveC5nb2xkIHN0cm9uZ3tjb2xvcjp2YXIoLS1nb2xkKTt9Ci5pbmZvLWJveC5ibHVle2JhY2tncm91bmQ6cmdiYSg5NiwxNjUsMjUwLC4wNik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDk2LDE2NSwyNTAsLjIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5pbmZvLWJveC5ibHVlIHN0cm9uZ3tjb2xvcjp2YXIoLS1ibHVlKTt9Ci5pbmZvLWJveC5ncmVlbntiYWNrZ3JvdW5kOnJnYmEoNzQsMjIyLDEyOCwuMDYpO2JvcmRlcjoxcHggc29saWQgcmdiYSg3NCwyMjIsMTI4LC4yKTtjb2xvcjp2YXIoLS1tdXRlZCk7fQouaW5mby1ib3guZ3JlZW4gc3Ryb25ne2NvbG9yOnZhcigtLWdyZWVuKTt9Ci5pbmZvLWJveC5yZWR7YmFja2dyb3VuZDpyZ2JhKDI0NCw2Myw2MywuMDYpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNDQsNjMsNjMsLjIpO2NvbG9yOnZhcigtLW11dGVkKTt9Ci5pbmZvLWJveC5yZWQgc3Ryb25ne2NvbG9yOnZhcigtLXJlZCk7fQoKLyogVGFibGUgKi8KLmRhdGEtdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWFyZ2luOjE2cHggMDtmb250LXNpemU6MTNweDt9Ci5kYXRhLXRhYmxlIHRoe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo5cHggMTJweDt0ZXh0LWFsaWduOmxlZnQ7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KLmRhdGEtdGFibGUgdGR7cGFkZGluZzo5cHggMTJweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7Y29sb3I6dmFyKC0tbXV0ZWQpO3ZlcnRpY2FsLWFsaWduOnRvcDt9Ci5kYXRhLXRhYmxlIHRkIHN0cm9uZ3tjb2xvcjp2YXIoLS1pbmspO30KLmRhdGEtdGFibGUgdHI6aG92ZXIgdGR7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC4wMik7fQoKLyogU2NlbmFyaW8gYm94ZXMgKi8KLnNjZW5hcmlve2JhY2tncm91bmQ6dmFyKC0tY2FyZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTZweCAxOHB4O21hcmdpbi1ib3R0b206MTBweDt9Ci5zY2VuYXJpby1oZWFke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbTo4cHg7fQouc2NlbmFyaW8tYmFkZ2V7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6OHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6M3B4IDhweDtib3JkZXItcmFkaXVzOjRweDt9Ci5zY2VuYXJpby10aXRsZXtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjE0cHg7Y29sb3I6dmFyKC0taW5rKTt9Ci5zY2VuYXJpbyBwe2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW46MDt9Ci5zY2VuYXJpbyAuYWN0aW9ue2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayk7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbi10b3A6NnB4O2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0O2dhcDo2cHg7fQouc2NlbmFyaW8gLmFjdGlvbjo6YmVmb3Jle2NvbnRlbnQ6J+KGkic7Y29sb3I6dmFyKC0tZ29sZCk7ZmxleC1zaHJpbms6MDt9CgovKiBEaXZpZGVyICovCmhye2JvcmRlcjpub25lO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7bWFyZ2luOjQwcHggMDt9Ci5ubHt9LmVue2Rpc3BsYXk6bm9uZTt9CmJvZHkubGFuZy1lbiAubmx7ZGlzcGxheTpub25lICFpbXBvcnRhbnQ7fQpib2R5LmxhbmctZW4gLmVue2Rpc3BsYXk6YmxvY2sgIWltcG9ydGFudDt9CmJvZHkubGFuZy1lbiBzcGFuLmVue2Rpc3BsYXk6aW5saW5lICFpbXBvcnRhbnQ7fQpib2R5LmxhbmctZW4gc3Bhbi5ubHtkaXNwbGF5Om5vbmUgIWltcG9ydGFudDt9CgovKiDilIDilIAgTU9CSUxFIFJFU1BPTlNJVkUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmhpZGRlbjt9CmltZyx0YWJsZSxpZnJhbWV7bWF4LXdpZHRoOjEwMCU7fQpAbWVkaWEobWF4LXdpZHRoOjc2OHB4KXsKICAud3JhcHtwYWRkaW5nOjAgMTRweCA2MHB4IWltcG9ydGFudDt9CiAgLnRvcGJhcntwYWRkaW5nOjEycHggMDtnYXA6OHB4O30KICAudG9wYmFyLXJpZ2h0e2dhcDo1cHg7fQogIC5idG57Zm9udC1zaXplOjhweDtwYWRkaW5nOjZweCAxMHB4O30KICAub3ZlcnZpZXcsLnN1bW1hcnl7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcikhaW1wb3J0YW50O30KICAuYWRkLXJvd3tmbGV4LWRpcmVjdGlvbjpjb2x1bW47fQogIC5hZGQtcm93IGlucHV0LC5hZGQtcm93IHNlbGVjdHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmZpbHRlci1iYXJ7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7fQogIC5maWx0ZXItYmFyIHNlbGVjdCwuZmlsdGVyLWJhciBpbnB1dHt3aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLmNhcmQtaGVhZHtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4O30KICAucmVjLWhlYWR7ZmxleC1kaXJlY3Rpb246Y29sdW1uO30KICAucHJlZmlsbC1ib3h7bWF4LXdpZHRoOjEwMCU7d2lkdGg6MTAwJTt9CiAgLmcyLC5nMywuZzQsLmNiLWdyaWQsLmNhcmQtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIWltcG9ydGFudDt9CiAgLnByb2plY3QtYmFye2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLnBme21pbi13aWR0aDoxMDAlIWltcG9ydGFudDt9CiAgLnN0ZXBze2ZsZXgtZGlyZWN0aW9uOmNvbHVtbiFpbXBvcnRhbnQ7fQogIC5zdGVwe2JvcmRlci1yaWdodDpub25lIWltcG9ydGFudDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIpO30KICAuc3RlcDpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206bm9uZTt9CiAgLmhvdy1zdGVwe2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjt9CiAgLmZsb3ctc3RlcHtnYXA6MTBweDt9CiAgLnJlYy1mb290e2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O30KICAuYWN0aW9uLWJ0bnt3aWR0aDoxMDAlO2p1c3RpZnktY29udGVudDpjZW50ZXI7Zm9udC1zaXplOjE2cHghaW1wb3J0YW50O30KICAubW9kZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciFpbXBvcnRhbnQ7fQogIC5tb2RlLWJ0bntib3JkZXItcmlnaHQ6bm9uZSFpbXBvcnRhbnQ7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tYm9yZGVyKTt9Cn0KQG1lZGlhKG1heC13aWR0aDo0ODBweCl7CiAgLm92ZXJ2aWV3LC5zdW1tYXJ5e2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyIWltcG9ydGFudDt9CiAgLnRvcGJhcntmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1zdGFydDt9CiAgLnRvcGJhci1yaWdodHtmbGV4LXdyYXA6d3JhcDt9CiAgLmNhcmQtbWV0YXtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4O30KICAuY2FyZC1hY3Rpb25zLC5jYXJkLWFjdGlvbnMgLmJ0biwuY2FyZC1mb290e2ZsZXgtd3JhcDp3cmFwO30KICBoMSxoMiwudG9vbC1uYW1le3dvcmQtYnJlYWs6YnJlYWstd29yZDt9CiAgLnBhbmVse3BhZGRpbmc6MTZweCFpbXBvcnRhbnQ7fQogIC5zZWN0aW9ue3BhZGRpbmc6MTRweCAxNnB4IWltcG9ydGFudDt9Cn0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGRpdiBjbGFzcz0id3JhcCI+Cgo8IS0tIEhlYWRlciAtLT4KPGRpdiBjbGFzcz0iaGVhZGVyIj4KICA8YSBocmVmPSJodHRwczovL2NvbnRlbnRzY2FsZS5zaXRlIiBjbGFzcz0iYnJhbmQiPkNvbnRlbnRTY2FsZTwvYT4KICA8aDE+U0VPIEF1ZGl0IFN5c3RlbSBIYW5kbGVpZGluZzwvaDE+CiAgPHAgY2xhc3M9Im5sIj5TdGFwLXZvb3Itc3RhcCB1aXRsZWcgdmFuIGhldCB2b2xsZWRpZ2Ugc3lzdGVlbSDigJQgdmFuIEdTQyBkYXRhIHRvdCBhZmdlaGFuZGVsZGUgYXVkaXQuIFZvb3IgaW50ZXJuIGdlYnJ1aWsuPC9wPgogIDxwIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlN0ZXAtYnktc3RlcCBleHBsYW5hdGlvbiBvZiB0aGUgY29tcGxldGUgc3lzdGVtIOKAlCBmcm9tIEdTQyBkYXRhIHRvIGNvbXBsZXRlZCBhdWRpdC4gRm9yIGludGVybmFsIHVzZS48L3A+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4OyI+CiAgICA8YnV0dG9uIG9uY2xpY2s9InNldExhbmcoJ25sJykiIGlkPSJidG5OTCIgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo4cHggMThweDtib3JkZXItcmFkaXVzOjVweCAwIDAgNXB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tZ29sZCk7YmFja2dyb3VuZDp2YXIoLS1nb2xkKTtjb2xvcjojMDAwO2N1cnNvcjpwb2ludGVyO2ZvbnQtd2VpZ2h0OjcwMDsiPvCfh7Pwn4exIE5MPC9idXR0b24+CiAgICA8YnV0dG9uIG9uY2xpY2s9InNldExhbmcoJ2VuJykiIGlkPSJidG5FTiIgc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo4cHggMThweDtib3JkZXItcmFkaXVzOjAgNXB4IDVweCAwO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2NvbG9yOnZhcigtLW11dGVkKTtjdXJzb3I6cG9pbnRlcjsiPvCfh7rwn4e4IEVOPC9idXR0b24+CiAgPC9kaXY+CjwvZGl2PgoKPCEtLSBJbmhvdWQgLS0+CjxkaXYgY2xhc3M9InRvYyI+CiAgPGRpdiBjbGFzcz0idG9jLXRpdGxlIj48c3BhbiBjbGFzcz0ibmwiPkluaG91ZDwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5Db250ZW50czwvc3Bhbj48L2Rpdj4KICA8YSBocmVmPSIjb3ZlcnppY2h0Ij48c3Bhbj4wMTwvc3Bhbj48c3BhbiBjbGFzcz0ibmwiPk92ZXJ6aWNodCDigJQgd2F0IGlzIGhldCBzeXN0ZWVtPzwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5PdmVydmlldyDigJQgd2hhdCBpcyB0aGUgc3lzdGVtPzwvc3Bhbj48L2E+CiAgPGEgaHJlZj0iI3Rvb2xzIj48c3Bhbj4wMjwvc3Bhbj48c3BhbiBjbGFzcz0ibmwiPkRlIDUgdG9vbHMg4oCUIHdhdCBkb2V0IGVsa2UgcGFnaW5hPzwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5UaGUgNSB0b29scyDigJQgd2hhdCBkb2VzIGVhY2ggcGFnZSBkbz88L3NwYW4+PC9hPgogIDxhIGhyZWY9IiNmbG93Ij48c3Bhbj4wMzwvc3Bhbj48c3BhbiBjbGFzcz0ibmwiPkRlIHZvbGxlZGlnZSBmbG93IOKAlCBzdGFwIHZvb3Igc3RhcDwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5UaGUgY29tcGxldGUgZmxvdyDigJQgc3RlcCBieSBzdGVwPC9zcGFuPjwvYT4KICA8YSBocmVmPSIjZ3NjIj48c3Bhbj4wNDwvc3Bhbj48c3BhbiBjbGFzcz0ibmwiPkdTQyB1aXRsZWcg4oCUIGltcHJlc3NpZXMsIENUUiwgcG9zaXRpZTwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5HU0MgZXhwbGFpbmVkIOKAlCBpbXByZXNzaW9ucywgQ1RSLCBwb3NpdGlvbjwvc3Bhbj48L2E+CiAgPGEgaHJlZj0iI3NjZW5hcmlvcyI+PHNwYW4+MDU8L3NwYW4+PHNwYW4gY2xhc3M9Im5sIj5BYW5iZXZlbGluZ2VuIOKAlCB3YW5uZWVyIGRvZSBqZSB3YXQ/PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlJlY29tbWVuZGF0aW9ucyDigJQgd2hlbiB0byBkbyB3aGF0Pzwvc3Bhbj48L2E+CiAgPGEgaHJlZj0iI2F1ZGl0Ij48c3Bhbj4wNjwvc3Bhbj48c3BhbiBjbGFzcz0ibmwiPlBVTFNFK05FWFVTIHVpdHZvZXJlbiDigJQgaG9lIHdlcmt0IGhldD88L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+UnVubmluZyBQVUxTRStORVhVUyDigJQgaG93IGRvZXMgaXQgd29yaz88L3NwYW4+PC9hPgogIDxhIGhyZWY9IiNjaGVja2xpc3QiPjxzcGFuPjA3PC9zcGFuPjxzcGFuIGNsYXNzPSJubCI+Q2hlY2tsaXN0IOKAlCB3YXQgZG9lIGplIHBlciBwYWdpbmE/PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPkNoZWNrbGlzdCDigJQgd2hhdCB0byBkbyBwZXIgcGFnZT88L3NwYW4+PC9hPgogIDxhIGhyZWY9IiNkZXBsb3kiPjxzcGFuPjA4PC9zcGFuPjxzcGFuIGNsYXNzPSJubCI+RGVwbG95ZW4g4oCUIGJlc3RhbmRlbiBlbiByb3V0ZXM8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+RGVwbG95IOKAlCBmaWxlcyBhbmQgcm91dGVzPC9zcGFuPjwvYT4KPC9kaXY+Cgo8IS0tIDAxIE92ZXJ6aWNodCAtLT4KPGRpdiBjbGFzcz0ic2VjdGlvbiIgaWQ9Im92ZXJ6aWNodCI+CiAgPGRpdiBjbGFzcz0ic2VjdGlvbi1sYWJlbCI+PHNwYW4gY2xhc3M9Im5sIj5TZWN0aWUgMDE8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U2VjdGlvbiAwMTwvc3Bhbj48L2Rpdj4KICA8aDI+PHNwYW4gY2xhc3M9Im5sIj5XYXQgaXMgaGV0IHN5c3RlZW0/PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPldoYXQgaXMgdGhlIHN5c3RlbT88L3NwYW4+PC9oMj4KICA8cD48c3BhbiBjbGFzcz0ibmwiPkhldCBDb250ZW50U2NhbGUgU0VPIEF1ZGl0IFN5c3RlbSBiZXN0YWF0IHVpdCA8c3Ryb25nPjUgZ2Vrb3BwZWxkZSB0b29sczwvc3Ryb25nPiB3YWFybWVlIGplIHN5c3RlbWF0aXNjaCBwYWdpbmEncyB2YW4gZWVuIHdlYnNpdGUga3VudCBhdWRpdGVuLCB2ZXJiZXRlcmVuIGVuIGJpamhvdWRlbi4gQWxsZXMgd2Vya3Qgc2FtZW4g4oCUIGRhdGEgc3Ryb29tdCBhdXRvbWF0aXNjaCB2YW4gZGUgZW5lIHRvb2wgbmFhciBkZSBhbmRlcmUuPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRoZSBDb250ZW50U2NhbGUgU0VPIEF1ZGl0IFN5c3RlbSBjb25zaXN0cyBvZiA8c3Ryb25nPjUgY29ubmVjdGVkIHRvb2xzPC9zdHJvbmc+IGZvciBzeXN0ZW1hdGljYWxseSBhdWRpdGluZywgaW1wcm92aW5nLCBhbmQgdHJhY2tpbmcgcGFnZXMgb2YgYSB3ZWJzaXRlLiBFdmVyeXRoaW5nIHdvcmtzIHRvZ2V0aGVyIOKAlCBkYXRhIGZsb3dzIGF1dG9tYXRpY2FsbHkgZnJvbSBvbmUgdG9vbCB0byB0aGUgbmV4dC48L3NwYW4+PC9wPgoKICA8ZGl2IGNsYXNzPSJpbmZvLWJveCBnb2xkIj4KICAgIDxzcGFuIGNsYXNzPSJubCI+PHN0cm9uZz5IZXQgZG9lbDo8L3N0cm9uZz4gUGFnaW5hJ3MgZGllIGJpam5hIG9wIHBhZ2luYSAxIHN0YWFuIChwb3NpdGllIDExLTMwKSBpZGVudGlmaWNlcmVuLCBhdWRpdGVuIG1ldCBQVUxTRStORVhVUywgZml4ZXMgZG9vcnZvZXJlbiwgZW4gaGV0IHJlc3VsdGFhdCBtZXRlbiBtZXQgZGUgQ29udGVudFNjb3JlLiBabyBoZXJzdGVsIGplIHN5c3RlbWF0aXNjaCB2ZXJsb3JlbiBHb29nbGUgdHJhZmZpYy48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+PHN0cm9uZz5UaGUgZ29hbDo8L3N0cm9uZz4gSWRlbnRpZnkgcGFnZXMgY2xvc2UgdG8gcGFnZSAxIChwb3NpdGlvbiAxMS0zMCksIGF1ZGl0IHdpdGggUFVMU0UrTkVYVVMsIGltcGxlbWVudCBmaXhlcywgYW5kIG1lYXN1cmUgdGhlIHJlc3VsdCB3aXRoIENvbnRlbnRTY29yZS4gVGhpcyBpcyBob3cgeW91IHN5c3RlbWF0aWNhbGx5IHJlY292ZXIgbG9zdCBHb29nbGUgdHJhZmZpYy48L3NwYW4+CiAgPC9kaXY+CgogIDxwPjxzcGFuIGNsYXNzPSJubCI+SGV0IHN5c3RlZW0gaXMgPHN0cm9uZz5pbnRlcm48L3N0cm9uZz4g4oCUIG5pZXQgemljaHRiYWFyIHZvb3IgR29vZ2xlIChub2luZGV4KSBlbiBuaWV0IHZvb3Iga2xhbnRlbi4gRXIgaXMgw6nDqW4gdWl0em9uZGVyaW5nOiBkZSBBdWRpdCBJbnRha2UgRm9ybSwgZGllIGlzIHZvb3Iga2xhbnRlbiBkaWUgZWVuIGF1ZGl0IHdpbGxlbiBhYW52cmFnZW4uPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRoZSBzeXN0ZW0gaXMgPHN0cm9uZz5pbnRlcm5hbDwvc3Ryb25nPiDigJQgbm90IHZpc2libGUgdG8gR29vZ2xlIChub2luZGV4KSBhbmQgbm90IHRvIGNsaWVudHMuIE9uZSBleGNlcHRpb246IHRoZSBBdWRpdCBJbnRha2UgRm9ybSwgd2hpY2ggaXMgZm9yIGNsaWVudHMgd2hvIHdhbnQgdG8gcmVxdWVzdCBhbiBhdWRpdC48L3NwYW4+PC9wPgo8L2Rpdj4KCjwhLS0gMDIgRGUgdG9vbHMgLS0+CjxkaXYgY2xhc3M9InNlY3Rpb24iIGlkPSJ0b29scyI+CiAgPGRpdiBjbGFzcz0ic2VjdGlvbi1sYWJlbCI+PHNwYW4gY2xhc3M9Im5sIj5TZWN0aWUgMDI8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U2VjdGlvbiAwMjwvc3Bhbj48L2Rpdj4KICA8aDI+PHNwYW4gY2xhc3M9Im5sIj5EZSA1IHRvb2xzPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRoZSA1IHRvb2xzPC9zcGFuPjwvaDI+CgogIDxkaXYgY2xhc3M9InRvb2wtY2FyZCBnb2xkIj4KICAgIDxzcGFuIGNsYXNzPSJ0b29sLWJhZGdlIGJhZGdlLWludGVybmFsIj5JbnRlcm48L3NwYW4+CiAgICA8c3BhbiBjbGFzcz0idG9vbC1iYWRnZSBiYWRnZS1ub2luZGV4IiBzdHlsZT0ibWFyZ2luLWxlZnQ6NnB4OyI+Tm9pbmRleDwvc3Bhbj4KICAgIDxkaXYgY2xhc3M9InRvb2wtbmFtZSI+MSDigJQgV29ya2Zsb3cgTWFuYWdlcjwvZGl2PgogICAgPGRpdiBjbGFzcz0idG9vbC11cmwiPmFwcC5jb250ZW50c2NhbGUuc2l0ZS9hdWRpdC13b3JrZmxvdzwvZGl2PgogICAgPGRpdiBjbGFzcz0idG9vbC1kZXNjIj4KICAgICAgPHNwYW4gY2xhc3M9Im5sIj5KZSBjb2NrcGl0LiBIaWVyIGJlaGVlciBqZSBhbGxlIHBhZ2luYSdzIHZhbiBlZW4gY2xpZW50LiBKZSBpbXBvcnRlZXJ0IEdTQyBkYXRhLCB6aWV0IHdlbGtlIHBhZ2luYSdzIHByaW9yaXRlaXQgaGViYmVuLCB2aW5rdCB0YWtlbiBhZiBwZXIgcGFnaW5hIGVuIGhvdWR0IGRlIHZvb3J0Z2FuZyBiaWouPGJyPjxicj4KICAgICAgPHN0cm9uZz5XYXQgamUgaGllciBkb2V0Ojwvc3Ryb25nPiBHU0MgQ1NWIGltcG9ydGVyZW4g4oaSIHBhZ2luYSdzIGtyaWpnZW4gYXV0b21hdGlzY2ggcHJpb3JpdGVpdCDihpIgZG9vcnN0dXJlbiBuYWFyIFJlY29tbWVuZGF0aW9ucyB2b29yIGFhbmJldmVsaW5nZW4g4oaSIGFmdmlua2VuIGFscyBnZWRhYW4uPGJyPjxicj4KICAgICAgPHN0cm9uZz5EYXRhIGJsaWpmdCBiZXdhYXJkPC9zdHJvbmc+IGluIGRlIGJyb3dzZXIgKGxvY2FsU3RvcmFnZSkg4oCUIGplIGt1bnQgZGUgc2Vzc2llIGFmc2x1aXRlbiBlbiBsYXRlciB2ZXJkZXJnYWFuLjwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+WW91ciBjb2NrcGl0LiBNYW5hZ2UgYWxsIGNsaWVudCBwYWdlcyBoZXJlLiBJbXBvcnQgR1NDIGRhdGEsIHNlZSB3aGljaCBwYWdlcyBoYXZlIHByaW9yaXR5LCBjaGVjayBvZmYgdGFza3MgcGVyIHBhZ2UgYW5kIHRyYWNrIHByb2dyZXNzLjxicj48YnI+CiAgICAgIDxzdHJvbmc+V2hhdCB5b3UgZG8gaGVyZTo8L3N0cm9uZz4gSW1wb3J0IEdTQyBDU1Yg4oaSIHBhZ2VzIGdldCBwcmlvcml0eSBhdXRvbWF0aWNhbGx5IOKGkiBzZW5kIHRvIFJlY29tbWVuZGF0aW9ucyBmb3IgYWR2aWNlIOKGkiBjaGVjayBvZmYgd2hlbiBkb25lLjxicj48YnI+CiAgICAgIDxzdHJvbmc+RGF0YSBpcyBzYXZlZDwvc3Ryb25nPiBpbiB0aGUgYnJvd3NlciAobG9jYWxTdG9yYWdlKSDigJQgeW91IGNhbiBjbG9zZSB0aGUgc2Vzc2lvbiBhbmQgY29udGludWUgbGF0ZXIuPC9zcGFuPgogICAgPC9kaXY+CiAgPC9kaXY+CgogIDxkaXYgY2xhc3M9InRvb2wtY2FyZCBvcmFuZ2UiPgogICAgPHNwYW4gY2xhc3M9InRvb2wtYmFkZ2UgYmFkZ2UtaW50ZXJuYWwiPkludGVybjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJ0b29sLWJhZGdlIGJhZGdlLW5vaW5kZXgiIHN0eWxlPSJtYXJnaW4tbGVmdDo2cHg7Ij5Ob2luZGV4PC9zcGFuPgogICAgPGRpdiBjbGFzcz0idG9vbC1uYW1lIj4yIOKAlCBSZWNvbW1lbmRhdGlvbnMgRW5naW5lPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ0b29sLXVybCI+YXBwLmNvbnRlbnRzY2FsZS5zaXRlL2F1ZGl0LXJlY29tbWVuZGF0aW9uczwvZGl2PgogICAgPGRpdiBjbGFzcz0idG9vbC1kZXNjIj4KICAgICAgPHNwYW4gY2xhc3M9Im5sIj5MZWVzdCBkZSBkYXRhIHVpdCBkZSBXb3JrZmxvdyBNYW5hZ2VyIGVuIGdlZWZ0IHBlciBwYWdpbmEgYXV0b21hdGlzY2ggZGUgYmVzdGUgYWFuYmV2ZWxpbmcuIEplIHppZXQgaW4gw6nDqW4gb29nb3BzbGFnOiB3YXQgaXMgaGV0IHByb2JsZWVtLCB3YXQgaXMgZGUgYWN0aWUsIGhvZXZlZWwgdGlqZCBrb3N0IGhldCwgZW4gd2F0IHdvcmR0IGF1dG9tYXRpc2NoIGluZ2V2dWxkIGluIFBVTFNFK05FWFVTLjxicj48YnI+CiAgICAgIDxzdHJvbmc+V2F0IGplIGhpZXIgZG9ldDo8L3N0cm9uZz4gS2lqa2VuIHdlbGtlIHBhZ2luYSdzIHF1aWNrIHdpbnMgemlqbiDihpIga2xpa2tlbiBvcCAiT3BlbiBpbiBQVUxTRStORVhVUyIg4oaSIGF1ZGl0IHVpdHZvZXJlbi48L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlJlYWRzIGRhdGEgZnJvbSB0aGUgV29ya2Zsb3cgTWFuYWdlciBhbmQgYXV0b21hdGljYWxseSBnaXZlcyB0aGUgYmVzdCByZWNvbW1lbmRhdGlvbiBwZXIgcGFnZS4gQXQgYSBnbGFuY2U6IHdoYXQgaXMgdGhlIHByb2JsZW0sIHdoYXQgaXMgdGhlIGFjdGlvbiwgaG93IGxvbmcgd2lsbCBpdCB0YWtlLCBhbmQgd2hhdCBnZXRzIHByZS1maWxsZWQgaW4gUFVMU0UrTkVYVVMuPGJyPjxicj4KICAgICAgPHN0cm9uZz5XaGF0IHlvdSBkbyBoZXJlOjwvc3Ryb25nPiBTZWUgd2hpY2ggcGFnZXMgYXJlIHF1aWNrIHdpbnMg4oaSIGNsaWNrICJPcGVuIGluIFBVTFNFK05FWFVTIiDihpIgcnVuIHRoZSBhdWRpdC48L3NwYW4+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPGRpdiBjbGFzcz0idG9vbC1jYXJkIHB1cnBsZSI+CiAgICA8c3BhbiBjbGFzcz0idG9vbC1iYWRnZSBiYWRnZS1pbnRlcm5hbCI+SW50ZXJuPC9zcGFuPgogICAgPHNwYW4gY2xhc3M9InRvb2wtYmFkZ2UgYmFkZ2Utbm9pbmRleCIgc3R5bGU9Im1hcmdpbi1sZWZ0OjZweDsiPk5vaW5kZXg8L3NwYW4+CiAgICA8ZGl2IGNsYXNzPSJ0b29sLW5hbWUiPjMg4oCUIFBVTFNFICsgTkVYVVMgQXVkaXQgRW5naW5lPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ0b29sLXVybCI+YXBwLmNvbnRlbnRzY2FsZS5zaXRlL2F1ZGl0LXNlbzwvZGl2PgogICAgPGRpdiBjbGFzcz0idG9vbC1kZXNjIj4KICAgICAgSGV0IGFuYWx5c2V0b29scy4gVm9lcnQgZWVuIDEwLXN0YXBwZW4gYXVkaXQgdWl0IG9wIMOpw6luIHNwZWNpZmlla2UgcGFnaW5hLiBHZWJydWlrdCBHZW1pbmkgQUkgb20gZGUgd2Vya2VsaWprZSBjb250ZW50IHRlIGFuYWx5c2VyZW4gZW4gZ2VlZnQgY29uY3JldGUgYWFuYmV2ZWxpbmdlbiBtZXQgcHJpb3JpdHkgYWN0aW9ucyBib3ZlbmFhbi48YnI+PGJyPgogICAgICA8c3Ryb25nPlR3ZWUgbW9kaTo8L3N0cm9uZz48YnI+CiAgICAgIOKAlCA8c3Ryb25nPkJ1bGsgU2Nhbjo8L3N0cm9uZz4gVXBsb2FkIEdTQyBDU1Yg4oaSIGFsbGUgcGFnaW5hJ3MgZ2VyYW5nc2NoaWt0IG9wIGthbnM8YnI+CiAgICAgIOKAlCA8c3Ryb25nPkRlZXAgRGl2ZTo8L3N0cm9uZz4gw4nDqW4gcGFnaW5hIHZvbGxlZGlnIGFuYWx5c2VyZW4g4oCUIGRpdCBpcyBkZSBrZXJuPGJyPjxicj4KICAgICAgPHN0cm9uZz5Xb3JkdCBhdXRvbWF0aXNjaCBpbmdldnVsZDwvc3Ryb25nPiBhbHMgamUgdmFudWl0IFJlY29tbWVuZGF0aW9ucyBrbGlrdDogVVJMLCBrZXl3b3JkLCBwb3NpdGllLCBpbXByZXNzaWVzLCBDVFIgc3RhYW4gYWwga2xhYXIuIEppaiBwbGFrdCBhbGxlZW4gbm9nIGRlIHBhZ2luYSBIVE1MIGVuIGV2ZW50dWVlbCBjb21wZXRpdG9yIEhUTUwuCiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPGRpdiBjbGFzcz0idG9vbC1jYXJkIGJsdWUiPgogICAgPHNwYW4gY2xhc3M9InRvb2wtYmFkZ2UgYmFkZ2UtaW50ZXJuYWwiPkludGVybjwvc3Bhbj4KICAgIDxkaXYgY2xhc3M9InRvb2wtbmFtZSI+NCDigJQgQ29udGVudFNjb3JlIFNjYW5uZXI8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InRvb2wtdXJsIj5hcHAuY29udGVudHNjYWxlLnNpdGU8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InRvb2wtZGVzYyI+CiAgICAgIERlIGdyYXRpcyBzY2FubmVyLiBQbGFrIGVlbiBVUkwgZW4ga3JpamcgZWVuIHNjb3JlIHZhbiAwLTEwMCBvcCBiYXNpcyB2YW4gR1JBQUYgKDUwcHQpICsgQ1JBRlQgKDMwcHQpICsgVGVjaG5pY2FsIFNFTyAoMjBwdCkuPGJyPjxicj4KICAgICAgPHN0cm9uZz5HZWJydWlrIGluIGhldCBhdWRpdCBzeXN0ZWVtOjwvc3Ryb25nPiBTY2FuIGVlbiBwYWdpbmEgVk9PUiBqZSBiZWdpbnQgbWV0IGF1ZGl0ZW4g4oaSIG5vdGVlciBkZSBzY29yZSBpbiBkZSBXb3JrZmxvdyBNYW5hZ2VyIOKGkiBkb2UgZGUgYXVkaXQg4oaSIGZpeCBkZSBwYWdpbmEg4oaSIHNjYW4gb3BuaWV1dyDihpIgbm90ZWVyIGRlIG5pZXV3ZSBzY29yZS4gSGV0IHZlcnNjaGlsIGlzIGplIGJld2lqcyBkYXQgaGV0IHdlcmt0LgogICAgPC9kaXY+CiAgPC9kaXY+CgogIDxkaXYgY2xhc3M9InRvb2wtY2FyZCBncmVlbiI+CiAgICA8c3BhbiBjbGFzcz0idG9vbC1iYWRnZSBiYWRnZS1jbGllbnQiPlZvb3Iga2xhbnRlbjwvc3Bhbj4KICAgIDxkaXYgY2xhc3M9InRvb2wtbmFtZSI+NSDigJQgQXVkaXQgSW50YWtlIEZvcm08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InRvb2wtdXJsIj5hcHAuY29udGVudHNjYWxlLnNpdGUvYXVkaXQtaW50YWtlPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ0b29sLWRlc2MiPgogICAgICBIZXQgZm9ybXVsaWVyIGRhdCBrbGFudGVuIGludnVsbGVuIGFscyB6ZSBlZW4gYXVkaXQgd2lsbGVuIGFhbnZyYWdlbi4gWmUgdXBsb2FkZW4gaHVuIEdTQyBDU1YsIGdldmVuIGRlIHBhZ2luYSBVUkwgZW4ga2V5d29yZCBvcCwgZW4gaGV0IGZvcm11bGllciBzdHV1cnQgYWxsZXMgYXV0b21hdGlzY2ggcGVyIGVtYWlsIG5hYXIgPHN0cm9uZz48YSBocmVmPSIvY2RuLWNnaS9sL2VtYWlsLXByb3RlY3Rpb24iIGNsYXNzPSJfX2NmX2VtYWlsX18iIGRhdGEtY2ZlbWFpbD0iOGJlMmU1ZWRlNGNiZThlNGU1ZmZlZWU1ZmZmOGU4ZWFlN2VlYTVmOGUyZmZlZSI+W2VtYWlsJiMxNjA7cHJvdGVjdGVkXTwvYT48L3N0cm9uZz4uPGJyPjxicj4KICAgICAgPHN0cm9uZz5KaWogb250dmFuZ3Q6PC9zdHJvbmc+IEVtYWlsIG1ldCBhbGxlIGRhdGEgKyBiaWpsYWdlbiArIGRpcmVjdGUgbGluayBvbSBkZSBwYWdpbmEgaW4gUFVMU0UrTkVYVVMgdGUgb3BlbmVuLgogICAgPC9kaXY+CiAgPC9kaXY+CjwvZGl2PgoKPCEtLSAwMyBGbG93IC0tPgo8ZGl2IGNsYXNzPSJzZWN0aW9uIiBpZD0iZmxvdyI+CiAgPGRpdiBjbGFzcz0ic2VjdGlvbi1sYWJlbCI+PHNwYW4gY2xhc3M9Im5sIj5TZWN0aWUgMDM8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U2VjdGlvbiAwMzwvc3Bhbj48L2Rpdj4KICA8aDI+PHNwYW4gY2xhc3M9Im5sIj5EZSB2b2xsZWRpZ2UgZmxvdzwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5UaGUgY29tcGxldGUgZmxvdzwvc3Bhbj48L2gyPgogIDxwPjxzcGFuIGNsYXNzPSJubCI+Wm8gZ2VicnVpayBqZSBoZXQgc3lzdGVlbSB2YW4gYmVnaW4gdG90IGVpbmQgdm9vciDDqcOpbiBjbGllbnQ6PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRoaXMgaXMgaG93IHlvdSB1c2UgdGhlIHN5c3RlbSBmcm9tIHN0YXJ0IHRvIGZpbmlzaCBmb3Igb25lIGNsaWVudDo8L3NwYW4+PC9wPgoKICA8ZGl2IGNsYXNzPSJmbG93Ij4KCiAgICA8ZGl2IGNsYXNzPSJmbG93LXN0ZXAiPgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWxlZnQiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbnVtIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtjb2xvcjp2YXIoLS1nb2xkKTsiPjE8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LWxpbmUiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZmxvdy1ib2R5Ij4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXRpdGxlIj5HU0MgQ1NWIGV4cG9ydGVyZW48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXN1YiI+R2EgbmFhciA8c3Ryb25nPkdvb2dsZSBTZWFyY2ggQ29uc29sZTwvc3Ryb25nPiB2YW4gZGUgY2xpZW50LiBLbGlrIG9wIDxzdHJvbmc+UGVyZm9ybWFuY2U8L3N0cm9uZz4g4oaSIDxzdHJvbmc+UGFnZXMgdGFiPC9zdHJvbmc+IOKGkiByZWNodHNib3ZlbiBvcCA8c3Ryb25nPkV4cG9ydCDihpIgRG93bmxvYWQgQ1NWPC9zdHJvbmc+LiBEb2UgaGV0emVsZmRlIHZvb3IgZGUgPHN0cm9uZz5RdWVyaWVzIHRhYjwvc3Ryb25nPiAob3B0aW9uZWVsIG1hYXIgbnV0dGlnKS4gU2xhIGRlIGJlc3RhbmRlbiBvcC48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXVybCI+c2VhcmNoLmdvb2dsZS5jb20vc2VhcmNoLWNvbnNvbGU8L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJmbG93LXN0ZXAiPgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWxlZnQiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbnVtIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtjb2xvcjp2YXIoLS1nb2xkKTsiPjI8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LWxpbmUiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZmxvdy1ib2R5Ij4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXRpdGxlIj5Xb3JrZmxvdyBNYW5hZ2VyIG9wZW5lbiArIEdTQyBpbXBvcnRlcmVuPC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1zdWIiPk9wZW4gZGUgV29ya2Zsb3cgTWFuYWdlci4gVnVsIGJvdmVuYWFuIGRlIGNsaWVudG5hYW0sIHdlYnNpdGUgZW4gZGVhZGxpbmUgaW4uIEtsaWsgb3AgPHN0cm9uZz7wn5OKIEltcG9ydCBHU0MgQ1NWPC9zdHJvbmc+IGVuIHVwbG9hZCBoZXQgUGFnZXMgQ1NWIGJlc3RhbmQuIEFsbGUgcGFnaW5hJ3MgbGFkZW4gYXV0b21hdGlzY2ggbWV0IGh1biBwb3NpdGllLCBpbXByZXNzaWVzIGVuIHByaW9yaXRlaXQuPC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy11cmwiPmFwcC5jb250ZW50c2NhbGUuc2l0ZS9hdWRpdC13b3JrZmxvdzwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9ImZsb3ctc3RlcCI+CiAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGVmdCI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1udW0iIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpOyI+MzwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGluZSI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWJvZHkiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctdGl0bGUiPlByaW9yaXRlaXRlbiBiZWtpamtlbjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctc3ViIj5EZSBtYW5hZ2VyIHNvcnRlZXJ0IGF1dG9tYXRpc2NoIG9wIGthbnMuIDxzdHJvbmc+Um9vZCAoSGlnaCk8L3N0cm9uZz4gPSBwb3NpdGllIDExLTMwIG9mIHBhZ2luYSAxIG1ldCBsYWdlIENUUiDigJQgZGl0IHppam4gZGUgbWVlc3Qgd2FhcmRldm9sbGUgcGFnaW5hJ3MuIDxzdHJvbmc+R2VlbCAoTWVkaXVtKTwvc3Ryb25nPiA9IHBvc2l0aWUgMzEtNjAuIDxzdHJvbmc+R3JvZW4gKExvdyk8L3N0cm9uZz4gPSBhbCBnb2VkIG9mIHdlaW5pZyB2b2x1bWUuIEZpbHRlciBvcCBIaWdoIFByaW9yaXR5IG9tIHRlIGJlZ2lubmVuLjwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9ImZsb3ctc3RlcCI+CiAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGVmdCI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1udW0iIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpOyI+NDwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGluZSI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWJvZHkiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctdGl0bGUiPkNvbnRlbnRTY29yZSBzY2FubmVuICh2b29yKTwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctc3ViIj5LbGlrIHBlciBwYWdpbmEgb3AgPHN0cm9uZz7wn5OKIFNjYW4gU2NvcmU8L3N0cm9uZz4uIERlIGh1aWRpZ2UgQ29udGVudFNjb3JlIHdvcmR0IG9wZ2VoYWFsZCBlbiBvcGdlc2xhZ2VuIGFscyAiU2NvcmUgQmVmb3JlIi4gRGl0IGlzIGplIG51bG1ldGluZy4gRGUgcHJpb3JpdGVpdCB2ZXJhbmRlcnQgTklFVCBvcCBiYXNpcyB2YW4gZGUgc2NvcmUg4oCUIGFsbGVlbiBHU0MgZGF0YSBiZXBhYWx0IHByaW9yaXRlaXQuPC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0iZmxvdy1zdGVwIj4KICAgICAgPGRpdiBjbGFzcz0iZmxvdy1sZWZ0Ij4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LW51bSIgc3R5bGU9ImJhY2tncm91bmQ6cmdiYSgyNTEsMTkxLDM2LC4xNSk7Y29sb3I6dmFyKC0tZ29sZCk7Ij41PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1saW5lIj48L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImZsb3ctYm9keSI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy10aXRsZSI+UmVjb21tZW5kYXRpb25zIG9wZW5lbjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctc3ViIj5LbGlrIGJvdmVuYWFuIG9wIDxzdHJvbmc+8J+OryBSZWNvbW1lbmRhdGlvbnM8L3N0cm9uZz4uIEplIHppZXQgbnUgcGVyIHBhZ2luYSBkZSBleGFjdGUgYWFuYmV2ZWxpbmc6IHdhdCBpcyBoZXQgcHJvYmxlZW0sIHdhdCBpcyBkZSBhY3RpZSwgaG9ldmVlbCB0aWpkIGtvc3QgaGV0LiBTb3J0ZWVyIG9wIEltcGFjdCB2b29yIGRlIGJlc3RlIHF1aWNrIHdpbnMgYm92ZW5hYW4uPC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy11cmwiPmFwcC5jb250ZW50c2NhbGUuc2l0ZS9hdWRpdC1yZWNvbW1lbmRhdGlvbnM8L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJmbG93LXN0ZXAiPgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWxlZnQiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbnVtIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjE1KTtjb2xvcjp2YXIoLS1nb2xkKTsiPjY8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LWxpbmUiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0iZmxvdy1ib2R5Ij4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXRpdGxlIj5QVUxTRStORVhVUyBhdWRpdCB1aXR2b2VyZW48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXN1YiI+S2xpayBvcCA8c3Ryb25nPvCflKwgT3BlbiBpbiBQVUxTRStORVhVUzwvc3Ryb25nPi4gVVJMLCBrZXl3b3JkLCBwb3NpdGllLCBpbXByZXNzaWVzIGVuIENUUiBzdGFhbiBhdXRvbWF0aXNjaCBpbmdldnVsZC4gSmUgaG9lZnQgYWxsZWVuIG5vZyB0ZSBwbGFra2VuOjxicj4KICAgICAgICDigJQgPHN0cm9uZz5QYWdpbmEgSFRNTDo8L3N0cm9uZz4gb3BlbiBkZSBwYWdpbmEg4oaSIHJlY2h0c2tsaWsg4oaSIFBhZ2luYWJyb24gd2VlcmdldmVuIOKGkiBDdHJsK0Eg4oaSIEN0cmwrQyDihpIgcGxhazxicj4KICAgICAgICDigJQgPHN0cm9uZz5Db21wZXRpdG9yIEhUTUw6PC9zdHJvbmc+IG9wdGlvbmVlbCDigJQgYWxzIGplIGxlZWcgbGFhdCB2ZXJnZWxpamt0IGhldCB0b29sIG1ldCBTdXJmZXIgU0VPICsgTWFya2V0TXVzZSBiZW5jaG1hcms8YnI+CiAgICAgICAg4oCUIDxzdHJvbmc+U2l0ZW1hcCBVUkxzOjwvc3Ryb25nPiBvcHRpb25lZWwg4oCUIHZvb3IgaW50ZXJuZSBsaW5rIGFhbmJldmVsaW5nZW48YnI+PGJyPgogICAgICAgIEtsaWsgZGFuIG9wIDxzdHJvbmc+UnVuIEZ1bGwgQXVkaXQ8L3N0cm9uZz4uIERlIFByaW9yaXR5IEFjdGlvbnMgdmVyc2NoaWpuZW4gYWxzIGVlcnN0ZS48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXVybCI+YXBwLmNvbnRlbnRzY2FsZS5zaXRlL2F1ZGl0LXNlbzwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9ImZsb3ctc3RlcCI+CiAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGVmdCI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1udW0iIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpOyI+NzwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGluZSI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWJvZHkiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctdGl0bGUiPkZpeGVzIGRvb3J2b2VyZW48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXN1YiI+Vm9lciBkZSBQcmlvcml0eSBBY3Rpb25zIHVpdCBvcCBkZSBwYWdpbmEuIE1pbmltYWFsOiB0aXRsZSB0YWcsIG1ldGEgZGVzY3JpcHRpb24sIEgxLCBGQVEgc2NoZW1hLiBEYWFybmEgZGUgY29udGVudCBmaXhlcy4gRXhwb3J0ZWVyIGRlIGFhbmJldmVsaW5nZW4gbWV0IGRlIENvcHkga25vcCBwZXIgc2VjdGllLjwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgY2xhc3M9ImZsb3ctc3RlcCI+CiAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGVmdCI+CiAgICAgICAgPGRpdiBjbGFzcz0iZmxvdy1udW0iIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjUxLDE5MSwzNiwuMTUpO2NvbG9yOnZhcigtLWdvbGQpOyI+ODwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbGluZSI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWJvZHkiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctdGl0bGUiPkFmdmlua2VuICsgc2NvcmUgbWV0ZW48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXN1YiI+R2EgdGVydWcgbmFhciBkZSBXb3JrZmxvdyBNYW5hZ2VyICjihpAgVGVydWcgbmFhciBXb3JrZmxvdyBrbm9wKS4gVmluayBkZSBjaGVja2xpc3QgaXRlbXMgYWYgZGllIGplIGhlYnQgZ2VkYWFuLiBTY2FuIGRlIHBhZ2luYSBvcG5pZXV3IHZvb3IgZGUgIlNjb3JlIEFmdGVyIi4gS2xpayBvcCA8c3Ryb25nPuKckyBNYXJrIERvbmU8L3N0cm9uZz4gYWxzIGRlIHBhZ2luYSBrbGFhciBpcy48L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJmbG93LXN0ZXAiPgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWxlZnQiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctbnVtIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDc0LDIyMiwxMjgsLjE1KTtjb2xvcjp2YXIoLS1ncmVlbik7Ij45PC9kaXY+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJmbG93LWJvZHkiPgogICAgICAgIDxkaXYgY2xhc3M9ImZsb3ctdGl0bGUiPkV4cG9ydGVyZW4gKyB2b2xnZW5kZSBwYWdpbmE8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJmbG93LXN1YiI+S2xpayBvcCA8c3Ryb25nPuKGkyBFeHBvcnQgQ1NWPC9zdHJvbmc+IG9tIGplIHZvb3J0Z2FuZyBvcCB0ZSBzbGFhbi4gVm9sZ2VuZGUgc2Vzc2llOiA8c3Ryb25nPuKGkSBJbXBvcnQgUHJvZ3Jlc3M8L3N0cm9uZz4gb20gdmVyZGVyIHRlIGdhYW4uIEtsaWsgb3AgPHN0cm9uZz7wn5OEIENsaWVudCBSZXBvcnQ8L3N0cm9uZz4gdm9vciBlZW4gbmV0dGUgb3ZlcnppY2h0c3BhZ2luYSB2b29yIGRlIGtsYW50LjwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgoKICA8L2Rpdj4KPC9kaXY+Cgo8IS0tIDA0IEdTQyAtLT4KPGRpdiBjbGFzcz0ic2VjdGlvbiIgaWQ9ImdzYyI+CiAgPGRpdiBjbGFzcz0ic2VjdGlvbi1sYWJlbCI+PHNwYW4gY2xhc3M9Im5sIj5TZWN0aWUgMDQ8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U2VjdGlvbiAwNDwvc3Bhbj48L2Rpdj4KICA8aDI+PHNwYW4gY2xhc3M9Im5sIj5HU0MgdWl0bGVnIOKAlCBpbXByZXNzaWVzLCBDVFIgZW4gcG9zaXRpZTwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5HU0MgZXhwbGFpbmVkIOKAlCBpbXByZXNzaW9ucywgQ1RSIGFuZCBwb3NpdGlvbjwvc3Bhbj48L2gyPgoKICA8dGFibGUgY2xhc3M9ImRhdGEtdGFibGUiPgogICAgPHRoZWFkPgogICAgICA8dHI+PHRoPjxzcGFuIGNsYXNzPSJubCI+QmVncmlwPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRlcm08L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5XYXQgYmV0ZWtlbnQgaGV0Pzwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5XaGF0IGRvZXMgaXQgbWVhbj88L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5XYXQgemVndCBoZXQgamU/PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPldoYXQgZG9lcyBpdCB0ZWxsIHlvdT88L3NwYW4+PC90aD48L3RyPgogICAgPC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPgogICAgICAgIDx0ZD48c3Ryb25nPkltcHJlc3NpZXM8L3N0cm9uZz48L3RkPgogICAgICAgIDx0ZD5Ib2UgdmFhayBqb3V3IHBhZ2luYSB2ZXJzY2hpam50IGluIGRlIHpvZWtyZXN1bHRhdGVuIOKAlCBvb2sgYWxzIG5pZW1hbmQga2xpa3QuIERpdCBpcyBoZXQgem9la3ZvbHVtZSB2b29yIGpvdXcgcGFnaW5hLjwvdGQ+CiAgICAgICAgPHRkPkhvZ2UgaW1wcmVzc2llcyA9IG1lbnNlbiB6b2VrZW4gZXJuYWFyLiBFciBpcyB2cmFhZy4gRGUgcGFnaW5hIGhlZWZ0IHBvdGVudGllLjwvdGQ+CiAgICAgIDwvdHI+CiAgICAgIDx0cj4KICAgICAgICA8dGQ+PHN0cm9uZz5DbGlja3M8L3N0cm9uZz48L3RkPgogICAgICAgIDx0ZD5Ib2UgdmFhayBpZW1hbmQgb3Agam91dyBwYWdpbmEga2xpa3QgaW4gZGUgem9la3Jlc3VsdGF0ZW4uPC90ZD4KICAgICAgICA8dGQ+TGFnZSBjbGlja3MgYmlqIGhvZ2UgaW1wcmVzc2llcyA9IG1lbnNlbiB6aWVuIGplIG1hYXIga2llemVuIGplIG5pZXQuPC90ZD4KICAgICAgPC90cj4KICAgICAgPHRyPgogICAgICAgIDx0ZD48c3Ryb25nPkNUUiAlPC9zdHJvbmc+PC90ZD4KICAgICAgICA8dGQ+Q2xpY2stVGhyb3VnaCBSYXRlLiBQZXJjZW50YWdlIHZhbiBpbXByZXNzaWVzIGRhdCByZXN1bHRlZXJ0IGluIGVlbiBrbGlrLiBDbGlja3Mgw7cgSW1wcmVzc2llcyDDlyAxMDAuPC90ZD4KICAgICAgICA8dGQ+Q1RSIG9uZGVyIDIlID0gdGl0bGUvbWV0YSBuaWV0IGFhbnRyZWtrZWxpamsgZ2Vub2VnLiBDVFIgYm92ZW4gNSUgPSBnb2VkLjwvdGQ+CiAgICAgIDwvdHI+CiAgICAgIDx0cj4KICAgICAgICA8dGQ+PHN0cm9uZz5Qb3NpdGllPC9zdHJvbmc+PC90ZD4KICAgICAgICA8dGQ+RGUgZ2VtaWRkZWxkZSByYW5raW5nIHZhbiBqb3V3IHBhZ2luYSBpbiBHb29nbGUuIFBvc2l0aWUgMSA9IGJvdmVuYWFuLiBQb3NpdGllIDExID0gYmVnaW4gdmFuIHBhZ2luYSAyLjwvdGQ+CiAgICAgICAgPHRkPlBvc2l0aWUgMTEtMzAgPSBtZWVzdCBrYW5zcmlqayB2b29yIHZlcmJldGVyaW5nLiBFw6luIGdvZWRlIGF1ZGl0IGthbiBqZSBuYWFyIHBhZ2luYSAxIGJyZW5nZW4uPC90ZD4KICAgICAgPC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KCiAgPGRpdiBjbGFzcz0iaW5mby1ib3ggZ29sZCI+CiAgICA8c3Ryb25nPkRlIGdvdWRlbiBjb21iaW5hdGllOjwvc3Ryb25nPiBIb2dlIGltcHJlc3NpZXMgKHZlZWwgem9la3ZvbHVtZSkgKyBwb3NpdGllIDExLTMwIChuZXQgbmlldCBwYWdpbmEgMSkgPSBkZSBwYWdpbmEgd2FhciBqZSBoZXQgbWVlc3RlIHRlIHdpbm5lbiBoZWJ0LiBEYXQgaXMgd2FhciBqZSBtZWUgYmVnaW50LgogIDwvZGl2PgoKICA8aDM+V2F0IGRvZSBqZSBpbiBlbGsgc2NlbmFyaW8/PC9oMz4KCiAgPHRhYmxlIGNsYXNzPSJkYXRhLXRhYmxlIj4KICAgIDx0aGVhZD4KICAgICAgPHRyPjx0aD48c3BhbiBjbGFzcz0ibmwiPlNpdHVhdGllPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlNpdHVhdGlvbjwvc3Bhbj48L3RoPjx0aD48c3BhbiBjbGFzcz0ibmwiPlByb2JsZWVtPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlByb2JsZW08L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5PcGxvc3Npbmc8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U29sdXRpb248L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5UaWpkPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRpbWU8L3NwYW4+PC90aD48L3RyPgogICAgPC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPjx0ZD5Qb3MgMS0xMCArIENUUiAmbHQ7IDIlPC90ZD48dGQ+U3RhYXQgYm92ZW5hYW4gbWFhciB0cmVrdCBuaWV0IGFhbjwvdGQ+PHRkPlRpdGxlICsgbWV0YSBoZXJzY2hyaWp2ZW48L3RkPjx0ZD4zMCBtaW48L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+UG9zIDExLTIwICsgaG9nZSBpbXByZXNzaWVzPC90ZD48dGQ+TmV0IG5pZXQgcGFnaW5hIDE8L3RkPjx0ZD5Wb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQ8L3RkPjx0ZD4yLTMgdXVyPC90ZD48L3RyPgogICAgICA8dHI+PHRkPlBvcyAyMS0zMCArIHNjb3JlICZsdDsgNzA8L3RkPjx0ZD5Db250ZW50IHRlIHp3YWs8L3RkPjx0ZD5BdWRpdCArIGhlcnNjaHJpanZlbjwvdGQ+PHRkPjMtNSB1dXI8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+UG9zIDMxLTYwICsgaG9nZSBpbXByZXNzaWVzPC90ZD48dGQ+Q29udGVudCB2ZWVsIHRlIHp3YWsgdm9vciBwYWdpbmEgMTwvdGQ+PHRkPkRpZXBnYWFuZGUgYXVkaXQ8L3RkPjx0ZD40LTYgdXVyPC90ZD48L3RyPgogICAgICA8dHI+PHRkPlBvcyA2MCsgKyBsYWdlIGltcHJlc3NpZXM8L3RkPjx0ZD5XZWluaWcgdnJhYWcgb2YgcGFnaW5hIHRlIHp3YWs8L3RkPjx0ZD5LZXl3b3JkIHJlc2VhcmNoIGVlcnN0PC90ZD48dGQ+TmFkZXIgYmVwYWxlbjwvdGQ+PC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KPC9kaXY+Cgo8IS0tIDA1IFNjZW5hcmlvcyAtLT4KPGRpdiBjbGFzcz0ic2VjdGlvbiIgaWQ9InNjZW5hcmlvcyI+CiAgPGRpdiBjbGFzcz0ic2VjdGlvbi1sYWJlbCI+PHNwYW4gY2xhc3M9Im5sIj5TZWN0aWUgMDU8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+U2VjdGlvbiAwNTwvc3Bhbj48L2Rpdj4KICA8aDI+PHNwYW4gY2xhc3M9Im5sIj5BYW5iZXZlbGluZ2VuIOKAlCB3YW5uZWVyIGRvZSBqZSB3YXQ/PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlJlY29tbWVuZGF0aW9ucyDigJQgd2hlbiB0byBkbyB3aGF0Pzwvc3Bhbj48L2gyPgogIDxwPjxzcGFuIGNsYXNzPSJubCI+RGUgUmVjb21tZW5kYXRpb25zIEVuZ2luZSBiZXJla2VudCBkaXQgYXV0b21hdGlzY2guIERpdCBpcyBkZSBsb2dpY2EgZXJhY2h0ZXI6PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlRoZSBSZWNvbW1lbmRhdGlvbnMgRW5naW5lIGNhbGN1bGF0ZXMgdGhpcyBhdXRvbWF0aWNhbGx5LiBIZXJlIGlzIHRoZSBsb2dpYyBiZWhpbmQgaXQ6PC9zcGFuPjwvcD4KCiAgPGRpdiBjbGFzcz0ic2NlbmFyaW8iPgogICAgPGRpdiBjbGFzcz0ic2NlbmFyaW8taGVhZCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzY2VuYXJpby1iYWRnZSIgc3R5bGU9ImJhY2tncm91bmQ6cmdiYSg3NCwyMjIsMTI4LC4xMik7Y29sb3I6dmFyKC0tZ3JlZW4pO2JvcmRlcjoxcHggc29saWQgcmdiYSg3NCwyMjIsMTI4LC4zKTsiPuKaoSBRdWljayBXaW48L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJzY2VuYXJpby10aXRsZSI+UG9zaXRpZSAxLTEwICsgQ1RSIG9uZGVyIDIlPC9zcGFuPgogICAgPC9kaXY+CiAgICA8cD5KZSBzdGFhdCBhbCBvcCBwYWdpbmEgMSBtYWFyIHNlYXJjaGVycyBrbGlra2VuIG5pZXQuIERlIHRpdGxlIHRhZyBvZiBtZXRhIGRlc2NyaXB0aW9uIHRyZWt0IG5pZXQgZ2Vub2VnIGFhbi48L3A+CiAgICA8ZGl2IGNsYXNzPSJhY3Rpb24iPkhlcnNjaHJpamYgdGl0bGUgKG1heCA2MCB0ZWtlbnMpICsgbWV0YSBkZXNjcmlwdGlvbiAobWF4IDE1NSB0ZWtlbnMpIG1ldCBwb3dlciB3b3JkcywgZ2V0YWxsZW4gb2YgdXJnZW50aWUuIERpdCBrYW4gaW4gMzAgbWludXRlbi4gR2VlbiB2b2xsZWRpZ2UgYXVkaXQgbm9kaWcuPC9kaXY+CiAgPC9kaXY+CgogIDxkaXYgY2xhc3M9InNjZW5hcmlvIj4KICAgIDxkaXYgY2xhc3M9InNjZW5hcmlvLWhlYWQiPgogICAgICA8c3BhbiBjbGFzcz0ic2NlbmFyaW8tYmFkZ2UiIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoOTYsMTY1LDI1MCwuMTIpO2NvbG9yOnZhcigtLWJsdWUpO2JvcmRlcjoxcHggc29saWQgcmdiYSg5NiwxNjUsMjUwLC4zKTsiPvCfk4ggQ1RSIEZpeDwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InNjZW5hcmlvLXRpdGxlIj5Qb3NpdGllIDExLTIwICsgQ1RSIG9uZGVyIDEuNSU8L3NwYW4+CiAgICA8L2Rpdj4KICAgIDxwPkJpam5hIHBhZ2luYSAxLCBtYWFyIHR3ZWUgcHJvYmxlbWVuIHRlZ2VsaWprOiB0aXRsZSB0cmVrdCBuaWV0IGFhbiBFTiBjb250ZW50IGlzIG5vZyBuaWV0IHN0ZXJrIGdlbm9lZy48L3A+CiAgICA8ZGl2IGNsYXNzPSJhY3Rpb24iPlN0YXAgMTogdGl0bGUgKyBtZXRhIGhlcnNjaHJpanZlbiAoMzAgbWluKS4gU3RhcCAyOiB2b2xsZWRpZ2UgYXVkaXQgdm9vciBkZSBwdXNoIG5hYXIgcGFnaW5hIDEgKDItMyB1dXIpLjwvZGl2PgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJzY2VuYXJpbyI+CiAgICA8ZGl2IGNsYXNzPSJzY2VuYXJpby1oZWFkIj4KICAgICAgPHNwYW4gY2xhc3M9InNjZW5hcmlvLWJhZGdlIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxOTEsMzYsLjEyKTtjb2xvcjp2YXIoLS1nb2xkKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjUxLDE5MSwzNiwuMyk7Ij7wn5OdIENvbnRlbnQgVXBncmFkZTwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InNjZW5hcmlvLXRpdGxlIj5Qb3NpdGllIDExLTMwICsgc2NvcmUgb25kZXIgNzA8L3NwYW4+CiAgICA8L2Rpdj4KICAgIDxwPkNvbnRlbnQgaXMgdGUgendhayB2b29yIHBhZ2luYSAxLiBNZXQgYmV0ZXJlIGNvbnRlbnQgZW4gc2NoZW1hIGt1biBqZSBkZSBzcHJvbmcgbWFrZW4uPC9wPgogICAgPGRpdiBjbGFzcz0iYWN0aW9uIj5Wb2xsZWRpZ2UgUFVMU0UrTkVYVVMgYXVkaXQuIEZvY3VzIG9wIFByaW9yaXR5IEFjdGlvbnMgKHN0YXAgMCksIENvbnRlbnQgR2FwIChzdGFwIDQpIGVuIFBVTFNFIFJld3JpdGVzIChzdGFwIDUpLjwvZGl2PgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJzY2VuYXJpbyI+CiAgICA8ZGl2IGNsYXNzPSJzY2VuYXJpby1oZWFkIj4KICAgICAgPHNwYW4gY2xhc3M9InNjZW5hcmlvLWJhZGdlIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDI1MSwxNDYsNjAsLjEyKTtjb2xvcjp2YXIoLS1vcmFuZ2UpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTEsMTQ2LDYwLC4zKTsiPuKcj++4jyBSZXdyaXRlPC9zcGFuPgogICAgICA8c3BhbiBjbGFzcz0ic2NlbmFyaW8tdGl0bGUiPlBvc2l0aWUgMzEtNjAgKyBob2dlIGltcHJlc3NpZXM8L3NwYW4+CiAgICA8L2Rpdj4KICAgIDxwPlZlZWwgem9la3ZvbHVtZSBtYWFyIEdvb2dsZSBiZW9vcmRlZWx0IGRlIHBhZ2luYSBhbHMgdGUgendhayB2b29yIGRlIHRvcC4gRnVuZGFtZW50ZWxlIHZlcmJldGVyaW5nIG5vZGlnLjwvcD4KICAgIDxkaXYgY2xhc3M9ImFjdGlvbiI+QWxsZSAxMCBzdGFwcGVuIHZhbiBQVUxTRStORVhVUyBkb29ybG9wZW4uIERhYXJuYSBwYWdpbmEgdm9sbGVkaWcgaGVyc2NocmlqdmVuIG9wIGJhc2lzIHZhbiBkZSBhYW5iZXZlbGluZ2VuLjwvZGl2PgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJzY2VuYXJpbyI+CiAgICA8ZGl2IGNsYXNzPSJzY2VuYXJpby1oZWFkIj4KICAgICAgPHNwYW4gY2xhc3M9InNjZW5hcmlvLWJhZGdlIiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKDE2NywxMzksMjUwLC4xMik7Y29sb3I6dmFyKC0tcHVycGxlKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMTY3LDEzOSwyNTAsLjMpOyI+8J+UlyBBdXRob3JpdHk8L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJzY2VuYXJpby10aXRsZSI+UG9zaXRpZSAxLTEwICsgc2NvcmUgYm92ZW4gODU8L3NwYW4+CiAgICA8L2Rpdj4KICAgIDxwPlBhZ2luYSBwcmVzdGVlcnQgYWwgZ29lZC4gQ29udGVudCBlbiB0ZWNobmllayB6aWpuIG9wIG9yZGUuPC9wPgogICAgPGRpdiBjbGFzcz0iYWN0aW9uIj5Gb2N1cyBvcCBpbnRlcm5lIGxpbmtzLCBiYWNrbGlua3MgZW4gZ2V6YWdoZWJiZW5kZSBicm9ubmVuLiBORVhVUyBzdGFwIDYgaW4gUFVMU0UrTkVYVVMuPC9kaXY+CiAgPC9kaXY+CjwvZGl2PgoKPCEtLSAwNiBBdWRpdCAtLT4KPGRpdiBjbGFzcz0ic2VjdGlvbiIgaWQ9ImF1ZGl0Ij4KICA8ZGl2IGNsYXNzPSJzZWN0aW9uLWxhYmVsIj48c3BhbiBjbGFzcz0ibmwiPlNlY3RpZSAwNjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5TZWN0aW9uIDA2PC9zcGFuPjwvZGl2PgogIDxoMj48c3BhbiBjbGFzcz0ibmwiPlBVTFNFK05FWFVTIHVpdHZvZXJlbjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5SdW5uaW5nIFBVTFNFK05FWFVTPC9zcGFuPjwvaDI+CgogIDxkaXYgY2xhc3M9ImluZm8tYm94IGJsdWUiPgogICAgPHN0cm9uZz5UaXA6PC9zdHJvbmc+IEFscyBqZSB2YW51aXQgUmVjb21tZW5kYXRpb25zIGtsaWt0IG9wICJPcGVuIGluIFBVTFNFK05FWFVTIiBzdGFhbiBVUkwsIGtleXdvcmQsIHBvc2l0aWUsIGltcHJlc3NpZXMgZW4gQ1RSIGFsIGluZ2V2dWxkLiBKZSBob2VmdCBhbGxlZW4gbm9nIGRlIEhUTUwgdG9lIHRlIHZvZWdlbi4KICA8L2Rpdj4KCiAgPGgzPldhdCB2dWwgamUgaGFuZG1hdGlnIGluPzwvaDM+CgogIDxkaXYgY2xhc3M9InN0ZXBzLWxpc3QiPgogICAgPGRpdiBjbGFzcz0ic3RlcC1pdGVtIj4KICAgICAgPGRpdiBjbGFzcz0ic3RlcC1udW0iPjE8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ic3RlcC1ib2R5Ij4KICAgICAgICA8c3Ryb25nPlBhZ2luYSBIVE1MIChzdGFwIOKRoikg4oCUIGJpam5hIGFsdGlqZCB2ZXJwbGljaHQ8L3N0cm9uZz4KICAgICAgICA8c3Bhbj5PcGVuIGRlIHBhZ2luYSBpbiBDaHJvbWUg4oaSIHJlY2h0c2tsaWsg4oaSIDxjb2RlPlBhZ2luYWJyb24gd2VlcmdldmVuPC9jb2RlPiDihpIgPGNvZGU+Q3RybCtBPC9jb2RlPiDihpIgPGNvZGU+Q3RybCtDPC9jb2RlPiDihpIgcGxhayBpbiBoZXQgdmVsZC4gSGV0IHN5c3RlZW0gbGVlc3QgZGFuIGRlIHdlcmtlbGlqa2UgSDEsIEgycywgc2NoZW1hIGVuIHdvcmQgY291bnQg4oCUIG5pZXQgZWVuIGdvayBvcCBiYXNpcyB2YW4gZGUgVVJMLjwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InN0ZXAtaXRlbSI+CiAgICAgIDxkaXYgY2xhc3M9InN0ZXAtbnVtIj4yPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InN0ZXAtYm9keSI+CiAgICAgICAgPHN0cm9uZz5Db21wZXRpdG9yIEhUTUwgKHN0YXAg4pGjKSDigJQgb3B0aW9uZWVsPC9zdHJvbmc+CiAgICAgICAgPHNwYW4+QmV6b2VrIGVlbiBjb21wZXRpdG9yIHBhZ2luYSDihpIgUGFnaW5hYnJvbiDihpIga29waWVlciDihpIgcGxhay4gQWxzIGplIGRpdCBsZWVnIGxhYXQgdmVyZ2VsaWprdCBoZXQgc3lzdGVlbSBhdXRvbWF0aXNjaCBtZXQgd2F0IGJla2VuZCBpcyBvdmVyIFN1cmZlciBTRU8gZW4gTWFya2V0TXVzZS4gVm9vciBkZSBtZWVzdCBuYXV3a2V1cmlnZSBhbmFseXNlOiBwbGFrIGVjaHRlIGNvbXBldGl0b3IgSFRNTC48L3NwYW4+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJzdGVwLWl0ZW0iPgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLW51bSI+MzwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLWJvZHkiPgogICAgICAgIDxzdHJvbmc+U2l0ZW1hcCBVUkxzIChzdGFwIOKRpCkg4oCUIG9wdGlvbmVlbCBtYWFyIHdhYXJkZXZvbDwvc3Ryb25nPgogICAgICAgIDxzcGFuPlBsYWsgZGUgVVJMcyB2YW4gZGUgd2Vic2l0ZSAow6nDqW4gcGVyIHJlZ2VsKS4gSGV0IHN5c3RlZW0gem9la3QgZGFuIGRlIDUgYmVzdGUgcGFnaW5hJ3Mgb20gaW50ZXJuIG5hYXIgdGUgbGlua2VuIOKAlCBtZXQgZXhhY3RlIGFuY2hvciB0ZWtzdC4gWm9uZGVyIGRpdCBnZWVmdCBoZXQgYWxsZWVuIGFsZ2VtZW5lIGFkdmllemVuLjwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InN0ZXAtaXRlbSI+CiAgICAgIDxkaXYgY2xhc3M9InN0ZXAtbnVtIj40PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InN0ZXAtYm9keSI+CiAgICAgICAgPHN0cm9uZz5LbGlrIG9wIFJ1biBGdWxsIEF1ZGl0PC9zdHJvbmc+CiAgICAgICAgPHNwYW4+RGUgYXVkaXQgZHJhYWl0IDEwIHN0YXBwZW4uIDxzdHJvbmc+UHJpb3JpdHkgQWN0aW9ucyAoc3RhcCAwKSB2ZXJzY2hpam5lbiBhbHMgZWVyc3RlPC9zdHJvbmc+IOKAlCBkaXQgemlqbiBkZSA3IG1lZXN0IGltcGFjdHZvbGxlIGFjdGllcy4gQmVnaW4gYWx0aWpkIGhpZXIuIERlIHJlc3QgdmFuIGRlIHN0YXBwZW4gZ2V2ZW4gZGllcGVyZSBhbmFseXNlLjwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPGgzPkRlIDEwIHN0YXBwZW4gdmFuIFBVTFNFK05FWFVTPC9oMz4KICA8dGFibGUgY2xhc3M9ImRhdGEtdGFibGUiPgogICAgPHRoZWFkPjx0cj48dGg+PHNwYW4gY2xhc3M9Im5sIj5TdGFwPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlN0ZXA8L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5XYXQgaGV0IGRvZXQ8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+V2hhdCBpdCBkb2VzPC9zcGFuPjwvdGg+PHRoPjxzcGFuIGNsYXNzPSJubCI+V2FubmVlciBiZWxhbmdyaWprPzwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5XaGVuIGltcG9ydGFudD88L3NwYW4+PC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz4wIOKAlCBQcmlvcml0eSBBY3Rpb25zPC9zdHJvbmc+PC90ZD48dGQ+NyBjb25jcmV0ZSBhY3RpZXMsIGdlcmFuZ3NjaGlrdCBvcCBpbXBhY3QuIEFsdGlqZCBhbHMgZWVyc3RlIGxlemVuLjwvdGQ+PHRkPkFsdGlqZDwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD48c3Ryb25nPjEg4oCUIEludGVudCBhbmFseXNlPC9zdHJvbmc+PC90ZD48dGQ+S2xvcHQgZGUgem9la2ludGVudGllPyBBSSBPdmVydmlldyByaXNpY28/PC90ZD48dGQ+QmlqIGxhZ2UgQ1RSPC90ZD48L3RyPgogICAgICA8dHI+PHRkPjxzdHJvbmc+MiDigJQgQ1RSIFN1cmdlcnk8L3N0cm9uZz48L3RkPjx0ZD5OaWV1d2UgdGl0bGUgKyBtZXRhIGRlc2NyaXB0aW9uPC90ZD48dGQ+Q1RSIG9uZGVyIDIlPC90ZD48L3RyPgogICAgICA8dHI+PHRkPjxzdHJvbmc+MyDigJQgQ29tcGV0aXRvciBEaWZmPC9zdHJvbmc+PC90ZD48dGQ+Sm91dyBwYWdpbmEgdnMgY29tcGV0aXRvcnM8L3RkPjx0ZD5BbHRpamQ8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz40IOKAlCBDb250ZW50IEdhcDwvc3Ryb25nPjwvdGQ+PHRkPldhdCBtaXMgamUgZGF0IGNvbXBldGl0b3JzIHdlbCBoZWJiZW4/PC90ZD48dGQ+U2NvcmUgb25kZXIgNzA8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz41IOKAlCBQVUxTRSBSZXdyaXRlczwvc3Ryb25nPjwvdGQ+PHRkPlZvb3IvbmEgaGVyc2NocmlqdmluZ2VuIHZhbiBpbnRybywgQ1RBLCBzdHJ1Y3R1dXI8L3RkPjx0ZD5CaWogcmV3cml0ZTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD48c3Ryb25nPjYg4oCUIE5FWFVTICsgaW50ZXJuZSBsaW5rczwvc3Ryb25nPjwvdGQ+PHRkPldlbGtlIHBhZ2luYSdzIGxpbmtlbiBuYWFyIGVsa2Fhcj88L3RkPjx0ZD5BbHRpamQ8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz43IOKAlCBBcmNoaXRlY3R1cmU8L3N0cm9uZz48L3RkPjx0ZD5IMS1IMyBzdHJ1Y3R1dXIgb3B0aW1hbGlzZXJlbjwvdGQ+PHRkPkJpaiBoZXJzY2hyaWp2ZW48L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz44IOKAlCBUZWNobmljYWwgKyBTY2hlbWE8L3N0cm9uZz48L3RkPjx0ZD5GQVFQYWdlIEpTT04tTEQsIGFsdCB0ZWtzdCwgY2Fub25pY2FsPC90ZD48dGQ+QWx0aWpkPC90ZD48L3RyPgogICAgICA8dHI+PHRkPjxzdHJvbmc+OSDigJQgU2NvcmUgcHJvamVjdGllPC9zdHJvbmc+PC90ZD48dGQ+VmVyd2FjaHRlIHNjb3JlIGVuIHRyYWZmaWMgbmEgZml4ZXM8L3RkPjx0ZD5Wb29yIHJhcHBvcnRhZ2U8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+PHN0cm9uZz4xMCDigJQgOTAtZGFnZW4gcGxhbjwvc3Ryb25nPjwvdGQ+PHRkPldlZWstdm9vci13ZWVrIGFjdGllcGxhbjwvdGQ+PHRkPkJpaiBvcGxldmVyaW5nIGFhbiBjbGllbnQ8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CjwvZGl2PgoKPCEtLSAwNyBDaGVja2xpc3QgLS0+CjxkaXYgY2xhc3M9InNlY3Rpb24iIGlkPSJjaGVja2xpc3QiPgogIDxkaXYgY2xhc3M9InNlY3Rpb24tbGFiZWwiPjxzcGFuIGNsYXNzPSJubCI+U2VjdGllIDA3PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlNlY3Rpb24gMDc8L3NwYW4+PC9kaXY+CiAgPGgyPjxzcGFuIGNsYXNzPSJubCI+Q2hlY2tsaXN0IHBlciBwYWdpbmE8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+Q2hlY2tsaXN0IHBlciBwYWdlPC9zcGFuPjwvaDI+CiAgPHA+PHNwYW4gY2xhc3M9Im5sIj5JbiBkZSBXb3JrZmxvdyBNYW5hZ2VyIGhlZWZ0IGVsa2UgcGFnaW5hIGVlbiBjaGVja2xpc3QgdmFuIDIzIGl0ZW1zLiBEaXQgemlqbiBkZSBzdGFuZGFhcmQgdGFrZW4gcGVyIGF1ZGl0Ojwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5JbiB0aGUgV29ya2Zsb3cgTWFuYWdlciwgZWFjaCBwYWdlIGhhcyBhIGNoZWNrbGlzdCBvZiAyMyBpdGVtcy4gVGhlc2UgYXJlIHRoZSBzdGFuZGFyZCB0YXNrcyBwZXIgYXVkaXQ6PC9zcGFuPjwvcD4KCiAgPGgzPjxzcGFuIGNsYXNzPSJubCI+QXVkaXQgKHN0YXJ0ZW4gZW4gYWZyb25kZW4pPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPkF1ZGl0IChzdGFydCBhbmQgZmluaXNoKTwvc3Bhbj48L2gzPgogIDx0YWJsZSBjbGFzcz0iZGF0YS10YWJsZSI+CiAgICA8dGhlYWQ+PHRyPjx0aD5JdGVtPC90aD48dGg+V2F0IGRvZSBqZT88L3RoPjwvdHI+PC90aGVhZD4KICAgIDx0Ym9keT4KICAgICAgPHRyPjx0ZD5Db250ZW50U2NvcmUgc2NhbiBnZWRhYW48L3RkPjx0ZD5TY29yZSBCZWZvcmUgaW52dWxsZW4gdmlhIPCfk4ogU2NhbiBTY29yZSBrbm9wPC90ZD48L3RyPgogICAgICA8dHI+PHRkPlBVTFNFK05FWFVTIGF1ZGl0IGdlZGFhbjwvdGQ+PHRkPjEwIHN0YXBwZW4gZG9vcmxvcGVuIGVuIFByaW9yaXR5IEFjdGlvbnMgZ2VsZXplbjwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5HU0MgZGF0YSBnZW5vdGVlcmQ8L3RkPjx0ZD5Qb3NpdGllLCBpbXByZXNzaWVzIGVuIENUUiBpbmdldnVsZCBpbiBtYW5hZ2VyPC90ZD48L3RyPgogICAgICA8dHI+PHRkPlBhZ2luYSBoZXJwdWJsaWNlZXJkPC90ZD48dGQ+VGltZXN0YW1wIHZlcm5pZXV3ZCBuYSBmaXhlczwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5HU0MgcmVpbmRleCBhYW5nZXZyYWFnZDwvdGQ+PHRkPlZpYSBHU0Mg4oaSIFVSTCBpbnNwZWN0aWUg4oaSIEluZGV4ZXJpbmcgYWFudnJhZ2VuPC90ZD48L3RyPgogICAgICA8dHI+PHRkPkdTQyByZWNoZWNrIGluZ2VwbGFuZDwvdGQ+PHRkPjE0IGRhZ2VuIGxhdGVyIGNvbnRyb2xlcmVuIGluIEdTQzwvdGQ+PC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KCiAgPGgzPkNvbnRlbnQgZml4ZXM8L2gzPgogIDx0YWJsZSBjbGFzcz0iZGF0YS10YWJsZSI+CiAgICA8dGhlYWQ+PHRyPjx0aD5JdGVtPC90aD48dGg+Tm9ybTwvdGg+PC90cj48L3RoZWFkPgogICAgPHRib2R5PgogICAgICA8dHI+PHRkPkgxIGdlb3B0aW1hbGlzZWVyZDwvdGQ+PHRkPlByaW1haXIga2V5d29yZCBlcmluLCBkdWlkZWxpamsgZW4gYWFudHJla2tlbGlqazwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5IMiBzdHJ1Y3R1dXIgaGVyemllbjwvdGQ+PHRkPkxvZ2lzY2hlIHZvbGdvcmRlLCBrZXl3b3JkcyBpbiBrb3BqZXM8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+U0VPIHRpdGxlIGJpamdld2Vya3Q8L3RkPjx0ZD41MC02MCB0ZWtlbnMsIGtleXdvcmQgdm9vcmFhbjwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5NZXRhIGRlc2NyaXB0aW9uIGJpamdld2Vya3Q8L3RkPjx0ZD4xNTAtMTYwIHRla2VucywgY2FsbC10by1hY3Rpb24gZXJpbjwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5Db250ZW50IGdhcHMgZ2V2dWxkPC90ZD48dGQ+T250YnJla2VuZGUgc3VidG9waWNzIHRvZWdldm9lZ2Q8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+V29yZCBjb3VudCB2b2xkb2VuZGU8L3RkPjx0ZD5NaW5pbWFhbCAxNTAwIHdvb3JkZW4gdm9vciBpbmZvcm1hdGlldmUgcGFnaW5hJ3M8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+U3RhdHMgYmlqZ2V3ZXJrdDwvdGQ+PHRkPkFsbGUgY2lqZmVycyB6aWpuIHZhbiAyMDI1LTIwMjY8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+RkFRIHNlY3RpZSB0b2VnZXZvZWdkPC90ZD48dGQ+TWluaW1hYWwgMy01IHZyYWdlbiBtZXQgdm9sbGVkaWdlIGFudHdvb3JkZW48L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+RXhwZXJ0Y2l0YXRlbiB0b2VnZXZvZWdkPC90ZD48dGQ+TmFhbSArIGZ1bmN0aWUgKyBicm9uIGVyYmlqPC90ZD48L3RyPgogICAgICA8dHI+PHRkPkUtRS1BLVQgdmVyc3Rlcmt0PC90ZD48dGQ+V2llIHNjaHJlZWYgZGl0LCB3YW5uZWVyLCB3YWFyb20gYmV0cm91d2JhYXI/PC90ZD48L3RyPgogICAgICA8dHI+PHRkPkNUQSBnZW9wdGltYWxpc2VlcmQ8L3RkPjx0ZD5BYW5zbHVpdGVuZCBiaWogaGV0IGNvbnZlcnNpZWRvZWw8L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CgogIDxoMz48c3BhbiBjbGFzcz0ibmwiPlRlY2huaXNjaGUgZml4ZXM8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+VGVjaG5pY2FsIGZpeGVzPC9zcGFuPjwvaDM+CiAgPHRhYmxlIGNsYXNzPSJkYXRhLXRhYmxlIj4KICAgIDx0aGVhZD48dHI+PHRoPkl0ZW08L3RoPjx0aD5Ob3JtPC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+QXJ0aWNsZSBzY2hlbWEgdG9lZ2V2b2VnZDwvdGQ+PHRkPkpTT04tTEQgaW4gZGUgJmx0O2hlYWQmZ3Q7PC90ZD48L3RyPgogICAgICA8dHI+PHRkPkZBUVBhZ2Ugc2NoZW1hIHRvZWdldm9lZ2Q8L3RkPjx0ZD5FbGtlIEZBUSBhbHMgUXVlc3Rpb24gKyBBbnN3ZXIgaW4gSlNPTi1MRDwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZD5DYW5vbmljYWwgdGFnIGdlY29udHJvbGVlcmQ8L3RkPjx0ZD5WZXJ3aWpzdCBuYWFyIGRlIGp1aXN0ZSBVUkw8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+QWZiZWVsZGluZyBhbHQgdGVrc3QgY29tcGxlZXQ8L3RkPjx0ZD5FbGtlIGFmYmVlbGRpbmcgaGVlZnQgZWVuIGJlc2NocmlqdmVuZGUgYWx0PC90ZD48L3RyPgogICAgICA8dHI+PHRkPkludGVybmUgbGlua3MgdG9lZ2V2b2VnZDwvdGQ+PHRkPjMtNSByZWxldmFudGUgaW50ZXJuZSBsaW5rcyBtZXQgZ29lZGUgYW5jaG9yIHRla3N0PC90ZD48L3RyPgogICAgICA8dHI+PHRkPkV4dGVybmUgbGlua3MgdG9lZ2V2b2VnZDwvdGQ+PHRkPjItMyBnZXphZ2hlYmJlbmRlIGJyb25uZW48L3RkPjwvdHI+CiAgICA8L3Rib2R5PgogIDwvdGFibGU+CjwvZGl2PgoKPCEtLSAwOCBEZXBsb3kgLS0+CjxkaXYgY2xhc3M9InNlY3Rpb24iIGlkPSJkZXBsb3kiPgogIDxkaXYgY2xhc3M9InNlY3Rpb24tbGFiZWwiPjxzcGFuIGNsYXNzPSJubCI+U2VjdGllIDA4PC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPlNlY3Rpb24gMDg8L3NwYW4+PC9kaXY+CiAgPGgyPjxzcGFuIGNsYXNzPSJubCI+RGVwbG95ZW4gb3AgUmFpbHdheTwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5EZXBsb3lpbmcgb24gUmFpbHdheTwvc3Bhbj48L2gyPgogIDxwPjxzcGFuIGNsYXNzPSJubCI+QWxsZSBiZXN0YW5kZW4gZ2FhbiBuYWFyIGRlIDxjb2RlPnB1YmxpYy88L2NvZGU+IG1hcCBvcCBSYWlsd2F5LiBEZSByb3V0ZXMgc3RhYW4gaW4gPGNvZGU+c2VydmVyLmpzPC9jb2RlPi48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+QWxsIGZpbGVzIGdvIGludG8gdGhlIDxjb2RlPnB1YmxpYy88L2NvZGU+IGZvbGRlciBvbiBSYWlsd2F5LiBUaGUgcm91dGVzIGFyZSBpbiA8Y29kZT5zZXJ2ZXIuanM8L2NvZGU+Ljwvc3Bhbj48L3A+CgogIDxoMz48c3BhbiBjbGFzcz0ibmwiPkJlc3RhbmRlbiBoZXJub2VtZW4gZW4gdXBsb2FkZW48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+UmVuYW1lIGFuZCB1cGxvYWQgZmlsZXM8L3NwYW4+PC9oMz4KICA8dGFibGUgY2xhc3M9ImRhdGEtdGFibGUiPgogICAgPHRoZWFkPjx0cj48dGg+PHNwYW4gY2xhc3M9Im5sIj5CZXN0YW5kPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPkZpbGU8L3NwYW4+PC90aD48dGg+PHNwYW4gY2xhc3M9Im5sIj5IZXJub2VtZW4gbmFhcjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5SZW5hbWUgdG88L3NwYW4+PC90aD48dGg+VVJMPC90aD48L3RyPjwvdGhlYWQ+CiAgICA8dGJvZHk+CiAgICAgIDx0cj48dGQ+cHVsc2UtbmV4dXMtYXVkaXQtdjQuaHRtbDwvdGQ+PHRkPnB1YmxpYy9hdWRpdC1zZW8uaHRtbDwvdGQ+PHRkPi9hdWRpdC1zZW88L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+YXVkaXQtaW50YWtlLWZvcm0uaHRtbDwvdGQ+PHRkPnB1YmxpYy9hdWRpdC1pbnRha2UuaHRtbDwvdGQ+PHRkPi9hdWRpdC1pbnRha2U8L3RkPjwvdHI+CiAgICAgIDx0cj48dGQ+c2VvLXdvcmtmbG93LW1hbmFnZXIuaHRtbDwvdGQ+PHRkPnB1YmxpYy9hdWRpdC13b3JrZmxvdy5odG1sPC90ZD48dGQ+L2F1ZGl0LXdvcmtmbG93PC90ZD48L3RyPgogICAgICA8dHI+PHRkPmF1ZGl0LXJlY29tbWVuZGF0aW9ucy5odG1sPC90ZD48dGQ+cHVibGljL2F1ZGl0LXJlY29tbWVuZGF0aW9ucy5odG1sPC90ZD48dGQ+L2F1ZGl0LXJlY29tbWVuZGF0aW9uczwvdGQ+PC90cj4KICAgIDwvdGJvZHk+CiAgPC90YWJsZT4KCiAgPGgzPjxzcGFuIGNsYXNzPSJubCI+U2VydmVyLmpzIGFhbnBhc3Nlbjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5VcGRhdGUgc2VydmVyLmpzPC9zcGFuPjwvaDM+CiAgPGRpdiBjbGFzcz0ic3RlcHMtbGlzdCI+CiAgICA8ZGl2IGNsYXNzPSJzdGVwLWl0ZW0iPgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLW51bSI+MTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLWJvZHkiPgogICAgICAgIDxzdHJvbmc+PHNwYW4gY2xhc3M9Im5sIj5zZXJ2ZXItYWRkaXRpb25zLmpzIHBsYWtrZW48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+UGFzdGUgc2VydmVyLWFkZGl0aW9ucy5qczwvc3Bhbj48L3N0cm9uZz4KICAgICAgICA8c3BhbiBjbGFzcz0ibmwiPk9wZW4gPGNvZGU+c2VydmVyLmpzPC9jb2RlPi4gWm9layBkZSBoZWFkc2hvdCByZWRpcmVjdCByb3V0ZXMuIFBsYWsgZGUgdm9sbGVkaWdlIGluaG91ZCB2YW4gPGNvZGU+c2VydmVyLWFkZGl0aW9ucy5qczwvY29kZT4gZGlyZWN0IGVyYm92ZW4sIHbDs8OzciA8Y29kZT5zdGFydFNlcnZlcigpPC9jb2RlPi48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+T3BlbiA8Y29kZT5zZXJ2ZXIuanM8L2NvZGU+LiBGaW5kIHRoZSBoZWFkc2hvdCByZWRpcmVjdCByb3V0ZXMuIFBhc3RlIHRoZSBmdWxsIGNvbnRlbnRzIG9mIDxjb2RlPnNlcnZlci1hZGRpdGlvbnMuanM8L2NvZGU+IGRpcmVjdGx5IGFib3ZlLCBiZWZvcmUgPGNvZGU+c3RhcnRTZXJ2ZXIoKTwvY29kZT4uPC9zcGFuPgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0ic3RlcC1pdGVtIj4KICAgICAgPGRpdiBjbGFzcz0ic3RlcC1udW0iPjI8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ic3RlcC1ib2R5Ij4KICAgICAgICA8c3Ryb25nPjxzcGFuIGNsYXNzPSJubCI+TXVsdGVyIHRvZXZvZWdlbiBhYW4gcGFja2FnZS5qc29uPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPkFkZCBtdWx0ZXIgdG8gcGFja2FnZS5qc29uPC9zcGFuPjwvc3Ryb25nPgogICAgICAgIDxzcGFuIGNsYXNzPSJubCI+Vm9lZyA8Y29kZT4ibXVsdGVyIjogIl4xLjQuNS1sdHMuMSI8L2NvZGU+IHRvZSBhYW4gZGUgZGVwZW5kZW5jaWVzLiBSYWlsd2F5IGluc3RhbGxlZXJ0IGhldCBhdXRvbWF0aXNjaCBiaWogZGUgdm9sZ2VuZGUgZGVwbG95Ljwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5BZGQgPGNvZGU+Im11bHRlciI6ICJeMS40LjUtbHRzLjEiPC9jb2RlPiB0byB0aGUgZGVwZW5kZW5jaWVzLiBSYWlsd2F5IHdpbGwgaW5zdGFsbCBpdCBhdXRvbWF0aWNhbGx5IG9uIHRoZSBuZXh0IGRlcGxveS48L3NwYW4+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJzdGVwLWl0ZW0iPgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLW51bSI+MzwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJzdGVwLWJvZHkiPgogICAgICAgIDxzdHJvbmc+PHNwYW4gY2xhc3M9Im5sIj5EZXBsb3llbjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5EZXBsb3k8L3NwYW4+PC9zdHJvbmc+CiAgICAgICAgPHNwYW4gY2xhc3M9Im5sIj5QdXNoIG5hYXIgR2l0SHViIOKGkiBSYWlsd2F5IGRlcGxveSBhdXRvbWF0aXNjaC4gQ2hlY2sgZGUgbG9ncyBvcCBmb3V0ZW4uIFRlc3QgZGFhcm5hOiA8Y29kZT5hcHAuY29udGVudHNjYWxlLnNpdGUvYXVkaXQtc2VvPC9jb2RlPiBtb2V0IGxhZGVuLjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5QdXNoIHRvIEdpdEh1YiDihpIgUmFpbHdheSBkZXBsb3lzIGF1dG9tYXRpY2FsbHkuIENoZWNrIHRoZSBsb2dzIGZvciBlcnJvcnMuIFRoZW4gdGVzdDogPGNvZGU+YXBwLmNvbnRlbnRzY2FsZS5zaXRlL2F1ZGl0LXNlbzwvY29kZT4gc2hvdWxkIGxvYWQuPC9zcGFuPgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJpbmZvLWJveCByZWQiPgogICAgPHNwYW4gY2xhc3M9Im5sIj48c3Ryb25nPk5vaW5kZXg6PC9zdHJvbmc+IERlIFdvcmtmbG93IE1hbmFnZXIsIFJlY29tbWVuZGF0aW9ucyBlbiBQVUxTRStORVhVUyBoZWJiZW4gYWxsZW1hYWwgPGNvZGU+bm9pbmRleCwgbm9mb2xsb3c8L2NvZGU+IGluIGRlIG1ldGEgdGFncy4gR29vZ2xlIGluZGV4ZWVydCB6ZSBuaWV0LiBEZSBBdWRpdCBJbnRha2UgRm9ybSBpcyB3w6lsIG9wZW5iYWFyLjwvc3Bhbj48c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij48c3Ryb25nPk5vaW5kZXg6PC9zdHJvbmc+IFRoZSBXb3JrZmxvdyBNYW5hZ2VyLCBSZWNvbW1lbmRhdGlvbnMgYW5kIFBVTFNFK05FWFVTIGFsbCBoYXZlIDxjb2RlPm5vaW5kZXgsIG5vZm9sbG93PC9jb2RlPiBpbiB0aGVpciBtZXRhIHRhZ3MuIEdvb2dsZSBkb2VzIG5vdCBpbmRleCB0aGVtLiBUaGUgQXVkaXQgSW50YWtlIEZvcm0gaXMgcHVibGljLjwvc3Bhbj4KICA8L2Rpdj4KCiAgPGRpdiBjbGFzcz0iaW5mby1ib3ggZ3JlZW4iPgogICAgPHNwYW4gY2xhc3M9Im5sIj48c3Ryb25nPkRhdGEgb3BzbGFnOjwvc3Ryb25nPiBEZSBXb3JrZmxvdyBNYW5hZ2VyIHNsYWF0IGRhdGEgb3AgaW4gZGUgYnJvd3NlciAobG9jYWxTdG9yYWdlKS4gRGl0IGlzIHBlciBicm93c2VyL2NvbXB1dGVyLiBFeHBvcnQgcmVnZWxtYXRpZyBtZXQgZGUgQ1NWIGtub3AgYWxzIGJhY2t1cCwgZW4gZ2VicnVpayBJbXBvcnQgb20gb3AgZWVuIGFuZGVyZSBjb21wdXRlciB2ZXJkZXIgdGUgZ2Fhbi48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+PHN0cm9uZz5EYXRhIHN0b3JhZ2U6PC9zdHJvbmc+IFRoZSBXb3JrZmxvdyBNYW5hZ2VyIHN0b3JlcyBkYXRhIGluIHRoZSBicm93c2VyIChsb2NhbFN0b3JhZ2UpLiBUaGlzIGlzIHBlciBicm93c2VyL2NvbXB1dGVyLiBFeHBvcnQgcmVndWxhcmx5IHdpdGggdGhlIENTViBidXR0b24gYXMgYmFja3VwLCBhbmQgdXNlIEltcG9ydCB0byBjb250aW51ZSBvbiBhbm90aGVyIGNvbXB1dGVyLjwvc3Bhbj4KICA8L2Rpdj4KPC9kaXY+Cgo8aHI+Cgo8IS0tIENUQSBTZWN0aW9uIC0tPgo8ZGl2IHN0eWxlPSJiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMzVkZWcscmdiYSgxNDcsNTEsMjM0LC4xMikscmdiYSg5NiwxNjUsMjUwLC4wNikpO2JvcmRlcjoxcHggc29saWQgcmdiYSgxNDcsNTEsMjM0LC4yNSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6NDBweDttYXJnaW4tYm90dG9tOjQwcHg7dGV4dC1hbGlnbjpjZW50ZXI7Ij4KICA8ZGl2IHN0eWxlPSJmb250LWZhbWlseTonSUJNIFBsZXggTW9ubycsbW9ub3NwYWNlO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6LjJlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTttYXJnaW4tYm90dG9tOjEwcHg7Ij4KICAgIDxzcGFuIGNsYXNzPSJubCI+SHVscCBub2RpZyBtZXQgam91dyB3ZWJzaXRlPzwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPk5lZWQgaGVscCB3aXRoIHlvdXIgd2Vic2l0ZT88L3NwYW4+CiAgPC9kaXY+CiAgPGgyIHN0eWxlPSJmb250LWZhbWlseTonQmViYXMgTmV1ZScsc2Fucy1zZXJpZjtmb250LXNpemU6Y2xhbXAoMjhweCw0dncsNDRweCk7bGV0dGVyLXNwYWNpbmc6LjA0ZW07bGluZS1oZWlnaHQ6MS4wNTttYXJnaW4tYm90dG9tOjEycHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHZhcigtLWdvbGQpLHZhcigtLXB1cnBsZSkpOy13ZWJraXQtYmFja2dyb3VuZC1jbGlwOnRleHQ7LXdlYmtpdC10ZXh0LWZpbGwtY29sb3I6dHJhbnNwYXJlbnQ7YmFja2dyb3VuZC1jbGlwOnRleHQ7Ij4KICAgIDxzcGFuIGNsYXNzPSJubCI+VnJhYWcgZWVuIGdyYXRpcyBTRU8gYXVkaXQgYWFuPC9zcGFuPgogICAgPHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+UmVxdWVzdCBhIGZyZWUgU0VPIGF1ZGl0PC9zcGFuPgogIDwvaDI+CiAgPHAgc3R5bGU9ImNvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTRweDttYXgtd2lkdGg6NTIwcHg7bWFyZ2luOjAgYXV0byAyNHB4O2xpbmUtaGVpZ2h0OjEuNzsiPgogICAgPHNwYW4gY2xhc3M9Im5sIj5VcGxvYWQgamUgR1NDIENTViwgZ2VlZiBkZSBwYWdpbmEgVVJMIG9wIGVuIGplIG9udHZhbmd0IGJpbm5lbiAxNSBtaW51dGVuIGVlbiBnZXByaW9yaXRlZXJkZSBhY3RpZWxpanN0LiBHZWVuIGphcmdvbi4gR0RQUi1jb21wbGlhbnQuIEdyYXRpcy48L3NwYW4+CiAgICA8c3BhbiBjbGFzcz0iZW4iIHN0eWxlPSJkaXNwbGF5Om5vbmU7Ij5VcGxvYWQgeW91ciBHU0MgQ1NWLCBwcm92aWRlIHRoZSBwYWdlIFVSTCBhbmQgeW91IHdpbGwgcmVjZWl2ZSBhIHByaW9yaXRpc2VkIGFjdGlvbiBwbGFuIHdpdGhpbiAxNSBtaW51dGVzLiBObyBqYXJnb24uIEdEUFItY29tcGxpYW50LiBGcmVlLjwvc3Bhbj4KICA8L3A+CiAgPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDoxMnB4O2p1c3RpZnktY29udGVudDpjZW50ZXI7ZmxleC13cmFwOndyYXA7bWFyZ2luLWJvdHRvbToyMHB4OyI+CiAgICA8YSBocmVmPSIvYXVkaXQtaW50YWtlIiBzdHlsZT0iZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtiYWNrZ3JvdW5kOnZhcigtLWdvbGQpO2NvbG9yOiMwMDA7dGV4dC1kZWNvcmF0aW9uOm5vbmU7cGFkZGluZzoxNHB4IDMycHg7Ym9yZGVyLXJhZGl1czo4cHg7Zm9udC1mYW1pbHk6J0JlYmFzIE5ldWUnLHNhbnMtc2VyaWY7Zm9udC1zaXplOjIwcHg7bGV0dGVyLXNwYWNpbmc6LjA0ZW07Ij4KICAgICAg8J+UjSA8c3BhbiBjbGFzcz0ibmwiPkF1ZGl0IEFhbnZyYWdlbiDihpI8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+UmVxdWVzdCBBdWRpdCDihpI8L3NwYW4+CiAgICA8L2E+CiAgICA8YSBocmVmPSJodHRwczovL2NhbGVuZGx5LmNvbS9haW9lZGl0b3JzIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImRpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7YmFja2dyb3VuZDpyZ2JhKDE0Nyw1MSwyMzQsLjE1KTtjb2xvcjp2YXIoLS1wdXJwbGUpO3RleHQtZGVjb3JhdGlvbjpub25lO3BhZGRpbmc6MTRweCAzMnB4O2JvcmRlci1yYWRpdXM6OHB4O2ZvbnQtZmFtaWx5OidCZWJhcyBOZXVlJyxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToyMHB4O2xldHRlci1zcGFjaW5nOi4wNGVtO2JvcmRlcjoxcHggc29saWQgcmdiYSgxNDcsNTEsMjM0LC4zKTsiPgogICAgICDwn5OFIDxzcGFuIGNsYXNzPSJubCI+R3JhdGlzIFN0cmF0ZWdpZWdlc3ByZWs8L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+RnJlZSBTdHJhdGVneSBDYWxsPC9zcGFuPgogICAgPC9hPgogIDwvZGl2PgogIDxkaXYgc3R5bGU9ImRpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2dhcDoyMHB4O2ZsZXgtd3JhcDp3cmFwOyI+CiAgICA8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTsiPuKckyA8c3BhbiBjbGFzcz0ibmwiPkJpbm5lbiAxNSBtaW51dGVuPC9zcGFuPjxzcGFuIGNsYXNzPSJlbiIgc3R5bGU9ImRpc3BsYXk6bm9uZTsiPldpdGhpbiAxNSBtaW48L3NwYW4+PC9zcGFuPgogICAgPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7Ij7inJMgR0RQUiBjb21wbGlhbnQ8L3NwYW4+CiAgICA8c3BhbiBzdHlsZT0iZm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMDhlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tc3ViKTsiPuKckyA8c3BhbiBjbGFzcz0ibmwiPkdlZW4gdmVycGxpY2h0aW5nZW48L3NwYW4+PHNwYW4gY2xhc3M9ImVuIiBzdHlsZT0iZGlzcGxheTpub25lOyI+Tm8gb2JsaWdhdGlvbnM8L3NwYW4+PC9zcGFuPgogICAgPHNwYW4gc3R5bGU9ImZvbnQtZmFtaWx5OidJQk0gUGxleCBNb25vJyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXN1Yik7Ij7inJMgQW1zdGVyZGFtPC9zcGFuPgogIDwvZGl2Pgo8L2Rpdj4KCjxocj4KPGRpdiBzdHlsZT0idGV4dC1hbGlnbjpjZW50ZXI7cGFkZGluZzoyMHB4IDA7Zm9udC1mYW1pbHk6J0lCTSBQbGV4IE1vbm8nLG1vbm9zcGFjZTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjCiAgQ29udGVudFNjYWxlIMK3IEFtc3RlcmRhbSDCtyBjb250ZW50c2NhbGUuc2l0ZSDCtyBpbmZvQGNvbnRlbnRzY2FsZS5zaXRlCjwvZGl2PgoKPC9kaXY+Cgo8c2NyaXB0PgpmdW5jdGlvbiBzZXRMYW5nKGxhbmcpIHsKICB2YXIgaHRtbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdodG1sUm9vdCcpOwogIHZhciBidG5OTCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG5OTCcpOwogIHZhciBidG5FTiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG5FTicpOwogIGlmIChsYW5nID09PSAnZW4nKSB7CiAgICBodG1sLnNldEF0dHJpYnV0ZSgnbGFuZycsICdlbicpOwogICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdsYW5nLWVuJyk7CiAgICBidG5OTC5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtZmFtaWx5OklCTSBQbGV4IE1vbm8sbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6OHB4IDE4cHg7Ym9yZGVyLXJhZGl1czo1cHggMCAwIDVweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlcik7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtjb2xvcjp2YXIoLS1tdXRlZCk7Y3Vyc29yOnBvaW50ZXI7JzsKICAgIGJ0bkVOLnN0eWxlLmNzc1RleHQgPSAnZm9udC1mYW1pbHk6SUJNIFBsZXggTW9ubyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo4cHggMThweDtib3JkZXItcmFkaXVzOjAgNXB4IDVweCAwO2JvcmRlcjoxcHggc29saWQgdmFyKC0tZ29sZCk7YmFja2dyb3VuZDp2YXIoLS1nb2xkKTtjb2xvcjojMDAwO2N1cnNvcjpwb2ludGVyO2ZvbnQtd2VpZ2h0OjcwMDsnOwogICAgdHJ5e2xvY2FsU3RvcmFnZS5zZXRJdGVtKCdjc19ndWlkZV9sYW5nJywnZW4nKTt9Y2F0Y2goZSl7fQogIH0gZWxzZSB7CiAgICBodG1sLnNldEF0dHJpYnV0ZSgnbGFuZycsICdubCcpOwogICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdsYW5nLWVuJyk7CiAgICBidG5OTC5zdHlsZS5jc3NUZXh0ID0gJ2ZvbnQtZmFtaWx5OklCTSBQbGV4IE1vbm8sbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO3BhZGRpbmc6OHB4IDE4cHg7Ym9yZGVyLXJhZGl1czo1cHggMCAwIDVweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWdvbGQpO2JhY2tncm91bmQ6dmFyKC0tZ29sZCk7Y29sb3I6IzAwMDtjdXJzb3I6cG9pbnRlcjtmb250LXdlaWdodDo3MDA7JzsKICAgIGJ0bkVOLnN0eWxlLmNzc1RleHQgPSAnZm9udC1mYW1pbHk6SUJNIFBsZXggTW9ubyxtb25vc3BhY2U7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjFlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7cGFkZGluZzo4cHggMThweDtib3JkZXItcmFkaXVzOjAgNXB4IDVweCAwO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2NvbG9yOnZhcigtLW11dGVkKTtjdXJzb3I6cG9pbnRlcjsnOwogICAgdHJ5e2xvY2FsU3RvcmFnZS5zZXRJdGVtKCdjc19ndWlkZV9sYW5nJywnbmwnKTt9Y2F0Y2goZSl7fQogIH0KfQooZnVuY3Rpb24oKXsKICB0cnl7dmFyIHM9bG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NzX2d1aWRlX2xhbmcnKTtpZihzPT09J2VuJylzZXRMYW5nKCdlbicpO31jYXRjaChlKXt9Cn0pKCk7Cjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K", "base64").toString("utf8"));
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
      <button onclick="openInPulseNexus('${b.url.replace(/'/g, "\\'")}', '${b.keyword.replace(/'/g, "\\'")}', ${b.position || 0}, ${b.impressions || 0}, ${(b.ctr || 0)})" style="background:#fbbf24;color:#000;border:none;padding:9px 16px;border-radius:5px;font-weight:600;font-size:13px;cursor:pointer;">🔬 Open in PULSE+NEXUS →</button>
    </div>
  </div>
  <div style="background:#f3f4f6;padding:10px 28px;font-size:11px;color:#9ca3af;">${b.timestamp || new Date().toISOString()} · contentscale.site</div>
</div>
<script>
function openInPulseNexus(url, keyword, pos, impr, ctr) {
  console.log('📊 Opening PULSE+NEXUS with data:', {url, keyword, pos, impr, ctr});
  const auditData = {
    pageUrl: url,
    keyword: keyword,
    position: pos,
    impressions: impr,
    ctr: ctr,
    source: 'recommendations',
    timestamp: new Date().toISOString()
  };
  try {
    localStorage.setItem('cs_audit_transfer', JSON.stringify(auditData));
    sessionStorage.setItem('cs_audit_transfer', JSON.stringify(auditData));
    console.log('✅ Data saved to storage');
  } catch(e) {
    console.error('Storage error:', e);
  }
  const params = new URLSearchParams({url: url, kw: keyword, source: 'recs'});
  window.open('/seo-audit?' + params.toString(), '_blank');
}
</script>
</body></html>`;

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

// ✅ FIX: Use v1alpha — v1beta doesn't support Live features and causes 1007 errors
const GEMINI_LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const GEMINI_LIVE_MODEL  = 'models/gemini-2.0-flash-exp'; // v1alpha Live model

// REST endpoint to verify key + connectivity before browser opens WebSocket

// ── Gemini Live ephemeral token endpoint (FIXED) ─────────────────────────────
// ── Gemini Live ephemeral token endpoint (FIXED for 1007 error) ──────────────
app.get('/api/gemini-live-token', async (req, res) => {
  try {
    // Admin bypass for testing
    if (req.query.admin === 'ottmar2024') {
      console.log('[otto] admin bypass token request');
    }
    
    // Rate limit check (2 requests per IP per day)
    const ip = req.ip || req.connection.remoteAddress;
    const today = new Date().toISOString().split('T')[0];
    
    if (!_ottoIpMap.has(ip)) {
      _ottoIpMap.set(ip, { count: 1, date: today });
    } else {
      const entry = _ottoIpMap.get(ip);
      if (entry.date !== today) {
        entry.count = 1;
        entry.date = today;
      } else {
        entry.count++;
        if (entry.count > 2) {
          console.log(`[otto] rate limit hit for ${ip}`);
          return res.status(429).json({ error: 'Daily limit reached' });
        }
      }
    }
    
    // Clean old entries periodically
    if (_ottoIpMap.size > 1000) {
      for (const [k, v] of _ottoIpMap.entries()) {
        if (v.date !== today) _ottoIpMap.delete(k);
      }
    }
    
    // Build WebSocket URL for Gemini Live — USE v1alpha NOT v1beta
    const apiKey = process.env.GEMINI_KEY_LEADCRAWLER || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[otto] GEMINI_KEY_LEADCRAWLER not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const model = 'gemini-2.0-flash-live-001';
    // ✅ FIX: Use v1alpha endpoint — v1beta causes 1007 errors
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
    
    console.log(`[otto] token issued for ${ip} — model: ${model}`);
    
    // Return BOTH wsUrl AND key for client compatibility
    res.json({ 
      wsUrl, 
      key: apiKey, 
      model,
      expires: Date.now() + 3600000 // 1 hour
    });
    
  } catch (error) {
    console.error('[otto] token endpoint error:', error.message);
    res.status(500).json({ error: 'Failed to generate token', details: error.message });
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

// WebSocket proxy (server created above, near top of startServer)

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
  audio_b64 TEXT DEFAULT NULL,
  audio_chunks JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days')
)`).catch(e => console.warn('[otto_sessions]', e.message));

// ── MIGRATION: Ensure audio columns exist for older deployments ─────────────
async function cleanupExpiredSessions() {
  try {
    const r = await pool.query(
      "DELETE FROM otto_sessions WHERE expires_at < NOW() RETURNING session_id"
    );
    if (r.rowCount > 0) console.log('[otto] cleanup: deleted', r.rowCount, 'expired sessions');
  } catch(e) { console.warn('[otto] cleanup error:', e.message); }
}
(async () => {
  await pool.query(`ALTER TABLE otto_sessions ADD COLUMN IF NOT EXISTS audio_b64 TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE otto_sessions ADD COLUMN IF NOT EXISTS audio_chunks JSONB DEFAULT '[]'`).catch(()=>{});
  await pool.query(`ALTER TABLE otto_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days')`).catch(()=>{});
  // Run cleanup only after migrations complete so expires_at is guaranteed to exist
  cleanupExpiredSessions();
  setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);
})();
// ────────────────────────────────────────────────────────────────────────────

// Save audio — always saved, stored as single compact base64 string
app.post('/api/otto/save-audio', async (req, res) => {
  const { sessionId, audioChunks } = req.body;
  if (!sessionId || !audioChunks) return res.status(400).json({ error: 'sessionId and audioChunks required' });
  try {
    // Merge all chunks into one compact b64 string instead of JSON array
    const merged = Array.isArray(audioChunks) ? audioChunks.join('') : audioChunks;
    const sizeKB = Math.round(Buffer.byteLength(merged, 'base64') / 1024);
    await pool.query(
      'UPDATE otto_sessions SET audio_b64=$1, audio_chunks=$2 WHERE session_id=$3',
      [merged, JSON.stringify([]), sessionId]
    );
    console.log('[otto] audio saved:', sessionId, sizeKB + 'KB');
    res.json({ ok: true, sizeKB });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Download audio for a session as WAV-like PCM file
app.get('/api/otto/sessions/:id/audio', async (req, res) => {
  try {
    const r = await pool.query('SELECT session_id, audio_b64, duration_seconds FROM otto_sessions WHERE session_id=$1 OR id::text=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].audio_b64) return res.status(404).json({ error: 'No audio found' });
    const buf = Buffer.from(r.rows[0].audio_b64, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', 'attachment; filename="otto-' + r.rows[0].session_id + '.pcm"');
    res.send(buf);
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

app.get('/api/otto-version', (req, res) => res.json({ version: 'v6', model: 'gemini-2.0-flash-live-001', voice: 'Fenrir' }));


// ── Otto AI client JS — embedded inline ──────────────────────────────────
const _OTTO_JS = `// ContentScale — Otto AI — Gemini Live v6 (FIXED)
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
var _killTimer    = null;
var _audioChunks  = [];
var _hasPhone     = false;
var _hangupScheduled = false;
var _sessionId    = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
var _sessionStart = Date.now();
var _sessionModel = null;
var _transcript   = [];

var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

var OTTO_SCRIPT = "You are Otto, a male AI voice assistant of ContentScale. You are NOT a salesperson — you are helpful and honest. Follow this exact script step by step: 1. Say: Hey! I am Otto, an AI assistant of ContentScale. I have about 1 minute for you — is that okay or would you rather I hang up? 2a. If no: say No problem, have a great day! Goodbye! Then STOP. 2b. If yes: say Great! And great timing — this month you can win 250 euros in free SEO services just by sharing this conversation. But first, may I have your name? Wait for answer. 3. Say: Hey [name]! We help businesses recover lost Google traffic with a free GRAAF Framework scan and PULSE+NEXUS SEO audit. We also do outbound calls and lead generation so you never miss a client again. 4. Ask: Would that be interesting for you? Wait for answer. 5a. If not interested: say No worries, maybe another time. Have a great day! Goodbye! Then STOP. 5b. If interested: say Wonderful! Ottmar, our founder, will personally call you back. And to be eligible for our 250 euro prize this month, I just need your mobile number with country code. What is it? Wait for answer. Repeat the number back digit by digit to confirm. Then say: Perfect! Ottmar will be in touch soon. Have a great day! Goodbye! Then STOP. Always say goodbye before stopping. Never add extra information. Never continue after goodbye.";

function setStatus(msg) {
  if (window._ottoStatusOverride) { window._ottoStatusOverride(msg); return; }
  var el = document.getElementById('gl-status');
  if (el) {
    el.textContent = msg;
    el.className = '';
    if (/speaking|praat|saying/i.test(msg)) el.className = 'speaking';
    else if (/listen|speak now|your turn|hallo|ready|connecting/i.test(msg)) el.className = 'listening';
    else if (/error|denied|limit|disconnect|failed|timeout|blocked/i.test(msg)) el.className = 'error';
  }
}

function addTranscript(who, msg) {
  if (window._ottoTranscriptOverride) { window._ottoTranscriptOverride(who, msg); return; }
  var el = document.getElementById('gl-transcript');
  if (!el) return;
  el.style.display = 'block';
  var cls = who === 'model' ? 't-otto' : 't-you';
  var label = who === 'model' ? 'Otto' : 'You';
  el.innerHTML += '<div class="' + cls + '"><span class="t-label">' + label + '&nbsp;</span><span class="t-text">' + msg + '</span></div>';
  el.scrollTop = el.scrollHeight;
}

function setBtnActive(on) {
  if (window._ottoActiveOverride) { window._ottoActiveOverride(on); }
  var btn = document.getElementById('gl-call-btn');
  var wrap = document.getElementById('avatarWrap');
  if (btn) btn.classList.toggle('active', on);
  if (wrap) wrap.classList.toggle('active', on);
}

function forceCleanup() {
  _active = false;
  clearTimeout(_killTimer);
  if (_ws && _ws.readyState < 2) { try { _ws.close(); } catch(e) {} }
  _ws = null;
  setBtnActive(false);
  setStatus('Click to start a live conversation');
}

function hangup(reason) {
  if (!_active) return;
  console.log('[otto] hanging up:', reason);
  if (window._ottoOnSessionEnd) window._ottoOnSessionEnd();
  forceCleanup();
  saveAndHangup();
}

function saveAndHangup() {
  if (_sessionId && (_transcript.length || _sessionModel)) {
    var duration = Math.round((Date.now() - (_sessionStart||Date.now())) / 1000);
    fetch('https://app.contentscale.site/api/otto/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: _sessionId, transcript: _transcript, durationSeconds: duration, model: _sessionModel })
    }).then(function() {
      if (_audioChunks.length > 0) {
        return fetch('https://app.contentscale.site/api/otto/save-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: _sessionId, audioChunks: _audioChunks })
        });
      }
    }).then(function(){ console.log('[otto] audio saved, chunks:', _audioChunks.length); })
    .catch(function(e){ console.warn('[otto] save error:', e.message); });
  }
  _audioChunks = [];
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
  forceCleanup();
  if (_processor) { try { _processor.disconnect(); } catch(e) {} _processor = null; }
  if (_stream)    { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
  if (_micCtx)    { try { _micCtx.close(); } catch(e) {} _micCtx = null; }
  if (_playCtx)   { try { _playCtx.close(); } catch(e) {} _playCtx = null; }
  _nextStart = 0;
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

  // HARD KILL: 120 seconds max
  _killTimer = setTimeout(function() { hangup('2 min limit reached'); }, 120000);
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

    if (!r.ok || (!keyData.key && !keyData.wsUrl)) {
      setStatus('Error: ' + (keyData.error || 'No key'));
      stopSession(); return;
    }
  } catch(e) {
    setStatus('Server error: ' + e.message);
    setBtnActive(false);
    _active = false;
    return;
  }

  var model = keyData.model || 'gemini-2.0-flash-live-001';
  _sessionModel = model;
  _sessionId = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  _sessionStart = Date.now();
  _transcript = [];
  window._ottTurnCount = 0;
  _hangupScheduled = false;

  console.log('[otto] model:', model);
  // ✅ Use v1alpha wsUrl from server — v1beta causes 1007 errors
  var wsUrl = keyData.wsUrl || ('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(keyData.key));
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
          output_audio_transcription: {},
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Fenrir' }
            }
          }
        },
        input_audio_transcription: {},
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
            if (p.text) {
              var ptxt = p.text || '';
              addTranscript('model', ptxt);
              if (!_hangupScheduled && /\b(goodbye|have a great day|speak to you soon|talk soon|take care|cheers|bye)\b/i.test(ptxt)) {
                _hangupScheduled = true;
                console.log('[otto] goodbye detected in text');
                setTimeout(function() { hangup('goodbye detected'); }, 2000);
              }
            }
          });
        }

        if (sc.inputTranscription) addTranscript('you', sc.inputTranscription.text);

        if (sc.outputTranscription) {
          var txt = sc.outputTranscription.text || '';
          addTranscript('model', txt);
          if (!_hangupScheduled && /\b(goodbye|have a great day|speak to you soon|talk soon|take care|cheers|bye)\b/i.test(txt)) {
            _hangupScheduled = true;
            console.log('[otto] goodbye detected in transcription');
            setTimeout(function() { hangup('goodbye detected'); }, 2000);
          }
        }

        if (sc.turnComplete) {
          _turnCount++;
          window._ottTurnCount = _turnCount;
          setStatus('Your turn — speak now...');
          if (_turnCount >= 10 && !_hangupScheduled) {
            _hangupScheduled = true;
            clearTimeout(_killTimer);
            _killTimer = setTimeout(function() { hangup('script complete'); }, 15000);
          }
        }
      }
    } catch(e) { console.warn('[otto] parse:', e.message); }
  };
// ContentScale — Otto AI — Gemini Live v6 (FIXED)
// ✅ v1alpha endpoint (fixes 1007 error)
// ✅ Fenrir male voice
// ✅ Auto-hangup 2s after goodbye detected
// ✅ Uses wsUrl from server token (never falls back to v1beta)

(function () {
  'use strict';

  var _ws             = null;
  var _active         = false;
  var _micCtx         = null;
  var _stream         = null;
  var _processor      = null;
  var _playCtx        = null;
  var _nextStart      = 0;
  var _killTimer      = null;
  var _audioChunks    = [];
  var _hangupScheduled = false;
  var _sessionId      = null;
  var _sessionStart   = null;
  var _sessionModel   = null;
  var _transcript     = [];
  var _turnCount      = 0;

  // ✅ v1alpha — v1beta causes 1007 errors
  var V1ALPHA_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

  var OTTO_SCRIPT = "You are Otto, a male AI voice assistant of ContentScale. You are NOT a salesperson — you are helpful and honest. Follow this exact script step by step: 1. Say: Hey! I am Otto, an AI assistant of ContentScale. I have about 1 minute for you — is that okay or would you rather I hang up? 2a. If no: say No problem, have a great day! Goodbye! Then STOP. 2b. If yes: say Great! And great timing — this month you can win 250 euros in free SEO services just by sharing this conversation. But first, may I have your name? Wait for answer. 3. Say: Hey [name]! We help businesses recover lost Google traffic with a free GRAAF Framework scan and PULSE+NEXUS SEO audit. We also do outbound calls and lead generation so you never miss a client again. 4. Ask: Would that be interesting for you? Wait for answer. 5a. If not interested: say No worries, maybe another time. Have a great day! Goodbye! Then STOP. 5b. If interested: say Wonderful! Ottmar, our founder, will personally call you back. And to be eligible for our 250 euro prize this month, I just need your mobile number with country code. What is it? Wait for answer. Repeat the number back digit by digit to confirm. Then say: Perfect! Ottmar will be in touch soon. Have a great day! Goodbye! Then STOP. Always say goodbye before stopping. Never add extra information. Never continue after goodbye.";

  var GOODBYE_RE = /\b(goodbye|have a great day|speak to you soon|talk soon|take care|cheers|bye)\b/i;

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function setStatus(msg) {
    if (window._ottoStatusOverride) { window._ottoStatusOverride(msg); return; }
    var el = document.getElementById('gl-status');
    if (!el) return;
    el.textContent = msg;
    el.className = '';
    if (/speaking|saying/i.test(msg))                                    el.className = 'speaking';
    else if (/listen|speak now|your turn|ready|connecting/i.test(msg))   el.className = 'listening';
    else if (/error|denied|limit|disconnect|failed|timeout/i.test(msg))  el.className = 'error';
  }

  function addTranscript(who, msg) {
    if (window._ottoTranscriptOverride) { window._ottoTranscriptOverride(who, msg); return; }
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    var label = who === 'model' ? 'Otto' : 'You';
    var cls   = who === 'model' ? 't-otto' : 't-you';
    el.innerHTML += '<div class="' + cls + '"><span class="t-label">' + label + '&nbsp;</span><span class="t-text">' + msg + '</span></div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(on) {
    if (window._ottoActiveOverride) window._ottoActiveOverride(on);
    var btn  = document.getElementById('gl-call-btn');
    var wrap = document.getElementById('avatarWrap');
    if (btn)  btn.classList.toggle('active', on);
    if (wrap) wrap.classList.toggle('active', on);
  }

  // ── Session teardown ───────────────────────────────────────────────────────

  function forceCleanup() {
    _active = false;
    clearTimeout(_killTimer);
    _killTimer = null;
    if (_ws && _ws.readyState < 2) { try { _ws.close(); } catch(e) {} }
    _ws = null;
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  function saveSession() {
    if (!_sessionId || !_transcript.length) return;
    var duration = Math.round((Date.now() - (_sessionStart || Date.now())) / 1000);
    fetch('https://app.contentscale.site/api/otto/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: _sessionId,
        transcript: _transcript,
        durationSeconds: duration,
        model: _sessionModel
      })
    }).catch(function(e) { console.warn('[otto] save error:', e.message); });
  }

  function hangup(reason) {
    if (!_active) return;
    console.log('[otto] hangup:', reason);
    if (window._ottoOnSessionEnd) window._ottoOnSessionEnd();
    saveSession();
    stopAudio();
    stopMic();
    forceCleanup();
  }

  function stopMic() {
    if (_processor) { try { _processor.disconnect(); } catch(e) {} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    if (_micCtx)    { try { _micCtx.close(); } catch(e) {} _micCtx = null; }
  }

  function stopAudio() {
    if (_playCtx) { try { _playCtx.close(); } catch(e) {} _playCtx = null; }
    _nextStart = 0;
  }

  function stopSession() {
    saveSession();
    stopMic();
    stopAudio();
    forceCleanup();
  }

  // ── Audio playback ─────────────────────────────────────────────────────────

  function ensurePlayCtx() {
    if (!_playCtx || _playCtx.state === 'closed') {
      _playCtx   = new AudioContext({ sampleRate: 24000 });
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
      var src  = _playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_playCtx.destination);
      var now  = _playCtx.currentTime;
      var when = Math.max(now, _nextStart);
      src.start(when);
      _nextStart = when + buf.duration;
    } catch(e) { console.warn('[otto] audio chunk error:', e.message); }
  }

  // ── Mic capture ────────────────────────────────────────────────────────────

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

    // Hard kill after 2 minutes
    _killTimer = setTimeout(function() { hangup('2-min limit'); }, 120000);
  }

  // ── Main session ───────────────────────────────────────────────────────────

  async function startSession() {
    if (_active) { stopSession(); return; }

    _active          = true;
    _hangupScheduled = false;
    _turnCount       = 0;
    _sessionId       = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    _sessionStart    = Date.now();
    _transcript      = [];
    setBtnActive(true);
    setStatus('Getting key...');

    // ── Fetch token from server ──────────────────────────────────────────────
    var keyData;
    try {
      var params   = new URLSearchParams();
      var adminKey = new URLSearchParams(location.search).get('admin');
      if (adminKey) params.set('admin', adminKey);
      if (window._ottoRefCode) params.set('ref', window._ottoRefCode);
      var qs = params.toString() ? '?' + params.toString() : '';

      var r = await fetch('https://app.contentscale.site/api/gemini-live-token' + qs);
      keyData = await r.json();

      if (r.status === 429) {
        setStatus('Daily limit reached — come back tomorrow!');
        if (window._ottoLimitOverride) window._ottoLimitOverride();
        _active = false; setBtnActive(false); return;
      }
      if (!r.ok || (!keyData.wsUrl && !keyData.key)) {
        setStatus('Error: ' + (keyData.error || 'No connection details'));
        stopSession(); return;
      }
    } catch(e) {
      setStatus('Server error: ' + e.message);
      _active = false; setBtnActive(false); return;
    }

    var model     = keyData.model || 'gemini-2.0-flash-exp';
    _sessionModel = model;
    console.log('[otto] model:', model);

    // ✅ Always use v1alpha wsUrl from server — never fall back to v1beta
    var wsUrl = keyData.wsUrl
      ? keyData.wsUrl
      : (V1ALPHA_WS + '?key=' + encodeURIComponent(keyData.key));

    console.log('[otto] connecting via:', wsUrl.split('?')[0]); // log path only, not key
    setStatus('Connecting...');

    // ── Open WebSocket ───────────────────────────────────────────────────────
    try { _ws = new WebSocket(wsUrl); _ws.binaryType = 'arraybuffer'; }
    catch(e) { setStatus('WS error: ' + e.message); stopSession(); return; }

    _ws.onopen = function() {
      setStatus('Connected...');
      var setup = {
        setup: {
          model: 'models/' + model,
          generation_config: {
            response_modalities: ['AUDIO'],
            output_audio_transcription: {},
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: 'Fenrir' }
              }
            }
          },
          input_audio_transcription: {},
          system_instruction: { parts: [{ text: OTTO_SCRIPT }] }
        }
      };
      console.log('[otto] sending setup — model:', model, '| voice: Fenrir');
      _ws.send(JSON.stringify(setup));
    };

    _ws.onmessage = function(evt) {
      try {
        var raw = evt.data instanceof ArrayBuffer
          ? new TextDecoder().decode(new Uint8Array(evt.data))
          : evt.data;
        var msg = JSON.parse(raw);

        // ── Setup complete → start mic ─────────────────────────────────────
        if (msg.setupComplete) {
          setStatus('Otto is speaking...');
          startMic().catch(function(e) { setStatus('Mic: ' + e.message); stopSession(); });
          return;
        }

        if (msg.serverContent) {
          var sc = msg.serverContent;

          // ── Play audio ───────────────────────────────────────────────────
          if (sc.modelTurn && sc.modelTurn.parts) {
            sc.modelTurn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
                _audioChunks.push(p.inlineData.data);
              }
              // Text part goodbye detection
              if (p.text && !_hangupScheduled && GOODBYE_RE.test(p.text)) {
                _hangupScheduled = true;
                console.log('[otto] goodbye in text — hanging up in 2s');
                setTimeout(function() { hangup('goodbye (text)'); }, 2000);
              }
            });
          }

          // ── User transcript ──────────────────────────────────────────────
          if (sc.inputTranscription && sc.inputTranscription.text) {
            addTranscript('you', sc.inputTranscription.text);
            _transcript.push({ role: 'user', text: sc.inputTranscription.text, t: Date.now() });
          }

          // ── Otto transcript + goodbye detection ──────────────────────────
          if (sc.outputTranscription && sc.outputTranscription.text) {
            var txt = sc.outputTranscription.text;
            addTranscript('model', txt);
            _transcript.push({ role: 'otto', text: txt, t: Date.now() });
            if (!_hangupScheduled && GOODBYE_RE.test(txt)) {
              _hangupScheduled = true;
              console.log('[otto] goodbye in transcript — hanging up in 2s');
              setTimeout(function() { hangup('goodbye (transcript)'); }, 2000);
            }
          }

          // ── Turn complete ────────────────────────────────────────────────
          if (sc.turnComplete) {
            _turnCount++;
            setStatus('Your turn — speak now...');
            // Hard cutoff after 10 turns if goodbye wasn't said
            if (_turnCount >= 10 && !_hangupScheduled) {
              _hangupScheduled = true;
              setTimeout(function() { hangup('max turns reached'); }, 5000);
            }
          }
        }
      } catch(e) { console.warn('[otto] parse error:', e.message); }
    };

    _ws.onerror = function() {
      setStatus('Connection error');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code);
      if (_active) {
        if (evt.code === 1007) setStatus('Model unavailable — contact support');
        else if (evt.code === 1008) setStatus('API key needs Gemini Live access');
        else setStatus('Disconnected');
        stopSession();
      }
    };
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent    = window.Tawk_API.triggerEvent    || function() {};
  window.Tawk_API.addQuickReplies = window.Tawk_API.addQuickReplies || function() {};

  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] v6 READY — v1alpha | Fenrir | goodbye 2s hangup');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();

// Serve Otto JS — all versioned names point to same embedded content


// ── Otto widget standalone page & embed ──────────────────────────────────
// -- Otto widget standalone page & embed --

const _OTTO_WIDGET_HTML = "<!DOCTYPE html>\n<html lang=\"en\">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Otto AI — ContentScale</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #060910; font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
.widget { background: linear-gradient(160deg, #0d1117 0%, #0a0f1a 100%); border: 1px solid rgba(74,222,128,.2); border-radius: 24px; padding: 36px 28px 28px; width: 100%; max-width: 340px; display: flex; flex-direction: column; align-items: center; text-align: center; box-shadow: 0 0 0 1px rgba(74,222,128,.05), 0 0 60px rgba(74,222,128,.06), 0 30px 80px rgba(0,0,0,.7); position: relative; overflow: hidden; }
.widget::before { content: ''; position: absolute; top: -60px; left: 50%; transform: translateX(-50%); width: 200px; height: 120px; background: radial-gradient(ellipse, rgba(74,222,128,.12) 0%, transparent 70%); pointer-events: none; }
.avatar-wrap { position: relative; width: 96px; height: 96px; margin-bottom: 20px; }
.avatar { width: 96px; height: 96px; border-radius: 50%; background: linear-gradient(135deg, #0d2e1a 0%, #0a1f12 100%); border: 2px solid rgba(74,222,128,.4); display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; }
.avatar svg { width: 42px; height: 42px; opacity: .85; }
.ring { position: absolute; border-radius: 50%; border: 1.5px solid rgba(74,222,128,.18); top: 50%; left: 50%; transform: translate(-50%,-50%); pointer-events: none; }
.ring-1 { width: 120px; height: 120px; }
.ring-2 { width: 148px; height: 148px; border-color: rgba(74,222,128,.08); }
@keyframes pulse-ring { 0% { transform: translate(-50%,-50%) scale(1); opacity: .6; } 100% { transform: translate(-50%,-50%) scale(1.15); opacity: 0; } }
.active .ring-1 { animation: pulse-ring 1.4s ease-out infinite; }
.active .ring-2 { animation: pulse-ring 1.4s ease-out .5s infinite; }
.name { font-family: 'Inter', sans-serif; font-size: 28px; font-weight: 900; letter-spacing: .12em; background: linear-gradient(90deg, #4ade80 0%, #86efac 50%, #60a5fa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 4px; }
.sub { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: #9ca3af; margin-bottom: 20px; }
#gl-status { font-size: 13px; font-weight: 500; color: #6b7280; margin-bottom: 24px; min-height: 20px; line-height: 1.4; transition: color .3s; }
#gl-status.speaking { color: #4ade80; }
#gl-status.listening { color: #60a5fa; }
#gl-status.error { color: #f87171; }
#gl-call-btn { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(145deg, #16a34a, #4ade80); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; box-shadow: 0 0 0 10px rgba(74,222,128,.1), 0 0 30px rgba(74,222,128,.3), inset 0 1px 0 rgba(255,255,255,.15); transition: all .2s ease; position: relative; z-index: 2; }
#gl-call-btn:hover { transform: scale(1.06); box-shadow: 0 0 0 14px rgba(74,222,128,.12), 0 0 40px rgba(74,222,128,.4); }
#gl-call-btn.active { background: linear-gradient(145deg, #991b1b, #f87171); box-shadow: 0 0 0 10px rgba(239,68,68,.12), 0 0 30px rgba(239,68,68,.3); }
#gl-call-btn svg { width: 32px; height: 32px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.3)); }
.hint { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #6b7280; line-height: 2; margin-bottom: 4px; }
#gl-transcript { margin-top: 16px; width: 100%; background: #0a0d12; border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px 16px; font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.7; max-height: 140px; overflow-y: auto; text-align: left; display: none; scrollbar-width: thin; scrollbar-color: rgba(74,222,128,.2) transparent; }
#gl-transcript::-webkit-scrollbar { width: 4px; }
#gl-transcript::-webkit-scrollbar-track { background: transparent; }
#gl-transcript::-webkit-scrollbar-thumb { background: rgba(74,222,128,.2); border-radius: 2px; }
.t-otto { color: #4ade80; margin-bottom: 6px; }
.t-you  { color: #93c5fd; margin-bottom: 6px; }
.t-label { font-weight: 700; font-size: 11px; letter-spacing: .05em; }
.t-text  { font-weight: 400; }
.limit-msg { margin-top: 14px; font-size: 12px; color: #f87171; line-height: 1.5; display: none; }
</style>
</head>
<body>
<div class="widget" id="widget">
  <div class="avatar-wrap" id="avatarWrap">
    <div class="ring ring-1"></div>
    <div class="ring ring-2"></div>
    <div class="avatar">
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
  <div class="sub">ContentScale AI &nbsp;&middot;&nbsp; Gemini Live</div>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;line-height:1.6;text-align:center">Do you have a website?<br>Then this is for you.</div>
  <div style="font-size:10px;color:#4ade80;margin-bottom:14px;text-align:center;font-family:'JetBrains Mono',monospace;letter-spacing:.04em">
    Share &amp; win &euro;250 in free services &mdash; <a href="https://app.contentscale.site/otto/leaderboard" target="_blank" style="color:#4ade80;text-decoration:underline">see leaderboard</a>
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
  <div class="hint">Microphone &nbsp;&middot;&nbsp; No phone needed<br>Click again to end</div>
  <div id="shareScreen" style="display:none;flex-direction:column;align-items:center;width:100%;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);">
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4ade80;font-family:'JetBrains Mono',monospace;margin-bottom:8px">Share &amp; win</div>
    <div style="font-size:15px;font-weight:700;color:#f3f4f6;margin-bottom:4px">You have <span id="myPts" style="color:#4ade80">0</span> points</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:12px;text-align:center">Share Otto. Top 3 this month wins &euro;250 in free services.</div>
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
    <a href="https://app.contentscale.site/otto/leaderboard" target="_blank" style="font-size:12px;color:#4ade80;text-decoration:none">View leaderboard &rarr;</a>
  </div>
  <div class="limit-msg" id="limitMsg">You've already spoken with Otto today.<br>Come back tomorrow for another conversation.</div>
  <div id="gl-transcript"></div>
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.05);width:100%;text-align:center">
    <div style="font-size:9px;font-family:'JetBrains Mono',monospace;letter-spacing:.06em;color:#4b5563;line-height:2.2">
      <a href="https://contentscale.site" target="_blank" style="color:#4b5563;text-decoration:none">ContentScale.site</a>
      &nbsp;&middot;&nbsp;
      <a href="https://contentscale.site/privacy-policy/" target="_blank" style="color:#4b5563;text-decoration:none">Privacy</a>
      &nbsp;&middot;&nbsp;
      <a href="https://contentscale.site/terms/" target="_blank" style="color:#4b5563;text-decoration:none">Terms</a>
      &nbsp;&middot;&nbsp;
      <a href="https://contentscale.site/privacy-policy/#data-requests" target="_blank" style="color:#4b5563;text-decoration:none">Data requests</a>
    </div>
    <div style="font-size:8px;color:#374151;margin-top:2px;font-family:'JetBrains Mono',monospace">
      AI conversations may be recorded for quality purposes
    </div>
  </div>
</div>
<script>
window._ottoTranscriptOverride = function(who, msg) {
  var el = document.getElementById('gl-transcript');
  if (!el) return;
  el.style.display = 'block';
  var cls = who === 'model' ? 't-otto' : 't-you';
  var label = who === 'model' ? 'Otto' : 'You';
  el.innerHTML += '<div class="' + cls + '"><span class="t-label">' + label + '&nbsp;</span><span class="t-text">' + msg + '</span></div>';
  el.scrollTop = el.scrollHeight;
};
window._ottoStatusOverride = function(msg) {
  var el = document.getElementById('gl-status');
  if (!el) return;
  el.textContent = msg;
  el.className = '';
  if (/speaking|praat|saying/i.test(msg)) el.className = 'speaking';
  else if (/listen|speak now|your turn|hallo|ready|connecting/i.test(msg)) el.className = 'listening';
  else if (/error|denied|limit|disconnect|failed|timeout|blocked/i.test(msg)) el.className = 'error';
};
window._ottoActiveOverride = function(on) {
  var btn = document.getElementById('gl-call-btn');
  var wrap = document.getElementById('avatarWrap');
  if (btn) btn.classList.toggle('active', on);
  if (wrap) wrap.classList.toggle('active', on);
};
window._ottoLimitOverride = function() {
  var msg = document.getElementById('limitMsg');
  if (msg) msg.style.display = 'block';
  var status = document.getElementById('gl-status');
  if (status) { status.textContent = 'Daily limit reached. Try again tomorrow.'; status.className = 'error'; }
  document.getElementById('gl-call-btn').classList.remove('active');
};
window._ottoOnSessionEnd = function() {
  console.log('[otto] Session ended. Showing share screen.');
  document.getElementById('gl-call-btn').classList.remove('active');
  var status = document.getElementById('gl-status');
  if (status) { status.textContent = 'Conversation ended. Share to win!'; status.className = ''; }
  document.getElementById('shareScreen').style.display = 'flex';
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
var _ottRef = new URLSearchParams(location.search).get('ref') || '';
window._ottoRefCode = _ottRef;
var _consent = localStorage.getItem('cs_consent');
if (!_consent) {
  var consentEl = document.createElement('div');
  consentEl.id = 'ow-consent';
  consentEl.innerHTML = '<h3>Before we start</h3><p>Otto AI stores your conversation to improve our service and tracks referrals using local storage. <a href="https://contentscale.site/privacy-policy/" target="_blank">Privacy Policy</a></p><button id="ow-ca">Accept &amp; Talk to Otto</button><button id="ow-cd">Decline</button>';
  document.addEventListener('DOMContentLoaded', function() {
    var widget = document.querySelector('.widget');
    if (widget) {
      widget.style.position = 'relative';
      widget.appendChild(consentEl);
      document.getElementById('ow-ca').onclick = function() { localStorage.setItem('cs_consent','accepted'); consentEl.remove(); };
      document.getElementById('ow-cd').onclick = function() { localStorage.setItem('cs_consent','denied'); document.getElementById('gl-status').textContent = 'Consent required to use Otto.'; consentEl.remove(); };
    }
  });
}
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
<script src="https://app.contentscale.site/badge-loader.js?v=3"></script>
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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-LOAD DATA FROM RECOMMENDATIONS PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function autoLoadFromRecommendations() {
  console.log('🔍 [PULSE+NEXUS] Checking for Recommendations data...');
  
  let transferData = null;
  
  // Method 1: Try localStorage first
  try {
    const stored = localStorage.getItem('cs_audit_transfer');
    if (stored) {
      transferData = JSON.parse(stored);
      console.log('✅ [PULSE+NEXUS] Found data in localStorage:', transferData);
    }
  } catch (e) {
    console.warn('⚠️ [PULSE+NEXUS] localStorage read error:', e);
  }
  
  // Method 2: Try sessionStorage as backup
  if (!transferData) {
    try {
      const stored = sessionStorage.getItem('cs_audit_transfer');
      if (stored) {
        transferData = JSON.parse(stored);
        console.log('✅ [PULSE+NEXUS] Found data in sessionStorage:', transferData);
      }
    } catch (e) {}
  }
  
  // Method 3: Check URL parameters
  if (!transferData) {
    const urlParams = new URLSearchParams(window.location.search);
    const urlData = {
      pageUrl: urlParams.get('url'),
      keyword: urlParams.get('kw'),
      position: urlParams.get('pos'),
      impressions: urlParams.get('impr'),
      ctr: urlParams.get('ctr'),
      source: urlParams.get('source')
    };
    
    if (urlData.pageUrl) {
      transferData = urlData;
      console.log('✅ [PULSE+NEXUS] Found data in URL params:', transferData);
    }
  }
  
  // If we have data, auto-fill the form
  if (transferData && transferData.pageUrl) {
    console.log('📝 [PULSE+NEXUS] Auto-filling form with:', transferData);
    
    const fillForm = () => {
      try {
        // Fill URL field
        const urlField = document.querySelector('input#dUrl, input[name="url"], input[type="url"]');
        if (urlField && transferData.pageUrl) {
          urlField.value = transferData.pageUrl;
          console.log('✅ URL filled:', transferData.pageUrl);
        }
        
        // Fill Primary Keyword field
        const kwField = document.querySelector('input#dKw, input[name="keyword"]');
        if (kwField && transferData.keyword) {
          kwField.value = transferData.keyword;
          console.log('✅ Keyword filled:', transferData.keyword);
        }
        
        // Fill GSC data fields
        if (transferData.position) {
          const posField = document.getElementById('dPos');
          if (posField) {
            posField.value = transferData.position;
            console.log('✅ Position filled:', transferData.position);
          }
        }
        
        if (transferData.impressions) {
          const imprField = document.getElementById('dImpr');
          if (imprField) {
            imprField.value = transferData.impressions;
            console.log('✅ Impressions filled:', transferData.impressions);
          }
        }
        
        if (transferData.ctr) {
          const ctrField = document.getElementById('dCtr');
          if (ctrField) {
            ctrField.value = transferData.ctr;
            console.log('✅ CTR filled:', transferData.ctr);
          }
        }
        
        // Switch to Deep Dive mode
        if (typeof setMode === 'function') {
          setMode('deep');
          console.log('✅ Switched to Deep Dive mode');
        }
        
        // Store globally for later use
        window._recommendationsData = transferData;
        
        // Show success notification
        const notif = document.createElement('div');
        const notifStyle = 'position:fixed;top:20px;right:20px;background:#4ade80;color:#000;padding:16px 24px;border-radius:8px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:IBM Plex Mono,monospace;font-size:13px;';
        notif.style.cssText = notifStyle;
        notif.innerHTML = '✅ Workflow Data Loaded! 📊';
        document.body.appendChild(notif);
        
        // AUTO-START DEEP DIVE
        if (transferData.source === 'recommendations' || transferData.source === 'recs') {
          console.log('🚀 Auto-starting Deep Dive from Recommendations...');
          setTimeout(function() {
            var runBtn = document.querySelector('#deepRunBtn, button[onclick*="runDeepAudit"]');
            if (runBtn && !runBtn.disabled) {
              console.log('🎯 Clicking Run Audit button...');
              setTimeout(function() { 
                runBtn.click(); 
                console.log('✅ Deep Dive started automatically!');
              }, 2000);
            }
          }, 1500);
        }
        
        setTimeout(() => {
          notif.style.transition = 'opacity 0.3s';
          notif.style.opacity = '0';
          setTimeout(() => notif.remove(), 300);
        }, 4000);
        
        console.log('✅ [PULSE+NEXUS] Form filled successfully!');
      } catch (e) {
        console.error('❌ [PULSE+NEXUS] Error filling form:', e);
      }
    };
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fillForm);
    } else {
      setTimeout(fillForm, 100);
    }
  } else {
    console.log('ℹ️ [PULSE+NEXUS] No Recommendations data found - manual mode');
  }
})();
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


let gscPages = [];
let gscQueries = [];

const RAILWAY = 'https://app.contentscale.site';

// ── Auto-load GSC from Workflow Manager localStorage ──────────
function loadSharedGSC() {
  try {
    const raw = localStorage.getItem('cs_shared_gsc');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.pages && data.pages.length) {
      gscPages = data.pages.map(p => ({
        page: p.page || p.url || '',
        impressions: p.impressions || 0,
        clicks: p.clicks || 0,
        ctr: p.ctr || 0,
        position: p.position || 0,
        score: p.score || 0
      })).filter(p => p.page && p.page.includes('.'));
      const el = document.getElementById('pagesStatus');
      if (el) el.innerHTML = \`<span style="color:var(--green)">✓ \${gscPages.length} pages from Workflow Manager</span>\`;
      console.log('[PULSE+NEXUS] Loaded', gscPages.length, 'pages from shared GSC');
    }
    if (data.queries && data.queries.length) {
      gscQueries = data.queries.map(q => ({query: q.query || '', position: q.position || 0})).filter(q => q.query);
      const el = document.getElementById('queriesStatus');
      if (el) el.innerHTML = \`<span style="color:var(--green)">✓ \${gscQueries.length} queries from Workflow Manager</span>\`;
    }
    return gscPages.length > 0;
  } catch(e) { console.warn('[PULSE+NEXUS] loadSharedGSC error:', e.message); return false; }
}
setTimeout(loadSharedGSC, 200);


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
    + '<div><span style="font-family:\'IBM Plex Mono\',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);">Meta Consistentie</span>'
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
    // Load GSC from localStorage now that URL params are known
    loadSharedGSC();
    // Build connection banner
    const chips = [];
    if(p.get('pos'))  chips.push(\`<span style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.25);border-radius:4px;padding:2px 8px;font-size:10px;">pos \${parseFloat(p.get('pos')).toFixed(1)}</span>\`);
    if(p.get('impr')) chips.push(\`<span style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.25);border-radius:4px;padding:2px 8px;font-size:10px;">\${parseInt(p.get('impr')).toLocaleString()} impr</span>\`);
    if(p.get('ctr'))  chips.push(\`<span style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.25);border-radius:4px;padding:2px 8px;font-size:10px;">\${p.get('ctr')}% CTR</span>\`);
    const gscBadge = gscPages.length
      ? \`<span style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.25);border-radius:4px;padding:2px 8px;font-size:10px;color:#4ade80;">✓ \${gscPages.length} GSC pages</span>\`
      : \`<span style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:4px;padding:2px 8px;font-size:10px;color:#fbbf24;">⚠ No GSC — upload CSV above</span>\`;
    const banner = document.createElement('div');
    banner.style.cssText = 'background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:14px 18px;margin-bottom:14px;font-size:11px;color:#fbbf24;';
    banner.innerHTML = \`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="font-size:12px;font-family:Bebas Neue,sans-serif;letter-spacing:.04em;">Connected from Workflow Manager</strong>
      \${p.get('wf') ? '<a href="/audit-workflow" style="color:#a78bfa;text-decoration:none;font-size:10px;">← Back to Workflow</a>' : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">\${chips.join('')} \${gscBadge}</div>
    <div style="margin-top:8px;font-size:10px;color:rgba(251,191,36,.5);">Paste page HTML below → Run Full Audit</div>\`;
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
    try { localStorage.setItem('cs_shared_gsc', JSON.stringify({pages:gscPages, queries:gscQueries})); } catch(e) {}
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
    .replace(/^### (.+)\$/gm,'<h3>\$1</h3>')
    .replace(/^## (.+)\$/gm,'<h2>\$1</h2>')
    .replace(/^# (.+)\$/gm,'<h1>\$1</h1>')
    .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>\$1</strong>')
    .replace(/\\*(.+?)\\*/g,'<em>\$1</em>')
    .replace(/\`([^\`\\n]+)\`/g,'<code>\$1</code>')
    .replace(/\`\`\`[\\w]*\\n?([\\s\\S]*?)\`\`\`/g,'<pre><code>\$1</code></pre>')
    .replace(/^&gt; (.+)\$/gm,'<blockquote>\$1</blockquote>')
    .replace(/^---+\$/gm,'<hr>')
    .replace(/^\\|(.+)\\|\$/gm,m=>{
      const cells=m.split('|').slice(1,-1);
      if (cells.every(c=>/^[\\s\\-:]+\$/.test(c))) return '';
      return '<tr>'+cells.map(c=>\`<td>\${c.trim()}</td>\`).join('')+'</tr>';
    })
    .replace(/(<tr>[\\s\\S]*?<\\/tr>)+/g,m=>\`<table>\${m}</table>\`)
    .replace(/^[\\-\\*•] (.+)\$/gm,'<li>\$1</li>')
    .replace(/^\\d+\\. (.+)\$/gm,'<li>\$1</li>')
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
  const tryPaths = [
    path.join(__dirname, '../public/seo-audit.html'),
    path.join(__dirname, 'public/seo-audit.html'),
  ];
  const filePath = tryPaths.find(p => fs.existsSync(p));
  if (!filePath) return res.status(404).send('seo-audit.html not found in public/');
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.send(fs.readFileSync(filePath, 'utf8'));
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

// ══════════════════════════════════════════════════════════════════════
// GSC AUTO-FILL — /api/gsc/auto-fill
// Haalt GSC data op voor een specifieke pagina via Service Account
// Vereist: GSC_SERVICE_ACCOUNT_JSON env var in Railway
// ══════════════════════════════════════════════════════════════════════
app.post('/api/gsc/auto-fill', async (req, res) => {
  if (!_gscServiceAccount) {
    return res.status(503).json({
      success: false,
      error: 'GSC_SERVICE_ACCOUNT_JSON niet geconfigureerd in Railway Variables'
    });
  }

  const { pageUrl } = req.body;
  if (!pageUrl) return res.status(400).json({ success: false, error: 'pageUrl required' });

  try {
    const urlObj = new URL(pageUrl);
    const siteUrl = `https://${urlObj.hostname}/`;

    const now = Math.floor(Date.now() / 1000);
    const { createSign } = require('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: _gscServiceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(_gscServiceAccount.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const tokenResp = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResp.data.access_token;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const pageResp = await axios.post(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate, endDate,
        dimensions: ['page'],
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }],
        rowLimit: 1
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const queryResp = await axios.post(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate, endDate,
        dimensions: ['query'],
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }],
        rowLimit: 20
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const pageRows = pageResp.data.rows || [];
    const queryRows = queryResp.data.rows || [];

    let impressions = 0, clicks = 0, ctr = 0, position = 0;
    if (pageRows.length > 0) {
      impressions = Math.round(pageRows[0].impressions || 0);
      clicks = Math.round(pageRows[0].clicks || 0);
      ctr = parseFloat(((pageRows[0].ctr || 0) * 100).toFixed(2));
      position = parseFloat((pageRows[0].position || 0).toFixed(1));
    }

    const topQueries = queryRows.slice(0, 15).map(r => r.keys[0]).join('\n');

    console.log(`[gsc] ${pageUrl} => ${impressions} impr ${ctr}% CTR pos ${position}`);

    res.json({
      success: true,
      data: { impressions, clicks, ctr, position, topQueries, queryCount: queryRows.length, dateRange: `${startDate} => ${endDate}` }
    });

  } catch(e) {
    const msg = e.response && e.response.data && e.response.data.error
      ? (e.response.data.error.message || e.response.data.error)
      : e.message;
    console.error('[gsc] error:', msg);
    let hint = '';
    if (msg.includes('403') || msg.includes('Forbidden')) {
      hint = ' — Voeg service account toe aan GSC: seo-audit-tool-service-account@pure-heuristic-473710-t1.iam.gserviceaccount.com';
    }
    res.status(500).json({ success: false, error: msg + hint });
  }
});


startServer();
