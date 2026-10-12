'use strict';
// Read-only canonical staging schema loader. Caller supplies an existing pg-compatible client.
// Does not fetch credentials, initiate GSC scans, update state or generate content.
async function loadGrowthTrackerEvidence(db,{pageId,clientId}={}){
 const pid=Number(pageId),cid=Number(clientId);
 if(!Number.isSafeInteger(pid)||pid<=0||!Number.isSafeInteger(cid)||cid<=0)
  throw new Error('VALID_PAGE_AND_CLIENT_REQUIRED');
 if(!db||typeof db.query!=='function')throw new Error('DATABASE_CLIENT_REQUIRED');
 const pageResult=await db.query(
  'SELECT id, tracker_client_id, url, html_content, serp_spy, serp_spy_at FROM tracker_pages WHERE id=$1 AND tracker_client_id=$2 LIMIT 1',
  [pid,cid]);
 const page=pageResult.rows?.[0];
 if(!page)throw new Error('TRACKER_PAGE_NOT_FOUND');
 const [gscResult,caseStudyResult]=await Promise.all([
  db.query("SELECT tracker_client_id,page_id,source_page_url,evidence_scope,query,clicks,impressions,position,imported_at FROM tracker_gsc_queries WHERE tracker_client_id=$1 AND page_id=$2 AND source_page_url=$3 AND evidence_scope='page_verified'",[cid,pid,page.url]),
  db.query('SELECT id FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 LIMIT 1',[cid,pid])
 ]);
 return {
  page:{...page,case_study_active:(caseStudyResult.rows||[]).length>0},
  gscRows:gscResult.rows||[],
  source:'canonical_tracker_read_only'
 };
}
module.exports={loadGrowthTrackerEvidence};
