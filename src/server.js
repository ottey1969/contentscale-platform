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
const nodemailer = require('nodemailer');
const axios = require('axios'); // Voor WHOIS API calls
const sgMail = require('@sendgrid/mail'); // Sendgrid

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📊 Database URL:', process.env.DATABASE_URL ? '✅ GEVONDEN' : '❌ NIET GEVONDEN');

let dbConfig;
let pool;

// Email configuratie (gebruik environment variables voor productie)
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
};

// Maak email transporter voor systeem emails (leaderboard felicitaties)
let emailTransporter = null;
try {
  emailTransporter = nodemailer.createTransport(emailConfig);
  console.log('📧 Email transporter geconfigureerd');
} catch (e) {
  console.error('❌ Email configuratie error:', e.message);
}

// ==========================================
// NIEUW: SENDGRID + QUEUE SYSTEEM (FASE 4)
// ==========================================

// Queue processing status
let queueActive = false;
let queueInterval = null;
const DAILY_LIMIT = 100;

// Helper functie om e-mails te versturen via Sendgrid
async function sendEmailViaSendgrid(apiKey, to, subject, html) {
  try {
    sgMail.setApiKey(apiKey);
    const msg = {
      to: to,
      from: 'noreply@contentscale.site', // Moet geverifieerd zijn in Sendgrid
      subject: subject,
      html: html
    };
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('❌ Sendgrid error:', error.message);
    return { success: false, error: error.message };
  }
}

// Helper voor WHOIS email lookup
async function findEmailViaWhois(domain) {
  try {
    // Gebruik een WHOIS API (bijv. whoisxmlapi.com)
    const response = await axios.get(`https://www.whoisxmlapi.com/whoisserver/WhoisService`, {
      params: {
        apiKey: process.env.WHOIS_API_KEY || 'demo',
        domainName: domain,
        outputFormat: 'JSON'
      }
    });
    
    // Parse response voor email
    const data = response.data;
    if (data.WhoisRecord && data.WhoisRecord.registrant && data.WhoisRecord.registrant.email) {
      return { email: data.WhoisRecord.registrant.email, method: 'whois' };
    }
    
    // Zoek in contact emails
    if (data.WhoisRecord && data.WhoisRecord.contactEmail) {
      return { email: data.WhoisRecord.contactEmail, method: 'whois' };
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️ WHOIS lookup failed for ${domain}:`, error.message);
    return null;
  }
}

// Helper voor contact pagina crawling
async function findEmailViaContactPage(website) {
  try {
    const browser = await getBrowser();
    if (!browser) return null;
    
    const page = await browser.newPage();
    await page.setDefaultTimeout(5000);
    
    // Probeer /contact en /about paginas
    const urlsToTry = [
      website,
      website.replace(/\/$/, '') + '/contact',
      website.replace(/\/$/, '') + '/contact-us',
      website.replace(/\/$/, '') + '/about',
      website.replace(/\/$/, '') + '/about-us',
      website.replace(/\/$/, '') + '/impressum'
    ];
    
    for (const url of urlsToTry) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 3000 });
        const content = await page.content();
        
        // Zoek naar email patronen
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = content.match(emailRegex);
        
        if (emails && emails.length > 0) {
          // Filter out common false positives
          const validEmail = emails.find(e => 
            !e.includes('example.com') && 
            !e.includes('domain.com') &&
            !e.includes('@yoursite') &&
            e.split('@')[1].split('.').length >= 2
          );
          
          if (validEmail) {
            await page.close();
            return { email: validEmail, method: 'contact_page' };
          }
        }
      } catch (e) {
        // Negeer fouten, probeer volgende URL
      }
    }
    
    await page.close();
    return null;
  } catch (error) {
    console.log(`⚠️ Contact page crawl failed:`, error.message);
    return null;
  }
}

// Helper om domein uit URL te halen
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '');
  } catch {
    return null;
  }
}

// Queue processor
async function processEmailQueue() {
  if (!pool || !queueActive) return;
  
  try {
    // Check vandaag's limiet voor elke gebruiker
    const today = new Date().toISOString().split('T')[0];
    
    // Haal pending emails op
    const pendingEmails = await pool.query(
      `SELECT eq.*, f.name as freelancer_name, f.email as freelancer_email, 
              s.api_key_encrypted, gml.name as lead_name, gml.website
       FROM email_queue eq
       JOIN freelancers f ON eq.user_id = f.id
       JOIN sendgrid_config s ON s.freelancer_id = f.id
       JOIN google_maps_leads gml ON eq.lead_id = gml.id
       WHERE eq.status = 'pending' 
         AND (eq.scheduled_for <= NOW() OR eq.scheduled_for IS NULL)
       ORDER BY eq.created_at ASC
       LIMIT 10`, // Verwerk in batches
    );
    
    if (pendingEmails.rows.length === 0) {
      return;
    }
    
    // Group by user voor limiet check
    const byUser = {};
    pendingEmails.rows.forEach(row => {
      if (!byUser[row.user_id]) {
        byUser[row.user_id] = [];
      }
      byUser[row.user_id].push(row);
    });
    
    for (const [userId, emails] of Object.entries(byUser)) {
      // Check hoeveel er vandaag al verstuurd zijn
      const sentToday = await pool.query(
        `SELECT COUNT(*) as count FROM email_queue 
         WHERE user_id = $1 AND status = 'sent' AND DATE(sent_at) = $2`,
        [userId, today]
      );
      
      const sentCount = parseInt(sentToday.rows[0].count);
      const remaining = DAILY_LIMIT - sentCount;
      
      if (remaining <= 0) {
        console.log(`⏸️ User ${userId} has reached daily limit (${DAILY_LIMIT})`);
        continue;
      }
      
      // Verwerk alleen zoveel als de limiet toestaat
      const toProcess = emails.slice(0, remaining);
      
      for (const email of toProcess) {
        try {
          // Decrypt API key (in productie gebruik je echte encryptie)
          const apiKey = email.api_key_encrypted; // Simpele versie
          
          // Stuur email
          const subject = `SEO Opportunity for ${email.lead_name}`;
          const html = `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Hi ${email.lead_name},</h2>
              <p>We analyzed your website ${email.website} and found opportunities to improve your SEO score.</p>
              <p>Would you like a free consultation?</p>
              <p>Best regards,<br>${email.freelancer_name}</p>
            </div>
          `;
          
          const result = await sendEmailViaSendgrid(apiKey, email.recipient_email, subject, html);
          
          if (result.success) {
            await pool.query(
              `UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
              [email.id]
            );
            console.log(`✅ Email sent to ${email.recipient_email}`);
          } else {
            await pool.query(
              `UPDATE email_queue SET status = 'failed', error_message = $2, retry_count = retry_count + 1 WHERE id = $1`,
              [email.id, result.error]
            );
          }
        } catch (error) {
          console.error('❌ Queue processing error:', error.message);
          await pool.query(
            `UPDATE email_queue SET status = 'failed', error_message = $2, retry_count = retry_count + 1 WHERE id = $1`,
            [email.id, error.message]
          );
        }
        
        // Kleine vertraging tussen emails
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
  } catch (error) {
    console.error('❌ Queue processor error:', error.message);
  }
}

