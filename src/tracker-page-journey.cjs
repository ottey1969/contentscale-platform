'use strict';
// Canonical, side-effect-free Tracker page journey. Shared by Tracker browser,
// tests and future Growth/Case Study integrations. No migrations or state writes.
(function(root,build){
  var api=build();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.ContentScaleTrackerJourney=api;api.attach(root);}
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
  function pageEvidence(growth,pageId){
    var id=Number(pageId);
    if(!Number.isSafeInteger(id)||id<1||!growth||!Array.isArray(growth.query_opportunities))
      return {status:'NEEDS_VERIFIED_EXACT_PAGE_GSC',queries:[],source:'none'};
    var list=growth.query_opportunities.filter(function(q){
      return q&&Number(q.page_id)===id&&typeof q.query==='string'&&q.query.trim()&&
        Number.isFinite(Number(q.impressions))&&Number(q.impressions)>0;
    }).sort(function(a,b){return (Number(b.priority_score)||0)-(Number(a.priority_score)||0)});
    return {status:list.length?'PAGE_VERIFIED_NONBRAND_OPPORTUNITIES':'NO_VERIFIED_NONBRAND_OPPORTUNITIES',
      queries:list.slice(0,5).map(function(q){return {
        query:q.query,clicks:Number(q.clicks),impressions:Number(q.impressions),
        position:Number(q.position),type:q.type||'REVIEW',
        imported_at:q.imported_at||null,locked:q.case_study_locked===true
      }}),
      source:'existing_tracker_growth_cockpit'};
  }
  function attach(host){
    if(!host||!host.document||typeof host.fetch!=='function')return;
    host.document.addEventListener('toggle',function(event){
      var el=event.target;
      if(!el||el.tagName!=='DETAILS'||!el.open||
        el.getAttribute('data-tour')!=='growth-page')return;
      var card=el.closest('[data-page-id]'),pageId=Number(card&&card.getAttribute('data-page-id'));
      if(!Number.isSafeInteger(pageId)||pageId<1)return;
      var area=el.querySelector('[data-growth-evidence]');
      if(!area){area=host.document.createElement('div');
        area.setAttribute('data-growth-evidence','');
        area.style.cssText='padding:8px 12px 12px;border-top:1px solid #164e63;font-size:11px;color:#cbd5e1';
        el.appendChild(area);}
      area.textContent='Loading saved, page-verified nonbranded Growth opportunities…';
      var parts=String(host.location.pathname||'').split('/');
      if(parts[1]!=='track'||!parts[2]){area.textContent='Tracker identity required';return;}
      var token;try{token=decodeURIComponent(parts[2])}catch(e){area.textContent='Tracker identity invalid';return;}
      host.fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth',
       {cache:'no-store',credentials:'same-origin'}).then(function(r){
        if(!r.ok)throw Error('Verified Growth evidence is not available');
        return r.json();
      }).then(function(g){
        var result=pageEvidence(g,pageId);
        // A late response must not populate a closed or replaced card.
        if(!el.isConnected||!el.open)return;
        area.textContent='';
        var title=host.document.createElement('div');
        title.style.cssText='font-weight:800;color:#67e8f9;margin-bottom:7px';
        title.textContent=result.queries.length?
          'Exact-page nonbranded search opportunities (latest saved GSC evidence)':
          'No page-verified nonbranded query opportunity yet — Needs access or research';
        area.appendChild(title);
        result.queries.slice(0,3).forEach(function(q){
          var item=host.document.createElement('div');
          item.style.cssText='padding:7px 0;border-top:1px solid #1f2937';
          var observed=q.imported_at?' · imported '+String(q.imported_at).slice(0,10):' · import date unknown';
          item.textContent=q.query+' · '+q.impressions+' impressions · '+q.clicks+
            ' clicks · position '+(Number.isFinite(q.position)?q.position:'unknown')+
            observed+(q.locked?' · Case Study protected':'');
          area.appendChild(item);
        });
        var note=host.document.createElement('div');
        note.style.cssText='margin-top:6px;color:#94a3b8;font-size:10px';
        note.textContent='Read-only. Query observations are not a dated uplift or evidence of calls, clients or revenue. Missing days are unknown, not zero.';
        area.appendChild(note);
      }).catch(function(){if(el.isConnected)area.textContent=
        'Could not retrieve verified Growth opportunities. Existing history is unchanged; no scan was started.';});
    },true);
  }
  return {inspect:inspect,pageEvidence:pageEvidence,attach:attach};
});
