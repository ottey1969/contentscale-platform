'use strict';

const { createHash } = require('node:crypto');
const { pricingEvidenceUrl } = require('./prewrite-quality.cjs');
const { parse } = require('parse5');
const { validateUrl, fetchPublicGrowthHtml } = require('./growth-public-html-reader.cjs');
const { isBotCheck } = require('./gsc-report/site-audit.cjs');
const { resolveTarget, editorInstructions, registerRoutes } = require('./prewrite-implementation.cjs');

const ROOT = '/free-pre-write';
const API = '/api/free-pre-write';
const hash = value => createHash('sha256').update(value).digest('hex');
const texts = {
  en: ['Free Pre-Write Brief', 'Website', 'Topic or customer question', 'Search country', 'Generate brief', 'Save this private URL to reopen your report.', 'Research in progress…', 'Research could not be completed.', 'Open in Free Growth', 'Copy or download this brief for External AI', 'Proof & History', 'Paste at least 200 characters of approved page text', 'Approve text', 'Implementation Report (JSON)', 'Save report', 'Confirm publication', 'Verify live page', 'Saved', 'Verification pending', 'Open an earlier report', 'Private report URL', 'Open'],
  nl: ['Gratis Pre-Write Brief', 'Website', 'Onderwerp of klantvraag', 'Land voor zoekonderzoek', 'Maak een brief', 'Bewaar deze privélink om je rapport opnieuw te openen.', 'Onderzoek loopt…', 'Het onderzoek kon niet worden afgerond.', 'Open in Free Growth', 'Kopieer of download deze brief voor externe AI', 'Bewijs en historie', 'Plak minstens 200 tekens goedgekeurde paginatekst', 'Keur tekst goed', 'Implementatierapport (JSON)', 'Sla rapport op', 'Bevestig publicatie', 'Verifieer de livepagina', 'Opgeslagen', 'Verificatie in afwachting', 'Open een eerder rapport', 'Privélink naar rapport', 'Open'],
  es: ['Brief gratuito de Pre-Write', 'Sitio web', 'Tema o pregunta del cliente', 'País de búsqueda', 'Generar brief', 'Guarda este enlace privado para volver a abrir el informe.', 'Investigación en curso…', 'No se pudo completar la investigación.', 'Abrir en Free Growth', 'Copia o descarga este brief para la IA externa', 'Evidencias e historial', 'Pega al menos 200 caracteres de texto aprobado', 'Aprobar texto', 'Informe de implementación (JSON)', 'Guardar informe', 'Confirmar publicación', 'Verificar página publicada', 'Guardado', 'Verificación pendiente', 'Abrir un informe anterior', 'Enlace privado del informe', 'Abrir']
};
// The intent follows the live Google results first; the owner corrects it afterwards, on the result (owner 2026-11-28),
// with the professional term next to the plain words.
const intentLabels = {
  en: ['Correct the search intent', 'Automatic (follows Google)', 'Informational: learn or understand', 'Commercial: compare options before buying', 'Transactional: buy, hire or use a tool', 'Navigational: find a specific website'],
  nl: ['Corrigeer de zoekintentie', 'Automatisch (volgt Google)', 'Informatief: leren of begrijpen', 'Commercieel: opties vergelijken vóór aankoop', 'Transactioneel: kopen, inhuren of een tool gebruiken', 'Navigatie: een bepaalde website vinden'],
  es: ['Corregir la intención de búsqueda', 'Automática (sigue a Google)', 'Informacional: aprender o entender', 'Comercial: comparar opciones antes de comprar', 'Transaccional: comprar, contratar o usar una herramienta', 'Navegacional: encontrar un sitio web concreto']
};
// The five AI systems, as in the Tracker (owner 2026-11-28: "ai systemen wel").
const aiEngines = ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot'];
const aiLabels = {
  en: ['AI answers (optional)', 'Ask the question in each AI system and paste the complete answer with its sources. Without answers, Perplexity is checked automatically.', 'Question you asked the AI systems', 'Which Google source?', 'Not checked', 'Google AI Overview', 'Gemini', 'No AI Overview shown', 'Google AI Overview or Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot'],
  nl: ['AI-antwoorden (optioneel)', 'Stel de vraag in elk AI-systeem en plak het volledige antwoord met de bronnen. Zonder antwoorden wordt Perplexity automatisch gecontroleerd.', 'Vraag die je aan de AI-systemen stelde', 'Welke Google-bron?', 'Niet gecontroleerd', 'Google AI-overzicht', 'Gemini', 'Geen AI-overzicht getoond', 'Google AI-overzicht of Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot'],
  es: ['Respuestas de IA (opcional)', 'Haz la pregunta en cada sistema de IA y pega la respuesta completa con sus fuentes. Sin respuestas, Perplexity se comprueba automáticamente.', 'Pregunta que hiciste a los sistemas de IA', '¿Qué fuente de Google?', 'No comprobado', 'Google AI Overview', 'Gemini', 'No se mostró AI Overview', 'Google AI Overview o Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot']
};
function aiFields(lang) {
  const l = aiLabels[lang];
  const sources = ['', 'ai_overview', 'gemini', 'no_ai_overview'].map((value, index) => `<option value="${value}">${l[4 + index]}</option>`).join('');
  return `<fieldset class="ai"><legend>${l[0]}</legend><p>${l[1]}</p><label>${l[2]}<input name="ai-question" maxlength="300"></label>
    <label>${l[3]}<select name="google-source">${sources}</select></label>
    ${aiEngines.map((engine, index) => `<label>${l[8 + index]}<textarea name="ai-${engine}" rows="4" maxlength="12000"></textarea></label>`).join('')}</fieldset>`;
}
function manualEvidence(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const out = { ai_question: text(raw.ai_question, 300), google_source: ['ai_overview', 'gemini', 'no_ai_overview'].includes(raw.google_source) ? raw.google_source : '' };
  for (const engine of aiEngines) out[engine] = text(raw[engine], 12000);
  if (out.ai_question) out.ai_question_source = 'free_pre_write_owner';
  return out;
}
const intents = ['', 'informational', 'commercial', 'transactional', 'navigational'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const credentials = req => /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];

