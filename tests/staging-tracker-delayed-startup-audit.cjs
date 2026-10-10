'use strict';
// Narrow potential app-boot write/time triggers. Runs on source only, no app start.
const fs=require('node:fs');
for(const file of ['src/index.js','index.js']){
 const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
 const needles=[
  'migrateTrackerPageProfiles();',
  "setTimeout(async () => {",
  "setImmediate(async () => {",
  "contact_intelligence_imports WHERE status IN ('uploaded','processing')",
  "setInterval(()=>_pqsSendDueCeoFollowups()",
  "createAllTables().catch",
  "setInterval(cleanOldJobs",
  "const keepAlive = setInterval"
 ];
 for(const needle of needles){
  const hits=[];
  for(let i=0;i<lines.length;i++){
   if(!lines[i].includes(needle))continue;
   const from=Math.max(0,i-9),to=Math.min(lines.length,i+15);
   const context=lines.slice(from,to).map((text,k)=>({line:from+k+1,
    text:text.trim().slice(0,210)}));
   hits.push({line:i+1,context});
   if(hits.length>=2)break;
  }
  console.log(JSON.stringify({audit:'delayed_startup_exact_context',file,needle,
   hits:hits.slice(0,2)}));
 }
 const timers=[];
 for(let i=0;i<lines.length;i++){
  if(!/\bsetInterval\s*\(/.test(lines[i]))continue;
  if(/document\.|window\.|<script>|const js=|const live=/.test(lines[i]))continue;
  timers.push({line:i+1,text:lines[i].trim().slice(0,190)});
 }
 console.log(JSON.stringify({audit:'candidate_nonbrowser_intervals',file,lines:timers.slice(0,90)}));
}
