'use strict';
// Non-invasive structural regression checks against the canonical running entry.
// This never starts the server, touches customer records, sends mail, or scans.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
const checks = [
  ['Canonical utility-page filter', 'function _ceoUtilityPage('],
  ['Audit20 utility-page filter', 'function _audit20LooksUtility('],
  ['Audit20 link discovery', 'function _audit20ExtractLinks('],
  ['CEO report creation route', "app.post('/api/ceo-report/start'"],
  ['Audit20 interest route', "app.post('/api/prospect-quick-scan/:token/audit20-interest'"],
  ['QuickScan Tracker interest route', "app.post('/api/prospect-quick-scan/:token/tracker-interest'"],
  ['Audit20 report-ready route', "app.post('/api/prospect-quick-scan/admin/:token/audit20-ready'"]
];
for (const [name, marker] of checks) {
  assert.ok(source.includes(marker), name + ' missing: ' + marker);
  console.log('PASS', name);
}
assert.ok(source.includes('audit20_interested_at'), 'explicit audit interest timestamp missing');
assert.ok(source.includes('scan_completed_at'), 'QuickScan completion state missing');
assert.ok(source.includes('disclaimer'), 'utility-page filtering must reject disclaimer URLs');
assert.ok(source.includes('privacy-policy'), 'utility-page filtering must reject privacy URLs');
console.log('PASS canonical funnel structural contract');
// Note: this is NOT a writable end-to-end runtime test; requires isolated staging.
