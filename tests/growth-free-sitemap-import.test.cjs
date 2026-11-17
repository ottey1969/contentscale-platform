'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {importSitemap,MAX_BYTES,MAX_URLS}=require('../src/growth-free/sitemap-import.cjs');
const encode=(xml,name='sitemap.xml')=>({name,content_base64:Buffer.from(xml).toString('base64')});
const page='https://example.com/service/';
test('Free Growth imports bounded same-host sitemap URL leads, not HTML evidence',()=>{
 const xml='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
  '<url><loc>https://example.com/roof-repair/</loc></url>'+
  '<url><loc>https://example.com/roof-repair/</loc></url>'+
  '<url><loc>https://other.example.com/not-ours</loc></url></urlset>';
 const r=importSitemap(encode(xml),page);
 assert.deepEqual(r.urls,['https://example.com/roof-repair/']);
 assert.equal(r.totalFound,3);
 assert.equal(MAX_URLS,300);
});
test('Free Growth refuses XML entity expansion, index files and oversized uploads',()=>{
 assert.throws(()=>importSitemap(encode('<!DOCTYPE urlset [<!ENTITY x "bad">]><urlset></urlset>'),page),/SITEMAP_XML_ENTITIES_UNSUPPORTED/);
 assert.throws(()=>importSitemap(encode('<sitemapindex></sitemapindex>'),page),/UPLOAD_URLSET_NOT_SITEMAP_INDEX/);
 assert.throws(()=>importSitemap(encode('<urlset>'+(' '.repeat(MAX_BYTES))+'</urlset>'),page),/SITEMAP_TOO_LARGE/);
});
test('Free Growth rejects unrelated hosts and invalid XML',()=>{
 assert.throws(()=>importSitemap(encode('<urlset><url><loc>https://other.test/page</loc></url></urlset>'),page),/SITEMAP_NO_MATCHING_SITE_URLS/);
 assert.throws(()=>importSitemap(encode('<html><p>not a sitemap</p></html>'),page),/SITEMAP_INVALID_XML/);
});
