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
    // The owner ends it.
    const ok = await end(token, { confirm: 'END_CASE_STUDY', reason: 'TEST: the page needs an update' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.ended, 1);
    assert.match(ok.json.message, /baseline, evidence and report are kept/);
    const after = (await db.query('SELECT status,ended_at,ended_reason,baseline_at,baseline_data,baseline_locked FROM tracker_case_studies WHERE id=$1', [csId])).rows[0];
    assert.equal(after.status, 'completed'); assert.ok(after.ended_at); assert.equal(after.ended_reason, 'TEST: the page needs an update');
    assert.deepEqual([after.baseline_at.toISOString(), after.baseline_data, after.baseline_locked], [before.baseline_at.toISOString(), before.baseline_data, true], 'baseline unchanged');
    const ev = (await db.query("SELECT event_data FROM tracker_case_study_events WHERE case_study_id=$1 AND event_type='case_study_ended'", [csId])).rows;
    assert.equal(ev.length, 1); assert.equal(ev[0].event_data.baseline_preserved, true); assert.equal(ev[0].event_data.new_case_study_needs_new_baseline, true);
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
    // History events go to the active Case Study first.
    assert.match(SRC, /ORDER BY \(status=\\'active\\'\) DESC,id DESC LIMIT 1/);
    assert.doesNotMatch(log, /\[case-study-end\]/);
  } finally {
    app.kill(); try { await db.end(); } catch (e) {} fs.rmSync(built, { force: true });
  }
});
