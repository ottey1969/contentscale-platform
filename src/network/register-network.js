'use strict';

// CONTENTSCALE NETWORK — PUBLISHER SIGNUP EMAILS + ADMIN STATUS v438
// Rule: a Network failure may break Network only, never the core ContentScale app.
// This module owns only network_* tables and must not ALTER/DELETE core tables.

const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const multer = require('multer');
const networkImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const NETWORK_SCHEMA_VERSION = 9;
const NETWORK_TABLES = [
  'network_websites',
  'network_content',
  'network_publication_versions',
  'network_placements',
  'network_credit_wallets',
  'network_credit_transactions',
  'network_verification_runs',
  'network_publication_images',
  'network_image_library',
  'network_referral_partners',
  'network_referral_codes',
  'network_referrals',
  'network_publisher_applications',
  'network_publisher_accounts',
  'network_ads'
];


const NETWORK_LOCALES = [
  ['en-US','English','United States','LTR'],['en-GB','English','United Kingdom','LTR'],['en-AU','English','Australia','LTR'],['en-CA','English','Canada','LTR'],
  ['nl-NL','Dutch','Netherlands','LTR'],['nl-BE','Dutch','Belgium','LTR'],['de-DE','German','Germany','LTR'],['de-AT','German','Austria','LTR'],['de-CH','German','Switzerland','LTR'],
  ['fr-FR','French','France','LTR'],['fr-BE','French','Belgium','LTR'],['fr-CA','French','Canada','LTR'],['es-ES','Spanish','Spain','LTR'],['es-MX','Spanish','Mexico','LTR'],['es-US','Spanish','United States','LTR'],
  ['it-IT','Italian','Italy','LTR'],['pt-PT','Portuguese','Portugal','LTR'],['pt-BR','Portuguese','Brazil','LTR'],['pl-PL','Polish','Poland','LTR'],['ro-RO','Romanian','Romania','LTR'],['bg-BG','Bulgarian','Bulgaria','LTR'],
  ['ru-RU','Russian','Russia','LTR'],['uk-UA','Ukrainian','Ukraine','LTR'],['fi-FI','Finnish','Finland','LTR'],['sv-SE','Swedish','Sweden','LTR'],['nb-NO','Norwegian','Norway','LTR'],['da-DK','Danish','Denmark','LTR'],
  ['cs-CZ','Czech','Czechia','LTR'],['sk-SK','Slovak','Slovakia','LTR'],['hu-HU','Hungarian','Hungary','LTR'],['el-GR','Greek','Greece','LTR'],['tr-TR','Turkish','Türkiye','LTR'],
  ['ar-SA','Arabic','Saudi Arabia','RTL'],['ar-AE','Arabic','United Arab Emirates','RTL'],['ar-EG','Arabic','Egypt','RTL'],['he-IL','Hebrew','Israel','RTL'],
  ['zh-CN','Chinese','China','LTR'],['zh-TW','Chinese','Taiwan','LTR'],['zh-HK','Chinese','Hong Kong','LTR'],['ja-JP','Japanese','Japan','LTR'],['ko-KR','Korean','South Korea','LTR'],
  ['hi-IN','Hindi','India','LTR'],['bn-BD','Bengali','Bangladesh','LTR'],['ur-PK','Urdu','Pakistan','RTL'],['id-ID','Indonesian','Indonesia','LTR'],['ms-MY','Malay','Malaysia','LTR'],['th-TH','Thai','Thailand','LTR'],['vi-VN','Vietnamese','Vietnam','LTR'],['fil-PH','Filipino','Philippines','LTR']
];
function localeDirection(code){const x=NETWORK_LOCALES.find(r=>r[0]===code);return x?x[3]:'LTR'}
function safeJsonObject(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function firstThreeWords(v){return cleanText(v,300).split(/\s+/).filter(Boolean).slice(0,3).join(' ')}
function normalizeImageKey(v){return cleanText(v,255).toLowerCase().replace(/\.(jpe?g|png|webp)$/i,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,220)}

function envEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.NETWORK_ENABLED || '').trim());
}

function cleanText(v, max = 500) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}


async function networkNotifyOwnerPublisherApplication(appRow, extra = {}) {
  const row = appRow || {};
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const toEmail = cleanText(process.env.NETWORK_NOTIFY_EMAIL || process.env.QUICK_SCAN_NOTIFY_EMAIL || 'info@contentscale.site', 320);
  const fromEmail = cleanText(process.env.FROM_EMAIL || 'info@contentscale.site', 320);
  const source = cleanText(extra.source || (row.metadata && row.metadata.source) || 'network_landing', 100);
  const referredBy = cleanText(extra.referred_by || '', 220);
  const appId = Number(row.id || 0);
  const status = {
    state: key ? 'pending' : 'not_configured',
    attempted_at: new Date().toISOString(),
    to: toEmail,
    provider: key ? 'brevo' : null,
    error: key ? null : 'BREVO_API_KEY is not configured'
  };

  if (!key) {
    if (appId) {
      await pool.query(
        `UPDATE network_publisher_applications
         SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW()
         WHERE id=$1`,
        [appId, JSON.stringify({ owner_notification: status })]
      ).catch(()=>{});
    }
    return status;
  }

  const esc = v => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const adminUrl = 'https://app.contentscale.site/network/advertising';
  const brand = cleanText(row.brand_name || row.domain || 'New publisher', 220);
  const subject = `New Network Publisher Application — ${brand}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
    <h2>New ContentScale Network publisher application</h2>
    <p>
      <b>Business:</b> ${esc(row.brand_name || '—')}<br>
      <b>Domain:</b> ${esc(row.domain || '—')}<br>
      <b>Contact:</b> ${esc(row.contact_name || '—')}<br>
      <b>Email:</b> ${esc(row.email || '—')}<br>
      <b>Niche:</b> ${esc(row.niche || '—')}<br>
      <b>Source:</b> ${esc(source)}${referredBy ? `<br><b>Referred by:</b> ${esc(referredBy)}` : ''}
    </p>
    ${row.message ? `<p><b>Message:</b><br>${esc(row.message)}</p>` : ''}
    <p><a href="${adminUrl}">Open publisher applications in Network Admin</a></p>
  </div>`;

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        to: [{ email: toEmail }],
        sender: { email: fromEmail, name: 'ContentScale Network' },
        subject,
        htmlContent: html
      })
    });
    const body = await r.text().catch(()=> '');
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${body.slice(0,300)}`);
    status.state = 'sent';
    status.sent_at = new Date().toISOString();
    status.error = null;
  } catch (e) {
    status.state = 'failed';
    status.error = cleanText(e && e.message || e, 500);
  }

  if (appId) {
    await pool.query(
      `UPDATE network_publisher_applications
       SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW()
       WHERE id=$1`,
      [appId, JSON.stringify({ owner_notification: status })]
    ).catch(()=>{});
  }
  return status;
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


function escapeHtmlAttr(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function normalizeComparableText(v) {
  return htmlText(String(v || '')).toLowerCase().replace(/[^a-z0-9\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}

function publicationTextMatch(expectedHtml, liveHtml) {
  const expected = normalizeComparableText(expectedHtml);
  const live = normalizeComparableText(liveHtml);
  if (!expected || !live) return { matched:false, matched_phrases:0, tested_phrases:0 };
  const words = expected.split(' ').filter(Boolean);
  const starts = [0, Math.floor(words.length*0.22), Math.floor(words.length*0.47), Math.floor(words.length*0.72)].filter((v,i,a)=>v>=0&&v+10<=words.length&&a.indexOf(v)===i);
  const phrases = starts.map(i=>words.slice(i,i+10).join(' ')).filter(x=>x.length>=35);
  const hits = phrases.filter(x=>live.includes(x)).length;
  return { matched: phrases.length ? hits >= Math.min(2, phrases.length) : live.includes(expected.slice(0,120)), matched_phrases:hits, tested_phrases:phrases.length };
}

function publicationStandardChecks(html) {
  const s=String(html||'');
  const hasDirect=/class=["'][^"']*cs-direct-answer/i.test(s);
  const hasTldr=/class=["'][^"']*cs-tldr/i.test(s);
  const hasToc=/class=["'][^"']*cs-toc/i.test(s) && /href=["']#/i.test(s);
  const hasTable=/<table\b/i.test(s) && /class=["'][^"']*cs-table-wrap/i.test(s);
  const h1=(s.match(/<h1\b/gi)||[]).length;
  const h2=(s.match(/<h2\b/gi)||[]).length;
  const faq=!!buildFaqSchemaFromHtml(s);
  const statsTable=/class=["'][^"']*cs-table/i.test(s)&&/(statistic|statistics|by the numbers|source)/i.test(htmlText(s));
  return {h1_count:h1,direct_answer:hasDirect,tldr:hasTldr,table_of_contents:hasToc,mobile_friendly_table:hasTable,statistics_table:statsTable,faq_present:faq,h2_count:h2,passed:h1===1&&hasDirect&&hasTldr&&hasToc&&hasTable&&h2>=3};
}

function buildFaqSchemaFromHtml(html) {
  const section=(String(html||'').match(/<section\b[^>]*class=["'][^"']*cs-faq[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)||[])[1]||'';
  if(!section)return null;
  const items=[];
  const re=/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;let m;
  while((m=re.exec(section))&&items.length<12){const q=cleanText(htmlText(m[1]),300),a=cleanText(htmlText(m[2]),1400);if(q&&a)items.push({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})}
  return items.length?{'@context':'https://schema.org','@type':'FAQPage',mainEntity:items}:null;
}

function buildBreadcrumbSchema(row) {
  const host=normalizeHost(row.publisher_domain||'');
  const slug=slugifyNetwork(row.suggested_slug||row.title||'article');
  if(!host||!slug)return null;
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:cleanText(row.publisher_brand||host,200)||host,item:'https://'+host+'/'},
    {'@type':'ListItem',position:2,name:cleanText(row.title||'Article',300)||'Article',item:'https://'+host+'/'+slug+'/'}
  ]};
}

function buildSeoPublicationHtml(row, images) {
  const rendered=renderEditionHtml(row,images);
  const faq=buildFaqSchemaFromHtml(row.html);
  const breadcrumb=buildBreadcrumbSchema(row);
  const schemas=[rendered.schema].concat(faq?[faq]:[]).concat(breadcrumb?[breadcrumb]:[]).filter(Boolean);
  const scripts=schemas.map((x,i)=>`<script type="application/ld+json" data-contentscale-schema="${i===0?'article':(x&&x['@type']==='FAQPage'?'faq':'breadcrumb')}">${JSON.stringify(x).replace(/<\/script/gi,'<\\/script')}</script>`).join('\n');
  const marker=`<!-- ContentScale Network indexable placement ${Number(row.placement_id||row.id||0)} -->`;
  return `${marker}\n${rendered.html}\n${scripts}`;
}

function safeHexColor(v, fallback) {
  const x = String(v || '').trim();
  return /^#[0-9a-f]{6}$/i.test(x) ? x : fallback;
}

function getPublicationSettings(snapshot, defaults = {}) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const p = s.publication_settings && typeof s.publication_settings === 'object' ? s.publication_settings : {};
  return {
    primary_color: safeHexColor(p.primary_color, '#111827'),
    accent_color: safeHexColor(p.accent_color, '#2563eb'),
    author_type: ['company','person','publisher'].includes(p.author_type) ? p.author_type : 'company',
    author_name: cleanText(p.author_name || defaults.author_name || '', 200),
    author_url: cleanText(p.author_url || defaults.author_url || '', 1000),
    author_bio: cleanText(p.author_bio || defaults.author_bio || '', 1000),
    author_job_title: cleanText(p.author_job_title || '', 160),
    image_mode: ['off','prompt_only','auto_generate'].includes(p.image_mode) ? p.image_mode : 'prompt_only'
  };
}


function extractUrlsDeep(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  const found = text.match(/https?:\/\/[^\s"'<>\)\]}]+/gi) || [];
  return Array.from(new Set(found.map(u=>String(u).replace(/[.,;:]+$/,'')))).slice(0,200);
}

function normalizeHost(value) {
  try { return new URL(/^https?:\/\//i.test(String(value||'')) ? String(value) : 'https://'+String(value||'')).hostname.toLowerCase().replace(/^www\./,''); }
  catch(e) { return ''; }
}

function extractH2Headings(html) {
  const out=[]; let n=0;
  String(html||'').replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m,inner)=>{n++;out.push({number:n,text:htmlText(inner).trim(),first_three:firstThreeWords(htmlText(inner).trim())});return m});
  return out;
}

function linkIntelligenceFromSources(row, prewriteBrief) {
  const urls = extractUrlsDeep(prewriteBrief && prewriteBrief.brief_json ? prewriteBrief.brief_json : {});
  const sourceHost = normalizeHost(row.source_domain || '');
  const publisherHost = normalizeHost(row.publisher_domain || '');
  const internal=[], external=[];
  for(const u of urls){
    const h=normalizeHost(u); if(!h) continue;
    if((sourceHost && (h===sourceHost||h.endsWith('.'+sourceHost))) || (publisherHost && (h===publisherHost||h.endsWith('.'+publisherHost)))) internal.push(u);
    else external.push(u);
  }
  return {internal:Array.from(new Set(internal)).slice(0,30),external:Array.from(new Set(external)).slice(0,30),prewrite_used:!!prewriteBrief};
}

function scorePublication(row, images) {
  const html = String(row.html || '');
  const text = htmlText(html);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const h2 = (html.match(/<h2\b/gi) || []).length;
  const h3 = (html.match(/<h3\b/gi) || []).length;
  const links = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)).map(m=>m[1]);
  const sourceLink = row.source_domain ? links.some(u=>String(u).includes(row.source_domain)) : !row.source_link_required;
  const externalLinks = links.filter(u=>/^https?:\/\//i.test(u));
  const metaTitleLen = String(row.meta_title || '').trim().length;
  const metaDescLen = String(row.meta_description || '').trim().length;
  const schema = row.schema_json && typeof row.schema_json === 'object' ? row.schema_json : {};
  const imageRows = Array.isArray(images) ? images : [];
  const uploaded = imageRows.filter(x=>x.status==='uploaded'||x.status==='approved');
  const featured = uploaded.some(x=>x.image_role==='featured');
  const altOk = uploaded.length > 0 && uploaded.every(x=>String(x.alt_text||'').trim().length>=8);
  const settings = getPublicationSettings(row.generation_input_snapshot, {author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''});
  const authorOk = !!settings.author_name;
  let score = 0;
  const parts = {};
  parts.depth = words >= 900 ? 18 : words >= 650 ? 14 : words >= 400 ? 9 : 4; score += parts.depth;
  parts.structure = h2 >= 3 ? 12 : h2 >= 2 ? 9 : h2 >= 1 ? 5 : 0; score += parts.structure;
  parts.meta = (metaTitleLen>=35&&metaTitleLen<=60?7:3) + (metaDescLen>=110&&metaDescLen<=160?7:3); score += parts.meta;
  parts.schema = (schema && Object.keys(schema).length ? 10 : 0); score += parts.schema;
  parts.source = sourceLink ? 10 : 0; score += parts.source;
  parts.links = externalLinks.length >= 2 ? 10 : externalLinks.length >= 1 ? 7 : 2; score += parts.links;
  parts.images = featured ? (altOk ? 12 : 8) : uploaded.length ? 5 : 0; score += parts.images;
  parts.author = authorOk ? 8 : 0; score += parts.author;
  parts.mobile_css = 8; score += parts.mobile_css;
  score = Math.max(0, Math.min(100, score));
  return {score, status:score>=80?'passed':score>=65?'needs_review':'failed', words, h2, h3, external_link_count:externalLinks.length, source_link_ok:sourceLink, featured_image:featured, image_count:uploaded.length, author_ok:authorOk, parts};
}

function buildArticleSchema(row, images, settings) {
  const uploaded = (images||[]).filter(x=>x.status==='uploaded'||x.status==='approved');
  const imageUrls = uploaded.map(x=>`https://app.contentscale.site/network/media/${x.id}`);
  const author = settings.author_type==='person'
    ? {'@type':'Person',name:settings.author_name || undefined,url:settings.author_url || undefined,jobTitle:settings.author_job_title || undefined}
    : {'@type':'Organization',name:settings.author_name || row.source_brand || row.brand_name || undefined,url:settings.author_url || (row.source_domain?`https://${row.source_domain}`:undefined)};
  const base = row.schema_json && typeof row.schema_json === 'object' ? Object.assign({}, row.schema_json) : {};
  const schema = Object.assign(base, {
    '@context':'https://schema.org',
    '@type': base['@type'] || 'Article',
    headline: row.title || base.headline,
    description: row.meta_description || base.description,
    author,
    publisher: {'@type':'Organization',name: row.publisher_brand || row.publisher_domain || 'Publisher'},
    image: imageUrls.length ? imageUrls : base.image
  });
  Object.keys(schema).forEach(k=>schema[k]===undefined&&delete schema[k]);
  return schema;
}

function networkEditionCss(settings) {
  return `.cs-network-content{--cs-primary:${settings.primary_color};--cs-accent:${settings.accent_color};max-width:840px;margin:0 auto;font-family:inherit;font-size:inherit;line-height:1.72;color:inherit;overflow-wrap:anywhere}.cs-network-content *{box-sizing:border-box}.cs-network-content article{width:100%}.cs-network-content h1,.cs-network-content h2,.cs-network-content h3{color:var(--cs-primary);line-height:1.2;margin:1.45em 0 .55em}.cs-network-content h1{font-size:clamp(1.8rem,5vw,2.65rem);margin-top:.25em}.cs-network-content h2{font-size:clamp(1.35rem,3.5vw,1.85rem)}.cs-network-content h3{font-size:clamp(1.1rem,3vw,1.35rem)}.cs-network-content p,.cs-network-content li{line-height:1.72}.cs-network-content a{color:var(--cs-accent);text-decoration-thickness:.08em;text-underline-offset:.14em}.cs-network-content img{display:block;width:100%;height:auto;max-width:100%;border-radius:10px;margin:18px 0}.cs-network-content figure{margin:24px 0}.cs-network-content figcaption{font-size:.86em;opacity:.72;margin-top:7px}.cs-network-content blockquote{margin:24px 0;padding:12px 16px;border-left:4px solid var(--cs-accent);background:color-mix(in srgb,var(--cs-accent) 7%,transparent)}.cs-network-content ul,.cs-network-content ol{padding-left:1.25rem}.cs-direct-answer,.cs-tldr,.cs-callout{border:1px solid color-mix(in srgb,var(--cs-accent) 30%,transparent);background:color-mix(in srgb,var(--cs-accent) 7%,transparent);border-radius:12px;padding:18px 20px;margin:20px 0}.cs-toc{border:1px solid rgba(127,127,127,.24);border-radius:12px;padding:18px 22px;margin:22px 0}.cs-table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:22px 0;border:1px solid rgba(127,127,127,.22);border-radius:12px}.cs-table{width:100%;min-width:640px;border-collapse:collapse;margin:0}.cs-table th,.cs-table td{padding:11px 12px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left;vertical-align:top}.cs-table th{font-weight:700;color:var(--cs-primary);background:rgba(127,127,127,.06)}.cs-table tr:last-child td{border-bottom:0}.cs-network-author{margin-top:28px;padding:16px;border:1px solid color-mix(in srgb,var(--cs-primary) 20%,transparent);border-radius:12px}.cs-network-author strong{color:var(--cs-primary)}.contentscale-network-credit{margin-top:28px!important}@media(max-width:640px){.cs-network-content{max-width:100%;padding:0 2px}.cs-network-content h1{font-size:1.9rem}.cs-network-content h2{font-size:1.42rem}.cs-network-content p,.cs-network-content li{font-size:1rem}.cs-network-author{padding:13px}.cs-direct-answer,.cs-tldr,.cs-callout,.cs-toc{padding:14px}.cs-table{min-width:560px;font-size:.92rem}}`;
}

function renderEditionHtml(row, images) {
  const settings = getPublicationSettings(row.generation_input_snapshot, {author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''});
  const uploaded = (images||[]).filter(x=>x.status==='uploaded'||x.status==='approved').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id);
  const featured = uploaded.find(x=>x.image_role==='featured');
  const supporting = uploaded.filter(x=>x.image_role!=='featured');
  const fig = x=>`<figure class="cs-network-image"><img src="https://app.contentscale.site/network/media/${Number(x.id)}?v=${encodeURIComponent(String(x.updated_at||x.byte_size||Date.now()))}" alt="${String(x.alt_text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" loading="lazy">${x.caption?`<figcaption>${String(x.caption).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</figcaption>`:''}</figure>`;
  let body = String(row.html||'');
  if(featured) body = fig(featured) + body;
  const unmatched=[];
  for(const im of supporting){
    const hint=String(im.placement_hint||'');
    let placed=false;
    if(hint.startsWith('before-h2-num:')){
      const wanted=Number(hint.slice('before-h2-num:'.length)); let idx=0;
      body=body.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m)=>{idx++;if(!placed&&idx===wanted){placed=true;return fig(im)+m}return m});
    } else if(hint.startsWith('before-h2:')){
      const target=hint.slice('before-h2:'.length).trim().toLowerCase();
      body=body.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m,inner)=>{if(placed)return m;const txt=htmlText(inner).trim().toLowerCase();if(txt.startsWith(target)){placed=true;return fig(im)+m}return m});
    }
    if(!placed) unmatched.push(im);
  }
  // v429 invariant: every uploaded image must appear in the rendered article. If a saved H2 target no longer exists,
  // fall back deterministically to the first H2; if there is no H2, place after the first paragraph; otherwise append.
  for(const im of unmatched){
    const markup=fig(im);
    if(/<h2\b[^>]*>/i.test(body)){
      body=body.replace(/<h2\b[^>]*>/i,m=>markup+m);
    } else if(/<\/p>/i.test(body)){
      body=body.replace(/<\/p>/i,m=>m+markup);
    } else {
      body+=markup;
    }
  }

  if(settings.author_name) {
    body += `<aside class="cs-network-author" data-cs-author="true"><strong>About the author</strong><div>${settings.author_url?`<a href="${settings.author_url}" target="_blank" rel="noopener">${settings.author_name}</a>`:settings.author_name}${settings.author_job_title?` · ${settings.author_job_title}`:''}</div>${settings.author_bio?`<p>${settings.author_bio}</p>`:''}</aside>`;
  }
  return {settings, html:`<div class="cs-network-content" data-cs-responsive="true" dir="${localeDirection(cleanText(row.source_snapshot?.language||row.generation_input_snapshot?.language||'en-US',30))==='RTL'?'rtl':'ltr'}"><style>${networkEditionCss(settings)}</style>${body}</div>`, schema:buildArticleSchema(row,uploaded,settings)};
}

