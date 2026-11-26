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

const registrationLocales = [
  ['en', 'en-US', 'Create my Tracker', 'Open my Tracker', 'Proof & History', 'CEO Scan', '20-page audit', 'Open external audit report'],
  ['nl', 'nl-NL', 'Maak mijn Tracker aan', 'Open mijn Tracker', 'Bewijs en historie', 'CEO Scan', '20-pagina-audit', 'Open extern auditrapport'],
  ['es', 'es-ES', 'Crear mi Tracker', 'Abrir mi Tracker', 'Evidencias e historial', 'Informe CEO', 'Auditoría de 20 páginas', 'Abrir informe de auditoría externo']
];
for (const [index, [language, locale, registerLabel, trackerLabel, proofLabel, ceoLabel, auditLabel, externalLabel]] of registrationLocales.entries()) {
  for (const [size, width] of [390, 1280].entries()) {
    const ip = '192.0.2.' + (10 + index * 2 + size);
    test('A reviewed Audit20 prospect can register and reopen evidence (' + locale + ', ' + width + 'px)', {
      skip: !(localApp && localDb) && 'requires the canonical local app and a disposable PostgreSQL database',
      timeout: 40000
    }, async () => {
      const { Client } = require('pg');
      const { chromium } = require('playwright');
      const db = new Client({ connectionString: database });
      await db.connect();
      const token = randomBytes(32).toString('hex');
      const domain = 'register-' + token.slice(0, 12) + '.example';
      const url = 'https://' + domain + '/Services/?version=1';
      const ceoUrl = 'https://' + domain + '/';
      const ceoToken = randomBytes(32).toString('hex');
      const auditToken = randomBytes(32).toString('hex');
      let browser;
      try {
        await fetch(base + '/api/prospect-quick-scan/test-missing-' + token);
        await db.query(`INSERT INTO opportunity_reports(token,domain,source_url,report_data)
          VALUES($1,$2,$3,$4),($5,$2,$6,$7)`, [ceoToken, domain, ceoUrl, { page_analysis: [{ url: ceoUrl, content_score: 0 }] },
          auditToken, url, { page_analysis: [{ url }], opportunities: [{ url, title: 'Saved audit finding' }] }]);
        await db.query(`INSERT INTO prospect_quick_scans(token,domain,business_name,url,language,opened_count,
          scan_result,scan_completed_at,audit20_status,follow_up_status,ceo_report_page_url,ceo_report_token,ceo_report_url,audit20_report_url)
          VALUES($1,$2,'Registration fixture',$3,$5,1,$4,NOW(),'not_started','replied',$6,$7,$8,$9)`,
        [token, domain, url, { score: 0, url }, language, ceoUrl, ceoToken, '/opportunity-report/' + ceoToken, '/report/' + auditToken.slice(0, 16)]);
        browser = await chromium.launch();
        const context = await browser.newContext({ locale, viewport: { width, height: 840 }, extraHTTPHeaders: { 'X-Forwarded-For': ip } });
        await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          const path = new URL(response.url()).pathname;
          if (path.endsWith('/tracker-interest') || path.endsWith('/tracker-client/register')) requests.push([path.split('/').pop(), response.status()]);
        });
        await page.goto(base + '/quick-scan/' + token);
        assert.equal(await page.locator('#pqsTrackerRegistration').count(), 0);
        await db.query("UPDATE prospect_quick_scans SET audit20_status='ready' WHERE token=$1", [token]);
        await page.reload();
        const form = page.locator('#pqsTrackerRegistration');
        assert.equal(await form.isVisible(), true);
        const [registration] = await Promise.all([
          page.waitForResponse(response => response.url().endsWith('/api/tracker-client/register'), {timeout:7000}),
          form.getByRole('button', { name: registerLabel }).click()
        ]).catch(async error => {
          throw new Error(JSON.stringify({ requests, errors, status: await form.getByRole('status').textContent() }), { cause: error });
        });
        assert.equal(registration.status(), 200, await registration.text());
        const account = await registration.json();
        assert.ok(account.linked_page_id);
        assert.equal(await form.getByRole('link', { name: trackerLabel }).getAttribute('href'), '/track/' + account.token);
        const response = await page.request.get(base + '/api/tracker-client/' + account.token + '/pages/' + account.linked_page_id + '/proof-sources');
        assert.equal(response.status(), 200);
        const body = await response.json();
        assert.equal(body.proof_sources.quick_scan[0].url, url);
        assert.equal(body.proof_sources.quick_scan[0].score, 0);
        await context.addInitScript(() => localStorage.setItem('cs_welcome_seen', '1'));
        const [tracker] = await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname === '/track/' + account.token),
          form.getByRole('link', { name: trackerLabel }).click()
        ]);
        assert.equal(tracker.status(), 200);
        const trackerData = await page.request.get(base + '/api/tracker-client/' + account.token);
        assert.equal(trackerData.status(), 200, await trackerData.text());
        await page.getByRole('button', { name: proofLabel, exact: true }).click({ timeout: 7000 }).catch(async error => {
          throw new Error(JSON.stringify({ errors, listed: (await trackerData.json()).pages?.map(item => item.id), pageList: await page.locator('#pagesList').innerText() }), { cause: error });
        });
        const proof = page.locator('#caseStudyBox');
        await proof.locator('summary').filter({ hasText: ceoLabel }).click({ timeout: 7000 });
        await proof.locator('summary').filter({ hasText: auditLabel }).click({ timeout: 7000 });
        assert.equal(await proof.getByText(ceoUrl + ' · ContentScore 0', { exact: true }).isVisible(), true);
        assert.equal(await proof.getByText(url + ' · ContentScore —', { exact: true }).isVisible(), true);
        assert.equal(await proof.getByText('Saved audit finding · ' + url, { exact: true }).isVisible(), true);
        if (size === 0) {
          const externalUrl = 'https://reports.example.com/audit?share=existing#summary';
          await db.query('UPDATE prospect_quick_scans SET audit20_report_url=$1 WHERE token=$2', [externalUrl, token]);
          await page.reload();
          await page.getByRole('button', { name: proofLabel, exact: true }).click({ timeout: 7000 });
          await proof.locator('summary').filter({ hasText: auditLabel }).click({ timeout: 7000 });
          const link = proof.getByRole('link', { name: externalLabel });
          assert.equal(await link.getAttribute('href'), externalUrl);
          assert.equal(await link.getAttribute('target'), '_blank');
          assert.equal(await link.getAttribute('referrerpolicy'), 'no-referrer');
          assert.equal(await proof.getByText('Saved audit finding · ' + url, { exact: true }).count(), 0);
        }
        assert.equal((await db.query('SELECT follow_up_status FROM prospect_quick_scans WHERE token=$1', [token])).rows[0].follow_up_status, 'replied');
      } finally {
        if (browser) await browser.close();
        const client = (await db.query('SELECT id FROM tracker_clients WHERE domain=$1', [domain])).rows[0];
        if (client) {
          await db.query("DELETE FROM tracker_case_study_events WHERE (to_jsonb(tracker_case_study_events)->>'tracker_client_id')::int=$1", [client.id]);
          await db.query('DELETE FROM tracker_pages WHERE tracker_client_id=$1', [client.id]);
          await db.query('DELETE FROM tracker_clients WHERE id=$1', [client.id]);
        }
        await db.query('DELETE FROM prospect_quick_scans WHERE token=$1', [token]);
        await db.query('DELETE FROM opportunity_reports WHERE token = ANY($1)', [[ceoToken, auditToken]]);
        await db.end();
      }
    });
  }
}
