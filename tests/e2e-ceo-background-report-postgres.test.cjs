'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('CEO background preparation persists one working report linked to the original prospect', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, async () => {
  const { Pool } = require('pg');
  const schema = 'ceo_background_' + crypto.randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const db = new Pool({ connectionString: database, options: '-c search_path=' + schema, application_name: schema });
  const otherDb = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  const page = 'https://commercial.example/Services/?v=1';
  let releaseScan, enterScan;
  const held = new Promise(resolve => { releaseScan = resolve; });
  const entered = new Promise(resolve => { enterScan = resolve; });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await db.query(`CREATE TABLE prospect_quick_scans (
      token text PRIMARY KEY, url text, business_name text, language text, ceo_report_url text, ceo_report_token text,
      ceo_report_created_at timestamptz, ceo_report_page_url text, outreach_email_status text,
      outreach_error text, updated_at timestamptz, revoked_at timestamptz, outreach_sent_at timestamptz,
      source text,contact_intelligence_id bigint);
      CREATE TABLE contact_intelligence(id bigint PRIMARY KEY,status text,promoted_token text,website_verified_at timestamptz,website_url text);
      CREATE TABLE opportunity_reports (
      token text PRIMARY KEY, domain text, source_url text, report_mode text, report_data jsonb, revoked_at timestamptz)`);
    await db.query("INSERT INTO prospect_quick_scans (token,url,business_name,language) VALUES ('original',$1,'Commercial fixture','es')", [page]);

    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const generation = source.indexOf('async function _generateProspectOpportunityReport(');
    const generateEnd = source.indexOf("app.post('/api/audit-opportunity-report'", generation);
    const preparation = source.indexOf('const _pqsCeoBuilds = new Map();');
    const prepareEnd = source.indexOf('// v222', preparation);
    assert.ok(generation >= 0 && generateEnd > generation && preparation >= 0 && prepareEnd > preparation);
    const ceoRoute = source.indexOf("app.post('/api/ceo-report/start',");
    const ceoRouteEnd = source.indexOf("app.post('/api/prospect-quick-scan/:token/quickscan-interest',", ceoRoute);
    let scans = 0, duringScan=async()=>{};
    function worker(pool) {
      let prepare, start;
      const context = vm.createContext({
      pool, crypto, require: specifier => require('../src/' + specifier.replace(/^\.\//, '')), requireAdmin() {}, console: { warn() {}, log() {}, error() {} },
      app: { post(path, _auth, handler) {
        if (path === '/api/ceo-report/start') start = _auth;
        else {
          assert.equal(path, '/api/prospect-quick-scan/admin/:token/email-prepare');
          prepare = handler;
        }
      } },
      _ensureOpportunityReportTable: async () => true, _ensureProspectQuickScanTable: async () => true,
      _INTERNAL_CEO_AUDIT: Symbol(),
      _auditSiteHandler: async (req, res) => {
        scans++;
        if (scans === 1) {
          enterScan();
          await held;
        }
        await duringScan();
        assert.equal(req.body.url, page);
        assert.equal(req.body.maxPages, 1);
        res.json({ success: true, pages_scanned: 1 });
      },
      buildOpportunityReport: () => ({
        company: { domain: 'commercial.example', url: page },
        page_analysis: [{ url: page, score: 72 }]
      }),
      _pqsResolveLanguage: value => value,
      _pqsShortPrivatePath: (_type, token) => '/r/' + token
      });
      context._ensureContactIntelligenceTables = async () => true;
      context._ceoMainWebsiteUrl = () => ({ url: page, domain: 'commercial.example' });
      context._pqsValidEmail = () => true;
      context._pqsNotifyOwner = async () => { throw new Error('Commercial continuation must not send mail'); };
      vm.runInContext(source.slice(generation, generateEnd) + source.slice(preparation, prepareEnd) +
        source.slice(ceoRoute, ceoRouteEnd), context);
      return {
        async call(token='original') {
          const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
          await prepare({ params: { token } }, res);
          return res;
        },
        async commercial(token, options = {}) {
          const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
          await start({ body: { entry_mode: 'commercial', handoff: token, url: 'https://unrelated.example/', ...options } }, res);
          return res;
        },
        job: (token='original') => vm.runInContext('_pqsCeoBuilds.get('+JSON.stringify(token)+')', context)
      };
    }
    const first = worker(db), second = worker(otherDb);
    assert.equal((await first.call()).code, 202);
    const initial = first.job();
    await entered;
    assert.equal((await second.call()).code, 202);
    await second.job();
    releaseScan();
    await initial;
    assert.equal(scans, 1, 'an independent worker must not start a duplicate scan');
    const { rows: [prospect] } = await db.query('SELECT * FROM prospect_quick_scans');
    const { rows: [report] } = await db.query('SELECT * FROM opportunity_reports');
    assert.ok(report?.token);
    assert.equal(prospect.ceo_report_url, '/r/' + report.token);
    assert.equal(prospect.ceo_report_token, report.token);
    assert.equal(prospect.ceo_report_page_url, page);
    assert.equal(prospect.outreach_email_status, 'draft');
    assert.equal(prospect.outreach_sent_at, null);
    assert.equal(report.report_data.quick_scan_token, 'original');
    assert.equal(report.report_data.report_language, 'es');
    assert.equal((await second.call()).body.ceo_report_url, prospect.ceo_report_url);
    assert.equal(scans, 1);
    await db.query("INSERT INTO prospect_quick_scans (token,url,language) VALUES ('revoked',$1,'nl'),('interrupted',$1,'en')", [page]);
    duringScan=()=>otherDb.query("UPDATE prospect_quick_scans SET revoked_at=NOW() WHERE token='revoked'");
    assert.equal((await first.call('revoked')).code, 202);
    assert.equal((await first.job('revoked')).status, 'unavailable');
    assert.equal((await second.call('revoked')).code, 404);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM opportunity_reports')).rows[0].count, 1);

    duringScan=async()=>{throw new Error('Fixture scan interrupted before saving');};
    assert.equal((await first.call('interrupted')).code, 202);
    assert.equal((await first.job('interrupted')).status, 'failed');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM opportunity_reports')).rows[0].count, 1);
    duringScan=async()=>{};
    assert.equal((await second.call('interrupted')).code, 202);
    assert.equal((await second.job('interrupted')).status, 'ready');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM opportunity_reports')).rows[0].count, 2);

    await db.query("INSERT INTO prospect_quick_scans (token,url,language) VALUES ('disconnected',$1,'en')", [page]);
    let reportStarted, resumeOldWorker;
    const started = new Promise(resolve => { reportStarted = resolve; });
    const paused = new Promise(resolve => { resumeOldWorker = resolve; });
    duringScan = () => { reportStarted(); return paused; };
    let oldJob;
    try {
      assert.equal((await first.call('disconnected')).code, 202);
      oldJob = first.job('disconnected');
      await started;
      const { rows: [session] } = await control.query(`SELECT activity.pid FROM pg_stat_activity activity
        JOIN pg_locks locks ON locks.pid=activity.pid AND locks.locktype='advisory' AND locks.granted
        WHERE activity.application_name=$1`, [schema]);
      assert.ok(session, 'the first worker owns the reservation on its dedicated session');
      assert.equal((await control.query('SELECT pg_terminate_backend($1,5000) AS terminated', [session.pid])).rows[0].terminated, true);
      duringScan = async () => {};
      assert.equal((await second.call('disconnected')).code, 202);
      assert.equal((await second.job('disconnected')).status, 'ready');
    } finally {
      resumeOldWorker();
      await oldJob;
    }
    assert.equal((await oldJob).status, 'unavailable');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM opportunity_reports WHERE report_data->>'quick_scan_token'='disconnected'")).rows[0].count, 1);
    const commercial = crypto.randomBytes(32).toString('hex');
    await db.query(`INSERT INTO contact_intelligence VALUES (1,'promoted',$1,NOW(),$2)`, [commercial,page]);
    await db.query(`INSERT INTO prospect_quick_scans (token,url,language,source,contact_intelligence_id,outreach_email_status,outreach_sent_at)
      VALUES ($1,$2,'en','lead_crawler',1,'sent',NOW())`, [commercial, page]);
    assert.equal((await first.commercial('invalid')).code, 404);
    await db.query("UPDATE contact_intelligence SET website_url=$1 WHERE id=1", [page.replace('v=1','v=2')]);
    assert.equal((await first.commercial(commercial)).code, 404);
    await db.query("UPDATE contact_intelligence SET website_url=$1 WHERE id=1", [page]);

    assert.equal((await first.commercial(commercial, { check_only: true })).code, 202);
    assert.equal(first.job(commercial), undefined);
    const before = scans;
    const handedOff = await first.commercial(commercial);
    assert.equal(handedOff.code, 202);
    await first.job(commercial);
    const ready = await second.commercial(commercial);
    assert.equal(ready.body.status, 'ready');
    assert.equal(scans, before + 1);
    const { rows: [saved] } = await db.query('SELECT * FROM prospect_quick_scans WHERE token=$1', [commercial]);
    assert.equal(saved.ceo_report_page_url, page);
    assert.equal(saved.outreach_email_status, 'sent');
    assert.equal(ready.body.ceo_report_url, saved.ceo_report_url);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM prospect_quick_scans')).rows[0].count, 5);
    await db.query("UPDATE contact_intelligence SET status='suppressed' WHERE id=1");
    assert.equal((await second.commercial(commercial)).code, 404);
    assert.equal(scans, before + 1);

    const interruptedByApproval = crypto.randomBytes(32).toString('hex');
    await db.query("INSERT INTO contact_intelligence VALUES (2,'promoted',$1,NOW(),$2)", [interruptedByApproval, page]);
    await db.query(`INSERT INTO prospect_quick_scans(token,url,source,contact_intelligence_id)
      VALUES ($1,$2,'lead_crawler',2)`, [interruptedByApproval,page]);
    duringScan=()=>otherDb.query("UPDATE contact_intelligence SET status='suppressed' WHERE id=2");
    assert.equal((await first.commercial(interruptedByApproval)).code, 202);
    assert.equal((await first.job(interruptedByApproval)).status, 'unavailable');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM opportunity_reports WHERE report_data->>'quick_scan_token'=$1",
      [interruptedByApproval])).rows[0].count, 0);


  } finally {
    releaseScan();
    await Promise.all([db.end(), otherDb.end()]);
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
