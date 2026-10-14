'use strict';
// Public website contact discovery. No paid enrichment provider or guessed addresses.
const PATHS=['/','/contact','/contact-us','/about','/about-us','/contacto','/kontakt','/over-ons'];
const EMAIL=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
function target(raw){
  const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(url.protocol!=='https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.includes('..') || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw Error('HTTPS public company domain required');
  return {origin:url.origin,host};
}
function extract(html,host){
  const matches=new Map();
  const normalized=String(html).replace(/&#64;|&#x40;|&commat;/gi,'@').replace(/&#46;|&#x2e;/gi,'.');
  const root=host.replace(/^www\./,'');
  for(const match of normalized.matchAll(EMAIL)){
    const email=match[0].toLowerCase(),domain=email.split('@')[1];
    if(email.length>254 || !(domain===root || domain===host || host.endsWith('.'+domain)) || /\.(?:png|jpg|jpeg|svg|gif|webp|js|css)$/i.test(email))continue;
    matches.set(email,{email,type:/^(info|contact|hello|office|sales|support|admin|enquiries|inquiries)@/.test(email)?'role':'named'});
  }
  return [...matches.values()];
}
async function discoverBusinessEmails(website,opts={}){
  const {origin,host}=target(website);
  const fetcher=opts.fetch || globalThis.fetch;
  const maxPages=Math.min(8,Math.max(1,Number(opts.maxPages)||5));
  const timeoutMs=Math.min(10000,Math.max(1000,Number(opts.timeoutMs)||5000));
  const checked=[],results=new Map();
  for(const path of PATHS.slice(0,maxPages)){
    const url=origin+path;
    try{
      const response=await fetcher(url,{redirect:'error',headers:{Accept:'text/html'},signal:AbortSignal.timeout(timeoutMs)});
      checked.push({url,status:response.status});
      if(!response.ok || !/^text\/html/i.test(response.headers.get('content-type')||''))continue;
      const bodyLength=Number(response.headers.get('content-length')||0);
      if(bodyLength>1000000)continue;
      const html=(await response.text()).slice(0,1000000);
      for(const item of extract(html,host))if(!results.has(item.email))results.set(item.email,{...item,source_url:url,verification:'publicly_observed'});
    }catch(e){checked.push({url,error:'unavailable'});}
  }
  return {domain:host,emails:[...results.values()],checked,status:results.size?'found':'not_found'};
}
module.exports={discoverBusinessEmails,extractBusinessEmails:extract};
