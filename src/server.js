// ============================================
// CONTENTSCALE SERVER.JS - WITH PUPPETEER
// ============================================

const express = require('express');
const path = require('path');
// BCRYPT REMOVED FOR RAILWAY COMPATIBILITY
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// PUPPETEER BROWSER INSTANCE (SINGLETON)
// ============================================
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    console.log('🚀 Launching Puppeteer browser...');
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      timeout: 30000
    });
    console.log('✅ Puppeteer browser ready');
  }
  return browserInstance;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browserInstance) {
    console.log('🛑 Closing Puppeteer browser...');
    await browserInstance.close();
  }
  process.exit(0);
});

// ============================================
// DATABASE CONFIGURATION
// ============================================
let dbConfig;

if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  
  dbConfig = {
    user: url.username,
    password: url.password,
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    ssl: process.env.NODE_ENV === 'production' ? { 
      rejectUnauthorized: false
    } : false
  };
} else {
  dbConfig = {
    host: 'localhost',
    database: 'contentscale',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    ssl: false
  };
}

const pool = new Pool(dbConfig);


// ============================================
// AI SCORING — CACHE + HELPERS
// ============================================
const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function hashContent(html) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

// ============================================
// PUPPETEER-POWERED HTML FETCHER
// ============================================
async function fetchWithPuppeteer(url) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`🌐 Puppeteer fetching: ${url}`);
    
    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    // Wait a bit for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract content intelligently from the DOM
    const content = await page.evaluate(() => {
      // Helper to check if element is visible
      function isVisible(el) {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               el.offsetWidth > 0 && 
               el.offsetHeight > 0;
      }
      
      // Helper to get text with structure markers
      function extractText(element, result = { text: '', headings: [] }) {
        for (let node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) result.text += text + ' ';
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            
            if (!isVisible(node)) continue;
            
            // Skip script, style, nav, header, footer
            if (['script', 'style', 'nav', 'header', 'footer', 'noscript'].includes(tag)) {
              continue;
            }
            
            // Handle headings
            if (tag === 'h1') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H1]: ${text}\n`;
                result.headings.push({ level: 1, text });
              }
            } else if (tag === 'h2') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H2]: ${text}\n`;
                result.headings.push({ level: 2, text });
              }
            } else if (tag === 'h3') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H3]: ${text}\n`;
                result.headings.push({ level: 3, text });
              }
            } else if (tag === 'h4') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H4]: ${text}\n`;
                result.headings.push({ level: 4, text });
              }
            } else if (tag === 'p') {
              const text = node.textContent.trim();
              if (text) result.text += `\n${text}\n`;
            } else if (tag === 'li') {
              const text = node.textContent.trim();
              if (text) result.text += `\n• ${text}\n`;
            } else {
              // Recurse for other elements
              extractText(node, result);
            }
          }
        }
        return result;
      }
      
      // Try to find main content area
      let mainElement = document.querySelector('main') || 
                       document.querySelector('article') ||
                       document.querySelector('[role="main"]') ||
                       document.querySelector('.content') ||
                       document.querySelector('#content') ||
                       document.body;
      
      const extracted = extractText(mainElement);
      
      return {
        content: extracted.text,
        title: document.title || '',
        headingCount: extracted.headings.length
      };
    });
    
    await page.close();
    console.log(`✅ Puppeteer extracted ${content.content.length} chars, ${content.headingCount} headings`);
    
    return {
      success: true,
      html: content.content, // Pre-extracted text with markers
      title: content.title,
      method: 'puppeteer'
    };
    
  } catch (error) {
    console.error(`❌ Puppeteer failed for ${url}:`, error.message);
    if (page) await page.close().catch(() => {});
    
    // Fallback to regular fetch
    return fetchWithFallback(url);
  }
}

