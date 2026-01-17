const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ==========================================
// 🎯 HYBRID SCANNER V3.0
// DETERMINISTIC + AI VALIDATION
// ==========================================

console.log('✅ ContentScale Hybrid Scanner V3.0 Loaded');

// ==========================================
// HELPER: AUTO-SCROLL FOR LAZY-LOAD
// ==========================================

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// ==========================================
// STEP 1: ADVANCED CONTENT EXTRACTION
// ==========================================

async function fetchPageContent(url) {
  let browser = null;
  
  try {
    console.log('[FETCH] 🚀 Starting browser for:', url);
    
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
        '--single-process',
        '--disable-web-security'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('[FETCH] 📡 Navigating to URL...');
    
    // Navigate with extended timeout
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 45000 
    });
    
    console.log('[FETCH] ⏳ Waiting for JavaScript rendering...');
    
    // Wait for body to be ready
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Wait additional time for AJAX/React/Vue content
    await page.waitForTimeout(3000);
    
    console.log('[FETCH] 📜 Auto-scrolling for lazy-load content...');
    
    // Auto-scroll to trigger lazy-load
    await autoScroll(page);
    
    // Wait after scroll
    await page.waitForTimeout(2000);
    
    console.log('[FETCH] 📊 Extracting all content...');
    
    // Extract comprehensive data
    const pageData = await page.evaluate(() => {
      return {
        html: document.documentElement.outerHTML,
        title: document.title,
        bodyText: document.body.innerText,
        visibleText: document.body.textContent,
        
        // Meta data
        metaDescription: document.querySelector('meta[name="description"]')?.content || '',
        metaKeywords: document.querySelector('meta[name="keywords"]')?.content || '',
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        
        // Structured data
        jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => {
          try { return JSON.parse(s.textContent); } catch { return null; }
        }).filter(Boolean),
        
        // All images
        images: Array.from(document.images).map(img => ({
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth,
          height: img.naturalHeight,
          loading: img.loading,
          hasAlt: !!img.alt
        })),
        
        // All links
        links: Array.from(document.links).map(a => ({
          href: a.href,
          text: a.textContent.trim(),
          rel: a.rel,
          isInternal: a.hostname === window.location.hostname,
          isExternal: a.hostname !== window.location.hostname
        })),
        
        // Headings
        headings: {
          h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
          h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()),
          h3: Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()),
          h4: Array.from(document.querySelectorAll('h4')).map(h => h.textContent.trim()),
          h5: Array.from(document.querySelectorAll('h5')).map(h => h.textContent.trim()),
          h6: Array.from(document.querySelectorAll('h6')).map(h => h.textContent.trim())
        },
        
        // Viewport
        viewport: document.querySelector('meta[name="viewport"]')?.content || '',
        
        // Language
        lang: document.documentElement.lang || '',
        
        // Performance hints
        preconnect: Array.from(document.querySelectorAll('link[rel="preconnect"]')).map(l => l.href),
        prefetch: Array.from(document.querySelectorAll('link[rel="prefetch"]')).map(l => l.href),
        
        // Page dimensions
        pageHeight: document.body.scrollHeight,
        pageWidth: document.body.scrollWidth
      };
    });
    
    await browser.close();
    
    console.log('[FETCH] ✅ Content extracted successfully');
    console.log('[FETCH] 📝 Word count:', pageData.bodyText.split(/\s+/).filter(w => w.length > 0).length);
    console.log('[FETCH] 🖼️  Images:', pageData.images.length);
    console.log('[FETCH] 🔗 Links:', pageData.links.length);
    
    return {
      success: true,
      url,
      ...pageData
    };
    
  } catch (error) {
    console.error('[FETCH ERROR] ❌', error.message);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return { 
      success: false, 
      error: error.message, 
      url 
    };
  }
}

// ==========================================
// STEP 2: DETERMINISTIC CONTENT PARSING
// ==========================================

