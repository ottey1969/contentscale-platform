'use strict';
// Query-first search intent. No universal "80% already won" conversion claim.
function classifyGrowthSearchIntent(query='',{surface='organic'}={}){
 const q=String(query||'').toLowerCase().replace(/\s+/g,' ').trim();
 const info=/\b(how|why|what|when|guide|tips|diy|can i|should i|difference|causes|symptoms|maintenance)\b|hoe werkt|wat is|waarom/i.test(q);
 const emergency=/\b(emergency|urgent|24.?hour|24.?7|same day|immediate|roof leak|leaking roof|storm damage)\b|spoed|lekkage|notdienst/i.test(q);
 const price=/\b(price|cost|estimate|quote|affordable|financing|insurance claim)\b|kosten|prijs|offerte/i.test(q);
 const local=/\b(near me|local|county|new jersey|nj|jersey city|hoboken|lodi|bergen|hudson|hackensack)\b|in de buurt|in mijn buurt/i.test(q);
 const service=/\b(roof|roofing|roofer|chimney|flashing|gutter|siding|skylight|repair|replace|installation|contractor)\b|dak|schoorsteen|reparatie/i.test(q);
 const compare=/\b(best|top|reviews|versus|vs|compare|rating|companies|contractors)\b|beste|vergelijken/i.test(q);
 let intent='UNCLEAR',next='CHECK_REAL_SERP_AND_USER_NEED',goal='UNDERSTAND_USER_NEED';
 if(emergency&&service){intent='URGENT_SERVICE';next='VERIFY_24_7_PHONE_AVAILABILITY_SERVICE_AREA_AND_RESPONSE_LIMITS';goal='QUALIFIED_URGENT_PHONE_CONTACT'}
 else if(price&&service){intent='QUOTE_OR_COST';next='CLARIFY_ASSESSMENT_SCOPE_COST_FACTORS_AND_ESTIMATE_REQUEST';goal='QUALIFIED_ESTIMATE_REQUEST'}
 else if(compare&&service){intent='SERVICE_COMPARISON';next='SHOW_VERIFIABLE_PROOF_SCOPE_REVIEWS_AND_OPTIONS';goal='QUALIFIED_COMPARISON_INQUIRY'}
 else if(service&&(local||/\b(repair|contractor|replacement|installation)\b/i.test(q))){intent='LOCAL_COMMERCIAL_SERVICE';next='SHOW_MATCHING_SERVICE_AREA_EVIDENCE_AND_SIMPLE_CONTACT';goal='QUALIFIED_SERVICE_PHONE_OR_FORM'}
 else if(info){intent='INFORMATIONAL_RESEARCH';next='ANSWER_QUESTION_WITH_EVIDENCE_THEN_OFFER_RELEVANT_NEXT_STEP';goal='USEFUL_ANSWER_AND_OPTIONAL_RELEVANT_INQUIRY'}
 const discovery=surface==='google_business_profile'?'CALL_OR_MAP_ACTION_WITHOUT_WEBSITE_VISIT':
  surface==='organic'?'WEBSITE_OR_SEARCH_RESULT':'VERIFY_DISCOVERY_SURFACE';
 return {intent,goal,next_action:next,discovery_surface:discovery,
  query_signals:{emergency,price,local,service,compare,informational:info},
  sales_completion_assumed:false,universal_conversion_probability:null,
  explanation:'Search intent changes what the visitor needs. No fixed percentage of visitors are presold or guaranteed to become leads.'};
}
module.exports={classifyGrowthSearchIntent};
