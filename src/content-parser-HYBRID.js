// ==========================================
// CONTENT PARSER - HYBRID SYSTEM
// Extracts RAW counts + snippets for Claude validation
// 100% Deterministic detection
// ==========================================

const cheerio = require('cheerio');

/**
 * Main parser function - extracts all metrics + snippets
 * @param {string} html - Raw HTML content
 * @param {string} url - Page URL
 * @returns {Object} Parser output with counts and snippets
 */
function parseContent(html, url) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const cleanText = bodyText.replace(/\s+/g, ' ').trim();
  
  console.log('🔍 PARSER: Starting analysis...');
  
  // Extract all metrics
  const expertQuotes = detectExpertQuotes($, bodyText);
  const statistics = detectStatistics(bodyText);
  const sources = detectSources(bodyText);
  const caseStudies = detectCaseStudies($, bodyText);
  const faqData = detectFAQ($);
  const internalLinks = detectInternalLinks($, url);
  const images = detectImages($);
  
  // Technical SEO
  const metaData = extractMetaData($);
  const schemaData = extractSchemaData(html);
  const headings = countHeadings($);
  
  // Content metrics
  const wordCount = countWords(cleanText);
  const paragraphs = analyzeParagraphs($);
  const lists = countLists($);
  const tables = countTables($);
  
  console.log(`✅ PARSER: Detected ${expertQuotes.count} expert quotes, ${statistics.count} statistics, ${faqData.count} FAQ`);
  
  return {
    // RAW counts (for scoring)
    counts: {
      expertQuotes: expertQuotes.count,
      statistics: statistics.count,
      sources: sources.count,
      caseStudies: caseStudies.count,
      faqCount: faqData.count,
      faqAvgWords: faqData.avgWords,
      internalLinks: internalLinks.count,
      externalLinks: internalLinks.external,
      images: images.total,
      imagesWithAlt: images.withAlt,
      wordCount: wordCount,
      h1Count: headings.h1,
      h2Count: headings.h2,
      h3Count: headings.h3,
      paragraphCount: paragraphs.count,
      avgParagraphLength: paragraphs.avgLength,
      lists: lists,
      tables: tables.total,
      comparisonTables: tables.comparison,
      metaTitleLength: metaData.titleLength,
      metaDescLength: metaData.descLength,
      hasSchema: schemaData.hasSchema,
      schemaTypes: schemaData.types,
    },
    
    // Snippets for Claude validation
    snippets: {
      expertQuotes: expertQuotes.snippets,
      statistics: statistics.snippets,
      sources: sources.snippets,
      caseStudies: caseStudies.snippets,
      faqQuestions: faqData.snippets,
    },
    
    // Metadata
    url: url,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Detect expert quotes with snippets
 * Pattern: "Quote" - Name, Title/Organization
 */
function detectExpertQuotes($, bodyText) {
  const snippets = [];
  
  // Pattern 1: Blockquotes
  $('blockquote').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length >= 20 && text.length <= 500) {
      snippets.push({
        text: text.substring(0, 200),
        type: 'blockquote'
      });
    }
  });
  
  // Pattern 2: Inline quotes with attribution
  // "Quote text" - Name, Title
  // "Quote text" said Name Title
  const quotePattern = /"([^"]{20,300})"\s*[-—–]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([^<>\n]{0,100})/g;
  let match;
  while ((match = quotePattern.exec(bodyText)) !== null) {
    snippets.push({
      text: `"${match[1]}" - ${match[2]}, ${match[3]}`.substring(0, 200),
      type: 'inline-quote'
    });
  }
  
  // Pattern 3: Quote elements with class
  $('.quote, .expert-quote, .testimonial, [class*="quote"]').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length >= 20 && text.length <= 500) {
      snippets.push({
        text: text.substring(0, 200),
        type: 'styled-quote'
      });
    }
  });
  
  return {
    count: snippets.length,
    snippets: snippets.slice(0, 20) // Max 20 for validation
  };
}

