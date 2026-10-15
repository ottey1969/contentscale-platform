'use strict';
const path=require('node:path');
const {websiteEvidence}=require('./network-acquisition-invitations.cjs');
const idList=raw=>Array.from(new Set((Array.isArray(raw)?raw:[]).map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))).slice(0,100);
function registerContactStagingAdmin(app,pool,auth){
 const guard=(req,res)=>{if(auth(req))return true;res.status(403).json({error:'Adminsessie ontbreekt'});return false};
 app.get('/network/contact-staging',(_req,res)=>res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex,nofollow').sendFile(path.resolve(__dirname,'../public/network-contact-staging.html')));
 app.get('/api/network/admin/acquisition/contact-staging',async(req,res)=>{
  if(!guard(req,res))return;
  const status=String(req.query.status||'active'),network=String(req.query.network||'all');
  const where=["1=1"];if(status==='archived')where.push("status='archived'");else where.push("status<>'archived'");
  if(network==='publisher')where.push("status='domain_verified' AND network_publisher_candidate IS TRUE AND COALESCE(network_fit_score,0)>=60");
  else if(network==='business')where.push("status='domain_verified' AND website_url IS NOT NULL");
  try{
   const r=await pool.query("SELECT id,company_name,username,email,niche,country,city,status,reason,website_url,website_candidate,website_verified_at,network_fit_score,network_fit_label,network_publisher_candidate,network_vertical FROM contact_intelligence WHERE "+where.join(' AND ')+" ORDER BY id DESC LIMIT 300");
   const count=await pool.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='archived')::int AS archived,count(*) FILTER(WHERE status='domain_verified' AND network_publisher_candidate IS TRUE)::int AS publishers FROM contact_intelligence");
   res.json({items:r.rows,stats:count.rows[0],network_note:'Verified Contact Intelligence companies already synchronize to the canonical Network identity; this screen never duplicates them.'});
  }catch(e){console.error('[contact-staging] list',e.code||e.message);res.status(503).json({error:'Contact Intelligence tijdelijk niet beschikbaar'})}
 });
 app.post('/api/network/admin/acquisition/contact-staging/archive',async(req,res)=>{
  if(!guard(req,res))return;
  const ids=idList(req.body?.ids),restore=req.body?.restore===true;
  if(!ids.length)return res.status(400).json({error:'Selecteer minimaal één contact'});
  try{
   const q=restore?
    await pool.query("UPDATE contact_intelligence SET status=COALESCE(NULLIF(network_fit_evidence->>'_archived_status',''),'needs_review'),network_fit_evidence=COALESCE(network_fit_evidence,'{}'::jsonb)-'_archived_status',updated_at=NOW() WHERE id=ANY($1::bigint[]) AND status='archived' RETURNING id",[ids]):
    await pool.query("UPDATE contact_intelligence SET network_fit_evidence=jsonb_set(COALESCE(network_fit_evidence,'{}'::jsonb),'{_archived_status}',to_jsonb(status),true),status='archived',updated_at=NOW() WHERE id=ANY($1::bigint[]) AND status NOT IN ('archived','suppressed') RETURNING id",[ids]);
   res.json({updated:q.rowCount,restore,notice:'Alle centrale Network-bedrijven, verstuurde uitnodigingen en uitschrijvingen blijven bewaard.'});
  }catch(e){console.error('[contact-staging] archive',e.code||e.message);res.status(503).json({error:'Status kon niet worden opgeslagen'})}
 });
 app.post('/api/network/admin/acquisition/contact-staging/recheck',async(req,res)=>{
  if(!guard(req,res))return;
  const ids=idList(req.body?.ids).slice(0,20);
  if(!ids.length)return res.status(400).json({error:'Selecteer maximaal twintig contacten'});
  try{
   const rows=await pool.query("SELECT id,website_url,website_candidate,status FROM contact_intelligence WHERE id=ANY($1::bigint[]) AND status NOT IN ('archived','suppressed')",[ids]);
   let checked=0,verified=0,skipped=0;
   for(const c of rows.rows){
    const website=c.website_url||c.website_candidate;
    if(!website){skipped++;continue}
    let evidence;try{evidence=await websiteEvidence(website)}catch{evidence={status:'review_required'}}
    checked++;
    if(evidence.status==='site_observed'){
     verified++;
     await pool.query("UPDATE contact_intelligence SET website_verified_at=CASE WHEN status='domain_verified' THEN NOW() ELSE website_verified_at END,reason=CASE WHEN status='domain_verified' THEN reason ELSE 'Homepage reachable; complete canonical QuickScan website verification for Network' END,updated_at=NOW() WHERE id=$1 AND status NOT IN ('archived','suppressed')",[c.id]);
    }else{
     await pool.query("UPDATE contact_intelligence SET reason='Website recheck requires manual review',updated_at=NOW() WHERE id=$1 AND status NOT IN ('archived','suppressed')",[c.id]);
    }
   }
   res.json({checked,verified,skipped,notice:'Dit is een hercontrole van websitebereikbaarheid, niet een nieuwe Network Fit-score. De oorspronkelijke Network-status en verzendhistorie blijven intact.'});
  }catch(e){console.error('[contact-staging] recheck',e.code||e.message);res.status(503).json({error:'Websitecontrole kon niet worden afgerond'})}
 });
}
module.exports={registerContactStagingAdmin};
