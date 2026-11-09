'use strict';
// Canonical Architecture Migration, staging check for the Pre-Write Brief. Boots the full canonical server (the same
// build as the Docker image) on localhost with all outside network access denied, against a disposable PostgreSQL, and
// goes through the real HTTP routes:
//  1. the Tracker page loads the two research scripts with the content version, in the page that holds the Brief modal;
//  2. "Complete missing only" on a TEST diagnostic Brief (2 answers saved earlier, 3 added now) saves research with
//     all five answers, keeps the earlier language, market and automatic Perplexity label, and returns it;
//  3. reopening the saved Brief returns that same research, so the Research Prompt tab shows the prompt that was used.
// Gemini and Serper are answered by a local TEST stub (tests/prewrite-e2e-gemini-stub.cjs) that records the prompt the
// generator really sent; the Complete-missing-only TEST Brief passes the quality gate without any provider call.
//  4. a new Brief through the real generation route sends exactly the validated research to the generator;
//  5. reopening a Brief saved before this contract leaves its stored research and evidence unchanged. Runs only with
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
  // Gemini and Serper are answered by the TEST stub (tests/prewrite-e2e-gemini-stub.cjs); every other outside call is denied.
  const capture = path.join(require('node:os').tmpdir(), 'prewrite-e2e-gemini-' + process.pid + '.jsonl');
  fs.rmSync(capture, { force: true });
  const app = cp.spawn(process.execPath, ['--require', path.join(__dirname, 'staging-boot-no-egress.cjs'), '--require', path.join(__dirname, 'prewrite-e2e-gemini-stub.cjs'), built], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: DB, GEMINI_API_KEY: 'TEST-not-a-real-key', SERPAPI_KEY: 'TEST-not-a-real-key', PREWRITE_E2E_CAPTURE: capture, ENABLE_TRACKER_SCHEDULER: '0', ENABLE_BULK_WORKER: '0', NODE_ENV: 'test' } });
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
      // The Research Prompt pasted into the Gemini field (validation contract): refused, the saved valid answer is kept.
      manualAiEvidence: { google_aio: R.buildPrewriteResearchPrompt(prev), chatgpt: 'TEST chatgpt answer', claude: 'TEST claude answer', copilot: 'TEST copilot answer https://example.org/copilot' } }) });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out).slice(0, 600)); assert.equal(out.success, true);
    const saved = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1 AND client_id=$2', [out.brief_id, clientId])).rows[0].brief_json.prewrite_ai_answer_research;
    assert.equal(saved.systems_researched, 5); assert.equal(saved.language, 'Dutch'); assert.equal(saved.market, 'nl');
    assert.deepEqual(saved.observations.map(o => o.answer_source), ['manual', 'manual', 'automatic fallback', 'manual', 'manual']);
    assert.ok(saved.source_candidates.includes('https://example.org/prior') && saved.source_candidates.includes('https://example.org/copilot'));
    assert.deepEqual(out.brief.prewrite_ai_answer_research, saved, 'returned to the browser as saved');
    const g = saved.observations.find(o => o.engine === 'google');
    assert.equal(g.checked, true); assert.equal(g.answer_excerpt, 'TEST saved google answer', 'the echo did not replace the saved answer');
    const ev = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1', [out.brief_id])).rows[0].brief_json.ai_system_evidence;
    assert.equal(ev.google_aio.text, 'TEST saved google answer'); assert.doesNotMatch(JSON.stringify(ev), /This is NOT citation tracking/);
    assert.match(R.buildPrewriteResearchPrompt(saved), /AI answers researched: 5\/5/);

    // 3. Reopen.
    const reopened = await (await fetch(base + '/api/tracker-client/' + token + '/prewrite-briefs/' + out.brief_id)).json();
    const rb = reopened.brief || reopened.brief_json || (reopened.data && reopened.data.brief) || {};
    assert.deepEqual(rb.prewrite_ai_answer_research, saved, 'reopened Brief carries the saved research');
    assert.doesNotMatch(log, /research refresh after missing-only completion failed/);

    // 4. New Brief through the real generation route. Google: "No AI Overview shown"; Copilot: a placeholder (invalid);
    // ChatGPT: an answer in other words (synonyms, counted with a topic check). The prompt the generator really
    // received (captured by the stub) carries exactly this research; the invalid text is not in it as an answer.
    const token2 = 'TEST-prewrite-gen-' + crypto.randomBytes(4).toString('hex');
    await db.query("INSERT INTO tracker_clients(token,domain) VALUES ($1,'test-prewrite-gen.example')", [token2]);
    const gen = await fetch(base + '/api/tracker-client/' + token2 + '/prewrite-brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      keyword: 'seo content optimalisatie', language: 'Dutch', region: 'nl', manualAiEvidence: { google_source: 'no_ai_overview', google_aio: '',
        chatgpt: 'TEST: Webteksten verbeteren voor zoekmachines begint bij de vraag van de lezer.', claude: 'TEST: SEO content optimalisatie begint bij zoekintentie en volledigheid. Bron: https://example.com/ai-only-lead?utm_source=chatgpt.com', copilot: 'n/a' } }) });
    const gj = await gen.json();
    // The TEST stub cannot pass source verification (outside pages are denied), so the gate says NOT PASSED and nothing is saved.
    assert.equal(gj.stage, 'quality_gate', JSON.stringify(gj).slice(0, 400)); assert.equal(gj.saved, false);
    const gr = gj.brief.prewrite_ai_answer_research;
    assert.deepEqual([gr.answers_valid, gr.answers_captured, gr.answers_invalid, gr.systems_not_checked, gr.google_no_ai_overview], [2, 3, 1, 1, true]);
    assert.deepEqual(gj.brief.ai_system_evidence.google_aio, { checked: false, source: 'no_ai_overview', manual: true, text: '', google_source: 'no_ai_overview' });
    assert.equal(gj.brief.ai_system_evidence.copilot.checked, false, 'the placeholder is not stored as Copilot evidence');
    // URLs from pasted AI answers are leads only: out of the official sources, kept separately without tracking.
    assert.deepEqual(gj.brief.ai_source_leads.map(x => [x.url, x.system, x.status]), [['https://example.com/ai-only-lead', 'claude', 'not_verified']]);
    assert.doesNotMatch(JSON.stringify(gj.brief.evidence.official_sources), /ai-only-lead|utm_source/);
    // NOT PASSED on a normal Tracker keeps its diagnostic, and Complete missing only reuses it (no dead end).
    assert.match(String(gj.diagnostic_job_id || ''), /^[0-9a-f-]{36}$/);
    const diagRow = (await db.query('SELECT status, stage, error_json, request_json FROM prewrite_async_jobs WHERE id=$1', [gj.diagnostic_job_id])).rows[0];
    assert.equal(diagRow.stage, 'quality_gate'); assert.equal(diagRow.error_json.brief.prewrite_ai_answer_research.answers_valid, 2);
    assert.equal(diagRow.request_json.existingSiteHtml, undefined);
    const calls = fs.readFileSync(capture, 'utf8').trim().split('\n').length;
    const comp = await (await fetch(base + '/api/tracker-client/' + token2 + '/prewrite-brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      keyword: 'seo content optimalisatie', language: 'Dutch', region: 'nl', completionFromJobId: gj.diagnostic_job_id, manualAiEvidence: { google_source: 'no_ai_overview' } }) })).json();
    assert.equal(comp.completion_mode, 'missing_only', JSON.stringify(comp).slice(0, 300)); assert.equal(comp.research_reused, true); assert.equal(comp.research_rerun, false);
    assert.ok(fs.readFileSync(capture, 'utf8').trim().split('\n').length - calls <= 1, 'at most one targeted completion call; no new research');
    const sent = fs.readFileSync(capture, 'utf8').trim().split('\n').map(l => JSON.parse(JSON.parse(l).body).contents[0].parts[0].text);
    assert.ok(sent.length >= 1, 'the generator was called');
    const p0 = sent[0];
    assert.ok(p0.includes(R.buildPrewriteResearchPrompt(gr)), 'the generator received the saved research prompt verbatim');
    assert.match(p0, /AI answers researched: 2\/5 valid · captured 3 · invalid 1 · not checked 1 · Google: no AI Overview shown/);
    assert.match(p0, /SYSTEM: Google AI Overviews \/ Gemini — NO AI OVERVIEW SHOWN for this query/);
    assert.match(p0, /SYSTEM: Microsoft Copilot — INVALID \(placeholder\)/);
    assert.match(p0, /SYSTEM: ChatGPT Search \[manual paste · origin not verified\][^]*?Topic check: shares no word with the target query/);
    assert.match(p0, /Google AIO \/ Gemini \[NO AI OVERVIEW SHOWN \(checked; not an AI answer\)\]/);
    assert.match(p0, /Microsoft Copilot \[NOT CHECKED\]/);
    // A Google answer without its source is refused for this request, with the reason.
    const gen2 = await (await fetch(base + '/api/tracker-client/' + token2 + '/prewrite-brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      keyword: 'seo content optimalisatie', language: 'Dutch', region: 'nl', manualAiEvidence: { google_aio: 'TEST: SEO content optimalisatie volgens een Google-antwoord zonder bronkeuze.' } }) })).json();
    const gg = gen2.brief.prewrite_ai_answer_research.observations.find(o => o.engine === 'google');
    assert.equal(gg.validation_status, 'invalid'); assert.equal(gg.error_reason, 'source_not_chosen');
    assert.equal(gen2.brief.ai_system_evidence.google_aio.checked, false);

    // 5. An existing Brief saved before this contract (v2 research, no Google source) is not changed by reopening.
    const legacy = R.makePrewriteAiAnswerResearch({ query: 'TEST content scaling', language: 'English', market: 'us', answers: [{ engine: 'google_aio', answer: 'TEST legacy google answer about content scaling' }, { engine: 'chatgpt', answer: 'TEST legacy chatgpt answer about content scaling' }] });
    const legacyV2 = JSON.parse(JSON.stringify(legacy)); legacyV2.contract = 'prewrite_ai_answer_research_v2';
    legacyV2.observations.forEach(o => { for (const k of ['provenance', 'origin_verified', 'google_source', 'researched_system', 'validation_status', 'error_reason', 'error_message', 'warnings', 'topic_match', 'rejected_preview']) delete o[k]; });
    const legacyBrief = { ...brief, keyword: 'TEST content scaling', ai_system_evidence: { google_aio: { checked: true, text: 'TEST legacy google answer about content scaling' }, chatgpt: { checked: true, text: 'TEST legacy chatgpt answer about content scaling' } }, prewrite_ai_answer_research: legacyV2 };
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='prewrite_briefs'")).rows.map(r => r.column_name);
    const ins = await db.query('INSERT INTO prewrite_briefs(client_id,keyword,brief_json' + (cols.includes('status') ? ',status' : '') + ') VALUES ($1,$2,$3' + (cols.includes('status') ? ",'ready'" : '') + ') RETURNING id', [clientId, 'TEST content scaling', legacyBrief]);
    const before = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1', [ins.rows[0].id])).rows[0].brief_json;
    const re = await (await fetch(base + '/api/tracker-client/' + token + '/prewrite-briefs/' + ins.rows[0].id)).json();
    const after = (await db.query('SELECT brief_json FROM prewrite_briefs WHERE id=$1', [ins.rows[0].id])).rows[0].brief_json;
    assert.deepEqual(after.prewrite_ai_answer_research, before.prewrite_ai_answer_research, 'stored research unchanged');
    assert.deepEqual(after.ai_system_evidence, before.ai_system_evidence, 'stored evidence unchanged');
    const shownR = (re.brief || {}).prewrite_ai_answer_research;
    assert.equal(shownR.contract, 'prewrite_ai_answer_research_v2');
    assert.match(R.buildPrewriteResearchPrompt(shownR), /AI answers researched: 2\/5 valid/);
    assert.match(R.buildPrewriteResearchPrompt(shownR), /researched: Google AI Overview or Gemini \(source not recorded\) \[manual paste · origin not verified\]/);
    // 6. People Also Ask without answers (live 2026-11-09: NOT PASSED only for "paa_answers"): the answers are written from
    // the Brief with one small call before the gate decides, so paa_answers is no longer a reason for NOT PASSED.
    const token3 = 'TEST-prewrite-paa-' + crypto.randomBytes(4).toString('hex');
    await db.query("INSERT INTO tracker_clients(token,domain) VALUES ($1,'test-prewrite-paa.example')", [token3]);
    const before3 = fs.readFileSync(capture, 'utf8').trim().split('\n').length;
    const gp = await (await fetch(base + '/api/tracker-client/' + token3 + '/prewrite-brief', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyword: 'TEST paa topic', language: 'English', region: 'us', manualAiEvidence: { google_source: 'no_ai_overview' } }) })).json();
    const pq = (gp.brief && gp.brief.paa_questions) || [];
    assert.deepEqual(pq.map(x => x.q), ['TEST what is a paa question?', 'TEST how is it answered?'], JSON.stringify(gp).slice(0, 300));
    assert.match(pq[0].a, /^TEST answer from the Brief for/);
    assert.ok(!((gp.brief.ai_quality_check || {}).missing || []).includes('paa_answers'), 'paa_answers is filled');
    const sent3 = fs.readFileSync(capture, 'utf8').trim().split('\n').slice(before3).map(l => JSON.parse(JSON.parse(l).body).contents[0].parts[0].text);
    assert.equal(sent3.filter(t => /Answer each People Also Ask question/.test(t)).length, 1, 'one small call for the answers');
  } finally {
    app.kill(); try { await db.end(); } catch (e) {} fs.rmSync(built, { force: true }); fs.rmSync(capture, { force: true });
  }
});
