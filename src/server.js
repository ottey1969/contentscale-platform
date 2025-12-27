// ==========================================
// CONTENTSCALE COMPLETE PLATFORM
// Hybrid AI Scoring System with Admin Management
// + SHARE LINK SYSTEM
// + WORD COUNT FIX
// + ADMIN PASSWORD_HASH FIX
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Import HYBRID system components
const { parseContent } = require('./content-parser-HYBRID');
const { validateContent } = require('./claude-validator-HYBRID');
const { calculateScore } = require('./deterministic-scoring-HYBRID');
const { fetchWithPuppeteer } = require('./puppeteer-fetcher');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// DATABASE CONNECTION (NEON)
// ==========================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function generateKey(prefix) {
  const random = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);
  return `${prefix}-${random}`;
}

function generateAdminKey() {
  return 'ADMIN-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateShareId() {
  return 'scan-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function generateShareCode(prefix = 'SCAN') {
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${random}-${timestamp}`;
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

async function performHybridScan(url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 HYBRID SCAN: ${url}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    // STEP 1: Fetch HTML with Puppeteer
    console.log('📥 STEP 1: Fetching HTML with Puppeteer...');
    
    const fetchResult = await fetchWithPuppeteer(url, {
      timeout: 30000,
      waitUntil: 'networkidle2',
      waitDelay: 2000
    });
    
    if (!fetchResult.success) {
      throw new Error(fetchResult.error || 'Fetch failed');
    }
    
    console.log(`✅ Fetched ${fetchResult.wordCount} words (${fetchResult.duration.toFixed(1)}s)`);
    
    // STEP 2: Parser (Deterministic)
    console.log('🔍 STEP 2: Parser analysis...');
    const parserOutput = parseContent(fetchResult.html, url);
    
    // Add fetched metadata to parser output
    parserOutput.counts.wordCount = fetchResult.wordCount;
    parserOutput.metadata = {
      ...parserOutput.metadata,
      ...fetchResult.metadata
    };
    
    // STEP 3: Claude Validation
    console.log('🤖 STEP 3: Claude validation...');
    const validatedCounts = await validateContent(parserOutput);
    
    // STEP 4: Deterministic Scoring
    console.log('🎯 STEP 4: Deterministic scoring...');
    const score = calculateScore(validatedCounts, parserOutput.counts);
    
    // Determine quality label
    let quality = 'poor';
    if (score.total >= 90) quality = 'excellent';
    else if (score.total >= 80) quality = 'good';
    else if (score.total >= 70) quality = 'average';
    else if (score.total >= 60) quality = 'below-average';
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ FINAL SCORE: ${score.total}/100 (${quality.toUpperCase()})`);
    console.log(`📝 Word Count: ${fetchResult.wordCount}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success: true,
      url: url,
      score: score.total,
      quality: quality,
      breakdown: score.breakdown,
      validation: {
        parserCounts: parserOutput.counts,
        validatedCounts: validatedCounts,
        rejections: validatedCounts.rejections || {},
      },
      metadata: fetchResult.metadata,
      wordCount: fetchResult.wordCount,
      fetchDuration: fetchResult.duration,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('❌ HYBRID SCAN ERROR:', error.message);
    throw error;
  }
}

// ==========================================
// MIDDLEWARE: Authenticate Super Admin
// ==========================================

function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
  // Try super_admins table FIRST
  pool.query(
    'SELECT id, username FROM super_admins WHERE id = $1',
    [adminKey]
  )
  .then(superAdminResult => {
    if (superAdminResult.rows.length > 0) {
      req.admin = {
        id: superAdminResult.rows[0].id,
        username: superAdminResult.rows[0].username,
        role: 'super_admin'
      };
      console.log(`✅ Super admin authenticated: ${req.admin.username}`);
      return next();
    }
    
    // Try admins table
    return pool.query(
      'SELECT id, username, role FROM admins WHERE id = $1 AND role = $2',
      [adminKey, 'super_admin']
    );
  })
  .then(adminResult => {
    if (!adminResult) return;
    
    if (adminResult.rows.length > 0) {
      req.admin = adminResult.rows[0];
      console.log(`✅ Super admin authenticated: ${req.admin.username}`);
      return next();
    }
     
    return res.status(403).json({
      success: false,
      error: 'Super admin access required'
    });
  })
  .catch(error => {
    console.error('Auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  });
}


// ==========================================
// SUPER ADMIN SETUP ENDPOINTS
// ==========================================

app.post('/api/setup/create-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const existingAdmin = await pool.query(
      'SELECT id FROM super_admins WHERE username = $1',
      [username]
    );
    
    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO super_admins (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, passwordHash]
    );
    
    console.log(`✅ Super admin created: ${username}`);
    
    res.json({
      success: true,
      admin: result.rows[0]
    });
    
  } catch (error) {
    console.error('[CREATE ADMIN ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await pool.query(
      'SELECT id, username, password_hash FROM super_admins WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({
      success: true,
      admin_id: admin.id,
      admin: {
        id: admin.id,
        username: admin.username
      }
    });
    
  } catch (error) {
    console.error('[VERIFY ADMIN ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup-admin.html'));
});

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

app.get('/', (req, res) => {
  res.json({
    name: 'ContentScale Complete Platform',
    version: '2.0',
    system: 'hybrid',
    status: 'operational'
  });
});

app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    
    res.json({
      status: 'ok',
      system: 'hybrid',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        timestamp: dbResult.rows[0].now
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    console.log(`[FREE SCAN] ${url}`);
    
    const urlHash = hashUrl(url);
    const shareId = generateShareId();
    
    // Check if we have a recent scan (within 1 hour) for CONSISTENCY
    const existingScan = await pool.query(
      `SELECT * FROM scans 
       WHERE url = $1 
       AND scan_type = 'free'
       AND created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at DESC
       LIMIT 1`,
      [url]
    );
    
    let result;
    
    if (existingScan.rows.length > 0) {
      // Use existing scan (for consistency - same URL = same score within 1 hour)
      console.log('✅ Using cached scan result for consistency');
      const cached = existingScan.rows[0];
      
      result = {
        success: true,
        url: url,
        score: cached.score,
        quality: cached.quality,
        breakdown: {
          graaf: { total: cached.graaf_score || 0 },
          craft: { total: cached.craft_score || 0 },
          technical: { total: cached.technical_score || 0 }
        },
        validation: typeof cached.validation_data === 'string' 
          ? JSON.parse(cached.validation_data) 
          : cached.validation_data,
        timestamp: cached.created_at,
        share_id: cached.share_id || shareId,
        wordCount: cached.word_count || 0,
        cached: true
      };
      
    } else {
      // Perform new scan
      result = await performHybridScan(url);
      result.share_id = shareId;
      result.cached = false;
      
      // Record scan with share_id AND word_count
      await pool.query(
        `INSERT INTO scans (
          url, score, quality, url_hash, share_id,
          graaf_score, craft_score, technical_score,
          validation_data, scan_type, ip_address, word_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          url,
          result.score,
          result.quality,
          urlHash,
          shareId,
          result.breakdown.graaf.total,
          result.breakdown.craft.total,
          result.breakdown.technical.total,
          JSON.stringify(result.validation || {}),
          'free',
          req.ip,
          result.wordCount || 0
        ]
      );
    }
    
    return res.json(result);
    
  } catch (error) {
    console.error('[FREE SCAN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Scan failed'
    });
  }
});

app.get('/api/scan-result/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM scans WHERE share_id = $1`,
      [shareId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Scan not found'
      });
    }
    
    const scan = result.rows[0];
    
    res.json({
      success: true,
      url: scan.url,
      score: scan.score,
      quality: scan.quality,
      breakdown: {
        graaf: { total: scan.graaf_score || 0 },
        craft: { total: scan.craft_score || 0 },
        technical: { total: scan.technical_score || 0 }
      },
      validation: typeof scan.validation_data === 'string' 
        ? JSON.parse(scan.validation_data) 
        : scan.validation_data,
      timestamp: scan.created_at,
      share_id: scan.share_id,
      wordCount: scan.word_count || 0
    });
    
  } catch (error) {
    console.error('[GET SCAN ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load scan'
    });
  }
});

