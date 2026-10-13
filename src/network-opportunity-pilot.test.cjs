'use strict';
const assert=require('node:assert/strict');
const {registerNetworkOpportunityPilot}=require('./network-opportunity-pilot.cjs');
const routes={},events=[];
const app={get:(p,...h)=>{routes['GET '+p]=h},post:(p,...h)=>{routes['POST '+p]=h}};
const pool={query:async(sql,args)=>{
 events.push({sql,args});
 if(sql.includes('FROM network_directory_businesses n'))return {rows:[{id:11,domain:'paperflames.co',website_checked:true,network_fit_score:90}]};
 if(sql.includes('SET metadata=jsonb_set')&&sql.includes('jsonb_build_object'))return {rows:[{id:11,business_name:'Paperflamesmedia',domain:'paperflames.co'}]};
 if(sql.includes('SELECT business_name,domain'))return {rows:[{business_name:'Paperflamesmedia',domain:'paperflames.co',opportunity:{status:'prepared',title:'Marketing case study on creative agency workflows',pitch:'This is a draft opportunity for an independent publisher. Participation and publication require verification and explicit agreement.'}}]};
 if(sql.includes('UPDATE network_directory_businesses SET'))return {rows:[{id:11}]};
 throw Error('Unexpected query: '+sql);
}};
registerNetworkOpportunityPilot({app,pool,verifyGrowthAdmin:()=>{}});
function res(){return {statusCode:200,headers:{},status(n){this.statusCode=n;return this},sendStatus(n){this.statusCode=n;return this},set(a,b){this.headers[a]=b;return this},type(){return this},json(a){this.body=a;return this},send(a){this.body=a;return this}};}
async function invoke(method,path,req){const x=res();await routes[method+' '+path].at(-1)(req,x);return x;}
(async()=>{
 let x=await invoke('GET','/api/network/admin/opportunity-pilot',{engineUser:{isAdmin:false}});
 assert.equal(x.statusCode,403);
 x=await invoke('GET','/api/network/admin/opportunity-pilot',{engineUser:{isAdmin:true}});
 assert.equal(x.body.prospects.length,1);
 const title='Marketing case study on creative agency workflows',pitch='This is a draft opportunity for an independent publisher. Participation and publication require verification and explicit agreement.';
 x=await invoke('POST','/api/network/admin/opportunity/:id/prepare',{engineUser:{isAdmin:false},params:{id:'11'},body:{title,pitch}});
 assert.equal(x.statusCode,403);
 x=await invoke('POST','/api/network/admin/opportunity/:id/prepare',{engineUser:{isAdmin:true},params:{id:'11'},body:{title:'short',pitch}});
 assert.equal(x.statusCode,400);
 x=await invoke('POST','/api/network/admin/opportunity/:id/prepare',{engineUser:{isAdmin:true},params:{id:'11'},body:{title,pitch}});
 assert.equal(x.body.status,'prepared');assert.equal(x.body.invitation_sent,false);
 const token=x.body.preview_url.split('/').pop();assert.match(token,/^[a-f0-9]{48}$/);
 assert(!events.some(e=>e.sql.includes('DELETE')||e.sql.includes('public_visibility=\'listed\'')));
 x=await invoke('GET','/network/opportunity/:token',{params:{token}});
 assert.equal(x.statusCode,200);assert.match(x.body,/I'm interested/);assert.equal(x.headers['X-Robots-Tag'],'noindex, nofollow');
 x=await invoke('POST','/network/opportunity/:token/interested',{params:{token}});
 assert.equal(x.statusCode,200);assert.match(x.body,/Your interest has been recorded/);
 console.log('PASS: CRM candidate selection, admin review, private preview and opt-in; no mail, no public listing');
})().catch(e=>{console.error(e);process.exitCode=1});
