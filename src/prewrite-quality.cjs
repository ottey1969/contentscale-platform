'use strict';

const { parse } = require('parse5');
const { marketOf, coreWords } = require('./prewrite-existing-page.cjs');
const { competitorSites, isCompetitorLink } = require('./prewrite-competitor-links.cjs');

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
  return { url, heading, type: tool.test(heading) && ((form && websiteInput) || pairedControls) ? 'interactive_tool' : service.test(heading) ? 'service' : 'content',
    schema: [...schema], pricing: pricePolicy, text: body.slice(0, 3200) };
}

function firstPartyOffers(topic, pages) {
  const wantsTool = /\b(?:check|checker|scan|scanner|tool|comprobador)\b/i.test(topic);
  return pages.filter(page => page.type !== 'content' && (!wantsTool || page.type === 'interactive_tool') &&
    hasTopic(topic, page.heading)).map(({ url, heading, type }) => ({ url, heading, type }));
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

function metadataIssues(meta, topic, year) {
  const title = String(meta?.seo_title || '').trim();
  const description = String(meta?.meta_description || '').trim();
  const issues = [];
  if (!title || title.length > 70 || /(?:…|\.\.\.|[-–—:])$/.test(title)) issues.push('seo_title_incomplete');
  if (description.length < 55 || description.length > 170 || /(?:…|\.\.\.|[-–—:])$/.test(description)) issues.push('meta_description_incomplete');
  if (/\b20\d{2}\b/.test(topic) === false && [...(title + ' ' + description).matchAll(/\b20\d{2}\b/g)].some(match => Number(match[0]) < year)) issues.push('stale_year');
  const terms = topicWords(topic);
  if (terms.length && !terms.some(word => words(title).includes(word))) issues.push('seo_title_off_topic');
  return issues;
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

const writerFields = new Set(['keyword','language','search_intent','content_decision','meta_package','ai_answer','opening_passage',
  'definitive_outline','page_blueprint','fact_safety','internal_link_targets','external_link_targets','surgical_changes',
  'preserve_sections','action_plan','quick_facts','paa_questions','conclusion','first_party_offers','schema_advice','missing_information','metadata_review','cannibalization_review']);
function writerBrief(brief) {
  const ownUrl = brief.website_evidence?.origin || brief.first_party_offers?.[0]?.url || brief.content_decision?.closest_existing_url;
  const sites = competitorSites({ competitorTable: brief.competitor_table, ownUrl });
  const domains = [...sites].filter(domain => isCompetitorLink('https://' + domain, sites));
  const names = (brief.competitor_table || []).filter(entry => domains.some(domain => fold(entry.domain).endsWith(domain)))
    .map(entry => fold(entry.company_or_publisher)).filter(name => name.length >= 5);
  const hasCompetitor = value => [...domains, ...names].some(name => fold(value).includes(name)) ||
    (value.match(/https?:\/\/[^\s<>()]+/gi) || []).some(url => isCompetitorLink(url, sites));
  function safe(value) {
    if (typeof value === 'string' && hasCompetitor(value)) return undefined;
    if (Array.isArray(value)) return value.map(safe).filter(item => item !== undefined);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safe(child)]).filter(([, child]) => child !== undefined));
    return value;
  }
  return safe(Object.fromEntries(Object.entries(brief).filter(([key]) => writerFields.has(key))));
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

module.exports = {
  serpFormats, websitePage, firstPartyOffers, contentMatch, pricingEvidenceUrl, missingInformation, repairPricingDraft, alignOpening, overlappingPlan,
  prewritePublicationBlockers, metadataIssues, schemaAdvice, relevantInternalLinks, verifiedSourceTargets, writerBrief, googleObservation, aiObservations,
  selectIntent, zeroThinkingModel, geminiUsage
};
