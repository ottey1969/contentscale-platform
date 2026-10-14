'use strict';
// Canonical Network intake: private companies only, never automatic emails or publication.
const crypto=require('node:crypto');
const path=require('node:path');
const {safeWebsite}=require('./lead-crawler-serpapi.cjs');
const {discoverCompanyContact}=require('./network-business-email-fetch.cjs');
const {registerNetworkAcquisitionInvitations,websiteEvidence}=require('./network-acquisition-invitations.cjs');
const plain=(x,n=200)=>String(x??'').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,n);
function authorized(req){
 const configured=process.env.LC_ADMIN_CODE||'',submitted=String(req.get('x-admin-code')||'');
 return configured.length>0&&configured.length===submitted.length&&crypto.timingSafeEqual(Buffer.from(configured),Buffer.from(submitted));
}
function candidate(raw){
 if(!raw||!['google_maps_serper','google_maps_serpapi'].includes(raw.source))return null;
 const site=safeWebsite(raw.website);
 const name=plain(raw.name,150),address=plain(raw.address,250),phone=plain(raw.phone,55);
 const niche=plain(raw.niche||raw.type||'roofing',80);
 if(!site||name.length<2||phone.replace(/\D/g,'').length<7||!/(?:\bNJ\b|New Jersey)/i.test(address))return null;
 const domain=new URL(site).hostname.toLowerCase().replace(/^www\./,'');
 if(['app.contentscale.site','contentscale.site'].includes(domain))return null;
 return {name,address,phone,website:site,domain,niche,source:raw.source,place_id:plain(raw.place_id,180)};
}
function registerNetworkMapsAcquisition({app,pool,auth=authorized}){
 if(!app?.get||!app?.post||!pool?.query)throw Error('Network acquisition dependencies missing');
 app.get('/network/acquisition',(_req,res)=>res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').sendFile(path.resolve(__dirname,'../public/network-acquisition.html')));
 app.get('/api/network/admin/acquisition/candidates',async(req,res)=>{
  if(!auth(req))return res.status(403).json({error:'Lead Crawler admin login required'});
  try{
   const result=await pool.query(`SELECT n.id,n.business_name,n.domain,n.canonical_url,n.primary_niche,n.city,n.status,n.public_visibility,n.website_check,
    n.metadata->'acquisition'->'email_discovery' AS email_discovery,
    n.metadata->'acquisition'->'website_review' AS website_review,
    n.metadata->'acquisition'->'invitation' AS invitation
    FROM network_directory_businesses n
    WHERE n.source='maps_acquisition'
    ORDER BY n.created_at DESC,n.id DESC LIMIT 300`);
   const count=await pool.query("SELECT count(*)::int AS total FROM network_directory_businesses WHERE source='maps_acquisition'");
   return res.json({candidates:result.rows,total:Number(count.rows[0]?.total||0)});
  }catch(e){console.error('[network-acquisition] list',e.code||e.message);return res.status(503).json({error:'Network candidate list unavailable'})}
 });

 // One canonical discovery path shared by the admin batch and the automatic
 // recovery of legacy scans. Never prepares or dispatches email.
 async function discoverAndSave(ids){
  const companies=await pool.query(
    "SELECT id,domain,canonical_url,metadata->'acquisition'->'email_discovery' AS email_discovery, metadata->'acquisition'->'website_review' AS website_review FROM network_directory_businesses WHERE id=ANY($1::bigint[]) AND source='maps_acquisition'",[ids]);
   if(companies.rows.length!==ids.length)throw Error('ACQUISITION_COMPANIES_NOT_FOUND');
   const results=await Promise.all(companies.rows.map(async company=>{
    let site=company.website_review;
    if(!site?.checked_at||(site.status==='review_required'&&/Website unavailable or restricted|Website check failed/i.test(site.reason||''))){
     try{
      site=await websiteEvidence(company.canonical_url);
      await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,website_review}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[company.id,JSON.stringify(site)]);
     }catch(e){site={status:'review_required',reason:'Website check failed',checked_at:new Date().toISOString()};}
    }
    const prev=company.email_discovery;
    if(prev?.email){return {company_id:company.id,...prev,website_review:site,cached:true};}
    try{
     const result=await discoverCompanyContact(company.canonical_url,{maxPages:5});
     if(result.domain!==String(company.domain).toLowerCase().replace(/^www\./,''))throw Error('Company domain mismatch');
     const discovery={email:result.email,source_url:result.source_url,verification:result.verification,relationship:result.relationship,contact_review_required:result.contact_review_required,fetch_issues:result.checked.filter(x=>x.status==='unavailable').map(x=>x.reason).slice(0,5),version:'public-v4',checked_at:new Date().toISOString()};
     await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,email_discovery}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[company.id,JSON.stringify(discovery)]);
     return {company_id:company.id,...discovery,website_review:site,cached:false};
    }catch(e){
     const failed={email:null,source_url:null,verification:'unavailable',version:'public-v4',checked_at:new Date().toISOString()};
     try{await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,email_discovery}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[company.id,JSON.stringify(failed)]);}catch{}
     return {company_id:company.id,...failed,website_review:site,error:'Website contact lookup unavailable'};
    }
   }));

  return results;
 }
 let emailBackfillScheduled=false,emailBackfillRunning=false;
 function scheduleEmailBackfill(){
  if(emailBackfillScheduled||emailBackfillRunning)return;
  emailBackfillScheduled=true;
  const timer=setTimeout(async()=>{
   emailBackfillScheduled=false;
   if(emailBackfillRunning)return;
   emailBackfillRunning=true;
   let inspected=0,found=0;
   try{
    const rows=await pool.query(`SELECT id FROM network_directory_businesses
      WHERE source='maps_acquisition'
        AND COALESCE(metadata->'acquisition'->'email_discovery'->>'email','')=''
        AND COALESCE(metadata->'acquisition'->'email_discovery'->>'version','')<>'public-v4'
        AND COALESCE(metadata->'acquisition'->'invitation'->>'status','')=''
      ORDER BY id DESC LIMIT 25`);
    for(let i=0;i<rows.rows.length;i+=5){
     const ids=rows.rows.slice(i,i+5).map(x=>String(x.id));
     try{const results=await discoverAndSave(ids);
      inspected+=results.length;found+=results.filter(x=>x.email).length;
     }catch(error){console.error('[network-acquisition-backfill-batch]',error.code||error.message);}
    }
    if(inspected)console.info('[network-acquisition-backfill] sites='+inspected+' emails_found='+found+' no_email_sent=true');
   }catch(e){console.error('[network-acquisition-backfill]',e.code||e.message);}
   finally{emailBackfillRunning=false;}
  },12000);
  if(typeof timer.unref==='function')timer.unref();
 }
 app.post('/api/network/admin/acquisition/discover-batch',async(req,res)=>{
  if(!auth(req))return res.status(403).json({error:'Lead Crawler admin login required'});
  const supplied=req.body?.company_ids;
  // PostgreSQL BIGINT arrives as a decimal string in pg. Normalize without precision loss.
  const ids=Array.isArray(supplied)?supplied.map(id=>typeof id==='string'?id.trim():String(id)):[];
  if(ids.length<1||ids.length>5||new Set(ids).size!==ids.length||
   ids.some(id=>!/^[1-9][0-9]{0,18}$/.test(id)||BigInt(id)>9223372036854775807n))
   return res.status(400).json({error:'Select 1 to 5 unique acquisition company IDs'});
  try{
   const results=await discoverAndSave(ids);
   return res.json({results,emails_sent:0});
  }catch(e){console.error('[network-acquisition] batch discovery',e.code||e.message);return res.status(503).json({error:'Batch lookup unavailable; existing acquisition records preserved'})}
 });
 app.post('/api/network/admin/acquisition/discover-email',async(req,res)=>{
  if(!auth(req))return res.status(403).json({error:'Lead Crawler admin login required'});
  const id=Number(req.body?.company_id);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid company ID required'});
  try{
   const record=await pool.query("SELECT id,domain,canonical_url FROM network_directory_businesses WHERE id=$1 AND source='maps_acquisition' LIMIT 1",[id]);
   if(!record.rows.length)return res.status(404).json({error:'Acquisition company not found'});
   const company=record.rows[0];
   const data=await discoverCompanyContact(company.canonical_url);
   if(data.domain!==String(company.domain).toLowerCase().replace(/^www\./,''))return res.status(422).json({error:'Company domain mismatch'});
   const discovery={email:data.email,source_url:data.source_url,verification:data.verification,relationship:data.relationship,contact_review_required:data.contact_review_required,fetch_issues:data.checked.filter(x=>x.status==='unavailable').map(x=>x.reason).slice(0,5),version:'public-v4',checked_at:new Date().toISOString()};
   await pool.query("UPDATE network_directory_businesses SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{acquisition,email_discovery}',$2::jsonb,true) WHERE id=$1 AND source='maps_acquisition'",[id,JSON.stringify(discovery)]);
   return res.json({company_id:id,...data});
  }catch(e){console.error('[network-acquisition] public email discovery',e.code||e.message);return res.status(503).json({error:'Public contact lookup unavailable; no data was modified'})}
 });
 app.post('/api/network/admin/acquisition/import',async(req,res)=>{
  if(!auth(req))return res.status(403).json({error:'Lead Crawler admin login required'});
  const entries=req.body?.leads;
  if(!Array.isArray(entries)||entries.length<1||entries.length>25)return res.status(400).json({error:'Select between 1 and 25 Maps leads'});
  const valid=entries.map(candidate);
  if(valid.some(x=>!x))return res.status(422).json({error:'Only NJ Google Maps leads with a sourced website, phone and NJ address may enter review. Nothing was imported.'});
  const unique=new Map(valid.map(x=>[x.domain,x]));
  let inserted=0,duplicates=0;
  const sql=[
   'INSERT INTO network_directory_businesses',
   '(slug,business_name,domain,canonical_url,source,source_ref,primary_niche,city,country,market,status,public_visibility,metadata,website_check)',
   "SELECT $1,$2,$3,$4,'maps_acquisition',$5,$6,$7,'US','New Jersey','imported','hidden',",
   "$8::jsonb,'{\"status\":\"not_checked\"}'::jsonb",
   'WHERE NOT EXISTS(SELECT 1 FROM network_directory_businesses n WHERE lower(n.domain)=lower($3))',
   'ON CONFLICT(slug) DO NOTHING RETURNING id'
  ].join(' ');
  try{
   for(const c of unique.values()){
    const slug='nj-maps-'+crypto.createHash('sha256').update(c.domain).digest('hex').slice(0,20);
    const meta={acquisition:{source:c.source,source_address:c.address,source_phone:c.phone,
      imported_at:new Date().toISOString(),stage:'needs_website_review',
      verified_website:false,invitation_allowed:false,emails_sent:0}};
    const result=await pool.query(sql,[slug,c.name,c.domain,c.website,c.place_id,c.niche,'New Jersey',JSON.stringify(meta)]);
    if(result.rows.length)inserted++;else duplicates++;
   }
   if(inserted>0)scheduleEmailBackfill();
   return res.json({success:true,imported:inserted,duplicates,submitted:entries.length,review_url:'/network/acquisition',
     status:'private_review',emails_sent:0,public_listed:0});
  }catch(e){console.error('[network-acquisition] import',e.code||e.message);
   return res.status(503).json({error:'Network import interrupted. Check the review list before retrying; duplicate websites cannot be imported twice.'})}
 });
 registerNetworkAcquisitionInvitations({app,pool,auth});
 scheduleEmailBackfill();
}
module.exports={registerNetworkMapsAcquisition,candidate};
