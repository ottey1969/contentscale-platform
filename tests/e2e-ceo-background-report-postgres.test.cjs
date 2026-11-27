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
      outreach_error text, updated_at timestamptz, revoked_at timestamptz, outreach_sent_at timestamptz);
      CREATE TABLE opportunity_reports (
      token text PRIMARY KEY, domain text, source_url text, report_mode text, report_data jsonb, revoked_at timestamptz)`);
    await db.query("INSERT INTO prospect_quick_scans (token,url,business_name,language) VALUES ('original',$1,'Commercial fixture','es')", [page]);

    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const generation = source.indexOf('async function _generateProspectOpportunityReport(');
    const generateEnd = source.indexOf("app.post('/api/audit-opportunity-report'", generation);
    const preparation = source.indexOf('const _pqsCeoBuilds = new Map();');
    const prepareEnd = source.indexOf('// v222', preparation);
    assert.ok(generation >= 0 && generateEnd > generation && preparation >= 0 && prepareEnd > preparation);
    let scans = 0, duringScan=async()=>{};
    function worker(pool) {
      let prepare;
      const context = vm.createContext({
      pool, crypto, require: specifier => require('../src/' + specifier.replace(/^\.\//, '')), requireAdmin() {}, console: { warn() {} },
      app: { post(path, _auth, handler) {
        assert.equal(path, '/api/prospect-quick-scan/admin/:token/email-prepare');
        prepare = handler;
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
      vm.runInContext(source.slice(generation, generateEnd) + source.slice(preparation, prepareEnd), context);
      return {
        async call(token='original') {
          const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
          await prepare({ params: { token } }, res);
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
  } finally {
    releaseScan();
    await Promise.all([db.end(), otherDb.end()]);
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
