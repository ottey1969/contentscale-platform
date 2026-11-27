'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createContext, runInContext } = require('node:vm');
const test = require('node:test');
const { Pool } = require('pg');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);
const build = 'checkpoint-fixture';
const html = '<html><head><title>Commercial fixture</title></head><body><h1>Audit fixture</h1>' +
  '<p>Page content supplied by the isolated test boundary.</p>'.repeat(20) + '</body></html>';

function worker(pool, scans) {
  const source = readFileSync(require.resolve('../src/index.js'), 'utf8');
  const start = source.indexOf('async function _auditSiteHandler(');
  const end = source.indexOf("app.post('/api/audit-site', _auditSiteHandler)", start);
  const context = createContext({
    pool, require: specifier => require('../src/' + specifier.replace(/^\.\//, '')),
    URL, AbortController, AbortSignal, process, console,
    CONTENTSCALE_BUILD_ID: build,
    _auditPageCheckpoints: new Map(), _auditJobs: {}, _AUDIT_CHECKPOINT_TTL_MS: 86400000,
    _ensureAuditCheckpointTable: async () => true,
    _auditToolAccess: async () => ({ ok: true, accessType: 'all-pages' }),
    _auditToolModeAllowed: () => true,
    _resolveSitemapUrls: async () => [],
    axios: { get: async () => ({ data: html }) },
    fetch: async () => ({ json: async () => ({ success: true, html }) }),
    _canonicalContentScoreScan: async input => {
      scans.push(input.url || 'manual');
      const fetch_evidence = input.url ? {
        requested_url: input.url, final_url: input.url, valid_page_content: true, live_http_verified: true
      } : undefined;
      return { score: input.url ? 73 : 41, content_stats: { wordCount: 160 }, fetch_evidence };
    }
  });
  const handler = runInContext(source.slice(start, end) + '\n_auditSiteHandler;', context);
  return async (url, options = {}) => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ body: { url, mode: 'test', ...options } }, response);
    assert.equal(response.code, 200, JSON.stringify(response.body));
    return response.body;
  };
}

async function withCheckpoints(run) {
  const schema = 'audit_checkpoint_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE audit_page_checkpoints (
      url TEXT PRIMARY KEY,page_data JSONB NOT NULL,scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),build_id TEXT)`);
    await run(pool);
  } finally {
    await pool.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
}

test('Audit20 and CEO recover checkpoints only for the exact requested live URL', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, () => withCheckpoints(async pool => {
  const scans = [];
  const first = worker(pool, scans);
  const another = worker(pool, scans);
  const firstUrl = 'https://commercial.example/Service/?edition=A';
  const alternatives = ['https://commercial.example/service/?edition=A',
    'https://commercial.example/Service/?edition=B', 'https://commercial.example/Service?edition=A'];
  await first(firstUrl);
  for (const url of alternatives) assert.equal((await another(url)).pages[0].url, url);
  assert.equal((await worker(pool, scans)(firstUrl)).pages[0].url, firstUrl);
  assert.deepEqual(scans, [firstUrl, ...alternatives]);
}));

test('Manual HTML stays separate from live checkpoints, even across workers', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, () => withCheckpoints(async pool => {
  const scans = [];
  const url = 'https://commercial.example/service';
  const manual = await worker(pool, scans)(url, { sourceHtml: html });
  assert.equal(manual.pages[0].score, 41);
  const live = await worker(pool, scans)(url);
  assert.equal(live.pages[0].score, 73);
  assert.deepEqual(scans, ['manual', url]);
  await worker(pool, scans)(url, { sourceHtml: html });
  assert.equal((await worker(pool, scans)(url)).pages[0].score, 73);
  assert.deepEqual(scans, ['manual', url, 'manual']);
  await pool.query('UPDATE audit_page_checkpoints SET page_data=$2 WHERE url=$1', [url, manual.pages[0]]);
  assert.equal((await worker(pool, scans)(url)).pages[0].score, 73, 'historical manual checkpoints are also excluded');
}));
