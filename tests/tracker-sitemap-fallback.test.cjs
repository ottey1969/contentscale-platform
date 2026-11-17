'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {trackerSitemapFallback}=require('../src/tracker-growth-automatic-routes.cjs');
const page='https://example.com/service/';
test('Tracker reuses saved sitemap URLs only as same-site, unverified fallback candidates',async()=>{
 const rows=[{sitemap_url:'https://example.com/sitemap.xml',sitemap_urls:JSON.stringify([
  'https://example.com/service/','https://example.com/other/',
  'https://external.test/avoid/','https://example.com/other/'])}];
 let fetched=0;
 const out=await trackerSitemapFallback(rows,page,[{url:page}],async()=>{fetched++;throw Error('should not fetch')});
 assert.deepEqual(out.urls,['https://example.com/other/']);
 assert.equal(out.evidence,'UNVERIFIED_URL_INVENTORY');
 assert.equal(out.fetch_status,'NOT_NEEDED');
 assert.equal(fetched,0);
});
test('Tracker can fetch its saved sitemap XML URL when the URL list is empty',async()=>{
 const sitemap='https://example.com/sitemap.xml';
 const xml='<urlset><url><loc>https://example.com/additional/</loc></url><url><loc>https://outside.test/bad</loc></url></urlset>';
 const out=await trackerSitemapFallback([{sitemap_url:sitemap,sitemap_urls:''}],page,[],async url=>({html:xml,final_url:url,truncated:false}));
 assert.deepEqual(out.urls,['https://example.com/additional/']);
 assert.equal(out.source,'FETCHED_TRACKER_SITEMAP_XML');
});
test('Tracker sitemap index is bounded and foreign redirected XML is rejected',async()=>{
 const root='https://example.com/sitemap_index.xml',child='https://example.com/post-sitemap.xml';
 const fetchXml=async u=>({html:u===root?'<sitemapindex><sitemap><loc>'+child+'</loc></sitemap></sitemapindex>':'<urlset><url><loc>https://example.com/inside/</loc></url></urlset>',final_url:u});
 const out=await trackerSitemapFallback([{sitemap_url:root}],page,[],fetchXml);
 assert.deepEqual(out.urls,['https://example.com/inside/']);
 const rejected=await trackerSitemapFallback([{sitemap_url:root}],page,[],async u=>({html:'<urlset></urlset>',final_url:'https://outside.test/redirect'}));
 assert.equal(rejected.count,0);
 assert.match(rejected.fetch_status,/SITEMAP_UNREADABLE_OR_TRUNCATED/);
});
