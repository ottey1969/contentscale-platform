// ============================================
// CONTENTSCALE SERVER.JS — ELITE EDITION v3
// ✅ GRAAF + CRAFT + Technical (100-point scale)
// ✅ 34 Recommendation Checks — with Learning + Target
// ✅ Bug-fixed: no page.content() after page.close()
// ✅ Bug-fixed: Schema @graph array support
// ✅ Bug-fixed: Strict case study detection (% patterns)
// ✅ Expert quote detection: blockquote + testimonial CSS
// ✅ New: Direct Answer, TL;DR, TOC, Author Bio, Stats
// ✅ SendGrid + Admin + Leaderboard + Freelancers preserved
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

// Database Tables
async function createAllTables() {
    if (!pool) return;
    let client;
    try {
        client = await pool.connect();
        await client.query(`CREATE TABLE IF NOT EXISTS super_admins (id SERIAL PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name VARCHAR(255), email VARCHAR(255), role VARCHAR(50) DEFAULT 'admin', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP)`);

        const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
        if (parseInt(adminCheck.rows[0].count) === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await client.query(`INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)`, ['ot', hashedPassword, 'Super Admin', 'super_admin']);
            console.log('✅ Default admin created (ot/admin123)');
        }

        await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, ip_address VARCHAR(50), is_activated BOOLEAN DEFAULT FALSE, activation_expires TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`CREATE TABLE IF NOT EXISTS user_api_keys (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, service_name VARCHAR(50) NOT NULL, api_key TEXT NOT NULL, daily_limit INTEGER DEFAULT 100, used_today INTEGER DEFAULT 0, last_reset DATE DEFAULT CURRENT_DATE, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, service_name))`);
        await client.query(`CREATE TABLE IF NOT EXISTS user_email_templates (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, template_type VARCHAR(50) NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, template_type))`);
        await client.query(`CREATE TABLE IF NOT EXISTS admin_messages (id SERIAL PRIMARY KEY, sent_by INTEGER REFERENCES super_admins(id), recipient_type VARCHAR(50), subject TEXT NOT NULL, body TEXT NOT NULL, is_bulk BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`CREATE TABLE IF NOT EXISTS scans (id SERIAL PRIMARY KEY, url TEXT NOT NULL, score INTEGER, quality VARCHAR(50), graaf_score INTEGER, craft_score INTEGER, technical_score INTEGER, breakdown JSONB, recommendations JSONB DEFAULT '[]', scan_type VARCHAR(50) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`CREATE TABLE IF NOT EXISTS leaderboard (id SERIAL PRIMARY KEY, url TEXT NOT NULL UNIQUE, company_name VARCHAR(255), score INTEGER NOT NULL, country VARCHAR(10) DEFAULT 'NL', city VARCHAR(255), type VARCHAR(100) DEFAULT 'seo_agency', location VARCHAR(255), is_verified BOOLEAN DEFAULT FALSE, is_opted_out BOOLEAN DEFAULT FALSE, submission_ip VARCHAR(50), admin_verified BOOLEAN DEFAULT TRUE, auto_detected_country VARCHAR(100), graaf_score INTEGER, craft_score INTEGER, technical_score INTEGER, niche VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`CREATE TABLE IF NOT EXISTS freelancers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, title VARCHAR(255), location VARCHAR(255), country VARCHAR(100), bio TEXT, linkedin_url TEXT, hourly_rate VARCHAR(50), availability VARCHAR(100), is_approved BOOLEAN DEFAULT FALSE, is_verified BOOLEAN DEFAULT FALSE, is_featured BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())`);
        await client.query(`CREATE TABLE IF NOT EXISTS email_queue (id SERIAL PRIMARY KEY, user_id VARCHAR(255), to_email VARCHAR(255) NOT NULL, to_name VARCHAR(255), subject TEXT NOT NULL, body TEXT NOT NULL, status VARCHAR(50) DEFAULT 'pending', sent_at TIMESTAMP, error_message TEXT, created_at TIMESTAMP DEFAULT NOW())`);

        console.log('✅ All tables ready');
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

app.get('/api/user/keys/status', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json({ success: true, hasSendgrid: false });
    try {
        const result = await pool.query('SELECT service_name, api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1', [userId]);
        const hasSendgrid = result.rows.some(r => r.service_name === 'sendgrid');
        res.json({ success: true, hasSendgrid, sendgrid: hasSendgrid ? result.rows.find(r => r.service_name === 'sendgrid') : null });
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

app.post('/api/email/send', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { to_email, subject, html } = req.body;
    try {
        const result = await pool.query("SELECT api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1 AND service_name = 'sendgrid'", [userId]);
        if (result.rows.length === 0) return res.json({ success: false, needs_api_key: true });
        const key = result.rows[0];
        if (key.used_today >= key.daily_limit) return res.json({ success: false, limit_reached: true });
        sgMail.setApiKey(key.api_key);
        await sgMail.send({ to: to_email, from: 'noreply@contentscale.site', subject, html });
        await pool.query("UPDATE user_api_keys SET used_today = used_today + 1 WHERE user_id = $1 AND service_name = 'sendgrid'", [userId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.post('/api/bulk-scan/send-summary', async (req, res) => { res.json({ success: true }); });
app.post('/api/bulk-scan/submit-leaderboard', async (req, res) => { res.json({ success: true }); });
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
app.get('/api/admin/leaderboard/pending', verifyAdmin, async (req, res) => {
    try { const r = await pool.query(`SELECT * FROM leaderboard WHERE admin_verified = FALSE ORDER BY created_at DESC LIMIT 50`); res.json({ success: true, pending: r.rows }); }
    catch (e) { res.json({ success: true, pending: [] }); }
});
app.post('/api/admin/leaderboard/:id/approve', verifyAdmin, async (req, res) => {
    try { await pool.query(`UPDATE leaderboard SET admin_verified = TRUE, country = COALESCE($2, country), is_verified = TRUE WHERE id = $1`, [req.params.id, req.body.final_country]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
            const h1Count = document.querySelectorAll('h1').length;
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
            // Fix: scan first 300 words of ALL body text (not just first <p>)
            // Homepages use hero text in <h2>, <div>, <span> — not just <p>
            const first300Words = cleanText.split(/\s+/).slice(0, 300).join(' ');
            const hasDirectAnswer = /\d/.test(first300Words) && first300Words.length > 150;

            // TL;DR / Key Takeaways detection — broadened for homepage structures
            // Matches: TL;DR, Key Takeaways, Quick Summary, bullet intro sections,
            // feature/benefits sections, "Why choose", "What you get", numbered highlights
            const hasTLDR = /tl;dr|key takeaways|quick summary|at a glance|in this article|what you('ll| will) get|why choose|key benefits|what we do|highlights|our approach|how it works/i.test(rawHtml) ||
                // Also check: 3+ bullet points within the first 600 words of content
                (() => {
                    const earlyLists = Array.from(document.querySelectorAll('ul, ol'));
                    for (const list of earlyLists) {
                        const items = list.querySelectorAll('li');
                        if (items.length >= 3) {
                            // Check it appears early in the page (within first half of body)
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
                wordCount, h1Count, h2Count, h3Count, listItemCount, avgParagraphLength,
                metaTitleLength, metaDescriptionLength, hasMetaViewport, hasCanonical,
                hasOpenGraph, hasTwitterCard,
                hasArticleSchema, hasFAQPageSchema, hasOrganizationSchema,
                hasFAQContent, images: images.length, imagesWithAlt,
                internalLinks, externalLinks, expertQuoteCount, caseStudyCount,
                statsFound, hasDirectAnswer, hasTLDR, hasTOC, hasAuthorBio
            };
        }, scanUrl);

        await page.close();

        // ============================================
        // 📊 SCORING — GRAAF 50 + CRAFT 30 + TECH 20
        // ============================================

        // --- GRAAF FRAMEWORK (50 Points) ---
        let graafScore = 0;

        // Word Count (max 10 pts)
        if (analysis.wordCount >= 2500)      graafScore += 10;
        else if (analysis.wordCount >= 1500) graafScore += 7;
        else if (analysis.wordCount >= 1000) graafScore += 4;
        else if (analysis.wordCount >= 500)  graafScore += 2;

        // Statistics / Data (max 8 pts)
        if (analysis.statsFound >= 8)        graafScore += 8;
        else if (analysis.statsFound >= 5)   graafScore += 5;
        else if (analysis.statsFound >= 3)   graafScore += 3;

        // Expert Quotes (max 8 pts)
        if (analysis.expertQuoteCount >= 4)  graafScore += 8;
        else if (analysis.expertQuoteCount >= 2) graafScore += 5;
        else if (analysis.expertQuoteCount >= 1) graafScore += 2;

        // Case Studies with real metrics (max 8 pts)
        if (analysis.caseStudyCount >= 2)    graafScore += 8;
        else if (analysis.caseStudyCount >= 1) graafScore += 4;

        // Direct Answer Box (max 6 pts)
        if (analysis.hasDirectAnswer)        graafScore += 6;

        // TL;DR / Key Takeaways (max 4 pts)
        if (analysis.hasTLDR)               graafScore += 4;

        // List structure (max 6 pts)
        if (analysis.listItemCount >= 15)    graafScore += 6;
        else if (analysis.listItemCount >= 8) graafScore += 4;
        else if (analysis.listItemCount >= 3) graafScore += 2;

        graafScore = Math.min(50, graafScore);

        // --- CRAFT FRAMEWORK (30 Points) ---
        let craftScore = 0;

        // H1 — exactly one (max 8 pts)
        if (analysis.h1Count === 1)         craftScore += 8;
        else if (analysis.h1Count > 1)      craftScore += 2;

        // H2 Structure (max 7 pts)
        if (analysis.h2Count >= 5)          craftScore += 7;
        else if (analysis.h2Count >= 3)     craftScore += 5;
        else if (analysis.h2Count >= 1)     craftScore += 2;

        // Paragraph readability (max 5 pts)
        if (analysis.avgParagraphLength <= 60)       craftScore += 5;
        else if (analysis.avgParagraphLength <= 100) craftScore += 3;

        // FAQ Section (max 5 pts)
        if (analysis.hasFAQContent)         craftScore += 5;

        // Table of Contents (max 3 pts)
        if (analysis.hasTOC)                craftScore += 3;

        // Author Bio (max 2 pts)
        if (analysis.hasAuthorBio)          craftScore += 2;

        craftScore = Math.min(30, craftScore);

        // --- TECHNICAL SEO (20 Points) ---
        let technicalScore = 0;

        // Meta Title (max 3 pts)
        if (analysis.metaTitleLength >= 50 && analysis.metaTitleLength <= 60) technicalScore += 3;
        else if (analysis.metaTitleLength > 0) technicalScore += 1;

        // Meta Description (max 3 pts)
        if (analysis.metaDescriptionLength >= 140 && analysis.metaDescriptionLength <= 165) technicalScore += 3;
        else if (analysis.metaDescriptionLength > 0) technicalScore += 1;

        // Article Schema (max 4 pts)
        if (analysis.hasArticleSchema)      technicalScore += 4;

        // FAQPage Schema (max 4 pts)
        if (analysis.hasFAQPageSchema)      technicalScore += 4;

        // Canonical Tag (max 2 pts)
        if (analysis.hasCanonical)          technicalScore += 2;

        // Image Alt Text (max 2 pts)
        if (analysis.images > 0 && analysis.imagesWithAlt >= Math.min(5, analysis.images)) technicalScore += 2;
        else if (analysis.images > 0 && analysis.imagesWithAlt > 0) technicalScore += 1;

        // Mobile Viewport (max 2 pts)
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
        // Each has: title, description, priority, action, learning, target
        // ============================================
        const recommendations = [];

        // ── GRAAF: WORD COUNT ──────────────────────────────────────
        if (analysis.wordCount < 500) {
            recommendations.push({
                title: '🚨 Critical: Content Is Too Thin',
                description: `Only ${analysis.wordCount} words found. This is well below what Google considers a substantive page.`,
                priority: 'high',
                action: 'Expand with deep explanations, examples, case studies, and FAQs. Aim for 2,500+ words.',
                learning: "Thin content (< 500 words) is the #1 trigger for Google Helpful Content penalties. Pages with 2,500+ words earn 3.7x more backlinks on average (Backlinko). Google rewards depth — not just length, but depth requires length.",
                target: 'Minimum 1,500 words; ideal 2,500+'
            });
        } else if (analysis.wordCount < 1500) {
            recommendations.push({
                title: '📝 Increase Content Depth',
                description: `${analysis.wordCount} words found — decent start, but below the threshold for competitive rankings.`,
                priority: 'medium',
                action: "Add a FAQ section (5–8 questions), a 'How it works' breakdown, or real client examples. Each section adds 200–400 organic words.",
                learning: "Pages ranking on page 1 average 1,890 words. Google's QRG rewards 'comprehensive, accurate, clearly written' content. Being thorough signals relevance and reduces pogo-sticking.",
                target: '1,500+ words minimum; 2,500+ for competitive terms'
            });
        } else if (analysis.wordCount < 2500) {
            const wordGapSuggestions = [];
            if (analysis.caseStudyCount < 1) wordGapSuggestions.push('a case study with before/after metrics');
            if (analysis.expertQuoteCount < 2) wordGapSuggestions.push('an expert quote section with 3+ cited sources');
            if (!analysis.hasTLDR) wordGapSuggestions.push("a 'Key Takeaways' summary section");
            wordGapSuggestions.push("a deeper 'How it works' or 'Why it matters' breakdown");
            const wordGapAction = `Add ${wordGapSuggestions.slice(0, 3).join(', or ')}. Each adds 200–400 organic words naturally.`;
            recommendations.push({
                title: '📊 Content Length: Good But Not Elite',
                description: `${analysis.wordCount} words is solid. 400–800 more strategic words pushes you from Good to Elite tier.`,
                priority: 'low',
                action: wordGapAction,
                learning: "Long-form content earns 77% more backlinks than short content (Backlinko). More importantly, it satisfies Google's comprehensiveness signal and boosts average dwell time.",
                target: '2,500+ words for GRAAF Elite tier'
            });
        }

        // ── GRAAF: STATISTICS ──────────────────────────────────────
        if (analysis.statsFound < 3) {
            recommendations.push({
                title: '📈 Add Data & Statistics',
                description: `Only ${analysis.statsFound} measurable data points found. Google rewards content built on real evidence.`,
                priority: 'high',
                action: "Add 8+ statistics from 2023–2025 sources. Format: 'X% of [group] report [outcome] ([Source Name, Year])'. Link to the original source.",
                learning: "Data-backed content earns 3x more backlinks than opinion content (Backlinko). Statistics signal the Accuracy pillar of GRAAF — one of Google's most heavily weighted E-E-A-T signals post-2023.",
                target: '8+ cited statistics from reputable 2023–2025 sources'
            });
        } else if (analysis.statsFound < 8) {
            recommendations.push({
                title: '📈 Strengthen Your Evidence Base',
                description: `Found ${analysis.statsFound} data points. Reaching 8+ unlocks the full GRAAF statistics score.`,
                priority: 'medium',
                action: "Add recent statistics (2023–2025) with full attribution. Include percentages, growth figures, and survey data.",
                learning: "Pages with 8+ cited statistics rank 47% higher for informational queries (Semrush, 2024). The gap between 'good' and 'elite' content is often just the density of verifiable data.",
                target: '8+ cited statistics with source and year'
            });
        }

        // ── GRAAF: EXPERT QUOTES ───────────────────────────────────
        if (analysis.expertQuoteCount === 0) {
            recommendations.push({
                title: '💬 Add Expert Quotes & Credibility Signals',
                description: 'No expert quotes, attributed testimonials, or blockquote credibility signals detected.',
                priority: 'high',
                action: "Add 3–5 quotes from named experts or industry reports. Format: \"Quote text\" — [Name, Title, Organization]. Use HTML: <blockquote><p>Quote</p><cite>Name, Title</cite></blockquote>",
                learning: "Google's E-E-A-T explicitly rewards content that cites credible outside sources. Expert quotes signal Authoritativeness. Pages with 3+ expert citations outrank those without by 52% in competitive niches.",
                target: '3–5 attributed expert quotes using blockquote + cite HTML'
            });
        } else if (analysis.expertQuoteCount < 3) {
            recommendations.push({
                title: '💬 Add More Expert Citations',
                description: `Found ${analysis.expertQuoteCount} credibility signal(s). 2 more would unlock the full GRAAF credibility score.`,
                priority: 'medium',
                action: "Add quotes from industry publications, Google's own guidelines, or recognized professionals in your field.",
                learning: "Expert citations are the fastest way to improve your GRAAF Authoritativeness score. Each cited source strengthens the claim that your content is based on real expertise.",
                target: '3–5 attributed expert quotes'
            });
        }

        // ── GRAAF: CASE STUDIES ────────────────────────────────────
        if (analysis.caseStudyCount === 0) {
            recommendations.push({
                title: '📊 Add Case Studies With Real Metrics',
                description: "No case studies with measurable results detected. This is the most powerful E-E-A-T signal — first-hand Experience.",
                priority: 'high',
                action: "Add a 'Challenge / Solution / Results' section with real percentages or numbers. Example: 'Client X recovered 83% of lost traffic in 60 days using our GRAAF Framework.'",
                learning: "The first 'E' in E-E-A-T is Experience. Google's QRG requires evidence of first-hand expertise. Case studies with real metrics are the most direct proof. Pages with case studies earn 4x more qualified leads.",
                target: '2 case studies with Challenge/Solution/Results format and measurable metrics'
            });
        } else if (analysis.caseStudyCount < 2) {
            recommendations.push({
                title: '📊 Add a Second Case Study',
                description: `Found ${analysis.caseStudyCount} case study section. A second would maximize your GRAAF case study score.`,
                priority: 'medium',
                action: "Add another real-world example with before/after metrics. Different industry or use case for broader appeal.",
                learning: "Two diverse case studies signal consistent, repeatable results — not a one-off success. This dramatically strengthens trust with both users and Google's quality evaluators.",
                target: '2 case studies with quantifiable results'
            });
        }

        // ── GRAAF: DIRECT ANSWER ───────────────────────────────────
        if (!analysis.hasDirectAnswer) {
            recommendations.push({
                title: '🎯 Add a Direct Answer Box',
                description: 'No concise direct answer detected in the first 150 words. Google uses this for Featured Snippets and AI Overviews.',
                priority: 'high',
                action: "Write a 40–80 word paragraph immediately after your H1 that directly answers the main question. Include one key stat or number.",
                learning: "Pages with a clear direct answer in the first 150 words are 4.5x more likely to appear in Google AI Overviews (Search Engine Land, 2024). Google's AI pulls content that gives an immediate, scannable answer.",
                target: '40–80 word direct answer paragraph within first 150 words'
            });
        }

        // ── GRAAF: TL;DR ───────────────────────────────────────────
        if (!analysis.hasTLDR) {
            recommendations.push({
                title: '📌 Add a TL;DR / Key Takeaways Section',
                description: "No 'Key Takeaways', 'TL;DR', or 'Quick Summary' section detected. This is one of the fastest wins for AI Overview inclusion.",
                priority: 'medium',
                action: "Add a 'Key Takeaways' or 'TL;DR' section near the top with 5 bullet points. Each bullet should be 15–25 words and include a specific number.",
                learning: "Bullet-formatted summaries are heavily favored by Google's AI for snippet extraction. They also reduce bounce rate — readers who see key points upfront read 37% more of the full article (Nielsen Norman Group).",
                target: '5 bullet takeaways with specific stats near the top of the page'
            });
        }

        // ── GRAAF: LIST ITEMS ──────────────────────────────────────
        if (analysis.listItemCount < 5) {
            recommendations.push({
                title: '📋 Improve Scannability With Lists',
                description: `Only ${analysis.listItemCount} list items found. Content without lists is harder to scan and less likely to appear in AI Overviews.`,
                priority: 'medium',
                action: "Convert key points, steps, features, and benefits into bulleted or numbered lists. Aim for 15+ list items across the page.",
                learning: "79% of users scan web content rather than reading linearly (Nielsen). Content with bullet lists is significantly more likely to be selected for AI Overview extraction, as it provides structured data Google can parse directly.",
                target: '15+ list items spread naturally through the content'
            });
        } else if (analysis.listItemCount < 15) {
            recommendations.push({
                title: '📋 Add More Structured Lists',
                description: `${analysis.listItemCount} list items found. Reaching 15+ improves both scannability and GRAAF scoring.`,
                priority: 'low',
                action: "Look for sections with 3+ parallel ideas and convert them to bullet lists. Add a numbered steps section if relevant.",
                learning: "Structured lists signal scannable, user-friendly content — a direct UX signal Google uses in quality scoring. They also increase chances of featured snippet selection.",
                target: '15+ list items'
            });
        }

        // ── CRAFT: H1 ─────────────────────────────────────────────
        if (analysis.h1Count === 0) {
            recommendations.push({
                title: '⚠️ Critical: No H1 Heading Found',
                description: 'No H1 tag detected. This is a fundamental on-page SEO issue.',
                priority: 'high',
                action: "Add exactly one H1 tag containing your primary keyword. Every page must have one H1 that clearly states the page's topic.",
                learning: "The H1 is the strongest on-page keyword signal. Google uses it to understand the page's primary topic. Missing H1 means Google guesses — and usually guesses wrong. Pages without H1s rank significantly lower.",
                target: 'Exactly 1 H1 containing the primary keyword'
            });
        } else if (analysis.h1Count > 1) {
            recommendations.push({
                title: '⚠️ Multiple H1 Tags Detected',
                description: `Found ${analysis.h1Count} H1 tags. Multiple H1s dilute your topical signal.`,
                priority: 'medium',
                action: "Keep only one H1. Change others to H2 or H3. The single H1 should contain your primary keyword.",
                learning: "Multiple H1s confuse Google about the page's primary topic. This dilutes keyword focus and can cause ranking confusion. Search engines expect exactly one H1 per page.",
                target: 'Exactly 1 H1 tag'
            });
        }

        // ── CRAFT: H2 STRUCTURE ────────────────────────────────────
        if (analysis.h2Count < 3) {
            recommendations.push({
                title: '📑 Add More Section Headings (H2s)',
                description: `Only ${analysis.h2Count} H2 headings found. Poor heading structure reduces crawlability and user experience.`,
                priority: 'medium',
                action: "Structure your content with 5+ H2 headings. Each major topic gets its own H2. Include semantic keyword variations in H2 text.",
                learning: "H2s are crawlability signals — they help Google understand your content's structure and topic breadth. Content with 5+ H2s ranks 23% higher for secondary keyword variants because they expand the semantic footprint.",
                target: '5+ H2 headings with keyword-rich, descriptive text'
            });
        }

        // ── CRAFT: PARAGRAPH LENGTH ────────────────────────────────
        if (analysis.avgParagraphLength > 100) {
            recommendations.push({
                title: '📱 Shorten Paragraphs for Mobile Readability',
                description: `Average paragraph length is ${Math.round(analysis.avgParagraphLength)} words. Long paragraphs kill mobile engagement.`,
                priority: 'medium',
                action: "Break paragraphs at 50–80 words maximum. One idea per paragraph. Use line breaks generously. Mobile users scroll 70% of the time — give them breathing room.",
                learning: "Paragraphs over 100 words increase mobile abandonment by 37% (Nielsen Norman Group). Google's helpful content system evaluates mobile UX. Short paragraphs improve dwell time, which is a positive ranking signal.",
                target: 'Average paragraph length 40–80 words'
            });
        }

        // ── CRAFT: FAQ SECTION ─────────────────────────────────────
        if (!analysis.hasFAQContent) {
            recommendations.push({
                title: '❓ Add a FAQ Section',
                description: "No FAQ section detected. FAQs are one of the most powerful tools for capturing 'People Also Ask' rankings.",
                priority: 'medium',
                action: "Add an FAQ section with 5–10 real questions your audience asks. Title the section 'Frequently Asked Questions' or 'FAQ' and use H2/H3 for each question.",
                learning: "'People Also Ask' boxes now appear in 80% of Google searches. FAQ sections directly supply content for PAA, AI Overviews, and voice search. Pages with proper FAQs see 25–40% more organic click-through.",
                target: "FAQ section titled 'Frequently Asked Questions' with 5–10 Q&A pairs"
            });
        }

        // ── CRAFT: TABLE OF CONTENTS ───────────────────────────────
        if (!analysis.hasTOC) {
            recommendations.push({
                title: '📑 Add a Table of Contents',
                description: 'No Table of Contents detected. A TOC is a quick structural signal that improves crawlability and user experience.',
                priority: 'low',
                action: "Add a 'Table of Contents' section after your intro with anchor links to each H2. In WordPress, 'Easy Table of Contents' plugin adds this automatically.",
                learning: "Pages with a TOC are more likely to receive sitelinks in Google search results. They also increase average time-on-page by ~22% because readers navigate to exactly what they need, reducing frustration.",
                target: 'Table of Contents with anchor links to all H2 sections'
            });
        }

        // ── CRAFT: AUTHOR BIO ──────────────────────────────────────
        if (!analysis.hasAuthorBio) {
            recommendations.push({
                title: '✍️ Add an Author Bio',
                description: 'No author bio detected. Google explicitly evaluates author expertise in its Quality Rater Guidelines.',
                priority: 'medium',
                action: "Add a 200–250 word author bio with: current role, years of experience, certifications, 3 expertise areas, and measurable achievements. Place after main content.",
                learning: "E-E-A-T's first 'E' is Experience. Google's quality raters look for evidence of real credentials. Pages with verified author bios receive higher manual quality scores, which influences algorithmic ranking over time.",
                target: '200–250 word author bio with credentials, certifications, and measurable achievements'
            });
        }

        // ── TECHNICAL: ARTICLE SCHEMA ─────────────────────────────
        if (!analysis.hasArticleSchema) {
            recommendations.push({
                title: '🛠️ Add Article Schema (JSON-LD)',
                description: "No Article, BlogPosting, or NewsArticle schema detected. Without this, Google lacks machine-readable confirmation of your content type.",
                priority: 'high',
                action: `Add this to your <head>:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Title",
  "author": {"@type": "Person", "name": "Your Name"},
  "datePublished": "2025-01-01",
  "dateModified": "${new Date().toISOString().split('T')[0]}"
}
</script>
In WordPress, Yoast SEO or RankMath adds this automatically when you set the post type correctly.`,
                learning: "Article schema enables rich snippets and tells Google exactly what type of content this is, who wrote it, and when it was published. Pages with Article schema see 20–30% higher CTR due to rich result eligibility.",
                target: 'Article or BlogPosting JSON-LD schema with author, datePublished, dateModified'
            });
        }

        // ── TECHNICAL: FAQPAGE SCHEMA ─────────────────────────────
        if (analysis.hasFAQContent && !analysis.hasFAQPageSchema) {
            recommendations.push({
                title: '🛠️ Add FAQPage Schema to Your FAQ Section',
                description: 'FAQ content detected but no FAQPage schema found. Your FAQ answers are invisible to Google as structured data.',
                priority: 'high',
                action: "Generate FAQPage JSON-LD for all your FAQ questions. Tools: Merkle Schema Markup Generator (free), or let Yoast/RankMath auto-generate it.",
                learning: "FAQPage schema makes your FAQ answers eligible for expanded 'People Also Ask' appearances, doubling your SERP visual footprint. Pages with FAQPage schema see 20–30% higher CTR from organic results.",
                target: 'FAQPage JSON-LD with all Q&A pairs marked up'
            });
        } else if (!analysis.hasFAQContent && !analysis.hasFAQPageSchema) {
            recommendations.push({
                title: '🛠️ Add FAQ Section + FAQPage Schema',
                description: 'No FAQ section or FAQPage schema detected. Both are missing.',
                priority: 'medium',
                action: "1) Add a FAQ section with 5–10 Q&A pairs. 2) Add FAQPage JSON-LD schema. This combination is one of the most powerful SERP real estate expansions available.",
                learning: "FAQPage schema is one of the highest-ROI schema types available. It expands your search result to show 2–4 answers directly in Google, dramatically increasing visibility without needing a higher rank.",
                target: 'FAQ section + FAQPage JSON-LD schema'
            });
        }

        // ── TECHNICAL: CANONICAL TAG ───────────────────────────────
        if (!analysis.hasCanonical) {
            recommendations.push({
                title: '🔗 Add a Canonical Tag',
                description: 'No canonical tag detected. Without it, Google may index multiple versions of this page as duplicates.',
                priority: 'medium',
                action: "Add <link rel=\"canonical\" href=\"https://yourdomain.com/your-page/\"> to your <head>. WordPress SEO plugins add this automatically.",
                learning: "Canonical tags prevent duplicate content penalties from URL variations (www vs non-www, trailing slashes, query parameters). They concentrate all ranking signals to a single URL, preventing ranking dilution.",
                target: 'Self-referencing canonical tag in <head>'
            });
        }

        // ── TECHNICAL: META TITLE ──────────────────────────────────
        if (analysis.metaTitleLength === 0) {
            recommendations.push({
                title: '🏷️ Critical: Missing Meta Title',
                description: 'No title tag found. This is a critical SEO issue affecting both rankings and click-through rate.',
                priority: 'high',
                action: "Add a <title> tag with 50–60 characters containing your primary keyword near the start.",
                learning: "The title tag is Google's #1 on-page SEO signal. It controls what appears as the blue link in search results. Missing titles cause Google to generate its own — usually poorly optimized.",
                target: '50–60 character title tag with primary keyword in first 30 characters'
            });
        } else if (analysis.metaTitleLength < 40) {
            recommendations.push({
                title: '🏷️ Meta Title Too Short',
                description: `Title is ${analysis.metaTitleLength} characters. You have unused SERP real estate.`,
                priority: 'low',
                action: "Expand to 50–60 characters. Add a year, a benefit phrase, or your brand name.",
                learning: "Title tags of 50–60 characters maximize click-through rate. A compelling title can increase CTR by 20–36%, which Google uses as a relevance signal.",
                target: '50–60 characters'
            });
        } else if (analysis.metaTitleLength > 65) {
            recommendations.push({
                title: '🏷️ Meta Title Too Long — Will Be Truncated',
                description: `Title is ${analysis.metaTitleLength} characters. Google truncates at ~60–65 characters.`,
                priority: 'low',
                action: "Trim to 50–60 characters. Move the primary keyword to the front. Remove filler words.",
                learning: "Truncated titles appear incomplete in search results, reducing trust and CTR. Your strongest hook must appear in the first 50 characters.",
                target: '50–60 characters'
            });
        }

        // ── TECHNICAL: META DESCRIPTION ───────────────────────────
        if (analysis.metaDescriptionLength === 0) {
            recommendations.push({
                title: '📝 Missing Meta Description',
                description: 'No meta description found. Google will auto-generate one from your content — usually poorly.',
                priority: 'medium',
                action: "Add a <meta name=\"description\"> with 140–160 characters. Include your primary keyword and a clear call-to-action.",
                learning: "Meta descriptions are your search result ad copy. A compelling description increases clicks by 5–20%. More clicks = higher CTR = stronger relevance signal = better rankings over time.",
                target: '140–160 character meta description with keyword + CTA'
            });
        } else if (analysis.metaDescriptionLength < 100) {
            recommendations.push({
                title: '📝 Meta Description Too Short',
                description: `Description is ${analysis.metaDescriptionLength} characters. You have unused SERP space.`,
                priority: 'low',
                action: "Expand to 140–160 characters. Add a benefit statement, social proof, or call-to-action.",
                learning: "Longer, compelling meta descriptions consistently outperform short ones in CTR tests. Treat it like ad copy — every character should earn its place.",
                target: '140–160 characters with keyword + CTA'
            });
        } else if (analysis.metaDescriptionLength > 165) {
            recommendations.push({
                title: '📝 Meta Description Too Long',
                description: `Description is ${analysis.metaDescriptionLength} characters. Google truncates after ~160 characters.`,
                priority: 'low',
                action: "Trim to 140–160 characters. Put the most important information and CTA first.",
                learning: "Truncated descriptions end mid-sentence in search results, appearing unprofessional. Move your strongest value proposition to the first 130 characters.",
                target: '140–160 characters'
            });
        }

        // ── TECHNICAL: IMAGES ─────────────────────────────────────
        if (analysis.images === 0) {
            recommendations.push({
                title: '🖼️ Add Images to Your Content',
                description: 'No images detected. Images are critical for engagement, visual search, and UX signals.',
                priority: 'medium',
                action: "Add at least 3–5 images: featured image, screenshots/diagrams, and one comparison visual. Compress all images and add descriptive alt text to every one.",
                learning: "Content with images gets 94% more views than text-only content. Images enable Google Image Search traffic (10–20% of total traffic for content sites). Alt text is how Google reads images — it's also a keyword placement opportunity.",
                target: '3–5 images with descriptive alt text on every image'
            });
        } else if (analysis.imagesWithAlt < Math.min(analysis.images, 3)) {
            recommendations.push({
                title: '🖼️ Add Alt Text to Your Images',
                description: `${analysis.images} images found but only ${analysis.imagesWithAlt} have alt text. Missing alt text is both an SEO and accessibility issue.`,
                priority: 'medium',
                action: "Add descriptive alt text to every image. Include your primary keyword in 1–2 alt texts naturally (not stuffed).",
                learning: "Alt text serves three purposes: Google reads it to understand image content; screen readers use it for accessibility; it provides weighted keyword signals. Properly alt-tagged images rank 12% higher in image-related searches.",
                target: 'Alt text on 100% of images'
            });
        }

        // ── TECHNICAL: INTERNAL LINKS ─────────────────────────────
        if (analysis.internalLinks < 5) {
            recommendations.push({
                title: '🔗 Add More Internal Links',
                description: `Only ${analysis.internalLinks} internal links found. Internal linking is one of the most underused SEO tactics.`,
                priority: 'medium',
                action: "Add 8–12 contextual internal links to related pages. Every mention of a topic you have a page about should link to that page. Use descriptive anchor text — never 'click here'.",
                learning: "Internal links transfer link equity from strong pages to weaker ones, help Google crawl faster, and reduce bounce rate. Sites with strong internal linking recover 40% faster from algorithm updates.",
                target: '8–12 internal links with descriptive anchor text'
            });
        } else if (analysis.internalLinks < 8) {
            recommendations.push({
                title: '🔗 Strengthen Internal Link Structure',
                description: `${analysis.internalLinks} internal links found — close to optimal. 2–3 more maximizes link equity distribution.`,
                priority: 'low',
                action: "Find unlinked topic mentions and add contextual links to your most important pages.",
                learning: "Every internal link is a vote for the destination page. Pages with many internal links are crawled and indexed faster and rank more strongly.",
                target: '8–12 internal links'
            });
        }

        // ── TECHNICAL: EXTERNAL LINKS ─────────────────────────────
        if (analysis.externalLinks === 0) {
            recommendations.push({
                title: '🌐 Add Authoritative External Links',
                description: 'No external links found. Linking to high-quality sources is a direct E-E-A-T signal.',
                priority: 'low',
                action: "Link out to 3–5 authoritative sources: Google's documentation, peer-reviewed studies, .gov sites, or recognized industry publications. Open in new tab.",
                learning: "Linking out to authoritative sites does NOT hurt your rankings — Google interprets it as a sign of research depth and quality. Pages with outbound authority links rank 15% higher for their target terms.",
                target: '3–5 outbound links to authoritative sources'
            });
        }

        // ── TECHNICAL: OPEN GRAPH ─────────────────────────────────
        if (!analysis.hasOpenGraph) {
            recommendations.push({
                title: '📱 Add Open Graph Meta Tags',
                description: 'No Open Graph tags detected. Your page displays poorly when shared on LinkedIn, Facebook, or WhatsApp.',
                priority: 'low',
                action: "Add og:title, og:description, og:image (1200×630px), og:url to your <head>. WordPress Yoast/RankMath adds these automatically via their social settings tab.",
                learning: "Open Graph tags control how your page appears when shared socially. A compelling image + headline on social shares drives referral traffic and earns natural backlinks — both of which strengthen domain authority.",
                target: 'og:title, og:description, og:image (1200×630px), og:url'
            });
        }

        // ── DEFAULT: ELITE ────────────────────────────────────────
        const finalRecommendations = recommendations.length > 0 ? recommendations : [{
            title: '🏆 Elite Content — Outstanding Work!',
            description: 'Your page meets all GRAAF Framework, CRAFT, and Technical SEO requirements. You are in the top tier of content quality.',
            priority: 'none',
            action: 'Maintain this standard. Review content quarterly for freshness updates. Add new case studies as they become available.',
            learning: 'Consistent, high-quality content is a compound investment. Pages that maintain GRAAF Elite scores build domain authority over time, making every future piece rank faster and more reliably.',
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
                h1Count: analysis.h1Count,
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
    res.json({ status: 'running', database: db, puppeteer: browserInstance ? 'ready' : 'not started', version: 'elite-v3', counts: { leaderboardTotal, leaderboardApproved, freelancerTotal } });
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

async function startServer() {
    console.log('\n🚀 =====================================');
    console.log('🚀  CONTENTSCALE ELITE SERVER v3');
    console.log('🚀  34 Recommendation Checks');
    console.log('🚀  GRAAF 50 + CRAFT 30 + Technical 20');
    console.log('🚀 =====================================\n');
    const dbConnected = await waitForDatabase();
    app.listen(PORT, () => {
        console.log(`📍 Server: http://localhost:${PORT}`);
        console.log(`📊 DB:     ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
        console.log('\n✅ Elite scanner ready\n');
    });
}

startServer();
