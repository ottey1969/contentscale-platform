const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database
const db = new sqlite3.Database('./contentscale.db', (err) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('✅ Database connected');
  }
});

// ============================================
// DATABASE TABLES
// ============================================

// Super admins
db.run(`CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Agencies
db.run(`CREATE TABLE IF NOT EXISTS agencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_email TEXT UNIQUE NOT NULL,
  phone TEXT,
  website TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Clients
db.run(`CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
)`);

// Scans
db.run(`CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  url TEXT NOT NULL,
  score INTEGER NOT NULL,
  graaf_score INTEGER,
  craft_score INTEGER,
  technical_score INTEGER,
  scan_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
)`);

// Share links - FIX: Ensure client_company column exists
db.run(`CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  client_email TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_company TEXT,
  scans_limit INTEGER DEFAULT 3,
  scans_used INTEGER DEFAULT 0,
  valid_days INTEGER DEFAULT 7,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  is_active BOOLEAN DEFAULT 1
)`, (err) => {
  if (!err) {
    // Check if client_company column exists, add if not
    db.all("PRAGMA table_info(share_links)", (err, columns) => {
      if (!err && columns) {
        const hasClientCompany = columns.some(col => col.name === 'client_company');
        if (!hasClientCompany) {
          db.run("ALTER TABLE share_links ADD COLUMN client_company TEXT", (alterErr) => {
            if (!alterErr) console.log('✅ Added client_company to share_links');
          });
        }
      }
    });
  }
});

// Leaderboard
db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT UNIQUE NOT NULL,
  company TEXT,
  score INTEGER NOT NULL,
  scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  opt_out BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Scan history
db.run(`CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  score INTEGER NOT NULL,
  graaf_score INTEGER,
  craft_score INTEGER,
  technical_score INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  scan_date DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ============================================
// DAILY SCAN LIMITS
// ============================================

const dailyScanLimits = new Map();
const leadScannerLimits = new Map();

function checkDailyScanLimit(ip, isLeadScanner = false) {
  const today = new Date().toISOString().split('T')[0];
  const storage = isLeadScanner ? leadScannerLimits : dailyScanLimits;
  const limit = isLeadScanner ? 10 : 3; // Lead scanner: 10/day, Regular: 3/day
  
  if (!storage.has(ip)) {
    storage.set(ip, { date: today, count: 0 });
  }
  
  const record = storage.get(ip);
  
  if (record.date !== today) {
    record.date = today;
    record.count = 0;
  }
  
  return {
    count: record.count,
    limit: limit,
    exceeded: record.count >= limit
  };
}

function incrementScanLimit(ip, isLeadScanner = false) {
  const today = new Date().toISOString().split('T')[0];
  const storage = isLeadScanner ? leadScannerLimits : dailyScanLimits;
  
  if (!storage.has(ip)) {
    storage.set(ip, { date: today, count: 1 });
  } else {
    const record = storage.get(ip);
    if (record.date === today) {
      record.count++;
    } else {
      record.date = today;
      record.count = 1;
    }
  }
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress || 
         'unknown';
}

// ============================================
// HTML ROUTES
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/lead-scanner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lead-scanner.html'));
});

app.get('/scanner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
});

// ============================================
// ADMIN LOGIN
// ============================================

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  db.get('SELECT * FROM super_admins WHERE email = ?', [email], async (err, admin) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    try {
      const match = await bcrypt.compare(password, admin.password_hash);
      if (!match) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      res.json({
        success: true,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Authentication error' });
    }
  });
});

// ============================================
// ADMIN STATS
// ============================================

app.get('/api/admin/stats', (req, res) => {
  const stats = {};

  db.get('SELECT COUNT(*) as count FROM agencies', (err, result) => {
    stats.totalAgencies = result ? result.count : 0;

    db.get('SELECT COUNT(*) as count FROM clients', (err, result) => {
      stats.totalClients = result ? result.count : 0;

      db.get('SELECT COUNT(*) as count FROM scans', (err, result) => {
        stats.totalScans = result ? result.count : 0;

        db.get('SELECT AVG(score) as avg FROM scans', (err, result) => {
          stats.averageScore = result && result.avg ? Math.round(result.avg) : 0;

          res.json({ success: true, stats });
        });
      });
    });
  });
});

// ============================================
// ADMINS CRUD - FIX #2
// ============================================

app.get('/api/admins', (req, res) => {
  db.all('SELECT id, email, name, created_at FROM super_admins ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    res.json({ success: true, admins: rows || [] });
  });
});

// FIX #2: Admin creation - proper field validation
app.post('/api/admins', async (req, res) => {
  const { email, password, name } = req.body;

  console.log('Creating admin:', { email, name, hasPassword: !!password });

  // Validate all fields
  if (!email || !password || !name) {
    return res.status(400).json({ 
      success: false, 
      error: 'All fields required: email, password, name',
      missing: {
        email: !email,
        password: !password,
        name: !name
      }
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password must be at least 6 characters' 
    });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO super_admins (email, password_hash, name) VALUES (?, ?, ?)',
      [email, password_hash, name],
      function(err) {
        if (err) {
          console.error('Admin creation error:', err);
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
          }
          return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
        }
        
        console.log('✅ Admin created successfully, ID:', this.lastID);
        res.json({ 
          success: true, 
          admin: { 
            id: this.lastID, 
            email, 
            name 
          } 
        });
      }
    );
  } catch (error) {
    console.error('Password hashing error:', error);
    res.status(500).json({ success: false, error: 'Password hashing error' });
  }
});

app.delete('/api/admins/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM super_admins WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    res.json({ success: true });
  });
});

// ============================================
// AGENCIES CRUD - FIX #3
// ============================================

app.get('/api/agencies', (req, res) => {
  db.all('SELECT * FROM agencies ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    res.json({ success: true, agencies: rows || [] });
  });
});

// FIX #3: Agency creation - proper validation and error handling
app.post('/api/agencies', (req, res) => {
  const { name, contact_email, phone, website } = req.body;

  console.log('Creating agency:', { name, contact_email, phone, website });

  if (!name || !contact_email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Name and contact email are required',
      missing: {
        name: !name,
        contact_email: !contact_email
      }
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(contact_email)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid email format' 
    });
  }

  db.run(
    'INSERT INTO agencies (name, contact_email, phone, website) VALUES (?, ?, ?, ?)',
    [name, contact_email, phone || null, website || null],
    function(err) {
      if (err) {
        console.error('Agency creation error:', err);
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ 
            success: false, 
            error: 'Email already exists. Please use a different email.' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          error: 'Database error: ' + err.message 
        });
      }
      
      console.log('✅ Agency created successfully, ID:', this.lastID);
      res.json({ 
        success: true, 
        agency: { 
          id: this.lastID, 
          name, 
          contact_email, 
          phone, 
          website 
        } 
      });
    }
  );
});

app.put('/api/agencies/:id', (req, res) => {
  const { id } = req.params;
  const { name, contact_email, phone, website } = req.body;

  if (!name || !contact_email) {
    return res.status(400).json({ success: false, error: 'Name and contact email required' });
  }

  db.run(
    'UPDATE agencies SET name = ?, contact_email = ?, phone = ?, website = ? WHERE id = ?',
    [name, contact_email, phone, website, id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Agency not found' });
      }
      res.json({ success: true });
    }
  );
});

app.delete('/api/agencies/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM agencies WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Agency not found' });
    }
    res.json({ success: true });
  });
});

// ============================================
// CLIENTS CRUD
// ============================================

app.get('/api/clients', (req, res) => {
  const query = `
    SELECT c.*, a.name as agency_name 
    FROM clients c
    LEFT JOIN agencies a ON c.agency_id = a.id
    ORDER BY c.created_at DESC
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    res.json({ success: true, clients: rows || [] });
  });
});

