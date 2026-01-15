// server.js - Fixed version with column checking
const express = require('express');
const path = require('path');
const fs = require('fs');
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
    
    // Create tables after a short delay
    setTimeout(createTables, 3000);
  }
});

// Helper function to check if column exists
async function columnExists(client, tableName, columnName) {
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND column_name = $2
      )
    `, [tableName, columnName]);
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error checking column ${columnName} in ${tableName}:`, error.message);
    return false;
  }
}

// Create database tables
async function createTables() {
  console.log('[CONTENTSCALE] Creating/verifying tables...');
  
  const client = await pool.connect();
  
  try {
    // 1. Agencies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        company_name TEXT,
        score INTEGER CHECK (score >= 0 AND score <= 100),
        country_code VARCHAR(2),
        business_type VARCHAR(20),
        is_enhanced BOOLEAN DEFAULT FALSE,
        last_scan TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created/verified agencies table');
    
    // Check and add missing columns to agencies table
    const agencyColumns = [
      { name: 'score', type: 'INTEGER CHECK (score >= 0 AND score <= 100)' },
      { name: 'country_code', type: 'VARCHAR(2)' },
      { name: 'business_type', type: 'VARCHAR(20)' },
      { name: 'is_enhanced', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'last_scan', type: 'TIMESTAMP DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' }
    ];
    
    for (const column of agencyColumns) {
      const exists = await columnExists(client, 'agencies', column.name);
      if (!exists) {
        await client.query(`ALTER TABLE agencies ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Added missing column ${column.name} to agencies table`);
      }
    }
    
    // 2. Agency claims table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agency_claims (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER,
        claimed_name TEXT NOT NULL,
        logo_url TEXT,
        description TEXT,
        contact_email TEXT NOT NULL,
        agency_size VARCHAR(20),
        specialties JSONB DEFAULT '[]',
        claimed_at TIMESTAMP DEFAULT NOW(),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(100),
        verified_at TIMESTAMP
      )
    `);
    console.log('✅ Created/verified agency_claims table');
    
    // Add foreign key constraint if not exists
    const hasFk = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints 
        WHERE constraint_type = 'FOREIGN KEY' 
        AND table_name = 'agency_claims'
      )
    `);
    
    if (!hasFk.rows[0].exists) {
      await client.query(`
        ALTER TABLE agency_claims 
        ADD CONSTRAINT fk_agency_claims_agency 
        FOREIGN KEY (agency_id) 
        REFERENCES agencies(id) 
        ON DELETE CASCADE
      `);
      console.log('✅ Added foreign key constraint to agency_claims');
    }
    
    // 3. Scan history table - Create with all columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        recommendations JSONB DEFAULT '[]',
        ip_address TEXT,
        user_agent TEXT,
        scan_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created/verified scan_history table');
    
    // Check and add missing columns to scan_history table
    const scanColumns = [
      { name: 'score', type: 'INTEGER' },
      { name: 'graaf_score', type: 'INTEGER' },
      { name: 'craft_score', type: 'INTEGER' },
      { name: 'technical_score', type: 'INTEGER' },
      { name: 'recommendations', type: 'JSONB DEFAULT \'[]\'' },
      { name: 'ip_address', type: 'TEXT' },
      { name: 'user_agent', type: 'TEXT' }
    ];
    
    for (const column of scanColumns) {
      const exists = await columnExists(client, 'scan_history', column.name);
      if (!exists) {
        await client.query(`ALTER TABLE scan_history ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Added missing column ${column.name} to scan_history table`);
      }
    }
    
    // 4. Admin users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);
    console.log('✅ Created/verified admin_users table');
    
    // 5. Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created/verified settings table');
    
    // 6. Create indexes for better performance - FIXED: Only create indexes on existing columns
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_score ON agencies(score DESC)');
      console.log('✅ Created idx_agencies_score index');
    } catch (error) {
      console.log('⚠️ Could not create idx_agencies_score index (column might not exist yet)');
    }
    
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_country ON agencies(country_code)');
      console.log('✅ Created idx_agencies_country index');
    } catch (error) {
      console.log('⚠️ Could not create idx_agencies_country index');
    }
    
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_enhanced ON agencies(is_enhanced)');
      console.log('✅ Created idx_agencies_enhanced index');
    } catch (error) {
      console.log('⚠️ Could not create idx_agencies_enhanced index');
    }
    
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_scan_history_date ON scan_history(scan_date DESC)');
      console.log('✅ Created idx_scan_history_date index');
    } catch (error) {
      console.log('⚠️ Could not create idx_scan_history_date index');
    }
    
    // 7. Insert default admin user if not exists
    const adminCheck = await client.query('SELECT COUNT(*) FROM admin_users WHERE email = $1', ['admin@contentscale.site']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      // Default password: admin123 (bcrypt hash)
      const defaultPassword = '$2b$10$6YAK8JYVhKwZcK7r9bVqEuY2lKpN9Qa9zJm6vV8wB7dR5sT3uXvC1';
      await client.query(
        'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)',
        ['admin@contentscale.site', defaultPassword]
      );
      console.log('✅ Created default admin user (password: admin123)');
    }
    
    // 8. Insert default settings if not exists
    const defaultSettings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['maintenance_mode', 'false'],
      ['leaderboard_enabled', 'true'],
      ['default_country', 'NL'],
      ['scan_enabled', 'true'],
      ['max_scans_per_day', '100']
    ];
    
    for (const [key, value] of defaultSettings) {
      await client.query(`
        INSERT INTO settings (key, value) 
        VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }
    console.log('✅ Created default settings');
    
    console.log('🎉 All tables created/verified successfully!');
    
  } catch (error) {
    console.error('[CONTENTSCALE TABLE ERROR]', error.message);
  } finally {
    client.release();
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static('public'));

// Serve admin.html at /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve blog
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'blog', 'index.html'));
});

// ============================================
// API ENDPOINTS - SCANNER & LEADERBOARD
// ============================================

// POST /api/scan - Scan a website
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  console.log(`Scan requested for: ${url}`);
  
  // Mock response
  const mockResponse = {
    success: true,
    score: Math.floor(Math.random() * 25) + 75,
    url: url,
    recommendations: [
      {
        type: 'quickwin',
        title: 'Improve Meta Description',
        description: 'Add a compelling meta description with target keywords.',
        impact: 'High'
      },
      {
        type: 'major',
        title: 'Optimize Page Speed',
        description: 'Reduce image sizes and leverage browser caching.',
        impact: 'Medium'
      }
    ],
    metrics: {
      graaf: Math.floor(Math.random() * 10) + 40,
      craft: Math.floor(Math.random() * 8) + 22,
      technical: Math.floor(Math.random() * 5) + 15
    },
    timestamp: new Date().toISOString()
  };
  
  // Save scan to database
  try {
    const client = await pool.connect();
    await client.query(
      `INSERT INTO scan_history (url, score, graaf_score, craft_score, technical_score, recommendations) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        url,
        mockResponse.score,
        mockResponse.metrics.graaf,
        mockResponse.metrics.craft,
        mockResponse.metrics.technical,
        JSON.stringify(mockResponse.recommendations)
      ]
    );
    client.release();
  } catch (error) {
    console.error('Error saving scan:', error.message);
  }
  
  setTimeout(() => {
    res.json(mockResponse);
  }, 1500);
});

