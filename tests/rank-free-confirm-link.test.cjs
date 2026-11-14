'use strict';
// Owner 2026-11-14: "de email link was niet meer geldig" and the thank-you message after sign-up must be clearer.
// A confirmation link may already have been opened (by a mail scanner or by the owner of the address): opening it
// again must still lead to the dashboard. All addresses and sites are SYNTHETIC test input.
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
process.env.RANK_FREE_SECRET = 'test-secret-for-rank-free-links';
const { memoryStore } = require('../src/rank-free/store.cjs');
const { registerRankFree, rankFreeConfig } = require('../src/rank-free/routes.cjs');

function app(store, sent) {
  const a = express(); a.use(express.json());
  registerRankFree(a, null, { config: { ...rankFreeConfig({}), serperKey: '', scheduler: false, adminKey: 'admin-key-1234567890' }, store, sendEmail: async m => { sent.push(m); return true; } });
  return a;
}

test('the confirmation link keeps working after it was opened once (mail scanners open links first)', async () => {
  const store = memoryStore(), sent = [], a = app(store, sent);
  await request(a).post('/api/rank-free/signup').send({ email: 'o@acme.example', site: 'acme.example', country: 'us', language: 'en', keywords: 'roofer', lang: 'nl' });
  const link = /\/rank-tracker\/v\/([^"]+)"/.exec(sent[0].html)[1];
  const first = await request(a).get('/rank-tracker/v/' + link);
  assert.equal(first.status, 302); assert.match(first.headers.location, /^\/rank-tracker\/d\//);
  const second = await request(a).get('/rank-tracker/v/' + link);
  assert.equal(second.status, 302, 'opened again: still the dashboard, not "no longer valid"');
  assert.equal(second.headers.location, first.headers.location);
});

test('an unknown link explains what to do in the visitor\'s language, with the way to get a new link', async () => {
  const a = app(memoryStore(), []);
  const r = await request(a).get('/rank-tracker/v/nonsense?lang=nl');
  assert.equal(r.status, 404);
  assert.match(r.text, /Deze link werkt niet meer/);
  assert.match(r.text, /hetzelfde e-mailadres/);
  assert.match(r.text, /href="\/rank-tracker\?lang=nl"/);
});

test('the sign-up page has a clear "check your inbox" panel with the steps, spam tip and send-again', async () => {
  const a = app(memoryStore(), []);
  const r = await request(a).get('/rank-tracker?lang=nl');
  assert.match(r.text, /id="done"[^>]*hidden/);
  assert.match(r.text, /Bijna klaar: bevestig je e-mailadres/);
  assert.match(r.text, /spam/);
  assert.match(r.text, /id="again"/);
});
