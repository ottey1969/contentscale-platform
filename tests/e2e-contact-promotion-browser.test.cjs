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
  const domain = 'commercial-' + key.slice(0, 16) + '.example';
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
    await page.locator('.ciSectionToggle').click();
    await page.locator('#ciFilter').selectOption('qualified');
    await page.locator('#ciSearch').fill(name);
    await page.locator('#ciLoad').click();
    await page.locator('#ciImportStatus').getByText('✓ Filters applied.', { exact: true }).waitFor();
    const qualified = page.locator('#ciList .ciRow[data-status="qualified"]').filter({ hasText: name });
    await qualified.getByRole('checkbox').check();
    const [checked] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/contact-intelligence/verify'),
      page.locator('#ciVerify').click()
    ]);
    assert.equal(checked.status(), 200, await checked.text());
    const verification = await checked.json();
    assert.equal(verification.verified, 1, JSON.stringify(verification));
    const { rows: [verified] } = await db.query(
      'SELECT status,website_url,website_verified_at FROM contact_intelligence WHERE id=$1', [contact.id]);
    assert.equal(verified.status, 'domain_verified');
    assert.equal(verified.website_url, website);
    assert.ok(verified.website_verified_at);

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
    const next = new URL(prospect.url());
    assert.equal(next.pathname, '/quick-scan/start');
    assert.equal(next.searchParams.get('reason'), 'ceo-first');
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
