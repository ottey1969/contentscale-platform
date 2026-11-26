'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.PROSPECT_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Quick Scan reopens the exact CEO page evidence and records explicit Audit20 interest', {
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
    assert.deepEqual(browserErrors, []);
  } finally {
    if (browser) await browser.close();
    await db.query('DELETE FROM prospect_quick_scans WHERE token=$1', [prospect]);
    await db.query('DELETE FROM opportunity_reports WHERE token=$1', [report]);
    await db.end();
  }
});
