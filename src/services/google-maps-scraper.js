const { chromium } = require('playwright');

class GoogleMapsScraper {
  constructor(pool) {
    this.pool = pool;
    this.browser = null;
  }

  async initialize() {
    if (!this.browser) {
      console.log('🚀 Launching Playwright browser for Google Maps...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      console.log('✅ Playwright browser ready');
    }
    return this.browser;
  }

  async scrapeGoogleMaps(mapsUrl, maxResults = 20) {
    console.log(`🗺️ Scraping Google Maps: ${mapsUrl}`);
    
    const browser = await this.initialize();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
      // Navigate to Google Maps
      await page.goto(mapsUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for results to load
      await page.waitForSelector('[role="article"]', { timeout: 15000 });
      
      console.log('📋 Scrolling to load more results...');
      
      // Scroll to load more results
      const scrollContainer = await page.$('[role="feed"]');
      if (scrollContainer) {
        for (let i = 0; i < 5; i++) {
          await scrollContainer.evaluate(el => el.scrollBy(0, 1000));
          await page.waitForTimeout(1000);
        }
      }
      
      console.log('🔍 Extracting business listings...');
      
      // Extract all business cards
      const businesses = await page.$$eval('[role="article"]', (articles) => {
        return articles.slice(0, 20).map(article => {
          // Business name
          const nameEl = article.querySelector('[role="img"]');
          const name = nameEl?.getAttribute('aria-label') || 'Unknown Business';
          
          // Rating
          const ratingEl = article.querySelector('[role="img"][aria-label*="stars"]');
          const ratingText = ratingEl?.getAttribute('aria-label') || '';
          const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*stars?/i);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
          
          // Reviews count
          const reviewsMatch = ratingText.match(/(\d+)\s*reviews?/i);
          const reviews = reviewsMatch ? parseInt(reviewsMatch[1]) : 0;
          
          // Category
          const categoryEl = article.querySelector('[jsaction*="category"]');
          const category = categoryEl?.textContent?.trim() || null;
          
          // Address
          const addressEls = Array.from(article.querySelectorAll('[jstcache]'));
          const address = addressEls.find(el => 
            el.textContent.match(/\d+/) && 
            !el.textContent.match(/€|stars|reviews/)
          )?.textContent?.trim() || null;
          
          // Data attribute for link
          const linkEl = article.querySelector('a[href*="/maps/place/"]');
          const placeUrl = linkEl?.href || null;
          
          return {
            name,
            rating,
            reviews,
            category,
            address,
            placeUrl,
            extracted_at: new Date().toISOString()
          };
        });
      });
      
      console.log(`✅ Extracted ${businesses.length} businesses`);
      
      // Now fetch detailed info for each business
      const detailedBusinesses = [];
      
      for (const business of businesses.slice(0, maxResults)) {
        try {
          if (!business.placeUrl) continue;
          
          console.log(`📍 Fetching details for: ${business.name}`);
          
          await page.goto(business.placeUrl, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(2000);
          
          // Extract website
          let website = null;
          try {
            const websiteButton = await page.$('button[data-item-id*="authority"]');
            if (websiteButton) {
              const websiteLink = await websiteButton.evaluate(el => 
                el.getAttribute('data-item-id')?.match(/https?:\/\/[^\s]+/)?.[0]
              );
              website = websiteLink || null;
            }
          } catch (e) {
            console.log(`⚠️ No website found for ${business.name}`);
          }
          
          // Extract phone
          let phone = null;
          try {
            const phoneButton = await page.$('button[data-item-id*="phone"]');
            if (phoneButton) {
              const phoneText = await phoneButton.evaluate(el => 
                el.getAttribute('data-item-id')?.match(/phone:tel:([+\d\s-]+)/)?.[1]
              );
              phone = phoneText?.trim() || null;
            }
          } catch (e) {
            console.log(`⚠️ No phone found for ${business.name}`);
          }
          
          // Extract full address
          try {
            const addressButton = await page.$('button[data-item-id*="address"]');
            if (addressButton && !business.address) {
              const addressText = await addressButton.textContent();
              business.address = addressText?.trim() || business.address;
            }
          } catch (e) {}
          
          detailedBusinesses.push({
            ...business,
            website,
            phone,
            has_website: !!website,
            has_phone: !!phone
          });
          
          console.log(`✅ ${business.name}: website=${website ? 'YES' : 'NO'}, phone=${phone ? 'YES' : 'NO'}`);
          
        } catch (detailError) {
          console.error(`❌ Error fetching details for ${business.name}:`, detailError.message);
          detailedBusinesses.push(business);
        }
      }
      
      await context.close();
      
      return {
        success: true,
        leads: detailedBusinesses,
        total: detailedBusinesses.length,
        with_website: detailedBusinesses.filter(b => b.website).length,
        with_phone: detailedBusinesses.filter(b => b.phone).length
      };
      
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async saveLead(lead, userId = null) {
    try {
      const result = await this.pool.query(
        `INSERT INTO google_maps_leads 
         (name, category, address, rating, reviews, website, phone, place_url, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
         RETURNING id`,
        [
          lead.name,
          lead.category || null,
          lead.address || null,
          lead.rating || null,
          lead.reviews || 0,
          lead.website || null,
          lead.phone || null,
          lead.placeUrl || null,
          userId
        ]
      );
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Save lead error:', error);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = GoogleMapsScraper;
