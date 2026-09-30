'use strict';

// CONTENTSCALE NETWORK — SAFE ISOLATED MODULE
// Rule: a Network failure may break Network only, never the core ContentScale app.
// This module owns only network_* tables and must not ALTER/DELETE core tables.

const dns = require('dns').promises;
const net = require('net');

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
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Network</title><style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0b1020;color:#eef2ff}main{max-width:980px;margin:0 auto;padding:56px 24px}.card{background:#121a2f;border:1px solid #263253;border-radius:18px;padding:26px}.badge{display:inline-block;padding:7px 10px;border-radius:999px;background:#18213b;border:1px solid #33436c;font-size:12px}h1{font-size:42px;margin:18px 0 12px}p{color:#b9c4df;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:24px}.mini{display:block;color:#eef2ff;text-decoration:none;padding:18px;border-radius:14px;background:#0f1629;border:1px solid #263253}.mini:hover{border-color:#5a78b8}.muted{font-size:13px;color:#8492b6}</style></head><body><main><div class="card"><span class="badge">Network isolated module</span><h1>ContentScale Network</h1><p>Content & Distribution CRM. External Publisher Editions are generated only after hard interest and an approved target website.</p><div class="grid"><a class="mini" href="/network/websites"><strong>Websites</strong><div class="muted">Registry + hard-interest site check</div></a><div class="mini"><strong>Content Library</strong><div class="muted">Next</div></div><div class="mini"><strong>Publishing</strong><div class="muted">Next</div></div><div class="mini"><strong>Placements</strong><div class="muted">Next</div></div></div></div></main></body></html>`);
  });

  return { registered: true, enabled: envEnabled(), schema_version: NETWORK_SCHEMA_VERSION };
}

module.exports = { registerNetwork, ensureNetworkTables, inspectNetworkSchema, NETWORK_SCHEMA_VERSION, NETWORK_TABLES };
