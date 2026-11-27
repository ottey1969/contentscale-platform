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
 const website=/^https:\/\/(commercial-[a-f0-9]{16}\.example)\/$/.exec(String(url));
 if(website && /^Mozilla.*ContentScalePublicContactCheck/.test(options?.headers?.['User-Agent']||'')){
  const html='<html lang="en"><head><title>Roofing contractor</title></head><body><h1>Roof repair services</h1>'+
    '<p>Our roofing team provides emergency repairs and inspections for local businesses.</p>'.repeat(12)+
    '<a href="/contact">Contact our roofing team</a></body></html>';
  const response=new Response(html,{headers:{'Content-Type':'text/html'}});
  Object.defineProperty(response,'url',{value:String(url)});
  return response;
 }

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
