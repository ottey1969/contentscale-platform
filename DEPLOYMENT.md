# 🚀 DEPLOYMENT GUIDE - ContentScale Platform

## 🎯 QUICK START (10 minuten!)

### STAP 1: Download & Extract ✅
Je hebt de ZIP al gedownload. Extract de folder.

### STAP 2: Database Setup (Neon) 
**Je hebt dit al gedaan! ✅**

Je Neon database heeft:
- ✅ agencies table met test data
- ✅ Connection string

Nu alleen nog:

1. **Run complete schema:**
   - Ga naar Neon SQL Editor
   - Open `db/schema.sql` in een text editor
   - Copy ALLES
   - Paste in Neon SQL Editor
   - Klik "Run"
   - Dit maakt alle missing tables (share_links, scans, etc)

2. **Get Admin Key:**
   ```sql
   SELECT admin_api_key FROM security_config WHERE id = 1;
   ```
   Save deze key! Je hebt hem nodig voor /admin en /super-admin

### STAP 3: Local Testing (Optioneel)

```bash
cd contentscale-platform

# Create .env file
cp .env.example .env

# Edit .env, add je Neon connection string:
# DATABASE_URL=postgresql://jouw-neon-string

# Install & run
npm install
npm start

# Open browser:
# http://localhost:3000
```

### STAP 4: Deploy to Railway (5 minuten!)

**Optie A - Via GitHub (Recommended):**

1. **Create GitHub Repo:**
   ```bash
   cd contentscale-platform
   git init
   git add .
   git commit -m "Initial commit - ContentScale Platform"
   
   # Create repo on github.com, then:
   git remote add origin https://github.com/jouw-username/contentscale-platform.git
   git push -u origin main
   ```

2. **Deploy on Railway:**
   - Go to railway.app
   - "New Project" → "Deploy from GitHub"
   - Select: contentscale-platform
   - Railway auto-detects Node.js

3. **Set Environment Variables:**
   ```
   DATABASE_URL = jouw_neon_connection_string
   NODE_ENV = production
   PORT = 3000
   ```

4. **Done! 🎉**
   Railway gives you: `https://contentscale-platform-production-xxxx.up.railway.app`

**Optie B - Direct Upload:**

1. Go to railway.app
2. "New Project" → "Empty Project"
3. Upload project folder
4. Set environment variables
5. Deploy!

### STAP 5: Test Everything

**Public Leaderboard:**
```
https://jouw-url.railway.app/leaderboard/Netherlands
```

Should show:
- ✅ ContentScale #1 (95.50)
- ✅ Test Agency 1 #2 (85.30)
- ✅ Test Agency 2 #3 (72.80)

**Super Admin:**
```
https://jouw-url.railway.app/super-admin
```
Login with je admin_api_key from database

**Scanner:**
```
https://jouw-url.railway.app/seo-contentscore
```

---

## 🎯 CUSTOM DOMAIN SETUP (Optioneel)

### Add to Railway:

1. Railway Dashboard → Settings → Domains
2. Click "Add Domain"
3. Enter: `app.contentscale.nl` (of wat je wilt)

### Update DNS:

**Als je Cloudflare gebruikt:**
```
Type: CNAME
Name: app
Target: contentscale-platform-production.up.railway.app
Proxy: Orange cloud (ON)
```

**Anders:**
```
Type: CNAME
Name: app
Value: jouw-railway-url.railway.app
TTL: Auto
```

Wait 5-10 minuten, then: `https://app.contentscale.nl` works! 🎉

---

## 📊 POPULATE LEADERBOARD

Nu heb je 5 test agencies. Om het ECHT te vullen:

### Optie 1: Manual via Super Admin

1. Ga naar `/super-admin`
2. Login met admin key
3. Click "Create Agency"
4. Vul in:
   - Name: "Agency Name"
   - Email: email@agency.com
   - Country: Netherlands/USA/UK/Germany
   - Domain: agency.com

5. Agency wordt aangemaakt
6. Nu moet je de v52_score updaten:

```sql
UPDATE agencies 
SET v52_score = 75.5, last_scanned = NOW()
WHERE domain = 'agency.com';
```

Ranks worden automatisch geupdate!

### Optie 2: Bulk Import (Sneller!)

**Maak CSV file:** `agencies.csv`
```csv
name,domain,country,email
"Best SEO Amsterdam","bestseo.nl","Netherlands","info@bestseo.nl"
"Marketing Masters","marketing-masters.nl","Netherlands","hello@marketing-masters.nl"
"Digital Agency Pro","digitalpro.com","USA","contact@digitalpro.com"
```

