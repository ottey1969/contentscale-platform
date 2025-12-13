// ==========================================
// DETERMINISTIC SCORING ENGINE - HYBRID SYSTEM
// Uses validated counts to calculate final score
// 100% reproducible - same input = same output
// ==========================================

/**
 * Calculate final score from validated counts
 * @param {Object} validatedCounts - Output from claude-validator
 * @param {Object} parserCounts - Raw counts from parser
 * @returns {Object} Score breakdown
 */
function calculateScore(validatedCounts, parserCounts) {
  console.log('🎯 SCORING: Calculating final score...');
  
  // GRAAF Framework (50 points)
  const credibility = calculateCredibility(validatedCounts);
  const relevance = calculateRelevance(parserCounts);
  const actionability = calculateActionability(parserCounts);
  const accuracy = calculateAccuracy(validatedCounts, parserCounts);
  const freshness = calculateFreshness(parserCounts);
  
  const graafTotal = credibility + relevance + actionability + accuracy + freshness;
  
  // CRAFT Framework (30 points)
  const cutFluff = calculateCutFluff(parserCounts);
  const reviewOptimize = calculateReviewOptimize(parserCounts);
  const addVisuals = calculateAddVisuals(parserCounts);
  const faqIntegration = calculateFAQIntegration(validatedCounts, parserCounts);
  const trustBuilding = calculateTrustBuilding(validatedCounts, parserCounts);
  
  const craftTotal = cutFluff + reviewOptimize + addVisuals + faqIntegration + trustBuilding;
  
  // Technical SEO (20 points)
  const metaOptimization = calculateMetaOptimization(parserCounts);
  const schemaMarkup = calculateSchemaMarkup(parserCounts);
  const internalLinking = calculateInternalLinking(parserCounts);
  const headingHierarchy = calculateHeadingHierarchy(parserCounts);
  const mobileOptimization = calculateMobileOptimization(parserCounts);
  
  const technicalTotal = metaOptimization + schemaMarkup + internalLinking + 
                         headingHierarchy + mobileOptimization;
  
  const total = Math.round(graafTotal + craftTotal + technicalTotal);
  
  console.log(`✅ SCORING: Final score ${total}/100 (GRAAF: ${Math.round(graafTotal)}, CRAFT: ${Math.round(craftTotal)}, Technical: ${Math.round(technicalTotal)})`);
  
  return {
    total: total,
    graaf: {
      total: Math.round(graafTotal),
      credibility: Math.round(credibility),
      relevance: Math.round(relevance),
      actionability: Math.round(actionability),
      accuracy: Math.round(accuracy),
      freshness: Math.round(freshness),
    },
    craft: {
      total: Math.round(craftTotal),
      cutFluff: Math.round(cutFluff),
      reviewOptimize: Math.round(reviewOptimize),
      addVisuals: Math.round(addVisuals),
      faqIntegration: Math.round(faqIntegration),
      trustBuilding: Math.round(trustBuilding),
    },
    technical: {
      total: Math.round(technicalTotal),
      metaOptimization: Math.round(metaOptimization),
      schemaMarkup: Math.round(schemaMarkup),
      internalLinking: Math.round(internalLinking),
      headingHierarchy: Math.round(headingHierarchy),
      mobileOptimization: Math.round(mobileOptimization),
    },
  };
}

// =============================================================================
// GRAAF FRAMEWORK (50 POINTS)
// =============================================================================

/**
 * G - Genuinely Credible (10 points)
 */
function calculateCredibility(validated) {
  let score = 0;
  
  // Expert Quotes (0-4 points)
  if (validated.expertQuotes >= 3) score += 4;
  else if (validated.expertQuotes >= 2) score += 3;
  else if (validated.expertQuotes >= 1) score += 2;
  
  // Statistics with sources (0-3 points)
  if (validated.statistics >= 10) score += 3;
  else if (validated.statistics >= 5) score += 2;
  else if (validated.statistics >= 1) score += 1;
  
  // Source citations (0-3 points)
  if (validated.sources >= 5) score += 3;
  else if (validated.sources >= 3) score += 2;
  else if (validated.sources >= 1) score += 1;
  
  return Math.min(score, 10);
}

/**
 * R - Relevance (10 points)
 */
