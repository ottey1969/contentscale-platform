// ============================================================
// rewriter-helpers.js — Drop-in helpers for ContentScale rewriter
// Add to project root, then require() where needed in index.js
// ============================================================
//
// Exports:
//   - autoFillGSC(pageUrl, baseUrl)          — wraps /api/gsc/auto-fill internal call
//   - fetchCompetitorHtml(url)               — fetches + cleans a competitor URL
//   - extractAuthor(html)                    — finds author; falls back to Ottmar
//   - extractLayoutSkeleton(html)            — returns DOM skeleton preserving structure
//   - validateBofuQuality(html)              — checks forbidden patterns + required elements
//   - stripForbiddenPatterns(html)           — pre-cleans obvious AI giveaways

const DEFAULT_AUTHOR = {
  name: 'Ottmar J.G. Francisca',
  url: 'https://contentscale.site/about',
  image: 'https://raw.githubusercontent.com/ottey1969/contentscale-platform/main/public/blog/images/ottmar-francisca.jpg',
  jobTitle: 'Founder · ContentScale · GRAAF Framework Creator'
};

// ── 1. GSC AUTO-FILL (internal call, no HTTP hop) ──────────────────────────
// Call this at start of /api/content/analyse-rewrite when req.body has
// no gsc_impressions. It uses the same _gscServiceAccount token flow
// that /api/gsc/auto-fill uses, but as a direct function call.
//
// Returns: { impressions, clicks, ctr, position, topKeyword, topQueries, queryCount } or null
async function autoFillGSC(pageUrl, _gscServiceAccount, axios) {
  if (!_gscServiceAccount || !pageUrl) return null;
  try {
    const { URL } = require('url');
    const { createSign } = require('crypto');
    const urlObj = new URL(pageUrl);

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: _gscServiceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(_gscServiceAccount.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const tokenResp = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResp.data.access_token;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const siteUrlFormats = [
      `https://${urlObj.hostname}/`,
      `http://${urlObj.hostname}/`,
      `sc-domain:${urlObj.hostname.replace(/^www\./, '')}`,
      `https://www.${urlObj.hostname.replace(/^www\./, '')}/`,
    ];

    async function gscQ(siteUrl, dims, filterPage) {
      const body = {
        startDate, endDate, dimensions: dims,
        dimensionFilterGroups: filterPage ? [{ filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] }] : [],
        rowLimit: 20
      };
      const r = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) }
      );
      if (!r.ok) throw new Error((await r.json()).error?.message || r.status);
      return (await r.json()).rows || [];
    }

    let pageRows = [], queryRows = [];
    for (const fmt of siteUrlFormats) {
      try {
        pageRows = await gscQ(fmt, ['page'], true);
        queryRows = await gscQ(fmt, ['query'], true);
        break;
      } catch { /* try next */ }
    }

    const sorted = [...queryRows].sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
    return {
      impressions: Math.round(pageRows[0]?.impressions || 0),
      clicks: Math.round(pageRows[0]?.clicks || 0),
      ctr: parseFloat(((pageRows[0]?.ctr || 0) * 100).toFixed(2)),
      position: parseFloat((pageRows[0]?.position || 0).toFixed(1)),
      topKeyword: sorted[0]?.keys[0] || '',
      topQueries: sorted.slice(0, 15).map(r => r.keys[0]),
      queryCount: queryRows.length,
      autoFilled: true
    };
  } catch (e) {
    console.warn('[gsc autofill]', e.message);
    return null;
  }
}

// ── 2. COMPETITOR FETCH ────────────────────────────────────────────────────
// Accepts either a URL (we fetch + strip) or already-provided HTML.
// Returns { url, html, wordCount, headings, error } — at most 25k chars of body.
async function fetchCompetitorHtml(input) {
  // index.js passes either a string URL or {url, html?}
  if (typeof input === 'string') input = { url: input };
  // input = { url, html? }
  if (input.html && input.html.length > 200) {
    return analyzeCompetitorHtml(input.url || 'manual-paste', input.html);
  }
  if (!input.url) return { url: '', error: 'no url or html provided' };
  try {
    const resp = await fetch(input.url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentScaleBot/1.0)' }
    });
    if (!resp.ok) return { url: input.url, error: `HTTP ${resp.status}` };
    const html = await resp.text();
    return analyzeCompetitorHtml(input.url, html);
  } catch (e) {
    return { url: input.url, error: e.message };
  }
}

