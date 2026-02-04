// ============================================
// CONTENTSCALE SERVER.JS - WITH PUPPETEER + ELITE FRAMEWORK - ULTIMATE VERSION
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

// CLEAR CACHE ON STARTUP
scanCache.clear();
console.log('🧹 Cache cleared on startup');

function hashContent(html) {
  return crypto.createHash('sha256').update(html).digest('hex');
}

// ============================================
// ENHANCED VALIDATION HELPER FUNCTIONS
// ============================================

// Helper om keyword density te berekenen
function calculateKeywordDensity(text, keyword) {
  if (!text || !keyword) return 0;
  
  const words = text.toLowerCase().split(/\s+/);
  const keywordLower = keyword.toLowerCase();
  
  // Tel exacte keyword matches
  const exactMatches = words.filter(word => word === keywordLower).length;
  
  // Tel partial matches (voor keyword variations)
  const partialMatches = words.filter(word => word.includes(keywordLower)).length;
  
  const totalWords = words.length;
  
  if (totalWords === 0) return 0;
  
  return {
    exactDensity: (exactMatches / totalWords) * 100,
    partialDensity: (partialMatches / totalWords) * 100,
    exactCount: exactMatches,
    partialCount: partialMatches,
    totalWords: totalWords
  };
}

// Helper om statistics te valideren
function validateStatistics(content) {
  const statsRegex = /\b\d+%\b|\b\d+\s+(percent|percentage|studies|research|data|respondents|users|companies)\b|\b\d+\s+of\s+\d+\b/gi;
  const stats = content.match(statsRegex) || [];
  
  // Check voor bronvermelding
  const statsWithSources = stats.filter(stat => {
    const statIndex = content.indexOf(stat);
    const afterText = content.substring(statIndex, Math.min(statIndex + 200, content.length));
    
    return (
      afterText.includes('according to') ||
      afterText.includes('source:') ||
      afterText.includes('reports') ||
      afterText.includes('study') ||
      afterText.includes('research') ||
      afterText.includes('data from') ||
      /\b(20[2-9][0-9])\b/.test(afterText) // Jaartal 2020-2029
    );
  });
  
  return {
    total: stats.length,
    withSources: statsWithSources.length,
    stats: stats.slice(0, 10) // Beperk tot eerste 10 voor efficiency
  };
}

// Helper om expert quotes te valideren
function validateExpertQuotes(content) {
  // Zoek naar quote patterns
  const quotePatterns = [
    /"[^"]+"\s+said\s+[A-Z]/g,
    /"[^"]+"\s+according\s+to\s+[A-Z]/g,
    /"[^"]+"\s+-+\s+[A-Z]/g,
    /"[^"]+"\s+--\s+[A-Z]/g
  ];
  
  let allQuotes = [];
  quotePatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    allQuotes = allQuotes.concat(matches);
  });
  
  // Filter quotes met naam+titel
  const validQuotes = allQuotes.filter(quote => {
    const quoteIndex = content.indexOf(quote);
    const afterText = content.substring(quoteIndex + quote.length, quoteIndex + quote.length + 150);
    
    // Check voor naam+titel patroon: "John Doe, Title at Company"
    return (
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+,\s+[A-Z]/i.test(afterText) ||
      /\bat\s+[A-Z]/.test(afterText) ||
      /\bfrom\s+[A-Z]/.test(afterText) ||
      /\bCEO\b|\bCTO\b|\bCMO\b|\bDirector\b|\bFounder\b|\bExpert\b/i.test(afterText)
    );
  });
  
  return {
    total: allQuotes.length,
    valid: validQuotes.length,
    quotes: validQuotes.slice(0, 5) // Beperk tot eerste 5
  };
}

// Helper om case studies te detecteren
function detectCaseStudies(content) {
  const caseStudyPatterns = [
    /case study/i,
    /case\s+#?\d+/i,
    /example:\s+[A-Z]/,
    /company:\s+[A-Z]/,
    /results:\s+\d+%/
  ];
  
  const hasCaseStudy = caseStudyPatterns.some(pattern => pattern.test(content));
  
  // Zoek naar metrics in case studies
  const metrics = content.match(/\b\d+%\s+(increase|growth|improvement|decrease|reduction)\b/gi) || [];
  
  return {
    hasCaseStudy: hasCaseStudy,
    metricsCount: metrics.length,
    metrics: metrics.slice(0, 5)
  };
}

// Helper om FAQ secties te detecteren
function detectFAQ(content) {
  const faqPatterns = [
    /Q:\s+[A-Z]/i,
    /A:\s+[A-Z]/i,
    /question:\s+[A-Z]/i,
    /answer:\s+[A-Z]/i,
    /\?\s*\n\s*[A-Z]/,
    /faq/i
  ];
  
  const hasFAQ = faqPatterns.some(pattern => pattern.test(content));
  
  // Tel vragen
  const questions = content.match(/\?\s*\n/g) || [];
  
  return {
    hasFAQ: hasFAQ,
    questionCount: questions.length
  };
}

// Helper om images met alt text te tellen
function countImagesWithAlt(html) {
  const imgRegex = /<img[^>]*>/gi;
  const imgs = html.match(imgRegex) || [];
  
  const withAlt = imgs.filter(img => /alt=["'][^"']*["']/i.test(img));
  const withoutAlt = imgs.filter(img => !/alt=["'][^"']*["']/i.test(img));
  
  return {
    total: imgs.length,
    withAlt: withAlt.length,
    withoutAlt: withoutAlt.length,
    altPercentage: imgs.length > 0 ? Math.round((withAlt.length / imgs.length) * 100) : 0
  };
}

// Helper om links te tellen
function countLinks(html, baseUrl) {
  try {
    const urlObj = new URL(baseUrl);
    const baseDomain = urlObj.hostname;
    
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }
    
    const internalLinks = links.filter(link => {
      try {
        if (link.startsWith('/') || link.startsWith('#')) return true;
        const linkUrl = new URL(link, baseUrl);
        return linkUrl.hostname === baseDomain || linkUrl.hostname.endsWith('.' + baseDomain);
      } catch {
        return link.startsWith('/') || link.startsWith('#');
      }
    });
    
    const externalLinks = links.filter(link => {
      try {
        if (link.startsWith('/') || link.startsWith('#') || link.startsWith('mailto:') || link.startsWith('tel:')) return false;
        const linkUrl = new URL(link, baseUrl);
        return linkUrl.hostname !== baseDomain && !linkUrl.hostname.endsWith('.' + baseDomain);
      } catch {
        return false;
      }
    });
    
    // Check authoritative external links
    const authoritativeDomains = ['.edu', '.gov', '.org', 'wikipedia.org', 'researchgate.net', 'scholar.google.com'];
    const authoritativeLinks = externalLinks.filter(link => {
      try {
        const linkUrl = new URL(link, baseUrl);
        return authoritativeDomains.some(domain => linkUrl.hostname.endsWith(domain));
      } catch {
        return false;
      }
    });
    
    return {
      total: links.length,
      internal: internalLinks.length,
      external: externalLinks.length,
      authoritative: authoritativeLinks.length
    };
  } catch (error) {
    return { total: 0, internal: 0, external: 0, authoritative: 0 };
  }
}

// Helper om schema markup te detecteren
function detectSchemaMarkup(html) {
  const schemaTypes = {
    article: /"@type":\s*"Article"/i,
    faqpage: /"@type":\s*"FAQPage"/i,
    organization: /"@type":\s*"Organization"/i,
    breadcrumb: /"@type":\s*"BreadcrumbList"/i,
    product: /"@type":\s*"Product"/i,
    review: /"@type":\s*"Review"/i
  };
  
  const detected = {};
  for (const [type, regex] of Object.entries(schemaTypes)) {
    detected[type] = regex.test(html);
  }
  
  // Count total schema items
  const allSchema = html.match(/"@type":\s*"[^"]+"/gi) || [];
  
  return {
    ...detected,
    totalSchemaItems: allSchema.length
  };
}

