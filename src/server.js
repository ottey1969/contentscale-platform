require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { performFullScan } = require('./scanner');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 🔒 RATE LIMITING SYSTEM
// ==========================================
const submissionLimits = new Map();

// Cleanup oude entries elke 6 uur
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, timestamp] of submissionLimits.entries()) {
    if (now - timestamp > 24 * 60 * 60 * 1000) {
      submissionLimits.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[RATE LIMIT] 🧹 Cleaned ${cleanedCount} expired entries`);
  }
}, 6 * 60 * 60 * 1000);

// Helper function: Sanitize user input
function sanitizeInput(input, maxLength = 100) {
  if (!input) return null;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '')   // Remove dangerous chars
    .trim()
    .substring(0, maxLength);
}

// Helper function: Get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() 
    || req.headers['x-real-ip']
    || req.connection.remoteAddress 
    || req.socket.remoteAddress
    || 'unknown';
}

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

app.get('/api/setup/create-admin', async (req, res) => {
  try {
    const secretKey = req.query.secret;
    const SETUP_SECRET = process.env.SETUP_SECRET || 'ContentScale2025Secret!';
    
    if (secretKey !== SETUP_SECRET) {
      console.log('[SETUP] ❌ Invalid secret key attempt');
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Access Denied</title>
            <style>
              body { 
                font-family: Arial; 
                padding: 40px; 
                text-align: center; 
                background: #1a1a1a; 
                color: white;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: #2a2a2a;
                padding: 40px;
                border-radius: 20px;
                border: 2px solid #ef4444;
              }
              h1 { color: #ef4444; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚫 Access Denied</h1>
              <p>Invalid setup secret key</p>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">This endpoint requires a valid secret parameter</p>
            </div>
          </body>
        </html>
      `);
    }
    
    console.log('[SETUP] ✅ Secret verified, creating admin...');
    
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query('DELETE FROM super_admins WHERE username IN ($1, $2)', ['ot', 'superadmin']);
    
    const id = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    await pool.query(
      'INSERT INTO super_admins (id, username, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
      [id, 'ot', hash]
    );
    
    console.log('[SETUP] ✅ Admin created successfully!');
    
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Created ✅</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 40px; 
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              margin: 0;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { color: #22c55e; margin-bottom: 10px; }
            .credentials {
              background: #f0f0f0;
              padding: 30px;
              border-radius: 10px;
              margin: 30px 0;
              font-size: 18px;
            }
            .credentials p {
              margin: 15px 0;
              font-weight: bold;
            }
            .btn {
              background: #3b82f6;
              color: white;
              padding: 15px 40px;
              text-decoration: none;
              border-radius: 10px;
              display: inline-block;
              margin: 10px;
              font-weight: bold;
              font-size: 16px;
            }
            .btn:hover { background: #2563eb; }
            .warning {
              color: #ef4444;
              font-size: 14px;
              margin-top: 30px;
              padding: 15px;
              background: #fee2e2;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Admin Created Successfully!</h1>
            <p style="color: #666;">You can now login to the admin panel</p>
            
            <div class="credentials">
              <p>👤 Username: <span style="color: #3b82f6;">ot</span></p>
              <p>🔑 Password: <span style="color: #3b82f6;">admin123</span></p>
            </div>
            
            <a href="/admin" class="btn">🚀 Go to Admin Panel</a>
            
            <div class="warning">
              <strong>⚠️ SECURITY WARNING</strong><br>
              After login, immediately:<br>
              1. Change your password in admin panel<br>
              2. Delete this setup endpoint from server.js<br>
              3. Redeploy the application
            </div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('[SETUP ERROR]', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center; background: #1a1a1a; color: white;">
          <h1 style="color: red;">❌ Setup Failed</h1>
          <p>${error.message}</p>
          <a href="/admin" style="background: blue; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">Try Admin Panel</a>
        </body>
      </html>
    `);
  }
});

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

app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN ATTEMPT] Username:', username);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await pool.query('SELECT id, username, password_hash FROM super_admins WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      console.log('[LOGIN FAILED] User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    
    console.log('[LOGIN] Password check:', isValid ? 'VALID ✅' : 'INVALID ❌');
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('[LOGIN SUCCESS] User:', username, 'ID:', admin.id);
    
    res.json({ 
      success: true, 
      admin_id: admin.id, 
      admin: { id: admin.id, username: admin.username } 
    });
    
  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

function generateMockRecommendations(score) {
  const recommendations = {
    quickWins: [],
    majorImpact: [],
    advanced: [],
    summary: {
      totalIssues: 0,
      estimatedTimeToFix: 0,
      potentialScoreGain: 100 - score,
      currentScore: score,
      targetScore: 100
    }
  };
  
  if (score < 80) {
    recommendations.quickWins.push(
      {
        category: 'GRAAF - Freshness',
        issue: 'Missing publication date',
        action: 'Add publication date and last updated date',
        details: ['Add <time> tag with datetime attribute', 'Show "Published: Month DD, YYYY"', 'Add "Last Updated" timestamp'],
        impact: 3,
        timeEstimate: 5,
        priority: 'high'
      },
      {
        category: 'CRAFT - Review & Optimize',
        issue: 'Meta title needs optimization',
        action: 'Adjust title to 50-60 characters with keyword',
        details: ['Include primary keyword at start', 'Add year (2025) for freshness', 'Keep under 60 characters'],
        impact: 3,
        timeEstimate: 10,
        priority: 'high'
      },
      {
        category: 'Technical SEO',
        issue: 'Not enough internal links',
        action: 'Add 5-7 contextual internal links',
        details: ['Link to related articles', 'Use descriptive anchor text', 'Distribute throughout content'],
        impact: 2,
        timeEstimate: 15,
        priority: 'medium'
      }
    );
  }
  
  if (score < 90) {
    recommendations.majorImpact.push(
      {
        category: 'GRAAF - Credibility',
        issue: 'Missing expert quotes (need 3+)',
        action: 'Add 3 expert quotes with full credentials',
        details: ['Find industry experts or academics', 'Include: Name, title, organization', 'Format: "Quote" — Name, Title, Org', 'Link to LinkedIn profiles when possible'],
        impact: 4,
        timeEstimate: 60,
        priority: 'high'
      },
      {
        category: 'GRAAF - Actionability',
        issue: 'Need more step-by-step guides (5+ required)',
        action: 'Create 3 detailed step-by-step tutorials',
        details: ['Use numbered lists', 'Each step should be specific and actionable', 'Include expected outcomes', 'Add time estimates per step'],
        impact: 3,
        timeEstimate: 45,
        priority: 'high'
      },
      {
        category: 'CRAFT - FAQ Integration',
        issue: 'Need 8+ FAQ questions',
        action: 'Add 8 frequently asked questions with answers',
        details: ['Research "People Also Ask" on Google', 'Cover What, Why, How, When questions', 'Answers should be 40-150 words', 'Add FAQ schema markup'],
        impact: 2,
        timeEstimate: 30,
        priority: 'medium'
      }
    );
  }
  
  if (score < 95) {
    recommendations.advanced.push(
      {
        category: 'GRAAF - Accuracy',
        issue: 'Missing case studies (2 required)',
        action: 'Add 2 detailed case studies with results',
        details: ['Include company name and industry', 'Show before/after metrics', 'Add specific timeframes', 'List 3 key learnings'],
        impact: 3,
        timeEstimate: 90,
        priority: 'medium'
      },
      {
        category: 'CRAFT - Add Visuals',
        issue: 'Could add more images',
        action: 'Add 3-5 more images with alt text',
        details: ['Target: 1 image per 350 words', 'Use screenshots, diagrams, charts', 'Add descriptive alt text (50-100 chars)', 'Optimize to WebP format <200KB'],
        impact: 2,
        timeEstimate: 40,
        priority: 'low'
      }
    );
  }
  
  recommendations.summary.totalIssues = 
    recommendations.quickWins.length + 
    recommendations.majorImpact.length + 
    recommendations.advanced.length;
  
  recommendations.summary.estimatedTimeToFix = 
    recommendations.quickWins.reduce((sum, r) => sum + r.timeEstimate, 0) +
    recommendations.majorImpact.reduce((sum, r) => sum + r.timeEstimate, 0) +
    recommendations.advanced.reduce((sum, r) => sum + r.timeEstimate, 0);
  
  return recommendations;
}

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
    
    if (!client_email || !scans_limit) {
      return res.status(400).json({ success: false, error: 'Email and limit required' });
    }
    
    const code = 'SCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expires = new Date();
    expires.setDate(expires.getDate() + parseInt(valid_days || 30));
    
    const defaultFeatures = {
      graaf_enabled: true,
      craft_enabled: true,
      technical_enabled: true,
      max_pages_per_scan: 1
    };
    
    await pool.query(
      `INSERT INTO share_links 
       (token, name, client_name, company, max_uses, current_uses, expires_at, is_active, allowed_features, created_at) 
       VALUES ($1, $2, $3, $4, $5, 0, $6, true, $7, NOW())`,
      [code, client_email, client_name || null, company || null, scans_limit, expires, JSON.stringify(defaultFeatures)]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${code}`;
    
    res.json({ success: true, share_url: shareUrl });
    
  } catch (error) {
    console.error('[SHARE LINK CREATE ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create link' });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE token = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

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
// ==========================================
// 🤖 REAL SCAN - FREE ENDPOINT (FIXED!)
// Nu slaat het op in database!
// ==========================================
app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL required' });
    }
    
    console.log('[SCAN-FREE] 🔍 Starting scan for:', url);
    
    // 1️⃣ PERFORM REAL SCAN (Puppeteer + Claude)
    const scanResult = await performFullScan(url);
    
    if (!scanResult.success) {
      console.log('[SCAN-FREE] ❌ Scan failed:', scanResult.error);
      return res.status(500).json({ 
        success: false, 
        error: scanResult.error || 'Scan failed' 
      });
    }
    
    console.log('[SCAN-FREE] ✅ Scan complete! Score:', scanResult.score);
    
    // 2️⃣ 🔥 SAVE TO DATABASE (THIS IS THE FIX!)
    try {
      await pool.query(`
        INSERT INTO scans (
          url, 
          score, 
          quality,
          graaf_score,
          craft_score,
          technical_score,
          breakdown,
          recommendations,
          word_count,
          scan_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        scanResult.url,
        scanResult.score,
        scanResult.quality,
        scanResult.breakdown.graaf.total,
        scanResult.breakdown.craft.total,
        scanResult.breakdown.technical.total,
        JSON.stringify(scanResult.breakdown),
        JSON.stringify(scanResult.recommendations),
        scanResult.wordCount,
        'free'
      ]);
      
      console.log('[DATABASE] ✅ Scan saved to database!');
      
    } catch (dbError) {
      console.error('[DATABASE ERROR] ❌ Failed to save scan:', dbError.message);
      // Continue anyway - don't fail the whole scan if DB save fails
    }
    
    // 3️⃣ RETURN RESULT
    console.log('[SCAN-FREE] 🎉 Complete! Recommendations:', scanResult.recommendations.summary.totalIssues);
    
    res.json(scanResult);
    
  } catch (error) {
    console.error('[SCAN-FREE ERROR] ❌', error);
    res.status(500).json({ 
      success: false, 
      error: 'Scan failed: ' + error.message 
    });
  }
});

// ==========================================
// 🔒 LEADERBOARD SUBMIT - WITH SECURITY
// ==========================================
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category } = req.body;
    
    // VALIDATION: Required fields
    if (!url || !score) {
      return res.status(400).json({ success: false, error: 'URL and score required' });
    }
    
    // VALIDATION: URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'Invalid URL format (must start with http:// or https://)' });
    }
    
    // VALIDATION: Score range
    if (score < 0 || score > 100) {
      return res.status(400).json({ success: false, error: 'Score must be between 0 and 100' });
    }
    
    // SECURITY: Rate limiting - 1 submission per URL per 24h per IP
    const clientIP = getClientIP(req);
    const rateLimitKey = `${url}:${clientIP}`;
    const now = Date.now();
    
    if (submissionLimits.has(rateLimitKey)) {
      const lastSubmit = submissionLimits.get(rateLimitKey);
      const timeSinceLastSubmit = now - lastSubmit;
      const hoursRemaining = Math.ceil((24 * 60 * 60 * 1000 - timeSinceLastSubmit) / (60 * 60 * 1000));
      
      if (timeSinceLastSubmit < 24 * 60 * 60 * 1000) {
        console.log(`[RATE LIMIT] ⏰ Blocked submission for ${url} from ${clientIP} (${hoursRemaining}h remaining)`);
        return res.status(429).json({ 
          success: false, 
          error: `Rate limit: You can only submit this URL once per day. Try again in ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}.`,
          retry_after_hours: hoursRemaining
        });
      }
    }
    
    // SECURITY: Sanitize user inputs
    const sanitizedCompanyName = sanitizeInput(company_name, 100);
    const sanitizedCategory = category && ['agency', 'saas', 'blog', 'ecommerce', 'other'].includes(category) 
      ? category 
      : null;
    
    // Generate URL hash for duplicate detection
    const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
    
    // Check if URL already exists
    const existing = await pool.query('SELECT id, score FROM public_leaderboard WHERE url_hash = $1', [urlHash]);
    
    if (existing.rows.length > 0) {
      // UPDATE existing entry
      await pool.query(`
        UPDATE public_leaderboard 
        SET score = $1, quality = $2, graaf_score = $3, craft_score = $4, 
            technical_score = $5, word_count = $6, company_name = $7, 
            category = $8, updated_at = NOW()
        WHERE url_hash = $9
      `, [score, quality, graaf_score, craft_score, technical_score, word_count, sanitizedCompanyName, sanitizedCategory, urlHash]);
      
      console.log(`[LEADERBOARD] ♻️ Updated: ${url} (${score}/100) - Company: ${sanitizedCompanyName || 'N/A'} - IP: ${clientIP}`);
    } else {
      // INSERT new entry
      await pool.query(`
        INSERT INTO public_leaderboard 
        (url, url_hash, score, quality, graaf_score, craft_score, technical_score, 
         word_count, company_name, category, is_public, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      `, [url, urlHash, score, quality, graaf_score, craft_score, technical_score, word_count, sanitizedCompanyName, sanitizedCategory]);
      
      console.log(`[LEADERBOARD] ✅ New entry: ${url} (${score}/100) - Company: ${sanitizedCompanyName || 'N/A'} - IP: ${clientIP}`);
    }
    
    // Update rate limit cache
    submissionLimits.set(rateLimitKey, now);
    
    res.json({ success: true, message: 'Added to leaderboard' });
    
  } catch (error) {
    console.error('[SUBMIT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to submit' });
  }
});

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

app.get('/scan-with-link/:code', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/share-link.html'));
});

app.get('/api/share-link/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(`
      SELECT token, name as client_email, client_name, company, 
             max_uses, current_uses, expires_at, is_active
      FROM share_links 
      WHERE token = $1
    `, [code]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Invalid share link', status: 'invalid' });
    }
    
    const link = result.rows[0];
    
    if (!link.is_active) {
      return res.json({ success: false, error: 'Link deactivated', status: 'inactive' });
    }
    
    if (new Date(link.expires_at) < new Date()) {
      return res.json({ success: false, error: 'Link expired', status: 'expired', expires_at: link.expires_at });
    }
    
    if (link.current_uses >= link.max_uses) {
      return res.json({ success: false, error: 'Scan limit reached', status: 'limit_reached', scans_limit: link.max_uses });
    }
    
    res.json({
      success: true,
      status: 'active',
      client_email: link.client_email,
      client_name: link.client_name,
      company: link.company,
      scans_limit: link.max_uses,
      scans_used: link.current_uses,
      scans_remaining: link.max_uses - link.current_uses,
      expires_at: link.expires_at
    });
    
  } catch (error) {
    console.error('[SHARE LINK VALIDATE ERROR]', error);
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

// ==========================================
// 🤖 REAL SCAN - SHARE LINK ENDPOINT (FIXED!)
// Nu slaat het op in database!
// ==========================================
app.post('/api/share-link/scan', async (req, res) => {
  try {
    const { share_code, url } = req.body;
    
    if (!share_code || !url) {
      return res.status(400).json({ success: false, error: 'Share code and URL required' });
    }
    
    console.log('[SHARE LINK SCAN] 🔍 Code:', share_code, 'URL:', url);
    
    // 1️⃣ VALIDATE SHARE LINK
    const linkResult = await pool.query(`
      SELECT token, max_uses, current_uses, expires_at, is_active
      FROM share_links 
      WHERE token = $1
    `, [share_code]);
    
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invalid share link' });
    }
    
    const link = linkResult.rows[0];
    
    if (!link.is_active) {
      return res.json({ success: false, error: 'Link deactivated', status: 'inactive' });
    }
    
    if (new Date(link.expires_at) < new Date()) {
      return res.json({ success: false, error: 'Link expired', status: 'expired' });
    }
    
    if (link.current_uses >= link.max_uses) {
      return res.json({ success: false, error: 'Scan limit reached', status: 'limit_reached' });
    }
    
    // 2️⃣ PERFORM REAL SCAN (Puppeteer + Claude)
    console.log('[SHARE LINK] 🤖 Starting real scan...');
    
    const scanResult = await performFullScan(url);
    
    if (!scanResult.success) {
      console.log('[SHARE LINK] ❌ Scan failed:', scanResult.error);
      return res.status(500).json({ success: false, error: scanResult.error });
    }
    
    console.log('[SHARE LINK] ✅ Scan complete! Score:', scanResult.score);
    
    // 3️⃣ 🔥 SAVE TO DATABASE (THIS IS THE FIX!)
    try {
      await pool.query(`
        INSERT INTO scans (
          url, 
          score, 
          quality,
          graaf_score,
          craft_score,
          technical_score,
          breakdown,
          recommendations,
          word_count,
          scan_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        scanResult.url,
        scanResult.score,
        scanResult.quality,
        scanResult.breakdown.graaf.total,
        scanResult.breakdown.craft.total,
        scanResult.breakdown.technical.total,
        JSON.stringify(scanResult.breakdown),
        JSON.stringify(scanResult.recommendations),
        scanResult.wordCount,
        'share_link'
      ]);
      
      console.log('[DATABASE] ✅ Scan saved to database!');
      
    } catch (dbError) {
      console.error('[DATABASE ERROR] ❌ Failed to save scan:', dbError.message);
      // Continue anyway - don't fail the whole scan if DB save fails
    }
    
    // 4️⃣ UPDATE SHARE LINK USAGE
    await pool.query(
      'UPDATE share_links SET current_uses = current_uses + 1 WHERE token = $1',
      [share_code]
    );
    
    // 5️⃣ ADD REMAINING SCANS TO RESPONSE
    scanResult.scans_remaining = link.max_uses - link.current_uses - 1;
    
    console.log('[SHARE LINK] 🎉 Complete! Score:', scanResult.score, 'Recs:', scanResult.recommendations.summary.totalIssues, 'Remaining:', scanResult.scans_remaining);
    
    res.json(scanResult);
    
  } catch (error) {
    console.error('[SHARE LINK SCAN ERROR] ❌', error);
    res.status(500).json({ success: false, error: 'Scan failed: ' + error.message });
  }
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║ ✅ CONTENTSCALE v2.1 - DATABASE FIXED  ║
║ Port: ${PORT}                          ║
║ 🤖 Puppeteer + Claude: ACTIVE          ║
║ 📊 Recommendations: ACTIVE             ║
║ 💾 Database Save: ACTIVE (FIXED!)      ║
║ 🔒 Rate Limiting: ACTIVE               ║
║ 🛡️  Input Sanitization: ACTIVE        ║
╚════════════════════════════════════════╝
  `);
});

module.exports = { pool };
