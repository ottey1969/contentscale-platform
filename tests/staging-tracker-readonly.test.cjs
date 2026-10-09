'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { CONTRACTS, verifyTrackerContracts } = require('../src/staging/tracker-contracts.cjs');
const { makeHandler } = require('../src/staging/tracker-readonly-server.cjs');

function fakePool(failOnContract = false) {
  const queries = [];
  let releases = 0;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (failOnContract && sql.includes('tracker_case_studies')) throw new Error('mock contract failure');
      return { rows: [] };
    },
    release() { releases++; }
  };
  return { queries, get releases() { return releases; }, async connect() { return client; } };
}

test('contract SQL uses EXPLAIN without ANALYZE and only the existing Tracker relations', () => {
  assert.equal(CONTRACTS.length, 4);
  for (const { sql } of CONTRACTS) {
    assert.match(sql, /^EXPLAIN SELECT/i);
    assert.doesNotMatch(sql, /\b(ANALYZE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|CALL)\b/i);
  }
});
test('read-only transaction compiles all canonical contracts and rolls back', async () => {
  const pool = fakePool();
  const result = await verifyTrackerContracts(pool);
  assert.equal(result.length, CONTRACTS.length);
  assert.match(pool.queries[0], /READ ONLY/);
  assert.match(pool.queries[1], /^SET LOCAL statement_timeout/);
  assert.ok(pool.queries.slice(2, -1).every(q => q.startsWith('EXPLAIN SELECT')));
  assert.equal(pool.queries.at(-1), 'ROLLBACK');
  assert.equal(pool.releases, 1);
});
test('failure refuses readiness, rolls back, and releases connection', async () => {
  const pool = fakePool(true);
  await assert.rejects(verifyTrackerContracts(pool), /STAGING BLOCKED/);
  assert.equal(pool.queries.at(-1), 'ROLLBACK');
  assert.equal(pool.releases, 1);
});

async function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}
test('public diagnostics contain no customer data and reject other routes/methods', async () => {
  const server = http.createServer(makeHandler({ tables: 24, columns: 496, foreign_keys: 23, indexes: 53, empty: true }, [{ id:'client_page_identity', status:'verified' }]));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const health = await request(port, 'GET', '/__staging/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.app_started, false);
    assert.equal(health.body.empty, true);
    assert.equal(health.body.providers_disabled, true);
    assert.equal(health.headers['cache-control'], 'no-store');
    const contracts = await request(port, 'GET', '/__staging/tracker/contracts');
    assert.equal(contracts.status, 200);
    assert.equal(contracts.body.canonical_app_started, false);
    assert.equal(contracts.body.checks.length, 1);
    for (const [method, path] of [['POST','/__staging/health'],['GET','/api/tracker-client/test'],['GET','/__staging/health?debug=1']]) {
      const result = await request(port, method, path);
      assert.equal(result.status, 404);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
