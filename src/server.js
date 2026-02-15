process.env.PGSSLMODE = 'verify-full';
process.env.NODE_NO_WARNINGS = '1';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');
// ✅ CHEERIO - OPTIONAL (fallback als niet beschikbaar)
let cheerio = null;
try {
    cheerio = require('cheerio');
    console.log('✅ Cheerio loaded - using enhanced scanner');
} catch (e) {
    console.log('⚠️ Cheerio not available - using basic scanner (install cheerio for better accuracy)');
}
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

// ==========================================
// SCANNER DETECTION FUNCTIES - GEFIXED ✅
// Alleen gebruikt als Cheerio beschikbaar is
// ==========================================

function detectAuthorBioFixed($) {
    if (!$) return { found: false, wordCount: 0 };
    
    const authorSections = $('section, div').filter(function() {
        const id = $(this).attr('id') || '';
        const className = $(this).attr('class') || '';
        const text = $(this).text().toLowerCase();
        
        const hasKeywords = id.match(/about|author|founder|bio/i) || 
                           className.match(/about|author|founder|bio/i);
        
        const hasCredentials = text.includes('founder') || 
                              text.includes('experience') || 
                              text.includes('years') ||
                              text.includes('specialist') ||
                              text.includes('expert') ||
                              text.includes('certified');
        
        return hasKeywords && hasCredentials;
    });
    
    if (authorSections.length > 0) {
        const bioText = authorSections.first().text().trim();
        const wordCount = bioText.split(/\s+/).length;
        if (wordCount >= 100) {
            return { found: true, wordCount: wordCount };
        }
    }
    
    return { found: false, wordCount: 0 };
}

function detectTableOfContentsFixed($) {
    if (!$) return { found: false, itemCount: 0 };
    
    const tocContainers = $('[id*="toc"], [class*="toc"], [id*="table-of-contents"], [class*="table-of-contents"]');
    if (tocContainers.length > 0) {
        return { found: true, itemCount: tocContainers.find('a').length };
    }
    
    const lists = $('ol, ul');
    for (let i = 0; i < lists.length; i++) {
        const list = lists.eq(i);
        const anchorLinks = list.find('a[href^="#"]');
        if (anchorLinks.length >= 3) {
            return { found: true, itemCount: anchorLinks.length };
        }
    }
    
    const firstList = $('main ol, article ol, .content ol').first();
    if (firstList.length > 0) {
        const items = firstList.find('li');
        if (items.length >= 5) {
            return { found: true, itemCount: items.length };
        }
    }
    
    return { found: false, itemCount: 0 };
}

function countFAQsFixed($) {
    if (!$) return { count: 0, type: 'none' };
    
    let count = $('details').length;
    if (count > 0) return { count: count, type: 'details' };
    
    const faqSchema = $('script[type="application/ld+json"]').filter(function() {
        const content = $(this).html();
        return content && content.includes('"@type":"Question"');
    });
    
    if (faqSchema.length > 0) {
        try {
            const schemaContent = faqSchema.html();
            const matches = schemaContent.match(/"@type"\s*:\s*"Question"/g);
            count = matches ? matches.length : 0;
            if (count > 0) return { count: count, type: 'schema' };
        } catch (e) {}
    }
    
    count = $('.faq-question, .faq-item button').length;
    if (count > 0) return { count: count, type: 'buttons' };
    
    const questionHeadings = $('h3, h4').filter(function() {
        return $(this).text().includes('?');
    });
    count = questionHeadings.length;
    
    return { count: count, type: count > 0 ? 'headings' : 'none' };
}

function calculateFleschScoreFixed(text) {
    const cleanText = text.replace(/<[^>]*>/g, ' ');
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const sentenceCount = (cleanText.match(/[.!?]+/g) || []).length || 1;
    
    let syllableCount = 0;
    for (const word of words) {
        syllableCount += countSyllablesFixed(word.toLowerCase());
    }
    
    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = syllableCount / wordCount;
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    let finalScore = Math.round(score);
    if (finalScore < 0) finalScore = 0;
    if (finalScore > 100) finalScore = 100;
    if (isNaN(finalScore)) finalScore = 50;
    
    return finalScore;
}

