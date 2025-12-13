// ==========================================
// HYBRID SYSTEM TEST SCRIPT
// Tests the 3-step pipeline with example data
// ==========================================

const { parseContent } = require('./content-parser-HYBRID');
const { calculateScore } = require('./deterministic-scoring-HYBRID');

/**
 * Test with mock HTML content
 */
function testHybridSystem() {
  console.log('🧪 TESTING HYBRID SYSTEM\n');
  
  // Mock HTML content
  const mockHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Ultimate SEO Guide 2025 - Complete Strategy</title>
  <meta name="description" content="Learn proven SEO strategies for 2025. Expert insights, case studies, and actionable tips to boost your rankings and organic traffic by 300%.">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Ultimate SEO Guide 2025"
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": []
  }
  </script>
</head>
<body>
  <h1>Ultimate SEO Guide 2025</h1>
  
  <p>SEO continues to evolve in 2025. According to a recent study by HubSpot, 78% of marketers now use AI tools for content optimization (Source: HubSpot 2024). This represents a 45% increase from 2023.</p>
  
  <blockquote>
    "AI will fundamentally transform how we approach SEO by the end of 2025" - Rand Fishkin, Founder of Moz and SparkToro
  </blockquote>
  
  <h2>Case Study: Company X</h2>
  <p>Our client Company X saw a 312% increase in organic traffic within 6 months using our GRAAF Framework. Their revenue increased from €500K to €1.8M annually.</p>
  
  <h2>Expert Insights</h2>
  <blockquote>
    "Content quality matters more than ever in 2025" - John Mueller, Google Search Advocate
  </blockquote>
  
  <p>"Focus on user intent first, keywords second" - Marie Haynes, SEO Consultant</p>
  
  <h2>Statistics</h2>
  <ul>
    <li>67% of clicks go to the first 5 results (Backlinko, 2024)</li>
    <li>Mobile searches account for 3.5 billion queries per day</li>
    <li>Voice search will represent 50% of all searches by 2026 (Gartner)</li>
  </ul>
  
  <h2>FAQ</h2>
  
  <h3>What is SEO in 2025?</h3>
  <p>SEO in 2025 focuses on creating genuinely helpful content that matches user intent. With AI Overviews, quality signals like E-E-A-T are more important than ever. Google prioritizes content from experts with demonstrated credentials and real-world experience in their field.</p>
  
  <h3>How long does SEO take?</h3>
  <p>SEO typically takes 3-6 months to show significant results. However, with our GRAAF Framework approach, many clients see initial improvements within 4-8 weeks. The timeline depends on your industry competition, current website authority, and content quality.</p>
  
  <h3>What are the most important ranking factors?</h3>
  <p>The top ranking factors in 2025 are content quality, user experience signals, E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness), mobile optimization, and page speed. Backlinks remain important but quality over quantity is crucial.</p>
  
  <h3>How much does SEO cost?</h3>
  <p>SEO costs vary widely from €500/month for basic services to €5000+ for enterprise solutions. At ContentScale, we offer specialized traffic recovery from €997 as a one-time project, with typical ROI of 5-10x within the first year.</p>
  
  <img src="chart.png" alt="SEO traffic growth chart showing 300% increase">
  <img src="rankings.png" alt="Keyword rankings improvement dashboard">
  
  <table>
    <tr><th>Before</th><th>After</th><th>Improvement</th></tr>
    <tr><td>1,200 visitors/mo</td><td>5,800 visitors/mo</td><td>+383%</td></tr>
  </table>
  
  <a href="/blog">Read more articles</a>
  <a href="/case-studies">View case studies</a>
  <a href="/services">Our services</a>
