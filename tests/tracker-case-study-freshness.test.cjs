'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf("app.get('/case-study-report/:reportToken'");
const b=s.indexOf('// PATCH /api/tracker-client/:token/pages/:pageId/frequency',a);
assert(a>0&&b>a&&b-a<14000,'Canonical share report route moved');
const route=s.slice(a,b);
async function render(current,reportAt='2026-10-10T12:33:50Z'){
 let handler;
 const row={domain:'perfectroofingteam.com',client_name:'Perfect Roofing Team',canonical_url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',primary_query:'24 hour emergency roof repair nj',
  baseline_at:'2026-09-09T16:54:00Z',event_at:reportAt,event_data:{generated_at:reportAt,baseline:{gsc_clicks:2,gsc_impressions:5754},current}};
 const ctx={app:{get(_route,fn){handler=fn}},pool:{query:async()=>({rows:[row]})},
  _trackerCaseStudyReadonlySchema:async()=>({ready:true}),Date,Number,String,Object,JSON,console};
 vm.runInNewContext(route,ctx,{timeout:2000});
 const res={statusCode:200,status(n){this.statusCode=n;return this},set(){return this},type(){return this},send(html){this.html=html;return html}};
 await handler({params:{reportToken:'a'.repeat(48)}},res);
 assert.equal(res.statusCode,200);return res.html;
}
(async()=>{
 const stale=await render({at:'2026-09-24T17:32:00Z',gsc_clicks:2,gsc_impressions:6302,gsc_position:41.6});
 assert.match(stale,/Evidence freshness:/);
 assert.match(stale,/not a verified fresh Day-30 GSC measurement/);
 assert.match(stale,/2026-09-24/);
 assert.match(stale,/2026-10-10/);
 assert.match(stale,/6302/,'Historical numbers remain visible and unmodified');
 const current=await render({at:'2026-10-09T17:32:00Z',gsc_data_at:'2026-10-09T17:32:00Z',gsc_clicks:12,gsc_impressions:7000});
 assert.match(current,/within seven days/);
 assert.doesNotMatch(current,/not a verified fresh Day-30 GSC measurement/);
 console.log('PASS historical 30-day report transparent about stale observation and no fabricated GSC refresh');
})().catch(e=>{console.error(e);process.exitCode=1});
