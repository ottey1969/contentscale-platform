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
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');

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

app.get('/api/user/keys/status', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey) {
        return res.json({
            success: true,
            has_key: false,
            status: 'unauthenticated',
            message: 'No API key provided'
        });
    }
    if (!pool) {
        return res.json({
            success: true,
            has_key: false,
            status: 'error',
            message: 'Database unavailable'
        });
    }
    try {
        const result = await pool.query(
            'SELECT id, username, role, is_active FROM super_admins WHERE id = $1',
            [adminKey]
        );
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                has_key: false,
                status: 'invalid',
                message: 'Invalid API key'
            });
        }
        const admin = result.rows[0];
        if (!admin.is_active) {
            return res.json({
                success: true,
                has_key: false,
                status: 'inactive',
                message: 'API key is inactive'
            });
        }
        res.json({
            success: true,
            has_key: true,
            status: 'active',
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role
            },
            message: 'API key is valid'
        });
    } catch (error) {
        console.error('❌ API key status error:', error.message);
        res.json({
            success: true,
            has_key: false,
            status: 'error',
            message: 'Server error'
        });
    }
});

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
        
        await page.setViewport({
            width: 1366 + Math.floor(Math.random() * 200),
            height: 768 + Math.floor(Math.random() * 200)
        });
        
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ];
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            Object.defineProperty(iframe.contentWindow, 'navigator', {
                get: () => navigator
            });
        });
        
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': 'https://www.google.com/'
        });
        
        console.log('🌐 Navigating to Google Maps...');
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        
        console.log('⏳ Waiting for page content...');
        await page.waitForTimeout(4000 + Math.floor(Math.random() * 2000));
        
        try {
            await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 10000 });
            console.log('✅ Found place links on page');
        } catch (e) {
            console.log('⚠️ Place links not found immediately - waiting longer...');
            await page.waitForTimeout(6000);
            const screenshotPath = `/tmp/google-maps-debug-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Debug screenshot saved: ${screenshotPath}`);
            console.log('💡 Check this screenshot to see what Google Maps is showing (captcha/reCAPTCHA?)');
        }
        
        console.log('🔍 Extracting business data using robust method...');
        const leads = await page.evaluate((maxResults) => {
            const businesses = [];
            
            const placeLinks = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            console.log(`📊 Found ${placeLinks.length} place links on page`);
            
            for (let i = 0; i < Math.min(placeLinks.length, maxResults * 3); i++) {
                const link = placeLinks[i];
                try {
                    let name = link.textContent.trim();
                    
                    name = name.replace(/\s*\d+\.*\d*\s*★.*/, '').trim();
                    name = name.replace(/\s*\(\d+\s*reviews?\).*/, '').trim();
                    name = name.replace(/·.*/, '').trim();
                    name = name.replace(/,\s*\d+\s*reviews?/, '').trim();
                    
                    if (!name || name.length < 3 || name.length > 100) continue;
                    
                    const parent = link.closest('div[jsaction], div[role="link"], article, div') || link.parentElement;
                    if (!parent) continue;
                    
                    let phone = null;
                    const phoneLink = parent.querySelector('a[href^="tel:"], a[href*="tel%3A"]');
                    if (phoneLink) {
                        phone = phoneLink.getAttribute('href')
                            .replace('tel:', '')
                            .replace('tel%3A', '')
                            .replace(/[^0-9+\s-()]/g, '')
                            .trim();
                        if (phone.length < 6) phone = null;
                    }
                    
                    let website = null;
                    
                    const websiteBtn = parent.querySelector('button[aria-label*="Website" i]');
                    if (websiteBtn) {
                        const label = websiteBtn.getAttribute('aria-label') || '';
                        const urlMatch = label.match(/https?:\/\/[^\s"')]+/);
                        if (urlMatch) {
                            website = urlMatch[0].split(/[?&]/)[0];
                        }
                    }
                    
                    if (!website) {
                        const httpLinks = parent.querySelectorAll('a[href^="http"]');
                        for (const a of httpLinks) {
                            const href = a.href;
                            if (href &&
                                !href.includes('google.com') &&
                                !href.includes('gstatic.com') &&
                                !href.includes('youtube.com') &&
                                !href.includes('facebook.com') &&
                                href.includes('.')) {
                                website = href.split(/[?&]/)[0];
                                break;
                            }
                        }
                    }
                    
                    if (name && (website || phone)) {
                        const exists = businesses.some(b =>
                            b.name === name &&
                            (b.website === website || b.phone === phone)
                        );
                        if (!exists) {
                            businesses.push({
                                name: name,
                                category: 'SEO Agency',
                                website: website || null,
                                phone: phone || null,
                                address: null,
                                rating: null,
                                reviews: null,
                                score: 0,
                                status: 'new'
                            });
                        }
                    }
                    
                    if (businesses.length >= maxResults) break;
                } catch (err) {
                    continue;
                }
            }
            
            return businesses;
        }, maxResults);
        
        await page.close();
        
        console.log(`✅ Successfully extracted ${leads.length} businesses`);
        console.log(`📊 With websites: ${leads.filter(l => l.website).length}`);
        console.log(`📞 With phones: ${leads.filter(l => l.phone).length}`);
        
        if (leads.length > 0) {
            console.log('📋 Sample leads:', JSON.stringify(leads.slice(0, Math.min(3, leads.length)), null, 2));
        } else {
            console.log('⚠️ No businesses found');
            console.log('💡 COMMON REASONS:');
            console.log('   1. Google shows CAPTCHA/reCAPTCHA (anti-bot)');
            console.log('   2. Too specific location (try "SEO agencies Netherlands")');
            console.log('   3. Google rate limiting (wait 2-3 minutes and try again)');
            console.log('   4. Small location with few businesses');
        }
        
        res.json({
            success: true,
            leads: leads,
            stats: {
                total: leads.length,
                with_website: leads.filter(l => l.website).length,
                with_phone: leads.filter(l => l.phone).length
            },
            message: leads.length === 0 ? 'No businesses found. This is often due to Google anti-bot measures. Try again in 2-3 minutes or use a broader search like "SEO agencies Netherlands".' : undefined
        });
    } catch (error) {
        console.error('❌ Google Maps scrape error:', error.message);
        console.error(error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to scrape Google Maps: ' + (error.message || 'Unknown error'),
            hint: 'Google has strong anti-bot measures. Wait 2-3 minutes between attempts. For reliable results, consider manual CSV upload.'
        });
    }
});

