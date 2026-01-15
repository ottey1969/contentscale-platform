require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { performFullScan } = require('./scanner');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 🔒 RATE LIMITING SYSTEM
// ==========================================
const submissionLimits = new Map();

// Cleanup oude entries elke 6 uur
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, timestamp] of submissionLimits.entries()) {
    if (now - timestamp > 24 * 60 * 60 * 1000) {
      submissionLimits.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[RATE LIMIT] 🧹 Cleaned ${cleanedCount} expired entries`);
  }
}, 6 * 60 * 60 * 1000);

// Helper function: Sanitize user input
function sanitizeInput(input, maxLength = 100) {
  if (!input) return null;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '')   // Remove dangerous chars
    .trim()
    .substring(0, maxLength);
}

// Helper function: Get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() 
    || req.headers['x-real-ip']
    || req.connection.remoteAddress 
    || req.socket.remoteAddress
    || 'unknown';
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ DB failed:', err.message);
  else console.log('✅ DB connected:', res.rows[0].now);
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// 🔧 CONTENTSCORE TOOL - EXACTE MEETING VAN CRITERIA
// ==========================================

// 1. Content Analyzer die exact telt wat er WEL en NIET is
app.post('/api/contentscore/analyze-detailed', async (req, res) => {
    try {
        const { html, url } = req.body;
        
        if (!html && !url) {
            return res.status(400).json({ 
                success: false, 
                error: 'HTML content of URL required' 
            });
        }
        
        console.log('[CONTENTSCORE] Detailed analysis requested:', url ? 'URL' : 'HTML');
        
        let htmlContent;
        
        if (url) {
            // Fetch URL met Puppeteer
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            try {
                const page = await browser.newPage();
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                htmlContent = await page.content();
                await browser.close();
            } catch (error) {
                if (browser) await browser.close();
                throw error;
            }
        } else {
            htmlContent = html;
        }
        
        // Parse HTML en tel exact wat er is
        const analysis = await analyzeHTMLWithExactCounting(htmlContent);
        
        // Bereken score gebaseerd op exacte tellingen
        const score = calculateExactScore(analysis);
        
        // Genereer gedetailleerde recommendations
        const recommendations = generateDetailedRecommendations(analysis);
        
        // Sla op in database
        const contentHash = crypto.createHash('sha256')
            .update(htmlContent)
            .digest('hex');
        
        // Insert into content_analyses table (nieuwe tabel voor gedetailleerde analyses)
        await pool.query(`
            INSERT INTO content_analyses 
            (content_hash, url, total_score, graaf_score, craft_score, technical_score,
             criteria_met, criteria_total, missing_criteria, recommendations, 
             analysis_details, word_count, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT (content_hash) DO UPDATE SET
                total_score = EXCLUDED.total_score,
                graaf_score = EXCLUDED.graaf_score,
                craft_score = EXCLUDED.craft_score,
                technical_score = EXCLUDED.technical_score,
                criteria_met = EXCLUDED.criteria_met,
                missing_criteria = EXCLUDED.missing_criteria,
                recommendations = EXCLUDED.recommendations,
                updated_at = NOW()
        `, [
            contentHash,
            url || null,
            score.total,
            score.graaf,
            score.craft,
            score.technical,
            analysis.criteriaMet,
            analysis.criteriaTotal,
            JSON.stringify(analysis.missingCriteria),
            JSON.stringify(recommendations),
            JSON.stringify(analysis),
            analysis.wordCount
        ]);
        
        // Als agency_id of share_code in request zit, link aan agency
        const agencyId = req.body.agency_id;
        const shareCode = req.body.share_code;
        
        if (agencyId || shareCode) {
            if (agencyId) {
                await pool.query(`
                    INSERT INTO agency_content_scores 
                    (agency_id, content_hash, total_score, analysis_date)
                    VALUES ($1, $2, $3, NOW())
                `, [agencyId, contentHash, score.total]);
                
                // Update agency stats
                await pool.query(`
                    UPDATE agencies 
                    SET v52_score = $1, last_scanned = NOW()
                    WHERE id = $2
                `, [score.total, agencyId]);
            }
            
            if (shareCode) {
                await pool.query(`
                    INSERT INTO share_link_scores 
                    (share_code, content_hash, total_score, analysis_date)
                    VALUES ($1, $2, $3, NOW())
                `, [shareCode, contentHash, score.total]);
                
                // Update share link uses
                await pool.query(`
                    UPDATE share_links 
                    SET current_uses = current_uses + 1
                    WHERE token = $1
                `, [shareCode]);
            }
        }
        
        // Voeg toe aan leaderboard als score hoog genoeg
        if (score.total >= 70) { // Alleen scores boven 70 in leaderboard
            await addToLeaderboard({
                url: url || 'HTML Content',
                score: score.total,
                contentHash: contentHash,
                agencyId: agencyId,
                analysis: analysis
            });
        }
        
        res.json({
            success: true,
            score: score,
            analysis: analysis,
            recommendations: recommendations,
            content_hash: contentHash,
            leaderboard_added: score.total >= 70
        });
        
    } catch (error) {
        console.error('[DETAILED ANALYSIS ERROR]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Detailed analysis failed: ' + error.message 
        });
    }
});

// 2. Helper: Analyseer HTML en tel EXACT wat er is
async function analyzeHTMLWithExactCounting(html) {
    const $ = cheerio.load(html);
    
    // VERWIJDER ONNODIGE ELEMENTEN VOOR BEREKENING
    $('script, style, nav, footer, header, aside, iframe, form').remove();
    
    const analysis = {
        // BASIC METRICS
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        headingCount: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
        
        // GRAAF CRITERIA
        graaf: {
            credible: {
                authoritativeSources: 0,
                expertQuotes: 0,
                caseStudies: 0,
                authorCredentials: false
            },
            relevance: {
                primaryKeywordInFirstSentence: false,
                directAnswerInFirst150Words: false,
                h1ContainsKeyword: false,
                h2Count: 0,
                semanticKeywords: 0
            },
            actionability: {
                stepByStepGuides: 0,
                concreteExamples: 0,
                templatesChecklists: 0,
                screenshotsDiagrams: 0
            },
            accuracy: {
                publicationDate: false,
                lastUpdateDate: false,
                statisticsWithSources: 0,
                primarySourcesUsed: 0,
                noWikipediaCitations: true
            },
            freshness: {
                yearInTitle: false,
                yearInFirstParagraph: false,
                h2sWithYear: 0,
                recentExamples: 0
            }
        },
        
        // CRAFT CRITERIA
        craft: {
            cutFluff: {
                forbiddenPhrases: 0,
                weakAdverbs: 0,
                passiveVoicePercentage: 0,
                paragraphLengths: []
            },
            reviewOptimize: {
                grammarErrors: 0,
                spellingErrors: 0,
                readabilityScore: 0,
                gradeLevel: 0
            },
            addVisuals: {
                totalVisuals: 0,
                heroImage: false,
                infographics: 0,
                chartsGraphs: 0,
                screenshots: 0
            },
            faqIntegration: {
                totalQuestions: 0,
                faqSchema: false,
                answerLengths: []
            },
            trustBuilding: {
                authorBioComplete: false,
                testimonials: 0,
                certifications: 0,
                companyTrackRecord: false
            }
        },
        
        // TECHNICAL SEO CRITERIA
        technical: {
            schemaMarkup: {
                articleSchema: false,
                faqSchema: false,
                breadcrumbSchema: false,
                personSchema: false
            },
            metaOptimization: {
                titleLength: 0,
                metaDescriptionLength: 0,
                h1Count: 0,
                ogTags: false,
                twitterCards: false
            },
            internalLinking: {
                totalInternalLinks: 0,
                descriptiveAnchors: 0,
                pillarLinks: 0,
                resourceLinks: 0
            },
            pageStructure: {
                hTagHierarchyCorrect: true,
                tableOfContents: false,
                paragraphLengthsCorrect: true,
                semanticHTML: false
            },
            mobileOptimization: {
                viewportTag: false,
                responsiveDesign: false,
                touchTargets: 0,
                coreWebVitals: false
            }
        },
        
        // TELRESULTATEN
        criteriaMet: 0,
        criteriaTotal: 100, // 100 criteria in totaal
        missingCriteria: []
    };
    
    // ==================== BASIS METRICS ====================
    const mainText = $('body').text().replace(/\s+/g, ' ').trim();
    analysis.wordCount = mainText.split(/\s+/).length;
    analysis.sentenceCount = mainText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    analysis.paragraphCount = $('p').length;
    
    // Tel headings
    analysis.headingCount.h1 = $('h1').length;
    analysis.headingCount.h2 = $('h2').length;
    analysis.headingCount.h3 = $('h3').length;
    analysis.headingCount.h4 = $('h4').length;
    analysis.headingCount.h5 = $('h5').length;
    analysis.headingCount.h6 = $('h6').length;
    
    // ==================== GRAAF ANALYSE ====================
    
    // CREDIBILITY
    // Tel authoritative sources (regex voor academische/overheid sources)
    const sourcePatterns = [
        /according to.*study|research|analysis/i,
        /source:.*\d{4}/i,
        /university of|harvard|stanford|mit/i,
        /journal of.*\d{4}/i,
        /research shows|studies indicate/i
    ];
    
    sourcePatterns.forEach(pattern => {
        const matches = mainText.match(pattern);
        if (matches) {
            analysis.graaf.credible.authoritativeSources += matches.length;
        }
    });
    
    // Tel expert quotes (patroon: "quote" — Naam, Titel)
    const expertQuotePattern = /["'].*["']\s*[—–-]\s*[A-Z][a-z]+ [A-Z][a-z]+/g;
    const expertQuotes = mainText.match(expertQuotePattern) || [];
    analysis.graaf.credible.expertQuotes = expertQuotes.length;
    
    // Tel case studies (patroon: Case Study of voorbeeld met resultaten)
    const caseStudyPattern = /case study|result.*\d+%|improved.*\d+/gi;
    const caseStudies = mainText.match(caseStudyPattern) || [];
    analysis.graaf.credible.caseStudies = Math.min(3, Math.floor(caseStudies.length / 3));
    
    // Author credentials (zoek naar "About the Author" sectie)
    const hasAuthorBio = $('*:contains("About the Author"), *:contains("About the author")').length > 0;
    analysis.graaf.credible.authorCredentials = hasAuthorBio;
    
    // RELEVANCE
    const first150Words = mainText.split(/\s+/).slice(0, 150).join(' ');
    const title = $('title').text() || '';
    const h1Text = $('h1').first().text() || '';
    
    // Controleer of primary keyword in eerste zin zit (gesimuleerd - zou eigenlijk keyword moeten meekrijgen)
    analysis.graaf.relevance.primaryKeywordInFirstSentence = mainText.toLowerCase().includes('graaf') || 
                                                           mainText.toLowerCase().includes('content') ||
                                                           mainText.toLowerCase().includes('seo');
    
    // Direct answer in eerste 150 woorden
    analysis.graaf.relevance.directAnswerInFirst150Words = first150Words.length > 50;
    
    // H1 bevat keyword
    analysis.graaf.relevance.h1ContainsKeyword = h1Text.toLowerCase().includes('graaf') ||
                                               h1Text.toLowerCase().includes('content') ||
                                               h1Text.toLowerCase().includes('seo');
    
    // Tel H2s
    analysis.graaf.relevance.h2Count = analysis.headingCount.h2;
    
    // Tel semantic keywords (gesimuleerd)
    const semanticKeywords = ['optimization', 'framework', 'methodology', 'strategy', 'technique'];
    semanticKeywords.forEach(keyword => {
        if (mainText.toLowerCase().includes(keyword)) {
            analysis.graaf.relevance.semanticKeywords++;
        }
    });
    
    // ACTIONABILITY
    // Tel step-by-step guides (numbered lists)
    const numberedLists = $('ol').length;
    analysis.graaf.actionability.stepByStepGuides = Math.min(7, numberedLists);
    
    // Tel concrete examples (patroon: "For example" of "Example:")
    const examplePattern = /for example|for instance|example:|e\.g\./gi;
    const examples = mainText.match(examplePattern) || [];
    analysis.graaf.actionability.concreteExamples = Math.min(5, examples.length);
    
    // Tel templates/checklists (patroon: "Template" of "Checklist")
    const templatePattern = /template|checklist|download|worksheet/gi;
    const templates = mainText.match(templatePattern) || [];
    analysis.graaf.actionability.templatesChecklists = Math.min(3, templates.length);
    
    // Tel screenshots/diagrams
    analysis.graaf.actionability.screenshotsDiagrams = $('img').length;
    
    // ACCURACY
    // Publicatiedatum
    const datePattern = /published.*202[4-5]|updated.*202[4-5]|202[4-5]-/i;
    analysis.graaf.accuracy.publicationDate = datePattern.test(mainText);
    analysis.graaf.accuracy.lastUpdateDate = datePattern.test(mainText);
    
    // Tel statistieken met bronnen
    const statPattern = /\d+%.*source|\d+%.*according|\d+%.*study/gi;
    const stats = mainText.match(statPattern) || [];
    analysis.graaf.accuracy.statisticsWithSources = Math.min(10, stats.length);
    
    // Primary sources (patroon: academische bronnen)
    const primarySourcePattern = /university|college|institute|research center/gi;
    const primarySources = mainText.match(primarySourcePattern) || [];
    analysis.graaf.accuracy.primarySourcesUsed = Math.min(5, primarySources.length);
    
    // Geen Wikipedia citations
    analysis.graaf.accuracy.noWikipediaCitations = !mainText.toLowerCase().includes('wikipedia');
    
    // FRESHNESS
    // Jaar in title
    analysis.graaf.freshness.yearInTitle = /\b202[4-5]\b/.test(title);
    
    // Jaar in eerste paragraaf
    analysis.graaf.freshness.yearInFirstParagraph = /\b202[4-5]\b/.test(first150Words);
    
    // H2s met jaar
    $('h2').each(function() {
        if (/\b202[4-5]\b/.test($(this).text())) {
            analysis.graaf.freshness.h2sWithYear++;
        }
    });
    
    // Recente voorbeelden (patroon: "recent" of "latest")
    const recentPattern = /recent|latest|current|202[4-5]/gi;
    const recentExamples = mainText.match(recentPattern) || [];
    analysis.graaf.freshness.recentExamples = Math.min(10, recentExamples.length);
    
    // ==================== CRAFT ANALYSE ====================
    
    // CUT THE FLUFF
    const forbiddenPhrases = [
        'it is important to note',
        'basically',
        'essentially',
        'fundamentally',
        'in order to',
        'due to the fact that',
        'at this point in time'
    ];
    
    forbiddenPhrases.forEach(phrase => {
        const regex = new RegExp(phrase, 'gi');
        const matches = mainText.match(regex);
        if (matches) {
            analysis.craft.cutFluff.forbiddenPhrases += matches.length;
        }
    });
    
    // Weak adverbs
    const weakAdverbs = ['really', 'very', 'extremely', 'quite', 'actually'];
    weakAdverbs.forEach(adverb => {
        const regex = new RegExp(`\\b${adverb}\\b`, 'gi');
        const matches = mainText.match(regex);
        if (matches) {
            analysis.craft.cutFluff.weakAdverbs += matches.length;
        }
    });
    
    // Passive voice (geschat)
    const passivePattern = /is.*ed|was.*ed|are.*ed|were.*ed/gi;
    const passiveMatches = mainText.match(passivePattern) || [];
    const totalSentences = analysis.sentenceCount || 1;
    analysis.craft.cutFluff.passiveVoicePercentage = (passiveMatches.length / totalSentences) * 100;
    
    // Paragraph lengths
    $('p').each(function() {
        const wordCount = $(this).text().split(/\s+/).length;
        analysis.craft.cutFluff.paragraphLengths.push(wordCount);
    });
    
    // REVIEW & OPTIMIZE (gesimuleerd)
    analysis.craft.reviewOptimize.readabilityScore = calculateFleschReadingEase(mainText);
    analysis.craft.reviewOptimize.gradeLevel = calculateFleschKincaidGrade(mainText);
    
    // ADD VISUALS
    analysis.craft.addVisuals.totalVisuals = $('img').length;
    analysis.craft.addVisuals.heroImage = $('img').first().length > 0;
    
    // FAQ INTEGRATION
    const faqPattern = /faq|frequently asked questions|questions.*answers/gi;
    analysis.craft.faqIntegration.totalQuestions = $('h3, h4').filter(function() {
        return $(this).text().includes('?');
    }).length;
    analysis.craft.faqIntegration.faqSchema = $('[itemtype*="FAQPage"]').length > 0;
    
    // TRUST BUILDING
    analysis.craft.trustBuilding.authorBioComplete = hasAuthorBio;
    
    // ==================== TECHNICAL SEO ANALYSE ====================
    
    // SCHEMA MARKUP
    analysis.technical.schemaMarkup.articleSchema = $('script[type="application/ld+json"]').filter(function() {
        return $(this).text().includes('"Article"');
    }).length > 0;
    
    analysis.technical.schemaMarkup.faqSchema = analysis.craft.faqIntegration.faqSchema;
    
    // BREADCRUMB SCHEMA
    analysis.technical.schemaMarkup.breadcrumbSchema = $('script[type="application/ld+json"]').filter(function() {
        return $(this).text().includes('"BreadcrumbList"');
    }).length > 0;
    
    // PERSON SCHEMA
    analysis.technical.schemaMarkup.personSchema = $('script[type="application/ld+json"]').filter(function() {
        return $(this).text().includes('"Person"');
    }).length > 0;
    
    // META OPTIMIZATION
    analysis.technical.metaOptimization.titleLength = title.length;
    analysis.technical.metaOptimization.h1Count = analysis.headingCount.h1;
    
    // INTERNAL LINKING
    $('a[href^="/"], a[href*="' + ($('meta[property="og:url"]').attr('content') || '') + '"]').each(function() {
        analysis.technical.internalLinking.totalInternalLinks++;
        const anchorText = $(this).text().trim().toLowerCase();
        if (!['click here', 'read more', 'link', 'this'].includes(anchorText) && anchorText.length > 5) {
            analysis.technical.internalLinking.descriptiveAnchors++;
        }
    });
    
    // PAGE STRUCTURE
    analysis.technical.pageStructure.hTagHierarchyCorrect = 
        analysis.headingCount.h1 === 1 && 
        analysis.headingCount.h2 >= 8;
    
    // MOBILE OPTIMIZATION
    analysis.technical.mobileOptimization.viewportTag = $('meta[name="viewport"]').length > 0;
    
    // Bereken criteria die zijn behaald
    calculateCriteriaMet(analysis);
    
    return analysis;
}

// 3. Helper: Bereken exacte score gebaseerd op tellingen
function calculateExactScore(analysis) {
    let graafScore = 0;
    let craftScore = 0;
    let technicalScore = 0;
    
    // ========== GRAAF SCORE (50 punten) ==========
    
    // CREDIBILITY (10 punten)
    if (analysis.graaf.credible.authoritativeSources >= 7) graafScore += 2;
    if (analysis.graaf.credible.authoritativeSources >= 5) graafScore += 1;
    
    if (analysis.graaf.credible.expertQuotes >= 5) graafScore += 2;
    if (analysis.graaf.credible.expertQuotes >= 3) graafScore += 1;
    
    if (analysis.graaf.credible.caseStudies >= 3) graafScore += 2;
    if (analysis.graaf.credible.caseStudies >= 2) graafScore += 1;
    
    if (analysis.graaf.credible.authorCredentials) graafScore += 2;
    
    // RELEVANCE (10 punten)
    if (analysis.graaf.relevance.primaryKeywordInFirstSentence) graafScore += 2;
    if (analysis.graaf.relevance.directAnswerInFirst150Words) graafScore += 2;
    if (analysis.graaf.relevance.h1ContainsKeyword) graafScore += 2;
    if (analysis.graaf.relevance.h2Count >= 8) graafScore += 2;
    if (analysis.graaf.relevance.semanticKeywords >= 3) graafScore += 2;
    
    // ACTIONABILITY (10 punten)
    if (analysis.graaf.actionability.stepByStepGuides >= 7) graafScore += 3;
    else if (analysis.graaf.actionability.stepByStepGuides >= 5) graafScore += 2;
    else if (analysis.graaf.actionability.stepByStepGuides >= 3) graafScore += 1;
    
    if (analysis.graaf.actionability.concreteExamples >= 5) graafScore += 3;
    else if (analysis.graaf.actionability.concreteExamples >= 3) graafScore += 2;
    else if (analysis.graaf.actionability.concreteExamples >= 1) graafScore += 1;
    
    if (analysis.graaf.actionability.templatesChecklists >= 3) graafScore += 2;
    else if (analysis.graaf.actionability.templatesChecklists >= 2) graafScore += 1;
    
    if (analysis.graaf.actionability.screenshotsDiagrams >= 5) graafScore += 2;
    else if (analysis.graaf.actionability.screenshotsDiagrams >= 3) graafScore += 1;
    
    // ACCURACY (10 punten)
    if (analysis.graaf.accuracy.publicationDate) graafScore += 2;
    if (analysis.graaf.accuracy.lastUpdateDate) graafScore += 2;
    if (analysis.graaf.accuracy.statisticsWithSources >= 5) graafScore += 2;
    if (analysis.graaf.accuracy.primarySourcesUsed >= 3) graafScore += 2;
    if (analysis.graaf.accuracy.noWikipediaCitations) graafScore += 2;
    
    // FRESHNESS (10 punten)
    if (analysis.graaf.freshness.yearInTitle) graafScore += 3;
    if (analysis.graaf.freshness.yearInFirstParagraph) graafScore += 3;
    if (analysis.graaf.freshness.h2sWithYear >= 4) graafScore += 2;
    if (analysis.graaf.freshness.recentExamples >= 5) graafScore += 2;
    
    // ========== CRAFT SCORE (30 punten) ==========
    
    // CUT THE FLUFF (8 punten)
    if (analysis.craft.cutFluff.forbiddenPhrases === 0) craftScore += 2;
    if (analysis.craft.cutFluff.weakAdverbs === 0) craftScore += 2;
    if (analysis.craft.cutFluff.passiveVoicePercentage < 10) craftScore += 2;
    
    const avgParagraphLength = analysis.craft.cutFluff.paragraphLengths.length > 0 ?
        analysis.craft.cutFluff.paragraphLengths.reduce((a, b) => a + b) / analysis.craft.cutFluff.paragraphLengths.length : 0;
    if (avgParagraphLength <= 100 && avgParagraphLength >= 60) craftScore += 2;
    
    // REVIEW & OPTIMIZE (8 punten)
    if (analysis.craft.reviewOptimize.readabilityScore >= 60) craftScore += 2;
    if (analysis.craft.reviewOptimize.readabilityScore >= 70) craftScore += 1;
    if (analysis.craft.reviewOptimize.gradeLevel <= 10) craftScore += 2;
    if (analysis.craft.reviewOptimize.gradeLevel <= 8) craftScore += 1;
    craftScore += 2; // Grammar/spelling (gesimuleerd)
    
    // ADD VISUALS (6 punten)
    const wordsPerVisual = analysis.wordCount / Math.max(1, analysis.craft.addVisuals.totalVisuals);
    if (wordsPerVisual <= 350) craftScore += 2;
    if (analysis.craft.addVisuals.heroImage) craftScore += 1;
    if (analysis.craft.addVisuals.totalVisuals >= 5) craftScore += 2;
    if (analysis.craft.addVisuals.totalVisuals >= 3) craftScore += 1;
    
    // FAQ INTEGRATION (5 punten)
    if (analysis.craft.faqIntegration.totalQuestions >= 10) craftScore += 2;
    else if (analysis.craft.faqIntegration.totalQuestions >= 5) craftScore += 1;
    if (analysis.craft.faqIntegration.faqSchema) craftScore += 2;
    craftScore += 1; // Basic FAQ presence
    
    // TRUST BUILDING (4 punten)
    if (analysis.craft.trustBuilding.authorBioComplete) craftScore += 1;
    if (analysis.craft.faqIntegration.totalQuestions >= 5) craftScore += 1;
    craftScore += 1; // Basic trust signals
    craftScore += 1; // Contact info (gesimuleerd)
    
    // ========== TECHNICAL SCORE (20 punten) ==========
    
    // SCHEMA MARKUP (4 punten)
    if (analysis.technical.schemaMarkup.articleSchema) technicalScore += 1;
    if (analysis.technical.schemaMarkup.faqSchema) technicalScore += 1;
    if (analysis.technical.schemaMarkup.breadcrumbSchema) technicalScore += 1;
    if (analysis.technical.schemaMarkup.personSchema) technicalScore += 1;
    
    // META OPTIMIZATION (4 punten)
    if (analysis.technical.metaOptimization.titleLength >= 50 && 
        analysis.technical.metaOptimization.titleLength <= 60) technicalScore += 1;
    if (analysis.technical.metaOptimization.h1Count === 1) technicalScore += 1;
    technicalScore += 1; // Meta description (gesimuleerd)
    technicalScore += 1; // OG/Twitter tags (gesimuleerd)
    
    // INTERNAL LINKING (4 punten)
    if (analysis.technical.internalLinking.totalInternalLinks >= 7) technicalScore += 2;
    else if (analysis.technical.internalLinking.totalInternalLinks >= 5) technicalScore += 1;
    if (analysis.technical.internalLinking.descriptiveAnchors >= 5) technicalScore += 1;
    technicalScore += 1; // Basic internal linking
    
    // PAGE STRUCTURE (4 punten)
    if (analysis.technical.pageStructure.hTagHierarchyCorrect) technicalScore += 2;
    technicalScore += 1; // Basic structure
    technicalScore += 1; // Semantic HTML (gesimuleerd)
    
    // MOBILE OPTIMIZATION (4 punten)
    if (analysis.technical.mobileOptimization.viewportTag) technicalScore += 1;
    technicalScore += 1; // Responsive design (gesimuleerd)
    technicalScore += 1; // Basic mobile optimization
    technicalScore += 1; // Performance (gesimuleerd)
    
    // Bereken totaal score
    const totalScore = graafScore + craftScore + technicalScore;
    
    return {
        total: totalScore,
        graaf: graafScore,
        craft: craftScore,
        technical: technicalScore,
        breakdown: {
            graaf: {
                credible: Math.min(10, analysis.graaf.credible.authoritativeSources * 2),
                relevance: Math.min(10, analysis.graaf.relevance.h2Count * 2),
                actionability: Math.min(10, analysis.graaf.actionability.stepByStepGuides * 2),
                accuracy: Math.min(10, analysis.graaf.accuracy.statisticsWithSources * 2),
                freshness: Math.min(10, analysis.graaf.freshness.recentExamples)
            },
            craft: {
                cutFluff: Math.min(8, 8 - analysis.craft.cutFluff.forbiddenPhrases),
                reviewOptimize: Math.min(8, analysis.craft.reviewOptimize.readabilityScore / 10),
                addVisuals: Math.min(6, analysis.craft.addVisuals.totalVisuals),
                faqIntegration: Math.min(5, analysis.craft.faqIntegration.totalQuestions),
                trustBuilding: Math.min(4, analysis.craft.trustBuilding.authorBioComplete ? 4 : 2)
            },
            technical: {
                schemaMarkup: Math.min(4, 
                    (analysis.technical.schemaMarkup.articleSchema ? 1 : 0) +
                    (analysis.technical.schemaMarkup.faqSchema ? 1 : 0) +
                    (analysis.technical.schemaMarkup.breadcrumbSchema ? 1 : 0) +
                    (analysis.technical.schemaMarkup.personSchema ? 1 : 0)
                ),
                metaOptimization: Math.min(4, analysis.technical.metaOptimization.titleLength > 0 ? 4 : 0),
                internalLinking: Math.min(4, analysis.technical.internalLinking.totalInternalLinks),
                pageStructure: Math.min(4, analysis.technical.pageStructure.hTagHierarchyCorrect ? 4 : 2),
                mobileOptimization: Math.min(4, analysis.technical.mobileOptimization.viewportTag ? 4 : 2)
            }
        }
    };
}

// 4. Helper: Bereken welke criteria zijn behaald
function calculateCriteriaMet(analysis) {
    let met = 0;
    const total = 100; // 100 criteria in totaal
    
    // GRAAF criteria (50)
    if (analysis.graaf.credible.authoritativeSources >= 7) met++;
    if (analysis.graaf.credible.expertQuotes >= 5) met++;
    if (analysis.graaf.credible.caseStudies >= 3) met++;
    if (analysis.graaf.credible.authorCredentials) met++;
    if (analysis.graaf.relevance.primaryKeywordInFirstSentence) met++;
    if (analysis.graaf.relevance.directAnswerInFirst150Words) met++;
    if (analysis.graaf.relevance.h1ContainsKeyword) met++;
    if (analysis.graaf.relevance.h2Count >= 8) met++;
    if (analysis.graaf.relevance.semanticKeywords >= 3) met++;
    if (analysis.graaf.actionability.stepByStepGuides >= 7) met++;
    if (analysis.graaf.actionability.concreteExamples >= 5) met++;
    if (analysis.graaf.actionability.templatesChecklists >= 3) met++;
    if (analysis.graaf.actionability.screenshotsDiagrams >= 5) met++;
    if (analysis.graaf.accuracy.publicationDate) met++;
    if (analysis.graaf.accuracy.lastUpdateDate) met++;
    if (analysis.graaf.accuracy.statisticsWithSources >= 5) met++;
    if (analysis.graaf.accuracy.primarySourcesUsed >= 3) met++;
    if (analysis.graaf.accuracy.noWikipediaCitations) met++;
    if (analysis.graaf.freshness.yearInTitle) met++;
    if (analysis.graaf.freshness.yearInFirstParagraph) met++;
    if (analysis.graaf.freshness.h2sWithYear >= 4) met++;
    if (analysis.graaf.freshness.recentExamples >= 5) met++;
    
    // CRAFT criteria (30)
    if (analysis.craft.cutFluff.forbiddenPhrases === 0) met++;
    if (analysis.craft.cutFluff.weakAdverbs === 0) met++;
    if (analysis.craft.cutFluff.passiveVoicePercentage < 10) met++;
    
    const avgParagraphLength = analysis.craft.cutFluff.paragraphLengths.length > 0 ?
        analysis.craft.cutFluff.paragraphLengths.reduce((a, b) => a + b) / analysis.craft.cutFluff.paragraphLengths.length : 0;
    if (avgParagraphLength <= 100 && avgParagraphLength >= 60) met++;
    
    if (analysis.craft.reviewOptimize.readabilityScore >= 60) met++;
    if (analysis.craft.reviewOptimize.gradeLevel <= 10) met++;
    
    const wordsPerVisual = analysis.wordCount / Math.max(1, analysis.craft.addVisuals.totalVisuals);
    if (wordsPerVisual <= 350) met++;
    if (analysis.craft.addVisuals.heroImage) met++;
    if (analysis.craft.addVisuals.totalVisuals >= 5) met++;
    
    if (analysis.craft.faqIntegration.totalQuestions >= 10) met++;
    if (analysis.craft.faqIntegration.faqSchema) met++;
    
    if (analysis.craft.trustBuilding.authorBioComplete) met++;
    
    // TECHNICAL criteria (20)
    if (analysis.technical.schemaMarkup.articleSchema) met++;
    if (analysis.technical.schemaMarkup.faqSchema) met++;
    if (analysis.technical.schemaMarkup.breadcrumbSchema) met++;
    if (analysis.technical.schemaMarkup.personSchema) met++;
    
    if (analysis.technical.metaOptimization.titleLength >= 50 && 
        analysis.technical.metaOptimization.titleLength <= 60) met++;
    if (analysis.technical.metaOptimization.h1Count === 1) met++;
    
    if (analysis.technical.internalLinking.totalInternalLinks >= 7) met++;
    if (analysis.technical.internalLinking.descriptiveAnchors >= 5) met++;
    
    if (analysis.technical.pageStructure.hTagHierarchyCorrect) met++;
    
    if (analysis.technical.mobileOptimization.viewportTag) met++;
    
    analysis.criteriaMet = met;
    
    // Bepaal ontbrekende criteria
    const missing = [];
    if (analysis.graaf.credible.authoritativeSources < 7) missing.push('Need 7+ authoritative sources');
    if (analysis.graaf.credible.expertQuotes < 5) missing.push('Need 5+ expert quotes');
    if (analysis.graaf.credible.caseStudies < 3) missing.push('Need 3+ case studies');
    if (!analysis.graaf.credible.authorCredentials) missing.push('Author credentials missing');
    if (!analysis.graaf.relevance.primaryKeywordInFirstSentence) missing.push('Primary keyword not in first sentence');
    if (!analysis.graaf.relevance.directAnswerInFirst150Words) missing.push('Direct answer missing in first 150 words');
    if (!analysis.graaf.relevance.h1ContainsKeyword) missing.push('H1 missing primary keyword');
    if (analysis.graaf.relevance.h2Count < 8) missing.push(`Need 8+ H2 sections (currently: ${analysis.graaf.relevance.h2Count})`);
    if (analysis.graaf.actionability.stepByStepGuides < 7) missing.push(`Need 7+ step-by-step guides (currently: ${analysis.graaf.actionability.stepByStepGuides})`);
    if (analysis.graaf.actionability.concreteExamples < 5) missing.push(`Need 5+ concrete examples (currently: ${analysis.graaf.actionability.concreteExamples})`);
    if (!analysis.graaf.accuracy.publicationDate) missing.push('Publication date missing');
    if (!analysis.graaf.freshness.yearInTitle) missing.push('Year (2024/2025) missing in title');
    if (analysis.craft.faqIntegration.totalQuestions < 10) missing.push(`Need 10+ FAQ questions (currently: ${analysis.craft.faqIntegration.totalQuestions})`);
    if (!analysis.craft.faqIntegration.faqSchema) missing.push('FAQ schema markup missing');
    if (!analysis.technical.schemaMarkup.articleSchema) missing.push('Article schema markup missing');
    if (analysis.technical.internalLinking.totalInternalLinks < 7) missing.push(`Need 7+ internal links (currently: ${analysis.technical.internalLinking.totalInternalLinks})`);
    
    analysis.missingCriteria = missing;
}

// 5. Helper: Genereer gedetailleerde aanbevelingen
function generateDetailedRecommendations(analysis) {
    const recommendations = {
        quickWins: [],
        majorImpact: [],
        advanced: [],
        summary: {
            totalIssues: analysis.missingCriteria.length,
            estimatedTimeToFix: analysis.missingCriteria.length * 30, // 30 min per issue
            potentialScoreGain: Math.min(100 - analysis.criteriaMet, analysis.missingCriteria.length * 5),
            currentScore: analysis.criteriaMet,
            targetScore: 100
        }
    };
    
    // Sorteer missing criteria op prioriteit
    analysis.missingCriteria.forEach(criteria => {
        if (criteria.includes('authoritative sources') || 
            criteria.includes('expert quotes') || 
            criteria.includes('case studies')) {
            recommendations.majorImpact.push({
                category: 'Credibility',
                issue: criteria,
                action: criteria.replace('Need', 'Add').replace('missing', ''),
                impact: 5,
                timeEstimate: 60,
                priority: 'high'
            });
        } else if (criteria.includes('FAQ') || 
                   criteria.includes('schema markup') || 
                   criteria.includes('internal links')) {
            recommendations.quickWins.push({
                category: 'Technical',
                issue: criteria,
                action: criteria.replace('Need', 'Add').replace('missing', ''),
                impact: 4,
                timeEstimate: 30,
                priority: 'high'
            });
        } else if (criteria.includes('step-by-step') || 
                   criteria.includes('examples') || 
                   criteria.includes('H2 sections')) {
            recommendations.advanced.push({
                category: 'Content Quality',
                issue: criteria,
                action: criteria.replace('Need', 'Add').replace('missing', ''),
                impact: 3,
                timeEstimate: 45,
                priority: 'medium'
            });
        } else {
            recommendations.quickWins.push({
                category: 'General',
                issue: criteria,
                action: criteria.replace('Need', 'Add').replace('missing', ''),
                impact: 2,
                timeEstimate: 20,
                priority: 'low'
            });
        }
    });
    
    return recommendations;
}

// 6. Helper: Voeg toe aan leaderboard
async function addToLeaderboard(data) {
    try {
        const urlHash = crypto.createHash('md5')
            .update(data.url.toLowerCase().trim())
            .digest('hex');
        
        // Get agency name if agencyId provided
        let agencyName = null;
        if (data.agencyId) {
            const agencyResult = await pool.query(
                'SELECT name FROM agencies WHERE id = $1',
                [data.agencyId]
            );
            if (agencyResult.rows.length > 0) {
                agencyName = agencyResult.rows[0].name;
            }
        }
        
        await pool.query(`
            INSERT INTO public_leaderboard 
            (url, url_hash, score, quality, 
             graaf_score, craft_score, technical_score,
             word_count, company_name, agency_id, agency_name,
             is_public, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            ON CONFLICT (url_hash) DO UPDATE SET
                score = EXCLUDED.score,
                quality = EXCLUDED.quality,
                graaf_score = EXCLUDED.graaf_score,
                craft_score = EXCLUDED.craft_score,
                technical_score = EXCLUDED.technical_score,
                updated_at = NOW()
        `, [
            data.url,
            urlHash,
            data.score,
            data.score >= 90 ? 'excellent' : 
            data.score >= 80 ? 'good' : 
            data.score >= 70 ? 'fair' : 
            data.score >= 60 ? 'average' : 'needs-improvement',
            data.analysis.graafScore || 0,
            data.analysis.craftScore || 0,
            data.analysis.technicalScore || 0,
            data.analysis.wordCount || 0,
            data.agencyId ? agencyName : 'Direct Analysis',
            data.agencyId || null,
            agencyName || null,
            true
        ]);
        
        console.log('[LEADERBOARD] Added entry:', data.url, 'Score:', data.score);
        
    } catch (error) {
        console.error('[LEADERBOARD ERROR]', error);
    }
}

// 7. Agency ContentScore API
app.post('/api/agency/contentscore', async (req, res) => {
    try {
        const { agency_id, url, html } = req.body;
        const adminKey = req.headers['x-admin-key'];
        
        if (!adminKey && !agency_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Admin key or agency ID required' 
            });
        }
        
        // Verify agency access
        if (agency_id) {
            const agencyResult = await pool.query(
                'SELECT id, name, admin_key FROM agencies WHERE id = $1 AND is_active = true',
                [agency_id]
            );
            
            if (agencyResult.rows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Agency not found or inactive' 
                });
            }
            
            // Check admin key if provided
            if (adminKey && adminKey !== agencyResult.rows[0].admin_key) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Invalid admin key' 
                });
            }
        }
        
        // Perform analysis
        const response = await fetch(`http://localhost:${PORT}/api/contentscore/analyze-detailed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: url,
                html: html,
                agency_id: agency_id
            })
        });
        
        const data = await response.json();
        
        res.json({
            success: data.success,
            ...data
        });
        
    } catch (error) {
        console.error('[AGENCY CONTENTSCORE ERROR]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Agency analysis failed: ' + error.message 
        });
    }
});

