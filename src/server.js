// ============================================
// CONTENTSCALE SERVER.JS - COMPLETE WITH SECURITY + SCANNER LIMIT
// ============================================

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// DATABASE CONFIGURATION
// ============================================
let dbConfig;

if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  
  dbConfig = {
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    ssl: process.env.NODE_ENV === 'production' ? { 
      rejectUnauthorized: false
    } : false
  };
} else {
  dbConfig = {
    host: 'localhost',
    database: 'contentscale',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    ssl: false
  };
}

const pool = new Pool(dbConfig);

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected');
    release();
    setTimeout(createAllTables, 1000);
  }
});

// ============================================
// CREATE ALL TABLES
// ============================================
async function createAllTables() {
  const client = await pool.connect();
  
  try {
    // SUPER ADMINS TABLE
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
    
    // Create default super admin if not exists
    const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        ['ot', hash, 'Super Admin', 'super_admin']
      );
    }
    
    // AGENCIES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        url TEXT,
        country VARCHAR(10) DEFAULT 'NL',
        plan VARCHAR(50) DEFAULT 'free',
        contact_person VARCHAR(255),
        contact_email VARCHAR(255),
        admin_key VARCHAR(100) UNIQUE,
        score INTEGER,
        company_name TEXT,
        country_code VARCHAR(2),
        business_type VARCHAR(50),
        is_enhanced BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_scan TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // CLIENTS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        scan_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SCANS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        quality VARCHAR(50),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        breakdown JSONB,
        recommendations JSONB DEFAULT '[]',
        agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        client_url TEXT,
        scan_type VARCHAR(50) DEFAULT 'manual',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // FIX: Remove the problematic CHECK constraint
    await client.query(`
      ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check
    `).catch(e => console.log('Constraint already removed or does not exist'));
    
    // SHARE LINKS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        id SERIAL PRIMARY KEY,
        share_code VARCHAR(100) UNIQUE NOT NULL,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        client_email VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        client_company VARCHAR(255),
        scans_limit INTEGER DEFAULT 5,
        scans_used INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // LEADERBOARD TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        business_type VARCHAR(50),
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        opted_out_at TIMESTAMP,
        opted_out_reason VARCHAR(255),
        submitted_via_share_link BOOLEAN DEFAULT FALSE,
        share_link_id UUID,
        submission_ip VARCHAR(50),
        admin_verified BOOLEAN DEFAULT FALSE,
        last_scan TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // AGENCY CLAIMS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS agency_claims (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        claimed_name TEXT NOT NULL,
        logo_url TEXT,
        description TEXT,
        contact_email TEXT NOT NULL,
        agency_size VARCHAR(50),
        specialties JSONB DEFAULT '[]',
        is_verified BOOLEAN DEFAULT FALSE,
        claimed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // LTD CODES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ltd_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL,
        max_uses INTEGER DEFAULT 1,
        times_used INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SETTINGS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // SECURITY TABLES
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_blocks (
        id SERIAL PRIMARY KEY,
        url VARCHAR(255) UNIQUE NOT NULL,
        domain VARCHAR(255),
        reason VARCHAR(255) NOT NULL,
        blocked_by VARCHAR(100),
        blocked_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_limits (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(50) NOT NULL,
        submission_date DATE NOT NULL,
        submission_count INT DEFAULT 1,
        last_submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(ip_address, submission_date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_share_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by VARCHAR(100) NOT NULL,
        link_type VARCHAR(50) DEFAULT 'verify',
        target_url VARCHAR(255),
        target_company VARCHAR(255),
        verification_token VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        used_count INT DEFAULT 0,
        max_uses INT DEFAULT 10,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_logs (
        id SERIAL PRIMARY KEY,
        url VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        ip_address VARCHAR(50) NOT NULL,
        country VARCHAR(10),
        score INT,
        graaf_score INT,
        craft_score INT,
        technical_score INT,
        submitted_via VARCHAR(50) DEFAULT 'api',
        share_link_id UUID,
        status VARCHAR(50) DEFAULT 'pending',
        rejection_reason VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT NOW(),
        admin_reviewed_at TIMESTAMP,
        admin_reviewed_by VARCHAR(100),
        leaderboard_entry_id INT
      )
    `);

    // CLAIM PROFILE TABLES
    await client.query(`
      CREATE TABLE IF NOT EXISTS profile_claims (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT,
        logo_url TEXT,
        description TEXT,
        specializations JSONB,
        country TEXT,
        agency_size TEXT,
        contact_email TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        variables JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        to_email TEXT NOT NULL,
        subject TEXT,
        template_used TEXT,
        status TEXT DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT NOW(),
        error_message TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS optout_requests (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        reason TEXT,
        token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP
      )
    `);
    
    // DATABASE MIGRATIONS
    await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_enhanced BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS last_scan TIMESTAMP`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS company_name TEXT`);
    await client.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS client_url TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS logo_url TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS specializations JSONB`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS agency_size TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS contact_email TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE`);
    
    // DEFAULT SETTINGS
    const defaultSettings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['auto_scan_enabled', 'false']
    ];
    
    for (const [key, value] of defaultSettings) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }

    // INSERT DEFAULT EMAIL TEMPLATES
    await client.query(`
      INSERT INTO email_templates (name, subject, body, variables) VALUES
      (
        'leaderboard_addition',
        'You''re on the ContentScale SEO Agency Leaderboard! 🏆',
        '<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb;">Congratulations {agency_name}! 🎉</h2>
    
    <p>Your agency has been added to the <strong>ContentScale SEO Agency Leaderboard</strong>.</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Your Current Ranking:</h3>
      <ul style="list-style: none; padding: 0;">
        <li>📊 <strong>Score:</strong> {score}/100</li>
        <li>🏅 <strong>Position:</strong> #{position} in {country}</li>
        <li>🌐 <strong>URL Scanned:</strong> <a href="{url}">{url}</a></li>
      </ul>
    </div>
    
    <h3>Want to claim your profile?</h3>
    <p>Add your logo, description, and specializations to stand out:</p>
    <p style="text-align: center;">
      <a href="{claim_url}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Claim Your Profile
      </a>
    </p>
    
    <h3>Want to improve your ranking?</h3>
    <p>Optimize your content using our GRAAF Framework:</p>
    <ul>
      <li><strong>G</strong>enuinely Credible</li>
      <li><strong>R</strong>elevance</li>
      <li><strong>A</strong>ctionability</li>
      <li><strong>A</strong>ccuracy</li>
      <li><strong>F</strong>reshness</li>
    </ul>
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #666;">
      Don''t want to be listed? <a href="{optout_url}">Click here to opt-out</a>
    </p>
    
    <p style="font-size: 14px; color: #666;">
      Best regards,<br>
      <strong>Ottmar Francisca</strong><br>
      ContentScale - GRAAF Framework Creator<br>
      <a href="https://contentscale.site">contentscale.site</a>
    </p>
  </div>
</body>
</html>',
        '{"agency_name": "text", "score": "number", "position": "number", "country": "text", "url": "text", "claim_url": "text", "optout_url": "text"}'::jsonb
      ),
      (
        'claim_approved',
        'Your ContentScale Profile Has Been Approved! ✅',
        '<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Profile Approved! ✅</h2>
    
    <p>Hi {agency_name},</p>
    
    <p>Great news! Your profile claim has been approved and is now live on the leaderboard.</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Your Profile:</h3>
      <ul style="list-style: none; padding: 0;">
        <li>✅ <strong>Status:</strong> Verified</li>
        <li>🏢 <strong>Name:</strong> {agency_name}</li>
        <li>🌐 <strong>URL:</strong> <a href="{url}">{url}</a></li>
        <li>🎯 <strong>Specializations:</strong> {specializations}</li>
      </ul>
    </div>
    
    <p style="text-align: center;">
      <a href="{leaderboard_url}" style="display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        View Your Profile
      </a>
    </p>
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #666;">
      Best regards,<br>
      <strong>Ottmar Francisca</strong><br>
      ContentScale
    </p>
  </div>
</body>
</html>',
        '{"agency_name": "text", "url": "text", "specializations": "text", "leaderboard_url": "text"}'::jsonb
      )
      ON CONFLICT (name) DO NOTHING
    `);
    
    // CREATE INDEXES
    await client.query('CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_domain ON agencies(domain)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_blocked_url ON leaderboard_blocks(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_submission_ip_date ON submission_limits(ip_address, submission_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_status ON profile_claims(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_email ON profile_claims(contact_email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_url ON profile_claims(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_optout_url ON optout_requests(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_optout_token ON optout_requests(token)');
    
    console.log('✅ All database tables ready');
    
    setTimeout(autoPopulateLeaderboard, 500);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    client.release();
  }
}

// ============================================
// AUTO-POPULATE LEADERBOARD
// ============================================
async function autoPopulateLeaderboard() {
  try {
    const check = await pool.query('SELECT COUNT(*) FROM leaderboard');
    const count = parseInt(check.rows[0].count);
    
    if (count === 0) {
      const demoAgencies = [
        { url: 'https://contentscale.site', company: 'ContentScale', score: 95, country: 'NL', type: 'seo-agency' },
        { url: 'https://example-seo.nl', company: 'SEO Masters', score: 88, country: 'NL', type: 'seo-agency' },
        { url: 'https://digital-boost.be', company: 'Digital Boost', score: 82, country: 'BE', type: 'marketing-agency' }
      ];
      
      for (const agency of demoAgencies) {
        try {
          await pool.query(`
            INSERT INTO leaderboard (url, company_name, score, country, business_type, is_verified)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (url) DO NOTHING
          `, [agency.url, agency.company, agency.score, agency.country, agency.type, true]);
        } catch (e) {
          // Silently skip duplicates
        }
      }
    }
  } catch (error) {
    console.error('Leaderboard error:', error.message);
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static('public'));

// ============================================
// HTML ROUTES
// ============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unified-scan-page.html'));
});

// ============================================
// ADMIN LOGIN
// ============================================
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
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
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    // Update last login
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
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ADMIN STATS
// ============================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [agencies, clients, scans] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM agencies').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM clients').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM scans').catch(e => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_agencies: parseInt(agencies.rows[0].count) || 0,
        total_clients: parseInt(clients.rows[0].count) || 0,
        total_scans: parseInt(scans.rows[0].count) || 0,
        active_helpers: 0
      }
    });
  } catch (error) {
    res.json({ success: true, stats: { total_agencies: 0, total_clients: 0, total_scans: 0, active_helpers: 0 } });
  }
});

// ============================================
// ADMINS ENDPOINTS
// ============================================
app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    res.json({ success: true, admins: [] });
  }
});

app.post('/api/admins', async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Required fields missing' });
  }
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO super_admins (username, password_hash, full_name, email, role) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, hash, full_name || null, email || null, role]
    );
    
    res.json({ success: true, admin_id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Username exists' });
    }
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/admins/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM super_admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// AGENCIES ENDPOINTS
// ============================================
app.get('/api/super-admin/agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM clients WHERE agency_id = a.id) as client_count,
        (SELECT COUNT(*) FROM scans WHERE agency_id = a.id) as total_scans
      FROM agencies a 
      ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    res.json({ success: true, agencies: [] });
  }
});

app.post('/api/agencies', async (req, res) => {
  const { name, domain, country, plan, contact_person, contact_email } = req.body;
  
  if (!name || !domain) {
    return res.status(400).json({ success: false, error: 'Name and domain required' });
  }
  
  try {
    const adminKey = crypto.randomBytes(16).toString('hex');
    const result = await pool.query(
      `INSERT INTO agencies (name, domain, country, plan, contact_person, contact_email, admin_key, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, domain, country || 'NL', plan || 'free', contact_person, contact_email, adminKey, `https://${domain}`]
    );
    
    res.json({ success: true, agency_id: result.rows[0].id, admin_key: adminKey });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/agencies/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// CLIENTS ENDPOINTS
// ============================================
app.get('/api/admin/clients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, a.name as agency_name 
      FROM clients c 
      LEFT JOIN agencies a ON c.agency_id = a.id 
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    res.json({ success: true, clients: [] });
  }
});

app.delete('/api/admin/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// SCANS ENDPOINTS
// ============================================
app.get('/api/admin/scans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, a.name as agency_name 
      FROM scans s 
      LEFT JOIN agencies a ON s.agency_id = a.id 
      ORDER BY s.created_at DESC 
      LIMIT 100
    `);
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    res.json({ success: true, scans: [] });
  }
});

app.delete('/api/admin/scans/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// SHARE LINKS ENDPOINTS
// ============================================
app.get('/api/admin/share-links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM share_links ORDER BY created_at DESC');
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.json({ success: true, share_links: [] });
  }
});

app.post('/api/admin/share-links/create', async (req, res) => {
  const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
  
  if (!client_email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  
  try {
    const shareCode = crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (valid_days || 30));
    
    await pool.query(
      `INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [shareCode, client_email, client_name, client_company, scans_limit || 5, expiresAt]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${shareCode}`;
    res.json({ success: true, share_code: shareCode, share_url: shareUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/admin/share-links/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE share_code = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// ============================================
// LEADERBOARD ENDPOINTS (CONTINUED)
// ============================================
app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE is_opted_out = FALSE
      ORDER BY score DESC 
      LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.json({ success: true, entries: [] });
  }
});

app.get('/api/admin/leaderboard/search', async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE (url ILIKE $1 OR company_name ILIKE $1) AND is_opted_out = FALSE
      ORDER BY score DESC
    `, [`%${q}%`]);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.json({ success: true, entries: [] });
  }
});

