require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ DB failed:', err.message);
  else console.log('✅ DB connected:', res.rows[0].now);
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AUTH MIDDLEWARE
async function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) return res.status(401).json({ success: false, error: 'Auth required' });
  
  try {
    const result = await pool.query('SELECT id, username FROM super_admins WHERE id = $1', [adminKey]);
    if (result.rows.length > 0) {
      req.admin = { ...result.rows[0], role: 'super_admin' };
      return next();
    }
    return res.status(403).json({ success: false, error: 'Access denied' });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

// AUTH ROUTES
app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const result = await pool.query('SELECT id, username, password_hash FROM super_admins WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    
    res.json({ success: true, admin_id: admin.id, admin: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/stats', authenticateSuperAdmin, async (req, res) => {
  try {
    const [agencies, clients, scans, helpers] = await Promise.all([
      pool.query('SELECT COUNT(*)::integer as count FROM agencies WHERE is_active = true'),
      pool.query('SELECT COUNT(*)::integer as count FROM clients'),
      pool.query('SELECT COUNT(*)::integer as count FROM scans'),
      pool.query('SELECT COUNT(*)::integer as count FROM admins WHERE is_active = true')
    ]);
    res.json({
      success: true,
      stats: {
        total_agencies: agencies.rows[0].count,
        total_clients: clients.rows[0].count,
        total_scans: scans.rows[0].count,
        active_helpers: helpers.rows[0].count
      }
    });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

app.get('/api/admins', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, full_name, email, is_active, created_at, last_login FROM admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch admins' });
  }
});

app.post('/api/admins', authenticateSuperAdmin, async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  try {
    if (!username || !password || !role) return res.status(400).json({ success: false, error: 'Username, password, role required' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admins (username, password_hash, role, full_name, email, is_active, created_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, username, role',
      [username, hash, role, full_name || null, email || null]
    );
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create admin' });
  }
});

app.delete('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/super-admin/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.domain, a.country, a.plan, a.is_active,
             COUNT(DISTINCT c.id)::integer as client_count,
             COUNT(DISTINCT s.id)::integer as total_scans
      FROM agencies a
      LEFT JOIN clients c ON c.agency_id = a.id
      LEFT JOIN scans s ON s.agency_id = a.id
      GROUP BY a.id ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch agencies' });
  }
});

app.post('/api/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, domain, country, plan } = req.body;
    if (!name || !domain) return res.status(400).json({ success: false, error: 'Name and domain required' });
    const adminKey = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const result = await pool.query(
      'INSERT INTO agencies (name, domain, country, plan, admin_key, is_active, created_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, name, domain',
      [name, domain, country || 'NL', plan || 'free', adminKey]
    );
    res.json({ success: true, agency: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create agency' });
  }
});

app.delete('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});
app.get('/api/admin/clients', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.url, c.agency_id, a.name as agency_name, COUNT(s.id)::integer as scan_count
      FROM clients c
      LEFT JOIN agencies a ON a.id = c.agency_id
      LEFT JOIN scans s ON s.client_id = c.id
      GROUP BY c.id, a.name ORDER BY c.created_at DESC LIMIT 500
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load clients' });
  }
});

app.delete('/api/admin/clients/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE client_id = $1', [req.params.id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/scans', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.url, s.score, s.quality, s.scan_type, s.created_at,
             a.name as agency_name, c.url as client_url
      FROM scans s
      LEFT JOIN agencies a ON a.id = s.agency_id
      LEFT JOIN clients c ON c.id = s.client_id
      ORDER BY s.created_at DESC LIMIT 500
    `);
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load scans' });
  }
});

app.delete('/api/admin/scans/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

// ========================================
// ✅ SHARE LINKS ROUTES - FIXED! 
// ========================================
app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT token as share_code, name as client_email, client_name, company, 
             max_uses as scans_limit, current_uses as scans_used, 
             expires_at, is_active,
             CASE
               WHEN NOT is_active THEN 'inactive'
               WHEN current_uses >= max_uses THEN 'limit_reached'
               WHEN expires_at < NOW() THEN 'expired'
               ELSE 'active'
             END as status
      FROM share_links ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    console.error('[SHARE LINKS FETCH ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load share links' });
  }
});

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { client_email, client_name, company, scans_limit, valid_days } = req.body;
    
    console.log('[SHARE LINK CREATE] Received:', { client_email, client_name, company, scans_limit, valid_days });
    
    if (!client_email || !scans_limit) {
      return res.status(400).json({ success: false, error: 'Email and limit required' });
    }
    
    const code = 'SCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expires = new Date();
    expires.setDate(expires.getDate() + parseInt(valid_days || 30));
    
    console.log('[SHARE LINK CREATE] Code:', code, 'Expires:', expires);
    
    // FIXED: Using actual database column names (token, name, max_uses, current_uses)
    await pool.query(
      `INSERT INTO share_links 
       (token, name, client_name, company, max_uses, current_uses, expires_at, is_active, created_at) 
       VALUES ($1, $2, $3, $4, $5, 0, $6, true, NOW())`,
      [code, client_email, client_name || null, company || null, scans_limit, expires]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${code}`;
    console.log('[SHARE LINK CREATE] ✅ Success! URL:', shareUrl);
    
    res.json({ success: true, share_url: shareUrl });
    
  } catch (error) {
    console.error('[SHARE LINK CREATE ERROR]', error.message);
    console.error('[SHARE LINK STACK]', error.stack);
    res.status(500).json({ success: false, error: 'Failed to create link' });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE token = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    console.error('[SHARE LINK DELETE ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});
// ========================================
// END SHARE LINKS FIX
// ========================================

app.get('/api/admin/leaderboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, url, score, company_name, country FROM public_leaderboard ORDER BY score DESC');
    const entries = result.rows.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

app.delete('/api/admin/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM public_leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});
// FRONTEND ROUTES (CRITICAL!)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/health', async (req, res) => {
  try {
    const db = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db: true, time: db.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==========================================
// MISSING PUBLIC API ENDPOINTS
// ==========================================

// Public leaderboard (NO AUTH!)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { limit = 100, category = 'all', country = 'all', language = 'all' } = req.query;
    
    let query = 'SELECT * FROM public_leaderboard WHERE is_public = true';
    const params = [];
    let paramIndex = 1;
    
    if (category !== 'all') {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (country !== 'all') {
      query += ` AND country = $${paramIndex}`;
      params.push(country);
      paramIndex++;
    }
    
    if (language !== 'all') {
      query += ` AND language = $${paramIndex}`;
      params.push(language);
      paramIndex++;
    }
    
    query += ` ORDER BY score DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    const entries = result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
    
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

// Leaderboard stats (NO AUTH!)
app.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::integer as total_entries,
        ROUND(AVG(score))::integer as average_score,
        MAX(score) as highest_score
      FROM public_leaderboard 
      WHERE is_public = true
    `);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// Free scan endpoint (NO AUTH!)
app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    // Mock scan result for now
    const mockScore = Math.floor(Math.random() * 30) + 60; // 60-90
    const mockResult = {
      success: true,
      score: mockScore,
      quality: mockScore >= 80 ? 'good' : mockScore >= 70 ? 'fair' : 'needs-improvement',
      breakdown: {
        graaf: { total: Math.floor(mockScore * 0.5) },
        craft: { total: Math.floor(mockScore * 0.3) },
        technical: { total: Math.floor(mockScore * 0.2) }
      },
      wordCount: Math.floor(Math.random() * 1000) + 1000
    };
    
    res.json(mockResult);
  } catch (error) {
    console.error('[SCAN ERROR]', error);
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});

// Submit to leaderboard (NO AUTH!)
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category } = req.body;
    
    if (!url || !score) return res.status(400).json({ success: false, error: 'URL and score required' });
    
    const urlHash = require('crypto').createHash('md5').update(url).digest('hex');
    
    // Check if exists
    const existing = await pool.query('SELECT id FROM public_leaderboard WHERE url_hash = $1', [urlHash]);
    
    if (existing.rows.length > 0) {
      // Update existing
      await pool.query(`
        UPDATE public_leaderboard 
        SET score = $1, quality = $2, graaf_score = $3, craft_score = $4, 
            technical_score = $5, word_count = $6, company_name = $7, 
            category = $8, updated_at = NOW()
        WHERE url_hash = $9
      `, [score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category, urlHash]);
    } else {
      // Insert new
      await pool.query(`
        INSERT INTO public_leaderboard 
        (url, url_hash, score, quality, graaf_score, craft_score, technical_score, 
         word_count, company_name, category, is_public, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      `, [url, urlHash, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category]);
    }
    
    res.json({ success: true, message: 'Added to leaderboard' });
  } catch (error) {
    console.error('[SUBMIT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to submit' });
  }
});