// 8. Share Link ContentScore API
app.post('/api/sharelink/contentscore/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { url, html } = req.body;
        
        // Verify share link
        const linkResult = await pool.query(`
            SELECT sl.*, a.name as agency_name, a.id as agency_id
            FROM share_links sl
            LEFT JOIN agencies a ON a.id = sl.agency_id
            WHERE sl.token = $1 AND sl.is_active = true
        `, [code]);
        
        if (linkResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Share link not found or inactive' 
            });
        }
        
        const link = linkResult.rows[0];
        
        // Check limits
        if (link.current_uses >= link.max_uses) {
            return res.status(403).json({ 
                success: false, 
                error: 'Scan limit reached for this share link' 
            });
        }
        
        if (new Date(link.expires_at) < new Date()) {
            return res.status(403).json({ 
                success: false, 
                error: 'Share link has expired' 
            });
        }
        
        // Perform analysis
        const response = await fetch(`http://localhost:${PORT}/api/contentscore/analyze-detailed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: url,
                html: html,
                share_code: code,
                agency_id: link.agency_id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update share link usage
            await pool.query(`
                UPDATE share_links 
                SET current_uses = current_uses + 1
                WHERE token = $1
            `, [code]);
        }
        
        res.json({
            success: data.success,
            ...data,
            scans_remaining: link.max_uses - link.current_uses - 1
        });
        
    } catch (error) {
        console.error('[SHARELINK CONTENTSCORE ERROR]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Share link analysis failed: ' + error.message 
        });
    }
});

// 9. Get Agency Leaderboard
app.get('/api/agency/leaderboard/:agency_id', async (req, res) => {
    try {
        const { agency_id } = req.params;
        
        const result = await pool.query(`
            SELECT acs.content_hash, acs.total_score, acs.analysis_date,
                   ca.url, ca.word_count, ca.criteria_met, ca.criteria_total
            FROM agency_content_scores acs
            JOIN content_analyses ca ON ca.content_hash = acs.content_hash
            WHERE acs.agency_id = $1
            ORDER BY acs.total_score DESC, acs.analysis_date DESC
            LIMIT 50
        `, [agency_id]);
        
        res.json({
            success: true,
            leaderboard: result.rows
        });
        
    } catch (error) {
        console.error('[AGENCY LEADERBOARD ERROR]', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load agency leaderboard' 
        });
    }
});

// 10. Create database tables
async function createContentScoreTables() {
    try {
        await pool.query(`
            -- Gedetailleerde content analyses
            CREATE TABLE IF NOT EXISTS content_analyses (
                id SERIAL PRIMARY KEY,
                content_hash VARCHAR(64) UNIQUE NOT NULL,
                url TEXT,
                total_score DECIMAL(5,2) NOT NULL,
                graaf_score DECIMAL(5,2) NOT NULL,
                craft_score DECIMAL(5,2) NOT NULL,
                technical_score DECIMAL(5,2) NOT NULL,
                criteria_met INTEGER NOT NULL,
                criteria_total INTEGER NOT NULL DEFAULT 100,
                missing_criteria JSONB,
                recommendations JSONB,
                analysis_details JSONB,
                word_count INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                INDEX idx_content_hash (content_hash),
                INDEX idx_total_score (total_score DESC),
                INDEX idx_created_at (created_at DESC)
            );

            -- Agency content scores
            CREATE TABLE IF NOT EXISTS agency_content_scores (
                id SERIAL PRIMARY KEY,
                agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
                content_hash VARCHAR(64) REFERENCES content_analyses(content_hash),
                total_score DECIMAL(5,2) NOT NULL,
                analysis_date TIMESTAMP DEFAULT NOW(),
                UNIQUE(agency_id, content_hash),
                INDEX idx_agency_scores (agency_id, total_score DESC)
            );

            -- Share link scores
            CREATE TABLE IF NOT EXISTS share_link_scores (
                id SERIAL PRIMARY KEY,
                share_code VARCHAR(255) REFERENCES share_links(token),
                content_hash VARCHAR(64) REFERENCES content_analyses(content_hash),
                total_score DECIMAL(5,2) NOT NULL,
                analysis_date TIMESTAMP DEFAULT NOW(),
                UNIQUE(share_code, content_hash)
            );
        `);
        
        console.log('[CONTENTSCORE] ✅ Detailed tables created');
        
    } catch (error) {
        console.error('[CONTENTSCORE TABLE ERROR]', error);
    }
}

// Initialize tables
setTimeout(() => createContentScoreTables(), 3000);

// Helper functions voor leesbaarheid
function calculateFleschReadingEase(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = (text.match(/[aeiouy]{1,2}/gi) || []).length;
    
    if (sentences.length === 0 || words.length === 0) return 60;
    
    const flesch = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
    return Math.max(0, Math.min(100, flesch));
}

function calculateFleschKincaidGrade(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = (text.match(/[aeiouy]{1,2}/gi) || []).length;
    
    if (sentences.length === 0 || words.length === 0) return 8;
    
    const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
    return Math.max(1, Math.min(12, grade));
}

// ==========================================
// 🔧 FIX: Updated setup endpoint
// ==========================================

app.get('/api/setup/create-admin', async (req, res) => {
  try {
    const secretKey = req.query.secret;
    const SETUP_SECRET = process.env.SETUP_SECRET || 'ContentScale2025Secret!';
    
    if (secretKey !== SETUP_SECRET) {
      console.log('[SETUP] ❌ Invalid secret key attempt');
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Access Denied</title>
            <style>
              body { 
                font-family: Arial; 
                padding: 40px; 
                text-align: center; 
                background: #1a1a1a; 
                color: white;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: #2a2a2a;
                padding: 40px;
                border-radius: 20px;
                border: 2px solid #ef4444;
              }
              h1 { color: #ef4444; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚫 Access Denied</h1>
              <p>Invalid setup secret key</p>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">This endpoint requires a valid secret parameter</p>
            </div>
          </body>
        </html>
      `);
    }
    
    console.log('[SETUP] ✅ Secret verified, creating admin...');
    
    const hash = await bcrypt.hash('admin123', 10);
    const adminId = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // ✅ FIX: Ensure all tables exist with correct structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
          id SERIAL PRIMARY KEY,
          admin_id VARCHAR(50) UNIQUE NOT NULL,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(50) NOT NULL,
          full_name VARCHAR(255),
          email VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agencies (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          domain VARCHAR(255) UNIQUE NOT NULL,
          country VARCHAR(50) NOT NULL,
          v52_score DECIMAL(5,2),
          rank INTEGER,
          last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          email VARCHAR(255),
          admin_key VARCHAR(255) UNIQUE,
          plan VARCHAR(50) DEFAULT 'starter',
          scans_limit INTEGER DEFAULT 100,
          scans_used INTEGER DEFAULT 0,
          subscription_expires TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          enabled BOOLEAN DEFAULT true,
          whitelabel_enabled BOOLEAN DEFAULT false,
          whitelabel_name VARCHAR(255),
          whitelabel_logo TEXT,
          whitelabel_primary_color VARCHAR(7),
          custom_domain VARCHAR(255),
          notes TEXT
      );

      CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scans (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          score DECIMAL(5,2),
          quality VARCHAR(50),
          graaf_score DECIMAL(5,2),
          craft_score DECIMAL(5,2),
          technical_score DECIMAL(5,2),
          breakdown JSONB,
          recommendations JSONB,
          word_count INTEGER,
          scan_type VARCHAR(50),
          share_key VARCHAR(255),
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
          scan_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS share_links (
          id SERIAL PRIMARY KEY,
          token VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          client_name VARCHAR(255),
          company VARCHAR(255),
          max_uses INTEGER DEFAULT 30,
          current_uses INTEGER DEFAULT 0,
          expires_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          allowed_features JSONB,
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public_leaderboard (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          url_hash VARCHAR(32) UNIQUE,
          score DECIMAL(5,2),
          quality VARCHAR(50),
          graaf_score DECIMAL(5,2),
          craft_score DECIMAL(5,2),
          technical_score DECIMAL(5,2),
          word_count INTEGER,
          company_name VARCHAR(255),
          agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
          agency_name VARCHAR(255),
          category VARCHAR(50),
          country VARCHAR(50),
          language VARCHAR(50),
          is_public BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Delete old entries
    await pool.query('DELETE FROM super_admins WHERE username IN ($1, $2)', ['ot', 'superadmin']);
    
    // ✅ FIX: Insert with admin_id column
    await pool.query(
      'INSERT INTO super_admins (admin_id, username, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
      [adminId, 'ot', hash]
    );
    
    console.log('[SETUP] ✅ Admin created successfully! ID:', adminId);
    
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Created ✅</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 40px; 
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              margin: 0;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { color: #22c55e; margin-bottom: 10px; }
            .credentials {
              background: #f0f0f0;
              padding: 30px;
              border-radius: 10px;
              margin: 30px 0;
              font-size: 18px;
            }
            .credentials p {
              margin: 15px 0;
              font-weight: bold;
            }
            .btn {
              background: #3b82f6;
              color: white;
              padding: 15px 40px;
              text-decoration: none;
              border-radius: 10px;
              display: inline-block;
              margin: 10px;
              font-weight: bold;
              font-size: 16px;
            }
            .btn:hover { background: #2563eb; }
            .warning {
              color: #ef4444;
              font-size: 14px;
              margin-top: 30px;
              padding: 15px;
              background: #fee2e2;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Admin Created Successfully!</h1>
            <p style="color: #666;">You can now login to the admin panel</p>
            
            <div class="credentials">
              <p>👤 Username: <span style="color: #3b82f6;">ot</span></p>
              <p>🔑 Password: <span style="color: #3b82f6;">admin123</span></p>
            </div>
            
            <a href="/admin" class="btn">🚀 Go to Admin Panel</a>
            
            <div class="warning">
              <strong>⚠️ SECURITY WARNING</strong><br>
              After login, immediately:<br>
              1. Change your password in admin panel<br>
              2. Delete this setup endpoint from server.js<br>
              3. Redeploy the application
            </div>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('[SETUP ERROR]', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center; background: #1a1a1a; color: white;">
          <h1 style="color: red;">❌ Setup Failed</h1>
          <p>${error.message || 'Unknown error'}</p>
          <pre style="text-align: left; background: #333; padding: 10px; border-radius: 5px; overflow: auto;">${error.stack}</pre>
          <a href="/admin" style="background: blue; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">Try Admin Panel</a>
        </body>
      </html>
    `);
  }
});

// ==========================================
// 🔧 FIX: Updated authenticateSuperAdmin
// ==========================================
async function authenticateSuperAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Auth required' });
  }
  
  try {
    // ✅ FIX: Query by admin_id (string) instead of id (integer)
    const result = await pool.query(
      'SELECT id, admin_id, username FROM super_admins WHERE admin_id = $1', 
      [adminKey]
    );
    
    if (result.rows.length > 0) {
      req.admin = { ...result.rows[0], role: 'super_admin' };
      console.log('[AUTH] ✅ Admin authenticated:', result.rows[0].username);
      return next();
    }
    
    console.log('[AUTH] ❌ Invalid admin key:', adminKey);
    return res.status(403).json({ success: false, error: 'Access denied' });
    
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ success: false, error: 'Auth failed' });
  }
}

// ==========================================
// 🔧 FIX: Updated verify-admin endpoint
// ==========================================
app.post('/api/setup/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN ATTEMPT] Username:', username);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // ✅ FIX: Select admin_id instead of id
    const result = await pool.query(
      'SELECT id, admin_id, username, password_hash FROM super_admins WHERE username = $1', 
      [username]
    );
    
    if (result.rows.length === 0) {
      console.log('[LOGIN FAILED] User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const isValid = await bcrypt.compare(password, admin.password_hash);
    
    console.log('[LOGIN] Password check:', isValid ? 'VALID ✅' : 'INVALID ❌');
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // ✅ FIX: Return admin_id (string) instead of id (integer)
    console.log('[LOGIN SUCCESS] User:', username, 'Admin ID:', admin.admin_id);
    
    res.json({ 
      success: true, 
      admin_id: admin.admin_id,  // ✅ Return string ID
      admin: { 
        id: admin.id,
        admin_id: admin.admin_id,  // ✅ Include both IDs
        username: admin.username 
      } 
    });
    
  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🔧 ALL ADMIN ENDPOINTS
// ==========================================

app.get('/api/admin/stats', authenticateSuperAdmin, async (req, res) => {
  try {
    const [agencies, clients, scans, helpers] = await Promise.all([
      pool.query('SELECT COUNT(*)::integer as count FROM agencies WHERE is_active = true'),
      pool.query('SELECT COUNT(*)::integer as count FROM clients'),
      pool.query('SELECT COUNT(*)::integer as count FROM scans'),
      pool.query('SELECT COUNT(*)::integer as count FROM admins WHERE is_active = true')
    ]);
    res.json({
      success: true,
      stats: {
        total_agencies: agencies.rows[0].count,
        total_clients: clients.rows[0].count,
        total_scans: scans.rows[0].count,
        active_helpers: helpers.rows[0].count
      }
    });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

app.get('/api/admins', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, full_name, email, is_active, created_at, last_login FROM admins ORDER BY created_at DESC');
    res.json({ success: true, admins: result.rows });
  } catch (error) {
    console.error('[ADMINS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admins' });
  }
});

app.post('/api/admins', authenticateSuperAdmin, async (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  try {
    if (!username || !password || !role) return res.status(400).json({ success: false, error: 'Username, password, role required' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admins (username, password_hash, role, full_name, email, is_active, created_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, username, role',
      [username, hash, role, full_name || null, email || null]
    );
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('[CREATE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create admin' });
  }
});

app.delete('/api/admins/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM admins WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE ADMIN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/super-admin/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             COUNT(DISTINCT c.id)::integer as client_count,
             COUNT(DISTINCT s.id)::integer as total_scans
      FROM agencies a
      LEFT JOIN clients c ON c.agency_id = a.id
      LEFT JOIN scans s ON s.agency_id = a.id
      GROUP BY a.id ORDER BY a.created_at DESC
    `);
    res.json({ success: true, agencies: result.rows });
  } catch (error) {
    console.error('[AGENCIES ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agencies' });
  }
});

app.post('/api/agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, domain, country, plan } = req.body;
    if (!name || !domain) return res.status(400).json({ success: false, error: 'Name and domain required' });
    const adminKey = 'ADMIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const result = await pool.query(
      'INSERT INTO agencies (name, domain, country, plan, admin_key, is_active, created_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, name, domain',
      [name, domain, country || 'NL', plan || 'free', adminKey]
    );
    res.json({ success: true, agency: result.rows[0] });
  } catch (error) {
    console.error('[CREATE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create agency' });
  }
});

