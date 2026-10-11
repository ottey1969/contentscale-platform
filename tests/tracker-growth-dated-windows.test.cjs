'use strict';
const assert=require('node:assert/strict');
const {windowDates,compareDatedWindows,validateWindowInput}=require('../src/tracker-growth-measurement.cjs');
const pub={id:13,tracker_page_id:23,query:'ai citation tracker',published_at:'2026-08-01T09:00:00Z'};
const now=new Date('2026-10-12T15:00:00Z');
const w=windowDates(pub.published_at);
assert.deepEqual(w,{before:{start:'2026-07-04',end:'2026-07-31'},after:{start:'2026-08-02',end:'2026-08-29'}});
let r=compareDatedWindows(pub,[],now);assert.equal(r.measured_click_change,null);
const observations=[{publication_id:13,period:'before',start_date:w.before.start,end_date:w.before.end,clicks:8,impressions:400},{publication_id:13,period:'after',start_date:w.after.start,end_date:w.after.end,clicks:22,impressions:550}];
r=compareDatedWindows(pub,observations,now);
assert.equal(r.measured_click_change,14);assert.equal(r.measured_impression_change,150);assert.equal(r.measurement_status,'COMPARABLE_USER_PROVIDED_GSC');
r=compareDatedWindows(pub,observations.map(o=>({...o,start_date:'2026-08-01'})),now);assert.equal(r.measured_click_change,null);
const input={period:'after',start_date:w.after.start,end_date:w.after.end,clicks:22,impressions:550,source:'gsc_page_query_export',query:pub.query};
assert.equal(validateWindowInput(input,pub,now),null);
assert.ok(validateWindowInput({...input,end_date:'2026-08-30'},pub,now));
assert.ok(validateWindowInput({...input,query:'other'},pub,now));
assert.ok(validateWindowInput({...input,clicks:600},pub,now));
assert.equal(compareDatedWindows({...pub,published_at:'2026-10-01T00:00:00Z'},observations,now).measurement_status,'WAITING_FOR_28_DAYS');
// Execute the actual API guard: protected Case Studies may never accept supplied GSC values.
let post,writeCount=0,caseLocked=true;
const {registerGrowthMeasurement}=require('../src/tracker-growth-measurement.cjs');
registerGrowthMeasurement({
 get(){}, post(path,fn){if(path.endsWith('/window'))post=fn;}
},{query:async(sql)=>{
 const stmt=String(sql);
 if(stmt.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site'}]};
 if(stmt.includes('FROM tracker_growth_publications'))return {rows:[{...pub,url:'https://contentscale.site/ai-citations/',tracker_page_id:23}]};
 if(stmt.includes('FROM tracker_case_studies'))return {rows:caseLocked?[{id:1}]:[]};
 if(stmt.startsWith('CREATE TABLE')||stmt.startsWith('INSERT INTO')){writeCount++;return {rows:[]}};
 throw Error('unexpected SQL: '+stmt.slice(0,100));
}});
(async()=>{
 const response={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.data=v;return v}};
 await post({params:{token:'token'},body:{publication_id:13,...input}},response);
 assert.equal(response.statusCode,409);
 assert.equal(writeCount,0);
 console.log('PASS locked Case Study cannot accept growth-window inputs');
})().catch(e=>{console.error(e);process.exitCode=1});
console.log('PASS equal dated 28-day GSC comparisons, no invented uplift, strict query and time checks');
