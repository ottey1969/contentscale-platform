'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.PATCHED_GET||'/tmp/contentscale-readonly-get-candidate.js','utf8');
const marker="app.get('/api/tracker-client/:token', async (req, res) => {";
const at=source.indexOf(marker),close=source.indexOf('\n});',at);
assert(at>=0&&close-at>10000&&close-at<45000);
const body=source.slice(at,close+4);
const begin=body.indexOf('const _trackerMainGetColumns = [');
const end=body.indexOf('];',begin);
assert(begin>=0&&end>begin);
const cols=[...body.slice(begin,end).matchAll(/\['([^']+)','[^']+'\]/g)].map(m=>m[1]);
assert(cols.length>=20,'schema fields not found');
function fakePool({missingColumn=false,missingTable=false,clientFound=true,onePage=false}={}){
 const calls=[];
 return {calls,async query(sql,args=[]){
  calls.push(sql);
  assert.match(sql.trim(),/^SELECT\b/i,'A GET attempted a write');
  if(sql.includes("SELECT * FROM tracker_clients WHERE token="))return {rows:clientFound?[{id:1,domain:'example.test',name:'Example',status:'active',max_pages:3,email:'test@example.test'}]:[]};
  if(sql.includes('information_schema.columns'))return {rows:cols.slice(missingColumn?1:0).map(column_name=>({column_name}))};
  if(sql.includes('information_schema.tables'))return {rows:(missingTable?args[0].slice(1):args[0]).map(table_name=>({table_name}))};
  if(onePage&&sql.includes('FROM tracker_pages p')&&sql.includes('LEFT JOIN LATERAL'))return {rows:[{id:10,url:'https://example.test/page',keyword:'example',manual_done:true,manual_done_at:'2026-10-01T12:00:00Z',is_done:false,revision_cycle:1,ai_manual_evidence:{},brief_content:{items:[],outstanding_actions:0},implementation_status:'pending',treatment_source:'MANUAL',created_at:'2026-10-01T12:00:00Z'}]};
  return {rows:[]};
 }};
}
function makeHandler(pool){
 let handler;
 const app={get(_p,fn){assert.equal(_p,'/api/tracker-client/:token');handler=fn;}};
 const context={app,pool,console:{warn(){},log(){},error(...a){throw new Error('canonical GET error: '+String(a.map(String).join(' ')))}},setTimeout(){},clearTimeout(){},URL,Buffer,Date,Map,Set,Math,Number,JSON, _trackerNormalizeBriefQueues:(v)=>({changed:false,brief:v}),_trackerReparseManualEvidenceMap:(v)=>v,_caseStudyNormUrl:(u)=>u};
 vm.runInNewContext(body,context,{timeout:2500});
 return handler;
}
async function call(handler){
 const res={statusCode:200,data:null,status(n){this.statusCode=n;return this;},json(v){this.data=JSON.parse(JSON.stringify(v));return this;}};
 await handler({params:{token:'test'},query:{}},res);
 return res;
}
test('canonical GET candidate returns explicit 404 for missing token without writes',async()=>{
 const pool=fakePool({clientFound:false});
 const result=await call(makeHandler(pool));
 assert.equal(result.statusCode,404);
 assert(pool.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});
test('canonical GET candidate returns 503 for missing schema without ALTER/UPDATE',async()=>{
 const pool=fakePool({missingColumn:true});
 const result=await call(makeHandler(pool));
 assert.equal(result.statusCode,503);
 assert.equal(result.data.migration_required,true);
 assert(result.data.missing_columns.length>=1);
 assert(pool.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});
test('canonical GET candidate identifies missing case-study tables without executing migrations',async()=>{
 const pool=fakePool({missingTable:true});
 const result=await call(makeHandler(pool));
 assert.equal(result.statusCode,503);
 assert.equal(result.data.missing_tables.length,1);
 assert(pool.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});
test('GET read-only candidate contains no implicit mutating helper invocation',()=>{
 const forbidden=[/\bALTER TABLE\b/i,/\bUPDATE tracker_pages\b/i,/\bINSERT INTO migration_flags\b/i,/\bawait _ensureCaseStudySchema\b/,/\bawait _caseStudyEventForPage\b/];
 for(const regex of forbidden)assert.doesNotMatch(body,regex);
});

test('canonical GET candidate returns successful empty Tracker response without writes',async()=>{
 const pool=fakePool();
 const result=await call(makeHandler(pool));
 assert.equal(result.statusCode,200,JSON.stringify(result.data));
 assert.equal(result.data.success,true);
 assert(pool.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});

test('canonical GET candidate displays persisted page state without writes',async()=>{
 const pool=fakePool({onePage:true});
 const result=await call(makeHandler(pool));
 assert.equal(result.statusCode,200,JSON.stringify(result.data));
 assert.equal(result.data.success,true);
 assert(pool.calls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});
