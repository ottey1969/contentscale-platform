// ==========================================
// CONTENTSCALE SERVER.JS - DEEL 1 van 3
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { parseContent } = require('./content-parser-HYBRID');
const { validateContent } = require('./claude-validator-HYBRID');
const { calculateScore } = require('./deterministic-scoring-HYBRID');
const { fetchWithPuppeteer } = require('./puppeteer-fetcher');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
    console.log('📥 STEP 1: Fetching HTML with Puppeteer...');
    
    const fetchResult = await fetchWithPuppeteer(url, {
      timeout: 30000,
      waitUntil: 'networkidle2',
      waitDelay: 2000
    });
    
    if (!fetchResult.success) {
      throw new Error(fetchResult.error || 'Fetch failed');
    }
    
    console.log(`✅ Fetched ${fetchResult.wordCount} words`);
    
    console.log('🔍 STEP 2: Parser analysis...');
    const parserOutput = parseContent(fetchResult.html, url);
    
    parserOutput.counts.wordCount = fetchResult.wordCount;
    parserOutput.metadata = {
      ...parserOutput.metadata,
      ...fetchResult.metadata
    };
    
    console.log('🤖 STEP 3: Claude validation...');
    const validatedCounts = await validateContent(parserOutput);
    
    console.log('🎯 STEP 4: Deterministic scoring...');
    const score = calculateScore(validatedCounts, parserOutput.counts);
    
    let quality = 'poor';
    if (score.total >= 90) quality = 'excellent';
    else if (score.total >= 80) quality = 'good';
    else if (score.total >= 70) quality = 'average';
    else if (score.total >= 60) quality = 'below-average';
    
    console.log(`✅ FINAL SCORE: ${score.total}/100 (${quality.toUpperCase()})`);
    
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

function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  
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
      return next();
    }
    
    return pool.query(
      'SELECT id, username, role FROM admins WHERE id = $1 AND role = $2',
      [adminKey, 'super_admin']
    );
  })
  .then(adminResult => {
    if (!adminResult) return;
    
    if (adminResult.rows.length > 0) {
      req.admin = adminResult.rows[0];
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
      result = await performHybridScan(url);
      result.share_id = shareId;
      result.cached = false;
      
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
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
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
    
    if (category && category !== 'all') {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    if (country && country !== 'all') {
      query += ` AND country = $${paramCount}`;
      params.push(country);
      paramCount++;
    }
    
    if (language && language !== 'all') {
      query += ` AND language = $${paramCount}`;
      params.push(language);
      paramCount++;
    }
    
    query += ` ORDER BY score DESC, scanned_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    const entries = result.rows.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
    
    console.log(`[LEADERBOARD] Fetched ${entries.length} entries`);
    
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
    
    const url_hash = crypto.createHash('md5').update(url).digest('hex');
    
    const existing = await pool.query(
      'SELECT id, score FROM public_leaderboard WHERE url = $1',
      [url]
    );
    
    if (existing.rows.length > 0) {
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
              url_hash = $11,
              updated_at = NOW()
          WHERE url = $12
        `, [
          score, quality, graaf_score, craft_score, technical_score,
          word_count, company_name, category, country, language, url_hash, url
        ]);
        
        const rankResult = await pool.query(
          'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
          [score]
        );
        
        const rank = parseInt(rankResult.rows[0].rank) || 1;
        
        console.log(`✅ Leaderboard updated: ${url} - Rank #${rank}`);
        
        return res.json({
          success: true,
          message: 'Leaderboard entry updated!',
          action: 'updated',
          rank: rank
        });
      } else {
        return res.json({
          success: true,
          message: 'Existing entry has higher score',
          action: 'skipped'
        });
      }
    } else {
      await pool.query(`
        INSERT INTO public_leaderboard (
          url,
          url_hash,
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        url,
        url_hash,
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
      ]);
      
      const rankResult = await pool.query(
        'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
        [score]
      );
      
      const rank = parseInt(rankResult.rows[0].rank) || 1;
      
      console.log(`✅ Leaderboard entry added: ${url} - Rank #${rank}`);
      
      return res.json({
        success: true,
        message: 'Added to leaderboard!',
        action: 'added',
        rank: rank
      });
    }
    
  } catch (error) {
    console.error('[LEADERBOARD SUBMIT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit to leaderboard',
      details: error.message
    });
  }
});