app.post('/api/scan', async (req, res) => {
    const { url, keyword } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    let scanUrl = url;
    if (!scanUrl.startsWith('http')) scanUrl = 'https://' + scanUrl;
    if (!isValidUrl(scanUrl)) return res.status(400).json({ success: false, error: 'Invalid URL format' });
    
    try {
        console.log(`🔍 Scanning: ${scanUrl}`);
        if (keyword) console.log(`🔑 Target keyword: "${keyword}"`);
        
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
            let hasKeywordInFirstH2 = false;
            let hasKeywordInIntro = false;
            let hasKeywordInConclusion = false;
            
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
                
                const h2Elements = document.querySelectorAll('h2');
                if (h2Elements.length > 0) {
                    hasKeywordInFirstH2 = h2Elements[0].textContent.toLowerCase().includes(targetKeyword.toLowerCase());
                }
                
                const paragraphs = document.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    hasKeywordInIntro = paragraphs[0].textContent.toLowerCase().includes(targetKeyword.toLowerCase());
                }
                
                if (paragraphs.length > 1) {
                    hasKeywordInConclusion = paragraphs[paragraphs.length - 1].textContent.toLowerCase().includes(targetKeyword.toLowerCase());
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
            const metaTitleHasKeyword = targetKeyword ? metaTitle.toLowerCase().includes(targetKeyword.toLowerCase()) : false;
            
            const metaDescriptionElement = document.querySelector('meta[name="description"]');
            const metaDescription = metaDescriptionElement ? metaDescriptionElement.getAttribute('content') : '';
            const metaDescriptionLength = metaDescription.length;
            const metaDescriptionHasKeyword = targetKeyword ? metaDescription.toLowerCase().includes(targetKeyword.toLowerCase()) : false;
            
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
            const ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
            
            const twitterCard = document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '';
            const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
            const twitterDescription = document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '';
            const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';
            
            const hasMetaViewport = !!document.querySelector('meta[name="viewport"]');
            const hasCanonical = !!document.querySelector('link[rel="canonical"]');
            
            const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            
            let hasArticleSchema = false;
            let hasFAQPageSchema = false;
            let hasOrganizationSchema = false;
            let hasBreadcrumbSchema = false;
            let faqQuestionCount = 0;
            
            schemaScripts.forEach(script => {
                try {
                    const schemaData = JSON.parse(script.textContent);
                    const type = schemaData['@type'];
                    
                    if (type === 'Article' || (Array.isArray(type) && type.includes('Article'))) {
                        hasArticleSchema = true;
                    }
                    if (type === 'FAQPage') {
                        hasFAQPageSchema = true;
                        if (schemaData.mainEntity && Array.isArray(schemaData.mainEntity)) {
                            faqQuestionCount = schemaData.mainEntity.length;
                        }
                    }
                    if (type === 'Organization') {
                        hasOrganizationSchema = true;
                    }
                    if (type === 'BreadcrumbList') {
                        hasBreadcrumbSchema = true;
                    }
                } catch (e) {
                }
            });
            
            const hasSchemaOrg = schemaScripts.length > 0 || rawHtml.includes('schema.org');
            
            const images = document.querySelectorAll('img');
            const imagesWithAlt = Array.from(images).filter(img =>
                img.hasAttribute('alt') && img.getAttribute('alt').trim().length > 0
            ).length;
            
            const baseUrl = new URL(scanUrl);
            const baseDomain = baseUrl.hostname.replace('www.', '');
            
            const internalLinks = [];
            const externalLinks = [];
            const emailLinks = [];
            const telLinks = [];
            
            Array.from(document.querySelectorAll('a[href]')).forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                
                if (href.startsWith('mailto:')) {
                    emailLinks.push(href);
                    return;
                }
                
                if (href.startsWith('tel:') || href.startsWith('callto:')) {
                    telLinks.push(href);
                    return;
                }
                
                try {
                    const linkUrl = new URL(href, scanUrl);
                    const linkDomain = linkUrl.hostname.replace('www.', '');
                    
                    if (linkDomain === baseDomain ||
                        linkDomain.endsWith('.' + baseDomain) ||
                        baseDomain.endsWith('.' + linkDomain)) {
                        internalLinks.push({
                            href: linkUrl.href,
                            text: link.textContent.trim(),
                            isNofollow: link.hasAttribute('rel') && link.getAttribute('rel').toLowerCase().includes('nofollow')
                        });
                    }
                    else if (!linkUrl.protocol.startsWith('mailto') && !linkUrl.protocol.startsWith('tel')) {
                        externalLinks.push({
                            href: linkUrl.href,
                            text: link.textContent.trim(),
                            isNofollow: link.hasAttribute('rel') && link.getAttribute('rel').toLowerCase().includes('nofollow')
                        });
                    }
                } catch (e) {
                }
            });
            
            const expertQuotes = [];
            document.querySelectorAll('blockquote').forEach(blockquote => {
                let quoteText = blockquote.textContent.trim();
                let attribution = '';
                
                const cite = blockquote.querySelector('cite');
                const footer = blockquote.querySelector('footer');
                if (cite) attribution = cite.textContent.trim();
                else if (footer) attribution = footer.textContent.trim();
                else {
                    const next = blockquote.nextElementSibling;
                    if (next && next.tagName.toLowerCase() === 'p' && next.textContent.includes('—')) {
                        attribution = next.textContent.trim();
                    }
                }
                
                if (quoteText.length > 20 && attribution.length > 5) {
                    expertQuotes.push({
                        text: quoteText,
                        attribution: attribution
                    });
                }
            });
            
            const caseStudies = [];
            const caseStudyKeywords = ['case study', 'case-study', 'results', 'metrics', 'roi', 'success story'];
            document.querySelectorAll('section, article, div').forEach(el => {
                const text = el.textContent.toLowerCase();
                if (caseStudyKeywords.some(keyword => text.includes(keyword)) && text.length > 300) {
                    if (/\d+[%$€£]/.test(text) || /\b\d{2,}\b/.test(text)) {
                        caseStudies.push({
                            excerpt: el.textContent.substring(0, 200) + '...',
                            containsMetrics: true
                        });
                    }
                }
            });
            
            const statistics = [];
            const statPatterns = [
                /\b\d+[%]\b/g,
                /\b\d{1,3}(?:,\d{3})*\b/g,
                /\b\d+\s*(?:million|billion|thousand)\b/gi,
                /\b\d+\s*x\b/gi
            ];
            
            statPatterns.forEach(pattern => {
                const matches = textContent.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        if (!statistics.includes(match)) {
                            statistics.push(match);
                        }
                    });
                }
            });
            
            const hasRecentSources = /(?:202[345]|according to|source|study|report)\b/i.test(textContent);
            const sourceCount = (textContent.match(/(?:202[345]|according to|source|study|report)\b/gi) || []).length;
            
            const faqQuestions = [];
            const faqAnswers = [];
            
            const questionElements = document.querySelectorAll('h3, h4');
            questionElements.forEach(el => {
                const text = el.textContent;
                if (text.includes('?') && text.length > 10 && text.length < 100) {
                    faqQuestions.push(text);
                    
                    let next = el.nextElementSibling;
                    let answerText = '';
                    let paraCount = 0;
                    
                    while (next && paraCount < 3) {
                        if (next.tagName.toLowerCase() === 'p') {
                            answerText += next.textContent + ' ';
                            paraCount++;
                        } else if (next.tagName.toLowerCase().match(/^h[2-6]$/)) {
                            break;
                        }
                        next = next.nextElementSibling;
                    }
                    
                    if (answerText.trim().length > 0) {
                        faqAnswers.push({
                            question: text,
                            answer: answerText.trim(),
                            answerWordCount: answerText.trim().split(/\s+/).length,
                            hasInternalLink: next ? Array.from(next.querySelectorAll('a')).some(a => {
                                try {
                                    const linkUrl = new URL(a.href, scanUrl);
                                    return linkUrl.hostname.replace('www.', '') === baseDomain;
                                } catch (e) {
                                    return false;
                                }
                            }) : false,
                            hasExternalLink: next ? Array.from(next.querySelectorAll('a')).some(a => {
                                try {
                                    const linkUrl = new URL(a.href, scanUrl);
                                    return linkUrl.hostname.replace('www.', '') !== baseDomain;
                                } catch (e) {
                                    return false;
                                }
                            }) : false
                        });
                    }
                }
            });
            
            let hasDirectAnswerBox = false;
            let directAnswerWordCount = 0;
            
            const firstParagraph = document.querySelector('p');
            if (firstParagraph) {
                const firstParaText = firstParagraph.textContent.trim();
                directAnswerWordCount = firstParaText.split(/\s+/).length;
                hasDirectAnswerBox = directAnswerWordCount >= 40 && directAnswerWordCount <= 60;
            }
            
            let hasTLDR = false;
            let tldrItemCount = 0;
            
            const tldrSection = Array.from(document.querySelectorAll('section, div')).find(el => {
                const text = el.textContent.toLowerCase();
                return text.includes('tldr') || text.includes('key takeaways') || text.includes('summary');
            });
            
            if (tldrSection) {
                tldrItemCount = tldrSection.querySelectorAll('li').length;
                hasTLDR = tldrItemCount >= 5;
            }
            
            let hasTableOfContents = false;
            const tocElement = Array.from(document.querySelectorAll('nav, div, section')).find(el => {
                const text = el.textContent.toLowerCase();
                return text.includes('table of contents') || text.includes('inhoudsopgave');
            });
            if (tocElement) {
                hasTableOfContents = tocElement.querySelectorAll('a[href^="#"]').length >= 3;
            }
            
            let hasAuthorBio = false;
            let authorBioWordCount = 0;
            let hasAuthorCredentials = false;
            
            const authorBioElement = Array.from(document.querySelectorAll('section, div, article')).find(el => {
                const text = el.textContent.toLowerCase();
                return (text.includes('about the author') || 
                        text.includes('about author') || 
                        text.includes('author bio') ||
                        text.includes('geschreven door')) && 
                       text.length > 100;
            });
            
            if (authorBioElement) {
                const bioText = authorBioElement.textContent.trim();
                authorBioWordCount = bioText.split(/\s+/).length;
                hasAuthorBio = authorBioWordCount >= 200 && authorBioWordCount <= 250;
                
                hasAuthorCredentials = /(?:graduated|degree|certified|certification|experience|years of|specializes|expert|professional)\b/i.test(bioText);
            }
            
            const paragraphs = document.querySelectorAll('p');
            const avgParagraphLength = Array.from(paragraphs)
                .map(p => p.textContent.trim().split(/\s+/).length)
                .reduce((a, b) => a + b, 0) / (paragraphs.length || 1);
            
            const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
            const avgSentenceLength = sentences
                .map(s => s.trim().split(/\s+/).length)
                .reduce((a, b) => a + b, 0) / (sentences.length || 1);
            
            const syllableCount = textContent.match(/[aeiouy]+/gi)?.length || 0;
            const fleschScore = 206.835 - (1.015 * (wordCount / (sentences.length || 1))) - (84.6 * (syllableCount / wordCount));
            
            const passiveVoiceCount = (textContent.match(/\b(is|was|were|been|being)\b/gi) || []).length;
            const activeVoicePercentage = passiveVoiceCount > 0 ? 
                Math.round(100 - (passiveVoiceCount / (wordCount / 20))) : 100;
            
            return {
                url: scanUrl,
                rawHtml: rawHtml.substring(0, 15000),
                textContent: textContent.substring(0, 8000),
                wordCount: wordCount,
                h1Count: h1Count,
                h2Count: h2Count,
                h3Count: h3Count,
                listCount: listCount,
                listItemCount: listItemCount,
                metaTitle: metaTitle,
                metaTitleLength: metaTitleLength,
                metaTitleHasKeyword: metaTitleHasKeyword,
                metaDescription: metaDescription,
                metaDescriptionLength: metaDescriptionLength,
                metaDescriptionHasKeyword: metaDescriptionHasKeyword,
                ogTitle: ogTitle,
                ogDescription: ogDescription,
                ogImage: ogImage,
                twitterCard: twitterCard,
                twitterTitle: twitterTitle,
                twitterDescription: twitterDescription,
                twitterImage: twitterImage,
                hasMetaViewport: hasMetaViewport,
                hasCanonical: hasCanonical,
                hasSchemaOrg: hasSchemaOrg,
                hasArticleSchema: hasArticleSchema,
                hasFAQPageSchema: hasFAQPageSchema,
                hasOrganizationSchema: hasOrganizationSchema,
                hasBreadcrumbSchema: hasBreadcrumbSchema,
                schemaCount: schemaScripts.length,
                images: images.length,
                imagesWithAlt: imagesWithAlt,
                internalLinks: internalLinks,
                externalLinks: externalLinks,
                emailLinks: emailLinks,
                telLinks: telLinks,
                expertQuotes: expertQuotes,
                caseStudies: caseStudies,
                statistics: statistics,
                hasRecentSources: hasRecentSources,
                sourceCount: sourceCount,
                faqQuestions: faqQuestions,
                faqQuestionCount: faqQuestionCount,
                faqAnswers: faqAnswers,
                hasDirectAnswerBox: hasDirectAnswerBox,
                directAnswerWordCount: directAnswerWordCount,
                hasTLDR: hasTLDR,
                tldrItemCount: tldrItemCount,
                hasTableOfContents: hasTableOfContents,
                hasAuthorBio: hasAuthorBio,
                authorBioWordCount: authorBioWordCount,
                hasAuthorCredentials: hasAuthorCredentials,
                avgParagraphLength: avgParagraphLength,
                avgSentenceLength: avgSentenceLength,
                fleschScore: fleschScore,
                activeVoicePercentage: activeVoicePercentage,
                keywordDensity: keywordDensity,
                keywordCount: keywordCount,
                hasKeywordInH1: hasKeywordInH1,
                hasKeywordInFirstH2: hasKeywordInFirstH2,
                hasKeywordInIntro: hasKeywordInIntro,
                hasKeywordInConclusion: hasKeywordInConclusion
            };
        }, scanUrl, keyword);
        
        await page.close();
        
        let graafScore = 0;
        let craftScore = 0;
        let technicalScore = 0;
        let contentScore = 0;
        let uxScore = 0;
        
        if (analysis.wordCount >= 2500) graafScore += 15;
        else if (analysis.wordCount >= 1500) graafScore += 10;
        else if (analysis.wordCount >= 1000) graafScore += 7;
        else if (analysis.wordCount >= 500) graafScore += 4;
        else if (analysis.wordCount >= 300) graafScore += 2;
        
        if (keyword) {
            if (analysis.keywordDensity >= 0.8 && analysis.keywordDensity <= 1.2) graafScore += 4;
            else if (analysis.keywordDensity >= 0.6 && analysis.keywordDensity <= 1.5) graafScore += 2;
            
            if (analysis.hasKeywordInH1) graafScore += 2;
            if (analysis.hasKeywordInFirstH2) graafScore += 2;
            if (analysis.hasKeywordInIntro) graafScore += 2;
        }
        
        if (analysis.listItemCount >= 15) graafScore += 8;
        else if (analysis.listItemCount >= 10) graafScore += 6;
        else if (analysis.listItemCount >= 5) graafScore += 4;
        
        if (analysis.h2Count >= 5) graafScore += 7;
        else if (analysis.h2Count >= 3) graafScore += 5;
        else if (analysis.h2Count >= 2) graafScore += 3;
        
        if (analysis.h3Count >= 8) graafScore += 5;
        else if (analysis.h3Count >= 5) graafScore += 3;
        
        if (analysis.expertQuotes.length >= 4) graafScore += 8;
        else if (analysis.expertQuotes.length >= 2) graafScore += 5;
        else if (analysis.expertQuotes.length >= 1) graafScore += 3;
        
        if (analysis.caseStudies.length >= 2) graafScore += 7;
        else if (analysis.caseStudies.length >= 1) graafScore += 4;
        
        if (analysis.hasAuthorBio && analysis.hasAuthorCredentials) graafScore += 10;
        else if (analysis.hasAuthorBio) graafScore += 5;
        
        graafScore = Math.min(50, graafScore);
        
        if (analysis.h1Count === 1) craftScore += 12;
        else if (analysis.h1Count === 0) craftScore += 0;
        else craftScore += 3;
        
        if (analysis.h2Count >= 5) craftScore += 8;
        else if (analysis.h2Count >= 3) craftScore += 6;
        else if (analysis.h2Count >= 2) craftScore += 4;
        
        if (analysis.avgSentenceLength >= 12 && analysis.avgSentenceLength <= 20) craftScore += 5;
        else if (analysis.avgSentenceLength > 20) craftScore += 2;
        
        if (analysis.avgParagraphLength <= 100) craftScore += 5;
        
        if (analysis.fleschScore >= 60 && analysis.fleschScore <= 70) craftScore += 5;
        if (analysis.activeVoicePercentage >= 80) craftScore += 5;
        
        craftScore = Math.min(30, craftScore);
        
        if (analysis.metaTitleLength >= 50 && analysis.metaTitleLength <= 60) technicalScore += 3;
        if (analysis.metaTitleHasKeyword) technicalScore += 2;
        
        if (analysis.metaDescriptionLength >= 150 && analysis.metaDescriptionLength <= 160) technicalScore += 3;
        if (analysis.metaDescriptionHasKeyword) technicalScore += 2;
        
        if (analysis.hasArticleSchema) technicalScore += 3;
        if (analysis.hasFAQPageSchema) technicalScore += 3;
        if (analysis.hasOrganizationSchema) technicalScore += 2;
        
        if (analysis.hasMetaViewport) technicalScore += 2;
        
        if (analysis.hasCanonical) technicalScore += 2;
        
        if (analysis.images > 0 && analysis.imagesWithAlt >= Math.min(5, analysis.images)) technicalScore += 3;
        
        if (analysis.ogTitle && analysis.ogDescription && analysis.ogImage) technicalScore += 2;
        if (analysis.twitterCard && analysis.twitterTitle && analysis.twitterDescription) technicalScore += 2;
        
        technicalScore = Math.min(20, technicalScore);
        
        contentScore = Math.min(100, graafScore + craftScore);
        
        if (analysis.images >= 5) uxScore += 20;
        else if (analysis.images >= 3) uxScore += 15;
        else if (analysis.images >= 1) uxScore += 10;
        
        const hasVideos = analysis.textContent.toLowerCase().includes('youtube') ||
                          analysis.textContent.toLowerCase().includes('vimeo') ||
                          analysis.rawHtml.includes('<video');
        if (hasVideos) uxScore += 15;
        
        if (analysis.wordCount >= 2000) uxScore += 25;
        else if (analysis.wordCount >= 1500) uxScore += 20;
        else if (analysis.wordCount >= 1000) uxScore += 15;
        
        if (analysis.listCount >= 5) uxScore += 15;
        else if (analysis.listCount >= 3) uxScore += 10;
        
        if (analysis.internalLinks.length >= 10) uxScore += 15;
        else if (analysis.internalLinks.length >= 5) uxScore += 10;
        else if (analysis.internalLinks.length >= 3) uxScore += 5;
        
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
        
        if (keyword) {
            if (analysis.keywordDensity < 0.8 || analysis.keywordDensity > 1.2) {
                recommendations.push({
                    title: '🔑 Optimize Keyword Density',
                    description: `Current density: ${analysis.keywordDensity.toFixed(2)}%. Target: 0.8-1.2%.`,
                    priority: 'high',
                    action: `Adjust keyword usage to ${Math.round(analysis.wordCount * 0.008)}-${Math.round(analysis.wordCount * 0.012)} times in ${analysis.wordCount} words.`,
                    learning: 'Optimal keyword density (0.8-1.2%) signals relevance without over-optimization. Pages with proper density rank 34% higher.',
                    target: '0.8-1.2% keyword density'
                });
            }
            
            if (!analysis.hasKeywordInH1) {
                recommendations.push({
                    title: '🏷️ Add Keyword to H1',
                    description: 'Your H1 tag does not contain the target keyword.',
                    priority: 'high',
                    action: 'Include your primary keyword in the H1 tag near the beginning.',
                    learning: 'H1 with keyword improves topical relevance by 47% and click-through rate by 23%.',
                    target: 'Keyword in H1 tag'
                });
            }
            
            if (!analysis.hasKeywordInIntro) {
                recommendations.push({
                    title: '📝 Add Keyword to Introduction',
                    description: 'Your introduction paragraph does not contain the target keyword.',
                    priority: 'medium',
                    action: 'Include the keyword naturally in your first paragraph.',
                    learning: 'Early keyword placement signals content relevance and improves rankings by 28%.',
                    target: 'Keyword in first paragraph'
                });
            }
        }
        
        if (analysis.wordCount < 500) {
            recommendations.push({
                title: '🚀 Urgent: Content Length',
                description: `Your page has only ${analysis.wordCount} words. For top rankings, aim for 2,500+ words with comprehensive coverage.`,
                priority: 'high',
                action: 'Expand content with detailed explanations, examples, case studies, and actionable advice. Target 2,500+ words minimum.',
                learning: 'Pages with 2,500+ words rank 3.7x higher on average and receive 4.2x more backlinks than shorter content.',
                target: '2,500+ words with depth and authority'
            });
        } else if (analysis.wordCount < 1500) {
            recommendations.push({
                title: '📝 Improve Content Length',
                description: `Current: ${analysis.wordCount} words. Target: 2,500+ words for competitive advantage.`,
                priority: 'medium',
                action: 'Add depth with examples, data points, expert insights, and practical applications. Expand each H2 section by 200-300 words.',
                learning: 'Top-ranking pages average 2,450 words. Comprehensive content signals authority to search engines and satisfies user intent completely.',
                target: '2,500+ words minimum'
            });
        }
        
        if (!analysis.hasAuthorBio) {
            recommendations.push({
                title: '✍️ Add Author Bio with Credentials',
                description: 'Your page is missing an author bio. This is critical for E-E-A-T signals.',
                priority: 'high',
                action: 'Add a 200-250 word author bio with credentials, experience, certifications, and notable achievements.',
                learning: 'Pages with author bios receive 56% more trust signals and rank 38 positions higher on average. Google prioritizes E-E-A-T.',
                target: '200-250 word author bio with credentials'
            });
        } else if (!analysis.hasAuthorCredentials) {
            recommendations.push({
                title: '🎓 Add Author Credentials',
                description: 'Your author bio lacks credentials and expertise signals.',
                priority: 'medium',
                action: 'Add certifications, degrees, years of experience, notable achievements, and published work to your author bio.',
                learning: 'Author credentials increase perceived authority by 67% and improve rankings for competitive keywords.',
                target: 'Author bio with verifiable credentials'
            });
        }
        
        if (analysis.expertQuotes.length < 2) {
            recommendations.push({
                title: '💡 Add Expert Quotes for Authority',
                description: `Current: ${analysis.expertQuotes.length} expert quotes. Target: 4+ with full attribution.`,
                priority: 'high',
                action: 'Include 4+ direct quotes from industry experts with full name, title, and organization. Place strategically to reinforce key points.',
                learning: 'Content with expert quotes receives 68% more organic traffic and ranks 47 positions higher on average. Google prioritizes E-E-A-T signals.',
                target: '4+ expert quotes with full attribution (name, title, organization)'
            });
        } else if (analysis.expertQuotes.length < 4) {
            recommendations.push({
                title: '💡 Add More Expert Quotes',
                description: `Current: ${analysis.expertQuotes.length} expert quotes. Target: 4+ for maximum authority.`,
                priority: 'medium',
                action: 'Add 1-2 more expert quotes with full attribution to strengthen E-E-A-T signals.',
                learning: 'Each additional expert quote increases perceived authority by 23% according to ContentScale research.',
                target: '4+ expert quotes with full attribution'
            });
        }
        
        if (analysis.caseStudies.length < 1) {
            recommendations.push({
                title: '📊 Add Case Studies with Metrics',
                description: `Current: ${analysis.caseStudies.length} case studies. Target: 2+ with measurable results.`,
                priority: 'high',
                action: 'Create 2 case studies showing real results with specific metrics (e.g., "increased traffic by 312% in 6 months"). Include challenge, solution, results.',
                learning: 'Pages with case studies convert 37% better and rank 52 positions higher on average. Concrete results build trust and demonstrate expertise.',
                target: '2+ case studies with specific metrics and ROI'
            });
        } else if (analysis.caseStudies.length < 2) {
            recommendations.push({
                title: '📊 Add One More Case Study',
                description: `Current: ${analysis.caseStudies.length} case study. Target: 2+ for social proof.`,
                priority: 'medium',
                action: 'Add one more case study with measurable results to strengthen credibility.',
                learning: 'Multiple case studies demonstrate consistent expertise rather than one-off success.',
                target: '2+ case studies with metrics'
            });
        }
        
        if (analysis.h1Count === 0) {
            recommendations.push({
                title: '🏷️ Missing H1 Tag',
                description: 'Every page must have exactly one H1 tag for SEO and accessibility.',
                priority: 'high',
                action: 'Add a single, descriptive H1 tag that includes your main keyword near the top of the page.',
                learning: 'The H1 tag is a critical ranking signal that tells search engines your page\'s primary topic. Missing H1s correlate with 28% lower rankings.',
                target: '1 H1 tag per page with target keyword'
            });
        } else if (analysis.h1Count > 1) {
            recommendations.push({
                title: '🏷️ Multiple H1 Tags',
                description: `You have ${analysis.h1Count} H1 tags. Use only one per page.`,
                priority: 'medium',
                action: 'Keep only one H1 tag (your main title) and change others to H2 or H3.',
                learning: 'Multiple H1 tags confuse search engines about your page\'s main topic and dilute ranking power.',
                target: '1 H1 tag per page'
            });
        }
        
        if (!analysis.hasArticleSchema) {
            recommendations.push({
                title: '🔍 Add Article Schema',
                description: 'Missing Article schema markup required for rich snippets and AI Overview inclusion.',
                priority: 'high',
                action: 'Implement Article schema in JSON-LD format with headline, description, author, publisher, datePublished, and wordCount.',
                learning: 'Article schema increases rich snippet appearance by 30% and AI Overview inclusion by 3.2x.',
                target: 'Complete Article schema markup'
            });
        }
        
        if (!analysis.hasFAQPageSchema) {
            recommendations.push({
                title: '❓ Add FAQPage Schema',
                description: 'Missing FAQPage schema for FAQ rich results and AI Overview inclusion.',
                priority: 'high',
                action: 'Implement FAQPage schema with all FAQ questions and complete answers in JSON-LD format.',
                learning: 'FAQ schema enables FAQ rich results (accordion in search) and increases AI Overview inclusion by 2.8x.',
                target: 'FAQPage schema with 10+ questions'
            });
        }
        
        if (analysis.metaTitleLength < 50 || analysis.metaTitleLength > 60) {
            recommendations.push({
                title: '🏷️ Optimize Meta Title Length',
                description: `Current: ${analysis.metaTitleLength} characters. Target: 50-60 characters.`,
                priority: 'medium',
                action: 'Adjust meta title to exactly 50-60 characters including spaces. Include primary keyword at start.',
                learning: 'Meta titles between 50-60 characters have 23% higher click-through rates and display completely in search results.',
                target: '50-60 character meta title with keyword'
            });
        }
        
        if (analysis.metaDescriptionLength < 150 || analysis.metaDescriptionLength > 160) {
            recommendations.push({
                title: '📝 Optimize Meta Description Length',
                description: `Current: ${analysis.metaDescriptionLength} characters. Target: 150-160 characters.`,
                priority: 'medium',
                action: 'Adjust meta description to exactly 150-160 characters. Include keyword, benefit, CTA, and authority signal.',
                learning: 'Meta descriptions between 150-160 characters have 18% higher CTR and display completely without truncation.',
                target: '150-160 character meta description'
            });
        }
        
        if (analysis.internalLinks.length < 5) {
            recommendations.push({
                title: '🔗 Add Internal Links for Site Structure',
                description: `Current: ${analysis.internalLinks.length} internal links. Target: 8-12 for optimal site architecture.`,
                priority: 'medium',
                action: 'Link to 5-7 related pages on your site using descriptive anchor text (not "click here"). Distribute naturally throughout content.',
                learning: 'Internal links distribute page authority, reduce bounce rate by 34%, and keep users engaged 2.7x longer on your site.',
                target: '8-12 relevant internal links with descriptive anchor text'
            });
        } else if (analysis.internalLinks.length < 8) {
            recommendations.push({
                title: '🔗 Add More Internal Links',
                description: `Current: ${analysis.internalLinks.length} internal links. Target: 8-12 for optimal crawlability.`,
                priority: 'low',
                action: 'Add 2-4 more internal links to cornerstone content and related articles.',
                learning: 'Well-linked sites have 47% better indexation and 2.3x faster discovery of new content by Google.',
                target: '8-12 internal links'
            });
        }
        
        if (analysis.faqQuestionCount < 10) {
            recommendations.push({
                title: '❓ Add FAQ Section with 10+ Questions',
                description: `Current: ${analysis.faqQuestionCount} FAQ questions. Target: 10+ with complete answers.`,
                priority: 'high',
                action: 'Create a dedicated FAQ section with 10+ questions. Each answer should be 100+ words with 1 internal + 1 external link.',
                learning: 'FAQ sections increase time on page by 89 seconds on average and capture 22% of "People Also Ask" features.',
                target: '10+ FAQ questions with 100+ word answers'
            });
        }
        
        if (!analysis.hasDirectAnswerBox) {
            recommendations.push({
                title: '🎯 Add Direct Answer Box',
                description: `Current: ${analysis.directAnswerWordCount} words in first paragraph. Target: 40-60 words for AI Overview inclusion.`,
                priority: 'high',
                action: 'Create a 40-60 word direct answer in your first paragraph that answers the main question with keyword + statistic + source.',
                learning: 'Direct answers of 40-60 words are 4.3x more likely to appear in AI Overviews and Featured Snippets.',
                target: '40-60 word direct answer with keyword + source'
            });
        }
        
        if (!analysis.hasTLDR) {
            recommendations.push({
                title: '📌 Add TL;DR Section',
                description: `Current: ${analysis.tldrItemCount} bullet points. Target: 5 key takeaways with sources.`,
                priority: 'medium',
                action: 'Add a TL;DR section with exactly 5 bullet points, each 15-25 words with specific numbers and sources.',
                learning: 'TL;DR sections increase content consumption by 47% and provide quick-scannable value for busy readers.',
                target: '5 bullet point TL;DR with sources'
            });
        }
        
        if (!analysis.hasTableOfContents) {
            recommendations.push({
                title: '📋 Add Table of Contents',
                description: 'Your page is missing a table of contents for navigation.',
                priority: 'low',
                action: 'Add a table of contents with clickable anchor links to all major H2 sections.',
                learning: 'Table of contents improves user navigation and reduces bounce rate by 15%.',
                target: 'Clickable table of contents with all H2 sections'
            });
        }
        
        if (analysis.images > 0 && analysis.imagesWithAlt < Math.min(5, analysis.images)) {
            recommendations.push({
                title: '🖼️ Add Alt Text to Images',
                description: `${analysis.imagesWithAlt}/${analysis.images} images have alt text. Target: 100% with descriptive alt attributes.`,
                priority: 'medium',
                action: 'Add descriptive alt text to all images describing their content and context. Include target keyword in 2-3 alt texts naturally.',
                learning: 'Alt text improves accessibility (required by WCAG), provides additional keyword context for SEO, and enables image search traffic.',
                target: '100% of images with descriptive alt text'
            });
        }
        
        if (!analysis.hasMetaViewport) {
            recommendations.push({
                title: '📱 Add Meta Viewport Tag',
                description: 'Your page is missing the viewport meta tag for mobile optimization.',
                priority: 'high',
                action: 'Add `<meta name="viewport" content="width=device-width, initial-scale=1.0">` to your HTML head.',
                learning: 'Pages without viewport tags are not mobile-friendly and rank lower in mobile search results.',
                target: 'Meta viewport tag for mobile optimization'
            });
        }
        
        if (!analysis.hasCanonical) {
            recommendations.push({
                title: '🔗 Add Canonical URL',
                description: 'Your page is missing a canonical URL tag to prevent duplicate content issues.',
                priority: 'medium',
                action: 'Add `<link rel="canonical" href="[your-page-url]" />` to your HTML head.',
                learning: 'Canonical tags prevent duplicate content penalties and consolidate link equity to your preferred URL.',
                target: 'Canonical URL tag'
            });
        }
        
        if (analysis.fleschScore < 60) {
            recommendations.push({
                title: '📖 Improve Readability (Flesch Score)',
                description: `Current Flesch score: ${Math.round(analysis.fleschScore)}. Target: 60-70 for optimal readability.`,
                priority: 'medium',
                action: 'Use shorter sentences (15-18 words average), simpler vocabulary, and more paragraph breaks.',
                learning: 'Content with Flesch scores of 60-70 is accessible to 8th-9th grade readers and has 34% higher engagement.',
                target: 'Flesch Reading Ease score of 60-70'
            });
        }
        
        if (analysis.activeVoicePercentage < 80) {
            recommendations.push({
                title: '✍️ Increase Active Voice Usage',
                description: `Current active voice: ${analysis.activeVoicePercentage}%. Target: 80%+ for better engagement.`,
                priority: 'low',
                action: 'Rewrite passive sentences to use active voice (e.g., "We created" instead of "was created by us").',
                learning: 'Active voice makes content more engaging, direct, and easier to read. Pages with 80%+ active voice have 27% higher time-on-page.',
                target: '80%+ active voice in content'
            });
        }
        
        if (!analysis.ogTitle || !analysis.ogDescription || !analysis.ogImage) {
            recommendations.push({
                title: '📱 Add Open Graph Tags',
                description: 'Missing Open Graph tags for social media sharing.',
                priority: 'medium',
                action: 'Add og:title, og:description, og:image, og:url, and og:type meta tags to your HTML head.',
                learning: 'Open Graph tags control how your content appears when shared on Facebook, LinkedIn, and other social platforms. Proper tags increase social shares by 38%.',
                target: 'Complete Open Graph meta tags'
            });
        }
        
        if (!analysis.twitterCard || !analysis.twitterTitle || !analysis.twitterDescription) {
            recommendations.push({
                title: '🐦 Add Twitter Card Tags',
                description: 'Missing Twitter Card tags for Twitter sharing.',
                priority: 'low',
                action: 'Add twitter:card, twitter:title, twitter:description, twitter:image, and twitter:site meta tags.',
                learning: 'Twitter Cards make your tweets more visually appealing and increase click-through rates by 24%.',
                target: 'Complete Twitter Card meta tags'
            });
        }
        
        const finalRecommendations = recommendations.length > 0 ? recommendations : [{
            title: '🎉 Excellent Work!',
            description: 'Your page meets all GRAAF Framework requirements for top rankings.',
            priority: 'none',
            action: 'Continue creating high-quality content and monitor your rankings. Consider updating quarterly with fresh data.',
            learning: 'Maintaining high SEO standards consistently is key to long-term success in the AI era.',
            target: 'Maintain current quality with quarterly updates'
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
                content: contentScore,
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
                hasSchemaOrg: analysis.hasSchemaOrg,
                hasArticleSchema: analysis.hasArticleSchema,
                hasFAQPageSchema: analysis.hasFAQPageSchema,
                hasOrganizationSchema: analysis.hasOrganizationSchema,
                schemaCount: analysis.schemaCount,
                images: analysis.images,
                imagesWithAlt: analysis.imagesWithAlt,
                internalLinks: analysis.internalLinks.length,
                externalLinks: analysis.externalLinks.length,
                expertQuotes: analysis.expertQuotes.length,
                caseStudies: analysis.caseStudies.length,
                statistics: analysis.statistics.length,
                hasRecentSources: analysis.hasRecentSources,
                sourceCount: analysis.sourceCount,
                faqQuestions: analysis.faqQuestionCount,
                hasDirectAnswerBox: analysis.hasDirectAnswerBox,
                hasTLDR: analysis.hasTLDR,
                hasTableOfContents: analysis.hasTableOfContents,
                hasAuthorBio: analysis.hasAuthorBio,
                authorBioWordCount: analysis.authorBioWordCount,
                hasAuthorCredentials: analysis.hasAuthorCredentials,
                avgParagraphLength: Math.round(analysis.avgParagraphLength),
                avgSentenceLength: Math.round(analysis.avgSentenceLength),
                fleschScore: Math.round(analysis.fleschScore),
                activeVoicePercentage: analysis.activeVoicePercentage,
                keywordDensity: analysis.keywordDensity.toFixed(2),
                keywordCount: analysis.keywordCount,
                hasKeywordInH1: analysis.hasKeywordInH1,
                hasKeywordInFirstH2: analysis.hasKeywordInFirstH2,
                hasKeywordInIntro: analysis.hasKeywordInIntro,
                ogTagsComplete: !!(analysis.ogTitle && analysis.ogDescription && analysis.ogImage),
                twitterTagsComplete: !!(analysis.twitterCard && analysis.twitterTitle && analysis.twitterDescription)
            },
            recommendations: {
                all: finalRecommendations,
                count: finalRecommendations.length
            },
            timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Scan complete: ${scanUrl} - ${totalScore}/100 (${quality})`);
        console.log(`   • GRAAF: ${graafScore}/50 (Content authority & depth)`);
        console.log(`   • CRAFT: ${craftScore}/30 (Structure & readability)`);
        console.log(`   • Technical: ${technicalScore}/20 (Schema, meta tags, accessibility)`);
        console.log(`   • Content: ${contentScore}/100 (Combined quality)`);
        console.log(`   • UX: ${uxScore}/100 (Engagement & usability)`);
        console.log(`   • Keyword Density: ${analysis.keywordDensity.toFixed(2)}%`);
        console.log(`   • Author Bio: ${analysis.hasAuthorBio ? '✅' : '❌'}`);
        console.log(`   • Expert Quotes: ${analysis.expertQuotes.length}`);
        console.log(`   • Case Studies: ${analysis.caseStudies.length}`);
        console.log(`   • Internal Links: ${analysis.internalLinks.length}`);
        console.log(`   • Recommendations: ${finalRecommendations.length}`);
        
        res.json(result);
    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    if (!pool) {
        return res.json({
            success: true,
            entries: [],
            total: 0,
            averageScore: 0,
            stats: { totalAgencies: 0, avgScore: 0, countriesCount: 0, activeHelpers: 0 }
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

app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
    
    try {
        const { id } = req.params;
        const { company_name, url, score, country, city } = req.body;
        console.log(`✏️ Updating leaderboard entry ${id}:`, { company_name, url, score, country, city });
        
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

app.post('/api/admin/leaderboard/manual-add', verifyAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
    
    try {
        const { url, company_name, score, country, city } = req.body;
        if (!url || score === undefined) {
            return res.status(400).json({ success: false, error: 'URL and score are required' });
        }
        console.log(`➕ Manual add leaderboard:`, { url, company_name, score, country, city });
        
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
        console.error('❌ Manual leaderboard add error:', error.message);
        console.error(error.stack);
        res.status(500).json({ success: false, error: error.message });
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
        return res.json({
            success: true,
            stats: {
                total_scans: 0, total_agencies: 0, total_clients: 0, active_helpers: 0,
                leaderboard_entries: 0, pending_freelancers: 0, pending_leaderboard: 0
            }
        });
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
        res.json({
            success: true,
            is_featured: newFeatured,
            message: `Featured ${newFeatured ? 'aangezet' : 'uitgezet'}`
        });
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
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
        timestamp: new Date().toISOString()
    });
});

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
    console.log('🚀  CONTENTSCALE SERVER - PROFESSIONELE SEO SCORING');
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
        console.log('   • API key status endpoint GEFIXED (was 404 error)');
        console.log('   • Google Maps scraper MET MINIMALISTISCHE LOGICA (werkt beter)');
        console.log('   • Debug screenshots bij fouten');
        console.log('   • Country field truncation GEFIXED (max 10 tekens)');
        console.log('   • Leaderboard edit/delete WERKT perfect');
        console.log('   • VOLLEDIGE LINK DETECTIE - interne/externe links correct geteld');
        console.log('   • KEYWORD ANALYSE - Density + Placement (H1, first H2, intro, conclusion)');
        console.log('   • AUTHOR BIO DETECTIE - 200-250 woorden met credentials');
        console.log('   • STATISTICS BRONVERIFICATIE - Jaartal (2023-2025) + bronvermelding');
        console.log('   • DIRECT ANSWER BOX - 40-60 woorden met keyword + bron');
        console.log('   • TL;DR + TABLE OF CONTENTS DETECTIE');
        console.log('   • META TITLE/DESCRIPTION LENGTE - Exact 50-60 / 150-160 karakters');
        console.log('   • SPECIFIEKE SCHEMA TYPES - Article, FAQPage, Organization, BreadcrumbList');
        console.log('   • FAQ ANTWOORD ANALYSE - 100+ woorden, links per antwoord');
        console.log('   • READABILITY METRICS - Flesch score, active voice detectie');
        console.log('   • OPEN GRAPH TAGS - Social media sharing optimization');
        console.log('   • TWITTER CARD TAGS - Twitter sharing optimization');
        console.log('   • GEEN AANBEVELINGSLIMIET - Alle waarde zichtbaar voor gebruikers');
        console.log('');
        console.log('💡 SEO SCORING SYSTEM (GRAAF FRAMEWORK):');
        console.log('   • GRAAF (35%): Content depth, expert quotes, case studies, statistics, keyword, author');
        console.log('   • CRAFT (25%): H1/H2/H3 structuur, leesbaarheid, paragraaf lengte, Flesch, active voice');
        console.log('   • Technical (20%): Schema markup, meta tags, alt text, canonical, social tags');
        console.log('   • UX (20%): Images, videos, internal links, engagement metrics');
        console.log('');
        console.log('📚 AANBEVELINGEN MET LEERPUNTEN:');
        console.log('   • Elke aanbeveling bevat actie + leerdoel + target');
        console.log('   • Prioriteiten: high, medium, low, none');
        console.log('   • GEEN LIMIET op aantal aanbevelingen - volledige waarde zichtbaar');
        console.log('   • Focus op E-E-A-T en AI Overview optimalisatie');
        console.log('');
    });
}

startServer();
