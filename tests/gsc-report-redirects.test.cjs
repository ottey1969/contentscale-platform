'use strict';
// Owner 2026-11-20: "indien mogelijk om 301 te wijzen in dit overzicht". A URL from the Search Console export that now
// redirects is not a page to edit: the report says so, names where it goes, and does the same for pages that are gone (404/410).
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {analyze,applyUrlStatus}=require('../src/gsc-report/analysis.cjs');
const {checkUrlStatuses}=require('../src/gsc-report/url-status.cjs');
const {registerGscReport}=require('../src/gsc-report/routes.cjs');

const S='https://acme-roofing.example';
const pages='Top pages,Clicks,Impressions,CTR,Position\n'+[[S+'/',300,3000,'10%',2],[S+'/old-roof-repair/',20,4000,'0.5%',6],[S+'/roof-repair/',40,800,'5%',5],
 [S+'/insulation/',25,700,'3.57%',7],[S+'/gutters/',30,900,'3.3%',6],[S+'/removed/',0,500,'0%',9],[S+'/slow/',2,600,'0.33%',8],[S+'/promo/',5,300,'1.67%',5]].map(r=>r.join(',')).join('\n');
const uploads=()=>require('../src/gsc-report/analysis.cjs').readUploads([{name:'Pages.csv',content_base64:Buffer.from(pages).toString('base64')}]);
// A fake of the public reader: the same result and error shapes (redirect_chain on both).
function fakeFetch(map){const calls=[];const f=async url=>{calls.push(url);const m=map[url];
 if(!m)return {status:200,final_url:url,redirect_chain:[]};
 if(m.error)throw Object.assign(Error(m.error),{code:m.error,redirect_chain:m.chain||[]});
 return {status:200,final_url:m.final,redirect_chain:m.chain}};f.calls=calls;return f}
const MAP={
 [S+'/old-roof-repair/']:{final:S+'/roof-repair/',chain:[{url:S+'/old-roof-repair/',status:301,location:S+'/roof-repair/'}]},
 [S+'/promo/']:{final:S+'/offers/',chain:[{url:S+'/promo/',status:302,location:S+'/offers-tmp/'},{url:S+'/offers-tmp/',status:301,location:S+'/offers/'}]},
 [S+'/removed/']:{error:'HTTP_404'},
 [S+'/slow/']:{error:'FETCH_TIMEOUT'}};

test('a redirected URL is marked with its status and target, a removed page as gone, a failed check is said',async()=>{
 const r=analyze({uploads:uploads()});
 const fetch=fakeFetch(MAP);
 const statuses=await checkUrlStatuses(r.pages.map(p=>p.url),{fetchImpl:fetch});
 applyUrlStatus(r,statuses);
 const by=u=>r.pages.find(p=>p.url===S+u);
 const old=by('/old-roof-repair/');
 assert.equal(old.action,'REDIRECT');
 assert.deepEqual({status:old.live.status,to:old.live.final_url,hops:old.live.hops,permanent:old.live.permanent},{status:301,to:S+'/roof-repair/',hops:1,permanent:true});
 assert.equal(old.live.target_rank,by('/roof-repair/').rank,'the target page in the list is named');
 assert.equal(old.click_gap,null,'no click gap for a URL that no longer exists as a page');
 const promo=by('/promo/');
 assert.equal(promo.action,'REDIRECT');assert.equal(promo.live.status,302);assert.equal(promo.live.permanent,false);assert.equal(promo.live.hops,2);
 const gone=by('/removed/');assert.equal(gone.action,'GONE');assert.equal(gone.live.status,404);
 const slow=by('/slow/');assert.notEqual(slow.action,'REDIRECT');assert.equal(slow.live.error,'FETCH_TIMEOUT');
 assert.equal(by('/roof-repair/').live.status,200);
 // Order: a gone page with impressions comes before review work; redirects after the content work.
 const rank=a=>Math.min(...r.pages.filter(p=>p.action===a).map(p=>p.rank));
 assert.ok(rank('GONE')<rank('REDIRECT'));
 assert.ok(r.pages.filter(p=>p.action==='QUICK_WIN').every(p=>p.rank<rank('GONE')));
 r.pages.forEach((p,i)=>assert.equal(p.rank,i+1));
 assert.deepEqual({redirects:r.kpis.redirects,gone:r.kpis.gone,not_checked:r.kpis.urls_not_checked,checked:r.kpis.urls_checked},{redirects:2,gone:1,not_checked:1,checked:7});
});

test('the check is bounded, only public https URLs are requested, and without a check nothing changes',async()=>{
 const fetch=fakeFetch({});
 const urls=['http://acme.example/a/',...Array.from({length:12},(_,i)=>S+'/p'+i+'/')];
 const st=await checkUrlStatuses(urls,{fetchImpl:fetch,max:5});
 assert.equal(fetch.calls.length,5);
 assert.ok(!fetch.calls.includes('http://acme.example/a/'));
 assert.equal(st.get('http://acme.example/a/').error,'NOT_HTTPS');
 assert.equal(st.get(S+'/p11/').error,'NOT_CHECKED_LIMIT');
 const r=analyze({uploads:uploads()}),before=JSON.stringify(r.pages.map(p=>[p.url,p.action,p.rank]));
 applyUrlStatus(r,null);
 assert.equal(JSON.stringify(r.pages.map(p=>[p.url,p.action,p.rank])),before);
 assert.equal(r.kpis.redirects,undefined);
});

test('the shared report shows the 301 and where it goes, in the recipient language',async t=>{
 const rows=[];const storage={ensureTables:async()=>{},createReport:async(_p,o)=>{const r={id:1,token:'tok1'.padEnd(30,'x'),...o,created_at:new Date(),expires_at:new Date(Date.now()+864e5),views:0,growth_invite:null};rows.push(r);return r},
  openReport:async(_p,tk)=>rows.find(x=>x.token===tk)||null,listReports:async()=>rows,revokeReport:async()=>null,createInvite:async()=>({token:'x'})};
 const KEY='owner-admin-key-0123456789',fetch=fakeFetch(MAP);
 const app=express();app.use(express.json({limit:'10mb'}));
 registerGscReport(app,null,{storage,checkUrls:urls=>checkUrlStatuses(urls,{fetchImpl:fetch}),config:{adminKey:KEY,brand:'ContentScale'}});
 const srv=app.listen(0);t.after(()=>srv.close());const base='http://127.0.0.1:'+srv.address().port;
 const post=b=>globalThis.fetch(base+'/api/gsc/reports',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':KEY},
  body:JSON.stringify({title:'Acme',lang:'nl',files:[{name:'Pages.csv',content_base64:Buffer.from(pages).toString('base64')}],...b})}).then(r=>r.json());
 const made=await post({});assert.equal(made.success,true);
 const html=await (await globalThis.fetch(base+made.url)).text()+await (await globalThis.fetch(base+made.url+'?view=all')).text();
 assert.match(html,/Doorverwezen \(301\)/);
 assert.match(html,/\/roof-repair\//);
 assert.match(html,/Tijdelijk doorverwezen \(302\)/);
 assert.match(html,/Pagina bestaat niet meer \(404\)/);
 assert.match(html,/Niet gecontroleerd/);
 // Off: no request to the site.
 rows.length=0;fetch.calls.length=0;
 const off=await post({check_urls:false});assert.equal(off.success,true);
 assert.equal(fetch.calls.filter(u=>u.startsWith(S)).length,0);
 assert.doesNotMatch(await (await globalThis.fetch(base+off.url)).text(),/Doorverwezen/);
});