function parseContentElements(pageData) {
  console.log('[PARSE] 🔍 Starting deterministic content parsing...');
  
  const $ = cheerio.load(pageData.html);
  
  // Remove noise
  $('script, style, nav, footer, header, aside, iframe, noscript').remove();
  
  const elements = {
    // GRAAF ELEMENTS
    expertQuotes: detectExpertQuotes($, pageData.bodyText),
    statistics: detectStatistics($, pageData.bodyText),
    caseStudies: detectCaseStudies($, pageData.bodyText),
    processSteps: detectProcessSteps($, pageData.bodyText),
    examples: detectExamples($, pageData.bodyText),
    citations: detectCitations($),
    timestamps: detectTimestamps($, pageData.bodyText),
    
    // CRAFT ELEMENTS
    lists: detectLists($),
    tables: detectTables($),
    faqs: detectFAQs($),
    videos: detectVideos($),
    infographics: detectInfographics($),
    callouts: detectCallouts($),
    
    // TECHNICAL ELEMENTS
    schema: pageData.jsonLd || [],
    internalLinks: pageData.links.filter(l => l.isInternal),
    externalLinks: pageData.links.filter(l => l.isExternal),
    images: pageData.images,
    headings: pageData.headings
  };
  
  // Calculate text metrics
  const text = pageData.bodyText;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = $('p').length;
  
  elements.metrics = {
    wordCount: words.length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs,
    avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : 0,
    avgWordLength: words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0,
    readingTime: Math.ceil(words.length / 200) // 200 words per minute
  };
  
  console.log('[PARSE] ✅ Parsing complete');
  console.log('[PARSE] 📊 Expert quotes:', elements.expertQuotes.length);
  console.log('[PARSE] 📈 Statistics:', elements.statistics.length);
  console.log('[PARSE] 📚 Case studies:', elements.caseStudies.length);
  console.log('[PARSE] ❓ FAQs:', elements.faqs.length);
  
  return elements;
}

// ==========================================
// DETECTION FUNCTIONS
// ==========================================

function detectExpertQuotes($, text) {
  const quotes = [];
  
  // Pattern 1: Blockquotes with attribution
  $('blockquote').each((i, el) => {
    const quote = $(el).text().trim();
    const citation = $(el).find('cite, footer, .author, .attribution').text().trim();
    
    if (quote.length > 20) {
      quotes.push({
        text: quote,
        attribution: citation || null,
        hasAttribution: !!citation,
        source: 'blockquote'
      });
    }
  });
  
  // Pattern 2: Quote marks with "According to"
  const accordingToPattern = /(?:according to|says|stated|explained by|as (?:mentioned|noted) by)\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
  let match;
  while ((match = accordingToPattern.exec(text)) !== null) {
    quotes.push({
      text: match[0],
      attribution: match[1],
      hasAttribution: true,
      source: 'text-pattern'
    });
  }
  
  // Pattern 3: Professional titles
  const titlePattern = /(CEO|CTO|CFO|Director|Professor|Dr\.|PhD|Expert|Specialist|Analyst)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi;
  while ((match = titlePattern.exec(text)) !== null) {
    quotes.push({
      text: match[0],
      attribution: match[2],
      title: match[1],
      hasAttribution: true,
      source: 'title-pattern'
    });
  }
  
  return quotes;
}

function detectStatistics($, text) {
  const stats = [];
  
  // Pattern 1: Percentages
  const percentPattern = /\d+(?:\.\d+)?%/g;
  const percentMatches = text.match(percentPattern) || [];
  percentMatches.forEach(stat => {
    stats.push({
      value: stat,
      type: 'percentage',
      source: 'text'
    });
  });
  
  // Pattern 2: Large numbers
  const numberPattern = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand|k|M|B)\b/gi;
  const numberMatches = text.match(numberPattern) || [];
  numberMatches.forEach(stat => {
    stats.push({
      value: stat,
      type: 'number',
      source: 'text'
    });
  });
  
  // Pattern 3: Statistics with sources
  const sourcePattern = /(?:according to|source:|data from|study by)\s+([A-Za-z\s]+(?:Study|Report|Survey|Research|Institute|University|Organization))/gi;
  let match;
  while ((match = sourcePattern.exec(text)) !== null) {
    stats.push({
      value: match[0],
      source: match[1],
      type: 'cited-stat',
      hasCitation: true
    });
  }
  
  return stats;
}

