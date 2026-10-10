'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const sourcePath=process.argv[2]||'src/index.js',output=process.argv[3]||'/tmp/contentscale-case-reads.js';
let s=fs.readFileSync(sourcePath,'utf8');
const caseGet="app.get('/api/tracker-client/:token/pages/:pageId/case-study',async(req,res)=>{try{";
assert(s.split(caseGet).length===2,'Unexpected case-study GET');
const helper=[
"async function _trackerCaseStudyReadonlySchema(spec={}) {",
" const tables=[...new Set(spec.tables||[])];",
" const rr=await pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])\",[tables]);",
" const found=new Set(rr.rows.map(r=>r.table_name));",
" const missingTables=tables.filter(t=>!found.has(t));",
" const missingColumns=[];",
" for(const [table,columns] of [['tracker_pages',spec.pageColumns||[]],['tracker_case_studies',spec.caseColumns||[]]]) {",
"  if(!columns.length)continue;",
"  const cc=await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=ANY($2::text[])\",[table,columns]);",
"  const existing=new Set(cc.rows.map(r=>r.column_name));",
"  for(const col of columns)if(!existing.has(col))missingColumns.push(table+'.'+col);",
" }",
" return {ready:missingTables.length===0&&missingColumns.length===0,missing_tables:missingTables,missing_columns:missingColumns};",
"}",
""
].join('\n');
if(!s.includes('async function _trackerCaseStudyReadonlySchema('))s=s.replace(caseGet,helper+caseGet);
function changeRoute(marker,limit,old,newText) {
 const start=s.indexOf(marker),next=s.indexOf('\napp.',start+marker.length),close=s.indexOf('\n});',start);
 assert(start>=0&&s.indexOf(marker,start+1)===-1,'GET marker not unique '+marker);
 const end=Math.min(next>start?next:s.length,close>start?close+4:s.length,start+limit);
 assert(end>start,'Invalid GET route boundary');
 const body=s.slice(start,end);
 assert(body.split(old).length===2,'GET source moved '+marker);
 s=s.slice(0,start)+body.replace(old,newText)+s.slice(end);
}
const tables="['tracker_case_studies','tracker_case_study_events','tracker_case_study_content_versions']";
changeRoute(caseGet,5500,"await _ensureCaseStudySchema();",
"const _schema=await _trackerCaseStudyReadonlySchema({tables:"+tables+"});if(!_schema.ready)return res.status(503).json({success:false,schema_ready:false,error:'Controlled case-study schema migration required',missing_tables:_schema.missing_tables});");
changeRoute("app.get('/case-study-report/:reportToken',async(req,res)=>{try{",6500,
"await _ensureCaseStudySchema();const token=String(req.params.reportToken||'');if(!/^[a-f0-9]{48}$/.test(token))return res.status(404).send('Report not found');",
"const token=String(req.params.reportToken||'');if(!/^[a-f0-9]{48}$/.test(token))return res.status(404).send('Report not found');const _schema=await _trackerCaseStudyReadonlySchema({tables:['tracker_case_studies','tracker_case_study_events'],caseColumns:['report_token']});if(!_schema.ready)return res.status(503).send('Report temporarily unavailable: schema migration required');");
changeRoute("app.get('/api/admin/tracker-clients/:id/monitoring', verifyAdmin, async (req, res) => {",1800,
"await _ensureMonitoringGateSchema();",
"const _schema=await _trackerCaseStudyReadonlySchema({tables:['tracker_clients','tracker_pages'],pageColumns:['monitoring_waiting_input','monitoring_gate_label','check_frequency','next_check_at']});if(!_schema.ready)return res.status(503).json({success:false,schema_ready:false,error:'Controlled monitoring schema migration required',missing_columns:_schema.missing_columns});");
changeRoute("app.get('/api/admin/tracker-readiness', verifyAdmin, async (req,res)=>{",5500,
"await _ensureCaseStudySchema();await _ensureMonitoringGateSchema();await _trackerEnsureAiEvidenceSchema();",
"const _schema=await _trackerCaseStudyReadonlySchema({tables:['tracker_case_studies','tracker_case_study_events','tracker_case_study_content_versions','tracker_ai_evidence','tracker_clients','tracker_pages'],pageColumns:['monitoring_waiting_input','monitoring_request_at','monitoring_require_ai','monitoring_gate_label','monitoring_gsc_pages_at','monitoring_gsc_queries_at','check_frequency','next_check_at']});if(!_schema.ready)return res.status(503).json({success:false,ready:false,schema_ready:false,error:'Controlled Tracker schema migration required',missing_tables:_schema.missing_tables,missing_columns:_schema.missing_columns});");
for(const marker of [caseGet,"app.get('/case-study-report/:reportToken'","app.get('/api/admin/tracker-clients/:id/monitoring'","app.get('/api/admin/tracker-readiness'"]){
 const at=s.indexOf(marker),end=s.indexOf('\napp.',at+marker.length);
 assert(at>=0,'Missing case GET marker');
 const body=s.slice(at,end>at?end:at+5500);
 assert(!/await _ensureCaseStudySchema\(\)|await _ensureMonitoringGateSchema\(\)|await _trackerEnsureAiEvidenceSchema\(\)/.test(body),'Mutating helper still called in '+marker);
}
assert(s.includes('async function _ensurePerfectRoofingCaseStudy('),'Historic baseline code unexpectedly removed');
assert(!s.includes('await _ensurePerfectRoofingCaseStudy('),'Hardcoded baseline auto-attach must remain dormant');
fs.writeFileSync(output,s);
console.log(JSON.stringify({result:'read_only_case_study_candidate',patched_get_routes:4,full_app_booted:false,writes_performed:false}));