// Fallback to regular fetch if Puppeteer fails
async function fetchWithFallback(url) {
  console.log(`🔄 Falling back to regular fetch: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`✅ Fallback fetch: ${html.length} bytes`);
    
    return {
      success: true,
      html: html,
      title: null,
      method: 'fetch'
    };
  } catch (error) {
    console.error(`❌ Fallback fetch failed:`, error.message);
    throw error;
  }
}

function extractContentForAI(html) {
  let processed = html;
  
  // Check if content is already extracted by Puppeteer (has [H1] markers, no HTML tags)
  const isPuppeteerExtracted = processed.includes('[H1]') || processed.includes('[H2]') || !processed.includes('<');
  
  if (isPuppeteerExtracted) {
    // Already extracted by Puppeteer - just clean and cap
    console.log('📝 Using Puppeteer-extracted content');
    processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
    
    if (processed.length > 40000) {
      const start = processed.substring(0, 35000);
      const end = processed.substring(processed.length - 5000);
      processed = start + '\n\n[...middle content truncated...]\n\n' + end;
    }
    
    return { title: '', content: processed };
  }
  
  // Otherwise, process raw HTML (fallback fetch)
  console.log('📝 Processing raw HTML fallback');
  
  // STEP 1: Remove complete noise sections
  processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  processed = processed.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  processed = processed.replace(/<!--[\s\S]*?-->/g, '');
  
  // STEP 2: Remove common boilerplate containers
  processed = processed.replace(/<nav[^>]*>/gi, '').replace(/<\/nav>/gi, '');
  processed = processed.replace(/<header[^>]*>/gi, '').replace(/<\/header>/gi, '');
  processed = processed.replace(/<footer[^>]*>/gi, '').replace(/<\/footer>/gi, '');
  
  // STEP 3: Try to isolate main content area
  let mainContent = processed;
  
  const mainMatch = processed.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    mainContent = mainMatch[1];
  } else {
    const articles = processed.match(/<article[^>]*>[\s\S]*?<\/article>/gi);
    if (articles && articles.length > 0) {
      mainContent = articles.join('\n\n');
    } else {
      const contentDiv = processed.match(/<div[^>]*(?:class|id)=["'][^"']*(?:content|main|post|entry|article|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (contentDiv) {
        mainContent = contentDiv[1];
      }
    }
  }
  
  processed = mainContent;
  
  // STEP 4: Extract structured elements with markers
  processed = processed.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n[H1]: $1\n');
  processed = processed.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n[H2]: $1\n');
  processed = processed.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n[H3]: $1\n');
  processed = processed.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n[H4]: $1\n');
  processed = processed.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  processed = processed.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1\n');
  
  // STEP 5: Strip all remaining HTML tags
  processed = processed.replace(/<[^>]*>/g, ' ');
  
  // STEP 6: Decode HTML entities
  processed = processed.replace(/&nbsp;/g, ' ')
                       .replace(/&amp;/g, '&')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&quot;/g, '"')
                       .replace(/&#39;/g, "'")
                       .replace(/&mdash;/g, '—')
                       .replace(/&ndash;/g, '–');
  
  // STEP 7: Clean excessive whitespace
  processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
  
  // STEP 8: Cap at 40K chars
  if (processed.length > 40000) {
    const start = processed.substring(0, 35000);
    const end = processed.substring(processed.length - 5000);
    processed = start + '\n\n[...middle content truncated...]\n\n' + end;
  }
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  return { title, content: processed };
}



const AI_SCORING_PROMPT = `You are an SEO content quality scorer. Analyze the content using GRAAF and CRAFT frameworks. Be fair but honest.

CONTENT FORMAT: You'll see markers like [H1], [H2], [H3], and • for lists. These ARE structure - count them.

SCORING EXPECTATIONS:
- Professional content with good structure: 60-75
- Exceptional content with expertise: 75-85
- Thin or keyword-stuffed content: 35-50

GRAAF SCORES (max 50 total):

Credibility (max 16):
  12-16: Clear author name OR expert quotes with attribution. E-E-A-T signals present.
  8-11: Some authority indicators (author, credentials, or quotes) but incomplete.
  4-7: Generic authority claims ("experts say") without specifics.
  0-3: No credibility signals at all.

Relevance (max 18):
  14-18: 1000+ words, topic-focused, specific details, actionable insights.
  10-13: 600-1000 words, good coverage, some depth.
  5-9: 300-600 words, basic coverage, somewhat generic.
  0-4: Under 300 words or extremely thin content.

Accuracy (max 8):
  6-8: Specific data points (percentages, numbers) mentioned with some sourcing.
  4-5: Data mentioned but sources unclear or generic ("studies show").
  2-3: Vague claims without data.
  0-1: No factual claims or data whatsoever.

Freshness (max 8):
  6-8: 2025-2026 dates OR clearly current content (events, trends).
  4-5: 2024 dates OR seems recent but no explicit markers.
  2-3: Older dates (2022-2023) or feels dated.
  0-1: No dates or very outdated.

CRAFT SCORES (max 30 total):

Heading Structure (max 8):
  6-8: ONE [H1] present with clear topic. Professional title.
  3-5: [H1] exists but weak, generic, or multiple H1s.
  0-2: No [H1] or completely broken heading structure.

Subheadings (max 10):
  8-10: 5+ [H2] or [H3] markers. Clear content hierarchy.
  5-7: 3-4 [H2]/[H3] markers. Decent structure.
  2-4: Only 1-2 [H2]/[H3] markers. Minimal structure.
  0-1: No [H2]/[H3] markers at all.

Paragraphs (max 8):
  6-8: Content has clear breaks between ideas. Good readability flow.
  4-5: Some paragraph breaks but could be better structured.
  1-3: Long blocks of text without clear separation.
  0: Complete wall of text.

Lists (max 4):
  3-4: 3+ bullet points (•) used effectively for scannability.
  1-2: 1-2 bullet points present but minimal use.
  0: No bullet points (•) anywhere.

CRITICAL RULES:
- Count [H1], [H2], [H3], [H4] markers as actual headings
- Count • symbols as list items
- Be realistic: most professional pages score 55-75, not 30 or 95
- If content is clearly structured with headings and lists, CRAFT should be at least 15/30
- Every score MUST be a whole number within its max

Return ONLY this JSON structure, no other text:
{
  "graaf": { "credibility": N, "relevance": N, "accuracy": N, "freshness": N },
  "craft": { "heading_structure": N, "subheadings": N, "paragraphs": N, "lists": N },
  "recommendations": [
    {
      "type": "major or quickwin",
      "category": "e.g. GRAAF - Credibility",
      "title": "Short action title",
      "description": "What is wrong or missing",
      "impact": "High or Medium or Low",
      "points": "+N points",
      "howToFix": "1. Step\\n2. Step\\n3. Step",
      "example": "Concrete example"
    }
  ]
}`;



async function scoreWithAI(contentForAI) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for Railway network

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Faster than 4.5, better for Railway network
        max_tokens: 2000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: AI_SCORING_PROMPT + '\n\nCONTENT TO SCORE:\nTitle: ' + contentForAI.title + '\n\n' + contentForAI.content
        }]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('Anthropic ' + response.status + ': ' + errText.substring(0, 200));
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Strip markdown fences aggressively
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    // Extract JSON object (first { to last })
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in AI response');
    }
    
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    
    // Try parsing - if it fails, attempt to fix common issues
    try {
      return JSON.parse(cleanText);
    } catch (parseError) {
      console.log('⚠️ JSON parse failed, attempting cleanup:', parseError.message);
      
      // Remove trailing commas before } or ]
      cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');
      
      // Try again
      try {
        return JSON.parse(cleanText);
      } catch (secondError) {
        throw new Error('Invalid JSON from AI: ' + secondError.message);
      }
    }

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function validateAIScores(ai) {
  if (!ai || !ai.graaf || !ai.craft) return false;

  const checks = [
    [ai.graaf.credibility, 0, 16],
    [ai.graaf.relevance, 0, 18],
    [ai.graaf.accuracy, 0, 8],
    [ai.graaf.freshness, 0, 8],
    [ai.craft.heading_structure, 0, 8],
    [ai.craft.subheadings, 0, 10],
    [ai.craft.paragraphs, 0, 8],
    [ai.craft.lists, 0, 4]
  ];

  for (const [val, min, max] of checks) {
    if (val === undefined || val === null) return false;
    if (!Number.isInteger(val)) return false;
    if (val < min || val > max) return false;
  }

  return true;
}



// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected');
    release();
    setTimeout(createAllTables, 1000);
  }
});

// ============================================
// CREATE ALL TABLES
// ============================================
async function createAllTables() {
  const client = await pool.connect();
  
  try {
    // SUPER ADMINS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(255),
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'admin',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);
    
    // Create default super admin if not exists - NO BCRYPT
    const adminCheck = await client.query('SELECT COUNT(*) FROM super_admins WHERE username = $1', ['ot']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      await client.query(
        'INSERT INTO super_admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        ['ot', 'admin123', 'Super Admin', 'super_admin']
      );
    }
    
    // AGENCIES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        url TEXT,
        country VARCHAR(10) DEFAULT 'NL',
        plan VARCHAR(50) DEFAULT 'free',
        contact_person VARCHAR(255),
        contact_email VARCHAR(255),
        admin_key VARCHAR(100) UNIQUE,
        score INTEGER,
        company_name TEXT,
        country_code VARCHAR(2),
        business_type VARCHAR(50),
        is_enhanced BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_scan TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // CLIENTS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        scan_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SCANS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        score INTEGER,
        quality VARCHAR(50),
        graaf_score INTEGER,
        craft_score INTEGER,
        technical_score INTEGER,
        breakdown JSONB,
        recommendations JSONB DEFAULT '[]',
        agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        client_url TEXT,
        scan_type VARCHAR(50) DEFAULT 'manual',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // FIX: Remove the problematic CHECK constraint
    await client.query(`
      ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check
    `).catch(e => console.log('Constraint already removed or does not exist'));
    
    // SHARE LINKS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        id SERIAL PRIMARY KEY,
        share_code VARCHAR(100) UNIQUE NOT NULL,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        client_email VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        client_company VARCHAR(255),
        scans_limit INTEGER DEFAULT 5,
        scans_used INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // LEADERBOARD TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        company_name VARCHAR(255),
        score INTEGER NOT NULL,
        country VARCHAR(10) DEFAULT 'NL',
        business_type VARCHAR(50),
        is_verified BOOLEAN DEFAULT FALSE,
        is_opted_out BOOLEAN DEFAULT FALSE,
        opted_out_at TIMESTAMP,
        opted_out_reason VARCHAR(255),
        submitted_via_share_link BOOLEAN DEFAULT FALSE,
        share_link_id UUID,
        submission_ip VARCHAR(50),
        admin_verified BOOLEAN DEFAULT FALSE,
        last_scan TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // AGENCY CLAIMS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS agency_claims (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
        claimed_name TEXT NOT NULL,
        logo_url TEXT,
        description TEXT,
        contact_email TEXT NOT NULL,
        agency_size VARCHAR(50),
        specialties JSONB DEFAULT '[]',
        is_verified BOOLEAN DEFAULT FALSE,
        claimed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // LTD CODES TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS ltd_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL,
        max_uses INTEGER DEFAULT 1,
        times_used INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // SETTINGS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // SECURITY TABLES
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_blocks (
        id SERIAL PRIMARY KEY,
        url VARCHAR(255) UNIQUE NOT NULL,
        domain VARCHAR(255),
        reason VARCHAR(255) NOT NULL,
        blocked_by VARCHAR(100),
        blocked_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_limits (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(50) NOT NULL,
        submission_date DATE NOT NULL,
        submission_count INT DEFAULT 1,
        last_submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(ip_address, submission_date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_share_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by VARCHAR(100) NOT NULL,
        link_type VARCHAR(50) DEFAULT 'verify',
        target_url VARCHAR(255),
        target_company VARCHAR(255),
        verification_token VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        used_count INT DEFAULT 0,
        max_uses INT DEFAULT 10,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_logs (
        id SERIAL PRIMARY KEY,
        url VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        ip_address VARCHAR(50) NOT NULL,
        country VARCHAR(10),
        score INT,
        graaf_score INT,
        craft_score INT,
        technical_score INT,
        submitted_via VARCHAR(50) DEFAULT 'api',
        share_link_id UUID,
        status VARCHAR(50) DEFAULT 'pending',
        rejection_reason VARCHAR(255),
        submitted_at TIMESTAMP DEFAULT NOW(),
        admin_reviewed_at TIMESTAMP,
        admin_reviewed_by VARCHAR(100),
        leaderboard_entry_id INT
      )
    `);

    // CLAIM PROFILE TABLES
    await client.query(`
      CREATE TABLE IF NOT EXISTS profile_claims (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT,
        logo_url TEXT,
        description TEXT,
        specializations JSONB,
        country TEXT,
        agency_size TEXT,
        contact_email TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        variables JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        to_email TEXT NOT NULL,
        subject TEXT,
        template_used TEXT,
        status TEXT DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT NOW(),
        error_message TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS optout_requests (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        reason TEXT,
        token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP
      )
    `);
    
    // NOTIFICATIONS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL DEFAULT 'system',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(500),
        priority VARCHAR(20) DEFAULT 'normal',
        is_read BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(100),
        created_for VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW(),
        read_at TIMESTAMP
      )
    `);

    // FREELANCERS TABLE
    await client.query(`
      CREATE TABLE IF NOT EXISTS freelancers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255),
        bio TEXT,
        profile_photo_url TEXT,
        linkedin_url TEXT,
        portfolio_url TEXT,
        website_url TEXT,
        location VARCHAR(255),
        country VARCHAR(10),
        status VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(50) DEFAULT 'unpaid',
        subscription_expires_at TIMESTAMP,
        writing_sample TEXT,
        test_submitted_at TIMESTAMP,
        test_reviewed_at TIMESTAMP,
        has_score BOOLEAN DEFAULT FALSE,
        score INTEGER,
        is_featured BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // DATABASE MIGRATIONS
    await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_enhanced BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS last_scan TIMESTAMP`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
    await client.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS company_name TEXT`);
    await client.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS client_url TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS logo_url TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS specializations JSONB`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS agency_size TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS contact_email TEXT`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS auto_detected_country VARCHAR(100)`);
    
    // SHARE_LINKS TABLE MIGRATIONS - migrate old schema (token) to new schema (share_code)
    await client.query(`
      DO $$ 
      BEGIN
        -- Rename token column to share_code if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'share_links' AND column_name = 'token'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'share_links' AND column_name = 'share_code'
        ) THEN
          ALTER TABLE share_links RENAME COLUMN token TO share_code;
        END IF;
      END $$;
    `).catch(e => console.log('share_links migration skipped:', e.message));
    
    await client.query(`ALTER TABLE share_links ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE`).catch(e => {});
    await client.query(`ALTER TABLE share_links ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`).catch(e => {});
    
    // LEADERBOARD APPROVAL MIGRATION - auto-approve all existing entries
    await client.query(`
      UPDATE leaderboard 
      SET admin_verified = TRUE 
      WHERE admin_verified IS NULL OR admin_verified = FALSE
    `).then(() => {
      console.log('✅ Auto-approved all existing leaderboard entries');
    }).catch(e => {
      console.log('Leaderboard approval migration skipped:', e.message);
    });
    
    // DEFAULT SETTINGS
    const defaultSettings = [
      ['site_name', 'ContentScale'],
      ['contact_email', 'info@contentscale.site'],
      ['whatsapp_number', '+31628073996'],
      ['auto_scan_enabled', 'false']
    ];
    
    for (const [key, value] of defaultSettings) {
      await client.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }

    // INSERT DEFAULT EMAIL TEMPLATES
    await client.query(`
      INSERT INTO email_templates (name, subject, body, variables) VALUES
      (
        'leaderboard_addition',
        'You''re on the ContentScale SEO Agency Leaderboard! 🏆',
        '<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2563eb;">Congratulations {agency_name}! 🎉</h2>
    
    <p>Your agency has been added to the <strong>ContentScale SEO Agency Leaderboard</strong>.</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Your Current Ranking:</h3>
      <ul style="list-style: none; padding: 0;">
        <li>📊 <strong>Score:</strong> {score}/100</li>
        <li>🏅 <strong>Position:</strong> #{position} in {country}</li>
        <li>🌐 <strong>URL Scanned:</strong> <a href="{url}">{url}</a></li>
      </ul>
    </div>
    
    <h3>Want to claim your profile?</h3>
    <p>Add your logo, description, and specializations to stand out:</p>
    <p style="text-align: center;">
      <a href="{claim_url}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Claim Your Profile
      </a>
    </p>
    
    <h3>Want to improve your ranking?</h3>
    <p>Optimize your content using our GRAAF Framework:</p>
    <ul>
      <li><strong>G</strong>enuinely Credible</li>
      <li><strong>R</strong>elevance</li>
      <li><strong>A</strong>ctionability</li>
      <li><strong>A</strong>ccuracy</li>
      <li><strong>F</strong>reshness</li>
    </ul>
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #666;">
      Don''t want to be listed? <a href="{optout_url}">Click here to opt-out</a>
    </p>
    
    <p style="font-size: 14px; color: #666;">
      Best regards,<br>
      <strong>Ottmar Francisca</strong><br>
      ContentScale - GRAAF Framework Creator<br>
      <a href="https://contentscale.site">contentscale.site</a>
    </p>
  </div>
</body>
</html>',
        '{"agency_name": "text", "score": "number", "position": "number", "country": "text", "url": "text", "claim_url": "text", "optout_url": "text"}'::jsonb
      ),
      (
        'claim_approved',
        'Your ContentScale Profile Has Been Approved! ✅',
        '<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Profile Approved! ✅</h2>
    
    <p>Hi {agency_name},</p>
    
    <p>Great news! Your profile claim has been approved and is now live on the leaderboard.</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Your Profile:</h3>
      <ul style="list-style: none; padding: 0;">
        <li>✅ <strong>Status:</strong> Verified</li>
        <li>🏢 <strong>Name:</strong> {agency_name}</li>
        <li>🌐 <strong>URL:</strong> <a href="{url}">{url}</a></li>
        <li>🎯 <strong>Specializations:</strong> {specializations}</li>
      </ul>
    </div>
    
    <p style="text-align: center;">
      <a href="{leaderboard_url}" style="display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        View Your Profile
      </a>
    </p>
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #666;">
      Best regards,<br>
      <strong>Ottmar Francisca</strong><br>
      ContentScale
    </p>
  </div>
</body>
</html>',
        '{"agency_name": "text", "url": "text", "specializations": "text", "leaderboard_url": "text"}'::jsonb
      )
      ON CONFLICT (name) DO NOTHING
    `);
    
    // CREATE INDEXES
    await client.query('CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_agencies_domain ON agencies(domain)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_blocked_url ON leaderboard_blocks(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_submission_ip_date ON submission_limits(ip_address, submission_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_status ON profile_claims(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_email ON profile_claims(contact_email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_claims_url ON profile_claims(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_optout_url ON optout_requests(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_optout_token ON optout_requests(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority)');
    
    console.log('✅ All database tables ready');
    
    setTimeout(autoPopulateLeaderboard, 500);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    client.release();
  }
}

// ============================================
// AUTO-POPULATE LEADERBOARD
// ============================================
async function autoPopulateLeaderboard() {
  try {
    const check = await pool.query('SELECT COUNT(*) FROM leaderboard');
    const count = parseInt(check.rows[0].count);
    
    if (count === 0) {
      const demoAgencies = [
        { url: 'https://contentscale.site', company: 'ContentScale', score: 95, country: 'NL', type: 'seo-agency' },
        { url: 'https://example-seo.nl', company: 'SEO Masters', score: 88, country: 'NL', type: 'seo-agency' },
        { url: 'https://digital-boost.be', company: 'Digital Boost', score: 82, country: 'BE', type: 'marketing-agency' }
      ];
      
      for (const agency of demoAgencies) {
        try {
          await pool.query(`
            INSERT INTO leaderboard (url, company_name, score, country, business_type, is_verified)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (url) DO NOTHING
          `, [agency.url, agency.company, agency.score, agency.country, agency.type, true]);
        } catch (e) {
          // Silently skip duplicates
        }
      }
    }
  } catch (error) {
    console.error('Leaderboard error:', error.message);
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static('public'));

// ============================================
// HTML ROUTES
// ============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/seo-contentscore', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unified-scan-page.html'));
});
// ============================================
// ADMIN LOGIN - NO BCRYPT
// ============================================
app.post('/api/setup/verify-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Credentials required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    
    // NO BCRYPT - Direct password comparison
    if (password !== admin.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query('UPDATE super_admins SET last_login = NOW() WHERE id = $1', [admin.id]);
    
    res.json({
      success: true,
      admin_id: admin.id,
      admin: {
        id: admin.id,
        username: admin.username,
        full_name: admin.full_name,
        role: admin.role
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ADMIN STATS
// ============================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [agencies, clients, scans] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM agencies').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM clients').catch(e => ({ rows: [{ count: '0' }] })),
      pool.query('SELECT COUNT(*) FROM scans').catch(e => ({ rows: [{ count: '0' }] }))
    ]);
    
    res.json({
      success: true,
      stats: {
        total_agencies: parseInt(agencies.rows[0].count) || 0,
        total_clients: parseInt(clients.rows[0].count) || 0,
        total_scans: parseInt(scans.rows[0].count) || 0,
        active_helpers: 0
      }
    });
  } catch (error) {
    res.json({ success: true, stats: { total_agencies: 0, total_clients: 0, total_scans: 0, active_helpers: 0 } });
  }
});

// ============================================
// ADMINS ENDPOINTS
// ============================================
app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM super_admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    res.json({ success: true, admins: [] });
  }
});

app.post('/api/admins', async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  
  // Use email as username if username not provided
  let finalUsername = username;
  
  if (!finalUsername && email) {
    finalUsername = email.split('@')[0];
    
    // Check if username exists, if so add timestamp
    const existing = await pool.query(
      'SELECT id FROM super_admins WHERE username = $1',
      [finalUsername]
    );
    
    if (existing.rows.length > 0) {
      finalUsername = `${finalUsername}_${Date.now()}`;
    }
  }
  
  if (!finalUsername) {
    finalUsername = `user_${Date.now()}`;
  }
  
  if (!password || !role) {
    return res.status(400).json({ success: false, error: 'Password and role are required' });
  }
  
  try {
    // NO BCRYPT - Store password directly
    const result = await pool.query(
      `INSERT INTO super_admins (username, password_hash, full_name, email, role, is_active) 
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [finalUsername, password, full_name || null, email || null, role]
    );
    
    res.json({ success: true, admin_id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Username exists' });
    }
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/admins/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM super_admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// AGENCIES ENDPOINTS
// ============================================
app.get('/api/super-admin/agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM clients WHERE agency_id = a.id) as client_count,
        (SELECT COUNT(*) FROM scans WHERE agency_id = a.id) as total_scans
      FROM agencies a 
      ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    res.json({ success: true, agencies: [] });
  }
});

