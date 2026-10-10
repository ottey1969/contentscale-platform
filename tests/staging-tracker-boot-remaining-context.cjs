'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8'),l=s.split(/\r?\n/);
const markers=[
 "migrateTrackerPageProfiles();",
 "await detectBestGeminiModel(",
 "UPDATE content_jobs SET status='error'",
 "const r = await pool.query(",
 "Resuming interrupted batch job",
 "setInterval(cleanupExpiredSessions",
 "setInterval(bulkWorkerTick",
 "_ciStartWorkers()",
 "_trackerSchedulerTimer = setInterval",
 "setInterval(autoCloseSessions",
 "setInterval(cleanOldJobs",
 "async function migrateTrackerPageProfiles("
];
for(const marker of markers){
 const hits=[];
 for(let i=0;i<l.length;i++){if(!l[i].includes(marker))continue;
  const from=Math.max(0,i-9),to=Math.min(l.length,i+16);
  hits.push({line:i+1,near:l.slice(from,to).map((text,j)=>({n:from+j+1,s:text.trim().slice(0,185)}))});
  if(hits.length>=3)break;
 }
 console.log(JSON.stringify({audit:'release_boot_exact_calls',marker,found:hits.length,hits:hits.slice(0,3)}));
}
