'use strict';

// CONTENTSCALE NETWORK — SAFE ISOLATED MODULE v414
// Rule: a Network failure may break Network only, never the core ContentScale app.
// This module owns only network_* tables and must not ALTER/DELETE core tables.

const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const NETWORK_SCHEMA_VERSION = 1;
const NETWORK_TABLES = [
  'network_websites',
  'network_content',
  'network_publication_versions',
  'network_placements',
  'network_credit_wallets',
  'network_credit_transactions',
  'network_verification_runs'
];

function envEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.NETWORK_ENABLED || '').trim());
}

function cleanText(v, max = 500) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSite(input) {
  let raw = cleanText(input, 2048);
  if (!raw) throw new Error('Website/domain is required');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https websites are allowed');
  u.hash = '';
  const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!hostname || !hostname.includes('.')) throw new Error('Enter a real public domain');
  return {
    domain: hostname,
    canonical_url: `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  };
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') ||
    s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') ||
    s.startsWith('::ffff:127.') || s.startsWith('::ffff:10.') || s.startsWith('::ffff:192.168.');
}

async function assertPublicHostname(hostname) {
  if (!hostname) throw new Error('Invalid hostname');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local/private hosts are not allowed');
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private/reserved IP addresses are not allowed');
    return;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error('Domain does not resolve');
  if (records.some(r => isPrivateIp(r.address))) throw new Error('Domain resolves to a private/reserved address');
}

async function safeFetchHtml(startUrl) {
  let current = new URL(startUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicHostname(current.hostname);
      const r = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ContentScaleNetworkSiteCheck/1.0 (+https://app.contentscale.site/network)',
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
        }
      });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const loc = r.headers.get('location');
        if (!loc) throw new Error('Redirect without destination');
        current = new URL(loc, current);
        if (!['http:', 'https:'].includes(current.protocol)) throw new Error('Unsafe redirect protocol');
        continue;
      }
      const ctype = String(r.headers.get('content-type') || '');
      const html = ctype.includes('text/html') || ctype.includes('application/xhtml+xml') ? (await r.text()).slice(0, 1000000) : '';
      return { response: r, html, finalUrl: current.toString(), contentType: ctype };
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

function htmlText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttr(tag, name) {
  const m = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1].trim() : '';
}

function analyzeWebsiteHtml({ status, html, finalUrl, contentType }) {
  const titleMatch = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanText(titleMatch ? titleMatch[1].replace(/<[^>]+>/g, ' ') : '', 300);
  const metaRobots = (String(html || '').match(/<meta\b[^>]*name=["']robots["'][^>]*>/i) || [])[0] || '';
  const robotsContent = extractAttr(metaRobots, 'content').toLowerCase();
  const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robotsContent);
  const canonicalTag = (String(html || '').match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i) || [])[0] || '';
  const canonical = extractAttr(canonicalTag, 'href');
  const text = htmlText(html);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const parked = /domain (?:is )?for sale|buy this domain|sedo parking|parkingcrew|hugedomains|dan\.com\/buy-domain/i.test((title + ' ' + text.slice(0, 5000)).toLowerCase());
  const spamSignals = [];
  if (parked) spamSignals.push('parked_or_for_sale');
  if (words > 0 && words < 120) spamSignals.push('very_thin_content');
  const httpOk = status >= 200 && status < 400;
  const htmlOk = /text\/html|application\/xhtml\+xml/i.test(contentType || '') && html.length >= 300;
  const indexable = httpOk && htmlOk && !noindex;
  const basicPass = httpOk && htmlOk && indexable && !!title && words >= 120 && !parked;
  const needsReview = basicPass && (words < 300 || !canonical);
  return {
    checked_url: finalUrl,
    http_status: status,
    content_type: contentType,
    title,
    canonical,
    noindex,
    indexable,
    word_count: words,
    parked,
    spam_signals: spamSignals,
    technical_pass: basicPass,
    outcome: !basicPass ? 'rejected' : (needsReview ? 'needs_review' : 'passed'),
    checked_at: new Date().toISOString()
  };
}



function slugifyNetwork(v) {
  return cleanText(v, 180).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120) || 'publisher-edition';
}

function stripCodeFence(v) {
  let s = String(v || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return s;
}

function sanitizePublisherHtml(html) {
  let out = String(html || '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form|textarea|select)>/gi, '')
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  out = out.replace(/<!doctype[^>]*>/gi,'').replace(/<\/?(?:html|head|body)\b[^>]*>/gi,'').trim();
  return out;
}

function ensureContentScaleAttribution(html, placementId) {
  const clean = sanitizePublisherHtml(html);
  const marker = `<footer class="contentscale-network-credit" data-contentscale-credit="required" style="margin-top:28px;padding-top:14px;border-top:1px solid rgba(127,127,127,.28);font-size:12px;line-height:1.5;opacity:.82">Created with <a href="https://app.contentscale.site/network" target="_blank" rel="noopener">ContentScale Network &amp; Distribution</a><span data-contentscale-placement="${Number(placementId)}"></span></footer>`;
  if (/data-contentscale-credit=["']required["']/i.test(clean)) return clean;
  return clean + marker;
}

async function callNetworkGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const model = cleanText(process.env.GEMINI_NETWORK_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash', 100);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.55,topP:0.92,maxOutputTokens:20000,responseMimeType:'application/json',thinkingConfig:{thinkingBudget:0}}
      })
    });
    if (!r.ok) throw new Error(`Gemini API error ${r.status}: ${cleanText(await r.text(), 800)}`);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('') || '';
    if (!text) throw new Error('Gemini returned no publication content');
    let parsed;
    try { parsed = JSON.parse(stripCodeFence(text)); }
    catch (_) { throw new Error('Gemini returned invalid publication JSON'); }
    return { parsed, model };
  } finally { clearTimeout(timer); }
}

function protectedSnippet(origin, placementId, token) {
  const base = String(origin || 'https://app.contentscale.site').replace(/\/$/,'');
  return `<div class="contentscale-network-placement" data-cs-placement="${Number(placementId)}"></div>\n<script async src="${base}/network/embed/${token}.js"></script>`;
}

async function ensureNetworkTables(pool) {
  if (!pool) throw new Error('Database unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [26093001]);

    await client.query(`CREATE TABLE IF NOT EXISTS network_schema_meta (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
      schema_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`INSERT INTO network_schema_meta (singleton, schema_version)
      VALUES (TRUE, $1)
      ON CONFLICT (singleton) DO UPDATE
      SET schema_version = EXCLUDED.schema_version, updated_at = NOW()`, [NETWORK_SCHEMA_VERSION]);

    await client.query(`CREATE TABLE IF NOT EXISTS network_websites (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT,
      domain TEXT NOT NULL,
      canonical_url TEXT,
      brand_name TEXT,
      primary_niche TEXT,
      sub_niche TEXT,
      country TEXT,
      language TEXT,
      cms TEXT,
      ownership_type TEXT NOT NULL DEFAULT 'external' CHECK (ownership_type IN ('owned','external')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','trusted','suspended','rejected')),
      scan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      approved_at TIMESTAMPTZ,
      suspended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_websites_domain_lower ON network_websites ((LOWER(domain)))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_websites_status_niche ON network_websites(status, primary_niche)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_content (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT,
      owner_website_id BIGINT REFERENCES network_websites(id) ON DELETE SET NULL,
      prewrite_brief_id BIGINT,
      title TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'existing_url' CHECK (source_type IN ('existing_url','prewrite_brief','html','text','original')),
      primary_niche TEXT,
      target_searcher TEXT,
      target_keyword TEXT,
      brand_name TEXT,
      source_html TEXT,
      source_text TEXT,
      source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft','available','paused','completed','rejected')),
      distribution_status TEXT NOT NULL DEFAULT 'not_started',
      desired_placements INTEGER NOT NULL DEFAULT 1 CHECK (desired_placements > 0),
      verified_placements INTEGER NOT NULL DEFAULT 0 CHECK (verified_placements >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_content_status_niche ON network_content(publication_status, primary_niche, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_content_prewrite_ref ON network_content(prewrite_brief_id) WHERE prewrite_brief_id IS NOT NULL`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_placements (
      id BIGSERIAL PRIMARY KEY,
      content_id BIGINT NOT NULL REFERENCES network_content(id) ON DELETE RESTRICT,
      publisher_website_id BIGINT NOT NULL REFERENCES network_websites(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','generating','ready','submitted','verifying','needs_review','verified','rejected','cancelled')),
      reward_credits INTEGER NOT NULL DEFAULT 10 CHECK (reward_credits >= 0),
      brand_mention_required BOOLEAN NOT NULL DEFAULT TRUE,
      source_link_required BOOLEAN NOT NULL DEFAULT TRUE,
      published_url TEXT,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(content_id, publisher_website_id)
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_placements_status ON network_placements(status, created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_publication_versions (
      id BIGSERIAL PRIMARY KEY,
      placement_id BIGINT NOT NULL UNIQUE REFERENCES network_placements(id) ON DELETE RESTRICT,
      content_id BIGINT NOT NULL REFERENCES network_content(id) ON DELETE RESTRICT,
      publisher_website_id BIGINT NOT NULL REFERENCES network_websites(id) ON DELETE RESTRICT,
      version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no > 0),
      title TEXT,
      html TEXT,
      plain_text TEXT,
      meta_title TEXT,
      meta_description TEXT,
      suggested_slug TEXT,
      schema_json JSONB,
      generation_input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      generation_model TEXT,
      quality_status TEXT NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','passed','failed','needs_review')),
      generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_credit_wallets (
      id BIGSERIAL PRIMARY KEY,
      website_id BIGINT NOT NULL UNIQUE REFERENCES network_websites(id) ON DELETE RESTRICT,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (reserved <= balance)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_credit_transactions (
      id BIGSERIAL PRIMARY KEY,
      wallet_id BIGINT NOT NULL REFERENCES network_credit_wallets(id) ON DELETE RESTRICT,
      placement_id BIGINT REFERENCES network_placements(id) ON DELETE RESTRICT,
      transaction_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_credit_transactions_wallet ON network_credit_transactions(wallet_id, created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_verification_runs (
      id BIGSERIAL PRIMARY KEY,
      placement_id BIGINT NOT NULL REFERENCES network_placements(id) ON DELETE RESTRICT,
      run_no INTEGER NOT NULL DEFAULT 1 CHECK (run_no > 0),
      http_status INTEGER,
      indexable BOOLEAN,
      canonical_ok BOOLEAN,
      brand_mention_ok BOOLEAN,
      source_link_ok BOOLEAN,
      content_match_ok BOOLEAN,
      password_protected BOOLEAN,
      result_status TEXT NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending','passed','failed','needs_review')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(placement_id, run_no)
    )`);

    await client.query('COMMIT');
    return { success: true, schema_version: NETWORK_SCHEMA_VERSION, tables: NETWORK_TABLES.slice() };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function inspectNetworkSchema(pool) {
  if (!pool) return { db_connected: false, schema_ready: false, missing_tables: NETWORK_TABLES.slice() };
  const names = ['network_schema_meta', ...NETWORK_TABLES];
  const r = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`, [names]);
  const found = new Set(r.rows.map(x => x.tablename));
  const missing = NETWORK_TABLES.filter(t => !found.has(t));
  let schemaVersion = null;
  if (found.has('network_schema_meta')) {
    try {
      const v = await pool.query('SELECT schema_version FROM network_schema_meta WHERE singleton=TRUE LIMIT 1');
      if (v.rows[0]) schemaVersion = v.rows[0].schema_version;
    } catch (_) {}
  }
  return {
    db_connected: true,
    schema_ready: missing.length === 0 && schemaVersion === NETWORK_SCHEMA_VERSION,
    schema_version: schemaVersion,
    expected_schema_version: NETWORK_SCHEMA_VERSION,
    missing_tables: missing
  };
}

function websitesPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Websites | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1220px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.field input,.field select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:11px}.span2{grid-column:span 2}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:10px 13px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.5;cursor:not-allowed}.note{color:#9aabd0;line-height:1.5}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.approved,.status.trusted{border-color:#2b8f55;color:#8ff0b2}.status.rejected,.status.suspended{border-color:#a23b49;color:#ff9ca8}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:980px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.tiny{font-size:12px;color:#91a1c2}.actions{display:flex;gap:6px;flex-wrap:wrap}.scan.pass{color:#75e6a0}.scan.review{color:#ffd27a}.scan.fail{color:#ff8c98}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.span2{grid-column:span 2}}@media(max-width:560px){.grid{grid-template-columns:1fr}.span2{grid-column:span 1}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Websites</div><h1>Network Websites</h1><div class="note">Register publishers first. A site check is only run after hard publication interest. Passing the technical check does not force approval; you remain in control.</div></div><a class="btn secondary" href="/network">← Network</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><h2>Add website</h2><div class="grid">
<div class="field span2"><label>Domain / URL</label><input id="domain" placeholder="example.com"></div>
<div class="field"><label>Brand</label><input id="brand" placeholder="Brand name"></div>
<div class="field"><label>Ownership</label><select id="ownership"><option value="external">External publisher</option><option value="owned">Owned by ContentScale</option></select></div>
<div class="field"><label>Main niche</label><input id="niche" placeholder="Beauty & Wellness"></div>
<div class="field"><label>Subniche</label><input id="subniche" placeholder="Hair salon"></div>
<div class="field"><label>Country</label><input id="country" placeholder="Netherlands"></div>
<div class="field"><label>Language</label><input id="language" placeholder="nl"></div>
<div class="field"><label>CMS</label><input id="cms" placeholder="WordPress"></div>
</div><div style="margin-top:14px"><button id="addBtn" class="btn">Add website</button> <span id="formMsg" class="tiny"></span></div></section>
<section class="card"><div class="top"><h2>Websites</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Website</th><th>Niche</th><th>Market</th><th>Status</th><th>Last check</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||''; const auth=document.getElementById('auth');
 if(!key){auth.style.display='block';}
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 function scanLabel(x){const s=x&&x.scan_snapshot||{};if(!s.checked_at)return '<span class="tiny">Not checked</span>';const c=s.outcome==='passed'?'pass':s.outcome==='needs_review'?'review':'fail';return '<div class="scan '+c+'"><strong>'+esc(s.outcome||'checked')+'</strong></div><div class="tiny">HTTP '+esc(s.http_status||'—')+' · '+esc(s.word_count||0)+' words<br>'+esc(s.checked_at||'')+'</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/websites');const a=d.websites||[];if(!a.length){b.innerHTML='<tr><td colspan="6" class="tiny">No websites yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.brand_name||x.domain)+'</strong><div class="tiny"><a target="_blank" rel="noopener" href="'+esc(x.canonical_url||('https://'+x.domain))+'">'+esc(x.domain)+'</a><br>'+esc(x.ownership_type)+'</div></td><td>'+esc(x.primary_niche||'—')+'<div class="tiny">'+esc(x.sub_niche||'')+'</div></td><td>'+esc(x.country||'—')+'<div class="tiny">'+esc(x.language||'')+'</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+scanLabel(x)+'</td><td><div class="actions"><button class="btn secondary" data-action="check" data-id="'+x.id+'">Hard interest → check site</button><button class="btn good" data-action="status" data-status="approved" data-id="'+x.id+'">Approve</button><button class="btn bad" data-action="status" data-status="rejected" data-id="'+x.id+'">Reject</button></div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="6" class="tiny">'+esc(e.message)+'</td></tr>'}}
 window.siteCheck=async(id)=>{if(!confirm('Confirm HARD publication interest for this publisher/site? The Network will now spend resources checking the site before any Publisher Edition is written.'))return;try{const d=await api('/api/network/admin/websites/'+id+'/check',{method:'POST',body:JSON.stringify({hard_interest_confirmed:true})});alert('Site check: '+d.check.outcome+'\\nHTTP '+d.check.http_status+'\\nIndexable: '+d.check.indexable+'\\nWords: '+d.check.word_count);load()}catch(e){alert(e.message)}};
 window.setStatus=async(id,status)=>{try{await api('/api/network/admin/websites/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})});load()}catch(e){alert(e.message)}};
 document.getElementById('rows').addEventListener('click',function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='check')return window.siteCheck(id);if(btn.dataset.action==='status')return window.setStatus(id,btn.dataset.status||'');});
 document.getElementById('addBtn').onclick=async()=>{const m=document.getElementById('formMsg');m.textContent='Saving…';try{const d=await api('/api/network/admin/websites',{method:'POST',body:JSON.stringify({domain:document.getElementById('domain').value,brand_name:document.getElementById('brand').value,primary_niche:document.getElementById('niche').value,sub_niche:document.getElementById('subniche').value,country:document.getElementById('country').value,language:document.getElementById('language').value,cms:document.getElementById('cms').value,ownership_type:document.getElementById('ownership').value})});m.textContent='Saved: '+d.website.domain;document.getElementById('domain').value='';load()}catch(e){m.textContent=e.message}};
 document.getElementById('refreshBtn').onclick=load; if(key)load();
})();
</script></main></body></html>`;
}


function opportunitiesPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Opportunities | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1240px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.field input,.field select,.field textarea,select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:11px;font:inherit}.field textarea{min-height:96px;resize:vertical}.span2{grid-column:span 2}.span4{grid-column:span 4}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:10px 13px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.65;cursor:wait}.btn.busy{position:relative;padding-left:34px}.btn.busy:before{content:'';position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:csSpin .7s linear infinite}@keyframes csSpin{to{transform:rotate(360deg)}}.note{color:#9aabd0;line-height:1.5}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.available{border-color:#2b8f55;color:#8ff0b2}.status.full{border-color:#d49b2b;color:#ffd98a;background:#2a210f}.status.paused,.status.rejected{border-color:#a23b49;color:#ff9ca8}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1060px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.tiny{font-size:12px;color:#91a1c2}.actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.actions select{min-width:220px;width:auto}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}.bulk{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}.pitch{max-width:430px;line-height:1.45}.check{width:18px;height:18px;accent-color:#2563eb}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.span4{grid-column:span 2}}@media(max-width:560px){.grid{grid-template-columns:1fr}.span2,.span4{grid-column:span 1}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Opportunities</div><h1>Distribution Opportunities</h1><div class="note">Create only an H1 + short pitch. No external Publisher Edition is written until a publisher shows hard interest and chooses an approved website.</div></div><a class="btn secondary" href="/network">← Network</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><h2>Create opportunity</h2><div class="grid">
<div class="field span2"><label>H1 / working title</label><input id="title" placeholder="e.g. 7 Emergency Roof Repair Mistakes NJ Homeowners Should Avoid"></div>
<div class="field"><label>Brand</label><input id="brand" placeholder="Perfect Roofing Team"></div>
<div class="field"><label>Source website</label><select id="ownerWebsite"><option value="">Optional</option></select></div>
<div class="field"><label>Main niche</label><input id="niche" placeholder="Roofing"></div>
<div class="field"><label>Subniche</label><input id="subniche" placeholder="Emergency Roofing"></div>
<div class="field"><label>Country / market</label><input id="country" placeholder="United States"></div>
<div class="field"><label>Language</label><input id="language" placeholder="en-US"></div>
<div class="field"><label>Max placements</label><select id="placements"><option value="1" selected>1 publisher</option><option value="2">2 publishers</option><option value="3">3 publishers</option><option value="4">4 publishers</option><option value="5">5 publishers</option></select><div class="tiny" style="margin-top:6px">Maximum 5. Each placement gets its own unique Publisher Edition.</div></div>
<div class="field span4"><label>Short publisher pitch</label><textarea id="pitch" placeholder="2–4 sentences explaining what the publication will cover and why it is useful for this niche. Do not write the full article yet."></textarea></div>
</div><div style="margin-top:14px"><button id="addBtn" class="btn">Create opportunity</button> <span id="formMsg" class="tiny"></span></div></section>
<section class="card"><div class="top"><h2>Opportunities</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div>
<div class="bulk"><input type="checkbox" class="check" id="selectAll"><label for="selectAll" class="tiny">Select all</label><button class="btn bad" id="deleteSelected" disabled>Delete selected</button><span class="tiny" id="selectedCount">0 selected</span></div>
<div class="tableWrap"><table><thead><tr><th></th><th>Opportunity</th><th>Niche</th><th>Market</th><th>Status</th><th>Interest</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.oldText=btn.textContent;btn.disabled=true;btn.classList.add('busy');if(label)btn.textContent=label;}else{btn.disabled=false;btn.classList.remove('busy');if(btn.dataset.oldText)btn.textContent=btn.dataset.oldText;delete btn.dataset.oldText;}}
 let websites=[];
 async function loadWebsites(){const d=await api('/api/network/admin/websites');websites=d.websites||[];const owner=document.getElementById('ownerWebsite');owner.innerHTML='<option value="">Optional</option>'+websites.map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('')}
 function approvedOptions(){return websites.filter(w=>(w.status==='approved'||w.status==='trusted')&&w.scan_snapshot&&w.scan_snapshot.technical_pass===true).map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('')}
 function updateBulk(){const boxes=Array.from(document.querySelectorAll('.rowSelect'));const checked=boxes.filter(x=>x.checked);document.getElementById('selectedCount').textContent=checked.length+' selected';document.getElementById('deleteSelected').disabled=!checked.length;document.getElementById('selectAll').checked=boxes.length>0&&checked.length===boxes.length}
 async function load(){const b=document.getElementById('rows');try{await loadWebsites();const d=await api('/api/network/admin/opportunities');const a=d.opportunities||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No opportunities yet. Create the first H1 + pitch above.</td></tr>';updateBulk();return;}const opts=approvedOptions();b.innerHTML=a.map(x=>{const max=Math.max(1,Math.min(5,Number(x.desired_placements)||1)),used=Number(x.interest_count||0),full=used>=max,status=full?'full':(x.publication_status||'available');return '<tr><td><input class="check rowSelect" type="checkbox" value="'+x.id+'"></td><td><strong>'+esc(x.title)+'</strong><div class="pitch tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+'</div></td><td>'+esc(x.primary_niche||'—')+'<div class="tiny">'+esc(x.sub_niche||'')+'</div></td><td>'+esc(x.country||'—')+'<div class="tiny">'+esc(x.language||'')+'</div></td><td><span class="status '+esc(status)+'">'+esc(status)+'</span><div class="tiny">'+used+' / '+max+' placements</div></td><td><strong>'+used+'</strong><div class="tiny">publisher commitments</div></td><td><div class="actions"><select data-site-for="'+x.id+'" '+(full?'disabled':'')+'><option value="">'+(full?'Placement limit reached':'Choose approved website')+'</option>'+(full?'':opts)+'</select><button class="btn good" data-action="interest" data-id="'+x.id+'" '+(full?'disabled':'')+'>'+(full?'Full — '+used+'/'+max:'Hard interest')+'</button><button class="btn bad" data-action="delete" data-id="'+x.id+'">Delete</button></div></td></tr>'}).join('');updateBulk()}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('change',e=>{if(e.target.classList.contains('rowSelect'))updateBulk()});
 document.getElementById('selectAll').onchange=function(){document.querySelectorAll('.rowSelect').forEach(x=>x.checked=this.checked);updateBulk()};
 async function removeIds(ids,btn){if(!ids.length)return;if(!confirm('Delete '+ids.length+' selected opportunity'+(ids.length===1?'':'ies')+'? This is only allowed while no placement/publication is attached.'))return;busy(btn,true,'Deleting…');try{const d=await api('/api/network/admin/opportunities/delete',{method:'POST',body:JSON.stringify({ids})});btn.textContent='✓ Deleted '+d.deleted;await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}
 document.getElementById('deleteSelected').onclick=function(){const ids=Array.from(document.querySelectorAll('.rowSelect:checked')).map(x=>Number(x.value)).filter(Boolean);removeIds(ids,this)};
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='delete')return removeIds([id],btn);if(btn.dataset.action==='interest'){const sel=document.querySelector('select[data-site-for="'+id+'"]');const websiteId=Number(sel&&sel.value||0);if(!websiteId){alert('Choose an approved website first.');return;}if(!confirm('Confirm HARD publication interest for the selected approved website? No article has been written yet.'))return;busy(btn,true,'Confirming…');try{await api('/api/network/admin/opportunities/'+id+'/interest',{method:'POST',body:JSON.stringify({publisher_website_id:websiteId,hard_interest_confirmed:true})});btn.textContent='✓ Committed';alert('Hard interest recorded. Placement created. Approved publishers use Protected Delivery by default; no loose full HTML is released.');await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}});
 document.getElementById('addBtn').onclick=async function(){const btn=this,m=document.getElementById('formMsg');busy(btn,true,'Creating…');m.textContent='Creating H1 + pitch…';try{await api('/api/network/admin/opportunities',{method:'POST',body:JSON.stringify({title:document.getElementById('title').value,pitch:document.getElementById('pitch').value,brand_name:document.getElementById('brand').value,owner_website_id:Number(document.getElementById('ownerWebsite').value||0)||null,primary_niche:document.getElementById('niche').value,sub_niche:document.getElementById('subniche').value,country:document.getElementById('country').value,language:document.getElementById('language').value,desired_placements:Number(document.getElementById('placements').value||1)})});m.textContent='✓ Opportunity created — no full article written.';document.getElementById('title').value='';document.getElementById('pitch').value='';btn.textContent='✓ Created';await load()}catch(e){m.textContent=e.message}finally{busy(btn,false)}};
 document.getElementById('refreshBtn').onclick=async function(){busy(this,true,'Refreshing…');try{await load()}finally{busy(this,false)}};if(key)load();
})();
</script></main></body></html>`;
}



function publishingPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Publishing | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.ready,.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.generating{border-color:#a87b20;color:#ffd785}.pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #4d6790;background:#111e34}.pill.protected{border-color:#b47d24;color:#ffd791;background:#2b1d08}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1080px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.actions{display:flex;gap:7px;flex-wrap:wrap}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Publishing</div><h1>Publisher Editions</h1><div class="tiny">A Publisher Edition is generated only after hard interest and an approved target website.</div></div><a class="btn secondary" href="/network">← Network</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>Protected delivery first.</strong><br>Approved publishers do not receive loose full HTML. ContentScale creates one edition for one placement and serves it through a placement-specific snippet with required attribution. Trusted publishers remain monitored too.</div></section>
<section class="card"><div class="top"><h2>Publishing queue</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Edition</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');if(btn.dataset.old)btn.textContent=btn.dataset.old}}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/publishing');const a=d.items||[];if(!a.length){b.innerHTML='<tr><td colspan="6" class="tiny">No publisher commitments ready for publishing yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">Brand: '+esc(x.brand_name||'—')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td><span class="pill protected">'+esc(x.protection_mode)+'</span><div class="tiny">Required ContentScale attribution</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.publication_version_id?'<strong>'+esc(x.edition_title||'Publisher Edition')+'</strong><div class="tiny">Generated '+esc(x.generated_at||'')+'<br>'+esc(x.quality_status||'')+'</div>':'<span class="tiny">Not generated yet</span>')+'</td><td><div class="actions">'+(x.status==='accepted'?'<button class="btn good" data-action="generate" data-id="'+x.id+'">Generate Publisher Edition</button>':'')+(x.status==='ready'&&x.delivery_available?'<button class="btn" data-action="copy" data-id="'+x.id+'">Copy protected snippet</button>':'')+(x.status==='generating'?'<button class="btn busy" disabled>Generating…</button>':'')+'</div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="6" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='generate'){if(!confirm('Generate one unique Publisher Edition for this approved placement now?'))return;busy(btn,true,'Generating…');try{const d=await api('/api/network/admin/placements/'+id+'/generate',{method:'POST',body:'{}'});btn.textContent='✓ Ready';await load()}catch(e){alert(e.message);await load()}finally{busy(btn,false)}}else if(btn.dataset.action==='copy'){busy(btn,true,'Preparing snippet…');try{const d=await api('/api/network/admin/placements/'+id+'/delivery');await navigator.clipboard.writeText(d.snippet);btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='Copy protected snippet'},1600)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.classList.remove('busy')}}});
 document.getElementById('refreshBtn').onclick=load;if(key)load();
})();
</script></main></body></html>`;
}

function placementsPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Placements | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.accepted{border-color:#4b78bc;color:#acd0ff}.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.cancelled,.status.rejected{border-color:#a23b49;color:#ff9ca8}.pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #4d6790;background:#111e34}.pill.protected{border-color:#b47d24;color:#ffd791;background:#2b1d08}.pill.monitored{border-color:#2b8f55;color:#8ff0b2;background:#0e2819}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Placements</div><h1>Placements & Protection</h1><div class="tiny">A placement starts only after hard interest on an approved website.</div></div><a class="btn secondary" href="/network">← Network</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>Protection rule</strong><br>Approved publishers are treated as <strong>Protected</strong>: they do not receive loose full HTML. Their future Publisher Edition must be delivered through a controlled ContentScale placement mechanism with required attribution/marker and ongoing verification. Only <strong>Trusted</strong> publishers may later qualify for normal HTML, still with monitoring. Credits are not earned simply by accepting a placement.</div></section>
<section class="card"><div class="top"><h2>Publisher commitments</h2><button id="refreshBtn" class="btn secondary">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Requirements</th><th>Accepted</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');btn.textContent=btn.dataset.old||btn.textContent}}
 function protection(x){if(x.publisher_status==='trusted')return '<span class="pill monitored">Trusted · monitored HTML later</span><div class="tiny">Attribution + live verification remain required.</div>';return '<span class="pill protected">Protected delivery</span><div class="tiny">No loose full HTML. Controlled placement required.</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/placements');const a=d.placements||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No publisher commitments yet. Create an opportunity and record hard interest first.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td>'+protection(x)+'</td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span><div class="tiny">credits '+esc(x.reward_credits||0)+' — not earned yet</div></td><td><div class="tiny">Brand mention: '+(x.brand_mention_required?'required':'no')+'<br>Source link: '+(x.source_link_required?'required':'no')+'<br>ContentScale marker: required by policy</div></td><td><div class="tiny">'+esc(x.accepted_at||'—')+'</div></td><td>'+(x.status==='accepted'?'<button class="btn bad" data-action="cancel" data-id="'+x.id+'">Cancel commitment</button>':'<span class="tiny">No action</span>')+'</td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action="cancel"]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(!confirm('Cancel this publisher commitment? No Publisher Edition should be generated from this placement after cancellation.'))return;busy(btn,true,'Cancelling…');try{await api('/api/network/admin/placements/'+id+'/cancel',{method:'POST',body:'{}'});btn.textContent='✓ Cancelled';await load()}catch(e){alert(e.message)}finally{busy(btn,false)}});
 document.getElementById('refreshBtn').onclick=function(){const btn=this;busy(btn,true,'Refreshing…');load().finally(()=>busy(btn,false))};if(key)load();
})();
</script></main></body></html>`;
}


function verificationPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Verification | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1280px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.needs_review{border-color:#a87b20;color:#ffd785}.status.submitted,.status.ready{border-color:#4b78bc;color:#acd0ff}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1180px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.url{width:300px;max-width:100%;background:#091327;border:1px solid #334a74;color:#eef4ff;border-radius:9px;padding:9px}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}.ok{color:#8ff0b2}.warn{color:#ffd785}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Verification</div><h1>Publish, Verify & Credits</h1><div class="tiny">Credits are earned only after the live placement passes verification.</div></div><a class="btn secondary" href="/network">← Network</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>Verification rule</strong><br>Submit the exact live article URL. ContentScale checks HTTP status, indexability, canonical, the protected delivery snippet, and the required brand/source evidence. A successful verification awards the placement credits once only.</div></section>
<section class="card"><div class="top"><h2>Verification queue</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Status</th><th>Live URL</th><th>Latest verification</th><th>Credits</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');btn.textContent=btn.dataset.old||btn.textContent}}
 function checks(x){if(!x.latest_result)return '<span class="tiny">Not checked yet</span>';const d=x.latest_details||{};return '<span class="status '+esc(x.latest_result)+'">'+esc(x.latest_result)+'</span><div class="tiny">HTTP '+esc(x.latest_http_status||'—')+' · indexable '+(x.latest_indexable?'yes':'no')+'<br>snippet '+(d.protected_snippet_present?'✓':'✕')+' · brand '+(x.latest_brand_mention_ok?'✓':'✕')+' · source '+(x.latest_source_link_ok?'✓':'✕')+'</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/verification-queue');const a=d.items||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No generated placements ready for verification yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.brand_name||'')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+'</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td><input class="url" data-url="'+x.id+'" placeholder="https://publisher.com/article" value="'+esc(x.published_url||'')+'"></td><td>'+checks(x)+'</td><td><strong>'+esc(x.reward_credits||0)+'</strong><div class="tiny">'+(x.credit_awarded?'awarded ✓':'not earned yet')+'</div></td><td><div class="actions"><button class="btn" data-action="submit" data-id="'+x.id+'">Save live URL</button><button class="btn good" data-action="verify" data-id="'+x.id+'" '+(!x.published_url?'disabled':'')+'>Verify live</button></div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;const input=document.querySelector('input[data-url="'+id+'"]');if(btn.dataset.action==='submit'){const url=(input&&input.value||'').trim();if(!url)return alert('Enter the exact live article URL first.');busy(btn,true,'Saving…');try{await api('/api/network/admin/placements/'+id+'/submit-live',{method:'POST',body:JSON.stringify({published_url:url})});btn.textContent='✓ Saved';await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}else if(btn.dataset.action==='verify'){if(!confirm('Verify this live placement now? Credits are awarded only if all required checks pass.'))return;busy(btn,true,'Verifying…');try{const d=await api('/api/network/admin/placements/'+id+'/verify-live',{method:'POST',body:'{}'});btn.textContent=d.verified?'✓ Verified':'Needs review';if(d.verified&&d.credit_awarded)alert('Placement verified. '+d.credits+' credits awarded.');await load()}catch(e){alert(e.message);await load()}finally{busy(btn,false)}}});
 document.getElementById('refreshBtn').onclick=function(){const b=this;busy(b,true,'Refreshing…');load().finally(()=>busy(b,false))};if(key)load();
})();
</script></main></body></html>`;
}

function registerNetwork({ app, pool, verifyAdmin, asyncHandler }) {
  if (!app) throw new Error('Network registration requires Express app');
  if (typeof verifyAdmin !== 'function') throw new Error('Network registration requires verifyAdmin');
  const wrap = typeof asyncHandler === 'function' ? asyncHandler : (fn) => (req, res, next) => Promise.resolve(fn(req,res,next)).catch(next);

  app.get('/api/network/health', wrap(async (req, res) => {
    let schema;
    try { schema = await inspectNetworkSchema(pool); }
    catch (err) { schema = { db_connected: false, schema_ready: false, error: err.message }; }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, module: 'network', enabled: envEnabled(), isolated: true, core_tables_mutated: false, schema });
  }));

  app.post('/api/network/admin/init', verifyAdmin, wrap(async (req, res) => {
    const result = await ensureNetworkTables(pool);
    res.json({ ...result, enabled: envEnabled(), note: 'Only network_* tables were created/verified.' });
  }));

  app.get('/api/network/admin/status', verifyAdmin, wrap(async (req, res) => {
    const schema = await inspectNetworkSchema(pool);
    res.json({ success: true, enabled: envEnabled(), isolated: true, schema });
  }));


  // DISTRIBUTION OPPORTUNITIES — H1 + pitch only. No Publisher Edition generation here.
  app.get('/api/network/admin/opportunities', verifyAdmin, wrap(async (req, res) => {
    const r = await pool.query(`SELECT c.id,c.owner_website_id,c.title,c.primary_niche,c.brand_name,c.publication_status,c.desired_placements,c.created_at,c.updated_at,
      COALESCE(c.source_snapshot->>'pitch','') AS pitch,
      COALESCE(c.source_snapshot->>'sub_niche','') AS sub_niche,
      COALESCE(c.source_snapshot->>'country','') AS country,
      COALESCE(c.source_snapshot->>'language','') AS language,
      COUNT(p.id)::int AS interest_count
      FROM network_content c
      LEFT JOIN network_placements p ON p.content_id=c.id AND p.status NOT IN ('cancelled','rejected')
      WHERE c.source_type='original' AND COALESCE(c.source_snapshot->>'network_kind','')='distribution_opportunity'
        AND COALESCE(c.distribution_status,'') <> 'deleted'
      GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1000`);
    res.json({ success:true, opportunities:r.rows });
  }));

  app.post('/api/network/admin/opportunities', verifyAdmin, wrap(async (req, res) => {
    if (!envEnabled()) return res.status(409).json({ success:false,error:'Network is disabled' });
    const title=cleanText(req.body?.title,300),pitch=cleanText(req.body?.pitch,1400);
    if(!title) return res.status(400).json({success:false,error:'H1 / working title is required'});
    if(!pitch) return res.status(400).json({success:false,error:'Short publisher pitch is required'});
    const desired=Math.max(1,Math.min(5,Number(req.body?.desired_placements)||1));
    const ownerWebsiteId=Number(req.body?.owner_website_id)||null;
    if(ownerWebsiteId){const ow=await pool.query('SELECT id FROM network_websites WHERE id=$1',[ownerWebsiteId]);if(!ow.rows[0])return res.status(400).json({success:false,error:'Source website not found'});}
    const snap={network_kind:'distribution_opportunity',pitch,sub_niche:cleanText(req.body?.sub_niche,120),country:cleanText(req.body?.country,120),language:cleanText(req.body?.language,30),full_article_generated:false};
    const r=await pool.query(`INSERT INTO network_content (owner_website_id,title,source_type,primary_niche,brand_name,source_snapshot,publication_status,distribution_status,desired_placements,verified_placements,created_at,updated_at)
      VALUES ($1,$2,'original',$3,$4,$5::jsonb,'available','offered',$6,0,NOW(),NOW()) RETURNING *`,[ownerWebsiteId,title,cleanText(req.body?.primary_niche,120)||null,cleanText(req.body?.brand_name,200)||null,JSON.stringify(snap),desired]);
    res.status(201).json({success:true,opportunity:r.rows[0],rule:'Only H1 + pitch stored. No Publisher Edition generated.'});
  }));

  app.post('/api/network/admin/opportunities/:id/interest', verifyAdmin, wrap(async (req, res) => {
    if(req.body?.hard_interest_confirmed!==true)return res.status(409).json({success:false,error:'Hard publication interest must be explicitly confirmed'});
    const contentId=Number(req.params.id),websiteId=Number(req.body?.publisher_website_id);
    if(!contentId||!websiteId)return res.status(400).json({success:false,error:'Opportunity and publisher website are required'});
    const cr=await pool.query(`SELECT * FROM network_content WHERE id=$1 AND source_type='original' AND COALESCE(source_snapshot->>'network_kind','')='distribution_opportunity' LIMIT 1`,[contentId]);
    if(!cr.rows[0])return res.status(404).json({success:false,error:'Opportunity not found'});
    const wr=await pool.query('SELECT * FROM network_websites WHERE id=$1 LIMIT 1',[websiteId]);
    const w=wr.rows[0];if(!w)return res.status(404).json({success:false,error:'Publisher website not found'});
    if(!['approved','trusted'].includes(w.status))return res.status(409).json({success:false,error:'Publisher website must be approved before hard interest can be committed'});
    if(!(w.scan_snapshot&&w.scan_snapshot.technical_pass===true))return res.status(409).json({success:false,error:'Publisher website must pass the Network Website Check before content can be written'});
    const max=Number(cr.rows[0].desired_placements)||1;
    const count=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placements WHERE content_id=$1 AND status NOT IN ('cancelled','rejected')`,[contentId]);
    if(Number(count.rows[0].n)>=max)return res.status(409).json({success:false,error:'This opportunity already reached its maximum publisher commitments'});
    try{
      const pr=await pool.query(`INSERT INTO network_placements (content_id,publisher_website_id,status,reward_credits,brand_mention_required,source_link_required,accepted_at,created_at,updated_at)
        VALUES ($1,$2,'accepted',10,TRUE,TRUE,NOW(),NOW(),NOW()) RETURNING *`,[contentId,websiteId]);
      const afterCount=Number(count.rows[0].n)+1;
      await pool.query(`UPDATE network_content SET distribution_status=$2,publication_status=CASE WHEN $2='full' THEN 'paused' ELSE publication_status END,updated_at=NOW() WHERE id=$1`,[contentId,afterCount>=max?'full':'hard_interest']);
      res.status(201).json({success:true,placement:pr.rows[0],eligible_for_publisher_edition:true,placement_count:afterCount,max_placements:max,opportunity_full:afterCount>=max,protection_mode:w.status==='trusted'?'monitored_html':'protected_delivery',content_scale_marker_required:true,rule:'Website was approved before writing. No Publisher Edition generated by this endpoint. Approved publishers default to protected delivery.'});
    }catch(e){if(e&&e.code==='23505')return res.status(409).json({success:false,error:'This publisher website already committed to this opportunity'});throw e;}
  }));

  app.post('/api/network/admin/opportunities/delete', verifyAdmin, wrap(async (req, res) => {
    const ids=Array.isArray(req.body?.ids)?Array.from(new Set(req.body.ids.map(Number).filter(n=>Number.isInteger(n)&&n>0))).slice(0,500):[];
    if(!ids.length)return res.status(400).json({success:false,error:'Select at least one opportunity'});

    // Active placements block deletion. Cancelled/rejected placements remain as immutable history.
    // We intentionally soft-delete the opportunity instead of physically deleting network_content,
    // because network_placements.content_id uses ON DELETE RESTRICT by design.
    const linked=await pool.query(`SELECT DISTINCT content_id FROM network_placements WHERE content_id=ANY($1::bigint[]) AND status NOT IN ('cancelled','rejected') LIMIT 20`,[ids]);
    if(linked.rows.length)return res.status(409).json({success:false,error:'One or more selected opportunities still have active publisher commitments/placements. Cancel or resolve those placements before deletion.',blocked_ids:linked.rows.map(x=>x.content_id)});

    const r=await pool.query(`UPDATE network_content
      SET publication_status='rejected',
          distribution_status='deleted',
          source_snapshot=jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{deleted_at}',to_jsonb(NOW()::text),true),
          updated_at=NOW()
      WHERE id=ANY($1::bigint[])
        AND source_type='original'
        AND COALESCE(source_snapshot->>'network_kind','')='distribution_opportunity'
        AND COALESCE(distribution_status,'') <> 'deleted'
      RETURNING id`,[ids]);
    res.json({success:true,deleted:r.rowCount,deleted_ids:r.rows.map(x=>x.id),mode:'soft_delete',history_preserved:true});
  }));

  app.get('/network/opportunities', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(opportunitiesPage());
  });



  // PUBLISHING — generate exactly one Publisher Edition per committed placement.
  app.get('/api/network/admin/publishing', verifyAdmin, wrap(async (req, res) => {
    const r=await pool.query(`SELECT p.id,p.content_id,p.publisher_website_id,p.status,p.reward_credits,p.accepted_at,p.updated_at,
      c.title,c.brand_name,c.primary_niche,c.source_snapshot->>'pitch' AS pitch,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      pv.id AS publication_version_id,pv.title AS edition_title,pv.quality_status,pv.generated_at,
      CASE WHEN pv.generation_input_snapshot ? 'delivery_token' THEN TRUE ELSE FALSE END AS delivery_available
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      WHERE p.status NOT IN ('cancelled','rejected')
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1000`);
    const items=r.rows.map(x=>Object.assign({},x,{protection_mode:x.publisher_status==='trusted'?'monitored_html':'protected_delivery'}));
    res.json({success:true,items,rule:'No Publisher Edition exists before hard interest + approved website.'});
  }));

  app.post('/api/network/admin/placements/:id/generate', verifyAdmin, wrap(async (req, res) => {
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.*,c.title,c.brand_name,c.primary_niche,c.owner_website_id,c.source_snapshot,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,w.scan_snapshot AS publisher_scan,
      ow.domain AS owner_domain,ow.brand_name AS owner_brand
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    if(!['approved','trusted'].includes(x.publisher_status))return res.status(409).json({success:false,error:'Publisher website is no longer approved'});
    if(!(x.publisher_scan&&x.publisher_scan.technical_pass===true))return res.status(409).json({success:false,error:'Publisher website no longer has a passing Network Website Check'});
    const existing=await pool.query('SELECT * FROM network_publication_versions WHERE placement_id=$1 LIMIT 1',[id]);
    if(existing.rows[0]&&existing.rows[0].generated_at){
      return res.json({success:true,already_generated:true,publication_version_id:existing.rows[0].id,status:x.status,rule:'One placement keeps one generated Publisher Edition.'});
    }
    if(x.status!=='accepted')return res.status(409).json({success:false,error:'Only an accepted placement can start generation'});
    if(x.source_link_required===true&&!x.owner_domain)return res.status(409).json({success:false,error:'This placement requires a source link, but the opportunity has no source website. Add/recreate the opportunity with its source website before generation.'});

    const claimed=await pool.query(`UPDATE network_placements SET status='generating',updated_at=NOW() WHERE id=$1 AND status='accepted' RETURNING id`,[id]);
    if(!claimed.rows[0])return res.status(409).json({success:false,error:'Placement generation was already started by another request'});
    try{
      const snap=x.source_snapshot||{};
      const language=cleanText(snap.language||'en-US',30),country=cleanText(snap.country||'',120),subNiche=cleanText(snap.sub_niche||'',120),pitch=cleanText(snap.pitch||'',1400);
      const ownerUrl=x.owner_domain?`https://${x.owner_domain}`:'';
      const prompt=`Create ONE original, publication-grade Publisher Edition for an external website.\n\nSTRICT RULES:\n- Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.\n- Language: ${language}. Market/country context: ${country||'not specified'}.\n- Publisher website: ${x.publisher_domain}. Publisher niche: ${x.primary_niche||''}${subNiche?' / '+subNiche:''}.\n- Working H1/topic: ${x.title}.\n- Short opportunity pitch: ${pitch}.\n- Brand/entity to mention naturally: ${x.brand_name||x.owner_brand||''}.\n- Required source/owner link: ${ownerUrl}. Include that link naturally once where useful.\n- Do NOT invent years in business, certifications, prices, ratings, guarantees, locations, service claims, statistics, customer counts or other facts that were not supplied.\n- If a factual detail is unknown, write around it rather than guessing.\n- This must be a genuinely new publication, not a spin or paraphrase of another article.\n- Aim for useful depth, roughly 900-1400 words when the topic supports it.\n- HTML may use article, h1, h2, h3, p, ul, ol, li, strong, em, blockquote and a tags. No script/style/iframe/form.\n- Do not add FAQ unless the article actually contains a useful FAQ section.\n- schema_json should be a valid Article JSON object, not a script tag.\n- meta_title max 60 characters; meta_description max 160 characters.\n- Do not add a ContentScale credit yourself; the delivery layer adds the required controlled attribution.\n- Do not promise rankings, AI citations or outcomes.`;
      const ai=await callNetworkGemini(prompt),d=ai.parsed||{};
      const title=cleanText(d.title||x.title,300);
      const html=ensureContentScaleAttribution(d.html||'',id);
      const plain=cleanText(d.plain_text||htmlText(html),50000);
      if(!title||htmlText(html).split(/\s+/).filter(Boolean).length<250)throw new Error('Generated edition failed minimum content quality check');
      const metaTitle=cleanText(d.meta_title||title,60),metaDescription=cleanText(d.meta_description||'',160),slug=slugifyNetwork(d.suggested_slug||title);
      const schema=(d.schema_json&&typeof d.schema_json==='object')?d.schema_json:{};
      const token=crypto.randomBytes(32).toString('hex');
      const generationSnapshot={network_kind:'publisher_edition',delivery_token:token,protection_mode:x.publisher_status==='trusted'?'monitored_html':'protected_delivery',content_scale_marker_required:true,source_link:ownerUrl,publisher_domain:x.publisher_domain,language,country,generated_by_admin_id:req.admin&&req.admin.id||null};
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const vr=await client.query(`INSERT INTO network_publication_versions (placement_id,content_id,publisher_website_id,version_no,title,html,plain_text,meta_title,meta_description,suggested_slug,schema_json,generation_input_snapshot,generation_model,quality_status,generated_at,created_at,updated_at)
          VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'passed',NOW(),NOW(),NOW())
          ON CONFLICT (placement_id) DO UPDATE SET title=EXCLUDED.title,html=EXCLUDED.html,plain_text=EXCLUDED.plain_text,meta_title=EXCLUDED.meta_title,meta_description=EXCLUDED.meta_description,suggested_slug=EXCLUDED.suggested_slug,schema_json=EXCLUDED.schema_json,generation_input_snapshot=EXCLUDED.generation_input_snapshot,generation_model=EXCLUDED.generation_model,quality_status='passed',generated_at=NOW(),updated_at=NOW()
          RETURNING id,title,meta_title,meta_description,suggested_slug,quality_status,generated_at`,[id,x.content_id,x.publisher_website_id,title,html,plain,metaTitle,metaDescription,slug,JSON.stringify(schema),JSON.stringify(generationSnapshot),ai.model]);
        await client.query(`UPDATE network_placements SET status='ready',updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_content SET source_snapshot=jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{full_article_generated}','true'::jsonb,true),distribution_status='edition_ready',updated_at=NOW() WHERE id=$1`,[x.content_id]);
        await client.query('COMMIT');
        const snippet=protectedSnippet('https://app.contentscale.site',id,token);
        res.json({success:true,placement_id:id,status:'ready',publication_version:vr.rows[0],protection_mode:generationSnapshot.protection_mode,snippet_available:true,snippet,rule:'Protected publisher delivery created. Loose full HTML is not returned.'});
      }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
    }catch(e){
      await pool.query(`UPDATE network_placements SET status='accepted',updated_at=NOW() WHERE id=$1 AND status='generating'`,[id]).catch(()=>{});
      throw e;
    }
  }));

  app.get('/api/network/admin/placements/:id/delivery', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT p.status,w.status AS publisher_status,pv.id,pv.title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.generation_input_snapshot,pv.generated_at
      FROM network_placements p JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Generated Publisher Edition not found'});
    if(!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'This placement is not available for delivery'});
    const token=x.generation_input_snapshot&&x.generation_input_snapshot.delivery_token;if(!token)return res.status(409).json({success:false,error:'Protected delivery token missing'});
    res.json({success:true,placement_id:id,status:x.status,protection_mode:x.publisher_status==='trusted'?'monitored_html':'protected_delivery',snippet:protectedSnippet('https://app.contentscale.site',id,token),publication:{title:x.title,meta_title:x.meta_title,meta_description:x.meta_description,suggested_slug:x.suggested_slug,generated_at:x.generated_at},rule:'Keep the ContentScale snippet intact. Attribution is delivered by ContentScale and remains required.'});
  }));

  // Public controlled content endpoint. Removing the snippet removes the content; revoked placements stop serving it.
  app.get('/network/embed/:token.js', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).type('text/javascript').send('/* ContentScale Network disabled */');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).type('text/javascript').send('/* Invalid placement */');
    const r=await pool.query(`SELECT p.id AS placement_id,p.status,pv.html,pv.title
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id
      WHERE pv.generation_input_snapshot->>'delivery_token'=$1 LIMIT 1`,[token]);
    const x=r.rows[0];
    if(!x||!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(410).type('text/javascript').send('/* ContentScale placement unavailable */');
    res.set('Cache-Control','no-store, max-age=0');
    res.set('X-Content-Type-Options','nosniff');
    const payload=JSON.stringify(String(x.html||''));
    const js=`(()=>{const s=document.currentScript;if(!s)return;let c=s.previousElementSibling;if(!c||!c.classList||!c.classList.contains('contentscale-network-placement')){c=document.createElement('div');c.className='contentscale-network-placement';s.parentNode.insertBefore(c,s)}c.setAttribute('data-cs-placement','${Number(x.placement_id)}');c.innerHTML=${payload};})();`;
    res.type('text/javascript').send(js);
  }));

  app.get('/network/publishing', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(publishingPage());
  });

  // PLACEMENTS — commitments created only after hard interest + approved site check.
  app.get('/api/network/admin/placements', verifyAdmin, wrap(async (req, res) => {
    const r=await pool.query(`SELECT p.id,p.content_id,p.publisher_website_id,p.status,p.reward_credits,p.brand_mention_required,p.source_link_required,p.published_url,p.accepted_at,p.submitted_at,p.verified_at,p.cancelled_at,p.created_at,p.updated_at,
      c.title,c.brand_name,c.source_snapshot->>'pitch' AS pitch,c.primary_niche,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,w.scan_snapshot AS publisher_scan
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1000`);
    const placements=r.rows.map(x=>Object.assign({},x,{protection_mode:x.publisher_status==='trusted'?'monitored_html':'protected_delivery',content_scale_marker_required:true,credits_earned:x.status==='verified'}));
    res.json({success:true,placements,policy:{approved:'protected_delivery',trusted:'monitored_html',loose_html_for_approved:false,continuous_verification_required:true}});
  }));

  app.post('/api/network/admin/placements/:id/cancel', verifyAdmin, wrap(async (req, res) => {
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const pr=await pool.query('SELECT * FROM network_placements WHERE id=$1 LIMIT 1',[id]);
    const p=pr.rows[0];if(!p)return res.status(404).json({success:false,error:'Placement not found'});
    if(p.status!=='accepted')return res.status(409).json({success:false,error:'Only an accepted placement with no publication in progress can be cancelled here'});
    const vr=await pool.query('SELECT id,generated_at FROM network_publication_versions WHERE placement_id=$1 LIMIT 1',[id]);
    if(vr.rows[0] && vr.rows[0].generated_at)return res.status(409).json({success:false,error:'A Publisher Edition was already generated. Resolve/revoke it through the publishing workflow instead of simple cancellation.'});
    const r=await pool.query(`UPDATE network_placements SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='accepted' RETURNING *`,[id]);
    const remaining=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placements WHERE content_id=$1 AND status NOT IN ('cancelled','rejected')`,[p.content_id]);
    const cr=await pool.query('SELECT desired_placements FROM network_content WHERE id=$1 LIMIT 1',[p.content_id]);
    const max=Math.max(1,Math.min(5,Number(cr.rows[0]?.desired_placements)||1));
    if(Number(remaining.rows[0].n)<max)await pool.query(`UPDATE network_content SET distribution_status=CASE WHEN $2::int>0 THEN 'hard_interest' ELSE 'offered' END,publication_status='available',updated_at=NOW() WHERE id=$1`,[p.content_id,Number(remaining.rows[0].n)]);
    res.json({success:true,placement:r.rows[0],remaining_commitments:Number(remaining.rows[0].n),max_placements:max,opportunity_reopened:Number(remaining.rows[0].n)<max,rule:'Cancelled before Publisher Edition generation.'});
  }));

  app.get('/network/placements', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(placementsPage());
  });


  // VERIFICATION + CREDIT RELEASE — only after a generated Publisher Edition is live.
  app.get('/api/network/admin/verification-queue', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT p.id,p.status,p.reward_credits,p.published_url,p.submitted_at,p.verified_at,
      c.title,c.brand_name,w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      pv.id AS publication_version_id,pv.generated_at,
      vr.result_status AS latest_result,vr.http_status AS latest_http_status,vr.indexable AS latest_indexable,vr.canonical_ok AS latest_canonical_ok,
      vr.brand_mention_ok AS latest_brand_mention_ok,vr.source_link_ok AS latest_source_link_ok,vr.content_match_ok AS latest_content_match_ok,vr.details AS latest_details,vr.checked_at AS latest_checked_at,
      EXISTS(SELECT 1 FROM network_credit_transactions ct JOIN network_credit_wallets cw ON cw.id=ct.wallet_id WHERE ct.placement_id=p.id AND ct.idempotency_key=('placement:'||p.id||':reward:v1')) AS credit_awarded
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id
      LEFT JOIN LATERAL (SELECT * FROM network_verification_runs z WHERE z.placement_id=p.id ORDER BY z.run_no DESC LIMIT 1) vr ON TRUE
      WHERE p.status IN ('ready','submitted','verifying','needs_review','verified')
      ORDER BY p.updated_at DESC,p.id DESC LIMIT 1000`);
    res.json({success:true,items:r.rows,rule:'Credits are awarded once, only after a passing live verification.'});
  }));

  app.post('/api/network/admin/placements/:id/submit-live', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const raw=cleanText(req.body&&req.body.published_url,2048);if(!raw)return res.status(400).json({success:false,error:'Live article URL is required'});
    let live;try{live=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw)}catch(e){return res.status(400).json({success:false,error:'Enter a valid public live URL'})}
    if(!['http:','https:'].includes(live.protocol))return res.status(400).json({success:false,error:'Only http/https URLs are allowed'});
    const q=await pool.query(`SELECT p.status,w.domain AS publisher_domain FROM network_placements p JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    if(!['ready','submitted','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'Generate the Publisher Edition before submitting a live URL'});
    const host=live.hostname.toLowerCase().replace(/^www\./,'');
    const expected=String(x.publisher_domain||'').toLowerCase().replace(/^www\./,'');
    if(!(host===expected||host.endsWith('.'+expected)))return res.status(409).json({success:false,error:'The live URL must be on the committed publisher website: '+expected});
    await assertPublicHostname(live.hostname);
    const r=await pool.query(`UPDATE network_placements SET published_url=$2,status=CASE WHEN status='verified' THEN 'verified' ELSE 'submitted' END,submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING *`,[id,live.toString()]);
    res.json({success:true,placement:r.rows[0],rule:'Exact live URL saved. Verification still required before credits are earned.'});
  }));

  app.post('/api/network/admin/placements/:id/verify-live', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.*,c.brand_name,c.owner_website_id,w.domain AS publisher_domain,w.status AS publisher_status,
      pv.html AS edition_html,pv.generation_input_snapshot,ow.domain AS owner_domain
      FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Generated placement not found'});
    if(!x.published_url)return res.status(409).json({success:false,error:'Save the exact live URL before verification'});
    if(!['submitted','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'Placement is not ready for live verification'});
    await pool.query(`UPDATE network_placements SET status='verifying',updated_at=NOW() WHERE id=$1 AND status!='verified'`,[id]);
    let fetched,analysis,fetchError='';
    try{fetched=await safeFetchHtml(x.published_url);analysis=analyzeWebsiteHtml({status:fetched.response.status,html:fetched.html,finalUrl:fetched.finalUrl,contentType:fetched.contentType})}catch(e){fetchError=e.message;analysis={http_status:null,indexable:false,canonical:'',technical_pass:false,password_protected:false}}
    const html=String(fetched&&fetched.html||'');
    const snap=x.generation_input_snapshot||{};const token=cleanText(snap.delivery_token,128);
    const snippetPresent=!!token && (html.includes(token)||html.includes('/network/embed/'+token+'.js'));
    const editionHtml=String(x.edition_html||'');
    const editionText=htmlText(editionHtml).toLowerCase();
    const brand=cleanText(x.brand_name,250).toLowerCase();
    const owner=cleanText(x.owner_domain,300).toLowerCase();
    const brandOk=!x.brand_mention_required||!brand||editionText.includes(brand);
    const sourceOk=!x.source_link_required||(!owner?false:editionHtml.toLowerCase().includes(owner));
    const statusCode=fetched&&fetched.response?fetched.response.status:null;
    const httpOk=Number(statusCode)>=200&&Number(statusCode)<400;
    const noindex=/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)||/<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
    const passwordProtected=Number(statusCode)===401||Number(statusCode)===403||/password protected|enter password|member login/i.test(htmlText(html).slice(0,3000));
    const canonicalTag=(html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)||[])[0]||'';
    const canonical=extractAttr(canonicalTag,'href');
    let canonicalOk=true;if(canonical){try{const cu=new URL(canonical,x.published_url),lu=new URL(x.published_url);canonicalOk=cu.hostname.replace(/^www\./,'').toLowerCase()===lu.hostname.replace(/^www\./,'').toLowerCase()}catch(e){canonicalOk=false}}
    const indexable=httpOk&&!noindex&&!passwordProtected;
    const passed=httpOk&&indexable&&canonicalOk&&snippetPresent&&brandOk&&sourceOk;
    const result=passed?'passed':'needs_review';
    const rn=await pool.query('SELECT COALESCE(MAX(run_no),0)+1 AS n FROM network_verification_runs WHERE placement_id=$1',[id]);
    const runNo=Number(rn.rows[0].n)||1;
    const details={protected_snippet_present:snippetPresent,delivery_token_expected:!!token,final_url:fetched&&fetched.finalUrl||x.published_url,canonical:canonical||null,noindex,password_protected:passwordProtected,fetch_error:fetchError||null,required_brand:brand||null,required_source_domain:owner||null};
    await pool.query(`INSERT INTO network_verification_runs (placement_id,run_no,http_status,indexable,canonical_ok,brand_mention_ok,source_link_ok,content_match_ok,password_protected,result_status,details,checked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW())`,[id,runNo,statusCode,indexable,canonicalOk,brandOk,sourceOk,snippetPresent,passwordProtected,result,JSON.stringify(details)]);
    let creditAwarded=false;
    if(passed){
      const client=await pool.connect();try{await client.query('BEGIN');
        let wr=await client.query('SELECT * FROM network_credit_wallets WHERE website_id=$1 FOR UPDATE',[x.publisher_website_id]);
        if(!wr.rows[0])wr=await client.query(`INSERT INTO network_credit_wallets (website_id,balance,reserved,created_at,updated_at) VALUES ($1,0,0,NOW(),NOW()) ON CONFLICT (website_id) DO UPDATE SET updated_at=NOW() RETURNING *`,[x.publisher_website_id]);
        const wallet=wr.rows[0];const key='placement:'+id+':reward:v1';
        const tr=await client.query(`INSERT INTO network_credit_transactions (wallet_id,placement_id,transaction_type,amount,idempotency_key,note,metadata,created_at)
          VALUES ($1,$2,'placement_verified',$3,$4,'Credits released after verified live placement',$5::jsonb,NOW()) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,[wallet.id,id,x.reward_credits,key,JSON.stringify({verification_run:runNo,published_url:x.published_url})]);
        if(tr.rows[0]){await client.query('UPDATE network_credit_wallets SET balance=balance+$2,updated_at=NOW() WHERE id=$1',[wallet.id,x.reward_credits]);creditAwarded=true}
        await client.query(`UPDATE network_placements SET status='verified',verified_at=COALESCE(verified_at,NOW()),updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_content SET verified_placements=(SELECT COUNT(*)::int FROM network_placements WHERE content_id=$1 AND status='verified'),distribution_status='verified',updated_at=NOW() WHERE id=$1`,[x.content_id]);
        await client.query('COMMIT');
      }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
    }else{
      await pool.query(`UPDATE network_placements SET status='needs_review',updated_at=NOW() WHERE id=$1`,[id]);
    }
    res.json({success:true,verified:passed,result_status:result,credit_awarded:creditAwarded,credits:x.reward_credits,checks:{http_ok:httpOk,indexable,canonical_ok:canonicalOk,protected_snippet_present:snippetPresent,brand_mention_ok:brandOk,source_link_ok:sourceOk,password_protected:passwordProtected},details,rule:passed?'Verified placement; credits may be released once only.':'No credits released. Fix the live placement and recheck.'});
  }));

  app.get('/network/verification', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(verificationPage());
  });

  // WEBSITE REGISTRY — all writes remain inside network_websites.
  app.get('/api/network/admin/websites', verifyAdmin, wrap(async (req, res) => {
    const r = await pool.query(`SELECT id,domain,canonical_url,brand_name,primary_niche,sub_niche,country,language,cms,ownership_type,status,scan_snapshot,approved_at,suspended_at,created_at,updated_at
      FROM network_websites ORDER BY created_at DESC, id DESC LIMIT 1000`);
    res.json({ success: true, websites: r.rows });
  }));

  app.post('/api/network/admin/websites', verifyAdmin, wrap(async (req, res) => {
    if (!envEnabled()) return res.status(409).json({ success: false, error: 'Network is disabled' });
    const site = normalizeSite(req.body && req.body.domain);
    const ownership = req.body && req.body.ownership_type === 'owned' ? 'owned' : 'external';
    const values = [site.domain, site.canonical_url, cleanText(req.body?.brand_name,200)||null, cleanText(req.body?.primary_niche,120)||null, cleanText(req.body?.sub_niche,120)||null, cleanText(req.body?.country,120)||null, cleanText(req.body?.language,30)||null, cleanText(req.body?.cms,80)||null, ownership];
    try {
      const r = await pool.query(`INSERT INTO network_websites (domain,canonical_url,brand_name,primary_niche,sub_niche,country,language,cms,ownership_type,status,scan_snapshot,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','{}'::jsonb,NOW(),NOW()) RETURNING *`, values);
      res.status(201).json({ success: true, website: r.rows[0] });
    } catch (e) {
      if (e && e.code === '23505') return res.status(409).json({ success: false, error: 'This domain already exists in Network Websites.' });
      throw e;
    }
  }));

  // Hard rule: do not spend a site-check request until hard interest is explicitly confirmed.
  app.post('/api/network/admin/websites/:id/check', verifyAdmin, wrap(async (req, res) => {
    if (req.body?.hard_interest_confirmed !== true) return res.status(409).json({ success: false, error: 'Hard publication interest must be confirmed before the website check.' });
    const wr = await pool.query('SELECT * FROM network_websites WHERE id=$1 LIMIT 1', [req.params.id]);
    if (!wr.rows[0]) return res.status(404).json({ success: false, error: 'Website not found' });
    const w = wr.rows[0];
    const target = w.canonical_url || ('https://' + w.domain);
    let check;
    try {
      const fetched = await safeFetchHtml(target);
      check = analyzeWebsiteHtml({ status: fetched.response.status, html: fetched.html, finalUrl: fetched.finalUrl, contentType: fetched.contentType });
    } catch (e) {
      check = { outcome: 'rejected', technical_pass: false, error: cleanText(e.message,500), checked_url: target, checked_at: new Date().toISOString() };
    }
    check.hard_interest_confirmed = true;
    check.hard_interest_confirmed_at = new Date().toISOString();
    check.checked_by_admin_id = req.admin && req.admin.id || null;
    const ur = await pool.query(`UPDATE network_websites SET scan_snapshot=$2::jsonb, updated_at=NOW() WHERE id=$1 RETURNING *`, [w.id, JSON.stringify(check)]);
    res.json({ success: true, check, website: ur.rows[0], rule: 'No Publisher Edition may be generated until this website is approved.' });
  }));

  app.patch('/api/network/admin/websites/:id/status', verifyAdmin, wrap(async (req, res) => {
    const allowed = new Set(['pending','approved','trusted','suspended','rejected']);
    const status = cleanText(req.body?.status,30).toLowerCase();
    if (!allowed.has(status)) return res.status(400).json({ success: false, error: 'Invalid website status' });
    const r = await pool.query(`UPDATE network_websites SET status=$2,
      approved_at=CASE WHEN $2 IN ('approved','trusted') THEN COALESCE(approved_at,NOW()) ELSE approved_at END,
      suspended_at=CASE WHEN $2='suspended' THEN NOW() ELSE suspended_at END,
      updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,status]);
    if (!r.rows[0]) return res.status(404).json({ success:false,error:'Website not found' });
    res.json({ success:true,website:r.rows[0] });
  }));

  app.get('/network/websites', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(websitesPage());
  });

  app.get('/network', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Network</title><style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0b1020;color:#eef2ff}main{max-width:980px;margin:0 auto;padding:56px 24px}.card{background:#121a2f;border:1px solid #263253;border-radius:18px;padding:26px}.badge{display:inline-block;padding:7px 10px;border-radius:999px;background:#18213b;border:1px solid #33436c;font-size:12px}h1{font-size:42px;margin:18px 0 12px}p{color:#b9c4df;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:24px}.mini{display:block;color:#eef2ff;text-decoration:none;padding:18px;border-radius:14px;background:#0f1629;border:1px solid #263253}.mini:hover{border-color:#5a78b8}.muted{font-size:13px;color:#8492b6}</style></head><body><main><div class="card"><span class="badge">Network isolated module</span><h1>ContentScale Network</h1><p>Content & Distribution CRM. External Publisher Editions are generated only after hard interest and an approved target website.</p><div class="grid"><a class="mini" href="/network/websites"><strong>Websites</strong><div class="muted">Registry + hard-interest site check</div></a><a class="mini" href="/network/opportunities"><strong>Opportunities</strong><div class="muted">H1 + pitch → hard interest</div></a><a class="mini" href="/network/publishing"><strong>Publishing</strong><div class="muted">Protected Publisher Editions</div></a><a class="mini" href="/network/placements"><strong>Placements</strong><div class="muted">Commitments + protection policy</div></a><a class="mini" href="/network/verification"><strong>Verification</strong><div class="muted">Live URL → verify → credits</div></a></div></div></main></body></html>`);
  });

  return { registered: true, enabled: envEnabled(), schema_version: NETWORK_SCHEMA_VERSION };
}

module.exports = { registerNetwork, ensureNetworkTables, inspectNetworkSchema, NETWORK_SCHEMA_VERSION, NETWORK_TABLES };
