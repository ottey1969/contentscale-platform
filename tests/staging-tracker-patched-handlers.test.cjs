'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.PATCHED_CANONICAL_FILE||'/tmp/contentscale-staging-tracker-patched.js','utf8');
const urls=['/api/tracker-client/:token/pages/:pageId/manual-done','/api/tracker-client/:token/pages/manual-done-all'];
function handler(url,pool){
 const marker="app.patch('"+url+"', async (req, res) => {";
 const start=source.indexOf(marker),end=source.indexOf('\n});',start);
 assert(start>=0&&end-start<3500);
 let fn;vm.runInNewContext(source.slice(start,end+4),{app:{patch(_url,f){assert.equal(url,_url);fn=f;}},pool},{timeout:2000});
 return fn;
}
function pool(){
 const rows=[{id:10,tracker_client_id:1,is_active:true,manual_done:false,manual_done_at:null},{id:11,tracker_client_id:1,is_active:false,manual_done:false,manual_done_at:null},{id:20,tracker_client_id:2,is_active:true,manual_done:false,manual_done_at:null}];
 let updates=0,clock=0;
 return {rows,get updates(){return updates;},async query(sql,args){
  if(sql.startsWith('SELECT id FROM tracker_clients WHERE token=$1')){
   if(['paused','disabled','deleted','missing'].includes(args[0]))return {rows:[]};
   return {rows:args[0]==='owner'?[{id:1}]:[]};
  }
  if(sql.startsWith('SELECT id FROM tracker_pages WHERE id=$1')){
   const p=rows.find(p=>String(p.id)===String(args[0])&&p.tracker_client_id===args[1]);
   return {rows:p?[{id:p.id}]:[]};
  }
  if(sql.startsWith('UPDATE tracker_pages SET manual_done=$1')){
   assert.match(sql,/manual_done IS DISTINCT FROM \$1/);
   assert.match(sql,/COALESCE\(manual_done_at,NOW\(\)\)/);
   const bulk=sql.includes('WHERE tracker_client_id=$2');
   const selected=rows.filter(p=>bulk?(p.tracker_client_id===args[1]&&p.is_active):(String(p.id)===String(args[1])&&p.tracker_client_id===args[2]));
   const changed=selected.filter(p=>p.manual_done!==args[0]);
   for(const p of changed){p.manual_done=args[0];p.manual_done_at=args[0]?'T'+(++clock):null;}
   updates+=changed.length;
   return {rowCount:changed.length,rows:[]};
  }
  throw Error('Unexpected SQL: '+sql.slice(0,110));
 }};
}
async function request(fn,token='owner',id=10,done=true){
 const res={statusCode:200,payload:null,status(n){this.statusCode=n;return this;},json(v){this.payload=JSON.parse(JSON.stringify(v));return this;}};
 await fn({params:{token,pageId:id},body:{manual_done:done}},res);
 assert(res.payload);
 return res;
}
test('single page: repeated ON preserves completion timestamp and skips database mutation',async()=>{
 const p=pool(),h=handler(urls[0],p);
 await request(h);const date=p.rows[0].manual_done_at;
 await request(h);
 assert.equal(p.rows[0].manual_done_at,date);
 assert.equal(p.updates,1);
 await request(h,'owner',10,false);
 assert.equal(p.rows[0].manual_done_at,null);
 assert.equal(p.updates,2);
 await request(h,'owner',10,false);
 assert.equal(p.updates,2);
});
test('single: wrong owner never changes page',async()=>{
 const p=pool(),h=handler(urls[0],p);
 assert.equal((await request(h,'owner',20)).statusCode,403);
 assert.equal(p.updates,0);
});
test('paused disabled deleted and missing cannot write',async()=>{
 for(const token of ['paused','disabled','deleted','missing']){
  const p=pool(),h=handler(urls[0],p);
  assert.equal((await request(h,token)).statusCode,404);
  assert.equal(p.updates,0);
 }
});
test('bulk only touches active own pages; repeated identical bulk is no-op',async()=>{
 const p=pool(),h=handler(urls[1],p);
 const one=await request(h);
 assert.equal(one.payload.updated,1);
 const date=p.rows[0].manual_done_at;
 const two=await request(h);
 assert.equal(two.payload.updated,0);
 assert.equal(p.rows[0].manual_done_at,date);
 assert.equal(p.rows[1].manual_done,false);
 assert.equal(p.rows[2].manual_done,false);
 assert.equal(p.updates,1);
});
test('bulk blocks disabled and paused',async()=>{
 for(const token of ['disabled','paused']){
  const p=pool(),h=handler(urls[1],p);
  assert.equal((await request(h,token)).statusCode,404);
  assert.equal(p.updates,0);
 }
});
