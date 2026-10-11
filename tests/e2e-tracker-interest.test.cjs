'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const marker="app.post('/api/prospect-quick-scan/:token/tracker-interest'";
const pos=source.indexOf(marker);
assert(pos>=0,'canonical tracker-interest handler missing');
const line=source.slice(pos,source.indexOf('\n',pos));
assert(line.includes('tracker_interested'),'canonical tracker interest update missing');
function handlerFor(state){
  let handler,notifications=0,updates=0;
  const pool={query:async(sql)=>{
    if(sql.includes('UPDATE prospect_quick_scans')){
      updates++;
      if(sql.includes('tracker_interested IS DISTINCT FROM TRUE')&&state.interested)return {rows:[]};
      state.interested=true;
      return {rows:[{tracker_interested:true}]};
    }
    if(sql.includes('SELECT tracker_interested'))return {rows:[{tracker_interested:state.interested}]};
    throw Error('Unexpected SQL');
  }};
  vm.runInNewContext(line,{app:{post(_route,fn){handler=fn}},pool,_pqsNotifyOwner:async()=>{notifications++},console},{timeout:2000});
  async function invoke(){
    const res={code:200,status(n){this.code=n;return this},json(body){this.body=body;return body}};
    await handler({params:{token:'synthetic'}},res);
    await new Promise(resolve=>setImmediate(resolve));
    return res;
  }
  return {invoke,counts:()=>({notifications,updates})};
}
test('Tracker interest repeat is idempotent; no duplicate owner notifications',async()=>{
 const state={interested:false},f=handlerFor(state);
 assert.equal((await f.invoke()).code,200);
 assert.equal((await f.invoke()).code,200);
 assert.equal(f.counts().notifications,1,'duplicate tracker-interest click must not send another email');
});
