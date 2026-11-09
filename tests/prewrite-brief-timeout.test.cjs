'use strict';
// Live 2026-11-09: "Gemini request timed out after 32s · attempts: 1". The full Brief gets 75s per attempt and a second
// attempt after a timeout, network error, 429 or 5xx (one cheap model, no upgrade).
const test = require('node:test'), assert = require('node:assert/strict');
const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
test('the full Pre-Write Brief call allows 75s and retries once after a timeout', () => {
  const a = src.indexOf('const _pwbGeminiTries='), block = src.slice(a, a + 3000);
  assert.ok(a > 0);
  assert.match(block, /Math\.max\(2,_pwbGeminiModelLadder\.length\)/);
  assert.match(block, /setTimeout\(\(\)=>ctrl2\.abort\(\),75000\)/);
  assert.doesNotMatch(block, /network failure:',_pwbGeminiError\); break;/, 'a timeout no longer stops after one attempt');
  assert.match(block, /if\(!\(r2\.status===429\|\|r2\.status>=500\)\)break;/, 'a 4xx answer still stops (retrying would not help)');
});
