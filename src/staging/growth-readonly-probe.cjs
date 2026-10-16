'use strict';
// Isolated staging probe only. Never boot canonical index.js or expose customer records.
// Read-only DB transaction; registration inspection does NOT invoke any Growth endpoints.
const http=require('node:http');
const {createHash}=require('node:crypto');
const {registerGrowthLiveRoutes}=require('../growth-live-routes.cjs');
const {prepareGrowthCmsHandoff,packageGrowthZip}=require('../growth-cms-handoff.cjs');

function assertGrowthStagingSafety(env){
 const errors=[];
 if(env.CS_DEPLOYMENT_TIER!=='staging')errors.push('STAGING_TIER_REQUIRED');
 if(env.CS_STAGING_SIDE_EFFECTS_DISABLED!=='true')errors.push('SIDE_EFFECTS_MUST_BE_DISABLED');
 if(env.CS_STAGING_ISOLATED_DB_CONFIRMED!=='true')errors.push('ISOLATED_DB_CONFIRMATION_REQUIRED');
 if(env.CS_STAGING_SCAN_EXECUTION_ENABLED!=='false')errors.push('SCANNERS_MUST_BE_DISABLED');
 if(env.ENABLE_TRACKER_SCHEDULER!=='false')errors.push('SCHEDULER_MUST_BE_DISABLED');
 let db;
 try{db=new URL(env.DATABASE_URL)}catch{errors.push('STAGING_DATABASE_URL_REQUIRED')}
 if(!env.CS_GROWTH_STAGING_DB_HOST||!db||db.hostname!==env.CS_GROWTH_STAGING_DB_HOST)
  errors.push('PINNED_ISOLATED_DATABASE_HOST_REQUIRED');
 if(db&&(!['postgres:','postgresql:'].includes(db.protocol)||!db.hostname.endsWith('.neon.tech')))
  errors.push('NEON_DATABASE_REQUIRED');
 if(errors.length)throw Error('GROWTH_STAGING_REFUSED: '+errors.join(','));
 return true;
}

function inspectGrowthRouteRegistration(){
 const paths=new Set();
 const app={get:(p,...h)=>{if(h.length)paths.add('GET '+p)},
  post:(p,...h)=>{if(h.length)paths.add('POST '+p)}};
 const inertPool={query(){throw Error('NO_DATABASE_QUERY_ALLOWED_DURING_ROUTE_REGISTRATION')}};
 registerGrowthLiveRoutes({app,pool:inertPool,
  verifyEngineAccess(){throw Error('NO_AUTH_EXECUTION_ALLOWED_DURING_ROUTE_REGISTRATION')}});
 const required=[
  'GET /api/growth/admin/pages/:pageId/readiness',
  'GET /api/growth/admin/pages/:pageId/click-opportunities',
  'GET /api/growth/admin/pages/:pageId/daily-breakthrough',
  'POST /api/growth/admin/pages/:pageId/import-daily-gsc',
  'POST /api/growth/admin/pages/:pageId/cms-handoff',
  'POST /api/growth/admin/pages/:pageId/elementor-draft'];
 return {routes_registered:required.every(x=>paths.has(x)),
  required_route_count:required.length,missing_routes:required.filter(x=>!paths.has(x))};
}

