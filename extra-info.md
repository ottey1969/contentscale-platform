1. // ==========================================
// 📞 CONTACT INFO CONFIG - WIJZIG HIER! 🎯
// ==========================================

2. // ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================

3. // ==========================================
// 📞 SCANNER HYBRID  - WIJZIG HIER! 🎯
// ==========================================







1. // ==========================================
// 📞 CONTACT INFO CONFIG - WIJZIG HIER! 🎯
// ==========================================
# 📞 CONTACT INFO AANPASSEN - COMPLETE GUIDE

## 🎯 2 MANIEREN OM CONTACT INFO TE WIJZIGEN:

---

## ✨ OPTIE 1: CONFIG OBJECT IN HTML (Makkelijkst!) ⭐

### **Files die je moet aanpassen:**

#### **1. scan-with-link-EASY-CONFIG.html** (regels 61-68)
```javascript
// ==========================================
// 📞 CONTACT INFO CONFIG - WIJZIG HIER! 🎯
// ==========================================
const CONTACT_CONFIG = {
  phone: '+31612345678',           // ← JOUW TELEFOONNUMMER
  whatsapp: '31612345678',         // ← ZONDER + EN SPATIES
  email: 'info@contentscale.site', // ← JOUW EMAIL
  website: 'https://contentscale.site/contact', // ← CONTACT URL
  companyName: 'ContentScale'      // ← BEDRIJFSNAAM
};
```

#### **2. contact-form-with-lead.html** (voeg toe na `<script>` tag)
```javascript
// ==========================================
// 📞 CONTACT INFO CONFIG - WIJZIG HIER! 🎯
// ==========================================
const CONTACT_CONFIG = {
  phone: '+31612345678',
  whatsapp: '31612345678',
  email: 'info@contentscale.site',
  website: 'https://contentscale.site/contact',
  companyName: 'ContentScale'
};
```

**Dan zoek en vervang in de HTML:**
```html
<!-- ZOEK: -->
href="https://wa.me/31612345678"

<!-- VERVANG DOOR: -->
:href="CONTACT_CONFIG.whatsappUrl"

<!-- EN ZOEK: -->
href="https://contentscale.site/contact"

<!-- VERVANG DOOR: -->
:href="CONTACT_CONFIG.website"
```

---

## 🚀 OPTIE 2: ENVIRONMENT VARIABLES (Railway) - Professioneel! ⭐⭐

### **Waarom dit beter is:**
- ✅ Centraal op 1 plek (Railway dashboard)
- ✅ Geen code wijzigen nodig
- ✅ Makkelijk te switchen (dev/test/prod)
- ✅ Veilig voor secrets (email API keys etc)

### **Setup in 5 stappen:**

#### **STAP 1: Railway Dashboard**
```
1. Open: https://railway.app
2. Login
3. Click je project: ContentScale Platform
4. Click tab: "Variables"
```

#### **STAP 2: Voeg Variables Toe**
```
Klik: ➕ New Variable

Voeg toe:
┌─────────────────────────────────────────────┐
│ Variable Name         │ Value               │
├─────────────────────────────────────────────┤
│ CONTACT_PHONE         │ +31612345678        │
│ CONTACT_WHATSAPP      │ 31612345678         │
│ CONTACT_EMAIL         │ ot@contentscale.nl  │
│ CONTACT_URL           │ https://...         │
│ COMPANY_NAME          │ ContentScale        │
└─────────────────────────────────────────────┘
```

#### **STAP 3: Update server.js**

Voeg toe na `require` statements:

