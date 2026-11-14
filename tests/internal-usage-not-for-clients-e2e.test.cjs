'use strict';
// Internal Gemini telemetry never reaches a client (owner 2026-11-14: "where we do not need it, do not show it; keep the
// system safe"). Boots the full canonical server on localhost against a disposable PostgreSQL and checks the actual HTTP
// responses: a client Tracker gets its Brief without generation_usage, an owner Tracker (contentscale.site) still gets it,
// the public share page shows no Gemini workload, and the stored Brief is unchanged.
// Runs only with PREWRITE_E2E_DATABASE_URL pointing at a local database; every row is labelled TEST.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');

test('owner domains: contentscale.site and its market subdomains, nothing that only looks like it', () => {
  const a = SRC.indexOf('const _INTERNAL_USAGE_DOMAINS='), b = SRC.indexOf('const _INTERNAL_USAGE_KEYS=');
  const sees = new Function('process', SRC.slice(a, b) + ';return _domainSeesInternalUsage;')({ env: {} });
  for (const d of ['contentscale.site', 'https://nl.contentscale.site/', 'www.contentscale.site', 'es.contentscale.site']) assert.equal(sees(d), true, d);
  for (const d of ['perfectroofingteam.com', 'evilcontentscale.site', 'contentscale.site.evil.com', '', null]) assert.equal(sees(d), false, String(d));
});

test('Pre-Write responses: no Gemini telemetry for a client; owner keeps it; share page never', { skip, timeout: 180000 }, async () => {
  const { prepare } = require('../scripts/prepare-canonical-production.cjs');
  const built = path.join(__dirname, '../src', '_usage_e2e_' + process.pid + '.js');
  fs.writeFileSync(built, prepare(SRC));
  const port = 19800 + (process.pid % 500), base = 'http://127.0.0.1:' + port;
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
    const usage = { calls: [{ label: 'full_brief', model: 'TEST-model', input_tokens: 123, prompt_chars: 4567 }], input_tokens: 123, cost_guard: { max_calls: 10 } };
    const brief = { keyword: 'TEST usage', what_we_checked: { query_tested: 'TEST', generation_usage: usage }, generation_usage: usage, meta_package: { seo_title: 'TEST' } };
    const make = async (domain) => {
      const token = 'TEST-usage-' + crypto.randomBytes(5).toString('hex');
      const cid = (await db.query('INSERT INTO tracker_clients(token,domain) VALUES ($1,$2) RETURNING id', [token, domain])).rows[0].id;
      const share = crypto.randomBytes(24).toString('hex');
      const bid = (await db.query('INSERT INTO prewrite_briefs(client_id,keyword,brief_json,share_token) VALUES ($1,$2,$3,$4) RETURNING id', [cid, 'TEST usage', brief, share])).rows[0].id;
      return { token, bid, share };
    };
    const client = await make('test-client.example'), owner = await make('es.contentscale.site');
    const get = t => fetch(base + '/api/tracker-client/' + t.token + '/prewrite-briefs/' + t.bid).then(async r => ({ status: r.status, text: await r.text() }));
    const c = await get(client), o = await get(owner);
    assert.equal(c.status, 200, c.text.slice(0, 300)); assert.equal(o.status, 200, o.text.slice(0, 300));
    assert.doesNotMatch(c.text, /generation_usage|TEST-model|prompt_chars/, 'nothing of the telemetry reaches a client browser');
    assert.match(JSON.parse(c.text).brief.keyword, /TEST usage/, 'the Brief itself is delivered');
    assert.match(o.text, /generation_usage/, 'the owner still sees it');
    assert.match(o.text, /TEST-model/);
    const sharePage = await fetch(base + '/share/prewrite/' + client.share).then(r => r.text());
    assert.doesNotMatch(sharePage, /Gemini calls|TEST-model|Input tokens/, 'a public share link shows no workload');
    const stored = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1', [client.bid])).rows[0].brief_json;
    assert.equal(stored.generation_usage.calls[0].model, 'TEST-model', 'the stored Brief is unchanged');
  } finally {
    app.kill(); try { await db.end(); } catch (e) {} fs.rmSync(built, { force: true });
  }
});
