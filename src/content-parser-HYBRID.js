const cheerio = require('cheerio');

/**
 * Parse HTML content and extract structured data
 * @param {string} html - HTML content to parse
 * @param {string} url - Source URL for reference
 * @returns {Object} - Parsed content analysis
 */
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
        totalElements: 0
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
    
    // Check for SEO issues
    const issues = {
      noTitle: !metadata.title,
      noDescription: !metadata.description,
      noH1: counts.headings.h1 === 0,
      multipleH1: counts.headings.h1 > 1,
      noCanonical: !metadata.canonical,
      noViewport: !metadata.viewport,
      noLang: !metadata.language,
      imagesWithoutAlt: $('img:not([alt])').length,
      linksWithoutHref: $('a:not([href])').length,
      wordCountLow: wordCount < 300
    };
    
    // Structure analysis
    const structure = {
      hasHeader: $('header').length > 0,
      hasFooter: $('footer').length > 0,
      hasNav: $('nav').length > 0,
      hasMain: $('main').length > 0,
      hasArticle: $('article').length > 0,
      hasSection: $('section').length > 0,
      hasAside: $('aside').length > 0
    };
    
    console.log(`✅ Parser: Analyzed ${wordCount} words, ${counts.totalElements} elements`);
    
    return {
      success: true,
      counts: counts,
      metadata: metadata,
      issues: issues,
      structure: structure,
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
        totalElements: 0
      },
      metadata: {
        url: url,
        error: error.message,
        parsedAt: new Date().toISOString()
      }
    };
  }
}

// Export the function
module.exports = { parseContent };
