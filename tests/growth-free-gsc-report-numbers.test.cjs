'use strict';
// Owner 2026-11-22: a page opened in Free Growth from a GSC report must never show "Before: no export yet, upload an export":
// the report already holds Search Console numbers for that page. They are taken over (and the report's newer period as
// "after"), only for checks linked to the report or its own invitation. A real upload still wins.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {reportUploadsFor}=require('../src/growth-free/gsc-report-numbers.cjs');
const {compareUploads}=require('../src/growth-free/reminders.cjs');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
const URL_='https://nl.contentscale.site/wat-is-een-ai-overview/';
const report={site:'nl.contentscale.site',kpis:{period:{start:'2026-10-24',end:'2026-11-20',days:28}},
 pages:[{url:URL_,clicks:0,impressions:1227,position:64.2,queries:[{query:'wat is een ai overview',clicks:0,impressions:300,position:70}]}],
 after:{period:{start:'2026-11-23',end:'2026-12-20',days:28},pages:[{url:URL_,clicks:2,impressions:1610,position:41}]}};
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const pool=(rows,{boundCheck=null,invitation=null}={})=>({calls:[],async query(sql,[checkId,inviteId,url]){
 this.calls.push(sql);
 assert.match(sql,/u\.gsc_report_id=r\.id/);
 assert.match(sql,/i\.revoked_at IS NULL/);
 return {rows:rows.filter(r=>(boundCheck&&checkId===boundCheck&&url===URL_)||
  (invitation&&inviteId===invitation.id&&r.growth_invite&&hash(r.growth_invite)===invitation.hash))};
}});

test('linked check: the report page numbers become "before", the newer period "after"',async()=>{
 const p=pool([{id:1,title:'nl.contentscale.site — november',growth_invite:null,report}],{boundCheck:4});
 const ups=await reportUploadsFor(p,{url:URL_,checkId:4});
 assert.equal(ups.length,2);
 const b=ups.find(u=>u.period_end==='2026-11-20');
 assert.deepEqual([b.status,b.source,b.totals.clicks,b.totals.impressions,b.totals.position],['VERIFIED_FOR_PAGE','GSC_REPORT',0,1227,64.2]);
 assert.equal(b.report_title,'nl.contentscale.site — november');assert.equal(b.queries[0].query,'wat is een ai overview');
 const c=compareUploads(ups,'2026-11-22','wat is een ai overview');
 assert.equal(c.before.source,'GSC_REPORT');assert.equal(c.before.totals.impressions,1227);assert.equal(c.before.search_term_row.impressions,300);
 assert.equal(c.after.source,'GSC_REPORT');assert.equal(c.after.totals.clicks,2);assert.equal(c.ready,true);
 // A real upload for the same side wins over the report.
 const real={status:'VERIFIED_FOR_PAGE',period_start:'2026-10-25',period_end:'2026-11-21',totals:{clicks:1,impressions:99},queries:[],file_name:'x.zip'};
 assert.equal(compareUploads([...ups,real],'2026-11-22','').before.file_name,'x.zip');
});
test('only the linked check or the report invitation; other checks and other pages get nothing',async()=>{
 const rows=[{id:1,title:'r',growth_invite:'inv-token-1',report}];
 const p=pool(rows,{boundCheck:4,invitation:{id:7,hash:hash('inv-token-1')}});
 assert.equal((await reportUploadsFor(p,{url:URL_,inviteId:7})).length,2,'through the report invitation');
 assert.equal((await reportUploadsFor(p,{url:URL_,inviteId:8})).length,0,'another invitation');
 assert.equal((await reportUploadsFor(p,{url:URL_,checkId:5})).length,0,'a check without an explicit link');
 assert.equal((await reportUploadsFor(p,{url:'https://nl.contentscale.site/andere/',checkId:4})).length,0,'another page');
 assert.equal((await reportUploadsFor(p,{url:URL_.slice(0,-1),inviteId:7})).length,0,'slash variant');
 assert.equal((await reportUploadsFor({query:async()=>{throw Error('relation "gsc_reports" does not exist')}},{url:URL_,checkId:4})).length,0,'no report tables');
});
test('the page says where the numbers come from, in Dutch and Spanish too',()=>{
 const ui=require('node:fs').readFileSync(require.resolve('../src/growth-free/routes.cjs'),'utf8');
 assert.match(ui,/x\.source==='GSC_REPORT'/);assert.match(ui,/reportUploadsFor/);
 for(const k of ['From your GSC report {q}','Before and after in Google (Search Console)','Upload an export for {t} – {t}, filtered on exactly this page.',
  'Search Console numbers for this exact page, 4 weeks before and after the update. A change is not proof that the update caused it.']){
  const row=ROWS.find(r=>r[0]===k);assert.ok(row,k);assert.ok(row[1]&&row[2],k)}
});