function detectCaseStudies($, text) {
  const cases = [];
  
  // Pattern 1: Explicit case study headings
  $('h2, h3, h4').each((i, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (heading.includes('case study') || heading.includes('success story') || 
        heading.includes('customer story') || heading.includes('client story')) {
      cases.push({
        title: $(el).text().trim(),
        type: 'explicit',
        source: 'heading'
      });
    }
  });
  
  // Pattern 2: Before/After patterns
  const beforeAfterPattern = /(?:before|after).*?(?:results?|improvements?|changes?|outcomes?)/gi;
  const matches = text.match(beforeAfterPattern) || [];
  matches.forEach(match => {
    cases.push({
      text: match,
      type: 'before-after',
      source: 'text-pattern'
    });
  });
  
  // Pattern 3: Results/Outcomes with numbers
  const resultsPattern = /(?:achieved|resulted in|increased by|decreased by|improved by)\s+\d+(?:\.\d+)?%/gi;
  const resultMatches = text.match(resultsPattern) || [];
  resultMatches.forEach(match => {
    cases.push({
      text: match,
      type: 'result',
      source: 'text-pattern'
    });
  });
  
  return cases;
}

function detectProcessSteps($, text) {
  const steps = [];
  
  // Pattern 1: Numbered lists
  $('ol li').each((i, el) => {
    steps.push({
      text: $(el).text().trim(),
      number: i + 1,
      type: 'ordered-list'
    });
  });
  
  // Pattern 2: Step headings
  const stepPattern = /step\s+\d+[:.]?\s+(.+?)(?=step\s+\d+|$)/gi;
  let match;
  while ((match = stepPattern.exec(text)) !== null) {
    steps.push({
      text: match[0],
      type: 'text-pattern'
    });
  }
  
  return steps;
}

function detectExamples($, text) {
  const examples = [];
  
  // Pattern: "For example", "Such as", "Like"
  const examplePattern = /(?:for example|for instance|such as|like|e\.g\.|including).*?[.!?]/gi;
  const matches = text.match(examplePattern) || [];
  
  matches.forEach(match => {
    if (match.length > 20 && match.length < 300) {
      examples.push({
        text: match,
        type: 'inline-example'
      });
    }
  });
  
  return examples;
}

function detectCitations($) {
  const citations = [];
  
  // Pattern 1: Footnote references
  $('sup, .footnote, .reference').each((i, el) => {
    citations.push({
      text: $(el).text().trim(),
      type: 'footnote'
    });
  });
  
  // Pattern 2: Bibliography/References section
  $('h2, h3').each((i, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (heading.includes('reference') || heading.includes('sources') || 
        heading.includes('bibliography') || heading.includes('citations')) {
      const next = $(el).next();
      if (next.is('ul, ol')) {
        next.find('li').each((j, li) => {
          citations.push({
            text: $(li).text().trim(),
            type: 'bibliography'
          });
        });
      }
    }
  });
  
  return citations;
}

function detectTimestamps($, text) {
  const timestamps = [];
  
  // Pattern 1: Time elements
  $('time').each((i, el) => {
    timestamps.push({
      datetime: $(el).attr('datetime'),
      text: $(el).text().trim(),
      type: 'html-time'
    });
  });
  
  // Pattern 2: Date patterns in text
  const datePattern = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/gi;
  const matches = text.match(datePattern) || [];
  
  matches.forEach(match => {
    timestamps.push({
      text: match,
      type: 'text-pattern'
    });
  });
  
  // Pattern 3: Relative dates
  const relativePattern = /(?:updated|published|posted|modified|last updated).*?(?:today|yesterday|last week|last month|\d+\s+(?:days?|weeks?|months?|years?)\s+ago)/gi;
  const relativeMatches = text.match(relativePattern) || [];
  
  relativeMatches.forEach(match => {
    timestamps.push({
      text: match,
      type: 'relative'
    });
  });
  
  return timestamps;
}

function detectLists($) {
  return {
    ordered: $('ol').length,
    unordered: $('ul').length,
    totalItems: $('li').length
  };
}

function detectTables($) {
  const tables = [];
  
  $('table').each((i, el) => {
    tables.push({
      rows: $(el).find('tr').length,
      columns: $(el).find('tr').first().find('th, td').length,
      hasHeaders: $(el).find('thead, th').length > 0
    });
  });
  
  return tables;
}

