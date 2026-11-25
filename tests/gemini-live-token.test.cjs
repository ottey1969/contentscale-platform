'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createLiveTokenHandler } = require('../src/gemini-live-token.cjs');

function appWith(fetchToken, env = { GEMINI_KEY_LIVE: 'synthetic-server-key' }) {
 const app = express();
 app.get('/token', createLiveTokenHandler({ fetchToken, env }));
 return request(app);
}

test('Gemini Live exchanges the server credential for a single-use browser token', async () => {
 let calls = 0;
 const app = appWith(async (url, options) => {
  calls++;
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens');
  assert.equal(options.headers['x-goog-api-key'], 'synthetic-server-key');
  const payload = JSON.parse(options.body);
  assert.equal(payload.uses, 1);
  assert.ok(Date.parse(payload.newSessionExpireTime) < Date.parse(payload.expireTime));
  return { ok: true, json: async () => ({ name: 'auth_tokens/synthetic-session' }) };
 });
 for (let i = 0; i < 2; i++) {
  const response = await app.get('/token').expect(200).expect('Cache-Control', 'no-store');
  const ws = new URL(response.body.wsUrl);
  assert.match(ws.pathname, /BidiGenerateContentConstrained$/);
  assert.equal(ws.searchParams.get('access_token'), 'auth_tokens/synthetic-session');
  assert.equal(ws.searchParams.has('key'), false);
  assert.doesNotMatch(response.text, /synthetic-server-key/);
 }
 await app.get('/token').expect(429);
 assert.equal(calls, 2);
});

test('Gemini Live fails closed on missing configuration, quota, invalid response and timeout', async () => {
 const notCalled = async () => { throw Error('unexpected provider call'); };
 await appWith(notCalled, { GEMINI_API_KEY: 'unrelated-credential' }).get('/token').expect(503);
 await appWith(async () => ({ ok: false, status: 429 })).get('/token').expect(429);
 for (const response of [
  async () => ({ ok: true, json: async () => ({ name: 'unexpected-format' }) }),
  async () => { throw Error('provider message contains private details'); }
 ]) {
  const result = await appWith(response).get('/token').expect(502);
  assert.doesNotMatch(result.text, /private details|synthetic-server-key/);
 }
});
