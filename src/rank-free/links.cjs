'use strict';
// Dashboard links: a random nonce (stored) plus an HMAC of it with the server secret (not stored). The link keeps working
// for the life of the account; a database copy alone cannot produce a working link.
const crypto = require('node:crypto');
const secret = () => process.env.RANK_FREE_SECRET || process.env.GROWTH_FREE_ADMIN_KEY || '';
const mac = (s, nonce) => crypto.createHmac('sha256', s).update('rank-free:' + nonce).digest('base64url').slice(0, 24);
function newNonce() { return crypto.randomBytes(18).toString('base64url'); }
function linkToken(nonce, s = secret()) { return s && nonce ? nonce + '.' + mac(s, nonce) : null; }
function readToken(token, s = secret()) {
  const m = /^([A-Za-z0-9_-]{16,40})\.([A-Za-z0-9_-]{24})$/.exec(String(token || ''));
  if (!m || !s) return null;
  const a = Buffer.from(mac(s, m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}
// Handoff to the free Growth check for one keyword: the account's dashboard nonce and the keyword, signed. It only opens
// what the dashboard link already opens (the owner's e-mail address to fill in, and this keyword's follow-up).
const hmac = (s, v) => crypto.createHmac('sha256', s).update('rank-free-handoff:' + v).digest('base64url').slice(0, 24);
function handoffToken(nonce, keyword, s = secret()) {
  if (!s || !nonce || !keyword) return null;
  const body = Buffer.from(nonce + '|' + keyword, 'utf8').toString('base64url');
  return body + '.' + hmac(s, body);
}
function readHandoff(token, s = secret()) {
  const m = /^([A-Za-z0-9_-]{20,400})\.([A-Za-z0-9_-]{24})$/.exec(String(token || ''));
  if (!m || !s) return null;
  const a = Buffer.from(hmac(s, m[1])), b = Buffer.from(m[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [nonce, ...rest] = Buffer.from(m[1], 'base64url').toString('utf8').split('|');
  return nonce && rest.length ? { nonce, keyword: rest.join('|') } : null;
}
module.exports = { newNonce, linkToken, readToken, handoffToken, readHandoff, configured: () => !!secret() };
