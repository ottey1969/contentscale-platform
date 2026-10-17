'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {registerGrowthMeasurement}=require('../src/tracker-growth-measurement.cjs');
const routes={};
const pool={async query(sql,args){
 if(sql.includes('FROM tracker_clients')){
  if(sql.includes('OR readonly_token=$1')){
   return {rows:args[0]==='share-token'||args[0]==='owner-token'?[{id:1,domain:'example.org',token:'owner-token',status:'active'}]:[]};
  }
  return {rows:args[0]==='owner-token'?[{id:1,domain:'example.org'}]:[]};
 }
 if(sql.includes('to_regclass'))return {rows:[{ready:false}]};
 throw Error('SQL forbidden for no-data measurement: '+sql);
}};
registerGrowthMeasurement({get(p,h){routes[p]=h},post(p,h){routes[p]=h}},pool);
async function call(p,token){
 const req={params:{token},body:{publication_id:1}};
 const res={statusCode:200,status(n){this.statusCode=n;return this},set(){return this},json(v){this.data=v;return this},type(){return this},send(v){this.html=v;return this}};
 await routes[p](req,res);return res;
}
(async()=>{
 const pathRead='/api/tracker-client/:token/growth/measurement';
 const shared=await call(pathRead,'share-token');
 assert.equal(shared.statusCode,200);
 assert.equal(shared.data.success,true);
 assert.equal(shared.data.can_edit,false);
 const owner=await call(pathRead,'owner-token');
 assert.equal(owner.data.can_edit,true);
 const stranger=await call(pathRead,'unknown');
 assert.equal(stranger.statusCode,404);
 const upload=await call('/api/tracker-client/:token/growth/measurement/window','share-token');
 assert.equal(upload.statusCode,404,'share tokens must never grant GSC write access');
 const view=await call('/track/:token/growth/measurement','share-token');
 assert.match(view.html,/if\(!d.can_edit\)/,'UI must hide GSC input controls for share recipients');
 assert.match(view.html,/Read-only shared view/);
 const code=fs.readFileSync(path.resolve(__dirname,'../src/tracker-growth-measurement.cjs'),'utf8');
 const post=code.slice(code.indexOf("app.post('/api/tracker-client/:token/growth/measurement/window'"));
 assert(post.includes('WHERE token=$1')&&!post.includes('OR readonly_token=$1'),'owner write route must be unchanged');
 console.log('PASS Growth measurement: shared read-only view, owner read/write separation and no required GSC');
})().catch(e=>{console.error(e);process.exitCode=1});
