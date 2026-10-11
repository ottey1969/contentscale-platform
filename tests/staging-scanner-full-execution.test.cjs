'use strict';
// Run the actual canonical scanner body with synthetic HTML and wholly mocked IO.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const s=fs.readFileSync(file,'utf8');
const a=s.indexOf('async function runTrackerCheck('),b=s.indexOf('\n// ── Custom news management',a);
assert(a>0&&b>a&&b-a<350000,'Canonical scanner bounds changed: manual review needed');
const scanner=s.slice(a,b);
const required=['tracker_snapshots.gsc_brief','tracker_snapshots.source_suggestions','tracker_snapshots.author_trust_score','tracker_snapshots.author_trust_findings','tracker_snapshots.discovered_sources','tracker_pages.brief_check_count','tracker_pages.brief_content','tracker_pages.brief_started_at'];
const html='<html><body>'+('<p>Unique synthetic content for safe isolated manual scan. </p>'.repeat(25))+'</body></html>';
function fixture(schemaComplete=true,keyword=''){
 const state={writes:[],reads:[],fetches:[],steps:[],mails:0,snapshots:[],intervals:0,nextScheduled:false};
 const pool={async query(text,params=[]){
  const sql=String(text).trim();
  if(/^\s*(ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i.test(sql))throw Error('SCANNER DDL FORBIDDEN: '+sql);
  if(/^(UPDATE|INSERT|DELETE)\b/i.test(sql))state.writes.push(sql);else state.reads.push(sql);
  if(sql.includes('FROM information_schema.columns')){
   return {rows:(schemaComplete?required:required.slice(0,-1)).map(v=>({table_name:v.split('.')[0],column_name:v.split('.')[1]}))};
  }
  if(/^INSERT INTO tracker_snapshots/.test(sql)){state.snapshots.push(params);return {rows:[{id:101}],rowCount:1};}
  if(/^SELECT brief_content, COALESCE\(brief_check_count/.test(sql))return {rows:[{brief_content:null,brief_check_count:0}]};
  if(/^SELECT/.test(sql))return {rows:[]};
  if(/^(UPDATE|INSERT)\b/i.test(sql)){
   if(/next_check_at\s*=\s*NOW\s*\(/i.test(sql))state.nextScheduled=true;
   return {rows:[],rowCount:1};
  }
  throw Error('Unexpected SQL: '+sql.slice(0,120));
 }};
 const ctx={pool,Date,JSON,Buffer,Promise,URL,URLSearchParams,AbortSignal,require,
  setTimeout(){return 0},clearTimeout(){},setInterval(){state.intervals++;throw Error('Unexpected scheduler')},
  process:{env:{}},console:{log(){},warn(){},error(){}},
  fetch:async url=>{
    state.fetches.push(String(url));
    if(String(url)!=='https://fixtures.invalid/page')throw Error('EXTERNAL NETWORK FORBIDDEN: '+url);
    return {ok:true,status:200,url:String(url),text:async()=>html};
  },
  _trSetStep:(...args)=>state.steps.push(args),
  _canonicalContentScoreScan:async()=>({success:true,score:71,metrics:{accuracy:70},recommendations:[]}),
  _cacheGet:()=>null,_cacheSet:()=>{},_sseBroadcast:()=>{},_liveWallBroadcast:()=>{},
  discoverSourcesForClaims:async()=>[],
  notifyClient:async()=>{state.mails++;throw Error('EMAIL FORBIDDEN')},
  _trackerBuildFiveEngineEmailState:()=>[],_trackerFiveEngineEmailBlock:()=>'',authorTrustAnalyzeHtml:()=>({score:65,findings:[]}),
  CONTENTSCORE_SCANNER_VERSION:'synthetic-ci',
  CONTENTSCORE_SCORING_VERSION:'synthetic-ci',CONTENTSCORE_METHODOLOGY_UPDATED_AT:'2026-01-01',
  CONTENTSCALE_BUILD_ID:'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN'
 };
 vm.runInNewContext(scanner+'\nglobalThis.runScanner=runTrackerCheck;',ctx,{timeout:10000});
 const page={id:17,url:'https://fixtures.invalid/page',html_content:html,html_source:'manual',
  check_frequency:'0',tracker_client_id:3,keyword,brief_content:null,gsc_impressions:123,gsc_clicks:5,gsc_position:14};
 return {state,page,execute:()=>ctx.runScanner(page,'',{},false)};
}
test('missing schema fails before HTML fetch, DB write or email',async()=>{
 const f=fixture(false);await assert.rejects(f.execute(),/TRACKER SCAN BLOCKED: database schema is incomplete/);
 assert.equal(f.state.reads.length,1);assert.equal(f.state.writes.length,0);
 assert.equal(f.state.fetches.length,0);assert.equal(f.state.mails,0);
});
test('complete canonical manual scanner saves one snapshot with no DDL, external providers, emails or scheduling',async()=>{
 const f=fixture();await f.execute();
 assert.equal(f.state.snapshots.length,1);
 assert.deepEqual(f.state.fetches,['https://fixtures.invalid/page']);
 assert.equal(f.state.mails,0);assert.equal(f.state.intervals,0);
 assert.equal(f.state.nextScheduled,false);
 assert(f.state.writes.some(q=>/next_check_at=NULL/.test(q)),'Manual scan must leave next_check_at NULL');
 assert(f.state.steps.some(x=>x[1]==='save'&&x[2]==='done'),'Snapshot saved step missing');
 assert(f.state.steps.some(x=>x[1]==='complete'&&x[2]==='done'),'Scan completion step missing');
 assert.equal(f.page.gsc_impressions,123);
 assert.equal(f.page.gsc_clicks,5);
});
test('keyword scan saves an observation safely with no external provider keys',async()=>{
 const f=fixture(true,'consultor geo');
 await f.execute();
 assert.equal(f.state.snapshots.length,1);
 assert.deepEqual(f.state.fetches,['https://fixtures.invalid/page']);
 assert.equal(f.state.mails,0);
 assert.equal(f.state.nextScheduled,false);
});
test('scanner has no inline schema migrations or Case Study schema mutation helper',()=>{
 assert.doesNotMatch(scanner,/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i);
 assert.doesNotMatch(scanner,/_ensureCaseStudySchema\s*\(/);
 assert.match(scanner,/TRACKER SCAN BLOCKED: database schema is incomplete/);
});