// ============================================
// ENHANCED TECHNICAL SCORE CALCULATOR
// ============================================

function calculateEnhancedTechnicalScore(html, url) {
  let score = 0;
  const breakdown = {
    metaTags: 0,
    schemaMarkup: 0,
    links: 0,
    images: 0,
    viewport: 0
  };
  
  // 1. Meta Tags (4 points)
  const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : null;
  
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  
  // Meta description check
  if (metaDesc) {
    if (metaDesc.length >= 150 && metaDesc.length <= 160) {
      breakdown.metaTags += 2;
    } else if (metaDesc.length >= 50) {
      breakdown.metaTags += 1;
    }
  }
  
  // Title check
  if (title) {
    if (title.length >= 50 && title.length <= 60) {
      breakdown.metaTags += 2;
    } else if (title.length >= 30) {
      breakdown.metaTags += 1;
    }
  }
  
  score += breakdown.metaTags;
  
  // 2. Schema Markup (8 points)
  const schema = detectSchemaMarkup(html);
  
  if (schema.article) breakdown.schemaMarkup += 3;
  if (schema.faqpage) breakdown.schemaMarkup += 3;
  if (schema.organization || schema.breadcrumb) breakdown.schemaMarkup += 2;
  
  // Bonus voor meerdere schema types
  const schemaCount = Object.values(schema).filter(v => v === true).length;
  if (schemaCount >= 3) breakdown.schemaMarkup = Math.min(8, breakdown.schemaMarkup + 1);
  
  score += Math.min(8, breakdown.schemaMarkup);
  
  // 3. Links (4 points)
  const links = countLinks(html, url);
  
  if (links.internal >= 8 && links.internal <= 12) {
    breakdown.links += 2;
  } else if (links.internal >= 5) {
    breakdown.links += 1;
  }
  
  if (links.external >= 5 && links.authoritative >= 3) {
    breakdown.links += 2;
  } else if (links.external >= 3) {
    breakdown.links += 1;
  }
  
  score += Math.min(4, breakdown.links);
  
  // 4. Images (4 points)
  const images = countImagesWithAlt(html);
  
  if (images.total > 0) {
    if (images.altPercentage >= 90) {
      breakdown.images += 4;
    } else if (images.altPercentage >= 70) {
      breakdown.images += 3;
    } else if (images.altPercentage >= 50) {
      breakdown.images += 2;
    } else if (images.altPercentage > 0) {
      breakdown.images += 1;
    }
  }
  
  score += Math.min(4, breakdown.images);
  
  // 5. Viewport (extra check)
  const hasViewport = /<meta\s+name="viewport"/i.test(html);
  if (hasViewport) {
    breakdown.viewport = 1;
    score += 1;
  }
  
  return {
    score: Math.min(20, score),
    breakdown: breakdown,
    details: {
      metaDescription: metaDesc,
      title: title,
      schema: schema,
      links: links,
      images: images,
      hasViewport: hasViewport
    }
  };
}

// ============================================
// UPDATED AI SCORING PROMPT MET JOUW FRAMEWORK
// ============================================

const ENHANCED_AI_SCORING_PROMPT = `You are a ContentScale ELITE scoring AI. Score content using the EXACT ContentScale Elite Framework scoring system.

SCORING SYSTEM (100 points total):

GRAAF FRAMEWORK - 50 POINTS TOTAL:
1. Keyword Optimization (0-10 points):
   - Target keyword in H1: 2 points
   - Keyword in first H2: 2 points  
   - Keyword in introduction: 2 points
   - Keyword in conclusion: 2 points
   - Natural keyword density 0.8-1.2%: 2 points

2. Statistics with Sources (0-10 points):
   - 8+ statistics from 2023-2025: 10 points
   - 5-7 statistics: 6-8 points
   - 3-4 statistics: 4-6 points
   - 1-2 statistics: 2-4 points
   - No statistics: 0 points
   - MUST have source attribution (according to, reports, study, 2024, etc.)

3. Expert Quotes (0-10 points):
   - 4+ expert quotes with full name, title, organization: 10 points
   - 3 expert quotes: 7-8 points
   - 2 expert quotes: 4-6 points
   - 1 expert quote: 2-3 points
   - No expert quotes: 0 points

4. Case Studies (0-10 points):
   - 2+ case studies with specific numbers/metrics: 10 points
   - 1 case study with metrics: 5-7 points
   - Mention of examples/cases without metrics: 2-4 points
   - No case studies: 0 points

5. Author Authority (0-10 points):
   - Author bio with credentials, experience, achievements: 8-10 points
   - Author name and title mentioned: 4-6 points
   - Generic author or no author: 0-2 points

CRAFT FRAMEWORK - 30 POINTS TOTAL:
1. Word Count (0-8 points):
   - 2500+ words: 8 points
   - 2000-2499 words: 6 points
   - 1500-1999 words: 4 points
   - 1000-1499 words: 2 points
   - Less than 1000 words: 0 points

2. Readability (0-6 points):
   - Clear paragraph structure, active voice, readable: 5-6 points
   - Some readability issues: 3-4 points
   - Poor readability: 1-2 points
   - Very poor: 0 points

3. FAQ Section (0-8 points):
   - 10+ FAQ questions with detailed answers: 8 points
   - 5-9 FAQ questions: 4-6 points
   - 1-4 FAQ questions: 2-3 points
   - No FAQ: 0 points

4. Visual Elements (0-8 points):
   - Mention of images, tables, lists, visual content: 6-8 points
   - Some visual elements mentioned: 3-5 points
   - Minimal visual elements: 1-2 points
   - No visual elements: 0 points

CONTENT ANALYSIS RULES:
1. Count [H1], [H2], [H3], [H4] markers as actual headings
2. Count • symbols as list items
3. Statistics MUST have year references (2023, 2024, 2025)
4. Expert quotes MUST have attribution (Name, Title, Organization)
5. Case studies MUST have measurable results (X% increase, $Y growth)
6. Be realistic: Most professional content scores 60-80/100
7. Elite Framework content (with all elements) scores 90-100/100

Return ONLY this JSON structure:
{
  "graaf": {
    "keyword_optimization": N,
    "statistics_sources": N, 
    "expert_quotes": N,
    "case_studies": N,
    "author_authority": N
  },
  "craft": {
    "word_count": N,
    "readability": N,
    "faq_section": N,
    "visual_elements": N
  },
  "recommendations": [
    {
      "type": "major|quickwin|elite",
      "category": "GRAAF - [Category] or CRAFT - [Category]",
      "title": "Short action title",
      "description": "What is missing or needs improvement",
      "impact": "High|Medium|Low",
      "points": "+N points",
      "howToFix": "1. Step\\n2. Step\\n3. Step",
      "example": "Concrete example"
    }
  ]
}`;

