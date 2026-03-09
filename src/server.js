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
const sgMail = require('@sendgrid/mail');
const app = express();
const PORT = process.env.PORT || 3000;
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
app.use(compression({ level: 9, threshold: 0 }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// CORS
app.use((req, res, next) => {
const allowedOrigins = ['https://app.contentscale.site', 'https://contentscale.site', 'http://localhost:3000'];
const origin = req.headers.origin;
if (allowedOrigins.includes(origin)) res.header('Access-Control-Allow-Origin', origin);
res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key, x-user-id');
res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
if (req.method === 'OPTIONS') return res.sendStatus(200);
next();
});
app.use(express.static('public', { maxAge: '1y', etag: true }));
// ── Favicon & manifest ──────────────────────────────────────────────────────
app.get('/site.webmanifest', (req, res) => {
res.setHeader('Content-Type', 'application/manifest+json');
res.sendFile(path.join(__dirname, 'public', 'site.webmanifest'));
});
// ── Favicon & manifest ──────────────────────────────────────────────────────
app.get('/site.webmanifest', (req, res) => {
res.setHeader('Content-Type', 'application/manifest+json');
res.sendFile(path.join(__dirname, 'public', 'site.webmanifest'));
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
if (!browserInstance) {
console.log('🚀 Launching Puppeteer...');
browserInstance = await puppeteer.launch({
headless: 'new',
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
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
} catch (e) { res.send(`
<p>Error: ${e.message}</p>
`); }
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
const fs = require('fs');
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
const { company_name, url, score, country, niche } = req.body;
const updates = []; const vals = []; let i = 1;
if (company_name) { updates.push(`company_name=$${i++}`); vals.push(company_name); }
if (url) { updates.push(`url=$${i++}`); vals.push(url); }
if (score) { updates.push(`score=$${i++}`); vals.push(parseInt(score)); }
if (country) { updates.push(`country=$${i++}`); vals.push(country); }
if (niche) { updates.push(`niche=$${i++}`); vals.push(niche); }
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
// Leaderboard Public
app.get('/api/leaderboard', async (req, res) => {
if (!pool) return res.json({ success: true, entries: [], stats: {} });
try {
const r = await pool.query(`SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as rank, company_name, url, score, country, niche, is_verified as is_claimed, admin_verified, created_at FROM leaderboard WHERE score IS NOT NULL AND is_opted_out = FALSE ORDER BY score DESC LIMIT 100`);
const entries = r.rows;
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
    const axios = require('axios');

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
app.post('/api/sitemap/submit', async (req, res) => {
  const { domain, company_name, avg_score, avg_graaf, avg_craft, avg_technical, page_count, page_scores, country, niche, business_type } = req.body;
  if (!domain || avg_score === undefined) return res.status(400).json({ success: false, error: 'Missing required fields' });
  try {
    const r = await pool.query(
      `INSERT INTO leaderboard (url, company_name, score, graaf_score, craft_score, technical_score, country, niche, business_type, page_count, page_scores, scan_source, admin_verified, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'sitemap', FALSE, FALSE)
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
         admin_verified = FALSE
       RETURNING id`,
      [domain, company_name || null, Math.round(avg_score), Math.round(avg_graaf), Math.round(avg_craft), Math.round(avg_technical), country || null, niche || null, business_type || null, page_count, JSON.stringify(page_scores || [])]
    );
    res.json({ success: true, id: r.rows[0].id });
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
    return `<tr style="border-bottom:1px solid #e5e7eb;">
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
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>ContentScale Scan Report — ${sameDomain?domains[0]:results.length+' sites'}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,Helvetica,sans-serif;background:#f9fafb;color:#111827;}@media print{.no-print{display:none!important;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
  </head><body style="max-width:900px;margin:0 auto;">
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
    ${sameDomain?`<div style="padding:32px 40px;background:white;border-bottom:2px solid #e5e7eb;text-align:center;">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Average Domain Score</div>
      <div style="font-size:64px;font-weight:900;color:${scoreColor};line-height:1;">${avgScore}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">${results.length} pages · ${domains[0]}</div>
    </div>`:''}
    <div style="padding:32px 40px;overflow-x:auto;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <thead><tr style="background:#f5f3ff;">
          <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">#</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">URL</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;color:#6b7280;">Score</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;color:#7e22ce;">GRAAF</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;color:#1d4ed8;">CRAFT</th>
          <th style="padding:12px 16px;text-align:center;font-size:12px;color:#b45309;">Technical</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">Tier</th>
          <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;">Link</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="background:#111827;padding:24px 40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div><div style="color:white;font-weight:700;font-size:14px;">ContentScale</div><div style="color:#9ca3af;font-size:12px;">Ottmar JG Francisca · Amsterdam</div></div>
      <a href="https://contentscale.site" style="color:#a855f7;font-size:12px;font-weight:700;text-decoration:none;">contentscale.site</a>
    </div>
    <div class="no-print" style="text-align:center;padding:20px;"><button onclick="window.print()" style="background:linear-gradient(135deg,#7e22ce,#4f46e5);color:white;border:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Print / Save PDF</button></div>
  </body></html>`;
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
else if (analysis.metaDescriptionLength > 0) technicalScore += 1;
if (analysis.hasArticleSchema)      technicalScore += 4;
if (analysis.hasFAQPageSchema)      technicalScore += 4;
if (analysis.hasCanonical)          technicalScore += 2;
if (analysis.images > 0 && analysis.imagesWithAlt >= Math.min(5, analysis.images)) technicalScore += 2;
else if (analysis.images > 0 && analysis.imagesWithAlt > 0) technicalScore += 1;
if (analysis.hasMetaViewport)       technicalScore += 2;
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
            recommendations.push({ title: '📱 Add Open Graph Meta Tags', description: 'No Open Graph tags detected.', priority: 'low', action: "Add og:title, og:description, og:image (1200×630px), og:url to your <head>.", learning: "Open Graph tags control how your page appears when shared socially.", target: 'og:title, og:description, og:image (1200×630px), og:url' });
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
    'INSERT INTO bulk_jobs(id,user_id,status,total,done,failed,results,updated_at) VALUES(,,,,,,,NOW()) ON CONFLICT(id) DO UPDATE SET status=,done=,failed=,results=,updated_at=NOW()',
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
      await page.goto(scanUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500)); // let JS render
    } catch(e) { throw new Error('Unreachable: ' + e.message.substring(0,80)); }
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
          if (attempt === 1) result = { success: false, url, error: e.message, score: 0 };
          else await new Promise(r => setTimeout(r, 4000));
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
      const row = await pool.query('SELECT * FROM bulk_jobs WHERE id=', [req.params.jobId]);
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
const browser = await getBrowser();
if (!browser) return res.status(500).json({ success: false, error: 'Browser unavailable' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
await page.goto(scanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
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
const hasFAQContent = Array.from(document.querySelectorAll('h2, h3, h4')).some(h =>
h.textContent.toLowerCase().includes('faq') ||
h.textContent.toLowerCase().includes('frequently asked') ||
h.textContent.toLowerCase().includes('common question')
);
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
if (bq.textContent.trim().length > 30 && cite && cite.textContent.trim().length > 3) expertQuoteCount++;
});
const testimonialSelectors = ['.review', '.testimonial', '[class*="review"]', '[class*="testimonial"]', '[class*="quote"]'];
testimonialSelectors.forEach(sel => {
try { document.querySelectorAll(sel).forEach(el => { if (el.textContent.trim().length > 40) expertQuoteCount++; }); } catch (e) {}
});
let caseStudyCount = 0;
const caseStudyKeywords = ['case study', 'challenge', 'solution', 'results', 'roi', 'recovered', 'recovery', 'success rate'];
const seen = new Set();
document.querySelectorAll('section, article').forEach(el => {
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
/about the author|written by/i.test(rawHtml)
) && /years of experience|certified|specializ|founder|director|ceo/i.test(rawHtml);
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
               } catch (error) {
               console.error('❌ Scan error:', error.message);
               res.status(500).json({ success: false, error: 'Scan failed', details: error.message });
               }
               });
               // Routes
               app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin-dashboard.html')));
               app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
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
console.log('\n🚀 =====================================');
console.log('🚀  CONTENTSCALE ELITE SERVER v4 (FIXED v3)');
console.log('🚀  FIX: activated_until alias in users SELECT');
console.log('🚀  FIX: deactivate endpoint added');
console.log('🚀  FIX: Instantly Bearer uses secret only');
console.log('🚀  DB Migration: country VARCHAR(100)');
console.log('🚀  scan_log.source column');
console.log('🚀  DOCX: template type column');
console.log('🚀  Bulk Delete Routes');
console.log('🚀  34 Recommendation Checks');
console.log('🚀  GRAAF 50 + CRAFT 30 + Technical 20');
console.log('🚀 =====================================\n');
const dbConnected = await waitForDatabase();
app.listen(PORT, () => {
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
const urlsToScan = urls.filter(p => !p.url || !alreadyScanned.has(p.url.trim()));
totalSkipped += urls.length - urlsToScan.length;
let comboScanned = 0;
for (const place of urlsToScan) {
if (activeJobs.get(jobId)?.cancelled) break;
if (!place.url) { comboScanned++; continue; }
try {
const scanRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scan`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ url: place.url })
});
const scanData = await scanRes.json();
const score = scanData.score || 0;
if (score >= 85) scoreHigh++;
else if (score >= 70) scoreGood++;
else scoreLow++;
const reportId = crypto.randomBytes(20).toString('hex');
const reportUrl = '/report/' + reportId;
const insertResult = await pool.query(
`INSERT INTO scan_log (user_id, business_url, business_name, score, niche, city, country, email_found, email_status, source, recommendations, report_url)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'discover',$10,$11) RETURNING id`,
[
'batch_job_' + jobId,
place.url, place.name, score, niche, city, country,
place.email || null,
place.email ? 'has_email' : 'no_email',
scanData.recommendations ? JSON.stringify((scanData.recommendations.all || scanData.recommendations).slice(0,5).map(r => r.title || r)) : null,
reportUrl
]
).catch(() => null);
if (insertResult) {
await pool.query(
`INSERT INTO scan_reports (id, scan_log_id, business_url, business_name, score, niche, city, country, email_found, recommendations)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
[reportId, insertResult.rows[0]?.id, place.url, place.name, score, niche, city, country, place.email || null,
scanData.recommendations ? JSON.stringify((scanData.recommendations.all || scanData.recommendations).slice(0,5)) : null]
).catch(() => {});
}
alreadyScanned.add(place.url.trim());
totalScanned++;
} catch(e) {}
comboScanned++;
const innerPct = Math.round((ci / combos.length) * 85) + Math.round((comboScanned / Math.max(urlsToScan.length, 1)) * 10);
await updateJob({
progress: Math.min(innerPct, 95),
progress_text: `Combo ${ci+1}/${combos.length} · ${comboScanned}/${urlsToScan.length}: ${place.name || place.url}`,
scanned: totalScanned, skipped: totalSkipped,
score_high: scoreHigh, score_good: scoreGood, score_low: scoreLow
});
}
}
await updateJob({
status: 'completed', progress: 100,
progress_text: `✅ Done — ${totalScanned} scanned, ${totalSkipped} skipped`,
scanned: totalScanned, skipped: totalSkipped,
score_high: scoreHigh, score_good: scoreGood, score_low: scoreLow,
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
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
    `INSERT INTO campaigns(id,name,status,total_domains,done_domains,domains,instantly_campaign_id,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT(id) DO UPDATE SET status=$3,done_domains=$5,domains=$6,updated_at=NOW()`,
    [slim.id, slim.name||'Campaign', slim.status, slim.totalDomains, slim.doneDomains,
     JSON.stringify(slim.domains), slim.instantlyCampaignId||null]
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
        for (const sub of subMatches.slice(0, 8)) {
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
      const urls = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)]
        .map(m => m[1]).filter(u => !u.endsWith('.xml'));
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
  const base = process.env.BASE_URL || 'https://contentscale.site';
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
    domainObj.status = 'fetching_sitemap';
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
              if (attempt === 1) result = { success: false, url, error: e.message, score: 0 };
              else await new Promise(r => setTimeout(r, 3000));
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

      // Step 4: extract email
      domainObj.status = 'extracting_email';
      const email = await extractDomainEmail(domainObj.domain, successful);
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
  const { domains, name, instantly_api_key, instantly_campaign_id } = req.body;
  if (!Array.isArray(domains) || !domains.length)
    return res.status(400).json({ success: false, error: 'domains array required' });

  const cleanDomains = [...new Set(domains.map(d => d.trim().toLowerCase().replace(/^https?:\/\//,'').split('/')[0]).filter(d => d.includes('.')))];
  if (!cleanDomains.length) return res.status(400).json({ success: false, error: 'No valid domains' });

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
      email: null, shareUrl: null, instantlyStatus: null,
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
              domains: row.rows[0].domains, createdAt: new Date(row.rows[0].created_at).getTime() };
        campaigns.set(c.id, c);
      }
    } catch(e) {}
  }
  if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
  res.json({ success: true, ...c });
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


startServer();
