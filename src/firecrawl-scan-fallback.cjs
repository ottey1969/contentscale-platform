'use strict';
// Quick Scan and CEO Scan: the canonical ContentScore scanner (browser /api/scan) stays first. Only when it failed for a
// reason that is not a refusal — browser unavailable, navigation timeout, a 5xx from the site — the central native-first
// reader is asked for the page. Its own static read runs first; Firecrawl is used only when that page is unusable too.
// Static HTML that the scanner could not score keeps the original scan result: this fallback never changes a scan that
// the existing flow handles, and never sends a refused, bot-checked or missing page to Firecrawl.
const REFUSAL=/security|anti-bot|forbidden|access denied|captcha/i;
function scanFallbackEligible(err){
 if(!err)return false;
 if(err.name==='TimeoutError'||err.name==='AbortError')return true;
 const scan=err.scan||{},status=Number(err.status)||0,http=Number(scan.http_status)||0,text=String(scan.error||'')+' '+String(scan.detail||'');
 if(http>=400&&http<500)return false;
 if(REFUSAL.test(String(scan.error||'')))return false;
 if(status===503&&scan.step==='browser_launch')return true;
 if(status===500&&['navigation','newPage','evaluate','outer_catch'].includes(scan.step))return !/HTTP 4\d\d/.test(text);
 if(status===422&&scan.step==='invalid_response'&&http>=500)return true;
 return false;
}
async function acquireScanHtml(url,{reader,module='UNCLASSIFIED'}={}){
 try{
  const read=reader||require('./growth-free-firecrawl-reader.cjs').createFallbackReader({module,maxPages:1});
  const page=await read(url,{compact:false,limit:600000,timeout:12000,redirects:4});
  return page&&page.source==='FIRECRAWL_HOSTED_API'&&typeof page.html==='string'&&page.html.length>=500?{html:page.html,final_url:page.final_url||url,source:page.source}:null;
 }catch{return null}
}
module.exports={scanFallbackEligible,acquireScanHtml};
