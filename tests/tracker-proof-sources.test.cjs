'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditPageEvidence } = require('../src/tracker-proof-sources.cjs');
const url = 'https://example.test/Page/';

test('proof projects exact-page GSC and ContentScore history without inventing metrics', () => {
  const recorded = { url, source: 'PAGE_EXPORT', clicks: 0, impressions: null, position: null };
  const score = { score: 42, scanned_at: '2026-01-02T00:00:00Z' };
  const report = { pages: [recorded], kpis: { period: { start: '2026-01-01', end: '2026-01-02' } }, contentscores: { [url]: score } };
  const evidence = auditPageEvidence(report, url);
  assert.equal(evidence.observations[0].clicks, 0);
  assert.equal(evidence.observations[0].impressions, null);
  assert.equal(evidence.observations[0].ctr, null);
  assert.deepEqual(evidence.contentscore, [score]);
  assert.equal(auditPageEvidence(report, url.toLowerCase()), null);
  assert.equal(auditPageEvidence({ pages: [{ ...recorded, source: 'CRAWL' }] }, url).observations.length, 0);
});

const dbUrl = process.env.PREWRITE_E2E_DATABASE_URL || '';
test('proof linking requires both capabilities and never updates the protected baseline', {
  skip: !(dbUrl && /test|e2e/i.test(new URL(dbUrl).pathname)) && 'Set PREWRITE_E2E_DATABASE_URL to a dedicated test database'
}, async () => {
  const { Pool } = require('pg');
  const express = require('express');
  const request = require('supertest');
  const { randomBytes } = require('node:crypto');
  const { registerProofSourceRoutes, loadProofSources } = require('../src/tracker-proof-sources.cjs');
  const schema = 'proof_sources_' + randomBytes(8).toString('hex');
  const owner = new Pool({ connectionString: dbUrl });
  const pool = new Pool({ connectionString: dbUrl, options: '-c search_path=' + schema, max: 1 });
  const auditKey = 't'.repeat(32);
  const growthKey = 'g'.repeat(32);
  try {
    await owner.query('CREATE SCHEMA ' + schema);
    await pool.query('SET search_path=' + schema);
    await pool.query(`
      CREATE TABLE tracker_clients (id INT, token TEXT, status TEXT);
      CREATE TABLE tracker_pages (id INT, tracker_client_id INT, url TEXT);
      CREATE TABLE tracker_case_studies (id INT, tracker_client_id INT, tracker_page_id INT, canonical_url TEXT, status TEXT, baseline_data JSONB);
      CREATE TABLE tracker_case_study_events (id BIGSERIAL,case_study_id INT NOT NULL,tracker_page_id INT,event_type TEXT,event_at TIMESTAMPTZ DEFAULT NOW(),source TEXT,event_data JSONB);
      CREATE TABLE growth_free_checks (id BIGINT,public_id TEXT,access_key TEXT,url TEXT,status TEXT,query TEXT,finished_at TIMESTAMPTZ,summary JSONB,publication_history JSONB,contentscore_history JSONB);
      CREATE TABLE growth_free_ai_answers (check_id BIGINT,engine TEXT,raw_text TEXT,parsed JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(check_id,engine));
      CREATE TABLE growth_free_gsc_uploads (id INT,check_id BIGINT,file_name TEXT,status TEXT,basis TEXT,period_start DATE,period_end DATE,totals JSONB,queries JSONB,created_at TIMESTAMPTZ);
      CREATE TABLE prospect_quick_scans (id BIGINT,token TEXT,url TEXT,scan_result JSONB,scan_completed_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ,
        ceo_report_token TEXT,ceo_report_page_url TEXT,audit20_report_url TEXT,audit20_status TEXT);
      CREATE TABLE opportunity_reports (token TEXT,domain TEXT,source_url TEXT,report_data JSONB,created_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      INSERT INTO tracker_clients VALUES(1,'first',NULL),(2,'second',NULL);
    `);
    const auditStore = require('../src/gsc-report/store.cjs');
    await auditStore.ensureTables(pool);
    await pool.query("INSERT INTO tracker_pages VALUES (5,1,$1),(6,2,$1),(7,1,lower($1))", [url]);
    await pool.query("INSERT INTO tracker_case_studies VALUES (10,1,5,$1,'active','{\"score\":42}'),(11,2,6,$1,'active','{\"score\":59}'),(12,1,7,lower($1),'active','{}')", [url]);
    await pool.query("INSERT INTO growth_free_checks(id,public_id,access_key,url,status,query) VALUES(1,'growth',$1,$2,'DONE','query')", [growthKey, url]);
    await pool.query("INSERT INTO gsc_reports(token,report,expires_at) VALUES($1,$2,NOW()+interval '1 day')", [auditKey, {
      pages: [{ url, source: 'PAGE_EXPORT', clicks: 0, impressions: 10 }], kpis: { period: { start: '2026-01-01', end: '2026-01-02' } }
    }]);
    const app = express();
    app.use(express.json());
    const prospectKey = 'ab'.repeat(32);
    registerProofSourceRoutes(app, pool, { resolveQuickScanToken: async key => key === prospectKey.slice(0, 16) ? prospectKey : '' });
    const api = request(app);
    const link = (token, page, body) => api.post('/api/tracker-client/' + token + '/pages/' + page + '/case-study/proof-sources').send(body);
    const growth = { type: 'free_growth', id: 'growth', key: growthKey };
    const audit = { type: 'gsc_audit', key: auditKey };
    await link('second', 5, audit).expect(404);
    await link('first', 7, audit).expect(404);
    await link('first', 5, { ...growth, key: 'wrong' }).expect(404);
    await link('first', 5, audit).expect(200);
    await link('first', 5, audit).expect(200);
    await link('first', 5, growth).expect(200);
    await link('second', 6, audit).expect(409);
    const { rows: events } = await pool.query('SELECT * FROM tracker_case_study_events');
    assert.equal(events.length, 2);
    assert.ok(events.every(event => event.tracker_page_id === 5));
    assert.ok(!JSON.stringify(events).includes(auditKey) && !JSON.stringify(events).includes(growthKey));
    const proof = await loadProofSources(pool, { clientId: 1, pageId: 5, url, events });
    assert.equal(proof.gsc_audit[0].observations[0].clicks, 0);
    assert.equal(proof.free_growth[0].query, 'query');
    const second = { period: { start: '2026-01-03', end: '2026-01-04' }, pages: [{ url, clicks: null, impressions: 12 }] };
    const third = { period: { start: '2026-01-05', end: '2026-01-06' }, pages: [{ url, clicks: 1, impressions: 14 }] };
    await auditStore.setAfter(pool, 1, second);
    await auditStore.setAfter(pool, 1, third);
    await auditStore.setAfter(pool, 1, third);
    const updated = await loadProofSources(pool, { clientId: 1, pageId: 5, url, events });
    assert.deepEqual(updated.gsc_audit[0].observations.map(item => item.clicks), [0, null, 1]);
    await pool.query("UPDATE tracker_case_study_events SET case_study_id=10,tracker_client_id=NULL WHERE source='gsc_audit'");
    const priorLink = await api.get('/api/tracker-client/first/pages/5/proof-sources').expect(200);
    assert.equal(priorLink.body.proof_sources.gsc_audit.length, 1);
    await link('first', 5, audit).expect(200);
    const ordinaryUrl = 'https://example.test/Other/';
    await pool.query("INSERT INTO tracker_pages VALUES (8,1,$1),(9,2,$1)", [ordinaryUrl]);
    await pool.query("INSERT INTO growth_free_checks(id,public_id,access_key,url,status,query) VALUES(2,'ordinary',$1,$2,'DONE','ordinary query')", [growthKey, ordinaryUrl]);
    const ordinary = { ...growth, id: 'ordinary' };
    await api.post('/api/tracker-client/first/pages/8/proof-sources').send(ordinary).expect(200);
    await api.post('/api/tracker-client/first/pages/8/proof-sources').send(ordinary).expect(200);
    await api.post('/api/tracker-client/second/pages/9/proof-sources').send(ordinary).expect(409);
    const growthStore = require('../src/growth-free/store.cjs');
    await pool.query(`ALTER TABLE growth_free_ai_answers ADD COLUMN observation_history JSONB NOT NULL DEFAULT '[]'::jsonb`);
    const observation = { checkId: 2, engine: 'chatgpt' };
    const withoutCitation = { resources_status: 'MISSING', sources_verifiable: false, sources: [] };
    const withCitation = { resources_status: 'LISTED', sources_verifiable: true, sources: [ordinaryUrl] };
    await growthStore.saveAiAnswer(pool, { ...observation, rawText: 'First answer', parsed: withoutCitation });
    await growthStore.saveAiAnswer(pool, { ...observation, rawText: 'Second answer', parsed: withCitation });
    await growthStore.saveAiAnswer(pool, { ...observation, rawText: 'Second answer', parsed: withCitation });
    const ordinaryProof = await api.get('/api/tracker-client/first/pages/8/proof-sources').expect(200);
    assert.equal(ordinaryProof.body.proof_sources.free_growth.length, 1);
    assert.equal(ordinaryProof.body.proof_sources.free_growth[0].query, 'ordinary query');
    assert.deepEqual(ordinaryProof.body.proof_sources.free_growth[0].ai.map(item => item.exact_url_listed), [null, true]);
    await api.get('/api/tracker-client/second/pages/8/proof-sources').expect(404);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM tracker_case_studies')).rows[0].count, 3);
    await pool.query('UPDATE gsc_reports SET revoked_at=NOW()');
    assert.deepEqual((await loadProofSources(pool, { clientId: 1, pageId: 5, url, events })).gsc_audit, []);
    assert.deepEqual((await pool.query('SELECT baseline_data FROM tracker_case_studies WHERE id=10')).rows[0].baseline_data, { score: 42 });

    await pool.query(`INSERT INTO prospect_quick_scans(id,token,url,scan_result,scan_completed_at,revoked_at) VALUES
      (3,$1,$2,$3,NOW(),NULL)`, [prospectKey, url, { score: 0, url, provider_usage: { tokens: 1234 } }]);
    const scan = { type: 'quick_scan', key: prospectKey };
    await link('first', 7, scan).expect(404);
    await link('first', 5, scan).expect(200);
    await link('first', 5, { ...scan, key: prospectKey.slice(0, 16) }).expect(200);
    await link('second', 6, scan).expect(409);
    const scanHistory = async () => (await api.get('/api/tracker-client/first/pages/5/proof-sources').expect(200).expect('Cache-Control','no-store')).body.proof_sources.quick_scan;
    const measurements = await scanHistory();
    assert.equal(measurements.length, 1);
    assert.equal(measurements[0].score, 0);
    assert.ok(measurements[0].scanned_at);
    assert.deepEqual(Object.keys(measurements[0]).sort(), ['scanned_at', 'score', 'url']);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM tracker_case_study_events WHERE source='quick_scan'")).rows[0].count, 1);
    const ceoPage = 'https://example.test/Original/';
    const ceoToken = 'cd'.repeat(32);
    const auditToken = 'ef'.repeat(32);
    await pool.query(`INSERT INTO opportunity_reports VALUES
      ($1,'example.test',$3,$4,'2026-01-01T00:00:00Z',NULL),
      ($2,'example.test',$5,$6,'2026-01-02T00:00:00Z',NULL)`,[ceoToken,auditToken,ceoPage,{
        page_analysis:[{url:ceoPage,content_score:0,title:'Original page',internal_usage:'private-fixture'}]
      },url,{
        page_analysis:[{url,title:'Audit page',content_score:null},{url:'https://other.example/Other/',content_score:90}],
        opportunities:[{url,title:'Improve the introduction',status:'observed',internal_usage:'private-fixture'}]
      }]);
    await pool.query(`UPDATE prospect_quick_scans SET ceo_report_token=$1,ceo_report_page_url=$2,audit20_report_url=$3,audit20_status='ready' WHERE id=3`,
      [ceoToken,ceoPage,'https://app.contentscale.site/report/'+auditToken.slice(0,16)]);
    const savedResearch = async () => (await api.get('/api/tracker-client/first/pages/5/proof-sources').expect(200)).body.proof_sources.prospect_research;
    const research = await savedResearch();
    assert.deepEqual(research.map(item=>[item.source,item.pages.map(page=>[page.url,page.score])]),[
      ['ceo_scan',[[ceoPage,0]]],['audit20',[[url,null]]]
    ]);
    assert.equal(research[1].findings[0].title,'Improve the introduction');
    assert.doesNotMatch(JSON.stringify(research),/private-fixture|other[.]example|cdcdcdcd|efefefef/);
    await pool.query('UPDATE opportunity_reports SET revoked_at=NOW() WHERE token=$1',[ceoToken]);
    assert.deepEqual((await savedResearch()).map(item=>item.source),['audit20']);
    const externalUrl = 'https://reports.example.com/Audit20?share=existing#summary';
    await pool.query('UPDATE prospect_quick_scans SET audit20_report_url=$1 WHERE id=3', [externalUrl]);
    assert.deepEqual(await savedResearch(), [{ source: 'audit20', external_url: externalUrl }]);
    const otherAccount = await api.get('/api/tracker-client/second/pages/6/proof-sources').expect(200);
    assert.deepEqual(otherAccount.body.proof_sources.prospect_research, []);
    await pool.query("UPDATE prospect_quick_scans SET audit20_status='not_started' WHERE id=3");
    assert.deepEqual(await savedResearch(), []);
    await pool.query("UPDATE prospect_quick_scans SET audit20_status='ready' WHERE id=3");
    for (const unsupported of ['//reports.example.com/audit', 'http://reports.example.com/audit',
      'https://app.contentscale.site/report/expired', 'https://localhost/audit', 'https://user:secret@reports.example.com/audit']) {
      await pool.query('UPDATE prospect_quick_scans SET audit20_report_url=$1 WHERE id=3', [unsupported]);
      assert.deepEqual(await savedResearch(), []);
    }
    await pool.query('UPDATE prospect_quick_scans SET audit20_report_url=$1 WHERE id=3', [externalUrl]);
    await pool.query('UPDATE prospect_quick_scans SET scan_result=$1 WHERE id=3', [{ url }]);
    assert.equal((await scanHistory())[0].score, null);
    await pool.query('UPDATE prospect_quick_scans SET scan_result=$1 WHERE id=3', [{ score: 5, url: url.toLowerCase() }]);
    assert.deepEqual(await scanHistory(), []);
    await pool.query('UPDATE prospect_quick_scans SET revoked_at=NOW() WHERE id=3');
    assert.deepEqual(await scanHistory(), []);
    assert.deepEqual(await savedResearch(), []);
    assert.deepEqual((await pool.query('SELECT baseline_data FROM tracker_case_studies WHERE id=10')).rows[0].baseline_data, { score: 42 });
  } finally {
    await pool.end();
    await owner.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await owner.end();
  }
});
