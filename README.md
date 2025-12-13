# 🎯 ContentScale Platform V2.0

**Hybrid SEO Scoring System** met AI-powered validation en deterministische scoring.

Production-ready deployment op Railway + Neon PostgreSQL.

---

## 🏗️ ARCHITECTUUR
```
┌─────────────────────────────────────┐
│  STEP 1: Parser (Deterministic)     │
│  Detecteert: quotes, stats, FAQ     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  STEP 2: Claude AI (Validation)     │
│  Valideert kwaliteit van elementen  │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  STEP 3: Scoring (Deterministic)    │
│  GRAAF (50) + CRAFT (30) + Tech (20)│
└─────────────────────────────────────┘
```

---

## 🚀 FRAMEWORKS

### **GRAAF Framework (50 punten)**
- **G**enuinely **C**redible (10pts)
- **R**elevance (10pts)
- **A**ctionability (10pts)
- **A**ccuracy (10pts)
- **F**reshness (10pts)

### **CRAFT Framework (30 punten)**
- **C**ut Fluff (7pts)
- **R**eview & Optimize (8pts)
- **A**dd Visuals (6pts)
- **F**AQ Integration (5pts)
- **T**rust Building (4pts)

### **Technical SEO (20 punten)**
- Meta Optimization (4pts)
- Schema Markup (4pts)
- Internal Linking (4pts)
- Heading Hierarchy (4pts)
- Mobile Optimization (4pts)

---

## 📁 PROJECT STRUCTURE
```
contentscale-platform/
├── src/
│   ├── content-parser-HYBRID.js          # Deterministic detection
│   ├── claude-validator-HYBRID.js        # AI quality control
│   ├── deterministic-scoring-HYBRID.js   # Score calculation
│   ├── server.js                         # Express API server
│   └── test-hybrid-system.js             # Test script
├── .gitignore                            # Git exclusions
├── package.json                          # Dependencies
└── README.md                             # This file
```

---

## 🔧 TECH STACK

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **AI:** Claude Sonnet 4 (Anthropic API)
- **Database:** Neon PostgreSQL (serverless)
- **Hosting:** Railway (auto-deploy from GitHub)

---

## 🌐 API ENDPOINTS

### **Public Scanner**
```bash
POST /api/scan-free
Body: {"url": "https://example.com"}
Response: {score, breakdown, validation}
```

### **Agency Scanner**
```bash
POST /api/scan-agency
Body: {"agencyId": 123, "url": "https://example.com"}
Response: {score, quality, breakdown}
```

### **Leaderboard**
```bash
GET /api/leaderboard/:country
Response: {agencies: [{rank, name, domain, v52_score}]}
```

### **Health Check**
```bash
GET /health
Response: {status: "ok", database: {connected: true}}
```

---

## 🚂 DEPLOYMENT (Railway + Neon)

### **1. Environment Variables**

Voeg deze toe in Railway dashboard:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/neondb
PORT=3000
NODE_ENV=production
```

### **2. Database Schema (Neon)**
```sql
CREATE TABLE agencies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL UNIQUE,
  country VARCHAR(100),
  v52_score INTEGER DEFAULT 0,
  validation_data JSONB,
  last_scanned TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_country_score ON agencies(country, v52_score DESC);
```

### **3. Deploy**
```bash
# Railway auto-deploys from GitHub main branch
git push origin main
```

---

## 🧪 LOCAL TESTING

### **1. Install Dependencies**
```bash
npm install
```

### **2. Create .env file**
```bash
ANTHROPIC_API_KEY=sk-ant-your-key
DATABASE_URL=postgresql://localhost/contentscale
PORT=3000
```

### **3. Start Server**
```bash
npm start
# Server runs on http://localhost:3000
```

### **4. Test Scan**
```bash
curl -X POST http://localhost:3000/api/scan-free \
  -H "Content-Type: application/json" \
  -d '{"url":"https://contentscale.site"}'
```

---

## 📊 EXPECTED RESULTS

**contentscale.site example:**
```json
{
  "success": true,
  "score": 96,
  "quality": "excellent",
  "breakdown": {
    "graaf": {"total": 48, "credibility": 10, "relevance": 9, ...},
    "craft": {"total": 28, "cutFluff": 7, ...},
    "technical": {"total": 20, "meta": 4, ...}
  },
  "validation": {
    "parserCounts": {"expertQuotes": 11, "statistics": 25, ...},
    "validatedCounts": {"expertQuotes": 9, "statistics": 20, ...},
    "rejections": {"expertQuotes": [{"reason": "No specific attribution"}]}
  }
}
```

---

## 🎯 KEY FEATURES

✅ **No False Positives** - AI validates all detected elements  
✅ **Deterministic Scoring** - Same input = same output  
✅ **Transparent** - See parser vs validated counts  
✅ **Production Ready** - Error handling, fallbacks, logging  
✅ **Database Integration** - Store v52_score in Neon PostgreSQL  

---

## 📚 DOCUMENTATION

- Full deployment guide: See Railway dashboard
- GRAAF methodology: https://contentscale.site
- API documentation: See `/health` endpoint

---

## 🏆 RESULTS

- **78% average recovery rate** within 90 days
- **200+ clients** across 47+ countries
- **96/100** score for contentscale.site (validated)

---

## 📞 SUPPORT

- **GitHub Issues:** Create issue in this repo
- **Email:** support@contentscale.site
- **Website:** https://contentscale.site

---

# ContentScale Platform

SEO Content Scoring Platform with AI-powered validation.

## 📚 Documentation

- [Complete Workflows](docs/COMPLETE-WORKFLOWS.md) - All user flows, URLs, and guides
- [Scan Frequency Guide](docs/SCAN-FREQUENCY-GUIDE.md) - Testing and cron setup

## 🚀 Quick Start

- Super Admin: `/admin` (login with username + password)
- Agency Dashboard: `/agency?key=ADMIN-KEY`
- Client Scanner: `/seo-contentscore?key=SHARE-KEY`
- Leaderboard: `/api/leaderboard/netherlands`

## 🏆 Leaderboard

View rankings by country:
- Netherlands: `/api/leaderboard/netherlands`
- Germany: `/api/leaderboard/germany`
- UK: `/api/leaderboard/uk`

## ⚙️ Configuration

See [SCAN-FREQUENCY-GUIDE.md](docs/SCAN-FREQUENCY-GUIDE.md) for:
- Hourly vs weekly scans
- Auto-scan scripts
- Railway cron setup

---

## 📄 LICENSE

Proprietary - ContentScale © 2025

---

**Built with 🤖 AI + 🧠 Intelligence by ContentScale**
DELETE FROM super_admins;

