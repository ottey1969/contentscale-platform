'use strict';
const test = require('node:test'), assert = require('node:assert');
const { closeTruncatedJson, parseBriefJson } = require('../src/prewrite-json-repair.cjs');
const brief = { keyword: 'chatgpt recomiende mi empresa', meta_package: { h1: '¿Cómo hacer que ChatGPT recomiende tu empresa?', url_slug: '/chatgpt-recomiende-mi-empresa' },
  page_blueprint: [{ h2: 'Uno', cover: ['a "citado" b', 'c'] }, { h2: 'Dos', cover: ['d'] }], faq_questions: ['¿Qué es GEO?', '¿Cuánto tarda?'] };
const full = JSON.stringify(brief);

test('a cut-off Brief keeps every complete field and drops only the half-written value', () => {
  for (let cut = 60; cut < full.length; cut += 7) {
    const r = parseBriefJson(full.slice(0, cut), null);
    assert.ok(r.obj, 'cut ' + cut);
    assert.equal(r.obj.keyword, brief.keyword);
    for (const [k, v] of Object.entries(r.obj)) if (k !== 'page_blueprint' && k !== 'faq_questions' && k !== 'meta_package') assert.deepEqual(v, brief[k]);
  }
});
test('a complete answer is parsed as is; nothing invented', () => {
  const r = parseBriefJson('```json\n' + full + '\n```', null);
  assert.equal(r.how, 'as_is'); assert.deepEqual(r.obj, brief);
});
test('the light repair still runs first (raw newline in a string)', () => {
  const bad = full.replace('"Dos"', '"D\nos"');
  const light = s => s.replace(/\n/g, '\\n');
  const r = parseBriefJson(bad, light);
  assert.equal(r.how, 'light_repair'); assert.equal(r.obj.page_blueprint[1].h2, 'D\nos');
});
test('escaped quotes and braces inside strings do not confuse the closing', () => {
  const t = JSON.stringify({ a: 'x { y [ "z"', b: [1, 2] }).slice(0, -4);
  const c = closeTruncatedJson(t); assert.deepEqual(JSON.parse(c), { a: 'x { y [ "z"' }); // the cut-off value (could be 1 or 12) is dropped, not guessed
});
test('nothing usable gives null, never a fake object', () => {
  assert.equal(parseBriefJson('Lo siento, no puedo', null).obj, null);
  assert.equal(parseBriefJson('{"keyword": "ab', null).obj, null);
});
test('index.js uses the recovery and reports the finish reason', () => {
  const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(s.includes("_pwbJsonRepair.parseBriefJson(rawText,_repairJsonG)"));
  assert.ok(s.includes("'full_brief_parse_retry'"));
  assert.ok(s.includes('the answer was cut off at the length limit'));
});
