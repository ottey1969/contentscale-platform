/**
 * PARSER.JS - Deterministic Content Element Counter
 * 
 * Purpose: Count content elements WITHOUT AI (100% consistent)
 * Uses: Cheerio (HTML parser) + Regex patterns
 * Returns: Raw counts (no scoring yet)
 */

const cheerio = require('cheerio');

class ContentParser {
  constructor(html, url) {
    this.$ = cheerio.load(html);
    this.html = html;
    this.url = url;
    this.text = this.$('body').text();
  }

  // ============================================
  // GRAAF FRAMEWORK PARSING (50 points)
  // ============================================

  parseGRAAF() {
    return {
      genuinelyCredible: this.parseCredibility(),
      relevance: this.parseRelevance(),
      actionability: this.parseActionability(),
      accuracy: this.parseAccuracy(),
      freshness: this.parseFreshness()
    };
  }

  parseCredibility() {
    const expertQuotes = this.countExpertQuotes();
    const authorBios = this.countAuthorBios();
    const caseStudies = this.countCaseStudies();
    const testimonials = this.countTestimonials();
    const certifications = this.countCertifications();
    
    return {
      expertQuotes,
      authorBios,
      caseStudies,
      testimonials,
      certifications,
      total: expertQuotes + authorBios + caseStudies + testimonials + certifications
    };
  }

  countExpertQuotes() {
    const patterns = [
      /according to [A-Z][a-z]+ [A-Z][a-z]+/gi,
      /says [A-Z][a-z]+ [A-Z][a-z]+, (?:CEO|Director|Professor|Expert|Researcher)/gi,
      /"[^"]{20,}"\s*[-–—]\s*[A-Z][a-z]+ [A-Z][a-z]+/g
    ];
    
