'use strict';
const test = require('node:test'), assert = require('node:assert');
const { registerPrewriteDiagnosticLookup } = require('../src/prewrite-diagnostic-lookup.cjs');
function harness(rows) {
  const routes = {}, app = { get: (p, h) => { routes[p] = h; } }, seen = [];
  const pool = { query: async (sql, params) => { seen.push({ sql, params }); return { rows }; } };
  registerPrewriteDiagnosticLookup(app, pool);
  const call = q => new Promise(resolve => { const res = { set() { return res; }, status() { return res; }, json: resolve };
    routes['/api/tracker-client/:token/prewrite-diagnostic-latest']({ params: { token: 'tok' }, query: q }, res); });
  return { call, seen };
}
const rows = [
  { id: 'job-net', network_placement_id: 7, keyword: 'chatgpt recomiende mi empresa', completed_at: '2026-11-13T07:00:00Z' },
  { id: 'job-new', network_placement_id: null, keyword: 'ChatGPT  recomiende mi empresa', completed_at: '2026-11-13T06:00:00Z' },
  { id: 'job-old', network_placement_id: null, keyword: 'chatgpt recomiende mi empresa', completed_at: '2026-11-12T06:00:00Z' },
  { id: 'job-other', network_placement_id: null, keyword: 'consultor geo', completed_at: '2026-11-13T07:30:00Z' }];

test('after a reload the newest diagnostic for the same keyword is found again (owner 2026-11-13)', async () => {
  const h = harness(rows);
  const d = await h.call({ keyword: 'chatgpt recomiende mi empresa' });
  assert.equal(d.job_id, 'job-new');
  assert.equal(h.seen[0].params[0], 'tok');
  assert.match(h.seen[0].sql, /status='failed'/); assert.match(h.seen[0].sql, /error_json \? 'brief'/);
  assert.match(h.seen[0].sql, /7 days/);
});
test('a Network placement only gets its own diagnostic', async () => {
  assert.equal((await harness(rows).call({ keyword: 'chatgpt recomiende mi empresa', networkPlacement: '7' })).job_id, 'job-net');
  assert.equal((await harness(rows).call({ keyword: 'chatgpt recomiende mi empresa', networkPlacement: ['7', '7'] })).job_id, 'job-net');
  assert.equal((await harness(rows).call({ keyword: 'consultor geo', networkPlacement: '7' })).job_id, null);
});
test('another keyword or an empty keyword finds nothing', async () => {
  assert.equal((await harness(rows).call({ keyword: 'geo consultant amsterdam' })).job_id, null);
  assert.equal((await harness(rows).call({ keyword: '' })).job_id, null);
});
test('a database error never breaks the page', async () => {
  const routes = {}, app = { get: (p, h) => { routes[p] = h; } };
  registerPrewriteDiagnosticLookup(app, { query: async () => { throw new Error('down'); } });
  const d = await new Promise(r => { const res = { set() { return res; }, status() { return res; }, json: r }; routes['/api/tracker-client/:token/prewrite-diagnostic-latest']({ params: { token: 't' }, query: { keyword: 'a b' } }, res); });
  assert.equal(d.success, false); assert.equal(d.job_id, null);
});
test('the Tracker page asks the server when the tab lost the job id', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(s.includes("if(!diag&&hasBrief&&_pwbCurrentNotPassed)_pwbLookupSavedDiagnostic(_pwbActionKeyword());"));
  assert.ok(s.includes("api('/prewrite-diagnostic-latest?keyword='+encodeURIComponent(kw),'GET')"));
  assert.ok(s.includes("registerPrewriteDiagnosticLookup(app,pool"));
});
