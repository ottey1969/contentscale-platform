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
// PERFORM SCAN FUNCTION - FIXED VERSION
// ============================================

async function performScan(url, res, clientIP, addToLeaderboard, isLeadScanner) {
  try {
    console.log(`🔍 Scanning: ${url}`);
    
    // Fetch HTML content
    const https = require('https');
    const http = require('http');
    
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const htmlContent = await new Promise((resolve, reject) => {
      const req = protocol.get(url, { timeout: 10000 }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });

    // Extract text content (remove HTML tags)
    const textContent = htmlContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                   .replace(/<[^>]+>/g, ' ')
                                   .replace(/\s+/g, ' ')
                                   .trim();
    
    const wordCount = textContent.split(/\s+/).length;
    
    // ============================================
    // GRAAF FRAMEWORK (50 points)
    // ============================================
    let graaf_score = 0;
    let graaf_details = {
      credibility: 0,
      relevance: 0,
      actionability: 0,
      accuracy: 0,
      freshness: 0
    };
    
    // G - GENUINELY CREDIBLE (10 points)
    // Expert quotes with attribution
    const quotePattern = /["""]\s*([^"""]{20,200})\s*["""]\s*[—–-]\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/g;
    const expertQuotes = (textContent.match(quotePattern) || []).length;
    
    // Statistics with sources
    const statsPattern = /\d+%|\d+\s*of\s*\d+|\d+\s+percent|According to [A-Z][a-z]+|Source:|Study:/gi;
    const statistics = (textContent.match(statsPattern) || []).length;
    
    // Author bio and credentials
    const hasAuthor = /author|written by|by [A-Z][a-z]+\s+[A-Z][a-z]+/i.test(htmlContent);
    const hasCredentials = /\d+\s*years?\s*(?:of\s*)?experience|certified|founder|ceo|expert/i.test(textContent);
    
    graaf_details.credibility = Math.min(
      (expertQuotes >= 10 ? 4 : expertQuotes * 0.4) +
      (statistics >= 50 ? 3 : statistics * 0.06) +
      (hasAuthor ? 2 : 0) +
      (hasCredentials ? 1 : 0),
      10
    );
    graaf_score += graaf_details.credibility;
    
    // R - RELEVANCE (10 points)
    const title = (htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
    const h1 = (htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || '';
    const metaDesc = (htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    
    const hasTitleKeyword = title.length > 10;
    const hasH1 = h1.length > 10;
    const hasMetaDesc = metaDesc.length > 50;
    const hasTableOfContents = /table of contents|toc|in this article|on this page/i.test(htmlContent);
    
    graaf_details.relevance = Math.min(
      (hasTitleKeyword ? 3 : 0) +
      (hasH1 ? 3 : 0) +
      (hasMetaDesc ? 2 : 0) +
      (hasTableOfContents ? 2 : 0),
      10
    );
    graaf_score += graaf_details.relevance;
    
    // A - ACTIONABILITY (10 points)
    const stepByStepPattern = /step \d|how to|tutorial|guide|instructions|checklist/gi;
    const actionableSteps = (textContent.match(stepByStepPattern) || []).length;
    
    const hasCTA = /download|subscribe|get started|sign up|contact us|learn more|try now/gi.test(htmlContent);
    const hasExamples = /example|case study|for instance|such as/gi.test(textContent);
    const hasList = (htmlContent.match(/<[ou]l>/gi) || []).length;
    
    graaf_details.actionability = Math.min(
      (actionableSteps >= 5 ? 4 : actionableSteps * 0.8) +
      (hasCTA ? 2 : 0) +
      (hasExamples ? 2 : 0) +
      (hasList >= 3 ? 2 : hasList * 0.67),
      10
    );
    graaf_score += graaf_details.actionability;
    
    // A - ACCURACY (10 points)
    const hasReferences = /reference|source|citation|study|research|according to/gi.test(textContent);
    const hasData = /data|research|study|survey|report|analysis/gi.test(textContent);
    const wordCountScore = Math.min(wordCount / 350, 5); // Max 5 points for 1750+ words
    
    graaf_details.accuracy = Math.min(
      wordCountScore +
      (hasReferences ? 3 : 0) +
      (hasData ? 2 : 0),
      10
    );
    graaf_score += graaf_details.accuracy;
    
    // F - FRESHNESS (10 points)
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    const hasCurrentYear = new RegExp(`\\b${currentYear}\\b`).test(textContent);
    const hasRecentYear = new RegExp(`\\b${lastYear}\\b`).test(textContent);
    const hasPublishDate = /<time|published|updated|modified/i.test(htmlContent);
    const hasMonthYear = /january|february|march|april|may|june|july|august|september|october|november|december\s+\d{4}/i.test(textContent);
    
    graaf_details.freshness = Math.min(
      (hasCurrentYear ? 5 : hasRecentYear ? 3 : 0) +
      (hasPublishDate ? 3 : 0) +
      (hasMonthYear ? 2 : 0),
      10
    );
    graaf_score += graaf_details.freshness;
    
    // ============================================
    // CRAFT FRAMEWORK (30 points)
    // ============================================
    let craft_score = 0;
    let craft_details = {
      clarity: 0,
      readability: 0,
      format: 0,
      faq: 0,
      trust: 0
    };
    
    // C - CLARITY (7 points)
    const sentenceCount = (textContent.match(/[.!?]+/g) || []).length;
    const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);
    const goodSentenceLength = avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20;
    
    const hasParagraphs = (htmlContent.match(/<p[^>]*>/gi) || []).length;
    const hasSubheadings = (htmlContent.match(/<h[2-6][^>]*>/gi) || []).length;
    
    craft_details.clarity = Math.min(
      (goodSentenceLength ? 3 : 0) +
      (hasParagraphs >= 5 ? 2 : hasParagraphs * 0.4) +
      (hasSubheadings >= 5 ? 2 : hasSubheadings * 0.4),
      7
    );
    craft_score += craft_details.clarity;
    
    // R - READABILITY (8 points)
    const shortParagraphs = hasParagraphs >= 8;
    const bulletPoints = (htmlContent.match(/<li[^>]*>/gi) || []).length;
    const hasWhitespace = htmlContent.includes('<br>') || htmlContent.includes('margin') || htmlContent.includes('padding');
    
    craft_details.readability = Math.min(
      (shortParagraphs ? 3 : 0) +
      (bulletPoints >= 10 ? 3 : bulletPoints * 0.3) +
      (hasWhitespace ? 2 : 0),
      8
    );
    craft_score += craft_details.readability;
    
    // A - ADD VISUALS & FORMAT (6 points)
    const images = (htmlContent.match(/<img[^>]*>/gi) || []).length;
    const hasAltText = /<img[^>]*alt=["'][^"']+["']/i.test(htmlContent);
    const tables = (htmlContent.match(/<table[^>]*>/gi) || []).length;
    
    craft_details.format = Math.min(
      (images >= 5 ? 3 : images * 0.6) +
      (hasAltText ? 2 : 0) +
      (tables >= 2 ? 1 : tables * 0.5),
      6
    );
    craft_score += craft_details.format;
    
    // F - FAQ INTEGRATION (5 points)
    const hasFAQ = /faq|frequently asked questions|questions and answers/i.test(htmlContent);
    const questionCount = (htmlContent.match(/<h[2-6][^>]*>[^<]*\?[^<]*<\/h[2-6]>/gi) || []).length;
    
    craft_details.faq = Math.min(
      (hasFAQ ? 3 : 0) +
      (questionCount >= 10 ? 2 : questionCount * 0.2),
      5
    );
    craft_score += craft_details.faq;
    
    // T - TRUST BUILDING (4 points)
    const hasHTTPS = url.startsWith('https');
    const hasContactInfo = /contact|email|phone|address/i.test(htmlContent);
    const hasPrivacyPolicy = /privacy policy|terms|gdpr/i.test(htmlContent);
    
    craft_details.trust = Math.min(
      (hasHTTPS ? 2 : 0) +
      (hasContactInfo ? 1 : 0) +
      (hasPrivacyPolicy ? 1 : 0),
      4
    );
    craft_score += craft_details.trust;
    
    // ============================================
    // TECHNICAL SEO (20 points)
    // ============================================
    let technical_score = 0;
    let technical_details = {
      meta: 0,
      schema: 0,
      links: 0,
      headings: 0,
      mobile: 0
    };
    
    // Meta tags (4 points)
    const hasMetaViewport = /<meta[^>]*name=["']viewport["']/i.test(htmlContent);
    const hasMetaDescription = metaDesc.length >= 120 && metaDesc.length <= 160;
    const hasOGTags = /<meta[^>]*property=["']og:/i.test(htmlContent);
    
    technical_details.meta = Math.min(
      (hasMetaViewport ? 2 : 0) +
      (hasMetaDescription ? 1 : 0) +
      (hasOGTags ? 1 : 0),
      4
    );
    technical_score += technical_details.meta;
    
    // Schema markup (4 points)
    const hasJSONLD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(htmlContent);
    const schemaTypes = (htmlContent.match(/"@type"\s*:\s*"(\w+)"/gi) || []).length;
    
    technical_details.schema = Math.min(
      (hasJSONLD ? 2 : 0) +
      (schemaTypes >= 2 ? 2 : schemaTypes),
      4
    );
    technical_score += technical_details.schema;
    
    // Internal linking (4 points)
    const domain = urlObj.hostname.replace('www.', '');
    const internalLinkPattern = new RegExp(`href=["'](?:https?:\\/\\/${domain.replace('.', '\\.')}|\\/)[^"']*["']`, 'gi');
    const internalLinks = (htmlContent.match(internalLinkPattern) || []).length;
    
    technical_details.links = Math.min(internalLinks / 5, 4);
    technical_score += technical_details.links;
    
    // Heading hierarchy (4 points)
    const hasH1Tag = /<h1[^>]*>/i.test(htmlContent);
    const h1Count = (htmlContent.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (htmlContent.match(/<h2[^>]*>/gi) || []).length;
    const properH1 = hasH1Tag && h1Count === 1;
    
    technical_details.headings = Math.min(
      (properH1 ? 2 : 0) +
      (h2Count >= 5 ? 2 : h2Count * 0.4),
      4
    );
    technical_score += technical_details.headings;
    
    // Mobile optimization (4 points)
    const responsiveViewport = /<meta[^>]*name=["']viewport["'][^>]*width=device-width/i.test(htmlContent);
    const hasMediaQueries = /@media[^{]*\([^)]*\)/i.test(htmlContent);
    const lazyLoading = /loading=["']lazy["']/i.test(htmlContent);
    
    technical_details.mobile = Math.min(
      (responsiveViewport ? 2 : 0) +
      (hasMediaQueries ? 1 : 0) +
      (lazyLoading ? 1 : 0),
      4
    );
    technical_score += technical_details.mobile;
    
    // ============================================
    // CALCULATE FINAL SCORE
    // ============================================
    const overall_score = Math.min(Math.round(graaf_score + craft_score + technical_score), 100);
    
    // Determine quality
    let quality;
    if (overall_score >= 90) quality = 'excellent';
    else if (overall_score >= 75) quality = 'good';
    else if (overall_score >= 60) quality = 'average';
    else if (overall_score >= 40) quality = 'poor';
    else quality = 'very_poor';
    
    // Extract company name from domain
    const companyName = domain
      .replace(/\.(com|net|org|nl|be|de|uk)$/, '')
      .split('.')
      .slice(-1)[0]
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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
          total: Math.round(graaf_score),
          credibility: Math.round(graaf_details.credibility * 10) / 10,
          relevance: Math.round(graaf_details.relevance * 10) / 10,
          actionability: Math.round(graaf_details.actionability * 10) / 10,
          accuracy: Math.round(graaf_details.accuracy * 10) / 10,
          freshness: Math.round(graaf_details.freshness * 10) / 10
        },
        craft: {
          total: Math.round(craft_score),
          clarity: Math.round(craft_details.clarity * 10) / 10,
          readability: Math.round(craft_details.readability * 10) / 10,
          format: Math.round(craft_details.format * 10) / 10,
          faq: Math.round(craft_details.faq * 10) / 10,
          trust: Math.round(craft_details.trust * 10) / 10
        },
        technical: {
          total: Math.round(technical_score),
          meta: Math.round(technical_details.meta * 10) / 10,
          schema: Math.round(technical_details.schema * 10) / 10,
          links: Math.round(technical_details.links * 10) / 10,
          headings: Math.round(technical_details.headings * 10) / 10,
          mobile: Math.round(technical_details.mobile * 10) / 10
        }
      },
      metrics: {
        word_count: wordCount,
        expert_quotes: expertQuotes,
        statistics: statistics,
        images: images,
        internal_links: internalLinks
      }
    };
    
    console.log(`✅ Scan complete: ${overall_score}/100 (${quality})`);
    
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
        console.error('⚠️ Leaderboard insert error:', dbError);
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
// PUBLIC SCAN ENDPOINT
// ============================================
app.post('/api/scan', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const scanResult = await performScan(url, res, clientIP, false, false);
    
    res.json(scanResult);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const scanResult = await performScan(url, res, clientIP, true, false);
    
    res.json(scanResult);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scan-agency', async (req, res) => {
  try {
    const { url, agencyId } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const scanResult = await performScan(url, res, clientIP, true, false);
    
    res.json(scanResult);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get all admins
app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create admin
app.post('/api/admins', async (req, res) => {
  try {
    const { username, password, role, full_name, email } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
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

// Verify admin login
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

// Get agencies
app.get('/api/super-admin/agencies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agencies ORDER BY created_at DESC');
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get clients
app.get('/api/admin/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get scans
app.get('/api/admin/scans', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM scans ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get share links
app.get('/api/admin/share-links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM share_links ORDER BY created_at DESC');
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create share link
app.post('/api/admin/share-links/create', async (req, res) => {
  try {
    const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
    
    const share_code = Math.random().toString(36).substring(2, 15);
    const expires_at = new Date(Date.now() + (valid_days || 30) * 24 * 60 * 60 * 1000);
    
    const result = await pool.query(
      `INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [share_code, client_email, client_name, client_company || '', scans_limit || 5, expires_at]
    );
    
    const share_url = `${req.protocol}://${req.get('host')}/seo-contentscore?key=${share_code}`;
    
    res.json({ success: true, share_url, share_link: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete share link
app.delete('/api/admin/share-links/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE share_code = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUBLIC LEADERBOARD ENDPOINTS
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard
      ORDER BY score DESC
      LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/leaderboard/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard
      WHERE LOWER(country) = LOWER($1)
      ORDER BY score DESC
      LIMIT 100
    `, [country]);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADMIN LEADERBOARD ENDPOINT
app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, *
      FROM leaderboard
      ORDER BY score DESC
      LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stats
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

// Get claims
app.get('/api/admin/claims/pending', async (req, res) => {
  try {
    res.json({ success: true, claims: [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete item (generic)
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
    if (!table) {
      return res.status(400).json({ success: false, error: 'Invalid resource' });
    }
    
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
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
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================
// SERVE HTML PAGES
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

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
