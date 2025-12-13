// ==========================================
// PUPPETEER FETCHER - JAVASCRIPT RENDERING
// ContentScale Platform v2.0
// ==========================================

const puppeteer = require('puppeteer');

// Browser instance pool (reuse browser for performance)
let browserInstance = null;
let activePagesCount = 0;
const MAX_PAGES = 5;

/**
 * Get or create browser instance
 * Reusing browser saves 2-3 seconds per scan
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('🚀 Launching new browser instance...');
    
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Important for Railway/Heroku
        '--disable-extensions'
      ],
      timeout: 30000
    });
    
    // Handle browser disconnect
    browserInstance.on('disconnected', () => {
      console.log('⚠️ Browser disconnected');
      browserInstance = null;
      activePagesCount = 0;
    });
    
    console.log('✅ Browser instance ready');
  }
  
  return browserInstance;
}

/**
 * Fetch URL with full JavaScript rendering
 * This is what fixes the 0 words detection problem
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - { html, text, metadata }
 */
async function fetchWithPuppeteer(url, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'networkidle0',
    waitDelay = 2000,
    screenshot = false
  } = options;
  
  const startTime = Date.now();
  let page = null;
  
  try {
    // Check concurrent pages limit
    if (activePagesCount >= MAX_PAGES) {
      console.log(`⏳ Max pages (${MAX_PAGES}) reached, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    activePagesCount++;
    
    // Get browser instance
    const browser = await getBrowser();
    
    // Create new page
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });
    
    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // Block unnecessary resources for speed
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      
      // Block these to speed up loading
      if (['font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    console.log(`📥 Navigating to: ${url}`);
    
    // Navigate with proper wait conditions
    await page.goto(url, {
      waitUntil: waitUntil,
      timeout: timeout
    });
    
    console.log(`⏳ Waiting ${waitDelay}ms for lazy-loaded content...`);
    
    // Wait for lazy-loaded content
    await page.waitForTimeout(waitDelay);
    
    // Extract full HTML (AFTER JavaScript execution)
    const html = await page.content();
    
    // Extract all data in one evaluate call for efficiency
    const extractedData = await page.evaluate(() => {
      // Text content
      const text = document.body.innerText;
      
      // Word count
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      
      // Metadata
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.content : '';
      };
      
      return {
        text,
        wordCount,
        metadata: {
          title: document.title || '',
          description: getMetaContent('description'),
          ogTitle: getMetaContent('og:title'),
          ogDescription: getMetaContent('og:description'),
          twitterCard: getMetaContent('twitter:card'),
          canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || '',
          h1Count: document.querySelectorAll('h1').length,
          h2Count: document.querySelectorAll('h2').length,
          h3Count: document.querySelectorAll('h3').length,
          imageCount: document.querySelectorAll('img').length,
          linkCount: document.querySelectorAll('a').length
        }
      };
    });
    
    // Optional screenshot for debugging
    let screenshotBuffer = null;
    if (screenshot) {
      screenshotBuffer = await page.screenshot({
        fullPage: false,
        type: 'jpeg',
        quality: 80
      });
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Fetch complete in ${duration}s`);
    console.log(`   📝 Word count: ${extractedData.wordCount}`);
    console.log(`   📊 H1: ${extractedData.metadata.h1Count}, H2: ${extractedData.metadata.h2Count}`);
    console.log(`   🖼️  Images: ${extractedData.metadata.imageCount}`);
    
    // Close page
    await page.close();
    activePagesCount--;
    
    return {
      success: true,
      html: html,
      text: extractedData.text,
      wordCount: extractedData.wordCount,
      metadata: extractedData.metadata,
      screenshot: screenshotBuffer,
      duration: duration,
      url: url
    };
    
  } catch (error) {
    console.error(`❌ Puppeteer fetch failed for ${url}:`, error.message);
    
    // Close page on error
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
      activePagesCount--;
    }
    
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

/**
 * Graceful shutdown - close browser
 */
async function closeBrowser() {
  if (browserInstance) {
    console.log('🔄 Closing browser instance...');
    try {
      await browserInstance.close();
      browserInstance = null;
      activePagesCount = 0;
      console.log('✅ Browser closed');
    } catch (error) {
      console.error('❌ Error closing browser:', error.message);
    }
  }
}

// Handle process termination
process.on('SIGTERM', closeBrowser);
process.on('SIGINT', closeBrowser);

module.exports = {
  fetchWithPuppeteer,
  closeBrowser,
  getBrowser
};