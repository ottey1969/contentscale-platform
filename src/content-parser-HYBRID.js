// ==========================================
// CONTENT PARSER - HYBRID SYSTEM (FIXED)
// Deterministic parsing of HTML content
// ==========================================

const cheerio = require('cheerio');

/**
 * Parse content and extract all elements
 * This is STEP 2 of the hybrid pipeline
 * 
 * @param {string} html - Full HTML content (from Puppeteer)
 * @param {string} url - URL being scanned
 * @returns {object} - Parser output with counts
 */
function parseContent(html, url) {
  const $ = cheerio.load(html);
  
  // Remove script and style tags
  $('script').remove();
  $('style').remove();
  
  // Extract text content
  const bodyText = $('body').text();
  const cleanText = bodyText.replace(/\s+/g, ' ').trim();
  
  // Word count
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // ==========================================
  // GRAAF FRAMEWORK PARSING
  // ==========================================
  
  // G - GENUINELY CREDIBLE
  const expertQuotes = extractExpertQuotes($, html, cleanText);
  const statistics = extractStatistics(html, cleanText);
  const sourceCitations = extractSourceCitations($);
  
  // R - RELEVANCE
  const title = $('title').text() || '';
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const h1Text = $('h1').text() || '';
  const firstParagraph = $('p').first().text().substring(0, 500);
  
  // Calculate keyword density (will be done by scoring)
  const keywordData = {
    title,
    h1Text,
    firstParagraph,
    wordCount
  };
  
  // A - ACTIONABILITY
  const stepByStep = extractStepByStep($, cleanText);
  const examples = extractExamples(cleanText);
  const ctas = extractCTAs($, cleanText);
  const toolsResources = extractToolsResources($);
  
  // A - ACCURACY
  const dataCitations = extractDataCitations($, cleanText);
  const caseStudies = extractCaseStudies(cleanText);
  const factSources = extractFactSources($);
  const publicationDate = extractPublicationDate($);
  
  // F - FRESHNESS
  const lastModified = extractLastModified($);
  const currentYearMentions = extractYearMentions(cleanText);
  const dataRecency = extractDataRecency(cleanText);
  const trendingTopics = extractTrendingTopics(cleanText);
  
  // ==========================================
  // CRAFT FRAMEWORK PARSING
  // ==========================================
  
  // C - CUT THE FLUFF
  const readability = calculateReadability(cleanText);
  const sentenceStats = calculateSentenceStats(cleanText);
  const paragraphStats = calculateParagraphStats($);
  
  // R - REVIEW & OPTIMIZE
  const metaTitle = $('title').text();
  const metaTitleLength = metaTitle.length;
  const metaDescLength = metaDescription.length;
  const lsiKeywords = extractLSIKeywords(cleanText);
  
  // A - ADD VISUALS
  const images = extractImages($);
  const videos = extractVideos($);
  const tables = extractTables($);
  const comparisonTables = extractComparisonTables($);
  
  // F - FAQ INTEGRATION
  const faqs = extractFAQs($, cleanText);
  const faqSchema = checkFAQSchema($);
  
  // T - TRUST BUILDING
  const authorBio = extractAuthorBio($);
  const credentials = extractCredentials(cleanText);
  const testimonials = extractTestimonials($, cleanText);
  const authorityLinks = extractAuthorityLinks($);
  
  // ==========================================
  // TECHNICAL SEO PARSING
  // ==========================================
  
  const h1Count = $('h1').length;
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;
  const headingHierarchy = checkHeadingHierarchy($);
  
  const internalLinks = extractInternalLinks($, url);
  const externalLinks = $('a[href^="http"]').length;
  
  const schemaMarkup = extractSchemaMarkup($);
  const tableOfContents = checkTableOfContents($);
  const mobileResponsive = checkMobileResponsive($);
  
  // ==========================================
  // RETURN PARSER OUTPUT
  // ==========================================
  
  return {
    url,
    counts: {
      // Word count
      wordCount,
      
      // GRAAF - Credibility
      expertQuotes: expertQuotes.length,
      statistics: statistics.length,
      sourceCitations: sourceCitations.length,
      
      // GRAAF - Relevance
      keywordInTitle: 0, // Will be calculated in scoring
      keywordInFirst100: 0, // Will be calculated in scoring
      keywordDensity: 0, // Will be calculated in scoring
      lsiKeywords: lsiKeywords.length,
      
      // GRAAF - Actionability
      stepByStep: stepByStep.length,
      examples: examples.length,
      ctas: ctas.length,
      toolsResources: toolsResources.length,
      
      // GRAAF - Accuracy
      dataCitations: dataCitations.length,
      caseStudies: caseStudies.length,
      factSources: factSources.length,
      publicationDate: publicationDate ? 1 : 0,
      
      // GRAAF - Freshness
      lastModified: lastModified ? 1 : 0,
      currentYearMentions: currentYearMentions.length,
      dataRecency: dataRecency.length,
      trendingTopics: trendingTopics.length,
      
      // CRAFT - Cut Fluff
      fleschScore: readability.flesch,
      avgSentenceLength: sentenceStats.avgLength,
      longParagraphs: paragraphStats.longCount,
      
      // CRAFT - Review & Optimize
      metaTitleLength,
      metaDescLength,
      
      // CRAFT - Add Visuals
      images: images.length,
      imagesWithAlt: images.filter(img => img.hasAlt).length,
      videos: videos.length,
      tables: tables.length,
      comparisonTables: comparisonTables.length,
      
      // CRAFT - FAQ
      faqCount: faqs.length,
      faqSchema: faqSchema ? 1 : 0,
      
      // CRAFT - Trust
      authorBio: authorBio ? 1 : 0,
      credentials: credentials.length,
      testimonials: testimonials.length,
      authorityLinks: authorityLinks.length,
      
      // Technical SEO
      h1Count,
      h2Count,
      h3Count,
      headingHierarchy: headingHierarchy ? 1 : 0,
      internalLinks: internalLinks.length,
      externalLinks,
      schemaTypes: schemaMarkup.types.length,
      tableOfContents: tableOfContents ? 1 : 0,
      mobileResponsive: mobileResponsive ? 1 : 0
    },
    
    snippets: {
      expertQuotes: expertQuotes.slice(0, 10),
      statistics: statistics.slice(0, 10),
      caseStudies: caseStudies.slice(0, 5),
      faqs: faqs.slice(0, 10)
    },
    
    metadata: {
      title: metaTitle,
      description: metaDescription,
      h1Text,
      wordCount,
      readability: readability.flesch
    }
  };
}

