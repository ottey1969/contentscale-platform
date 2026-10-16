'use strict';
// Deterministic one-time migration of the canonical Tracker page view.
// This edits the existing source in-place (no overlay, duplicate UI or live state writes).
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../src/index.js');
let source=fs.readFileSync(file,'utf8');
const marker='CONTENTSCALE_CANONICAL_GROWTH_JOURNEY_V1';
if(source.includes(marker)){console.log('Tracker journey integration already present');process.exit(0);}
function once(before,after,name){
 const i=source.indexOf(before);
 if(i<0||source.indexOf(before,i+before.length)>=0)throw Error('AMBIGUOUS_TRACKER_INTEGRATION: '+name);
 source=source.slice(0,i)+after+source.slice(i+before.length);
}
// Render the exact same pure state module tested in Node inside the existing
// client Tracker code. Do not create another frontend or change routes.
once('function _trackerNextActionState(p,isDone,lastCheckedRaw,nextEvidence){',
 '\n// '+marker+'\n'+
 '${require(\'fs\').readFileSync(require(\'path\').join(__dirname,\'tracker-page-journey.cjs\'),\'utf8\')}\n'+
 'function _trackerNextActionState(p,isDone,lastCheckedRaw,nextEvidence){',
 'canonical module inclusion');
const guard=[
 '  var _journey=window.ContentScaleTrackerJourney&&window.ContentScaleTrackerJourney.inspect(p,lastCheckedRaw);',
 '  if(_journey&&_journey.current_scan_needs_brief)return {code:\'BRIEF_PENDING\',',
 '    label:\'CURRENT SCAN SAVED · WAIT FOR CURRENT BRIEF\',',
 '    detail:\'A scan from this cycle exists, but the old Brief is not its result. Do not rescan or republish the historical Brief. Wait for the current evaluation.\',',
 '    color:\'#fbbf24\',border:\'#a16207\',bg:\'#2a1f05\',button:\'\',buttonAction:\'\'};',
 '  if(_journey&&_journey.historical_brief)return {code:\'MONITOR\',',
 '    label:\'HISTORICAL BRIEF · EVIDENCE MONITORING\',',
 '    detail:\'This Brief belongs to older evidence and is kept in Proof & History. It is not a new publication order. My Check and automatic scan scheduling are separate statuses. \'+(nextEvidence||\'Wait for the next verified checkpoint.\'),',
 '    color:\'#86efac\',border:\'#16a34a\',bg:\'#052e16\',button:\'\',buttonAction:\'\'};',
 ''
].join('\n');
once('  if(personalSafetyStale){',guard+'  if(personalSafetyStale){','central stale-brief precedence');
const from='SCAN COMPLETE · OPEN THE BRIEF';
const count=source.split(from).length-1;
if(count!==3)throw Error('EXPECTED_THREE_BRIEF_LABELS_FOUND_'+count);
source=source.split(from).join('CURRENT CYCLE · REVIEW VERIFIED BRIEF ACTIONS');
const growthUI=[
'function _trackerGrowthOverviewHtml(){',
'  var root=\'/track/\'+encodeURIComponent(TOKEN)+\'/growth\';',
'  return \'<div id="trackerGrowthOverview" data-tour="growth-overview" style="padding:13px 15px;margin:10px 0;background:#091724;border:1px solid #155e75;border-radius:10px;">\'',
'   +\'<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;"><div style="min-width:190px;flex:1;">\'',
'   +\'<strong style="font-size:12px;color:#67e8f9;">GROWTH · VAN BEWIJS NAAR KLIKKEN</strong>\'',
'   +\'<div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Binnen dezelfde Tracker: zoekkans → intentie/competitoren → gecontroleerde verbetering → CMS-overdracht → 14/30/60-dagenmeting.</div></div>\'',
'   +\'<a style="color:#67e8f9;font-size:11px;border:1px solid #0891b2;border-radius:6px;padding:6px 9px;text-decoration:none;" href="\'+root+\'">Bekijk kansen</a>\'',
'   +\'<a style="color:#86efac;font-size:11px;border:1px solid #166534;border-radius:6px;padding:6px 9px;text-decoration:none;" href="\'+root+\'/measurement">Meet resultaten</a>\'',
'   +\'<button type="button" onclick="startTour(true)" style="font-size:11px;color:#c4b5fd;background:#1e1b4b;border:1px solid #7c3aed;border-radius:6px;padding:7px 10px;cursor:pointer;">Tour</button>\'',
'   +\'</div></div>\';',
'}',
'function _trackerGrowthPageHtml(p,lastCheckedRaw){',
'  var j=window.ContentScaleTrackerJourney.inspect(p,lastCheckedRaw);',
'  var id=Number(p.id);if(!Number.isSafeInteger(id)||id<1)return \'\';',
'  var impr=p.gsc_impressions==null?null:Number(p.gsc_impressions);',
'  var clk=p.gsc_clicks==null?null:Number(p.gsc_clicks);',
'  var verifiedGsc=impr!==null&&clk!==null&&Number.isFinite(impr)&&Number.isFinite(clk);',
'  var figures=verifiedGsc?Math.max(0,clk).toLocaleString()+\' clicks · \'+Math.max(0,impr).toLocaleString()+\' impressions\':\'GSC data: Needs access / refresh\';',
'  var note=j.historical_brief?\'Historical Brief: no new publication required.\':',
'    j.current_scan_needs_brief?\'Current scan saved; previous Brief is history.\':',
'    j.current_brief_review_required?\'This cycle has \'+j.current_brief_actions+\' open actions. My Check is not publication proof.\':',
'    j.implementation_verified?\'Current revision verified: measure dated outcomes.\':',
'    \'Research intent and real competitor evidence before creating content.\';',
'  var root=\'/track/\'+encodeURIComponent(TOKEN)+\'/growth\';',
'  var cid=_client&&Number.isSafeInteger(Number(_client.id))?Number(_client.id):null;',
'  var handoff=\'/growth/cms-handoff\'+(cid?\'?client_id=\'+cid+\'&page_id=\'+id:\'\');',
'  return \'<details data-tour="growth-page" style="margin:8px 14px 10px;border:1px solid #164e63;border-radius:8px;background:#071724;">\'',
'    +\'<summary style="padding:10px 12px;cursor:pointer;color:#67e8f9;font-size:11px;font-weight:800;">GROWTH · \'+figures+\'</summary>\'',
'    +\'<div style="padding:0 12px 12px;color:#cbd5e1;font-size:11px;line-height:1.65;"><p>\'+note+\'</p>\'',
'    +\'<p>\'+(j.manual_checked?\'My Check: personally handled. \':\'\')+(j.scheduled_scans_enabled?\'Scheduled scans enabled. \':\'Scheduled scans OFF. \')+\'Case Study evidence checkpoints remain separate.</p>\'',
'    +\'<div style="display:flex;gap:12px;flex-wrap:wrap;"><a style="color:#67e8f9;" href="\'+root+\'">1. Search &amp; intent evidence</a>\'',
'    +\'<a style="color:#93c5fd;" href="\'+handoff+\'" title="Admin/editor approval, never autopublish">2. Deliver to Wix / WordPress / any CMS</a>\'',
'    +\'<a style="color:#86efac;" href="\'+root+\'/measurement">3. Measure click change</a></div>\'',
'    +\'<div style="margin-top:9px;font-size:10px;color:#94a3b8;">Aggregate clicks are not verified nonbrand clicks. AI mentions are not citations. Missing evidence is unknown, never 0. Nothing auto-publishes.</div>\'',
'    +\'</div></details>\';',
'}',
''
].join('\n');
once('function renderPages() {',growthUI+'function renderPages() {','embedded Growth views');
once('el.innerHTML = opportunityCycleHtml + leadQueueHtml + mdBarHtml + sorted.map(function(p, pageIdx) {',
 'el.innerHTML = opportunityCycleHtml + leadQueueHtml + mdBarHtml + _trackerGrowthOverviewHtml() + sorted.map(function(p, pageIdx) {','overview order');
