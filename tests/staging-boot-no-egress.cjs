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
const ceoFixture = process.env.COMMERCIAL_CEO_BROWSER_FIXTURE === '1';
const fixtureHost = /^https:\/\/(?:commercial-)?[a-f0-9]{16}\.example\/(?:services\/roof-repair\/)?$/;
const commercialHtml = `<!doctype html><html lang="en"><head><title>Roof repair services</title></head><body>
<main><h1>Roof repair services</h1>
<section><h2>Investigating leaks</h2><p>The first visit starts with a review of the areas where water appeared indoors. Once we know which rooms are affected, we trace the route to the exterior and check joints, flashing, roof penetrations and damaged tiles. We record visible defects and explain which ones can plausibly account for the leak.</p></section>
<section><h2>Planning a repair</h2><p>A flat roof and a tiled roof use different materials. We identify the existing membrane, fasteners and drainage before recommending replacement parts. Access requirements and weather affect the order of work. Customers receive a description of the proposed repair and any areas that need closer inspection.</p></section>
<section><h2>Checking the repaired area</h2><p>After work, we compare the repaired areas with the original observations and confirm that gutters and outlets are clear. The handover covers maintenance, signs of recurring moisture and how to report a concern. Photographs can help the building manager record what was changed.</p></section>
<a href="/contact">Contact the team</a></main></body></html>`;
const localFetch = globalThis.fetch.bind(globalThis);
if (ceoFixture) {
 const puppeteer = require('puppeteer');
 const launch = puppeteer.launch.bind(puppeteer);
 puppeteer.launch = async options => {
  const browser = await launch(options);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async () => {
   const page = await newPage();
   const navigate = page.goto.bind(page);
   page.goto = async (url, navigateOptions) => {
    if (!fixtureHost.test(url)) return navigate(url, navigateOptions);
    await page.setRequestInterception(true);
    page.on('request', request => {
     const reply = request.url() === url
      ? request.respond({ status: 200, contentType: 'text/html', body: commercialHtml })
      : request.abort();
     reply.catch(() => {});
    });
    return navigate(url, navigateOptions);
   };
   return page;
  };
  return browser;
 };
}
const confirmationAttempts=new Map();
globalThis.fetch=async(url, options)=>{
 if (ceoFixture && options?.method === 'POST' &&
     String(url) === 'http://127.0.0.1:' + process.env.PORT + '/api/scan' &&
     fixtureHost.test(JSON.parse(options.body).url || '')) {
  return localFetch(url, options);
 }
 const website=/^https:\/\/(commercial-[a-f0-9]{16}\.example)\/$/.exec(String(url));
 if((website || (ceoFixture && fixtureHost.test(String(url)))) && /^Mozilla.*ContentScalePublicContactCheck/.test(options?.headers?.['User-Agent']||'')){
  const response=new Response(commercialHtml,{headers:{'Content-Type':'text/html'}});
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
