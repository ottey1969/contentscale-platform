'use strict';
// Candidate only: surgically remove side effects from canonical GET; never execute or boot server.
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',output=process.argv[3]||'/tmp/contentscale-readonly-get-candidate.js';
const source=fs.readFileSync(input,'utf8');
const marker="app.get('/api/tracker-client/:token', async (req, res) => {";
const start=source.indexOf(marker),end=source.indexOf('\n});',start);
assert(start>=0 && source.indexOf(marker,start+1)===-1 && end>start && end-start<50000,'Unexpected route boundaries');
let route=source.slice(start,end+4);
if(route.includes("const _colResults = await pool.query")){
 const prohibited=[/\bALTER\s+TABLE\b/i,/\bUPDATE\s+tracker_pages\b/i,/\bINSERT\s+INTO\b/i,
  /\bawait\s+_ensureCaseStudySchema\s*\(/,/\bawait\s+_caseStudyEventForPage\s*\(/];
 for(const re of prohibited)assert(!re.test(route),'Read-only GET was modified after review: '+re);
 fs.writeFileSync(output,source);
 console.log(JSON.stringify({result:'already_patched',get_route_bytes:route.length}));
 process.exit(0);
}
function swap(a,b){
 assert(route.includes(a) && route.split(a).length===2, 'Cannot safely replace '+a.slice(0,95));
 route=route.replace(a,b);
}
function spliceMarkers(a,b,replacement){
 const i=route.indexOf(a), j=route.indexOf(b,i+a.length);
 assert(i>=0&&j>i&&route.indexOf(a,i+1)===-1,'Unexpected migration block '+a.slice(0,65));
 route=route.slice(0,i)+replacement+route.slice(j);
}
swap("    await pool.query('ALTER TABLE tracker_clients ADD COLUMN IF NOT EXISTS claims_facts_updated_at TIMESTAMPTZ').catch(()=>{});",
     "    // Schema must be provisioned before GET; this route never alters customer tables.");
swap("    for (const [col, type] of _trackerMainGetColumns) {\n      await pool.query('ALTER TABLE tracker_pages ADD COLUMN IF NOT EXISTS ' + col + ' ' + type);\n    }\n    // CONTENTSCALE-TRACKER-MAIN-GET-AI-EVIDENCE-HELPER-NAME-FIX-20260909=true\n    await _trackerEnsureAiEvidenceSchema();",
[
"    const _colResults = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tracker_pages'\");",
"    const _existingColumns = new Set(_colResults.rows.map(r => r.column_name));",
"    const _missingColumns = _trackerMainGetColumns.filter(([col]) => !_existingColumns.has(col));",
"    const _requiredTables = ['tracker_ai_evidence','tracker_case_studies','tracker_case_study_content_versions','tracker_case_study_events'];",
"    const _tableResults = await pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])\", [_requiredTables]);",
"    const _existingTables = new Set(_tableResults.rows.map(r => r.table_name));",
"    const _missingTables = _requiredTables.filter(t => !_existingTables.has(t));",
"    if (_missingColumns.length || _missingTables.length) {",
"      return res.status(503).json({ success:false, schema_ready:false, migration_required:true,",
"        missing_columns:_missingColumns.map(([col])=>col), missing_tables:_missingTables,",
"        error:'Tracker requires a controlled schema migration before this dashboard can load.' });",
"    }"
].join('\n'));
swap("    const _briefQueueRepairs=[];", "    // Normalize legacy brief queues in response only. Persistence requires an explicit repair action.");
const norm=/^\s*_briefQueueRepairs\.push\(pool\.query\("UPDATE tracker_pages SET brief_content=.*\)\);\s*$/m;
assert(norm.test(route),'Brief queue repair query changed');
route=route.replace(norm,"\n        _p.brief_requires_persistent_repair=true;");
swap("    if(_briefQueueRepairs.length)await Promise.all(_briefQueueRepairs);","    // No implicit brief updates on GET.");
swap("    await _ensureCaseStudySchema();\n    for(const _p of pagesR.rows)await _ensurePerfectRoofingCaseStudy(client,_p);",
     "    // Case-study creation/attachment must be an explicit reviewed mutation.");
spliceMarkers("    // v351 one-time self-heal:", "    const _csIds=",
     "    // Pre-v351 case-study baseline repairs and legacy monitoring restoration are now explicit maintenance operations.\n");
spliceMarkers("    // v297 milestone self-heal", "    // Self-heal stale operational Briefs",
     "    // Milestone completion requires an explicit event write after verified evidence; GET displays persisted events only.\n\n");
const b=/\s*await pool\.query\(\x60UPDATE tracker_pages SET brief_content=\$1,[\s\S]*?WHERE id=\$2\x60,\[JSON\.stringify\(_b\),_p\.id\]\)\.catch\(\(\)=>\{\}\);/g;
const matches=[...route.matchAll(b)];
assert(matches.length===1,'Unexpected stale-brief repair query count: '+matches.length);
route=route.replace(b,"\n        _p.brief_requires_persistent_repair=true;");
for(const pattern of [
 /ALTER\s+TABLE/i,/CREATE\s+TABLE/i,/\bUPDATE\s+tracker_pages\b/i,/INSERT\s+INTO\s+migration_flags/i,
 /\bawait\s+_ensureCaseStudySchema\s*\(/,/await\s+_ensurePerfectRoofingCaseStudy\s*\(/,
 /\bawait\s+_caseStudyOpenFreshStartCycle\s*\(/,/\bawait\s+_caseStudyEventForPage\s*\(/,
 /\bawait\s+_trackerEnsureAiEvidenceSchema\s*\(/
])assert(!pattern.test(route),'Remaining route write or mutating helper: '+pattern);
const newSource=source.slice(0,start)+route+source.slice(end+4);
fs.writeFileSync(output,newSource);
console.log(JSON.stringify({result:'candidate_only',bytes:Buffer.byteLength(newSource),get_route_bytes:route.length,
  schema_gate:true,full_app_booted:false,neon_writes:false}));
