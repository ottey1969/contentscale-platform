'use strict';
// Regression for the first production Pre-Write run after PR #308 (query "seo content optimalisatie", Dutch, nl).
// Excerpts marked PRODUCTION INPUT are shortened from the owner's pasted fields of that run; everything else is TEST.
//  1. NOT PASSED on a normal Tracker had no diagnostic, so "Complete missing only" was unavailable and a fresh analysis
//     was locked: a dead end.
//  2. entity_strategy failed with one core entity and five secondary ones.
//  3. Two pasted answers came from a conversation that knew the ContentScale task and were counted as valid.
//  4. URLs from a pasted AI answer (with utm_source=chatgpt.com) were listed as evidence & authority sources.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const R = require('../src/prewrite-ai-answer-research.cjs');
const M = require('../src/prewrite-brief-research.cjs');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const Q = 'seo content optimalisatie';
const GOOGLE_FIELD = 'PRODUCTION INPUT (shortened): Om te zorgen dat de Pre-Write Brief voor **"seo content optimalisatie"** inhoudelijk ijzersterk wordt neergezet, kunnen we de structuur direct optuigen rondom de volgende kerncomponenten. Wil je dat ik deze structuur direct vastleg in de briefing, of wil je eerst handmatig de eerste AI-antwoorden invoeren om de dataset compleet te maken?';
const CHATGPT_FIELD = 'PRODUCTION INPUT (shortened): Hieronder staat het antwoord op de zoekvraag `seo content optimalisatie`, bedoeld om rechtstreeks in het juiste AI Answer Inputs-veld van de ContentScale Pre-Write Brief te plakken. SEO content optimalisatie is het verbeteren van bestaande of nieuwe webpagina\'s. [Google Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?utm_source=chatgpt.com)';
const PERPLEXITY_FIELD = 'PRODUCTION INPUT (shortened): SEO-contentoptimalisatie is het verbeteren van bestaande en nieuwe pagina’s zodat ze beter aansluiten op zoekintentie, leesbaarder zijn en hoger kunnen ranken in Google. [ahrefs](https://ahrefs.com/blog/content-optimization/)';
const fn = name => { const i = SRC.indexOf('function ' + name + '('); assert.ok(i > 0, name); let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } };

test('3. answers written in a conversation that knew the ContentScale task are INVALID (context contaminated)', () => {
  const g = R.validateGoogle(GOOGLE_FIELD, 'ai_overview', Q, true), c = R.validateAnswer(CHATGPT_FIELD, Q);
  assert.equal(g.reason, 'context_contaminated'); assert.equal(c.reason, 'context_contaminated');
  assert.match(c.message, /new, empty conversation/);
  assert.equal(R.validateAnswer(PERPLEXITY_FIELD, Q).status, 'valid', 'a neutral answer stays valid');
  // Not contamination: the brand name alone, or a workflow term that is part of the query itself.
  assert.equal(R.validateAnswer('TEST: ContentScale is een platform; SEO content optimalisatie begint bij zoekintentie.', Q).status, 'valid');
  assert.equal(R.validateAnswer('TEST: A pre-write brief collects research before a page is written.', 'pre-write brief').status, 'valid');
  // The run as it was: 5/5 counted before; with the contract Google and ChatGPT are INVALID and their URLs are not leads.
  const r = R.makePrewriteAiAnswerResearch({ query: Q, language: 'Dutch', market: 'nl', require_google_source: true, answers: [
    { engine: 'google_aio', answer: GOOGLE_FIELD, google_source: 'ai_overview' }, { engine: 'chatgpt', answer: CHATGPT_FIELD }, { engine: 'perplexity', answer: PERPLEXITY_FIELD }] });
  assert.deepEqual([r.answers_valid, r.answers_invalid], [1, 2]);
  assert.match(R.buildPrewriteResearchPrompt(r), /SYSTEM: ChatGPT Search — INVALID \(context contaminated\)/);
  // Research saved with these answers counted as valid (v3, before this marker) is shown as INVALID when reopened.
  const saved = R.makePrewriteAiAnswerResearch({ query: Q, answers: [{ engine: 'chatgpt', answer: 'TEST neutral answer about seo content optimalisatie.' }] });
  Object.assign(saved.observations.find(o => o.engine === 'chatgpt'), { answer_excerpt: CHATGPT_FIELD.slice(0, 2800) });
  const again = R.revalidate(saved);
  assert.equal(again.observations.find(o => o.engine === 'chatgpt').error_reason, 'context_contaminated'); assert.equal(again.answers_valid, 0);
});

