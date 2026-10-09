'use strict';
/**
 * Phase 2 opt-in server. The existing preflight remains Railway's start command
 * until explicitly switched. No import of src/index.js or network/register-network.js.
 * HTTP endpoints return only startup verification results, never customer data.
 */
const http = require('node:http');
const { verifyTrackerContracts } = require('./tracker-contracts.cjs');

function makeHandler(schema, contracts) {
  const health = Object.freeze({
    success: true,
    environment: 'staging',
    stage: 'tracker_contracts_read_only',
    tables: schema.tables,
    columns: schema.columns,
    foreign_keys: schema.foreign_keys,
    indexes: schema.indexes,
    empty: schema.empty === true,
    app_started: false,
    providers_disabled: true,
    migrations_run: false,
    status: 'tracker_contracts_verified_only'
  });
  const contractSummary = Object.freeze({
    success: true,
    environment: 'staging',
    read_only: true,
    canonical_app_started: false,
    data_rows_returned: false,
    checks: contracts,
    status: 'query_contracts_verified_no_workflows_executed'
  });
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const path = req.url;
    if (req.method === 'GET' && path === '/__staging/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(health));
    } else if (req.method === 'GET' && path === '/__staging/tracker/contracts') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(contractSummary));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'staging diagnostics only' }));
    }
  };
}

async function main(env = process.env, deps = {}) {
  // Reuse the ORIGINAL staging safety gate: no provider secrets, production URL,
  // migration approval, scheduler, scans, or accidental full-app bootstrap.
  const { assertPreflightEnvironment } = require('./safety-gate.cjs');
  const { readOnlyDatabaseCheck } = require('./preflight-server.cjs');
  assertPreflightEnvironment(env);
  const Pool = deps.Pool || require('pg').Pool;
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000
  });
  let schema, contracts;
  try {
    schema = await readOnlyDatabaseCheck(pool);
    contracts = await verifyTrackerContracts(pool);
  } finally {
    await pool.end();
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const server = http.createServer(makeHandler(schema, contracts));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log('[STAGING-TRACKER-READONLY] Query contracts verified; no app boot, migration, providers, scans, email, or network actions.');
  return { server, schema, contracts };
}
if (require.main === module) {
  main().catch(err => {
    console.error('[STAGING-TRACKER-READONLY] REFUSED:', err.message);
    process.exitCode = 1;
  });
}
module.exports = { main, makeHandler };
