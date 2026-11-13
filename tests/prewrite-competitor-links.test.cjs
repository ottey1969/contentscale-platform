'use strict';
const test = require('node:test'), assert = require('node:assert');
const { siteOf, isOfficial, competitorSites, isCompetitorLink } = require('../src/prewrite-competitor-links.cjs');

test('the production case: ranking agencies are never link targets, OpenAI docs stay (owner 2026-11-13)', () => {
  const sites = competitorSites({
    serpUrls: [{ url: 'https://nireweb.es/como-hacer-chatgpt-recomiende-negocio/' }, { url: 'https://www.goone.es/blog/seo-en-chatgpt/' }, { url: 'https://gmbapi.com/es/noticias/x/' }, { url: 'https://help.openai.com/en/articles/20001635' }],
    competitorTable: [{ domain: 'davidayala.com' }, { exact_url: 'https://rodanet.com/x' }] });
  for (const u of ['https://nireweb.es/como-hacer-chatgpt-recomiende-negocio/', 'https://www.goone.es/blog/seo-en-chatgpt/', 'https://gmbapi.com/es/noticias/how-to-make-llms-recommend-your-business/', 'https://www.davidayala.com/como-hacer-que-chatgpt-recomiende-mi-empresa/', 'https://rodanet.com/y'])
    assert.equal(isCompetitorLink(u, sites), true, u);
  for (const u of ['https://help.openai.com/en/articles/20001635', 'https://developers.openai.com/api/docs/bots', 'https://schema.org/Organization', 'https://www.boe.es/buscar/act.php', 'https://es.wikipedia.org/wiki/GEO'])
    assert.equal(isCompetitorLink(u, sites), false, u);
});
test('a source that does not rank for the query is not a competitor', () => {
  assert.equal(isCompetitorLink('https://searchlab.nl/x', competitorSites({ serpUrls: [{ url: 'https://nireweb.es/' }] })), false);
});
test('registrable domains, including two-part country suffixes', () => {
  assert.equal(siteOf('https://blog.example.co.uk/a'), 'example.co.uk');
  assert.equal(siteOf('https://www.goone.es/b'), 'goone.es');
  assert.equal(siteOf('https://x.agencia.com.es/'), 'agencia.com.es');
  assert.equal(siteOf('not a url'), '');
  assert.equal(isOfficial('https://sede.agenciatributaria.gob.es/x'), true);
});
test("the client's own site is never counted as a competitor", () => {
  const s = competitorSites({ serpUrls: [{ url: 'https://es.contentscale.site/consultor-geo/' }, { url: 'https://nireweb.es/' }], ownUrl: 'https://es.contentscale.site/' });
  assert.equal(s.has('contentscale.site'), false); assert.equal(s.has('nireweb.es'), true);
});
test('index.js filters the whitelist, the chosen targets and the fallback', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(s.includes('const _pwbLinkableCandidates=_pwbExternalCandidates.filter(x=>!_pwbCompLinks.isCompetitorLink('));
  assert.ok(s.includes("' + _pwbLinkableCandidates.map("));
  assert.ok(s.includes('brief.external_link_targets=brief.external_link_targets.filter(x=>!_pwbCompLinks.isCompetitorLink(x.exact_url,_pwbCompSites))'));
  assert.ok(s.includes('brief.external_link_targets=_pwbNonCompetitorCandidates.slice(0,3)'));
  assert.ok(s.includes('competitor_links_removed:_pwbCompRemoved'));
});