**Import script:**
```javascript
// import-agencies.js
const pool = require('./db/postgres');
const fs = require('fs');

const csv = fs.readFileSync('agencies.csv', 'utf-8');
const lines = csv.split('\n').slice(1); // Skip header

for (const line of lines) {
  const [name, domain, country, email] = line.split(',').map(s => s.replace(/"/g, '').trim());
  
  await pool.query(
    `INSERT INTO agencies (name, domain, country, email, v52_score) 
     VALUES ($1, $2, $3, $4, $5)`,
    [name, domain, country, email, Math.random() * 30 + 70] // Random score 70-100
  );
}

console.log('Import done!');
```

Run: `node import-agencies.js`

### Optie 3: Auto-Scan (Best!)

**Later implementeren:**
- Scrape lijst van SEO agencies
- Auto-scan elk agency domain
- Save v52_score
- Leaderboard vult zichzelf!

Voor nu: Manual toevoegen van 50-100 agencies is genoeg om te starten.

---

## 🔧 CONFIGURATION

### Change Admin Key

```sql
UPDATE security_config 
SET admin_api_key = 'jouw-nieuwe-key-hier' 
WHERE id = 1;
```

### Add Agency Manually

```sql
INSERT INTO agencies (
  name, email, domain, country, v52_score, 
  admin_key, plan, scans_limit
) VALUES (
  'New Agency',
  'email@agency.com',
  'agency.com',
  'Netherlands',
  85.5,
  'agency_' || substr(md5(random()::text), 1, 16),
  'professional',
  500
);
```

### Create Share Link for Direct Client

```sql
INSERT INTO share_links (
  key, name, scans_limit, days_limit, expires_at
) VALUES (
  'link_' || substr(md5(random()::text), 1, 16),
  'Client Name',
  30,
  14,
  NOW() + INTERVAL '14 days'
);
```

Then give client: 
```
https://jouw-url.railway.app/seo-contentscore?key=link_xxxxx
```

---

## 🎨 BRANDING AANPASSEN

### Homepage Titel/Logo

Edit: `public/index.html`
```html
<h1>ContentScale</h1>
<!-- Change to: -->
<h1>Jouw Bedrijf</h1>
```

### Leaderboard Branding

Edit: `public/leaderboard.html`
```html
<h1>🏆 Top SEO Agencies 2025</h1>
<!-- Footer: -->
<p>Powered by <strong>ContentScale</strong></p>
```

### Agency Whitelabel

Agencies can set own branding via `/agency-admin`:
- Company name
- Logo URL
- Primary color

Their clients see THEIR branding!

---

## 🐛 TROUBLESHOOTING

### "Failed to load rankings"
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM agencies;"

# Should show: 5 (or more)
```

### "Invalid admin key"
```bash
# Get current key
psql $DATABASE_URL -c "SELECT admin_api_key FROM security_config WHERE id = 1;"

# Use this key in /super-admin login
```

### Railway deployment fails
```bash
# Check logs in Railway dashboard
# Common issues:
# 1. Missing DATABASE_URL env var
# 2. Wrong Node version (needs 16+)
# 3. Database schema not run
```

### Local testing - connection refused
```bash
# Make sure Neon database is accessible
# Check DATABASE_URL has ?sslmode=require
# Test: psql $DATABASE_URL -c "SELECT 1;"
```

---

## 📈 MONITORING

### Check Live Status

```bash
# Test API
curl https://jouw-url.railway.app/api/leaderboard/Netherlands

# Should return JSON with agencies
```

### View Logs (Railway)

1. Go to Railway dashboard
2. Click your project
3. "Logs" tab
4. See real-time server logs

### Database Stats

```sql
-- Total agencies
SELECT COUNT(*) FROM agencies;

-- Agencies per country
SELECT country, COUNT(*) FROM agencies GROUP BY country;

-- Total scans
SELECT COUNT(*) FROM scans;

-- Top 10 agencies
SELECT name, country, v52_score, rank 
FROM agencies 
WHERE v52_score IS NOT NULL 
ORDER BY v52_score DESC 
LIMIT 10;
```

---

## 🎉 DONE!

Je hebt nu:

✅ Complete ContentScale platform
✅ Public leaderboard (SEO traffic machine!)
✅ Agency management systeem
✅ Content scanner (v52score)
✅ Admin dashboards
✅ Live op Railway

**Next steps:**

1. Voeg 50-100 agencies toe aan leaderboard
2. Share leaderboard op LinkedIn
3. Start getting leads! 💰

**Questions?**

Check README.md of email: ot@contentscale.nl

**ENJOY! 🚀**
