'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Contact Intelligence can recover Network synchronization with the same promoted prospect', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, async () => {
  const { Pool } = require('pg');
  const schema = 'contact_promotion_' + crypto.randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database, max: 1 });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema, max: 2 });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE contact_intelligence (
      id BIGINT PRIMARY KEY, status TEXT, website_url TEXT, promoted_token TEXT,
      reason TEXT, updated_at TIMESTAMPTZ, company_name TEXT
    );
    CREATE TABLE prospect_quick_scans (
      token TEXT PRIMARY KEY, business_name TEXT, url TEXT, domain TEXT, source TEXT, campaign TEXT,
      language TEXT, status TEXT, contact_intelligence_id BIGINT, contact_email TEXT, contact_email_origin TEXT,
      contact_email_source_url TEXT, contact_email_comment TEXT, contact_email_updated_at TIMESTAMPTZ,
      network_fit_score INT, network_fit_label TEXT, network_fit_evidence JSONB, network_publisher_candidate BOOLEAN,
      network_vertical TEXT, network_fit_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(), revoked_at TIMESTAMPTZ
    );
    INSERT INTO contact_intelligence VALUES (5,'domain_verified','https://promotion.example/',NULL,NULL,NULL,'Promotion fixture')`);

    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const start = source.indexOf("app.post('/api/contact-intelligence/promote'");
    const end = source.indexOf("app.post('/api/contact-intelligence/suppress'", start);
    assert.ok(start >= 0 && end > start);
    let handler;
    const networkCalls = [];
    vm.runInNewContext(source.slice(start, end), {
      pool, crypto, URL,
      app: { post(_route, _admin, callback) { handler = callback; } },
      requireAdmin() {},
      asyncHandler: callback => callback,
      _ensureContactIntelligenceTables: async () => true,
      _ensureProspectQuickScanTable: async () => true,
      _networkModule: {
        async syncLeadCrawlerBusinessesV540(db, items) {
          assert.equal(db, pool);
          networkCalls.push(items[0].lead_crawler_token);
          return networkCalls.length === 1 ? { synced: 0, failed: 1 } : { synced: 1, failed: 0 };
        }
      }
    });
    const promote = async () => {
      let response;
      await handler({ body: { ids: [5] } }, { json(body) { response = body; } });
      return JSON.parse(JSON.stringify(response));
    };
    const first = await promote();
    assert.equal(first.created, 1);
    assert.equal(first.network_entity_sync.failed, 1);
    const promoted = (await pool.query('SELECT status,promoted_token FROM contact_intelligence WHERE id=5')).rows[0];
    assert.equal(promoted.status, 'promoted');
    const retry = await promote();
    assert.equal(retry.created, 0);
    assert.equal(retry.existing, 1);
    assert.equal(retry.network_entity_sync.synced, 1);
    assert.deepEqual(networkCalls, [promoted.promoted_token, promoted.promoted_token]);
    assert.deepEqual((await pool.query('SELECT token FROM prospect_quick_scans')).rows, [{ token: promoted.promoted_token }]);
    await pool.query("UPDATE contact_intelligence SET status='suppressed' WHERE id=5");
    assert.equal((await promote()).eligible, 0);
    assert.equal(networkCalls.length, 2);
  } finally {
    await pool.end();
    await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await control.end();
  }
});

test('concurrent Network synchronization respects Contact Intelligence suppression and canonical identity', {
  skip: !isolated && 'requires disposable local PostgreSQL',
  timeout: 20000
}, async () => {
  const { Pool } = require('pg');
  const network = require('../src/network/register-network.js');
  const schema = 'network_sync_' + crypto.randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database, max: 1 });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema, max: 6 });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE contact_intelligence (id BIGINT PRIMARY KEY, status TEXT);
      INSERT INTO contact_intelligence VALUES (1,'promoted'),(2,'promoted')`);
    await network.ensureNetworkDirectorySchema(pool);

    const input = { domain: 'sync.example', business_name: 'Network fixture', contact_intelligence_id: 1 };
    const sync = (row, databasePool = pool) => network.syncLeadCrawlerBusinessesV540(databasePool, [row]);
    const results = await Promise.all([sync(input), sync({ ...input, business_name: 'Second fixture' })]);
    assert.ok(results.every(result => result.synced === 1 && result.failed === 0));
    assert.equal(results[0].items[0].id, results[1].items[0].id);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM network_directory_businesses WHERE domain='sync.example'")).rows[0].n, 1);

    // Hold the suppression transaction while another connection starts the canonical write.
    const writer = await pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query("UPDATE contact_intelligence SET status='suppressed' WHERE id=2");
      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      const signalQuery = db => (sql, params) => {
        if (/SELECT[\s\S]*FROM (?:contact_intelligence|network_directory_businesses)\b/i.test(sql)) entered();
        return db.query(sql, params);
      };
      const observed = { query: signalQuery(pool), async connect() {
        const db = await pool.connect();
        return { query: signalQuery(db), release: () => db.release() };
      } };
      const delayed = sync({ ...input, domain: 'suppressed.example', contact_intelligence_id: 2 }, observed);
      await started;
      await writer.query('COMMIT');
      const suppressed = await network.suppressLeadCrawlerBusinessesV540(pool, [{ contact_intelligence_id: 2 }]);
      assert.equal(suppressed.failed, 0);
      assert.equal((await delayed).failed, 0);
      assert.equal((await delayed).skipped, 1);
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM network_directory_businesses WHERE domain='suppressed.example' AND public_visibility='listed'")).rows[0].n, 0);
  } finally {
    await pool.end();
    await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await control.end();
  }
});
