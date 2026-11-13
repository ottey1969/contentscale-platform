'use strict';
const test = require('node:test'), assert = require('node:assert');
const s = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/index.js'), 'utf8');
test('the full Brief may use more than 16,384 output tokens (production 2026-11-13: 16,373 used, JSON cut off)', () => {
  assert.match(s, /const _PWB_BRIEF_MAX_OUTPUT=Math\.min\(65536,Math\.max\(16384,Number\(process\.env\.PREWRITE_BRIEF_MAX_OUTPUT_TOKENS\|\|32768\)\)\);/);
  const brief = s.match(/text:_langPrefix\(language\)\+finalPrompt\}\]\}\],generationConfig:\{temperature:0\.[24],maxOutputTokens:([A-Z_0-9]+),/g) || [];
  assert.equal(brief.length, 2, 'first generation and the parse retry');
  assert.ok(brief.every(x => x.includes('maxOutputTokens:_PWB_BRIEF_MAX_OUTPUT')));
});
test('the cost guard leaves room for one long Brief plus the evidence and completion calls', () => {
  assert.ok(s.includes('PREWRITE_GEMINI_MAX_BILLABLE_OUTPUT_TOKENS||45000'));
});
