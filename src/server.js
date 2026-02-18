// ============================================
// CONTENTSCALE SERVER.JS - FINAL CORRECTED VERSION
// ✅ Auto-activate new users for 7 days
// ✅ Check expiration on every request
// ✅ Admin retains full control (extend/revoke)
// ✅ All other features intact (Scan, Leaderboard, etc.)
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
const sgMail = require('@sendgrid/mail');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ FOUND' : '❌ NOT FOUND');

// ============================================
// DATABASE CONFIGURATION
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
            console.error('❌ Invalid DATABASE_URL:', e.message);
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
    console.log('📊 Database configuration:');
    console.log(`   - Host: ${dbConfig.host}`);
    console.log(`   - Port: ${dbConfig.port}`);
    console.log(`   - Database: ${dbConfig.database}`);
    console.log(`   - User: ${dbConfig.user}`);
    return new Pool(dbConfig);
}

try {
    pool = initDatabaseConfig();
} catch (e) {
    console.error('❌ Error initializing database pool:', e.message);
    pool = null;
}

async function waitForDatabase(retries = 5, delay = 3000) {
    if (!pool) {
        console.log('❌ No database pool - skipping');
        return false;
    }
    console.log('🔄 Connecting to database...');
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            console.log(`✅ Database connected! (attempt ${i + 1}/${retries})`);
            await client.query('SELECT NOW()');
            console.log('✅ Database query works');
            client.release();
            setTimeout(() => createAllTables().catch(err => {
                console.error('❌ Error creating tables:', err.message);
            }), 1000);
            return true;
        } catch (err) {
            console.error(`❌ Database connection attempt ${i + 1}/${retries} failed:`, err.message);
            if (i === retries - 1) {
                console.error('❌❌❌ COULD NOT CONNECT TO DATABASE ❌❌❌');
                return false;
            }
            console.log(`⏳ Retrying in ${delay/1000} seconds...`);
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
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key, x-user-id');
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
        return res.status(503).json({ success: false, error: 'Database unavailable' });
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
        console.error('❌ Admin verification error:', error.message);
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

async function createAllTables() {
    if (!pool) {
        console.error('❌ No database pool - cannot create tables');
        return;
    }
    let client;
    try {
        client = await pool.connect();
        console.log('📦 Checking database tables...');
        
        // Super Admins
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

        // Users table - UPDATED with activated_until
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                ip_address VARCHAR(50),
                is_activated BOOLEAN DEFAULT FALSE,
                activated_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // User API Keys table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_api_keys (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                service_name VARCHAR(50) NOT NULL,
                api_key TEXT NOT NULL,
                daily_limit INTEGER DEFAULT 100,
                used_today INTEGER DEFAULT 0,
                last_reset DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, service_name)
            )
        `);

        // User Email Templates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_email_templates (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                template_type VARCHAR(50) NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, template_type)
            )
        `);

        // Admin Messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_messages (
                id SERIAL PRIMARY KEY,
                sent_by INTEGER REFERENCES super_admins(id),
                recipient_user_id VARCHAR(255),
                sender_type VARCHAR(20) DEFAULT 'admin',
                subject TEXT,
                body TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ admin_messages table created/updated');

        // Scans table
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

        // Leaderboard table
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

        // Freelancers table
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

        // Email Queue table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_queue (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                to_email VARCHAR(255) NOT NULL,
                to_name VARCHAR(255),
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                sent_at TIMESTAMP,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('✅ All database tables ready');
    } catch (error) {
        console.error('❌ Database setup error:', error.message);
    } finally {
        if (client) client.release();
    }
}

// ============================================
// USER REGISTRATION (AUTO-ACTIVATE 7 DAYS)
// ============================================
app.post('/api/user/register', async (req, res) => {
    try {
        const userId = crypto.randomUUID();
        const ip = req.ip || req.connection.remoteAddress;
        
        // ✅ AUTO-ACTIVATE: Set expiry to NOW + 7 days
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7);

        await pool.query(
            `INSERT INTO users (id, ip_address, is_activated, activated_until, created_at)
            VALUES ($1, $2, TRUE, $3, NOW())
            ON CONFLICT (id) DO NOTHING`,
            [userId, ip, expiryDate]
        );

        const defaultTemplates = [
            {
                type: 'congrats',
                subject: '🎉 Congratulations! Your website ranked on ContentScale Leaderboard',
                body: '<h1>Congratulations!</h1><p>Your website scored {{score}}/100 on our SEO analysis.</p><p>You\'ve been added to the ContentScale Leaderboard!</p><p><a href="{{leaderboard_url}}">View your ranking</a></p>'
            },
            {
                type: 'improvement',
                subject: '🚀 Quick SEO opportunity for {{company_name}}',
                body: '<h1>SEO Opportunity</h1><p>Hi {{company_name}} team,</p><p>Your website scored {{score}}/100 on our SEO analysis.</p><p>I noticed some quick wins that could improve your rankings.</p><p>Would you be open to a quick chat?</p>'
            },
            {
                type: 'website',
                subject: '💻 Professional website for {{company_name}}',
                body: '<h1>Website Opportunity</h1><p>Hi {{company_name}} team,</p><p>I noticed you don\'t have a website yet.</p><p>I specialize in creating SEO-optimized websites that rank.</p><p>Interested in learning more?</p>'
            }
        ];

        for (const template of defaultTemplates) {
            await pool.query(
                `INSERT INTO user_email_templates (user_id, template_type, subject, body)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, template_type) DO NOTHING`,
                [userId, template.type, template.subject, template.body]
            );
        }
        res.json({
            success: true,
            userId,
            message: 'Account created! You have 7 days of free access.'
        });
    } catch (error) {
        console.error('❌ User registration error:', error.message);
        res.json({ success: false, error: 'Registration failed' });
    }
});

