'use strict';
// Owner 2026-11-28: "WAAR IS DE ZICHTBARE LEESBARE SECTIE EN No se pudo completar la investigación. WAAROM?" A brief that was
// made but did not pass the quality check (here only "official_sources": fewer than 2 official sources) was stored with
// status 'failed'. The page then showed the raw JSON and "Research could not be completed", without the readable brief and
// without the reason. Now: the decision, the reason it did not pass, the brief in plain words and Copy/Download are shown;
// approving stays off. A check that really failed (no brief) still says it could not be completed.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const database = process.env.PREWRITE_E2E_DATABASE_URL || '';
const disposable = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(database);
let chromium = null; try { ({ chromium } = require('playwright')); } catch {}

test('a brief that did not pass the quality check is shown in plain words with the reason, not as a failed check', {
  skip: (!disposable || !chromium) && 'Requires disposable PostgreSQL and Chromium', timeout: 90000
}, async () => {
  const { randomBytes } = require('node:crypto');
  const { Pool } = require('pg');
  const { registerFreePrewrite } = require('../src/free-prewrite.cjs');
  const schema = 'free_prewrite_np_' + randomBytes(6).toString('hex');
  const admin = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  let server, browser;
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    await pool.query(`CREATE TABLE prewrite_briefs (
      id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
      brief_json JSONB, specialist_html TEXT, tracker_page_id INT, approved_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ, published_url TEXT, created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
      public_site TEXT, public_access_hash TEXT UNIQUE, implementation_reports JSONB NOT NULL DEFAULT '[]')`);
    const site = 'https://es.not-passed.example/';
    const app = express();
    app.use(express.json());
    app.use(express.static(require('node:path').join(__dirname, '../public')));
    registerFreePrewrite(app, pool, {
      dailyLimit: 8,
      discover: async () => ({ site, urls: [site] }),
      generate: async ({ id, keyword }) => {
        if (keyword === 'Roto') throw Error('TEST generation failed');
        // What the generator stores when the brief is made but the quality gate says NOT PASSED.
        await pool.query("UPDATE prewrite_briefs SET status='failed',brief_json=$2 WHERE id=$1", [id, {
          keyword, language: 'es',
          content_decision: { recommended_treatment: 'CREATE_NEW_PAGE', reason: 'Ninguna página existente cubre esta necesidad.' },
          meta_package: { h1: 'Análisis SEO gratuito', seo_title: 'SEO Checker gratis', url_slug: '/seo-checker/' },
          opening_passage: { direct_answer: 'Para analizar el SEO de tu web gratis, usa un SEO checker.' },
          definitive_outline: [{ h2: '¿Qué es un SEO checker gratuito?', target_words: 300, purpose: 'Definir el concepto.' }],
          competitor_table: [{ rank: 1, page_title: 'SEO Checker de Seobility', exact_url: 'https://www.seobility.net/es/seochecker/', what_they_have: 'Un checker gratuito.', the_gap: 'No explica los límites.', what_to_add: 'Explica los límites.' }],
          action_plan: [{ step: 1, action: 'Crea la página.' }],
          ai_quality_check: { ready_for_generation: false, readiness_score: 94, missing: ['official_sources'] }
        }]);
      }
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const ownerKey = 'not-passed-owner-secret-0123456789';
    process.env.GROWTH_FREE_ADMIN_KEY = ownerKey;
    const exp = String(Date.now() + 3600000);
    const cookie = { name: 'gf_admin', value: exp + '.' + require('../src/owner-session.cjs').sign(ownerKey, exp), url: origin };
    async function start(topic) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.context().addCookies([cookie]);
      await page.goto(origin + '/free-pre-write?lang=es');
      await page.locator('[name=website]').fill(site);
      await page.locator('[name=keyword]').fill(topic);
      await page.locator('[name=email]').fill('visitor@not-passed.example');
      await page.locator('#intake button[type=submit]').click();
      return { page, errors };
    }
    // 1. Made, not passed: decision, reason, readable brief, Copy/Download; no "could not be completed"; no approval.
    const { page, errors } = await start('¿Qué seo checker gratis analiza el SEO de mi web?');
    await page.locator('#brief-readable').waitFor({ state: 'visible', timeout: 20000 });
    assert.match(await page.locator('#decision h2').innerText(), /CREATE · https:\/\/es\.not-passed\.example\/seo-checker\//);
    const notice = await page.locator('#not-passed').innerText();
    assert.match(notice, /no superó el control de calidad/i);
    assert.match(notice, /fuentes oficiales/i, 'the reason in plain words');
    const readable = await page.locator('#brief-readable').innerText();
    for (const s of ['Análisis SEO gratuito', 'Para analizar el SEO de tu web gratis, usa un SEO checker.', '¿Qué es un SEO checker gratuito?', 'Explica los límites.', 'Crea la página.']) assert.ok(readable.includes(s), s);
    assert.ok((await page.locator('#editor').inputValue()).length > 50, 'Copy brief / Download have the brief');
    assert.ok(await page.locator('#copy-brief').isVisible());
    assert.notEqual((await page.locator('#status').innerText()).trim(), 'No se pudo completar la investigación.');
    assert.equal(await page.locator('#approve').isDisabled(), true, 'a brief that did not pass cannot be approved');
    assert.deepEqual(errors, []);
    // 2. Really failed (no brief): the page still says the research could not be completed.
    const broken = await start('Roto');
    await broken.page.waitForFunction(() => /No se pudo completar la investigación/.test(document.getElementById('status').textContent), null, { timeout: 20000 });
    assert.equal(await broken.page.locator('#brief-readable').isVisible(), false);
  } finally {
    await browser?.close();
    server?.close();
    await pool.end();
    await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE').catch(() => {});
    await admin.end();
  }
});
