'use strict';
// Read-only, evidence-bound worked example for review. NOT an inferred content gap.
// No external AI calls, invented forecasts, or automatic publication.
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function buildGrowthEvidenceExample({report={},decision={},destinationGscRows=[]}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=clean(action.query);
 const target=decision.target_url;
 // Only use destination data that is independently verified for the exact URL and query.
 // Caller also scopes the database lookup to the same client and destination page_id.
 const normalizeUrl=value=>{try{const u=new URL(value);return u.origin+u.pathname+(u.pathname.endsWith('/')?'':'/');}catch{return null}};
 const sourceUrl=normalizeUrl(report.url),targetUrl=normalizeUrl(target);
 const exactDestinationRow=sourceUrl!==targetUrl&&targetUrl&&Array.isArray(destinationGscRows)?
  destinationGscRows.find(r=>r&&r.evidence_scope==='page_verified'&&normalizeUrl(r.source_page_url)===targetUrl&&clean(r.query).toLowerCase()===query.toLowerCase()):null;
 const m=exactDestinationRow||action.metrics||{};
 const impressions=Number(m.impressions),clicks=Number(m.clicks),position=Number(m.position??m.average_position);
 const base={status:'NOT_READY',publish_allowed:false,copy_ready:false,requires_editorial_review:true,
  protected_source:report.url||null,target_url:target||null,focus_query:query};
 if(!sourceUrl||!targetUrl)return {...base,reason:'Valid source and destination URLs are required to isolate GSC evidence.'};
 if(!query||!target||!Number.isFinite(impressions)||impressions<=0||!Number.isFinite(clicks)||clicks<0||clicks>impressions||
  !Number.isFinite(position)||position<=0)return {...base,reason:'Exact-page impressions, clicks, position and confirmed target are required.'};
 if(!['NEEDS_EVIDENCE','DATA_BLOCKED','NO_CHANGE','IMPROVE_EXISTING','NEW_DISTINCT_PAGE'].includes(decision.decision))
  return {...base,reason:'Unrecognized editorial decision; do not invent a content task.'};
 if(sourceUrl&&targetUrl&&sourceUrl!==targetUrl&&!exactDestinationRow)return {...base,status:'DESTINATION_GSC_EVIDENCE_REQUIRED',reason:'Query metrics describe the tracked source page, not the proposed editorial destination.',source_metrics_url:report.url,target_metrics_url:target,one_next_action:'Exact destination GSC is needed only for destination-specific click/ranking claims. Continue HTML-based competitor research and owner-reviewed drafting without GSC.',non_gsc_editorial_draft_allowed:true};
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
  evidence:{scope:exactDestinationRow?'EXACT_DESTINATION_PAGE_VERIFIED_GSC':'EXACT_TRACKED_PAGE_GSC_IMPORT',impressions,clicks,average_position:position,
   imported_at:m.imported_at||null,measurement_window:'UNKNOWN',source_url:exactDestinationRow?target:report.url||null},
  editorial_check:'Do not add this example if the destination already teaches the same task. Verify the target page intent and its existing examples first.',
  gap_proven:false,original_copy_candidate:true,publication_gate:'OWNER_APPROVAL_REQUIRED'};
}
module.exports={buildGrowthEvidenceExample};
