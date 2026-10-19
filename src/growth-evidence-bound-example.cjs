'use strict';
// Read-only, evidence-bound worked example for review. NOT an inferred content gap.
// No external AI calls, invented forecasts, or automatic publication.
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function buildGrowthEvidenceExample({report={},decision={}}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const m=action.metrics||{};
 const query=clean(action.query);
 const target=decision.target_url;
 const impressions=Number(m.impressions),clicks=Number(m.clicks),position=Number(m.average_position);
 // Metrics belong to the tracked source URL. A different proposed destination needs
 // its own verified page/query GSC rows before any destination-specific copy is offered.
 const normalizeUrl=value=>{try{const u=new URL(value);return u.origin+u.pathname.replace(new RegExp('/+
 const sourceUrl=normalizeUrl(report.url),targetUrl=normalizeUrl(target);
 const base={status:'NOT_READY',publish_allowed:false,copy_ready:false,requires_editorial_review:true,
  protected_source:report.url||null,target_url:target||null,focus_query:query};
 if(!query||!target||!Number.isFinite(impressions)||impressions<=0||!Number.isFinite(clicks)||clicks<0||clicks>impressions||
  !Number.isFinite(position)||position<=0)return {...base,reason:'Exact-page impressions, clicks, position and confirmed target are required.'};
 if(!['REVIEW_EXISTING','NEEDS_EVIDENCE'].includes(decision.decision))
  return {...base,reason:'Unrecognized editorial decision; do not invent a content task.'};
 if(sourceUrl&&targetUrl&&sourceUrl!==targetUrl)return {...base,status:'DESTINATION_GSC_EVIDENCE_REQUIRED',reason:'Query metrics describe the tracked source page, not the proposed editorial destination.',source_metrics_url:report.url,target_metrics_url:target,one_next_action:'Fetch verified page/query performance for this exact destination before preparing destination-specific copy.'};
 // The GSC measurement window was not supplied; never present these counts as timeless or recent.
 const counts=impressions.toLocaleString('en-US'),clickCount=clicks.toLocaleString('en-US');
 const block=position>10?
  'The average result position is outside the top ten, so ranking and search-intent fit deserve examination before assuming the snippet caused the low click count.':
  'Inspect intent, search-result appearance and position before deciding whether the existing answer needs revision.';
 const example='In an observed Search Console export, the query “'+query+'” generated '+counts+
  ' impressions and '+clickCount+' clicks for one page, at an average position of '+position.toFixed(1)+
  '. '+block+' Start by comparing the actual reader task with the existing page, then inspect the leading competing answers and check whether another page on the same site already serves the query. Preserve successful search intents. Record the original page, query, and measurement dates before making an approved change, then compare equivalent date windows afterward.';
 return {...base,status:'EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW',
  format:'PARAGRAPH',heading:'Worked example: evaluating “'+query+'”',
  proposed_text:example,
  evidence:{scope:'EXACT_TRACKED_PAGE_GSC_IMPORT',impressions,clicks,average_position:position,
   imported_at:m.imported_at||null,measurement_window:'UNKNOWN',source_url:report.url||null},
  editorial_check:'Do not add this example if the destination already teaches the same task. Verify the target page intent and its existing examples first.',
  gap_proven:false,original_copy_candidate:true,publication_gate:'OWNER_APPROVAL_REQUIRED'};
}
module.exports={buildGrowthEvidenceExample};
),'/');}catch{return null}};
 const sourceUrl=normalizeUrl(report.url),targetUrl=normalizeUrl(target);
 const base={status:'NOT_READY',publish_allowed:false,copy_ready:false,requires_editorial_review:true,
  protected_source:report.url||null,target_url:target||null,focus_query:query};
 if(!query||!target||!Number.isFinite(impressions)||impressions<=0||!Number.isFinite(clicks)||clicks<0||clicks>impressions||
  !Number.isFinite(position)||position<=0)return {...base,reason:'Exact-page impressions, clicks, position and confirmed target are required.'};
 if(!['REVIEW_EXISTING','NEEDS_EVIDENCE'].includes(decision.decision))
  return {...base,reason:'Unrecognized editorial decision; do not invent a content task.'};
 if(sourceUrl&&targetUrl&&sourceUrl!==targetUrl)return {...base,status:'DESTINATION_GSC_EVIDENCE_REQUIRED',reason:'Query metrics describe the tracked source page, not the proposed editorial destination.',source_metrics_url:report.url,target_metrics_url:target,one_next_action:'Fetch verified page/query performance for this exact destination before preparing destination-specific copy.'};
 // The GSC measurement window was not supplied; never present these counts as timeless or recent.
 const counts=impressions.toLocaleString('en-US'),clickCount=clicks.toLocaleString('en-US');
 const block=position>10?
  'The average result position is outside the top ten, so ranking and search-intent fit deserve examination before assuming the snippet caused the low click count.':
  'Inspect intent, search-result appearance and position before deciding whether the existing answer needs revision.';
 const example='In an observed Search Console export, the query “'+query+'” generated '+counts+
  ' impressions and '+clickCount+' clicks for one page, at an average position of '+position.toFixed(1)+
  '. '+block+' Start by comparing the actual reader task with the existing page, then inspect the leading competing answers and check whether another page on the same site already serves the query. Preserve successful search intents. Record the original page, query, and measurement dates before making an approved change, then compare equivalent date windows afterward.';
 return {...base,status:'EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW',
  format:'PARAGRAPH',heading:'Worked example: evaluating “'+query+'”',
  proposed_text:example,
  evidence:{scope:'EXACT_TRACKED_PAGE_GSC_IMPORT',impressions,clicks,average_position:position,
   imported_at:m.imported_at||null,measurement_window:'UNKNOWN',source_url:report.url||null},
  editorial_check:'Do not add this example if the destination already teaches the same task. Verify the target page intent and its existing examples first.',
  gap_proven:false,original_copy_candidate:true,publication_gate:'OWNER_APPROVAL_REQUIRED'};
}
module.exports={buildGrowthEvidenceExample};