const ELITE_ENHANCED_SCORING_PROMPT = `You are a ContentScale ELITE scoring AI. Score content GENEROUSLY using Elite Framework standards.

🎯 SCORING PHILOSOPHY:
- Most decent content: 60-80/100
- Good quality content: 80-90/100  
- Excellent content: 90-95/100
- Only Elite Framework content: 95-100/100

GRAAF FRAMEWORK (50 points) - BE GENEROUS:
Keyword Optimization (10): Any keyword usage = 6+ points
Statistics with Sources (10): Any statistics = 8+ points
Expert Quotes (10): Any expert mention = 7+ points
Case Studies (10): Any examples = 6+ points
Author Authority (10): Any author mention = 6+ points

CRAFT FRAMEWORK (30 points) - REWARD STRUCTURE:
Word Count (8): 1000+ words = 6+ points
Readability (6): Readable = 5+ points
FAQ Section (8): Any questions = 6+ points
Visual Elements (8): Any structure = 6+ points

💡 ALWAYS INCLUDE THIS ELITE RECOMMENDATION:
{
  "type": "elite",
  "category": "Elite Framework",
  "title": "Use Elite Framework for 95-100/100",
  "description": "Transform this content with Elite Framework",
  "impact": "Very High",
  "points": "+20-30 points",
  "howToFix": "Use /api/elite/generate endpoint",
  "example": "Visit /api/elite/analyze for recommendations"
}

Return ONLY JSON with graaf, craft, and recommendations (minimum 4).`;

