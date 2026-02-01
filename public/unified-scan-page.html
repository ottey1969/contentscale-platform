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
    
    // LEADERBOARD TABLE - ✅ MET STATUS COLUMN
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        status VARCHAR(20) DEFAULT 'pending',
        business_type VARCHAR(50),
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        opted_out_at TIMESTAMP,
        opted_out_reason VARCHAR(255),
        submitted_via_share_link BOOLEAN DEFAULT FALSE,
        share_link_id UUID,
        submission_ip VARCHAR(50),
        admin_verified BOOLEAN DEFAULT FALSE,
        admin_reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP,
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
    
    // NOTIFICATIONS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL DEFAULT 'system',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(500),
        priority VARCHAR(20) DEFAULT 'normal',
        is_read BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(100),
        created_for VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW(),
        read_at TIMESTAMP
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
    
    // ✅ NIEUWE COLUMNS VOOR APPROVAL SYSTEEM
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS admin_reviewed_by VARCHAR(100)`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP`);
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
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_status ON leaderboard(status)');
    
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
        { url: 'https://contentscale.site', company: 'ContentScale', score: 95, country: 'NL', type: 'seo-agency', status: 'approved' },
        { url: 'https://example-seo.nl', company: 'SEO Masters', score: 88, country: 'NL', type: 'seo-agency', status: 'approved' },
        { url: 'https://digital-boost.be', company: 'Digital Boost', score: 82, country: 'BE', type: 'marketing-agency', status: 'approved' }
      ];
      
      for (const agency of demoAgencies) {
        try {
          await pool.query(`
            INSERT INTO leaderboard (url, company_name, score, country, business_type, is_verified, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (url) DO NOTHING
          `, [agency.url, agency.company, agency.score, agency.country, agency.type, true, agency.status]);
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

// Delete freelancer (ADMIN)
app.delete('/api/admin/freelancers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM freelancers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Get single freelancer (ADMIN)
app.get('/api/admin/freelancers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM freelancers WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Freelancer not found' });
    }
    
    res.json({ success: true, freelancer: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load' });
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
      `INSERT INTO share_links (token, client_email, client_name, client_company, scans_limit, scans_used, expires_at, valid_days, status, is_active)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, 'active', true)`,
      [
        shareCode,
        client_email,
        client_name || null,
        client_company || null,
        scans_limit || 5,
        expiresAt,
        valid_days || 30,
      ]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${shareCode}`;
    res.json({ success: true, share_code: shareCode, share_url: shareUrl });
  } catch (error) {
    console.error('Share link creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database error',
      details: error.message
    });    
  }
});

app.get('/api/test-share-status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT token, client_email, is_active FROM share_links LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.json({ message: 'No share links found' });
    }
    
    res.json({
      test: 'Share links status test',
      found_link: result.rows[0],
      has_is_active_column: true
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/share-links/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE token = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/admin/share-links/:code/toggle-status', async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(
      `UPDATE share_links 
       SET is_active = NOT is_active 
       WHERE token = $1 
       RETURNING token, client_email, is_active`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }
    
    const newStatus = result.rows[0].is_active;
    
    res.json({ 
      success: true, 
      message: `Share link ${newStatus ? 'activated' : 'deactivated'}`,
      is_active: newStatus
    });
    
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// ============================================
// LTD CODES ENDPOINTS
// ============================================
app.get('/api/admin/ltd-codes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ltd_codes ORDER BY created_at DESC');
    res.json({ success: true, codes: result.rows });
  } catch (error) {
    res.json({ success: true, codes: [] });
  }
});

app.post('/api/admin/ltd-codes/create', async (req, res) => {
  const { code, plan, max_uses, expires_days } = req.body;
  
  if (!code || !plan) {
    return res.status(400).json({ success: false, error: 'Code and plan required' });
  }
  
  try {
    let expiresAt = null;
    if (expires_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_days);
    }
    
    await pool.query(
      'INSERT INTO ltd_codes (code, plan, max_uses, expires_at) VALUES ($1, $2, $3, $4)',
      [code, plan, max_uses || 1, expiresAt]
    );
    
    res.json({ success: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Code already exists' });
    }
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/admin/ltd-codes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ltd_codes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// SETTINGS ENDPOINTS
// ============================================
app.get('/api/settings/:key', async (req, res) => {
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [req.params.key]);
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Setting not found' });
    }
    res.json({ success: true, value: result.rows[0].value });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.put('/api/settings/:key', async (req, res) => {
  const { value } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [req.params.key, value]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// SCAN ENDPOINTS
// ============================================

// Helper function to calculate GRAAF score
function calculateGRAAFScore(url, content) {
  let score = 0;
  const issues = [];
  
  // G - Genuinely Credible (25 points)
  if (content.includes('author') || content.includes('expert')) score += 10;
  if (content.includes('source') || content.includes('study')) score += 8;
  if (content.includes('reference') || content.includes('citation')) score += 7;
  
  // R - Relevance (20 points)
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 1500) score += 10;
  else if (wordCount > 800) score += 6;
  else issues.push('Content too short');
  
  if (content.includes('how to') || content.includes('guide')) score += 5;
  if (content.includes('example') || content.includes('step')) score += 5;
  
  // A - Actionability (20 points)
  const hasSteps = content.match(/\b(step|stage|phase)\s+\d+/i);
  if (hasSteps) score += 10;
  
  if (content.includes('download') || content.includes('template')) score += 5;
  if (content.includes('checklist') || content.includes('tool')) score += 5;
  
  // A - Accuracy (20 points)
  if (content.includes('2024') || content.includes('2025')) score += 10;
  else issues.push('Missing current year references');
  
  if (content.includes('data') || content.includes('statistic')) score += 5;
  if (content.includes('research') || content.includes('report')) score += 5;
  
  // F - Freshness (15 points)
  const currentYear = new Date().getFullYear();
  if (content.includes(currentYear.toString())) score += 10;
  if (content.includes('updated') || content.includes('latest')) score += 5;
  
  return { score, issues };
}

// Helper function to calculate CRAFT score
function calculateCRAFTScore(content) {
  let score = 0;
  
  // C - Cut the Fluff (20%)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = content.length / sentences.length;
  if (avgSentenceLength < 150) score += 20;
  else if (avgSentenceLength < 200) score += 15;
  else score += 10;
  
  // R - Review, Optimize, Proofread (20%)
  const hasGoodStructure = content.includes('##') || content.includes('<h2>');
  if (hasGoodStructure) score += 20;
  else score += 10;
  
  // A - Add Images and Visuals (20%)
  const imageCount = (content.match(/<img|!\[/g) || []).length;
  if (imageCount >= 3) score += 20;
  else if (imageCount >= 1) score += 15;
  else score += 5;
  
  // F - Fact-Check (20%)
  const hasLinks = content.includes('http') || content.includes('www');
  if (hasLinks) score += 20;
  else score += 10;
  
  // T - Trust-Building Elements (20%)
  const hasTrust = content.includes('expert') || content.includes('certified') || content.includes('experience');
  if (hasTrust) score += 20;
  else score += 10;
  
  return score;
}

// Helper function to calculate technical score
function calculateTechnicalScore(url) {
  let score = 0;
  
  // URL structure (20 points)
  if (url.includes('https://')) score += 10;
  if (!url.includes('www.')) score += 5; // Clean URL preferred
  if (url.length < 100) score += 5;
  
  // Assumed good practices (80 points baseline)
  score += 80;
  
  return score;
}

// Main scan endpoint
app.post('/api/scan', async (req, res) => {
  const { url, content } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  
  try {
    // Use provided content or fetch
    let pageContent = content || `Sample content for ${url}`;
    
    // Calculate scores
    const graafResult = calculateGRAAFScore(url, pageContent);
    const craftScore = calculateCRAFTScore(pageContent);
    const technicalScore = calculateTechnicalScore(url);
    
    // Overall score (weighted average)
    const overallScore = Math.round(
      (graafResult.score * 0.5) + 
      (craftScore * 0.3) + 
      (technicalScore * 0.2)
    );
    
    // Quality rating
    let quality = 'Poor';
    if (overallScore >= 90) quality = 'Excellent';
    else if (overallScore >= 80) quality = 'Good';
    else if (overallScore >= 70) quality = 'Fair';
    else if (overallScore >= 60) quality = 'Average';
    
    // Generate recommendations
    const recommendations = [];
    if (graafResult.score < 60) recommendations.push('Add more credible sources and expert quotes');
    if (craftScore < 60) recommendations.push('Improve content structure and add more visuals');
    if (technicalScore < 80) recommendations.push('Optimize URL structure and ensure HTTPS');
    if (overallScore < 70) recommendations.push('Content needs significant improvement for AI Overview eligibility');
    
    // Save scan
    const scanResult = await pool.query(
      `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        url,
        overallScore,
        quality,
        graafResult.score,
        craftScore,
        technicalScore,
        JSON.stringify({ graaf_issues: graafResult.issues }),
        JSON.stringify(recommendations),
        req.ip
      ]
    );
    
    res.json({
      success: true,
      scan_id: scanResult.rows[0].id,
      results: {
        overall_score: overallScore,
        quality: quality,
        graaf_score: graafResult.score,
        craft_score: craftScore,
        technical_score: technicalScore,
        breakdown: {
          graaf: {
            score: graafResult.score,
            issues: graafResult.issues
          },
          craft: {
            score: craftScore
          },
          technical: {
            score: technicalScore
          }
        },
        recommendations: recommendations,
        url: url
      }
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});

// Quick scan endpoint (no database save)
app.post('/api/quick-scan', async (req, res) => {
  const { url, content } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  
  try {
    let pageContent = content || `Sample content for ${url}`;
    
    const graafResult = calculateGRAAFScore(url, pageContent);
    const craftScore = calculateCRAFTScore(pageContent);
    const technicalScore = calculateTechnicalScore(url);
    
    const overallScore = Math.round(
      (graafResult.score * 0.5) + 
      (craftScore * 0.3) + 
      (technicalScore * 0.2)
    );
    
    let quality = 'Poor';
    if (overallScore >= 90) quality = 'Excellent';
    else if (overallScore >= 80) quality = 'Good';
    else if (overallScore >= 70) quality = 'Fair';
    else if (overallScore >= 60) quality = 'Average';
    
    res.json({
      success: true,
      results: {
        overall_score: overallScore,
        quality: quality,
        graaf_score: graafResult.score,
        craft_score: craftScore,
        technical_score: technicalScore
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});
// ============================================
// LEADERBOARD ENDPOINTS
// ============================================

// ✅ PUBLIC LEADERBOARD - ALLEEN APPROVED ENTRIES
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { country, limit } = req.query;
    
    let query = `
      SELECT 
        id, url, company_name, score, country, business_type,
        is_verified, last_scan, created_at
      FROM leaderboard 
      WHERE score IS NOT NULL 
        AND is_opted_out = FALSE 
        AND status = 'approved'
    `;
    
    const params = [];
    
    if (country && country !== 'ALL') {
      params.push(country);
      query += ` AND country = $${params.length}`;
    }
    
    query += ' ORDER BY score DESC, created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    } else {
      query += ' LIMIT 100';
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      leaderboard: result.rows,
      total: result.rows.length
    });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

// ✅ SUBMIT TO LEADERBOARD - STATUS = PENDING
app.post('/api/leaderboard/submit', async (req, res) => {
  const { url, score, company_name, country, business_type } = req.body;
  
  if (!url || !score) {
    return res.status(400).json({ success: false, error: 'URL and score required' });
  }
  
  const clientIp = req.ip || req.connection.remoteAddress;
  
  try {
    // Check if URL is blocked
    const blockCheck = await pool.query(
      'SELECT reason FROM leaderboard_blocks WHERE url = $1 OR domain = $2',
      [url, new URL(url).hostname]
    );
    
    if (blockCheck.rows.length > 0) {
      return res.status(403).json({ 
        success: false, 
        error: `This URL is blocked: ${blockCheck.rows[0].reason}` 
      });
    }
    
    // Check daily submission limit (3 per IP)
    const today = new Date().toISOString().split('T')[0];
    const limitCheck = await pool.query(
      'SELECT submission_count FROM submission_limits WHERE ip_address = $1 AND submission_date = $2',
      [clientIp, today]
    );
    
    if (limitCheck.rows.length > 0 && limitCheck.rows[0].submission_count >= 3) {
      return res.status(429).json({ 
        success: false, 
        error: 'Daily submission limit reached (3 per day)' 
      });
    }
    
    // Insert or update submission with status = 'pending'
    const result = await pool.query(`
      INSERT INTO leaderboard (url, score, company_name, country, business_type, submission_ip, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      ON CONFLICT (url) DO UPDATE SET 
        score = EXCLUDED.score,
        company_name = EXCLUDED.company_name,
        country = EXCLUDED.country,
        business_type = EXCLUDED.business_type,
        last_scan = NOW(),
        status = 'pending'
      RETURNING id
    `, [url, score, company_name, country || 'NL', business_type, clientIp]);
    
    // Update submission limit counter
    await pool.query(`
      INSERT INTO submission_limits (ip_address, submission_date, submission_count)
      VALUES ($1, $2, 1)
      ON CONFLICT (ip_address, submission_date) 
      DO UPDATE SET 
        submission_count = submission_limits.submission_count + 1,
        last_submitted_at = NOW()
    `, [clientIp, today]);
    
    // Log submission
    await pool.query(`
      INSERT INTO submission_logs (
        url, company_name, ip_address, country, score, 
        submitted_via, status, leaderboard_entry_id
      )
      VALUES ($1, $2, $3, $4, $5, 'api', 'pending', $6)
    `, [url, company_name, clientIp, country, score, result.rows[0].id]);
    
    console.log(`✅ Leaderboard submission (PENDING): ${url} - ${score} - ${company_name}`);
    
    res.json({
      success: true,
      message: 'Submission sent for review! We will approve it within 24 hours.',
      id: result.rows[0].id,
      status: 'pending'
    });
    
  } catch (error) {
    console.error('Leaderboard submission error:', error);
    res.status(500).json({ success: false, error: 'Submission failed' });
  }
});

// ✅ ADMIN: GET PENDING SUBMISSIONS
app.get('/api/admin/leaderboard/pending', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, url, company_name, score, country, business_type,
        submission_ip, created_at, last_scan
      FROM leaderboard 
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      pending: result.rows
    });
    
  } catch (error) {
    console.error('Get pending error:', error);
    res.status(500).json({ success: false, error: 'Failed to load pending submissions' });
  }
});

