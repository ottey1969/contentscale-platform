'use strict';
// Owner 2026-11-09: weak openings and team/editorial-process advice are repaired by AI automatically, sentence by sentence,
// without a writing round; a repair that fails the checks is not used.
const test = require('node:test'), assert = require('node:assert/strict');
const { styleProblems, fixStyleSentences, applyFixes } = require('../src/growth-style-fix.cjs');

const embeddings = 'Content teams frequently observe how search engines process queries using embeddings and vector search to match semantic intent rather than simple words.\n\nTo adapt to vector-based query processing, publishers can cover topics comprehensively using natural language and direct answer formats.';
const rag = 'To prepare your content, start by auditing each published section for factual accuracy. Have your editorial team review existing page files to ensure each heading addresses one specific user query. Confirm each statement before approving the text.\n\nFinally, record the publication date. Log all structural updates in a central audit file to track changes over time.';
const sections = [{ id: 't-1', h2: 'How Search Engines Process Queries Using Embeddings and Vector Search', text: embeddings }, { id: 't-2', h2: 'How to manage document candidate selection', text: rag }, { id: 't-3', h2: 'Fine', text: 'Embeddings turn a query into numbers that capture its meaning.' }];
const PAGE = 'I help website owners improve how their pages are found in Google and in AI search answers.';

test('the weak opening and both team sentences are found, nothing else', () => {
  const p = styleProblems(sections, PAGE);
  assert.deepEqual(p.map(x => [x.id, x.problem]), [['t-1', 'OPENING_FILLER'], ['t-2', 'TEAM_PROCESS_ADVICE'], ['t-2', 'TEAM_PROCESS_ADVICE']]);
});

test('AI replaces only those sentences; a replacement that fails a check is refused and the original stays', async () => {
  let prompt = '';
  const model = { call: async p => { prompt = p; return JSON.stringify({ fixes: [
    { n: 0, sentence: 'Embeddings turn a search query into numbers that capture its meaning, so a search can match pages by meaning instead of exact words.' },
    { n: 1, sentence: 'Read each heading of your page and check that it names one specific question a reader asks.' },
    { n: 2, sentence: 'Our software guarantees that every change is tracked by the team.' }] }); } };
  const out = await fixStyleSentences({ sections, pageText: PAGE, language: 'en', model });
  assert.match(prompt, /OPENING_FILLER/); assert.match(prompt, /one website owner/);
  assert.equal(out.status, 'FIXED'); assert.equal(out.fixes.length, 2); assert.equal(out.refused.length, 1, 'a product claim with "team" is refused');
  const t1 = applyFixes(embeddings, out.fixes.filter(f => f.id === 't-1'));
  assert.match(t1, /^Embeddings turn a search query/); assert.match(t1, /To adapt to vector-based query processing/);
  const t2 = applyFixes(rag, out.fixes.filter(f => f.id === 't-2'));
  assert.doesNotMatch(t2, /editorial team/); assert.match(t2, /central audit file/, 'the refused repair leaves the sentence for the editor');
});

test('no AI: nothing changes, the sentences are reported', async () => {
  const out = await fixStyleSentences({ sections, pageText: PAGE, model: null });
  assert.equal(out.status, 'AI_UNAVAILABLE'); assert.equal(out.fixes.length, 0); assert.equal(out.problems.length, 3);
  assert.equal((await fixStyleSentences({ sections: [sections[2]], pageText: PAGE, model: { call: async () => { throw Error('not called'); } } })).status, 'NOT_NEEDED');
});

test('flagged sentences (a claim the page does not support) are repaired too; "Readers often examine" is a weak opening', async () => {
  const text = 'Readers often examine the key difference between conventional page ranking and being cited in AI search responses. Traditional ranking refers to a page URL occupying a position on a results page.\n\nA webpage can rank without being cited. Monitoring both traditional positions and citation occurrences gives content managers a complete view of search visibility.';
  const flags = [{ sentence: 'Readers often examine the key difference between conventional page ranking and being cited in AI search responses.', reason: 'Claims how AI assistants or AI search treat the content.' },
    { sentence: 'Monitoring both traditional positions and citation occurrences gives content managers a complete view of search visibility.', reason: 'Contains the unqualified claim "a complete view".' }];
  const sec = [{ id: 'q1', h2: 'What is the Difference Between Ranking and Being Cited in AI Search?', text, flags }];
  const p = styleProblems(sec, PAGE);
  assert.deepEqual(p.map(x => x.problem), ['FLAGGED_CLAIM', 'FLAGGED_CLAIM'], 'one entry per sentence');
  const model = { call: async () => JSON.stringify({ fixes: [{ n: 0, sentence: 'Ranking and being cited are two different results of the same search.' }, { n: 1, sentence: '' }] }) };
  const out = await fixStyleSentences({ sections: sec, pageText: PAGE, model });
  assert.equal(out.fixes.length, 2, JSON.stringify(out.refused));
  const fixed = applyFixes(text, out.fixes);
  assert.match(fixed, /^Ranking and being cited are two different results/); assert.doesNotMatch(fixed, /complete view/); assert.match(fixed, /A webpage can rank without being cited\.$/);
  assert.equal(styleProblems([{ id: 'x', h2: 'h', text: 'Readers often examine how to compare two offers before they decide.' }], PAGE)[0].problem, 'OPENING_FILLER');
});
