'use strict';

const { parse } = require('parse5');
const { marketOf, coreWords } = require('./prewrite-existing-page.cjs');
const { competitorSites, isCompetitorLink, isOfficial } = require('./prewrite-competitor-links.cjs');

const fold = text => String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const words = text => fold(text).match(/[\p{L}\p{N}]{2,}/gu) || [];
const topicWords = text => coreWords(words(text)).filter(word => !/^(?:advies|advice|asesoria|consultoria)$/.test(word));
const hasTopic = (topic, text) => {
  const terms = topicWords(topic);
  const found = new Set(words(text));
  return terms.length > 0 && terms.every(word => found.has(word));
};
const tool = /\b(?:checker|scanner|scan|calculator|check tool|controletool|comprobador|esc[aá]ner|calculadora)\b/i;
const toolAction = /\b(?:enter|paste|submit|start|run|vul|plak|start|invoer|introduce|pega|ejecuta)\b.{0,70}\b(?:url|website|scan|result|dominio|escaneo)\b/i;
const service = /\b(?:diensten|service|servicios|consultant|consultor|advies|asesor[ií]a|offerte|quote|presupuesto)\b/i;
const pricing = /\b(?:kost|kosten|prijs|prijzen|tarief|tarieven|price|pricing|cost|cu[aá]nto|cuesta|precio|tarifa)\b/i;
const quote = /\b(?:op aanvraag|op offertebasis|on request|by quote|upon request|bajo consulta|previa consulta|a consultar)\b/i;
const explicitAmount = /(?:[€$£]\s*\d|\d[\d.,]*\s*(?:€|eur\b|usd\b|gbp\b))/i;

