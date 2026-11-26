'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.PROSPECT_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Lead Crawler restores an older crawl and imports from the real admin screen into private Network review', {
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
