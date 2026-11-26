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
      status TEXT, reward_credits INT, verified_at TIMESTAMPTZ, verification_decision TEXT, verification_note TEXT, reviewed_by_admin_id TEXT, reviewed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE network_content (id INT, brand_name TEXT, owner_website_id INT, title TEXT, primary_niche TEXT, source_snapshot JSONB, prewrite_brief_id INT, verified_placements INT, distribution_status TEXT, updated_at TIMESTAMPTZ);
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
    CREATE TABLE network_credit_wallets (id SERIAL PRIMARY KEY, website_id INT UNIQUE, balance INT, reserved INT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
    CREATE TABLE network_credit_transactions (id SERIAL PRIMARY KEY,wallet_id INT,placement_id INT,transaction_type TEXT,amount INT,
      idempotency_key TEXT UNIQUE,note TEXT,metadata JSONB,created_at TIMESTAMPTZ);
    INSERT INTO network_content(id,brand_name,owner_website_id) VALUES (5,'Network fixture',NULL);
    INSERT INTO network_websites(id,domain,status) VALUES (6,'publisher.example','approved');
    INSERT INTO network_placements(id,content_id,publisher_website_id,published_url,status,reward_credits)
      VALUES (3,5,6,'https://publisher.example/article','submitted',7);
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
    let changeDuringReview=false, notifications=0, finalUrl, canonical, robotsHeader;
    const observedPool={
      connect:()=>pool.connect(),
      query:async (sql,args)=>{
        const output=await pool.query(sql,args);
        if(changeDuringReview&&String(sql).includes('AS latest_run_no')){
          changeDuringReview=false;
          await pool.query("UPDATE network_placements SET published_url='https://publisher.example/replaced',status='submitted' WHERE id=3");
        }
        return output;
      }
    };
    vm.runInNewContext(source.slice(start, end), {
      pool:observedPool, networkNotifyPublisherReviewDecision:async()=>{notifications++;return {state:'mocked'}}, app: { post(route, _admin, callback) { handlers.set(route, callback); } }, verifyAdmin() {}, wrap: callback => callback,
      safeFetchHtml: async url => {
        started++;
        if (started === 1) {
          entered();
          await blocked;
        }
        const tag = canonical ? '<link rel="canonical" href="' + canonical + '">' : '';
        return { html: tag + '<article data-contentscale-placement="3">Approved edition</article>',
          response: { status: 200, headers: new Headers(robotsHeader ? {'X-Robots-Tag': robotsHeader} : {}) }, finalUrl: finalUrl || url };
      },
      analyzeWebsiteHtml: () => ({ indexable: true }),
      cleanText: value => String(value || ''),
      htmlText: value => value.replace(/<[^>]*>/g, ''),
      publicationTextMatch: () => ({ matched: true }),
      extractAttr: () => canonical || '',
      URL,
      exactUrl: require('../src/implementation-report.cjs').exactUrl,
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
    await pool.query("UPDATE network_verification_runs SET details=details-'exact_document' WHERE run_no=2");
    assert.equal((await invoke('manual-review', { decision: 'verified' })).status, 409);

    await pool.query("UPDATE network_publication_versions SET html='<p>Revised edition</p>',updated_at=NOW() WHERE id=7");
    const oldPrecheck = await invoke('manual-review', { decision: 'verified' });
    assert.equal(oldPrecheck.status, 409);
    assert.match(oldPrecheck.body.error, /pre-check has not passed/i);
    changeDuringReview=true;
    const staleChanges=await invoke('manual-review',{decision:'needs_changes'});
    assert.equal(staleChanges.status,409);
    assert.equal(notifications,0);
    await verify();
    const reviews=await Promise.all([
      invoke('manual-review',{decision:'verified'}),invoke('manual-review',{decision:'verified'})
    ]);
    assert.equal(reviews.filter(r=>r.body.credits_awarded===true).length,1);
    const replay=await invoke('manual-review',{decision:'verified'});
    assert.equal(replay.body.credits_awarded,false);
    assert.equal(notifications,1);
    assert.equal((await pool.query('SELECT balance FROM network_credit_wallets')).rows[0].balance,7);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM network_credit_transactions')).rows[0].n,1);

    assert.equal((await pool.query('SELECT count(*)::int AS n FROM network_verification_runs')).rows[0].n, 3);

    // Rechecking a verified placement records current evidence while retaining the original decision.
    finalUrl = 'https://publisher.example/replaced/syndicated';
    assert.equal((await verify()).body.precheck_passed, false);
    finalUrl = undefined;
    canonical = '/archive';
    assert.equal((await verify()).body.precheck_passed, false);
    canonical = '/replaced';
    robotsHeader = 'googlebot: noindex';
    assert.equal((await verify()).body.precheck_passed, false);
    robotsHeader = undefined;
    assert.equal((await verify()).body.precheck_passed, true);
    const monitoring = await pool.query('SELECT result_status FROM network_verification_runs WHERE run_no>3 ORDER BY run_no');
    assert.deepEqual(monitoring.rows.map(row => row.result_status), ['needs_review', 'needs_review', 'needs_review', 'passed']);
    const placement = await pool.query('SELECT status,verification_decision FROM network_placements WHERE id=3');
    assert.deepEqual(placement.rows[0], {status: 'verified', verification_decision: 'verified'});
    assert.equal((await pool.query('SELECT balance FROM network_credit_wallets')).rows[0].balance, 7);
    assert.equal(notifications, 1);
  } finally {
    unblock?.();
    await pool.end();
    await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await control.end();
  }
});
