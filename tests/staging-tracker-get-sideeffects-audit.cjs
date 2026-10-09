'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8');
const start=s.indexOf("app.get('/api/tracker-client/:token', async (req, res) => {");
if(start<0)throw Error('canonical GET route missing');
const end=s.indexOf('\n});',start);
if(end<start||end-start>50000)throw Error('GET route shape unexpectedly changed');
const firstLine=s.slice(0,start).split('\n').length;
const lines=s.slice(start,end+4).split('\n');
const match=/\b(?:ALTER\s+TABLE|CREATE\s+TABLE|INSERT\s+INTO|UPDATE\s+tracker_|DELETE\s+FROM|migration_flags|_briefQueueRepairs|_restored|COALESCE\s*\()\b/i;
const report=[];
for(let i=0;i<lines.length;i++){
 const l=lines[i].trim();
 if(match.test(l)){
  report.push({line:firstLine+i,context:lines.slice(Math.max(0,i-2),Math.min(lines.length,i+3))
    .map((z,ix)=>({line:firstLine+Math.max(0,i-2)+ix,src:z.trim().slice(0,320)}))});
 }
}
console.log(JSON.stringify({audit:'tracker_get_side_effects',route_start:firstLine,route_lines:lines.length,hits:report.length,report:report.slice(0,90)}));