async function ensureReferralAdminIdText(pool) {
  if (!pool) throw new Error('Database unavailable');
  const r = await pool.query(`SELECT table_name,column_name,data_type
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('network_referral_partners','network_referral_codes')
      AND column_name='created_by_admin_id'`);
  for (const row of r.rows) {
    if (row.data_type !== 'text') {
      const table = row.table_name === 'network_referral_partners' ? 'network_referral_partners' : 'network_referral_codes';
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);
    }
  }
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

    await client.query(`CREATE TABLE IF NOT EXISTS network_publication_images (
      id BIGSERIAL PRIMARY KEY,
      publication_version_id BIGINT NOT NULL REFERENCES network_publication_versions(id) ON DELETE RESTRICT,
      placement_id BIGINT NOT NULL REFERENCES network_placements(id) ON DELETE RESTRICT,
      image_role TEXT NOT NULL DEFAULT 'supporting' CHECK (image_role IN ('featured','supporting')),
      image_name TEXT NOT NULL,
      prompt TEXT,
      alt_text TEXT,
      caption TEXT,
      suggested_filename TEXT,
      placement_hint TEXT,
      mime_type TEXT,
      original_filename TEXT,
      image_data BYTEA,
      byte_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'prompt_ready' CHECK (status IN ('prompt_ready','uploaded','approved')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publication_images_version ON network_publication_images(publication_version_id, sort_order, id)`);

    await client.query(`CREATE TABLE IF NOT EXISTS public.network_image_library (
      id BIGSERIAL PRIMARY KEY,
      normalized_key TEXT NOT NULL UNIQUE,
      image_name TEXT NOT NULL,
      suggested_filename TEXT,
      alt_text TEXT,
      caption TEXT,
      prompt TEXT,
      source_image_id BIGINT REFERENCES network_publication_images(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_image_library_filename ON public.network_image_library(LOWER(suggested_filename))`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referral_partners (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','blocked')),
      notes TEXT,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_partners_status ON network_referral_partners(status,created_at DESC)`);
    // Admin IDs in the existing ContentScale auth layer are opaque session/admin references, not guaranteed numeric.
    // Keep Network audit refs as TEXT so values such as ADMIN-... never hit a BIGINT cast.
    await client.query(`ALTER TABLE network_referral_partners ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);
    await client.query(`ALTER TABLE network_referral_partners DROP CONSTRAINT IF EXISTS network_referral_partners_status_check`);
    await client.query(`ALTER TABLE network_referral_partners ADD CONSTRAINT network_referral_partners_status_check CHECK (status IN ('active','paused','blocked','revoked'))`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referral_codes (
      id BIGSERIAL PRIMARY KEY,
      website_id BIGINT REFERENCES network_websites(id) ON DELETE RESTRICT,
      partner_id BIGINT REFERENCES network_referral_partners(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      label TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_codes_website ON network_referral_codes(website_id,is_active)`);

    await client.query(`ALTER TABLE network_referral_codes ADD COLUMN IF NOT EXISTS partner_id BIGINT`);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_network_referral_codes_partner') THEN
        ALTER TABLE network_referral_codes ADD CONSTRAINT fk_network_referral_codes_partner FOREIGN KEY (partner_id) REFERENCES network_referral_partners(id) ON DELETE RESTRICT;
      END IF;
    END $$`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_codes_partner ON network_referral_codes(partner_id,is_active)`);
    await client.query(`ALTER TABLE network_referral_codes ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referrals (
      id BIGSERIAL PRIMARY KEY,
      referral_code_id BIGINT NOT NULL REFERENCES network_referral_codes(id) ON DELETE RESTRICT,
      referred_member_ref TEXT,
      status TEXT NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked','registered','activated','rewarded','rejected')),
      reward_credits INTEGER NOT NULL DEFAULT 10 CHECK (reward_credits >= 0),
      activated_at TIMESTAMPTZ,
      rewarded_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referrals_code_status ON network_referrals(referral_code_id,status,created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_publisher_applications (
      id BIGSERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      brand_name TEXT,
      contact_name TEXT,
      email TEXT NOT NULL,
      niche TEXT,
      message TEXT,
      referral_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','activated')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publisher_applications_status ON network_publisher_applications(status,created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_publisher_accounts (
      id BIGSERIAL PRIMARY KEY,
      application_id BIGINT UNIQUE REFERENCES network_publisher_applications(id) ON DELETE SET NULL,
      website_id BIGINT UNIQUE REFERENCES network_websites(id) ON DELETE RESTRICT,
      email TEXT NOT NULL,
      contact_name TEXT,
      access_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','revoked')),
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publisher_accounts_email ON network_publisher_accounts(LOWER(email),status)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_ads (
      id BIGSERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      headline TEXT NOT NULL,
      description TEXT,
      target_url TEXT NOT NULL,
      logo_url TEXT,
      niche TEXT,
      locale TEXT NOT NULL DEFAULT 'en-US',
      placement TEXT NOT NULL DEFAULT 'homepage' CHECK (placement IN ('homepage','homepage_featured','niche')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','rejected','expired')),
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_ads_public ON network_ads(status,placement,starts_at,ends_at,created_at DESC)`);

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

async function ensureNetworkImageLibrary(pool) {
  if (!pool) throw new Error('DB unavailable');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.network_image_library (
    id BIGSERIAL PRIMARY KEY,
    normalized_key TEXT NOT NULL UNIQUE,
    image_name TEXT NOT NULL,
    suggested_filename TEXT,
    alt_text TEXT,
    caption TEXT,
    prompt TEXT,
    source_image_id BIGINT REFERENCES public.network_publication_images(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_network_image_library_filename ON public.network_image_library(LOWER(suggested_filename))`);
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
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Websites</div><h1>Network Websites</h1><div class="note">Register publishers first. A site check is only run after hard publication interest. Passing the technical check does not force approval; you remain in control.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
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
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Opportunities</div><h1>Distribution Opportunities</h1><div class="note">Create only an H1 + short pitch. No external Publisher Edition is written until a publisher shows hard interest and chooses an approved website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div><datalist id="localeCodes"><option value="en-US">English — United States</option><option value="en-GB">English — United Kingdom</option><option value="en-AU">English — Australia</option><option value="en-CA">English — Canada</option><option value="nl-NL">Dutch — Netherlands</option><option value="nl-BE">Dutch — Belgium</option><option value="de-DE">German — Germany</option><option value="de-AT">German — Austria</option><option value="fr-FR">French — France</option><option value="fr-CA">French — Canada</option><option value="es-ES">Spanish — Spain</option><option value="es-MX">Spanish — Mexico</option><option value="it-IT">Italian — Italy</option><option value="pt-PT">Portuguese — Portugal</option><option value="pt-BR">Portuguese — Brazil</option><option value="pl-PL">Polish — Poland</option><option value="ro-RO">Romanian — Romania</option><option value="bg-BG">Bulgarian — Bulgaria</option><option value="ru-RU">Russian — Russia</option><option value="uk-UA">Ukrainian — Ukraine</option><option value="fi-FI">Finnish — Finland</option><option value="sv-SE">Swedish — Sweden</option><option value="nb-NO">Norwegian — Norway</option><option value="da-DK">Danish — Denmark</option><option value="cs-CZ">Czech — Czechia</option><option value="sk-SK">Slovak — Slovakia</option><option value="hu-HU">Hungarian — Hungary</option><option value="el-GR">Greek — Greece</option><option value="tr-TR">Turkish — Türkiye</option><option value="ar-SA">Arabic — Saudi Arabia</option><option value="ar-AE">Arabic — United Arab Emirates</option><option value="ar-EG">Arabic — Egypt</option><option value="he-IL">Hebrew — Israel</option><option value="zh-CN">Chinese — China</option><option value="zh-TW">Chinese — Taiwan</option><option value="zh-HK">Chinese — Hong Kong</option><option value="ja-JP">Japanese — Japan</option><option value="ko-KR">Korean — South Korea</option><option value="hi-IN">Hindi — India</option><option value="bn-BD">Bengali — Bangladesh</option><option value="ur-PK">Urdu — Pakistan</option><option value="id-ID">Indonesian — Indonesia</option><option value="ms-MY">Malay — Malaysia</option><option value="th-TH">Thai — Thailand</option><option value="vi-VN">Vietnamese — Vietnam</option><option value="fil-PH">Filipino — Philippines</option></datalist>
<section class="card"><h2>Create opportunity</h2><div class="grid">
<div class="field span2"><label>H1 / working title</label><input id="title" placeholder="e.g. 7 Emergency Roof Repair Mistakes NJ Homeowners Should Avoid"></div>
<div class="field"><label>Brand</label><input id="brand" placeholder="Perfect Roofing Team"></div>
<div class="field"><label>Source website</label><select id="ownerWebsite"><option value="">Optional</option></select></div>
<div class="field"><label>Prewrite Brief</label><select id="prewriteBrief"><option value="">Optional — choose existing brief</option></select></div>
<div class="field span2"><label>Google manual check / notes</label><textarea id="googleManual" placeholder="Manual only. Add Google findings when you have checked them. Network will not pretend this was automated."></textarea></div>
<div class="field"><label>Main niche</label><input id="niche" placeholder="Roofing"></div>
<div class="field"><label>Subniche</label><input id="subniche" placeholder="Emergency Roofing"></div>
<div class="field"><label>Country / market</label><input id="country" placeholder="United States"></div>
<div class="field"><label>Language / locale</label><input id="language" list="localeCodes" placeholder="en-US"><button type="button" class="btn secondary" id="localeHelp" style="margin-top:6px">Language cheat sheet</button></div>
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
 let websites=[],briefs=[];
 async function loadWebsites(){const d=await api('/api/network/admin/websites');websites=d.websites||[];const owner=document.getElementById('ownerWebsite');owner.innerHTML='<option value="">Optional</option>'+websites.map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('');try{const pb=await api('/api/network/admin/prewrite-briefs');briefs=pb.briefs||[];const pe=document.getElementById('prewriteBrief');if(pe)pe.innerHTML='<option value="">Optional — choose existing brief</option>'+briefs.map(x=>'<option value="'+x.id+'">#'+x.id+' · '+esc(x.keyword||x.working_title||'Brief')+' · '+esc(x.language||'')+'</option>').join('')}catch(e){}}
 function approvedOptions(){return websites.filter(w=>(w.status==='approved'||w.status==='trusted')&&w.scan_snapshot&&w.scan_snapshot.technical_pass===true).map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('')}
 function updateBulk(){const boxes=Array.from(document.querySelectorAll('.rowSelect'));const checked=boxes.filter(x=>x.checked);document.getElementById('selectedCount').textContent=checked.length+' selected';document.getElementById('deleteSelected').disabled=!checked.length;document.getElementById('selectAll').checked=boxes.length>0&&checked.length===boxes.length}
 async function load(){const b=document.getElementById('rows');try{await loadWebsites();const d=await api('/api/network/admin/opportunities');const a=d.opportunities||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No opportunities yet. Create the first H1 + pitch above.</td></tr>';updateBulk();return;}const opts=approvedOptions();b.innerHTML=a.map(x=>{const max=Math.max(1,Math.min(5,Number(x.desired_placements)||1)),used=Number(x.interest_count||0),full=used>=max,status=full?'full':(x.publication_status||'available');return '<tr><td><input class="check rowSelect" type="checkbox" value="'+x.id+'"></td><td><strong>'+esc(x.title)+'</strong><div class="pitch tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+(x.prewrite_brief_id?' · Prewrite #'+esc(x.prewrite_brief_id):' · No Prewrite')+'</div></td><td>'+esc(x.primary_niche||'—')+'<div class="tiny">'+esc(x.sub_niche||'')+'</div></td><td>'+esc(x.country||'—')+'<div class="tiny">'+esc(x.language||'')+'</div></td><td><span class="status '+esc(status)+'">'+esc(status)+'</span><div class="tiny">'+used+' / '+max+' placements</div></td><td><strong>'+used+'</strong><div class="tiny">publisher commitments</div></td><td><div class="actions"><select data-site-for="'+x.id+'" '+(full?'disabled':'')+'><option value="">'+(full?'Placement limit reached':'Choose approved website')+'</option>'+(full?'':opts)+'</select><button class="btn good" data-action="interest" data-id="'+x.id+'" '+(full?'disabled':'')+'>'+(full?'Full — '+used+'/'+max:'Hard interest')+'</button><button class="btn bad" data-action="delete" data-id="'+x.id+'">Delete</button></div></td></tr>'}).join('');updateBulk()}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('change',e=>{if(e.target.classList.contains('rowSelect'))updateBulk()});
 document.getElementById('selectAll').onchange=function(){document.querySelectorAll('.rowSelect').forEach(x=>x.checked=this.checked);updateBulk()};
 async function removeIds(ids,btn){if(!ids.length)return;if(!confirm('Delete '+ids.length+' selected opportunity'+(ids.length===1?'':'ies')+'? This is only allowed while no placement/publication is attached.'))return;busy(btn,true,'Deleting…');try{const d=await api('/api/network/admin/opportunities/delete',{method:'POST',body:JSON.stringify({ids})});btn.textContent='✓ Deleted '+d.deleted;await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}
 document.getElementById('deleteSelected').onclick=function(){const ids=Array.from(document.querySelectorAll('.rowSelect:checked')).map(x=>Number(x.value)).filter(Boolean);removeIds(ids,this)};
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='delete')return removeIds([id],btn);if(btn.dataset.action==='interest'){const sel=document.querySelector('select[data-site-for="'+id+'"]');const websiteId=Number(sel&&sel.value||0);if(!websiteId){alert('Choose an approved website first.');return;}if(!confirm('Confirm HARD publication interest for the selected approved website? No article has been written yet.'))return;busy(btn,true,'Confirming…');try{await api('/api/network/admin/opportunities/'+id+'/interest',{method:'POST',body:JSON.stringify({publisher_website_id:websiteId,hard_interest_confirmed:true})});btn.textContent='✓ Committed';alert('Hard interest recorded. Placement created. Final publication must use SEO-indexable HTML on the publisher site and will be monitored after publication.');await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}});
 document.getElementById('addBtn').onclick=async function(){const btn=this,m=document.getElementById('formMsg');busy(btn,true,'Creating…');m.textContent='Creating H1 + pitch…';try{await api('/api/network/admin/opportunities',{method:'POST',body:JSON.stringify({title:document.getElementById('title').value,pitch:document.getElementById('pitch').value,brand_name:document.getElementById('brand').value,owner_website_id:Number(document.getElementById('ownerWebsite').value||0)||null,primary_niche:document.getElementById('niche').value,sub_niche:document.getElementById('subniche').value,country:document.getElementById('country').value,language:document.getElementById('language').value,desired_placements:Number(document.getElementById('placements').value||1),prewrite_brief_id:Number((document.getElementById('prewriteBrief')||{}).value||0)||null,google_manual_notes:(document.getElementById('googleManual')||{}).value||''})});m.textContent='✓ Opportunity created — no full article written.';document.getElementById('title').value='';document.getElementById('pitch').value='';btn.textContent='✓ Created';await load()}catch(e){m.textContent=e.message}finally{busy(btn,false)}};
 document.getElementById('refreshBtn').onclick=async function(){busy(this,true,'Refreshing…');try{await load()}finally{busy(this,false)}};const lh=document.getElementById('localeHelp');if(lh)lh.onclick=()=>alert('Locale cheat sheet\n\nUS: en-US\nUK: en-GB\nNetherlands: nl-NL\nBelgium Dutch: nl-BE\nGermany: de-DE\nFrance: fr-FR\nSpain: es-ES\nPoland: pl-PL\nRomania: ro-RO\nBulgaria: bg-BG\nRussia: ru-RU\nFinland: fi-FI\nSaudi Arabic: ar-SA (RTL)\nUAE Arabic: ar-AE (RTL)\nEgypt Arabic: ar-EG (RTL)\nIsrael Hebrew: he-IL (RTL)\nChina: zh-CN\nTaiwan: zh-TW\nJapan: ja-JP\nKorea: ko-KR\nIndia Hindi: hi-IN\nBangladesh Bengali: bn-BD\nPakistan Urdu: ur-PK (RTL)\nPhilippines: fil-PH\n\nYou can type/search these in the locale field.');if(key)load();
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
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Publishing</div><h1>Publisher Editions</h1><div class="tiny">A Publisher Edition is generated only after hard interest and an approved target website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>SEO-indexable publication required.</strong><br>ContentScale creates one unique Publisher Edition per placement. Final publication must exist as real HTML in the publisher page source with required attribution and ongoing verification. JavaScript-only embeds are preview/legacy only and do not qualify.</div></section>
<section class="card"><div class="top"><h2>Publishing queue</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Edition</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');if(btn.dataset.old)btn.textContent=btn.dataset.old}}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/publishing');const a=d.items||[];if(!a.length){b.innerHTML='<tr><td colspan="6" class="tiny">No publisher commitments ready for publishing yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">Brand: '+esc(x.brand_name||'—')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td><span class="pill protected">'+esc(x.protection_mode)+'</span><div class="tiny">SEO-indexable HTML + required attribution</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.publication_version_id?'<strong>'+esc(x.edition_title||'Publisher Edition')+'</strong><div class="tiny">Generated '+esc(x.generated_at||'')+'<br>'+esc(x.quality_status||'')+'</div>':'<span class="tiny">Not generated yet</span>')+'</td><td><div class="actions">'+(x.status==='accepted'?'<button class="btn good" data-action="generate" data-id="'+x.id+'">Generate Publisher Edition</button>':'')+(x.publication_version_id?'<a class="btn secondary" href="/network/publishing/'+x.id+'">Open package</a>':'')+(x.status==='ready'&&x.delivery_available?'<button class="btn" data-action="copy" data-id="'+x.id+'">Copy preview snippet</button>':'')+(x.status==='generating'?'<button class="btn busy" disabled>Generating…</button>':'')+'</div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="6" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='generate'){if(!confirm('Generate one unique Publisher Edition for this approved placement now?'))return;busy(btn,true,'Generating…');try{const d=await api('/api/network/admin/placements/'+id+'/generate',{method:'POST',body:'{}'});btn.textContent='✓ Ready';await load()}catch(e){alert(e.message);await load()}finally{busy(btn,false)}}else if(btn.dataset.action==='copy'){busy(btn,true,'Preparing preview…');try{const d=await api('/api/network/admin/placements/'+id+'/delivery');await navigator.clipboard.writeText(d.snippet);btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='Copy preview snippet'},1600)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.classList.remove('busy')}}});
 document.getElementById('refreshBtn').onclick=load;if(key)load();
})();
</script></main></body></html>`;
}

function publishingDetailPage(placementId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publisher Edition Package | ContentScale</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1180px;margin:auto;padding:28px 18px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:18px;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}.field input,.field select,.field textarea{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:10px;font:inherit}.field textarea{min-height:88px;resize:vertical}.btn{border:1px solid #3c5f99;background:#17376c;color:#fff;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700;text-decoration:none;display:inline-flex;align-items:center}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.6;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.tiny{font-size:12px;color:#91a1c2}.score{font-size:42px;font-weight:900}.ok{color:#8ff0b2}.warn{color:#ffd785}.badText{color:#ff9ca8}.imgrow{border:1px solid #273a61;border-radius:12px;padding:12px;margin-top:10px}.actions{display:flex;gap:8px;flex-wrap:wrap}.preview{position:relative;background:white;color:#111;border-radius:12px;padding:18px;max-height:640px;overflow:auto;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none}.preview img{-webkit-user-drag:none;user-drag:none;pointer-events:none}.preview::before{content:'Protected ContentScale Preview';position:sticky;top:0;display:block;width:max-content;margin:0 0 12px auto;padding:5px 9px;border-radius:999px;background:rgba(8,16,31,.88);color:#fff;font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.04em;z-index:3}.preview .cs-h2-guide{display:flex;align-items:center;gap:9px;margin:24px 0 5px;color:#64748b;font:600 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}.preview .cs-h2-guide:after{content:"";height:1px;flex:1;background:rgba(100,116,139,.22)}.metaBox{padding:10px;border:1px solid #2d426c;border-radius:10px;background:#091327;overflow-wrap:anywhere}.swatch{width:48px;height:38px;padding:3px!important}.placed-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}.placed-image{position:relative;border:1px solid #273a61;border-radius:12px;padding:10px;background:#0a1427}.placed-image.dragging{opacity:.58}.drag-handle{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 0 2px;padding:8px 10px;border:1px dashed #4b67a0;border-radius:8px;background:#101b31;color:#dce8ff;font:700 12px/1.2 Inter,system-ui,sans-serif;cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}.drag-handle.selected{border-color:#8b5cf6;background:rgba(124,58,237,.18)}.cs-image-drop-zone{display:flex;align-items:center;justify-content:center;min-height:46px;margin:10px 0;border:2px dashed rgba(124,58,237,.38);border-radius:9px;background:rgba(124,58,237,.06);color:#6d5bb8;font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.03em;transition:.15s}.cs-image-drop-zone.drag-over{border-color:#7c3aed;background:rgba(124,58,237,.15);color:#4c1d95}.cs-image-drop-zone:before{content:'Drop image here';}.cs-image-drop-zone[data-drop-kind="featured"]:before{content:'Drop image here — Featured / before article';}.cs-image-drop-zone[data-drop-h2]:before{content:'Drop image here — before H2 #' attr(data-drop-h2);}.placed-image img{display:block;width:100%;height:150px;object-fit:cover;border-radius:9px;border:1px solid #35507a}.image-x{position:absolute;right:16px;top:16px;width:30px;height:30px;border-radius:50%;border:1px solid #ef4444;background:rgba(95,30,40,.95);color:#fff;font-size:18px;line-height:26px;font-weight:900;cursor:pointer;z-index:2}.placed-meta{margin-top:9px}.placed-meta strong{display:block;overflow-wrap:anywhere}.placed-actions{display:flex;gap:8px;align-items:end;margin-top:9px}.placed-actions .field{flex:1}.placed-actions select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:8px;font:inherit}@media(max-width:760px){.grid,.grid3{grid-template-columns:1fr}.score{font-size:34px}main{padding:20px 12px 50px}}</style></head><body><main>
<div class="top"><div><div class="tiny"><a href="/network">Network</a> / <a href="/network/publishing">Publishing</a> / Package</div><h1>Publisher Edition Package</h1></div><a class="btn secondary" href="/network/publishing">← Publishing</a></div>
<div id="auth" class="card" style="display:none">Open <a href="/admin">/admin</a> and log in first.</div>
<section class="card"><div class="grid3"><div><div class="tiny">ContentScore</div><div class="score" id="score">—</div><div class="tiny" id="gate"></div></div><div><div class="tiny">Publisher</div><strong id="publisher">—</strong><div class="tiny" id="source">—</div></div><div><div class="tiny">Publication</div><strong id="title">—</strong><div class="tiny" id="status">—</div></div></div></section>
<section class="card"><h2>SEO package</h2><div class="grid"><div><div class="tiny">Meta title</div><div class="metaBox" id="metaTitle">—</div></div><div><div class="tiny">Meta description</div><div class="metaBox" id="metaDesc">—</div></div><div><div class="tiny">Suggested slug</div><div class="metaBox" id="slug">—</div></div><div><div class="tiny">Schema</div><div class="metaBox">Article JSON-LD is generated automatically from the edition, author and uploaded images.</div></div></div></section>
<section class="card"><h2>Author & styling</h2><div class="grid3"><div class="field"><label>Author type</label><select id="authorType"><option value="company">Company</option><option value="person">Person</option><option value="publisher">Publisher</option></select></div><div class="field"><label>Author name</label><input id="authorName"></div><div class="field"><label>Job title (person only)</label><input id="authorJob"></div><div class="field"><label>Author URL</label><input id="authorUrl"></div><div class="field"><label>Primary color — headings</label><div style="display:flex;gap:8px;align-items:center"><input class="swatch" type="color" id="primary"><input id="primaryHex" maxlength="7" placeholder="#111827" style="max-width:110px"></div></div><div class="field"><label>Accent color — links & callouts</label><div style="display:flex;gap:8px;align-items:center"><input class="swatch" type="color" id="accent"><input id="accentHex" maxlength="7" placeholder="#2563eb" style="max-width:110px"></div></div><div class="field" style="grid-column:1/-1"><label>Short author bio</label><textarea id="authorBio"></textarea></div></div><div class="tiny" style="margin-top:10px">Primary changes article headings. Accent changes links, quote/callout borders and other highlights. Both are scoped only to the ContentScale block.</div><div class="actions" style="margin-top:12px"><button class="btn" id="saveSettings">Save author & colors</button></div><div class="tiny" style="margin-top:8px">Responsive CSS is scoped to the ContentScale block. It does not style the publisher's whole website.</div></section>
<section class="card"><div class="top"><div><h2>Images</h2><div class="tiny">Create a new image slot or add an existing image. Once an image is uploaded and placed, it leaves the workflow and moves to Placed images below.</div></div></div><h3 style="margin:8px 0 10px">A. Generate a new image</h3><div class="grid3"><div class="field"><label>Image name</label><input id="imageName" placeholder="Emergency roof inspection"></div><div class="field"><label>Role</label><select id="imageRole"><option value="featured">Featured</option><option value="supporting">Supporting</option></select></div><div class="field"><label>Place before H2 #</label><select id="imageH2Number"><option value="">Choose H2</option></select><div class="tiny" style="margin-top:5px">H2 numbers are shown as light guides in the protected preview.</div></div><div style="display:flex;align-items:end"><button class="btn" id="prepareImage">Generate prompt & metadata</button></div></div><div id="images"></div><div style="height:1px;background:#2a4065;margin:22px 0"></div><h3 style="margin:0 0 8px">B. Use an existing image from your computer</h3><div class="tiny" style="margin-bottom:12px">Choose the file first. ContentScale checks the image library by filename/name. If this image name was used before, saved alt text, caption and SEO filename are filled in automatically. You can always edit them.</div><form id="existingImageForm"><div class="grid3"><div class="field"><label>Choose existing image</label><input id="existingFile" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><div id="existingLookupStatus" class="tiny" style="margin-top:5px"></div></div><div class="field"><label>Image name / subject</label><input id="existingName" name="image_name" placeholder="high-wind-shingle-damage" required></div><div class="field"><label>Image placement</label><select id="existingPlacement" name="placement"><option value="featured">Featured — before article</option></select></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>Alt text</label><textarea id="existingAlt" name="alt_text" placeholder="Describe what is actually visible in the image" required></textarea></div><div class="field"><label>Caption</label><textarea id="existingCaption" name="caption" placeholder="Short useful caption" required></textarea></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>SEO filename</label><input id="existingFilename" name="suggested_filename" placeholder="high-wind-shingle-damage.jpg" required></div><div style="display:flex;align-items:end"><button class="btn" id="uploadExisting" type="submit">Add existing image</button></div></div></form><div style="height:1px;background:#2a4065;margin:22px 0"></div><div class="top"><div><h3 style="margin:0">Placed images</h3><div class="tiny">These images are already attached to the article. Use “↕ Drag image into article” and drop it on a placement line in the preview. You can also click the drag handle and then click a placement line. Click × only to close the card; the image stays in the article.</div></div><button type="button" class="btn secondary" id="showPlacedImages">Show all placed images</button></div><div id="placedImages" class="placed-grid"></div></section>
<section class="card"><div class="top"><div><h2>Link intelligence</h2><div class="tiny">Internal links come only from the linked Prewrite Brief. External AI suggestions are live-checked before they are shown as verified.</div></div><button class="btn secondary" id="suggestExternal">Suggest & verify external sources</button></div><div class="grid" style="margin-top:12px"><div><div class="tiny">Internal links from Prewrite</div><div id="internalLinks" class="metaBox">Loading…</div></div><div><div class="tiny">External sources</div><div id="externalLinks" class="metaBox">Loading…</div></div></div><div class="tiny" style="margin-top:8px">Nothing is inserted automatically. A verified URL only means ContentScale reached it successfully; editorial relevance still remains visible for review.</div></section>
<section class="card"><div class="top"><div><h2>Publication Standard</h2><div class="tiny">Required for final SEO delivery: Direct Answer, TL;DR, linked TOC, at least 3 H2 sections and at least one mobile-friendly table.</div></div></div><div id="publicationStandard" class="metaBox" style="margin-top:12px">Loading…</div></section>
<section class="card"><div class="top"><div><h2>Delivery</h2><div class="tiny">Final delivery is SEO-indexable HTML. JavaScript-only embeds are not accepted as final Network placements.</div></div><button class="btn good" id="copySeoHtml">Copy SEO publication HTML</button><button class="btn secondary" id="copySnippet">Copy preview snippet</button></div></section>
<section class="card"><div class="top"><div><h2 style="margin-bottom:4px">Article preview</h2><div class="tiny">Protected preview — text selection, copying, context menu and dragging are disabled. This deters casual copying but cannot prevent screenshots or developer-tool extraction.</div></div></div><div id="preview" class="preview" tabindex="0" aria-label="Protected publication preview">Loading…</div></section>
<script>(function(){const pid=${Number(placementId)||0},key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');let headings=[];if(!key)auth.style.display='block';const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(!r.ok)throw Error(d.error||('Request failed '+r.status));return d};function busy(b,on,label){if(on){b.dataset.old=b.textContent;b.disabled=true;b.classList.add('busy');b.textContent=label}else{b.disabled=false;b.classList.remove('busy');b.textContent=b.dataset.old||b.textContent}}function h2Options(current){return '<option value="">Choose H2</option>'+headings.map(h=>'<option value="'+h.number+'" '+(String(current||'')===String(h.number)?'selected':'')+'>#'+h.number+' · '+esc(h.text)+'</option>').join('')}function placementOptions(x){const hint=String(x.placement_hint||''),cur=hint.startsWith('before-h2-num:')?('h2:'+hint.slice(14)):(x.image_role==='featured'?'featured':'');return '<option value="featured" '+(cur==='featured'?'selected':'')+'>Featured — before article</option>'+headings.map(h=>'<option value="h2:'+h.number+'" '+(cur==='h2:'+h.number?'selected':'')+'>Before H2 #'+h.number+' · '+esc(h.text)+'</option>').join('')}function imgRow(x){const uploaded=x.status==='uploaded'||x.status==='approved',size=x.byte_size?Math.round(Number(x.byte_size)/1024)+' KB':'',thumb=uploaded?'<div style="margin-top:12px"><img src="/network/media/'+x.id+'?v='+encodeURIComponent(x.updated_at||Date.now())+'" alt="'+esc(x.alt_text||x.image_name||'Uploaded image')+'" style="display:block;max-width:320px;width:100%;height:auto;border-radius:10px;border:1px solid #35507a"><div class="tiny" style="margin-top:6px;color:#86efac">✓ Uploaded successfully'+(x.original_filename?' · '+esc(x.original_filename):'')+(size?' · '+size:'')+' · included in protected preview</div></div>':'';return '<div class="imgrow"><div class="top"><div><strong>'+esc(x.image_role)+' · '+esc(x.image_name)+'</strong><div class="tiny">'+esc(x.status)+' · Placement: '+esc(x.placement_hint||'not set')+'</div></div><button class="btn bad" data-del="'+x.id+'">Delete</button></div><div class="grid3" style="margin-top:10px"><div class="field" style="grid-column:span 2"><label>Image name / subject</label><input data-image-name="'+x.id+'" value="'+esc(x.image_name||'')+'" placeholder="e.g. Emergency roof tarp"><div class="tiny" style="margin-top:5px">Changing the file does not change its meaning. Update this name and regenerate metadata when the new image shows something different.</div></div><div style="display:flex;align-items:end"><button class="btn secondary" data-meta="'+x.id+'">Regenerate metadata</button></div></div><div class="grid3" style="margin-top:10px"><div class="field" style="grid-column:span 2"><label>Image placement</label><select data-move-placement="'+x.id+'">'+placementOptions(x)+'</select><div class="tiny" style="margin-top:5px">Choose Featured or an exact H2. Choosing an H2 automatically makes this a supporting image.</div></div><div style="display:flex;align-items:end"><button class="btn secondary" data-move="'+x.id+'">Update placement</button></div></div><div class="grid" style="margin-top:10px"><div><div class="tiny">Prompt</div><div class="metaBox">'+esc(x.prompt||'')+'</div><button class="btn secondary" data-copy="'+x.id+'" style="margin-top:6px">Copy prompt</button></div><div><div class="tiny">Alt text</div><div class="metaBox">'+esc(x.alt_text||'')+'</div><div class="tiny" style="margin-top:8px">Caption</div><div class="metaBox">'+esc(x.caption||'')+'</div><div style="margin-top:10px;padding:10px;border:1px solid #35507a;border-radius:8px"><div class="tiny">Suggested filename</div><strong style="display:block;margin-top:3px">'+esc(x.suggested_filename||'—')+'</strong><button class="btn secondary" type="button" data-copy-filename="'+x.id+'" data-filename="'+esc(x.suggested_filename||'')+'" style="margin-top:6px">Copy filename</button></div></div></div>'+thumb+'<form data-upload="'+x.id+'" style="margin-top:10px"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" required> <button class="btn">'+(uploaded?'Replace image':'Upload image')+'</button><span class="tiny upload-note" style="margin-left:8px"></span></form></div>'}function placedImgRow(x){const size=x.byte_size?Math.round(Number(x.byte_size)/1024)+' KB':'',src='/network/media/'+x.id+'?v='+encodeURIComponent(x.updated_at||Date.now());return '<div class="placed-image" data-drag-image="'+x.id+'" title="Use the Drag image handle to place this image in the article preview, or use the Placement selector below."><button type="button" class="image-x" data-dismiss="'+x.id+'" title="Close this card — image stays in article" aria-label="Close image card">×</button><img draggable="false" src="'+src+'" alt="'+esc(x.alt_text||x.image_name||'Placed image')+'"><div class="drag-handle" draggable="true" data-drag-handle="'+x.id+'" title="Drag this handle to a placement line in the article preview">↕ Drag image into article</div><div class="placed-meta"><strong>'+esc(x.image_name||x.original_filename||'Image')+'</strong><div class="tiny">'+esc(x.placement_hint||'not set')+(size?' · '+size:'')+'</div><div class="tiny" style="margin-top:5px"><b>Alt:</b> '+esc(x.alt_text||'—')+'</div><div class="tiny" style="margin-top:3px"><b>Caption:</b> '+esc(x.caption||'—')+'</div></div><div class="placed-actions"><div class="field"><label>Placement</label><select data-move-placement="'+x.id+'">'+placementOptions(x)+'</select></div><button type="button" class="btn secondary" data-move="'+x.id+'">Move</button></div></div>'}async function load(){const d=await api('/api/network/admin/publications/'+pid+'/package');const p=d.publication,q=d.quality,s=d.settings;document.getElementById('score').textContent=q.score+'/100';document.getElementById('score').className='score '+(q.score>=80?'ok':q.score>=65?'warn':'badText');document.getElementById('gate').textContent=d.quality_gate&&d.quality_gate.delivery_ready?'Quality + SEO Standard passed ✓':(q.score>=80?'Quality passed · SEO structure needs work':'Needs improvement before delivery');const ps=d.publication_standard||{};document.getElementById('publicationStandard').innerHTML='<div>'+(ps.direct_answer?'✓':'✕')+' Direct Answer</div><div>'+(ps.tldr?'✓':'✕')+' TL;DR / Key Takeaways</div><div>'+(ps.table_of_contents?'✓':'✕')+' Linked Table of Contents</div><div>'+(ps.mobile_friendly_table?'✓':'✕')+' Mobile-friendly table</div><div>'+(Number(ps.h2_count||0)>=3?'✓':'✕')+' 3+ H2 sections</div><div class="tiny" style="margin-top:8px">'+(ps.passed?'SEO structure ready ✓':'Final SEO HTML stays blocked until these required items are present.')+'</div>';document.getElementById('publisher').textContent=p.publisher_brand||p.publisher_domain;document.getElementById('source').textContent='Source: '+(p.source_brand||p.source_domain||'—');document.getElementById('title').textContent=p.title;document.getElementById('status').textContent=p.quality_status+' · '+p.status;document.getElementById('metaTitle').textContent=p.meta_title||'—';document.getElementById('metaDesc').textContent=p.meta_description||'—';document.getElementById('slug').textContent=p.suggested_slug||'—';document.getElementById('authorType').value=s.author_type;document.getElementById('authorName').value=s.author_name||'';document.getElementById('authorJob').value=s.author_job_title||'';document.getElementById('authorUrl').value=s.author_url||'';document.getElementById('authorBio').value=s.author_bio||'';document.getElementById('primary').value=s.primary_color;document.getElementById('accent').value=s.accent_color;document.getElementById('primaryHex').value=s.primary_color;document.getElementById('accentHex').value=s.accent_color;headings=d.h2_headings||[];document.getElementById('imageH2Number').innerHTML=h2Options('');document.getElementById('existingPlacement').innerHTML='<option value="featured">Featured — before article</option>'+headings.map(h=>'<option value="h2:'+h.number+'">Before H2 #'+h.number+' · '+esc(h.text)+'</option>').join('');const hasFeatured=(d.images||[]).some(x=>x.image_role==='featured'&&(x.status==='uploaded'||x.status==='approved'||x.status==='prompt_ready'));document.getElementById('imageRole').value=hasFeatured?'supporting':'featured';const allImages=d.images||[],pendingImages=allImages.filter(x=>x.status!=='uploaded'&&x.status!=='approved'),placedImages=allImages.filter(x=>x.status==='uploaded'||x.status==='approved');const dismissedKey='cs_network_dismissed_images_'+pid;let dismissed=[];try{dismissed=JSON.parse(localStorage.getItem(dismissedKey)||'[]')}catch(_e){dismissed=[]}const visiblePlaced=placedImages.filter(x=>!dismissed.includes(String(x.id)));document.getElementById('images').innerHTML=pendingImages.map(imgRow).join('')||'<div class="tiny" style="margin-top:10px">Ready for a new image.</div>';document.getElementById('placedImages').innerHTML=visiblePlaced.map(placedImgRow).join('')||(placedImages.length?'<div class="tiny">All placed image cards are closed. The images remain in the article. Click Show all placed images to manage them again.</div>':'<div class="tiny">No images placed yet.</div>');const li=d.link_intelligence||{},fmt=a=>(a&&a.length)?a.map(u=>'<div style="margin:4px 0">'+esc(u)+'</div>').join(''):'<span class="tiny">None found in linked Prewrite Brief.</span>';document.getElementById('internalLinks').innerHTML=fmt(li.prewrite_internal||[]);const ext=li.external_candidates||[];document.getElementById('externalLinks').innerHTML=ext.length?ext.map(x=>'<div style="margin:7px 0"><strong class="'+(x.status==='verified'?'ok':'badText')+'">'+esc(x.status)+'</strong> · '+esc(x.final_url||x.url||'')+'<div class="tiny">HTTP '+esc(x.http_status||'—')+(x.title?' · '+esc(x.title):'')+(x.reason?' · '+esc(x.reason):'')+'</div></div>').join(''):fmt(li.prewrite_external||[]);const pv=document.getElementById('preview');pv.innerHTML=p.rendered_html||p.html||'<p>No HTML.</p>';const articleRoot=pv.querySelector('.cs-network-content')||pv;const featuredDrop=document.createElement('div');featuredDrop.className='cs-image-drop-zone';featuredDrop.dataset.dropKind='featured';articleRoot.insertBefore(featuredDrop,articleRoot.firstChild);Array.from(pv.querySelectorAll('h2')).forEach((h,i)=>{const n=i+1,g=document.createElement('div');g.className='cs-h2-guide';g.textContent='H2 #'+n;const dz=document.createElement('div');dz.className='cs-image-drop-zone';dz.dataset.dropH2=String(n);h.parentNode.insertBefore(g,h);h.parentNode.insertBefore(dz,h)});document.getElementById('copySeoHtml').disabled=!(d.quality_gate&&d.quality_gate.delivery_ready);document.getElementById('copySnippet').disabled=q.score<80}function syncHex(colorId,hexId){const c=document.getElementById(colorId),h=document.getElementById(hexId);c.addEventListener('input',()=>h.value=c.value);h.addEventListener('input',()=>{const v=String(h.value||'').trim();if(/^#[0-9a-f]{6}$/i.test(v))c.value=v})}syncHex('primary','primaryHex');syncHex('accent','accentHex');document.getElementById('imageRole').addEventListener('change',function(){if(this.value==='featured')document.getElementById('imageH2Number').value='';});document.getElementById('imageH2Number').addEventListener('change',function(){if(this.value)document.getElementById('imageRole').value='supporting';});const existingFile=document.getElementById('existingFile'),existingName=document.getElementById('existingName'),existingAlt=document.getElementById('existingAlt'),existingCaption=document.getElementById('existingCaption'),existingFilename=document.getElementById('existingFilename'),existingLookupStatus=document.getElementById('existingLookupStatus');async function lookupExistingMeta(raw){const key=String(raw||'').replace(/\.(jpe?g|png|webp)$/i,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();if(!key)return;const f=existingFile.files&&existingFile.files[0];existingLookupStatus.textContent='Checking saved metadata…';existingLookupStatus.style.color='#9fb7df';try{const d=await api('/api/network/admin/publications/'+pid+'/images/resolve-existing-metadata',{method:'POST',body:JSON.stringify({name:key,original_filename:f?f.name:''})});if(d.image){const x=d.image;existingName.value=x.image_name||key;existingAlt.value=x.alt_text||'';existingCaption.value=x.caption||'';existingFilename.value=x.suggested_filename||((key||'image')+'.jpg');existingLookupStatus.textContent=d.reused?'✓ Existing SEO metadata found — fields filled automatically':'✓ SEO metadata created from the image name — review it, then add the image';existingLookupStatus.style.color='#86efac'}else{throw Error('No metadata returned')}}catch(e){if(!existingName.value)existingName.value=key;if(!existingFilename.value)existingFilename.value=key+((f&&f.name.match(/\.(jpe?g|png|webp)$/i)||['.jpg'])[0].toLowerCase());existingLookupStatus.textContent='Metadata generation unavailable: '+e.message;existingLookupStatus.style.color='#fca5a5'}}existingFile.addEventListener('change',function(){const f=this.files&&this.files[0];if(!f)return;const stem=f.name.replace(/\.(jpe?g|png|webp)$/i,'');existingName.value=stem;existingFilename.value=f.name.toLowerCase().replace(/[^a-z0-9.]+/g,'-');lookupExistingMeta(stem)});existingName.addEventListener('blur',function(){if(this.value.trim())lookupExistingMeta(this.value.trim())});document.getElementById('existingImageForm').addEventListener('submit',async function(e){e.preventDefault();const b=document.getElementById('uploadExisting'),f=existingFile.files&&existingFile.files[0];if(!f)return alert('Choose an existing image file.');if(!existingName.value.trim()||!existingAlt.value.trim()||!existingCaption.value.trim()||!existingFilename.value.trim())return alert('Image name, alt text, caption and SEO filename are required.');const choice=document.getElementById('existingPlacement').value||'featured',fd=new FormData();fd.append('image',f);fd.append('image_name',existingName.value.trim());fd.append('alt_text',existingAlt.value.trim());fd.append('caption',existingCaption.value.trim());fd.append('suggested_filename',existingFilename.value.trim());fd.append('image_role',choice==='featured'?'featured':'supporting');fd.append('h2_number',choice.startsWith('h2:')?choice.slice(3):'0');busy(b,true,'Adding image…');try{const r=await fetch('/api/network/admin/publications/'+pid+'/images/existing-upload',{method:'POST',headers:{'x-admin-key':key},body:fd}),t=await r.text();let d={};try{d=JSON.parse(t)}catch(_e){}if(!r.ok)throw Error(d.error||'Upload failed');b.textContent=d.reused_metadata?'✓ Added · metadata reused':'✓ Added · metadata saved';this.reset();existingName.value='';existingAlt.value='';existingCaption.value='';existingFilename.value='';existingLookupStatus.textContent='';await load();document.getElementById('preview').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){alert(err.message)}finally{busy(b,false)}});document.getElementById('showPlacedImages').onclick=async function(){localStorage.removeItem('cs_network_dismissed_images_'+pid);this.textContent='✓ Restored';await load();setTimeout(()=>{this.textContent='Show all placed images'},1000)};document.getElementById('saveSettings').onclick=async function(){const b=this;busy(b,true,'Saving…');try{await api('/api/network/admin/publications/'+pid+'/settings',{method:'PATCH',body:JSON.stringify({author_type:authorType.value,author_name:authorName.value,author_job_title:authorJob.value,author_url:authorUrl.value,author_bio:authorBio.value,primary_color:primaryHex.value||primary.value,accent_color:accentHex.value||accent.value,image_mode:'prompt_only'})});b.textContent='✓ Saved';await load()}catch(e){alert(e.message)}finally{busy(b,false)}};document.getElementById('prepareImage').onclick=async function(){if(!imageName.value.trim())return alert('Enter an image name first.');const b=this;busy(b,true,'Generating metadata…');try{await api('/api/network/admin/publications/'+pid+'/images/prepare',{method:'POST',body:JSON.stringify({image_name:imageName.value,image_role:(Number((document.getElementById('imageH2Number')||{}).value||0)>0?'supporting':imageRole.value),h2_number:Number((document.getElementById('imageH2Number')||{}).value||0)||0})});imageName.value='';document.getElementById('imageH2Number').value='';b.textContent='✓ Ready';await load()}catch(e){alert(e.message)}finally{busy(b,false)}};async function handleImageClick(e){const dismiss=e.target.closest('[data-dismiss]');if(dismiss){const id=String(dismiss.dataset.dismiss||'');const dismissedKey='cs_network_dismissed_images_'+pid;let arr=[];try{arr=JSON.parse(localStorage.getItem(dismissedKey)||'[]')}catch(_e){arr=[]}if(id&&!arr.includes(id))arr.push(id);localStorage.setItem(dismissedKey,JSON.stringify(arr));const card=dismiss.closest('.placed-image');if(card)card.remove();const box=document.getElementById('placedImages');if(box&&!box.querySelector('.placed-image'))box.innerHTML='<div class="tiny">Image card closed. The image remains in the article. Click Show all placed images to manage it again.</div>';return}const fn=e.target.closest('[data-copy-filename]');if(fn){await navigator.clipboard.writeText(fn.dataset.filename||'');fn.textContent='✓ Copied';setTimeout(()=>fn.textContent='Copy filename',1200);return}const c=e.target.closest('[data-copy]');if(c){const row=c.closest('.imgrow'),box=row.querySelector('.metaBox');await navigator.clipboard.writeText(box.textContent);c.textContent='✓ Copied';setTimeout(()=>c.textContent='Copy prompt',1200);return}const md=e.target.closest('[data-meta]');if(md){const id=md.dataset.meta,name=((document.querySelector('[data-image-name=\"'+id+'\"]')||{}).value||'').trim();if(!name)return alert('Enter the image name / subject first.');busy(md,true,'Updating metadata…');try{await api('/api/network/admin/publications/'+pid+'/images/'+id+'/metadata',{method:'PATCH',body:JSON.stringify({image_name:name})});md.textContent='✓ Updated';await load()}catch(err){alert(err.message)}finally{busy(md,false)}return}const mv=e.target.closest('[data-move]');if(mv){const id=mv.dataset.move,choice=(document.querySelector('[data-move-placement="'+id+'"]')||{}).value||'';if(!choice)return alert('Choose an image placement.');const role=choice==='featured'?'featured':'supporting',h2Number=choice.startsWith('h2:')?Number(choice.slice(3))||0:0;busy(mv,true,'Moving…');try{await api('/api/network/admin/publications/'+pid+'/images/'+id+'/placement',{method:'PATCH',body:JSON.stringify({image_role:role,h2_number:h2Number})});mv.textContent='✓ Moved';await load();document.getElementById('preview').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){alert(err.message)}finally{busy(mv,false)}return}const d=e.target.closest('[data-del]');if(d&&confirm('Delete this unused image slot? Uploaded/placed images should be closed with × instead so they stay in the article.')){busy(d,true,'Removing…');try{await api('/api/network/admin/publications/'+pid+'/images/'+d.dataset.del,{method:'DELETE'});await load();const pv=document.getElementById('preview');if(pv)pv.scrollIntoView({behavior:'smooth',block:'nearest'})}catch(err){alert(err.message)}finally{busy(d,false)}}}document.getElementById('images').addEventListener('click',handleImageClick);document.getElementById('placedImages').addEventListener('click',handleImageClick);document.getElementById('images').addEventListener('submit',async e=>{const f=e.target.closest('form[data-upload]');if(!f)return;e.preventDefault();const b=f.querySelector('button'),note=f.querySelector('.upload-note'),fd=new FormData(f);if(note)note.textContent='';busy(b,true,'Uploading…');try{const r=await fetch('/api/network/admin/publications/'+pid+'/images/'+f.dataset.upload+'/upload',{method:'POST',headers:{'x-admin-key':key},body:fd}),t=await r.text();let d={};try{d=JSON.parse(t)}catch(_e){}if(!r.ok)throw Error(d.error||'Upload failed');if(note){note.textContent='✓ Upload saved. Updating article preview…';note.style.color='#86efac'}b.textContent='✓ Uploaded';await load();const fresh=document.querySelector('form[data-upload="'+f.dataset.upload+'"] .upload-note');if(fresh){fresh.textContent='✓ Image placed.';fresh.style.color='#86efac'}document.getElementById('preview').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){if(note){note.textContent='✕ '+err.message;note.style.color='#fca5a5'}alert(err.message)}finally{busy(b,false)}});document.getElementById('suggestExternal').onclick=async function(){const b=this;busy(b,true,'Checking sources…');try{const d=await api('/api/network/admin/publications/'+pid+'/links/suggest-external',{method:'POST',body:'{}'});b.textContent='✓ Checked '+(d.sources||[]).length;await load()}catch(e){alert(e.message)}finally{busy(b,false)}};let draggedImageId=null,selectedImageId=null;const placedBox=document.getElementById('placedImages');function clearDragState(){document.querySelectorAll('.placed-image.dragging').forEach(c=>c.classList.remove('dragging'));document.querySelectorAll('.drag-handle.selected').forEach(c=>c.classList.remove('selected'));document.querySelectorAll('.cs-image-drop-zone.drag-over').forEach(z=>z.classList.remove('drag-over'));draggedImageId=null}placedBox.addEventListener('dragstart',e=>{const handle=e.target.closest('[data-drag-handle]');if(!handle)return;const card=handle.closest('[data-drag-image]');draggedImageId=String(handle.dataset.dragHandle||'');selectedImageId=draggedImageId;if(card)card.classList.add('dragging');handle.classList.add('selected');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedImageId);try{e.dataTransfer.setDragImage(card||handle,40,30)}catch(_e){}}});placedBox.addEventListener('dragend',()=>{clearDragState()});placedBox.addEventListener('click',e=>{const handle=e.target.closest('[data-drag-handle]');if(!handle)return;selectedImageId=String(handle.dataset.dragHandle||'');document.querySelectorAll('.drag-handle.selected').forEach(h=>h.classList.toggle('selected',h===handle));document.querySelectorAll('.cs-image-drop-zone').forEach(z=>z.classList.add('drag-over'))});const protectedPreview=document.getElementById('preview');protectedPreview.addEventListener('dragenter',e=>{if(!draggedImageId)return;const z=e.target.closest('.cs-image-drop-zone');if(z){e.preventDefault();z.classList.add('drag-over')}});protectedPreview.addEventListener('dragover',e=>{if(!draggedImageId)return;const z=e.target.closest('.cs-image-drop-zone');if(!z)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';document.querySelectorAll('.cs-image-drop-zone.drag-over').forEach(n=>{if(n!==z)n.classList.remove('drag-over')});z.classList.add('drag-over');const r=protectedPreview.getBoundingClientRect();if(e.clientY<r.top+70)protectedPreview.scrollTop-=18;else if(e.clientY>r.bottom-70)protectedPreview.scrollTop+=18});protectedPreview.addEventListener('dragleave',e=>{const z=e.target.closest('.cs-image-drop-zone');if(z&&!z.contains(e.relatedTarget))z.classList.remove('drag-over')});async function placeDraggedImage(z,id){if(!z||!id)return;const featured=z.dataset.dropKind==='featured',h2Number=featured?0:Number(z.dataset.dropH2||0);const original=z.textContent;z.textContent='Moving image…';try{await api('/api/network/admin/publications/'+pid+'/images/'+id+'/placement',{method:'PATCH',body:JSON.stringify({image_role:featured?'featured':'supporting',h2_number:h2Number})});selectedImageId=null;await load()}catch(err){alert(err.message);await load()}finally{draggedImageId=null;if(z&&z.isConnected)z.textContent=original||''}}protectedPreview.addEventListener('drop',async e=>{const z=e.target.closest('.cs-image-drop-zone');if(!z)return;e.preventDefault();const id=draggedImageId||(e.dataTransfer&&e.dataTransfer.getData('text/plain'))||selectedImageId;if(!id)return;await placeDraggedImage(z,id)});protectedPreview.addEventListener('click',async e=>{const z=e.target.closest('.cs-image-drop-zone');if(!z||!selectedImageId)return;e.preventDefault();await placeDraggedImage(z,selectedImageId)});['copy','cut','contextmenu','selectstart'].forEach(ev=>protectedPreview.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation()}));protectedPreview.addEventListener('keydown',e=>{const k=String(e.key||'').toLowerCase();if((e.ctrlKey||e.metaKey)&&['a','c','x','s','p'].includes(k)){e.preventDefault();e.stopPropagation()}});protectedPreview.addEventListener('mousedown',e=>{if(e.detail>1)e.preventDefault()});document.getElementById('copySeoHtml').onclick=async function(){const b=this;busy(b,true,'Preparing SEO HTML…');try{const d=await api('/api/network/admin/placements/${Number(placementId)}/seo-html');await navigator.clipboard.writeText(d.html||'');b.textContent='✓ SEO HTML copied';setTimeout(()=>{b.textContent='Copy SEO publication HTML'},1800)}catch(e){alert(e.message)}finally{b.disabled=false;b.classList.remove('busy')}};
 document.getElementById('copySnippet').onclick=async function(){const b=this;busy(b,true,'Preparing…');try{const d=await api('/api/network/admin/placements/'+pid+'/delivery');await navigator.clipboard.writeText(d.snippet);b.textContent='✓ Copied'}catch(e){alert(e.message);await load()}finally{busy(b,false)}};if(key)load()})();</script></main></body></html>`;
}

function placementsPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Placements | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.accepted{border-color:#4b78bc;color:#acd0ff}.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.cancelled,.status.rejected{border-color:#a23b49;color:#ff9ca8}.pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #4d6790;background:#111e34}.pill.protected{border-color:#b47d24;color:#ffd791;background:#2b1d08}.pill.monitored{border-color:#2b8f55;color:#8ff0b2;background:#0e2819}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Placements</div><h1>Placements & Protection</h1><div class="tiny">A placement starts only after hard interest on an approved website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>SEO publication rule</strong><br>Approved and Trusted publishers must publish the Publisher Edition as real indexable HTML on their own domain. ContentScale keeps required attribution/marker and ongoing live verification. A JavaScript-only embed cannot earn credits.</div></section>
<section class="card"><div class="top"><h2>Publisher commitments</h2><button id="refreshBtn" class="btn secondary">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Requirements</th><th>Accepted</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');btn.textContent=btn.dataset.old||btn.textContent}}
 function protection(x){return '<span class="pill monitored">SEO-indexable monitored HTML</span><div class="tiny">Real page-source HTML + attribution + live verification required.</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/placements');const a=d.placements||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No publisher commitments yet. Create an opportunity and record hard interest first.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+(x.prewrite_brief_id?' · Prewrite #'+esc(x.prewrite_brief_id):' · No Prewrite')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td>'+protection(x)+'</td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span><div class="tiny">credits '+esc(x.reward_credits||0)+' — not earned yet</div></td><td><div class="tiny">Brand mention: '+(x.brand_mention_required?'required':'no')+'<br>Source link: '+(x.source_link_required?'required':'no')+'<br>ContentScale marker: required by policy</div></td><td><div class="tiny">'+esc(x.accepted_at||'—')+'</div></td><td>'+(x.status==='accepted'?'<button class="btn bad" data-action="cancel" data-id="'+x.id+'">Cancel commitment</button>':'<span class="tiny">No action</span>')+'</td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
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
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Verification</div><h1>Publish, Verify & Credits</h1><div class="tiny">Credits are earned only after the live placement passes verification.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>Verification rule</strong><br>Submit the exact live article URL. ContentScale checks HTTP status, indexability, canonical, that the Publisher Edition exists as real HTML in the raw page source, and the required brand/source evidence. JavaScript-only delivery cannot pass. A successful verification awards the placement credits once only.</div></section>
<section class="card"><div class="top"><h2>Verification queue</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Status</th><th>Live URL</th><th>Latest verification</th><th>Credits</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');btn.textContent=btn.dataset.old||btn.textContent}}
 function checks(x){if(!x.latest_result)return '<span class="tiny">Not checked yet</span>';const d=x.latest_details||{};return '<span class="status '+esc(x.latest_result)+'">'+esc(x.latest_result)+'</span><div class="tiny">HTTP '+esc(x.latest_http_status||'—')+' · indexable '+(x.latest_indexable?'yes':'no')+'<br>static HTML '+(d.seo_static_html_present?'✓':'✕')+' · brand '+(x.latest_brand_mention_ok?'✓':'✕')+' · source '+(x.latest_source_link_ok?'✓':'✕')+'</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/verification-queue');const a=d.items||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No generated placements ready for verification yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.brand_name||'')+(x.prewrite_brief_id?' · Prewrite #'+esc(x.prewrite_brief_id):' · No Prewrite')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+'</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td><input class="url" data-url="'+x.id+'" placeholder="https://publisher.com/article" value="'+esc(x.published_url||'')+'"></td><td>'+checks(x)+'</td><td><strong>'+esc(x.reward_credits||0)+'</strong><div class="tiny">'+(x.credit_awarded?'awarded ✓':'not earned yet')+'</div></td><td><div class="actions"><button class="btn" data-action="submit" data-id="'+x.id+'">Save live URL</button><button class="btn good" data-action="verify" data-id="'+x.id+'" '+(!x.published_url?'disabled':'')+'>Verify live</button></div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
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
  // PREWRITE HANDOFF — read-only access to the existing core Prewrite Brief intelligence.
  // Network never alters/deletes prewrite_briefs.
  app.get('/api/network/admin/prewrite-briefs', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT id,client_id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at,status
      FROM prewrite_briefs ORDER BY created_at DESC,id DESC LIMIT 300`);
    res.json({success:true,briefs:r.rows,read_only:true,rule:'Existing Prewrite Brief intelligence is referenced by Network; core Prewrite records are never modified here.'});
  }));

  app.get('/api/network/locales', (req,res)=>res.json({success:true,locales:NETWORK_LOCALES.map(x=>({locale:x[0],language:x[1],market:x[2],direction:x[3]}))}));

  app.get('/api/network/admin/opportunities', verifyAdmin, wrap(async (req, res) => {
    const r = await pool.query(`SELECT c.id,c.owner_website_id,c.prewrite_brief_id,c.title,c.primary_niche,c.brand_name,c.publication_status,c.desired_placements,c.created_at,c.updated_at,
      COALESCE(c.source_snapshot->>'pitch','') AS pitch,
      COALESCE(c.source_snapshot->>'sub_niche','') AS sub_niche,
      COALESCE(c.source_snapshot->>'country','') AS country,
      COALESCE(c.source_snapshot->>'language','') AS language,
      COUNT(p.id)::int AS interest_count
      FROM network_content c
      LEFT JOIN network_placements p ON p.content_id=c.id AND p.status NOT IN ('cancelled','rejected')
      WHERE c.source_type IN ('original','prewrite_brief') AND COALESCE(c.source_snapshot->>'network_kind','')='distribution_opportunity'
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
    const prewriteBriefId=Number(req.body?.prewrite_brief_id)||null;
    let prewriteSummary=null;
    if(prewriteBriefId){const pr=await pool.query('SELECT id,keyword,working_title,language,region,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1',[prewriteBriefId]);if(!pr.rows[0])return res.status(400).json({success:false,error:'Selected Prewrite Brief not found'});prewriteSummary=pr.rows[0];}
    const locale=cleanText(req.body?.language,30)||cleanText(prewriteSummary&&prewriteSummary.language,30)||'en-US';
    const snap={network_kind:'distribution_opportunity',pitch,sub_niche:cleanText(req.body?.sub_niche,120),country:cleanText(req.body?.country,120),language:locale,direction:localeDirection(locale),full_article_generated:false,prewrite_summary:prewriteSummary,google_manual:{required:true,status:'not_checked',notes:cleanText(req.body?.google_manual_notes,1500)}};
    const r=await pool.query(`INSERT INTO network_content (owner_website_id,prewrite_brief_id,title,source_type,primary_niche,brand_name,source_snapshot,publication_status,distribution_status,desired_placements,verified_placements,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'available','offered',$8,0,NOW(),NOW()) RETURNING *`,[ownerWebsiteId,prewriteBriefId,title,prewriteBriefId?'prewrite_brief':'original',cleanText(req.body?.primary_niche,120)||null,cleanText(req.body?.brand_name,200)||null,JSON.stringify(snap),desired]);
    res.status(201).json({success:true,opportunity:r.rows[0],rule:'Only H1 + pitch stored. No Publisher Edition generated.'});
  }));

  app.post('/api/network/admin/opportunities/:id/interest', verifyAdmin, wrap(async (req, res) => {
    if(req.body?.hard_interest_confirmed!==true)return res.status(409).json({success:false,error:'Hard publication interest must be explicitly confirmed'});
    const contentId=Number(req.params.id),websiteId=Number(req.body?.publisher_website_id);
    if(!contentId||!websiteId)return res.status(400).json({success:false,error:'Opportunity and publisher website are required'});
    const cr=await pool.query(`SELECT * FROM network_content WHERE id=$1 AND source_type IN ('original','prewrite_brief') AND COALESCE(source_snapshot->>'network_kind','')='distribution_opportunity' LIMIT 1`,[contentId]);
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
      res.status(201).json({success:true,placement:pr.rows[0],eligible_for_publisher_edition:true,placement_count:afterCount,max_placements:max,opportunity_full:afterCount>=max,protection_mode:'seo_indexable_html',content_scale_marker_required:true,rule:'Website was approved before writing. No Publisher Edition generated by this endpoint. Final publication mode is SEO-indexable monitored HTML.'});
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
        AND source_type IN ('original','prewrite_brief')
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
    const items=r.rows.map(x=>Object.assign({},x,{protection_mode:'seo_indexable_html'}));
    res.json({success:true,items,rule:'No Publisher Edition exists before hard interest + approved website.'});
  }));

  app.post('/api/network/admin/placements/:id/generate', verifyAdmin, wrap(async (req, res) => {
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.*,c.title,c.brand_name,c.primary_niche,c.owner_website_id,c.prewrite_brief_id,c.source_snapshot,
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
      let prewriteIntel=null;
      if(x.prewrite_brief_id){const pr=await pool.query('SELECT id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1',[x.prewrite_brief_id]);if(pr.rows[0])prewriteIntel=pr.rows[0];}
      const prewriteText=prewriteIntel?JSON.stringify(prewriteIntel.brief_json||{}).slice(0,24000):'';
      const googleManual=safeJsonObject(snap.google_manual);
      const prompt=`Create ONE original, publication-grade Publisher Edition for an external website. Follow the ContentScale Publication Standard.

STRICT OUTPUT:
- Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.
- HTML must be real semantic HTML intended to be published directly in the publisher page source. It must NOT require JavaScript to reveal the article.
- Language: ${language}. Market/country context: ${country||'not specified'}.
- Publisher website: ${x.publisher_domain}. Publisher niche: ${x.primary_niche||''}${subNiche?' / '+subNiche:''}.
- Working H1/topic: ${x.title}.
- Short opportunity pitch: ${pitch}.
- Brand/entity to mention naturally: ${x.brand_name||x.owner_brand||''}.
- Required source/owner link: ${ownerUrl}. Include that exact link naturally once where useful.

CONTENTSCALE WRITING STYLE:
- Direct answer first. Short, decisive paragraphs. No generic AI introduction and no filler conclusion.
- Explain practical consequences, use concrete examples, and use Key Point / Common Mistake callouts only when useful.
- Prefer question-led or intent-led H2s where natural. Do not repeat the same point under different headings.
- Never invent claims to make the article sound authoritative.

REQUIRED ARTICLE STRUCTURE:
- One H1.
- Immediately after the H1, a 40-60 word direct answer inside <div class="cs-direct-answer">.
- A concise TL;DR / Key Takeaways block inside <div class="cs-tldr">.
- A real linked table of contents inside <nav class="cs-toc"> using anchor links to the H2 ids.
- At least 3 useful H2 sections with stable id attributes.
- At least ONE meaningful mobile-friendly table wrapped exactly as <div class="cs-table-wrap"><table class="cs-table">...</table></div>. Prefer a statistics table when verified statistics exist. If no verified statistics exist, use a factual comparison/decision table without inventing numbers.
- If an FAQ is genuinely useful and supported, use <section class="cs-faq"> with each question as H3 followed immediately by its answer in one P. Do not create FAQ filler.

EVIDENCE RULES:
- Do NOT invent years in business, certifications, prices, ratings, guarantees, locations, service claims, statistics, customer counts, case studies, expert quotes or research findings.
- Statistics may appear only when the supplied Prewrite/source evidence contains the statistic and its real source URL.
- Expert quotes may appear only when supplied with real attribution/source evidence.
- Case studies may appear only when supplied as real case evidence. Otherwise omit them.
- Internal links: only use exact internal URLs supplied by Prewrite/source material. Never invent an internal URL.
- External links: only use exact external URLs supplied by Prewrite/source evidence. Never invent an external URL.
- If evidence is missing, write the useful section without the unsupported claim instead of guessing.

SEO / TECHNICAL:
- Aim for useful depth, roughly 1000-1600 words when the topic supports it.
- Allowed HTML includes article, section, nav, div, h1, h2, h3, p, ul, ol, li, strong, em, blockquote, cite, a, table, thead, tbody, tr, th, td. No script/style/iframe/form/input/button.
- schema_json must be a valid Article JSON object, not a script tag. FAQ schema is generated from a real cs-faq section by ContentScale.
- meta_title max 60 characters; meta_description max 160 characters.
- Do not add a ContentScale credit yourself; the publication layer adds the controlled attribution.
- Do not promise rankings, AI citations or outcomes.

PREWRITE INTELLIGENCE (READ-ONLY; use only facts/URLs actually present):
${prewriteText||'No linked Prewrite Brief. Do not invent research, statistics, quotes or URLs.'}

MANUAL GOOGLE NOTES:
${JSON.stringify(googleManual||{}).slice(0,4000)}`;
      const ai=await callNetworkGemini(prompt),d=ai.parsed||{};
      const title=cleanText(d.title||x.title,300);
      const html=ensureContentScaleAttribution(d.html||'',id);
      const plain=cleanText(d.plain_text||htmlText(html),50000);
      if(!title||htmlText(html).split(/\s+/).filter(Boolean).length<250)throw new Error('Generated edition failed minimum content quality check');
      const metaTitle=cleanText(d.meta_title||title,60),metaDescription=cleanText(d.meta_description||'',160),slug=slugifyNetwork(d.suggested_slug||title);
      const schema=(d.schema_json&&typeof d.schema_json==='object')?d.schema_json:{};
      const token=crypto.randomBytes(32).toString('hex');
      const defaultAuthorName=cleanText(x.owner_brand||x.brand_name||'',200);
      const generationSnapshot={network_kind:'publisher_edition',delivery_token:token,protection_mode:'seo_indexable_html',content_scale_marker_required:true,source_link:ownerUrl,publisher_domain:x.publisher_domain,language,country,generated_by_admin_id:req.admin&&req.admin.id||null,prewrite_brief_id:x.prewrite_brief_id||null,prewrite_used:!!prewriteIntel,google_manual_only:true,publication_settings:{primary_color:'#111827',accent_color:'#2563eb',author_type:'company',author_name:defaultAuthorName,author_url:ownerUrl,author_bio:'',author_job_title:'',image_mode:'prompt_only'}};
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const vr=await client.query(`INSERT INTO network_publication_versions (placement_id,content_id,publisher_website_id,version_no,title,html,plain_text,meta_title,meta_description,suggested_slug,schema_json,generation_input_snapshot,generation_model,quality_status,generated_at,created_at,updated_at)
          VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'needs_review',NOW(),NOW(),NOW())
          ON CONFLICT (placement_id) DO UPDATE SET title=EXCLUDED.title,html=EXCLUDED.html,plain_text=EXCLUDED.plain_text,meta_title=EXCLUDED.meta_title,meta_description=EXCLUDED.meta_description,suggested_slug=EXCLUDED.suggested_slug,schema_json=EXCLUDED.schema_json,generation_input_snapshot=EXCLUDED.generation_input_snapshot,generation_model=EXCLUDED.generation_model,quality_status='needs_review',generated_at=NOW(),updated_at=NOW()
          RETURNING id,title,meta_title,meta_description,suggested_slug,quality_status,generated_at`,[id,x.content_id,x.publisher_website_id,title,html,plain,metaTitle,metaDescription,slug,JSON.stringify(schema),JSON.stringify(generationSnapshot),ai.model]);
        await client.query(`UPDATE network_placements SET status='ready',updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_content SET source_snapshot=jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{full_article_generated}','true'::jsonb,true),distribution_status='edition_ready',updated_at=NOW() WHERE id=$1`,[x.content_id]);
        await client.query('COMMIT');
        res.json({success:true,placement_id:id,status:'ready',publication_version:vr.rows[0],protection_mode:generationSnapshot.protection_mode,seo_html_available:true,rule:'Publisher Edition created for SEO-indexable HTML publication. Final placements must expose the article in the publisher page source; JavaScript-only delivery does not qualify.'});
      }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
    }catch(e){
      await pool.query(`UPDATE network_placements SET status='accepted',updated_at=NOW() WHERE id=$1 AND status='generating'`,[id]).catch(()=>{});
      throw e;
    }
  }));

  // PUBLICATION PACKAGE — author, style, image prompts/uploads, schema and ContentScore.
  app.get('/api/network/admin/publications/:placementId/package', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT p.id AS placement_id,p.status,p.source_link_required,p.brand_mention_required,
      c.brand_name,c.title AS opportunity_title,c.primary_niche,c.source_snapshot,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      ow.domain AS source_domain,ow.brand_name AS source_brand,
      pv.* FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const images=ir.rows;
    const quality=scorePublication(row,images);
    const settings=getPublicationSettings(row.generation_input_snapshot,{author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''});
    await pool.query(`UPDATE network_publication_versions SET quality_status=$2,updated_at=NOW() WHERE id=$1`,[row.id,quality.status]).catch(()=>{});
    const renderedPackage=renderEditionHtml(row,images);
    let prewriteBrief=null;
    const prewriteId=Number(row.generation_input_snapshot&&row.generation_input_snapshot.prewrite_brief_id||0);
    if(prewriteId){const pr=await pool.query('SELECT id,keyword,working_title,language,region,brief_json,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1',[prewriteId]);prewriteBrief=pr.rows[0]||null;}
    const headings=extractH2Headings(row.html);
    const linkIntel=linkIntelligenceFromSources(row,prewriteBrief);
    const savedIntel=(row.generation_input_snapshot&&row.generation_input_snapshot.link_intelligence)||{};
    const publicationStandard=publicationStandardChecks(row.html);
    res.json({success:true,publication:{placement_id:id,publication_version_id:row.id,title:row.title,html:row.html,rendered_html:renderedPackage.html,plain_text:row.plain_text,meta_title:row.meta_title,meta_description:row.meta_description,suggested_slug:row.suggested_slug,schema_json:renderedPackage.schema,publisher_domain:row.publisher_domain,publisher_brand:row.publisher_brand,source_domain:row.source_domain,source_brand:row.source_brand,brand_name:row.brand_name,status:row.status,quality_status:quality.status},settings,images,quality,publication_standard:publicationStandard,h2_headings:headings,link_intelligence:{prewrite_internal:linkIntel.internal,prewrite_external:linkIntel.external,prewrite_used:linkIntel.prewrite_used,external_candidates:Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:[]},quality_gate:{minimum_score:80,delivery_ready:quality.score>=80&&publicationStandard.passed},rule:'Final Network publication must be SEO-indexable HTML present in the publisher page source. JavaScript-only embeds are preview/legacy only and cannot pass final verification.'});
  }));

  app.patch('/api/network/admin/publications/:placementId/settings', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,c.brand_name,ow.domain AS source_domain,ow.brand_name AS source_brand FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const current=x.generation_input_snapshot&&typeof x.generation_input_snapshot==='object'?x.generation_input_snapshot:{};
    const old=getPublicationSettings(current,{author_name:x.source_brand||x.brand_name||'',author_url:x.source_domain?`https://${x.source_domain}`:''});
    const incoming=req.body||{};
    const settings={
      primary_color:safeHexColor(incoming.primary_color,old.primary_color),accent_color:safeHexColor(incoming.accent_color,old.accent_color),
      author_type:['company','person','publisher'].includes(incoming.author_type)?incoming.author_type:old.author_type,
      author_name:cleanText(incoming.author_name!=null?incoming.author_name:old.author_name,200),author_url:cleanText(incoming.author_url!=null?incoming.author_url:old.author_url,1000),
      author_bio:cleanText(incoming.author_bio!=null?incoming.author_bio:old.author_bio,1000),author_job_title:cleanText(incoming.author_job_title!=null?incoming.author_job_title:old.author_job_title,160),
      image_mode:['off','prompt_only','auto_generate'].includes(incoming.image_mode)?incoming.image_mode:old.image_mode
    };
    const next=Object.assign({},current,{publication_settings:settings});
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[x.id,JSON.stringify(next)]);
    res.json({success:true,settings});
  }));

  app.get('/api/network/admin/images/library/lookup', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const raw=cleanText(req.query?.name||'',255),key=normalizeImageKey(raw);if(!key)return res.json({success:true,found:false});
    let r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 OR LOWER(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'))=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    let source='library';
    if(!r.rows[0]){
      const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
      const h=hist.rows[0];
      if(h){
        await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||raw,220),cleanText(h.suggested_filename||raw,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
        r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
        source='publication_history';
      }
    }
    res.json({success:true,found:!!r.rows[0],image:r.rows[0]||null,source});
  }));

  app.post('/api/network/admin/publications/:placementId/images/resolve-existing-metadata', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});
    const rawName=cleanText(req.body?.name||req.body?.original_filename||'',255),key=normalizeImageKey(rawName);if(!key)return res.status(400).json({success:false,error:'Image name is required'});
    let r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 OR LOWER(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'))=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    if(r.rows[0]&&cleanText(r.rows[0].alt_text||'',500)&&cleanText(r.rows[0].caption||'',700))return res.json({success:true,reused:true,source:'library',image:r.rows[0]});
    const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
    const h=hist.rows[0];
    if(h){
      await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||rawName,220),cleanText(h.suggested_filename||rawName,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
      r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
      return res.json({success:true,reused:true,source:'publication_history',image:r.rows[0]});
    }
    const pr=await pool.query(`SELECT pv.title,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[placementId]);
    const x=pr.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const displayName=cleanText(String(rawName).replace(/\.(jpe?g|png|webp)$/i,'').replace(/[-_]+/g,' '),220)||key.replace(/-/g,' '),lang=cleanText(x.source_snapshot?.language||'en-US',30),country=cleanText(x.source_snapshot?.country||'',120);
    const originalExt=(String(req.body?.original_filename||'').match(/\.(jpe?g|png|webp)$/i)||['.jpg'])[0].toLowerCase();
    const prompt=`Create SEO metadata for an EXISTING editorial image using only its filename/subject and article context. Return JSON only with keys alt_text, caption, suggested_filename. Image filename/subject: ${displayName}. Article: ${x.title}. Brand: ${x.brand_name||''}. Niche: ${x.primary_niche||''}. Publisher: ${x.publisher_domain}. Language: ${lang}. Market: ${country||'not specified'}. Be conservative: do not invent people, numbers, locations, weather conditions, damage severity, colors or objects that are not implied by the filename/subject. Alt text must be concise and describe the likely visible subject naturally, without keyword stuffing. Caption should add useful context without making unsupported claims. Suggested filename must be lowercase, hyphenated and keep extension ${originalExt}.`;
    let d={};let model='fallback';try{const ai=await callNetworkGemini(prompt);d=ai.parsed||{};model=ai.model||model}catch(_e){}
    const human=displayName.replace(/\b\w/g,m=>m.toUpperCase());
    const alt=cleanText(d.alt_text||displayName,500);
    const caption=cleanText(d.caption||human,700);
    let filename=cleanText(d.suggested_filename||slugifyNetwork(displayName)+originalExt,220);if(!/\.(jpe?g|png|webp)$/i.test(filename))filename+=originalExt;
    await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(public.network_image_library.prompt,'')<>'' THEN public.network_image_library.prompt ELSE EXCLUDED.prompt END,updated_at=NOW()`,[key,displayName,filename,alt,caption,'']);
    r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
    res.json({success:true,reused:false,source:'generated_from_filename',model,image:r.rows[0]});
  }));

  app.post('/api/network/admin/publications/:placementId/images/existing-upload', verifyAdmin, networkImageUpload.single('image'), wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});if(!req.file)return res.status(400).json({success:false,error:'Choose an image file'});
    const mime=String(req.file.mimetype||'').toLowerCase();if(!['image/jpeg','image/png','image/webp'].includes(mime))return res.status(415).json({success:false,error:'Only JPG, PNG or WebP images are supported'});
    const pr=await pool.query(`SELECT pv.id AS publication_version_id FROM network_publication_versions pv WHERE pv.placement_id=$1 LIMIT 1`,[placementId]);const pv=pr.rows[0];if(!pv)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const suppliedName=cleanText(req.body?.image_name,220),original=cleanText(req.file.originalname,255),key=normalizeImageKey(suppliedName||original);if(!key)return res.status(400).json({success:false,error:'Image name is required'});
    let lib=await pool.query(`SELECT image_name,suggested_filename,alt_text,caption,prompt FROM public.network_image_library WHERE normalized_key=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    if(!lib.rows[0]){
      const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
      const h=hist.rows[0];
      if(h){
        await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||suppliedName||original,220),cleanText(h.suggested_filename||original,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
        lib=await pool.query(`SELECT image_name,suggested_filename,alt_text,caption,prompt FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
      }
    }
    const remembered=lib.rows[0]||null;
    const imageName=suppliedName||cleanText(remembered?.image_name||key,220),alt=cleanText(req.body?.alt_text||remembered?.alt_text||'',500),caption=cleanText(req.body?.caption||remembered?.caption||'',700),filename=cleanText(req.body?.suggested_filename||remembered?.suggested_filename||original||key+'.jpg',220);
    if(!alt||!caption||!filename)return res.status(400).json({success:false,error:'Alt text, caption and SEO filename are required for an existing image'});
    const role=req.body?.image_role==='featured'?'featured':'supporting',h2Number=Math.max(0,Number(req.body?.h2_number)||0),hint=role==='featured'?'Before article':(h2Number?'before-h2-num:'+h2Number:'');if(role==='supporting'&&!hint)return res.status(400).json({success:false,error:'Choose an H2 number for a supporting image'});
    if(role==='featured')await pool.query(`UPDATE network_publication_images SET image_role='supporting',updated_at=NOW() WHERE placement_id=$1 AND image_role='featured'`,[placementId]);
    const orderR=await pool.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM network_publication_images WHERE publication_version_id=$1',[pv.publication_version_id]);
    const ir=await pool.query(`INSERT INTO network_publication_images (publication_version_id,placement_id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,image_data,byte_size,status,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'uploaded',$14,NOW(),NOW()) RETURNING id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,updated_at`,[pv.publication_version_id,placementId,role,imageName,cleanText(remembered?.prompt||'',3000),alt,caption,filename,hint,mime,original,req.file.buffer,req.file.size,Number(orderR.rows[0]?.n||0)]);
    const img=ir.rows[0];await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN EXCLUDED.prompt<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,imageName,filename,alt,caption,cleanText(remembered?.prompt||'',3000),img.id]);
    res.status(201).json({success:true,image:img,reused_metadata:!!remembered,library_key:key});
  }));

  app.post('/api/network/admin/publications/:placementId/images/prepare', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const id=Number(req.params.placementId),name=cleanText(req.body?.image_name,220),role=req.body?.image_role==='featured'?'featured':'supporting',h2Target=firstThreeWords(req.body?.h2_target||''),h2Number=Math.max(0,Number(req.body?.h2_number)||0);
    if(!id||!name)return res.status(400).json({success:false,error:'Placement and image name are required'});
    const r=await pool.query(`SELECT pv.id AS publication_version_id,pv.title,pv.meta_description,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const lang=cleanText(x.source_snapshot?.language||'en-US',30),country=cleanText(x.source_snapshot?.country||'',120);
    const prompt=`Create metadata for ONE editorial article image. Return JSON only with keys prompt, alt_text, caption, suggested_filename, placement_hint. Image name/topic: ${name}. Role: ${role}. Article: ${x.title}. Brand: ${x.brand_name||''}. Niche: ${x.primary_niche||''}. Publisher: ${x.publisher_domain}. Language: ${lang}. Market: ${country||'not specified'}. The image prompt must be practical, realistic, publication-grade, avoid text/logos/watermarks, and must not invent factual claims. Alt text should describe what is visible, not keyword-stuff. Filename must be lowercase hyphenated with a suitable image extension suggestion. Placement hint must be concise. If H2 target is supplied, preserve it exactly as the first words of the intended H2. H2 target: ${h2Target||'none'}.`;
    const ai=await callNetworkGemini(prompt),d=ai.parsed||{};
    const forcedPlacement=role==='featured'?'Before article':(h2Number?'before-h2-num:'+h2Number:(h2Target?'before-h2:'+h2Target:''));if(role==='supporting'&&!forcedPlacement)return res.status(400).json({success:false,error:'Choose the H2 number for a supporting image.'});const meta={prompt:cleanText(d.prompt,3000),alt_text:cleanText(d.alt_text,500),caption:cleanText(d.caption,700),suggested_filename:cleanText(d.suggested_filename||slugifyNetwork(name)+'.jpg',220),placement_hint:forcedPlacement};
    let ir;
    if(role==='featured'){
      const existing=await pool.query(`SELECT id FROM network_publication_images WHERE publication_version_id=$1 AND image_role='featured' ORDER BY id LIMIT 1`,[x.publication_version_id]);
      if(existing.rows[0]){
        ir=await pool.query(`UPDATE network_publication_images SET image_name=$3,prompt=$4,alt_text=$5,caption=$6,suggested_filename=$7,placement_hint=$8,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order`,[existing.rows[0].id,id,name,meta.prompt,meta.alt_text,meta.caption,meta.suggested_filename,meta.placement_hint]);
      }
    }
    if(!ir){
      const orderR=await pool.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM network_publication_images WHERE publication_version_id=$1',[x.publication_version_id]);
      ir=await pool.query(`INSERT INTO network_publication_images (publication_version_id,placement_id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'prompt_ready',$10,NOW(),NOW()) RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order`,[x.publication_version_id,id,role,name,meta.prompt,meta.alt_text,meta.caption,meta.suggested_filename,meta.placement_hint,Number(orderR.rows[0]?.n||0)]);
    }
    const saved=ir.rows[0],libKey=normalizeImageKey(saved.suggested_filename||saved.image_name);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=EXCLUDED.prompt,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.prompt,saved.id]);
    res.status(201).json({success:true,image:saved,model:ai.model,reused_featured:role==='featured'});
  }));

  app.patch('/api/network/admin/publications/:placementId/images/:imageId/metadata', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId),name=cleanText(req.body?.image_name,220);
    if(!placementId||!imageId||!name)return res.status(400).json({success:false,error:'Placement, image and image name are required'});
    const r=await pool.query(`SELECT i.id,i.image_role,i.placement_hint,pv.title,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain FROM network_publication_images i JOIN network_publication_versions pv ON pv.id=i.publication_version_id JOIN network_placements p ON p.id=i.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE i.id=$1 AND i.placement_id=$2 LIMIT 1`,[imageId,placementId]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Image slot not found'});
    const lang=cleanText(x.source_snapshot?.language||'en-US',30),country=cleanText(x.source_snapshot?.country||'',120);
    const prompt=`Create metadata for ONE editorial article image. Return JSON only with keys prompt, alt_text, caption, suggested_filename. Image name/topic: ${name}. Role: ${x.image_role}. Article: ${x.title}. Brand: ${x.brand_name||''}. Niche: ${x.primary_niche||''}. Publisher: ${x.publisher_domain}. Language: ${lang}. Market: ${country||'not specified'}. The prompt must describe the named image subject, be realistic and publication-grade, avoid text/logos/watermarks, and not invent factual claims. Alt text must describe what is visible and match the named image subject. Caption must match the actual subject. Filename must be lowercase hyphenated with a suitable extension.`;
    const ai=await callNetworkGemini(prompt),d=ai.parsed||{};
    const u=await pool.query(`UPDATE network_publication_images SET image_name=$3,prompt=$4,alt_text=$5,caption=$6,suggested_filename=$7,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,updated_at`,[imageId,placementId,name,cleanText(d.prompt,3000),cleanText(d.alt_text,500),cleanText(d.caption,700),cleanText(d.suggested_filename||slugifyNetwork(name)+'.jpg',220)]);
    const saved=u.rows[0],libKey=normalizeImageKey(saved.suggested_filename||saved.image_name);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=EXCLUDED.prompt,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.prompt,saved.id]);
    res.json({success:true,image:saved,model:ai.model,note:'Image file and placement were preserved; metadata only was regenerated and remembered.'});
  }));

  app.post('/api/network/admin/publications/:placementId/images/:imageId/upload', verifyAdmin, networkImageUpload.single('image'), wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    if(!req.file)return res.status(400).json({success:false,error:'Choose an image file'});
    const mime=String(req.file.mimetype||'').toLowerCase();if(!['image/jpeg','image/png','image/webp'].includes(mime))return res.status(415).json({success:false,error:'Only JPG, PNG or WebP images are supported'});
    const r=await pool.query(`UPDATE network_publication_images SET mime_type=$3,original_filename=$4,image_data=$5,byte_size=$6,status='uploaded',updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status`,[imageId,placementId,mime,cleanText(req.file.originalname,255),req.file.buffer,req.file.size]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Image slot not found'});const saved=r.rows[0],libKey=normalizeImageKey(saved.suggested_filename||saved.image_name||req.file.originalname);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.id]);res.json({success:true,image:saved,library_key:libKey});
  }));

  app.patch('/api/network/admin/publications/:placementId/images/:imageId/placement', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    const role=req.body?.image_role==='featured'?'featured':'supporting';const h2=firstThreeWords(req.body?.h2_target||'');const h2Number=Math.max(0,Number(req.body?.h2_number)||0);
    const hint=role==='featured'?'Before article':(h2Number?'before-h2-num:'+h2Number:(h2?'before-h2:'+h2:''));
    if(role==='supporting'&&!hint)return res.status(400).json({success:false,error:'Choose an H2 number or H2 title for a supporting image. The system will not silently place it at the end.'});
    if(role==='featured')await pool.query(`UPDATE network_publication_images SET image_role='supporting',updated_at=NOW() WHERE placement_id=$1 AND image_role='featured' AND id<>$2`,[placementId,imageId]);
    const r=await pool.query(`UPDATE network_publication_images SET image_role=$3,placement_hint=$4,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,placement_hint,status`,[imageId,placementId,role,hint]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Image not found'});res.json({success:true,image:r.rows[0]});
  }));

  app.delete('/api/network/admin/publications/:placementId/images/:imageId', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    const before=await pool.query(`SELECT id,image_name,suggested_filename,alt_text,caption FROM network_publication_images WHERE id=$1 AND placement_id=$2 LIMIT 1`,[imageId,placementId]);
    const img=before.rows[0];if(!img)return res.status(404).json({success:false,error:'Image not found'});
    const libKey=normalizeImageKey(img.suggested_filename||img.image_name||'');
    if(libKey){await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NULL,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,updated_at=NOW()`,[libKey,img.image_name,img.suggested_filename,img.alt_text,img.caption]);}
    const r=await pool.query('DELETE FROM network_publication_images WHERE id=$1 AND placement_id=$2 RETURNING id',[imageId,placementId]);
    res.json({success:true,deleted_id:r.rows[0].id,removed_from_article:true,metadata_preserved:true,library_key:libKey||null});
  }));


  app.post('/api/network/admin/publications/:placementId/links/suggest-external', verifyAdmin, wrap(async (req,res)=>{
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.title,pv.html,pv.generation_input_snapshot,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain,ow.domain AS source_domain
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[placementId]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const prompt=`Suggest up to 3 authoritative external source URLs that could support factual claims in this article. Return JSON only: {"sources":[{"url":"https://...","reason":"short reason"}]}. Do not suggest the publisher domain or source company domain. Prefer primary sources, government, universities, recognized standards bodies or highly authoritative industry organizations. Do not invent URLs; however every URL will still be live-verified by ContentScale before it can be treated as usable. Article title: ${x.title}. Niche: ${x.primary_niche||''}. Brand: ${x.brand_name||''}. Article text: ${htmlText(x.html).slice(0,9000)}`;
    const ai=await callNetworkGemini(prompt),list=Array.isArray(ai.parsed&&ai.parsed.sources)?ai.parsed.sources.slice(0,3):[];
    const blocked=new Set([normalizeHost(x.publisher_domain),normalizeHost(x.source_domain)].filter(Boolean));const checked=[];
    for(const item of list){
      const url=cleanText(item&&item.url,1600),reason=cleanText(item&&item.reason,500);let status='invalid',http_status=null,final_url=url,title='';
      try{const u=new URL(url);const host=normalizeHost(url);if(blocked.has(host)||Array.from(blocked).some(b=>host.endsWith('.'+b)))throw new Error('internal/source domain');await assertPublicHostname(u.hostname);const f=await safeFetchHtml(url);http_status=f.response.status;final_url=f.finalUrl||url;status=(http_status>=200&&http_status<400)?'verified':'failed';const tm=String(f.html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);title=tm?htmlText(tm[1]).slice(0,220):'';}catch(e){status='failed';}
      checked.push({url,final_url,reason,title,http_status,status});
    }
    const current=x.generation_input_snapshot&&typeof x.generation_input_snapshot==='object'?x.generation_input_snapshot:{};const next=Object.assign({},current,{link_intelligence:Object.assign({},current.link_intelligence||{},{external_candidates:checked,checked_at:new Date().toISOString()})});
    await pool.query('UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1',[x.id,JSON.stringify(next)]);
    res.json({success:true,sources:checked,model:ai.model,rule:'AI suggestions are never trusted by themselves. Only URLs with status=verified passed a live ContentScale check; nothing is inserted automatically.'});
  }));

  app.get('/network/media/:id', wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(404).end();
    const r=await pool.query(`SELECT mime_type,image_data,suggested_filename,status FROM network_publication_images WHERE id=$1 LIMIT 1`,[id]);const x=r.rows[0];if(!x||!x.image_data||!['uploaded','approved'].includes(x.status))return res.status(404).end();
    res.set('Cache-Control','public, max-age=86400');res.set('X-Content-Type-Options','nosniff');res.type(x.mime_type||'application/octet-stream');res.send(x.image_data);
  }));

  app.get('/api/network/admin/placements/:id/seo-html', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.id AS placement_id,p.status,p.source_link_required,p.brand_mention_required,c.brand_name,c.primary_niche,c.source_snapshot,w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.* FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const row=q.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const quality=scorePublication(row,ir.rows),standard=publicationStandardChecks(row.html);
    if(quality.score<80)return res.status(409).json({success:false,error:'ContentScore must be at least 80 before SEO publication HTML is released',quality});
    if(!standard.passed)return res.status(409).json({success:false,error:'Publication Standard is not complete yet. Direct Answer, TL;DR, linked Table of Contents, at least 3 H2s and one mobile-friendly table are required.',publication_standard:standard});
    const html=buildSeoPublicationHtml(row,ir.rows);
    res.json({success:true,placement_id:id,delivery_mode:'seo_indexable_html',html,publication_standard:standard,rule:'Paste/publish this as real server-rendered/static HTML on the committed publisher domain. Do not replace it with a JavaScript-only embed. Final live verification checks raw page source for the article.'});
  }));

  app.get('/api/network/admin/placements/:id/delivery', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT p.status,p.source_link_required,w.status AS publisher_status,w.domain AS publisher_domain,w.brand_name AS publisher_brand,c.brand_name,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*
      FROM network_placements p JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_content c ON c.id=p.content_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Generated Publisher Edition not found'});
    if(!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'This placement is not available for delivery'});
    const ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,byte_size,status,sort_order,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const quality=scorePublication(x,ir.rows);
    if(quality.score<80)return res.status(409).json({success:false,error:'Quality Gate not passed yet. Complete the publication package before copying the delivery snippet.',content_score:quality.score,minimum_score:80});
    const token=x.generation_input_snapshot&&x.generation_input_snapshot.delivery_token;if(!token)return res.status(409).json({success:false,error:'Legacy preview token missing'});
    res.json({success:true,placement_id:id,status:x.status,content_score:quality.score,protection_mode:'seo_indexable_html',snippet:protectedSnippet('https://app.contentscale.site',id,token),publication:{title:x.title,meta_title:x.meta_title,meta_description:x.meta_description,suggested_slug:x.suggested_slug,generated_at:x.generated_at},rule:'Legacy preview snippet only. It does NOT qualify as a final SEO Network placement because JavaScript-only delivery is not accepted for indexable publication.'});
  }));

  // Public controlled content endpoint. Removing the snippet removes the content; revoked placements stop serving it.
  app.get('/network/embed/:token.js', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).type('text/javascript').send('/* ContentScale Network disabled */');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).type('text/javascript').send('/* Invalid placement */');
    const r=await pool.query(`SELECT p.id AS placement_id,p.status,p.source_link_required,c.brand_name,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      WHERE pv.generation_input_snapshot->>'delivery_token'=$1 LIMIT 1`,[token]);
    const x=r.rows[0];
    if(!x||!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(410).type('text/javascript').send('/* ContentScale placement unavailable */');
    const ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,byte_size,status,sort_order,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const quality=scorePublication(x,ir.rows);if(quality.score<80)return res.status(409).type('text/javascript').send(`/* ContentScale Quality Gate ${quality.score}/100 — placement not released */`);
    const rendered=renderEditionHtml(x,ir.rows);
    res.set('Cache-Control','no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');
    const payload=JSON.stringify(String(rendered.html||'')),schemaPayload=JSON.stringify(JSON.stringify(rendered.schema||{}));
    const js=`(()=>{const s=document.currentScript;if(!s)return;let c=s.previousElementSibling;if(!c||!c.classList||!c.classList.contains('contentscale-network-placement')){c=document.createElement('div');c.className='contentscale-network-placement';s.parentNode.insertBefore(c,s)}c.setAttribute('data-cs-placement','${Number(x.placement_id)}');c.setAttribute('data-cs-score','${Number(quality.score)}');c.innerHTML=${payload};const sid='cs-schema-${Number(x.placement_id)}';if(!document.getElementById(sid)){const j=document.createElement('script');j.type='application/ld+json';j.id=sid;j.text=${schemaPayload};document.head.appendChild(j)}})();`;
    res.type('text/javascript').send(js);
  }));

  app.get('/network/publishing/:placementId', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(publishingDetailPage(req.params.placementId));
  });

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
    const placements=r.rows.map(x=>Object.assign({},x,{protection_mode:'seo_indexable_html',content_scale_marker_required:true,credits_earned:x.status==='verified'}));
    res.json({success:true,placements,policy:{approved:'seo_indexable_html',trusted:'seo_indexable_html',javascript_only_final_delivery:false,continuous_verification_required:true}});
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
    const legacyJsEmbed=!!token && (html.includes(token)||html.includes('/network/embed/'+token+'.js'));
    const editionHtml=String(x.edition_html||'');
    const liveText=htmlText(html).toLowerCase();
    const brand=cleanText(x.brand_name,250).toLowerCase();
    const owner=cleanText(x.owner_domain,300).toLowerCase();
    const brandOk=!x.brand_mention_required||!brand||liveText.includes(brand);
    const sourceOk=!x.source_link_required||(!owner?false:html.toLowerCase().includes(owner));
    const staticMarker=html.includes(`data-contentscale-placement="${id}"`)||html.includes(`data-contentscale-placement='${id}'`)||html.includes(`ContentScale Network indexable placement ${id}`);
    const contentMatch=publicationTextMatch(editionHtml,html);
    const statusCode=fetched&&fetched.response?fetched.response.status:null;
    const httpOk=Number(statusCode)>=200&&Number(statusCode)<400;
    const noindex=/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)||/<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
    const passwordProtected=Number(statusCode)===401||Number(statusCode)===403||/password protected|enter password|member login/i.test(htmlText(html).slice(0,3000));
    const canonicalTag=(html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)||[])[0]||'';
    const canonical=extractAttr(canonicalTag,'href');
    let canonicalOk=true;if(canonical){try{const cu=new URL(canonical,x.published_url),lu=new URL(x.published_url);canonicalOk=cu.hostname.replace(/^www\./,'').toLowerCase()===lu.hostname.replace(/^www\./,'').toLowerCase()}catch(e){canonicalOk=false}}
    const indexable=httpOk&&!noindex&&!passwordProtected;
    const staticHtmlPresent=staticMarker&&contentMatch.matched;
    const jsOnlyDelivery=legacyJsEmbed&&!staticHtmlPresent;
    const passed=httpOk&&indexable&&canonicalOk&&staticHtmlPresent&&brandOk&&sourceOk&&!jsOnlyDelivery;
    const result=passed?'passed':'needs_review';
    const rn=await pool.query('SELECT COALESCE(MAX(run_no),0)+1 AS n FROM network_verification_runs WHERE placement_id=$1',[id]);
    const runNo=Number(rn.rows[0].n)||1;
    const details={seo_static_html_present:staticHtmlPresent,content_text_match:contentMatch,legacy_js_embed_present:legacyJsEmbed,js_only_delivery:jsOnlyDelivery,final_url:fetched&&fetched.finalUrl||x.published_url,canonical:canonical||null,noindex,password_protected:passwordProtected,fetch_error:fetchError||null,required_brand:brand||null,required_source_domain:owner||null};
    await pool.query(`INSERT INTO network_verification_runs (placement_id,run_no,http_status,indexable,canonical_ok,brand_mention_ok,source_link_ok,content_match_ok,password_protected,result_status,details,checked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW())`,[id,runNo,statusCode,indexable,canonicalOk,brandOk,sourceOk,staticHtmlPresent,passwordProtected,result,JSON.stringify(details)]);
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
    res.json({success:true,verified:passed,result_status:result,credit_awarded:creditAwarded,credits:x.reward_credits,checks:{http_ok:httpOk,indexable,canonical_ok:canonicalOk,seo_static_html_present:staticHtmlPresent,content_match_ok:contentMatch.matched,legacy_js_embed_present:legacyJsEmbed,js_only_delivery:jsOnlyDelivery,brand_mention_ok:brandOk,source_link_ok:sourceOk,password_protected:passwordProtected},details,rule:passed?'Verified SEO placement: the article is present as indexable page-source HTML; credits may be released once only.':'No credits released. Final placement must contain the Publisher Edition as real indexable HTML; a JavaScript-only embed does not qualify.'});
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

  // REFERRALS — publishers/members + independent referral partners (scouts).
  // A click earns nothing. A scout reward is tied to the publisher application and only becomes rewardable after genuine activation.
  app.get('/api/network/admin/referrals', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const codes=await pool.query(`SELECT rc.id,rc.code,rc.label,rc.is_active,rc.created_at,rc.website_id,rc.partner_id,
      w.domain,w.brand_name,p.name AS partner_name,p.email AS partner_email,p.status AS partner_status,
      COUNT(rf.id)::int AS events,
      COUNT(rf.id) FILTER (WHERE rf.status='clicked')::int AS clicks,
      COUNT(rf.id) FILTER (WHERE rf.status='registered')::int AS registered,
      COUNT(rf.id) FILTER (WHERE rf.status='activated')::int AS activated,
      COUNT(rf.id) FILTER (WHERE rf.status='rewarded')::int AS rewarded
      FROM network_referral_codes rc
      LEFT JOIN network_websites w ON w.id=rc.website_id
      LEFT JOIN network_referral_partners p ON p.id=rc.partner_id
      LEFT JOIN network_referrals rf ON rf.referral_code_id=rc.id
      WHERE rc.partner_id IS NOT NULL
      GROUP BY rc.id,w.domain,w.brand_name,p.name,p.email,p.status ORDER BY rc.created_at DESC`);
    const partners=await pool.query(`SELECT p.*,
      COUNT(DISTINCT rc.id)::int AS codes,
      COUNT(rf.id) FILTER (WHERE rf.status='registered')::int AS registered_publishers,
      COUNT(rf.id) FILTER (WHERE rf.status IN ('activated','rewarded'))::int AS activated_publishers,
      COUNT(rf.id) FILTER (WHERE rf.status='rewarded')::int AS rewarded_publishers
      FROM network_referral_partners p
      LEFT JOIN network_referral_codes rc ON rc.partner_id=p.id
      LEFT JOIN network_referrals rf ON rf.referral_code_id=rc.id
      GROUP BY p.id ORDER BY p.created_at DESC`);
    const leads=await pool.query(`SELECT rf.id,rf.status,rf.reward_credits,rf.created_at,rf.updated_at,rf.metadata,
      rc.code,rc.partner_id,rc.website_id,p.name AS partner_name,w.domain AS referring_website
      FROM network_referrals rf JOIN network_referral_codes rc ON rc.id=rf.referral_code_id
      LEFT JOIN network_referral_partners p ON p.id=rc.partner_id
      LEFT JOIN network_websites w ON w.id=rc.website_id
      WHERE rf.status<>'clicked' AND rc.partner_id IS NOT NULL ORDER BY rf.created_at DESC LIMIT 250`);
    res.json({success:true,codes:codes.rows,partners:partners.rows,leads:leads.rows,reward_rule:'Clicks and empty signups earn nothing. An independent referrer/scout remains linked to the publisher they introduced. Reward only after the referred publisher becomes a genuine active Network participant.'});
  }));

  app.post('/api/network/admin/referral-partners', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const name=cleanText(req.body?.name,200),email=cleanText(req.body?.email,240),label=cleanText(req.body?.label,200),notes=cleanText(req.body?.notes,1200);
    if(!name)return res.status(400).json({success:false,error:'Referrer name is required'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const pr=await client.query(`INSERT INTO network_referral_partners (name,email,label,notes,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,[name,email||null,label||null,notes||null,req.admin&&req.admin.id||null]);
      const code=crypto.randomBytes(8).toString('hex');
      const cr=await client.query(`INSERT INTO network_referral_codes (partner_id,code,label,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,[pr.rows[0].id,code,label||('Scout: '+name),req.admin&&req.admin.id||null]);
      await client.query('COMMIT');
      res.status(201).json({success:true,partner:pr.rows[0],referral:cr.rows[0],share_url:'https://app.contentscale.site/network/join?ref='+code,rule:'This link stays attributed to this independent referrer. The referred publisher can apply through it.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.patch('/api/network/admin/referral-partners/:id/status', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const status=cleanText(req.body?.status,30).toLowerCase();
    if(!['active','paused','blocked','revoked'].includes(status))return res.status(400).json({success:false,error:'Invalid partner status'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const r=await client.query(`UPDATE network_referral_partners SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,status]);
      if(!r.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Referral partner not found'})}
      await client.query(`UPDATE network_referral_codes SET is_active=$2,updated_at=NOW() WHERE partner_id=$1`,[req.params.id,status==='active']);
      await client.query('COMMIT');
      res.json({success:true,partner:r.rows[0],codes_active:status==='active'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.delete('/api/network/admin/referral-partners/:id', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const id=req.params.id;
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const p=await client.query(`SELECT * FROM network_referral_partners WHERE id=$1 FOR UPDATE`,[id]);
      if(!p.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Referral partner not found'})}
      const meaningful=await client.query(`SELECT COUNT(*)::int AS n FROM network_referrals rf JOIN network_referral_codes rc ON rc.id=rf.referral_code_id WHERE rc.partner_id=$1 AND rf.status<>'clicked'`,[id]);
      if((meaningful.rows[0]?.n||0)>0){
        await client.query(`UPDATE network_referral_partners SET status='revoked',updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_referral_codes SET is_active=FALSE,updated_at=NOW() WHERE partner_id=$1`,[id]);
        await client.query('COMMIT');
        return res.status(409).json({success:false,revoked:true,error:'This referrer already has publisher/application history. It was revoked instead of deleted so attribution and reward history remain intact.'});
      }
      await client.query(`DELETE FROM network_referrals WHERE referral_code_id IN (SELECT id FROM network_referral_codes WHERE partner_id=$1)`,[id]);
      await client.query(`DELETE FROM network_referral_codes WHERE partner_id=$1`,[id]);
      await client.query(`DELETE FROM network_referral_partners WHERE id=$1`,[id]);
      await client.query('COMMIT');
      res.json({success:true,deleted:true});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.post('/api/network/admin/referrals/code', verifyAdmin, wrap(async (req,res)=>{
    const websiteId=Number(req.body?.website_id)||null,partnerId=Number(req.body?.partner_id)||null;
    if(websiteId&&partnerId)return res.status(400).json({success:false,error:'A referral code belongs to either a publisher/member website or an independent referrer, not both.'});
    if(websiteId){const w=await pool.query('SELECT id FROM network_websites WHERE id=$1',[websiteId]);if(!w.rows[0])return res.status(400).json({success:false,error:'Website not found'});}
    if(partnerId){const p=await pool.query("SELECT id FROM network_referral_partners WHERE id=$1 AND status='active'",[partnerId]);if(!p.rows[0])return res.status(400).json({success:false,error:'Active referral partner not found'});}
    const code=crypto.randomBytes(8).toString('hex');
    const r=await pool.query(`INSERT INTO network_referral_codes (website_id,partner_id,code,label,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,[websiteId,partnerId,code,cleanText(req.body?.label,160)||null,req.admin&&req.admin.id||null]);
    res.status(201).json({success:true,referral:r.rows[0],share_url:'https://app.contentscale.site/network/join?ref='+code});
  }));

  app.patch('/api/network/admin/referrals/:id/status', verifyAdmin, wrap(async (req,res)=>{
    const status=cleanText(req.body?.status,30).toLowerCase();
    if(!['registered','activated','rewarded','rejected'].includes(status))return res.status(400).json({success:false,error:'Invalid referral status'});
    const r=await pool.query(`UPDATE network_referrals SET status=$2,
      activated_at=CASE WHEN $2 IN ('activated','rewarded') THEN COALESCE(activated_at,NOW()) ELSE activated_at END,
      rewarded_at=CASE WHEN $2='rewarded' THEN COALESCE(rewarded_at,NOW()) ELSE rewarded_at END,
      updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,status]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Referral not found'});
    res.json({success:true,referral:r.rows[0]});
  }));

  app.post('/api/network/referrals/apply', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).json({success:false,error:'Network is not enabled'});
    const code=cleanText(req.body?.ref,120),domainInput=cleanText(req.body?.domain,500),contactName=cleanText(req.body?.contact_name,200),email=cleanText(req.body?.email,240),brand=cleanText(req.body?.brand_name,200),niche=cleanText(req.body?.niche,160),message=cleanText(req.body?.message,1200);
    if(!code||!domainInput||!email)return res.status(400).json({success:false,error:'Referral code, website and email are required'});
    const cr=await pool.query(`SELECT rc.*,p.status AS partner_status FROM network_referral_codes rc LEFT JOIN network_referral_partners p ON p.id=rc.partner_id WHERE rc.code=$1 AND rc.is_active=TRUE LIMIT 1`,[code]);
    const rc=cr.rows[0];if(!rc)return res.status(404).json({success:false,error:'Referral link is not valid'});
    if(rc.partner_id&&rc.partner_status!=='active')return res.status(409).json({success:false,error:'This referrer link is currently inactive'});
    let site;try{site=normalizeSite(domainInput)}catch(e){return res.status(400).json({success:false,error:'Enter a valid website/domain'})}
    const token=crypto.randomBytes(32).toString('hex');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const ar=await client.query(`INSERT INTO network_publisher_applications (domain,brand_name,contact_name,email,niche,message,referral_code,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW()) RETURNING *`,[site.domain,brand||null,contactName||null,email,niche||null,message||null,code,JSON.stringify({source:'public_referral_application',canonical_url:site.canonical_url})]);
      const acc=await client.query(`INSERT INTO network_publisher_accounts (application_id,email,contact_name,access_token,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'pending',NOW(),NOW()) RETURNING id,status`,[ar.rows[0].id,email,contactName||null,token]);
      const meta={publisher_domain:site.domain,publisher_url:site.canonical_url,brand_name:brand||null,contact_name:contactName||null,email,niche:niche||null,message:message||null,source:'public_referral_application',publisher_application_id:ar.rows[0].id,publisher_account_id:acc.rows[0].id};
      const rr=await client.query(`INSERT INTO network_referrals (referral_code_id,referred_member_ref,status,reward_credits,metadata,created_at,updated_at) VALUES ($1,$2,'registered',10,$3::jsonb,NOW(),NOW()) RETURNING *`,[rc.id,site.domain,JSON.stringify(meta)]);
      await client.query('COMMIT');
      const refLabel=rc.partner_id
        ? ((await pool.query('SELECT name FROM network_referral_partners WHERE id=$1',[rc.partner_id]).catch(()=>({rows:[]}))).rows[0]?.name || 'Independent scout')
        : ((await pool.query('SELECT brand_name,domain FROM network_websites WHERE id=$1',[rc.website_id]).catch(()=>({rows:[]}))).rows[0]?.brand_name || 'Publisher referral');
      const ownerNotification=await networkNotifyOwnerPublisherApplication(ar.rows[0],{source:'Referral publisher application',referred_by:refLabel});
      res.status(201).json({success:true,application_id:ar.rows[0].id,referral_application_id:rr.rows[0].id,status:'registered',dashboard_url:'/network/publisher/'+token,owner_notification:ownerNotification.state,message:'Application received. The referral remains linked to the person or publisher who introduced you.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.get('/network/join', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const code=cleanText(req.query?.ref,120);
    const qr=code?await pool.query(`SELECT rc.id,rc.code,rc.label,rc.partner_id,rc.website_id,rc.is_active,p.name AS partner_name,p.status AS partner_status,w.brand_name,w.domain FROM network_referral_codes rc LEFT JOIN network_referral_partners p ON p.id=rc.partner_id LEFT JOIN network_websites w ON w.id=rc.website_id WHERE rc.code=$1 LIMIT 1`,[code]):{rows:[]};
    const ref=qr.rows[0];
    if(!ref||!ref.is_active||(ref.partner_id&&ref.partner_status!=='active'))return res.status(404).type('html').send('<h1>Referral link not available</h1>');
    await pool.query(`INSERT INTO network_referrals (referral_code_id,status,reward_credits,metadata,created_at,updated_at) VALUES ($1,'clicked',0,$2::jsonb,NOW(),NOW())`,[ref.id,JSON.stringify({source:'join_page'})]);
    const referredBy=ref.partner_name||ref.brand_name||ref.domain||'a ContentScale Network member';
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Join ContentScale Network</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:760px;margin:auto;padding:40px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:24px}label{display:block;font-size:12px;color:#9fb1d6;margin:12px 0 6px}input,textarea{width:100%;box-sizing:border-box;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:11px}button{margin-top:16px;background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer}.note{color:#9aabd0;line-height:1.6}.ok{color:#86efac}.bad{color:#fca5a5}</style></head><body><main><div class="card"><h1>Join as a publisher</h1><p class="note">You were invited by <strong>${String(referredBy).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong>. Submit your website interest below. Your application stays linked to that referrer so ContentScale can track who introduced the publisher.</p><form id="f"><input type="hidden" name="ref" value="${String(code).replace(/"/g,'&quot;')}"><label>Website/domain *</label><input name="domain" placeholder="example.com" required><label>Business / brand name</label><input name="brand_name"><label>Your name</label><input name="contact_name"><label>Email *</label><input name="email" type="email" required><label>Niche</label><input name="niche" placeholder="Roofing, marketing, accounting…"><label>Message</label><textarea name="message" rows="4"></textarea><button id="b">Send publisher application</button><div id="m" class="note"></div></form></div></main><script>document.getElementById('f').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('b'),m=document.getElementById('m');b.disabled=true;b.textContent='Sending…';m.textContent='';try{const o=Object.fromEntries(new FormData(e.target).entries()),r=await fetch('/api/network/referrals/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not submit');m.className='ok';m.innerHTML='✓ Application received and linked to your referrer.'+(d.dashboard_url?' <a style="color:#8dd9ff;font-weight:800" href="'+d.dashboard_url+'">Open your private publisher dashboard →</a>':'');b.textContent='✓ Sent'}catch(err){m.className='bad';m.textContent='✕ '+err.message;b.disabled=false;b.textContent='Send publisher application'}};</script></body></html>`);
  }));

  app.get('/network/referrals',(req,res)=>{if(!envEnabled())return res.status(404).send('Network is not enabled.');res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publisher Scouts</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1180px;margin:auto;padding:34px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}a{color:#8dd9ff}.note,.tiny{color:#9aabd0;line-height:1.5}.tiny{font-size:12px}label{display:block;font-size:12px;color:#9fb1d6;margin:10px 0 6px}input,textarea,select{width:100%;box-sizing:border-box;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 13px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.6}.btn.warn{background:#7c2d12;border-color:#c2410c}.btn.danger{background:#7f1d1d;border-color:#dc2626}.btn.secondary{background:#172554;border-color:#35507a}.row{border-top:1px solid #26375c;padding:12px 0}.stats{display:flex;gap:12px;flex-wrap:wrap}.pill{background:#132443;border:1px solid #35507a;border-radius:999px;padding:4px 8px;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}</style></head><body><main><p><a href="/network/admin">← Network admin</a></p><div class="card"><h1>Publisher Scouts</h1><p class="note">Independent scouts do not need to be publishers. Their unique link permanently attributes a referred publisher application to them. Revoke disables all of a scout's referral links while preserving history. Delete is only allowed when there is no real publisher/application history.</p></div><div class="card"><h2>Add independent referrer / scout</h2><div class="grid"><div><label>Name *</label><input id="pName"></div><div><label>Email</label><input id="pEmail" type="email"></div><div><label>Label</label><input id="pLabel" placeholder="e.g. Roofing outreach Philippines"></div></div><label>Notes</label><textarea id="pNotes" rows="2"></textarea><button class="btn" id="createPartner" style="margin-top:12px">Create scout + referral link</button><div id="created" class="note" style="margin-top:10px"></div></div><div class="card"><h2>Scout links</h2><div id="codes" class="note">Loading…</div></div><div class="card"><h2>Referred publisher applications</h2><div id="leads" class="note">Loading…</div></div></main><script>(function(){const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)),api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),d=await r.json();if(!r.ok){const e=Error(d.error||'Request failed');e.payload=d;e.status=r.status;throw e}return d};async function load(){try{const d=await api('/api/network/admin/referrals');document.getElementById('codes').innerHTML=(d.codes||[]).map(x=>'<div class="row"><strong>'+(x.partner_name?'Scout: '+esc(x.partner_name):'Member/Publisher: '+esc(x.brand_name||x.domain||x.label||'General'))+'</strong> <span class="pill">'+esc(x.partner_status|| (x.is_active?'active':'inactive'))+'</span><div class="tiny">'+esc(x.label||'')+'</div><div style="margin:6px 0"><input readonly value="https://app.contentscale.site/network/join?ref='+esc(x.code)+'"></div><div class="stats"><span class="pill">Clicks '+x.clicks+'</span><span class="pill">Applications '+x.registered+'</span><span class="pill">Activated '+x.activated+'</span><span class="pill">Rewarded '+x.rewarded+'</span></div>'+(x.partner_id?'<div class="actions"><button class="btn secondary" data-partner-status="active" data-partner="'+x.partner_id+'">Activate</button><button class="btn warn" data-partner-status="revoked" data-partner="'+x.partner_id+'">Revoke</button><button class="btn danger" data-delete-partner="'+x.partner_id+'">Delete person</button></div>':'')+'</div>').join('')||'No referral links yet.';document.getElementById('leads').innerHTML=(d.leads||[]).map(x=>{const m=x.metadata||{};return '<div class="row"><strong>'+esc(m.brand_name||m.publisher_domain||x.referred_member_ref||'Publisher')+'</strong> · '+esc(x.status)+'<div class="tiny">'+esc(m.publisher_domain||'')+' · '+esc(m.contact_name||'')+' · '+esc(m.email||'')+'<br>Referred by: '+esc(x.partner_name||x.referring_website||'member')+'</div><div style="margin-top:8px"><button class="btn" data-status="activated" data-id="'+x.id+'">Mark activated</button> <button class="btn" data-status="rewarded" data-id="'+x.id+'">Mark rewarded</button> <button class="btn" data-status="rejected" data-id="'+x.id+'">Reject</button></div></div>'}).join('')||'No publisher applications yet.'}catch(e){document.getElementById('codes').textContent=e.message}}document.getElementById('createPartner').onclick=async function(){const b=this;b.disabled=true;b.textContent='Creating…';try{const d=await api('/api/network/admin/referral-partners',{method:'POST',body:JSON.stringify({name:document.getElementById('pName').value,email:document.getElementById('pEmail').value,label:document.getElementById('pLabel').value,notes:document.getElementById('pNotes').value})});document.getElementById('created').innerHTML='✓ Created: <strong>'+esc(d.share_url)+'</strong>';document.getElementById('pName').value='';document.getElementById('pEmail').value='';document.getElementById('pLabel').value='';document.getElementById('pNotes').value='';await load()}catch(e){alert(e.message)}finally{b.disabled=false;b.textContent='Create scout + referral link'}};document.getElementById('codes').onclick=async e=>{const sb=e.target.closest('[data-partner-status]');if(sb){sb.disabled=true;const old=sb.textContent;sb.textContent='Saving…';try{await api('/api/network/admin/referral-partners/'+sb.dataset.partner+'/status',{method:'PATCH',body:JSON.stringify({status:sb.dataset.partnerStatus})});await load()}catch(err){alert(err.message);sb.disabled=false;sb.textContent=old}return}const db=e.target.closest('[data-delete-partner]');if(!db)return;if(!confirm('Delete this referrer? If publisher/application history exists, ContentScale will revoke the person instead to preserve attribution.'))return;db.disabled=true;db.textContent='Deleting…';try{await api('/api/network/admin/referral-partners/'+db.dataset.deletePartner,{method:'DELETE'});await load()}catch(err){if(err.payload&&err.payload.revoked){alert(err.message);await load()}else{alert(err.message);db.disabled=false;db.textContent='Delete person'}}};document.getElementById('leads').onclick=async e=>{const b=e.target.closest('[data-status]');if(!b)return;b.disabled=true;const old=b.textContent;b.textContent='Saving…';try{await api('/api/network/admin/referrals/'+b.dataset.id+'/status',{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});await load()}catch(err){alert(err.message);b.disabled=false;b.textContent=old}};load()})();</script></body></html>`) });

  // PUBLIC NETWORK LANDING — server-rendered/indexable. Sponsored content is always labeled.
  app.get('/network', wrap(async (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    let ads=[];
    try {
      const ar=await pool.query(`SELECT id,company_name,headline,description,target_url,logo_url,niche,locale,placement
        FROM network_ads
        WHERE status='active'
          AND (starts_at IS NULL OR starts_at<=NOW())
          AND (ends_at IS NULL OR ends_at>=NOW())
          AND placement IN ('homepage','homepage_featured')
        ORDER BY CASE WHEN placement='homepage_featured' THEN 0 ELSE 1 END,created_at DESC
        LIMIT 8`);
      ads=ar.rows;
      if(ads.length) await pool.query(`UPDATE network_ads SET impressions=impressions+1,updated_at=NOW() WHERE id = ANY($1::bigint[])`,[ads.map(x=>Number(x.id))]);
    } catch (_) { ads=[]; }
    const e=escapeHtmlAttr;
    const adCards=ads.map(a=>`<article class="sponsor-card"><div class="sponsor-label">Sponsored</div>${a.logo_url?`<img class="sponsor-logo" src="${e(a.logo_url)}" alt="${e(a.company_name)} logo" loading="lazy">`:''}<h3>${e(a.headline||a.company_name)}</h3><p>${e(a.description||'')}</p>${a.niche?`<div class="sponsor-niche">${e(a.niche)}</div>`:''}<a class="text-link" rel="sponsored noopener" href="/network/ad/${Number(a.id)}/click">Visit ${e(a.company_name)} →</a></article>`).join('');
    res.set('Cache-Control','public, max-age=120');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Network — Get Backlinks. Get Cited. Get Discovered.</title><meta name="description" content="Join the ContentScale Network to earn real third-party placements, backlinks and brand mentions through relevant publishers."><meta name="robots" content="index,follow"><link rel="canonical" href="https://app.contentscale.site/network"><meta property="og:title" content="ContentScale Network — Get Backlinks. Get Cited."><meta property="og:description" content="Real publisher placements, backlinks, brand mentions and verified distribution."><style>
    :root{--bg:#07111f;--panel:#0e1b30;--panel2:#11233d;--line:#263f65;--text:#f3f7ff;--muted:#a8b7cf;--brand:#7c3aed;--brand2:#38bdf8;--good:#86efac;--max:1180px}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(180deg,#06101d,#0a1324 55%,#07111f);color:var(--text)}a{color:inherit}.wrap{max-width:var(--max);margin:auto;padding:0 22px}.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}.brand{display:flex;align-items:center;gap:11px;font-weight:900;text-decoration:none}.logo{width:42px;height:42px}.navlinks{display:flex;gap:18px;align-items:center}.navlinks a{font-size:14px;color:#d8e4f6;text-decoration:none}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:12px 17px;font-weight:800;text-decoration:none;border:1px solid #6d4bd1;background:var(--brand);color:#fff}.btn.secondary{background:#10213b;border-color:#355680}.hero{padding:74px 0 46px;text-align:center}.eyebrow{display:inline-block;border:1px solid #365376;background:#0d1b30;border-radius:999px;padding:7px 11px;font-size:12px;color:#b9c9df}.hero h1{font-size:clamp(40px,7vw,76px);line-height:1.02;max-width:980px;margin:20px auto 18px;letter-spacing:-.035em}.gradient{background:linear-gradient(90deg,#a78bfa,#38bdf8);-webkit-background-clip:text;color:transparent}.hero p{max-width:790px;margin:0 auto;color:var(--muted);font-size:19px;line-height:1.65}.hero-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:38px auto 0;max-width:900px}.metric{border:1px solid var(--line);background:#0b182b;border-radius:14px;padding:16px}.metric strong{display:block;font-size:23px}.metric span{font-size:12px;color:var(--muted)}section{padding:48px 0}.section-title{font-size:32px;margin:0 0 10px}.section-copy{color:var(--muted);max-width:760px;line-height:1.65}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:22px}.card,.sponsor-card{background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:22px}.card h3,.sponsor-card h3{margin:0 0 9px}.card p,.sponsor-card p{color:var(--muted);line-height:1.55}.step{font-size:12px;color:#93c5fd;font-weight:900;letter-spacing:.08em}.sponsored{background:#09182a;border-block:1px solid #17304f}.sponsor-label{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;border:1px solid #52657b;color:#c9d5e4;padding:4px 7px;border-radius:5px;margin-bottom:12px}.sponsor-logo{max-width:120px;max-height:44px;object-fit:contain;display:block;margin-bottom:12px;background:white;border-radius:7px;padding:4px}.sponsor-niche{font-size:12px;color:#9fb1cb;margin:10px 0}.text-link{color:#8dd9ff;text-decoration:none;font-weight:800}.forms{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.form{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px}label{display:block;font-size:12px;color:#aebed5;margin:11px 0 6px}input,textarea{width:100%;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:11px;font:inherit}.form button{margin-top:14px}.status{font-size:13px;margin-top:10px;color:#9fb1cb}.small{font-size:12px;color:#8294ae}.footer{padding:38px 0;border-top:1px solid #19304f;color:#8ea0b9}.mobile-only{display:none}@media(max-width:820px){.cards{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.forms{grid-template-columns:1fr}.navlinks a:not(.btn){display:none}.hero{padding-top:48px}.hero p{font-size:17px}}@media(max-width:480px){.metrics{grid-template-columns:1fr}.hero-actions .btn{width:100%}}
    </style></head><body><div class="wrap"><nav class="nav"><a class="brand" href="/network"><svg class="logo" viewBox="0 0 64 64" aria-label="ContentScale Network logo"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="#111d33" stroke="#38547a"/><circle cx="20" cy="22" r="6" fill="url(#g)"/><circle cx="44" cy="20" r="5" fill="url(#g)"/><circle cx="42" cy="44" r="7" fill="url(#g)"/><circle cx="19" cy="45" r="4" fill="url(#g)"/><path d="M25 22l14-2M23 27l15 13M23 43l12 1M44 25l-1 12" stroke="#b9d9ff" stroke-width="3" stroke-linecap="round"/></svg><span>ContentScale <span style="color:#8dd9ff">Network</span></span></a><div class="navlinks"><a href="#how">How it works</a><a href="#sponsored">Sponsored</a><a href="#join">Publishers</a><a class="btn secondary" href="/network/admin">Admin</a></div></nav></div><main><section class="hero"><div class="wrap"><span class="eyebrow">Publisher distribution for the AI-search era</span><h1>Get Backlinks. <span class="gradient">Get Cited.</span> Get Discovered.</h1><p>Publish original, relevant content on real third-party websites. Build backlinks, brand mentions and external evidence — then verify every placement inside ContentScale.</p><div class="hero-actions"><a class="btn" href="#join">Join as Publisher</a><a class="btn secondary" href="#advertise">Advertise on Homepage</a><a class="btn secondary" href="#how">How the Network Works</a></div><div class="metrics"><div class="metric"><strong>Real sites</strong><span>Approved publisher websites</span></div><div class="metric"><strong>Unique content</strong><span>Publisher-specific editions</span></div><div class="metric"><strong>Verified</strong><span>Live URL and SEO checks</span></div><div class="metric"><strong>Trackable</strong><span>Placements, referrals and results</span></div></div></div></section><section id="how"><div class="wrap"><h2 class="section-title">Built for real publisher placements</h2><p class="section-copy">The Network is designed around relevant third-party publication, not mass link drops. Each placement can be matched to niche, language and market, then verified after publication.</p><div class="cards"><article class="card"><div class="step">01 · MATCH</div><h3>Find relevant publishers</h3><p>Opportunities are matched to approved websites by niche, market and language.</p></article><article class="card"><div class="step">02 · PUBLISH</div><h3>Unique Publisher Edition</h3><p>Each publisher receives an original edition instead of a duplicate or lightly spun article.</p></article><article class="card"><div class="step">03 · VERIFY</div><h3>Backlink + citation evidence</h3><p>ContentScale verifies the live page, indexability, required links and placement evidence.</p></article></div></div></section>${ads.length?`<section id="sponsored" class="sponsored"><div class="wrap"><h2 class="section-title">Featured companies</h2><p class="section-copy">Paid homepage visibility. Sponsored placements are labeled and kept separate from organic publisher matching.</p><div class="cards">${adCards}</div></div></section>`:''}<section id="join"><div class="wrap"><div class="forms"><div class="form"><h2 class="section-title">Join as a publisher</h2><p class="section-copy">Have a real website and want relevant publication opportunities? Apply here. Approval is based on website quality, indexability, niche and language fit.</p><form id="publisherForm"><label>Website / domain *</label><input name="domain" placeholder="example.com" required><label>Business / brand</label><input name="brand_name"><label>Your name</label><input name="contact_name"><label>Email *</label><input name="email" type="email" required><label>Niche</label><input name="niche" placeholder="Roofing, marketing, accounting…"><label>Message</label><textarea name="message" rows="3"></textarea><button class="btn" id="publisherButton">Submit publisher application</button><div class="status" id="publisherStatus"></div></form></div><div class="form" id="advertise"><h2 class="section-title">Advertise on the homepage</h2><p class="section-copy">Companies can request clearly labeled sponsored visibility on the ContentScale Network homepage.</p><form id="adForm"><label>Company *</label><input name="company_name" required><label>Contact name</label><input name="contact_name"><label>Contact email *</label><input name="contact_email" type="email" required><label>Headline *</label><input name="headline" placeholder="What should visitors see?" required><label>Website URL *</label><input name="target_url" type="url" placeholder="https://example.com" required><label>Logo URL</label><input name="logo_url" type="url" placeholder="https://example.com/logo.png"><label>Niche</label><input name="niche"><label>Short description</label><textarea name="description" rows="3"></textarea><button class="btn" id="adButton">Request sponsored placement</button><div class="status" id="adStatus"></div></form></div></div><p class="small" style="margin-top:16px">Sponsored visibility does not buy organic recommendations, Network verification results or editorial preference.</p></div></section></main><footer class="footer"><div class="wrap"><strong>ContentScale Network</strong> · Get Backlinks. Get Cited. Get Discovered.<br><span class="small">Publisher placements remain subject to approval and verification. Visibility or AI citation is never guaranteed.</span></div></footer><script>
    async function submitForm(form,statusEl,button,path,success){form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;const old=button.textContent;button.textContent='Sending…';statusEl.textContent='';try{const body=Object.fromEntries(new FormData(form).entries()),r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');statusEl.style.color='#86efac';statusEl.innerHTML='✓ '+success+(d.dashboard_url?' <a style="color:#8dd9ff;font-weight:800" href="'+d.dashboard_url+'">Open your private publisher dashboard →</a>':'');button.textContent='✓ Sent';form.reset()}catch(err){statusEl.style.color='#fca5a5';statusEl.textContent='✕ '+err.message;button.disabled=false;button.textContent=old}})}
    submitForm(document.getElementById('publisherForm'),document.getElementById('publisherStatus'),document.getElementById('publisherButton'),'/api/network/publishers/apply','Publisher application received.');
    submitForm(document.getElementById('adForm'),document.getElementById('adStatus'),document.getElementById('adButton'),'/api/network/advertising/apply','Sponsored placement request received for review.');
    </script></body></html>`);
  }));

  app.post('/api/network/publishers/apply', wrap(async (req,res)=>{
    if(!envEnabled()) return res.status(409).json({success:false,error:'Network is disabled'});
    let site; try{site=normalizeSite(req.body?.domain)}catch(err){return res.status(400).json({success:false,error:err.message})}
    const email=cleanText(req.body?.email,320); if(!email||!email.includes('@')) return res.status(400).json({success:false,error:'A valid email is required'});
    const token=crypto.randomBytes(32).toString('hex');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const r=await client.query(`INSERT INTO network_publisher_applications (domain,brand_name,contact_name,email,niche,message,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW(),NOW()) RETURNING *`,[site.domain,cleanText(req.body?.brand_name,200)||null,cleanText(req.body?.contact_name,180)||null,email,cleanText(req.body?.niche,160)||null,cleanText(req.body?.message,2000)||null,JSON.stringify({source:'network_landing',canonical_url:site.canonical_url})]);
      const a=await client.query(`INSERT INTO network_publisher_accounts (application_id,email,contact_name,access_token,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'pending',NOW(),NOW()) RETURNING id,status`,[r.rows[0].id,email,cleanText(req.body?.contact_name,180)||null,token]);
      await client.query('COMMIT');
      const ownerNotification=await networkNotifyOwnerPublisherApplication(r.rows[0],{source:'Network landing'});
      res.status(201).json({success:true,application:r.rows[0],account:a.rows[0],dashboard_url:'/network/publisher/'+token,owner_notification:ownerNotification.state,note:'Keep this private dashboard link. Referral features appear automatically after the publisher website is approved.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  // Publisher applications become dashboard accounts first; referral links are created automatically only after website approval.
  app.post('/api/network/admin/publisher-applications/:id/review', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0,status=cleanText(req.body?.status,30).toLowerCase();
    if(!id||!['approved','rejected'].includes(status))return res.status(400).json({success:false,error:'Choose approved or rejected'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const ar=await client.query('SELECT * FROM network_publisher_applications WHERE id=$1 FOR UPDATE',[id]);
      const appRow=ar.rows[0];if(!appRow){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Publisher application not found'})}
      if(status==='rejected'){
        await client.query("UPDATE network_publisher_applications SET status='rejected',updated_at=NOW() WHERE id=$1",[id]);
        await client.query("UPDATE network_publisher_accounts SET status='revoked',updated_at=NOW() WHERE application_id=$1",[id]);
        await client.query('COMMIT');return res.json({success:true,status:'rejected'});
      }
      const site=normalizeSite(appRow.domain);
      let wr=await client.query('SELECT * FROM network_websites WHERE LOWER(domain)=LOWER($1) LIMIT 1',[site.domain]);
      if(!wr.rows[0])wr=await client.query(`INSERT INTO network_websites (domain,canonical_url,brand_name,primary_niche,ownership_type,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'external','pending',NOW(),NOW()) RETURNING *`,[site.domain,site.canonical_url,appRow.brand_name||site.domain,appRow.niche||null]);
      const website=wr.rows[0];
      let acc=await client.query('SELECT * FROM network_publisher_accounts WHERE application_id=$1 LIMIT 1',[id]);
      if(!acc.rows[0])acc=await client.query(`INSERT INTO network_publisher_accounts (application_id,website_id,email,contact_name,access_token,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NOW()) RETURNING *`,[id,website.id,appRow.email,appRow.contact_name||null,crypto.randomBytes(32).toString('hex')]);
      else acc=await client.query(`UPDATE network_publisher_accounts SET website_id=$2,email=$3,contact_name=$4,status=CASE WHEN status='revoked' THEN 'pending' ELSE status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[acc.rows[0].id,website.id,appRow.email,appRow.contact_name||null]);
      await client.query("UPDATE network_publisher_applications SET status='approved',updated_at=NOW() WHERE id=$1",[id]);
      await client.query('COMMIT');
      res.json({success:true,status:'approved',website_id:website.id,website_status:website.status,dashboard_url:'/network/publisher/'+acc.rows[0].access_token,note:website.status==='approved'||website.status==='trusted'?'Publisher dashboard is active.':'Website created/linked as pending. Approve it in Network Websites; the referral link will then appear automatically in the publisher dashboard.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  async function publisherDashboardData(token){
    const ar=await pool.query(`SELECT a.*,pa.domain AS application_domain,pa.brand_name AS application_brand,pa.status AS application_status,w.domain,w.brand_name,w.status AS website_status,w.primary_niche,w.country,w.language
      FROM network_publisher_accounts a LEFT JOIN network_publisher_applications pa ON pa.id=a.application_id LEFT JOIN network_websites w ON w.id=a.website_id WHERE a.access_token=$1 LIMIT 1`,[token]);
    let a=ar.rows[0];if(!a)return null;
    if(a.status!=='revoked'&&a.status!=='suspended'&&a.website_id&&['approved','trusted'].includes(a.website_status)){
      if(a.status!=='active'){await pool.query("UPDATE network_publisher_accounts SET status='active',updated_at=NOW() WHERE id=$1",[a.id]);a.status='active'}
      if(a.application_id){
        await pool.query("UPDATE network_publisher_applications SET status='activated',updated_at=NOW() WHERE id=$1 AND status<>'rejected'",[a.application_id]).catch(()=>{});
        await pool.query("UPDATE network_referrals SET status='activated',activated_at=COALESCE(activated_at,NOW()),updated_at=NOW() WHERE status='registered' AND metadata->>'publisher_application_id'=$1",[String(a.application_id)]).catch(()=>{});
      }
      let cr=await pool.query('SELECT * FROM network_referral_codes WHERE website_id=$1 AND partner_id IS NULL ORDER BY id ASC LIMIT 1',[a.website_id]);
      if(!cr.rows[0])cr=await pool.query(`INSERT INTO network_referral_codes (website_id,code,label,is_active,created_at,updated_at) VALUES ($1,$2,$3,TRUE,NOW(),NOW()) RETURNING *`,[a.website_id,crypto.randomBytes(8).toString('hex'),'Publisher referral · '+(a.brand_name||a.domain||a.application_brand||a.application_domain)]);
      else if(!cr.rows[0].is_active)cr=await pool.query('UPDATE network_referral_codes SET is_active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING *',[cr.rows[0].id]);
      a.referral=cr.rows[0];
    }else if(a.website_id){
      const cr=await pool.query('SELECT * FROM network_referral_codes WHERE website_id=$1 AND partner_id IS NULL ORDER BY id ASC LIMIT 1',[a.website_id]);
      if(cr.rows[0])a.referral=cr.rows[0];
    }
    let stats={clicks:0,applications:0,activated:0,rewarded:0,reward_credits:0};let referrals=[];
    if(a.referral){
      const sr=await pool.query(`SELECT COUNT(*) FILTER (WHERE status='clicked')::int AS clicks,COUNT(*) FILTER (WHERE status='registered')::int AS applications,COUNT(*) FILTER (WHERE status='activated')::int AS activated,COUNT(*) FILTER (WHERE status='rewarded')::int AS rewarded,COALESCE(SUM(reward_credits) FILTER (WHERE status='rewarded'),0)::int AS reward_credits FROM network_referrals WHERE referral_code_id=$1`,[a.referral.id]);
      stats=sr.rows[0]||stats;
      const rr=await pool.query(`SELECT id,referred_member_ref,status,reward_credits,created_at,activated_at,rewarded_at FROM network_referrals WHERE referral_code_id=$1 AND status<>'clicked' ORDER BY created_at DESC LIMIT 100`,[a.referral.id]);referrals=rr.rows;
    }
    let placements=[];
    if(a.website_id){const pr=await pool.query(`SELECT p.id,p.status,p.published_url,p.reward_credits,p.accepted_at,p.verified_at,c.title FROM network_placements p JOIN network_content c ON c.id=p.content_id WHERE p.publisher_website_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[a.website_id]);placements=pr.rows}
    await pool.query('UPDATE network_publisher_accounts SET last_seen_at=NOW() WHERE id=$1',[a.id]).catch(()=>{});
    return{account:a,stats,referrals,placements,share_url:a.referral?('https://app.contentscale.site/network/join?ref='+a.referral.code):null};
  }

  app.get('/api/network/publisher/:token/dashboard', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).json({success:false,error:'Publisher dashboard not found'});
    const d=await publisherDashboardData(token);if(!d)return res.status(404).json({success:false,error:'Publisher dashboard not found'});
    res.set('Cache-Control','no-store');res.json({success:true,...d});
  }));

  app.get('/network/publisher/:token', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).send('Publisher dashboard not found.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Publisher Dashboard · ContentScale Network</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1100px;margin:auto;padding:34px 20px}.top{display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.metric{background:#091329;border:1px solid #26375c;border-radius:12px;padding:16px}.metric strong{font-size:24px;display:block}.note,.tiny{color:#9aabd0;line-height:1.55}.tiny{font-size:12px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:4px 9px;font-size:12px}.row{border-top:1px solid #26375c;padding:12px 0}.share{display:flex;gap:8px;flex-wrap:wrap}.share input{flex:1;min-width:260px;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 13px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.6}a{color:#8dd9ff}</style></head><body><main><div class="top"><div><div class="tiny">CONTENTSCALE NETWORK</div><h1 style="margin:5px 0">Publisher Dashboard</h1></div><a href="/network">Public Network →</a></div><div id="app"><div class="card">Loading publisher dashboard…</div></div></main><script>(function(){const token=${JSON.stringify(token)},esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));async function load(){const root=document.getElementById('app');try{const r=await fetch('/api/network/publisher/'+token+'/dashboard',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load dashboard');const a=d.account||{},active=a.status==='active',name=a.brand_name||a.application_brand||a.domain||a.application_domain||'Publisher';root.innerHTML='<div class="card"><h2>'+esc(name)+'</h2><span class="pill">Account: '+esc(a.status)+'</span> <span class="pill">Website: '+esc(a.website_status||'not linked yet')+'</span><p class="note">'+(active?'Your approved publisher account is active. Your referral link is created automatically and belongs to this publisher account.':'Your dashboard is ready. Referral sharing activates automatically after your website is reviewed and approved; no referral link needs to be created manually.')+'</p></div>'+(d.share_url?'<div class="card"><h2>My Referral Link</h2><p class="note">Share this with website owners who may want to become ContentScale Network publishers. Clicks alone never earn a reward; attribution stays linked to you and activation/reward is tracked below.</p><div class="share"><input id="shareUrl" readonly value="'+esc(d.share_url)+'"><button class="btn" id="copyBtn">Copy link</button></div></div>':'<div class="card"><h2>My Referral Link</h2><p class="note">Waiting for website approval. As soon as your publisher website becomes approved/trusted, ContentScale creates the referral link automatically and it will appear here.</p></div>')+'<div class="card"><h2>Referral activity</h2><div class="grid"><div class="metric"><strong>'+Number(d.stats.clicks||0)+'</strong><span>Clicks</span></div><div class="metric"><strong>'+Number(d.stats.applications||0)+'</strong><span>Applications</span></div><div class="metric"><strong>'+Number(d.stats.activated||0)+'</strong><span>Activated</span></div><div class="metric"><strong>'+Number(d.stats.rewarded||0)+'</strong><span>Rewarded</span></div><div class="metric"><strong>'+Number(d.stats.reward_credits||0)+'</strong><span>Referral credits</span></div></div><div>'+((d.referrals||[]).map(x=>'<div class="row"><strong>'+esc(x.referred_member_ref||'Publisher')+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+new Date(x.created_at).toLocaleString()+'</div></div>').join('')||'<p class="note">No referred publisher applications yet.</p>')+'</div></div><div class="card"><h2>My Network Placements</h2>'+((d.placements||[]).map(x=>'<div class="row"><strong>'+esc(x.title||'Publication')+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+(x.published_url?'<a target="_blank" rel="noopener" href="'+esc(x.published_url)+'">'+esc(x.published_url)+'</a>':'Not published yet')+'</div></div>').join('')||'<p class="note">No placements assigned yet.</p>')+'</div>';const b=document.getElementById('copyBtn');if(b)b.onclick=async()=>{b.disabled=true;b.textContent='Copying…';try{await navigator.clipboard.writeText(document.getElementById('shareUrl').value);b.textContent='✓ Copied'}catch(e){b.disabled=false;b.textContent='Copy link'}}}catch(e){root.innerHTML='<div class="card"><h2>Dashboard unavailable</h2><p class="note">'+esc(e.message)+'</p></div>'}}load()})();</script></body></html>`);
  });

  app.post('/api/network/advertising/apply', wrap(async (req,res)=>{
    if(!envEnabled()) return res.status(409).json({success:false,error:'Network is disabled'});
    const company=cleanText(req.body?.company_name,220),headline=cleanText(req.body?.headline,240),email=cleanText(req.body?.contact_email,320);
    if(!company||!headline||!email||!email.includes('@')) return res.status(400).json({success:false,error:'Company, headline and valid contact email are required'});
    let target; try{target=normalizeSite(req.body?.target_url).canonical_url}catch(err){return res.status(400).json({success:false,error:'Enter a valid advertiser website URL'})}
    let logo=null;if(cleanText(req.body?.logo_url,2048)){try{logo=new URL(cleanText(req.body.logo_url,2048));if(!['http:','https:'].includes(logo.protocol))throw Error();logo=logo.toString()}catch(_){return res.status(400).json({success:false,error:'Logo URL must be a valid http/https URL'})}}
    const r=await pool.query(`INSERT INTO network_ads (company_name,contact_name,contact_email,headline,description,target_url,logo_url,niche,locale,placement,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'homepage','pending',NOW(),NOW()) RETURNING id,status`,[company,cleanText(req.body?.contact_name,180)||null,email,headline,cleanText(req.body?.description,900)||null,target,logo,cleanText(req.body?.niche,160)||null,cleanText(req.body?.locale,30)||'en-US']);
    res.status(201).json({success:true,ad:r.rows[0],note:'Pending admin approval. Sponsored content is kept separate from organic recommendations.'});
  }));

  app.get('/network/ad/:id/click', wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(404).send('Not found');
    const r=await pool.query(`UPDATE network_ads SET clicks=clicks+1,updated_at=NOW() WHERE id=$1 AND status='active' AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) RETURNING target_url`,[id]);
    if(!r.rows[0])return res.status(404).send('Advertisement is not active');
    res.redirect(302,r.rows[0].target_url);
  }));

  app.get('/api/network/admin/advertising', verifyAdmin, wrap(async (req,res)=>{
    const [ads,apps]=await Promise.all([
      pool.query(`SELECT * FROM network_ads ORDER BY created_at DESC LIMIT 500`),
      pool.query(`SELECT a.*,pa.access_token,pa.status AS account_status,pa.website_id FROM network_publisher_applications a LEFT JOIN network_publisher_accounts pa ON pa.application_id=a.id ORDER BY a.created_at DESC LIMIT 500`)
    ]);
    res.json({success:true,ads:ads.rows,publisher_applications:apps.rows});
  }));

  app.patch('/api/network/admin/advertising/:id', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid advertisement'});
    const allowed=new Set(['pending','active','paused','rejected','expired']),status=cleanText(req.body?.status,30);if(!allowed.has(status))return res.status(400).json({success:false,error:'Invalid status'});
    const placement=['homepage','homepage_featured','niche'].includes(cleanText(req.body?.placement,30))?cleanText(req.body?.placement,30):'homepage';
    const starts=cleanText(req.body?.starts_at,60)||null,ends=cleanText(req.body?.ends_at,60)||null;
    const r=await pool.query(`UPDATE network_ads SET status=$2,placement=$3,starts_at=$4::timestamptz,ends_at=$5::timestamptz,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,status,placement,starts,ends]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Advertisement not found'});res.json({success:true,ad:r.rows[0]});
  }));

  app.delete('/api/network/admin/advertising/:id', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid advertisement'});
    const r=await pool.query(`DELETE FROM network_ads WHERE id=$1 AND status IN ('pending','rejected') RETURNING id`,[id]);
    if(!r.rows[0])return res.status(409).json({success:false,error:'Only pending or rejected ads can be deleted. Pause/expire active history instead.'});res.json({success:true,deleted:true,id});
  }));

  app.get('/network/advertising',(req,res)=>{if(!envEnabled())return res.status(404).send('Network is not enabled.');res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network Advertising</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1180px;margin:auto;padding:34px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}a{color:#8dd9ff}.note,.tiny{color:#9aabd0;line-height:1.5}.tiny{font-size:12px}.row{border-top:1px solid #26375c;padding:14px 0}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.6}.danger{background:#7f1d1d;border-color:#dc2626}select,input{background:#091329;color:#fff;border:1px solid #35507a;border-radius:8px;padding:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:3px 8px;font-size:12px}.stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}</style></head><body><main><p><a href="/network/admin">← Network admin</a> · <a href="/network" target="_blank">View public landing</a></p><div class="card"><h1>Homepage Advertising</h1><p class="note">Sponsored companies are clearly labeled on the public Network homepage and remain separate from organic publisher matching. Activate only after review.</p></div><div class="card"><h2>Advertising requests</h2><div id="ads">Loading…</div></div><div class="card"><h2>Publisher applications</h2><p class="note">Every new publisher signup is listed here. Owner email status shows whether ContentScale sent you the signup notification.</p><div id="apps">Loading…</div></div></main><script>(function(){const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c)),api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d};async function load(){try{const d=await api('/api/network/admin/advertising');document.getElementById('ads').innerHTML=(d.ads||[]).map(x=>'<div class="row"><strong>'+esc(x.company_name)+'</strong> · '+esc(x.headline)+' <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+esc(x.contact_email||'')+' · '+esc(x.target_url||'')+' · '+esc(x.niche||'')+'</div><div class="stats"><span class="pill">Impressions '+x.impressions+'</span><span class="pill">Clicks '+x.clicks+'</span></div><div class="grid"><select data-placement="'+x.id+'"><option value="homepage" '+(x.placement==='homepage'?'selected':'')+'>Homepage</option><option value="homepage_featured" '+(x.placement==='homepage_featured'?'selected':'')+'>Homepage featured</option><option value="niche" '+(x.placement==='niche'?'selected':'')+'>Niche</option></select><input data-start="'+x.id+'" type="datetime-local"><input data-end="'+x.id+'" type="datetime-local"><select data-status="'+x.id+'"><option>pending</option><option>active</option><option>paused</option><option>rejected</option><option>expired</option></select><button class="btn" data-save="'+x.id+'">Save</button><button class="btn danger" data-delete="'+x.id+'">Delete</button></div></div>').join('')||'No advertising requests yet.';document.querySelectorAll('[data-status]').forEach(n=>{const id=n.dataset.status,x=(d.ads||[]).find(a=>String(a.id)===String(id));if(x)n.value=x.status});document.getElementById('apps').innerHTML=(d.publisher_applications||[]).map(x=>{const m=x.metadata||{},n=m.owner_notification||{},source=m.source||'network_landing';const mail=n.state||'unknown';const mailLabel=mail==='sent'?'Owner email: sent ✓':mail==='failed'?'Owner email: failed':mail==='not_configured'?'Owner email: not configured':'Owner email: unknown';return '<div class="row"><strong>'+esc(x.brand_name||x.domain)+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+esc(x.domain)+' · '+esc(x.contact_name||'')+' · '+esc(x.email)+' · '+esc(x.niche||'')+'<br>Source: '+esc(source)+(x.referral_code?' · Referral: '+esc(x.referral_code):'')+'<br>'+esc(mailLabel)+(n.error?' · '+esc(n.error):'')+'</div><div class="stats"><button class="btn" data-pub-review="approved" data-pub-id="'+x.id+'">Approve + link website</button><button class="btn danger" data-pub-review="rejected" data-pub-id="'+x.id+'">Reject</button>'+(x.access_token?'<a class="btn" target="_blank" href="/network/publisher/'+esc(x.access_token)+'">Open dashboard</a>':'')+'</div></div>'}).join('')||'No publisher applications yet.'}catch(e){document.getElementById('ads').textContent=e.message}}document.getElementById('ads').onclick=async e=>{const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save;save.disabled=true;save.textContent='Saving…';try{await api('/api/network/admin/advertising/'+id,{method:'PATCH',body:JSON.stringify({status:document.querySelector('[data-status="'+id+'"]')?.value,placement:document.querySelector('[data-placement="'+id+'"]')?.value,starts_at:document.querySelector('[data-start="'+id+'"]')?.value||null,ends_at:document.querySelector('[data-end="'+id+'"]')?.value||null})});save.textContent='✓ Saved';await load()}catch(err){alert(err.message);save.disabled=false;save.textContent='Save'}return}const del=e.target.closest('[data-delete]');if(del){if(!confirm('Delete this pending/rejected ad request?'))return;del.disabled=true;try{await api('/api/network/admin/advertising/'+del.dataset.delete,{method:'DELETE'});await load()}catch(err){alert(err.message);del.disabled=false}}};document.getElementById('apps').onclick=async e=>{const b=e.target.closest('[data-pub-review]');if(!b)return;const id=b.dataset.pubId,status=b.dataset.pubReview;if(status==='rejected'&&!confirm('Reject this publisher application?'))return;b.disabled=true;const old=b.textContent;b.textContent=status==='approved'?'Approving…':'Rejecting…';try{const d=await api('/api/network/admin/publisher-applications/'+id+'/review',{method:'POST',body:JSON.stringify({status})});if(d.dashboard_url)alert((d.note||'Publisher reviewed.')+'\n\nPrivate dashboard: '+location.origin+d.dashboard_url);await load()}catch(err){alert(err.message);b.disabled=false;b.textContent=old}};load()})();</script></body></html>`)});

  // Admin-only navigation hub. Public visitors use /network.
  // The HTML shell contains no privileged data. It validates the existing ContentScale
  // admin session against the protected Network API before revealing navigation.
  // All Network admin APIs remain server-side protected by verifyAdmin.
  app.get('/network/admin', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Network Admin</title><style>body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0b1020;color:#eef2ff}main{max-width:1040px;margin:0 auto;padding:48px 24px}.card{background:#121a2f;border:1px solid #263253;border-radius:18px;padding:26px}.badge{display:inline-block;padding:7px 10px;border-radius:999px;background:#18213b;border:1px solid #33436c;font-size:12px}h1{font-size:40px;margin:18px 0 12px}p{color:#b9c4df;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:24px}.mini{display:block;color:#eef2ff;text-decoration:none;padding:18px;border-radius:14px;background:#0f1629;border:1px solid #263253}.mini:hover{border-color:#5a78b8}.muted{font-size:13px;color:#8492b6}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.top a{color:#8dd9ff}</style></head><body><div id="csNetworkAdminGate" style="position:fixed;inset:0;z-index:99999;background:#0b1020;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#eef2ff"><div style="max-width:460px;width:100%;background:#121a2f;border:1px solid #263253;border-radius:18px;padding:28px"><div style="font-size:12px;color:#8492b6;text-transform:uppercase;letter-spacing:.08em;font-weight:800">Protected administration</div><h2 style="margin:10px 0 8px">Admin login required</h2><p id="csNetworkGateText" style="color:#b9c4df;line-height:1.55">Checking your existing ContentScale admin session…</p><button id="csNetworkLoginBtn" type="button" style="display:none;background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer">Open ContentScale Admin Login</button></div></div><main id="csNetworkAdminMain" style="display:none"><div class="top"><a href="/network" target="_blank">View public Network →</a><span class="badge">Isolated network_* module</span></div><div class="card"><h1>ContentScale Network Admin</h1><p>Manage publisher websites, opportunities, indexable Publisher Editions, verified placements, scouts and sponsored homepage visibility.</p><div class="grid"><a class="mini" href="/network/websites"><strong>Websites</strong><div class="muted">Registry + site approval</div></a><a class="mini" href="/network/opportunities"><strong>Opportunities</strong><div class="muted">H1 + pitch → hard interest</div></a><a class="mini" href="/network/publishing"><strong>Publishing</strong><div class="muted">SEO-indexable Publisher Editions</div></a><a class="mini" href="/network/placements"><strong>Placements</strong><div class="muted">Commitments + protection policy</div></a><a class="mini" href="/network/verification"><strong>Verification</strong><div class="muted">Live URL → verify → credits</div></a><a class="mini" href="/network/referrals"><strong>Publisher Scouts</strong><div class="muted">External referrers who recruit publishers</div></a><a class="mini" href="/network/advertising"><strong>Homepage Advertising</strong><div class="muted">Sponsored requests, approval, clicks + impressions</div></a></div></div></main><script>(function(){var gate=document.getElementById('csNetworkAdminGate'),main=document.getElementById('csNetworkAdminMain'),txt=document.getElementById('csNetworkGateText'),btn=document.getElementById('csNetworkLoginBtn');function login(){var next=encodeURIComponent('/network/admin');location.href='/admin?next='+next;}if(btn)btn.onclick=login;var key='';try{key=localStorage.getItem('admin_id')||'';}catch(e){}if(!key){if(txt)txt.textContent='Enter your ContentScale admin username and password first.';if(btn)btn.style.display='inline-block';return;}fetch('/api/network/admin/status',{headers:{'x-admin-key':key,'Accept':'application/json'},cache:'no-store'}).then(function(r){if(r.status===401||r.status===403)throw new Error('AUTH');if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(d){if(!d||d.success===false)throw new Error('AUTH');if(gate)gate.remove();if(main)main.style.display='block';}).catch(function(e){if(String(e&&e.message)==='AUTH'){try{localStorage.removeItem('admin_id');}catch(x){}if(txt)txt.textContent='Your admin session is not valid. Log in with your ContentScale admin password.';}else{if(txt)txt.textContent='Could not verify the admin session right now. Retry from the ContentScale admin login.';}if(btn)btn.style.display='inline-block';});})();</script></body></html>`);
  });

  return { registered: true, enabled: envEnabled(), schema_version: NETWORK_SCHEMA_VERSION };
}

module.exports = { registerNetwork, ensureNetworkTables, inspectNetworkSchema, NETWORK_SCHEMA_VERSION, NETWORK_TABLES };
