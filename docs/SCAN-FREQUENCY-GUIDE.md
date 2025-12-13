# ⏱️ SCAN FREQUENCY: WEKELIJKS → UURLIJKS VOOR TESTING

## 🎯 DOEL

Agency scores op de leaderboard snel updaten voor testing in plaats van wachten op wekelijkse scans.

---

## 🔧 METHODE 1: MANUAL SQL UPDATES (SNELST!)

### **Voor Snelle Testing:**

**Run in Neon SQL Editor elk uur:**

```sql
-- Update ContentScale score
UPDATE agencies 
SET 
  v52_score = v52_score + FLOOR(RANDOM() * 3),  -- Random +0 to +2 points
  last_scanned = NOW()
WHERE name = 'ContentScale';

-- Update alle agencies
UPDATE agencies 
SET 
  v52_score = v52_score + FLOOR(RANDOM() * 3 - 1),  -- Random -1 to +1 points
  last_scanned = NOW()
WHERE is_active = true;

-- Check leaderboard
SELECT 
  name, 
  v52_score, 
  last_scanned,
  RANK() OVER (ORDER BY v52_score DESC) as rank
FROM agencies 
WHERE country = 'netherlands'
ORDER BY v52_score DESC;
```

**Voordelen:**
- ✅ Instant resultaat
- ✅ Geen code changes nodig
- ✅ Volledige controle

**Nadelen:**
- ❌ Handmatig elk uur
- ❌ Niet automatisch

---

## 🤖 METHODE 2: AUTO-SCAN SCRIPT (GEAUTOMATISEERD!)

### **Stap 1: Create Script**

**Create file in GitHub:** `scripts/hourly-scan.js`

```javascript
// scripts/hourly-scan.js
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function scanAgencies() {
  console.log('🔍 [HOURLY SCAN] Starting...');
  
  try {
    // Get all agencies
    const result = await pool.query(
      'SELECT id, name, domain FROM agencies WHERE is_active = true'
    );
    
    console.log(`📊 Found ${result.rows.length} agencies to scan`);
    
    for (const agency of result.rows) {
      console.log(`\n🎯 Scanning: ${agency.name} (${agency.domain})`);
      
      try {
        // Call scan API
        const response = await axios.post(
          `${process.env.BASE_URL || 'http://localhost:3000'}/api/scan-agency`,
          {
            agencyId: agency.id,
            url: `https://${agency.domain}`
          },
          { timeout: 30000 }
        );
        
        if (response.data.success) {
          console.log(`✅ ${agency.name}: ${response.data.score}/100`);
        }
        
      } catch (error) {
        console.error(`❌ ${agency.name} failed: ${error.message}`);
        
        // Still update timestamp (mark as attempted)
        await pool.query(
          'UPDATE agencies SET last_scanned = NOW() WHERE id = $1',
          [agency.id]
        );
      }
      
      // Wait 30 seconds between agencies (avoid rate limits)
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    console.log('\n✅ [HOURLY SCAN] Complete!');
    
    // Show updated leaderboard
    const leaderboard = await pool.query(
      `SELECT name, v52_score, last_scanned 
       FROM agencies 
       WHERE country = 'netherlands' 
       ORDER BY v52_score DESC 
       LIMIT 5`
    );
    
    console.log('\n🏆 Top 5 Leaderboard:');
    leaderboard.rows.forEach((agency, i) => {
      console.log(`${i + 1}. ${agency.name}: ${agency.v52_score}/100`);
    });
    
  } catch (error) {
    console.error('❌ [HOURLY SCAN] Error:', error.message);
  }
  
  await pool.end();
  process.exit(0);
}

// Run
scanAgencies();
```

### **Stap 2: Update package.json**

```json
{
  "scripts": {
    "start": "node src/server.js",
    "hourly-scan": "node scripts/hourly-scan.js"
  }
}
```

### **Stap 3: Test Locally**

```bash
# Install dependencies (if needed)
npm install

# Run scan
npm run hourly-scan
```

**Expected output:**
```
🔍 [HOURLY SCAN] Starting...
📊 Found 3 agencies to scan

🎯 Scanning: ContentScale (contentscale.site)
✅ ContentScale: 96/100

🎯 Scanning: Test SEO Agency (testseo.com)
✅ Test SEO Agency: 82/100

🎯 Scanning: German SEO Agentur (seo-agentur.de)
✅ German SEO Agentur: 88/100

✅ [HOURLY SCAN] Complete!

🏆 Top 5 Leaderboard:
1. ContentScale: 96/100
2. German SEO Agentur: 88/100
3. Test SEO Agency: 82/100
```

---

## ⏰ METHODE 3: RAILWAY CRON JOB (PRODUCTION!)

### **Option A: Railway Cron Service**

**In Railway Dashboard:**

1. **Click "New" → "Cron Job"**

2. **Settings:**
   - Name: `Hourly Agency Scan`
   - Schedule: `0 * * * *` (every hour at :00)
   - Command: `npm run hourly-scan`
   - Repository: Same as main app
   - Environment Variables: Copy from main service

3. **Deploy**

**Result:** Agencies automatically scanned every hour!

---

### **Option B: GitHub Actions**

**Create file:** `.github/workflows/hourly-scan.yml`

```yaml
name: Hourly Agency Scan

on:
  schedule:
    # Run every hour
    - cron: '0 * * * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  scan:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run hourly scan
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BASE_URL: ${{ secrets.BASE_URL }}
        run: npm run hourly-scan