app.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        ROUND(AVG(score), 1) as average_score,
        MAX(score) as highest_score
      FROM public_leaderboard
      WHERE is_public = true
    `);
    
    res.json({
      success: true,
      stats: stats.rows[0]
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
// ADMIN: SCAN ALL AGENCIES
// ==========================================

app.post('/api/admin/scan-all-agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    console.log('[ADMIN SCAN ALL] Starting scan of all agencies...');
    
    // Get all active agencies
    const agenciesResult = await pool.query(`
      SELECT id, name, domain, country
      FROM agencies
      WHERE is_active = true
      ORDER BY created_at DESC
    `);
    
    const agencies = agenciesResult.rows;
    
    if (agencies.length === 0) {
      return res.json({
        success: true,
        message: 'No active agencies to scan',
        scanned: 0,
        results: []
      });
    }
    
    console.log(`[ADMIN SCAN ALL] Found ${agencies.length} active agencies`);
    
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    // Scan each agency
    for (const agency of agencies) {
      try {
        console.log(`[ADMIN SCAN] Scanning ${agency.name} (${agency.domain})...`);
        
        // Build full URL
        const url = agency.domain.startsWith('http') 
          ? agency.domain 
          : `https://${agency.domain}`;
        
        // Perform hybrid scan
        const scanResult = await performHybridScan(url);
        
        if (!scanResult.success) {
          throw new Error(scanResult.error || 'Scan failed');
        }
        
        // Generate URL hash
        const urlHash = crypto.createHash('md5').update(url).digest('hex');
        
        // Check if entry exists
        const existing = await pool.query(
          'SELECT id, score FROM public_leaderboard WHERE url_hash = $1',
          [urlHash]
        );
        
        // Update or insert
        if (existing.rows.length > 0) {
          // Update if new score is higher
          if (scanResult.score > existing.rows[0].score) {
            await pool.query(`
              UPDATE public_leaderboard
              SET score = $1,
                  quality = $2,
                  graaf_score = $3,
                  craft_score = $4,
                  technical_score = $5,
                  word_count = $6,
                  updated_at = NOW()
              WHERE url_hash = $7
            `, [
              scanResult.score,
              scanResult.quality,
              scanResult.breakdown.graaf.total,
              scanResult.breakdown.craft.total,
              scanResult.breakdown.technical.total,
              scanResult.wordCount || 0,
              urlHash
            ]);
            
            console.log(`✅ Updated ${agency.name}: ${scanResult.score}/100`);
          } else {
            console.log(`⏭️ Skipped ${agency.name}: Existing score higher`);
          }
        } else {
          // Insert new entry
          await pool.query(`
            INSERT INTO public_leaderboard (
              url,
              url_hash,
              score,
              quality,
              graaf_score,
              craft_score,
              technical_score,
              word_count,
              company_name,
              category,
              country,
              language,
              is_public
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
          `, [
            url,
            urlHash,
            scanResult.score,
            scanResult.quality,
            scanResult.breakdown.graaf.total,
            scanResult.breakdown.craft.total,
            scanResult.breakdown.technical.total,
            scanResult.wordCount || 0,
            agency.name,
            'agency',
            agency.country || 'other',
            'en'
          ]);
          
          console.log(`✅ Added ${agency.name}: ${scanResult.score}/100`);
        }
        
        results.push({
          agency: agency.name,
          url: url,
          score: scanResult.score,
          status: 'success'
        });
        
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to scan ${agency.name}:`, error.message);
        
        results.push({
          agency: agency.name,
          url: agency.domain,
          error: error.message,
          status: 'failed'
        });
        
        failCount++;
      }
    }
    
    console.log(`[ADMIN SCAN ALL] Complete: ${successCount} success, ${failCount} failed`);
    
    res.json({
      success: true,
      message: `Scanned ${agencies.length} agencies: ${successCount} success, ${failCount} failed`,
      total: agencies.length,
      successCount,
      failCount,
      results
    });
    
  } catch (error) {
    console.error('[ADMIN SCAN ALL ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan agencies',
      details: error.message
    });
  }
});

// Get scan progress (for future real-time updates)
app.get('/api/admin/scan-progress', authenticateSuperAdmin, async (req, res) => {
  // For now, return mock data
  // In future: track actual progress in Redis or database
  res.json({
    success: true,
    scanning: false,
    progress: {
      total: 0,
      completed: 0,
      current: null
    }
  });
});


// ==========================================
// SUPER ADMIN: LEADERBOARD MANAGEMENT
// ==========================================

// ==========================================
// SUPER ADMIN: AGENCY MANAGEMENT
// ==========================================

// Get all agencies (Super Admin)
app.get('/api/super-admin/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.name,
        a.domain,
        a.country,
        a.plan,
        a.admin_key,
        a.is_active,
        a.whitelabel_enabled,
        a.v52_score,
        a.last_scan_date,
        a.created_at,
        COUNT(DISTINCT c.id) as client_count,
        COUNT(DISTINCT s.id) as total_scans
      FROM agencies a
      LEFT JOIN clients c ON c.agency_id = a.id
      LEFT JOIN scans s ON s.agency_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    
    console.log(`[SUPER ADMIN] Fetched ${result.rows.length} agencies`);
    
    res.json({
      success: true,
      agencies: result.rows
    });
    
  } catch (error) {
    console.error('[GET AGENCIES ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agencies'
    });
  }
});

// Create new agency (Super Admin)
app.post('/api/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const {
      name,
      domain,
      country,
      plan,
      contact_person,
      contact_email,
      phone,
      whitelabel,
      is_active
    } = req.body;
    
    // Validation
    if (!name || !domain || !country || !plan) {
      return res.status(400).json({
        success: false,
        error: 'Name, domain, country, and plan are required'
      });
    }
    
    // Check if domain already exists
    const existing = await pool.query(
      'SELECT id FROM agencies WHERE domain = $1',
      [domain]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Agency with this domain already exists'
      });
    }
    
    // Generate admin key
    const adminKey = generateAdminKey();
    
    // Insert agency
    const result = await pool.query(`
      INSERT INTO agencies (
        name,
        domain,
        country,
        plan,
        contact_person,
        contact_email,
        phone,
        admin_key,
        whitelabel_enabled,
        is_active,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, name, domain, admin_key, created_at
    `, [
      name,
      domain,
      country,
      plan,
      contact_person || null,
      contact_email || null,
      phone || null,
      adminKey,
      whitelabel || false,
      is_active !== false // Default true
    ]);
    
    console.log(`✅ Agency created: ${name} (${domain})`);
    
    res.json({
      success: true,
      message: 'Agency created successfully',
      agency: result.rows[0]
    });
    
  } catch (error) {
    console.error('[CREATE AGENCY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create agency',
      details: error.message
    });
  }
});

// Update agency (Super Admin)
app.put('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      domain,
      country,
      plan,
      contact_person,
      contact_email,
      phone,
      whitelabel_enabled,
      is_active
    } = req.body;
    
    const result = await pool.query(`
      UPDATE agencies
      SET
        name = COALESCE($1, name),
        domain = COALESCE($2, domain),
        country = COALESCE($3, country),
        plan = COALESCE($4, plan),
        contact_person = COALESCE($5, contact_person),
        contact_email = COALESCE($6, contact_email),
        phone = COALESCE($7, phone),
        whitelabel_enabled = COALESCE($8, whitelabel_enabled),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      name, domain, country, plan,
      contact_person, contact_email, phone,
      whitelabel_enabled, is_active, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agency not found'
      });
    }
    
    console.log(`✅ Agency updated: ${result.rows[0].name}`);
    
    res.json({
      success: true,
      message: 'Agency updated successfully',
      agency: result.rows[0]
    });
    
  } catch (error) {
    console.error('[UPDATE AGENCY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agency'
    });
  }
});