app.post('/api/clients', (req, res) => {
  const { agency_id, name, email, website, industry } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }

  db.run(
    'INSERT INTO clients (agency_id, name, email, website, industry) VALUES (?, ?, ?, ?, ?)',
    [agency_id || null, name, email, website, industry],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ 
        success: true, 
        client: { id: this.lastID, agency_id, name, email, website, industry } 
      });
    }
  );
});

app.put('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  const { agency_id, name, email, website, industry } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }

  db.run(
    'UPDATE clients SET agency_id = ?, name = ?, email = ?, website = ?, industry = ? WHERE id = ?',
    [agency_id || null, name, email, website, industry, id],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }
      res.json({ success: true });
    }
  );
});

app.delete('/api/clients/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM clients WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true });
  });
});

// ============================================
// SCANS - FIX #4
// ============================================

// FIX #4: All scans endpoint
app.get('/api/scans', (req, res) => {
  const query = `
    SELECT s.*, c.name as client_name, c.email as client_email
    FROM scans s
    LEFT JOIN clients c ON s.client_id = c.id
    ORDER BY s.created_at DESC
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('Get scans error:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    console.log('✅ Retrieved', rows.length, 'scans');
    res.json({ success: true, scans: rows || [] });
  });
});

app.get('/api/scans/client/:clientId', (req, res) => {
  const { clientId } = req.params;
  
  db.all(
    'SELECT * FROM scans WHERE client_id = ? ORDER BY created_at DESC',
    [clientId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, scans: rows || [] });
    }
  );
});

app.delete('/api/scans/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM scans WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }
    res.json({ success: true });
  });
});

// ============================================
// SHARE LINKS - FIX #5
// ============================================

app.get('/api/admin/share-links', (req, res) => {
  db.all(
    'SELECT * FROM share_links ORDER BY created_at DESC',
    (err, rows) => {
      if (err) {
        console.error('Get share links error:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, shareLinks: rows || [] });
    }
  );
});

// FIX #5: Create share link with client_company
app.post('/api/admin/share-links/create', (req, res) => {
  const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;

  console.log('📝 Creating share link:', { 
    client_email, 
    client_name, 
    client_company, 
    scans_limit, 
    valid_days 
  });

  if (!client_email || !client_name) {
    return res.status(400).json({ 
      success: false, 
      error: 'Client email and name are required' 
    });
  }

  const token = require('crypto').randomBytes(16).toString('hex');
  const expires_at = new Date();
  expires_at.setDate(expires_at.getDate() + (valid_days || 7));

  const sql = `INSERT INTO share_links 
    (token, client_email, client_name, client_company, scans_limit, scans_used, valid_days, expires_at, is_active) 
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`;
  
  const params = [
    token, 
    client_email, 
    client_name, 
    client_company || null, 
    scans_limit || 3, 
    valid_days || 7, 
    expires_at.toISOString()
  ];

  db.run(sql, params, function(err) {
    if (err) {
      console.error('❌ Share link creation error:', err);
      return res.status(500).json({ 
        success: false, 
        error: 'Database error: ' + err.message 
      });
    }

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`;
    
    console.log('✅ Share link created successfully, ID:', this.lastID);
    res.json({ 
      success: true, 
      shareLink: {
        id: this.lastID,
        token,
        client_email,
        client_name,
        client_company,
        scans_limit: scans_limit || 3,
        scans_used: 0,
        valid_days: valid_days || 7,
        expires_at: expires_at.toISOString(),
        is_active: 1,
        url: shareUrl
      }
    });
  });
});