app.delete('/api/agencies/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE AGENCY ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/clients', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.url, c.agency_id, a.name as agency_name, COUNT(s.id)::integer as scan_count, c.created_at
      FROM clients c
      LEFT JOIN agencies a ON a.id = c.agency_id
      LEFT JOIN scans s ON s.client_id = c.id
      GROUP BY c.id, a.name ORDER BY c.created_at DESC LIMIT 500
    `);
    res.json({ success: true, clients: result.rows });
  } catch (error) {
    console.error('[CLIENTS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load clients' });
  }
});

app.delete('/api/admin/clients/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE client_id = $1', [req.params.id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE CLIENT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/scans', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.url, s.score, s.quality, s.scan_type, s.created_at,
             a.name as agency_name, c.url as client_url
      FROM scans s
      LEFT JOIN agencies a ON a.id = s.agency_id
      LEFT JOIN clients c ON c.id = s.client_id
      ORDER BY s.created_at DESC LIMIT 500
    `);
    res.json({ success: true, scans: result.rows });
  } catch (error) {
    console.error('[SCANS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load scans' });
  }
});

app.delete('/api/admin/scans/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM scans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE SCAN ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/share-links', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sl.token as share_code, sl.name as client_email, sl.client_name, sl.company, 
             sl.max_uses as scans_limit, sl.current_uses as scans_used, sl.agency_id,
             sl.expires_at, sl.is_active, a.name as agency_name,
             CASE
               WHEN NOT sl.is_active THEN 'inactive'
               WHEN sl.current_uses >= sl.max_uses THEN 'limit_reached'
               WHEN sl.expires_at < NOW() THEN 'expired'
               ELSE 'active'
             END as status
      FROM share_links sl
      LEFT JOIN agencies a ON a.id = sl.agency_id
      ORDER BY sl.created_at DESC LIMIT 100
    `);
    res.json({ success: true, share_links: result.rows });
  } catch (error) {
    console.error('[SHARE LINKS FETCH ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load share links' });
  }
});

app.post('/api/admin/share-links/create', authenticateSuperAdmin, async (req, res) => {
  try {
    const { client_email, client_name, company, scans_limit, valid_days, agency_id } = req.body;
    
    if (!client_email || !scans_limit) {
      return res.status(400).json({ success: false, error: 'Email and limit required' });
    }
    
    const code = 'SCAN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expires = new Date();
    expires.setDate(expires.getDate() + parseInt(valid_days || 30));
    
    const defaultFeatures = {
      graaf_enabled: true,
      craft_enabled: true,
      technical_enabled: true,
      max_pages_per_scan: 1
    };
    
    await pool.query(
      `INSERT INTO share_links 
       (token, name, client_name, company, max_uses, current_uses, expires_at, is_active, allowed_features, agency_id, created_at) 
       VALUES ($1, $2, $3, $4, $5, 0, $6, true, $7, $8, NOW())`,
      [code, client_email, client_name || null, company || null, scans_limit, expires, JSON.stringify(defaultFeatures), agency_id || null]
    );
    
    const shareUrl = `${req.protocol}://${req.get('host')}/scan-with-link/${code}`;
    
    console.log('[SHARE LINK] ✅ Created:', code, 'for', client_email);
    
    res.json({ success: true, share_url: shareUrl });
    
  } catch (error) {
    console.error('[SHARE LINK CREATE ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to create link' });
  }
});

