// In content-parser-HYBRID.js, update the parseContent function:
function parseContent(html, url) {
  console.log(`📝 Parser: Analyzing content from ${url}`);
  
  // Check if html is valid
  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    console.warn('⚠️ Parser: Empty or invalid HTML received');
    return {
      success: false,
      counts: {
        wordCount: 0,
        headings: 0,
        paragraphs: 0,
        images: 0,
        links: 0,
        totalElements: 0,
        // ADD THESE DEFAULT COUNTS:
        expertQuotes: 0,
        statistics: 0,
        sources: 0,
        caseStudies: 0,
        faqCount: 0
      },
      snippets: { // ADD THIS EMPTY SNIPPETS OBJECT
        expertQuotes: [],
        statistics: [],
        caseStudies: [],
        faqQuestions: []
      },
      metadata: {
        url: url,
        error: 'Empty or invalid HTML',
        parsedAt: new Date().toISOString()
      }
    };
  }
  
  try {
    // Load HTML with cheerio
    const $ = cheerio.load(html);
    
    // Get all text content
    const text = $('body').text() || '';
    
    // Calculate word count (basic)
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // ==========================================
    // EXTRACT EXPERT QUOTES (ADD THIS SECTION)
    // ==========================================
    const expertQuotes = [];
    const quotePatterns = [
      // Pattern 1: Text in quotes followed by name
      /["'`]([^"'`]+)["'`]\s*[—-]\s*([A-Z][a-z]+ [A-Z][a-z]+(?:, [^,]+)?)/g,
      // Pattern 2: Text with — Name format
      /([^—]+)—\s*([A-Z][a-z]+ [A-Z][a-z]+)/g,
      // Pattern 3: Quote text with strong/bold author
      /<strong>([^<]+)<\/strong>\s*[—-]\s*([^<]+)/gi
    ];
    
    // Check all text nodes for quote patterns
    $('p, div, blockquote, li').each((i, elem) => {
      const elemText = $(elem).text().trim();
      
      for (const pattern of quotePatterns) {
        const matches = [...elemText.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1] && match[2]) {
            expertQuotes.push({
              text: match[1].trim(),
              author: match[2].trim(),
              index: expertQuotes.length
            });
          }
        });
      }
    });
    
    // ==========================================
    // EXTRACT STATISTICS (ADD THIS SECTION)
    // ==========================================
    const statistics = [];
    const statPatterns = [
      /\d+(?:\.\d+)?%/g, // Percentages
      /\d+(?:,\d+)*(?:\.\d+)?\s*(?:%|points|times|hours|days|weeks|months|years)/gi,
      /(?:increased?|decreased?|improved?|grew|rose|fell|dropped)\s+by\s+\d+/gi
    ];
    
    $('p, li, td').each((i, elem) => {
      const elemText = $(elem).text().trim();
      if (elemText.length < 200) { // Short text likely contains stats
        for (const pattern of statPatterns) {
          if (pattern.test(elemText)) {
            statistics.push({
              text: elemText,
              index: statistics.length
            });
            break;
          }
        }
      }
    });
    
    // ==========================================
    // EXTRACT FAQ QUESTIONS (ADD THIS SECTION)
    // ==========================================
    const faqQuestions = [];
    $('h3, h4, dt, strong').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('?') || text.toLowerCase().startsWith('what') || 
          text.toLowerCase().startsWith('how') || text.toLowerCase().startsWith('why')) {
        // Find the answer (next sibling paragraph)
        const answer = $(elem).next('p').text() || 
                       $(elem).next('div').text() || 
                       '';
        
        if (answer.length > 10) {
          faqQuestions.push({
            question: text,
            answer: answer.substring(0, 200), // First 200 chars
            answerWords: answer.split(/\s+/).length,
            index: faqQuestions.length
          });
        }
      }
    });
    
    // Count various elements
    const counts = {
      wordCount: wordCount,
      headings: {
        h1: $('h1').length,
        h2: $('h2').length,
        h3: $('h3').length,
        h4: $('h4').length,
        h5: $('h5').length,
        h6: $('h6').length,
        total: $('h1, h2, h3, h4, h5, h6').length
      },
      paragraphs: $('p').length,
      images: $('img').length,
      links: $('a[href]').length,
      lists: $('ul, ol').length,
      videos: $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
      tables: $('table').length,
      forms: $('form').length,
      buttons: $('button').length,
      metaTags: $('meta').length,
      scripts: $('script').length,
      stylesheets: $('link[rel="stylesheet"]').length,
      divs: $('div').length,
      sections: $('section, article, main, header, footer, nav, aside').length,
      // ADD THESE CRITICAL COUNTS:
      expertQuotes: expertQuotes.length,
      statistics: statistics.length,
      sources: expertQuotes.length + statistics.length, // Approximation
      caseStudies: $('p:contains("case study"), div:contains("case study")').length,
      faqCount: faqQuestions.length,
      totalElements: 0 // Will be calculated
    };
    
    // Calculate total elements
    counts.totalElements = 
      counts.headings.total +
      counts.paragraphs +
      counts.images +
      counts.links +
      counts.lists +
      counts.videos +
      counts.tables +
      counts.forms +
      counts.buttons +
      counts.divs +
      counts.sections;
    
    // Extract metadata
    const metadata = {
      url: url,
      title: $('title').text() || '',
      description: $('meta[name="description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content') || '',
      ogTitle: $('meta[property="og:title"]').attr('content') || '',
      ogDescription: $('meta[property="og:description"]').attr('content') || '',
      ogImage: $('meta[property="og:image"]').attr('content') || '',
      canonical: $('link[rel="canonical"]').attr('href') || '',
      robots: $('meta[name="robots"]').attr('content') || '',
      viewport: $('meta[name="viewport"]').attr('content') || '',
      charset: $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || '',
      language: $('html').attr('lang') || '',
      doctype: html.match(/<!DOCTYPE[^>]*>/i)?.[0] || '',
      parsedAt: new Date().toISOString()
    };
    
    console.log(`✅ Parser: Analyzed ${wordCount} words, ${counts.totalElements} elements`);
    console.log(`✅ Parser: Found ${expertQuotes.length} quotes, ${statistics.length} stats, ${faqQuestions.length} FAQs`);
    
    return {
      success: true,
      counts: counts,
      snippets: { // ADD THIS CRITICAL OBJECT
        expertQuotes: expertQuotes,
        statistics: statistics,
        caseStudies: [], // You can add case study extraction logic here
        faqQuestions: faqQuestions
      },
      metadata: metadata,
      raw: {
        text: text.substring(0, 1000), // First 1000 chars
        elementCount: counts.totalElements
      }
    };
    
  } catch (error) {
    console.error('❌ Parser Error:', error.message);
    
    return {
      success: false,
      error: error.message,
      counts: {
        wordCount: 0,
        headings: { total: 0, h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
        paragraphs: 0,
        images: 0,
        links: 0,
        expertQuotes: 0, // ADD DEFAULT
        statistics: 0,    // ADD DEFAULT
        sources: 0,       // ADD DEFAULT
        caseStudies: 0,   // ADD DEFAULT
        faqCount: 0,      // ADD DEFAULT
        totalElements: 0
      },
      snippets: { // ADD EMPTY SNIPPETS
        expertQuotes: [],
        statistics: [],
        caseStudies: [],
        faqQuestions: []
      },
      metadata: {
        url: url,
        error: error.message,
        parsedAt: new Date().toISOString()
      }
    };
  }
}