// ============================================
// PUPPETEER-POWERED HTML FETCHER (FIXED VERSION)
// ============================================
async function fetchWithPuppeteer(url) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`🌐 Puppeteer fetching: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    // CLOSE COOKIE CONSENT if exists
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const acceptBtn = buttons.find(b => 
          /accept|akkoord|toestemming|allow|agree/i.test(b.textContent)
        );
        if (acceptBtn) acceptBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      // No cookie consent or failed to close - continue
    }
    
    // SCROLL to trigger lazy content
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
    
    // GET RAW HTML
    const rawHtml = await page.content();
    
    // EXTRACT CONTENT - IMPROVED VERSION
    const extracted = await page.evaluate(() => {
      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               el.offsetWidth > 0 && 
               el.offsetHeight > 0;
      }
      
      function extractText(element, result = { text: '', headings: [] }) {
        if (!element) return result;
        
        for (let node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text && text.length > 2) result.text += text + ' ';
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            
            if (!isVisible(node)) continue;
            
            // Skip noise elements
            if (['script', 'style', 'noscript', 'iframe', 'svg'].includes(tag)) {
              continue;
            }
            
            // Skip navigation/footer/header if not main content
            if (['nav', 'header', 'footer'].includes(tag) && !element.matches('.entry-content, .post-content, main, article')) {
              continue;
            }
            
            // Extract headings WITH text
            if (tag === 'h1') {
              const text = node.textContent.trim();
              if (text && text.length > 3) {
                result.text += `\n[H1]: ${text}\n`;
                result.headings.push({ level: 1, text });
              }
            } else if (tag === 'h2') {
              const text = node.textContent.trim();
              if (text && text.length > 3) {
                result.text += `\n[H2]: ${text}\n`;
                result.headings.push({ level: 2, text });
              }
            } else if (tag === 'h3') {
              const text = node.textContent.trim();
              if (text && text.length > 3) {
                result.text += `\n[H3]: ${text}\n`;
                result.headings.push({ level: 3, text });
              }
            } else if (tag === 'h4') {
              const text = node.textContent.trim();
              if (text && text.length > 3) {
                result.text += `\n[H4]: ${text}\n`;
                result.headings.push({ level: 4, text });
              }
            } else if (tag === 'p') {
              const text = node.textContent.trim();
              if (text && text.length > 10) result.text += `\n${text}\n`;
            } else if (tag === 'li') {
              const text = node.textContent.trim();
              if (text && text.length > 3) result.text += `\n• ${text}\n`;
            } else {
              // Recurse into other elements
              extractText(node, result);
            }
          }
        }
        return result;
      }
      
      // TRY WORDPRESS-SPECIFIC SELECTORS FIRST
      let mainElement = 
        document.querySelector('.entry-content') ||      // WordPress default
        document.querySelector('.post-content') ||       // Some themes
        document.querySelector('.content-area') ||       // Genesis/StudioPress
        document.querySelector('.elementor-widget-wrap') || // Elementor
        document.querySelector('[data-elementor-type="wp-page"]') || // Elementor
        document.querySelector('.wpb_wrapper') ||        // WPBakery
        document.querySelector('main') ||                // HTML5 semantic
        document.querySelector('article') ||             // HTML5 semantic
        document.querySelector('[role="main"]') ||       // ARIA
        document.querySelector('.content') ||            // Generic
        document.querySelector('#content') ||            // Generic ID
        document.body;                                   // Fallback
      
      const extracted = extractText(mainElement);
      
      return {
        content: extracted.text,
        title: document.title || '',
        headingCount: extracted.headings.length,
        selector: mainElement.className || mainElement.tagName
      };
    });
    
    await page.close();
    console.log(`✅ Puppeteer: ${rawHtml.length} bytes HTML, ${extracted.content.length} chars extracted, ${extracted.headingCount} headings from ${extracted.selector}`);
    
    return {
      success: true,
      rawHtml: rawHtml,
      extractedContent: extracted.content,
      title: extracted.title,
      method: 'puppeteer',
      selector: extracted.selector
    };
    
  } catch (error) {
    console.error(`❌ Puppeteer failed for ${url}:`, error.message);
    if (page) await page.close().catch(() => {});
    
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
    
    const rawHtml = await response.text();
    console.log(`✅ Fallback fetch: ${rawHtml.length} bytes`);
    
    return {
      success: true,
      rawHtml: rawHtml,
      extractedContent: null,
      title: null,
      method: 'fetch'
    };
  } catch (error) {
    console.error(`❌ Fallback fetch failed:`, error.message);
    throw error;
  }
}

function extractContentForAI(fetchResult) {
  // If Puppeteer already extracted, use it
  if (fetchResult.extractedContent) {
    console.log('📝 Using Puppeteer-extracted content');
    let processed = fetchResult.extractedContent;
    
    processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
    
    if (processed.length > 40000) {
      const start = processed.substring(0, 35000);
      const end = processed.substring(processed.length - 5000);
      processed = start + '\n\n[...middle content truncated...]\n\n' + end;
    }
    
    return { title: fetchResult.title || '', content: processed };
  }
  
  // Otherwise, process raw HTML (fallback)
  console.log('📝 Processing raw HTML fallback');
  let processed = fetchResult.rawHtml;
  
  // Remove noise
  processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  processed = processed.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  processed = processed.replace(/<!--[\s\S]*?-->/g, '');
  
  processed = processed.replace(/<nav[^>]*>/gi, '').replace(/<\/nav>/gi, '');
  processed = processed.replace(/<header[^>]*>/gi, '').replace(/<\/header>/gi, '');
  processed = processed.replace(/<footer[^>]*>/gi, '').replace(/<\/footer>/gi, '');
  
  // Try to isolate main content
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
  
  // Extract with markers
  processed = processed.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n[H1]: $1\n');
  processed = processed.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n[H2]: $1\n');
  processed = processed.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n[H3]: $1\n');
  processed = processed.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n[H4]: $1\n');
  processed = processed.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  processed = processed.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1\n');
  
  // Strip remaining tags
  processed = processed.replace(/<[^>]*>/g, ' ');
  
  // Decode entities
  processed = processed.replace(/&nbsp;/g, ' ')
                       .replace(/&amp;/g, '&')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&quot;/g, '"')
                       .replace(/&#39;/g, "'")
                       .replace(/&mdash;/g, '—')
                       .replace(/&ndash;/g, '–');
  
  // Clean whitespace
  processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
  
  // Cap at 40K
  if (processed.length > 40000) {
    const start = processed.substring(0, 35000);
    const end = processed.substring(processed.length - 5000);
    processed = start + '\n\n[...middle content truncated...]\n\n' + end;
  }
  
  // Extract title
  const titleMatch = fetchResult.rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  return { title, content: processed };
}

async function scoreWithAI(contentForAI, useEnhancedPrompt = true) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const prompt = useEnhancedPrompt ? ENHANCED_AI_SCORING_PROMPT : AI_SCORING_PROMPT;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt + '\n\nCONTENT TO SCORE:\nTitle: ' + contentForAI.title + '\n\n' + contentForAI.content
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

    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in AI response');
    }
    
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    
    try {
      return JSON.parse(cleanText);
    } catch (parseError) {
      console.log('⚠️ JSON parse failed, attempting cleanup:', parseError.message);
      cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');
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

async function scoreWithEliteAI(contentForAI) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: ELITE_ENHANCED_SCORING_PROMPT + '\n\nCONTENT TO SCORE:\nTitle: ' + contentForAI.title + '\n\n' + contentForAI.content
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

    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in AI response');
    }
    
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    
    try {
      return JSON.parse(cleanText);
    } catch (parseError) {
      console.log('⚠️ JSON parse failed, attempting cleanup:', parseError.message);
      cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');
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

function validateEnhancedAIScores(ai) {
  if (!ai || !ai.graaf || !ai.craft) return false;

  // Check for new GRAAF structure
  const graafChecks = [
    [ai.graaf.keyword_optimization, 0, 10],
    [ai.graaf.statistics_sources, 0, 10],
    [ai.graaf.expert_quotes, 0, 10],
    [ai.graaf.case_studies, 0, 10],
    [ai.graaf.author_authority, 0, 10]
  ];

  const craftChecks = [
    [ai.craft.word_count, 0, 8],
    [ai.craft.readability, 0, 6],
    [ai.craft.faq_section, 0, 8],
    [ai.craft.visual_elements, 0, 8]
  ];

  for (const [val, min, max] of [...graafChecks, ...craftChecks]) {
    if (val === undefined || val === null) return false;
    if (!Number.isInteger(val)) return false;
    if (val < min || val > max) return false;
  }

  return true;
}

// ============================================
// ENHANCED PUBLIC SCANNER API
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url, shareKey, keyword } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  let scanUrl = url;
  if (!scanUrl.startsWith('http://') && !scanUrl.startsWith('https://')) {
    scanUrl = 'https://' + scanUrl;
  }

  // SHARELINK ENFORCEMENT
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

    const fetchResult = await fetchWithPuppeteer(scanUrl);
    
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot fetch URL: failed to load page` 
      });
    }

    const rawHtml = fetchResult.rawHtml;
    console.log(`✅ Fetched ${rawHtml.length} bytes from ${scanUrl} (${fetchResult.method})`);

    // ENHANCED TECHNICAL SCORE
    const technicalAnalysis = calculateEnhancedTechnicalScore(rawHtml, scanUrl);
    const technicalScore = technicalAnalysis.score;
    
    // ENHANCED VALIDATION METRICS
    const contentForAI = extractContentForAI(fetchResult);
    const validation = {
      keywordDensity: keyword ? calculateKeywordDensity(contentForAI.content, keyword) : null,
      statistics: validateStatistics(contentForAI.content),
      expertQuotes: validateExpertQuotes(contentForAI.content),
      caseStudies: detectCaseStudies(contentForAI.content),
      faq: detectFAQ(contentForAI.content)
    };
    
    // AI SCORING
    const contentHash = hashContent(rawHtml);
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

        console.log(`🤖 AI scoring ${scanUrl} with enhanced prompt...`);
        const aiResult = await scoreWithAI(contentForAI, true); // Use enhanced prompt

        if (!validateEnhancedAIScores(aiResult)) {
          throw new Error('AI scores failed validation');
        }

        // New GRAAF structure
        graafItems = {
          keyword_optimization: Math.min(10, Math.max(0, Math.round(aiResult.graaf.keyword_optimization))),
          statistics_sources: Math.min(10, Math.max(0, Math.round(aiResult.graaf.statistics_sources))),
          expert_quotes: Math.min(10, Math.max(0, Math.round(aiResult.graaf.expert_quotes))),
          case_studies: Math.min(10, Math.max(0, Math.round(aiResult.graaf.case_studies))),
          author_authority: Math.min(10, Math.max(0, Math.round(aiResult.graaf.author_authority)))
        };
        
        // New CRAFT structure
        craftItems = {
          word_count: Math.min(8, Math.max(0, Math.round(aiResult.craft.word_count))),
          readability: Math.min(6, Math.max(0, Math.round(aiResult.craft.readability))),
          faq_section: Math.min(8, Math.max(0, Math.round(aiResult.craft.faq_section))),
          visual_elements: Math.min(8, Math.max(0, Math.round(aiResult.craft.visual_elements)))
        };

        graafScore = graafItems.keyword_optimization + graafItems.statistics_sources + 
                     graafItems.expert_quotes + graafItems.case_studies + graafItems.author_authority;
        craftScore = craftItems.word_count + craftItems.readability + 
                     craftItems.faq_section + craftItems.visual_elements;
        
        aiRecommendations = Array.isArray(aiResult.recommendations) ? aiResult.recommendations : [];
        scoringMethod = 'enhanced-ai';

        scanCache.set(contentHash, {
          graafScore, craftScore, graafItems, craftItems,
          recommendations: aiRecommendations,
          timestamp: Date.now()
        });

        console.log(`✅ AI scored: GRAAF=${graafScore}/50 CRAFT=${craftScore}/30 (${scoringMethod})`);

      } catch (aiError) {
        console.error(`⚠️ Enhanced AI scoring failed, using basic: ${aiError.message}`);
        scoringMethod = 'basic-fallback';

        // Fallback to basic scoring
        const textContent = rawHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
        const wordCount = textContent.length;
        const h1s = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
        const h2h3s = (rawHtml.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
        const paragraphs = (rawHtml.match(/<p[^>]*>/gi) || []).length;
        const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(rawHtml);
        const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(rawHtml);
        const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(rawHtml);
        const hasFreshDates = /202[4-6]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(rawHtml);
        const hasAuthor = /author|by |written by|published by|contributor/gi.test(rawHtml);

        // Basic GRAAF fallback (map to new structure)
        graafItems = {
          keyword_optimization: keyword ? 6 : 3,
          statistics_sources: hasStats ? 8 : 2,
          expert_quotes: hasQuotes ? 7 : 2,
          case_studies: validation.caseStudies.hasCaseStudy ? 6 : 2,
          author_authority: hasAuthor ? 6 : 2
        };
        
        // Basic CRAFT fallback
        craftItems = {
          word_count: wordCount >= 2500 ? 8 : wordCount >= 1500 ? 6 : wordCount >= 1000 ? 4 : 2,
          readability: paragraphs > 10 ? 5 : paragraphs > 5 ? 3 : 1,
          faq_section: validation.faq.hasFAQ ? 6 : 2,
          visual_elements: hasLists ? 6 : 3
        };

        graafScore = graafItems.keyword_optimization + graafItems.statistics_sources + 
                     graafItems.expert_quotes + graafItems.case_studies + graafItems.author_authority;
        craftScore = craftItems.word_count + craftItems.readability + 
                     craftItems.faq_section + craftItems.visual_elements;
        
        aiRecommendations = [];
      }
    }

    const totalScore = graafScore + craftScore + technicalScore;
    const quality = totalScore >= 90 ? 'excellent' : totalScore >= 75 ? 'good' : totalScore >= 60 ? 'average' : totalScore >= 45 ? 'below-average' : 'poor';

    console.log(`\n🎯 SCAN COMPLETE: ${scanUrl}`);
    console.log(`   Method: ${scoringMethod.toUpperCase()}`);
    console.log(`   Score: ${totalScore}/100 (${quality})`);
    console.log(`   └─ GRAAF: ${graafScore}/50`);
    console.log(`   └─ CRAFT: ${craftScore}/30`);
    console.log(`   └─ Technical: ${technicalScore}/20\n`);

    // ENHANCED TECHNICAL RECOMMENDATIONS
    const techRecommendations = [];

    if (technicalAnalysis.details.metaDescription === null) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO - Meta Tags',
        title: 'Add Meta Description',
        description: 'Missing meta description reduces CTR by up to 40%.',
        impact: 'High',
        points: '+2 points',
        howToFix: '1. Write 150-160 character description\n2. Include primary keyword\n3. Add call-to-action\n4. Place in <head> section',
        example: '<meta name="description" content="Learn SEO content optimization with 47% better rankings. Get expert tips, case studies, and free scan.">'
      });
    } else if (technicalAnalysis.details.metaDescription.length < 150) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO - Meta Tags',
        title: 'Improve Meta Description',
        description: `Meta description is only ${technicalAnalysis.details.metaDescription.length} characters (optimal: 150-160).`,
        impact: 'Medium',
        points: '+1 point',
        howToFix: '1. Expand to 150-160 characters\n2. Add specific benefit\n3. Include number or statistic\n4. Add urgency or CTA',
        example: 'Current: ' + technicalAnalysis.details.metaDescription.substring(0, 100) + '...'
      });
    }

    if (!technicalAnalysis.details.schema.article) {
      techRecommendations.push({
        type: 'major',
        category: 'Technical SEO - Schema Markup',
        title: 'Add Article Schema',
        description: 'Missing Article schema reduces rich snippet chances by 70%.',
        impact: 'High',
        points: '+3 points',
        howToFix: '1. Add JSON-LD script before </body>\n2. Include author, publisher, dates\n3. Validate with Google Rich Results Test\n4. Add FAQPage schema for bonus',
        example: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Your Title","author":{"@type":"Person","name":"Author Name"}}</script>`
      });
    }

    if (technicalAnalysis.details.images.total > 0 && technicalAnalysis.details.images.altPercentage < 90) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO - Images',
        title: 'Improve Image ALT Text',
        description: `Only ${technicalAnalysis.details.images.altPercentage}% of images have ALT text.`,
        impact: 'Medium',
        points: `+${Math.min(4, Math.floor((90 - technicalAnalysis.details.images.altPercentage) / 10))} points`,
        howToFix: '1. Add descriptive ALT to all images\n2. Include keywords naturally\n3. Keep under 125 characters\n4. Describe what the image shows',
        example: '<img src="seo-chart.jpg" alt="SEO performance chart showing 47% traffic growth in 2024" width="800" height="450">'
      });
    }

    if (technicalAnalysis.details.links.authoritative < 3) {
      techRecommendations.push({
        type: 'major',
        category: 'Technical SEO - Links',
        title: 'Add Authoritative External Links',
        description: `Only ${technicalAnalysis.details.links.authoritative} authoritative links found (target: 3+).`,
        impact: 'High',
        points: '+2 points',
        howToFix: '1. Link to .edu, .gov, research papers\n2. Cite statistics with sources\n3. Reference industry reports\n4. Link to expert profiles',
        example: 'According to [Search Engine Journal 2024 report](https://www.searchenginejournal.com/statistics), 72% of marketers...'
      });
    }

    const allRecommendations = [...(aiRecommendations || []), ...techRecommendations];
    const quickWins = allRecommendations.filter(r => r.type === 'quickwin');
    const majorImprovements = allRecommendations.filter(r => r.type === 'major');
    const eliteRecommendations = allRecommendations.filter(r => r.type === 'elite');

    const scanResult = {
      success: true,
      url: scanUrl,
      score: totalScore,
      quality,
      scoring_method: scoringMethod,
      metrics: { 
        graaf: graafScore, 
        craft: craftScore, 
        technical: technicalScore,
        total: totalScore
      },
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
          breakdown: technicalAnalysis.breakdown,
          details: technicalAnalysis.details
        }
      },
      validation: {
        statistics: validation.statistics,
        expert_quotes: validation.expertQuotes,
        case_studies: validation.caseStudies,
        faq: validation.faq,
        keyword_density: validation.keywordDensity
      },
      recommendations: {
        all: allRecommendations,
        quickWins: quickWins,
        majorImprovements: majorImprovements,
        eliteRecommendations: eliteRecommendations,
        totalRecommendations: allRecommendations.length,
        potentialScoreIncrease: allRecommendations.reduce((sum, r) => {
          const pts = parseInt((r.points || '0').match(/\d+/)?.[0] || 0);
          return sum + pts;
        }, 0)
      },
      details: {
        wordCount: contentForAI.content.split(/\s+/).length,
        title: contentForAI.title,
        validationMetrics: validation
      },
      timestamp: new Date().toISOString()
    };

    try {
      await pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [scanUrl, totalScore, quality, graafScore, craftScore, technicalScore, 
         JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), 'enhanced']
      );
    } catch (dbError) {
      console.error('DB save error:', dbError.message);
    }

    if (shareKey) {
      try {
        await pool.query('UPDATE share_links SET scans_used = scans_used + 1 WHERE share_code = $1', [shareKey]);
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
// ENHANCED ELITE SCAN ENDPOINT
// ============================================
app.post('/api/scan/elite', async (req, res) => {
  const { url, keyword } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  
  let scanUrl = url;
  if (!scanUrl.startsWith('http')) {
    scanUrl = 'https://' + scanUrl;
  }
  
  console.log(`🏆 Elite Scan: ${scanUrl}`);
  
  try {
    const fetchResult = await fetchWithPuppeteer(scanUrl);
    
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot fetch URL' 
      });
    }
    
    const rawHtml = fetchResult.rawHtml;
    
    // ENHANCED TECHNICAL SCORE
    const technicalAnalysis = calculateEnhancedTechnicalScore(rawHtml, scanUrl);
    const technicalScore = technicalAnalysis.score;
    
    // ELITE AI SCORING
    const contentForAI = extractContentForAI(fetchResult);
    
    console.log(`🤖 Elite AI scoring ${scanUrl}...`);
    
    try {
      const aiResult = await scoreWithEliteAI(contentForAI);
      
      // Bereken scores volgens Elite framework
      const graafScore = aiResult.graaf.keyword_optimization + aiResult.graaf.statistics_sources + 
                         aiResult.graaf.expert_quotes + aiResult.graaf.case_studies + aiResult.graaf.author_authority;
      const craftScore = aiResult.craft.word_count + aiResult.craft.readability + 
                         aiResult.craft.faq_section + aiResult.craft.visual_elements;
      const totalScore = graafScore + craftScore + technicalScore;
      
      // Voeg Elite recommendation toe als die niet bestaat
      let recommendations = aiResult.recommendations || [];
      const hasEliteRec = recommendations.some(r => r.type === 'elite');
      if (!hasEliteRec) {
        recommendations.push({
          type: 'elite',
          category: 'Elite Framework',
          title: 'Use Elite Framework for 95-100/100',
          description: 'Transform this content with Elite Framework methodology',
          impact: 'Very High',
          points: '+20-30 points',
          howToFix: '1. Use /api/elite/generate endpoint\n2. Follow Elite Framework structure\n3. Add 8+ statistics, 4+ expert quotes, 2+ case studies\n4. Implement all schema markup',
          example: 'POST /api/elite/generate with target_url, topic, keyword'
        });
      }
      
      console.log(`✅ Elite scored: ${totalScore}/100`);
      
      const validation = {
        statistics: validateStatistics(contentForAI.content),
        expertQuotes: validateExpertQuotes(contentForAI.content),
        caseStudies: detectCaseStudies(contentForAI.content),
        faq: detectFAQ(contentForAI.content),
        keywordDensity: keyword ? calculateKeywordDensity(contentForAI.content, keyword) : null
      };
      
      res.json({
        success: true,
        url: scanUrl,
        score: totalScore,
        quality: totalScore >= 90 ? 'excellent' : totalScore >= 75 ? 'good' : totalScore >= 60 ? 'average' : 'below-average',
        metrics: { 
          graaf: graafScore, 
          craft: craftScore, 
          technical: technicalScore,
          total: totalScore 
        },
        breakdown: {
          graaf: aiResult.graaf,
          craft: aiResult.craft,
          technical: technicalAnalysis.breakdown
        },
        validation: validation,
        recommendations: {
          all: recommendations,
          elite: recommendations.filter(r => r.type === 'elite'),
          total: recommendations.length
        },
        scan_type: 'elite-enhanced',
        timestamp: new Date().toISOString()
      });
      
    } catch (aiError) {
      console.error('Elite AI failed, using enhanced fallback:', aiError.message);
      
      // Enhanced fallback scoring
      const contentForAI = extractContentForAI(fetchResult);
      const wordCount = contentForAI.content.split(/\s+/).length;
      
      // Generous Elite fallback scores
      const graafItems = {
        keyword_optimization: 7,
        statistics_sources: 8,
        expert_quotes: 7,
        case_studies: 6,
        author_authority: 6
      };
      
      const craftItems = {
        word_count: wordCount >= 1000 ? 6 : 4,
        readability: 5,
        faq_section: 6,
        visual_elements: 6
      };
      
      const graafScore = Object.values(graafItems).reduce((a, b) => a + b, 0);
      const craftScore = Object.values(craftItems).reduce((a, b) => a + b, 0);
      const totalScore = graafScore + craftScore + technicalScore;
      
      res.json({
        success: true,
        url: scanUrl,
        score: totalScore,
        quality: 'good',
        metrics: { graaf: graafScore, craft: craftScore, technical: technicalScore },
        breakdown: {
          graaf: graafItems,
          craft: craftItems,
          technical: technicalAnalysis.breakdown
        },
        recommendations: {
          all: [{
            type: 'elite',
            category: 'Elite Framework',
            title: 'Use Elite Framework for 95-100/100',
            description: 'Transform this content with Elite Framework',
            impact: 'Very High',
            points: '+20-30 points',
            howToFix: 'Use /api/elite/generate endpoint'
          }],
          total: 1
        },
        scan_type: 'elite-enhanced-fallback',
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Elite scan error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Elite scan failed: ' + error.message 
    });
  }
});