    let count = 0;
    patterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 20);
  }

  countAuthorBios() {
    const bioSelectors = [
      '[class*="author"]',
      '[class*="bio"]',
      '[id*="author"]',
      '.about-author'
    ];
    
    let count = 0;
    bioSelectors.forEach(selector => {
      const elements = this.$(selector);
      elements.each((i, el) => {
        const text = this.$(el).text();
        if (text.split(/\s+/).length >= 50) count++;
      });
    });
    
    return Math.min(count, 5);
  }

  countCaseStudies() {
    const resultPatterns = [
      /(?:increased|grew|improved|boosted|gained)\s+(?:by\s+)?(\d+)%/gi,
      /(?:from|reduced)\s+\$?\d+[KMB]?\s+to\s+\$?\d+[KMB]?/gi,
      /(?:achieved|reached|generated)\s+\$?\d+[KMB]?/gi
    ];
    
    let count = 0;
    resultPatterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(Math.floor(count / 3), 10);
  }

  countTestimonials() {
    const testimonialSelectors = [
      '[class*="testimonial"]',
      '[class*="review"]',
      '.quote',
      'blockquote'
    ];
    
    let count = 0;
    testimonialSelectors.forEach(selector => {
      count += this.$(selector).length;
    });
    
    return Math.min(count, 10);
  }

  countCertifications() {
    const certKeywords = [
      'certified', 'certification', 'accredited', 'licensed',
      'ISO', 'award', 'recognized by', 'member of'
    ];
    
    let count = 0;
    certKeywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = this.text.match(regex);
      if (matches) count += matches.length;
    });
    
    return Math.min(Math.floor(count / 2), 5);
  }

  parseRelevance() {
    const titleKeywords = this.countTitleKeywords();
    const h2Keywords = this.countH2Keywords();
    const keywordDensity = this.calculateKeywordDensity();
    
    return {
      titleKeywords,
      h2Keywords,
      keywordDensity
    };
  }

  countTitleKeywords() {
    const title = this.$('title').text().toLowerCase();
    const h1 = this.$('h1').first().text().toLowerCase();
    
    const keywords = [...new Set([
      ...title.match(/\b\w{5,}\b/g) || [],
      ...h1.match(/\b\w{5,}\b/g) || []
    ])];
    
    let relevanceScore = 0;
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = this.text.match(regex);
      if (matches && matches.length >= 3) relevanceScore++;
    });
    
    return Math.min(relevanceScore, 10);
  }

  countH2Keywords() {
    const h2s = this.$('h2').map((i, el) => this.$(el).text()).get();
    return Math.min(h2s.length, 8);
  }

  calculateKeywordDensity() {
    const words = this.text.split(/\s+/).length;
    const uniqueWords = new Set(this.text.toLowerCase().match(/\b\w{5,}\b/g) || []);
    
    const density = (uniqueWords.size / words) * 100;
    
    if (density >= 1 && density <= 2) return 10;
    if (density >= 0.5 && density < 1) return 7;
    if (density > 2 && density <= 3) return 7;
    return 4;
  }

  parseActionability() {
    const ctaButtons = this.countCTAButtons();
    const nextSteps = this.countNextSteps();
    const howToSections = this.countHowToSections();
    
    return {
      ctaButtons,
      nextSteps,
      howToSections
    };
  }

  countCTAButtons() {
    const ctaSelectors = [
      'button',
      '[class*="cta"]',
      '[class*="button"]',
      'a[class*="btn"]'
    ];
    
    let count = 0;
    ctaSelectors.forEach(selector => {
      count += this.$(selector).length;
    });
    
    return Math.min(count, 10);
  }

  countNextSteps() {
    const nextStepPatterns = [
      /next steps?:/gi,
      /what to do next/gi,
      /here's how:/gi,
      /follow these steps/gi
    ];
    
    let count = 0;
    nextStepPatterns.forEach(pattern => {
      if (pattern.test(this.text)) count++;
    });
    
    const numberedLists = this.$('ol').length;
    count += Math.min(numberedLists, 3);
    
    return Math.min(count, 5);
  }

  countHowToSections() {
    const howToPatterns = [
      /how to \w+/gi,
      /step \d+:/gi,
      /\d+\.\s+[A-Z]/g
    ];
    
    let count = 0;
    howToPatterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(Math.floor(count / 5), 5);
  }

  parseAccuracy() {
    const statistics = this.countStatistics();
    const citations = this.countCitations();
    const dates = this.countDates();
    
    return {
      statistics,
      citations,
      dates
    };
  }

  countStatistics() {
    const statPatterns = [
      /\d+%/g,
      /\$\d+[KMB]?/g,
      /\d+(?:,\d{3})+/g
    ];
    
    let count = 0;
    statPatterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(Math.floor(count / 5), 10);
  }

  countCitations() {
    const citationPatterns = [
      /\[source\]/gi,
      /\(source:/gi,
      /according to [A-Z]/g,
      /study (?:by|from|published)/gi
    ];
    
    let count = 0;
    citationPatterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 10);
  }

  countDates() {
    const datePatterns = [
      /20\d{2}/g,
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/gi
    ];
    
    let count = 0;
    datePatterns.forEach(pattern => {
      const matches = this.text.match(pattern);
      if (matches) count += matches.length;
    });
    
    return Math.min(Math.floor(count / 3), 5);
  }

  parseFreshness() {
    const recentDates = this.countRecentDates();
    const updatedIndicators = this.countUpdateIndicators();
    
    return {
      recentDates,
      updatedIndicators
    };
  }

  countRecentDates() {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    const yearRegex = new RegExp(`(?:${currentYear}|${lastYear})`, 'g');
    const matches = this.text.match(yearRegex);
    
    return matches ? Math.min(matches.length, 10) : 0;
  }

  countUpdateIndicators() {
    const updatePatterns = [
      /updated:\s*20\d{2}/gi,
      /last updated/gi,
      /as of 20\d{2}/gi
    ];
    
    let count = 0;
    updatePatterns.forEach(pattern => {
      if (pattern.test(this.text)) count++;
    });
    
    return Math.min(count, 5);
  }

  // ============================================
  // CRAFT METHODOLOGY PARSING (30 points)
  // ============================================

  parseCRAFT() {
    return {
      clarity: this.parseClarity(),
      readability: this.parseReadability(),
      audienceFit: this.parseAudienceFit(),
      flow: this.parseFlow(),
      tone: this.parseTone()
    };
  }

  parseClarity() {
    const avgSentenceLength = this.calculateAvgSentenceLength();
    const shortParagraphs = this.countShortParagraphs();
    
    return {
      avgSentenceLength,
      shortParagraphs
    };
  }

  calculateAvgSentenceLength() {
    const sentences = this.text.match(/[^.!?]+[.!?]/g) || [];
    if (sentences.length === 0) return 0;
    
    const totalWords = sentences.reduce((sum, sentence) => {
      return sum + sentence.split(/\s+/).length;
    }, 0);
    
    return Math.round(totalWords / sentences.length);
  }

  countShortParagraphs() {
    const paragraphs = this.$('p').map((i, el) => this.$(el).text()).get();
    const shortParas = paragraphs.filter(p => {
      const words = p.split(/\s+/).length;
      return words >= 20 && words <= 100;
    });
    
    return Math.min(shortParas.length, 10);
  }

  parseReadability() {
    const wordCount = this.countWords();
    const listCount = this.countLists();
    
    return {
      wordCount,
      listCount
    };
  }

  countWords() {
    return this.text.split(/\s+/).length;
  }

  countLists() {
    return this.$('ul, ol').length;
  }

  parseAudienceFit() {
    const technicalTerms = this.countTechnicalTerms();
    const jargonCount = this.countJargon();
    
    return {
      technicalTerms,
      jargonCount
    };
  }

  countTechnicalTerms() {
    const techTerms = [
      'API', 'SEO', 'CRM', 'ROI', 'KPI', 'SQL', 'CSS', 'HTML',
      'algorithm', 'framework', 'methodology', 'optimization'
    ];
    
    let count = 0;
    techTerms.forEach(term => {
      const regex = new RegExp(term, 'gi');
      const matches = this.text.match(regex);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 20);
  }

  countJargon() {
    const jargonWords = this.text.match(/\b\w{12,}\b/g) || [];
    return Math.min(jargonWords.length, 30);
  }

  parseFlow() {
    const transitionWords = this.countTransitionWords();
    const internalLinks = this.countInternalLinks();
    
    return {
      transitionWords,
      internalLinks
    };
  }

  countTransitionWords() {
    const transitions = [
      'however', 'therefore', 'moreover', 'furthermore', 'additionally',
      'consequently', 'meanwhile', 'nevertheless', 'nonetheless'
    ];
    
    let count = 0;
    transitions.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = this.text.match(regex);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 10);
  }

  countInternalLinks() {
    const links = this.$('a[href^="/"], a[href^="' + this.url + '"]');
    return Math.min(links.length, 15);
  }

  parseTone() {
    const positiveWords = this.countPositiveWords();
    const professionalWords = this.countProfessionalWords();
    
    return {
      positiveWords,
      professionalWords
    };
  }

  countPositiveWords() {
    const positive = [
      'great', 'excellent', 'best', 'amazing', 'successful',
      'improve', 'increase', 'boost', 'enhance', 'optimize'
    ];
    
    let count = 0;
    positive.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = this.text.match(regex);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 20);
  }

  countProfessionalWords() {
    const professional = [
      'business', 'professional', 'strategy', 'solution', 'service',
      'expert', 'industry', 'company', 'client', 'customer'
    ];
    
    let count = 0;
    professional.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = this.text.match(regex);
      if (matches) count += matches.length;
    });
    
    return Math.min(count, 30);
  }

  // ============================================
  // TECHNICAL SEO PARSING (20 points)
  // ============================================

  parseTechnical() {
    return {
      metaTags: this.parseMetaTags(),
      headings: this.parseHeadings(),
      schema: this.parseSchema(),
      images: this.parseImages()
    };
  }

  parseMetaTags() {
    const title = this.$('title').text();
    const description = this.$('meta[name="description"]').attr('content') || '';
    const ogTitle = this.$('meta[property="og:title"]').attr('content') || '';
    const ogDescription = this.$('meta[property="og:description"]').attr('content') || '';
    
    return {
      hasTitle: title.length > 0,
      titleLength: title.length,
      hasDescription: description.length > 0,
      descriptionLength: description.length,
      hasOgTitle: ogTitle.length > 0,
      hasOgDescription: ogDescription.length > 0
    };
  }

  parseHeadings() {
    const h1Count = this.$('h1').length;
    const h2Count = this.$('h2').length;
    const h3Count = this.$('h3').length;
    
    return {
      h1Count,
      h2Count,
      h3Count,
      hasProperStructure: h1Count === 1 && h2Count >= 2
    };
  }

  parseSchema() {
    const schemaScripts = this.$('script[type="application/ld+json"]');
    const hasSchema = schemaScripts.length > 0;
    
    let schemaTypes = [];
    schemaScripts.each((i, el) => {
      try {
        const schema = JSON.parse(this.$(el).html());
        if (schema['@type']) schemaTypes.push(schema['@type']);
      } catch (e) {}
    });
    
    return {
      hasSchema,
      schemaCount: schemaScripts.length,
      schemaTypes
    };
  }

  parseImages() {
    const images = this.$('img');
    let withAlt = 0;
    
    images.each((i, el) => {
      if (this.$(el).attr('alt')) withAlt++;
    });
    
    return {
      totalImages: images.length,
      imagesWithAlt: withAlt,
      altPercentage: images.length > 0 ? Math.round((withAlt / images.length) * 100) : 0
    };
  }

  // ============================================
  // MAIN PARSE FUNCTION
  // ============================================

  parse() {
    return {
      graaf: this.parseGRAAF(),
      craft: this.parseCRAFT(),
      technical: this.parseTechnical()
    };
  }
}

module.exports = ContentParser;