// Generate prompts (NO AUTH!)
app.post('/api/generate-content-prompt', async (req, res) => {
  try {
    const { url, score } = req.body;
    
    const prompts = [{
      type: 'elite',
      title: '🏆 ELITE Content Rewrite Prompt',
      description: 'Complete rewrite for 95+ score',
      prompt: `Rewrite this URL: ${url}\n\nCurrent score: ${score}/100\n\nCreate comprehensive 2500+ word article following GRAAF + CRAFT frameworks...`,
      estimated_score: '95-100/100'
    }];
    
    res.json({ success: true, prompts, usage_instructions: ['Copy prompt', 'Paste in Claude AI', 'Get article', 'Update page', 'Rescan'] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate prompts' });
  }
});

// ==========================================
// EMERGENCY ADMIN SETUP - REMOVE AFTER USE!
// ==========================================
app.post('/api/emergency-setup', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be 8+ characters' });
    }
    
    // Delete old admin
    await pool.query('DELETE FROM super_admins WHERE username = $1', ['superadmin']);
    
    // Create new admin with WORKING hash
    const hash = await bcrypt.hash(password, 10);
    const id = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    
    await pool.query(
      'INSERT INTO super_admins (id, username, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
      [id, 'superadmin', hash]
    );
    
    res.json({ 
      success: true, 
      message: '✅ Admin created successfully!',
      credentials: {
        username: 'superadmin',
        password: password
      },
      warning: 'DELETE THIS ENDPOINT NOW!'
    });
    
  } catch (error) {
    console.error('[EMERGENCY SETUP ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║ ✅ CONTENTSCALE COMPLETE               ║
║ Port: ${PORT}                          ║
║ Status: OPERATIONAL                    ║
╚════════════════════════════════════════╝
  `);
});

module.exports = { pool };