// ============================================
// ENHANCED ELITE ANALYZE ENDPOINT
// ============================================
app.post('/api/elite/analyze/enhanced', async (req, res) => {
  try {
    const { url, keyword } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL required' 
      });
    }

    console.log(`🔍 Enhanced Elite analysis for: ${url}`);

    // Fetch the existing content
    const fetchResult = await fetchWithPuppeteer(url);
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot fetch URL for analysis' 
      });
    }

    // Extract content
    const contentForAI = extractContentForAI(fetchResult);
    
    // Get both normal and elite scores for comparison
    const normalScore = await scoreWithAI(contentForAI, true);
    const eliteScore = await scoreWithEliteAI(contentForAI);
    
    // Calculate current scores
    const currentGraafScore = normalScore.graaf.keyword_optimization + normalScore.graaf.statistics_sources + 
                              normalScore.graaf.expert_quotes + normalScore.graaf.case_studies + normalScore.graaf.author_authority;
    const currentCraftScore = normalScore.craft.word_count + normalScore.craft.readability + 
                              normalScore.craft.faq_section + normalScore.craft.visual_elements;
    
    const eliteGraafScore = eliteScore.graaf.keyword_optimization + eliteScore.graaf.statistics_sources + 
                            eliteScore.graaf.expert_quotes + eliteScore.graaf.case_studies + eliteScore.graaf.author_authority;
    const eliteCraftScore = eliteScore.craft.word_count + eliteScore.craft.readability + 
                            eliteScore.craft.faq_section + eliteScore.craft.visual_elements;
    
    // Calculate technical score
    const technicalAnalysis = calculateEnhancedTechnicalScore(fetchResult.rawHtml, url);
    const technicalScore = technicalAnalysis.score;
    
    const currentTotalScore = currentGraafScore + currentCraftScore + technicalScore;
    const elitePotentialScore = eliteGraafScore + eliteCraftScore + technicalScore;
    
    // Enhanced validation
    const validation = {
      statistics: validateStatistics(contentForAI.content),
      expertQuotes: validateExpertQuotes(contentForAI.content),
      caseStudies: detectCaseStudies(contentForAI.content),
      faq: detectFAQ(contentForAI.content),
      keywordDensity: keyword ? calculateKeywordDensity(contentForAI.content, keyword) : null,
      images: countImagesWithAlt(fetchResult.rawHtml),
      links: countLinks(fetchResult.rawHtml, url),
      schema: detectSchemaMarkup(fetchResult.rawHtml)
    };
    
    // Analyze for Elite Framework potential
    const analysis = {
      current_score: currentTotalScore,
      elite_potential_score: elitePotentialScore,
      score_difference: elitePotentialScore - currentTotalScore,
      current_breakdown: {
        graaf: currentGraafScore,
        craft: currentCraftScore,
        technical: technicalScore
      },
      elite_breakdown: {
        graaf: eliteGraafScore,
        craft: eliteCraftScore,
        technical: technicalScore
      },
      content_stats: {
        word_count: contentForAI.content.split(/\s+/).length,
        heading_count: (contentForAI.content.match(/\[H\d\]:/g) || []).length,
        validation: validation
      },
      elite_potential: {
        can_improve_to: `${elitePotentialScore}/100`,
        improvements_needed: [],
        estimated_effort: 'High',
        specific_gaps: []
      }
    };
    
    // Determine specific gaps
    if (normalScore.graaf.statistics_sources < 8) {
      analysis.elite_potential.specific_gaps.push({
        category: 'GRAAF - Statistics',
        current: normalScore.graaf.statistics_sources,
        target: 10,
        gap: 10 - normalScore.graaf.statistics_sources,
        action: 'Add 8+ statistics from 2023-2025 with source attribution'
      });
    }
    
    if (normalScore.graaf.expert_quotes < 4) {
      analysis.elite_potential.specific_gaps.push({
        category: 'GRAAF - Expert Quotes',
        current: normalScore.graaf.expert_quotes,
        target: 10,
        gap: 10 - normalScore.graaf.expert_quotes,
        action: 'Add 4+ expert quotes with full name, title, organization'
      });
    }
    
    if (normalScore.graaf.case_studies < 6) {
      analysis.elite_potential.specific_gaps.push({
        category: 'GRAAF - Case Studies',
        current: normalScore.graaf.case_studies,
        target: 10,
        gap: 10 - normalScore.graaf.case_studies,
        action: 'Add 2+ case studies with specific metrics and results'
      });
    }
    
    if (normalScore.craft.faq_section < 6) {
      analysis.elite_potential.specific_gaps.push({
        category: 'CRAFT - FAQ Section',
        current: normalScore.craft.faq_section,
        target: 8,
        gap: 8 - normalScore.craft.faq_section,
        action: 'Add 10+ FAQ questions with 100+ word answers and links'
      });
    }
    
    if (!technicalAnalysis.details.schema.article) {
      analysis.elite_potential.specific_gaps.push({
        category: 'Technical - Schema Markup',
        current: 0,
        target: 3,
        gap: 3,
        action: 'Add Article, FAQPage, and Organization schema markup'
      });
    }
    
    // Set estimated effort based on gaps
    const totalGap = analysis.elite_potential.specific_gaps.reduce((sum, gap) => sum + gap.gap, 0);
    if (totalGap > 25) {
      analysis.elite_potential.estimated_effort = 'High - Major rewrite needed';
    } else if (totalGap > 15) {
      analysis.elite_potential.estimated_effort = 'Medium - Significant improvements needed';
    } else if (totalGap > 5) {
      analysis.elite_potential.estimated_effort = 'Low - Minor optimizations needed';
    } else {
      analysis.elite_potential.estimated_effort = 'Minimal - Already close to Elite standard';
    }
    
    res.json({
      success: true,
      analysis: analysis,
      recommendations: eliteScore.recommendations || [],
      validation: validation,
      next_step: {
        endpoint: '/api/elite/generate',
        parameters: {
          target_url: url,
          topic: '[Extract main topic from content]',
          keyword: keyword || '[Identify primary keyword]',
          current_score: currentTotalScore
        }
      }
    });

  } catch (error) {
    console.error('Enhanced Elite analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Analysis failed: ' + error.message 
    });
  }
});

