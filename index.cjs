'use strict';
// Keep the production entrypoint unchanged. Isolated staging is preflight-only.
// The full app is NOT cleared for staging boot, scans, email, AI or migrations.
if (process.env.CS_DEPLOYMENT_TIER === 'staging') {
  require('./src/staging/preflight-server.cjs');
  // preflight-server exports main(); requiring alone does not start the listener.
  const { main } = require('./src/staging/preflight-server.cjs');
  main().catch(err => { console.error('[STAGING-PREFLIGHT] REFUSED:', err.message); process.exitCode = 1; });
} else {
  require('./src/index.js');
}
