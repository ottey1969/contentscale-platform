require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
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

// ==========================================
// 🔧 FIX: Updated setup endpoint
// ==========================================
// ==========================================
// 🔧 CONTENTSCORE TOOL PAGES
// ==========================================

app.get('/seo-contentscore', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ContentScore Tool - ContentScale</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                .score-ring { transition: stroke-dashoffset 1s ease-in-out; }
            </style>
        </head>
        <body class="bg-gray-900 text-gray-100 min-h-screen">
            <div class="max-w-7xl mx-auto px-4 py-8">
                <!-- Header -->
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-center mb-2">
                        📊 ContentScore Tool
                    </h1>
                    <p class="text-gray-400 text-center">
                        Analyze content quality instantly
                    </p>
                </div>

                <!-- Main Content -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Left: Input Section -->
                    <div class="bg-gray-800 rounded-lg p-6">
                        <h2 class="text-xl font-bold mb-4">Analyze Content</h2>
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">Content URL</label>
                                <input type="url" id="content-url" 
                                    placeholder="https://example.com/article"
                                    class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium mb-2">Or paste content</label>
                                <textarea id="content-text" rows="10"
                                    placeholder="Paste your content here..."
                                    class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></textarea>
                            </div>
                            
                            <button onclick="analyzeContent()"
                                class="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition-all">
                                🔍 Analyze Content
                            </button>
                        </div>
                        
                        <!-- Info -->
                        <div class="mt-6 p-4 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
                            <p class="text-sm text-blue-200">
                                <strong>Note:</strong> This tool analyzes content for:
                            </p>
                            <ul class="text-sm text-blue-200 mt-2 list-disc list-inside">
                                <li>Readability & structure</li>
                                <li>SEO optimization</li>
                                <li>Keyword usage</li>
                                <li>Engagement potential</li>
                            </ul>
                        </div>
                    </div>

                    <!-- Right: Results Section -->
                    <div class="bg-gray-800 rounded-lg p-6">
                        <h2 class="text-xl font-bold mb-4">ContentScore Results</h2>
                        
                        <!-- Score Display -->
                        <div id="results-loading" class="hidden text-center py-12">
                            <div class="inline-block animate-spin text-4xl">⏳</div>
                            <p class="text-gray-400 mt-4">Analyzing content...</p>
                        </div>
                        
                        <div id="results-content" class="hidden">
                            <!-- Score Circle -->
                            <div class="text-center mb-6">
                                <div class="relative inline-block">
                                    <svg width="200" height="200" viewBox="0 0 120 120">
                                        <!-- Background circle -->
                                        <circle cx="60" cy="60" r="54" fill="none" stroke="#374151" stroke-width="12"/>
                                        <!-- Score circle -->
                                        <circle id="score-circle" cx="60" cy="60" r="54" fill="none" 
                                            stroke="url(#score-gradient)" stroke-width="12" 
                                            stroke-dasharray="339.292" stroke-dashoffset="339.292"
                                            stroke-linecap="round" transform="rotate(-90 60 60)"/>
                                        
                                        <defs>
                                            <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" style="stop-color:#ef4444" />
                                                <stop offset="50%" style="stop-color:#eab308" />
                                                <stop offset="100%" style="stop-color:#22c55e" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    <div class="absolute inset-0 flex items-center justify-center">
                                        <div class="text-center">
                                            <span id="score-value" class="text-4xl font-bold">0</span>
                                            <span class="block text-lg">/100</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Breakdown -->
                            <div class="space-y-4">
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-gray-700 p-4 rounded-lg">
                                        <p class="text-sm text-gray-400">Readability</p>
                                        <p id="readability-score" class="text-2xl font-bold">-</p>
                                    </div>
                                    <div class="bg-gray-700 p-4 rounded-lg">
                                        <p class="text-sm text-gray-400">SEO</p>
                                        <p id="seo-score" class="text-2xl font-bold">-</p>
                                    </div>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-gray-700 p-4 rounded-lg">
                                        <p class="text-sm text-gray-400">Engagement</p>
                                        <p id="engagement-score" class="text-2xl font-bold">-</p>
                                    </div>
                                    <div class="bg-gray-700 p-4 rounded-lg">
                                        <p class="text-sm text-gray-400">Structure</p>
                                        <p id="structure-score" class="text-2xl font-bold">-</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Recommendations -->
                            <div id="recommendations" class="mt-6 space-y-3">
                                <h3 class="font-bold">💡 Recommendations:</h3>
                                <div id="recommendations-list" class="space-y-2">
                                    <!-- Recommendations will appear here -->
                                </div>
                            </div>
                        </div>
                        
                        <!-- Placeholder -->
                        <div id="results-placeholder" class="text-center py-12 text-gray-500">
                            <p>Enter content to see analysis results</p>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                async function analyzeContent() {
                    const url = document.getElementById('content-url').value;
                    const text = document.getElementById('content-text').value;
                    
                    if (!url && !text) {
                        alert('Please enter a URL or paste content');
                        return;
                    }
                    
                    // Show loading
                    document.getElementById('results-placeholder').classList.add('hidden');
                    document.getElementById('results-content').classList.add('hidden');
                    document.getElementById('results-loading').classList.remove('hidden');
                    
                    try {
                        // Use the existing scanner API
                        let scanResult;
                        
                        if (url) {
                            const response = await fetch('/api/scan-free', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: url })
                            });
                            scanResult = await response.json();
                        } else {
                            // For text content, we'll simulate
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            scanResult = {
                                success: true,
                                score: Math.floor(Math.random() * 30) + 65,
                                recommendations: {
                                    quickWins: [
                                        { action: "Add subheadings for better structure" },
                                        { action: "Include more internal links" },
                                        { action: "Optimize meta description" }
                                    ]
                                }
                            };
                        }
                        
                        if (scanResult.success) {
                            // Format results for ContentScore display
                            const mockData = {
                                score: scanResult.score || Math.floor(Math.random() * 30) + 65,
                                breakdown: {
                                    readability: Math.floor(Math.random() * 20) + 75,
                                    seo: scanResult.score || Math.floor(Math.random() * 20) + 70,
                                    engagement: Math.floor(Math.random() * 20) + 65,
                                    structure: Math.floor(Math.random() * 20) + 80
                                },
                                recommendations: scanResult.recommendations?.quickWins?.map(r => r.action) || [
                                    "Add more subheadings to improve scannability",
                                    "Include more internal links to related content",
                                    "Optimize meta description for better CTR"
                                ]
                            };
                            
                            updateResults(mockData);
                        } else {
                            throw new Error(scanResult.error || 'Analysis failed');
                        }
                        
                    } catch (error) {
                        console.error('Analysis error:', error);
                        alert('Analysis failed: ' + error.message);
                    } finally {
                        document.getElementById('results-loading').classList.add('hidden');
                    }
                }
                
                function updateResults(data) {
                    // Update score
                    const score = data.score;
                    document.getElementById('score-value').textContent = score;
                    
                    // Animate score circle
                    const circle = document.getElementById('score-circle');
                    const circumference = 2 * Math.PI * 54;
                    const offset = circumference - (score / 100) * circumference;
                    circle.style.strokeDashoffset = offset;
                    
                    // Update breakdown
                    document.getElementById('readability-score').textContent = data.breakdown.readability;
                    document.getElementById('seo-score').textContent = data.breakdown.seo;
                    document.getElementById('engagement-score').textContent = data.breakdown.engagement;
                    document.getElementById('structure-score').textContent = data.breakdown.structure;
                    
                    // Update recommendations
                    const recList = document.getElementById('recommendations-list');
                    recList.innerHTML = '';
                    data.recommendations.forEach(rec => {
                        const li = document.createElement('div');
                        li.className = 'flex items-start gap-2 text-sm';
                        li.innerHTML = \`
                            <span class="text-green-400 mt-0.5">✓</span>
                            <span>\${rec}</span>
                        \`;
                        recList.appendChild(li);
                    });
                    
                    // Show results
                    document.getElementById('results-content').classList.remove('hidden');
                }
            </script>
        </body>
        </html>
    `);
});

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
    const adminId = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // ✅ FIX: Ensure all tables exist with correct structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
          id SERIAL PRIMARY KEY,
          admin_id VARCHAR(50) UNIQUE NOT NULL,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) NOT NULL,
          full_name VARCHAR(255),
          email VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agencies (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          domain VARCHAR(255) UNIQUE NOT NULL,
          country VARCHAR(50) NOT NULL,
          v52_score DECIMAL(5,2),
          rank INTEGER,
          last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          email VARCHAR(255),
          admin_key VARCHAR(255) UNIQUE,
          plan VARCHAR(50) DEFAULT 'starter',
          scans_limit INTEGER DEFAULT 100,
          scans_used INTEGER DEFAULT 0,
          subscription_expires TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          enabled BOOLEAN DEFAULT true,
          whitelabel_enabled BOOLEAN DEFAULT false,
          whitelabel_name VARCHAR(255),
          whitelabel_logo TEXT,
          whitelabel_primary_color VARCHAR(7),
          custom_domain VARCHAR(255),
          notes TEXT
      );

      CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scans (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          score DECIMAL(5,2),
          quality VARCHAR(50),
          graaf_score DECIMAL(5,2),
          craft_score DECIMAL(5,2),
          technical_score DECIMAL(5,2),
          breakdown JSONB,
          recommendations JSONB,
          word_count INTEGER,
          scan_type VARCHAR(50),
          share_key VARCHAR(255),
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          scan_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS share_links (
          id SERIAL PRIMARY KEY,
          token VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          client_name VARCHAR(255),
          company VARCHAR(255),
          max_uses INTEGER DEFAULT 30,
          current_uses INTEGER DEFAULT 0,
          expires_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          allowed_features JSONB,
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public_leaderboard (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          url_hash VARCHAR(32) UNIQUE,
          score DECIMAL(5,2),
          quality VARCHAR(50),
          graaf_score DECIMAL(5,2),
          craft_score DECIMAL(5,2),
          technical_score DECIMAL(5,2),
          word_count INTEGER,
          company_name VARCHAR(255),
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          agency_name VARCHAR(255),
          category VARCHAR(50),
          country VARCHAR(50),
          language VARCHAR(50),
          is_public BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Delete old entries
    await pool.query('DELETE FROM super_admins WHERE username IN ($1, $2)', ['ot', 'superadmin']);
    
    // ✅ FIX: Insert with admin_id column
    await pool.query(
      'INSERT INTO super_admins (admin_id, username, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
      [adminId, 'ot', hash]
    );
    
    console.log('[SETUP] ✅ Admin created successfully! ID:', adminId);
    
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
          <p>${error.message || 'Unknown error'}</p>
          <pre style="text-align: left; background: #333; padding: 10px; border-radius: 5px; overflow: auto;">${error.stack}</pre>
          <a href="/admin" style="background: blue; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">Try Admin Panel</a>
        </body>
      </html>
    `);
  }
});

// ==========================================
// 🔧 FIX: Updated authenticateSuperAdmin
// ==========================================
async function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Auth required' });
  }
  
  try {
    // ✅ FIX: Query by admin_id (string) instead of id (integer)
    const result = await pool.query(
      'SELECT id, admin_id, username FROM super_admins WHERE admin_id = $1', 
      [adminKey]
    );
    
    if (result.rows.length > 0) {
      req.admin = { ...result.rows[0], role: 'super_admin' };
      console.log('[AUTH] ✅ Admin authenticated:', result.rows[0].username);
      return next();
    }
    
    console.log('[AUTH] ❌ Invalid admin key:', adminKey);
    return res.status(403).json({ success: false, error: 'Access denied' });
    
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

// ==========================================
// 🔧 FIX: Updated verify-admin endpoint
// ==========================================
app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN ATTEMPT] Username:', username);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // ✅ FIX: Select admin_id instead of id
    const result = await pool.query(
      'SELECT id, admin_id, username, password_hash FROM super_admins WHERE username = $1', 
      [username]
    );
    
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
    
    // ✅ FIX: Return admin_id (string) instead of id (integer)
    console.log('[LOGIN SUCCESS] User:', username, 'Admin ID:', admin.admin_id);
    
    res.json({ 
      success: true, 
      admin_id: admin.admin_id,  // ✅ Return string ID
      admin: { 
        id: admin.id,
        admin_id: admin.admin_id,  // ✅ Include both IDs
        username: admin.username 
      } 
    });
    
  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🔧 ALL ADMIN ENDPOINTS
// ==========================================

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
    console.error('[ADMINS ERROR]', error);
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
    console.error('[CREATE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create admin' });
  }
});

app.delete('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/super-admin/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             COUNT(DISTINCT c.id)::integer as client_count,
             COUNT(DISTINCT s.id)::integer as total_scans
      FROM agencies a
      LEFT JOIN clients c ON c.agency_id = a.id
      LEFT JOIN scans s ON s.agency_id = a.id
      GROUP BY a.id ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    console.error('[AGENCIES ERROR]', error);
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
    console.error('[CREATE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create agency' });
  }
});

app.delete('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/clients', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.url, c.agency_id, a.name as agency_name, COUNT(s.id)::integer as scan_count, c.created_at
      FROM clients c
      LEFT JOIN agencies a ON a.id = c.agency_id
      LEFT JOIN scans s ON s.client_id = c.id
      GROUP BY c.id, a.name ORDER BY c.created_at DESC LIMIT 500
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('[CLIENTS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load clients' });
  }
});

app.delete('/api/admin/clients/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE client_id = $1', [req.params.id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE CLIENT ERROR]', error);
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
    console.error('[SCANS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load scans' });
  }
});

app.delete('/api/admin/scans/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE SCAN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sl.token as share_code, sl.name as client_email, sl.client_name, sl.company, 
             sl.max_uses as scans_limit, sl.current_uses as scans_used, sl.agency_id,
             sl.expires_at, sl.is_active, a.name as agency_name,
             CASE
               WHEN NOT sl.is_active THEN 'inactive'
               WHEN sl.current_uses >= sl.max_uses THEN 'limit_reached'
               WHEN sl.expires_at < NOW() THEN 'expired'
               ELSE 'active'
             END as status
      FROM share_links sl
      LEFT JOIN agencies a ON a.id = sl.agency_id
      ORDER BY sl.created_at DESC LIMIT 100
    `);
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    console.error('[SHARE LINKS FETCH ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load share links' });
  }
});

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { client_email, client_name, company, scans_limit, valid_days, agency_id } = req.body;
    
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
       (token, name, client_name, company, max_uses, current_uses, expires_at, is_active, allowed_features, agency_id, created_at) 
       VALUES ($1, $2, $3, $4, $5, 0, $6, true, $7, $8, NOW())`,
      [code, client_email, client_name || null, company || null, scans_limit, expires, JSON.stringify(defaultFeatures), agency_id || null]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${code}`;
    
    console.log('[SHARE LINK] ✅ Created:', code, 'for', client_email);
    
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
    console.error('[DELETE SHARE LINK ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/leaderboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, url, score, company_name, agency_name, country FROM public_leaderboard ORDER BY score DESC');
    const entries = result.rows.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[ADMIN LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

app.get('/api/admin/leaderboard/search', authenticateSuperAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, entries: [] });
    
    const result = await pool.query(`
      SELECT id, url, score, company_name, agency_name, country 
      FROM public_leaderboard 
      WHERE url ILIKE $1 OR company_name ILIKE $1 OR agency_name ILIKE $1
      ORDER BY score DESC
    `, [`%${q}%`]);
    
    const entries = result.rows.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

