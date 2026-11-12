'use strict';
// Owner 2026-11-12: "consultor geo" came out informational; the "commercial" button then only showed an error line.
const test = require('node:test'), assert = require('node:assert/strict');
const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
function detect() { const a = src.indexOf('function detectSearchIntent('); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } } return new Function(src.slice(a, i + 1) + ';return detectSearchIntent')(); }
const serp = [['Consultor GEO: Optimiza tu Marca para la IA', 'qué es GEO'], ['Consultor GEO en Valencia', 'servicios'], ['Consultor GEO: visibilidad en ChatGPT y Gemini', ''], ['Consultoría GEO para IA', ''],
  ['Consultor GEO en Barcelona - First Position', 'qué es'], ['Mejor consultor GEO en España (2026): guía y criterios', 'cómo elegir'], ['Consultor GEO: SEO para Inteligencia Artificial', ''], ['GEO: qué es y cómo funciona', 'guía']].map(x => ({ title: x[0], snippet: x[1] }));

test('a keyword that names a provider, with providers in the SERP, is commercial; a definition query stays informational', () => {
  const f = detect();
  const r = f('consultor geo', serp, [{}, {}, {}], null, []);
  assert.equal(r.primary, 'commercial'); assert.ok(r.evidence.includes('Keyword names a service provider'));
  assert.equal(f('qué es geo', serp.slice(7), [{}, {}, {}], null, []).primary, 'informational');
  assert.equal(f('how to fix a roof leak', [{ title: 'How to fix a roof leak: guide' }, { title: 'Roof leak repair tips' }], [{}, {}, {}], null, []).primary, 'informational');
});

test('the intent button runs the normal flow (job followed, NOT PASSED shown as preview)', () => {
  assert.match(src, /async function _pwbRegenWithIntent\(intent\) \{[\s\S]{0,400}return generatePrewriteBrief\(\{ intentOverride: intent \}\);/);
  assert.match(src, /if \(arguments\.length && arguments\[0\] && arguments\[0\]\.intentOverride\) _pwbBody\.intentOverride = arguments\[0\]\.intentOverride;/);
});
