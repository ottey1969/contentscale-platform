// server.js - Fixed version with proper database setup
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
    
    // 2. Agency claims table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agency_claims (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id),
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
    
    // 3. Scan history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER CHECK (score >= 0 AND score <= 100),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        recommendations JSONB DEFAULT '[]',
        ip_address INET,
        user_agent TEXT,
        scan_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created/verified scan_history table');
    
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
    
    // 6. Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agencies_score ON agencies(score DESC);
      CREATE INDEX IF NOT EXISTS idx_agencies_country ON agencies(country_code);
      CREATE INDEX IF NOT EXISTS idx_agencies_enhanced ON agencies(is_enhanced);
      CREATE INDEX IF NOT EXISTS idx_scan_history_date ON scan_history(scan_date DESC);
    `);
    console.log('✅ Created indexes');
    
    // 7. Insert default admin user if not exists
    const adminCheck = await client.query('SELECT COUNT(*) FROM admin_users WHERE email = $1', ['admin@contentscale.site']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      // Default password: admin123 (change this!)
      const defaultPassword = '$2b$10$YourDefaultHashedPasswordHere'; // Use bcrypt in production
      await client.query(
        'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)',
        ['admin@contentscale.site', defaultPassword]
      );
      console.log('✅ Created default admin user');
    }
    
    // 8. Insert default settings if not exists
    const settings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['maintenance_mode', 'false'],
      ['leaderboard_enabled', 'true'],
      ['default_country', 'NL']
    ];
    
    for (const [key, value] of settings) {
      await client.query(`
        INSERT INTO settings (key, value) 
        VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }
    console.log('✅ Created default settings');
    
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
  
  // Mock response - replace with actual AI scanner
  const mockResponse = {
    success: true,
    score: Math.floor(Math.random() * 25) + 75, // 75-100
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
      },
      {
        type: 'advanced',
        title: 'Implement Schema Markup',
        description: 'Add structured data for better rich snippets.',
        impact: 'Low'
      }
    ],
    metrics: {
      graaf: Math.floor(Math.random() * 10) + 40, // 40-50
      craft: Math.floor(Math.random() * 8) + 22, // 22-30
      technical: Math.floor(Math.random() * 5) + 15 // 15-20
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
  
  // Simulate processing
  setTimeout(() => {
    res.json(mockResponse);
  }, 1500);
});

// GET /api/leaderboard - Get leaderboard data
app.get('/api/leaderboard', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT a.*, 
             ac.claimed_name, 
             ac.logo_url,
             ac.is_verified,
             COUNT(*) OVER() as total_count
      FROM agencies a
      LEFT JOIN agency_claims ac ON a.id = ac.agency_id
      ORDER BY a.score DESC
      LIMIT 50
    `);
    client.release();
    
    const agencies = result.rows.map(row => ({
      id: row.id,
      rank: row.rank, // You'll need to calculate rank in query
      name: row.claimed_name || row.company_name || `Agency ${row.id}`,
      url: row.url,
      score: row.score,
      country: row.country_code,
      type: row.business_type,
      isEnhanced: row.is_enhanced || row.is_verified,
      lastScan: row.last_scan,
      logo: row.logo_url
    }));
    
    res.json({
      agencies,
      total: parseInt(result.rows[0]?.total_count || 0),
      averageScore: agencies.length > 0 
        ? Math.round(agencies.reduce((sum, a) => sum + a.score, 0) / agencies.length)
        : 0
    });
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    
    // Fallback to mock data
    const mockData = {
      agencies: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        rank: i + 1,
        name: `SEO Agency ${i + 1}`,
        url: `https://agency${i + 1}.com`,
        score: Math.floor(Math.random() * 35) + 65,
        country: ['NL', 'BE', 'DE', 'UK', 'US', 'CA', 'AU'][Math.floor(Math.random() * 7)],
        type: ['agency', 'ecommerce', 'saas', 'other'][Math.floor(Math.random() * 4)],
        isEnhanced: Math.random() > 0.7,
        lastScan: `${Math.floor(Math.random() * 30) + 1} days ago`,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      })),
      total: 20,
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
         SET score = $1, company_name = $2, country_code = $3, business_type = $4, updated_at = NOW()
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
// ADMIN API ENDPOINTS - SIMPLIFIED
// ============================================

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  // For now, simple token check
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (req.path.startsWith('/api/admin') && token !== 'admin-token-123') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use(adminAuth);

