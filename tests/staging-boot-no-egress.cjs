'use strict';
// GitHub Actions disposable full-app smoke only. Network egress is deliberately denied.
// Local PostgreSQL and localhost health probes remain available.
const net=require('node:net');
const rawConnect=net.Socket.prototype.connect;
const local=h=>!h||['127.0.0.1','localhost','::1','[::1]'].includes(String(h).toLowerCase());
net.Socket.prototype.connect=function(...args){
 let host='';
 if(args[0]&&typeof args[0]==='object')host=args[0].host||args[0].hostname||'';
 else if(typeof args[0]==='number'&&typeof args[1]==='string')host=args[1];
 if(!local(host))throw Error('STAGING-CI-EGRESS-DENIED: '+String(host).slice(0,70));
 return rawConnect.apply(this,args);
};
const confirmationAttempts=new Map();
globalThis.fetch=async(url, options)=>{
 if(process.env.BREVO_API_KEY==='staging-ci-quick-scan-fixture'
   && url==='https://api.brevo.com/v3/smtp/email' && options?.method==='POST'){
  const email=JSON.parse(options.body).to?.[0]?.email||'';
  if(/^(retry|unknown)\+[0-9a-f]+@confirm\.example$/.test(email)){
   const attempts=(confirmationAttempts.get(email)||0)+1;
   confirmationAttempts.set(email,attempts);
   if(attempts===1 && email.startsWith('unknown+')) throw Error('STAGING-CI-PROVIDER-RESPONSE-LOST');
   if(attempts===1)return new Response('{}',{status:429,headers:{'Retry-After':'0'}});
   if(attempts===2)return new Response('{}',{status:201});
   throw Error('STAGING-CI-DUPLICATE-CONFIRMATION');
  }
 }
 throw Error('STAGING-CI-EXTERNAL-FETCH-DENIED');
};