// ==========================================
// EXTRACTION FUNCTIONS (FIXED)
// ==========================================

function extractExpertQuotes($, html, text) {
  const quotes = [];
  
  // METHOD 1: Look for blockquote elements with citations
  $('blockquote').each((i, el) => {
    const quoteText = $(el).text().trim();
    const citation = $(el).find('cite, .author, .attribution').text().trim() || 
                     $(el).next('p, cite, .author').text().trim();
    
    if (quoteText.length > 30 && citation.length > 5) {
      quotes.push({
        text: quoteText,
        attribution: citation
      });
    }
  });
  
  // METHOD 2: Regex pattern - "Quote text" - Name, Title
  const quoteRegex = /"([^"]{30,})"[\s\S]{0,150}?[-–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    quotes.push({
      text: match[1],
      attribution: match[2]
    });
  }
  
  // METHOD 3: Look for paragraphs with quotes followed by name/title
  $('p').each((i, el) => {
    const pText = $(el).text().trim();
    
    // Check if paragraph contains quoted text
    if (/"[^"]{30,}"/.test(pText)) {
      // Check next few siblings for name/title
      let attribution = '';
      const nextEl = $(el).next();
      const nextText = nextEl.text().trim();
      
      // If next element looks like a name/title (capitalized, short)
      if (nextText.length > 5 && nextText.length < 100 && /^[A-Z]/.test(nextText)) {
        attribution = nextText;
      }
      
      if (attribution) {
        const quoteMatch = pText.match(/"([^"]{30,})"/);
        if (quoteMatch) {
          quotes.push({
            text: quoteMatch[1],
            attribution: attribution
          });
        }
      }
    }
  });
  
  // METHOD 4: Look for testimonial/review/quote containers
  $('.testimonial, .quote, .review, [class*="quote"], [class*="testimonial"]').each((i, el) => {
    const quoteText = $(el).find('p, .text, .content').first().text().trim();
    const attribution = $(el).find('.author, .name, cite, [class*="author"]').text().trim();
    
    if (quoteText.length > 30 && attribution.length > 3) {
      quotes.push({
        text: quoteText,
        attribution: attribution
      });
    }
  });
  
  // Remove duplicates
  const uniqueQuotes = [];
  const seen = new Set();
  
  for (const quote of quotes) {
    const key = quote.text.substring(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueQuotes.push(quote);
    }
  }
  
  console.log(`✅ Extracted ${uniqueQuotes.length} expert quotes`);
  return uniqueQuotes;
}