function countSyllablesFixed(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

// ============================================
// ENHANCED SCANNER FUNCTIONS - 100% ELITE PROMPT COVERAGE
// ============================================

/**
 * ENHANCED FAQ QUALITY ANALYSIS
 */
function analyzeFAQQuality(faqAnswers) {
    if (!faqAnswers || faqAnswers.length === 0) {
        return {
            total: 0,
            with100Words: 0,
            withRequiredLinks: 0,
            qualityScore: 0,
            averageWordCount: 0,
            averageInternalLinks: 0,
            averageExternalLinks: 0
        };
    }
    
    const with100Words = faqAnswers.filter(f => f.answerWordCount >= 100).length;
    const withRequiredLinks = faqAnswers.filter(f => f.internalLinkCount >= 1 && f.externalLinkCount >= 1).length;
    const qualityScore = Math.round((with100Words + withRequiredLinks) / (faqAnswers.length * 2) * 100);
    
    const totalWords = faqAnswers.reduce((sum, f) => sum + f.answerWordCount, 0);
    const totalInternalLinks = faqAnswers.reduce((sum, f) => sum + f.internalLinkCount, 0);
    const totalExternalLinks = faqAnswers.reduce((sum, f) => sum + f.externalLinkCount, 0);
    
    return {
        total: faqAnswers.length,
        with100Words: with100Words,
        withRequiredLinks: withRequiredLinks,
        qualityScore: qualityScore,
        averageWordCount: Math.round(totalWords / faqAnswers.length),
        averageInternalLinks: Math.round(totalInternalLinks / faqAnswers.length * 10) / 10,
        averageExternalLinks: Math.round(totalExternalLinks / faqAnswers.length * 10) / 10
    };
}

/**
 * ENHANCED EXPERT QUOTE QUALITY ANALYSIS
 */
function analyzeExpertQuoteQuality(expertQuotes) {
    if (!expertQuotes || expertQuotes.length === 0) {
        return {
            total: 0,
            withFullAttribution: 0,
            withOptimalLength: 0,
            qualityScore: 0,
            averageLength: 0
        };
    }
    
    const withFullAttribution = expertQuotes.filter(q => {
        const attr = q.attribution || '';
        const hasName = attr.split(/\s+/).length >= 2;
        const hasTitle = /\b(CEO|CTO|Director|Manager|Founder|President|VP|Chief|Head|Senior|Lead|Specialist|Consultant|Expert|Professor)\b/i.test(attr);
        const hasOrg = attr.split(',').length >= 2 || /\b(at|from|of)\b/i.test(attr);
        return hasName && (hasTitle || hasOrg);
    }).length;
    
    const withOptimalLength = expertQuotes.filter(q => {
        const wordCount = (q.text || '').split(/\s+/).length;
        return wordCount >= 20 && wordCount <= 60;
    }).length;
    
    const qualityScore = Math.round((withFullAttribution + withOptimalLength) / (expertQuotes.length * 2) * 100);
    
    const totalLength = expertQuotes.reduce((sum, q) => sum + (q.text || '').split(/\s+/).length, 0);
    
    return {
        total: expertQuotes.length,
        withFullAttribution: withFullAttribution,
        withOptimalLength: withOptimalLength,
        qualityScore: qualityScore,
        averageLength: Math.round(totalLength / expertQuotes.length)
    };
}

/**
 * ENHANCED CASE STUDY METRICS ANALYSIS
 */
function analyzeCaseStudyMetrics(caseStudies) {
    if (!caseStudies || caseStudies.length === 0) {
        return {
            total: 0,
            withPercentages: 0,
            withCurrency: 0,
            withNumbers: 0,
            withMetrics: 0,
            qualityScore: 0
        };
    }
    
    const withPercentages = caseStudies.filter(c => {
        const text = (c.excerpt || '').toLowerCase();
        return /\d+[%]|\d+\s*percent|increase.*\d+|improve.*\d+|growth.*\d+/.test(text);
    }).length;
    
    const withCurrency = caseStudies.filter(c => {
        const text = c.excerpt || '';
        return /[\$€£]\s*\d+|revenue|roi|savings|cost|profit/.test(text.toLowerCase());
    }).length;
    
    const withNumbers = caseStudies.filter(c => {
        const text = c.excerpt || '';
        return /\b\d{2,}\b|\d+x|\d+\.\d+/.test(text);
    }).length;
    
    const withMetrics = caseStudies.filter(c => {
        const text = (c.excerpt || '').toLowerCase();
        const hasPercentage = /\d+[%]/.test(text);
        const hasCurrency = /[\$€£]/.test(text);
        const hasNumber = /\b\d{2,}\b/.test(text);
        return hasPercentage || hasCurrency || hasNumber;
    }).length;
    
    const qualityScore = withMetrics > 0 ? Math.round(withMetrics / caseStudies.length * 100) : 0;
    
    return {
        total: caseStudies.length,
        withPercentages: withPercentages,
        withCurrency: withCurrency,
        withNumbers: withNumbers,
        withMetrics: withMetrics,
        qualityScore: qualityScore
    };
}

/**
 * KEYWORD IN ALT TEXT ANALYSIS
 */
function analyzeKeywordInAltText(images, keyword) {
    if (!images || images.length === 0 || !keyword) {
        return {
            total: images ? images.length : 0,
            withKeyword: 0,
            percentage: 0,
            isOptimal: false
        };
    }
    
    const keywordLower = keyword.toLowerCase();
    const withKeyword = images.filter(img => {
        const alt = (img.alt || '').toLowerCase();
        return alt.includes(keywordLower);
    }).length;
    
    const percentage = Math.round(withKeyword / images.length * 100);
    const isOptimal = withKeyword >= 2 && withKeyword <= 3;
    
    return {
        total: images.length,
        withKeyword: withKeyword,
        percentage: percentage,
        isOptimal: isOptimal
    };
}

/**
 * OPEN GRAPH COMPLETENESS CHECK
 */
function checkOpenGraphCompleteness(ogData) {
    const required = ['title', 'description', 'image', 'url', 'type'];
    const present = [];
    const missing = [];
    
    required.forEach(field => {
        if (ogData[field] && ogData[field].trim().length > 0) {
            present.push(field);
        } else {
            missing.push(field);
        }
    });
    
    const completeness = Math.round(present.length / required.length * 100);
    const isComplete = missing.length === 0;
    
    return {
        isComplete: isComplete,
        completeness: completeness,
        present: present,
        missing: missing,
        requiredCount: required.length,
        presentCount: present.length
    };
}

/**
 * TWITTER CARD COMPLETENESS CHECK
 */
function checkTwitterCardCompleteness(twitterData) {
    const required = ['card', 'title', 'description', 'image'];
    const present = [];
    const missing = [];
    
    required.forEach(field => {
        if (twitterData[field] && twitterData[field].trim().length > 0) {
            present.push(field);
        } else {
            missing.push(field);
        }
    });
    
    const completeness = Math.round(present.length / required.length * 100);
    const isComplete = missing.length === 0;
    
    return {
        isComplete: isComplete,
        completeness: completeness,
        present: present,
        missing: missing,
        requiredCount: required.length,
        presentCount: present.length
    };
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
        
        // Get HTML for Cheerio analysis
        const html = await page.content();
        
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
                } catch (e) {}
            });
            
            const hasSchemaOrg = schemaScripts.length > 0 || rawHtml.includes('schema.org');
            
            const images = document.querySelectorAll('img');
            const imagesWithAlt = Array.from(images).filter(img =>
                img.hasAttribute('alt') && img.getAttribute('alt').trim().length > 0
            ).length;
            
            // ✅ COLLECT IMAGE ALT TEXT for keyword analysis
            const imageAlts = Array.from(images).map(img => ({
                alt: img.getAttribute('alt') || '',
                src: img.getAttribute('src') || ''
            }));
            
            const baseUrl = new URL(scanUrl);
            const baseDomain = baseUrl.hostname.replace('www.', '');
            
            const internalLinks = [];
            const externalLinks = [];
            
            Array.from(document.querySelectorAll('a[href]')).forEach(link => {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
                
                try {
                    const linkUrl = new URL(href, scanUrl);
                    const linkDomain = linkUrl.hostname.replace('www.', '');
                    
                    if (linkDomain === baseDomain) {
                        internalLinks.push(href);
                    } else {
                        externalLinks.push(href);
                    }
                } catch (e) {}
            });
            
            const expertQuotes = [];
            document.querySelectorAll('blockquote').forEach(blockquote => {
                let quoteText = blockquote.textContent.trim();
                let attribution = '';
                
                const cite = blockquote.querySelector('cite');
                const footer = blockquote.querySelector('footer');
                if (cite) attribution = cite.textContent.trim();
                else if (footer) attribution = footer.textContent.trim();
                
                if (quoteText.length > 20 && attribution.length > 5) {
                    expertQuotes.push({ text: quoteText.substring(0, 100), attribution: attribution });
                }
            });
            
            // ✅ ENHANCED FAQ DETECTION with answer quality
            const faqAnswers = [];
            const questionElements = document.querySelectorAll('h3, h4, details summary, .faq-question');
            
            questionElements.forEach(el => {
                const text = el.textContent;
                if (text.includes('?') && text.length > 10 && text.length < 200) {
                    let answerText = '';
                    let internalLinkCount = 0;
                    let externalLinkCount = 0;
                    
                    if (el.tagName.toLowerCase() === 'summary') {
                        const details = el.closest('details');
                        if (details) {
                            answerText = details.textContent.replace(text, '').trim();
                            
                            const links = details.querySelectorAll('a[href]');
                            links.forEach(a => {
                                try {
                                    const linkUrl = new URL(a.href, scanUrl);
                                    const linkDomain = linkUrl.hostname.replace('www.', '');
                                    if (linkDomain === baseDomain) internalLinkCount++;
                                    else externalLinkCount++;
                                } catch (e) {}
                            });
                        }
                    } else {
                        let next = el.nextElementSibling;
                        let paraCount = 0;
                        
                        while (next && paraCount < 5) {
                            if (next.tagName.toLowerCase() === 'p') {
                                answerText += next.textContent + ' ';
                                paraCount++;
                                
                                const links = next.querySelectorAll('a[href]');
                                links.forEach(a => {
                                    try {
                                        const linkUrl = new URL(a.href, scanUrl);
                                        const linkDomain = linkUrl.hostname.replace('www.', '');
                                        if (linkDomain === baseDomain) internalLinkCount++;
                                        else externalLinkCount++;
                                    } catch (e) {}
                                });
                            } else if (next.tagName.toLowerCase().match(/^h[2-6]$/)) {
                                break;
                            }
                            next = next.nextElementSibling;
                        }
                    }
                    
                    if (answerText.trim().length > 0) {
                        const answerWordCount = answerText.trim().split(/\s+/).length;
                        faqAnswers.push({
                            question: text,
                            answer: answerText.trim().substring(0, 300),
                            answerWordCount: answerWordCount,
                            internalLinkCount: internalLinkCount,
                            externalLinkCount: externalLinkCount
                        });
                    }
                }
            });
            
            const caseStudies = [];
            const caseStudyKeywords = ['case study', 'results', 'roi', 'success story'];
            document.querySelectorAll('section, article, div').forEach(el => {
                const text = el.textContent.toLowerCase();
                if (caseStudyKeywords.some(keyword => text.includes(keyword)) && text.length > 300) {
                    if (/\d+[%$€£]/.test(text) || /\b\d{2,}\b/.test(text)) {
                        caseStudies.push({ excerpt: el.textContent.substring(0, 200) });
                    }
                }
            });
            
            const hasRecentSources = /(?:202[345]|according to|source|study|report)\b/i.test(textContent);
            const sourceCount = (textContent.match(/(?:202[345]|according to|source|study|report)\b/gi) || []).length;
            
            const paragraphs = document.querySelectorAll('p');
            const avgParagraphLength = Array.from(paragraphs)
                .map(p => p.textContent.trim().split(/\s+/).length)
                .reduce((a, b) => a + b, 0) / (paragraphs.length || 1);
            
            const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
            const avgSentenceLength = sentences
                .map(s => s.trim().split(/\s+/).length)
                .reduce((a, b) => a + b, 0) / (sentences.length || 1);
            
            const passiveVoiceCount = (textContent.match(/\b(is|was|were|been|being)\b/gi) || []).length;
            const activeVoicePercentage = passiveVoiceCount > 0 ? 
                Math.round(100 - (passiveVoiceCount / (wordCount / 20))) : 100;
            
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
            
            return {
                url: scanUrl,
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
                imageAlts: imageAlts,
                internalLinks: internalLinks.length,
                externalLinks: externalLinks.length,
                expertQuotes: expertQuotes,
                faqAnswers: faqAnswers,
                caseStudies: caseStudies,
                hasRecentSources: hasRecentSources,
                sourceCount: sourceCount,
                faqQuestionCount: faqQuestionCount,
                hasDirectAnswerBox: hasDirectAnswerBox,
                directAnswerWordCount: directAnswerWordCount,
                hasTLDR: hasTLDR,
                tldrItemCount: tldrItemCount,
                avgParagraphLength: avgParagraphLength,
                avgSentenceLength: avgSentenceLength,
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
        
        // ✅ USE CHEERIO FOR ACCURATE DETECTION (only if available)
        let authorBioFixed = { found: false, wordCount: 0 };
        let tocFixed = { found: false, itemCount: 0 };
        let faqFixed = { count: 0, type: 'none' };
        let fleschFixed = 50;
        
        if (cheerio) {
            const $ = cheerio.load(html);
            authorBioFixed = detectAuthorBioFixed($);
            tocFixed = detectTableOfContentsFixed($);
            faqFixed = countFAQsFixed($);
            fleschFixed = calculateFleschScoreFixed(analysis.textContent);
        } else {
            // Fallback: berekenen zonder cheerio (minder nauwkeurig)
            fleschFixed = calculateFleschScoreFixed(analysis.textContent);
        }
        
        // Update analysis with fixed detections
        analysis.hasAuthorBio = authorBioFixed.found;
        analysis.authorBioWordCount = authorBioFixed.wordCount;
        analysis.hasAuthorCredentials = authorBioFixed.found;
        analysis.hasTableOfContents = tocFixed.found;
        analysis.faqQuestionCount = Math.max(analysis.faqQuestionCount, faqFixed.count);
        analysis.fleschScore = fleschFixed;
        
        // ✅ ENHANCED ANALYSIS - 100% ELITE PROMPT COVERAGE
        const faqQuality = analyzeFAQQuality(analysis.faqAnswers || []);
        const expertQuoteQuality = analyzeExpertQuoteQuality(analysis.expertQuotes || []);
        const caseStudyMetrics = analyzeCaseStudyMetrics(analysis.caseStudies || []);
        
        let keywordInAlt = null;
        if (keyword && analysis.imageAlts) {
            keywordInAlt = analyzeKeywordInAltText(analysis.imageAlts, keyword);
        }
        
        const openGraphCompleteness = checkOpenGraphCompleteness({
            title: analysis.ogTitle,
            description: analysis.ogDescription,
            image: analysis.ogImage,
            url: scanUrl,
            type: 'article'
        });
        
        const twitterCardCompleteness = checkTwitterCardCompleteness({
            card: analysis.twitterCard,
            title: analysis.twitterTitle,
            description: analysis.twitterDescription,
            image: analysis.twitterImage
        });
        
        // Calculate scores
        let graafScore = 0;
        let craftScore = 0;
        let technicalScore = 0;
        let contentScore = 0;
        let uxScore = 0;
        
        if (analysis.wordCount >= 2500) graafScore += 15;
        else if (analysis.wordCount >= 1500) graafScore += 10;
        else if (analysis.wordCount >= 1000) graafScore += 7;
        else if (analysis.wordCount >= 500) graafScore += 4;
        
        if (keyword) {
            if (analysis.keywordDensity >= 0.8 && analysis.keywordDensity <= 1.2) graafScore += 4;
            if (analysis.hasKeywordInH1) graafScore += 2;
            if (analysis.hasKeywordInFirstH2) graafScore += 2;
            if (analysis.hasKeywordInIntro) graafScore += 2;
        }
        
        if (analysis.listItemCount >= 15) graafScore += 8;
        else if (analysis.listItemCount >= 10) graafScore += 6;
        
        if (analysis.h2Count >= 5) graafScore += 7;
        else if (analysis.h2Count >= 3) graafScore += 5;
        
        if (analysis.expertQuotes.length >= 4) graafScore += 8;
        else if (analysis.expertQuotes.length >= 2) graafScore += 5;
        
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
        
        if (analysis.avgSentenceLength >= 12 && analysis.avgSentenceLength <= 20) craftScore += 5;
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
        
        technicalScore = Math.min(20, technicalScore);
        
        contentScore = Math.min(100, graafScore + craftScore);
        
        if (analysis.images >= 5) uxScore += 20;
        else if (analysis.images >= 3) uxScore += 15;
        if (analysis.wordCount >= 2000) uxScore += 25;
        else if (analysis.wordCount >= 1500) uxScore += 20;
        if (analysis.listCount >= 5) uxScore += 15;
        if (analysis.internalLinks >= 10) uxScore += 15;
        else if (analysis.internalLinks >= 5) uxScore += 10;
        if (analysis.externalLinks >= 5) uxScore += 10;
        
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
        
        // ✅ GENERATE ENHANCED RECOMMENDATIONS - 100% ELITE PROMPT COVERAGE
        const recommendations = [];
        
        // ============================================
        // FAQ QUALITY RECOMMENDATIONS
        // ============================================
        
        if (faqQuality.total < 10) {
            recommendations.push({
                title: '❓ Add More FAQ Questions',
                description: `Current: ${faqQuality.total} FAQ questions. Target: 10+.`,
                priority: 'high',
                action: `Add ${10 - faqQuality.total} more FAQ questions with complete 100+ word answers.`,
                learning: 'Pages with 10+ FAQ questions are 4.3x more likely to appear in Google AI Overviews.',
                target: '10+ FAQ questions',
                current: faqQuality.total,
                targetValue: 10
            });
        }
        
        if (faqQuality.total > 0 && faqQuality.with100Words < faqQuality.total) {
            const shortAnswers = faqQuality.total - faqQuality.with100Words;
            recommendations.push({
                title: '📝 Expand FAQ Answers to 100+ Words',
                description: `${shortAnswers} of ${faqQuality.total} FAQ answers under 100 words. Avg: ${faqQuality.averageWordCount} words.`,
                priority: 'high',
                action: `Expand ${shortAnswers} FAQ answers to 100-150 words with details and examples.`,
                learning: 'FAQ answers with 100+ words rank 67% higher and provide complete value.',
                target: '100+ words per FAQ answer'
            });
        }
        
        if (faqQuality.total > 0 && faqQuality.withRequiredLinks < faqQuality.total) {
            const missingLinks = faqQuality.total - faqQuality.withRequiredLinks;
            recommendations.push({
                title: '🔗 Add Links to FAQ Answers',
                description: `${missingLinks} of ${faqQuality.total} FAQ answers missing required links.`,
                priority: 'high',
                action: 'Add 1 internal link + 1 external authoritative link to each FAQ answer.',
                learning: 'FAQ answers with both link types increase engagement by 89%.',
                target: '1 internal + 1 external link per FAQ'
            });
        }
        
        // ============================================
        // EXPERT QUOTE QUALITY RECOMMENDATIONS
        // ============================================
        
        if (expertQuoteQuality.total < 4) {
            recommendations.push({
                title: '💡 Add More Expert Quotes',
                description: `Current: ${expertQuoteQuality.total} expert quotes. Target: 4+.`,
                priority: 'high',
                action: `Add ${4 - expertQuoteQuality.total} expert quotes with full attribution.`,
                learning: 'Content with 4+ expert quotes receives 68% more organic traffic.',
                target: '4+ expert quotes'
            });
        }
        
        if (expertQuoteQuality.total > 0 && expertQuoteQuality.withFullAttribution < expertQuoteQuality.total) {
            const incomplete = expertQuoteQuality.total - expertQuoteQuality.withFullAttribution;
            recommendations.push({
                title: '👤 Add Full Attribution to Quotes',
                description: `${incomplete} of ${expertQuoteQuality.total} quotes lack Name + Title + Organization.`,
                priority: 'high',
                action: 'Include Full Name, Exact Job Title, and Company for each expert quote.',
                learning: 'Quotes with full attribution are 3.4x more credible and improve E-E-A-T.',
                target: 'Full attribution for all quotes'
            });
        }
        
        // ============================================
        // CASE STUDY METRICS RECOMMENDATIONS
        // ============================================
        
        if (caseStudyMetrics.total < 2) {
            recommendations.push({
                title: '📊 Add Case Studies with Metrics',
                description: `Current: ${caseStudyMetrics.total} case studies. Target: 2+.`,
                priority: 'high',
                action: 'Add case studies with specific metrics: %, $, or concrete numbers.',
                learning: 'Case studies with metrics convert 4.2x better than generic examples.',
                target: '2+ case studies with metrics'
            });
        }
        
        if (caseStudyMetrics.total > 0 && caseStudyMetrics.withMetrics < caseStudyMetrics.total) {
            const withoutMetrics = caseStudyMetrics.total - caseStudyMetrics.withMetrics;
            recommendations.push({
                title: '📈 Add Metrics to Case Studies',
                description: `${withoutMetrics} of ${caseStudyMetrics.total} case studies lack specific metrics.`,
                priority: 'high',
                action: 'Add percentages, currency amounts, or specific numbers to each case study.',
                learning: 'Case studies with metrics are 5.7x more persuasive.',
                target: 'Metrics in all case studies'
            });
        }
        
        // ============================================
        // KEYWORD IN ALT TEXT RECOMMENDATIONS
        // ============================================
        
        if (keyword && keywordInAlt && keywordInAlt.total >= 3 && !keywordInAlt.isOptimal) {
            if (keywordInAlt.withKeyword === 0) {
                recommendations.push({
                    title: '🖼️ Add Keyword to Image ALT Text',
                    description: `0 of ${keywordInAlt.total} images have keyword "${keyword}" in ALT text.`,
                    priority: 'medium',
                    action: `Add keyword to ALT text of 2-3 relevant images (not all!).`,
                    learning: 'Images with keyword in ALT improve topical relevance by 34%.',
                    target: 'Keyword in 2-3 ALT texts'
                });
            } else if (keywordInAlt.withKeyword === 1) {
                recommendations.push({
                    title: '🖼️ Add Keyword to More Images',
                    description: `Only 1 of ${keywordInAlt.total} images has keyword in ALT.`,
                    priority: 'low',
                    action: 'Add keyword to 1-2 more image ALT texts where natural.',
                    learning: 'Optimal: 2-3 images with keyword in ALT text.',
                    target: '2-3 images with keyword'
                });
            } else if (keywordInAlt.withKeyword > 5) {
                recommendations.push({
                    title: '⚠️ Reduce Keyword in ALT Text',
                    description: `${keywordInAlt.withKeyword} images have keyword - may appear as stuffing.`,
                    priority: 'low',
                    action: 'Reduce to only 2-3 most relevant images.',
                    learning: 'Excessive keyword in ALT can trigger over-optimization penalties.',
                    target: 'Only 2-3 images with keyword'
                });
            }
        }
        
        // ============================================
        // OPEN GRAPH & TWITTER COMPLETENESS
        // ============================================
        
        if (!openGraphCompleteness.isComplete) {
            recommendations.push({
                title: '📱 Complete Open Graph Tags',
                description: `Open Graph ${openGraphCompleteness.completeness}% complete. Missing: ${openGraphCompleteness.missing.join(', ')}.`,
                priority: 'medium',
                action: `Add missing tags: ${openGraphCompleteness.missing.map(m => `og:${m}`).join(', ')}.`,
                learning: 'Complete OG tags increase social shares by 38%.',
                target: 'All 5 OG tags present'
            });
        }
        
        if (!twitterCardCompleteness.isComplete) {
            recommendations.push({
                title: '🐦 Complete Twitter Card Tags',
                description: `Twitter Cards ${twitterCardCompleteness.completeness}% complete. Missing: ${twitterCardCompleteness.missing.join(', ')}.`,
                priority: 'low',
                action: `Add missing tags: ${twitterCardCompleteness.missing.map(m => `twitter:${m}`).join(', ')}.`,
                learning: 'Complete Twitter Cards make tweets 24% more clickable.',
                target: 'All 4 Twitter tags present'
            });
        }
        
        // ============================================
        // BASIC RECOMMENDATIONS (always run)
        // ============================================
        
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
        }
        
        if (analysis.wordCount < 1500) {
            recommendations.push({
                title: '📝 Improve Content Length',
                description: `Current: ${analysis.wordCount} words. Target: 2,500+ words.`,
                priority: analysis.wordCount < 500 ? 'high' : 'medium',
                action: 'Expand content with detailed explanations, examples, case studies, and actionable advice.',
                learning: 'Pages with 2,500+ words rank 3.7x higher on average.',
                target: '2,500+ words minimum'
            });
        }
        
        if (!analysis.hasAuthorBio) {
            recommendations.push({
                title: '✍️ Add Author Bio with Credentials',
                description: 'Your page is missing an author bio. This is critical for E-E-A-T signals.',
                priority: 'high',
                action: 'Add a 200-250 word author bio with credentials, experience, certifications, and notable achievements.',
                learning: 'Pages with author bios receive 56% more trust signals and rank 38 positions higher on average.',
                target: '200-250 word author bio with credentials'
            });
        }
        
        if (analysis.expertQuotes.length < 4) {
            recommendations.push({
                title: '💡 Add Expert Quotes for Authority',
                description: `Current: ${analysis.expertQuotes.length} expert quotes. Target: 4+.`,
                priority: 'high',
                action: 'Include 4+ direct quotes from industry experts with full name, title, and organization.',
                learning: 'Content with expert quotes receives 68% more organic traffic.',
                target: '4+ expert quotes with full attribution'
            });
        }
        
        if (analysis.h1Count === 0) {
            recommendations.push({
                title: '🏷️ Missing H1 Tag',
                description: 'Every page must have exactly one H1 tag.',
                priority: 'high',
                action: 'Add a single, descriptive H1 tag that includes your main keyword.',
                learning: 'Missing H1s correlate with 28% lower rankings.',
                target: '1 H1 tag per page'
            });
        }
        
        if (!analysis.hasArticleSchema) {
            recommendations.push({
                title: '🔍 Add Article Schema',
                description: 'Missing Article schema markup required for rich snippets.',
                priority: 'high',
                action: 'Implement Article schema in JSON-LD format.',
                learning: 'Article schema increases rich snippet appearance by 30% and AI Overview inclusion by 3.2x.',
                target: 'Complete Article schema markup'
            });
        }
        
        if (!analysis.hasFAQPageSchema && analysis.faqQuestionCount < 10) {
            recommendations.push({
                title: '❓ Add FAQ Section with 10+ Questions',
                description: `Current: ${analysis.faqQuestionCount} FAQ questions. Target: 10+.`,
                priority: 'high',
                action: 'Create a dedicated FAQ section with 10+ questions with 100+ word answers.',
                learning: 'FAQ sections increase time on page by 89 seconds on average.',
                target: '10+ FAQ questions with 100+ word answers'
            });
        }
        
        if (analysis.metaDescriptionLength < 150 || analysis.metaDescriptionLength > 160) {
            recommendations.push({
                title: '📝 Optimize Meta Description Length',
                description: `Current: ${analysis.metaDescriptionLength} characters. Target: 150-160.`,
                priority: 'medium',
                action: 'Adjust meta description to exactly 150-160 characters.',
                learning: 'Meta descriptions between 150-160 characters have 18% higher CTR.',
                target: '150-160 character meta description'
            });
        }
        
        if (!analysis.hasDirectAnswerBox) {
            recommendations.push({
                title: '🎯 Add Direct Answer Box',
                description: `Current: ${analysis.directAnswerWordCount} words in first paragraph. Target: 40-60.`,
                priority: 'high',
                action: 'Create a 40-60 word direct answer in your first paragraph.',
                learning: 'Direct answers of 40-60 words are 4.3x more likely to appear in AI Overviews.',
                target: '40-60 word direct answer with keyword'
            });
        }
        
        if (!analysis.hasTLDR) {
            recommendations.push({
                title: '📌 Add TL;DR Section',
                description: `Current: ${analysis.tldrItemCount} bullet points. Target: 5.`,
                priority: 'medium',
                action: 'Add a TL;DR section with exactly 5 bullet points.',
                learning: 'TL;DR sections increase content consumption by 47%.',
                target: '5 bullet point TL;DR with sources'
            });
        }
        
        if (!analysis.hasTableOfContents) {
            recommendations.push({
                title: '📋 Add Table of Contents',
                description: 'Your page is missing a table of contents.',
                priority: 'low',
                action: 'Add a table of contents with clickable anchor links to all major H2 sections.',
                learning: 'Table of contents improves user navigation and reduces bounce rate by 15%.',
                target: 'Clickable table of contents'
            });
        }
        
        if (analysis.fleschScore < 60) {
            recommendations.push({
                title: '📖 Improve Readability (Flesch Score)',
                description: `Current Flesch score: ${Math.round(analysis.fleschScore)}. Target: 60-70.`,
                priority: 'medium',
                action: 'Use shorter sentences (15-18 words average), simpler vocabulary.',
                learning: 'Content with Flesch scores of 60-70 has 34% higher engagement.',
                target: 'Flesch Reading Ease score of 60-70'
            });
        }
        
        const finalRecommendations = recommendations.length > 0 ? recommendations : [{
            title: '🎉 Excellent Work!',
            description: 'Your page meets all GRAAF Framework requirements.',
            priority: 'none',
            action: 'Continue creating high-quality content.',
            learning: 'Maintaining high SEO standards consistently is key to long-term success.',
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
                content: contentScore,
                ux: uxScore
            },
            content_stats: {
                wordCount: analysis.wordCount,
                h1Count: analysis.h1Count,
                h2Count: analysis.h2Count,
                h3Count: analysis.h3Count,
                hasAuthorBio: analysis.hasAuthorBio,
                authorBioWordCount: analysis.authorBioWordCount,
                hasTOC: analysis.hasTableOfContents,
                faqCount: analysis.faqQuestionCount,
                expertQuotes: analysis.expertQuotes.length,
                fleschScore: Math.round(analysis.fleschScore),
                metaTitleLength: analysis.metaTitleLength,
                metaDescriptionLength: analysis.metaDescriptionLength,
                hasArticleSchema: analysis.hasArticleSchema,
                hasFAQPageSchema: analysis.hasFAQPageSchema,
                internalLinks: analysis.internalLinks,
                externalLinks: analysis.externalLinks,
                images: analysis.images,
                imagesWithAlt: analysis.imagesWithAlt,
                hasMetaViewport: analysis.hasMetaViewport,
                hasCanonical: analysis.hasCanonical,
                hasSchemaOrg: analysis.hasSchemaOrg,
                caseStudies: analysis.caseStudies.length,
                hasRecentSources: analysis.hasRecentSources,
                sourceCount: analysis.sourceCount,
                hasDirectAnswerBox: analysis.hasDirectAnswerBox,
                hasTLDR: analysis.hasTLDR,
                avgParagraphLength: Math.round(analysis.avgParagraphLength),
                avgSentenceLength: Math.round(analysis.avgSentenceLength),
                activeVoicePercentage: analysis.activeVoicePercentage,
                keywordDensity: analysis.keywordDensity.toFixed(2),
                keywordCount: analysis.keywordCount,
                hasKeywordInH1: analysis.hasKeywordInH1,
                hasKeywordInFirstH2: analysis.hasKeywordInFirstH2,
                hasKeywordInIntro: analysis.hasKeywordInIntro,
                ogTagsComplete: !!(analysis.ogTitle && analysis.ogDescription && analysis.ogImage),
                twitterTagsComplete: !!(analysis.twitterCard && analysis.twitterTitle && analysis.twitterDescription),
                // ✅ ENHANCED QUALITY METRICS
                faqQuality: faqQuality,
                expertQuoteQuality: expertQuoteQuality,
                caseStudyMetrics: caseStudyMetrics,
                keywordInAlt: keywordInAlt,
                openGraphComplete: openGraphCompleteness.isComplete,
                openGraphCompleteness: openGraphCompleteness.completeness,
                twitterCardComplete: twitterCardCompleteness.isComplete,
                twitterCardCompleteness: twitterCardCompleteness.completeness
            },
            recommendations: {
                all: finalRecommendations,
                count: finalRecommendations.length
            },
            timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Scan complete: ${scanUrl} - ${totalScore}/100 (${quality})`);
        console.log(`   • GRAAF: ${graafScore}/50`);
        console.log(`   • CRAFT: ${craftScore}/30`);
        console.log(`   • Technical: ${technicalScore}/20`);
        console.log(`   • Scanner Mode: ${cheerio ? 'Enhanced ✅' : 'Basic ⚠️'}`);
        console.log(`   • Author Bio: ${analysis.hasAuthorBio ? '✅' : '❌'}`);
        console.log(`   • TOC: ${analysis.hasTableOfContents ? '✅' : '❌'}`);
        console.log(`   • FAQ Count: ${analysis.faqQuestionCount}`);
        if (faqQuality.total > 0) {
            console.log(`   • FAQ Quality: ${faqQuality.qualityScore}% (${faqQuality.with100Words}/${faqQuality.total} with 100+ words)`);
        }
        if (expertQuoteQuality.total > 0) {
            console.log(`   • Expert Quote Quality: ${expertQuoteQuality.qualityScore}% (${expertQuoteQuality.withFullAttribution}/${expertQuoteQuality.total} with full attribution)`);
        }
        if (caseStudyMetrics.total > 0) {
            console.log(`   • Case Study Metrics: ${caseStudyMetrics.qualityScore}% (${caseStudyMetrics.withMetrics}/${caseStudyMetrics.total} with metrics)`);
        }
        if (keywordInAlt && keywordInAlt.total > 0) {
            console.log(`   • Keyword in ALT: ${keywordInAlt.withKeyword}/${keywordInAlt.total} images (${keywordInAlt.isOptimal ? '✅ optimal' : '⚠️'})`);
        }
        console.log(`   • Flesch: ${Math.round(analysis.fleschScore)}`);
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
        if (cheerio) {
            console.log('✅ SCANNER MODE: ENHANCED (100% ELITE PROMPT Coverage)');
            console.log('   • ✅ Author Bio Detection (herkent credentials + word count)');
            console.log('   • ✅ TOC Detection (numbered lists + anchor links)');
            console.log('   • ✅ FAQ Count (accurate counting per type)');
            console.log('   • ✅ FAQ Quality Analysis (answer length + links per FAQ)');
            console.log('   • ✅ Expert Quote Quality (full attribution detection)');
            console.log('   • ✅ Case Study Metrics (%, $, ROI detection)');
            console.log('   • ✅ Keyword in ALT Text (2-3 images optimal)');
            console.log('   • ✅ Open Graph Completeness (all 5 tags check)');
            console.log('   • ✅ Twitter Card Completeness (all 4 tags check)');
            console.log('   • ✅ Flesch Score (valid range 0-100)');
        } else {
            console.log('⚠️ SCANNER MODE: Basic (install cheerio for enhanced accuracy)');
            console.log('   • ⚠️ Author Bio Detection: Basic (install cheerio for fixes)');
            console.log('   • ⚠️ TOC Detection: Basic (install cheerio for fixes)');
            console.log('   • ⚠️ FAQ Count: Basic (install cheerio for fixes)');
            console.log('   • ✅ Flesch Score: Fixed (valid range 0-100)');
            console.log('   • 💡 Run: npm install cheerio (for 100% ELITE coverage)');
        }
        console.log('');
        console.log('💡 SEO SCORING SYSTEM (GRAAF FRAMEWORK):');
        console.log('   • GRAAF (35%): Content depth, expert quotes, case studies');
        console.log('   • CRAFT (25%): Structure, readability, Flesch score');
        console.log('   • Technical (20%): Schema, meta tags, accessibility');
        console.log('   • UX (20%): Images, links, engagement');
        console.log('');
        console.log('🎯 EXPECTED RESULTS FOR CONTENTSCALE.SITE:');
        console.log('   • Author Bio: ✅ FOUND (was ❌)');
        console.log('   • TOC: ✅ FOUND (was ❌)');
        console.log('   • FAQ Count: 4 (was 5)');
        console.log('   • Flesch: 50-70 (was -88)');
        console.log('');
    });
}

startServer();
