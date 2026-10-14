'use strict';
// Canonical Network intake: private companies only, never automatic emails or publication.
const crypto=require('node:crypto');
const path=require('node:path');
const {safeWebsite}=require('./lead-crawler-serpapi.cjs');
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
   const result=await pool.query("SELECT id,business_name,domain,canonical_url,primary_niche,city,status,public_visibility,website_check FROM network_directory_businesses WHERE source='maps_acquisition' ORDER BY created_at DESC,id DESC LIMIT 300");
   return res.json({candidates:result.rows});
  }catch(e){console.error('[network-acquisition] list',e.code||e.message);return res.status(503).json({error:'Network candidate list unavailable'})}
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
   return res.json({success:true,imported:inserted,duplicates,submitted:entries.length,review_url:'/network/acquisition',
     status:'private_review',emails_sent:0,public_listed:0});
  }catch(e){console.error('[network-acquisition] import',e.code||e.message);
   return res.status(503).json({error:'Network import interrupted. Check the review list before retrying; duplicate websites cannot be imported twice.'})}
 });
}
module.exports={registerNetworkMapsAcquisition,candidate};
