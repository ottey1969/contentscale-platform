const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ==========================================
// 🌐 FETCH PAGE CONTENT
// ==========================================
async function fetchPageContent(url) {
  let browser = null;
  
  try {
    console.log('[FETCH] Starting browser for:', url);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('[FETCH] Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('[FETCH] Extracting content...');
    const html = await page.content();
    const title = await page.title();
    
    const $ = cheerio.load(html);
    
    // Extract metadata
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const h1 = $('h1').first().text().trim();
    const headings = {
      h1: $('h1').length,
      h2: $('h2').length,
      h3: $('h3').length
    };
    
    // Extract text content
    $('script, style, nav, footer, header').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).length;
    
    // Extract links
    const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
    const externalLinks = $('a[href^="http"]').not('[href^="' + url + '"]').length;
    
    // Extract images
    const images = $('img').length;
    const imagesWithAlt = $('img[alt]').length;
    
    // Check for structured data
    const hasSchemaOrg = $('script[type="application/ld+json"]').length > 0;
    
    // Check publication date
    const pubDate = $('meta[property="article:published_time"]').attr('content') ||
                   $('time[datetime]').first().attr('datetime') ||
                   $('meta[name="date"]').attr('content');
    
    await browser.close();
    
    return {
      success: true,
      url,
      title,
      metaDescription,
      h1,
      headings,
      bodyText: bodyText.substring(0, 8000), // Limit for Claude
      wordCount,
      internalLinks,
      externalLinks,
      images,
      imagesWithAlt,
      hasSchemaOrg,
      hasPubDate: !!pubDate,
      pubDate
    };
    
  } catch (error) {
    console.error('[FETCH ERROR]', error.message);
    
    if (browser) {
      await browser.close();
    }
    
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

// ==========================================
// 🤖 CLAUDE ANALYSIS
// ==========================================
async function analyzeWithClaude(pageData) {
  try {
    console.log('[CLAUDE] Analyzing content...');
    
    const prompt = `Analyze this webpage for SEO content quality using GRAAF Framework + CRAFT Methodology + Technical SEO.

URL: ${pageData.url}
Title: ${pageData.title}
Meta Description: ${pageData.metaDescription}
H1: ${pageData.h1}
Word Count: ${pageData.wordCount}
Content Preview: ${pageData.bodyText.substring(0, 2000)}

Headings: H1=${pageData.headings.h1}, H2=${pageData.headings.h2}, H3=${pageData.headings.h3}
Internal Links: ${pageData.internalLinks}
External Links: ${pageData.externalLinks}
Images: ${pageData.images} (${pageData.imagesWithAlt} with alt text)
Has Schema.org: ${pageData.hasSchemaOrg}
Has Publication Date: ${pageData.hasPubDate}

Provide a JSON response with this EXACT structure (no markdown, just JSON):
{
  "score": <number 0-100>,
  "breakdown": {
    "graaf": {
      "total": <number 0-50>,
      "credibility": <number 0-10>,
      "relevance": <number 0-10>,
      "actionability": <number 0-10>,
      "accuracy": <number 0-10>,
      "freshness": <number 0-10>
    },
    "craft": {
      "total": <number 0-30>,
      "cutFluff": <number 0-8>,
      "reviewOptimize": <number 0-8>,
      "addVisuals": <number 0-6>,
      "faqIntegration": <number 0-5>,
      "trustBuilding": <number 0-3>
    },
    "technical": {
      "total": <number 0-20>,
      "schemaMarkup": <number 0-4>,
      "metaOptimization": <number 0-4>,
      "internalLinking": <number 0-4>,
      "pageStructure": <number 0-4>,
      "mobileOptimization": <number 0-4>
    }
  },
  "recommendations": {
    "quickWins": [
      {
        "category": "GRAAF - Freshness",
        "issue": "<specific issue found>",
        "action": "<specific action>",
        "details": ["<detail 1>", "<detail 2>"],
        "impact": <number 1-5>,
        "timeEstimate": <number in minutes>,
        "priority": "high|medium|low"
      }
    ],
    "majorImpact": [<same structure>],
    "advanced": [<same structure>],
    "summary": {
      "totalIssues": <number>,
      "estimatedTimeToFix": <number in minutes>,
      "potentialScoreGain": <number>,
      "currentScore": <number>,
      "targetScore": 100
    }
  }
}

Focus on SPECIFIC issues found in this actual page. Make recommendations actionable and detailed.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const responseText = message.content[0].text;
    console.log('[CLAUDE] Raw response:', responseText.substring(0, 200));
    
    // Parse JSON (remove markdown if present)
    let jsonText = responseText;
    if (responseText.includes('```json')) {
      jsonText = responseText.split('```json')[1].split('```')[0].trim();
    } else if (responseText.includes('```')) {
      jsonText = responseText.split('```')[1].split('```')[0].trim();
    }
    
    const analysis = JSON.parse(jsonText);
    
    console.log('[CLAUDE] Analysis complete. Score:', analysis.score);
    
    return {
      success: true,
      ...analysis
    };
    
  } catch (error) {
    console.error('[CLAUDE ERROR]', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// 🎯 COMPLETE SCAN
// ==========================================
async function performFullScan(url) {
  console.log('[SCAN START]', url);
  
  // Step 1: Fetch page
  const pageData = await fetchPageContent(url);
  
  if (!pageData.success) {
    console.log('[SCAN FAILED] Could not fetch page');
    return {
      success: false,
      error: pageData.error || 'Failed to fetch page'
    };
  }
  
  console.log('[SCAN] Page fetched. Word count:', pageData.wordCount);
  
  // Step 2: Analyze with Claude
  const analysis = await analyzeWithClaude(pageData);
  
  if (!analysis.success) {
    console.log('[SCAN FAILED] Analysis error');
    return {
      success: false,
      error: analysis.error || 'Analysis failed'
    };
  }
  
  console.log('[SCAN COMPLETE] Score:', analysis.score);
  
  return {
    success: true,
    url,
    score: analysis.score,
    quality: analysis.score >= 90 ? 'excellent' : 
             analysis.score >= 80 ? 'good' : 
             analysis.score >= 70 ? 'fair' : 
             analysis.score >= 60 ? 'average' : 'needs-improvement',
    breakdown: analysis.breakdown,
    recommendations: analysis.recommendations,
    wordCount: pageData.wordCount,
    scanned_at: new Date().toISOString(),
    pageMetadata: {
      title: pageData.title,
      metaDescription: pageData.metaDescription,
      h1: pageData.h1,
      headings: pageData.headings,
      internalLinks: pageData.internalLinks,
      externalLinks: pageData.externalLinks,
      images: pageData.images,
      imagesWithAlt: pageData.imagesWithAlt,
      hasSchemaOrg: pageData.hasSchemaOrg,
      hasPubDate: pageData.hasPubDate
    }
  };
}

module.exports = {
  performFullScan,
  fetchPageContent,
  analyzeWithClaude
};