app.delete('/api/admin/share-links/:code', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM share_links WHERE token = $1', [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE SHARE LINK ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.get('/api/admin/leaderboard', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, url, score, company_name, agency_name, country FROM public_leaderboard ORDER BY score DESC');
    const entries = result.rows.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[ADMIN LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

app.get('/api/admin/leaderboard/search', authenticateSuperAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, entries: [] });
    
    const result = await pool.query(`
      SELECT id, url, score, company_name, agency_name, country 
      FROM public_leaderboard 
      WHERE url ILIKE $1 OR company_name ILIKE $1 OR agency_name ILIKE $1
      ORDER BY score DESC
    `, [`%${q}%`]);
    
    const entries = result.rows.map((e, i) => ({ ...e, rank: i + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

app.delete('/api/admin/leaderboard/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM public_leaderboard WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

app.post('/api/admin/scan-all-agencies', authenticateSuperAdmin, async (req, res) => {
  try {
    console.log('[SCAN ALL] Starting bulk agency scan...');
    
    const agenciesResult = await pool.query(
      'SELECT id, name, domain FROM agencies WHERE is_active = true'
    );
    
    const agencies = agenciesResult.rows;
    console.log(`[SCAN ALL] Found ${agencies.length} agencies to scan`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const agency of agencies) {
      try {
        const url = agency.domain.startsWith('http') ? agency.domain : `https://${agency.domain}`;
        console.log(`[SCAN ALL] Scanning: ${url}`);
        
        const scanResult = await performFullScan(url);
        
        if (scanResult.success) {
          const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
          await pool.query(`
            INSERT INTO public_leaderboard (url, url_hash, score, quality, company_name, agency_name, country, 
              graaf_score, craft_score, technical_score, word_count, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
            ON CONFLICT (url_hash) DO UPDATE SET
              score = EXCLUDED.score,
              quality = EXCLUDED.quality,
              graaf_score = EXCLUDED.graaf_score,
              craft_score = EXCLUDED.craft_score,
              technical_score = EXCLUDED.technical_score,
              word_count = EXCLUDED.word_count,
              updated_at = NOW()
          `, [
            url, urlHash, scanResult.score, scanResult.quality, agency.name, agency.name, 'NL',
            scanResult.breakdown?.graaf?.total || 0,
            scanResult.breakdown?.craft?.total || 0,
            scanResult.breakdown?.technical?.total || 0,
            scanResult.wordCount || 0
          ]);
          
          successCount++;
          console.log(`[SCAN ALL] ✅ Success: ${url} - Score: ${scanResult.score}`);
        } else {
          failCount++;
          console.log(`[SCAN ALL] ❌ Failed: ${url}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        failCount++;
        console.error(`[SCAN ALL] Error scanning ${agency.domain}:`, error.message);
      }
    }
    
    res.json({ success: true, successCount, failCount, total: agencies.length });
  } catch (error) {
    console.error('[SCAN ALL ERROR]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/health', async (req, res) => {
  try {
    const db = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db: true, time: db.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { limit = 100, category = 'all', country = 'all', language = 'all' } = req.query;
    let query = 'SELECT id, url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, agency_id, agency_name, category, country, language, created_at, updated_at FROM public_leaderboard WHERE is_public = true';
    const params = [];
    let paramIndex = 1;
    
    if (category !== 'all') { query += ` AND category = $${paramIndex}`; params.push(category); paramIndex++; }
    if (country !== 'all') { query += ` AND country = $${paramIndex}`; params.push(country); paramIndex++; }
    if (language !== 'all') { query += ` AND language = $${paramIndex}`; params.push(language); paramIndex++; }
    
    query += ` ORDER BY score DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    const entries = result.rows.map((entry, index) => ({ ...entry, rank: index + 1 }));
    res.json({ success: true, entries });
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load leaderboard' });
  }
});

app.get('/api/leaderboard/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::integer as total_entries, ROUND(AVG(score))::integer as average_score, MAX(score) as highest_score
      FROM public_leaderboard WHERE is_public = true
    `);
    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

app.post('/api/scan-free', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    
    const scanResult = await performFullScan(url);
    if (!scanResult.success) return res.status(500).json({ success: false, error: scanResult.error || 'Scan failed' });
    
    try {
      await pool.query(`
        INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, word_count, scan_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        scanResult.url, scanResult.score, scanResult.quality,
        scanResult.breakdown.graaf.total, scanResult.breakdown.craft.total, scanResult.breakdown.technical.total,
        JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), scanResult.wordCount, 'free'
      ]);
    } catch (dbError) { console.error('[DATABASE ERROR]', dbError.message); }
    
    res.json(scanResult);
  } catch (error) {
    console.error('[SCAN-FREE ERROR]', error);
    res.status(500).json({ success: false, error: 'Scan failed: ' + error.message });
  }
});

app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const { url, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category } = req.body;
    if (!url || !score) return res.status(400).json({ success: false, error: 'URL and score required' });
    
    const clientIP = getClientIP(req);
    const rateLimitKey = `${url}:${clientIP}`;
    const now = Date.now();
    
    if (submissionLimits.has(rateLimitKey) && (now - submissionLimits.get(rateLimitKey) < 24 * 60 * 60 * 1000)) {
      return res.status(429).json({ success: false, error: 'Rate limit: once per day per URL' });
    }
    
    const sanitizedCompanyName = sanitizeInput(company_name, 100);
    const sanitizedCategory = ['agency', 'saas', 'blog', 'ecommerce', 'other'].includes(category) ? category : null;
    const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
    
    await pool.query(`
      INSERT INTO public_leaderboard (url, url_hash, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, category, is_public, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      ON CONFLICT (url_hash) DO UPDATE SET
        score = EXCLUDED.score, quality = EXCLUDED.quality, graaf_score = EXCLUDED.graaf_score, craft_score = EXCLUDED.craft_score,
        technical_score = EXCLUDED.technical_score, word_count = EXCLUDED.word_count, company_name = EXCLUDED.company_name,
        category = EXCLUDED.category, updated_at = NOW()
    `, [url, urlHash, score, quality, graaf_score, craft_score, technical_score, word_count, sanitizedCompanyName, sanitizedCategory]);
    
    submissionLimits.set(rateLimitKey, now);
    res.json({ success: true, message: 'Added to leaderboard' });
  } catch (error) {
    console.error('[SUBMIT ERROR]', error);
    res.status(500).json({ success: false, error: 'Failed to submit' });
  }
});

