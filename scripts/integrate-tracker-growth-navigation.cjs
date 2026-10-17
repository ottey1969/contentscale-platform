'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const start='const _CLIENT_TRACKER_HTML = ' + String.fromCharCode(96);
const marker='CONTENTSCALE_SHARED_TRACKER_GROWTH_NAV_V1';
// Never modify scanner, Prewrite, GSC permission or customer write routes.
const growthNav='    <!-- CONTENTSCALE_SHARED_TRACKER_GROWTH_NAV_V1 -->\n    <a id="growthDirectNav" class="cs-btn" href="/track/__TOKEN__/growth" style="border-color:#2563eb;color:#bfdbfe;font-weight:800;background:#0b244d;" title="Open Growth directly; GSC is optional">&#8599; Growth</a>\n';
const scriptTag='<script defer src="/tracker-growth-ui.js"></script>\n';
function patch(source){
 if(typeof source!=='string'||source.length<5_000_000)throw Error('CANONICAL_TRACKER_REQUIRED');
 const pos=source.indexOf(start);
 if(pos<0||source.indexOf(start,pos+start.length)>=0)throw Error('TRACKER_HTML_DEFINITION_UNEXPECTED');
 // The canonical route is registered earlier in index.js; only touch the first
 // 100 KB of the known client template (header, toolbar, and welcome screen).
 const after=pos+100000;
 if(after>source.length)throw Error('TRACKER_TEMPLATE_TOO_SHORT');
 let fragment=source.slice(pos,after);
 if(fragment.includes(marker)){
  if(!fragment.includes(scriptTag))throw Error('TRACKER_NAV_MISSING_LANGUAGE_CLIENT');
  return {source,changed:false};
 }
 const old='<a id="gbpAdvisorNav"';
 if(fragment.split(old).length!==2)throw Error('TRACKER_TOOLBAR_ANCHOR_CHANGED');
 fragment=fragment.replace(old,growthNav+'    '+old);
 const endhead=fragment.indexOf('</head>');
 if(endhead<0)throw Error('TRACKER_HEAD_MISSING');
 fragment=fragment.slice(0,endhead)+scriptTag+fragment.slice(endhead);
 const oldWelcome='1. Add Sitemap + GSC';
 const newWelcome='1. Add Sitemap (GSC optional)';
 if(fragment.split(oldWelcome).length!==2)throw Error('WELCOME_STEP_MISSING');
 fragment=fragment.replace(oldWelcome,newWelcome);
 const oldDesc='For a new client, add the sitemap and import both GSC Pages and Queries. This identifies real URLs, demand and current performance.';
 const newDesc='Add your sitemap to begin tracking. Google Search Console is optional and provides verified queries, clicks, impressions and rankings when connected.';
 if(fragment.split(oldDesc).length!==2)throw Error('WELCOME_DESCRIPTION_CHANGED');
 fragment=fragment.replace(oldDesc,newDesc);
 return {source:source.slice(0,pos)+fragment+source.slice(after),changed:true};
}
if(require.main===module){
 const original=fs.readFileSync(file,'utf8'),out=patch(original);
 if(process.argv.includes('--write')){
  if(out.changed)fs.writeFileSync(file,out.source);
  console.log(out.changed?'TRACKER_GROWTH_NAV_INTEGRATED':'TRACKER_GROWTH_NAV_ALREADY_PRESENT');
 }else console.log(out.changed?'DRY_RUN_TRACKER_GROWTH_NAV':'DRY_RUN_ALREADY_INTEGRATED');
}
module.exports={patch,marker,growthNav,scriptTag};