```javascript
// ==========================================
// CONTACT INFO CONFIG
// ==========================================
const CONTACT_INFO = {
  phone: process.env.CONTACT_PHONE || '+31612345678',
  whatsapp: process.env.CONTACT_WHATSAPP || '31612345678',
  email: process.env.CONTACT_EMAIL || 'info@contentscale.site',
  website: process.env.CONTACT_URL || 'https://contentscale.site/contact',
  companyName: process.env.COMPANY_NAME || 'ContentScale'
};

// Helper function to get contact info
function getContactInfo() {
  return {
    phone: CONTACT_INFO.phone,
    whatsapp: CONTACT_INFO.whatsapp,
    whatsapp_url: `https://wa.me/${CONTACT_INFO.whatsapp}`,
    email: CONTACT_INFO.email,
    contact_url: CONTACT_INFO.website,
    company_name: CONTACT_INFO.companyName
  };
}

// New API endpoint
app.get('/api/contact-info', (req, res) => {
  res.json({
    success: true,
    contact: getContactInfo()
  });
});
```

#### **STAP 4: Update HTML files**

Gebruik de API om contact info op te halen:

```javascript
// In scan-with-link.html en contact-form.html
let CONTACT_CONFIG = {
  phone: '+31612345678',      // Fallback
  whatsapp: '31612345678',
  email: 'info@contentscale.site',
  website: 'https://contentscale.site/contact',
  whatsappUrl: 'https://wa.me/31612345678'
};

// Fetch from API on load
async function loadContactInfo() {
  try {
    const response = await fetch('/api/contact-info');
    const data = await response.json();
    if (data.success) {
      CONTACT_CONFIG = {
        phone: data.contact.phone,
        whatsapp: data.contact.whatsapp,
        email: data.contact.email,
        website: data.contact.contact_url,
        whatsappUrl: data.contact.whatsapp_url
      };
      console.log('✅ Contact info loaded from server');
    }
  } catch (error) {
    console.log('⚠️ Using fallback contact info');
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
  loadContactInfo();
  // ... rest of init code
});
```

#### **STAP 5: Redeploy**
```
Railway auto-deploys when you push to Git
OF
Manual redeploy in Railway dashboard
```

---

## 📍 WAAR STAAT CONTACT INFO NU?

### **Current Files met hardcoded nummers:**

#### **1. scan-with-link.html**
```
Regel ~120: href="https://contentscale.site/contact"
Regel ~123: href="https://wa.me/31612345678"
Regel ~150: href="https://contentscale.site/contact"
Regel ~153: href="https://wa.me/31612345678"
Regel ~170: href="https://contentscale.site/contact"
```

#### **2. contact-form-with-lead.html**
```
Regel ~200: href="mailto:info@contentscale.site"
Regel ~203: href="https://wa.me/31612345678"
Regel ~206: tel:+31612345678
```

#### **3. unified-scan-page.html** (de publieke scan)
```
Check of deze ook contact buttons heeft!
```

---

## 🔧 QUICK FIX - FIND & REPLACE

Als je snel wilt aanpassen zonder config:

### **STAP 1: Open alle HTML files**
```
- scan-with-link.html
- contact-form-with-lead.html
- unified-scan-page.html (als relevant)
```

### **STAP 2: Find & Replace**

**VS Code / Editor:**
```
CTRL+SHIFT+F (Find in Files)

ZOEK:    https://wa.me/31612345678
VERVANG: https://wa.me/JOUW_NUMMER

ZOEK:    31612345678
VERVANG: JOUW_NUMMER

ZOEK:    info@contentscale.site
VERVANG: JOUW_EMAIL

