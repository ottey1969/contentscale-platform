'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.PROSPECT_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Quick Scan Admin can replay a Lead Crawler promotion after a browser reload', {
  skip: !(localApp && localDb) && 'requires the canonical local app and disposable PostgreSQL',
  timeout: 45000
}, async () => {
  assert.ok(process.env.LC_ADMIN_CODE);
  const { chromium } = require('playwright');
  const { Client } = require('pg');
  const db = new Client({ connectionString: database });
  await db.connect();
  const key = randomBytes(32).toString('hex');
  const domain = key.slice(0, 16) + '.example';
  const name = 'Verified contact ' + key.slice(0, 16);
  const browser = await chromium.launch();
  let contact, importJob;
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.goto(base + '/quick-scan/admin');
    await page.locator('#code').fill(process.env.LC_ADMIN_CODE);
    await page.getByRole('button', { name: 'Open Admin', exact: true }).click();
    const website = 'https://' + domain + '/';
    await page.locator('#ciFile').setInputFiles({
      name: 'commercial-journey.csv', mimeType: 'text/csv',
      buffer: Buffer.from('Username,Company,Website,Bio\nfixture-' + key.slice(0, 16) + ',' + name + ',' + website + ',Roofing contractor services\n')
    });
    const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/contact-intelligence/import');
    await page.locator('#ciUploadBtn').click();
    const upload = await uploaded;
    assert.equal(upload.status(), 200, await upload.text());
    importJob = (await upload.json()).job_id;
    await page.locator('#ciImportStatus').getByText(/import:? completed/i).waitFor();
    ({ rows: [contact] } = await db.query(
      'SELECT id,status,website_candidate FROM contact_intelligence WHERE import_job_id=$1', [importJob]));
    assert.equal(contact.status, 'qualified');
    assert.equal(contact.website_candidate, website);
    // The website check alone is supplied as a fixture. Classification and approval use the real UI.
    await db.query(`UPDATE contact_intelligence SET status='domain_verified',website_url=$2,
      website_verified_at=NOW(),network_fit_score=74 WHERE id=$1`, [contact.id, website]);

    async function approve(status) {
      const row = page.locator('#ciList .ciRow[data-status="' + status + '"]').filter({ hasText: name });
      const checkbox = row.getByRole('checkbox');
      await checkbox.check();
      await page.locator('#ciLoad').click();
      await page.locator('#ciImportStatus').getByText('✓ Filters applied.', { exact: true }).waitFor();
      assert.equal(await checkbox.isChecked(), true, 'refreshing the same list must retain the selected contact');
      page.once('dialog', dialog => dialog.accept());
      const promoted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/contact-intelligence/promote');
      await page.locator('#ciPromote').click();
      const response = await promoted;
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    }

    await page.locator('#ciShowVerified').click();
    const first = await approve('domain_verified');
    assert.equal(first.created, 1);
    assert.equal(first.network_entity_sync.failed, 0);
    const { rows: [saved] } = await db.query('SELECT status,promoted_token FROM contact_intelligence WHERE id=$1', [contact.id]);
    assert.equal(saved.status, 'promoted');
    assert.ok(saved.promoted_token);

    await page.reload();
    await page.locator('#ciShowVerified').click();
    await page.locator('#ciFilter').selectOption('promoted');
    const loaded = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/contact-intelligence/list' && url.searchParams.get('status') === 'promoted';
    });
    await page.locator('#ciLoad').click();
    const review = (await (await loaded).json()).items.find(item => String(item.id) === String(contact.id));
    assert.ok(review?.network?.business_id, 'the stored Network identity must appear on the contact after a clean boot');
    const repeated = await approve('promoted');
    assert.equal(repeated.created, 0);
    assert.equal(repeated.existing, 1);
    assert.equal(repeated.network_entity_sync.failed, 0);
    const { rows: prospects } = await db.query(`
      SELECT token,domain,source,scan_started_at,outreach_sent_at FROM prospect_quick_scans
      WHERE contact_intelligence_id=$1`, [contact.id]);
    assert.deepEqual(prospects, [{
      token: saved.promoted_token, domain, source: 'lead_crawler', scan_started_at: null, outreach_sent_at: null
    }]);
    const queued = page.locator('[data-missing-token="' + saved.promoted_token + '"]');
    await page.locator('#eqList').locator(queued).getByText(name, { exact: true }).waitFor({ state: 'attached' });
    const queueGroup = page.locator('#eqList details').filter({ has: queued });
    assert.match(await queueGroup.locator('summary').textContent(), /Without public email/);

    const prospect = await context.newPage();
    assert.equal((await prospect.goto(base + '/quick-scan/' + saved.promoted_token)).status(), 200);
    assert.equal(new URL(prospect.url()).pathname, '/quick-scan/' + saved.promoted_token);
    const startCeo = prospect.locator('#start-ceo');
    await startCeo.waitFor();
    await prospect.reload();
    await startCeo.waitFor();
    const { rows: [approval] } = await db.query(
      'SELECT ceo_report_url,scan_started_at,outreach_sent_at FROM prospect_quick_scans WHERE token=$1', [saved.promoted_token]);
    assert.deepEqual(approval, { ceo_report_url: null, scan_started_at: null, outreach_sent_at: null });
    await db.query("UPDATE contact_intelligence SET status='suppressed' WHERE id=$1", [contact.id]);
    const [rejected] = await Promise.all([
      prospect.waitForResponse(response => new URL(response.url()).pathname === '/api/ceo-report/start'),
      startCeo.click()
    ]);
    assert.equal(rejected.status(), 404);
    assert.equal((await prospect.reload()).status(), 404);
    assert.equal(await prospect.locator('#start-ceo').count(), 0);
  } finally {
    await browser.close();
    try {
      if (contact) {
        await db.query('DELETE FROM network_directory_businesses WHERE contact_intelligence_id=$1', [contact.id]);
        await db.query('DELETE FROM prospect_quick_scans WHERE contact_intelligence_id=$1', [contact.id]);
        await db.query('DELETE FROM contact_intelligence WHERE id=$1', [contact.id]);
      }
      if (importJob) await db.query('DELETE FROM contact_intelligence_imports WHERE id=$1', [importJob]);
    } finally { await db.end(); }
  }
});