function inspectSyntheticCmsHandoff(){
 const originalHtml='<article><h1>Roof repair services</h1><p>Original page text and images remain unchanged.</p></article>';
 const actualHash=createHash('sha256').update(originalHtml).digest('hex');
 const input={canonicalUrl:'https://example.test/roof-repair/',originalHtml,
  sourceExpectedSha256:actualHash,cms:'wix',editorApproved:true,
  pageTitle:'Roof Repair Information | Example',metaDescription:'Read about a roof repair assessment and questions to ask before requesting a service.',
  evidenceScope:'observed',
  changes:[{approved:true,evidence_ref:'observed:synthetic-integration-fixture',
    html:'<section><h2>How a roof inspection works</h2><p>Ask the contractor about leaks, flashing, drainage, and an inspection before approving work.</p><a href="https://example.test/contact/">Contact options</a></section>'}]};
 const result=prepareGrowthCmsHandoff(input);
 if(result.status!=='HANDOFF_READY_FOR_EDITOR')throw Error('SYNTHETIC_CMS_HANDOFF_BLOCKED');
 const zip=packageGrowthZip(result.files);
 return {cms_handoff_ready:result.status==='HANDOFF_READY_FOR_EDITOR',
  zip_valid:zip.readUInt32LE(0)===0x04034b50&&zip.readUInt16LE(zip.length-22+10)===6,
  source_revision_enforced:result.manifest.source_sha256===actualHash,
  paid_provider_required:result.manifest.no_paid_provider_required!==true,
  automatic_publishing:result.manifest.automatic_publishing!==false};
}
async function inspectIsolatedGrowthSchema(pool){
 if(typeof pool?.connect!=='function')throw Error('READ_ONLY_TRANSACTION_REQUIRED');
 const db=await pool.connect();
 try{
  await db.query('BEGIN TRANSACTION READ ONLY');
  const result=await db.query("SELECT to_regclass('public.tracker_clients') IS NOT NULL AS clients, to_regclass('public.tracker_pages') IS NOT NULL AS pages, to_regclass('public.growth_gsc_daily_page_evidence') IS NOT NULL AS daily_gsc, to_regclass('public.growth_commercial_outcome_events') IS NOT NULL AS commercial_outcomes");
  const row=result.rows?.[0]||{};
  return {tracker_schema_present:row.clients===true&&row.pages===true,
   growth_schema_present:row.daily_gsc===true&&row.commercial_outcomes===true};
 }finally{
  await db.query('ROLLBACK').catch(()=>{});
  db.release();
 }
}
async function inspectGrowthStaging(pool){
 const routes=inspectGrowthRouteRegistration();
 const cms=inspectSyntheticCmsHandoff();
 const schema=await inspectIsolatedGrowthSchema(pool);
 return {ready:routes.routes_registered&&cms.cms_handoff_ready&&cms.zip_valid&&
   cms.source_revision_enforced&&!cms.paid_provider_required&&!cms.automatic_publishing&&
   schema.tracker_schema_present&&schema.growth_schema_present,
  route_registration:routes.routes_registered,route_count:routes.required_route_count,
  synthetic_wix_zip:cms.zip_valid,source_revision_enforced:cms.source_revision_enforced,
  isolated_tracker_schema:schema.tracker_schema_present,isolated_growth_schema:schema.growth_schema_present,
  actual_gsc_authorization_tested:false,real_elementor_render_tested:false,
  actual_client_page_data_exposed:false,writes_executed:false,
  canonical_app_started:false,providers_disabled:true};
}
function makeHandler(probe){
 return (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  if(req.method==='GET'&&['/__staging/health','/__staging/growth/probe'].includes(req.url)){
   res.writeHead(probe.ready?200:503,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({success:probe.ready,environment:'staging',
    stage:'growth_isolated_read_only_integration',...probe}));
  }else{
   res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({error:'staging health and synthetic probe only'}));
  }
 };
}
async function main(env=process.env,deps={}){
 assertGrowthStagingSafety(env);
 const Pool=deps.Pool||require('pg').Pool;
 const pool=new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,
  idleTimeoutMillis:1000});
 let probe;
 try{probe=await inspectGrowthStaging(pool)}finally{await pool.end()}
 if(!probe.ready)throw Error('GROWTH_STAGING_INTEGRATION_NOT_READY');
 const port=Number(env.PORT||3000);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_STAGING_PORT');
 const server=http.createServer(makeHandler(probe));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
 console.log('[GROWTH-STAGING] Verified read-only schema, canonical route registration and synthetic CMS ZIP; no live Growth actions.');
 return {server,probe};
}
if(require.main===module)main().catch(e=>{console.error('[GROWTH-STAGING] REFUSED:',e.message);process.exitCode=1});
module.exports={assertGrowthStagingSafety,inspectGrowthRouteRegistration,
 inspectSyntheticCmsHandoff,inspectIsolatedGrowthSchema,inspectGrowthStaging,makeHandler,main};
