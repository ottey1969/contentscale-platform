'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.NETWORK_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Network admins can open both Contact Intelligence views and restore the original status across them', {
  skip: !(localApp && localDb) && 'requires the canonical local app and disposable PostgreSQL',
  timeout: 30000
}, async () => {
  assert.ok(process.env.LC_ADMIN_CODE, 'the disposable app needs its Lead Crawler fixture credential');
  const { chromium } = require('playwright');
  const { Client } = require('pg');
  const browser = await chromium.launch();
  const db = new Client({ connectionString: database });
  let contactId;
  await db.connect();
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const stagingApi = '/api/network/admin/acquisition/contact-staging';
    assert.equal((await context.request.get(base + stagingApi)).status(), 403);

    await page.goto(base + '/network/acquisition');
    await page.locator('#unlockCode').fill(process.env.LC_ADMIN_CODE);
    await page.locator('#unlockSubmit').click();
    await page.locator('#unlock').waitFor({ state: 'hidden' });

    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === stagingApi);
    await page.goto(base + '/network/contact-staging');
    const response = await loaded;
    assert.equal(response.status(), 200, await response.text());
    await page.getByText('Geen contacten in deze selectie.', { exact: true }).waitFor();

    const key = randomBytes(32).toString('hex');
    const name = 'Contact staging fixture ' + key.slice(0, 16);
    const { rows: [contact] } = await db.query(
      "INSERT INTO contact_intelligence (contact_key,company_name,status) VALUES ($1,$2,'qualified') RETURNING id", [key, name]);
    contactId = contact.id;
    await page.locator('#refresh').click();
    await page.getByText(name, { exact: true }).waitFor();

    const selectionApi = '/api/network/admin/acquisition/contact-intelligence';
    const listed = page.waitForResponse(result => new URL(result.url()).pathname === selectionApi);
    await page.goto(base + '/network/acquisition/contact-intelligence');
    const selection = await listed;
    assert.equal(selection.status(), 200, await selection.text());
    assert.equal((await selection.json()).items.find(item => item.company_name === name)?.id, contactId);

    const row = page.locator('article').filter({ hasText: name });
    await row.getByRole('checkbox').check();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#archive').click();
    await row.waitFor({ state: 'hidden' });

    await page.goto(base + '/network/contact-staging');
    await page.locator('#status').selectOption('archived');
    await row.getByRole('checkbox').check();
    await page.locator('#restore').click();
    await row.waitFor({ state: 'hidden' });
    const { rows: [restored] } = await db.query('SELECT status FROM contact_intelligence WHERE id=$1', [contactId]);
    assert.equal(restored.status, 'qualified');

    await db.query(`UPDATE contact_intelligence SET status='archived',staging_previous_status=NULL,
      network_fit_evidence='{"_archived_status":"domain_verified","fit_observed":true}' WHERE id=$1`, [contactId]);
    await page.goto(base + '/network/acquisition/contact-intelligence');
    await page.locator('#mode').selectOption('archived');
    await row.getByRole('checkbox').check();
    await page.locator('#restore').click();
    await row.waitFor({ state: 'hidden' });
    const { rows: [legacyRestored] } = await db.query(
      'SELECT status,network_fit_evidence FROM contact_intelligence WHERE id=$1', [contactId]);
    assert.deepEqual(legacyRestored, { status: 'domain_verified', network_fit_evidence: { fit_observed: true } });

    await db.query(`UPDATE contact_intelligence SET status='archived',staging_previous_status='qualified',
      network_fit_evidence='{"_archived_status":"domain_verified"}' WHERE id=$1`, [contactId]);
    await page.locator('#refresh').click();
    await row.getByRole('checkbox').check();
    const attempted = page.waitForResponse(result => new URL(result.url()).pathname === selectionApi + '/action');
    await page.locator('#restore').click();
    assert.equal((await (await attempted).json()).changed, 0);
    const { rows: [ambiguous] } = await db.query(
      "SELECT status,staging_previous_status,network_fit_evidence->>'_archived_status' AS legacy_status FROM contact_intelligence WHERE id=$1",
      [contactId]);
    assert.deepEqual(ambiguous, { status: 'archived', staging_previous_status: 'qualified', legacy_status: 'domain_verified' });
  } finally {
    await browser.close();
    try {
      if (contactId) await db.query('DELETE FROM contact_intelligence WHERE id=$1', [contactId]);
    } finally { await db.end(); }
  }
});
