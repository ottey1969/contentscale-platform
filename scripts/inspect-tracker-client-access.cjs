'use strict';
// Read-only audit of the ACTUAL 6 MB canonical Tracker server. No writes, calls, or tokens.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/index.js'),'utf8');
assert(source.length>5_000_000,'Expected canonical Tracker source, not a stub');
const lines=source.split('\n');
const patterns=[
 /app\.(?:get|post|use)\s*\(\s*['"`]\/track\/:token(?:\/|['"`])/,
 /app\.(?:get|post|use)\s*\(\s*['"`]\/api\/tracker-client\/:token(?:\/|['"`])/,
 /app\.(?:get|post|use)\s*\(\s*['"`]\/api\/admin\/tracker-clients(?:\/|['"`])/
];
const markers=/gsc|search.console|oauth|403|401|res\.redirect|res\.status|status\s*!==|status\s*===|client\.status|scan|required|connect|invite|email/i;
let total=0;
for(let i=0;i<lines.length;i++){
 if(!patterns.some(p=>p.test(lines[i])))continue;
 total++;
 // Print route name and only matching lines, never customer tokens or URL values.
 console.log('ROUTE '+(i+1)+' '+lines[i].trim().slice(0,170));
 for(let k=i+1;k<Math.min(lines.length,i+58);k++){
  if(k>i+2&&patterns.some(p=>p.test(lines[k])))break;
  if(!markers.test(lines[k]))continue;
  const clean=lines[k].trim().slice(0,210)
    .replace(/token\s*[:=]\s*['"`][^'"`]+['"`]/gi,'token=[REDACTED]')
    .replace(/key\s*[:=]\s*['"`][^'"`]+['"`]/gi,'key=[REDACTED]');
  console.log('  '+(k+1)+' '+clean);
 }
 if(total>=40)break;
}
assert(total>0,'Canonical client Tracker routes were not found');
console.log('PASS: inspected '+total+' actual client routes; do not infer access status from a Growth-only test.');

for(const title of ["app.get('/api/tracker-client/:token',", "app.get('/track/:token',", "app.get('/track/:token/live',"]){
 const at=lines.findIndex(l=>l.includes(title));
 if(at<0){console.log('FOCUSED_ROUTE_NOT_FOUND '+title);continue}
 console.log('FOCUSED_ROUTE '+title+' AT '+(at+1));
 for(let j=at;j<Math.min(lines.length,at+55);j++){
  const line=lines[j].trim();
  if(!line||line.length>350)continue;
  if(/password|private_key|api_key|secret|access.token/i.test(line))continue;
  console.log('  '+(j+1)+' '+line.slice(0,280));
 }
}

for(const [label,open,close] of [
 ['CLIENT_API',"app.get('/api/tracker-client/:token',","app.get('/api/tracker-client/:token/briefs/"],
 ['CLIENT_PAGE',"app.get('/track/:token',","app.get('/track/:token/"]
]){
 const from=lines.findIndex(l=>l.includes(open));
 if(from<0)continue;
 let to=lines.findIndex((l,i)=>i>from&&l.includes(close));
 if(to<0||to>from+700)to=Math.min(lines.length,from+350);
 console.log('ACCESS_SCOPE '+label+' '+(from+1)+' to '+(to+1));
 const rg=/gsc|search.console|connect|status|disabled|paused|res\.json|res\.send|res\.redirect|\.query\(|\.rows|catch\s*\(|/i;
 let emitted=0;
 for(let k=from;k<to;k++){
  if(!rg.test(lines[k]))continue;
  const line=lines[k].trim();
  if(/password|private_key|api_key|secret|access.token/i.test(line))continue;
  console.log('  '+(k+1)+' '+line.slice(0,260));
  if(++emitted>=75)break;
 }
}

console.log('CLIENT_MAIN_GET_CONTINUATION 3193-3418');
for(let i=3192;i<Math.min(lines.length,3418);i++){
 const s=lines[i].trim();
 if(!/gsc|\bSELECT\b|\.query\(|res\.json|res\.status|return|\bclient\b|page|catch|await|status/i.test(s))continue;
 if(/password|private_key|api_key|secret|access.token/i.test(s))continue;
 console.log('  '+(i+1)+' '+s.slice(0,270));
}
console.log('GSC_UI_REFERENCES');
let cnt=0;
for(let i=0;i<lines.length;i++){
 if(!/(__GSC_ENABLED__|GSC_ENABLED|GSC_ENABLED|GSC is required|connect GSC|Connect GSC|GSC_REQUIRED)/i.test(lines[i]))continue;
 if(/password|private_key|api_key|secret|access.token/i.test(lines[i]))continue;
 console.log('  '+(i+1)+' '+lines[i].trim().slice(0,280));
 if(++cnt>=28)break;
}
