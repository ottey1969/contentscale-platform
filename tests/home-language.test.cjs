'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const express=require('express'),request=require('supertest');
const {homeLanguage,homeRoute,hosts}=require('../src/home-language.cjs');
test('locale selection accepts only configured hosts',()=>{
 for(const [lang,host] of Object.entries(hosts)){
  assert.equal(homeLanguage(host),lang);
  assert.equal(homeLanguage(host.toUpperCase()+':443'),lang);
 }
 for(const host of ['nl.app.contentscale.site.evil.test','evil.test','nl.app.contentscale.site:bad','nl.app.contentscale.site:443:bad','',null])assert.equal(homeLanguage(host),null);
});
test('localized drafts retain their canonical, images and noindex',()=>{
 const en=fs.readFileSync('public/index.html','utf8');
 for(const lang of ['nl','es']){
  const html=fs.readFileSync('public/'+lang+'/index.html','utf8');
  assert.ok(html.includes('<html lang="'+lang+'">'));
  assert.ok(html.includes('<link rel="canonical" href="https://'+hosts[lang]+'/">'));
  assert.match(html,/<meta name="robots" content="noindex, follow">/);
  const images=s=>Array.from(s.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/g),m=>m[1]);
  assert.deepEqual(images(html),images(en));
  for(const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(m[1]);
 }
});
test('routing is disabled by default and never intercepts API or POST',async()=>{
 const saved=process.env.LOCALIZED_HOME_ENABLED;
 const app=express();app.use(homeRoute);app.use((req,res)=>res.send('fallback'));
 try{
  delete process.env.LOCALIZED_HOME_ENABLED;
  assert.equal((await request(app).get('/').set('Host',hosts.nl)).text,'fallback');
  process.env.LOCALIZED_HOME_ENABLED='true';
  for(const lang of ['nl','es']){
   const r=await request(app).get('/').set('Host',hosts[lang]);
   assert.equal(r.status,200);assert.equal(r.headers['content-language'],lang);
   assert.ok(r.text.includes('<html lang="'+lang+'">'));
  }
  assert.equal((await request(app).get('/').set('Host',hosts.en)).text,'fallback');
  assert.equal((await request(app).get('/api/scan').set('Host',hosts.nl)).text,'fallback');
  assert.equal((await request(app).post('/').set('Host',hosts.es)).text,'fallback');
 }finally{if(saved===undefined)delete process.env.LOCALIZED_HOME_ENABLED;else process.env.LOCALIZED_HOME_ENABLED=saved;}
});
