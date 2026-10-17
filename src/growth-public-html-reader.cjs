'use strict';
// Bounded public HTTPS reader. DNS resolution is pinned to a validated public IPv4.
// No authentication, cookies, redirects to private networks, provider API or DB writes.
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');
function publicV4(ip){
 if(net.isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(
  a===0||a===10||a===127||a>=224||a===169&&b===254||
  a===172&&b>=16&&b<=31||a===192&&b===168||
  a===100&&b>=64&&b<=127||a===192&&b===0||
  a===198&&b>=18&&b<=19||
  a===192&&b===0&&c===2||a===198&&b===51&&c===100||
  a===203&&b===0&&c===113||
  a===192&&b===88&&c===99
 );
}
function validateUrl(raw){
 let url;
 try{url=new URL(raw)}catch{throw Object.assign(Error('INVALID_URL'),{code:'INVALID_URL'})}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||
    !url.hostname||url.hostname.length>253||url.hostname==='localhost'||url.hostname.endsWith('.local')||
    net.isIP(url.hostname))throw Object.assign(Error('PUBLIC_HTTPS_URL_REQUIRED'),{code:'PUBLIC_HTTPS_URL_REQUIRED'});
 url.hash='';
 return url;
}
async function fetchPublicGrowthHtml(raw,{lookup=dns.lookup,httpsModule=https,limit=120000,timeout=6500,redirects=2}={}){
 let url=validateUrl(raw);
 for(let n=0;n<=redirects;n++){
  const addresses=await lookup(url.hostname,{family:4,all:true,verbatim:true});
  const valid=(Array.isArray(addresses)?addresses:[]).map(a=>a.address).filter(publicV4);
  if(!valid.length)throw Object.assign(Error('PUBLIC_IPV4_UNAVAILABLE'),{code:'PUBLIC_IPV4_UNAVAILABLE'});
  const address=valid[0];
  const result=await new Promise((resolve,reject)=>{
   let completed=false;
   const done=(e,value)=>{if(completed)return;completed=true;if(e)reject(e);else resolve(value)};
   const req=httpsModule.request(url,{
    method:'GET',headers:{'User-Agent':'ContentScaleGrowthResearch/1.0 (+https://contentscale.site/)','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
    lookup(_name,_options,cb){cb(null,address,4)},rejectUnauthorized:true,timeout
   },res=>{
    const status=res.statusCode||0;
    if([301,302,303,307,308].includes(status)){
     const redirect=res.headers.location;res.resume();
     if(!redirect)return done(Object.assign(Error('REDIRECT_WITHOUT_LOCATION'),{code:'REDIRECT_WITHOUT_LOCATION'}));
     return done(null,{redirect:String(redirect)});
    }
    if(status!==200){res.resume();return done(Object.assign(Error('HTTP_'+status),{code:'HTTP_'+status}))}
    const mime=String(res.headers['content-type']||'').toLowerCase();
    if(!/(text\/html|application\/xhtml\+xml)/.test(mime)){
     res.resume();return done(Object.assign(Error('NOT_HTML'),{code:'NOT_HTML'}));
    }
    const chunks=[];let size=0,truncated=false;
    res.on('data',chunk=>{
     if(completed)return;
     const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
     const space=limit-size;
     if(space>0){const take=part.subarray(0,space);chunks.push(take);size+=take.length}
     if(part.length>space){
      truncated=true;
      done(null,{html:Buffer.concat(chunks).toString('utf8'),final_url:url.href,status:200,
       retrieved_at:new Date().toISOString(),truncated,source:'LIVE_PUBLIC_HTTPS'});
      res.destroy();
     }
    });
    res.on('end',()=>done(null,{html:Buffer.concat(chunks).toString('utf8'),final_url:url.href,status:200,
      retrieved_at:new Date().toISOString(),truncated,source:'LIVE_PUBLIC_HTTPS'}));
    res.on('error',e=>done(e));
   });
   req.on('timeout',()=>req.destroy(Object.assign(Error('FETCH_TIMEOUT'),{code:'FETCH_TIMEOUT'})));
   req.on('error',e=>done(e));
   req.end();
  });
  if(!result.redirect)return result;
  if(n===redirects)throw Object.assign(Error('REDIRECT_LIMIT'),{code:'REDIRECT_LIMIT'});
  url=validateUrl(new URL(result.redirect,url).href);
 }
 throw Error('UNEXPECTED_FETCH_STATE');
}
module.exports={fetchPublicGrowthHtml,validateUrl,publicV4};
