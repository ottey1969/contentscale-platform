'use strict';
// Restricted Chromium fallback for a short, public, owner-selected HTML page.
// Pin the original host to a DNS-validated public IPv4 and prohibit all other
// browser requests. This is not a crawler for arbitrary internal URLs.
const dns=require('node:dns').promises;
const {validateUrl,publicV4,compactPublicHtml,RESEARCH_HTML_LIMIT}=require('./growth-public-html-reader.cjs');
let busy=false;
async function renderPublicGrowthPage(raw,{puppeteer=null,lookup=dns.lookup,timeoutMs=11000}={}){
 if(busy)return {status:'RENDER_BUSY',live:null};
 busy=true;let browser;
 try{
  const url=validateUrl(raw);
  const addresses=await lookup(url.hostname,{family:4,all:true,verbatim:true});
  const ips=(Array.isArray(addresses)?addresses:[]).map(x=>x.address).filter(publicV4);
  if(!ips.length)return {status:'PUBLIC_IPV4_UNAVAILABLE',live:null};
  const pinned=ips[0];
  const p=puppeteer||require('puppeteer');
  browser=await p.launch({headless:true,timeout:timeoutMs,
   executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||undefined,
   args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
    '--disable-gpu','--disable-background-networking','--no-first-run',
    '--host-resolver-rules=MAP '+url.hostname+' '+pinned+', EXCLUDE localhost']});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  let count=0;
  page.on('request',request=>{
   try{
    const target=validateUrl(request.url());
    if(target.hostname!==url.hostname||++count>40)return void request.abort();
    return void request.continue();
   }catch{return void request.abort()}
  });
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:timeoutMs});
  await new Promise(resolve=>setTimeout(resolve,900));
  const rendered=await page.content();
  const finalUrl=page.url();
  if(validateUrl(finalUrl).hostname!==url.hostname)
   return {status:'REDIRECTED_OUTSIDE_ORIGIN',live:null};
  if(!rendered||rendered.length<150)return {status:'RENDERED_HTML_INCOMPLETE',live:null};
  // The rendered DOM is compacted like a static research read: inline CSS/JS must not push the article past the cap.
  const readable=compactPublicHtml(rendered);
  return {status:'BROWSER_RENDERED_SAME_ORIGIN',live:{
   html:readable.slice(0,RESEARCH_HTML_LIMIT),final_url:finalUrl,status:200,
   retrieved_at:new Date().toISOString(),truncated:readable.length>RESEARCH_HTML_LIMIT,
   source:'LIVE_PUBLIC_BROWSER_RENDERED'}};
 }catch(e){
  return {status:'RENDER_UNAVAILABLE',code:String(e?.code||e?.name||'BROWSER_FAILED').slice(0,60),live:null};
 }finally{
  if(browser){try{await browser.close()}catch{}}
  busy=false;
 }
}
function needsGrowthRender(html){
 const raw=String(html||'');
 const withoutChrome=raw.replace(/<(?:script|style|svg|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|nav|header|footer|noscript)>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 return !/<h1\b/i.test(raw)||withoutChrome.length<1200;
}
module.exports={renderPublicGrowthPage,needsGrowthRender};