// Delete agency (Super Admin)
app.delete('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if agency has clients
    const clientCheck = await pool.query(
      'SELECT COUNT(*) as count FROM clients WHERE agency_id = $1',
      [id]
    );
    
    if (parseInt(clientCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete agency with active clients'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM agencies WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agency not found'
      });
    }
    
    console.log(`✅ Agency deleted: ${result.rows[0].name}`);
    
    res.json({
      success: true,
      message: 'Agency deleted successfully'
    });
    
  } catch (error) {
    console.error('[DELETE AGENCY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete agency'
    });
  }
});

app.get('/api/admin/leaderboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        url,
        url_hash,
        score,
        quality,
        graaf_score,
        craft_score,
        technical_score,
        word_count,
        company_name,
        category,
        country,
        language,
        is_public,
        created_at,
        updated_at
      FROM public_leaderboard
      ORDER BY score DESC, created_at DESC
    `);
    
    const entries = result.rows.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
    
    console.log(`[ADMIN LEADERBOARD] Fetched ${entries.length} entries`);
    
    res.json({
      success: true,
      total: entries.length,
      entries: entries
    });
    
  } catch (error) {
    console.error('[ADMIN LEADERBOARD ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load admin leaderboard'
    });
  }
});

app.delete('/api/admin/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM public_leaderboard WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    console.log(`✅ Admin deleted leaderboard entry #${id}: ${result.rows[0].url}`);
    
    res.json({
      success: true,
      message: 'Entry deleted successfully',
      deleted: result.rows[0]
    });
    
  } catch (error) {
    console.error('[ADMIN DELETE ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete entry',
      details: error.message
    });
  }
});

