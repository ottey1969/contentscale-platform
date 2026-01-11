/**
 * VALIDATOR.JS - AI Quality Validator (NOT Scorer)
 * 
 * Purpose: Let Claude validate QUALITY of parsed elements
 * Does NOT count or score - only validates YES/NO
 * Example: "Are these 15 quotes from REAL experts?" → YES/NO
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class ContentValidator {
  constructor(html, parsedData) {
    this.html = html;
    this.parsedData = parsedData;
  }

  async validate() {
    console.log('[VALIDATOR] Starting quality validation...');
    
    try {
      const prompt = this.buildValidationPrompt();
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const validationResult = this.parseValidationResponse(response.content[0].text);
      console.log('[VALIDATOR] ✅ Validation complete');
      
      return validationResult;
      
    } catch (error) {
      console.error('[VALIDATOR] ❌ Error:', error.message);
      return this.getNeutralValidation();
    }
  }

  buildValidationPrompt() {
    return `You are a content quality validator. Your job is to validate the QUALITY of content elements, NOT to count them.

I've already counted these elements programmatically. Now validate if they're HIGH QUALITY or not.

**PARSED DATA:**
${JSON.stringify(this.parsedData, null, 2)}

**YOUR TASK:**
For each category, answer with a quality multiplier (0.5 to 1.0):

# GRAAF Framework Validation

## 1. Genuinely Credible (0.5 - 1.0)
- Are the expert quotes from REAL named experts with credentials?
- Are case studies detailed with specific metrics?
**Quality Multiplier:** [0.5 if low quality, 0.7 if medium, 0.9 if good, 1.0 if excellent]

## 2. Relevance (0.5 - 1.0)
- Do keywords appear naturally (not stuffed)?
**Quality Multiplier:** [0.5-1.0]

## 3. Actionability (0.5 - 1.0)
- Are CTAs clear and specific?
**Quality Multiplier:** [0.5-1.0]

## 4. Accuracy (0.5 - 1.0)
- Are statistics from credible sources?
**Quality Multiplier:** [0.5-1.0]

## 5. Freshness (0.5 - 1.0)
- Is content recently updated (2024-2025)?
**Quality Multiplier:** [0.5-1.0]

# CRAFT Methodology Validation

## 6. Clarity (0.5 - 1.0)
- Is writing clear and concise?
**Quality Multiplier:** [0.5-1.0]

## 7. Readability (0.5 - 1.0)
- Is content scannable?
**Quality Multiplier:** [0.5-1.0]

## 8. Audience Fit (0.5 - 1.0)
- Is tone appropriate?
**Quality Multiplier:** [0.5-1.0]

## 9. Flow (0.5 - 1.0)
- Do sections connect logically?
**Quality Multiplier:** [0.5-1.0]

## 10. Tone (0.5 - 1.0)
- Is tone consistent?
**Quality Multiplier:** [0.5-1.0]

# Technical SEO Validation

## 11. Technical Quality (0.5 - 1.0)
- Are meta tags optimized?
**Quality Multiplier:** [0.5-1.0]

**RESPOND ONLY IN THIS JSON FORMAT (no markdown):**
{
  "graaf": {
    "genuinelyCredible": 0.9,
    "relevance": 0.85,
    "actionability": 0.75,
    "accuracy": 0.9,
    "freshness": 0.8
  },
  "craft": {
    "clarity": 0.85,
    "readability": 0.9,
    "audienceFit": 0.8,
    "flow": 0.75,
    "tone": 0.85
  },
  "technical": {
    "quality": 0.9
  },
  "notes": "Brief explanation"
}`;
  }

  parseValidationResponse(text) {
    try {
      let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const validation = JSON.parse(cleanText);
      this.clampValidation(validation);
      return validation;
    } catch (error) {
      console.error('[VALIDATOR] Failed to parse response:', error.message);
      return this.getNeutralValidation();
    }
  }

  clampValidation(validation) {
    const clamp = (val) => Math.max(0.5, Math.min(1.0, val));
    
    if (validation.graaf) {
      validation.graaf.genuinelyCredible = clamp(validation.graaf.genuinelyCredible || 0.7);
      validation.graaf.relevance = clamp(validation.graaf.relevance || 0.7);
      validation.graaf.actionability = clamp(validation.graaf.actionability || 0.7);
      validation.graaf.accuracy = clamp(validation.graaf.accuracy || 0.7);
      validation.graaf.freshness = clamp(validation.graaf.freshness || 0.7);
    }
    
    if (validation.craft) {
      validation.craft.clarity = clamp(validation.craft.clarity || 0.7);
      validation.craft.readability = clamp(validation.craft.readability || 0.7);
      validation.craft.audienceFit = clamp(validation.craft.audienceFit || 0.7);
      validation.craft.flow = clamp(validation.craft.flow || 0.7);
      validation.craft.tone = clamp(validation.craft.tone || 0.7);
    }
    
    if (validation.technical) {
      validation.technical.quality = clamp(validation.technical.quality || 0.7);
    }
  }

  getNeutralValidation() {
    return {
      graaf: {
        genuinelyCredible: 0.7,
        relevance: 0.7,
        actionability: 0.7,
        accuracy: 0.7,
        freshness: 0.7
      },
      craft: {
        clarity: 0.7,
        readability: 0.7,
        audienceFit: 0.7,
        flow: 0.7,
        tone: 0.7
      },
      technical: {
        quality: 0.7
      },
      notes: "Neutral validation"
    };
  }
}

module.exports = ContentValidator;
