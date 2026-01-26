// ============================================
// CONTENTSCALE SERVER.JS - COMPLETE WITHOUT BCRYPT
// ============================================

const express = require('express');
const path = require('path');
// BCRYPT REMOVED FOR RAILWAY COMPATIBILITY
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
    
    // Create default super admin if not exists - NO BCRYPT
    const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      await client.query(
        'INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        ['ot', 'admin123', 'Super Admin', 'super_admin']
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
// ADMIN LOGIN - NO BCRYPT
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
    
    // NO BCRYPT - Direct password comparison
    if (password !== admin.password_hash) {
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
  
  // Use email as username if username not provided
  let finalUsername = username;
  
  if (!finalUsername && email) {
    finalUsername = email.split('@')[0];
    
    // Check if username exists, if so add timestamp
    const existing = await pool.query(
      'SELECT id FROM super_admins WHERE username = $1',
      [finalUsername]
    );
    
    if (existing.rows.length > 0) {
      finalUsername = `${finalUsername}_${Date.now()}`;
    }
  }
  
  if (!finalUsername) {
    finalUsername = `user_${Date.now()}`;
  }
  
  if (!password || !role) {
    return res.status(400).json({ success: false, error: 'Password and role are required' });
  }
  
  try {
    // NO BCRYPT - Store password directly
    const result = await pool.query(
      `INSERT INTO super_admins (username, password_hash, full_name, email, role, is_active) 
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [finalUsername, password, full_name || null, email || null, role]
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
  
  // Strip https:// and http:// from domain
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  
  try {
    const adminKey = crypto.randomBytes(16).toString('hex');
    const result = await pool.query(
      `INSERT INTO agencies (name, domain, country, plan, contact_person, contact_email, admin_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, domain, country || 'NL', plan || 'free', contact_person, contact_email, adminKey]
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
// FREELANCER DIRECTORY API
// ============================================

// Get all active freelancers (PUBLIC)
app.get('/api/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, title, bio, profile_photo_url, 
        linkedin_url, portfolio_url, website_url,
        location, country, has_score, score, is_featured
      FROM freelancers 
      WHERE status = 'active' 
        AND payment_status = 'paid'
        AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
      ORDER BY 
        is_featured DESC,
        display_order ASC,
        score DESC NULLS LAST,
        created_at DESC
    `);
    
    res.json({
      success: true,
      freelancers: result.rows
    });
  } catch (error) {
    console.error('Get freelancers error:', error);
    res.status(500).json({ error: 'Failed to load freelancers' });
  }
});

// Submit freelancer application (PUBLIC)
app.post('/api/freelancers/apply', async (req, res) => {
  const { 
    name, email, title, bio, 
    linkedin_url, portfolio_url, website_url,
    location, country 
  } = req.body;
  
  if (!name || !email || !title || !bio) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  
  try {
    // Check if email already exists
    const existing = await pool.query(
      'SELECT id FROM freelancers WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Email already registered. Contact support if you need help.' 
      });
    }
    
    // Insert freelancer
    const result = await pool.query(`
      INSERT INTO freelancers (
        name, email, title, bio, 
        linkedin_url, portfolio_url, website_url,
        location, country, status, payment_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'unpaid')
      RETURNING id
    `, [name, email, title, bio, linkedin_url, portfolio_url, website_url, location, country]);
    
    console.log(`✅ Freelancer application: ${name} (${email})`);
    
    // TODO: Send email to Ot about new application
    
    res.json({
      success: true,
      message: 'Application received! We will contact you within 24 hours with payment details.',
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('Freelancer apply error:', error);
    res.status(500).json({ error: 'Application failed' });
  }
});

// Submit writing test (AFTER PAYMENT)
app.post('/api/freelancers/submit-test', async (req, res) => {
  const { email, writing_sample } = req.body;
  
  if (!email || !writing_sample) {
    return res.status(400).json({ error: 'Email and writing sample required' });
  }
  
  try {
    const result = await pool.query(`
      UPDATE freelancers 
      SET 
        writing_sample = $1,
        test_submitted_at = NOW(),
        has_score = false
      WHERE email = $2 
        AND status = 'active'
        AND payment_status = 'paid'
      RETURNING id
    `, [writing_sample, email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Freelancer not found or payment not completed' 
      });
    }
    
    console.log(`✅ Writing test submitted: ${email}`);
    
    // TODO: Notify Ot to review
    
    res.json({
      success: true,
      message: 'Writing test submitted! Your score will be reviewed within 48 hours.'
    });
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// ============================================
// ADMIN: Manage Freelancers
// ============================================

// Get all freelancers (ADMIN)
app.get('/api/admin/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      freelancers: result.rows
    });
  } catch (error) {
    console.error('Admin get freelancers error:', error);
    res.status(500).json({ error: 'Failed to load' });
  }
});

// Approve freelancer & activate (ADMIN)
app.post('/api/admin/freelancers/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { subscription_months } = req.body;
  
  try {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (subscription_months || 1));
    
    await pool.query(`
      UPDATE freelancers 
      SET 
        status = 'active',
        payment_status = 'paid',
        subscription_expires_at = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [expiresAt, id]);
    
    res.json({ success: true, message: 'Freelancer activated' });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// Review writing test & assign score (ADMIN)
app.post('/api/admin/freelancers/:id/review-test', async (req, res) => {
  const { id } = req.params;
  const { score } = req.body;
  
  if (score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be 0-100' });
  }
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET 
        score = $1,
        has_score = true,
        test_reviewed_at = NOW()
      WHERE id = $2
    `, [score, id]);
    
    console.log(`✅ Score assigned: ${score} for freelancer #${id}`);
    
    res.json({ success: true, message: 'Score assigned' });
  } catch (error) {
    console.error('Review test error:', error);
    res.status(500).json({ error: 'Failed to assign score' });
  }
});

// Toggle featured status (ADMIN)
app.post('/api/admin/freelancers/:id/toggle-featured', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET is_featured = NOT is_featured
      WHERE id = $1
    `, [id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle' });
  }
});

// Update display order (ADMIN)
app.post('/api/admin/freelancers/:id/order', async (req, res) => {
  const { id } = req.params;
  const { order } = req.body;
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET display_order = $1
      WHERE id = $2
    `, [order, id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
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

app.patch('/api/scans/:id/company', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name } = req.body;
    
    if (!company_name) {
      return res.status(400).json({ success: false, error: 'Company name required' });
    }
    
    await pool.query(
      'UPDATE scans SET company_name = $1 WHERE id = $2',
      [company_name, id]
    );
    
    res.json({ success: true, message: 'Company name updated' });
  } catch (error) {
    console.error('Update company name error:', error);
    res.status(500).json({ success: false, error: error.message });
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
      `INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, scans_used, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'active')`,
      [shareCode, client_email, client_name, client_company || '', scans_limit || 5, expiresAt]
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
// LEADERBOARD ENDPOINTS
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
// BULK DELETE LEADERBOARD ENTRIES
// ============================================
app.post('/api/admin/leaderboard/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    
    const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'Invalid IDs' });
    }
    
    const result = await pool.query(
      `DELETE FROM leaderboard WHERE id = ANY($1::int[])`,
      [validIds]
    );
    
    res.json({
      success: true,
      deleted: result.rowCount,
      message: `Deleted ${result.rowCount} entries`
    });
    
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCAN ALL AGENCIES IN LEADERBOARD
// ============================================
app.post('/api/admin/scan-all-agencies', async (req, res) => {
  try {
    // Get all agencies from leaderboard
    const result = await pool.query(`
      SELECT id, url, company_name 
      FROM leaderboard 
      WHERE is_opted_out = FALSE 
      ORDER BY id
    `);
    
    const agencies = result.rows;
    
    if (agencies.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No agencies to scan',
        scanned: 0,
        failed: 0
      });
    }
    
    let scanned = 0;
    let failed = 0;
    const updates = [];
    
    console.log(`🔄 Starting scan of ${agencies.length} agencies...`);
    
    // Scan each agency
    for (const agency of agencies) {
      try {
        console.log(`🔍 Scanning: ${agency.url}`);
        
        const response = await fetch(agency.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (ContentScale Scanner)' },
          timeout: 10000
        });
        
        if (!response.ok) {
          console.log(`❌ Failed to fetch: ${agency.url}`);
          failed++;
          continue;
        }
        
        const html = await response.text();
        
        // Calculate GRAAF score
        let graafScore = 0;
        const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(html);
        graafScore += hasQuotes ? 8 : 0;
        const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(html);
        graafScore += hasStats ? 8 : 0;
        const hasFreshDates = /202[4-5]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(html);
        graafScore += hasFreshDates ? 8 : 2;
        const hasAuthor = /author|by |written by|published by|contributor/gi.test(html);
        graafScore += hasAuthor ? 8 : 0;
        const textContent = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
        const wordCount = textContent.length;
        graafScore += Math.min(18, Math.floor(wordCount / 100));
        graafScore = Math.min(50, graafScore);
        
        // Calculate CRAFT score
        let craftScore = 0;
        const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
        craftScore += h1s === 1 ? 8 : h1s > 1 ? 4 : 2;
        const h2h3s = (html.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
        craftScore += Math.min(10, h2h3s * 2);
        const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
        craftScore += Math.min(8, Math.floor(paragraphs / 3));
        const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(html);
        craftScore += hasLists ? 4 : 0;
        craftScore = Math.min(30, craftScore);
        
        // Calculate Technical score
        let technicalScore = 0;
        const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
        technicalScore += metaDesc && metaDesc.length > 50 ? 4 : 2;
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : null;
        technicalScore += title && title.length > 30 ? 4 : 2;
        const allImages = (html.match(/<img[^>]*>/gi) || []).length;
        const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
        if (allImages > 0) {
          technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
        }
        const hasViewport = /<meta\s+name="viewport"/gi.test(html);
        technicalScore += hasViewport ? 3 : 0;
        const hasSchema = /"@context"|"@type"/gi.test(html);
        technicalScore += hasSchema ? 3 : 0;
        technicalScore = Math.min(20, technicalScore);
        
        const totalScore = graafScore + craftScore + technicalScore;
        
        // Update leaderboard
        await pool.query(`
          UPDATE leaderboard 
          SET score = $1, last_scan = NOW() 
          WHERE id = $2
        `, [totalScore, agency.id]);
        
        updates.push({
          url: agency.url,
          company_name: agency.company_name,
          score: totalScore
        });
        
        scanned++;
        console.log(`✅ Updated: ${agency.url} - Score: ${totalScore}`);
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error scanning ${agency.url}:`, error.message);
        failed++;
      }
    }
    
    console.log(`✅ Scan complete: ${scanned} scanned, ${failed} failed`);
    
    res.json({
      success: true,
      message: `Scanned ${scanned} agencies, ${failed} failed`,
      scanned,
      failed,
      total: agencies.length,
      updates
    });
    
  } catch (error) {
    console.error('Scan all agencies error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
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
// CHECK IF URL IS BLOCKED
// ============================================
app.get('/api/leaderboard/check-status/:encodedUrl', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.encodedUrl);
    
    const result = await pool.query(`
      SELECT id, reason FROM leaderboard_blocks 
      WHERE url = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `, [url]);
    
    if (result.rows.length > 0) {
      res.json({
        blocked: true,
        reason: result.rows[0].reason
      });
    } else {
      res.json({ blocked: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
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
// IP RATE LIMIT CHECK
// ============================================
async function checkIPLimit(ip) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT submission_count FROM submission_limits 
      WHERE ip_address = $1 AND submission_date = $2
    `, [ip, today]);
    
    if (result.rows.length > 0) {
      const count = result.rows[0].submission_count;
      const MAX_PER_DAY = 3;
      
      if (count >= MAX_PER_DAY) {
        return { limited: true, count, max: MAX_PER_DAY };
      }
      
      return { limited: false, count };
    }
    
    return { limited: false, count: 0 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { limited: false, count: 0 };
  }
}

// ============================================
// GET CLIENT IP
// ============================================
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0').split(',')[0].trim();
}

// ============================================
// LEADERBOARD SUBMIT (WITH SECURITY)
// ============================================
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, company_name, country } = req.body;
    const ip = getClientIP(req);
    
    if (!url || score === undefined) {
      return res.status(400).json({ error: 'URL and score required' });
    }
    
    const blocked = await pool.query(`
      SELECT id FROM leaderboard_blocks 
      WHERE url = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `, [url]);
    
    if (blocked.rows.length > 0) {
      return res.status(403).json({ 
        error: 'This URL cannot be submitted to the leaderboard'
      });
    }
    
    const limitCheck = await checkIPLimit(ip);
    if (limitCheck.limited) {
      return res.status(429).json({
        error: `Rate limit exceeded: ${limitCheck.count}/${limitCheck.max} submissions today`,
        retryAfter: '24 hours'
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const duplicate = await pool.query(`
      SELECT id FROM leaderboard 
      WHERE url = $1 AND DATE(created_at) = $2
    `, [url, today]);
    
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ 
        error: 'This URL already submitted today. Max 1 submission per URL per day' 
      });
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
    
    // Try to log submission (optional - won't crash if table doesn't exist)
    try {
      await pool.query(`
        INSERT INTO submission_logs 
        (url, company_name, ip_address, country, score, submitted_via, status, leaderboard_entry_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [url, company_name, ip, country, score, 'api', 'approved', leaderboardEntryId]);
    } catch (logError) {
      console.log('Note: submission_logs table not found, skipping log');
    }
    
    const today_date = new Date().toISOString().split('T')[0];
    await pool.query(`
      INSERT INTO submission_limits (ip_address, submission_date, submission_count)
      VALUES ($1, $2, 1)
      ON CONFLICT (ip_address, submission_date) DO UPDATE
      SET submission_count = submission_count + 1, last_submitted_at = NOW()
    `, [ip, today_date]);
    
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
// PUBLIC SCANNER API
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url, shareKey } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  // ============================================
  // SHARELINK ENFORCEMENT
  // ============================================
  if (shareKey) {
    try {
      const shareLinkResult = await pool.query(
        'SELECT * FROM share_links WHERE share_code = $1',
        [shareKey]
      );
      
      if (shareLinkResult.rows.length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Invalid share link',
          limitReached: true
        });
      }
      
      const shareLink = shareLinkResult.rows[0];
      
      // Check if expired
      if (new Date(shareLink.expires_at) < new Date()) {
        return res.status(403).json({ 
          success: false,
          error: 'Share link expired. Contact Ot for renewal.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20verlopen.'
        });
      }
      
      // Check if inactive
      if (shareLink.status !== 'active') {
        return res.status(403).json({ 
          success: false,
          error: 'Share link inactive. Contact Ot.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20niet%20actief.'
        });
      }
      
      // Check scan limit
      if (shareLink.scans_used >= shareLink.scans_limit) {
        return res.status(403).json({ 
          success: false,
          error: `Scan limiet bereikt (${shareLink.scans_limit}/${shareLink.scans_limit}). Contact Ot voor meer scans.`,
          limitReached: true,
          scansUsed: shareLink.scans_used,
          scansLimit: shareLink.scans_limit,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20scan%20limiet%20is%20bereikt.%20Kan%20ik%20meer%20scans%20krijgen?'
        });
      }
      
      console.log(`✅ Sharelink valid: ${shareKey} (${shareLink.scans_used + 1}/${shareLink.scans_limit})`);
      
    } catch (error) {
      console.error('Sharelink check error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Sharelink verification failed' 
      });
    }
  }

  
  try {
    console.log(`🔍 Scanning: ${url}`);
    
    // ADD CACHE-BUSTING HEADERS
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (ContentScale Scanner)',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: 'no-store',
      timeout: 10000
    });
    
    if (!response.ok) {
      return res.status(400).json({ error: 'Cannot fetch URL' });
    }
    
    const html = await response.text();
    
    let graafScore = 0;
    const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(html);
    graafScore += hasQuotes ? 8 : 0;
    const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(html);
    graafScore += hasStats ? 8 : 0;
    const hasFreshDates = /202[4-5]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(html);
    graafScore += hasFreshDates ? 8 : 2;
    const hasAuthor = /author|by |written by|published by|contributor/gi.test(html);
    graafScore += hasAuthor ? 8 : 0;
    const textContent = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
    const wordCount = textContent.length;
    graafScore += Math.min(18, Math.floor(wordCount / 100));
    graafScore = Math.min(50, graafScore);
    
    let craftScore = 0;
    const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
    craftScore += h1s === 1 ? 8 : h1s > 1 ? 4 : 2;
    const h2h3s = (html.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
    craftScore += Math.min(10, h2h3s * 2);
    const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
    craftScore += Math.min(8, Math.floor(paragraphs / 3));
    const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(html);
    craftScore += hasLists ? 4 : 0;
    craftScore = Math.min(30, craftScore);
    
    let technicalScore = 0;
    const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
    technicalScore += metaDesc && metaDesc.length > 50 ? 4 : 2;
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;
    technicalScore += title && title.length > 30 ? 4 : 2;
    const allImages = (html.match(/<img[^>]*>/gi) || []).length;
    const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
    if (allImages > 0) {
      technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
    }
    const hasViewport = /<meta\s+name="viewport"/gi.test(html);
    technicalScore += hasViewport ? 3 : 0;
    const hasSchema = /"@context"|"@type"/gi.test(html);
    technicalScore += hasSchema ? 3 : 0;
    technicalScore = Math.min(20, technicalScore);
    
    const totalScore = graafScore + craftScore + technicalScore;
    const quality = totalScore >= 90 ? 'excellent' : totalScore >= 75 ? 'good' : totalScore >= 60 ? 'average' : totalScore >= 45 ? 'below-average' : 'poor';
    
    // Extended recommendations with actionable details
    const recommendations = [];
    
    // GRAAF Framework Recommendations
    if (!hasQuotes) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Credibility',
        title: 'Add Expert Quotes',
        description: 'Include 2-3 expert quotes to boost credibility',
        impact: 'High',
        points: '+8 points',
        howToFix: '1. Interview industry experts\n2. Add quotes with full attribution (name, title, company)\n3. Use phrases like "According to [Name], [Title] at [Company]"',
        example: '"According to John Smith, SEO Director at TechCorp, content quality is the #1 ranking factor in 2025."'
      });
    }
    
    if (!hasStats) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Accuracy',
        title: 'Add Statistics & Data',
        description: 'Include research data and verified statistics',
        impact: 'High',
        points: '+8 points',
        howToFix: '1. Find recent research (2024-2025)\n2. Add specific numbers and percentages\n3. Cite sources for all statistics',
        example: '"According to a 2025 study by HubSpot, 67% of marketers say content quality improved rankings."'
      });
    }
    
    if (!hasFreshDates) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Freshness',
        title: 'Add Freshness Signals',
        description: 'Include 2025 dates and current month references',
        impact: 'Medium',
        points: '+6 points',
        howToFix: '1. Add "Updated January 2025" badge\n2. Reference current events\n3. Use "2025" in H2/H3 headings',
        example: 'Title: "SEO Best Practices for 2025" instead of "SEO Best Practices"'
      });
    }
    
    if (!hasAuthor) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Credibility',
        title: 'Add Author Bio',
        description: 'Display author credentials and expertise',
        impact: 'High',
        points: '+8 points',
        howToFix: '1. Add author name and photo\n2. Include credentials and experience\n3. Add social proof (LinkedIn, certifications)',
        example: 'Written by Jane Doe, SEO Specialist with 10+ years experience, Google Analytics Certified'
      });
    }
    
    if (wordCount < 500) {
      recommendations.push({
        type: 'major',
        category: 'GRAAF - Actionability',
        title: 'Expand Content Length',
        description: `Current: ${wordCount} words. Target: 1000+ words`,
        impact: 'Medium',
        points: '+10 points',
        howToFix: '1. Add step-by-step guides\n2. Include real examples\n3. Add case studies\n4. Create FAQ section',
        example: 'Add 5-7 detailed how-to steps with screenshots'
      });
    }
    
    // CRAFT Framework Recommendations
    if (h1s !== 1) {
      recommendations.push({
        type: 'quickwin',
        category: 'CRAFT - Format',
        title: 'Fix H1 Tags',
        description: `Found ${h1s} H1 tags. Each page should have exactly ONE H1`,
        impact: 'High',
        points: h1s === 0 ? '+6 points' : '+4 points',
        howToFix: h1s === 0 
          ? '1. Add one <h1> tag at the top of your page\n2. Include your target keyword\n3. Make it 50-60 characters'
          : '1. Keep only the main page title as H1\n2. Change other H1s to H2 or H3\n3. Maintain heading hierarchy',
        example: '<h1>Ultimate Guide to SEO Content in 2025</h1>'
      });
    }
    
    if (h2h3s < 5) {
      recommendations.push({
        type: 'quickwin',
        category: 'CRAFT - Format',
        title: 'Add More Subheadings',
        description: `Found ${h2h3s} H2/H3 tags. Add 5+ subheadings for better structure`,
        impact: 'Medium',
        points: '+5 points',
        howToFix: '1. Break content into sections\n2. Use H2 for main sections\n3. Use H3 for sub-sections\n4. Include keywords in headings',
        example: '<h2>What is SEO Content?</h2>\n<h3>Key Components of SEO Content</h3>'
      });
    }
    
    if (!hasLists) {
      recommendations.push({
        type: 'quickwin',
        category: 'CRAFT - Format',
        title: 'Add Lists for Scannability',
        description: 'No lists found. Add bullet points or numbered lists',
        impact: 'Medium',
        points: '+4 points',
        howToFix: '1. Convert long paragraphs to lists\n2. Use numbered lists for steps\n3. Use bullet points for features',
        example: '<ul>\n  <li>Benefit 1: Improved rankings</li>\n  <li>Benefit 2: More traffic</li>\n</ul>'
      });
    }
    
    // Technical SEO Recommendations
    if (!metaDesc) {
      recommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Meta Description',
        description: 'Missing meta description. Critical for click-through rate',
        impact: 'High',
        points: '+2 points',
        howToFix: '1. Write 150-160 characters\n2. Include target keyword\n3. Add compelling call-to-action',
        example: '<meta name="description" content="Learn SEO content creation with our proven 2025 framework. Boost rankings by 67% in 90 days. Start today!">'
      });
    }
    
    if (!hasViewport) {
      recommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Mobile Viewport',
        description: 'Missing viewport meta tag for mobile responsiveness',
        impact: 'High',
        points: '+3 points',
        howToFix: '1. Add viewport meta tag to <head>\n2. Test on mobile devices\n3. Ensure responsive design',
        example: '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      });
    }
    
    if (!hasSchema) {
      recommendations.push({
        type: 'major',
        category: 'Technical SEO',
        title: 'Add Schema Markup',
        description: 'Implement JSON-LD schema for rich snippets',
        impact: 'Medium',
        points: '+3 points',
        howToFix: '1. Add Article schema\n2. Add FAQPage schema if you have FAQs\n3. Add HowTo schema for guides\n4. Test with Google Rich Results Test',
        example: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "Your Title"\n}\n</script>'
      });
    }
    
    if (allImages > 0 && imagesWithAlt < allImages) {
      const missingAlt = allImages - imagesWithAlt;
      recommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Alt Text to Images',
        description: `${missingAlt} of ${allImages} images missing alt text`,
        impact: 'Medium',
        points: '+2 points',
        howToFix: '1. Add descriptive alt text to every image\n2. Include keywords naturally\n3. Describe image content for accessibility',
        example: '<img src="chart.jpg" alt="SEO ranking factors chart showing top 10 metrics for 2025">'
      });
    }
    
    // Priority order
    const quickWins = recommendations.filter(r => r.type === 'quickwin');
    const majorImprovements = recommendations.filter(r => r.type === 'major');
    
    const scanResult = {
      success: true,
      url,
      score: totalScore,
      quality,
      metrics: {graaf: graafScore, craft: craftScore, technical: technicalScore},
      breakdown: {
        graaf: {
          total: graafScore, 
          max: 50, 
          percentage: Math.round((graafScore / 50) * 100),
          items: {
            credibility: hasQuotes && hasAuthor ? 16 : hasQuotes ? 8 : hasAuthor ? 8 : 0,
            relevance: Math.min(18, Math.floor(wordCount / 100)),
            accuracy: hasStats ? 8 : 0,
            freshness: hasFreshDates ? 8 : 2
          }
        },
        craft: {
          total: craftScore, 
          max: 30, 
          percentage: Math.round((craftScore / 30) * 100),
          items: {
            headingStructure: h1s === 1 ? 8 : h1s > 1 ? 4 : 2,
            subheadings: Math.min(10, h2h3s * 2),
            paragraphs: Math.min(8, Math.floor(paragraphs / 3)),
            lists: hasLists ? 4 : 0
          }
        },
        technical: {
          total: technicalScore, 
          max: 20, 
          percentage: Math.round((technicalScore / 20) * 100),
          items: {
            metaDescription: metaDesc && metaDesc.length > 50 ? 4 : 2,
            title: title && title.length > 30 ? 4 : 2,
            imageAlt: allImages > 0 ? Math.min(4, Math.floor((imagesWithAlt / allImages) * 4)) : 0,
            viewport: hasViewport ? 3 : 0,
            schema: hasSchema ? 3 : 0
          }
        }
      },
      recommendations: {
        all: recommendations,
        quickWins: quickWins,
        majorImprovements: majorImprovements,
        totalRecommendations: recommendations.length,
        potentialScoreIncrease: recommendations.reduce((sum, r) => {
          const points = parseInt(r.points.match(/\d+/)?.[0] || 0);
          return sum + points;
        }, 0)
      },
      details: {
        wordCount,
        h1Count: h1s,
        h2h3Count: h2h3s,
        paragraphCount: paragraphs,
        imageCount: allImages,
        imagesWithAlt: imagesWithAlt,
        hasQuotes,
        hasStats,
        hasFreshDates,
        hasAuthor,
        hasLists,
        hasViewport,
        hasSchema,
        metaDescription: metaDesc ? metaDesc.substring(0, 160) : null,
        title: title
      },
      timestamp: new Date().toISOString()
    };
    
    try {
      await pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [url, totalScore, quality, graafScore, craftScore, technicalScore, JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), 'manual']
      );
      console.log(`✅ Scan saved: ${url} (Score: ${totalScore})`);
    } catch (error) {
      console.error('DB save error:', error);
    }

    // Increment sharelink usage
    if (shareKey) {
      try {
        await pool.query(
          'UPDATE share_links SET scans_used = scans_used + 1 WHERE share_code = $1',
          [shareKey]
        );
        console.log(`📊 Sharelink usage updated: ${shareKey}`);
      } catch (error) {
        console.error('Sharelink update error:', error);
      }
    }
    
    res.json(scanResult);
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EXPORT SCAN RESULTS
// ============================================
app.get('/api/export/scan/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { url, score, recommendations } = req.query;
    
    if (!url || !score) {
      return res.status(400).json({ error: 'URL and score required' });
    }
    
    const parsedRecommendations = recommendations ? JSON.parse(decodeURIComponent(recommendations)) : [];
    
    if (format === 'csv') {
      // Generate CSV
      let csv = 'Category,Title,Description,Impact,Points,How to Fix\n';
      
      if (parsedRecommendations.all) {
        parsedRecommendations.all.forEach(rec => {
          const howToFix = (rec.howToFix || '').replace(/\n/g, ' ').replace(/"/g, '""');
          csv += `"${rec.category}","${rec.title}","${rec.description}","${rec.impact}","${rec.points}","${howToFix}"\n`;
        });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.csv"`);
      res.send(csv);
      
    } else if (format === 'json') {
      // Generate JSON
      const exportData = {
        url: decodeURIComponent(url),
        score: parseInt(score),
        recommendations: parsedRecommendations,
        exportedAt: new Date().toISOString(),
        generatedBy: 'ContentScale SEO Scanner'
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.json"`);
      res.json(exportData);
      
    } else if (format === 'txt') {
      // Generate TXT report
      let txt = `ContentScale SEO Scan Report\n`;
      txt += `${'='.repeat(50)}\n\n`;
      txt += `URL: ${decodeURIComponent(url)}\n`;
      txt += `Score: ${score}/100\n`;
      txt += `Scanned: ${new Date().toISOString()}\n\n`;
      
      if (parsedRecommendations.quickWins && parsedRecommendations.quickWins.length > 0) {
        txt += `QUICK WINS (${parsedRecommendations.quickWins.length})\n`;
        txt += `${'-'.repeat(50)}\n`;
        parsedRecommendations.quickWins.forEach((rec, i) => {
          txt += `\n${i + 1}. ${rec.title} (${rec.points})\n`;
          txt += `   Category: ${rec.category}\n`;
          txt += `   Impact: ${rec.impact}\n`;
          txt += `   ${rec.description}\n`;
          if (rec.howToFix) {
            txt += `   How to fix:\n`;
            txt += `   ${rec.howToFix.replace(/\n/g, '\n   ')}\n`;
          }
        });
        txt += `\n`;
      }
      
      if (parsedRecommendations.majorImprovements && parsedRecommendations.majorImprovements.length > 0) {
        txt += `\nMAJOR IMPROVEMENTS (${parsedRecommendations.majorImprovements.length})\n`;
        txt += `${'-'.repeat(50)}\n`;
        parsedRecommendations.majorImprovements.forEach((rec, i) => {
          txt += `\n${i + 1}. ${rec.title} (${rec.points})\n`;
          txt += `   Category: ${rec.category}\n`;
          txt += `   Impact: ${rec.impact}\n`;
          txt += `   ${rec.description}\n`;
          if (rec.howToFix) {
            txt += `   How to fix:\n`;
            txt += `   ${rec.howToFix.replace(/\n/g, '\n   ')}\n`;
          }
        });
      }
      
      txt += `\n${'='.repeat(50)}\n`;
      txt += `Generated by ContentScale - https://contentscale.site\n`;
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.txt"`);
      res.send(txt);
      
    } else {
      res.status(400).json({ error: 'Invalid format. Use: csv, json, or txt' });
    }
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLAIM PROFILE & EMAIL ENDPOINTS
// ============================================

// Fill email template with variables
function fillEmailTemplate(template, variables) {
  let filled = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{${key}}`, 'g');
    filled = filled.replace(regex, variables[key] || '');
  });
  return filled;
}

// Send email (mock version - logs to console and database)
async function sendEmail(to, subject, html, templateName = null) {
  try {
    // Log email to database
    await pool.query(
      `INSERT INTO email_logs (to_email, subject, template_used, status, sent_at) 
       VALUES ($1, $2, $3, 'sent', NOW())`,
      [to, subject, templateName]
    );
    
    // For development: log to console
    console.log('📧 EMAIL SENT:', {
      to,
      subject,
      template: templateName,
      preview: html.substring(0, 100) + '...'
    });
    
    // Uncomment this to send real emails via nodemailer:
    /*
    await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'ContentScale <noreply@contentscale.site>',
      to,
      subject,
      html
    });
    */
    
    return { success: true };
  } catch (error) {
    // Log failed email
    await pool.query(
      `INSERT INTO email_logs (to_email, subject, template_used, status, error_message, sent_at) 
       VALUES ($1, $2, $3, 'failed', $4, NOW())`,
      [to, subject, templateName, error.message]
    );
    
    console.error('❌ EMAIL ERROR:', error);
    return { success: false, error: error.message };
  }
}

// Generate unique opt-out token
function generateOptOutToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Submit profile claim
app.post('/api/claim-profile', async (req, res) => {
  try {
    const { 
      url, 
      name, 
      logo_url, 
      description, 
      specializations, 
      country, 
      agency_size, 
      contact_email 
    } = req.body;
    
    // Validation
    if (!url || !name || !contact_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL, name, and contact email are required' 
      });
    }
    
    // Check if already claimed
    const existing = await pool.query(
      'SELECT * FROM profile_claims WHERE url = $1 AND status != $2',
      [url, 'rejected']
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'This profile has already been claimed and is pending review' 
      });
    }
    
    // Insert claim
    const result = await pool.query(
      `INSERT INTO profile_claims 
      (url, name, logo_url, description, specializations, country, agency_size, contact_email, status, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW()) 
      RETURNING *`,
      [
        url, 
        name, 
        logo_url, 
        description, 
        JSON.stringify(specializations), 
        country, 
        agency_size, 
        contact_email
      ]
    );
    
    // Send confirmation email
    const emailTemplate = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1',
      ['claim_submitted']
    );
    
    if (emailTemplate.rows.length > 0) {
      const html = fillEmailTemplate(emailTemplate.rows[0].body, {
        agency_name: name,
        url: url
      });
      
      await sendEmail(
        contact_email,
        emailTemplate.rows[0].subject,
        html,
        'claim_submitted'
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Profile claim submitted! We will review within 24 hours.',
      claim_id: result.rows[0].id 
    });
    
  } catch (error) {
    console.error('Claim profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Public opt-out
app.post('/api/optout', async (req, res) => {
  try {
    const { token, reason } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token is required' 
      });
    }
    
    // Find opt-out request by token
    const result = await pool.query(
      `UPDATE optout_requests 
       SET processed = true, processed_at = NOW() 
       WHERE token = $1 AND processed = false 
       RETURNING url`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or already processed opt-out token' 
      });
    }
    
    const url = result.rows[0].url;
    
    // Remove from leaderboard
    await pool.query('DELETE FROM leaderboard WHERE url = $1', [url]);
    
    res.json({ 
      success: true, 
      message: 'You have been successfully removed from the leaderboard' 
    });
    
  } catch (error) {
    console.error('Opt-out error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get pending claims
app.get('/api/admin/claims/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM profile_claims 
       WHERE status = 'pending' 
       ORDER BY created_at DESC`
    );
    
    res.json({ 
      success: true, 
      claims: result.rows 
    });
    
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Approve claim
app.post('/api/admin/claims/approve/:claim_id', async (req, res) => {
  try {
    const { claim_id } = req.params;
    
    // Get claim details
    const claim = await pool.query(
      'SELECT * FROM profile_claims WHERE id = $1',
      [claim_id]
    );
    
    if (claim.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Claim not found' 
      });
    }
    
    const claimData = claim.rows[0];
    
    // Update claim status
    await pool.query(
      `UPDATE profile_claims 
       SET status = 'approved', reviewed_at = NOW() 
       WHERE id = $1`,
      [claim_id]
    );
    
    // Update leaderboard entry
    await pool.query(
      `UPDATE leaderboard 
       SET claimed = true,
           logo_url = $1,
           description = $2,
           specializations = $3,
           agency_size = $4,
           contact_email = $5,
           verified = true
       WHERE url = $6`,
      [
        claimData.logo_url,
        claimData.description,
        claimData.specializations,
        claimData.agency_size,
        claimData.contact_email,
        claimData.url
      ]
    );
    
    // Send approval email
    const emailTemplate = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1',
      ['claim_approved']
    );
    
    if (emailTemplate.rows.length > 0 && claimData.contact_email) {
      const html = fillEmailTemplate(emailTemplate.rows[0].body, {
        agency_name: claimData.name,
        url: claimData.url,
        specializations: JSON.parse(claimData.specializations || '[]').join(', '),
        leaderboard_url: `${process.env.BASE_URL || 'https://contentscale.site'}/leaderboard`
      });
      
      await sendEmail(
        claimData.contact_email,
        emailTemplate.rows[0].subject,
        html,
        'claim_approved'
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Claim approved and profile updated' 
    });
    
  } catch (error) {
    console.error('Approve claim error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Reject claim
app.post('/api/admin/claims/reject/:claim_id', async (req, res) => {
  try {
    const { claim_id } = req.params;
    const { reason } = req.body;
    
    await pool.query(
      `UPDATE profile_claims 
       SET status = 'rejected', reviewed_at = NOW() 
       WHERE id = $1`,
      [claim_id]
    );
    
    res.json({ 
      success: true, 
      message: 'Claim rejected' 
    });
    
  } catch (error) {
    console.error('Reject claim error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get email templates
app.get('/api/admin/email-templates', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY name'
    );
    
    res.json({ 
      success: true, 
      templates: result.rows 
    });
    
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send bulk emails
app.post('/api/admin/send-bulk-email', async (req, res) => {
  try {
    const { template_name, recipients } = req.body;
    
    // Get template
    const template = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1',
      [template_name]
    );
    
    if (template.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Template not found' 
      });
    }
    
    const emailTemplate = template.rows[0];
    let sent = 0;
    let failed = 0;
    
    // Send to each recipient
    for (const recipient of recipients) {
      const html = fillEmailTemplate(emailTemplate.body, recipient.variables || {});
      
      const result = await sendEmail(
        recipient.email,
        emailTemplate.subject,
        html,
        template_name
      );
      
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({ 
      success: true, 
      message: `Emails sent: ${sent}, Failed: ${failed}`,
      sent,
      failed
    });
    
  } catch (error) {
    console.error('Bulk email error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create opt-out request (admin manually adds agency to optout)
app.post('/api/admin/optout/create', async (req, res) => {
  try {
    const { url, reason } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }
    
    const token = generateOptOutToken();
    
    await pool.query(
      `INSERT INTO optout_requests (url, reason, token, created_at, processed, processed_at) 
       VALUES ($1, $2, $3, NOW(), true, NOW())`,
      [url, reason || 'Admin request', token]
    );
    
    // Remove from leaderboard
    await pool.query('DELETE FROM leaderboard WHERE url = $1', [url]);
    
    res.json({ 
      success: true, 
      message: 'Agency removed from leaderboard' 
    });
    
  } catch (error) {
    console.error('Create opt-out error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all opt-out requests
app.get('/api/admin/optouts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM optout_requests 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    
    res.json({ 
      success: true, 
      requests: result.rows 
    });
    
  } catch (error) {
    console.error('Get opt-outs error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get email logs
app.get('/api/admin/email-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const result = await pool.query(
      `SELECT * FROM email_logs 
       ORDER BY sent_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    res.json({ 
      success: true, 
      logs: result.rows 
    });
    
  } catch (error) {
    console.error('Get email logs error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send leaderboard addition email (helper function)
async function sendLeaderboardAdditionEmail(agencyData) {
  try {
    const template = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1',
      ['leaderboard_addition']
    );
    
    if (template.rows.length === 0) {
      console.log('❌ Template "leaderboard_addition" not found');
      return;
    }
    
    const optoutToken = generateOptOutToken();
    
    // Create opt-out request
    await pool.query(
      `INSERT INTO optout_requests (url, token, created_at, processed) 
       VALUES ($1, $2, NOW(), false)`,
      [agencyData.url, optoutToken]
    );
    
    const variables = {
      agency_name: agencyData.name || 'Agency',
      score: agencyData.score || 0,
      position: agencyData.position || '?',
      country: agencyData.country || 'Global',
      url: agencyData.url,
      claim_url: `${process.env.BASE_URL || 'https://contentscale.site'}/leaderboard?claim=${encodeURIComponent(agencyData.url)}`,
      optout_url: `${process.env.BASE_URL || 'https://contentscale.site'}/optout?token=${optoutToken}`
    };
    
    const html = fillEmailTemplate(template.rows[0].body, variables);
    
    // Try to find email for this agency
    let toEmail = agencyData.contact_email;
    
    if (!toEmail) {
      // Try to extract from URL or use placeholder
      console.log(`⚠️ No email found for ${agencyData.url}, skipping email`);
      return;
    }
    
    await sendEmail(
      toEmail,
      template.rows[0].subject,
      html,
      'leaderboard_addition'
    );
    
    console.log(`✅ Leaderboard addition email sent to ${toEmail}`);
    
  } catch (error) {
    console.error('❌ Error sending leaderboard addition email:', error);
  }
}

console.log('✅ Claim Profile & Email endpoints loaded');

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.json({ status: 'degraded', database: 'disconnected' });
  }
});

// ============================================
// CATCH-ALL ROUTE
// ============================================
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '../public/index.html'), (err2) => {
        if (err2) {
          res.status(404).json({ error: 'Not found' });
        }
      });
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Something went wrong' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 =====================================');
  console.log('🚀  ContentScale Server Running');
  console.log('🚀 =====================================');
  console.log('');
  console.log('📍 Frontend:  http://localhost:' + PORT);
  console.log('📍 Admin:     http://localhost:' + PORT + '/admin');
  console.log('📍 Health:    http://localhost:' + PORT + '/api/health');
  console.log('');
  console.log('👤 Default Login: ot / admin123');
  console.log('');
});