/**
 * Detect statistics with citations
 * Pattern: Numbers with %, citations, sources
 */
function detectStatistics(bodyText) {
  const snippets = [];
  const seen = new Set();
  
  // Pattern 1: Percentages with context
  const percentPattern = /([^<>.\n]{0,100}(\d+(?:\.\d+)?%)[^<>.\n]{0,100})/g;
  let match;
  while ((match = percentPattern.exec(bodyText)) !== null) {
    const snippet = match[1].trim();
    const key = snippet.substring(0, 50);
    if (!seen.has(key) && snippet.length >= 20) {
      seen.add(key);
      snippets.push({
        text: snippet.substring(0, 200),
        type: 'percentage'
      });
    }
  }
  
  // Pattern 2: Large numbers with context (1,000+)
  const largeNumPattern = /([^<>.\n]{0,100}(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:million|billion|thousand))[^<>.\n]{0,100})/gi;
  while ((match = largeNumPattern.exec(bodyText)) !== null) {
    const snippet = match[1].trim();
    const key = snippet.substring(0, 50);
    if (!seen.has(key) && snippet.length >= 20) {
      seen.add(key);
      snippets.push({
        text: snippet.substring(0, 200),
        type: 'large-number'
      });
    }
  }
  
  // Pattern 3: Statistics with explicit citations
  const citationPattern = /([^<>.\n]{0,150}(?:according to|source:|study|research|survey)[^<>.\n]{0,150})/gi;
  while ((match = citationPattern.exec(bodyText)) !== null) {
    const snippet = match[1].trim();
    const key = snippet.substring(0, 50);
    if (!seen.has(key) && snippet.length >= 30) {
      seen.add(key);
      snippets.push({
        text: snippet.substring(0, 200),
        type: 'cited-stat'
      });
    }
  }
  
  return {
    count: snippets.length,
    snippets: snippets.slice(0, 25) // Max 25 for validation
  };
}

/**
 * Detect source citations
 */
function detectSources(bodyText) {
  const snippets = [];
  const seen = new Set();
  
  // Pattern: (Author/Source, Year) or [Source: X]
  const patterns = [
    /\(([^)]{5,80}),\s*(\d{4})\)/g,
    /\[Source:\s*([^\]]{5,100})\]/gi,
    /according to\s+([A-Z][^<>,.\n]{5,80})(?:,|\.|study|research)/gi,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const snippet = match[0].trim();
      const key = snippet.substring(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        snippets.push({
          text: snippet.substring(0, 150),
          type: 'citation'
        });
      }
    }
  });
  
  return {
    count: snippets.length,
    snippets: snippets.slice(0, 15)
  };
}

/**
 * Detect case studies
 * Pattern: "case study" + company name + results/metrics
 */
function detectCaseStudies($, bodyText) {
  const snippets = [];
  
  // Look for case study indicators
  const indicators = [
    /case study[:\s]+([^<>.\n]{50,400})/gi,
    /(?:client|customer)\s+(?:story|success|example)[:\s]+([^<>.\n]{50,400})/gi,
    /(?:increased|improved|achieved|boosted)[^<>.\n]{20,200}(?:\d+%|\d+x)/gi,
  ];
  
  indicators.forEach(pattern => {
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const snippet = match[0].trim();
      if (snippet.length >= 50) {
        snippets.push({
          text: snippet.substring(0, 300),
          type: 'case-study'
        });
      }
    }
  });
  
  return {
    count: Math.min(snippets.length, 10),
    snippets: snippets.slice(0, 10)
  };
}

/**
 * Detect FAQ section
 */
