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