app.get('/api/admin/leaderboard/search', authenticateSuperAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query required'
      });
    }
    
    const result = await pool.query(`
      SELECT 
        id, url, score, quality, graaf_score, craft_score, technical_score,
        word_count, company_name, category, country, language,
        created_at, updated_at
      FROM public_leaderboard
      WHERE 
        LOWER(url) LIKE LOWER($1) OR
        LOWER(company_name) LIKE LOWER($1) OR
        CAST(score AS TEXT) LIKE $1
      ORDER BY score DESC
      LIMIT 50
    `, [`%${q}%`]);
    
    const entries = result.rows.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
    
    res.json({
      success: true,
      total: entries.length,
      entries: entries
    });
    
  } catch (error) {
    console.error('[ADMIN SEARCH ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});
app.post('/api/generate-content-prompt', async (req, res) => {
  try {
    const { url, score, breakdown, wordCount } = req.body;
    
    if (!url || !score) {
      return res.status(400).json({
        success: false,
        error: 'URL and score required'
      });
    }
    
    console.log('[ELITE PROMPT] Generating for:', url, 'Score:', score);
    
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
    } catch (e) {
      console.log('URL parse error:', e.message);
    }
    
    const missing = [];
    
    if (breakdown?.graaf?.total < 40) {
      missing.push('lacks credible sources and expert quotes');
      missing.push('needs authoritative statistics');
      missing.push('missing case studies');
    }
    
    if (breakdown?.craft?.total < 24) {
      missing.push('poor structure');
      missing.push('needs FAQ section');
      missing.push('missing visual elements');
    }
    
    if (breakdown?.technical?.total < 16) {
      missing.push('missing schema markup');
      missing.push('needs meta optimization');
    }
    
    if (wordCount < 2500) {
      missing.push('too short at ' + wordCount + ' words (needs 2500+)');
    }
    
    const elitePrompt = `ELITE SEO CONTENT REWRITE - 95-100/100 SCORE

Target URL: ${url}
Topic: ${topic}
Target Keyword: "${keyword}"
Current Score: ${score}/100
Target Score: 95-100/100

YOUR MISSION:
Completely rewrite this content to score 95-100/100 using the GRAAF + CRAFT + Technical SEO framework.

Current Issues:
${missing.map((issue, i) => (i + 1) + '. ' + issue).join('\n')}

MANDATORY OUTPUT STRUCTURE:

1. DIRECT ANSWER BOX (40-60 words)
Start with a quotable, citation-ready answer.

Requirements:
- Include target keyword in first sentence
- Cite authoritative source (name, title, organization)
- Include specific number or statistic
- Max 60 words total
- Quotable format (under 15 words per sentence)

2. TL;DR SECTION (Exactly 5 Key Takeaways)
Bullet list of exactly 5 quotable insights with sources.

3. TABLE OF CONTENTS
Auto-generated from all H2 and H3 headings with anchor links.

4. MAIN CONTENT (2500+ words minimum)

Structure for EACH H2 section:
- Opening paragraph (100-150 words)
- Detail paragraph (100-150 words)
- Application paragraph (100-150 words)
- Expert Quote with full attribution
- Key Statistic with source
- Pro Tip
- Comparison table if relevant

Repeat for 5-7 H2 sections minimum.

5. CASE STUDIES (Minimum 2)
Include:
- Industry context
- Challenge with numbers
- Solution (3-5 specific actions)
- Results (concrete metrics)
- Timeline
- Key lesson

6. FAQ SECTION (Minimum 10 Questions)
Each FAQ must have:
- 100-150 word answer
- Direct answer in first sentence
- Source citation
- 1 internal link
- 1 external link

Cover these question types:
- What is [keyword]
- How to [keyword]
- Why is [keyword] important
- When to [keyword]
- Where to find [keyword]
- Who needs [keyword]
- [Keyword] vs [alternative]
- Best [keyword] for [use case]
- Common [keyword] mistakes
- [keyword] cost or pricing

7. STATISTICS OVERVIEW (Minimum 8)
All from 2023-2025 with full source attribution.

8. EXPERT QUOTES (Minimum 4)
With full name, exact title, and organization.

9. AUTHOR BIO (200-250 words)
Include:
- Current role and experience
- Expertise areas (3+)
- Certifications
- Notable achievements
- Published work
- Contact info

10. SCHEMA MARKUP (CRITICAL)

Article Schema (JSON-LD):
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Title here",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "2025-01-15",
  "dateModified": "2025-01-15"
}

FAQPage Schema (JSON-LD):
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Complete answer"
      }
    }
  ]
}

11. META INFORMATION

Meta Title (50-60 characters):
${keyword}: [Benefit] - [Authority/Year]

Meta Description (150-160 characters):
[Keyword] explained. [Key benefit with number]. [CTA].

WRITING RULES:

Keyword Optimization:
- Target keyword density: 0.8-1.2%
- At 2500 words: Use keyword 20-30 times
- Exact phrase: Minimum 12 times
- Variations: 10-15 times

Readability:
- Sentence length: Average 15-18 words, max 20
- Paragraph length: 3-4 sentences, max 100 words
- Active voice: 80%+
- Flesch Reading Ease: 60-70

Linking:
- Internal links: 8-12
- External links: 5-8 (authoritative sources only)

Visual Elements:
- Images: Minimum 1 per H2 section
- Alt text with keywords
- Minimum 1 comparison table

QUALITY CHECKLIST (95-100/100):

GRAAF Framework (48-50 points):
- Target keyword in title, H1, intro, conclusion
- Keyword density 0.8-1.2%
- 8+ statistics from 2023-2025
- 4+ expert quotes with attribution
- 2+ case studies with numbers
- Author bio 200+ words with credentials

CRAFT Framework (28-30 points):
- 2500+ words total
- Short sentences and paragraphs
- 10+ FAQ with 100+ word answers
- Each FAQ has internal + external link
- 6-8 images with keyword alt text
- Comparison tables

TECHNICAL SEO (19-20 points):
- Meta title 50-60 characters
- Meta description 150-160 characters
- H1/H2/H3 hierarchy
- Article + FAQPage schema markup
- 8-12 internal links
- 5-8 external authority links

Now rewrite ${url} to achieve 95-100/100 score. GO!`;

    const quickPrompt = `QUICK CONTENT BOOST - ${topic}

Rewrite ${url} to score 80+ using this framework:

Add these elements:
1. Direct answer (50 words) at top with source
2. Expand to 2000+ words
3. Add 8 FAQ questions with 100-word answers
4. Add 3 expert quotes: "Quote" - Name, Title, Company
5. Add 5 statistics with sources (2023-2025)
6. Add 1 case study with numbers
7. Add author bio (150 words) with credentials
8. Include Article + FAQPage schema markup

Optimize for:
- Keyword "${keyword}" used 15-20 times
- Short sentences (under 20 words)
- Short paragraphs (3-4 sentences)
- 1 image per section
- 5 internal + 3 external links

Score target: 80-90/100`;

    console.log('[ELITE PROMPT] Generated successfully');
    
    res.json({
      success: true,
      url: url,
      topic: topic,
      keyword: keyword,
      score: score,
      prompts: [
        {
          title: "ELITE 95-100/100 Prompt (RECOMMENDED)",
          type: "elite",
          prompt: elitePrompt,
          description: "Complete framework for 95-100/100 score. Copy-paste into Claude AI.",
          estimated_score: "95-100/100"
        },
        {
          title: "Quick Boost 80-90/100 Prompt",
          type: "simplified",
          prompt: quickPrompt,
          description: "Shorter version for quick improvements.",
          estimated_score: "80-90/100"
        }
      ],
      usage_instructions: [
        "1. Click 'Copy ELITE Prompt' below",
        "2. Open Claude.ai, ChatGPT, or Perplexity",
        "3. Paste the entire prompt",
        "4. AI generates complete article",
        "5. Copy result and update your page",
        "6. Rescan to see 95-100/100 score!"
      ]
    });
    
  } catch (error) {
    console.error('[ELITE PROMPT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate prompts'
    });
  }
});

