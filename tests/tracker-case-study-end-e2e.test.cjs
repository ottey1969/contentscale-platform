'use strict';
// "End case study": the owner ends the protected Case Study of a page in the Tracker. Boots the full canonical server on
// localhost (outside network denied) against a disposable PostgreSQL. Checks: a typed confirmation is required; only the
// owner token works; the status becomes completed with ended_at and the reason; a history event is written; the locked
// baseline is not changed; Growth no longer sees the page as locked; a new Case Study for the same URL is possible later,
// with its own baseline, while two active Case Studies for one URL never are.
// Runs only with PREWRITE_E2E_DATABASE_URL pointing at a local database; every row is labelled TEST.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

test('Tracker: an End case study button and an explicit two-step confirmation; Growth explains the lock', () => {
  assert.match(SRC, /onclick="event\.stopPropagation\(\);endCaseStudy\(' \+ p\.id \+ '\)"[^>]*>End case study<\/button>/);
  assert.match(SRC, /function endCaseStudy\(pageId\)\{[^]*?confirm\('End the Case Study for '[^]*?This cannot be undone\. You can start a new Case Study for this page later; it gets a new baseline\.'\)\)return;[^]*?api\('\/pages\/'\+pageId\+'\/case-study\/end','POST',\{confirm:'END_CASE_STUDY',reason:why\}\)/);
  const growth = fs.readFileSync(path.join(__dirname, '../src/tracker-growth-automatic-routes.cjs'), 'utf8');
  assert.match(growth, /This page is a protected Case Study\.<\/strong>[^]*?end the Case Study in the Tracker \(button <em>End case study<\/em> on this page\)/);
});

test('End case study through the real server route', { skip, timeout: 180000 }, async () => {
  const { prepare } = require('../scripts/prepare-canonical-production.cjs');
  const built = path.join(__dirname, '../src', '_case_study_e2e_' + process.pid + '.js');
  fs.writeFileSync(built, prepare(SRC));
  const port = 19300 + (process.pid % 500), base = 'http://127.0.0.1:' + port;
  let log = '';
  const app = cp.spawn(process.execPath, ['--require', path.join(__dirname, 'staging-boot-no-egress.cjs'), built], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: DB, ENABLE_TRACKER_SCHEDULER: '0', ENABLE_BULK_WORKER: '0', NODE_ENV: 'test' } });
  app.stdout.on('data', d => { log += d; }); app.stderr.on('data', d => { log += d; });
  const db = new pg.Client({ connectionString: DB });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { await new Promise(r => setTimeout(r, 1000)); up = /All tables ready/.test(log) && await fetch(base + '/').then(() => true, () => false); }
    assert.ok(up, 'server started: ' + log.slice(-1500));
    await db.connect();
    const token = 'TEST-cs-' + crypto.randomBytes(4).toString('hex'), ro = 'TEST-ro-' + crypto.randomBytes(4).toString('hex');
    await db.query('ALTER TABLE tracker_clients ADD COLUMN IF NOT EXISTS readonly_token TEXT').catch(() => {});
    const clientId = (await db.query("INSERT INTO tracker_clients(token,domain,readonly_token) VALUES ($1,'test-cs.example',$2) RETURNING id", [token, ro])).rows[0].id;
    const url = 'https://test-cs.example/test-geo-page/';
    const pageId = (await db.query('INSERT INTO tracker_pages(tracker_client_id,url,keyword) VALUES ($1,$2,$3) RETURNING id', [clientId, url, 'TEST geo'])).rows[0].id;
    const end = (tok, body) => fetch(base + '/api/tracker-client/' + tok + '/pages/' + pageId + '/case-study/end', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));
    // Without a case study: the schema is ensured and nothing is found.
    const first = await end(token, { confirm: 'END_CASE_STUDY' });
    assert.equal(first.status, 404, JSON.stringify(first.json));
    const baseline = { schema_version: 3, source: 'TEST baseline' };
    const csId = (await db.query(`INSERT INTO tracker_case_studies(tracker_client_id,tracker_page_id,client_name,domain,canonical_url,primary_query,status,baseline_at,baseline_data,baseline_locked)
      VALUES ($1,$2,'TEST client','test-cs.example','https://test-cs.example/test-geo-page','TEST geo','active',NOW()-interval '20 days',$3,true) RETURNING id`, [clientId, pageId, baseline])).rows[0].id;
    const before = (await db.query('SELECT baseline_at,baseline_data FROM tracker_case_studies WHERE id=$1', [csId])).rows[0];
    // No confirmation, or the read-only token: refused, nothing changes.
    assert.equal((await end(token, { reason: 'TEST' })).status, 400);
    // The read-only link is refused (the Tracker's read-only guard answers 403 before the route).
    assert.ok([403, 404].includes((await end(ro, { confirm: 'END_CASE_STUDY' })).status));
    assert.equal((await db.query('SELECT status FROM tracker_case_studies WHERE id=$1', [csId])).rows[0].status, 'active');
    // The page is waiting on the day-14 Case Study checkpoint (scanner locked, page in Tracker action pages).
    await db.query("UPDATE tracker_pages SET monitoring_waiting_input=TRUE,monitoring_gate_label='case_day_14',monitoring_request_at=NOW() WHERE id=$1", [pageId]);
    // The owner ends it.
    const ok = await end(token, { confirm: 'END_CASE_STUDY', reason: 'TEST: the page needs an update' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.ended, 1);
    assert.ok(ok.json.ended_at,'Closeout returns an actual end date');
    assert.equal(ok.json.scan_permission_required,true,'Ending the Case Study revokes scan permission');
    assert.match(ok.json.message, /baseline, evidence and report are kept/);
    const after = (await db.query('SELECT status,ended_at,ended_reason,baseline_at,baseline_data,baseline_locked FROM tracker_case_studies WHERE id=$1', [csId])).rows[0];
    assert.equal(after.status, 'completed'); assert.ok(after.ended_at); assert.equal(after.ended_reason, 'TEST: the page needs an update');
    assert.deepEqual([after.baseline_at.toISOString(), after.baseline_data, after.baseline_locked], [before.baseline_at.toISOString(), before.baseline_data, true], 'baseline unchanged');
    const ev = (await db.query("SELECT event_data FROM tracker_case_study_events WHERE case_study_id=$1 AND event_type='case_study_ended'", [csId])).rows;
    assert.equal(ev.length, 1); assert.equal(ev[0].event_data.baseline_preserved, true); assert.equal(ev[0].event_data.new_case_study_needs_new_baseline, true);
    const historyPath = '/api/tracker-client/' + token + '/pages/' + pageId + '/proof-history';
    const getHistory = (query = '') => fetch(base + historyPath + query).then(async r => ({status:r.status, body:await r.json()}));
    const endedHistory = await getHistory();
    assert.equal(endedHistory.status, 200);
    assert.equal(endedHistory.body.case_study?.status, 'completed');
    assert.deepEqual(endedHistory.body.case_study.baseline_data, baseline);
    assert.ok(endedHistory.body.events.some(event => event.event_type === 'case_study_ended'));
    const brief = { content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: url } };
    const otherClientId = (await db.query("INSERT INTO tracker_clients(token,domain) VALUES ($1,'test-cs.example') RETURNING id", [token + '-other'])).rows[0].id;
    await db.query("INSERT INTO tracker_pages(tracker_client_id,url,keyword) VALUES ($1,$2,'TEST other client')", [otherClientId, url]);
    const addBrief = (owner, target) => db.query(`INSERT INTO prewrite_briefs(client_id,keyword,language,brief_json,status)
      VALUES($1,'TEST geo','nl',$2,'approved') RETURNING id`, [owner, { ...brief, content_decision: { ...brief.content_decision, closest_existing_url: target } }]);
    const own = (await addBrief(clientId, url)).rows[0].id;
    const similar = (await addBrief(clientId, url.replace('/test-geo-page/', '/Test-geo-page/'))).rows[0].id;
    const other = (await addBrief(otherClientId, url)).rows[0].id;
    const report = { schema: 'contentscale.implementation.v1', url, status: 'implemented', summary: 'TEST implemented update', change_types: ['content'] };
    await db.query(`UPDATE prewrite_briefs SET implementation_reports=$2::jsonb WHERE id=$1`, [own, JSON.stringify([
      { recorded_at: '2026-01-01T00:00:00.000000Z', report: { ...report, status: 'not_published', summary: 'TEST earlier draft' } }
    ])]);
    const saveReport = (owner, id, data) => fetch(base + '/api/tracker-client/' + owner + '/prewrite-brief/' + id + '/implementation-report', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: data })
    });
    assert.equal((await saveReport(token, own, report)).status, 200);
    assert.equal((await saveReport(token, similar, { ...report, url: url.replace('/test-geo-page/', '/Test-geo-page/') })).status, 200);
    assert.equal((await saveReport(token + '-other', other, report)).status, 200);
    const beforePublication = await getHistory();
    assert.deepEqual(beforePublication.body.prewrite_implementations.map(item => [item.brief_id, item.report.status]),
      [[own, 'not_published'], [own, 'implemented']]);
    assert.equal(beforePublication.body.prewrite_implementations[1].report.published_at, null);
    assert.deepEqual(beforePublication.body.case_study.baseline_data, baseline);
    const published = { ...report, status: 'published', published_at: '2026-01-02T00:00:00Z' };
    const publication = await fetch(base + '/api/tracker-client/' + token + '/prewrite-brief/' + own + '/publish', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: published })
    });
    assert.equal(publication.status, 200, log.slice(-1400));
    assert.equal((await publication.json()).tracker_page_id, pageId);
    assert.deepEqual((await db.query('SELECT tracker_client_id FROM tracker_pages WHERE url=$1 ORDER BY tracker_client_id', [url])).rows.map(row => row.tracker_client_id), [clientId, otherClientId]);
    const afterPublication = await getHistory();
    assert.deepEqual(afterPublication.body.prewrite_implementations.map(item => [item.brief_id, item.report.status]),
      [[own, 'not_published'], [own, 'implemented'], [own, 'published']]);
    assert.deepEqual(afterPublication.body.case_study.baseline_data, baseline);
    const gscStore = require('../src/gsc-report/store.cjs');
    const growthStore = require('../src/growth-free/store.cjs');
    await gscStore.ensureTables(db);
    await growthStore.ensureTables(db);
    const beforePeriod = { start: '2026-01-01', end: '2026-01-02' };
    const afterPeriod = { start: '2026-01-03', end: '2026-01-04' };
    const audit = await gscStore.createReport(db, { lang: 'nl', days: 1, report: {
      kpis: { period: beforePeriod }, pages: [{ url, source: 'PAGE_EXPORT', clicks: null, impressions: 8 }]
    } });
    await gscStore.setAfter(db, audit.id, { period: afterPeriod, pages: [{ url, clicks: 0, impressions: 12 }] });
    const check = await growthStore.createCheck(db, { email: 'test@example.test', url, host: new URL(url).hostname, query: 'TEST geo' });
    await growthStore.setStatus(db, check.id, { status: 'DONE' });
    for (const score of [42, 59]) await growthStore.appendContentScore(db, { checkId: check.id, result: { score } });
    await growthStore.saveAiAnswer(db, { checkId: check.id, engine: 'chatgpt', rawText: 'TEST unverified', parsed: { sources_verifiable: false } });
    await growthStore.saveAiAnswer(db, { checkId: check.id, engine: 'chatgpt', rawText: 'TEST verified', parsed: { sources_verifiable: true, sources: [url] } });
    const linkPath = base + historyPath.replace('/proof-history', '/proof-sources');
    const linkProof = (target, source) => fetch(target, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(source)
    });
    assert.equal((await linkProof(linkPath, { type: 'gsc_audit', key: audit.token })).status, 200);
    assert.equal((await linkProof(linkPath, { type: 'free_growth', id: check.public_id, key: check.access_key })).status, 200);
    const sharedProof = (await getHistory()).body;
    assert.equal(sharedProof.prewrite_implementations[2].report.status, 'published');
    assert.deepEqual(sharedProof.case_study.baseline_data, baseline);
    assert.deepEqual(sharedProof.proof_sources.gsc_audit[0].observations.map(row => [row.period, row.clicks]), [[beforePeriod, null], [afterPeriod, 0]]);
    assert.deepEqual(sharedProof.proof_sources.free_growth[0].contentscore_history.map(row => row.score), [42, 59]);
    assert.deepEqual(sharedProof.proof_sources.free_growth[0].ai.map(row => row.exact_url_listed), [null, true]);
    assert.equal((await getHistory('?case_id=abc')).status, 400);
    const reportToken = crypto.randomBytes(24).toString('hex');
    const fiveEngines = ['google_aio','chatgpt','perplexity','claude','copilot'];
    await db.query('UPDATE tracker_case_studies SET report_token=$2 WHERE id=$1',[csId,reportToken]);
    await db.query(`INSERT INTO tracker_case_study_events(case_study_id,tracker_page_id,event_type,source,event_data)
      VALUES($1,$2,'cycle_day_30_report','test',$3)`,[csId,pageId,{
      baseline:{ai_evidence:{google_aio:{exact_page_cited:false}}},
      current:{ai_evidence:fiveEngines.map(engine=>({engine,exact_page_cited:false}))}
    }]);
    const milestone = await fetch(base+'/case-study-report/'+reportToken);
    assert.equal(milestone.status,200);
    assert.match(await milestone.text(),/Exact-page AI citations \(5 engines\)<\/th><td>—<\/td><td>0<\/td><td>—<\/td>/);
    // Ending the Case Study ends its evidence checkpoint: the scanner is no longer locked on it.
    const gate = (await db.query('SELECT monitoring_waiting_input,monitoring_gate_label,monitoring_request_at FROM tracker_pages WHERE id=$1', [pageId])).rows[0];
    assert.deepEqual([gate.monitoring_waiting_input, gate.monitoring_gate_label, gate.monitoring_request_at], [false, null, null], 'case-study checkpoint cleared');
    // A completed Case Study is a full operational stop: no schedule, old checkpoint or automatic scan permission.
    const closed=(await db.query(`SELECT case_study_ended_at,case_study_scan_authorized_at,check_frequency,next_check_at,
      monitoring_waiting_input,monitoring_gate_label,monitoring_request_at,email_reminders
      FROM tracker_pages WHERE id=$1`,[pageId])).rows[0];
    assert.ok(closed.case_study_ended_at);
    assert.equal(closed.case_study_scan_authorized_at,null);
    assert.equal(closed.check_frequency,'0');
    assert.equal(closed.next_check_at,null);
    assert.equal(closed.monitoring_waiting_input,false);
    assert.equal(closed.monitoring_gate_label,null);
    assert.equal(closed.monitoring_request_at,null);
    assert.equal(closed.email_reminders,false);
    const noPermission=await fetch(base+'/api/tracker-client/'+token+'/check/'+pageId,{method:'POST'});
    assert.equal(noPermission.status,409,'A direct API scan cannot bypass completed case study');
    assert.equal((await noPermission.json()).code,'CASE_STUDY_SCAN_REAUTHORIZATION_REQUIRED');
    const consentUrl=base+'/api/tracker-client/'+token+'/pages/'+pageId+'/case-study/authorize-scan';
    const consent=(body,tok=token)=>fetch(base+'/api/tracker-client/'+tok+'/pages/'+pageId+'/case-study/authorize-scan',
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
    assert.equal((await consent({confirm:'NO'})).status,400);
    assert.ok([403,404].includes((await consent({confirm:'AUTHORIZE_ONE_SCAN'},ro)).status),'read-only token cannot grant scans');
    const permitted=await consent({confirm:'AUTHORIZE_ONE_SCAN'});
    assert.equal(permitted.status,200,JSON.stringify(permitted.body));
    assert.equal(permitted.body.one_manual_scan_authorized,true);
    assert.ok((await db.query('SELECT case_study_scan_authorized_at FROM tracker_pages WHERE id=$1',[pageId])).rows[0].case_study_scan_authorized_at);
    // Permission does not start a scan or silently reenable a recurring schedule.
    assert.equal((await db.query('SELECT check_frequency FROM tracker_pages WHERE id=$1',[pageId])).rows[0].check_frequency,'0');
    // Return to permission-required for the historical page (simulation of one-time consumption).
    await db.query('UPDATE tracker_pages SET case_study_scan_authorized_at=NULL WHERE id=$1',[pageId]);
    // Pages ended earlier (before this fix) still carry a case_day_* wait: the Tracker page list releases it once.
    // A regular guided-monitoring wait is real and stays.
    const stale = (await db.query("INSERT INTO tracker_pages(tracker_client_id,url,keyword,monitoring_waiting_input,monitoring_gate_label,monitoring_request_at) VALUES ($1,'https://test-cs.example/test-old-case/','TEST old',TRUE,'case_day_7',NOW()) RETURNING id", [clientId])).rows[0].id;
    const regular = (await db.query("INSERT INTO tracker_pages(tracker_client_id,url,keyword,monitoring_waiting_input,monitoring_gate_label,monitoring_request_at) VALUES ($1,'https://test-cs.example/test-monitored/','TEST mon',TRUE,'monitoring_cycle',NOW()) RETURNING id", [clientId])).rows[0].id;
    // The Tracker page list (dashboard GET) runs the same clear for these pages; it needs the full production schema,
    // so here the exact SQL it uses and its page selection are run directly.
    const clearSql = SRC.match(/const _CASE_STUDY_GATE_CLEAR_SQL=`([^`]+)`/)[1];
    const staleIds = new Function('return ' + SRC.match(/function _caseStudyStaleGateIds[^\n]+/)[0])();
    const rowsNow = (await db.query('SELECT id,url,monitoring_gate_label FROM tracker_pages WHERE id=ANY($1::int[])', [[stale, regular]])).rows;
    const picked = staleIds(rowsNow, () => false);
    assert.deepEqual(picked, [stale], 'only the case_day_* wait is picked');
    assert.deepEqual(staleIds(rowsNow, p => Number(p.id) === Number(stale)), [], 'an active Case Study keeps its checkpoint');
    await db.query(clearSql, [[stale, regular]]);
    assert.match(SRC, /const _staleGate=_caseStudyStaleGateIds\(pagesR\.rows,p=>_csPageIds\.has\(Number\(p\.id\)\)\|\|_csByUrl\.has\(_caseStudyNormUrl\(p\.url\)\)\);\s*if\(_staleGate\.length\)\{\s*await pool\.query\(_CASE_STUDY_GATE_CLEAR_SQL,\[_staleGate\]\);/);
    const g2 = (await db.query('SELECT id,monitoring_waiting_input,monitoring_gate_label FROM tracker_pages WHERE id=ANY($1::int[]) ORDER BY id', [[stale, regular]])).rows;
    assert.deepEqual(g2.map(r => [r.monitoring_waiting_input, r.monitoring_gate_label]), [[false, null], [true, 'monitoring_cycle']]);
    await db.query('DELETE FROM tracker_pages WHERE id=ANY($1::int[])', [[stale, regular]]);
    // Growth (and its CMS export) read the lock as an active row for the page: there is none now.
    assert.equal((await db.query("SELECT EXISTS(SELECT 1 FROM tracker_case_studies WHERE tracker_client_id=$1 AND tracker_page_id=$2 AND status='active') AS locked", [clientId, pageId])).rows[0].locked, false);
    // Ending again: nothing active.
    assert.equal((await end(token, { confirm: 'END_CASE_STUDY' })).status, 404);
    // Starting again is no longer refused because of the history. (Here it stops at the normal baseline requirements:
    // this TEST page has no scan; a real page needs scan, GSC and 5/5 AI evidence first.)
    const restart = await fetch(base + '/api/tracker-client/' + token + '/pages/' + pageId + '/case-study/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ primary_query: 'TEST geo' }) }).then(r => r.json());
    assert.equal(restart.success, false); assert.notEqual(restart.protected_history, true, JSON.stringify(restart));
    // Database: a new active Case Study for the URL is allowed next to the ended one (new baseline, link back);
    // a second active one is refused; the ended row is untouched.
    const ins = (prev) => db.query(`INSERT INTO tracker_case_studies(tracker_client_id,tracker_page_id,client_name,domain,canonical_url,primary_query,status,baseline_at,baseline_data,baseline_locked,previous_case_study_id)
      VALUES ($1,$2,'TEST client','test-cs.example','https://test-cs.example/test-geo-page','TEST geo','active',NOW(),'{"source":"TEST new baseline"}',true,$3) RETURNING id`, [clientId, pageId, prev]);
    const second = (await ins(csId)).rows[0].id;
    await assert.rejects(ins(csId), /tracker_case_studies_one_active_per_url|duplicate key/);
    const rows = (await db.query('SELECT id,status,baseline_data FROM tracker_case_studies WHERE tracker_client_id=$1 ORDER BY id', [clientId])).rows;
    assert.deepEqual(rows.map(r => [r.id, r.status]), [[csId, 'completed'], [second, 'active']]);
    assert.deepEqual(rows[0].baseline_data, baseline, 'the ended baseline is untouched');
    const originalReading = (await db.query(`INSERT INTO tracker_snapshots(page_id,checked_at,score)
      VALUES($1,$2,42) RETURNING id`,[pageId, new Date(after.ended_at.getTime()-1000)])).rows[0].id;
    const nextReading = (await db.query(`INSERT INTO tracker_snapshots(page_id,checked_at,score)
      SELECT $1,baseline_at+interval '1 second',87 FROM tracker_case_studies WHERE id=$2 RETURNING id`,[pageId,second])).rows[0].id;
    const currentHistory = await getHistory();
    assert.equal(currentHistory.body.case_study.id, second);
    assert.deepEqual(currentHistory.body.snapshots.map(row=>row.id),[nextReading]);
    assert.deepEqual(currentHistory.body.case_studies.map(study => study.id), [second, csId]);
    const originalHistory = await getHistory('?case_id=' + csId);
    assert.deepEqual(originalHistory.body.case_study.baseline_data, baseline);
    assert.deepEqual(originalHistory.body.snapshots.map(row=>row.id),[originalReading]);
    assert.ok(originalHistory.body.events.some(event => event.event_type === 'case_study_ended'));
    const otherPageId = (await db.query("INSERT INTO tracker_pages(tracker_client_id,url,keyword) VALUES ($1,'https://test-cs.example/another/','TEST') RETURNING id",[clientId])).rows[0].id;
    assert.equal((await fetch(base+historyPath.replace('/pages/'+pageId+'/', '/pages/'+otherPageId+'/')+'?case_id='+csId)).status,404);
    // History events go to the active Case Study first.
    assert.match(SRC, /ORDER BY \(status=\\'active\\'\) DESC,id DESC LIMIT 1/);
    assert.doesNotMatch(log, /\[case-study-end\]/);
  } finally {
    app.kill(); try { await db.end(); } catch (e) {} fs.rmSync(built, { force: true });
  }
});