function page(lang, result) {
  const t = texts[lang];
  const labels = intentLabels[lang];
  const intent = `<label>${labels[0]}<select name="intent">${intents.map((value, index) => `<option value="${value}">${labels[index + 1]}</option>`).join('')}</select></label>`;
  const price = {
    en: ['Public URL for prices or quote policy (optional)', 'Add a public page showing your prices or that you quote on request.', 'Repair draft with pricing evidence'],
    nl: ['Openbare URL voor prijzen of offertebeleid (optioneel)', 'Voeg een openbare pagina toe met je prijzen of de vermelding ‘op aanvraag’.', 'Herstel concept met prijsbewijs'],
    es: ['URL pública de precios o presupuestos (opcional)', 'Añade una página pública con tus precios o con la indicación de que se ofrecen bajo consulta.', 'Reparar borrador con evidencia de precios']
  }[lang];
  const priceInput = `<label>${price[0]}<input name="pricing-source" type="url" maxlength="500"></label>`;
  const control = result ? `<p>${t[5]}</p><p id="status" role="status"></p><section id="decision" hidden></section><form id="intent-adjust" hidden>${intent}${priceInput}${aiFields(lang)}<button type="submit">${labels[0]}</button> <button type="button" id="repair-pricing" hidden>${price[2]}</button></form>
    <section id="implementation" hidden><h2>${t[9]}</h2><textarea id="editor" rows="15" readonly></textarea><p><a id="download" download="pre-write-brief.txt">${t[9]}</a></p>
    <label>${t[11]}<textarea id="copy" rows="5" minlength="200" maxlength="12000"></textarea></label><button id="approve" type="button">${t[12]}</button>
    <label>${t[13]}<textarea id="report" rows="7" maxlength="16000"></textarea></label><button id="save" type="button">${t[14]}</button>
    <button id="publish" type="button">${t[15]}</button> <button id="verify" type="button">${t[16]}</button></section>
    <section id="history" hidden><h2>${t[10]}</h2><div id="entries"></div><details><summary>${t[0]}</summary><pre id="research"></pre></details></section>` :
    `<form id="intake"><label>${t[1]}<input name="website" type="url" placeholder="https://" maxlength="500" required></label>
    <label>${t[2]}<input name="keyword" maxlength="300" required></label>
    <label>${t[3]}<input name="country" value="${{en:'US',nl:'NL',es:'ES'}[lang]}" pattern="[A-Za-z]{2}" maxlength="2" required></label>
    ${priceInput}${aiFields(lang)}<button>${t[4]}</button></form><p id="status" role="status"></p>
    <form id="reopen"><h2>${t[19]}</h2><label>${t[20]}<input name="link" type="url" required></label><button>${t[21]}</button></form>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t[0]}</title>
    <style>body{margin:0;padding:24px;background:#f5f7fc;color:#172337;font:16px system-ui}main{margin:auto;max-width:750px}form,section{background:white;border:1px solid #cbd5e1;border-radius:10px;padding:20px;margin:16px 0}label{display:block;margin:12px 0}fieldset{border:1px solid #cbd5e1;border-radius:8px;margin:12px 0}input,textarea,select{display:block;width:100%;box-sizing:border-box;padding:8px;border:1px solid #64748b;border-radius:4px;font:inherit}button{padding:8px 12px;background:#1d4ed8;color:white;border:0;border-radius:6px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1d4ed8}</style></head>
    <body><main><nav aria-label="Language"><a href="${ROOT}?lang=en">EN</a> · <a href="${ROOT}?lang=nl">NL</a> · <a href="${ROOT}?lang=es">ES</a></nav><h1>${t[0]}</h1>${control}</main><script>window.prewriteLabels=${JSON.stringify(t)};window.prewritePricingHelp=${JSON.stringify(price[1])};</script><script src="/free-prewrite.js" defer></script></body></html>`;
}

