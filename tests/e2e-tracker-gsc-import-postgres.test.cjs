'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const vm = require('node:vm');

const database = process.env.DATABASE_URL || '';
const isolated = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/(?:test\w*|\w+_e2e)$/.test(database);

test('GSC import preserves exact page identity and distinguishes missing measurements from zero', {
  skip: !isolated && 'requires disposable local PostgreSQL'
}, async () => {
  const { Pool } = require('pg');
  const schema = 'tracker_gsc_' + randomBytes(8).toString('hex');
  const control = new Pool({ connectionString: database });
  const pool = new Pool({ connectionString: database, options: '-c search_path=' + schema });
  try {
    await control.query('CREATE SCHEMA ' + schema);
    await pool.query(`
      CREATE TABLE tracker_clients(id INT PRIMARY KEY, token TEXT, domain TEXT, extra_domains TEXT, max_pages INT, gsc_enabled BOOLEAN, status TEXT);
      CREATE TABLE tracker_pages(id SERIAL PRIMARY KEY, tracker_client_id INT, url TEXT, keyword TEXT, intent TEXT,
        gsc_clicks NUMERIC, gsc_impressions NUMERIC, gsc_position NUMERIC, gsc_keyword TEXT, priority TEXT,
        is_active BOOLEAN, monitoring_waiting_input BOOLEAN, monitoring_gsc_pages_at TIMESTAMPTZ, created_at TIMESTAMPTZ);
      CREATE UNIQUE INDEX tracker_pages_client_url_idx ON tracker_pages(tracker_client_id,url) WHERE tracker_client_id IS NOT NULL;
      INSERT INTO tracker_clients VALUES(1,'owner','example.test',NULL,10,TRUE,'active');
      INSERT INTO tracker_pages(tracker_client_id,url,gsc_clicks,gsc_impressions) VALUES
        (1,'https://example.test/Page/',8,80),(1,'https://example.test/page/',9,90);
    `);
    const sourcePath = require.resolve('../src/index.js');
    const source = readFileSync(sourcePath, 'utf8');
    const start = source.indexOf("app.post('/api/tracker-client/:token/import-gsc-pages'");
    const end = source.indexOf('// GET /api/tracker-client/:token/gsc-pages', start);
    assert.ok(start >= 0 && end > start);
    const express = require('express');
    const app = express();
    app.use(express.json());
    vm.runInNewContext(source.slice(start, end), {
      app, pool, require: createRequire(sourcePath), console,
      urlOnClientDomain: require('../src/tracker-domain-guard.cjs').urlOnClientDomain,
      _caseStudyGscInputAllowed: async () => ({ allowed: true }),
      _ensureMonitoringGateSchema: async () => {}
    });
    const api = require('supertest')(app);
    const data = {
      pages: [
        { url: 'https://example.test/Page/', clicks: 0, impressions: 12 },
        { url: 'https://example.test/Page/', clicks: 2, impressions: 8 },
        { url: 'https://example.test/page/', impressions: 5 },
        { url: 'https://example.test/Page/?type=other', clicks: 0 }
      ]
    };
    const send = () => api.post('/api/tracker-client/owner/import-gsc-pages').send(data).expect(200);
    const first = await send();
    assert.equal(first.body.refreshed, 2);
    assert.equal(first.body.new_added, 1);
    assert.equal((await send()).body.new_added, 0);
    const result = await pool.query('SELECT url,gsc_clicks,gsc_impressions FROM tracker_pages ORDER BY id');
    assert.deepEqual(result.rows, [
      { url: 'https://example.test/Page/', gsc_clicks: '2', gsc_impressions: '20' },
      { url: 'https://example.test/page/', gsc_clicks: null, gsc_impressions: '5' },
      { url: 'https://example.test/Page/?type=other', gsc_clicks: '0', gsc_impressions: null }
    ]);
    const payload = { pages: [{ url: 'https://example.test/Page/?type=concurrent', clicks: 0, impressions: 2 }] };
    const simultaneous = await Promise.all([
      api.post('/api/tracker-client/owner/import-gsc-pages').send(payload).expect(200),
      api.post('/api/tracker-client/owner/import-gsc-pages').send(payload).expect(200)
    ]);
    assert.equal(simultaneous.reduce((total, response) => total + response.body.new_added, 0), 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM tracker_pages')).rows[0].count, 4);
  } finally {
    await pool.end();
    try { await control.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
    finally { await control.end(); }
  }
});