function detectCategory(url, scanResult) {
  const urlLower = url.toLowerCase();
  const content = scanResult?.metadata?.title || '';
  const contentLower = content.toLowerCase();
  
  if (urlLower.includes('seo') || contentLower.includes('seo agency')) {
    return 'agency';
  }
  
  if (urlLower.includes('app') || contentLower.includes('saas')) {
    return 'saas';
  }
  
  if (urlLower.includes('shop') || urlLower.includes('store')) {
    return 'ecommerce';
  }
  
  if (urlLower.includes('/blog/') || urlLower.includes('/article/')) {
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
    'com': 'GLOBAL',
    'org': 'GLOBAL'
  };
  
  return tldMap[tld] || 'OTHER';
}

function detectLanguage(url) {
  const country = detectCountry(url);
  
  const countryLanguageMap = {
    'NL': 'nl',
    'BE': 'nl',
    'UK': 'en',
    'ES': 'es',
    'GLOBAL': 'en'
  };
  
  return countryLanguageMap[country] || 'en';
}

function extractCompanyName(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const parts = domain.split('.');
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown';
  }
}

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
║ ✅ Global Leaderboard                                     ║
║ ✅ Admin Leaderboard Management (NEW!)                    ║
║ ✅ FREE AI ELITE Prompt Generator                         ║
║ ✅ Share Links for Scans                                  ║
║ ✅ Word Count Tracking                                    ║
║ ✅ All Endpoints Operational                              ║
║                                                            ║
║ 📊 READY TO SCAN!                                         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

module.exports = { performHybridScan, pool };