function extractStatistics(html, text) {
  const stats = [];
  
  // Pattern: Numbers with % or large numbers
  const statRegex = /(\d+(?:\.\d+)?%|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:million|billion|thousand))/gi;
  
  let match;
  while ((match = statRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, match.index - 100), match.index + 200);
    const hasSource = /(?:according to|source:|study|research|survey|report)/i.test(context);
    
    stats.push({
      value: match[1],
      hasSource,
      context: context.substring(0, 150)
    });
  }
  
  console.log(`✅ Extracted ${stats.length} statistics`);
  return stats;
}

function extractSourceCitations($) {
  const citations = [];
  
  $('a[href^="http"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    
    // Check if it's a citation (not just any link)
    if (text.length > 5 && text.length < 200) {
      citations.push({
        url: href,
        text
      });
    }
  });
  
  return citations;
}

function extractStepByStep($, text) {
  const steps = [];
  
  // Look for numbered lists
  $('ol li').each((i, el) => {
    steps.push($(el).text().trim());
  });
  
  // Look for step headings
  $('h2, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (/step\s*\d|^\d+\.|first|second|third|finally|next/i.test(text)) {
      steps.push(text);
    }
  });
  
  return steps;
}

function extractExamples(text) {
  const examples = [];
  const exampleRegex = /(?:for example|for instance|such as|e\.g\.|like this|here's an example)[^.]{10,200}/gi;
  
  let match;
  while ((match = exampleRegex.exec(text)) !== null) {
    examples.push(match[0]);
  }
  
  return examples;
}

function extractCTAs($, text) {
  const ctas = [];
  
  $('button, a.button, .cta, [class*="cta"], a[class*="btn"]').each((i, el) => {
    const ctaText = $(el).text().trim();
    if (ctaText.length > 0) {
      ctas.push(ctaText);
    }
  });
  
  // Also search text for CTA phrases
  const ctaRegex = /(?:click here|download|get started|sign up|try now|learn more|contact us|buy now|subscribe|get free)/gi;
  let match;
  while ((match = ctaRegex.exec(text)) !== null) {
    ctas.push(match[0]);
  }
  
  return [...new Set(ctas)]; // Remove duplicates
}

function extractToolsResources($) {
  const tools = [];
  
  $('a[href*="tool"], a[href*="resource"], a[href*="download"], a[href*="template"]').each((i, el) => {
    tools.push($(el).attr('href'));
  });
  
  return tools;
}

function extractDataCitations($, text) {
  const citations = [];
  
  // Look for citations with data
  const citationRegex = /\(([^)]+(?:20\d{2}|study|research|source|report))\)/gi;
  
  let match;
  while ((match = citationRegex.exec(text)) !== null) {
    citations.push(match[1]);
  }
  
  return citations;
}

function extractCaseStudies(text) {
  const caseStudies = [];
  const caseRegex = /case study|client success|customer story|real result[^.]{50,300}/gi;
  
  let match;
  while ((match = caseRegex.exec(text)) !== null) {
    caseStudies.push(match[0]);
  }
  
  return caseStudies;
}

function extractFactSources($) {
  const sources = [];
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (/\.gov|\.edu|research|study|journal|\.org/i.test(href)) {
      sources.push(href);
    }
  });
  
  return sources;
}

function extractPublicationDate($) {
  const dateSelectors = [
    'time[datetime]',
    '.published',
    '.date',
    '[class*="date"]',
    'meta[property="article:published_time"]',
    'meta[name="publish_date"]'
  ];
  
  for (const selector of dateSelectors) {
    const date = $(selector).first().attr('datetime') || $(selector).first().attr('content') || $(selector).first().text();
    if (date) return date;
  }
  
  return null;
}

function extractLastModified($) {
  const modifiedSelectors = [
    'meta[property="article:modified_time"]',
    '.updated',
    '.modified',
    'time[class*="updated"]'
  ];
  
  for (const selector of modifiedSelectors) {
    const date = $(selector).first().attr('content') || $(selector).first().text();
    if (date) return date;
  }
  
  return null;
}

