'use strict';
// Owner 2026-11-20: "kijk na of een domein niet zomaar een ander domein kan toevoegen aan tracker, dus als het test.com is en
// iemand zijn gegevens van roos.com wil invoeren dit geblokt wordt". The normal add route checked the domain; the manual
// add route did not (nor the page limit), and the sitemap route accepted any domain's sitemap for internal-link advice.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {urlOnClientDomain}=require('../src/tracker-domain-guard.cjs');

test('a URL belongs to the tracker only on its own domain, its subdomains or admin-added extra domains',()=>{
 const client={domain:'test.com',extra_domains:'es.test.com, www.partner.example'};
 for(const u of ['https://test.com/a','http://www.test.com/b','https://blog.test.com/c','test.com/d','https://partner.example/x'])assert.equal(urlOnClientDomain(client,u),true,u);
 for(const u of ['https://roos.com/','https://test.com.roos.com/','https://roos.com/?u=test.com','https://nottest.com/','https://test.co/','','javascript:alert(1)','https://user@roos.com/','ftp://test.com/'])
  assert.equal(urlOnClientDomain(client,u),false,u);
 assert.equal(urlOnClientDomain({domain:''},'https://roos.com/'),false,'no domain: nothing belongs');
});

test('every tracker route that adds a page or a sitemap for the tracker uses the same domain check',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const route=p=>{const i=src.indexOf("app.post('/api/tracker-client/:token/"+p+"'");assert.ok(i>0,p);return src.slice(i,i+3000)};
 assert.match(route('pages'),/urlOnClientDomain\(client,url\)/);
 const manual=route('add-page-manual');
 assert.match(manual,/urlOnClientDomain\(client,url\)/,'manual add checks the domain');
 assert.match(manual,/belongs to a different domain/);
 assert.match(manual,/max_pages/,'manual add respects the page limit');
 assert.match(manual,/status IS NULL OR status/,'a deleted tracker cannot add pages');
 const sm=route('sitemap-links');
 assert.match(sm,/urlOnClientDomain\(client,sitemap_url\)/,'the sitemap must be on the tracker domain');
 assert.ok(sm.indexOf('urlOnClientDomain(client,sitemap_url)')<sm.indexOf('UPDATE tracker_clients SET sitemap_url'),'checked before it is saved');
});
