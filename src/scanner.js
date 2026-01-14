const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ==========================================
// 🔧 CONTENTSCORE TOOL HELPER FUNCTIONS
// ==========================================

// Helper: Analyseer text content zonder AI (voor ContentScore Tool)
async function analyzeTextContent(text) {
    try {
        console.log('[CONTENTSCORE] Analyzing text content, length:', text.length);
        
        // Calculate text metrics
        const wordCount = text.split(/\s+/).length;
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;
        
        // Count paragraphs
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        // Check for headings (h1-h6 patterns)
        const headingMatches = text.match(/^(#+|\s*[A-Z][A-Za-z\s]{10,})/gm) || [];
        
        // Check for transition words
        const transitionWords = ['however', 'therefore', 'moreover', 'furthermore', 'consequently', 'nevertheless'];
        const transitionCount = transitionWords.reduce((count, word) => 
            count + (text.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0
        );
        
        // Calculate scores
        const readabilityScore = calculateReadabilityScore(text, avgSentenceLength);
        const structureScore = calculateStructureScore(paragraphs, headingMatches, text.length);
        const engagementScore = calculateEngagementScore(text, transitionCount, wordCount);
        const seoScore = calculateSEOScore(text, wordCount);
        
        // Use Claude API for in-depth analysis if available
        let claudeAnalysis = null;
        try {
            if (process.env.ANTHROPIC_API_KEY && text.length < 8000) {
                const prompt = `Analyze this text content for SEO and quality:

Text: ${text.substring(0, 4000)}

Return JSON with: {
  "overall_quality": "poor|average|good|excellent",
  "key_strengths": ["..."],
  "key_weaknesses": ["..."],
  "primary_keywords": ["..."],
  "tone": "formal|informal|conversational|technical"
}`;

                const message = await anthropic.messages.create({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1000,
                    messages: [{ role: 'user', content: prompt }]
                });
                
                const response = message.content[0].text;
                claudeAnalysis = JSON.parse(response.includes('```json') ? 
                    response.split('```json')[1].split('```')[0].trim() : 
                    response.includes('```') ? 
                    response.split('```')[1].split('```')[0].trim() : 
                    response);
            }
        } catch (claudeError) {
            console.warn('[CONTENTSCORE] Claude analysis failed:', claudeError.message);
        }
        
        // Calculate final scores
        const graafScore = Math.round((readabilityScore * 0.4 + engagementScore * 0.6) * 0.5);
        const craftScore = Math.round((structureScore * 0.5 + seoScore * 0.5) * 0.3);
        const technicalScore = Math.round(seoScore * 0.2);
        
        const totalScore = Math.min(100, Math.max(0, 
            graafScore + craftScore + technicalScore
        ));
        
        // Generate recommendations
        const recommendations = generateTextRecommendations({
            wordCount,
            avgSentenceLength,
            paragraphCount: paragraphs.length,
            headingCount: headingMatches.length,
            readabilityScore,
            structureScore,
            engagementScore,
            seoScore,
            claudeAnalysis
        });
        
        return {
            success: true,
            score: totalScore,
            quality: totalScore >= 90 ? 'excellent' : 
                    totalScore >= 80 ? 'good' : 
                    totalScore >= 70 ? 'fair' : 
                    totalScore >= 60 ? 'average' : 'needs-improvement',
            breakdown: {
                graaf: { total: graafScore },
                craft: { total: craftScore },
                technical: { total: technicalScore },
                details: {
                    readability: readabilityScore,
                    structure: structureScore,
                    engagement: engagementScore,
                    seo: seoScore
                }
            },
            recommendations: recommendations,
            wordCount: wordCount,
            metrics: {
                sentences: sentences.length,
                paragraphs: paragraphs.length,
                headings: headingMatches.length,
                avgSentenceLength: avgSentenceLength.toFixed(1),
                transitionWords: transitionCount
            },
            ai_analysis: claudeAnalysis
        };
        
    } catch (error) {
        console.error('[TEXT ANALYSIS ERROR]', error);
        return {
            success: false,
            error: 'Text analysis failed: ' + error.message
        };
    }
}

// Helper functions for text analysis
function calculateReadabilityScore(text, avgSentenceLength) {
    // Flesch Reading Ease approximation
    const syllables = (text.match(/[aeiouy]{1,2}/gi) || []).length;
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let readability = 206.835 - 1.015 * (words / Math.max(1, sentences.length)) - 84.6 * (syllables / words);
    readability = Math.max(0, Math.min(100, readability));
    
    // Adjust based on sentence length
    if (avgSentenceLength > 25) readability *= 0.8;
    if (avgSentenceLength < 15) readability *= 1.1;
    
    return Math.round(readability);
}

function calculateStructureScore(paragraphs, headings, textLength) {
    let score = 50; // Base score
    
    // Paragraph length scoring
    const avgParagraphLength = textLength / Math.max(1, paragraphs.length);
    if (avgParagraphLength > 300 && avgParagraphLength < 600) score += 20;
    if (avgParagraphLength <= 100 || avgParagraphLength >= 800) score -= 20;
    
    // Heading scoring
    const headingFrequency = headings.length / Math.max(1, paragraphs.length);
    if (headingFrequency >= 0.2 && headingFrequency <= 0.5) score += 20;
    if (headingFrequency < 0.1) score -= 15;
    
    return Math.max(0, Math.min(100, score));
}

function calculateEngagementScore(text, transitionCount, wordCount) {
    let score = 50;
    
    // Transition words per 100 words
    const transitionDensity = (transitionCount / wordCount) * 100;
    if (transitionDensity > 1 && transitionDensity < 5) score += 25;
    if (transitionDensity >= 5) score += 10;
    if (transitionDensity === 0) score -= 20;
    
    // Check for questions (engagement)
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 0) score += 10;
    
    // Check for pronouns (direct address)
    const pronounCount = (text.match(/\b(you|your|we|us|our)\b/gi) || []).length;
    if (pronounCount > wordCount * 0.01) score += 15;
    
    return Math.max(0, Math.min(100, score));
}

function calculateSEOScore(text, wordCount) {
    let score = 50;
    
    // Word count scoring
    if (wordCount >= 1000 && wordCount <= 2500) score += 30;
    if (wordCount < 300) score -= 30;
    if (wordCount > 5000) score -= 10;
    
    // Check for meta elements in text
    const hasIntro = text.toLowerCase().includes('introduction') || 
                     text.substring(0, 200).toLowerCase().includes('in this');
    const hasConclusion = text.toLowerCase().includes('conclusion') || 
                         text.toLowerCase().includes('summary') ||
                         text.toLowerCase().includes('to sum up');
    
    if (hasIntro) score += 10;
    if (hasConclusion) score += 10;
    
    // Check for lists
    const listCount = (text.match(/\d+\.\s|\-\s|\*\s/g) || []).length;
    if (listCount >= 2) score += 10;
    
    return Math.max(0, Math.min(100, score));
}

function generateTextRecommendations(metrics) {
    const recommendations = {
        quickWins: [],
        majorImpact: [],
        advanced: [],
        summary: {
            totalIssues: 0,
            estimatedTimeToFix: 0,
            potentialScoreGain: 0,
            currentScore: 0,
            targetScore: 100
        }
    };
    
    // Quick Wins based on metrics
    if (metrics.wordCount < 800) {
        recommendations.quickWins.push({
            category: "Content Length",
            issue: "Content is too short",
            action: "Expand content to at least 1000 words",
            details: ["Add more examples", "Include case studies", "Add statistics"],
            impact: 4,
            timeEstimate: 60,
            priority: "high"
        });
        recommendations.summary.totalIssues++;
        recommendations.summary.estimatedTimeToFix += 60;
        recommendations.summary.potentialScoreGain += 15;
    }
    
    if (metrics.avgSentenceLength > 25) {
        recommendations.quickWins.push({
            category: "Readability",
            issue: "Sentences are too long",
            action: "Break long sentences into shorter ones",
            details: ["Aim for 15-20 words per sentence", "Use more periods", "Avoid multiple clauses"],
            impact: 3,
            timeEstimate: 30,
            priority: "high"
        });
        recommendations.summary.totalIssues++;
        recommendations.summary.estimatedTimeToFix += 30;
        recommendations.summary.potentialScoreGain += 10;
    }
    
    if (metrics.headingCount < 3 && metrics.paragraphCount > 5) {
        recommendations.quickWins.push({
            category: "Structure",
            issue: "Not enough subheadings",
            action: "Add subheadings every 2-3 paragraphs",
            details: ["Use H2 and H3 tags", "Make headings descriptive", "Include keywords"],
            impact: 4,
            timeEstimate: 15,
            priority: "high"
        });
        recommendations.summary.totalIssues++;
        recommendations.summary.estimatedTimeToFix += 15;
        recommendations.summary.potentialScoreGain += 12;
    }
    
    // Major Improvements
    if (metrics.readabilityScore < 60) {
        recommendations.majorImpact.push({
            category: "Readability",
            issue: "Content is difficult to read",
            action: "Simplify language and sentence structure",
            details: ["Use simpler words", "Shorten paragraphs", "Add transition words"],
            impact: 5,
            timeEstimate: 90,
            priority: "medium"
        });
        recommendations.summary.totalIssues++;
        recommendations.summary.estimatedTimeToFix += 90;
        recommendations.summary.potentialScoreGain += 20;
    }
    
    if (metrics.engagementScore < 50) {
        recommendations.majorImpact.push({
            category: "Engagement",
            issue: "Content lacks engagement elements",
            action: "Add interactive and engaging elements",
            details: ["Include questions to readers", "Add relevant images", "Use storytelling"],
            impact: 4,
            timeEstimate: 120,
            priority: "medium"
        });
        recommendations.summary.totalIssues++;
        recommendations.summary.estimatedTimeToFix += 120;
        recommendations.summary.potentialScoreGain += 18;
    }
    
    // Advanced Optimizations
    if (metrics.claudeAnalysis) {
        if (metrics.claudeAnalysis.tone === "technical" && metrics.claudeAnalysis.overall_quality === "average") {
            recommendations.advanced.push({
                category: "Tone & Style",
                issue: "Tone may be too technical for general audience",
                action: "Adapt tone for target audience",
                details: ["Simplify technical terms", "Add explanations", "Use analogies"],
                impact: 3,
                timeEstimate: 60,
                priority: "low"
            });
            recommendations.summary.totalIssues++;
            recommendations.summary.estimatedTimeToFix += 60;
            recommendations.summary.potentialScoreGain += 8;
        }
    }
    
    recommendations.summary.currentScore = Math.round(
        (metrics.readabilityScore * 0.4 + 
         metrics.structureScore * 0.3 + 
         metrics.engagementScore * 0.2 + 
         metrics.seoScore * 0.1)
    );
    
    recommendations.summary.targetScore = Math.min(100, 
        recommendations.summary.currentScore + recommendations.summary.potentialScoreGain
    );
    
    return recommendations;
}

// ==========================================
// 🔧 CONTENTSCORE HYBRIDE ANALYSE FUNCTIES
// ==========================================

// Helper: Parse HTML en extraheer gestructureerde content
function parseHTMLForAnalysis(html) {
    const $ = cheerio.load(html);
    
    // Verwijder onnodige elementen
    $('script, style, nav, footer, header, aside, iframe, form').remove();
    
    // Extract gestructureerde content
    const structuredContent = {
        title: $('title').text().trim() || $('h1').first().text().trim(),
        metaDescription: $('meta[name="description"]').attr('content') || '',
        h1: $('h1').map((i, el) => $(el).text().trim()).get(),
        h2: $('h2').map((i, el) => $(el).text().trim()).get(),
        h3: $('h3').map((i, el) => $(el).text().trim()).get(),
        paragraphs: $('p').map((i, el) => $(el).text().trim()).get().filter(p => p.length > 10),
        lists: {
            ordered: $('ol li').map((i, el) => $(el).text().trim()).get(),
            unordered: $('ul li').map((i, el) => $(el).text().trim()).get()
        },
        images: {
            total: $('img').length,
            withAlt: $('img[alt]').length,
            withoutAlt: $('img:not([alt])').length,
            altTexts: $('img[alt]').map((i, el) => $(el).attr('alt')).get()
        },
        links: {
            internal: $('a[href^="/"], a[href^="#"]').length,
            external: $('a[href^="http"]').not('[href*="' + ($('meta[property="og:url"]').attr('content') || '') + '"]').length,
            broken: $('a[href=""], a:not([href])').length
        },
        schema: $('script[type="application/ld+json"]').length > 0,
        metaTags: {
            viewport: $('meta[name="viewport"]').length > 0,
            charset: $('meta[charset]').length > 0,
            ogTags: $('meta[property^="og:"]').length,
            twitterCards: $('meta[name^="twitter:"]').length
        },
        mainContent: $('main, article, .content, #content').text().replace(/\s+/g, ' ').trim() || 
                     $('body').text().replace(/\s+/g, ' ').trim()
    };
    
    // Bereken statistieken
    const allText = structuredContent.mainContent;
    const words = allText.split(/\s+/).filter(w => w.length > 1);
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    structuredContent.stats = {
        wordCount: words.length,
        sentenceCount: sentences.length,
        avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : 0,
        avgWordLength: words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0,
        paragraphCount: structuredContent.paragraphs.length,
        headingCount: structuredContent.h1.length + structuredContent.h2.length + structuredContent.h3.length
    };
    
    return structuredContent;
}

// Helper: Bereken consistente scores zonder AI
function calculateConsistentScores(content) {
    const scores = {
        structure: 0,
        readability: 0,
        seo: 0,
        technical: 0
    };
    
    const stats = content.stats;
    
    // 1. STRUCTURE SCORE (40 punten)
    // - Heading hiërarchie (H1, H2, H3)
    if (content.h1.length === 1) scores.structure += 10;
    if (content.h2.length >= 2) scores.structure += 10;
    if (content.h3.length >= 1) scores.structure += 5;
    
    // - Paragraph length (ideaal: 50-150 woorden per paragraph)
    const avgParagraphWords = stats.wordCount / Math.max(1, content.paragraphs.length);
    if (avgParagraphWords >= 50 && avgParagraphWords <= 150) scores.structure += 10;
    else if (avgParagraphWords >= 30 && avgParagraphWords <= 200) scores.structure += 5;
    
    // - Lists aanwezigheid
    const totalListItems = content.lists.ordered.length + content.lists.unordered.length;
    if (totalListItems >= 2) scores.structure += 5;
    
    // 2. READABILITY SCORE (30 punten)
    // - Flesch Reading Ease (gesimplificeerd)
    const flesch = 206.835 - 1.015 * stats.avgSentenceLength - 84.6 * (stats.avgWordLength / stats.avgSentenceLength);
    if (flesch >= 60) scores.readability += 15; // Easy to read
    else if (flesch >= 50) scores.readability += 10;
    else if (flesch >= 30) scores.readability += 5;
    
    // - Sentence length variety (coëfficiënt van variatie)
    const sentenceLengths = content.mainContent.split(/[.!?]+/).map(s => s.trim().split(/\s+/).length);
    if (sentenceLengths.length >= 3) {
        const avg = sentenceLengths.reduce((a, b) => a + b) / sentenceLengths.length;
        const variance = sentenceLengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sentenceLengths.length;
        const cv = Math.sqrt(variance) / avg;
        if (cv > 0.3) scores.readability += 10; // Goede variatie
    }
    
    // - Transition words
    const transitions = ['however', 'therefore', 'moreover', 'furthermore', 'consequently', 'nevertheless', 
                        'additionally', 'similarly', 'likewise', 'conversely', 'otherwise', 'instead'];
    const transitionCount = transitions.reduce((count, word) => 
        count + (content.mainContent.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0
    );
    if (transitionCount >= 3) scores.readability += 5;
    
    // 3. SEO SCORE (20 punten)
    // - Meta tags
    if (content.title && content.title.length >= 15 && content.title.length <= 60) scores.seo += 5;
    if (content.metaDescription && content.metaDescription.length >= 70 && content.metaDescription.length <= 160) scores.seo += 5;
    
    // - Heading keyword consistency
    const titleWords = new Set(content.title.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const h1Words = content.h1.length > 0 ? new Set(content.h1[0].toLowerCase().split(/\W+/).filter(w => w.length > 3)) : new Set();
    const intersection = [...titleWords].filter(x => h1Words.has(x));
    if (intersection.length >= 1) scores.seo += 5;
    
    // - Internal links
    if (content.links.internal >= 3) scores.seo += 5;
    
    // 4. TECHNICAL SCORE (10 punten)
    // - Image alt texts
    const altRatio = content.images.total > 0 ? content.images.withAlt / content.images.total : 0;
    if (altRatio >= 0.9) scores.technical += 5;
    else if (altRatio >= 0.7) scores.technical += 3;
    else if (altRatio >= 0.5) scores.technical += 1;
    
    // - Schema markup
    if (content.schema) scores.technical += 3;
    
    // - Meta tags
    if (content.metaTags.viewport) scores.technical += 1;
    if (content.metaTags.charset) scores.technical += 1;
    
    // Normalize to percentages
    scores.structure = Math.min(40, scores.structure) * 2.5; // 40 -> 100
    scores.readability = Math.min(30, scores.readability) * 3.33; // 30 -> 100
    scores.seo = Math.min(20, scores.seo) * 5; // 20 -> 100
    scores.technical = Math.min(10, scores.technical) * 10; // 10 -> 100
    
    return scores;
}

// Helper: Genereer aanbevelingen
function generateRecommendations(content, scores) {
    const recommendations = {
        structure: [],
        readability: [],
        seo: [],
        technical: []
    };
    
    // STRUCTURE aanbevelingen
    if (content.h1.length !== 1) {
        recommendations.structure.push({
            issue: content.h1.length === 0 ? "Geen H1 heading gevonden" : "Meerdere H1 headings gevonden",
            action: "Zorg voor exact één H1 heading per pagina",
            impact: 5,
            priority: "high"
        });
    }
    
    if (content.h2.length < 2) {
        recommendations.structure.push({
            issue: "Te weinig subheadings (H2)",
            action: "Voeg minstens 2-3 H2 headings toe om content te structureren",
            impact: 4,
            priority: "medium"
        });
    }
    
    const avgParaWords = content.stats.wordCount / Math.max(1, content.paragraphs.length);
    if (avgParaWords > 200) {
        recommendations.structure.push({
            issue: "Paragrafen zijn te lang",
            action: "Breek lange paragrafen op in kleinere van 50-150 woorden",
            impact: 3,
            priority: "medium"
        });
    }
    
    // READABILITY aanbevelingen
    if (scores.readability < 60) {
        recommendations.readability.push({
            issue: "Leesbaarheid kan verbeterd worden",
            action: "Gebruik kortere zinnen en meer overgangswoorden",
            impact: 4,
            priority: "medium"
        });
    }
    
    if (content.stats.avgSentenceLength > 25) {
        recommendations.readability.push({
            issue: "Gemiddelde zinlengte is te hoog",
            action: "Breek lange zinnen op in kortere van 15-20 woorden",
            impact: 4,
            priority: "high"
        });
    }
    
    // SEO aanbevelingen
    if (!content.metaDescription || content.metaDescription.length < 70) {
        recommendations.seo.push({
            issue: "Meta description ontbreekt of is te kort",
            action: "Voeg een meta description toe van 70-160 karakters",
            impact: 5,
            priority: "high"
        });
    }
    
    if (content.links.internal < 3) {
        recommendations.seo.push({
            issue: "Te weinig interne links",
            action: "Voeg minstens 3-5 relevante interne links toe",
            impact: 4,
            priority: "medium"
        });
    }
    
    // TECHNICAL aanbevelingen
    if (content.images.total > 0 && content.images.withoutAlt > 0) {
        const altRatio = content.images.withAlt / content.images.total;
        recommendations.technical.push({
            issue: `Niet alle afbeeldingen hebben alt tekst (${Math.round(altRatio * 100)}%)`,
            action: "Voeg beschrijvende alt teksten toe aan alle afbeeldingen",
            impact: altRatio < 0.5 ? 5 : 3,
            priority: altRatio < 0.5 ? "high" : "medium"
        });
    }
    
    if (!content.schema) {
        recommendations.technical.push({
            issue: "Geen schema markup gevonden",
            action: "Voeg structured data toe met JSON-LD",
            impact: 3,
            priority: "low"
        });
    }
    
    return recommendations;
}

// ==========================================
// ORIGINAL FUNCTIES (behouden voor backwards compatibility)
// ==========================================

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
      hasPubDate,
      html // Voeg HTML toe voor ContentScore analyses
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
      hasPubDate: pageData.hasPubDate,
      html: pageData.html // Inclusief HTML voor verdere analyses
    }
  };
}

// ==========================================
// 🔧 NIEUWE FUNCTIES VOOR CONTENTSCORE TOOL
// ==========================================

// Functie voor hybride HTML analyse (zonder AI)
async function performHybridAnalysis(url) {
  console.log('[HYBRID ANALYSIS] Starting for:', url);
  
  try {
    const pageData = await fetchPageContent(url);
    if (!pageData.success) {
      return { success: false, error: pageData.error };
    }
    
    // Parse HTML voor gestructureerde content
    const structuredContent = parseHTMLForAnalysis(pageData.html);
    
    // Bereken consistente scores
    const scores = calculateConsistentScores(structuredContent);
    
    // Bereken totale score (gewogen gemiddelde)
    const totalScore = Math.round(
        scores.structure * 0.4 +    // 40% structuur
        scores.readability * 0.3 +  // 30% leesbaarheid
        scores.seo * 0.2 +          // 20% SEO
        scores.technical * 0.1      // 10% technisch
    );
    
    // Genereer aanbevelingen
    const recommendations = generateRecommendations(structuredContent, scores);
    
    return {
      success: true,
      url,
      score: totalScore,
      quality: totalScore >= 90 ? 'excellent' : 
              totalScore >= 80 ? 'good' : 
              totalScore >= 70 ? 'fair' : 
              totalScore >= 60 ? 'average' : 'needs-improvement',
      breakdown: {
        graaf: { total: Math.round(scores.readability * 0.5 + scores.seo * 0.3 + scores.technical * 0.2) },
        craft: { total: Math.round(scores.structure * 0.7 + scores.readability * 0.3) },
        technical: { total: Math.round(scores.technical * 1.0) }
      },
      component_scores: scores,
      recommendations: {
        quickWins: [...recommendations.structure, ...recommendations.technical].filter(r => r.priority === 'high'),
        majorImpact: [...recommendations.readability, ...recommendations.seo].filter(r => r.priority === 'medium' || r.priority === 'high'),
        advanced: [...recommendations.structure, ...recommendations.technical].filter(r => r.priority === 'low'),
        summary: {
          totalIssues: Object.values(recommendations).flat().length,
          estimatedTimeToFix: Object.values(recommendations).flat().reduce((sum, rec) => sum + (rec.timeEstimate || 30), 0),
          potentialScoreGain: Math.min(100 - totalScore, Object.values(recommendations).flat().length * 5),
          currentScore: totalScore,
          targetScore: 100
        }
      },
      stats: structuredContent.stats,
      structure: {
        headings: {
          h1: structuredContent.h1,
          h2: structuredContent.h2,
          h3: structuredContent.h3
        },
        paragraphs: structuredContent.paragraphs.length,
        lists: structuredContent.lists.ordered.length + structuredContent.lists.unordered.length
      },
      wordCount: structuredContent.stats.wordCount,
      scanned_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[HYBRID ANALYSIS ERROR]', error);
    return { success: false, error: 'Hybrid analysis failed: ' + error.message };
  }
}

// ==========================================
// EXPORT ALL FUNCTIONS
// ==========================================

module.exports = { 
  performFullScan,
  analyzeTextContent,          // Voor text-only analyse
  performHybridAnalysis,       // Voor hybride analyse zonder AI
  parseHTMLForAnalysis,        // Voor HTML parsing
  calculateConsistentScores,   // Voor consistente score berekening
  generateRecommendations      // Voor aanbevelingen genereren
};
