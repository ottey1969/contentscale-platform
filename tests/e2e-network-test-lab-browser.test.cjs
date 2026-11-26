'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const base = process.env.NETWORK_E2E_BASE || '';
const database = process.env.DATABASE_URL || '';
const localApp = /^http:\/\/127\.0\.0\.1:\d+$/.test(base);
const localDb = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('Network Test Lab completes its stored cross-role journey in Chromium', {
  skip: !(localApp && localDb) && 'requires the canonical local app and a disposable PostgreSQL database',
  timeout: 60000
}, async () => {
  const { Client } = require('pg');
  const { chromium } = require('playwright');
  const db = new Client({ connectionString: database });
  await db.connect();
  const session = 'test-' + randomBytes(20).toString('hex');
  const api = base + '/api/network/admin/test-lab/fixtures';
  let browser, admin, fixture;
  try {
    assert.equal((await fetch(api)).status, 401);
    for (let i = 0; i < 40; i++) {
      const { rows: [row] } = await db.query("SELECT to_regclass('public.super_admins') IS NOT NULL AS ready");
      if (row.ready) break;
      await delay(250);
    }
    const created = await db.query(
      'INSERT INTO super_admins(username,password_hash,session_token,is_active) VALUES ($1,$2,$3,TRUE) RETURNING id',
      ['network-' + randomBytes(8).toString('hex'), 'test fixture uses session auth only', session]);
    admin = created.rows[0].id;

    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(token => localStorage.setItem('admin_id', token), session);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const lab = base + '/network/admin/test-lab';
    assert.equal((await page.goto(lab)).status(), 200);

    const [response] = await Promise.all([
      page.waitForResponse(r => r.url() === api && r.request().method() === 'POST'),
      page.locator('#createFixture').click()
    ]);
    assert.equal(response.status(), 201, await response.text());
    fixture = (await response.json()).fixture.id;
    assert.ok(fixture);

    const stages = [
      'verify_business','approve_publisher','approve_website','marketplace_discover',
      'business_request_publisher','accept_match_proposal','prewrite_ready','discover_internal',
      'discover_external','apply_links','refresh_ready','copy_html','submit_live','precheck_pass','verify_live'
    ];
    for (const stage of stages) {
      const button = page.locator('#fixtureControls button.next[data-fixture-transition="' + stage + '"]');
      const [transition] = await Promise.all([
        page.waitForResponse(r => r.url() === api + '/' + fixture + '/transition'),
        button.click({ timeout: 5000 })
      ]);
      assert.equal(transition.status(), 200, await transition.text());
      assert.equal((await transition.json()).all_invariants_pass, true, stage);
    }

    const [restored] = await Promise.all([
      page.waitForResponse(r => r.url() === api + '/' + fixture && r.request().method() === 'GET'),
      page.reload()
    ]);
    const evidence = await restored.json();
    assert.equal(evidence.journey.complete, true);
    assert.equal(evidence.state.publication.placement_status, 'verified');
    assert.deepEqual(evidence.history.map(entry => entry.transition), ['created', ...stages]);
    assert.ok(Object.values(evidence.state.side_effects).every(count => count === 0));
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (fixture) await db.query('DELETE FROM network_test_lab_fixtures WHERE id=$1 AND created_by_admin_id=$2', [fixture, String(admin)]);
    if (admin) await db.query('DELETE FROM super_admins WHERE id=$1 AND session_token=$2', [admin, session]);
    await db.end();
  }
});
