// ============================================
// CONTENTSCALE SERVER.JS - ULTIMATE ENHANCED VERSION
// ============================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURATIE
// ============================================
const EXPLANATION_CONTENT = {
  title: "ContentScale Elite Framework - Waarom Dit Systeem Uniek Is",
  
  voorSpecialisten: {
    titel: "Voor SEO Specialisten & Content Strategen",
    punten: [
      {
        titel: "Meer dan een simpele score",
        uitleg: "ContentScale combineert AI-analyse met praktische validatie om echt bruikbare inzichten te geven. We checken niet alleen 'of' er statistieken zijn, maar ook 'hoe' ze gepresenteerd worden."
      },
      {
        titel: "Praktische aanbevelingen",
        uitleg: "Geen vage suggesties, maar concrete stappen: 'Voeg 3+ statistieken toe uit 2024-2025 met bronvermelding' met exacte voorbeelden."
      },
      {
        titel: "Real-time content extractie",
        uitleg: "Met Puppeteer halen we complete content op, inclusief dynamisch geladen elementen die normale scrapers missen."
      },
      {
        titel: "Technische SEO validatie",
        uitleg: "Automatische controle op schema markup, image alt tags, interne/externe links en meta tags."
      }
    ]
  },
  
  frameworkUitleg: {
    graaf: {
      naam: "GRAAF Framework (50 punten)",
      uitleg: "Focus op content authority en expertise",
      elementen: [
        "Keyword Optimization - Natuurlijke keyword densiteit 0.8-1.2%",
        "Statistics with Sources - 8+ statistieken met bronvermelding (2023-2025)",
        "Expert Quotes - 4+ expert quotes met naam, titel, organisatie",
        "Case Studies - 2+ case studies met meetbare resultaten",
        "Author Authority - Auteur bio met credentials en ervaring"
      ]
    },
    craft: {
      naam: "CRAFT Framework (30 punten)", 
      uitleg: "Focus op leesbaarheid en structuur",
      elementen: [
        "Word Count - 2500+ woorden voor diepgang",
        "Readability - Duidelijke paragraafstructuur, actieve stem",
        "FAQ Section - 10+ FAQ vragen met gedetailleerde antwoorden",
        "Visual Elements - Afbeeldingen, tabellen, lijsten, schema's"
      ]
    },
    technical: {
      naam: "Technical SEO (20 punten)",
      uitleg: "Technische optimalisatie voor zoekmachines",
      elementen: [
        "Meta Tags - Perfecte title (50-60 chars) & description (150-160 chars)",
        "Schema Markup - Article, FAQPage, Organization schema",
        "Links - 8-12 interne links, 5+ externe autoritatieve links",
        "Images - 90%+ alt tekst, geoptimaliseerde afbeeldingen",
        "Viewport - Mobile responsive design"
      ]
    }
  },
  
  gebruiksscenarios: [
    "Content audits voor complete websites",
    "Competitor analysis - zie waar je beter kunt scoren",
    "Content planning - identificeer gaps in je content strategy",
    "SEO verbeteringen - concrete technische aanbevelingen",
    "Team training - leer wat 'excellent content' echt betekent"
  ]
};

// ============================================
// PUPPETEER BROWSER INSTANCE
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
// CACHE SYSTEM
// ============================================
const scanCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
scanCache.clear();
console.log('🧹 Cache cleared on startup');

function hashContent(html) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

// ============================================
// NIEUWE: HTML CONVERSION SERVICE
// ============================================
const htmlConversions = new Map();