// Start queue processor
function startQueueProcessor() {
  if (queueInterval) clearInterval(queueInterval);
  queueActive = true;
  queueInterval = setInterval(processEmailQueue, 60000); // Elke minuut
  console.log('▶️ Email queue processor started');
}

// Stop queue processor
function stopQueueProcessor() {
  queueActive = false;
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
  console.log('⏸️ Email queue processor stopped');
}

// Helper functie om systeem e-mails te versturen (voor leaderboard)
async function sendEmail(to, subject, html) {
  if (!emailTransporter) {
    console.error('❌ Email transporter niet beschikbaar');
    return false;
  }
  
  try {
    const info = await emailTransporter.sendMail({
      from: `"ContentScale" <${emailConfig.auth.user}>`,
      to: to,
      subject: subject,
      html: html
    });
    console.log(`✅ Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    return false;
  }
}

// Helper om share code te genereren
function generateShareCode(url, id) {
  const hash = crypto.createHash('sha256')
    .update(url + id + Date.now().toString())
    .digest('hex')
    .substring(0, 12);
  return hash;
}

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

const publicPath = process.env.NODE_ENV === 'production' 
  ? path.join(process.cwd(), 'public')
  : path.join(__dirname, 'public');

app.use(express.static(publicPath, {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  immutable: true
}));

app.use('/uploads', express.static(path.join(publicPath, 'uploads')));

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
        admin_verified BOOLEAN DEFAULT FALSE,
        auto_detected_country VARCHAR(100),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        share_code VARCHAR(64) UNIQUE,
        email_sent_at TIMESTAMP,
        contact_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_shares (
        id SERIAL PRIMARY KEY,
        leaderboard_id INTEGER REFERENCES leaderboard(id) ON DELETE CASCADE,
        share_code VARCHAR(64) NOT NULL,
        shared_via VARCHAR(50),
        clicked_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(50),
        user_agent TEXT
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
        email VARCHAR(255),
        email_status VARCHAR(50) DEFAULT 'pending',
        email_found_at TIMESTAMP,
        email_method VARCHAR(50),
        status VARCHAR(50) DEFAULT 'new',
        notes TEXT,
        contacted_at TIMESTAMP,
        converted_at TIMESTAMP,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS google_maps_scan_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        maps_url TEXT NOT NULL,
        search_query VARCHAR(500),
        scanned_at TIMESTAMP DEFAULT NOW(),
        next_scan_allowed_at TIMESTAMP DEFAULT NOW() + INTERVAL '5 days',
        ip_address VARCHAR(50),
        user_agent TEXT
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scan_sessions_session_id 
      ON google_maps_scan_sessions(session_id)
    `);
    
    // ==========================================
    // NIEUWE TABELLEN VOOR FASE 4
    // ==========================================
    
    // Sendgrid configuratie per freelancer
    await client.query(`
      CREATE TABLE IF NOT EXISTS sendgrid_config (
        id SERIAL PRIMARY KEY,
        freelancer_id INTEGER UNIQUE REFERENCES freelancers(id) ON DELETE CASCADE,
        api_key_encrypted TEXT NOT NULL,
        daily_limit INTEGER DEFAULT 100,
        emails_sent_today INTEGER DEFAULT 0,
        last_sent_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Email queue voor bulk verzending
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES freelancers(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES google_maps_leads(id) ON DELETE CASCADE,
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255),
        subject TEXT NOT NULL,
        template_name VARCHAR(100) DEFAULT 'default',
        status VARCHAR(50) DEFAULT 'pending',
        scheduled_for TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Email templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES freelancers(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Email finder log
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_finder_log (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES google_maps_leads(id) ON DELETE CASCADE,
        domain VARCHAR(255),
        email_found VARCHAR(255),
        method VARCHAR(50),
        confidence INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Indexen voor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
      CREATE INDEX IF NOT EXISTS idx_email_queue_user ON email_queue(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON google_maps_leads(email_status);
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

// ==========================================
// GOOGLE MAPS SCRAPE MET 5 DAGEN LIMIET
// ==========================================
app.post('/api/google-maps/scrape', async (req, res) => {
  try {
    const { url, maxResults = 20 } = req.body;
    if (!url || !url.includes('google.com/maps')) {
      return res.status(400).json({ success: false, error: 'Invalid Google Maps URL' });
    }
    
    // Genereer session ID van IP + User Agent (anoniem)
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const sessionId = crypto
      .createHash('sha256')
      .update(ipAddress + userAgent)
      .digest('hex')
      .substring(0, 32);
    
    console.log(`🗺️ Google Maps scrape attempt - Session: ${sessionId.substring(0, 8)}...`);
    
    // Check 5 dagen limiet (alleen als pool bestaat)
    if (pool) {
      try {
        const lastScan = await pool.query(
          `SELECT next_scan_allowed_at FROM google_maps_scan_sessions 
           WHERE session_id = $1 
           ORDER BY scanned_at DESC 
           LIMIT 1`,
          [sessionId]
        );
        
        if (lastScan.rows.length > 0) {
          const nextAllowedAt = new Date(lastScan.rows[0].next_scan_allowed_at);
          const now = new Date();
          
          if (now < nextAllowedAt) {
            const daysRemaining = Math.ceil((nextAllowedAt - now) / (1000 * 60 * 60 * 24));
            const hoursRemaining = Math.ceil((nextAllowedAt - now) / (1000 * 60 * 60));
            
            return res.status(429).json({
              success: false,
              error: 'Scan limit reached',
              message: `You can scan again in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`,
              next_allowed_at: nextAllowedAt,
              days_remaining: daysRemaining,
              hours_remaining: hoursRemaining,
              limit_days: 5
            });
          }
        }
      } catch (dbError) {
        console.error('DB scan limit check error:', dbError.message);
        // Doorgaan zonder limiet als DB error
      }
    }
    
    console.log(`🗺️ Starting scrape: ${url}`);
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
    
    // Sla de scan sessie op in database
    if (pool) {
      try {
        // Extract search query from URL for better tracking
        let searchQuery = '';
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/');
          if (pathParts.includes('search')) {
            const searchIndex = pathParts.indexOf('search');
            if (searchIndex + 1 < pathParts.length) {
              searchQuery = decodeURIComponent(pathParts[searchIndex + 1].replace(/\+/g, ' '));
            }
          }
        } catch (e) {}
        
        await pool.query(
          `INSERT INTO google_maps_scan_sessions 
           (session_id, maps_url, search_query, ip_address, user_agent, scanned_at, next_scan_allowed_at) 
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '5 days')`,
          [sessionId, url, searchQuery, ipAddress, userAgent]
        );
        console.log(`✅ Scan session saved - next scan allowed: ${new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString()}`);
      } catch (dbError) {
        console.error('DB scan session save error:', dbError.message);
      }
    }
    
    // Sla leads op in database
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
            `INSERT INTO google_maps_leads (name, category, website, phone, address, rating, reviews, score, status, email_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [lead.name, lead.category, verifiedWebsite, lead.phone, lead.address, lead.rating, lead.reviews, websiteScore, lead.status, 'pending']
          );
          
          savedLeads.push({ 
            ...lead, 
            website: verifiedWebsite, 
            score: websiteScore, 
            id: result.rows[0].id,
            email_status: 'pending'
          });
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
      },
      scan_limit: {
        days: 5,
        next_allowed_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      }
    });
    
  } catch (error) {
    console.error('Google Maps scrape error:', error);
    res.status(500).json({ success: false, error: 'Failed to scrape Google Maps: ' + error.message });
  }
});