function serpFormats(rows) {
  const evidence = [];
  const counts = new Map();
  for (const row of (rows || []).slice(0, 10)) {
    const title = String(row?.title || '');
    const snippet = String(row?.snippet || '');
    const url = row?.url || row?.link;
    if (!url || evidence.some(item => item.url === url)) continue;
    const format = tool.test(title) && toolAction.test(snippet) ? 'interactive_tool'
      : /\b(?:guide|tutorial|explained|gids|uitleg|gu[ií]a|wat is|what is)\b/i.test(title) ? 'editorial_help'
      : service.test(title + ' ' + snippet) ? 'service' : null;
    if (!format) continue;
    evidence.push({ url, format });
    counts.set(format, (counts.get(format) || 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return { primary: ranked[0]?.[0] || null, secondary: ranked[1]?.[0] || null, evidence };
}

function websitePage(url, html) {
  const titles = [];
  let h1 = '';
  const visible = [];
  const pricePassages = [];
  const schema = new Set();
  let form = false;
  let websiteInput = false;
  let pairedControls = false;
  const attrs = node => Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
  const text = node => node.value || (node.childNodes || []).map(text).join(' ');
  function urlInput(node) {
    const a = attrs(node);
    return node.tagName === 'input' && (a.type === 'url' || /^(?:domain|url|website)$/.test(a.name || '') ||
      /\b(?:website|page|pagina|sitio web)\b.{0,20}\burl\b|\burl\b.{0,30}\b(?:website|pagina|scan)\b/i.test(a['aria-label'] || ''));
  }
  function scanButton(node) {
    return node.tagName === 'button' && /\b(?:scan|check|analyse|analyze|controleren|comprobar|analizar)\b/i.test(text(node));
  }
  function collectType(value) {
    for (const type of [].concat(value || [])) if (typeof type === 'string') schema.add(type.split(/[\/#]/).pop());
  }
  function jsonLd(node) {
    if (Array.isArray(node)) return node.forEach(jsonLd);
    if (!node || typeof node !== 'object') return;
    collectType(node['@type']);
    Object.values(node).forEach(jsonLd);
  }
  function visit(node, inForm = false) {
    const a = attrs(node);
    const tag = node.tagName;
    if (tag === 'script') {
      if (/^application\/ld\+json$/i.test(a.type || '')) {
        try { jsonLd(JSON.parse(text(node))); } catch {}
      }
      return;
    }
    if (['nav','footer','style','template','noscript','iframe'].includes(tag) || Object.hasOwn(a, 'hidden') || a['aria-hidden'] === 'true') return;
    collectType(a.itemtype);
    if (['title','h1','h2'].includes(tag)) titles.push(text(node).trim());
    if (tag === 'h1' && !h1) h1 = text(node).replace(/\s+/g, ' ').trim();
    if (node.nodeName === '#text') visible.push(node.value);
    if (tag === 'form') form = true;
    if (inForm && urlInput(node)) websiteInput = true;
    const children = node.childNodes || [];
    if (children.some(urlInput) && children.some(scanButton)) pairedControls = true;
    const start = visible.length;
    for (const child of children) visit(child, inForm || tag === 'form');
    if (['p', 'li', 'dd'].includes(tag)) {
      const passage = visible.slice(start).join(' ').replace(/\s+/g, ' ').trim();
      if (passage) pricePassages.push(passage);
    }
  }
  visit(parse(String(html || '')));
  const body = visible.join(' ').replace(/\s+/g, ' ').trim();
  const heading = titles.join(' ').replace(/\s+/g, ' ').trim();
  const prices = (pricePassages.length ? pricePassages : [body]).flatMap(passage => passage.split(/(?<=[.!?])\s+/u));
  let pricePolicy = null;
  for (const passage of prices) {
    if (!pricing.test(passage)) continue;
    if (explicitAmount.test(passage)) pricePolicy = { status: 'published_amount', passage: passage.trim() };
    else if (!pricePolicy && quote.test(passage)) pricePolicy = { status: 'on_request', passage: passage.trim() };
  }
  return { url, heading, h1, type: tool.test(heading) && ((form && websiteInput) || pairedControls) ? 'interactive_tool' : service.test(heading) ? 'service' : 'content',
    schema: [...schema], pricing: pricePolicy, text: body.slice(0, 3200) };
}

// Words that say nothing about the subject of a tool question ("¿Qué seo checker gratis analiza el SEO de mi web?").
const GENERIC_TOOL_WORDS = new Set(['gratis','free','gratuito','gratuita','gratuitos','online','web','website','site','sitio','pagina','page','mi','my','mijn','tu','your','je',
  'analiza','analyze','analyse','analizar','check','checker','scan','scanner','tool','test','que','what','which','welke','cual','best','mejor','beste','hoe','how','como']);
function firstPartyOffers(topic, pages) {
  const wantsTool = /\b(?:check|checker|scan|scanner|tool|comprobador|analizador|analyzer|analyser)\b/i.test(topic) && !pricing.test(topic);
  if (wantsTool) {
    // A tool question is answered by the site's own tool (owner 2026-11-28: the Spanish brief left the own checker out
    // because a question has more words than the tool's heading). The subject words must match, not every word.
    const subject = topicWords(topic).filter(word => !GENERIC_TOOL_WORDS.has(word) && !tool.test(word));
    return pages.filter(page => page.type === 'interactive_tool' && (subject.length === 0 ||
      subject.some(word => new Set(words(page.heading + ' ' + (page.h1 || '') + ' ' + String(page.text || '').slice(0, 600))).has(word))))
      .map(({ url, heading, type }) => ({ url, heading, type }));
  }
  return pages.filter(page => page.type !== 'content' &&
    hasTopic(topic, page.heading)).map(({ url, heading, type }) => ({ url, heading, type }));
}

// Competitors are research only (AGENTS.md). Their names must never reach the reader-facing parts of a brief: the
// Spanish "seo checker" brief named Seobility, Semrush, Ahrefs and Rank Math in its opening and its outline.
const GENERIC_BRANDS = new Set(['medium','blog','blogs','wiki','news','info','online','web','seo','tools','tool','site','home','help','support','docs','forum','reddit','quora','youtube','linkedin','facebook','twitter','instagram','amazon']);
// Names the AI systems mention (Seobility, Semrush SEO Checker…) are competitors too, unless they are the search engines'
// own tools or the site itself (owner 2026-11-29: Seobility, Semrush and DebugBear stayed in the reader text).
const OFFICIAL_VENDORS = new Set(['google','bing','microsoft','apple','yandex','baidu','openai','chatgpt','perplexity','claude','anthropic','gemini','copilot','youtube','wikipedia']);
const NAME_NOISE = new Set(['seo','free','gratis','best','top','online','website','web','tool','tools','checker','herramienta','herramientas','the','site','page','search','analyzer','audit']);
function competitorBrands({ serpUrls = [], aiLeads = [], competitorTable = [], ownUrl = '', aiCompanies = [] } = {}) {
  const own = siteOf(ownUrl);
  const out = new Map();
  const add = (name, source) => {
    const key = fold(name).replace(/[^\p{L}\p{N}]+/gu, '');
    if (key.length < 4 || GENERIC_BRANDS.has(key) || out.has(key)) return;
    const letters = [...key].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_.]?');
    out.set(key, { name: key, source, re: new RegExp('(?<![\\p{L}\\p{N}])' + letters + '(?![\\p{L}\\p{N}])', 'u') });
  };
  const fromUrl = (url, source) => {
    const value = typeof url === 'string' ? url : url && (url.url || url.link || url.exact_url);
    if (!value || isOfficial(value)) return;
    const site = siteOf(value);
    if (!site || site === own) return;
    add(site.split('.')[0], source);
  };
  for (const url of serpUrls || []) fromUrl(url, 'serp');
  for (const url of aiLeads || []) fromUrl(url, 'ai_answer');
  for (const row of competitorTable || []) {
    const value = row && (row.exact_url || row.url || (row.domain ? 'https://' + String(row.domain).replace(/^https?:\/\//, '') : ''));
    if (value) fromUrl(value, 'competitor_table');
    const name = String(row && row.company_or_publisher || '').trim();
    if (name && !(value && (isOfficial(value) || siteOf(value) === own))) add(name, 'competitor_table');
  }
  const ownStem = (own || '').split('.')[0];
  for (const raw of aiCompanies || []) {
    const name = String(raw || '').trim();
    const parts = name.split(/\s+/).map(part => fold(part).replace(/[^\p{L}\p{N}]+/gu, '')).filter(Boolean);
    if (!parts.length || OFFICIAL_VENDORS.has(parts[0]) || parts.every(part => NAME_NOISE.has(part))) continue;
    if (ownStem && parts.join('').includes(ownStem)) continue;
    // The brand is the name without generic words ("Semrush SEO Checker" -> semrush, "Screaming Frog SEO Spider" -> screamingfrog).
    const brand = [];
    for (const part of parts) { if (NAME_NOISE.has(part)) break; brand.push(part); }
    if (brand.length) add(brand.slice(0, 2).join(''), 'ai_answer');
  }
  return [...out.values()];
}
const namedCompetitors = (text, brands) => {
  const folded = fold(text);
  return (brands || []).filter(brand => brand.re.test(folded)).map(brand => brand.name);
};
const READER_FIELDS = ['opening_passage','ai_answer','page_blueprint','definitive_outline','quick_facts','use_cases','paa_questions',
  'recommended_title_h1','meta_package','faq_questions','conclusion'];
function stringsOf(value, skipKeys = []) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(item => stringsOf(item, skipKeys));
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !skipKeys.includes(key)).flatMap(([, child]) => stringsOf(child, skipKeys));
  return [];
}
// The reader-facing fields that name a competitor (a real Google question in paa_questions[].q stays verbatim).
function competitorFields(brief, brands) {
  return READER_FIELDS.filter(key => stringsOf(brief && brief[key], key === 'paa_questions' ? ['q'] : []).some(text => namedCompetitors(text, brands).length));
}
// Last resort after the model repair: remove only the sentences (and outline sections) that name a competitor.
function scrubCompetitorSentences(brief, brands) {
  let removed = 0;
  const clean = text => {
    if (!namedCompetitors(text, brands).length) return text;
    const parts = String(text).split(/(?<=[.!?])\s+/u);
    const kept = parts.filter(part => !namedCompetitors(part, brands).length);
    removed += parts.length - kept.length;
    return kept.join(' ').trim();
  };
  const walk = (value, key) => {
    if (typeof value === 'string') return key === 'q' ? value : clean(value);
    if (Array.isArray(value)) return value.map(item => walk(item, key)).filter(item => item !== '' && item !== undefined);
    if (value && typeof value === 'object') {
      const heading = value.h2 || value.heading;
      if (typeof heading === 'string' && namedCompetitors(heading, brands).length) { removed++; return undefined; }
      return Object.fromEntries(Object.entries(value).map(([k, child]) => [k, walk(child, k)]).filter(([, child]) => child !== undefined));
    }
    return value;
  };
  for (const key of READER_FIELDS) if (brief && brief[key] != null) brief[key] = walk(brief[key], key);
  return removed;
}
// One H1 for the whole brief: the SEO package's H1 wins; otherwise the recommended title fills it.
function alignH1(brief) {
  if (!brief) return brief;
  brief.meta_package = brief.meta_package && typeof brief.meta_package === 'object' ? brief.meta_package : {};
  const h1 = String(brief.meta_package.h1 || brief.recommended_title_h1 || '').trim();
  if (h1) { brief.meta_package.h1 = h1; brief.recommended_title_h1 = h1; }
  return brief;
}

function pageInMarket(page, pages, region) {
  const market = String(region || '').toLowerCase();
  const locale = marketOf(page.url);
  return !market || locale === market || (!locale && !pages.some(other => marketOf(other.url) === market));
}

function contentMatch(topic, pages, { region } = {}) {
  if (!pricing.test(topic)) return null;
  return pages.find(page => page.type === 'service' && page.pricing && pageInMarket(page, pages, region) &&
    hasTopic(topic, page.heading) && hasTopic(topic, page.pricing.passage)) || null;
}

function pricingEvidenceUrl(site, value) {
  if (value == null || value === '') return null;
  const { validateUrl } = require('./growth-public-html-reader.cjs');
  const { hostOf } = require('./tracker-domain-guard.cjs');
  const host = hostOf(site);
  const message = 'Use an exact public HTTPS pricing page on the same website';
  if (typeof value !== 'string' || value.length > 500) throw Error(message);
  let url;
  try { url = validateUrl(value.trim()); } catch { throw Error(message); }
  if (!host || hostOf(url.href) !== host || url.search || value.includes('#')) throw Error(message);
  return url.href;
}

function missingInformation(topic, pages) {
  if (!pricing.test(topic)) return { state: 'complete' };
  const observed = pages.find(page => page.pricing && hasTopic(topic, page.pricing.passage));
  return observed ? { state: 'complete', pricing: observed.pricing.status, source: observed.url, excerpt: observed.pricing.passage }
    : { state: 'needs_input', field: 'pricing', accepted: ['published_price_source', 'on_request_confirmed'] };
}

function repairPricingDraft(brief, page, { region, sourceId } = {}) {
  if (brief?.missing_information?.state !== 'needs_input' || brief.missing_information.field !== 'pricing') {
    throw Error('This draft does not need price evidence');
  }
  const evidence = missingInformation(brief.keyword, [page]);
  if (!evidence.source || !pageInMarket(page, [page], region)) throw Error('The exact page has no relevant price evidence for this market');
  const revised = structuredClone(brief);
  delete revised.generation_usage;
  if (revised.what_we_checked) delete revised.what_we_checked.generation_usage;
  revised.missing_information = evidence;
  revised.opening_passage = { ...revised.opening_passage, direct_answer: evidence.excerpt };
  revised.ai_answer = { ...revised.ai_answer, direct_answer: evidence.excerpt };
  for (const field of ['answer', 'short_answer']) {
    if (Object.hasOwn(revised.ai_answer, field)) revised.ai_answer[field] = evidence.excerpt;
  }
  if (Array.isArray(revised.ai_answer.key_takeaways)) {
    revised.ai_answer.key_takeaways = revised.ai_answer.key_takeaways.filter(value => !pricing.test(String(value)));
  }
  if (Array.isArray(revised.quick_facts)) {
    revised.quick_facts = revised.quick_facts.filter(fact => !pricing.test(String(fact?.label || '') + ' ' + String(fact?.value || '')));
  }
  for (const field of ['definitive_outline', 'page_blueprint']) {
    if (Array.isArray(revised[field])) {
      revised[field] = revised[field].map(section => section && pricing.test(String(section.citation_hook || ''))
        ? { ...section, citation_hook: evidence.excerpt } : section);
    }
  }
  if (revised.content_decision?.recommended_treatment === 'CREATE_NEW_PAGE' && contentMatch(brief.keyword, [page], { region })) {
    revised.content_decision = { ...revised.content_decision,
      recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: page.url, cannibalization_risk: 'high',
      existing_page_check: { method: 'live_service_and_price_content', url: page.url, excerpt: evidence.excerpt } };
    const { reason } = revised.content_decision;
    if (reason) delete revised.content_decision.reason;
    if (revised.meta_package) revised.meta_package.url_slug = new URL(page.url).pathname;
    if (revised.cannibalization_review?.reason === 'same_market_create_plan') {
      revised.cannibalization_review = { state: 'resolved_by_existing_page', url: page.url };
    }
    delete revised.hub_spoke_plan;
  }
  revised.pricing_repair = { source_brief_id: sourceId, source_url: page.url, method: 'verified_public_page' };
  return revised;
}

function alignOpening(brief) {
  const answer = brief.opening_passage?.direct_answer;
  if (typeof answer !== 'string' || !answer.trim() || /^insufficient_data$/i.test(answer)) return;
  if (brief.ai_answer && typeof brief.ai_answer === 'object') brief.ai_answer.direct_answer = answer;
}

function overlappingPlan(topic, region, plans) {
  const identity = words(topic).join(' ');
  return plans.some(plan => words(plan.keyword).join(' ') === identity &&
    String(plan.region || '').toLowerCase() === String(region || '').toLowerCase() &&
    plan.brief_json?.content_decision?.recommended_treatment === 'CREATE_NEW_PAGE');
}

function prewritePublicationBlockers(brief) {
  const blockers = [];
  if (brief?.missing_information?.state === 'needs_input') {
    blockers.push({ code: 'missing_pricing', message: 'Confirm pricing evidence before publication' });
  }
  if (brief?.metadata_review?.issues?.length) {
    blockers.push({ code: 'seo_metadata', message: 'Review the SEO metadata before publication' });
  }
  if (brief?.cannibalization_review?.state === 'needs_review') {
    blockers.push({ code: 'overlapping_plan', message: 'Review the overlapping publication plan first' });
  }
  return blockers;
}

// A model that runs out of characters stops mid-phrase: on a preposition, article or conjunction, or on "and doing." /
// "& Verbeter" with nothing after it (owner 2026-11-28: "Strategies for", "and achieving.", "Direct & Verbeter").
const dangling = new Set(['a','an','the','for','and','or','of','to','in','on','at','with','by','from','into','your','our','their',
  'een','de','het','voor','en','of','van','met','naar','op','in','je','jouw','uw','te','om','bij','door',
  'un','una','el','la','los','las','de','del','y','o','para','con','por','en','tu','su','al','que']);
function cutOff(text) {
  const clean = String(text || '').trim().replace(/[.!?]+$/, '');
  const parts = words(clean);
  const last = parts[parts.length - 1] || '';
  if (dangling.has(last)) return true;
  // "… Direct & Verbeter": one word after "&" at the length where models get cut off (a short "Prijzen & Tarieven" is fine).
  if (clean.length >= 50 && /&\s*[\p{L}]+$/u.test(clean)) return true;
  const previous = parts[parts.length - 2] || '';
  return ['and','or','en','of','y','o'].includes(previous) && /(?:ing|end|ando|iendo)$/.test(last) && /\.\s*$/.test(String(text).trim());
}

function metadataIssues(meta, topic, year) {
  const title = String(meta?.seo_title || '').trim();
  const description = String(meta?.meta_description || '').trim();
  const issues = [];
  if (!title || title.length > 70 || /(?:…|\.\.\.|[-–—:&])$/.test(title) || cutOff(title)) issues.push('seo_title_incomplete');
  if (description.length < 55 || description.length > 170 || /(?:…|\.\.\.|[-–—:])$/.test(description) || cutOff(description)) issues.push('meta_description_incomplete');
  if (/\b20\d{2}\b/.test(topic) === false && [...(title + ' ' + description).matchAll(/\b20\d{2}\b/g)].some(match => Number(match[0]) < year)) issues.push('stale_year');
  const terms = topicWords(topic);
  if (terms.length && !terms.some(word => words(title).includes(word))) issues.push('seo_title_off_topic');
  return issues;
}

// Repairs what metadataIssues can repair without inventing anything: an earlier year (the topic asks for none) becomes
// this year; a meta description that stops mid-phrase ends at its last complete sentence, if that keeps 55+ characters.
function repairMetadata(meta, topic, year) {
  if (!meta || typeof meta !== 'object') return meta;
  if (!/\b20\d{2}\b/.test(String(topic || ''))) {
    for (const key of ['seo_title', 'meta_description', 'h1']) {
      if (typeof meta[key] === 'string') meta[key] = meta[key].replace(/\b20\d{2}\b/g, found => Number(found) < year ? String(year) : found);
    }
  }
  const description = String(meta.meta_description || '').trim();
  if (description && (cutOff(description) || /(?:…|\.\.\.|[-–—:])$/.test(description))) {
    const sentences = description.match(/[^.!?]*[.!?]+/g) || [];
    let kept = '';
    for (const sentence of sentences.slice(0, -1)) kept += sentence;
    kept = kept.trim();
    if (kept.length >= 55) meta.meta_description = kept;
  }
  return meta;
}

function schemaAdvice(types, page, format, actualSteps = false) {
  const present = page?.schema || [];
  const article = ['Article','BlogPosting','NewsArticle','TechArticle'];
  const add = [...new Set(types)].filter(type => typeof type === 'string' && /^[A-Z][a-zA-Z]+$/.test(type) &&
    !present.includes(type) && !(article.includes(type) && (!page || present.some(existing => article.includes(existing)))) &&
    (type !== 'HowTo' || (actualSteps && format?.primary === 'editorial_help')));
  return { existing: present, add, rich_results: 'not_assessed' };
}

function relevantInternalLinks(targets, pages, topic, target) {
  const offers = new Set(firstPartyOffers(topic, pages).map(page => page.url));
  return targets.filter(link => link.link_to !== target && String(link.anchor_text || '').trim() &&
    pages.some(page => page.url === link.link_to && (offers.has(page.url) ||
      (hasTopic(topic, page.heading) && page.type === 'content'))));
}

function verifiedSourceTargets(targets, captures) {
  return targets.filter(link => {
    const source = captures.get(link.exact_url);
    const claim = String(link.supports_claim || '').trim();
    return source && claim.length >= 8 && fold(source.text).replace(/\s+/g, ' ').includes(fold(claim).replace(/\s+/g, ' '));
  });
}

// Questions are what people ask, never a claim made by the page (owner 2026-11-28: PAA questions were "removed claims").
function isQuestionField(path, value) {
  return typeof value === 'string' && /\?\s*$/.test(value) &&
    /(?:^|\.)(?:q|question|primary_question)$|(?:^|\.)(?:secondary_questions|questions|paa_questions)\[\d+\]$/.test(String(path || ''));
}
// "The provided context does not contain information about …" is the model saying it has no answer: not an answer.
const placeholderAnswer = /\b(?:(?:the\s+)?(?:provided\s+)?context|(?:de\s+)?(?:aangeleverde\s+|gegeven\s+)?context|(?:el\s+)?contexto(?:\s+proporcionado)?)\b[^.]{0,40}\b(?:does\s+not|doesn't|did\s+not|bevat\s+geen|geeft\s+geen|no\s+(?:contiene|especifica|proporciona|ofrece))\b|\bthe context does not specify\b/i;
function cleanPaa(list) {
  return (Array.isArray(list) ? list : []).filter(item => item && typeof item.q === 'string' && item.q.trim() &&
    !(typeof item.a === 'string' && placeholderAnswer.test(item.a)) && !(typeof item.a === 'string' && !item.a.trim()));
}

// Same site: equal registrable domain, so a scanner on app.example.com is the own site of www.example.com.
const multiPartSuffix = /^(?:co|com|org|net|gov|ac|edu)$/;
function siteOf(value) {
  let host;
  try { host = new URL(value).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
  const labels = host.split('.');
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 && multiPartSuffix.test(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join('.');
}
function sameSite(a, b) {
  const one = siteOf(a);
  return Boolean(one) && one === siteOf(b);
}

// Internal links from pages that were actually read (owner 2026-11-28: an empty list is not an answer). A page counts when
// it shares a topic word (stem) with the search, or is the own tool or service for it. Never the target itself.
const stop = new Set(['how','can','what','why','when','who','which','with','the','and','for','you','your','are','does','make','get',
  'hoe','wat','waarom','wanneer','kan','een','het','voor','met','mijn','jouw','van','zijn','wordt',
  'como','que','por','para','con','los','las','del','una','mas','puedo']);
const stem = word => word.replace(/(?:ings?|ers?|es|s|ing|en|e)$/,'').slice(0, 6);
const stems = text => new Set(words(text).filter(word => word.length >= 3 && !stop.has(word)).map(stem).filter(word => word.length >= 3));
function suggestInternalLinks(targets, pages, topic, target, { min = 3, max = 6 } = {}) {
  const chosen = relevantInternalLinks(Array.isArray(targets) ? targets : [], pages, topic, target);
  const seen = new Set(chosen.map(link => link.link_to));
  const want = stems(topic);
  const wantsTool = /\b(?:check|checker|scan|scanner|tool|audit|comprobador|controle)\b/i.test(topic);
  const scored = pages.filter(page => page.url !== target && !seen.has(page.url)).map(page => {
    const shared = [...stems(page.heading)].filter(word => want.has(word));
    const own = page.type !== 'content' && (wantsTool ? page.type === 'interactive_tool' : true) && shared.length > 0 ||
      (wantsTool && page.type === 'interactive_tool' && stems(page.heading).size > 0 && /\b(?:seo|content|website|site|pagina|página)\b/i.test(page.heading));
    return { page, shared, own };
  }).filter(item => item.own || item.shared.length > 0)
    .sort((a, b) => (b.own - a.own) || (b.shared.length - a.shared.length));
  for (const { page, shared, own } of scored) {
    if (chosen.length >= max) break;
    const anchor = String(page.h1 || page.heading || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 9).join(' ');
    if (!anchor) continue;
    chosen.push({ link_to: page.url, anchor_text: anchor, reason: own ? 'Own ' + (page.type === 'interactive_tool' ? 'tool' : 'service') + ' for this search' : 'Shares the topic: ' + shared.join(', ') });
    seen.add(page.url);
  }
  return chosen.slice(0, max);
}
function linkResearch({ sitemapUrls = 0, pagesRead = 0, internal = [], external = [], externalCandidates = 0 } = {}) {
  const count = internal.length;
  return {
    internal: { state: count >= 3 ? 'ok' : count ? 'few' : 'none_found', count, sitemap_urls: sitemapUrls, pages_read: pagesRead,
      reason: count >= 3 ? 'Relevant own pages were read and checked.' : sitemapUrls === 0
        ? 'No sitemap could be read, so only ' + pagesRead + ' page(s) of the site were checked. Add internal links by hand.'
        : 'Read ' + pagesRead + ' of ' + sitemapUrls + ' sitemap pages; fewer than three share this topic. Add internal links by hand.' },
    external: { state: external.length ? 'ok' : 'none_verified', count: external.length, candidates: externalCandidates,
      reason: external.length ? 'Each external link was verified on its source page.'
        : 'No primary source was verified: an external link is kept only when its claim is on that page (government, standards body, official documentation, never a competitor). Add one only after checking it.' }
  };
}

const writerFields = new Set(['keyword','language','search_intent','content_decision','meta_package','ai_answer','opening_passage',
  'definitive_outline','page_blueprint','fact_safety','internal_link_targets','external_link_targets','surgical_changes',
  'preserve_sections','action_plan','quick_facts','paa_questions','conclusion','first_party_offers','schema_advice','missing_information','metadata_review','cannibalization_review',
  'entity_strategy','ai_systems_analysis','aio_citation_gap','ai_overview_citation_strategy','link_research']);
function writerBrief(brief) {
  const ownUrl = brief.website_evidence?.origin || brief.first_party_offers?.[0]?.url || brief.content_decision?.closest_existing_url;
  const sites = competitorSites({ competitorTable: brief.competitor_table, ownUrl });
  const domains = [...sites].filter(domain => isCompetitorLink('https://' + domain, sites));
  const names = (brief.competitor_table || []).filter(entry => domains.some(domain => fold(entry.domain).endsWith(domain)))
    .map(entry => String(entry.company_or_publisher || '').trim()).filter(name => name.length >= 4);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp('(?:' + [...domains, ...domains.map(domain => domain.replace(/\.[^.]+$/, '')).filter(stem => stem.length >= 4), ...names]
    .map(escape).sort((a, b) => b.length - a.length).join('|') + ')', 'gi');
  const competitorUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value.trim()) && isCompetitorLink(value.trim(), sites);
  // Research stays useful for the writer: the competitor's name and links are taken out, the finding stays (owner 2026-11-28).
  const anonymize = value => {
    let text = value.replace(/https?:\/\/[^\s<>()"]+/gi, url => isCompetitorLink(url.replace(/[.,;:)]+$/, ''), sites) ? '' : url);
    if (domains.length || names.length) text = text.replace(mention, 'a ranking page');
    return text.replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  };
  function safe(value) {
    if (typeof value === 'string') return anonymize(value);
    if (Array.isArray(value)) return value.map(safe).filter(item => item !== undefined && item !== '');
    if (value && typeof value === 'object') {
      if (['exact_url', 'url', 'link_to', 'source_url'].some(key => competitorUrl(value[key]))) return undefined;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safe(child)]).filter(([, child]) => child !== undefined));
    }
    return value;
  }
  const writer = safe(Object.fromEntries(Object.entries(brief).filter(([key]) => writerFields.has(key))));
  const gaps = (Array.isArray(brief.competitor_table) ? brief.competitor_table : []).map((entry, index) => ({
    position: Number(entry?.rank) || index + 1,
    has: safe(String(entry?.what_they_have || '')), gap: safe(String(entry?.the_gap || '')), add: safe(String(entry?.what_to_add || ''))
  })).filter(entry => entry.gap || entry.add);
  if (gaps.length) writer.competition_gaps = gaps;
  return writer;
}

function googleObservation(evidence, searchAnswerBox) {
  const source = evidence?.google_source || evidence?.source || null;
  return { source, answer: evidence?.checked ? 'captured' : 'unknown', overview: source === 'no_ai_overview' ? 'observed_absent'
    : source === 'ai_overview' && evidence.checked ? 'observed_present' : 'unknown', search_answer_box: Boolean(searchAnswerBox) };
}

function aiObservations(evidence, google) {
  return Object.fromEntries(['google_aio','chatgpt','perplexity','claude','copilot'].map(engine => {
    const row = evidence?.[engine];
    if (engine === 'google_aio') return [engine, { ...google, citation: 'unknown' }];
    const source = row?.checked ? row.source : null;
    const domains = source === 'automatic_fallback' ? (row.automatic_cited_domains || []) : [];
    return [engine, { source, answer: row?.checked ? 'captured' : 'unknown',
      citation: domains.length ? 'provider_listed_domain' : 'unknown', listed_domains: domains }];
  }));
}

const allowedIntents = ['informational','commercial','transactional','navigational'];
function selectIntent(automatic, requested) {
  const chosen = String(requested || '').toLowerCase();
  return { primary: allowedIntents.includes(chosen) ? chosen : automatic, auto_detected: automatic,
    overridden: allowedIntents.includes(chosen), user_override: allowedIntents.includes(chosen) ? chosen : null };
}

function zeroThinkingModel(model) {
  return /^gemini-2\.5-flash(?:-lite)?(?:-\d{3})?$/.test(String(model || '')) ? model : 'gemini-2.5-flash-lite';
}

function geminiUsage(model, response) {
  const usage = response?.usageMetadata || {};
  const token = value => Number.isFinite(value) && value >= 0 ? value : 0;
  const input = token(usage.promptTokenCount);
  const output = token(usage.candidatesTokenCount);
  const reasoning = token(usage.thoughtsTokenCount);
  const tool = token(usage.toolUsePromptTokenCount);
  const total = token(usage.totalTokenCount) || input + output + reasoning + tool;
  return { model, provider_model_version: response?.modelVersion || null, requested_thinking_budget: 0,
    input_tokens: input, output_tokens: output, thinking_tokens: reasoning, billable_output_tokens: output + reasoning,
    total_tokens: total, tool_input_tokens: tool, unclassified_tokens: Math.max(0, total - input - output - reasoning - tool),
    cached_input_tokens: token(usage.cachedContentTokenCount), reasoning_observed_with_zero_budget: reasoning > 0,
    usage_reported: Boolean(response?.usageMetadata), billing_verified: false };
}

module.exports = { repairMetadata,
  serpFormats, websitePage, firstPartyOffers, contentMatch, pricingEvidenceUrl, missingInformation, repairPricingDraft, alignOpening, overlappingPlan,
  prewritePublicationBlockers, metadataIssues, schemaAdvice, relevantInternalLinks, verifiedSourceTargets, writerBrief, googleObservation, aiObservations,
  cutOff, isQuestionField, cleanPaa, sameSite, siteOf, suggestInternalLinks, linkResearch,
  competitorBrands, namedCompetitors, competitorFields, scrubCompetitorSentences, alignH1,
  selectIntent, zeroThinkingModel, geminiUsage
};
