'use strict';
// Owner 2026-11-22: "vanuit de GSC ga je telkens naar de eerste pagina en zou je weer moeten scannen". When a Free Growth
// result exists for a page of the report, the report links straight to it (brief, publication date, before/after); a new
// check stays possible. The owner sees their own results; the company only sees results made through the report's own
// invitation, never the owner's internal checks.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {reportPage}=require('../src/gsc-report/routes.cjs');
const {growthFor}=require('../src/gsc-report/published.cjs');
const U='https://nl.contentscale.site/wat-is-een-ai-overview/';
const rows=[{url:U,public_id:'pubOwner',access_key:'keyOwner1234',access_label:'admin',invite_id:null,published_on:'2026-11-22',finished_at:'2026-11-22T05:00:00Z'},
 {url:'https://nl.contentscale.site/wat-is-een-ai-overview',public_id:'pubInv',access_key:'keyInv1234',access_label:'invite',invite_id:5,matching_invite:true,published_on:null,finished_at:'2026-11-21T05:00:00Z'}];
const pool={async query(sql,p){if(/growth_free_invites/.test(sql)&&!/growth_free_checks/.test(sql))return {rows:[{id:5}]};return {rows}}};
test('lookup: latest result per page for the owner and for the report invitation, plus the latest date',async()=>{
 const g=await growthFor(pool,[U],{invite:'inv-token'});
 const x=g.get('https://nl.contentscale.site/wat-is-een-ai-overview');
 assert.equal(x.published_on,'2026-11-22');
 assert.equal(x.owner_result,'/r/pubOwner?k=keyOwner1234');
 assert.equal(x.invite_result,'/r/pubInv?k=keyInv1234');
 const none=await growthFor({query:async()=>{throw Error('no table')}},[U]);assert.equal(none.size,0);
});
test('report: a result link instead of only "research this page"; the company never gets the owner link',async()=>{
 const growth=await growthFor(pool,[U],{invite:'inv-token'});
 const row={title:'x',lang:'nl',created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,growth_invite:'inv-token',
  report:{pages:[{rank:1,url:U,action:'NO_CLICKS',clicks:0,impressions:1227,ctr:0,position:64.2,basis:'TOO_FEW'}],bands:[],queries:{},files:[],notes:[],kpis:{}}};
 const owner=reportPage(row,{owner:true,config:{},growthPath:'/free-growth',growth});
 assert.match(owner,/href="\/free-growth\/r\/pubOwner\?k=keyOwner1234&amp;lang=nl"[^>]*>Bekijk onderzoek</);
 assert.match(owner,/>Opnieuw onderzoeken</,'a new check stays possible');
 assert.match(owner,/Aangepast op 22 november 2026/);
 const client=reportPage(row,{owner:false,config:{},growthPath:'/free-growth',growth});
 assert.doesNotMatch(client,/pubOwner|keyOwner/,'never the owner internal check');
 assert.match(client,/href="\/free-growth\/r\/pubInv\?k=keyInv1234&amp;lang=nl"[^>]*>Bekijk onderzoek</);
 const noResult=reportPage({...row,growth_invite:null},{owner:false,config:{},growthPath:'/free-growth',growth:new Map()});
 assert.doesNotMatch(noResult,/Bekijk onderzoek/);
});
