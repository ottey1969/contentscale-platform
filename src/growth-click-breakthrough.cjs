'use strict';
// GSC exact-page daily breakthrough evaluator. Read-only, no outside API.
// Missing days are unknown, never zero; organic search only, same property and page.
const DAY=86400000;
const date=s=>{if(typeof s!=='string'||!/^(20\d\d)-(\d\d)-(\d\d)$/.test(s))return null;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null};
const iso=t=>new Date(t).toISOString().slice(0,10);
function evaluateDailyClickBreakthrough({pageUrl,gscProperty,publishedOn,asOf,rows=[],minimumLiftPercent=15,publicationEvidenceVerified=false}={}){
 const fail=(status,extra={})=>({status,confirmed:false,causal_attribution:false,commercial_outcome_proven:false,...extra});
 const publication=date(publishedOn),today=date(asOf);
 if(!pageUrl||!/^https:\/\//.test(pageUrl)||!gscProperty||publication===null||today===null||publication>today)
  return fail('VERIFIED_PUBLICATION_DATE_AND_PAGE_REQUIRED');
 if(!Number.isFinite(minimumLiftPercent)||minimumLiftPercent<0||minimumLiftPercent>300)return fail('INVALID_LIFT_THRESHOLD');
 const cutoff=today-3*DAY,seen=new Map(),errors=[];
 for(const r of Array.isArray(rows)?rows:[]){
  if(r?.page_url!==pageUrl||r?.gsc_property!==gscProperty)continue;
  const d=date(r.date);
  if(d===null||d>cutoff||r.verified!==true||r.search_type!=='web'||!Number.isSafeInteger(r.clicks)||r.clicks<0||
    !Number.isSafeInteger(r.impressions)||r.impressions<r.clicks){errors.push('INVALID_OR_UNSETTLED_DAILY_ROW');continue}
  const key=iso(d);
  if(seen.has(key)){errors.push('DUPLICATE_DAILY_DATE');continue}
  seen.set(key,{clicks:r.clicks,impressions:r.impressions,nonbrand:r.nonbrand_clicks});
 }
 if(errors.length)return fail('EVIDENCE_REVIEW_REQUIRED',{issues:[...new Set(errors)]});
 const window=(start,count)=>{const values=[];for(let i=0;i<count;i++){const d=iso(start+i*DAY);if(!seen.has(d))return null;values.push(seen.get(d))}
  return {clicks:values.reduce((n,r)=>n+r.clicks,0),impressions:values.reduce((n,r)=>n+r.impressions,0),days:count,average:values.reduce((n,r)=>n+r.clicks,0)/count,values};};
 const before=window(publication-28*DAY,28);
 if(!before)return fail('BASELINE_28_SETTLED_DAYS_REQUIRED');
 const after=window(publication,28);
 if(!after)return fail('POSTCHANGE_28_SETTLED_DAYS_REQUIRED',{baseline:{clicks:before.clicks,average:before.average},days_after_change_available:Math.max(0,Math.floor((cutoff-publication)/DAY)+1)});
 if(before.clicks===0)return fail('ZERO_CLICK_BASELINE_REVIEW',{baseline:{clicks:0},after:{clicks:after.clicks}});
 const nonbrand=items=>items.every(x=>Number.isSafeInteger(x.nonbrand)&&x.nonbrand>=0&&x.nonbrand<=x.clicks);
 const knownNonbrand=nonbrand(before.values)&&nonbrand(after.values);
 const preNonbrand=knownNonbrand?before.values.reduce((x,r)=>x+r.nonbrand,0):null;
 const postNonbrand=knownNonbrand?after.values.reduce((x,r)=>x+r.nonbrand,0):null;
 const elevated=after.clicks/before.clicks>=1+minimumLiftPercent/100;
 const rolling=[];
 for(let i=6;i<28;i++)rolling.push(after.values.slice(i-6,i+1).reduce((x,r)=>x+r.clicks,0)/7);
 const last7=rolling.slice(-7),sustained=last7.length===7&&last7.every(n=>n>before.average);
 const nonbrandLift=knownNonbrand&&postNonbrand>preNonbrand;
 const confirmed=elevated&&sustained&&nonbrandLift&&publicationEvidenceVerified===true;
 return {status:confirmed?'CONFIRMED_SUSTAINED_CLICK_LIFT':!publicationEvidenceVerified?'PUBLICATION_DATE_EVIDENCE_REQUIRED':!knownNonbrand?'NONBRANDED_SPLIT_REQUIRED':'NO_CONFIRMED_BREAKTHROUGH',
  confirmed,causal_attribution:false,commercial_outcome_proven:false,
  baseline:{start:iso(publication-28*DAY),end:iso(publication-DAY),clicks:before.clicks,average:before.average},
  after:{start:iso(publication),end:iso(publication+27*DAY),clicks:after.clicks,average:after.average},
  change_percent:100*(after.clicks-before.clicks)/before.clicks,
  trailing_7_day_averages:last7,nonbranded:{measured:knownNonbrand,previous:preNonbrand,current:postNonbrand},
  criteria:{minimum_lift_percent:minimumLiftPercent,elevated,sustained_7_days:sustained,nonbranded_growth:nonbrandLift,publication_date_verified:publicationEvidenceVerified===true},
  note:'Observational click increase only. Does not prove causation, contacts, sales or paid revenue.'};
}
module.exports={evaluateDailyClickBreakthrough};
