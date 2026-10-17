'use strict';
// Idempotent canonical patch, no DB writes, no token or GSC permission changes.
// Runs against the same src/index.js used by the production Tracker route.
// The recommendation must not imply that other Tracker actions await GSC.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const start='function _renderGscRequiredGate(d) {';
const end='function _renderGscSetupBanner() {';
const marker='CONTENTSCALE_TRACKER_GSC_OPTIONAL_ADVICE_V1';
const next=[
"function _renderGscRequiredGate(d) {",
"  // CONTENTSCALE_TRACKER_GSC_OPTIONAL_ADVICE_V1: GSC is not an entry requirement.",
"  // Remove any old modal and display optional help inside existing Tracker.",
"  var old=document.getElementById('csGscRequiredGate'); if(old) old.remove();",
"  var host=document.getElementById('gscSetupBanner');",
"  if(!host || _NETWORK_PREWRITE_AUTHORIZED) return;",
"  var prior=document.getElementById('csGscOptionalAdvice'); if(prior) prior.remove();",
"  if(d && d.connected) return;",
"  var note=document.createElement('div');",
"  note.id='csGscOptionalAdvice';",
"  note.setAttribute('role','note');",
"  note.style.cssText='margin:0 0 10px;padding:12px 14px;border:1px solid #2563eb;border-radius:9px;background:#0b192e;color:#dbeafe;font-size:12px;line-height:1.55;';",
"  var title=document.createElement('strong');",
"  title.textContent='Recommended — Connect Google Search Console (optional)';",
"  title.style.cssText='display:block;color:#93c5fd;font-size:12px;margin-bottom:5px;';",
"  var info=document.createElement('div');",
"  info.textContent='You can use Tracker now without connecting GSC. Connect it later for verified Google queries, clicks, impressions, rankings and comparable before/after measurements. Missing GSC data is not zero traffic.';",
"  note.appendChild(title);note.appendChild(info);",
"  host.prepend(note);",
"}",
""
].join('\n');
function patch(s){
 if(typeof s!=='string'||s.length<5_000_000)throw Error('CANONICAL_TRACKER_SOURCE_REQUIRED');
 const i=s.indexOf(start),e=s.indexOf(end,i);
 if(i<0||e<=i||s.indexOf(start,i+start.length)>=0)throw Error('TRACKER_GSC_GATE_BOUNDS_AMBIGUOUS');
 const gate=s.slice(i,e);
 if(gate.includes(marker)){
  if(gate.includes('position:fixed;inset:0'))throw Error('MODAL_STILL_PRESENT');
  const updated=s.replace('it runs Step 2 first if you skipped it, then scans every affected page','it runs the intent-grouping step first when needed, then scans every affected page');
  return {source:updated,changed:updated!==s};
 }
 if(!gate.includes("gate.style.cssText='position:fixed;inset:0"))throw Error('EXPECTED_SCREEN_BLOCKING_GSC_MODAL_NOT_FOUND');
 if(!gate.includes('GSC is mandatory in Tracker'))throw Error('MANDATORY_GSC_TEXT_MISSING');
 let out=s.slice(0,i)+next+s.slice(e);
 const replacements=[
  ['How this tracker works \\u2014 do these in order','Tracker workflow \\u2014 GSC is optional'],
  ['Step 1 \\u2014 Connect one-click GSC data','Optional \\u2014 Connect Google Search Console'],
  ['Step 1 \\u2014 Import your GSC data','Optional \\u2014 Import GSC data'],
  ['Step 2 \\u2014 Sort this out for me','Step 1 \\u2014 Sort this out for me'],
  ['Step 3 \\u2014 Scan','Step 2 \\u2014 Scan']
 ];
 for(const [oldText,newText] of replacements){
  if(out.split(oldText).length!==2)throw Error('AMBIGUOUS_GSC_BANNER_COPY: '+oldText);
  out=out.replace(oldText,newText);
 }
 out=out.replace('it runs Step 2 first if you skipped it, then scans every affected page','it runs the intent-grouping step first when needed, then scans every affected page');
 if(out.includes('GSC is mandatory in Tracker')||out.includes('Required before Tracker can continue'))throw Error('OLD_GSC_BLOCKER_COPY_STILL_PRESENT');
 return {source:out,changed:true};
}
if(require.main===module){
 const before=fs.readFileSync(file,'utf8'),result=patch(before);
 if(process.argv.includes('--write')){
  if(result.changed)fs.writeFileSync(file,result.source);
  console.log(result.changed?'GSC_MODAL_REPLACED_WITH_INLINE_RECOMMENDATION':'GSC_OPTIONAL_RECOMMENDATION_ALREADY_PRESENT');
 } else console.log(result.changed?'DRY_RUN_GSC_OPTIONAL_RECOMMENDATION':'NO_CHANGE');
}
module.exports={patch,start,end,marker};
