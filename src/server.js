// ============================================
// CONTENTSCALE SERVER.JS - ENHANCED VERSION
// Fixed: Recommendations, Leaderboard, Admin Login
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/contentscale',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ DB connection error:', err.message);
  } else {
    console.log('✅ DB connected:', new Date().toISOString());
    release();
    setTimeout(createAllTables, 2000);
  }
});

// ============================================
// CREATE ALL TABLES
// ============================================
async function createAllTables() {
  console.log('[CONTENTSCALE] Creating/verifying all tables...');
  const client = await pool.connect();
  
  try {
    // 1. SUPER ADMINS TABLE (voor login)
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
    console.log('✅ Created super_admins table');
    
    // Create default super admin if not exists
    const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        ['ot', hash, 'Super Admin', 'super_admin']
      );
      console.log('✅ Created default super admin (username: ot, password: admin123)');
    }
    
    // 2. AGENCIES TABLE
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
    console.log('✅ Created agencies table');
    
    // 3. CLIENTS TABLE
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
    console.log('✅ Created clients table');
    
    // 4. SCANS TABLE
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
    console.log('✅ Created scans table');
    
    // 5. SHARE LINKS TABLE
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
    console.log('✅ Created share_links table');
    
    // 6. LEADERBOARD TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        business_type VARCHAR(50),
        is_verified BOOLEAN DEFAULT FALSE,
        last_scan TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created leaderboard table');
    
    // 7. AGENCY CLAIMS TABLE
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
    console.log('✅ Created agency_claims table');
    
    // 8. LTD CODES TABLE
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
    console.log('✅ Created ltd_codes table');
    
    // 9. SETTINGS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created settings table');
    
    // Insert default settings
    const defaultSettings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['auto_scan_enabled', 'false'],
      ['scan_frequency', 'weekly']
    ];
    
    for (const [key, value] of defaultSettings) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }
    
    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_domain ON agencies(domain)');
    
    console.log('🎉 All tables created/verified successfully!');
    
    // Auto-populate leaderboard if empty
    setTimeout(autoPopulateLeaderboard, 3000);
    
  } catch (error) {
    console.error('[TABLE ERROR]', error.message);
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
    
    if (count < 5) {
      console.log('[LEADERBOARD] Auto-populating with demo data...');
      
      const demoAgencies = [
        { url: 'https://contentscale.site', company: 'ContentScale', score: 95, country: 'NL', type: 'seo-agency' },
        { url: 'https://example-seo.nl', company: 'SEO Masters', score: 88, country: 'NL', type: 'seo-agency' },
        { url: 'https://digital-boost.be', company: 'Digital Boost', score: 82, country: 'BE', type: 'marketing-agency' },
        { url: 'https://web-wizards.com', company: 'Web Wizards', score: 79, country: 'UK', type: 'web-agency' },
        { url: 'https://content-kings.de', company: 'Content Kings', score: 76, country: 'DE', type: 'content-agency' },
        { url: 'https://rank-heroes.nl', company: 'Rank Heroes', score: 73, country: 'NL', type: 'seo-agency' },
        { url: 'https://growth-hackers.be', company: 'Growth Hackers', score: 70, country: 'BE', type: 'marketing-agency' },
        { url: 'https://seo-ninjas.uk', company: 'SEO Ninjas', score: 68, country: 'UK', type: 'seo-agency' }
      ];
      
      for (const agency of demoAgencies) {
        await pool.query(`
          INSERT INTO leaderboard (url, company_name, score, country, business_type, is_verified)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (url) DO NOTHING
        `, [agency.url, agency.company, agency.score, agency.country, agency.type, true]);
      }
      
      console.log('✅ Leaderboard populated with demo data');
    }
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error.message);
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

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ============================================
// STATIC FILES - FIXED PATHS
// ============================================
app.use(express.static('public'));

// ============================================
// HTML ROUTES - FIXED PATHS
// ============================================

// Admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// Main scanner page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// SEO ContentScore tool
app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unified-scan-page.html'));
});

// Leaderboard page
app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/leaderboard.html'));
});

// ============================================
// ADMIN AUTHENTICATION - ENHANCED ERROR HANDLING
// ============================================

