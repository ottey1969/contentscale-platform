'use strict';
// DNS-pinned HTTPS reading: rejects private/link-local destinations, redirects and large pages.
const dns=require('node:dns').promises;
const https=require('node:https');
const net=require('node:net');
const EmailDetectionService=require('./services/email-detection-service');
const paths=['/','/contact','/contact-us','/about','/about-us','/contacto','/kontakt','/over-ons'];
function publicIP(ip){
 const family=net.isIP(ip);
 if(family===4){
  const a=ip.split('.').map(Number),x=a[0],y=a[1];
  return !(x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||x===192&&y===168||x===100&&y>=64&&y<=127||x===192&&y===0||x===192&&y===0||x===198&&[18,19].includes(y)||x===198&&y===51||x===203&&y===0);
 }
 if(family===6){
  const v=ip.toLowerCase();
  if(v.includes('.'))return false; // disallow v4 mapped
  return !(v==='::1'||v==='::'||v.startsWith('fc')||v.startsWith('fd')||v.startsWith('fe')||v.startsWith('ff')||v.startsWith('2001:db8'));
 }
 return false;
}
function hostForWebsite(raw){
 const url=new URL(raw);
 // Imported Maps records can carry legacy http:// URL labels. Never fetch over HTTP;
 // validate the public hostname and attempt HTTPS to the same host instead.
 if(!['https:','http:'].includes(url.protocol)||url.port||url.username||url.password)throw Error('Public company domain required');
 const host=url.hostname.toLowerCase().replace(/^www\./,'');
 if(!host.includes('.')||! /^[a-z0-9.-]+$/.test(host)||host.includes('..')||net.isIP(host)||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host))throw Error('Public company domain required');
 return {host,websiteHost:url.hostname.toLowerCase()};
}
async function readWebsitePage(host,path,{resolve=dns.lookup,request=https.request,redirectDepth=0}={}){
 const addresses=await resolve(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw Error('Website DNS has unsafe addresses');
 const chosen=addresses[0];
 return await new Promise((resolvePage,reject)=>{
  let done=false;
  const finish=(err,data)=>{if(done)return;done=true;err?reject(err):resolvePage(data)};
  const req=request({hostname:host,servername:host,path,method:'GET',port:443,
   headers:{'Accept':'text/html','User-Agent':'ContentScale-Contact-Discovery/1.0'},
   // Node's autoSelectFamily passes lookup({all:true}) and expects an ARRAY.
   // Returning a scalar address caused ERR_INVALID_IP_ADDRESS for every real site.
   lookup:(_hostname,lookupOptions,cb)=>lookupOptions?.all
    ? cb(null,[{address:chosen.address,family:chosen.family}])
    : cb(null,chosen.address,chosen.family),
   timeout:5000,rejectUnauthorized:true},res=>{
    if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){
     res.resume();
     if(redirectDepth>=3)return finish(Error('Too many redirects'));
     let dest;
     try{dest=new URL(res.headers.location,'https://'+host+path);}catch{return finish(Error('Invalid redirect'));}
     // Follow redirects only on the same public company hostname or www variant.
     if(dest.protocol!=='https:'||dest.username||dest.password||dest.port||
       dest.hostname.toLowerCase().replace(/^www\./,'')!==host.toLowerCase().replace(/^www\./,''))
       return finish(Error('Cross-domain redirect needs manual review'));
     return readWebsitePage(dest.hostname,dest.pathname+dest.search,{resolve,request,redirectDepth:redirectDepth+1}).then(v=>finish(null,v),finish);
    }
    if(res.statusCode!==200){res.resume();return finish(Error('HTTP '+res.statusCode));}
    if(!/^text\/html/i.test(res.headers['content-type']||'')){res.resume();return finish(Error('Not HTML'));}
    if(Number(res.headers['content-length']||0)>750000){res.destroy();return finish(Error('Too large'));}
    let total=0,buffers=[];
    res.on('data',chunk=>{total+=chunk.length;if(total>750000){res.destroy();finish(Error('Too large'))}else buffers.push(chunk)});
    res.on('end',()=>finish(null,Buffer.concat(buffers).toString('utf8')));
    res.on('error',err=>finish(err));
  });
  req.on('timeout',()=>req.destroy(Error('Timeout')));
  req.on('error',err=>finish(err));req.end();
 });
}
function fetchFailureCategory(e){
 const key=String(e?.code||e?.message||'').toUpperCase();
 if(/ENOTFOUND|EAI_AGAIN|ENODATA/.test(key))return 'dns_error';
 if(/ERR_INVALID_IP_ADDRESS|EADDRNOTAVAIL|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|TIMEOUT|ECONNRESET/.test(key))return 'connection_error';
 if(/CERT|TLS|SSL|UNABLE_TO_VERIFY/.test(key))return 'tls_error';
 if(/HTTP 403|HTTP 429|HTTP 503|NOT HTML/.test(key))return 'blocked_or_non_html';
 if(/TOO LARGE|TOO MANY/.test(key))return 'limited';
 return 'fetch_error';
}
async function discoverCompanyContact(website,options={}){
 const {host,websiteHost}=hostForWebsite(website);
 const service=new EmailDetectionService(),results=new Map(),checked=[];
 for(const path of paths.slice(0,Number(options.maxPages)||5)){
  const source='https://'+websiteHost+path;
  try{
   const html=await readWebsitePage(websiteHost,path,options);
   checked.push({url:source,status:'checked'});
   // Only read human-visible first-party content and explicit mailto links.
   // A company can publicly list a business email hosted at another domain
   // (e.g. jerseycraftroofing.com publishes info@jerseycraftexteriors.com).
   const visible=html.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
   const direct=visible.match(/mailto:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[];
   const readable=visible.replace(/<[^>]*>/g,' ');
   const addresses=service.extractEmails(readable+' '+direct.join(' ').replace(/mailto:/gi,''));
   for(const raw of addresses){
    const address=raw.toLowerCase(),mailDomain=address.split('@')[1],local=address.split('@')[0];
    if(/^(no-?reply|donotreply|bounce|mailer-daemon)$/i.test(local)||
       /\.(?:png|jpe?g|webp|svg|gif|css|js)$/i.test(address)||
       /^(gmail\.com|yahoo\.com|outlook\.com|hotmail\.com|example\.com|example\.org)$/i.test(mailDomain))continue;
    const same=mailDomain===host||mailDomain===websiteHost||host.endsWith('.'+mailDomain);
    if(!results.has(address))results.set(address,{email:address,source_url:source,
       email_domain_relationship:same?'same_domain':'publicly_listed_other_business_domain'});
   }
  }catch(e){checked.push({url:source,status:'unavailable',reason:fetchFailureCategory(e)});}
 }
 const contacts=[...results.values()].sort((a,b)=>service.scoreEmail(b.email,host)-service.scoreEmail(a.email,host));
 return {domain:host,email:contacts[0]?.email||null,source_url:contacts[0]?.source_url||null,
  contacts,checked,relationship:contacts[0]?.email_domain_relationship||null,
  verification:contacts.length?'publicly_observed':checked.every(c=>c.status==='unavailable')?'fetch_unavailable':'not_found'};
}
module.exports={discoverCompanyContact,hostForWebsite,publicIP,readWebsitePage,fetchFailureCategory};
