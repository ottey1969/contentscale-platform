// ==========================================
// CONTENTSCALE SERVER.JS - FIXED (DEEL 1/3)
// ✅ NO duplicates | ✅ CORRECT queries | ✅ WORKING auth
// ==========================================

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
  if (err) {
    console.error('❌ Database failed:', err.message);
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

// ==========================================
// AUTH MIDDLEWARE - FIXED
// ==========================================
async function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Auth required' });
  }
  
  try {
    const superAdmin = await pool.query(
      'SELECT id, username FROM super_admins WHERE id = $1',
      [adminKey]
    );
    
    if (superAdmin.rows.length > 0) {
      req.admin = { ...superAdmin.rows[0], role: 'super_admin' };
      return next();
    }
    
    const admin = await pool.query(
      'SELECT id, username, role FROM admins WHERE id = $1',
      [adminKey]
    );
    
    if (admin.rows.length > 0) {
      req.admin = admin.rows[0];
      return next();
    }
    
    return res.status(403).json({ success: false, error: 'Access denied' });
    
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

// ==========================================
// AUTH ROUTES
// ==========================================
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
      admin: { id: admin.id, username: admin.username }
    });
    
  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// STATISTICS - FIXED
// ==========================================
app.get('/api/admin/stats', authenticateSuperAdmin, async (req, res) => {
  try {
    const [agencies, clients, scans, helpers] = await Promise.all([
      pool.query('SELECT COUNT(*)::integer as count FROM agencies WHERE is_active = true'),
      pool.query('SELECT COUNT(*)::integer as count FROM clients'),
      pool.query('SELECT COUNT(*)::integer as count FROM scans'),
      pool.query('SELECT COUNT(*)::integer as count FROM admins WHERE is_active = true')
    ]);
    
    console.log('[STATS] Loaded');
    
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
    res.status(500).json({ success: false, error: 'Failed to load stats', details: error.message });
  }
});

// ==========================================
// ADMINS MANAGEMENT - FIXED
// ==========================================
app.get('/api/admins', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, role, full_name, email,
             is_active, created_at, last_login
      FROM admins ORDER BY created_at DESC
    `);
    
    console.log(`[ADMINS] Fetched ${result.rows.length}`);
    res.json({ success: true, admins: result.rows });
    
  } catch (error) {
    console.error('[ADMINS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admins', details: error.message });
  }
});

app.post('/api/admins', authenticateSuperAdmin, async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  
  try {
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Username, password, role required' });
    }
    
    const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Username exists' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(`
      INSERT INTO admins (username, password_hash, role, full_name, email, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      RETURNING id, username, role, full_name, email, created_at
    `, [username, hash, role, full_name || null, email || null]);
    
    console.log(`✅ Admin created: ${username}`);
    res.json({ success: true, message: 'Admin created', admin: result.rows[0] });
    
  } catch (error) {
    console.error('[CREATE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create admin', details: error.message });
  }
});

app.delete('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM admins WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    console.log(`✅ Admin deleted: ${result.rows[0].username}`);
    res.json({ success: true, message: 'Admin deleted' });
    
  } catch (error) {
    console.error('[DELETE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete admin', details: error.message });
  }
});
// ==========================================
// DEEL 2/3: AGENCIES, CLIENTS, SCANS
// ==========================================

// AGENCIES - FIXED
app.get('/api/super-admin/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.name, a.domain, a.country, a.plan,
             a.v52_score, a.is_active, a.admin_key,
             a.created_at, a.next_scan_date,
             COUNT(DISTINCT c.id)::integer as client_count,
             COUNT(DISTINCT s.id)::integer as total_scans
      FROM agencies a
      LEFT JOIN clients c ON c.agency_id = a.id
      LEFT JOIN scans s ON s.agency_id = a.id
      GROUP BY a.id ORDER BY a.created_at DESC
    `);
    
    console.log(`[AGENCIES] Fetched ${result.rows.length}`);
    res.json({ success: true, agencies: result.rows });
    
  } catch (error) {
    console.error('[AGENCIES ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agencies', details: error.message });
  }
});

app.post('/api/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, domain, country, plan, contact_person, contact_email } = req.body;
    
    if (!name || !domain || !country || !plan) {
      return res.status(400).json({ success: false, error: 'Name, domain, country, plan required' });
    }
    
    const adminKey = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    
    const result = await pool.query(`
      INSERT INTO agencies (name, domain, country, plan, contact_person, contact_email, admin_key, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      RETURNING id, name, domain, admin_key, created_at
    `, [name, domain, country, plan, contact_person || null, contact_email || null, adminKey]);
    
    console.log(`✅ Agency created: ${name}`);
    res.json({ success: true, message: 'Agency created', agency: result.rows[0] });
    
  } catch (error) {
    console.error('[CREATE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create agency', details: error.message });
  }
});

app.delete('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const clientCheck = await pool.query(
      'SELECT COUNT(*)::integer as count FROM clients WHERE agency_id = $1',
      [req.params.id]
    );
    
    if (clientCheck.rows[0].count > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete agency with clients' });
    }
    
    const result = await pool.query('DELETE FROM agencies WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agency not found' });
    }
    
    console.log(`✅ Agency deleted: ${result.rows[0].name}`);
    res.json({ success: true, message: 'Agency deleted' });
    
  } catch (error) {
    console.error('[DELETE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete agency', details: error.message });
  }
});

