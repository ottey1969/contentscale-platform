'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.PROSPECT_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Prospect reopens exact CEO evidence and records explicit interest without changing owner follow-up', {
  skip: !(localApp && localDb) && 'requires the canonical local app and a disposable PostgreSQL database',
  timeout: 60000
}, async () => {
  const { Client } = require('pg');
  const { chromium } = require('playwright');
  const db = new Client({ connectionString: database });
  await db.connect();
  const suffix = randomBytes(10).toString('hex');
  const prospect = 'test-prospect-' + suffix;
  const report = 'test-ceo-' + suffix;
  const pageA = 'https://prospect.example/Services/?view=full';
  const pageB = 'https://prospect.example/repair/';
  let browser;
  try {
    const missing = await fetch(base + '/api/prospect-quick-scan/test-missing-' + suffix);
    assert.equal(missing.status, 404, await missing.text());
    await db.query(`CREATE TABLE IF NOT EXISTS opportunity_reports (
      id BIGSERIAL PRIMARY KEY, token VARCHAR(96) UNIQUE NOT NULL, domain VARCHAR(255) NOT NULL,
      source_url TEXT, report_mode VARCHAR(24) NOT NULL DEFAULT 'prospect', report_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_opened_at TIMESTAMPTZ,
      view_count INTEGER NOT NULL DEFAULT 0, revoked_at TIMESTAMPTZ, hidden_at TIMESTAMPTZ, refreshed_at TIMESTAMPTZ
    )`);
    await db.query(`INSERT INTO opportunity_reports(token,domain,source_url,report_data)
      VALUES ($1,'prospect.example',$2,$3)`, [report, pageA, { page_analysis: [{ url: 'https://prospect.example/Services/?view=other', content_score: 91 }] }]);
    await db.query(`INSERT INTO prospect_quick_scans(token,domain,business_name,url,ceo_report_page_url,ceo_report_url,ceo_report_token,
      status,scan_result,scan_completed_at,opened_count,language)
      VALUES ($1,'prospect.example','Test Prospect',$2,$3,$4,$5,'scan_ready','{"score":72}',NOW(),1,'en')`,
    [prospect, pageB, pageA, '/opportunity-report/' + report, report]);

    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    const url = base + '/quick-scan/' + prospect;
    assert.equal((await page.goto(url)).status(), 200);
    const scores = page.locator('#pqs391Funnel .pqs391grid').first().locator('article strong');
    assert.match(await scores.nth(0).textContent(), /Score: —$/);
    assert.match(await scores.nth(1).textContent(), /72\/100$/);

    const setExactScore = score => db.query('UPDATE opportunity_reports SET report_data=$2 WHERE token=$1', [report, {
      page_analysis: [{ url: pageA, content_score: score }]
    }]);
    await setExactScore(null);
    await page.reload();
    assert.match(await scores.nth(0).textContent(), /Score: —$/);
    await setExactScore(0);
    await page.reload();
    assert.match(await scores.nth(0).textContent(), /Score: 0\/100$/);

    const currentInterest = async () => (await db.query(
      'SELECT audit20_interested,audit20_interested_at FROM prospect_quick_scans WHERE token=$1', [prospect])).rows[0];
    const previewLink = page.locator('a.pqsAuditPreview');
    assert.equal(await previewLink.isVisible(), true);
    const [preview] = await Promise.all([page.waitForEvent('popup'), previewLink.click()]);
    await preview.waitForLoadState();
    assert.match(new URL(preview.url()).pathname, /^\/audit-process\//);
    await preview.close();
    assert.notEqual((await currentInterest()).audit20_interested, true);
    await db.query("UPDATE prospect_quick_scans SET follow_up_status='won' WHERE token=$1", [prospect]);
    const interestButton = page.locator('#pqs391Audit');
    page.once('dialog', dialog => dialog.accept());
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/audit20-interest')),
      interestButton.click()
    ]);
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).status, 'audit20_interested');
    const recorded = await currentInterest();
    assert.equal(recorded.audit20_interested, true);
    assert.ok(recorded.audit20_interested_at);
    const replay = await page.request.post(base + '/api/prospect-quick-scan/' + prospect + '/audit20-interest');
    assert.equal(replay.status(), 200);
    assert.equal((await replay.json()).already_interested, true);
    assert.deepEqual(await currentInterest(), recorded);
    const followUp = async () => (await db.query(`SELECT follow_up_status,quickscan_interested_at,
      tracker_interested_at,updated_at FROM prospect_quick_scans WHERE token=$1`, [prospect])).rows[0];
    assert.equal((await followUp()).follow_up_status, 'won');

    await db.query("UPDATE prospect_quick_scans SET follow_up_status='closed' WHERE token=$1", [prospect]);
    const trackerInterest = await page.request.post(base + '/api/prospect-quick-scan/' + prospect + '/tracker-interest');
    assert.equal(trackerInterest.status(), 200);
    assert.ok((await followUp()).tracker_interested_at);
    assert.equal((await followUp()).follow_up_status, 'closed');

    await db.query("UPDATE prospect_quick_scans SET follow_up_status='replied' WHERE token=$1", [prospect]);
    const quickPath = base + '/api/prospect-quick-scan/' + prospect + '/quickscan-interest';
    const requests = await Promise.all([page.request.post(quickPath), page.request.post(quickPath)]);
    assert.deepEqual(requests.map(r => r.status()), [200, 200]);
    const values = await Promise.all(requests.map(r => r.json()));
    assert.equal(values.filter(value => value.already_interested === true).length, 1);
    assert.equal(values[0].quick_scan_url, values[1].quick_scan_url);
    const firstQuickInterest = await followUp();
    assert.ok(firstQuickInterest.quickscan_interested_at);
    assert.equal(firstQuickInterest.follow_up_status, 'replied');
    const quickReplay = await page.request.post(quickPath);
    assert.equal((await quickReplay.json()).already_interested, true);
    assert.deepEqual(await followUp(), firstQuickInterest);

    await db.query('UPDATE prospect_quick_scans SET ceo_report_url=NULL WHERE token=$1', [prospect]);
    assert.equal((await page.request.post(quickPath)).status(), 409);
    await db.query('UPDATE prospect_quick_scans SET revoked_at=NOW() WHERE token=$1', [prospect]);
    const denied = await Promise.all(['quickscan-interest', 'audit20-interest', 'tracker-interest'].map(
      action => page.request.post(base + '/api/prospect-quick-scan/' + prospect + '/' + action)
    ));
    assert.deepEqual(denied.map(response => response.status()), [404, 404, 404]);
    assert.deepEqual(browserErrors, []);
  } finally {
    if (browser) await browser.close();
    await db.query('DELETE FROM prospect_quick_scans WHERE token=$1', [prospect]);
    await db.query('DELETE FROM opportunity_reports WHERE token=$1', [report]);
    await db.end();
  }
});