app.post('/api/agencies', async (req, res) => {
  const { name, domain, country, plan, contact_person, contact_email } = req.body;
  
  if (!name || !domain) {
    return res.status(400).json({ success: false, error: 'Name and domain required' });
  }
  
  // Strip https:// and http:// from domain
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  
  try {
    const adminKey = crypto.randomBytes(16).toString('hex');
    const result = await pool.query(
      `INSERT INTO agencies (name, domain, country, plan, contact_person, contact_email, admin_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, cleanDomain, country || 'NL', plan || 'free', contact_person || null, contact_email || null, adminKey]
    );
    
    res.json({ success: true, agency_id: result.rows[0].id, admin_key: adminKey });
  } catch (error) {
    console.error('Agency creation error:', error.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.delete('/api/agencies/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// FREELANCER DIRECTORY API
// ============================================

// Get all active freelancers (PUBLIC)
app.get('/api/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, name, title, bio, profile_photo_url, 
        linkedin_url, portfolio_url, website_url,
        location, country, has_score, score, is_featured
      FROM freelancers 
      WHERE status = 'active' 
        AND payment_status = 'paid'
        AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
      ORDER BY 
        is_featured DESC,
        display_order ASC,
        score DESC NULLS LAST,
        created_at DESC
    `);
    
    res.json({
      success: true,
      freelancers: result.rows
    });
  } catch (error) {
    console.error('Get freelancers error:', error);
    res.status(500).json({ error: 'Failed to load freelancers' });
  }
});

