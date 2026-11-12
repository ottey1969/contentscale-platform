'use strict';
// Owner 2026-11-12, Pre-Write brief for "consultor geo": a favicon URL listed as a source lead, a paper on a geospatial
// framework as an external source (another meaning of GEO), and "&#039;" in a source title.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/prewrite-brief-research.cjs');
const { senseDrift } = require('../src/prewrite-evidence-relevance.cjs');

test('source leads from AI answers: favicons, images and Google search pages are not sources; Markdown escapes removed', () => {
  const leads = M.aiSourceLeads({ perplexity: 'Fuentes: https://www.google.com/s2/favicons?domain=https://pablocano.es\\&sz=32 https://joselab.com/consultor-geo/ ' +
    'https://www.agenciadeseo.es/consultor/ https://cdn.example.com/logo.png https://www.google.com/search?q=consultor+geo https://www.google.com/url?q=x https://example.com/a\\_b' });
  assert.deepEqual(leads.map(x => x.url), ['https://joselab.com/consultor-geo/', 'https://www.agenciadeseo.es/consultor/', 'https://example.com/a_b']);
});

test('another meaning of a short keyword word is not a source; the same field is', () => {
  const serp = 'Consultor GEO: Optimiza tu Marca para la IA · Consultor GEO en Valencia · auditoría de visibilidad en IA · Generative Engine Optimization ChatGPT Gemini Perplexity';
  assert.equal(senseDrift({ keyword: 'consultor geo', title: 'Generative Engine Optimization (GEO): A Geospatial AI Framework for Local Search Discoverability', serpText: serp }), 'geospatial');
  assert.equal(senseDrift({ keyword: 'consultor geo', title: 'Geología y geografía de España', serpText: serp }), 'geologia');
  assert.equal(senseDrift({ keyword: 'consultor geo', title: 'GEO Research & Academic Resources', serpText: serp }), null);
  assert.equal(senseDrift({ keyword: 'consultor geo', title: 'Geolocalización para negocios locales', serpText: serp + ' geolocalización local' }), null, 'a word Google shows for the query is the same field');
  assert.equal(senseDrift({ keyword: 'optimización de contenido seo', title: 'Seoul travel guide', serpText: 'seo' }), null, 'only words of 7+ letters');
});

test('src/index.js: candidates filtered before the model sees them, evidence too, titles decoded, the drop recorded', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.match(src, /if\(_pwbSerpText\.length>200\)_pwbExternalCandidates=_pwbExternalCandidates\.filter/);
  assert.ok(src.indexOf('_pwbSenseDropped=[]') < src.indexOf('const _externalSourceBlock'), 'before the source list goes to the model');
  assert.match(src, /if\(_drift\)r=\{relevant:false,missing:\['other meaning: '\+_drift\]\}/);
  assert.match(src, /source_title:_pwbPlain\(src&&src\.title\)/);
  assert.match(src, /external_other_meaning:_pwbSenseDropped\.slice\(0,10\)/);
});
