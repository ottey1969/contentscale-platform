'use strict';
const safeEventName={delivered:'delivered',opened:'opened',click:'click',hardBounce:'hard_bounce',softBounce:'soft_bounce',blocked:'blocked',invalid:'invalid',deferred:'deferred',unsubscribed:'unsubscribed'};
function normalizeBrevoEvent(event){
 const type=safeEventName[String(event?.event||'')];
 const time=Date.parse(String(event?.date||''));
 if(!type||!Number.isFinite(time))return null;
 return {type,time:new Date(time).toISOString()};
}
function registerNetworkBrevoEventSync({app,pool,verifyGrowthAdmin,fetchImpl=globalThis.fetch}){
 app.post('/api/network/admin/opportunity-pilot/sync-brevo',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  if(!process.env.BREVO_API_KEY)return res.status(503).json({success:false,error:'BREVO_NOT_CONFIGURED'});
  try{
   const recent=await pool.query(`SELECT n.id,
      n.metadata->'content_opportunity'->'email_result'->>'message_id' AS message_id
      FROM network_directory_businesses n WHERE n.source='lead_crawler'
       AND n.metadata->'content_opportunity'->>'status' IN ('invited','interested')
       AND n.metadata->'content_opportunity'->'email_result'->>'provider_accepted'='true'
       ORDER BY n.id DESC LIMIT 10`);
   let saved=0,checked=0,failed=0;
   for(const row of recent.rows){
    const id=String(row.message_id||'');
    if(!id||id.length>255)continue;
    checked++;
    const url=new URL('https://api.brevo.com/v3/smtp/statistics/events');
    url.searchParams.set('messageId',id);url.searchParams.set('limit','50');
    let payload;
    try{
     const response=await fetchImpl(url.toString(),{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'api-key':process.env.BREVO_API_KEY,accept:'application/json'}});
     if(!response.ok){failed++;continue;}
     payload=await response.json();
    }catch{failed++;continue;}
    if(!Array.isArray(payload?.events)){failed++;continue;}
    for(const entry of payload.events.slice(0,50)){
     if(String(entry.messageId||entry.message_id||'')!==id)continue;
     const event=normalizeBrevoEvent(entry);if(!event)continue;
     const result=await pool.query(`INSERT INTO brevo_outreach_events
        (event_type,message_id,event_at,matched_count,reason,payload)
       SELECT $1::varchar,$2::text,$3::timestamptz,1,'brevo_admin_sync',jsonb_build_object('source','brevo_admin_sync')
       WHERE NOT EXISTS (SELECT 1 FROM brevo_outreach_events
          WHERE message_id=$2 AND event_type=$1 AND event_at=$3::timestamptz)
       RETURNING id`,[event.type,id,event.time]);
     saved+=result.rows.length;
    }
   }
   return res.set('Cache-Control','no-store').json({success:true,checked,saved,failed,
    message:'Brevo event sync complete. Empty results do not prove inbox delivery.'});
  }catch(error){
   console.error('[network-brevo-event-sync]',error.code||error.name||'UNKNOWN');
   return res.status(503).json({success:false,error:'BREVO_EVENT_SYNC_UNAVAILABLE'});
  }
 });
}
module.exports={registerNetworkBrevoEventSync,normalizeBrevoEvent};
