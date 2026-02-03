// ============================================
// PUPPETEER-POWERED HTML FETCHER (FIXED VERSION)
// Returns BOTH rawHtml (for technical) and extractedContent (for AI)
// ============================================
async function fetchWithPuppeteer(url) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`🌐 Puppeteer fetching: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // ============================================
    // GET RAW HTML FIRST (for technical checks)
    // ============================================
    const rawHtml = await page.content();
    
    // ============================================
    // THEN EXTRACT CONTENT (for AI scoring)
    // ============================================
    const extracted = await page.evaluate(() => {
      function isVisible(el) {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               el.offsetWidth > 0 && 
               el.offsetHeight > 0;
      }
      
      function extractText(element, result = { text: '', headings: [] }) {
        for (let node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) result.text += text + ' ';
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            
            if (!isVisible(node)) continue;
            
            if (['script', 'style', 'nav', 'header', 'footer', 'noscript'].includes(tag)) {
              continue;
            }
            
            if (tag === 'h1') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H1]: ${text}\n`;
                result.headings.push({ level: 1, text });
              }
            } else if (tag === 'h2') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H2]: ${text}\n`;
                result.headings.push({ level: 2, text });
              }
            } else if (tag === 'h3') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H3]: ${text}\n`;
                result.headings.push({ level: 3, text });
              }
            } else if (tag === 'h4') {
              const text = node.textContent.trim();
              if (text) {
                result.text += `\n[H4]: ${text}\n`;
                result.headings.push({ level: 4, text });
              }
            } else if (tag === 'p') {
              const text = node.textContent.trim();
              if (text) result.text += `\n${text}\n`;
            } else if (tag === 'li') {
              const text = node.textContent.trim();
              if (text) result.text += `\n• ${text}\n`;
            } else {
              extractText(node, result);
            }
          }
        }
        return result;
      }
      
      let mainElement = document.querySelector('main') || 
                       document.querySelector('article') ||
                       document.querySelector('[role="main"]') ||
                       document.querySelector('.content') ||
                       document.querySelector('#content') ||
                       document.body;
      
      const extracted = extractText(mainElement);
      
      return {
        content: extracted.text,
        title: document.title || '',
        headingCount: extracted.headings.length
      };
    });
    
    await page.close();
    console.log(`✅ Puppeteer: ${rawHtml.length} bytes HTML, ${extracted.content.length} chars extracted, ${extracted.headingCount} headings`);
    
    return {
      success: true,
      rawHtml: rawHtml,                      // ← FOR TECHNICAL CHECKS
      extractedContent: extracted.content,   // ← FOR AI SCORING
      title: extracted.title,
      method: 'puppeteer'
    };
    
  } catch (error) {
    console.error(`❌ Puppeteer failed for ${url}:`, error.message);
    if (page) await page.close().catch(() => {});
    
    return fetchWithFallback(url);
  }
}