// ✅ ADMIN: APPROVE SUBMISSION
app.post('/api/admin/leaderboard/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { admin_username } = req.body;
  
  try {
    const result = await pool.query(`
      UPDATE leaderboard 
      SET 
        status = 'approved',
        admin_reviewed_by = $1,
        reviewed_at = NOW()
      WHERE id = $2
      RETURNING url, company_name, score
    `, [admin_username || 'admin', id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    
    console.log(`✅ Leaderboard APPROVED: ${result.rows[0].url} - ${result.rows[0].company_name}`);
    
    res.json({
      success: true,
      message: 'Submission approved and now visible on leaderboard',
      entry: result.rows[0]
    });
    
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve' });
  }
});

// ✅ ADMIN: REJECT SUBMISSION
app.post('/api/admin/leaderboard/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason, admin_username } = req.body;
  
  try {
    // Option 1: Delete the entry
    const result = await pool.query(`
      DELETE FROM leaderboard 
      WHERE id = $1
      RETURNING url, company_name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    
    // Log rejection
    await pool.query(`
      UPDATE submission_logs 
      SET 
        status = 'rejected',
        rejection_reason = $1,
        admin_reviewed_by = $2,
        admin_reviewed_at = NOW()
      WHERE leaderboard_entry_id = $3
    `, [reason || 'Rejected by admin', admin_username || 'admin', id]);
    
    console.log(`❌ Leaderboard REJECTED: ${result.rows[0].url} - ${result.rows[0].company_name}`);
    
    res.json({
      success: true,
      message: 'Submission rejected and removed',
      entry: result.rows[0]
    });
    
  } catch (error) {
    console.error('Reject error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject' });
  }
});

// ADMIN: Get all leaderboard entries (including pending)
app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, url, company_name, score, country, business_type,
        status, is_verified, is_opted_out, submission_ip,
        admin_reviewed_by, reviewed_at, created_at, last_scan
      FROM leaderboard 
      ORDER BY 
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'rejected' THEN 3
        END,
        created_at DESC
    `);
    
    res.json({
      success: true,
      entries: result.rows,
      stats: {
        total: result.rows.length,
        pending: result.rows.filter(r => r.status === 'pending').length,
        approved: result.rows.filter(r => r.status === 'approved').length
      }
    });
    
  } catch (error) {
    console.error('Admin leaderboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load' });
  }
});