function detectFAQs($) {
  const faqs = [];
  
  // Pattern 1: FAQ schema
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const data = JSON.parse($(el).html());
      if (data['@type'] === 'FAQPage' || data['@type'] === 'Question') {
        faqs.push({
          type: 'schema',
          count: data.mainEntity?.length || 1
        });
      }
    } catch {}
  });
  
  // Pattern 2: Accordion/Details elements
  $('details').each((i, el) => {
    faqs.push({
      question: $(el).find('summary').text().trim(),
      type: 'details-element'
    });
  });
  
  // Pattern 3: FAQ headings
  $('h2, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (text.endsWith('?')) {
      faqs.push({
        question: text,
        type: 'heading-question'
      });
    }
  });
  
  return faqs;
}

function detectVideos($) {
  const videos = [];
  
  $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').each((i, el) => {
    videos.push({
      type: el.tagName.toLowerCase() === 'video' ? 'html5-video' : 'embedded-video',
      src: $(el).attr('src') || $(el).find('source').attr('src')
    });
  });
  
  return videos;
}

function detectInfographics($) {
  const infographics = [];
  
  $('img').each((i, el) => {
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt') || '';
    
    if (src.includes('infographic') || alt.toLowerCase().includes('infographic') ||
        src.includes('chart') || src.includes('graph')) {
      infographics.push({
        src,
        alt,
        type: 'image'
      });
    }
  });
  
  // SVG elements (often used for charts)
  $('svg').each((i, el) => {
    if ($(el).find('path, rect, circle').length > 5) {
      infographics.push({
        type: 'svg-graphic'
      });
    }
  });
  
  return infographics;
}

function detectCallouts($) {
  const callouts = [];
  
  // Common callout classes
  $('.callout, .note, .tip, .warning, .alert, .info, .highlight, aside').each((i, el) => {
    callouts.push({
      text: $(el).text().trim().substring(0, 100),
      class: $(el).attr('class')
    });
  });
  
  return callouts;
}

// ==========================================
// STEP 3: DETERMINISTIC SCORING
// ==========================================

function calculateDeterministicScore(elements, pageData) {
  console.log('[SCORE] 🎯 Calculating deterministic scores...');
  
  const scores = {
    graaf: calculateGRAAFScore(elements, pageData),
    craft: calculateCRAFTScore(elements, pageData),
    technical: calculateTechnicalScore(elements, pageData)
  };
  
  const totalScore = scores.graaf.total + scores.craft.total + scores.technical.total;
  
  console.log('[SCORE] ✅ Scoring complete');
  console.log('[SCORE] 📊 GRAAF:', scores.graaf.total);
  console.log('[SCORE] 🎨 CRAFT:', scores.craft.total);
  console.log('[SCORE] ⚙️  Technical:', scores.technical.total);
  console.log('[SCORE] 🎯 TOTAL:', totalScore);
  
  return {
    total: totalScore,
    breakdown: scores,
    quality: totalScore >= 90 ? 'excellent' : 
             totalScore >= 80 ? 'good' : 
             totalScore >= 70 ? 'fair' : 
             totalScore >= 60 ? 'average' : 'needs-improvement'
  };
}

