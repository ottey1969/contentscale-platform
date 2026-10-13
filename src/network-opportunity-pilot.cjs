'use strict';
const {randomBytes,createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>typeof value==='string'?value.trim():'';
function registerNetworkOpportunityPilot({app,pool,verifyGrowthAdmin}={}){
 if(!app?.get||!app?.post||!pool?.query||!verifyGrowthAdmin)throw Error('NETWORK_OPPORTUNITY_DEPENDENCIES_REQUIRED');
 const {registerNetworkBrevoEventSync}=require('./network-brevo-event-sync.cjs');
 registerNetworkBrevoEventSync({app,pool,verifyGrowthAdmin});
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
     n.metadata->'content_opportunity'->>'publisher_understood_at' AS publisher_understood_at,
     n.website_check->>'outcome' AS website_check_outcome,
     n.metadata->'content_opportunity'->'email_result'->>'provider_accepted' AS email_provider_accepted,
     n.metadata->'content_opportunity'->'email_result'->>'recorded_at' AS email_accepted_at,
     (SELECT e.event_type FROM brevo_outreach_events e
        WHERE e.message_id=n.metadata->'content_opportunity'->'email_result'->>'message_id'
        AND e.event_type IN ('delivered','hard_bounce','soft_bounce','blocked','invalid','deferred','opened','click','unsubscribed')
        ORDER BY e.event_at DESC NULLS LAST,e.id DESC LIMIT 1) AS email_last_event,
     c.niche,c.network_fit_score,c.website_verified_at IS NOT NULL AS website_checked,
     CASE WHEN c.email_type='business' AND c.suppressed_at IS NULL THEN c.email ELSE NULL END AS business_contact_email,
     CASE WHEN split_part(lower(coalesce(c.email,'')),'@',2)=lower(n.domain) THEN true ELSE false END AS email_matches_site,
     CASE WHEN c.email IS NULL OR btrim(c.email)='' THEN 'MISSING' WHEN c.suppressed_at IS NOT NULL THEN 'SUPPRESSED' WHEN c.email_type <> 'business' THEN 'REVIEW_REQUIRED' ELSE 'BUSINESS_CONTACT_FOUND' END AS contact_status
     FROM network_directory_businesses n
     JOIN contact_intelligence c ON c.id=n.contact_intelligence_id
     WHERE n.source='lead_crawler' AND n.public_visibility='hidden'
       AND n.status='unclaimed'
       AND ((c.network_fit_score>=65 AND c.website_verified_at IS NOT NULL AND c.suppressed_at IS NULL
             AND lower(coalesce(c.niche,'')) NOT IN ('vape','vaping','nicotine','tobacco'))
        OR n.metadata->'content_opportunity'->>'status' IN ('invited','interested','prepared'))
     ORDER BY CASE n.metadata->'content_opportunity'->>'status'
       WHEN 'interested' THEN 0 WHEN 'invited' THEN 1 WHEN 'prepared' THEN 2 ELSE 3 END,
       c.network_fit_score DESC,n.id LIMIT 5`);
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
       AND n.public_visibility='hidden' AND c.website_verified_at IS NOT NULL
       AND c.network_fit_score>=65 AND c.suppressed_at IS NULL`,[id]);
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
   const {inspectEditorialOverlap}=require('./network-editorial-overlap.cjs');
   const overlap=await inspectEditorialOverlap({domain:a.domain,title:t[0],apiKey:process.env.SERPAPI_KEY});
   // Never turn the absence of search data into a false claim that an idea is new.
   return res.json({success:true,title:t[0],pitch:t[1]+
    ' This proposed contribution would be reviewed for relevance, factual accuracy, topical overlap and editorial fit before any full article is written. No publication is promised.',
    evidence:{source:'contact_intelligence',website_checked:true,niche,public_bio:bio.slice(0,350),
      claimed_publisher_acceptance:false,competitive_gap_verified:false},
    overlap,status:'SUGGESTED_FOR_ADMIN_REVIEW'});
  }catch(error){console.error('[network-opportunity-suggest]',error.code||'UNAVAILABLE');
   return res.status(503).json({success:false,error:'SUGGESTION_UNAVAILABLE'});}
 });
 app.post('/api/network/admin/opportunity/:id/refresh-preview',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)return res.sendStatus(400);
  const token=randomBytes(24).toString('hex');
  try{
   const result=await pool.query(`UPDATE network_directory_businesses
    SET metadata=jsonb_set(metadata,'{content_opportunity,token_hash}',to_jsonb($2::text)),updated_at=now()
    WHERE id=$1 AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
      AND metadata->'content_opportunity'->>'status'='prepared'
    RETURNING id,business_name,domain`,[id,hash(token)]);
   if(!result.rows.length)return res.status(409).json({success:false,error:'ONLY_UNSENT_PREVIEWS_CAN_BE_REFRESHED'});
   return res.json({success:true,preview_url:'/network/opportunity/'+token,prospect:result.rows[0],invitation_sent:false});
  }catch(error){console.error('[network-preview-recovery]',error.code||'UNKNOWN');
   return res.status(503).json({success:false,error:'PREVIEW_RECOVERY_UNAVAILABLE',diagnostic_code:error.code||'UNKNOWN'});}
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
       jsonb_build_object('status','prepared','title',$2::text,'pitch',$3::text,
       'token_hash',$4::text,'prepared_at',now(),'approved_to_send',false)),updated_at=now()
     WHERE id=$1 AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
       AND (metadata->'content_opportunity' IS NULL)
     RETURNING id,business_name,domain`,[id,title,pitch,tokenHash]);
   if(result.rows.length!==1)return res.status(409).json({success:false,error:'OPPORTUNITY_ALREADY_EXISTS_OR_NOT_ELIGIBLE'});
   return res.json({success:true,status:'prepared',prospect:result.rows[0],
    preview_url:'/network/opportunity/'+token,
    invitation_sent:false,approval_required:true,publication_allowed:false});
  }catch(error){console.error('[network-opportunity-prepare]',{code:error.code||'UNKNOWN',detail:error.constraint||error.column||'DATABASE_WRITE_FAILED'});return res.status(503).json({success:false,error:'PREPARE_FAILED',diagnostic_code:error.code||'DATABASE_WRITE_FAILED'});}
 });
 // Prospect self-service opt-out is scoped to this invitation and the
 // central Contact Intelligence suppression list. No account required.
 app.get('/network/opportunity/:token/unsubscribe',(req,res)=>{
  const token=clean(req.params.token);
  if(!/^[a-f0-9]{48}$/.test(token))return res.sendStatus(404);
  res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow');
  return res.type('html').send('<!doctype html><html><meta charset="utf-8"><title>Email preferences | ContentScale</title><body style="font:18px system-ui;max-width:640px;margin:60px auto"><h1>Email preferences</h1><p>You can stop content opportunity invitations from ContentScale.</p><form method="POST"><button type="submit">Unsubscribe</button></form></body></html>');
 });
 app.post('/network/opportunity/:token/unsubscribe',async(req,res)=>{
  const token=clean(req.params.token);
  if(!/^[a-f0-9]{48}$/.test(token))return res.sendStatus(404);
  try{
   const lookup=await pool.query(`SELECT c.id,c.email FROM network_directory_businesses n
    JOIN contact_intelligence c ON c.id=n.contact_intelligence_id
    WHERE n.metadata->'content_opportunity'->>'token_hash'=$1
      AND n.source='lead_crawler' LIMIT 1`,[hash(token)]);
   const c=lookup.rows?.[0];if(!c?.email)return res.sendStatus(404);
   await pool.query(`INSERT INTO contact_intelligence_suppressions(contact_id,email,source,reason,actor)
    SELECT $1,$2,'network_opportunity','prospect_opt_out','prospect'
    WHERE NOT EXISTS(SELECT 1 FROM contact_intelligence_suppressions
      WHERE lower(email)=lower($2))`,[c.id,c.email]);
   await pool.query(`UPDATE contact_intelligence SET suppressed_at=COALESCE(suppressed_at,now()),
     suppression_reason=COALESCE(suppression_reason,'network_opportunity_opt_out')
     WHERE id=$1`,[c.id]);
   res.set('Cache-Control','no-store').type('html').send('<!doctype html><html><meta charset="utf-8"><title>Unsubscribed</title><body style="font:18px system-ui;max-width:640px;margin:60px auto">You have been unsubscribed from ContentScale opportunity invitations.</body></html>');
  }catch(error){console.error('[network-invite-opt-out]',error.code||'UNKNOWN');
   return res.sendStatus(503);}
 });
 // Explicit one-by-one admin-approved invitation via existing Brevo account.
 // Never bulk send and never contact suppressed or nonbusiness addresses.
 app.post('/api/network/admin/opportunity/:id/send-invitation',verifyGrowthAdmin,async(req,res)=>{
  if(req.engineUser?.isAdmin!==true)return res.sendStatus(403);
  const id=Number(req.params.id),token=clean(req.body?.token),confirmed=req.body?.confirm_send===true;
  if(!Number.isSafeInteger(id)||id<=0||!/^[a-f0-9]{48}$/.test(token)||!confirmed)
   return res.status(400).json({success:false,error:'EXPLICIT_INVITATION_CONFIRMATION_REQUIRED'});
  const fail=(status,error)=>res.status(status).json({success:false,error});
  let record;
  try{
   const check=await pool.query(`SELECT n.id,n.business_name,n.domain,n.metadata->'content_opportunity' AS opportunity,
    c.email,c.email_type,c.suppressed_at,c.source_consent,
    EXISTS(SELECT 1 FROM contact_intelligence_suppressions s
      WHERE lower(s.email)=lower(c.email)) AS email_suppressed
    FROM network_directory_businesses n JOIN contact_intelligence c ON c.id=n.contact_intelligence_id
    WHERE n.id=$1 AND n.source='lead_crawler' AND n.status='unclaimed'
      AND n.public_visibility='hidden' LIMIT 1`,[id]);
   record=check.rows?.[0];
   if(!record||record.opportunity?.status!=='prepared'||record.opportunity?.token_hash!==hash(token))
    return fail(409,'PREPARED_PRIVATE_OPPORTUNITY_REQUIRED');
   if(!record.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)||
       record.email_type!=='business'||record.suppressed_at||record.email_suppressed)
    return fail(409,'VERIFIED_BUSINESS_EMAIL_AND_SUPPRESSION_CHECK_REQUIRED');
   if(!process.env.BREVO_API_KEY||!process.env.FROM_EMAIL)return fail(503,'EMAIL_PROVIDER_NOT_CONFIGURED');
   const claim=await pool.query(`UPDATE network_directory_businesses
    SET metadata=jsonb_set(metadata,'{content_opportunity,status}','"sending"'::jsonb),updated_at=now()
    WHERE id=$1 AND metadata->'content_opportunity'->>'token_hash'=$2
      AND metadata->'content_opportunity'->>'status'='prepared'
      AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
    RETURNING id`,[id,hash(token)]);
   if(claim.rows.length!==1)return fail(409,'INVITATION_ALREADY_STARTED');
  }catch(error){console.error('[network-invite-check]',error.code||'UNKNOWN');
   return fail(503,'INVITATION_CHECK_UNAVAILABLE');}
  const url='https://app.contentscale.site/network/opportunity/'+token;
  let confirmedDelivery=false;
  try{
   const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',
    redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{'api-key':process.env.BREVO_API_KEY,'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({
     sender:{email:process.env.FROM_EMAIL,name:'ContentScale'},
     to:[{email:record.email}],subject:'A content opportunity for '+record.business_name,
     textContent:'Hello,\\n\\nWe have prepared an editorial content opportunity that may fit '+record.business_name+
      '. Review the proposed topic here: '+url+
      '\\n\\nThis is a proposal only; publication is not guaranteed. If this is not relevant, unsubscribe here: https://app.contentscale.site/network/opportunity/'+token+'/unsubscribe\\n\\nContentScale'
    })});
   confirmedDelivery=response.ok;
   const body=await response.json().catch(()=>({}));
   const nextState=confirmedDelivery?'invited':'send_unknown';
   await pool.query(`UPDATE network_directory_businesses
      SET metadata=jsonb_set(jsonb_set(metadata,'{content_opportunity,status}',to_jsonb($3::text)),
       '{content_opportunity,email_result}',jsonb_build_object('provider_accepted',$4::boolean,'message_id',$5::text,'recorded_at',now())),
       updated_at=now()
      WHERE id=$1 AND metadata->'content_opportunity'->>'token_hash'=$2
        AND metadata->'content_opportunity'->>'status'='sending'`,
       [id,hash(token),nextState,confirmedDelivery,String(body.messageId||'')]);
   if(!confirmedDelivery)return fail(502,'EMAIL_PROVIDER_REJECTED_CHECK_BEFORE_RETRY');
   return res.json({success:true,status:'invited',provider_accepted:true,
    message_id:String(body.messageId||''),recipient_domain:record.email.split('@')[1]});
  }catch(error){
   console.error('[network-opportunity-invite]',error.name||'UNKNOWN');
   // Unknown delivery outcome is never blindly retried: prevents duplicate cold outreach.
   try{await pool.query(`UPDATE network_directory_businesses
     SET metadata=jsonb_set(metadata,'{content_opportunity,status}','"send_unknown"'::jsonb),updated_at=now()
     WHERE id=$1 AND metadata->'content_opportunity'->>'token_hash'=$2
       AND metadata->'content_opportunity'->>'status'='sending'`,[id,hash(token)]);}catch{}
   return fail(503,'EMAIL_RESULT_UNKNOWN_REVIEW_BEFORE_RETRY');
  }
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
   if(!['prepared','invited','interested'].includes(opp.status))return res.sendStatus(404);
   const escape=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
   res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow');
   return res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Content opportunity | ContentScale</title></head><body style="font:17px/1.6 system-ui;max-width:720px;margin:55px auto;padding:0 22px"><p style="color:#16783d;font-weight:700">ContentScale Network · Personal invitation</p><h1>A publishing opportunity for ${escape(row.business_name)}</h1><p>ContentScale Network connects relevant businesses, content creators and independent publishers around useful, original articles. We research potential editorial matches, prepare proposals and coordinate publication only after the participating parties agree.</p><h2>Your proposed article</h2><h3>${escape(opp.title)}</h3><p>${escape(opp.pitch)}</p><h2>Publish on your own website</h2><p>We invite your business to become a <strong>ContentScale Network publishing partner</strong>. This means reviewing a relevant, original article and, only if you approve it, publishing the agreed article <strong>on your own website</strong> with the required ContentScale attribution. ContentScale researches and prepares the proposal. You retain editorial choice; no article is published without your agreement.</p><p>As a participating publisher, you may also be considered for relevant opportunities for your own business. Participation does not guarantee publication elsewhere, traffic or rankings.</p><h2>What happens if you are interested?</h2><ol><li>We record your interest in this proposal.</li><li>ContentScale checks your organization, website, editorial relevance and the next steps with you.</li><li>After agreement, we prepare a unique article for your review; you decide whether to publish it on your own website with ContentScale attribution.</li></ol><p><strong>No commitment or automatic membership.</strong> Expressing interest does not create a public Network listing, require publication, or guarantee an article placement.</p>${opp.status==='interested'?'<p style="color:#16783d;font-weight:700">Your interest has already been recorded. ContentScale will review the next step.</p>':'<form method="post" action="/network/opportunity/${token}/interested"><label style="display:block;margin:20px 0"><input type="checkbox" name="publisher_understood" value="yes" required> I understand that a publishing partnership involves reviewing and, if agreed, publishing content on my own website with ContentScale attribution.</label><button style="background:#16813f;color:white;padding:14px 24px;border:0;border-radius:7px;font:inherit" type="submit">I am interested in becoming a publishing partner</button></form>'}<p><small>Questions? <a href="mailto:info@contentscale.site">Contact ContentScale</a>. This is a private invitation, not a published article.</small></p></body></html>`);
  }catch{return res.sendStatus(503);}
 });
 app.post('/network/opportunity/:token/interested',async(req,res)=>{
  const token=clean(req.params.token);
  if(!/^[a-f0-9]{48}$/.test(token))return res.sendStatus(404);
  if(req.body?.publisher_understood!=='yes')return res.status(400).type('html').send('Please confirm you understand the publishing partnership before submitting.');
  try{
   const result=await pool.query(`UPDATE network_directory_businesses SET
     metadata=jsonb_set(jsonb_set(metadata,'{content_opportunity,status}','"interested"'::jsonb),'{content_opportunity,publisher_understood_at}',to_jsonb(now())),
     updated_at=now()
     WHERE metadata->'content_opportunity'->>'token_hash'=$1
       AND metadata->'content_opportunity'->>'status' IN ('prepared','invited')
       AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
     RETURNING id`,[hash(token)]);
   if(!result.rows.length){
    // A browser retry after a successful acceptance must not show a conflict
    // or create a second participation event.
    const prior=await pool.query(`SELECT id FROM network_directory_businesses
      WHERE metadata->'content_opportunity'->>'token_hash'=$1
        AND metadata->'content_opportunity'->>'status'='interested'
        AND metadata->'content_opportunity'->>'publisher_understood_at' IS NOT NULL
        AND source='lead_crawler' AND status='unclaimed' AND public_visibility='hidden'
      LIMIT 1`,[hash(token)]);
    if(!prior.rows.length)return res.sendStatus(409);
   }
   res.set('Cache-Control','no-store');
   return res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Interest recorded | ContentScale Network</title><body style="font:18px/1.6 system-ui;max-width:650px;margin:60px auto;padding:0 18px"><p style="color:#16813f;font-weight:700">ContentScale Network</p><h1>Thank you — your interest is recorded</h1><p>We received your interest in the proposed content opportunity. No membership or publishing agreement has been created.</p><h2>What happens next?</h2><ol><li>ContentScale reviews the organization, website and fit for the proposed editorial collaboration.</li><li>We contact you with any questions and explain the participation options.</li><li>If you and ContentScale agree, we prepare an article for your review and potential publication on your own website with attribution.</li></ol><p>Questions? <a href="mailto:info@contentscale.site">info@contentscale.site</a></p></body></html>');
  }catch{return res.sendStatus(503);}
 });
}
module.exports={registerNetworkOpportunityPilot};