app.post('/api/scan', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    console.log(`[SCAN] ${url}`);
    
    const result = await performHybridScan(url);
    
    return res.json({
      success: true,
      scan: {
        url: result.url,
        v52_score: result.score,
        quality: result.quality,
        breakdown: result.breakdown,
        wordCount: result.wordCount,
        scanned_at: result.timestamp
      }
    });
    
  } catch (error) {
    console.error('[SCAN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Scan failed'
    });
  }
});

app.get('/api/leaderboard/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    const result = await pool.query(
      `SELECT 
         id, name, domain, country, v52_score, 
         last_scanned, created_at
       FROM agencies 
       WHERE country = $1 AND is_active = true
       ORDER BY v52_score DESC, last_scanned DESC
       LIMIT $2`,
      [country, limit]
    );
    
    const agencies = result.rows.map((agency, index) => ({
      ...agency,
      rank: index + 1
    }));
    
    console.log(`[LEADERBOARD] ${country}: ${agencies.length} agencies`);
    
    res.json({
      success: true,
      country: country,
      total: agencies.length,
      agencies: agencies
    });
    
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load leaderboard'
    });
  }
});

// ==========================================
// ADMIN MANAGEMENT ENDPOINTS
// ==========================================

app.get('/api/admins', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, username, role, full_name, email,
        is_active, created_at, last_login
      FROM admins
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      admins: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admins'
    });
  }
});

app.post('/api/admins', authenticateSuperAdmin, async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  
  try {
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and role are required'
      });
    }
    
    const existingUser = await pool.query(
      'SELECT id FROM admins WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }
    
    if (email) {
      const existingEmail = await pool.query(
        'SELECT id FROM admins WHERE email = $1',
        [email]
      );
      
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }
    
    const validRoles = ['super_admin', 'sales', 'tester', 'support'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // FIX: Changed 'password' to 'password_hash'
    const result = await pool.query(`
      INSERT INTO admins (
        username, password_hash, role, full_name, email,
        is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      RETURNING id, username, role, full_name, email, created_at
    `, [username, hashedPassword, role, full_name || null, email || null]);
    
    console.log(`✅ Admin created: ${username} (${role})`);
    
    res.json({
      success: true,
      message: 'Admin/Helper created successfully',
      admin: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create admin'
    });
  }
});