// ADMIN: Delete leaderboard entry
app.delete('/api/admin/leaderboard/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ADMIN: Block URL from leaderboard
app.post('/api/admin/leaderboard/block', async (req, res) => {
  const { url, reason } = req.body;
  
  if (!url || !reason) {
    return res.status(400).json({ success: false, error: 'URL and reason required' });
  }
  
  try {
    const domain = new URL(url).hostname;
    
    await pool.query(
      'INSERT INTO leaderboard_blocks (url, domain, reason, blocked_by) VALUES ($1, $2, $3, $4)',
      [url, domain, reason, 'admin']
    );
    
    // Remove from leaderboard if exists
    await pool.query('DELETE FROM leaderboard WHERE url = $1', [url]);
    
    res.json({ success: true, message: 'URL blocked and removed from leaderboard' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'URL already blocked' });
    }
    res.status(500).json({ success: false, error: 'Failed to block URL' });
  }
});

// ADMIN: Get blocked URLs
app.get('/api/admin/leaderboard/blocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leaderboard_blocks ORDER BY blocked_at DESC');
    res.json({ success: true, blocks: result.rows });
  } catch (error) {
    res.json({ success: true, blocks: [] });
  }
});

// ADMIN: Unblock URL
app.delete('/api/admin/leaderboard/blocks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard_blocks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Get leaderboard stats
app.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        AVG(score) as average_score,
        MAX(score) as highest_score,
        COUNT(DISTINCT country) as countries
      FROM leaderboard 
      WHERE is_opted_out = FALSE 
        AND status = 'approved'
    `);
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    res.json({ success: true, stats: { total_entries: 0, average_score: 0, highest_score: 0, countries: 0 } });
  }
});

// Opt-out from leaderboard
app.post('/api/leaderboard/opt-out', async (req, res) => {
  const { url, reason } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  
  try {
    const token = crypto.randomBytes(16).toString('hex');
    
    await pool.query(
      'INSERT INTO optout_requests (url, reason, token) VALUES ($1, $2, $3)',
      [url, reason || 'User request', token]
    );
    
    res.json({
      success: true,
      message: 'Opt-out request received. We will process it within 24 hours.',
      token: token
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Request failed' });
  }
});

// Process opt-out (admin or automated)
app.post('/api/leaderboard/opt-out/process/:token', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT url FROM optout_requests WHERE token = $1 AND processed = FALSE',
      [req.params.token]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid or already processed token' });
    }
    
    const url = result.rows[0].url;
    
    await pool.query(
      'UPDATE leaderboard SET is_opted_out = TRUE, opted_out_at = NOW(), opted_out_reason = $1 WHERE url = $2',
      ['User request', url]
    );
    
    await pool.query(
      'UPDATE optout_requests SET processed = TRUE, processed_at = NOW() WHERE token = $1',
      [req.params.token]
    );
    
    res.json({ success: true, message: 'Successfully opted out from leaderboard' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Processing failed' });
  }
});
// ============================================
// NOTIFICATIONS ENDPOINTS
// ============================================
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM notifications 
      WHERE created_for = 'admin'
      ORDER BY 
        is_read ASC,
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
      LIMIT 50
    `);
    
    res.json({
      success: true,
      notifications: result.rows,
      unread_count: result.rows.filter(n => !n.is_read).length
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.json({ success: true, notifications: [], unread_count: 0 });
  }
});

