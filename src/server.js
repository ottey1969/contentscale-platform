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

app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT share_code, client_name, client_email, scans_limit, scans_used, expires_at, is_active,
             CASE
               WHEN NOT is_active THEN 'inactive'
               WHEN scans_used >= scans_limit THEN 'limit_reached'
               WHEN expires_at < NOW() THEN 'expired'
               ELSE 'active'
             END as status
      FROM share_links ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load share links' });
  }
});

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { client_email, scans_limit, valid_days } = req.body;
    if (!client_email || !scans_limit) return res.status(400).json({ success: false, error: 'Email and limit required' });
    const code = 'SCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expires = new Date();
    expires.setDate(expires.getDate() + parseInt(valid_days || 30));
    await pool.query(
      'INSERT INTO share_links (share_code, client_email, scans_limit, scans_used, expires_at, is_active, created_at) VALUES ($1, $2, $3, 0, $4, true, NOW())',
      [code, client_email, scans_limit, expires]
    );
    res.json({ success: true, share_url: `${req.protocol}://${req.get('host')}/scan-with-link/${code}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create link' });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE share_code = $1', [req.params.code]);
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
