'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.PROSPECT_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Lead Crawler restores an older crawl and Network admins can resume a prepared private invitation', {
  skip: !(localApp && localDb) && 'requires the canonical local app and a disposable PostgreSQL database', timeout: 30000
}, async () => {
  assert.ok(process.env.LC_ADMIN_CODE, 'the disposable app needs its Lead Crawler fixture credential');
  const { chromium } = require('playwright');
  const { Client } = require('pg');
  const browser = await chromium.launch();
  const db = new Client({ connectionString: database });
  await db.connect();
  const domain = 'review-' + randomBytes(8).toString('hex') + '.example';
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(host => {
      localStorage.setItem('lc_session', JSON.stringify({
        country: 'USA', savedAt: Date.now(), leads: [{
          name: 'Saved Maps Fixture', website: 'https://' + host + '/',
          source: 'google_maps_serper', phone: '+1 609-555-0101', address: '1 Fixture St, Trenton, NJ 08608'
        }]
      }));
    }, domain);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(base + '/lead-crawler')).status(), 200);
    await page.locator('#lockCode').fill(process.env.LC_ADMIN_CODE);
    const [auth] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/admin/verify')),
      page.getByRole('button', { name: 'UNLOCK', exact: true }).click()
    ]);
    assert.equal((await auth.json()).role, 'admin');
    const [imported] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/network/admin/acquisition/import')),
      page.locator('#networkImportAllBtn').click()
    ]);
    assert.equal(imported.status(), 200, await imported.text());
    const result = await imported.json();
    assert.equal(result.imported, 1);
    assert.equal(result.emails_sent, 0);
    assert.equal(result.public_listed, 0);
    const { rows: [saved] } = await db.query(
      `SELECT public_visibility,metadata->'acquisition'->>'stage' AS stage
       FROM network_directory_businesses WHERE domain=$1 AND source='maps_acquisition'`, [domain]);
    assert.deepEqual(saved, { public_visibility: 'hidden', stage: 'needs_website_review' });

    const email = 'contact@' + domain;
    const source = 'https://' + domain + '/contact';
    const { rows: [{ id }] } = await db.query(
      `UPDATE network_directory_businesses
       SET metadata=jsonb_set(metadata,'{acquisition}',metadata->'acquisition' || $2::jsonb)
       WHERE domain=$1 AND source='maps_acquisition' RETURNING id`,
      [domain, JSON.stringify({
        website_review: { status: 'site_observed' },
        email_discovery: { email, source_url: source, verification: 'publicly_observed', version: 'public-v4', checked_at: new Date().toISOString() }
      })]);
    const acquisition = await context.newPage();
    acquisition.setDefaultTimeout(5000);
    acquisition.on('pageerror', error => errors.push(error.message));
    assert.equal((await acquisition.goto(base + '/network/acquisition')).status(), 200);
    await acquisition.locator('#unlockCode').fill(process.env.LC_ADMIN_CODE);
    await acquisition.locator('#unlockSubmit').click();
    const company = acquisition.locator('article.company').filter({ hasText: domain });
    await company.waitFor();

    const prepared = await acquisition.evaluate(async data => {
      const response = await fetch('/api/network/admin/acquisition/prepare-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(5000)
      });
      return { status: response.status, body: await response.json() };
    }, { company_id: Number(id), email, source_url: source, manually_verified: true });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
    assert.equal(prepared.body.email_sent, false);

    await acquisition.reload();
    await company.getByText('Uitnodiging voorbereid', { exact: true }).waitFor();
    await company.getByRole('button', { name: 'Contact en uitnodiging beoordelen', exact: true }).click({ timeout: 3000 });
    const [rotated] = await Promise.all([
      acquisition.waitForResponse(response => response.url().endsWith('/api/network/admin/acquisition/rotate-preview')),
      company.getByRole('button', { name: 'Uitnodigingspreview herstellen' }).click()
    ]);
    assert.equal(rotated.status(), 200, await rotated.text());
    assert.equal((await rotated.json()).email_sent, false);
    const { rows: [resumed] } = await db.query(
      `SELECT public_visibility, metadata->'acquisition'->'invitation'->>'status' AS status,
              metadata->'acquisition'->'invitation'->>'sent_at' AS sent_at
       FROM network_directory_businesses WHERE id=$1`, [id]);
    assert.deepEqual(resumed, { public_visibility: 'hidden', status: 'prepared', sent_at: null });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    try {
      const { rows: [table] } = await db.query("SELECT to_regclass('network_directory_businesses') AS name");
      if (table.name) await db.query("DELETE FROM network_directory_businesses WHERE domain=$1 AND source='maps_acquisition'", [domain]);
    }
    finally { await db.end(); }
  }
});
