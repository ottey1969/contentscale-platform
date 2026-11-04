'use strict';
// Canonical Architecture Migration, staging check for the Pre-Write Brief. Boots the full canonical server (the same
// build as the Docker image) on localhost with all outside network access denied, against a disposable PostgreSQL, and
// goes through the real HTTP routes:
//  1. the Tracker page loads the two research scripts with the content version, in the page that holds the Brief modal;
//  2. "Complete missing only" on a TEST diagnostic Brief (2 answers saved earlier, 3 added now) saves research with
//     all five answers, keeps the earlier language, market and automatic Perplexity label, and returns it;
//  3. reopening the saved Brief returns that same research, so the Research Prompt tab shows the prompt that was used.
// No Gemini or Serper call is made: the TEST Brief passes the quality gate without one. Runs only with
// PREWRITE_E2E_DATABASE_URL pointing at a local database; every row it writes is labelled TEST.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const DB = process.env.PREWRITE_E2E_DATABASE_URL || '';
const local = /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
let pg = null; try { pg = require('pg'); } catch (e) {}
const skip = !local ? 'set PREWRITE_E2E_DATABASE_URL to a local, disposable PostgreSQL' : !pg && 'pg not installed';

test('Pre-Write research through the real server routes', { skip, timeout: 180000 }, async () => {
  const R = require('../src/prewrite-ai-answer-research.cjs'), M = require('../src/prewrite-brief-research.cjs');
  const { prepare } = require('../scripts/prepare-canonical-production.cjs');
  const built = path.join(__dirname, '../src', '_prewrite_e2e_' + process.pid + '.js');
  fs.writeFileSync(built, prepare(fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8')));
  const port = 18800 + (process.pid % 500), base = 'http://127.0.0.1:' + port;
  let log = '';
  const app = cp.spawn(process.execPath, ['--require', path.join(__dirname, 'staging-boot-no-egress.cjs'), built], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: DB, GEMINI_API_KEY: 'TEST-not-a-real-key', ENABLE_TRACKER_SCHEDULER: '0', ENABLE_BULK_WORKER: '0', NODE_ENV: 'test' } });
  app.stdout.on('data', d => { log += d; }); app.stderr.on('data', d => { log += d; });
  const db = new pg.Client({ connectionString: DB });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { await new Promise(r => setTimeout(r, 1000)); up = /All tables ready/.test(log) && await fetch(base + '/').then(() => true, () => false); }
    assert.ok(up, 'server started: ' + log.slice(-1500));
    await db.connect();
    const token = 'TEST-prewrite-e2e-' + crypto.randomBytes(4).toString('hex');
    const clientId = (await db.query("INSERT INTO tracker_clients(token,domain) VALUES ($1,'test-prewrite-e2e.example') RETURNING id", [token])).rows[0].id;

    // 1. Tracker page.
    const page = await (await fetch(base + '/track/' + token)).text();
    const v = M.scriptVersion();
    const tags = page.match(/<script defer src="\/prewrite-(?:ai-answer-research|research-tab)\.js\?v=[0-9a-f]{12}"><\/script>/g) || [];
    assert.deepEqual(tags, ['<script defer src="/prewrite-ai-answer-research.js?v=' + v + '"></script>', '<script defer src="/prewrite-research-tab.js?v=' + v + '"></script>']);
    assert.ok(page.indexOf(tags[1]) < page.indexOf('id="prewriteBriefModal"') && page.includes('AI Answer Research — Write for Citation Potential'));
    for (const f of ['prewrite-ai-answer-research.js', 'prewrite-research-tab.js'])
      assert.equal(await (await fetch(base + '/' + f + '?v=' + v)).text(), fs.readFileSync(path.join(__dirname, '../public', f), 'utf8'), f + ' served');

    // 2. Complete missing only.
    const h2s = ['TEST What it means', 'TEST How it works', 'TEST Costs', 'TEST Risks', 'TEST Next steps'];
    const prev = R.makePrewriteAiAnswerResearch({ query: 'TEST content scaling', language: 'Dutch', market: 'nl', answers: [
      { engine: 'google_aio', answer: 'TEST saved google answer' }, { engine: 'perplexity', answer: 'TEST automatic perplexity answer https://example.org/prior', source: 'automatic fallback' }] });
    const brief = { keyword: 'TEST content scaling', meta_package: { seo_title: 'TEST title', meta_description: 'TEST description' }, opening_passage: { direct_answer: 'TEST direct answer' },
      definitive_outline: h2s.map(h => ({ h2: h, purpose: 'TEST purpose', cover: ['TEST'] })), recommended_structure: { must_have_h2s: h2s },
      ai_answer: { direct_answer: 'TEST', key_takeaways: ['TEST a', 'TEST b', 'TEST c'] }, quick_facts: [1, 2, 3].map(i => ({ label: 'TEST ' + i, value: 'TEST value' })),
      entity_strategy: { primary: ['TEST e1', 'TEST e2'], relationships: [{ subject: 'TEST s', relation: 'TEST r', object: 'TEST o' }, { subject: 'TEST s2', relation: 'TEST r2', object: 'TEST o2' }] },
      evidence: { trust_signals: ['TEST t1', 'TEST t2'], experience_to_include: 'TEST x', official_sources: ['https://example.org/a', 'https://example.org/b'] },
      evidence_research: { completed: true, statistics: { searched: true }, expert_quotes: { searched: true }, quality_ladder: { completed: true } },
      link_research: { internal: { searched: true, status: 'searched' }, external: { searched: true, status: 'searched' } }, balance: { limitations: ['TEST limitation'] },
      use_cases: [1, 2].map(i => ({ audience: 'TEST audience ' + i, scenario: 'TEST scenario', benefit: 'TEST benefit' })), conclusion: { recap: 'TEST recap', recommendation: 'TEST recommendation' },
      people_also_ask: [], action_plan: [1, 2, 3].map(i => ({ action: 'TEST action ' + i })),
      ai_system_evidence: { google_aio: { text: 'TEST saved google answer', checked: true }, perplexity: { text: 'TEST automatic perplexity answer https://example.org/prior', checked: true } },
      prewrite_ai_answer_research: prev };
    await db.query("CREATE TABLE IF NOT EXISTS prewrite_async_jobs (id UUID PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES tracker_clients(id) ON DELETE CASCADE, network_placement_id BIGINT, status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'queued', request_json JSONB NOT NULL DEFAULT '{}'::jsonb, result_json JSONB, error_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)");
    const jobId = crypto.randomUUID();
    await db.query("INSERT INTO prewrite_async_jobs(id,client_id,status,stage,request_json,error_json) VALUES ($1,$2,'failed','quality_gate',$3,$4)", [jobId, clientId, { keyword: 'TEST content scaling', language: 'English', region: 'us' }, { brief }]);
    const res = await fetch(base + '/api/tracker-client/' + token + '/prewrite-brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      keyword: 'TEST content scaling', language: 'English', region: 'us', completionFromJobId: jobId,
      manualAiEvidence: { chatgpt: 'TEST chatgpt answer', claude: 'TEST claude answer', copilot: 'TEST copilot answer https://example.org/copilot' } }) });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out).slice(0, 600)); assert.equal(out.success, true);
    const saved = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1 AND client_id=$2', [out.brief_id, clientId])).rows[0].brief_json.prewrite_ai_answer_research;
    assert.equal(saved.systems_researched, 5); assert.equal(saved.language, 'Dutch'); assert.equal(saved.market, 'nl');
    assert.deepEqual(saved.observations.map(o => o.answer_source), ['manual', 'manual', 'automatic fallback', 'manual', 'manual']);
    assert.ok(saved.source_candidates.includes('https://example.org/prior') && saved.source_candidates.includes('https://example.org/copilot'));
    assert.deepEqual(out.brief.prewrite_ai_answer_research, saved, 'returned to the browser as saved');
    assert.match(R.buildPrewriteResearchPrompt(saved), /AI answers researched: 5\/5/);

    // 3. Reopen.
    const reopened = await (await fetch(base + '/api/tracker-client/' + token + '/prewrite-briefs/' + out.brief_id)).json();
    const rb = reopened.brief || reopened.brief_json || (reopened.data && reopened.data.brief) || {};
    assert.deepEqual(rb.prewrite_ai_answer_research, saved, 'reopened Brief carries the saved research');
    assert.doesNotMatch(log, /research refresh after missing-only completion failed/);
  } finally {
    app.kill(); try { await db.end(); } catch (e) {} fs.rmSync(built, { force: true });
  }
});