app.put('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, role, full_name, email, is_active } = req.body;
  
  try {
    const existing = await pool.query(
      'SELECT id FROM admins WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found'
      });
    }
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (username) {
      updates.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      // FIX: Changed 'password' to 'password_hash'
      updates.push(`password_hash = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }
    
    if (role) {
      const validRoles = ['super_admin', 'sales', 'tester', 'support'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role'
        });
      }
      updates.push(`role = $${paramCount}`);
      values.push(role);
      paramCount++;
    }
    
    if (full_name !== undefined) {
      updates.push(`full_name = $${paramCount}`);
      values.push(full_name);
      paramCount++;
    }
    
    if (email !== undefined) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }
    
    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(id);
    
    const query = `
      UPDATE admins 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, username, role, full_name, email, is_active, created_at
    `;
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: 'Admin updated successfully',
      admin: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update admin'
    });
  }
});

app.delete('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    if (req.admin && req.admin.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    const existing = await pool.query(
      'SELECT id, username FROM admins WHERE id = $1',
      [id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found'
      });
    }
    
    await pool.query('DELETE FROM admins WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: `Admin ${existing.rows[0].username} deleted successfully`
    });
    
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete admin'
    });
  }
});

app.patch('/api/admins/:id/toggle-active', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      UPDATE admins 
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING id, username, is_active
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found'
      });
    }
    
    res.json({
      success: true,
      message: `Admin ${result.rows[0].is_active ? 'activated' : 'deactivated'}`,
      admin: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error toggling admin status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle admin status'
    });
  }
});

app.post('/api/admins/:id/reset-password', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  
  try {
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // FIX: Changed 'password' to 'password_hash'
    const result = await pool.query(`
      UPDATE admins 
      SET password_hash = $1
      WHERE id = $2
      RETURNING id, username
    `, [hashedPassword, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found'
      });
    }
    
    console.log(`✅ Password reset for admin: ${result.rows[0].username}`);
    
    res.json({
      success: true,
      message: `Password reset for ${result.rows[0].username}`
    });
    
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

// ==========================================
// SHARE LINK MANAGEMENT (ADMIN)
// ==========================================

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const {
      client_name,
      client_email,
      client_company,
      scans_limit,
      valid_days,
      notes,
      send_email
    } = req.body;
    
    if (!client_email) {
      return res.status(400).json({
        success: false,
        error: 'Client email is required'
      });
    }
    
    let shareCode = generateShareCode('SCAN');
    let codeExists = true;
    
    while (codeExists) {
      const check = await pool.query(
        'SELECT id FROM share_links WHERE share_code = $1',
        [shareCode]
      );
      codeExists = check.rows.length > 0;
      if (codeExists) shareCode = generateShareCode('SCAN');
    }
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (valid_days || 7));
    
    // Check if admin_id exists in admins table
    // If not (super admin from super_admins table), set to NULL
    let adminIdToUse = null;
    
    const adminCheck = await pool.query(
      'SELECT id FROM admins WHERE id = $1',
      [req.admin.id]
    );
    
    if (adminCheck.rows.length > 0) {
      adminIdToUse = req.admin.id;
    }
    // If not found in admins table, adminIdToUse remains NULL
    // This allows super_admins to create share links
    
    const result = await pool.query(`
      INSERT INTO share_links (
        share_code, admin_id, client_name, client_email, client_company,
        scans_limit, valid_days, expires_at, link_type, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      shareCode,
      adminIdToUse,
      client_name || null,
      client_email,
      client_company || null,
      scans_limit || 5,
      valid_days || 7,
      expiresAt,
      'admin',
      notes || null
    ]);
    
    const shareLink = result.rows[0];
    const shareUrl = `${process.env.BASE_URL || 'https://contentscale-platform-production.up.railway.app'}/scan-with-link/${shareCode}`;
    
    if (send_email) {
      console.log(`📧 Email would be sent to ${client_email} with link: ${shareUrl}`);
    }
    
    console.log(`✅ Share link created: ${shareCode} for ${client_email}`);
    
    res.json({
      success: true,
      share_link: shareLink,
      share_url: shareUrl,
      message: send_email ? 'Share link created and email sent' : 'Share link created'
    });
    
  } catch (error) {
    console.error('[CREATE SHARE LINK ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        sl.*,
        a.username as created_by,
        CASE 
          WHEN sl.expires_at < NOW() THEN 'expired'
          WHEN sl.scans_used >= sl.scans_limit THEN 'limit_reached'
          WHEN sl.is_active = false THEN 'inactive'
          ELSE 'active'
        END as status
      FROM share_links sl
      LEFT JOIN admins a ON sl.admin_id = a.id
    `;
    
    let params = [];
    
    if (status) {
      query += ` WHERE (
        CASE 
          WHEN sl.expires_at < NOW() THEN 'expired'
          WHEN sl.scans_used >= sl.scans_limit THEN 'limit_reached'
          WHEN sl.is_active = false THEN 'inactive'
          ELSE 'active'
        END
      ) = $1`;
      params.push(status);
    }
    
    query += ' ORDER BY sl.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      share_links: result.rows
    });
    
  } catch (error) {
    console.error('[LIST SHARE LINKS ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(`
      SELECT 
        sl.*,
        a.username as created_by,
        COUNT(DISTINCT s.id) as total_scans
      FROM share_links sl
      LEFT JOIN admins a ON sl.admin_id = a.id
      LEFT JOIN scans s ON sl.id = s.share_link_id
      WHERE sl.share_code = $1
      GROUP BY sl.id, a.username
    `, [code]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Share link not found'
      });
    }
    
    const scans = await pool.query(`
      SELECT url, score, quality, word_count, created_at
      FROM scans
      WHERE share_link_id = $1
      ORDER BY created_at DESC
    `, [result.rows[0].id]);
    
    res.json({
      success: true,
      share_link: result.rows[0],
      scans: scans.rows
    });
    
  } catch (error) {
    console.error('[GET SHARE LINK ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(
      'DELETE FROM share_links WHERE share_code = $1 RETURNING *',
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Share link not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Share link deleted'
    });
    
  } catch (error) {
    console.error('[DELETE SHARE LINK ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// SHARE LINK PUBLIC ENDPOINTS
// ==========================================

app.get('/api/share-link/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(`
      SELECT 
        share_code, client_name, client_email,
        scans_limit, scans_used, expires_at, is_active,
        link_type
      FROM share_links
      WHERE share_code = $1
    `, [code]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid share link'
      });
    }
    
    const link = result.rows[0];
    
    if (new Date(link.expires_at) < new Date()) {
      return res.json({
        success: false,
        error: 'This share link has expired',
        status: 'expired',
        expires_at: link.expires_at
      });
    }
    
    if (link.scans_used >= link.scans_limit) {
      return res.json({
        success: false,
        error: 'Scan limit reached',
        status: 'limit_reached',
        scans_used: link.scans_used,
        scans_limit: link.scans_limit
      });
    }
    
    if (!link.is_active) {
      return res.json({
        success: false,
        error: 'This share link is inactive',
        status: 'inactive'
      });
    }
    
    res.json({
      success: true,
      status: 'active',
      scans_remaining: link.scans_limit - link.scans_used,
      scans_limit: link.scans_limit,
      scans_used: link.scans_used,
      expires_at: link.expires_at,
      client_name: link.client_name
    });
    
  } catch (error) {
    console.error('[VALIDATE SHARE LINK ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/share-link/scan', async (req, res) => {
  try {
    const { share_code, url } = req.body;
    
    if (!share_code || !url) {
      return res.status(400).json({
        success: false,
        error: 'Share code and URL required'
      });
    }
    
    const linkResult = await pool.query(
      'SELECT * FROM share_links WHERE share_code = $1',
      [share_code]
    );
    
    if (linkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid share link'
      });
    }
    
    const link = linkResult.rows[0];
    
    if (new Date(link.expires_at) < new Date()) {
      return res.status(403).json({
        success: false,
        error: 'This share link has expired',
        status: 'expired'
      });
    }
    
    if (link.scans_used >= link.scans_limit) {
      return res.status(403).json({
        success: false,
        error: 'Scan limit reached for this share link',
        status: 'limit_reached'
      });
    }
    
    if (!link.is_active) {
      return res.status(403).json({
        success: false,
        error: 'This share link is inactive',
        status: 'inactive'
      });
    }
    
    console.log(`[SHARE LINK SCAN] ${share_code}: ${url}`);
    
    const scanResult = await performHybridScan(url);
    
    await pool.query(`
      INSERT INTO scans (
        url, score, quality, url_hash, share_id, share_link_id,
        graaf_score, craft_score, technical_score,
        validation_data, scan_type, ip_address, word_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      url,
      scanResult.score,
      scanResult.quality,
      hashUrl(url),
      generateShareId(),
      link.id,
      scanResult.breakdown.graaf.total,
      scanResult.breakdown.craft.total,
      scanResult.breakdown.technical.total,
      JSON.stringify(scanResult.validation || {}),
      'share_link',
      req.ip,
      scanResult.wordCount || 0
    ]);
    
    await pool.query(`
      UPDATE share_links
      SET scans_used = scans_used + 1,
          last_used_at = NOW()
      WHERE id = $1
    `, [link.id]);
    
    const scansRemaining = link.scans_limit - link.scans_used - 1;
    
    console.log(`✅ Share link scan: ${scanResult.score}/100 (${scansRemaining} remaining)`);
    
    res.json({
      success: true,
      ...scanResult,
      scans_remaining: scansRemaining,
      scans_limit: link.scans_limit
    });
    
  } catch (error) {
    console.error('[SHARE LINK SCAN ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// LEAD MANAGEMENT
// ==========================================

app.post('/api/leads/submit', async (req, res) => {
  try {
    const {
      name,
      email,
      company,
      phone,
      message,
      source = 'contact_form'
    } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    const existingLead = await pool.query(
      'SELECT id, share_link_id FROM leads WHERE email = $1',
      [email]
    );
    
    if (existingLead.rows.length > 0) {
      const lead = existingLead.rows[0];
      
      if (lead.share_link_id) {
        const linkResult = await pool.query(
          'SELECT share_code FROM share_links WHERE id = $1',
          [lead.share_link_id]
        );
        
        return res.json({
          success: true,
          message: 'We already sent you a free scan link!',
          existing_lead: true,
          share_code: linkResult.rows[0]?.share_code,
          share_url: `${process.env.BASE_URL || 'https://contentscale-platform-production.up.railway.app'}/scan-with-link/${linkResult.rows[0]?.share_code}`
        });
      }
    }
    
    const shareCode = generateShareCode('LEAD');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const shareLinkResult = await pool.query(`
      INSERT INTO share_links (
        share_code, client_name, client_email, client_company,
        scans_limit, valid_days, expires_at, link_type
      ) VALUES ($1, $2, $3, $4, 1, 7, $5, 'lead')
      RETURNING id, share_code
    `, [shareCode, name, email, company, expiresAt]);
    
    const shareLink = shareLinkResult.rows[0];
    
    let leadResult;
    if (existingLead.rows.length > 0) {
      leadResult = await pool.query(`
        UPDATE leads
        SET share_link_id = $1, message = $2, updated_at = NOW()
        WHERE email = $3
        RETURNING *
      `, [shareLink.id, message, email]);
    } else {
      leadResult = await pool.query(`
        INSERT INTO leads (
          name, email, company, phone, message, source,
          share_link_id, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        name, email, company || null, phone || null, message || null,
        source, shareLink.id, req.ip, req.headers['user-agent']
      ]);
    }
    
    const shareUrl = `${process.env.BASE_URL || 'https://contentscale-platform-production.up.railway.app'}/scan-with-link/${shareCode}`;
    
    console.log(`✅ Lead: ${email} with scan link: ${shareCode}`);
    
    res.json({
      success: true,
      message: 'Thank you! Check your email for your free scan link.',
      share_code: shareCode,
      share_url: shareUrl,
      lead_id: leadResult.rows[0].id
    });
    
  } catch (error) {
    console.error('[LEAD SUBMISSION ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/leads', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        l.*,
        sl.share_code,
        sl.scans_used,
        sl.scans_limit
      FROM leads l
      LEFT JOIN share_links sl ON l.share_link_id = sl.id
    `;
    
    let params = [];
    
    if (status) {
      query += ' WHERE l.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY l.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      leads: result.rows
    });
    
  } catch (error) {
    console.error('[LIST LEADS ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// AGENCY MANAGEMENT ENDPOINTS
// ==========================================

app.get('/api/super-admin/agencies', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        a.*,
        COUNT(DISTINCT c.id) as client_count,
        COUNT(DISTINCT s.id) as total_scans
       FROM agencies a
       LEFT JOIN clients c ON a.id = c.agency_id
       LEFT JOIN scans s ON a.id = s.agency_id
       GROUP BY a.id
       ORDER BY a.created_at DESC`
    );
    
    res.json({
      success: true,
      agencies: result.rows
    });
    
  } catch (error) {
    console.error('[SUPER ADMIN AGENCIES ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agencies', authenticateSuperAdmin, async (req, res) => {
  const { 
    name, domain, country, plan, 
    contact_person, contact_email, phone,
    whitelabel, is_active 
  } = req.body;
  
  try {
    if (!name || !domain || !country || !plan) {
      return res.status(400).json({
        success: false,
        error: 'Name, domain, country, and plan are required'
      });
    }
    
    const existingDomain = await pool.query(
      'SELECT id FROM agencies WHERE domain = $1',
      [domain]
    );
    
    if (existingDomain.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Domain already exists'
      });
    }
    
    let adminKey;
    let keyExists = true;
    
    while (keyExists) {
      adminKey = generateAdminKey();
      const check = await pool.query(
        'SELECT id FROM agencies WHERE admin_key = $1',
        [adminKey]
      );
      keyExists = check.rows.length > 0;
    }
    
    const result = await pool.query(`
      INSERT INTO agencies (
        name, domain, country, plan, admin_key,
        contact_person, contact_email, phone,
        whitelabel, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, name, domain, country, plan, admin_key, is_active, created_at
    `, [
      name, domain, country, plan, adminKey,
      contact_person || null,
      contact_email || null,
      phone || null,
      whitelabel || false,
      is_active !== false
    ]);
    
    console.log(`✅ Agency created: ${name} with key ${adminKey}`);
    
    res.json({
      success: true,
      message: 'Agency created successfully',
      agency: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create agency'
    });
  }
});

app.patch('/api/super-admin/agencies/:id', async (req, res) => {
  try {
    const agencyId = req.params.id;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    values.push(agencyId);
    
    const result = await pool.query(
      `UPDATE agencies SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    res.json({
      success: true,
      agency: result.rows[0]
    });
    
  } catch (error) {
    console.error('[UPDATE AGENCY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AGENCY ADMIN ENDPOINTS
// ==========================================

app.get('/api/admin/agency/my-agency', async (req, res) => {
  try {
    const agencyKey = req.headers['x-agency-key'];
    
    if (!agencyKey) {
      return res.status(401).json({ error: 'Agency key required' });
    }
    
    const agencyResult = await pool.query(
      'SELECT * FROM agencies WHERE admin_key = $1',
      [agencyKey]
    );
    
    if (agencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid agency key' });
    }
    
    const agency = agencyResult.rows[0];
    
    const clientsResult = await pool.query(
      'SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC',
      [agency.id]
    );
    
    res.json({
      success: true,
      agency: agency,
      clients: clientsResult.rows
    });
    
  } catch (error) {
    console.error('[MY AGENCY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/agency/my-clients', async (req, res) => {
  try {
    const agencyKey = req.headers['x-agency-key'];
    
    if (!agencyKey) {
      return res.status(401).json({ error: 'Agency key required' });
    }
    
    const agencyResult = await pool.query(
      'SELECT id FROM agencies WHERE admin_key = $1',
      [agencyKey]
    );
    
    if (agencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid agency key' });
    }
    
    const agencyId = agencyResult.rows[0].id;
    
    const clientsResult = await pool.query(
      'SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC',
      [agencyId]
    );
    
    res.json({
      success: true,
      clients: clientsResult.rows
    });
    
  } catch (error) {
    console.error('[MY CLIENTS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/agency/my-clients', async (req, res) => {
  try {
    const agencyKey = req.headers['x-agency-key'];
    const { client_name, client_email, scans_limit } = req.body;
    
    if (!agencyKey) {
      return res.status(401).json({ error: 'Agency key required' });
    }
    
    if (!client_name) {
      return res.status(400).json({ error: 'Client name required' });
    }
    
    const agencyResult = await pool.query(
      'SELECT id FROM agencies WHERE admin_key = $1',
      [agencyKey]
    );
    
    if (agencyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid agency key' });
    }
    
    const agencyId = agencyResult.rows[0].id;
    const shareKey = generateKey('share');
    
    const clientResult = await pool.query(
      `INSERT INTO clients (
        agency_id, client_name, client_email, share_link_key, scans_limit
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [agencyId, client_name, client_email || null, shareKey, scans_limit || 30]
    );
    
    console.log(`✅ Client created: ${client_name} (share: ${shareKey})`);
    
    res.json({
      success: true,
      client: clientResult.rows[0]
    });
    
  } catch (error) {
    console.error('[CREATE CLIENT ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/agency/my-clients/:id', async (req, res) => {
  try {
    const agencyKey = req.headers['x-agency-key'];
    const clientId = req.params.id;
    
    if (!agencyKey) {
      return res.status(401).json({ error: 'Agency key required' });
    }
    
    const result = await pool.query(
      `DELETE FROM clients 
       WHERE id = $1 
       AND agency_id = (SELECT id FROM agencies WHERE admin_key = $2)
       RETURNING *`,
      [clientId, agencyKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or unauthorized' });
    }
    
    res.json({
      success: true,
      deleted: result.rows[0]
    });
    
  } catch (error) {
    console.error('[DELETE CLIENT ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/agency/my-agency/whitelabel', async (req, res) => {
  try {
    const agencyKey = req.headers['x-agency-key'];
    const { name, logo, primary_color } = req.body;
    
    if (!agencyKey) {
      return res.status(401).json({ error: 'Agency key required' });
    }
    
    const result = await pool.query(
      `UPDATE agencies 
       SET whitelabel_name = $1,
           whitelabel_logo = $2,
           whitelabel_primary_color = $3
       WHERE admin_key = $4
       RETURNING *`,
      [name || null, logo || null, primary_color || '#4A9BFF', agencyKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid agency key' });
    }
    
    res.json({
      success: true,
      agency: result.rows[0]
    });
    
  } catch (error) {
    console.error('[WHITELABEL UPDATE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CLIENT ENDPOINTS
// ==========================================

app.get('/api/client/info', async (req, res) => {
  try {
    const shareKey = req.query.key;
    
    if (!shareKey) {
      return res.status(400).json({ error: 'Share key required' });
    }
    
    const result = await pool.query(
      `SELECT c.*, a.whitelabel_name, a.whitelabel_logo, a.whitelabel_primary_color
       FROM clients c
       JOIN agencies a ON c.agency_id = a.id
       WHERE c.share_link_key = $1 AND c.is_active = true`,
      [shareKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid share key' });
    }
    
    res.json({
      success: true,
      client: result.rows[0]
    });
    
  } catch (error) {
    console.error('[CLIENT INFO ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/client/scan', async (req, res) => {
  try {
    const { key, url } = req.body;
    
    if (!key || !url) {
      return res.status(400).json({
        success: false,
        error: 'Share key and URL required'
      });
    }
    
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE share_link_key = $1 AND is_active = true',
      [key]
    );
    
    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid share key'
      });
    }
    
    const client = clientResult.rows[0];
    
    if (client.scans_used >= client.scans_limit) {
      return res.status(429).json({
        success: false,
        error: 'Scan limit reached. Contact your agency for more scans.'
      });
    }
    
    console.log(`[CLIENT SCAN] ${client.client_name}: ${url}`);
    
    const result = await performHybridScan(url);
    
    await recordScan({
      agencyId: client.agency_id,
      clientId: client.id,
      url: url,
      score: result.score,
      quality: result.quality,
      graafScore: result.breakdown.graaf.total,
      craftScore: result.breakdown.craft.total,
      technicalScore: result.breakdown.technical.total,
      validation: result.validation,
      scanType: 'client',
      ipAddress: req.ip,
      wordCount: result.wordCount
    });
    
    console.log(`✅ Client scan complete: ${result.score}/100`);
    
    return res.json({
      success: true,
      ...result,
      scans_remaining: client.scans_limit - client.scans_used - 1
    });
    
  } catch (error) {
    console.error('[CLIENT SCAN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Scan failed'
    });
  }
});
// ==========================================
// GLOBAL LEADERBOARD ADDITIONS
// Add these endpoints to your existing server.js
// ==========================================

// Add this AFTER your existing endpoints, BEFORE app.listen()

// ==========================================
// GLOBAL LEADERBOARD ENDPOINTS
// ==========================================

// GET Global Leaderboard (All Industries)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { 
      limit = 100, 
      category = 'all',
      country = 'all',
      language = 'all'
    } = req.query;
    
    let query = `
      SELECT 
        url,
        score,
        quality,
        graaf_score,
        craft_score,
        technical_score,
        word_count,
        created_at as scanned_at,
        company_name,
        category,
        country,
        language
      FROM public_leaderboard
      WHERE is_public = true
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by category
    if (category && category !== 'all') {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    // Filter by country
    if (country && country !== 'all') {
      query += ` AND country = $${paramCount}`;
      params.push(country);
      paramCount++;
    }
    
    // Filter by language
    if (language && language !== 'all') {
      query += ` AND language = $${paramCount}`;
      params.push(language);
      paramCount++;
    }
    
    query += ` ORDER BY score DESC, scanned_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    // Add rank to each entry
    const entries = result.rows.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
    
    console.log(`[LEADERBOARD] Fetched ${entries.length} entries (category: ${category}, country: ${country})`);
    
    res.json({
      success: true,
      total: entries.length,
      filters: { category, country, language },
      entries: entries
    });
    
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load leaderboard'
    });
  }
});

// POST Submit to Leaderboard (after scan)
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const {
      url,
      score,
      quality,
      graaf_score,
      craft_score,
      technical_score,
      word_count,
      company_name,
      category,
      country,
      language
    } = req.body;
    
    if (!url || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'URL and score required'
      });
    }
    
    // Check if URL already exists in leaderboard
    const existing = await pool.query(
      'SELECT id, score FROM public_leaderboard WHERE url = $1',
      [url]
    );
    
    if (existing.rows.length > 0) {
      // Update if new score is better
      if (score > existing.rows[0].score) {
        await pool.query(`
          UPDATE public_leaderboard
          SET score = $1,
              quality = $2,
              graaf_score = $3,
              craft_score = $4,
              technical_score = $5,
              word_count = $6,
              company_name = $7,
              category = $8,
              country = $9,
              language = $10,
              updated_at = NOW()
          WHERE url = $11
        `, [
          score, quality, graaf_score, craft_score, technical_score,
          word_count, company_name, category, country, language, url
        ]);
        
        console.log(`✅ Leaderboard updated: ${url} (${existing.rows[0].score} → ${score})`);
        
        return res.json({
          success: true,
          message: 'Leaderboard entry updated with better score!',
          action: 'updated'
        });
      } else {
        return res.json({
          success: true,
          message: 'Already on leaderboard with equal or better score',
          action: 'existing'
        });
      }
    }
    
    // Insert new entry
    const result = await pool.query(`
      INSERT INTO public_leaderboard (
        url, score, quality,
        graaf_score, craft_score, technical_score,
        word_count, company_name, category, country, language,
        is_public, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW())
      RETURNING *
    `, [
      url, score, quality,
      graaf_score, craft_score, technical_score,
      word_count, company_name, category, country, language
    ]);
    
    // Get rank
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
      [score]
    );
    
    const rank = rankResult.rows[0].rank;
    
    console.log(`✅ Added to leaderboard: ${url} - Rank #${rank} (${score}/100)`);
    
    res.json({
      success: true,
      message: 'Added to leaderboard!',
      action: 'created',
      rank: rank,
      entry: result.rows[0]
    });
    
  } catch (error) {
    console.error('[LEADERBOARD SUBMIT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit to leaderboard'
    });
  }
});

// GET Specific entry details
app.get('/api/leaderboard/entry/:url_hash', async (req, res) => {
  try {
    const { url_hash } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM public_leaderboard WHERE url_hash = $1',
      [url_hash]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Get rank
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
      [result.rows[0].score]
    );
    
    res.json({
      success: true,
      entry: {
        ...result.rows[0],
        rank: rankResult.rows[0].rank
      }
    });
    
  } catch (error) {
    console.error('[LEADERBOARD ENTRY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load entry'
    });
  }
});

// DELETE Remove from leaderboard (admin only)
app.delete('/api/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM public_leaderboard WHERE id = $1 RETURNING url',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    console.log(`✅ Removed from leaderboard: ${result.rows[0].url}`);
    
    res.json({
      success: true,
      message: 'Entry removed from leaderboard'
    });
    
  } catch (error) {
    console.error('[LEADERBOARD DELETE ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete entry'
    });
  }
});

// GET Leaderboard stats
app.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        ROUND(AVG(score), 1) as average_score,
        MAX(score) as highest_score,
        MIN(score) as lowest_score,
        COUNT(DISTINCT country) as total_countries,
        COUNT(DISTINCT category) as total_categories
      FROM public_leaderboard
      WHERE is_public = true
    `);
    
    const topCountries = await pool.query(`
      SELECT country, COUNT(*) as count
      FROM public_leaderboard
      WHERE is_public = true AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 5
    `);
    
    const topCategories = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM public_leaderboard
      WHERE is_public = true AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      stats: stats.rows[0],
      top_countries: topCountries.rows,
      top_categories: topCategories.rows
    });
    
  } catch (error) {
    console.error('[LEADERBOARD STATS ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load stats'
    });
  }
});

// ==========================================
// MODIFIED /api/scan-free TO SUPPORT LEADERBOARD
// Replace your existing /api/scan-free with this:
// ==========================================

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url, submit_to_leaderboard, company_name, category } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    console.log(`[FREE SCAN] ${url}`);
    
    const urlHash = hashUrl(url);
    const shareId = generateShareId();
    
    // Check for recent scan (1 hour cache)
    const existingScan = await pool.query(
      `SELECT * FROM scans 
       WHERE url = $1 
       AND scan_type = 'free'
       AND created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at DESC
       LIMIT 1`,
      [url]
    );
    
    let result;
    
    if (existingScan.rows.length > 0) {
      console.log('✅ Using cached scan result');
      const cached = existingScan.rows[0];
      
      result = {
        success: true,
        url: url,
        score: cached.score,
        quality: cached.quality,
        breakdown: {
          graaf: { total: cached.graaf_score || 0 },
          craft: { total: cached.craft_score || 0 },
          technical: { total: cached.technical_score || 0 }
        },
        validation: typeof cached.validation_data === 'string' 
          ? JSON.parse(cached.validation_data) 
          : cached.validation_data,
        timestamp: cached.created_at,
        share_id: cached.share_id || shareId,
        wordCount: cached.word_count || 0,
        cached: true
      };
      
    } else {
      // Perform new scan
      result = await performHybridScan(url);
      result.share_id = shareId;
      result.cached = false;
      
      // Record in scans table
      await pool.query(
        `INSERT INTO scans (
          url, score, quality, url_hash, share_id,
          graaf_score, craft_score, technical_score,
          validation_data, scan_type, ip_address, word_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          url, result.score, result.quality, urlHash, shareId,
          result.breakdown.graaf.total,
          result.breakdown.craft.total,
          result.breakdown.technical.total,
          JSON.stringify(result.validation || {}),
          'free', req.ip, result.wordCount || 0
        ]
      );
    }
    
    // If user wants to submit to leaderboard
    if (submit_to_leaderboard) {
      try {
        // Auto-detect category and country if not provided
        const detectedCategory = category || detectCategory(url, result);
        const detectedCountry = detectCountry(url);
        const detectedLanguage = detectLanguage(url);
        
        await pool.query(`
          INSERT INTO public_leaderboard (
            url, url_hash, score, quality,
            graaf_score, craft_score, technical_score,
            word_count, company_name, category, country, language,
            is_public, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW())
          ON CONFLICT (url) DO UPDATE
          SET score = GREATEST(public_leaderboard.score, EXCLUDED.score),
              updated_at = NOW()
        `, [
          url, urlHash, result.score, result.quality,
          result.breakdown.graaf.total,
          result.breakdown.craft.total,
          result.breakdown.technical.total,
          result.wordCount,
          company_name || extractCompanyName(url),
          detectedCategory,
          detectedCountry,
          detectedLanguage
        ]);
        
        // Get rank
        const rankResult = await pool.query(
          'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
          [result.score]
        );
        
        result.leaderboard = {
          submitted: true,
          rank: rankResult.rows[0].rank
        };
        
        console.log(`✅ Added to leaderboard: Rank #${rankResult.rows[0].rank}`);
        
      } catch (leaderboardError) {
        console.error('Leaderboard submission failed:', leaderboardError);
        // Don't fail the scan if leaderboard submission fails
        result.leaderboard = {
          submitted: false,
          error: 'Failed to add to leaderboard'
        };
      }
    }
    
    return res.json(result);
    
  } catch (error) {
    console.error('[FREE SCAN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Scan failed'
    });
  }
});

// ==========================================
// HELPER FUNCTIONS FOR AUTO-DETECTION
// ==========================================

function detectCategory(url, scanResult) {
  const urlLower = url.toLowerCase();
  const content = scanResult.metadata?.title || '';
  const contentLower = content.toLowerCase();
  
  // SEO Agency
  if (urlLower.includes('seo') || 
      contentLower.includes('seo agency') ||
      contentLower.includes('digital marketing agency') ||
      contentLower.includes('seo services')) {
    return 'agency';
  }
  
  // SaaS
  if (urlLower.includes('app') ||
      contentLower.includes('software as a service') ||
      contentLower.includes('saas') ||
      contentLower.includes('pricing') ||
      contentLower.includes('free trial')) {
    return 'saas';
  }
  
  // E-commerce
  if (urlLower.includes('shop') ||
      urlLower.includes('store') ||
      contentLower.includes('add to cart') ||
      contentLower.includes('buy now')) {
    return 'ecommerce';
  }
  
  // Blog
  if (urlLower.includes('/blog/') ||
      urlLower.includes('/article/') ||
      urlLower.includes('/post/')) {
    return 'blog';
  }
  
  return 'other';
}

function detectCountry(url) {
  const tld = url.split('.').pop().toLowerCase();
  
  const tldMap = {
    'nl': 'NL',
    'be': 'BE',
    'de': 'DE',
    'uk': 'UK',
    'co.uk': 'UK',
    'fr': 'FR',
    'es': 'ES',
    'it': 'IT',
    'com': 'GLOBAL',
    'org': 'GLOBAL',
    'net': 'GLOBAL'
  };
  
  return tldMap[tld] || 'OTHER';
}

function detectLanguage(url) {
  const country = detectCountry(url);
  
  const countryLanguageMap = {
    'NL': 'nl',
    'BE': 'nl', // Could be 'fr' too, but default to 'nl'
    'DE': 'de',
    'UK': 'en',
    'FR': 'fr',
    'ES': 'es',
    'IT': 'it',
    'GLOBAL': 'en'
  };
  
  return countryLanguageMap[country] || 'en';
}

function extractCompanyName(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const parts = domain.split('.');
    
    // Take first part of domain and capitalize
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown';
  }
}

// ==========================================
// END OF LEADERBOARD ADDITIONS
// ==========================================

// ==========================================
// FREE AI CONTENT PROMPT GENERATOR
// ==========================================

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ==========================================
// ELITE CONTENT PROMPT GENERATOR
// Generates 95-100/100 Scoring Prompts
// Vervang app.post('/api/generate-content-prompt') in server.js
// ==========================================
    
    console.log(`[ELITE PROMPT] Generating 95-100/100 prompt for ${url}`);
    
    // Extract topic from URL
    let topic = 'this topic';
    let keyword = '';
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path && path !== '/') {
        const segments = path.split('/').filter(p => p);
        topic = segments[segments.length - 1] || segments[0] || 'this topic';
        topic = topic.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\.html?$/i, '');
        keyword = topic;
      } else {
        const domain = urlObj.hostname.replace('www.', '');
        topic = domain.split('.')[0];
        keyword = topic;
      }
    } catch {}
    
    // Analyze what's missing
    const missing = [];
    
    if (breakdown?.graaf?.total < 40) {
      missing.push('lacks credible sources and expert quotes');
      missing.push('needs authoritative statistics with citations');
      missing.push('missing case studies with concrete results');
    }
    
    if (breakdown?.craft?.total < 24) {
      missing.push('poor structure and readability');
      missing.push('needs FAQ section with comprehensive answers');
      missing.push('missing visual elements and tables');
    }
    
    if (breakdown?.technical?.total < 16) {
      missing.push('missing schema markup (Article + FAQPage)');
      missing.push('needs meta optimization');
    }
    
    if (wordCount < 2500) {
      missing.push(`too short at ${wordCount} words (needs 2500+)`);
    }
    
    // Generate ELITE prompt
    const elitePrompt = `# ELITE SEO CONTENT REWRITE - 95-100/100 SCORE
**Target URL:** ${url}
**Topic:** ${topic}
**Target Keyword:** "${keyword}"
**Current Score:** ${score}/100 ❌
**Target Score:** 95-100/100 ✅

---

## YOUR MISSION
Completely rewrite this content to score 95-100/100 using the GRAAF + CRAFT + Technical SEO framework.

**Current Issues:**
${missing.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

---

## MANDATORY OUTPUT STRUCTURE

### 1. DIRECT ANSWER BOX (40-60 words) - AI OVERVIEW READY
Start with a quotable, citation-ready answer:

**What is ${keyword}?**
> [Direct answer in 1-2 sentences, max 15 words per sentence]. According to [Expert Name], [Title] at [Organization], "[specific statistic or insight]." [One actionable benefit with number].

**Requirements:**
- Include target keyword in first sentence
- Cite authoritative source (name, title, organization)
- Include specific number/statistic
- Max 60 words total
- Quotable format (<15 words per sentence)

---

### 2. TL;DR SECTION (Exactly 5 Key Takeaways)
Bullet list of exactly 5 quotable insights:

- **[Takeaway 1 with specific number]** - According to [Source], [Year]
- **[Takeaway 2 with actionable tip]** - [Expert], [Organization]
- **[Takeaway 3 with benefit]** - Up to X% improvement
- **[Takeaway 4 with comparison]** - X vs Y advantage
- **[Takeaway 5 with timeframe]** - Results in X days/months

**Requirements:**
- Each under 15 words
- Include numbers where possible
- Cite sources
- Mix stats, tips, and benefits

---

### 3. TABLE OF CONTENTS
Auto-generated from all H2 and H3 headings with anchor links.

---

### 4. MAIN CONTENT (2500+ words minimum)

**Structure for EACH H2 section:**

#### H2: [Subheading with keyword variation]

![Alt text: ${keyword} [specific aspect]](image-placeholder.jpg)
*Caption: [Descriptive caption with keyword]*

[Opening paragraph 100-150 words introducing this section]
- Use target keyword naturally
- Introduce what reader will learn
- Include transition from previous section

[Second paragraph 100-150 words with deeper detail]
- Provide specific examples
- Include data or statistics
- Explain the "why" behind concepts

[Third paragraph 100-150 words with practical application]
- Show real-world use case
- Give actionable steps
- Connect to reader's needs

**📊 Expert Quote:**
> "[Relevant, meaningful quote about this specific topic]" — **[Full Name], [Exact Title], [Organization]**

**📈 Key Statistic:** 
[Specific number with context]. According to [Organization/Study Name], [Year]. [Brief explanation of significance].

**💡 Pro Tip:**
[Actionable tip related to this section - max 2 sentences]

[Comparison table if relevant for this section]

| Feature/Aspect | Option A | Option B | Option C | Winner |
|----------------|----------|----------|----------|--------|
| Price          | €X       | €Y       | €Z       | ✅ A   |
| Key Metric     | [Data]   | [Data]   | [Data]   | ⭐ B   |
| Use Case       | [Info]   | [Info]   | [Info]   | 🏆 C   |

**Repeat this structure for 5-7 H2 sections minimum.**

---

### 5. CASE STUDIES (Minimum 2)

#### Case Study 1: [Company/Person Name]
- **Industry:** [Specific industry]
- **Challenge:** [Specific problem with numbers if possible]
- **Solution:** [3-5 specific actions taken]
  1. [Action 1 with detail]
  2. [Action 2 with detail]
  3. [Action 3 with detail]
- **Results:**
  - **Metric 1:** +X% [specific metric]
  - **Metric 2:** €Y [revenue/cost impact]
  - **Metric 3:** Z [volume/count increase]
- **Timeline:** [X weeks/months]
- **Key Lesson:** [Actionable takeaway others can apply]

#### Case Study 2: [Different Company/Scenario]
[Same structure as above]

**Requirements:**
- Real or realistic scenarios
- Concrete numbers (percentages, revenue, traffic, etc.)
- Specific timeframes
- Actionable lessons

---

### 6. FAQ SECTION (Minimum 10 Questions)

**Q1: What is ${keyword}?**
[100-150 word answer]
- Start with direct answer in first sentence
- Expand with 2-3 supporting points
- Include "According to [Expert/Source], [specific fact]"
- End with actionable tip or next step
- **Internal link:** [/related-page]
- **External link:** [authoritative-source.com]

**Q2: How to [action related to ${keyword}]?**
[100-150 word answer with numbered steps if applicable]
1. [Step 1 with detail]
2. [Step 2 with detail]
3. [Step 3 with detail]
**Source:** [Organization Name], [Year]
- **Internal link:** [/related-guide]
- **External link:** [authoritative-tutorial.com]

**Q3: Why is ${keyword} important?**
[100-150 word answer]
[Answer with specific benefits and statistics]
- **Internal link:** [/benefits-page]
- **External link:** [research-source.org]

**Q4: When should you [use/implement ${keyword}]?**
[100-150 word answer]
[Answer with scenarios and timing]
- **Internal link:** [/getting-started]
- **External link:** [industry-standard.com]

**Q5: Where to find [best ${keyword} resources]?**
[100-150 word answer]
[Answer with specific recommendations]
- **Internal link:** [/resources]
- **External link:** [resource-directory.com]

**Q6: Who needs ${keyword}?**
[100-150 word answer]
[Answer with target audience breakdown]
- **Internal link:** [/audience-guide]
- **External link:** [industry-report.org]

**Q7: ${keyword} vs [Alternative]?**
[100-150 word answer]
[Answer with comparison and winner]
- **Internal link:** [/comparison]
- **External link:** [comparison-study.com]

**Q8: Best ${keyword} for [specific use case]?**
[100-150 word answer]
[Answer with recommendations]
- **Internal link:** [/recommendations]
- **External link:** [review-site.com]

**Q9: Common ${keyword} mistakes to avoid?**
[100-150 word answer]
[Answer with 3-5 common mistakes]
- **Internal link:** [/best-practices]
- **External link:** [expert-advice.org]

**Q10: ${keyword} cost/pricing?**
[100-150 word answer]
[Answer with price ranges and ROI]
- **Internal link:** [/pricing]
- **External link:** [pricing-benchmark.com]

**Requirements for ALL FAQs:**
- Each answer 100-150 words minimum
- Start with direct answer
- Include source/citation
- 1 internal + 1 external link per FAQ
- Use keyword variations naturally

---

### 7. STATISTICS OVERVIEW (Minimum 8)

- **[Statistic 1 with full context]** - Source: [Organization Name], [Study Name], [Year]
- **[Statistic 2 with trend direction]** - Source: [Research Name], [Year]
- **[Statistic 3 with comparison]** - Source: [Authority], [Year]
- **[Statistic 4 with timeframe]** - Source: [Publication], [Year]
- **[Statistic 5 with ROI/benefit]** - Source: [Company/Study], [Year]
- **[Statistic 6 with market data]** - Source: [Market Research], [Year]
- **[Statistic 7 with growth rate]** - Source: [Report Name], [Year]
- **[Statistic 8 with prediction]** - Source: [Expert/Analyst], [Year]

**Requirements:**
- All from 2023-2025 (freshness!)
- Full source attribution
- Mix of types: adoption, ROI, growth, comparison
- Include year published

---

### 8. EXPERT QUOTES (Minimum 4)

1. **"[Insight about fundamentals or definition]"** — **[Full Name], [Exact Title], [Company/Organization]**

2. **"[Contrarian viewpoint or unique perspective]"** — **[Full Name], [Exact Title], [Company/Organization]**

3. **"[Practical advice or actionable tip]"** — **[Full Name], [Exact Title], [Company/Organization]**

4. **"[Future prediction or trend forecast]"** — **[Full Name], [Exact Title], [Company/Organization]**

**Source Priority:**
- Industry leaders (C-level executives)
- Published researchers (.edu domains)
- Government agencies (.gov domains)
- Major publication editors

---

### 9. AUTHOR BIO (200-250 words)

**About the Author: [Full Name]**

[Full Name] is a [specific job title] with [X years] of proven experience in [specific field]. [He/She] specializes in [3 specific expertise areas] and has helped [specific achievement with number].

**Current Role:**
[Current position] at [Organization/Company], where [specific responsibility or achievement].

**Expertise & Specializations:**
- **[Expertise 1]:** [Specific detail about this expertise with years or achievement]
- **[Expertise 2]:** [Specific detail about this expertise with results]
- **[Expertise 3]:** [Specific detail about this expertise with recognition]

**Certifications & Credentials:**
- [Certification Name] - [Issuing Organization], [Year]
- [Certification Name] - [Issuing Organization], [Year]
- [Degree/Qualification] - [Institution], [Year]

**Notable Achievements:**
- [Achievement 1 with specific metric or recognition]
- [Achievement 2 with publication or speaking engagement]
- [Achievement 3 with industry award or milestone]

**Published Work:**
- [Publication 1] - [Where Published], [Year]
- [Publication 2] - [Where Published], [Year]

**Connect:**
- **Email:** [professional@domain.com]
- **LinkedIn:** [LinkedIn URL]
- **Website:** [Personal or company site]
- **Twitter/X:** [@handle] (if applicable)

---

### 10. SCHEMA MARKUP (CRITICAL!)

#### Article Schema (JSON-LD):
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Optimized Title - 50-60 characters with keyword]",
  "description": "[Meta Description - 150-160 characters]",
  "image": {
    "@type": "ImageObject",
    "url": "[Featured image URL]",
    "width": 1200,
    "height": 630
  },
  "author": {
    "@type": "Person",
    "name": "[Author Full Name]",
    "jobTitle": "[Author Job Title]",
    "url": "[Author LinkedIn or Website]",
    "sameAs": [
      "[Author LinkedIn]",
      "[Author Twitter]"
    ]
  },
  "publisher": {
    "@type": "Organization",
    "name": "[Website/Company Name]",
    "logo": {
      "@type": "ImageObject",
      "url": "[Logo URL]",
      "width": 600,
      "height": 60
    }
  },
  "datePublished": "[YYYY-MM-DD]",
  "dateModified": "[YYYY-MM-DD]",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "[Full Article URL]"
  },
  "wordCount": 2500,
  "articleSection": "[Category/Section]",
  "inLanguage": "en-US"
}
\`\`\`

#### FAQPage Schema (JSON-LD):
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[FAQ Question 1 - exact text]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Complete answer text including all 100+ words, sources, and links]"
      }
    },
    {
      "@type": "Question",
      "name": "[FAQ Question 2]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Complete answer]"
      }
    }
    // ... include ALL 10 FAQ questions
  ]
}
\`\`\`

---

### 11. META INFORMATION

**Publication Details:**
- **Published:** [DD Month YYYY]
- **Last Updated:** [DD Month YYYY]
- **Reading Time:** [X] minutes (word count ÷ 200)
- **Word Count:** 2500+ words

**Meta Title (50-60 characters):**
${keyword}: [Benefit] - [Authority/Year]

**Meta Description (150-160 characters):**
[Keyword] explained. [Key benefit with number]. [Action/Guide]. [Authority signal]. [CTA].

**Example:**
- **Title:** "${keyword}: Complete Guide to [X] - Expert Tips 2025"
- **Description:** "Master ${keyword} with proven strategies. Increase [metric] by X%. Expert insights + case studies. Start today."

---

## WRITING RULES (STRICT COMPLIANCE REQUIRED)

### Keyword Optimization:
**Target Keyword Density: 0.8-1.2%**
- At 2500 words: Use target keyword 20-30 times
- **Exact phrase:** Minimum 12 times
- **Variations:** 10-15 times (plural, with prepositions, related terms)
- **Placements:** Title, first 100 words, H2s (at least 3), meta description, conclusion

**LSI Keywords:** [Generate 5 related terms]
- Use each LSI keyword minimum 4 times
- Mix naturally throughout content
- Include in H2/H3 headings where appropriate

### Readability Standards:
- **Sentence length:** Average 15-18 words, maximum 20 words
- **Paragraph length:** 3-4 sentences, maximum 100 words
- **Active voice:** 80%+ of sentences
- **Transitions:** Every paragraph starts with transition word/phrase
- **Flesch Reading Ease:** Target 60-70 (high school level)
- **Grade Level:** Target 8th-10th grade
- **No jargon** without immediate explanation

### Structural Elements:
- **Bullet points:** Use for lists of 3+ items
- **Numbered lists:** Use for sequential steps
- **Bold text:** Key terms and important points (not excessive)
- **Quote blocks:** For all expert quotes
- **Tables:** For all comparisons (minimum 3 columns, 3 rows)

### Linking Strategy:
**Internal Links (8-12 required):**
- Natural anchor text (no "click here")
- Relevant context (explain what link contains)
- Spread throughout content
- Mix of navigational and topical

**External Links (5-8 required):**
- Authoritative sources only (.gov, .edu, major publications)
- Open in new tab
- Recent sources (2023-2025 preferred)
- No affiliate links in body content

### Visual Requirements:
- **Images:** Minimum 1 per H2 section (6-8 total)
- **Alt text:** "[Keyword] [specific aspect shown in image]"
- **File names:** keyword-specific-descriptor.jpg
- **Tables:** Minimum 1 comparison table
- **Infographic placeholder:** For complex processes

---

## AI OVERVIEW OPTIMIZATION

**Citation-Ready Format:**
Every key point should be quotable in under 15 words:

✅ **GOOD (AI can cite this):**
"${keyword} increases [metric] by X-Y% within Z months, according to [Source]."

❌ **BAD (too vague):**
"Many experts believe that implementing strategies over time can potentially lead to improvements..."

**Checklist:**
- [ ] Direct answer in first 50 words
- [ ] Key points under 15 words per sentence
- [ ] "According to [Name], [Title] at [Org]" format used 5+ times
- [ ] Specific numbers with sources ("X% according to Y")
- [ ] Numbered lists for processes
- [ ] Recent data (2023-2025)
- [ ] Authority links (.gov, .edu, tier-1 publications)

---

## QUALITY CHECKLIST (95-100/100 SCORE)

### GRAAF Framework (48-50 points):
- [ ] Target keyword in title, H1, intro, conclusion ✅
- [ ] Keyword density 0.8-1.2% (20-30 uses) ✅
- [ ] 5 LSI keywords used 4+ times each ✅
- [ ] Direct answer box 40-60 words ✅
- [ ] 8+ statistics with sources ✅
- [ ] All statistics from 2023-2025 ✅
- [ ] 4+ expert quotes with full attribution ✅
- [ ] 2+ case studies with numbers ✅
- [ ] Author bio 200+ words with credentials ✅
- [ ] Current publication date ✅
- [ ] Last updated date (same or recent) ✅

### CRAFT Framework (28-30 points):
- [ ] 2500+ words total ✅
- [ ] Short sentences (avg 15-18 words) ✅
- [ ] Short paragraphs (3-4 sentences) ✅
- [ ] No fluff or filler content ✅
- [ ] 10+ FAQ with 100+ word answers ✅
- [ ] Each FAQ has internal + external link ✅
- [ ] 6-8 images with keyword alt text ✅
- [ ] Minimum 1 comparison table ✅
- [ ] 4+ expert quotes integrated ✅
- [ ] 2+ case studies with results ✅
- [ ] TL;DR section with 5 takeaways ✅

### Technical SEO (19-20 points):
- [ ] Meta title 50-60 characters ✅
- [ ] Keyword in first 30 chars of title ✅
- [ ] Meta description 150-160 characters ✅
- [ ] Keyword in meta description ✅
- [ ] H1 tag with exact keyword ✅
- [ ] H2/H3 hierarchy with keyword variations ✅
- [ ] Table of contents with anchor links ✅
- [ ] 8-12 internal links with natural anchors ✅
- [ ] 5-8 external authority links ✅
- [ ] Article schema markup (JSON-LD) ✅
- [ ] FAQPage schema markup (JSON-LD) ✅
- [ ] All images have keyword alt text ✅

---

## FINAL OUTPUT REQUIREMENTS

Deliver a complete, publication-ready article that includes:

1. ✅ Direct answer box (AI Overview ready)
2. ✅ TL;DR with 5 takeaways
3. ✅ Table of contents
4. ✅ 2500+ words main content
5. ✅ 6-8 H2 sections with full structure
6. ✅ 8+ statistics with sources
7. ✅ 4+ expert quotes with attribution
8. ✅ 2+ case studies with results
9. ✅ 10+ comprehensive FAQs
10. ✅ Author bio with credentials
11. ✅ Article + FAQPage schema markup
12. ✅ Optimized meta title + description
13. ✅ Image placeholders with alt text
14. ✅ Internal + external link suggestions
15. ✅ Comparison table(s)

**Target Score: 95-100/100**
- GRAAF: 48-50/50
- CRAFT: 28-30/30
- Technical: 19-20/20

Now rewrite ${url} to achieve this score. GO! 🚀`;

    // Also generate simplified version for users who want less
    const simplifiedPrompt = `# QUICK CONTENT BOOST - ${topic}

Rewrite content for ${url} to score 80+ using this framework:

**Add these elements:**
1. Direct answer (50 words) at top with source citation
2. Expand to 2000+ words
3. Add 8 FAQ questions with 100-word answers + links
4. Add 3 expert quotes: "Quote" — Name, Title, Company
5. Add 5 statistics with sources (2023-2025 data)
6. Add 1 case study with concrete numbers
7. Add author bio (150 words) with credentials
8. Include Article + FAQPage schema markup

**Optimize for:**
- Keyword "${keyword}" used 15-20 times
- Short sentences (under 20 words)
- Short paragraphs (3-4 sentences)
- 1 image per section
- 5 internal + 3 external links

Score target: 80-90/100`;

    console.log(`✅ Generated ELITE prompt (${elitePrompt.length} chars)`);
    
    res.json({
      success: true,
      url: url,
      topic: topic,
      keyword: keyword,
      score: score,
      prompts: [
        {
          title: "🏆 ELITE 95-100/100 Prompt (RECOMMENDED)",
          type: "elite",
          prompt: elitePrompt,
          description: "Complete framework for 95-100/100 score. Copy-paste into Claude AI for best results.",
          estimated_score: "95-100/100"
        },
        {
          title: "⚡ Quick Boost 80-90/100 Prompt",
          type: "simplified",
          prompt: simplifiedPrompt,
          description: "Shorter version for quick improvements. Good for tight deadlines.",
          estimated_score: "80-90/100"
        }
      ],
      usage_instructions: [
        "1. Click 'Copy ELITE Prompt' below",
        "2. Open Claude.ai, ChatGPT, or Perplexity",
        "3. Paste the entire prompt",
        "4. AI generates complete 2500+ word article",
        "5. Copy result and replace your current content",
        "6. Add the schema markup to your page <head>",
        "7. Rescan to see 95-100/100 score!"
      ]
    });
    
  } catch (error) {
    console.error('[ELITE PROMPT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate elite prompt'
    });
  }
});
    }
    
    console.log(`[FREE PROMPT] Generating for ${url} (Score: ${score})`);
    
    // Identify main issues
    const issues = [];
    
    if (breakdown?.graaf?.total < 40) {
      issues.push('Low GRAAF score - lacks credibility');
    }
    if (breakdown?.craft?.total < 24) {
      issues.push('Low CRAFT score - poor UX');
    }
    if (breakdown?.technical?.total < 16) {
      issues.push('Low Technical SEO');
    }
    if (wordCount < 1500) {
      issues.push(`Too short (${wordCount} words)`);
    }
    
    // Generate AI prompt
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Generate 3 specific, actionable content improvement prompts for this webpage:

URL: ${url}
Current Score: ${score}/100
Issues: ${issues.join(', ')}

For each prompt, provide:
1. A specific section to improve
2. What's wrong
3. A concrete rewrite instruction

Format as JSON:
[
  {
    "section": "...",
    "issue": "...",
    "prompt": "Rewrite to..."
  }
]

Keep prompts under 50 words each.`
      }]
    });
    
    const content = message.content[0].text;
    let prompts;
    
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      prompts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      prompts = [
        {
          section: "Main content",
          issue: "Lacks AI optimization",
          prompt: "Rewrite with clear steps and credible sources"
        },
        {
          section: "Introduction",
          issue: "Not engaging",
          prompt: "Start with compelling hook addressing user pain"
        },
        {
          section: "Structure",
          issue: "Poor readability",
          prompt: "Break into short paragraphs with H2/H3 subheadings"
        }
      ];
    }
    
    console.log(`✅ Generated ${prompts.length} prompts`);
    
    res.json({
      success: true,
      url: url,
      score: score,
      prompts: prompts,
      cta: "Apply these prompts, update content, and rescan!"
    });
    
  } catch (error) {
    console.error('[PROMPT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate prompts'
    });
  }
});

// ==========================================
// SERVE HTML FILES
// ==========================================

app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/leaderboard-scanner-page.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/agency', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agency-admin.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unified-scan-page.html'));
});

app.get('/scan-result/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/scan-result.html'));
});

app.get('/scan-with-link/:code', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/scan-with-link.html'));
});

app.get('/contact-form', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/contact-form.html'));
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║ 🎯 CONTENTSCALE COMPLETE PLATFORM                        ║
╠═══════════════════════════════════════════════════════════╣
║ Port: ${PORT.toString().padEnd(50)}║
║ Environment: ${(process.env.NODE_ENV || 'development').padEnd(39)}║
║                                                            ║
║ 🔥 FULL FEATURE SET:                                      ║
║ ✅ Hybrid Scoring (Parser + AI + Math)                   ║
║ ✅ Super Admin Dashboard                                  ║
║ ✅ Agency Management                                      ║
║ ✅ Client Scanning                                        ║
║ ✅ Whitelabel Support                                     ║
║ ✅ Multi-Country Leaderboard                              ║
║ ✅ Scan Caching & Consistency                             ║
║ ✅ Share Links for Scans                                  ║
║ ✅ Lead Generation System                                 ║
║ ✅ Word Count Tracking                                    ║
║ ✅ ADMIN PASSWORD_HASH FIX APPLIED                        ║
║                                                            ║
║ 📊 ALL ENDPOINTS OPERATIONAL!                             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

module.exports = { performHybridScan, pool };
