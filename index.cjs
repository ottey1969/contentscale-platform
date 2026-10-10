'use strict';
// Production keeps its canonical entrypoint. Staging only runs isolated preflight.
// Never import the full app in staging: its startup effects are not yet approved.
if (process.env.CS_DEPLOYMENT_TIER === 'staging') {
  const { main } = require('./src/staging/preflight-server.cjs');
  main().catch(err => { console.error('[STAGING-PREFLIGHT] REFUSED:', err.message); process.exitCode = 1; });
} else {
  require('./src/index.js');
}