// Login endpoint (matches what admin-dashboard.html expects)
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  console.log('[LOGIN ATTEMPT]', username);
  
  if (!username || !password) {
    console.log('[LOGIN ERROR] Missing credentials');
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    
    if (result.rows.length === 0) {
      console.log('[LOGIN ERROR] User not found:', username);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      console.log('[LOGIN ERROR] Invalid password for:', username);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query('UPDATE super_admins SET last_login = NOW() WHERE id = $1', [admin.id]);
    
    console.log('[LOGIN SUCCESS]', username);
    
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
    console.error('[LOGIN DATABASE ERROR]', error.message);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

// Alternative login endpoint
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const username = email ? email.split('@')[0] : email;
  
  console.log('[ALT LOGIN ATTEMPT]', username);
  
  try {
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    
    if (result.rows.length === 0) {
      console.log('[ALT LOGIN ERROR] User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      console.log('[ALT LOGIN ERROR] Invalid password for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('[ALT LOGIN SUCCESS]', username);
    
    res.json({
      success: true,
      token: `admin-${admin.id}-${Date.now()}`,
      user: { email: admin.email || admin.username, role: admin.role }
    });
    
  } catch (error) {
    console.error('[ALT LOGIN DATABASE ERROR]', error.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ============================================
// ADMIN STATS ENDPOINT
// ============================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [agencies, clients, scans, helpers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM agencies'),
      pool.query('SELECT COUNT(*) FROM clients'),
      pool.query('SELECT COUNT(*) FROM scans'),
      pool.query('SELECT COUNT(*) FROM super_admins WHERE role != $1', ['super_admin'])
    ]);
    
    res.json({
      success: true,
      stats: {
        total_agencies: parseInt(agencies.rows[0].count),
        total_clients: parseInt(clients.rows[0].count),
        total_scans: parseInt(scans.rows[0].count),
        active_helpers: parseInt(helpers.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({
      success: true,
      stats: { total_agencies: 0, total_clients: 0, total_scans: 0, active_helpers: 0 }
    });
  }
});

// ============================================
// ADMINS/HELPERS MANAGEMENT (Tab 2)
// ============================================
app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    console.error('Get admins error:', error);
    res.json({ success: true, admins: [] });
  }
});

app.post('/api/admins', async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Username, password and role are required' });
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
    console.error('Create admin error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Username already exists' });
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
// AGENCIES MANAGEMENT (Tab 3)
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
    console.error('Get agencies error:', error);
    res.json({ success: true, agencies: [] });
  }
});

app.post('/api/agencies', async (req, res) => {
  const { name, domain, country, plan, contact_person, contact_email } = req.body;
  
  if (!name || !domain) {
    return res.status(400).json({ success: false, error: 'Name and domain are required' });
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
    console.error('Create agency error:', error);
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
// CLIENTS MANAGEMENT (Tab 4)
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
    console.error('Get clients error:', error);
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
// SCANS MANAGEMENT (Tab 5)
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
    console.error('Get scans error:', error);
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
// SHARE LINKS MANAGEMENT (Tab 6)
// ============================================
app.get('/api/admin/share-links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM share_links ORDER BY created_at DESC');
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    console.error('Get share links error:', error);
    res.json({ success: true, share_links: [] });
  }
});

app.post('/api/admin/share-links/create', async (req, res) => {
  const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
  
  if (!client_email) {
    return res.status(400).json({ success: false, error: 'Client email is required' });
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
    console.error('Create share link error:', error);
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
// LEADERBOARD MANAGEMENT (Tab 7)
// ============================================
app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      ORDER BY score DESC 
      LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.json({ success: true, entries: [] });
  }
});

