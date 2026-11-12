'use strict';
// "Add structured data (schema)": what the live page has now, and ready JSON-LD filled only with facts on the page.
const test=require('node:test'),assert=require('node:assert/strict');
const {liveHelp,pageFacts,snippetFor}=require('../src/growth-free/schema-help.cjs');
const URL_='https://acme-roofing.example/emergency-roof-repair/';
const bare='<html><head><title>Emergency Roof Repair | Acme Roofing</title><meta property="og:site_name" content="Acme Roofing"></head><body><h1>Emergency roof repair</h1><p>Call <a href="tel:+18625550100">(862) 555-0100</a>. Price from $250. We arrive within 60 minutes.</p></body></html>';
const withSchema='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"RoofingContractor","name":"Acme Roofing LLC","telephone":"+1-862-555-0100","address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Lodi","addressRegion":"NJ","postalCode":"07644","addressCountry":"US"}},{"@type":"Service","name":"Emergency roof repair"}]}</script></head><body><p>x</p></body></html>';
test('facts come from the page; anything not on it is FILL IN, never invented',()=>{
 const f=pageFacts(bare,URL_);assert.equal(f.name,'Acme Roofing');assert.equal(f.telephone,'+18625550100');assert.equal(f.address,null);
 const code=JSON.parse(snippetFor('RoofingContractor',f));const biz=code['@graph'][0];
 assert.equal(biz['@type'],'RoofingContractor');assert.equal(biz.name,'Acme Roofing');assert.equal(biz.telephone,'+18625550100');
 assert.match(biz.address.streetAddress,/^FILL IN/);assert.match(biz.address.postalCode,/^FILL IN/);assert.match(biz.areaServed,/^FILL IN/);
 const g=pageFacts(withSchema,URL_);assert.equal(g.name,'Acme Roofing LLC');assert.equal(g.address.postalCode,'07644');
 assert.equal(JSON.parse(snippetFor('PostalAddress',g))['@graph'][0].address.addressLocality,'Lodi','an address on the page is reused');
 assert.equal(snippetFor('AggregateRating',f),null,'no template that invites made-up ratings');assert.equal(snippetFor('Review',f),null);
});
test('the live page: types it has now are not offered again; facts it states are reported',()=>{
 const a=liveHelp(withSchema,URL_,['RoofingContractor','PostalAddress','Service','FAQPage']);
 assert.ok(a.schema_types.includes('RoofingContractor')&&a.schema_types.includes('PostalAddress'));
 assert.deepEqual(Object.keys(a.snippets),['FAQPage'],'only what is still missing gets code');
 assert.match(a.snippets.FAQPage,/^<script type="application\/ld\+json">/);
 const b=liveHelp(bare,URL_,['RoofingContractor']);assert.deepEqual(Object.keys(b.snippets),['RoofingContractor']);
 assert.ok(b.facts.includes('price')&&b.facts.includes('response_time'),'facts on the page tick off "state on your page"');
});
