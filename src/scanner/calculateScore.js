/**
 * CALCULATESCORE.JS - Pure Math Scoring (100% Deterministic)
 * 
 * Purpose: Calculate scores using FIXED FORMULAS
 * Input: parsedData (counts) + validation (quality multipliers)
 * Output: Exact same score every time for same input
 * 
 * NO AI - ONLY MATH!
 */

class ScoreCalculator {
  constructor(parsedData, validation) {
    this.parsed = parsedData;
    this.validation = validation;
  }

  // ============================================
  // GRAAF FRAMEWORK SCORING (50 points max)
  // ============================================

  calculateGRAAF() {
    const credibility = this.calculateCredibility();
    const relevance = this.calculateRelevance();
    const actionability = this.calculateActionability();
    const accuracy = this.calculateAccuracy();
    const freshness = this.calculateFreshness();

    const total = Math.min(
      credibility + relevance + actionability + accuracy + freshness,
      50
    );

    return {
      genuinelyCredible: credibility,
      relevance: relevance,
      actionability: actionability,
      accuracy: accuracy,
      freshness: freshness,
      total: Math.round(total * 10) / 10
    };
  }

  calculateCredibility() {
    const data = this.parsed.graaf.genuinelyCredible;
    const quality = this.validation.graaf.genuinelyCredible;

    let score = 0;
    score += Math.min((data.expertQuotes * 2), 4) * quality;
    score += Math.min((data.authorBios * 1.5), 1.5) * quality;
    score += Math.min((data.caseStudies * 1.5), 3) * quality;
    score += Math.min((data.testimonials * 0.3), 1) * quality;
    score += Math.min((data.certifications * 0.4), 0.5) * quality;

    return Math.min(Math.round(score * 10) / 10, 10);
  }

  calculateRelevance() {
    const data = this.parsed.graaf.relevance;
    const quality = this.validation.graaf.relevance;

    let score = 0;
    score += Math.min((data.titleKeywords * 0.5), 5) * quality;
    score += Math.min((data.h2Keywords * 0.4), 3) * quality;
    score += Math.min((data.keywordDensity * 0.2), 2) * quality;

    return Math.min(Math.round(score * 10) / 10, 10);
  }

  calculateActionability() {
    const data = this.parsed.graaf.actionability;
    const quality = this.validation.graaf.actionability;

    let score = 0;
    score += Math.min((data.ctaButtons * 0.5), 5) * quality;
    score += Math.min((data.nextSteps * 1), 2.5) * quality;
    score += Math.min((data.howToSections * 0.5), 2.5) * quality;

    return Math.min(Math.round(score * 10) / 10, 10);
  }

  calculateAccuracy() {
    const data = this.parsed.graaf.accuracy;
    const quality = this.validation.graaf.accuracy;

    let score = 0;
    score += Math.min((data.statistics * 0.5), 5) * quality;
    score += Math.min((data.citations * 0.3), 3) * quality;
    score += Math.min((data.dates * 0.4), 2) * quality;

    return Math.min(Math.round(score * 10) / 10, 10);
  }

  calculateFreshness() {
    const data = this.parsed.graaf.freshness;
    const quality = this.validation.graaf.freshness;

    let score = 0;
    score += Math.min((data.recentDates * 0.7), 7) * quality;
    score += Math.min((data.updatedIndicators * 0.6), 3) * quality;

    return Math.min(Math.round(score * 10) / 10, 10);
  }

  // ============================================
  // CRAFT METHODOLOGY SCORING (30 points max)
  // ============================================

  calculateCRAFT() {
    const clarity = this.calculateClarity();
    const readability = this.calculateReadability();
    const audienceFit = this.calculateAudienceFit();
    const flow = this.calculateFlow();
    const tone = this.calculateTone();

    const total = Math.min(
      clarity + readability + audienceFit + flow + tone,
      30
    );

    return {
      clarity: clarity,
      readability: readability,
      audienceFit: audienceFit,
      flow: flow,
      tone: tone,
      total: Math.round(total * 10) / 10
    };
  }

  calculateClarity() {
    const data = this.parsed.craft.clarity;
    const quality = this.validation.craft.clarity;

    let score = 0;
    const avgSentence = data.avgSentenceLength;
    if (avgSentence >= 15 && avgSentence <= 25) {
      score += 3 * quality;
    } else if (avgSentence >= 10 && avgSentence < 15) {
      score += 2 * quality;
    } else if (avgSentence >= 25 && avgSentence <= 30) {
      score += 2 * quality;
    } else {
      score += 1 * quality;
    }

    score += Math.min((data.shortParagraphs * 0.3), 3) * quality;

    return Math.min(Math.round(score * 10) / 10, 6);
  }

  calculateReadability() {
    const data = this.parsed.craft.readability;
    const quality = this.validation.craft.readability;

    let score = 0;
    const wordCount = data.wordCount;
    if (wordCount >= 1500 && wordCount <= 3000) {
      score += 4 * quality;
    } else if (wordCount >= 1000 && wordCount < 1500) {
      score += 3 * quality;
    } else if (wordCount > 3000 && wordCount <= 4000) {
      score += 3 * quality;
    } else if (wordCount >= 500 && wordCount < 1000) {
      score += 2 * quality;
    } else {
      score += 1 * quality;
    }

    score += Math.min((data.listCount * 0.2), 2) * quality;

    return Math.min(Math.round(score * 10) / 10, 6);
  }

