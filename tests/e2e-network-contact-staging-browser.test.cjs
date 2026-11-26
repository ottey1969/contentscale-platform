'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const base = process.env.NETWORK_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Network admins can open both Contact Intelligence views after a fresh canonical boot', {
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
  } finally {
    await browser.close();
    try {
      if (contactId) await db.query('DELETE FROM contact_intelligence WHERE id=$1', [contactId]);
    } finally { await db.end(); }
  }
});