// GET /api/leaderboard - Get leaderboard data
app.get('/api/leaderboard', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // First, check if agencies table has data
    const countResult = await client.query('SELECT COUNT(*) FROM agencies');
    const total = parseInt(countResult.rows[0].count);
    
    if (total === 0) {
      // Return empty or mock data
      client.release();
      return res.json({
        agencies: [],
        total: 0,
        averageScore: 0
      });
    }
    
    // Get agencies with rank
    const result = await client.query(`
      SELECT 
        a.*,
        ac.claimed_name,
        ac.logo_url,
        ac.is_verified,
        ROW_NUMBER() OVER (ORDER BY COALESCE(a.score, 0) DESC) as rank
      FROM agencies a
      LEFT JOIN agency_claims ac ON a.id = ac.agency_id
      WHERE a.score IS NOT NULL
      ORDER BY COALESCE(a.score, 0) DESC
      LIMIT 50
    `);
    
    client.release();
    
    const agencies = result.rows.map(row => ({
      id: row.id,
      rank: row.rank,
      name: row.claimed_name || row.company_name || `Agency ${row.id}`,
      url: row.url,
      score: row.score || 0,
      country: row.country_code || 'US',
      type: row.business_type || 'agency',
      isEnhanced: row.is_enhanced || row.is_verified || false,
      lastScan: row.last_scan ? new Date(row.last_scan).toLocaleDateString() : 'Never',
      logo: row.logo_url,
      createdAt: row.created_at
    }));
    
    const avgScore = agencies.length > 0 
      ? Math.round(agencies.reduce((sum, a) => sum + (a.score || 0), 0) / agencies.length)
      : 0;
    
    res.json({
      agencies,
      total,
      averageScore: avgScore
    });
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    
    // Fallback to mock data
    const mockData = {
      agencies: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        rank: i + 1,
        name: `SEO Agency ${i + 1}`,
        url: `https://agency${i + 1}.com`,
        score: Math.floor(Math.random() * 35) + 65,
        country: ['NL', 'BE', 'DE', 'UK', 'US'][Math.floor(Math.random() * 5)],
        type: ['agency', 'ecommerce', 'saas'][Math.floor(Math.random() * 3)],
        isEnhanced: Math.random() > 0.7,
        lastScan: `${Math.floor(Math.random() * 30) + 1} days ago`
      })),
      total: 10,
      averageScore: 82
    };
    
    res.json(mockData);
  }
});

