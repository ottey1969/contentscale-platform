'use strict';
// Before and after (owner 2026-11-22): a newer Search Console export added to an existing report. Only pages with a Free
// Growth publication date are compared, so the report stays readable. Two periods of a different length cannot be compared
// fairly, and a page missing from one export has no comparison: those say "not comparable" and show no numbers.
const {norm}=require('./published.cjs');
const measured=x=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
// What is kept of the newer export: the period and the numbers per page, nothing else.
function snapshot(report){
 const r=report||{},k=r.kpis||{};
 return {period:k.period||null,added_at:new Date().toISOString(),
  pages:(r.pages||[]).filter(p=>p&&p.url&&p.source!=='MANUAL'&&p.source!=='CRAWL').map(p=>({url:p.url,clicks:measured(p.clicks),impressions:measured(p.impressions),position:measured(p.position)}))};
}
function compare(before,after,published){
 const bp=before&&before.kpis&&before.kpis.period||null,ap=after&&after.period||null;
 const out={comparable:false,reason:null,before_period:bp,after_period:ap,pages:[],totals:null};
 const byUrl=list=>new Map((list||[]).map(p=>[norm(p.url),p]));
 const B=byUrl(before&&before.pages),Af=byUrl(after&&after.pages);
 for(const [k,d] of published||new Map()){if(!B.has(k)&&!Af.has(k))continue;const b=B.get(k),a=Af.get(k);
  out.pages.push({url:(b||a).url,published_on:d,status:b&&a?'OK':'MISSING',before:b?{clicks:measured(b.clicks),impressions:measured(b.impressions),position:measured(b.position)}:null,after:a?{clicks:measured(a.clicks),impressions:measured(a.impressions),position:measured(a.position)}:null})}
 if(!bp||!ap){out.reason='PERIOD_UNKNOWN';return out}
 if(Math.abs(Number(bp.days)-Number(ap.days))>1){out.reason='PERIOD_LENGTH';return out}
 out.comparable=true;
 const ok=out.pages.filter(p=>p.status==='OK');
 const sum=(side,f)=>ok.length&&ok.every(p=>p[side][f]!=null)?ok.reduce((s,p)=>s+p[side][f],0):null;
 const wpos=side=>{
  const w=sum(side,'impressions');
  if(!w||ok.some(p=>p[side].impressions>0&&p[side].position==null))return null;
  return ok.reduce((s,p)=>s+(p[side].impressions>0?p[side].position*p[side].impressions:0),0)/w;
 };
 out.totals={pages:ok.length,before:{clicks:sum('before','clicks'),impressions:sum('before','impressions'),position:wpos('before')},after:{clicks:sum('after','clicks'),impressions:sum('after','impressions'),position:wpos('after')}};
 return out;
}
module.exports={snapshot,compare};