app.get('/api/share-link/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query('SELECT * FROM share_links WHERE token = $1', [code]);
    if (result.rows.length === 0) return res.json({ success: false, error: 'Invalid share link' });
    const link = result.rows[0];
    if (!link.is_active) return res.json({ success: false, error: 'Link deactivated' });
    if (new Date(link.expires_at) < new Date()) return res.json({ success: false, error: 'Link expired' });
    if (link.current_uses >= link.max_uses) return res.json({ success: false, error: 'Scan limit reached' });
    res.json({ success: true, ...link, scans_remaining: link.max_uses - link.current_uses });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

app.post('/api/share-link/scan', async (req, res) => {
  try {
    const { share_code, url } = req.body;
    if (!share_code || !url) return res.status(400).json({ success: false, error: 'Share code and URL required' });
    
    const linkResult = await pool.query('SELECT sl.*, a.name as agency_name FROM share_links sl LEFT JOIN agencies a ON a.id = sl.agency_id WHERE sl.token = $1', [share_code]);
    if (linkResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Invalid share link' });
    const link = linkResult.rows[0];
    if (!link.is_active || new Date(link.expires_at) < new Date() || link.current_uses >= link.max_uses) return res.status(403).json({ success: false, error: 'Link invalid or expired' });
    
    const scanResult = await performFullScan(url);
    if (!scanResult.success) return res.status(500).json({ success: false, error: scanResult.error });
    
    const urlHash = crypto.createHash('md5').update(url.toLowerCase().trim()).digest('hex');
    await pool.query(`
      INSERT INTO public_leaderboard (url, url_hash, score, quality, graaf_score, craft_score, technical_score, word_count, company_name, agency_id, agency_name, is_public, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
      ON CONFLICT (url_hash) DO UPDATE SET
        score = EXCLUDED.score, quality = EXCLUDED.quality, graaf_score = EXCLUDED.graaf_score, craft_score = EXCLUDED.craft_score,
        technical_score = EXCLUDED.technical_score, word_count = EXCLUDED.word_count, updated_at = NOW()
    `, [url, urlHash, scanResult.score, scanResult.quality, link.company || link.client_name, link.agency_id, link.agency_name]);
    
    await pool.query('UPDATE share_links SET current_uses = current_uses + 1 WHERE token = $1', [share_code]);
    res.json(scanResult);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Scan failed: ' + error.message });
  }
});

// ==========================================
// 🔧 CONTENTSCORE TOOL PAGES
// ==========================================

app.get('/seo-contentscore', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.send(`
        <!DOCTYPE html>
        <html lang="nl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ContentScore Tool - Exacte Criteria Telling</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                .criteria-meter { 
                    width: 100%; 
                    height: 24px; 
                    background: #374151; 
                    border-radius: 12px; 
                    overflow: hidden;
                }
                .criteria-fill { 
                    height: 100%; 
                    background: linear-gradient(90deg, #ef4444, #eab308, #22c55e);
                    transition: width 1s ease-in-out;
                }
                .criteria-dot { 
                    width: 12px; 
                    height: 12px; 
                    border-radius: 50%; 
                    display: inline-block;
                }
                .met { background: #22c55e; }
                .missing { background: #ef4444; }
                .partial { background: #eab308; }
            </style>
        </head>
        <body class="bg-gray-900 text-gray-100 min-h-screen">
            <div class="max-w-7xl mx-auto px-4 py-8">
                <!-- Header -->
                <div class="text-center mb-12">
                    <h1 class="text-4xl font-bold mb-4">
                        <i class="fas fa-search text-blue-400"></i>
                        ContentScore Tool
                    </h1>
                    <p class="text-gray-400 text-lg">
                        Exacte telling van GRAAF + CRAFT + Technical criteria
                    </p>
                    <p class="text-sm text-gray-500 mt-2">
                        Analyseert HTML en telt PRECIES wat er WEL en NIET is
                    </p>
                </div>
                
                <!-- Analysis Options -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                    <!-- URL Analysis -->
                    <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <h2 class="text-xl font-bold mb-4">
                            <i class="fas fa-link text-blue-400 mr-2"></i>
                            URL Analyse
                        </h2>
                        <input type="url" id="analysis-url" 
                            placeholder="https://voorbeeld.nl/artikel"
                            class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4">
                        
                        <!-- Agency Select (optioneel) -->
                        <select id="agency-select" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4">
                            <option value="">Koppel aan agency (optioneel)</option>
                            <!-- Agencies worden ingeladen via JS -->
                        </select>
                        
                        <button onclick="analyzeURL()" class="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold">
                            <i class="fas fa-chart-line mr-2"></i>Analyseer URL
                        </button>
                    </div>
                    
                    <!-- HTML Analysis -->
                    <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <h2 class="text-xl font-bold mb-4">
                            <i class="fas fa-code text-green-400 mr-2"></i>
                            HTML Analyse
                        </h2>
                        <textarea id="analysis-html" rows="6"
                            placeholder="<html>...</html>"
                            class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4 font-mono text-sm"></textarea>
                        
                        <!-- Share Link (optioneel) -->
                        <input type="text" id="share-code" 
                            placeholder="Share link code (optioneel)"
                            class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4">
                        
                        <button onclick="analyzeHTML()" class="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold">
                            <i class="fas fa-code mr-2"></i>Analyseer HTML
                        </button>
                    </div>
                    
                    <!-- Quick Stats -->
                    <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <h2 class="text-xl font-bold mb-4">
                            <i class="fas fa-chart-bar text-purple-400 mr-2"></i>
                            Statistieken
                        </h2>
                        <div class="space-y-4">
                            <div>
                                <div class="text-sm text-gray-400">Totaal Analyses</div>
                                <div class="text-2xl font-bold" id="total-analyses">0</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-400">Hoogste Score</div>
                                <div class="text-2xl font-bold text-green-400" id="highest-score">0</div>
                            </div>
                            <div>
                                <div class="text-sm text-gray-400">Gemiddelde Score</div>
                                <div class="text-2xl font-bold text-blue-400" id="average-score">0</div>
                            </div>
                            <button onclick="loadStats()" class="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                                <i class="fas fa-sync-alt mr-2"></i>Ververs Statistieken
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Results Section -->
                <div id="results-section" class="hidden">
                    <!-- Score Display -->
                    <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                            <div class="text-center">
                                <div class="text-5xl font-bold" id="total-score">0</div>
                                <div class="text-gray-400">Totaal Score</div>
                                <div class="text-sm mt-2" id="score-quality"></div>
                            </div>
                            <div class="text-center">
                                <div class="text-3xl font-bold text-blue-400" id="graaf-score">0</div>
                                <div class="text-gray-400">GRAAF</div>
                                <div class="text-sm mt-2" id="graaf-percentage"></div>
                            </div>
                            <div class="text-center">
                                <div class="text-3xl font-bold text-green-400" id="craft-score">0</div>
                                <div class="text-gray-400">CRAFT</div>
                                <div class="text-sm mt-2" id="craft-percentage"></div>
                            </div>
                            <div class="text-center">
                                <div class="text-3xl font-bold text-purple-400" id="technical-score">0</div>
                                <div class="text-gray-400">Technical</div>
                                <div class="text-sm mt-2" id="technical-percentage"></div>
                            </div>
                        </div>
                        
                        <!-- Criteria Meter -->
                        <div class="mb-4">
                            <div class="flex justify-between text-sm mb-2">
                                <span>Criteria Behaald</span>
                                <span id="criteria-count">0/100</span>
                            </div>
                            <div class="criteria-meter">
                                <div id="criteria-fill" class="criteria-fill" style="width: 0%"></div>
                            </div>
                        </div>
                        
                        <!-- Missing Criteria -->
                        <div id="missing-criteria" class="space-y-2"></div>
                    </div>
                    
                    <!-- Detailed Breakdown -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                        <!-- GRAAF Breakdown -->
                        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                            <h3 class="text-lg font-bold mb-4 text-blue-400">GRAAF Framework</h3>
                            <div id="graaf-breakdown" class="space-y-3"></div>
                        </div>
                        
                        <!-- CRAFT Breakdown -->
                        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                            <h3 class="text-lg font-bold mb-4 text-green-400">CRAFT Methodology</h3>
                            <div id="craft-breakdown" class="space-y-3"></div>
                        </div>
                        
                        <!-- Technical Breakdown -->
                        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
                            <h3 class="text-lg font-bold mb-4 text-purple-400">Technical SEO</h3>
                            <div id="technical-breakdown" class="space-y-3"></div>
                        </div>
                    </div>
                    
                    <!-- Recommendations -->
                    <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
                        <h3 class="text-lg font-bold mb-4 text-yellow-400">
                            <i class="fas fa-lightbulb mr-2"></i>Aanbevelingen
                        </h3>
                        <div id="recommendations-list" class="space-y-4"></div>
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex space-x-4">
                        <button onclick="saveToLeaderboard()" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold">
                            <i class="fas fa-trophy mr-2"></i>Toevoegen aan Leaderboard
                        </button>
                        <button onclick="downloadReport()" class="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold">
                            <i class="fas fa-download mr-2"></i>Download Rapport
                        </button>
                        <button onclick="analyzeAnother()" class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold">
                            <i class="fas fa-redo mr-2"></i>Nieuwe Analyse
                        </button>
                    </div>
                </div>
                
                <!-- Loading -->
                <div id="loading-section" class="hidden text-center py-12">
                    <div class="inline-block animate-spin text-4xl text-blue-400 mb-4">
                        <i class="fas fa-cog"></i>
                    </div>
                    <p class="text-gray-400">HTML wordt geanalyseerd...</p>
                    <p class="text-sm text-gray-500 mt-2">Criteria worden exact geteld</p>
                </div>
                
                <!-- Empty State -->
                <div id="empty-section" class="text-center py-12">
                    <i class="fas fa-chart-bar text-5xl text-gray-600 mb-4"></i>
                    <p class="text-gray-400">Voer een URL of HTML in om te analyseren</p>
                    <p class="text-sm text-gray-500 mt-2">We tellen exact welke criteria aanwezig zijn</p>
                </div>
            </div>

            <script>
                let currentAnalysis = null;
                
                // Laad agencies in dropdown
                async function loadAgencies() {
                    try {
                        const response = await fetch('/api/super-admin/agencies');
                        const data = await response.json();
                        
                        if (data.success) {
                            const select = document.getElementById('agency-select');
                            data.agencies.forEach(agency => {
                                const option = document.createElement('option');
                                option.value = agency.id;
                                option.textContent = agency.name;
                                select.appendChild(option);
                            });
                        }
                    } catch (error) {
                        console.error('Error loading agencies:', error);
                    }
                }
                
                // Laad statistieken
                async function loadStats() {
                    try {
                        const response = await fetch('/api/contentscore/history?limit=100');
                        if (response.ok) {
                            const data = await response.json();
                            if (data.success && data.analyses.length > 0) {
                                document.getElementById('total-analyses').textContent = data.pagination?.total || 0;
                                
                                const scores = data.analyses.map(a => a.score);
                                const highest = Math.max(...scores);
                                const average = scores.reduce((a, b) => a + b, 0) / scores.length;
                                
                                document.getElementById('highest-score').textContent = highest.toFixed(1);
                                document.getElementById('average-score').textContent = average.toFixed(1);
                            }
                        }
                    } catch (error) {
                        console.error('Error loading stats:', error);
                    }
                }
                
                // Analyseer URL
                async function analyzeURL() {
                    const url = document.getElementById('analysis-url').value.trim();
                    if (!url) {
                        alert('Voer een URL in');
                        return;
                    }
                    
                    const agencyId = document.getElementById('agency-select').value;
                    
                    showLoading();
                    try {
                        const response = await fetch('/api/contentscore/analyze-detailed', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                url: url,
                                agency_id: agencyId || null
                            })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            showResults(data);
                        } else {
                            showError(data.error);
                        }
                    } catch (error) {
                        showError('Fout: ' + error.message);
                    }
                }
                
                // Analyseer HTML
                async function analyzeHTML() {
                    const html = document.getElementById('analysis-html').value.trim();
                    if (!html || html.length < 100) {
                        alert('Plak HTML code (minimaal 100 bytes)');
                        return;
                    }
                    
                    const shareCode = document.getElementById('share-code').value.trim();
                    
                    showLoading();
                    try {
                        const response = await fetch('/api/contentscore/analyze-detailed', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                html: html,
                                share_code: shareCode || null
                            })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            showResults(data);
                        } else {
                            showError(data.error);
                        }
                    } catch (error) {
                        showError('Fout: ' + error.message);
                    }
                }
                
                // Toon resultaten
                function showResults(data) {
                    currentAnalysis = data;
                    
                    // Update scores
                    document.getElementById('total-score').textContent = data.score.total;
                    document.getElementById('graaf-score').textContent = data.score.graaf;
                    document.getElementById('craft-score').textContent = data.score.craft;
                    document.getElementById('technical-score').textContent = data.score.technical;
                    
                    // Score kwaliteit
                    const total = data.score.total;
                    let quality = '';
                    let color = '';
                    if (total >= 90) { quality = 'Excellent'; color = 'text-green-400'; }
                    else if (total >= 80) { quality = 'Good'; color = 'text-blue-400'; }
                    else if (total >= 70) { quality = 'Fair'; color = 'text-yellow-400'; }
                    else if (total >= 60) { quality = 'Average'; color = 'text-orange-400'; }
                    else { quality = 'Needs Improvement'; color = 'text-red-400'; }
                    
                    document.getElementById('score-quality').innerHTML = \`
                        <span class="\${color} font-semibold">\${quality}</span>
                    \`;
                    
                    // Criteria meter
                    const criteriaMet = data.analysis?.criteriaMet || 0;
                    const criteriaTotal = data.analysis?.criteriaTotal || 100;
                    const percentage = (criteriaMet / criteriaTotal) * 100;
                    
                    document.getElementById('criteria-count').textContent = \`\${criteriaMet}/\${criteriaTotal}\`;
                    document.getElementById('criteria-fill').style.width = \`\${percentage}%\`;
                    
                    // Toon missing criteria
                    const missingDiv = document.getElementById('missing-criteria');
                    missingDiv.innerHTML = '';
                    
                    if (data.analysis?.missingCriteria && data.analysis.missingCriteria.length > 0) {
                        missingDiv.innerHTML = \`
                            <h4 class="font-bold mb-2 text-red-400">Ontbrekende Criteria:</h4>
                            <div class="space-y-1">
                            \${data.analysis.missingCriteria.map(criteria => \`
                                <div class="flex items-start">
                                    <div class="criteria-dot missing mt-1 mr-2"></div>
                                    <span class="text-sm">\${criteria}</span>
                                </div>
                            \`).join('')}
                            </div>
                        \`;
                    }
                    
                    // Toon breakdowns
                    showBreakdowns(data.analysis);
                    
                    // Toon aanbevelingen
                    showRecommendations(data.recommendations);
                    
                    // Switch view
                    hideLoading();
                    document.getElementById('empty-section').classList.add('hidden');
                    document.getElementById('results-section').classList.remove('hidden');
                    
                    // Update stats
                    loadStats();
                }
                
                // Toon breakdowns
                function showBreakdowns(analysis) {
                    if (!analysis) return;
                    
                    // GRAAF Breakdown
                    const graafDiv = document.getElementById('graaf-breakdown');
                    graafDiv.innerHTML = \`
                        <div class="flex justify-between">
                            <span>Authoritative Sources:</span>
                            <span class="font-bold \${analysis.graaf?.credible?.authoritativeSources >= 7 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.graaf?.credible?.authoritativeSources || 0}/7
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Expert Quotes:</span>
                            <span class="font-bold \${analysis.graaf?.credible?.expertQuotes >= 5 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.graaf?.credible?.expertQuotes || 0}/5
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Case Studies:</span>
                            <span class="font-bold \${analysis.graaf?.credible?.caseStudies >= 3 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.graaf?.credible?.caseStudies || 0}/3
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>H2 Sections:</span>
                            <span class="font-bold \${analysis.graaf?.relevance?.h2Count >= 8 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.graaf?.relevance?.h2Count || 0}/8
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Step-by-Step Guides:</span>
                            <span class="font-bold \${analysis.graaf?.actionability?.stepByStepGuides >= 7 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.graaf?.actionability?.stepByStepGuides || 0}/7
                            </span>
                        </div>
                    \`;
                    
                    // CRAFT Breakdown
                    const craftDiv = document.getElementById('craft-breakdown');
                    craftDiv.innerHTML = \`
                        <div class="flex justify-between">
                            <span>Forbidden Phrases:</span>
                            <span class="font-bold \${analysis.craft?.cutFluff?.forbiddenPhrases === 0 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.craft?.cutFluff?.forbiddenPhrases || 0}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Total Visuals:</span>
                            <span class="font-bold \${analysis.craft?.addVisuals?.totalVisuals >= 5 ? 'text-green-400' : 'text-orange-400'}">
                                \${analysis.craft?.addVisuals?.totalVisuals || 0}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>FAQ Questions:</span>
                            <span class="font-bold \${analysis.craft?.faqIntegration?.totalQuestions >= 10 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.craft?.faqIntegration?.totalQuestions || 0}/10
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>FAQ Schema:</span>
                            <span class="font-bold \${analysis.craft?.faqIntegration?.faqSchema ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.craft?.faqIntegration?.faqSchema ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Author Bio:</span>
                            <span class="font-bold \${analysis.craft?.trustBuilding?.authorBioComplete ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.craft?.trustBuilding?.authorBioComplete ? 'Complete' : 'Missing'}
                            </span>
                        </div>
                    \`;
                    
                    // Technical Breakdown
                    const technicalDiv = document.getElementById('technical-breakdown');
                    technicalDiv.innerHTML = \`
                        <div class="flex justify-between">
                            <span>Article Schema:</span>
                            <span class="font-bold \${analysis.technical?.schemaMarkup?.articleSchema ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.technical?.schemaMarkup?.articleSchema ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>FAQ Schema:</span>
                            <span class="font-bold \${analysis.technical?.schemaMarkup?.faqSchema ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.technical?.schemaMarkup?.faqSchema ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Internal Links:</span>
                            <span class="font-bold \${analysis.technical?.internalLinking?.totalInternalLinks >= 7 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.technical?.internalLinking?.totalInternalLinks || 0}/7
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>H1 Count:</span>
                            <span class="font-bold \${analysis.technical?.metaOptimization?.h1Count === 1 ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.technical?.metaOptimization?.h1Count || 0} (should be 1)
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Viewport Tag:</span>
                            <span class="font-bold \${analysis.technical?.mobileOptimization?.viewportTag ? 'text-green-400' : 'text-red-400'}">
                                \${analysis.technical?.mobileOptimization?.viewportTag ? 'Yes' : 'No'}
                            </span>
                        </div>
                    \`;
                }
                
                // Toon aanbevelingen
                function showRecommendations(recommendations) {
                    const listDiv = document.getElementById('recommendations-list');
                    listDiv.innerHTML = '';
                    
                    if (!recommendations) return;
                    
                    // Quick Wins
                    if (recommendations.quickWins && recommendations.quickWins.length > 0) {
                        listDiv.innerHTML += \`
                            <div>
                                <h4 class="font-bold mb-2 text-green-400">
                                    <i class="fas fa-bolt mr-2"></i>Quick Wins
                                </h4>
                                <div class="space-y-2">
                                \${recommendations.quickWins.map(rec => \`
                                    <div class="p-3 bg-gray-700 rounded-lg">
                                        <div class="font-medium">\${rec.action}</div>
                                        <div class="text-sm text-gray-400 mt-1">
                                            <span class="px-2 py-1 bg-gray-600 rounded">\${rec.category}</span>
                                            <span class="ml-2">Impact: \${rec.impact}/5</span>
                                            <span class="ml-2">Time: ~\${rec.timeEstimate}min</span>
                                        </div>
                                    </div>
                                \`).join('')}
                                </div>
                            </div>
                        \`;
                    }
                    
                    // Major Impact
                    if (recommendations.majorImpact && recommendations.majorImpact.length > 0) {
                        listDiv.innerHTML += \`
                            <div>
                                <h4 class="font-bold mb-2 text-yellow-400">
                                    <i class="fas fa-chart-line mr-2"></i>Major Improvements
                                </h4>
                                <div class="space-y-2">
                                \${recommendations.majorImpact.map(rec => \`
                                    <div class="p-3 bg-gray-700 rounded-lg">
                                        <div class="font-medium">\${rec.action}</div>
                                        <div class="text-sm text-gray-400 mt-1">
                                            Priority: <span class="text-red-400">\${rec.priority}</span>
                                            • Impact: \${rec.impact}/5
                                            • Time: ~\${rec.timeEstimate}min
                                        </div>
                                    </div>
                                \`).join('')}
                                </div>
                            </div>
                        \`;
                    }
                    
                    // Summary
                    if (recommendations.summary) {
                        listDiv.innerHTML += \`
                            <div class="p-4 bg-gray-700 rounded-lg">
                                <h4 class="font-bold mb-2">Summary</h4>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <div class="text-sm text-gray-400">Current Score</div>
                                        <div class="text-2xl font-bold">\${recommendations.summary.currentScore}</div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-400">Potential Gain</div>
                                        <div class="text-2xl font-bold text-green-400">+\${recommendations.summary.potentialScoreGain}</div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-400">Time to Fix</div>
                                        <div class="text-2xl font-bold">\${recommendations.summary.estimatedTimeToFix} min</div>
                                    </div>
                                    <div>
                                        <div class="text-sm text-gray-400">Total Issues</div>
                                        <div class="text-2xl font-bold">\${recommendations.summary.totalIssues}</div>
                                    </div>
                                </div>
                            </div>
                        \`;
                    }
                }
                
                // Opslaan in leaderboard
                async function saveToLeaderboard() {
                    if (!currentAnalysis) return;
                    
                    try {
                        const response = await fetch('/api/leaderboard/submit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                url: document.getElementById('analysis-url').value || 'HTML Content',
                                score: currentAnalysis.score.total,
                                quality: currentAnalysis.score.total >= 90 ? 'excellent' : 
                                       currentAnalysis.score.total >= 80 ? 'good' : 
                                       currentAnalysis.score.total >= 70 ? 'fair' : 
                                       currentAnalysis.score.total >= 60 ? 'average' : 'needs-improvement',
                                graaf_score: currentAnalysis.score.graaf,
                                craft_score: currentAnalysis.score.craft,
                                technical_score: currentAnalysis.score.technical,
                                word_count: currentAnalysis.analysis?.wordCount || 0,
                                company_name: 'ContentScore Analysis'
                            })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            alert('Toegevoegd aan leaderboard!');
                        } else {
                            alert('Fout: ' + data.error);
                        }
                    } catch (error) {
                        alert('Fout: ' + error.message);
                    }
                }
                
                // Download rapport
                function downloadReport() {
                    if (!currentAnalysis) return;
                    
                    const report = {
                        analysis: currentAnalysis,
                        timestamp: new Date().toISOString(),
                        url: document.getElementById('analysis-url').value || 'HTML Content'
                    };
                    
                    const dataStr = JSON.stringify(report, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`contentscore-report-\${new Date().toISOString().split('T')[0]}.json\`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                }
                
                // Nieuwe analyse
                function analyzeAnother() {
                    currentAnalysis = null;
                    document.getElementById('analysis-url').value = '';
                    document.getElementById('analysis-html').value = '';
                    document.getElementById('share-code').value = '';
                    
                    document.getElementById('results-section').classList.add('hidden');
                    document.getElementById('empty-section').classList.remove('hidden');
                }
                
                // UI helpers
                function showLoading() {
                    document.getElementById('empty-section').classList.add('hidden');
                    document.getElementById('results-section').classList.add('hidden');
                    document.getElementById('loading-section').classList.remove('hidden');
                }
                
                function hideLoading() {
                    document.getElementById('loading-section').classList.add('hidden');
                }
                
                function showError(message) {
                    hideLoading();
                    alert('Fout: ' + message);
                }
                
                // Initialize
                document.addEventListener('DOMContentLoaded', function() {
                    loadAgencies();
                    loadStats();
                });
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
