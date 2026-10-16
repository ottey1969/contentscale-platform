'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {growthServiceAccountToken}=require('./growth-gsc-service-token.cjs');
(async()=>{
 assert.equal(await growthServiceAccountToken({raw:''}),null);
 await assert.rejects(()=>growthServiceAccountToken({raw:'not json'}),/INVALID/);
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const raw=JSON.stringify({client_email:'synthetic@example.test',
 private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})});
 const token=await growthServiceAccountToken({raw,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://oauth2.googleapis.com/token');
  assert.equal(options.method,'POST');
  const jwt=new URLSearchParams(options.body).get('assertion');
  const [a,b,signature]=jwt.split('.');
  const payload=JSON.parse(Buffer.from(b,'base64url').toString('utf8'));
  assert.equal(payload.scope,'https://www.googleapis.com/auth/webmasters.readonly');
  assert(crypto.verify('RSA-SHA256',Buffer.from(a+'.'+b),pair.publicKey,Buffer.from(signature,'base64url')));
  return{ok:true,json:async()=>({access_token:'test-only'})};
 }});
 assert.equal(token,'test-only');
 await assert.rejects(()=>growthServiceAccountToken({raw,fetchImpl:async()=>({ok:false})}),/REJECTED/);
 console.log('PASS: existing readonly GSC service-account contract; no external provider required');
})().catch(e=>{console.error(e);process.exitCode=1});