ZOEK:    https://contentscale.site/contact
VERVANG: JOUW_CONTACT_URL
```

**Let op WhatsApp formaat:**
```
✅ GOED: 31612345678 (landcode + nummer, geen + en spaties)
❌ FOUT: +31 6 12345678
❌ FOUT: +31612345678
❌ FOUT: 06-12345678
```

---

## 📝 JOUW CONTACT INFO TEMPLATE

Vul dit in voor jezelf:

```javascript
const MIJN_CONTACT_INFO = {
  // WhatsApp (zonder + en spaties)
  whatsapp: '31612345678',        // ← Pas aan
  
  // Telefoon (met +)
  phone: '+31612345678',           // ← Pas aan
  
  // Email
  email: 'ot@contentscale.nl',    // ← Pas aan
  
  // Contact URL
  website: 'https://contentscale.site/contact', // ← Pas aan
  
  // Bedrijfsnaam
  companyName: 'ContentScale'      // ← Pas aan
};
```

**Dan gebruik dit om overal te vervangen!**

---

## 🎯 WELKE OPTIE KIEZEN?

### **Kies OPTIE 1 (Config Object) als:**
- ✅ Je wilt snel starten
- ✅ Contact info verandert niet vaak
- ✅ Je hebt maar 1 environment (prod)

### **Kies OPTIE 2 (Environment Variables) als:**
- ✅ Je wilt professionele setup
- ✅ Je hebt dev/test/prod environments
- ✅ Je wilt contact info centraal beheren
- ✅ Je gaat email API keys gebruiken

---

## 🚀 MIJN AANBEVELING:

**Start met OPTIE 1, upgrade later naar OPTIE 2**

### **Nu (Quick Start):**
```
1. Download: scan-with-link-EASY-CONFIG.html
2. Open in editor
3. Pas regels 61-68 aan (CONTACT_CONFIG)
4. Upload naar /public/scan-with-link.html
5. Done! ✅
```

### **Later (Professional Setup):**
```
1. Add env variables in Railway
2. Update server.js met CONTACT_INFO
3. Add /api/contact-info endpoint
4. Update HTML files om API te gebruiken
5. Profit! 🚀
```

---

## ✅ CHECKLIST

### **Na wijzigen, test deze:**
- [ ] Share link expired page → contact buttons werken
- [ ] Share link limit reached → WhatsApp button werkt
- [ ] Contact form footer → alle links werken
- [ ] Scan result CTA → contact button werkt
- [ ] Email links (mailto:) werken
- [ ] Telefoon links (tel:) werken
- [ ] WhatsApp opent juiste chat

---

## 🔍 DEBUGGING

### **WhatsApp werkt niet?**
```javascript
// Check format in browser console:
console.log('WhatsApp URL:', CONTACT_CONFIG.whatsappUrl);

// Should be: https://wa.me/31612345678
// NOT: https://wa.me/+31612345678
// NOT: https://wa.me/+31 6 12345678
```

### **Contact URL 404?**
```javascript
// Check if URL is correct:
console.log('Contact URL:', CONTACT_CONFIG.website);

