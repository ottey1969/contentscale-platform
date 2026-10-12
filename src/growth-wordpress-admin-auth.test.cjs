'use strict';
const assert=require('node:assert/strict');
const {createGrowthAdminMiddleware}=require('./growth-wordpress-admin-auth.cjs');
const makeRes=()=>({code:200,body:null,status(code){this.code=code;return this;},json(value){this.body=value;return this;}});
(async()=>{
 let seen,nextCalled=false;
 const auth=createGrowthAdminMiddleware({query:async(sql,args)=>{
  assert.match(sql,/FROM super_admins/);assert.match(sql,/is_active=TRUE/);
  seen=args;return{rows:[{id:'ADMIN-8AE3924B3136D1C8'}]};
 }});
 const req={headers:{'x-admin-key':'super-secret'}},res=makeRes();
 await auth(req,res,()=>{nextCalled=true;});
 assert.equal(nextCalled,true);assert.equal(req.engineUser.isAdmin,true);assert.equal(req.engineUser.adminId,'ADMIN-8AE3924B3136D1C8');
 assert.deepEqual(seen,['super-secret']);
 let denied=makeRes();
 await auth({headers:{}},denied,()=>{throw Error('must not call next')});
 assert.equal(denied.code,401);
 denied=makeRes();
 await createGrowthAdminMiddleware({query:async()=>({rows:[]})})({headers:{'x-admin-key':'invalid'}},denied,()=>{throw Error('must not call next')});
 assert.equal(denied.code,403);
 denied=makeRes();
 await createGrowthAdminMiddleware({query:async()=>{throw Error('DB down')}})({headers:{'x-admin-key':'secret'}},denied,()=>{throw Error('must not call next')});
 assert.equal(denied.code,503);
 console.log('PASS: active super-admin authorization, denial and DB failure fail closed');
})().catch(e=>{console.error(e);process.exitCode=1});