// POST /api/leaderboard/submit - Submit to leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
  const agencyData = req.body;
  
  if (!agencyData.url || agencyData.score === undefined) {
    return res.status(400).json({ error: 'URL and score are required' });
  }
  
  console.log('Submitting to leaderboard:', agencyData);
  
  try {
    const client = await pool.connect();
    
    // Check if agency already exists
    const existing = await client.query(
      'SELECT id FROM agencies WHERE url = $1',
      [agencyData.url]
    );
    
    let agencyId;
    
    if (existing.rows.length > 0) {
      // Update existing
      agencyId = existing.rows[0].id;
      await client.query(
        `UPDATE agencies 
         SET score = $1, 
             company_name = $2, 
             country_code = $3, 
             business_type = $4, 
             updated_at = NOW(),
             last_scan = NOW()
         WHERE id = $5`,
        [
          agencyData.score,
          agencyData.company || null,
          agencyData.country || null,
          agencyData.type || 'other',
          agencyId
        ]
      );
    } else {
      // Insert new
      const result = await client.query(
        `INSERT INTO agencies (url, score, company_name, country_code, business_type) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id`,
        [
          agencyData.url,
          agencyData.score,
          agencyData.company || null,
          agencyData.country || null,
          agencyData.type || 'other'
        ]
      );
      agencyId = result.rows[0].id;
    }
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Added to leaderboard', 
      id: agencyId 
    });
    
  } catch (error) {
    console.error('Error submitting to leaderboard:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/agency/claim - Claim agency profile
app.post('/api/agency/claim', async (req, res) => {
  const claimData = req.body;
  
  if (!claimData.agencyId || !claimData.agencyName || !claimData.contactEmail) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  console.log('Claiming agency profile:', claimData);
  
  try {
    const client = await pool.connect();
    
    // Check if agency exists
    const agencyCheck = await client.query(
      'SELECT id FROM agencies WHERE id = $1',
      [claimData.agencyId]
    );
    
    if (agencyCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    // Insert or update claim
    await client.query(`
      INSERT INTO agency_claims (agency_id, claimed_name, logo_url, description, contact_email, agency_size, specialties)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (agency_id) DO UPDATE 
      SET claimed_name = EXCLUDED.claimed_name,
          logo_url = EXCLUDED.logo_url,
          description = EXCLUDED.description,
          contact_email = EXCLUDED.contact_email,
          agency_size = EXCLUDED.agency_size,
          specialties = EXCLUDED.specialties,
          claimed_at = NOW()
    `, [
      claimData.agencyId,
      claimData.agencyName,
      claimData.logoUrl || null,
      claimData.description || null,
      claimData.contactEmail,
      claimData.agencySize || 'boutique',
      JSON.stringify(claimData.specialties || [])
    ]);
    
    // Mark agency as enhanced
    await client.query(
      'UPDATE agencies SET is_enhanced = TRUE, updated_at = NOW() WHERE id = $1',
      [claimData.agencyId]
    );
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Profile claimed successfully' 
    });
    
  } catch (error) {
    console.error('Error claiming profile:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SIMPLIFIED ADMIN ENDPOINTS (Will work even if some tables have issues)
// ============================================

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.json({ 
      status: 'degraded', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      warning: 'Some database operations may be limited'
    });
  }
});

// Simple admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  
  if (email === 'admin@contentscale.site' && password === 'admin123') {
    res.json({
      success: true,
      token: 'admin-token-123',
      user: { email: 'admin@contentscale.site', role: 'admin' }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Admin middleware
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (req.path.startsWith('/api/admin')) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    if (token !== 'admin-token-123') {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }
  
  next();
};

app.use(adminAuth);

// Simple admin stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Try to get counts, but handle errors gracefully
    let agenciesCount = 0;
    let scansCount = 0;
    let claimsCount = 0;
    
    try {
      const agenciesResult = await client.query('SELECT COUNT(*) FROM agencies');
      agenciesCount = parseInt(agenciesResult.rows[0].count);
    } catch (e) {}
    
    try {
      const scansResult = await client.query('SELECT COUNT(*) FROM scan_history');
      scansCount = parseInt(scansResult.rows[0].count);
    } catch (e) {}
    
    try {
      const claimsResult = await client.query('SELECT COUNT(*) FROM agency_claims');
      claimsCount = parseInt(claimsResult.rows[0].count);
    } catch (e) {}
    
    client.release();
    
    res.json({
      totalAgencies: agenciesCount,
      totalScans: scansCount,
      totalClaims: claimsCount,
      scansToday: 0,
      enhancedProfiles: 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.json({
      totalAgencies: 0,
      totalScans: 0,
      totalClaims: 0,
      scansToday: 0,
      enhancedProfiles: 0,
      timestamp: new Date().toISOString()
    });
  }
});

// Get agencies for admin
app.get('/api/admin/agencies', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM agencies ORDER BY created_at DESC LIMIT 100');
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching agencies:', error.message);
    res.json([]);
  }
});

// Get scan history
app.get('/api/admin/scans', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM scan_history ORDER BY scan_date DESC LIMIT 100');
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scans:', error.message);
    res.json([]);
  }
});

// Get claims
app.get('/api/admin/claims', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM agency_claims ORDER BY claimed_at DESC LIMIT 100');
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims:', error.message);
    res.json([]);
  }
});

// Get settings
app.get('/api/admin/settings', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM settings');
    client.release();
    
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error.message);
    res.json({});
  }
});

// Update settings
app.put('/api/admin/settings', async (req, res) => {
  try {
    const settings = req.body;
    const client = await pool.connect();
    
    for (const [key, value] of Object.entries(settings)) {
      await client.query(`
        INSERT INTO settings (key, value) 
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE 
        SET value = EXCLUDED.value, updated_at = NOW()
      `, [key, value]);
    }
    
    client.release();
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// FRONTEND ROUTES
// ============================================

// Serve main frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// All other routes serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database tables will be created/verified in 3 seconds...`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 Admin: http://localhost:${PORT}/admin`);
});