function calculateRelevance(counts) {
  let score = 0;
  
  // Keyword in title (0-3 points)
  // Simplified: check if title length is optimized
  if (counts.metaTitleLength >= 50 && counts.metaTitleLength <= 60) score += 3;
  else if (counts.metaTitleLength >= 40 && counts.metaTitleLength <= 70) score += 2;
  else if (counts.metaTitleLength >= 30) score += 1;
  
  // Meta description (0-3 points)
  if (counts.metaDescLength >= 140 && counts.metaDescLength <= 160) score += 3;
  else if (counts.metaDescLength >= 120 && counts.metaDescLength <= 180) score += 2;
  else if (counts.metaDescLength >= 100) score += 1;
  
  // Keyword density proxy: word count appropriateness (0-3 points)
  if (counts.wordCount >= 1500 && counts.wordCount <= 3000) score += 3;
  else if (counts.wordCount >= 800) score += 2;
  else if (counts.wordCount >= 500) score += 1;
  
  // H2 structure (0-1 point bonus)
  if (counts.h2Count >= 5) score += 1;
  
  return Math.min(score, 10);
}

/**
 * A - Actionability (10 points)
 */
function calculateActionability(counts) {
  let score = 0;
  
  // Lists for step-by-step (0-3 points)
  if (counts.lists >= 5) score += 3;
  else if (counts.lists >= 3) score += 2;
  else if (counts.lists >= 1) score += 1;
  
  // Examples proxy: paragraph count (0-3 points)
  if (counts.paragraphCount >= 20) score += 3;
  else if (counts.paragraphCount >= 10) score += 2;
  else if (counts.paragraphCount >= 5) score += 1;
  
  // Tables as actionable resources (0-3 points)
  if (counts.tables >= 3) score += 3;
  else if (counts.tables >= 1) score += 2;
  
  // Comparison tables bonus (0-1 point)
  if (counts.comparisonTables >= 1) score += 1;
  
  return Math.min(score, 10);
}

/**
 * A - Accuracy (10 points)
 */
function calculateAccuracy(validated, counts) {
  let score = 0;
  
  // Data citations (uses validated statistics) (0-3 points)
  if (validated.statistics >= 5) score += 3;
  else if (validated.statistics >= 3) score += 2;
  else if (validated.statistics >= 1) score += 1;
  
  // Case studies (0-3 points)
  if (validated.caseStudies >= 2) score += 3;
  else if (validated.caseStudies >= 1) score += 2;
  
  // Fact sources (uses validated sources) (0-2 points)
  if (validated.sources >= 3) score += 2;
  else if (validated.sources >= 1) score += 1;
  
  // External links as source proxy (0-2 points)
  if (counts.externalLinks >= 5) score += 2;
  else if (counts.externalLinks >= 2) score += 1;
  
  return Math.min(score, 10);
}

/**
 * F - Freshness (10 points)
 */
function calculateFreshness(counts) {
  let score = 0;
  
  // Word count depth (0-3 points)
  if (counts.wordCount >= 2500) score += 3;
  else if (counts.wordCount >= 1500) score += 2;
  else if (counts.wordCount >= 800) score += 1;
  
  // Images (0-3 points)
  if (counts.images >= 8) score += 3;
  else if (counts.images >= 5) score += 2;
  else if (counts.images >= 2) score += 1;
  
  // Images with alt text (0-3 points)
  if (counts.images > 0) {
    const altRatio = counts.imagesWithAlt / counts.images;
    if (altRatio >= 0.9) score += 3;
    else if (altRatio >= 0.7) score += 2;
    else if (altRatio >= 0.5) score += 1;
  }
  
  // Schema markup (0-1 point bonus)
  if (counts.hasSchema) score += 1;
  
  return Math.min(score, 10);
}

// =============================================================================
// CRAFT FRAMEWORK (30 POINTS)
// =============================================================================

/**
 * C - Cut the Fluff (7 points)
 */
function calculateCutFluff(counts) {
  let score = 0;
  
  // Word count appropriateness (0-3 points)
  if (counts.wordCount >= 1500 && counts.wordCount <= 3500) score += 3;
  else if (counts.wordCount >= 800 && counts.wordCount <= 5000) score += 2;
  else if (counts.wordCount >= 500) score += 1;
  
  // Paragraph structure (0-2 points)
  if (counts.avgParagraphLength >= 40 && counts.avgParagraphLength <= 100) score += 2;
  else if (counts.avgParagraphLength >= 30 && counts.avgParagraphLength <= 150) score += 1;
  
  // Paragraph count indicates good structure (0-2 points)
  if (counts.paragraphCount >= 15) score += 2;
  else if (counts.paragraphCount >= 8) score += 1;
  
  return Math.min(score, 7);
}

/**
 * R - Review & Optimize (8 points)
 */
function calculateReviewOptimize(counts) {
  let score = 0;
  
  // Meta title (0-3 points)
  if (counts.metaTitleLength >= 50 && counts.metaTitleLength <= 60) score += 3;
  else if (counts.metaTitleLength >= 40 && counts.metaTitleLength <= 70) score += 2;
  else if (counts.metaTitleLength >= 30) score += 1;
  
  // Meta description (0-3 points)
  if (counts.metaDescLength >= 140 && counts.metaDescLength <= 160) score += 3;
  else if (counts.metaDescLength >= 120 && counts.metaDescLength <= 180) score += 2;
  else if (counts.metaDescLength >= 100) score += 1;
  
  // H1 presence (0-1 point)
  if (counts.h1Count === 1) score += 1;
  
  // H2 structure (0-1 point)
  if (counts.h2Count >= 5) score += 1;
  
  return Math.min(score, 8);
}