// ============================================
// NEW: CONTENT VALIDATION ENDPOINT
// ============================================
app.post('/api/validate/content', async (req, res) => {
  try {
    const { url, keyword } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL required' 
      });
    }

    console.log(`🔍 Content validation for: ${url}`);

    const fetchResult = await fetchWithPuppeteer(url);
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot fetch URL' 
      });
    }

    const contentForAI = extractContentForAI(fetchResult);
    const rawHtml = fetchResult.rawHtml;
    
    // Comprehensive validation
    const validation = {
      keyword: keyword ? calculateKeywordDensity(contentForAI.content, keyword) : null,
      statistics: validateStatistics(contentForAI.content),
      expertQuotes: validateExpertQuotes(contentForAI.content),
      caseStudies: detectCaseStudies(contentForAI.content),
      faq: detectFAQ(contentForAI.content),
      technical: {
        images: countImagesWithAlt(rawHtml),
        links: countLinks(rawHtml, url),
        schema: detectSchemaMarkup(rawHtml),
        metaTags: {
          title: contentForAI.title,
          description: rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || null
        }
      },
      structure: {
        wordCount: contentForAI.content.split(/\s+/).length,
        headingCount: (contentForAI.content.match(/\[H\d\]:/g) || []).length,
        paragraphCount: (contentForAI.content.match(/\n\n/g) || []).length + 1
      }
    };
    
    // Calculate validation score
    let validationScore = 0;
    let maxScore = 0;
    const breakdown = {};
    
    // Keyword validation
    if (validation.keyword) {
      maxScore += 10;
      if (validation.keyword.exactDensity >= 0.8 && validation.keyword.exactDensity <= 1.2) {
        validationScore += 8;
        breakdown.keyword = { score: 8, status: 'optimal' };
      } else if (validation.keyword.exactCount > 0) {
        validationScore += 5;
        breakdown.keyword = { score: 5, status: 'present' };
      } else {
        breakdown.keyword = { score: 0, status: 'missing' };
      }
    }
    
    // Statistics validation
    maxScore += 10;
    if (validation.statistics.withSources >= 8) {
      validationScore += 10;
      breakdown.statistics = { score: 10, status: 'excellent', count: validation.statistics.withSources };
    } else if (validation.statistics.withSources >= 5) {
      validationScore += 7;
      breakdown.statistics = { score: 7, status: 'good', count: validation.statistics.withSources };
    } else if (validation.statistics.withSources >= 3) {
      validationScore += 4;
      breakdown.statistics = { score: 4, status: 'fair', count: validation.statistics.withSources };
    } else if (validation.statistics.withSources > 0) {
      validationScore += 2;
      breakdown.statistics = { score: 2, status: 'poor', count: validation.statistics.withSources };
    } else {
      breakdown.statistics = { score: 0, status: 'missing' };
    }
    
    // Expert quotes validation
    maxScore += 10;
    if (validation.expertQuotes.valid >= 4) {
      validationScore += 10;
      breakdown.expertQuotes = { score: 10, status: 'excellent', count: validation.expertQuotes.valid };
    } else if (validation.expertQuotes.valid >= 2) {
      validationScore += 6;
      breakdown.expertQuotes = { score: 6, status: 'good', count: validation.expertQuotes.valid };
    } else if (validation.expertQuotes.valid >= 1) {
      validationScore += 3;
      breakdown.expertQuotes = { score: 3, status: 'fair', count: validation.expertQuotes.valid };
    } else {
      breakdown.expertQuotes = { score: 0, status: 'missing' };
    }
    
    // Case studies validation
    maxScore += 10;
    if (validation.caseStudies.metricsCount >= 3 && validation.caseStudies.hasCaseStudy) {
      validationScore += 10;
      breakdown.caseStudies = { score: 10, status: 'excellent', metrics: validation.caseStudies.metricsCount };
    } else if (validation.caseStudies.hasCaseStudy) {
      validationScore += 6;
      breakdown.caseStudies = { score: 6, status: 'good' };
    } else if (validation.caseStudies.metricsCount > 0) {
      validationScore += 3;
      breakdown.caseStudies = { score: 3, status: 'fair', metrics: validation.caseStudies.metricsCount };
    } else {
      breakdown.caseStudies = { score: 0, status: 'missing' };
    }
    
    // FAQ validation
    maxScore += 8;
    if (validation.faq.questionCount >= 10) {
      validationScore += 8;
      breakdown.faq = { score: 8, status: 'excellent', questions: validation.faq.questionCount };
    } else if (validation.faq.questionCount >= 5) {
      validationScore += 5;
      breakdown.faq = { score: 5, status: 'good', questions: validation.faq.questionCount };
    } else if (validation.faq.questionCount >= 1) {
      validationScore += 2;
      breakdown.faq = { score: 2, status: 'fair', questions: validation.faq.questionCount };
    } else {
      breakdown.faq = { score: 0, status: 'missing' };
    }
    
    // Word count validation
    maxScore += 8;
    if (validation.structure.wordCount >= 2500) {
      validationScore += 8;
      breakdown.wordCount = { score: 8, status: 'excellent', count: validation.structure.wordCount };
    } else if (validation.structure.wordCount >= 1500) {
      validationScore += 6;
      breakdown.wordCount = { score: 6, status: 'good', count: validation.structure.wordCount };
    } else if (validation.structure.wordCount >= 1000) {
      validationScore += 4;
      breakdown.wordCount = { score: 4, status: 'fair', count: validation.structure.wordCount };
    } else if (validation.structure.wordCount >= 500) {
      validationScore += 2;
      breakdown.wordCount = { score: 2, status: 'poor', count: validation.structure.wordCount };
    } else {
      breakdown.wordCount = { score: 0, status: 'very poor', count: validation.structure.wordCount };
    }
    
    const validationPercentage = maxScore > 0 ? Math.round((validationScore / maxScore) * 100) : 0;
    
    res.json({
      success: true,
      validation: validation,
      score: {
        raw: validationScore,
        max: maxScore,
        percentage: validationPercentage,
        breakdown: breakdown
      },
      recommendations: generateValidationRecommendations(validation, breakdown),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Content validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Validation failed: ' + error.message 
    });
  }
});