function view(row, strip) {
  const brief = strip(row.brief_json);
  let target, instructions, growth_url;
  if (['open', 'approved', 'published'].includes(row.status)) {
    target = resolveTarget(brief, row.public_site);
    if (target.mode === 'CREATE') instructions = editorInstructions(brief, row.public_site);
    else growth_url = '/free-growth?' + new URLSearchParams({
      url: target.url, query: row.keyword, lang: row.language, language: row.language,
      market: String(row.region || '').toUpperCase().replace(/^UK$/, 'GB')
    });
  }
  return { status: row.status, language: row.language, target, instructions, growth_url, brief, website: row.public_site, keyword: row.keyword, region: row.region };
}

// Site discovery (owner 2026-11-28): the homepage links, robots.txt "Sitemap:" lines, a sitemap index (Rank Math, Yoast) and
// its child sitemaps, plus pages on a sister subdomain that the site itself links to (a scanner on app.example.com).
async function discoverSite(site, { fetchHtml = fetchPublicGrowthHtml, homeReader } = {}) {
  const { sameSite } = require('./prewrite-quality.cjs');
  const home = await (homeReader || fetchHtml)(site, { redirects: 2, limit: 300000 });
  const canonical = validateUrl(home.final_url);
  if (home.status !== 200 || isBotCheck(home.html) || canonical.hostname.replace(/^www\./, '') !== new URL(site).hostname.replace(/^www\./, '')) {
    throw Error('Website unavailable');
  }
  site = canonical.origin + '/';
  const urls = new Set();
  const sister = new Set();
  const pending = [parse(home.html)];
  while (pending.length && urls.size < 500) {
    const node = pending.pop();
    const href = node.tagName === 'a' && node.attrs.find(attr => attr.name === 'href')?.value;
    if (href && !href.startsWith('#')) {
      try {
        const url = validateUrl(new URL(href, home.final_url).href);
        if (url.origin === canonical.origin && !url.search) urls.add(url.href);
        else if (!url.search && url.protocol === 'https:' && sameSite(url.href, canonical.href) && sister.size < 10) sister.add(url.href);
      } catch {}
    }
    pending.push(...(node.childNodes || []));
  }
  const { importSitemap } = require('./growth-free/sitemap-import.cjs');
  const locs = xml => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(match => match[1].replace(/&amp;/g, '&'));
  const sameOrigin = value => { try { return new URL(value).origin === canonical.origin; } catch { return false; } };
  const read = async (url, options) => { try { return await fetchHtml(url, options); } catch { return null; } };
  const candidates = [];
  const robots = await read(new URL('/robots.txt', site).href, { redirects: 1, allowText: true, limit: 100000 });
  if (robots?.status === 200) for (const match of String(robots.html || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)) if (sameOrigin(match[1])) candidates.push(match[1]);
  const defaults = [new URL('/sitemap_index.xml', site).href, new URL('/sitemap.xml', site).href, new URL('/wp-sitemap.xml', site).href];
  candidates.push(...defaults);
  const seen = new Set();
  let fromSitemaps = 0;
  const queue = [...new Set(candidates)];
  while (queue.length && seen.size < 12 && fromSitemaps < 1000) {
    const url = queue.shift();
    if (seen.has(url) || (fromSitemaps && defaults.includes(url))) continue;
    seen.add(url);
    const file = await read(url, { redirects: 2, allowSitemapXml: true, limit: 500000 });
    if (file?.status !== 200 || file.truncated || !file.html) continue;
    if (/<(?:[A-Za-z_][\w.-]*:)?sitemapindex(?:\s|>)/i.test(file.html)) {
      // Pages first, then posts; skip media, tag, author and category sitemaps.
      const children = locs(file.html).filter(sameOrigin).filter(child => !/(?:attachment|media|image|video|author|tag|category|product_cat)/i.test(child))
        .sort((a, b) => (/page/i.test(b) - /page/i.test(a)) || (/post/i.test(b) - /post/i.test(a)));
      queue.unshift(...children.slice(0, 6));
      continue;
    }
    try {
      for (const value of importSitemap({ content_base64: Buffer.from(file.html).toString('base64') }, site).urls) {
        const candidate = new URL(value);
        if (candidate.origin === canonical.origin && !candidate.search && !urls.has(candidate.href)) { urls.add(candidate.href); fromSitemaps++; }
        else if (candidate.origin === canonical.origin && !candidate.search) fromSitemaps++;
      }
    } catch {}
  }
  for (const url of sister) urls.add(url);
  return { site, urls: Array.from(urls), sitemap_urls: fromSitemaps };
}