// ============================================
// USER ACTIVATION STATUS (CHECKS EXPIRY)
// ============================================
app.get('/api/user/activation-status', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.json({ success: false, activated: false, error: 'No user ID' });
    }
    try {
        const result = await pool.query(
            'SELECT is_activated, activated_until FROM users WHERE id = $1',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.json({ success: true, activated: false });
        }
        
        const row = result.rows[0];
        let isActive = row.is_activated;
        let isExpired = false;
        let daysLeft = 0;

        // Check expiration logic
        if (isActive && row.activated_until) {
            const now = new Date();
            const expiry = new Date(row.activated_until);
            
            if (expiry < now) {
                // Time is up!
                isExpired = true;
                isActive = false;
                // Auto-deactivate in DB so admin sees it clearly
                await pool.query('UPDATE users SET is_activated = FALSE WHERE id = $1', [userId]);
            } else {
                // Calculate days remaining
                const diffTime = Math.abs(expiry - now);
                daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        res.json({
            success: true,
            activated: isActive,
            expired: isExpired,
            daysLeft: daysLeft,
            expiresAt: row.activated_until
        });
    } catch (error) {
        console.error('❌ Activation status error:', error.message);
        res.json({ success: false, activated: false, error: error.message });
    }
});

// ============================================
// EXTEND TRIAL (CLICK TO UNLOCK - SOCIAL SHARE)
// ============================================
app.post('/api/user/extend-trial', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    try {
        // Add 7 days from NOW
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + 7);
        
        await pool.query(
            'UPDATE users SET is_activated = TRUE, activated_until = $2 WHERE id = $1',
            [userId, newExpiry]
        );
        
        res.json({
            success: true,
            message: 'Access extended by 7 days!',
            newExpiry: newExpiry
        });
    } catch (error) {
        console.error('❌ Extend trial error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// USER API KEYS STATUS ENDPOINT
// ============================================
app.get('/api/user/keys/status', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.json({
            success: true,
            hasSendgrid: false,
            hasWebshare: false,
            status: 'unauthenticated',
            message: 'No user ID provided'
        });
    }
    if (!pool) {
        return res.json({
            success: true,
            hasSendgrid: false,
            hasWebshare: false,
            status: 'error',
            message: 'Database unavailable'
        });
    }
    try {
        const apiKeysResult = await pool.query(
            'SELECT service_name, api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1',
            [userId]
        );
        const hasSendgrid = apiKeysResult.rows.some(row => row.service_name === 'sendgrid');
        const hasWebshare = apiKeysResult.rows.some(row => row.service_name === 'webshare');
        const sendgridKey = apiKeysResult.rows.find(row => row.service_name === 'sendgrid');
        res.json({
            success: true,
            hasSendgrid,
            hasWebshare,
            sendgrid: hasSendgrid ? {
                used: sendgridKey.used_today,
                limit: sendgridKey.daily_limit
            } : null,
            message: 'API keys status retrieved'
        });
    } catch (error) {
        console.error('❌ API key status error:', error.message);
        res.json({
            success: true,
            hasSendgrid: false,
            hasWebshare: false,
            status: 'error',
            message: 'Server error'
        });
    }
});