// Submit freelancer application (PUBLIC)
app.post('/api/freelancers/apply', async (req, res) => {
  const { 
    name, email, title, bio, 
    linkedin_url, portfolio_url, website_url,
    location, country 
  } = req.body;
  
  if (!name || !email || !title || !bio) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  
  try {
    // Check if email already exists
    const existing = await pool.query(
      'SELECT id FROM freelancers WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Email already registered. Contact support if you need help.' 
      });
    }
    
    // Insert freelancer
    const result = await pool.query(`
      INSERT INTO freelancers (
        name, email, title, bio, 
        linkedin_url, portfolio_url, website_url,
        location, country, status, payment_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'unpaid')
      RETURNING id
    `, [name, email, title, bio, linkedin_url, portfolio_url, website_url, location, country]);
    
    console.log(`✅ Freelancer application: ${name} (${email})`);
    
    res.json({
      success: true,
      message: 'Application received! We will contact you within 24 hours with payment details.',
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('Freelancer apply error:', error);
    res.status(500).json({ error: 'Application failed' });
  }
});

// Submit writing test (AFTER PAYMENT)
app.post('/api/freelancers/submit-test', async (req, res) => {
  const { email, writing_sample } = req.body;
  
  if (!email || !writing_sample) {
    return res.status(400).json({ error: 'Email and writing sample required' });
  }
  
  try {
    const result = await pool.query(`
      UPDATE freelancers 
      SET 
        writing_sample = $1,
        test_submitted_at = NOW(),
        has_score = false
      WHERE email = $2 
        AND status = 'active'
        AND payment_status = 'paid'
      RETURNING id
    `, [writing_sample, email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Freelancer not found or payment not completed' 
      });
    }
    
    console.log(`✅ Writing test submitted: ${email}`);
    
    res.json({
      success: true,
      message: 'Writing test submitted! Your score will be reviewed within 48 hours.'
    });
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// ============================================
// ADMIN: Manage Freelancers
// ============================================

// Get all freelancers (ADMIN)
app.get('/api/admin/freelancers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM freelancers 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      freelancers: result.rows
    });
  } catch (error) {
    console.error('Admin get freelancers error:', error);
    res.status(500).json({ error: 'Failed to load' });
  }
});

// Approve freelancer & activate (ADMIN)
app.post('/api/admin/freelancers/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { subscription_months } = req.body;
  
  try {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (subscription_months || 1));
    
    await pool.query(`
      UPDATE freelancers 
      SET 
        status = 'active',
        payment_status = 'paid',
        subscription_expires_at = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [expiresAt, id]);
    
    res.json({ success: true, message: 'Freelancer activated' });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// Review writing test & assign score (ADMIN)
app.post('/api/admin/freelancers/:id/review-test', async (req, res) => {
  const { id } = req.params;
  const { score } = req.body;
  
  if (score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be 0-100' });
  }
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET 
        score = $1,
        has_score = true,
        test_reviewed_at = NOW()
      WHERE id = $2
    `, [score, id]);
    
    console.log(`✅ Score assigned: ${score} for freelancer #${id}`);
    
    res.json({ success: true, message: 'Score assigned' });
  } catch (error) {
    console.error('Review test error:', error);
    res.status(500).json({ error: 'Failed to assign score' });
  }
});

// Toggle featured status (ADMIN)
app.post('/api/admin/freelancers/:id/toggle-featured', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET is_featured = NOT is_featured
      WHERE id = $1
    `, [id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle' });
  }
});

// Update display order (ADMIN)
app.post('/api/admin/freelancers/:id/order', async (req, res) => {
  const { id } = req.params;
  const { order } = req.body;
  
  try {
    await pool.query(`
      UPDATE freelancers 
      SET display_order = $1
      WHERE id = $2
    `, [order, id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE freelancer (ADMIN)
app.delete('/api/admin/freelancers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM freelancers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ============================================
// CLIENTS ENDPOINTS
// ============================================
app.get('/api/admin/clients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, a.name as agency_name 
      FROM clients c 
      LEFT JOIN agencies a ON c.agency_id = a.id 
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    res.json({ success: true, clients: [] });
  }
});

app.delete('/api/admin/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// SCANS ENDPOINTS
// ============================================
app.get('/api/admin/scans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, a.name as agency_name 
      FROM scans s 
      LEFT JOIN agencies a ON s.agency_id = a.id 
      ORDER BY s.created_at DESC 
      LIMIT 100
    `);
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    res.json({ success: true, scans: [] });
  }
});

app.delete('/api/admin/scans/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.patch('/api/scans/:id/company', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name } = req.body;
    
    if (!company_name) {
      return res.status(400).json({ success: false, error: 'Company name required' });
    }
    
    await pool.query(
      'UPDATE scans SET company_name = $1 WHERE id = $2',
      [company_name, id]
    );
    
    res.json({ success: true, message: 'Company name updated' });
  } catch (error) {
    console.error('Update company name error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SHARE LINKS ENDPOINTS
// ============================================
app.get('/api/admin/share-links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM share_links ORDER BY created_at DESC');
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    res.json({ success: true, share_links: [] });
  }
});

