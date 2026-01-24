const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log(`✅ Database connected at ${res.rows[0].now}`);
    console.log(`🚀 Server starting on port ${PORT}`);
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/js', express.static(path.join(__dirname, '../js')));

// ============================================
// SIMPLE BUT WORKING SCAN FUNCTION
// ============================================
async function performScan(url, res, clientIP, addToLeaderboard, isLeadScanner) {
  try {
    console.log(`🔍 Starting scan for: ${url}`);
    
    // Fetch HTML
    const https = require('https');
    const http = require('http');
    
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    let htmlContent = '';
    
    try {
      htmlContent = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error('Timeout'));
        }, 15000);
        
        const req = protocol.get(url, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            clearTimeout(timeout);
            resolve(data);
          });
        });
        
        req.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      console.log(`✅ HTML fetched: ${htmlContent.length} bytes`);
      
    } catch (fetchError) {
      console.error(`❌ HTML fetch failed:`, fetchError.message);
      // Continue with empty HTML - we'll use fallback scoring
    }
    
    // Extract text (remove tags)
    const textContent = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`📝 Word count: ${wordCount}`);
    
    // ============================================
    // GRAAF SCORING (50 points) - SIMPLIFIED
    // ============================================
    let graaf_score = 0;
    
    // Credibility (10 pts) - Look for quotes and author
    const hasQuotes = textContent.match(/[""].*?[""]/g) || [];
    const hasNames = textContent.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
    graaf_score += Math.min(hasQuotes.length * 0.5, 4); // Up to 4 pts
    graaf_score += Math.min(hasNames.length * 0.2, 3);  // Up to 3 pts
    graaf_score += (htmlContent.includes('author') || htmlContent.includes('Author')) ? 3 : 0;
    
    // Relevance (10 pts) - Title, H1, meta
    const hasTitle = /<title/i.test(htmlContent);
    const hasH1 = /<h1/i.test(htmlContent);
    const hasMeta = /<meta.*description/i.test(htmlContent);
    graaf_score += hasTitle ? 4 : 0;
    graaf_score += hasH1 ? 3 : 0;
    graaf_score += hasMeta ? 3 : 0;
    
    // Actionability (10 pts) - Steps, CTAs
    const hasSteps = /step|how to|guide/gi.test(textContent);
    const hasButtons = /<button|<a.*href/gi.test(htmlContent);
    const hasList = /<ul>|<ol>/i.test(htmlContent);
    graaf_score += hasSteps ? 4 : 0;
    graaf_score += hasButtons ? 3 : 0;
    graaf_score += hasList ? 3 : 0;
    
    // Accuracy (10 pts) - Word count and structure
    graaf_score += Math.min(wordCount / 350, 5); // Max 5 pts at 1750 words
    graaf_score += (htmlContent.match(/<h[2-6]/gi) || []).length >= 3 ? 5 : 2;
    
    // Freshness (10 pts) - Year detection
    const currentYear = new Date().getFullYear();
    const hasCurrentYear = textContent.includes(currentYear.toString());
    const hasDate = /<time|published|updated/i.test(htmlContent);
    graaf_score += hasCurrentYear ? 6 : 0;
    graaf_score += hasDate ? 4 : 0;
    
    // Cap GRAAF at 50
    graaf_score = Math.min(Math.round(graaf_score), 50);
    
    // ============================================
    // CRAFT SCORING (30 points) - SIMPLIFIED
    // ============================================
    let craft_score = 0;
    
    // Clarity (10 pts) - Paragraphs and sentences
    const paragraphs = (htmlContent.match(/<p>/gi) || []).length;
    craft_score += Math.min(paragraphs * 0.5, 5);
    craft_score += wordCount > 500 ? 5 : Math.min(wordCount / 100, 5);
    
    // Readability (10 pts) - Lists and formatting
    const bullets = (htmlContent.match(/<li>/gi) || []).length;
    craft_score += Math.min(bullets * 0.3, 5);
    craft_score += (htmlContent.match(/<h[2-6]/gi) || []).length >= 3 ? 5 : 2;
    
    // Format (10 pts) - Images and tables
    const images = (htmlContent.match(/<img/gi) || []).length;
    const tables = (htmlContent.match(/<table/gi) || []).length;
    craft_score += Math.min(images * 0.8, 5);
    craft_score += Math.min(tables * 2, 5);
    
    // Cap CRAFT at 30
    craft_score = Math.min(Math.round(craft_score), 30);
    
    // ============================================
    // TECHNICAL SCORING (20 points) - SIMPLIFIED
    // ============================================
    let technical_score = 0;
    
    // Meta tags (5 pts)
    technical_score += /<meta.*viewport/i.test(htmlContent) ? 2 : 0;
    technical_score += /<meta.*description/i.test(htmlContent) ? 2 : 0;
    technical_score += /<meta.*og:/i.test(htmlContent) ? 1 : 0;
    
    // Schema (5 pts)
    technical_score += /"@type"/i.test(htmlContent) ? 3 : 0;
    technical_score += /application\/ld\+json/i.test(htmlContent) ? 2 : 0;
    
    // Links (5 pts)
    const links = (htmlContent.match(/href=/gi) || []).length;
    technical_score += Math.min(links / 5, 5);
    
    // Headings (5 pts)
    const h1Count = (htmlContent.match(/<h1/gi) || []).length;
    const h2Count = (htmlContent.match(/<h2/gi) || []).length;
    technical_score += h1Count === 1 ? 3 : 0;
    technical_score += h2Count >= 3 ? 2 : 0;
    
    // Cap Technical at 20
    technical_score = Math.min(Math.round(technical_score), 20);
    
    // ============================================
    // CALCULATE TOTAL
    // ============================================
    const overall_score = Math.min(graaf_score + craft_score + technical_score, 100);
    
    // Determine quality
    let quality;
    if (overall_score >= 90) quality = 'excellent';
    else if (overall_score >= 75) quality = 'good';
    else if (overall_score >= 60) quality = 'average';
    else if (overall_score >= 40) quality = 'poor';
    else quality = 'very_poor';
    
    console.log(`✅ Score calculated: ${overall_score}/100 (GRAAF:${graaf_score} CRAFT:${craft_score} Tech:${technical_score})`);
    
    // Extract domain info
    const domain = urlObj.hostname.replace('www.', '');
    const companyName = domain
      .replace(/\.(com|net|org|nl|be|de|uk)$/, '')
      .split('.').pop()
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    
    const scanResult = {
      success: true,
      score: overall_score,
      quality: quality,
      url: url,
      domain: domain,
      company_name: companyName,
      scanned_at: new Date().toISOString(),
      breakdown: {
        graaf: {
          total: graaf_score,
          percentage: Math.round((graaf_score / 50) * 100)
        },
        craft: {
          total: craft_score,
          percentage: Math.round((craft_score / 30) * 100)
        },
        technical: {
          total: technical_score,
          percentage: Math.round((technical_score / 20) * 100)
        }
      },
      metrics: {
        word_count: wordCount,
        images: images,
        links: links
      }
    };
    
    // Add to leaderboard if requested
    if (addToLeaderboard && overall_score >= 50) {
      try {
        await pool.query(
          `INSERT INTO leaderboard (url, domain, company_name, score, country, scanned_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (domain) 
           DO UPDATE SET score = EXCLUDED.score, scanned_at = EXCLUDED.scanned_at`,
          [url, domain, companyName, overall_score, 'netherlands', new Date()]
        );
        console.log('✅ Added to leaderboard');
      } catch (dbError) {
        console.error('⚠️ Leaderboard error:', dbError.message);
      }
    }
    
    return scanResult;
    
  } catch (error) {
    console.error('❌ Scan error:', error);
    return {
      success: false,
      error: error.message,
      score: 0,
      quality: 'error'
    };
  }
}

