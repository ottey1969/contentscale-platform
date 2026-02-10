// ============================================
// GOOGLE MAPS SCRAPER - PUPPETEER VERSION
// Uses Puppeteer instead of Playwright (consistent with main scanner)
// ============================================

class GoogleMapsScraper {
  constructor(pool, puppeteerBrowser = null) {
    this.pool = pool;
    this.puppeteerBrowser = puppeteerBrowser; // Reuse browser from server.js
  }

  /**
   * Scrape Google Maps search results
   */
  async scrapeGoogleMaps(url, maxResults = 20) {
    console.log(`🗺️ Starting Google Maps scrape: ${url}`);
    
    // Get browser (reuse existing or launch new)
    const puppeteer = require('puppeteer');
    const browser = this.puppeteerBrowser || await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    try {
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to Google Maps
      console.log('📍 Loading Google Maps...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for results to load
      await page.waitForSelector('[role="feed"]', { timeout: 10000 });
      
      // Scroll to load more results
      console.log('📜 Scrolling to load results...');
      await this.scrollFeed(page, maxResults);
      
      // Extract business data
      console.log('📊 Extracting business data...');
      const leads = await page.evaluate(() => {
        const results = [];
        const items = document.querySelectorAll('[role="feed"] > div > div[jsaction]');
        
        items.forEach((item, index) => {
          try {
            // Name
            const nameEl = item.querySelector('[role="article"] h3, [role="article"] a[aria-label]');
            const name = nameEl?.textContent?.trim() || nameEl?.getAttribute('aria-label')?.split(',')[0]?.trim();
            
            if (!name) return;
            
            // Category
            const categoryEl = item.querySelector('[role="article"] span[class*="fontBodyMedium"]');
            const category = categoryEl?.textContent?.trim();
            
            // Rating
            const ratingEl = item.querySelector('[role="img"][aria-label*="star"]');
            const ratingText = ratingEl?.getAttribute('aria-label') || '';
            const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*star/i);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
            
            // Reviews count
            const reviewsMatch = ratingText.match(/(\d+(?:,\d+)*)\s*review/i);
            const reviews = reviewsMatch ? parseInt(reviewsMatch[1].replace(/,/g, '')) : 0;
            
            // Address
            const addressEl = item.querySelector('[role="article"] div[class*="fontBodyMedium"] span');
            const address = addressEl?.textContent?.trim();
            
            // Phone (if visible)
            const phoneEl = item.querySelector('[data-tooltip*="phone"], [aria-label*="Phone"]');
            const phone = phoneEl?.textContent?.trim() || phoneEl?.getAttribute('aria-label')?.match(/[\d\s\+\-\(\)]+/)?.[0];
            
            // Website (if visible)
            const websiteEl = item.querySelector('a[data-value="Website"], a[aria-label*="Website"]');
            const website = websiteEl?.href;
            
            // Place URL
            const placeLink = item.querySelector('a[href*="/maps/place/"]');
            const placeUrl = placeLink?.href;
            
            results.push({
              name,
              category,
              rating,
              reviews,
              address,
              phone,
              website,
              place_url: placeUrl
            });
          } catch (err) {
            console.error('Error parsing item:', err);
          }
        });
        
        return results;
      });
      
      console.log(`✅ Found ${leads.length} businesses`);
      
      await page.close();
      
      // Don't close browser if it was provided (reused)
      if (!this.puppeteerBrowser) {
        await browser.close();
      }
      
      return {
        success: true,
        leads: leads.slice(0, maxResults),
        total: leads.length
      };
      
    } catch (error) {
      console.error('❌ Scrape error:', error);
      await page.close();
      
      if (!this.puppeteerBrowser) {
        await browser.close();
      }
      
      throw error;
    }
  }
  
  /**
   * Scroll the Google Maps feed to load more results
   */
  async scrollFeed(page, maxResults) {
    const scrollContainer = '[role="feed"]';
    let previousHeight = 0;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      // Scroll to bottom
      await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        }
      }, scrollContainer);
      
      // Wait for new content
      await page.waitForTimeout(2000);
      
      // Check if height changed
      const currentHeight = await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        return feed ? feed.scrollHeight : 0;
      }, scrollContainer);
      
      if (currentHeight === previousHeight) {
        attempts++;
      } else {
        attempts = 0;
        previousHeight = currentHeight;
      }
      
      // Check if we have enough results
      const resultCount = await page.evaluate(() => {
        return document.querySelectorAll('[role="feed"] > div > div[jsaction]').length;
      });
      
      if (resultCount >= maxResults) {
        break;
      }
    }
  }
  
  /**
   * Save lead to database
   */
  async saveLead(lead, userId = null) {
    try {
      const result = await this.pool.query(
        `INSERT INTO google_maps_leads 
         (name, category, rating, reviews, address, phone, website, place_url, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
         ON CONFLICT (place_url) DO UPDATE SET
           rating = EXCLUDED.rating,
           reviews = EXCLUDED.reviews,
           updated_at = NOW()
         RETURNING id`,
        [
          lead.name,
          lead.category || null,
          lead.rating || null,
          lead.reviews || 0,
          lead.address || null,
          lead.phone || null,
          lead.website || null,
          lead.place_url || null,
          userId
        ]
      );
      
      return result.rows[0]?.id;
    } catch (error) {
      console.error('Save lead error:', error);
      return null;
    }
  }
}

module.exports = GoogleMapsScraper;
