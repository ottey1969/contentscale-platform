'use strict';
// Owner case: the free AI Citations Tracker form on nl.contentscale.site and
// es.contentscale.site posts to app.contentscale.site. Without these origins in
// the CORS allowlist the browser blocks the response and the visitor only sees
// "Could not connect".
const assert = require('assert');
const { isAllowedOrigin } = require('../src/cors-origins.cjs');

const cases = [
  ['https://contentscale.site', true],
  ['https://www.contentscale.site', true],
  ['https://app.contentscale.site', true],
  ['https://nl.contentscale.site', true],
  ['https://es.contentscale.site', true],
  ['http://nl.contentscale.site', false],
  ['https://nl.contentscale.site.evil.com', false],
  ['https://evilcontentscale.site', false],
  ['https://xx.contentscale.site', false],
  ['', false],
  [undefined, false],
];
for (const [origin, expected] of cases) {
  assert.strictEqual(isAllowedOrigin(origin), expected, 'origin ' + origin);
}

// The live middleware must use the shared list, not a private copy.
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
assert.ok(/require\(['"]\.\/cors-origins\.cjs['"]\)/.test(src), 'src/index.js uses src/cors-origins.cjs');
assert.ok(/isAllowedOrigin\(origin\)/.test(src), 'CORS middleware calls isAllowedOrigin(origin)');
console.log('cors-language-subdomains: ' + cases.length + ' origins OK');