function calculateGRAAFScore(elements, pageData) {
  let credibility = 0;
  let relevance = 0;
  let actionability = 0;
  let accuracy = 0;
  let freshness = 0;
  
  // CREDIBILITY (10 points)
  // Expert quotes with attribution
  const quotesWithAttribution = elements.expertQuotes.filter(q => q.hasAttribution).length;
  credibility += Math.min(5, quotesWithAttribution);
  
  // Citations and references
  credibility += Math.min(3, elements.citations.length * 0.5);
  
  // External authoritative links
  const authLinks = elements.externalLinks.filter(l => 
    l.href.includes('.edu') || l.href.includes('.gov') || 
    l.href.includes('wikipedia') || l.href.includes('research')
  ).length;
  credibility += Math.min(2, authLinks * 0.5);
  
  // RELEVANCE (10 points)
  // Keyword consistency (title, H1, content)
  const titleWords = new Set(pageData.title.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const h1Words = elements.headings.h1.length > 0 ? 
    new Set(elements.headings.h1[0].toLowerCase().split(/\W+/).filter(w => w.length > 3)) : new Set();
  const intersection = [...titleWords].filter(x => h1Words.has(x));
  relevance += Math.min(5, intersection.length);
  
  // Structured headings (H2, H3)
  const headingStructure = elements.headings.h2.length >= 3 && elements.headings.h3.length >= 2;
  if (headingStructure) relevance += 3;
  
  // Internal linking
  relevance += Math.min(2, elements.internalLinks.length * 0.3);
  
  // ACTIONABILITY (10 points)
  // Process steps
  actionability += Math.min(4, elements.processSteps.length * 0.5);
  
  // Examples
  actionability += Math.min(3, elements.examples.length * 0.5);
  
  // Call-to-actions
  actionability += Math.min(3, elements.callouts.length * 0.5);
  
  // ACCURACY (10 points)
  // Statistics with sources
  const statsWithSources = elements.statistics.filter(s => s.hasCitation).length;
  accuracy += Math.min(5, statsWithSources);
  
  // Case studies with results
  const casesWithResults = elements.caseStudies.filter(c => c.type === 'result').length;
  accuracy += Math.min(3, casesWithResults);
  
  // Tables with data
  accuracy += Math.min(2, elements.tables.length);
  
  // FRESHNESS (10 points)
  // Timestamps
  freshness += Math.min(5, elements.timestamps.length * 0.5);
  
  // Recent dates (last 12 months)
  const recentTimestamps = elements.timestamps.filter(t => {
    if (t.datetime) {
      const date = new Date(t.datetime);
      const now = new Date();
      const monthsAgo = (now - date) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 12;
    }
    return t.type === 'relative'; // "updated today", etc.
  }).length;
  freshness += Math.min(3, recentTimestamps * 1.5);
  
  // Meta date tags
  if (pageData.jsonLd.some(ld => ld.datePublished || ld.dateModified)) {
    freshness += 2;
  }
  
  const total = Math.min(50, Math.round(credibility + relevance + actionability + accuracy + freshness));
  
  return {
    total,
    credibility: Math.round(credibility),
    relevance: Math.round(relevance),
    actionability: Math.round(actionability),
    accuracy: Math.round(accuracy),
    freshness: Math.round(freshness)
  };
}

function calculateCRAFTScore(elements, pageData) {
  let cutFluff = 0;
  let reviewOptimize = 0;
  let addVisuals = 0;
  let faqIntegration = 0;
  let trustBuilding = 0;
  
  // CUT FLUFF (8 points)
  // Optimal sentence length (15-20 words)
  const avgSentence = elements.metrics.avgSentenceLength;
  if (avgSentence >= 15 && avgSentence <= 20) cutFluff += 4;
  else if (avgSentence >= 12 && avgSentence <= 25) cutFluff += 2;
  
  // Paragraph count (not too many short paragraphs)
  const paragraphRatio = elements.metrics.wordCount / Math.max(1, elements.metrics.paragraphCount);
  if (paragraphRatio >= 60 && paragraphRatio <= 150) cutFluff += 4;
  else if (paragraphRatio >= 40 && paragraphRatio <= 200) cutFluff += 2;
  
  // REVIEW & OPTIMIZE (8 points)
  // Readability (Flesch approximation)
  const syllables = pageData.bodyText.match(/[aeiouy]{1,2}/gi)?.length || 0;
  const words = elements.metrics.wordCount;
  const sentences = elements.metrics.sentenceCount;
  let flesch = 206.835 - 1.015 * (words / Math.max(1, sentences)) - 84.6 * (syllables / words);
  flesch = Math.max(0, Math.min(100, flesch));
  
  if (flesch >= 60) reviewOptimize += 4; // Easy
  else if (flesch >= 50) reviewOptimize += 3;
  else if (flesch >= 30) reviewOptimize += 2;
  
  // Transition words
  const transitions = ['however', 'therefore', 'moreover', 'furthermore', 'consequently'];
  const transitionCount = transitions.reduce((count, word) => 
    count + (pageData.bodyText.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g'))?.length || 0), 0
  );
  reviewOptimize += Math.min(4, transitionCount * 0.5);
  
  // ADD VISUALS (6 points)
  // Images
  addVisuals += Math.min(2, elements.images.length * 0.2);
  
  // Videos
  addVisuals += Math.min(2, elements.videos.length);
  
  // Infographics/Charts
  addVisuals += Math.min(2, elements.infographics.length);
  
  // FAQ INTEGRATION (5 points)
  faqIntegration += Math.min(5, elements.faqs.length * 0.5);
  
  // TRUST BUILDING (3 points)
  // Author information
  const hasAuthor = pageData.bodyText.toLowerCase().includes('author') || 
                    pageData.jsonLd.some(ld => ld.author);
  if (hasAuthor) trustBuilding += 1;
  
  // Social proof (testimonials, reviews)
  const hasSocialProof = pageData.bodyText.toLowerCase().includes('testimonial') ||
                         pageData.bodyText.toLowerCase().includes('review') ||
                         elements.schema.some(s => s['@type'] === 'Review');
  if (hasSocialProof) trustBuilding += 1;
  
  // Trust badges/certifications
  const hasTrustBadges = pageData.images.some(img => 
    img.alt.toLowerCase().includes('certified') || 
    img.alt.toLowerCase().includes('verified') ||
    img.alt.toLowerCase().includes('secure')
  );
  if (hasTrustBadges) trustBuilding += 1;
  
  const total = Math.min(30, Math.round(cutFluff + reviewOptimize + addVisuals + faqIntegration + trustBuilding));
  
  return {
    total,
    cutFluff: Math.round(cutFluff),
    reviewOptimize: Math.round(reviewOptimize),
    addVisuals: Math.round(addVisuals),
    faqIntegration: Math.round(faqIntegration),
    trustBuilding: Math.round(trustBuilding)
  };
}

function calculateTechnicalScore(elements, pageData) {
  let metaOptimization = 0;
  let schemaMarkup = 0;
  let internalLinking = 0;
  let pageStructure = 0;
  let mobileOptimization = 0;
  
  // META OPTIMIZATION (4 points)
  // Title length
  if (pageData.title.length >= 30 && pageData.title.length <= 60) metaOptimization += 1;
  
  // Meta description
  if (pageData.metaDescription.length >= 120 && pageData.metaDescription.length <= 160) metaOptimization += 1;
  
  // Canonical URL
  if (pageData.canonical) metaOptimization += 1;
  
  // Open Graph
  if (pageData.ogTitle && pageData.ogDescription) metaOptimization += 1;
  
  // SCHEMA MARKUP (4 points)
  schemaMarkup += Math.min(4, pageData.jsonLd.length);
  
  // INTERNAL LINKING (4 points)
  const linkRatio = elements.internalLinks.length / Math.max(1, elements.metrics.wordCount / 100);
  if (linkRatio >= 2 && linkRatio <= 5) internalLinking += 4;
  else if (linkRatio >= 1 && linkRatio <= 7) internalLinking += 2;
  
  // PAGE STRUCTURE (4 points)
  // Single H1
  if (elements.headings.h1.length === 1) pageStructure += 1;
  
  // Multiple H2s
  if (elements.headings.h2.length >= 3) pageStructure += 1;
  
  // Heading hierarchy
  const hasHierarchy = elements.headings.h1.length > 0 && 
                       elements.headings.h2.length > 0;
  if (hasHierarchy) pageStructure += 1;
  
  // Image alt texts
  const altRatio = elements.images.length > 0 ? 
    elements.images.filter(img => img.hasAlt).length / elements.images.length : 0;
  if (altRatio >= 0.9) pageStructure += 1;
  
  // MOBILE OPTIMIZATION (4 points)
  // Viewport meta
  if (pageData.viewport) mobileOptimization += 2;
  
  // Responsive images (lazy loading)
  const lazyImages = elements.images.filter(img => img.loading === 'lazy').length;
  if (lazyImages > 0) mobileOptimization += 1;
  
  // Reasonable page width
  if (pageData.pageWidth <= 1920) mobileOptimization += 1;
  
  const total = Math.min(20, Math.round(metaOptimization + schemaMarkup + internalLinking + pageStructure + mobileOptimization));
  
  return {
    total,
    metaOptimization: Math.round(metaOptimization),
    schemaMarkup: Math.round(schemaMarkup),
    internalLinking: Math.round(internalLinking),
    pageStructure: Math.round(pageStructure),
    mobileOptimization: Math.round(mobileOptimization)
  };
}

// ==========================================
// STEP 4: GENERATE RECOMMENDATIONS
// ==========================================

function generateRecommendations(elements, scores, pageData) {
  console.log('[RECS] 💡 Generating recommendations...');
  
  const recommendations = {
    quickWins: [],
    majorImpact: [],
    advanced: [],
    summary: {
      totalIssues: 0,
      estimatedTimeToFix: 0,
      potentialScoreGain: 0,
      currentScore: scores.total,
      targetScore: 100
    }
  };
  
  // QUICK WINS (5-30 min fixes)
  
  // Meta description
  if (!pageData.metaDescription || pageData.metaDescription.length < 120) {
    recommendations.quickWins.push({
      category: 'Technical SEO',
      issue: 'Missing or short meta description',
      action: 'Add a compelling 120-160 character meta description',
      details: ['Include primary keyword', 'Make it click-worthy', 'Describe page value'],
      impact: 5,
      timeEstimate: 10,
      priority: 'high'
    });
    recommendations.summary.potentialScoreGain += 3;
  }
  
  // H1 issues
  if (elements.headings.h1.length === 0) {
    recommendations.quickWins.push({
      category: 'Content Structure',
      issue: 'No H1 heading found',
      action: 'Add a clear H1 heading with your primary keyword',
      details: ['Make it descriptive', 'Include main keyword', 'Keep under 60 characters'],
      impact: 5,
      timeEstimate: 5,
      priority: 'high'
    });
    recommendations.summary.potentialScoreGain += 5;
  }
  
  // Image alt texts
  const imagesWithoutAlt = elements.images.filter(img => !img.hasAlt).length;
  if (imagesWithoutAlt > 0) {
    recommendations.quickWins.push({
      category: 'Accessibility',
      issue: `${imagesWithoutAlt} images missing alt text`,
      action: 'Add descriptive alt text to all images',
      details: ['Describe the image', 'Include relevant keywords naturally', 'Keep under 125 characters'],
      impact: 4,
      timeEstimate: imagesWithoutAlt * 2,
      priority: 'high'
    });
    recommendations.summary.potentialScoreGain += 2;
  }
  
  // Internal links
  if (elements.internalLinks.length < 3) {
    recommendations.quickWins.push({
      category: 'SEO Linking',
      issue: 'Too few internal links',
      action: 'Add 3-5 relevant internal links to related content',
      details: ['Link to related articles', 'Use descriptive anchor text', 'Help users navigate'],
      impact: 4,
      timeEstimate: 15,
      priority: 'medium'
    });
    recommendations.summary.potentialScoreGain += 3;
  }
  
  // MAJOR IMPACT (30-120 min fixes)
  
  // Word count
  if (elements.metrics.wordCount < 800) {
    recommendations.majorImpact.push({
      category: 'Content Depth',
      issue: `Content is too short (${elements.metrics.wordCount} words)`,
      action: 'Expand content to at least 1000-1500 words',
      details: ['Add more examples', 'Include case studies', 'Add data and statistics'],
      impact: 5,
      timeEstimate: 90,
      priority: 'high'
    });
    recommendations.summary.potentialScoreGain += 10;
  }
  
  // Expert quotes
  if (elements.expertQuotes.length < 2) {
    recommendations.majorImpact.push({
      category: 'Credibility',
      issue: 'Lacks expert quotes or citations',
      action: 'Add 2-3 expert quotes with proper attribution',
      details: ['Interview industry experts', 'Quote published research', 'Cite authoritative sources'],
      impact: 4,
      timeEstimate: 60,
      priority: 'medium'
    });
    recommendations.summary.potentialScoreGain += 5;
  }
  
  // Statistics
  if (elements.statistics.length < 3) {
    recommendations.majorImpact.push({
      category: 'Data-Driven Content',
      issue: 'Needs more statistics and data',
      action: 'Add 5+ relevant statistics with sources',
      details: ['Use industry reports', 'Include recent research', 'Cite credible sources'],
      impact: 4,
      timeEstimate: 45,
      priority: 'medium'
    });
    recommendations.summary.potentialScoreGain += 4;
  }
  
  // FAQs
  if (elements.faqs.length === 0) {
    recommendations.majorImpact.push({
      category: 'User Experience',
      issue: 'No FAQ section',
      action: 'Add an FAQ section with 5+ common questions',
      details: ['Answer common user questions', 'Use FAQ schema markup', 'Include long-tail keywords'],
      impact: 3,
      timeEstimate: 60,
      priority: 'medium'
    });
    recommendations.summary.potentialScoreGain += 3;
  }
  
  // ADVANCED (120+ min fixes)
  
  // Schema markup
  if (pageData.jsonLd.length === 0) {
    recommendations.advanced.push({
      category: 'Structured Data',
      issue: 'No schema markup implemented',
      action: 'Add JSON-LD structured data',
      details: ['Use Article schema', 'Add Organization schema', 'Include FAQ schema if applicable'],
      impact: 3,
      timeEstimate: 120,
      priority: 'low'
    });
    recommendations.summary.potentialScoreGain += 4;
  }
  
  // Readability
  if (elements.metrics.avgSentenceLength > 25) {
    recommendations.advanced.push({
      category: 'Readability',
      issue: 'Sentences are too long',
      action: 'Rewrite content with shorter, clearer sentences',
      details: ['Aim for 15-20 words per sentence', 'Break up complex ideas', 'Use simpler language'],
      impact: 3,
      timeEstimate: 180,
      priority: 'low'
    });
    recommendations.summary.potentialScoreGain += 3;
  }
  
  // Calculate summary
  recommendations.summary.totalIssues = 
    recommendations.quickWins.length + 
    recommendations.majorImpact.length + 
    recommendations.advanced.length;
  
  recommendations.summary.estimatedTimeToFix = 
    recommendations.quickWins.reduce((sum, r) => sum + r.timeEstimate, 0) +
    recommendations.majorImpact.reduce((sum, r) => sum + r.timeEstimate, 0) +
    recommendations.advanced.reduce((sum, r) => sum + r.timeEstimate, 0);
  
  recommendations.summary.targetScore = Math.min(100, 
    scores.total + recommendations.summary.potentialScoreGain
  );
  
  console.log('[RECS] ✅ Generated', recommendations.summary.totalIssues, 'recommendations');
  
  return recommendations;
}

// ==========================================
// MAIN SCAN FUNCTION
// ==========================================

async function performFullScan(url) {
  console.log('\n========================================');
  console.log('🚀 CONTENTSCALE HYBRID SCANNER V3.0');
  console.log('========================================\n');
  console.log('[SCAN] 🎯 Target:', url);
  console.log('[SCAN] ⏰ Started:', new Date().toISOString());
  
  try {
    // STEP 1: Fetch content
    const pageData = await fetchPageContent(url);
    if (!pageData.success) {
      return { 
        success: false, 
        error: pageData.error || 'Failed to fetch page content',
        url 
      };
    }
    
    // STEP 2: Parse content
    const elements = parseContentElements(pageData);
    
    // STEP 3: Calculate scores
    const scoreResult = calculateDeterministicScore(elements, pageData);
    
    // STEP 4: Generate recommendations
    const recommendations = generateRecommendations(elements, scoreResult, pageData);
    
    // Final result
    const result = {
      success: true,
      url,
      score: scoreResult.total,
      quality: scoreResult.quality,
      breakdown: scoreResult.breakdown,
      recommendations,
      wordCount: elements.metrics.wordCount,
      scanned_at: new Date().toISOString(),
      
      // Additional metadata
      metadata: {
        title: pageData.title,
        metaDescription: pageData.metaDescription,
        h1: elements.headings.h1[0] || '',
        readingTime: elements.metrics.readingTime,
        
        // Detection counts
        detectedElements: {
          expertQuotes: elements.expertQuotes.length,
          statistics: elements.statistics.length,
          caseStudies: elements.caseStudies.length,
          processSteps: elements.processSteps.length,
          examples: elements.examples.length,
          faqs: elements.faqs.length,
          images: elements.images.length,
          videos: elements.videos.length,
          internalLinks: elements.internalLinks.length,
          externalLinks: elements.externalLinks.length
        }
      },
      
      // Scanner info
      scanner: {
        version: '3.0',
        type: 'hybrid-deterministic',
        timestamp: new Date().toISOString()
      }
    };
    
    console.log('\n========================================');
    console.log('✅ SCAN COMPLETE');
    console.log('========================================');
    console.log('[RESULT] 🎯 Score:', result.score, '/', 100);
    console.log('[RESULT] 🏆 Quality:', result.quality);
    console.log('[RESULT] 📝 Words:', result.wordCount);
    console.log('[RESULT] ⏰ Completed:', new Date().toISOString());
    console.log('========================================\n');
    
    return result;
    
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ SCAN FAILED');
    console.error('========================================');
    console.error('[ERROR]', error.message);
    console.error('========================================\n');
    
    return {
      success: false,
      error: 'Scan failed: ' + error.message,
      url
    };
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  performFullScan,
  fetchPageContent,
  parseContentElements,
  calculateDeterministicScore,
  generateRecommendations
};
