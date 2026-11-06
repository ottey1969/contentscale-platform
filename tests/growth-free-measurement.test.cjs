'use strict';
// Free Growth: publication date, one e-mail about four weeks later, unsubscribe, and the before/after comparison.
// All addresses, pages and numbers are TEST input.
const test = require('node:test'), assert = require('node:assert/strict');
const r = require('../src/growth-free/reminders.cjs');
const NOW = new Date('2026-11-06T10:00:00Z');

test('the publication date: a real day, not in the future, not more than a year ago', () => {
  assert.equal(r.readPublishedOn('2026-10-01', NOW).value, '2026-10-01');
  assert.match(r.readPublishedOn('2026-11-07', NOW).error, /not a future date/);
  assert.match(r.readPublishedOn('2026-02-30', NOW).error, /does not exist/);
  assert.match(r.readPublishedOn('2025-01-01', NOW).error, /more than a year/);
  assert.match(r.readPublishedOn('1-10-2026', NOW).error, /YYYY-MM-DD/);
  // Same date rule as the Tracker: sent when Search Console has the full 4 weeks after publication.
  assert.equal(r.dueAt('2026-10-01').toISOString(), '2026-11-02T08:00:00.000Z');
  assert.deepEqual(r.windowsOf('2026-10-01'), { before: { start: '2026-09-03', end: '2026-09-30' }, after: { start: '2026-10-02', end: '2026-10-29' } });
});

test('the e-mail is plain, in the language of the page, with both periods, the result link and a stop link', () => {
  const args = { url: 'https://acme-roofing.example/roof-repair/', query: 'roof repair lodi nj', publishedOn: '2026-10-01', resultLink: 'https://app.example/free-growth/r/x?k=y', stopLink: 'https://app.example/free-growth/stop/TESTTOKEN0123456789' };
  const en = r.reminderMessage({ ...args, lang: 'en' });
  assert.match(en.subject, /Four weeks after your update/);
  assert.match(en.html, /3 September 2026 – 30 September 2026[^]*2 October 2026 – 29 October 2026/);
  assert.match(en.html, /“Exact URL” → <strong>https:\/\/acme-roofing\.example\/roof-repair\/<\/strong>/);
  assert.match(en.html, /href="https:\/\/app\.example\/free-growth\/r\/x\?k=y"/); assert.match(en.html, /Stop this reminder/);
  assert.match(en.html, /not proof that the update caused it/); assert.doesNotMatch(en.html, /impressions|CTR/i, 'plain words, no jargon');
  const nl = r.reminderMessage({ ...args, lang: 'nl' });
  assert.match(nl.subject, /Vier weken na je aanpassing/); assert.match(nl.html, /3 september 2026 – 30 september 2026/); assert.match(nl.html, /Stop deze herinnering/);
  assert.match(r.confirmationMessage({ url: args.url, publishedOn: '2026-10-01', stopLink: args.stopLink, lang: 'nl' }).html, /Op 2 november 2026 krijg je één e-mail/);
});

test('before/after: only page-verified exports, each on its own side of the date; a missing period is named', () => {
  const up = (start, end, impressions, status = 'VERIFIED_FOR_PAGE') => ({ status, period_start: start, period_end: end, totals: { clicks: 3, impressions, position: 12 }, queries: [{ query: 'roof repair lodi nj', clicks: 1, impressions: 50, position: 11 }], file_name: 'x.zip' });
  const one = r.compareUploads([up('2026-09-03', '2026-09-30', 300)], '2026-10-01', 'roof repair lodi nj');
  assert.deepEqual(one.missing, ['after']); assert.equal(one.before.matches_window, true); assert.equal(one.before.search_term_row.impressions, 50);
  const both = r.compareUploads([up('2026-09-03', '2026-09-30', 300), up('2026-10-02', '2026-10-29', 420, 'NOT_VERIFIED_FOR_PAGE'), up('2026-10-02', '2026-10-29', 410)], '2026-10-01', 'roof repair lodi nj');
  assert.equal(both.ready, true); assert.equal(both.after.totals.impressions, 410, 'the not verified export is not used');
  assert.equal(r.compareUploads([up('2026-09-20', '2026-10-10', 300)], '2026-10-01', '').ready, false, 'a period across the date counts for neither side');
  assert.equal(r.compareUploads([], null, ''), null);
});

test('due reminders are sent once to the address of the check; a failed send is retried, at most three times', async () => {
  const rows = [{ id: 1, email: 'test-owner@acme-roofing.example', url: 'https://acme-roofing.example/', query: 'TEST', market: { language: 'nl' }, published_on: '2026-10-01', reminder_token: 'TESTTOKEN0123456789' }];
  const marked = [], sent = [];
  const storage = { dueReminders: async () => rows, markReminder: async (p, x) => marked.push(x) };
  const out = await r.sendDueFreeReminders(null, storage, { now: NOW, model: null, send: async m => { sent.push(m); return true; },
    links: { result: () => 'https://app.example/free-growth/r/a?k=b', stop: t => 'https://app.example/free-growth/stop/' + t } });
  assert.deepEqual(out, { sent: 1, failed: 0 }); assert.deepEqual(sent[0].to, ['test-owner@acme-roofing.example']);
  assert.match(sent[0].subject, /Vier weken/); assert.match(sent[0].html, /free-growth\/stop\/TESTTOKEN0123456789/);
  assert.deepEqual(marked, [{ id: 1, sent: true }]);
  const fail = await r.sendDueFreeReminders(null, storage, { now: NOW, model: null, send: async () => false, links: { result: () => 'x', stop: () => 'y' } });
  assert.deepEqual(fail, { sent: 0, failed: 1 });
  // Another language without a model: the English e-mail (never an unchecked translation).
  const de = await r.sendDueFreeReminders(null, { ...storage, dueReminders: async () => [{ ...rows[0], market: { language: 'de' } }] }, { now: NOW, model: null, send: async m => { sent.push(m); return true; }, links: { result: () => 'x', stop: () => 'y' } });
  assert.equal(de.sent, 1); assert.match(sent[sent.length - 1].subject, /Four weeks/);
});
