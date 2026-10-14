'use strict';
const assert=require('node:assert/strict');
const {discoverBusinessEmails,extractBusinessEmails}=require('./business-email-discovery');
async function main(){
  assert.deepEqual(extractBusinessEmails('info@acme.com outsider@other.org','acme.com').map(x=>x.email),['info@acme.com']);
  await assert.rejects(()=>discoverBusinessEmails('http://localhost'),/HTTPS public/);
  const fetch=async url=>({ok:true,status:200,headers:{get:k=>k==='content-type'?'text/html':null},text:async()=>url.endsWith('/contact')?'<a href="mailto:sales@acme.com">Sales</a>':'info@acme.com'});
  const r=await discoverBusinessEmails('https://acme.com',{fetch,maxPages:2});
  assert.equal(r.emails.length,2);
  assert.equal(r.emails[0].verification,'publicly_observed');
  console.log('business email discovery tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
