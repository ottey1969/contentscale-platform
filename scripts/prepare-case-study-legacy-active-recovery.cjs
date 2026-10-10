'use strict';
// Prepare active legacy Case Studies that lack the fresh-cycle marker.
// Only on explicit POST; no GET mutations, no scheduler and no baseline replacement.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../src/index.js');
let s=fs.readFileSync(file,'utf8');
const start=s.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/case-study/start',");
const end=s.indexOf('\n// POST /pages/:pageId/baseline-gsc',start);
const uiStart=s.indexOf('function _trackerNextActionState(');
const uiEnd=s.indexOf('\nfunction _trackerImplementationCheckState(',uiStart);
const action=s.indexOf('function startCaseStudy(pageId){');
if(start<0||end<start||uiStart<0||uiEnd<uiStart||action<0||Buffer.byteLength(s)<6000000)
 throw Error('STOP: source or protected route anchors changed');
const old=[
 "      const _baseAt=Date.parse(existing.rows[0].baseline_at||existing.rows[0].started_at||0)||0;",
 "      const _verifiedAt=Date.parse(page.implementation_verified_at||0)||0;",
 "      const _fresh=(_baseAt&&_verifiedAt&&_verifiedAt<_baseAt)?await _caseStudyOpenFreshStartCycle(client.id,page,existing.rows[0],'','case_study_baseline_copy','active_case_study_pre_v351_repair'):null;"
].join('\n');
const replacement=[
 "      const _baseAt=Date.parse(existing.rows[0].baseline_at||existing.rows[0].started_at||0)||0;",
 "      const _verifiedAt=Date.parse(page.implementation_verified_at||0)||0;",
 "      // Inspect canonical DB evidence; no legacy inferred case_study_active column.",
 "      const _legacy=await pool.query(\`SELECT",
 "        EXISTS(SELECT 1 FROM tracker_case_study_events ev WHERE ev.case_study_id=$1 AND ev.event_type='case_study_fresh_cycle_initialized') AS fresh_cycle_initialized,",
 "        (SELECT MAX(sn.checked_at) FROM tracker_snapshots sn WHERE sn.page_id=$2) AS latest_snapshot_at,",
 "        (SELECT MAX(v.captured_at) FROM tracker_case_study_content_versions v WHERE v.case_study_id=$1 AND v.version_type LIKE 'published_implementation%') AS latest_published_at,",
 "        EXISTS(SELECT 1 FROM tracker_case_study_content_versions v WHERE v.case_study_id=$1 AND v.version_type='baseline_html' AND LENGTH(v.html_content)>=500) AS baseline_html_ready\`,",
 "        [existing.rows[0].id,page.id]);",
 "      const _prior=_legacy.rows[0]||{};",
 "      const _lastAt=Date.parse(_prior.latest_snapshot_at||0)||0;",
 "      const _publishedAt=Math.max(Date.parse(_prior.latest_published_at||0)||0,Date.parse(page.brief_published_at||0)||0,Date.parse(page.brief_published_confirmed_at||0)||0);",
 "      const _needsCycleRepair=!_prior.fresh_cycle_initialized;",
 "      const _repairReasons=[];",
 "      if(_needsCycleRepair){",
 "        if(!existing.rows[0].baseline_locked||!_baseAt)_repairReasons.push('baseline not locked');",
 "        if(!_prior.baseline_html_ready)_repairReasons.push('protected baseline HTML missing');",
 "        if(page.monitoring_waiting_input)_repairReasons.push('evidence checkpoint pending');",
 "        if(_lastAt>_baseAt)_repairReasons.push('a scan already occurred after the baseline');",
 "        if(_verifiedAt>_baseAt)_repairReasons.push('implementation verified after baseline');",
 "        if(_publishedAt>_baseAt)_repairReasons.push('revision published after baseline');",
 "      }",
 "      if(_repairReasons.length)return res.status(409).json({success:false,case_cycle_review_required:true,baseline_locked:true,error:'This active Case Study requires review before preparing its first manual scan: '+_repairReasons.join('; '),missing:_repairReasons});",
 "      const _fresh=_needsCycleRepair?await _caseStudyOpenFreshStartCycle(client.id,page,existing.rows[0],'','case_study_baseline_copy','active_legacy_case_first_manual_scan_repair'):null;"
].join('\n');
let route=s.slice(start,end);
if(!route.includes('active_legacy_case_first_manual_scan_repair')){
 if(route.split(old).length!==2)throw Error('STOP: legacy active Case Study branch changed');
 route=route.replace(old,replacement);
 s=s.slice(0,start)+route+s.slice(end);
}
const marker="  if(bool(p.case_study_active)&&bool(p.case_study_fresh_cycle_initialized)&&_caseBaselineAt>0&&";
const next=[
"  if(bool(p.case_study_active)&&!bool(p.case_study_fresh_cycle_initialized)&&_caseBaselineAt>0&&",
"      !bool(p.monitoring_waiting_input)&&(!scanAt||scanAt<=_caseBaselineAt)&&",
"      !(publishedAt>_caseBaselineAt)&&!(verifiedAt>_caseBaselineAt)){",
"    return {code:'PREPARE_CASE',label:'CASE STUDY ACTIVE · PREPARE FIRST MANUAL SCAN',",
"      detail:'This protected Case Study started before the new scan workflow. Prepare its current revision once; the old baseline and Brief will be archived. Then you can manually scan. Automatic scans stay off.',",
"      color:'#fbbf24',border:'#a16207',bg:'#2a1f05',button:'Prepare first manual scan',buttonAction:'startCaseStudy('+p.id+')'};",
"  }",
""
].join('\n');
let ui=s.slice(s.indexOf('function _trackerNextActionState('),s.indexOf('\nfunction _trackerImplementationCheckState(',s.indexOf('function _trackerNextActionState(')));
if(!ui.includes("CASE STUDY ACTIVE · PREPARE FIRST MANUAL SCAN")){
 if(ui.split(marker).length!==2)throw Error('STOP: NEXT ACTION first-scan marker changed');
 ui=ui.replace(marker,next+marker);
 s=s.slice(0,uiStart)+ui+s.slice(uiEnd);
}
const actionMarker="function startCaseStudy(pageId){\n  var pg=(_pages||[]).find(function(x){return Number(x.id)===Number(pageId);})||{};";
const recovery=[
"  if(pg.case_study_active&&!pg.case_study_fresh_cycle_initialized){",
"    if(!confirm('This Case Study is already active. Prepare its first manual scan now? The original baseline and historical Brief remain protected; no scan starts automatically.'))return;",
"    api('/pages/'+pageId+'/case-study/start','POST',{monitoring_enabled:false,check_frequency:'0'})",
"      .then(function(d){alert((d&&d.message)||'Case Study ready for the first manual scan.');if(typeof loadPages==='function')loadPages();})",
"      .catch(function(e){alert(e.message||'Could not safely prepare the existing Case Study');});",
"    return;",
"  }",
""
].join('\n');
if(!s.includes('Could not safely prepare the existing Case Study')){
 if(s.split(actionMarker).length!==2)throw Error('STOP: original startCaseStudy action changed');
 s=s.replace(actionMarker,actionMarker+'\n'+recovery);
}
if(!s.includes('case_cycle_review_required:true')||!s.includes("CASE STUDY ACTIVE · PREPARE FIRST MANUAL SCAN")||
   !s.includes('Could not safely prepare the existing Case Study'))throw Error('STOP: incomplete legacy case recovery');
fs.writeFileSync(file,s);
console.log('Legacy active Case Study recovery added to canonical explicit POST + NEXT ACTION; no silent reset');