function extractYearMentions(text) {
  const years = [];
  const yearRegex = /\b(202[3-5])\b/g;
  
  let match;
  while ((match = yearRegex.exec(text)) !== null) {
    years.push(match[1]);
  }
  
  return years;
}

function extractDataRecency(text) {
  const recentData = [];
  const recencyRegex = /(202[3-5])[^.]{0,100}(?:data|study|research|report)/gi;
  
  let match;
  while ((match = recencyRegex.exec(text)) !== null) {
    recentData.push(match[0]);
  }
  
  return recentData;
}

function extractTrendingTopics(text) {
  const trendingKeywords = ['AI', 'ChatGPT', 'machine learning', 'automation', 'cloud', 'sustainability', 'AI Overview'];
  const found = [];
  
  trendingKeywords.forEach(keyword => {
    if (new RegExp(keyword, 'i').test(text)) {
      found.push(keyword);
    }
  });
  
  return found;
}

function calculateReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  
  const avgSentenceLength = words.length / Math.max(sentences.length, 1);
  const avgSyllablesPerWord = syllables / Math.max(words.length, 1);
  
  // Flesch Reading Ease
  const flesch = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  
  return {
    flesch: Math.max(0, Math.min(100, flesch)),
    avgSentenceLength,
    avgSyllablesPerWord
  };
}

function countSyllables(word) {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function calculateSentenceStats(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const wordCounts = sentences.map(s => s.split(/\s+/).length);
  
  const avgLength = wordCounts.reduce((sum, count) => sum + count, 0) / Math.max(sentences.length, 1);
  const longSentences = wordCounts.filter(count => count > 25).length;
  
  return {
    count: sentences.length,
    avgLength,
    longCount: longSentences
  };
}

function calculateParagraphStats($) {
  const paragraphs = $('p');
  let longCount = 0;
  
  paragraphs.each((i, el) => {
    const wordCount = $(el).text().split(/\s+/).length;
    if (wordCount > 150) longCount++;
  });
  
  return {
    count: paragraphs.length,
    longCount
  };
}

function extractLSIKeywords(text) {
  // Simple LSI detection - look for related terms
  const lsiTerms = [
    'SEO', 'optimization', 'ranking', 'content', 'keywords',
    'traffic', 'search engine', 'Google', 'website', 'page'
  ];
  
  const found = [];
  lsiTerms.forEach(term => {
    if (new RegExp(term, 'i').test(text)) {
      found.push(term);
    }
  });
  
  return found;
}

function extractImages($) {
  const images = [];
  
  $('img').each((i, el) => {
    // Check multiple src attributes (lazy loading support)
    const src = $(el).attr('src') || 
                $(el).attr('data-src') || 
                $(el).attr('data-lazy-src') || '';
    
    const alt = $(el).attr('alt') || '';
    
    // Only count real images (not placeholders)
    if (src && !src.includes('placeholder') && !src.includes('data:image')) {
      images.push({
        src,
        alt,
        hasAlt: alt.trim().length > 5
      });
    }
  });
  
  console.log(`✅ Extracted ${images.length} images (${images.filter(i => i.hasAlt).length} with alt)`);
  return images;
}

function extractVideos($) {
  const videos = [];
  
  $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').each((i, el) => {
    videos.push($(el).attr('src') || 'embedded video');
  });
  
  return videos;
}

function extractTables($) {
  const tables = [];
  
  $('table').each((i, el) => {
    const hasHeaders = $(el).find('th, thead').length > 0;
    if (hasHeaders) {
      tables.push({
        index: i,
        hasHeaders: true
      });
    }
  });
  
  return tables;
}

function extractComparisonTables($) {
  const comparisonTables = [];
  
  $('table').each((i, el) => {
    const tableText = $(el).text();
    if (/vs|versus|comparison|compare/i.test(tableText)) {
      comparisonTables.push(i);
    }
  });
  
  return comparisonTables;
}

