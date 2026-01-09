const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function fetchPageContent(url) {
  let browser = null;
  
  try {
    console.log('[FETCH] Starting browser for:', url);
    
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
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
    
    console.log('[FETCH] Navigating...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const html = await page.content();
    const title = await page.title();
    
    const $ = cheerio.load(html);
    
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const h1 = $('h1').first().text().trim();
    
    $('script, style, nav, footer, header').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).length;
    
    const internalLinks = $('a[href^="/"]').length;
    const images = $('img').length;
    const imagesWithAlt = $('img[alt]').length;
    const hasSchemaOrg = $('script[type="application/ld+json"]').length > 0;
    const hasPubDate = !!($('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime'));
    
    await browser.close();
    
    return {
      success: true,
      url,
      title,
      metaDescription,
      h1,
      bodyText: bodyText.substring(0, 8000),
      wordCount,
      internalLinks,
      images,
      imagesWithAlt,
      hasSchemaOrg,
      hasPubDate
    };
  } catch (error) {
    console.error('[FETCH ERROR]', error.message);
    if (browser) await browser.close();
    return { success: false, error: error.message, url };
  }
}

async function analyzeWithClaude(pageData) {
  try {
    console.log('[CLAUDE] Analyzing...');
    
    const prompt = `Analyze this webpage for SEO using GRAAF + CRAFT + Technical SEO.

URL: ${pageData.url}
Title: ${pageData.title}
Meta: ${pageData.metaDescription}
H1: ${pageData.h1}
Words: ${pageData.wordCount}
Internal Links: ${pageData.internalLinks}
Images: ${pageData.images} (${pageData.imagesWithAlt} with alt)
Schema: ${pageData.hasSchemaOrg}
Pub Date: ${pageData.hasPubDate}

Content: ${pageData.bodyText.substring(0, 2000)}

Return ONLY valid JSON (no markdown):
{
  "score": <0-100>,
  "breakdown": {
    "graaf": {"total": <0-50>, "credibility": <0-10>, "relevance": <0-10>, "actionability": <0-10>, "accuracy": <0-10>, "freshness": <0-10>},
    "craft": {"total": <0-30>, "cutFluff": <0-8>, "reviewOptimize": <0-8>, "addVisuals": <0-6>, "faqIntegration": <0-5>, "trustBuilding": <0-3>},
    "technical": {"total": <0-20>, "schemaMarkup": <0-4>, "metaOptimization": <0-4>, "internalLinking": <0-4>, "pageStructure": <0-4>, "mobileOptimization": <0-4>}
  },
  "recommendations": {
    "quickWins": [{"category": "...", "issue": "...", "action": "...", "details": [...], "impact": 1-5, "timeEstimate": <minutes>, "priority": "high|medium|low"}],
    "majorImpact": [...],
    "advanced": [...],
    "summary": {"totalIssues": <n>, "estimatedTimeToFix": <minutes>, "potentialScoreGain": <n>, "currentScore": <n>, "targetScore": 100}
  }
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    let jsonText = message.content[0].text;
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }
    
    const analysis = JSON.parse(jsonText);
    console.log('[CLAUDE] Complete. Score:', analysis.score);
    
    return { success: true, ...analysis };
  } catch (error) {
    console.error('[CLAUDE ERROR]', error.message);
    return { success: false, error: error.message };
  }
}

async function performFullScan(url) {
  console.log('[SCAN START]', url);
  
  const pageData = await fetchPageContent(url);
  if (!pageData.success) {
    return { success: false, error: pageData.error || 'Failed to fetch page' };
  }
  
  console.log('[SCAN] Page fetched. Words:', pageData.wordCount);
  
  const analysis = await analyzeWithClaude(pageData);
  if (!analysis.success) {
    return { success: false, error: analysis.error || 'Analysis failed' };
  }
  
  console.log('[SCAN COMPLETE] Score:', analysis.score);
  
  return {
    success: true,
    url,
    score: analysis.score,
    quality: analysis.score >= 90 ? 'excellent' : analysis.score >= 80 ? 'good' : analysis.score >= 70 ? 'fair' : analysis.score >= 60 ? 'average' : 'needs-improvement',
    breakdown: analysis.breakdown,
    recommendations: analysis.recommendations,
    wordCount: pageData.wordCount,
    scanned_at: new Date().toISOString(),
    pageMetadata: {
      title: pageData.title,
      metaDescription: pageData.metaDescription,
      h1: pageData.h1,
      internalLinks: pageData.internalLinks,
      images: pageData.images,
      imagesWithAlt: pageData.imagesWithAlt,
      hasSchemaOrg: pageData.hasSchemaOrg,
      hasPubDate: pageData.hasPubDate
    }
  };
}

module.exports = { performFullScan };
