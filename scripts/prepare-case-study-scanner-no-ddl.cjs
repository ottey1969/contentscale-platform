'use strict';
// Source-only surgical transform. Never boots ContentScale or accesses database.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let src=fs.readFileSync(file,'utf8');
const a=src.indexOf('async function runTrackerCheck('),b=src.indexOf('\n// ── Custom news management',a);
if(a<0||b<=a||b-a>350000||Buffer.byteLength(src)<6000000)throw Error('STOP: canonical scanner markers changed');
let body=src.slice(a,b);
const ddl=[
 'ALTER TABLE tracker_snapshots ADD COLUMN IF NOT EXISTS gsc_brief JSONB',
 'ALTER TABLE tracker_snapshots ADD COLUMN IF NOT EXISTS source_suggestions JSONB',
 'ALTER TABLE tracker_snapshots ADD COLUMN IF NOT EXISTS author_trust_score INTEGER',
 'ALTER TABLE tracker_snapshots ADD COLUMN IF NOT EXISTS author_trust_findings JSONB',
 'ALTER TABLE tracker_snapshots ADD COLUMN IF NOT EXISTS discovered_sources JSONB',
 'ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS brief_check_count INTEGER DEFAULT 0',
 'ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS brief_content JSONB',
 'ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS brief_started_at TIMESTAMPTZ'
];
for(const statement of ddl){
 const line="await pool.query('"+statement+"').catch(()=>{});";
 const count=body.split(line).length-1;
 if(count===1){
  const at=body.indexOf(line),start=body.lastIndexOf('\n',at)+1,end=body.indexOf('\n',at);
  if(at<0||end<at||body.slice(start,at).trim()||body.slice(at+line.length,end).trim())
    throw Error('STOP: unexpected text on scanner DDL line: '+statement);
  body=body.slice(0,start)+body.slice(end+1);
 }
 else if(count!==0)throw Error('STOP: scanner DDL anchor duplicated: '+statement);
}
const marker='  keys = keys || {};';
const gate=[
 '  // Canonical schema migrations are never executed by a customer scan.',
 '  // Fail BEFORE any fetch, scoring or write when required columns are absent.',
 "  const _requiredScanColumns = {tracker_snapshots:['gsc_brief','source_suggestions','author_trust_score','author_trust_findings','discovered_sources'],tracker_pages:['brief_check_count','brief_content','brief_started_at']};",
 "  const _columnResult=await pool.query(\"SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('tracker_snapshots','tracker_pages') AND column_name=ANY($1::text[])\",[Object.values(_requiredScanColumns).flat()]);",
 "  const _present = new Set((_columnResult.rows||[]).map(r=>String(r.table_name)+'.'+String(r.column_name)));",
 "  const _missing = Object.entries(_requiredScanColumns).flatMap(([table,cols])=>cols.filter(col=>!_present.has(table+'.'+col)).map(col=>table+'.'+col));",
 "  if(_missing.length)throw new Error('TRACKER SCAN BLOCKED: database schema is incomplete: '+_missing.join(', '));"
].join('\n');
if(!body.includes('TRACKER SCAN BLOCKED: database schema is incomplete')){
 if(body.split(marker).length!==2)throw Error('STOP: scanner entry anchor drifted');
 body=body.replace(marker,gate+'\n'+marker);
}
body=body.replace('  // Add new JSONB columns if not exists','  // Required schema checked before any scan action.');
body=body.replace('    // Ensure columns exist first','    // Required schema checked before any scan action.');
if(/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i.test(body))throw Error('STOP: scanner still contains schema DDL');
if(ddl.some(d=>body.includes(d)))throw Error('STOP: migration anchor survives');
if(!body.includes('TRACKER SCAN BLOCKED: database schema is incomplete'))throw Error('STOP: schema gate missing');
src=src.slice(0,a)+body+src.slice(b);
fs.writeFileSync(file,src);
console.log('Scanner preflight installed; eight scan-time DDL statements removed');
