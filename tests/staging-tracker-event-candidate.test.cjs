'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync(process.env.EVENT_CANDIDATE_FILE||'/tmp/contentscale-event-candidate.js','utf8');
const endpoints=['/api/tracker-client/:token/pages/:pageId/manual-done','/api/tracker-client/:token/pages/manual-done-all'];
function handler(url,pool){
 const marker="app.patch('"+url+"', async (req, res) => {",from=text.indexOf(marker),to=text.indexOf('\n});',from);
 assert(from>=0&&to>from&&to-from<3500);
 let cb;vm.runInNewContext(text.slice(from,to+4),{app:{patch(path,fn){assert.equal(path,url);cb=fn;}},pool},{timeout:2000});
 return cb;
}
class Store{
 constructor(){
  this.clients=[{id:1,token:'owner',status:'active'},{id:2,token:'other',status:'active'},{id:3,token:'paused',status:'paused'}];
  this.pages=[{id:10,tracker_client_id:1,is_active:true,manual_done:false,manual_done_at:null},
              {id:11,tracker_client_id:1,is_active:false,manual_done:false,manual_done_at:null},
              {id:20,tracker_client_id:2,is_active:true,manual_done:false,manual_done_at:null}];
  this.pageEvents=[];this.clientEvents=[];this.failWrites=false;this.sequence=0;
 }
 async query(sql,args=[]){
  if(sql.startsWith('SELECT id FROM tracker_clients WHERE token=$1')){
   const c=this.clients.find(c=>c.token===args[0]&&!['paused','disabled','deleted'].includes(c.status));
   return {rows:c?[{id:c.id}]:[]};
  }
  if(sql.startsWith('SELECT id FROM tracker_pages WHERE id=$1')){
   const p=this.pages.find(p=>p.id===Number(args[0])&&p.tracker_client_id===args[1]);
   return {rows:p?[{id:p.id}]:[]};
  }
  assert.match(sql,/^WITH changed AS \(/);
  assert.match(sql,/INSERT INTO tracker_workflow_events/);
  assert.match(sql,/gen_random_uuid\(\)/);
  assert.match(sql,/ON CONFLICT/);
  assert.match(sql,/manual_done IS DISTINCT FROM \$1/);
  const bulk=sql.includes('page_logged AS (');
  if(bulk)assert.match(sql,/INSERT INTO tracker_workflow_client_events/);
  if(this.failWrites)throw Error('simulated transaction rejected');
  const selected=(bulk?this.pages.filter(p=>p.tracker_client_id===args[1]&&p.is_active):
    this.pages.filter(p=>p.id===Number(args[1])&&p.tracker_client_id===args[2]))
    .filter(p=>p.manual_done!==args[0]);
  for(const p of selected){
   p.manual_done=args[0];
   p.manual_done_at=args[0]?'T'+(++this.sequence):null;
   this.pageEvents.push({tracker_client_id:p.tracker_client_id,page_id:p.id,event_type:'manual_done_changed',done:p.manual_done});
  }
  if(bulk&&selected.length)this.clientEvents.push({tracker_client_id:args[1],event_type:'manual_done_bulk_changed',count:selected.length});
  if(bulk)return {rows:[{changed_count:selected.length}],rowCount:1};
  return {rows:selected.map(p=>({tracker_page_id:p.id})),rowCount:selected.length};
 }
}
async function call(fn,token='owner',id=10,on=true){
 const r={statusCode:200,data:null,status(n){this.statusCode=n;return this;},json(v){this.data=JSON.parse(JSON.stringify(v));return this;}};
 await fn({params:{token,pageId:id},body:{manual_done:on}},r);
 assert(r.data,'route did not respond');return r;
}
test('one status transition creates precisely one page event; duplicate stays no-op',async()=>{
 const db=new Store(),cb=handler(endpoints[0],db);
 await call(cb);const original=db.pages[0].manual_done_at;
 await call(cb);
 assert.equal(db.pageEvents.length,1);
 assert.equal(db.pages[0].manual_done_at,original);
 await call(cb,'owner',10,false);
 assert.equal(db.pageEvents.length,2);
 assert.equal(db.pages[0].manual_done_at,null);
 assert.equal(db.clientEvents.length,0);
});
test('bulk transition emits one event per changed active page and one client event',async()=>{
 const db=new Store(),cb=handler(endpoints[1],db);
 const a=await call(cb);assert.equal(a.data.updated,1);
 const b=await call(cb);assert.equal(b.data.updated,0);
 assert.equal(db.pageEvents.length,1);
 assert.equal(db.clientEvents.length,1);
 assert.equal(db.clientEvents[0].count,1);
 assert.equal(db.pages[1].manual_done,false);
 assert.equal(db.pages[2].manual_done,false);
});
test('wrong owner, blocked client, and missing token do not emit events',async()=>{
 const db=new Store(),cb=handler(endpoints[0],db);
 assert.equal((await call(cb,'owner',20)).statusCode,403);
 assert.equal((await call(cb,'paused',10)).statusCode,404);
 assert.equal((await call(cb,'unknown',10)).statusCode,404);
 assert.equal(db.pageEvents.length,0);
});
test('write failure returns error and preserves canonical page state (single SQL statement)',async()=>{
 const db=new Store();db.failWrites=true;
 const a=await call(handler(endpoints[0],db));
 assert.equal(a.statusCode,500);
 assert.equal(db.pages[0].manual_done,false);
 assert.equal(db.pageEvents.length,0);
});
