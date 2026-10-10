'use strict';
// Keep each new Case Study revision strictly manual-only while preserving prior scheduling history.
// Source-only, idempotent; no application boot, database connection or outbound actions.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let src=fs.readFileSync(file,'utf8');
const a=src.indexOf('async function _caseStudyOpenFreshStartCycle(');
const b=src.indexOf('\n// v229: case-study URL pre-flight',a);
if(a<0||b<=a||b-a>12500||Buffer.byteLength(src)<6000000)
 throw Error('STOP: canonical Case Study cycle method changed');
let method=src.slice(a,b);
const historyFrom='    previous_revision_cycle:previousCycle,';
const historyTo="    previous_revision_cycle:previousCycle,\n    previous_check_frequency:page.check_frequency||'0',\n    previous_next_check_at:page.next_check_at||null,";
if(!method.includes('previous_check_frequency:')){
 if(method.split(historyFrom).length!==2)throw Error('STOP: prior schedule history marker drifted');
 method=method.replace(historyFrom,historyTo);
}
const resetFrom='      revision_cycle=$1,\n      is_done=FALSE';
const resetTo="      revision_cycle=$1,\n      check_frequency='0',next_check_at=NULL,\n      is_done=FALSE";
if(!method.includes("check_frequency='0',next_check_at=NULL")){
 if(method.split(resetFrom).length!==2)throw Error('STOP: new cycle UPDATE anchor drifted');
 method=method.replace(resetFrom,resetTo);
}
if(!method.includes("previous_check_frequency:page.check_frequency")||!method.includes("check_frequency='0',next_check_at=NULL"))
 throw Error('STOP: manual-only Case Study invariants missing');
src=src.slice(0,a)+method+src.slice(b);
fs.writeFileSync(file,src);
console.log('Case Study new revision: scheduler disabled; previous schedule preserved in history');