function publicBriefData(brief) {
  return JSON.parse(JSON.stringify(brief), (key, value) =>
    /(?:^|_)(?:generation_usage|api_key|prompt|access_token)(?:_|$)/i.test(key) ? undefined : value);
}

const defaultDiscover = site => discoverSite(site, { homeReader: require('./growth-free-firecrawl-reader.cjs').createFallbackReader() });

function registerFreePrewrite(app, pool, { generate, strip = publicBriefData, discover = defaultDiscover, dailyLimit = 5, verification } = {}) {
  const privateHeaders = (req, res, next) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
      .set('X-Robots-Tag', 'noindex').set('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  };
  app.use([ROOT, API], privateHeaders);
  for (const path of [ROOT, ROOT + '/r']) {
    app.get(path, (req, res) => res.type('html').send(page(Object.hasOwn(texts, req.query.lang) ? req.query.lang : 'en', path.endsWith('/r'))));
  }

  async function lookup(req) {
    const key = credentials(req);
    if (!key) return null;
    return (await pool.query(`SELECT id,status,keyword,language,region,public_site,brief_json
      FROM prewrite_briefs WHERE client_id IS NULL AND public_access_hash=$1`, [hash(key)])).rows[0] || null;
  }

  async function scope(req) {
    const row = await lookup(req);
    if (!row) return { error: 'Brief not found', code: 404 };
    if (!['open', 'approved', 'published'].includes(row.status)) return { error: 'Brief unavailable', code: 409 };
    if (resolveTarget(row.brief_json, row.public_site).mode !== 'CREATE') return { error: 'Continue in Free Growth', code: 409 };
    return { briefId: row.id, clientId: null };
  }

  app.post(API, async (req, res) => {
    let site, priceSource;
    const { keyword, region, language, intentOverride = '', pricingSource } = req.body || {};
    const manualAiEvidence = manualEvidence(req.body?.manualAiEvidence);
    if (!manualAiEvidence) return res.status(400).json({ success: false });
    try {
      const url = validateUrl(req.body?.website);
      site = url.origin + '/';
      priceSource = pricingEvidenceUrl(site, pricingSource);
    } catch { return res.status(400).json({ success: false }); }
    const key = credentials(req);
    if (!key || typeof keyword !== 'string' || !keyword.trim() || keyword.length > 300 ||
        typeof region !== 'string' || !/^[a-z]{2}$/i.test(region) || typeof language !== 'string' || !Object.hasOwn(texts, language) || !intents.includes(intentOverride)) {
      return res.status(400).json({ success: false });
    }
    if (!generate || dailyLimit < 1) return res.status(503).json({ success: false });
    let db;
    let row;
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      await db.query("SELECT pg_advisory_xact_lock(hashtext('free-prewrite-generation'))");
      const existing = (await db.query('SELECT id FROM prewrite_briefs WHERE public_access_hash=$1', [hash(key)])).rows[0];
      if (existing) {
        await db.query('COMMIT');
        return res.status(202).json({ success: true });
      }
      const { rows: [quota] } = await db.query(`SELECT COUNT(*) FILTER (
        WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC'))::int AS daily,
        COUNT(*) FILTER (WHERE status='generating' AND created_at >= NOW() - INTERVAL '15 minutes')::int AS active
        FROM prewrite_briefs WHERE public_access_hash IS NOT NULL`);
      if (quota.daily >= dailyLimit || quota.active >= 2) {
        await db.query('ROLLBACK');
        return res.status(429).json({ success: false });
      }
      row = (await db.query(`INSERT INTO prewrite_briefs (keyword,language,region,brief_json,status,public_site,public_access_hash)
        VALUES ($1,$2,$3,'{}','generating',$4,$5) RETURNING id`, [keyword.trim(), language, region.toLowerCase(), site, hash(key)])).rows[0];
      await db.query('COMMIT');
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      console.error('[free-prewrite]', error.code || error.name);
      return res.status(503).json({ success: false });
    } finally { db?.release(); }
    res.status(202).json({ success: true });
    try {
      const discovered = await discover(site);
      if (discovered.site !== site) {
        await pool.query("UPDATE prewrite_briefs SET public_site=$2 WHERE id=$1 AND status='generating'", [row.id, discovered.site]);
      }
      await generate({ id: row.id, site: discovered.site, urls: discovered.urls, sitemapUrls: discovered.sitemap_urls || 0, keyword: keyword.trim(), language, region: region.toLowerCase(), intentOverride, pricingSource: priceSource, manualAiEvidence });
    } catch (error) {
      console.warn('[free-prewrite] generation failed', error.code || error.name);
    } finally {
      await pool.query("UPDATE prewrite_briefs SET status='failed' WHERE id=$1 AND status='generating'", [row.id]).catch(() => {});
    }
  });
  app.get(API + '/result', async (req, res) => {
    try {
      if (!credentials(req)) return res.status(404).json({ success: false });
      await pool.query(`UPDATE prewrite_briefs SET status='failed' WHERE public_access_hash=$1
        AND status='generating' AND created_at < NOW() - INTERVAL '15 minutes'`, [hash(credentials(req))]);
      const row = await lookup(req);
      if (!row) return res.status(404).json({ success: false });
      res.json({ success: true, ...view(row, strip) });
    } catch {
      res.status(503).json({ success: false });
    }
  });
  app.post(API + '/approve', async (req, res) => {
    try {
      const access = await scope(req);
      if (access.error) return res.status(access.code).json({ success: false });
      const text = req.body?.text;
      if (typeof text !== 'string' || text.trim().length < 200 || text.length > 12000) return res.status(400).json({ success: false });
      const approved = await pool.query(`UPDATE prewrite_briefs SET status='approved',approved_at=NOW(),specialist_html=$2
        WHERE id=$1 AND client_id IS NULL AND status IN ('open','approved')`, [access.briefId, '<p>' + esc(text.trim()) + '</p>']);
      res.status(approved.rowCount ? 200 : 409).json({ success: Boolean(approved.rowCount) });
    } catch {
      res.status(503).json({ success: false });
    }
  });
  registerRoutes(app, pool, (_token, _id, req) => scope(req), {
    ...verification, publicPath: API,
    resolveRepair: async (_token, _id, req) => {
      const row = await lookup(req);
      return row ? { briefId: row.id, clientId: null } : { code: 404, error: 'Brief not found' };
    }
  });
}

async function resolveGrowthSource(pool, key, url, query) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
  const { rows: [row] } = await pool.query(`SELECT id,brief_json,public_site,keyword
    FROM prewrite_briefs WHERE public_access_hash=$1 AND client_id IS NULL AND status='open'`, [hash(key)]);
  if (!row || row.keyword !== query) return null;
  const target = resolveTarget(row.brief_json, row.public_site);
  return target.mode !== 'CREATE' && target.url === url ? row.id : null;
}

async function sourceForGrowth(pool, id, url, query) {
  const { rows: [row] } = await pool.query(`SELECT brief_json,public_site,keyword,created_at
    FROM prewrite_briefs WHERE id=$1 AND public_access_hash IS NOT NULL AND client_id IS NULL AND status='open'`, [id]);
  if (!row || row.keyword !== query) return null;
  const target = resolveTarget(row.brief_json, row.public_site);
  return target.mode !== 'CREATE' && target.url === url
    ? { target, recorded_at: row.created_at, brief: publicBriefData(row.brief_json) } : null;
}

module.exports = { registerFreePrewrite, resolveGrowthSource, sourceForGrowth, discoverSite };
