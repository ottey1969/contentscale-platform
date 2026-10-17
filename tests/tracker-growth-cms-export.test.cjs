'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {registerTrackerGrowthCmsExport}=require('../src/tracker-growth-cms-export.cjs');
const source='<article><h1>Roofing</h1><p>Useful original text.</p></article>';
const url='https://roofer.example/roof-repair/';
const page={id:12,url,html_content:source,keyword:'roof repair',case_study_active:false};
let caseLock=false,duplicates=false,sourceMissing=false,crossDomain=false,writes=0;
const pool={async query(sql,args=[]){
 if(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(sql)){writes++;throw Error('No DB writes permitted')}
 if(sql.includes('FROM tracker_clients'))return {rows:args[0]==='owner-token'?[{id:7,domain:'roofer.example',token:'owner-token',status:'active'}]:[]};
 if(sql.includes('FROM tracker_pages p'))return {rows:[{...page,url:crossDomain?'https://unrelated.example/private/':url,
  html_content:sourceMissing?null:source,case_study_active:caseLock}]};
 if(sql.includes('FROM tracker_pages WHERE url=')){
  assert.match(sql,/AND tracker_client_id=\$2/,'Duplicate identity must be per client, never global');
  assert.equal(args[1],7);
  return {rows:duplicates?[{id:12,tracker_client_id:7},{id:99,tracker_client_id:7}]:[{id:12,tracker_client_id:7}]};
 }
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:[]};
 throw Error('Unexpected SQL: '+sql.slice(0,90));
}};
const routes={};
registerTrackerGrowthCmsExport({get(p,fn){routes['GET '+p]=fn},post(p,fn){routes['POST '+p]=fn}},pool);
const root='/api/tracker-client/:token/growth/cms-export';
async function run(method,endpoint,token,body={},query={}){
 const req={params:{token},query,body};
 const res={code:200,headers:{},status(c){this.code=c;return this},type(v){this.mime=v;return this},
  set(k,v){this.headers[k]=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}};
 await routes[method+' '+endpoint](req,res);return res;
}
(async()=>{
 const src=await run('GET',root+'/source','owner-token',{}, {page_id:'12'});
 assert.equal(src.code,200);
 assert.equal(src.body.gsc_required,false);
 assert.match(src.body.source_sha256,/^[a-f0-9]{64}$/);
 const screen=await run('GET','/track/:token/growth/cms-export','owner-token',{}, {page_id:'12'});
 assert.equal(screen.code,200);
 assert(screen.body.includes('Wix'));
 assert(screen.body.includes('editor'));
 assert.equal(screen.headers['X-Robots-Tag'],'noindex, nofollow');
 const payload={page_id:12,source_sha256:src.body.source_sha256,cms:'wix',editor_approved:true,
  evidence_scope:'needs_access',seo_title:'Roof Repair Options in NJ | Example',
  meta_description:'Information on existing roof repair options and inspections. Verify every service detail before publishing.',
  approved_changes:[{approved:true,evidence_ref:'observed:editor-review',
   html:'<section><h2>Roof repair inspection steps</h2><p>Check flashing, roof edges and drainage carefully. Confirm actual availability directly with the business.</p></section>'}]};
 let res=await run('POST',root,'owner-token',payload);
 assert.equal(res.code,200,JSON.stringify(res.body));
 assert.equal(res.body.manifest.cms,'wix');
 assert.equal(res.body.publication_allowed,false);
 assert.equal(res.body.no_external_paid_service_required,true);
 assert.equal(res.body.files.length,6);
 res=await run('POST',root,'owner-token',{...payload,format:'zip'});
 assert.equal(res.code,200);
 assert(Buffer.isBuffer(res.body));
 assert.equal(res.body.readUInt32LE(0),0x04034b50);
 assert.equal(res.body.readUInt16LE(res.body.length-22+10),6);
 assert.equal((await run('GET',root+'/source','share-token',{}, {page_id:'12'})).code,403);
 assert.equal((await run('POST',root,'share-token',payload)).code,403);
 assert.equal((await run('POST',root,'owner-token',{...payload,editor_approved:false})).code,409);
 assert.equal((await run('POST',root,'owner-token',{...payload,source_sha256:'0'.repeat(64)})).code,409);
 assert.equal((await run('POST',root,'owner-token',{...payload,evidence_scope:'verified',focus_query:'unverified query'})).code,409);
 caseLock=true;assert.equal((await run('POST',root,'owner-token',payload)).code,409);caseLock=false;
 duplicates=true;assert.equal((await run('POST',root,'owner-token',payload)).code,409);duplicates=false;
 sourceMissing=true;assert.equal((await run('POST',root,'owner-token',payload)).code,409);sourceMissing=false;
 crossDomain=true;assert.equal((await run('POST',root,'owner-token',payload)).code,403);crossDomain=false;
 assert.equal(writes,0);
 const ui=fs.readFileSync(path.resolve(__dirname,'../public/growth-cms-neutral-handoff.js'),'utf8');
 assert(ui.includes('editor_approved:true'));
 assert(!ui.includes('wp-json'));
 assert(!ui.includes('openai.com'));
 console.log('PASS CMS-neutral Growth handoff: Wix ZIP, source revision, no GSC required, no paid API, no site/DB writes, owner-only, protected Case Studies');
})().catch(e=>{console.error(e);process.exitCode=1});
