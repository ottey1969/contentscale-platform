'use strict';
// Public HTML fetch preflight only. No credentials, database, email or scanner execution.
// GitHub runner egress can differ from Railway; results are indicative, not production proof.
const assert=require('node:assert/strict');
const hosts=['https://es.contentscale.site/','https://es.contentscale.site/consultor-geo/'];
function suspicious(html){
 if(!html||html.length<500)return 'too_small';
 const textOnly=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 if(textOnly.length/html.length<0.03)return 'low_text_ratio';
 const p=(html.match(/<p[\s>]/gi)||[]).length;
 const a=(html.match(/<article[\s>]/gi)||[]).length;
 const m=(html.match(/<main[\s>]/gi)||[]).length;
 const h=(html.match(/<h[12][\s>]/gi)||[]).length;
 const sec=(html.match(/<section[\s>]/gi)||[]).length;
 const div=(html.match(/<div[\s>]/gi)||[]).length;
 if(!(p>=3||h>=2||sec>=2||a>0||m>0)&&div<10)return 'no_content_tags';
 const roots=['id="root"','id="__next"','id="app"','id="__nuxt"','window.__INITIAL_STATE__','window.__DATA__'];
 if(roots.some(x=>html.includes(x))&&(html.match(/<script[\s>]/gi)||[]).length>8&&p<2&&h===0&&sec===0)return 'js_spa';
 return null;
}
(async()=>{
 let failures=0;
 for(const url of hosts){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':'es-ES,es;q=0.9,en;q=0.6'
   }});
   const final=new URL(r.url);
   assert.equal(final.hostname,'es.contentscale.site','unexpected cross-domain redirect');
   const html=(await r.text()).slice(0,2500000);
   const issue=suspicious(html);
   const ok=r.ok&&!issue&&(new URL(url).pathname.replace(/\/+$/,'')===final.pathname.replace(/\/+$/,''));
   console.log(JSON.stringify({path:new URL(url).pathname,status:r.status,finalPath:final.pathname,bytes:Buffer.byteLength(html),suspicion:issue,reliable:ok}));
   if(!ok)failures++;
  }catch(e){failures++;console.log(JSON.stringify({path:new URL(url).pathname,error:String(e.message||e).slice(0,180),reliable:false}));}
 }
 if(failures){console.error('LIVE HTML PREFLIGHT: one or more pages not verified from GitHub runner; production scanner may see different network conditions');process.exitCode=1;}
 else console.log('LIVE HTML PREFLIGHT: both public pages appear fetchable and have substantial HTML');
})().catch(e=>{console.error('Preflight failed:',e.message);process.exitCode=1;});
