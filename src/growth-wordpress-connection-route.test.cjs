'use strict';
const assert=require('node:assert/strict');
const {registerGrowthWordPressConnectionRoute}=require('./growth-wordpress-connection-route.cjs');
const url='https://contentscale.site/craft-framework/';
async function run({admin=true,authentication=true,capability=true,domain=url,changed=false}={}){
 let handler,formHandler,updated=0,committed=false,rolledBack=false,fetchCalls=0;
 const app={get:(path,fn)=>{assert.equal(path,'/growth/wordpress/connect');formHandler=fn;},post:(path,middleware,fn)=>{assert.equal(path,'/api/growth/wordpress/profile/:profileId/connect');handler=fn;}};
 const rows=[{url:domain}];
 const pool={query:async()=>({rows}),connect:async()=>({
  query:async(sql,args)=>{
   if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='COMMIT'){if(sql==='COMMIT')committed=true;if(sql==='ROLLBACK')rolledBack=true;return {rows:[]};}
   if(sql.includes('FROM content_profiles'))return {rows:[{id:4}]};
   if(sql.includes('FROM tracker_pages'))return {rows:changed?[{url:'https://contentscale.site/changed/'}]:rows};
   if(sql.startsWith('UPDATE content_profiles')){
    updated++;assert.equal(args[0],4);assert.equal(args[1],'https://contentscale.site/');
    assert.equal(args[2],'editor');assert.equal(args[3],'app-password');return {rows:[]};
   }
   throw Error('Unexpected query');
  },release:()=>{}
 })};
 const fetchImpl=async(endpoint,opts)=>{
  fetchCalls++;assert.equal(endpoint,'https://contentscale.site/wp-json/wp/v2/users/me?context=edit');
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  return {ok:authentication,json:async()=>({id:17,capabilities:capability?{edit_pages:true}:{read:true}})};
 };
 registerGrowthWordPressConnectionRoute({app,pool,verifyGrowthAdmin:()=>{},fetchImpl});
 const page={headers:{},type(){return this;},set(k,v){this.headers[k]=v;return this;},send(html){this.html=html;return this;}};
 formHandler({},page);
 assert.match(page.html,/Connect &amp; Verify/);
 assert.match(page.html,/type="password"/);
 assert.match(page.html,/fetch\('\/api\/growth\/wordpress\/profile\//);
 assert.match(page.headers['Cache-Control'],/no-store/);
 const req={params:{profileId:'4'},engineUser:{isAdmin:admin,adminId:'ADMIN-8AE3924B3136D1C8'},
  body:{username:'editor',application_password:'app-password'}};
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
 await handler(req,res);
 return {res,updated,committed,rolledBack,fetchCalls};
}
(async()=>{
 let x=await run();assert.equal(x.res.body.status,'WORDPRESS_PROFILE_CONNECTED');
 assert.equal(x.updated,1);assert(x.committed);
 assert(!JSON.stringify(x.res.body).includes('app-password'));
 for(const o of [{admin:false},{authentication:false},{capability:false},
  {domain:'https://other.test/unsafe/'},{changed:true}]){
  x=await run(o);
  if(o.domain){assert.equal(x.res.body.status,'BLOCKED');}
  else assert.equal(x.res.body.status,'BLOCKED');
  assert.equal(x.updated,0);assert.equal(x.committed,false);
 }
 console.log('PASS: verified admin WordPress profile connect, fail-closed auth and safe persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
