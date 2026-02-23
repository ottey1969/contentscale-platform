//
// CONTENTSCALE SERVER.JS — ELITE EDITION v4 (FIXED)
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

        // 4. Freelancers
        await client.query(`CREATE TABLE IF NOT EXISTS freelancers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, title VARCHAR(255), location VARCHAR(255), country VARCHAR(100), bio TEXT, linkedin_url TEXT, hourly_rate VARCHAR(50), availability VARCHAR(100), is_approved BOOLEAN DEFAULT FALSE, is_verified BOOLEAN DEFAULT FALSE, is_featured BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())`);
        
        // 5. Email Queue
        await client.query(`CREATE TABLE IF NOT EXISTS email_queue (id SERIAL PRIMARY KEY, user_id VARCHAR(255), to_email VARCHAR(255) NOT NULL, to_name VARCHAR(255), subject TEXT NOT NULL, body TEXT NOT NULL, status VARCHAR(50) DEFAULT 'pending', sent_at TIMESTAMP, error_message TEXT, created_at TIMESTAMP DEFAULT NOW(), business_url TEXT, business_name VARCHAR(255), score INTEGER, template_type VARCHAR(50))`);
        // 6. Scan Log (tracks every auto-discover scan — including no-email businesses)
        await client.query(`CREATE TABLE IF NOT EXISTS scan_log (id SERIAL PRIMARY KEY, user_id VARCHAR(255), business_url TEXT, business_name VARCHAR(255), score INTEGER, niche VARCHAR(100), city VARCHAR(255), country VARCHAR(100), email_found VARCHAR(255), email_status VARCHAR(50) DEFAULT 'no_email', recommendations TEXT, created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS recommendations TEXT`).catch(() => {});
        // 7. Email suppression list (unsubscribes — respected forever across all future scans)
        await client.query(`CREATE TABLE IF NOT EXISTS email_suppression (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, unsubscribed_at TIMESTAMP DEFAULT NOW(), reason VARCHAR(100) DEFAULT 'user_request')`);
        // 8. Warmup config — tracks when each user started their email warmup
        await client.query(`CREATE TABLE IF NOT EXISTS warmup_config (id SERIAL PRIMARY KEY, user_id VARCHAR(255) UNIQUE NOT NULL, warmup_start_date DATE NOT NULL DEFAULT CURRENT_DATE, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW())`);        // Migrate: add columns if they don't exist yet
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
// API ENDPOINTS — User, Templates, Bulk, Admin
// ============================================
app.post('/api/user/register', async (req, res) => {
    try {
        const userId = crypto.randomUUID();
        const ip = req.ip || req.connection.remoteAddress;
        await pool.query(`INSERT INTO users (id, ip_address, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO NOTHING`, [userId, ip]);
        const defaultTemplates = [
            { type: 'congrats', subject: '🎉 Congratulations!', body: '<h1>Congratulations!</h1><p>Score: {{score}}/100</p>' },
            { type: 'improvement', subject: '🚀 SEO Opportunity', body: '<h1>SEO Opportunity</h1><p>Score: {{score}}/100</p>' },
            { type: 'website', subject: '💻 Website Offer', body: '<h1>Website Offer</h1>' }
        ];
        for (const t of defaultTemplates) {
            await pool.query(`INSERT INTO user_email_templates (user_id, template_type, subject, body) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, template_type) DO NOTHING`, [userId, t.type, t.subject, t.body]);
        }
        res.json({ success: true, userId });
    } catch (error) { res.json({ success: false, error: 'Registration failed' }); }
});

