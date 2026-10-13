'use strict';
const {randomBytes,createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>typeof value==='string'?value.trim():'';
function registerNetworkOpportunityPilot({app,pool,verifyGrowthAdmin}={}){
 if(!app?.get||!app?.post||!pool?.query||!verifyGrowthAdmin)throw Error('NETWORK_OPPORTUNITY_DEPENDENCIES_REQUIRED');
 app.get('/network/opportunity-admin',(req,res)=>{
  const {opportunityReviewHtml}=require('./network-opportunity-review-html.cjs');
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow');
  return res.type('html').send(opportunityReviewHtml());
 });
 app.get('/api/network/admin/opportunity-pilot',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  try{
   const results=await pool.query(`SELECT n.id,n.business_name,n.domain,n.status,n.public_visibility,
     n.metadata->'content_opportunity'->>'status' AS opportunity_status,
     c.niche,c.network_fit_score,c.website_verified_at IS NOT NULL AS website_checked
     FROM network_directory_businesses n
     JOIN contact_intelligence c ON c.id=n.contact_intelligence_id
     WHERE n.source='lead_crawler' AND n.public_visibility='hidden'
       AND n.status='unclaimed' AND c.network_fit_score>=65
     ORDER BY c.network_fit_score DESC,n.id LIMIT 5`);
   res.set('Cache-Control','no-store').json({success:true,prospects:results.rows,
    next_action:'REVIEW_AND_PREPARE',automatic_sending:false,public_listed:false});
  }catch{return res.status(503).json({success:false,error:'OPPORTUNITY_PILOT_UNAVAILABLE'});}
 });
 app.get('/api/network/admin/opportunity/:id/suggestion',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)return res.sendStatus(400);
  try{
   const found=await pool.query(`SELECT n.id,n.business_name,n.domain,
     c.niche,c.bio,c.website_verified_at,c.network_fit_score
     FROM network_directory_businesses n JOIN contact_intelligence c ON c.id=n.contact_intelligence_id
     WHERE n.id=$1 AND n.source='lead_crawler' AND n.status='unclaimed'
       AND n.public_visibility='hidden' AND c.website_verified_at IS NOT NULL`,[id]);
   if(found.rows.length!==1)return res.status(409).json({success:false,error:'VERIFIED_WEBSITE_REQUIRED'});
   const a=found.rows[0],niche=String(a.niche||'other').toLowerCase(),bio=clean(a.bio||'');
   const topics={
    marketing:['How Small Creative Teams Can Build a Sustainable Content Workflow','An editorial perspective on planning, producing and maintaining quality content for smaller teams.'],
    music:['How Independent Music Creators Can Build a More Loyal Audience','An editorial perspective on helping DJs and independent music creators connect with listeners.'],
    other:['Building an Engaged Community Around Independent Creative Work','An editorial proposal on audience relationships, community participation and sustainable creative publishing.'],
    retail:['How Independent Shops Can Explain Their Expertise Through Useful Content','An editorial proposal on practical product education and building trust with useful customer guides.']
   };
   const isMixcloud=String(a.domain).toLowerCase()==='mixcloud.com';
   const t=isMixcloud?['How Independent DJs Can Build a Loyal Audience Beyond Social Media','An article exploring how independent DJs and music creators can build relationships with listeners through consistent shows, community engagement and owned communication channels.']:topics[niche]||topics.other;
   // Always label as a research lead, not verified competitive intelligence or approved publication.
   return res.json({success:true,title:t[0],pitch:t[1]+
    ' This proposed contribution would be reviewed for relevance, factual accuracy, topical overlap and editorial fit before any full article is written. No publication is promised.',
    evidence:{source:'contact_intelligence',website_checked:true,niche,public_bio:bio.slice(0,350),
      claimed_publisher_acceptance:false,competitive_gap_verified:false},
    status:'SUGGESTED_FOR_ADMIN_REVIEW'});
  }catch(error){console.error('[network-opportunity-suggest]',error.code||'UNAVAILABLE');
   return res.status(503).json({success:false,error:'SUGGESTION_UNAVAILABLE'});}
 });
 app.post('/api/network/admin/opportunity/:id/prepare',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  const id=Number(req.params.id),title=clean(req.body?.title),pitch=clean(req.body?.pitch);
  if(!Number.isSafeInteger(id)||id<=0||title.length<15||title.length>150||
    pitch.length<80||pitch.length>1400)return res.status(400).json({success:false,error:'REVIEWED_TITLE_AND_PITCH_REQUIRED'});
  try{
   const token=randomBytes(24).toString('hex'),tokenHash=hash(token);
   const result=await pool.query(`UPDATE network_directory_businesses
     SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{content_opportunity}',
       jsonb_build_object('status','prepared','title',$2,'pitch',$3,
       'token_hash',$4,'prepared_at',now(),'approved_to_send',false)),updated_at=now()
     WHERE id=$1 AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
       AND (metadata->'content_opportunity' IS NULL)
     RETURNING id,business_name,domain`,[id,title,pitch,tokenHash]);
   if(result.rows.length!==1)return res.status(409).json({success:false,error:'OPPORTUNITY_ALREADY_EXISTS_OR_NOT_ELIGIBLE'});
   return res.json({success:true,status:'prepared',prospect:result.rows[0],
    preview_url:'/network/opportunity/'+token,
    invitation_sent:false,approval_required:true,publication_allowed:false});
  }catch(error){console.error('[network-opportunity-prepare]',{code:error.code||'UNKNOWN',detail:error.constraint||error.column||'DATABASE_WRITE_FAILED'});return res.status(503).json({success:false,error:'PREPARE_FAILED',diagnostic_code:error.code||'DATABASE_WRITE_FAILED'});}
 });
 // No email dispatch: administrator explicitly reviews and sends preview link separately.
 app.get('/network/opportunity/:token',async(req,res)=>{
  const token=clean(req.params.token);
  if(!/^[a-f0-9]{48}$/.test(token))return res.sendStatus(404);
  try{
   const data=await pool.query(`SELECT business_name,domain,metadata->'content_opportunity' AS opportunity
     FROM network_directory_businesses WHERE metadata->'content_opportunity'->>'token_hash'=$1
     AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden' LIMIT 1`,[hash(token)]);
   if(data.rows.length!==1)return res.sendStatus(404);
   const row=data.rows[0],opp=row.opportunity;
   if(!['prepared','interested'].includes(opp.status))return res.sendStatus(404);
   const escape=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
   res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow');
   return res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Content opportunity | ContentScale</title></head><body style="font:17px/1.6 system-ui;max-width:720px;margin:55px auto;padding:0 22px"><h1>Content opportunity for ${escape(row.business_name)}</h1><h2>${escape(opp.title)}</h2><p>${escape(opp.pitch)}</p><p>Interested? We will verify the website and confirm whether a suitable publishing opportunity exists before preparing the full article. No publication is guaranteed.</p><form method="post" action="/network/opportunity/${token}/interested"><button style="background:#16813f;color:white;padding:14px 24px;border:0;border-radius:7px;font:inherit" type="submit">I'm interested</button></form></body></html>`);
  }catch{return res.sendStatus(503);}
 });
 app.post('/network/opportunity/:token/interested',async(req,res)=>{
  const token=clean(req.params.token);
  if(!/^[a-f0-9]{48}$/.test(token))return res.sendStatus(404);
  try{
   const result=await pool.query(`UPDATE network_directory_businesses SET
     metadata=jsonb_set(metadata,'{content_opportunity,status}','"interested"'::jsonb),
     updated_at=now()
     WHERE metadata->'content_opportunity'->>'token_hash'=$1
       AND metadata->'content_opportunity'->>'status'='prepared'
       AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
     RETURNING id`,[hash(token)]);
   if(!result.rows.length)return res.sendStatus(409);
   res.set('Cache-Control','no-store');
   return res.type('html').send('<!doctype html><html><meta charset="utf-8"><title>Thank you | ContentScale</title><body style="font:18px system-ui;max-width:620px;margin:60px auto">Thank you. Your interest has been recorded. We will review the proposed opportunity before taking the next step.</body></html>');
  }catch{return res.sendStatus(503);}
 });
}
module.exports={registerNetworkOpportunityPilot};