function extractFAQs($, text) {
  const faqs = [];
  
  // METHOD 1: Look for FAQ sections with question/answer pairs
  $('.faq, [class*="faq"], #faq').find('h2, h3, h4, dt, .question').each((i, el) => {
    const questionText = $(el).text().trim();
    if (questionText.includes('?') && questionText.length > 10) {
      const answer = $(el).next('p, dd, .answer, div').text().trim().substring(0, 200);
      faqs.push({
        question: questionText,
        answer: answer
      });
    }
  });
  
  // METHOD 2: Look for all headings with questions
  $('h2, h3, h4').each((i, el) => {
    const questionText = $(el).text().trim();
    if (questionText.includes('?') && questionText.length > 10 && questionText.length < 200) {
      const answer = $(el).next('p, div').text().trim().substring(0, 200);
      faqs.push({
        question: questionText,
        answer: answer
      });
    }
  });
  
  // METHOD 3: Look for dt/dd pairs
  $('dt').each((i, el) => {
    const questionText = $(el).text().trim();
    if (questionText.includes('?')) {
      const answer = $(el).next('dd').text().trim().substring(0, 200);
      faqs.push({
        question: questionText,
        answer: answer
      });
    }
  });
  
  // Remove duplicates
  const uniqueFAQs = [];
  const seen = new Set();
  
  for (const faq of faqs) {
    const key = faq.question.substring(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFAQs.push(faq);
    }
  }
  
  console.log(`✅ Extracted ${uniqueFAQs.length} FAQs`);
  return uniqueFAQs;
}

function checkFAQSchema($) {
  const scripts = $('script[type="application/ld+json"]');
  
  let hasFAQSchema = false;
  scripts.each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      if (json['@type'] === 'FAQPage' || (Array.isArray(json['@graph']) && json['@graph'].some(item => item['@type'] === 'FAQPage'))) {
        hasFAQSchema = true;
      }
    } catch (e) {
      // Ignore parse errors
    }
  });
  
  return hasFAQSchema;
}

function extractAuthorBio($) {
  const authorSelectors = [
    '.author-bio',
    '.author',
    '[class*="author"]',
    '[rel="author"]',
    '.about-author'
  ];
  
  for (const selector of authorSelectors) {
    const bio = $(selector).first().text().trim();
    if (bio && bio.length > 50) return bio;
  }
  
  return null;
}

function extractCredentials(text) {
  const credentials = [];
  const credentialRegex = /(?:certified|certification|phd|mba|master|bachelor|degree|expert|specialist|consultant|google certified)/gi;
  
  let match;
  while ((match = credentialRegex.exec(text)) !== null) {
    credentials.push(match[0]);
  }
  
  return [...new Set(credentials)];
}

function extractTestimonials($, text) {
  const testimonials = [];
  
  $('.testimonial, .review, [class*="testimonial"], [class*="review"], .client-review').each((i, el) => {
    const testimony = $(el).text().trim();
    if (testimony.length > 30) {
      testimonials.push(testimony.substring(0, 200));
    }
  });
  
  return testimonials;
}

function extractAuthorityLinks($) {
  const authorityLinks = [];
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (/\.gov|\.edu|\.org|research|institute|university|journal/i.test(href)) {
      authorityLinks.push(href);
    }
  });
  
  return authorityLinks;
}

function checkHeadingHierarchy($) {
  const h1Count = $('h1').length;
  const h2Count = $('h2').length;
  
  // Basic check: should have 1 H1 and at least 1 H2
  return h1Count === 1 && h2Count > 0;
}

function extractInternalLinks($, url) {
  const internalLinks = [];
  const domain = new URL(url).hostname;
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    try {
      const linkUrl = new URL(href, url);
      if (linkUrl.hostname === domain) {
        internalLinks.push(href);
      }
    } catch (e) {
      // Ignore invalid URLs
    }
  });
  
  return internalLinks;
}

function extractSchemaMarkup($) {
  const schemas = {
    types: [],
    count: 0
  };
  
  const scripts = $('script[type="application/ld+json"]');
  
  scripts.each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      if (json['@type']) {
        schemas.types.push(json['@type']);
        schemas.count++;
      }
      if (json['@graph']) {
        json['@graph'].forEach(item => {
          if (item['@type']) {
            schemas.types.push(item['@type']);
            schemas.count++;
          }
        });
      }
    } catch (e) {
      // Ignore parse errors
    }
  });
  
  return schemas;
}

function checkTableOfContents($) {
  const tocSelectors = [
    '[class*="toc"]',
    '[id*="toc"]',
    '.table-of-contents',
    '#table-of-contents',
    '[class*="contents"]'
  ];
  
  for (const selector of tocSelectors) {
    if ($(selector).length > 0) return true;
  }
  
  return false;
}

function checkMobileResponsive($) {
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  return viewport.includes('width=device-width');
}

module.exports = {
  parseContent
};