// FIX #5: Delete share link
app.delete('/api/admin/share-links/:id', (req, res) => {
  const { id } = req.params;

  console.log('🗑️ Deleting share link ID:', id);
  
  db.run('DELETE FROM share_links WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Delete error:', err);
      return res.status(500).json({ 
        success: false, 
        error: 'Database error: ' + err.message 
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Share link not found' 
      });
    }
    
    console.log('✅ Share link deleted');
    res.json({ success: true, message: 'Share link deleted' });
  });
});

app.get('/api/share-links/verify/:token', (req, res) => {
  const { token } = req.params;

  db.get(
    `SELECT * FROM share_links 
     WHERE token = ? AND is_active = 1 AND datetime(expires_at) > datetime('now')`,
    [token],
    (err, link) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (!link) {
        return res.status(404).json({ 
          success: false, 
          error: 'Invalid or expired link' 
        });
      }

      if (link.scans_used >= link.scans_limit) {
        return res.status(403).json({ 
          success: false, 
          error: 'Scan limit reached' 
        });
      }

      res.json({ 
        success: true, 
        shareLink: {
          client_name: link.client_name,
          client_company: link.client_company,
          scans_remaining: link.scans_limit - link.scans_used,
          scans_limit: link.scans_limit
        }
      });
    }
  );
});