</body>
</html>
  `;
  
  // STEP 1: Parse content
  console.log('STEP 1: PARSER (Deterministic)');
  console.log('─'.repeat(60));
  const parserOutput = parseContent(mockHTML, 'https://example.com/guide');
  
  console.log(`Detected:`);
  console.log(`  • Expert Quotes: ${parserOutput.counts.expertQuotes}`);
  console.log(`  • Statistics: ${parserOutput.counts.statistics}`);
  console.log(`  • Case Studies: ${parserOutput.counts.caseStudies}`);
  console.log(`  • FAQ Questions: ${parserOutput.counts.faqCount}`);
  console.log(`  • Word Count: ${parserOutput.counts.wordCount}`);
  console.log(`  • Internal Links: ${parserOutput.counts.internalLinks}`);
  console.log(`  • Images: ${parserOutput.counts.images}`);
  console.log(`  • Schema Types: ${parserOutput.counts.schemaTypes.join(', ')}`);
  
  console.log(`\nSnippets for validation:`);
  console.log(`  • Expert Quotes: ${parserOutput.snippets.expertQuotes.length} snippets`);
  console.log(`  • Statistics: ${parserOutput.snippets.statistics.length} snippets`);
  console.log(`  • FAQ: ${parserOutput.snippets.faqQuestions.length} questions`);
  
  // STEP 2: Simulate Claude validation
  console.log(`\n\nSTEP 2: CLAUDE VALIDATION (Quality Control)`);
  console.log('─'.repeat(60));
  console.log('Simulating Claude validation...\n');
  
  // Mock validation (in production, this comes from claude-validator)
  const mockValidation = {
    expertQuotes: 3, // Validated 3 out of 3 (all have names + titles)
    statistics: 3,   // Validated 3 out of 5 (3 have sources)
    sources: 5,      // 5 citations detected
    caseStudies: 1,  // 1 case study with concrete metrics
    faqCount: 4,     // All 4 FAQ have substantial answers
    rejections: {
      statistics: [
        {index: 3, reason: "No source citation"},
        {index: 4, reason: "Generic claim without data"}
      ]
    }
  };
  
  console.log(`Validated:`);
  console.log(`  • Expert Quotes: ${mockValidation.expertQuotes}/${parserOutput.counts.expertQuotes} ✅`);
  console.log(`  • Statistics: ${mockValidation.statistics}/${parserOutput.counts.statistics} (2 rejected)`);
  console.log(`  • Case Studies: ${mockValidation.caseStudies}/${parserOutput.counts.caseStudies} ✅`);
  console.log(`  • FAQ: ${mockValidation.faqCount}/${parserOutput.counts.faqCount} ✅`);
  
  console.log(`\nRejections:`);
  mockValidation.rejections.statistics.forEach(r => {
    console.log(`  • Statistic ${r.index}: ${r.reason}`);
  });
  
  // STEP 3: Calculate score
  console.log(`\n\nSTEP 3: DETERMINISTIC SCORING`);
  console.log('─'.repeat(60));
  const score = calculateScore(mockValidation, parserOutput.counts);
  
  console.log(`\nFINAL SCORE: ${score.total}/100\n`);
  console.log(`GRAAF Framework: ${score.graaf.total}/50`);
  console.log(`  • Credibility: ${score.graaf.credibility}/10`);
  console.log(`  • Relevance: ${score.graaf.relevance}/10`);
  console.log(`  • Actionability: ${score.graaf.actionability}/10`);
  console.log(`  • Accuracy: ${score.graaf.accuracy}/10`);
  console.log(`  • Freshness: ${score.graaf.freshness}/10`);
  
  console.log(`\nCRAFT Framework: ${score.craft.total}/30`);
  console.log(`  • Cut Fluff: ${score.craft.cutFluff}/7`);
  console.log(`  • Review: ${score.craft.reviewOptimize}/8`);
  console.log(`  • Visuals: ${score.craft.addVisuals}/6`);
  console.log(`  • FAQ: ${score.craft.faqIntegration}/5`);
  console.log(`  • Trust: ${score.craft.trustBuilding}/4`);
  
  console.log(`\nTechnical SEO: ${score.technical.total}/20`);
  console.log(`  • Meta: ${score.technical.metaOptimization}/4`);
  console.log(`  • Schema: ${score.technical.schemaMarkup}/4`);
  console.log(`  • Links: ${score.technical.internalLinking}/4`);
  console.log(`  • Hierarchy: ${score.technical.headingHierarchy}/4`);
  console.log(`  • Mobile: ${score.technical.mobileOptimization}/4`);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ HYBRID SYSTEM TEST COMPLETE!`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run test
testHybridSystem();
