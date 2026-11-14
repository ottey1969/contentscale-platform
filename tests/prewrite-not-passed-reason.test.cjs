'use strict';
// Owner 2026-11-14: "Complete missing only" appeared while Publication QA showed no blocker, and after clicking it the Brief
// came back with a VERIFY FIRST blocker. NOT PASSED now names what is missing (as a blocker line and on the button), and the
// missing-only completion may not bring back amounts without a verified source.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const nc = require('../src/prewrite-numeric-claims.cjs');

test('the missing parts get readable names, on the button and as a blocker line', () => {
  const a = SRC.indexOf('var _PWB_MISSING_NAMES='), b = SRC.indexOf('\n', SRC.indexOf('function _pwbMissingLabel(qc)'));
  const label = new Function(SRC.slice(a, b) + ';return _pwbMissingLabel;')();
  assert.equal(label({ missing: ['ai_answer', 'opening_passage', 'paa_answers'] }), 'AI answer, opening passage, People Also Ask answers');
  assert.equal(label({}), '');
  assert.match(SRC, /complete\.textContent='Complete missing'\+\(_pwbMissingLabel\(qc\)\?': '\+_pwbMissingLabel\(qc\):' only'\)\+' · reuse research'/);
  assert.match(SRC, /if\(_pwbCurrentNotPassed&&hasBrief&&!stale\)blockers=\[\{code:'not_passed',message:'NOT PASSED — missing in this Brief: '/);
  assert.ok(SRC.indexOf("blockers=[{code:'not_passed'") < SRC.indexOf("var quality='<div style=\"margin-top:4px;color:#cbd5e1;\">'"), 'counted in the blocker number');
});

test('missing-only completion: only verified amounts, and what is left without a source is removed again', () => {
  assert.match(SRC, /Money amounts and percentages: use ONLY these verified amounts/);
  const at = SRC.indexOf("}else completionError=String(rr&&rr.errorMessage");
  assert.ok(SRC.indexOf('_nc.removeUnverified(brief,_left)', at) > at && SRC.indexOf('_nc.removeUnverified(brief,_left)', at) < at + 900);
  // What the completion of the EN brief wrote (13 Nov) next to a verified First Page Sage fact.
  const brief = { price_facts: [{ number: '6850', amount: '$6,850', evidence_text: 'The median GEO and AEO retainer is $6,850 per month' }],
    ai_answer: { direct_answer: 'Pricing varies by model. The median retainer is $6,850 per month. Hourly rates range from $50 to $450.',
      key_takeaways: ['Hourly rates ($50-$450) vary.', 'Retainers scale with scope.', 'The median retainer is $6,850 per month.'] } };
  nc.removeUnverified(brief, nc.unverifiedNumbers(brief));
  assert.equal(brief.ai_answer.direct_answer, 'Pricing varies by model. The median retainer is $6,850 per month.');
  assert.deepEqual(brief.ai_answer.key_takeaways, ['Retainers scale with scope.', 'The median retainer is $6,850 per month.']);
  assert.deepEqual(nc.unverifiedNumbers(brief), [], 'no VERIFY FIRST blocker left');
});