app.delete('/api/admin/leaderboard/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// PUBLIC LEADERBOARD API
// ============================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        COALESCE(company_name, 'Unknown') as company_name,
        url,
        score,
        COALESCE(country, 'NL') as country,
        COALESCE(business_type, 'agency') as type,
        COALESCE(is_verified, false) as is_claimed,
        COALESCE(created_at, NOW()) as created_at
      FROM leaderboard 
      WHERE score IS NOT NULL AND is_opted_out = FALSE
      ORDER BY score DESC 
      LIMIT 50
    `);
    
    res.json({
      success: true,
      entries: result.rows,
      total: result.rows.length,
      averageScore: result.rows.length > 0 
        ? Math.round(result.rows.reduce((sum, r) => sum + (r.score || 0), 0) / result.rows.length)
        : 0
    });
  } catch (error) {
    res.json({ success: true, entries: [], total: 0, averageScore: 0 });
  }
});

// ============================================
// OPT-OUT ENDPOINT
// ============================================
app.post('/api/leaderboard/opt-out', async (req, res) => {
  try {
    const { url, reason } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    const exists = await pool.query(
      'SELECT id FROM leaderboard_blocks WHERE url = $1',
      [url]
    );
    
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Already opted out' });
    }
    
    await pool.query(`
      INSERT INTO leaderboard_blocks (url, reason, blocked_by)
      VALUES ($1, $2, $3)
    `, [url, reason || 'User requested removal', 'user']);
    
    await pool.query(`
      UPDATE leaderboard 
      SET is_opted_out = TRUE, opted_out_at = NOW(), opted_out_reason = $2
      WHERE url = $1
    `, [url, reason || 'User requested removal']);
    
    res.json({
      success: true,
      message: 'Your URL has been removed from the leaderboard'
    });
    
  } catch (error) {
    console.error('Opt-out error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET CLIENT IP
// ============================================
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0').split(',')[0].trim();
}

// ============================================
// LEADERBOARD SUBMIT
// ============================================
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, company_name, country } = req.body;
    const ip = getClientIP(req);
    
    if (!url || score === undefined) {
      return res.status(400).json({ error: 'URL and score required' });
    }
    
    const leaderboardResult = await pool.query(`
      INSERT INTO leaderboard (url, score, company_name, country, submission_ip)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (url) DO UPDATE SET 
        score = EXCLUDED.score,
        company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
        last_scan = NOW()
      RETURNING id
    `, [url, score, company_name || null, country || 'NL', ip]);
    
    const leaderboardEntryId = leaderboardResult.rows[0].id;
    
    res.json({
      success: true,
      leaderboardEntryId,
      message: 'Added to leaderboard!'
    });
    
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ DAILY SCAN LIMIT TRACKING
// ============================================
const dailyScanLimits = new Map(); // Store: IP -> { date: string, count: number }

function checkDailyScanLimit(ip) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = ip;
  
  if (!dailyScanLimits.has(key)) {
    dailyScanLimits.set(key, { date: today, count: 0 });
  }
  
  const record = dailyScanLimits.get(key);
  
  // Reset if it's a new day
  if (record.date !== today) {
    record.date = today;
    record.count = 0;
  }
  
  return {
    count: record.count,
    limit: 3,
    exceeded: record.count >= 3
  };
}

function incrementScanLimit(ip) {
  const today = new Date().toISOString().split('T')[0];
  const key = ip;
  
  if (!dailyScanLimits.has(key)) {
    dailyScanLimits.set(key, { date: today, count: 1 });
  } else {
    const record = dailyScanLimits.get(key);
    if (record.date === today) {
      record.count++;
    } else {
      record.date = today;
      record.count = 1;
    }
  }
}

// ============================================
// ✅ PUBLIC SCANNER API (WITH DAILY LIMIT)
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                   req.socket.remoteAddress || 
                   '0.0.0.0';
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  // ✅ CHECK DAILY LIMIT
  const limitCheck = checkDailyScanLimit(clientIP);
  
  if (limitCheck.exceeded) {
    return res.status(429).json({
      success: false,
      error: 'daily_limit_reached',
      message: 'Je hebt je dagelijkse limiet van 3 gratis scans bereikt',
      limit: limitCheck.limit,
      count: limitCheck.count,
      calendly_url: 'https://calendly.com/aioeditors',
      contact_message: 'Wil je meer scans? Plan een gratis gesprek met Ot:'
    });
  }
  
  try {
    console.log(`🔍 Scanning: ${url} (IP: ${clientIP}, Count: ${limitCheck.count + 1}/3)`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const html = await response.text();
    
    // ============================================
    // GRAAF SCORE CALCULATION (MAX 50)
    // ============================================
    let graafScore = 0;
    
    // Credibility (Quotes, Sources) - 8 points
    const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(html);
    graafScore += hasQuotes ? 8 : 0;
    
    // Relevance (Statistics, Data) - 8 points
    const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(html);
    graafScore += hasStats ? 8 : 0;
    
    // Freshness (Recent dates) - 8 points
    const hasFreshDates = /202[4-5]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(html);
    graafScore += hasFreshDates ? 8 : 2;
    
    // Accuracy (Author, Bylines) - 8 points
    const hasAuthor = /author|by |written by|published by|contributor/gi.test(html);
    graafScore += hasAuthor ? 8 : 0;
    
    // Actionability (Word count as proxy) - up to 18 points
    const textContent = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
    const wordCount = textContent.length;
    graafScore += Math.min(18, Math.floor(wordCount / 100));
    
    graafScore = Math.min(50, graafScore);
    
    // ============================================
    // CRAFT SCORE CALCULATION (MAX 30)
    // ============================================
    let craftScore = 0;
    
    // H1 tags (1 is ideal) - 8 points
    const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
    craftScore += h1s === 1 ? 8 : h1s > 1 ? 4 : 2;
    
    // H2/H3 tags - up to 10 points
    const h2h3s = (html.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
    craftScore += Math.min(10, h2h3s * 2);
    
    // Paragraphs - up to 8 points
    const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
    craftScore += Math.min(8, Math.floor(paragraphs / 3));
    
    // Lists (UL/OL) - 4 points
    const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(html);
    craftScore += hasLists ? 4 : 0;
    
    craftScore = Math.min(30, craftScore);
    
    // ============================================
    // TECHNICAL SCORE CALCULATION (MAX 20)
    // ============================================
    let technicalScore = 0;
    
    // Meta description - 4 points
    const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
    technicalScore += metaDesc && metaDesc.length > 50 ? 4 : 2;
    
    // Title tag - 4 points
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;
    technicalScore += title && title.length > 30 ? 4 : 2;
    
    // Image alt text coverage - up to 4 points
    const allImages = (html.match(/<img[^>]*>/gi) || []).length;
    const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
    if (allImages > 0) {
      technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
    }
    
    // Viewport meta tag - 3 points
    const hasViewport = /<meta\s+name="viewport"/gi.test(html);
    technicalScore += hasViewport ? 3 : 0;
    
    // Structured data (schema.org) - 3 points
    const hasSchema = /"@context"|"@type"/gi.test(html);
    technicalScore += hasSchema ? 3 : 0;
    
    // Mobile friendly - 2 points
    technicalScore += hasViewport ? 2 : 0;
    
    technicalScore = Math.min(20, technicalScore);
    
    // ============================================
    // TOTAL SCORE & QUALITY
    // ============================================
    const totalScore = graafScore + craftScore + technicalScore;
    
    let quality = 'Needs Work';
    if (totalScore >= 80) quality = 'Excellent';
    else if (totalScore >= 60) quality = 'Good';
    else if (totalScore >= 40) quality = 'Fair';
    
    // ============================================
    // RECOMMENDATIONS
    // ============================================
    const recommendations = [];
    
    if (graafScore < 30) {
      recommendations.push({
        category: 'GRAAF',
        issue: 'Add expert quotes and statistics',
        priority: 'high',
        impact: '+15 points potential'
      });
    }
    
    if (craftScore < 20) {
      recommendations.push({
        category: 'CRAFT',
        issue: 'Improve content structure with headings',
        priority: 'high',
        impact: '+10 points potential'
      });
    }
    
    if (technicalScore < 15) {
      recommendations.push({
        category: 'Technical',
        issue: 'Optimize meta tags and structured data',
        priority: 'medium',
        impact: '+5 points potential'
      });
    }
    
    if (!hasAuthor) {
      recommendations.push({
        category: 'GRAAF - Credibility',
        issue: 'Add author byline',
        priority: 'high',
        impact: '+8 points'
      });
    }
    
    if (!hasFreshDates) {
      recommendations.push({
        category: 'GRAAF - Freshness',
        issue: 'Add recent dates or update timestamps',
        priority: 'medium',
        impact: '+6 points'
      });
    }
    
    // ============================================
    // BREAKDOWN
    // ============================================
    const breakdown = {
      graaf: {
        score: graafScore,
        max: 50,
        percentage: Math.round((graafScore / 50) * 100),
        details: {
          credibility: hasQuotes ? 8 : 0,
          relevance: hasStats ? 8 : 0,
          freshness: hasFreshDates ? 8 : 2,
          accuracy: hasAuthor ? 8 : 0,
          actionability: Math.min(18, Math.floor(wordCount / 100))
        }
      },
      craft: {
        score: craftScore,
        max: 30,
        percentage: Math.round((craftScore / 30) * 100),
        details: {
          headings: h1s === 1 ? 8 : h1s > 1 ? 4 : 2,
          subheadings: Math.min(10, h2h3s * 2),
          paragraphs: Math.min(8, Math.floor(paragraphs / 3)),
          lists: hasLists ? 4 : 0
        }
      },
      technical: {
        score: technicalScore,
        max: 20,
        percentage: Math.round((technicalScore / 20) * 100),
        details: {
          metaDescription: metaDesc && metaDesc.length > 50 ? 4 : 2,
          titleTag: title && title.length > 30 ? 4 : 2,
          imageAlt: allImages > 0 ? Math.min(4, Math.floor((imagesWithAlt / allImages) * 4)) : 0,
          viewport: hasViewport ? 3 : 0,
          schema: hasSchema ? 3 : 0
        }
      }
    };
    
    // ============================================
    // SAVE TO DATABASE
    // ============================================
    const scanResult = {
      success: true,
      url,
      score: totalScore,
      overall_score: totalScore,
      quality,
      graaf_score: graafScore,
      craft_score: craftScore,
      technical_score: technicalScore,
      breakdown,
      recommendations,
      scansRemaining: 3 - (limitCheck.count + 1),
      timestamp: new Date().toISOString()
    };
    
    try {
      await pool.query(`
        INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        url,
        totalScore,
        quality,
        graafScore,
        craftScore,
        technicalScore,
        JSON.stringify(breakdown),
        JSON.stringify(recommendations),
        'public',
        clientIP
      ]);
    } catch (dbError) {
      console.error('Database save error:', dbError);
    }
    
    // ✅ INCREMENT SCAN COUNT
    incrementScanLimit(clientIP);
    
    res.json(scanResult);
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// CLAIMS ENDPOINTS
// ============================================
app.get('/api/admin/claims/pending', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM profile_claims 
      WHERE status = 'pending' 
      ORDER BY created_at DESC
    `);
    res.json({ success: true, claims: result.rows });
  } catch (error) {
    res.json({ success: true, claims: [] });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});