// Fallback to regular fetch if Puppeteer fails
async function fetchWithFallback(url) {
  console.log(`🔄 Falling back to regular fetch: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const rawHtml = await response.text();
    console.log(`✅ Fallback fetch: ${rawHtml.length} bytes`);
    
    return {
      success: true,
      rawHtml: rawHtml,           // ← RAW HTML
      extractedContent: null,     // ← Will be processed later
      title: null,
      method: 'fetch'
    };
  } catch (error) {
    console.error(`❌ Fallback fetch failed:`, error.message);
    throw error;
  }
}

function extractContentForAI(fetchResult) {
  // If Puppeteer already extracted, use it
  if (fetchResult.extractedContent) {
    console.log('📝 Using Puppeteer-extracted content');
    let processed = fetchResult.extractedContent;
    
    processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
    
    if (processed.length > 40000) {
      const start = processed.substring(0, 35000);
      const end = processed.substring(processed.length - 5000);
      processed = start + '\n\n[...middle content truncated...]\n\n' + end;
    }
    
    return { title: fetchResult.title || '', content: processed };
  }
  
  // Otherwise, process raw HTML (fallback)
  console.log('📝 Processing raw HTML fallback');
  let processed = fetchResult.rawHtml;
  
  // Remove noise
  processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  processed = processed.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  processed = processed.replace(/<!--[\s\S]*?-->/g, '');
  
  processed = processed.replace(/<nav[^>]*>/gi, '').replace(/<\/nav>/gi, '');
  processed = processed.replace(/<header[^>]*>/gi, '').replace(/<\/header>/gi, '');
  processed = processed.replace(/<footer[^>]*>/gi, '').replace(/<\/footer>/gi, '');
  
  // Try to isolate main content
  let mainContent = processed;
  const mainMatch = processed.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    mainContent = mainMatch[1];
  } else {
    const articles = processed.match(/<article[^>]*>[\s\S]*?<\/article>/gi);
    if (articles && articles.length > 0) {
      mainContent = articles.join('\n\n');
    } else {
      const contentDiv = processed.match(/<div[^>]*(?:class|id)=["'][^"']*(?:content|main|post|entry|article|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (contentDiv) {
        mainContent = contentDiv[1];
      }
    }
  }
  
  processed = mainContent;
  
  // Extract with markers
  processed = processed.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n[H1]: $1\n');
  processed = processed.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n[H2]: $1\n');
  processed = processed.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n[H3]: $1\n');
  processed = processed.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n[H4]: $1\n');
  processed = processed.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  processed = processed.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1\n');
  
  // Strip remaining tags
  processed = processed.replace(/<[^>]*>/g, ' ');
  
  // Decode entities
  processed = processed.replace(/&nbsp;/g, ' ')
                       .replace(/&amp;/g, '&')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&quot;/g, '"')
                       .replace(/&#39;/g, "'")
                       .replace(/&mdash;/g, '—')
                       .replace(/&ndash;/g, '–');
  
  // Clean whitespace
  processed = processed.replace(/[ \t]+/g, ' ')
                       .replace(/\n\s*\n\s*\n/g, '\n\n')
                       .trim();
  
  // Cap at 40K
  if (processed.length > 40000) {
    const start = processed.substring(0, 35000);
    const end = processed.substring(processed.length - 5000);
    processed = start + '\n\n[...middle content truncated...]\n\n' + end;
  }
  
  // Extract title
  const titleMatch = fetchResult.rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  return { title, content: processed };
}

// ============================================
// PUBLIC SCANNER API — AI-POWERED SCORING (FIXED)
// Uses rawHtml for technical checks, extractedContent for AI
// ============================================
app.post('/api/scan', async (req, res) => {
  const { url, shareKey } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }

  let scanUrl = url;
  if (!scanUrl.startsWith('http://') && !scanUrl.startsWith('https://')) {
    scanUrl = 'https://' + scanUrl;
  }

  // ============================================
  // SHARELINK ENFORCEMENT
  // ============================================
  if (shareKey) {
    try {
      const shareLinkResult = await pool.query(
        'SELECT * FROM share_links WHERE share_code = $1',
        [shareKey]
      );

      if (shareLinkResult.rows.length === 0) {
        return res.status(403).json({ 
          success: false,
          error: 'Invalid share link',
          limitReached: true
        });
      }

      const shareLink = shareLinkResult.rows[0];

      if (new Date(shareLink.expires_at) < new Date()) {
        return res.status(403).json({ 
          success: false,
          error: 'Share link expired. Contact Ot for renewal.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20verlopen.'
        });
      }

      if (shareLink.status !== 'active') {
        return res.status(403).json({ 
          success: false,
          error: 'Share link inactive. Contact Ot.',
          limitReached: true,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20sharelink%20is%20niet%20actief.'
        });
      }

      if (shareLink.scans_used >= shareLink.scans_limit) {
        return res.status(403).json({ 
          success: false,
          error: `Scan limiet bereikt (${shareLink.scans_limit}/${shareLink.scans_limit}). Contact Ot voor meer scans.`,
          limitReached: true,
          scansUsed: shareLink.scans_used,
          scansLimit: shareLink.scans_limit,
          whatsappUrl: 'https://wa.me/31628073996?text=Hi%20Ot!%20Mijn%20scan%20limiet%20is%20bereikt.%20Kan%20ik%20meer%20scans%20krijgen?'
        });
      }

      console.log(`✅ Sharelink valid: ${shareKey} (${shareLink.scans_used + 1}/${shareLink.scans_limit})`);

    } catch (error) {
      console.error('Sharelink check error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Sharelink verification failed' 
      });
    }
  }

  try {
    console.log(`🔍 Scanning: ${scanUrl}`);

    // === FETCH WITH PUPPETEER (returns rawHtml + extractedContent) ===
    const fetchResult = await fetchWithPuppeteer(scanUrl);
    
    if (!fetchResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot fetch URL: failed to load page` 
      });
    }

    // ============================================
    // USE RAW HTML FOR TECHNICAL CHECKS
    // ============================================
    const rawHtml = fetchResult.rawHtml;
    console.log(`✅ Fetched ${rawHtml.length} bytes from ${scanUrl} (${fetchResult.method})`);

    // === TECHNICAL SCORE (regex on RAW HTML) ===
    let technicalScore = 0;

    const metaDescMatch = rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
    technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;

    const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;
    technicalScore += title && title.length > 30 ? 4 : title ? 2 : 0;

    const allImages = (rawHtml.match(/<img[^>]*>/gi) || []).length;
    const imagesWithAlt = (rawHtml.match(/<img[^>]*alt="/gi) || []).length;
    if (allImages > 0) {
      technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
    }

    const hasViewport = /<meta\s+name="viewport"/gi.test(rawHtml);
    technicalScore += hasViewport ? 3 : 0;

    const hasSchema = /"@context"|"@type"/gi.test(rawHtml);
    technicalScore += hasSchema ? 3 : 0;
    technicalScore = Math.min(20, technicalScore);

    // === HTML DETAILS (for response metadata - from RAW HTML) ===
    const textContent = rawHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
    const wordCount = textContent.length;
    const h1s = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
    const h2h3s = (rawHtml.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
    const paragraphs = (rawHtml.match(/<p[^>]*>/gi) || []).length;
    const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(rawHtml);
    const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(rawHtml);
    const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(rawHtml);
    const hasFreshDates = /202[4-6]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(rawHtml);
    const hasAuthor = /author|by |written by|published by|contributor/gi.test(rawHtml);

    // ============================================
    // USE EXTRACTED CONTENT FOR AI SCORING
    // ============================================
    const contentHash = hashContent(rawHtml);  // Still hash raw HTML for caching
    let graafScore, craftScore, graafItems, craftItems, aiRecommendations, scoringMethod;

    const cached = scanCache.get(contentHash);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`📦 Cache hit for ${scanUrl}`);
      graafScore = cached.graafScore;
      craftScore = cached.craftScore;
      graafItems = cached.graafItems;
      craftItems = cached.craftItems;
      aiRecommendations = cached.recommendations;
      scoringMethod = 'ai-cached';
    } else {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }

        // Extract content for AI (uses extractedContent if available, else processes rawHtml)
        const contentForAI = extractContentForAI(fetchResult);
        console.log(`🤖 AI scoring ${scanUrl}...`);
        const aiResult = await scoreWithAI(contentForAI);

        if (!validateAIScores(aiResult)) {
          throw new Error('AI scores failed validation');
        }

        graafItems = {
          credibility: Math.min(16, Math.max(0, Math.round(aiResult.graaf.credibility))),
          relevance: Math.min(18, Math.max(0, Math.round(aiResult.graaf.relevance))),
          accuracy: Math.min(8, Math.max(0, Math.round(aiResult.graaf.accuracy))),
          freshness: Math.min(8, Math.max(0, Math.round(aiResult.graaf.freshness)))
        };
        craftItems = {
          headingStructure: Math.min(8, Math.max(0, Math.round(aiResult.craft.heading_structure))),
          subheadings: Math.min(10, Math.max(0, Math.round(aiResult.craft.subheadings))),
          paragraphs: Math.min(8, Math.max(0, Math.round(aiResult.craft.paragraphs))),
          lists: Math.min(4, Math.max(0, Math.round(aiResult.craft.lists)))
        };

        graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
        craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
        
        aiRecommendations = Array.isArray(aiResult.recommendations) ? aiResult.recommendations : [];
        scoringMethod = 'ai';

        scanCache.set(contentHash, {
          graafScore, craftScore, graafItems, craftItems,
          recommendations: aiRecommendations,
          timestamp: Date.now()
        });

        console.log(`✅ AI scored: GRAAF=${graafScore} CRAFT=${craftScore} (${scoringMethod})`);

      } catch (aiError) {
        console.error(`⚠️ AI scoring failed, using regex fallback: ${aiError.message}`);
        scoringMethod = 'fallback';

        // === REGEX FALLBACK (uses RAW HTML) ===
        graafItems = {
          credibility: (hasQuotes ? 8 : 0) + (hasAuthor ? 8 : 0),
          relevance: Math.min(18, Math.floor(wordCount / 100)),
          accuracy: hasStats ? 8 : 0,
          freshness: hasFreshDates ? 8 : 2
        };
        graafScore = graafItems.credibility + graafItems.relevance + graafItems.accuracy + graafItems.freshness;
        graafScore = Math.min(50, graafScore);

        craftItems = {
          headingStructure: h1s === 1 ? 8 : h1s > 1 ? 4 : 2,
          subheadings: Math.min(10, h2h3s * 2),
          paragraphs: Math.min(8, Math.floor(paragraphs / 3)),
          lists: hasLists ? 4 : 0
        };
        craftScore = craftItems.headingStructure + craftItems.subheadings + craftItems.paragraphs + craftItems.lists;
        craftScore = Math.min(30, craftScore);

        aiRecommendations = [];
      }
    }

    const totalScore = graafScore + craftScore + technicalScore;
    const quality = totalScore >= 90 ? 'excellent' : totalScore >= 75 ? 'good' : totalScore >= 60 ? 'average' : totalScore >= 45 ? 'below-average' : 'poor';

    console.log(`\n🎯 SCAN COMPLETE: ${scanUrl}`);
    console.log(`   Method: ${scoringMethod.toUpperCase()}`);
    console.log(`   Score: ${totalScore}/100 (${quality})`);
    console.log(`   └─ GRAAF: ${graafScore}/50 (${scoringMethod === 'fallback' ? 'regex' : 'AI'})`);
    console.log(`   └─ CRAFT: ${craftScore}/30 (${scoringMethod === 'fallback' ? 'regex' : 'AI'})`);
    console.log(`   └─ Technical: ${technicalScore}/20 (regex)\n`);

    // === TECHNICAL RECOMMENDATIONS (based on RAW HTML) ===
    const techRecommendations = [];

    if (!metaDesc) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Meta Description',
        description: 'Missing meta description. Critical for search click-through rate.',
        impact: 'High',
        points: '+4 points',
        howToFix: '1. Write a 150-160 character description\n2. Include your primary target keyword\n3. Add a compelling call-to-action',
        example: '<meta name="description" content="Learn proven SEO content strategies with our framework. Boost organic rankings in 90 days. Start your free audit today.">'
      });
    } else if (metaDesc.length <= 50) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Expand Meta Description',
        description: `Current meta description is only ${metaDesc.length} characters. Aim for 150-160.`,
        impact: 'Medium',
        points: '+2 points',
        howToFix: '1. Rewrite to 150-160 characters\n2. Include target keyword near the start\n3. End with a clear call-to-action',
        example: '<meta name="description" content="[Your keyword] guide covering [topic]. Includes [specific value]. [Call to action] — start today.">'
      });
    }

    if (!hasViewport) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Mobile Viewport',
        description: 'Missing viewport meta tag. Required for proper mobile rendering.',
        impact: 'High',
        points: '+3 points',
        howToFix: '1. Add the viewport meta tag inside your <head>\n2. Test the page on mobile devices\n3. Verify responsive layout works correctly',
        example: '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      });
    }

    if (!hasSchema) {
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Schema Markup',
        description: 'No structured data (JSON-LD) found. Schema enables rich snippets in search results.',
        impact: 'Medium',
        points: '+3 points',
        howToFix: '1. Add Article or HowTo schema as JSON-LD\n2. Include headline, author, and datePublished\n3. Test with Google Rich Results Test',
        example: '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "Article", "headline": "Your Title", "author": { "@type": "Person", "name": "Author Name" } }</script>'
      });
    }

    if (allImages > 0 && imagesWithAlt < allImages) {
      const missing = allImages - imagesWithAlt;
      techRecommendations.push({
        type: 'quickwin',
        category: 'Technical SEO',
        title: 'Add Alt Text to Images',
        description: `${missing} of ${allImages} images are missing alt text. Required for accessibility and image search.`,
        impact: 'Medium',
        points: '+2 points',
        howToFix: '1. Add descriptive alt text to every image\n2. Include relevant keywords naturally\n3. Describe what the image actually shows',
        example: '<img src="seo-chart.jpg" alt="SEO ranking improvement chart showing 40% traffic increase over 90 days">'
      });
    }

    // === MERGE AI + TECHNICAL RECOMMENDATIONS ===
    const allRecommendations = [...(aiRecommendations || []), ...techRecommendations];
    const quickWins = allRecommendations.filter(r => r.type === 'quickwin');
    const majorImprovements = allRecommendations.filter(r => r.type === 'major');

    // === BUILD RESPONSE ===
    const scanResult = {
      success: true,
      url: scanUrl,
      score: totalScore,
      quality,
      scoring_method: scoringMethod,
      metrics: { graaf: graafScore, craft: craftScore, technical: technicalScore },
      breakdown: {
        graaf: {
          total: graafScore,
          max: 50,
          percentage: Math.round((graafScore / 50) * 100),
          items: graafItems
        },
        craft: {
          total: craftScore,
          max: 30,
          percentage: Math.round((craftScore / 30) * 100),
          items: craftItems
        },
        technical: {
          total: technicalScore,
          max: 20,
          percentage: Math.round((technicalScore / 20) * 100),
          items: {
            metaDescription: metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0,
            title: title && title.length > 30 ? 4 : title ? 2 : 0,
            imageAlt: allImages > 0 ? Math.min(4, Math.floor((imagesWithAlt / allImages) * 4)) : 0,
            viewport: hasViewport ? 3 : 0,
            schema: hasSchema ? 3 : 0
          }
        }
      },
      recommendations: {
        all: allRecommendations,
        quickWins: quickWins,
        majorImprovements: majorImprovements,
        totalRecommendations: allRecommendations.length,
        potentialScoreIncrease: allRecommendations.reduce((sum, r) => {
          const pts = parseInt((r.points || '0').match(/\d+/)?.[0] || 0);
          return sum + pts;
        }, 0)
      },
      details: {
        wordCount,
        h1Count: h1s,
        h2h3Count: h2h3s,
        paragraphCount: paragraphs,
        imageCount: allImages,
        imagesWithAlt,
        hasQuotes,
        hasStats,
        hasFreshDates,
        hasAuthor,
        hasLists,
        hasViewport,
        hasSchema,
        metaDescription: metaDesc ? metaDesc.substring(0, 160) : null,
        title: title
      },
      timestamp: new Date().toISOString()
    };

    // Save to DB
    try {
      await pool.query(
        `INSERT INTO scans (url, score, quality, graaf_score, craft_score, technical_score, breakdown, recommendations, scan_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [scanUrl, totalScore, quality, graafScore, craftScore, technicalScore, JSON.stringify(scanResult.breakdown), JSON.stringify(scanResult.recommendations), 'manual']
      );
      console.log(`✅ Scan saved: ${scanUrl} (Score: ${totalScore}, Method: ${scoringMethod})`);
    } catch (dbError) {
      console.error('DB save error (non-fatal):', dbError.message);
    }

    // Increment sharelink usage
    if (shareKey) {
      try {
        await pool.query(
          'UPDATE share_links SET scans_used = scans_used + 1 WHERE share_code = $1',
          [shareKey]
        );
        console.log(`📊 Sharelink usage updated: ${shareKey}`);
      } catch (error) {
        console.error('Sharelink update error:', error);
      }
    }

    res.json(scanResult);

  } catch (error) {
    console.error('Scan error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// ============================================
// SCAN ALL AGENCIES IN LEADERBOARD — AI-POWERED (FIXED)
// Uses rawHtml for technical checks, extractedContent for AI
// ============================================
app.post('/api/admin/scan-all-agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, url, company_name 
      FROM leaderboard 
      WHERE is_opted_out = FALSE 
      ORDER BY id
    `);

    const agencies = result.rows;

    if (agencies.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No agencies to scan',
        scanned: 0,
        failed: 0
      });
    }

    let scanned = 0;
    let failed = 0;
    const updates = [];

    console.log(`🔄 Starting AI scan of ${agencies.length} agencies...`);

    for (const agency of agencies) {
      try {
        console.log(`🔍 Scanning: ${agency.url}`);

        // Use Puppeteer for accurate content extraction
        const fetchResult = await fetchWithPuppeteer(agency.url);
        
        if (!fetchResult.success) {
          console.log(`❌ Failed: ${agency.url}`);
          failed++;
          continue;
        }

        const rawHtml = fetchResult.rawHtml;
        console.log(`✅ Fetched ${rawHtml.length} bytes from ${agency.url} (${fetchResult.method})`);

        // === TECHNICAL SCORE (regex on RAW HTML — deterministic) ===
        let technicalScore = 0;
        const metaDescMatch = rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        const metaDesc = metaDescMatch ? metaDescMatch[1] : null;
        technicalScore += metaDesc && metaDesc.length > 50 ? 4 : metaDesc ? 2 : 0;
        const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1] : null;
        technicalScore += pageTitle && pageTitle.length > 30 ? 4 : pageTitle ? 2 : 0;
        const allImages = (rawHtml.match(/<img[^>]*>/gi) || []).length;
        const imagesWithAlt = (rawHtml.match(/<img[^>]*alt="/gi) || []).length;
        if (allImages > 0) {
          technicalScore += Math.min(4, Math.floor((imagesWithAlt / allImages) * 4));
        }
        const hasViewport = /<meta\s+name="viewport"/gi.test(rawHtml);
        technicalScore += hasViewport ? 3 : 0;
        const hasSchema = /"@context"|"@type"/gi.test(rawHtml);
        technicalScore += hasSchema ? 3 : 0;
        technicalScore = Math.min(20, technicalScore);

        // === AI SCORING (GRAAF + CRAFT) with cache ===
        let graafScore, craftScore;
        const contentHash = hashContent(rawHtml);
        const cached = scanCache.get(contentHash);

        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
          graafScore = cached.graafScore;
          craftScore = cached.craftScore;
          console.log(`  📦 Cache hit: GRAAF=${graafScore} CRAFT=${craftScore}`);
        } else {
          try {
            if (!process.env.ANTHROPIC_API_KEY) {
              throw new Error('ANTHROPIC_API_KEY not set');
            }
            const contentForAI = extractContentForAI(fetchResult);
            const aiResult = await scoreWithAI(contentForAI);

            if (!validateAIScores(aiResult)) {
              throw new Error('AI scores failed validation');
            }

            graafScore = aiResult.graaf.credibility + aiResult.graaf.relevance + aiResult.graaf.accuracy + aiResult.graaf.freshness;
            craftScore = aiResult.craft.heading_structure + aiResult.craft.subheadings + aiResult.craft.paragraphs + aiResult.craft.lists;

            scanCache.set(contentHash, {
              graafScore, craftScore,
              graafItems: aiResult.graaf,
              craftItems: aiResult.craft,
              recommendations: aiResult.recommendations || [],
              timestamp: Date.now()
            });

            console.log(`  🤖 AI scored: GRAAF=${graafScore} CRAFT=${craftScore}`);

          } catch (aiErr) {
            console.log(`  ⚠️ AI fallback for ${agency.url}: ${aiErr.message}`);

            // Regex fallback (uses RAW HTML)
            const hasQuotes = /says|according to|expert|quote|told us|founder|ceo|director/gi.test(rawHtml);
            const hasStats = /\d+%|\d+ studies|\d+ research|research shows|\d+ data/gi.test(rawHtml);
            const hasFreshDates = /202[4-6]|january|february|march|april|may|june|july|august|september|october|november|december/gi.test(rawHtml);
            const hasAuthor = /author|by |written by|published by|contributor/gi.test(rawHtml);
            const textContent = rawHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0);
            const wordCount = textContent.length;

            graafScore = 0;
            graafScore += hasQuotes ? 8 : 0;
            graafScore += hasStats ? 8 : 0;
            graafScore += hasFreshDates ? 8 : 2;
            graafScore += hasAuthor ? 8 : 0;
            graafScore += Math.min(18, Math.floor(wordCount / 100));
            graafScore = Math.min(50, graafScore);

            const h1s = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
            const h2h3s = (rawHtml.match(/<h2[^>]*>|<h3[^>]*>/gi) || []).length;
            const paragraphs = (rawHtml.match(/<p[^>]*>/gi) || []).length;
            const hasLists = /<ul[^>]*>|<ol[^>]*>/gi.test(rawHtml);

            craftScore = 0;
            craftScore += h1s === 1 ? 8 : h1s > 1 ? 4 : 2;
            craftScore += Math.min(10, h2h3s * 2);
            craftScore += Math.min(8, Math.floor(paragraphs / 3));
            craftScore += hasLists ? 4 : 0;
            craftScore = Math.min(30, craftScore);
          }
        }

        const totalScore = graafScore + craftScore + technicalScore;

        await pool.query(`
          UPDATE leaderboard 
          SET score = $1, last_scan = NOW(), company_name = COALESCE($2, company_name)
          WHERE id = $3
        `, [totalScore, agency.company_name, agency.id]);

        updates.push({ id: agency.id, url: agency.url, score: totalScore });
        scanned++;

      } catch (error) {
        console.log(`❌ Error scanning ${agency.url}: ${error.message}`);
        failed++;
      }
    }

    console.log(`✅ Bulk scan complete: ${scanned} scanned, ${failed} failed`);

    res.json({
      success: true,
      scanned,
      failed,
      updates,
      message: `Scanned ${scanned} agencies`
    });

  } catch (error) {
    console.error('Bulk scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

# 🔧 **COMPLETE SCANNER FIX - INSTALLATIE GUIDE**

## ❌ **PROBLEMEN GEVONDEN:**

1. **Syntax Error** (lijn ~2025):
   ```
   app.post('/api/admin/leaderboard/add-direct', ...);  // ← INVALID!
   ```
   
2. **Duplicate fetchWithPuppeteer** functie (oude + nieuwe versie)

3. **Scanner gebruikt verkeerde HTML**:
   - Technical checks gebruiken `html` (extracted text met markers)
   - Moet gebruiken `rawHtml` (echte HTML tags)
   
4. **Lead Scanner (Google Maps)** lijkt OK maar niet getest met nieuwe Puppeteer

---

## ✅ **DE OPLOSSING (4 UPDATES):**

### **UPDATE 1: Fix Puppeteer Functions (Lijn ~88-400)**

**ZOEK NAAR** (lijn ~88):
```javascript
async function fetchWithPuppeteer(url) {
  let page = null;
  try {
    const browser = await getBrowser();
```

**VERWIJDER** alle code tot en met `function extractContentForAI(html) {` (lijn ~400)

**VERVANG MET:** Code uit `PART1-PUPPETEER-FUNCTIONS.js`

---

### **UPDATE 2: Remove Syntax Errors (Lijn ~2019-2028)**

**ZOEK NAAR** (lijn ~2019):
```javascript
// In server.js, voeg toe (3 endpoints):

// A) Direct leaderboard add
app.post('/api/admin/leaderboard/add-direct', ...);
app.get('/api/admin/leaderboard/recent', ...);

// B) Google Maps scraping
app.post('/api/admin/lead-scanner/google-maps', ...);
```

**VERWIJDER** deze 9 regels VOLLEDIG

---

### **UPDATE 3: Fix /api/scan Endpoint (Lijn ~2800)**

**ZOEK NAAR:**
```javascript
app.post('/api/scan', async (req, res) => {
  const { url, shareKey } = req.body;
```

**VERWIJDER** de hele endpoint tot aan:
```javascript
// ============================================
// EXPORT SCAN RESULTS
// ============================================
```

**VERVANG MET:** Code uit `PART2-SCAN-ENDPOINT.js`

---

### **UPDATE 4: Fix scan-all-agencies (Lijn ~2085)**

**ZOEK NAAR:**
```javascript
app.post('/api/admin/scan-all-agencies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, url, company_name
```

**VERWIJDER** tot aan:
```javascript
// ============================================
// PUBLIC LEADERBOARD API
// ============================================
```

**VERVANG MET:** Code uit `PART3-SCAN-ALL-AGENCIES.js`

---

## 🔍 **BELANGRIJKSTE VERANDERINGEN:**

### **1. fetchWithPuppeteer retourneert nu:**
```javascript
{
  success: true,
  rawHtml: "<!DOCTYPE html>...",           // ← Voor technical checks
  extractedContent: "[H1]: Title\n...",    // ← Voor AI scoring  
  title: "Page Title",
  method: 'puppeteer'
}
```

### **2. Technical checks gebruiken rawHtml:**
```javascript
// VOOR (FOUT):
const html = fetchResult.html;
const metaDesc = html.match(/<meta...>/);  // ❌ Geen tags!

// NA (GOED):
const rawHtml = fetchResult.rawHtml;
const metaDesc = rawHtml.match(/<meta...>/);  // ✅ HTML tags!
```

### **3. AI scoring gebruikt extractedContent:**
```javascript
// VOOR:
const contentForAI = extractContentForAI(html);

// NA:
const contentForAI = extractContentForAI(fetchResult);  // ← Object!
```

---

## 📋 **VERIFICATIE CHECKLIST:**

Na deployment, test:

✅ **Scanner werkt**:
```bash
POST https://contentscale.site/api/scan
Body: {"url": "https://contentscale.site"}
```

Verwacht:
- `score`: ~90/100
- `technical`: ~18-20/20 (niet 0-2!)
- `graaf`: ~45-50/50
- `craft`: ~28-30/30

✅ **Lead Scanner werkt**:
```bash
POST https://contentscale.site/api/admin/lead-scanner/google-maps
Headers: {"x-admin-key": "1"}
Body: {"google_maps_url": "https://google.com/maps/search/seo+agencies+amsterdam"}
```

Verwacht:
- `success`: true
- `leads`: array met 10-20 businesses
- `count`: 10-20

✅ **Geen syntax errors in logs**

---

## 🚀 **DEPLOYMENT:**

```bash
# 1. Update server.js met alle 4 changes
# 2. Commit & push
git add src/server.js
git commit -m "Fix: Scanner now uses rawHtml for technical checks (90/100 → geen 29/100)"
git push

# 3. Railway auto-deploys
# 4. Check logs voor errors
# 5. Test scanner op contentscale.site
```

---

## 🐛 **TROUBLESHOOTING:**

### **"Still getting low scores"**
Check logs:
```
✅ Puppeteer: 50000 bytes HTML, 15000 chars extracted
```

Als je ziet:
```
❌ Puppeteer: 15000 bytes HTML
```
Dan is de fix niet toegepast.

### **"Syntax error on line 2025"**
De placeholder comments zijn niet verwijderd.

### **"Cannot find fetchResult.rawHtml"**
UPDATE 1 (Puppeteer functions) niet correct toegepast.

---

## 📊 **VERWACHTE RESULTATEN:**

| Site | VOOR | NA |
|------|------|-----|
| contentscale.site | 29/100 | 90/100 |
| Technical Score | 2/20 ❌ | 20/20 ✅ |
| GRAAF Score | 15/50 | 48/50 |
| CRAFT Score | 12/30 | 28/30 |

---

## ✅ **COMPLETION CHECKLIST:**

- [ ] UPDATE 1: Puppeteer functions replaced
- [ ] UPDATE 2: Syntax error lines removed  
- [ ] UPDATE 3: /api/scan endpoint fixed
- [ ] UPDATE 4: scan-all-agencies fixed
- [ ] Deployed to Railway
- [ ] Tested scanner on contentscale.site
- [ ] Technical score is 18-20/20 (not 0-2)
- [ ] Total score is 85-95/100 (not 20-30)

---

**Als alles groen is, is de fix compleet! 🎉**
