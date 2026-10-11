'use strict';
// Surgical removal of scan-route schema migrations; never imports server or accesses DB.
// Missing mandatory columns will fail closed at SELECT, never be created by an HTTP scan.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let source=fs.readFileSync(file,'utf8');
const a=source.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const b=source.indexOf('\n// Exact client-side scan status',a);
if(a<0||b<=a||b-a>22000||Buffer.byteLength(source)<6000000)
 throw Error('STOP: canonical manual scan route bounds changed');
let route=source.slice(a,b);
const marker='    // Manual scan route uses migrated canonical schema; never performs DDL.';
const removals=[
 'await _ensureMonitoringGateSchema();',
 "await pool.query('ALTER TABLE tracker_clients ADD COLUMN IF NOT EXISTS claims_facts_updated_at TIMESTAMPTZ').catch(()=>{});"
];
for(const s of removals){
 const n=route.split(s).length-1;
 if(n===1){
  const at=route.indexOf(s),start=route.lastIndexOf('\n',at)+1,end=route.indexOf('\n',at);
  if(end<at||route.slice(start,at).trim()||route.slice(at+s.length,end).trim())
   throw Error('STOP: manual route migration statement changed: '+s);
  route=route.slice(0,start)+route.slice(end+1);
 }else if(n!==0)throw Error('STOP: duplicate route migration');
 else if(!route.includes(marker))throw Error('STOP: missing prior hardened route marker');
}
if(!route.includes(marker)){
 const at=route.indexOf('  try {\n');
 if(at<0)throw Error('STOP: route handler try block changed');
 route=route.slice(0,at+8)+marker+'\n'+route.slice(at+8);
}
if(/(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i.test(route)||
 /_ensureMonitoringGateSchema\s*\(/.test(route))throw Error('STOP: migration survives manual route');
source=source.slice(0,a)+route+source.slice(b);
fs.writeFileSync(file,source);
console.log('Manual Case Study scan route has no implicit schema mutations');