// ==========================================
// NIEUWE SENDGRID ENDPOINTS (FASE 4)
// ==========================================

// Sendgrid configuratie opslaan
app.post('/api/sendgrid/configure', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  // In productie haal je de freelancer ID uit de sessie
  // Voor nu gebruiken we een header of query param
  const freelancerId = req.headers['x-freelancer-id'] || 1; // Simpele versie
  
  const { api_key } = req.body;
  if (!api_key) {
    return res.status(400).json({ success: false, error: 'API key required' });
  }
  
  try {
    // Check of freelancer bestaat
    const freelancer = await pool.query(
      `SELECT id FROM freelancers WHERE id = $1 AND is_approved = TRUE`,
      [freelancerId]
    );
    
    if (freelancer.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Freelancer not found or not approved' });
    }
    
    // Simpele encryptie (in productie gebruik je echte encryptie)
    const encryptedKey = api_key; // TODO: echte encryptie
    
    // UPSERT: insert of update
    await pool.query(
      `INSERT INTO sendgrid_config (freelancer_id, api_key_encrypted, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (freelancer_id) 
       DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = NOW()`,
      [freelancerId, encryptedKey]
    );
    
    res.json({ success: true, message: 'Sendgrid configuration saved' });
    
  } catch (error) {
    console.error('Sendgrid configure error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sendgrid status ophalen
app.get('/api/sendgrid/status', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const freelancerId = req.headers['x-freelancer-id'] || 1;
  
  try {
    // Check of Sendgrid geconfigureerd is
    const config = await pool.query(
      `SELECT * FROM sendgrid_config WHERE freelancer_id = $1`,
      [freelancerId]
    );
    
    const configured = config.rows.length > 0;
    
    // Haal queue status op
    const today = new Date().toISOString().split('T')[0];
    const pending = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE user_id = $1 AND status = 'pending'`,
      [freelancerId]
    );
    
    const sentToday = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE user_id = $1 AND status = 'sent' AND DATE(sent_at) = $2`,
      [freelancerId, today]
    );
    
    res.json({
      success: true,
      configured: configured,
      queue_active: queueActive,
      pending: parseInt(pending.rows[0].count),
      sent_today: parseInt(sentToday.rows[0].count),
      daily_limit: DAILY_LIMIT
    });
    
  } catch (error) {
    console.error('Sendgrid status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test Sendgrid configuratie
app.post('/api/sendgrid/test', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const freelancerId = req.headers['x-freelancer-id'] || 1;
  
  try {
    const config = await pool.query(
      `SELECT * FROM sendgrid_config WHERE freelancer_id = $1`,
      [freelancerId]
    );
    
    if (config.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Sendgrid not configured' });
    }
    
    const apiKey = config.rows[0].api_key_encrypted;
    
    // Stuur test email naar freelancer's eigen email
    const freelancer = await pool.query(
      `SELECT email FROM freelancers WHERE id = $1`,
      [freelancerId]
    );
    
    if (freelancer.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Freelancer not found' });
    }
    
    const result = await sendEmailViaSendgrid(
      apiKey,
      freelancer.rows[0].email,
      'Test Email from ContentScale',
      '<h1>Test</h1><p>Your Sendgrid configuration is working!</p>'
    );
    
    if (result.success) {
      res.json({ success: true, message: 'Test email sent' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Sendgrid test error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// EMAIL FINDER ENDPOINTS (FASE 4)
// ==========================================

// Vind email voor 1 lead
app.post('/api/leads/:id/find-email', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const { id } = req.params;
  
  try {
    // Haal lead op
    const leadResult = await pool.query(
      `SELECT * FROM google_maps_leads WHERE id = $1`,
      [id]
    );
    
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    
    const lead = leadResult.rows[0];
    
    if (!lead.website) {
      return res.json({ success: false, error: 'No website to search' });
    }
    
    const domain = extractDomain(lead.website);
    if (!domain) {
      return res.json({ success: false, error: 'Invalid domain' });
    }
    
    // Stap 1: Probeer WHOIS
    let emailResult = await findEmailViaWhois(domain);
    
    // Stap 2: Als WHOIS niets vindt, crawl contact pagina
    if (!emailResult) {
      emailResult = await findEmailViaContactPage(lead.website);
    }
    
    if (emailResult) {
      // Update lead met gevonden email
      await pool.query(
        `UPDATE google_maps_leads SET 
           email = $1, 
           email_status = 'found', 
           email_found_at = NOW(),
           email_method = $2
         WHERE id = $3`,
        [emailResult.email, emailResult.method, id]
      );
      
      // Log de vondst
      await pool.query(
        `INSERT INTO email_finder_log (lead_id, domain, email_found, method, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, domain, emailResult.email, emailResult.method, 80]
      );
      
      res.json({ 
        success: true, 
        email: emailResult.email, 
        method: emailResult.method 
      });
    } else {
      // Geen email gevonden
      await pool.query(
        `UPDATE google_maps_leads SET email_status = 'not_found' WHERE id = $1`,
        [id]
      );
      
      res.json({ success: false, error: 'No email found' });
    }
    
  } catch (error) {
    console.error('Email finder error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk email finder voor meerdere leads
app.post('/api/leads/bulk/find-emails', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const { lead_ids } = req.body;
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Lead IDs required' });
  }
  
  try {
    let found = 0;
    let total = lead_ids.length;
    
    for (const id of lead_ids) {
      // Haal lead op
      const leadResult = await pool.query(
        `SELECT * FROM google_maps_leads WHERE id = $1`,
        [id]
      );
      
      if (leadResult.rows.length === 0) continue;
      
      const lead = leadResult.rows[0];
      
      if (!lead.website) continue;
      
      const domain = extractDomain(lead.website);
      if (!domain) continue;
      
      // Stap 1: WHOIS
      let emailResult = await findEmailViaWhois(domain);
      
      // Stap 2: Contact pagina
      if (!emailResult) {
        emailResult = await findEmailViaContactPage(lead.website);
      }
      
      if (emailResult) {
        await pool.query(
          `UPDATE google_maps_leads SET 
             email = $1, 
             email_status = 'found', 
             email_found_at = NOW(),
             email_method = $2
           WHERE id = $3`,
          [emailResult.email, emailResult.method, id]
        );
        
        await pool.query(
          `INSERT INTO email_finder_log (lead_id, domain, email_found, method, confidence)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, domain, emailResult.email, emailResult.method, 80]
        );
        
        found++;
      } else {
        await pool.query(
          `UPDATE google_maps_leads SET email_status = 'not_found' WHERE id = $1`,
          [id]
        );
      }
      
      // Kleine vertraging om rate limiting te voorkomen
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    res.json({ 
      success: true, 
      found: found,
      total: total,
      message: `Found ${found} emails out of ${total} leads`
    });
    
  } catch (error) {
    console.error('Bulk email finder error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// EMAIL QUEUE ENDPOINTS (FASE 4)
// ==========================================

// Voeg leads toe aan email queue
app.post('/api/email/queue', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const freelancerId = req.headers['x-freelancer-id'] || 1;
  const { lead_ids } = req.body;
  
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Lead IDs required' });
  }
  
  try {
    // Check of freelancer Sendgrid heeft geconfigureerd
    const config = await pool.query(
      `SELECT * FROM sendgrid_config WHERE freelancer_id = $1`,
      [freelancerId]
    );
    
    if (config.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Sendgrid not configured' });
    }
    
    let queued = 0;
    
    for (const lead_id of lead_ids) {
      // Haal lead op
      const leadResult = await pool.query(
        `SELECT * FROM google_maps_leads WHERE id = $1`,
        [lead_id]
      );
      
      if (leadResult.rows.length === 0) continue;
      
      const lead = leadResult.rows[0];
      
      // Alleen als er een email is
      if (!lead.email || !lead.email.includes('@')) continue;
      
      // Check of al in queue
      const existing = await pool.query(
        `SELECT id FROM email_queue 
         WHERE lead_id = $1 AND user_id = $2 AND status IN ('pending', 'sent')`,
        [lead_id, freelancerId]
      );
      
      if (existing.rows.length > 0) continue;
      
      // Voeg toe aan queue
      await pool.query(
        `INSERT INTO email_queue (user_id, lead_id, recipient_email, recipient_name, subject, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [freelancerId, lead_id, lead.email, lead.name, 'SEO Opportunity for your business', 'pending']
      );
      
      queued++;
    }
    
    res.json({ 
      success: true, 
      queued: queued,
      message: `Added ${queued} leads to email queue`
    });
    
  } catch (error) {
    console.error('Email queue error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start queue processing
app.post('/api/email/start', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  startQueueProcessor();
  res.json({ success: true, message: 'Email queue started' });
});

// Pause queue processing
app.post('/api/email/pause', async (req, res) => {
  stopQueueProcessor();
  res.json({ success: true, message: 'Email queue paused' });
});

// Resume queue processing
app.post('/api/email/resume', async (req, res) => {
  startQueueProcessor();
  res.json({ success: true, message: 'Email queue resumed' });
});

// Queue status
app.get('/api/email/queue/status', async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  
  const freelancerId = req.headers['x-freelancer-id'] || 1;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const pending = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE user_id = $1 AND status = 'pending'`,
      [freelancerId]
    );
    
    const sentToday = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE user_id = $1 AND status = 'sent' AND DATE(sent_at) = $2`,
      [freelancerId, today]
    );
    
    const failed = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE user_id = $1 AND status = 'failed'`,
      [freelancerId]
    );
    
    res.json({
      success: true,
      queue_active: queueActive,
      pending: parseInt(pending.rows[0].count),
      sent_today: parseInt(sentToday.rows[0].count),
      failed: parseInt(failed.rows[0].count),
      daily_limit: DAILY_LIMIT
    });
    
  } catch (error) {
    console.error('Queue status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
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
        technical_score,
        share_code
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

// Shareable leaderboard page
app.get('/share/:code', async (req, res) => {
  const { code } = req.params;
  
  if (!pool) {
    return res.status(503).send('Database niet beschikbaar');
  }
  
  try {
    const result = await pool.query(
      `SELECT * FROM leaderboard WHERE share_code = $1 AND admin_verified = TRUE`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Leaderboard entry niet gevonden');
    }
    
    const entry = result.rows[0];
    
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await pool.query(
      `INSERT INTO leaderboard_shares (leaderboard_id, share_code, shared_via, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.id, code, 'direct', ipAddress, userAgent]
    );
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${entry.company_name || 'Website'} - ContentScale Leaderboard</title>
        <meta property="og:title" content="${entry.company_name || 'Website'} scored ${entry.score}/100 on ContentScale" />
        <meta property="og:description" content="Check out this elite website's SEO performance using GRAAF & CRAFT frameworks" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://app.contentscale.site/share/${code}" />
        <meta name="twitter:card" content="summary_large_image" />
        <style>
          body { font-family: system-ui, sans-serif; background: #030712; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: #111827; border: 2px solid #a855f7; border-radius: 1rem; padding: 2rem; max-width: 500px; text-align: center; }
          .score { font-size: 5rem; font-weight: bold; color: #4ade80; line-height: 1; margin: 1rem 0; }
          .url { color: #9ca3af; word-break: break-all; margin-bottom: 1.5rem; }
          .badge { background: #a855f7; color: white; padding: 0.5rem 1rem; border-radius: 9999px; display: inline-block; margin-bottom: 1rem; }
          .frameworks { display: flex; gap: 1rem; justify-content: center; margin: 1.5rem 0; }
          .framework { background: #1f2937; padding: 0.75rem; border-radius: 0.5rem; flex: 1; }
          .btn { background: #7e22ce; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">🏆 Elite Leaderboard</div>
          <h1>${entry.company_name || 'Website'}</h1>
          <div class="url">${entry.url}</div>
          <div class="score">${entry.score}/100</div>
          <div class="frameworks">
            <div class="framework">GRAAF<br><strong>${entry.graaf_score || '?'}/50</strong></div>
            <div class="framework">CRAFT<br><strong>${entry.craft_score || '?'}/30</strong></div>
            <div class="framework">Technical<br><strong>${entry.technical_score || '?'}/20</strong></div>
          </div>
          <a href="https://app.contentscale.site" class="btn">Scan your website →</a>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
    
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).send('Internal server error');
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
    const { name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_featured } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' });
    
    const existing = await pool.query('SELECT id FROM freelancers WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already registered' });
    
    const result = await pool.query(
      `INSERT INTO freelancers (name, email, title, location, country, bio, linkedin_url, hourly_rate, availability, is_approved, is_featured) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10) RETURNING id`,
      [name, email, title || null, location || null, country || null, bio || null, 
       linkedin_url || null, hourly_rate || null, availability || null, is_featured || false]
    );
    
    res.json({ success: true, message: 'Application submitted! We will review and approve soon.', id: result.rows[0].id });
  } catch (error) {
    console.error('Freelancer registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ==========================================
// ADMIN LOGIN
// ==========================================
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
  }
  
  if (!pool) {
    return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  }
  
  try {
    console.log(`🔐 Login poging voor: ${username}`);
    
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
    
    await pool.query(
      'UPDATE super_admins SET last_login = NOW() WHERE id = $1', 
      [admin.id]
    );
    
    console.log(`✅ Login succesvol voor: ${username}, admin ID: ${admin.id}`);
    
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
  
  const { id } = req.params;
  const { final_country, contact_email } = req.body;
  
  try {
    const entryResult = await pool.query(
      `SELECT * FROM leaderboard WHERE id = $1`,
      [id]
    );
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    
    const entry = entryResult.rows[0];
    
    let shareCode = entry.share_code;
    if (!shareCode) {
      shareCode = generateShareCode(entry.url, entry.id);
    }
    
    const positionResult = await pool.query(
      `SELECT COUNT(*) + 1 as position FROM leaderboard 
       WHERE admin_verified = TRUE AND score > $1`,
      [entry.score]
    );
    const position = parseInt(positionResult.rows[0].position) || 1;
    
    await pool.query(
      `UPDATE leaderboard SET 
         admin_verified = TRUE, 
         country = COALESCE($2, country), 
         is_verified = TRUE,
         share_code = COALESCE($3, share_code),
         contact_email = COALESCE($4, contact_email)
       WHERE id = $1`,
      [id, final_country, shareCode, contact_email]
    );
    
    let emailSent = false;
    if (contact_email) {
      const shareUrl = `https://app.contentscale.site/share/${shareCode}`;
      const baseUrl = `https://app.contentscale.site`;
      
      const emailHtml = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111827; color: white; border-radius: 12px; border: 2px solid #a855f7;">
          <div style="text-align: center; margin-bottom: 30px;">
            <span style="background: #a855f7; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold;">🏆 ContentScale Leaderboard</span>
          </div>
          
          <h1 style="color: white; text-align: center; font-size: 28px; margin-bottom: 20px;">🎉 Congratulations!</h1>
          
          <p style="color: #d1d5db; font-size: 18px; text-align: center; margin-bottom: 30px;">
            Your website <strong style="color: white;">${entry.url}</strong> has been reviewed and scored an impressive 
            <strong style="color: #4ade80; font-size: 24px;">${entry.score}/100</strong>.
          </p>
          
          <div style="background: #1f2937; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
            <p style="color: white; margin-top: 0; margin-bottom: 20px; font-size: 18px;">
              Your content quality, technical SEO, and user experience are outstanding. 
              That's why we've added you to the <strong>ContentScale Elite Leaderboard</strong> at position #${position}.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${shareUrl}" style="background: #7e22ce; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block;">
                👉 View Your Position
              </a>
            </div>
            
            <p style="color: #9ca3af; margin-bottom: 20px;">
              Want to share this achievement? Use this link to show your clients or team:
            </p>
            
            <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 15px; word-break: break-all;">
              <a href="${shareUrl}" style="color: #7dd3fc; text-decoration: underline;">${shareUrl}</a>
            </div>
          </div>
          
          <div style="background: linear-gradient(135deg, #7e22ce, #be185d); border-radius: 12px; padding: 20px; text-align: center;">
            <p style="color: white; margin: 0 0 15px 0; font-size: 16px;">
              ⭐ Keep up the excellent work. Sites that maintain 85+ often see 2-3x more organic traffic within 3 months.
            </p>
            <a href="${baseUrl}" style="background: white; color: #7e22ce; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Scan your website again →
            </a>
          </div>
          
          <p style="color: #6b7280; text-align: center; margin-top: 30px; font-size: 14px;">
            —<br>
            ContentScale Team<br>
            <a href="${baseUrl}" style="color: #7dd3fc;">www.contentscale.site</a>
          </p>
        </div>
      `;
      
      emailSent = await sendEmail(
        contact_email,
        `🎉 Congratulations! Your site is now on the Contentscale Leaderboard`,
        emailHtml
      );
      
      if (emailSent) {
        await pool.query(
          `UPDATE leaderboard SET email_sent_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Entry approved',
      email_sent: emailSent,
      share_code: shareCode,
      position: position
    });
    
  } catch (error) {
    console.error('Approve error:', error);
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
  
  const { url, company_name, country, city, type = 'seo_agency', contact_email } = req.body;
  
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
    let shareCode = generateShareCode(scanUrl, Date.now());
    
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO leaderboard (url, company_name, score, country, city, type, admin_verified, is_verified, graaf_score, craft_score, technical_score, share_code, contact_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [scanUrl, company_name || null, totalScore, country || 'NL', city || null, type, true, true,
         scores.graafScore, scores.craftScore, scores.technicalScore, shareCode, contact_email]
      );
      leaderboardEntry = { id: result.rows[0].id, action: 'added' };
      console.log(`👑 Admin added to leaderboard: ${scanUrl} (score: ${totalScore})`);
    } else {
      await pool.query(
        `UPDATE leaderboard SET 
           score = $1, company_name = COALESCE($2, company_name), country = COALESCE($3, country),
           city = COALESCE($4, city), type = COALESCE($5, type), admin_verified = true,
           is_verified = true, graaf_score = $6, craft_score = $7, technical_score = $8,
           contact_email = COALESCE($9, contact_email)
         WHERE url = $10`,
        [totalScore, company_name || null, country || null, city || null, type,
         scores.graafScore, scores.craftScore, scores.technicalScore, contact_email, scanUrl]
      );
      leaderboardEntry = { id: existing.rows[0].id, action: 'updated' };
      console.log(`👑 Admin updated leaderboard: ${scanUrl} (score: ${totalScore})`);
    }
    
    let emailSent = false;
    if (contact_email) {
      const positionResult = await pool.query(
        `SELECT COUNT(*) + 1 as position FROM leaderboard 
         WHERE admin_verified = TRUE AND score > $1`,
        [totalScore]
      );
      const position = parseInt(positionResult.rows[0].position) || 1;
      
      const shareUrl = `https://app.contentscale.site/share/${shareCode}`;
      const baseUrl = `https://app.contentscale.site`;
      
      const emailHtml = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111827; color: white; border-radius: 12px; border: 2px solid #a855f7;">
          <div style="text-align: center; margin-bottom: 30px;">
            <span style="background: #a855f7; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold;">🏆 ContentScale Leaderboard</span>
          </div>
          
          <h1 style="color: white; text-align: center; font-size: 28px; margin-bottom: 20px;">🎉 Congratulations!</h1>
          
          <p style="color: #d1d5db; font-size: 18px; text-align: center; margin-bottom: 30px;">
            Your website <strong style="color: white;">${scanUrl}</strong> has been reviewed and scored an impressive 
            <strong style="color: #4ade80; font-size: 24px;">${totalScore}/100</strong>.
          </p>
          
          <div style="background: #1f2937; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
            <p style="color: white; margin-top: 0; margin-bottom: 20px; font-size: 18px;">
              Your content quality, technical SEO, and user experience are outstanding. 
              That's why we've added you to the <strong>ContentScale Elite Leaderboard</strong> at position #${position}.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${shareUrl}" style="background: #7e22ce; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block;">
                👉 View Your Position
              </a>
            </div>
            
            <p style="color: #9ca3af; margin-bottom: 20px;">
              Want to share this achievement? Use this link to show your clients or team:
            </p>
            
            <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 15px; word-break: break-all;">
              <a href="${shareUrl}" style="color: #7dd3fc; text-decoration: underline;">${shareUrl}</a>
            </div>
          </div>
          
          <div style="background: linear-gradient(135deg, #7e22ce, #be185d); border-radius: 12px; padding: 20px; text-align: center;">
            <p style="color: white; margin: 0 0 15px 0; font-size: 16px;">
              ⭐ Keep up the excellent work. Sites that maintain 85+ often see 2-3x more organic traffic within 3 months.
            </p>
            <a href="${baseUrl}" style="background: white; color: #7e22ce; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Scan your website again →
            </a>
          </div>
          
          <p style="color: #6b7280; text-align: center; margin-top: 30px; font-size: 14px;">
            —<br>
            ContentScale Team<br>
            <a href="${baseUrl}" style="color: #7dd3fc;">www.contentscale.site</a>
          </p>
        </div>
      `;
      
      emailSent = await sendEmail(
        contact_email,
        `🎉 Congratulations! Your site is now on the Contentscale Leaderboard`,
        emailHtml
      );
      
      if (emailSent) {
        await pool.query(
          `UPDATE leaderboard SET email_sent_at = NOW() WHERE url = $1`,
          [scanUrl]
        );
      }
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
      share_code: shareCode,
      email_sent: emailSent,
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
    const { url, company_name, score, country, city, type, contact_email } = req.body;
    if (!url || !score) return res.status(400).json({ success: false, error: 'URL and score are required' });
    
    const shareCode = generateShareCode(url, Date.now());
    const existing = await pool.query('SELECT id FROM leaderboard WHERE url = $1', [url]);
    
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO leaderboard (url, company_name, score, country, city, type, admin_verified, is_verified, share_code, contact_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [url, company_name || null, score, country || 'NL', city || null, type || 'seo_agency', true, true, shareCode, contact_email]
      );
      
      let emailSent = false;
      if (contact_email) {
        const positionResult = await pool.query(
          `SELECT COUNT(*) + 1 as position FROM leaderboard 
           WHERE admin_verified = TRUE AND score > $1`,
          [score]
        );
        const position = parseInt(positionResult.rows[0].position) || 1;
        
        const shareUrl = `https://app.contentscale.site/share/${shareCode}`;
        const baseUrl = `https://app.contentscale.site`;
        
        const emailHtml = `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #111827; color: white; border-radius: 12px; border: 2px solid #a855f7;">
            <div style="text-align: center; margin-bottom: 30px;">
              <span style="background: #a855f7; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold;">🏆 ContentScale Leaderboard</span>
            </div>
            
            <h1 style="color: white; text-align: center; font-size: 28px; margin-bottom: 20px;">🎉 Congratulations!</h1>
            
            <p style="color: #d1d5db; font-size: 18px; text-align: center; margin-bottom: 30px;">
              Your website <strong style="color: white;">${url}</strong> has been reviewed and scored an impressive 
              <strong style="color: #4ade80; font-size: 24px;">${score}/100</strong>.
            </p>
            
            <div style="background: #1f2937; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
              <p style="color: white; margin-top: 0; margin-bottom: 20px; font-size: 18px;">
                Your content quality, technical SEO, and user experience are outstanding. 
                That's why we've added you to the <strong>ContentScale Elite Leaderboard</strong> at position #${position}.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${shareUrl}" style="background: #7e22ce; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block;">
                  👉 View Your Position
                </a>
              </div>
              
              <p style="color: #9ca3af; margin-bottom: 20px;">
                Want to share this achievement? Use this link to show your clients or team:
              </p>
              
              <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 15px; word-break: break-all;">
                <a href="${shareUrl}" style="color: #7dd3fc; text-decoration: underline;">${shareUrl}</a>
              </div>
            </div>
            
            <div style="background: linear-gradient(135deg, #7e22ce, #be185d); border-radius: 12px; padding: 20px; text-align: center;">
              <p style="color: white; margin: 0 0 15px 0; font-size: 16px;">
                ⭐ Keep up the excellent work. Sites that maintain 85+ often see 2-3x more organic traffic within 3 months.
              </p>
              <a href="${baseUrl}" style="background: white; color: #7e22ce; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                Scan your website again →
              </a>
            </div>
            
            <p style="color: #6b7280; text-align: center; margin-top: 30px; font-size: 14px;">
              —<br>
              ContentScale Team<br>
              <a href="${baseUrl}" style="color: #7dd3fc;">www.contentscale.site</a>
            </p>
          </div>
        `;
        
        emailSent = await sendEmail(
          contact_email,
          `🎉 Congratulations! Your site is now on the Contentscale Leaderboard`,
          emailHtml
        );
        
        if (emailSent) {
          await pool.query(
            `UPDATE leaderboard SET email_sent_at = NOW() WHERE id = $1`,
            [result.rows[0].id]
          );
        }
      }
      
      res.json({ 
        success: true, 
        action: 'added', 
        id: result.rows[0].id, 
        message: 'Entry added to leaderboard',
        share_code: shareCode,
        email_sent: emailSent
      });
    } else {
      await pool.query(
        `UPDATE leaderboard SET 
           score = $1, company_name = COALESCE($2, company_name), country = COALESCE($3, country),
           city = COALESCE($4, city), type = COALESCE($5, type), admin_verified = true, 
           is_verified = true, contact_email = COALESCE($6, contact_email)
         WHERE url = $7`,
        [score, company_name || null, country || null, city || null, type || 'seo_agency', contact_email, url]
      );
      res.json({ success: true, action: 'updated', id: existing.rows[0].id, message: 'Leaderboard entry updated' });
    }
  } catch (error) {
    console.error('Manual leaderboard add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ ADMIN FREELANCERS
app.get('/api/admin/freelancers', verifyAdmin, async (req, res) => {
  if (!pool) return res.json({ success: true, freelancers: [] });
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers 
      WHERE is_approved = TRUE 
      ORDER BY is_featured DESC, created_at DESC 
      LIMIT 200
    `);
    res.json({ success: true, freelancers: result.rows });
  } catch (error) {
    console.error('Admin freelancers error:', error);
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

app.post('/api/admin/freelancers/:id/toggle-featured', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const freelancer = await pool.query('SELECT is_featured FROM freelancers WHERE id = $1', [id]);
    if (freelancer.rows.length === 0) return res.status(404).json({ success: false, error: 'Freelancer not found' });
    
    const newFeatured = !freelancer.rows[0].is_featured;
    await pool.query('UPDATE freelancers SET is_featured = $1 WHERE id = $2', [newFeatured, id]);
    
    res.json({ success: true, is_featured: newFeatured, message: `Featured ${newFeatured ? 'aangezet' : 'uitgezet'}` });
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

app.put('/api/admin/freelancers/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { name, email, title, location, country, bio, hourly_rate, is_featured } = req.body;
    
    await pool.query(
      `UPDATE freelancers SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        title = COALESCE($3, title),
        location = COALESCE($4, location),
        country = COALESCE($5, country),
        bio = COALESCE($6, bio),
        hourly_rate = COALESCE($7, hourly_rate),
        is_featured = COALESCE($8, is_featured)
      WHERE id = $9`,
      [name, email, title, location, country, bio, hourly_rate, is_featured, id]
    );
    
    res.json({ success: true, message: 'Freelancer bijgewerkt' });
  } catch (error) {
    console.error('Update freelancer error:', error.message);
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

// ✅ LEADERBOARD BULK DELETE
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

app.put('/api/admin/leaderboard/:id', verifyAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ success: false, error: 'Database niet beschikbaar' });
  try {
    const { id } = req.params;
    const { company_name, url, score, country, contact_email } = req.body;
    
    await pool.query(
      `UPDATE leaderboard SET 
        company_name = COALESCE($1, company_name),
        url = COALESCE($2, url),
        score = COALESCE($3, score),
        country = COALESCE($4, country),
        contact_email = COALESCE($5, contact_email)
      WHERE id = $6`,
      [company_name, url, score, country, contact_email, id]
    );
    
    res.json({ success: true, message: 'Leaderboard entry bijgewerkt' });
  } catch (error) {
    console.error('Update leaderboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PAGE ROUTES
// ==========================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin-dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(publicPath, 'blog.html'));
});

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(publicPath, 'blog-post.html'));
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
  
  const filePath = path.join(publicPath, req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(publicPath, 'index.html'));
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
  
  // Start queue processor als database verbonden is
  if (dbConnected) {
    startQueueProcessor();
  }
  
  app.listen(PORT, () => {
    console.log('');
    console.log(`📍 Server gestart op http://localhost:${PORT}`);
    console.log(`📍 Admin:     http://localhost:${PORT}/admin`);
    console.log(`📍 Blog:      http://localhost:${PORT}/blog`);
    console.log('');
    console.log(`📊 Database status: ${dbConnected ? '✅ Verbonden' : '❌ NIET VERBONDEN'}`);
    console.log(`🔐 Admin login:     ${dbConnected ? '✅ Werkend (ot/admin123)' : '❌ Niet beschikbaar'}`);
    console.log(`📧 Queue processor: ${queueActive ? '✅ Actief' : '❌ Inactief'}`);
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
