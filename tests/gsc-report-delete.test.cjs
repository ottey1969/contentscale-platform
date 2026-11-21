'use strict';
// Owner 2026-11-20: "delete optie Your reports en bulk delete / twee secties: zonder en met duidelijk scheiden".
// Only the owner deletes; one or many at once; the link stops working and an attached Free Growth invitation is withdrawn.
// The form and the list keep reports with and without Search Console clearly apart.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),crypto=require('node:crypto');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const KEY='owner-admin-key-0123456789';
function memory(){const rows=[],revokedInvites=[];let id=0;return {rows,revokedInvites,ensureTables:async()=>{},
 createReport:async(_p,o)=>{const r={id:++id,token:('tok'+id).padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),revoked_at:null,views:0,growth_invite:o.growthInvite||null};rows.push(r);return r},
 openReport:async(_p,t)=>rows.find(x=>x.token===t&&!x.revoked_at)||null,
 listReports:async()=>rows.map(({report,...r})=>({...r,scope:report.scope,growth:!!r.growth_invite})),
 revokeReport:async()=>null,createInvite:async()=>({token:'invite-'+(id+1)+'-abcdefghijklmnop'}),
 deleteReports:async(_p,ids)=>{const out=[];for(const i of ids){const k=rows.findIndex(r=>r.id===i);if(k>=0){out.push({id:rows[k].id,growth_invite:rows[k].growth_invite});rows.splice(k,1)}}return out},
 revokeInviteToken:async(_p,t)=>{revokedInvites.push(t);return true}}}
async function server(){
 const app=express();app.use(express.json({limit:'10mb'}));const storage=memory();
 registerGscReport(app,null,{storage,checkUrls:async()=>new Map(),config:{adminKey:KEY,brand:'ContentScale'}});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const req=async(m,p,b,h={})=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json',...h},body:b?JSON.stringify(b):undefined});const ct=r.headers.get('content-type')||'';return {status:r.status,body:ct.includes('json')?await r.json():await r.text()}};
 return {srv,storage,req};
}
const OWNER={'x-admin-key':KEY};
const csv='Top pages,Clicks,Impressions,CTR,Position\nhttps://a.example/,10,100,10%,3\n';
const mk=(s,extra={})=>s.req('POST','/api/gsc/reports',{title:'R',lang:'en',files:[{name:'Pages.csv',content_base64:Buffer.from(csv).toString('base64')}],...extra},OWNER);

test('only the owner deletes; a cookie session also needs the same-site header',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const a=await mk(s);assert.equal(a.body.success,true);
 assert.equal((await s.req('POST','/api/gsc/reports/delete',{ids:[a.body.id]})).status,404);
 const exp=Date.now()+36e5,mac=crypto.createHmac('sha256',KEY).update('growth-free-admin|'+exp).digest('base64url'),cookie={cookie:'gf_admin='+exp+'.'+mac};
 assert.equal((await s.req('POST','/api/gsc/reports/delete',{ids:[a.body.id]},cookie)).status,404,'no CSRF header: refused');
 assert.equal(s.storage.rows.length,1);
 const ok=await s.req('POST','/api/gsc/reports/delete',{ids:[a.body.id]},{...cookie,'x-requested-with':'gsc-report'});
 assert.equal(ok.status,200);assert.equal(ok.body.deleted,1);assert.equal(s.storage.rows.length,0);
});

test('delete one or many: the links stop working and the Free Growth invitation is withdrawn',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const a=await mk(s),b=await mk(s,{recipient_growth:{enabled:true,checks:2}}),c=await mk(s);
 const inv=s.storage.rows.find(r=>r.id===b.body.id).growth_invite;assert.ok(inv);
 const del=await s.req('POST','/api/gsc/reports/delete',{ids:[a.body.id,b.body.id]},OWNER);
 assert.equal(del.body.success,true);assert.equal(del.body.deleted,2);
 assert.deepEqual(s.storage.revokedInvites,[inv]);
 assert.equal((await s.req('GET',a.body.url)).status,404);assert.equal((await s.req('GET',b.body.url)).status,404);
 assert.equal((await s.req('GET',c.body.url)).status,200,'the other report stays');
 for(const bad of [{},{ids:[]},{ids:['x']},{ids:Array.from({length:201},(_,i)=>i+1)}])
  assert.equal((await s.req('POST','/api/gsc/reports/delete',bad,OWNER)).status,400,JSON.stringify(bad).slice(0,40));
});

test('the list says with or without Search Console; the page keeps both apart in the form and in the list',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 await mk(s);
 s.storage.rows.push({id:99,token:'tok99'.padEnd(30,'x'),title:'Crawl',site:'b.example',lang:'en',report:{scope:'CRAWL',pages:[]},created_at:new Date(),expires_at:new Date(Date.now()+864e5),revoked_at:null,views:0,growth_invite:null});
 const list=(await s.req('GET','/api/gsc/reports',null,OWNER)).body.reports;
 assert.equal(list.find(r=>r.id===99).search_console,false);
 assert.equal(list.find(r=>r.id!==99).search_console,true);
 const page=(await s.req('GET','/gsc',null,OWNER)).body;
 for(const id of ['secWith','secWithout','secPositions','listWith','listWithout','deleteSelected','progress','progressText'])assert.match(page,new RegExp('id="'+id+'"'),id);
 assert.ok(page.indexOf('id="gscFiles"')>page.indexOf('id="secWith"')&&page.indexOf('id="gscFiles"')<page.indexOf('id="secWithout"'),'Search Console files are in section A');
 assert.ok(page.indexOf('id="auditDomain"')>page.indexOf('id="secWithout"'),'the domain is in section B');
 for(const js of page.match(/<script>([\s\S]*?)<\/script>/g).map(x=>x.slice(8,-9)))assert.doesNotThrow(()=>new Function(js),'owner page script parses');
});
