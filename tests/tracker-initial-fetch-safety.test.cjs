'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patch}=require('../scripts/patch-tracker-initial-safe-fetch.cjs');
const {fetchInitialTrackerPage}=require('../src/tracker-safe-initial-fetch.cjs');
const src=fs.readFileSync(path.join(__dirname,'..','src','index.js'),'utf8');
test('legacy Tracker initial fetch is replaced only inside runTrackerCheck and build patch is idempotent',()=>{
 const built=patch(src);
 assert.equal(patch(built),built);
 const scan=built.slice(built.indexOf('async function runTrackerCheck('));
 assert.match(scan,/tracker-safe-initial-fetch\.cjs/);
 assert(!/fetch\(page\.url,\s*\{\s*redirect:\s*['"]follow['"]\s*\}\s*\)/.test(scan));
});
test('Tracker initial reader has safe closed behavior on public source errors',async()=>{
 await assert.rejects(()=>fetchInitialTrackerPage('http://127.0.0.1/'),/HTTPS|INVALID|URL|HOST/i);
 await assert.rejects(()=>fetchInitialTrackerPage('https://127.0.0.1/'),/IP|HOST|INVALID/i);
});