once('      + _trackerNextActionHtml(p,isDone,lastCheckedRaw,nextEvidence)',
 '      + _trackerNextActionHtml(p,isDone,lastCheckedRaw,nextEvidence)\n      + _trackerGrowthPageHtml(p,lastCheckedRaw)',
 'per-page Growth panel');
once('Completed / Monitoring \\\\u2014 kept visible for proof & history',
 'Completed / Monitoring \\\\u2014 My Check is personal; Brief and publication proof stay separate','group label');
once('  {sel:\'[data-tour="page-card"]\',phase:\'EXISTING PAGE\'',
 "  {sel:'#trackerGrowthOverview',phase:'GROWTH',title:'Growth inside Tracker',text:'Start from exact-page demand and search intent, compare actual ranking competitors and prioritize useful verified edits. Do not restart old scans just to open an old Brief.'},\n"+
 "  {sel:'[data-tour=\"growth-page\"]',phase:'PAGE GROWTH',title:'One page, one Growth opportunity',text:'Every existing and future page has a Growth panel: verified GSC opportunities, CMS-neutral delivery, and outcome measurement. Personal My Check does not prove publication; automatic scan Off does not cancel Case Study evidence checkpoints.'},\n"+
 "  {sel:'[data-tour=\"page-card\"]',phase:'EXISTING PAGE'", 'Growth tour steps');
once("title:'Your personal work marker',text:'My Check moves a handled page into Completed / Monitoring without deleting its evidence. Only you switch this marker off; scans do not silently reset it.'",
 "title:'A personal marker is not a publication check',text:'My Check moves a handled page into Completed / Monitoring but is not evidence of a published new Brief. An old Brief is history, a current open Brief is a separate review task and only you change My Check.'",
 'My Check tour semantics');
fs.writeFileSync(file,source,'utf8');
console.log('PASS: canonical Tracker Growth integration applied to all page cards; source preserved.');