// Test in browser directly
window.open(CONTACT_CONFIG.website, '_blank');
```

---

## 📞 FORMAAT VOORBEELDEN

### **Nederland:**
```javascript
whatsapp: '31612345678',     // 06-nummer
whatsapp: '31207654321',     // vast nummer
phone: '+31 6 12345678',
phone: '+31 20 7654321',
```

### **België:**
```javascript
whatsapp: '32471234567',     // mobiel
phone: '+32 471 12 34 67',
```

### **Duitsland:**
```javascript
whatsapp: '4915112345678',
phone: '+49 151 12345678',
```

---

**TIP:** Gebruik **scan-with-link-EASY-CONFIG.html** - daar staat alles al klaar bovenaan! 🎯


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================










// ==========================================
// 📞 SCANNER HYBRID  - WIJZIG HIER! 🎯
// ==========================================


🎯 HYBRID SEO SCORING SYSTEM
ContentScale.site - Complete Scoring Documentation
Version: 2.0 (Hybrid)
Total Score: 100 punten
Frameworks: GRAAF (50pts) + CRAFT (30pts) + Technical SEO (20pts)

📋 SYSTEEM OVERZICHT
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID SCORING PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAP 1: PARSER (Deterministisch)                               │
│  ════════════════════════════════                               │
│  • Telt alle elementen in de HTML/content                       │
│  • Exact, reproduceerbaar, geen variatie                        │
│  • Output: Raw counts (quotes, stats, links, etc.)              │
│                                                                  │
│                          ↓                                       │
│                                                                  │
│  STAP 2: CLAUDE AI (Kwaliteitsvalidatie)                        │
│  ═══════════════════════════════════════                        │
│  • Ontvangt parser counts + content snippets                    │
│  • Valideert KWALITEIT van gedetecteerde elementen              │
│  • Output: Validated counts + quality flags                     │
│                                                                  │
│                          ↓                                       │
│                                                                  │
│  STAP 3: DETERMINISTIC SCORING                                  │
│  ═════════════════════════════                                  │
│  • Berekent punten op basis van validated counts                │
│  • Exacte formules, 100% reproduceerbaar                        │
│  • Output: Final score + detailed breakdown                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

🏆 GRAAF FRAMEWORK (50 PUNTEN)
By Ottmar Francisca

G - GENUINELY CREDIBLE (10 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Expert Quotes	Citaten met quotes ""	Naam + titel/functie aanwezig?	0-4	≥3 valid = 4pts, 2 = 3pts, 1 = 2pts, 0 = 0pts
Statistics	Getallen met % of cijfers	Bron/citation aanwezig?	0-3	≥10 valid = 3pts, 5-9 = 2pts, 1-4 = 1pt
Source Citations	Links naar externe bronnen	Autoritaire bron? (.gov, .edu, research)	0-3	≥5 valid = 3pts, 3-4 = 2pts, 1-2 = 1pt
Parser Regex:

// Expert Quotes
/"[^"]{20,}"[^"]*(?:said|says|according to|stated|explains|notes)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi
// Statistics with Citations
/(\d+(?:\.\d+)?%|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:million|billion|percent))[^.]*(?:according to|source:|study|research|survey)/gi

Claude Validation Prompt:

Voor elk expert quote, bevestig:
1. Heeft een naam (voornaam + achternaam)?
2. Heeft een titel/functie/organisatie?
3. Is het een echte quote (niet parafrase)?
Response: { "validatedQuotes": 3, "rejectedQuotes": ["Quote 2 - geen naam"] }

R - RELEVANCE (10 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Keyword in Title	Target keyword in <title>	Natuurlijke plaatsing?	0-3	Exact match = 3pts, partial = 2pts, none = 0pts
Keyword in First 100 Words	Keyword in eerste paragraaf	Contextually relevant?	0-3	Present = 3pts, absent = 0pts
Keyword Density	Frequentie berekening	Niet keyword stuffing?	0-3	1-2% = 3pts, 0.5-1% = 2pts, 2-3% = 1pt, >3% = 0pts
LSI Keywords	Semantisch gerelateerde termen	Natuurlijk gebruik?	0-1	≥8 LSI = 1pt
Formule Keyword Density:

keywordDensity = (keywordCount / totalWords) * 100
// Scoring
if (density >= 1 && density <= 2) return 3;
if (density >= 0.5 && density < 1) return 2;
if (density > 2 && density <= 3) return 1;
return 0; // Over-optimized or under-optimized

A - ACTIONABILITY (10 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Step-by-Step Instructions	Genummerde lijsten, "Step 1", "How to"	Duidelijke actiestappen?	0-3	≥5 steps = 3pts, 3-4 = 2pts, 1-2 = 1pt
Practical Examples	"For example", "such as", code blocks	Concrete voorbeelden?	0-3	≥3 examples = 3pts, 2 = 2pts, 1 = 1pt
CTA Presence	Buttons, "Click here", "Download", "Get"	Duidelijke call-to-action?	0-3	Strong CTA = 3pts, moderate = 2pts, weak = 1pt
Tools/Resources	Links naar tools, downloads, templates	Bruikbare resources?	0-1	Present = 1pt
Parser Regex:

// Step-by-Step
/(?:step\s*\d|^\d+\.\s|first,|second,|third,|finally,|next,)/gmi
// Examples
/(?:for example|for instance|such as|e\.g\.|like this|here's an example)/gi
// CTA
/(?:click here|download|get started|sign up|try now|learn more|contact us|buy now|subscribe)/gi

A - ACCURACY (10 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Data Citations	Links + cijfers	Betrouwbare bronvermelding?	0-3	≥5 = 3pts, 3-4 = 2pts, 1-2 = 1pt
Case Studies	"Case study", bedrijfsnamen + resultaten	Echte case met metrics?	0-3	≥2 = 3pts, 1 = 2pts
Fact Sources	.gov, .edu, research links	Autoritaire bronnen?	0-2	≥3 = 2pts, 1-2 = 1pt
Publication Date	<time>, "Published:", "Updated:"	Datum aanwezig?	0-2	Present = 2pts
Claude Validation:

Case Study validatie criteria:
1. Noemt specifiek bedrijf/persoon
2. Bevat concrete resultaten (%, €, tijdsbestek)
3. Is niet hypothetisch ("could", "might")
Validated: { "caseStudies": 2, "details": ["Company X - 150% growth", "User Y - saved 10 hours"] }

F - FRESHNESS (10 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Recent Updates	"Last modified", "Updated" date	Recente datum (< 6 maanden)?	0-3	<6mo = 3pts, 6-12mo = 2pts, >12mo = 1pt
Current Year Mentions	"2024", "2025" in tekst	Relevante jaartallen?	0-3	≥3 mentions = 3pts, 2 = 2pts, 1 = 1pt
Data Recency	Jaren in statistieken	Data van afgelopen 2 jaar?	0-3	Current year = 3pts, last year = 2pts
Trending Topics	Actuele termen, nieuwe technologie	Relevant voor nu?	0-1	Present = 1pt
✂️ CRAFT FRAMEWORK (30 PUNTEN)
By Julia McCoy

C - CUT THE FLUFF (7 punten)
Element	Parser Meet	Claude Valideert	Punten	Formule
Flesch Reading Ease	Automatische berekening	N/A (objectief)	0-3	60-70 = 3pts, 50-60 = 2pts, 70-80 = 2pts
Sentence Length	Gemiddelde woorden/zin	N/A (objectief)	0-2	≤20 words = 2pts, 21-25 = 1pt
Short Paragraphs	Paragrafen >150 woorden	N/A (objectief)	0-2	0-2 long = 2pts, 3-4 = 1pt, ≥5 = 0pts
Flesch Formula:

fleschScore = 206.835 - (1.015 × ASL) - (84.6 × ASW)
// ASL = Average Sentence Length (words per sentence)
// ASW = Average Syllables per Word

R - REVIEW & OPTIMIZE (8 punten)
Element	Parser Meet	Claude Valideert	Punten	Formule
Keyword Optimization	Density berekening	Niet over-optimized?	0-3	1-2% = 3pts
Meta Title Length	Character count	Compelling?	0-2	50-60 chars = 2pts
Meta Description	Character count	Includes CTA?	0-2	140-160 chars = 2pts
LSI Keywords	Semantische termen	Natuurlijk?	0-1	≥8 = 1pt
Optimale Meta Lengths:

Title: 50-60 characters (max 60 voor Google)
Description: 140-160 characters (max 160 voor Google)

A - ADD VISUALS (6 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Images with Alt Text	<img> met alt=""	Descriptieve alt?	0-2	≥3 = 2pts, 1-2 = 1pt
Videos	<video>, YouTube embeds	Relevant?	0-1	Present = 1pt
Tables	<table> elementen	Data tables (niet layout)?	0-2	≥2 = 2pts, 1 = 1pt
Comparison Tables	Tables met vs/comparison	Vergelijkingstabel?	0-1	Present = 1pt
Parser Detection:

// Images with Alt
const images = html.match(/<img[^>]+alt=["'][^"']+["'][^>]*>/gi);
// YouTube/Video Embeds
const videos = html.match(/<iframe[^>]+(?:youtube|vimeo)[^>]*>|<video[^>]*>/gi);
// Data Tables (exclude layout tables)
const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi)
  .filter(t => t.includes('<th') || t.includes('<thead'));

F - FAQ INTEGRATION (5 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
FAQ Count	FAQ schema, "Q:", "Question:"	Echte vragen?	0-3	≥8 = 3pts, 5-7 = 2pts, 3-4 = 1pt
FAQ Answer Length	Woorden per antwoord	Volledig antwoord?	0-1	80-150 words avg = 1pt
Explicit FAQ Heading	"FAQ", "Frequently Asked"	Duidelijke sectie?	0-1	Present = 1pt
FAQ Schema Detection:

// JSON-LD FAQ Schema
const faqSchema = /"@type":\s*"FAQPage"/i;
// HTML FAQ Patterns
const faqPatterns = /(?:frequently asked|faq|common questions)/gi;
const qaPatterns = /<(?:dt|h[3-4])[^>]*>.*?\?.*?<\/(?:dt|h[3-4])>/gi;

T - TRUST BUILDING (4 punten)
Element	Parser Detecteert	Claude Valideert	Punten	Formule
Author Bio	Author section, "About the author"	Echte persoon?	0-1	Present = 1pt
Credentials	Titels, certificeringen	Relevante expertise?	0-1	Shown = 1pt
Testimonials	Quotes, ratings, reviews	Authentiek?	0-1	Present = 1pt
Authority Links	Links naar autoritaire sites	.gov, .edu, research?	0-1	≥3 = 1pt
🔧 TECHNICAL SEO (20 PUNTEN)
Element	Parser Meet	Punten	Formule
Meta Title Length	Character count	0-3	50-60 = 3pts, 40-50 = 2pts, 60-70 = 1pt
Meta Description Length	Character count	0-3	140-160 = 3pts, 120-140 = 2pts, 160-180 = 1pt
Schema Markup	JSON-LD detectie	0-4	Multiple types = 4pts, single = 2pts, none = 0pts
Internal Links	<a href> naar zelfde domain	0-4	≥30 = 4pts, 20-29 = 3pts, 10-19 = 2pts, 5-9 = 1pt
Heading Hierarchy	H1 → H2 → H3 structuur	0-3	Correct hierarchy = 3pts
Table of Contents	TOC sectie, anchor links	0-2	Present = 2pts
Mobile Responsive	Viewport meta, responsive CSS	0-1	Yes = 1pt
Schema Types Detected:

const schemaTypes = [
  'Article', 'BlogPosting', 'HowTo', 'FAQPage',
  'Product', 'Review', 'LocalBusiness', 'Organization',
  'Person', 'BreadcrumbList', 'WebPage'
];
// Scoring
if (typesFound >= 3) return 4;
if (typesFound >= 2) return 3;
if (typesFound >= 1) return 2;
return 0;

📊 SCORE THRESHOLDS
Score Range	Rating	Beschrijving
90-100	🏆 Excellent	Top-tier content, AI Overview ready
80-89	✅ Good	Strong content, minor improvements needed
70-79	🔶 Average	Decent content, several areas to improve
60-69	⚠️ Below Average	Significant improvements needed
0-59	❌ Poor	Major rewrite recommended
🔄 CLAUDE VALIDATION PAYLOAD
Request naar Claude:
{
  "contentUrl": "https://example.com/article",
  "parserCounts": {
    "expertQuotes": 5,
    "statistics": 12,
    "internalLinks": 25,
    "faqCount": 8,
    "images": 6
  },
  "snippets": {
    "expertQuotes": [
      "\"AI will transform SEO by 2025\" - John Smith, CEO of TechCorp",
      "\"Content is king\" - according to industry experts",
      "\"Focus on user intent\" said the consultant"
    ],
    "statistics": [
      "78% of marketers use AI tools (Source: HubSpot 2024)",
      "3.5 billion searches per day",
      "SEO traffic increased by 150%"
    ]
  }
}

Response van Claude:
{
  "validation": {
    "expertQuotes": {
      "validated": 2,
      "rejected": [
        { "index": 1, "reason": "No name/attribution" },
        { "index": 2, "reason": "Generic 'consultant', no specific person" }
      ]
    },
    "statistics": {
      "validated": 2,
      "rejected": [
        { "index": 1, "reason": "No source citation" }
      ]
    }
  },
  "qualityFlags": {
    "expertQuotesQuality": "medium",
    "statisticsQuality": "high",
    "overallCredibility": "good"
  }
}

📈 SCORING CALCULATION EXAMPLE
Input Content Analysis:
Parser Detected:
- Expert Quotes: 5
- Statistics: 12
- Internal Links: 25
- FAQ Count: 8
- Images: 6
- Meta Title: 55 chars
- Meta Desc: 155 chars
Claude Validated:
- Expert Quotes: 3 (2 rejected - no attribution)
- Statistics: 10 (2 rejected - no source)
- All other elements: validated

Score Calculation:
GRAAF (50 pts):
├── Credibility (10):
│   ├── Expert Quotes: 3 validated → 4 pts
│   ├── Statistics: 10 validated → 3 pts
│   └── Sources: 5 → 3 pts
│   └── SUBTOTAL: 10/10 ✓
├── Relevance (10):
│   ├── Keyword in Title: yes → 3 pts
│   ├── Keyword First 100: yes → 3 pts
│   ├── Keyword Density: 1.5% → 3 pts
│   └── LSI Keywords: 10 → 1 pt
│   └── SUBTOTAL: 10/10 ✓
├── Actionability (10):
│   ├── Step-by-Step: 6 steps → 3 pts
│   ├── Examples: 4 → 3 pts
│   ├── CTA: strong → 3 pts
│   └── Tools: yes → 1 pt
│   └── SUBTOTAL: 10/10 ✓
├── Accuracy (10):
│   ├── Data Citations: 8 → 3 pts
│   ├── Case Studies: 2 → 3 pts
│   ├── Fact Sources: 4 → 2 pts
│   └── Publication Date: yes → 2 pts
│   └── SUBTOTAL: 10/10 ✓
└── Freshness (10):
    ├── Recent Updates: 2 months → 3 pts
    ├── Current Year: 4 mentions → 3 pts
    ├── Data Recency: 2024 → 3 pts
    └── Trending: yes → 1 pt
    └── SUBTOTAL: 10/10 ✓
GRAAF TOTAL: 50/50
CRAFT (30 pts):
├── Cut Fluff (7): 6/7
├── Review Optimize (8): 8/8
├── Add Visuals (6): 5/6
├── FAQ Integration (5): 5/5
└── Trust Building (4): 3/4
CRAFT TOTAL: 27/30
Technical SEO (20 pts):
├── Meta Title: 55 chars → 3 pts
├── Meta Desc: 155 chars → 3 pts
├── Schema: 3 types → 4 pts
├── Internal Links: 25 → 3 pts
├── Heading Hierarchy: correct → 3 pts
├── ToC: present → 2 pts
└── Mobile: yes → 1 pt
TECHNICAL TOTAL: 19/20
═══════════════════════════════
FINAL SCORE: 96/100 🏆 Excellent
═══════════════════════════════

🔧 IMPLEMENTATION NOTES
Parser Priority (Deterministic):
All counting is done by regex/cheerio parser
Results are 100% reproducible
No AI variability in detection
Claude Priority (Quality Validation):
Only validates QUALITY, not quantity
Can reject elements that don't meet criteria
Cannot ADD elements parser didn't detect
Score Priority (Deterministic):
Uses validated counts from Claude
Applies exact formulas
Same input = same output, always
📞 CONTACT
Ottmar Francisca
AI-Era SEO Expert since 2018

Website: contentscale.site
WhatsApp: +31 628 07 3996
Email: ottevjfrancisca@gmail.com

// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================


// ==========================================
// 📞 BANNER TOP CONTENTSCALE PRIJZEN  - WIJZIG HIER! 🎯
// ==========================================