async function convertUrlToHtml(url, format = 'clean') {
  try {
    console.log(`🌐 Converting URL to HTML: ${url}`);
    
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    // Close cookie consent
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const acceptBtn = buttons.find(b => 
          /accept|akkoord|toestemming|allow|agree/i.test(b.textContent)
        );
        if (acceptBtn) acceptBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {}
    
    // Scroll for lazy content
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    let html = await page.content();
    await page.close();
    
    // Format based on option
    if (format === 'clean') {
      html = cleanHtml(html);
    } else if (format === 'content-only') {
      html = extractMainContent(html);
    }
    
    // Create unique ID for this conversion
    const conversionId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    htmlConversions.set(conversionId, {
      html: html,
      url: url,
      timestamp: timestamp,
      format: format
    });
    
    // Clean old conversions (older than 1 hour)
    for (const [id, data] of htmlConversions.entries()) {
      if (Date.now() - data.timestamp > 3600000) {
        htmlConversions.delete(id);
      }
    }
    
    return {
      success: true,
      conversionId: conversionId,
      url: url,
      size: html.length,
      format: format,
      downloadUrl: `/api/download/html/${conversionId}`,
      viewUrl: `/api/view/html/${conversionId}`,
      expiresAt: new Date(timestamp + 3600000).toISOString()
    };
    
  } catch (error) {
    console.error('HTML conversion error:', error);
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

function cleanHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMainContent(html) {
  // Try to find main content area
  const patterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Fallback: remove headers, footers, nav
  return html
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
}

// ============================================
// EXISTING HELPER FUNCTIONS (behouden)
// ============================================

// [Alle bestaande helper functions blijven hetzelfde: 
// calculateKeywordDensity, validateStatistics, validateExpertQuotes, 
// detectCaseStudies, detectFAQ, countImagesWithAlt, countLinks, 
// detectSchemaMarkup, calculateEnhancedTechnicalScore]

// ============================================
// NIEUWE ENDPOINTS
// ============================================

// 1. Systeem Uitleg Endpoint
app.get('/api/system/explanation', (req, res) => {
  res.json({
    success: true,
    explanation: EXPLANATION_CONTENT,
    endpoints: {
      convertUrlToHtml: 'POST /api/convert/url-to-html',
      downloadHtml: 'GET /api/download/html/:id',
      viewHtml: 'GET /api/view/html/:id',
      enhancedScan: 'POST /api/scan (with full validation)',
      eliteAnalysis: 'POST /api/elite/analyze/enhanced',
      contentValidation: 'POST /api/validate/content'
    },
    quickStart: {
      step1: 'Plaats URL in scanner voor complete analyse',
      step2: 'Krijg gedetailleerde score + aanbevelingen',
      step3: 'Gebruik Elite Framework voor 95-100/100 content',
      step4: 'Download HTML van elke pagina voor analyse'
    }
  });
});

// 2. URL naar HTML Converter
app.post('/api/convert/url-to-html', async (req, res) => {
  try {
    const { url, format = 'clean', force = false } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is verplicht' 
      });
    }
    
    let scanUrl = url;
    if (!scanUrl.startsWith('http')) {
      scanUrl = 'https://' + scanUrl;
    }
    
    console.log(`🔄 URL to HTML conversion requested: ${scanUrl}`);
    
    const result = await convertUrlToHtml(scanUrl, format);
    
    res.json({
      success: true,
      message: 'URL succesvol geconverteerd naar HTML',
      data: result,
      tips: [
        'Download de HTML voor offline analyse',
        'Gebruik "content-only" format voor alleen de hoofdcontent',
        'HTML blijft 1 uur beschikbaar via de download link',
        'Combineer met ContentScale scan voor complete analyse'
      ]
    });
    
  } catch (error) {
    console.error('Conversion endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      alternative: 'Probeer een andere URL of contacteer support'
    });
  }
});

// 3. HTML Download Endpoint
app.get('/api/download/html/:conversionId', async (req, res) => {
  try {
    const { conversionId } = req.params;
    const conversion = htmlConversions.get(conversionId);
    
    if (!conversion) {
      return res.status(404).json({ 
        success: false, 
        error: 'HTML conversie niet gevonden of verlopen' 
      });
    }
    
    // Check expiration
    if (Date.now() - conversion.timestamp > 3600000) {
      htmlConversions.delete(conversionId);
      return res.status(410).json({ 
        success: false, 
        error: 'HTML conversie is verlopen (1 uur geldig)' 
      });
    }
    
    const domain = new URL(conversion.url).hostname.replace(/^www\./, '');
    const filename = `content-from-${domain}-${Date.now()}.html`;
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', conversion.html.length);
    
    res.send(conversion.html);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Download mislukt' 
    });
  }
});