/**
 * A - Add Visuals (6 points)
 */
function calculateAddVisuals(counts) {
  let score = 0;
  
  // Images (0-2 points)
  if (counts.images >= 8) score += 2;
  else if (counts.images >= 4) score += 1;
  
  // Images with alt text (0-2 points)
  if (counts.images > 0 && counts.imagesWithAlt / counts.images >= 0.8) score += 2;
  else if (counts.images > 0 && counts.imagesWithAlt / counts.images >= 0.5) score += 1;
  
  // Tables (0-1 point)
  if (counts.tables >= 1) score += 1;
  
  // Comparison tables (0-1 point)
  if (counts.comparisonTables >= 1) score += 1;
  
  return Math.min(score, 6);
}

/**
 * F - FAQ Integration (5 points)
 */
function calculateFAQIntegration(validated, counts) {
  let score = 0;
  
  // FAQ count (uses validated count) (0-3 points)
  if (validated.faqCount >= 8) score += 3;
  else if (validated.faqCount >= 5) score += 2;
  else if (validated.faqCount >= 3) score += 1;
  
  // FAQ answer quality (0-1 point)
  if (counts.faqAvgWords >= 80) score += 1;
  
  // FAQ schema (0-1 point)
  if (counts.schemaTypes && counts.schemaTypes.includes('FAQPage')) score += 1;
  
  return Math.min(score, 5);
}

/**
 * T - Trust Building (4 points)
 */
function calculateTrustBuilding(validated, counts) {
  let score = 0;
  
  // Expert quotes (uses validated count) (0-2 points)
  if (validated.expertQuotes >= 8) score += 2;
  else if (validated.expertQuotes >= 4) score += 1;
  
  // Case studies (uses validated count) (0-1 point)
  if (validated.caseStudies >= 1) score += 1;
  
  // External authority links (0-1 point)
  if (counts.externalLinks >= 3) score += 1;
  
  return Math.min(score, 4);
}

// =============================================================================
// TECHNICAL SEO (20 POINTS)
// =============================================================================

/**
 * Meta Optimization (4 points)
 */
function calculateMetaOptimization(counts) {
  let score = 0;
  
  // Title (0-2 points)
  if (counts.metaTitleLength >= 50 && counts.metaTitleLength <= 60) score += 2;
  else if (counts.metaTitleLength >= 40 && counts.metaTitleLength <= 70) score += 1;
  
  // Description (0-2 points)
  if (counts.metaDescLength >= 140 && counts.metaDescLength <= 160) score += 2;
  else if (counts.metaDescLength >= 120 && counts.metaDescLength <= 180) score += 1;
  
  return Math.min(score, 4);
}

/**
 * Schema Markup (4 points)
 */
function calculateSchemaMarkup(counts) {
  if (!counts.hasSchema) return 0;
  
  const types = counts.schemaTypes ? counts.schemaTypes.length : 0;
  
  if (types >= 3) return 4;
  if (types >= 2) return 3;
  if (types >= 1) return 2;
  
  return 0;
}

/**
 * Internal Linking (4 points)
 */
function calculateInternalLinking(counts) {
  let score = 0;
  
  if (counts.internalLinks >= 30) score = 4;
  else if (counts.internalLinks >= 20) score = 3;
  else if (counts.internalLinks >= 10) score = 2;
  else if (counts.internalLinks >= 5) score = 1;
  
  return score;
}

/**
 * Heading Hierarchy (4 points)
 */
function calculateHeadingHierarchy(counts) {
  let score = 0;
  
  // Exactly 1 H1 (0-2 points)
  if (counts.h1Count === 1) score += 2;
  else if (counts.h1Count > 0) score += 1;
  
  // Multiple H2s (0-2 points)
  if (counts.h2Count >= 5) score += 2;
  else if (counts.h2Count >= 3) score += 1;
  
  return Math.min(score, 4);
}

/**
 * Mobile Optimization (4 points)
 */
function calculateMobileOptimization(counts) {
  let score = 0;
  
  // Responsive design proxy: proper structure
  if (counts.images > 0 && counts.imagesWithAlt / counts.images >= 0.7) score += 2;
  
  // Readable content: good paragraph structure
  if (counts.avgParagraphLength <= 120) score += 2;
  
  return Math.min(score, 4);
}

// Export
module.exports = {
  calculateScore,
};