function detectFAQ($) {
  const snippets = [];
  let totalWords = 0;
  
  // Method 1: FAQ section with schema or explicit heading
  const faqSection = $('[itemtype*="FAQPage"], #faq, .faq, [class*="faq"]').first();
  
  if (faqSection.length > 0) {
    // Extract Q&A pairs
    faqSection.find('h3, h4, .question, [class*="question"]').each((i, el) => {
      const question = $(el).text().trim();
      const answer = $(el).next().text().trim();
      const answerWords = answer.split(/\s+/).length;
      
      if (question.length > 10 && answerWords >= 20) {
        totalWords += answerWords;
        snippets.push({
          question: question.substring(0, 150),
          answer: answer.substring(0, 200),
          answerWords: answerWords
        });
      }
    });
  } else {
    // Method 2: Find H3/H4 with question marks
    $('h3, h4').each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes('?') || /^(what|how|why|when|where|who|can|is|do|does)/i.test(text)) {
        const answer = $(el).next('p, div').text().trim();
        const answerWords = answer.split(/\s+/).length;
        
        if (answerWords >= 20) {
          totalWords += answerWords;
          snippets.push({
            question: text.substring(0, 150),
            answer: answer.substring(0, 200),
            answerWords: answerWords
          });
        }
      }
    });
  }
  
  const avgWords = snippets.length > 0 ? Math.round(totalWords / snippets.length) : 0;
  
  return {
    count: snippets.length,
    avgWords: avgWords,
    snippets: snippets.slice(0, 15)
  };
}

/**
 * Detect internal links
 */
function detectInternalLinks($, url) {
  const hostname = new URL(url).hostname.replace('www.', '');
  let internal = 0;
  let external = 0;
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    
    if (href.startsWith('/') || href.startsWith('#')) {
      internal++;
    } else if (href.startsWith('http')) {
      try {
        const linkHostname = new URL(href).hostname.replace('www.', '');
        if (linkHostname === hostname) {
          internal++;
        } else {
          external++;
        }
      } catch (e) {
        // Invalid URL
      }
    } else {
      internal++; // Relative link
    }
  });
  
  return { count: internal, external: external };
}

/**
 * Detect images
 */
function detectImages($) {
  const total = $('img').length;
  let withAlt = 0;
  
  $('img').each((i, el) => {
    const alt = $(el).attr('alt');
    if (alt && alt.trim().length > 0) withAlt++;
  });
  
  return { total, withAlt };
}

/**
 * Extract meta data
 */
function extractMetaData($) {
  const title = $('title').text() || '';
  const description = $('meta[name="description"]').attr('content') || '';
  
  return {
    title: title,
    titleLength: title.length,
    description: description,
    descLength: description.length,
  };
}

/**
 * Extract schema data
 */
function extractSchemaData(html) {
  const hasSchema = html.includes('application/ld+json');
  const types = [];
  
  if (hasSchema) {
    const typePattern = /"@type"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = typePattern.exec(html)) !== null) {
      if (!types.includes(match[1])) {
        types.push(match[1]);
      }
    }
  }
  
  return { hasSchema, types };
}

/**
 * Count headings
 */
function countHeadings($) {
  return {
    h1: $('h1').length,
    h2: $('h2').length,
    h3: $('h3').length,
  };
}

/**
 * Count words
 */
function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Analyze paragraphs
 */
function analyzeParagraphs($) {
  const paragraphs = $('p');
  const count = paragraphs.length;
  
  if (count === 0) return { count: 0, avgLength: 0 };
  
  let totalWords = 0;
  paragraphs.each((i, p) => {
    const text = $(p).text().trim();
    totalWords += text.split(/\s+/).length;
  });
  
  return {
    count: count,
    avgLength: Math.round(totalWords / count),
  };
}

/**
 * Count lists
 */
function countLists($) {
  return $('ul, ol').length;
}

/**
 * Count tables
 */
function countTables($) {
  const allTables = $('table');
  let comparison = 0;
  
  allTables.each((i, table) => {
    const headers = $(table).find('th').length;
    const rows = $(table).find('tr').length;
    
    if (headers >= 2 && rows >= 2) {
      comparison++;
    }
  });
  
  return {
    total: allTables.length,
    comparison: comparison,
  };
}

// Export
module.exports = {
  parseContent,
};
