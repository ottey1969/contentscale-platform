'use strict';
// Execute ONLY the two real route-handler bodies, extracted from canonical src/index.js.
// Never require/import the app. Uses fake state in memory: no Neon, email, scans, AI, or publishing.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
function route(routePath,pool) {
  const marker="app.patch('"+routePath+"', async (req, res) => {";
  const start=source.indexOf(marker);
  assert.ok(start>=0,'Canonical route missing: '+routePath);
  assert.equal(source.indexOf(marker,start+1),-1,'Duplicate canonical route: '+routePath);
  const end=source.indexOf('\n});',start);
  assert.ok(end>start && end-start<8000,'Unexpected route boundary: '+routePath);
  let handler;
  const app={patch(p,fn){assert.equal(p,routePath);handler=fn;}};
  vm.runInNewContext(source.slice(start,end+4),{app,pool},{timeout:1500});
  assert.equal(typeof handler,'function');
  return handler;
}
async function call(handler,{token='owner',pageId=10,body={manual_done:true}}={}) {
  const res={
    statusCode:200,payload:null,
    status(n){this.statusCode=n;return this;},
    json(data){this.payload=JSON.parse(JSON.stringify(data));return this;}
  };
  await handler({params:{token,pageId},body},res);
  assert.ok(res.payload,'Route gave no response');
  return res;
}
class FakePool {
  constructor(){
    this.clients=[{id:1,token:'owner',status:'active'},{id:2,token:'other',status:'active'},{id:3,token:'removed',status:'deleted'}];
    this.pages=[{id:10,tracker_client_id:1,is_active:true,manual_done:false,manual_done_at:null},
                {id:11,tracker_client_id:1,is_active:false,manual_done:false,manual_done_at:null},
                {id:20,tracker_client_id:2,is_active:true,manual_done:false,manual_done_at:null}];
    this.writes=[];
  }
  async query(sql,args=[]) {
    if(/^SELECT id FROM tracker_clients WHERE token=\$1/.test(sql)) {
      const c=this.clients.find(c=>c.token===args[0]&&c.status!=='deleted'&&(!sql.includes("NOT IN")||!['paused','disabled'].includes(c.status)));
      return {rows:c?[{id:c.id}]:[]};
    }
    if(/^SELECT id FROM tracker_pages WHERE id=\$1 AND tracker_client_id=\$2/.test(sql)) {
      const p=this.pages.find(p=>String(p.id)===String(args[0])&&p.tracker_client_id===args[1]);
      return {rows:p?[{id:p.id}]:[]};
    }
    if(/^UPDATE tracker_pages SET manual_done=\$1, manual_done_at=/.test(sql) || sql.startsWith('WITH changed AS (')){
      const bulk=sql.includes('WHERE tracker_client_id=$2');
      if(sql.startsWith('WITH changed AS ('))assert.match(sql,/INSERT INTO tracker_workflow_events/);
      const match=(bulk?
        this.pages.filter(p=>p.tracker_client_id===args[1]&&p.is_active===true):
        this.pages.filter(p=>String(p.id)===String(args[1])&&(!sql.includes('AND tracker_client_id=$3')||p.tracker_client_id===args[2])))
        .filter(p=>!sql.includes('manual_done IS DISTINCT FROM $1')||p.manual_done!==args[0]);
      for(const p of match){p.manual_done=args[0];p.manual_done_at=args[0]?'test-timestamp-'+(this.writes.length+1):null;}
      if(match.length)this.writes.push({bulk,affected:match.map(p=>p.id)});
      return {rowCount:match.length,rows:bulk?[{changed_count:match.length}]:match.map(p=>({tracker_page_id:p.id}))};
    }
    throw new Error('Unexpected query in isolated canonical handler: '+sql.slice(0,100));
  }
}
const single='/api/tracker-client/:token/pages/:pageId/manual-done';
const bulk='/api/tracker-client/:token/pages/manual-done-all';
test('canonical single-page checkbox can be saved, read from store, and explicitly undone',async()=>{
 const pool=new FakePool(),handler=route(single,pool);
 assert.equal((await call(handler)).payload.manual_done,true);
 assert.equal(pool.pages[0].manual_done,true);
 assert.ok(pool.pages[0].manual_done_at);
 assert.equal((await call(handler,{body:{manual_done:false}})).payload.manual_done,false);
 assert.equal(pool.pages[0].manual_done,false);
 assert.equal(pool.pages[0].manual_done_at,null);
});
test('canonical handler refuses wrong-owner pages before any write',async()=>{
 const pool=new FakePool(),handler=route(single,pool);
 const result=await call(handler,{token:'owner',pageId:20});
 assert.equal(result.statusCode,403);
 assert.equal(pool.writes.length,0);
 assert.equal(pool.pages[2].manual_done,false);
});
test('canonical handler refuses unknown or deleted client tokens',async()=>{
 const pool=new FakePool(),handler=route(single,pool);
 for(const token of ['bad','removed']) assert.equal((await call(handler,{token})).statusCode,404);
 assert.equal(pool.writes.length,0);
});
test('repeated clicks preserve timestamp once the canonical idempotency guard is deployed',async()=>{
 const pool=new FakePool(),handler=route(single,pool);
 await call(handler);
 const old=pool.pages[0].manual_done_at;
 await call(handler);
 assert.equal(pool.pages[0].manual_done,true);
 if(source.includes('manual_done IS DISTINCT FROM $1')){
   assert.equal(pool.writes.length,1);
   assert.equal(pool.pages[0].manual_done_at,old);
 }else{
   // Before staging deployment: retain detection, never mistake this for desired behavior.
   assert.equal(pool.writes.length,2);
   assert.notEqual(pool.pages[0].manual_done_at,old);
 }
});
test('bulk checkbox only changes active pages owned by requesting Tracker client',async()=>{
 const pool=new FakePool(),handler=route(bulk,pool);
 const result=await call(handler);
 assert.equal(result.statusCode,200);
 assert.equal(result.payload.updated,1);
 assert.equal(pool.pages[0].manual_done,true);
 assert.equal(pool.pages[1].manual_done,false);
 assert.equal(pool.pages[2].manual_done,false);
});
test('bulk handler denies invalid client identity with no mutations',async()=>{
 const pool=new FakePool(),handler=route(bulk,pool);
 assert.equal((await call(handler,{token:'bad'})).statusCode,404);
 assert.equal(pool.writes.length,0);
});
test('canonical GET is NOT yet pure/read-only and new event tables have no direct main-entrypoint wiring',()=>{
 const marker="app.get('/api/tracker-client/:token', async (req, res) => {";
 const pos=source.indexOf(marker);
 assert.ok(pos>0);
 const fragment=source.slice(pos,pos+30000);
 if(fragment.includes('migration_required:true')){
   assert.doesNotMatch(fragment,/ALTER TABLE tracker_clients/);
   assert.doesNotMatch(fragment,/ALTER TABLE tracker_pages/);
 }else{
   // Before read-only GET promotion, document the original migration-on-read problem.
   assert.match(fragment,/ALTER TABLE tracker_clients/);
   assert.match(fragment,/ALTER TABLE tracker_pages/);
 }
 const pageAndClientEvents=source.includes('INSERT INTO tracker_workflow_events');
 if(pageAndClientEvents){
   assert.match(source,/INSERT INTO tracker_workflow_client_events/);
   // Sitemap events belong to the canonical sitemap workflow, not manual-done toggles.
   assert.equal(source.includes('tracker_workflow_sitemap_events'),false);
 }else{
   for(const name of ['tracker_workflow_events','tracker_workflow_client_events','tracker_workflow_sitemap_events']){
     assert.equal(source.includes(name),false,'Unexpected partial event integration: '+name);
   }
 }
});