// 4. HTML View Endpoint (voor preview)
app.get('/api/view/html/:conversionId', async (req, res) => {
  try {
    const { conversionId } = req.params;
    const conversion = htmlConversions.get(conversionId);
    
    if (!conversion) {
      return res.status(404).send(`
        <html>
          <head><title>HTML Niet Gevonden</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>HTML Conversie Niet Gevonden</h1>
            <p>De gevraagde HTML is verlopen of niet gevonden.</p>
            <p>HTML conversies zijn 1 uur geldig.</p>
            <a href="/">Terug naar ContentScale</a>
          </body>
        </html>
      `);
    }
    
    // Check expiration
    if (Date.now() - conversion.timestamp > 3600000) {
      htmlConversions.delete(conversionId);
      return res.status(410).send(`
        <html>
          <head><title>HTML Verlopen</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>HTML Conversie Verlopen</h1>
            <p>Deze HTML conversie is verlopen (1 uur geldig).</p>
            <p>Maak een nieuwe conversie aan via het formulier.</p>
            <a href="/">Terug naar ContentScale</a>
          </body>
        </html>
      `);
    }
    
    // Send HTML with wrapper for better viewing
    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>HTML Preview: ${conversion.url}</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f5f5f5;
            }
            .header {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .info {
              background: #e8f4fd;
              padding: 15px;
              border-radius: 6px;
              margin-bottom: 20px;
              border-left: 4px solid #2196F3;
            }
            .content {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .actions {
              margin-top: 20px;
              display: flex;
              gap: 10px;
            }
            .btn {
              padding: 10px 20px;
              background: #2196F3;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              text-decoration: none;
              display: inline-block;
            }
            .btn:hover {
              background: #1976D2;
            }
            .btn.secondary {
              background: #6c757d;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📄 HTML Preview</h1>
            <p><strong>URL:</strong> ${conversion.url}</p>
            <p><strong>Format:</strong> ${conversion.format}</p>
            <p><strong>Size:</strong> ${(conversion.html.length / 1024).toFixed(2)} KB</p>
          </div>
          
          <div class="info">
            <h3>💡 Tips voor analyse:</h3>
            <ul>
              <li>Download de HTML voor gedetailleerde SEO analyse</li>
              <li>Scan deze URL met ContentScale voor complete score</li>
              <li>Check op schema markup, alt tags, en interne links</li>
            </ul>
          </div>
          
          <div class="actions">
            <a href="/api/download/html/${conversionId}" class="btn">📥 Download HTML</a>
            <a href="/scan?url=${encodeURIComponent(conversion.url)}" class="btn secondary">🔍 Scan met ContentScale</a>
            <a href="/" class="btn secondary">🏠 Home</a>
          </div>
          
          <div class="content">
            ${conversion.html}
          </div>
          
          <script>
            // Add some interactivity
            document.addEventListener('DOMContentLoaded', function() {
              // Add copy buttons to code blocks
              const codeBlocks = document.querySelectorAll('pre');
              codeBlocks.forEach(block => {
                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copy';
                copyBtn.style.cssText = 'position:absolute; top:10px; right:10px; padding:5px 10px; background:#2196F3; color:white; border:none; border-radius:3px; cursor:pointer;';
                copyBtn.onclick = () => {
                  navigator.clipboard.writeText(block.textContent);
                  copyBtn.textContent = 'Copied!';
                  setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                };
                block.style.position = 'relative';
                block.appendChild(copyBtn);
              });
            });
          </script>
        </body>
      </html>
    `;
    
    res.send(wrappedHtml);
    
  } catch (error) {
    console.error('View error:', error);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>Error Loading HTML</h1>
          <p>${error.message}</p>
          <a href="/">Terug naar ContentScale</a>
        </body>
      </html>
    `);
  }
});

// 5. Enhanced Quick Scan (snel, zonder AI)
app.post('/api/scan/quick', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is verplicht' 
      });
    }
    
    let scanUrl = url;
    if (!scanUrl.startsWith('http')) {
      scanUrl = 'https://' + scanUrl;
    }
    
    console.log(`⚡ Quick scan: ${scanUrl}`);
    
    const fetchResult = await fetchWithPuppeteer(scanUrl);
    if (!fetchResult.success) {
      throw new Error('Kan URL niet laden');
    }
    
    const rawHtml = fetchResult.rawHtml;
    const contentForAI = extractContentForAI(fetchResult);
    
    // Technical analysis only (fast)
    const technicalAnalysis = calculateEnhancedTechnicalScore(rawHtml, scanUrl);
    const technicalScore = technicalAnalysis.score;
    
    // Basic content analysis
    const wordCount = contentForAI.content.split(/\s+/).length;
    const headingCount = (contentForAI.content.match(/\[H\d\]:/g) || []).length;
    const images = countImagesWithAlt(rawHtml);
    const links = countLinks(rawHtml, scanUrl);
    const schema = detectSchemaMarkup(rawHtml);
    
    // Quick score estimation
    let quickScore = technicalScore;
    
    // Add points based on basic metrics
    if (wordCount > 1500) quickScore += 20;
    else if (wordCount > 1000) quickScore += 15;
    else if (wordCount > 500) quickScore += 10;
    else quickScore += 5;
    
    if (headingCount > 5) quickScore += 10;
    if (images.total > 3) quickScore += 5;
    if (links.internal > 5) quickScore += 5;
    if (schema.article || schema.faqpage) quickScore += 5;
    
    quickScore = Math.min(100, quickScore);
    
    const recommendations = [];
    
    if (technicalAnalysis.details.metaDescription === null) {
      recommendations.push({
        type: 'quickwin',
        title: 'Voeg Meta Description toe',
        description: 'Ontbrekende meta description vermindert CTR',
        priority: 'high'
      });
    }
    
    if (images.altPercentage < 70) {
      recommendations.push({
        type: 'quickwin',
        title: 'Verbeter Image ALT tekst',
        description: `Slechts ${images.altPercentage}% van afbeeldingen heeft ALT tekst`,
        priority: 'medium'
      });
    }
    
    if (wordCount < 1000) {
      recommendations.push({
        type: 'major',
        title: 'Verhoog woordenaantal',
        description: `Momenteel ${wordCount} woorden (doel: 1500+)`,
        priority: 'high'
      });
    }
    
    res.json({
      success: true,
      url: scanUrl,
      score: quickScore,
      quality: quickScore >= 70 ? 'goed' : quickScore >= 50 ? 'gemiddeld' : 'laag',
      metrics: {
        word_count: wordCount,
        headings: headingCount,
        images: images.total,
        images_with_alt: images.withAlt,
        internal_links: links.internal,
        external_links: links.external,
        schema_markup: Object.values(schema).filter(v => v === true).length
      },
      technical_score: technicalScore,
      technical_breakdown: technicalAnalysis.breakdown,
      recommendations: recommendations,
      next_steps: [
        'Gebruik volledige scan voor gedetailleerde AI-analyse',
        'Download HTML voor offline review',
        'Scan concurrerende URLs voor vergelijking'
      ],
      scan_type: 'quick',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Quick scan error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 6. Batch Analysis Endpoint
app.post('/api/analyze/batch', async (req, res) => {
  try {
    const { urls, type = 'quick' } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'URLs array is verplicht' 
      });
    }
    
    if (urls.length > 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximaal 10 URLs per batch' 
      });
    }
    
    console.log(`📊 Batch analysis requested: ${urls.length} URLs`);
    
    const results = [];
    const errors = [];
    
    for (const url of urls.slice(0, 10)) {
      try {
        let scanUrl = url;
        if (!scanUrl.startsWith('http')) {
          scanUrl = 'https://' + scanUrl;
        }
        
        const fetchResult = await fetchWithPuppeteer(scanUrl);
        if (!fetchResult.success) {
          errors.push({ url: scanUrl, error: 'Failed to fetch' });
          continue;
        }
        
        const rawHtml = fetchResult.rawHtml;
        const technicalAnalysis = calculateEnhancedTechnicalScore(rawHtml, scanUrl);
        
        results.push({
          url: scanUrl,
          technical_score: technicalAnalysis.score,
          title: fetchResult.title || 'Unknown',
          word_count: rawHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).length,
          status: 'success'
        });
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errors.push({ url: url, error: error.message });
      }
    }
    
    // Calculate averages
    const avgScore = results.length > 0 
      ? results.reduce((sum, r) => sum + r.technical_score, 0) / results.length 
      : 0;
    
    const avgWordCount = results.length > 0
      ? results.reduce((sum, r) => sum + r.word_count, 0) / results.length
      : 0;
    
    res.json({
      success: true,
      summary: {
        total_urls: urls.length,
        successful: results.length,
        failed: errors.length,
        average_score: Math.round(avgScore),
        average_word_count: Math.round(avgWordCount)
      },
      results: results,
      errors: errors,
      recommendations: generateBatchRecommendations(results),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

function generateBatchRecommendations(results) {
  const recs = [];
  
  if (results.length === 0) return recs;
  
  const lowScoring = results.filter(r => r.technical_score < 40);
  if (lowScoring.length > 0) {
    recs.push({
      type: 'urgent',
      title: 'Lage technische scores gevonden',
      description: `${lowScoring.length} van de ${results.length} URLs scoren onder 40/100`,
      action: 'Focus eerst op technische SEO optimalisatie'
    });
  }
  
  const avgWordCount = results.reduce((sum, r) => sum + r.word_count, 0) / results.length;
  if (avgWordCount < 800) {
    recs.push({
      type: 'improvement',
      title: 'Gemiddeld woordenaantal te laag',
      description: `Gemiddeld ${Math.round(avgWordCount)} woorden (doel: 1500+)`,
      action: 'Investeer in langere, diepgaande content'
    });
  }
  
  return recs;
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static files
app.use(express.static('public'));

// ============================================
// EXISTING ENDPOINTS (behouden met kleine verbeteringen)
// ============================================

// [Alle bestaande endpoints blijven werken: 
// /api/scan, /api/scan/elite, /api/elite/analyze/enhanced,
// /api/validate/content, /api/test/validation, /api/health/enhanced]

// Update de bestaande /api/scan om HTML conversion aan te bieden
// Voeg deze code toe in de bestaande /api/scan endpoint (rond regel waar je scanResult maakt):

// In de /api/scan endpoint, voeg dit toe aan het scanResult object:
const scanResult = {
  // ... bestaande properties ...
  
  tools: {
    html_conversion: {
      available: true,
      endpoint: '/api/convert/url-to-html',
      formats: ['clean', 'content-only', 'full'],
      message: 'Download de HTML van deze pagina voor gedetailleerde analyse'
    },
    quick_scan: {
      available: true,
      endpoint: '/api/scan/quick',
      message: 'Snel scannen zonder AI voor technische check'
    },
    batch_analysis: {
      available: true,
      endpoint: '/api/analyze/batch',
      message: 'Analyseer meerdere URLs in één keer'
    }
  },
  
  next_steps: [
    'Download HTML voor offline review',
    'Scan concurrerende URLs voor vergelijking',
    'Gebruik Elite Framework voor 95-100/100 score',
    'Batch analyse voor complete website audit'
  ]
};

// ============================================
// NIEUWE HEALTH CHECK MET ALLE FEATURES
// ============================================
app.get('/api/health/full', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    
    res.json({
      status: 'healthy',
      system: 'ContentScale Ultimate v3.0',
      timestamp: new Date().toISOString(),
      
      components: {
        database: 'connected',
        puppeteer: 'ready',
        cache: 'active',
        html_conversions: htmlConversions.size,
        api_keys: {
          anthropic: hasApiKey ? 'configured' : 'not_configured'
        }
      },
      
      features: {
        enhanced_scanning: 'active',
        elite_framework: 'active',
        content_validation: 'active',
        html_conversion: 'active',
        quick_scan: 'active',
        batch_analysis: 'active',
        real_time_analysis: 'active'
      },
      
      endpoints: {
        scan: 'POST /api/scan (enhanced with validation)',
        scan_elite: 'POST /api/scan/elite (generous scoring)',
        scan_quick: 'POST /api/scan/quick (fast technical)',
        convert_html: 'POST /api/convert/url-to-html',
        download_html: 'GET /api/download/html/:id',
        view_html: 'GET /api/view/html/:id',
        batch_analyze: 'POST /api/analyze/batch',
        validate_content: 'POST /api/validate/content',
        elite_analyze: 'POST /api/elite/analyze/enhanced',
        system_explanation: 'GET /api/system/explanation'
      },
      
      limits: {
        html_conversion_ttl: '1 hour',
        cache_ttl: '24 hours',
        batch_max_urls: 10,
        scan_timeout: '30 seconds'
      },
      
      statistics: {
        cache_size: scanCache.size,
        html_conversions: htmlConversions.size,
        uptime: process.uptime()
      }
    });
    
  } catch (error) {
    res.json({ 
      status: 'degraded', 
      error: error.message,
      system: 'ContentScale Ultimate v3.0'
    });
  }
});

// ============================================
// CREATE ALL TABLES (met nieuwe tabellen)
// ============================================
async function createAllTables() {
  const client = await pool.connect();
  
  try {
    // Bestaande tabellen...
    
    // Nieuwe tabel voor HTML conversies
    await client.query(`
      CREATE TABLE IF NOT EXISTS html_conversions (
        id SERIAL PRIMARY KEY,
        conversion_id VARCHAR(64) UNIQUE,
        url TEXT NOT NULL,
        html_size INTEGER,
        format VARCHAR(20),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `).catch(e => console.log('HTML conversions table exists:', e.message));
    
    // Nieuwe tabel voor batch analyses
    await client.query(`
      CREATE TABLE IF NOT EXISTS batch_analyses (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(64),
        urls TEXT[],
        results JSONB,
        summary JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(e => console.log('Batch analyses table exists:', e.message));
    
    console.log('✅ Ultimate database tables ready');
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    client.release();
  }
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  await createAllTables();
  
  console.log('');
  console.log('🚀 ================================================');
  console.log('🚀  CONTENTSCALE ULTIMATE v3.0 - SERVER RUNNING');
  console.log('🚀 ================================================');
  console.log('');
  console.log('📍 Frontend:           http://localhost:' + PORT);
  console.log('📍 Admin:              http://localhost:' + PORT + '/admin');
  console.log('📍 Health Check:       http://localhost:' + PORT + '/api/health/full');
  console.log('📍 System Explanation: http://localhost:' + PORT + '/api/system/explanation');
  console.log('');
  console.log('🏆 ULTIMATE FEATURES:');
  console.log('   ✓ Enhanced AI Scoring (Claude 3.5)');
  console.log('   ✓ HTML Conversion & Download');
  console.log('   ✓ Batch URL Analysis');
  console.log('   ✓ Quick Technical Scans');
  console.log('   ✓ Elite Framework (95-100/100)');
  console.log('   ✓ Real-time Content Validation');
  console.log('   ✓ Schema Markup Detection');
  console.log('   ✓ Expert Quotes Validation');
  console.log('');
  console.log('🛠️  NIEUWE TOOLS VOOR SPECIALISTEN:');
  console.log('   1. URL → HTML Converter (zoals urltoany.com)');
  console.log('   2. Batch Analysis (max 10 URLs)');
  console.log('   3. Quick Technical Scan (zonder AI)');
  console.log('   4. Complete Content Validation');
  console.log('');
  console.log('💡 VOOR SEO SPECIALISTEN:');
  console.log('   - Download HTML van elke pagina');
  console.log('   - Analyseer complete websites in batch');
  console.log('   - Krijg concrete, uitvoerbare aanbevelingen');
  console.log('   - Bereik Elite scores (95-100/100)');
  console.log('');
  console.log('👤 Default Login: ot / admin123');
  console.log('');
  console.log('⚡ READY FOR ELITE CONTENT OPTIMIZATION!');
  console.log('');
});

// ============================================
// HELPER FUNCTIONS (moeten bovenaan gedefinieerd worden)
// ============================================

// Puppeteer fetcher (moet herhaald worden als het nog niet bestaat)
async function fetchWithPuppeteer(url) {
  // ... [de volledige fetchWithPuppeteer implementatie] ...
}

async function fetchWithFallback(url) {
  // ... [de volledige fetchWithFallback implementatie] ...
}

function extractContentForAI(fetchResult) {
  // ... [de volledige extractContentForAI implementatie] ...
}

async function scoreWithAI(contentForAI, useEnhancedPrompt = true) {
  // ... [de volledige scoreWithAI implementatie] ...
}

async function scoreWithEliteAI(contentForAI) {
  // ... [de volledige scoreWithEliteAI implementatie] ...
}

// Alle validation helper functions...
function calculateKeywordDensity(text, keyword) {
  // ... implementatie ...
}

function validateStatistics(content) {
  // ... implementatie ...
}

function validateExpertQuotes(content) {
  // ... implementatie ...
}

function detectCaseStudies(content) {
  // ... implementatie ...
}

function detectFAQ(content) {
  // ... implementatie ...
}

function countImagesWithAlt(html) {
  // ... implementatie ...
}

function countLinks(html, baseUrl) {
  // ... implementatie ...
}

function detectSchemaMarkup(html) {
  // ... implementatie ...
}

function calculateEnhancedTechnicalScore(html, url) {
  // ... implementatie ...
}

function validateEnhancedAIScores(ai) {
  // ... implementatie ...
}

function generateValidationRecommendations(validation, breakdown) {
  // ... implementatie ...
}