// ============================================
// PUBLIC ENDPOINTS
// ============================================
app.post('/api/scan', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const result = await performScan(url, res, clientIP, false, false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const result = await performScan(url, res, clientIP, true, false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scan-agency', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const result = await performScan(url, res, clientIP, true, false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard ORDER BY score DESC LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/leaderboard/:country', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard WHERE LOWER(country) = LOWER($1) ORDER BY score DESC LIMIT 100
    `, [req.params.country]);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================
app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admins', async (req, res) => {
  try {
    const { username, password, role, full_name, email } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }
    const result = await pool.query(
      'INSERT INTO super_admins (username, password, role, full_name, email) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, password, role, full_name, email]
    );
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND password = $2',
      [username, password]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, admin_id: result.rows[0].id, admin: result.rows[0] });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/super-admin/agencies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agencies ORDER BY created_at DESC');
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/scans', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scans ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/share-links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM share_links ORDER BY created_at DESC');
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/share-links/create', async (req, res) => {
  try {
    const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
    const share_code = Math.random().toString(36).substring(2, 15);
    const expires_at = new Date(Date.now() + (valid_days || 30) * 24 * 60 * 60 * 1000);
    
    const result = await pool.query(
      'INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [share_code, client_email, client_name, client_company || '', scans_limit || 5, expires_at]
    );
    
    const share_url = `${req.protocol}://${req.get('host')}/seo-contentscore?key=${share_code}`;
    res.json({ success: true, share_url, share_link: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/share-links/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE share_code = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard ORDER BY score DESC LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const agencies = await pool.query('SELECT COUNT(*) FROM agencies');
    const clients = await pool.query('SELECT COUNT(*) FROM clients');
    const scans = await pool.query('SELECT COUNT(*) FROM scans');
    const helpers = await pool.query('SELECT COUNT(*) FROM super_admins WHERE role = $1', ['helper']);
    
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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/claims/pending', async (req, res) => {
  res.json({ success: true, claims: [] });
});

app.delete('/api/:resource/:id', async (req, res) => {
  try {
    const { resource, id } = req.params;
    const tableMap = {
      'admins': 'super_admins',
      'agencies': 'agencies',
      'clients': 'clients',
      'scans': 'scans',
      'leaderboard': 'leaderboard'
    };
    
    const table = tableMap[resource];
    if (!table) return res.status(400).json({ success: false, error: 'Invalid resource' });
    
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      timestamp: result.rows[0].now,
      port: PORT,
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// ============================================
// SERVE HTML
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/seo-contentscore.html'));
});

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path
  });
});

// ============================================
// START
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