function analyzeCompetitorHtml(url, html) {
  // Strip nav/footer/script/style but keep main content structure
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');
  const textOnly = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const headings = [...cleaned.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .slice(0, 20)
    .map(m => ({ level: parseInt(m[1], 10), text: m[2].replace(/<[^>]+>/g, '').trim() }));
  return {
    url,
    html: cleaned.slice(0, 25000),
    textPreview: textOnly.slice(0, 2000),
    wordCount: textOnly.split(/\s+/).length,
    headings,
    hasSchema: /application\/ld\+json/i.test(html),
    hasFaq: /<summary|<details|itemtype="[^"]*FAQ/i.test(html),
    hasTable: /<table/i.test(cleaned)
  };
}

// ── 3. AUTHOR EXTRACTION ───────────────────────────────────────────────────
// Looks through <meta name="author">, schema:Person/@author, .author/byline classes.
// If nothing found, returns DEFAULT_AUTHOR (Ottmar).
function extractAuthor(html) {
  if (!html) return { ...DEFAULT_AUTHOR, detected: false };

  // 1. JSON-LD schema:author
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of ldBlocks) {
    try {
      const obj = JSON.parse(b[1].trim());
      const candidates = [];
      if (Array.isArray(obj['@graph'])) candidates.push(...obj['@graph']);
      else candidates.push(obj);
      for (const c of candidates) {
        if (c?.author) {
          const a = Array.isArray(c.author) ? c.author[0] : c.author;
          if (a?.name) {
            return {
              name: a.name,
              url: a.url || a['@id'] || null,
              image: a.image || null,
              jobTitle: a.jobTitle || null,
              detected: true,
              source: 'schema'
            };
          }
        }
      }
    } catch { /* skip invalid ld+json */ }
  }

  // 2. <meta name="author">
  const metaM = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
  if (metaM) return { name: metaM[1].trim(), url: null, image: null, jobTitle: null, detected: true, source: 'meta' };

  // 3. Visible byline class / rel="author"
  const relM = html.match(/<a[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/i);
  if (relM) {
    const text = relM[1].replace(/<[^>]+>/g, '').trim();
    if (text.length >= 3 && text.length < 80) return { name: text, url: null, image: null, jobTitle: null, detected: true, source: 'rel' };
  }
  const bylineM = html.match(/class=["'][^"']*(?:byline|author-name|post-author)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (bylineM) {
    const text = bylineM[1].replace(/<[^>]+>/g, '').replace(/^\s*by\s+/i, '').trim();
    if (text.length >= 3 && text.length < 80) return { name: text, url: null, image: null, jobTitle: null, detected: true, source: 'byline' };
  }

  return { ...DEFAULT_AUTHOR, detected: false };
}

// ── 4. LAYOUT SKELETON EXTRACTION ──────────────────────────────────────────
// For layout-preserving rewrites: capture the original page's structural
// identity so the prompt can be told "fill these specific zones, don't
// invent a new layout".
//
// Returns {
//   rootTag, brandColors: [], fonts: [], customClasses: [],
//   sectionCount, hasHeader, hasFooter, hasSidebar,
//   schemaBlocks: [raw JSON-LD strings],
//   imageCount, ctaCount,
//   signature: short hash
// }
function extractLayoutSkeleton(html) {
  if (!html) return null;

  // Brand colors from inline styles + CSS variables
  const colorsSet = new Set();
  const hexRe = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g;
  const rgbRe = /rgba?\([^)]+\)/g;
  (html.match(hexRe) || []).forEach(c => colorsSet.add(c.toLowerCase()));
  (html.match(rgbRe) || []).forEach(c => colorsSet.add(c.replace(/\s+/g, '')));
  const brandColors = [...colorsSet].slice(0, 15);

  // CSS vars
  const cssVars = [...html.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)]
    .slice(0, 20)
    .map(m => ({ name: `--${m[1]}`, value: m[2].trim() }));

  // Font families
  const fonts = [...new Set(
    [...html.matchAll(/font-family\s*:\s*([^;"'}]+)/gi)].map(m => m[1].trim().split(',')[0].replace(/['"]/g, ''))
  )].slice(0, 6);

  // Custom classes (not utility)
  const classSet = new Set();
  [...html.matchAll(/class=["']([^"']+)["']/g)].forEach(m =>
    m[1].split(/\s+/).forEach(c => c && classSet.add(c))
  );
  const customClasses = [...classSet]
    .filter(c => !/^(text-|bg-|flex|grid|items-|justify-|w-|h-|p-|m-|px-|py-|mx-|my-|rounded|border|shadow|hover:|md:|lg:|sm:)/.test(c))
    .slice(0, 30);

  // Structural markers
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const hasHeader = /<header\b/i.test(html);
  const hasFooter = /<footer\b/i.test(html);
  const hasSidebar = /<aside\b/i.test(html) || /class=["'][^"']*sidebar/i.test(html);
  const imageCount = (html.match(/<img\b/gi) || []).length;
  const ctaCount = (html.match(/<(?:button|a)[^>]*class=["'][^"']*(?:btn|cta|button)/gi) || []).length;

  // Preserve existing JSON-LD schema blocks (we WILL re-emit these — don't invent new ones)
  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1].trim())
    .slice(0, 10);

  // Signature for change detection
  const crypto = require('crypto');
  const signature = crypto.createHash('sha256')
    .update([sectionCount, imageCount, ctaCount, customClasses.join(','), fonts.join(',')].join('|'))
    .digest('hex').slice(0, 12);

  return {
    brandColors,
    cssVars,
    fonts,
    customClasses,
    sectionCount,
    hasHeader,
    hasFooter,
    hasSidebar,
    imageCount,
    ctaCount,
    schemaBlocks,
    signature
  };
}

// ── 5. BOFU QUALITY VALIDATION ─────────────────────────────────────────────
// Returns { ok: bool, violations: [{code, hint}], score: 0-100 }
// Run on rewrite output; if !ok, trigger regenerate with violations fed back.
const FORBIDDEN_OPENERS = [
  /in\s+today['']s\s+(?:fast-paced\s+)?(?:digital\s+)?world/i,
  /in\s+the\s+ever-evolving\s+landscape/i,
  /gone\s+are\s+the\s+days\s+when/i,
  /in\s+an\s+era\s+(?:where|of)/i
];
const FORBIDDEN_WORDS = [
  /\bgame[- ]?changer\b/i,
  /\bunlock\s+(?:the\s+)?potential\b/i,
  /\bleverage\s+(?:the\s+)?power\b/i,
  /\bcutting[- ]edge\s+solution/i,
  /\brevolutioni[sz]e\s+your\b/i,
  /\btake\s+it\s+to\s+the\s+next\s+level\b/i,
  /\bsynergy\b/i,
  /\bparadigm\s+shift\b/i,
  /\bworld[- ]class\s+solution/i
];

function validateBofuQuality(html) {
  const violations = [];
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. No generic opener in first 300 chars
  const opener = text.slice(0, 300);
  for (const re of FORBIDDEN_OPENERS) {
    if (re.test(opener)) {
      violations.push({ code: 'generic_opener', hint: `Opening phrase "${opener.match(re)[0]}" is a known AI tell. Rewrite.` });
      break;
    }
  }

  // 2. No forbidden marketing words anywhere
  const foundWords = [];
  for (const re of FORBIDDEN_WORDS) {
    const m = text.match(re);
    if (m) foundWords.push(m[0]);
  }
  if (foundWords.length) {
    violations.push({ code: 'forbidden_words', hint: `Remove or replace: ${foundWords.join(', ')}` });
  }

  // 3. At least one cited statistic (look for number + year/source pattern)
  const hasCitedStat = /\b\d{1,3}(?:\.\d+)?%|\b\d{1,4}[x×]\b|\b\d{4}\b/.test(text) &&
                       /\(.*?\b(?:20\d{2})\b.*?\)|source:|according to/i.test(text);
  if (!hasCitedStat) {
    violations.push({ code: 'no_cited_stat', hint: 'At least one statistic with (source, year) citation required.' });
  }

  // 4. At least one concrete example (named entity pattern)
  const hasConcreteExample = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/.test(text); // crude: capitalized multi-word entity
  if (!hasConcreteExample) {
    violations.push({ code: 'no_concrete_example', hint: 'Add at least one named entity (client, tool, brand).' });
  }

  // 5. Minimum word count for BOFU
  const wc = text.split(/\s+/).length;
  if (wc < 800) {
    violations.push({ code: 'too_short', hint: `Only ${wc} words — BOFU pages need 800+` });
  }

  // 6. Same sentence starter repeated
  const sentences = text.split(/[.!?]\s+/).filter(s => s.length > 10);
  const starters = sentences.map(s => s.split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const starterCounts = {};
  starters.forEach(s => { starterCounts[s] = (starterCounts[s] || 0) + 1; });
  const topRepeated = Object.entries(starterCounts).find(([, c]) => c >= 4);
  if (topRepeated) {
    violations.push({ code: 'repeated_starter', hint: `Sentences starting with "${topRepeated[0]}" appear ${topRepeated[1]}× — vary openings.` });
  }

  const score = Math.max(0, 100 - violations.length * 15);
  return { ok: violations.length === 0, violations: violations.map(v => v.hint || v), score, wordCount: wc };
}

// Pre-scrub obvious patterns before even showing to validator
function stripForbiddenPatterns(html) {
  let out = html;
  out = out.replace(/\[UNVERIFIED\]|\[CONFIDENCE:\s*\d+\/\d+\]|\[FLAG FOR REVIEW\]|\[bron nodig\]|\[source needed\]/gi, '');
  // Em-dash run-on tell (—...—...—...)
  out = out.replace(/—([^—]{1,40})—([^—]{1,40})—/g, '—$1, $2—');
  return out;
}

// ── 6. INTENT MATCH SCORING ────────────────────────────────────────────────
// Scores how well a given slug/URL matches the target keyword's search intent.
// Used by bulk rewriter to decide: keep slug, suggest new slug, or 301 redirect.
//
// Returns: { score: 0-100, decision: 'keep'|'rewrite_new'|'redirect_301', reasoning }
//
// Scoring breakdown (100 total):
//   - 40pts: slug word-wise match to keyword tokens
//   - 30pts: commercial/transactional intent alignment (slug has buying markers)
//   - 30pts: GSC queries cluster around the keyword (semantic cohesion)
//
// Decisions:
//   score >= 80  → keep     (slug serves intent well, just rewrite content)
//   50-79        → keep     (borderline — flag for review but keep by default)
//   30-49        → rewrite_new (slug is weak — suggest new slug, keep old as content)
//   < 30         → redirect_301 (slug is wrong for intent — redirect old to new)

const COMMERCIAL_MARKERS = [
  'kopen', 'prijs', 'kosten', 'offerte', 'buy', 'price', 'cost', 'quote',
  'near-me', 'dichtbij', 'in-de-buurt', 'service', 'services', 'hire', 'inhuren',
  'best', 'beste', 'top', 'review', 'reviews', 'vergelijk', 'compare',
  'vs', 'versus', 'alternative', 'alternatief'
];

const INFORMATIONAL_MARKERS = [
  'how', 'hoe', 'what', 'wat', 'why', 'waarom', 'when', 'wanneer',
  'guide', 'gids', 'tutorial', 'tips', 'beginners', 'uitleg', 'explained'
];

function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length >= 2);
}

function scoreIntentMatch(slug, keyword, gscQueries) {
  const slugTokens = tokenize(slug);
  const kwTokens = tokenize(keyword);
  const queries = Array.isArray(gscQueries) ? gscQueries.slice(0, 15) : [];

  if (!kwTokens.length) {
    return { score: 0, decision: 'rewrite_new', reasoning: 'No keyword provided' };
  }

  // 1. SLUG WORD MATCH (40 pts)
  let wordMatchPts = 0;
  const matched = kwTokens.filter(t => slugTokens.includes(t));
  if (kwTokens.length > 0) {
    wordMatchPts = Math.round((matched.length / kwTokens.length) * 40);
  }

  // 2. INTENT ALIGNMENT (30 pts)
  // Does slug's character reflect the keyword's intent type?
  let intentPts = 15; // neutral baseline
  const kwHasCommercial = kwTokens.some(t => COMMERCIAL_MARKERS.includes(t));
  const kwHasInformational = kwTokens.some(t => INFORMATIONAL_MARKERS.includes(t));
  const slugHasCommercial = slugTokens.some(t => COMMERCIAL_MARKERS.includes(t));
  const slugHasInformational = slugTokens.some(t => INFORMATIONAL_MARKERS.includes(t));

  if (kwHasCommercial && slugHasCommercial) intentPts = 30;
  else if (kwHasInformational && slugHasInformational) intentPts = 30;
  else if (kwHasCommercial && slugHasInformational) intentPts = 5;   // bad mismatch
  else if (kwHasInformational && slugHasCommercial) intentPts = 5;   // bad mismatch
  else if (!kwHasCommercial && !kwHasInformational) intentPts = 20;  // neutral keyword
  else if (kwTokens.length <= 2) intentPts = 25; // short kw, less strict

  // 3. GSC QUERY COHESION (30 pts)
  let cohesionPts = 0;
  if (queries.length === 0) {
    cohesionPts = 15; // neutral when no GSC data
  } else {
    // How many of the top GSC queries contain the keyword tokens?
    const queryHits = queries.filter(q => {
      const qTokens = tokenize(q);
      const overlap = kwTokens.filter(t => qTokens.includes(t)).length;
      return overlap >= Math.max(1, Math.floor(kwTokens.length * 0.5));
    }).length;
    cohesionPts = Math.min(30, Math.round((queryHits / queries.length) * 30));
  }

  const score = wordMatchPts + intentPts + cohesionPts;

  let decision, reasoning;
  if (score >= 80) {
    decision = 'keep';
    reasoning = `Strong match (${wordMatchPts}+${intentPts}+${cohesionPts}) — slug serves this keyword well.`;
  } else if (score >= 50) {
    decision = 'keep';
    reasoning = `Moderate match (${wordMatchPts}+${intentPts}+${cohesionPts}) — slug works but could be sharper. Rewriting content keeps ranking authority.`;
  } else if (score >= 30) {
    decision = 'rewrite_new';
    reasoning = `Weak match (${wordMatchPts}+${intentPts}+${cohesionPts}) — suggest new slug for this intent, keep old page as different variant.`;
  } else {
    decision = 'redirect_301';
    reasoning = `Poor match (${wordMatchPts}+${intentPts}+${cohesionPts}) — slug wrong for intent. Publish new page and 301 redirect old slug.`;
  }

  return {
    score,
    decision,
    reasoning,
    breakdown: { word_match: wordMatchPts, intent_alignment: intentPts, gsc_cohesion: cohesionPts }
  };
}

// ── 7. GEO COMPETITOR FINDER ───────────────────────────────────────────────
// Auto-finds competitors via Google Custom Search, with geo scoping.
//
// geoScope options:
//   'city'     → "${keyword} ${city}"
//   'province' → "${keyword} ${province}"
//   'country'  → "${keyword}" with cr=countryCode (e.g. 'NL')
//   'custom'   → use customGeo string literally
//   'global'   → just the keyword
//
// Returns array of {url, title, snippet} — up to `limit` results, excludes own domain.
async function findCompetitorsByGeo(keyword, options = {}) {
  const {
    geoScope = 'city',
    city = '',
    province = '',
    country = '',
    countryCode = '', // ISO 3166-1 alpha-2, e.g. 'NL'
    customGeo = '',
    excludeDomain = '',
    limit = 3,
    apiKey = process.env.GOOGLE_SEARCH_API_KEY,
    cx = process.env.GOOGLE_SEARCH_CX
  } = options;

  if (!apiKey || !cx) {
    console.warn('[geo-competitors] GOOGLE_SEARCH_API_KEY or CX not configured');
    return [];
  }
  if (!keyword) return [];

  let query = keyword;
  let crParam = '';

  if (geoScope === 'city' && city) query = `${keyword} ${city}`;
  else if (geoScope === 'province' && province) query = `${keyword} ${province}`;
  else if (geoScope === 'country' && country) {
    query = `${keyword} ${country}`;
    if (countryCode) crParam = `&cr=country${countryCode.toUpperCase()}`;
  } else if (geoScope === 'custom' && customGeo) query = `${keyword} ${customGeo}`;
  // geoScope === 'global' → use keyword as-is

  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&num=${Math.min(10, limit + 3)}${crParam}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      console.warn(`[geo-competitors] Search failed: HTTP ${r.status}`);
      return [];
    }
    const data = await r.json();
    let items = (data.items || []).map(i => ({
      url: i.link,
      title: i.title,
      snippet: i.snippet || ''
    }));

    // Exclude own domain
    if (excludeDomain) {
      const ownHost = excludeDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      items = items.filter(i => {
        try {
          const h = new URL(i.url).hostname.replace(/^www\./, '');
          return !h.includes(ownHost) && !ownHost.includes(h);
        } catch { return true; }
      });
    }

    return items.slice(0, limit);
  } catch (e) {
    console.warn('[geo-competitors] Error:', e.message);
    return [];
  }
}

// ── 8. BULK JOB HELPERS ────────────────────────────────────────────────────
// Simple cost estimator for a bulk job (rough, good enough for UX warnings)
function estimateBulkCostUSD(itemCount, jobType) {
  // Based on Gemini 2.5 Flash @ ~$0.075/1M input + $0.30/1M output
  // analyse avg: ~3k in + 1k out = ~$0.001
  // execute avg: ~5k in + 10k out = ~$0.004
  // competitor fetch: ~$0.001 per competitor
  // write mode: analyse + execute + 3 competitors = ~$0.01
  // rewrite mode: same + GSC call (free) = ~$0.01
  const perItem = jobType === 'write' ? 0.012 : 0.014;
  return Math.round(itemCount * perItem * 100) / 100;
}


// ── EXPORTS ────────────────────────────────────────────────────────────────
module.exports = {
  DEFAULT_AUTHOR,
  autoFillGSC,
  fetchCompetitorHtml,
  extractAuthor,
  extractLayoutSkeleton,
  validateBofuQuality,
  stripForbiddenPatterns,
  scoreIntentMatch,
  findCompetitorsByGeo,
  estimateBulkCostUSD
};
