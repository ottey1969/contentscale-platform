'use strict';
// Canonical, side-effect-free Tracker page journey. Shared by Tracker browser,
// tests and future Growth/Case Study integrations. No migrations or state writes.
(function(root,build){
  var api=build();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ContentScaleTrackerJourney=api;
})(typeof window==='object'?window:null,function(){
  function yes(x){return x===true||x===1||x==='1'||x==='true'||x==='t'}
  function at(x){if(!x)return 0;var n=new Date(x).getTime();return Number.isFinite(n)?n:0}
  function obj(x){if(!x)return {};if(typeof x==='object')return x;try{return JSON.parse(x)||{}}catch(e){return {}}}
  function inspect(p,lastCheckedRaw){
    p=p||{};
    var brief=obj(p.brief_content),caseStudy=obj(p.case_study);
    var caseActive=yes(p.case_study_active),manualDone=yes(p.manual_done)||!!at(p.manual_done_at);
    var caseBaselineAt=at(caseStudy.baseline_at||p.case_study_baseline_at);
    var scanAt=at(lastCheckedRaw||p.last_checked||p.last_checked_at);
    var evaluatedAt=at(p.brief_evaluated_at);
    var confirmedAt=at(p.brief_published_confirmed_at);
    var verifiedAt=at(p.implementation_verified_at);
    var publishedAt=at(p.current_revision_published_at);
    var outstanding=brief.outstanding_actions==null?null:Number(brief.outstanding_actions);
    if(!Number.isSafeInteger(outstanding)||outstanding<0)outstanding=null;
    var implementationStatus=String(p.implementation_status||'').toLowerCase();
    var verifiedCycle=!!(brief.cycle_id&&p.implementation_verified_brief_cycle_id&&
      String(brief.cycle_id)===String(p.implementation_verified_brief_cycle_id));
    // Case Study evidence belongs to the current protected cycle ONLY after the baseline.
    var oldCaseBrief=caseActive&&caseBaselineAt>0&&evaluatedAt>0&&evaluatedAt<=caseBaselineAt;
    // A scan performed after the Brief does not make the earlier Brief a fresh change request.
    var laterScan=scanAt>0&&evaluatedAt>0&&scanAt>evaluatedAt+300000;
    var historicalBrief=!!(brief&&p.brief_content&&(oldCaseBrief||laterScan));
    var currentScanNeedsBrief=scanAt>0&&
      ((caseActive&&caseBaselineAt>0&&scanAt>caseBaselineAt&&
         (!evaluatedAt||evaluatedAt<=caseBaselineAt))||
       (laterScan&&(!caseActive||caseBaselineAt===0||scanAt>caseBaselineAt)));
    var freshBrief=evaluatedAt>0&&!historicalBrief&&
      (!caseActive||!caseBaselineAt||(evaluatedAt>caseBaselineAt&&scanAt>caseBaselineAt));
    var cycleVerified=implementationStatus==='verified'&&
      (verifiedCycle||(freshBrief&&(verifiedAt>=evaluatedAt||publishedAt>=evaluatedAt)));
    var schedule=String(p.check_frequency==null?'0':p.check_frequency).toLowerCase();
    var scheduleEnabled=!(schedule===''||schedule==='0'||schedule==='0days'||schedule==='off');
    var waitingInput=yes(p.monitoring_waiting_input);
    var hasOpenReview=freshBrief&&outstanding>0&&!cycleVerified&&confirmedAt<evaluatedAt;
    return {
      manual_checked:manualDone,implementation_verified:cycleVerified,
      case_study_active:caseActive,case_baseline_known:caseBaselineAt>0,
      scheduled_scans_enabled:scheduleEnabled,evidence_checkpoint_waiting:waitingInput,
      historical_brief:historicalBrief,current_scan_needs_brief:currentScanNeedsBrief,
      current_brief_review_required:hasOpenReview,current_brief_ready:freshBrief,
      current_brief_actions:freshBrief?outstanding:null,
      current_revision_publication_confirmed:freshBrief&&confirmedAt>=evaluatedAt,
      next_scan_is_automatic:false,
      notes:manualDone&&hasOpenReview?
        'My Check is a personal marker, not proof that the current revision was published.':
        caseActive&&!scheduleEnabled?
        'Automatic page scans are off. Case Study evidence checkpoints remain independent.':
        'Growth requires measured page-specific evidence before claiming a click uplift.'
    };
  }
  return {inspect:inspect};
});