// ============================================
// LEADERBOARD - FIX #6 & #7
// ============================================

app.get('/api/admin/leaderboard', (req, res) => {
  db.all(
    'SELECT * FROM leaderboard ORDER BY score DESC, updated_at DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, entries: rows || [] });
    }
  );
});

// FIX #7: Leaderboard - DISTINCT domains, highest score only
app.get('/api/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  
  // Get UNIQUE domains with HIGHEST score only
  const query = `
    SELECT 
      domain,
      company,
      MAX(score) as score,
      MAX(scan_date) as scan_date,
      updated_at
    FROM leaderboard 
    WHERE opt_out = 0
    GROUP BY domain
    ORDER BY score DESC, updated_at DESC
    LIMIT ?
  `;
  
  db.all(query, [limit], (err, rows) => {
    if (err) {
      console.error('Leaderboard error:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    console.log('✅ Leaderboard:', rows.length, 'unique domains');
    res.json({ success: true, leaderboard: rows || [] });
  });
});

app.post('/api/leaderboard/submit', (req, res) => {
  const { domain, company, score } = req.body;

  if (!domain || !score) {
    return res.status(400).json({ 
      success: false, 
      error: 'Domain and score required' 
    });
  }

  db.get('SELECT * FROM leaderboard WHERE domain = ?', [domain], (err, existing) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (existing) {
      // Update ONLY if new score is HIGHER
      if (score > existing.score) {
        db.run(
          `UPDATE leaderboard 
           SET score = ?, company = ?, scan_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
           WHERE domain = ?`,
          [score, company || existing.company, domain],
          function(err) {
            if (err) {
              return res.status(500).json({ success: false, error: 'Database error' });
            }
            console.log('✅ Leaderboard updated:', domain, score);
            res.json({ 
              success: true, 
              message: 'Score updated (improved)',
              improved: true
            });
          }
        );
      } else {
        res.json({ 
          success: true, 
          message: 'Score not improved',
          improved: false
        });
      }
    } else {
      // New entry
      db.run(
        `INSERT INTO leaderboard (domain, company, score, scan_date, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [domain, company || 'Anonymous', score],
        function(err) {
          if (err) {
            return res.status(500).json({ success: false, error: 'Database error' });
          }
          console.log('✅ Leaderboard new entry:', domain, score);
          res.json({ 
            success: true, 
            message: 'Added to leaderboard',
            improved: true
          });
        }
      );
    }
  });
});

// FIX #6: Opt-out endpoint (was 404)
app.post('/api/optout', (req, res) => {
  const { domain } = req.body;

  console.log('🚫 Opt-out request for domain:', domain);

  if (!domain) {
    return res.status(400).json({ 
      success: false, 
      error: 'Domain is required' 
    });
  }

  db.run(
    'UPDATE leaderboard SET opt_out = 1 WHERE domain = ?',
    [domain],
    function(err) {
      if (err) {
        console.error('Opt-out error:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Domain not found on leaderboard' 
        });
      }

      console.log('✅ Domain opted out:', domain);
      res.json({ 
        success: true, 
        message: 'Successfully opted out from leaderboard' 
      });
    }
  );
});

app.delete('/api/admin/leaderboard/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM leaderboard WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    res.json({ success: true });
  });
});

app.put('/api/admin/leaderboard/:id/opt-out', (req, res) => {
  const { id } = req.params;
  const { opt_out } = req.body;
  
  db.run(
    'UPDATE leaderboard SET opt_out = ? WHERE id = ?',
    [opt_out ? 1 : 0, id],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Entry not found' });
      }
      res.json({ success: true });
    }
  );
});

app.post('/api/claim-leaderboard', (req, res) => {
  const { domain, company, email } = req.body;

  if (!domain || !company || !email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Domain, company, and email required' 
    });
  }

  db.get('SELECT * FROM leaderboard WHERE domain = ?', [domain], (err, entry) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (!entry) {
      return res.status(404).json({ 
        success: false, 
        error: 'Domain not found on leaderboard' 
      });
    }

    db.run(
      'UPDATE leaderboard SET company = ? WHERE domain = ?',
      [company, domain],
      function(err) {
        if (err) {
          return res.status(500).json({ success: false, error: 'Database error' });
        }

        console.log('📧 Claim email should be sent to:', email, 'for domain:', domain);

        res.json({ 
          success: true, 
          message: 'Leaderboard entry claimed' 
        });
      }
    );
  });
});

// ============================================
// SCAN ENDPOINT - FIX #1 & #9
// ============================================

app.post('/api/scan', (req, res) => {
  const { url, shareToken, source } = req.body;

  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
  }

  const clientIP = getClientIP(req);
  const isLeadScanner = source === 'lead-scanner';

  console.log('🔍 Scan request:', { url, source, isLeadScanner, ip: clientIP });

  // Check daily limit (skip for share tokens)
  if (!shareToken) {
    const limitCheck = checkDailyScanLimit(clientIP, isLeadScanner);
    
    if (limitCheck.exceeded) {
      // FIX #1: Better daily limit message with WhatsApp, Calendly, and reset info
      const limit = isLeadScanner ? 10 : 3;
      const resetTime = new Date();
      resetTime.setHours(24, 0, 0, 0);
      
      return res.status(429).json({
        success: false,
        error: 'daily_limit_reached',
        message: `You've reached your daily limit of ${limit} free scans.`,
        details: {
          scansUsed: limitCheck.count,
          dailyLimit: limit,
          resetTime: resetTime.toISOString(),
          resetMessage: 'Your scan limit resets tomorrow at midnight UTC'
        },
        upgradeOptions: {
          whatsapp: {
            text: '💬 Chat with Ottmar on WhatsApp',
            url: 'https://wa.me/31628073996?text=Hi! I need more scans for my website',
            action: 'Get instant help'
          },
          calendly: {
            text: '📅 Book a free consultation',
            url: 'https://calendly.com/contentscale/consultation',
            action: 'Schedule 30-min call'
          },
          services: {
            text: '🚀 View all services & pricing',
            url: 'https://contentscale.site/services',
            action: 'See packages'
          }
        }
      });
    }
  }

  // Process share token if provided
  if (shareToken) {
    db.get(
      `SELECT * FROM share_links 
       WHERE token = ? AND is_active = 1 AND datetime(expires_at) > datetime('now')`,
      [shareToken],
      (err, link) => {
        if (err || !link) {
          return res.status(403).json({ 
            success: false, 
            error: 'Invalid or expired share link' 
          });
        }

        if (link.scans_used >= link.scans_limit) {
          return res.status(403).json({ 
            success: false, 
            error: 'Share link scan limit reached',
            contact: {
              whatsapp: 'https://wa.me/31628073996',
              calendly: 'https://calendly.com/contentscale/consultation'
            }
          });
        }

        db.run(
          'UPDATE share_links SET scans_used = scans_used + 1 WHERE token = ?',
          [shareToken]
        );

        performScan(url, res, clientIP, false, isLeadScanner);
      }
    );
  } else {
    // Regular scan
    incrementScanLimit(clientIP, isLeadScanner);
    performScan(url, res, clientIP, true, isLeadScanner);
  }
});