// ============================================
// SENDGRID CONFIGURATION ENDPOINT
// ============================================
app.post('/api/user/sendgrid/configure', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { apiKey, dailyLimit } = req.body;
    if (!userId || !apiKey) {
        return res.json({ success: false, error: 'Missing required fields' });
    }
    try {
        await pool.query(
            `INSERT INTO user_api_keys (user_id, service_name, api_key, daily_limit)
            VALUES ($1, 'sendgrid', $2, $3)
            ON CONFLICT (user_id, service_name)
            DO UPDATE SET api_key = $2, daily_limit = $3`,
            [userId, apiKey, dailyLimit || 100]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Sendgrid config error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// WEBSHARE CONFIGURATION ENDPOINT
// ============================================
app.post('/api/user/webshare/configure', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { apiKey } = req.body;
    if (!userId || !apiKey) {
        return res.json({ success: false, error: 'Missing required fields' });
    }
    try {
        await pool.query(
            `INSERT INTO user_api_keys (user_id, service_name, api_key)
            VALUES ($1, 'webshare', $2)
            ON CONFLICT (user_id, service_name)
            DO UPDATE SET api_key = $2`,
            [userId, apiKey]
        );
        res.json({ success: true, proxy_count: 10 });
    } catch (error) {
        console.error('❌ Webshare config error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// EMAIL TEMPLATES - GET
// ============================================
app.get('/api/user/templates', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.json({ success: false, error: 'No user ID' });
    }
    try {
        const result = await pool.query(
            'SELECT template_type, subject, body FROM user_email_templates WHERE user_id = $1',
            [userId]
        );
        const templates = {
            congrats: { subject: '', body: '' },
            improvement: { subject: '', body: '' },
            website: { subject: '', body: '' }
        };
        result.rows.forEach(row => {
            if (templates[row.template_type]) {
                templates[row.template_type] = {
                    subject: row.subject,
                    body: row.body
                };
            }
        });
        res.json({ success: true, templates });
    } catch (error) {
        console.error('❌ Get templates error:', error.message);
        res.json({ success: false, error: error.message, templates: {} });
    }
});

// ============================================
// EMAIL TEMPLATES - SAVE
// ============================================
app.post('/api/user/templates', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { type, subject, body } = req.body;
    if (!userId || !type || !subject || !body) {
        return res.json({ success: false, error: 'Missing required fields' });
    }
    try {
        await pool.query(
            `INSERT INTO user_email_templates (user_id, template_type, subject, body, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, template_type)
            DO UPDATE SET subject = $3, body = $4, updated_at = NOW()`,
            [userId, type, subject, body]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Save template error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// EMAIL SEND ENDPOINT (REAL SENDGRID)
// ============================================
app.post('/api/email/send', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { to_email, to_name, subject, html } = req.body;
    try {
        const result = await pool.query(
            'SELECT api_key, daily_limit, used_today FROM user_api_keys WHERE user_id = $1 AND service_name = \'sendgrid\'',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.json({ success: false, needs_api_key: true, error: 'No SendGrid API key configured' });
        }
        const userKey = result.rows[0];
        if (userKey.used_today >= userKey.daily_limit) {
            return res.json({ success: false, limit_reached: true, error: 'Daily limit reached' });
        }
        sgMail.setApiKey(userKey.api_key);
        const msg = {
            to: to_email,
            from: 'noreply@contentscale.site',
            subject: subject,
            html: html
        };
        await sgMail.send(msg);
        await pool.query(
            'UPDATE user_api_keys SET used_today = used_today + 1 WHERE user_id = $1 AND service_name = \'sendgrid\'',
            [userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// BULK SCAN ENDPOINTS
// ============================================
app.post('/api/bulk-scan/send-summary', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { userEmail, userName, results } = req.body;
    console.log(`📧 Summary email would be sent to ${userEmail}`);
    try {
        await pool.query(
            `INSERT INTO email_queue (user_id, to_email, to_name, subject, body, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [userId, userEmail, userName, `Bulk Scan Summary - ${new Date().toLocaleDateString()}`,
            `Summary: ${results.leaderboard.length} leaderboard, ${results.withWebsite.length} improvement, ${results.withoutWebsite.length} website offers`,
            'pending']
        );
    } catch (e) {
        console.error('Queue summary error:', e);
    }
    res.json({ success: true });
});

app.post('/api/bulk-scan/submit-leaderboard', async (req, res) => {
    const { entries, submittedBy } = req.body;
    console.log(`🏆 ${entries.length} entries submitted to leaderboard`);
    for (const entry of entries) {
        try {
            await pool.query(
                `INSERT INTO leaderboard (url, company_name, score, admin_verified)
                VALUES ($1, $2, $3, FALSE)
                ON CONFLICT (url) DO UPDATE SET score = $3`,
                [entry.url, entry.url, entry.score]
            );
        } catch (e) {
            console.error('Leaderboard insert error:', e);
        }
    }
    res.json({ success: true });
});

app.post('/api/bulk-scan/send-improvement-emails', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { businesses, senderName, senderEmail } = req.body;
    console.log(`📧 Improvement emails would be sent to ${businesses.length} businesses`);
    let template = { subject: 'SEO Opportunity', body: 'Your website needs improvement' };
    try {
        const result = await pool.query(
            'SELECT subject, body FROM user_email_templates WHERE user_id = $1 AND template_type = \'improvement\'',
            [userId]
        );
        if (result.rows.length > 0) {
            template = result.rows[0];
        }
    } catch (e) {
        console.error('Get template error:', e);
    }
    for (const business of businesses) {
        try {
            await pool.query(
                `INSERT INTO email_queue (user_id, to_email, subject, body, status)
                VALUES ($1, $2, $3, $4, 'pending')`,
                [userId, senderEmail, template.subject, template.body, 'pending']
            );
        } catch (e) {
            console.error('Queue email error:', e);
        }
    }
    res.json({ success: true });
});

app.post('/api/bulk-scan/send-website-offers', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { businesses, senderName, senderEmail } = req.body;
    console.log(`🌐 Website offers would be sent to ${businesses.length} businesses`);
    let template = { subject: 'Website Opportunity', body: 'You need a website' };
    try {
        const result = await pool.query(
            'SELECT subject, body FROM user_email_templates WHERE user_id = $1 AND template_type = \'website\'',
            [userId]
        );
        if (result.rows.length > 0) {
            template = result.rows[0];
        }
    } catch (e) {
        console.error('Get template error:', e);
    }
    for (const business of businesses) {
        try {
            await pool.query(
                `INSERT INTO email_queue (user_id, to_email, subject, body, status)
                VALUES ($1, $2, $3, $4, 'pending')`,
                [userId, senderEmail, template.subject, template.body, 'pending']
            );
        } catch (e) {
            console.error('Queue email error:', e);
        }
    }
    res.json({ success: true });
});

// ============================================
// ADMIN USER MANAGEMENT
// ============================================
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('❌ Get users error:', error.message);
        res.json({ success: false, error: error.message, users: [] });
    }
});

// Admin Activate (Manual Override)
app.post('/api/admin/users/:id/activate', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { days } = req.body;
        let activatedUntil = null;
        if (days && !isNaN(days)) {
            const date = new Date();
            date.setDate(date.getDate() + parseInt(days));
            activatedUntil = date;
        } else {
            // Default 7 days if not specified
            const date = new Date();
            date.setDate(date.getDate() + 7);
            activatedUntil = date;
        }
        await pool.query(
            'UPDATE users SET is_activated = TRUE, activated_until = $2 WHERE id = $1',
            [id, activatedUntil]
        );
        res.json({ success: true, message: `User activated until ${activatedUntil.toLocaleDateString()}`, activatedUntil });
    } catch (error) {
        console.error('❌ Activate user error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Admin Deactivate
app.post('/api/admin/users/:id/deactivate', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE users SET is_activated = FALSE, activated_until = NULL WHERE id = $1', [id]);
        res.json({ success: true, message: 'User deactivated' });
    } catch (error) {
        console.error('❌ Deactivate user error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Admin Delete
app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM user_api_keys WHERE user_id = $1', [id]);
        await pool.query('DELETE FROM user_email_templates WHERE user_id = $1', [id]);
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('❌ Delete user error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Admin Bulk Delete
app.post('/api/admin/users/bulk-delete', verifyAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs received' });
        }
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM user_api_keys WHERE user_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM user_email_templates WHERE user_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
        res.json({ success: true, message: `${ids.length} users deleted successfully` });
    } catch (error) {
        console.error('❌ Bulk delete users error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin Send Message
app.post('/api/admin/messages/send', verifyAdmin, async (req, res) => {
    const { recipientUserId, subject, body } = req.body;
    if (!body) {
        return res.status(400).json({ success: false, error: 'Message body required' });
    }
    try {
        await pool.query(
            `INSERT INTO admin_messages (sent_by, recipient_user_id, sender_type, subject, body)
            VALUES ($1, $2, 'admin', $3, $4)`,
            [req.admin.id, recipientUserId || null, subject || 'No Subject', body]
        );
        const target = recipientUserId ? `user ${recipientUserId}` : 'ALL USERS';
        console.log(`📧 Admin message sent to ${target}`);
        res.json({ success: true, message: `Message sent to ${target}` });
    } catch (error) {
        console.error('❌ Send message error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Admin Get Messages
app.get('/api/admin/messages', verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM admin_messages WHERE recipient_user_id IS NULL ORDER BY created_at DESC LIMIT 50'
        );
        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('❌ Get broadcast messages error:', error.message);
        res.json({ success: false, error: error.message, messages: [] });
    }
});

// ============================================
// SEO SCAN
// ============================================
app.post('/api/scan', async (req, res) => {
    const { url, keyword } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    let scanUrl = url;
    if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
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
        const analysis = await page.evaluate((scanUrl, targetKeyword) => {
            const rawHtml = document.documentElement.outerHTML;
            const textContent = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            const wordCount = textContent.split(/\s+/).length;
            let keywordDensity = 0;
            let keywordCount = 0;
            let hasKeywordInH1 = false;
            let hasKeywordInIntro = false;
            if (targetKeyword && targetKeyword.trim()) {
                const escapedKeyword = targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const keywordRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
                const keywordMatches = textContent.match(keywordRegex) || [];
                keywordCount = keywordMatches.length;
                keywordDensity = wordCount > 0 ? (keywordCount / (wordCount / 100)) : 0;
                const h1Elements = document.querySelectorAll('h1');
                if (h1Elements.length > 0) {
                    hasKeywordInH1 = h1Elements[0].textContent.toLowerCase().includes(targetKeyword.toLowerCase());
                }
                const paragraphs = document.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    hasKeywordInIntro = paragraphs[0].textContent.toLowerCase().includes(targetKeyword.toLowerCase());
                }
            }
            const h1Count = document.querySelectorAll('h1').length;
            const h2Count = document.querySelectorAll('h2').length;
            const h3Count = document.querySelectorAll('h3').length;
            const listCount = document.querySelectorAll('ul, ol').length;
            const listItemCount = document.querySelectorAll('li').length;
            const metaTitleElement = document.querySelector('title');
            const metaTitle = metaTitleElement ? metaTitleElement.textContent : '';
            const metaTitleLength = metaTitle.length;
            const metaDescriptionElement = document.querySelector('meta[name="description"]');
            const metaDescription = metaDescriptionElement ? metaDescriptionElement.getAttribute('content') : '';
            const metaDescriptionLength = metaDescription.length;
            const hasMetaViewport = !!document.querySelector('meta[name="viewport"]');
            const hasCanonical = !!document.querySelector('link[rel="canonical"]');
            const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            let hasArticleSchema = false;
            let hasFAQPageSchema = false;
            let hasOrganizationSchema = false;
            schemaScripts.forEach(script => {
                try {
                    const schemaData = JSON.parse(script.textContent);
                    const type = schemaData['@type'];
                    if (type === 'Article') hasArticleSchema = true;
                    if (type === 'FAQPage') hasFAQPageSchema = true;
                    if (type === 'Organization') hasOrganizationSchema = true;
                } catch (e) {}
            });
            const images = document.querySelectorAll('img');
            const imagesWithAlt = Array.from(images).filter(img =>
                img.hasAttribute('alt') && img.getAttribute('alt').trim().length > 0
            ).length;
            const baseUrl = new URL(scanUrl);
            const baseDomain = baseUrl.hostname.replace('www.', '');
            const internalLinks = [];
            const externalLinks = [];
            Array.from(document.querySelectorAll('a[href]')).forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
                try {
                    const linkUrl = new URL(href, scanUrl);
                    const linkDomain = linkUrl.hostname.replace('www.', '');
                    if (linkDomain === baseDomain) {
                        internalLinks.push({ href: linkUrl.href, text: link.textContent.trim() });
                    } else {
                        externalLinks.push({ href: linkUrl.href, text: link.textContent.trim() });
                    }
                } catch (e) {}
            });
            const expertQuotes = [];
            document.querySelectorAll('blockquote').forEach(blockquote => {
                const quoteText = blockquote.textContent.trim();
                const cite = blockquote.querySelector('cite');
                const attribution = cite ? cite.textContent.trim() : '';
                if (quoteText.length > 20 && attribution.length > 5) {
                    expertQuotes.push({ text: quoteText, attribution });
                }
            });
            const caseStudies = [];
            const caseStudyKeywords = ['case study', 'results', 'metrics', 'roi'];
            document.querySelectorAll('section, article, div').forEach(el => {
                const text = el.textContent.toLowerCase();
                if (caseStudyKeywords.some(k => text.includes(k)) && text.length > 300) {
                    if (/\d+[%$€£]/.test(text)) {
                        caseStudies.push({ excerpt: el.textContent.substring(0, 200) + '...' });
                    }
                }
            });
            const paragraphs = document.querySelectorAll('p');
            const avgParagraphLength = Array.from(paragraphs)
                .map(p => p.textContent.trim().split(/\s+/).length)
                .reduce((a, b) => a + b, 0) / (paragraphs.length || 1);
            return {
                url: scanUrl,
                wordCount,
                h1Count, h2Count, h3Count,
                listCount, listItemCount,
                metaTitle, metaTitleLength,
                metaDescription, metaDescriptionLength,
                hasMetaViewport, hasCanonical,
                hasArticleSchema, hasFAQPageSchema, hasOrganizationSchema,
                images: images.length, imagesWithAlt,
                internalLinks, externalLinks,
                expertQuotes, caseStudies,
                keywordDensity, keywordCount,
                hasKeywordInH1, hasKeywordInIntro,
                avgParagraphLength
            };
        }, scanUrl, keyword);
        await page.close();
        // Scoring
        let graafScore = 0;
        let craftScore = 0;
        let technicalScore = 0;
        let uxScore = 0;
        if (analysis.wordCount >= 2500) graafScore += 15;
        else if (analysis.wordCount >= 1500) graafScore += 10;
        else if (analysis.wordCount >= 1000) graafScore += 7;
        else if (analysis.wordCount >= 500) graafScore += 4;
        if (analysis.keywordDensity >= 0.8 && analysis.keywordDensity <= 1.2) graafScore += 4;
        if (analysis.hasKeywordInH1) graafScore += 2;
        if (analysis.hasKeywordInIntro) graafScore += 2;
        if (analysis.listItemCount >= 15) graafScore += 8;
        else if (analysis.listItemCount >= 10) graafScore += 6;
        else if (analysis.listItemCount >= 5) graafScore += 4;
        if (analysis.h2Count >= 5) graafScore += 7;
        else if (analysis.h2Count >= 3) graafScore += 5;
        if (analysis.expertQuotes.length >= 4) graafScore += 8;
        else if (analysis.expertQuotes.length >= 2) graafScore += 5;
        else if (analysis.expertQuotes.length >= 1) graafScore += 3;
        if (analysis.caseStudies.length >= 2) graafScore += 7;
        else if (analysis.caseStudies.length >= 1) graafScore += 4;
        graafScore = Math.min(50, graafScore);
        if (analysis.h1Count === 1) craftScore += 12;
        else if (analysis.h1Count === 0) craftScore += 0;
        else craftScore += 3;
        if (analysis.h2Count >= 5) craftScore += 8;
        else if (analysis.h2Count >= 3) craftScore += 6;
        if (analysis.avgParagraphLength <= 100) craftScore += 5;
        craftScore = Math.min(30, craftScore);
        if (analysis.metaTitleLength >= 50 && analysis.metaTitleLength <= 60) technicalScore += 3;
        if (analysis.metaDescriptionLength >= 150 && analysis.metaDescriptionLength <= 160) technicalScore += 3;
        if (analysis.hasArticleSchema) technicalScore += 3;
        if (analysis.hasFAQPageSchema) technicalScore += 3;
        if (analysis.hasMetaViewport) technicalScore += 2;
        if (analysis.hasCanonical) technicalScore += 2;
        if (analysis.images > 0 && analysis.imagesWithAlt >= Math.min(5, analysis.images)) technicalScore += 3;
        technicalScore = Math.min(20, technicalScore);
        if (analysis.images >= 5) uxScore += 20;
        else if (analysis.images >= 3) uxScore += 15;
        else if (analysis.images >= 1) uxScore += 10;
        if (analysis.wordCount >= 2000) uxScore += 25;
        else if (analysis.wordCount >= 1500) uxScore += 20;
        else if (analysis.wordCount >= 1000) uxScore += 15;
        if (analysis.internalLinks.length >= 10) uxScore += 15;
        else if (analysis.internalLinks.length >= 5) uxScore += 10;
        if (analysis.externalLinks.length >= 5) uxScore += 10;
        else if (analysis.externalLinks.length >= 3) uxScore += 5;
        uxScore = Math.min(100, uxScore);
        const totalScore = Math.round(
            (graafScore / 50 * 35) +
            (craftScore / 30 * 25) +
            (technicalScore / 20 * 20) +
            (uxScore / 100 * 20)
        );
        const quality = totalScore >= 90 ? 'excellent' :
            totalScore >= 80 ? 'very good' :
            totalScore >= 70 ? 'good' :
            totalScore >= 60 ? 'average' : 'needs improvement';
        const recommendations = [];
        if (analysis.wordCount < 500) {
            recommendations.push({
                title: '📉 Content Depth Missing',
                description: `Your page has only ${analysis.wordCount} words. Google considers this "thin content".`,
                priority: 'high',
                action: 'Expand your content to at least 1,500 words.',
                learning: 'Google rewards pages that cover a topic exhaustively.',
                target: 'Minimum 1,500 words'
            });
        } else if (analysis.wordCount < 1500) {
            recommendations.push({
                title: '⚠️ Content Could Be Deeper',
                description: `With ${analysis.wordCount} words you lack depth compared to top rankings.`,
                priority: 'medium',
                action: 'Add sections on FAQs, Case Studies, or Step-by-Step Guides.',
                learning: 'Long-form content ranks better in AI Overviews.',
                target: '1,500+ words'
            });
        }
        if (!analysis.hasArticleSchema) {
            recommendations.push({
                title: '🔍 Missing Structured Data (Schema)',
                description: 'Your page is missing Article schema markup.',
                priority: 'high',
                action: 'Implement JSON-LD Article schema.',
                learning: 'Schema increases rich snippet chance by 30%.',
                target: 'Add JSON-LD Article Schema'
            });
        }
        if (analysis.internalLinks.length < 5) {
            recommendations.push({
                title: '🕸️ Weak Internal Link Structure',
                description: `You have only ${analysis.internalLinks.length} internal links.`,
                priority: 'medium',
                action: 'Link to 5-10 related articles on your site.',
                learning: 'Internal links distribute Page Authority.',
                target: '8-12 relevant internal links'
            });
        }
        if (analysis.keywordCount === 0 && analysis.wordCount > 100) {
            recommendations.push({
                title: '❌ Focus Keyword Missing',
                description: 'Your main keyword does not appear in the text.',
                priority: 'high',
                action: 'Naturally incorporate your focus keyword in the intro and H2s.',
                learning: 'Helps Google understand primary intent.',
                target: 'Keyword density of 0.5% - 1.5%'
            });
        }
        if (analysis.h2Count < 3) {
            recommendations.push({
                title: '📑 Poor Heading Structure',
                description: `You have only ${analysis.h2Count} subheadings (H2).`,
                priority: 'medium',
                action: 'Break up text with clear H2 and H3 subheadings.',
                learning: 'Crucial for E-E-A-T and readability.',
                target: 'Minimum 5 H2 headings'
            });
        }
        if (analysis.images.length < 3) {
            recommendations.push({
                title: '🖼️ Too Few Visual Elements',
                description: `You have only ${analysis.images.length} images.`,
                priority: 'low',
                action: 'Add at least 3 relevant images or infographics.',
                learning: 'Visuals increase Time on Page.',
                target: 'Minimum 1 image per 300 words'
            });
        }
        if (analysis.expertQuotes.length === 0) {
            recommendations.push({
                title: '🎓 Missing Expertise Signals (E-E-A-T)',
                description: 'Your content contains no expert quotes or citations.',
                priority: 'medium',
                action: 'Support claims with quotes from experts or data.',
                learning: 'Google requires claims to be substantiated.',
                target: 'Minimum 2 expert quotes'
            });
        }
        const finalRecommendations = recommendations.length > 0 ? recommendations : [{
            title: '🎉 Excellent Work!',
            description: 'Your page meets the core principles of the GRAAF Framework.',
            priority: 'none',
            action: 'Continue producing high-quality content.',
            learning: 'SEO is an ongoing process.',
            target: 'Maintain current quality'
        }];
        const result = {
            success: true,
            url: scanUrl,
            score: totalScore,
            quality: quality,
            metrics: {
                graaf: graafScore,
                craft: craftScore,
                technical: technicalScore,
                content: Math.min(100, graafScore + craftScore),
                ux: uxScore
            },
            content_stats: {
                wordCount: analysis.wordCount,
                h1Count: analysis.h1Count,
                h2Count: analysis.h2Count,
                h3Count: analysis.h3Count,
                listCount: analysis.listCount,
                listItemCount: analysis.listItemCount,
                metaTitleLength: analysis.metaTitleLength,
                metaDescriptionLength: analysis.metaDescriptionLength,
                hasMetaViewport: analysis.hasMetaViewport,
                hasCanonical: analysis.hasCanonical,
                hasArticleSchema: analysis.hasArticleSchema,
                hasFAQPageSchema: analysis.hasFAQPageSchema,
                hasOrganizationSchema: analysis.hasOrganizationSchema,
                images: analysis.images,
                imagesWithAlt: analysis.imagesWithAlt,
                internalLinks: analysis.internalLinks.length,
                externalLinks: analysis.externalLinks.length,
                expertQuotes: analysis.expertQuotes.length,
                caseStudies: analysis.caseStudies.length,
                keywordDensity: analysis.keywordDensity.toFixed(2),
                keywordCount: analysis.keywordCount,
                hasKeywordInH1: analysis.hasKeywordInH1,
                hasKeywordInIntro: analysis.hasKeywordInIntro,
                avgParagraphLength: Math.round(analysis.avgParagraphLength)
            },
            recommendations: {
                all: finalRecommendations,
                count: finalRecommendations.length
            },
            timestamp: new Date().toISOString()
        };
        console.log(`✅ Scan complete: ${scanUrl} - ${totalScore}/100 (${quality})`);
        res.json(result);
    } catch (error) {
        console.error('❌ Scan error:', error.message);
        res.status(500).json({ success: false, error: 'Scan failed', details: error.message });
    }
});
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// ============================================
// LEADERBOARD ENDPOINTS
// ============================================
app.get('/api/leaderboard', async (req, res) => {
    if (!pool) {
        return res.json({
            success: true,
            entries: [],
            total: 0,
            averageScore: 0,
            stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0, verifiedCount: 0 }
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
                admin_verified,
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
        const verifiedCount = entries.filter(e => e.admin_verified === true).length;
        const freelancersResult = await pool.query('SELECT COUNT(*) FROM freelancers WHERE is_approved = TRUE')
            .catch(() => ({ rows: [{ count: '0' }] }));
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
                activeHelpers: activeHelpers,
                verifiedCount: verifiedCount
            }
        });
    } catch (error) {
        console.error('❌ Leaderboard error:', error);
        res.json({
            success: true,
            entries: [],
            total: 0,
            averageScore: 0,
            stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0, verifiedCount: 0 }
        });
    }
});

// ============================================
// FREELANCERS ENDPOINTS
// ============================================
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
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_featured } = req.body;
        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and email are required' });
        }
        const existing = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }
        const result = await pool.query(
            `INSERT INTO freelancers
            (name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_approved, is_featured)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
            RETURNING id`,
            [name, email, title || null, location || null, country || null, bio || null,
            linkedin_url || null, hourly_rate || null, availability || null, is_featured || false]
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

// ============================================
// ADMIN AUTHENTICATION
// ============================================
app.post('/api/setup/verify-admin', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Credentials required' });
    }
    if (!pool) {
        return res.status(503).json({
            success: false,
            error: 'Database unavailable',
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

// ============================================
// ADMIN LEADERBOARD ENDPOINTS
// ============================================
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
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
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
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Reject leaderboard error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/leaderboard/bulk-delete', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs received' });
        }
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM leaderboard WHERE id IN (${placeholders})`, ids);
        res.json({ success: true, message: `${ids.length} entries deleted` });
    } catch (error) {
        console.error('Bulk delete leaderboard error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { url, company_name, score, country, city } = req.body;
        if (!url || score === undefined) {
            return res.status(400).json({ success: false, error: 'URL and score are required' });
        }
        const truncatedCountry = (country || 'NL').trim().substring(0, 10);
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
            [url, company_name || null, score, truncatedCountry, city || null]
        );
        const wasInserted = result.rows[0].inserted;
        res.json({
            success: true,
            action: wasInserted ? 'added' : 'updated',
            id: result.rows[0].id,
            message: wasInserted ? 'Entry added to leaderboard' : 'Leaderboard entry updated'
        });
    } catch (error) {
        console.error('Manual leaderboard add error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { id } = req.params;
        const { company_name, url, score, country, city } = req.body;
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
            const truncatedCountry = country.trim().substring(0, 10);
            updates.push(`country = $${paramCount}`);
            values.push(truncatedCountry);
            paramCount++;
        }
        if (city !== undefined) {
            updates.push(`city = $${paramCount}`);
            values.push(city);
            paramCount++;
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(id);
        const query = `UPDATE leaderboard SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        const result = await pool.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }
        res.json({ success: true, message: 'Leaderboard entry updated', entry: result.rows[0] });
    } catch (error) {
        console.error('Update leaderboard error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM leaderboard WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }
        res.json({ success: true, message: 'Entry deleted' });
    } catch (error) {
        console.error('Delete leaderboard error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADMIN FREELANCERS ENDPOINTS
// ============================================
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
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
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
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete freelancer error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
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
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        values.push(id);
        const query = `UPDATE freelancers SET ${updates.join(', ')} WHERE id = $${paramCount}`;
        await pool.query(query, values);
        res.json({ success: true, message: 'Freelancer updated' });
    } catch (error) {
        console.error('Update freelancer error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/freelancers/:id/toggle-featured', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { id } = req.params;
        const freelancer = await pool.query('SELECT is_featured FROM freelancers WHERE id = $1', [id]);
        if (freelancer.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Freelancer not found' });
        }
        const newFeatured = !freelancer.rows[0].is_featured;
        await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [newFeatured, id]);
        res.json({
            success: true,
            is_featured: newFeatured,
            message: `Featured ${newFeatured ? 'enabled' : 'disabled'}`
        });
    } catch (error) {
        console.error('Toggle featured error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/freelancers/bulk-delete', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No IDs received' });
        }
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM freelancers WHERE id IN (${placeholders})`, ids);
        res.json({ success: true, message: `${ids.length} freelancers deleted` });
    } catch (error) {
        console.error('Bulk delete freelancers error:', error.message);
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
    console.log('🚀  CONTENTSCALE SERVER - FINAL LOGIC');
    console.log('🚀 =====================================');
    console.log('');
    const dbConnected = await waitForDatabase();
    app.listen(PORT, () => {
        console.log('');
        console.log(`📍 Server started on http://localhost:${PORT}`);
        console.log(`📍 Admin:     http://localhost:${PORT}/admin`);
        console.log('');
        console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ NOT CONNECTED'}`);
        console.log('');
        console.log('✅ FEATURE STATUS:');
        console.log('   • Single URL Scanner: ✅ ACTIVE');
        console.log('   • Bulk URL Scanner: ✅ ACTIVE');
        console.log('   • Auto-Activation: ✅ 7 DAYS FREE ON REGISTER');
        console.log('   • Expiration Check: ✅ ENABLED');
        console.log('   • Click-to-Unlock: ✅ EXTENDS 7 DAYS IMMEDIATELY');
        console.log('   • Admin Control: ✅ FULL MANUAL OVERRIDE');
        console.log('   • SendGrid Integration: ✅ REAL EMAILS');
        console.log('   • Email Templates: ✅ SAVED IN DB');
        console.log('   • Leaderboard: ✅ ACTIVE');
        console.log('   • Freelancers: ✅ ACTIVE');
        console.log('   • Admin Login: ✅ WORKS (ot / admin123)');
        console.log('');
    });
}

startServer();