test('4. URLs from AI answers are leads, never official sources; tracking parameters are removed', () => {
  assert.equal(M.stripTracking('https://developers.google.com/search/docs/x?utm_source=chatgpt.com&hl=nl#top'), 'https://developers.google.com/search/docs/x?hl=nl');
  assert.equal(M.stripTracking('javascript:alert(1)'), null);
  const leads = M.aiSourceLeads({ chatgpt: 'see https://developers.google.com/a?utm_source=chatgpt.com and https://developers.google.com/a?utm_source=chatgpt.com', perplexity: 'https://ahrefs.com/blog/content-optimization/' });
  assert.deepEqual(leads.map(x => [x.url, x.system, x.status]), [['https://developers.google.com/a', 'chatgpt', 'not_verified'], ['https://ahrefs.com/blog/content-optimization/', 'perplexity', 'not_verified']]);
  const official = ['https://developers.google.com/a?utm_source=chatgpt.com', 'Ahrefs — https://ahrefs.com/blog/content-optimization/', 'TEST verified — https://example.org/verified?utm_medium=x', 'TEST named source without URL'];
  // ahrefs was also found by the research itself (search results), so it stays; the ChatGPT-only URL goes.
  assert.deepEqual(M.officialSourcesWithoutAiLeads(official, leads, ['https://ahrefs.com/blog/content-optimization/', 'https://example.org/verified']),
    ['Ahrefs — https://ahrefs.com/blog/content-optimization/', 'TEST verified — https://example.org/verified', 'TEST named source without URL']);
  // Wiring: AI URLs no longer enter the external whitelist; official sources are filtered; leads are saved and shown.
  assert.doesNotMatch(SRC, /urls\.forEach\(u=>_pwbAddExternal\(u,\{source_type:'ai_'\+k\}\)\)/);
  assert.match(SRC, /const _pwbAiSourceLeads=_prewriteBriefResearch\.aiSourceLeads\(_manualAi\);/);
  assert.match(SRC, /brief\.evidence\.official_sources=_prewriteBriefResearch\.officialSourcesWithoutAiLeads\(brief\.evidence\.official_sources,_pwbAiSourceLeads,/);
  assert.match(SRC, /brief\.ai_source_leads=_pwbAiSourceLeads;/);
  assert.match(SRC, /nl:'Bronnen uit AI-antwoorden \\u2014 niet gecontroleerd, eerst verifiëren'/);
  assert.match(SRC, /SOURCE LEADS FROM AI ANSWERS — NOT VERIFIED, CHECK BEFORE USE/);
});

test('2. one core entity plus secondary entities passes; no core entity, or a single entity in total, does not', () => {
  const line = SRC.split('\n').find(l => /^\s+entity_strategy: !!\(b\.entity_strategy/.test(l));
  const check = vm.runInNewContext('(function(b){const _s=v=>typeof v==="string"&&!!v.trim();return ' + line.trim().replace(/^entity_strategy: /, '').replace(/,$/, '') + ';})');
  const production = { primary: ['SEO-contentoptimalisatie'], secondary: ['Zoekintentie', 'Zoekwoordenonderzoek', 'Contentstructuur', 'AI-zoekmachines', 'Google Search Console'] };
  assert.equal(check({ entity_strategy: production }), true, 'the production Brief passes');
  assert.equal(check({ entity_strategy: { primary: ['A', 'B'] } }), true);
  assert.equal(check({ entity_strategy: { primary: [], secondary: ['A', 'B'] } }), false, 'no core entity');
  assert.equal(check({ entity_strategy: { primary: ['A'] } }), false, 'only one entity in total');
  // The Network three-part synthesis check uses the same rule.
  assert.match(SRC, /b\.entity_strategy\.primary\.filter\(_usable\)\.length<1\|\|\(b\.entity_strategy\.primary\.filter\(_usable\)\.length\+\(Array\.isArray\(b\.entity_strategy\.secondary\)\?b\.entity_strategy\.secondary\.filter\(_usable\)\.length:0\)\)<2/);
});

test('1. a NOT PASSED Brief on a normal Tracker keeps its diagnostic; without one, a fresh analysis is offered, never a dead end', async () => {
  // Server: the synchronous NOT PASSED response is stored as a diagnostic job row and returns its id.
  const retain = fn('_pwbRetainSyncDiagnostic');
  const rows = []; const ctx = { crypto: require('crypto'), console, _ensurePwbAsyncJobsTable: async () => {}, pool: { query: async (sql, args) => { rows.push({ sql, args }); return { rows: [] }; } } };
  vm.runInNewContext('async ' + retain + ';this.retain=_pwbRetainSyncDiagnostic;', ctx);
  const payload = { success: false, stage: 'quality_gate', brief: { keyword: Q } };
  const id = await ctx.retain({ query: {}, body: { keyword: Q, existingSiteHtml: '<html>TEST</html>', manualAiEvidence: { chatgpt: 'TEST' } } }, { id: 7 }, payload);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.match(rows[0].sql, /INSERT INTO prewrite_async_jobs\(id,client_id,network_placement_id,status,stage,request_json,error_json,completed_at\) VALUES\(\$1,\$2,\$3,'failed','quality_gate'/);
  assert.equal(rows[0].args[1], 7); assert.equal(JSON.parse(rows[0].args[3]).existingSiteHtml, undefined, 'the HTML fallback is not stored');
  assert.deepEqual(JSON.parse(rows[0].args[4]), payload);
  // A background job run already has its own row: nothing extra is written.
  assert.equal(await ctx.retain({ query: { _pwbBackground: '1' }, body: {} }, { id: 7 }, payload), null); assert.equal(rows.length, 1);
  assert.match(SRC, /const _pwbDiagJob=await _pwbRetainSyncDiagnostic\(req,client,_pwbNotPassedPayload\);\n      if\(_pwbDiagJob\)\{_pwbNotPassedPayload\.job_id=_pwbDiagJob;_pwbNotPassedPayload\.diagnostic_job_id=_pwbDiagJob;\}/);
  // Browser: the id is remembered for Complete missing only; without a diagnostic, "Analyse again" is enabled.
  assert.match(SRC, /if\(_notPassed&&data\.diagnostic_job_id&&!_pwbCompletionMode\)_pwbRememberDiagnosticJob\(String\(data\.diagnostic_job_id\),kw\);/);
  assert.match(SRC, /if\(hasBrief&&!stale&&_pwbCurrentNotPassed&&!diag\)\{[^]*?fresh\.disabled=!aiInputReady;[^]*?'Analyse again · no diagnostic to complete'/);
  assert.match(SRC, /else if\(_pwbCurrentNotPassed&&!diag\)msg='<strong style="color:#fbbf24;">NEXT STEP:<\/strong> Analyse again\./);
});
