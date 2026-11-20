'use strict';
// Live status of the URLs in a GSC report: does the URL still answer 200, does it redirect (301/308 permanent,
// 302/303/307 temporary) and to where, or is it gone (404/410)? Read with the bounded public reader: public HTTPS only,
// each hop re-validated, no cookies, no login, and a site that blocks the request is reported as not checked.
const {fetchPublicGrowthHtml}=require('../growth-public-html-reader.cjs');

const PERMANENT=new Set([301,308]);
function fromResult(url,res,err){
 const chain=(res&&res.redirect_chain)||(err&&err.redirect_chain)||[];
 const code=err&&(err.code||err.message)||null;
 const http=code&&/^HTTP_(\d{3})$/.exec(code);
 const finalStatus=res?200:http?Number(http[1]):null;
 if(chain.length){
  const last=chain[chain.length-1];
  return {status:chain[0].status,permanent:chain.every(h=>PERMANENT.has(h.status)),hops:chain.length,
   final_url:res?res.final_url:last.location,final_status:finalStatus,...(code&&!http?{final_error:code}:{})};
 }
 if(res)return {status:200};
 if(http&&(finalStatus===404||finalStatus===410))return {status:finalStatus};
 return {error:code||'REQUEST_FAILED'};
}
// Map of URL → status. The first `max` https URLs are requested, `concurrency` at a time.
async function checkUrlStatuses(urls,{fetchImpl=fetchPublicGrowthHtml,max=150,concurrency=8,timeout=5000}={}){
 const out=new Map(),todo=[];
 for(const u of [...new Set(urls||[])]){
  if(!/^https:\/\//i.test(u)){out.set(u,{error:'NOT_HTTPS'});continue}
  if(todo.length>=max){out.set(u,{error:'NOT_CHECKED_LIMIT'});continue}
  todo.push(u);
 }
 let i=0;
 const worker=async()=>{while(i<todo.length){const u=todo[i++];
  try{out.set(u,fromResult(u,await fetchImpl(u,{limit:2048,timeout,redirects:4}),null))}
  catch(e){out.set(u,fromResult(u,null,e))}}};
 await Promise.all(Array.from({length:Math.min(concurrency,todo.length)},worker));
 return out;
}
module.exports={checkUrlStatuses,fromResult};
