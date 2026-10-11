'use strict';
// A completed implementation Brief is not a fresh list of defects.
// Growth opportunities below are read-only proposals grounded in page-verified GSC.
function tokens(v){return String(v||'').toLowerCase().replace(/[^a-z0-9\s]+/g,' ').split(/\s+/).filter(x=>x.length>2&&!['the','and','for','with','near','new','jersey','service','services','page'].includes(x));}
function buildTrackerGrowthPlan({page={},queries=[],sitePages=[],now=new Date()}={}){
  const imp=Number(page.gsc_impressions),clicks=Number(page.gsc_clicks),position=Number(page.gsc_position);
  const validMetrics=Number.isFinite(imp)&&imp>=0&&Number.isFinite(clicks)&&clicks>=0&&Number.isFinite(position)&&position>0;
  const plan={mode:'GROWTH_NOT_DEFECTS',verified:false,source:'page_verified_gsc',generated_at:new Date(now).toISOString(),
    metrics:validMetrics?{impressions:imp,clicks,ctr:imp?Number((clicks/imp*100).toFixed(3)):null,position}:null,
    opportunities:[],warnings:[]};
  if(validMetrics&&imp>=300&&position>20&&clicks<=Math.max(2,imp*0.001)){
    plan.opportunities.push({
      type:'OPTIMIZE_EXISTING_PAGE',priority:'HIGH',target_url:page.url||'',
      evidence:`${imp} impressions, ${clicks} clicks, average position ${position.toFixed(1)} on the tracked page`,
      next_action:'Compare exact-page query intent and top-ranked competitors. Improve this established page and internal support before adding another page. Do not infer that changing the snippet alone will solve a rank-40 result.'
    });
  }
  const fresh=queries.filter(q=>q&&q.evidence_scope==='page_verified'&&Number(q.impressions)>0
     &&q.imported_at&&Number.isFinite(Date.parse(q.imported_at))
     &&Date.parse(q.imported_at)<=new Date(now).getTime()
     &&new Date(now).getTime()-Date.parse(q.imported_at)<=75*86400000);
  if(!fresh.length){plan.warnings.push('Fresh exact-page GSC query evidence is required before selecting new spokes.');return plan}
  plan.verified=true;
  const targetTokens=new Set(tokens(page.keyword||page.gsc_keyword||''));
  const dedup=new Map();
  for(const q of fresh){const k=String(q.query||'').toLowerCase().trim();if(k&&!dedup.has(k))dedup.set(k,q)}
  for(const q of [...dedup.values()].sort((a,b)=>Number(b.impressions)-Number(a.impressions)).slice(0,25)){
    const parts=tokens(q.query),distinct=[...new Set(parts.filter(w=>!targetTokens.has(w)))];
    if(Number(q.impressions)<100||distinct.length<2)continue;
    const existing=sitePages.some(p=>{
      if(!p||!p.url)return false;
      const words=new Set([...tokens(p.url),...tokens(p.keyword)]);
      return distinct.every(t=>words.has(t));
    });
    if(existing)continue;
    plan.opportunities.push({
      type:'RESEARCH_SPOKE_CANDIDATE',priority:'REVIEW',seed_query:String(q.query),impressions:Number(q.impressions),
      clicks:Number(q.clicks||0),position:Number(q.position)||null,
      evidence:'Exact-page verified GSC query with distinct intent modifiers: '+distinct.join(', '),
      next_action:'Compare full content and the sitemap to confirm this intent is not already served. If genuinely missing, propose a focused spoke with a contextual hub link; do not publish or canonicalize automatically.'
    });
    if(plan.opportunities.filter(x=>x.type==='RESEARCH_SPOKE_CANDIDATE').length>=3)break;
  }
  if(!plan.opportunities.length)plan.warnings.push('No verified new opportunity in this evidence window. Zero actions is a valid result.');
  return plan;
}
module.exports={buildTrackerGrowthPlan};