// ============================================
// ✅ UPDATED: hasSendgrid is TRUE when server env var SENDGRID_API_KEY is set.
// Users no longer need to paste their own key — the server key is used for everyone.
// ============================================
app.get('/api/user/keys/status', async (req, res) => {
    const userId = req.headers['x-user-id'];
    // Server-level SendGrid key takes priority — if set, all users have access
    const serverHasSendgrid = !!process.env.SENDGRID_API_KEY;
    if (serverHasSendgrid) {
        return res.json({ success: true, hasSendgrid: true, source: 'server' });
    }
    // Fallback: check if this user has their own key stored (legacy / future per-user support)
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

// ============================================
// ✅ UPDATED: /api/email/send
// Priority: server SENDGRID_API_KEY env var → user's own stored key → error
// Daily limit tracked server-side in email_queue table (counts per calendar day)
// ============================================
// ── Warmup Config ──────────────────────────────────────────────────────────
function calcWarmupCap(dayNumber) {
    if (dayNumber <= 7)  return 5;   // Week 1: 5/day
    if (dayNumber <= 14) return 20;  // Week 2: 20/day
    if (dayNumber <= 21) return 40;  // Week 3: 40/day
    if (dayNumber <= 28) return 70;  // Week 4: 70/day
    return 100;                       // Week 5+: full 100/day
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
    const { email, token } = req.query;
    if (!email) return res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:60px;background:#030712;color:#e5e7eb;"><h2>⚠️ Invalid unsubscribe link.</h2></body></html>`);
    try {
        if (pool) await pool.query(`INSERT INTO email_suppression (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email.toLowerCase()]);
        res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#030712;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="text-align:center;max-width:480px;padding:40px;">
    <div style="font-size:56px;margin-bottom:16px;">✅</div>
    <h1 style="color:#4ade80;margin-bottom:8px;">You've been unsubscribed.</h1>
    <p style="color:#9ca3af;margin-bottom:24px;">${email} has been removed from all future ContentScale scan emails. This is permanent and respected across all future scans.</p>
    <a href="https://app.contentscale.site" style="background:linear-gradient(135deg,#7e22ce,#be185d);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Back to ContentScale</a>
  </div>
</body></html>`);
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

    // Check warmup cap — use warmup daily limit if active, otherwise default
    let dailyLimit = parseInt(process.env.SENDGRID_DAILY_LIMIT || '100');
    if (pool) {
        const wup = await pool.query(`SELECT warmup_start_date FROM warmup_config WHERE user_id = $1 AND is_active = TRUE`, [userId || 'server']).catch(() => ({ rows: [] }));
        if (wup.rows.length) {
            const day = Math.floor((new Date() - new Date(wup.rows[0].warmup_start_date)) / 86400000) + 1;
            dailyLimit = calcWarmupCap(day);
        }
    }

    // Check suppression list — respect unsubscribes permanently
    if (pool) {
        const sup = await pool.query(`SELECT id FROM email_suppression WHERE email = $1`, [to_email.toLowerCase()]).catch(() => ({ rows: [] }));
        if (sup.rows.length > 0) return res.json({ success: false, suppressed: true, error: 'Email unsubscribed' });
    }

    let apiKeyToUse = null;

    // 1. Try server-level key first (Railway env var)
    if (process.env.SENDGRID_API_KEY) {
        apiKeyToUse = process.env.SENDGRID_API_KEY;
    } else if (userId && pool) {
        // 2. Fallback: user's own stored key
        try {
            const result = await pool.query("SELECT api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1 AND service_name = 'sendgrid'", [userId]);
            if (result.rows.length > 0) {
                apiKeyToUse = result.rows[0].api_key;
                dailyLimit = result.rows[0].daily_limit;
                // Check user-level daily limit
                if (result.rows[0].used_today >= dailyLimit) {
                    return res.json({ success: false, limit_reached: true, error: 'Daily limit reached' });
                }
            }
        } catch (e) { console.error('Key lookup error:', e.message); }
    }

    if (!apiKeyToUse) return res.json({ success: false, needs_api_key: true, error: 'No SendGrid key configured' });

    // Check server-level daily limit (count rows in email_queue sent today)
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

        // Log sent email to queue table for daily tracking
        if (pool) {
            await pool.query(
                `INSERT INTO email_queue (user_id, to_email, subject, body, status, sent_at, business_url, business_name, score, template_type) VALUES ($1, $2, $3, $4, 'sent', NOW(), $5, $6, $7, $8)`,
                [userId || 'server', to_email, subject, html, business_url || null, business_name || null, score || null, template_type || null]
            ).catch(e => console.warn('Email log failed:', e.message));
        }

        // Also increment user-level counter if using user key
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
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try { const r = await pool.query('SELECT * FROM users ORDER BY created_at DESC'); res.json({ success: true, users: r.rows }); }
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

// Leaderboard Admin

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

# Page margins
for section in doc.sections:
    section.top_margin    = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin   = Cm(2.5)
    section.right_margin  = Cm(2.5)

# Title block
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

# Summary stats
total   = len(scans)
emailed = sum(1 for s in scans if s.get('email_status') == 'has_email')
no_em   = sum(1 for s in scans if s.get('email_status') == 'no_email')
lb      = sum(1 for s in scans if (s.get('score') or 0) >= 70)

stats_p = doc.add_paragraph()
stats_p.add_run('Summary   ').bold = True
stats_p.add_run(f'Total scanned: {total}   |   Emails sent: {emailed}   |   No email found: {no_em}   |   Leaderboard (70+): {lb}')

doc.add_paragraph()

# Table
headers = ['Business', 'URL', 'Score', 'Email Found', 'Status', 'Top Issue', 'Scanned']
widths  = [Cm(4.5), Cm(5.5), Cm(1.5), Cm(5), Cm(2.2), Cm(5), Cm(2.8)]

table = doc.add_table(rows=1, cols=len(headers))
table.style = 'Table Grid'

# Header row
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

# Data rows
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

    row_data = [
        (s.get('business_name') or '—')[:40],
        (s.get('business_url') or '—').replace('https://','').replace('http://','').replace('www.','')[:40],
        score_str,
        (s.get('email_found') or 'not found')[:35],
        'Sent' if s.get('email_status') == 'has_email' else 'No email',
        rec[:50],
        dt_str
    ]

    row = table.add_row()
    fill = 'F5F3FF' if idx % 2 == 0 else 'FFFFFF'
    for i, (cell, val) in enumerate(zip(row.cells, row_data)):
        p = cell.paragraphs[0]
        run = p.add_run(val)
        run.font.size = Pt(7.5)
        # Score color
        if i == 2 and score is not None:
            if score >= 70:   run.font.color.rgb = RGBColor(5, 150, 105)
            elif score >= 50: run.font.color.rgb = RGBColor(180, 83, 9)
            else:             run.font.color.rgb = RGBColor(185, 28, 28)
            run.bold = True
        # Status color
        if i == 4:
            run.font.color.rgb = RGBColor(5, 150, 105) if val == 'Sent' else RGBColor(107, 114, 128)
        # Row shading
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), fill)
        tcPr.append(shd)

# Footer
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

app.get('/api/scan-log', async (req, res) => {
    if (!pool) return res.json({ success: false, error: 'No DB' });
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json({ success: false, error: 'No user ID' });
    try {
        const r = await pool.query(
            `SELECT id, business_url, business_name, score, niche, city, country, email_found, email_status, recommendations, created_at
             FROM scan_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]
        );
        res.json({ success: true, scans: r.rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/scan-log', async (req, res) => {
    if (!pool) return res.json({ success: false });
    const { user_id, business_url, business_name, score, niche, city, country, email_found, email_status, recommendations } = req.body;
    try {
        await pool.query(
            `INSERT INTO scan_log (user_id, business_url, business_name, score, niche, city, country, email_found, email_status, recommendations)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT DO NOTHING`,
            [user_id || null, business_url, business_name || null, score || null, niche || null, city || null, country || null, email_found || null, email_status || 'no_email', recommendations ? JSON.stringify(recommendations) : null]
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get('/api/admin/scan-log', verifyAdmin, async (req, res) => {
    if (!pool) return res.json({ success: false, error: 'No DB' });
    const limit = parseInt(req.query.limit) || 200;
    try {
        const r = await pool.query(
            `SELECT id, business_url, business_name, score, niche, city, country, email_found, email_status, recommendations, created_at
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
// 🏆 ELITE SCANNER — GRAAF + CRAFT + TECHNICAL
// 34 recommendation checks with Learning + Target
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
        
        // ── PAGE EVALUATE — all detections happen inside the page ──
        const analysis = await page.evaluate((scanUrlParam) => {
            const text = document.body ? document.body.innerText : '';
            const cleanText = text.replace(/\s+/g, ' ').trim();
            const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
            const rawHtml = document.documentElement.outerHTML;
            
            // Headings
            const h1Els = document.querySelectorAll('h1');
            const h1Count = h1Els.length;
            // Capture first H1's visible text and check for hidden H1s
            let h1Text = '';
            let h1IsHidden = false;
            let h1VisibleCount = 0;
            h1Els.forEach(el => {
                const style = window.getComputedStyle(el);
                const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.hasAttribute('hidden');
                if (!isHidden) {
                    h1VisibleCount++;
                    if (!h1Text) h1Text = el.textContent.trim();
                } else {
                    h1IsHidden = true;
                }
            });
            const h1Length = h1Text.length;
            const GENERIC_H1 = ['welcome', 'home', 'hello', 'untitled', 'page', 'index', 'main', 'default', 'test', 'new page', 'coming soon'];
            const h1IsGeneric = h1Text.length > 0 && GENERIC_H1.some(g => h1Text.toLowerCase().trim() === g);
            const h1IsTooShort = h1Text.length > 0 && h1Text.length < 10;
            const h1IsTooLong  = h1Text.length > 70;
            const h2Count = document.querySelectorAll('h2').length;
            const h3Count = document.querySelectorAll('h3').length;
            const listItemCount = document.querySelectorAll('li').length;
            
            // Paragraphs avg length
            const paragraphs = Array.from(document.querySelectorAll('p'));
            const avgParagraphLength = paragraphs.length > 0
                ? paragraphs.map(p => p.textContent.trim().split(/\s+/).length).reduce((a, b) => a + b, 0) / paragraphs.length
                : 0;
            
            // Meta
            const metaTitle = (document.querySelector('title') || {}).textContent || '';
            const metaTitleLength = metaTitle.length;
            const metaDescEl = document.querySelector('meta[name="description"]');
            const metaDescription = metaDescEl ? metaDescEl.getAttribute('content') || '' : '';
            const metaDescriptionLength = metaDescription.length;
            const hasMetaViewport = !!document.querySelector('meta[name="viewport"]');
            const hasCanonical = !!document.querySelector('link[rel="canonical"]');
            
            // Social
            const hasOpenGraph = !!document.querySelector('meta[property="og:title"]');
            const hasTwitterCard = !!document.querySelector('meta[name="twitter:card"]');
            
            // Schema — handles @type string, @type array, @graph arrays
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
                    if (Array.isArray(data)) {
                        data.forEach(item => { checkSchemaType(item['@type']); });
                    } else {
                        checkSchemaType(data['@type']);
                        if (Array.isArray(data['@graph'])) {
                            data['@graph'].forEach(item => { checkSchemaType(item['@type']); });
                        }
                    }
                } catch (e) {}
            });
            
            // FAQ content
            const hasFAQContent = Array.from(document.querySelectorAll('h2, h3, h4')).some(h =>
                h.textContent.toLowerCase().includes('faq') ||
                h.textContent.toLowerCase().includes('frequently asked') ||
                h.textContent.toLowerCase().includes('common question')
            );
            
            // Images
            const images = document.querySelectorAll('img');
            const imagesWithAlt = Array.from(images).filter(img => img.hasAttribute('alt') && img.getAttribute('alt').trim().length > 5).length;
            
            // Links
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
            
            // Expert Quotes — blockquote+cite AND testimonial CSS classes
            let expertQuoteCount = 0;
            document.querySelectorAll('blockquote').forEach(bq => {
                const cite = bq.querySelector('cite');
                if (bq.textContent.trim().length > 30 && cite && cite.textContent.trim().length > 3) expertQuoteCount++;
            });
            const testimonialSelectors = ['.review', '.testimonial', '[class*="review"]', '[class*="testimonial"]', '[class*="quote"]'];
            testimonialSelectors.forEach(sel => {
                try {
                    document.querySelectorAll(sel).forEach(el => {
                        if (el.textContent.trim().length > 40) expertQuoteCount++;
                    });
                } catch (e) {}
            });
            
            // Case Studies — must contain % or €/$ with a section keyword, and be a focused element
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
            
            // Statistics — numbers with %, currency, or large round figures
            const statsPattern = /\d+%|\$[\d,.]+|€[\d,.]+|\d{1,3}(,\d{3})+|\d+x\s/g;
            const statsFound = (cleanText.match(statsPattern) || []).length;
            
            // Direct Answer Box detection
            const first300Words = cleanText.split(/\s+/).slice(0, 300).join(' ');
            const hasDirectAnswer = /\d/.test(first300Words) && first300Words.length > 150;
            
            // TL;DR / Key Takeaways detection
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
            
            // Table of Contents
            const hasTOC = /table of contents|on this page|jump to section|contents/i.test(rawHtml) ||
                !!document.querySelector('[class*="toc"], [id*="toc"], [class*="table-of-contents"]');
            
            // Author Bio
            const hasAuthorBio = (
                !!document.querySelector('[class*="author"], [class*="bio"], .vcard, [rel="author"]') ||
                /about the author|written by/i.test(rawHtml)
            ) && /years of experience|certified|specializ|founder|director|ceo/i.test(rawHtml);
            
            return {
                wordCount, h1Count, h1Text, h1Length, h1IsHidden, h1VisibleCount, h1IsGeneric, h1IsTooShort, h1IsTooLong, h2Count, h3Count, listItemCount, avgParagraphLength,
                metaTitleLength, metaDescriptionLength, hasMetaViewport, hasCanonical,
                hasOpenGraph, hasTwitterCard,
                hasArticleSchema, hasFAQPageSchema, hasOrganizationSchema,
                hasFAQContent, images: images.length, imagesWithAlt,
                internalLinks, externalLinks, expertQuoteCount, caseStudyCount,
                statsFound, hasDirectAnswer, hasTLDR, hasTOC, hasAuthorBio
            };
        }, scanUrl);
        
        // Extract emails from page HTML (mailto: links + regex)
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

        // ⚠️ FIX: Close page ONLY after evaluation is complete
        await page.close();
        
        // ============================================
        // 📊 SCORING — GRAAF 50 + CRAFT 30 + TECH 20
        // ============================================
        // --- GRAAF FRAMEWORK (50 Points) ---
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
        
        // --- CRAFT FRAMEWORK (30 Points) ---
        let craftScore = 0;
        // H1 scoring: only award full points for 1 visible, non-generic, real H1
        if (analysis.h1VisibleCount === 1 && !analysis.h1IsGeneric && !analysis.h1IsTooShort) craftScore += 8;
        else if (analysis.h1VisibleCount === 1) craftScore += 3; // exists but weak
        else if (analysis.h1VisibleCount > 1)   craftScore += 2; // multiple
        
        if (analysis.h2Count >= 5)          craftScore += 7;
        else if (analysis.h2Count >= 3)     craftScore += 5;
        else if (analysis.h2Count >= 1)     craftScore += 2;
        
        if (analysis.avgParagraphLength <= 60)       craftScore += 5;
        else if (analysis.avgParagraphLength <= 100) craftScore += 3;
        
        if (analysis.hasFAQContent)         craftScore += 5;
        if (analysis.hasTOC)                craftScore += 3;
        if (analysis.hasAuthorBio)          craftScore += 2;
        
        craftScore = Math.min(30, craftScore);
        
        // --- TECHNICAL SEO (20 Points) ---
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
        const quality = totalScore >= 95 ? 'elite' :
            totalScore >= 90 ? 'excellent' :
            totalScore >= 80 ? 'very good' :
            totalScore >= 70 ? 'good' :
            totalScore >= 60 ? 'average' : 'needs improvement';
        
        // ============================================
        // 📋 RECOMMENDATIONS — 34 checks
        // ============================================
        const recommendations = [];
        
        if (analysis.wordCount < 500) {
            recommendations.push({ title: '🚨 Critical: Content Is Too Thin', description: `Only ${analysis.wordCount} words found. This is well below what Google considers a substantive page.`, priority: 'high', action: 'Expand with deep explanations, examples, case studies, and FAQs. Aim for 2,500+ words.', learning: "Thin content (< 500 words) is the #1 trigger for Google Helpful Content penalties. Pages with 2,500+ words earn 3.7x more backlinks on average (Backlinko).", target: 'Minimum 1,500 words; ideal 2,500+' });
        } else if (analysis.wordCount < 1500) {
            recommendations.push({ title: '📝 Increase Content Depth', description: `${analysis.wordCount} words found — decent start, but below the threshold for competitive rankings.`, priority: 'medium', action: "Add a FAQ section (5–8 questions), a 'How it works' breakdown, or real client examples.", learning: "Pages ranking on page 1 average 1,890 words. Google's QRG rewards 'comprehensive, accurate, clearly written' content.", target: '1,500+ words minimum; 2,500+ for competitive terms' });
        } else if (analysis.wordCount < 2500) {
            recommendations.push({ title: '📊 Content Length: Good But Not Elite', description: `${analysis.wordCount} words is solid. 400–800 more strategic words pushes you from Good to Elite tier.`, priority: 'low', action: "Add a case study with before/after metrics, an expert quote section, or a 'Key Takeaways' summary.", learning: "Long-form content earns 77% more backlinks than short content. It satisfies Google's comprehensiveness signal.", target: '2,500+ words for GRAAF Elite tier' });
        }
        
        if (analysis.statsFound < 3) {
            recommendations.push({ title: '📈 Add Data & Statistics', description: `Only ${analysis.statsFound} measurable data points found. Google rewards content built on real evidence.`, priority: 'high', action: "Add 8+ statistics from 2023–2025 sources. Format: 'X% of [group] report [outcome] ([Source Name, Year])'.", learning: "Data-backed content earns 3x more backlinks. Statistics signal the Accuracy pillar of GRAAF.", target: '8+ cited statistics from reputable 2023–2025 sources' });
        } else if (analysis.statsFound < 8) {
            recommendations.push({ title: '📈 Strengthen Your Evidence Base', description: `Found ${analysis.statsFound} data points. Reaching 8+ unlocks the full GRAAF statistics score.`, priority: 'medium', action: "Add recent statistics (2023–2025) with full attribution.", learning: "Pages with 8+ cited statistics rank 47% higher for informational queries.", target: '8+ cited statistics with source and year' });
        }
        
        if (analysis.expertQuoteCount === 0) {
            recommendations.push({ title: '💬 Add Expert Quotes & Credibility Signals', description: 'No expert quotes, attributed testimonials, or blockquote credibility signals detected.', priority: 'high', action: "Add 3–5 quotes from named experts. Format: \"Quote text\" — [Name, Title, Organization].", learning: "Google's E-E-A-T explicitly rewards content that cites credible outside sources. Pages with 3+ expert citations outrank those without by 52%.", target: '3–5 attributed expert quotes using blockquote + cite HTML' });
        } else if (analysis.expertQuoteCount < 3) {
            recommendations.push({ title: '💬 Add More Expert Citations', description: `Found ${analysis.expertQuoteCount} credibility signal(s). 2 more would unlock the full GRAAF credibility score.`, priority: 'medium', action: "Add quotes from industry publications or recognized professionals.", learning: "Expert citations are the fastest way to improve your GRAAF Authoritativeness score.", target: '3–5 attributed expert quotes' });
        }
        
        if (analysis.caseStudyCount === 0) {
            recommendations.push({ title: '📊 Add Case Studies With Real Metrics', description: "No case studies with measurable results detected. This is the most powerful E-E-A-T signal — first-hand Experience.", priority: 'high', action: "Add a 'Challenge / Solution / Results' section with real percentages or numbers.", learning: "The first 'E' in E-E-A-T is Experience. Case studies with real metrics are the most direct proof.", target: '2 case studies with Challenge/Solution/Results format and measurable metrics' });
        } else if (analysis.caseStudyCount < 2) {
            recommendations.push({ title: '📊 Add a Second Case Study', description: `Found ${analysis.caseStudyCount} case study section. A second would maximize your GRAAF case study score.`, priority: 'medium', action: "Add another real-world example with before/after metrics.", learning: "Two diverse case studies signal consistent, repeatable results.", target: '2 case studies with quantifiable results' });
        }
        
        if (!analysis.hasDirectAnswer) {
            recommendations.push({ title: '🎯 Add a Direct Answer Box', description: 'No concise direct answer detected in the first 150 words. Google uses this for Featured Snippets and AI Overviews.', priority: 'high', action: "Write a 40–80 word paragraph immediately after your H1 that directly answers the main question.", learning: "Pages with a clear direct answer in the first 150 words are 4.5x more likely to appear in Google AI Overviews.", target: '40–80 word direct answer paragraph within first 150 words' });
        }
        
        if (!analysis.hasTLDR) {
            recommendations.push({ title: '📌 Add a TL;DR / Key Takeaways Section', description: "No 'Key Takeaways' or 'Quick Summary' section detected. This is one of the fastest wins for AI Overview inclusion.", priority: 'medium', action: "Add a 'Key Takeaways' section near the top with 5 bullet points.", learning: "Bullet-formatted summaries are heavily favored by Google's AI for snippet extraction.", target: '5 bullet takeaways with specific stats near the top of the page' });
        }
        
        if (analysis.listItemCount < 5) {
            recommendations.push({ title: '📋 Improve Scannability With Lists', description: `Only ${analysis.listItemCount} list items found. Content without lists is harder to scan.`, priority: 'medium', action: "Convert key points into bulleted or numbered lists. Aim for 15+ list items.", learning: "79% of users scan web content. Lists increase chances of featured snippet selection.", target: '15+ list items spread naturally through the content' });
        } else if (analysis.listItemCount < 15) {
            recommendations.push({ title: '📋 Add More Structured Lists', description: `${analysis.listItemCount} list items found. Reaching 15+ improves both scannability and GRAAF scoring.`, priority: 'low', action: "Look for sections with 3+ parallel ideas and convert them to bullet lists.", learning: "Structured lists signal scannable, user-friendly content.", target: '15+ list items' });
        }
        
        // ── H1 checks — 5 distinct failure modes ──
        if (analysis.h1Count === 0) {
            recommendations.push({ title: '🚨 Critical: No H1 Heading Found', description: 'No H1 tag detected. This is one of the most impactful on-page SEO issues you can fix.', priority: 'high', action: "Add exactly one H1 tag near the top of the page containing your primary keyword.", learning: "The H1 is Google's strongest on-page keyword signal. Without it, Google has to guess what your page is about — and it often guesses wrong.", target: 'Exactly 1 H1 tag with primary keyword in the first 30 characters' });
        } else if (analysis.h1IsHidden && analysis.h1VisibleCount === 0) {
            recommendations.push({ title: '🚨 Critical: H1 Is Hidden (display:none / visibility:hidden)', description: `An H1 exists in the HTML but is hidden with CSS. Google sees through this — it counts as no real H1.`, priority: 'high', action: "Remove the CSS hiding your H1. Make it visible. If you are hiding it for design reasons, rethink the design.", learning: "Hidden H1s are sometimes used as an SEO trick. Google ignores hidden content for ranking signals.", target: '1 fully visible H1 containing primary keyword' });
        } else if (analysis.h1VisibleCount > 1) {
            recommendations.push({ title: '⚠️ Multiple H1 Tags Detected', description: `Found ${analysis.h1VisibleCount} visible H1 tags. This dilutes your topical signal and confuses Google.`, priority: 'medium', action: "Keep only one H1. Demote the rest to H2 or H3.", learning: "Multiple H1s tell Google your page has multiple main topics — it then ranks you for none of them well.", target: 'Exactly 1 H1 tag per page' });
        } else if (analysis.h1IsGeneric) {
            recommendations.push({ title: '⚠️ H1 Is Too Generic — Add a Real Keyword', description: `Your H1 "${analysis.h1Text}" contains no specific keyword. Generic H1s waste the strongest on-page signal.`, priority: 'high', action: "Replace your H1 with a specific keyword phrase. Example: 'SEO Content Scanner for Dutch Businesses' not 'Welcome'.", learning: "Generic H1s like 'Home' or 'Welcome' provide zero keyword signal to Google. Your H1 should be your page's value proposition.", target: 'H1 with primary keyword + specific value in 30–70 characters' });
        } else if (analysis.h1IsTooShort) {
            recommendations.push({ title: '⚠️ H1 Too Short — Expand With Keywords', description: `Your H1 "${analysis.h1Text}" is only ${analysis.h1Length} characters. This is too thin to carry a keyword signal.`, priority: 'medium', action: "Expand your H1 to 30–70 characters. Include your primary keyword and a qualifier (year, location, benefit).", learning: "H1s under 10 characters provide minimal keyword signal. The sweet spot is 30–70 characters.", target: 'H1 of 30–70 characters with primary keyword' });
        } else if (analysis.h1IsTooLong) {
            recommendations.push({ title: '📝 H1 Too Long — Trim for Clarity', description: `Your H1 is ${analysis.h1Length} characters. Long H1s dilute keyword focus and look spammy.`, priority: 'low', action: "Trim your H1 to 70 characters or fewer. Move secondary information to your subtitle (H2) or intro paragraph.", learning: "H1s over 70 characters reduce keyword density and can trigger spam filters in quality reviews.", target: 'H1 under 70 characters' });
        }
        
        if (analysis.h2Count < 3) {
            recommendations.push({ title: '📑 Add More Section Headings (H2s)', description: `Only ${analysis.h2Count} H2 headings found. Poor heading structure reduces crawlability.`, priority: 'medium', action: "Structure your content with 5+ H2 headings. Each major topic gets its own H2.", learning: "H2s are crawlability signals. Content with 5+ H2s ranks 23% higher for secondary keywords.", target: '5+ H2 headings with keyword-rich, descriptive text' });
        }
        
        if (analysis.avgParagraphLength > 100) {
            recommendations.push({ title: '📱 Shorten Paragraphs for Mobile Readability', description: `Average paragraph length is ${Math.round(analysis.avgParagraphLength)} words. Long paragraphs kill mobile engagement.`, priority: 'medium', action: "Break paragraphs at 50–80 words maximum. One idea per paragraph.", learning: "Paragraphs over 100 words increase mobile abandonment by 37%.", target: 'Average paragraph length 40–80 words' });
        }
        
        if (!analysis.hasFAQContent) {
            recommendations.push({ title: '❓ Add a FAQ Section', description: "No FAQ section detected. FAQs are powerful for capturing 'People Also Ask' rankings.", priority: 'medium', action: "Add an FAQ section with 5–10 real questions your audience asks.", learning: "'People Also Ask' boxes now appear in 80% of Google searches.", target: "FAQ section titled 'Frequently Asked Questions' with 5–10 Q&A pairs" });
        }
        
        if (!analysis.hasTOC) {
            recommendations.push({ title: '📑 Add a Table of Contents', description: 'No Table of Contents detected. A TOC improves crawlability and user experience.', priority: 'low', action: "Add a 'Table of Contents' section after your intro with anchor links to each H2.", learning: "Pages with a TOC are more likely to receive sitelinks in Google search results.", target: 'Table of Contents with anchor links to all H2 sections' });
        }
        
        if (!analysis.hasAuthorBio) {
            recommendations.push({ title: '✍️ Add an Author Bio', description: 'No author bio detected. Google explicitly evaluates author expertise.', priority: 'medium', action: "Add a 200–250 word author bio with credentials, certifications, and achievements.", learning: "E-E-A-T's first 'E' is Experience. Google's quality raters look for evidence of real credentials.", target: '200–250 word author bio with credentials and measurable achievements' });
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
            recommendations.push({ title: '🔗 Add a Canonical Tag', description: 'No canonical tag detected. Without it, Google may index multiple versions as duplicates.', priority: 'medium', action: "Add <link rel=\"canonical\" href=\"...\"> to your <head>.", learning: "Canonical tags prevent duplicate content penalties and concentrate ranking signals.", target: 'Self-referencing canonical tag in <head>' });
        }
        
        if (analysis.metaTitleLength === 0) {
            recommendations.push({ title: '🏷️ Critical: Missing Meta Title', description: 'No title tag found. This is a critical SEO issue.', priority: 'high', action: "Add a <title> tag with 50–60 characters containing your primary keyword.", learning: "The title tag is Google's #1 on-page SEO signal.", target: '50–60 character title tag with primary keyword in first 30 characters' });
        } else if (analysis.metaTitleLength < 40) {
            recommendations.push({ title: '🏷️ Meta Title Too Short', description: `Title is ${analysis.metaTitleLength} characters. You have unused SERP real estate.`, priority: 'low', action: "Expand to 50–60 characters. Add a year or benefit phrase.", learning: "Title tags of 50–60 characters maximize click-through rate.", target: '50–60 characters' });
        } else if (analysis.metaTitleLength > 65) {
            recommendations.push({ title: '🏷️ Meta Title Too Long — Will Be Truncated', description: `Title is ${analysis.metaTitleLength} characters. Google truncates at ~60–65 characters.`, priority: 'low', action: "Trim to 50–60 characters. Move the primary keyword to the front.", learning: "Truncated titles appear incomplete in search results.", target: '50–60 characters' });
        }
        
        if (analysis.metaDescriptionLength === 0) {
            recommendations.push({ title: '📝 Missing Meta Description', description: 'No meta description found. Google will auto-generate one — usually poorly.', priority: 'medium', action: "Add a <meta name=\"description\"> with 140–160 characters including a CTA.", learning: "Meta descriptions are your search result ad copy. Compelling descriptions increase clicks by 5–20%.", target: '140–160 character meta description with keyword + CTA' });
        } else if (analysis.metaDescriptionLength < 100) {
            recommendations.push({ title: '📝 Meta Description Too Short', description: `Description is ${analysis.metaDescriptionLength} characters. You have unused SERP space.`, priority: 'low', action: "Expand to 140–160 characters. Add a benefit statement.", learning: "Longer, compelling meta descriptions consistently outperform short ones.", target: '140–160 characters with keyword + CTA' });
        } else if (analysis.metaDescriptionLength > 165) {
            recommendations.push({ title: '📝 Meta Description Too Long', description: `Description is ${analysis.metaDescriptionLength} characters. Google truncates after ~160 characters.`, priority: 'low', action: "Trim to 140–160 characters. Put the most important information first.", learning: "Truncated descriptions end mid-sentence in search results.", target: '140–160 characters' });
        }
        
        if (analysis.images === 0) {
            recommendations.push({ title: '🖼️ Add Images to Your Content', description: 'No images detected. Images are critical for engagement and UX.', priority: 'medium', action: "Add at least 3–5 images with descriptive alt text.", learning: "Content with images gets 94% more views. Alt text is how Google reads images.", target: '3–5 images with descriptive alt text on every image' });
        } else if (analysis.imagesWithAlt < Math.min(analysis.images, 3)) {
            recommendations.push({ title: '🖼️ Add Alt Text to Your Images', description: `${analysis.images} images found but only ${analysis.imagesWithAlt} have alt text.`, priority: 'medium', action: "Add descriptive alt text to every image.", learning: "Alt text serves three purposes: Google understanding, accessibility, and keyword signals.", target: 'Alt text on 100% of images' });
        }
        
        if (analysis.internalLinks < 5) {
            recommendations.push({ title: '🔗 Add More Internal Links', description: `Only ${analysis.internalLinks} internal links found. Internal linking is underused.`, priority: 'medium', action: "Add 8–12 contextual internal links to related pages.", learning: "Internal links transfer link equity and help Google crawl faster.", target: '8–12 internal links with descriptive anchor text' });
        } else if (analysis.internalLinks < 8) {
            recommendations.push({ title: '🔗 Strengthen Internal Link Structure', description: `${analysis.internalLinks} internal links found — close to optimal.`, priority: 'low', action: "Find unlinked topic mentions and add contextual links.", learning: "Every internal link is a vote for the destination page.", target: '8–12 internal links' });
        }
        
        if (analysis.externalLinks === 0) {
            recommendations.push({ title: '🌐 Add Authoritative External Links', description: 'No external links found. Linking to high-quality sources is a direct E-E-A-T signal.', priority: 'low', action: "Link out to 3–5 authoritative sources (.gov, .edu, industry pubs).", learning: "Linking out to authoritative sites signals research depth and quality.", target: '3–5 outbound links to authoritative sources' });
        }
        
        if (!analysis.hasOpenGraph) {
            recommendations.push({ title: '📱 Add Open Graph Meta Tags', description: 'No Open Graph tags detected. Your page displays poorly when shared socially.', priority: 'low', action: "Add og:title, og:description, og:image (1200×630px), og:url to your <head>.", learning: "Open Graph tags control how your page appears when shared socially, driving referral traffic.", target: 'og:title, og:description, og:image (1200×630px), og:url' });
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
            success: true,
            url: scanUrl,
            score: totalScore,
            quality: quality,
            metrics: {
                graaf: graafScore,
                craft: craftScore,
                technical: technicalScore
            },
            content_stats: {
                wordCount: analysis.wordCount,
                emails_found: extractedEmails,
                extractedEmail: extractedEmails[0] || null,
                h1Count: analysis.h1Count,
                h1Text: analysis.h1Text,
                h1Length: analysis.h1Length,
                h1VisibleCount: analysis.h1VisibleCount,
                h1IsGeneric: analysis.h1IsGeneric,
                h1IsTooShort: analysis.h1IsTooShort,
                h1IsTooLong: analysis.h1IsTooLong,
                h2Count: analysis.h2Count,
                h3Count: analysis.h3Count,
                listItemCount: analysis.listItemCount,
                avgParagraphLength: Math.round(analysis.avgParagraphLength),
                metaTitleLength: analysis.metaTitleLength,
                metaDescriptionLength: analysis.metaDescriptionLength,
                hasMetaViewport: analysis.hasMetaViewport,
                hasCanonical: analysis.hasCanonical,
                hasArticleSchema: analysis.hasArticleSchema,
                hasFAQPageSchema: analysis.hasFAQPageSchema,
                hasOrganizationSchema: analysis.hasOrganizationSchema,
                hasOpenGraph: analysis.hasOpenGraph,
                hasTwitterCard: analysis.hasTwitterCard,
                hasDirectAnswer: analysis.hasDirectAnswer,
                hasTLDR: analysis.hasTLDR,
                hasTOC: analysis.hasTOC,
                hasAuthorBio: analysis.hasAuthorBio,
                hasFAQContent: analysis.hasFAQContent,
                images: analysis.images,
                imagesWithAlt: analysis.imagesWithAlt,
                internalLinks: analysis.internalLinks,
                externalLinks: analysis.externalLinks,
                expertQuoteCount: analysis.expertQuoteCount,
                caseStudyCount: analysis.caseStudyCount,
                statsFound: analysis.statsFound
            },
            recommendations: {
                all: finalRecommendations,
                count: finalRecommendations.length
            },
            timestamp: new Date().toISOString()
        };
        console.log(`✅ Scan: ${scanUrl} → ${totalScore}/100 (${quality}) — ${finalRecommendations.length} recommendations`);
        res.json(result);
    } catch (error) {
        console.error('❌ Scan error:', error.message);
        res.status(500).json({ success: false, error: 'Scan failed', details: error.message });
    }
});

