/**
 * SCANNER.JS - HYBRID SYSTEM (v2.0)
 * 
 * OLD: Puppeteer → Claude (everything) → Done
 * NEW: Puppeteer → Parser → Validator → Calculator → Recommendations
 * 
 * Result: 100% CONSISTENT SCORES!
 */

const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');

// ⭐ NEW: Import hybrid modules
const ContentParser = require('./parser');
const ContentValidator = require('./validator');
const ScoreCalculator = require('./calculateScore');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ContentScanner {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    console.log('[SCANNER] Launching browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    console.log('[SCANNER] ✅ Browser ready');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('[SCANNER] Browser closed');
    }
  }

  async scan(url) {
    console.log(`[SCAN] Starting scan for: ${url}`);
    const startTime = Date.now();

    try {
      // ============================================
      // STEP 1: FETCH HTML (10 sec)
      // ============================================
      console.log('[SCAN] Step 1/4: Fetching HTML...');
      const html = await this.fetchHTML(url);
      console.log('[SCAN] ✅ HTML fetched');

      // ============================================
      // STEP 2: PARSE ELEMENTS (1 sec) ⭐ NEW!
      // ============================================
      console.log('[SCAN] Step 2/4: Parsing content elements...');
      const parser = new ContentParser(html, url);
      const parsedData = parser.parse();
      console.log('[SCAN] ✅ Parsed:', {
        expertQuotes: parsedData.graaf.genuinelyCredible.expertQuotes,
        caseStudies: parsedData.graaf.genuinelyCredible.caseStudies,
        wordCount: parsedData.craft.readability.wordCount
      });

      // ============================================
      // STEP 3: VALIDATE QUALITY (10 sec) ⭐ NEW!
      // ============================================
      console.log('[SCAN] Step 3/4: Validating quality with AI...');
      const validator = new ContentValidator(html, parsedData);
      const validation = await validator.validate();
      console.log('[SCAN] ✅ Quality validated');

      // ============================================
      // STEP 4: CALCULATE SCORE (0.1 sec) ⭐ NEW!
      // ============================================
      console.log('[SCAN] Step 4/4: Calculating scores...');
      const calculator = new ScoreCalculator(parsedData, validation);
      const scoreResult = calculator.calculate();
      console.log('[SCAN] ✅ Score calculated:', scoreResult.score);

      // ============================================
      // STEP 5: GENERATE RECOMMENDATIONS (10 sec)
      // ============================================
      console.log('[SCAN] Generating recommendations...');
      const recommendations = await this.generateRecommendations(
        scoreResult,
        parsedData,
        validation
      );
      console.log('[SCAN] ✅ Recommendations generated');

      // ============================================
      // FINAL RESULT
      // ============================================
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[SCAN] ✅ Complete in ${duration}s - Score: ${scoreResult.score}/100`);

      return {
        success: true,
        url: url,
        score: scoreResult.score,
        quality: scoreResult.quality,
        breakdown: scoreResult.breakdown,
        recommendations: recommendations,
        wordCount: parsedData.craft.readability.wordCount,
        scanDuration: duration
      };

    } catch (error) {
      console.error('[SCAN] ❌ Error:', error.message);
      throw error;
    }
  }

  async fetchHTML(url) {
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 10000 });

      const html = await page.content();
      
      await page.close();
      
      return html;

    } catch (error) {
      await page.close();
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  // ============================================
  // RECOMMENDATIONS (Still uses Claude)
  // ============================================
  async generateRecommendations(scoreResult, parsedData, validation) {
    try {
      const prompt = this.buildRecommendationsPrompt(scoreResult, parsedData, validation);
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const recommendations = this.parseRecommendations(response.content[0].text);
      return recommendations;

    } catch (error) {
      console.error('[RECOMMENDATIONS] Error:', error.message);
      return this.getFallbackRecommendations(scoreResult);
    }
  }

  buildRecommendationsPrompt(scoreResult, parsedData, validation) {
    return `You are an SEO content optimization expert. Generate actionable recommendations based on this scan.

**CURRENT SCORE: ${scoreResult.score}/100 (${scoreResult.quality})**

**BREAKDOWN:**
- GRAAF: ${scoreResult.breakdown.graaf.total}/50
  - Genuinely Credible: ${scoreResult.breakdown.graaf.genuinelyCredible}/10
  - Relevance: ${scoreResult.breakdown.graaf.relevance}/10
  - Actionability: ${scoreResult.breakdown.graaf.actionability}/10
  - Accuracy: ${scoreResult.breakdown.graaf.accuracy}/10
  - Freshness: ${scoreResult.breakdown.graaf.freshness}/10

- CRAFT: ${scoreResult.breakdown.craft.total}/30
  - Clarity: ${scoreResult.breakdown.craft.clarity}/6
  - Readability: ${scoreResult.breakdown.craft.readability}/6
  - Audience Fit: ${scoreResult.breakdown.craft.audienceFit}/6
  - Flow: ${scoreResult.breakdown.craft.flow}/6
  - Tone: ${scoreResult.breakdown.craft.tone}/6

- Technical: ${scoreResult.breakdown.technical.total}/20

**PARSED DATA HIGHLIGHTS:**
- Expert Quotes: ${parsedData.graaf.genuinelyCredible.expertQuotes}
- Case Studies: ${parsedData.graaf.genuinelyCredible.caseStudies}
- Word Count: ${parsedData.craft.readability.wordCount}
- H1s: ${parsedData.technical.headings.h1Count}
- H2s: ${parsedData.technical.headings.h2Count}

**QUALITY VALIDATION:**
- Credibility Quality: ${validation.graaf.genuinelyCredible}
- Freshness Quality: ${validation.graaf.freshness}

Generate recommendations in 3 categories:

1. **Quick Wins** (5-15 min fixes, high impact)
2. **Major Impact** (30-60 min fixes, medium impact)
3. **Advanced** (2+ hours, long-term improvements)

For each recommendation:
- category: Which GRAAF/CRAFT element
- issue: What's wrong
- action: What to do (specific, actionable)
- timeEstimate: Minutes to fix
- details: Array of 2-3 specific steps

Also provide a summary:
- totalIssues: Total recommendations count
- estimatedTimeToFix: Total minutes
- potentialScoreGain: Estimated points improvement
- currentScore: ${scoreResult.score}
- targetScore: Realistic target after fixes

**RESPOND ONLY IN THIS JSON FORMAT (no markdown):**
{
  "quickWins": [
    {
      "category": "GRAAF - Credibility",
      "issue": "Missing author bio with credentials",
      "action": "Add detailed author bio section",
      "timeEstimate": 10,
      "details": ["Write 100-word bio", "Add profile photo", "Include credentials"]
    }
  ],
  "majorImpact": [...],
  "advanced": [...],
  "summary": {
    "totalIssues": 12,
    "estimatedTimeToFix": 180,
    "potentialScoreGain": 15,
    "currentScore": ${scoreResult.score},
    "targetScore": ${Math.min(scoreResult.score + 15, 98)}
  }
}`;
  }

  parseRecommendations(text) {
    try {
      let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const recommendations = JSON.parse(cleanText);
      
      // Ensure structure
      if (!recommendations.quickWins) recommendations.quickWins = [];
      if (!recommendations.majorImpact) recommendations.majorImpact = [];
      if (!recommendations.advanced) recommendations.advanced = [];
      if (!recommendations.summary) {
        recommendations.summary = {
          totalIssues: 0,
          estimatedTimeToFix: 0,
          potentialScoreGain: 0,
          currentScore: 0,
          targetScore: 0
        };
      }
      
      return recommendations;

    } catch (error) {
      console.error('[PARSE RECOMMENDATIONS] Error:', error.message);
      return this.getFallbackRecommendations({ score: 70 });
    }
  }

  getFallbackRecommendations(scoreResult) {
    return {
      quickWins: [
        {
          category: "GRAAF - Credibility",
          issue: "Content needs more credibility signals",
          action: "Add expert quotes and author credentials",
          timeEstimate: 15,
          details: [
            "Add 3-5 expert quotes with names and titles",
            "Create detailed author bio section",
            "Include relevant certifications or awards"
          ]
        }
      ],
      majorImpact: [
        {
          category: "CRAFT - Readability",
          issue: "Content structure needs improvement",
          action: "Break content into scannable sections",
          timeEstimate: 45,
          details: [
            "Add more H2 subheadings",
            "Use bullet points for key information",
            "Keep paragraphs under 100 words"
          ]
        }
      ],
      advanced: [
        {
          category: "Technical SEO",
          issue: "Missing structured data",
          action: "Implement schema markup",
          timeEstimate: 120,
          details: [
            "Add Article schema",
            "Include Author schema",
            "Add Organization schema"
          ]
        }
      ],
      summary: {
        totalIssues: 3,
        estimatedTimeToFix: 180,
        potentialScoreGain: 10,
        currentScore: scoreResult.score,
        targetScore: Math.min(scoreResult.score + 10, 95)
      }
    };
  }
}

module.exports = ContentScanner;
