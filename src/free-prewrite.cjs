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
const intentLabels = {
  en: ['Adjust search intent', 'Automatic', 'Learn or understand', 'Compare options', 'Use a tool or take action', 'Find a website'],
  nl: ['Pas zoekintentie aan', 'Automatisch', 'Leren of begrijpen', 'Opties vergelijken', 'Tool gebruiken of actie ondernemen', 'Website vinden'],
  es: ['Ajustar la intención de búsqueda', 'Automática', 'Aprender o entender', 'Comparar opciones', 'Usar una herramienta o actuar', 'Encontrar un sitio web']
};
const intents = ['', 'informational', 'commercial', 'transactional', 'navigational'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const credentials = req => /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];

function page(lang, result) {
  const t = texts[lang];
  const labels = intentLabels[lang];
  const intent = `<label>${labels[0]}<select name="intent">${intents.map((value, index) => `<option value="${value}">${labels[index + 1]}</option>`).join('')}</select></label>`;
  const price = {
    en: ['Public URL for prices or quote policy (optional)', 'Add a public page showing your prices or that you quote on request.'],
    nl: ['Openbare URL voor prijzen of offertebeleid (optioneel)', 'Voeg een openbare pagina toe met je prijzen of de vermelding ‘op aanvraag’.'],
    es: ['URL pública de precios o presupuestos (opcional)', 'Añade una página pública con tus precios o con la indicación de que se ofrecen bajo consulta.']
  }[lang];
  const priceInput = `<label>${price[0]}<input name="pricing-source" type="url" maxlength="500"></label>`;
  const control = result ? `<p>${t[5]}</p><p id="status" role="status"></p><section id="decision" hidden></section><form id="intent-adjust" hidden>${intent}${priceInput}<button>${labels[0]}</button></form>
    <section id="implementation" hidden><h2>${t[9]}</h2><textarea id="editor" rows="15" readonly></textarea><p><a id="download" download="pre-write-brief.txt">${t[9]}</a></p>
    <label>${t[11]}<textarea id="copy" rows="5" minlength="200" maxlength="12000"></textarea></label><button id="approve" type="button">${t[12]}</button>
    <label>${t[13]}<textarea id="report" rows="7" maxlength="16000"></textarea></label><button id="save" type="button">${t[14]}</button>
    <button id="publish" type="button">${t[15]}</button> <button id="verify" type="button">${t[16]}</button></section>
    <section id="history" hidden><h2>${t[10]}</h2><div id="entries"></div><details><summary>${t[0]}</summary><pre id="research"></pre></details></section>` :
    `<form id="intake"><label>${t[1]}<input name="website" type="url" placeholder="https://" maxlength="500" required></label>
    <label>${t[2]}<input name="keyword" maxlength="300" required></label>
    <label>${t[3]}<input name="country" value="${{en:'US',nl:'NL',es:'ES'}[lang]}" pattern="[A-Za-z]{2}" maxlength="2" required></label>
    ${intent}${priceInput}<button>${t[4]}</button></form><p id="status" role="status"></p>
    <form id="reopen"><h2>${t[19]}</h2><label>${t[20]}<input name="link" type="url" required></label><button>${t[21]}</button></form>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t[0]}</title>
    <style>body{margin:0;padding:24px;background:#f5f7fc;color:#172337;font:16px system-ui}main{margin:auto;max-width:750px}form,section{background:white;border:1px solid #cbd5e1;border-radius:10px;padding:20px;margin:16px 0}label{display:block;margin:12px 0}input,textarea{display:block;width:100%;box-sizing:border-box;padding:8px;border:1px solid #64748b;border-radius:4px;font:inherit}button{padding:8px 12px;background:#1d4ed8;color:white;border:0;border-radius:6px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1d4ed8}</style></head>
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

async function discoverSite(site) {
  const home = await fetchPublicGrowthHtml(site, { redirects: 2, limit: 300000 });
  const canonical = validateUrl(home.final_url);
  if (home.status !== 200 || isBotCheck(home.html) || canonical.hostname.replace(/^www\./, '') !== new URL(site).hostname.replace(/^www\./, '')) {
    throw Error('Website unavailable');
  }
  site = canonical.origin + '/';
  const urls = new Set();
  const pending = [parse(home.html)];
  while (pending.length && urls.size < 500) {
    const node = pending.pop();
    const href = node.tagName === 'a' && node.attrs.find(attr => attr.name === 'href')?.value;
    if (href && !href.startsWith('#')) {
      try {
        const url = validateUrl(new URL(href, home.final_url).href);
        if (url.origin === canonical.origin && !url.search) urls.add(url.href);
      } catch {}
    }
    pending.push(...(node.childNodes || []));
  }
  const { importSitemap } = require('./growth-free/sitemap-import.cjs');
  try {
    const sitemap = await fetchPublicGrowthHtml(new URL('/sitemap.xml', site).href, {
      redirects: 0, allowSitemapXml: true, limit: 500000
    });
    if (sitemap.status === 200 && !sitemap.truncated) {
      for (const url of importSitemap({ content_base64: Buffer.from(sitemap.html).toString('base64') }, site).urls) {
        const candidate = new URL(url);
        if (candidate.origin === canonical.origin && !candidate.search) urls.add(candidate.href);
      }
    }
  } catch {}
  return { site, urls: Array.from(urls) };
}

function publicBriefData(brief) {
  return JSON.parse(JSON.stringify(brief), (key, value) =>
    /(?:^|_)(?:generation_usage|api_key|prompt|access_token)(?:_|$)/i.test(key) ? undefined : value);
}

function registerFreePrewrite(app, pool, { generate, strip = publicBriefData, discover = discoverSite, dailyLimit = 5, verification } = {}) {
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
      await generate({ id: row.id, site: discovered.site, urls: discovered.urls, keyword: keyword.trim(), language, region: region.toLowerCase(), intentOverride, pricingSource: priceSource });
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
  registerRoutes(app, pool, (_token, _id, req) => scope(req), { ...verification, publicPath: API });
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

module.exports = { registerFreePrewrite, resolveGrowthSource, sourceForGrowth };