// Routes
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin-dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// ── Apify proxy routes (avoids CORS from browser) ──────────────────────────
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
        // Apify dataset items endpoint — works via run ID directly
        const r = await fetch(`${APIFY_BASE}/actor-runs/${req.params.runId}/dataset/items?format=json&clean=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await r.json();
        res.status(r.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// ───────────────────────────────────────────────────────────────────────────

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
    res.json({ status: 'running', database: db, puppeteer: browserInstance ? 'ready' : 'not started', version: 'elite-v4-fixed', sendgrid: process.env.SENDGRID_API_KEY ? 'configured' : 'not configured', counts: { leaderboardTotal, leaderboardApproved, freelancerTotal } });
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

async function startServer() {
    console.log('\n🚀 =====================================');
    console.log('🚀  CONTENTSCALE ELITE SERVER v4 (FIXED)');
    console.log('🚀  DB Migration: country VARCHAR(100)');
    console.log('🚀  Bulk Delete Routes Added');
    console.log('🚀  34 Recommendation Checks');
    console.log('🚀  GRAAF 50 + CRAFT 30 + Technical 20');
    console.log('🚀  SendGrid: Server env var (no user setup needed)');
    console.log('🚀 =====================================\n');
    const dbConnected = await waitForDatabase();
    app.listen(PORT, () => {
        console.log(`📍 Server: http://localhost:${PORT}`);
        console.log(`📊 DB:     ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`📧 Email:  ${process.env.SENDGRID_API_KEY ? '✅ SendGrid ready' : '❌ SENDGRID_API_KEY not set'}`);
        console.log('\n✅ Elite scanner ready\n');
    });
}
startServer();
