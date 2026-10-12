'use strict';
// Summarize persisted manual AI visibility observations. Never infer competitor gaps.
function summarizeGrowthAiVisibility({page={},rows=[]}={}){
 const pid=Number(page.id),cid=Number(page.tracker_client_id);
 const valid=Number.isSafeInteger(pid)&&pid>0&&Number.isSafeInteger(cid)&&cid>0;
 const scoped=(Array.isArray(rows)?rows:[]).filter(r=>valid&&Number(r.page_id)===pid&&Number(r.tracker_client_id)===cid);
 const byEngine=new Map();
 for(const r of scoped){
  const engine=String(r.engine||'').trim().toLowerCase();
  if(!engine)continue;
  const cycle=Number(r.revision_cycle)||0,verifiedAt=Date.parse(r.verified_at||'')||0;
  const old=byEngine.get(engine);
  if(!old||cycle>old.cycle||(cycle===old.cycle&&verifiedAt>old.verifiedAt)){
   byEngine.set(engine,{engine,cycle,verifiedAt,
    method:String(r.evidence_method||'unknown'),recommended:r.brand_recommended===true,
    domain_cited:r.domain_cited===true,exact_page_cited:r.exact_page_cited===true,
    citation_urls:Array.isArray(r.citation_urls)?r.citation_urls.filter(s=>typeof s==='string'&&/^https:\/\//.test(s)):[]});
  }
 }
 return {status:byEngine.size?'OBSERVATIONS_AVAILABLE':'NO_AI_OBSERVATIONS',
  engines:[...byEngine.values()].sort((a,b)=>a.engine.localeCompare(b.engine)).map(({cycle,verifiedAt,...rest})=>({...rest,revision_cycle:cycle,verified_at:verifiedAt?new Date(verifiedAt).toISOString():null})),
  competitor_gaps_verified:false,automatic_draft_allowed:false};
}
module.exports={summarizeGrowthAiVisibility};