```

**Setup:**
1. Add secrets in GitHub: Settings → Secrets
2. Add: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `BASE_URL`
3. Push to GitHub
4. GitHub Actions runs automatically every hour!

---

## 📊 CRON SCHEDULE EXAMPLES

```bash
# Every hour at :00
0 * * * *

# Every 30 minutes
*/30 * * * *

# Every 15 minutes (for fast testing!)
*/15 * * * *

# Every day at 9 AM
0 9 * * *

# Every Monday at 9 AM
0 9 * * 1

# Every 6 hours
0 */6 * * *
```

**Voor snelle testing:** `*/15 * * * *` (elke 15 minuten!)

---

## 🧪 TESTING DIFFERENT FREQUENCIES

### **Test 1: Manual Every 5 Minutes**

```sql
-- Run in Neon SQL Editor
-- Timestamp: 14:00
UPDATE agencies SET v52_score = 85, last_scanned = NOW() WHERE id = 1;

-- Timestamp: 14:05
UPDATE agencies SET v52_score = 87, last_scanned = NOW() WHERE id = 1;

-- Timestamp: 14:10
UPDATE agencies SET v52_score = 89, last_scanned = NOW() WHERE id = 1;

-- Check progression
SELECT name, v52_score, last_scanned FROM agencies WHERE id = 1;
```

---

### **Test 2: Simulate Weekly Progress**

```sql
-- Week 1
UPDATE agencies SET v52_score = 75, last_scanned = NOW() - INTERVAL '7 days' WHERE id = 1;

-- Week 2
UPDATE agencies SET v52_score = 80, last_scanned = NOW() - INTERVAL '6 days' WHERE id = 1;

-- Week 3
UPDATE agencies SET v52_score = 85, last_scanned = NOW() - INTERVAL '5 days' WHERE id = 1;

-- Current
UPDATE agencies SET v52_score = 92, last_scanned = NOW() WHERE id = 1;

-- View history
SELECT name, v52_score, last_scanned FROM agencies WHERE id = 1;
```

---

### **Test 3: Random Score Changes**

```sql
-- Simulate realistic score fluctuations
UPDATE agencies 
SET 
  v52_score = GREATEST(60, LEAST(100, v52_score + FLOOR(RANDOM() * 5 - 2))),
  last_scanned = NOW()
WHERE is_active = true;

-- Repeat every hour to see rankings change!
```

---

## 📈 MONITORING SCAN FREQUENCY

### **Check Last Scan Times:**

```sql
SELECT 
  name,
  v52_score,
  last_scanned,
  NOW() - last_scanned as time_since_scan
FROM agencies
ORDER BY last_scanned DESC;
```

**Example output:**
```
name               | v52_score | last_scanned        | time_since_scan
ContentScale       | 96.00     | 2025-12-10 14:00:00 | 00:05:23
German SEO Agentur | 88.00     | 2025-12-10 13:55:00 | 00:10:23
Test SEO Agency    | 75.00     | 2025-12-10 13:00:00 | 01:05:23
```

---

### **Check Scan Activity:**

```sql
-- Scans per hour (last 24 hours)
SELECT 
  DATE_TRUNC('hour', scanned_at) as hour,
  COUNT(*) as scan_count
FROM scans
WHERE scanned_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## ⚡ PRODUCTION VS TESTING

### **Production Settings:**

```javascript
// Slow, stable updates
const SCAN_FREQUENCY = '0 9 * * 1';  // Weekly on Monday 9 AM
const SCAN_TIMEOUT = 60000;           // 60 seconds
const DELAY_BETWEEN_SCANS = 60000;    // 1 minute
```

### **Testing Settings:**

```javascript
// Fast, frequent updates
const SCAN_FREQUENCY = '*/15 * * * *';  // Every 15 minutes
const SCAN_TIMEOUT = 30000;             // 30 seconds
const DELAY_BETWEEN_SCANS = 10000;      // 10 seconds
```

---

## 🎯 QUICK COMMANDS

```bash
# Manual scan (run anytime)
npm run hourly-scan

# View logs (Railway)
railway logs

# View database (Neon)
# Go to: console.neon.tech → SQL Editor

# Check leaderboard
curl https://YOUR-URL.up.railway.app/api/leaderboard/netherlands
```

---

## ✅ RECOMMENDED APPROACH

**For Testing:**
1. ✅ Use Methode 1 (Manual SQL) for instant control
2. ✅ Use Methode 2 (Script) when testing automation
3. ✅ Use cron `*/15 * * * *` for fast iterations

**For Production:**
1. ✅ Use Railway Cron Job with `0 9 * * 1` (weekly)
2. ✅ Or manual scans when agencies request updates
3. ✅ Monitor with dashboard alerts

---

## 🔄 CONVERTING BACK TO WEEKLY

**When testing is done:**

```javascript
// Change from:
const SCAN_FREQUENCY = '*/15 * * * *';  // Every 15 min

// To:
const SCAN_FREQUENCY = '0 9 * * 1';     // Weekly Monday 9 AM
```

**Or simply:**
- Stop cron job in Railway
- Do manual scans only when needed
- Let agencies trigger their own scans (future feature)

---

## 📊 EXPECTED RESULTS

**After hourly scans for 1 day (24 scans):**

```
Time      | ContentScale | Test Agency | German Agentur
----------|--------------|-------------|---------------
00:00     | 85           | 75          | 80
01:00     | 86           | 74          | 82
02:00     | 88           | 76          | 81
...       | ...          | ...         | ...
23:00     | 96           | 82          | 88
```

**Leaderboard changes 24x in 24 hours!** 🏆

Perfect for testing ranking changes, UI updates, and gamification!

---

**KLAAR VOOR TESTING!** ⏱️🚀
