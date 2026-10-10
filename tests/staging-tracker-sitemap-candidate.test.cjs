'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.SITEMAP_CANDIDATE_FILE||'/tmp/contentscale-sitemap-candidate.js','utf8');
const head="async function _trackerFetchAndSaveSitemap(req, res, persist) {";
const at=source.indexOf(head),end=source.indexOf("\n}\napp.get('/api/tracker-client/:token/fetch-sitemap'",at);
assert(at>0&&end>at&&end-at<6000);
const helper=source.slice(at,end+2);
const sitemap='<urlset><url><loc>https://example.test/article</loc></url><url><loc>https://other.test/private</loc></url><url><loc>https://example.test/img.png</loc></url></urlset>';
function makeFake(status='active'){
 const events=new Set(),queries=[],fetched=[];
 const db={queries,events,async query(sql,args=[]){
  queries.push(sql);
  if(sql.startsWith('SELECT domain,status FROM tracker_clients'))return {rows:[{domain:'example.test',status}]};
  assert.match(sql,/WITH event AS \(/);
  assert.match(sql,/INSERT INTO tracker_workflow_sitemap_events/);
  assert.match(sql,/UPDATE tracker_clients/);
  assert.match(sql,/ON CONFLICT/);
  assert.match(args[3],/^[a-f0-9]{64}$/);
  assert.match(args[4],/^sitemap:v1:[a-f0-9]{64}$/);
  const existed=events.has(args[4]);events.add(args[4]);
  return {rowCount:existed?0:1,rows:existed?[]:[{id:1}]};
 }};
 const response=async()=>({ok:true,arrayBuffer:async()=>Buffer.from(sitemap,'utf8')});
 const context={pool:db,require,URL,AbortController,Buffer,Set,JSON,console,fetch:async(u,options)=>{fetched.push({u,options});return response();},setTimeout,clearTimeout};
 vm.runInNewContext(helper+';globalThis.callShared=_trackerFetchAndSaveSitemap;',context,{timeout:2000});
 return {db,fetched,handler:context.callShared};
}
async function call(fn,method,url='https://example.test/sitemap.xml'){
 const r={statusCode:200,data:null,status(n){this.statusCode=n;return this;},json(v){this.data=JSON.parse(JSON.stringify(v));return this;}};
 await fn({method,params:{token:'owner'},query:{url},body:{url}},r,method==='POST');
 assert(r.data);return r;
}
test('GET fetches same-domain pages but never persists sitemap',async()=>{
 const f=makeFake();const r=await call(f.handler,'GET');
 assert.equal(r.statusCode,200);
 assert.equal(r.data.persisted,false);
 assert.deepEqual(r.data.urls,['https://example.test/article']);
 assert.equal(f.db.queries.length,1);
 assert.equal(f.db.events.size,0);
});
test('explicit POST saves a hashed snapshot once, duplicate POST does no second update',async()=>{
 const f=makeFake();
 const first=await call(f.handler,'POST');const again=await call(f.handler,'POST');
 assert.equal(first.statusCode,200);
 assert.equal(first.data.persisted,true);
 assert.equal(again.data.persisted,false);
 assert.equal(f.db.events.size,1);
 assert.equal(f.db.queries.length,4);
});
test('reject unrelated sitemap hosts before any fetch or writes',async()=>{
 const f=makeFake(),r=await call(f.handler,'POST','https://another.test/sitemap.xml');
 assert.equal(r.statusCode,400);
 assert.equal(f.fetched.length,0);
 assert.equal(f.db.events.size,0);
});
test('paused or disabled Tracker clients may not mutate sitemap cache',async()=>{
 for(const status of ['paused','disabled']){
  const f=makeFake(status),r=await call(f.handler,'POST');
  assert.equal(r.statusCode,403);
  assert.equal(f.fetched.length,0);
  assert.equal(f.db.events.size,0);
 }
});