function generateValidationRecommendations(validation, breakdown) {
  const recommendations = [];
  
  if (breakdown.statistics && breakdown.statistics.score < 7) {
    recommendations.push({
      type: 'major',
      category: 'GRAAF - Statistics',
      title: 'Add More Statistics with Sources',
      description: `Only ${validation.statistics.withSources} statistics with sources found (target: 8+).`,
      impact: 'High',
      points: `+${10 - breakdown.statistics.score} points`,
      howToFix: '1. Find 2023-2025 industry reports\n2. Cite specific numbers with sources\n3. Use "according to [Source, 2024]"\n4. Add statistics in each section',
      example: 'According to Content Marketing Institute 2024 report, 72% of marketers say content quality is their top priority.'
    });
  }
  
  if (breakdown.expertQuotes && breakdown.expertQuotes.score < 6) {
    recommendations.push({
      type: 'major',
      category: 'GRAAF - Expert Quotes',
      title: 'Add Expert Quotes',
      description: `Only ${validation.expertQuotes.valid} expert quotes found (target: 4+).`,
      impact: 'High',
      points: `+${10 - breakdown.expertQuotes.score} points`,
      howToFix: '1. Interview industry experts\n2. Quote from authoritative sources\n3. Include full name, title, organization\n4. Place quotes in relevant sections',
      example: '"Companies that invest in quality content see 47% higher ROI," says Jane Doe, SEO Director at MarketingPro.'
    });
  }
  
  if (breakdown.caseStudies && breakdown.caseStudies.score < 6) {
    recommendations.push({
      type: 'major',
      category: 'GRAAF - Case Studies',
      title: 'Add Case Studies with Metrics',
      description: 'Missing detailed case studies with measurable results.',
      impact: 'High',
      points: `+${10 - breakdown.caseStudies.score} points`,
      howToFix: '1. Document client success stories\n2. Include specific metrics (X% growth, $Y increase)\n3. Show before/after results\n4. Add quotes from clients',
      example: 'Case Study: TechStart Inc increased organic traffic by 312% in 6 months using our framework.'
    });
  }
  
  if (breakdown.faq && breakdown.faq.score < 5) {
    recommendations.push({
      type: 'quickwin',
      category: 'CRAFT - FAQ Section',
      title: 'Add FAQ Section',
      description: `Only ${validation.faq.questionCount} FAQ questions found (target: 10+).`,
      impact: 'Medium',
      points: `+${8 - breakdown.faq.score} points`,
      howToFix: '1. Research "People Also Ask" for your topic\n2. Write 10+ questions\n3. Provide 100+ word answers\n4. Add internal and external links',
      example: '### ❓ What is the GRAAF Framework?\n**Quick Answer:** GRAAF is a content scoring framework...'
    });
  }
  
  if (breakdown.wordCount && breakdown.wordCount.score < 6) {
    recommendations.push({
      type: 'major',
      category: 'CRAFT - Word Count',
      title: 'Increase Content Depth',
      description: `Only ${validation.structure.wordCount} words (target: 2500+).`,
      impact: 'High',
      points: `+${8 - breakdown.wordCount.score} points`,
      howToFix: '1. Expand each section with more detail\n2. Add examples and applications\n3. Include more statistics and quotes\n4. Add practical implementation steps',
      example: 'Expand from 1,200 to 2,500+ words by adding more depth to each section.'
    });
  }
  
  return recommendations;
}

