'use strict';
// Owner 2026-11-28: one owner-only page with every admin area, a link to each and today's numbers. English.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const request=require('supertest');
const {registerOwnerOverview,AREAS}=require('../src/owner-overview.cjs');
const {sign}=require('../src/owner-session.cjs');
const KEY='owner-overview-secret-0123456789';
const cookie=(exp=Date.now()+3600000)=>'gf_admin='+exp+'.'+sign(KEY,String(exp));
function app(pool,extra={}){const a=express();registerOwnerOverview(a,pool,{adminKey:KEY,...extra});return a}

test('without the owner session: a sign-in form only, and the numbers API answers 404',async()=>{
 const a=app({query:async()=>{throw Error('no data before sign-in')}});
 const page=await request(a).get('/owner').expect(200);
 assert.match(page.text,/name="key"/);assert.doesNotMatch(page.text,/Free Growth admin/);
 assert.equal(page.headers['cache-control'],'private, no-store');assert.match(page.headers['x-robots-tag'],/noindex/);
 await request(a).get('/api/owner/overview').expect(404);
 await request(a).get('/api/owner/overview').set('Cookie',cookie(Date.now()-1000)).expect(404);
 await request(a).get('/api/owner/overview').set('Cookie','gf_admin='+(Date.now()+3600000)+'.forged').expect(404);
});

test('signed in: every admin area is linked, with today\'s numbers; a missing table is "no data", not an error',async()=>{
 const pool={query:async sql=>{if(/gsc_reports/.test(sql))throw Error('relation does not exist');return {rows:[{n:/today|date_trunc/.test(sql)?2:5}]}}};
 const firecrawl=async()=>({status:'AVAILABLE',active_key:'BACKUP',accounts:[{label:'PRIMARY',active:false,credits:{remaining:12,status:'VERIFIED'}},{label:'BACKUP',active:true,credits:{remaining:880,status:'VERIFIED'}}],daily:{used:4},monthly:{used:40}});
 const a=app(pool,{firecrawl});
 const page=await request(a).get('/owner').set('Cookie',cookie()).expect(200);
 for(const [name,url] of [['Admin dashboard','/admin'],['Free Growth admin','/free-growth/admin'],['GSC reports','/gsc'],['Quick Scan','/quick-scan/admin'],
  ['CEO reports','/ceo'],['Tracker Pre-Write','/admin'],['Network cockpit','/network/admin'],['Firecrawl usage','/free-growth/admin#firecrawlSection'],['Free Pre-Write','/free-pre-write'],['Free Rank Tracker','/rank-tracker/admin']]){
  assert.match(page.text,new RegExp('<h2>'+name+'</h2>'),name);assert.ok(page.text.includes('href="'+url+'"'),url);
 }
 const js=page.text.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(js));
 const d=(await request(a).get('/api/owner/overview').set('Cookie',cookie()).expect(200)).body;
 const by=id=>d.areas.find(x=>x.id===id);
 assert.equal(by('free_growth').counts.find(c=>c.label==='Checks today').value,2);
 assert.ok(by('gsc').counts.every(c=>c.value===null),'missing table: no data');
 assert.deepEqual(by('firecrawl').counts.map(c=>[c.label,c.value]),[['Primary credits',12],['Backup credits (active)',880],['Requests today',4]]);
 assert.equal(AREAS.length,d.areas.length);
});