test('Quick Scan confirmation retries an explicit quota rejection and holds an unknown outcome', {
  skip: !(localApp && localDb && process.env.PROSPECT_E2E_MAIL_FIXTURE === '1') && 'requires the isolated app and mail response fixture',
  timeout: 30000
}, async () => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: database });
  await db.connect();
  const suffix = randomBytes(10).toString('hex');
  const retry = 'test-mail-retry-' + suffix;
  const unknown = 'test-mail-unknown-' + suffix;
  try {
    await fetch(base + '/api/prospect-quick-scan/test-missing-' + suffix);
    await db.query('CREATE TABLE IF NOT EXISTS email_suppression (email TEXT PRIMARY KEY)');
    await db.query(`INSERT INTO prospect_quick_scans(token,domain,business_name,url,ceo_report_url,contact_email)
      VALUES ($1,'confirm.example','Confirmation retry','https://confirm.example/','/opportunity-report/fixture',$3),
             ($2,'confirm.example','Confirmation unknown','https://confirm.example/','/opportunity-report/fixture',$4)`,
    [retry, unknown, 'retry+' + suffix + '@confirm.example', 'unknown+' + suffix + '@confirm.example']);
    const interest = async token => {
      const response = await fetch(base + '/api/prospect-quick-scan/' + token + '/quickscan-interest', { method: 'POST' });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await interest(retry)).email_sent, false);
    const recoveries = await Promise.all([interest(retry),interest(retry)]);
    assert.equal(recoveries.filter(result => result.email_sent).length, 1);
    assert.ok(recoveries.every(result => result.already_interested === true));
    assert.equal((await interest(retry)).email_sent, false);
    const accepted = async token => (await db.query('SELECT quickscan_interest_email_sent_at AS accepted FROM prospect_quick_scans WHERE token=$1',[token])).rows[0].accepted;
    assert.ok(await accepted(retry));
    assert.equal((await interest(unknown)).email_sent, false);
    assert.equal((await interest(unknown)).email_sent, false);
    assert.equal(await accepted(unknown), null);

    const revoked = (await db.query('UPDATE prospect_quick_scans SET revoked_at=NOW() WHERE token=$1 RETURNING revoked_at', [unknown])).rows[0];
    const fs = require('node:fs');
    const vm = require('node:vm');
    const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
    const start = source.indexOf('let _pqsTableReady = null;');
    const end = source.indexOf('function _pqsCleanUrl', start);
    assert.ok(start >= 0 && end > start);
    const initialized = await vm.runInNewContext(source.slice(start, end) + '\n_ensureProspectQuickScanTable()', { pool: db, console });
    assert.equal(initialized, true);
    assert.deepEqual((await db.query('SELECT revoked_at FROM prospect_quick_scans WHERE token=$1', [unknown])).rows[0], revoked);
  } finally {
    await db.query('DELETE FROM prospect_quick_scans WHERE token=ANY($1::text[])', [[retry,unknown]]);
    await db.end();
  }
});
