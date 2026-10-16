'use strict';
// Read-only comparison of VERIFIED, exact-page GSC import runs.
// Never compare overlapping rolling windows or different properties/page URLs.
const DAY=86400000;
function day(value){
 const s=value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
 if(!/^\d{4}-\d\d-\d\d$/.test(s))return null;
 const time=Date.parse(s+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===s?time:null;
}
function normalize(run,pageUrl){
 if(!run||run.page_url!==pageUrl||!run.gsc_property)return null;
 const start=day(run.start_date),end=day(run.end_date);
 const clicks=Number(run.clicks),impressions=Number(run.impressions),queries=Number(run.query_count);
 const position=run.position===null||run.position===undefined?null:Number(run.position);
 if(start===null||end===null||end<start||end-start>366*DAY||
  !Number.isSafeInteger(clicks)||clicks<0||!Number.isSafeInteger(impressions)||impressions<0||clicks>impressions||
  !Number.isSafeInteger(queries)||queries<1||(position!==null&&(!Number.isFinite(position)||position<=0||position>1000)))return null;
 return {start,end,days:Math.round((end-start)/DAY)+1,start_date:new Date(start).toISOString().slice(0,10),
  end_date:new Date(end).toISOString().slice(0,10),property:run.gsc_property,
  imported_at:Date.parse(run.imported_at||'')||0,clicks,impressions,query_count:queries,position};
}
function compareGrowthGscWindows({pageUrl,runs=[]}={}){
 const response=(status,more={})=>({status,source:'verified_exact_page_gsc_import_runs',
  page_url:pageUrl||null,comparison_ready:status==='READY_FOR_RESULT_REVIEW',
  attribution_established:false,call_and_job_conversions_measured:false,
  ...more});
 if(!/^https:\/\/[^/]+\//i.test(pageUrl||''))return response('CANONICAL_PAGE_URL_REQUIRED');
 const list=(Array.isArray(runs)?runs:[]).map(run=>normalize(run,pageUrl)).filter(Boolean)
  .sort((a,b)=>b.end-a.end||b.imported_at-a.imported_at);
 if(!list.length)return response('NO_VERIFIED_GSC_HISTORY',{next_action:'IMPORT_EXACT_PAGE_GSC_BASELINE'});
 const current=list[0];
 const previous=list.find(r=>r.property===current.property&&r.days===current.days&&r.end===current.start-DAY);
 const view=r=>({start_date:r.start_date,end_date:r.end_date,days:r.days,gsc_property:r.property,
  clicks:r.clicks,impressions:r.impressions,ctr_percent:r.impressions?100*r.clicks/r.impressions:0,
  avg_position:r.position,query_count:r.query_count});
 if(!previous)return response('COMPARABLE_NONOVERLAPPING_WINDOW_REQUIRED',{
  current:view(current),previous:null,next_action:'WAIT_FOR_VERIFIED_ADJACENT_GSC_WINDOW',
  explanation:'Imported rolling windows overlap, differ in length/property, or leave a gap; do not claim improvement.'});
 return response('READY_FOR_RESULT_REVIEW',{current:view(current),previous:view(previous),
  changes:{clicks:current.clicks-previous.clicks,
   impressions:current.impressions-previous.impressions,
   ctr_percentage_points:(current.impressions?100*current.clicks/current.impressions:0)-
    (previous.impressions?100*previous.clicks/previous.impressions:0),
   avg_position_improvement:current.position===null||previous.position===null?null:previous.position-current.position,
   clicks_change_percent:previous.clicks?100*(current.clicks-previous.clicks)/previous.clicks:null,
   impressions_change_percent:previous.impressions?100*(current.impressions-previous.impressions)/previous.impressions:null},
  click_breakthrough:{
   status:current.days<28?'INSUFFICIENT_COMPARABLE_DAYS':
    previous.clicks===0?'ZERO_CLICK_BASELINE_REQUIRES_ABSOLUTE_REVIEW':
    current.clicks>=Math.ceil(previous.clicks*1.15)&&current.clicks>previous.clicks?
     'CANDIDATE_UPLIFT_NOT_CONFIRMED':'NO_SUSTAINED_UPLIFT_PROVEN',
   baseline_clicks:previous.clicks,current_clicks:current.clicks,
   baseline_clicks_per_day:previous.clicks/previous.days,
   current_clicks_per_day:current.clicks/current.days,
   minimum_uplift_percent:15,
   confirmed:false,
   daily_7_day_trend_available:false,
   nonbranded_click_split_available:false,
   requires:['28_SEPARATE_SETTLED_POST_CHANGE_DAYS','DAILY_7_DAY_TREND','NONBRANDED_CLICK_SPLIT',
    'QUERY_INTENT_VALIDATION','VERIFIED_PUBLICATION_DATE'],
   explanation:'Aggregate GSC windows can show a candidate increase but cannot establish a sustained trend, commercial lift or attribution.'
  },
  next_action:'REVIEW_MEASURED_COMMERCIAL_OUTCOMES',
  explanation:'Comparison covers GSC Search performance only; rankings and clicks are not proof of jobs or causality.'});
}
module.exports={compareGrowthGscWindows};
