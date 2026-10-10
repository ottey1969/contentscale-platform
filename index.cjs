'use strict';
// Canonical production boot stays unchanged. Staging must fail closed when misconfigured.
const env=process.env;
const hasStagingSignals=Object.keys(env).some(k=>k.startsWith('CS_STAGING_')) ||
  env.CS_TRACKER_WORKFLOW_SHADOW==='1' || env.CS_TRACKER_WORKFLOW_READONLY_GET==='1';
if(env.CS_DEPLOYMENT_TIER==='staging'){
  const {main}=require('./src/staging/preflight-server.cjs');
  main().catch(err=>{ console.error('[STAGING-PREFLIGHT] REFUSED:',err.message); process.exitCode=1; });
}else if(hasStagingSignals){
  // Never fall through to production server when staging tier is missing or incorrect.
  console.error('[STAGING-PREFLIGHT] REFUSED: staging variables present but CS_DEPLOYMENT_TIER is not staging');
  process.exitCode=1;
}else{
  require('./src/index.js');
}