app.get('/api/admin/leaderboard/search', async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE url ILIKE $1 OR company_name ILIKE $1 OR CAST(score AS TEXT) LIKE $1
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

app.post('/api/admin/scan-all-agencies', async (req, res) => {
  // Placeholder - implement actual scanning logic
  res.json({ success: true, successCount: 0, failCount: 0, message: 'Scan functionality not yet implemented' });
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
        company_name as name,
        url,
        score,
        country,
        business_type as type,
        is_verified as "isEnhanced",
        last_scan as "lastScan"
      FROM leaderboard 
      WHERE score IS NOT NULL
      ORDER BY score DESC 
      LIMIT 50
    `);
    
    res.json({
      agencies: result.rows,
      total: result.rows.length,
      averageScore: result.rows.length > 0 
        ? Math.round(result.rows.reduce((sum, r) => sum + r.score, 0) / result.rows.length)
        : 0
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.json({ agencies: [], total: 0, averageScore: 0 });
  }
});

app.post('/api/leaderboard/submit', async (req, res) => {
  const { url, score, company, country, type } = req.body;
  
  if (!url || score === undefined) {
    return res.status(400).json({ error: 'URL and score are required' });
  }
  
  try {
    await pool.query(`
      INSERT INTO leaderboard (url, score, company_name, country, business_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (url) DO UPDATE SET 
        score = EXCLUDED.score,
        company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
        last_scan = NOW()
    `, [url, score, company || null, country || 'NL', type || 'agency']);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Submit to leaderboard error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// PUBLIC SCANNER API - ENHANCED RECOMMENDATIONS
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  console.log(`[SCAN] Requested for: ${url}`);
  
  // Generate mock scores (replace with actual scanner later)
  const graafScore = Math.floor(Math.random() * 15) + 35; // 35-50
  const craftScore = Math.floor(Math.random() * 10) + 20; // 20-30
  const technicalScore = Math.floor(Math.random() * 8) + 12; // 12-20
  const totalScore = graafScore + craftScore + technicalScore;
  
  const quality = totalScore >= 90 ? 'excellent' 
                : totalScore >= 75 ? 'good'
                : totalScore >= 60 ? 'average'
                : totalScore >= 45 ? 'below-average'
                : 'poor';
  
  // Generate comprehensive recommendations
  const allRecommendations = [
    // QUICKWIN recommendations (easy to implement, high impact)
    {
      type: 'quickwin',
      title: 'Improve Meta Description',
      description: 'Add a compelling meta description with target keywords.',
      impact: 'High'
    },
    {
      type: 'quickwin',
      title: 'Add Expert Quotes',
      description: 'Include quotes from industry experts to boost credibility and authority.',
      impact: 'High'
    },
    {
      type: 'quickwin',
      title: 'Update Publication Date',
      description: 'Display clear publish and last-updated dates to show freshness.',
      impact: 'Medium'
    },
    {
      type: 'quickwin',
      title: 'Add Author Bio',
      description: 'Include detailed author credentials and expertise section.',
      impact: 'Medium'
    },
    {
      type: 'quickwin',
      title: 'Optimize Header Tags',
      description: 'Ensure proper H1-H6 hierarchy and include target keywords.',
      impact: 'High'
    },
    
    // MAJOR recommendations (moderate effort, significant impact)
    {
      type: 'major',
      title: 'Optimize Page Speed',
      description: 'Reduce image sizes and leverage browser caching.',
      impact: 'High'
    },
    {
      type: 'major',
      title: 'Improve FAQ Section',
      description: 'Add comprehensive FAQ addressing common user questions.',
      impact: 'Medium'
    },
    {
      type: 'major',
      title: 'Enhance Internal Linking',
      description: 'Create contextual internal links to related content.',
      impact: 'Medium'
    },
    {
      type: 'major',
      title: 'Add Data Visualization',
      description: 'Include charts, graphs, or infographics for complex data.',
      impact: 'Medium'
    },
    {
      type: 'major',
      title: 'Improve Content Depth',
      description: 'Expand thin content sections with detailed explanations.',
      impact: 'High'
    },
    
    // ADVANCED recommendations (complex, long-term value)
    {
      type: 'advanced',
      title: 'Implement Schema Markup',
      description: 'Add structured data for better rich snippets.',
      impact: 'High'
    },
    {
      type: 'advanced',
      title: 'Create Expert Roundup',
      description: 'Feature insights from multiple industry experts.',
      impact: 'Medium'
    },
    {
      type: 'advanced',
      title: 'Add Original Research',
      description: 'Conduct and publish original studies or surveys.',
      impact: 'Low'
    },
    {
      type: 'advanced',
      title: 'Build Interactive Tools',
      description: 'Develop calculators or interactive elements for engagement.',
      impact: 'Low'
    }
  ];
  
  // Select 3-5 random recommendations based on score
  const numRecommendations = totalScore >= 80 ? 3 : totalScore >= 60 ? 4 : 5;
  const selectedRecommendations = [];
  const usedIndices = new Set();
  
  while (selectedRecommendations.length < numRecommendations) {
    const randomIndex = Math.floor(Math.random() * allRecommendations.length);
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex);
      selectedRecommendations.push(allRecommendations[randomIndex]);
    }
  }
  
  // Sort by type priority: quickwin > major > advanced
  const typePriority = { quickwin: 1, major: 2, advanced: 3 };
  selectedRecommendations.sort((a, b) => typePriority[a.type] - typePriority[b.type]);
  
  const scanResult = {
    success: true,
    url,
    score: totalScore,
    quality,
    breakdown: {
      graaf: { total: graafScore },
      craft: { total: craftScore },
      technical: { total: technicalScore }
    },
    recommendations: selectedRecommendations,
    timestamp: new Date().toISOString()
  };
  
  // Save to database
  try {
    await pool.query(
      `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [url, totalScore, quality, graafScore, craftScore, technicalScore, 
       JSON.stringify(scanResult.breakdown), JSON.stringify(selectedRecommendations), 'public']
    );
  } catch (error) {
    console.error('Save scan error:', error);
  }
  
  // Simulate delay
  setTimeout(() => res.json(scanResult), 1500);
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.json({ status: 'degraded', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ============================================
// CATCH-ALL ROUTE - FIXED PATH
// ============================================
app.get('*', (req, res) => {
  // Try to serve from public folder
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      // Fall back to index.html
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
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database tables will be created in 2 seconds...`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 Admin: http://localhost:${PORT}/admin`);
  console.log(`👤 Default login: ot / admin123`);
});
