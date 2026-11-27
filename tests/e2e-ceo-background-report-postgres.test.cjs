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
  const db = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  const page = 'https://commercial.example/Services/?v=1';
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await db.query(`CREATE TABLE prospect_quick_scans (
      token text PRIMARY KEY, url text, business_name text, language text, ceo_report_url text, ceo_report_token text,
      ceo_report_created_at timestamptz, ceo_report_page_url text, outreach_email_status text,
      outreach_error text, updated_at timestamptz, revoked_at timestamptz, outreach_sent_at timestamptz);
      CREATE TABLE opportunity_reports (
      token text PRIMARY KEY, domain text, source_url text, report_mode text, report_data jsonb)`);
    await db.query("INSERT INTO prospect_quick_scans (token,url,business_name,language) VALUES ('original',$1,'Commercial fixture','es')", [page]);

    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const generation = source.indexOf('async function _generateProspectOpportunityReport(');
    const generateEnd = source.indexOf("app.post('/api/audit-opportunity-report'", generation);
    const preparation = source.indexOf('const _pqsCeoBuilds = new Map();');
    const prepareEnd = source.indexOf('// v222', preparation);
    assert.ok(generation >= 0 && generateEnd > generation && preparation >= 0 && prepareEnd > preparation);
    let prepare, scans = 0;
    const context = vm.createContext({
      pool: db, crypto, requireAdmin() {}, console: { warn() {} },
      app: { post(path, _auth, handler) {
        assert.equal(path, '/api/prospect-quick-scan/admin/:token/email-prepare');
        prepare = handler;
      } },
      _ensureOpportunityReportTable: async () => true, _ensureProspectQuickScanTable: async () => true,
      _INTERNAL_CEO_AUDIT: Symbol(),
      _auditSiteHandler: async (req, res) => {
        scans++;
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
    const callPrepare = async () => {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await prepare({ params: { token: 'original' } }, res);
      return res;
    };
    assert.equal((await callPrepare()).code, 202);
    await vm.runInContext("_pqsCeoBuilds.get('original')", context);
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
    assert.equal((await callPrepare()).body.ceo_report_url, prospect.ceo_report_url);
    assert.equal(scans, 1);
  } finally {
    await db.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
