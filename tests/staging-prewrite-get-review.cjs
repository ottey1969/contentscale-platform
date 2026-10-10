'use strict';
const fs=require('node:fs');const s=fs.readFileSync('src/index.js','utf8');
const marker="app.get('/api/tracker-client/:token/prewrite-briefs/:id'";
const at=s.indexOf(marker),end=s.indexOf('\napp.',at+marker.length);
if(at<0||end<at||end-at>18000)throw Error('Unexpected prewrite GET boundaries');
const lines=s.slice(at,end).split(/\r?\n/),base=s.slice(0,at).split('\n').length;
const records=[];
for(let i=0;i<lines.length;i++)if(/integrity|migrat|auto|UPDATE prewrite|res\.json|pool\.query|_viewBrief|_autoMigrated|_integrityMigrated|catch|share|normalize|repair|brief_json/.test(lines[i]))records.push({line:base+i,source:lines[i].trim().slice(0,340)});
console.log(JSON.stringify({audit:'prewrite_read_side_effect_review',start:base,lines:lines.length,records:records.slice(0,140)}));
