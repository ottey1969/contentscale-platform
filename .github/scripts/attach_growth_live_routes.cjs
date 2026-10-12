'use strict';
// One-time, deterministic SOURCE INTEGRATION. Does not run at runtime.
// Edits only src/index.js and inserts after the existing admin/GSC helpers.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const file='src/index.js';
const source=fs.readFileSync(file,'utf8');
const marker='// GROWTH_V2_CANONICAL_TRACKER_ROUTE_REGISTRATION_20261012';
if(source.includes(marker)){console.log('Growth canonical route already wired');process.exit(0);}
assert(source.includes('const verifyEngineAccess = async'), 'Existing engine access guard missing');
assert(source.includes('async function _gscFetchVerifiedPageQueries('), 'Existing exact-page GSC writer missing');
const target='// ── WordPress Publish ────────────────────────────────────────';
assert.equal(source.split(target).length,2,'Legacy publish anchor must be unique');
const insertion=[
 marker,
 '// Registration isolated so Growth cannot prevent the legacy app starting.',
 'try {',
 "  require('./growth-live-routes.cjs').registerGrowthLiveRoutes({",
 '    app, pool, verifyEngineAccess, fetchExactGsc: _gscFetchVerifiedPageQueries',
 '  });',
 '} catch (growthRouteError) {',
 "  console.error('[Growth] Admin readiness routes unavailable:', growthRouteError.message);",
 '}',
 '',
 ''
].join('\n');
const updated=source.replace(target,insertion+target);
assert(updated.includes(marker));
assert.equal(updated.length-source.length,insertion.length);
fs.writeFileSync(file,updated,'utf8');
console.log('Canonical Growth readiness + exact-page GSC routes wired to src/index.js');
