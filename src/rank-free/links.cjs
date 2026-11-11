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
module.exports = { newNonce, linkToken, readToken, configured: () => !!secret() };
