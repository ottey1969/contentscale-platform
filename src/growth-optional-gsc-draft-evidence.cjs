'use strict';
// Optional, read-only Search Console intelligence used to prioritize editorial
// research. Each figure remains tied to the actual client, page and source URL.
// Never infer GSC measurement windows from import timestamps.
const queryKey=s=>String(s||'').trim().toLowerCase();
function valid(row,{clientId,pageId,url}){
 const impressions=Number(row?.impressions),clicks=Number(row?.clicks),position=Number(row?.position);
 return row&&String(row.tracker_client_id)===String(clientId)&&
  String(row.page_id)===String(pageId)&&row.source_page_url===url&&
  row.evidence_scope==='page_verified'&&!!queryKey(row.query)&&
  Number.isFinite(impressions)&&impressions>0&&Number.isFinite(clicks)&&clicks>=0&&clicks<=impressions&&
  Number.isFinite(position)&&position>0;
}
function shape(row){return {
 query:String(row.query).trim().slice(0,160),
 impressions:Number(row.impressions),clicks:Number(row.clicks),average_position:Number(row.position),
 imported_at:row.imported_at||null,measurement_window:'UNKNOWN'
};}
async function readRows(pool,clientId,page){
 const r=await pool.query(
  "SELECT page_id,tracker_client_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified' ORDER BY imported_at DESC LIMIT 150",
  [clientId,page.id,page.url]);
 const unique=new Map();
 for(const row of r.rows||[]){
  if(valid(row,{clientId,pageId:page.id,url:page.url})&&!unique.has(queryKey(row.query)))
   unique.set(queryKey(row.query),row);
 }
 return [...unique.values()];
}
async function loadGrowthOptionalGsc(pool,{clientId,targetPage,sourcePageId,focusQuery}){
 const base={status:'NO_VERIFIED_GSC',gsc_required:false,measurement_window:'UNKNOWN',
  target_url:targetPage.url,target_page_id:Number(targetPage.id),
  source_url:null,source_page_id:null,
  destination_query_metrics:null,source_query_metrics:null,
  protected_source_queries:[],protected_destination_queries:[],
  evidence_kind:'DATABASE_EXACT_PAGE_VERIFIED_GSC_ONLY'};
 let destination=[],source=[],sourcePage=null,failed=false;
 try{destination=await readRows(pool,clientId,targetPage)}catch{failed=true}
 const sourceId=Number(sourcePageId);
 if(Number.isSafeInteger(sourceId)&&sourceId>0&&sourceId!==Number(targetPage.id)){
  try{
   const r=await pool.query("SELECT id,url FROM tracker_pages WHERE tracker_client_id=$1 AND id=$2 LIMIT 1",[clientId,sourceId]);
   const page=r.rows?.[0];
   if(page?.url&&new URL(page.url).origin===new URL(targetPage.url).origin&&
    Number(page.id)===sourceId){
    sourcePage=page;source=await readRows(pool,clientId,page);
   }
  }catch{failed=true}
 }
 const exact=rows=>rows.find(x=>queryKey(x.query)===queryKey(focusQuery))||null;
 const protectedRows=rows=>rows.filter(x=>Number(x.position)<=5&&Number(x.clicks)>=5)
  .sort((a,b)=>Number(b.clicks)-Number(a.clicks)).slice(0,4).map(shape);
 return {...base,
  status:exact(destination)?'EXACT_DESTINATION_QUERY_VERIFIED':
   exact(source)?'SOURCE_QUERY_VERIFIED_DESTINATION_NOT_VERIFIED':
   destination.length||source.length?'OTHER_VERIFIED_PAGE_QUERIES_ONLY':
   failed?'GSC_OPTIONAL_LOOKUP_UNAVAILABLE':'NO_VERIFIED_GSC',
  source_url:sourcePage?.url||null,source_page_id:sourcePage?Number(sourcePage.id):null,
  destination_query_metrics:exact(destination)?shape(exact(destination)):null,
  source_query_metrics:exact(source)?shape(exact(source)):null,
  protected_destination_queries:protectedRows(destination),
  protected_source_queries:protectedRows(source),
  destination_verified_query_count:destination.length,source_verified_query_count:source.length,
  lookup_warning:failed?'OPTIONAL_GSC_LOOKUP_PARTIALLY_UNAVAILABLE':null};
}
module.exports={loadGrowthOptionalGsc};