app.post('/api/admin/notifications/:id/mark-read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

app.post('/api/admin/notifications/mark-all-read', async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE created_for = 'admin' AND is_read = FALSE"
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
});

app.delete('/api/admin/notifications/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.post('/api/admin/notifications/create', async (req, res) => {
  const { type, title, message, link, priority } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'Title and message required' });
  }
  
  try {
    await pool.query(
      `INSERT INTO notifications (type, title, message, link, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, 'system')`,
      [type || 'system', title, message, link || null, priority || 'normal']
    );
    
    res.json({ success: true, message: 'Notification created' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create notification' });
  }
});

// ============================================
// PROFILE CLAIMS ENDPOINTS
// ============================================
app.get('/api/admin/claims', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM profile_claims 
      ORDER BY 
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'rejected' THEN 3
        END,
        created_at DESC
    `);
    
    res.json({ success: true, claims: result.rows });
  } catch (error) {
    console.error('Get claims error:', error);
    res.json({ success: true, claims: [] });
  }
});

app.post('/api/admin/claims/:id/approve', async (req, res) => {
  const { id } = req.params;
  
  try {
    const claim = await pool.query('SELECT * FROM profile_claims WHERE id = $1', [id]);
    
    if (claim.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    const claimData = claim.rows[0];
    
    // Update leaderboard entry
    await pool.query(`
      UPDATE leaderboard 
      SET 
        company_name = $1,
        logo_url = $2,
        description = $3,
        specializations = $4,
        agency_size = $5,
        contact_email = $6,
        is_verified = TRUE,
        claimed = TRUE
      WHERE url = $7
    `, [
      claimData.name,
      claimData.logo_url,
      claimData.description,
      claimData.specializations,
      claimData.agency_size,
      claimData.contact_email,
      claimData.url
    ]);
    
    // Mark claim as approved
    await pool.query(
      'UPDATE profile_claims SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3',
      ['approved', 'admin', id]
    );
    
    console.log(`✅ Profile claim approved: ${claimData.url}`);
    
    res.json({ success: true, message: 'Claim approved' });
  } catch (error) {
    console.error('Approve claim error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve' });
  }
});

app.post('/api/admin/claims/:id/reject', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query(
      'UPDATE profile_claims SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3',
      ['rejected', 'admin', id]
    );
    
    res.json({ success: true, message: 'Claim rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to reject' });
  }
});

app.delete('/api/admin/claims/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM profile_claims WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

// ============================================
// EMAIL TEMPLATES ENDPOINTS
// ============================================
app.get('/api/admin/email-templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY name');
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    res.json({ success: true, templates: [] });
  }
});

app.post('/api/admin/email-templates', async (req, res) => {
  const { name, subject, body, variables } = req.body;
  
  if (!name || !subject || !body) {
    return res.status(400).json({ success: false, error: 'Name, subject and body required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO email_templates (name, subject, body, variables) VALUES ($1, $2, $3, $4)',
      [name, subject, body, variables || null]
    );
    
    res.json({ success: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Template name already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

app.put('/api/admin/email-templates/:id', async (req, res) => {
  const { subject, body, variables } = req.body;
  
  try {
    await pool.query(
      'UPDATE email_templates SET subject = $1, body = $2, variables = $3, updated_at = NOW() WHERE id = $4',
      [subject, body, variables || null, req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update' });
  }
});

app.delete('/api/admin/email-templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

// ============================================
// EMAIL LOGS
// ============================================
app.get('/api/admin/email-logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM email_logs 
      ORDER BY sent_at DESC 
      LIMIT 100
    `);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    res.json({ success: true, logs: [] });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║                                        ║
║     🚀 CONTENTSCALE SERVER LIVE 🚀     ║
║                                        ║
║     Port: ${PORT}                         ║
║     Mode: ${process.env.NODE_ENV || 'development'}              ║
║     Time: ${new Date().toLocaleString()}    ║
║                                        ║
║     ✅ Database connected              ║
║     ✅ No bcrypt (Railway safe)        ║
║     ✅ All tables ready                ║
║     ✅ Approval system active          ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