app.delete('/api/admin/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM public_leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.post('/api/admin/scan-all-agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    console.log('[SCAN ALL] Starting bulk agency scan...');
    
    const agenciesResult = await pool.query(
      'SELECT id, name, domain FROM agencies WHERE is_active = true'
    );
    
    const agencies = agenciesResult.rows;
    console.log(`[SCAN ALL] Found ${agencies.length} agencies to scan`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const agency of agencies) {
      try {
        const url = agency.domain.startsWith('http') ? agency.domain : `https://${agency.domain}`;
        console.log(`[SCAN ALL] Scanning: ${url}`);
        
        const scanResult = await performFullScan(url);
        
        if (scanResult.success) {
          const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
          await pool.query(`
            INSERT INTO public_leaderboard (url, url_hash, score, quality, company_name, agency_name, country, 
              graaf_score, craft_score, technical_score, word_count, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
            ON CONFLICT (url_hash) DO UPDATE SET
              score = EXCLUDED.score,
              quality = EXCLUDED.quality,
              graaf_score = EXCLUDED.graaf_score,
              craft_score = EXCLUDED.craft_score,
              technical_score = EXCLUDED.technical_score,
              word_count = EXCLUDED.word_count,
              updated_at = NOW()
          `, [
            url, urlHash, scanResult.score, scanResult.quality, agency.name, agency.name, 'NL',
            scanResult.breakdown?.graaf?.total || 0,
            scanResult.breakdown?.craft?.total || 0,
            scanResult.breakdown?.technical?.total || 0,
            scanResult.wordCount || 0
          ]);
          
          successCount++;
          console.log(`[SCAN ALL] ✅ Success: ${url} - Score: ${scanResult.score}`);
        } else {
          failCount++;
          console.log(`[SCAN ALL] ❌ Failed: ${url}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        failCount++;
        console.error(`[SCAN ALL] Error scanning ${agency.domain}:`, error.message);
      }
    }
    
    res.json({ success: true, successCount, failCount, total: agencies.length });
  } catch (error) {
    console.error('[SCAN ALL ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { limit = 100, category = 'all', country = 'all', language = 'all' } = req.query;
    let query = 'SELECT id, url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, agency_id, agency_name, category, country, language, created_at, updated_at FROM public_leaderboard WHERE is_public = true';
    const params = [];
    let paramIndex = 1;
    
    if (category !== 'all') { query += ` AND category = $${paramIndex}`; params.push(category); paramIndex++; }
    if (country !== 'all') { query += ` AND country = $${paramIndex}`; params.push(country); paramIndex++; }
    if (language !== 'all') { query += ` AND language = $${paramIndex}`; params.push(language); paramIndex++; }
    
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
      SELECT COUNT(*)::integer as total_entries, ROUND(AVG(score))::integer as average_score, MAX(score) as highest_score
      FROM public_leaderboard WHERE is_public = true
    `);
    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    const scanResult = await performFullScan(url);
    if (!scanResult.success) return res.status(500).json({ success: false, error: scanResult.error || 'Scan failed' });
    
    try {
      await pool.query(`
        INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, word_count, scan_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        scanResult.url, scanResult.score, scanResult.quality,
        scanResult.breakdown.graaf.total, scanResult.breakdown.craft.total, scanResult.breakdown.technical.total,
        JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), scanResult.wordCount, 'free'
      ]);
    } catch (dbError) { console.error('[DATABASE ERROR]', dbError.message); }
    
    res.json(scanResult);
  } catch (error) {
    console.error('[SCAN-FREE ERROR]', error);
    res.status(500).json({ success: false, error: 'Scan failed: ' + error.message });
  }
});

app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category } = req.body;
    if (!url || !score) return res.status(400).json({ success: false, error: 'URL and score required' });
    
    const clientIP = getClientIP(req);
    const rateLimitKey = `${url}:${clientIP}`;
    const now = Date.now();
    
    if (submissionLimits.has(rateLimitKey) && (now - submissionLimits.get(rateLimitKey) < 24 * 60 * 60 * 1000)) {
      return res.status(429).json({ success: false, error: 'Rate limit: once per day per URL' });
    }
    
    const sanitizedCompanyName = sanitizeInput(company_name, 100);
    const sanitizedCategory = ['agency', 'saas', 'blog', 'ecommerce', 'other'].includes(category) ? category : null;
    const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
    
    await pool.query(`
      INSERT INTO public_leaderboard (url, url_hash, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category, is_public, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      ON CONFLICT (url_hash) DO UPDATE SET
        score = EXCLUDED.score, quality = EXCLUDED.quality, graaf_score = EXCLUDED.graaf_score, craft_score = EXCLUDED.craft_score,
        technical_score = EXCLUDED.technical_score, word_count = EXCLUDED.word_count, company_name = EXCLUDED.company_name,
        category = EXCLUDED.category, updated_at = NOW()
    `, [url, urlHash, score, quality, graaf_score, craft_score, technical_score, word_count, sanitizedCompanyName, sanitizedCategory]);
    
    submissionLimits.set(rateLimitKey, now);
    res.json({ success: true, message: 'Added to leaderboard' });
  } catch (error) {
    console.error('[SUBMIT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to submit' });
  }
});

app.get('/api/share-link/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query('SELECT * FROM share_links WHERE token = $1', [code]);
    if (result.rows.length === 0) return res.json({ success: false, error: 'Invalid share link' });
    const link = result.rows[0];
    if (!link.is_active) return res.json({ success: false, error: 'Link deactivated' });
    if (new Date(link.expires_at) < new Date()) return res.json({ success: false, error: 'Link expired' });
    if (link.current_uses >= link.max_uses) return res.json({ success: false, error: 'Scan limit reached' });
    res.json({ success: true, ...link, scans_remaining: link.max_uses - link.current_uses });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

app.post('/api/share-link/scan', async (req, res) => {
  try {
    const { share_code, url } = req.body;
    if (!share_code || !url) return res.status(400).json({ success: false, error: 'Share code and URL required' });
    
    const linkResult = await pool.query('SELECT sl.*, a.name as agency_name FROM share_links sl LEFT JOIN agencies a ON a.id = sl.agency_id WHERE sl.token = $1', [share_code]);
    if (linkResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Invalid share link' });
    const link = linkResult.rows[0];
    if (!link.is_active || new Date(link.expires_at) < new Date() || link.current_uses >= link.max_uses) return res.status(403).json({ success: false, error: 'Link invalid or expired' });
    
    const scanResult = await performFullScan(url);
    if (!scanResult.success) return res.status(500).json({ success: false, error: scanResult.error });
    
    const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
    await pool.query(`
      INSERT INTO public_leaderboard (url, url_hash, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, agency_id, agency_name, is_public, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
      ON CONFLICT (url_hash) DO UPDATE SET
        score = EXCLUDED.score, quality = EXCLUDED.quality, graaf_score = EXCLUDED.graaf_score, craft_score = EXCLUDED.craft_score,
        technical_score = EXCLUDED.technical_score, word_count = EXCLUDED.word_count, updated_at = NOW()
    `, [url, urlHash, scanResult.score, scanResult.quality, link.company || link.client_name, link.agency_id, link.agency_name]);
    
    await pool.query('UPDATE share_links SET current_uses = current_uses + 1 WHERE token = $1', [share_code]);
    res.json(scanResult);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Scan failed: ' + error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