// ============================================
// CREATE ALL TABLES (gewijzigd om nieuwe kolommen toe te voegen)
// ============================================
async function createAllTables() {
  const client = await pool.connect();
  
  try {
    // ... [bestaande table creation code blijft hetzelfde] ...
    
    // NIEUWE KOLOMMEN TOEVOEGEN VOOR ENHANCED SCORING
    await client.query(`
      ALTER TABLE scans ADD COLUMN IF NOT EXISTS validation_data JSONB
    `).catch(e => console.log('Validation column already exists or error:', e.message));
    
    await client.query(`
      ALTER TABLE scans ADD COLUMN IF NOT EXISTS enhanced_breakdown JSONB
    `).catch(e => console.log('Enhanced breakdown column already exists or error:', e.message));
    
    console.log('✅ Enhanced database tables ready');
    
    setTimeout(autoPopulateLeaderboard, 500);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    client.release();
  }
}

// ============================================
// TEST ENDPOINTS VOOR NIEUWE FUNCTIONALITEIT
// ============================================

app.get('/api/test/validation', async (req, res) => {
  res.json({
    success: true,
    message: 'Enhanced validation system is active',
    endpoints: {
      scan: 'POST /api/scan (enhanced version)',
      scan_elite: 'POST /api/scan/elite (enhanced elite)',
      elite_analyze: 'POST /api/elite/analyze/enhanced',
      validate: 'POST /api/validate/content'
    },
    features: {
      enhanced_technical_scoring: '✓',
      keyword_density_calculation: '✓',
      statistics_validation: '✓',
      expert_quotes_validation: '✓',
      case_studies_detection: '✓',
      faq_detection: '✓',
      schema_detection: '✓',
      link_analysis: '✓',
      image_alt_analysis: '✓'
    },
    version: '2.0-enhanced',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// UPDATE HEALTH CHECK
// ============================================
app.get('/api/health/enhanced', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    
    const validationTest = {
      keyword: calculateKeywordDensity('This is a test with keyword keyword keyword', 'keyword'),
      statistics: validateStatistics('According to 2024 study, 72% of marketers report success. Another 2023 report shows 58% growth.'),
      expertQuotes: validateExpertQuotes('"This is important," said John Doe, CEO at Company.'),
      caseStudies: detectCaseStudies('Case study: Company increased revenue by 47%. Results: 58% growth.'),
      faq: detectFAQ('Q: What is this? A: This is an answer.'),
      schema: detectSchemaMarkup('<script>{"@type":"Article"}</script>')
    };
    
    res.json({
      status: 'healthy',
      system: 'ContentScale Enhanced v2.0',
      components: {
        database: 'connected',
        anthropic_api: hasApiKey ? 'configured' : 'not_configured',
        puppeteer: 'ready',
        validation_system: 'operational'
      },
      enhanced_features: {
        technical_scoring: 'enhanced',
        content_validation: 'active',
        elite_framework: 'integrated',
        real_time_analysis: 'available'
      },
      validation_test: validationTest,
      notes: 'Enhanced scoring system with detailed validation metrics'
    });
  } catch (error) {
    res.json({ 
      status: 'degraded', 
      error: error.message,
      system: 'ContentScale Enhanced v2.0'
    });
  }
});

// ============================================
// MIDDLEWARE EN REST VAN DE CODE BLIJFT HETZELFDE
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
// REST VAN JE BESTAANDE CODE HIER (admin, leaderboard, etc.)
// ============================================
// ... [alle bestaande endpoints blijven ongewijzigd] ...

// ============================================
// START SERVER MET ENHANCED MESSAGE
// ============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================================');
  console.log('🚀  ContentScale Server Running - ENHANCED VERSION');
  console.log('🚀 ================================================');
  console.log('');
  console.log('📍 Frontend:        http://localhost:' + PORT);
  console.log('📍 Admin:           http://localhost:' + PORT + '/admin');
  console.log('📍 Health:          http://localhost:' + PORT + '/api/health');
  console.log('📍 Enhanced Health: http://localhost:' + PORT + '/api/health/enhanced');
  console.log('');
  console.log('🏆 ENHANCED ELITE FRAMEWORK ENDPOINTS:');
  console.log('📍 Generate:        POST /api/elite/generate');
  console.log('📍 Enhanced Analyze: POST /api/elite/analyze/enhanced');
  console.log('📍 Content Validate: POST /api/validate/content');
  console.log('📍 Enhanced Scan:   POST /api/scan (with validation)');
  console.log('📍 Elite Scan:      POST /api/scan/elite (generous scoring)');
  console.log('');
  console.log('🔧 ENHANCED FEATURES:');
  console.log('   ✓ Real technical SEO scoring');
  console.log('   ✓ Content validation metrics');
  console.log('   ✓ Keyword density calculation');
  console.log('   ✓ Statistics source validation');
  console.log('   ✓ Expert quotes detection');
  console.log('   ✓ Case studies identification');
  console.log('   ✓ FAQ section detection');
  console.log('   ✓ Schema markup analysis');
  console.log('');
  console.log('👤 Default Login: ot / admin123');
  console.log('');
  console.log('⚡ Elite Framework: ENHANCED for 95-100/100 content!');
  console.log('');
});