// CLIENTS - FIXED (NO c.name!)
app.get('/api/admin/clients', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.url, c.agency_id, c.created_at, c.last_scan_at,
             a.name as agency_name,
             COUNT(s.id)::integer as scan_count
      FROM clients c
      LEFT JOIN agencies a ON a.id = c.agency_id
      LEFT JOIN scans s ON s.client_id = c.id
      GROUP BY c.id, a.name
      ORDER BY c.created_at DESC LIMIT 500
    `);
    
    console.log(`[CLIENTS] Fetched ${result.rows.length}`);
    res.json({ success: true, total: result.rows.length, clients: result.rows });
    
  } catch (error) {
    console.error('[CLIENTS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load clients', details: error.message });
  }
});

app.delete('/api/admin/clients/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE client_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    
    console.log(`✅ Client deleted: ${result.rows[0].url}`);
    res.json({ success: true, message: 'Client deleted' });
    
  } catch (error) {
    console.error('[DELETE CLIENT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete client', details: error.message });
  }
});

// SCANS - FIXED (USE c.url NOT c.name!)
app.get('/api/admin/scans', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.url, s.score, s.quality,
             s.graaf_score, s.craft_score, s.technical_score,
             s.word_count, s.scan_type, s.created_at,
             s.agency_id, s.client_id,
             a.name as agency_name,
             c.url as client_url
      FROM scans s
      LEFT JOIN agencies a ON a.id = s.agency_id
      LEFT JOIN clients c ON c.id = s.client_id
      ORDER BY s.created_at DESC LIMIT 500
    `);
    
    console.log(`[SCANS] Fetched ${result.rows.length}`);
    res.json({ success: true, total: result.rows.length, scans: result.rows });
    
  } catch (error) {
    console.error('[SCANS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load scans', details: error.message });
  }
});

app.delete('/api/admin/scans/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM scans WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }
    
    console.log(`✅ Scan deleted: #${req.params.id}`);
    res.json({ success: true, message: 'Scan deleted' });
    
  } catch (error) {
    console.error('[DELETE SCAN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete scan', details: error.message });
  }
});
// ==========================================
// DEEL 3/3: SHARE LINKS, LEADERBOARD, SERVER START
// ==========================================

// SHARE LINKS
app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT share_code, client_name, client_email, client_company,
             scans_limit, scans_used, expires_at, is_active, created_at,
             CASE
               WHEN NOT is_active THEN 'inactive'
               WHEN scans_used >= scans_limit THEN 'limit_reached'
               WHEN expires_at < NOW() THEN 'expired'
               ELSE 'active'
             END as status
      FROM share_links
      ORDER BY created_at DESC LIMIT 100
    `);
    
    console.log(`[SHARE LINKS] Fetched ${result.rows.length}`);
    res.json({ success: true, share_links: result.rows });
    
  } catch (error) {
    console.error('[SHARE LINKS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load share links', details: error.message });
  }
});

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { client_name, client_email, client_company, scans_limit, valid_days, notes } = req.body;
    
    if (!client_email || !scans_limit || !valid_days) {
      return res.status(400).json({ success: false, error: 'Email, scans_limit, valid_days required' });
    }
    
    const shareCode = 'SCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(valid_days));
    
    const result = await pool.query(`
      INSERT INTO share_links (share_code, client_name, client_email, client_company, scans_limit, scans_used, expires_at, notes, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, 0, $6, $7, true, NOW())
      RETURNING *
    `, [shareCode, client_name || null, client_email, client_company || null, scans_limit, expiresAt, notes || null]);
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${shareCode}`;
    
    console.log(`✅ Share link created: ${shareCode}`);
    res.json({ success: true, message: 'Share link created', share_link: result.rows[0], share_url: shareUrl });
    
  } catch (error) {
    console.error('[CREATE SHARE LINK ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create share link', details: error.message });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM share_links WHERE share_code = $1 RETURNING *', [req.params.code]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }
    
    console.log(`✅ Share link deleted: ${req.params.code}`);
    res.json({ success: true, message: 'Share link deleted' });
    
  } catch (error) {
    console.error('[DELETE SHARE LINK ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete share link', details: error.message });
  }
});

// LEADERBOARD
app.get('/api/admin/leaderboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, url, url_hash, score, quality,
             graaf_score, craft_score, technical_score,
             word_count, company_name, category, country, language,
             is_public, created_at, updated_at
      FROM public_leaderboard
      ORDER BY score DESC, created_at DESC
    `);
    
    const entries = result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
    
    console.log(`[LEADERBOARD] Fetched ${entries.length}`);
    res.json({ success: true, total: entries.length, entries });
    
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard', details: error.message });
  }
});

app.delete('/api/admin/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM public_leaderboard WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    
    console.log(`✅ Leaderboard entry deleted: #${req.params.id}`);
    res.json({ success: true, message: 'Entry deleted', deleted: result.rows[0] });
    
  } catch (error) {
    console.error('[DELETE LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete entry', details: error.message });
  }
});

// BASIC ROUTES
app.get('/', (req, res) => {
  res.json({ name: 'ContentScale Platform', version: '2.0-FIXED', status: 'operational' });
});

app.get('/health', async (req, res) => {
  try {
    const db = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: { connected: true, timestamp: db.rows[0].now } });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════╗
║ 🎯 CONTENTSCALE - FIXED VERSION               ║
╠════════════════════════════════════════════════╣
║ Port: ${PORT}                                  ║
║ ✅ NO duplicates                               ║
║ ✅ CORRECT queries                             ║
║ ✅ WORKING auth                                ║
║ 📊 SUPER ADMIN READY!                          ║
╚════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', async () => {
  console.log('Closing...');
  pool.end(() => process.exit(0));
});

module.exports = { pool };
