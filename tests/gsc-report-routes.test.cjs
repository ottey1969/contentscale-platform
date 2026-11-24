'use strict';
// Owner 2026-11-20: reports made by the owner only, sent to companies as a safe link; the company opens it without a login;
// professional, fully linked to Free Growth, everything visible.
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const KEY='owner-admin-key-0123456789';
function memory(){
 const rows=[],invites=[];let id=0;
 return {rows,invites,
  ensureTables:async()=>{},
  createReport:async(_p,o)=>{const r={id:++id,token:'tok'+id+'-'.padEnd(30,'x'),title:o.title,site:o.site,lang:o.lang,report:o.report,created_at:new Date(),
   expires_at:new Date(Date.now()+o.days*864e5),revoked_at:null,views:0,growth_invite:o.growthInvite};rows.push(r);return r},
  openReport:async(_p,t,{count=true}={})=>{const r=rows.find(x=>x.token===t&&!x.revoked_at&&x.expires_at>new Date());if(r&&count)r.views++;return r||null},
  listReports:async()=>rows.map(r=>({...r,growth:!!r.growth_invite})),
  revokeReport:async(_p,i)=>{const r=rows.find(x=>x.id===Number(i)&&!x.revoked_at);if(!r)return null;r.revoked_at=new Date();return {id:r.id}},
  createInvite:async(_p,o)=>{const v={token:'invite-token-'+(invites.length+1)+'-abcdefghijkl',...o};invites.push(v);return v}};
}
async function server(){
 const app=express();app.use(express.json({limit:'10mb'}));const storage=memory();
 registerGscReport(app,null,{storage,config:{adminKey:KEY,authorName:'Ottmar J.G. Francisca',authorImage:'https://contentscale.site/p.png',brand:'ContentScale',contactUrl:'https://contentscale.site/contact/'}});
 const srv=app.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const req=async(m,p,b,h={})=>{const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json',...h},body:b?JSON.stringify(b):undefined});const t=r.headers.get('content-type')||'';return {status:r.status,headers:r.headers,body:t.includes('json')?await r.json():await r.text()}};
 return {srv,storage,req};
}
const SITE='https://acme-roofing.example';
const pages='Top pages,Clicks,Impressions,CTR,Position\n'+[[SITE+'/',300,3000,'10%',2],[SITE+'/roof-repair/',20,4000,'0.5%',6],[SITE+'/gutters/',40,800,'5%',5],
 [SITE+'/insulation/',25,700,'3.57%',7],[SITE+'/<script>alert(1)</script>/',0,500,'0%',9]].map(r=>r.join(',')).join('\n');
const body=(extra={})=>({title:'Acme <b>report</b>',lang:'nl',expires_days:30,files:[{name:'Pages.csv',content_base64:Buffer.from(pages).toString('base64')}],
 manual_pages:[{url:SITE+'/new-service/',note:'Nieuwe dienst'}],...extra});
const OWNER={'x-admin-key':KEY};

test('only the owner can make, list and revoke reports',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 assert.equal((await s.req('POST','/api/gsc/reports',body())).status,404);
 assert.equal((await s.req('GET','/api/gsc/reports')).status,404);
 assert.equal((await s.req('POST','/api/gsc/reports/1/revoke',{})).status,404);
 const login=await s.req('GET','/gsc');assert.equal(login.status,200);assert.match(login.body,/ownerKey/);assert.doesNotMatch(login.body,/id="gscFiles"/);
 const made=await s.req('POST','/api/gsc/reports',body(),OWNER);
 assert.equal(made.status,200);assert.ok(made.body.success);
 assert.match(made.body.url,/^\/gsc\/r\/[A-Za-z0-9_-]{24,}$/);
 assert.equal(s.storage.rows[0].report.files[0].name,'Pages.csv','the analysis is stored, not the uploaded file');
 assert.ok(!JSON.stringify(s.storage.rows[0]).includes(Buffer.from(pages).toString('base64')),'the raw upload is not kept');
 const list=await s.req('GET','/api/gsc/reports',null,OWNER);assert.equal(list.body.reports.length,1);
 assert.equal((await s.req('POST','/api/gsc/reports/'+made.body.id+'/revoke',{},OWNER)).body.success,true);
 assert.equal((await s.req('GET',made.body.url)).status,404,'a revoked link shows nothing');
});

test('the link opens the report without a login: no scripts, not indexed, every value escaped, in the chosen language',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const made=await s.req('POST','/api/gsc/reports',body(),OWNER);
 const r=await s.req('GET',made.body.url);
 assert.equal(r.status,200);
 assert.match(r.headers.get('content-security-policy'),/script-src 'none'/);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 assert.doesNotMatch(r.body,/<script/i,'a static report');
 assert.ok(!r.body.includes('<b>report</b>')&&r.body.includes('Acme &lt;b&gt;report&lt;/b&gt;'));
 assert.ok(!r.body.includes('<script>alert(1)</script>'));
 assert.match(r.body,/<html lang="nl"/);
 for(const s2 of ['Pagina’s om te bewerken, op volgorde','Zoektermen','Landen','Apparaten','Wat is geüpload','Hoe de volgorde is berekend','Nieuwe dienst','Ottmar J.G. Francisca'])
  assert.ok(r.body.includes(s2),'in the report: '+s2);
 assert.match(r.body,/acme-roofing\.example\/roof-repair\//);
 assert.equal(s.storage.rows[0].views,1);
});

test('Free Growth: the owner always gets a research link per page; a recipient only with an invitation that comes with the report',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const plain=await s.req('POST','/api/gsc/reports',body(),OWNER);
 const recipient=(await s.req('GET',plain.body.url)).body;
 assert.doesNotMatch(recipient,/\/free-growth\?/,'no Free Growth link for a recipient without an invitation');
 assert.match(recipient,/contentscale\.site\/contact\//,'the recipient can contact the owner');
 const owner=(await s.req('GET',plain.body.url,null,OWNER)).body;
 assert.match(owner,/href="\/free-growth\?url=https%3A%2F%2Facme-roofing\.example%2Froof-repair%2F&amp;lang=nl&amp;gsc_audit=[A-Za-z0-9_-]+"/);
 const withInvite=await s.req('POST','/api/gsc/reports',body({recipient_growth:{enabled:true,checks:3}}),OWNER);
 assert.equal(s.storage.invites[0].maxChecks,3);assert.equal(s.storage.invites[0].days,30,'the invitation ends with the report');
 const rec2=(await s.req('GET',withInvite.body.url)).body;
 assert.match(rec2,/href="\/free-growth\?invite=invite-token-1-abcdefghijkl&amp;url=https%3A%2F%2Facme-roofing\.example%2Froof-repair%2F&amp;lang=nl&amp;gsc_audit=[A-Za-z0-9_-]+"/);
});

test('bad input is refused with a clear reason; nothing is stored',async t=>{
 const s=await server();t.after(()=>s.srv.close());
 const none=await s.req('POST','/api/gsc/reports',{title:'x',files:[],manual_pages:[]},OWNER);
 assert.equal(none.status,400);assert.match(none.body.error,/Upload a Search Console export or add at least one page/);
 const bad=await s.req('POST','/api/gsc/reports',body({lang:'xx',expires_days:9999}),OWNER);
 assert.equal(bad.status,200);assert.equal(s.storage.rows[0].lang,'en');assert.ok(s.storage.rows[0].expires_at-new Date()<366*864e5,'at most a year');
 assert.equal(s.storage.rows.length,1);
});
