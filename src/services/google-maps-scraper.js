// ============================================
// GOOGLE MAPS SCRAPER - IMPROVED SELECTORS
// ============================================

class GoogleMapsScraper {
  constructor(pool, puppeteerBrowser = null) {
    this.pool = pool;
    this.puppeteerBrowser = puppeteerBrowser;
  }

  async scrapeGoogleMaps(url, maxResults = 20) {
    console.log(`🗺️ Starting Google Maps scrape: ${url}`);
    
    const puppeteer = require('puppeteer');
    const browser = this.puppeteerBrowser || await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const page = await browser.newPage();
    
    try {
      // Anti-bot measures
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Block unnecessary resources to speed up
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if(['image', 'stylesheet', 'font'].includes(req.resourceType())){
          req.abort();
        } else {
          req.continue();
        }
      });
      
      console.log('📍 Loading Google Maps...');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for ANY of these selectors (Google Maps variations)
      console.log('⏳ Waiting for results...');
      await page.waitForFunction(() => {
        return document.querySelector('[role="article"]') ||
               document.querySelector('.Nv2PK') || // Business card class
               document.querySelector('a[href*="/maps/place/"]') ||
               document.querySelectorAll('div[jsaction]').length > 5;
      }, { timeout: 15000 });
      
      // Give it time to fully load
      await page.waitForTimeout(3000);
      
      // Scroll to load more (if there's a scrollable container)
      console.log('📜 Scrolling to load more...');
      await this.scrollAndLoad(page);
      
      // Extract data using multiple selector strategies
      console.log('📊 Extracting business data...');
      const leads = await page.evaluate(() => {
        const results = [];
        
        // Strategy 1: Look for article elements
        let items = document.querySelectorAll('[role="article"]');
        
        // Strategy 2: If no articles, try class-based selector
        if (items.length === 0) {
          items = document.querySelectorAll('.Nv2PK');
        }
        
        // Strategy 3: Look for links to place pages
        if (items.length === 0) {
          items = document.querySelectorAll('a[href*="/maps/place/"]');
        }
        
        console.log(`Found ${items.length} potential items`);
        
        items.forEach((item) => {
          try {
            // Get parent container for more data
            const container = item.closest('div[jsaction]') || item;
            
            // Extract name - multiple strategies
            let name = null;
            const nameSelectors = [
              'h3',
              '[class*="fontHeadline"]',
              '[aria-label]',
              'a[aria-label]'
            ];
            
            for (const selector of nameSelectors) {
              const el = container.querySelector(selector);
              if (el) {
                name = el.textContent?.trim() || el.getAttribute('aria-label')?.split(',')[0]?.trim();
                if (name) break;
              }
            }
            
            if (!name) return; // Skip if no name found
            
            // Category
            let category = null;
            const categoryEl = container.querySelector('[class*="fontBodyMedium"] span');
            if (categoryEl) {
              category = categoryEl.textContent?.trim();
            }
            
            // Rating
            let rating = null;
            let reviews = 0;
            const ratingEl = container.querySelector('[role="img"][aria-label*="star"]');
            if (ratingEl) {
              const label = ratingEl.getAttribute('aria-label');
              const ratingMatch = label.match(/(\d+\.?\d*)\s*star/i);
              if (ratingMatch) rating = parseFloat(ratingMatch[1]);
              
              const reviewsMatch = label.match(/(\d+(?:,\d+)*)\s*review/i);
              if (reviewsMatch) reviews = parseInt(reviewsMatch[1].replace(/,/g, ''));
            }
            
            // Address
            let address = null;
            const addressEl = container.querySelector('[data-item-id*="address"]');
            if (addressEl) {
              address = addressEl.textContent?.trim();
            }
            
            // Website - look for website link
            let website = null;
            const websiteEl = container.querySelector('a[data-value="Website"], a[href*="http"]:not([href*="google.com"])');
            if (websiteEl) {
              website = websiteEl.href;
            }
            
            // Phone
            let phone = null;
            const phoneEl = container.querySelector('[data-item-id*="phone"]');
            if (phoneEl) {
              phone = phoneEl.textContent?.trim();
            }
            
            // Place URL
            let placeUrl = null;
            const placeLink = container.querySelector('a[href*="/maps/place/"]');
            if (placeLink) {
              placeUrl = placeLink.href;
            }
            
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
      
      console.log(`✅ Extracted ${leads.length} businesses`);
      
      // Filter out invalid entries
      const validLeads = leads.filter(lead => lead.name && lead.name.length > 0);
      
      console.log(`✅ ${validLeads.length} valid leads after filtering`);
      
      await page.close();
      
      if (!this.puppeteerBrowser) {
        await browser.close();
      }
      
      return {
        success: true,
        leads: validLeads.slice(0, maxResults),
        total: validLeads.length
      };
      
    } catch (error) {
      console.error('❌ Scrape error:', error);
      
      // Take screenshot for debugging
      try {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        console.log('📸 Screenshot taken (base64), length:', screenshot.length);
      } catch (e) {
        console.log('Could not take screenshot');
      }
      
      await page.close();
      
      if (!this.puppeteerBrowser) {
        await browser.close();
      }
      
      throw error;
    }
  }
  
  async scrollAndLoad(page) {
    try {
      // Try to find scrollable container
      const scrollable = await page.evaluate(() => {
        // Common Google Maps scroll containers
        const containers = [
          document.querySelector('[role="feed"]'),
          document.querySelector('.m6QErb'),
          document.querySelector('[aria-label*="Results"]'),
          document.querySelector('div[style*="overflow"]')
        ];
        
        for (const container of containers) {
          if (container && container.scrollHeight > container.clientHeight) {
            return true;
          }
        }
        return false;
      });
      
      if (scrollable) {
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const containers = [
              document.querySelector('[role="feed"]'),
              document.querySelector('.m6QErb'),
              document.querySelector('[aria-label*="Results"]')
            ];
            
            for (const container of containers) {
              if (container) {
                container.scrollTop = container.scrollHeight;
                break;
              }
            }
          });
          
          await page.waitForTimeout(1500);
        }
      }
    } catch (error) {
      console.log('Scroll error (non-critical):', error.message);
    }
  }
  
  async saveLead(lead, userId = null) {
    try {
      const result = await this.pool.query(
        `INSERT INTO google_maps_leads 
         (name, category, rating, reviews, address, phone, website, place_url, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
         ON CONFLICT (place_url) DO UPDATE SET
           rating = EXCLUDED.rating,
           reviews = EXCLUDED.reviews
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