app.post('/api/admin/share-links/create', async (req, res) => {
  const { client_email, client_name, client_company, scans_limit, valid_days } = req.body;
  
  console.log('📋 Creating share link:', { client_email, client_name, scans_limit, valid_days });
  
  if (!client_email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }

  try {
    const shareCode = crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (valid_days || 30));
    
    console.log('🔑 Generated share code:', shareCode, 'expires:', expiresAt);
    
    await pool.query(
      `INSERT INTO share_links (share_code, client_email, client_name, client_company, scans_limit, scans_used, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'active')`,
      [
        shareCode,
        client_email,
        client_name || null,
        client_company || null,
        scans_limit || 5,
        expiresAt
      ]
    );
    
    console.log('✅ Share link created successfully');
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${shareCode}`;
    res.json({ success: true, share_code: shareCode, share_url: shareUrl });
  } catch (error) {
    console.error('❌ Share link creation error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database error: ' + error.message,
      hint: error.hint || null
    });    
  }
});

app.delete('/api/admin/share-links/:code', async (req, res) => {
  try {
    console.log('🗑️ Deleting share link:', req.params.code);
    const result = await pool.query('DELETE FROM share_links WHERE share_code = $1 RETURNING id', [req.params.code]);
    
    if (result.rowCount === 0) {
      console.log('⚠️ Share link not found:', req.params.code);
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }
    
    console.log('✅ Share link deleted');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Share link delete error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ success: false, error: 'Database error: ' + error.message });
  }
});

app.put('/api/admin/share-links/:code/toggle-status', async (req, res) => {
  try {
    const { code } = req.params;
    
    const result = await pool.query(
      `UPDATE share_links 
       SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
       WHERE share_code = $1 
       RETURNING share_code, client_email, status`,
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }
    
    const newStatus = result.rows[0].status;
    
    res.json({ 
      success: true, 
      message: `Share link ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
      is_active: newStatus === 'active'
    });
    
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// ============================================
// LEADERBOARD ENDPOINTS
// ============================================
app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE is_opted_out = FALSE
      ORDER BY score DESC 
      LIMIT 100
    `);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.json({ success: true, entries: [] });
  }
});

app.get('/api/admin/leaderboard/search', async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(`
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC) as rank 
      FROM leaderboard 
      WHERE (url ILIKE $1 OR company_name ILIKE $1) AND is_opted_out = FALSE
      ORDER BY score DESC
    `, [`%${q}%`]);
    res.json({ success: true, entries: result.rows });
  } catch (error) {
    res.json({ success: true, entries: [] });
  }
});

app.delete('/api/admin/leaderboard/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ============================================
// BULK DELETE LEADERBOARD ENTRIES
// ============================================
app.post('/api/admin/leaderboard/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    
    const validIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'Invalid IDs' });
    }
    
    const result = await pool.query(
      `DELETE FROM leaderboard WHERE id = ANY($1::int[])`,
      [validIds]
    );
    
    res.json({
      success: true,
      deleted: result.rowCount,
      message: `Deleted ${result.rowCount} entries`
    });
    
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEADERBOARD APPROVAL SYSTEM
// ============================================

// Get pending submissions (awaiting admin approval)
app.get('/api/admin/leaderboard/pending', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, url, company_name, score, country, auto_detected_country, submission_ip, created_at
      FROM leaderboard 
      WHERE admin_verified = FALSE AND is_opted_out = FALSE
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      pending: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get pending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve a leaderboard submission
app.post('/api/admin/leaderboard/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { final_country } = req.body;
    
    // If admin provides final_country, use it. Otherwise keep existing.
    const updateQuery = final_country 
      ? `UPDATE leaderboard 
         SET admin_verified = TRUE, country = $2
         WHERE id = $1 
         RETURNING id, url, company_name, score, country`
      : `UPDATE leaderboard 
         SET admin_verified = TRUE 
         WHERE id = $1 
         RETURNING id, url, company_name, score, country`;
    
    const params = final_country ? [id, final_country] : [id];
    const result = await pool.query(updateQuery, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    console.log('✅ Approved leaderboard entry:', result.rows[0]);
    
    res.json({
      success: true,
      entry: result.rows[0],
      message: 'Entry approved and now visible on public leaderboard'
    });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a leaderboard submission (delete it)
app.post('/api/admin/leaderboard/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM leaderboard 
      WHERE id = $1 
      RETURNING url, company_name
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    
    console.log('❌ Rejected leaderboard entry:', result.rows[0]);
    
    res.json({
      success: true,
      message: 'Entry rejected and removed'
    });
  } catch (error) {
    console.error('Reject error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCAN ALL AGENCIES IN LEADERBOARD — AI-POWERED
// ============================================
app.post('/api/admin/scan-all-agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, url, company_name 
      FROM leaderboard 
      WHERE is_opted_out = FALSE 
      ORDER BY id
    `);

    const agencies = result.rows;

    if (agencies.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No agencies to scan',
        scanned: 0,
        failed: 0
      });
    }

    let scanned = 0;
    let failed = 0;
    const updates = [];

    console.log(`🔄 Starting AI scan of ${agencies.length} agencies...`);

    for (const agency of agencies) {
      try {
        console.log(`🔍 Scanning: ${agency.url}`);

        // Use Puppeteer for accurate content extraction
        const fetchResult = await fetchWithPuppeteer(agency.url);
        
        if (!fetchResult.success) {
          console.log(`❌ Failed: ${agency.url}`);
          failed++;
          continue;
        }

        const html = fetchResult.html;
        console.log(`✅ Fetched ${html.length} bytes from ${agency.url} (${fetchResult.method})`);

        // === TECHNICAL SCORE (regex — deterministic) ===
        let technicalScore = 0;
        const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
        technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : null;
        technicalScore += pageTitle && pageTitle.length > 30 ? 4 : pageTitle ? 2 : 0;
        const allImages = (html.match(/<img[^>]*>/gi) || []).length;
        const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
        if (allImages > 0) {
          technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
        }
        const hasViewport = /<meta\s+name="viewport"/gi.test(html);
        technicalScore += hasViewport ? 3 : 0;
        const hasSchema = /"@context"|"@type"/gi.test(html);
        technicalScore += hasSchema ? 3 : 0;
        technicalScore = Math.min(20, technicalScore);

        // === AI SCORING (GRAAF + CRAFT) with cache ===
        let graafScore, craftScore;
        const contentHash = hashContent(html);
        const cached = scanCache.get(contentHash);

        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
          graafScore = cached.graafScore;
          craftScore = cached.craftScore;
          console.log(`  📦 Cache hit: GRAAF=${graafScore} CRAFT=${craftScore}`);
        } else {
          try {
            if (!process.env.ANTHROPIC_API_KEY) {
              throw new Error('ANTHROPIC_API_KEY not set');
            }
            const contentForAI = extractContentForAI(html);
            const aiResult = await scoreWithAI(contentForAI);

            if (!validateAIScores(aiResult)) {
              throw new Error('AI scores failed validation');
            }

            graafScore = aiResult.graaf.credibility + aiResult.graaf.relevance + aiResult.graaf.accuracy + aiResult.graaf.freshness;
            craftScore = aiResult.craft.heading_structure + aiResult.craft.subheadings + aiResult.craft.paragraphs + aiResult.craft.lists;

            scanCache.set(contentHash, {
              graafScore, craftScore,
              graafItems: aiResult.graaf,
              craftItems: aiResult.craft,
              recommendations: aiResult.recommendations || [],
              timestamp: Date.now()
            });

            console.log(`  🤖 AI scored: GRAAF=${graafScore} CRAFT=${craftScore}`);

          } catch (aiErr) {
            console.log(`  ⚠️ AI fallback for ${agency.url}: ${aiErr.message}`);

            // Regex fallback
            const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(html);
            const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(html);
            const hasFreshDates = /202[4-6]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(html);
            const hasAuthor = /author|by |written by|published by|contributor/gi.test(html);
            const textContent = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
            const wordCount = textContent.length;

            graafScore = 0;
            graafScore += hasQuotes ? 8 : 0;
            graafScore += hasStats ? 8 : 0;
            graafScore += hasFreshDates ? 8 : 2;
            graafScore += hasAuthor ? 8 : 0;
            graafScore += Math.min(18, Math.floor(wordCount / 100));
            graafScore = Math.min(50, graafScore);

            const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
            const h2h3s = (html.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
            const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
            const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(html);

            craftScore = 0;
            craftScore += h1s === 1 ? 8 : h1s > 1 ? 4 : 2;
            craftScore += Math.min(10, h2h3s * 2);
            craftScore += Math.min(8, Math.floor(paragraphs / 3));
            craftScore += hasLists ? 4 : 0;
            craftScore = Math.min(30, craftScore);
          }
        }

        const totalScore = graafScore + craftScore + technicalScore;

        await pool.query(`
          UPDATE leaderboard 
          SET score = $1, last_scan = NOW(), company_name = COALESCE($2, company_name)
          WHERE id = $3
        `, [totalScore, agency.company_name, agency.id]);

        updates.push({ id: agency.id, url: agency.url, score: totalScore });
        scanned++;

      } catch (error) {
        console.log(`❌ Error scanning ${agency.url}: ${error.message}`);
        failed++;
      }
    }

    console.log(`✅ Bulk scan complete: ${scanned} scanned, ${failed} failed`);

    res.json({
      success: true,
      scanned,
      failed,
      updates,
      message: `Scanned ${scanned} agencies`
    });

  } catch (error) {
    console.error('Bulk scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ============================================
// PUBLIC LEADERBOARD API
// ============================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        COALESCE(company_name, 'Unknown') as company_name,
        url,
        score,
        COALESCE(country, 'NL') as country,
        COALESCE(business_type, 'agency') as type,
        COALESCE(is_verified, false) as is_claimed,
        COALESCE(created_at, NOW()) as created_at
      FROM leaderboard 
      WHERE score IS NOT NULL 
        AND is_opted_out = FALSE 
        AND admin_verified = TRUE
      ORDER BY score DESC 
      LIMIT 50
    `);
    
    res.json({
      success: true,
      entries: result.rows,
      total: result.rows.length,
      averageScore: result.rows.length > 0 
        ? Math.round(result.rows.reduce((sum, r) => sum + (r.score || 0), 0) / result.rows.length)
        : 0
    });
  } catch (error) {
    res.json({ success: true, entries: [], total: 0, averageScore: 0 });
  }
});

// ============================================
// CHECK IF URL IS BLOCKED
// ============================================
app.get('/api/leaderboard/check-status/:encodedUrl', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.encodedUrl);
    
    const result = await pool.query(`
      SELECT id, reason FROM leaderboard_blocks 
      WHERE url = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `, [url]);
    
    if (result.rows.length > 0) {
      res.json({
        blocked: true,
        reason: result.rows[0].reason
      });
    } else {
      res.json({ blocked: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OPT-OUT ENDPOINT
// ============================================
app.post('/api/leaderboard/opt-out', async (req, res) => {
  try {
    const { url, reason } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    const exists = await pool.query(
      'SELECT id FROM leaderboard_blocks WHERE url = $1',
      [url]
    );
    
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Already opted out' });
    }
    
    await pool.query(`
      INSERT INTO leaderboard_blocks (url, reason, blocked_by)
      VALUES ($1, $2, $3)
    `, [url, reason || 'User requested removal', 'user']);
    
    await pool.query(`
      UPDATE leaderboard 
      SET is_opted_out = TRUE, opted_out_at = NOW(), opted_out_reason = $2
      WHERE url = $1
    `, [url, reason || 'User requested removal']);
    
    res.json({
      success: true,
      message: 'Your URL has been removed from the leaderboard'
    });
    
  } catch (error) {
    console.error('Opt-out error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// IP RATE LIMIT CHECK
// ============================================
async function checkIPLimit(ip) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT submission_count FROM submission_limits 
      WHERE ip_address = $1 AND submission_date = $2
    `, [ip, today]);
    
    if (result.rows.length > 0) {
      const count = result.rows[0].submission_count;
      const MAX_PER_DAY = 3;
      
      if (count >= MAX_PER_DAY) {
        return { limited: true, count, max: MAX_PER_DAY };
      }
      
      return { limited: false, count };
    }
    
    return { limited: false, count: 0 };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { limited: false, count: 0 };
  }
}

// ============================================
// GET CLIENT IP
// ============================================
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0').split(',')[0].trim();
}

