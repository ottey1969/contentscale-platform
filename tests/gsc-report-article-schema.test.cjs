'use strict';
// Owner 2026-11-21, Google Rich Results Test of web.derayah.com/en/us-stocks-dividend-eligibility-payments-nov-wk3-2026/:
// two Article items, "#richSnippet" and "#schema-2717113", both with headline "- Derayah Financial", and a description in the
// structured data while the page has no meta description. → "bouw": show the Article headline and where each Article comes
// from, flag a broken headline, and show a schema description that could become the meta description.
const test=require('node:test'),assert=require('node:assert/strict');
const {pageAudit}=require('../src/gsc-report/site-audit.cjs');
const {reportPage}=require('../src/gsc-report/routes.cjs');

const U='https://web.derayah.com/en/us-stocks-dividend-eligibility-payments-nov-wk3-2026/';
const DESC='Find out the Eligibility and cash dividend payment dates for US stocks the 3rd week of November 2026.';
const graph={'@context':'https://schema.org','@graph':[
 {'@type':['FinancialService','Organization'],'@id':'https://web.derayah.com/#organization','name':'Derayah Financial'},
 {'@type':'WebPage','@id':U+'#webpage','url':U,'name':'- Derayah Financial'},
 {'@type':'Article','@id':U+'#schema-2717113','headline':'- Derayah Financial','name':'- Derayah Financial'}]};
const rich={'@context':'https://schema.org','@type':'Article','@id':U+'#richSnippet','headline':'- Derayah Financial','description':DESC};
const html=`<html lang="en-US"><head><title>- Derayah Financial</title>
<script type="application/ld+json">${JSON.stringify(graph)}</script><script type="application/ld+json">${JSON.stringify(rich)}</script></head>
<body><h1>US stocks dividends</h1><p>${'word '.repeat(300)}</p></body></html>`;

test('each Article with its headline and source; a broken headline; the description found in the structured data',()=>{
 const a=pageAudit(html,U);
 assert.deepEqual(a.articles.map(x=>({id:x.id,source:x.source,headline:x.headline})),[
  {id:'#schema-2717113',source:'RANK_MATH',headline:'- Derayah Financial'},
  {id:'#richSnippet',source:'RANK_MATH',headline:'- Derayah Financial'}]);
 assert.ok(a.issues.includes('SCHEMA_DUPLICATE_ARTICLE'));
 assert.ok(a.issues.includes('ARTICLE_HEADLINE_BROKEN'));
 assert.ok(a.issues.includes('DESCRIPTION_MISSING'));
 assert.equal(a.schema_description,DESC);
 const y=pageAudit(`<html lang="en"><head><title>Guide to dividends | Site</title><meta name="description" content="d d d d d"><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'Article','@id':'https://x.example/a/#article','headline':'Guide to dividends'}]})}</script></head><body><h1>x</h1><p>${'w '.repeat(300)}</p></body></html>`,'https://x.example/a/');
 assert.equal(y.articles[0].source,'YOAST');assert.ok(!y.issues.includes('ARTICLE_HEADLINE_BROKEN'));
 const other=pageAudit(`<html><head><script type="application/ld+json">{"@type":"Article","headline":"A real headline"}</script></head><body></body></html>`,'https://x.example/b/');
 assert.equal(other.articles[0].source,null);assert.equal(other.articles[0].id,null);
});

test('the report shows the headline, the source of each Article, and the description to use',()=>{
 const a=pageAudit(html,U);
 const out=reportPage({title:'Derayah',lang:'nl',created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,
  report:{scope:'CRAWL',site:'web.derayah.com',kpis:{audit:{pages_read:1,with_issues:1,blocked:0}},pages:[{url:U,rank:1,action:'FIX_SNIPPET',queries:[],audit:a}],queries:{},bands:[],files:[],notes:[]}},
  {owner:false,config:{brand:'ContentScale'},growthPath:'/free-growth',issueView:'all'});
 assert.match(out,/Article-headline is kapot/);
 assert.match(out,/#richSnippet/);assert.match(out,/#schema-2717113/);assert.match(out,/lijkt Rank Math/);
 assert.match(out,/Beschrijving in de structured data/);assert.match(out,/cash dividend payment dates/);
});