// 1. Agencies Management
app.get('/api/admin/agencies', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT a.*, ac.claimed_name, ac.contact_email, ac.is_verified
      FROM agencies a
      LEFT JOIN agency_claims ac ON a.id = ac.agency_id
      ORDER BY a.created_at DESC
    `);
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching agencies:', error.message);
    res.json([]);
  }
});

// 2. Scan History
app.get('/api/admin/scans', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT * FROM scan_history 
      ORDER BY scan_date DESC 
      LIMIT 100
    `);
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scans:', error.message);
    res.json([]);
  }
});

// 3. Claims Management
app.get('/api/admin/claims', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT ac.*, a.url, a.score
      FROM agency_claims ac
      JOIN agencies a ON ac.agency_id = a.id
      ORDER BY ac.claimed_at DESC
    `);
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims:', error.message);
    res.json([]);
  }
});

// 4. Stats Dashboard
app.get('/api/admin/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const [
      agenciesCount,
      scansCount,
      claimsCount,
      avgScore
    ] = await Promise.all([
      client.query('SELECT COUNT(*) FROM agencies'),
      client.query('SELECT COUNT(*) FROM scan_history'),
      client.query('SELECT COUNT(*) FROM agency_claims'),
      client.query('SELECT AVG(score) FROM agencies WHERE score > 0')
    ]);
    
    client.release();
    
    res.json({
      totalAgencies: parseInt(agenciesCount.rows[0].count),
      totalScans: parseInt(scansCount.rows[0].count),
      totalClaims: parseInt(claimsCount.rows[0].count),
      averageScore: parseFloat(avgScore.rows[0].avg || 0).toFixed(1),
      scansToday: 0 // Add date filter if needed
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.json({
      totalAgencies: 0,
      totalScans: 0,
      totalClaims: 0,
      averageScore: 0,
      scansToday: 0
    });
  }
});

// 5. Update agency
app.put('/api/admin/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const client = await pool.connect();
    
    const setClauses = [];
    const values = [];
    let paramCount = 1;
    
    if (updates.score !== undefined) {
      setClauses.push(`score = $${paramCount++}`);
      values.push(updates.score);
    }
    
    if (updates.company_name !== undefined) {
      setClauses.push(`company_name = $${paramCount++}`);
      values.push(updates.company_name);
    }
    
    if (updates.country_code !== undefined) {
      setClauses.push(`country_code = $${paramCount++}`);
      values.push(updates.country_code);
    }
    
    if (updates.is_enhanced !== undefined) {
      setClauses.push(`is_enhanced = $${paramCount++}`);
      values.push(updates.is_enhanced);
    }
    
    setClauses.push('updated_at = NOW()');
    values.push(id);
    
    const query = `
      UPDATE agencies 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await client.query(query, values);
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    res.json({ success: true, agency: result.rows[0] });
    
  } catch (error) {
    console.error('Error updating agency:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 6. Delete agency
app.delete('/api/admin/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    // Delete claim first (foreign key constraint)
    await client.query('DELETE FROM agency_claims WHERE agency_id = $1', [id]);
    
    // Delete agency
    await client.query('DELETE FROM agencies WHERE id = $1', [id]);
    
    client.release();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting agency:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 7. Get settings
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

// 8. Update settings
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
    res.json({ success: true, settings });
    
  } catch (error) {
    console.error('Error updating settings:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 9. Verify claim
app.post('/api/admin/claims/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    await client.query(
      'UPDATE agency_claims SET is_verified = TRUE, verified_at = NOW() WHERE id = $1',
      [id]
    );
    client.release();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error verifying claim:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 10. Backup database (export JSON)
app.get('/api/admin/backup', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const [agencies, claims, scans] = await Promise.all([
      client.query('SELECT * FROM agencies'),
      client.query('SELECT * FROM agency_claims'),
      client.query('SELECT * FROM scan_history LIMIT 1000')
    ]);
    
    client.release();
    
    const backup = {
      timestamp: new Date().toISOString(),
      data: {
        agencies: agencies.rows,
        claims: claims.rows,
        scans: scans.rows
      }
    };
    
    res.json(backup);
    
  } catch (error) {
    console.error('Error creating backup:', error.message);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// 11. Get logs (simplified)
app.get('/api/admin/logs', (req, res) => {
  res.json([
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Admin accessed logs'
    }
  ]);
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message 
    });
  }
});

// ============================================
// FALLBACK ROUTES
// ============================================
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
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database tables will be created/verified in 3 seconds...`);
});