  calculateAudienceFit() {
    const data = this.parsed.craft.audienceFit;
    const quality = this.validation.craft.audienceFit;

    let score = 0;
    score += Math.min((data.technicalTerms * 0.1), 2) * quality;

    if (data.jargonCount >= 5 && data.jargonCount <= 15) {
      score += 4 * quality;
    } else if (data.jargonCount < 5) {
      score += 3 * quality;
    } else if (data.jargonCount > 15 && data.jargonCount <= 25) {
      score += 2 * quality;
    } else {
      score += 1 * quality;
    }

    return Math.min(Math.round(score * 10) / 10, 6);
  }

  calculateFlow() {
    const data = this.parsed.craft.flow;
    const quality = this.validation.craft.flow;

    let score = 0;
    score += Math.min((data.transitionWords * 0.4), 4) * quality;
    score += Math.min((data.internalLinks * 0.13), 2) * quality;

    return Math.min(Math.round(score * 10) / 10, 6);
  }

  calculateTone() {
    const data = this.parsed.craft.tone;
    const quality = this.validation.craft.tone;

    let score = 0;
    score += Math.min((data.positiveWords * 0.1), 2) * quality;
    score += Math.min((data.professionalWords * 0.13), 4) * quality;

    return Math.min(Math.round(score * 10) / 10, 6);
  }

  // ============================================
  // TECHNICAL SEO SCORING (20 points max)
  // ============================================

  calculateTechnical() {
    const data = this.parsed.technical;
    const quality = this.validation.technical.quality;

    let score = 0;
    score += this.scoreMetaTags(data.metaTags) * quality;
    score += this.scoreHeadings(data.headings) * quality;
    score += this.scoreSchema(data.schema) * quality;
    score += this.scoreImages(data.images) * quality;

    return {
      metaTags: this.scoreMetaTags(data.metaTags),
      headings: this.scoreHeadings(data.headings),
      schema: this.scoreSchema(data.schema),
      images: this.scoreImages(data.images),
      total: Math.min(Math.round(score * 10) / 10, 20)
    };
  }

  scoreMetaTags(meta) {
    let score = 0;

    if (meta.hasTitle) {
      if (meta.titleLength >= 50 && meta.titleLength <= 60) {
        score += 3;
      } else if (meta.titleLength >= 40 && meta.titleLength < 50) {
        score += 2;
      } else if (meta.titleLength > 60 && meta.titleLength <= 70) {
        score += 2;
      } else {
        score += 1;
      }
    }

    if (meta.hasDescription) {
      if (meta.descriptionLength >= 150 && meta.descriptionLength <= 160) {
        score += 3;
      } else if (meta.descriptionLength >= 120 && meta.descriptionLength < 150) {
        score += 2;
      } else if (meta.descriptionLength > 160 && meta.descriptionLength <= 180) {
        score += 2;
      } else {
        score += 1;
      }
    }

    if (meta.hasOgTitle) score += 1;
    if (meta.hasOgDescription) score += 1;

    return Math.min(score, 8);
  }

  scoreHeadings(headings) {
    let score = 0;

    if (headings.h1Count === 1) {
      score += 2;
    } else if (headings.h1Count === 0 || headings.h1Count === 2) {
      score += 1;
    }

    if (headings.h2Count >= 3 && headings.h2Count <= 8) {
      score += 2;
    } else if (headings.h2Count >= 2 && headings.h2Count < 3) {
      score += 1.5;
    } else if (headings.h2Count > 8) {
      score += 1;
    }

    if (headings.h3Count >= 2) {
      score += 1;
    } else if (headings.h3Count === 1) {
      score += 0.5;
    }

    return Math.min(score, 5);
  }

  scoreSchema(schema) {
    let score = 0;

    if (schema.hasSchema) {
      score += 2;
    }

    if (schema.schemaCount >= 2) {
      score += 2;
    } else if (schema.schemaCount === 1) {
      score += 1;
    }

    return Math.min(score, 4);
  }

  scoreImages(images) {
    let score = 0;

    if (images.altPercentage === 100) {
      score += 3;
    } else if (images.altPercentage >= 80) {
      score += 2;
    } else if (images.altPercentage >= 50) {
      score += 1;
    }

    return Math.min(score, 3);
  }

  // ============================================
  // TOTAL SCORE & QUALITY
  // ============================================

  calculate() {
    const graaf = this.calculateGRAAF();
    const craft = this.calculateCRAFT();
    const technical = this.calculateTechnical();

    const totalScore = Math.round((graaf.total + craft.total + technical.total) * 10) / 10;

    let quality = 'poor';
    if (totalScore >= 90) quality = 'excellent';
    else if (totalScore >= 75) quality = 'good';
    else if (totalScore >= 60) quality = 'fair';

    return {
      score: totalScore,
      quality: quality,
      breakdown: {
        graaf: graaf,
        craft: craft,
        technical: technical
      }
    };
  }
}

module.exports = ScoreCalculator;
