'use strict';
function evaluateMeasurement(row,now=new Date()){
 const at=Date.parse(row.published_at);
 const days=Number.isFinite(at)?Math.floor((now.getTime()-at)/86400000):0;
 return {publication_id:row.id,page_id:row.tracker_page_id,query:row.query,url:row.url,
 published_at:row.published_at,notes:row.notes,days_since_publication:Math.max(0,days),
 measurement_status:days<28?'WAITING_FOR_28_DAYS':'NEEDS_DATED_GSC_WINDOWS',
 measured_click_change:null,measured_impression_change:null,
 reason:days<28?'At least 28 days must pass after publication before a full post-publication comparison.':'Stored GSC query rows have an import timestamp but no verified measurement start/end dates. A before/after comparison is not valid yet.',
 required_evidence:{before:'28 full days before the publication date',after:'28 full days after the publication date',same_page:true,same_query:true}};
}
function registerGrowthMeasurement(app,pool){
 app.get('/api/tracker-client/:token/growth/measurement',async(req,res)=>{
  try{
   const c=(await pool.query("SELECT id,domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status!='deleted') LIMIT 1",[req.params.token])).rows[0];
   if(!c)return res.status(404).json({success:false,error:'Tracker not found'});
   const exists=(await pool.query("SELECT to_regclass('public.tracker_growth_publications') IS NOT NULL AS ready")).rows[0]?.ready===true;
   if(!exists)return res.json({success:true,records:[],measurement_supported:false,reason:'No growth publications have been registered yet.'});
   const rows=(await pool.query(`SELECT g.id,g.tracker_page_id,g.query,g.notes,g.published_at,p.url
    FROM tracker_growth_publications g JOIN tracker_pages p ON p.id=g.tracker_page_id AND p.tracker_client_id=g.tracker_client_id
    WHERE g.tracker_client_id=$1 ORDER BY g.published_at DESC,g.id DESC LIMIT 100`,[c.id])).rows;
   const hostname=new URL('https://'+String(c.domain).replace(/^https?:\/\//,'').split('/')[0]).hostname;
   const safe=rows.filter(r=>{try{return new URL(r.url).hostname===hostname}catch{return false}});
   res.set('Cache-Control','no-store').json({success:true,measurement_supported:false,
    evidence_limitation:'Import timestamps are not GSC observation windows. Changes cannot yet be measured without date-scoped GSC records.',
    records:safe.map(r=>evaluateMeasurement(r))});
  }catch(err){console.error('[growth-measurement]',err.message);res.status(503).json({success:false,error:'Growth measurement evidence currently unavailable'})}
 });
}
module.exports={evaluateMeasurement,registerGrowthMeasurement};