function performScan(url, res, clientIP, addToLeaderboard, isLeadScanner) {
  // Mock scoring
  const graaf_score = Math.floor(Math.random() * 50) + 1;
  const craft_score = Math.floor(Math.random() * 30) + 1;
  const technical_score = Math.floor(Math.random() * 20) + 1;
  const total_score = graaf_score + craft_score + technical_score;

  const result = {
    success: true,
    url,
    score: total_score,
    breakdown: {
      graaf: graaf_score,
      craft: craft_score,
      technical: technical_score
    },
    scansRemaining: addToLeaderboard ? (isLeadScanner ? 10 : 3) - checkDailyScanLimit(clientIP, isLeadScanner).count : null,
    timestamp: new Date().toISOString()
  };

  // Extract domain
  let domain = '';
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    domain = url.replace('www.', '').split('/')[0];
  }

  // Save to scan_history
  db.run(
    `INSERT INTO scan_history (url, domain, score, graaf_score, craft_score, technical_score, ip_address, scan_date) 
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [url, domain, total_score, graaf_score, craft_score, technical_score, clientIP],
    function(err) {
      if (err) console.error('Scan history save error:', err);
    }
  );

  // Auto-submit to leaderboard if good score
  if (addToLeaderboard && total_score >= 80) {
    db.run(
      `INSERT INTO leaderboard (domain, company, score, scan_date, updated_at)
       VALUES (?, 'Anonymous', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(domain) DO UPDATE SET 
         score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
         scan_date = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE scan_date END,
         updated_at = CURRENT_TIMESTAMP`,
      [domain, total_score]
    );
  }

  res.json(result);
}

// ============================================
// EMAIL NOTIFICATIONS - FIX #10
// ============================================

// FIX #10: Email notification endpoint
app.post('/api/admin/send-notification', (req, res) => {
  const { email, subject, message, type } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({
      success: false,
      error: 'Email, subject, and message required'
    });
  }

  // TODO: Implement with SendGrid/Mailgun/Nodemailer
  console.log('📧 EMAIL NOTIFICATION:', {
    to: email,
    subject,
    message,
    type: type || 'general'
  });

  // Mock success
  res.json({
    success: true,
    message: 'Email notification logged (not yet sent)',
    implementation: 'TODO: Configure SendGrid/Mailgun for production'
  });
});

app.post('/api/admin/send-batch-notification', (req, res) => {
  const { recipients, subject, message } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Recipients array required'
    });
  }

  console.log('📧 BATCH EMAIL:', {
    count: recipients.length,
    subject,
    message
  });

  res.json({
    success: true,
    sent: recipients.length,
    message: 'Batch emails logged (not yet sent)',
    implementation: 'TODO: Configure email service'
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🚀 CONTENTSCALE PLATFORM - ALL BUGS FIXED  ║
╠══════════════════════════════════════════════╣
║   Port: ${PORT}                             ║
║   Database: SQLite (contentscale.db)         ║
╠══════════════════════════════════════════════╣
║   FIXES COMPLETED:                           ║
║   ✅ #1  Daily limit message (WhatsApp)      ║
║   ✅ #2  Admin creation (field validation)   ║
║   ✅ #3  Agency creation (email validation)  ║
║   ✅ #4  All scans endpoint working          ║
║   ✅ #5  Share links create/delete fixed     ║
║   ✅ #6  Opt-out endpoint (was 404)          ║
║   ✅ #7  Leaderboard DISTINCT domains        ║
║   ✅ #9  Lead scanner separate limit (10/d)  ║
║   ✅ #10 Email notifications documented      ║
╠══════════════════════════════════════════════╣
║   Routes:                                    ║
║   📊 /admin              - Admin dashboard   ║
║   🔍 /scanner            - Content scanner   ║
║   📈 /lead-scanner       - Lead scanner      ║
║   🔗 /share/:token       - Share links       ║
╚══════════════════════════════════════════════╝
  `);
});
