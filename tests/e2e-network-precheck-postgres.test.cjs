'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Network precheck discards a superseded publication and numbers concurrent runs once', {
  skip: !isolated && 'requires disposable local PostgreSQL',
  timeout: 15000
}, async () => {
  const { Pool } = require('pg');
  const schema = 'precheck_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database, max: 1 });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema, max: 6 });
  let unblock;
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE network_placements (id INT PRIMARY KEY, content_id INT, publisher_website_id INT, published_url TEXT,
      status TEXT, reward_credits INT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE network_content (id INT, brand_name TEXT, owner_website_id INT, title TEXT, primary_niche TEXT, source_snapshot JSONB, prewrite_brief_id INT);
    CREATE TABLE network_websites (id INT, domain TEXT, status TEXT, brand_name TEXT);
    CREATE TABLE network_publication_versions (id INT, placement_id INT, html TEXT, generation_input_snapshot JSONB, title TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE network_verification_runs (placement_id INT, run_no INT, http_status INT, indexable BOOLEAN, canonical_ok BOOLEAN,
      brand_mention_ok BOOLEAN, source_link_ok BOOLEAN, content_match_ok BOOLEAN, password_protected BOOLEAN,
      result_status TEXT, details JSONB, checked_at TIMESTAMPTZ, UNIQUE(placement_id,run_no));
    CREATE TABLE network_placement_review_events (placement_id INT,event_type TEXT,actor_type TEXT,actor_ref TEXT,published_url TEXT,note TEXT,metadata JSONB,created_at TIMESTAMPTZ);
    CREATE TABLE network_publisher_accounts (website_id INT,status TEXT,email TEXT,contact_name TEXT,access_token TEXT,updated_at TIMESTAMPTZ);
    CREATE TABLE network_publication_images (id INT,publication_version_id INT,image_role TEXT,image_name TEXT,prompt TEXT,alt_text TEXT,
      caption TEXT,suggested_filename TEXT,placement_hint TEXT,mime_type TEXT,original_filename TEXT,byte_size INT,
      status TEXT,sort_order INT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
    INSERT INTO network_content(id,brand_name,owner_website_id) VALUES (5,'Network fixture',NULL);
    INSERT INTO network_websites(id,domain,status) VALUES (6,'publisher.example','approved');
    INSERT INTO network_placements(id,content_id,publisher_website_id,published_url,status,reward_credits)
      VALUES (3,5,6,'https://publisher.example/article','submitted',0);
    INSERT INTO network_publication_versions(id,placement_id,html,generation_input_snapshot) VALUES (7,3,'<p>Approved edition</p>','{}')`);
    const source = fs.readFileSync(require.resolve('../src/network/register-network.js'), 'utf8');
    const start = source.indexOf('async function lockPublicationEvidence');
    const manualStart = source.indexOf("app.post('/api/network/admin/placements/:id/manual-review'", start);
    const end = source.indexOf('  app.', manualStart + 10);
    assert.ok(start >= 0 && end > start);
    const handlers = new Map();
    let started = 0, entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const blocked = new Promise(resolve => { unblock = resolve; });
    vm.runInNewContext(source.slice(start, end), {
      pool, app: { post(route, _admin, callback) { handlers.set(route, callback); } }, verifyAdmin() {}, wrap: callback => callback,
      safeFetchHtml: async url => {
        started++;
        if (started === 1) {
          entered();
          await blocked;
        }
        return { html: '<article data-contentscale-placement="3">Approved edition</article>', response: { status: 200 }, finalUrl: url };
      },
      analyzeWebsiteHtml: () => ({ indexable: true }),
      cleanText: value => String(value || ''),
      htmlText: value => value.replace(/<[^>]*>/g, ''),
      publicationTextMatch: () => ({ matched: true }),
      extractAttr: () => '',
      _networkResolvePublisherReadinessV527: async () => ({ readiness: { final_ready: true, seo_copied_current: true } })
    });
    const invoke = async (route, requestBody) => {
      let status = 200, body;
      const handler = handlers.get('/api/network/admin/placements/:id/' + route);
      await handler({ params: { id: '3' }, body: requestBody, headers: {}, admin: { id: 'fixture-admin' } }, {
        status(code) { status = code; return this; }, json(value) { body = value; }
      });
      return { status, body };
    };
    const verify = () => invoke('verify-live');
    const stale = verify();
    await reached;
    await pool.query("UPDATE network_placements SET published_url='https://publisher.example/new-article',status='submitted' WHERE id=3");
    unblock();
    assert.equal((await stale).status, 409);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM network_verification_runs')).rows[0].n, 0);

    const attempts = await Promise.all([verify(), verify()]);
    assert.ok(attempts.every(result => result.status === 200));
    const { rows } = await pool.query('SELECT run_no,details FROM network_verification_runs ORDER BY run_no');
    assert.deepEqual(rows.map(row => row.run_no), [1, 2]);
    assert.ok(rows.every(row => row.details.published_url === 'https://publisher.example/new-article'));
    assert.equal((await pool.query('SELECT status FROM network_placements WHERE id=3')).rows[0].status, 'needs_review');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM network_placement_review_events')).rows[0].n, 2);

    await pool.query("UPDATE network_publication_versions SET html='<p>Revised edition</p>',updated_at=NOW() WHERE id=7");
    const oldPrecheck = await invoke('manual-review', { decision: 'verified' });
    assert.equal(oldPrecheck.status, 409);
    assert.match(oldPrecheck.body.error, /pre-check has not passed/i);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM network_verification_runs')).rows[0].n, 2);
  } finally {
    unblock?.();
    await pool.end();
    await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await control.end();
  }
});