// ============================================
// COUNTRY AUTO-DETECTION FUNCTION
// ============================================
function detectCountryFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check TLD
    if (hostname.endsWith('.nl')) return 'Netherlands';
    if (hostname.endsWith('.be')) return 'Belgium';
    if (hostname.endsWith('.de')) return 'Germany';
    if (hostname.endsWith('.fr')) return 'France';
    if (hostname.endsWith('.co.uk') || hostname.endsWith('.uk')) return 'United Kingdom';
    if (hostname.endsWith('.us')) return 'United States';
    if (hostname.endsWith('.ca')) return 'Canada';
    if (hostname.endsWith('.au')) return 'Australia';
    if (hostname.endsWith('.es')) return 'Spain';
    if (hostname.endsWith('.it')) return 'Italy';
    if (hostname.endsWith('.pt')) return 'Portugal';
    if (hostname.endsWith('.se')) return 'Sweden';
    if (hostname.endsWith('.no')) return 'Norway';
    if (hostname.endsWith('.dk')) return 'Denmark';
    if (hostname.endsWith('.fi')) return 'Finland';
    if (hostname.endsWith('.at')) return 'Austria';
    if (hostname.endsWith('.ch')) return 'Switzerland';
    if (hostname.endsWith('.pl')) return 'Poland';
    if (hostname.endsWith('.ie')) return 'Ireland';
    if (hostname.endsWith('.nz')) return 'New Zealand';
    
    // Check subdomain patterns (e.g., nl.example.com)
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const subdomain = parts[0];
      if (subdomain === 'nl') return 'Netherlands';
      if (subdomain === 'be') return 'Belgium';
      if (subdomain === 'de') return 'Germany';
      if (subdomain === 'fr') return 'France';
      if (subdomain === 'uk') return 'United Kingdom';
      if (subdomain === 'us') return 'United States';
      if (subdomain === 'ca') return 'Canada';
      if (subdomain === 'au') return 'Australia';
      if (subdomain === 'es') return 'Spain';
      if (subdomain === 'it') return 'Italy';
    }
    
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ============================================
// LEADERBOARD SUBMIT (WITH SECURITY + COUNTRY AUTO-DETECTION)
// ============================================
app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, company_name, country } = req.body;
    const ip = getClientIP(req);
    
    if (!url || score === undefined) {
      return res.status(400).json({ error: 'URL and score required' });
    }

    // Auto-detect country from URL
    const auto_detected_country = detectCountryFromUrl(url);
    console.log(`🌍 Country: User="${country || 'None'}", Detected="${auto_detected_country}"`);
    
    // Check if URL is blocked
    const blocked = await pool.query(`
      SELECT id FROM leaderboard_blocks 
      WHERE url = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `, [url]);
    
    if (blocked.rows.length > 0) {
      return res.status(403).json({ 
        error: 'This URL cannot be submitted to the leaderboard'
      });
    }
    
    // Check IP rate limit
    const limitCheck = await checkIPLimit(ip);
    if (limitCheck.limited) {
      return res.status(429).json({
        success: false,
        error: 'You have used all 3 free scans today.',
        message: 'You have 3 free scans per day. Contact Ot @ WhatsApp +31628073996 if you need more.',
        whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20I%20need%20more%20scans.',
        scansUsed: limitCheck.count,
        scansLimit: limitCheck.max,
        retryAfter: '24 hours'
      });
    }
    
    // Check for duplicate submission today
    const today = new Date().toISOString().split('T')[0];
    const duplicate = await pool.query(`
      SELECT id FROM leaderboard 
      WHERE url = $1 AND DATE(created_at) = $2
    `, [url, today]);
    
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ 
        error: 'This URL already submitted today. Max 1 submission per URL per day' 
      });
    }
    
    // Insert into leaderboard with country auto-detection
    const leaderboardResult = await pool.query(`
      INSERT INTO leaderboard (
        url, score, company_name, country, auto_detected_country, submission_ip, admin_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      ON CONFLICT (url) DO UPDATE SET 
        score = EXCLUDED.score,
        company_name = COALESCE(EXCLUDED.company_name, leaderboard.company_name),
        country = EXCLUDED.country,
        auto_detected_country = EXCLUDED.auto_detected_country,
        last_scan = NOW(),
        admin_verified = FALSE
      RETURNING id
    `, [url, score, company_name || null, country || 'Unknown', auto_detected_country, ip]);
    
    const leaderboardEntryId = leaderboardResult.rows[0].id;
    
    // Log submission
    try {
      await pool.query(`
        INSERT INTO submission_logs 
        (url, company_name, ip_address, country, score, submitted_via, status, leaderboard_entry_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [url, company_name, ip, country, score, 'api', 'approved', leaderboardEntryId]);
    } catch (logError) {
      console.log('Note: submission_logs insert skipped');
    }
    
    // Update rate limit counter
    const today_date = new Date().toISOString().split('T')[0];
    await pool.query(`
      INSERT INTO submission_limits (ip_address, submission_date, submission_count)
      VALUES ($1, $2, 1)
      ON CONFLICT (ip_address, submission_date) DO UPDATE
      SET submission_count = submission_limits.submission_count + 1, last_submitted_at = NOW()
    `, [ip, today_date]);
    
    res.json({
      success: true,
      leaderboardEntryId,
      message: 'Submission received! Your entry will appear on the leaderboard once approved by our team.',
      pending_approval: true
    });
    
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// PUBLIC SCANNER API — AI-POWERED SCORING
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url, shareKey } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  let scanUrl = url;
  if (!scanUrl.startsWith('http://') && !scanUrl.startsWith('https://')) {
    scanUrl = 'https://' + scanUrl;
  }

  // ============================================
  // SHARELINK ENFORCEMENT
  // ============================================
  if (shareKey) {
    try {
      const shareLinkResult = await pool.query(
        'SELECT * FROM share_links WHERE share_code = $1',
        [shareKey]
      );

      if (shareLinkResult.rows.length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Invalid share link',
          limitReached: true
        });
      }

      const shareLink = shareLinkResult.rows[0];

      if (new Date(shareLink.expires_at) < new Date()) {
        return res.status(403).json({ 
          success: false,
          error: 'Share link expired. Contact Ot for renewal.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20verlopen.'
        });
      }

      if (shareLink.status !== 'active') {
        return res.status(403).json({ 
          success: false,
          error: 'Share link inactive. Contact Ot.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20niet%20actief.'
        });
      }

      if (shareLink.scans_used >= shareLink.scans_limit) {
        return res.status(403).json({ 
          success: false,
          error: `Scan limiet bereikt (${shareLink.scans_limit}/${shareLink.scans_limit}). Contact Ot voor meer scans.`,
          limitReached: true,
          scansUsed: shareLink.scans_used,
          scansLimit: shareLink.scans_limit,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20scan%20limiet%20is%20bereikt.%20Kan%20ik%20meer%20scans%20krijgen?'
        });
      }

      console.log(`✅ Sharelink valid: ${shareKey} (${shareLink.scans_used + 1}/${shareLink.scans_limit})`);

    } catch (error) {
      console.error('Sharelink check error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Sharelink verification failed' 
      });
    }
  }

  try {
    console.log(`🔍 Scanning: ${scanUrl}`);

    // === FETCH HTML WITH PUPPETEER ===
    const fetchResult = await fetchWithPuppeteer(scanUrl);
    
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot fetch URL: failed to load page` 
      });
    }

    const html = fetchResult.html;
    console.log(`✅ Fetched ${html.length} bytes from ${scanUrl} (${fetchResult.method})`);

    // === TECHNICAL SCORE (regex — always deterministic) ===
    let technicalScore = 0;

    const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
    technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;
    technicalScore += title && title.length > 30 ? 4 : title ? 2 : 0;

    const allImages = (html.match(/<img[^>]*>/gi) || []).length;
    const imagesWithAlt = (html.match(/<img[^>]*alt="/gi) || []).length;
    if (allImages > 0) {
      technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
    }

    const hasViewport = /<meta\s+name="viewport"/gi.test(html);
    technicalScore += hasViewport ? 3 : 0;

    const hasSchema = /"@context"|"@type"/gi.test(html);
    technicalScore += hasSchema ? 3 : 0;
    technicalScore = Math.min(20, technicalScore);

    // === HTML DETAILS (for response metadata — always computed) ===
    const textContent = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
    const wordCount = textContent.length;
    const h1s = (html.match(/<h1[^>]*>/gi) || []).length;
    const h2h3s = (html.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
    const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
    const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(html);
    const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(html);
    const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(html);
    const hasFreshDates = /202[4-6]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(html);
    const hasAuthor = /author|by |written by|published by|contributor/gi.test(html);

    // === AI SCORING (GRAAF + CRAFT) — temp:0 = deterministic ===
    // Same HTML content → same content hash → same cache hit → same score, always.
    const contentHash = hashContent(html);
    let graafScore, craftScore, graafItems, craftItems, aiRecommendations, scoringMethod;

    const cached = scanCache.get(contentHash);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`📦 Cache hit for ${scanUrl}`);
      graafScore = cached.graafScore;
      craftScore = cached.craftScore;
      graafItems = cached.graafItems;
      craftItems = cached.craftItems;
      aiRecommendations = cached.recommendations;
      scoringMethod = 'ai-cached';
    } else {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }

        const contentForAI = extractContentForAI(html);
        console.log(`🤖 AI scoring ${scanUrl}...`);
        const aiResult = await scoreWithAI(contentForAI);

        if (!validateAIScores(aiResult)) {
          throw new Error('AI scores failed validation');
        }

        // Normalize: ensure integers, clamp to max
        graafItems = {
          credibility: Math.min(16, Math.max(0, Math.round(aiResult.graaf.credibility))),
          relevance: Math.min(18, Math.max(0, Math.round(aiResult.graaf.relevance))),
          accuracy: Math.min(8, Math.max(0, Math.round(aiResult.graaf.accuracy))),
          freshness: Math.min(8, Math.max(0, Math.round(aiResult.graaf.freshness)))
        };
        craftItems = {
          headingStructure: Math.min(8, Math.max(0, Math.round(aiResult.craft.heading_structure))),
          subheadings: Math.min(10, Math.max(0, Math.round(aiResult.craft.subheadings))),
          paragraphs: Math.min(8, Math.max(0, Math.round(aiResult.craft.paragraphs))),
          lists: Math.min(4, Math.max(0, Math.round(aiResult.craft.lists)))
        };

        graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
        craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
        
        aiRecommendations = Array.isArray(aiResult.recommendations) ? aiResult.recommendations : [];
        scoringMethod = 'ai';

        // Cache — keyed by content hash, so same page content = same score forever
        scanCache.set(contentHash, {
          graafScore, craftScore, graafItems, craftItems,
          recommendations: aiRecommendations,
          timestamp: Date.now()
        });

        console.log(`✅ AI scored: GRAAF=${graafScore} CRAFT=${craftScore} (${scoringMethod})`);

      } catch (aiError) {
        console.error(`⚠️ AI scoring failed, using regex fallback: ${aiError.message}`);
        scoringMethod = 'fallback';

        // === REGEX FALLBACK for GRAAF ===
        graafItems = {
          credibility: (hasQuotes ? 8 : 0) + (hasAuthor ? 8 : 0),
          relevance: Math.min(18, Math.floor(wordCount / 100)),
          accuracy: hasStats ? 8 : 0,
          freshness: hasFreshDates ? 8 : 2
        };
        graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
        graafScore = Math.min(50, graafScore);

        // === REGEX FALLBACK for CRAFT ===
        craftItems = {
          headingStructure: h1s === 1 ? 8 : h1s > 1 ? 4 : 2,
          subheadings: Math.min(10, h2h3s * 2),
          paragraphs: Math.min(8, Math.floor(paragraphs / 3)),
          lists: hasLists ? 4 : 0
        };
        craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
        craftScore = Math.min(30, craftScore);

        aiRecommendations = [];
      }
    }

    const totalScore = graafScore + craftScore + technicalScore;
    const quality = totalScore >= 90 ? 'excellent' : totalScore >= 75 ? 'good' : totalScore >= 60 ? 'average' : totalScore >= 45 ? 'below-average' : 'poor';

    console.log(`\n🎯 SCAN COMPLETE: ${scanUrl}`);
    console.log(`   Method: ${scoringMethod.toUpperCase()}`);
    console.log(`   Score: ${totalScore}/100 (${quality})`);
    console.log(`   └─ GRAAF: ${graafScore}/50 (${scoringMethod === 'fallback' ? 'regex' : 'AI'})`);
    console.log(`   └─ CRAFT: ${craftScore}/30 (${scoringMethod === 'fallback' ? 'regex' : 'AI'})`);
    console.log(`   └─ Technical: ${technicalScore}/20 (regex)\n`);

    // === TECHNICAL RECOMMENDATIONS (always regex — binary checks) ===
    const techRecommendations = [];

    if (!metaDesc) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Meta Description',
        description: 'Missing meta description. Critical for search click-through rate.',
        impact: 'High',
        points: '+4 points',
        howToFix: '1. Write a 150-160 character description\n2. Include your primary target keyword\n3. Add a compelling call-to-action',
        example: '<meta name="description" content="Learn proven SEO content strategies with our framework. Boost organic rankings in 90 days. Start your free audit today.">'
      });
    } else if (metaDesc.length <= 50) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Expand Meta Description',
        description: `Current meta description is only ${metaDesc.length} characters. Aim for 150-160.`,
        impact: 'Medium',
        points: '+2 points',
        howToFix: '1. Rewrite to 150-160 characters\n2. Include target keyword near the start\n3. End with a clear call-to-action',
        example: '<meta name="description" content="[Your keyword] guide covering [topic]. Includes [specific value]. [Call to action] — start today.">'
      });
    }

    if (!hasViewport) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Mobile Viewport',
        description: 'Missing viewport meta tag. Required for proper mobile rendering.',
        impact: 'High',
        points: '+3 points',
        howToFix: '1. Add the viewport meta tag inside your <head>\n2. Test the page on mobile devices\n3. Verify responsive layout works correctly',
        example: '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      });
    }

    if (!hasSchema) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Schema Markup',
        description: 'No structured data (JSON-LD) found. Schema enables rich snippets in search results.',
        impact: 'Medium',
        points: '+3 points',
        howToFix: '1. Add Article or HowTo schema as JSON-LD\n2. Include headline, author, and datePublished\n3. Test with Google Rich Results Test',
        example: '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "Article", "headline": "Your Title", "author": { "@type": "Person", "name": "Author Name" } }</script>'
      });
    }

    if (allImages > 0 && imagesWithAlt < allImages) {
      const missing = allImages - imagesWithAlt;
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Alt Text to Images',
        description: `${missing} of ${allImages} images are missing alt text. Required for accessibility and image search.`,
        impact: 'Medium',
        points: '+2 points',
        howToFix: '1. Add descriptive alt text to every image\n2. Include relevant keywords naturally\n3. Describe what the image actually shows',
        example: '<img src="seo-chart.jpg" alt="SEO ranking improvement chart showing 40% traffic increase over 90 days">'
      });
    }

    // === MERGE AI + TECHNICAL RECOMMENDATIONS ===
    const allRecommendations = [...(aiRecommendations || []), ...techRecommendations];
    const quickWins = allRecommendations.filter(r => r.type === 'quickwin');
    const majorImprovements = allRecommendations.filter(r => r.type === 'major');

    // === BUILD RESPONSE (structure unchanged for frontend compatibility) ===
    const scanResult = {
      success: true,
      url: scanUrl,
      score: totalScore,
      quality,
      scoring_method: scoringMethod,
      metrics: { graaf: graafScore, craft: craftScore, technical: technicalScore },
      breakdown: {
        graaf: {
          total: graafScore,
          max: 50,
          percentage: Math.round((graafScore / 50) * 100),
          items: graafItems
        },
        craft: {
          total: craftScore,
          max: 30,
          percentage: Math.round((craftScore / 30) * 100),
          items: craftItems
        },
        technical: {
          total: technicalScore,
          max: 20,
          percentage: Math.round((technicalScore / 20) * 100),
          items: {
            metaDescription: metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0,
            title: title && title.length > 30 ? 4 : title ? 2 : 0,
            imageAlt: allImages > 0 ? Math.min(4, Math.floor((imagesWithAlt / allImages) * 4)) : 0,
            viewport: hasViewport ? 3 : 0,
            schema: hasSchema ? 3 : 0
          }
        }
      },
      recommendations: {
        all: allRecommendations,
        quickWins: quickWins,
        majorImprovements: majorImprovements,
        totalRecommendations: allRecommendations.length,
        potentialScoreIncrease: allRecommendations.reduce((sum, r) => {
          const pts = parseInt((r.points || '0').match(/\d+/)?.[0] || 0);
          return sum + pts;
        }, 0)
      },
      details: {
        wordCount,
        h1Count: h1s,
        h2h3Count: h2h3s,
        paragraphCount: paragraphs,
        imageCount: allImages,
        imagesWithAlt,
        hasQuotes,
        hasStats,
        hasFreshDates,
        hasAuthor,
        hasLists,
        hasViewport,
        hasSchema,
        metaDescription: metaDesc ? metaDesc.substring(0, 160) : null,
        title: title
      },
      timestamp: new Date().toISOString()
    };

    // Save to DB (non-blocking)
    try {
      await pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [scanUrl, totalScore, quality, graafScore, craftScore, technicalScore, JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), 'manual']
      );
      console.log(`✅ Scan saved: ${scanUrl} (Score: ${totalScore}, Method: ${scoringMethod})`);
    } catch (dbError) {
      console.error('DB save error (non-fatal):', dbError.message);
    }

    // Increment sharelink usage
    if (shareKey) {
      try {
        await pool.query(
          'UPDATE share_links SET scans_used = scans_used + 1 WHERE share_code = $1',
          [shareKey]
        );
        console.log(`📊 Sharelink usage updated: ${shareKey}`);
      } catch (error) {
        console.error('Sharelink update error:', error);
      }
    }

    res.json(scanResult);

  } catch (error) {
    console.error('Scan error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});
// ============================================
// EXPORT SCAN RESULTS
// ============================================
app.get('/api/export/scan/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { url, score, recommendations } = req.query;
    
    if (!url || !score) {
      return res.status(400).json({ error: 'URL and score required' });
    }
    
    const parsedRecommendations = recommendations ? JSON.parse(decodeURIComponent(recommendations)) : [];
    
    if (format === 'csv') {
      let csv = 'Category,Title,Description,Impact,Points,How to Fix\n';
      
      if (parsedRecommendations.all) {
        parsedRecommendations.all.forEach(rec => {
          const howToFix = (rec.howToFix || '').replace(/\n/g, ' ').replace(/"/g, '""');
          csv += `"${rec.category}","${rec.title}","${rec.description}","${rec.impact}","${rec.points}","${howToFix}"\n`;
        });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.csv"`);
      res.send(csv);
      
    } else if (format === 'json') {
      const exportData = {
        url: decodeURIComponent(url),
        score: parseInt(score),
        recommendations: parsedRecommendations,
        exportedAt: new Date().toISOString(),
        generatedBy: 'ContentScale SEO Scanner'
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.json"`);
      res.json(exportData);
      
    } else if (format === 'txt') {
      let txt = `ContentScale SEO Scan Report\n`;
      txt += `${'='.repeat(50)}\n\n`;
      txt += `URL: ${decodeURIComponent(url)}\n`;
      txt += `Score: ${score}/100\n`;
      txt += `Scanned: ${new Date().toISOString()}\n\n`;
      
      if (parsedRecommendations.quickWins && parsedRecommendations.quickWins.length > 0) {
        txt += `QUICK WINS (${parsedRecommendations.quickWins.length})\n`;
        txt += `${'-'.repeat(50)}\n`;
        parsedRecommendations.quickWins.forEach((rec, i) => {
          txt += `\n${i + 1}. ${rec.title} (${rec.points})\n`;
          txt += `   Category: ${rec.category}\n`;
          txt += `   Impact: ${rec.impact}\n`;
          txt += `   ${rec.description}\n`;
          if (rec.howToFix) {
            txt += `   How to fix:\n`;
            txt += `   ${rec.howToFix.replace(/\n/g, '\n   ')}\n`;
          }
        });
        txt += `\n`;
      }
      
      if (parsedRecommendations.majorImprovements && parsedRecommendations.majorImprovements.length > 0) {
        txt += `\nMAJOR IMPROVEMENTS (${parsedRecommendations.majorImprovements.length})\n`;
        txt += `${'-'.repeat(50)}\n`;
        parsedRecommendations.majorImprovements.forEach((rec, i) => {
          txt += `\n${i + 1}. ${rec.title} (${rec.points})\n`;
          txt += `   Category: ${rec.category}\n`;
          txt += `   Impact: ${rec.impact}\n`;
          txt += `   ${rec.description}\n`;
          if (rec.howToFix) {
            txt += `   How to fix:\n`;
            txt += `   ${rec.howToFix.replace(/\n/g, '\n   ')}\n`;
          }
        });
      }
      
      txt += `\n${'='.repeat(50)}\n`;
      txt += `Generated by ContentScale - https://contentscale.site\n`;
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="contentscale-scan-${Date.now()}.txt"`);
      res.send(txt);
      
    } else {
      res.status(400).json({ error: 'Invalid format. Use: csv, json, or txt' });
    }
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLAIM PROFILE & EMAIL ENDPOINTS
// ============================================

function fillEmailTemplate(template, variables) {
  let filled = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{${key}}`, 'g');
    filled = filled.replace(regex, variables[key] || '');
  });
  return filled;
}

async function sendEmail(to, subject, html, templateName = null) {
  try {
    await pool.query(
      `INSERT INTO email_logs (to_email, subject, template_used, status, sent_at) 
       VALUES ($1, $2, $3, 'sent', NOW())`,
      [to, subject, templateName]
    );
    
    console.log('📧 EMAIL SENT:', {
      to,
      subject,
      template: templateName,
      preview: html.substring(0, 100) + '...'
    });
    
    return { success: true };
  } catch (error) {
    await pool.query(
      `INSERT INTO email_logs (to_email, subject, template_used, status, error_message, sent_at) 
       VALUES ($1, $2, $3, 'failed', $4, NOW())`,
      [to, subject, templateName, error.message]
    ).catch(() => {});
    
    console.error('❌ EMAIL ERROR:', error);
    return { success: false, error: error.message };
  }
}

function generateOptOutToken() {
  return crypto.randomBytes(32).toString('hex');
}

app.post('/api/claim-profile', async (req, res) => {
  try {
    const { 
      url, name, logo_url, description, 
      specializations, country, agency_size, contact_email 
    } = req.body;
    
    if (!url || !name || !contact_email) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL, name, and contact email are required' 
      });
    }
    
    const existing = await pool.query(
      'SELECT * FROM profile_claims WHERE url = $1 AND status != $2',
      [url, 'rejected']
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'This profile has already been claimed and is pending review' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO profile_claims 
      (url, name, logo_url, description, specializations, country, agency_size, contact_email, status, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW()) 
      RETURNING *`,
      [url, name, logo_url, description, JSON.stringify(specializations), country, agency_size, contact_email]
    );
    
    res.json({ 
      success: true, 
      message: 'Profile claim submitted! We will review within 24 hours.',
      claim_id: result.rows[0].id 
    });
    
  } catch (error) {
    console.error('Claim profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/optout', async (req, res) => {
  try {
    const { token, reason } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }
    
    const result = await pool.query(
      `UPDATE optout_requests 
       SET processed = true, processed_at = NOW() 
       WHERE token = $1 AND processed = false 
       RETURNING url`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or already processed opt-out token' 
      });
    }
    
    const url = result.rows[0].url;
    await pool.query('DELETE FROM leaderboard WHERE url = $1', [url]);
    
    res.json({ 
      success: true, 
      message: 'You have been successfully removed from the leaderboard' 
    });
    
  } catch (error) {
    console.error('Opt-out error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/claims/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM profile_claims WHERE status = 'pending' ORDER BY created_at DESC`
    );
    res.json({ success: true, claims: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/claims/approve/:claim_id', async (req, res) => {
  try {
    const { claim_id } = req.params;
    
    const claim = await pool.query('SELECT * FROM profile_claims WHERE id = $1', [claim_id]);
    
    if (claim.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    const claimData = claim.rows[0];
    
    await pool.query(
      `UPDATE profile_claims SET status = 'approved', reviewed_at = NOW() WHERE id = $1`,
      [claim_id]
    );
    
    await pool.query(
      `UPDATE leaderboard 
       SET claimed = true, logo_url = $1, description = $2, specializations = $3, 
           agency_size = $4, contact_email = $5, verified = true
       WHERE url = $6`,
      [claimData.logo_url, claimData.description, claimData.specializations, 
       claimData.agency_size, claimData.contact_email, claimData.url]
    );
    
    if (claimData.contact_email) {
      const emailTemplate = await pool.query(
        'SELECT * FROM email_templates WHERE name = $1', ['claim_approved']
      );
      
      if (emailTemplate.rows.length > 0) {
        const html = fillEmailTemplate(emailTemplate.rows[0].body, {
          agency_name: claimData.name,
          url: claimData.url,
          specializations: JSON.parse(claimData.specializations || '[]').join(', '),
          leaderboard_url: `${process.env.BASE_URL || 'https://contentscale.site'}/leaderboard`
        });
        
        await sendEmail(claimData.contact_email, emailTemplate.rows[0].subject, html, 'claim_approved');
      }
    }
    
    res.json({ success: true, message: 'Claim approved and profile updated' });
    
  } catch (error) {
    console.error('Approve claim error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/claims/reject/:claim_id', async (req, res) => {
  try {
    const { claim_id } = req.params;
    await pool.query(
      `UPDATE profile_claims SET status = 'rejected', reviewed_at = NOW() WHERE id = $1`,
      [claim_id]
    );
    res.json({ success: true, message: 'Claim rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/email-templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY name');
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/send-bulk-email', async (req, res) => {
  try {
    const { template_name, recipients } = req.body;
    
    const template = await pool.query(
      'SELECT * FROM email_templates WHERE name = $1', [template_name]
    );
    
    if (template.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    const emailTemplate = template.rows[0];
    let sent = 0;
    let failed = 0;
    
    for (const recipient of recipients) {
      const html = fillEmailTemplate(emailTemplate.body, recipient.variables || {});
      const result = await sendEmail(recipient.email, emailTemplate.subject, html, template_name);
      if (result.success) { sent++; } else { failed++; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json({ success: true, message: `Emails sent: ${sent}, Failed: ${failed}`, sent, failed });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/optout/create', async (req, res) => {
  try {
    const { url, reason } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const token = generateOptOutToken();
    
    await pool.query(
      `INSERT INTO optout_requests (url, reason, token, created_at, processed, processed_at) 
       VALUES ($1, $2, $3, NOW(), true, NOW())`,
      [url, reason || 'Admin request', token]
    );
    
    await pool.query('DELETE FROM leaderboard WHERE url = $1', [url]);
    
    res.json({ success: true, message: 'Agency removed from leaderboard' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/optouts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM optout_requests ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/email-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await pool.query(
      `SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT $1`, [limit]
    );
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    let query = 'SELECT * FROM notifications';
    let params = [];
    
    if (filter === 'unread') {
      query += ' WHERE is_read = FALSE';
    } else if (filter === 'read') {
      query += ' WHERE is_read = TRUE';
    } else if (filter === 'high') {
      query += ` WHERE priority IN ('high', 'urgent')`;
    } else if (filter === 'system') {
      query += ` WHERE type = 'system'`;
    } else if (filter === 'user') {
      query += ` WHERE type != 'system'`;
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json({ success: true, notifications: result.rows });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/notifications/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE`
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    res.json({ success: true, count: 0 });
  }
});

app.post('/api/admin/notifications/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/notifications/mark-all-read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE is_read = FALSE`
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/notifications', async (req, res) => {
  try {
    const { type, title, message, link, priority, created_for } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO notifications (type, title, message, link, priority, created_for, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [type || 'system', title, message, link || null, priority || 'normal', created_for || 'admin']
    );
    
    res.json({ success: true, notification: result.rows[0], message: 'Notification created' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/notifications/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/notifications/clear-read', async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE is_read = TRUE');
    res.json({ success: true, message: 'All read notifications cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.json({ status: 'degraded', database: 'disconnected' });
  }
});

// ============================================
// CATCH-ALL ROUTE
// ============================================
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, '../public', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '../public/index.html'), (err2) => {
        if (err2) {
          res.status(404).json({ error: 'Not found' });
        }
      });
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Something went wrong' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 =====================================');
  console.log('🚀  ContentScale Server Running');
  console.log('🚀 =====================================');
  console.log('');
  console.log('📍 Frontend:  http://localhost:' + PORT);
  console.log('📍 Admin:     http://localhost:' + PORT + '/admin');
  console.log('📍 Health:    http://localhost:' + PORT + '/api/health');
  console.log('');
  console.log('👤 Default Login: ot / admin123');
  console.log('');
});
